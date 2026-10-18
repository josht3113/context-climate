/* ════════════════════════════════════════════════════════════════════
   CONTEXTCLIMATE — SHARED SOLAR ENGINE
   Lives flat in public/ next to the tools that load it:
     <script src="solar-engine.js"></script>
   Used by the Solar Calendar and the Sunrise & Sunset Calendar.

   Sun position: NOAA Solar Calculator formulation (Meeus, Astronomical
   Algorithms), the same equations as solar-heatmap.html. Verified against
   NREL SPA (pvlib) — see claude/solar-calendars-notes.md in the Project.
   Time zones: IANA database through the browser's Intl API, so DST rules
   are correct for any place and any year the browser knows.

   Conventions
     lon   degrees east (negative = west)
     day   0-based local calendar day of the year
     times minutes after local midnight (clock time when a zone is given,
           local apparent solar time when it is not); may fall outside
           0–1440 when an event crosses midnight
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const H0 = -0.833;                       // sunrise/sunset: refraction + solar semidiameter
const TWILIGHT = { civil: -6, nautical: -12, astro: -18 };

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = y => isLeap(y) ? 366 : 365;
const MDAYS = y => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dayToMD(y, day) { const md = MDAYS(y); let m = 0, d = day; while (d >= md[m]) { d -= md[m]; m++; } return { m: m + 1, d: d + 1 }; }
function mdToDay(y, m, d) { const md = MDAYS(y); let n = d - 1; for (let i = 0; i < m - 1; i++) n += md[i]; return n; }
const jd0 = y => Date.UTC(y, 0, 1) / 86400000 + 2440587.5;   // JD at Jan 1 00:00 UTC

function sunCoords(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const om = (125.04 - 1934.136 * T) * RAD;
  const lam = trueLong - 0.00569 - 0.00478 * Math.sin(om);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(om)) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam * RAD));
  const y = Math.tan(eps / 2) ** 2, L = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L) - 2 * e * Math.sin(Mr)
            + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L)
            - 0.5 * y * y * Math.sin(4 * L) - 1.25 * e * e * Math.sin(2 * Mr));
  return { dec, eot, lam: ((lam % 360) + 360) % 360 };
}

/* Per-year lookup table, 8 samples per day, 3 days of padding each side */
const TSTEP = 8, TPAD = 3, TABLES = {};
function table(year) {
  if (TABLES[year]) return TABLES[year];
  const N = (daysIn(year) + 2 * TPAD) * TSTEP + 1, J = jd0(year);
  const dec = new Float64Array(N), eot = new Float64Array(N);
  for (let i = 0; i < N; i++) { const s = sunCoords(J + i / TSTEP - TPAD); dec[i] = s.dec; eot[i] = s.eot; }
  const t = { dec, eot, N };
  const at = (arr, fd) => { let x = (fd + TPAD) * TSTEP; if (x < 0) x = 0; else if (x > N - 1.001) x = N - 1.001; const i = x | 0, f = x - i; return arr[i] + f * (arr[i + 1] - arr[i]); };
  t.decAt = fd => at(dec, fd); t.eotAt = fd => at(eot, fd);
  return (TABLES[year] = t);
}

/* Solstices & equinoxes: Meeus, Astronomical Algorithms ch. 27 (mean instant
   + 24 periodic terms), TT converted to UT with the Espenak & Meeus ΔT
   polynomials. fd = fractional days since Jan 1 00:00 UTC of that year. */
const EQ_TERMS = [[485,324.96,1934.136],[203,337.23,32964.467],[199,342.08,20.186],[182,27.85,445267.112],
  [156,73.14,45036.886],[136,171.52,22518.443],[77,222.54,65928.934],[74,296.72,3034.906],[70,243.58,9037.513],
  [58,119.81,33718.147],[52,297.17,150.678],[50,21.02,2281.226],[45,247.54,29929.562],[44,325.15,31555.956],
  [29,60.93,4443.417],[18,155.12,67555.328],[17,288.79,4562.452],[16,198.04,62894.029],[14,199.76,31436.921],
  [12,95.39,14577.848],[12,287.11,31931.756],[12,320.81,34777.259],[9,227.73,1222.114],[8,15.45,16859.074]];
