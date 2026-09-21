/* ════════════════════════════════════════════════════════════════════
   CONTEXTCLIMATE — SPECTRA CORE
   Shared spectral-line data and rendering helpers for the Earth & Space
   spectroscopy tools (Doppler Shift Explorer, Doppler Shift Challenge,
   Spectral Fingerprint Lab).
   ------------------------------------------------------------------
   Link from a tool's <head>, after core-sample-tools.css:
     <script src="spectra-core.js"></script>
   Lives flat in public/ alongside core-sample-tools.css — same folder,
   no subpath — so it works with GitHub's web upload flow.

   Exposes one global, CC_SPECTRA. Everything a tool needs to draw a
   spectrum lives here; a tool's own <script> should only contain its
   layout, interaction and scoring logic.

   WAVELENGTH DATA is the single source of truth for every tool that
   draws ESRT p.3 lines. Correct a wavelength HERE and every tool picks
   it up — that's the whole reason this file exists. Don't copy the
   ELEMENTS block back into a tool.
   ════════════════════════════════════════════════════════════════════ */

const CC_SPECTRA = (function () {
  'use strict';

  // ── Line data ──────────────────────────────────────────────────────
  // Rest wavelengths (nm) digitized from the NYSED Earth & Space Sciences
  // Reference Tables (2026 Rev. Edition), p. 3.
  //   strong : mirrors the bold/thick line on the source chart.
  //   ref    : the single line a tool uses for its numeric readout — a
  //            functional UI choice, independent of "strong".
  //   note   : one-line description of the pattern's shape, for tools that
  //            want to name what the student is looking at.
  const ELEMENTS = {
    hydrogen: {
      name: 'Hydrogen', symbol: 'H', color: '#E4756B',
      note: 'the Balmer series \u2014 the same four lines used to identify hydrogen in any star.',
      lines: [
        { wl: 410.2, strong: false },
        { wl: 434.0, strong: false },
        { wl: 486.1, strong: false },
        { wl: 656.3, strong: true, ref: true }
      ]
    },
    helium: {
      name: 'Helium', symbol: 'He', color: '#E8C468',
      note: 'a dense cluster near 400\u2013450 nm plus the bright 587.6 nm line, first seen in the solar spectrum in 1868, before helium was found on Earth.',
      lines: [
        { wl: 402.6, strong: false }, { wl: 412.1, strong: false }, { wl: 414.4, strong: false },
        { wl: 438.8, strong: false }, { wl: 443.8, strong: false }, { wl: 447.1, strong: false },
        { wl: 471.3, strong: false }, { wl: 492.2, strong: false }, { wl: 501.6, strong: false },
        { wl: 504.8, strong: false }, { wl: 587.6, strong: true, ref: true }, { wl: 667.8, strong: false }
      ]
    },
    carbon: {
      name: 'Carbon', symbol: 'C', color: '#8FA6C4',
      note: 'a scattered set of lines through the green and yellow, with a sharp marker near 590 nm.',
      lines: [
        { wl: 506, strong: false }, { wl: 514, strong: false }, { wl: 530, strong: false },
        { wl: 590, strong: true, ref: true }, { wl: 642, strong: false }, { wl: 648, strong: false },
        { wl: 658, strong: false }
      ]
    },
    nitrogen: {
      name: 'Nitrogen', symbol: 'N', color: '#7FBF9E',
      note: 'a tight bundle in the green near 500 nm and a dense red cluster around 630\u2013650 nm.',
      lines: [
        { wl: 495, strong: false }, { wl: 500, strong: false }, { wl: 505, strong: false },
        { wl: 632, strong: false }, { wl: 638, strong: false }, { wl: 645, strong: false },
        { wl: 648, strong: false, ref: true }, { wl: 652, strong: false }
      ]
    },
    oxygen: {
      name: 'Oxygen', symbol: 'O', color: '#6FA8D8',
      note: 'a pair of lines in the violet and a dense orange-red group around 600\u2013627 nm.',
      lines: [
        { wl: 415, strong: false }, { wl: 425, strong: false },
        { wl: 600, strong: false }, { wl: 608, strong: false }, { wl: 615, strong: true, ref: true },
        { wl: 619, strong: false }, { wl: 623, strong: false }, { wl: 627, strong: false }
      ]
    },
    silicon: {
      name: 'Silicon', symbol: 'Si', color: '#C48FC2',
      note: 'lines spread fairly evenly across the whole visible range, without one standout line.',
      lines: [
        { wl: 412, strong: false }, { wl: 460, strong: false }, { wl: 490, strong: false },
        { wl: 498, strong: false }, { wl: 528, strong: false }, { wl: 535, strong: false, ref: true },
        { wl: 558, strong: false }, { wl: 580, strong: false }, { wl: 610, strong: false },
        { wl: 618, strong: false }, { wl: 625, strong: false }, { wl: 650, strong: false },
        { wl: 662, strong: false }, { wl: 670, strong: false }
      ]
    }
  };

  const ELEMENT_ORDER = ['hydrogen', 'helium', 'carbon', 'nitrogen', 'oxygen', 'silicon'];

  // ── Constants ──────────────────────────────────────────────────────
  const C_KM_S = 299792.458;   // speed of light, km/s
  const RED_C  = '#E4756B';    // redshift / receding
  const BLUE_C = '#6FA8D8';    // blueshift / approaching
  const SURFACE = '#1E2320';   // opaque page background (canvas can't read var())

  // ── Physics ────────────────────────────────────────────────────────
  // Classical (non-relativistic) Doppler approximation. The shift is
  // MULTIPLICATIVE: the whole pattern is scaled, not translated, so line
  // spacing stretches or compresses in proportion. At 20,000 km/s that's
  // 6.7% — small but visible, and it's what makes an aligned reference
  // pattern land on every line at once instead of only the middle ones.
  function shiftedWl(restWl, velocity) {
    return restWl * (1 + velocity / C_KM_S);
  }

  // Velocity (km/s) that maps restWl onto obsWl. + = receding (redshift).
  function velocityFor(restWl, obsWl) {
    return C_KM_S * (obsWl - restWl) / restWl;
  }

  function refLine(el) {
    return el.lines.find(l => l.ref) || el.lines[0];
  }

  function shiftColor(velocity, deadband) {
    const d = deadband === undefined ? 50 : deadband;
    return velocity > d ? RED_C : velocity < -d ? BLUE_C : null;
  }

  function signLabel(velocity, deadband) {
    const d = deadband === undefined ? 50 : deadband;
    return velocity > d ? 'receding' : velocity < -d ? 'approaching' : 'at rest';
  }

  function fmtVel(v) {
    return (v >= 0 ? '+' : '') + Math.round(v).toLocaleString() + ' km/s';
  }

  // ── Wavelength → RGB (visible light approximation; Dan Bruton's algorithm) ──
  function wavelengthToRGB(wl) {
    let r, g, b;
    const w = Math.max(380, Math.min(780, wl));
    if (w >= 380 && w < 440) { r = -(w - 440) / (440 - 380); g = 0; b = 1; }
    else if (w >= 440 && w < 490) { r = 0; g = (w - 440) / (490 - 440); b = 1; }
    else if (w >= 490 && w < 510) { r = 0; g = 1; b = -(w - 510) / (510 - 490); }
    else if (w >= 510 && w < 580) { r = (w - 510) / (580 - 510); g = 1; b = 0; }
    else if (w >= 580 && w < 645) { r = 1; g = -(w - 645) / (645 - 580); b = 0; }
    else { r = 1; g = 0; b = 0; }

    let factor;
    if (w >= 380 && w < 420) factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
    else if (w >= 420 && w < 700) factor = 1.0;
    else factor = 0.3 + 0.7 * (780 - w) / (780 - 700);

    const gamma = 0.8;
    const R = r === 0 ? 0 : Math.round(255 * Math.pow(r * factor, gamma));
    const G = g === 0 ? 0 : Math.round(255 * Math.pow(g * factor, gamma));
    const B = b === 0 ? 0 : Math.round(255 * Math.pow(b * factor, gamma));
    return `rgb(${R},${G},${B})`;
  }

  // ── Geometry ───────────────────────────────────────────────────────
  // A "plot" is {x, y, w, h, wlMin, wlMax} — the rectangle a spectrum
  // band occupies and the wavelength range it covers.
  function wlToX(wl, plot) {
    return plot.x + ((wl - plot.wlMin) / (plot.wlMax - plot.wlMin)) * plot.w;
  }
  function xToWl(x, plot) {
    return plot.wlMin + ((x - plot.x) / plot.w) * (plot.wlMax - plot.wlMin);
  }
  function nmPerPx(plot) {
    return (plot.wlMax - plot.wlMin) / plot.w;
  }

  // ── Canvas sizing ──────────────────────────────────────────────────
  // Draw in LOGICAL px; the transform absorbs the pixel ratio. Export
  // paths raise dpr to a fixed EXPORT_SCALE and re-render so a PNG is
  // crisp regardless of the viewing display's devicePixelRatio.
  function sizeCanvas(cv, ctx, w, h, dpr) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Drawing ────────────────────────────────────────────────────────
  // opts.irFrom (nm): everything past this wavelength is drawn as a flat
  // near-infrared strip with a boundary line, rather than faked as visible
  // color. Used where a redshift carries a line out of the visible range.
  function drawRainbow(ctx, plot, opts) {
    const o = opts || {};
    const visMax = o.irFrom && o.irFrom < plot.wlMax ? o.irFrom : plot.wlMax;
    const visX = wlToX(visMax, plot);

    const grad = ctx.createLinearGradient(plot.x, 0, visX, 0);
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const wl = plot.wlMin + (i / steps) * (visMax - plot.wlMin);
      grad.addColorStop(i / steps, wavelengthToRGB(wl));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(plot.x, plot.y, visX - plot.x, plot.h);

    if (visMax < plot.wlMax) {
      const irGrad = ctx.createLinearGradient(visX, 0, plot.x + plot.w, 0);
      irGrad.addColorStop(0, '#2A1412');
      irGrad.addColorStop(1, '#160D0C');
      ctx.fillStyle = irGrad;
      ctx.fillRect(visX, plot.y, plot.x + plot.w - visX, plot.h);

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(232,228,217,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(visX, plot.y);
      ctx.lineTo(visX, plot.y + plot.h);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = '500 11px "Courier Prime", monospace';
      ctx.fillStyle = 'rgba(232,228,217,0.42)';
      ctx.textAlign = 'left';
      ctx.fillText('infrared', visX + 8, plot.y + plot.h - 8);
      ctx.restore();
    }
  }

  // Bright emission lines on black: the gas IS the source.
  function drawEmissionLines(ctx, plot, el, velocity, opts) {
    const o = opts || {};
    ctx.fillStyle = o.background || '#0A0C0A';
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.save();
    el.lines.forEach(line => {
      const wl = shiftedWl(line.wl, velocity);
      const x = wlToX(wl, plot);
      if (x < plot.x - 4 || x > plot.x + plot.w + 4) return;
      const w = (line.strong ? 3.5 : 2) * (o.widthScale || 1);
      const color = wavelengthToRGB(wl);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = line.strong ? 10 : 5;
      ctx.fillRect(x - w / 2, plot.y, w, plot.h);
    });
    ctx.restore();
  }

  function drawGridlines(ctx, plot, ticks) {
    ticks.forEach(t => {
      if (t < plot.wlMin || t > plot.wlMax) return;
      const x = wlToX(t, plot);
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function drawFrame(ctx, plot) {
    ctx.strokeStyle = 'rgba(232,228,217,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
  }

  // Solid absorption-style lines at the observed positions.
  function drawLines(ctx, plot, el, velocity, opts) {
    const o = opts || {};
    const color = o.color || 'rgba(8,8,8,0.9)';
    const scale = o.widthScale || 1;
    let anyVisible = false;
    el.lines.forEach(line => {
      const x = wlToX(shiftedWl(line.wl, velocity), plot);
      const w = (line.strong ? 4 : 2.2) * scale;
      if (x >= plot.x - w && x <= plot.x + plot.w + w) {
        anyVisible = true;
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, plot.y, w, plot.h);
      }
    });
    return anyVisible;
  }

  // Dashed reference ticks, with a dark underlay so they read against
  // every part of the rainbow, not just the dark end.
  function drawRefTicks(ctx, plot, el, velocity, opts) {
    const o = opts || {};
    const color = o.color || 'rgba(255,255,255,0.85)';
    ctx.save();
    el.lines.forEach(line => {
      const x = wlToX(shiftedWl(line.wl, velocity), plot);
      if (x < plot.x - 4 || x > plot.x + plot.w + 4) return;
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = 'rgba(10,10,10,0.55)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = o.lineWidth || 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawTickLabels(ctx, plot, ticks, y, opts) {
    const o = opts || {};
    ctx.save();
    ctx.font = o.font || '400 12px "Courier Prime", monospace';
    ctx.fillStyle = o.color || 'rgba(166,164,153,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ticks.forEach(t => {
      if (t < plot.wlMin || t > plot.wlMax) return;
      const x = wlToX(t, plot);
      ctx.beginPath();
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y - 8);
      ctx.strokeStyle = 'rgba(232,228,217,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // The tick mark stays put; the label nudges inward at the ends so a
      // band drawn flush to the canvas edge doesn't clip its end labels.
      const label = String(t);
      const half = ctx.measureText(label).width / 2;
      if (x - half < plot.x) ctx.textAlign = 'left';
      else if (x + half > plot.x + plot.w) ctx.textAlign = 'right';
      else ctx.textAlign = 'center';
      ctx.fillText(label, x, y);
    });
    ctx.restore();
  }

  // ── PNG export card ────────────────────────────────────────────────
  // One implementation for every tool in the series. `setScale` is the
  // tool's own hook: it sets dpr, re-sizes its canvases and re-renders, so
  // the bitmaps captured here are at EXPORT_SCALE regardless of the
  // viewing display's devicePixelRatio. It is called again afterwards to
  // put the on-screen canvases back.
  const EXPORT_SCALE = 3;

  function exportCard(opts) {
    const PAD = opts.pad || 24;
    const HDR = opts.headerHeight || 70;
    const GAP = opts.gap || 14;
    const FTR = opts.footerHeight || 30;
    const accent = opts.accent || '#3CA3AE';
    const panels = opts.canvases || [];

    if (opts.setScale) opts.setScale(EXPORT_SCALE);

    const width = opts.width || (PAD * 2 + Math.max.apply(null, panels.map(p => p.w)));
    const stackH = panels.reduce((sum, p, i) => sum + p.h + (i ? GAP : 0), 0);
    const height = HDR + stackH + FTR;

    const off = document.createElement('canvas');
    off.width = width * EXPORT_SCALE;
    off.height = height * EXPORT_SCALE;
    const oc = off.getContext('2d');
    oc.scale(EXPORT_SCALE, EXPORT_SCALE);

    oc.fillStyle = SURFACE;
    oc.fillRect(0, 0, width, height);
    oc.fillStyle = accent;
    oc.fillRect(0, 0, width, 3);

    oc.textAlign = 'left';
    oc.fillStyle = '#E8E4D9';
    oc.font = 'bold 20px "Zilla Slab", serif';
    oc.fillText(opts.title || '', PAD, 32);

    if (opts.subtitle) {
      oc.fillStyle = '#A6A499';
      oc.font = '13px "Public Sans", sans-serif';
      oc.fillText(opts.subtitle, PAD, 52);
    }

    let y = HDR;
    panels.forEach((p, i) => {
      if (i) y += GAP;
      oc.drawImage(p.cv, PAD, y, p.w, p.h);
      y += p.h;
    });

    if (opts.setScale) opts.setScale(null); // null = restore

    oc.fillStyle = '#948F82';
    oc.font = '11px "Courier Prime", monospace';
    oc.fillText(opts.footer || 'contextclimate.io', PAD, height - 12);
    oc.fillStyle = accent;
    oc.fillRect(0, height - 2, width, 2);

    const link = document.createElement('a');
    link.download = opts.filename || 'contextclimate.png';
    link.href = off.toDataURL('image/png');
    link.click();
  }

  // ── Series navigation ──────────────────────────────────────────────
  // Teaching order, not build order: the observation comes first, then the
  // spectroscopy needed to explain it.
  const SERIES = [
    { key: 'hubble',      label: "Hubble's Law",     route: '/earthandspace/hubbles-law-explorer' },
    { key: 'fingerprint', label: 'Spectral Analysis', route: '/earthandspace/spectral-fingerprint-lab' },
    { key: 'doppler',     label: 'Doppler Shift',     route: '/earthandspace/doppler-shift-explorer' },
    { key: 'challenge',   label: 'Doppler Challenge', route: '/earthandspace/doppler-shift-challenge' }
  ];

  // These tools run inside an iframe on a HashRouter site, so a bare "#/..."
  // would only move the iframe. Build an absolute URL against the parent
  // document and open it with target="_top".
  function seriesHref(route) {
    try {
      const t = window.top.location;
      return t.origin + t.pathname + '#' + route;
    } catch (e) {
      return '#' + route;
    }
  }

  function renderSeriesNav(containerId, currentKey) {
    const host = document.getElementById(containerId);
    if (!host) return;
    host.className = 'cc-series-nav';
    host.innerHTML = '';
    SERIES.forEach((item, i) => {
      const isCurrent = item.key === currentKey;
      const node = document.createElement(isCurrent ? 'span' : 'a');
      node.className = 'cc-series-step' + (isCurrent ? ' is-current' : '');
      if (!isCurrent) {
        node.href = seriesHref(item.route);
        node.target = '_top';
      }
      node.innerHTML = '<span class="cc-series-n">' + (i + 1) + '</span>' + item.label;
      host.appendChild(node);
      if (i < SERIES.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'cc-series-arrow';
        arrow.textContent = '\u2192';
        host.appendChild(arrow);
      }
    });
  }

  return {
    ELEMENTS, ELEMENT_ORDER, C_KM_S, RED_C, BLUE_C, SURFACE, EXPORT_SCALE,
    SERIES, seriesHref, renderSeriesNav, exportCard, drawEmissionLines,
    shiftedWl, velocityFor, refLine, shiftColor, signLabel, fmtVel,
    wavelengthToRGB, wlToX, xToWl, nmPerPx, sizeCanvas,
    drawRainbow, drawGridlines, drawFrame, drawLines, drawRefTicks, drawTickLabels
  };
})();