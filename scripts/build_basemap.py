#!/usr/bin/env python3
"""
build_basemap.py — one-time build of the shared ContextClimate basemap.

Output: public/basemap-national.json and public/basemap-regional.json,
loaded by map-base.js (MAP.loadBasemap). Both cover the same North
American extent; they differ only in simplification tolerance and
coordinate precision.

Sources
  US              public/states-500k.geojson (Census cartographic boundary, 1:500k)
  Canada, Mexico  Natural Earth 10m admin-1 (lakes variant)
  Other land      Natural Earth 10m admin-0 (lakes variant) — Bahamas, Cuba, etc.
  Inland lakes    Natural Earth 10m lakes (Great Lakes excluded: the Census
                  and NE admin geometry already leave them as water)

Layers written
  fill_foreign  land outside the US (polygons, even-odd rings)
  fill_us       US land (polygons, even-odd rings)
  coast         land/water edge of the combined land mass (lines)
  intl          US land border with Canada and Mexico (lines)
  admin1        state / province / Mexican state borders (lines)

Coordinates are integers at 10^-q degrees, delta-encoded per ring/line:
  [x0, y0, dx1, dy1, dx2, dy2, ...]

Run from the repo root:
  pip install shapely
  python scripts/build_basemap.py
The Natural Earth files are downloaded to scripts/.cache/ on first run.
"""

import json
import os
import sys
import urllib.request

from shapely.geometry import shape, box, mapping, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.ops import unary_union, linemerge

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, 'public')
CACHE = os.path.join(REPO, 'scripts', '.cache')

NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
NE_FILES = {
    'admin1': 'ne_10m_admin_1_states_provinces_lakes.geojson',
    'admin0': 'ne_10m_admin_0_countries_lakes.geojson',
    'lakes':  'ne_10m_lakes.geojson',
}

# West, south, east, north. Wider than any map view (the Surface Analysis
# Builder's full view is -128/22/-60/55) so the clip edge never shows.
EXTENT = (-132.0, 17.0, -50.0, 60.0)

US_EXCLUDE = {'AK', 'HI', 'GU', 'AS', 'MP', 'VI'}
GREAT_LAKES = {'Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario'}

# Seam fill between the Census US border and the Natural Earth Canada /
# Mexico borders, which don't share vertices. Degrees.
SEAM = 0.008
# How close US boundary must be to foreign land to count as the international border.
INTL_NEAR = 0.02
# Tolerance used to strip a shared edge from a boundary (degrees).
EPS = 0.0005

RESOLUTIONS = {
    #            simplify tol (deg)  quantize (decimals)  min lake area (deg^2)
    'national': dict(tol=0.02,   q=3, min_lake=0.05),
    'regional': dict(tol=0.0012, q=4, min_lake=0.003),
}


def log(*a):
    print('[basemap]', *a, flush=True)


def fetch_ne(key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, NE_FILES[key])
    if not os.path.exists(path):
        url = NE_BASE + NE_FILES[key]
        log('downloading', url)
        urllib.request.urlretrieve(url, path)
    with open(path) as f:
        return json.load(f)


def polys_only(g):
    """Keep only the areal parts of a geometry."""
    if g.is_empty:
        return MultiPolygon()
    if isinstance(g, Polygon):
        return MultiPolygon([g])
    if isinstance(g, MultiPolygon):
        return g
    if isinstance(g, GeometryCollection):
        parts = []
        for p in g.geoms:
            pp = polys_only(p)
            parts.extend(pp.geoms)
        return MultiPolygon(parts)
    return MultiPolygon()


def lines_only(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, MultiLineString):
        return list(g.geoms)
    if isinstance(g, GeometryCollection):
        out = []
        for p in g.geoms:
            out.extend(lines_only(p))
        return out
    return []


def load_sources():
    ext = box(*EXTENT)

    with open(os.path.join(PUBLIC, 'states-500k.geojson')) as f:
        us_geo = json.load(f)
    us_states = []
    for ft in us_geo['features']:
        if ft['properties'].get('STUSPS') in US_EXCLUDE:
            continue
        g = shape(ft['geometry']).buffer(0)
        g = g.intersection(ext)
        if not g.is_empty:
            us_states.append(g)
    log('US states:', len(us_states))
    if len(us_states) < 49:
        sys.exit('Expected at least 49 US state features — aborting.')

    a1 = fetch_ne('admin1')
    ca_prov, mx_states = [], []
    for ft in a1['features']:
        a3 = ft['properties'].get('adm0_a3')
        if a3 not in ('CAN', 'MEX'):
            continue
        g = shape(ft['geometry']).buffer(0).intersection(ext)
        if g.is_empty:
            continue
        (ca_prov if a3 == 'CAN' else mx_states).append(g)
    log('Canada provinces:', len(ca_prov), '· Mexico states:', len(mx_states))
    if len(ca_prov) < 10 or len(mx_states) < 20:
        sys.exit('Natural Earth admin-1 looks incomplete — aborting.')

    a0 = fetch_ne('admin0')
    others = []
    for ft in a0['features']:
        a3 = ft['properties'].get('ADM0_A3')
        if a3 in ('USA', 'CAN', 'MEX'):
            continue
        g = shape(ft['geometry']).buffer(0)
        if g.intersects(ext):
            others.append(g.intersection(ext))
    log('Other countries in extent:', len(others))

    lk = fetch_ne('lakes')
    lakes = []
    for ft in lk['features']:
        name = ft['properties'].get('name')
        if name in GREAT_LAKES:
            continue
        g = shape(ft['geometry']).buffer(0)
        if g.intersects(ext):
            lakes.append(g.intersection(ext))
    # Drop anything that touches the Great Lakes themselves (named bays such
    # as Georgian Bay / Saginaw Bay are separate NE features).
    gl = unary_union([shape(ft['geometry']).buffer(0) for ft in lk['features']
                      if ft['properties'].get('name') in GREAT_LAKES]).buffer(0.01)
    lakes = [g for g in lakes if not g.intersects(gl)]
    log('Inland lakes (pre-filter):', len(lakes))

    return ext, us_states, ca_prov, mx_states, others, lakes


