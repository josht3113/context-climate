#!/usr/bin/env python3
"""
Build the Pacific SST anomaly frames for pacific-sst-anomaly-map.html.

Source: NOAA OISST v2.1 (0.25 deg). Anomalies are computed here against the
1991-2020 climatology -- the `anom` variable inside the NCEI daily files is on
a 1971-2000 base and is deliberately NOT used.

Output (written to --data-dir, published on the `sst-data` branch and copied
into public/sst/ by deploy.yml):

  index.json                    grid, frame lists, tropical means, version
  daily/YYYY-MM-DD.bin.gz       one frame per day, rolling window
  monthly/YYYY-MM.bin.gz        one frame per month, Sep 1981 onward

Frame encoding: gzip of NLAT*NLON signed bytes, row 0 = northernmost row,
value = round(anomaly / SCALE), clipped to +/-127; -128 = land / missing.

Modes
  (default)     daily refresh: pull new days, upgrade preliminary days to
                final, derive completed months from finals, prune the window
  --bootstrap   also build the monthly archive from PSL's monthly file and
                fill every missing day in the window

Failure policy (same as the ENSO pipeline): a source or frame that fails
validation is never written; the reason is appended to <work>/FAILURES and
the workflow fails the run after publishing whatever did validate.
"""
import argparse
import calendar
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

# ── Grid ──────────────────────────────────────────────────────────────────────
# OISST cell centres sit on .125/.375/.625/.875, so domain edges fall between
# cells and a centre is either inside the domain or not.
LAT_S, LAT_N = -30.0, 30.0
LON_W, LON_E = 110.0, 285.0          # 110E .. 75W, 0-360 notation
DEG = 0.25
NLAT = int((LAT_N - LAT_S) / DEG)    # 240
NLON = int((LON_E - LON_W) / DEG)    # 700
TROP = 20.0                          # tropical mean band, 20S-20N
SCALE = 0.05                         # degC per count
MISSING = -128

WINDOW_DAYS = 365                    # rolling daily window
REFRESH_DAYS = 16                    # re-check this many recent days each run
MAX_NEW_PER_RUN = 60                 # gap-fill cap outside --bootstrap

# ── Sources ───────────────────────────────────────────────────────────────────
# SST_SOURCE_ROOT overrides every host (used by the test fixtures).
_ROOT = os.environ.get('SST_SOURCE_ROOT')
NCEI = _ROOT or 'https://www.ncei.noaa.gov/data/sea-surface-temperature-optimum-interpolation/v2.1/access/avhrr'
# PSL files are tried on each host in order. downloads.psl.noaa.gov returned
# 502s to GitHub runners (and bot-blocks automated clients); the THREDDS file
# server on psl.noaa.gov serves the same files.
PSL_MIRRORS = ([m for m in os.environ['SST_PSL_MIRRORS'].split(',') if m] if os.environ.get('SST_PSL_MIRRORS')
               else [_ROOT] if _ROOT
               else ['https://psl.noaa.gov/thredds/fileServer/Datasets/noaa.oisst.v2.highres',
                     'https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2.highres'])
DAILY_FINAL = NCEI + '/{ym}/oisst-avhrr-v02r01.{ymd}.nc'
DAILY_PRELIM = NCEI + '/{ym}/oisst-avhrr-v02r01.{ymd}_preliminary.nc'
DAILY_CLIM = 'sst.day.mean.ltm.1991-2020.nc'      # ~1.4 GB, cached between runs
MONTHLY_MEAN = 'sst.mon.mean.nc'                   # ~2.2 GB, bootstrap only
MONTHLY_CLIM = 'sst.mon.ltm.1991-2020.nc'          # ~46 MB
USER_AGENT = 'contextclimate-sst-pipeline/1.0 (+https://contextclimate.io)'

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print('✗ ' + msg, flush=True)


