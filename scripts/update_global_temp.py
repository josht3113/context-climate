#!/usr/bin/env python3
"""
update_global_temp.py

Data pipeline for "Global Temperature in Context"
(public/global-temperature-context.html).

Source: ERA5 daily 2-metre world air temperature as published by Climate
Reanalyzer (University of Maine) — same reanalysis and cadence as C3S's
Climate Pulse, exposed as plain JSON:

    https://climatereanalyzer.org/clim/t2_daily/json/era5_world_t2_day.json

Record 1 Jan 1940 - present, ERA5 lagging today by a few days.

CALENDAR. The source arrays are 366 slots indexed from 1 Jan (slot i =
1 Jan + i); non-leap years hold 365 values and a null in the last slot.
Indexing by slot therefore compares 1 Mar of a non-leap year with 29 Feb
of a leap year, and every later date is a day out. This script re-lays
every year onto one 366-day calendar (slot 59 = 29 Feb, null in non-leap
years) before anything is computed, so a slot is the same calendar date
in every year.

ENSO. Each year is classed by the ONI of the winter it opens on (DJF:
Dec of the previous year through Feb). Global temperature lags Nino 3.4 by
roughly 3-4 months, so the calendar year after a winter El Nino peak is
the warm one (1998, 2016, 2024). ONI comes from NOAA CPC's oni.ascii.txt
on every run; if that fetch fails the static table below is used.

Output: public/data/global-temp-daily.json

Run:  python scripts/update_global_temp.py
      python scripts/update_global_temp.py --source-file era5_world_t2_day.json
Requires: numpy
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

SOURCE_URL = "https://climatereanalyzer.org/clim/t2_daily/json/era5_world_t2_day.json"
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "global-temp-daily.json"

N_DAYS = 366
FEB29 = 59  # slot of 29 Feb on the 366-day calendar

BASELINE_YEARS = range(1991, 2021)  # WMO 1991-2020 normal period
PREINDUSTRIAL_OFFSET_C = 0.88
# C3S's published estimate: the ERA5 1991-2020 global mean is 0.88 C above
# the 1850-1900 (IPCC AR6) preindustrial baseline. Applied as a flat shift,
# as C3S does in its own bulletins and Climate Pulse.
# https://climate.copernicus.eu/why-do-we-keep-talking-about-15degc-and-2degc-above-pre-industrial-era

EL_NINO_THRESHOLD = 0.5
LA_NINA_THRESHOLD = -0.5
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]

YEAR_NAME_RE = re.compile(r"^(19[4-9]\d|20\d\d)$")

# --- ONI fallback (NOAA CPC) -------------------------------------------------
# Used only if the live fetch of oni.ascii.txt fails. Row = year, columns =
# [DJF, JFM, ..., NDJ]. Snapshot 2026-07-27.
ONI_FALLBACK = {
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


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "contextclimate.io data pipeline"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def is_leap(y):
    return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0


def parse_series(raw):
    """Climate Reanalyzer rows {"name": year|label, "data": [...] or "a,b,..."}
    -> {year: [366 floats-or-None]} on the 366-day calendar. Summary rows
    ("1991-2020 mean", ...) are dropped by requiring a bare 4-digit name."""
    years = {}
    for row in raw:
        name = str(row.get("name", "")).strip()
        if not YEAR_NAME_RE.match(name):
            continue
        data = row.get("data")
        parts = data.split(",") if isinstance(data, str) else data if isinstance(data, list) else None
        if parts is None:
            continue
        vals = []
        for p in parts:
            s = "" if p is None else str(p).strip()
            try:
                v = float(s) if s and s.lower() not in ("null", "nan") else None
            except ValueError:
                v = None
            vals.append(v if v is not None and -40.0 < v < 40.0 else None)
        vals = (vals + [None] * N_DAYS)[:N_DAYS]
        y = int(name)
        if not is_leap(y):
            # slot i is 1 Jan + i; open a gap at 29 Feb, drop the empty tail
            vals = vals[:FEB29] + [None] + vals[FEB29:N_DAYS - 1]
        years[y] = vals
    return years


def fetch_oni():
    """{year: [12 seasonal ONI values]} from CPC, or None on failure."""
    try:
        text = http_get(ONI_URL, timeout=30).decode("utf-8", "replace")
    except Exception as e:
        print(f"  ONI fetch failed ({e}); using fallback table")
        return None
    table = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 4 or parts[0] not in SEASONS:
            continue
        try:
            yr, anom = int(parts[1]), float(parts[3])
        except ValueError:
            continue
        table.setdefault(yr, [None] * 12)[SEASONS.index(parts[0])] = anom
    if len(table) < 50:
        print("  ONI parse looked wrong; using fallback table")
        return None
    return table


def classify(djf):
    if djf is None:
        return "unclassified"
    if djf >= EL_NINO_THRESHOLD:
        return "el_nino"
    if djf <= LA_NINA_THRESHOLD:
        return "la_nina"
    return "neutral"


def r3(a):
    return [None if np.isnan(v) else round(float(v), 3) for v in a]


def build_output(years, oni, oni_source):
    ys = sorted(years)
    if not ys:
        raise RuntimeError("No valid year rows parsed from source JSON")
    arr = {y: np.array([np.nan if v is None else v for v in years[y]]) for y in ys}

    base = np.full(N_DAYS, np.nan)
    present = [y for y in BASELINE_YEARS if y in arr]
    for i in range(N_DAYS):
        col = np.array([arr[y][i] for y in present])
        col = col[~np.isnan(col)]
        if len(col):
            base[i] = col.mean()
    # 29 Feb has only the leap years of the period behind it; take it as the
    # midpoint of 28 Feb and 1 Mar instead of a noisier 7-year mean.
    base[FEB29] = (base[FEB29 - 1] + base[FEB29 + 1]) / 2

    cy = ys[-1]
    filled = np.where(~np.isnan(arr[cy]))[0]
    last = int(filled[-1]) if len(filled) else None
    data_through = None
    if last is not None:
        d = date(2024, 1, 1) + timedelta(days=last)  # 366-day calendar
        data_through = date(cy, d.month, d.day).isoformat()

    out_years = {}
    for y in ys:
        djf = (oni.get(y) or [None])[0]
        entry = {
            "t": [None if np.isnan(v) else round(float(v), 2) for v in arr[y]],
            "enso": classify(djf),
            "oni_djf": djf,
        }
        out_years[str(y)] = entry

    return {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "ECMWF ERA5 (Copernicus C3S) via Climate Reanalyzer, University of Maine",
        "source_url": "https://climatereanalyzer.org/clim/t2_daily/?dm_id=world",
        "calendar": "366 slots from 1 Jan; slot 59 = 29 Feb, null in non-leap years",
        "period_of_record": f"{ys[0]}-{cy}",
        "data_through": data_through,
        "units": "C",
        "baseline_1991_2020": r3(base),
        "baseline_1850_1900": r3(base - PREINDUSTRIAL_OFFSET_C),
        "preindustrial_offset_c": PREINDUSTRIAL_OFFSET_C,
        "current_year": str(cy),
        "enso_source": oni_source,
        "enso_method": "DJF ONI opening the year: El Nino >= +0.5 C, La Nina <= -0.5 C, else neutral; before 1950 unclassified",
        "years": out_years,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-file", help="read the Climate Reanalyzer JSON from disk instead of fetching it")
    args = ap.parse_args()

    if args.source_file:
        raw = json.loads(Path(args.source_file).read_text())
    else:
        print(f"Fetching {SOURCE_URL} ...")
        raw = json.loads(http_get(SOURCE_URL))
    years = parse_series(raw)
    print(f"Parsed {len(years)} year rows ({min(years)}-{max(years)})")

    oni = fetch_oni()
    oni_source = "NOAA CPC ONI (oni.ascii.txt)"
    if oni is None:
        oni, oni_source = ONI_FALLBACK, "NOAA CPC ONI (static snapshot 2026-07-27)"

    output = build_output(years, oni, oni_source)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, separators=(",", ":")))
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.1f} KB)")
    print(f"  data_through={output['data_through']}  enso_source={oni_source}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
