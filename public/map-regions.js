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
    label:  'Tri-State',
  },

  // Continental US, padded so models at the border and coastal
  // stations (Caribou, International Falls, Seattle, Key West) fit.
  // Regional boxes (same as the Surface Analysis Builder's presets).
  northeast:      { bounds: { west: -80.5, east: -66.5, south: 38.3, north: 47.6 }, label: 'Northeast' },
  southeast:      { bounds: { west: -91,   east: -75,   south: 24.3, north: 37.6 }, label: 'Southeast' },
  midwest:        { bounds: { west: -97.5, east: -80.5, south: 38,   north: 49.4 }, label: 'Midwest' },
  northernplains: { bounds: { west: -104.5, east: -94,  south: 41,   north: 49.3 }, label: 'N. Plains' },
  southernplains: { bounds: { west: -106.8, east: -93,  south: 25.5, north: 37.2 }, label: 'S. Plains' },
  mountainwest:   { bounds: { west: -114,  east: -102,  south: 36.5, north: 49.3 }, label: 'Mountain West' },
  southwest:      { bounds: { west: -117,  east: -103,  south: 31,   north: 39 },   label: 'Southwest' },
  pacificnw:      { bounds: { west: -125,  east: -116.5, south: 42,  north: 49.3 }, label: 'Pacific NW' },
  california:     { bounds: { west: -125,  east: -114,  south: 32.3, north: 42.1 }, label: 'California' },

  conus: {
    bounds: { west: -126.5, east: -65.5, north: 50.6, south: 23.3 },
    label:  'Continental US',
  },

};
