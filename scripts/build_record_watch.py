#!/usr/bin/env python3
"""
Build public/record-watch-data.json for the Record Watch map.

One dot per long daily record. Each roster station (public/station-roster.js)
takes the ThreadEx thread the Streak Tracker would use for it (same id within
25 mi, else the nearest thread within 25 mi, else the station's own ACIS
record). A thread shared by several roster stations is drawn once, at the
station whose id matches it (else the nearest).

For each of the last WINDOW days the builder finds every value that ranks in
the top 3 of the station's own history:

  single-day   highest/lowest high, highest/lowest low, precipitation,
               snowfall, snow depth — ranked for the calendar date, for the
               month (against each other year's monthly extreme) and all-time
               (against each other year's annual extreme)
  totals       month, meteorological season and calendar year to date for
               precipitation (wettest/driest), mean temperature (warmest/
               coldest) and snowfall (+ snow season) — ranked against the same
               dates in other years once half the period has passed; wet and
               snow totals are also ranked against other years' complete
               periods at any time
  streaks      the eight daily Streak Tracker presets, ranked against every
               streak of the same kind on record

Ranking follows the Climate Record Explorer: competition ranks (1,1,3); a
period counts only if it has at most round(days/31) missing days; the station
needs at least MIN_YEARS other years. A value is flagged when no more than two
other years (or streaks) are at least as extreme, so a tie shared by many
years never counts.

Modes
  --mode full   period-of-record fetch for every record (monthly, or when no
                cache/data file exists)
  --mode daily  refreshes the last REFETCH_DAYS days of each cached record
  --selftest    checks the ranking and streak code against brute force on
                synthetic records
The data file is only written when validation passes.
"""
import argparse, concurrent.futures as cf, datetime as dt, gzip, json, math, os, random, re, struct, sys, time
import urllib.request
from bisect import bisect_left

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'public', 'station-roster.js')
THREADS = os.path.join(ROOT, 'public', 'threadex-roster.js')
OUT = os.path.join(ROOT, 'public', 'record-watch-data.json')
CACHE = os.environ.get('RW_CACHE', os.path.join(ROOT, '.rw-cache'))
ACIS = 'https://data.rcc-acis.org/StnData'
ELEMS = [{'name': 'maxt'}, {'name': 'mint'}, {'name': 'pcpn'}, {'name': 'snow'}, {'name': 'snwd'},
         {'name': 'avgt', 'normal': '1'}]
THREAD_MAX_MI = 25
WINDOW = 30
MIN_YEARS = 30
MIN_STREAKS = 30
TOP = 3
REFETCH_DAYS = 60
MIN_STATIONS = 280
FLOOR = {'pcp': 0.10, 'snow': 0.5, 'snwd': 1.0}          # single-day minimums for wet/snow values
TOT_FLOOR = {'pcp': 0.01, 'snow': 1.0}                   # to-date minimum for wettest/snowiest
TODAY = lambda: dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date()


# ── float32 (the Streak Tracker compares Float32Array values) ───────────
def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]
F32_TRACE = f32(0.001)


# ── value parsing ──────────────────────────────────────────────────────
def p_strict(s):
    """Single-day values and streaks (Streak Tracker): T = trace, M/S/accumulated = missing."""
    if s is None:
        return None
    s = str(s).strip()
    if s == 'T':
        return 'T'
    if not s or s in ('M', 'S') or s.endswith('A'):
        return None
    try:
        return float(s)
    except ValueError:
        return None

def p_total(s):
    """Totals (Climate Record Explorer): T = 0, accumulated amounts count, M/S = missing."""
    if s is None:
        return None
    s = str(s).strip()
    if s == 'T':
        return 0.0
    m = re.match(r'\s*([+-]?\d*\.?\d+)', s)
    return float(m.group(1)) if m else None


# ── rosters and record assignment ──────────────────────────────────────
def haversine(a, b, c, d):
    r = math.radians
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))

def read_rosters():
    txt = open(ROSTER, encoding='utf-8').read()
    pat = re.compile(r'\[\s*"([A-Z0-9]{3,5})"\s*,\s*"([^"]*)"\s*,\s*"([A-Z]{0,2})"\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*"([A-Z]{2})"\s*\]')
    roster = [dict(id=m[0], name=m[1], st=m[2], lat=float(m[3]), lon=float(m[4])) for m in pat.findall(txt)]
    t = open(THREADS, encoding='utf-8').read()
    threads = [dict(pre=m[0], name=m[1], st=m[2], lat=float(m[3]), lon=float(m[4]), y0=int(m[5]))
               for m in re.findall(r'\["([A-Z0-9]+)","([^"]*)","([A-Z]{2})",(-?[\d.]+),(-?[\d.]+),(\d+)\]', t)]
    if len(roster) < 300 or len(threads) < 400:
        sys.exit(f'Roster parse found {len(roster)} stations / {len(threads)} threads')
    return roster, threads

