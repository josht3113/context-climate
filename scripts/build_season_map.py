#!/usr/bin/env python3
"""
Build public/season-map-data.json for the Season Map tool.

For every station in public/station-roster.js:
  * thresholds for both normal periods (1981-2010, 1991-2020), computed
    exactly as Seasons Analysis computes them in the browser (same float
    operations in the same order, same toFixed(2) rounding) so the map and
    the station views always agree;
  * the daily mean for every day of the current season year (Dec 1 -> latest);
  * for each period, the share of complete season years in each season for
    each 7-day block of the season year (used for "rare for the date").

Modes
  --mode full   period-of-record fetch per station; rebuilds everything
                (monthly, or when no data file exists yet).
  --mode daily  fetches only the current season year per station and
                refreshes the daily means; thresholds/shares are kept.
  --selftest    checks the threshold/classification code on synthetic data.

The file is only written when validation passes; a failed run never
replaces committed data.
"""
import argparse, concurrent.futures as cf, datetime as dt, decimal, json, math
import os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, 'public', 'station-roster.js')
OUT = os.path.join(ROOT, 'public', 'season-map-data.json')
ACIS = 'https://data.rcc-acis.org/StnData'
PERIODS = (1981, 1991)
DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
BC_ORDER = [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
BC_MSTART = {}
_s = 0
for _m in BC_ORDER:
    BC_MSTART[_m] = _s
    _s += 29 if _m == 1 else DIM[_m]
SLOTS, FEB29 = 366, BC_MSTART[1] + 28
NBLK = math.ceil(SLOTS / 7)                 # 53 seven-day blocks
CODE = {'winter': 1, 'spring': 2, 'summer': 3, 'autumn': 4}
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
MISSING = 4095
MIN_STATIONS = 300


# ── encoding ───────────────────────────────────────────────────────────
def enc2(v):
    return B64[v >> 6] + B64[v & 63]

def enc_mean(mean):
    if mean is None:
        return enc2(MISSING)
    v = int(round(mean * 2)) + 256          # means are whole or half °F
    if not 0 <= v < MISSING:
        return enc2(MISSING)
    return enc2(v)

def enc_share(x):
    return enc2(MISSING) if x is None else enc2(int(round(x * 4094)))


# ── JavaScript-identical helpers ───────────────────────────────────────
def js_parse_int(v):
    """parseInt(v) for ACIS strings: leading integer, else None."""
    if v is None or v == '' or v == 'M':
        return None
    m = re.match(r'\s*([+-]?\d+)', str(v))
    return int(m.group(1)) if m else None

def js_to_fixed2(x):
    """+(x).toFixed(2): JS rounds |x| exactly (binary value), ties to the
    larger n, then restores the sign."""
    neg = x < 0
    d = abs(decimal.Decimal(x)) * 100 + decimal.Decimal('0.5')
    n = int(d.to_integral_value(rounding=decimal.ROUND_FLOOR))
    v = float(decimal.Decimal(n) / 100)
    return -v if neg else v

def js_sum(vals):
    s = 0.0
    for v in vals:
        s = s + v
    return s

def doy(month, day):
    return sum(DIM[:month]) + day

def sy_of(year, month):
    return year if month == 11 else year - 1


# ── Seasons Analysis logic (mirrors NortheastUS-seasons.html) ──────────
def parse_rows(rows):
    out = []
    for r in rows:
        ds = r[0]
        y, mo, d = int(ds[0:4]), int(ds[5:7]) - 1, int(ds[8:10])
        mx, mn = js_parse_int(r[1]), js_parse_int(r[2])
        mean = (mx + mn) / 2 if mx is not None and mn is not None else None
        out.append((ds, y, mo, d, mean))
    return out

def compute_thresholds(days, start):
    def build(y0, y1):
        norms, yrs = {}, {}
        for _, y, mo, d, mean in days:
            if y < y0 or y > y1 or mean is None:
                continue
            norms.setdefault((mo, d), []).append(mean)
            yrs[y] = yrs.get(y, 0) + 1
        return norms, sum(1 for c in yrs.values() if c >= 300)
    norms, n_years = build(start, start + 29)
    por = False
    if n_years < 10:
        norms, n_years = build(-10**9, 10**9)
        por = True
    avgs = []
    for m in range(12):
        for d in range(1, DIM[m] + 1):
            a = norms.get((m, d), [])
            avgs.append(js_sum(a) / len(a) if a else None)
    n = len(avgs)
    sm = []
    for i in range(n):
        vals = [avgs[((i + o) % n + n) % n] for o in range(-15, 16)]
        vals = [v for v in vals if v is not None]
        sm.append(js_sum(vals) / len(vals) if vals else None)
    i_min = i_max = -1
    for i, v in enumerate(sm):
        if v is None:
            continue
        if i_min < 0 or v < sm[i_min]:
            i_min = i
        if i_max < 0 or v > sm[i_max]:
            i_max = i
    if i_min < 0:
        return None
    warm, cold = sm[i_max], sm[i_min]
    rng = warm - cold
    return {'summer': js_to_fixed2(cold + rng * 0.75), 'winter': js_to_fixed2(cold + rng * 0.25),
            'coldDoy': i_min + 1, 'warmDoy': i_max + 1, 'nYears': n_years, 'por': por}

def classify(mo, d, mean, t):
    if mean is None:
        return None
    if mean >= t['summer']:
        return 'summer'
    if mean <= t['winter']:
        return 'winter'
    x, c, w = doy(mo, d), t['coldDoy'], t['warmDoy']
    spring = (c <= x < w) if c < w else (x >= c or x < w)
    return 'spring' if spring else 'autumn'

def is_leap(y):
    return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0

def shares(days, t, cur_sy):
    """Share of complete season years in each season, per 7-day block."""
    by_sy = {}
    for _, y, mo, d, mean in days:
        by_sy.setdefault(sy_of(y, mo), []).append((mo, d, mean))
    complete = [sy for sy, rows in by_sy.items() if len(rows) >= 270 and sy < cur_sy]
    cnt = [[0] * 5 for _ in range(SLOTS)]
    for sy in complete:
        for mo, d, mean in by_sy[sy]:
            s = classify(mo, d, mean, t)
            if s is None:
                continue
            slot = BC_MSTART[mo] + d - 1
            if slot == FEB29 and not is_leap(sy + 1):
                continue
            cnt[slot][CODE[s]] += 1
            cnt[slot][0] += 1
    out = []
    for b in range(NBLK):
        acc = [0] * 5
        for s in range(b * 7, min(SLOTS, b * 7 + 7)):
            for q in range(5):
                acc[q] += cnt[s][q]
        out.append(None if not acc[0] else [acc[c] / acc[0] for c in (1, 2, 3, 4)])
    return out, len(complete)


# ── fetch ──────────────────────────────────────────────────────────────
def acis(sid, sdate, edate, tries=4):
    body = json.dumps({'sid': sid, 'sdate': sdate, 'edate': edate,
                       'elems': [{'name': 'maxt'}, {'name': 'mint'}]}).encode()
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(ACIS, data=body, headers={'Content-Type': 'application/json',
                                                                     'User-Agent': 'contextclimate-season-map'})
            with urllib.request.urlopen(req, timeout=120) as r:
                j = json.loads(r.read())
            if 'error' in j:
                raise RuntimeError(j['error'])
            return j.get('data') or []
        except Exception as e:                       # noqa: BLE001 — retried, then reported
            last = e
            time.sleep(4 * (k + 1))
    raise RuntimeError(f'{sid}: {last}')

def read_roster():
    txt = open(ROSTER, encoding='utf-8').read()
    pat = re.compile(r'\[\s*"([A-Z0-9]{3,5})"\s*,\s*"([^"]*)"\s*,\s*"([A-Z]{0,2})"\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*"([A-Z]{2})"\s*\]')
    rows = [dict(id=m[0], name=m[1], st=m[2], lat=float(m[3]), lon=float(m[4])) for m in pat.findall(txt)]
    if len(rows) < 300:
        sys.exit(f'Roster parse found only {len(rows)} stations')
    return rows


# ── build ──────────────────────────────────────────────────────────────
def season_year_today():
    t = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date()   # US Eastern (standard)
    return sy_of(t.year, t.month - 1), t

def means_for(days, sy, end):
    start = dt.date(sy, 12, 1)
    n = (end - start).days + 1
    arr = [None] * n
    for ds, y, mo, d, mean in days:
        k = (dt.date(y, mo + 1, d) - start).days
        if 0 <= k < n:
            arr[k] = mean
    return ''.join(enc_mean(v) for v in arr)

def pick_end(raw_by_id, sy, today):
    """Latest date reported by at least 80% of the stations active that week."""
    start = dt.date(sy, 12, 1)
    have = {}
    for days in raw_by_id.values():
        for ds, y, mo, d, mean in days:
            if mean is None:
                continue
            day = dt.date(y, mo + 1, d)
            if start <= day <= today:
                have.setdefault(day, set()).add(id(days))
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

def build_full(roster, workers):
    sy, today = season_year_today()
    raw, failed = {}, []
    def job(st):
        return st['id'], parse_rows(acis(st['id'], 'por', 'por'))
    with cf.ThreadPoolExecutor(workers) as ex:
        for fut in cf.as_completed([ex.submit(job, s) for s in roster]):
            try:
                sid, days = fut.result()
                if days:
                    raw[sid] = days
            except Exception as e:                    # noqa: BLE001
                failed.append(str(e))
    print(f'Fetched {len(raw)} of {len(roster)} stations ({len(failed)} failed)')
    end = pick_end(raw, sy, today)
    if end is None:
        sys.exit('No current season-year data at all — not writing.')
    out = []
    for st in roster:
        days = raw.get(st['id'])
        if not days:
            continue
        thr, shr, ncomp = {}, {}, {}
        for p in PERIODS:
            t = compute_thresholds(days, p)
            if t is None:
                break
            thr[str(p)] = t
            blocks, nc = shares(days, t, sy)
            shr[str(p)] = ''.join(enc_share(None) if b is None else ''.join(enc_share(x) for x in b) for b in blocks)
            ncomp = nc
        if len(thr) != len(PERIODS):
            continue
        rec0 = next((y for _, y, _, _, mean in days if mean is not None), None)
        out.append(dict(st, rec0=rec0, nComplete=ncomp, thr=thr, share=shr, mean=means_for(days, sy, end)))
    return dict(seasonYear=sy, start=f'{sy}-12-01', end=end.isoformat(), stations=out), failed

def build_daily(roster, prev, workers):
    sy, today = season_year_today()
    keep = {s['id']: s for s in prev['stations']}
    raw, failed = {}, []
    def job(st):
        return st['id'], parse_rows(acis(st['id'], f'{sy}-12-01', today.isoformat()))
    todo = [s for s in roster if s['id'] in keep]
    with cf.ThreadPoolExecutor(workers) as ex:
        for fut in cf.as_completed([ex.submit(job, s) for s in todo]):
            try:
                sid, days = fut.result()
                raw[sid] = days
            except Exception as e:                    # noqa: BLE001
                failed.append(str(e))
    print(f'Fetched {len(raw)} of {len(todo)} stations ({len(failed)} failed)')
    end = pick_end(raw, sy, today)
    if end is None:
        sys.exit('No current season-year data at all — not writing.')
    out = []
    for st in todo:
        s = dict(keep[st['id']])
        s.update(id=st['id'], name=st['name'], st=st['st'], lat=st['lat'], lon=st['lon'])
        if st['id'] in raw:
            s['mean'] = means_for(raw[st['id']], sy, end)
        elif prev.get('seasonYear') == sy:
            old_n = len(s['mean']) // 2
            n = (end - dt.date(sy, 12, 1)).days + 1
            s['mean'] = (s['mean'] + enc2(MISSING) * n)[:2 * n] if n > old_n else s['mean'][:2 * n]
        else:
            s['mean'] = enc2(MISSING) * ((end - dt.date(sy, 12, 1)).days + 1)
        out.append(s)
    return dict(seasonYear=sy, start=f'{sy}-12-01', end=end.isoformat(), stations=out), failed

def validate(data):
    st = data['stations']
    if len(st) < MIN_STATIONS:
        sys.exit(f'Only {len(st)} stations with thresholds — not writing.')
    n = (dt.date.fromisoformat(data['end']) - dt.date.fromisoformat(data['start'])).days + 1
    recent = 0
    for s in st:
        if len(s['mean']) != 2 * n:
            sys.exit(f"{s['id']}: mean length {len(s['mean'])} != {2 * n}")
        for p in PERIODS:
            t = s['thr'][str(p)]
            if not (t['winter'] < t['summer']) or not (1 <= t['coldDoy'] <= 365 and 1 <= t['warmDoy'] <= 365):
                sys.exit(f"{s['id']}: bad thresholds {t}")
            if len(s['share'][str(p)]) != NBLK * 8:
                sys.exit(f"{s['id']}: bad share length")
        if s['mean'][-14:] != enc2(MISSING) * 7:
            recent += 1
    if recent < 0.8 * len(st):
        sys.exit(f'Only {recent} of {len(st)} stations have data in the last week — not writing.')
    print(f"OK: {len(st)} stations, {data['start']} → {data['end']} ({n} days), {recent} current")


# ── self-test ──────────────────────────────────────────────────────────
def selftest():
    assert js_to_fixed2(1.005) == 1.0          # 1.005 is below 1.005 in binary, as in JS
    assert js_to_fixed2(63.675) == 63.67 or js_to_fixed2(63.675) == 63.68
    assert js_to_fixed2(2.5) == 2.5 and js_to_fixed2(-0.125) == -0.13
    assert js_parse_int('45A') == 45 and js_parse_int('M') is None and js_parse_int('T') is None
    rows = []
    d0 = dt.date(1975, 1, 1)
    for k in range(365 * 50):
        day = d0 + dt.timedelta(days=k)
        dy = day.timetuple().tm_yday
        mean = 52 - 21 * math.cos(2 * math.pi * (dy - 20) / 365.25)
        rows.append([day.isoformat(), str(round(mean + 8)), str(round(mean - 8))])
    days = parse_rows(rows)
    t = compute_thresholds(days, 1981)
    assert t and t['nYears'] == 30 and not t['por'] and t['winter'] < t['summer'], t
    assert 10 <= t['coldDoy'] <= 30 and 190 <= t['warmDoy'] <= 210, t
    assert classify(6, 15, 80, t) == 'summer' and classify(0, 15, 20, t) == 'winter'
    assert classify(3, 15, (t['summer'] + t['winter']) / 2, t) == 'spring'
    assert classify(9, 15, (t['summer'] + t['winter']) / 2, t) == 'autumn'
    b, nc = shares(days, t, 2025)
    assert nc == 50 and len(b) == NBLK and abs(sum(b[30]) - 1) < 1e-9, (nc, b[30])
    s = means_for(days, 2023, dt.date(2024, 11, 30))
    assert len(s) == 2 * 366
    print('selftest OK')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['full', 'daily'], default='daily')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    roster = read_roster()
    prev = json.load(open(OUT)) if os.path.exists(OUT) else None
    mode = a.mode if prev else 'full'
    t0 = time.time()
    data, failed = build_full(roster, a.workers) if mode == 'full' else build_daily(roster, prev, a.workers)
    data['generated'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    data['mode'] = mode
    for f in failed[:20]:
        print('  failed:', f)
    validate(data)
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'Wrote {OUT} ({os.path.getsize(OUT) / 1e3:.0f} KB, {mode}, {time.time() - t0:.0f}s)')


if __name__ == '__main__':
    main()
