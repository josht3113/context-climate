#!/usr/bin/env python3
"""
update_ersst_monthly.py
=======================
Called daily by the GitHub Actions workflow. Appends any new ERSSTv5 months
to public/pacific-sst-anomalies.json and exits. If already up to date, exits
cleanly without modifying the file (so the commit step produces no diff).

TARGETING: we always aim for the previous calendar month. NCEI typically
publishes a month's file within the first 1-2 weeks of the following month
(e.g. June's file appears in early July). If the file isn't published yet,
the download 404s, we exit without changes, and the same month is retried
automatically on the next daily run — so new data lands on the site within
~24 hours of NCEI publishing it. (The old version assumed a fixed 2-month
publication lag, which delayed every month's data by ~3 extra weeks.)

If a fetch fails partway through for transient reasons, no placeholder is
written, so the same month is retried on the next run rather than being
permanently skipped.

Requires: netCDF4 numpy  (installed by the workflow)
"""

import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date

import numpy as np
from netCDF4 import Dataset

DATA_FILE = os.path.join('public', 'pacific-sst-anomalies.json')
NCEI_URL  = (
    'https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf/'
    'ersst.v5.{yyyymm}.nc'
)
MAX_RETRIES = 3


class NotPublishedYet(Exception):
    """Raised when NCEI returns 404 — the month simply isn't out yet."""


def target_month():
    """Return (year, month) of the previous calendar month — the newest
    month that could possibly be published."""
    now = date.today()
    m, y = now.month - 1, now.year
    if m == 0:
        m, y = 12, y - 1
    return y, m


def fetch_ssta(year, month, lats_target, lons_target):
    """Download one monthly netCDF and return the flat ssta list for our region.

    Raises NotPublishedYet on HTTP 404 (no retries — the file just isn't
    out yet); retries transient failures up to MAX_RETRIES.
    """
    yyyymm = f'{year}{month:02d}'
    url    = NCEI_URL.format(yyyymm=yyyymm)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with tempfile.NamedTemporaryFile(suffix='.nc', delete=False) as tmp:
                tmp_path = tmp.name
            urllib.request.urlretrieve(url, tmp_path)
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise NotPublishedYet(f'{yyyymm} not published on NCEI yet')
            if attempt == MAX_RETRIES:
                raise RuntimeError(f'Download failed: {exc}')
            time.sleep(5)
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(f'Download failed: {exc}')
            time.sleep(5)

    try:
        ds       = Dataset(tmp_path)
        lats_all = ds.variables['lat'][:]
        lons_all = ds.variables['lon'][:]
        ssta_all = ds.variables['ssta'][0, 0, :, :]   # [time, lev, lat, lon]
        ds.close()
    finally:
        os.unlink(tmp_path)

    lat_idx = np.where(np.isin(np.round(lats_all.data, 1), np.round(lats_target, 1)))[0]
    lon_idx = np.where(np.isin(np.round(lons_all.data, 1), np.round(lons_target, 1)))[0]
    region  = ssta_all[np.ix_(lat_idx, lon_idx)]

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
    return flat


def idx_to_ym(start_y, start_m, idx):
    total = (start_m - 1) + idx
    return start_y + total // 12, total % 12 + 1


def main():
    if not os.path.exists(DATA_FILE):
        print(f'ERROR: {DATA_FILE} not found. Run fetch_ersst_initial.py first.', file=sys.stderr)
        sys.exit(1)

    with open(DATA_FILE) as f:
        data = json.load(f)

    start_y, start_m = data['start']
    lats = np.array(data['lats'])
    lons = np.array(data['lons'])

    n_existing  = len(data['months'])
    last_y, last_m = idx_to_ym(start_y, start_m, n_existing - 1)

    tgt_y, tgt_m = target_month()

    if (tgt_y, tgt_m) <= (last_y, last_m):
        print(f'Already up to date through {last_y}-{last_m:02d}. Nothing to do.')
        return

    # Advance one month past the last entry
    next_m, next_y = last_m + 1, last_y
    if next_m > 12:
        next_m, next_y = 1, next_y + 1

    added = 0
    m, y  = next_m, next_y
    while (y, m) <= (tgt_y, tgt_m):
        print(f'Fetching {y}-{m:02d}...', flush=True)
        try:
            flat = fetch_ssta(y, m, lats, lons)
            data['months'].append(flat)
            added += 1
        except NotPublishedYet:
            print(f'{y}-{m:02d} not published on NCEI yet — will retry on next daily run.')
            break
        except Exception as exc:
            print(f'WARNING: {y}-{m:02d} failed — {exc}. Will retry on next run.', file=sys.stderr)
            break

        m += 1
        if m > 12:
            m, y = 1, y + 1

    if added:
        data['generated'] = date.today().isoformat()
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        print(f'Added {added} month(s). File updated.')
    else:
        print('No new months successfully fetched.')


if __name__ == '__main__':
    main()
