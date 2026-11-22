/* ═══════════════════════════════════════════════════════════
   surface-obs.js — hourly surface observations for contextclimate.io maps
   ───────────────────────────────────────────────────────────
   Needs station-model.js (window.STATION_MODEL) loaded first.

     load(stations, opts)        → Promise<Map id → [{t, ob, raw}]>
         stations: [{id}]; opts: {start, end, metarIds:Set, signal, onProgress}
         One IEM asos.py request per chunk (routine METARs only). Stations
         in metarIds get the raw METAR (full station model); the rest get
         tmpf / dwpf / mslp / alti only, which is all an analysis needs.
     merge(a, b)                 → a with b's reports added (time-sorted, de-duplicated)
     pick(list, H)               → the report for clock hour H: closest to H−5 min
                                   within (H−40 min, H+15 min]
     latestHour(lists, now)      → newest hour at least half the stations have reported
     buddyReject(pts, thr)       → Set of ids whose value disagrees with every neighbour
     wxWords(codes)              → "Light rain, mist"
     decodeMetar(raw, info)      → {rows:[{label,text,parts}], tok:[{s,r}]}
   ═══════════════════════════════════════════════════════════ */
window.SURFACE_OBS = (function () {
  'use strict';
  const SM = window.STATION_MODEL;
  const HOUR = 3600e3, KT = 1.15078;
  const IEM = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?';
  const CHUNK = { metar: 300, fields: 400 };

  const stamp = (n, d) => `year${n}=${d.getUTCFullYear()}&month${n}=${d.getUTCMonth() + 1}&day${n}=${d.getUTCDate()}&hour${n}=${d.getUTCHours()}&minute${n}=${d.getUTCMinutes()}`;
  function url(ids, start, end, mode) {
    const data = mode === 'metar' ? 'data=metar' : 'data=tmpf&data=dwpf&data=mslp&data=alti';
    return IEM + ids.map(id => 'station=' + id).join('&') + `&${data}&${stamp(1, start)}&${stamp(2, end)}`
      + '&tz=UTC&format=onlycomma&latlon=yes&missing=empty&trace=T&direct=no&report_type=3';
  }

  // Rows as objects; a METAR containing commas is rejoined into the last column.
  function parse(text) {
    const rows = []; let head = null;
    for (const line of text.split('\n')) {
      const t = line.trim(); if (!t || t[0] === '#') continue;
      let p = t.split(',');
      if (!head || p[0] === 'station') { head = p; continue; }
      if (p.length > head.length) p = p.slice(0, head.length - 1).concat(p.slice(head.length - 1).join(','));
      const o = {}; head.forEach((k, i) => { o[k] = (p[i] || '').trim(); }); rows.push(o);
    }
    return rows;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function get(u, signal) {
    let err;
    for (let a = 0; a < 4; a++) {
      if (a) await sleep(1200 * Math.pow(2, a - 1));
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      let r;
      try { r = await fetch(u, { signal }); }
      catch (e) { if (signal && signal.aborted) throw e; err = e; continue; }
      if (r.ok) return r.text();
      err = new Error('IEM HTTP ' + r.status);
      if (!(r.status >= 500 || [408, 425, 429].includes(r.status))) throw err;
    }
    throw err;
  }

  // Values a report can't physically carry are dropped before anything is drawn.
  function sane(ob) {
    if (ob.tempC != null && (ob.tempC < -62 || ob.tempC > 57)) ob.tempC = null;
    if (ob.dewC != null && (ob.dewC < -68 || ob.dewC > 36 || (ob.tempC != null && ob.dewC > ob.tempC + 0.6))) ob.dewC = null;
    if (ob.wind && (ob.wind.kt > 130 || (ob.wind.gust != null && ob.wind.gust > 170))) ob.wind = null;
    if (ob.slp != null && (ob.slp < 900 || ob.slp > 1085)) ob.slp = null;
    if (ob.altMb != null && (ob.altMb < 850 || ob.altMb > 1090)) ob.altMb = null;
    return ob;
  }
  const num = s => { if (s === '' || s == null || s === 'M') return null; const v = parseFloat(s); return isFinite(v) ? v : null; };
  function fromFields(r, ts) {
    const f = num(r.tmpf), d = num(r.dwpf), a = num(r.alti);
    return { ts, tempC: f != null ? (f - 32) * 5 / 9 : null, dewC: d != null ? (d - 32) * 5 / 9 : null,
      slp: num(r.mslp), altMb: a != null ? a * 33.8639 : null, wind: null, sky: null, wx: [], ww: 0, fieldsOnly: true };
  }

  async function load(stations, opts = {}) {
    const { start, end, metarIds = new Set(), signal, onProgress } = opts;
    const byKey = new Map();
    for (const s of stations) { byKey.set(s.id, s); if (s.id.length === 4 && s.id[0] === 'K') byKey.set(s.id.slice(1), s); }
    const jobs = [];
    const add = (ids, mode) => { for (let i = 0; i < ids.length; i += CHUNK[mode]) jobs.push({ ids: ids.slice(i, i + CHUNK[mode]), mode }); };
    add(stations.filter(s => metarIds.has(s.id)).map(s => s.id), 'metar');
    add(stations.filter(s => !metarIds.has(s.id)).map(s => s.id), 'fields');
    const out = new Map(); let done = 0, failed = 0;
    const run = async job => {
      let text;
      try { text = await get(url(job.ids, start, end, job.mode), signal); }
      catch (e) { if (e.name === 'AbortError') throw e; failed++; console.warn('Observations chunk failed:', e); return; }
      for (const r of parse(text)) {
        const s = byKey.get(r.station); if (!s) continue;
        const t = Date.parse(r.valid.replace(' ', 'T') + ':00Z'); if (isNaN(t)) continue;
        const lat = num(r.lat), lon = num(r.lon);
        if (lat != null && lon != null) { s.lat = lat; s.lon = lon; }
        const ts = new Date(t).toISOString();
        let ob;
        if (job.mode === 'metar') { if (!r.metar) continue; ob = SM.fromMetar(r.metar, { lon: s.lon, lat: s.lat, ts }); }
        else ob = fromFields(r, ts);
        ob.id = s.id; sane(ob);
        if (!out.has(s.id)) out.set(s.id, []);
        out.get(s.id).push({ t, ob, raw: job.mode === 'metar' ? r.metar : null });
      }
      done++; if (onProgress) onProgress(done, jobs.length);
    };
    // two requests at a time: IEM sheds bursts
    let k = 0;
    const lane = async () => { while (k < jobs.length) { const j = jobs[k++]; await run(j); } };
    await Promise.all([lane(), lane()]);
    for (const l of out.values()) l.sort((a, b) => a.t - b.t);
    if (failed === jobs.length && jobs.length) throw new Error('No observations returned');
    out.failed = failed;
    return out;
  }

  function merge(a, b) {
    for (const [id, l] of b) {
      if (!a.has(id)) { a.set(id, l); continue; }
      const seen = new Set(a.get(id).map(o => o.t)), m = a.get(id).concat(l.filter(o => !seen.has(o.t)));
      m.sort((x, y) => x.t - y.t); a.set(id, m);
    }
    return a;
  }

  function pick(list, H) {
    if (!list) return null;
    let best = null, bd = Infinity;
    for (const o of list) {
      if (o.t <= H - 40 * 60e3 || o.t > H + 15 * 60e3) continue;
      const d = Math.abs(o.t - (H - 5 * 60e3)); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function latestHour(lists, now = Date.now()) {
    const all = [...lists.values()]; if (!all.length) return null;
    for (let H = Math.ceil(now / HOUR) * HOUR + HOUR; H > now - 6 * HOUR; H -= HOUR) {
      if (all.filter(l => pick(l, H)).length >= Math.max(1, all.length * 0.5)) return H;
    }
    return null;
  }

  // Buddy check: a value is rejected when it sits more than `thr` from the median
  // of its 8 nearest neighbours (within 150 mi, at least 3) and outside their range.
  function hav(a, b) {
    const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const q = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(q));
  }
  function buddyReject(pts, thr) {
    const bad = new Set();
    for (const p of pts) {
      const nb = [];
      for (const q of pts) if (q !== p) { const d = hav(p, q); if (d <= 150) nb.push([d, q.v]); }
      if (nb.length < 3) continue;
      nb.sort((a, b) => a[0] - b[0]);
      const v = nb.slice(0, 8).map(x => x[1]).sort((a, b) => a - b), m = v[v.length >> 1];
      if (Math.abs(p.v - m) > thr && (p.v < v[0] - thr / 2 || p.v > v[v.length - 1] + thr / 2)) bad.add(p.id);
    }
    return bad;
  }

  // ── Plain-language METAR ───────────────────────────
  const WX_PHEN = { RA: 'rain', DZ: 'drizzle', SN: 'snow', SG: 'snow grains', PL: 'sleet', IC: 'ice crystals', GR: 'hail', GS: 'small hail', UP: 'precipitation', FG: 'fog', BR: 'mist', HZ: 'haze', FU: 'smoke', DU: 'dust', SA: 'sand', SQ: 'squalls', VA: 'volcanic ash', FC: 'funnel cloud', SS: 'sandstorm', DS: 'dust storm', PO: 'dust whirls' };
  function wxWords(codes) {
    if (!codes) return '';
    const out = [];
    for (const tok of codes.toUpperCase().split(/\s+/)) {
      const m = /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:[A-Z]{2})*)$/.exec(tok); if (!m) continue;
      const inten = m[1] === '-' ? 'light ' : m[1] === '+' ? 'heavy ' : '';
      const ph = (m[3].match(/../g) || []).map(p => WX_PHEN[p]).filter(Boolean);
      let s;
      if (m[2] === 'TS') s = ph.length ? 'thunderstorm with ' + inten + ph.join(' and ') : 'thunderstorm';
      else {
        const d = { SH: ' showers', FZ: 'freezing ', BL: 'blowing ', DR: 'drifting ', MI: 'shallow ', BC: 'patchy ', PR: 'partial ' }[m[2]] || '';
        if (!ph.length) continue;
        s = m[2] === 'SH' ? inten + ph.join(' and ') + d : inten + d + ph.join(' and ');
      }
      if (m[1] === 'VC') s += ' nearby';
      out.push(s);
    }
    const t = out.join(', '); return t ? t[0].toUpperCase() + t.slice(1) : '';
  }

  const CARD16 = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
  const COVER_TXT = { FEW: 'Few clouds', SCT: 'Scattered clouds', BKN: 'Broken clouds', OVC: 'Overcast' };
  const c2f = c => Math.round(c * 9 / 5 + 32);
  const fmtFt = h => (h * 100).toLocaleString('en-US') + ' ft';
  const inHund = s => { const v = +s / 100; return v === 0 ? 'trace' : v.toFixed(2) + '"'; };
  const tTenth = (s, v) => (s === '1' ? -1 : 1) * (+v) / 10;

  // info: {name, st, t (ms of the report), fmtTime(ms) → local clock string}
  function decodeMetar(raw, info = {}) {
    const fmt = info.fmtTime || (ms => new Date(ms).toISOString().slice(11, 16) + ' UTC');
    const ref = info.t || Date.now();
    const ZH = (hh, mm) => { const d = new Date(ref); d.setUTCHours(+hh, +mm, 0, 0); if (d.getTime() - ref > 6 * HOUR) d.setUTCDate(d.getUTCDate() - 1); return fmt(d.getTime()); };
    const T = raw.replace(/=$/, '').trim().split(/\s+/), rows = [], tok = T.map(s => ({ s, r: -1 }));
    const add = (idx, label, text, parts) => { const r = rows.length; rows.push({ label, text, parts: parts || [] }); idx.forEach(i => { tok[i].r = r; }); };
    let i = 0, rmk = false;
    while (i < T.length) {
      const s = T[i]; let m;
      if (!rmk) {
        if (i === 0 && (s === 'METAR' || s === 'SPECI')) { add([i], 'Report', s === 'METAR' ? 'Routine report' : 'Special report, issued when conditions change'); i++; continue; }
        if (/^[A-Z][A-Z0-9]{3}$/.test(s) && !rows.some(r => r.label === 'Station') && !/^(AUTO|CAVOK|NOSIG)$/.test(s)) { add([i], 'Station', info.name ? info.name + (info.st ? ', ' + info.st : '') : s); i++; continue; }
        if ((m = s.match(/^(\d{2})(\d{2})(\d{2})Z$/))) { add([i], 'Time', `Day ${+m[1]}, ${m[2]}:${m[3]} UTC (${ZH(m[2], m[3])})`); i++; continue; }
        if (s === 'AUTO') { add([i], 'Automated', 'No human observer'); i++; continue; }
        if (s === 'COR') { add([i], 'Corrected', 'Corrects an earlier report'); i++; continue; }
        if ((m = s.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/))) {
          const kt = +m[2], g = m[3] ? +m[3] : null, dir = m[1];
          let t = kt === 0 ? 'Calm' : (dir === 'VRB' ? 'Variable direction' : `From the ${CARD16[Math.round(+dir / 22.5) % 16]} (${+dir}°)`) + ` at ${kt} kt (${Math.round(kt * KT)} mph)`;
          if (g) t += `, gusting to ${g} kt (${Math.round(g * KT)} mph)`;
          add([i], 'Wind', t, g ? ['wind', 'gust'] : ['wind']); i++; continue;
        }
        if ((m = s.match(/^(\d{3})V(\d{3})$/))) { add([i], 'Wind direction', `Varying between ${+m[1]}° and ${+m[2]}°`, ['wind']); i++; continue; }
        if (/^\d$/.test(s) && /^\d\/\d{1,2}SM$/.test(T[i + 1] || '')) { add([i, i + 1], 'Visibility', `${s} ${T[i + 1].slice(0, -2)} miles`, ['vis']); i += 2; continue; }
        if ((m = s.match(/^([MP])?(\d+\/\d+|\d+)SM$/))) { const v = m[2]; add([i], 'Visibility', (m[1] === 'M' ? 'Less than ' : '') + v + (v === '1' || v.includes('/') ? ' mile' : ' miles') + (m[1] === 'P' ? ' or more' : ''), ['vis']); i++; continue; }
        if (/^R\d{2}[LCR]?\//.test(s)) { add([i], 'Runway visual range', s.replace(/FT$/, ' ft')); i++; continue; }
        if ((m = s.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))) { add([i], 'Clouds', `${COVER_TXT[m[1]]} at ${fmtFt(+m[2])}${m[3] === 'CB' ? ', cumulonimbus' : m[3] === 'TCU' ? ', towering cumulus' : ''}`, ['sky']); i++; continue; }
        if ((m = s.match(/^VV(\d{3})$/))) { add([i], 'Clouds', `Sky obscured, vertical visibility ${fmtFt(+m[1])}`, ['sky']); i++; continue; }
        if (/^(CLR|SKC|NCD|NSC)$/.test(s)) { add([i], 'Clouds', s === 'CLR' ? 'No clouds below 12,000 ft' : 'No clouds', ['sky']); i++; continue; }
        if ((m = s.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
          const tc = (m[1][0] === 'M' ? -1 : 1) * +m[1].replace('M', ''), dc = m[2] != null ? (m[2][0] === 'M' ? -1 : 1) * +m[2].replace('M', '') : null;
          add([i], 'Temperature / dewpoint', `${tc} °C (${c2f(tc)} °F)` + (dc != null ? ` / ${dc} °C (${c2f(dc)} °F)` : ''), dc != null ? ['temp', 'dew'] : ['temp']); i++; continue;
        }
        if ((m = s.match(/^A(\d{4})$/))) { const inhg = +m[1] / 100; add([i], 'Altimeter', `${inhg.toFixed(2)} inHg (${(inhg * 33.8639).toFixed(1)} mb)`); i++; continue; }
        if (/^(?:[-+]|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ){0,2}(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*$/.test(s) && /[A-Z]{2}/.test(s)) { add([i], 'Weather', wxWords(s) || s, ['wx']); i++; continue; }
        if (s === 'RMK') { add([i], 'Remarks', 'Remarks follow'); rmk = true; i++; continue; }
        add([i], 'Group', s); i++; continue;
      }
      if (s === 'AO1' || s === 'AO2') { add([i], 'Station type', s === 'AO2' ? 'Automated, with a precipitation sensor' : 'Automated, without a precipitation sensor'); i++; continue; }
      if ((m = s.match(/^SLP(\d{3})$/))) { const v = +m[1] / 10, mb = v < 50 ? 1000 + v : 900 + v; add([i], 'Sea-level pressure', mb.toFixed(1) + ' mb', ['slp']); i++; continue; }
      if (s === 'SLPNO') { add([i], 'Sea-level pressure', 'Not available'); i++; continue; }
      if ((m = s.match(/^T([01])(\d{3})(?:([01])(\d{3}))?$/))) {
        const tc = tTenth(m[1], m[2]), dc = m[3] != null ? tTenth(m[3], m[4]) : null;
        add([i], 'Temperature / dewpoint, tenths', `${tc.toFixed(1)} °C (${(tc * 9 / 5 + 32).toFixed(1)} °F)` + (dc != null ? ` / ${dc.toFixed(1)} °C (${(dc * 9 / 5 + 32).toFixed(1)} °F)` : ''), dc != null ? ['temp', 'dew'] : ['temp']); i++; continue;
      }
      if ((m = s.match(/^([12])([01])(\d{3})$/))) { const tc = tTenth(m[2], m[3]); add([i], m[1] === '1' ? '6-hour maximum' : '6-hour minimum', `${tc.toFixed(1)} °C (${(tc * 9 / 5 + 32).toFixed(1)} °F)`); i++; continue; }
      if ((m = s.match(/^4([01])(\d{3})([01])(\d{3})$/))) { const a = tTenth(m[1], m[2]), b = tTenth(m[3], m[4]); add([i], '24-hour max / min', `${(a * 9 / 5 + 32).toFixed(1)} °F / ${(b * 9 / 5 + 32).toFixed(1)} °F`); i++; continue; }
      if ((m = s.match(/^5([0-8])(\d{3})$/))) { const a = +m[1], v = +m[2] / 10, sg = a === 4 ? '' : a >= 5 ? '−' : '+'; add([i], '3-hour pressure change', `${sg}${v.toFixed(1)} mb, ${SM.TEND_LABEL[a].toLowerCase()}`, ['tend']); i++; continue; }
      if ((m = s.match(/^P(\d{4})$/))) { add([i], 'Precipitation, last hour', m[1] === '0000' ? 'Trace' : inHund(m[1])); i++; continue; }
      if ((m = s.match(/^6(\d{4}|\/{4})$/))) { const h = new Date(ref).getUTCHours(), six = h % 6 === 0 || h % 6 === 5; add([i], `Precipitation, last ${six ? 6 : 3} hours`, m[1] === '////' ? 'Amount not determined' : m[1] === '0000' ? 'Trace' : inHund(m[1])); i++; continue; }
      if ((m = s.match(/^7(\d{4})$/))) { add([i], 'Precipitation, last 24 hours', m[1] === '0000' ? 'Trace' : inHund(m[1])); i++; continue; }
      if ((m = s.match(/^4\/(\d{3})$/))) { add([i], 'Snow depth', +m[1] + ' in'); i++; continue; }
      if ((m = s.match(/^933(\d{3})$/))) { add([i], 'Snow water equivalent', (+m[1] / 10).toFixed(1) + ' in'); i++; continue; }
      if ((m = s.match(/^931(\d{3})$/))) { add([i], 'Snowfall, last 6 hours', (+m[1] / 10).toFixed(1) + ' in'); i++; continue; }
      if ((m = s.match(/^98(\d{3})$/))) { add([i], 'Sunshine', +m[1] + ' minutes'); i++; continue; }
      if (s === 'PK' && T[i + 1] === 'WND' && (m = (T[i + 2] || '').match(/^(\d{3})(\d{2,3})\/(\d{2})?(\d{2})$/))) {
        add([i, i + 1, i + 2], 'Peak wind', `${Math.round(+m[2] * KT)} mph from ${+m[1]}° at ` + (m[3] ? ZH(m[3], m[4]) : ':' + m[4]), ['gust']); i += 3; continue;
      }
      if (s === 'WSHFT' && (m = (T[i + 1] || '').match(/^(\d{2})?(\d{2})$/))) { const f = T[i + 2] === 'FROPA'; add(f ? [i, i + 1, i + 2] : [i, i + 1], 'Wind shift', (m[1] ? ZH(m[1], m[2]) : ':' + m[2]) + (f ? ', frontal passage' : ''), ['wind']); i += f ? 3 : 2; continue; }
      if (s === 'PRESRR' || s === 'PRESFR') { add([i], 'Pressure', s === 'PRESRR' ? 'Rising rapidly' : 'Falling rapidly', ['tend']); i++; continue; }
      if ((s === 'SFC' || s === 'TWR') && T[i + 1] === 'VIS' && T[i + 2]) {
        const two = /^\d$/.test(T[i + 2]) && /^\d\/\d/.test(T[i + 3] || ''), v = two ? T[i + 2] + ' ' + T[i + 3] : T[i + 2];
        add(two ? [i, i + 1, i + 2, i + 3] : [i, i + 1, i + 2], s === 'SFC' ? 'Surface visibility' : 'Tower visibility', v + ' mi', ['vis']); i += two ? 4 : 3; continue;
      }
      if (s === 'CIG' && (m = (T[i + 1] || '').match(/^(\d{3})V(\d{3})$/))) { add([i, i + 1], 'Variable ceiling', fmtFt(+m[1]) + ' to ' + fmtFt(+m[2]), ['sky']); i += 2; continue; }
      if (s === 'VIS' && T[i + 1] && /\d/.test(T[i + 1])) { add([i, i + 1], 'Variable visibility', T[i + 1].replace('V', ' to ') + ' mi', ['vis']); i += 2; continue; }
      if (/^(PNO|PWINO|FZRANO|TSNO|RVRNO|VISNO|CHINO)$/.test(s)) { add([i], 'Sensor', ({ PNO: 'Precipitation gauge', PWINO: 'Present-weather sensor', FZRANO: 'Freezing-rain sensor', TSNO: 'Lightning detector', RVRNO: 'Runway visual range', VISNO: 'Second visibility sensor', CHINO: 'Second ceilometer' })[s] + ' not available'); i++; continue; }
      if (s === '$') { add([i], 'Maintenance', 'Station needs maintenance'); i++; continue; }
      if ((m = s.match(/^((?:[A-Z]{2,6}(?:[BE]\d{2,4})+)+)$/)) && /[BE]\d/.test(s)) {
        const out = []; s.replace(/([A-Z]{2,6})((?:[BE]\d{2,4})+)/g, (_, w, be) => { be.replace(/([BE])(\d{2,4})/g, (__, x, tt) => { out.push(`${wxWords(w) || w} ${x === 'B' ? 'began' : 'ended'} ${tt.length === 4 ? ZH(tt.slice(0, 2), tt.slice(2)) : ':' + tt}`); }); });
        add([i], 'Weather timing', out.join('; '), ['wx']); i++; continue;
      }
      add([i], 'Remark', s); i++;
    }
    return { rows, tok };
  }

  return { load, merge, pick, latestHour, buddyReject, wxWords, decodeMetar, sane, parse, url, HOUR, KT };
})();
