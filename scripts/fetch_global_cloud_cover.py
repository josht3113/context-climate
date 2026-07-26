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
The mean of "cloud_cover_mean" across all sampled points, for a given
month, approximates the true global-area-weighted mean.

Free-tier budget & resumability
--------------------------------
Open-Meteo's free/non-commercial tier is capped at 10,000 API "calls"
per day -- but per their own pricing FAQ, one HTTP request is NOT one
call once the date range gets long: "requests extending over a period
of more than 2 weeks for a single location are considered multiple API
calls" (their example: 4 weeks of data = 3.0 calls for one location).
A naive multi-decade request for many points blows the daily budget in
a single HTTP call and gets silently 429'd for the rest of the run.

So this script never asks for more than ~1 year of history per point
per request, tracks an *estimated* cost per request, and caps total
estimated cost per run well under the daily budget. A per-point,
per-month raw cache (--raw-cache, committed to the repo) lets a single
historical backfill span many scheduled runs: each run picks up the
oldest not-yet-fetched (year, location-group) unit where it left off.
The public output JSON is regenerated from whatever's in the cache on
every run, so the site's data set simply grows a little further back
in time with each run until the full history is filled in -- no
separate "backfill mode" to babysit.

Every run also does one cheap, low-cost refresh of the trailing lookback
window (default 90 days) so recent months stay current regardless of
how much of the deep backfill remains.

Usage (run from repo root):
  python scripts/fetch_global_cloud_cover.py \
      --out public/global-cloud-cover.json \
      --raw-cache data/global-cloud-cover-raw-cache.json
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
POINTS_PER_GROUP = 12          # points per HTTP request (doesn't affect metered cost, just round-trips)
BASELINE_START_YEAR = 1991     # WMO standard climate normal period
BASELINE_END_YEAR = 2020
DEFAULT_START_YEAR = 1980
DEFAULT_LOOKBACK_DAYS = 90     # trailing window refreshed every run, cheap & always current
DAILY_CALL_BUDGET = 10_000     # Open-Meteo free tier, documented
RUN_COST_CEILING = 8_500       # stay well under the daily cap; leaves margin for estimate error
REQUEST_TIMEOUT = 60
RETRY_LIMIT = 4
RETRY_BACKOFF_SEC = 5
REQUEST_DELAY_SEC = 1.0        # be polite to the free tier between calls
MAX_CONSECUTIVE_CHUNK_FAILURES = 2   # abort the run early rather than hammering a dead quota
USER_AGENT = "ContextClimate-DataPipeline/2.0 (contextclimate.io; contact via GitHub repo josht3113/context-climate)"

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


def point_groups(points, group_size):
    """Fixed partition of the point list into index-contiguous groups.
    Deterministic so cache lookups (by group index) stay stable run to run."""
    return [points[i:i + group_size] for i in range(0, len(points), group_size)]


# ---------------------------------------------------------------------
# Cost estimation (Open-Meteo meters by date-range length, not just
# request count -- see module docstring)
# ---------------------------------------------------------------------

def estimate_cost(n_points, start_date, end_date):
    days = (date.fromisoformat(end_date) - date.fromisoformat(start_date)).days + 1
    weeks = days / 7.0
    per_point = max(1.0, weeks - 1.0)   # matches Open-Meteo's documented example (2wk=1, 4wk=3)
    return n_points * per_point


# ---------------------------------------------------------------------
# API access
# ---------------------------------------------------------------------

def fetch_points_daily(points, start_date, end_date, session):
    """Fetch daily cloud_cover_mean for a batch of points over a date range.
    Returns dict[(lat, lon)] -> {date_str: value}, or None on persistent failure."""
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
        except Exception as e:  # noqa: BLE001 - retry on anything transient
            wait = RETRY_BACKOFF_SEC * attempt
            print(f"    request failed ({e}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    else:
        print(f"    giving up after {RETRY_LIMIT} attempts", file=sys.stderr)
        return None

    records = data if isinstance(data, list) else [data]
    out = {}
    for i, rec in enumerate(records):
        if i >= len(points):
            break
        key = points[i]
        if "error" in rec or "daily" not in rec:
            out[key] = {}
            continue
        times = rec["daily"].get("time", [])
        values = rec["daily"].get(VARIABLE, [])
        out[key] = {d: v for d, v in zip(times, values) if v is not None}
    return out


def daily_to_point_monthly(daily_by_date):
    """Collapse one point's {date: value} into {YYYY-MM: mean}."""
    by_month = {}
    for d, v in daily_by_date.items():
        by_month.setdefault(d[:7], []).append(v)
    return {m: sum(vs) / len(vs) for m, vs in by_month.items()}


# ---------------------------------------------------------------------
# Raw per-point-per-month cache (enables resumable backfill across runs)
# ---------------------------------------------------------------------

def load_raw_cache(path, points):
    point_key = [f"{lat},{lon}" for lat, lon in points]
    if os.path.exists(path):
        with open(path) as f:
            cache = json.load(f)
        if cache.get("point_key") == point_key:
            return cache
        print("Sample grid changed since last run -- resetting raw cache.", file=sys.stderr)
    return {"point_key": point_key, "point_monthly": {}}  # point_monthly[month][point_idx_str] = value


def save_raw_cache(path, cache):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f)