def assign_records(roster, threads):
    """Streak Tracker's threadFor(), then one dot per thread."""
    out = []
    for s in roster:
        pre = s['id'][1:] if re.match(r'^[KPT][A-Z0-9]{3}$', s['id']) else s['id']
        best = None
        for t in threads:
            d = haversine(s['lat'], s['lon'], t['lat'], t['lon'])
            if d > THREAD_MAX_MI:
                continue
            score = (-1000 if t['pre'] == pre else 0) + d
            if best is None or score < best[0]:
                best = (score, t, d, t['pre'] == pre)
        if best:
            out.append(dict(s, sid=best[1]['pre'] + 'thr', thread=True, tname=best[1]['name'], tst=best[1]['st'],
                            dist=round(best[2], 1), own=best[3]))
        else:
            out.append(dict(s, sid=s['id'], thread=False, tname=None, tst=None, dist=0.0, own=True))
    by_sid = {}
    for s in out:
        by_sid.setdefault(s['sid'], []).append(s)
    keep = []
    for sid, ss in by_sid.items():
        ss.sort(key=lambda s: (not s['own'], s['dist']))
        keep.append(ss[0])
    order = {s['id']: i for i, s in enumerate(roster)}
    keep.sort(key=lambda s: order[s['id']])
    return keep


# ── fetch + cache ──────────────────────────────────────────────────────
def acis(sid, sdate, edate, tries=5):
    body = json.dumps({'sid': sid, 'sdate': sdate, 'edate': edate, 'elems': ELEMS}).encode()
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(ACIS, data=body, headers={'Content-Type': 'application/json',
                                                                     'User-Agent': 'contextclimate-record-watch'})
            with urllib.request.urlopen(req, timeout=180) as r:
                j = json.loads(r.read())
            if 'error' in j:
                raise RuntimeError(j['error'])
            return j.get('data') or []
        except Exception as e:                       # noqa: BLE001 — retried, then reported
            last = e
            time.sleep(5 * (k + 1))
    raise RuntimeError(f'{sid}: {last}')

def cache_path(sid):
    return os.path.join(CACHE, sid + '.json.gz')

def load_cached(sid):
    p = cache_path(sid)
    if not os.path.exists(p):
        return None
    try:
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            return json.load(f)
    except Exception:                                  # noqa: BLE001 — a bad cache file is refetched
        return None

def save_cached(sid, rows):
    os.makedirs(CACHE, exist_ok=True)
    tmp = cache_path(sid) + '.tmp'
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        json.dump({'rows': rows}, f, separators=(',', ':'))
    os.replace(tmp, cache_path(sid))

def get_rows(sid, mode, today):
    """Full record rows for sid (list of [date, maxt, mint, pcpn, snow, snwd, navg])."""
    c = load_cached(sid) if mode == 'daily' else None
    if c and c.get('rows'):
        rows = c['rows']
        last = dt.date.fromisoformat(rows[-1][0])
        start = min(last, today) - dt.timedelta(days=REFETCH_DAYS)
        new = acis(sid, start.isoformat(), today.isoformat())
        keep = [r for r in rows if r[0] < start.isoformat()]
        rows = keep + new
    else:
        rows = acis(sid, 'por', today.isoformat())
    if rows:
        save_cached(sid, rows)
    return rows


# ── a station's record as day-indexed arrays ───────────────────────────
class Rec:
    def __init__(self, rows):
        o0 = dt.date.fromisoformat(rows[0][0]).toordinal()
        n = dt.date.fromisoformat(rows[-1][0]).toordinal() - o0 + 1
        self.o0, self.n = o0, n
        mk = lambda: [None] * n
        self.hi, self.lo, self.pcp, self.sn, self.sd, self.nrm = mk(), mk(), mk(), mk(), mk(), mk()
        self.tpcp, self.tsn = mk(), mk()                       # totals parsing
        for r in rows:
            i = dt.date.fromisoformat(r[0]).toordinal() - o0
            if not 0 <= i < n:
                continue
            hi, lo = p_strict(r[1]), p_strict(r[2])
            self.hi[i] = hi if isinstance(hi, float) else None
            self.lo[i] = lo if isinstance(lo, float) else None
            self.pcp[i], self.sn[i], self.sd[i] = p_strict(r[3]), p_strict(r[4]), p_strict(r[5])
            nv = p_strict(r[6]) if len(r) > 6 else None
            self.nrm[i] = nv if isinstance(nv, float) else None
            self.tpcp[i], self.tsn[i] = p_total(r[3]), p_total(r[4])
        self.date = [dt.date.fromordinal(o0 + i) for i in range(n)]
        # prefix sums for totals: value sums and missing counts
        def pref(vals):
            s, m = [0.0] * (n + 1), [0] * (n + 1)
            for i, v in enumerate(vals):
                s[i + 1] = s[i] + (v if v is not None else 0.0)
                m[i + 1] = m[i] + (v is None)
            return s, m
        self.P = {'pcp': pref(self.tpcp), 'snow': pref(self.tsn)}
        mean = [(h + l) / 2 if h is not None and l is not None else None for h, l in zip(self.hi, self.lo)]
        self.P['mean'] = pref(mean)
        self.mean = mean

    def idx(self, d):
        return d.toordinal() - self.o0


def num(v):
    """Single-day numeric value (trace → 0) or None."""
    if v is None:
        return None
    return 0.0 if v == 'T' else v


# ── ranking helpers ────────────────────────────────────────────────────
def rank_info(v, others, desc):
    """(rank, n, best other value, latest year of it, #years sharing it, #others at least as extreme)."""
    better = sum(1 for _, x in others if (x > v if desc else x < v))
    atleast = sum(1 for _, x in others if (x >= v if desc else x <= v))
    if not others:
        return None
    best = max(x for _, x in others) if desc else min(x for _, x in others)
    yrs = [y for y, x in others if x == best]
    return dict(r=1 + better, n=len(others), prev=best, prevY=max(yrs), ties=len(yrs), atleast=atleast)