const EQ_MEAN = {
  mar: [2451623.80984, 365242.37404,  0.05169, -0.00411, -0.00057],
  jun: [2451716.56767, 365241.62603,  0.00325,  0.00888, -0.00030],
  sep: [2451810.21715, 365242.01767, -0.11575,  0.00337,  0.00078],
  dec: [2451900.05952, 365242.74049, -0.06223, -0.00823,  0.00032],
};
function deltaT(y) {                     // seconds, Espenak & Meeus (NASA)
  let t;
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119*t - 0.0598939*t*t + 0.0061966*t**3 - 0.000197*t**4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493*t - 0.0761*t*t + 0.0020936*t**3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407*t - t*t/233 + t**3/2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067*t - t*t/260 - t**3/718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345*t - 0.060374*t*t + 0.0017275*t**3 + 0.000651814*t**4 + 0.00002373599*t**5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217*t + 0.005589*t*t; }
  return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
}
const EVENTS = {};
function events(year) {
  if (EVENTS[year]) return EVENTS[year];
  const Y = (year - 2000) / 1000, J = jd0(year);
  const out = ['mar', 'jun', 'sep', 'dec'].map(key => {
    const c = EQ_MEAN[key];
    const jde0 = c[0] + c[1]*Y + c[2]*Y*Y + c[3]*Y**3 + c[4]*Y**4;
    const T = (jde0 - 2451545) / 36525, W = (35999.373 * T - 2.47) * RAD;
    const dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
    let S = 0; for (const [A, B, C] of EQ_TERMS) S += A * Math.cos((B + C * T) * RAD);
    const jd = jde0 + 0.00001 * S / dl - deltaT(year) / 86400;
    const fd = jd - J;
    return { key, fd, utc: new Date(Date.UTC(year, 0, 1) + fd * 86400000) };
  });
  return (EVENTS[year] = out);
}

/* Clock offset from UTC (minutes) on each local day, sampled near local noon */
const TZC = {};
function tzOffsets(tz, year, lon) {
  const key = tz + '|' + year;
  if (TZC[key]) return TZC[key];
  const fL = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  const fS = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
  const part = (f, dt) => f.formatToParts(dt).find(p => p.type === 'timeZoneName').value;
  const n = daysIn(year), off = new Int16Array(n), abbr = new Array(n);
  for (let d = 0; d < n; d++) {
    const dt = new Date(Date.UTC(year, 0, 1 + d, 12) - (lon || 0) / 15 * 3600000);
    const mm = part(fL, dt).match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    off[d] = mm ? (mm[1] === '-' ? -1 : 1) * (+mm[2] * 60 + (+mm[3] || 0)) : 0;
    abbr[d] = part(fS, dt);
  }
  let std = off[0]; for (const o of off) if (o < std) std = o;
  const changes = [];
  for (let d = 1; d < n; d++) if (off[d] !== off[d - 1]) changes.push({ day: d, from: off[d - 1], to: off[d] });
  return (TZC[key] = { off, abbr, std, changes });
}

/* Altitude crossing for local day d. Returns {rise,set} in true solar minutes,
   or {up:true} / {down:true} when the sun stays above / below h0 all day. */
