/* ═══════════════════════════════════════════════════════════════
   map-regions.js — region presets for contextclimate.io maps
   ───────────────────────────────────────────────────────────────
   Each entry is a geographic bounding box. Boundary data comes from
   the shared basemap (basemap-national.json / basemap-regional.json);
   map-base.js picks the resolution from the box's scale.

   Boxes include enough margin that a full station model at the edge
   stations still fits on the canvas.

   Naming convention for keys: lowercase, descriptive, dash-separated.
   ═══════════════════════════════════════════════════════════════ */

window.MAP_REGIONS = {

  // Tri-state wide: from Wilkes-Barre/Philadelphia (W) to Nantucket (E),
  // from Albany/Schenectady (N) to Cape May (S). Long Island stays centred.
  tristate: {
    bounds: { west: -76.0, east: -69.6, north: 43.0, south: 38.8 },
    label:  'Tri-State Wide',
  },

  // Continental US, padded so models at the border and coastal
  // stations (Caribou, International Falls, Seattle, Key West) fit.
  conus: {
    bounds: { west: -126.5, east: -65.5, north: 50.6, south: 23.3 },
    label:  'Continental US',
  },

};
