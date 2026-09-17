#!/usr/bin/env python3
"""
build_ace_data.py — cumulative Accumulated Cyclone Energy by basin, for
contextclimate.io's tropical-ace.html.

Source: IBTrACS v04r01 (NOAA NCEI), CSV access.
  full   mode -> ibtracs.ALL.list.v04r01.csv        (whole archive; monthly)
  recent mode -> ibtracs.last3years.list.v04r01.csv (current seasons; daily)

Conventions baked in here (all stated in the tool's footer):
  * ACE = 1e-4 * sum(v^2) over the four synoptic hours (00/06/12/18Z), for
    points with NATURE in {TS, SS} and wind >= 34 kt.
  * Wind is USA_WIND (1-minute sustained, NHC + JTWC) for every basin, so the
    number is comparable across basins and matches how ACE is normally
    reported. WMO_WIND is 10-minute for most non-US agencies and would run
    roughly 10-15% lower in the West Pacific and Southern Hemisphere.
  * Each 6-hourly point is attributed to the basin recorded on that point, so
    a basin-crossing storm contributes its energy to whichever basin it was
    in at the time.
  * Northern Hemisphere seasons are calendar years. Southern Hemisphere
    seasons (SI, SP, SA) run 1 Jul - 30 Jun and are labelled by the ending
    year: season 2026 = Jul 2025 - Jun 2026, displayed "2025-26".
  * Global is a calendar-year sum of every basin. Because the Southern
    Hemisphere season straddles 1 January, a calendar-year global total
    splits each SH season across two global years. That is the usual
    convention for a global ACE figure; the tool says so.

Output (written to --out, default public/):
  ace-na.json ace-ep.json ace-wp.json ace-ni.json ace-si.json ace-sp.json
  ace-global.json ace-meta.json

Per-basin file:
  {
    "basin", "name", "season_start" (1|7), "start_year", "end_year",
    "current_season", "baseline": [1991, 2020], "labels": [366 "Mon D"],
    "years": { "<season>": { "cum": [366 floats, cumulative ACE],
                             "s": [[d34, d64|null, d96|null, peak_kt, name], ...] } },
    "provisional": [seasons carrying operational (not yet reanalysed) data]
  }

Exit status is nonzero on any download/validation/parse failure, and nothing
is overwritten in that case — a failed run leaves the committed data intact
and turns the Actions run red.
"""

import argparse
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request

BASE = ("https://www.ncei.noaa.gov/data/"
        "international-best-track-archive-for-climate-stewardship-ibtracs/"
        "v04r01/access/csv/")

FULL_FILE = "ibtracs.ALL.list.v04r01.csv"
RECENT_FILE = "ibtracs.last3years.list.v04r01.csv"

# Minimum plausible download sizes (bytes). A truncated transfer or an HTML
# error page lands far below these.
MIN_BYTES = {FULL_FILE: 150_000_000, RECENT_FILE: 400_000}

# How stale the newest observation in a file may be before the run fails.
MAX_STALE_DAYS = {FULL_FILE: 120, RECENT_FILE: 21}

BASELINE = (1991, 2020)

# start_year is the first season with intensity estimates good enough for an
# ACE comparison: continuous geostationary coverage in the Atlantic and West
# Pacific (1966), routine EPAC coverage (1971), and the post-1980 Dvorak era
# for the North Indian and both Southern Hemisphere basins.
BASINS = [
    {"key": "na", "basin": "NA", "name": "North Atlantic",
     "season_start": 1, "start_year": 1966},
    {"key": "ep", "basin": "EP", "name": "East Pacific",
     "season_start": 1, "start_year": 1971},
    {"key": "wp", "basin": "WP", "name": "West Pacific",
     "season_start": 1, "start_year": 1966},
    {"key": "ni", "basin": "NI", "name": "North Indian",
     "season_start": 1, "start_year": 1981},
    {"key": "si", "basin": "SI", "name": "South Indian",
     "season_start": 7, "start_year": 1981},
    {"key": "sp", "basin": "SP", "name": "South Pacific",
     "season_start": 7, "start_year": 1981},
    {"key": "global", "basin": "GL", "name": "Global",
     "season_start": 1, "start_year": 1981},
]
BY_BASIN = {b["basin"]: b for b in BASINS}