def qualifies(info, n_min=MIN_YEARS):
    return info is not None and info['n'] >= n_min and info['atleast'] <= TOP - 1

def mlen(y, m):
    return [31, 29 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]

def tol_for(L):
    return int(math.floor(L / 31 + 0.5))


SPIKE_F = 30

def suspect_temp(R, A, i):
    """Preliminary reports can be partial or garbled: a temperature counts only when the day
    has both a high and a low with high >= low, and it is not a lone spike more than SPIKE_F
    away from both neighbouring days in the same direction."""
    h, l = R.hi[i], R.lo[i]
    if h is None or l is None or h < l:
        return True
    a = A[i - 1] if i > 0 else None
    b = A[i + 1] if i + 1 < R.n else None
    if a is not None and b is not None:
        if (A[i] - a > SPIKE_F and A[i] - b > SPIKE_F) or (a - A[i] > SPIKE_F and b - A[i] > SPIKE_F):
            return True
    return False

# single-day variables: key → (array name, desc, family)
SINGLE = {
    'hi_hi': ('hi', True), 'hi_lo': ('hi', False), 'lo_hi': ('lo', True), 'lo_lo': ('lo', False),
    'pcp': ('pcp', True), 'snow': ('sn', True), 'snwd': ('sd', True),
}
FLOOR_KEY = {'pcp': 'pcp', 'snow': 'snow', 'snwd': 'snwd'}

def single_day_flags(R, win):
    """win: list of (k, day-index) for the window. Returns flags."""
    flags = []
    for key, (arr, desc) in SINGLE.items():
        A = [num(v) for v in getattr(R, arr)]
        # calendar-date lists, month and year extremes for other years
        by_md, mon, yr = {}, {}, {}
        for i, v in enumerate(A):
            d = R.date[i]
            mk_ = (d.year, d.month)
            m = mon.setdefault(mk_, [None, 0, 0])            # extreme, valid, missing
            y = yr.setdefault(d.year, [None, 0, 0])
            if v is None:
                m[2] += 1; y[2] += 1
                continue
            by_md.setdefault((d.month, d.day), []).append((d.year, v))
            for e in (m, y):
                e[1] += 1
                if e[0] is None or (v > e[0] if desc else v < e[0]):
                    e[0] = v
        last_d = R.date[-1]
        for k, i in win:
            if i < 0 or i >= R.n:
                continue
            v = A[i]
            if v is None:
                continue
            if key in FLOOR_KEY and v < FLOOR[FLOOR_KEY[key]]:
                continue
            if arr in ('hi', 'lo') and suspect_temp(R, A, i):
                continue
            d = R.date[i]
            s = {}
            others = [(y, x) for y, x in by_md.get((d.month, d.day), []) if y != d.year]
            s['date'] = rank_info(v, others, desc)
            # month: v must be this year's extreme for the month so far
            j0 = R.idx(dt.date(d.year, d.month, 1))
            so_far = [A[j] for j in range(max(j0, 0), i + 1) if A[j] is not None]
            if all((v >= x if desc else v <= x) for x in so_far):
                oth = []
                for y in range(R.date[0].year, d.year):
                    e = mon.get((y, d.month))
                    if not e or e[0] is None:
                        continue
                    full = mlen(y, d.month)
                    if (y, d.month) == (R.date[0].year, R.date[0].month) and R.date[0].day > 1:
                        continue                                  # partial first month
                    if e[2] + (full - e[1] - e[2]) <= tol_for(full):
                        oth.append((y, e[0]))
                s['mon'] = rank_info(v, oth, desc)
            y0 = R.idx(dt.date(d.year, 1, 1))
            ytd = [A[j] for j in range(max(y0, 0), i + 1) if A[j] is not None]
            if all((v >= x if desc else v <= x) for x in ytd):
                oth = []
                for y in range(R.date[0].year, d.year):
                    e = yr.get(y)
                    if not e or e[0] is None:
                        continue
                    if y == R.date[0].year and (R.date[0].month, R.date[0].day) != (1, 1):
                        continue
                    L = 366 if mlen(y, 2) == 29 else 365
                    if e[2] + (L - e[1] - e[2]) <= tol_for(L):
                        oth.append((y, e[0]))
                s['all'] = rank_info(v, oth, desc)
            if any(qualifies(x) for x in s.values()):
                flags.append(dict(d=k, k=key, v=v, s={sc: pack(x) for sc, x in s.items() if x}))
    return flags

def pack(x):
    return [x['r'], x['n'], x['prev'], x['prevY'], x['ties'], x['atleast']]


# ── totals to date ─────────────────────────────────────────────────────
def period_start(d, per):
    if per == 'mon':
        return dt.date(d.year, d.month, 1)
    if per == 'yr':
        return dt.date(d.year, 1, 1)
    if per == 'sea':
        sm = 12 if d.month in (12, 1, 2) else 3 if d.month < 6 else 6 if d.month < 9 else 9
        return dt.date(d.year - (1 if d.month < 3 and sm == 12 else 0), sm, 1)
    if per == 'snow':
        return dt.date(d.year if d.month >= 7 else d.year - 1, 7, 1)
    raise ValueError(per)

