#!/usr/bin/env python3
"""Build the per-station wind climatology files read by wind-hour-heatmap.html.

Output (one file per station, plus an index):
  public/wind-climo/<ICAO>.json
  public/wind-climo/index.json

Each station file holds
  diurnal  1991-2020 month x hour normals: mean speed, vector-mean direction,
           steadiness, % calm, % of hours with a gust
  monthly  one mean speed per year-month, FIRST_YEAR to the last complete month
  asos     ASOS commissioning date from NCEI HOMR (null if unavailable)

Source: IEM ASOS archive (asos.py), routine + special reports, fetched one UTC
year at a time for every station in a single request. IEM partitions its tables
by UTC year, so a request that stays inside one UTC year is the cheapest query
the service can run. IEM throttles to one request per second per IP.

Hourly values follow the heatmap suite's observation selection:
  * an ob at :45 or later belongs to the next hour's window
  * the routine ob (the year's most common report minute) supplies the wind
  * a special fills in only when the routine ob has no wind, and then it is
    the special closest to the routine time
  * a gust counts for the hour if any ob in the window reported one

Modes
  full         fetch FIRST_YEAR..now, rebuild everything
  incremental  refetch the last two UTC years, replace those years' monthly
               rows, keep the stored normals
  auto         (default) incremental if every requested station already has a
               file in the current format, otherwise full

The script bails without writing anything if a year cannot be fetched after
retries and splitting.
"""

import argparse
import csv
import http.client
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

IEM_BASE = os.environ.get("IEM_BASE", "https://mesonet.agron.iastate.edu")
IEM_URL = IEM_BASE.rstrip("/") + "/cgi-bin/request/asos.py"
HOMR_URL = os.environ.get(
    "HOMR_URL", "https://www.ncei.noaa.gov/access/homr/file/asos-stations.txt")

FORMAT_VERSION = 1
FIRST_YEAR = 1970
NORMALS = (1991, 2020)
KT_TO_MPH = 1.15078

MIN_GAP_S = float(os.environ.get("WIND_MIN_GAP_S", "1.5"))   # IEM: 1 request / second / IP
RETRY_WAITS = tuple(float(x) for x in os.environ.get("WIND_RETRY_WAITS", "10,30,90").split(","))
REQUEST_TIMEOUT = 900        # socket timeout per request
STATIONS_PER_REQUEST = 10    # smaller responses are less likely to be cut off mid-stream

DIURNAL_MIN_N = 100          # hours per month-hour cell over 30 years (~900 possible)
MONTH_MIN_HOURS = 150        # hourly values in a year-month
MONTH_MIN_BINS = 8           # hour-of-day bins with >= MONTH_BIN_MIN_N values
MONTH_BIN_MIN_N = 5