SH_BASINS = {"SI", "SP", "SA"}
TROPICAL_NATURES = {"TS", "SS"}
# IBTrACS' in-season feed does not always classify a system. Rows sourced
# from JTWC arrive as US-PROVISIONAL with NATURE set; rows from the other
# agencies arrive as PROVISIONAL with NATURE "NR" — not reported. NR is an
# absence of classification, not a statement that the system is untropical,
# and dropping it discards most of a live West Pacific season. It is
# accepted ONLY on a provisional track, so the finalized archive the whole
# historical record is built from keeps its strict TS/SS basis; once a
# season is reanalysed, the monthly full rebuild replaces these points with
# properly classified ones.
UNCLASSIFIED = "NR"
SYNOPTIC_HOURS = {0, 6, 12, 18}

MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ----------------------------------------------------------------- day index

def build_day_index(season_start):
    """366 slots for a season beginning on the 1st of `season_start`.

    Slots are keyed on (month, day) from a leap year, so 29 Feb always owns
    its own slot and every other calendar date sits at the same index in
    every season. Non-leap seasons simply never deposit into the 29 Feb slot;
    the cumulative series forward-fills across it.
    """
    anchor = 2024 if season_start == 1 else 2023  # both give a 29 Feb
    start = dt.date(anchor, season_start, 1)
    idx, labels = {}, []
    for i in range(366):
        d = start + dt.timedelta(days=i)
        idx[(d.month, d.day)] = i
        labels.append("%s %d" % (MONTH_ABBR[d.month - 1], d.day))
    return idx, labels


DAY_INDEX = {1: build_day_index(1), 7: build_day_index(7)}


def season_of(basin, date):
    """Season label-year for an observation date in a given basin."""
    if basin in SH_BASINS:
        return date.year + 1 if date.month >= 7 else date.year
    return date.year


def slot_of(basin, date):
    start = 7 if basin in SH_BASINS else 1
    return DAY_INDEX[start][0][(date.month, date.day)]


# ------------------------------------------------------------------ download

def download(name, dest, timeout=180, retries=4):
    url = BASE + name
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "contextclimate.io ACE builder"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status != 200:
                    raise RuntimeError("HTTP %s" % r.status)
                with open(dest, "wb") as out:
                    shutil.copyfileobj(r, out, 1 << 20)
            return
        except Exception as exc:  # noqa: BLE001 - retry anything transient
            last = exc
            sys.stderr.write("  attempt %d/%d failed: %s\n"
                             % (attempt, retries, exc))
    raise RuntimeError("download failed for %s: %s" % (url, last))


def validate_file(name, path):
    """Content sniff + size floor. Raises on anything that is not the CSV."""
    size = os.path.getsize(path)
    floor = MIN_BYTES[name]
    if size < floor:
        raise RuntimeError("%s is %d bytes, below the %d-byte floor — "
                           "truncated transfer or an error page"
                           % (name, size, floor))
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        head = f.readline()
    if not head.startswith("SID,SEASON,NUMBER,BASIN"):
        raise RuntimeError("%s does not start with the IBTrACS header row "
                           "(got %r)" % (name, head[:120]))
    return size


# -------------------------------------------------------------------- parse

def iter_rows(path):
    """Yield IBTrACS rows as dicts, skipping the units row beneath the header."""
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        col = {name: i for i, name in enumerate(header)}
        for need in ("SID", "BASIN", "NAME", "ISO_TIME", "NATURE",
                     "USA_WIND", "TRACK_TYPE"):
            if need not in col:
                raise RuntimeError("IBTrACS header is missing %s" % need)
        for row in reader:
            if not row or row[col["SID"]] in ("", "SID"):
                continue
            if row[col["ISO_TIME"]] in ("", "ISO_TIME"):
                continue
            yield row, col


def parse_time(s):
    # IBTrACS ISO_TIME is "YYYY-MM-DD HH:MM:SS"
    return dt.datetime(int(s[0:4]), int(s[5:7]), int(s[8:10]), int(s[11:13]))


def parse_wind(s):
    s = s.strip()
    if not s or s in ("", " "):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    if v <= 0 or v > 250:
        return None
    return v


