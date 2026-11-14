/* ════════════════════════════════════════════════════════════════════
   HourlyArchive — shared reader for the pre-built hourly ASOS archive
   (github.com/josht3113/contextclimate-hourly-data, served on Pages).

   One file per station per decade, years through `index.through`.
   Hours are local standard time (LST); clockYear() converts a year to
   local clock time (daylight saving included) for tools that show it.

   Hourly rules (built by scripts/build_hourly.py in that repo):
     state cells (tmpf dwpf feel vsby sky wind) cover (H-1):45–H:44, the
     routine ob wins and a special fills only a missing field;
     gust = highest gust or PK WND in the clock hour (0 = wind reported, no gust);
     p01i = routine ob's hourly precipitation (no group = 0, trace flagged);
     wx = weather-code bits of every ob in the clock hour
          (rain 1, snow 2, fzra 4, sleet 8, thunder 16, fog 32, smoke 64, haze 128).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const BASE = 'https://josht3113.github.io/contextclimate-hourly-data/';
  const HOUR = 3600000, MISSING = -32768;
  const KT_TO_MPH = 1.15078;
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const yearHours = y => (leap(y) ? 8784 : 8760);

  let indexP = null;
  const decadeP = new Map();     // "ICAO|decade" -> Promise<{fy, ny, planes}>

  async function retry(fn, tries) {
    let err;
    for (let k = 0; k < (tries || 4); k++) {
      if (k) await new Promise(r => setTimeout(r, 800 * 2 ** (k - 1)));
      try { return await fn(); } catch (e) { err = e; }
    }
    throw err;
  }
  function index() {
    if (!indexP) indexP = retry(async () => {
      const r = await fetch(BASE + 'index.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('archive index HTTP ' + r.status);
      return r.json();
    }).catch(e => { indexP = null; throw e; });
    return indexP;
  }
  async function gunzip(buf) {
    const b = new Uint8Array(buf);
    if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  function decode(buf, vars) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'CCHR' || u8[4] !== 2) throw new Error('archive format');
    const nv = u8[5], fy = dv.getUint16(6, true), ny = dv.getUint16(8, true);
    let n = 0; for (let k = 0; k < ny; k++) n += yearHours(fy + k);
    let pos = 10 + 2 * nv; const planes = {};
    for (let i = 0; i < nv; i++) {
      const vid = u8[10 + 2 * i], tr = u8[11 + 2 * i], a = new Int16Array(n);
      for (let h = 0; h < n; h++) a[h] = (u8[pos + h] | (u8[pos + n + h] << 8)) << 16 >> 16;
      pos += 2 * n;
      if (tr === 1) { let p = 0; for (let h = 0; h < n; h++) if (a[h] !== MISSING) { p += a[h]; a[h] = p; } }
      else if (tr === 2) { const t = planes.tmpf; for (let h = 0; h < n; h++) if (a[h] !== MISSING) a[h] += t[h]; }
      planes[vars[vid]] = a;
    }
    return { fy, ny, planes };
  }
  function decade(id, D) {
    const key = id + '|' + D;
    if (!decadeP.has(key)) decadeP.set(key, (async () => {
      const idx = await index();
      const buf = await retry(async () => {
        const r = await fetch(`${BASE}hourly/${id}/${D}.bin.gz`);
        if (!r.ok) throw new Error('archive HTTP ' + r.status);
        return r.arrayBuffer();
      });
      return decode(await gunzip(buf), idx.vars);
    })().catch(e => { decadeP.delete(key); throw e; }));
    return decadeP.get(key);
  }

  // Station info, or null when the archive has no record for it.
  async function station(id) { const idx = await index(); return idx.stations[id] || null; }
  // True when `year` comes from the archive (complete and on file) for this station.
  async function covers(id, year) {
    const idx = await index(), s = idx.stations[id];
    return !!s && year <= idx.through && year >= s.first && year <= s.last;
  }
  async function through() { return (await index()).through; }

  // Raw LST planes for one year: { n, planes: {var: Int16Array} } or null.
  async function lstYear(id, year) {
    const idx = await index(), s = idx.stations[id];
    if (!s || year > idx.through || year < s.first || year > s.last) return null;
    const D = Math.floor(year / 10) * 10;
    if (!s.decades.includes(D)) return null;
    const dec = await decade(id, D);
    if (year < dec.fy || year >= dec.fy + dec.ny) return null;
    let off = 0; for (let y = dec.fy; y < year; y++) off += yearHours(y);
    const n = yearHours(year), planes = {};
    for (const v in dec.planes) planes[v] = dec.planes[v].subarray(off, off + n);
    return { n, planes, scale: idx.scale };
  }

  // ── Time zones ──
  const fmtCache = new Map(), offCache = new Map();
  function offsetMin(iana, utcMs) {
    let f = fmtCache.get(iana);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      fmtCache.set(iana, f);
    }
    const p = {}; for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - utcMs) / 60000);
  }
  // Standard offset: the smallest offset seen across the year (same rule as the builder).
  function stdOffsetMin(iana, year) {
    const k = iana + '|' + year;
    if (!offCache.has(k)) {
      let m = Infinity;
      try { for (let mo = 0; mo < 12; mo++) m = Math.min(m, offsetMin(iana, Date.UTC(year, mo, 15, 12))); } catch (e) { m = -300; }
      offCache.set(k, m);
    }
    return offCache.get(k);
  }
  // Clock-minus-standard minutes for each LST hour of the year (0 outside daylight saving).
  function dstShift(iana, year, n) {
    const std = stdOffsetMin(iana, year), t0 = Date.UTC(year, 0, 1) - std * 60000;
    const out = new Int16Array(n);
    const days = n / 24;
    let prev = offsetMin(iana, t0) - std;
    for (let d = 0; d < days; d++) {
      const next = offsetMin(iana, t0 + (d + 1) * 24 * HOUR) - std;
      if (next === prev) { for (let h = 0; h < 24; h++) out[d * 24 + h] = prev; }
      else for (let h = 0; h < 24; h++) out[d * 24 + h] = offsetMin(iana, t0 + (d * 24 + h) * HOUR) - std;
      prev = next;
    }
    return out;
  }

  /* One calendar year in local clock time, in natural units:
       { n, tmpf, dwpf, feel, vsby, sky, wind, gust, p01i, wx, gustBefore }
     Float32Arrays of n = days × 24, index = clock hour since Jan 1 00:00 local;
     NaN = missing. sky = 0..4 (CLR/FEW/SCT/BKN/OVC-or-VV). wind and gust are
     mph with full precision (the archive's whole-mph values map back to whole
     knots exactly). gust 0 = wind reported, no gust. p01i: inches, trace = 0.001.
     When daylight saving ends, the second of the two repeated clock hours wins;
     the clock hour skipped in spring stays missing.
     gustBefore = the gust value of the clock hour before Jan 1 00:00. */
  async function clockYear(id, iana, year) {
    const L = await lstYear(id, year);
    if (!L) return null;
    const n = L.n, shift = dstShift(iana, year, n), P = L.planes, S = L.scale;
    const out = { n };
    for (const v of ['tmpf', 'dwpf', 'feel', 'vsby', 'sky', 'wind', 'gust', 'p01i', 'wx']) out[v] = new Float32Array(n).fill(NaN);
    const conv = {
      tmpf: x => x / S.tmpf, dwpf: x => x / S.dwpf, feel: x => x / S.feel, vsby: x => x / S.vsby,
      sky: x => [0, 3, 7, 13, 16].indexOf(x),
      wind: x => Math.round(x / KT_TO_MPH) * KT_TO_MPH, gust: x => x === 0 ? 0 : Math.round(x / KT_TO_MPH) * KT_TO_MPH,
      p01i: x => x === -1 ? 0.001 : x / S.p01i, wx: x => x
    };
    for (let k = 0; k < n; k++) {
      const i = k + shift[k] / 60;
      if (i < 0 || i >= n) continue;
      for (const v in conv) {
        const p = P[v]; if (!p) continue;
        const x = p[k];
        out[v][i] = x === MISSING ? NaN : conv[v](x);
      }
    }
    out.gustBefore = NaN;
    try {
      const prev = await lstYear(id, year - 1);
      if (prev && prev.planes.gust) { const x = prev.planes.gust[prev.n - 1]; out.gustBefore = x === MISSING ? NaN : conv.gust(x); }
    } catch (e) {}
    return out;
  }

  window.HourlyArchive = { index, station, covers, through, lstYear, clockYear, stdOffsetMin, offsetMin, BASE };
})();
