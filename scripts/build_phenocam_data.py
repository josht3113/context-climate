#!/usr/bin/env python3
"""
build_phenocam_data.py — autumn canopy colour curves for Northeast PhenoCam
sites, for contextclimate.io's fall-foliage.html (PhenoCam tab).

Source: PhenoCam Network provisional ROI time series (3-day summary product).
  ROI list   https://phenocam.nau.edu/webcam/roi/roilistinfo/   (JSON)
  Site info  https://phenocam.nau.edu/webcam/network/siteinfo/  (JSON)
  Series     https://phenocam.nau.edu/data/archive/<site>/ROI/
                 <site>_<veg>_<roi>_3day.csv
Imagery and data: CC BY 4.0, PhenoCam Network (fair use policy, Aug 2025).

Selection (all automatic, all reported by --diagnose):
  * deciduous broadleaf ROIs only (veg_type DB)
  * site location names one of NY, VT, NH, ME, MA, CT, RI, PA, NJ
  * one ROI per site: the one with the most qualifying autumns
  * a past autumn qualifies with >= MIN_PTS valid points between 1 Sep and
    15 Nov; a site needs >= MIN_YEARS qualifying past autumns to be kept.
    The current year is kept whenever it has any points (it is partial).

Values: gcc_90 and rcc_90 (90th-percentile green / red chromatic
coordinate over the ROI), 3-day windows, 1 Aug - 15 Dec. Points flagged by
PhenoCam's outlierflag_gcc_90, or with no images, are dropped.

Output (--out, default public/): phenocam-foliage.json
  {
    "generated": ISO-8601 UTC,
    "window": {"start": "08-01", "end": "12-15"},
    "current_year": YYYY,
    "sites": [
      { "site", "roi", "name", "state", "lat", "lon", "elev",
        "ack",                      # site acknowledgement text, if published
        "first", "last",            # first / last valid date in the series
        "years": { "YYYY": [[day_offset_from_Aug1, gcc, rcc], ...] } }
    ]
  }

Exit status is nonzero on any download, parse or validation failure, and the
committed file is never overwritten in that case.
"""

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROI_LIST_URL = "https://phenocam.nau.edu/webcam/roi/roilistinfo/"
SITE_INFO_URL = "https://phenocam.nau.edu/webcam/network/siteinfo/"
SERIES_URL = ("https://phenocam.nau.edu/data/archive/{site}/ROI/"
              "{site}_{veg}_{roi:04d}_3day.csv")
UA = "contextclimate.io PhenoCam builder (+https://contextclimate.io)"

# Coarse prefilter; the state-name match below is the real filter.
BOX = {"lat": (38.8, 47.6), "lon": (-80.6, -66.8)}
STATES = {
    "NY": "New York", "VT": "Vermont", "NH": "New Hampshire", "ME": "Maine",
    "MA": "Massachusetts", "CT": "Connecticut", "RI": "Rhode Island",
    "PA": "Pennsylvania", "NJ": "New Jersey",
}
WINDOW_START = (8, 1)     # Aug 1  -> offset 0
WINDOW_END = (12, 15)     # Dec 15
QUAL_START = (9, 1)       # qualification window for a past autumn
QUAL_END = (11, 15)
MIN_PTS = 15              # of ~25 possible 3-day points Sep 1 - Nov 15
MIN_YEARS = 3
MIN_SITES = 3             # fewer than this -> refuse to write
LIVE_DAYS = 7             # "live" = a valid point within this many days
PAUSE = 1.0               # seconds between series downloads


# ---------------------------------------------------------------- helpers

def log(msg):
    print(msg, flush=True)


def fetch(url, timeout=60, retries=3):
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last = e
        except Exception as e:  # noqa: BLE001 — network errors vary
            last = e
        time.sleep(3 * attempt)
    raise RuntimeError(f"download failed after {retries} tries: {url} ({last})")


def fnum(v):
    if v is None:
        return None
    v = str(v).strip()
    if v == "" or v.upper() in ("NA", "NAN", "NONE", "NULL"):
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return x if x == x else None