def period_end(start, per):
    if per == 'mon':
        return dt.date(start.year, start.month, mlen(start.year, start.month))
    if per == 'yr':
        return dt.date(start.year, 12, 31)
    if per == 'sea':
        em = (start.month + 2 - 1) % 12 + 1
        ey = start.year + (1 if em < start.month else 0)
        return dt.date(ey, em, mlen(ey, em))
    if per == 'snow':
        return dt.date(start.year + 1, 6, 30)
    raise ValueError(per)

def span_stat(R, var, a, b):
    """Total (pcp/snow) or mean (mean temp) over dates a..b; None if beyond tolerance or outside the record."""
    ia, ib = R.idx(a), R.idx(b)
    L = ib - ia + 1
    if ia < 0 or ib >= R.n:
        return None
    s, m = R.P[var]
    miss = m[ib + 1] - m[ia]
    if miss > tol_for(L):
        return None
    tot = s[ib + 1] - s[ia]
    if var == 'mean':
        nv = L - miss
        return round(tot / nv, 4) if nv else None
    return round(tot, 4)                      # prefix sums drift in the last bits; ties must stay ties

def shift_year(d, dy):
    y = d.year + dy
    return dt.date(y, d.month, min(d.day, mlen(y, d.month)))

TOTALS = [   # (var, direction, periods)
    ('pcp', 'wet', ('mon', 'sea', 'yr')), ('pcp', 'dry', ('mon', 'sea', 'yr')),
    ('mean', 'warm', ('mon', 'sea', 'yr')), ('mean', 'cold', ('mon', 'sea', 'yr')),
    ('snow', 'snowy', ('mon', 'sea', 'snow')),
]

def totals_flags(R, win):
    flags = []
    y_first = R.date[0].year
    for var, dirn, pers in TOTALS:
        desc = dirn in ('wet', 'warm', 'snowy')
        for k, i in win:
            if i < 0 or i >= R.n:
                continue
            d = R.date[i]
            for per in pers:
                a = period_start(d, per)
                v = span_stat(R, var, a, d)
                if v is None:
                    continue
                if desc and var in TOT_FLOOR and v < TOT_FLOOR[var]:
                    continue
                end = period_end(a, per)
                plen = (end - a).days + 1
                elapsed = (d - a).days + 1
                td = fu = None
                if 2 * elapsed >= plen:
                    oth = []
                    for y in range(y_first, a.year + 1):
                        dy = y - a.year
                        if dy == 0:
                            continue
                        x = span_stat(R, var, shift_year(a, dy), shift_year(d, dy))
                        if x is not None:
                            oth.append((shift_year(d, dy).year, x))
                    td = rank_info(v, oth, desc)
                if dirn in ('wet', 'snowy') and d < end:
                    oth = []
                    for y in range(y_first, a.year):
                        dy = y - a.year
                        x = span_stat(R, var, shift_year(a, dy), shift_year(end, dy))
                        if x is not None:
                            oth.append((shift_year(end, dy).year, x))
                    fu = rank_info(v, oth, desc)
                q_td, q_fu = qualifies(td), qualifies(fu)
                if q_td or q_fu:
                    flags.append(dict(d=k, k='tot', var=var, dir=dirn, per=per, v=round(v, 3), a=a.isoformat(),
                                      td=pack(td) if td else None, fu=pack(fu) if fu else None))
    return flags


# ── streaks (Streak Tracker semantics) ─────────────────────────────────
STREAKS = {   # preset id → (series, test)
    'p-dry':    ('pcp',    lambda v: v <= f32(0)),
    'p-wet':    ('pcp',    lambda v: v >= f32(0.01)),
    'n-above':  ('depart', lambda v: v >= f32(0.1)),
    'n-below':  ('depart', lambda v: v <= f32(-0.1)),
    't-hot90':  ('hi',     lambda v: v >= f32(90)),
    't-frz32':  ('lo',     lambda v: v <= f32(32)),
    't-ice32':  ('hi',     lambda v: v <= f32(32)),
    'p-cover1': ('sd',     lambda v: v >= f32(1)),
}

def streak_series(R, name):
    """Float32 values as the Streak Tracker holds them; trace = 0.001 then compared as 0."""
    out = []
    if name == 'depart':
        for h, l, nv in zip(R.hi, R.lo, R.nrm):
            out.append(f32((h + l) / 2 - f32(nv)) if h is not None and l is not None and nv is not None else None)
        return out
    for v in getattr(R, name):
        if v is None:
            out.append(None)
        elif v == 'T':
            out.append(F32_TRACE)
        else:
            out.append(f32(v))
    return out

def streak_state(vals, test):
    """1 qualifies, 0 does not, None missing. Trace (0.001) compares as 0, as in the tracker."""
    st = []
    for v in vals:
        if v is None:
            st.append(None)
        else:
            st.append(1 if test(0.0 if v == F32_TRACE else v) else 0)
    return st

