/* ═══════════════════════════════════════════════════════════════
   map-base.js — shared map rendering for contextclimate.io
   ───────────────────────────────────────────────────────────────
   This file is loaded by every map page (surface-map.html and any
   future regional maps). It centralizes:

     • Colors        — ocean, land, state outlines, text
     • Fonts         — header, station model, legend, stamp
     • Station model — circle radius, wind barb sizing
     • Projection    — converts (lon, lat) → canvas (x, y)
     • Base render   — fills ocean, draws land + state outlines
     • Stamp         — the "[ contextclimate ] · VALID …" watermark

   To change the look of every map at once, edit the tokens below.
   To use this in an HTML page, see surface-map.html for an example.
   ═══════════════════════════════════════════════════════════════ */

window.MAP = (function () {

  // ── Visual tokens ──────────────────────────────────
  // Light, paper-style basemap with sharp blue-gray borders.
  const COLORS = {
    ocean:         '#dce8f0',
    land:          '#f0f4f7',
    outlineGlow:   'rgba(60,90,120,0.4)',
    outlineMain:   '#7090b0',
    textPrimary:   '#222',
    textSecondary: '#666',
    textTertiary: 'rgba(255,255,255,0.32)',   // legend bg is dark, so this stays light
    accent:        '#1D9E75',                  // matches the Live section
    temp:          '#e05252',
    dew:           '#6aabee',
  };

  // Typography — Barlow Condensed for labels/UI, JetBrains Mono for numerics.
  const FONTS = {
    stationData: '600 14px "Barlow Condensed"',  // temp, dew, pressure on station
    stationId:   '12px "Barlow Condensed"',      // tiny station ID below circle
    stampLogo:   '600 13px "Barlow Condensed"',
    stampValid:  '11px "JetBrains Mono"',
  };

  // Station model geometry. R drives everything else.
  const STATION = {
    R:          8,    // sky cover circle radius (px)
    SL:         34,   // wind barb staff length
    BL:         9,    // full barb (10 kt) length
    BS:         5,    // spacing between barbs along staff
    OFFSET_PAD: 7,    // additional gap beyond R for the text labels
  };

  // ── Projection ─────────────────────────────────────
  // Equirectangular projection scaled to keep aspect honest at the
  // midpoint latitude. For our small regions this looks essentially
  // identical to fancier projections like Mercator/Albers.
  function computeDims(bounds, CW) {
    const midLat = Math.PI * (bounds.north + bounds.south) / 2 / 180;
    const CH = Math.round(
      CW * (bounds.north - bounds.south) /
           ((bounds.east - bounds.west) * Math.cos(midLat))
    );
    return { CW, CH };
  }

  function makeProjection(bounds, dims) {
    const { CW, CH } = dims;
    const lonR      = bounds.east - bounds.west;
    const latR      = bounds.north - bounds.south;
    const lonCenter = (bounds.west + bounds.east) / 2;
    const midLat    = Math.PI * (bounds.north + bounds.south) / 2 / 180;
    const cosMid    = Math.cos(midLat);

    // x is corrected by cos(lat)/cos(midLat) at each point so longitude
    // lines converge realistically away from the box's mid-latitude —
    // without this, wide-latitude regions (e.g. CONUS) render northern
    // states too wide and southern states too narrow, since a degree of
    // longitude covers less true ground distance the farther you are
    // from the equator. At lat === midLat this reduces algebraically to
    // the original flat (lon - west) / lonR * CW formula, so narrow
    // regions like Tri-State render identically to before.
    return (lon, lat) => {
      const xScale = Math.cos(lat * Math.PI / 180) / cosMid;
      return [
        CW / 2 + (lon - lonCenter) * xScale / lonR * CW,
        (bounds.north - lat) / latR * CH,
      ];
    };
  }

  // ── Base render (ocean → land → outlines) ──────────
  function renderBase(ctx, geo, project, dims) {
    const { CW, CH } = dims;

    // Step 1: fill entire canvas with ocean color
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, CW, CH);

    if (!geo || !geo.features) return;

    // Helper: trace a single ring of [lon, lat] coordinates as a path
    function traceRing(ring) {
      let first = true;
      for (const pt of ring) {
        const [x, y] = project(pt[0], pt[1]);
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
    }

    // Step 2: fill land (each state polygon)
    ctx.fillStyle = COLORS.land;
    for (const feat of geo.features) {
      const g = feat.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        ctx.beginPath();
        for (const ring of poly) traceRing(ring);
        ctx.fill();
      }
    }

    // Step 3: state outlines — two passes give a subtle glow effect
    // that helps coastlines read against the ocean
    for (const feat of geo.features) {
      const g = feat.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        ctx.beginPath();
        for (const ring of poly) traceRing(ring);
        ctx.strokeStyle = COLORS.outlineGlow;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = COLORS.outlineMain;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }
  }

  // ── Stamp / watermark in bottom-left corner ────────
  function drawStamp(ctx, validTime, dims) {
    const { CH } = dims;
    const PAD = 14;
    const logo = '[ contextclimate ]';
    let ts = '';

    if (validTime) {
      const hh = String(validTime.getUTCHours()).padStart(2, '0');
      const mm = String(validTime.getUTCMinutes()).padStart(2, '0');
      const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][validTime.getUTCMonth()];
      const dd = String(validTime.getUTCDate()).padStart(2, '0');
      const yy = validTime.getUTCFullYear();
      ts = `VALID ${hh}${mm}Z  ${dd} ${mo} ${yy}`;
    }

    ctx.save();
    ctx.textBaseline = 'bottom';

    // Stamp sits on light map, so use a darker color than before
    ctx.font = FONTS.stampLogo;
    ctx.fillStyle = COLORS.accent;
    ctx.textAlign = 'left';
    ctx.fillText(logo, PAD, CH - PAD);

    if (ts) {
      const logoW = ctx.measureText(logo).width;
      ctx.font = FONTS.stampValid;
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText('  ·  ' + ts, PAD + logoW, CH - PAD - 0.5);
    }
    ctx.restore();
  }

  // ── Public API ─────────────────────────────────────
  return {
    COLORS, FONTS, STATION,
    computeDims, makeProjection,
    renderBase, drawStamp,
  };
})();