# (ICAO, display name, IANA zone) -- keep in sync with STATION_GROUPS in
# public/wind-hour-heatmap.html
STATIONS = [
    ("KISP", "Islip, NY", "America/New_York"),
    ("KBOS", "Boston, MA", "America/New_York"),
    ("KJFK", "New York / JFK", "America/New_York"),
    ("KPHL", "Philadelphia, PA", "America/New_York"),
    ("KPVD", "Providence, RI", "America/New_York"),
    ("KPWM", "Portland, ME", "America/New_York"),
    ("KBTV", "Burlington, VT", "America/New_York"),
    ("KDCA", "Washington, DC", "America/New_York"),
    ("KBWI", "Baltimore, MD", "America/New_York"),
    ("KCLT", "Charlotte, NC", "America/New_York"),
    ("KATL", "Atlanta, GA", "America/New_York"),
    ("KBNA", "Nashville, TN", "America/Chicago"),
    ("KMIA", "Miami, FL", "America/New_York"),
    ("KMCO", "Orlando, FL", "America/New_York"),
    ("KTPA", "Tampa, FL", "America/New_York"),
    ("KORD", "Chicago, IL", "America/Chicago"),
    ("KMSP", "Minneapolis, MN", "America/Chicago"),
    ("KDTW", "Detroit, MI", "America/Detroit"),
    ("KCLE", "Cleveland, OH", "America/New_York"),
    ("KSTL", "St. Louis, MO", "America/Chicago"),
    ("KMCI", "Kansas City, MO", "America/Chicago"),
    ("KIND", "Indianapolis, IN", "America/Indiana/Indianapolis"),
    ("KOKC", "Oklahoma City, OK", "America/Chicago"),
    ("KDFW", "Dallas–Fort Worth, TX", "America/Chicago"),
    ("KIAH", "Houston, TX", "America/Chicago"),
    ("KMSY", "New Orleans, LA", "America/Chicago"),
    ("KSAT", "San Antonio, TX", "America/Chicago"),
    ("KDEN", "Denver, CO", "America/Denver"),
    ("KABQ", "Albuquerque, NM", "America/Denver"),
    ("KSLC", "Salt Lake City, UT", "America/Denver"),
    ("KCYS", "Cheyenne, WY", "America/Denver"),
    ("KAMA", "Amarillo, TX", "America/Chicago"),
    ("KSEA", "Seattle, WA", "America/Los_Angeles"),
    ("KPDX", "Portland, OR", "America/Los_Angeles"),
    ("KSFO", "San Francisco, CA", "America/Los_Angeles"),
    ("KLAX", "Los Angeles, CA", "America/Los_Angeles"),
    ("KSAN", "San Diego, CA", "America/Los_Angeles"),
    ("KSMF", "Sacramento, CA", "America/Los_Angeles"),
    ("PHNL", "Honolulu, HI", "Pacific/Honolulu"),
    ("PANC", "Anchorage, AK", "America/Anchorage"),
]
STATION_BY_ID = {s[0]: s for s in STATIONS}


def log(msg):
    print(msg, flush=True)


def warn(msg):
    # GitHub Actions annotation; plain text elsewhere
    print(f"::warning::{msg}" if os.environ.get("GITHUB_ACTIONS") else f"WARNING: {msg}",
          flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# Fetching
# ─────────────────────────────────────────────────────────────────────────────
class TransientError(Exception):
    pass


class FatalFetchError(Exception):
    pass


_last_request = [0.0]


def _http_get(url):
    gap = time.monotonic() - _last_request[0]
    if gap < MIN_GAP_S:
        time.sleep(MIN_GAP_S - gap)
    _last_request[0] = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": "contextclimate.io wind climatology builder"})
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
            return r.read().decode("ascii", "ignore")
    except urllib.error.HTTPError as e:
        if e.code >= 500 or e.code in (408, 425, 429):
            raise TransientError(f"HTTP {e.code}") from e
        raise FatalFetchError(f"HTTP {e.code}: {e.read()[:200]!r}") from e
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, ConnectionError, OSError) as e:
        # HTTPException covers IncompleteRead: IEM closing a stream mid-transfer
        raise TransientError(str(e)) from e


def iem_url(stations, sts, ets):
    q = [("station", s) for s in stations]
    q += [("data", "sknt"), ("data", "drct"), ("data", "gust")]
    q += [("sts", sts.strftime("%Y-%m-%dT%H:%MZ")), ("ets", ets.strftime("%Y-%m-%dT%H:%MZ")),
          ("tz", "Etc/UTC"), ("format", "onlycomma"), ("latlon", "no"), ("elev", "no"),
          ("missing", "M"), ("trace", "T"), ("direct", "no"),
          # 2 is IEM's legacy code for "routine + specials" (expands to 2,3,4);
          # leaves out 1 = 5-minute HFMETAR
          ("report_type", "2")]
    return IEM_URL + "?" + urllib.parse.urlencode(q)


def _get_with_retries(url, label):
    last = None
    for attempt in range(len(RETRY_WAITS) + 1):
        try:
            return _http_get(url)
        except TransientError as e:
            last = e
            if attempt < len(RETRY_WAITS):
                log(f"    {label}: {e} -- retry in {RETRY_WAITS[attempt]}s")
                time.sleep(RETRY_WAITS[attempt])
    raise TransientError(f"{label}: {last}")


