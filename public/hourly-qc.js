/* ContextClimate hourly quality control — shared by every tool that reads hourly
   ASOS data (the hourly archive and current-year IEM requests).

   HourlyQC.clean(planes)  — planes in archive units (Int16/Int32 arrays, missing = -32768):
     tmpf, dwpf: °F × 100 · wind, gust: mph · p01i: inches × 100 (−1 = trace) · wx: bit flags
     (rain 1, snow 2, freezing rain 4, sleet 8, thunder 16, fog 32, smoke 64, haze 128).
     Any plane may be absent. Values that fail are set to missing in place. Returns counts.
   HourlyQC.cleanFloat(planes) — same rules for Float32/Float64 arrays in plain units
     (°F, mph, inches; NaN = missing; wx as bit flags, NaN/undefined = none reported).
   HourlyQC.wxBits(text) — bit flags from METAR present-weather text (e.g. "-TSRA BR").

   Rules (calibrated Nov 2026 on the full archive of 20 stations; reference implementation
   and results in project notes claude/hourly-qc-notes.md):
   1. Hard limits: temp −80…135 °F, dewpoint −90…90 °F, wind 0…100 mph, gust 0…160 mph,
      hourly precip ≤ 8.00".
   2. Spikes: a 1–2 hour run that leaves and returns (neighbours within 3 h) by more than
      15 °F (temp) / 12 °F (dewpoint); exempt when thunder is reported within ±1 h.
      With a neighbour on one side only: a jump of 30 °F / 24 °F.
   3. Dewpoint above temperature by > 1 °F, or relative humidity below 1 %.
   4. Wind: a 1–2 hour run ≥ 35 mph that is > 30 mph and > 2.5× the surrounding hours
      (one-sided: > 45 mph and > 3×); when precip or thunder is reported within ±1 h,
      only values above 75 mph fail.
   5. Gust ≥ 60 mph and > 4× the strongest sustained wind within ±1 h; when precip or
      thunder is reported within ±1 h, only gusts above 100 mph fail.
   6. Hourly precip ≥ 1.00" with no precip reported within ±1 h; > 1.50" in a snow-only hour.
*/
(function () {
  'use strict';
  const MISS = -32768;
  const RA = 1, SN = 2, FZ = 4, PL = 8, TS = 16;
  const PRECIP = RA | SN | FZ | PL | TS;
  const LIM = 3;

  const es = c => 6.112 * Math.exp(17.62 * c / (243.12 + c));
  const cOf = f100 => (f100 / 100 - 32) / 1.8;

  function wxNear(wx, i, j, mask) {
    if (!wx) return false;
    const n = wx.length;
    for (let k = i - 1; k <= j + 1; k++) if (k >= 0 && k < n && wx[k] !== MISS && (wx[k] & mask)) return true;
    return false;
  }
  function nb(a, i, d) {
    for (let k = 1; k <= LIM; k++) {
      const j = i + d * k;
      if (j < 0 || j >= a.length) return null;
      if (a[j] !== MISS) return a[j];
    }
    return null;
  }
  // 1- and 2-hour runs of valid values with a valid neighbour on both sides: [i, j, p, q]
  function forBlocks(a, fn) {
    const n = a.length;
    for (let i = 0; i < n; i++) {
      if (a[i] === MISS) continue;
      const p = nb(a, i, -1);
      if (p === null) continue;
      for (let L = 1; L <= 2; L++) {
        const j = i + L - 1;
        if (j >= n || a[j] === MISS) break;
        const q = nb(a, j, 1);
        if (q === null) continue;
        fn(i, j, p, q);
      }
    }
  }
  // Single values with a valid neighbour within LIM hours on exactly one side
  function forOneSided(a, fn) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] === MISS) continue;
      const p = nb(a, i, -1), q = nb(a, i, 1);
      if ((p === null) !== (q === null)) fn(i, p === null ? q : p);
    }
  }
  function copyWithout(a, bad) {
    const c = Int32Array.from(a);
    for (const i of bad) c[i] = MISS;
    return c;
  }
  // Temperature-style spike: every value in the run on the same side of both neighbours by > T/2,
  // and the run's mean more than T from the neighbours' mean
  function tempSpikes(a, T, wx, bad) {
    forBlocks(a, (i, j, p, q) => {
      const s = Math.sign(a[i] - p);
      if (!s) return;
      let sum = 0;
      for (let k = i; k <= j; k++) {
        const d1 = a[k] - p, d2 = a[k] - q;
        if (Math.sign(d1) !== s || Math.sign(d2) !== s || Math.abs(d1) <= T / 2 || Math.abs(d2) <= T / 2) return;
        sum += a[k];
      }
      if (Math.abs(sum / (j - i + 1) - (p + q) / 2) > T && !wxNear(wx, i, j, TS)) for (let k = i; k <= j; k++) bad.add(k);
    });
  }

  function clean(P) {
    const t = P.tmpf, d = P.dwpf, w = P.wind, g = P.gust, pr = P.p01i, wx = P.wx || null;
    const bad = { tmpf: new Set(), dwpf: new Set(), wind: new Set(), gust: new Set(), p01i: new Set() };
    const n = (t || d || w || g || pr || []).length;

    // 1. Hard limits
    for (let i = 0; i < n; i++) {
      if (t && t[i] !== MISS && !(t[i] >= -8000 && t[i] <= 13500)) bad.tmpf.add(i);
      if (d && d[i] !== MISS && !(d[i] >= -9000 && d[i] <= 9000)) bad.dwpf.add(i);
      if (w && w[i] !== MISS && !(w[i] >= 0 && w[i] <= 100)) bad.wind.add(i);
      if (g && g[i] !== MISS && !(g[i] >= 0 && g[i] <= 160)) bad.gust.add(i);
      if (pr && pr[i] !== MISS && pr[i] > 800) bad.p01i.add(i);
    }

    // 2. Temperature spikes (two-sided, then one-sided)
    let tt = null;
    if (t) {
      tt = copyWithout(t, bad.tmpf);
      tempSpikes(tt, 1500, wx, bad.tmpf);
      forOneSided(tt, (i, o) => { if (Math.abs(tt[i] - o) > 3000 && !wxNear(wx, i, i, TS)) bad.tmpf.add(i); });
      for (const i of bad.tmpf) tt[i] = MISS;
    }

    // 2–3. Dewpoint spikes, then dewpoint against temperature
    if (d) {
      const dd = copyWithout(d, bad.dwpf);
      tempSpikes(dd, 1200, wx, bad.dwpf);
      forOneSided(dd, (i, o) => { if (Math.abs(dd[i] - o) > 2400 && !wxNear(wx, i, i, TS)) bad.dwpf.add(i); });
      for (const i of bad.dwpf) dd[i] = MISS;
      if (tt) for (let i = 0; i < n; i++) {
        if (dd[i] === MISS || tt[i] === MISS || bad.dwpf.has(i)) continue;
        if (dd[i] > tt[i] + 100) { bad.dwpf.add(i); continue; }
        if (es(cOf(dd[i])) / es(cOf(tt[i])) < 0.01) bad.dwpf.add(i);
      }
    }

    // 4. Wind spikes
    let ww = null;
    if (w) {
      ww = copyWithout(w, bad.wind);
      forBlocks(ww, (i, j, p, q) => {
        const m = Math.max(p, q);
        let lo = Infinity, hi = -Infinity;
        for (let k = i; k <= j; k++) { lo = Math.min(lo, ww[k]); hi = Math.max(hi, ww[k]); }
        if (lo >= 35 && lo - m > 30 && lo > 2.5 * Math.max(m, 1)) {
          if (wxNear(wx, i, j, PRECIP) && hi <= 75) return;
          for (let k = i; k <= j; k++) bad.wind.add(k);
        }
      });
      forOneSided(ww, (i, o) => {
        const x = ww[i];
        if (x >= 35 && x - o > 45 && x > 3 * Math.max(o, 1) && !(wxNear(wx, i, i, PRECIP) && x <= 75)) bad.wind.add(i);
      });
      for (const i of bad.wind) ww[i] = MISS;
    }

    // 5. Gusts against the sustained wind
    if (g) for (let i = 0; i < n; i++) {
      if (g[i] === MISS || bad.gust.has(i) || g[i] < 60) continue;
      let m = 0;
      if (ww) for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) if (ww[k] !== MISS) m = Math.max(m, ww[k]);
      if (g[i] > 4 * Math.max(m, 1)) {
        if (wxNear(wx, i, i, PRECIP) && g[i] <= 100) continue;
        bad.gust.add(i);
      }
    }

    // 6. Hourly precipitation against reported weather
    if (pr && wx) for (let i = 0; i < n; i++) {
      if (pr[i] === MISS || bad.p01i.has(i) || pr[i] < 100) continue;
      if (!wxNear(wx, i, i, PRECIP)) bad.p01i.add(i);
      else if (pr[i] > 150 && wxNear(wx, i, i, SN) && !wxNear(wx, i, i, RA | FZ | PL | TS)) bad.p01i.add(i);
    }

    const counts = {};
    for (const k in bad) {
      counts[k] = bad[k].size;
      const a = P[k];
      if (a) for (const i of bad[k]) a[i] = MISS;
    }
    // Feels-like is built from temperature, dewpoint and wind: drop it wherever an input failed
    if (P.feel) for (const k of ['tmpf', 'dwpf', 'wind']) for (const i of bad[k]) P.feel[i] = MISS;
    return counts;
  }

  // Same rules on plain-unit float arrays (NaN = missing). Converts, cleans, writes NaN back.
  const SCALE = { tmpf: 100, dwpf: 100, feel: 100, wind: 1, gust: 1, p01i: 100 };
  function cleanFloat(F) {
    const P = {};
    for (const k in SCALE) if (F[k]) {
      const a = F[k], s = SCALE[k], o = new Int32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        o[i] = (v == null || Number.isNaN(v)) ? MISS : (k === 'p01i' && v > 0 && v < 0.005) ? -1 : Math.round(v * s);
      }
      P[k] = o;
    }
    if (F.wx) {
      const a = F.wx, o = new Int32Array(a.length);
      for (let i = 0; i < a.length; i++) o[i] = (a[i] == null || Number.isNaN(a[i])) ? MISS : a[i];
      P.wx = o;
    }
    const counts = clean(P);
    for (const k in SCALE) if (F[k]) { const a = F[k], b = P[k]; for (let i = 0; i < a.length; i++) if (b[i] === MISS) a[i] = NaN; }
    return counts;
  }

  // METAR present-weather text (IEM `wxcodes`, or a whole METAR body) → bit flags, same
  // token rules as the archive: thunder = TS descriptor; rain/drizzle not freezing and not in
  // the vicinity; FZ + liquid = freezing rain; snow/grains; ice pellets; fog; smoke; haze.
  const WX_TOKEN = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|IP|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;
  function wxBits(text) {
    if (!text) return 0;
    let up = String(text).trim().toUpperCase();
    if (!up || up === 'M') return 0;
    const r = up.indexOf(' RMK'); if (r >= 0) up = up.slice(0, r);
    let b = 0;
    for (const t of up.split(/\s+/)) {
      if (t.length < 2) continue;
      const m = WX_TOKEN.exec(t); if (!m) continue;
      const pre = m[1] || '', desc = m[2] || '', codes = m[3] || '';
      if (!desc && !codes) continue;
      const has = c => { for (let k = 0; k < codes.length; k += 2) if (codes.substr(k, 2) === c) return true; return false; };
      const liquid = has('RA') || has('DZ');
      if (desc === 'TS') b |= TS;
      if (desc === 'FZ' && liquid) b |= FZ;
      if (desc !== 'FZ' && pre !== 'VC' && liquid) b |= RA;
      if (has('SN') || has('SG')) b |= SN;
      if (has('PL') || has('IP')) b |= PL;
      if (has('FG')) b |= 32;
      if (has('FU')) b |= 64;
      if (has('HZ')) b |= 128;
    }
    return b;
  }

  window.HourlyQC = { clean, cleanFloat, wxBits, MISS };
})();
