#!/usr/bin/env python3
"""
build_basemap.py — builds the shared ContextClimate basemaps.

Outputs (public/):
  basemap-regional.json  Eastern US / SE Canada at shoreline detail
                         (Tri-State and any other zoomed-in view inside
                         REGIONAL_EXTENT)
  basemap-national.json  North America at national-map detail

Sources
  Land / water edge
    regional  OpenStreetMap land polygons (100 m, via simonepri/geo-maps
              v0.6.0, © OpenStreetMap contributors, ODbL). Cleaned here:
              tile seams closed, tile-edge pinholes and specks removed.
    national  Natural Earth 10m admin-0 (lakes variant) minus large lakes.
  State lines   U.S. Census Bureau cartographic boundary 1:500k (2020)
  Provinces, other countries   Natural Earth 10m admin-1 / admin-0

Census boundaries are *legal* lines — they run across Peconic Bay, Great
South Bay, Long Island Sound — so they are never used for the land fill.
map-base.js clips state/province lines to the land, so those water
crossings don't draw.

Layers written (coordinates: integers at 10^-q degrees, delta-encoded):
  land     polygons, even-odd rings (lakes are holes); its outline is the coast
  foreign  non-US land (drawn clipped to `land` in a slightly darker tint)
  admin1   state / province interior borders (lines)
  intl     US land border with Canada and Mexico (lines)

Run from the repo root:
  pip install shapely ijson
  python scripts/build_basemap.py
Downloads (~180 MB, cached in scripts/.cache/) happen on first run.
"""

import json
import os
import pickle
import sys
import time
import urllib.request

import shapely
from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.ops import unary_union, linemerge

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, 'public')
CACHE = os.path.join(REPO, 'scripts', '.cache')

NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
SOURCES = {
    'ne_admin1': NE_BASE + 'ne_10m_admin_1_states_provinces_lakes.geojson',
    'ne_admin0': NE_BASE + 'ne_10m_admin_0_countries_lakes.geojson',
    'ne_lakes':  NE_BASE + 'ne_10m_lakes.geojson',
    'census':    'https://raw.githubusercontent.com/loganpowell/census-geojson/master/GeoJSON/500k/2020/state.json',
    'osm_land':  'https://github.com/simonepri/geo-maps/releases/download/v0.6.0/earth-lands-100m.geo.json',
}

NATIONAL_EXTENT = (-132.0, 17.0, -50.0, 60.0)
# Keep in sync with REGIONAL_EXTENT in map-base.js.
REGIONAL_EXTENT = (-84.5, 34.5, -63.5, 49.0)

US_EXCLUDE = {'AK', 'HI', 'GU', 'AS', 'MP', 'VI', 'PR'}

RESOLUTIONS = {
    'national': dict(extent=NATIONAL_EXTENT, tol=0.02,   q=3, min_island=0.02,    min_hole=0.05),
    'regional': dict(extent=REGIONAL_EXTENT, tol=0.0012, q=4, min_island=0.00004, min_hole=0.0015),
}

OSM_CLOSE = 0.0009     # deg — closes seams between OSM tiles (~100 m)
INTL_NEAR = 0.02       # deg — US boundary this close to Canada/Mexico is the international border
EPS = 0.0005           # deg — strip a shared edge from a boundary


def log(*a):
    print('[basemap]', *a, flush=True)


def cached(key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(SOURCES[key]))
    if not os.path.exists(path):
        log('downloading', SOURCES[key])
        urllib.request.urlretrieve(SOURCES[key], path)
    return path


def load_json(key):
    with open(cached(key)) as f:
        return json.load(f)


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        out = []
        for p in g.geoms:
            out.extend(polys(p))
        return out
    return []


def lines(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, (MultiLineString, GeometryCollection)):
        out = []
        for p in g.geoms:
            out.extend(lines(p))
        return out
    return []


def drop_small(g, min_island, min_hole):
    out = []
    for p in polys(g):
        if p.area < min_island:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= min_hole]
        out.append(Polygon(p.exterior, holes))
    return MultiPolygon(out)


# ── Land ──────────────────────────────────────────────
def osm_land(extent, min_island, min_hole):
    """OSM land polygons inside `extent`, cleaned of tile artifacts."""
    import ijson
    done = os.path.join(CACHE, 'osm_land_clean_%s.pkl' % '_'.join(str(v) for v in extent))
    if os.path.exists(done):
        with open(done, 'rb') as f:
            return pickle.load(f)
    subset = os.path.join(CACHE, 'osm_land_%s.json' % '_'.join(str(v) for v in extent))
    if not os.path.exists(subset):
        log('extracting OSM land for', extent, '(streams the 117 MB source)')
        keep = []
        with open(cached('osm_land'), 'rb') as f:
            for poly in ijson.items(f, 'geometries.item.coordinates.item', use_float=True):
                ext = poly[0]
                xs = [c[0] for c in ext]
                if max(xs) < extent[0] or min(xs) > extent[2]:
                    continue
                ys = [c[1] for c in ext]
                if max(ys) < extent[1] or min(ys) > extent[3]:
                    continue
                keep.append(poly)
        with open(subset, 'w') as f:
            json.dump(keep, f)
    with open(subset) as f:
        raw = json.load(f)

    parts = []
    for poly in raw:
        holes = [h for h in poly[1:] if len(h) > 3 and Polygon(h).area >= min_hole]
        p = Polygon(poly[0], holes)
        if not p.is_valid:
            p = p.buffer(0)
        p = shapely.clip_by_rect(p, *extent)
        if not p.is_empty:
            parts.append(p)
    log('OSM parts:', len(parts))
    land = unary_union(parts)
    land = land.buffer(OSM_CLOSE, join_style='mitre', mitre_limit=2) \
               .buffer(-OSM_CLOSE, join_style='mitre', mitre_limit=2)
    land = drop_small(land, min_island, min_hole)
    with open(done, 'wb') as f:
        pickle.dump(land, f)
    return land


