/* ═══════════════════════════════════════════════════════════════
   field-analysis.js — objective analysis for contextclimate.io maps
   ───────────────────────────────────────────────────────────────
   Pure functions, screen-pixel space, no DOM. Used by
   surface-analysis.html; usable by any map built on map-base.js.

     makeGrid(W, H, step)                 → grid geometry
     barnes(points, grid, opts)           → Float32Array field
         points: [{x, y, v}]  (screen px)
         Two-pass Barnes (Koch, DesJardins & Kocin 1983): kappa from
         the mean station spacing, gamma = 0.3 on the second pass.
     coverage(points, grid, full, zero)   → 0..1 by distance to nearest station
     sample(grid, field, x, y)            → bilinear value
     contours(grid, field, levels, mask)  → [{ level, pts:[[x,y]...] }]
     extrema(grid, field, mask, opts)     → [{ type:'H'|'L', x, y, value }]
     streamlines(grid, U, V, mask, opts)  → [{ pts:[[x,y,speed]...] }]
         Evenly spaced streamlines (Jobard & Lefer 1997): each line is
         traced in both directions until it runs within `dtest` of
         another line, leaves the data, or stalls; new seeds are taken
         `dsep` either side of accepted lines.
     divergence(grid, U, V)               → per-pixel field (same units as U/px)
   ═══════════════════════════════════════════════════════════════ */

