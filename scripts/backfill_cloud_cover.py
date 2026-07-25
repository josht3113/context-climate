#!/usr/bin/env python3
"""
Cloud Cover Explorer -- historical backfill / monthly update script.

Fetches hourly sky-condition observations from the IEM ASOS request
archive (mesonet.agron.iastate.edu) for every station listed in
public/cloud-cover/stations.json, computes a monthly "overcast %"
value per station, and writes/updates one JSON file per station in
public/cloud-cover/data/<STATION_ID>.json.

Methodology (validated against Josh's original Islip/KISP spreadsheet,
Jan 1988: script computes 33.7%, source spreadsheet reports 34.3% --
a 0.6-point gap consistent with minor differences in which reports the
original pull included):

  For every routine hourly METAR (report_type=3) in a calendar month,
  take the maximum cloud coverage code across the reported layers
  (skyc1..skyc4), using the scale CLR/SKC < FEW < SCT < BKN < OVC/VV.
  "Overcast" = the max code for that observation is OVC or VV
  (indefinite ceiling / sky obscured, e.g. fog -- climatologically
  equivalent to total overcast). The monthly value is:

      100 * (# overcast obs) / (# obs with any valid sky report)

  This is NOT average cloud-cover fraction and NOT "BKN or higher" --
  both of those were tested against the source data and came out far
  off (BKN+OVC combined gave 50.6% for the same month). Only the
  OVC/VV-only definition matched.

Usage:
    python backfill_cloud_cover.py --stations ISP,ORD,PHX
    python backfill_cloud_cover.py --stations all --start-year 1988
    python backfill_cloud_cover.py --stations all --update-latest-only

Designed to run inside GitHub Actions (see .github/workflows/
cloud-cover-backfill.yml and cloud-cover-monthly-update.yml), where
network egress to mesonet.agron.iastate.edu is unrestricted. It is
intentionally conservative about request rate (SLEEP_SECONDS between
requests) to stay a good citizen of IEM's free public archive.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import date, timedelta

IEM_BASE = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
COVERAGE_ORDER = {"CLR": 0, "SKC": 0, "FEW": 1, "SCT": 2, "BKN": 3, "OVC": 4, "VV": 4}
SLEEP_SECONDS = 2.0          # politeness delay between IEM requests
CHUNK_YEARS = 5              # years per HTTP request (script-side, no truncation issue)
REQUEST_TIMEOUT = 120
DEFAULT_START_YEAR = 1973    # IEM's ASOS archive predates ASOS commissioning for many
                              # first-order stations via merged legacy human obs; if a
                              # station has no data this far back the fetch just returns
                              # an (almost) empty CSV for those early chunks -- harmless.

# Paths are relative to the CURRENT WORKING DIRECTORY, not this script's
# location -- GitHub Actions `run:` steps execute from the repo root by
# default, so invoke this as `python scripts/backfill_cloud_cover.py` from
# the repo root (exactly what both workflow YAMLs do). Adjust here if you
# reorganize the repo layout.
STATIONS_FILE = os.path.join("public", "cloud-cover", "stations.json")
DATA_DIR = os.path.join("public", "cloud-cover", "data")


def log(msg):
    print(msg, flush=True)


def fetch_csv(station, year1, year2):
    """Pull one station's routine-METAR sky-condition CSV for [year1, year2)."""
    params = {
        "station": station,
        "data": "skyc1,skyc2,skyc3,skyc4",
        "year1": year1, "month1": 1, "day1": 1,
        "year2": year2, "month2": 1, "day2": 1,
        "tz": "Etc/UTC",
        "format": "onlycomma",
        "latlon": "no",
        "missing": "M",
        "trace": "T",
        "direct": "no",
        "report_type": 3,
    }
    url = IEM_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "ContextClimate-CloudCoverBackfill/1.0"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return text


def parse_monthly(csv_text):
    """Aggregate raw CSV text into {(year, month): [n_valid, n_overcast]}."""
    buckets = {}
    lines = csv_text.splitlines()
    if not lines:
        return buckets
    header = lines[0].split(",")
    try:
        idx_valid = header.index("valid")
        idx_sky = [header.index(f"skyc{i}") for i in range(1, 5)]
    except ValueError:
        return buckets

    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) <= max(idx_sky):
            continue
        valid = parts[idx_valid]
        # valid format: "YYYY-MM-DD HH:MM"
        try:
            y = int(valid[0:4])
            m = int(valid[5:7])
        except (ValueError, IndexError):
            continue

        codes = []
        for i in idx_sky:
            layer = parts[i].strip()
            if layer in ("", "M"):
                continue
            codes.append(COVERAGE_ORDER.get(layer, -1))
        if not codes:
            continue

        key = (y, m)
        if key not in buckets:
            buckets[key] = [0, 0]
        buckets[key][0] += 1
        if max(codes) == 4:
            buckets[key][1] += 1

    return buckets


