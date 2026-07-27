#!/usr/bin/env python3
"""
update_global_temp.py

Self-hosted data pipeline for the "Global Temperature in Context" tool
(public/global-temperature-context.html).

Fetches the ERA5 daily 2-meter world air temperature series published by
Climate Reanalyzer (University of Maine) — same reanalysis and update
cadence as Copernicus C3S's own "Climate Pulse" dashboard, but exposed as
a plain JSON file with no auth wall:

    https://climatereanalyzer.org/clim/t2_daily/json/era5_world_t2_day.json

Record: 1 Jan 1940 – present. Updates once daily, ERA5 final data lagging
today by ~6 days.

Output: public/data/global-temp-daily.json — consumed by the standalone
HTML tool via a same-origin fetch(), same self-hosted-JSON pattern as the
sea-ice / sunspot pipelines.

Run: python scripts/update_global_temp.py
Requires: requests, numpy  (pip install requests numpy)
"""

import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

SOURCE_URL = "https://climatereanalyzer.org/clim/t2_daily/json/era5_world_t2_day.json"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "global-temp-daily.json"

N_DAYS = 366  # fixed day-of-year template; Climate Reanalyzer's own JSON is
              # already emitted on this 366-slot grid (Feb 29 synthesized in
              # non-leap years) so every year's array lines up by calendar
              # date without extra leap-year bookkeeping here.

BASELINE_YEARS = range(1991, 2021)  # WMO 1991-2020 normal period
PREINDUSTRIAL_OFFSET_C = 0.88
# Copernicus C3S's published estimate: the ERA5 1991-2020 global mean is
# 0.88C above the 1850-1900 (IPCC AR6) preindustrial baseline. Applied as a
# flat shift to the whole seasonal cycle — the same simplification C3S uses
# in its own monthly bulletins and Climate Pulse tool.
# https://climate.copernicus.eu/why-do-we-keep-talking-about-15degc-and-2degc-above-pre-industrial-era

MIN_YEARS_FOR_PERCENTILE = 15

