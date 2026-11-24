#!/usr/bin/env python3
"""
Build public/snow-map-data.json for the US Snow Map.

For every station in public/station-roster.js (NOAA ACIS record by station id,
the same record the Snow Frequency tool loads):

  * Normal (1991-2020): the smoothed daily chance of snowfall >= 0.1/1/3/6"
    and of snow on the ground >= 1/3/6/12", computed with exactly the rules
    of public/snow-frequency.html (hail screen, complete-season test,
    Feb 29 folded into Feb 28, Gaussian sigma 12 d kernel ratio), so a dot on
    the map and the Snow Frequency curve agree. Needs >= 25 complete seasons
    in 1991-2020, per field.
  * This season: daily snowfall (hail screen applied) and snow depth from
    Jul 1 of the current season to the latest day.

Modes
  --mode full   period-of-record fetch per station; rebuilds everything
                (monthly, or when no data file exists yet).
  --mode daily  fetches only the current season per station; normals are kept.
  --selftest    checks the frequency code on synthetic data.
  --acis-dir    read <dir>/<ID>.json instead of calling ACIS (tests).

The file is only written when validation passes; a failed run never
replaces committed data.
"""
import argparse, concurrent.futures as cf, datetime as dt, json, math
import os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'public', 'station-roster.js')
OUT = os.path.join(ROOT, 'public', 'snow-map-data.json')
ACIS = 'https://data.rcc-acis.org/StnData'

BASE = (1991, 2020)
MIN_SEASONS = 25
LAYERS = {'snow': [('s01', 0.1), ('s1', 1.0), ('s3', 3.0), ('s6', 6.0)],
          'cover': [('c1', 1.0), ('c3', 3.0), ('c6', 6.0), ('c12', 12.0)]}
TRACE = 0.001
MIN_COVERAGE = 0.9
CORE_MONTHS = (10, 11, 12, 1, 2, 3, 4)
SCREEN_MINT = 40
SUMMER_MONTHS = (6, 7, 8)
SIGMA, KR = 12, 36
NS, FEB28, FEB29 = 365, 242, 365
CANON_START = {7: 0, 8: 31, 9: 62, 10: 92, 11: 123, 12: 153, 1: 184, 2: 215, 3: 243, 4: 274, 5: 304, 6: 335}
MLEN = {7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31, 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30}
AXIS = (62, 364)                                  # Sep 1 .. Jun 30, the map's timeline
GW = [math.exp(-0.5 * (j / SIGMA) ** 2) for j in range(-KR, KR + 1)]

B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
MISSING, TRACE_CODE = 4095, 4094
Q = 20                                            # chance stored in 0.05 % steps
MIN_STATIONS = 300
EASTERN = dt.timezone(dt.timedelta(hours=-5))


# ── encoding ───────────────────────────────────────────────────────────
def enc2(v):
    return B64[v >> 6] + B64[v & 63]

def enc_chance(p):
    return enc2(MISSING) if p is None or math.isnan(p) else enc2(min(4000, int(round(p * Q))))

def enc_snow(v):
    if v is None or math.isnan(v):
        return enc2(MISSING)
    if 0 < v < 0.05:
        return enc2(TRACE_CODE)
    return enc2(min(4093, int(round(v * 10))))

def enc_depth(v):
    if v is None or math.isnan(v):
        return enc2(MISSING)
    if 0 < v < 0.5:
        return enc2(TRACE_CODE)
    return enc2(min(4093, int(round(v))))


# ── ACIS parsing, identical to snow-frequency.html ─────────────────────
def parse_val(s):
    """parseVal(): M/S/blank -> NaN, T -> trace, else parseFloat (>= 0)."""
    if s is None:
        return math.nan
    s = str(s).strip()
    if not s or s[0] in 'MS':
        return math.nan
    if s[0] == 'T':
        return TRACE
    m = re.match(r'[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?', s)
    if not m:
        return math.nan
    v = float(m.group(0))
    return v if v >= 0 else math.nan

def parse_temp(s):
    if s is None:
        return math.nan
    m = re.match(r'\s*[+-]?(\d+\.?\d*|\.\d+)', str(s))
    return float(m.group(0)) if m else math.nan

def slot_of(mo, d):
    return FEB29 if (mo == 2 and d == 29) else CANON_START[mo] + d - 1

def cal_year(sy, mo):
    return sy if mo >= 7 else sy + 1

def days_in_month(y, m):
    return (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.date(y, m, 1)).days

