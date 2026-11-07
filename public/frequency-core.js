/* ════════════════════════════════════════════════════════════════════
   CONTEXTCLIMATE — FREQUENCY TOOL ENGINE
   Shared by dewpoint-frequency.html and temp-frequency.html. Each page
   sets window.FREQ_CONFIG (title, colour ramp, zones, data elements and
   their thresholds) and loads core-sample-tools.css, frequency-core.css,
   Chart.js, station-roster.js and then this file.

   Data paths
     · IEM ASOS hourly (routine METARs, report_type=3) — one streamed
       request for the whole record; IEM rate-limits per IP (~1 req / 5 s).
     · NOAA ACIS daily max/min — by ICAO id, period of record.
   Every view is a set of calendar days (365-day calendar, Feb 29 folded
   into Feb 28). A (year, month) counts only once it has ended and holds
   enough of its hours/days; a year counts for a view only if every month
   the view touches is complete.
   ════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const CFG = window.FREQ_CONFIG;
const $ = id => document.getElementById(id);

// ═══════════════════════════════════════════════
//  Stations — shared roster (station-roster.js)
// ═══════════════════════════════════════════════
const STATIONS = Object.fromEntries(STATION_ROSTER.map(([id, name, st, lat, lon]) =>
  [id, { id, name, st, lat, lon, label: `${name}, ${st}` }]));
const DEFAULT_ID = 'KISP';

// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════
const BIN       = 2;            // °F bin width
const T10_MIN   = -800;         // value range in tenths of °F
const T10_MAX   = 1250;
const NFINE     = T10_MAX - T10_MIN + 1;
const MIN_YEARS = 25;           // complete years a 30-yr period needs
const FIRST_FETCH_YEAR = 1940;
const RATE_GAP_MS = 6000;       // IEM per-IP limiter: ~1 request per 5 s
const EXPORT_SCALE = 3;
const Y_AXIS_W = 66;            // shared y-axis width so the two charts line up

const NORMALS = [[1951, 1980], [1961, 1990], [1971, 2000], [1981, 2010], [1991, 2020]];
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SEASONS = [
  { key: 'djf', label: 'Winter', long: 'Winter (Dec–Feb)', months: [12, 1, 2] },
  { key: 'mam', label: 'Spring', long: 'Spring (Mar–May)', months: [3, 4, 5] },
  { key: 'jja', label: 'Summer', long: 'Summer (Jun–Aug)', months: [6, 7, 8] },
  { key: 'son', label: 'Fall',   long: 'Fall (Sep–Nov)',   months: [9, 10, 11] },
];

const ELEMS = CFG.elems;
const ELEM_KEYS = Object.keys(ELEMS);
const ZONES = CFG.zones;
const ZONE_BOUNDS = ZONES.slice(1).map(z => z.lo);
const STOPS = CFG.ramp;

// Chart literals (Chart.js and canvas cannot resolve CSS vars)
const C = {
  surface: '#262B27', bg: '#1E2320', text: '#E8E4D9', text2: '#A6A499', muted: '#948F82',
  border: 'rgba(232,228,217,0.14)', grid: 'rgba(232,228,217,0.06)', dim: 'rgba(38,43,39,0.70)',
  accent: '#D08425', a: '#4A90D9', aLite: '#8DBCEB', aFill: 'rgba(74,144,217,0.55)',
  b: '#E07A3A', bLite: '#F5B080', obs: '#3AAFA9',
};
const MONO = '"Courier Prime", monospace';

// ═══════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════
const cache = {};                 // cache key → dataset
let ds = null;                    // active dataset
let currentStation = null;
let loadSeq = 0;
let loadAbort = null;
let chart = null, diffChart = null;
let model = null;                 // last rendered model (tooltips, export)
let periods = [];
let obs = null;                   // { sid, elem, kind, v, time }
let rafPending = false;
let lastRequestAt = 0;
let waitTimer = null;
let ridgeHover = null;            // { m, x, px, py } in CSS px

const ui = {
  elem: CFG.defaultElem || ELEM_KEYS[0],
  view: 'dist',                   // 'dist' | 'months'
  mode: 'single',
  toy: 'all',
  season: 'jja',
  month: new Date().getMonth() + 1,
  center: 0,
  half: null,
  singleKey: 'n1991',
  sliderActive: false,
  aKey: null,
  bKey: null,
  kde: false,
  hl: null,                       // hovered range { lo, hi, label, key }
  pin: null,                      // tapped/clicked range, same shape
};
const elemCfg = () => ELEMS[ui.elem];
const defaultHalf = () => (elemCfg().unit === 'hours' ? 7 : 15);
const activeHL = () => ui.hl || ui.pin;

// ═══════════════════════════════════════════════
//  Colour helpers
// ═══════════════════════════════════════════════
function rampRGB(v) {
  if (v <= STOPS[0].t) return STOPS[0].c;
  const last = STOPS[STOPS.length - 1];
  if (v >= last.t) return last.c;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const s0 = STOPS[i], s1 = STOPS[i + 1];
    if (v <= s1.t) {
      const f = (v - s0.t) / (s1.t - s0.t);
      return s0.c.map((x, k) => Math.round(x + f * (s1.c[k] - x)));
    }
  }
  return last.c;
}
function rampColor(v, alpha = 0.9) { const c = rampRGB(v); return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`; }
function zoneFor(t) { return ZONES.find(z => t >= z.lo && t < z.hi) || ZONES[ZONES.length - 1]; }
function zoneMid(z) { return z.lo < -100 ? CFG.zoneMidLo : z.hi > 900 ? CFG.zoneMidHi : (z.lo + z.hi) / 2; }
function rampGradient(ctx, x0, x1, vmin, vmax, alpha = 1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const span = vmax - vmin;
  g.addColorStop(0, rampColor(vmin, alpha));
  STOPS.forEach(s => { const f = (s.t - vmin) / span; if (f > 0 && f < 1) g.addColorStop(f, rampColor(s.t, alpha)); });
  g.addColorStop(1, rampColor(vmax, alpha));
  return g;
}

// ═══════════════════════════════════════════════
//  Formatting
// ═══════════════════════════════════════════════
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const fInt = v => Math.round(v).toLocaleString();
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function signed(v, digits = 1) {
  const r = digits ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v));
  const z = Number(r) === 0;
  return (z ? '±' : v > 0 ? '+' : '−') + r.replace('-', '');
}
function fmtPerYear(v) { return v >= 10 ? fInt(v) : v.toFixed(1); }
function dPerYear(d) { return Math.abs(d) >= 10 ? signed(d, 0) : signed(d, 1); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ═══════════════════════════════════════════════
//  Fetch — IEM ASOS hourly, routine METARs only (report_type=3)
// ═══════════════════════════════════════════════
const IEM_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py';

function iemURL(sid, v, y1, y2) {
  return `${IEM_URL}?station=${encodeURIComponent(sid)}&data=${v}&tz=Etc%2FUTC&format=onlycomma` +
    `&latlon=no&elev=no&missing=M&trace=T&direct=no&report_type=3` +
    `&year1=${y1}&month1=1&day1=1&year2=${y2 + 1}&month2=1&day2=1`;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function isTransient(err) {
  if (!err) return false;
  if (err.status) return err.status >= 500 || [408, 425, 429].includes(err.status);
  return err.name === 'TypeError';
}

// One attempt: stream the body, parsing complete lines as they arrive.
async function fetchOnce(url, signal, onRecv) {
  const res = await fetch(url, { signal });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  const raw = { yr: [], mo: [], doy: [], t10: [] };
  if (!res.body || !res.body.getReader) { parseCSV(await res.text(), raw); return raw; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let rest = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    const txt = rest + dec.decode(value, { stream: true });
    const cut = txt.lastIndexOf('\n');
    if (cut < 0) { rest = txt; continue; }
    parseCSV(txt.slice(0, cut + 1), raw);
    rest = txt.slice(cut + 1);
    onRecv(raw.yr.length ? raw.yr[raw.yr.length - 1] : null, bytes, raw.yr.length ? raw.yr[0] : null);
  }
  rest += dec.decode();
  if (rest) parseCSV(rest, raw);
  return raw;
}

// Retries: every wait respects the ~5 s limiter window; 429 gets one extra, longer try.
async function withRetry(attempt, signal, onStatus) {
  const WAIT_429 = [6000, 12000, 20000], WAIT_5XX = [6000, 12000];
  let n429 = 0, n5xx = 0;
  for (;;) {
    try {
      return await attempt();
    } catch (e) {
      if (e.name === 'AbortError' || !isTransient(e)) throw e;
      const wait = e.status === 429 ? WAIT_429[n429++] : WAIT_5XX[n5xx++];
      if (wait == null) throw e;
      onStatus({ phase: 'retry', wait, why: e.message || 'network error' });
      await sleep(wait, signal);
      onStatus({ phase: 'wait' });
    }
  }
}

// Returns { parts, failed } — never throws except on abort. A range refused
// with 5xx (load-shedding) is split once; a 429 is never split.
async function fetchRange(sid, v, y1, y2, signal, onStatus, depth = 0) {
  try {
    const raw = await withRetry(() => fetchOnce(iemURL(sid, v, y1, y2), signal,
      (year, bytes, first) => onStatus({ phase: 'recv', year, bytes, first })), signal, onStatus);
    return { parts: [raw], failed: [] };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    if (y2 > y1 && depth < 1 && isTransient(e) && e.status !== 429) {
      const mid = Math.floor((y1 + y2) / 2);
      await sleep(RATE_GAP_MS, signal);
      const a = await fetchRange(sid, v, y1, mid, signal, onStatus, depth + 1);
      await sleep(RATE_GAP_MS, signal);
      const b = await fetchRange(sid, v, mid + 1, y2, signal, onStatus, depth + 1);
      return { parts: a.parts.concat(b.parts), failed: a.failed.concat(b.failed) };
    }
    return { parts: [], failed: [{ y1, y2, msg: e.message || 'network error' }] };
  }
}

async function fetchRanges(sid, v, ranges, signal, onStatus) {
  const out = { parts: [], failed: [] };
  for (let i = 0; i < ranges.length; i++) {
    if (i) await sleep(RATE_GAP_MS, signal);
    const r = await fetchRange(sid, v, ranges[i].y1, ranges[i].y2, signal, onStatus);
    out.parts.push(...r.parts);
    out.failed.push(...r.failed);
  }
  return out;
}

function mergeParts(parts, into = { yr: [], mo: [], doy: [], t10: [] }) {
  parts.forEach(p => { for (let i = 0; i < p.yr.length; i++) { into.yr.push(p.yr[i]); into.mo.push(p.mo[i]); into.doy.push(p.doy[i]); into.t10.push(p.t10[i]); } });
  return into;
}

// ═══════════════════════════════════════════════
//  Fetch — NOAA ACIS daily max/min (period of record, by ICAO id)
// ═══════════════════════════════════════════════
const ACIS_URL = 'https://data.rcc-acis.org/StnData';

async function fetchACISOne(sid, elem, signal) {
  const res = await fetch(ACIS_URL, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid, sdate: 'por', edate: 'por', elems: [{ name: elem }], meta: 'name,state,valid_daterange' }),
  });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  const json = await res.json();
  if (!json.data || !json.data.length) throw new Error(json.error || 'No data');
  return json;
}

function parseACIS(rows) {
  const raw = { yr: [], mo: [], doy: [], t10: [] };
  for (const [d, v] of rows) {
    if (!v || v === 'M' || v === 'T' || v === 'S') continue;
    const x = parseFloat(v);
    if (isNaN(x)) continue;
    const t10 = Math.round(x * 10);
    if (t10 < T10_MIN || t10 > T10_MAX) continue;
    const mo = parseInt(d.slice(5, 7), 10);
    raw.yr.push(parseInt(d.slice(0, 4), 10)); raw.mo.push(mo); raw.doy.push(doyOf(mo, parseInt(d.slice(8, 10), 10))); raw.t10.push(t10);
  }
  return raw;
}

async function fetchACIS(station, elem, signal, onStatus) {
  const json = await withRetry(() => fetchACISOne(station.id, elem, signal), signal, onStatus);
  const m = json.meta || {};
  return { raw: parseACIS(json.data), name: m.name ? `${m.name}${m.state ? ', ' + m.state : ''}` : '' };
}

// ═══════════════════════════════════════════════
//  Browser cache (IndexedDB). Only complete years are ever charted, and
//  those cannot change until the calendar year rolls over, so a cached
//  record is reused within the same year (and at most CACHE_DAYS old).
// ═══════════════════════════════════════════════
const IDB_STORE = 'stations', CACHE_DAYS = 30, CACHE_VERSION = 2;
const cacheKey = (id, elem) => (ELEM_KEYS.length === 1 ? id : `${id}__${elem}`);

function idbOpen() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(CFG.idbName, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function cacheGet(key) {
  const db = await idbOpen();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        const fresh = v && v.v === CACHE_VERSION && v.year === new Date().getUTCFullYear() && Date.now() - v.savedAt < CACHE_DAYS * 864e5;
        resolve(fresh ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function cachePut(d) {
  const db = await idbOpen();
  if (!db) return;
  try {
    db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE)
      .put({ v: CACHE_VERSION, year: new Date().getUTCFullYear(), savedAt: Date.now(), yr: d.yr, mo: d.mo, doy: d.doy, t10: d.t10, name: d.name || '' }, d.key);
  } catch (e) { /* storage unavailable — fine */ }
}