# --- ONI (Oceanic Nino Index) snapshot, NOAA CPC -----------------------------
# Static snapshot, refreshed occasionally by hand — same pattern as the
# ThreadEx station roster (rather than scraping CPC's HTML on every run,
# which is fragile and unnecessary since ENSO state only needs to be
# "roughly current," not real-time).
#
# Source: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php
# Row = year, columns = [DJF, JFM, FMA, MAM, AMJ, MJJ, JJA, JAS, ASO, SON, OND, NDJ]
# Snapshot pulled: 2026-07-27 (through MAM 2026; NOAA updates by the 5th of
# each month). TO REFRESH: revisit the URL above and paste the new rows in.
ONI_TABLE = {
    1950: [-1.5,-1.3,-1.2,-1.2,-1.1,-0.9,-0.5,-0.4,-0.4,-0.4,-0.6,-0.8],
    1951: [-0.8,-0.5,-0.2,0.2,0.4,0.6,0.7,0.9,1.0,1.2,1.0,0.8],
    1952: [0.5,0.4,0.3,0.3,0.2,0.0,-0.1,0.0,0.2,0.1,0.0,0.1],
    1953: [0.4,0.6,0.6,0.7,0.8,0.8,0.7,0.7,0.8,0.8,0.8,0.8],
    1954: [0.8,0.5,0.0,-0.4,-0.5,-0.5,-0.6,-0.8,-0.9,-0.8,-0.7,-0.7],
    1955: [-0.7,-0.6,-0.7,-0.8,-0.8,-0.7,-0.7,-0.7,-1.1,-1.4,-1.7,-1.5],
    1956: [-1.1,-0.8,-0.6,-0.5,-0.5,-0.5,-0.6,-0.6,-0.5,-0.4,-0.4,-0.4],
    1957: [-0.2,0.1,0.4,0.7,0.9,1.1,1.3,1.3,1.3,1.4,1.5,1.7],
    1958: [1.8,1.7,1.3,0.9,0.7,0.6,0.6,0.4,0.4,0.4,0.5,0.6],
    1959: [0.6,0.6,0.5,0.3,0.2,-0.1,-0.2,-0.3,-0.1,0.0,0.0,0.0],
    1960: [-0.1,-0.1,-0.1,0.0,0.0,0.0,0.1,0.2,0.3,0.2,0.1,0.1],
    1961: [0.0,0.0,0.0,0.1,0.2,0.3,0.1,-0.1,-0.3,-0.3,-0.2,-0.2],
    1962: [-0.2,-0.2,-0.2,-0.3,-0.3,-0.2,0.0,-0.1,-0.1,-0.2,-0.3,-0.4],
    1963: [-0.4,-0.2,0.2,0.3,0.3,0.5,0.9,1.1,1.2,1.3,1.4,1.3],
    1964: [1.1,0.6,0.1,-0.3,-0.6,-0.6,-0.6,-0.7,-0.8,-0.8,-0.8,-0.8],
    1965: [-0.6,-0.3,-0.1,0.2,0.5,0.8,1.2,1.5,1.9,2.0,2.0,1.7],
    1966: [1.4,1.2,1.0,0.7,0.4,0.2,0.2,0.1,-0.1,-0.1,-0.2,-0.3],
    1967: [-0.4,-0.5,-0.5,-0.4,-0.2,0.0,0.0,-0.2,-0.3,-0.4,-0.3,-0.4],
    1968: [-0.6,-0.7,-0.6,-0.4,0.0,0.3,0.6,0.5,0.4,0.5,0.7,1.0],
    1969: [1.1,1.1,0.9,0.8,0.6,0.4,0.4,0.5,0.8,0.9,0.8,0.6],
    1970: [0.5,0.3,0.3,0.2,0.0,-0.3,-0.6,-0.8,-0.8,-0.7,-0.9,-1.1],
    1971: [-1.4,-1.4,-1.1,-0.8,-0.7,-0.7,-0.8,-0.8,-0.8,-0.9,-1.0,-0.9],
    1972: [-0.7,-0.4,0.1,0.4,0.7,0.9,1.1,1.4,1.6,1.8,2.1,2.1],
    1973: [1.8,1.2,0.5,-0.1,-0.5,-0.9,-1.1,-1.3,-1.5,-1.7,-1.9,-2.0],
    1974: [-1.8,-1.6,-1.2,-1.0,-0.9,-0.8,-0.5,-0.4,-0.4,-0.6,-0.8,-0.6],
    1975: [-0.5,-0.6,-0.7,-0.7,-0.8,-1.0,-1.1,-1.2,-1.4,-1.4,-1.6,-1.7],
    1976: [-1.6,-1.2,-0.7,-0.5,-0.3,0.0,0.2,0.4,0.6,0.8,0.9,0.8],
    1977: [0.7,0.6,0.3,0.2,0.2,0.3,0.4,0.4,0.6,0.7,0.8,0.8],
    1978: [0.7,0.4,0.1,-0.2,-0.3,-0.3,-0.4,-0.4,-0.4,-0.3,-0.1,0.0],
    1979: [0.0,0.1,0.2,0.3,0.2,0.0,0.0,0.2,0.3,0.5,0.5,0.6],
    1980: [0.6,0.5,0.3,0.4,0.5,0.5,0.3,0.0,-0.1,0.0,0.1,0.0],
    1981: [-0.3,-0.5,-0.5,-0.4,-0.3,-0.3,-0.3,-0.2,-0.2,-0.1,-0.2,-0.1],
    1982: [0.0,0.1,0.2,0.5,0.7,0.7,0.8,1.1,1.6,2.0,2.2,2.2],
    1983: [2.2,1.9,1.5,1.3,1.1,0.7,0.3,-0.1,-0.5,-0.8,-1.0,-0.9],
    1984: [-0.6,-0.4,-0.3,-0.4,-0.5,-0.4,-0.3,-0.2,-0.2,-0.6,-0.9,-1.1],
    1985: [-1.0,-0.8,-0.8,-0.8,-0.8,-0.6,-0.5,-0.5,-0.4,-0.3,-0.3,-0.4],
    1986: [-0.5,-0.5,-0.3,-0.2,-0.1,0.0,0.2,0.4,0.7,0.9,1.1,1.2],
    1987: [1.2,1.2,1.1,0.9,1.0,1.2,1.5,1.7,1.6,1.5,1.3,1.1],
    1988: [0.8,0.5,0.1,-0.3,-0.9,-1.3,-1.3,-1.1,-1.2,-1.5,-1.8,-1.8],
    1989: [-1.7,-1.4,-1.1,-0.8,-0.6,-0.4,-0.3,-0.3,-0.2,-0.2,-0.2,-0.1],
    1990: [0.1,0.2,0.3,0.3,0.3,0.3,0.3,0.4,0.4,0.3,0.4,0.4],
    1991: [0.4,0.3,0.2,0.3,0.5,0.6,0.7,0.6,0.6,0.8,1.2,1.5],
    1992: [1.7,1.6,1.5,1.3,1.1,0.7,0.4,0.1,-0.1,-0.2,-0.3,-0.1],
    1993: [0.1,0.3,0.5,0.7,0.7,0.6,0.3,0.3,0.2,0.1,0.0,0.1],
    1994: [0.1,0.1,0.2,0.3,0.4,0.4,0.4,0.4,0.6,0.7,1.0,1.1],
    1995: [1.0,0.7,0.5,0.3,0.1,0.0,-0.2,-0.5,-0.8,-1.0,-1.0,-1.0],
    1996: [-0.9,-0.8,-0.6,-0.4,-0.3,-0.3,-0.3,-0.3,-0.4,-0.4,-0.4,-0.5],
    1997: [-0.5,-0.4,-0.1,0.3,0.8,1.2,1.6,1.9,2.1,2.3,2.4,2.4],
    1998: [2.2,1.9,1.4,1.0,0.5,-0.1,-0.8,-1.1,-1.3,-1.4,-1.5,-1.6],
    1999: [-1.5,-1.3,-1.1,-1.0,-1.0,-1.0,-1.1,-1.1,-1.2,-1.3,-1.5,-1.7],
    2000: [-1.7,-1.4,-1.1,-0.8,-0.7,-0.6,-0.6,-0.5,-0.5,-0.6,-0.7,-0.7],
    2001: [-0.7,-0.5,-0.4,-0.3,-0.3,-0.1,-0.1,-0.1,-0.2,-0.3,-0.3,-0.3],
    2002: [-0.1,0.0,0.1,0.2,0.4,0.7,0.8,0.9,1.0,1.2,1.3,1.1],
    2003: [0.9,0.6,0.4,0.0,-0.3,-0.2,0.1,0.2,0.3,0.3,0.4,0.4],
    2004: [0.4,0.3,0.2,0.2,0.2,0.3,0.5,0.6,0.7,0.7,0.7,0.7],
    2005: [0.6,0.6,0.4,0.4,0.3,0.1,-0.1,-0.1,-0.1,-0.3,-0.6,-0.8],
    2006: [-0.9,-0.8,-0.6,-0.4,-0.1,0.0,0.1,0.3,0.5,0.8,0.9,0.9],
    2007: [0.7,0.2,-0.1,-0.3,-0.4,-0.5,-0.6,-0.8,-1.1,-1.3,-1.5,-1.6],
    2008: [-1.6,-1.5,-1.3,-1.0,-0.8,-0.6,-0.4,-0.2,-0.2,-0.4,-0.6,-0.7],
    2009: [-0.8,-0.8,-0.6,-0.3,0.0,0.3,0.5,0.6,0.7,1.0,1.4,1.6],
    2010: [1.5,1.2,0.8,0.4,-0.2,-0.7,-1.0,-1.3,-1.6,-1.6,-1.6,-1.5],
    2011: [-1.3,-1.0,-0.8,-0.6,-0.5,-0.4,-0.4,-0.6,-0.8,-1.0,-1.0,-0.9],
    2012: [-0.7,-0.6,-0.5,-0.4,-0.2,0.1,0.3,0.4,0.4,0.3,0.1,-0.1],
    2013: [-0.3,-0.3,-0.2,-0.2,-0.3,-0.3,-0.4,-0.3,-0.2,-0.1,-0.1,-0.2],
    2014: [-0.3,-0.3,-0.1,0.2,0.3,0.2,0.1,0.1,0.3,0.5,0.7,0.8],
    2015: [0.7,0.6,0.7,0.8,1.0,1.3,1.6,1.9,2.2,2.5,2.6,2.8],
    2016: [2.6,2.3,1.7,1.0,0.5,0.0,-0.3,-0.5,-0.6,-0.6,-0.6,-0.5],
    2017: [-0.2,0.0,0.2,0.3,0.4,0.4,0.2,-0.1,-0.3,-0.6,-0.8,-0.9],
    2018: [-0.8,-0.7,-0.6,-0.4,-0.1,0.1,0.1,0.3,0.5,0.8,1.0,0.9],
    2019: [0.9,0.9,0.8,0.8,0.6,0.5,0.3,0.2,0.2,0.4,0.6,0.7],
    2020: [0.6,0.6,0.5,0.3,0.0,-0.2,-0.4,-0.5,-0.8,-1.1,-1.2,-1.1],
    2021: [-0.9,-0.8,-0.7,-0.5,-0.4,-0.3,-0.3,-0.4,-0.6,-0.8,-0.9,-0.9],
    2022: [-0.8,-0.8,-0.9,-1.0,-0.9,-0.8,-0.8,-0.9,-1.0,-0.9,-0.8,-0.7],
    2023: [-0.5,-0.3,0.0,0.3,0.6,0.8,1.1,1.4,1.6,1.8,2.0,2.1],
    2024: [1.9,1.6,1.3,0.8,0.5,0.2,0.1,-0.1,-0.2,-0.2,-0.3,-0.4],
    2025: [-0.4,-0.2,-0.1,0.0,0.0,0.0,-0.1,-0.3,-0.4,-0.5,-0.6,-0.5],
    2026: [-0.4,-0.1,0.1,0.5],  # partial year — through MAM as of snapshot date
}
EL_NINO_THRESHOLD = 0.5
LA_NINA_THRESHOLD = -0.5