def streak_flags(R, win):
    flags = []
    i_end = max(i for _, i in win)
    for sid, (name, test) in STREAKS.items():
        vals = streak_series(R, name)
        nvalid = sum(1 for v in vals if v is not None)
        if name == 'sd' and nvalid < 5 * 365:
            continue
        if name == 'depart' and nvalid == 0:
            continue
        st = streak_state(vals, test)
        first = next((i for i, v in enumerate(st) if v is not None), None)
        if first is None:
            continue
        # streaks completed (ended) before each index; runs from `first`
        runs = []          # (start, end_exclusive)
        cs = -1
        for i in range(first, i_end + 1):
            if st[i] == 1:
                if cs < 0:
                    cs = i
            elif cs >= 0:
                runs.append((cs, i)); cs = -1
        if cs >= 0:
            runs.append((cs, i_end + 1))
        w0 = min(i for _, i in win)
        early = sorted(e - s for s, e in runs if e <= w0)          # complete before the window
        late = [(s, e) for s, e in runs if e > w0]
        for k, i in win:
            if i < 0 or i >= R.n or st[i] != 1:
                continue
            run = next(((s, e) for s, e in late if s <= i < e), None)
            if run is None:
                continue
            L = i - run[0] + 1
            prior = list(early) + [e - s for s, e in late if e <= run[0]]
            # runs that started before the window and are still going at i are the current run itself
            n_prior = len(prior)
            if n_prior + 1 < MIN_STREAKS or (i - first + 1) < MIN_YEARS * 365:
                continue
            ge = n_prior - bisect_left(sorted(prior), L)
            gt = n_prior - bisect_left(sorted(prior), L + 1)
            if ge > TOP - 1:
                continue
            rec = max(prior) if prior else 0
            # end year of the latest prior streak of the record length
            rec_end = None
            for s, e in runs:
                if e <= run[0] and e - s == rec:
                    rec_end = R.date[e - 1].year
            flags.append(dict(d=k, k='stk', t=sid, L=L, start=R.date[run[0]].isoformat(), r=1 + gt, n=n_prior + 1,
                              rec=rec, recY=rec_end, atleast=ge))
    return flags


# ── build ──────────────────────────────────────────────────────────────
def recent_days(rows, today):
    """Dates in the last 21 days with a reported high."""
    lo = (today - dt.timedelta(days=21)).isoformat()
    return {r[0] for r in rows[-40:] if r[0] >= lo and isinstance(p_strict(r[1]), float)}

def pick_end(recent, today):
    """Latest day reported by at least 80% of the records active in the past week."""
    if not any(recent.values()):
        return None
    week = {(today - dt.timedelta(days=b)).isoformat() for b in range(1, 8)}
    active = sum(1 for s in recent.values() if s & week)
    for back in range(1, 21):
        d = (today - dt.timedelta(days=back)).isoformat()
        if sum(1 for s in recent.values() if d in s) >= 0.8 * active:
            return dt.date.fromisoformat(d)
    return dt.date.fromisoformat(max(max(s) for s in recent.values() if s))

def record_years(R):
    ys = {}
    for d, h in zip(R.date, R.hi):
        if h is not None:
            ys[d.year] = ys.get(d.year, 0) + 1
    full = [y for y, c in ys.items() if c >= 300]
    return (min(ys) if ys else None), len(full)

def window_vals(R, win):
    def enc(v, dec):
        if v is None:
            return None
        if v == 'T':
            return -1
        return round(v, dec)
    out = {'hi': [], 'lo': [], 'pcp': [], 'sn': [], 'sd': []}
    for _, i in win:
        ok = 0 <= i < R.n
        out['hi'].append(enc(R.hi[i], 0) if ok else None)
        out['lo'].append(enc(R.lo[i], 0) if ok else None)
        out['pcp'].append(enc(R.pcp[i], 2) if ok else None)
        out['sn'].append(enc(R.sn[i], 1) if ok else None)
        out['sd'].append(enc(R.sd[i], 0) if ok else None)
    for k in out:
        out[k] = [int(v) if isinstance(v, float) and v.is_integer() and k in ('hi', 'lo', 'sd') else v for v in out[k]]
    return out

def analyse(R, end):
    win = [(k, R.idx(end - dt.timedelta(days=WINDOW - 1 - k))) for k in range(WINDOW)]
    return single_day_flags(R, win) + totals_flags(R, win) + streak_flags(R, win), win

# ── quality control of the window's highs and lows ──────────────────
# Preliminary daily values can be garbled (Burbank, Nov 18 2026: high 130°, low 18°).
# A value is held back — treated as missing everywhere, ranks, totals and streaks — when
#   * it departs from the station's own 30-day median more than QC_SPATIAL_F differently from
#     the median departure of at least 3 reporting records within QC_NEIGHBOR_MI, or
#   * it beats the record's own all-time extreme by more than QC_RECORD_F (Portland's 2021 jump was 9°F), or
#   * the day's high minus low exceeds QC_RANGE_F (both values).
# Measured on Oct 20–Nov 18 2026: of 17,210 station-days with neighbours only Burbank's two values
# were more than 25°F out of line; the largest genuine ones were 23.5°F (Great Falls behind an arctic
# front) and 21.8°F (Duluth off the lake).
QC_NEIGHBOR_MI = 150
QC_MIN_NEIGHBORS = 3
QC_SPATIAL_F = 25
QC_RECORD_F = 12
QC_RANGE_F = 75

