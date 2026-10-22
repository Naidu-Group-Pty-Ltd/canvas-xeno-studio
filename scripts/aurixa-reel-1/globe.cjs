// Reel 1's satellite globe (BRIEF.md: G-SATELLITE and G-PINS), for 01.1 and the first moment of 01.2: the Earth
// from orbit, traced pixel by pixel in a WebGL2 shader, and the white pins standing on it, drawn from one camera
// that the scene's state sets for each drawing.
//
// The imagery is satellite.py's: NASA's Blue Marble Next Generation with Natural Earth's shaded relief (both
// public domain), the coast redrawn from GLOBE's land mask (NOAA) and the towns and cities laid on from GeoNames
// (CC BY 4.0). It comes as three textures, the whole Earth, Australia and the New South Wales coast, each at its
// own resolution and blended where they meet, so the relief sharpens as the camera nears. The pins are
// docs/brands/aurixa-reel-1/system-edition/pins.json, which satellite.py writes.
//
// How a drawing happens: the page carries the shaders, the textures (inlined as data URLs: WebGL can't read an
// image from the renderer's asset host, which sends no CORS header) and the pins. The scene's state writes the
// camera, the time and the gold pin's moment into #globe-state as JSON ($text); a MutationObserver draws the
// canvas from it, and does so before render.cjs captures the frame (the observer's microtask runs before
// __apply's own continuation). The canvas keeps its drawing between frames, so a frame that changes nothing
// costs nothing.
//
// The camera, the projection and the pins' sizes and poses are one function's source (MATH), run by the scenes in
// Node and by the page in the browser: the card a scene lays over the map stands exactly on its pin.
const fs = require("fs");
const path = require("path");

/** The geometry both sides run. Pure: no DOM, no Node. Distances in km; frame px with y down. */
function MATH() {
  const R = 6371;
  const D = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => mul(a, 1 / len(a));
  /** A point on (or `h` km above) the Earth: x toward 0° 0°, z toward the north pole. */
  const ll = (lon, lat, h = 0) => {
    const c = Math.cos(lat * D);
    const r = R + h;
    return [r * c * Math.cos(lon * D), r * c * Math.sin(lon * D), r * Math.sin(lat * D)];
  };
  /** The ground's own directions at a point: east, north and up. */
  const local = (lon, lat) => {
    const l = lon * D;
    const p = lat * D;
    return {
      e: [-Math.sin(l), Math.cos(l), 0],
      n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
      u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
    };
  };
  /**
   * A camera looking at the ground point (lon, lat) from `dist` km away, `tilt` degrees from straight down,
   * toward `heading` (degrees clockwise from north), with a vertical field of view of `fov` degrees; the point it
   * looks at lands on the frame at `at` ([x, y] frame px), a frame `W` x `H`.
   */
  const camera = ({ lon, lat, dist, heading, tilt, fov, at }, W, H) => {
    const T = ll(lon, lat);
    const { e, n, u } = local(lon, lat);
    const h = add(mul(n, Math.cos(heading * D)), mul(e, Math.sin(heading * D)));
    const fwd = norm(add(mul(u, -Math.cos(tilt * D)), mul(h, Math.sin(tilt * D))));
    const pos = sub(T, mul(fwd, dist));
    const right = norm(cross(h, u));
    const up = cross(right, fwd);
    return { pos, fwd, right, up, f: H / 2 / Math.tan((fov * D) / 2), cx: at[0], cy: at[1], W, H, dist };
  };
  /** Where a world point lands on the frame: [x, y, its depth along the camera's axis]. */
  const project = (c, P) => {
    const q = sub(P, c.pos);
    const z = dot(q, c.fwd);
    return [c.cx + (c.f * dot(q, c.right)) / z, c.cy - (c.f * dot(q, c.up)) / z, z];
  };
  /** Whether the camera sees a point of the ground (the near side of the Earth). */
  const facing = (c, P) => dot(P, sub(c.pos, P)) > 0;
  /** The camera's height above the ground, km. */
  const altitude = (c) => len(c.pos) - R;
  /**
   * A pin's height on the frame (frame px): small from orbit and growing as the camera falls, as a map's markers
   * grow when it zooms, and a little larger nearer the camera than further from it.
   */
  const pinSize = (c, z) =>
    Math.min(15 * Math.pow(9000 / Math.max(altitude(c), 200), 0.3), 28) * Math.pow(c.dist / z, 0.6);
  const FALL = 0.3;
  /**
   * A pin's pose `tau` seconds after it touches down (negative while it falls): how high it stands above its
   * point (in its own heights), how opaque it is and its shadow, its landing ripple (0 to 1, or -1) and the
   * pinpoint of light at its tip. Null before it appears.
   */
  const pinPose = (tau) => {
    if (tau < -FALL) return null;
    if (tau < 0) {
      const u = 1 + tau / FALL;
      return { lift: 2.6 * (1 - u) * (1 - u), alpha: Math.min(1, u * 2.5), shadow: u * u, ripple: -1, tip: 0.2 * u };
    }
    return {
      lift: 0.2 * Math.abs(Math.sin((Math.PI * tau) / 0.17)) * Math.exp(-tau / 0.1),
      alpha: 1,
      shadow: 1,
      ripple: tau < 0.5 ? tau / 0.5 : -1,
      tip: 0.3 + 0.7 * Math.exp(-tau / 0.22),
    };
  };
  /** The pin's head on the frame (its centre), for a pin standing at P raised `lift` px and `size` px tall. */
  const head = (c, P, size, lift) => {
    const [x, y] = project(c, P);
    return [x, y - lift - 0.71 * size];
  };
  return { R, D, add, sub, mul, dot, cross, len, norm, ll, local, camera, project, facing, altitude, pinSize, pinPose, head, FALL };
}

