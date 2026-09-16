/* ══════════════════════════════════════════════════════════════════════
   MILANKOVITCH.JS — shared orbital + insolation core for ContextClimate
   ---------------------------------------------------------------------
   Used by the four Milankovitch tools:
     eccentricity-explorer.html · obliquity-explorer.html
     precession-explorer.html   · stacked-signal.html
   Load it as a sibling, before the tool's own script:
     <script src="milankovitch.js"></script>
   Lives FLAT in public/ alongside the tool HTML and core-sample-tools.css,
   same as that stylesheet — no subpath, so GitHub web upload just works.

   ORBITAL SOLUTION — Berger (1978), full series.
   47 obliquity terms, 19 eccentricity terms, 78 general-precession terms,
   as published in Berger, A. (1978), J. Atmos. Sci. 35, 2362-2367, via
   NASA GISS ORBPAR (data.giss.nasa.gov/ar5/SOLAR/ORBPAR.FOR).
   Valid to roughly +/-1 Myr; do not extend the curves past that.

   VERIFIED against the PMIP protocol orbital parameters — this
   implementation reproduces them exactly:
      0 ka   e=0.016724  eps=23.446 deg  (peri-180)=102.04 deg
      6 ka   e=0.018682  eps=24.105 deg  (peri-180)=  0.87 deg
     21 ka   e=0.018994  eps=22.949 deg  (peri-180)=114.42 deg
   ══════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var D2R = Math.PI / 180;
var TAU = 2 * Math.PI;

/* ── Berger 1978 Table 1 (2): obliquity
      [amplitude arcsec, rate arcsec/yr, phase deg] ── */
