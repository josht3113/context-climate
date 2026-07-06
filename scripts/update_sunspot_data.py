#!/usr/bin/env python3
"""
Rebuilds public/sunspot-monthly.csv from SILSO's official monthly mean and
13-month smoothed sunspot number files.

Source: WDC-SILSO, Royal Observatory of Belgium, Brussels
  https://www.sidc.be/SILSO/DATA/SN_m_tot_V2.0.csv   (monthly mean)
  https://www.sidc.be/SILSO/DATA/SN_ms_tot_V2.0.csv  (13-month smoothed)

Both files are fetched to /tmp by the calling GitHub Actions step. This
script merges them by (year, month) into the compact schema consumed by
sunspot-heatmap.html and solar-cycle-progression.html:

    year,month,decimal,mean,mean_def,smoothed,smoothed_def

If either downloaded file doesn't look like real SILSO data (e.g. SILSO
served an error page, or changed format), this script leaves the
previously-committed public/sunspot-monthly.csv untouched and exits 0 —
a transient upstream problem should never break the site's deploy.
"""
import csv
import sys
from pathlib import Path

MONTHLY_PATH = Path('/tmp/SN_m_tot_V2.0.csv')
SMOOTHED_PATH = Path('/tmp/SN_ms_tot_V2.0.csv')
OUTPUT_PATH = Path('public/sunspot-monthly.csv')


def looks_like_real_data(path):
    """SILSO's data rows start with a 4-digit year. Checking the LAST line
    (rather than the first) sidesteps any ambiguity about whether a given
    mirror/download includes a header row -- the last line is always a
    real data row if the file is valid, header or not."""
    try:
        lines = [l for l in path.read_text(encoding='utf-8', errors='replace').splitlines() if l.strip()]
        last_line = lines[-1]
    except Exception:
        return False
    first_field = last_line.split(';')[0].strip()
    return first_field.isdigit() and len(first_field) == 4


def parse_silso_csv(path, value_col_name):
    """Parses a SILSO SN_*_tot_V2.0.csv file (semicolon-delimited:
    year;month;decimal;value;stdev;nobs;definitive). A value of -1
    means "not available" (either genuinely missing, or -- for the
    smoothed file -- too close to the start/end of the series for the
    13-month window to be computed yet). Any row whose first field isn't
    a 4-digit year (e.g. a header row, blank line) is skipped, so this
    works whether or not the fetched file happens to include a header."""
    records = {}
    with open(path, encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        for row in reader:
            if len(row) < 7:
                continue
            year_field = row[0].strip()
            if not (year_field.isdigit() and len(year_field) == 4):
                continue
            year, month, dec, value, _stdev, _nobs, definitive = [c.strip() for c in row[:7]]
            value = float(value)
            records[(int(year), int(month))] = {
                'dec': float(dec),
                value_col_name: None if value < 0 else value,
                f'{value_col_name}_def': definitive == '1',
            }
    return records


def main():
    if not MONTHLY_PATH.exists() or not SMOOTHED_PATH.exists():
        print('ERROR: expected downloaded files not found -- leaving committed data untouched.')
        sys.exit(0)

    if not looks_like_real_data(MONTHLY_PATH) or not looks_like_real_data(SMOOTHED_PATH):
        print('SILSO returned something that doesn\'t look like real data '
              '(error page, maintenance notice, or changed format).')
        print('First 300 chars of monthly file:')
        print(MONTHLY_PATH.read_text(encoding='utf-8', errors='replace')[:300])
        print('Leaving previously-committed public/sunspot-monthly.csv untouched.')
        sys.exit(0)

    monthly = parse_silso_csv(MONTHLY_PATH, 'mean')
    smoothed = parse_silso_csv(SMOOTHED_PATH, 'smoothed')

    keys = sorted(monthly.keys())
    if len(keys) < 1000:  # sanity floor -- real file has 3000+ rows
        print(f'Only parsed {len(keys)} rows from the monthly file -- that\'s '
              'suspiciously few for a 1749-present series. Leaving committed data untouched.')
        sys.exit(0)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['year', 'month', 'decimal', 'mean', 'mean_def', 'smoothed', 'smoothed_def'])
        for (year, month) in keys:
            m = monthly[(year, month)]
            s = smoothed.get((year, month))
            mean_val = m['mean']
            if mean_val is None:
                continue  # skip genuinely missing months (shouldn't occur post-1749)
            w.writerow([
                year, month, f"{m['dec']:.3f}",
                f"{mean_val:.1f}", 1 if m['mean_def'] else 0,
                f"{s['smoothed']:.1f}" if (s and s['smoothed'] is not None) else '',
                1 if (s and s['smoothed_def']) else 0,
            ])

    print(f'Wrote {len(keys)} rows to {OUTPUT_PATH} '
          f'({keys[0][0]}-{keys[0][1]:02d} through {keys[-1][0]}-{keys[-1][1]:02d})')


if __name__ == '__main__':
    main()