class Accumulator:
    """Collects ACE by (basin, season, slot) and per-storm threshold days."""

    def __init__(self):
        # ace[basin][season] -> list(366)
        self.ace = {}
        # storms[basin][sid] -> dict
        self.storms = {}
        self.latest = None
        self.n_points = 0
        # Seasons for which IBTrACS carries ANY track in a basin, before the
        # nature/intensity filters. This is what separates "the basin had a
        # quiet season" from "the archive has no data for that season" — the
        # two must not be treated alike, because one belongs in a normal as a
        # zero and the other has to be left out of it.
        self.seen = {}
        # Per basin: [points admitted on a reported nature, points admitted
        # as unclassified-provisional, wind values that are whole 5 kt steps,
        # total wind values]. Reported so a wind column that is not agency
        # knots shows up in the log instead of silently skewing a season.
        self.admit = {}

    def _ace_slot(self, basin, season):
        b = self.ace.setdefault(basin, {})
        arr = b.get(season)
        if arr is None:
            arr = [0.0] * 366
            b[season] = arr
        return arr

    def add_point(self, basin, sid, name, when, wind):
        season = season_of(basin, when)
        slot = slot_of(basin, when)
        # Energy accrues to the season the observation falls in.
        if when.hour in SYNOPTIC_HOURS:
            self._ace_slot(basin, season)[slot] += (wind * wind) / 1e4
        # The storm itself is filed under the season it formed in, matching
        # how agencies count storms. A system that crosses the season
        # boundary therefore has later points whose slot index belongs to a
        # different season's calendar — those cannot be stored raw, or a
        # 31 Dec genesis with a 2 Jan hurricane crossing records d64 = 1
        # against d34 = 365. Such crossings are pinned to the last slot.
        st = self.storms.setdefault(basin, {}).get(sid)
        if st is None:
            st = {"season": season, "name": name, "peak": 0.0,
                  "d34": None, "d64": None, "d96": None}
            self.storms[basin][sid] = st
        rel = slot if season == st["season"] else 365
        if wind > st["peak"]:
            st["peak"] = wind
        for thr, key in ((34, "d34"), (64, "d64"), (96, "d96")):
            if wind >= thr and st[key] is None:
                st[key] = rel

    def note_coverage(self, basin, iso):
        yr, mo = int(iso[0:4]), int(iso[5:7])
        season = yr + 1 if (basin in SH_BASINS and mo >= 7) else yr
        self.seen.setdefault(basin, set()).add(season)

    def ingest(self, path, seasons_keep=None):
        for row, col in iter_rows(path):
            raw_basin = row[col["BASIN"]].strip().upper()
            if raw_basin in BY_BASIN or raw_basin == "SA":
                iso = row[col["ISO_TIME"]]
                self.note_coverage(raw_basin, iso)
                self.seen.setdefault("GL", set()).add(int(iso[0:4]))
            track = row[col["TRACK_TYPE"]].strip().lower()
            if "spur" in track:          # secondary duplicate track segments
                continue
            nature = row[col["NATURE"]].strip().upper()
            provisional = "provisional" in track
            if nature not in TROPICAL_NATURES:
                if not (nature == UNCLASSIFIED and provisional):
                    continue
            wind = parse_wind(row[col["USA_WIND"]])
            if wind is None or wind < 34:
                continue
            when = parse_time(row[col["ISO_TIME"]])
            if self.latest is None or when > self.latest:
                self.latest = when
            basin = row[col["BASIN"]].strip().upper()
            if basin not in BY_BASIN and basin != "SA":
                continue
            sid = row[col["SID"]].strip()
            name = row[col["NAME"]].strip().title()
            if name in ("Not_Named", "Unnamed", "", "Not Named"):
                name = "Unnamed"
            self.n_points += 1
            a = self.admit.setdefault(basin, [0, 0, 0, 0])
            a[0 if nature in TROPICAL_NATURES else 1] += 1
            a[2] += 1 if (wind % 5 == 0) else 0
            a[3] += 1
            if basin in BY_BASIN:
                self.add_point(basin, sid, name, when, wind)
            # Global: every basin including South Atlantic, calendar year.
            self.add_point("GL", "GL" + sid, name, when, wind)


def _global_slot_fix(acc):
    """GL uses calendar-year seasons; add_point() routes 'GL' through the
    Northern-Hemisphere branch of season_of/slot_of already, which is exactly
    the calendar-year behaviour we want. Nothing to do — kept as a named
    check so the intent is not accidentally 'fixed' later."""
    assert season_of("GL", dt.date(2025, 9, 14)) == 2025
    assert slot_of("GL", dt.date(2025, 3, 1)) == DAY_INDEX[1][0][(3, 1)]


# ------------------------------------------------------------------ assemble

def cumulative(daily):
    out, run = [0.0] * 366, 0.0
    for i in range(366):
        run += daily[i]
        out[i] = round(run, 1)
    return out


