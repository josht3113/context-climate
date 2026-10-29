#!/usr/bin/env python3
"""Validate downloaded ENSO sources, then emit the cached data files + enso-meta.json.

Guarantees, in order of importance:
  1. A bad download NEVER replaces a good committed file.
  2. A rejected source is recorded in /tmp/enso/FAILURES so the workflow run
     goes red — stale data must not look like success.
  3. enso-meta.json always reflects what is actually on disk after this runs,
     not what we hoped to fetch.
"""

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

RAW = "/tmp/enso"
PUB = "public"
FAILURES = []

MISSING = 9.0          # PSL uses -99.99 / -9.99; anything |v| >= 9 is a fill value
SPLICE_YEAR = 1950     # HadISST below, ERSST v6 at and above
BASE = (1991, 2020)    # common base period for the spliced series (CPC's current)

# Known values of CPC's own ANOM column (ERSSTv6, the series behind the ONI),
# used to prove a download is the operational index and not a damped
# look-alike. The PSL "nina34.anom.data" file this pipeline used until Oct
# 2026 read ~0.6 °C low at these months. Tolerance allows for reprocessing.
ANCHORS = {(1997, 10): 2.26, (1997, 11): 2.42, (1997, 12): 2.36}
ANCHOR_TOL = 0.25

# Max mean offset (°C) between rebased HadISST and ERSST over their overlap
# before the splice is refused — a larger bias means a base-period mismatch.
SPLICE_MAX_BIAS = 0.15

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def fail(source, why):
    FAILURES.append(f"  - {source}: {why}")
    print(f"  ✗ {source}: {why}")