// ═══════════════════════════════════════════════
//  Parse + dataset build
// ═══════════════════════════════════════════════
function parseCSV(text, raw) {
  const L = text.length;
  let pos = 0;                                  // header line fails the checks below
  while (pos < L) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = L;
    const c1 = text.indexOf(',', pos);
    if (c1 > 0 && c1 < nl) {
      const c2 = text.indexOf(',', c1 + 1);
      if (c2 > 0 && c2 < nl) {
        const vs = text.substring(c2 + 1, nl).trim();
        if (vs && vs !== 'M') {
          const v = parseFloat(vs);
          if (!isNaN(v)) {
            const t10 = Math.round(v * 10);
            const yr = parseInt(text.substr(c1 + 1, 4), 10);
            const mo = parseInt(text.substr(c1 + 6, 2), 10);
            const dy = parseInt(text.substr(c1 + 9, 2), 10);
            if (t10 >= T10_MIN && t10 <= T10_MAX && yr > 1900 && mo >= 1 && mo <= 12 && dy >= 1) {
              raw.yr.push(yr); raw.mo.push(mo); raw.doy.push(doyOf(mo, dy)); raw.t10.push(t10);
            }
          }
        }
      }
    }
    pos = nl + 1;
  }
}

function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

function finishDataset(d, cov, perDay) {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < d.n; i++) { const y = d.yr[i]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const nY = y1 - y0 + 1;
  const mc = new Uint32Array(nY * 12);
  for (let i = 0; i < d.n; i++) mc[(d.yr[i] - y0) * 12 + d.mo[i] - 1]++;
  const monthOK = new Uint8Array(nY * 12);
  const now = Date.now();
  for (let k = 0; k < nY; k++) for (let m = 1; m <= 12; m++) {
    const ended = Date.UTC(y0 + k, m, 1) <= now;
    monthOK[k * 12 + m - 1] = ended && mc[k * 12 + m - 1] >= cov * daysInMonth(y0 + k, m) * perDay ? 1 : 0;
  }
  return Object.assign(d, { y0, y1, nY, monthOK, sel: {}, xr: {} });
}

function buildDataset(key, elem, raw, failed, name = '') {
  const n = raw.yr.length;
  const cfg = ELEMS[elem];
  const d = { key, elem, name, n, raw, failed, yr: Int16Array.from(raw.yr), mo: Uint8Array.from(raw.mo), doy: Uint16Array.from(raw.doy), t10: Int16Array.from(raw.t10) };
  if (!n) return d;
  return finishDataset(d, cfg.cov, cfg.unit === 'hours' ? 24 : 1);
}

// ═══════════════════════════════════════════════
//  Time of year
// ═══════════════════════════════════════════════
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function doyOf(mo, day) { return MONTH_START[mo - 1] + Math.min(day, mo === 2 ? 28 : 31) - 1; }
function doyToMD(d) { d = ((d % 365) + 365) % 365; let m = 11; while (MONTH_START[m] > d) m--; return [m + 1, d - MONTH_START[m] + 1]; }
function fmtDoy(d) { const [m, dd] = doyToMD(d); return `${MONTHS[m - 1]} ${dd}`; }
function todayDoy() { const t = new Date(); return doyOf(t.getMonth() + 1, t.getDate()); }

const selCache = new Map();
function makeSel(k) {
  if (selCache.has(k)) return selCache.get(k);
  const days = new Uint8Array(365);
  let label, slug;
  const [kind, a, b] = k.split(':');
  if (kind === 'all') { days.fill(1); label = 'All year'; slug = 'all'; }
  else if (kind === 'season') {
    const se = SEASONS.find(x => x.key === a);
    se.months.forEach(m => days.fill(1, MONTH_START[m - 1], m === 12 ? 365 : MONTH_START[m]));
    label = se.long; slug = a;
  } else if (kind === 'month') {
    const m = +a;
    days.fill(1, MONTH_START[m - 1], m === 12 ? 365 : MONTH_START[m]);
    label = MONTHS_FULL[m - 1]; slug = MONTHS[m - 1].toLowerCase();
  } else {
    const c = +a, h = +b;
    for (let d = c - h; d <= c + h; d++) days[((d % 365) + 365) % 365] = 1;
    label = `${fmtDoy(c - h)} – ${fmtDoy(c + h)}`;
    slug = `${fmtDoy(c - h)}_${fmtDoy(c + h)}`.replace(/ /g, '').toLowerCase();
  }
  const months = [];
  for (let m = 1; m <= 12; m++) { let hit = false; for (let d = MONTH_START[m - 1]; d < (m === 12 ? 365 : MONTH_START[m]); d++) if (days[d]) { hit = true; break; } if (hit) months.push(m); }
  const sel = { key: k, days, months, label, slug };
  selCache.set(k, sel);
  return sel;
}
function windowHalf() { return ui.half ?? defaultHalf(); }
// The By Month view always works from the whole year; each ridge then uses
// its own month's complete years.
function curSel() {
  if (ui.view === 'months') return makeSel('all');
  switch (ui.toy) {
    case 'season': return makeSel(`season:${ui.season}`);
    case 'month':  return makeSel(`month:${ui.month}`);
    case 'window': return makeSel(`window:${ui.center}:${windowHalf()}`);
    default:       return makeSel('all');
  }
}
function selInfo(sel) {
  if (ds.sel[sel.key]) return ds.sel[sel.key];
  const yearOK = new Uint8Array(ds.nY), years = [];
  for (let k = 0; k < ds.nY; k++) {
    if (sel.months.every(m => ds.monthOK[k * 12 + m - 1])) { yearOK[k] = 1; years.push(ds.y0 + k); }
  }
  return (ds.sel[sel.key] = { yearOK, years, first: years[0] ?? null, last: years[years.length - 1] ?? null });
}
const SI = () => selInfo(curSel());

function usableYearsIn(s, e, sel = curSel()) {
  if (!ds || !ds.nY) return 0;
  let c = 0;
  for (const y of selInfo(sel).years) if (y >= s && y <= e) c++;
  return c;
}

// ═══════════════════════════════════════════════
//  Aggregation — one pass over typed arrays (~ms)
// ═══════════════════════════════════════════════
function aggregate(s, e, sel = curSel()) {
  const counts = new Uint32Array(NFINE);
  let n = 0, sum = 0, sumsq = 0;
  const { yr, doy, t10, y0 } = ds;
  const ok = selInfo(sel).yearOK, days = sel.days;
  for (let i = 0, N = ds.n; i < N; i++) {
    const y = yr[i];
    if (y < s || y > e || !ok[y - y0] || !days[doy[i]]) continue;
    const t = t10[i];
    counts[t - T10_MIN]++;
    n++; sum += t; sumsq += t * t;
  }
  return { counts, n, sum, sumsq, years: usableYearsIn(s, e, sel) };
}

// All twelve months in one pass; each month uses its own complete years.
function aggregateMonths(s, e) {
  const ok = [], out = [];
  for (let m = 1; m <= 12; m++) {
    const sel = makeSel(`month:${m}`);
    ok.push(selInfo(sel).yearOK);
    out.push({ counts: new Uint32Array(NFINE), n: 0, sum: 0, sumsq: 0, years: usableYearsIn(s, e, sel) });
  }
  const { yr, mo, t10, y0 } = ds;
  for (let i = 0, N = ds.n; i < N; i++) {
    const y = yr[i];
    if (y < s || y > e) continue;
    const m = mo[i] - 1;
    if (!ok[m][y - y0]) continue;
    const a = out[m], t = t10[i];
    a.counts[t - T10_MIN]++;
    a.n++; a.sum += t; a.sumsq += t * t;
  }
  return out;
}

function quantile(agg, p) {
  const target = p * agg.n;
  let cum = 0;
  for (let f = 0; f < NFINE; f++) {
    cum += agg.counts[f];
    if (cum >= target && cum > 0) return (f + T10_MIN) / 10;
  }
  return NaN;
}

function countWhere(agg, test10) {
  let c = 0;
  for (let f = 0; f < NFINE; f++) if (agg.counts[f] && test10(f + T10_MIN)) c += agg.counts[f];
  return c;
}

function stats(agg) {
  if (!agg || !agg.n) return null;
  const mean10 = agg.sum / agg.n;
  const sigma = Math.sqrt(Math.max(0, agg.sumsq / agg.n - mean10 * mean10)) / 10;
  const out = {
    n: agg.n, years: agg.years, mean: mean10 / 10, sigma,
    median: quantile(agg, 0.5), p10: quantile(agg, 0.1), p25: quantile(agg, 0.25),
    p75: quantile(agg, 0.75), p90: quantile(agg, 0.9), th: {}, zones: [],
  };
  elemCfg().thresholds.forEach(t => {
    const c = countWhere(agg, t.test10);
    out.th[t.key] = { count: c, perYear: agg.years ? c / agg.years : 0, pct: c / agg.n * 100 };
  });
  ZONES.forEach(z => {
    const c = countWhere(agg, t => t >= z.lo * 10 && t < z.hi * 10);
    out.zones.push({ count: c, perYear: agg.years ? c / agg.years : 0, pct: c / agg.n * 100 });
  });
  return out;
}

// Cumulative counts: cum[f] = observations below fine index f.
function cumFor(agg) {
  const cum = new Float64Array(NFINE + 1);
  for (let f = 0; f < NFINE; f++) cum[f + 1] = cum[f] + agg.counts[f];
  return cum;
}
function shareBelow(S, v) {
  const f = Math.max(0, Math.min(NFINE, Math.round(v * 10) - T10_MIN));
  return S.agg.n ? S.cum[f] / S.agg.n * 100 : 0;
}

// Reporting precision, in tenths °F, by value. Hourly records mix whole-°F
// readings with whole-°C readings converted to °F (a 1.8°F lattice); ACIS
// daily values are whole °F. Each reading is spread uniformly over the
// interval it stands for before binning, which removes lattice aliasing.
const HALF_WIDTH10 = (() => {
  const hw = new Uint8Array(NFINE);
  for (let f = 0; f < NFINE; f++) {
    const t = f + T10_MIN;
    const c = Math.round((t / 10 - 32) / 1.8);
    hw[f] = (t % 10 !== 0 && Math.round((c * 1.8 + 32) * 10) === t) ? 9 : 5;
  }
  return hw;
})();

function smearInto(agg, xmin, step, nb) {
  const W = step * 10, base = xmin * 10;
  const cnt = new Float64Array(nb);
  for (let f = 0; f < NFINE; f++) {
    const c = agg.counts[f];
    if (!c) continue;
    const t = f + T10_MIN, hw = HALF_WIDTH10[f], lo = t - hw, hi = t + hw;
    const b0 = Math.max(0, Math.floor((lo - base) / W)), b1 = Math.min(nb - 1, Math.floor((hi - base) / W));
    for (let b = b0; b <= b1; b++) {
      const ov = Math.min(hi, base + (b + 1) * W) - Math.max(lo, base + b * W);
      if (ov > 0) cnt[b] += c * ov / (2 * hw);
    }
  }
  return cnt;
}

function binsFor(agg, xmin, xmax) {
  const nb = Math.round((xmax - xmin) / BIN);
  const cnt = smearInto(agg, xmin, BIN, nb);
  const bins = [];
  for (let b = 0; b < nb; b++) {
    const lo = xmin + b * BIN;
    bins.push({ lo, hi: lo + BIN, x: lo + BIN / 2, count: cnt[b], pct: agg.n ? cnt[b] / agg.n * 100 : 0 });
  }
  return bins;
}

const kdeBandwidth = (st, n) => Math.max(1.06 * st.sigma * Math.pow(n, -0.2), 2.0);

// KDE on the fine (0.1°F) counts, evaluated at bin centres, scaled to % per bin.
// Bandwidth floor of 2°F: hourly values sit on a 1°F / 1.8°F reporting lattice.
function kdeFor(agg, st, bins) {
  const h = kdeBandwidth(st, agg.n);
  const pts = [];
  for (let f = 0; f < NFINE; f++) if (agg.counts[f]) pts.push([(f + T10_MIN) / 10, agg.counts[f]]);
  const norm = 1 / (agg.n * h * Math.sqrt(2 * Math.PI));
  return bins.map(b => {
    let s = 0;
    for (const [v, c] of pts) { const z = (b.x - v) / h; if (z > -6 && z < 6) s += c * Math.exp(-0.5 * z * z); }
    return { x: b.x, y: s * norm * BIN * 100 };
  });
}

