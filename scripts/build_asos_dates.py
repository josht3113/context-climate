#!/usr/bin/env python3
"""
ASOS commissioning dates for every station in the shared roster
(public/station-roster.js) -> public/asos-dates.json  {"KISP": "1999-08-01", ...}

Source: NOAA NCEI HOMR asos-stations.txt, column BEGDT ("date ASOS site was
commissioned"), matched on the FAA call sign. Parsing is shared with
scripts/add_asos_dates.py.

The Climate Record Explorer marks this date on its time series. Stations with
no ASOS row (AWOS-only sites, renamed ids) keep whatever the file already had,
and nothing is written unless the download parses and enough stations match.

Usage (from the repo root):
    python scripts/build_asos_dates.py
    python scripts/build_asos_dates.py --dry-run
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_asos_dates import download, parse, log  # noqa: E402

ROSTER = os.path.join("public", "station-roster.js")
OUT = os.path.join("public", "asos-dates.json")
MIN_MATCH_FRAC = 0.5


def roster_ids():
    with open(ROSTER) as f:
        src = f.read()
    body = src[src.index("STATION_ROSTER"):]
    ids = re.findall(r'\["([A-Z0-9]{3,5})"', body)
    if len(ids) < 100:
        raise RuntimeError(f"only {len(ids)} roster stations found")
    return sorted(set(ids))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ids = roster_ids()
    try:
        dates = parse(download())
    except Exception as e:
        log(f"ERROR: {e} -- {OUT} left unchanged")
        return 1

    old = {}
    if os.path.exists(OUT):
        with open(OUT) as f:
            old = json.load(f)

    out, matched, missing = {}, 0, []
    for icao in ids:
        call = icao[1:] if len(icao) == 4 and icao[0] in "KPT" else icao
        iso = dates.get(call) or dates.get(icao)
        if iso:
            matched += 1
            out[icao] = iso
        elif icao in old:
            out[icao] = old[icao]
        else:
            missing.append(icao)

    log(f"matched {matched}/{len(ids)}; {len(out)} with a date")
    if missing:
        log("no ASOS row: " + " ".join(missing))
    if matched < MIN_MATCH_FRAC * len(ids):
        log("ERROR: too few matches -- file left unchanged")
        return 1
    if args.dry_run:
        return 0
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    log(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