var T_OBL = [
  [-2462.2214466,31.609974,251.9025],
  [-857.3232075,32.620504,280.8325],
  [-629.3231835,24.172203,128.3057],
  [-414.2804924,31.983787,292.7252],
  [-311.7632587,44.828336,15.3747],
  [308.9408604,30.973257,263.7951],
  [-162.5533601,43.668246,308.4258],
  [-116.1077911,32.246691,240.0099],
  [101.1189923,30.599444,222.9725],
  [-67.6856209,42.681324,268.7809],
  [24.9079067,43.836462,316.7998],
  [22.5811241,47.439436,319.6024],
  [-21.1648355,63.219948,143.805],
  [-15.6549876,64.230478,172.7351],
  [15.3936813,1.01053,28.93],
  [14.6660938,7.437771,123.5968],
  [-11.7273029,55.782177,20.2082],
  [10.2742696,0.373813,40.8226],
  [6.4914588,13.218362,123.4722],
  [5.8539148,62.583231,155.6977],
  [-5.4872205,63.593761,184.6277],
  [-5.4290191,76.43831,267.2772],
  [5.160957,45.815258,55.0196],
  [5.0786314,8.448301,152.5268],
  [-4.0735782,56.792707,49.1382],
  [3.7227167,49.747842,204.6609],
  [3.3971932,12.058272,56.5233],
  [-2.8347004,75.27822,200.3284],
  [-2.6550721,65.241008,201.6651],
  [-2.5717867,64.604291,213.5577],
  [-2.4712188,1.647247,17.0374],
  [2.462541,7.811584,164.4194],
  [2.2464112,12.207832,94.5422],
  [-2.0755511,63.856665,131.9124],
  [-1.9713669,56.15599,61.0309],
  [-1.8813061,77.44884,296.2073],
  [-1.8468785,6.801054,135.4894],
  [1.8186742,62.209418,114.875],
  [1.7601888,20.656133,247.0691],
  [-1.5428851,48.344406,256.6114],
  [1.4738838,55.14546,32.1008],
  [-1.4593669,69.000539,143.6804],
  [1.4192259,11.07135,16.8784],
  [-1.181898,74.291298,160.6835],
  [1.1756474,11.047742,27.5932],
  [-1.1316126,0.636717,348.1074],
  [1.0896928,12.844549,82.6496]
];
/* ── Berger 1978 Table 4 (1): fundamental elements of the ecliptic ── */
var T_ECC = [
  [0.01860798,4.207205,28.620089],
  [0.01627522,7.346091,193.788772],
  [-0.0130066,17.857263,308.307024],
  [0.00988829,17.220546,320.199637],
  [-0.003367,16.846733,279.376984],
  [0.00333077,5.199079,87.195],
  [-0.002354,18.231076,349.129677],
  [0.00140015,26.216758,128.443387],
  [0.001007,6.359169,154.14388],
  [0.000857,16.210016,291.269597],
  [0.0006499,3.065181,114.860583],
  [0.000599,16.583829,332.092251],
  [0.000378,18.49398,296.414411],
  [-0.000337,6.190953,145.76991],
  [0.000276,18.867793,337.237063],
  [0.000182,17.425567,152.092288],
  [-0.000174,6.186001,126.839891],
  [-0.000124,18.417441,210.667199],
  [1.25e-05,0.667863,72.108838]
];
/* ── Berger 1978 Table 5 (3): general precession in longitude ── */
var T_PREC = [
  [7391.022589,31.609974,251.9025],
  [2555.1526947,32.620504,280.8325],
  [2022.7629188,24.172203,128.3057],
  [-1973.6517951,0.636717,348.1074],
  [1240.2321818,31.983787,292.7252],
  [953.8679112,3.138886,165.1686],
  [-931.7537108,30.973257,263.7951],
  [872.3795383,44.828336,15.3747],
  [606.3544732,0.991874,58.5749],
  [-496.0274038,0.373813,40.8226],
  [456.9608039,43.668246,308.4258],
  [346.946232,32.246691,240.0099],
  [-305.8412902,30.599444,222.9725],
  [249.6173246,2.147012,106.5937],
  [-199.10272,10.511172,114.5182],
  [191.0560889,42.681324,268.7809],
  [-175.2936572,13.650058,279.6869],
  [165.9068833,0.986922,39.6448],
  [161.1285917,9.874455,126.4108],
  [139.7878093,13.013341,291.5795],
  [-133.5228399,0.262904,307.2848],
  [117.0673811,0.004952,18.93],
  [104.6907281,1.142024,273.7596],
  [95.3227476,63.219948,143.805],
  [86.7824524,0.205021,191.8927],
  [86.0857729,2.151964,125.5237],
  [70.5893698,64.230478,172.7351],
  [-69.9719343,43.836462,316.7998],
  [-62.5817473,47.439436,319.6024],
  [61.5450059,1.384343,69.7526],
  [-57.9364011,7.437771,123.5968],
  [57.1899832,18.829299,217.6432],
  [-57.0236109,9.500642,85.5882],
  [-54.2119253,0.431696,156.2147],
  [53.2834147,1.16009,66.9489],
  [52.1223575,55.782177,20.2082],
  [-49.0059908,12.639528,250.7568],
  [-48.3118757,1.155138,48.0188],
  [-45.4191685,0.168216,8.3739],
  [-42.235792,1.647247,17.0374],
  [-34.7971099,10.884985,155.3409],
  [34.4623613,5.610937,94.1709],
  [-33.8356643,12.658184,221.112],
  [33.6689362,1.01053,28.93],
  [-31.2521586,1.983748,117.1498],
  [-30.8798701,14.023871,320.5095],
  [28.4640769,0.560178,262.3602],
  [-27.1960802,1.273434,336.2148],
  [27.0860736,12.021467,233.0046],
  [-26.3437456,62.583231,155.6977],
  [24.725374,63.593761,184.6277],
  [24.6732126,76.43831,267.2772],
  [24.4272733,4.28091,78.9281],
  [24.0127327,13.218362,123.4722],
  [21.7150294,17.818769,188.7132],
  [-21.5375347,8.359495,180.1364],
  [18.1148363,56.792707,49.1382],
  [-16.9603104,8.448301,152.5268],
  [-16.1765215,1.978796,98.2198],
  [15.5567653,8.863925,97.4808],
  [15.4846529,0.186365,221.5376],
  [15.2150632,8.996212,168.2438],
  [14.5047426,6.771027,161.1199],
  [-14.3873316,45.815258,55.0196],
  [13.1351419,12.002811,262.6495],
  [12.8776311,75.27822,200.3284],
  [11.9867234,65.241008,201.6651],
  [11.9385578,18.870667,294.6547],
  [11.7030822,22.009553,99.8233],
  [11.6018181,64.604291,213.5577],
  [-11.2617293,11.498094,154.1631],
  [-10.4664199,0.578834,232.7153],
  [10.433397,9.237738,138.3034],
  [-10.2377466,49.747842,204.6609],
  [10.1934446,2.147012,106.5938],
  [-10.1280191,1.196895,250.4676],
  [10.0289441,2.133898,332.3345],
  [-10.0034259,0.173168,27.3039]
];

var OBLIQ0 = 23.320556;   // Eq 5.5 (15), degrees
var PSI0   = 50.439273;   // Eq 7.5 (16), arcsec/yr
var ZETA   = 3.392506;    // Eq 7.5 (17), degrees

/* ──────────────────────────────────────────────────────────────────────
   orbit(ageBP) — the three Milankovitch parameters at a given age.
   ageBP: years before 1950, POSITIVE into the past (negative = future).
   Returns:
     e           eccentricity (dimensionless)
     obliquity   axial tilt, degrees
     longPeri    longitude of perihelion measured from the moving vernal
                 equinox, degrees. 90 = perihelion at the June solstice.
     precession  climatic precession index e*sin(longPeri). Positive =
                 perihelion in the NH summer half-year = warmer NH summers.
   ────────────────────────────────────────────────────────────────────── */
