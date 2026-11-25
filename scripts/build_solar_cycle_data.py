#!/usr/bin/env python3
"""
Builds the extra data files used by solar-cycle-progression.html:

  public/solar-cycle-daily.json   spotless-day counts per month since 1818,
                                  the last ~2 years of daily sunspot numbers,
                                  and SILSO's daily estimate (EISN) for days
                                  past the end of the daily file
  public/solar-deep-history.json  yearly SN since 1700, telescopic group-number
                                  reconstructions since 1610 (scaled to SN v2),
                                  and annual 14C-based sunspot reconstructions

Inputs are fetched to /tmp by .github/workflows/update-sunspot-data.yml:

  /tmp/SN_d_tot_V2.0.csv   WDC-SILSO daily total sunspot number v2.0
  /tmp/SN_y_tot_V2.0.csv   WDC-SILSO yearly mean total sunspot number v2.0
  /tmp/EISN_current.csv    WDC-SILSO estimated international sunspot number
  /tmp/GNbb2_y.txt         Group number, Svalgaard & Schatten (2016) backbone
  /tmp/GNhs_y.txt          Group number, Hoyt & Schatten (1998)
  /tmp/vz_*.tsv            VizieR ASU-TSV extracts of the 14C reconstructions
                           (Usoskin et al. 2021, 2025, 2026)

Every input is optional in the sense that a missing or malformed file never
breaks the deploy: that part of the output keeps its previously committed
content (or is skipped), and the script exits 0. The daily file is only
rewritten when the SILSO daily file parses cleanly.
"""
import csv
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

TMP = Path('/tmp')
PUB = Path('public')
DAILY_OUT = PUB / 'solar-cycle-daily.json'
DEEP_OUT = PUB / 'solar-deep-history.json'

RECENT_DAYS = 730          # daily values kept for the recent-days strip
SCALE_FROM, SCALE_TO = 1749, 1995   # overlap used to put group numbers on the SN v2 scale

# 14C reconstructions: segment id → (VizieR table, cycles table, reference)
C14_SEGMENTS = [
    ('bc',  '698_A182_sn1000bc', '698_A182_cycles', 'Usoskin et al. 2025, A&A 698, A182'),
    ('ce1', '708_A333_sn1000ce', '708_A333_cycles', 'Usoskin et al. 2026, A&A 708, A333'),
    ('ce2', '649_A141_osn',      '649_A141_table1', 'Usoskin et al. 2021, A&A 649, A141'),
]


def log(*a):
    print(*a, flush=True)