// Smooth density on a 0.5°F grid for the ridgelines: smeared histogram,
// then a Gaussian of the same bandwidth as the KDE. Fraction per °F.
const DGRID = 0.5;
function densityFor(agg, st, xmin, xmax) {
  const nb = Math.round((xmax - xmin) / DGRID);
  const xs = new Float64Array(nb), ys = new Float64Array(nb);
  for (let i = 0; i < nb; i++) xs[i] = xmin + (i + 0.5) * DGRID;
  if (!agg.n) return { xs, ys };
  const cnt = smearInto(agg, xmin, DGRID, nb);
  const h = kdeBandwidth(st, agg.n) / DGRID, r = Math.ceil(4 * h);
  const ker = new Float64Array(2 * r + 1);
  let ks = 0;
  for (let k = -r; k <= r; k++) { ker[k + r] = Math.exp(-0.5 * (k / h) ** 2); ks += ker[k + r]; }
  for (let i = 0; i < nb; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < nb) s += cnt[j] * ker[k + r]; }
    ys[i] = s / ks / agg.n / DGRID;
  }
  return { xs, ys };
}
function densityAt(d, v) {
  const i = (v - d.xs[0]) / DGRID;
  if (i <= 0) return d.ys[0] || 0;
  if (i >= d.xs.length - 1) return d.ys[d.xs.length - 1] || 0;
  const i0 = Math.floor(i), f = i - i0;
  return d.ys[i0] * (1 - f) + d.ys[i0 + 1] * f;
}

function percentRank(agg, v) {
  if (!agg || !agg.n) return null;
  const t = Math.round(v * 10) - T10_MIN;
  let below = 0;
  for (let f = 0; f < Math.min(t, NFINE); f++) below += agg.counts[f];
  const eq = t >= 0 && t < NFINE ? agg.counts[t] : 0;
  return Math.max(0, Math.min(100, (below + 0.5 * eq) / agg.n * 100));
}

// x range per view; a date window uses a wider, rounded window so the axis
// stays put while the window slides.
function xRange(sel) {
  let base = sel;
  if (sel.key.startsWith('window:')) base = makeSel(`window:${Math.round(+sel.key.split(':')[1] / 15) * 15 % 365}:45`);
  if (ds.xr[base.key]) return ds.xr[base.key];
  const agg = aggregate(-9999, 9999, base);
  let lo = 0, hi = 80;
  if (agg.n) {
    let f0 = 0, f1x = NFINE - 1;
    while (f0 < NFINE && !agg.counts[f0]) f0++;
    while (f1x > 0 && !agg.counts[f1x]) f1x--;
    lo = (f0 + T10_MIN) / 10; hi = (f1x + T10_MIN) / 10;
  }
  const r = { min: Math.floor((lo - 1) / 10) * 10, max: Math.ceil((hi + 2) / 10) * 10 };
  ds.xr[base.key] = r;
  return r;
}

// ═══════════════════════════════════════════════
//  Periods
// ═══════════════════════════════════════════════
function buildPeriods() {
  const list = [];
  const si = SI();
  if (si.first == null) return list;
  list.push({ key: 'full', label: 'Full Record', s: si.first, e: si.last });
  NORMALS.forEach(([s, e]) => list.push({ key: 'n' + s, label: `${s}–${e}`, s, e }));
  const L = si.last;
  if (L !== 2020 && L - 29 >= si.first) list.push({ key: 'latest', label: `${L - 29}–${L}`, s: L - 29, e: L });
  list.forEach(p => {
    p.years = usableYearsIn(p.s, p.e);
    p.available = p.key === 'full' ? p.years > 0 : p.years >= MIN_YEARS;
  });
  return list;
}
const periodByKey = k => periods.find(p => p.key === k);

function sliderPeriod() {
  const c = parseInt($('period-slider').value, 10);
  const s = c - 15, e = c + 14;
  return { key: 'slider', label: `${s}–${e}`, s, e, years: usableYearsIn(s, e) };
}
function activeSingle() { return ui.sliderActive ? sliderPeriod() : periodByKey(ui.singleKey); }

function validateSelections() {
  const avail = periods.filter(p => p.available);
  if (!avail.length) return;
  const ok = k => { const p = periodByKey(k); return p && p.available; };
  if (!ok(ui.singleKey)) ui.singleKey = ok('n1991') ? 'n1991' : ok('latest') ? 'latest' : 'full';
  const fixed = avail.filter(p => p.key !== 'full');
  if (!ok(ui.bKey) || ui.bKey === 'full') ui.bKey = ok('latest') ? 'latest' : ok('n1991') ? 'n1991' : (fixed[fixed.length - 1] || avail[0]).key;
  if (!ok(ui.aKey) || ui.aKey === 'full' || ui.aKey === ui.bKey) {
    const cand = fixed.find(p => p.key !== ui.bKey);
    ui.aKey = cand ? cand.key : ui.bKey;
  }
}

// ═══════════════════════════════════════════════
//  Controls
// ═══════════════════════════════════════════════
function periodTitle(p) {
  return p.key === 'full' ? `${p.s}–${p.e} · ${p.years} complete yrs` : `${p.years} of 30 yrs complete`;
}
function chipBtn(text, active, onclick, title, cls = 'is-active') {
  const b = document.createElement('button');
  b.className = 'cc-btn' + (active ? ' ' + cls : '');
  b.textContent = text;
  if (title) b.title = title;
  b.onclick = onclick;
  return b;
}

function buildPeriodButtons() {
  const single = $('single-period-btns');
  single.innerHTML = '';
  periods.filter(p => p.available).forEach(p => single.appendChild(chipBtn(p.label, !ui.sliderActive && p.key === ui.singleKey, () => {
    ui.singleKey = p.key; ui.sliderActive = false;
    syncSlider(); buildPeriodButtons(); scheduleUpdate(true);
  }, periodTitle(p))));
  [['period-a-btns', 'aKey', 'active-a'], ['period-b-btns', 'bKey', 'active-b']].forEach(([id, key, cls]) => {
    const box = $(id);
    box.innerHTML = '';
    periods.filter(p => p.key !== 'full' && p.available).forEach(p => box.appendChild(chipBtn(p.label, p.key === ui[key], () => {
      ui[key] = p.key; buildPeriodButtons(); scheduleUpdate(true);
    }, periodTitle(p), cls)));
  });
}

const TOY_KINDS = [['all', 'All'], ['season', 'Season'], ['month', 'Month'], ['window', 'Window']];
function buildToyControls() {
  const top = $('toy-btns');
  top.innerHTML = '';
  TOY_KINDS.forEach(([k, lbl]) => top.appendChild(chipBtn(lbl, ui.toy === k, () => { ui.toy = k; buildToyControls(); selectionChanged(true); })));
  const sub = $('toy-sub');
  sub.innerHTML = '';
  sub.hidden = ui.toy === 'all';
  if (ui.toy === 'season') {
    const g = document.createElement('div'); g.className = 'chip-grid g4';
    SEASONS.forEach(x => g.appendChild(chipBtn(x.label, ui.season === x.key, () => { ui.season = x.key; buildToyControls(); selectionChanged(true); }, x.long)));
    sub.appendChild(g);
  } else if (ui.toy === 'month') {
    const g = document.createElement('div'); g.className = 'chip-grid g6';
    MONTHS.forEach((mn, i) => g.appendChild(chipBtn(mn, ui.month === i + 1, () => { ui.month = i + 1; buildToyControls(); selectionChanged(true); })));
    sub.appendChild(g);
  } else if (ui.toy === 'window') {
    const w = document.createElement('div');
    w.innerHTML = `<div class="toy-window"><input type="range" id="toy-center" min="0" max="364" step="1" value="${ui.center}" aria-label="Window centre date">` +
      `<span class="slider-window" id="toy-label"></span></div><div class="card-row"><div class="chip-grid g4" id="toy-half"></div></div>`;
    sub.appendChild(w);
    const half = w.querySelector('#toy-half');
    [3, 7, 15].forEach(h => half.appendChild(chipBtn(`±${h} d`, windowHalf() === h, () => { ui.half = h; buildToyControls(); selectionChanged(true); })));
    half.appendChild(chipBtn('Today', ui.center === todayDoy(), () => { ui.center = todayDoy(); buildToyControls(); selectionChanged(true); }));
    $('toy-label').textContent = curSel().label;
    w.querySelector('#toy-center').addEventListener('input', e => {
      ui.center = parseInt(e.target.value, 10);
      $('toy-label').textContent = curSel().label;
      selectionChanged(false);
    });
  }
}

function buildElemSeg() {
  const seg = $('elem-seg');
  if (!seg) return;
  if (ELEM_KEYS.length < 2) { seg.hidden = true; return; }
  seg.innerHTML = '';
  ELEM_KEYS.forEach(k => {
    const b = document.createElement('button');
    b.className = 'cc-segmented-btn' + (ui.elem === k ? ' is-active' : '');
    b.textContent = ELEMS[k].label;
    b.onclick = () => {
      if (ui.elem === k) return;
      ui.elem = k;
      ui.pin = ui.hl = null;
      buildElemSeg();
      clearObs();
      buildToyControls();
      writeURL();
      if (currentStation) load(currentStation);
    };
    seg.appendChild(b);
  });
}

// Periods, slider bounds and available chips depend on which years are
// complete for the current time of year; rebuild them only when that changes.
let periodSig = '';
function selectionChanged(animate) {
  if (!ds || !ds.nY) return;
  const si = SI();
  if (si.first == null) { periodSig = ''; showOverlay('<span>No complete years for this time of year</span>'); return; }
  periods = buildPeriods();
  validateSelections();
  const sig = periods.map(p => p.key + (p.available ? '+' : '-') + p.years).join() + `|${si.first}-${si.last}`;
  if (sig !== periodSig) {
    periodSig = sig;
    buildPeriodButtons();
    initSlider();
  }
  applyModeUI();
  scheduleUpdate(animate);
}

function initSlider() {
  const slider = $('period-slider');
  const si = SI();
  const span = si.first != null ? si.last - si.first + 1 : 0;
  if (span < 30) { ui.sliderActive = false; return; }
  const keep = ui.sliderActive ? parseInt(slider.value, 10) : null;
  slider.min = si.first + 15;
  slider.max = si.last - 14;
  if (keep != null) slider.value = Math.max(si.first + 15, Math.min(si.last - 14, keep));
  syncSlider();
}

function syncSlider() {
  const slider = $('period-slider');
  const min = parseInt(slider.min, 10), max = parseInt(slider.max, 10);
  $('bar-slider').classList.toggle('dimmed', !ui.sliderActive);
  if (ui.sliderActive) { $('slider-window-label').textContent = sliderLabel(); return; }
  const p = periodByKey(ui.singleKey);
  if (p && p.key !== 'full') {
    slider.value = Math.max(min, Math.min(max, p.s + 15));
    $('slider-window-label').textContent = sliderLabel();
  } else {
    slider.value = Math.floor((min + max) / 2);
    $('slider-window-label').textContent = '—';
  }
}
function sliderLabel() {
  const p = sliderPeriod();
  return p.years < 30 ? `${p.label} · ${p.years}y` : p.label;
}

