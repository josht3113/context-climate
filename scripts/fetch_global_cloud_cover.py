#!/usr/bin/env python3
"""
fetch_global_cloud_cover.py
----------------------------------------------------------------------
Builds and maintains public/global-cloud-cover.json for ContextClimate.

Data source: Open-Meteo Historical Weather API, ERA5 reanalysis
(ECMWF / Copernicus Climate Change Service C3S), 0.25 deg, 1940-present,
free & keyless: https://open-meteo.com/en/docs/historical-weather-api

Method
------
A global mean cloud cover series can't be pulled from one endpoint --
Open-Meteo (like the underlying ERA5 archive) is point-based. Instead we
sample a fixed set of points spread evenly across the whole sphere
(land + ocean) using a Fibonacci-sphere lattice, which gives each point
roughly equal area coverage without any latitude-weighting math needed.
The unweighted mean of "cloud_cover_mean" across all points, for a given
day/month, approximates the true global-area-weighted mean.

Two modes:
  --mode backfill     Full history from --start (default 1980-01-01)
                       through the last complete month. Chunks requests
                       by location group AND by decade so payloads stay
                       reasonable. Run this once to seed the JSON file.
  --mode incremental   (default) Re-fetches only the trailing window
                       (default 90 days, covers ERA5's ~5 day publish
                       delay and any late revisions) and merges those
                       months into the existing JSON by date, then
                       recomputes annual stats + trend from the full
                       monthly series already on file. This is what the
                       weekly GitHub Actions run uses.

Usage (run from repo root):
  python scripts/fetch_global_cloud_cover.py --mode backfill --out public/global-cloud-cover.json
  python scripts/fetch_global_cloud_cover.py --mode incremental --out public/global-cloud-cover.json
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

API_URL = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5"
VARIABLE = "cloud_cover_mean"
N_POINTS = 144
LOCATION_CHUNK = 12          # lat/lon pairs per request
BACKFILL_YEAR_CHUNK = 10     # years per request window during backfill
BASELINE_START_YEAR = 1991   # WMO standard climate normal period
BASELINE_END_YEAR = 2020
DEFAULT_START = "1980-01-01"
REQUEST_TIMEOUT = 60
RETRY_LIMIT = 4
RETRY_BACKOFF_SEC = 5
REQUEST_DELAY_SEC = 1.2      # be polite to the free tier between calls
USER_AGENT = "ContextClimate-DataPipeline/1.0 (contextclimate.io; contact via GitHub repo josht3113/context-climate)"

CITATION = (
    "Hersbach, H. et al. (2023). ERA5 hourly data on single levels from 1940 "
    "to present. ECMWF/Copernicus Climate Change Service (C3S). "
    "https://doi.org/10.24381/cds.adbb2d47 -- served via Open-Meteo.com "
    "(Zippenfenig, P., 2023, https://doi.org/10.5281/ZENODO.7970649)"
)


# ---------------------------------------------------------------------
# Sampling grid
# ---------------------------------------------------------------------

def fibonacci_sphere_points(n):
    """n roughly-equal-area (lat, lon) points spread over the whole sphere."""
    points = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))  # ~2.399963 rad
    for i in range(n):
        y = 1 - (2 * i) / (n - 1)          # y goes from 1 down to -1
        lat = math.degrees(math.asin(max(-1.0, min(1.0, y))))
        theta = golden_angle * i
        lon = math.degrees(theta)
        lon = ((lon + 180) % 360) - 180     # wrap to [-180, 180)
        points.append((round(lat, 4), round(lon, 4)))
    return points


def chunk(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


# ---------------------------------------------------------------------
# API access
# ---------------------------------------------------------------------

def fetch_chunk(points, start_date, end_date, session):
    """Fetch daily cloud_cover_mean for a batch of points over a date range.
    Returns dict[(lat, lon)] -> list of (date_str, value_or_None)."""
    lats = ",".join(str(p[0]) for p in points)
    lons = ",".join(str(p[1]) for p in points)
    params = {
        "latitude": lats,
        "longitude": lons,
        "start_date": start_date,
        "end_date": end_date,
        "daily": VARIABLE,
        "timezone": "UTC",
        "models": MODEL,
        "cell_selection": "nearest",
    }

    last_err = None
    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            resp = session.get(API_URL, params=params, timeout=REQUEST_TIMEOUT,
                                headers={"User-Agent": USER_AGENT})
            if resp.status_code == 429:
                wait = RETRY_BACKOFF_SEC * attempt
                print(f"    rate limited, waiting {wait}s (attempt {attempt})", file=sys.stderr)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:  # noqa: BLE001 - want to retry on anything transient
            last_err = e
            wait = RETRY_BACKOFF_SEC * attempt
            print(f"    request failed ({e}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    else:
        print(f"    giving up on chunk after {RETRY_LIMIT} attempts: {last_err}", file=sys.stderr)
        return {}

    # Single location -> dict; multiple -> list of dicts (same order as input)
    records = data if isinstance(data, list) else [data]
    out = {}
    for i, rec in enumerate(records):
        if i >= len(points):
            break
        key = points[i]
        if "error" in rec or "daily" not in rec:
            out[key] = []
            continue
        times = rec["daily"].get("time", [])
        values = rec["daily"].get(VARIABLE, [])
        out[key] = list(zip(times, values))
    return out


def fetch_all(points, start_date, end_date, year_chunk_size=None):
    """Fetch a date range for all points, chunked by location (and
    optionally by year window, for large backfills)."""
    session = requests.Session()
    per_point_daily = {p: {} for p in points}
    location_groups = list(chunk(points, LOCATION_CHUNK))

    if year_chunk_size:
        date_windows = list(year_windows(start_date, end_date, year_chunk_size))
    else:
        date_windows = [(start_date, end_date)]

    total = len(location_groups) * len(date_windows)
    done = 0
    for w_start, w_end in date_windows:
        for group in location_groups:
            done += 1
            print(f"  [{done}/{total}] {w_start}..{w_end}  "
                  f"{len(group)} pts starting {group[0]}", file=sys.stderr)
            result = fetch_chunk(group, w_start, w_end, session)
            for key, series in result.items():
                for d, v in series:
                    if v is not None:
                        per_point_daily[key][d] = v
            time.sleep(REQUEST_DELAY_SEC)
    return per_point_daily


def year_windows(start_date, end_date, years_per_window):
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    cur = start
    while cur <= end:
        window_end = min(date(cur.year + years_per_window - 1, 12, 31), end)
        yield cur.isoformat(), window_end.isoformat()
        cur = date(window_end.year + 1, 1, 1)


# ---------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------

def daily_to_monthly_global(per_point_daily):
    """Collapse per-point daily series into a global monthly mean:
    day -> mean across points -> month -> mean across days in month."""
    # daily global mean, keyed by YYYY-MM-DD
    days = set()
    for series in per_point_daily.values():
        days.update(series.keys())

    daily_global = {}
    daily_n = {}
    for d in days:
        vals = [series[d] for series in per_point_daily.values() if d in series]
        if vals:
            daily_global[d] = sum(vals) / len(vals)
            daily_n[d] = len(vals)

    monthly = {}
    monthly_n = {}
    by_month = {}
    for d, v in daily_global.items():
        month = d[:7]
        by_month.setdefault(month, []).append(v)
        monthly_n[month] = monthly_n.get(month, 0) + 1
    for month, vals in by_month.items():
        monthly[month] = sum(vals) / len(vals)

    return monthly, monthly_n


# ---------------------------------------------------------------------
# Stats: climatology, anomaly, trend
# ---------------------------------------------------------------------

def compute_climatology(monthly_means, baseline_start_year, baseline_end_year):
    """Mean value for each calendar month (01-12) over the baseline period."""
    by_cal_month = {m: [] for m in range(1, 13)}
    for ym, v in monthly_means.items():
        y = int(ym[:4])
        m = int(ym[5:7])
        if baseline_start_year <= y <= baseline_end_year:
            by_cal_month[m].append(v)
    climo = {}
    for m, vals in by_cal_month.items():
        climo[m] = sum(vals) / len(vals) if vals else None
    return climo


def linear_trend(xs, ys):
    """OLS slope/intercept + standard error + 95% CI + R^2, pure Python/stdlib math."""
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    sxx = sum((x - mean_x) ** 2 for x in xs)
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    if sxx == 0:
        return None
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x

    resid = [y - (slope * x + intercept) for x, y in zip(xs, ys)]
    sse = sum(r ** 2 for r in resid)
    sst = sum((y - mean_y) ** 2 for y in ys)
    r_squared = 1 - sse / sst if sst > 0 else None

    dof = n - 2
    if dof <= 0:
        se_slope = None
        ci = (None, None)
    else:
        mse = sse / dof
        se_slope = math.sqrt(mse / sxx)
        # t critical value for 95% CI, two-tailed -- static table fallback
        # to avoid a scipy dependency; good enough for dof >= 10, and the
        # backfill will always have dof well above that.
        t95 = student_t_975(dof)
        ci = (slope - t95 * se_slope, slope + t95 * se_slope)

    return {
        "slope_per_year": slope,
        "intercept": intercept,
        "se_slope": se_slope,
        "ci95_low_per_year": ci[0],
        "ci95_high_per_year": ci[1],
        "r_squared": r_squared,
        "n": n,
    }


def student_t_975(dof):
    """Approximate two-tailed 95% t critical value without scipy.
    Converges to 1.96 (normal) for large dof; small lookup table covers
    the low-dof cases that could plausibly occur for very short series."""
    table = {
        1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
        6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
        15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021,
        60: 2.000, 120: 1.980,
    }
    if dof in table:
        return table[dof]
    keys = sorted(table)
    if dof < keys[0]:
        return table[keys[0]]
    if dof > keys[-1]:
        return 1.96
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= dof <= hi:
            frac = (dof - lo) / (hi - lo)
            return table[lo] + frac * (table[hi] - table[lo])
    return 1.96


# ---------------------------------------------------------------------
# Build output document
# ---------------------------------------------------------------------

def build_document(monthly_means, monthly_n, points):
    climo = compute_climatology(monthly_means, BASELINE_START_YEAR, BASELINE_END_YEAR)

    monthly_records = []
    for ym in sorted(monthly_means):
        cal_month = int(ym[5:7])
        mean_pct = monthly_means[ym]
        base = climo.get(cal_month)
        anomaly = (mean_pct - base) if base is not None else None
        monthly_records.append({
            "date": ym,
            "mean_pct": round(mean_pct, 3),
            "anomaly_pct": round(anomaly, 3) if anomaly is not None else None,
            "n_points": monthly_n.get(ym),
        })

    # Annual aggregates -- require all 12 months present to call a year "complete"
    by_year = {}
    for rec in monthly_records:
        y = int(rec["date"][:4])
        by_year.setdefault(y, []).append(rec)

    annual_records = []
    for y in sorted(by_year):
        recs = by_year[y]
        complete = len(recs) == 12
        mean_pct = sum(r["mean_pct"] for r in recs) / len(recs)
        anomalies = [r["anomaly_pct"] for r in recs if r["anomaly_pct"] is not None]
        anomaly_pct = sum(anomalies) / len(anomalies) if anomalies else None
        annual_records.append({
            "year": y,
            "mean_pct": round(mean_pct, 3),
            "anomaly_pct": round(anomaly_pct, 3) if anomaly_pct is not None else None,
            "n_months": len(recs),
            "complete": complete,
        })

    # Trend from complete years only, on the anomaly series
    trend_years = [r["year"] for r in annual_records if r["complete"] and r["anomaly_pct"] is not None]
    trend_vals = [r["anomaly_pct"] for r in annual_records if r["complete"] and r["anomaly_pct"] is not None]
    trend_fit = linear_trend(trend_years, trend_vals)

    trend_out = None
    if trend_fit:
        trend_out = {
            "basis": "OLS fit of annual global cloud-cover anomaly (%) vs. year, complete years only",
            "slope_pct_per_decade": round(trend_fit["slope_per_year"] * 10, 4),
            "slope_pct_per_year": round(trend_fit["slope_per_year"], 6),
            "intercept_pct": round(trend_fit["intercept"], 6),
            "ci95_low_pct_per_decade": (
                round(trend_fit["ci95_low_per_year"] * 10, 4)
                if trend_fit["ci95_low_per_year"] is not None else None
            ),
            "ci95_high_pct_per_decade": (
                round(trend_fit["ci95_high_per_year"] * 10, 4)
                if trend_fit["ci95_high_per_year"] is not None else None
            ),
            "r_squared": round(trend_fit["r_squared"], 4) if trend_fit["r_squared"] is not None else None,
            "n_years": trend_fit["n"],
            "fit_year_range": [trend_years[0], trend_years[-1]] if trend_years else None,
        }

    last_month = monthly_records[-1]["date"] if monthly_records else None

    doc = {
        "metadata": {
            "title": "Global Mean Cloud Cover (ERA5 reanalysis, grid-sampled)",
            "source": "Open-Meteo Historical Weather API -- ERA5 reanalysis (ECMWF / Copernicus C3S)",
            "citation": CITATION,
            "method": (
                f"{N_POINTS}-point Fibonacci-sphere equal-area global sample "
                f"(land + ocean), ERA5 0.25° reanalysis, daily cloud_cover_mean "
                f"averaged across points then across days in each month."
            ),
            "variable": "cloud_cover_mean (total cloud cover, % area fraction, 0-100)",
            "sample_points": N_POINTS,
            "baseline_period": f"{BASELINE_START_YEAR}-{BASELINE_END_YEAR}",
            "data_start": monthly_records[0]["date"] if monthly_records else None,
            "last_data_month": last_month,
            "last_updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "monthly": monthly_records,
        "annual": annual_records,
        "trend": trend_out,
        "sample_points_geo": [[lat, lon] for lat, lon in points],
    }
    return doc


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

def last_complete_month_end(today=None):
    today = today or date.today()
    first_of_this_month = date(today.year, today.month, 1)
    last_month_end = first_of_this_month - timedelta(days=1)
    return last_month_end


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--mode", choices=["backfill", "incremental"], default="incremental")
    ap.add_argument("--start", default=DEFAULT_START, help="Backfill start date (YYYY-MM-DD)")
    ap.add_argument("--lookback-days", type=int, default=90,
                     help="Incremental mode: how many days back to re-fetch/merge")
    ap.add_argument("--out", default="public/global-cloud-cover.json")
    args = ap.parse_args()

    points = fibonacci_sphere_points(N_POINTS)
    end = last_complete_month_end().isoformat()

    if args.mode == "backfill":
        print(f"Backfilling {N_POINTS} points from {args.start} to {end}...", file=sys.stderr)
        per_point_daily = fetch_all(points, args.start, end, year_chunk_size=BACKFILL_YEAR_CHUNK)
        monthly_means, monthly_n = daily_to_monthly_global(per_point_daily)
    else:
        existing = {"monthly": []}
        if os.path.exists(args.out):
            with open(args.out) as f:
                existing = json.load(f)
        existing_monthly = {r["date"]: r["mean_pct"] for r in existing.get("monthly", [])}
        existing_n = {r["date"]: r.get("n_points") for r in existing.get("monthly", [])}

        window_start = (date.today() - timedelta(days=args.lookback_days)).isoformat()
        print(f"Incremental refresh: {N_POINTS} points, {window_start} to {end}...", file=sys.stderr)
        per_point_daily = fetch_all(points, window_start, end, year_chunk_size=None)
        fresh_monthly, fresh_n = daily_to_monthly_global(per_point_daily)

        monthly_means = {**existing_monthly, **fresh_monthly}
        monthly_n = {**existing_n, **fresh_n}

        if not fresh_monthly:
            print("WARNING: incremental fetch returned no data; leaving existing file untouched.",
                  file=sys.stderr)
            if existing.get("monthly"):
                sys.exit(0)

    if not monthly_means:
        print("ERROR: no data collected, aborting without writing output.", file=sys.stderr)
        sys.exit(1)

    doc = build_document(monthly_means, monthly_n, points)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2)

    print(f"Wrote {args.out}: {len(doc['monthly'])} months, "
          f"{doc['metadata']['data_start']} to {doc['metadata']['last_data_month']}", file=sys.stderr)
    if doc["trend"]:
        print(f"Trend: {doc['trend']['slope_pct_per_decade']} pct/decade "
              f"(95% CI {doc['trend']['ci95_low_pct_per_decade']} to "
              f"{doc['trend']['ci95_high_pct_per_decade']}, "
              f"n={doc['trend']['n_years']} complete years)", file=sys.stderr)


if __name__ == "__main__":
    main()