def load_existing(station_id):
    path = os.path.join(DATA_DIR, f"{station_id}.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {"id": station_id, "updated": None, "monthly": []}


def save_station(station_id, record):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{station_id}.json")
    record["monthly"].sort(key=lambda r: (r["y"], r["m"]))
    record["updated"] = date.today().isoformat()
    with open(path, "w") as f:
        json.dump(record, f, separators=(",", ":"))
    log(f"  -> wrote {path} ({len(record['monthly'])} months)")


def current_incomplete_month():
    """Return (year, month) of the current, not-yet-complete month -- never backfilled."""
    today = date.today()
    return (today.year, today.month)


def backfill_station(station_id, start_year, end_year_exclusive, force=False):
    log(f"[{station_id}] backfilling {start_year}-{end_year_exclusive - 1}")
    record = load_existing(station_id)
    have_months = {(r["y"], r["m"]) for r in record["monthly"]}
    skip_key = current_incomplete_month()

    year = start_year
    while year < end_year_exclusive:
        chunk_end = min(year + CHUNK_YEARS, end_year_exclusive)
        try:
            csv_text = fetch_csv(station_id, year, chunk_end)
        except Exception as e:
            log(f"  ! fetch failed for {station_id} {year}-{chunk_end}: {e}")
            year = chunk_end
            time.sleep(SLEEP_SECONDS)
            continue

        buckets = parse_monthly(csv_text)
        added = 0
        for (y, m), (n_valid, n_ovc) in buckets.items():
            if (y, m) == skip_key:
                continue  # never store an in-progress month
            if (y, m) in have_months and not force:
                continue
            if n_valid < 200:
                # too few obs this month to trust (station gap, late commissioning, etc.)
                continue
            pct = round(100 * n_ovc / n_valid, 1)
            record["monthly"] = [r for r in record["monthly"] if (r["y"], r["m"]) != (y, m)]
            record["monthly"].append({"y": y, "m": m, "pct": pct, "n": n_valid})
            have_months.add((y, m))
            added += 1
        log(f"  {year}-{chunk_end}: +{added} months")
        year = chunk_end
        time.sleep(SLEEP_SECONDS)

    save_station(station_id, record)
    return record


def update_latest_month(station_id):
    """Lightweight monthly-cron path: fetch just the last ~40 days, update current + prior month."""
    today = date.today()
    start = today - timedelta(days=40)
    record = load_existing(station_id)
    have = {(r["y"], r["m"]) for r in record["monthly"]}
    skip_key = current_incomplete_month()
    try:
        csv_text = fetch_csv(station_id, start.year, today.year + 1)
    except Exception as e:
        log(f"  ! update fetch failed for {station_id}: {e}")
        return
    # fetch_csv above pulls a whole year range if start/today span a year boundary edge case;
    # cheap and infrequent enough (monthly cron) that this isn't worth over-optimizing.
    buckets = parse_monthly(csv_text)
    changed = False
    for (y, m), (n_valid, n_ovc) in buckets.items():
        if (y, m) == skip_key or n_valid < 200:
            continue
        if start.year <= y <= today.year and abs((date(y, m, 1) - start).days) > 400:
            continue
        pct = round(100 * n_ovc / n_valid, 1)
        record["monthly"] = [r for r in record["monthly"] if (r["y"], r["m"]) != (y, m)]
        record["monthly"].append({"y": y, "m": m, "pct": pct, "n": n_valid})
        changed = True
    if changed:
        save_station(station_id, record)
    else:
        log(f"[{station_id}] no new complete month yet")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stations", default="all", help="Comma-separated station IDs, or 'all'")
    ap.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    ap.add_argument("--end-year", type=int, default=date.today().year + 1)
    ap.add_argument("--force", action="store_true", help="Re-fetch months already present")
    ap.add_argument("--update-latest-only", action="store_true",
                     help="Monthly-cron mode: only refresh the most recent completed month")
    args = ap.parse_args()

    with open(STATIONS_FILE) as f:
        all_stations = json.load(f)
    all_ids = [s["id"] for s in all_stations]

    if args.stations == "all":
        targets = all_ids
    else:
        targets = [s.strip().upper() for s in args.stations.split(",") if s.strip()]
        unknown = [s for s in targets if s not in all_ids]
        if unknown:
            log(f"WARNING: not in stations.json (fetching anyway): {unknown}")

    log(f"Processing {len(targets)} station(s)")
    for sid in targets:
        if args.update_latest_only:
            update_latest_month(sid)
        else:
            backfill_station(sid, args.start_year, args.end_year, force=args.force)

    log("Done.")


if __name__ == "__main__":
    sys.exit(main())