// ------------------------------------------------------------------ the shaders
const QUAD_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The Earth: each pixel's ray traced to the sphere, its ground read from the three textures and lit. Drawn at the
 * frame's own resolution (the ground is all filtered texture and the limb is antialiased analytically, so twice
 * the pixels would buy nothing but four times the cost); every branch below skips work a pixel doesn't need.
 */
const GLOBE_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uPos, uFwd, uRight, uUp;
uniform float uF;
uniform vec2 uC;
uniform vec3 uSun;
uniform sampler2D uTexG, uTexA, uTexN;
uniform vec4 uBoxA, uBoxN;     // lon west, lon east, lat north, lat south
uniform vec4 uDof;             // focus y (px), sharp half band (px), falloff (px), most blur (log2)
uniform vec4 uRing;            // the gold pin's point (unit vector), its ring's radius (km)
uniform vec4 uRingStyle;       // ring alpha, ring half width (km), the pool of light's strength, its radius (km)
uniform float uRingCos;        // the cosine of the furthest the ring and the pool reach (a pixel beyond skips them)
uniform vec4 uLook;            // exposure, the ground's dimming, vignette, haze
out vec4 o;

const float R = 6371.0;
const float HA = 110.0;        // the atmosphere's visible shell, km

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// A region's texture, and how much of it to take (1 inside, fading to 0 over fade degrees at its edges).
vec3 boxed(sampler2D tex, vec4 box, float lon, float lat, vec2 dLon, vec2 dLat, float fade, out float w) {
  vec2 span = vec2(box.y - box.x, box.z - box.w);
  vec2 uv = vec2((lon - box.x) / span.x, (box.z - lat) / span.y);
  vec2 e = min(uv, 1.0 - uv) * span / fade;
  w = clamp(min(e.x, e.y), 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);
  return textureGrad(tex, clamp(uv, 0.0, 1.0), vec2(dLon.x / span.x, -dLat.x / span.y),
                     vec2(dLon.y / span.x, -dLat.y / span.y)).rgb;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 dir = normalize(uFwd * uF + uRight * (p.x - uC.x) - uUp * (p.y - uC.y));
  float b = dot(uPos, dir);
  float disc = b * b - (dot(uPos, uPos) - R * R);
  float tHit = -b - sqrt(max(disc, 0.0));
  bool hit = disc > 0.0 && tHit > 0.0;
  float tClose = max(-b, 0.0);
  vec3 closest = uPos + dir * tClose;
  // How much of this pixel the Earth covers: the ray's closest pass against the limb, in pixels.
  float cover = clamp(0.5 - (length(closest) - R) / (max(tClose, 1.0) / uF), 0.0, 1.0);
  vec3 P = hit ? uPos + dir * tHit : normalize(closest) * R;
  vec3 N = P / R;
  // Where the pixel falls on the ground, and its footprint there (taken here, where every pixel takes it).
  float lon = degrees(atan(N.y, N.x));
  float lat = degrees(asin(clamp(N.z, -1.0, 1.0)));
  vec2 dLon = vec2(dFdx(lon), dFdy(lon));
  dLon -= 360.0 * floor(dLon / 360.0 + 0.5);
  vec2 dLat = vec2(dFdx(lat), dFdy(lat));
  float cl = cos(radians(lat));
  float kmPerPx = 111.2 * max(length(vec2(dLat.x, dLon.x * cl)), length(vec2(dLat.y, dLon.y * cl)));

  // The atmosphere's shell along the ray (the ground's haze and the limb's glow both need it).
  float Ra = R + HA;
  float da = b * b - (dot(uPos, uPos) - Ra * Ra);
  float sa = sqrt(max(da, 0.0));
  float tIn = max(-b - sa, 0.0);
  float tOut = -b + sa;

  vec3 ground = vec3(0.0);
  if (cover > 0.0) {
    // The ground: the three textures, each read at the pixel's own footprint (widened away from the focus).
    float blur = exp2(uDof.w * smoothstep(uDof.y, uDof.y + uDof.z, abs(p.y - uDof.x)));
    vec2 gLon = dLon * blur;
    vec2 gLat = dLat * blur;
    vec3 col = textureGrad(uTexG, vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0),
                           vec2(gLon.x / 360.0, -gLat.x / 180.0), vec2(gLon.y / 360.0, -gLat.y / 180.0)).rgb;
    if (lon > uBoxA.x && lon < uBoxA.y && lat < uBoxA.z && lat > uBoxA.w) {
      float wA;
      vec3 cA = boxed(uTexA, uBoxA, lon, lat, gLon, gLat, 2.0, wA);
      col = mix(col, cA, wA);
      if (lon > uBoxN.x && lon < uBoxN.y && lat < uBoxN.z && lat > uBoxN.w) {
        float wN;
        vec3 cN = boxed(uTexN, uBoxN, lon, lat, gLon, gLat, 0.8, wN);
        col = mix(col, cN, wN);
      }
    }
    col = col * (col * (col * 0.305306011 + 0.682171111) + 0.012522878); // sRGB to linear
    // The light: a low warm sun from the north-west and the sky's blue; the sea takes the sun's glint.
    float ndl = dot(N, uSun);
    float day = smoothstep(-0.1, 0.3, ndl);
    vec3 sunCol = vec3(1.0, 0.88, 0.72);
    vec3 skyCol = vec3(0.36, 0.48, 0.68);
    float direct = day * (0.42 + 0.58 * clamp(ndl * 1.5, 0.0, 1.0));
    vec3 lit = col * (skyCol * 0.32 + sunCol * 1.55 * direct);
    float water = smoothstep(1.25, 1.9, col.b / max(max(col.r, col.g), 1e-4));
    if (water > 0.0) {
      vec3 V = -dir;
      float nh = max(dot(N, normalize(uSun + V)), 0.0);
      float spec = pow(nh, 1400.0) * 0.18;
      float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
      lit += water * (sunCol * spec * day + skyCol * fres * 0.25);
    }
    // The gold pin's light on the ground, and the ring it sends out (only where they can reach).
    float cg = dot(N, uRing.xyz);
    if (cg > uRingCos) {
      vec3 gold = vec3(0.913, 0.638, 0.195);
      float gd = acos(clamp(cg, -1.0, 1.0)) * R;
      lit += gold * uRingStyle.z * exp(-(gd * gd) / max(uRingStyle.w * uRingStyle.w, 1e-3)) * 0.6;
      float aa = max(kmPerPx, 1e-3);
      lit += gold * 1.6 * uRingStyle.x * (1.0 - smoothstep(uRingStyle.y, uRingStyle.y + aa, abs(gd - uRing.w)));
    }
    // The haze over the ground, thickening toward the limb.
    float pathGround = da > 0.0 ? max((hit ? tHit : tOut) - tIn, 0.0) : 0.0;
    vec3 mid = normalize(uPos + dir * (tIn + 0.5 * pathGround));
    vec3 hazeCol = vec3(0.5, 0.64, 0.92) * (0.1 + 1.1 * smoothstep(-0.25, 0.35, dot(mid, uSun)));
    ground = mix(lit, hazeCol, (1.0 - exp(-pathGround / HA * 0.085)) * uLook.w);
  }
  vec3 sky = vec3(0.0);
  if (cover < 1.0) {
    // Space: a few stars, and the atmosphere's glow along the limb.
    vec3 sd = dir * uF * 0.5;
    vec3 cell = floor(sd);
    float star = 0.0;
    if (hash13(cell) > 0.9965) {
      vec3 sp = cell + 0.5 + (vec3(hash13(cell + 11.0), hash13(cell + 23.0), hash13(cell + 37.0)) - 0.5) * 0.6;
      star = smoothstep(0.9, 0.0, length(sd - sp)) * (0.3 + 0.7 * hash13(cell + 5.0));
    }
    float pathSky = da > 0.0 ? max(tOut - tIn, 0.0) : 0.0;
    vec3 mid = normalize(uPos + dir * (tIn + 0.5 * pathSky));
    vec3 hazeCol = vec3(0.3, 0.5, 1.0) * (0.1 + 1.25 * smoothstep(-0.25, 0.35, dot(mid, uSun)));
    float rim = 1.0 - exp(-pathSky / HA * 0.16);
    float halo = exp(-max(length(closest) - R, 0.0) / 260.0) * 0.18;
    sky = vec3(0.0035, 0.006, 0.014) + vec3(0.9, 0.95, 1.0) * star * 0.55 + hazeCol * (rim + halo);
  }
  vec3 colour = mix(sky, ground, cover) * uLook.y;
  // A vignette, then the film's curve.
  vec2 q = p / uRes - 0.5;
  colour *= 1.0 - uLook.z * smoothstep(0.25, 0.95, length(q * vec2(1.25, 0.95)));
  o = vec4(toSrgb(filmic(colour * uLook.x)), 1.0);
}`;

/**
 * The pins: one quad each, per pass (0: shadows and ripples on the ground; 1: the pins; 2: the gold pin's glow),
 * on their own canvas at twice the frame's resolution, over the Earth's.
 */
const PIN_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 a0;   // tip x, tip y (canvas px, y down), height (px), lift (px)
layout(location = 2) in vec4 a1;   // opacity, gold (0 to 1), shadow, ripple (0 to 1, or -1)
layout(location = 3) in vec4 a2;   // km east and km north per canvas px: [e; n] = [a2.xy; a2.zw] . [dx; dy]
layout(location = 4) in vec4 a3;   // shadow direction (east, north), shadow length (km), head radius (km)
layout(location = 5) in vec4 a4;   // glow, the ground quad's half size (px), the tip's light, spare
uniform vec2 uRes;
uniform int uPass;
out vec2 vPx;
flat out vec4 v0;
flat out vec4 v1;
flat out vec4 v2;
flat out vec4 v3;
flat out vec4 v4;
void main() {
  vec2 base = a0.xy;
  float H = a0.z;
  vec2 lo;
  vec2 hi;
  if (uPass == 0) {
    lo = base - vec2(a4.y);
    hi = base + vec2(a4.y);
  } else if (uPass == 1) {
    float w = 0.62 * H + 3.0;
    lo = vec2(base.x - w, base.y - a0.w - 1.12 * H - 3.0);
    hi = vec2(base.x + w, base.y - a0.w + 0.3 * H + 3.0);
  } else {
    float r = 2.6 * H;
    vec2 c = vec2(base.x, base.y - a0.w * 0.5 - 0.5 * H);
    lo = c - vec2(r, r + a0.w * 0.5);
    hi = c + vec2(r, r + a0.w * 0.5);
  }
  vPx = mix(lo, hi, aCorner * 0.5 + 0.5);
  v0 = a0;
  v1 = a1;
  v2 = a2;
  v3 = a3;
  v4 = a4;
  gl_Position = vec4(vPx.x / uRes.x * 2.0 - 1.0, 1.0 - vPx.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const PIN_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vPx;
flat in vec4 v0;
flat in vec4 v1;
flat in vec4 v2;
flat in vec4 v3;
flat in vec4 v4;
uniform int uPass;
uniform float uDpr;
out vec4 o;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
}
float sq(float x) { return x * x; }

void main() {
  vec2 base = v0.xy;
  float H = v0.z;
  float lift = v0.w;
  float alpha = v1.x;
  float gold = v1.y;
  if (uPass == 0) {
    // On the ground, in km: the shadow (the stem's thin line and the head's soft disc, away from the sun) and
    // the ripple a pin sends out as it lands.
    vec2 q = vPx - base;
    vec2 g = vec2(dot(v2.xy, q), dot(v2.zw, q));
    float hr = v3.w;
    vec2 sd = v3.xy * v3.z;
    float sStem = exp(-sq(sdSeg(g, vec2(0.0), sd * 0.78) / (hr * 0.22)));
    float sHead = exp(-sq(length(g - sd) / (hr * 0.95)));
    float sh = max(sStem * 0.75, sHead) * v1.z * 0.2 * alpha;
    float ring = 0.0;
    if (v1.w >= 0.0) {
      float k = 1.0 - v1.w;
      ring = exp(-sq((length(g) - hr * (0.6 + 5.0 * v1.w)) / (hr * 0.35))) * k * k * 0.4;
    }
    vec3 rc = mix(vec3(1.0), vec3(0.96, 0.82, 0.48), gold);
    o = vec4(rc * ring, ring) + vec4(0.0, 0.0, 0.0, sh) * (1.0 - ring);
    return;
  }
  if (uPass == 1) {
    // The pin, in its own heights from its tip: a round head on a slim stem, lit from the north-west.
    vec2 q = vec2(vPx.x - base.x, base.y - lift - vPx.y) / H;
    float r = 0.29;
    vec2 hc = vec2(0.0, 1.0 - r);
    float dHead = length(q - hc) - r;
    float dStem = sdSeg(q, vec2(0.0, 0.0), hc) - 0.034;
    float d = min(dHead, dStem) * H;
    float cover = clamp(0.5 - d / 0.8, 0.0, 1.0);
    float inner = clamp(0.5 - (d + 1.1 * uDpr) / 0.8, 0.0, 1.0);
    vec2 n = (q - hc) / r;
    float onHead = step(dHead, dStem);
    float shade = mix(0.86, clamp(0.88 + 0.16 * (n.y * 0.7 - n.x * 0.5), 0.0, 1.1), onHead);
    float spec = onHead * smoothstep(0.42, 0.0, length(n - vec2(-0.32, 0.38))) * 0.55;
    vec3 body = mix(vec3(0.985), vec3(0.784, 0.608, 0.235) * 1.06, gold) * shade
      + spec * mix(vec3(1.0), vec3(1.0, 0.93, 0.72), gold);
    vec3 rim = mix(vec3(0.2, 0.24, 0.3), vec3(0.42, 0.3, 0.08), gold);
    vec3 col = mix(rim, body, inner);
    float a = cover * alpha;
    float tip = length(q) * H;
    float pt = (exp(-sq(tip / (0.07 * H + 0.6 * uDpr))) * 0.9 + exp(-sq(tip / (0.22 * H))) * 0.25) * v4.z * alpha;
    vec3 tipCol = mix(vec3(0.85, 0.95, 1.0), vec3(1.0, 0.88, 0.55), gold);
    o = vec4(col * a + tipCol * pt * (1.0 - a), a + pt * (1.0 - a));
    return;
  }
  // The gold pin's glow round its head, and a thread of light down to its point while it stands raised.
  vec2 hd = vec2(base.x, base.y - lift - 0.71 * H);
  float d = length(vPx - hd) / H;
  float glow = (exp(-d * d * 3.0) * 0.55 + exp(-d * 1.6) * 0.25) * v4.x;
  float inShaft = step(base.y - lift, vPx.y) * step(vPx.y, base.y);
  float shaft = inShaft * exp(-sq((vPx.x - base.x) / (0.05 * H + uDpr))) * 0.6 * v4.x
    * (0.35 + 0.65 * (vPx.y - (base.y - lift)) / max(lift, 1.0));
  vec3 c = vec3(0.96, 0.82, 0.48) * (glow + shaft);
  o = vec4(c, max(c.r, max(c.g, c.b)));
}`;