function applyModeUI() {
  const single = ui.mode === 'single', dist = ui.view === 'dist';
  document.querySelectorAll('#mode-seg .cc-segmented-btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === ui.mode));
  document.querySelectorAll('#view-seg .cc-segmented-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === ui.view));
  $('single-periods').hidden = !single;
  $('cmp-periods').hidden = single;
  const si = ds && ds.nY ? SI() : null;
  $('bar-slider').hidden = !single || !si || si.first == null || (si.last - si.first + 1) < 30;
  $('toy-grp').hidden = !dist;
  $('view-dist').hidden = !dist;
  $('view-months').hidden = dist;
  $('diff-wrap').hidden = !dist || single;
  $('curve-btn').hidden = !dist;
  $('months-hint').hidden = dist;
  // Showing/hiding the strip or the view changes the chart boxes; resize now
  // rather than waiting on ResizeObserver (which background tabs defer).
  if (dist) { if (chart) chart.resize(); if (diffChart && !single) diffChart.resize(); }
}

// ═══════════════════════════════════════════════
//  Model
// ═══════════════════════════════════════════════
function series(p, sel, xr) {
  const agg = aggregate(p.s, p.e, sel);
  const st = stats(agg);
  const bins = binsFor(agg, xr.min, xr.max);
  return { p, agg, st, bins, cum: cumFor(agg), kde: st && ui.kde && ui.view === 'dist' ? kdeFor(agg, st, bins) : null };
}

function monthSeries(p, xr) {
  return aggregateMonths(p.s, p.e).map(agg => {
    const st = stats(agg);
    return { agg, st, dens: st ? densityFor(agg, st, xr.min, xr.max) : null, bins: binsFor(agg, xr.min, xr.max) };
  });
}

function buildModel() {
  const sel = curSel();
  const xr = xRange(sel);
  let m;
  if (ui.mode === 'single') {
    const p = activeSingle();
    if (!p) return null;
    m = { mode: 'single', sel, xr, A: series(p, sel, xr) };
  } else {
    const pa = periodByKey(ui.aKey), pb = periodByKey(ui.bKey);
    if (!pa || !pb) return null;
    m = { mode: 'compare', sel, xr, A: series(pa, sel, xr), B: series(pb, sel, xr) };
  }
  if (ui.view === 'months') {
    m.months = { A: monthSeries(m.A.p, xr), B: m.B ? monthSeries(m.B.p, xr) : null };
  } else {
    m.ghost = buildGhost(m);
  }
  return m;
}

// When the current obs is read against a span other than the one charted,
// draw that span's distribution so the NOW marker has the right reference.
function buildGhost(m) {
  if (!obsValid()) return null;
  const os = obsSel();
  if (os.key === m.sel.key) return null;
  const mk = S => {
    const agg = aggregate(S.p.s, S.p.e, os);
    const st = stats(agg);
    return st ? kdeFor(agg, st, S.bins) : null;
  };
  const g = { sel: os, A: mk(m.A), B: m.B ? mk(m.B) : null, scaled: false };
  if (!g.A && !g.B) return null;
  // A narrow window is far more peaked than the charted span. Rather than
  // squash the bars, scale the reference curves down to fit (shape kept).
  let barMax = 0, gMax = 0;
  [m.A, m.B].forEach(S => S && S.bins.forEach(b => { if (b.pct > barMax) barMax = b.pct; }));
  [g.A, g.B].forEach(arr => arr && arr.forEach(p => { if (p.y > gMax) gMax = p.y; }));
  if (gMax > barMax && gMax > 0) {
    const f = 0.92 * barMax / gMax;
    ['A', 'B'].forEach(k => { if (g[k]) g[k] = g[k].map(p => ({ x: p.x, y: p.y * f })); });
    g.scaled = true;
  }
  return g;
}

// ═══════════════════════════════════════════════
//  Distribution chart — plugins
// ═══════════════════════════════════════════════
function railsOf(m) { return m.mode === 'single' ? [{ S: m.A, col: 'rgba(232,228,217,0.9)' }] : [{ S: m.A, col: C.a }, { S: m.B, col: C.b }]; }

// Shade everything outside the hovered/pinned range.
function drawHL(ch, withLabel) {
  const hl = activeHL();
  if (!hl) return;
  const { ctx, chartArea: ca, scales: { x } } = ch;
  const lo = Math.max(x.min, hl.lo), hi = Math.min(x.max, hl.hi);
  const pxLo = lo <= x.min ? ca.left : x.getPixelForValue(lo);
  const pxHi = hi >= x.max ? ca.right : x.getPixelForValue(hi);
  ctx.save();
  ctx.fillStyle = C.dim;
  if (pxLo > ca.left) ctx.fillRect(ca.left, ca.top, pxLo - ca.left, ca.bottom - ca.top);
  if (pxHi < ca.right) ctx.fillRect(pxHi, ca.top, ca.right - pxHi, ca.bottom - ca.top);
  ctx.strokeStyle = 'rgba(232,228,217,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  [pxLo > ca.left ? pxLo : null, pxHi < ca.right ? pxHi : null].forEach(px => {
    if (px == null) return;
    ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
  });
  ctx.setLineDash([]);
  if (withLabel && hl.label) {
    ctx.font = `700 13px ${MONO}`;
    const tw = ctx.measureText(hl.label).width, bw = tw + 16, bh = 22;
    const mid = (pxLo + pxHi) / 2;
    const bx = Math.max(ca.left + 2, Math.min(ca.right - bw - 2, mid - bw / 2)), by = ca.top + 6;
    ctx.fillStyle = 'rgba(30,35,32,0.92)'; roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = C.border; ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hl.label, bx + bw / 2, by + bh / 2 + 1);
  }
  ctx.restore();
}

function drawZoneBand(ctx, left, right, y0, h, vmin, vmax, toPx) {
  ctx.fillStyle = rampGradient(ctx, left, right, vmin, vmax, 1);
  ctx.fillRect(left, y0, right - left, h);
  ctx.fillStyle = C.surface;
  ZONE_BOUNDS.forEach(b => { if (b > vmin && b < vmax) { const px = toPx(b); ctx.fillRect(px - 1, y0, 2, h); } });
}

// p10–p90 line, p25–p75 bar, median tick.
function drawRail(ctx, st, y, col, toPx) {
  const x10 = toPx(st.p10), x90 = toPx(st.p90), x25 = toPx(st.p25), x75 = toPx(st.p75), xm = toPx(st.median);
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x10, y); ctx.lineTo(x90, y); ctx.stroke();
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x25, y); ctx.lineTo(x75, y); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = C.surface; ctx.fillRect(xm - 2.5, y - 4.5, 5, 9);
  ctx.fillStyle = C.text; ctx.fillRect(xm - 1.5, y - 3.5, 3, 7);
}

