#!/usr/bin/env python3
"""
build_tide_events.py — ContextClimate Tide Watch catalog builder.

Pulls NOAA CO-OPS water-level history for Cape May → Boston tide gauges,
derives a declustered storm-event catalog, and writes public/tide-catalog.json.

Per station:
  * verified hourly heights (product=hourly_height) and verified tide-cycle
    highs (product=high_low), MHHW datum, GMT, one calendar year per request
  * hourly astronomical predictions (product=predictions, interval=h)
  * preliminary 6-minute water levels (product=water_level) for the stretch
    after the verified record ends, 31 days per request
  * datums, flood thresholds and the NOAA sea-level trend from the metadata /
    derived-product APIs

Derived:
  surge      = observed − predicted − centred 365-day mean of (observed − predicted)
               (removes the sea-level offset between the record year and the
               tidal-datum epoch the predictions are referenced to)
  events     = window-declustered peaks (72 h separation) of water level and of
               surge, merged into one catalog; each event is scored on
                 wl      peak water level, ft above MHHW
                 surge   peak surge, ft
                 hrs     hours at/above the minor flood threshold (±36 h window)
                 adj     wl + sea-level trend × (reference year − event year)
  annual     = per-year coverage, max water level, max surge, flood hours,
               mean sea level relative to MHHW

Usage:
  python scripts/build_tide_events.py                 # full build (uses cache)
  python scripts/build_tide_events.py --stations 8518750 --diagnose
  python scripts/build_tide_events.py --offline       # cache only, no network

Cache: data_cache/tides/<station>/<product>_<year>.json.gz. Verified years older
than (current year − 1) are fetched once; newer years are always refreshed.
"""

import argparse
import datetime as dt
import gzip
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

# ─────────────────────────────────────────────────────────────── config ──

API = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
MDAPI = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations"
DPAPI = "https://api.tidesandcurrents.noaa.gov/dpapi/prod/webapi/product"
IBTRACS_URL = ("https://www.ncei.noaa.gov/data/international-best-track-archive-"
               "for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.NA.list.v04r01.csv")
APP = "contextclimate.io"

# South → north along the coast.
STATIONS = [
    ("8536110", "Cape May",          "NJ", "New Jersey"),
    ("8534720", "Atlantic City",     "NJ", "New Jersey"),
    ("8531680", "Sandy Hook",        "NJ", "New Jersey"),
    ("8519483", "Bergen Point",      "NY", "NY Harbor"),
    ("8518750", "The Battery",       "NY", "NY Harbor"),
    ("8516945", "Kings Point",       "NY", "Long Island Sound"),
    ("8467150", "Bridgeport",        "CT", "Long Island Sound"),
    ("8465705", "New Haven",         "CT", "Long Island Sound"),
    ("8461490", "New London",        "CT", "Long Island Sound"),
    ("8510560", "Montauk",           "NY", "Long Island"),
    ("8452660", "Newport",           "RI", "Rhode Island"),
    ("8454000", "Providence",        "RI", "Rhode Island"),
    ("8447930", "Woods Hole",        "MA", "Massachusetts"),
    ("8449130", "Nantucket",         "MA", "Massachusetts"),
    ("8443970", "Boston",            "MA", "Massachusetts"),
]

# Names for well-known non-tropical (or pre-naming-era) events. Matched when
# an event's peak falls on or between the given dates (UTC, inclusive, ±1 day).
# Takes priority over IBTrACS matching. Add storms here as needed.
NAMED_EVENTS = [
    ("1938-09-21", "1938-09-22", "1938 New England Hurricane"),
    ("1944-09-14", "1944-09-15", "1944 Great Atlantic Hurricane"),
    ("1950-11-25", "1950-11-26", "Great Appalachian Storm"),
    ("1962-03-06", "1962-03-08", "Ash Wednesday Storm"),
    ("1978-02-06", "1978-02-07", "Blizzard of 1978"),
    ("1984-03-28", "1984-03-29", "March 1984 Nor'easter"),
    ("1991-10-30", "1991-11-01", "1991 Perfect Storm"),
    ("1992-12-11", "1992-12-12", "December 1992 Nor'easter"),
    ("1993-03-13", "1993-03-14", "1993 Superstorm"),
    ("2018-01-04", "2018-01-05", "January 2018 Nor'easter"),
    ("2018-03-02", "2018-03-03", "March 2018 Nor'easter"),
]

SEP_H = 72            # declustering separation, hours
HALF_WIN = 36         # event window half-width, hours
PEAK_NEIGH = 12       # a candidate must be the max within ±12 h (one tidal cycle)
PEAK_GAP_H = 6        # missing data within ±6 h of a peak flags the event
TOP_N_EVENTS = 50     # events kept per metric (union written out)
TOP_N_PEAKS = 400     # compact peak lists kept for live ranking
RUNMEAN_H = 8766      # 365.25 days
RUNMEAN_MIN = 4000    # min valid hours in the running-mean window
IBTRACS_KM = 500
IBTRACS_HOURS = 30
MIN_COVERAGE = 0.5    # a year counts toward "record since" at ≥ 50 % hourly coverage