def pick(d, *keys):
    """First present, non-empty value among several possible key spellings."""
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def state_of(text):
    if not text:
        return None
    for abbr, name in STATES.items():
        if re.search(r"\b" + re.escape(name) + r"\b", text, re.I):
            return abbr
    m = re.search(r",\s*([A-Z]{2})\b", text)
    if m and m.group(1) in STATES:
        return m.group(1)
    return None


def in_box(lat, lon):
    return (lat is not None and lon is not None
            and BOX["lat"][0] <= lat <= BOX["lat"][1]
            and BOX["lon"][0] <= lon <= BOX["lon"][1])


def md_ge(d, md):
    return (d.month, d.day) >= md


def md_le(d, md):
    return (d.month, d.day) <= md


# ---------------------------------------------------------------- parsing

def parse_series(text):
    """PhenoCam ROI CSV -> (header dict, list of (date, gcc, rcc)).

    Header lines start with '#' ("# Site: harvard"); the first non-'#' line
    is the CSV column row.
    """
    header, body = {}, []
    for line in text.splitlines():
        if line.startswith("#"):
            k, _, v = line[1:].partition(":")
            if _:
                header[k.strip().lower()] = v.strip()
        elif line.strip():
            body.append(line)
    if not body:
        raise ValueError("no data rows")
    rdr = csv.DictReader(io.StringIO("\n".join(body)))
    need = {"date", "gcc_90", "rcc_90"}
    missing = need - set(rdr.fieldnames or [])
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    rows = []
    for r in rdr:
        try:
            d = dt.date.fromisoformat(r["date"].strip())
        except ValueError:
            continue
        if str(r.get("outlierflag_gcc_90", "")).strip() == "1":
            continue
        ic = fnum(r.get("image_count"))
        if ic is not None and ic <= 0:
            continue
        g, rc = fnum(r["gcc_90"]), fnum(r["rcc_90"])
        if g is None or rc is None or not (0 < g < 1) or not (0 < rc < 1):
            continue
        rows.append((d, g, rc))
    rows.sort()
    return header, rows


def autumns(rows, current_year):
    """Group rows into {year: [[offset, gcc, rcc], ...]} inside the window,
    and report which past years qualify."""
    years, qual_counts = {}, {}
    for d, g, rc in rows:
        if not (md_ge(d, WINDOW_START) and md_le(d, WINDOW_END)):
            continue
        off = (d - dt.date(d.year, *WINDOW_START)).days
        years.setdefault(d.year, []).append([off, round(g, 4), round(rc, 4)])
        if md_ge(d, QUAL_START) and md_le(d, QUAL_END):
            qual_counts[d.year] = qual_counts.get(d.year, 0) + 1
    qualifying = sorted(y for y, n in qual_counts.items()
                        if n >= MIN_PTS and y != current_year)
    keep = {y: pts for y, pts in years.items()
            if y in qualifying or y == current_year}
    return keep, qualifying


# ---------------------------------------------------------------- build

def load_candidates():
    rois = json.loads(fetch(ROI_LIST_URL))
    if isinstance(rois, dict):
        rois = pick(rois, "results", "rois", "data") or []
    try:
        sites = json.loads(fetch(SITE_INFO_URL))
        if isinstance(sites, dict):
            sites = pick(sites, "results", "sites", "data") or []
    except Exception as e:  # noqa: BLE001
        log(f"WARNING: site info unavailable ({e}); names/acks will be blank")
        sites = []
    info = {}
    for s in sites:
        name = pick(s, "site", "Sitename", "sitename")
        if name:
            info[name] = s

    cands, unmatched = [], []
    for r in rois:
        if str(pick(r, "veg_type", "Veg_Type") or "").upper() != "DB":
            continue
        site = pick(r, "site", "Sitename")
        try:
            roi_id = int(pick(r, "roi_id_number", "roi_id"))
        except (TypeError, ValueError):
            continue
        s = info.get(site, {})
        lat = fnum(pick(r, "lat", "Lat")) or fnum(pick(s, "lat", "Lat"))
        lon = fnum(pick(r, "lon", "Lon")) or fnum(pick(s, "lon", "Lon"))
        if not in_box(lat, lon):
            continue
        desc = (pick(s, "site_description", "Location", "location",
                     "description") or pick(r, "description") or "")
        st = state_of(desc)
        rec = {"site": site, "roi_id": roi_id, "lat": lat, "lon": lon,
               "elev": fnum(pick(s, "elev", "Elev")), "name": desc.strip(),
               "state": st,
               "ack": (pick(s, "site_acknowledgements",
                            "site_acknowledgement", "acknowledgements")
                       or "").strip()}
        (cands if st else unmatched).append(rec)
    return cands, unmatched