def load_json(path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def write_json(path, obj):
    path.write_text(json.dumps(obj, separators=(',', ':')) + '\n')
    log(f'wrote {path} ({path.stat().st_size:,} bytes)')


# ─────────────────────────────────────────────────────────────────────
# Daily: spotless days + recent daily values
# ─────────────────────────────────────────────────────────────────────

def parse_daily(path):
    """SN_d_tot_V2.0.csv: year;month;day;decimal;SN;stdev;nobs;definitive (SN -1 = missing)."""
    rows = []
    with open(path, encoding='utf-8', errors='replace') as f:
        for r in csv.reader(f, delimiter=';'):
            if len(r) < 8 or not r[0].strip().isdigit() or len(r[0].strip()) != 4:
                continue
            y, m, d = int(r[0]), int(r[1]), int(r[2])
            sn = int(float(r[4]))
            rows.append((date(y, m, d), sn, r[7].strip() == '1'))
    return rows


def parse_eisn(path):
    """EISN_current.csv: year, month, day, decimal, SN, stdev, n_calc, n_avail,"""
    rows = []
    with open(path, encoding='utf-8', errors='replace') as f:
        for r in csv.reader(f):
            r = [c.strip() for c in r]
            if len(r) < 5 or not r[0].isdigit() or len(r[0]) != 4:
                continue
            rows.append((date(int(r[0]), int(r[1]), int(r[2])), int(float(r[4]))))
    return rows


def build_daily():
    path = TMP / 'SN_d_tot_V2.0.csv'
    if not path.exists():
        log('daily: input missing — keeping committed file')
        return
    rows = parse_daily(path)
    if len(rows) < 70000:
        log(f'daily: only {len(rows)} rows parsed — keeping committed file')
        return
    rows.sort()
    for a, b in zip(rows, rows[1:]):
        if (b[0] - a[0]).days != 1:
            log(f'daily: non-consecutive dates {a[0]} → {b[0]} — keeping committed file')
            return
    last = rows[-1][0]
    if (date.today() - last).days > 75:
        log(f'daily: last day {last} looks stale — keeping committed file')
        return

    # month-by-month observed and spotless day counts
    first = rows[0][0]
    months = {}
    for d, sn, _ in rows:
        k = (d.year, d.month)
        obs, spot = months.get(k, (0, 0))
        if sn >= 0:
            obs += 1
            if sn == 0:
                spot += 1
        months[k] = (obs, spot)
    keys = sorted(months)
    days = [months[k][0] for k in keys]
    spotless = [months[k][1] for k in keys]

    recent = rows[-RECENT_DAYS:]
    last_zero = next((d for d, sn, _ in reversed(rows) if sn == 0), None)
    first_prov = next((i for i, r in enumerate(recent) if not r[2]), len(recent))

    out = {
        'source': 'WDC-SILSO, Royal Observatory of Belgium — daily total sunspot number v2.0',
        'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
        'lastDay': last.isoformat(),
        'lastSpotless': last_zero.isoformat() if last_zero else None,
        'monthly': {'start': f'{first.year}-{first.month:02d}', 'days': days, 'spotless': spotless},
        'recent': {'start': recent[0][0].isoformat(), 'sn': [r[1] for r in recent],
                   'firstProvisional': first_prov},
    }

    epath = TMP / 'EISN_current.csv'
    if epath.exists():
        e = [(d, v) for d, v in parse_eisn(epath) if d > last]
        e.sort()
        ok = all((b[0] - a[0]).days == 1 for a, b in zip(e, e[1:]))
        if e and ok and (e[0][0] - last).days == 1:
            out['eisn'] = {'start': e[0][0].isoformat(), 'sn': [v for _, v in e]}
        elif e:
            log('daily: EISN not contiguous with the daily file — skipped')

    log(f'daily: {len(rows):,} days {first} → {last}; {len(keys)} months; '
        f'{sum(spotless):,} spotless days; EISN days {len(out.get("eisn", {}).get("sn", []))}')
    write_json(DAILY_OUT, out)


# ─────────────────────────────────────────────────────────────────────
# Deep history
# ─────────────────────────────────────────────────────────────────────

def parse_yearly_sn(path):
    out = {}
    with open(path, encoding='utf-8', errors='replace') as f:
        for r in csv.reader(f, delimiter=';'):
            if len(r) < 2:
                continue
            try:
                y = int(float(r[0])); v = float(r[1])
            except ValueError:
                continue
            if v >= 0:
                out[y] = v
    return out


def parse_gn(path):
    """Whitespace columns: year(.5) GN sd ... ; returns {year: (gn, sd)}."""
    out = {}
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        p = line.split()
        if len(p) < 2:
            continue
        try:
            y = int(float(p[0])); v = float(p[1]); sd = float(p[2]) if len(p) > 2 else -1
        except ValueError:
            continue
        if v >= 0:
            out[y] = (v, sd)
    return out


def parse_tsv(path):
    """VizieR ASU-TSV: '#' comments, then a header line, a units line and a dashes line."""
    if not path.exists():
        return None
    lines = [l for l in path.read_text(encoding='utf-8', errors='replace').splitlines()
             if l.strip() and not l.startswith('#')]
    if len(lines) < 4 or not lines[2].startswith('-'):
        return None
    head = [h.strip() for h in lines[0].split('\t')]
    rows = []
    for l in lines[3:]:
        cells = [c.strip() for c in l.split('\t')]
        if len(cells) != len(head):
            continue
        rows.append(dict(zip(head, cells)))
    return rows or None


def fetch_vizier(name):
    for host in ('cds', 'nao'):
        rows = parse_tsv(TMP / f'vz_{host}_{name}.tsv')
        if rows:
            return rows
    return None


def contiguous_series(rows, key_year='Year'):
    ys = [int(r[key_year]) for r in rows]
    if ys != list(range(ys[0], ys[0] + len(ys))):
        return None
    return ys[0]


def build_deep():
    prev = load_json(DEEP_OUT) or {}
    out = {'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')}

    # SILSO yearly
    ypath = TMP / 'SN_y_tot_V2.0.csv'
    sn = parse_yearly_sn(ypath) if ypath.exists() else {}
    if len(sn) > 300 and min(sn) == 1700:
        ys = sorted(sn)
        if ys == list(range(ys[0], ys[-1] + 1)):
            out['snYearly'] = {'start': ys[0], 'v': [round(sn[y], 1) for y in ys],
                               'ref': 'WDC-SILSO yearly mean total sunspot number v2.0'}
    if 'snYearly' not in out and 'snYearly' in prev:
        out['snYearly'] = prev['snYearly']; log('deep: yearly SN kept from previous file')

    # Group numbers, scaled to SN v2 over the overlap with the yearly SN
    out['gn'] = {}
    for gid, fname, ref in (('backbone', 'GNbb2_y.txt', 'Svalgaard & Schatten 2016 (backbone group number)'),
                            ('hoyt', 'GNhs_y.txt', 'Hoyt & Schatten 1998 (group sunspot number)')):
        p = TMP / fname
        g = parse_gn(p) if p.exists() else {}
        ok = len(g) > 300 and sn
        if ok:
            ov = [y for y in g if y in sn and SCALE_FROM <= y <= SCALE_TO]
            num = sum(g[y][0] * sn[y] for y in ov); den = sum(g[y][0] ** 2 for y in ov)
            k = num / den if den else 0
            ys = list(range(min(g), max(g) + 1))      # years with no value (-1) stay null
            if not (15 < k < 25) or len(g) < 0.95 * len(ys):
                ok = False
        if ok:
            out['gn'][gid] = {'start': ys[0], 'k': round(k, 3),
                              'v': [round(g[y][0] * k, 1) if y in g else None for y in ys],
                              'sd': [round(g[y][1] * k, 1) if y in g and g[y][1] > 0 else None for y in ys],
                              'ref': ref}
            log(f'deep: {gid} {ys[0]}–{ys[-1]} scaled ×{k:.2f}')
        elif gid in prev.get('gn', {}):
            out['gn'][gid] = prev['gn'][gid]; log(f'deep: {gid} kept from previous file')

    # 14C reconstructions
    prev_c14 = {s['id']: s for s in prev.get('c14', [])}
    segs = []
    for sid, table, ctable, ref in C14_SEGMENTS:
        rows = fetch_vizier(table)
        seg = None
        if rows and 'SN' in rows[0] and 'e_SN' in rows[0] and '<SN>' in rows[0]:
            start = contiguous_series(rows)
            if start is not None:
                seg = {'id': sid, 'ref': ref, 'start': start,
                       'sn': [float(r['SN']) for r in rows],
                       'e': [float(r['e_SN']) for r in rows],
                       'sm': [float(r['<SN>']) for r in rows]}
                crows = fetch_vizier(ctable)
                if crows:
                    def num(r, *names):
                        for n in names:
                            if n in r and r[n] != '':
                                return float(r[n])
                        return None
                    seg['cycles'] = [[num(r, 'Ymin'), num(r, 'Ymax'), num(r, '<SN>'),
                                      num(r, 'e_<SN>', 'sS', 'e_SN'), num(r, 'T'), num(r, 'q')]
                                     for r in crows]
        if seg is None and sid in prev_c14:
            seg = prev_c14[sid]; log(f'deep: 14C {sid} kept from previous file')
        if seg:
            segs.append(seg)
            log(f'deep: 14C {sid} {seg["start"]}–{seg["start"] + len(seg["sn"]) - 1}, '
                f'{len(seg.get("cycles", []))} cycles')
        else:
            log(f'deep: 14C {sid} unavailable')
    out['c14'] = segs

    if 'snYearly' not in out or 'ce2' not in {s['id'] for s in segs}:
        log('deep: core series missing — keeping committed file')
        return
    write_json(DEEP_OUT, out)


def main():
    PUB.mkdir(exist_ok=True)
    for step in (build_daily, build_deep):
        try:
            step()
        except Exception as e:  # never break the deploy over this
            log(f'{step.__name__}: failed ({e}) — committed file left as is')
    sys.exit(0)


if __name__ == '__main__':
    main()