EPOCH = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)

# ─────────────────────────────────────────────────────────────── fetch ──

class Fetcher:
    def __init__(self, cache_dir, offline=False, gap=0.5, verbose=False):
        self.cache_dir = cache_dir
        self.offline = offline
        self.gap = gap
        self.verbose = verbose
        self.n_requests = 0
        self._last = 0.0

    def get(self, url, raw=False):
        if self.offline:
            raise RuntimeError("offline")
        wait = self.gap - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        # CO-OPS throttles bursts (observed: ~7 req/s from one client gets cut off
        # for minutes), so back off generously rather than hammering.
        delays = [5, 15, 45, 90, 180]
        for attempt in range(len(delays) + 1):
            self._last = time.time()
            self.n_requests += 1
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "contextclimate.io tide builder"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    body = r.read()
                if raw:
                    return body
                return json.loads(body.decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (408, 425, 429) or e.code >= 500:
                    if attempt < len(delays):
                        time.sleep(delays[attempt]); continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt < len(delays):
                    time.sleep(delays[attempt]); continue
                raise
        raise RuntimeError("unreachable")

    def datagetter(self, **params):
        p = dict(units="english", time_zone="gmt", format="json", application=APP)
        p.update(params)
        url = API + "?" + urllib.parse.urlencode(p)
        if self.verbose:
            print("   GET", url)
        return self.get(url)


def _cache_path(fetcher, sid, name, ext=".json"):
    d = os.path.join(fetcher.cache_dir, sid)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name + ext)


def _parse_t(s):
    # "2012-10-30 01:00" (GMT)
    return int(dt.datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc).timestamp())


def _no_data(js):
    err = js.get("error") if isinstance(js, dict) else None
    return err is not None


def fetch_year(fetcher, sid, product, year, now_year, **extra):
    """Returns list of [epoch_seconds, value] (value float) for one calendar year."""
    # yearly series are cached gzipped (~60 MB for all stations instead of ~600 MB)
    cp = _cache_path(fetcher, sid, f"{product}_{year}", ".json.gz")
    refresh = year >= now_year - 1
    if os.path.exists(cp) and (not refresh or fetcher.offline):
        with gzip.open(cp, "rt") as f:
            return json.load(f)
    if fetcher.offline:
        return []
    # hourly_height / high_low are capped at 365 days per request, so a leap
    # year is split in two; predictions accept a full leap year.
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    if leap and product != "predictions":
        spans = [(f"{year}0101", f"{year}0630 23:59"), (f"{year}0701", f"{year}1231 23:59")]
    else:
        spans = [(f"{year}0101", f"{year}1231 23:59")]
    got = []
    for begin, end in spans:
        params = dict(station=sid, product=product, begin_date=begin, end_date=end, datum="MHHW", **extra)
        try:
            js = fetcher.datagetter(**params)
        except urllib.error.HTTPError as e:
            print(f"   ! {sid} {product} {begin}: HTTP {e.code}")
            return []
        if not _no_data(js):
            got += js.get("predictions" if product == "predictions" else "data", [])
        elif "Range Limit" in json.dumps(js):
            print(f"   ! {sid} {product} {begin}: {js['error'].get('message','').strip()}")
    rows = []
    if True:
        for r in got:
            v = r.get("v", "")
            if v in ("", None):
                continue
            try:
                row = [_parse_t(r["t"]), float(v)]
            except (ValueError, KeyError):
                continue
            if product == "high_low":
                row.append((r.get("ty") or "").strip())
            rows.append(row)
    with gzip.open(cp, "wt") as f:
        json.dump(rows, f, separators=(",", ":"))
    return rows


def fetch_recent_6min(fetcher, sid, start_ts, end_ts):
    """Preliminary/verified 6-minute water level from start_ts to end_ts (31-day chunks)."""
    out = []
    t = start_ts
    while t < end_ts:
        t2 = min(t + 30 * 86400, end_ts)
        b = dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y%m%d %H:%M")
        e = dt.datetime.fromtimestamp(t2, dt.timezone.utc).strftime("%Y%m%d %H:%M")
        try:
            js = fetcher.datagetter(station=sid, product="water_level", begin_date=b, end_date=e, datum="MHHW")
        except urllib.error.HTTPError as ex:
            print(f"   ! {sid} water_level {b}: HTTP {ex.code}")
            js = {"error": {}}
        if not _no_data(js):
            for r in js.get("data", []):
                v = r.get("v", "")
                if v in ("", None):
                    continue
                try:
                    out.append([_parse_t(r["t"]), float(v)])
                except (ValueError, KeyError):
                    pass
        t = t2 + 360
    return out