# ── Download ──────────────────────────────────────────────────────────────────
def download(url, dest, max_time=180):
    """Return True on success, False on HTTP 404, raise on anything else."""
    if url.startswith('/') or url.startswith('file://'):
        src = url[7:] if url.startswith('file://') else url
        if not os.path.exists(src):
            return False
        with open(src, 'rb') as fi, open(dest, 'wb') as fo:
            fo.write(fi.read())
        return True
    tmp = dest + '.part'
    r = subprocess.run(
        ['curl', '-sS', '-L', '-A', USER_AGENT, '-o', tmp, '-w', '%{http_code}',
         '--retry', '4', '--retry-all-errors', '--retry-delay', '5',
         '--connect-timeout', '30', '--max-time', str(max_time), url],
        capture_output=True, text=True)
    code = r.stdout.strip()
    if code == '404':
        if os.path.exists(tmp):
            os.remove(tmp)
        return False
    if r.returncode != 0 or code != '200':
        if os.path.exists(tmp):
            os.remove(tmp)
        last = (r.stderr.strip().splitlines() or [''])[-1]
        raise RuntimeError(f'download failed ({code or r.returncode}): {url} {last}'.strip())
    os.replace(tmp, dest)
    return True


def download_psl(fname, dest, max_time):
    """Fetch a PSL file from the first mirror that serves a valid netCDF."""
    errors = []
    for base in PSL_MIRRORS:
        url = base.rstrip('/') + '/' + fname
        try:
            if not download(url, dest, max_time=max_time):
                errors.append(f'404 {url}')
                continue
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
            continue
        if is_netcdf(dest):
            print(f'✓ {fname} from {base}', flush=True)
            return
        errors.append(f'not netCDF: {url}')
        os.remove(dest)
    raise RuntimeError(' | '.join(errors))


def is_netcdf(path):
    with open(path, 'rb') as f:
        head = f.read(8)
    return head[:3] == b'CDF' or head[:8] == b'\x89HDF\r\n\x1a\n'


# ── NetCDF helpers ────────────────────────────────────────────────────────────
def _coord(ds, *names):
    for n in names:
        if n in ds.variables:
            return np.asarray(ds.variables[n][:], dtype=np.float64)
    raise KeyError(f'none of {names} in file')


class GridMap:
    """Row/column indices mapping a global 0.25 grid onto the band we need."""

    def __init__(self, lat, lon):
        lon = np.where(lon < 0, lon + 360.0, lon)
        self.band_rows = np.where((lat > LAT_S) & (lat < LAT_N))[0]
        band_lat = lat[self.band_rows]
        # north-first ordering inside the band
        order = np.argsort(-band_lat)
        self.band_rows = self.band_rows[order]
        self.band_lat = band_lat[order]
        self.lon_order = np.argsort(lon)
        self.lon_sorted = lon[self.lon_order]
        self.dom_cols = np.where((self.lon_sorted > LON_W) & (self.lon_sorted < LON_E))[0]
        self.trop_rows = np.where(np.abs(self.band_lat) < TROP)[0]
        if len(self.band_rows) != NLAT or len(self.dom_cols) != NLON:
            raise ValueError(f'unexpected grid: {len(self.band_rows)} rows, {len(self.dom_cols)} cols')
        expect = LAT_N - DEG / 2
        if abs(self.band_lat[0] - expect) > 1e-3 or abs(self.lon_sorted[self.dom_cols[0]] - (LON_W + DEG / 2)) > 1e-3:
            raise ValueError('grid centres are not on the expected 0.125 offsets')
        w = np.cos(np.radians(self.band_lat[self.trop_rows]))
        self.trop_w = w[:, None]

    def band(self, arr2d):
        """(lat, lon) global slice -> (NLAT band rows, all lons sorted 0-360)."""
        a = np.asarray(arr2d, dtype=np.float64)
        return a[self.band_rows][:, self.lon_order]

    def domain(self, band):
        return band[:, self.dom_cols]

    def tropical_mean(self, band):
        t = band[self.trop_rows]
        ok = np.isfinite(t)
        w = np.broadcast_to(self.trop_w, t.shape)
        sw = w[ok].sum()
        return float((t[ok] * w[ok]).sum() / sw) if sw > 0 else float('nan')