function drawObsMarker(ctx, px, top, bottom, text, ca) {
  ctx.strokeStyle = C.obs; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(px, top + 30); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = `700 13px ${MONO}`;
  const tw = ctx.measureText(text).width, bw = tw + 18, bh = 22, by = top + 4;
  const bx = Math.max(ca.left + 2, Math.min(ca.right - bw - 2, px - bw / 2));
  ctx.fillStyle = C.obs;
  roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
  const tx = Math.max(bx + 8, Math.min(bx + bw - 8, px));
  ctx.beginPath(); ctx.moveTo(tx - 5, by + bh); ctx.lineTo(tx + 5, by + bh); ctx.lineTo(tx, by + bh + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
}

const mainPlugin = {
  id: 'freqMain',
  afterDatasetsDraw(ch) { if (model) drawHL(ch, true); },
  afterDraw(ch) {
    const { ctx, chartArea: ca, scales: { x } } = ch;
    if (!x || !model) return;
    const toPx = v => x.getPixelForValue(Math.max(x.min, Math.min(x.max, v)));
    ctx.save();
    drawZoneBand(ctx, ca.left, ca.right, ca.bottom + 4, 8, x.min, x.max, toPx);
    railsOf(model).forEach((r, i) => { if (r.S.st) drawRail(ctx, r.S.st, ca.bottom + 22 + i * 10, r.col, toPx); });

    if (model.mode === 'single' && ui.kde && model.A.st) {
      const mu = model.A.st.mean, px = x.getPixelForValue(mu);
      if (px >= ca.left && px <= ca.right) {
        ctx.strokeStyle = 'rgba(232,228,217,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(232,228,217,0.85)'; ctx.font = `700 12px ${MONO}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`μ ${f1(mu)}°`, px, ca.top - 4);
      }
    }
    if (obsValid()) drawObsMarker(ctx, toPx(obs.v), ca.top, ca.bottom, `${OBS_KIND[obs.kind].flag} ${Math.round(obs.v)}°F`, ca);
    ctx.restore();
  },
};

const diffPlugin = {
  id: 'freqDiff',
  afterDatasetsDraw(ch) {
    if (!model) return;
    const { ctx, chartArea: ca, scales: { y } } = ch;
    ctx.save();
    ctx.strokeStyle = 'rgba(232,228,217,0.45)'; ctx.lineWidth = 1;
    const y0 = y.getPixelForValue(0);
    ctx.beginPath(); ctx.moveTo(ca.left, y0); ctx.lineTo(ca.right, y0); ctx.stroke();
    ctx.restore();
    drawHL(ch, false);
  },
  afterDraw(ch) {
    if (!model || !obsValid()) return;
    const { ctx, chartArea: ca, scales: { x } } = ch;
    const px = x.getPixelForValue(Math.max(x.min, Math.min(x.max, obs.v)));
    ctx.save();
    ctx.strokeStyle = C.obs; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
    ctx.restore();
  },
};

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}

// ═══════════════════════════════════════════════
//  Distribution chart — render
// ═══════════════════════════════════════════════
function buildDatasets(m) {
  const sets = [];
  const A = m.A;
  const ghostLine = (data, col, fill) => ({
    type: 'line', _kind: 'ghost', data, borderColor: col, borderWidth: 2, borderDash: [5, 4],
    pointRadius: 0, pointHoverRadius: 0, cubicInterpolationMode: 'monotone', order: 0,
    fill: fill ? { target: 'origin', above: fill } : false,
  });
  if (m.mode === 'single') {
    sets.push({
      type: 'bar', _kind: 'a', label: A.p.label,
      data: A.bins.map(b => ({ x: b.x, y: b.pct })),
      backgroundColor: A.bins.map(b => rampColor(b.x)), borderWidth: 0,
      barPercentage: 0.92, categoryPercentage: 1, order: 3,
    });
    if (A.kde) sets.push({ type: 'line', _kind: 'kde', data: A.kde, borderColor: 'rgba(232,228,217,0.85)', borderWidth: 2.5,
      pointRadius: 0, pointHoverRadius: 0, fill: false, cubicInterpolationMode: 'monotone', order: 1 });
    if (m.ghost && m.ghost.A) sets.push(ghostLine(m.ghost.A, C.obs, 'rgba(58,175,169,0.10)'));
  } else {
    const B = m.B;
    sets.push({
      type: 'bar', _kind: 'a', label: A.p.label,
      data: A.bins.map(b => ({ x: b.x, y: b.pct })),
      backgroundColor: C.aFill, borderWidth: 0, barPercentage: 0.92, categoryPercentage: 1, order: 3,
    });
    sets.push({
      type: 'line', _kind: 'b', label: B.p.label,
      data: B.bins.map(b => ({ x: b.x, y: b.pct })),
      borderColor: C.b, borderWidth: 2.5, stepped: 'middle', pointRadius: 0, pointHoverRadius: 3,
      pointHoverBackgroundColor: C.b, fill: false, order: 2,
    });
    if (A.kde) sets.push({ type: 'line', _kind: 'kde', data: A.kde, borderColor: C.aLite, borderWidth: 2,
      pointRadius: 0, pointHoverRadius: 0, fill: false, cubicInterpolationMode: 'monotone', order: 1 });
    if (B.kde) sets.push({ type: 'line', _kind: 'kde', data: B.kde, borderColor: C.bLite, borderWidth: 2,
      borderDash: [6, 3], pointRadius: 0, pointHoverRadius: 0, fill: false, cubicInterpolationMode: 'monotone', order: 1 });
    if (m.ghost) {
      if (m.ghost.A) sets.push(ghostLine(m.ghost.A, C.aLite, null));
      if (m.ghost.B) sets.push(ghostLine(m.ghost.B, C.bLite, null));
    }
  }
  return sets;
}

function yMax(m) {
  let mx = 0;
  const scan = arr => arr && arr.forEach(p => { const v = p.pct ?? p.y; if (v > mx) mx = v; });
  [m.A, m.B].forEach(S => { if (!S) return; scan(S.bins); scan(S.kde); });
  if (m.ghost) { scan(m.ghost.A); scan(m.ghost.B); }
  return mx ? mx * 1.16 : 1;
}
function niceMax(v) {
  const step = v > 6 ? 1 : v > 3 ? 0.5 : v > 1.5 ? 0.25 : 0.1;
  return Math.ceil(v / step) * step;
}
const tickFont = { family: 'Courier Prime', size: 13 };
const fixYWidth = s => { s.width = Y_AXIS_W; };
// Both charts share one plot width; label overhang is covered by layout padding.
const zeroXPad = s => { s.paddingLeft = 0; s.paddingRight = 0; };

function renderChart(m, animate) {
  const datasets = buildDatasets(m);
  const ymax = niceMax(yMax(m));
  const pad = 22 + railsOf(m).length * 10 + 4;
  const unit = elemCfg().unit;
  if (chart) {
    chart.data.datasets = datasets;
    chart.options.scales.x.min = m.xr.min;
    chart.options.scales.x.max = m.xr.max;
    chart.options.scales.x.ticks.padding = pad;
    chart.options.scales.y.max = ymax;
    chart.options.scales.y.title.text = `% of ${unit}`;
    chart.update(animate ? undefined : 'none');
    return;
  }
  chart = new Chart($('main-chart').getContext('2d'), {
    type: 'bar',
    data: { datasets },
    plugins: [mainPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 250 },
      layout: { autoPadding: false, padding: { top: 22, right: 16, left: 2 } },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: it => it.dataset._kind === 'a' || it.dataset._kind === 'b',
          backgroundColor: '#2C322D', borderColor: C.border, borderWidth: 1, padding: 10,
          titleColor: C.text, bodyColor: C.text2, footerColor: C.text2,
          titleFont: { family: 'Courier Prime', size: 13, weight: '700' },
          bodyFont: { family: 'Courier Prime', size: 13 },
          footerFont: { family: 'Courier Prime', size: 13, weight: '400' },
          callbacks: { title: tooltipTitle, label: tooltipLabel, footer: tooltipFooter },
        },
      },
      scales: {
        x: {
          type: 'linear', min: m.xr.min, max: m.xr.max, offset: false,
          grid: { display: false }, border: { color: C.border },
          ticks: { stepSize: 10, padding: pad, autoSkip: true, autoSkipPadding: 10, maxRotation: 0, color: C.muted, font: tickFont, callback: v => v + '°' },
          afterFit: zeroXPad,
        },
        y: {
          beginAtZero: true, max: ymax, afterFit: fixYWidth,
          grid: { color: C.grid }, border: { color: C.border },
          ticks: { color: C.muted, font: tickFont, callback: v => v + '%' },
          title: { display: true, text: `% of ${unit}`, color: C.text2, font: tickFont },
        },
      },
    },
  });
}

function diffData(m) {
  return m.A.bins.map((a, i) => {
    const b = m.B.bins[i];
    const d = (m.B.agg.years ? b.count / m.B.agg.years : 0) - (m.A.agg.years ? a.count / m.A.agg.years : 0);
    return { x: a.x, y: d };
  });
}

function renderDiff(m, animate) {
  if (m.mode !== 'compare' || ui.view !== 'dist') return;
  const data = diffData(m);
  let mx = 0; data.forEach(p => { if (Math.abs(p.y) > mx) mx = Math.abs(p.y); });
  mx = mx ? niceStep(mx * 1.15) : 1;
  const per = elemCfg().per;
  const ds0 = {
    type: 'bar', data, borderWidth: 0, barPercentage: 0.92, categoryPercentage: 1,
    backgroundColor: data.map(p => (p.y >= 0 ? 'rgba(224,122,58,0.85)' : 'rgba(74,144,217,0.85)')),
  };
  if (diffChart) {
    diffChart.data.datasets = [ds0];
    diffChart.options.scales.x.min = m.xr.min;
    diffChart.options.scales.x.max = m.xr.max;
    diffChart.options.scales.y.min = -mx;
    diffChart.options.scales.y.max = mx;
    diffChart.options.scales.y.title.text = `B − A, ${per}`;
    diffChart.update(animate ? undefined : 'none');
    return;
  }
  diffChart = new Chart($('diff-chart').getContext('2d'), {
    type: 'bar',
    data: { datasets: [ds0] },
    plugins: [diffPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 250 },
      layout: { autoPadding: false, padding: { top: 8, right: 16, left: 2, bottom: 2 } },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#2C322D', borderColor: C.border, borderWidth: 1, padding: 10,
          titleColor: C.text, bodyColor: C.text2,
          titleFont: { family: 'Courier Prime', size: 13, weight: '700' },
          bodyFont: { family: 'Courier Prime', size: 13 },
          callbacks: {
            title: items => { const b = model && model.A.bins[items[0]?.dataIndex]; return b ? `${b.lo}–${b.hi}°F` : ''; },
            label: it => ` B − A: ${dPerYear(it.parsed.y)} ${elemCfg().per}`,
          },
        },
      },
      scales: {
        x: { type: 'linear', min: m.xr.min, max: m.xr.max, offset: false, border: { display: false }, afterFit: zeroXPad,
          grid: { color: C.grid, drawTicks: false }, ticks: { display: false, stepSize: 10 } },
        y: { min: -mx, max: mx, afterFit: fixYWidth, grid: { color: C.grid }, border: { color: C.border },
          ticks: { color: C.muted, font: tickFont, maxTicksLimit: 5, callback: v => (v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v)) },
          title: { display: true, text: `B − A, ${per}`, color: C.text2, font: { family: 'Courier Prime', size: 12 } } },
      },
    },
  });
}
function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function tooltipTitle(items) {
  if (!items.length || !model) return '';
  const b = model.A.bins[items[0].dataIndex];
  if (!b) return '';
  const zLo = zoneFor(b.lo), zHi = zoneFor(b.hi - 0.1);
  const zone = zLo === zHi ? zLo.label : `${zLo.label} / ${zHi.label}`;
  return `${b.lo}–${b.hi}°F · ${zone}`;
}
function tooltipLabel(it) {
  const S = it.dataset._kind === 'b' ? model.B : model.A;
  const b = S.bins[it.dataIndex];
  if (!b) return '';
  const perYr = S.agg.years ? b.count / S.agg.years : 0;
  const body = `${b.pct.toFixed(2)}% · ${fmtPerYear(perYr)} ${elemCfg().per}`;
  return model.mode === 'single' ? ` ${body}` : ` ${S.p.label}: ${body}`;
}
function tooltipFooter(items) {
  if (!items.length || !model) return '';
  const b = model.A.bins[items[0].dataIndex];
  if (!b) return '';
  if (model.mode === 'single') return `Below ${b.hi}°F: ${Math.round(shareBelow(model.A, b.hi))}% of ${elemCfg().unit}`;
  return `Below ${b.hi}°F: ${Math.round(shareBelow(model.A, b.hi))}% A · ${Math.round(shareBelow(model.B, b.hi))}% B`;
}

// ═══════════════════════════════════════════════
//  By Month — ridgelines
// ═══════════════════════════════════════════════
const RIDGE_AMP = 2.4;            // tallest ridge = 2.4 row spacings
function ridgeGeom(W, H, xr) {
  const L = 62, R = 18, T = 30, B = 44;
  const plotW = W - L - R, plotH = H - T - B;
  const s = plotH / (11 + RIDGE_AMP);
  return {
    L, R, T, B, W, H, plotW, plotH, s, amp: RIDGE_AMP * s,
    base: m => T + RIDGE_AMP * s + m * s,
    x: v => L + (v - xr.min) / (xr.max - xr.min) * plotW,
    v: px => xr.min + (px - L) / plotW * (xr.max - xr.min),
  };
}

function ridgeMax(m) {
  let mx = 0;
  [m.months.A, m.months.B].forEach(arr => arr && arr.forEach(it => { if (it.dens) for (const y of it.dens.ys) if (y > mx) mx = y; }));
  return mx || 1;
}

function ridgePath(ctx, g, dens, y0, k) {
  ctx.beginPath();
  ctx.moveTo(g.x(dens.xs[0]), y0);
  for (let i = 0; i < dens.xs.length; i++) ctx.lineTo(g.x(dens.xs[i]), y0 - dens.ys[i] * k);
  ctx.lineTo(g.x(dens.xs[dens.xs.length - 1]), y0);
}
function ridgeTop(ctx, g, dens, y0, k) {
  ctx.beginPath();
  for (let i = 0; i < dens.xs.length; i++) {
    const px = g.x(dens.xs[i]), py = y0 - dens.ys[i] * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
}

function drawRidges(ctx, W, H, m, opts = {}) {
  const xr = m.xr, g = ridgeGeom(W, H, xr);
  const k = g.amp / ridgeMax(m);
  const single = m.mode === 'single';
  const fill = rampGradient(ctx, g.L, g.L + g.plotW, xr.min, xr.max, 0.92);
  const today = new Date().getMonth();
  const obsM = obsValid() ? new Date(obs.time || Date.now()).getMonth() : -1;

  ctx.save();
  ctx.fillStyle = C.surface; ctx.fillRect(0, 0, W, H);

  // grid
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let v = Math.ceil(xr.min / 10) * 10; v <= xr.max; v += 10) {
    const px = Math.round(g.x(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(px, g.T - 6); ctx.lineTo(px, H - g.B); ctx.stroke();
  }

  for (let mi = 0; mi < 12; mi++) {
    const y0 = g.base(mi);
    const A = m.months.A[mi], Bm = m.months.B ? m.months.B[mi] : null;
    const front = single ? A : Bm;
    // occlude the ridges behind, under both outlines, then fill
    ctx.fillStyle = C.surface;
    if (A.dens) { ridgePath(ctx, g, A.dens, y0, k); ctx.fill(); }
    if (Bm && Bm.dens) { ridgePath(ctx, g, Bm.dens, y0, k); ctx.fill(); }
    if (A.dens) {
      ridgePath(ctx, g, A.dens, y0, k);
      ctx.fillStyle = single ? fill : 'rgba(74,144,217,0.32)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(232,228,217,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.L, y0 + 0.5); ctx.lineTo(g.L + g.plotW, y0 + 0.5); ctx.stroke();
    if (A.dens) {
      ridgeTop(ctx, g, A.dens, y0, k);
      ctx.strokeStyle = single ? 'rgba(240,236,226,0.85)' : C.a; ctx.lineWidth = single ? 1.4 : 1.6; ctx.stroke();
    }
    if (Bm && Bm.dens) {
      ridgeTop(ctx, g, Bm.dens, y0, k);
      ctx.strokeStyle = C.b; ctx.lineWidth = 2; ctx.stroke();
    }
    // median: a line from the baseline up to the ridge, inside the ridge
    [[A, single ? 'rgba(24,28,25,0.62)' : C.aLite], [Bm, C.bLite]].forEach(([S, col]) => {
      if (!S || !S.st || !S.dens) return;
      const v = Math.max(xr.min, Math.min(xr.max, S.st.median)), px = g.x(v);
      const top = y0 - densityAt(S.dens, v) * k;
      ctx.strokeStyle = col; ctx.lineWidth = single ? 2 : 1.5; ctx.setLineDash(single ? [] : [3, 2]);
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, top + 1); ctx.stroke(); ctx.setLineDash([]);
    });
    // month label
    const hot = mi === today, hov = ridgeHover && ridgeHover.m === mi && !opts.export;
    ctx.font = `${hot || hov ? 700 : 400} 14px ${MONO}`;
    ctx.fillStyle = hov ? C.text : hot ? C.accent : C.text2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(MONTHS[mi], g.L - 12, y0 - 2);
    if (!front || !front.st) {
      ctx.fillStyle = C.muted; ctx.font = `12px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText('no complete years', g.L + 6, y0 - 6);
    }
  }

  // hovered/pinned range
  const hl = activeHL();
  if (hl) {
    const lo = Math.max(xr.min, hl.lo), hi = Math.min(xr.max, hl.hi);
    const pxLo = g.x(lo), pxHi = g.x(hi), top = g.T - 8, bot = H - g.B;
    ctx.fillStyle = C.dim;
    if (pxLo > g.L) ctx.fillRect(g.L, top, pxLo - g.L, bot - top);
    if (pxHi < g.L + g.plotW) ctx.fillRect(pxHi, top, g.L + g.plotW - pxHi, bot - top);
    if (hl.label) {
      ctx.font = `700 13px ${MONO}`;
      const tw = ctx.measureText(hl.label).width, bw = tw + 16, bh = 22;
      const bx = Math.max(g.L, Math.min(g.L + g.plotW - bw, (pxLo + pxHi) / 2 - bw / 2)), by = 4;
      ctx.fillStyle = 'rgba(30,35,32,0.92)'; roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
      ctx.strokeStyle = C.border; ctx.stroke();
      ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(hl.label, bx + bw / 2, by + bh / 2 + 1);
    }
  }

  // hover hairline
  if (ridgeHover && !opts.export) {
    const it = (single ? m.months.A : m.months.B)[ridgeHover.m];
    if (it && it.dens) {
      const y0 = g.base(ridgeHover.m), px = g.x(ridgeHover.v), py = y0 - densityAt(it.dens, ridgeHover.v) * k;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 0.5, y0); ctx.lineTo(px + 0.5, py); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill();
    }
  }

  // current obs on its month's ridge
  if (obsM >= 0) {
    const it = (single ? m.months.A : m.months.B)[obsM];
    const y0 = g.base(obsM);
    const v = Math.max(xr.min, Math.min(xr.max, obs.v));
    const px = g.x(v), py = it && it.dens ? y0 - densityAt(it.dens, v) * k : y0;
    ctx.strokeStyle = C.obs; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, py - 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.obs; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill(); ctx.stroke();
    const text = `${OBS_KIND[obs.kind].flag} ${Math.round(obs.v)}°F`;
    ctx.font = `700 13px ${MONO}`;
    const bw = ctx.measureText(text).width + 16, bh = 22;
    const bx = Math.max(g.L, Math.min(g.L + g.plotW - bw, px - bw / 2)), by = Math.max(2, py - 14 - bh);
    ctx.fillStyle = C.obs; roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
  }

  // axis: zone band + ticks
  const bandY = H - g.B + 6;
  drawZoneBand(ctx, g.L, g.L + g.plotW, bandY, 8, xr.min, xr.max, g.x);
  ctx.fillStyle = C.muted; ctx.font = `13px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = [10, 20, 30, 40].find(st => g.plotW * st / (xr.max - xr.min) >= 42) || 50;
  for (let v = Math.ceil(xr.min / step) * step; v <= xr.max; v += step) ctx.fillText(v + '°', g.x(v), bandY + 14);
  ctx.restore();
}

function ridgeCanvasSize() {
  const box = $('view-months');
  return { w: box.clientWidth, h: box.clientHeight };
}
function renderRidges() {
  if (!model || !model.months) return;
  const cv = $('ridge-canvas');
  const { w, h } = ridgeCanvasSize();
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawRidges(ctx, w, h, model);
}

function ridgeHit(evt) {
  if (!model || !model.months) return null;
  const cv = $('ridge-canvas'), r = cv.getBoundingClientRect();
  const px = evt.clientX - r.left, py = evt.clientY - r.top;
  const g = ridgeGeom(r.width, r.height, model.xr);
  if (px < g.L - 50 || px > g.L + g.plotW || py < g.T - 10 || py > r.height - g.B + 4) return null;
  const mi = Math.max(0, Math.min(11, Math.ceil((py - g.T - g.amp) / g.s - 0.15)));
  const v = Math.max(model.xr.min, Math.min(model.xr.max, g.v(Math.max(g.L, px))));
  return { m: mi, v, px, py };
}

function showRidgeTip(h) {
  const tip = $('ridge-tip');
  if (!h) { tip.hidden = true; return; }
  const m = model, mi = h.m, unit = elemCfg().unit;
  const bi = Math.max(0, Math.min(m.A.bins.length - 1, Math.floor((h.v - m.xr.min) / BIN)));
  const bin = m.A.bins[bi];
  const line = (S, cls, lbl) => {
    if (!S || !S.st) return `<div${cls ? ` class="${cls}"` : ''}>${lbl ? lbl + ': ' : ''}no complete years</div>`;
    const b = S.bins[bi];
    return `<div${cls ? ` class="${cls}"` : ''}>${lbl ? lbl + ': ' : ''}${b.pct.toFixed(1)}% of ${unit} · median ${Math.round(S.st.median)}° · ${S.agg.years} yrs</div>`;
  };
  tip.innerHTML = `<b>${MONTHS_FULL[mi]}</b> · ${bin.lo}–${bin.hi}°F` +
    (m.mode === 'single' ? line(m.months.A[mi]) :
      line(m.months.A[mi], 'a', m.A.p.label) + line(m.months.B[mi], 'b', m.B.p.label));
  tip.hidden = false;
  const box = $('view-months').getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = h.px + 14, y = h.py - th - 10;
  if (x + tw > box.width - 6) x = h.px - tw - 14;
  if (y < 4) y = h.py + 14;
  tip.style.left = Math.max(4, x) + 'px'; tip.style.top = y + 'px';
}

// ═══════════════════════════════════════════════
//  Readouts — head, summary, zones
// ═══════════════════════════════════════════════
function renderSeriesLegend(m) {
  const yrs = S => `${S.agg.years} yrs`;
  const scope = m.months ? 'by month' : m.sel.key === 'all' ? '' : m.sel.label;
  const tail = scope ? `<span class="item">${scope}</span>` : '';
  let html;
  if (m.mode === 'single') {
    html = `<span class="item"><b>${m.A.p.label}</b>${m.months ? '' : `&nbsp;· ${yrs(m.A)}`}</span>` + tail;
  } else {
    const sw = m.months ? `<span class="sw-line" style="background:${C.a}"></span>` : `<span class="sw-bar" style="background:${C.aFill};border:1px solid ${C.a}"></span>`;
    html = `<span class="item">${sw}<b>${m.A.p.label}</b>${m.months ? '' : `&nbsp;· ${yrs(m.A)}`}</span>` +
      `<span class="item"><span class="sw-line" style="background:${C.b}"></span><b>${m.B.p.label}</b>${m.months ? '' : `&nbsp;· ${yrs(m.B)}`}</span>` + tail;
  }
  if (m.ghost) html += `<span class="item"><span class="sw-dash" style="border-color:${m.mode === 'single' ? C.obs : C.text2}"></span>${m.ghost.sel.label}${m.ghost.scaled ? ' · scaled to fit' : ''}</span>`;
  $('series-legend').innerHTML = html;
}

// Range descriptors for hover/pin.
function thRange(t) { return { lo: t.lo ?? -Infinity, hi: t.hi ?? Infinity }; }
function zoneRange(z) { return { lo: z.lo < -100 ? -Infinity : z.lo, hi: z.hi > 900 ? Infinity : z.hi }; }
const rangeAttrs = (key, r, label) => `data-key="${esc(key)}" data-lo="${r.lo}" data-hi="${r.hi}" data-label="${esc(label)}"`;

function renderSummary(m) {
  const el = $('summary');
  const cfg = elemCfg();
  $('sum-sub').textContent = m.sel.label;
  if (m.mode === 'single') {
    const st = m.A.st;
    if (!st) { el.innerHTML = ''; return; }
    const cell = (lbl, val, unit, note, attrs = '') => `
      <div class="sum-cell" ${attrs}>
        <span class="cc-stat-label">${lbl}</span>
        <span class="cc-stat-value">${val}<span class="unit">${unit}</span></span>
        ${note ? `<span class="cc-stat-note">${note}</span>` : ''}
      </div>`;
    const rng = `${Math.round(st.p10)}–${Math.round(st.p90)}`;
    el.innerHTML = `<div class="sum-grid">` +
      cell('Mean', f1(st.mean), '°F', '') +
      cell('Median', f1(st.median), '°F', '') +
      cell('10th–90th', rng, '°F', `IQR ${Math.round(st.p25)}–${Math.round(st.p75)}°`, rangeAttrs('p1090', { lo: st.p10, hi: st.p90 }, `10th–90th · ${rng}°F`)) +
      cfg.thresholds.map(t => {
        const v = st.th[t.key];
        return cell(t.label, fmtPerYear(v.perYear), cfg.per, `${v.pct.toFixed(1)}% of ${cfg.unit}`,
          rangeAttrs('th-' + t.key, thRange(t), `${t.label} · ${fmtPerYear(v.perYear)} ${cfg.per}`));
      }).join('') + `</div>`;
  } else {
    const a = m.A.st, b = m.B.st;
    if (!a || !b) { el.innerHTML = ''; return; }
    const row = (lbl, va, vb, unit, fmt, dfmt, attrs = '') =>
      `<tr ${attrs}><td>${lbl}</td><td>${fmt(va)}<span class="u">${unit}</span></td><td>${fmt(vb)}<span class="u">${unit}</span></td>` +
      `<td class="delta">${dfmt(vb - va)}</td></tr>`;
    const deg = v => f1(v), dDeg = d => signed(d, 1);
    el.innerHTML = `<table class="cmp-table">` +
      `<tr><th></th><th class="a">A</th><th class="b">B</th><th>Δ</th></tr>` +
      row('Mean', a.mean, b.mean, '°', deg, dDeg) +
      row('Median', a.median, b.median, '°', deg, dDeg) +
      row('10th', a.p10, b.p10, '°', deg, dDeg) +
      row('90th', a.p90, b.p90, '°', deg, dDeg) +
      cfg.thresholds.map(t => row(t.label, a.th[t.key].perYear, b.th[t.key].perYear, '', fmtPerYear, dPerYear,
        rangeAttrs('th-' + t.key, thRange(t), `${t.label} · ${fmtPerYear(a.th[t.key].perYear)} → ${fmtPerYear(b.th[t.key].perYear)} ${cfg.per}`))).join('') +
      `</table>`;
  }
  markPinned();
}

function renderZones(m) {
  const el = $('zones');
  const cfg = elemCfg();
  $('zone-sub').textContent = cfg.per;
  const A = m.A.st, B = m.B ? m.B.st : null;
  if (!A || (m.B && !B)) { el.innerHTML = ''; return; }
  const bar = st => `<div class="zbar">${ZONES.map((z, i) =>
    `<span style="width:${st.zones[i].pct.toFixed(3)}%;background:${rampColor(zoneMid(z), 1)}" title="${esc(z.label)} ${st.zones[i].pct.toFixed(1)}%"></span>`).join('')}</div>`;
  let html = '<div class="zone-block">';
  if (!B) html += bar(A);
  else html += `<div class="zbar-row"><span class="zbar-lbl"><span class="tag a">A</span></span>${bar(A)}</div>` +
               `<div class="zbar-row"><span class="zbar-lbl"><span class="tag b">B</span></span>${bar(B)}</div>`;
  html += '<div class="zlist">';
  if (B) html += `<div class="zhead"><span></span><span></span><span class="a">A</span><span class="b">B</span></div>`;
  ZONES.forEach((z, i) => {
    const a = A.zones[i], b = B ? B.zones[i] : null;
    const zero = a.count === 0 && (!b || b.count === 0);
    const label = B ? `${z.label} · ${fmtPerYear(a.perYear)} → ${fmtPerYear(b.perYear)} ${cfg.per}` : `${z.label} · ${fmtPerYear(a.perYear)} ${cfg.per} · ${a.pct.toFixed(1)}%`;
    html += `<div class="zrow${B ? ' cmp' : ''}${zero ? ' zero' : ''}" ${rangeAttrs('z' + i, zoneRange(z), label)}>` +
      `<span class="zsw" style="background:${rampColor(zoneMid(z), 1)}"></span>` +
      `<span class="zname">${z.label}<span class="zrng">${z.range}</span></span>` +
      (B ? `<span class="zv a">${fmtPerYear(a.perYear)}</span><span class="zv b">${fmtPerYear(b.perYear)}</span>`
         : `<span class="zv">${fmtPerYear(a.perYear)}<small>${a.pct.toFixed(0)}%</small></span>`) +
      `</div>`;
  });
  html += '</div></div>';
  el.innerHTML = html;
  markPinned();
}

function markPinned() {
  document.querySelectorAll('#summary [data-key], #zones [data-key]').forEach(n =>
    n.classList.toggle('is-pinned', !!ui.pin && n.dataset.key === ui.pin.key));
}

function readRange(n) {
  return { key: n.dataset.key, lo: parseFloat(n.dataset.lo), hi: parseFloat(n.dataset.hi), label: n.dataset.label };
}
function redrawHL() {
  if (ui.view === 'months') renderRidges();
  else { if (chart) chart.draw(); if (diffChart && ui.mode === 'compare') diffChart.draw(); }
}
function wireRangeHover(container) {
  container.addEventListener('mouseover', e => {
    const n = e.target.closest('[data-key]');
    if (!n || !container.contains(n)) return;
    const r = readRange(n);
    if (ui.hl && ui.hl.key === r.key) return;
    ui.hl = r; redrawHL();
  });
  container.addEventListener('mouseleave', () => { if (ui.hl) { ui.hl = null; redrawHL(); } });
  container.addEventListener('mouseout', e => {
    const n = e.target.closest('[data-key]');
    if (n && !n.contains(e.relatedTarget) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-key]'))) { ui.hl = null; redrawHL(); }
  });
  container.addEventListener('click', e => {
    const n = e.target.closest('[data-key]');
    if (!n) return;
    const r = readRange(n);
    ui.pin = ui.pin && ui.pin.key === r.key ? null : r;
    if (!ui.pin) ui.hl = null;
    markPinned(); redrawHL();
  });
}

// ═══════════════════════════════════════════════
//  Current observation — NWS API, routine METARs only
// ═══════════════════════════════════════════════
const OBS_KIND = {
  now:  { label: 'Now',       flag: 'NOW' },
  high: { label: '24-h high', flag: '24H HIGH' },
  low:  { label: '24-h low',  flag: '24H LOW' },
};
function obsValid() { return !!(obs && currentStation && obs.sid === currentStation.id && obs.elem === ui.elem); }
function obsTime() {
  return obs.time ? new Date(obs.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
}
// The span an obs is ranked against: the charted month/window if it holds the
// obs date; the obs month in By Month; otherwise the obs date ± 7 days.
function obsSel() {
  const t = new Date(obs.time || Date.now());
  const d = doyOf(t.getMonth() + 1, t.getDate());
  if (ui.view === 'months') return makeSel(`month:${t.getMonth() + 1}`);
  const cur = curSel();
  return (ui.toy === 'month' || ui.toy === 'window') && cur.days[d] ? cur : makeSel(`window:${d}:7`);
}
function nowInfo(m) {
  if (!obsValid() || !m) return null;
  const sel = obsSel();
  const pr = S => { const agg = aggregate(S.p.s, S.p.e, sel); return agg.n ? Math.round(percentRank(agg, obs.v)) : null; };
  return { label: sel.label, a: pr(m.A), b: m.mode === 'compare' ? pr(m.B) : null };
}
function renderNowPill(m) {
  const el = $('now-pill');
  const info = nowInfo(m);
  if (!info) { el.hidden = true; el.innerHTML = ''; return; }
  const pct = m.mode === 'single'
    ? (info.a != null ? `${ordinal(info.a)} pct for ${info.label}` : '')
    : `pct for ${info.label}: ${info.a != null ? ordinal(info.a) : '—'} A · ${info.b != null ? ordinal(info.b) : '—'} B`;
  el.innerHTML = [`<b>${OBS_KIND[obs.kind].label} ${Math.round(obs.v)}°F</b>`, pct, obsTime()].filter(Boolean).join('<span class="dot">·</span>');
  el.hidden = false;
}

function clearObs() {
  obs = null;
  const btn = $('obs-btn');
  btn.classList.remove('is-active', 'is-error');
  btn.disabled = false;
  $('obs-btn-label').textContent = '⊕ Current obs';
  $('now-pill').hidden = true;
}

async function toggleObs() {
  if (!currentStation) return;
  if (obs) { clearObs(); scheduleUpdate(false); return; }
  const sid = currentStation.id, elem = ui.elem, cfg = ELEMS[elem], kind = cfg.obs;
  const btn = $('obs-btn'), label = $('obs-btn-label');
  btn.disabled = true;
  label.textContent = 'Fetching…';
  try {
    const q = kind === 'now' ? 'limit=10' : `start=${encodeURIComponent(new Date(Date.now() - 24 * 3600e3).toISOString())}`;
    const res = await fetch(`https://api.weather.gov/stations/${sid}/observations?${q}`, { headers: { Accept: 'application/geo+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    // Routine METARs only — skip SPECI (special / sub-hourly observations)
    const routine = (json.features || []).filter(f => {
      const raw = (f.properties?.rawMessage || '').trim();
      return raw.length > 0 && !raw.startsWith('SPECI') && f.properties?.[cfg.obsField]?.value != null;
    });
    if (!routine.length) throw new Error('No routine METAR');
    let pick = routine[0];
    if (kind !== 'now') {
      routine.forEach(f => {
        const v = f.properties[cfg.obsField].value, p = pick.properties[cfg.obsField].value;
        if (kind === 'high' ? v > p : v < p) pick = f;
      });
    }
    if (!currentStation || currentStation.id !== sid || ui.elem !== elem) return;   // changed mid-fetch
    const vC = pick.properties[cfg.obsField].value;
    obs = { sid, elem, kind, v: vC * 9 / 5 + 32, time: pick.properties.timestamp };
    btn.disabled = false;
    btn.classList.add('is-active');
    label.textContent = '✕ Current obs';
    scheduleUpdate(false);
  } catch (err) {
    console.error('Current obs:', err);
    if (!currentStation || currentStation.id !== sid || ui.elem !== elem) { clearObs(); return; }
    label.textContent = '⚠ Unavailable';
    btn.classList.add('is-error');
    setTimeout(() => { if (!obs) clearObs(); }, 2600);
  }
}