def window_temps(args):
    """Worker, pass 1: the window's highs and lows and the record's extremes before the window."""
    s, end_iso = args
    c = load_cached(s['sid'])
    if not c or not c.get('rows'):
        return None
    end = dt.date.fromisoformat(end_iso)
    start_iso = (end - dt.timedelta(days=WINDOW - 1)).isoformat()
    hi, lo = [None] * WINDOW, [None] * WINDOW
    phi = plo = None
    for r in c['rows']:
        h, l = p_strict(r[1]), p_strict(r[2])
        h = h if isinstance(h, float) else None
        l = l if isinstance(l, float) else None
        if r[0] < start_iso:
            if h is not None and (phi is None or h > phi):
                phi = h
            if l is not None and (plo is None or l < plo):
                plo = l
        elif r[0] <= end_iso:
            k = (dt.date.fromisoformat(r[0]) - end).days + WINDOW - 1
            hi[k], lo[k] = h, l
    return dict(sid=s['sid'], lat=s['lat'], lon=s['lon'], hi=hi, lo=lo, phi=phi, plo=plo)

def qc_suspects(temps):
    """temps: list of window_temps() results. Returns {sid: [[k, 'hi'|'lo', value, reason], ...]}."""
    out = {}
    def add(t, k, el, why):
        lst = out.setdefault(t['sid'], [])
        if not any(x[0] == k and x[1] == el for x in lst):
            lst.append([k, el, t[el][k], why])
    for t in temps:
        for k in range(WINDOW):
            h, l = t['hi'][k], t['lo'][k]
            if h is not None and l is not None and h - l > QC_RANGE_F:
                add(t, k, 'hi', 'range'); add(t, k, 'lo', 'range')
            if h is not None and t['phi'] is not None and h > t['phi'] + QC_RECORD_F:
                add(t, k, 'hi', 'record')
            if l is not None and t['plo'] is not None and l < t['plo'] - QC_RECORD_F:
                add(t, k, 'lo', 'record')
    nb = [[j for j, u in enumerate(temps) if j != i and haversine(t['lat'], t['lon'], u['lat'], u['lon']) <= QC_NEIGHBOR_MI]
          for i, t in enumerate(temps)]
    def median(v):
        v = sorted(v); n = len(v)
        return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2
    for el in ('hi', 'lo'):
        dep = []
        for t in temps:
            v = [x for x in t[el] if x is not None]
            m = median(v) if len(v) >= 10 else None
            dep.append([None if x is None or m is None else x - m for x in t[el]])
        for i, t in enumerate(temps):
            for k in range(WINDOW):
                if dep[i][k] is None:
                    continue
                around = [dep[j][k] for j in nb[i] if dep[j][k] is not None]
                if len(around) >= QC_MIN_NEIGHBORS and abs(dep[i][k] - median(around)) > QC_SPATIAL_F:
                    add(t, k, el, 'neighbours')
    return out

def analyse_station(args):
    """Worker: one record from the cache → the station's entry (or None)."""
    s, end_iso, sus = args
    c = load_cached(s['sid'])
    if not c or not c.get('rows'):
        return None
    rows = c['rows']
    if sus:
        end = dt.date.fromisoformat(end_iso)
        drop = {}
        for k, el, _, _ in sus:
            drop.setdefault((end - dt.timedelta(days=WINDOW - 1 - k)).isoformat(), set()).add(el)
        rows = [([r[0], 'M' if 'hi' in drop[r[0]] else r[1], 'M' if 'lo' in drop[r[0]] else r[2]] + list(r[3:]))
                if r[0] in drop else r for r in rows]
    R = Rec(rows)
    end = dt.date.fromisoformat(end_iso)
    y0, ny = record_years(R)
    if y0 is None:
        return None
    if ny >= MIN_YEARS:
        flags, win = analyse(R, end)
    else:
        flags, win = [], [(k, R.idx(end - dt.timedelta(days=WINDOW - 1 - k))) for k in range(WINDOW)]
    return dict(id=s['id'], name=s['name'], st=s['st'], lat=s['lat'], lon=s['lon'],
                sid=s['sid'], thread=s['thread'], tname=s['tname'], tst=s['tst'], dist=s['dist'],
                y0=y0, ny=ny, vals=window_vals(R, win), flags=flags,
                **({'qc': [[k, el, v, why] for k, el, v, why in sus]} if sus else {}))

def build(mode, workers):
    roster, threads = read_rosters()
    recs_meta = assign_records(roster, threads)
    today = TODAY()
    recent, failed = {}, []
    def job(s):
        rows = get_rows(s['sid'], mode, today)
        return s['sid'], recent_days(rows, today) if rows else None
    t0 = time.time()
    with cf.ThreadPoolExecutor(workers) as ex:
        for fut in cf.as_completed([ex.submit(job, s) for s in recs_meta]):
            try:
                sid, rd = fut.result()
                if rd is not None:
                    recent[sid] = rd
            except Exception as e:                    # noqa: BLE001
                failed.append(str(e))
    print(f'Fetched {len(recent)} of {len(recs_meta)} records ({len(failed)} failed) in {time.time() - t0:.0f}s')
    for f in failed[:30]:
        print('  failed:', f)
    end = pick_end(recent, today)
    if end is None:
        sys.exit('No recent data at all — not writing.')
    t0 = time.time()
    todo = [(s, end.isoformat()) for s in recs_meta if s['sid'] in recent]
    with cf.ProcessPoolExecutor(max(1, os.cpu_count() or 1)) as ex:
        temps = [r for r in ex.map(window_temps, todo, chunksize=8) if r]
    sus = qc_suspects(temps)
    for sid, lst in sorted(sus.items()):
        for k, el, v, why in lst:
            print(f'  held back: {sid} {(end - dt.timedelta(days=WINDOW - 1 - k)).isoformat()} {el} {v:g} ({why})')
    todo = [(s, e, sus.get(s['sid'])) for s, e in todo]
    with cf.ProcessPoolExecutor(max(1, os.cpu_count() or 1)) as ex:
        out = [r for r in ex.map(analyse_station, todo, chunksize=4) if r]
    print(f'Analysed {len(out)} records in {time.time() - t0:.0f}s')
    return dict(end=end.isoformat(), start=(end - dt.timedelta(days=WINDOW - 1)).isoformat(), days=WINDOW,
                top=TOP, minYears=MIN_YEARS, stations=out)