def ne_land(extent, min_island, min_hole):
    ext = box(*extent)
    parts = []
    for ft in load_json('ne_admin0')['features']:
        g = shape(ft['geometry']).buffer(0)
        if g.intersects(ext):
            parts.append(g.intersection(ext))
    land = unary_union(parts)
    lakes = []
    for ft in load_json('ne_lakes')['features']:
        g = shape(ft['geometry']).buffer(0)
        if g.intersects(ext) and g.area >= min_hole:
            lakes.append(g)
    if lakes:
        land = land.difference(unary_union(lakes))
    return drop_small(land, min_island, min_hole)


# ── Boundaries ────────────────────────────────────────
def boundaries(extent):
    ext = box(*extent)
    census = load_json('census')
    feats = [ft for ft in census['features'] if ft['properties'].get('STUSPS') not in US_EXCLUDE]
    if len(feats) < 49:
        sys.exit(f'Census: expected ≥49 states, got {len(feats)} — aborting.')
    us_states = []
    for ft in feats:
        g = shape(ft['geometry']).buffer(0).intersection(ext)
        if not g.is_empty:
            us_states.append(g)

    ca, mx = [], []
    for ft in load_json('ne_admin1')['features']:
        a3 = ft['properties'].get('adm0_a3')
        if a3 not in ('CAN', 'MEX'):
            continue
        g = shape(ft['geometry']).buffer(0).intersection(ext)
        if not g.is_empty:
            (ca if a3 == 'CAN' else mx).append(g)

    foreign = []
    for ft in load_json('ne_admin0')['features']:
        if ft['properties'].get('ADM0_A3') == 'USA':
            continue
        g = shape(ft['geometry']).buffer(0)
        if g.intersects(ext):
            foreign.append(g.intersection(ext))

    def interior(units):
        if not units:
            return GeometryCollection()
        outer = unary_union(units)
        return unary_union([u.boundary for u in units]).difference(outer.boundary.buffer(EPS))

    us = unary_union(us_states)
    admin1 = unary_union([interior(us_states), interior(ca), interior(mx)])
    near = unary_union(ca + mx).buffer(INTL_NEAR) if (ca or mx) else GeometryCollection()
    intl = us.boundary.intersection(near) if not near.is_empty else GeometryCollection()
    return unary_union(foreign), admin1, intl


# ── Encoding ──────────────────────────────────────────
def enc(coords, q):
    s = 10 ** q
    out, px, py = [], None, None
    for x, y in coords:
        ix, iy = round(x * s), round(y * s)
        if px is None:
            out += [ix, iy]
        elif ix != px or iy != py:
            out += [ix - px, iy - py]
        else:
            continue
        px, py = ix, iy
    return out


def enc_polys(g, q):
    out = []
    for p in polys(g):
        rings = [enc(p.exterior.coords, q)] + [enc(r.coords, q) for r in p.interiors]
        rings = [r for r in rings if len(r) >= 8]
        if rings:
            out.append(rings)
    return out


def enc_lines(g, q):
    ls = lines(g)
    if ls:
        ls = lines(linemerge(ls))
    return [r for r in (enc(l.coords, q) for l in ls) if len(r) >= 4]


def build(name, extent, tol, q, min_island, min_hole):
    t = time.time()
    land = osm_land(extent, min_island, min_hole) if name == 'regional' else ne_land(extent, min_island, min_hole)
    land = drop_small(land.simplify(tol, preserve_topology=True), min_island, min_hole)
    foreign, admin1, intl = boundaries(extent)
    foreign = foreign.simplify(tol, preserve_topology=True)
    admin1 = unary_union(lines(admin1)).simplify(tol, preserve_topology=False)
    intl = unary_union(lines(intl)).simplify(tol, preserve_topology=False)

    out = {
        'v': 2, 'res': name, 'q': q, 'extent': list(extent),
        'source': ('Land: OpenStreetMap contributors (ODbL). ' if name == 'regional' else 'Land: Natural Earth 1:10m. ')
                  + 'State lines: U.S. Census Bureau 1:500k. Provinces and other countries: Natural Earth 1:10m.',
        'land':    enc_polys(land, q),
        'foreign': enc_polys(foreign, q),
        'admin1':  enc_lines(admin1, q),
        'intl':    enc_lines(intl, q),
    }
    counts = {k: sum(len(r) // 2 for p in out[k] for r in p) for k in ('land', 'foreign')}
    counts.update({k: sum(len(l) // 2 for l in out[k]) for k in ('admin1', 'intl')})
    log(name, counts, f'{time.time() - t:.0f}s')
    for k, minimum in (('land', 2000), ('foreign', 200), ('admin1', 500), ('intl', 20)):
        if counts[k] < minimum:
            sys.exit(f'{name}: layer {k} has only {counts[k]} points — aborting without writing.')
    path = os.path.join(PUBLIC, f'basemap-{name}.json')
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    log('wrote', path, f'{os.path.getsize(path) / 1024:.0f} KB')


def main():
    only = sys.argv[1:] or list(RESOLUTIONS)
    for name in only:
        build(name, **RESOLUTIONS[name])


if __name__ == '__main__':
    main()
