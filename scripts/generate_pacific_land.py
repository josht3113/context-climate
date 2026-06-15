#!/usr/bin/env python3
"""
generate_pacific_land.py
────────────────────────
Generate public/pacific-land.geojson — Natural Earth 10m land polygons
clipped to the Pacific SST Anomaly Map viewport.

Viewport:  110°E → 75°W  (crosses the antimeridian)  ·  25°S → 25°N
Output:    public/pacific-land.geojson

Usage:
    pip install geopandas requests shapely
    python scripts/generate_pacific_land.py
"""

import io
import os
import tempfile
import zipfile

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import box

# ── CONFIG ────────────────────────────────────────────────────────────────────

NE_URL = "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip"

# Output path — script lives in scripts/, output goes to public/
OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "pacific-land.geojson",
)

# 1° of padding beyond the map edge so coastlines at the boundary
# are rendered completely without a hard clip-line artifact.
PAD = 1.0
LAT_LO = -25 - PAD   # 26°S
LAT_HI =  25 + PAD   # 26°N

# The viewport crosses the antimeridian, so we need TWO clip boxes in
# standard -180/+180 GeoJSON longitude space:
#
#   EAST_BOX  - western Pacific  (Indonesia / Philippines / PNG / Japan tip)
#               GeoJSON lons: 109°E to 180°
#
#   WEST_BOX  - eastern Pacific  (Central America / western South America)
#               GeoJSON lons: -180° to -74°  (i.e. 75°W + 1° pad)
#
EAST_BOX = box(110 - PAD, LAT_LO,  180,          LAT_HI)
WEST_BOX = box(-180,      LAT_LO, -75 + PAD, LAT_HI)

# Simplification tolerance in degrees.
# 0.005° ≈ 0.5 km at the equator — sharper than 0.01° for complex
# coastlines (PNG, Philippines) while still trimming file size.
# Set to 0 to skip simplification entirely.
SIMPLIFY_TOL = 0.005

# Minimum polygon area in square degrees.
# Polygons smaller than this are dropped before the final dissolve.
# 0.005 sq° ≈ 60 km² at the equator — removes tiny atolls and specks
# that read as noise at this map scale, while keeping recognisable
# islands (Guam ~0.045 sq°, Pohnpei ~0.027 sq°, etc.).
# Increase toward 0.05 to be more aggressive, decrease toward 0.001
# to keep more small islands.
MIN_AREA_SQ_DEG = 0.005


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    # 1. Download the zip
    print("Downloading Natural Earth 10m land shapefile...")
    r = requests.get(NE_URL, timeout=120)
    r.raise_for_status()
    print(f"  {len(r.content) / 1024:.0f} KB downloaded")

    # 2. Unzip to a temp dir and read
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            z.extractall(tmpdir)
        shp = os.path.join(tmpdir, "ne_10m_land.shp")
        print("Reading shapefile...")
        world = gpd.read_file(shp)

    print(f"  {len(world)} land polygons in source dataset")

    # 3. Clip each side of the antimeridian separately
    print("Clipping — east of antimeridian (Indonesia / PNG / Philippines)...")
    east = gpd.clip(world, EAST_BOX)
    print(f"  {len(east)} features retained")

    print("Clipping — west of antimeridian (Central & South America)...")
    west = gpd.clip(world, WEST_BOX)
    print(f"  {len(west)} features retained")

    # 4. Combine, filter small islands, dissolve into one MultiPolygon
    combined = gpd.GeoDataFrame(
        pd.concat([east, west], ignore_index=True), crs=world.crs
    )
    combined = combined[~combined.geometry.is_empty].copy()

    # Explode any multipolygons into individual polygons so we can
    # filter each piece independently by area.
    print("Exploding multipolygons and filtering by minimum area...")
    combined = combined.explode(index_parts=False).reset_index(drop=True)
    before = len(combined)
    combined = combined[combined.geometry.area >= MIN_AREA_SQ_DEG].copy()
    dropped = before - len(combined)
    print(f"  Kept {len(combined)} of {before} polygons (dropped {dropped} small islands/atolls)")

    print(f"Dissolving {len(combined)} features into a single geometry...")
    dissolved = combined.dissolve()

    # 5. Simplify
    if SIMPLIFY_TOL > 0:
        print(f"Simplifying (tolerance = {SIMPLIFY_TOL}°, preserve_topology = True)...")
        dissolved.geometry = dissolved.geometry.simplify(
            SIMPLIFY_TOL, preserve_topology=True
        )

    # 6. Write — geometry only, no unnecessary attribute columns
    out = gpd.GeoDataFrame(geometry=dissolved.geometry, crs=dissolved.crs)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    out.to_file(OUT_PATH, driver="GeoJSON")

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"\nDone.")
    print(f"  Output : {os.path.normpath(OUT_PATH)}")
    print(f"  Size   : {size_kb:.1f} KB")
    print()
    print("Next step: commit public/pacific-land.geojson and update the HTML.")


if __name__ == "__main__":
    main()