def fetch_monthly_years(fetcher, sid, now_year):
    """Years with any monthly-mean data (one request, ≤ 200 years), plus monthly highs."""
    cp = _cache_path(fetcher, sid, "monthly_mean")
    if fetcher.offline:
        if os.path.exists(cp):
            with open(cp) as f:
                return json.load(f)
        return []
    try:
        js = fetcher.datagetter(station=sid, product="monthly_mean", begin_date="18500101",
                                end_date=f"{now_year}1231", datum="MHHW")
    except urllib.error.HTTPError as e:
        print(f"   ! {sid} monthly_mean: HTTP {e.code}")
        js = {"error": {}}
    rows = []
    if not _no_data(js):
        for r in js.get("data", []):
            try:
                y, m = int(r["year"]), int(r["month"])
            except (KeyError, ValueError):
                continue
            hi = r.get("highest")
            msl = r.get("MSL")
            mh = r.get("MHHW")
            if hi in (None, "") and mh in (None, ""):
                continue   # MSL-only history (e.g. Battery 1856–1919): no hourly heights exist
            rows.append([y, m, float(hi) if hi not in (None, "") else None,
                         float(msl) if msl not in (None, "") else None])
    if rows:
        with open(cp, "w") as f:
            json.dump(rows, f)
    elif os.path.exists(cp):
        with open(cp) as f:
            rows = json.load(f)
    return rows


def fetch_metadata(fetcher, sid):
    """Station name/lat/lon, datum offsets (ft relative to MHHW), flood thresholds
    (ft above MHHW), NOAA sea-level trend. Cached; refreshed every online run."""
    cp = _cache_path(fetcher, sid, "meta")
    meta = {}
    if os.path.exists(cp):
        with open(cp) as f:
            meta = json.load(f)
    if fetcher.offline:
        return meta

    def safe(url):
        try:
            return fetcher.get(url)
        except Exception as e:  # noqa: BLE001
            print(f"   ! {sid} {url.split('/')[-1]}: {e}")
            return None

    st = safe(f"{MDAPI}/{sid}.json")
    if st and st.get("stations"):
        s = st["stations"][0]
        meta["lat"] = s.get("lat")
        meta["lon"] = s.get("lng")
        meta["noaa_name"] = s.get("name")

    dm = safe(f"{MDAPI}/{sid}/datums.json?units=english")
    if dm and dm.get("datums"):
        vals = {d["name"]: d["value"] for d in dm["datums"] if d.get("value") is not None}
        if "MHHW" in vals:
            base = vals["MHHW"]
            # Height of MHHW above each datum: h_datum = h_MHHW + offset
            meta["mhhw_above"] = {k: round(base - vals[k], 3)
                                  for k in ("MLLW", "MSL", "NAVD88", "STND") if k in vals}
            meta["mhhw_stnd"] = base
        meta["epoch"] = dm.get("epoch")
        # Record extremes as published with the datums (cross-check only)
        for k_src, k_dst in (("max", "pub_max"), ("maxdate", "pub_max_date"), ("maxtime", "pub_max_time")):
            if dm.get(k_src) is not None:
                meta[k_dst] = dm[k_src]

    fl = safe(f"{MDAPI}/{sid}/floodlevels.json?units=english")
    if fl:
        meta["flood_raw"] = {k: fl.get(k) for k in
                             ("nws_minor", "nws_moderate", "nws_major",
                              "nos_minor", "nos_moderate", "nos_major", "action")}

    tr = safe(f"{DPAPI}/sealvltrends.json?station={sid}")
    if tr:
        rows = tr.get("SeaLvlTrends") or tr.get("sealvltrends") or []
        if rows:
            r = rows[0]
            units = (r.get("trendUnits") or "").lower()
            k = 2.54 if "inch" in units and "decade" in units else 1.0   # in/decade → mm/yr
            tv, te = _num(r.get("trend")), _num(r.get("trendError"))
            meta["slr"] = {
                "mm_yr": None if tv is None else round(tv * k, 2),
                "ci_mm_yr": None if te is None else round(te * k, 2),
                "start": r.get("startDate"),
                "end": r.get("endDate"),
            }

    with open(cp, "w") as f:
        json.dump(meta, f, indent=1)
    return meta


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def flood_thresholds(meta):
    """Minor/moderate/major in ft above MHHW. NWS first, NOS derived as fallback.
    floodlevels.json values are relative to station datum (STND)."""
    raw = meta.get("flood_raw") or {}
    base = meta.get("mhhw_stnd")
    out = {}
    for src in ("nws", "nos"):
        vals = [raw.get(f"{src}_{k}") for k in ("minor", "moderate", "major")]
        if all(v is not None for v in vals) and base is not None:
            out = {k: round(float(v) - base, 2) for k, v in zip(("minor", "moderate", "major"), vals)}
            out["source"] = src.upper()
            break
    if out and raw.get("action") is not None:
        out["action"] = round(float(raw["action"]) - base, 2)
    return out

# ─────────────────────────────────────────────────────────────── series ──

def to_hourly(rows, t0, n):
    """Place [ts, v] rows onto an hourly grid starting at t0 (epoch s)."""
    a = np.full(n, np.nan)
    if not rows:
        return a
    arr = np.asarray([[r[0], r[1]] for r in rows], dtype=float)
    idx = ((arr[:, 0] - t0) / 3600.0)
    on_hour = np.abs(idx - np.round(idx)) < 1e-6
    idx = np.round(idx[on_hour]).astype(int)
    vals = arr[on_hour, 1]
    ok = (idx >= 0) & (idx < n)
    a[idx[ok]] = vals[ok]
    return a