def set_point_month(cache, point_idx, month, value):
    cache["point_monthly"].setdefault(month, {})[str(point_idx)] = value


def unit_is_done(cache, year, group_indices, months):
    pm = cache["point_monthly"]
    for m in months:
        month_data = pm.get(m, {})
        for idx in group_indices:
            if str(idx) not in month_data:
                return False
    return True


# ---------------------------------------------------------------------
# Stats: climatology, anomaly, trend (unchanged math, still pure stdlib)
# ---------------------------------------------------------------------

def compute_climatology(monthly_means, baseline_start_year, baseline_end_year):
    by_cal_month = {m: [] for m in range(1, 13)}
    for ym, v in monthly_means.items():
        y = int(ym[:4])
        m = int(ym[5:7])
        if baseline_start_year <= y <= baseline_end_year:
            by_cal_month[m].append(v)
    return {m: (sum(vals) / len(vals) if vals else None) for m, vals in by_cal_month.items()}


def linear_trend(xs, ys):
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
        se_slope, ci = None, (None, None)
    else:
        mse = sse / dof
        se_slope = math.sqrt(mse / sxx)
        t95 = student_t_975(dof)
        ci = (slope - t95 * se_slope, slope + t95 * se_slope)

    return {
        "slope_per_year": slope, "intercept": intercept, "se_slope": se_slope,
        "ci95_low_per_year": ci[0], "ci95_high_per_year": ci[1],
        "r_squared": r_squared, "n": n,
    }


def student_t_975(dof):
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
# Derive the public-facing document from the raw cache
# ---------------------------------------------------------------------

def regenerate_derived(cache, points):
    pm = cache["point_monthly"]
    monthly_means, monthly_n = {}, {}
    for month, by_point in pm.items():
        vals = list(by_point.values())
        if vals:
            monthly_means[month] = sum(vals) / len(vals)
            monthly_n[month] = len(vals)

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

    by_year = {}
    for rec in monthly_records:
        by_year.setdefault(int(rec["date"][:4]), []).append(rec)

    annual_records = []
    for y in sorted(by_year):
        recs = by_year[y]
        complete = len(recs) == 12
        mean_pct = sum(r["mean_pct"] for r in recs) / len(recs)
        anomalies = [r["anomaly_pct"] for r in recs if r["anomaly_pct"] is not None]
        anomaly_pct = sum(anomalies) / len(anomalies) if anomalies else None
        annual_records.append({
            "year": y, "mean_pct": round(mean_pct, 3),
            "anomaly_pct": round(anomaly_pct, 3) if anomaly_pct is not None else None,
            "n_months": len(recs), "complete": complete,
        })

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
            "ci95_low_pct_per_decade": (round(trend_fit["ci95_low_per_year"] * 10, 4)
                                         if trend_fit["ci95_low_per_year"] is not None else None),
            "ci95_high_pct_per_decade": (round(trend_fit["ci95_high_per_year"] * 10, 4)
                                          if trend_fit["ci95_high_per_year"] is not None else None),
            "r_squared": round(trend_fit["r_squared"], 4) if trend_fit["r_squared"] is not None else None,
            "n_years": trend_fit["n"],
            "fit_year_range": [trend_years[0], trend_years[-1]] if trend_years else None,
        }

    return {
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
            "last_data_month": monthly_records[-1]["date"] if monthly_records else None,
            "last_updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "backfill_complete": is_backfill_complete(cache, points),
        },
        "monthly": monthly_records,
        "annual": annual_records,
        "trend": trend_out,
        "sample_points_geo": [[lat, lon] for lat, lon in points],
    }


def is_backfill_complete(cache, points):
    groups = point_groups(list(range(len(points))), POINTS_PER_GROUP)
    end_year = last_complete_month_end().year
    months_by_year = {y: [f"{y}-{m:02d}" for m in range(1, 13)] for y in range(DEFAULT_START_YEAR, end_year)}
    for y, months in months_by_year.items():
        for g in groups:
            if not unit_is_done(cache, y, g, months):
                return False
    return True


# ---------------------------------------------------------------------
# Run orchestration
# ---------------------------------------------------------------------

def last_complete_month_end(today=None):
    today = today or date.today()
    return date(today.year, today.month, 1) - timedelta(days=1)


