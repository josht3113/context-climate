#!/usr/bin/env python3
"""
build_seaice_volume.py

Builds public/seaice-volume.json for the ContextClimate Sea Ice Volume
Explorer and Sea Ice Volume Heatmap.

PIOMAS (Arctic, model reanalysis, daily, 1979 onward)
    Daily total volume and daily mean thickness from the University of
    Washington Polar Science Center. The download links are read from PSC's
    data page rather than hardcoded, because the filenames carry both the
    version and the year range (e.g. ...1979.2026.Current.v2.1...). When PSC
    publishes a new version the whole series is replaced, never appended to
    the previous version.

    PIOMAS runs a 365-day (no-leap) model year: day-of-year 60 is Mar 1 in
    every year, including leap years. Verified by rebuilding PSC's own monthly
    means from the daily file, which only agrees on a no-leap calendar. Each
    value goes on the same 366-slot template as seaice-extent.json, so the
    Feb 29 slot is always empty.

CryoSat-2 (Arctic, satellite, monthly, Oct-Apr from Nov 2010)
    Optional. Fetched by fetch_cryosat2(); if that fails the previous
    cryosat2 block in the existing JSON is kept, so a satellite outage never
    blanks the satellite layer and never blocks the PIOMAS update.

Output: public/seaice-volume.json
"""

import gzip
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

import requests

PSC_DATA_PAGE = "https://psc.apl.uw.edu/research/projects/arctic-sea-ice-volume-anomaly/data/"
PSC_FILE_BASE = "https://psc.apl.uw.edu/wordpress/wp-content/uploads/schweiger/ice_volume/"
FALLBACK_FILES = {
    "volume": "PIOMAS.vol.daily.1979.2026.Current.v2.1.dat.gz",
    "thickness": "PIOMAS.thick.daily.1979.2026.Current.v2.1.dat.gz",
    "monthly": "PIOMAS.2sst.monthly.Current.v2.1.txt",
}
LINK_PATTERNS = {
    "volume": r"PIOMAS\.vol\.daily\.[\w.]*?\.dat\.gz",
    "thickness": r"PIOMAS\.thick\.daily\.[\w.]*?\.dat\.gz",
    "monthly": r"PIOMAS\.2sst\.monthly\.[\w.]*?\.txt",
}

OUTPUT_PATH = Path("public/seaice-volume.json")
FIRST_YEAR = 1979
HEADERS = {"User-Agent": "contextclimate.io data pipeline (github.com/josht3113/context-climate)"}

PIOMAS_CITATION = (
    "Zhang, J. & Rothrock, D. A. (2003). Modeling global sea ice with a thickness and "
    "enthalpy distribution model in generalized curvilinear coordinates. Mon. Wea. Rev., "
    "131, 845-861. Schweiger, A. et al. (2011). Uncertainty in modeled Arctic sea ice "
    "volume. J. Geophys. Res., doi:10.1029/2011JC007084"
)

# Shown while the series is frozen. PSC announced on 24 Mar 2026 that PIOMAS
# production stopped when NOAA terminated the NCEP/NCAR R1 forcing (last date
# 17 Mar 2026). Only applied to v2.1 so a resumed series drops it automatically.
PAUSE_NOTE = (
    "PIOMAS production paused after NOAA ended the NCEP/NCAR Reanalysis 1 "
    "atmospheric forcing in March 2026."
)


def build_template():
    template = {}
    slot = 0
    for month, ndays in [(1, 31), (2, 29), (3, 31), (4, 30), (5, 31), (6, 30),
                         (7, 31), (8, 31), (9, 30), (10, 31), (11, 30), (12, 31)]:
        for day in range(1, ndays + 1):
            template[(month, day)] = slot
            slot += 1
    return template


TEMPLATE = build_template()
NOLEAP_CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]


def noleap_md(doy):
    """Day-of-year on a 365-day calendar -> (month, day)."""
    for m in range(12):
        if doy <= NOLEAP_CUM[m + 1]:
            return m + 1, doy - NOLEAP_CUM[m]
    raise ValueError(doy)


def get(url, binary=False):
    resp = requests.get(url, timeout=90, headers=HEADERS)
    resp.raise_for_status()
    return resp.content if binary else resp.text


def discover_files():
    """Read current filenames off PSC's data page; fall back to known names."""
    found = {}
    try:
        page = get(PSC_DATA_PAGE)
        for key, pat in LINK_PATTERNS.items():
            hits = sorted(set(re.findall(pat, page)))
            if hits:
                found[key] = hits[-1]
    except Exception as exc:
        print(f"  data page not readable ({exc}); using fallback filenames")
    for key, name in FALLBACK_FILES.items():
        found.setdefault(key, name)
    return found


def version_of(filename):
    m = re.search(r"\.(v\d+(?:\.\d+)*)\.", filename)
    return m.group(1) if m else "unknown"