def build_basin_payload(acc, spec, current_season, provisional_seasons,
                        existing=None, fill_quiet=False):
    basin = spec["basin"]
    labels = DAY_INDEX[spec["season_start"]][1]
    years = dict(existing.get("years", {})) if existing else {}

    ace_by_season = acc.ace.get(basin, {})
    storms_by_sid = acc.storms.get(basin, {})
    storms_by_season = {}
    for sid, st in storms_by_sid.items():
        storms_by_season.setdefault(st["season"], []).append(st)

    touched = set(ace_by_season) | set(storms_by_season)
    for season in sorted(touched):
        if season < spec["start_year"] or season > current_season:
            continue
        daily = ace_by_season.get(season, [0.0] * 366)
        slist = []
        for st in sorted(storms_by_season.get(season, []),
                         key=lambda s: (s["d34"] if s["d34"] is not None
                                        else 999)):
            if st["d34"] is None:
                continue
            slist.append([st["d34"], st["d64"], st["d96"],
                          round(st["peak"]), st["name"]])
        years[str(season)] = {"cum": cumulative(daily), "s": slist}

    # A season with no system reaching 34 kt produces no rows above, but it
    # is a real zero and belongs in the record and in the normals. A season
    # the archive simply does not cover is a different thing and is left out
    # of both. Only a full-archive build can tell them apart, so only a full
    # build fills.
    gaps = list(existing.get("gaps", [])) if existing else []
    if fill_quiet:
        covered = acc.seen.get(basin, set())
        gaps = []
        for season in range(spec["start_year"], current_season + 1):
            if str(season) in years:
                continue
            if season in covered:
                years[str(season)] = {"cum": [0.0] * 366, "s": []}
            else:
                gaps.append(season)

    # The current season must always exist, even before its first storm —
    # in September the Southern Hemisphere seasons are only weeks old and
    # legitimately empty, and the tool should render a flat zero line rather
    # than fall over on a missing key.
    if str(current_season) not in years:
        years[str(current_season)] = {"cum": [0.0] * 366, "s": []}
        if current_season in gaps:
            gaps.remove(current_season)

    seasons = sorted(int(y) for y in years)
    payload = {
        "basin": basin,
        "key": spec["key"],
        "name": spec["name"],
        "season_start": spec["season_start"],
        "start_year": spec["start_year"],
        "end_year": seasons[-1] if seasons else current_season,
        "current_season": current_season,
        "baseline": list(BASELINE),
        "labels": labels,
        "provisional": sorted(provisional_seasons),
        "gaps": sorted(gaps),
        "years": years,
    }
    return payload