def seasons_from_rows(rows):
    """{sy: {'v': [366], 'd': [366]}} with the hail screen applied to snowfall."""
    S = {}
    for r in rows:
        ds = r[0]
        y, mo, d = int(ds[0:4]), int(ds[5:7]), int(ds[8:10])
        sy = y if mo >= 7 else y - 1
        e = S.get(sy)
        if e is None:
            e = S[sy] = {'v': [math.nan] * 366, 'd': [math.nan] * 366}
        v, t, dep = parse_val(r[1]), parse_temp(r[2]), parse_val(r[3])
        if v > 0 and not (t <= SCREEN_MINT or (math.isnan(t) and mo not in SUMMER_MONTHS)):
            v = 0.0
        sl = slot_of(mo, d)
        e['v'][sl] = v
        e['d'][sl] = dep
    return S

def month_complete(arr, sy):
    for m in CORE_MONTHS:
        y = cal_year(sy, m)
        nd = days_in_month(y, m)
        c = 0
        for d in range(1, nd + 1):
            if not math.isnan(arr[slot_of(m, d)]):
                c += 1
        if c / nd < MIN_COVERAGE:
            return False
    return True

def smooth(v):
    out = [0.0] * NS
    for i in range(NS):
        s = 0.0
        for j in range(max(0, i - KR), min(NS - 1, i + KR) + 1):
            s += GW[j - i + KR] * v[j]
        out[i] = s
    return out

def normals(S, field, cur_sy):
    """Smoothed chance (%) per slot for each threshold of a field over the
    complete seasons of BASE, plus days/season; None if < MIN_SEASONS."""
    key = 'v' if field == 'snow' else 'd'
    th = LAYERS[field]
    sys_ = [sy for sy in sorted(S) if BASE[0] <= sy <= BASE[1] and sy < cur_sy and month_complete(S[sy][key], sy)]
    if len(sys_) < MIN_SEASONS:
        return None, len(sys_)
    cnt = [0.0] * NS
    hit = [[0.0] * NS for _ in th]
    for sy in sys_:
        arr = S[sy][key]
        for i in range(366):
            v = arr[i]
            if math.isnan(v):
                continue
            j = FEB28 if i == FEB29 else i
            cnt[j] += 1
            for k, (_, mn) in enumerate(th):
                if v >= mn - 1e-6:
                    hit[k][j] += 1
    sc = smooth(cnt)
    out = {}
    for k, (name, _) in enumerate(th):
        sh = smooth(hit[k])
        curve = [sh[i] / sc[i] * 100 if sc[i] > 0 else math.nan for i in range(NS)]
        out[name] = {'curve': curve, 'days': sum(hit[k]) / len(sys_)}
    return out, len(sys_)

def encode_layer(curve):
    """Values over the map axis, trimmed to where the chance is >= one step."""
    idx = [i for i in range(AXIS[0], AXIS[1] + 1) if not math.isnan(curve[i]) and round(curve[i] * Q) >= 1]
    if not idx:
        return -1, ''
    lo, hi = idx[0], idx[-1]
    return lo, ''.join(enc_chance(curve[i]) for i in range(lo, hi + 1))


# ── fetch ──────────────────────────────────────────────────────────────
ACIS_DIR = None

def acis(sid, sdate, edate, tries=4):
    if ACIS_DIR:
        p = os.path.join(ACIS_DIR, f'{sid}.json')
        if not os.path.exists(p):
            raise RuntimeError(f'{sid}: no data')
        rows = json.load(open(p))['data']
        return [r for r in rows if (sdate == 'por' or r[0] >= sdate) and (edate == 'por' or r[0] <= edate)]
    body = json.dumps({'sid': sid, 'sdate': sdate, 'edate': edate,
                       'elems': [{'name': 'snow'}, {'name': 'mint'}, {'name': 'snwd'}]}).encode()
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(ACIS, data=body, headers={'Content-Type': 'application/json',
                                                                     'User-Agent': 'contextclimate-snow-map'})
            with urllib.request.urlopen(req, timeout=120) as r:
                j = json.loads(r.read())
        except Exception as e:                       # noqa: BLE001 — network/server errors are retried
            last = e
            time.sleep(4 * (k + 1))
            continue
        if 'error' in j:                             # ACIS answered: unknown id or no data — don't retry
            raise RuntimeError(f"{sid}: {j['error']}")
        return j.get('data') or []
    raise RuntimeError(f'{sid}: {last}')

def read_roster():
    txt = open(ROSTER, encoding='utf-8').read()
    pat = re.compile(r'\[\s*"([A-Z0-9]{3,5})"\s*,\s*"([^"]*)"\s*,\s*"([A-Z]{0,2})"\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*"([A-Z]{2})"\s*\]')
    rows = [dict(id=m[0], name=m[1], st=m[2], lat=float(m[3]), lon=float(m[4])) for m in pat.findall(txt)]
    if len(rows) < 300:
        sys.exit(f'Roster parse found only {len(rows)} stations')
    return rows


# ── build ──────────────────────────────────────────────────────────────
def season_today():
    t = dt.datetime.now(EASTERN).date()
    return (t.year if t.month >= 7 else t.year - 1), t