window.FIELD = (function () {
  'use strict';

  function makeGrid(W, H, step) {
    const nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1;
    return { W, H, step, nx, ny };
  }

  // ── Barnes objective analysis ──────────────────────
  function meanSpacing(points, grid) {
    const n = Math.max(points.length, 1);
    return Math.sqrt((grid.W * grid.H) / n);
  }

  function barnes(points, grid, opts = {}) {
    const { nx, ny, step } = grid;
    const out = new Float32Array(nx * ny);
    if (!points.length) return out.fill(NaN);
    const dn = opts.spacing || meanSpacing(points, grid);
    const kappa = opts.kappa || 5.052 * Math.pow(2 * dn / Math.PI, 2);
    const gamma = opts.gamma ?? 0.3;
    const cutoff = 4 * Math.sqrt(kappa);   // weights beyond this are < 1e-7

    const pass = (vals, k) => {
      const res = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const gy = j * step;
        for (let i = 0; i < nx; i++) {
          const gx = i * step;
          let ws = 0, s = 0;
          for (let p = 0; p < points.length; p++) {
            const dx = points[p].x - gx, dy = points[p].y - gy;
            if (dx > cutoff || dx < -cutoff || dy > cutoff || dy < -cutoff) continue;
            const w = Math.exp(-(dx * dx + dy * dy) / k);
            ws += w; s += w * vals[p];
          }
          res[j * nx + i] = ws > 1e-12 ? s / ws : NaN;
        }
      }
      return res;
    };

    const v0 = points.map(p => p.v);
    const first = pass(v0, kappa);
    // Residuals at the stations, then a sharper second pass on them.
    const resid = points.map(p => p.v - (sample(grid, first, p.x, p.y) ?? p.v));
    const second = pass(resid, gamma * kappa);
    for (let k = 0; k < out.length; k++) {
      out[k] = isNaN(first[k]) ? NaN : first[k] + (isNaN(second[k]) ? 0 : second[k]);
    }
    return out;
  }

  // 1 within `full` px of a station, 0 beyond `zero` px, smoothstep between.
  function coverage(points, grid, full, zero) {
    const { nx, ny, step } = grid;
    const out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const gx = i * step, gy = j * step;
        let d2 = Infinity;
        for (const p of points) {
          const dx = p.x - gx, dy = p.y - gy;
          const d = dx * dx + dy * dy;
          if (d < d2) d2 = d;
        }
        const d = Math.sqrt(d2);
        let c = d <= full ? 1 : d >= zero ? 0 : 1 - ((d - full) / (zero - full));
        if (c > 0 && c < 1) c = c * c * (3 - 2 * c);
        out[j * nx + i] = c;
      }
    }
    return out;
  }

  function sample(grid, f, x, y) {
    const { nx, ny, step } = grid;
    const fi = x / step, fj = y / step;
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return null;
    const i0 = Math.min(nx - 2, Math.floor(fi)), j0 = Math.min(ny - 2, Math.floor(fj));
    const tx = fi - i0, ty = fj - j0;
    const a = f[j0 * nx + i0], b = f[j0 * nx + i0 + 1], c = f[(j0 + 1) * nx + i0], d = f[(j0 + 1) * nx + i0 + 1];
    const v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    return isNaN(v) ? null : v;
  }

  // ── Contours (marching squares) ────────────────────
  function contours(grid, f, levels, mask, maskMin = 0.5) {
    const { nx, ny, step } = grid;
    const val = (i, j) => {
      const k = j * nx + i;
      return (mask && mask[k] < maskMin) ? NaN : f[k];
    };
    const out = [];
    for (const level of levels) {
      const segs = [];
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
          if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) continue;
          const x0 = i * step, y0 = j * step;
          const e = [];
          const cross = (v1, v2, p1, p2) => {
            if ((v1 < level) === (v2 < level)) return;
            const t = (level - v1) / (v2 - v1);
            e.push([p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]);
          };
          const P = [[x0, y0], [x0 + step, y0], [x0 + step, y0 + step], [x0, y0 + step]];
          cross(a, b, P[0], P[1]); cross(b, c, P[1], P[2]); cross(c, d, P[2], P[3]); cross(d, a, P[3], P[0]);
          if (e.length === 2) segs.push([e[0], e[1]]);
          else if (e.length === 4) {
            const centre = (a + b + c + d) / 4;
            if ((centre < level) === (a < level)) { segs.push([e[0], e[3]]); segs.push([e[1], e[2]]); }
            else { segs.push([e[0], e[1]]); segs.push([e[2], e[3]]); }
          }
        }
      }
      for (const pts of joinSegments(segs)) {
        if (pts.length >= 4) out.push({ level, pts: chaikin(pts, 2) });
      }
    }
    return out;
  }

  function joinSegments(segs) {
    const key = p => Math.round(p[0] * 8) + ',' + Math.round(p[1] * 8);
    const ends = new Map();
    const used = new Uint8Array(segs.length);
    segs.forEach((s, i) => {
      for (const e of [0, 1]) {
        const k = key(s[e]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(i);
      }
    });
    const lines = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const line = [segs[i][0], segs[i][1]];
      for (const dir of [1, 0]) {
        for (;;) {
          const tip = dir ? line[line.length - 1] : line[0];
          const cand = (ends.get(key(tip)) || []).find(k => !used[k]);
          if (cand == null) break;
          used[cand] = 1;
          const s = segs[cand];
          const next = key(s[0]) === key(tip) ? s[1] : s[0];
          if (dir) line.push(next); else line.unshift(next);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function chaikin(pts, iters) {
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
    let p = pts;
    for (let it = 0; it < iters; it++) {
      const q = closed ? [] : [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      if (closed) q.push(q[0]); else q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  }

  // ── Extrema (pressure centres) ─────────────────────
  // A grid point is a centre if it is the extreme value within `radius` px
  // and differs from the mean on a ring at that radius by ≥ `prominence`.
  function extrema(grid, f, mask, opts = {}) {
    const { nx, ny, step } = grid;
    const r = Math.max(2, Math.round((opts.radius || 90) / step));
    const prom = opts.prominence ?? 1.5;
    const minMask = opts.maskMin ?? 0.75;
    const found = [];
    for (let j = r; j < ny - r; j++) {
      for (let i = r; i < nx - r; i++) {
        const k = j * nx + i, v = f[k];
        if (isNaN(v) || (mask && mask[k] < minMask)) continue;
        let isMin = true, isMax = true, ring = 0, rn = 0, bad = false;
        for (let dj = -r; dj <= r && !bad; dj++) {
          for (let di = -r; di <= r; di++) {
            if (!di && !dj) continue;
            const d2 = di * di + dj * dj;
            if (d2 > r * r) continue;
            const w = f[(j + dj) * nx + i + di];
            if (isNaN(w)) { bad = true; break; }
            if (w <= v) isMin = false;
            if (w >= v) isMax = false;
            if (d2 >= (r - 1) * (r - 1)) { ring += w; rn++; }
          }
        }
        if (bad || (!isMin && !isMax) || !rn) continue;
        const diff = v - ring / rn;
        if (isMin && diff <= -prom) found.push({ type: 'L', x: i * step, y: j * step, value: v });
        if (isMax && diff >= prom) found.push({ type: 'H', x: i * step, y: j * step, value: v });
      }
    }
    return found;
  }

  // ── Evenly spaced streamlines ──────────────────────
  // U, V: screen-space components (x right, y down), any speed unit.
  function streamlines(grid, U, V, mask, opts = {}) {
    const dsep = opts.dsep || 30;
    const dtest = opts.dtest || dsep * 0.5;
    const h = opts.step || 1.5;
    const minSpeed = opts.minSpeed ?? 0.5;
    const maskMin = opts.maskMin ?? 0.35;
    const maxSteps = opts.maxSteps || 1400;
    const minLen = opts.minLen || dsep * 1.5;
    const W = grid.W, H = grid.H;

    const cell = dtest;
    const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
    const hash = new Map();
    const hkey = (x, y) => Math.floor(x / cell) + Math.floor(y / cell) * cols;
    const nearOther = (x, y, d, lineId) => {
      const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
      const span = Math.ceil(d / cell);
      for (let dj = -span; dj <= span; dj++) {
        for (let di = -span; di <= span; di++) {
          const pts = hash.get((ci + di) + (cj + dj) * cols);
          if (!pts) continue;
          for (const p of pts) {
            if (p[2] === lineId) continue;
            if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < d * d) return true;
          }
        }
      }
      return false;
    };
    const vel = (x, y) => {
      if (x < 0 || y < 0 || x > W || y > H) return null;
      if (mask) { const m = sample(grid, mask, x, y); if (m == null || m < maskMin) return null; }
      const u = sample(grid, U, x, y), v = sample(grid, V, x, y);
      if (u == null || v == null) return null;
      const s = Math.hypot(u, v);
      if (s < minSpeed) return null;
      return [u / s, v / s, s];
    };

    const trace = (x, y, sign, lineId) => {
      const pts = [];
      let px = x, py = y;
      for (let n = 0; n < maxSteps; n++) {
        const a = vel(px, py);
        if (!a) break;
        const mx = px + sign * a[0] * h * 0.5, my = py + sign * a[1] * h * 0.5;
        const b = vel(mx, my);
        if (!b) break;
        const nx2 = px + sign * b[0] * h, ny2 = py + sign * b[1] * h;
        if (nearOther(nx2, ny2, dtest, lineId)) break;
        // Self-approach (closed circulation): stop before the line meets itself.
        if (pts.length > 40) {
          let loop = false;
          for (let q = 0; q < pts.length - 30; q += 3) {
            if ((pts[q][0] - nx2) ** 2 + (pts[q][1] - ny2) ** 2 < dtest * dtest) { loop = true; break; }
          }
          if (loop) break;
        }
        pts.push([nx2, ny2, b[2]]);
        px = nx2; py = ny2;
      }
      return pts;
    };

    const lines = [];
    const queue = [];
    // Initial seeds: a jittered lattice at dsep, strongest wind first.
    const seeds0 = [];
    for (let y = dsep / 2; y < H; y += dsep) {
      for (let x = dsep / 2; x < W; x += dsep) {
        const a = vel(x, y);
        if (a) seeds0.push([x, y, a[2]]);
      }
    }
    seeds0.sort((p, q) => q[2] - p[2]);

    const tryLine = (x, y) => {
      const a = vel(x, y);
      if (!a || nearOther(x, y, dsep, -1)) return;
      const id = lines.length;
      const back = trace(x, y, -1, id).reverse();
      const fwd = trace(x, y, 1, id);
      const pts = back.concat([[x, y, a[2]]], fwd);
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (len < minLen) return;
      for (let k = 0; k < pts.length; k += 2) {
        const kk = hkey(pts[k][0], pts[k][1]);
        if (!hash.has(kk)) hash.set(kk, []);
        hash.get(kk).push([pts[k][0], pts[k][1], id]);
      }
      lines.push({ pts, len });
      // Candidate seeds dsep either side, every ~dsep along the line.
      const stride = Math.max(1, Math.round(dsep / h));
      for (let k = 0; k < pts.length - 1; k += stride) {
        const dx = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1];
        const n = Math.hypot(dx, dy) || 1;
        queue.push([pts[k][0] - dy / n * dsep, pts[k][1] + dx / n * dsep]);
        queue.push([pts[k][0] + dy / n * dsep, pts[k][1] - dx / n * dsep]);
      }
    };

    for (const s of seeds0) {
      tryLine(s[0], s[1]);
      while (queue.length) { const q = queue.shift(); tryLine(q[0], q[1]); }
    }
    return lines;
  }

  // ── Divergence (screen space) ──────────────────────
  function divergence(grid, U, V) {
    const { nx, ny, step } = grid;
    const out = new Float32Array(nx * ny).fill(NaN);
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        const du = (U[k + 1] - U[k - 1]) / (2 * step);
        const dv = (V[k + nx] - V[k - nx]) / (2 * step);
        out[k] = du + dv;
      }
    }
    return out;
  }

  return { makeGrid, barnes, coverage, sample, contours, extrema, streamlines, divergence, chaikin };
})();
