#!/usr/bin/env python3
"""
build_trajectory_basemap.py — basemap for the Back Trajectories map.

Output (public/): basemap-trajectory.json
  Northern Hemisphere (10°S–90°N, all longitudes) from Natural Earth, so
  trajectory tails over the Pacific, Atlantic and Arctic sit on real coastlines.

Layers (coordinates: integers at 10^-q degrees, delta-encoded [x0,y0,dx,dy,...]):
  land    polygons (rings), Natural Earth 1:10m simplified for the zoomed-out view; outline is the coast
  landHi  the same at finer tolerance, drawn when zoomed in (the tool culls it to the view)
  lakes   large lakes (drawn as water), 1:10m
  admin0  international boundaries: land lines, plus the lake sections (e.g. US–Canada
          through the Great Lakes) taken from the shared edges of the country polygons
  admin1  US states, Canadian provinces (1:50m) and Mexican states (1:10m — not in the
          1:50m set), clipped to dry land so no line runs across a lake or the sea

Run from the repo root:
  pip install shapely
  python scripts/build_trajectory_basemap.py
"""

import json
import os
import urllib.request

from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, linemerge
from shapely.strtree import STRtree

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, 'public')
CACHE = os.path.join(REPO, 'scripts', '.cache')

NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
SOURCES = {
    'land':      NE + 'ne_10m_land.geojson',
    'lakes':     NE + 'ne_10m_lakes.geojson',
    'admin0':    NE + 'ne_50m_admin_0_boundary_lines_land.geojson',
    'countries': NE + 'ne_50m_admin_0_countries.geojson',
    'admin1':    NE + 'ne_50m_admin_1_states_provinces_lines.geojson',
    'admin1_10': NE + 'ne_10m_admin_1_states_provinces_lines.geojson',
}
EXTENT = (-180.0, -10.0, 180.0, 90.0)
Q = 2                     # 0.01°
TOL = 0.03                # simplification tolerance, degrees (landHi, boundaries)
TOL_LO = 0.07             # land for the zoomed-out view
MIN_LAND = 0.15           # deg² — drop smaller islands
MIN_LAKE = 1.0            # deg² — keep only large lakes
LAKE_TOL = 0.02           # lakes are small; simplify them less
STEP = 0.5                # deg — longest segment written (see densify)
MIN_SEG = 0.08            # deg — drop boundary stubs shorter than this after clipping
ADMIN1 = {'USA', 'CAN'}   # from 1:50m
ADMIN1_10 = {'MEX'}       # from 1:10m


def load(key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(SOURCES[key]))
    if not os.path.exists(path):
        print('downloading', SOURCES[key])
        urllib.request.urlretrieve(SOURCES[key], path)
    with open(path) as f:
        return json.load(f)['features']


def polys(g):
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        return [p for x in g.geoms for p in polys(x)]
    return []


def lines(g):
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, (MultiLineString, GeometryCollection)):
        return [l for x in g.geoms for l in lines(x)]
    return []


def densify(coords):
    """d3 draws each segment as a great-circle arc, so a long segment along a parallel
    (the 49th, the Nunavut lines, the 10°S clip edge) bows poleward. Add points so no
    segment spans more than STEP degrees and lines stay on their parallels."""
    if not coords:
        return coords
    out = [coords[0]]
    for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) // STEP)
        for k in range(1, n + 1):
            out.append((x0 + (x1 - x0) * k / (n + 1), y0 + (y1 - y0) * k / (n + 1)))
        out.append((x1, y1))
    return out


def enc(coords):
    s = 10 ** Q
    out, px, py = [], 0, 0
    for x, y in densify(list(coords)):
        ix, iy = round(x * s), round(y * s)
        out += [ix - px, iy - py]
        px, py = ix, iy
    # drop repeated points created by rounding
    flat, i = out[:2], 2
    while i < len(out):
        if out[i] or out[i + 1]:
            flat += out[i:i + 2]
        i += 2
    return flat


def keep(geom, tol):
    return [l for l in lines(geom.simplify(tol)) if l.length >= MIN_SEG]


def main():
    clip = box(*EXTENT)
    out = {'v': 2, 'q': Q, 'extent': EXTENT,
           'source': 'Natural Earth (1:10m land, lakes and Mexican states; '
                     '1:50m countries, boundaries, US states and Canadian provinces).',
           'land': [], 'landHi': [], 'lakes': [], 'admin0': [], 'admin1': []}

    land_raw = [p for f in load('land') for p in polys(shape(f['geometry']).intersection(clip))]
    for key, tol in (('land', TOL_LO), ('landHi', TOL)):
        for p in land_raw:
            if p.area < MIN_LAND:
                continue
            # d3-geo winding: exterior clockwise, holes counter-clockwise
            p = orient(p.simplify(tol, preserve_topology=True), sign=-1.0)
            rings = [enc(p.exterior.coords)] + [enc(r.coords) for r in p.interiors if Polygon(r).area > MIN_LAKE]
            out[key].append(rings)

    # merge touching lake polygons (e.g. Lake Huron and Georgian Bay) so no shoreline runs across open water
    lakes_raw = [p for p in polys(unary_union([shape(f['geometry']).buffer(0) for f in load('lakes')]).intersection(clip))
                 if p.area >= MIN_LAKE]
    for p in lakes_raw:
        out['lakes'].append([enc(orient(p.simplify(LAKE_TOL, preserve_topology=True), sign=-1.0).exterior.coords)])
    lakes_u = unary_union(lakes_raw)
    # dry land: land minus the large lakes, grown slightly so coast-hugging lines survive
    dry = unary_union(land_raw).buffer(0.02).difference(lakes_u.buffer(-0.02))

    # international boundaries over land
    for f in load('admin0'):
        for l in lines(shape(f['geometry']).intersection(clip)):
            e = enc(l.simplify(TOL).coords)
            if len(e) >= 4:
                out['admin0'].append(e)
    # …and through lakes: shared edges of neighbouring country polygons, inside lakes
    ctry = [shape(f['geometry']).buffer(0) for f in load('countries')]
    ctry = [g for g in ctry if g.intersects(clip)]
    tree = STRtree(ctry)
    lake_zone = lakes_u.buffer(0.01)
    for i, a in enumerate(ctry):
        for j in tree.query(a):
            if j <= i:
                continue
            shared = a.boundary.intersection(ctry[j].buffer(0.005))
            for l in keep(shared.intersection(lake_zone), TOL / 2):
                out['admin0'].append(enc(l.coords))

    # states / provinces, dry land only
    feats = [f for f in load('admin1') if f['properties'].get('ADM0_A3') in ADMIN1] + \
            [f for f in load('admin1_10') if f['properties'].get('ADM0_A3') in ADMIN1_10]
    # join the source's short pieces into continuous lines first, so the stub filter only removes clip debris
    merged = linemerge([l for f in feats for l in lines(shape(f['geometry']))])
    for l in keep(merged.intersection(clip).intersection(dry), TOL / 2):
        out['admin1'].append(enc(l.coords))
    path = os.path.join(PUBLIC, 'basemap-trajectory.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f"{path}: {os.path.getsize(path) / 1e3:.0f} kB — land {len(out['land'])}/{len(out['landHi'])}, lakes {len(out['lakes'])}, "
          f"admin0 {len(out['admin0'])}, admin1 {len(out['admin1'])}")


if __name__ == '__main__':
    main()
