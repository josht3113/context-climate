#!/usr/bin/env python3
"""
ContextClimate data pipeline: surface solar irradiance climatology for Islip.

Source: Open-Meteo Historical Weather API (free, no key, ERA5/satellite-
blended reanalysis, hourly, global back to 1940). One request covering
YEARS_BACK years of hourly shortwave radiation, then averaged locally by
calendar day + hour-of-day to build a day-of-year climatological curve.

This is the "is today sunnier or cloudier than normal" backdrop for the
Live Sun panel. The live/current values themselves come from the regular
forecast API, fetched client-side in the browser (see solar-output.html) --
no key or server needed for that half, since Open-Meteo's forecast endpoint
is CORS-friendly.

NOTE: this script could not be executed from the chat sandbox that
generated the rest of this tool (its network egress only reaches a
handful of allowlisted hosts, and Open-Meteo's JSON responses were
getting silently emptied by the sandbox's fetch wrapper -- a sandbox
quirk, not a real API problem). Run this once locally or in CI, where
it should work as a normal Python + urllib script hitting a public API.

Usage:
    python3 fetch_irradiance_climatology.py [output_path]
"""
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

LATITUDE = 40.7952   # KISP / Islip, NY -- matches ContextClimate's anchor point
LONGITUDE = -73.1002
TIMEZONE = "America/New_York"

YEARS_BACK = 20  # 2005-01-01 through 2024-12-31 by default

ARCHIVE_URL = (
    "https://archive-api.open-meteo.com/v1/archive"
    "?latitude={lat}&longitude={lon}"
    "&start_date={start}&end_date={end}"
    "&hourly=shortwave_radiation,direct_radiation,diffuse_radiation"
    "&timezone={tz}"
)


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "contextclimate-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "islip-irradiance-climatology.json"

    end_year = date.today().year - 1  # last fully-complete year
    start_year = end_year - YEARS_BACK + 1
    start_date = date(start_year, 1, 1).isoformat()
    end_date = date(end_year, 12, 31).isoformat()

    url = ARCHIVE_URL.format(lat=LATITUDE, lon=LONGITUDE, start=start_date, end=end_date, tz=TIMEZONE)
    print(f"Fetching {start_date} to {end_date} ({YEARS_BACK} years) ...")
    data = fetch_json(url)

    times = data["hourly"]["time"]
    shortwave = data["hourly"]["shortwave_radiation"]

    # bucket[MM-DD][hour] = list of values across years
    buckets = defaultdict(lambda: defaultdict(list))
    for t, val in zip(times, shortwave):
        if val is None:
            continue
        # t looks like "2005-01-01T00:00"
        day_key = t[5:10]       # "MM-DD"
        hour = int(t[11:13])
        buckets[day_key][hour].append(val)

    climatology = {}
    for day_key, hours in buckets.items():
        curve = []
        for h in range(24):
            vals = hours.get(h, [])
            avg = round(sum(vals) / len(vals), 1) if vals else 0.0
            curve.append(avg)
        climatology[day_key] = curve

    payload = {
        "source": "Open-Meteo Historical Weather API (ERA5-based reanalysis)",
        "location": {"name": "Islip, NY (KISP)", "lat": LATITUDE, "lon": LONGITUDE},
        "years": f"{start_year}-{end_year}",
        "units": "W/m^2, hourly mean by local hour-of-day",
        "generated": date.today().isoformat(),
        "climatology": climatology,
    }

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=0)

    print(f"Wrote climatology for {len(climatology)} calendar days to {out_path}")


if __name__ == "__main__":
    main()
