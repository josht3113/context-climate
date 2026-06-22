#!/usr/bin/env python3
"""
update_seaice_data.py

Pulls daily Arctic (N) and Antarctic (S) sea ice extent from the NSIDC
Sea Ice Index (G02135, v4.0) and rebuilds a single combined JSON file
used by the ContextClimate Sea Ice Extent Explorer and Heatmap tools.

Source : https://noaadata.apps.nsidc.org/NOAA/G02135/
Citation: Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K.
& Stafford, T. (2025). Sea Ice Index. (G02135, Version 4). National Snow and
Ice Data Center. https://doi.org/10.7265/a98x-0f50

Output: public/seaice-extent.json
"""

import csv
import io
import json
import sys
from datetime import date
from pathlib import Path

import requests

NSIDC_URLS = {
    "N": "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv",
    "S": "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_daily_v4.0.csv",
}

OUTPUT_PATH = Path("public/seaice-extent.json")

BASELINE_START_YEAR = 1991
BASELINE_END_YEAR = 2020

SENSOR_TRANSITION = {
    "date": "2025-01-01",
    "note": (
        "NSIDC switched the Sea Ice Index from the SSMIS sensor to JAXA's "
        "AMSR2 instrument on this date after the Department of Defense "
        "discontinued SSMIS data delivery. AMSR2 locates the ice edge "
        "slightly inboard of SSMIS, so extent values from this date forward "
        "run somewhat lower for methodological, not climatic, reasons."
    ),
}

# Fixed 366-slot calendar template so every year -- leap or not -- aligns by
# calendar date rather than raw ordinal day-of-year. Without this, every date
# from Mar 1 onward would sit one slot apart between leap and non-leap years,
# silently misaligning the chart and the heatmap after every February.
def build_template():
    template = {}
    slot = 1
    months_days = [
        (1, 31), (2, 29), (3, 31), (4, 30), (5, 31), (6, 30),
        (7, 31), (8, 31), (9, 30), (10, 31), (11, 30), (12, 31),
    ]
    for month, days_in_month in months_days:
        for day in range(1, days_in_month + 1):
            template[(month, day)] = slot
            slot += 1
    return template  # 366 entries, keyed by (month, day) -> slot 1..366


TEMPLATE = build_template()


def fetch_csv(url: str) -> str:
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.text


def parse_daily_extent(csv_text: str):
    """
    Returns: ({year_str: [366 floats-or-None]}, latest_date)
    Tolerant of NSIDC's stray whitespace in header/value fields and of
    repeated header-like rows that sometimes appear mid-file.
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]

    years = {}
    latest_date = None
    skipped = 0

    for row in reader:
        row = {k.strip().lower(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
        try:
            year = int(row["year"])
            month = int(row["month"])
            day = int(row["day"])
            extent = float(row["extent"])
        except (KeyError, ValueError, TypeError):
            skipped += 1
            continue  # header repeats, blank lines, malformed rows

        if extent < 0:  # NSIDC uses -9999 (or similar) for missing values
            skipped += 1
            continue

        slot = TEMPLATE.get((month, day))
        if slot is None:
            skipped += 1
            continue

        year_key = str(year)
        if year_key not in years:
            years[year_key] = [None] * 366
        years[year_key][slot - 1] = round(extent, 3)

        try:
            this_date = date(year, month, day)
            if latest_date is None or this_date > latest_date:
                latest_date = this_date
        except ValueError:
            pass

    return years, latest_date, skipped


def main():
    hemispheres = {}
    latest_overall = None

    for code, url in NSIDC_URLS.items():
        print(f"Fetching {code} hemisphere data from {url} ...")
        csv_text = fetch_csv(url)
        years, latest_date, skipped = parse_daily_extent(csv_text)
        hemispheres[code] = {"years": years}
        print(f"  -> {len(years)} years parsed, latest date: {latest_date}, rows skipped: {skipped}")
        if latest_date and (latest_overall is None or latest_date > latest_overall):
            latest_overall = latest_date

    output = {
        "updated_through": latest_overall.isoformat() if latest_overall else None,
        "source": "NSIDC Sea Ice Index, G02135 v4.0",
        "source_url": "https://noaadata.apps.nsidc.org/NOAA/G02135/",
        "citation": (
            "Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K. "
            "& Stafford, T. (2025). Sea Ice Index. (G02135, Version 4). National "
            "Snow and Ice Data Center. https://doi.org/10.7265/a98x-0f50"
        ),
        "baseline_period": f"{BASELINE_START_YEAR}-{BASELINE_END_YEAR}",
        "sensor_transition": SENSOR_TRANSITION,
        "hemispheres": hemispheres,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, separators=(",", ":")))
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