def read_2d(var, index):
    """var[index] as float64 with fill/mask -> NaN; drops singleton dims."""
    v = var[index]
    a = np.ma.filled(np.ma.asarray(v).astype(np.float64), np.nan)
    a = np.squeeze(a)
    a[(a < -5) | (a > 45)] = np.nan
    return a


def open_nc(path):
    import netCDF4
    ds = netCDF4.Dataset(path)
    ds.set_auto_maskandscale(True)
    return ds


def month_day_index(ds):
    """Map (month, day) -> time index for a daily long-term-mean file."""
    import netCDF4
    t = ds.variables['time']
    dates = netCDF4.num2date(t[:], t.units, getattr(t, 'calendar', 'standard'),
                             only_use_cftime_datetimes=True)
    return {(d.month, d.day): i for i, d in enumerate(dates)}


def year_month_index(ds):
    import netCDF4
    t = ds.variables['time']
    dates = netCDF4.num2date(t[:], t.units, getattr(t, 'calendar', 'standard'),
                             only_use_cftime_datetimes=True)
    return [(d.year, d.month) for d in dates]


# ── Encoding ──────────────────────────────────────────────────────────────────
def encode(dom):
    q = np.full(dom.shape, MISSING, dtype=np.int8)
    ok = np.isfinite(dom)
    q[ok] = np.clip(np.rint(dom[ok] / SCALE), -127, 127).astype(np.int8)
    return q


def decode(q):
    a = q.astype(np.float64) * SCALE
    a[q == MISSING] = np.nan
    return a