def fetch_span(stations, sts, ets, depth=0):
    """Return a list of CSV texts covering stations x [sts, ets).

    A transient failure that survives the retries splits the request: first
    the station list, then (for a single station) the time span. Every piece
    stays inside one UTC year, so every request hits a single partition."""
    label = f"{sts:%Y-%m-%d}..{ets:%Y-%m-%d} x{len(stations)}"
    try:
        return [_get_with_retries(iem_url(stations, sts, ets), label)]
    except TransientError:
        if depth >= 8:
            raise
        if len(stations) > 1:
            mid = len(stations) // 2
            log(f"    splitting {label} by station")
            return (fetch_span(stations[:mid], sts, ets, depth + 1)
                    + fetch_span(stations[mid:], sts, ets, depth + 1))
        if (ets - sts).days >= 20:
            mid = sts + (ets - sts) / 2
            mid = mid.replace(minute=0, second=0, microsecond=0)
            log(f"    splitting {label} by time")
            return (fetch_span(stations, sts, mid, depth + 1)
                    + fetch_span(stations, mid, ets, depth + 1))
        raise


def fetch_year(year, station_ids):
    # ets is exclusive; 23:59 keeps the request inside the year's partition
    sts = datetime(year, 1, 1, 0, 0, tzinfo=timezone.utc)
    ets = datetime(year, 12, 31, 23, 59, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    if ets > now:
        ets = now
    ids, out = list(station_ids), []
    for i in range(0, len(ids), STATIONS_PER_REQUEST):
        out += fetch_span(ids[i:i + STATIONS_PER_REQUEST], sts, ets)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Parsing + hourly selection
# ─────────────────────────────────────────────────────────────────────────────
def iem_to_icao(s):
    return "K" + s if len(s) == 3 else s


def _num(v):
    v = v.strip()
    if not v or v == "M":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_csv(text, want, into):
    """Append (epoch_minute, sknt, drct, gust) per station into `into`."""
    rdr = csv.reader(io.StringIO(text))
    header = None
    for row in rdr:
        if not row or row[0].startswith("#"):
            continue
        if header is None:
            if row[0] == "station":
                header = {name: i for i, name in enumerate(row)}
                ik, idr, ig, iv = header["sknt"], header["drct"], header["gust"], header["valid"]
            continue
        if len(row) < len(header):
            continue
        st = iem_to_icao(row[0])
        if st not in want:
            continue
        v = row[iv]
        try:
            t = datetime(int(v[0:4]), int(v[5:7]), int(v[8:10]), int(v[11:13]), int(v[14:16]),
                         tzinfo=timezone.utc)
        except (ValueError, IndexError):
            continue
        into.setdefault(st, []).append(
            (int(t.timestamp()) // 60, _num(row[ik]), _num(row[idr]), _num(row[ig])))


def routine_minute(obs):
    c = Counter(o[0] % 60 for o in obs)
    return c.most_common(1)[0][0] if c else 0


def select_hour(window_hour, obs, rm):
    """One hourly value from the obs in a window. Returns
    (speed_kt or None, drct or None, gust_flag, seen)."""
    target = window_hour * 60 + (rm - 60 if rm >= 45 else rm)
    wind_obs = [o for o in obs if o[1] is not None]
    seen = bool(wind_obs)
    gust = any(o[3] is not None and o[3] > 0 for o in obs)
    if not wind_obs:
        return None, None, gust, seen
    routine = [o for o in wind_obs if o[0] % 60 == rm]
    pool = routine if routine else wind_obs
    best = min(pool, key=lambda o: (abs(o[0] - target), o[0]))
    return best[1], best[2], gust, seen


# ─────────────────────────────────────────────────────────────────────────────
# Accumulators
# ─────────────────────────────────────────────────────────────────────────────
def new_diurnal_acc():
    # per month, per hour: n, s, vn, vs, u, v, calm, gseen, gyes
    return [[[0, 0.0, 0, 0.0, 0.0, 0.0, 0, 0, 0] for _ in range(24)] for _ in range(12)]


class Builder:
    def __init__(self, station_ids, keep_years=None):
        self.ids = list(station_ids)
        self.tz = {s: ZoneInfo(STATION_BY_ID[s][2]) for s in self.ids}
        self.diurnal = {s: new_diurnal_acc() for s in self.ids}
        self.month = {s: {} for s in self.ids}      # (ly, lm) -> [[sum, n]] * 24
        self.carry = {s: {} for s in self.ids}      # window_hour -> [obs]
        self.carry_rm = {s: 0 for s in self.ids}
        self.keep_years = keep_years                # None = all local years
        self.local_cache = {}

    def _local(self, st, wh):
        key = (st, wh)
        hit = self.local_cache.get(key)
        if hit is None:
            d = datetime.fromtimestamp(wh * 3600, self.tz[st])
            hit = (d.year, d.month - 1, d.hour)
            self.local_cache[key] = hit
        return hit

    def _emit(self, st, wh, spd_kt, drct, gust, seen):
        ly, lm, lh = self._local(st, wh)
        if self.keep_years is not None and ly not in self.keep_years:
            return
        if spd_kt is not None:
            mph = spd_kt * KT_TO_MPH
            cell = self.month[st].setdefault((ly, lm), [[0.0, 0] for _ in range(24)])[lh]
            cell[0] += mph
            cell[1] += 1
        if NORMALS[0] <= ly <= NORMALS[1]:
            a = self.diurnal[st][lm][lh]
            if seen:
                a[7] += 1
                if gust:
                    a[8] += 1
            if spd_kt is None:
                return
            mph = spd_kt * KT_TO_MPH
            a[0] += 1
            a[1] += mph
            if mph == 0:
                a[6] += 1
                a[2] += 1          # calm: zero vector, still counts
            elif drct is not None:
                rad = math.radians(drct)
                a[2] += 1
                a[3] += mph
                a[4] += -mph * math.sin(rad)   # vector the air moves toward
                a[5] += -mph * math.cos(rad)

    def add_year(self, year, texts):
        obs_by_st = {}
        want = set(self.ids)
        for t in texts:
            parse_csv(t, want, obs_by_st)
        next_year_hour = int(datetime(year + 1, 1, 1, tzinfo=timezone.utc).timestamp()) // 3600
        for st in self.ids:
            obs = obs_by_st.get(st, [])
            obs.sort(key=lambda o: o[0])
            rm = routine_minute(obs) if obs else self.carry_rm[st]
            windows = self.carry[st]
            self.carry[st] = {}
            for o in obs:
                wh = (o[0] + 15) // 60
                windows.setdefault(wh, []).append(o)
            for wh in sorted(windows):
                if wh >= next_year_hour:
                    self.carry[st][wh] = windows[wh]
                    continue
                self._emit(st, wh, *select_hour(wh, windows[wh], rm))
            self.carry_rm[st] = rm
        self.local_cache.clear()

    def flush(self):
        for st in self.ids:
            for wh in sorted(self.carry[st]):
                self._emit(st, wh, *select_hour(wh, self.carry[st][wh], self.carry_rm[st]))
            self.carry[st] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Products
# ─────────────────────────────────────────────────────────────────────────────
def r2(x):
    return None if x is None else round(x, 2)


def diurnal_product(acc):
    out = {k: [[None] * 24 for _ in range(12)] for k in ("spd", "dir", "stdy", "calm", "gust", "n")}
    for m in range(12):
        for h in range(24):
            n, s, vn, vs, u, v, calm, gseen, gyes = acc[m][h]
            out["n"][m][h] = n
            if n >= DIURNAL_MIN_N:
                out["spd"][m][h] = round(s / n, 2)
                out["calm"][m][h] = round(100.0 * calm / n, 1)
            if vn >= DIURNAL_MIN_N and vs > 0:
                # Means over the same hours (calms count as zero in both), so
                # steadiness = |mean vector| / mean speed runs 0..1.
                um, vm = u / vn, v / vn
                scalar = vs / vn
                out["stdy"][m][h] = round(math.hypot(um, vm) / scalar, 3)
                # direction the wind blows FROM, degrees true
                out["dir"][m][h] = round((math.degrees(math.atan2(-um, -vm)) + 360) % 360) % 360
            if gseen >= DIURNAL_MIN_N:
                out["gust"][m][h] = round(100.0 * gyes / gseen, 1)
    return out


def month_mean(cells):
    total = sum(c[1] for c in cells)
    if total < MONTH_MIN_HOURS:
        return None, total
    means = [c[0] / c[1] for c in cells if c[1] >= MONTH_BIN_MIN_N]
    if len(means) < MONTH_MIN_BINS:
        return None, total
    return sum(means) / len(means), total


def last_complete_month(tz):
    now = datetime.now(tz)
    y, m = now.year, now.month - 1   # current month is incomplete
    if m == 0:
        y, m = y - 1, 12
    return y, m - 1                   # 0-indexed month


def monthly_rows(month_acc, y0, y_last, m_last):
    spd, n = [], []
    for y in range(y0, y_last + 1):
        rs, rn = [], []
        for m in range(12):
            if (y, m) > (y_last, m_last):
                rs.append(None)
                rn.append(0)
                continue
            cells = month_acc.get((y, m))
            if not cells:
                rs.append(None)
                rn.append(0)
                continue
            mean, tot = month_mean(cells)
            rs.append(r2(mean))
            rn.append(tot)
        spd.append(rs)
        n.append(rn)
    return spd, n


# ─────────────────────────────────────────────────────────────────────────────
# ASOS commissioning dates (NCEI HOMR)
# ─────────────────────────────────────────────────────────────────────────────
def fetch_homr():
    """CALL -> {asos: 'YYYY-MM-DD', anem_ft: int}. Empty dict on failure."""
    try:
        text = _get_with_retries(HOMR_URL, "HOMR")
    except (TransientError, FatalFetchError) as e:
        warn(f"HOMR station table unavailable ({e}); ASOS dates left blank")
        return {}
    lines = text.splitlines()
    dash_i = next((i for i, l in enumerate(lines) if l.startswith("--------")), None)
    if dash_i is None or dash_i == 0:
        warn("HOMR table format not recognised; ASOS dates left blank")
        return {}
    # column spans from the dashed rule under the header
    spans, i, rule = [], 0, lines[dash_i]
    while i < len(rule):
        if rule[i] == "-":
            j = i
            while j < len(rule) and rule[j] == "-":
                j += 1
            spans.append((i, j))
            i = j
        else:
            i += 1
    names = [lines[dash_i - 1][a:b].strip() for a, b in spans]
    col = {n: spans[k] for k, n in enumerate(names)}
    if not {"CALL", "BEGDT"} <= set(col):
        warn("HOMR table missing CALL/BEGDT; ASOS dates left blank")
        return {}
    out = {}
    for line in lines[dash_i + 1:]:
        call = line[col["CALL"][0]:col["CALL"][1]].strip()
        beg = line[col["BEGDT"][0]:col["BEGDT"][1]].strip()
        if not call or call in out or len(beg) != 8 or not beg.isdigit():
            continue
        rec = {"asos": f"{beg[0:4]}-{beg[4:6]}-{beg[6:8]}", "anem_ft": None}
        if "ELEV_A" in col:
            a = line[col["ELEV_A"][0]:col["ELEV_A"][1]].strip()
            if a.lstrip("-").isdigit() and int(a) > 0:
                rec["anem_ft"] = int(a)
        out[call] = rec
    log(f"HOMR: {len(out)} ASOS sites")
    return out


def homr_for(homr, icao):
    return homr.get(icao[1:]) if len(icao) == 4 else homr.get(icao)


# ─────────────────────────────────────────────────────────────────────────────
# I/O
# ─────────────────────────────────────────────────────────────────────────────
def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, path)


def load_existing(out_dir, st):
    p = os.path.join(out_dir, f"{st}.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p) as f:
            d = json.load(f)
        return d if d.get("v") == FORMAT_VERSION else None
    except (OSError, ValueError):
        return None


def validate_station(st, diurnal, spd_rows, y0):
    """Return a problem string, or None if the station's data looks sane."""
    cells = sum(1 for m in range(12) for h in range(24) if diurnal["spd"][m][h] is not None)
    if cells < 200:
        return f"only {cells}/288 diurnal cells have data"
    vals = [v for row in spd_rows for v in row if v is not None]
    if len(vals) < 120:
        return f"only {len(vals)} year-months have data"
    bad = [v for v in vals if not (0 <= v <= 60)]
    if bad:
        return f"{len(bad)} monthly means outside 0-60 mph"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=("auto", "full", "incremental"), default="auto")
    ap.add_argument("--stations", default="", help="comma-separated ICAO ids (default: all)")
    ap.add_argument("--out", default="public/wind-climo")
    ap.add_argument("--first-year", type=int, default=FIRST_YEAR)
    args = ap.parse_args()

    ids = [s.strip().upper() for s in args.stations.split(",") if s.strip()] or [s[0] for s in STATIONS]
    unknown = [s for s in ids if s not in STATION_BY_ID]
    if unknown:
        sys.exit(f"Unknown station(s): {', '.join(unknown)}")
    os.makedirs(args.out, exist_ok=True)

    existing = {s: load_existing(args.out, s) for s in ids}
    mode = args.mode
    if mode == "auto":
        mode = "incremental" if all(existing.values()) else "full"
    if mode == "incremental" and not all(existing.values()):
        missing = [s for s in ids if not existing[s]]
        sys.exit(f"Incremental mode needs existing files; missing: {', '.join(missing)}")

    now = datetime.now(timezone.utc)
    cur = now.year
    if mode == "full":
        years = list(range(args.first_year, cur + 1))
        keep = None
    else:
        years = [cur - 1, cur]
        keep = set(years)
    log(f"Mode {mode}: {len(ids)} station(s), UTC years {years[0]}-{years[-1]}")

    b = Builder(ids, keep_years=keep)
    t0 = time.monotonic()
    for y in years:
        ty = time.monotonic()
        try:
            texts = fetch_year(y, ids)
        except (TransientError, FatalFetchError) as e:
            sys.exit(f"ERROR: could not fetch {y}: {e}. Nothing written.")
        b.add_year(y, texts)
        log(f"  {y}: {sum(len(t) for t in texts) / 1e6:.1f} MB in {time.monotonic() - ty:.0f}s")
    b.flush()
    log(f"Fetched + aggregated in {(time.monotonic() - t0) / 60:.1f} min")

    homr = fetch_homr()
    built = date.today().isoformat()
    index_path = os.path.join(args.out, "index.json")
    index = {"v": FORMAT_VERSION, "stations": {}}
    if os.path.exists(index_path):
        try:
            with open(index_path) as f:
                old = json.load(f)
            if old.get("v") == FORMAT_VERSION:
                index = old
        except (OSError, ValueError):
            pass

    failures = []
    for st in ids:
        _, name, tzname = STATION_BY_ID[st]
        y_last, m_last = last_complete_month(ZoneInfo(tzname))
        if mode == "full":
            diurnal = diurnal_product(b.diurnal[st])
            spd, n = monthly_rows(b.month[st], args.first_year, y_last, m_last)
            y0 = args.first_year
        else:
            old = existing[st]
            diurnal = old["diurnal"]
            y0 = old["monthly"]["y0"]
            spd, n = monthly_rows(b.month[st], y0, y_last, m_last)
            # keep stored rows for every year we did not refetch
            for i, y in enumerate(range(y0, y_last + 1)):
                if y in keep:
                    continue
                oi = y - old["monthly"]["y0"]
                if 0 <= oi < len(old["monthly"]["spd"]):
                    spd[i] = old["monthly"]["spd"][oi]
                    n[i] = old["monthly"]["n"][oi]
        problem = validate_station(st, diurnal, spd, y0)
        if problem:
            failures.append(st)
            warn(f"{st}: {problem}; file not written")
            continue
        h = homr_for(homr, st) or {}
        if not h and existing.get(st):
            h = {"asos": existing[st].get("asos"), "anem_ft": existing[st].get("anem_ft")}
        obj = {
            "v": FORMAT_VERSION, "id": st, "name": name, "tz": tzname, "built": built,
            "normals": list(NORMALS), "asos": h.get("asos"), "anem_ft": h.get("anem_ft"),
            "through": f"{y_last}-{m_last + 1:02d}",
            "diurnal": diurnal,
            "monthly": {"y0": y0, "spd": spd, "n": n},
        }
        write_json(os.path.join(args.out, f"{st}.json"), obj)
        index["stations"][st] = {"name": name, "through": obj["through"], "asos": obj["asos"]}
        log(f"  wrote {st}.json  (through {obj['through']}, ASOS {obj['asos']})")

    index["built"] = built
    index["normals"] = list(NORMALS)
    write_json(index_path, index)
    if failures and len(failures) == len(ids):
        sys.exit("ERROR: no station passed validation")
    log("Done.")


if __name__ == "__main__":
    main()