def running_nanmean(x, win, min_count):
    n = len(x)
    valid = ~np.isnan(x)
    cs = np.concatenate([[0.0], np.cumsum(np.where(valid, x, 0.0))])
    cc = np.concatenate([[0], np.cumsum(valid)])
    h = win // 2
    lo = np.clip(np.arange(n) - h, 0, n)
    hi = np.clip(np.arange(n) + h + 1, 0, n)
    s = cs[hi] - cs[lo]
    c = cc[hi] - cc[lo]
    out = np.full(n, np.nan)
    ok = c >= min_count
    out[ok] = s[ok] / c[ok]
    return out


def local_max_mask(x, k):
    """True where x is the (first) maximum within ±k samples, ignoring NaN."""
    n = len(x)
    xf = np.where(np.isnan(x), -np.inf, x)
    # sliding max via stride tricks on padded array
    pad = np.concatenate([np.full(k, -np.inf), xf, np.full(k, -np.inf)])
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(pad, 2 * k + 1)
    m = win.max(axis=1)
    return (xf == m) & np.isfinite(xf)


def decluster(x, thr, sep, neigh):
    """Window declustering: peaks ≥ thr, each the max within ±neigh, taken in
    descending order, rejecting any within ±sep hours of an accepted peak."""
    cand = np.where(local_max_mask(x, neigh) & (x >= thr))[0]
    if len(cand) == 0:
        return np.array([], dtype=int)
    order = cand[np.argsort(-x[cand], kind="stable")]
    blocked = np.zeros(len(x), dtype=bool)
    acc = []
    for i in order:
        if blocked[i]:
            continue
        acc.append(i)
        blocked[max(0, i - sep): i + sep + 1] = True
    return np.array(sorted(acc), dtype=int)


def _last_valid(a):
    v = a[~np.isnan(a)]
    return None if len(v) == 0 else round(float(v[-1]), 3)


def decimal_year(ts):
    d = dt.datetime.fromtimestamp(ts, dt.timezone.utc)
    y0 = dt.datetime(d.year, 1, 1, tzinfo=dt.timezone.utc)
    y1 = dt.datetime(d.year + 1, 1, 1, tzinfo=dt.timezone.utc)
    return d.year + (d - y0).total_seconds() / (y1 - y0).total_seconds()