function orbit(ageBP) {
  var ym = -ageBP, i, arg, s = 0;

  for (i = 0; i < T_OBL.length; i++) {
    arg = D2R * (ym * T_OBL[i][1] / 3600 + T_OBL[i][2]);
    s += T_OBL[i][0] * Math.cos(arg);
  }
  var obliquity = OBLIQ0 + s / 3600;

  var esin = 0, ecos = 0;
  for (i = 0; i < T_ECC.length; i++) {
    arg = D2R * (ym * T_ECC[i][1] / 3600 + T_ECC[i][2]);
    esin += T_ECC[i][0] * Math.sin(arg);
    ecos += T_ECC[i][0] * Math.cos(arg);
  }
  var e = Math.sqrt(esin * esin + ecos * ecos);

  var fsin = 0;
  for (i = 0; i < T_PREC.length; i++) {
    arg = D2R * (ym * T_PREC[i][1] / 3600 + T_PREC[i][2]);
    fsin += T_PREC[i][0] * Math.sin(arg);
  }
  var psi = D2R * (ZETA + (ym * PSI0 + fsin) / 3600);
  var lp = Math.atan2(esin, ecos) + psi + Math.PI;
  var longPeri = ((lp % TAU) + TAU) % TAU / D2R;

  return {
    e: e,
    obliquity: obliquity,
    longPeri: longPeri,
    precession: e * Math.sin(longPeri * D2R)
  };
}

/* ──────────────────────────────────────────────────────────────────────
   INSOLATION
   dailyMean(lat, solarLon, o) — mean solar flux over one full rotation
   (W/m2) at latitude lat, on the day whose solar longitude is solarLon
   (degrees from the vernal equinox: 0 = Mar equinox, 90 = Jun solstice,
   180 = Sep equinox, 270 = Dec solstice), for an orbit o =
   {e, obliquity, longPeri}. An orbit() result can be passed directly.

   Declination from sin(dec) = sin(eps)*sin(lam); Earth-Sun distance
   factor (a/r)^2 from the true anomaly nu = lam - longPeri; polar day
   and polar night handled explicitly.
   ────────────────────────────────────────────────────────────────────── */
var S0 = 1361;   // solar constant, W/m2

function dailyMean(lat, solarLon, o) {
  var e = o.e, eps = o.obliquity * D2R, lam = solarLon * D2R;
  var nu  = (solarLon - o.longPeri) * D2R;
  var rho = (1 + e * Math.cos(nu)) / (1 - e * e);          // a/r
  var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  var phi = lat * D2R;
  var t   = -Math.tan(phi) * Math.tan(dec);
  var H   = t <= -1 ? Math.PI : (t >= 1 ? 0 : Math.acos(t));  // half-day angle
  return (S0 / Math.PI) * rho * rho *
         (H * Math.sin(phi) * Math.sin(dec) +
          Math.cos(phi) * Math.cos(dec) * Math.sin(H));
}

/* Summer-solstice insolation at a latitude, straight from an age.
   65N June is the canonical Milankovitch index. */
function summerSolstice(lat, ageBP) {
  return dailyMean(lat, lat >= 0 ? 90 : 270, orbit(ageBP));
}
function q65June(ageBP) { return dailyMean(65, 90, orbit(ageBP)); }

/* Length of the NH summer half-year (Mar equinox -> Sep equinox) in days.
   Kepler's second law makes that half longer when aphelion falls inside
   it, which is a real part of the precession story. Integrates
   dt proportional to r^2 dnu over the half, normalised by the full orbit. */
function summerHalfYearDays(o) {
  var YEAR = 365.2422, n = 1440, i, lam, nu, r;
  var e = o.e, lp = o.longPeri, halfSum = 0, fullSum = 0;
  for (i = 0; i < n; i++) {
    lam = 360 * (i + 0.5) / n;
    nu  = (lam - lp) * D2R;
    r   = (1 - e * e) / (1 + e * Math.cos(nu));
    fullSum += r * r;
    if (lam < 180) halfSum += r * r;
  }
  return YEAR * halfSum / fullSum;
}

/* Insolation with any subset of the three cycles HELD AT ITS LONG-TERM
   MEAN rather than dropped, so a disabled component contributes its
   average effect instead of zero. hold = {e, obliquity, precession},
   true meaning "hold this one fixed".
   Holding eccentricity fixes the amplitude of the precession term
   without silencing it, which is what eccentricity physically does. */
var MEAN_800K = { e: 0.0275, obliquity: 23.4457, longPeri: 180 };