def obs_for(rows, sy, end):
    """Daily snowfall (screened) and depth from Jul 1 of sy to end."""
    start = dt.date(sy, 7, 1)
    n = (end - start).days + 1
    v, d = [math.nan] * n, [math.nan] * n
    for r in rows:
        day = dt.date.fromisoformat(r[0])
        k = (day - start).days
        if not 0 <= k < n:
            continue
        sv, t, dep = parse_val(r[1]), parse_temp(r[2]), parse_val(r[3])
        if sv > 0 and not (t <= SCREEN_MINT or (math.isnan(t) and day.month not in SUMMER_MONTHS)):
            sv = 0.0
        v[k], d[k] = sv, dep
    return ''.join(enc_snow(x) for x in v), ''.join(enc_depth(x) for x in d)

def pick_end(rows_by_id, sy, today):
    """Latest day with a snowfall report from >= 80% of the stations that reported
    snowfall that week (airport snowfall arrives later in the morning than temperature)."""
    start = dt.date(sy, 7, 1)
    have = {}
    for sid, rows in rows_by_id.items():
        for r in rows:
            if math.isnan(parse_val(r[1])):
                continue
            day = dt.date.fromisoformat(r[0])
            if start <= day <= today:
                have.setdefault(day, set()).add(sid)
    if not have:
        return None
    latest = max(have)
    week = set().union(*[have.get(latest - dt.timedelta(days=i), set()) for i in range(7)])
    day = latest
    while day >= start:
        if len(have.get(day, ())) >= 0.8 * len(week):
            return day
        day -= dt.timedelta(days=1)
    return latest

def fetch_all(roster, sdate, workers):
    raw, failed = {}, []
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(acis, s['id'], sdate, 'por'): s['id'] for s in roster}
        for fut in cf.as_completed(futs):
            try:
                rows = fut.result()
                if rows:
                    raw[futs[fut]] = rows
            except Exception as e:                    # noqa: BLE001
                failed.append(str(e))
    return raw, failed

def station_normals(rows, cur_sy):
    S = seasons_from_rows(rows)
    out = {'n': [0, 0], 'days': {}, 'lo': {}, 'cv': {}}
    for fi, field in enumerate(('snow', 'cover')):
        res, n = normals(S, field, cur_sy)
        out['n'][fi] = n
        if res is None:
            continue
        for name, _ in LAYERS[field]:
            lo, s = encode_layer(res[name]['curve'])
            out['days'][name] = round(res[name]['days'], 2)
            out['lo'][name] = lo
            out['cv'][name] = s
    rec0 = None
    for r in rows:
        if not math.isnan(parse_val(r[1])) or not math.isnan(parse_val(r[3])):
            rec0 = int(r[0][:4])
            break
    out['rec0'] = rec0
    return out

def build_full(roster, workers):
    sy, today = season_today()
    raw, failed = fetch_all(roster, 'por', workers)
    print(f'Fetched {len(raw)} of {len(roster)} stations ({len(failed)} failed)')
    end = pick_end(raw, sy, today)
    if end is None:
        sys.exit('No current-season data at all — not writing.')
    out = []
    for st in roster:
        rows = raw.get(st['id'])
        if not rows:
            continue
        s = dict(st)
        s.update(station_normals(rows, sy))
        s['ov'], s['od'] = obs_for(rows, sy, end)
        out.append(s)
    return dict(seasonYear=sy, start=f'{sy}-07-01', end=end.isoformat(), base=list(BASE), stations=out), failed

def build_daily(roster, prev, workers):
    sy, today = season_today()
    keep = {s['id']: s for s in prev['stations']}
    todo = [s for s in roster if s['id'] in keep]
    raw, failed = fetch_all(todo, f'{sy}-07-01', workers)
    print(f'Fetched {len(raw)} of {len(todo)} stations ({len(failed)} failed)')
    end = pick_end(raw, sy, today)
    if end is None:
        sys.exit('No current-season data at all — not writing.')
    n = (end - dt.date(sy, 7, 1)).days + 1
    out = []
    for st in todo:
        s = dict(keep[st['id']])
        s.update(id=st['id'], name=st['name'], st=st['st'], lat=st['lat'], lon=st['lon'])
        if st['id'] in raw:
            s['ov'], s['od'] = obs_for(raw[st['id']], sy, end)
        elif prev.get('seasonYear') == sy:
            pad = enc2(MISSING) * n
            s['ov'] = (s['ov'] + pad)[:2 * n]
            s['od'] = (s['od'] + pad)[:2 * n]
        else:
            s['ov'] = s['od'] = enc2(MISSING) * n
        out.append(s)
    return dict(seasonYear=sy, start=f'{sy}-07-01', end=end.isoformat(), base=list(BASE), stations=out), failed