def build(today, diagnose=False):
    cands, unmatched = load_candidates()
    log(f"ROI candidates (DB, Northeast states): {len(cands)}; "
        f"in box but no state match: {len(unmatched)}")
    for u in unmatched:
        log(f"  skipped (no state match): {u['site']} DB_{u['roi_id']:04d} "
            f"'{u['name']}'")

    cy = today.year
    per_site = {}
    report = []
    for i, c in enumerate(sorted(cands, key=lambda c: (c["site"], c["roi_id"]))):
        if i:
            time.sleep(PAUSE)
        url = SERIES_URL.format(site=c["site"], veg="DB", roi=c["roi_id"])
        try:
            header, rows = parse_series(fetch(url))
        except urllib.error.HTTPError as e:
            report.append((c, None, [], f"HTTP {e.code}"))
            continue
        except Exception as e:  # noqa: BLE001
            report.append((c, None, [], f"error: {e}"))
            continue
        years, qual = autumns(rows, cy)
        report.append((c, rows, qual, "ok"))
        if not rows:
            continue
        best = per_site.get(c["site"])
        key = (len(qual), rows[-1][0], -c["roi_id"])
        if best is None or key > best["key"]:
            per_site[c["site"]] = {"key": key, "c": c, "rows": rows,
                                   "years": years, "qual": qual}

    log("")
    log(f"{'site':24} {'roi':8} {'st':3} {'autumns':>7} {'first':10}  "
        f"{'last':10} {'age':>5}  status")
    for c, rows, qual, status in report:
        if rows:
            first, last = rows[0][0], rows[-1][0]
            age = (today - last).days
            tag = "LIVE" if age <= LIVE_DAYS else "stale"
            log(f"{c['site']:24} DB_{c['roi_id']:04d} {c['state']:3} "
                f"{len(qual):7d} {first} {last} {age:5d}d  {tag}")
        else:
            log(f"{c['site']:24} DB_{c['roi_id']:04d} {c['state']:3} "
                f"{'-':>7} {'-':10}  {'-':10} {'-':>5}   {status}")

    kept = []
    for site, b in sorted(per_site.items()):
        if len(b["qual"]) < MIN_YEARS:
            continue
        g = sorted(p[1] for pts in b["years"].values() for p in pts)
        med = g[len(g) // 2]
        if not (0.25 <= med <= 0.6):
            log(f"WARNING: {site} median gcc {med:.3f} out of range — dropped")
            continue
        c = b["c"]
        kept.append({
            "site": site, "roi": f"DB_{c['roi_id']:04d}", "name": c["name"],
            "state": c["state"], "lat": c["lat"], "lon": c["lon"],
            "elev": c["elev"], "ack": c["ack"],
            "first": b["rows"][0][0].isoformat(),
            "last": b["rows"][-1][0].isoformat(),
            "years": {str(y): pts for y, pts in sorted(b["years"].items())},
        })

    live = [k for k in kept
            if (today - dt.date.fromisoformat(k["last"])).days <= LIVE_DAYS]
    log("")
    log(f"Sites kept: {len(kept)} (>= {MIN_YEARS} qualifying autumns); "
        f"live this season: {len(live)}")
    for k in kept:
        log(f"  {k['site']:24} {k['roi']}  {k['state']}  "
            f"{len(k['years'])} autumns  last {k['last']}")

    if diagnose:
        return None
    if len(kept) < MIN_SITES:
        raise RuntimeError(f"only {len(kept)} sites qualified "
                           f"(need {MIN_SITES}); not writing")
    return {
        "generated": dt.datetime.now(dt.timezone.utc)
                       .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"start": "%02d-%02d" % WINDOW_START,
                   "end": "%02d-%02d" % WINDOW_END},
        "current_year": cy,
        "sites": kept,
    }