def iso_h(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

# ─────────────────────────────────────────────────────────────── ibtracs ──

def load_ibtracs(fetcher, min_year):
    """Returns list of (name, season, ts array, lat array, lon array)."""
    cp = os.path.join(fetcher.cache_dir, "ibtracs_na.csv.gz")
    body = None
    if not fetcher.offline:
        try:
            body = fetcher.get(IBTRACS_URL, raw=True)
            with gzip.open(cp, "wb") as f:
                f.write(body)
        except Exception as e:  # noqa: BLE001
            print(f"   ! IBTrACS download failed: {e}")
    if body is None and os.path.exists(cp):
        with gzip.open(cp, "rb") as f:
            body = f.read()
    if body is None:
        return []
    import csv
    text = io.StringIO(body.decode("utf-8", errors="replace"))
    rdr = csv.reader(text)
    header = next(rdr)
    next(rdr, None)  # units row
    ix = {h: i for i, h in enumerate(header)}
    storms = {}
    for row in rdr:
        try:
            season = int(row[ix["SEASON"]])
        except (ValueError, KeyError):
            continue
        if season < min_year:
            continue
        sid = row[ix["SID"]]
        try:
            t = dt.datetime.strptime(row[ix["ISO_TIME"]], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
            lat = float(row[ix["LAT"]]); lon = float(row[ix["LON"]])
        except ValueError:
            continue
        s = storms.setdefault(sid, {"name": row[ix["NAME"]].strip(), "season": season, "pts": []})
        s["pts"].append((t.timestamp(), lat, lon))
    out = []
    for s in storms.values():
        p = np.asarray(s["pts"])
        out.append((s["name"], s["season"], p[:, 0], p[:, 1], p[:, 2]))
    return out


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def name_event(ts, lat, lon, storms):
    d = dt.datetime.fromtimestamp(ts, dt.timezone.utc).date()
    for a, b, nm in NAMED_EVENTS:
        da = dt.date.fromisoformat(a) - dt.timedelta(days=1)
        db = dt.date.fromisoformat(b) + dt.timedelta(days=1)
        if da <= d <= db:
            return nm, "list"
    if lat is None or not storms:
        return None, None
    best = None
    for name, season, t, la, lo in storms:
        m = np.abs(t - ts) <= IBTRACS_HOURS * 3600
        if not m.any():
            continue
        dist = haversine_km(lat, lon, la[m], lo[m]).min()
        if dist <= IBTRACS_KM and (best is None or dist < best[0]):
            best = (dist, name, season)
    if best is None:
        return None, None
    nm = best[1]
    if nm in ("", "NOT_NAMED", "UNNAMED"):
        nm = f"{best[2]} tropical cyclone"
    else:
        nm = nm.title()
    return nm, "ibtracs"

# ─────────────────────────────────────────────────────────────── build ──

def build_station(fetcher, sid, name, state, region, now, storms, max_years=None, diagnose=False):
    now_year = now.year
    print(f"\n── {sid} {name}, {state}")
    meta = fetch_metadata(fetcher, sid)
    monthly = fetch_monthly_years(fetcher, sid, now_year)
    years = sorted({r[0] for r in monthly})
    if not years:
        # fall back: probe from 1900 would be expensive; scan cache instead
        d = os.path.join(fetcher.cache_dir, sid)
        years = sorted({int(f.split("_")[-1].split(".")[0]) for f in os.listdir(d)
                        if f.startswith("hourly_height_")}) if os.path.isdir(d) else []
    if not years:
        print("   ! no data years found — station skipped")
        return None
    if now_year not in years:
        years.append(now_year)
    years = [y for y in years if y <= now_year]
    if max_years:
        years = years[-max_years:]
    y0 = years[0]
    t0 = int(dt.datetime(y0, 1, 1, tzinfo=dt.timezone.utc).timestamp())
    t_end = int(now.replace(minute=0, second=0, microsecond=0).timestamp())
    n = (t_end - t0) // 3600 + 1
    print(f"   years {y0}–{years[-1]} ({len(years)} with data), {n:,} hours")

    obs_rows, hl_rows, pred_rows = [], [], []
    for y in range(y0, now_year + 1):
        if y in years:
            obs_rows += fetch_year(fetcher, sid, "hourly_height", y, now_year)
            hl_rows += fetch_year(fetcher, sid, "high_low", y, now_year)
        pred_rows += fetch_year(fetcher, sid, "predictions", y, now_year, interval="h")

    h = to_hourly(obs_rows, t0, n)
    p = to_hourly(pred_rows, t0, n)

    # Preliminary tail: 6-minute water level after the verified hourly record ends
    valid_idx = np.where(~np.isnan(h))[0]
    last_ver = t0 + int(valid_idx[-1]) * 3600 if len(valid_idx) else t0
    prelim_from = None
    six = []
    if t_end - last_ver > 3 * 3600:
        start = max(last_ver + 3600, t_end - 400 * 86400)
        six = fetch_recent_6min(fetcher, sid, start, t_end)
        if six:
            hh = to_hourly(six, t0, n)
            fill = np.isnan(h) & ~np.isnan(hh)
            if fill.any():
                h[fill] = hh[fill]
                prelim_from = start
    six_arr = np.asarray(six, dtype=float) if six else np.zeros((0, 2))
    hl_arr = np.asarray([[r[0], r[1]] for r in hl_rows if len(r) >= 2 and r[2].startswith("H")],
                        dtype=float) if hl_rows else np.zeros((0, 2))

    if diagnose:
        print(f"   hourly rows {len(obs_rows):,}  highs {len(hl_arr):,}  preds {len(pred_rows):,}  6-min {len(six):,}")
        print(f"   meta: {json.dumps({k: meta.get(k) for k in ('mhhw_above','flood_raw','slr','epoch','pub_max','pub_max_date')})}")

    # Surge
    resid = h - p
    msl_off = running_nanmean(resid, RUNMEAN_H, RUNMEAN_MIN)
    surge = resid - msl_off

    # Flood thresholds, sea-level trend
    flood = flood_thresholds(meta)
    minor = flood.get("minor")

    yrs_idx = np.array([dt.datetime.fromtimestamp(t0 + i * 3600, dt.timezone.utc).year
                        for i in range(0, n, 24)])
    year_of_hour = np.repeat(yrs_idx, 24)[:n]

    annual = []
    ann_msl = []
    for y in range(y0, now_year + 1):
        m = year_of_hour == y
        tot = int(m.sum())
        if tot == 0:
            continue
        hv = h[m]
        cov = float(np.sum(~np.isnan(hv))) / tot
        mx = float(np.nanmax(hv)) if cov > 0 else None
        sv = surge[m]
        smx = float(np.nanmax(sv)) if np.any(~np.isnan(sv)) else None
        fh = int(np.sum(hv >= minor)) if (minor is not None and cov > 0) else None
        msl = float(np.nanmean(hv)) if cov >= 0.8 else None
        if msl is not None and y < now_year:
            ann_msl.append((y + 0.5, msl))
        ov = msl_off[m]
        off = float(np.nanmean(ov)) if np.any(~np.isnan(ov)) else None
        annual.append([y, round(cov, 3),
                       None if mx is None else round(mx, 2),
                       None if smx is None else round(smx, 2),
                       fh,
                       None if msl is None else round(msl, 3),
                       None if off is None else round(off, 3)])

    # Sea-level trend: NOAA published if available, else OLS on annual means
    slr = dict(meta.get("slr") or {})
    fit = None
    if len(ann_msl) >= 20:
        X = np.array([a for a, _ in ann_msl]); Y = np.array([b for _, b in ann_msl])
        A = np.vstack([X, np.ones_like(X)]).T
        coef, *_ = np.linalg.lstsq(A, Y, rcond=None)
        fit = coef[0] * 304.8  # ft/yr → mm/yr
    if slr.get("mm_yr") is None and fit is not None:
        slr = {"mm_yr": round(float(fit), 2), "source": "fit"}
    elif slr.get("mm_yr") is not None:
        slr["source"] = "NOAA"
    if fit is not None:
        slr["fit_mm_yr"] = round(float(fit), 2)
    rate_ft = (slr.get("mm_yr") or 0.0) / 304.8
    ref_year = round(decimal_year(now.timestamp()), 2)

    # ── events
    hv_valid = h[~np.isnan(h)]
    sv_valid = surge[~np.isnan(surge)]
    if len(hv_valid) < 24 * 365:
        print("   ! under a year of hourly data — station skipped")
        return None
    thr_h = float(np.percentile(hv_valid, 99.0))
    if minor is not None:
        thr_h = min(thr_h, minor)
    thr_s = float(np.percentile(sv_valid, 99.5))
    pk_h = decluster(h, thr_h, SEP_H, PEAK_NEIGH)
    pk_s = decluster(surge, thr_s, SEP_H, PEAK_NEIGH)

    # plain Python ints: numpy's default integer is 32-bit on Windows and in
    # wasm builds, and hour-index × 3600 overflows it for century-long records
    anchors = [int(x) for x in pk_h]
    anchor_arr = np.array(anchors, dtype=int)
    merged_s = {}
    extra = []
    for j in (int(x) for x in pk_s):
        if len(anchor_arr):
            k = int(np.argmin(np.abs(anchor_arr - j)))
            if abs(int(anchor_arr[k]) - j) <= SEP_H:
                a = int(anchor_arr[k])
                if a not in merged_s or surge[j] > surge[merged_s[a]]:
                    merged_s[a] = j
                continue
        extra.append(j)
    all_anchors = sorted(anchors + extra)

    events = []
    for a in all_anchors:
        lo, hi = max(0, a - HALF_WIN), min(n, a + HALF_WIN)
        seg = h[lo:hi]
        if np.all(np.isnan(seg)):
            continue
        # water-level peak: hourly max, raised by any verified high or 6-min value near it
        i_h = lo + int(np.nanargmax(seg))
        wl = float(h[i_h]); wl_ts = t0 + i_h * 3600
        ts_lo, ts_hi = t0 + lo * 3600, t0 + hi * 3600
        for arr in (hl_arr, six_arr):
            if len(arr):
                m = (arr[:, 0] >= ts_lo) & (arr[:, 0] < ts_hi)
                if m.any():
                    k = int(np.argmax(np.where(m, arr[:, 1], -np.inf)))
                    if arr[k, 1] > wl:
                        wl = float(arr[k, 1]); wl_ts = int(arr[k, 0])
        sseg = surge[lo:hi]
        if np.any(~np.isnan(sseg)):
            i_s = lo + int(np.nanargmax(sseg))
            sg = float(surge[i_s]); sg_ts = t0 + i_s * 3600
        else:
            sg, sg_ts = None, None
        if a in merged_s:
            j = merged_s[a]
            if sg is None or surge[j] > sg:
                sg = float(surge[j]); sg_ts = t0 + j * 3600
        hrs = int(np.sum(seg >= minor)) if minor is not None else None
        ipk = (wl_ts - t0) // 3600
        near = h[max(0, ipk - PEAK_GAP_H): min(n, ipk + PEAK_GAP_H + 1)]
        # missing hours next to the peak, or a window more than a quarter empty,
        # mean the true event maximum may not be in the record
        gap = bool(np.any(np.isnan(near)) or np.mean(np.isnan(seg)) > 0.25)
        adj = wl + rate_ft * (ref_year - decimal_year(wl_ts))
        prelim = bool(prelim_from is not None and wl_ts >= prelim_from)
        io = int(np.clip((wl_ts - t0) // 3600, 0, n - 1))
        events.append({
            "off": None if np.isnan(msl_off[io]) else float(msl_off[io]),
            "t": iso_h(wl_ts), "wl": wl, "surge": sg, "st": iso_h(sg_ts) if sg_ts else None,
            "hrs": hrs, "adj": adj, "gap": gap, "prelim": prelim, "_ts": wl_ts,
        })

    # NOAA's monthly extremes sometimes hold a peak that the hourly and high/low
    # records lost when a gauge failed (1938 and 1954 in southern New England).
    # Where a month's published highest beats every event in that month, the
    # month's gap-flagged event (else its largest) is raised to it.
    for yy, mo, hi_v, _msl in monthly:
        if hi_v is None or hi_v < thr_h:
            continue
        ms = dt.datetime(yy, mo, 1, tzinfo=dt.timezone.utc).timestamp()
        me = dt.datetime(yy + (mo == 12), mo % 12 + 1, 1, tzinfo=dt.timezone.utc).timestamp()
        i0, i1 = max(0, int((ms - t0) // 3600)), max(0, min(n, int((me - t0) // 3600)))
        seg = h[i0:i1]
        rec_max = float(np.nanmax(seg)) if len(seg) and np.any(~np.isnan(seg)) else -np.inf
        for arr in (hl_arr, six_arr):
            if len(arr):
                mm = (arr[:, 0] >= ms) & (arr[:, 0] < me)
                if mm.any():
                    rec_max = max(rec_max, float(arr[mm, 1].max()))
        if hi_v <= rec_max + 0.05:
            continue          # the month's peak is in the record we have
        inm = [e for e in events if ms <= e["_ts"] < me]
        gaps = [e for e in inm if e["gap"]]
        # longest run of missing hours in the month: where a failed gauge stopped
        miss = np.isnan(seg) if len(seg) else np.zeros(0, dtype=bool)
        run_start, run_len, cur_s, cur_l = None, 0, None, 0
        for k, mv in enumerate(miss):
            if mv:
                cur_s = k if cur_l == 0 else cur_s
                cur_l += 1
                if cur_l > run_len:
                    run_start, run_len = cur_s, cur_l
            else:
                cur_l = 0
        # NOAA's published record carries its date (and usually time, GMT; 00:00
        # means unknown): when this month holds that record, anchor to it
        pub_ts = None
        pd_, pv_ = meta.get("pub_max_date"), meta.get("pub_max")
        if pd_ and pv_ is not None and meta.get("mhhw_stnd") is not None and pd_[:6] == f"{yy}{mo:02d}" \
                and abs(hi_v - (float(pv_) - meta["mhhw_stnd"])) < 0.02:
            tm = meta.get("pub_max_time") or "00:00"
            pub_ts = int(dt.datetime.strptime(pd_ + (tm if tm != "00:00" else "17:00"), "%Y%m%d%H:%M")
                         .replace(tzinfo=dt.timezone.utc).timestamp())
        if pub_ts is not None:
            near = [x for x in events if abs(x["_ts"] - pub_ts) <= HALF_WIN * 3600]
            if near:
                e = max(near, key=lambda x: x["wl"])
            else:
                e = {"off": None, "t": iso_h(pub_ts), "wl": hi_v, "surge": None, "st": None, "hrs": None,
                     "adj": hi_v, "gap": True, "prelim": False, "_ts": pub_ts}
                events.append(e)
            e["gap"] = e["gap"] or run_len >= 6
            if (meta.get("pub_max_time") or "00:00") == "00:00":
                e["notime"] = True
        elif gaps:
            e = max(gaps, key=lambda x: x["wl"])
        elif run_len >= 6:
            ts = t0 + (i0 + run_start) * 3600
            near = [x for x in events if abs(x["_ts"] - ts) <= HALF_WIN * 3600]
            if near:
                e = max(near, key=lambda x: x["wl"])
            else:
                e = {"off": None, "t": iso_h(ts), "wl": hi_v, "surge": None, "st": None, "hrs": None,
                     "adj": hi_v, "gap": True, "prelim": False, "_ts": int(ts)}
                events.append(e)
            e["gap"] = True
            e["notime"] = True
        elif inm:
            e = max(inm, key=lambda x: x["wl"])   # 6-min peak between hourly readings
        else:
            ts = t0 + (i0 + int(np.nanargmax(seg))) * 3600 if len(seg) and np.any(~np.isnan(seg)) else int(ms + 15 * 86400)
            e = {"off": None, "t": iso_h(ts), "wl": hi_v, "surge": None, "st": None, "hrs": None,
                 "adj": hi_v, "gap": False, "prelim": False, "_ts": int(ts)}
            events.append(e)
        e["wl"] = float(hi_v)
        e["mx"] = True
        e["adj"] = e["wl"] + rate_ft * (ref_year - decimal_year(e["_ts"]))

    def top(key, k):
        e = [x for x in events if x.get(key) is not None and (key != "hrs" or x["hrs"] > 0)]
        return sorted(e, key=lambda x: -x[key])[:k]

    keep = {}
    for key in ("wl", "surge", "hrs", "adj"):
        for e in top(key, TOP_N_EVENTS):
            keep[e["t"]] = e
    kept = sorted(keep.values(), key=lambda x: x["_ts"])

    lat, lon = meta.get("lat"), meta.get("lon")
    for e in kept:
        nm, src = name_event(e["_ts"], lat, lon, storms)
        if nm:
            e["name"] = nm

    out_events = []
    for e in kept:
        o = {"t": e["t"], "wl": round(e["wl"], 2),
             "surge": None if e["surge"] is None else round(e["surge"], 2),
             "st": e["st"], "hrs": e["hrs"], "adj": round(e["adj"], 2),
             "off": None if e["off"] is None else round(e["off"], 3)}
        if e.get("name"): o["name"] = e["name"]
        if e["gap"]: o["gap"] = 1
        if e["prelim"]: o["prelim"] = 1
        if e.get("mx"): o["mx"] = 1
        if e.get("notime"): o["notime"] = 1
        out_events.append(o)

    peaks_wl = sorted(events, key=lambda x: -x["wl"])[:TOP_N_PEAKS]
    peaks_sg = sorted([x for x in events if x["surge"] is not None], key=lambda x: -x["surge"])[:TOP_N_PEAKS]

    cov_years = [a[0] for a in annual if a[1] >= MIN_COVERAGE]
    rec = {"start": cov_years[0] if cov_years else y0, "first": y0, "end": now_year,
           "verified_through": iso_h(last_ver), "prelim_from": iso_h(prelim_from) if prelim_from else None}

    # cross-check vs monthly-mean "highest"
    mm_hi = [r for r in monthly if r[2] is not None]
    if mm_hi:
        top_m = max(mm_hi, key=lambda r: r[2])
        rec["monthly_highest"] = [top_m[0], top_m[1], round(top_m[2], 2)]

    res = {
        "id": sid, "name": name, "state": state, "region": region,
        "lat": lat, "lon": lon,
        "mhhw_above": meta.get("mhhw_above") or {},
        "epoch": meta.get("epoch"),
        "flood": flood,
        "slr": slr, "ref_year": ref_year,
        "record": rec,
        "thresholds": {"wl": round(thr_h, 2), "surge": round(thr_s, 2)},
        "annual": annual,
        "annual_cols": ["year", "coverage", "max_wl", "max_surge", "flood_hours", "mean_level", "resid_offset"],
        "off_now": _last_valid(msl_off),
        "events": out_events,
        "peaks_wl": [[round(x["wl"], 2), x["t"]] for x in peaks_wl],
        "peaks_surge": [[round(x["surge"], 2), x["st"]] for x in peaks_sg],
        "n_events": len(events),
    }
    if meta.get("pub_max") is not None and meta.get("mhhw_stnd") is not None:
        # NOAA's published record maximum (datums page), converted to ft above MHHW
        res["pub_max"] = [round(float(meta["pub_max"]) - meta["mhhw_stnd"], 2), meta.get("pub_max_date")]
    tw = top("wl", 5)
    print(f"   {len(events)} events · top wl: " + ", ".join(f"{e['t'][:10]} {e['wl']:.2f}" for e in tw))
    if res.get("pub_max"):
        print(f"   check: NOAA published max {res['pub_max'][0]:.2f} ft MHHW on {res['pub_max'][1]}")
    if rec.get("monthly_highest"):
        print(f"   check: monthly_mean highest {rec['monthly_highest']}")
    return res


def validate(catalog):
    """Bail rather than write a broken catalog."""
    probs = []
    if len(catalog["stations"]) < len(STATIONS) * 0.6:
        probs.append(f"only {len(catalog['stations'])} of {len(STATIONS)} stations built")
    for s in catalog["stations"]:
        if not s["events"]:
            probs.append(f"{s['id']} has no events")
        if s["record"]["end"] - s["record"]["start"] < 5:
            probs.append(f"{s['id']} record under 5 years")
        for e in s["events"]:
            if not (-5 < e["wl"] < 20):
                probs.append(f"{s['id']} implausible wl {e['wl']} at {e['t']}")
                break
    return probs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/tide-catalog.json")
    ap.add_argument("--cache", default="data_cache/tides")
    ap.add_argument("--stations", nargs="*")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--diagnose", action="store_true")
    ap.add_argument("--max-years", type=int)
    ap.add_argument("--no-ibtracs", action="store_true")
    ap.add_argument("--now", help="override build time, ISO (testing)")
    args = ap.parse_args()

    now = dt.datetime.now(dt.timezone.utc) if not args.now else \
        dt.datetime.fromisoformat(args.now).replace(tzinfo=dt.timezone.utc)
    os.makedirs(args.cache, exist_ok=True)
    fetcher = Fetcher(args.cache, offline=args.offline, verbose=args.diagnose)

    storms = [] if args.no_ibtracs else load_ibtracs(fetcher, 1900)
    print(f"IBTrACS storms loaded: {len(storms)}")

    todo = [s for s in STATIONS if not args.stations or s[0] in args.stations]
    built = []
    for sid, name, st, region in todo:
        try:
            r = build_station(fetcher, sid, name, st, region, now, storms,
                              max_years=args.max_years, diagnose=args.diagnose)
        except Exception as e:  # noqa: BLE001
            print(f"   ! {sid} failed: {e!r}")
            r = None
        if r:
            built.append(r)

    catalog = {
        "generated": now.strftime("%Y-%m-%dT%H:%MZ"),
        "source": "NOAA CO-OPS (tidesandcurrents.noaa.gov); IBTrACS v04r01",
        "units": "ft", "datum": "MHHW",
        "sep_hours": SEP_H, "window_hours": HALF_WIN,
        "stations": built,
    }
    if not args.stations:
        probs = validate(catalog)
        if probs:
            print("\nVALIDATION FAILED — catalog not written:")
            for p in probs:
                print("  -", p)
            sys.exit(1)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    if args.stations and os.path.exists(args.out):
        # partial rebuild: merge into existing catalog
        with open(args.out) as f:
            old = json.load(f)
        by = {s["id"]: s for s in old.get("stations", [])}
        for s in built:
            by[s["id"]] = s
        order = [s[0] for s in STATIONS]
        catalog["stations"] = [by[i] for i in order if i in by]
    with open(args.out, "w") as f:
        json.dump(catalog, f, separators=(",", ":"))
    print(f"\nwrote {args.out} ({os.path.getsize(args.out)/1024:.0f} KB), "
          f"{len(catalog['stations'])} stations, {fetcher.n_requests} requests")


if __name__ == "__main__":
    main()