# Curated fallback in case the live fetch or JSON shape ever changes
# unexpectedly — script still exits 0 with the previous good file untouched
# rather than clobbering it with garbage.
YEAR_NAME_RE = re.compile(r"^(19[4-9]\d|20\d\d)$")


def fetch_source_json():
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "contextclimate.io data pipeline"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
    return json.loads(raw)


def parse_series(raw):
    """
    Normalize Climate Reanalyzer's JSON into {year: [366 floats-or-None]}.
    The feed's rows are typically {"name": <year or label>, "data": <366
    comma-joined values as a string, OR already a list>}. Trailing rows are
    summary series (e.g. "1991-2020 mean", "maximum", "minimum") — filtered
    out by requiring name to be a bare 4-digit year rather than assuming a
    fixed number of trailing rows (robust to Climate Reanalyzer adding or
    removing summary rows).
    """
    years = {}
    for row in raw:
        name = str(row.get("name", "")).strip()
        if not YEAR_NAME_RE.match(name):
            continue
        data = row.get("data")
        if isinstance(data, str):
            parts = data.split(",")
        elif isinstance(data, list):
            parts = data
        else:
            continue
        vals = []
        for p in parts:
            if p is None:
                vals.append(None)
                continue
            s = str(p).strip()
            if s == "" or s.lower() in ("null", "nan"):
                vals.append(None)
                continue
            try:
                v = float(s)
            except ValueError:
                vals.append(None)
                continue
            # sanity bound — global daily mean 2m temp is never outside this
            vals.append(v if -40.0 < v < 40.0 else None)
        # pad/truncate to the fixed 366-slot template
        if len(vals) < N_DAYS:
            vals = vals + [None] * (N_DAYS - len(vals))
        elif len(vals) > N_DAYS:
            vals = vals[:N_DAYS]
        years[int(name)] = vals
    return years