def write_json(path, obj):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    json.load(open(tmp))  # round-trip check before replacing
    os.replace(tmp, path)
    log(f"wrote {path} ({os.path.getsize(path):,} bytes)")


# ---------------------------------------------------------------- selftest

SAMPLE = """# ROI Name: harvard_DB_1000
# 3-day summary product time series for harvard
#
# Site: harvard
# Veg Type: DB
# ROI ID Number: 1000
# Lat: 42.5378
# Lon: -72.1715
# Elev: 340
date,year,doy,image_count,midday_filename,gcc_90,rcc_90,outlierflag_gcc_90
2024-07-30,2024,212,40,x.jpg,0.4200,0.3300,0
2024-08-01,2024,214,40,x.jpg,0.4190,0.3310,0
2024-09-15,2024,259,40,x.jpg,0.4000,0.3500,0
2024-09-18,2024,262,40,x.jpg,NA,0.3600,NA
2024-10-10,2024,284,40,x.jpg,0.3600,0.4400,1
2024-10-13,2024,287,0,x.jpg,0.3500,0.4500,0
2024-12-15,2024,350,30,x.jpg,0.3300,0.3600,0
2024-12-18,2024,353,30,x.jpg,0.3300,0.3600,0
"""


def selftest():
    fails = 0

    def check(label, got, want):
        nonlocal fails
        ok = got == want
        fails += not ok
        log(f"{'ok  ' if ok else 'FAIL'} {label}: {got!r}"
            + ("" if ok else f" (want {want!r})"))

    hdr, rows = parse_series(SAMPLE)
    check("header site", hdr.get("site"), "harvard")
    check("header lat", hdr.get("lat"), "42.5378")
    # dropped: NA gcc, outlier flag 1, image_count 0
    check("valid rows", len(rows), 5)
    yrs, qual = autumns(rows, 2026)
    check("thin past year does not qualify", qual, [])
    check("thin past year dropped from output", list(yrs), [])
    yrs2, _ = autumns(rows, 2024)
    check("current year kept even if thin", list(yrs2), [2024])
    check("window excludes Jul 30 and Dec 18",
          [p[0] for p in yrs2[2024]], [0, 45, 136])
    check("Aug 1 offset", yrs2[2024][0], [0, 0.419, 0.331])
    many = [(dt.date(2023, 9, 1) + dt.timedelta(days=3 * i), 0.4, 0.35)
            for i in range(MIN_PTS)]
    _, q = autumns(many, 2026)
    check("full past year qualifies", q, [2023])
    check("state: full name", state_of("Harvard Forest, Petersham, Massachusetts"), "MA")
    check("state: abbreviation", state_of("Arbutus Lake, Newcomb, NY"), "NY")
    check("state: outside region", state_of("Dover, Delaware"), None)
    check("state: Main Street is not Maine", state_of("12 Main Street, Ohio"), None)
    check("box", (in_box(42.5, -72.2), in_box(45.5, -60.0)), (True, False))
    log("selftest " + ("passed" if not fails else f"FAILED ({fails})"))
    return 0 if not fails else 1


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--diagnose", action="store_true",
                    help="report candidate cameras and recency; write nothing")
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD)")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    try:
        payload = build(today, diagnose=a.diagnose)
    except Exception as e:  # noqa: BLE001
        log(f"ERROR: {e}")
        return 1
    if payload is not None:
        write_json(os.path.join(a.out, "phenocam-foliage.json"), payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