def parse_daily(raw_gz, lo, hi, label):
    """Year / day-of-year / value table -> ({year: [366]}, last_date)."""
    text = gzip.decompress(raw_gz).decode("ascii", "replace")
    years, last, n, skipped = {}, None, 0, 0
    for line in io.StringIO(text):
        parts = line.split()
        if len(parts) < 3:
            continue
        try:
            y, doy, v = int(parts[0]), int(parts[1]), float(parts[2])
        except ValueError:
            continue  # header row
        if v < 0 or not (lo <= v <= hi) or not (1 <= doy <= 365):
            skipped += 1
            continue
        mo, da = noleap_md(doy)
        arr = years.setdefault(str(y), [None] * 366)
        arr[TEMPLATE[(mo, da)]] = round(v, 3)
        d = date(y, mo, da)
        n += 1
        if last is None or d > last:
            last = d
    print(f"  {label}: {n} values, {len(years)} years, last {last}, skipped {skipped}")
    return years, last


def parse_monthly(text):
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 13:
            continue
        try:
            y = int(parts[0])
            vals = [float(p) for p in parts[1:]]
        except ValueError:
            continue
        out[y] = [v if v >= 0 else None for v in vals]
    return out


def validate(volume, thickness, last_vol, last_thk, monthly):
    errors = []
    years = sorted(int(y) for y in volume)
    if not years or years[0] != FIRST_YEAR:
        errors.append(f"first year {years[:1]} != {FIRST_YEAR}")
    expected = list(range(FIRST_YEAR, years[-1] + 1)) if years else []
    if years != expected:
        errors.append("gap in years")
    if last_vol != last_thk:
        errors.append(f"volume ends {last_vol}, thickness ends {last_thk}")
    if last_vol and last_vol > date.today():
        errors.append(f"last date {last_vol} is in the future")
    for y in years[:-1]:
        nv = sum(v is not None for v in volume[str(y)])
        if nv != 365 or volume[str(y)][59] is not None:
            errors.append(f"{y}: {nv} daily volume values (expected 365)")
    # Daily file must reproduce PSC's own monthly means.
    month_starts = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366]
    diffs = []
    for y, row in monthly.items():
        arr = volume.get(str(y))
        if not arr:
            continue
        for m, mv in enumerate(row):
            if mv is None:
                continue
            vals = [v for v in arr[month_starts[m]:month_starts[m + 1]] if v is not None]
            if vals:
                diffs.append(abs(sum(vals) / len(vals) - mv))
    diffs.sort()
    worst, med = (diffs[-1], diffs[len(diffs) // 2]) if diffs else (0.0, 0.0)
    print(f"  daily-derived vs PSC monthly means: median {med:.4f}, max {worst:.4f} (10^3 km^3)")
    if worst > 0.2 or med > 0.08:
        errors.append(f"daily-derived monthly means differ from PSC monthly (median {med:.3f}, max {worst:.3f})")
    return errors


def fetch_cryosat2():
    """
    Monthly Arctic CryoSat-2 sea ice volume (10^3 km^3), Oct-Apr, Nov 2010 on.
    Returns a dict for the JSON's cryosat2 block, or raises.
    Not yet wired: the source host has to be verified against real files first.
    """
    raise NotImplementedError("CryoSat-2 source not configured")


def main():
    files = discover_files()
    version = version_of(files["volume"])
    print(f"PIOMAS files ({version}): {files}")

    vol_years, last_vol = parse_daily(get(PSC_FILE_BASE + files["volume"], True), 0.5, 40, "volume")
    thk_years, last_thk = parse_daily(get(PSC_FILE_BASE + files["thickness"], True), 0.1, 6, "thickness")
    monthly = parse_monthly(get(PSC_FILE_BASE + files["monthly"]))

    errors = validate(vol_years, thk_years, last_vol, last_thk, monthly)
    if errors:
        raise RuntimeError("validation failed: " + "; ".join(errors))

    previous = {}
    if OUTPUT_PATH.exists():
        try:
            previous = json.loads(OUTPUT_PATH.read_text())
        except Exception:
            previous = {}

    try:
        cryosat2 = fetch_cryosat2()
    except Exception as exc:
        print(f"  CryoSat-2 not updated ({exc}); keeping previous block")
        cryosat2 = previous.get("cryosat2")

    piomas = {
        "version": version,
        "updated_through": last_vol.isoformat(),
        "units": {"volume": "1000 km3", "thickness": "m"},
        "source": f"PIOMAS {version}, University of Washington Polar Science Center",
        "source_url": PSC_DATA_PAGE,
        "citation": PIOMAS_CITATION,
        "volume": vol_years,
        "thickness": thk_years,
        # PSC's published monthly means (1000 km3), used for complete months so
        # monthly figures match the numbers PSC reports.
        "monthly_volume": {str(y): [None if v is None else round(v, 3) for v in row]
                           for y, row in sorted(monthly.items())},
    }
    if version == "v2.1":
        piomas["status_note"] = PAUSE_NOTE

    out = {
        "baseline_period": "1991-2020",
        "piomas": piomas,
        "cryosat2": cryosat2,
    }
    if previous.get("piomas", {}).get("version") not in (None, version):
        print(f"  PIOMAS version changed {previous['piomas']['version']} -> {version}: full replacement")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