def current_coverage_check(payload, today):
    """Flag a current season that is implausibly empty for the date.

    A basin whose in-season feed dries up produces a season of near-zero ACE,
    which is indistinguishable in the output from a genuine record-quiet
    season — and the tool will happily label it "lowest since 1966". This
    compares the developing season's named-storm count against the baseline
    median for the same day of the season and marks it when the gap is too
    large to be weather.
    """
    d = payload
    start = d["season_start"]
    idx = DAY_INDEX[start][0].get((today.month, today.day), 0)
    cur = str(d["current_season"])
    lo, hi = d["baseline"]

    def storms_to(season):
        y = d["years"].get(str(season))
        if not y:
            return None
        return sum(1 for st in y["s"] if st[0] is not None and st[0] <= idx)

    have = storms_to(cur) or 0
    base = sorted(v for v in (storms_to(y) for y in range(lo, hi + 1))
                  if v is not None)
    median = base[len(base) // 2] if base else 0
    suspect = median >= 3 and have <= 0.3 * median
    d["current_check"] = {"storms": have, "normal_median": median,
                          "suspect": bool(suspect), "slot": idx}
    return suspect


def sanity_check(payload):
    """Cheap structural checks; raises rather than writing something broken."""
    key = payload["key"]
    years = payload["years"]
    if not years:
        raise RuntimeError("%s: no seasons produced" % key)
    for season, y in years.items():
        if len(y["cum"]) != 366:
            raise RuntimeError("%s %s: cum array is %d long"
                               % (key, season, len(y["cum"])))
        prev = -1.0
        for v in y["cum"]:
            if v < prev - 1e-9:
                raise RuntimeError("%s %s: cumulative series decreases"
                                   % (key, season))
            prev = v
        for s in y["s"]:
            d34, d64, d96 = s[0], s[1], s[2]
            if d64 is not None and d64 < d34:
                raise RuntimeError("%s %s: hurricane day before storm day"
                                   % (key, season))
            if d96 is not None and d64 is None:
                raise RuntimeError("%s %s: major without hurricane" % (key, season))
    lo, hi = payload["baseline"]
    span = hi - lo + 1
    have = sum(1 for yr in range(lo, hi + 1) if str(yr) in years)
    gaps_in_base = [g for g in payload.get("gaps", []) if lo <= g <= hi]
    if have + len(gaps_in_base) < span:
        raise RuntimeError("%s: baseline %d-%d has %d seasons and %d known "
                           "coverage gaps, which does not account for all %d"
                           % (key, lo, hi, have, len(gaps_in_base), span))
    if have < 20:
        raise RuntimeError("%s: only %d of %d baseline seasons have coverage — "
                           "too thin to compute a normal from"
                           % (key, have, span))


# ---------------------------------------------------------------------- main

def current_seasons(today):
    out = {}
    for spec in BASINS:
        if spec["season_start"] == 7:
            out[spec["basin"]] = today.year + 1 if today.month >= 7 else today.year
        else:
            out[spec["basin"]] = today.year
    return out


def run(mode, outdir, workdir, today):
    os.makedirs(outdir, exist_ok=True)
    existing = {}
    for spec in BASINS:
        p = os.path.join(outdir, "ace-%s.json" % spec["key"])
        if os.path.exists(p):
            with open(p) as f:
                existing[spec["key"]] = json.load(f)

    if mode == "auto":
        mode = "full" if len(existing) < len(BASINS) else "recent"
    name = FULL_FILE if mode == "full" else RECENT_FILE
    print("mode: %s  ->  %s" % (mode, name))

    path = os.path.join(workdir, name)
    download(name, path)
    size = validate_file(name, path)
    print("  downloaded %.1f MB" % (size / 1e6))

    acc = Accumulator()
    acc.ingest(path)
    if acc.latest is None:
        raise RuntimeError("%s parsed to zero usable observations" % name)
    stale = max(0, (dt.datetime.combine(today, dt.time()) - acc.latest).days)
    if stale > MAX_STALE_DAYS[name]:
        raise RuntimeError("newest observation in %s is %d days old (limit %d)"
                           % (name, stale, MAX_STALE_DAYS[name]))
    print("  %d qualifying points, newest %s (%d days old)"
          % (acc.n_points, acc.latest.isoformat(sep=" "), stale))
    for spec in BASINS:
        a = acc.admit.get(spec["basin"])
        if not a or not a[3]:
            continue
        print("    %-3s classified %6d | unclassified-provisional %6d | "
              "%3d%% of winds on whole 5 kt steps"
              % (spec["basin"], a[0], a[1], round(100 * a[2] / a[3])))

    # In recent mode the file only covers a trailing window, so a season is
    # only safe to rewrite if the window starts before the season does.
    cur = current_seasons(today)
    safe_floor = None
    if mode == "recent":
        # Earliest season fully inside the window, per basin, computed from
        # the oldest observation present.
        oldest = None
        for _basin, seasons in acc.ace.items():
            for s in seasons:
                oldest = s if oldest is None else min(oldest, s)
        safe_floor = (oldest + 1) if oldest is not None else None
        print("  recent window covers seasons from %s; rewriting %s onward"
              % (oldest, safe_floor))

    payloads = {}
    for spec in BASINS:
        prior = existing.get(spec["key"])
        if mode == "recent":
            if prior is None:
                raise RuntimeError("recent mode needs an existing ace-%s.json"
                                   % spec["key"])
            # Drop seasons the window cannot fully account for.
            if safe_floor is not None:
                for b in (spec["basin"],):
                    for season in list(acc.ace.get(b, {})):
                        if season < safe_floor:
                            acc.ace[b].pop(season, None)
                    for sid in [k for k, v in acc.storms.get(b, {}).items()
                                if v["season"] < safe_floor]:
                        acc.storms[b].pop(sid, None)
        prov = set(prior.get("provisional", [])) if prior else set()
        if mode == "recent" and safe_floor is not None:
            prov |= {s for s in acc.ace.get(spec["basin"], {})
                     if s >= safe_floor}
        else:
            # A full archive rebuild: IBTrACS marks operational tracks
            # PROVISIONAL, but rather than trust a per-row flag we treat the
            # current season and the one before it as not-yet-reanalysed.
            prov = {cur[spec["basin"]], cur[spec["basin"]] - 1}
        # A full rebuild replaces the record outright. Merging onto the
        # committed file would keep a season alive after reanalysis moved it
        # to another basin or dropped it, and that stale value would never
        # surface again. Recent mode does merge — it only ever sees a
        # trailing window and must not delete the rest of the archive.
        payload = build_basin_payload(acc, spec, cur[spec["basin"]], prov,
                                      existing=(prior if mode == "recent" else None),
                                      fill_quiet=(mode == "full"))
        sanity_check(payload)
        if current_coverage_check(payload, today):
            c = payload["current_check"]
            print("::warning::%s current season looks incomplete: %d named "
                  "storms to date against a 1991-2020 median of %d. The tool "
                  "will show a data-coverage notice instead of a ranking."
                  % (spec["name"], c["storms"], c["normal_median"]))
        payloads[spec["key"]] = payload

    stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    blob = json.dumps({k: v["years"] for k, v in payloads.items()},
                      sort_keys=True).encode()
    version = hashlib.sha256(blob).hexdigest()[:12]
    meta = {
        "generated_at": stamp.isoformat(),
        "as_of": today.isoformat(),
        "mode": mode,
        "source": {"dataset": "IBTrACS v04r01", "file": name,
                   "url": BASE + name, "bytes": size,
                   "latest_observation": acc.latest.isoformat(sep=" ")},
        "baseline": list(BASELINE),
        "version": version,
        "basins": [{"key": s["key"], "basin": s["basin"], "name": s["name"],
                    "start_year": s["start_year"],
                    "season_start": s["season_start"],
                    "current_season": cur[s["basin"]]} for s in BASINS],
    }

    # Write atomically: a validation failure above never reaches this point,
    # so a bad run leaves every committed file untouched.
    for key, payload in payloads.items():
        write_json(os.path.join(outdir, "ace-%s.json" % key), payload)
    write_json(os.path.join(outdir, "ace-meta.json"), meta)
    for key, payload in payloads.items():
        p = os.path.join(outdir, "ace-%s.json" % key)
        gaps = payload.get("gaps", [])
        print("  wrote %-14s %6.0f kB  %d seasons%s"
              % (os.path.basename(p), os.path.getsize(p) / 1024,
                 len(payload["years"]),
                 ("  gaps: " + ",".join(map(str, gaps))) if gaps else ""))
    print("version %s" % version)


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, path)