def admin_interior_lines(units, outer):
    """Internal borders between the units of one country."""
    lines = unary_union([u.boundary for u in units])
    lines = lines.difference(outer.boundary.buffer(EPS))
    return lines


def build_geometry():
    ext, us_states, ca_prov, mx_states, others, lakes = load_sources()

    us = unary_union(us_states)
    ca = unary_union(ca_prov)
    mx = unary_union(mx_states)
    foreign = unary_union([ca, mx] + others)

    # Close the hairline gap where Census and Natural Earth borders meet.
    seam = foreign.buffer(SEAM).intersection(us.buffer(SEAM))
    foreign_fill = unary_union([foreign, seam]).intersection(ext)

    admin1 = unary_union([
        admin_interior_lines(us_states, us),
        admin_interior_lines(ca_prov, ca),
        admin_interior_lines(mx_states, mx),
    ])

    near_foreign = unary_union([ca, mx]).buffer(INTL_NEAR)
    intl = us.boundary.intersection(near_foreign)

    return dict(ext=ext, us=us, foreign_fill=foreign_fill, lakes=lakes,
                admin1=admin1, intl=intl)


def encode_ring(coords, q):
    s = 10 ** q
    out = []
    px = py = None
    for x, y in coords:
        ix, iy = round(x * s), round(y * s)
        if px is None:
            out += [ix, iy]
        else:
            dx, dy = ix - px, iy - py
            if dx == 0 and dy == 0:
                continue
            out += [dx, dy]
        px, py = ix, iy
    return out


def encode_polys(mp, q):
    polys = []
    for p in mp.geoms:
        rings = [encode_ring(p.exterior.coords, q)]
        rings += [encode_ring(r.coords, q) for r in p.interiors]
        rings = [r for r in rings if len(r) >= 8]  # ≥ 4 points
        if rings:
            polys.append(rings)
    return polys


def encode_lines(lines, q):
    out = []
    for ln in lines:
        r = encode_ring(ln.coords, q)
        if len(r) >= 4:
            out.append(r)
    return out


def build_resolution(G, name, tol, q, min_lake):
    lakes = unary_union([g for g in G['lakes'] if g.area >= min_lake])

    us_fill = polys_only(G['us'].difference(lakes).simplify(tol, preserve_topology=True))
    fg_fill = polys_only(G['foreign_fill'].difference(lakes).simplify(tol, preserve_topology=True))

    land = unary_union([G['us'], G['foreign_fill']]).difference(lakes)
    land = land.simplify(tol, preserve_topology=True)
    # Coastline = land edge, minus the artificial edge where land meets the extent clip.
    coast = land.boundary.difference(G['ext'].exterior.buffer(1e-6))
    coast = linemerge(lines_only(coast)) if lines_only(coast) else coast

    admin1 = G['admin1'].difference(lakes.buffer(EPS)) if not lakes.is_empty else G['admin1']
    admin1 = linemerge(lines_only(admin1)).simplify(tol, preserve_topology=False)
    intl = linemerge(lines_only(G['intl'])).simplify(tol, preserve_topology=False)

    out = {
        'v': 1,
        'res': name,
        'q': q,
        'extent': list(EXTENT),
        'source': 'US: U.S. Census Bureau cartographic boundary 1:500k. '
                  'Canada, Mexico, other land and inland lakes: Natural Earth 1:10m.',
        'fill_foreign': encode_polys(fg_fill, q),
        'fill_us':      encode_polys(us_fill, q),
        'coast':        encode_lines(lines_only(coast), q),
        'intl':         encode_lines(lines_only(intl), q),
        'admin1':       encode_lines(lines_only(admin1), q),
    }

    # Defensive checks before writing anything.
    n_pts = {k: sum(len(r) // 2 for p in out[k] for r in p) for k in ('fill_foreign', 'fill_us')}
    n_pts.update({k: sum(len(l) // 2 for l in out[k]) for k in ('coast', 'intl', 'admin1')})
    log(name, 'points per layer:', n_pts)
    for k, minimum in (('fill_us', 500), ('fill_foreign', 500), ('coast', 500), ('admin1', 200), ('intl', 20)):
        if n_pts[k] < minimum:
            sys.exit(f'{name}: layer {k} has only {n_pts[k]} points — aborting without writing.')

    path = os.path.join(PUBLIC, f'basemap-{name}.json')
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    log('wrote', path, f'{os.path.getsize(path) / 1024:.0f} KB')


def main():
    G = build_geometry()
    for name, cfg in RESOLUTIONS.items():
        build_resolution(G, name, **cfg)


if __name__ == '__main__':
    main()
