#!/usr/bin/env python3
"""
Cloud Cover Explorer -- add ASOS commissioning dates to stations.json.

Reads NOAA NCEI's ASOS station list (asos-stations.txt, fixed width, one row
per current ASOS site) and copies each site's BEGDT ("date ASOS site was
commissioned") into public/cloud-cover/stations.json as an "asos" field
("YYYY-MM-DD"), matched on the FAA call sign (the file's CALL column), which
is the same 3-letter id stations.json uses.

The explorer marks this date on every chart and takes "normal" from the
same side of it, because overcast frequency typically steps down when a
station switches from human observers to the ASOS ceilometer.

Safe to re-run: stations with no ASOS row (AWOS-only sites, etc.) keep
whatever they had, and nothing is written unless the download parses and
enough stations match.

Usage (from the repo root):
    python scripts/add_asos_dates.py            # update stations.json
    python scripts/add_asos_dates.py --dry-run  # report only
"""

import argparse
import json
import os
import sys
import urllib.request

SOURCES = [
    "https://www.ncei.noaa.gov/access/homr/file/asos-stations.txt",
    "https://www.ncdc.noaa.gov/homr/file/asos-stations.txt",
]
STATIONS_FILE = os.path.join("public", "cloud-cover", "stations.json")
MIN_ROWS = 500          # the national list has ~900+ sites; fewer means a bad download
MIN_MATCH_FRAC = 0.5    # refuse to write if under half of our stations match
TIMEOUT = 90


def log(msg):
    print(msg, flush=True)


def download():
    last = None
    for url in SOURCES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ContextClimate-AsosDates/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                text = r.read().decode("latin-1", errors="replace")
            if "BEGDT" in text and "CALL" in text:
                log(f"downloaded {url} ({len(text):,} bytes)")
                return text
            last = f"{url}: unexpected content"
        except Exception as e:  # try the next mirror
            last = f"{url}: {e}"
    raise RuntimeError(f"no usable ASOS list ({last})")


def column_spans(header, rule):
    """Column spans from the dashed rule under the header (fixed-width layout)."""
    spans, i = {}, 0
    while i < len(rule):
        if rule[i] == "-":
            j = i
            while j < len(rule) and rule[j] == "-":
                j += 1
            name = header[i:j].strip()
            if name:
                spans[name] = (i, j)
            i = j
        else:
            i += 1
    return spans


def parse(text):
    lines = text.splitlines()
    for k in range(len(lines) - 1):
        if "BEGDT" in lines[k] and "CALL" in lines[k] and set(lines[k + 1].strip()) <= {"-", " "}:
            spans = column_spans(lines[k], lines[k + 1])
            body = lines[k + 2:]
            break
    else:
        raise RuntimeError("header / dashed rule not found")
    for need in ("CALL", "BEGDT"):
        if need not in spans:
            raise RuntimeError(f"column {need} missing")
    c0, c1 = spans["CALL"]
    b0, b1 = spans["BEGDT"]
    out, rows = {}, 0
    for ln in body:
        if len(ln) < b1:
            continue
        call = ln[c0:c1].strip().upper()
        beg = ln[b0:b1].strip()
        if not call or len(beg) != 8 or not beg.isdigit():
            continue
        rows += 1
        y, m, d = int(beg[:4]), int(beg[4:6]), int(beg[6:8])
        if not (1985 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= 31):
            continue
        iso = f"{y:04d}-{m:02d}-{d:02d}"
        # A call sign should appear once; if not, keep the earliest commissioning.
        if call not in out or iso < out[call]:
            out[call] = iso
    if rows < MIN_ROWS:
        raise RuntimeError(f"only {rows} rows parsed")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(STATIONS_FILE) as f:
        stations = json.load(f)

    try:
        dates = parse(download())
    except Exception as e:
        log(f"ERROR: {e} -- stations.json left unchanged")
        return 1

    matched, changed, missing = 0, 0, []
    for s in stations:
        iso = dates.get(s["id"].upper())
        if iso is None and s.get("icao", "").upper().startswith("K"):
            iso = dates.get(s["icao"][1:].upper())
        if iso is None:
            missing.append(s["id"])
            continue
        matched += 1
        if s.get("asos") != iso:
            s["asos"] = iso
            changed += 1

    log(f"matched {matched}/{len(stations)}; {changed} changed")
    if missing:
        log("no ASOS row (left as-is): " + ", ".join(missing))
    if matched < MIN_MATCH_FRAC * len(stations):
        log("ERROR: too few matches -- stations.json left unchanged")
        return 1
    if args.dry_run or not changed:
        return 0

    # Same layout as the hand-maintained file: one station object per line.
    with open(STATIONS_FILE, "w") as f:
        f.write("[\n" + ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in stations) + "\n]\n")
    log(f"wrote {STATIONS_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