// ------------------------------------------------------------------ the page
/**
 * The page's own program: runs in the browser, given MATH, the pins and the configuration. Two canvases, each
 * with its own WebGL2 context: the Earth at the frame's resolution and the pins over it at twice that.
 */
function pageMain(M, PINS, CFG) {
  const earthCanvas = document.getElementById("globe");
  const pinCanvas = document.getElementById("globe-pins");
  const stateEl = document.getElementById("globe-state");
  const W = CFG.W;
  const H = CFG.H;
  const compile = (gl, vs, fs) => {
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`globe shader: ${gl.getShaderInfoLog(s)}`);
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`globe program: ${gl.getProgramInfoLog(prog)}`);
    const where = new Map();
    prog.u = (name) => {
      if (!where.has(name)) where.set(name, gl.getUniformLocation(prog, name));
      return where.get(name);
    };
    return prog;
  };
  const texture = (gl, img, unit, wrapS) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    // Stored as they are encoded (sRGB) and decoded in the shader: SwiftShader decoding every texel of an sRGB
    // texture doubles the Earth's cost, and filtering before decoding is invisible at these scales.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso && CFG.aniso > 1) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, CFG.aniso);
    return t;
  };
  let E = null; // the Earth's context and program
  let P = null; // the pins'
  const init = () => {
    if (E && P) return;
    const ge = earthCanvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!ge) throw new Error("globe: no WebGL2");
    const earth = compile(ge, CFG.QUAD_VS, CFG.GLOBE_FS);
    texture(ge, document.getElementById("tex-g"), 0, ge.REPEAT);
    texture(ge, document.getElementById("tex-a"), 1, ge.CLAMP_TO_EDGE);
    texture(ge, document.getElementById("tex-n"), 2, ge.CLAMP_TO_EDGE);
    ge.bindVertexArray(ge.createVertexArray());
    const gp = pinCanvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
    });
    const pins = compile(gp, CFG.PIN_VS, CFG.PIN_FS);
    // The pins' vertex arrays: all of them, and the gold pin alone (its glow).
    const layout = (buf) => {
      const vao = gp.createVertexArray();
      gp.bindVertexArray(vao);
      gp.bindBuffer(gp.ARRAY_BUFFER, corners);
      gp.enableVertexAttribArray(0);
      gp.vertexAttribPointer(0, 2, gp.FLOAT, false, 0, 0);
      gp.bindBuffer(gp.ARRAY_BUFFER, buf);
      for (let k = 0; k < 5; k++) {
        gp.enableVertexAttribArray(1 + k);
        gp.vertexAttribPointer(1 + k, 4, gp.FLOAT, false, 80, k * 16);
        gp.vertexAttribDivisor(1 + k, 1);
      }
      return vao;
    };
    const corners = gp.createBuffer();
    gp.bindBuffer(gp.ARRAY_BUFFER, corners);
    gp.bufferData(gp.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gp.STATIC_DRAW);
    const allBuf = gp.createBuffer();
    const goldBuf = gp.createBuffer();
    E = { gl: ge, prog: earth };
    P = {
      gl: gp,
      prog: pins,
      allBuf,
      goldBuf,
      vaoAll: layout(allBuf),
      vaoGold: layout(goldBuf),
      inst: new Float32Array((PINS.length + 1) * 20),
    };
    for (const p of PINS.concat([CFG.goldPin])) {
      p.P = M.ll(p.lon, p.lat);
      const { e, n } = M.local(p.lon, p.lat);
      p.e = e;
      p.n = n;
    }
  };
  const SUN = M.norm(M.ll(CFG.sun[0], CFG.sun[1]));
  const GOLD = M.norm(M.ll(CFG.gold[0], CFG.gold[1]));

  const drawEarth = (S, cam) => {
    const { gl, prog } = E;
    const k = earthCanvas.width / W;
    gl.viewport(0, 0, earthCanvas.width, earthCanvas.height);
    gl.useProgram(prog);
    gl.uniform2f(prog.u("uRes"), earthCanvas.width, earthCanvas.height);
    gl.uniform3fv(prog.u("uPos"), cam.pos);
    gl.uniform3fv(prog.u("uFwd"), cam.fwd);
    gl.uniform3fv(prog.u("uRight"), cam.right);
    gl.uniform3fv(prog.u("uUp"), cam.up);
    gl.uniform1f(prog.u("uF"), cam.f * k);
    gl.uniform2f(prog.u("uC"), cam.cx * k, cam.cy * k);
    gl.uniform3fv(prog.u("uSun"), SUN);
    gl.uniform1i(prog.u("uTexG"), 0);
    gl.uniform1i(prog.u("uTexA"), 1);
    gl.uniform1i(prog.u("uTexN"), 2);
    gl.uniform4fv(prog.u("uBoxA"), CFG.boxA);
    gl.uniform4fv(prog.u("uBoxN"), CFG.boxN);
    const dof = S.dof || [960, 4000, 1, 0];
    gl.uniform4f(prog.u("uDof"), dof[0] * k, dof[1] * k, dof[2] * k, dof[3]);
    const g = S.gold || {};
    gl.uniform4f(prog.u("uRing"), GOLD[0], GOLD[1], GOLD[2], g.ringR || 0);
    gl.uniform4f(prog.u("uRingStyle"), g.ringA || 0, g.ringW || 1, g.pool || 0, g.poolR || 1);
    const reach = (g.ringA > 0 ? (g.ringR || 0) + 4 * (g.ringW || 1) : 0) + (g.pool > 0 ? 3 * (g.poolR || 1) : 0);
    gl.uniform1f(prog.u("uRingCos"), reach > 0 ? Math.cos(Math.min(reach / M.R, 3)) : 2);
    const look = S.look || [1, 1, 0.3, 1];
    gl.uniform4f(prog.u("uLook"), look[0], look[1], look[2], look[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const drawPins = (S, cam) => {
    const { gl, prog, inst } = P;
    const k = pinCanvas.width / W;
    gl.viewport(0, 0, pinCanvas.width, pinCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const g = S.gold || {};
    const turned = (g.colour || 0) > 0;
    const list = [];
    for (const p of PINS.concat([CFG.goldPin])) {
      const gold = p === CFG.goldPin;
      const pose = M.pinPose(S.t - p.land);
      if (!pose || !M.facing(cam, p.P)) continue;
      const [x, y, z] = M.project(cam, p.P);
      if (z <= 0 || x < -80 || x > W + 80 || y < -120 || y > H + 80) continue;
      const size = M.pinSize(cam, z) * p.size * (gold ? g.scale || 1 : 1);
      list.push({ p, gold, pose, x, y, z, size });
    }
    // Far to near; the gold pin last once it has turned, so it stands in front of the field it rises from.
    list.sort((a, b) => (a.gold && turned) - (b.gold && turned) || b.z - a.z);
    let n = 0;
    let goldAt = -1;
    for (const { p, gold, pose, x, y, size } of list) {
      // The ground's Jacobian here: canvas px per km east and per km north, and its inverse.
      const [ex, ey] = M.project(cam, M.add(p.P, p.e));
      const [nx, ny] = M.project(cam, M.add(p.P, p.n));
      const a = (ex - x) * k;
      const b = (nx - x) * k;
      const c = (ey - y) * k;
      const d = (ny - y) * k;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-9) continue;
      const pxPerKm = Math.sqrt(Math.abs(det));
      const Hpx = size * k;
      const ripple = gold && turned ? -1 : pose.ripple;
      inst.set(
        [
          x * k, y * k, Hpx, (pose.lift + (gold ? g.rise || 0 : 0)) * Hpx,
          pose.alpha * (gold ? 1 : S.dim ?? 1), gold ? g.colour || 0 : 0, pose.shadow * (gold ? 1 - 0.6 * (g.rise || 0) : 1), ripple,
          d / det, -b / det, -c / det, a / det,
          CFG.shadowDir[0], CFG.shadowDir[1], (0.8 * Hpx) / pxPerKm, (0.3 * Hpx) / pxPerKm,
          gold ? g.glow || 0 : 0, Hpx * (ripple >= 0 ? 2.0 : 1.2) + 4, pose.tip, 0,
        ],
        n * 20,
      );
      if (gold) goldAt = n;
      n++;
    }
    if (!n) return;
    gl.useProgram(prog);
    gl.uniform2f(prog.u("uRes"), pinCanvas.width, pinCanvas.height);
    gl.uniform1f(prog.u("uDpr"), k);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(P.vaoAll);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.allBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, n * 20), gl.DYNAMIC_DRAW);
    gl.uniform1i(prog.u("uPass"), 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.uniform1i(prog.u("uPass"), 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    if (goldAt >= 0 && (g.glow || 0) > 0) {
      gl.bindVertexArray(P.vaoGold);
      gl.bindBuffer(gl.ARRAY_BUFFER, P.goldBuf);
      gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(goldAt * 20, goldAt * 20 + 20), gl.DYNAMIC_DRAW);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1i(prog.u("uPass"), 2);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
    }
  };

  // Each drawing redraws only what its state changed: a frame where only the pins move leaves the Earth alone.
  let lastEarth = "";
  const draw = (S) => {
    init();
    const cam = M.camera(S.cam, W, H);
    const earthKey = JSON.stringify([S.cam, S.dof, S.look, S.gold && [S.gold.ringR, S.gold.ringA, S.gold.ringW, S.gold.pool, S.gold.poolR]]);
    if (earthKey !== lastEarth) {
      drawEarth(S, cam);
      lastEarth = earthKey;
    }
    drawPins(S, cam);
  };
  // A drawing that fails says so on the frame (an observer's error reaches nobody else).
  const redraw = () => {
    const text = stateEl.textContent;
    if (!text) return;
    try {
      draw(JSON.parse(text));
    } catch (err) {
      let el = document.getElementById("globe-error");
      if (!el) {
        el = document.createElement("pre");
        el.id = "globe-error";
        el.style.cssText = "position:absolute;left:20px;top:20px;right:20px;z-index:99;color:#f33;font:24px monospace;white-space:pre-wrap";
        earthCanvas.parentNode.appendChild(el);
      }
      el.textContent = String(err && err.stack ? err.stack : err);
      throw err;
    }
  };
  new MutationObserver(redraw).observe(stateEl, { childList: true, characterData: true, subtree: true });
  window.__globeDraw = (S) => draw(S);
  if (document.readyState === "complete") redraw();
  else window.addEventListener("load", redraw);
}

// ------------------------------------------------------------------ for the scenes
const G = MATH();
const PINS_FILE = path.join(__dirname, "../../docs/brands/aurixa-reel-1/system-edition/pins.json");
const PINS = JSON.parse(fs.readFileSync(PINS_FILE, "utf8"));
/** The film's property: 14 Wattle Grove, Banksia Rise NSW 2155 (fictional), in that postcode, north-west of Sydney. */
const GOLD = [PINS.gold.lon, PINS.gold.lat];
const TEXTURES = { g: "v3-sat-global.jpg", a: "v3-sat-au.jpg", n: "v3-sat-nsw.jpg" };
const BOX_A = [100, 172, -2, -50];
const BOX_N = [144, 157, -27, -40];
// The sun stands over 105° E, 15° N: from the north-west of the whole continent, low over Sydney (about 24°).
const SUN = [105, 15];
// Shadows fall to the south-east, away from it: east and north components of their direction on the ground.
const SHADOW_DIR = [Math.SQRT1_2, -Math.SQRT1_2];
// The Earth's canvas at the frame's resolution (GLOBE_SCALE=2 draws it at the drawing's, four times the cost);
// the pins' at the drawing's.
const EARTH_SCALE = Number(process.env.GLOBE_SCALE || 1);
const PIN_SCALE = 2;

/**
 * The globe's page fragment: the two canvases, the state they are drawn from, the textures and the program.
 * `goldLand` is when the gold pin, one of Sydney's crowd until it turns, touches down. Throws if the textures
 * aren't in the assets folder (satellite.py writes them).
 */
function globeHtml({ goldLand, assets, initial = null }) {
  const imgs = Object.entries(TEXTURES)
    .map(([key, name]) => {
      const file = assets && path.join(assets, name);
      if (!file || !fs.existsSync(file))
        throw new Error(`the satellite texture ${name} isn't in the assets folder (run satellite.py)`);
      return `<img id="tex-${key}" alt="" style="display:none" src="data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}">`;
    })
    .join("");
  const cfg = {
    W: 1080,
    H: 1920,
    QUAD_VS,
    GLOBE_FS,
    PIN_VS,
    PIN_FS,
    boxA: BOX_A,
    boxN: BOX_N,
    aniso: Number(process.env.GLOBE_ANISO || 1),
    sun: SUN,
    shadowDir: SHADOW_DIR,
    gold: GOLD,
    goldPin: { lon: GOLD[0], lat: GOLD[1], land: goldLand, size: 1 },
  };
  const pins = PINS.pins.map(({ lon, lat, land, size }) => ({ lon, lat, land, size }));
  const size = "width:1080px;height:1920px";
  return [
    // Each 1x pixel of the Earth drawn as a block of the drawing's 2x2, which the renderer's 2x downscale returns
    // to exactly that pixel.
    `<canvas id="globe" class="fk-layer" width="${1080 * EARTH_SCALE}" height="${1920 * EARTH_SCALE}" style="${size};image-rendering:pixelated"></canvas>`,
    `<canvas id="globe-pins" class="fk-layer" width="${1080 * PIN_SCALE}" height="${1920 * PIN_SCALE}" style="${size}"></canvas>`,
    `<div id="globe-state" style="display:none">${initial ? JSON.stringify(initial) : ""}</div>`,
    imgs,
    `<script>(${pageMain.toString()})((${MATH.toString()})(), ${JSON.stringify(pins)}, ${JSON.stringify(cfg)});</script>`,
  ].join("");
}

module.exports = { MATH, G, GOLD, PINS, globeHtml, SUN, BOX_A, BOX_N };