// ═══════════════════════════════════════════════
//  Update
// ═══════════════════════════════════════════════
let pendingAnimate = false;
function scheduleUpdate(animate) {
  pendingAnimate = pendingAnimate || !!animate;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const a = pendingAnimate; pendingAnimate = false;
    updateView(a);
  });
}

function updateView(animate) {
  if (!ds || !ds.nY || SI().first == null) return;
  model = buildModel();
  if (!model || !model.A.st || (model.B && !model.B.st)) {
    showOverlay('<span>No complete years in this selection</span>');
    return;
  }
  hideOverlay();
  if (ui.view === 'dist') { renderChart(model, animate); renderDiff(model, animate); }
  else renderRidges();
  renderSeriesLegend(model);
  renderNowPill(model);
  renderSummary(model);
  renderZones(model);
}

// ═══════════════════════════════════════════════
//  Overlay / notices / header
// ═══════════════════════════════════════════════
function showOverlay(html) { const o = $('state-overlay'); o.innerHTML = html; o.hidden = false; }
function hideOverlay() { $('state-overlay').hidden = true; }
function showLoading(st) {
  clearInterval(waitTimer);
  const iem = elemCfg().src === 'iem';
  if (st.phase === 'recv' && st.year) {
    const now = new Date().getUTCFullYear(), first = st.first || st.year;
    const f = now > first ? (st.year - first) / (now - first) : 0;
    showOverlay(`<div class="spinner"></div><span>Receiving ${st.year} · ${(st.bytes / 1e6).toFixed(1)} MB</span><div class="progress"><div style="width:${Math.round(f * 100)}%"></div></div>`);
    return;
  }
  if (st.phase === 'retry') {
    let left = Math.round(st.wait / 1000);
    const draw = () => showOverlay(`<div class="spinner"></div><span>${iem ? 'IEM' : 'ACIS'} busy (${st.why}) · retrying in ${left}s</span>`);
    draw();
    waitTimer = setInterval(() => { left = Math.max(0, left - 1); draw(); }, 1000);
    return;
  }
  const t0 = Date.now();
  const draw = () => showOverlay(`<div class="spinner"></div><span>Requesting ${iem ? 'hourly' : 'daily'} record · ${Math.round((Date.now() - t0) / 1000)}s</span>`);
  draw();
  waitTimer = setInterval(draw, 1000);
}

