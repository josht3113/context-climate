/* ════════════════════════════════════════════════════════════════════
   iem-climo.js — shared climatology loading for the hourly heatmaps
   ────────────────────────────────────────────────────────────────────
   Loaded by the eight station hourly heatmaps (fog, thunderstorm, SLP,
   smoke, and the temperature / dewpoint / wind / winter-precip threshold
   tools) with <script src="iem-climo.js"></script>.

   1. fetchRangeChunked — the 1991–2025 climatology used to be one IEM
      request (~90 MB, ~50 s, nothing to show until the end, and the
      request most likely to be refused when IEM sheds load). It is now
      split into 5-year chunks fetched ONE AT A TIME: IEM answers a
      second concurrent request from the same client with HTTP 429.
      A 429 is retried on the same span after a growing wait. A 5xx or
      network failure is retried, then the span is halved, down to
      single years. The chunks are joined back into one CSV with a
      single header, so each tool's existing parser runs unchanged.

   2. cacheGet / cacheSet — the finished per-station aggregate (count
      grids, a few hundred KB — never the raw observations) is kept in
      IndexedDB so a repeat visit draws immediately. Keys carry the tool,
      station and year range, so a new CLIMO_END starts a fresh entry;
      entries also expire after 30 days. Storage failures (private
      windows, quota, blocked storage) are swallowed: the tool simply
      fetches again.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  const CHUNK_YEARS = 5;
  const RETRIES = 3;          // 5xx / network, per span, before splitting
  const BACKOFF_MS = 1200;    // 1.2 s, 2.4 s, 4.8 s
  const RATE_RETRIES = 6;     // 429, per span (never split: the span isn't the problem)
  const RATE_WAIT_MS = 2000;  // 2, 4, 8, 15, 15, 15 s
  const RATE_WAIT_MAX = 15000;
  const CACHE_VERSION = 1;
  const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
  const DB_NAME = 'contextclimate-climo', STORE = 'climo';

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function statusOf(err) {
    const m = /HTTP (\d{3})/.exec(String(err && err.message));
    return m ? +m[1] : null;
  }
  // Transient = worth retrying: 5xx, 408, 425, or a network-level failure.
  function isTransient(err) {
    if (err instanceof TypeError) return true;
    const s = statusOf(err);
    return s !== null && (s >= 500 || s === 408 || s === 425);
  }

  // Lines from the column header on (first chunk) or after it (later chunks).
  function bodyFrom(text, keepHeader) {
    const lines = text.split('\n');
    const h = lines.findIndex(l => l.startsWith('station,'));
    if (h < 0) return '';
    return lines.slice(keepHeader ? h : h + 1).join('\n');
  }

  class Stale extends Error {}

  async function fetchRangeChunked(fetchRange, y1, y2, opts = {}) {
    const isStale = opts.isStale || (() => false);
    const onProgress = opts.onProgress || (() => {});
    const totalYears = y2 - y1 + 1;
    let doneYears = 0;

    const spans = [];
    for (let a = y1; a <= y2; a += CHUNK_YEARS) spans.push([a, Math.min(y2, a + CHUNK_YEARS - 1)]);
    const results = new Map();   // span start year -> csv text

    async function getSpan(a, b) {
      let lastErr, attempt = 0, rateHits = 0;
      while (true) {
        if (isStale()) throw new Stale();
        try {
          const text = await fetchRange(a, b);
          return [[a, text]];
        } catch (e) {
          lastErr = e;
          if (statusOf(e) === 429) {              // rate limited: wait, same span
            if (rateHits >= RATE_RETRIES) throw e;
            await sleep(Math.min(RATE_WAIT_MAX, RATE_WAIT_MS * 2 ** rateHits++));
            continue;
          }
          if (!isTransient(e)) throw e;
          if (b > a) break;                       // split instead of retrying a big span
          if (attempt >= RETRIES) break;
          await sleep(BACKOFF_MS * 2 ** attempt++);
        }
      }
      if (b > a) {
        const mid = Math.floor((a + b) / 2);
        const left = await getSpan(a, mid);
        const right = await getSpan(mid + 1, b);
        return left.concat(right);
      }
      throw lastErr;
    }

    try {
      for (const [a, b] of spans) {               // sequential: IEM allows one request at a time
        const parts = await getSpan(a, b);
        for (const [start, text] of parts) results.set(start, text);
        doneYears += b - a + 1;
        if (!isStale()) onProgress(doneYears, totalYears);
      }
    } catch (e) {
      if (e instanceof Stale) return null;
      throw e;
    }
    if (isStale()) return null;

    const starts = [...results.keys()].sort((p, q) => p - q);
    let first = true;
    const pieces = [];
    for (const s of starts) {
      const body = bodyFrom(results.get(s), first);
      if (!body) continue;
      pieces.push(body);
      first = false;
    }
    return pieces.join('\n');
  }

  // ── IndexedDB cache of finished aggregates ──
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      }).catch(() => null);
    }
    return dbPromise;
  }
  const key = (tool, station, y1, y2) => `${tool}|${station}|${y1}-${y2}|v${CACHE_VERSION}`;

  async function cacheGet(tool, station, y1, y2) {
    try {
      const d = await db(); if (!d) return null;
      const rec = await new Promise((resolve, reject) => {
        const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key(tool, station, y1, y2));
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      if (!rec || Date.now() - rec.savedAt > CACHE_TTL_MS) return null;
      return rec.data;
    } catch (e) { return null; }
  }

  async function cacheSet(tool, station, y1, y2, data) {
    try {
      const d = await db(); if (!d) return;
      await new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ savedAt: Date.now(), data }, key(tool, station, y1, y2));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } catch (e) { /* storage unavailable: the next visit fetches again */ }
  }

  window.IEMClimo = { fetchRangeChunked, cacheGet, cacheSet };
})();