# ----------------------------------------------------------------- self test

SELFTEST_CSV = """\
SID,SEASON,NUMBER,BASIN,SUBBASIN,NAME,ISO_TIME,NATURE,LAT,LON,WMO_WIND,USA_WIND,TRACK_TYPE
,Year,#,,,,,,degrees_north,degrees_east,kts,kts,
2020001N10330,2020,01,NA,NA,ALPHA,2020-09-14 00:00:00,TS,15.0,-50.0,35,35,main
2020001N10330,2020,01,NA,NA,ALPHA,2020-09-14 03:00:00,TS,15.2,-50.4,40,45,main
2020001N10330,2020,01,NA,NA,ALPHA,2020-09-14 06:00:00,TS,15.4,-50.8,60,65,main
2020001N10330,2020,01,NA,NA,ALPHA,2020-09-14 12:00:00,TS,15.9,-51.5,90,100,main
2020001N10330,2020,01,NA,NA,ALPHA,2020-09-15 00:00:00,ET,17.0,-53.0,80,85,main
2020002N10330,2020,02,NA,NA,BETA,2020-09-14 06:00:00,TS,12.0,-40.0,30,30,main
2020003N10330,2020,03,NA,NA,GAMMA,2020-09-14 06:00:00,TS,12.0,-40.0,60,65,spur
2026010S10120,2026,10,SI,WA,DELTA,2025-12-20 06:00:00,TS,-15.0,100.0,60,70,main
2026010S10120,2026,10,SI,WA,DELTA,2026-01-05 06:00:00,TS,-16.0,101.0,60,70,main
"""