def write_frame(path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = q.astype(np.int8).tobytes()
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', mtime=0, compresslevel=9) as gz:
            gz.write(raw)
    os.replace(tmp, path)


def read_frame(path):
    with gzip.open(path, 'rb') as f:
        raw = f.read()
    if len(raw) != NLAT * NLON:
        raise ValueError(f'{path}: {len(raw)} bytes')
    return np.frombuffer(raw, dtype=np.int8).reshape(NLAT, NLON)


# ── Validation ────────────────────────────────────────────────────────────────
class Validator:
    """Rejects frames whose land mask or values don't look like OISST."""

    def __init__(self, ref_mask=None):
        self.ref_mask = ref_mask     # bool array, True = ocean

    def check(self, label, sst_dom, anom_dom):
        ocean = np.isfinite(anom_dom)
        frac = ocean.mean()
        if not 0.70 < frac < 0.95:
            return f'{label}: ocean fraction {frac:.3f} outside 0.70-0.95'
        if self.ref_mask is not None:
            diff = (ocean != self.ref_mask).mean()
            if diff > 0.01:
                return f'{label}: land mask differs from reference in {diff:.2%} of cells'
        s = sst_dom[np.isfinite(sst_dom)]
        if s.size and (s.min() < -2.5 or s.max() > 36.0):
            return f'{label}: SST range {s.min():.1f}..{s.max():.1f} implausible'
        a = anom_dom[ocean]
        m = float(np.mean(a))
        if abs(m) > 3.0:
            return f'{label}: domain-mean anomaly {m:+.2f} implausible'
        if np.mean(np.abs(a) > 6.35) > 0.002:
            return f'{label}: too many anomalies beyond the +/-6.35 encoding range'
        if self.ref_mask is None:
            self.ref_mask = ocean
        return None


# ── Climatology ───────────────────────────────────────────────────────────────
class DailyClim:
    def __init__(self, path):
        if not is_netcdf(path):
            raise ValueError('daily climatology is not a netCDF file')
        self.ds = open_nc(path)
        self.idx = month_day_index(self.ds)
        self.grid = GridMap(_coord(self.ds, 'lat', 'latitude'), _coord(self.ds, 'lon', 'longitude'))
        self.var = self.ds.variables['sst']
        self.cache = {}
        missing = [md for md in ((m, d) for m in range(1, 13)
                                 for d in range(1, calendar.monthrange(2001, m)[1] + 1))
                   if md not in self.idx]
        if missing:
            raise ValueError(f'daily climatology lacks {len(missing)} calendar days, e.g. {missing[:3]}')

    def band(self, month, day):
        key = (month, day)
        if key in self.cache:
            return self.cache[key]
        if key == (2, 29) and key not in self.idx:
            b = 0.5 * (self.band(2, 28) + self.band(3, 1))
        else:
            b = self.grid.band(read_2d(self.var, self.idx[key]))
        self.cache[key] = b
        return b


# ── Index ─────────────────────────────────────────────────────────────────────
def load_index(data_dir):
    p = os.path.join(data_dir, 'index.json')
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {'daily': [], 'monthly': []}


def save_index(data_dir, idx):
    idx['daily'] = sorted(idx['daily'], key=lambda e: e['d'])
    idx['monthly'] = sorted(idx['monthly'], key=lambda e: e['m'])
    idx['grid'] = {
        'nlat': NLAT, 'nlon': NLON, 'deg': DEG,
        'lat_first': LAT_N - DEG / 2, 'lon_first': LON_W + DEG / 2,
        'row_order': 'north_first', 'scale': SCALE, 'missing': MISSING,
    }
    idx['base'] = '1991-2020'
    idx['tropical_band'] = [-TROP, TROP]
    idx['source'] = 'NOAA OISST v2.1'
    h = hashlib.sha1(json.dumps([idx['daily'], idx['monthly']], sort_keys=True).encode()).hexdigest()
    changed = idx.get('version') != h[:12]
    idx['version'] = h[:12]
    if changed:
        idx['generated_at'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    p = os.path.join(data_dir, 'index.json')
    with open(p + '.tmp', 'w') as f:
        json.dump(idx, f, separators=(',', ':'))
    os.replace(p + '.tmp', p)
    return changed


# ── Daily ─────────────────────────────────────────────────────────────────────
def fetch_day(date, work):
    """Download one day, final preferred. Returns (path, prelim) or None if not posted.
    Download only -- safe to run in threads (netCDF parsing is not)."""
    ym, ymd = date.strftime('%Y%m'), date.strftime('%Y%m%d')
    for prelim, tmpl in ((0, DAILY_FINAL), (1, DAILY_PRELIM)):
        dest = os.path.join(work, f'{ymd}_{prelim}.nc')
        try:
            if download(tmpl.format(ym=ym, ymd=ymd), dest, max_time=120):
                return dest, prelim
        except Exception as e:  # noqa: BLE001
            fail(f'daily {date}: {e}')
            return None
    return None


def parse_day(date, path, prelim, clim, validator):
    try:
        if not is_netcdf(path):
            raise ValueError('not a netCDF file')
        ds = open_nc(path)
        g = GridMap(_coord(ds, 'lat'), _coord(ds, 'lon'))
        v = ds.variables['sst']
        sst = g.band(read_2d(v, (0, 0) if v.ndim == 4 else 0))
        ds.close()
        anom = sst - clim.band(date.month, date.day)
        label = f'daily {date}{" (prelim)" if prelim else ""}'
        err = validator.check(label, g.domain(sst), g.domain(anom))
        if err:
            fail(err)
            return None
        entry = {'d': date.isoformat(), 'p': prelim, 't': round(g.tropical_mean(anom), 3)}
        return entry, encode(g.domain(anom))
    except Exception as e:  # noqa: BLE001
        fail(f'daily {date}: {e}')
        return None
    finally:
        if os.path.exists(path):
            os.remove(path)


def window_start(today):
    return today - dt.timedelta(days=WINDOW_DAYS - 1)


def refresh_daily(data_dir, idx, clim, work, validator, bootstrap, today):
    have = {e['d']: e for e in idx['daily']}
    todo = []
    d, start = today, window_start(today)
    while d >= start:
        e = have.get(d.isoformat())
        recent = (today - d).days <= REFRESH_DAYS
        if e is None or (e['p'] and (recent or bootstrap)):
            todo.append(d)
        d -= dt.timedelta(days=1)
    if not bootstrap:
        recent_todo = [x for x in todo if (today - x).days <= REFRESH_DAYS]
        older = [x for x in todo if (today - x).days > REFRESH_DAYS][:MAX_NEW_PER_RUN]
        todo = recent_todo + older
    print(f'daily: {len(todo)} dates to check', flush=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        fetched = list(ex.map(lambda x: (x, fetch_day(x, work)), todo))

    updated = 0
    for date, got in sorted(fetched, key=lambda r: r[0], reverse=True):
        if got is None:
            continue
        res = parse_day(date, got[0], got[1], clim, validator)
        if res is None:
            continue
        entry, q = res
        old = have.get(entry['d'])
        if old and not old['p'] and entry['p']:
            continue           # never downgrade a final day
        write_frame(os.path.join(data_dir, 'daily', entry['d'] + '.bin.gz'), q)
        have[entry['d']] = entry
        updated += 1
    idx['daily'] = list(have.values())
    print(f'daily: {updated} frames written', flush=True)
    if idx['daily']:
        newest = max(dt.date.fromisoformat(e['d']) for e in idx['daily'])
        lag = (today - newest).days
        if lag > 5:
            fail(f'daily: newest day {newest} is {lag} days old -- source may have stopped updating')
    return updated


def derive_months(data_dir, idx):
    """Monthly frame = mean of that month's final daily frames (all days present)."""
    months_have = {e['m'] for e in idx['monthly']}
    by_month = {}
    for e in idx['daily']:
        by_month.setdefault(e['d'][:7], []).append(e)
    added = 0
    for ym, days in sorted(by_month.items()):
        if ym in months_have:
            continue
        y, m = int(ym[:4]), int(ym[5:])
        n = calendar.monthrange(y, m)[1]
        if len(days) != n or any(e['p'] for e in days):
            continue
        acc = np.zeros((NLAT, NLON))
        cnt = np.zeros((NLAT, NLON))
        for e in days:
            a = decode(read_frame(os.path.join(data_dir, 'daily', e['d'] + '.bin.gz')))
            ok = np.isfinite(a)
            acc[ok] += a[ok]
            cnt[ok] += 1
        mean = np.where(cnt == n, acc / np.maximum(cnt, 1), np.nan)
        write_frame(os.path.join(data_dir, 'monthly', ym + '.bin.gz'), encode(mean))
        idx['monthly'].append({'m': ym, 't': round(float(np.mean([e['t'] for e in days])), 3), 'src': 'daily'})
        added += 1
        print(f'monthly: derived {ym} from {n} final days', flush=True)
    return added


def prune_daily(data_dir, idx, today):
    cutoff = window_start(today)
    months_have = {e['m'] for e in idx['monthly']}
    keep = []
    for e in idx['daily']:
        d = dt.date.fromisoformat(e['d'])
        # only drop a day once its month is safely in the monthly archive
        if d < cutoff and e['d'][:7] in months_have:
            p = os.path.join(data_dir, 'daily', e['d'] + '.bin.gz')
            if os.path.exists(p):
                os.remove(p)
        else:
            keep.append(e)
    idx['daily'] = keep


# ── Monthly bootstrap ─────────────────────────────────────────────────────────
def bootstrap_monthly(data_dir, idx, cache, work, validator):
    mean_p = os.path.join(work, 'sst.mon.mean.nc')
    clim_p = os.path.join(cache, 'sst.mon.ltm.1991-2020.nc')
    for fname, p, t in ((MONTHLY_CLIM, clim_p, 900), (MONTHLY_MEAN, mean_p, 5400)):
        if os.path.exists(p) and is_netcdf(p) and fname != MONTHLY_MEAN:
            continue
        try:
            download_psl(fname, p, t)
        except Exception as e:  # noqa: BLE001
            fail(f'monthly bootstrap: {e}')
            return 0
    cds, mds = open_nc(clim_p), open_nc(mean_p)
    cg = GridMap(_coord(cds, 'lat'), _coord(cds, 'lon'))
    mg = GridMap(_coord(mds, 'lat'), _coord(mds, 'lon'))
    if cds.variables['sst'].shape[0] != 12:
        fail('monthly climatology does not have 12 steps')
        return 0
    clim = [cg.band(read_2d(cds.variables['sst'], i)) for i in range(12)]
    months = year_month_index(mds)
    have = {e['m']: e for e in idx['monthly']}
    added = 0
    for i, (y, m) in enumerate(months):
        ym = f'{y:04d}-{m:02d}'
        if ym in have and have[ym].get('src') == 'psl':
            continue
        sst = mg.band(read_2d(mds.variables['sst'], i))
        anom = sst - clim[m - 1]
        err = validator.check(f'monthly {ym}', mg.domain(sst), mg.domain(anom))
        if err:
            fail(err)
            continue
        write_frame(os.path.join(data_dir, 'monthly', ym + '.bin.gz'), encode(mg.domain(anom)))
        have[ym] = {'m': ym, 't': round(mg.tropical_mean(anom), 3), 'src': 'psl'}
        added += 1
    idx['monthly'] = list(have.values())
    cds.close()
    mds.close()
    os.remove(mean_p)                     # 2+ GB; not needed after bootstrap
    print(f'monthly: {added} frames written from PSL ({months[0]} .. {months[-1]})', flush=True)
    return added


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', required=True)
    ap.add_argument('--cache-dir', required=True)
    ap.add_argument('--work-dir', default='/tmp/sst')
    ap.add_argument('--bootstrap', action='store_true')
    args = ap.parse_args()
    for d in (args.data_dir, args.cache_dir, args.work_dir):
        os.makedirs(d, exist_ok=True)
    fail_file = os.path.join(args.work_dir, 'FAILURES')
    if os.path.exists(fail_file):
        os.remove(fail_file)

    today = (dt.date.fromisoformat(os.environ['SST_TODAY']) if os.environ.get('SST_TODAY')
             else dt.datetime.now(dt.timezone.utc).date())
    idx = load_index(args.data_dir)
    validator = Validator()
    bootstrap = args.bootstrap or not idx['monthly']

    clim_p = os.path.join(args.cache_dir, 'sst.day.mean.ltm.1991-2020.nc')
    try:
        if not (os.path.exists(clim_p) and is_netcdf(clim_p)):
            download_psl(DAILY_CLIM, clim_p, 5400)
        clim = DailyClim(clim_p)
    except Exception as e:  # noqa: BLE001
        fail(f'daily climatology: {e}')
        clim = None

    if bootstrap:
        try:
            bootstrap_monthly(args.data_dir, idx, args.cache_dir, args.work_dir, validator)
        except Exception as e:  # noqa: BLE001
            fail(f'monthly bootstrap: {e}')

    if clim is not None:
        refresh_daily(args.data_dir, idx, clim, args.work_dir, validator, bootstrap, today)
        derive_months(args.data_dir, idx)
        prune_daily(args.data_dir, idx, today)

    if idx['daily'] or idx['monthly']:
        changed = save_index(args.data_dir, idx)
        latest_d = max((e['d'] for e in idx['daily']), default='—')
        latest_m = max((e['m'] for e in idx['monthly']), default='—')
        print(f'✓ index: {len(idx["daily"])} daily (through {latest_d}), '
              f'{len(idx["monthly"])} monthly (through {latest_m}), changed={changed}')
        with open(os.path.join(args.work_dir, 'CHANGED'), 'w') as f:
            f.write('1' if changed else '0')

    if FAILURES:
        with open(fail_file, 'w') as f:
            f.write('\n'.join(FAILURES) + '\n')
        print(f'{len(FAILURES)} failure(s) recorded', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