def refresh_recent(cache, points, lookback_days, session, cost_budget):
    """Cheap, always-run refresh of the trailing window so recent months
    stay current. Returns (cost_spent, ok)."""
    end = last_complete_month_end().isoformat()
    start = (date.today() - timedelta(days=lookback_days)).isoformat()
    groups = point_groups(list(enumerate(points)), POINTS_PER_GROUP)

    spent = 0.0
    consecutive_failures = 0
    for group in groups:
        cost = estimate_cost(len(group), start, end)
        if spent + cost > cost_budget:
            print(f"  recent-window refresh: stopping early, would exceed budget", file=sys.stderr)
            break
        idxs = [i for i, _ in group]
        pts = [p for _, p in group]
        print(f"  recent refresh: {start}..{end}, {len(pts)} pts starting {pts[0]}", file=sys.stderr)
        result = fetch_points_daily(pts, start, end, session)
        spent += cost
        time.sleep(REQUEST_DELAY_SEC)
        if result is None:
            consecutive_failures += 1
            if consecutive_failures >= MAX_CONSECUTIVE_CHUNK_FAILURES:
                print("  too many consecutive failures, stopping recent-window refresh early", file=sys.stderr)
                return spent, False
            continue
        consecutive_failures = 0
        for idx, pt in zip(idxs, pts):
            monthly = daily_to_point_monthly(result.get(pt, {}))
            for month, val in monthly.items():
                set_point_month(cache, idx, month, val)
    return spent, True


def backfill_step(cache, points, session, cost_budget):
    """Spend up to cost_budget on the oldest not-yet-complete (year, group)
    units. Returns cost spent."""
    groups = point_groups(list(enumerate(points)), POINTS_PER_GROUP)
    end_year = last_complete_month_end().year  # exclude current in-progress year;
    start_year = DEFAULT_START_YEAR            # that's covered by refresh_recent instead

    spent = 0.0
    consecutive_failures = 0
    for year in range(start_year, end_year):
        months = [f"{year}-{m:02d}" for m in range(1, 13)]
        y_start, y_end = f"{year}-01-01", f"{year}-12-31"
        for group in groups:
            idxs = [i for i, _ in group]
            if unit_is_done(cache, year, idxs, months):
                continue
            cost = estimate_cost(len(group), y_start, y_end)
            if spent + cost > cost_budget:
                print(f"  backfill: budget reached ({spent:.0f}/{cost_budget}), "
                      f"stopping for this run", file=sys.stderr)
                return spent
            pts = [p for _, p in group]
            print(f"  backfill {year} group@{idxs[0]}: {len(pts)} pts, est. cost {cost:.0f}", file=sys.stderr)
            result = fetch_points_daily(pts, y_start, y_end, session)
            spent += cost
            time.sleep(REQUEST_DELAY_SEC)
            if result is None:
                consecutive_failures += 1
                print(f"    unit failed ({consecutive_failures} in a row)", file=sys.stderr)
                if consecutive_failures >= MAX_CONSECUTIVE_CHUNK_FAILURES:
                    print("  too many consecutive failures -- stopping backfill for this run "
                          "(will resume next run)", file=sys.stderr)
                    return spent
                continue
            consecutive_failures = 0
            for idx, pt in zip(idxs, pts):
                monthly = daily_to_point_monthly(result.get(pt, {}))
                for month, val in monthly.items():
                    set_point_month(cache, idx, month, val)
    return spent


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="public/global-cloud-cover.json")
    ap.add_argument("--raw-cache", default="data/global-cloud-cover-raw-cache.json")
    ap.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    ap.add_argument("--cost-budget", type=float, default=RUN_COST_CEILING)
    args = ap.parse_args()

    points = fibonacci_sphere_points(N_POINTS)
    cache = load_raw_cache(args.raw_cache, points)
    session = requests.Session()

    print(f"Refreshing trailing {args.lookback_days} days (all {N_POINTS} points)...", file=sys.stderr)
    recent_cost, _ = refresh_recent(cache, points, args.lookback_days, session, args.cost_budget)

    remaining_budget = max(0.0, args.cost_budget - recent_cost)
    print(f"Recent-window refresh used ~{recent_cost:.0f} est. calls; "
          f"{remaining_budget:.0f} left for backfill this run.", file=sys.stderr)

    backfill_cost = 0.0
    if remaining_budget > 0:
        backfill_cost = backfill_step(cache, points, session, remaining_budget)

    save_raw_cache(args.raw_cache, cache)

    doc = regenerate_derived(cache, points)
    if not doc["monthly"]:
        print("ERROR: no data in cache after this run, aborting without writing output.", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2)

    total_cost = recent_cost + backfill_cost
    print(f"\nWrote {args.out}: {len(doc['monthly'])} months, "
          f"{doc['metadata']['data_start']} to {doc['metadata']['last_data_month']}", file=sys.stderr)
    print(f"Backfill complete: {doc['metadata']['backfill_complete']}", file=sys.stderr)
    print(f"Estimated API cost this run: {total_cost:.0f} / {DAILY_CALL_BUDGET} daily budget", file=sys.stderr)
    if doc["trend"]:
        print(f"Trend: {doc['trend']['slope_pct_per_decade']} pct/decade "
              f"(95% CI {doc['trend']['ci95_low_pct_per_decade']} to "
              f"{doc['trend']['ci95_high_pct_per_decade']}, "
              f"n={doc['trend']['n_years']} complete years)", file=sys.stderr)


if __name__ == "__main__":
    main()