function q65JuneWith(ageBP, hold) {
  var o = orbit(ageBP);
  hold = hold || {};
  return dailyMean(65, 90, {
    e:         hold.e          ? MEAN_800K.e         : o.e,
    obliquity: hold.obliquity  ? MEAN_800K.obliquity : o.obliquity,
    longPeri:  hold.precession ? MEAN_800K.longPeri  : o.longPeri
  });
}

/* ──────────────────────────────────────────────────────────────────────
   SHARED CHROME — one palette, one time axis, one set of anchors, so the
   four tools cannot drift apart. These are CONTENT colours (they identify
   a parameter, not decoration) and so live here rather than in
   core-sample-tools.css, per that file's documented exception.
   ────────────────────────────────────────────────────────────────────── */
var PALETTE = {
  eccentricity: '#FFD166',
  obliquity:    '#FF7A6A',
  precession:   '#3CA3AE',
  insolation:   '#FFB347',
  proxy:        '#C0D7FC',
  warm:         '#FFD166',
  cool:         '#74BBFB'
};

var TIME = {
  DEEP_START:   800000,    // EPICA's reach; the suite's default deep view
  MPT_START:   2000000,    // LR04 view; orbital curves are NOT drawn here
  BERGER_VALID: 1000000,   // hard limit on the Berger 1978 series
  NEAR_START:    250000,
  NEAR_END:     -100000    // negative = future
};

var EVENTS = [
  { age: 0,      kind: 'now',  short: 'Now',       label: 'Now' },
  { age: 11000,  kind: 'warm', short: 'HOL max',   label: 'Holocene insolation maximum' },
  { age: 21000,  kind: 'cold', short: 'LGM',       label: 'Last Glacial Maximum' },
  { age: 116000, kind: 'cold', short: 'inception', label: 'Last glacial inception' },
  { age: 128000, kind: 'warm', short: 'Eemian',    label: 'Eemian (MIS 5e)' },
  { age: 243000, kind: 'warm', short: 'MIS 7e',    label: 'MIS 7e' },
  { age: 335000, kind: 'warm', short: 'MIS 9e',    label: 'MIS 9e' },
  { age: 410000, kind: 'warm', short: 'MIS 11c',   label: 'MIS 11c' },
  { age: 434000, kind: 'cold', short: 'MIS 12',    label: 'MIS 12' }
];

function fmtAge(ageBP) {
  if (Math.abs(ageBP) < 500) return 'today';
  if (ageBP < 0) return Math.round(-ageBP / 1000) + ' kyr from now';
  return (ageBP >= 100000 ? Math.round(ageBP / 1000)
                          : (ageBP / 1000).toFixed(1)) + ' kyr ago';
}

/* ──────────────────────────────────────────────────────────────────────
   PROXY RECORDS — fetched from milankovitch-proxies.json (flat sibling).
   Real published data, not schematics:
     EPICA Dome C dD + dT, 0-800 kyr   Jouzel et al. 2007
     LR04 benthic d18O stack, 0-2 Myr  Lisiecki & Raymo 2005
   ────────────────────────────────────────────────────────────────────── */
var _proxies = null, _proxyPromise = null;

function loadProxies(url) {
  if (_proxies) return Promise.resolve(_proxies);
  if (_proxyPromise) return _proxyPromise;
  _proxyPromise = fetch(url || 'milankovitch-proxies.json')
    .then(function (r) {
      if (!r.ok) throw new Error('proxy data HTTP ' + r.status);
      return r.json();
    })
    .then(function (j) { _proxies = j; return j; });
  return _proxyPromise;
}

/* Linear interpolation into a sorted array of [x, ...] rows. */
function sampleRows(rows, x, col) {
  var lo = 0, hi = rows.length - 1, m;
  if (x <= rows[0][0])  return rows[0][col];
  if (x >= rows[hi][0]) return rows[hi][col];
  while (hi - lo > 1) { m = (lo + hi) >> 1; if (rows[m][0] <= x) lo = m; else hi = m; }
  var f = (x - rows[lo][0]) / (rows[hi][0] - rows[lo][0]);
  return rows[lo][col] * (1 - f) + rows[hi][col] * f;
}

global.MILANKOVITCH = {
  VERSION: '1.0.0',
  D2R: D2R,
  S0: S0,
  orbit: orbit,
  dailyMean: dailyMean,
  summerSolstice: summerSolstice,
  q65June: q65June,
  q65JuneWith: q65JuneWith,
  summerHalfYearDays: summerHalfYearDays,
  MEAN_800K: MEAN_800K,
  PALETTE: PALETTE,
  TIME: TIME,
  EVENTS: EVENTS,
  fmtAge: fmtAge,
  loadProxies: loadProxies,
  sampleRows: sampleRows,
  tables: { obliquity: T_OBL, eccentricity: T_ECC, precession: T_PREC }
};

}(typeof window !== 'undefined' ? window : this));
