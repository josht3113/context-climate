/* ==================================================================
   CLOUD SHADES — 3D spectral volumetric path tracer (WebGL2)
   Clouds: baked 3D density textures, Henyey–Greenstein g = 0.85, non-absorbing.
   Deep interiors (≥ 10 optical depths from any thin region, decided per 8³-voxel
   macro cell) use similarity-scaled transport: σ(1−g), isotropic.
   Air: Rayleigh + aerosol + ozone, flat layers, sunlight transmittance with
   spherical-Earth air masses. Four hero wavelengths per path, spectral tracking.
   ================================================================== */
var R3N = (function () {
  'use strict';
  var COMMON = [
    '#version 300 es',
    'precision highp float; precision highp int; precision highp sampler3D; precision highp sampler2D;'
  ].join('\n');

  var VS = '#version 300 es\nvoid main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';

  /* ---------------- density generators ---------------- */
  var GEN_FS = COMMON + '\n' + [
    'uniform int uType; uniform int uLayer; uniform ivec3 uN; uniform vec3 uO; uniform vec3 uL;',
    'uniform float uHb; uniform float uH; uniform float uDmax; uniform uint uSeedI;',
    'out vec4 o;',
    'uvec3 pcg3(uvec3 v){ v = v*1664525u + 1013904223u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; v ^= v >> 16u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; return v; }',
    'int wrapi(int a, int n){ return n > 0 ? (a + n*4096) % n : a; }',
    'ivec3 wrap3(ivec3 c, ivec3 per){ return ivec3(wrapi(c.x,per.x), wrapi(c.y,per.y), wrapi(c.z,per.z)); }',
    'vec3 h33(ivec3 c){ return vec3(pcg3(uvec3(c + 8192) + uSeedI)) * (1.0/4294967296.0); }',
    'float gc(ivec3 i, ivec3 c, ivec3 per, vec3 f){ vec3 g = h33(wrap3(i + c, per))*2.0 - 1.0; return dot(g, f - vec3(c)); }',
    // periodic gradient noise, ~[-1,1]
    'float gn3(vec3 x, ivec3 per){',
    '  ivec3 i = ivec3(floor(x)); vec3 f = fract(x); vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);',
    '  float n0 = gc(i, ivec3(0,0,0), per, f), n1 = gc(i, ivec3(1,0,0), per, f), n2 = gc(i, ivec3(0,1,0), per, f), n3 = gc(i, ivec3(1,1,0), per, f);',
    '  float n4 = gc(i, ivec3(0,0,1), per, f), n5 = gc(i, ivec3(1,0,1), per, f), n6 = gc(i, ivec3(0,1,1), per, f), n7 = gc(i, ivec3(1,1,1), per, f);',
    '  return 1.6*mix(mix(mix(n0,n1,u.x), mix(n2,n3,u.x), u.y), mix(mix(n4,n5,u.x), mix(n6,n7,u.x), u.y), u.z);',
    '}',
    'float gn2(vec2 x, ivec2 per){ return gn3(vec3(x, 0.37), ivec3(per, 0)); }',
    'float fbm2(vec2 x, ivec2 per, int oct){ float s = 0.0, a = 0.5, n = 0.0; for (int k = 0; k < 6; k++){ if (k >= oct) break; s += a*gn2(x, per); n += a; x *= 2.0; per *= 2; a *= 0.5; } return s/n; }',
    'float fbm3(vec3 x, ivec3 per, int oct){ float s = 0.0, a = 0.5, n = 0.0; for (int k = 0; k < 6; k++){ if (k >= oct) break; s += a*gn3(x, per); n += a; x *= 2.0; per *= 2; a *= 0.5; } return s/n; }',
    // periodic Worley 2D: (F1, F2, cell hash)
    'vec3 worley2(vec2 x, ivec2 per){',
    '  ivec2 i = ivec2(floor(x)); vec2 f = fract(x); float f1 = 9.0, f2 = 9.0, id = 0.0;',
    '  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++){',
    '    ivec2 c = ivec2(a, b); vec3 h = h33(ivec3(wrapi(i.x + a, per.x), wrapi(i.y + b, per.y), 7));',
    '    vec2 d = vec2(c) + 0.15 + 0.7*h.xy - f; float r = length(d);',
    '    if (r < f1){ f2 = f1; f1 = r; id = h.z; } else if (r < f2) f2 = r;',
    '  }',
    '  return vec3(f1, f2, id);',
    '}',
    // periodic Worley 3D F1 (billows)
    'float worley3(vec3 x, ivec3 per){',
    '  ivec3 i = ivec3(floor(x)); vec3 f = fract(x); float f1 = 9.0;',
    '  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++){',
    '    ivec3 cc = ivec3(a, b, c); vec3 h = h33(wrap3(i + cc, per) + ivec3(0, 0, 913));',
    '    f1 = min(f1, length(vec3(cc) + h - f));',
    '  }',
    '  return clamp(f1, 0.0, 1.0);',
    '}',
    'float sstep(float a, float b, float x){ return smoothstep(a, b, x); }',
    'float band(float z, float lo, float hi, float s){ return sstep(lo - s, lo + s, z) * (1.0 - sstep(hi - s, hi + s, z)); }',
    'const ivec3 NP = ivec3(0);',
    '',
    'float dThin(vec2 q, vec3 p, float zl){',
    '  float th = fbm2(q*6.0, ivec2(6), 4);',
    '  float fib = fbm2(q*vec2(5.0, 22.0), ivec2(5, 22), 5);',
    '  float b0 = 0.18*uH*gn2(q*5.0, ivec2(5));',
    '  float top = uH*(1.0 + 0.32*th);',
    '  float e = max(4.0, 0.12*uH);',
    '  float dens = clamp(1.0 + 1.1*fib + 0.25*gn3(vec3(q*40.0, zl/max(uH,1.0)*2.0), ivec3(40, 40, 0)), 0.12, 1.95);',
    '  return band(zl, b0, top, e) * dens;',
    '}',
    'float dSc(vec2 q, vec3 p, float zl){',
    '  vec3 w = worley2(q*12.0 + 0.35*vec2(gn2(q*6.0, ivec2(6)), gn2(q*6.0 + 3.7, ivec2(6))), ivec2(12));',
    '  float e = clamp((w.y - w.x)/0.42, 0.0, 1.0);',
    '  float str = 0.80 + 0.45*w.z;',
    '  float n3 = fbm3(vec3(q*48.0, zl/120.0), ivec3(48, 48, 0), 3);',
    '  float thick = uH*str*(0.06 + 1.14*pow(e, 0.55)) + 0.08*uH*n3;',
    '  float base = 0.03*uH*gn2(q*24.0, ivec2(24));',
    '  float top = base + thick;',
    '  float s = max(6.0, 0.04*uH);',
    '  float lwc = 0.55 + 0.9*clamp((zl - base)/max(thick, 1.0), 0.0, 1.0);',
    '  return band(zl, base, top, s) * sstep(0.0, 0.05*uH, thick) * lwc * (0.85 + 0.3*n3);',
    '}',
    'float dSt(vec2 q, vec3 p, float zl){',
    '  float rolls = gn2(q*vec2(9.0, 36.0), ivec2(9, 36));',
    '  float base = 0.055*uH*rolls + 0.035*uH*fbm2(q*16.0, ivec2(16), 4);',
    '  float top = uH + 0.02*uH*fbm2(q*12.0, ivec2(12), 3);',
    '  float n3 = fbm3(vec3(q*40.0, zl/200.0), ivec3(40, 40, 0), 3);',
    '  float s = max(6.0, 0.03*uH);',
    '  float lwc = 0.7 + 0.6*clamp(zl/uH, 0.0, 1.0);',
    '  return band(zl, base, top, s) * lwc * (0.92 + 0.16*n3);',
    '}',
    'float dCu(vec2 q, vec3 p, float zl){',
    '  vec3 w = worley2(q*10.0, ivec2(10));',
    '  float alive = sstep(0.38, 0.44, w.z);',
    '  float str = clamp((w.z - 0.40)/0.60, 0.0, 1.0);',
    '  float t = uH*(0.28 + 0.72*pow(str, 1.2));',
    '  float rc = 0.16 + 0.24*str;',
    '  float zn = zl/max(t, 1.0);',
    '  float bil = 1.0 - worley3(vec3(q*50.0, zl/240.0), ivec3(50, 50, 0));',
    '  float bil2 = 1.0 - worley3(vec3(q*125.0, zl/100.0 + 3.1), ivec3(125, 125, 0));',
    '  float fine = gn3(vec3(q*200.0, zl/60.0), ivec3(200, 200, 0));',
    '  float up = clamp((zn - 0.30)/0.70, 0.0, 1.0);',
    '  float prof = (zn < 0.30 ? 1.0 - 0.10*(0.30 - zn)/0.30 : sqrt(max(0.0, 1.0 - up*up)));',
    '  float R = rc*prof*(1.0 + (0.10 + 0.32*clamp(zn, 0.0, 1.0))*bil + 0.12*bil2 + 0.04*fine);',
    '  float sIn = (R - w.x)*1200.0;',
    '  float topCut = 1.0 - sstep(1.0 + 0.12*bil2, 1.10 + 0.12*bil2, zn);',
    '  float lwc = 0.35 + 1.35*clamp(zn, 0.0, 1.0);',
    '  return alive * sstep(-14.0, 14.0, sIn) * sstep(0.0, 10.0, zl) * topCut * lwc;',
    '}',
    'float dNs(vec2 q, vec3 p, float zl){',
    '  float base = 230.0*fbm2(q*8.0, ivec2(8), 4);',
    '  float top = uH + 150.0*fbm2(q*6.0, ivec2(6), 3);',
    '  float n3 = fbm3(vec3(q*40.0, p.z/500.0), ivec3(40, 40, 0), 4);',
    '  float wisp = gn3(vec3(q*66.0, p.z/300.0), ivec3(66, 66, 0));',
    '  float main = sstep(base - 120.0, base + 200.0, zl + 150.0*wisp) * (1.0 - sstep(top - 60.0, top + 60.0, zl));',
    '  float dens = (0.85 + 0.35*n3);',
    '  float scud = 0.75*sstep(0.30, 0.55, n3 + 0.4*wisp) * band(p.z, 480.0, 760.0, 70.0);',
    '  return max(main*dens, scud);',
    '}',
    'float towerD(vec3 p, vec2 c0, float hb, float H, float R0, float shear, float bil1, float bil2, float fine, float glac, bool roundTop){',
    '  float zl = p.z - hb; if (zl < -60.0 || zl > H + 1200.0) return 0.0;',
    '  float zn = zl/H;',
    '  vec2 c = c0 + vec2(shear*zl, 0.0);',
    '  float d = length(p.xy - c);',
    '  float R = R0*(0.86 + 0.24*sstep(0.0, 0.30, zn))*(1.0 - 0.18*sstep(0.72, 1.0, zn));',
    '  float amp = 1.0 - 0.65*glac;',
    '  float bump = R*(0.22*bil1 + 0.11*bil2)*amp + 70.0*fine;',
    '  float sIn = R + bump - d;',
    '  float topE = roundTop ? H*(1.0 - 0.20*pow(clamp(d/R, 0.0, 1.0), 2.0)) + 0.07*H*bil2*amp : H + 0.03*H*bil2;',
    '  float lwc = 0.6 + 0.9*sstep(0.0, 0.55, zn) - 0.5*sstep(0.65, 1.0, zn);',
    '  return sstep(-70.0, 70.0, sIn) * sstep(0.0, 22.0, zl) * (1.0 - sstep(topE - 140.0, topE + 140.0, zl)) * lwc;',
    '}',
    'float dCb(vec3 p){',
    '  float edgeFade = (1.0 - sstep(17500.0, 19500.0, abs(p.x))) * (1.0 - sstep(17500.0, 19500.0, abs(p.y)));',
    '  if (edgeFade <= 0.0) return 0.0;',
    '  float zl = p.z - uHb, zn = zl/uH;',
    '  vec3 wp = p + vec3(gn3(p/3200.0, NP), gn3(p/3200.0 + 11.3, NP), 0.0)*650.0;',
    '  float bil1 = 1.0 - worley3(wp/1350.0, NP);',
    '  float bil2 = 1.0 - worley3(wp/540.0 + 17.3, NP);',
    '  float fine = gn3(wp/190.0, NP);',
    '  float ga = sstep(5000.0, 8000.0, uH);',
    '  float glac = ga*sstep(0.55, 0.85, zn);',
    '  float D = towerD(wp, vec2(0.0), uHb, uH, 3000.0, 0.05, bil1, bil2, fine, glac, ga < 0.5);',
    '  float g2 = 0.0;',
    '  D = max(D, towerD(wp, vec2(-4900.0, -3700.0), uHb, 0.50*uH, 2000.0, 0.03, bil1, bil2, fine, g2, true));',
    '  D = max(D, towerD(wp, vec2(-8700.0, -6500.0), uHb, 0.33*uH, 1500.0, 0.02, bil1, bil2, fine, g2, true));',
    '  D = max(D, towerD(wp, vec2(-11900.0, -8900.0), uHb, 0.20*uH, 1100.0, 0.0, bil1, bil2, fine, g2, true));',
    '  D = max(D, towerD(wp, vec2(-14500.0, -11000.0), uHb, 0.12*uH, 800.0, 0.0, bil1, bil2, fine, g2, true));',
    '  if (ga > 0.0 && zl > 0.45*uH){',
    '    float at = uH;',
    '    vec2 rel = p.xy - vec2(6000.0, 0.0);',
    '    vec2 ae = rel/vec2(rel.x > 0.0 ? 17500.0 : 10500.0, 10500.0);',
    '    float an = fbm3(p/vec3(2600.0, 2600.0, 900.0), NP, 4);',
    '    float streak = fbm3(vec3(p.x/7000.0, p.y/1300.0, p.z/600.0), NP, 4);',
    '    float re = length(ae) + 0.12*an + 0.07*streak;',
    '    float thick = 2300.0*(1.0 - pow(min(re, 1.0), 1.25));',
    '    float mam = 1.0 - worley3(p/700.0 + 3.7, NP);',
    '    float aBot = at - thick + 380.0*an*(1.0 - re) - 300.0*mam*sstep(0.15, 0.55, 1.0 - re);',
    '    float aTop = at - 160.0*re*re + 70.0*an;',
    '    float anv = sstep(1.0, 0.80, re) * sstep(aBot - 110.0, aBot + 110.0, zl) * (1.0 - sstep(aTop - 70.0, aTop + 70.0, zl));',
    '    float lwcA = 0.22*(0.75 + 0.5*streak)*(1.0 - 0.55*clamp(re, 0.0, 1.0));',
    '    D = max(D, ga*anv*lwcA);',
    '    float od = length(vec3((p.xy - vec2(0.05*uH, 0.0))/3000.0, (zl - at)/800.0)) - 0.12*bil2;',
    '    D = max(D, ga*0.7*sstep(1.0, 0.86, od)*step(at - 400.0, zl));',
    '  }',
    '  if (zl < 0.0){',
    '    float rd = length(p.xy - vec2(1800.0, 600.0))/3700.0 + 0.18*gn3(vec3(p.xy/900.0, p.z/2500.0), NP);',
    '    D = max(D, 0.045*sstep(1.0, 0.55, rd)*(0.75 + 0.25*gn3(vec3(p.xy/500.0, p.z/1500.0) + 5.1, NP)));',
    '  }',
    '  return D*edgeFade;',
    '}',
    'void main(){',
    '  ivec2 ij = ivec2(gl_FragCoord.xy);',
    '  vec3 uvw = (vec3(ij, uLayer) + 0.5)/vec3(uN);',
    '  vec3 p = uO + uvw*uL;',
    '  vec2 q = uvw.xy;',
    '  float zl = p.z - uHb, D = 0.0;',
    '  if (uType == 0) D = 1.0;',
    '  else if (uType == 1) D = dThin(q, p, zl);',
    '  else if (uType == 2) D = dSc(q, p, zl);',
    '  else if (uType == 3) D = dSt(q, p, zl);',
    '  else if (uType == 4) D = dCu(q, p, zl);',
    '  else if (uType == 5) D = dNs(q, p, zl);',
    '  else D = dCb(p);',
    '  o = vec4(clamp(D/uDmax, 0.0, 1.0), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- macro grid: per-cell max/min ---------------- */
  var MAC1_FS = COMMON + '\n' + [
    'uniform sampler3D uDen; uniform ivec3 uN; uniform int uPeriodic; uniform int uLayer;',
    'out vec4 o;',
    'float vox(ivec3 v){',
    '  if (v.z < 0 || v.z >= uN.z) return 0.0;',
    '  if (uPeriodic == 1){ v.x = (v.x + uN.x*64) % uN.x; v.y = (v.y + uN.y*64) % uN.y; }',
    '  else if (v.x < 0 || v.y < 0 || v.x >= uN.x || v.y >= uN.y) return 0.0;',
    '  return texelFetch(uDen, v, 0).r;',
    '}',
    'void main(){',
    '  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uLayer), b = c*8;',
    '  float mx = 0.0, mn = 1.0;',
    '  for (int z = -1; z <= 8; z++) for (int y = -1; y <= 8; y++) for (int x = -1; x <= 8; x++){',
    '    float v = vox(b + ivec3(x, y, z)); mx = max(mx, v); mn = min(mn, v);',
    '  }',
    '  o = vec4(min(1.0, mx + 1.0/255.0), 0.0, max(0.0, mn - 1.0/255.0), 1.0);',
    '}'
  ].join('\n');

  /* ---------------- macro grid: interior flag ---------------- */
  var MAC2_FS = COMMON + '\n' + [
    'uniform sampler3D uMac1; uniform ivec3 uM; uniform int uPeriodic; uniform int uLayer; uniform float uSigC; uniform float uCmin;',
    'out vec4 o;',
    'float mn(ivec3 c){',
    '  if (c.z < 0 || c.z >= uM.z) return 0.0;',
    '  if (uPeriodic == 1){ c.x = (c.x + uM.x*64) % uM.x; c.y = (c.y + uM.y*64) % uM.y; }',
    '  else if (c.x < 0 || c.y < 0 || c.x >= uM.x || c.y >= uM.y) return 0.0;',
    '  return texelFetch(uMac1, c, 0).b;',
    '}',
    'void main(){',
    '  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uLayer);',
    '  vec4 me = texelFetch(uMac1, c, 0);',
    '  float interior = 0.0, m = 1.0;',
    '  for (int k = 1; k <= 3; k++){',
    '    for (int z = -k; z <= k; z++) for (int y = -k; y <= k; y++) for (int x = -k; x <= k; x++){',
    '      if (max(abs(x), max(abs(y), abs(z))) == k) m = min(m, mn(c + ivec3(x, y, z)));',
    '    }',
    '    m = min(m, me.b);',
    '    if (m*uSigC*float(k)*uCmin >= 10.0) { interior = 1.0; break; }',
    '  }',
    '  o = vec4(me.r, interior, me.b, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- path tracer ---------------- */
  var PT_FS = COMMON + '\n' + [
    'uniform sampler2D uPrev; uniform sampler3D uDen; uniform sampler3D uMac; uniform sampler2D uSpec; uniform sampler2D uWB;',
    'uniform ivec2 uRes; uniform int uBand0; uniform int uBand1; uniform int uPhase; uniform uint uSeed;',
    'uniform vec3 uCamPos; uniform vec3 uCamF; uniform vec3 uCamR; uniform vec3 uCamU; uniform vec2 uTan;',
    'uniform vec3 uSun; uniform vec3 uAM; uniform float uSunCos; uniform float uSunOmega;',
    'uniform vec3 uBoxO; uniform vec3 uBoxL; uniform vec3 uCell; uniform ivec3 uMacN; uniform int uPeriodic; uniform int uCloudOn;',
    'uniform float uSigC; uniform float uG; uniform int uAir; uniform int uStats; uniform float uAlbGray;',
    'out vec4 oCol;',
    'const float PI = 3.14159265359, HR = 8000.0, HA = 1500.0, SSA = 0.95, GA = 0.70, EPS = 2e-3;',
    'const int MAXEV = 6000;',
    'uint rs;',
    'float rnd(){ rs = rs*747796405u + 2891336453u; uint w = ((rs >> ((rs >> 28u) + 4u)) ^ rs)*277803737u; w = (w >> 22u) ^ w; return (float(w >> 8u) + 0.5)*(1.0/16777216.0); }',
    'uint hsh(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s)*277803737u; return (w >> 22u) ^ w; }',
    'vec4 F0v, bRv, kAv, kOv, albv;',
    'int nEv = 0; bool capped = false; int gBudget = 60000;',
    'float adv(float se){ return se + EPS + se*4e-7; }',
    'vec4 specAt(float l, out float alb){',
    '  float f = clamp((l - 395.0)/22.0, 0.0, 15.0); int i0 = min(int(f), 14); float t = f - float(i0);',
    '  alb = mix(texelFetch(uSpec, ivec2(i0, 1), 0).x, texelFetch(uSpec, ivec2(i0 + 1, 1), 0).x, t);',
    '  return mix(texelFetch(uSpec, ivec2(i0, 0), 0), texelFetch(uSpec, ivec2(i0 + 1, 0), 0), t);',
    '}',
    'void loadSpec(vec4 lam){',
    '  float a0, a1, a2, a3;',
    '  vec4 s0 = specAt(lam.x, a0), s1 = specAt(lam.y, a1), s2 = specAt(lam.z, a2), s3 = specAt(lam.w, a3);',
    '  F0v = vec4(s0.x, s1.x, s2.x, s3.x); bRv = vec4(s0.y, s1.y, s2.y, s3.y); kAv = vec4(s0.z, s1.z, s2.z, s3.z); kOv = vec4(s0.w, s1.w, s2.w, s3.w);',
    '  albv = vec4(a0, a1, a2, a3);',
    '  if (uAlbGray >= 0.0) albv = vec4(uAlbGray);',
    '}',
    'vec3 wbAt(float l){ float f = clamp((l - 380.0)/5.0, 0.0, 68.0); int i0 = min(int(f), 67); return mix(texelFetch(uWB, ivec2(i0, 0), 0).rgb, texelFetch(uWB, ivec2(i0 + 1, 0), 0).rgb, f - float(i0)); }',
    // ozone tent 10–40 km: density, antiderivative from 10 km
    'float tent(float h){ return max(0.0, 1.0 - abs(h - 25000.0)/15000.0); }',
    'float tentF(float h){ if (h <= 10000.0) return 0.0; if (h <= 25000.0){ float a = h - 10000.0; return a*a/30000.0; } if (h <= 40000.0){ float b = h - 25000.0; return 7500.0 + b - b*b/30000.0; } return 15000.0; }',
    'float expSeg(float h0, float h1, float Ls, float H){',
    '  float a = exp(-h0/H), x = (h1 - h0)/H;',
    '  if (abs(x) < 1e-3) return Ls*a*(1.0 - 0.5*x);',
    '  return Ls*a*(1.0 - exp(-x))/x;',
    '}',
    'float tentSeg(float h0, float h1, float Ls){ if (abs(h1 - h0) < 1.0) return Ls*tent(0.5*(h0 + h1)); return Ls*(tentF(h1) - tentF(h0))/(h1 - h0); }',
    'vec4 airT(float h0, float h1, float Ls){',
    '  if (uAir == 0) return vec4(1.0);',
    '  return exp(-(bRv*expSeg(h0, h1, Ls, HR) + kAv*expSeg(h0, h1, Ls, HA) + kOv*tentSeg(h0, h1, Ls)));',
    '}',
    'vec4 sunT(float h){',
    '  if (uAir == 0) return vec4(1.0);',
    '  return exp(-(bRv*(HR*exp(-h/HR)*uAM.x) + kAv*(HA*exp(-h/HA)*uAM.y) + kOv*((15000.0 - tentF(h))*uAM.z)));',
    '}',
    'float hg(float c, float g){ float d = 1.0 + g*g - 2.0*g*c; return (1.0 - g*g)/(4.0*PI*d*sqrt(d)); }',
    'float rayleighP(float c){ return 3.0/(16.0*PI)*(1.0 + c*c); }',
    'float csP(float c, float g){ float gg = g*g, d = 1.0 + gg - 2.0*g*c; return 3.0/(8.0*PI)*(1.0 - gg)*(1.0 + c*c)/((2.0 + gg)*d*sqrt(d)); }',
    'vec3 around(vec3 d, float ct, float ph){',
    '  float st = sqrt(max(0.0, 1.0 - ct*ct));',
    '  vec3 t = abs(d.z) < 0.999 ? normalize(cross(d, vec3(0.0, 0.0, 1.0))) : normalize(cross(d, vec3(1.0, 0.0, 0.0)));',
    '  vec3 b = cross(d, t);',
    '  return normalize(d*ct + (t*cos(ph) + b*sin(ph))*st);',
    '}',
    'float sampleHGcos(float g){ float gg = g*g, t = (1.0 - gg)/(1.0 - g + 2.0*g*rnd()); return clamp((1.0 + gg - t*t)/(2.0*g), -1.0, 1.0); }',
    'float sampleRayCos(){ float q = 4.0 - 8.0*rnd(), r = sqrt(0.25*q*q + 1.0); float a = -0.5*q + r, b = -0.5*q - r; return clamp(sign(a)*pow(abs(a), 1.0/3.0) + sign(b)*pow(abs(b), 1.0/3.0), -1.0, 1.0); }',
    // ---------- cloud field ----------
    'vec2 boxRange(vec3 o, vec3 d){',
    '  vec3 lo = uBoxO, hi = uBoxO + uBoxL; float t0 = 0.0, t1 = 1e30;',
    '  if (abs(d.z) < 1e-9){ if (o.z < lo.z || o.z > hi.z) return vec2(1.0, 0.0); }',
    '  else { float a = (lo.z - o.z)/d.z, b = (hi.z - o.z)/d.z; t0 = max(t0, min(a, b)); t1 = min(t1, max(a, b)); }',
    '  if (uPeriodic == 0){',
    '    if (abs(d.x) < 1e-9){ if (o.x < lo.x || o.x > hi.x) return vec2(1.0, 0.0); }',
    '    else { float a = (lo.x - o.x)/d.x, b = (hi.x - o.x)/d.x; t0 = max(t0, min(a, b)); t1 = min(t1, max(a, b)); }',
    '    if (abs(d.y) < 1e-9){ if (o.y < lo.y || o.y > hi.y) return vec2(1.0, 0.0); }',
    '    else { float a = (lo.y - o.y)/d.y, b = (hi.y - o.y)/d.y; t0 = max(t0, min(a, b)); t1 = min(t1, max(a, b)); }',
    '  }',
    '  return vec2(t0, t1);',
    '}',
    'float denTex(vec3 p){',
    '  vec3 u = (p - uBoxO)/uBoxL;',
    '  if (u.z < 0.0 || u.z > 1.0) return 0.0;',
    '  if (uPeriodic == 0 && (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0)) return 0.0;',
    '  return texture(uDen, u).r;',
    '}',
    'int imod(int a, int n){ return a - n*int(floor(float(a)/float(n))); }',
    'vec4 macAt(ivec3 c){',
    '  if (c.z < 0 || c.z >= uMacN.z) return vec4(0.0);',
    '  if (uPeriodic == 1){ c.x = imod(c.x, uMacN.x); c.y = imod(c.y, uMacN.y); }',
    '  else if (c.x < 0 || c.y < 0 || c.x >= uMacN.x || c.y >= uMacN.y) return vec4(0.0);',
    '  return texelFetch(uMac, c, 0);',
    '}',
    'float cellExit(vec3 q, ivec3 c, vec3 d){',
    '  vec3 dd = d/uCell;',
    '  vec3 sd = mix(vec3(-1e-12), vec3(1e-12), step(0.0, dd));',
    '  dd = mix(dd, sd, step(abs(dd), vec3(1e-12)));',
    '  vec3 tt = (vec3(c) + step(0.0, dd) - q)/dd;',
    '  return max(min(tt.x, min(tt.y, tt.z)), 1e-3);',
    '}',
    'float rayEnd(vec3 o, vec3 d){',
    '  if (d.z < -1e-7) return o.z/(-d.z);',
    '  if (d.z > 1e-7) return min((60000.0 - o.z)/d.z, 2e6);',
    '  return 2e6;',
    '}',
    // ---------- vertex state ----------
    'vec4 gSR = vec4(0.0), gSA = vec4(0.0); float gSC = 0.0; bool gRed = false;',
    'vec4 phaseMix(float mu){',
    '  float pC = gRed ? 1.0/(4.0*PI) : hg(mu, uG);',
    '  vec4 s = gSR + gSA + vec4(gSC);',
    '  return (gSR*rayleighP(mu) + gSA*csP(mu, GA) + vec4(gSC*pC))/max(s, vec4(1e-30));',
    '}',
    // ratio-tracked cloud transmittance toward the Sun (air handled analytically)
    'float shadowCloud(vec3 p){',
    '  if (uCloudOn == 0) return 1.0;',
    '  vec2 br = boxRange(p, uSun); if (br.y <= br.x) return 1.0;',
    '  float T = 1.0, t = max(br.x, 0.0);',
    '  for (int it = 0; it < 4096; it++){',
    '    if (--gBudget <= 0){ capped = true; return 0.0; }',
    '    if (t >= br.y) return T;',
    '    vec3 x = p + t*uSun, q = (x - uBoxO)/uCell; ivec3 c = ivec3(floor(q)); vec4 m = macAt(c);',
    '    float k = m.g > 0.5 ? (1.0 - uG) : 1.0, cm = uSigC*m.r*k;',
    '    float se = min(br.y, t + cellExit(q, c, uSun));',
    '    if (cm <= 0.0){ t = adv(se); continue; }',
    '    float dt = -log(rnd())/cm;',
    '    if (t + dt >= se){ t = adv(se); continue; }',
    '    t += dt;',
    '    T *= max(0.0, 1.0 - uSigC*denTex(p + t*uSun)*k/cm);',
    '    if (T < 0.1){ if (rnd() < 0.5) return 0.0; T *= 2.0; }',
    '  }',
    '  return T;',
    '}',
    // primary-ray cloud-only free flight; returns distance (tEnd if none)
    'float trackCloud(vec3 o, vec3 d, float tEnd, out bool hit){',
    '  hit = false;',
    '  if (uCloudOn == 0) return tEnd;',
    '  vec2 br = boxRange(o, d); float t = max(br.x, 0.0), e = min(br.y, tEnd);',
    '  for (int it = 0; it < 8192; it++){',
    '    if (--gBudget <= 0){ capped = true; return tEnd; }',
    '    if (t >= e) return tEnd;',
    '    vec3 x = o + t*d, q = (x - uBoxO)/uCell; ivec3 c = ivec3(floor(q)); vec4 m = macAt(c);',
    '    bool red = m.g > 0.5; float k = red ? (1.0 - uG) : 1.0, cm = uSigC*m.r*k;',
    '    float se = min(e, t + cellExit(q, c, d));',
    '    if (cm <= 0.0){ t = adv(se); continue; }',
    '    float dt = -log(rnd())/cm;',
    '    if (t + dt >= se){ t = adv(se); continue; }',
    '    t += dt;',
    '    if (rnd()*cm < uSigC*denTex(o + t*d)*k){ hit = true; gRed = red; return t; }',
    '  }',
    '  return tEnd;',
    '}',
    // general spectral tracking: 0 escape, 1 ground, 2 scatter, 3 absorbed/lost
    'int trackAll(inout vec3 p, vec3 d, inout vec4 w){',
    '  float tEnd = rayEnd(p, d);',
    '  vec2 br = uCloudOn == 1 ? boxRange(p, d) : vec2(1.0, 0.0);',
    '  bool inBox = br.y > br.x;',
    '  float t = 0.0;',
    '  for (int it = 0; it < 8192; it++){',
    '    if (--gBudget <= 0){ capped = true; return 3; }',
    '    float se, cm = 0.0; bool red = false;',
    '    if (inBox && t >= br.x && t < br.y){',
    '      vec3 x = p + t*d, q = (x - uBoxO)/uCell; ivec3 c = ivec3(floor(q)); vec4 m = macAt(c);',
    '      red = m.g > 0.5; cm = uSigC*m.r*(red ? 1.0 - uG : 1.0); se = min(br.y, t + cellExit(q, c, d));',
    '    } else if (inBox && t < br.x) se = br.x; else se = tEnd;',
    '    se = min(se, tEnd);',
    '    float hlo = max(0.0, min(p.z + t*d.z, p.z + se*d.z));',
    '    vec4 am = uAir == 1 ? bRv*exp(-hlo/HR) + kAv*exp(-hlo/HA) + kOv : vec4(0.0);',
    '    float maj = cm + max(max(am.x, am.y), max(am.z, am.w));',
    '    float dt = maj > 0.0 ? -log(rnd())/maj : 1e30;',
    '    if (t + dt >= se){',
    '      t = adv(se);',
    '      if (se >= tEnd){ p += tEnd*d; if (d.z < 0.0){ p.z = 0.0; return 1; } return 0; }',
    '      continue;',
    '    }',
    '    t += dt; vec3 x = p + t*d; float h = max(x.z, 0.0);',
    '    vec4 sR = vec4(0.0), sAs = vec4(0.0), sAa = vec4(0.0), sO = vec4(0.0);',
    '    if (uAir == 1){ sR = bRv*exp(-h/HR); vec4 sA = kAv*exp(-h/HA); sAs = SSA*sA; sAa = (1.0 - SSA)*sA; sO = kOv*tent(h); }',
    '    float sC = cm > 0.0 ? uSigC*denTex(x)*(red ? 1.0 - uG : 1.0) : 0.0;',
    '    vec4 ss = sR + sAs + vec4(sC), sa = sAa + sO, sn = max(vec4(maj) - ss - sa, vec4(0.0));',
    '    float cs = dot(w*ss, vec4(0.25)), ca = dot(w*sa, vec4(0.25)), cn = dot(w*sn, vec4(0.25)), c = cs + ca + cn;',
    '    if (c <= 0.0) return 3;',
    '    float xi = rnd()*c;',
    '    if (xi < cs){ w *= ss/(maj*cs/c); p = x; gSR = sR; gSA = sAs; gSC = sC; gRed = red; return 2; }',
    '    if (xi < cs + ca) return 3;',
    '    w *= sn/(maj*cn/c);',
    '  }',
    '  return 3;',
    '}',
    // continue a path from a vertex. vt: 1 ground, 2 medium (g* state set)
    'vec4 continuePath(vec3 p, vec3 d, vec4 w, int vt){',
    '  vec4 L = vec4(0.0);',
    '  for (int ev = 0; ev < MAXEV; ev++){',
    '    if (gBudget <= 0) break;',
    '    nEv++;',
    '    if (vt == 1){',
    '      if (uSun.z > 0.0){ float Tc = shadowCloud(p); if (Tc > 0.0) L += w*albv/PI*uSun.z*F0v*sunT(0.0)*Tc; }',
    '      w *= albv; float r1 = rnd(), r2 = rnd(); float sr = sqrt(r1);',
    '      d = vec3(sr*cos(2.0*PI*r2), sr*sin(2.0*PI*r2), sqrt(max(0.0, 1.0 - r1))); p.z = 0.0;',
    '    } else {',
    '      if (uSun.z > 0.0){ float Tc = shadowCloud(p); if (Tc > 0.0) L += w*phaseMix(dot(d, uSun))*F0v*sunT(p.z)*Tc; }',
    '      vec4 s = gSR + gSA + vec4(gSC), inv = 1.0/max(s, vec4(1e-30));',
    '      float qR = dot(w*gSR*inv, vec4(0.25)), qA = dot(w*gSA*inv, vec4(0.25)), qC = dot(w*gSC*inv, vec4(0.25)), qs = qR + qA + qC;',
    '      if (qs <= 0.0) break;',
    '      qR /= qs; qA /= qs; qC /= qs;',
    '      float xi = rnd(), ct;',
    '      if (xi < qR) ct = sampleRayCos(); else if (xi < qR + qA) ct = sampleHGcos(GA); else ct = gRed ? 1.0 - 2.0*rnd() : sampleHGcos(uG);',
    '      vec3 nd = around(d, ct, 2.0*PI*rnd());',
    '      float mu = dot(d, nd);',
    '      float pdf = qR*rayleighP(mu) + qA*hg(mu, GA) + qC*(gRed ? 1.0/(4.0*PI) : hg(mu, uG));',
    '      w *= phaseMix(mu)/pdf; d = nd;',
    '    }',
    '    float mw = max(max(w.x, w.y), max(w.z, w.w));',
    '    if (mw < 0.25){ float pr = max(mw*4.0, 0.05); if (rnd() > pr) break; w /= pr; }',
    '    int r = trackAll(p, d, w);',
    '    if (r == 0 || r == 3) break;',
    '    vt = r == 1 ? 1 : 2;',
    '    if (ev == MAXEV - 1) capped = true;',
    '  }',
    '  return L;',
    '}',
    // optical depth of one exponential species (sea-level coefficient c0 at height h0) from 0 to s along slope dz
    'float tauExp(float c, float dz, float s, float H){ float x = s*dz/H; return abs(x) < 1e-4 ? c*s*(1.0 - 0.5*x) : c*H/dz*(1.0 - exp(-x)); }',
    // sample s in [0, tA] with pdf ∝ σ(s) e^{−τ(s)} for that species
    'float sampleTr(float c, float dz, float tA, float H){',
    '  float tt = tauExp(c, dz, tA, H), ts = -log(1.0 - rnd()*(1.0 - exp(-tt)));',
    '  if (abs(dz*tA/H) < 1e-4) return min(ts/c, tA);',
    '  float a = 1.0 - ts*dz/(c*H);',
    '  return a > 0.0 ? min(-H/dz*log(a), tA) : tA;',
    '}',
    'float pdfTr(float c, float dz, float tA, float H, float s){',
    '  float tt = tauExp(c, dz, tA, H), den = 1.0 - exp(-tt);',
    '  return den > 0.0 ? c*exp(-s*dz/H)*exp(-tauExp(c, dz, s, H))/den : 0.0;',
    '}',
    'void main(){',
    '  ivec2 px = ivec2(gl_FragCoord.xy);',
    '  vec4 prev = texelFetch(uPrev, px, 0);',
    '  int jr = px.y >> 3;',
    '  if ((px.y & 7) != uPhase || jr < uBand0 || jr >= uBand1){ oCol = prev; return; }',
    '  rs = hsh(uint(px.x) + hsh(uint(px.y) + hsh(uSeed)));',
    '  float l0 = 380.0 + 340.0*rnd();',
    '  vec4 lam = vec4(l0, 380.0 + mod(l0 - 295.0, 340.0), 380.0 + mod(l0 - 210.0, 340.0), 380.0 + mod(l0 - 125.0, 340.0));',
    '  loadSpec(lam);',
    '  vec2 uv = (vec2(px) + vec2(rnd(), rnd()))/vec2(uRes)*2.0 - 1.0;',
    '  vec3 o = uCamPos, d = normalize(uCamF + uv.x*uTan.x*uCamR + uv.y*uTan.y*uCamU);',
    '  float tEnd = rayEnd(o, d);',
    '  bool hitC; float sc = trackCloud(o, d, tEnd, hitC); bool redC = gRed;',
    '  vec4 L = vec4(0.0);',
    '  vec3 bp0 = o, bp1 = o; vec4 bw0 = vec4(0.0), bw1 = vec4(0.0); int bt0 = 0, bt1 = 0; bool bred1 = false;',
    // branch 0: forced first air scattering along the camera ray
    // air in front of the first cloud collision (sc, sampled above): conditional on sc this is unbiased
    '  if (uAir == 1 && sc > 0.0){',
    '    float tA = sc, h0 = o.z;',
    '    float cR = dot(bRv, vec4(0.25))*exp(-h0/HR), cA = dot(kAv, vec4(0.25))*exp(-h0/HA);',
    '    float qR = 1.0 - exp(-tauExp(cR, d.z, tA, HR)), qA = 1.0 - exp(-tauExp(cA, d.z, tA, HA)), PR = qR/max(qR + qA, 1e-30);',
    '    float s = rnd() < PR ? sampleTr(cR, d.z, tA, HR) : sampleTr(cA, d.z, tA, HA);',
    '    s = min(s, tA*0.999999);',
    '    float pdf = PR*pdfTr(cR, d.z, tA, HR, s) + (1.0 - PR)*pdfTr(cA, d.z, tA, HA, s);',
    '    if (pdf > 0.0){',
    '      float h = o.z + s*d.z;',
    '      vec4 sR = bRv*exp(-h/HR), sAs = SSA*kAv*exp(-h/HA);',
    '      bp0 = o + s*d; bw0 = (sR + sAs)*airT(o.z, h, s)/pdf; bt0 = 2;',
    '    }',
    '  }',
    // branch 1: the camera ray itself (cloud collision, ground, or escape)
    '  vec4 w1 = airT(o.z, o.z + sc*d.z, sc);',
    '  if (hitC){ bp1 = o + sc*d; bw1 = w1; bt1 = 2; bred1 = redC; }',
    '  else if (d.z < 0.0){ bp1 = o + tEnd*d; bw1 = w1; bt1 = 1; }',
    '  else if (dot(d, uSun) > uSunCos) L += w1*F0v/uSunOmega;',
    '  for (int b = 0; b < 2; b++){',
    '    bool first = b == 0;',
    '    int vt = first ? bt0 : bt1;',
    '    if (vt == 0) continue;',
    '    vec3 pp = first ? bp0 : bp1;',
    '    if (first){ gSR = bRv*exp(-pp.z/HR); gSA = SSA*kAv*exp(-pp.z/HA); gSC = 0.0; gRed = false; }',
    '    else { gSR = vec4(0.0); gSA = vec4(0.0); gSC = 1.0; gRed = bred1; }',
    '    L += continuePath(pp, d, first ? bw0 : bw1, vt);',
    '  }',
    '  vec3 rgb = wbAt(lam.x)*L.x + wbAt(lam.y)*L.y + wbAt(lam.z)*L.z + wbAt(lam.w)*L.w;',
    '  if (!(rgb.r == rgb.r && rgb.g == rgb.g && rgb.b == rgb.b) || any(isinf(rgb))) rgb = vec3(0.0);',
    '  if (uStats == 1) rgb = vec3(float(nEv), capped ? 1.0 : 0.0, 0.0);',
    '  oCol = prev + vec4(rgb, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- display ---------------- */
  var DISP_FS = COMMON + '\n' + [
    'uniform sampler2D uAcc; uniform float uExpo; uniform ivec2 uSrc; uniform ivec2 uDst; uniform float uBlur;',
    'out vec4 o;',
    'float tone(float x){ return x <= 0.7 ? x : 0.7 + 0.3*(1.0 - exp(-(x - 0.7)/0.3)); }',
    'vec3 oetf(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(12.92*c, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
    'void main(){',
    '  ivec2 px = ivec2(gl_FragCoord.xy);',
    '  vec3 c = vec3(0.0);',
    '  if (uBlur < 0.3){ vec4 a = texelFetch(uAcc, px, 0); c = a.a > 0.0 ? a.rgb/a.a : vec3(0.0); }',
    '  else {',
    '    int r = min(6, int(ceil(2.0*uBlur))); vec4 sum = vec4(0.0);',
    '    for (int y = -6; y <= 6; y++) for (int x = -6; x <= 6; x++){',
    '      if (abs(x) > r || abs(y) > r) continue;',
    '      vec4 a = texelFetch(uAcc, clamp(px + ivec2(x, y), ivec2(0), uDst - 1), 0);',
    '      if (a.a > 0.0){ float w = exp(-float(x*x + y*y)/(2.0*uBlur*uBlur)); sum += w*vec4(a.rgb/a.a, 1.0); }',
    '    }',
    '    c = sum.a > 0.0 ? sum.rgb/sum.a : vec3(0.0);',
    '  }',
    '  c *= uExpo;',
    '  c = max(c, 0.0);',
    '  float Y = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  if (Y > 1e-6){ c *= tone(Y)/Y; }',
    '  float m = max(c.r, max(c.g, c.b));',
    '  if (m > 1.0){ c = mix(c/m, vec3(1.0), clamp((m - 1.0)/m, 0.0, 1.0)*0.85); }',
    '  vec3 s = oetf(c);',
    '  uint h = uint(gl_FragCoord.x)*1973u + uint(gl_FragCoord.y)*9277u; h = (h ^ (h >> 13u))*1274126177u;',
    '  float dn = (float(h & 1023u)/1023.0 - 0.5)/255.0;',
    '  o = vec4(s + dn, 1.0);',
    '}'
  ].join('\n');

  /* ================= JS side ================= */
  var gl = null, canvas = null, P = {}, ok = false, why = '', onLost = null;
  var T = { den: null, mac1: null, mac: null, spec: null, wb: null, acc: [null, null], fb: null };
  var S = {
    scene: null, sigC: 0, g: 0.85, air: 1, sunDir: [0, 0, 1], am: [1, 1, 1], sunCos: Math.cos(0.267 * Math.PI / 180), sunDisk: true,
    cam: { pos: [0, 0, 2], yaw: 0, pitch: 0, hfov: 75 },
    res: [2, 2], scale: 1, cur: 0, rowsDone: 0, phaseIdx: 0, sweeps: 0, band: 8, pending: null, frame: 0, expo: 1, dirty: true,
    maxSweeps: 4096, stats: 0, macN: [1, 1, 1], albGray: -1, interior: true, cloudOn: 1, noBlur: false
  };

  var PHASES = [0, 4, 2, 6, 1, 5, 3, 7];
  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); }
    return s;
  }
  function program(fs) {
    var p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  function init(cv) {
    canvas = cv;
    try {
      gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (!gl) { why = 'webgl2'; return false; }
      if (!gl.getExtension('EXT_color_buffer_float')) { why = 'float'; return false; }
      P.gen = program(GEN_FS); P.mac1 = program(MAC1_FS); P.mac2 = program(MAC2_FS); P.pt = program(PT_FS); P.disp = program(DISP_FS);
    } catch (e) { why = 'shader'; console.error('Cloud Shades 3D:', e && e.message ? e.message : e); return false; }
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ok = false; if (onLost) onLost(); });
    gl.bindVertexArray(gl.createVertexArray());
    T.fb = gl.createFramebuffer();
    // spectral tables
    var spec = new Float32Array(16 * 2 * 4);
    for (var i = 0; i < 16; i++) {
      spec[i * 4] = ATMO.F0[i]; spec[i * 4 + 1] = ATMO.bR[i]; spec[i * 4 + 2] = ATMO.kA[i]; spec[i * 4 + 3] = ATMO.kO[i];
      spec[64 + i * 4] = ATMO.ALB[i];
    }
    T.spec = tex2D(16, 2, gl.RGBA32F, gl.RGBA, gl.FLOAT, spec, gl.NEAREST);
    var wb = new Float32Array(69 * 4);
    for (i = 0; i < 69; i++) { wb[i * 4] = ATMO.WB[i][0]; wb[i * 4 + 1] = ATMO.WB[i][1]; wb[i * 4 + 2] = ATMO.WB[i][2]; }
    T.wb = tex2D(69, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, wb, gl.NEAREST);
    ok = true; return true;
  }
  function tex2D(w, h, ifmt, fmt, type, data, filt) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function tex3D(nx, ny, nz, ifmt, filt, periodic) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texStorage3D(gl.TEXTURE_3D, 1, ifmt, nx, ny, nz);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filt);
    var wr = periodic ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wr);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return t;
  }
  function drawLayers(tex, nx, ny, nz, prog, setU) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.viewport(0, 0, nx, ny); gl.useProgram(prog.p); gl.disable(gl.BLEND);
    for (var z = 0; z < nz; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
      gl.uniform1i(prog.u.uLayer, z); if (z === 0) setU(prog.u);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* scene: {type, periodic, O:[x,y,z], L:[x,y,z], N:[nx,ny,nz], hb, H, dmax, seed} */
  function setScene(sc, sync) {
    if (!ok) return;
    var same = S.scene && S.scene.N.join() === sc.N.join() && S.scene.periodic === sc.periodic;
    if (!same) {
      [T.den, T.mac1, T.mac].forEach(function (t) { if (t) gl.deleteTexture(t); });
      T.den = tex3D(sc.N[0], sc.N[1], sc.N[2], gl.R8, gl.LINEAR, sc.periodic);
      S.macN = sc.N.map(function (n) { return Math.ceil(n / 8); });
      T.mac1 = tex3D(S.macN[0], S.macN[1], S.macN[2], gl.RGBA8, gl.NEAREST, false);
      T.mac = tex3D(S.macN[0], S.macN[1], S.macN[2], gl.RGBA8, gl.NEAREST, false);
    }
    S.scene = sc;
    // the density field is built a few layers per frame so no single GPU submission runs long
    S.gen = { z: 0, per: Math.max(1, Math.round(1.5e6 / (sc.N[0] * sc.N[1]))) };
    S.macDirty = true; reset();
    if (sync) while (S.gen) pumpGen();
  }
  function pumpGen() {
    var sc = S.scene, g = S.gen, z1 = Math.min(sc.N[2], g.z + g.per);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.viewport(0, 0, sc.N[0], sc.N[1]); gl.useProgram(P.gen.p); gl.disable(gl.BLEND);
    var u = P.gen.u;
    gl.uniform1i(u.uType, sc.type); gl.uniform3i(u.uN, sc.N[0], sc.N[1], sc.N[2]);
    gl.uniform3f(u.uO, sc.O[0], sc.O[1], sc.O[2]); gl.uniform3f(u.uL, sc.L[0], sc.L[1], sc.L[2]);
    gl.uniform1f(u.uHb, sc.hb); gl.uniform1f(u.uH, sc.H); gl.uniform1f(u.uDmax, sc.dmax); gl.uniform1ui(u.uSeedI, sc.seed >>> 0);
    for (var z = g.z; z < z1; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, T.den, 0, z);
      gl.uniform1i(u.uLayer, z); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    g.z = z1;
    if (g.z >= sc.N[2]) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, T.den);
      drawLayers(T.mac1, S.macN[0], S.macN[1], S.macN[2], P.mac1, function (u2) {
        gl.uniform1i(u2.uDen, 0); gl.uniform3i(u2.uN, sc.N[0], sc.N[1], sc.N[2]); gl.uniform1i(u2.uPeriodic, sc.periodic ? 1 : 0);
      });
      S.gen = null; S.macDirty = true; reset();
    }
  }
  function updateInterior() {
    var sc = S.scene; if (!sc) return;
    var cell = [sc.L[0] / S.macN[0], sc.L[1] / S.macN[1], sc.L[2] / S.macN[2]];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, T.mac1);
    drawLayers(T.mac, S.macN[0], S.macN[1], S.macN[2], P.mac2, function (u) {
      gl.uniform1i(u.uMac1, 0); gl.uniform3i(u.uM, S.macN[0], S.macN[1], S.macN[2]); gl.uniform1i(u.uPeriodic, sc.periodic ? 1 : 0);
      gl.uniform1f(u.uSigC, S.interior ? S.sigC : 0); gl.uniform1f(u.uCmin, Math.min(cell[0], cell[1], cell[2]));
    });
    S.macDirty = false;
  }
  function setSigma(sigC) { if (sigC !== S.sigC) { S.sigC = sigC; S.macDirty = true; reset(); } }
  function setSun(elevDeg, azDeg) {
    var e = elevDeg * Math.PI / 180, a = azDeg * Math.PI / 180;
    S.sunDir = [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
    S.am = ATMO.airMasses(elevDeg);
    S.expo = 0.85 / ATMO.cardY(elevDeg);
    reset();
  }
  function setCamera(c) { S.cam = { pos: c.pos.slice(), yaw: c.yaw, pitch: c.pitch, hfov: c.hfov }; reset(); }
  function setOptions(o) { if ('air' in o) S.air = o.air; if ('sunDisk' in o) S.sunDisk = o.sunDisk; if ('stats' in o) S.stats = o.stats; if ('albGray' in o) S.albGray = o.albGray; if ('interior' in o) { S.interior = o.interior; S.macDirty = true; } if ('cloudOn' in o) S.cloudOn = o.cloudOn; reset(); }
  function reset() { S.dirty = true; }

  function allocAcc(w, h) {
    for (var i = 0; i < 2; i++) {
      if (T.acc[i]) gl.deleteTexture(T.acc[i]);
      T.acc[i] = tex2D(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST);
    }
    S.res = [w, h];
  }
  function clearAcc() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    for (var i = 0; i < 2; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.acc[i], 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    S.rowsDone = 0; S.phaseIdx = 0; S.sweeps = 0; S.frame = 0;
  }
  function setResolution(w, h) {
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
    if (w !== S.res[0] || h !== S.res[1] || !T.acc[0]) { allocAcc(w, h); canvas.width = w; canvas.height = h; S.dirty = true; }
  }
  function camBasis() {
    var c = S.cam, y = c.yaw * Math.PI / 180, p = c.pitch * Math.PI / 180;
    var f = [Math.cos(p) * Math.sin(y), Math.cos(p) * Math.cos(y), Math.sin(p)];
    var r = [Math.cos(y), -Math.sin(y), 0];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var tx = Math.tan(c.hfov * Math.PI / 360), ty = tx * S.res[1] / S.res[0];
    return { f: f, r: r, u: u, t: [tx, ty] };
  }

  /* render one band of rows; returns 1 if rendering work was submitted, 2 if scene-building work, 0 if idle */
  function step(rows) {
    if (!ok || !S.scene) return 0;
    if (S.gen) { pumpGen(); return 2; }
    if (S.macDirty) updateInterior();
    if (S.dirty) { clearAcc(); S.dirty = false; }
    if (S.sweeps >= S.maxSweeps) return 0;
    var W = S.res[0], H = S.res[1], ph = PHASES[S.phaseIdx], nJ = Math.ceil((H - ph) / 8);
    var y0 = S.rowsDone, y1 = Math.min(nJ, y0 + Math.max(1, Math.round(rows)));
    var src = T.acc[S.cur], dst = T.acc[1 - S.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.viewport(0, 0, W, H);
    var u = P.pt.u, sc = S.scene, b = camBasis();
    gl.useProgram(P.pt.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(u.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, T.den); gl.uniform1i(u.uDen, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, T.mac); gl.uniform1i(u.uMac, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.spec); gl.uniform1i(u.uSpec, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.wb); gl.uniform1i(u.uWB, 4);
    gl.uniform2i(u.uRes, W, H); gl.uniform1i(u.uBand0, y0); gl.uniform1i(u.uBand1, y1); gl.uniform1i(u.uPhase, ph);
    gl.uniform1ui(u.uSeed, (S.frame * 2654435761 + 12345) >>> 0);
    gl.uniform3fv(u.uCamPos, S.cam.pos); gl.uniform3fv(u.uCamF, b.f); gl.uniform3fv(u.uCamR, b.r); gl.uniform3fv(u.uCamU, b.u); gl.uniform2fv(u.uTan, b.t);
    gl.uniform3fv(u.uSun, S.sunDir); gl.uniform3fv(u.uAM, S.am);
    gl.uniform1f(u.uSunCos, S.sunDisk ? S.sunCos : 2.0); gl.uniform1f(u.uSunOmega, 2 * Math.PI * (1 - S.sunCos));
    gl.uniform3fv(u.uBoxO, sc.O); gl.uniform3fv(u.uBoxL, sc.L);
    gl.uniform3f(u.uCell, sc.L[0] / S.macN[0], sc.L[1] / S.macN[1], sc.L[2] / S.macN[2]);
    gl.uniform3i(u.uMacN, S.macN[0], S.macN[1], S.macN[2]); gl.uniform1i(u.uPeriodic, sc.periodic ? 1 : 0);
    gl.uniform1i(u.uCloudOn, S.cloudOn); gl.uniform1f(u.uSigC, S.sigC); gl.uniform1f(u.uG, S.g); gl.uniform1i(u.uAir, S.air); gl.uniform1i(u.uStats, S.stats); gl.uniform1f(u.uAlbGray, S.albGray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    S.cur = 1 - S.cur; S.frame++;
    S.rowsDone = y1;
    if (S.rowsDone >= nJ) { S.rowsDone = 0; S.phaseIdx++; if (S.phaseIdx >= 8) { S.phaseIdx = 0; S.sweeps++; } }
    return 1;
  }
  function display() {
    if (!ok || !T.acc[0]) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(P.disp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.acc[S.cur]);
    gl.uniform1i(P.disp.u.uAcc, 0); gl.uniform1f(P.disp.u.uExpo, S.expo);
    gl.uniform2i(P.disp.u.uDst, canvas.width, canvas.height);
    var spp = S.sweeps + (S.phaseIdx + S.rowsDone / Math.max(1, S.res[1] / 8)) / 8;
    gl.uniform1f(P.disp.u.uBlur, S.noBlur ? 0 : Math.min(4, 5 / Math.sqrt(Math.max(spp, 0.25))));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function readMean(x0, y0, w, h) {  // mean of accumulated values (for tests)
    var out = new Float32Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.acc[S.cur], 0);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
  function readMacLayer(z) {
    var n = S.macN[0] * S.macN[1], out = new Uint8Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, T.mac, 0, z);
    gl.readPixels(0, 0, S.macN[0], S.macN[1], gl.RGBA, gl.UNSIGNED_BYTE, out); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return Array.from(out.slice(0, 8));
  }
  function fence() { return gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); }
  function fenceDone(f) { var s = gl.clientWaitSync(f, 0, 0); if (s === gl.ALREADY_SIGNALED || s === gl.CONDITION_SATISFIED) { gl.deleteSync(f); return true; } return false; }

  return { init: init, setScene: setScene, setSigma: setSigma, setSun: setSun, setCamera: setCamera, setOptions: setOptions,
    setResolution: setResolution, step: step, readMacLayer: readMacLayer, display: display, readMean: readMean, reset: reset, fence: fence, fenceDone: fenceDone,
    state: S, ok: function () { return ok; }, onContextLost: function (f) { onLost = f; }, why: function () { return why; }, finish: function () { gl.finish(); } };
})();