def validate(data, min_stations=MIN_STATIONS):
    st = data['stations']
    if len(st) < min_stations:
        sys.exit(f'Only {len(st)} stations — not writing.')
    n = (dt.date.fromisoformat(data['end']) - dt.date.fromisoformat(data['start'])).days + 1
    with_snow = sum(1 for s in st if 's01' in s['cv'])
    with_cover = sum(1 for s in st if 'c1' in s['cv'])
    for s in st:
        if len(s['ov']) != 2 * n or len(s['od']) != 2 * n:
            sys.exit(f"{s['id']}: obs length {len(s['ov'])}/{len(s['od'])} != {2 * n}")
        for name, lo in s['lo'].items():
            L = len(s['cv'][name]) // 2
            if (lo < 0) != (L == 0) or (lo >= 0 and not (AXIS[0] <= lo and lo + L - 1 <= AXIS[1])):
                sys.exit(f"{s['id']}: bad range for {name}: lo {lo}, {L} values")
            for i in range(L):
                v = (B64.index(s['cv'][name][2 * i]) << 6) | B64.index(s['cv'][name][2 * i + 1])
                if v > 2000:
                    sys.exit(f"{s['id']}: {name} chance {v / Q}% out of range")
    if with_snow < 0.25 * len(st):
        sys.exit(f'Only {with_snow} of {len(st)} stations have snowfall normals — not writing.')
    print(f"OK: {len(st)} stations ({with_snow} with snowfall normals, {with_cover} with snow-cover normals), "
          f"{data['start']} → {data['end']} ({n} days)")


# ── self-test ──────────────────────────────────────────────────────────
def selftest():
    assert parse_val('T') == TRACE and math.isnan(parse_val('M')) and parse_val('1.5A') == 1.5
    assert math.isnan(parse_val('S')) and parse_val(' 0.0 ') == 0.0 and parse_temp('45A') == 45.0
    assert math.isnan(parse_temp('M'))
    assert slot_of(7, 1) == 0 and slot_of(2, 28) == FEB28 and slot_of(3, 1) == 243 and slot_of(6, 30) == 364
    # synthetic: snow every Jan 15 (>=3"), a warm-day "hail" report in May, Feb 29 folds into Feb 28
    rows = []
    day = dt.date(1985, 7, 1)
    while day <= dt.date(2022, 6, 30):
        v, t, dep = '0.0', '20' if day.month in (12, 1, 2) else '50', '0'
        if day.month == 1 and day.day == 15:
            v, dep = '3.0', '3'
        if day.month == 5 and day.day == 10:
            v = '0.5'
        if day.month == 2 and day.day == 29:
            v = '1.0'
        rows.append([day.isoformat(), v, t, dep])
        day += dt.timedelta(days=1)
    S = seasons_from_rows(rows)
    assert S[2000]['v'][slot_of(5, 10)] == 0.0, 'hail screen'
    res, n = normals(S, 'snow', 2026)
    assert n == 30, n
    j15 = slot_of(1, 15)
    raw = 100.0                                   # every season, every Jan 15
    assert res['s3']['curve'][j15] < raw and res['s3']['curve'][j15] > 1, res['s3']['curve'][j15]
    assert abs(res['s3']['days'] - 1.0) < 1e-9, res['s3']['days']
    assert abs(res['s1']['days'] - (1 + 8 / 30)) < 1e-9, res['s1']['days']   # + the 8 Feb 29s in 1991-2020 seasons
    lo, s = encode_layer(res['s3']['curve'])
    assert lo >= AXIS[0] and len(s) % 2 == 0 and lo <= j15 <= lo + len(s) // 2
    a, b = obs_for(rows, 2021, dt.date(2022, 6, 30))
    assert len(a) == len(b) == 2 * 365
    assert enc_snow(TRACE) == enc2(TRACE_CODE) and enc_depth(0.0) == enc2(0)
    print('selftest OK')


def main():
    global ACIS_DIR, OUT
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['full', 'daily'], default='daily')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--acis-dir')
    ap.add_argument('--out')
    ap.add_argument('--min-stations', type=int, default=MIN_STATIONS)
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    ACIS_DIR = a.acis_dir
    if a.out:
        OUT = a.out
    roster = read_roster()
    prev = json.load(open(OUT)) if os.path.exists(OUT) else None
    mode = a.mode if prev else 'full'
    t0 = time.time()
    data, failed = build_full(roster, a.workers) if mode == 'full' else build_daily(roster, prev, a.workers)
    data['generated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    data['mode'] = mode
    for f in failed[:20]:
        print('  failed:', f)
    validate(data, a.min_stations)
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'Wrote {OUT} ({os.path.getsize(OUT) / 1e3:.0f} KB, {mode}, {time.time() - t0:.0f}s)')


if __name__ == '__main__':
    main()
