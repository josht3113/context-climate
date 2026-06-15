#!/usr/bin/env python3
"""
fetch_ersst_initial.py
======================
One-time script to generate public/pacific-sst-anomalies.json from NOAA ERSSTv5.
Run from the repo root after installing dependencies:

    pip install netCDF4 numpy

    python scripts/fetch_ersst_initial.py

Downloads individual monthly netCDF files from NCEI (~400 KB each, ~560 files total).
Takes roughly 10-20 minutes depending on connection speed.
The script can be safely interrupted and re-run; already-processed months are skipped
if a partial output file exists.

Output: public/pacific-sst-anomalies.json (~8-10 MB)
"""

import json
import os
import sys
import tempfile
import time
import urllib.request
from datetime import date

import numpy as np
from netCDF4 import Dataset

# ── Geographic bounds (0-360 longitude) ────────────────────────────────────────
# ERSSTv5 grid: lats at -88,-86,...,88 (2° step); lons at 0,2,...,358 (2° step)
# Our Pacific region: lats -24 to 24, lons 110 to 284
LAT_MIN, LAT_MAX = -24, 24
LON_MIN, LON_MAX = 110, 284

START_YEAR, START_MONTH = 1980, 1

NCEI_URL = (
    'https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf/'
    'ersst.v5.{yyyymm}.nc'
)
OUT_PATH = os.path.join('public', 'pacific-sst-anomalies.json')
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds between retries


def end_month():
    """Latest month with published data (approximately 2-month lag)."""
    now = date.today()
    m, y = now.month - 2, now.year
    if m <= 0:
        m += 12
        y -= 1
    return y, m


def fetch_one_month(year, month):
    """Download ersst.v5.YYYYMM.nc and return (flat_values, lats, lons).

    flat_values is a list of floats (or None for land) in row-major order
    [lat0·lon0, lat0·lon1, ..., latN·lonN].
    lats and lons are 1-D Python lists.
    """
    yyyymm = f'{year}{month:02d}'
    url = NCEI_URL.format(yyyymm=yyyymm)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with tempfile.NamedTemporaryFile(suffix='.nc', delete=False) as tmp:
                tmp_path = tmp.name
            urllib.request.urlretrieve(url, tmp_path)
            break
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(f'Download failed after {MAX_RETRIES} tries: {exc}')
            time.sleep(RETRY_DELAY)

    try:
        ds = Dataset(tmp_path)
        lats_all = ds.variables['lat'][:]
        lons_all = ds.variables['lon'][:]
        # ssta shape: [time=1, lev=1, lat, lon]
        ssta_all = ds.variables['ssta'][0, 0, :, :]
        ds.close()
    finally:
        os.unlink(tmp_path)

    # Subset to our Pacific region
    lat_idx = np.where((lats_all >= LAT_MIN) & (lats_all <= LAT_MAX))[0]
    lon_idx = np.where((lons_all >= LON_MIN) & (lons_all <= LON_MAX))[0]

    lats = [float(lats_all[i]) for i in lat_idx]
    lons = [float(lons_all[i]) for i in lon_idx]

    region = ssta_all[np.ix_(lat_idx, lon_idx)]  # shape [nlat, nlon]

    flat = []
    for v in region.flatten():
        try:
            fv = float(v)
            if np.isnan(fv) or (hasattr(v, 'mask') and bool(v.mask)):
                flat.append(None)
            else:
                flat.append(round(fv, 2))
        except Exception:
            flat.append(None)

    return flat, lats, lons


def month_index(y, m):
    return (y - START_YEAR) * 12 + (m - START_MONTH)


def main():
    end_y, end_m = end_month()
    total = month_index(end_y, end_m) + 1
    print(f'ERSSTv5 initial fetch: {START_YEAR}-{START_MONTH:02d} → {end_y}-{end_m:02d} ({total} months)')

    # Load any existing partial output so we can resume
    existing_months = []
    existing_lats = None
    existing_lons = None
    if os.path.exists(OUT_PATH):
        print(f'Found existing {OUT_PATH} — resuming from where it left off.')
        with open(OUT_PATH) as f:
            existing = json.load(f)
        existing_months = existing.get('months', [])
        existing_lats   = existing.get('lats')
        existing_lons   = existing.get('lons')

    months = list(existing_months)  # copy so we can extend
    lats = existing_lats
    lons = existing_lons

    n_skip   = len(months)
    n_fetch  = total - n_skip
    n_done   = 0
    n_errors = 0

    if n_skip:
        print(f'Skipping {n_skip} already-processed months.')

    for offset in range(n_skip, total):
        total_m  = START_MONTH - 1 + offset
        year     = START_YEAR + total_m // 12
        month    = total_m % 12 + 1
        n_done  += 1

        sys.stdout.write(
            f'\r[{n_done}/{n_fetch}] Fetching {year}-{month:02d}...'
            f'  (errors: {n_errors})'
        )
        sys.stdout.flush()

        try:
            flat, lats, lons = fetch_one_month(year, month)
            months.append(flat)
        except Exception as exc:
            print(f'\n  WARNING: {year}-{month:02d} failed — {exc}')
            months.append(None)
            n_errors += 1

        # Save incrementally every 12 months so progress isn't lost
        if n_done % 12 == 0 or offset == total - 1:
            _write(months, lats, lons)

    print(f'\nDone. {total} months processed, {n_errors} errors.')
    _write(months, lats, lons)
    size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
    print(f'Output: {OUT_PATH}  ({size_mb:.1f} MB)')


def _write(months, lats, lons):
    os.makedirs('public', exist_ok=True)
    out = {
        'source':    'NOAA ERSSTv5 · NCEI · ssta anomaly vs 1971-2000 climatology',
        'generated': date.today().isoformat(),
        'start':     [START_YEAR, START_MONTH],
        'lats':      lats,
        'lons':      lons,
        'months':    months,
    }
    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, separators=(',', ':'))


if __name__ == '__main__':
    main()
