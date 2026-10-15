/* ==================================================================
   CLOUD SHADES — spectral atmosphere tables for the 3D renderer
   Constants follow sky-color.html ("Clear day"): ASTM E-490 sunlight,
   Bodhaine et al. 1999 Rayleigh depth, AERONET CCNY 5 Jun 2023 aerosol,
   Serdyuchenko et al. 2014 ozone (Chappuis), Wyman et al. 2013 CIE fit.
   ================================================================== */
var ATMO = (function () {
  var NL = 16, LAM = [], i;
  for (i = 0; i < NL; i++) LAM.push(395 + 22 * i);
  var F0 = [1.30, 1.72, 1.75, 2.04, 1.99, 1.92, 1.86, 1.86, 1.82, 1.76, 1.70, 1.63, 1.53, 1.50, 1.42, 1.34];
  var O3X = [0.2e-22, 0.5e-22, 1.5e-22, 4e-22, 9e-22, 1.6e-21, 2.6e-21, 3.3e-21, 4.4e-21, 4.9e-21, 4.6e-21, 3.4e-21, 2.2e-21, 1.15e-21, 0.9e-21, 0.6e-21];
  var HR = 8000, HA = 1500, SSA = 0.95, GA = 0.70, O3DU = 300, RE = 6371e3, TOP = 100e3;
  function tauRay(l) { var um = l / 1000; return 0.0021520 * (1.0455996 - 341.29061 * Math.pow(um, -2) - 0.90230850 * um * um) / (1 + 0.0027059889 * Math.pow(um, -2) - 85.968563 * um * um); }
  function aodSpectrum(pts) {
    return LAM.map(function (l) {
      var j = 0; while (j < pts.length - 2 && l > pts[j + 1][0]) j++;
      var a = Math.log(pts[j + 1][1] / pts[j][1]) / Math.log(pts[j + 1][0] / pts[j][0]);
      return pts[j][1] * Math.pow(l / pts[j][0], a);
    });
  }
  var AOD = aodSpectrum([[440, 0.1349], [500, 0.1151], [675, 0.0726], [870, 0.0493]]);
  var bR = LAM.map(function (l) { return tauRay(l) / HR; });          // Rayleigh scattering at sea level, m⁻¹
  var kA = AOD.map(function (t) { return t / HA; });                   // aerosol extinction at sea level, m⁻¹
  var kO = O3X.map(function (x) { return x * 1e-4 * O3DU * 2.687e20 / 15e3; }); // ozone absorption at the 25 km peak, m⁻¹
  // ground: Lambertian, grass–soil mix (shape), scaled to photopic albedo 0.15
  var ALB_SHAPE = [0.050, 0.055, 0.062, 0.075, 0.105, 0.150, 0.165, 0.150, 0.135, 0.125, 0.118, 0.110, 0.115, 0.170, 0.260, 0.330];

  function cie(l) {
    function g(x, m, s1, s2) { var t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); }
    return [1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
            0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
            1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8)];
  }
  var M = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];
  function interp(arr, l) { var f = (l - 395) / 22; if (f <= 0) return arr[0]; if (f >= NL - 1) return arr[NL - 1]; var j = Math.floor(f), t = f - j; return arr[j] + t * (arr[j + 1] - arr[j]); }
  var L0 = 380, L1 = 720, DL = L1 - L0;

  // white balance: TOA sunlight → neutral (as sky-color.html), luminance kept; scale so that a white
  // Lambertian card facing the Sun above the atmosphere = (1,1,1): rgb = π ∫ wb(λ) L(λ) dλ
  var sunRGB = [0, 0, 0], ySun = 0, l, k;
  for (l = L0; l <= L1; l += 0.25) {
    var c = cie(l), f0 = interp(F0, l);
    for (k = 0; k < 3; k++) sunRGB[k] += (M[k][0] * c[0] + M[k][1] * c[1] + M[k][2] * c[2]) * f0 * 0.25;
    ySun += c[1] * f0 * 0.25;
  }
  function wb(l) { var c = cie(l); return [0, 1, 2].map(function (k) { return (M[k][0] * c[0] + M[k][1] * c[1] + M[k][2] * c[2]) / sunRGB[k]; }); }
  // shader table: 69 entries at 380 + 5i nm, each = wb(λ) · DL/4 (4 hero wavelengths) · π  (radiance → card units)
  var WB = [];
  for (i = 0; i <= 68; i++) { var w = wb(380 + 5 * i); WB.push(w.map(function (v) { return v * DL / 4 * Math.PI; })); }

  var ALB = (function () {
    var num = 0, den = 0;
    for (l = L0; l <= L1; l += 1) { var y = cie(l)[1] * interp(F0, l); num += y * interp(ALB_SHAPE, l); den += y; }
    var s = 0.15 / (num / den); return ALB_SHAPE.map(function (a) { return a * s; });
  })();

  function densO(h) { return Math.max(0, 1 - Math.abs(h - 25e3) / 15e3); }
  // relative optical air mass toward the Sun from sea level, spherical Earth, per species
  function airMasses(elevDeg) {
    var e = elevDeg * Math.PI / 180, dx = Math.cos(e), dy = Math.sin(e), py = RE + 1, top = RE + TOP;
    var b = py * dy, L = -b + Math.sqrt(b * b - (py * py - top * top)), N = 4000, r = 0, a = 0, o = 0;
    for (var j = 0; j < N; j++) {
      var t0 = L * Math.pow(j / N, 2), t1 = L * Math.pow((j + 1) / N, 2), t = (t0 + t1) / 2, ds = t1 - t0;
      var h = Math.hypot(dx * t, py + dy * t) - RE;
      r += Math.exp(-h / HR) * ds; a += Math.exp(-h / HA) * ds; o += densO(h) * ds;
    }
    return [r / HR, a / HA, o / 15e3];
  }
  // spectral direct-beam transmittance at sea level for a sun elevation (per LAM bin)
  function sunT(elevDeg) {
    var m = airMasses(elevDeg);
    return LAM.map(function (_, j) { return Math.exp(-(bR[j] * HR * m[0] + kA[j] * HA * m[1] + kO[j] * 15e3 * m[2])); });
  }
  // luminance of a white card facing the Sun at the ground (direct beam only), in card-at-TOA units
  function cardY(elevDeg) {
    var T = sunT(elevDeg), num = 0, den = 0;
    for (l = L0; l <= L1; l += 1) { var y = cie(l)[1] * interp(F0, l); num += y * interp(T, l); den += y; }
    return num / den;
  }
  return { NL: NL, LAM: LAM, F0: F0, bR: bR, kA: kA, kO: kO, ALB: ALB, AOD: AOD, WB: WB, HR: HR, HA: HA, SSA: SSA, GA: GA,
    cie: cie, wb: wb, interp: interp, airMasses: airMasses, sunT: sunT, cardY: cardY, ySun: ySun, sunRGB: sunRGB };
})();
