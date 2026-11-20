#!/usr/bin/env python3
"""Build public/metar-stations.js — every U.S. METAR station (ASOS, AWOS and
other automated or staffed airport stations), used by Current Conditions to
pick the stations around the selected one for its local map.

Sources (both on GitHub, so this runs anywhere with raw.githubusercontent.com):
  * Station list and flags: the NCAR/Greg Thompson station table shipped with
    MetPy (`staticdata/stations.txt`). Rows with the METAR flag (column M)
    and country US are kept; mesonet-only rows (auto flag M) are dropped.
  * Coordinates and names: OurAirports (`airports.csv`), matched on ICAO /
    GPS code. The station table only has whole minutes (~1 mi), OurAirports
    has decimal degrees. Station names come from the shared roster first
    (`public/station-roster.js`), then the OurAirports municipality.

Stations that have stopped reporting are harmless: the tool asks IEM for the
nearest candidates and only draws the ones that answered.

Usage:  python3 scripts/build_metar_stations.py [--stations-txt PATH] [--airports PATH]
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'metar-stations.js'
ROSTER = ROOT / 'public' / 'station-roster.js'
STATIONS_URL = 'https://raw.githubusercontent.com/Unidata/MetPy/main/staticdata/stations.txt'
AIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv'

US_CODES = set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU'.split())


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode('utf-8', 'replace')


def read(path_or_url):
    if path_or_url.startswith('http'):
        return fetch(path_or_url)
    return Path(path_or_url).read_text(encoding='utf-8', errors='replace')


def dm(s, hemi):
    deg, mins = s.split()
    v = int(deg) + int(mins) / 60
    return -v if hemi in 'SW' else v


def parse_stations(text):
    """Fixed-width rows: CD STATION ICAO IATA SYNOP LAT LONG ELEV M N V U A C, prio, country."""
    out = {}
    for line in text.splitlines():
        if len(line) < 83 or line.startswith('!'):
            continue
        st, icao, cc = line[0:2], line[20:24].strip(), line[81:83]
        if cc != 'US' or st not in US_CODES or not re.fullmatch(r'[A-Z][A-Z0-9]{3}', icao):
            continue
        if line[62] != 'X':           # METAR reporting station
            continue
        auto = line[74]
        if auto == 'M':               # mesonet site, not an airport METAR
            continue
        try:
            lat = dm(line[39:44], line[44])
            lon = dm(line[47:53], line[53])
        except (ValueError, IndexError):
            continue
        name = re.sub(r'\s+', ' ', line[3:19]).strip().title()
        out[icao] = dict(id=icao, st=st, lat=lat, lon=lon, name=name, auto=auto.strip())
    return out


def parse_airports(text):
    by = {}
    for r in csv.DictReader(io.StringIO(text)):
        if r['iso_country'] not in ('US', 'PR', 'VI', 'GU'):
            continue
        for key in (r['icao_code'], r['gps_code'], r['ident']):
            key = (key or '').strip().upper()
            if re.fullmatch(r'[A-Z][A-Z0-9]{3}', key) and key not in by:
                by[key] = r
    return by


def parse_roster():
    txt = ROSTER.read_text(encoding='utf-8')
    rows = re.findall(r'\[\s*"([A-Z0-9]{4})"\s*,\s*"([^"]*)"\s*,\s*"([A-Z]{2})"\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)', txt)
    return {r[0]: dict(name=r[1], st=r[2], lat=float(r[3]), lon=float(r[4])) for r in rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stations-txt', default=STATIONS_URL)
    ap.add_argument('--airports', default=AIRPORTS_URL)
    a = ap.parse_args()

    stations = parse_stations(read(a.stations_txt))
    airports = parse_airports(read(a.airports))
    roster = parse_roster()
    if len(stations) < 2000:
        sys.exit(f'only {len(stations)} stations parsed; refusing to write')

    rows, moved = [], 0
    for icao, s in sorted(stations.items()):
        lat, lon, name, st = s['lat'], s['lon'], s['name'], s['st']
        ap_row = airports.get(icao)
        if ap_row:
            try:
                alat, alon = float(ap_row['latitude_deg']), float(ap_row['longitude_deg'])
                # accept only if it agrees with the station table (guards against reused idents)
                if abs(alat - lat) < 0.1 and abs(alon - lon) < 0.1:
                    lat, lon = alat, alon
                    moved += 1
            except ValueError:
                pass
            if ap_row.get('municipality'):
                name = ap_row['municipality'].strip()
        if icao in roster:
            r = roster[icao]
            name, st, lat, lon = r['name'], r['st'], r['lat'], r['lon']
        rows.append([icao, name, st, round(lat, 4), round(lon, 4)])

    missing = [k for k in roster if k not in stations]
    for k in missing:                 # roster stations the table doesn't flag
        r = roster[k]
        rows.append([k, r['name'], r['st'], r['lat'], r['lon']])
    rows.sort(key=lambda r: r[0])

    body = ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
    OUT.write_text(
        '/* metar-stations.js — U.S. METAR stations for the Current Conditions local map.\n'
        '   Built by scripts/build_metar_stations.py from the MetPy station table\n'
        '   (NCAR) and OurAirports coordinates; roster stations use the roster.\n'
        '   Row: [ICAO, name, state, lat, lon] */\n'
        'const METAR_STATIONS=[\n' + body + '\n];\n', encoding='utf-8')
    print(f'{len(rows)} stations ({moved} with OurAirports coordinates, {len(missing)} added from the roster) -> {OUT}')


if __name__ == '__main__':
    main()