function fmtRanges(failed) {
  const merged = [];
  failed.slice().sort((a, b) => a.y1 - b.y1).forEach(f => {
    const last = merged[merged.length - 1];
    if (last && f.y1 <= last.y2 + 1) last.y2 = Math.max(last.y2, f.y2);
    else merged.push({ y1: f.y1, y2: f.y2 });
  });
  return merged.map(f => (f.y1 === f.y2 ? `${f.y1}` : `${f.y1}–${f.y2}`)).join(', ');
}
function renderFetchNotice() {
  const el = $('fetch-notice');
  if (!ds || !ds.failed.length || !ds.n || ELEMS[ds.elem].src !== 'iem') { el.hidden = true; return; }
  $('fetch-notice-text').textContent = `Unavailable: ${fmtRanges(ds.failed)} (${ds.failed[0].msg})`;
  el.hidden = false;
}
function sourceLine() {
  const cfg = elemCfg();
  return cfg.src === 'iem' ? 'Data: Iowa Environmental Mesonet · ASOS routine hourly METARs'
    : `Data: NOAA ACIS${ds && ds.name ? ' · ' + ds.name : ''}`;
}
function renderHeader() {
  const st = currentStation;
  $('stn-name').textContent = st.label;
  $('stn-meta').textContent = ds && ds.n ? `${st.id} · Record ${ds.y0}–${ds.y1}` : st.id;
  $('src').textContent = `${sourceLine()} · complete years only`;
  document.title = `${CFG.title} · ${st.name} | ContextClimate`;
}

// ═══════════════════════════════════════════════
//  Load station
// ═══════════════════════════════════════════════
async function load(station) {
  const seq = ++loadSeq;
  if (loadAbort) loadAbort.abort();
  loadAbort = null;
  clearInterval(waitTimer);

  if (!currentStation || currentStation.id !== station.id) clearObs();
  currentStation = station;
  ui.sliderActive = false;
  const elem = ui.elem, cfg = ELEMS[elem];
  const key = cacheKey(station.id, elem);
  ds = null;
  renderHeader();
  $('fetch-notice').hidden = true;

  let d = cache[key];
  if (!d) {
    $('summary').innerHTML = ''; $('zones').innerHTML = ''; $('series-legend').innerHTML = '';
    showLoading({ phase: 'wait' });
    const hit = await cacheGet(key);
    if (seq !== loadSeq) return;
    if (hit) {
      d = buildDataset(key, elem, { yr: Array.from(hit.yr), mo: Array.from(hit.mo), doy: Array.from(hit.doy), t10: Array.from(hit.t10) }, [], hit.name || '');
    } else {
      const ctrl = new AbortController();
      loadAbort = ctrl;
      const onStatus = st => { if (seq === loadSeq) showLoading(st); };
      if (cfg.src === 'iem') {
        // Space requests out: IEM refuses a second request inside ~5 s.
        const since = Date.now() - lastRequestAt;
        if (since < RATE_GAP_MS) {
          try { await sleep(RATE_GAP_MS - since, ctrl.signal); } catch (e) { return; }
        }
        lastRequestAt = Date.now();
        const last = new Date().getUTCFullYear();
        let res;
        try {
          res = await fetchRanges(station.id, cfg.iemVar, [{ y1: FIRST_FETCH_YEAR, y2: last }], ctrl.signal, onStatus);
        } catch (e) {
          if (e.name === 'AbortError') return;
          res = { parts: [], failed: [{ y1: FIRST_FETCH_YEAR, y2: last, msg: e.message }] };
        }
        lastRequestAt = Date.now();
        if (seq !== loadSeq) return;
        d = buildDataset(key, elem, mergeParts(res.parts), res.failed);
      } else {
        let res;
        try {
          res = await fetchACIS(station, elem, ctrl.signal, onStatus);
        } catch (e) {
          if (e.name === 'AbortError') return;
          res = { raw: { yr: [], mo: [], doy: [], t10: [] }, name: '', failed: [{ y1: 0, y2: 0, msg: e.message || 'network error' }] };
        }
        if (seq !== loadSeq) return;
        d = buildDataset(key, elem, res.raw, res.failed || [], res.name);
      }
      loadAbort = null;
      if (d.n && !d.failed.length) cachePut(d);
    }
    if (d.n) cache[key] = d;
  }
  clearInterval(waitTimer);
  if (seq !== loadSeq) return;
  ds = d;
  renderHeader();
  renderFetchNotice();

  if (!ds.n) {
    const msg = ds.failed.length ? `Data unavailable (${ds.failed[0].msg})` : CFG.emptyMsg;
    showOverlay(`<span class="err">⚠ ${msg}</span><button class="cc-btn" id="overlay-retry">Retry</button>`);
    $('overlay-retry').onclick = () => { delete cache[key]; load(station); };
    return;
  }
  if (SI().first == null) {
    periodSig = '';
    showOverlay('<span class="err">⚠ No complete years in this record</span>');
    return;
  }
  periodSig = '';
  selectionChanged(true);
}

// Refill ranges a partial IEM download missed.
async function retryFailed() {
  if (!ds || !ds.failed.length || ELEMS[ds.elem].src !== 'iem') return;
  const station = currentStation, d = ds;
  const btn = $('fetch-retry-btn');
  btn.disabled = true; btn.textContent = 'Retrying…';
  const since = Date.now() - lastRequestAt;
  if (since < RATE_GAP_MS) await sleep(RATE_GAP_MS - since);
  lastRequestAt = Date.now();
  const res = await fetchRanges(station.id, ELEMS[d.elem].iemVar, d.failed.map(f => ({ y1: f.y1, y2: f.y2 })), undefined, () => {});
  lastRequestAt = Date.now();
  mergeParts(res.parts, d.raw);
  const nd = buildDataset(d.key, d.elem, d.raw, res.failed, d.name);
  cache[d.key] = nd;
  if (nd.n && !nd.failed.length) cachePut(nd);
  btn.disabled = false; btn.textContent = 'Retry';
  if (currentStation === station && ui.elem === d.elem) load(station);
}