def validate(data):
    st = data['stations']
    if len(st) < MIN_STATIONS:
        sys.exit(f'Only {len(st)} records — not writing.')
    rep = sum(1 for s in st if s['vals']['hi'][-1] is not None)
    if rep < 0.75 * len(st):
        sys.exit(f'Only {rep} of {len(st)} report on {data["end"]} — not writing.')
    for s in st:
        for k, a in s['vals'].items():
            if len(a) != WINDOW:
                sys.exit(f"{s['id']}: {k} length {len(a)}")
        for f in s['flags']:
            if not 0 <= f['d'] < WINDOW:
                sys.exit(f"{s['id']}: bad flag day {f}")
    nf = sum(len(s['flags']) for s in st)
    last = sum(1 for s in st if any(f['d'] == WINDOW - 1 for f in s['flags']))
    print(f"OK: {len(st)} records, {data['start']} → {data['end']}, {nf} flags, {last} records flagged on the last day, {rep} reporting")


# ── self-test: brute force on synthetic records ────────────────────────
def synth_rows(seed, years=60, end=dt.date(2026, 11, 18)):
    rnd = random.Random(seed)
    d0 = dt.date(end.year - years, 3, 1)
    rows, d = [], d0
    while d <= end:
        doy = d.timetuple().tm_yday
        base = 55 - 22 * math.cos(2 * math.pi * (doy - 20) / 365.25) + rnd.gauss(0, 9)
        hi, lo = round(base + 9), round(base - 9)
        r = rnd.random()
        pc = 'T' if r < 0.08 else ('0.00' if r < 0.70 else f'{rnd.expovariate(3):.2f}')
        if rnd.random() < 0.003:
            pc = f'{rnd.random() * 2:.2f}A'
        sn = '0.0' if base > 38 or rnd.random() < 0.7 else f'{rnd.expovariate(0.4):.1f}'
        sd = '0' if base > 34 else str(rnd.randint(0, 12))
        nrm = f'{55 - 22 * math.cos(2 * math.pi * (doy - 20) / 365.25):.1f}'
        row = [d.isoformat(), str(hi), str(lo), pc, sn, sd, nrm]
        if rnd.random() < 0.01:
            row[rnd.randint(1, 5)] = 'M'
        rows.append(row)
        d += dt.timedelta(days=1)
    # a long dry spell, a hot spell and a record-wet day in the window
    for j in range(1, 40):
        rows[-j][3] = '0.00'
    for j in range(1, 6):
        rows[-j][1] = '99'
    rows[-3][3] = '0.00'
    return rows

def brute_single(R, i, key):
    arr, desc = SINGLE[key]
    A = [num(v) for v in getattr(R, arr)]
    v, d = A[i], R.date[i]
    oth = [(R.date[j].year, A[j]) for j in range(R.n) if A[j] is not None and R.date[j].month == d.month
           and R.date[j].day == d.day and R.date[j].year != d.year]
    return rank_info(v, oth, desc)

def brute_streak(R, i, sid):
    name, test = STREAKS[sid]
    st = streak_state(streak_series(R, name), test)
    first = next(j for j, v in enumerate(st) if v is not None)
    lens, cs = [], -1
    for j in range(first, i + 1):
        if st[j] == 1:
            if cs < 0:
                cs = j
        elif cs >= 0:
            lens.append(j - cs); cs = -1
    if st[i] != 1:
        return None
    L = i - cs + 1
    return L, 1 + sum(1 for x in lens if x > L), sum(1 for x in lens if x >= L), len(lens) + 1

