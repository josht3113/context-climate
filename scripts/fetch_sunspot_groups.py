#!/usr/bin/env python3
"""
Rebuilds public/sunspot-groups.csv from David Hathaway's RGO/USAF/NOAA
sunspot group database (solarcyclescience.com/AR_Database/gYYYY.txt,
1874-present).

Each yearly file logs every DAY a sunspot group was observed (so a
long-lived group appears many times). This script reduces that down to
ONE representative point per group -- the observation with the highest
foreshortening-correction factor (i.e. closest to central meridian),
which is the most reliable position + area measurement for that group --
producing a compact scatter-ready dataset for the butterfly diagram tool.

Source: David Hathaway, solarcyclescience.com
  http://solarcyclescience.com/activeregions.html

If too many yearly files fail to fetch (a transient upstream problem
rather than a real absence of data), this script leaves the
previously-committed public/sunspot-groups.csv untouched and exits 0 --
matching the pattern used by scripts/update_sunspot_data.py.
"""
import csv
import datetime
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://solarcyclescience.com/AR_Database/g{year}.txt"
START_YEAR = 1874
END_YEAR = datetime.date.today().year
OUTPUT_PATH = Path("public/sunspot-groups.csv")
AREA_CORRECTION_CUTOFF = datetime.date(1977, 1, 1)
AREA_CORRECTION_FACTOR = 1.4  # per solarcyclescience.com: USAF/NOAA whole-spot
                              # areas are increased 1.4x after 1976/12/31 to
                              # match the RGO measurement convention

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0"
MAX_RETRIES = 3
RETRY_DELAY_SEC = 5
REQUEST_DELAY_SEC = 0.4  # be polite to a small academic server across ~150 requests
MAX_ALLOWED_FAILED_YEARS = 3  # abort the whole rebuild if more years than this fail

_dumped_sample = False  # print one diagnostic sample of bad content, not 150


def looks_like_ar_year_data(text, year):
    """A real gYYYY.txt file's data rows start with that same 4-digit year
    as the first whitespace token. Checking the FIRST non-blank line
    (rather than the last) is the robust choice here -- some yearly files
    apparently carry a trailing line or two that rolls into the next
    year, but the first line reliably belongs to the requested year. If
    even the first line doesn't match, this isn't the real file -- more
    likely an error page, rate-limit/challenge response, or redirect
    stub served with a 200 status (so urllib wouldn't have raised on it)."""
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return False
    first_token = lines[0].split()[0] if lines[0].split() else ""
    return first_token == str(year)


def parse_month_day(token, next_token=None):
    if "." in token:
        length = len(token)
        if length == 7:
            return int(token[0:1]), float(token[1:]), False
        elif length == 8:
            return int(token[0:2]), float(token[2:]), False
        raise ValueError(f"Unparseable month/day token: {token!r}")
    return int(token), float(next_token), True


def parse_line(line):
    line = line.strip()
    if not line:
        return None
    tokens = line.split()
    if len(tokens) < 12:
        return None

    try:
        year = int(tokens[0])
        fused = "." in tokens[1]
        month, day, _ = parse_month_day(tokens[1], tokens[2] if len(tokens) > 2 else None)
        rest = tokens[2:] if fused else tokens[3:]
        if len(rest) < 10:
            return None

        group_num = int(rest[0])
        if group_num == 0:
            return None  # zero-filled "missing day" placeholder row, not a real group

        area = float(rest[5])
        corr_factor = float(rest[6])
        latitude = float(rest[9])

        day_int = max(1, min(31, int(day)))
        obs_date = datetime.date(year, month, day_int)
    except (ValueError, IndexError):
        # Any malformed/unexpected-layout row (older-era formatting quirks,
        # zeroed-out missing-day placeholders, etc.) is skipped rather than
        # aborting the whole fetch -- one odd historical row should never
        # take down 150 years of otherwise-good data.
        return None

    if obs_date >= AREA_CORRECTION_CUTOFF:
        area *= AREA_CORRECTION_FACTOR

    return {
        "group_num": group_num,
        "date": obs_date,
        "latitude": latitude,
        "area": area,
        "corr_factor": corr_factor,
    }


def fetch_year(year):
    global _dumped_sample
    url = BASE_URL.format(year=year)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_exc = None
    last_bad_text = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError) as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SEC)
            continue

        if looks_like_ar_year_data(text, year):
            return text

        last_bad_text = text
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SEC)

    if last_bad_text is not None:
        print(
            f"  [warn] {year}: response didn't look like real AR data after "
            f"{MAX_RETRIES} attempts ({len(last_bad_text)} chars, "
            f"{len(last_bad_text.splitlines())} lines)",
            file=sys.stderr,
        )
        if not _dumped_sample:
            _dumped_sample = True
            print("  ---- sample of unexpected response content ----", file=sys.stderr)
            print(last_bad_text[:500], file=sys.stderr)
            print("  ------------------------------------------------", file=sys.stderr)
    else:
        print(f"  [warn] {year}: failed after {MAX_RETRIES} attempts ({last_exc})", file=sys.stderr)
    return None


def main():
    best_by_group = {}
    failed_years = []

    for year in range(START_YEAR, END_YEAR + 1):
        text = fetch_year(year)
        time.sleep(REQUEST_DELAY_SEC)
        if text is None:
            failed_years.append(year)
            continue
        count = 0
        total_lines = 0
        for line in text.splitlines():
            if not line.strip():
                continue
            total_lines += 1
            rec = parse_line(line)
            if rec is None:
                continue
            count += 1
            gnum = rec["group_num"]
            existing = best_by_group.get(gnum)
            if existing is None or rec["corr_factor"] > existing["corr_factor"]:
                best_by_group[gnum] = rec

        skip_rate = 1 - (count / total_lines) if total_lines else 0
        flag = "  <-- HIGH SKIP RATE, check format for this year" if skip_rate > 0.15 else ""
        print(f"{year}: {count}/{total_lines} rows parsed ({skip_rate:.0%} skipped){flag}", file=sys.stderr)

    if len(failed_years) > MAX_ALLOWED_FAILED_YEARS:
        print(
            f"ERROR: {len(failed_years)} yearly files failed to fetch "
            f"(years: {failed_years}) -- this looks like an upstream outage, "
            f"not a real data gap. Leaving committed {OUTPUT_PATH} untouched.",
            file=sys.stderr,
        )
        sys.exit(0)

    if failed_years:
        print(
            f"Note: {len(failed_years)} year(s) failed to fetch and were "
            f"skipped: {failed_years}. Proceeding since this is within tolerance.",
            file=sys.stderr,
        )

    if len(best_by_group) < 1000:
        print(
            f"ERROR: only {len(best_by_group)} groups parsed across all years "
            f"-- something is badly wrong upstream. Leaving committed "
            f"{OUTPUT_PATH} untouched.",
            file=sys.stderr,
        )
        sys.exit(0)

    rows = sorted(best_by_group.values(), key=lambda r: (r["date"], r["group_num"]))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "latitude", "area", "group_num"])
        for r in rows:
            writer.writerow([
                r["date"].isoformat(),
                round(r["latitude"], 1),
                round(r["area"], 1),
                r["group_num"],
            ])

    print(f"Wrote {len(rows)} sunspot group records to {OUTPUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
