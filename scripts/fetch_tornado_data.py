"""
fetch_tornado_data.py — one-time / cron pipeline script for tornado-tracks.json

Fetches NOAA/SPC's "1950-present actual tornadoes" CSV directly from
www.spc.noaa.gov and rebuilds public/tornado-tracks.json from scratch.

Matches the self-hosted JSON pattern used elsewhere on the site (sea ice,
sunspot, ENSO, etc.): run this manually or on a monthly/yearly GitHub Actions
schedule, commit the regenerated JSON, and the live tool picks it up on
next deploy.

NOTE: this must be run somewhere with normal internet access (a GitHub
Actions runner, your own machine, etc.) — SPC's site could not be reached
from the sandboxed environment this was originally built in, so the initial
tornado-tracks.json shipped alongside this script was instead built from a
verified 1950-2022 mirror of the same file. Running this script is how you
bring it current (2023-present) once you're somewhere with real network
access — see the note at the bottom of this file.
"""

import csv
import io
import json
import sys
import datetime
import urllib.request

FIELDS = ["om", "yr", "mo", "dy", "min", "st", "mag", "fc", "inj", "fat",
          "loss", "closs", "slat", "slon", "elat", "elon", "len", "wid"]


def find_source_url():
    """SPC republishes this file under a new name each year (e.g.
    1950-2023_actual_tornadoes.csv -> 1950-2024_actual_tornadoes.csv).
    Try the current year, then step backwards, same approach used by the
    tropycal Python package for this exact dataset."""
    now_year = datetime.datetime.utcnow().year
    for year_diff in range(0, 6):
        yr = now_year - year_diff
        url = f"https://www.spc.noaa.gov/wcm/data/1950-{yr}_actual_tornadoes.csv"
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    return url
        except Exception:
            continue
    raise RuntimeError("Could not find a live 1950-YYYY_actual_tornadoes.csv on spc.noaa.gov "
                        "within the last 5 years — check https://www.spc.noaa.gov/wcm/#data manually.")


def to_min(t):
    try:
        h, m, _s = t.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return -1


def num(v, cast=float, default=0.0):
    try:
        return cast(v)
    except Exception:
        return default


def build(csv_text, out_path):
    reader = csv.DictReader(io.StringIO(csv_text))
    records = []
    years_seen = set()
    mag_counts = {}
    fc_count = 0

    for row in reader:
        yr, mo, dy = int(row["yr"]), int(row["mo"]), int(row["dy"])
        years_seen.add(yr)
        mag = int(row["mag"])
        mag_counts[mag] = mag_counts.get(mag, 0) + 1
        fc = int(row["fc"])
        if fc:
            fc_count += 1

        slat, slon = round(num(row["slat"]), 3), round(num(row["slon"]), 3)
        elat, elon = round(num(row["elat"]), 3), round(num(row["elon"]), 3)
        if elat == 0.0 and elon == 0.0:
            elat, elon = slat, slon

        records.append([
            int(row["om"]), yr, mo, dy, to_min(row["time"]),
            row["st"], mag, fc,
            int(num(row["inj"], int, 0)), int(num(row["fat"], int, 0)),
            round(num(row["loss"]), 1), round(num(row["closs"]), 1),
            slat, slon, elat, elon,
            round(num(row["len"]), 2), int(num(row["wid"], int, 0)),
        ])

    records.sort(key=lambda r: (r[1], r[2], r[3], r[4]))

    manifest = {
        "generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "NOAA/NWS Storm Prediction Center — SPC Severe Weather Database "
                   "(1950-present tornado tracks), via www.spc.noaa.gov/wcm",
        "coverage_start": min(years_seen),
        "coverage_end": max(years_seen),
        "record_count": len(records),
        "estimated_rating_count": fc_count,
        "mag_counts": {str(k): v for k, v in sorted(mag_counts.items())},
        "fields": FIELDS,
        "field_notes": {
            "om": "SPC event id (unique within a year)",
            "min": "minutes after midnight, local standard time (-1 if unknown)",
            "mag": "EF/F scale rating; -9 = unrated/unknown",
            "fc": "1 if mag was estimated later from an originally-unknown (-9) rating",
            "loss": "property loss; methodology changed in 1996 (categorical->dollars) - treat as approximate",
            "closs": "crop loss; same caveat as loss",
            "slat/slon/elat/elon": "start/end coordinates in decimal degrees; end==start if no distinct endpoint was recorded",
            "len": "path length in miles",
            "wid": "path width in yards",
        },
        "records": records,
    }

    with open(out_path, "w") as f:
        json.dump(manifest, f, separators=(",", ":"))

    print(f"Wrote {out_path}: {len(records):,} records, {min(years_seen)}-{max(years_seen)}")


if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else "tornado-tracks.json"
    url = find_source_url()
    print(f"Fetching {url} ...")
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    build(text, out_path)