function crossing(t, d, latR, lon, h0) {
  const sh = Math.sin(h0 * RAD), sl = Math.sin(latR), cl = Math.cos(latR);
  const fdOf = tst => { const fd0 = d + (tst - 4 * lon) / 1440; return fd0 - t.eotAt(fd0) / 1440; };
  const solve = sign => {
    let tst = 720, dec = t.decAt(fdOf(720)), c;
    for (let k = 0; k < 4; k++) {
      c = (sh - sl * Math.sin(dec)) / (cl * Math.cos(dec));
      if (c < -1 || c > 1) return null;
      tst = 720 + sign * 4 * Math.acos(c) * DEG;
      dec = t.decAt(fdOf(tst));
    }
    return tst;
  };
  const r = solve(-1), s = solve(1);
  if (r !== null && s !== null) return { rise: r, set: s };
  const dec = t.decAt(fdOf(720));
  const c = (sh - sl * Math.sin(dec)) / (cl * Math.cos(dec));
  return c < -1 ? { up: true } : { down: true };
}

/* Full year model for a place.
   place: {lat, lon, tz?}  — without tz, times are local apparent solar time. */
function buildYear(place, year) {
  const t = table(year), n = daysIn(year), latR = place.lat * RAD, lon = place.tz ? place.lon : 0;
  const zone = place.tz ? tzOffsets(place.tz, year, place.lon) : null;
  // true solar minutes → local clock minutes for day d
  const toClock = (d, tst) => {
    if (!zone) return tst;
    const fd0 = d + (tst - 4 * lon) / 1440, fd = fd0 - t.eotAt(fd0) / 1440;
    return (fd - d) * 1440 + zone.off[d];
  };
  const days = new Array(n);
  const cross = (d, h) => { const c = crossing(t, d, latR, lon, h); return c.rise !== undefined ? { rise: toClock(d, c.rise), set: toClock(d, c.set) } : c; };
  const lenOf = c => c.rise !== undefined ? c.set - c.rise : (c.up ? 1440 : 0);
  let prevLen = lenOf(cross(-1, H0));
  for (let d = 0; d < n; d++) {
    const fdn = d + (720 - 4 * lon) / 1440, dec = t.decAt(fdn), eot = t.eotAt(fdn);
    const sun = cross(d, H0), len = lenOf(sun);
    const tw = {};
    for (const k in TWILIGHT) tw[k] = cross(d, TWILIGHT[k]);
    const noonAlt = Math.asin(Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec)) * DEG;
    const { m, d: dd } = dayToMD(year, d);
    days[d] = {
      day: d, m, d: dd,
      rise: sun.rise, set: sun.set, up: !!sun.up, down: !!sun.down,
      noon: toClock(d, 720), noonAlt, len, change: len - prevLen,
      dec: dec * DEG, eot, tw, off: zone ? zone.off[d] : null, dst: zone ? zone.off[d] !== zone.std : false,
    };
    prevLen = len;
  }
  return { place, year, days, zone, events: events(year) };
}

/* Local calendar day of a UTC instant at a place (solar day when no zone) */
function localDayOf(year, fd, place) {
  const zone = place.tz ? tzOffsets(place.tz, year, place.lon) : null;
  const guess = Math.floor(fd);
  const off = zone ? zone.off[Math.max(0, Math.min(zone.off.length - 1, guess))] : (place.lon || 0) * 4;
  const local = fd + off / 1440;
  return { day: Math.floor(local), minute: (local - Math.floor(local)) * 1440 };
}