# ──────────────────────────────────────────────────────────────────────────
# Standard PSL Format
# ──────────────────────────────────────────────────────────────────────────
def parse_psl(text):
    """Return {year: [12 floats or None]}.

    The format is a "<start> <end>" header, one row per year of 12 values,
    then a footer (missing-value code, provenance lines, sometimes a URL).
    The header's year range is the authority on where data stops — without
    it, footer numbers get appended to the final, partial year.
    """
    lines = [l.rstrip() for l in text.split("\n")]
    if not lines:
        return {}, None

    lo = hi = None
    head = lines[0].split()
    if len(head) == 2:
        try:
            a, b = int(float(head[0])), int(float(head[1]))
            if 1700 <= a <= 2200 and 1700 <= b <= 2200 and a < b:
                lo, hi = a, b
        except ValueError:
            pass

    data = {}
    for line in lines[1 if lo else 0:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            year = int(float(parts[0]))
        except ValueError:
            continue
        # Footer lines can start with a plain number; the header range and a
        # strict 12-value expectation together keep them out.
        if float(parts[0]) != year:
            continue
        if lo is not None and not (lo <= year <= hi):
            continue
        if lo is None and not (1700 <= year <= 2200):
            continue
        try:
            vals = [float(p) for p in parts[1:13]]
        except ValueError:
            continue
        if len(vals) != 12:
            continue
        data[year] = [None if abs(v) >= MISSING else round(v, 4) for v in vals]

    return data, (lo, hi) if lo else None


def latest_month(data):
    """(year, month_index) of the most recent real value, or None."""
    for y in sorted(data, reverse=True):
        for m in range(11, -1, -1):
            if data[y][m] is not None:
                return y, m
    return None


def check_series(name, text, min_years, expect_recent_within):
    """Validate a Standard PSL Format download. Returns parsed dict or None."""
    data, _ = parse_psl(text)
    if len(data) < min_years:
        fail(name, f"only parsed {len(data)} years (expected >= {min_years})")
        return None

    last = latest_month(data)
    if last is None:
        fail(name, "parsed but contains no real values")
        return None

    now = datetime.now(timezone.utc)
    age_months = (now.year - last[0]) * 12 + (now.month - 1 - last[1])
    if age_months > expect_recent_within:
        fail(name, f"latest value is {MONTHS[last[1]].title()} {last[0]} "
                   f"({age_months} months old, limit {expect_recent_within})")
        return None

    print(f"  ✓ {name}: {len(data)} years, latest "
          f"{MONTHS[last[1]].title()} {last[0]}")
    return data


def looks_like_data(name, text):
    stripped = text.lstrip()
    if not re.match(r"^\s*\d{4}\b", stripped):
        fail(name, f"not a data file — begins {stripped[:60]!r}")
        return False
    return True


def not_shrinking(name, new_text, path):
    """Reject a download materially smaller than what is already committed."""
    if not os.path.exists(path):
        return True
    old = os.path.getsize(path)
    new = len(new_text.encode())
    if new < old * 0.9:
        fail(name, f"download is {new}B vs committed {old}B — refusing to shrink")
        return False
    return True



# ──────────────────────────────────────────────────────────────────────────
# CPC monthly ERSSTv6 Niño 3.4 (detrend.nino34.ascii.txt)
# ──────────────────────────────────────────────────────────────────────────
def parse_cpc_monthly(text):
    """Return (totals, anoms): {year: [12 values or None]} each.

    Rows look like:
         YR   MON  TOTAL ClimAdjust ANOM
       1997  11   29.06   26.64    2.42
    TOTAL is the Niño 3.4 SST (°C). ANOM is CPC's anomaly against its
    centred 30-year climatology (the ONI construction); it is used only for
    the anchor check. The published series is TOTAL against a fixed base.
    """
    totals, anoms = {}, {}
    for line in text.split("\n"):
        parts = line.split()
        if len(parts) != 5:
            continue
        try:
            yr, mon = int(parts[0]), int(parts[1])
            tot, anom = float(parts[2]), float(parts[4])
        except ValueError:
            continue
        if not (1850 <= yr <= 2200 and 1 <= mon <= 12):
            continue
        if not (20 < tot < 32) or abs(anom) > 5:
            continue
        totals.setdefault(yr, [None] * 12)[mon - 1] = tot
        anoms.setdefault(yr, [None] * 12)[mon - 1] = round(anom, 2)
    return totals, anoms


def fixed_base_anoms(totals):
    """Anomalies of TOTAL against its own per-month 1991-2020 mean."""
    clim = monthly_means(totals, *BASE)
    if clim is None:
        return None
    return {y: [None if v is None else round(v - clim[m], 2)
                for m, v in enumerate(row)] for y, row in totals.items()}


def check_anchors(name, data):
    for (y, m), want in ANCHORS.items():
        got = data.get(y, [None] * 12)[m - 1]
        if got is None or abs(got - want) > ANCHOR_TOL:
            fail(name, f"{MONTHS[m - 1].title()} {y} Niño 3.4 is {got}, expected "
                       f"{want:+.2f} ±{ANCHOR_TOL} — not the operational CPC index")
            return False
    return True


def to_psl(data, footer):
    """Standard PSL Format text: '<lo> <hi>' header, 12 values per year, footer."""
    lo, hi = min(data), max(data)
    out = [f"{lo:>10d}{hi:>12d}"]
    for y in range(lo, hi + 1):
        row = data.get(y, [None] * 12)
        out.append(f"{y:>5d}" + "".join(
            f"{(-99.99 if v is None else v):>9.2f}" for v in row))
    out.append("  -99.99")
    out += [f"  {line}" for line in footer]
    return "\n".join(out) + "\n"


def monthly_means(data, y0, y1):
    """Per-calendar-month mean over [y0, y1]; None if any month is incomplete."""
    means = []
    for m in range(12):
        vals = [data[y][m] for y in range(y0, y1 + 1)
                if y in data and data[y][m] is not None]
        if len(vals) != y1 - y0 + 1:
            return None
        means.append(sum(vals) / len(vals))
    return means


def build_splice(had, ers):
    """HadISST rebased to 1991-2020 before SPLICE_YEAR, ERSSTv6 from it on.

    Re-basing an anomaly series to a new window is anomaly − its own mean over
    that window, per calendar month; the original climatology cancels out.
    Returns (spliced dict, stats) or (None, reason).
    """
    clim = monthly_means(had, *BASE)
    if clim is None:
        return None, f"HadISST lacks a complete {BASE[0]}-{BASE[1]} window"

    rebased = {y: [None if v is None else round(v - clim[m], 2)
                   for m, v in enumerate(row)] for y, row in had.items()}

    diffs = [ers[y][m] - rebased[y][m]
             for y in ers if y in rebased
             for m in range(12)
             if ers[y][m] is not None and rebased[y][m] is not None]
    if len(diffs) < 600:
        return None, f"only {len(diffs)} overlapping months to check the splice"
    bias = sum(diffs) / len(diffs)
    rms = (sum(d * d for d in diffs) / len(diffs)) ** 0.5
    if abs(bias) > SPLICE_MAX_BIAS:
        return None, f"mean ERSST − HadISST offset {bias:+.3f} °C over overlap exceeds ±{SPLICE_MAX_BIAS}"

    out = {y: row[:] for y, row in rebased.items() if y < SPLICE_YEAR}
    out.update({y: row[:] for y, row in ers.items() if y >= SPLICE_YEAR})
    return out, {"overlap_months": len(diffs),
                 "bias": round(bias, 3), "rms": round(rms, 3)}

# ──────────────────────────────────────────────────────────────────────────
# CPC weekly file (wksst9120.for)
# ──────────────────────────────────────────────────────────────────────────
def parse_weekly(text):
    """Return [{date, sst, anom}] of Niño 3.4 weekly values, oldest first.

    Rows look like:
        03JAN1990     23.4-0.4     25.1-0.3     26.6 0.0     28.6 0.3
    Note SST and its anomaly collide when the anomaly is negative, so the
    values are pulled with a regex rather than by column slicing. Order is
    Niño1+2, Niño3, Niño3.4, Niño4 — each as (SST, anomaly), so Niño 3.4's
    anomaly is the 6th number.
    """
    out = []
    num = re.compile(r"-?\d+\.\d+")
    row = re.compile(r"^\s*(\d{2})([A-Z]{3})(\d{4})\s+(.*)$")
    for line in text.split("\n"):
        m = row.match(line)
        if not m:
            continue
        dd, mon, yyyy, rest = m.groups()
        if mon not in MONTHS:
            continue
        nums = num.findall(rest)
        if len(nums) != 8:
            continue
        try:
            date = datetime(int(yyyy), MONTHS.index(mon) + 1, int(dd))
        except ValueError:
            continue
        sst, anom = float(nums[4]), float(nums[5])
        if abs(anom) > 6 or not (10 < sst < 40):
            continue
        out.append({"date": date.strftime("%Y-%m-%d"),
                    "sst": sst, "anom": anom})
    out.sort(key=lambda r: r["date"])
    return out


# ──────────────────────────────────────────────────────────────────────────
def read_raw(name):
    p = os.path.join(RAW, f"{name}.raw")
    if not os.path.exists(p):
        fail(name, "download did not complete")
        return None
    with open(p, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def main():
    os.makedirs(PUB, exist_ok=True)
    meta = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "splice_year": SPLICE_YEAR,
        "sources": {},
    }

    # ── HadISST 1.1 ───────────────────────────────────────────────────────
    print("HadISST 1.1 (nino34.long.anom.data)")
    had_path = os.path.join(PUB, "nino34.long.anom.data")
    text = read_raw("hadisst")
    if text is not None and looks_like_data("hadisst", text) \
            and not_shrinking("hadisst", text, had_path):
        # HadISST publishes with a lag; 4 months of slack before we complain.
        data = check_series("hadisst", text, min_years=140, expect_recent_within=4)
        if data:
            with open(had_path, "w") as f:
                f.write(text)
    if os.path.exists(had_path):
        with open(had_path) as f:
            t = f.read()
        d, _ = parse_psl(t)
        lm = latest_month(d)
        meta["sources"]["hadisst"] = {
            "file": "nino34.long.anom.data",
            "label": "HadISST 1.1",
            "role": f"pre-{SPLICE_YEAR}",
            "base_period": "1981-2010",
            "sha": sha(t),
            "years": [min(d), max(d)] if d else None,
            "latest": f"{lm[0]}-{lm[1] + 1:02d}" if lm else None,
        }

    # ── ERSST v6 (NOAA CPC monthly, re-based to fixed 1991-2020) ─────────
    print("ERSST v6 (CPC detrend.nino34.ascii.txt)")
    ers_path = os.path.join(PUB, "nino34.ersst6.anom.data")
    ers_footer = [
        "NINO34 ERSSTv6 monthly anomaly (5N-5S, 170W-120W), degC",
        f"Anomaly from fixed {BASE[0]}-{BASE[1]} monthly means of CPC TOTAL",
        "Source: NOAA CPC https://www.cpc.ncep.noaa.gov/data/indices/detrend.nino34.ascii.txt",
    ]
    text = read_raw("ersst")
    if text is not None:
        totals, anoms = parse_cpc_monthly(text)
        data = fixed_base_anoms(totals) if totals else None
        last = latest_month(data) if data else None
        now = datetime.now(timezone.utc)
        if not data or len(data) < 70:
            fail("ersst", f"only parsed {len(totals)} years with a complete "
                          f"{BASE[0]}-{BASE[1]} window (expected >= 70)")
        elif last is None:
            fail("ersst", "parsed but contains no real values")
        elif (now.year - last[0]) * 12 + (now.month - 1 - last[1]) > 2:
            # Operational source — 2 months stale is already a problem.
            fail("ersst", f"latest value is {MONTHS[last[1]].title()} {last[0]}")
        elif check_anchors("ersst", anoms):
            psl = to_psl(data, ers_footer)
            if not_shrinking("ersst", psl, ers_path):
                with open(ers_path, "w") as f:
                    f.write(psl)
                print(f"  ✓ ersst: {len(data)} years, latest "
                      f"{MONTHS[last[1]].title()} {last[0]}")

    ers = {}
    if os.path.exists(ers_path):
        with open(ers_path) as f:
            t = f.read()
        ers, _ = parse_psl(t)
        lm = latest_month(ers)
        meta["sources"]["ersst"] = {
            "file": "nino34.ersst6.anom.data",
            "label": "ERSST v6 (NOAA CPC)",
            "role": f"{SPLICE_YEAR}-present",
            "base_period": f"{BASE[0]}-{BASE[1]}",
            "sha": sha(t),
            "years": [min(ers), max(ers)] if ers else None,
            "latest": f"{lm[0]}-{lm[1] + 1:02d}" if lm else None,
        }

    # ── Spliced series (what the tools read) ──────────────────────────────
    print("Spliced HadISST/ERSST (nino34.spliced.anom.data)")
    spl_path = os.path.join(PUB, "nino34.spliced.anom.data")
    had = {}
    if os.path.exists(had_path):
        with open(had_path) as f:
            had, _ = parse_psl(f.read())
    if had and ers:
        spl, info = build_splice(had, ers)
        if spl is None:
            fail("spliced", info)
        else:
            psl = to_psl(spl, [
                "NINO34 monthly SST anomaly (5N-5S, 170W-120W), degC",
                f"Anomaly from {BASE[0]}-{BASE[1]}",
                f"Before {SPLICE_YEAR}: HadISST 1.1 (NOAA PSL), rebased to {BASE[0]}-{BASE[1]}",
                f"{SPLICE_YEAR}-present: ERSSTv6 (NOAA CPC)",
            ])
            with open(spl_path, "w") as f:
                f.write(psl)
            print(f"  ✓ spliced: overlap {info['overlap_months']} months, "
                  f"bias {info['bias']:+.3f} °C, rms {info['rms']:.3f} °C")
    else:
        fail("spliced", "needs both HadISST and CPC ERSST on disk")

    if os.path.exists(spl_path):
        with open(spl_path) as f:
            t = f.read()
        d, _ = parse_psl(t)
        lm = latest_month(d)
        meta["sources"]["spliced"] = {
            "file": "nino34.spliced.anom.data",
            "label": f"HadISST 1.1 (pre-{SPLICE_YEAR}) + ERSST v6 ({SPLICE_YEAR}-present)",
            "base_period": f"{BASE[0]}-{BASE[1]}",
            "sha": sha(t),
            "years": [min(d), max(d)] if d else None,
            "latest": f"{lm[0]}-{lm[1] + 1:02d}" if lm else None,
        }

    # ── CPC weekly ────────────────────────────────────────────────────────
    # Fail-soft by design: the chart is fully correct without this, it just
    # loses the sub-monthly tip. A format change upstream must not break the
    # page, so a bad parse drops the block rather than poisoning meta.
    print("CPC weekly (wksst9120.for)")
    text = read_raw("weekly")
    if text is not None:
        obs = parse_weekly(text)
        if len(obs) < 100:
            fail("weekly", f"only parsed {len(obs)} rows — format may have changed")
        else:
            recent = obs[-14:]
            last = datetime.strptime(obs[-1]["date"], "%Y-%m-%d")
            age_days = (datetime.now() - last).days
            if age_days > 21:
                fail("weekly", f"newest week is {age_days} days old ({obs[-1]['date']})")
            else:
                meta["weekly"] = {
                    "label": "CPC weekly Niño 3.4 SST anomaly",
                    "base_period": "1991-2020",
                    "note": ("Weekly SST anomaly on a 1991-2020 base. Not an ONI "
                             "value — different averaging window and base period."),
                    "latest_date": obs[-1]["date"],
                    "obs": recent,
                }
                print(f"  ✓ weekly: {len(obs)} rows, latest {obs[-1]['date']} "
                      f"({obs[-1]['anom']:+.1f}°C)")

    # ── Version stamp used for client cache-busting ───────────────────────
    stamp = "|".join(
        str(meta["sources"].get(k, {}).get("sha", "")) for k in ("hadisst", "ersst", "spliced")
    ) + "|" + str(meta.get("weekly", {}).get("latest_date", ""))
    meta["version"] = hashlib.sha256(stamp.encode()).hexdigest()[:10]

    if not meta["sources"]:
        fail("pipeline", "no usable data files on disk at all")

    with open(os.path.join(PUB, "enso-meta.json"), "w") as f:
        json.dump(meta, f, indent=2, sort_keys=False)
        f.write("\n")
    print(f"\nWrote {PUB}/enso-meta.json (version {meta['version']})")

    if FAILURES:
        with open(os.path.join(RAW, "FAILURES"), "w") as f:
            f.write("\n".join(FAILURES) + "\n")
        print(f"\n{len(FAILURES)} source(s) failed — run will be marked failed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