// ═══════════════════════════════════════════════
//  Station finder (search · Near Me), URL state
// ═══════════════════════════════════════════════
let ddIdx = -1;
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function findNearestStation() {
  const btn = $('locate-btn');
  if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
  const orig = btn.innerHTML; btn.classList.add('loading'); btn.innerHTML = '&#8987; Locating…';
  navigator.geolocation.getCurrentPosition(pos => {
    btn.classList.remove('loading'); btn.innerHTML = orig;
    const { latitude: lat, longitude: lon } = pos.coords;
    const ranked = Object.values(STATIONS).map(s => ({ s, dist: haversineMiles(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.dist - b.dist).slice(0, 8);
    $('si').value = '';
    renderDD(ranked.map(r => r.s), ranked.map(r => r.dist));
  }, err => {
    btn.classList.remove('loading'); btn.innerHTML = orig;
    alert('Could not get your location: ' + (err && err.message ? err.message : 'permission denied or unavailable.'));
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
}
function initSearch() {
  const inp = $('si'), dd = $('dd');
  const all = Object.values(STATIONS);
  inp.addEventListener('input', () => {
    ddIdx = -1; const q = inp.value.trim().toLowerCase();
    if (!q) { dd.classList.remove('open'); return; }
    // ids first, then names starting with the query, then any word, then anywhere, then state
    const rank = s => {
      const id = s.id.toLowerCase(), nm = s.name.toLowerCase();
      if (id === q || id.slice(1) === q) return 0;
      if (id.startsWith(q) || id.slice(1).startsWith(q)) return 1;
      if (nm.startsWith(q)) return 2;
      if (nm.split(/[\s\-\/]+/).some(w => w.startsWith(q))) return 3;
      if (nm.includes(q)) return 4;
      if (s.st.toLowerCase() === q) return 5;
      return 9;
    };
    renderDD(all.map(s => [rank(s), s]).filter(r => r[0] < 9).sort((a, b) => a[0] - b[0]).map(r => r[1]).slice(0, 18));
  });
  inp.addEventListener('keydown', e => {
    const items = dd.querySelectorAll('.d-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); ddIdx = Math.min(ddIdx + 1, items.length - 1); highlightDD(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ddIdx = Math.max(ddIdx - 1, 0); highlightDD(items); }
    else if (e.key === 'Enter') { e.preventDefault(); const i = ddIdx >= 0 ? ddIdx : 0; if (items[i]) items[i].click(); }
    else if (e.key === 'Escape') { dd.classList.remove('open'); }
  });
  document.addEventListener('click', e => { if (!$('sw').contains(e.target)) dd.classList.remove('open'); });
  $('locate-btn').onclick = findNearestStation;
}
function highlightDD(items) { items.forEach((el, i) => { el.classList.toggle('hi', i === ddIdx); if (i === ddIdx) el.scrollIntoView({ block: 'nearest' }); }); }
function renderDD(matches, dists) {
  const dd = $('dd');
  if (!matches.length) { dd.classList.remove('open'); return; }
  dd.innerHTML = matches.map((s, i) => `<div class="d-item"><span class="d-id">${s.id}</span><span class="d-name">${esc(s.name)}</span>` +
    (dists ? `<span class="d-dist">${dists[i].toFixed(0)}mi</span>` : '') + `<span class="d-st">${s.st}</span></div>`).join('');
  dd.querySelectorAll('.d-item').forEach((el, i) => el.addEventListener('click', () => {
    $('si').value = ''; dd.classList.remove('open'); selectStation(matches[i].id);
  }));
  dd.classList.add('open');
}
function selectStation(id) {
  if (!STATIONS[id]) return;
  if (currentStation && currentStation.id === id) return;
  writeURL(id);
  load(STATIONS[id]);
}

function writeURL(id) {
  const p = new URLSearchParams(location.search);
  const st = id || (currentStation && currentStation.id);
  if (st) p.set('st', st);
  if (ELEM_KEYS.length > 1) p.set('elem', ui.elem); else p.delete('elem');
  if (ui.view === 'months') p.set('view', 'months'); else p.delete('view');
  try { history.replaceState(null, '', `${location.pathname}?${p.toString()}`); } catch (e) { /* sandboxed — fine */ }
}

// ═══════════════════════════════════════════════
//  Export — composed offscreen at EXPORT_SCALE, independent of screen DPR
// ═══════════════════════════════════════════════
function contextLine(m) {
  const cfg = elemCfg();
  const span = m.months ? 'by month' : m.sel.label;
  const tail = m.months ? `${span} · density` : `${span} · % of ${cfg.unit} per ${BIN}°F bin`;
  if (m.mode === 'single') return `${cfg.noun} · ${m.A.p.label}${m.months ? '' : ` (${m.A.agg.years} yrs)`} · ${tail}`;
  return `${cfg.noun} · ${m.A.p.label} vs ${m.B.p.label} · ${tail}`;
}
function statLine(m) {
  const cfg = elemCfg(), t0 = cfg.thresholds[cfg.headline ?? 0];
  if (m.mode === 'single') {
    const s = m.A.st;
    return `Mean ${f1(s.mean)}°F  ·  Median ${f1(s.median)}°F  ·  10th–90th ${Math.round(s.p10)}–${Math.round(s.p90)}°F  ·  ${t0.label} ${fmtPerYear(s.th[t0.key].perYear)} ${cfg.per}`;
  }
  const a = m.A.st, b = m.B.st;
  const dh = b.th[t0.key].perYear - a.th[t0.key].perYear;
  return `Median ${f1(a.median)} → ${f1(b.median)}°F (${signed(b.median - a.median)})  ·  ${t0.label} ${fmtPerYear(a.th[t0.key].perYear)} → ${fmtPerYear(b.th[t0.key].perYear)} ${cfg.per} (${dPerYear(dh)})`;
}
function nowLine(m) {
  const info = nowInfo(m);
  if (!info) return null;
  const t = obsTime();
  const pct = m.mode === 'single'
    ? (info.a != null ? ` · ${ordinal(info.a)} percentile for ${info.label}` : '')
    : ` · percentile for ${info.label}: ${info.a != null ? ordinal(info.a) : '—'} (A), ${info.b != null ? ordinal(info.b) : '—'} (B)`;
  return `${OBS_KIND[obs.kind].label} ${Math.round(obs.v)}°F${pct}${t ? ' · ' + t : ''}`;
}

function snapshotChart(ch) {
  ch.stop();
  const prev = ch.options.devicePixelRatio;
  ch.options.devicePixelRatio = EXPORT_SCALE;
  ch.resize();
  ch.update('none');
  const src = ch.canvas;
  const snap = document.createElement('canvas');
  snap.width = src.width; snap.height = src.height;
  snap.getContext('2d').drawImage(src, 0, 0);
  ch.options.devicePixelRatio = prev;
  ch.resize();
  ch.update('none');
  return { canvas: snap, w: ch.width, h: ch.height };
}
function snapshotRidges() {
  const { w, h } = ridgeCanvasSize();
  const W = Math.max(w, 640), H = Math.max(h, 520);
  const snap = document.createElement('canvas');
  snap.width = Math.round(W * EXPORT_SCALE); snap.height = Math.round(H * EXPORT_SCALE);
  const c = snap.getContext('2d');
  c.scale(EXPORT_SCALE, EXPORT_SCALE);
  drawRidges(c, W, H, model, { export: true });
  return { canvas: snap, w: W, h: H };
}

function legendItems(m) {
  const items = [];
  if (m.mode === 'compare') {
    items.push(m.months ? { kind: 'line', color: C.a, text: m.A.p.label } : { kind: 'bar', color: C.aFill, stroke: C.a, text: `${m.A.p.label} (${m.A.agg.years} yrs)` });
    items.push({ kind: 'line', color: C.b, text: m.months ? m.B.p.label : `${m.B.p.label} (${m.B.agg.years} yrs)` });
  }
  if (m.ghost) items.push({ kind: 'dash', color: m.mode === 'single' ? C.obs : C.text2, text: m.ghost.sel.label + (m.ghost.scaled ? ' · scaled to fit' : '') });
  return items;
}
function layoutRow(c, items, maxW, gap) {
  const rows = [[]]; let w = 0;
  items.forEach(it => {
    const iw = 17 + c.measureText(it.text).width;
    if (w && w + gap + iw > maxW) { rows.push([]); w = 0; }
    rows[rows.length - 1].push({ ...it, w: iw });
    w += (w ? gap : 0) + iw;
  });
  return rows;
}

async function composeExport() {
  if (!model) return null;
  await document.fonts.ready;
  const m = model;
  const parts = [];
  if (m.months) parts.push(snapshotRidges());
  else {
    parts.push(snapshotChart(chart));
    if (m.mode === 'compare' && diffChart) parts.push(snapshotChart(diffChart));
  }
  const cw = Math.max(...parts.map(p => p.w));
  const chh = parts.reduce((s, p) => s + p.h, 0) + (parts.length - 1) * 6;
  const PAD = 32, CARD = 14;
  const W = cw + CARD * 2 + PAD * 2;
  const innerW = W - PAD * 2;

  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `12px ${MONO}`;
  const zoneRows = layoutRow(meas, ZONES.map(z => ({ kind: 'zone', color: rampColor(zoneMid(z), 1), text: `${z.label} ${z.range}` })), innerW, 16);
  meas.font = `13px ${MONO}`;
  const serRows = layoutRow(meas, legendItems(m), innerW, 22);
  const now = nowLine(m);
  const serH = serRows[0].length ? serRows.length * 22 + 6 : 0;

  const cardH = CARD + serH + chh + 10 + zoneRows.length * 20 + CARD - 4;
  const H = PAD + 36 + 22 + 22 + (now ? 22 : 0) + 8 + cardH + 18 + 30 + 18 + PAD - 8;

  const off = document.createElement('canvas');
  off.width = Math.round(W * EXPORT_SCALE);
  off.height = Math.round(H * EXPORT_SCALE);
  const c = off.getContext('2d');
  c.scale(EXPORT_SCALE, EXPORT_SCALE);
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
  c.textBaseline = 'top'; c.textAlign = 'left';

  let y = PAD;
  c.fillStyle = C.accent; c.font = `700 26px "Zilla Slab", serif`;
  const title = CFG.title + (ELEM_KEYS.length > 1 ? ` · ${elemCfg().label}` : '');
  c.fillText(title, PAD, y);
  const tw = c.measureText(title).width;
  c.fillStyle = C.text; c.font = `700 15px ${MONO}`;
  c.fillText(`${currentStation.label} · ${currentStation.id}`.toUpperCase(), PAD + tw + 16, y + 8);
  y += 36;
  c.fillStyle = C.text2; c.font = `13px ${MONO}`;
  c.fillText(contextLine(m), PAD, y); y += 22;
  c.fillStyle = C.muted;
  c.fillText(`Complete years only · record ${ds.y0}–${ds.y1}`, PAD, y); y += 22;
  if (now) { c.fillStyle = C.obs; c.font = `700 13px ${MONO}`; c.fillText(now, PAD, y); y += 22; }
  y += 8;

  c.fillStyle = C.surface; roundRect(c, PAD, y, innerW, cardH, 6); c.fill();
  c.strokeStyle = C.border; c.lineWidth = 1; roundRect(c, PAD + 0.5, y + 0.5, innerW - 1, cardH - 1, 6); c.stroke();
  let cy = y + CARD;
  if (serH) {
    c.font = `13px ${MONO}`;
    serRows.forEach(row => {
      let x = PAD + CARD;
      row.forEach(it => {
        if (it.kind === 'bar') { c.fillStyle = it.color; c.fillRect(x, cy + 2, 11, 11); c.strokeStyle = it.stroke; c.strokeRect(x + 0.5, cy + 2.5, 10, 10); }
        else if (it.kind === 'dash') { c.strokeStyle = it.color; c.lineWidth = 2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x - 2, cy + 7.5); c.lineTo(x + 13, cy + 7.5); c.stroke(); c.setLineDash([]); }
        else { c.fillStyle = it.color; c.fillRect(x - 2, cy + 6, 15, 3); }
        c.fillStyle = C.text; c.fillText(it.text, x + 17, cy + 1);
        x += it.w + 22;
      });
      cy += 22;
    });
    cy += 6;
  }
  parts.forEach((p, i) => {
    c.drawImage(p.canvas, PAD + CARD, cy, p.w, p.h);
    cy += p.h + (i < parts.length - 1 ? 6 : 0);
  });
  cy += 10;
  c.font = `12px ${MONO}`;
  zoneRows.forEach(row => {
    const rw = row.reduce((s, it) => s + it.w, 0) + 16 * (row.length - 1);
    let x = PAD + (innerW - rw) / 2;
    row.forEach(it => {
      c.fillStyle = it.color; c.fillRect(x, cy + 1, 11, 11);
      c.fillStyle = C.text2; c.fillText(it.text, x + 17, cy);
      x += it.w + 16;
    });
    cy += 20;
  });
  y += cardH + 18;

  c.fillStyle = C.text; c.font = `700 14px ${MONO}`;
  c.fillText(statLine(m), PAD, y); y += 30;

  c.textBaseline = 'alphabetic';
  c.fillStyle = C.accent; c.font = `700 14px ${MONO}`;
  c.fillText('contextclimate.io', PAD, y + 10);
  c.fillStyle = C.muted; c.font = `12px ${MONO}`; c.textAlign = 'right';
  c.fillText(sourceLine(), W - PAD, y + 10);
  return off;
}

function exportName() {
  const m = model;
  const per = m.mode === 'single' ? m.A.p.label : `${m.A.p.label}_vs_${m.B.p.label}`;
  const elem = ELEM_KEYS.length > 1 ? `_${ui.elem}` : '';
  const span = m.months ? 'by-month' : m.sel.slug;
  return `${CFG.fileSlug}_${currentStation.id}${elem}_${per}_${span}.png`.replace(/–/g, '-');
}
function flash(btn, cls, text, orig) {
  btn.textContent = text; btn.classList.add(cls);
  setTimeout(() => { btn.textContent = orig; btn.classList.remove(cls); btn.disabled = false; }, 2000);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportImage(kind) {
  const btn = kind === 'copy' ? $('copy-img-btn') : $('png-btn');
  const orig = btn.textContent;
  if (!model || !$('state-overlay').hidden) return;
  btn.disabled = true; btn.textContent = 'Rendering…';
  try {
    const off = await composeExport();
    const blob = await new Promise(res => off.toBlob(res, 'image/png'));
    if (kind === 'copy' && navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        flash(btn, 'is-ok', '✓ Copied', orig);
        return;
      } catch (e) { /* clipboard blocked — fall through to download */ }
    }
    downloadBlob(blob, exportName());
    flash(btn, 'is-ok', '✓ Saved', orig);
  } catch (err) {
    console.error('Export failed:', err);
    flash(btn, 'is-error', '⚠ Failed', orig);
  }
}

// ═══════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════
(function init() {
  Chart.defaults.font.family = 'Courier Prime';
  ui.center = todayDoy();
  const qs = new URLSearchParams(location.search);
  const toy = qs.get('toy');
  if (TOY_KINDS.some(([k]) => k === toy)) ui.toy = toy;
  if (qs.get('view') === 'months') ui.view = 'months';
  if (ELEMS[qs.get('elem')]) ui.elem = qs.get('elem');
  const startId = STATIONS[(qs.get('st') || '').toUpperCase()] ? qs.get('st').toUpperCase() : DEFAULT_ID;

  buildElemSeg();
  buildToyControls();
  initSearch();
  applyModeUI();

  document.querySelectorAll('#mode-seg .cc-segmented-btn').forEach(b => {
    b.onclick = () => {
      if (ui.mode === b.dataset.mode) return;
      ui.mode = b.dataset.mode;
      ui.pin = ui.hl = null;
      applyModeUI();
      scheduleUpdate(true);
    };
  });
  document.querySelectorAll('#view-seg .cc-segmented-btn').forEach(b => {
    b.onclick = () => {
      if (ui.view === b.dataset.view) return;
      ui.view = b.dataset.view;
      ridgeHover = null; $('ridge-tip').hidden = true;
      writeURL();
      selectionChanged(true);
    };
  });

  $('period-slider').addEventListener('input', () => {
    if (!ds) return;
    ui.sliderActive = true;
    syncSlider();
    document.querySelectorAll('#single-period-btns .cc-btn').forEach(b => b.classList.remove('is-active'));
    scheduleUpdate(false);
  });

  wireRangeHover($('summary'));
  wireRangeHover($('zones'));

  const rc = $('ridge-canvas');
  rc.addEventListener('mousemove', e => {
    const h = ridgeHit(e);
    const changed = !h !== !ridgeHover || (h && (h.m !== ridgeHover.m || Math.abs(h.px - ridgeHover.px) > 0.5));
    ridgeHover = h;
    if (changed) renderRidges();
    showRidgeTip(h);
  });
  rc.addEventListener('mouseleave', () => { ridgeHover = null; showRidgeTip(null); renderRidges(); });
  rc.addEventListener('click', e => {
    const h = ridgeHit(e);
    if (!h) return;
    ui.view = 'dist'; ui.toy = 'month'; ui.month = h.m + 1;
    ridgeHover = null; showRidgeTip(null);
    buildToyControls();
    writeURL();
    selectionChanged(true);
  });
  if (window.ResizeObserver) new ResizeObserver(() => { if (ui.view === 'months') renderRidges(); }).observe($('view-months'));

  $('curve-btn').onclick = () => { ui.kde = !ui.kde; $('curve-btn').classList.toggle('is-active', ui.kde); scheduleUpdate(true); };
  $('obs-btn').onclick = toggleObs;
  $('copy-img-btn').onclick = () => exportImage('copy');
  $('png-btn').onclick = () => exportImage('png');
  $('fetch-retry-btn').onclick = retryFailed;

  writeURL(startId);
  window.__freqState = () => ({ model, ui, ds, periods });   // read-only hook for automated checks
  const start = () => load(STATIONS[startId]);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start); else start();
})();

})();