def selftest():
    assert f32(0.1) != 0.1 and f32(45.5 - f32(45.4)) < f32(0.1)          # the tracker's float32 edge
    assert p_strict('0.50A') is None and p_total('0.50A') == 0.5 and p_strict('T') == 'T' and p_total('T') == 0.0
    assert p_strict('M') is None and p_total('S') is None
    # a garbled preliminary report (no high, an 18° low after lows in the 50s) is never a record
    rows = synth_rows(9)
    rows[-1][1], rows[-1][2] = 'M', '-20'
    R = Rec(rows)
    win = [(WINDOW - 1, R.n - 1)]
    assert not [f for f in single_day_flags(R, win) if f['k'] in ('lo_lo', 'hi_lo')]
    # neighbour check: one garbled station among five calm ones; a shared heat wave is left alone
    rnd = random.Random(5)
    def stn(i, base, spike=None):
        hi = [base + rnd.gauss(0, 3) for _ in range(WINDOW)]
        lo = [x - 18 for x in hi]
        if spike:
            hi[-1], lo[-1] = spike
        return dict(sid=f'S{i}', lat=34 + i * 0.3, lon=-118 + i * 0.2, hi=hi, lo=lo, phi=114.0, plo=22.0)
    ts = [stn(i, 70) for i in range(5)] + [stn(9, 70, (130.0, 18.0))]
    sus = qc_suspects(ts)
    assert {(x[0], x[1]) for x in sus.get('S9', [])} == {(WINDOW - 1, 'hi'), (WINDOW - 1, 'lo')} and len(sus) == 1, sus
    ts = [stn(i, 70) for i in range(6)]
    for t in ts:
        t['hi'][-1] += 22; t['lo'][-1] += 22                 # regional heat wave
    assert not qc_suspects(ts)
    lone = [dict(sid='A', lat=61, lon=-150, hi=[40.0] * (WINDOW - 1) + [99.0], lo=[30.0] * WINDOW, phi=86.0, plo=-38.0)]
    assert {(x[1], x[3]) for x in qc_suspects(lone)['A']} == {('hi', 'record')}
    rows[-1][1] = '-30'                                   # high below low
    assert suspect_temp(Rec(rows), [num(x) for x in Rec(rows).lo], len(rows) - 1)
    for seed in (1, 2, 3):
        R = Rec(synth_rows(seed))
        end = R.date[-1]
        win = [(k, R.idx(end - dt.timedelta(days=WINDOW - 1 - k))) for k in range(WINDOW)]
        fl = single_day_flags(R, win)
        got = {(f['d'], f['k']): f['s'].get('date') for f in fl}
        checked = 0
        for k, i in win:
            for key in SINGLE:
                arr = SINGLE[key][0]
                v = num(getattr(R, arr)[i])
                if v is None or (key in FLOOR_KEY and v < FLOOR[FLOOR_KEY[key]]):
                    continue
                if arr in ('hi', 'lo') and suspect_temp(R, [num(x) for x in getattr(R, arr)], i):
                    assert (k, key) not in got, (seed, k, key)
                    continue
                b = brute_single(R, i, key)
                g = got.get((k, key))
                if qualifies(b):
                    assert g is not None and g == pack(b), (seed, k, key, g, b)
                elif g is not None:
                    assert g == pack(b), (seed, k, key, g, b)
                checked += 1
        sf = {(f['d'], f['t']): f for f in streak_flags(R, win)}
        for k, i in win:
            for sid in STREAKS:
                b = brute_streak(R, i, sid)
                g = sf.get((k, sid))
                if b and b[2] <= TOP - 1 and b[3] >= MIN_STREAKS:
                    assert g and (g['L'], g['r'], g['atleast'], g['n']) == b, (seed, k, sid, g, b)
                else:
                    assert g is None, (seed, k, sid, g, b)
        # totals: month-to-date precip vs a direct loop
        k, i = win[-1]
        d = R.date[i]
        a = dt.date(d.year, d.month, 1)
        tf = [f for f in totals_flags(R, win) if f['d'] == k and f['var'] == 'pcp' and f['per'] == 'mon']
        def direct(y):
            s = 0.0; miss = 0
            if R.idx(dt.date(y, d.month, 1)) < 0: return None
            for j in range(R.idx(dt.date(y, d.month, 1)), R.idx(dt.date(y, d.month, d.day)) + 1):
                if R.tpcp[j] is None: miss += 1
                else: s += R.tpcp[j]
            return None if miss > tol_for(d.day) else s
        v = round(direct(d.year), 4)
        oth = [(y, round(direct(y), 4)) for y in range(R.date[0].year, d.year) if direct(y) is not None]
        for dirn, desc in (('wet', True), ('dry', False)):
            b = rank_info(v, oth, desc)
            g = next((f for f in tf if f['dir'] == dirn), None)
            if qualifies(b) and 2 * d.day >= mlen(d.year, d.month):
                assert g and g['td'] == pack(b), (seed, dirn, g, b)
        print(f'selftest seed {seed}: {checked} single-day values, {len(sf)} streak flags OK')
    print('selftest OK')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['full', 'daily'], default='daily')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--dump', default=os.environ.get('RW_DUMP', ''), help='comma-separated roster ids: write raw rows to scripts/_rw_samples/')
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    mode = a.mode if os.path.exists(OUT) and os.path.isdir(CACHE) and os.listdir(CACHE) else 'full'
    t0 = time.time()
    data = build(mode, a.workers)
    data['generated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    data['mode'] = mode
    validate(data)
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'Wrote {OUT} ({os.path.getsize(OUT) / 1e3:.0f} KB, {mode}, {time.time() - t0:.0f}s)')
    if a.dump:
        dd = os.path.join(ROOT, 'scripts', '_rw_samples')
        os.makedirs(dd, exist_ok=True)
        by_id = {s['id']: s['sid'] for s in data['stations']}
        for sid_id in a.dump.split(','):
            sid = by_id.get(sid_id.strip())
            c = load_cached(sid) if sid else None
            if c:
                with gzip.open(os.path.join(dd, sid_id.strip() + '.json.gz'), 'wt', encoding='utf-8') as f:
                    json.dump({'sid': sid, 'rows': c['rows']}, f, separators=(',', ':'))


if __name__ == '__main__':
    main()
