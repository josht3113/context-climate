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
SPLICE_YEAR = 1950     # HadISST below, ERSST v5 at and above

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
# CPC weekly file (wksst8110.for)
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
            "sha": sha(t),
            "years": [min(d), max(d)] if d else None,
            "latest": f"{lm[0]}-{lm[1] + 1:02d}" if lm else None,
        }

    # ── ERSST v5 ──────────────────────────────────────────────────────────
    print("ERSST v5 (nina34.anom.data)")
    ers_path = os.path.join(PUB, "nino34.ersst5.anom.data")
    text = read_raw("ersst5")
    if text is not None and looks_like_data("ersst5", text) \
            and not_shrinking("ersst5", text, ers_path):
        # This is the operational source — 2 months stale is already a problem.
        data = check_series("ersst5", text, min_years=60, expect_recent_within=2)
        if data:
            with open(ers_path, "w") as f:
                f.write(text)
    if os.path.exists(ers_path):
        with open(ers_path) as f:
            t = f.read()
        d, _ = parse_psl(t)
        lm = latest_month(d)
        meta["sources"]["ersst5"] = {
            "file": "nino34.ersst5.anom.data",
            "label": "ERSST v5",
            "role": f"{SPLICE_YEAR}-present",
            "sha": sha(t),
            "years": [min(d), max(d)] if d else None,
            "latest": f"{lm[0]}-{lm[1] + 1:02d}" if lm else None,
        }

    # ── CPC weekly ────────────────────────────────────────────────────────
    # Fail-soft by design: the chart is fully correct without this, it just
    # loses the sub-monthly tip. A format change upstream must not break the
    # page, so a bad parse drops the block rather than poisoning meta.
    print("CPC weekly (wksst8110.for)")
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
        str(meta["sources"].get(k, {}).get("sha", "")) for k in ("hadisst", "ersst5")
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