def classify_enso(year):
    vals = ONI_TABLE.get(year)
    if not vals:
        return "unclassified"
    mean = sum(vals) / len(vals)
    if mean >= EL_NINO_THRESHOLD:
        return "el_nino"
    if mean <= LA_NINA_THRESHOLD:
        return "la_nina"
    return "neutral"


def day_of_year_dates():
    """366 ISO date strings on a fixed leap-year template (2024) so Plotly
    can treat the x-axis as real dates and auto-format month ticks, while
    the underlying series is just day-of-year indexed."""
    d = date(2024, 1, 1)
    out = []
    for _ in range(N_DAYS):
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def build_output(years):
    all_year_nums = sorted(years.keys())
    if not all_year_nums:
        raise RuntimeError("No valid year rows parsed from source JSON")

    arr = {y: np.array([np.nan if v is None else v for v in years[y]]) for y in all_year_nums}

    # Per-day percentiles / median across full record
    p10 = np.full(N_DAYS, np.nan)
    p50 = np.full(N_DAYS, np.nan)
    p90 = np.full(N_DAYS, np.nan)
    for day_idx in range(N_DAYS):
        col = np.array([arr[y][day_idx] for y in all_year_nums])
        col = col[~np.isnan(col)]
        if len(col) >= MIN_YEARS_FOR_PERCENTILE:
            p10[day_idx] = np.percentile(col, 10)
            p50[day_idx] = np.percentile(col, 50)
            p90[day_idx] = np.percentile(col, 90)

    # 1991-2020 baseline
    baseline_9120 = np.full(N_DAYS, np.nan)
    baseline_years_present = [y for y in BASELINE_YEARS if y in arr]
    for day_idx in range(N_DAYS):
        col = np.array([arr[y][day_idx] for y in baseline_years_present])
        col = col[~np.isnan(col)]
        if len(col) > 0:
            baseline_9120[day_idx] = np.mean(col)

    baseline_1850 = baseline_9120 - PREINDUSTRIAL_OFFSET_C

    # current (most recent) year + completeness
    current_year = all_year_nums[-1]
    valid_days_current = int(np.sum(~np.isnan(arr[current_year])))
    is_partial = valid_days_current < 360

    last_valid_idx = None
    for i in range(N_DAYS - 1, -1, -1):
        if not np.isnan(arr[current_year][i]):
            last_valid_idx = i
            break
    dates_template = day_of_year_dates()
    data_through = dates_template[last_valid_idx].replace("2024", str(current_year)) if last_valid_idx is not None else None
    lag_days = None
    if data_through:
        lag_days = (datetime.now(timezone.utc).date() - date.fromisoformat(data_through)).days

    # annual means for ranking "notable years" (exclude the in-progress year)
    annual_means = {}
    for y in all_year_nums:
        col = arr[y][~np.isnan(arr[y])]
        if len(col) >= 300:
            annual_means[y] = float(np.mean(col))
    ranked = sorted(annual_means.items(), key=lambda kv: kv[1], reverse=True)
    notable_years = [str(y) for y, _ in ranked[:6]]
    if str(current_year) not in notable_years:
        notable_years.append(str(current_year))

    out_years = {}
    for y in all_year_nums:
        rounded = [None if np.isnan(v) else round(float(v), 2) for v in arr[y]]
        entry = {"t": rounded, "enso": classify_enso(y)}
        if y == current_year and is_partial:
            entry["partial"] = True
        out_years[str(y)] = entry

    output = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "ECMWF ERA5 (Copernicus C3S) via Climate Reanalyzer, University of Maine",
        "source_url": "https://climatereanalyzer.org/clim/t2_daily/?dm_id=world",
        "period_of_record": f"{all_year_nums[0]}-{current_year}",
        "data_through": data_through,
        "lag_days": lag_days,
        "units": "C",
        "x_dates": dates_template,
        "baseline_1991_2020": [None if np.isnan(v) else round(float(v), 3) for v in baseline_9120],
        "baseline_1850_1900": [None if np.isnan(v) else round(float(v), 3) for v in baseline_1850],
        "preindustrial_offset_c": PREINDUSTRIAL_OFFSET_C,
        "percentile_10": [None if np.isnan(v) else round(float(v), 3) for v in p10],
        "median": [None if np.isnan(v) else round(float(v), 3) for v in p50],
        "percentile_90": [None if np.isnan(v) else round(float(v), 3) for v in p90],
        "notable_years": notable_years,
        "current_year": str(current_year),
        "years": out_years,
        "enso_methodology": (
            "Calendar-year mean of NOAA CPC's Oceanic Nino Index (ONI) across "
            "available 3-month seasons. El Nino >= +0.5C, La Nina <= -0.5C, "
            "else Neutral. Years before 1950 predate the ONI record and are "
            "shown unclassified."
        ),
    }
    return output


def main():
    print(f"Fetching {SOURCE_URL} ...")
    raw = fetch_source_json()
    years = parse_series(raw)
    print(f"Parsed {len(years)} year rows ({min(years)}-{max(years)})")
    output = build_output(years)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUTPUT_PATH} ({size_kb:.1f} KB)")
    print(f"  data_through={output['data_through']}  lag_days={output['lag_days']}")
    print(f"  notable_years={output['notable_years']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
