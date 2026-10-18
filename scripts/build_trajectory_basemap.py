#!/usr/bin/env python3
"""
build_trajectory_basemap.py — basemap for the Back Trajectories map.

Output (public/): basemap-trajectory.json
  Northern Hemisphere (10°S–90°N, all longitudes) at Natural Earth 1:50m, so
  trajectory tails over the Pacific, Atlantic and Arctic sit on real coastlines.

Layers (coordinates: integers at 10^-q degrees, delta-encoded [x0,y0,dx,dy,...]):
  land    polygons (rings); outline is the coast
  lakes   large lakes (drawn as water)
  admin0  land boundaries between countries (lines)
  admin1  US states, Canadian provinces, Mexican states (lines)

Run from the repo root:
  pip install shapely
  python scripts/build_trajectory_basemap.py
"""

import json
import os
import urllib.request

from shapely.geometry import shape, box, Polygon, MultiPolygon, LineString, MultiLineString, GeometryCollection
from shapely.geometry.polygon import orient

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, 'public')
CACHE = os.path.join(REPO, 'scripts', '.cache')

NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
SOURCES = {
    'land':   NE + 'ne_50m_land.geojson',
    'lakes':  NE + 'ne_50m_lakes.geojson',
    'admin0': NE + 'ne_50m_admin_0_boundary_lines_land.geojson',
    'admin1': NE + 'ne_50m_admin_1_states_provinces_lines.geojson',
}
EXTENT = (-180.0, -10.0, 180.0, 90.0)
Q = 2                     # 0.01°
TOL = 0.04                # simplification tolerance, degrees
MIN_LAND = 0.15           # deg² — drop smaller islands
MIN_LAKE = 1.5            # deg² — keep only large lakes
ADMIN1 = {'USA', 'CAN', 'MEX'}


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


def enc(coords):
    s = 10 ** Q
    out, px, py = [], 0, 0
    for x, y in coords:
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


def main():
    clip = box(*EXTENT)
    out = {'v': 1, 'q': Q, 'extent': EXTENT,
           'source': 'Natural Earth 1:50m (land, lakes, admin-0 and admin-1 boundary lines).',
           'land': [], 'lakes': [], 'admin0': [], 'admin1': []}
    for f in load('land'):
        for p in polys(shape(f['geometry']).intersection(clip)):
            if p.area < MIN_LAND:
                continue
            # d3-geo winding: exterior clockwise, holes counter-clockwise
            p = orient(p.simplify(TOL, preserve_topology=True), sign=-1.0)
            rings = [enc(p.exterior.coords)] + [enc(r.coords) for r in p.interiors if Polygon(r).area > MIN_LAKE]
            out['land'].append(rings)
    for f in load('lakes'):
        for p in polys(shape(f['geometry']).intersection(clip)):
            if p.area >= MIN_LAKE:
                out['lakes'].append([enc(orient(p.simplify(TOL, preserve_topology=True), sign=-1.0).exterior.coords)])
    for f in load('admin0'):
        for l in lines(shape(f['geometry']).intersection(clip)):
            out['admin0'].append(enc(l.simplify(TOL).coords))
    for f in load('admin1'):
        if f['properties'].get('ADM0_A3') not in ADMIN1:
            continue
        for l in lines(shape(f['geometry']).intersection(clip)):
            out['admin1'].append(enc(l.simplify(TOL / 2).coords))
    path = os.path.join(PUBLIC, 'basemap-trajectory.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print(f"{path}: {os.path.getsize(path) / 1e3:.0f} kB — land {len(out['land'])}, lakes {len(out['lakes'])}, "
          f"admin0 {len(out['admin0'])}, admin1 {len(out['admin1'])}")


if __name__ == '__main__':
    main()
