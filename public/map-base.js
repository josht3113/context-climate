/* ═══════════════════════════════════════════════════════════════
   map-base.js — shared map rendering for contextclimate.io
   ───────────────────────────────────────────────────────────────
   Loaded by surface-map.html; built to replace the inlined copy in
   the Surface Analysis Builder when it is overhauled.

     • Colors / fonts — basemap and stamp tokens
     • Projection     — (lon, lat) → canvas (x, y), and the inverse
     • Basemap        — loads basemap-national.json / basemap-regional.json
                        (built by scripts/build_basemap.py) and draws
                        water → foreign land → US land → state/province
                        borders → international border → coastline
     • Stamp          — "[ contextclimate ] · VALID …" watermark

   Station plots live in station-model.js.
   ═══════════════════════════════════════════════════════════════ */

window.MAP = (function () {

  // ── Visual tokens ──────────────────────────────────
  // Neutral "paper" basemap that stays behind the data.
  const COLORS = {
    water:         '#d6e0e7',
    landUS:        '#f7f6f2',
    landForeign:   '#eceae4',
    coast:         '#8b97a1',
    admin1:        '#bcc3c9',
    intl:          '#97a1aa',
    textPrimary:   '#1b1f24',
    textSecondary: '#69717a',
    accent:        '#1D9E75',     // Live section
    // Legacy aliases (older callers)
    ocean:         '#d6e0e7',
    land:          '#f7f6f2',
    temp:          '#c8322b',
    dew:           '#1d7f3b',
  };

  const LINES = {
    coast:  { width: 1.0, dash: null },
    admin1: { width: 0.8, dash: null },
    intl:   { width: 1.2, dash: [6, 3] },
  };

  const FONTS = {
    stampLogo:  '600 14px "Barlow Condensed"',
    stampValid: '12px "JetBrains Mono"',
  };

  // ── Projection ─────────────────────────────────────
  // Equirectangular, x corrected by cos(lat)/cos(midLat) so meridians
  // converge away from the box's mid-latitude.
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
    const cosMid    = Math.cos(Math.PI * (bounds.north + bounds.south) / 2 / 180);
    return (lon, lat) => {
      const xScale = Math.cos(lat * Math.PI / 180) / cosMid;
      return [
        CW / 2 + (lon - lonCenter) * xScale / lonR * CW,
        (bounds.north - lat) / latR * CH,
      ];
    };
  }

  function makeUnproject(bounds, dims) {
    const { CW, CH } = dims;
    const lonR      = bounds.east - bounds.west;
    const latR      = bounds.north - bounds.south;
    const lonCenter = (bounds.west + bounds.east) / 2;
    const cosMid    = Math.cos(Math.PI * (bounds.north + bounds.south) / 2 / 180);
    return (x, y) => {
      const lat = bounds.north - (y / CH) * latR;
      const xScale = Math.cos(lat * Math.PI / 180) / cosMid;
      return [lonCenter + (x - CW / 2) / CW * lonR / xScale, lat];
    };
  }

  // ── Basemap loading ────────────────────────────────
  // Pixels per degree of longitude decides which resolution to use.
  function basemapResFor(bounds, CW) {
    return CW / (bounds.east - bounds.west) > 60 ? 'regional' : 'national';
  }

  const cache = {};

  function decodeRing(arr, scale) {
    const n = arr.length / 2;
    const pts = new Float64Array(arr.length);
    let x = 0, y = 0, w = Infinity, e = -Infinity, s = Infinity, nn = -Infinity;
    for (let i = 0; i < n; i++) {
      x += arr[2 * i]; y += arr[2 * i + 1];
      const lon = x / scale, lat = y / scale;
      pts[2 * i] = lon; pts[2 * i + 1] = lat;
      if (lon < w) w = lon; if (lon > e) e = lon;
      if (lat < s) s = lat; if (lat > nn) nn = lat;
    }
    return { pts, w, e, s, n: nn };
  }

  function decode(raw) {
    const scale = Math.pow(10, raw.q);
    const polys = list => list.map(p => {
      const rings = p.map(r => decodeRing(r, scale));
      const o = rings[0];
      return { rings, w: o.w, e: o.e, s: o.s, n: o.n };
    });
    const lines = list => list.map(l => decodeRing(l, scale));
    return {
      kind: 'cc-basemap', res: raw.res, source: raw.source,
      fillForeign: polys(raw.fill_foreign),
      fillUS:      polys(raw.fill_us),
      admin1:      lines(raw.admin1),
      intl:        lines(raw.intl),
      coast:       lines(raw.coast),
    };
  }

  // Resolves to a decoded basemap. `base` is the URL prefix (default: same folder).
  function loadBasemap(res, { signal, base = '' } = {}) {
    if (cache[res]) return cache[res];
    const url = `${base}basemap-${res}.json`;
    cache[res] = fetch(url, { signal })
      .then(r => { if (!r.ok) throw new Error(`Failed to fetch ${url}: HTTP ${r.status}`); return r.json(); })
      .then(decode)
      .catch(err => { delete cache[res]; throw err; });
    return cache[res];
  }

  // ── Basemap rendering ──────────────────────────────
  function visible(item, view) {
    return !view || !(item.e < view.west || item.w > view.east || item.n < view.south || item.s > view.north);
  }

  function traceRing(ctx, pts, project, close) {
    const n = pts.length / 2;
    let [x, y] = project(pts[0], pts[1]);
    ctx.moveTo(x, y);
    for (let i = 1; i < n; i++) {
      [x, y] = project(pts[2 * i], pts[2 * i + 1]);
      ctx.lineTo(x, y);
    }
    if (close) ctx.closePath();
  }

  function fillLayer(ctx, polys, color, project, view) {
    ctx.beginPath();
    for (const p of polys) {
      if (!visible(p, view)) continue;
      for (const r of p.rings) traceRing(ctx, r.pts, project, true);
    }
    ctx.fillStyle = color;
    ctx.fill('evenodd');
  }

  function strokeLayer(ctx, lines, color, style, project, view) {
    ctx.beginPath();
    for (const l of lines) {
      if (!visible(l, view)) continue;
      traceRing(ctx, l.pts, project, false);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = style.width;
    ctx.setLineDash(style.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // `view` is the geographic bounds on screen ({west,east,south,north});
  // used only to skip off-screen geometry. Accepts a decoded basemap or,
  // for older callers, a GeoJSON FeatureCollection of land polygons.
  function renderBase(ctx, geo, project, dims, view) {
    const { CW, CH } = dims;
    ctx.save();
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, 0, CW, CH);
    if (!geo) { ctx.restore(); return; }

    const v = view ? { west: view.west - 1, east: view.east + 1, south: view.south - 1, north: view.north + 1 } : null;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (geo.kind === 'cc-basemap') {
      fillLayer(ctx, geo.fillForeign, COLORS.landForeign, project, v);
      fillLayer(ctx, geo.fillUS, COLORS.landUS, project, v);
      strokeLayer(ctx, geo.admin1, COLORS.admin1, LINES.admin1, project, v);
      strokeLayer(ctx, geo.intl, COLORS.intl, LINES.intl, project, v);
      strokeLayer(ctx, geo.coast, COLORS.coast, LINES.coast, project, v);
    } else if (geo.features) {
      ctx.beginPath();
      for (const feat of geo.features) {
        const g = feat.geometry;
        if (!g) continue;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const poly of polys) for (const ring of poly) {
          traceRing(ctx, ring.flat(), project, true);
        }
      }
      ctx.fillStyle = COLORS.landUS; ctx.fill('evenodd');
      ctx.strokeStyle = COLORS.coast; ctx.lineWidth = LINES.coast.width; ctx.stroke();
    }
    ctx.restore();
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
      ts = `VALID ${hh}${mm}Z  ${dd} ${mo} ${validTime.getUTCFullYear()}`;
    }
    ctx.save();
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';

    ctx.font = FONTS.stampLogo;
    ctx.lineWidth = 3; ctx.strokeStyle = COLORS.landUS;
    ctx.strokeText(logo, PAD, CH - PAD);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(logo, PAD, CH - PAD);

    if (ts) {
      const logoW = ctx.measureText(logo).width;
      ctx.font = FONTS.stampValid;
      const s = '  ·  ' + ts;
      ctx.strokeText(s, PAD + logoW, CH - PAD - 0.5);
      ctx.fillStyle = COLORS.textSecondary;
      ctx.fillText(s, PAD + logoW, CH - PAD - 0.5);
    }
    ctx.restore();
  }

  return {
    COLORS, LINES, FONTS,
    computeDims, makeProjection, makeUnproject,
    basemapResFor, loadBasemap, renderBase, drawStamp,
  };
})();
