#!/usr/bin/env python3
"""
Build the equatorial depth-section frames for pacific-sst-anomaly-map.html.

Source: NCEP GODAS potential temperature, averaged 2S-2N (cos-weighted),
cropped to 110E-75W and 0-459 m.

  Pentads  CPC GRIB1, https://ftp.cpc.ncep.noaa.gov/godas/pentad/YYYY/godas.P.YYYYMMDD.grb
           (filename date = LAST day of the 5-day mean). Rolling one-year window.
  Monthly  PSL OPeNDAP, https://psl.noaa.gov/thredds/dodsC/Datasets/godas/pottmp.YYYY.nc
           (time stamp = FIRST day of the month). 1980 onward.
  Clim     PSL OPeNDAP, .../godas/Derived/pottmp.mon.ltm.nc (1991-2020 monthly means).
           Pentad climatology = the monthly climatology linearly interpolated (periodic)
           to the pentad's centre day.

Output (written to --data-dir, published on the `godas-data` branch and copied
into public/godas/ by deploy.yml):

  index.json                  grid (lons, depths), frame lists, version
  pentad/YYYY-MM-DD.bin.gz    one frame per pentad (date = last day)
  monthly/YYYY-MM.bin.gz      one frame per month

Frame encoding: gzip of int16 little-endian [2][NDEP][NLON] -- plane 0 is
temperature, plane 1 the 1991-2020 climatology for the same period, both in
0.01 degC; -32768 = land / below sea floor. Anomaly = plane 0 - plane 1.

Failure policy: same as build_sst_data.py -- nothing that fails validation is
written; reasons go to <work>/FAILURES and the workflow fails after publishing.
"""
import argparse
import calendar
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_sst_data import download  # noqa: E402  (resumable, HTTP/1.1, retries on progress)

LON_W, LON_E = 110.0, 285.0
BAND = 2.0
MAX_DEPTH = 460.0              # keep levels to 459 m so 400 m can be interpolated
WINDOW_DAYS = 365
MAX_NEW_PENTADS = 25           # per non-bootstrap run
PENTAD_STALE_DAYS = 35         # CPC lag is ~16-21 days
MONTHLY_STALE_DAYS = 80        # PSL posts a month ~2-3 weeks after it ends
SCALE = 0.01
MISSING = -32768

_CPC = os.environ.get('GODAS_CPC_ROOT') or 'https://ftp.cpc.ncep.noaa.gov/godas/pentad'
_PSL = os.environ.get('GODAS_PSL_ROOT') or 'https://psl.noaa.gov/thredds/dodsC/Datasets/godas'
FIRST_YEAR = int(os.environ.get('GODAS_FIRST_YEAR', '1980'))

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print('✗ ' + msg, flush=True)


def is_local(root):
    return not root.startswith('http')


# ── Grid reduction ────────────────────────────────────────────────────────────
class Band:
    """Maps a GODAS lat/lon grid onto 2S-2N x 110E-75W, cos-weighted."""

    def __init__(self, lat, lon):
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64) % 360.0
        self.rows = np.where(np.abs(lat) < BAND)[0]
        self.cols = np.where((lon > LON_W) & (lon < LON_E))[0]
        if len(self.rows) < 6 or len(self.cols) < 150:
            raise ValueError(f'unexpected grid: {len(self.rows)} band rows, {len(self.cols)} cols')
        if np.any(np.diff(self.rows) != 1) or np.any(np.diff(self.cols) != 1):
            raise ValueError('band rows/cols are not contiguous')
        self.lons = lon[self.cols]
        self.w = np.cos(np.radians(lat[self.rows]))

    def reduce(self, arr):
        """arr[..., row, col] (NaN = missing) -> [..., col] weighted mean over band rows.
        A column needs half its weight valid, otherwise NaN."""
        a = arr[..., self.rows[0]:self.rows[-1] + 1, self.cols[0]:self.cols[-1] + 1]
        ok = np.isfinite(a)
        w = self.w[:, None]
        sw = (ok * w).sum(axis=-2)
        s = np.where(ok, a, 0.0) * w
        out = s.sum(axis=-2) / np.where(sw > 0, sw, 1)
        return np.where(sw >= 0.5 * self.w.sum(), out, np.nan)