/* Shared place list — global cities (station-roster.js adds US stations) */
const WORLD = [
  ['North Pole',              90.00,    0.00, 'UTC',                  'Polar'],
  ['Longyearbyen, Svalbard',  78.22,   15.65, 'Arctic/Longyearbyen',  'Polar'],
  ['Utqiaġvik, AK',           71.29, -156.79, 'America/Anchorage',    'Polar'],
  ['Tromsø, Norway',          69.65,   18.96, 'Europe/Oslo',          'Polar'],
  ['Fairbanks, AK',           64.84, -147.72, 'America/Anchorage',    'Sub-Arctic'],
  ['Reykjavik, Iceland',      64.15,  -21.94, 'Atlantic/Reykjavik',   'Sub-Arctic'],
  ['Anchorage, AK',           61.22, -149.90, 'America/Anchorage',    'Sub-Arctic'],
  ['Helsinki, Finland',       60.17,   24.94, 'Europe/Helsinki',      'Sub-Arctic'],
  ['Oslo, Norway',            59.91,   10.75, 'Europe/Oslo',          'Sub-Arctic'],
  ['Moscow, Russia',          55.76,   37.62, 'Europe/Moscow',        'Europe'],
  ['Amsterdam, Netherlands',  52.37,    4.90, 'Europe/Amsterdam',     'Europe'],
  ['London, UK',              51.51,   -0.13, 'Europe/London',        'Europe'],
  ['Paris, France',           48.86,    2.35, 'Europe/Paris',         'Europe'],
  ['Rome, Italy',             41.90,   12.50, 'Europe/Rome',          'Europe'],
  ['Madrid, Spain',           40.42,   -3.70, 'Europe/Madrid',        'Europe'],
  ['Kashgar, China',          39.47,   75.99, 'Asia/Shanghai',        'Asia'],
  ['Beijing, China',          39.90,  116.41, 'Asia/Shanghai',        'Asia'],
  ['Tokyo, Japan',            35.68,  139.69, 'Asia/Tokyo',           'Asia'],
  ['Cairo, Egypt',            30.04,   31.24, 'Africa/Cairo',         'Africa & Middle East'],
  ['Dubai, UAE',              25.20,   55.27, 'Asia/Dubai',           'Africa & Middle East'],
  ['Mumbai, India',           19.08,   72.88, 'Asia/Kolkata',         'Asia'],
  ['Mexico City, Mexico',     19.43,  -99.13, 'America/Mexico_City',  'Americas'],
  ['Singapore',                1.35,  103.82, 'Asia/Singapore',       'Equatorial'],
  ['Quito, Ecuador',          -0.18,  -78.47, 'America/Guayaquil',    'Equatorial'],
  ['Nairobi, Kenya',          -1.29,   36.82, 'Africa/Nairobi',       'Equatorial'],
  ['São Paulo, Brazil',      -23.55,  -46.63, 'America/Sao_Paulo',    'Southern Hemisphere'],
  ['Cape Town, South Africa', -33.92,   18.42, 'Africa/Johannesburg',  'Southern Hemisphere'],
  ['Sydney, Australia',      -33.87,  151.21, 'Australia/Sydney',     'Southern Hemisphere'],
  ['Buenos Aires, Argentina', -34.60,  -58.38, 'America/Argentina/Buenos_Aires', 'Southern Hemisphere'],
  ['Hobart, Australia',      -42.88,  147.33, 'Australia/Hobart',     'Southern Hemisphere'],
  ['Ushuaia, Argentina',     -54.80,  -68.30, 'America/Argentina/Ushuaia', 'Southern Hemisphere'],
  ['McMurdo Station',        -77.85,  166.67, 'Antarctica/McMurdo',   'Polar'],
  ['South Pole',             -90.00,    0.00, 'UTC',                  'Polar'],
].map(([name, lat, lon, tz, group]) => ({ id: 'w:' + name, name, lat, lon, tz, group }));

const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',PR:'Puerto Rico',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };

/* World cities + every station in station-roster.js (when loaded) */
function places() {
  const out = WORLD.slice();
  if (typeof STATION_ROSTER !== 'undefined') {
    for (const [id, name, st, lat, lon, code] of STATION_ROSTER) {
      const tz = typeof stationIANA === 'function' ? stationIANA(id, code) : null;
      out.push({ id: 's:' + id, name: `${name}, ${st}`, short: id, lat, lon, tz, group: 'US · ' + (STATE_NAMES[st] || st) });
    }
  }
  return out;
}

const api = { RAD, DEG, H0, TWILIGHT, isLeap, daysIn, dayToMD, mdToDay, sunCoords, table, events, tzOffsets, buildYear, localDayOf, places, WORLD };
root.SolarEngine = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