def selftest():
    ok = True

    def check(label, got, want):
        nonlocal ok
        good = got == want
        ok = ok and good
        print("  %-52s %s  (got %r)" % (label, "PASS" if good else "FAIL", got))

    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, "t.csv")
    with open(path, "w") as f:
        f.write(SELFTEST_CSV)

    acc = Accumulator()
    acc.ingest(path)

    # ACE: only synoptic hours, only TS/SS, only >= 34 kt, no spur tracks.
    # ALPHA 14 Sep: 35^2 + 65^2 + 100^2 = 1225 + 4225 + 10000 = 15450 -> 1.545
    # (the 03Z 45-kt point is off-synoptic; BETA's 30 kt is below threshold;
    #  GAMMA is a spur; ALPHA's 15 Sep point is extratropical.)
    slot = slot_of("NA", dt.date(2020, 9, 14))
    check("NA 2020 ACE deposited on 14 Sep",
          round(acc.ace["NA"][2020][slot], 3), 1.545)
    check("NA 2020 ACE total",
          round(sum(acc.ace["NA"][2020]), 3), 1.545)

    storms = acc.storms["NA"]
    check("NA storms counted (spur excluded, sub-34kt excluded)",
          len(storms), 1)
    a = storms["2020001N10330"]
    check("ALPHA peak wind", a["peak"], 100.0)
    check("ALPHA reaches 34/64/96 on the same slot",
          (a["d34"], a["d64"], a["d96"]), (slot, slot, slot))

    # Southern Hemisphere: Dec 2025 and Jan 2026 are the same season (2026).
    check("SI Dec-2025 and Jan-2026 land in one season",
          sorted(acc.ace["SI"].keys()), [2026])
    check("SI 2026 has both points",
          round(sum(acc.ace["SI"][2026]), 3), round(2 * 4900 / 1e4, 3))
    check("SI season day 0 is 1 Jul", DAY_INDEX[7][1][0], "Jul 1")
    check("SI 20 Dec precedes 5 Jan in season-day order",
          slot_of("SI", dt.date(2025, 12, 20)) < slot_of("SI", dt.date(2026, 1, 5)),
          True)

    # Global picks up every basin on a calendar year, so the SH storm splits.
    check("GL splits the SH season across two calendar years",
          [y for y in sorted(acc.ace["GL"].keys()) if y >= 2025], [2025, 2026])
    check("GL also carries the Atlantic season",
          2020 in acc.ace["GL"], True)

    # Leap-day slot is stable across seasons.
    check("29 Feb owns its own slot", DAY_INDEX[1][0][(2, 29)], 59)
    check("1 Mar is slot 60 in every year", DAY_INDEX[1][0][(3, 1)], 60)
    check("14 Sep is slot 257 in every year", DAY_INDEX[1][0][(9, 14)], 257)

    # Cumulative series forward-fills and never decreases.
    cum = cumulative(acc.ace["NA"][2020])
    check("cumulative is flat before the storm", cum[slot - 1], 0.0)
    check("cumulative holds after the storm", cum[365], 1.5)

    _global_slot_fix(acc)
    print("  %-52s PASS" % "global slot/season routing")

    # Quiet season vs. coverage gap — the distinction the normals depend on.
    gap_csv = SELFTEST_CSV.split("\n")[0] + "\n" + SELFTEST_CSV.split("\n")[1] + "\n" + """\
1991001N10080,1991,01,NI,BB,WEAK,1991-05-10 06:00:00,TS,15.0,88.0,25,30,main
1993001N10080,1993,01,NI,BB,REAL,1993-05-10 06:00:00,TS,15.0,88.0,60,65,main
"""
    gpath = os.path.join(tmpdir, "gap.csv")
    with open(gpath, "w") as f:
        f.write(gap_csv)
    gacc = Accumulator()
    gacc.ingest(gpath)
    spec = {"key": "ni", "basin": "NI", "name": "North Indian",
            "season_start": 1, "start_year": 1991}
    pay = build_basin_payload(gacc, spec, 1993, set(), fill_quiet=True)
    check("a covered but stormless season is kept as a real zero",
          str(1991) in pay["years"] and sum(pay["years"]["1991"]["cum"]) == 0, True)
    check("a season the archive does not cover is a gap, not a zero",
          pay["gaps"], [1992])
    check("the gap season is absent from years", "1992" in pay["years"], False)
    check("the active season is still present", "1993" in pay["years"], True)

    # NATURE handling — the live West Pacific failure, as a regression test.
    nat_csv = SELFTEST_CSV.split("\n")[0] + "\n" + SELFTEST_CSV.split("\n")[1] + "\n" + """\
2026050W10130,2026,05,WP,WP,PROVA,2026-09-01 06:00:00,NR,15.0,130.0,60,65,PROVISIONAL
2026051W10130,2026,05,WP,WP,JTWCA,2026-09-01 06:00:00,TS,15.0,130.0,60,65,US-PROVISIONAL
2026052W10130,2026,05,WP,WP,FINALNR,2026-09-01 06:00:00,NR,15.0,130.0,60,65,main
2026053W10130,2026,05,WP,WP,EXTRA,2026-09-01 06:00:00,ET,15.0,130.0,60,65,PROVISIONAL
2026054W10130,2026,05,WP,WP,DISTURB,2026-09-01 06:00:00,DS,15.0,130.0,60,65,PROVISIONAL
"""
    npath = os.path.join(tmpdir, "nat.csv")
    with open(npath, "w") as f:
        f.write(nat_csv)
    nacc = Accumulator()
    nacc.ingest(npath)
    got = sorted(st["name"] for st in nacc.storms.get("WP", {}).values())
    check("unclassified provisional row is counted", "Prova" in got, True)
    check("classified provisional row is counted", "Jtwca" in got, True)
    check("unclassified row on a FINAL track is still rejected",
          "Finalnr" in got, False)
    check("extratropical row is still rejected", "Extra" in got, False)
    check("disturbance row is still rejected", "Disturb" in got, False)

    shutil.rmtree(tmpdir)
    print("\nself-test: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def diagnose(path, today):
    """Report, per basin, what the current season actually contains upstream.

    Answers the question a build cannot: when a basin's current season comes
    out near-empty, is IBTrACS missing the storms entirely, or carrying them
    under a wind column this builder does not read?
    """
    cur = current_seasons(today)
    wind_cols, stats = [], {}
    first = True
    for row, col in iter_rows(path):
        if first:
            wind_cols = [c for c in col if c.endswith("_WIND")]
            first = False
        basin = row[col["BASIN"]].strip().upper()
        if basin not in BY_BASIN and basin != "SA":
            continue
        iso = row[col["ISO_TIME"]]
        yr, mo = int(iso[0:4]), int(iso[5:7])
        season = yr + 1 if (basin in SH_BASINS and mo >= 7) else yr
        if season != cur.get(basin, cur["NA"]):
            continue
        st = stats.setdefault(basin, {"rows": 0, "tropical": 0, "sids": set(),
                                      "sids_usa": set(), "natures": {},
                                      "tracks": {}, "winds": {}})
        st["rows"] += 1
        st["sids"].add(row[col["SID"]])
        nat = row[col["NATURE"]].strip().upper()
        st["natures"][nat] = st["natures"].get(nat, 0) + 1
        tt = row[col["TRACK_TYPE"]].strip()
        st["tracks"][tt] = st["tracks"].get(tt, 0) + 1
        if nat in TROPICAL_NATURES:
            st["tropical"] += 1
        for c in wind_cols:
            v = row[col[c]].strip()
            if v and v not in ("", " "):
                st["winds"][c] = st["winds"].get(c, 0) + 1
        if parse_wind(row[col["USA_WIND"]]) is not None:
            st["sids_usa"].add(row[col["SID"]])

    print("\nCurrent-season contents by basin (%s)\n" % today.isoformat())
    for basin in [b["basin"] for b in BASINS if b["basin"] != "GL"] + ["SA"]:
        st = stats.get(basin)
        print("-- %s  season %s" % (basin, cur.get(basin, "?")))
        if not st:
            print("     no rows at all\n")
            continue
        print("     rows %d | systems %d | systems with USA_WIND %d"
              % (st["rows"], len(st["sids"]), len(st["sids_usa"])))
        print("     nature   %s" % dict(sorted(st["natures"].items())))
        print("     track    %s" % dict(sorted(st["tracks"].items())))
        pop = sorted(st["winds"].items(), key=lambda kv: -kv[1])
        print("     winds    %s" % ", ".join("%s=%d" % (k, n) for k, n in pop))
        print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["auto", "full", "recent"],
                    default="auto")
    ap.add_argument("--out", default="public")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--diagnose", action="store_true",
                    help="report what IBTrACS carries for each basin's "
                         "current season, then exit without writing")
    ap.add_argument("--local", help="use a local IBTrACS CSV instead of "
                                    "downloading (testing only)")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    global download, validate_file
    if args.local:
        src = args.local
        download = lambda name, dest, **kw: shutil.copyfile(src, dest)  # noqa: E731
        validate_file = lambda name, path: os.path.getsize(path)        # noqa: E731

    today = dt.datetime.now(dt.timezone.utc).date()
    workdir = tempfile.mkdtemp(prefix="ace-")
    if args.diagnose:
        try:
            path = args.local
            if not path:
                path = os.path.join(workdir, RECENT_FILE)
                download(RECENT_FILE, path)
                validate_file(RECENT_FILE, path)
            diagnose(path, today)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
        return 0
    try:
        run(args.mode, args.out, workdir, today)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
