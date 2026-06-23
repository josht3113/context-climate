/* ═══════════════════════════════════════════════════════════════
   map-regions.js — region presets for contextclimate.io maps
   ───────────────────────────────────────────────────────────────
   Each entry pairs a geographic bounding box with the GeoJSON file
   containing its boundary data. Map pages reference these by key.

   To add a new region:
     1. Decide on a bounding box (north/south/east/west in degrees)
     2. Prepare a GeoJSON file clipped to that region (with buffer)
     3. Drop it in /public and add an entry below

   Naming convention for keys: lowercase, descriptive, dash-separated.
   ═══════════════════════════════════════════════════════════════ */

window.MAP_REGIONS = {

  // Tri-state wide: from Philadelphia (W) to Nantucket (E),
  // from the MA northern border (N) to Cape May (S).
  // Long Island sits in the visual center.
  tristate: {
    bounds: { west: -75.8, east: -69.8, north: 42.8, south: 39.0 },
    geo:    'northeast-coast.geojson',
    label:  'Tri-State Wide',
  },

  // Continental US, with a little padding beyond the true extremes
  // (West Quoddy Head ME ~-66.95, Cape Alava WA ~-124.7,
  //  Northwest Angle MN ~49.4N, Key West FL ~24.55N).
  conus: {
    bounds: { west: -125.5, east: -66.5, north: 49.8, south: 24.0 },
    geo:    'states-500k.geojson',
    label:  'Continental US',
  },

  // — future regions go here —
  // southeast:    { bounds: {...}, geo: 'southeast-coast.geojson', label: 'Southeast Coast' },
  // gulf-coast:   { bounds: {...}, geo: 'gulf-coast.geojson',      label: 'Gulf Coast'      },

};