# ── Encoding ──────────────────────────────────────────────────────────────────
def encode(temp, clim):
    out = np.full((2,) + temp.shape, MISSING, dtype='<i2')
    for k, a in enumerate((temp, clim)):
        ok = np.isfinite(a) & np.isfinite(temp) & np.isfinite(clim)
        out[k][ok] = np.clip(np.rint(a[ok] / SCALE), -32767, 32767)
    return out


def write_frame(path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = q.tobytes()
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        with gzip.GzipFile(fileobj=f, mode='wb', mtime=0, compresslevel=9) as gz:
            gz.write(raw)
    os.replace(tmp, path)
    return hashlib.sha1(raw).hexdigest()[:10]


def validate(label, temp, depths):
    """temp[depth, lon] in degC."""
    surf = temp[0]
    frac = np.isfinite(surf).mean()
    if frac < 0.75:
        return f'{label}: only {frac:.0%} of surface columns valid'
    v = temp[np.isfinite(temp)]
    if v.min() < -2.5 or v.max() > 34.0:
        return f'{label}: temperature range {v.min():.1f}..{v.max():.1f} degC implausible'
    m = float(np.nanmean(surf))
    if not 22.0 < m < 32.0:
        return f'{label}: equatorial surface mean {m:.2f} degC implausible'
    # the ocean must cool with depth at the equator
    if np.nanmean(temp[-1]) > m - 8.0:
        return f'{label}: no thermocline ({np.nanmean(temp[-1]):.1f} degC at {depths[-1]:.0f} m)'
    return None


# ── Climatology ───────────────────────────────────────────────────────────────
_NDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_START = np.concatenate([[0], np.cumsum(_NDAYS)[:-1]])
_MID = _START + np.array(_NDAYS) / 2.0          # month centres, 365-day year


def clim_weights(center):
    """Periodic linear interpolation weights between the 12 monthly climatologies,
    with each month's value placed at its centre (365-day year)."""
    day = min(center.day, 28) if center.month == 2 else center.day
    pos = (dt.date(2001, center.month, day) - dt.date(2001, 1, 1)).days + 0.5
    if pos < _MID[0]:
        m0, m1, a, b = 11, 0, _MID[11] - 365, _MID[0]
    elif pos >= _MID[11]:
        m0, m1, a, b = 11, 0, _MID[11], _MID[0] + 365
    else:
        m0 = int(np.searchsorted(_MID, pos, side='right') - 1)
        m1, a, b = m0 + 1, _MID[m0], _MID[m0 + 1]
    t = (pos - a) / (b - a)
    return [(m0, 1 - t), (m1, t)]


def load_clim(work):
    import netCDF4
    url = f'{_PSL}/Derived/pottmp.mon.ltm.nc'
    ds = netCDF4.Dataset(url)
    try:
        band = Band(ds['lat'][:], ds['lon'][:])
        lev = np.asarray(ds['level'][:], dtype=np.float64)
        k = np.where(lev <= MAX_DEPTH)[0]
        v = ds['pottmp']
        if v.shape[0] != 12:
            raise ValueError(f'climatology has {v.shape[0]} time steps, expected 12')
        cp = str(getattr(ds['time'], 'climo_period', ''))
        if cp and not (cp.startswith('1991') and '2020' in cp):
            raise ValueError(f'climatology period is {cp}, expected 1991-2020')
        raw = v[:, k[0]:k[-1] + 1, band.rows[0]:band.rows[-1] + 1, band.cols[0]:band.cols[-1] + 1]
        a = np.ma.filled(np.ma.asarray(raw).astype(np.float64), np.nan) - 273.15
        a[(a < -3) | (a > 40)] = np.nan
        sub = Band(np.asarray(ds['lat'][:])[band.rows], np.asarray(ds['lon'][:])[band.cols])
        clim = sub.reduce(a)                       # [12, depth, lon]
        print(f'✓ climatology {cp or "(period attr missing)"}: {clim.shape}', flush=True)
        return clim, lev[k], band.lons
    finally:
        ds.close()


# ── Monthly (PSL OPeNDAP) ────────────────────────────────────────────────────
def monthly_year(year, clim, depths, lons, data_dir, have, optional=False):
    import netCDF4
    url = f'{_PSL}/pottmp.{year}.nc'
    try:
        ds = netCDF4.Dataset(url)
    except Exception as e:  # noqa: BLE001
        if optional:
            # PSL creates a year's file once January is posted (~mid-February);
            # a real outage is caught by the staleness check instead
            print(f'monthly {year}: not posted yet', flush=True)
        else:
            fail(f'monthly {year}: cannot open {url}: {e}')
        return 0
    added = 0
    try:
        band = Band(ds['lat'][:], ds['lon'][:])
        lev = np.asarray(ds['level'][:], dtype=np.float64)
        k = np.where(lev <= MAX_DEPTH)[0]
        if not np.allclose(lev[k], depths) or not np.allclose(band.lons, lons):
            fail(f'monthly {year}: grid differs from the climatology grid')
            return 0
        t = ds['time']
        dates = netCDF4.num2date(t[:], t.units, getattr(t, 'calendar', 'standard'),
                                 only_use_cftime_datetimes=True)
        raw = ds['pottmp'][:, k[0]:k[-1] + 1, band.rows[0]:band.rows[-1] + 1,
                           band.cols[0]:band.cols[-1] + 1]
        a = np.ma.filled(np.ma.asarray(raw).astype(np.float64), np.nan) - 273.15
        a[(a < -3) | (a > 40)] = np.nan
        sub = Band(np.asarray(ds['lat'][:])[band.rows], np.asarray(ds['lon'][:])[band.cols])
        temps = sub.reduce(a)                      # [time, depth, lon]
        for i, d in enumerate(dates):
            ym = f'{d.year:04d}-{d.month:02d}'
            err = validate(f'monthly {ym}', temps[i], depths)
            if err:
                fail(err)
                continue
            h = write_frame(os.path.join(data_dir, 'monthly', ym + '.bin.gz'),
                            encode(temps[i], clim[d.month - 1]))
            if have.get(ym, {}).get('h') != h:
                added += 1
            have[ym] = {'m': ym, 'h': h}
    finally:
        ds.close()
    return added


# ── Pentads (CPC GRIB) ───────────────────────────────────────────────────────
PENTAD_RE = re.compile(r'godas\.P\.(\d{8})\.grb$')


def list_pentads(year, work):
    if is_local(_CPC):
        d = os.path.join(_CPC, str(year))
        names = os.listdir(d) if os.path.isdir(d) else []
    else:
        p = os.path.join(work, f'listing_{year}.html')
        if not download(f'{_CPC}/{year}/', p, max_time=60):
            return []
        with open(p, encoding='utf-8', errors='replace') as f:
            names = re.findall(r'href="([^"]+)"', f.read())
    out = []
    for n in names:
        m = PENTAD_RE.search(n)
        if m:
            s = m.group(1)
            out.append(dt.date(int(s[:4]), int(s[4:6]), int(s[6:])))
    return sorted(set(out))


def read_pentad_grib(path, depths, lons):
    """Potential temperature (GRIB1 table 2 parameter 13, level type 160 =
    depth below sea) -> [depth, lon] band mean in degC. Selected by raw GRIB1
    keys so it does not depend on eccodes' short-name tables."""
    import eccodes
    levels = {}
    band = None
    with open(path, 'rb') as f:
        while True:
            gid = eccodes.codes_grib_new_from_file(f)
            if gid is None:
                break
            try:
                # code-table keys come back as text ('dp') unless read as integers
                if (eccodes.codes_get_long(gid, 'indicatorOfParameter') != 13
                        or eccodes.codes_get_long(gid, 'indicatorOfTypeOfLevel') != 160):
                    continue
                lev = float(eccodes.codes_get_long(gid, 'level'))
                if lev > MAX_DEPTH:
                    continue
                ni, nj = eccodes.codes_get_long(gid, 'Ni'), eccodes.codes_get_long(gid, 'Nj')
                if band is None:
                    la = np.asarray(eccodes.codes_get_array(gid, 'latitudes')).reshape(nj, ni)[:, 0]
                    lo = np.asarray(eccodes.codes_get_array(gid, 'longitudes')).reshape(nj, ni)[0, :]
                    band = Band(la, lo)
                    if not np.allclose(band.lons, lons):
                        raise ValueError('pentad longitudes differ from the monthly grid')
                vals = np.asarray(eccodes.codes_get_values(gid), dtype=np.float64).reshape(nj, ni)
                if eccodes.codes_get_long(gid, 'bitmapPresent'):
                    vals[vals == eccodes.codes_get_double(gid, 'missingValue')] = np.nan
                vals[(vals < 260.0) | (vals > 315.0)] = np.nan
                levels[lev] = band.reduce(vals - 273.15)
            finally:
                eccodes.codes_release(gid)
    if band is None:
        raise ValueError('no potential-temperature messages found')
    got = np.array(sorted(levels))
    if len(got) != len(depths) or not np.allclose(got, depths):
        raise ValueError(f'depth levels {got.tolist()} differ from the monthly grid')
    return np.stack([levels[d] for d in got])


def pentad_clim(end, clim):
    centre = end - dt.timedelta(days=2)
    return sum(w * clim[m] for m, w in clim_weights(centre))


# ── Index ─────────────────────────────────────────────────────────────────────
def load_index(data_dir):
    p = os.path.join(data_dir, 'index.json')
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {'pentads': [], 'monthly': []}


def save_index(data_dir, idx, depths, lons):
    idx['pentads'] = sorted(idx['pentads'], key=lambda e: e['d'])
    idx['monthly'] = sorted(idx['monthly'], key=lambda e: e['m'])
    idx['grid'] = {
        'lons': [round(float(x), 3) for x in lons],
        'depths': [round(float(x), 1) for x in depths],
        'band': [-BAND, BAND], 'scale': SCALE, 'missing': MISSING,
        'layout': 'int16 LE [2][depth][lon]: temperature, 1991-2020 climatology',
    }
    idx['source'] = 'NCEP GODAS potential temperature (CPC pentads, PSL monthly)'
    idx['base'] = '1991-2020'
    idx['pentad_date'] = 'last day of the 5-day mean'
    h = hashlib.sha1(json.dumps([idx['pentads'], idx['monthly']], sort_keys=True).encode()).hexdigest()[:12]
    changed = idx.get('version') != h
    idx['version'] = h
    if changed:
        idx['generated_at'] = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    p = os.path.join(data_dir, 'index.json')
    with open(p + '.tmp', 'w') as f:
        json.dump(idx, f, separators=(',', ':'))
    os.replace(p + '.tmp', p)
    return changed


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', required=True)
    ap.add_argument('--work-dir', default='/tmp/godas')
    ap.add_argument('--bootstrap', action='store_true')
    args = ap.parse_args()
    for d in (args.data_dir, args.work_dir):
        os.makedirs(d, exist_ok=True)
    for n in ('FAILURES', 'CHANGED'):
        p = os.path.join(args.work_dir, n)
        if os.path.exists(p):
            os.remove(p)

    today = (dt.date.fromisoformat(os.environ['GODAS_TODAY']) if os.environ.get('GODAS_TODAY')
             else dt.datetime.now(dt.timezone.utc).date())
    idx = load_index(args.data_dir)
    bootstrap = args.bootstrap or not idx['monthly']

    try:
        clim, depths, lons = load_clim(args.work_dir)
    except Exception as e:  # noqa: BLE001
        fail(f'climatology: {e}')
        clim = None

    if clim is not None:
        # ── monthly
        have = {e['m']: e for e in idx['monthly']}
        years = range(FIRST_YEAR, today.year + 1) if bootstrap else (today.year - 1, today.year)
        n = sum(monthly_year(y, clim, depths, lons, args.data_dir, have, optional=(y == today.year))
                for y in years)
        idx['monthly'] = list(have.values())
        print(f'monthly: {n} new/changed frames, {len(have)} total', flush=True)

        # ── pentads
        start = today - dt.timedelta(days=WINDOW_DAYS - 1)
        listed = []
        for y in sorted({start.year, today.year}):
            try:
                listed += list_pentads(y, args.work_dir)
            except Exception as e:  # noqa: BLE001
                fail(f'pentad listing {y}: {e}')
        listed = [d for d in listed if start <= d <= today]
        havep = {e['d']: e for e in idx['pentads']}
        todo = [d for d in listed if d.isoformat() not in havep]
        if not bootstrap:
            todo = todo[-MAX_NEW_PENTADS:]
        print(f'pentads: {len(listed)} listed in window, {len(todo)} to fetch', flush=True)
        for d in todo:
            src = f'{_CPC}/{d.year}/godas.P.{d:%Y%m%d}.grb'
            dest = os.path.join(args.work_dir, f'p{d:%Y%m%d}.grb')
            try:
                if not download(src, dest, max_time=900):
                    fail(f'pentad {d}: listed but 404')
                    continue
                temp = read_pentad_grib(dest, depths, lons)
                err = validate(f'pentad {d}', temp, depths)
                if err:
                    fail(err)
                    continue
                h = write_frame(os.path.join(args.data_dir, 'pentad', d.isoformat() + '.bin.gz'),
                                encode(temp, pentad_clim(d, clim)))
                havep[d.isoformat()] = {'d': d.isoformat(), 'h': h}
                print(f'✓ pentad {d}', flush=True)
            except Exception as e:  # noqa: BLE001
                fail(f'pentad {d}: {e}')
            finally:
                if os.path.exists(dest):
                    os.remove(dest)
        # prune outside the window
        for k in [k for k in havep if dt.date.fromisoformat(k) < start]:
            p = os.path.join(args.data_dir, 'pentad', k + '.bin.gz')
            if os.path.exists(p):
                os.remove(p)
            del havep[k]
        idx['pentads'] = list(havep.values())

        # ── staleness
        if idx['pentads']:
            newest = max(dt.date.fromisoformat(e['d']) for e in idx['pentads'])
            if (today - newest).days > PENTAD_STALE_DAYS:
                fail(f'pentads: newest is {newest}, {(today - newest).days} days old')
        if idx['monthly']:
            y, m = map(int, max(e['m'] for e in idx['monthly']).split('-'))
            end = dt.date(y, m, calendar.monthrange(y, m)[1])
            if (today - end).days > MONTHLY_STALE_DAYS:
                fail(f'monthly: newest is {y}-{m:02d}, {(today - end).days} days past its end')

        if idx['pentads'] or idx['monthly']:
            changed = save_index(args.data_dir, idx, depths, lons)
            print(f'✓ index: {len(idx["pentads"])} pentads '
                  f'(through {max((e["d"] for e in idx["pentads"]), default="—")}), '
                  f'{len(idx["monthly"])} monthly '
                  f'(through {max((e["m"] for e in idx["monthly"]), default="—")}), changed={changed}',
                  flush=True)
            with open(os.path.join(args.work_dir, 'CHANGED'), 'w') as f:
                f.write('1' if changed else '0')

    if FAILURES:
        with open(os.path.join(args.work_dir, 'FAILURES'), 'w') as f:
            f.write('\n'.join(FAILURES) + '\n')
        print(f'{len(FAILURES)} failure(s) recorded', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
