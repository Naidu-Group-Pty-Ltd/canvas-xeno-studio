// As One: every instant of its 45.5 seconds, from the time alone. window.setT(t, {shutter, n}) draws t, the world as
// the average of n drawings spread over the shutter (motion blur, accumulated in the GPU), the words at t, and
// resolves once it is drawn. The world is in metres: the floor is y = 0, the beam rises at the origin, and the
// five cases stand in a ring about it. The times are the voice's (sound.py's cues.json) and the track's bars.
"use strict";
(() => {
  const D = window.DATA;
  const FW = 1080, FH = 1920;
  // The world is drawn at the frame's own size and smoothed by its samples (each moved by a fraction of a pixel),
  // whatever the page's scale; the words over it are drawn at the page's scale.
  const SCALE = 1;
  const { v3 } = GLX;
  const canvas = document.getElementById("gl");
  const E = GLX.create(canvas, FW, FH, SCALE);
  const gl = E.gl;

  // ------------------------------------------------------------------ helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => x * x * (3 - 2 * x);
  const ss = (t, a, b) => smooth(lin(t, a, b));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const mix = (a, b, t) => a + (b - a) * t;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise1 = (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return mix(hash(i), hash(i + 1), u) * 2 - 1;
  };
  const rad = (d) => (d * Math.PI) / 180;
  const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
  const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
  // A flash that rises fast and falls slowly, at `at`.
  const flash = (t, at, rise = 0.04, fall = 0.6) => (t < at - rise ? 0 : t < at ? lin(t, at - rise, at) : Math.exp(-(t - at) / fall));

  // ------------------------------------------------------------------ the clock: the voice's words, the track's bars
  const LINES = Object.fromEntries(D.cues.lines.map((l) => [l.key, l]));
  const wt = (key, i) => LINES[key].words[i].start;
  const DROP = D.cues.drop, BAR = D.cues.bar, BEAT = BAR / 4;
  const T = {
    use: wt("s2", 3), software: wt("s2", 5), have: wt("s2", 9), dashboards: wt("s2", 11), and: wt("s2", 12),
    ai: wt("s2", 15), tab: wt("s2", 18),
    at: wt("s3", 0), ambition: wt("s3", 5), changes: wt("s3", 8),
    names: [0, 1, 2, 3, 4].map((i) => wt("s4", i)),
    powerful: wt("s5", 0), own: wt("s5", 3),
    more: wt("s6", 0), stop: wt("s6", 4), separate: wt("s6", 7), destinations: wt("s6", 8),
    when: wt("s7", 0), intelligence: wt("s7", 1), move: wt("s7", 3), context: wt("s7", 5), follow: wt("s7", 7),
    business: wt("s7", 10), act: wt("s7", 12), one: wt("s7", 14),
    so: wt("s8", 0), next: wt("s8", 5), tool: wt("s8", 6), is: wt("s8", 7),
    ask: wt("s9", 0), becomes: wt("s9", 6), system: wt("s9", 8),
    aurixa: wt("s10", 0), systems: wt("s10", 1),
    coming: wt("s11", 5),
  };
  window.FILM_T = T;

  // ------------------------------------------------------------------ the world's fixed places
  const R = 1.85; // the ring of cases
  const RING_DEG = [-36, -108, 180, 108, 36]; // research, clients, reports, finance, communication
  const CASES = RING_DEG.map((d) => [R * Math.sin(rad(d)), 0, R * Math.cos(rad(d))]);
  const PL = { hw: 0.3, h: 0.86 }; // plinth half-width, height
  const GLASS = { h: 0.95, lid: 0.045 };
  const HOLO_Y = PL.h + 0.47;
  const EMPTY = [2.44, 0, -1.91];
  // The emblem: the supplied art's triangle centred on the beam, facing the last camera (at -z): art x runs to -x.
  const ART = D.art;
  const S_ART = 1.45 / (0.5 * (ART.bl[1] + ART.br[1]) - ART.apex[1]);
  const ART_O = [(ART.apex[0] + ART.bl[0] + ART.br[0]) / 3, (ART.apex[1] + ART.bl[1] + ART.br[1]) / 3];
  const EMB_Y = 2.3;
  const artToWorld = (px, py, z = 0) => [-(px - ART_O[0]) * S_ART, EMB_Y - (py - ART_O[1]) * S_ART, z];
  const TRI = { apex: artToWorld(...ART.apex), bl: artToWorld(...ART.bl), br: artToWorld(...ART.br) };

  // ------------------------------------------------------------------ colour (linear, HDR)
  const ICE = [0.55, 0.82, 1.0];
  const GOLD = [1.0, 0.72, 0.32];
  const WARM = [1.0, 0.86, 0.62];

  // ------------------------------------------------------------------ programs
  const H = GLX.HEADER;
  const LIGHTS = `
  uniform vec4 uL[24]; uniform vec4 uLC[24]; uniform int uNL;
  vec3 lights(vec3 P, vec3 N, vec3 V, float shin, out vec3 spec) {
    vec3 lit = vec3(0.0); spec = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      if (i >= uNL) break;
      vec3 L = uL[i].xyz - P; float d2 = dot(L, L); vec3 Ln = L * inversesqrt(d2 + 1e-6);
      vec3 c = uLC[i].rgb * uL[i].w / (1.0 + d2 * uLC[i].w);
      lit += c * (0.25 + 0.75 * max(dot(N, Ln), 0.0));
      spec += c * pow(max(dot(N, normalize(Ln + V)), 0.0), shin);
    }
    return lit;
  }`;
  const SKY = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o;
  uniform sampler2D uFog; uniform float uTime; uniform float uFogAmt; uniform vec3 uLow; uniform vec3 uTop;
  void main() {
    vec3 c = mix(uLow, uTop, smoothstep(0.0, 1.0, vUv.y));
    float f = texture(uFog, vUv * vec2(0.8, 1.42) + vec2(uTime * 0.003, -uTime * 0.0015)).r;
    c += uLow * 1.6 * f * uFogAmt;
    o = vec4(c, 1.0);
  }`);
  const FLOOR = GLX.program(gl, GLX.MESH_VS, H + `
  in vec3 vPos; in vec3 vNor; in vec4 vCol; in vec2 vUv; out vec4 o;
  uniform sampler2D uMarble; uniform sampler2D uRefl; uniform sampler2D uReflBlur;
  uniform vec2 uRes; uniform vec3 uEye; uniform float uTile; uniform float uPolish; uniform float uAmb; uniform float uFade;
  ${LIGHTS}
  void main() {
    vec4 m = texture(uMarble, vPos.xz / uTile);
    float vein = m.a;
    vec3 alb = m.rgb * m.rgb * (1.0 - 0.72 * vein);
    vec3 V = normalize(uEye - vPos);
    float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
    vec3 spec;
    vec3 lit = lights(vPos, vec3(0.0, 1.0, 0.0), V, 40.0, spec) + vec3(uAmb);
    vec2 suv = gl_FragCoord.xy / uRes;
    vec3 refl = mix(texture(uRefl, suv).rgb, texture(uReflBlur, suv).rgb, 0.35 + 0.5 * vein);
    float k = uPolish * (0.22 + 0.78 * F) * (1.0 - 0.75 * vein);
    vec3 col = alb * lit + refl * k + spec * 0.05 * (1.0 - vein);
    float dist = length(vPos.xz - uEye.xz);
    col *= exp(-max(dist - uFade, 0.0) * 0.11);
    o = vec4(col, 1.0);
  }`);
  const SOLID = GLX.program(gl, GLX.MESH_VS, H + `
  in vec3 vPos; in vec3 vNor; in vec4 vCol; in vec2 vUv; out vec4 o;
  uniform sampler2D uMarble; uniform vec3 uEye; uniform float uAmb; uniform float uMirror;
  ${LIGHTS}
  void main() {
    if (uMirror > 0.5 && vPos.y < -0.001) discard;
    if (uMirror < 0.5 && vPos.y < -0.001) discard;
    vec4 m = texture(uMarble, vUv);
    vec3 alb = m.rgb * m.rgb * 0.9 * vCol.rgb;
    vec3 N = normalize(vNor), V = normalize(uEye - vPos);
    vec3 spec;
    vec3 lit = lights(vPos, N, V, 70.0, spec) + vec3(uAmb);
    float F = 0.04 + 0.96 * pow(1.0 - abs(dot(N, V)), 5.0);
    o = vec4(alb * lit * (1.0 + 2.0 * m.a) + spec * (0.18 + 0.8 * F) * (1.0 - m.a), 1.0);
  }`);
  const GLASSP = GLX.program(gl, GLX.MESH_VS, H + `
  in vec3 vPos; in vec3 vNor; in vec4 vCol; in vec2 vUv; out vec4 o;
  uniform vec3 uEye; uniform float uMirror;
  void main() {
    if (vPos.y < -0.001) discard;
    vec3 N = normalize(vNor), V = normalize(uEye - vPos);
    float c = abs(dot(N, V));
    float F = 0.05 + 0.95 * pow(1.0 - c, 4.0);
    float streak = smoothstep(0.07, 0.0, abs(fract(vUv.x * 0.7 + vUv.y * 0.42 + 0.2) - 0.5) - 0.36);
    float edge = smoothstep(0.035, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float pres = vCol.a, light = vCol.r, fl = vCol.g;
    vec3 tint = vec3(0.6, 0.8, 1.0);
    vec3 add = tint * pres * (0.004 + 0.06 * F + 0.012 * streak + 0.05 * edge) * (1.0 + 1.6 * light) + vec3(1.0, 0.95, 0.85) * fl * pres * (0.012 + 0.25 * edge);
    float a = pres * (0.04 + 0.22 * F);
    o = vec4(add, a);
  }`);
  const LINE = GLX.program(gl, GLX.LINE_VS, GLX.LINE_FS);
  const QUAD = GLX.program(gl, GLX.QUAD_VS, H + `
  in vec2 vUv; in vec4 vCol; in vec4 vExtra; in vec3 vPos; out vec4 o;
  uniform sampler2D uTex; uniform sampler2D uFog; uniform float uTime; uniform float uMirror;
  void main() {
    if (uMirror > 0.5 && vPos.y < -0.001) discard;
    int mode = int(vExtra.x + 0.5);
    float opaque = vExtra.y;
    vec3 rgb; float a;
    if (mode == 0) {                       // a texture, its own alpha
      vec4 t = texture(uTex, vUv);
      rgb = t.rgb * t.rgb * vCol.rgb; a = t.a * vCol.a;
    } else if (mode == 1) {                // the beam: core, glow, haze, in fog
      float x = (vUv.x - 0.5) * 2.0;        // -1..1 across the quad
      float w = vExtra.z;                   // the quad's half-width in metres
      float L = vExtra.w;                   // its length in metres
      float full = vCol.a;                  // 1 while it stands; under 1 as it is drawn into the orb
      bool standing = full > 0.9995;
      float xm = x * w;
      float core = exp(-pow(xm / 0.010, 2.0));
      float glow = exp(-pow(xm / 0.09, 2.0));
      float haze = exp(-pow(xm / 0.55, 2.0)) * (standing ? 1.0 : full);
      float f = texture(uFog, vec2(vPos.x * 0.2 + vPos.z * 0.2 + uTime * 0.01, vPos.y * 0.09 - uTime * 0.04)).r;
      float y = vPos.y;
      float along = exp(-y * 0.09) * (0.7 + 0.3 * exp(-y * 2.5));
      // the tip of the beam softens as it grows; drawn in, both its ends are soft over their last 0.35 m
      float tip = standing ? 1.0 - smoothstep(0.8, 1.0, vUv.y) : smoothstep(0.0, 0.35, (1.0 - vUv.y) * L);
      float foot = standing ? 1.0 : mix(smoothstep(0.0, 0.35, vUv.y * L), 1.0, full);
      rgb = vCol.rgb * along * (core * 2.4 + glow * 0.55 + haze * 0.16 * (0.35 + 1.3 * f)) * tip * foot;
      a = 1.0;
    } else if (mode == 2) {                // a soft round glow
      vec2 q = vUv * 2.0 - 1.0; float r2 = dot(q, q);
      float g = exp(-r2 * vExtra.z) - exp(-vExtra.z);
      rgb = vCol.rgb * max(g, 0.0); a = vCol.a * max(g, 0.0);
    } else if (mode == 3) {                // a cone of light, top (v = 1) to bottom (v = 0)
      float x = abs(vUv.x - 0.5) * 2.0;
      float wid = mix(0.55, 1.0, 1.0 - vUv.y);
      float g = smoothstep(wid, wid * 0.35, x) * pow(vUv.y, 0.7) * (0.6 + 0.4 * vUv.y);
      float f = texture(uFog, vec2(vPos.x * 0.6 + vPos.z * 0.6, vPos.y * 0.5 - uTime * 0.05)).r;
      rgb = vCol.rgb * g * (0.7 + 0.6 * f); a = 1.0;
    } else if (mode == 4) {                // a fog sheet
      vec2 q = vUv * 2.0 - 1.0;
      float edge = smoothstep(1.0, 0.35, length(q * vec2(1.0, 0.9)));
      float f = texture(uFog, vUv * vec2(1.4, 1.0) + vExtra.zw).r;
      rgb = vCol.rgb * f * edge; a = 1.0;
    } else if (mode == 5) {                // a ring on the floor
      vec2 q = vUv * 2.0 - 1.0; float r = length(q);
      float g = exp(-pow((r - 0.86) / 0.05, 2.0)) + 0.25 * exp(-pow((r - 0.8) / 0.16, 2.0));
      rgb = vCol.rgb * g; a = 1.0;
    } else {                               // the emblem: its light, keyed, additive
      vec4 t = texture(uTex, vUv);
      rgb = t.rgb * t.rgb * vCol.rgb * t.a; a = 1.0;
    }
    float pa = opaque > 0.5 ? a : 0.0;
    o = vec4(rgb * (opaque > 0.5 ? a : 1.0), pa);
  }`);
  const COPY = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform float uK;
  void main() { o = vec4(texture(uSrc, vUv).rgb * uK, 1.0); }`);
  const BLUR = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uDir;
  void main() {
    vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
    c += (texture(uSrc, vUv + uDir * 1.3846153846).rgb + texture(uSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
    c += (texture(uSrc, vUv + uDir * 3.2307692308).rgb + texture(uSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
    o = vec4(c, 1.0);
  }`);
  const DOWN = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh;
  vec3 s(vec2 d) { return texture(uSrc, vUv + d * uTexel).rgb; }
  void main() {
    vec3 c = s(vec2(0.0)) * 0.125;
    c += (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.125;
    c += (s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0)) + s(vec2(0.0, 2.0))) * 0.0625;
    c += (s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0)) + s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0))) * 0.03125;
    if (uThresh > 0.0) {
      float l = max(c.r, max(c.g, c.b));
      float k = max(l - uThresh, 0.0); k = k * k / (k + 0.4 + 1e-4);
      c *= k / max(l, 1e-4);
    }
    o = vec4(c, 1.0);
  }`);
  const UP = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform sampler2D uAdd; uniform vec2 uTexel;
  vec3 s(vec2 d) { return texture(uSrc, vUv + d * uTexel).rgb; }
  void main() {
    vec3 c = s(vec2(0.0)) * 4.0 + (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0
           + (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0)));
    o = vec4(c / 16.0 + texture(uAdd, vUv).rgb, 1.0);
  }`);
  const FINAL = GLX.program(gl, GLX.FULL_VS, H + `
  in vec2 vUv; out vec4 o;
  uniform sampler2D uHdr; uniform sampler2D uBloom; uniform float uBloomK; uniform float uExposure; uniform float uSeed;
  uniform float uVig; uniform float uFade;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec3 c = texture(uHdr, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
    c *= uExposure;
    vec2 q = (vUv - 0.5) * vec2(0.5625, 1.0);
    c *= clamp(1.0 - uVig * dot(q, q) * 2.6, 0.0, 1.0);
    vec3 m = aces(c);
    // a cold lift in the shadows and warmth in the highlights, slight
    float l = dot(m, vec3(0.2126, 0.7152, 0.0722));
    m += vec3(-0.004, 0.002, 0.012) * (1.0 - smoothstep(0.0, 0.35, l)) + vec3(0.01, 0.004, -0.008) * smoothstep(0.5, 1.0, l);
    vec3 srgb = mix(m * 12.92, 1.055 * pow(max(m, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, m));
    srgb *= uFade;
    float n = fract(sin(dot(gl_FragCoord.xy + uSeed * 37.0, vec2(12.9898, 78.233))) * 43758.5453)
            + fract(sin(dot(gl_FragCoord.yx + uSeed * 11.0, vec2(39.3468, 11.135))) * 24634.6345) - 1.0;
    o = vec4(srgb + n / 255.0, 1.0);
  }`);

  // ------------------------------------------------------------------ uniforms
  function setU(P, u) {
    let unit = 0;
    for (const [k, v] of Object.entries(u)) {
      const loc = P.u[k];
      if (loc === undefined || loc === null) continue;
      if (v && v.tex !== undefined) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v.tex);
        gl.uniform1i(loc, unit++);
      } else if (typeof v === "number") gl.uniform1f(loc, v);
      else if (Array.isArray(v) && v.length === 2) gl.uniform2fv(loc, v);
      else if (Array.isArray(v) && v.length === 3) gl.uniform3fv(loc, v);
      else if (Array.isArray(v) && v.length === 4) gl.uniform4fv(loc, v);
      else if (v instanceof Float32Array && v.length === 16) gl.uniformMatrix4fv(loc, false, v);
      else if (v instanceof Float32Array) gl.uniform4fv(loc, v);
      else if (v && v.int !== undefined) gl.uniform1i(loc, v.int);
    }
  }
  const fullscreen = (P, u) => {
    gl.useProgram(P.p);
    setU(P, u);
    gl.bindVertexArray(E.vao);
    for (let i = 0; i < 16; i++) gl.disableVertexAttribArray(i);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // ------------------------------------------------------------------ textures
  const TEX = {};
  const loadImg = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`picture did not load: ${src}`));
      i.src = src;
    });
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d");
    draw(x, w, h);
    return { tex: GLX.texture(gl, c, { mipmap: true }), w, h };
  }
  function rr(x, X, Y, W, Hh, r) {
    x.beginPath();
    x.moveTo(X + r, Y);
    x.arcTo(X + W, Y, X + W, Y + Hh, r);
    x.arcTo(X + W, Y + Hh, X, Y + Hh, r);
    x.arcTo(X, Y + Hh, X, Y, r);
    x.arcTo(X, Y, X + W, Y, r);
    x.closePath();
  }
  // The noise's panes: generic software, drawn as its skeleton. Windows, dashboards; each tool its own accent.
  const ACCENTS = ["#7aa7ff", "#9b8cff", "#5fd0c5", "#ff9f6e", "#c58cff", "#6ec7ff", "#ffcf6e", "#8ce0a0"];
  function paneTex(kind, seed) {
    const rnd = (k) => hash(seed * 13.7 + k * 3.1);
    const acc = ACCENTS[Math.floor(rnd(1) * ACCENTS.length)];
    return canvasTex(640, 420, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      rr(x, 4, 4, w - 8, h - 8, 22);
      x.fillStyle = "rgba(14,24,42,0.80)";
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = "rgba(190,215,255,0.55)";
      x.stroke();
      // title bar
      x.fillStyle = "rgba(255,255,255,0.06)";
      x.fillRect(8, 8, w - 16, 40);
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(30 + i * 22, 28, 7, 0, Math.PI * 2);
        x.fillStyle = ["rgba(255,120,110,.7)", "rgba(255,200,90,.7)", "rgba(110,210,130,.7)"][i];
        x.fill();
      }
      x.fillStyle = "rgba(200,220,255,0.30)";
      rr(x, 110, 20, 120 + rnd(2) * 120, 14, 7);
      x.fill();
      x.fillStyle = acc;
      x.globalAlpha = 0.9;
      rr(x, w - 70, 19, 40, 16, 8);
      x.fill();
      x.globalAlpha = 1;
      const bar = (X, Y, W, Hh, a = 0.28) => {
        x.fillStyle = `rgba(200,220,255,${a})`;
        rr(x, X, Y, W, Hh, Hh / 2);
        x.fill();
      };
      if (kind === "window") {
        // a sidebar and a list
        x.fillStyle = "rgba(255,255,255,0.045)";
        x.fillRect(8, 48, 150, h - 56);
        for (let i = 0; i < 8; i++) bar(28, 76 + i * 38, 70 + rnd(10 + i) * 50, 12, i === 2 ? 0.55 : 0.25);
        x.fillStyle = acc;
        x.globalAlpha = 0.5;
        x.fillRect(12, 66 + 2 * 38, 4, 30);
        x.globalAlpha = 1;
        for (let i = 0; i < 7; i++) {
          const Y = 80 + i * 46;
          x.fillStyle = "rgba(255,255,255,0.05)";
          rr(x, 184, Y - 10, w - 210, 36, 8);
          x.fill();
          x.beginPath();
          x.arc(206, Y + 8, 9, 0, Math.PI * 2);
          x.fillStyle = "rgba(200,220,255,0.3)";
          x.fill();
          bar(228, Y, 120 + rnd(20 + i) * 160, 10, 0.35);
          bar(228, Y + 14, 60 + rnd(30 + i) * 90, 7, 0.2);
        }
      } else {
        // a dashboard: tiles, a bar chart, a line, a ring
        for (let i = 0; i < 3; i++) {
          x.fillStyle = "rgba(255,255,255,0.05)";
          rr(x, 24 + i * 202, 66, 186, 78, 12);
          x.fill();
          bar(42 + i * 202, 86, 60 + rnd(40 + i) * 50, 9, 0.28);
          bar(42 + i * 202, 108, 90 + rnd(50 + i) * 40, 18, 0.5);
        }
        x.fillStyle = "rgba(255,255,255,0.05)";
        rr(x, 24, 160, 370, 236, 12);
        x.fill();
        for (let i = 0; i < 9; i++) {
          const hh = 30 + rnd(60 + i) * 150;
          x.fillStyle = i % 3 === 1 ? acc : "rgba(200,220,255,0.38)";
          x.globalAlpha = i % 3 === 1 ? 0.8 : 1;
          rr(x, 46 + i * 38, 380 - hh, 22, hh, 5);
          x.fill();
          x.globalAlpha = 1;
        }
        x.fillStyle = "rgba(255,255,255,0.05)";
        rr(x, 410, 160, 206, 236, 12);
        x.fill();
        x.beginPath();
        x.arc(513, 262, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.35 + rnd(70) * 0.5));
        x.lineWidth = 16;
        x.strokeStyle = acc;
        x.stroke();
        x.beginPath();
        x.arc(513, 262, 62, 0, Math.PI * 2);
        x.lineWidth = 16;
        x.strokeStyle = "rgba(200,220,255,0.12)";
        x.stroke();
        bar(450, 356, 126, 10, 0.3);
        x.beginPath();
        for (let i = 0; i <= 12; i++) {
          const X = 46 + i * 28, Y = 230 + noise1(seed * 5 + i * 0.7) * 40 - i * 4;
          i ? x.lineTo(X, Y) : x.moveTo(X, Y);
        }
        x.lineWidth = 3;
        x.strokeStyle = "rgba(240,248,255,0.55)";
        x.stroke();
      }
    });
  }
  function tabTex(label) {
    return canvasTex(512, 96, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      rr(x, 6, 10, w - 12, h - 10, 18);
      x.fillStyle = label ? "rgba(40,70,120,0.95)" : "rgba(22,36,60,0.92)";
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = label ? "rgba(200,225,255,0.95)" : "rgba(170,200,240,0.45)";
      x.stroke();
      x.beginPath();
      x.arc(46, 53, 15, 0, Math.PI * 2);
      x.fillStyle = label ? "rgba(225,240,255,0.95)" : "rgba(170,200,240,0.4)";
      x.fill();
      if (label) {
        x.font = '700 46px "MONO"';
        x.fillStyle = "rgba(240,248,255,1)";
        x.textBaseline = "middle";
        x.fillText(label, 82, 55);
        x.font = '400 40px "MONO4"';
        x.fillStyle = "rgba(200,220,255,0.6)";
        x.fillText("×", w - 60, 52);
      } else {
        x.fillStyle = "rgba(170,200,240,0.35)";
        rr(x, 80, 45, 200, 16, 8);
        x.fill();
      }
    });
  }
  function labelTex(text) {
    return canvasTex(1024, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.font = '700 64px "MONO"';
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.letterSpacing = "18px";
      x.fillStyle = "#F5D17A";
      x.shadowColor = "rgba(245,209,122,0.55)";
      x.shadowBlur = 14;
      x.fillText(text, w / 2 + 9, h / 2 + 2);
    });
  }
  function tagTex(text) {
    return canvasTex(640, 120, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      rr(x, 6, 10, w - 12, h - 20, 24);
      x.fillStyle = "rgba(8,16,30,0.86)";
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = "rgba(245,209,122,0.95)";
      x.stroke();
      x.beginPath();
      x.arc(50, h / 2, 10, 0, Math.PI * 2);
      x.fillStyle = "#F5D17A";
      x.fill();
      x.font = '700 44px "MONO"';
      x.letterSpacing = "8px";
      x.textBaseline = "middle";
      x.fillStyle = "#FBE7B5";
      x.fillText(text, 80, h / 2 + 2);
    });
  }

  // ------------------------------------------------------------------ geometry
  // Lines: [a, b, rgb, intensity, corePx, glowPx]
  const LINES_LAYOUT = [["aA", 3], ["aB", 3], ["aCorner", 2], ["aCol", 4], ["aWidth", 2], ["aT", 1]];
  function lineVerts(list) {
    const out = new Float32Array(list.length * 6 * 15);
    let o = 0;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    for (const [a, b, c, k, core, glow] of list) {
      for (const [cx, cy] of corners) {
        out[o++] = a[0]; out[o++] = a[1]; out[o++] = a[2];
        out[o++] = b[0]; out[o++] = b[1]; out[o++] = b[2];
        out[o++] = cx; out[o++] = cy;
        out[o++] = c[0]; out[o++] = c[1]; out[o++] = c[2]; out[o++] = k;
        out[o++] = core * SCALE; out[o++] = glow * SCALE;
        out[o++] = 0;
      }
    }
    return out;
  }
  // Quads: corners p0..p3 (counter-clockwise from bottom-left, uv 0,0 / 1,0 / 1,1 / 0,1), colour, extra
  const QUAD_LAYOUT = [["aPos", 3], ["aUv", 2], ["aCol", 4], ["aExtra", 4]];
  function quadVerts(list) {
    const out = new Float32Array(list.length * 6 * 13);
    let o = 0;
    for (const q of list) {
      const { p, uv = [0, 0, 1, 1], col, ex } = q;
      const U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        out[o++] = p[i][0]; out[o++] = p[i][1]; out[o++] = p[i][2];
        out[o++] = U[i][0]; out[o++] = U[i][1];
        out[o++] = col[0]; out[o++] = col[1]; out[o++] = col[2]; out[o++] = col[3];
        out[o++] = ex[0]; out[o++] = ex[1]; out[o++] = ex[2]; out[o++] = ex[3];
      }
    }
    return out;
  }
  // Meshes: triangles with normal, colour, uv
  const MESH_LAYOUT = [["aPos", 3], ["aNor", 3], ["aCol", 4], ["aUv", 2]];
  function boxTris(c, hw, y0, y1, hd, col, uvScale, uvOff, out) {
    const [x, , z] = c;
    const P = (dx, y, dz) => [x + dx, y, z + dz];
    const faces = [
      [[0, 0, 1], [P(-hw, y0, hd), P(hw, y0, hd), P(hw, y1, hd), P(-hw, y1, hd)]],
      [[0, 0, -1], [P(hw, y0, -hd), P(-hw, y0, -hd), P(-hw, y1, -hd), P(hw, y1, -hd)]],
      [[1, 0, 0], [P(hw, y0, hd), P(hw, y0, -hd), P(hw, y1, -hd), P(hw, y1, hd)]],
      [[-1, 0, 0], [P(-hw, y0, -hd), P(-hw, y0, hd), P(-hw, y1, hd), P(-hw, y1, -hd)]],
      [[0, 1, 0], [P(-hw, y1, hd), P(hw, y1, hd), P(hw, y1, -hd), P(-hw, y1, -hd)]],
    ];
    for (const [n, q] of faces) {
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [uvOff[0] + u * uvScale * 2 * hw, uvOff[1] + v * uvScale * (y1 - y0)]);
      for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i], ...n, ...col, ...uvs[i]);
    }
  }
  function quadMesh(q, n, col, out) {
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i], ...n, ...col, ...uv[i]);
  }

  // ------------------------------------------------------------------ the holograms (local polylines, metres)
  function circlePts(r, n, f) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(f(Math.cos(a) * r, Math.sin(a) * r));
    }
    return pts;
  }
  function rrect(cx, cy, w, h, r, z = 0, n = 5) {
    const pts = [];
    const corner = (x, y, a0) => {
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * (Math.PI / 2);
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
      }
    };
    corner(cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2);
    corner(cx + w / 2 - r, cy + h / 2 - r, 0);
    corner(cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2);
    corner(cx - w / 2 + r, cy - h / 2 + r, Math.PI);
    pts.push(pts[0]);
    return pts;
  }
  const seg = (x0, y0, x1, y1, z = 0) => [[x0, y0, z], [x1, y1, z]];
  const HOLO = [];
  {
    // Research: a globe of latitudes and meridians, a ring about it, a gold pin.
    const r = 0.17, P = [];
    for (const lat of [-60, -30, 0, 30, 60]) P.push(circlePts(r * Math.cos(rad(lat)), 44, (x, z) => [x, r * Math.sin(rad(lat)), z]));
    for (let k = 0; k < 8; k++) {
      const lon = rad(k * 22.5);
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI * (i / 24) - Math.PI / 2;
        pts.push([r * Math.cos(a) * Math.sin(lon), r * Math.sin(a), r * Math.cos(a) * Math.cos(lon)]);
      }
      P.push(pts);
      P.push(pts.map(([x, y, z]) => [-x, y, -z]));
    }
    const ring = circlePts(0.27, 64, (x, z) => rotX([x, 0, z], rad(18)));
    const pinBase = [r * Math.cos(rad(28)) * Math.sin(rad(40)), r * Math.sin(rad(28)), r * Math.cos(rad(28)) * Math.cos(rad(40))];
    const pinTip = v3.add(pinBase, v3.mul(v3.norm(pinBase), 0.09));
    HOLO.push({ lines: P.concat([ring]), gold: [[pinBase, pinTip]], spin: 0.32, scale: 1.0 });
  }
  {
    // Clients: three client cards, the nearest with its face and lines.
    const P = [], G = [];
    for (let k = 2; k >= 0; k--) {
      const card = rrect(0.0, 0.0, 0.3, 0.19, 0.022).map((p) => v3.add(rotY(p, rad(-12 + k * 12)), [k * 0.03, k * 0.028, -k * 0.07]));
      P.push(card);
    }
    P.push(circlePts(0.036, 32, (x, y) => [x - 0.088, y + 0.022, 0.001]));
    P.push(circlePts(0.016, 20, (x, y) => [x - 0.088, y + 0.03, 0.001]));
    P.push(seg(-0.012, 0.045, 0.11, 0.045), seg(-0.012, 0.016, 0.06, 0.016), seg(-0.12, -0.035, 0.12, -0.035));
    for (let i = 0; i < 3; i++) P.push(seg(-0.12 + i * 0.085, -0.065, -0.07 + i * 0.085, -0.065));
    G.push(seg(-0.012, -0.002, 0.03, -0.002));
    HOLO.push({ lines: P, gold: G, spin: 0, sway: 0.28, scale: 1.0 });
  }
  {
    // Reports: a stack of pages, the top one with its heading, its lines and its chart.
    const P = [], G = [];
    for (let k = 3; k >= 0; k--) P.push(rrect(-k * 0.022, k * 0.016, 0.21, 0.28, 0.008, -k * 0.035));
    P.push(seg(-0.08, 0.105, 0.05, 0.105), seg(-0.08, 0.075, 0.08, 0.075), seg(-0.08, 0.055, 0.07, 0.055), seg(-0.08, 0.035, 0.045, 0.035));
    for (let i = 0; i < 5; i++) {
      const hh = [0.03, 0.05, 0.04, 0.065, 0.075][i];
      P.push([[-0.07 + i * 0.033, -0.11, 0], [-0.07 + i * 0.033, -0.11 + hh, 0]]);
    }
    P.push(seg(-0.085, -0.11, 0.085, -0.11));
    G.push(seg(-0.08, 0.125, -0.02, 0.125));
    HOLO.push({ lines: P, gold: G, spin: 0, sway: 0.22, scale: 1.0, thickBars: true });
  }
  {
    // Finance: a ring gauge with its ticks and needle, and no figure on it.
    const P = [], G = [];
    const arc = [];
    for (let i = 0; i <= 48; i++) {
      const a = rad(220 - (i / 48) * 260);
      arc.push([Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0]);
    }
    P.push(arc);
    for (let i = 0; i <= 12; i++) {
      const a = rad(220 - (i / 12) * 260);
      P.push([[Math.cos(a) * 0.135, Math.sin(a) * 0.135, 0], [Math.cos(a) * (i % 3 ? 0.148 : 0.12), Math.sin(a) * (i % 3 ? 0.148 : 0.12), 0]]);
    }
    const inner = [];
    for (let i = 0; i <= 30; i++) {
      const a = rad(220 - (i / 30) * 160);
      inner.push([Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0]);
    }
    G.push(inner);
    P.push(circlePts(0.018, 20, (x, y) => [x, y, 0]));
    P.push(circlePts(0.205, 64, (x, y) => [x, y, -0.03]));
    HOLO.push({ lines: P, gold: G, spin: 0, sway: 0.3, scale: 1.0, needle: true });
  }
  {
    // Communication: two message bubbles, one writing.
    const P = [], G = [];
    const b1 = rrect(-0.03, 0.05, 0.25, 0.13, 0.04, 0);
    P.push(b1, [[-0.11, -0.015, 0], [-0.13, -0.05, 0], [-0.075, -0.015, 0]]);
    for (let i = 0; i < 3; i++) P.push(circlePts(0.012, 16, (x, y) => [x - 0.075 + i * 0.045, y + 0.05, 0]));
    const b2 = rrect(0.05, -0.085, 0.2, 0.11, 0.035, -0.06);
    P.push(b2, [[0.11, -0.14, -0.06], [0.135, -0.17, -0.06], [0.08, -0.14, -0.06]]);
    P.push(seg(-0.02, -0.07, 0.12, -0.07, -0.06), seg(-0.02, -0.098, 0.07, -0.098, -0.06));
    HOLO.push({ lines: P, gold: G, spin: 0, sway: 0.25, scale: 1.0 });
  }
  const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + v3.len(v3.sub(p, pts[i])), 0);
  // Segments of a polyline revealed up to fraction f of its length.
  function revealed(pts, f, out, xf) {
    if (f <= 0) return;
    const L = polyLen(pts) * f;
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = v3.len(v3.sub(b, a));
      if (s + l <= L) out.push([xf(a), xf(b)]);
      else {
        out.push([xf(a), xf(v3.lerp(a, b, (L - s) / l))]);
        return;
      }
      s += l;
    }
  }

  // ------------------------------------------------------------------ the noise: its panes and the tab strip
  const PANES = [];
  {
    let seed = 1;
    const pick = () => hash(seed++ * 7.31);
    const place = (kind, n, t0, t1) => {
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const ang = side * rad(16 + pick() * 64), rr_ = 0.9 + pick() * 2.5;
        const pos = [Math.sin(ang) * rr_ * 1.05, 0.4 + pick() * 3.4, Math.cos(ang) * rr_ * 0.85 + 0.4];
        if (Math.abs(pos[0]) < 0.62) pos[0] = side * (0.62 + pick() * 0.3); // keep the beam clear
        const w = kind === "window" ? 0.95 + pick() * 0.35 : 0.85 + pick() * 0.35;
        PANES.push({ kind, pos, w, h: w * 0.656, yaw: rad(-28 + pick() * 56), pitch: rad(-6 + pick() * 12), roll: rad(-4 + pick() * 8),
          t: t0 + (i / n) * (t1 - t0) + pick() * 0.08, seed: seed, drift: pick() * 10 });
      }
    };
    place("window", 9, T.use - 0.1, T.software + 0.7);
    place("dash", 11, T.have - 0.15, T.dashboards + 0.75);
  }
  const TABS = 11;

  // ------------------------------------------------------------------ the camera
  // Keyframes: time, azimuth (deg, from +z toward +x), distance, height, the target's height, fov (deg).
  const KEYS = [
    [0.0, 0, 5.6, 0.32, 1.95, 50],
    [4.4, 0, 6.1, 0.78, 2.3, 50],
    [8.0, 1.5, 6.7, 1.15, 2.2, 51],
    [11.8, 4, 7.2, 1.55, 2.05, 52],
    [13.6, 6, 7.5, 2.4, 1.55, 53],
    [15.6, 10, 7.6, 3.0, 1.15, 54],
    [20.7, 26, 7.9, 3.7, 1.12, 54],
    [DROP, 29, 7.6, 3.65, 1.16, 54],
    [27.2, 76, 6.8, 3.25, 1.9, 54],
    [33.8, 140, 7.0, 3.7, 2.0, 54],
    [36.5, 152, 6.9, 3.1, 2.1, 54],
    [40.2, 180, 6.0, 2.55, 2.15, 50],
    [45.5, 182, 5.4, 2.45, 2.1, 50],
  ];
  // Monotone cubic through the keys (Fritsch-Carlson), each parameter alone.
  const KT = KEYS.map((k) => k[0]);
  const slopes = (col) => {
    const y = KEYS.map((k) => k[col]);
    const n = y.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (KT[i + 1] - KT[i]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (KT[i + 1] - KT[i - 1])) / ((2 * KT[i + 1] - KT[i] - KT[i - 1]) / d[i - 1] + (KT[i + 1] + KT[i] - 2 * KT[i - 1]) / d[i]);
    m[0] = 0;
    m[n - 1] = 0;
    return { y, m };
  };
  const CURVES = [1, 2, 3, 4, 5].map(slopes);
  function keyAt(col, t) {
    const { y, m } = CURVES[col - 1];
    if (t <= KT[0]) return y[0];
    if (t >= KT[KT.length - 1]) return y[y.length - 1];
    let i = 0;
    while (KT[i + 1] < t) i++;
    const h = KT[i + 1] - KT[i], s = (t - KT[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
  }
  function cameraAt(t, jitter = null) {
    const az = rad(keyAt(1, t) + 0.35 * noise1(t * 0.37 + 4));
    const dist = keyAt(2, t);
    const hgt = keyAt(3, t) + 0.025 * noise1(t * 0.41 + 9);
    let tgt = [0.012 * noise1(t * 0.5 + 2), keyAt(4, t) + 0.012 * noise1(t * 0.45 + 7), 0];
    // The empty case: the camera looks toward it while it stands.
    const lookE = ss(t, T.so - 0.55, T.so + 0.25) * (1 - ss(t, T.is + 0.35, T.ask + 1.1));
    tgt = v3.lerp(tgt, [EMPTY[0], 1.05, EMPTY[2]], 0.62 * lookE);
    let eye = [Math.sin(az) * dist, hgt, Math.cos(az) * dist];
    // The drop: a hit through the frame, gone in half a second.
    const k = t >= DROP ? Math.exp(-(t - DROP) / 0.16) * 0.06 : 0;
    const k1 = t >= T.one ? Math.exp(-(t - T.one) / 0.14) * 0.035 : 0;
    eye = v3.add(eye, [noise1(t * 41) * (k + k1), noise1(t * 37 + 3) * (k + k1), 0]);
    return GLX.camera(eye, tgt, keyAt(5, t), FW, FH, 0.004 * noise1(t * 0.3 + 1), jitter, E.w, E.h);
  }

  // ------------------------------------------------------------------ the world at t
  function world(t, cam) {
    const W = { lines: [], quads: [], panes: [], solid: [], glass: [], lights: [], labels: [], tags: [], emblem: [] };
    const toCam = (p) => v3.norm(v3.sub(cam.eye, p));
    // A billboard: centre, half sizes in metres, turning about the vertical (upright) or facing the camera.
    const board = (c, hw, hh, upright = false) => {
      let r, u;
      if (upright) {
        const d = v3.sub(cam.eye, c);
        r = v3.norm([d[2], 0, -d[0]]);
        u = [0, 1, 0];
      } else {
        r = cam.view.r;
        u = cam.view.u;
      }
      const R_ = v3.mul(r, hw), U = v3.mul(u, hh);
      return [v3.sub(v3.sub(c, R_), U), v3.sub(v3.add(c, R_), U), v3.add(v3.add(c, R_), U), v3.add(v3.sub(c, R_), U)];
    };
    // Screen-steady size: metres for `px` CSS pixels at the depth of c.
    const pxAt = (c, px) => (px / cam.focal) * Math.max(0.3, v3.dot(v3.sub(c, cam.eye), cam.view.f));

    // ---- the beam
    const grow = easeOut(lin(t, 0.05, 2.4));
    const beamTop = 0.02 + grow * 16;
    // As the emblem forms, the beam is drawn into its orb: both ends close on the orb, and its light circles there
    // (below, with the emblem). While it stands, yBot and yTop are the floor and its tip.
    const ORB = artToWorld(...ART.orb);
    const gather = easeInOut(lin(t, T.aurixa - 0.1, T.aurixa + 1.05));
    const yBot = ORB[1] * gather;
    const yTop = gather > 0 ? ORB[1] + 3.2 * (1 - gather) : beamTop;
    const full = gather > 0 ? Math.min(0.999, 1 - ss(gather, 0.0, 0.45)) : 1;
    let beamK = 0.25 + 0.75 * ss(t, 0.0, 1.8);
    beamK *= 1 - 0.55 * ss(t, T.powerful - 0.2, T.powerful + 0.6) * (1 - ss(t, DROP - 0.02, DROP + 0.25));
    beamK *= 1 + 1.6 * flash(t, DROP, 0.02, 0.35) + 1.2 * flash(t, T.one, 0.02, 0.4) + 1.1 * flash(t, T.aurixa + 0.05, 0.18, 0.9);
    beamK *= 1 - 0.35 * ss(t, T.so - 0.3, T.so + 0.4) * (1 - ss(t, T.ask - 0.2, T.ask + 0.8));
    beamK *= 1 - 0.55 * ss(t, T.systems + 0.5, T.coming - 0.6);
    beamK *= 1 - 0.22 * ss(t, DROP + 0.5, DROP + 1.6) * (1 - ss(t, T.ask - 0.4, T.ask + 0.6));
    {
      const hw = 1.3, len = yTop - yBot;
      if (len > 0.002) {
        const q = board([0, (yBot + yTop) / 2, 0], hw, len / 2, true);
        W.quads.push({ p: q, uv: [0, 0, 1, 1], col: [...v3.mul([0.62, 0.84, 1.0], beamK * 1.25), full], ex: [1, 0, hw, len] });
      }
      // its base on the floor, and a halo about it, gone as it leaves the floor
      const onFloor = 1 - ss(gather, 0.0, 0.3);
      W.quads.push({ p: board([0, 0.05, 0], 0.26, 0.26), col: [...v3.mul([0.6, 0.82, 1.0], 0.9 * beamK * onFloor), 1], ex: [2, 0, 3.5, 0] });
      W.lights.push([[0, 0.25, 0], 2.2 * beamK * (1 - ss(gather, 0.0, 0.35)), [0.55, 0.78, 1.0], 2.6]);
      W.lights.push([[0, 2.2, 0], 1.6 * beamK * grow * (1 - 0.6 * gather), [0.5, 0.72, 1.0], 0.55]);
    }
    // ---- fog sheets about the beam, and dust in it
    for (let i = 0; i < 4; i++) {
      const c = [Math.sin(i * 2.3) * 1.2, 1.4 + i * 0.9, Math.cos(i * 2.3) * 1.2 - 0.5];
      const q = board(c, 2.6, 1.6);
      W.quads.push({ p: q, col: [...v3.mul([0.11, 0.16, 0.24], 0.3 * (0.4 + 0.6 * beamK)), 1], ex: [4, 0, i * 0.37 + t * 0.006, -t * 0.012 + i * 0.21] });
    }
    for (let i = 0; i < 220; i++) {
      const a = hash(i * 1.7) * Math.PI * 2, rr_ = Math.pow(hash(i * 3.1), 1.6) * 1.1;
      const y = (hash(i * 5.3) * 6 + t * (0.05 + 0.08 * hash(i * 9.1))) % 6;
      const c = [Math.cos(a) * rr_ + 0.08 * noise1(t * 0.3 + i), y, Math.sin(a) * rr_ + 0.08 * noise1(t * 0.27 + i * 2)];
      const inBeam = gather > 0 ? ss(y, yBot - 0.15, yBot + 0.15) * (1 - ss(y, yTop - 0.15, yTop + 0.15)) : y < beamTop ? 1 : 0;
      const lit = Math.exp(-Math.pow(rr_ / 0.32, 2)) * inBeam * beamK * (0.4 + 0.6 * hash(i * 2.9));
      if (lit < 0.03) continue;
      const s = pxAt(c, 1.6 + hash(i * 7.7) * 1.8);
      W.quads.push({ p: board(c, s, s), col: [...v3.mul([0.8, 0.9, 1.0], 1.1 * lit), 1], ex: [2, 0, 4.0, 0] });
    }

    // ---- the noise
    const offAt = (p) => {
      // Turning edge-on and gone: nearest the camera first, from "At" to "ambition".
      const d = v3.len(v3.sub(p.pos, cam.eye));
      return T.at + 0.05 + clamp((d - 4.5) / 4.0, 0, 1) * (T.ambition - T.at + 0.2);
    };
    for (const p of PANES) {
      const on = easeOut(lin(t, p.t, p.t + 0.22));
      if (on <= 0) continue;
      const off = lin(t, offAt(p), offAt(p) + 0.38);
      if (off >= 1) continue;
      const turn = easeIn(off) * (Math.PI / 2);
      const s = mix(0.9, 1, on);
      const dr = [0.04 * noise1(t * 0.3 + p.drift), 0.05 * noise1(t * 0.25 + p.drift * 2), 0];
      const c = v3.add(p.pos, dr);
      let r = rotY([1, 0, 0], p.yaw + turn), u = rotX([0, 1, 0], p.pitch);
      u = rotZ(u, p.roll);
      // face the camera's side of the room
      const R_ = v3.mul(r, (p.w / 2) * s), U = v3.mul(u, (p.h / 2) * s);
      const q = [v3.sub(v3.sub(c, R_), U), v3.sub(v3.add(c, R_), U), v3.add(v3.add(c, R_), U), v3.add(v3.sub(c, R_), U)];
      const glint = flash(t, p.t + 0.02, 0.02, 0.18) + 0.8 * Math.sin(Math.PI * off);
      W.panes.push({ q, tex: p.tex, alpha: on * (1 - off) * 0.92, glint, depth: v3.len(v3.sub(c, cam.eye)) });
      const edge = [0.75, 0.88, 1.0];
      for (let i = 0; i < 4; i++) W.lines.push([q[i], q[(i + 1) % 4], edge, 0.35 * on * (1 - off) + 1.8 * glint * (1 - off), 1.2, 5]);
    }
    // the tab strip: across the top of the room, tabs arriving one by one, the last one AI
    {
      const show = lin(t, T.and - 0.1, T.and + 0.2) * (1 - lin(t, T.at + 0.1, T.at + 0.45));
      if (show > 0) {
        const y = 2.5, z = 3.4, x0 = -0.92, th = 0.2, tw = 0.6;
        const lift = (1 - easeOut(lin(t, T.and - 0.1, T.and + 0.3))) * 0.3 + easeIn(lin(t, T.at + 0.1, T.at + 0.45)) * 0.6;
        const jam = t > T.tab ? 0.012 * Math.sin((t - T.tab) * 70) * Math.exp(-(t - T.tab) / 0.25) : 0;
        const bar = [[x0 - 0.2, y + lift - th * 0.65, z], [x0 + 6, y + lift - th * 0.65, z], [x0 + 6, y + lift + th * 0.65, z], [x0 - 0.2, y + lift + th * 0.65, z]];
        W.panes.push({ q: bar, tex: null, fill: [0.012, 0.02, 0.04], alpha: show * 0.9, glint: 0, depth: 0 });
        for (let k = 0; k < TABS; k++) {
          const isAI = k === TABS - 1;
          const tk = isAI ? T.ai - 0.04 : T.and + 0.05 + (k / (TABS - 1)) * (T.ai - T.and - 0.12);
          const on = easeOut(lin(t, tk, tk + 0.16));
          if (on <= 0) continue;
          // the tabs squeeze as more arrive
          const n = 1 + Math.min(TABS - 1, Math.floor(lin(t, T.and, T.ai) * (TABS - 1) + 0.0001));
          const w = mix(tw, 0.27, clamp((n - 3) / 8)) * (isAI ? 1.35 : 1);
          const step = mix(tw, 0.27, clamp((n - 3) / 8)) + 0.012;
          const scroll = Math.min(0, 0.62 - (x0 + (n - 1) * step + mix(tw, 0.27, clamp((n - 3) / 8)) * 1.35));
          let x = x0 + scroll;
          for (let j = 0; j < k; j++) x += step;
          x += jam * k;
          const yy = y + lift + (1 - on) * 0.08;
          const q = [[x, yy - th / 2, z], [x + w, yy - th / 2, z], [x + w, yy + th / 2, z], [x, yy + th / 2, z]];
          W.panes.push({ q, tex: isAI ? TEX.tabAI : TEX.tab, alpha: show * on, glint: isAI ? flash(t, T.ai, 0.02, 0.35) : 0, depth: -1 });
        }
      }
    }

    // ---- the five cases (and the sixth)
    const risen = easeOut(lin(t, T.at + 0.6, T.changes + 0.55)); // they rise from the floor as the noise goes
    const sink = easeIn(lin(t, T.ask + 0.2, T.becomes + 0.6));
    const caseY = -(1 - risen) * 1.95 - sink * 2.0;
    const kindle = ss(t, T.changes - 0.05, T.changes + 0.45) * (1 - ss(t, T.ask + 0.2, T.becomes + 0.3));
    const glassLift = easeInOut(lin(t, T.more + 0.1, T.separate + 0.2)); // the glass rises away
    const glassFade = 1 - ss(t, T.more + 0.25, T.stop + 0.35);
    const dropFlash = flash(t, DROP, 0.015, 0.22);
    const holoRise = easeInOut(lin(t, T.more + 0.4, T.destinations + 0.9));
    const conv = easeInOut(lin(t, T.ask - 0.05, T.system + 0.15)); // the five draw into the triangle
    const nodes = [];
    for (let k = 0; k < 5; k++) {
      const c = CASES[k];
      const tn = T.names[k];
      const lit = clamp(easeOut(lin(t, tn - 0.05, tn + 0.18)) + 0.25 * flash(t, tn + 0.02, 0.02, 0.15)) * (1 - ss(t, T.stop + 0.2, T.destinations + 0.5));
      const own = 1 + 0.35 * ss(t, T.powerful, T.own + 0.1) * (1 - ss(t, DROP, DROP + 0.4));
      const y0 = caseY;
      if (y0 > -1.94) {
        // plinth
        boxTris([c[0], 0, c[2]], PL.hw, y0, y0 + PL.h, PL.hw, [1, 1, 1, 1], 0.9, [k * 0.37, 0.11 * k], W.solid);
        // glass and lid, lifting away after the drop
        const gl_ = glassLift * 2.6;
        const gy0 = y0 + PL.h + gl_, gy1 = gy0 + GLASS.h;
        const pres = glassFade * (0.85 + 0.15 * risen);
        if (pres > 0.01) {
          const hw = PL.hw;
          const P_ = (dx, y, dz) => [c[0] + dx, y, c[2] + dz];
          const walls = [
            [[P_(-hw, gy0, hw), P_(hw, gy0, hw), P_(hw, gy1, hw), P_(-hw, gy1, hw)], [0, 0, 1]],
            [[P_(hw, gy0, -hw), P_(-hw, gy0, -hw), P_(-hw, gy1, -hw), P_(hw, gy1, -hw)], [0, 0, -1]],
            [[P_(hw, gy0, hw), P_(hw, gy0, -hw), P_(hw, gy1, -hw), P_(hw, gy1, hw)], [1, 0, 0]],
            [[P_(-hw, gy0, -hw), P_(-hw, gy0, hw), P_(-hw, gy1, hw), P_(-hw, gy1, -hw)], [-1, 0, 0]],
          ];
          for (const [q, n] of walls) W.glass.push({ q, n, col: [lit * own, dropFlash * 3, 0, pres] });
          // the glass's edges
          const corners = [P_(-hw, 0, hw), P_(hw, 0, hw), P_(hw, 0, -hw), P_(-hw, 0, -hw)];
          const edgeK = pres * (0.2 + 0.45 * lit * own + 3 * dropFlash);
          for (let i = 0; i < 4; i++) {
            const a = corners[i], b = corners[(i + 1) % 4];
            W.lines.push([[a[0], gy1, a[2]], [b[0], gy1, b[2]], [0.8, 0.9, 1.0], edgeK * 0.8, 1.1, 5]);
            W.lines.push([[a[0], gy0, a[2]], [b[0], gy0, b[2]], [0.8, 0.9, 1.0], edgeK * 0.5, 1.0, 4]);
            W.lines.push([[a[0], gy0, a[2]], [a[0], gy1, a[2]], [0.8, 0.9, 1.0], edgeK * 0.6, 1.1, 5]);
          }
          // its top, glass too
          W.glass.push({ q: [P_(-hw, gy1, hw), P_(hw, gy1, hw), P_(hw, gy1, -hw), P_(-hw, gy1, -hw)], n: [0, 1, 0], col: [lit * own * 0.5, dropFlash * 3, 0, pres * 0.8] });
          // its light, down into the case
          if (lit > 0.01) {
            const cone = board([c[0], gy0 + GLASS.h * 0.5, c[2]], PL.hw * 0.95, GLASS.h * 0.5, true);
            W.quads.push({ p: cone, col: [...v3.mul([0.85, 0.92, 1.0], 0.22 * lit * own * pres), 1], ex: [3, 0, 0, 0] });
            for (let i = 0; i < 4; i++) {
              const a = corners[i], b = corners[(i + 1) % 4];
              W.lines.push([[a[0], gy1 - 0.004, a[2]], [b[0], gy1 - 0.004, b[2]], [0.9, 0.95, 1.0], 1.1 * lit * own * pres, 1.3, 7]);
            }
          }
        }
        // the lid's light on the plinth's top, and the base's gold line
        if (lit > 0.002) W.lights.push([[c[0], y0 + PL.h + 0.75, c[2]], 0.9 * lit * own * (1 - glassLift * 0.7), [0.85, 0.92, 1.0], 9.0]);
        const base = kindle * (1 + 0.6 * dropFlash);
        if (base > 0.005) {
          const hw = PL.hw + 0.004;
          const P_ = (dx, y, dz) => [c[0] + dx, y, c[2] + dz];
          const ring = [P_(-hw, 0, hw), P_(hw, 0, hw), P_(hw, 0, -hw), P_(-hw, 0, -hw)];
          for (let i = 0; i < 4; i++) {
            const a = ring[i], b = ring[(i + 1) % 4];
            W.lines.push([[a[0], y0 + 0.006, a[2]], [b[0], y0 + 0.006, b[2]], GOLD, 2.2 * base, 1.6, 10]);
            W.lines.push([[a[0], y0 + PL.h, a[2]], [b[0], y0 + PL.h, b[2]], GOLD, 0.9 * base, 1.0, 5]);
          }
          W.lights.push([[c[0], 0.12, c[2]], 0.55 * base, GOLD, 6.0]);
        }
      }
      // the hologram's place: in its case, then risen free, then drawn into the triangle
      let hp = [c[0], HOLO_Y + y0 + 0.0, c[2]];
      hp = v3.lerp(hp, [c[0] * 1.02, 2.05, c[2] * 1.02], holoRise);
      const triTarget = [TRI.apex, TRI.br, null, TRI.bl, TRI.apex][k];
      const baseMid = v3.lerp(TRI.bl, TRI.br, 0.5);
      hp = v3.lerp(hp, triTarget || baseMid, conv);
      nodes.push(hp);
      // the hologram itself
      const draw = easeInOut(lin(t, tn + 0.02, tn + 0.75));
      const hk = lit > 0 ? 1 : 0;
      const holoK = (draw > 0 ? 1 : 0) * (1 - conv) * (0.85 + 0.15 * Math.sin(t * 23 + k * 5) * Math.sin(t * 7.1 + k));
      if (holoK > 0.003 && hp[1] > 0.02) {
        const H_ = HOLO[k];
        const sc = (1.22 + 0.22 * holoRise) * (1 - 0.6 * conv);
        const spin = (H_.spin || 0) * t + (H_.sway ? H_.sway * Math.sin(t * 0.55 + k) : 0) + rad(RING_DEG[k]) + (t > T.one - 0.05 ? (1 - Math.exp(-(t - T.one + 0.05) / 0.35)) * Math.PI * 0.5 : 0);
        const xf = (p) => v3.add(rotY(v3.mul(p, sc), spin), hp);
        const segs = [], golds = [];
        for (const pl of H_.lines) revealed(pl, draw, segs, xf);
        for (const pl of H_.gold) revealed(pl, draw, golds, xf);
        if (H_.needle) {
          const a = rad(220 - 260 * (0.55 + 0.12 * Math.sin(t * 1.3 + 1)));
          revealed([[0, 0, 0], [Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0]], draw, golds, xf);
        }
        const bright = holoK * (0.8 + 0.35 * own) * (1 + 2.0 * flash(t, T.one, 0.02, 0.35) + 0.4 * dropFlash);
        for (const [a, b] of segs) W.lines.push([a, b, ICE, 0.75 * bright, 1.15, 5]);
        for (const [a, b] of golds) W.lines.push([a, b, GOLD, 1.3 * bright, 1.5, 6]);
        // the projector's glow under it
        if (glassFade > 0.02 && hp[1] < 1.6) {
          W.quads.push({ p: board([hp[0], y0 + PL.h + 0.02, hp[2]], 0.12, 0.12), col: [...v3.mul(ICE, 0.45 * holoK * glassFade), 1], ex: [2, 0, 4, 0] });
        }
        W.quads.push({ p: board(hp, 0.3 * sc, 0.3 * sc), col: [...v3.mul(ICE, 0.05 * holoK), 1], ex: [2, 0, 3, 0] });
        W.lights.push([hp, 0.35 * holoK, ICE, 5.0]);
      }
      // its name, gold, under it
      const nameK = easeOut(lin(t, tn, tn + 0.3)) * (1 - ss(t, DROP - 0.05, DROP + 0.2));
      if (nameK > 0.01 && y0 > -0.5) {
        const lc = [c[0], y0 + PL.h + GLASS.h + 0.32 - (1 - nameK) * 0.06, c[2]];
        const sh = pxAt(lc, 52) / 2;
        W.labels.push({ q: board(lc, sh * 8, sh), tex: TEX.labels[k], k: nameK });
      }
    }
    // ---- the gold between them: fired on the drop, along the ring, then across it
    const ringEdges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]];
    const starEdges = [[0, 2], [1, 3], [2, 4], [3, 0], [4, 1]];
    const netDim = 1 - 0.68 * ss(t, T.so - 0.4, T.so + 0.3) * (1 - ss(t, T.ask - 0.1, T.ask + 0.5));
    const oneK = flash(t, T.one, 0.03, 0.55);
    const triDone = ss(t, T.aurixa - 0.05, T.aurixa + 0.55);
    const fire = (edges, at, out) => {
      for (const [i, j] of edges) {
        const p = easeOut(lin(t, at, at + 0.14));
        if (p <= 0) continue;
        const a = nodes[i], b0 = nodes[j];
        if (v3.len(v3.sub(a, b0)) < 0.02) continue;
        const b = v3.lerp(a, b0, p);
        // a median of the triangle (it is not one of its edges) fades as the five draw together
        const tri = (i === 0 && j === 2) || (i === 2 && j === 4) || (i === 4 && j === 0) ? 1 - conv : 1;
        const k = (1.6 + 1.6 * flash(t, at + 0.12, 0.01, 0.25) + 2.4 * oneK) * netDim * tri * (1 - triDone);
        out.push([a, b, GOLD, k, 2.0, 13]);
        if (p < 1) W.quads.push({ p: board(b, 0.12, 0.12), col: [...v3.mul(WARM, 4), 1], ex: [2, 0, 5, 0] });
      }
    };
    fire(ringEdges, DROP, W.lines);
    fire(starEdges, DROP + BEAT / 2, W.lines);
    if (t > DROP) for (let k = 0; k < 5; k++) W.lights.push([nodes[k], 0.7 * netDim * (1 + 2 * oneK) * (1 - triDone), GOLD, 3.0]);
    // ---- the pulse, and the context following it
    const path = [0, 1, 2, 3, 4, 0, 2, 4, 1, 3, 0];
    const pulseAt = (s) => {
      // s: edges travelled
      const i = Math.floor(s) % (path.length - 1), f = s - Math.floor(s);
      return v3.lerp(nodes[path[i]], nodes[path[i + 1]], easeInOut(f));
    };
    const pulseOn = ss(t, T.intelligence - 0.1, T.intelligence + 0.1) * (1 - ss(t, T.one - 0.1, T.one + 0.05));
    if (pulseOn > 0) {
      const speed = 2.4 + 2.2 * lin(t, T.business - 0.4, T.one);
      const sNow = (t - T.intelligence) * speed;
      for (let j = 0; j < 14; j++) {
        const s0 = sNow - j * 0.035, s1 = sNow - (j + 1) * 0.035;
        if (s1 < 0) break;
        W.lines.push([pulseAt(s0), pulseAt(s1), WARM, 4.5 * pulseOn * (1 - j / 14), 2.6, 12]);
      }
      const head = pulseAt(Math.max(0, sNow));
      W.quads.push({ p: board(head, 0.16, 0.16), col: [...v3.mul([1, 0.9, 0.7], 5 * pulseOn), 1], ex: [2, 0, 5, 0] });
      W.lights.push([head, 1.2 * pulseOn, WARM, 3.0]);
      // the client's and the property's tags, following at their own pace: node to node, a second an edge,
      // settling at each node before going on
      const tagOn = ss(t, T.context - 0.15, T.context + 0.15) * (1 - ss(t, T.one - 0.3, T.one));
      if (tagOn > 0) {
        const tagS = (tt) => {
          const u = Math.max(0, tt) / 1.0, i = Math.floor(u), fr = u - i;
          return i + easeInOut(clamp(fr * 1.3));
        };
        const pathAt = (s) => {
          const i = Math.floor(s) % (path.length - 1), fr = s - Math.floor(s);
          return v3.lerp(nodes[path[i]], nodes[path[i + 1]], fr);
        };
        for (const [m, lag] of [[0, 0.0], [1, 0.75]]) {
          const p = v3.add(pathAt(tagS(t - T.context - lag)), [0, 0.15 + 0.07 * m, 0]);
          const sh = pxAt(p, 44) / 2;
          W.tags.push({ q: board(p, sh * 5.33, sh), tex: TEX.tags[m], k: tagOn });
        }
      }
    }
    // the floor's ring of light on "one"
    if (t > T.one - 0.02 && t < T.one + 1.6) {
      const f = lin(t, T.one - 0.02, T.one + 1.5);
      const r = 0.3 + easeOut(f) * 6;
      W.quads.push({ p: [[-r, 0.004, -r], [r, 0.004, -r], [r, 0.004, r], [-r, 0.004, r]], col: [...v3.mul(GOLD, 2.4 * (1 - f) * (1 - f)), 1], ex: [5, 0, 0, 0] });
    }

    // ---- the sixth case: empty, lit, and its light going out
    {
      const up = easeOut(lin(t, T.one + 0.25, T.so - 0.05)) * (1 - easeIn(lin(t, T.ask + 0.5, T.becomes + 0.4)));
      if (up > 0.001) {
        const y0 = -(1 - up) * 1.95;
        const on = clamp(lin(t, T.so - 0.12, T.so + 0.05) + 0.3 * flash(t, T.so + 0.08, 0.02, 0.1)) * (1 - lin(t, T.is + 0.05, T.is + 0.17));
        const flick = on * (1 - 0.6 * (t < T.so + 0.3 && t > T.so ? hash(Math.floor(t * 24)) > 0.6 : 0));
        const c = EMPTY;
        boxTris([c[0], 0, c[2]], PL.hw, y0, y0 + PL.h, PL.hw, [1, 1, 1, 1], 0.9, [0.71, 0.33], W.solid);
        const gy0 = y0 + PL.h, gy1 = gy0 + GLASS.h, hw = PL.hw;
        const P_ = (dx, y, dz) => [c[0] + dx, y, c[2] + dz];
        const walls = [
          [[P_(-hw, gy0, hw), P_(hw, gy0, hw), P_(hw, gy1, hw), P_(-hw, gy1, hw)], [0, 0, 1]],
          [[P_(hw, gy0, -hw), P_(-hw, gy0, -hw), P_(-hw, gy1, -hw), P_(hw, gy1, -hw)], [0, 0, -1]],
          [[P_(hw, gy0, hw), P_(hw, gy0, -hw), P_(hw, gy1, -hw), P_(hw, gy1, hw)], [1, 0, 0]],
          [[P_(-hw, gy0, -hw), P_(-hw, gy0, hw), P_(-hw, gy1, hw), P_(-hw, gy1, -hw)], [-1, 0, 0]],
        ];
        for (const [q, n] of walls) W.glass.push({ q, n, col: [flick, 0, 0, 1] });
        const corners = [P_(-hw, 0, hw), P_(hw, 0, hw), P_(hw, 0, -hw), P_(-hw, 0, -hw)];
        for (let i = 0; i < 4; i++) {
          const a = corners[i], b = corners[(i + 1) % 4];
          const ek = 0.25 + 1.0 * flick;
          W.lines.push([[a[0], gy1, a[2]], [b[0], gy1, b[2]], [0.8, 0.9, 1.0], ek * 0.8, 1.1, 5]);
          W.lines.push([[a[0], gy0, a[2]], [b[0], gy0, b[2]], [0.8, 0.9, 1.0], ek * 0.5, 1.0, 4]);
          W.lines.push([[a[0], gy0, a[2]], [a[0], gy1, a[2]], [0.8, 0.9, 1.0], ek * 0.6, 1.1, 5]);
          W.lines.push([[a[0], gy1 - 0.004, a[2]], [b[0], gy1 - 0.004, b[2]], [0.9, 0.95, 1.0], 1.6 * flick, 1.4, 8]);
          W.lines.push([[a[0], y0 + 0.006, a[2]], [b[0], y0 + 0.006, b[2]], [0.85, 0.9, 1.0], 0.9 * flick + 0.15 * up, 1.4, 8]);
        }
        W.glass.push({ q: [P_(-hw, gy1, hw), P_(hw, gy1, hw), P_(hw, gy1, -hw), P_(-hw, gy1, -hw)], n: [0, 1, 0], col: [flick * 0.5, 0, 0, 0.8] });
        if (flick > 0.01) {
          W.quads.push({ p: board([c[0], gy0 + GLASS.h * 0.5, c[2]], PL.hw * 0.95, GLASS.h * 0.5, true), col: [...v3.mul([0.85, 0.92, 1.0], 0.8 * flick), 1], ex: [3, 0, 0, 0] });
          W.lights.push([[c[0], gy0 + 0.75, c[2]], 1.2 * flick, [0.85, 0.92, 1.0], 6.0]);
        }
      }
    }

    // ---- the triangle, then the emblem
    if (conv > 0.6 || t > T.system) {
      const k = ss(t, T.becomes, T.system + 0.1) * (1 - ss(t, T.aurixa + 0.15, T.aurixa + 0.7));
      if (k > 0) {
        const tri = [TRI.apex, TRI.bl, TRI.br];
        for (let i = 0; i < 3; i++) W.lines.push([tri[i], tri[(i + 1) % 3], GOLD, 3.2 * k, 2.4, 16]);
      }
      const e = ss(t, T.aurixa - 0.05, T.aurixa + 0.6);
      if (e > 0) {
        const [x0, y0, x1, y1] = ART.emblem_crop;
        const q = [artToWorld(x0, y1, 0.0), artToWorld(x1, y1, 0.0), artToWorld(x1, y0, 0.0), artToWorld(x0, y0, 0.0)];
        W.emblem.push({ q, tex: TEX.emblem, k: e * (1 + 0.6 * flash(t, T.aurixa + 0.35, 0.1, 0.8)) });
        W.lights.push([[0, EMB_Y, -0.4], 1.2 * e, WARM, 1.2]);
        // its lettering, letter by letter: AURIXA on "Aurixa", SYSTEMS on "Systems"
        D.letters.forEach((L, i) => {
          const first = i < 6;
          const t0 = (first ? T.aurixa + 0.05 : T.systems - 0.05) + (first ? i : i - 6) * 0.075;
          const f = easeOut(lin(t, t0, t0 + 0.5));
          if (f <= 0) return;
          const dy = (1 - f) * 0.12;
          const p0 = artToWorld(L.l, L.y1, -0.01), p1 = artToWorld(L.r, L.y1, -0.01), p2 = artToWorld(L.r, L.y0, -0.01), p3 = artToWorld(L.l, L.y0, -0.01);
          const q = [p0, p1, p2, p3].map((p) => [p[0], p[1] - dy, p[2]]);
          W.emblem.push({ q, tex: TEX.letters, uv: [L.l / ART.w, L.y1 / ART.h, L.r / ART.w, L.y0 / ART.h], k: f, letter: true });
        });
      }
    }
    // ---- the beam's light in the orb. Three rings circle inside the A, each faster as it tightens (as a skater's
    // spin), and close on the orb one after another; the orb takes each in and keeps the light, breathing.
    if (gather > 0.4) {
      const O = artToWorld(...ART.orb, -0.03);
      const OR = 0.19; // the orb's radius (about 74 px of the art)
      const RINGS = [
        { r0: 0.37, born: T.aurixa + 0.62, close: T.aurixa + 2.45, dir: 1, ph: 1.9 },
        { r0: 0.31, born: T.aurixa + 0.8, close: T.aurixa + 2.85, dir: -1, ph: 4.3 },
        { r0: 0.255, born: T.aurixa + 0.98, close: T.aurixa + 3.25, dir: 1, ph: 0.4 },
      ];
      const COL = [0.72, 0.88, 1.0];
      const radius = (Rg, tt) => mix(Rg.r0, OR * 1.04, easeInOut(lin(tt, Rg.born, Rg.close)));
      // its angle at t: a half turn a second at first, quickening as (r0 / r)^2, summed from its birth
      const angle = (Rg) => {
        const n = 48, span = Math.max(0, t - Rg.born), dt = span / n;
        let a = 0;
        for (let i = 0; i < n; i++) a += Math.PI * Math.pow(Rg.r0 / radius(Rg, Rg.born + (i + 0.5) * dt), 2) * dt;
        return Rg.ph + Rg.dir * a;
      };
      const ring = (r, head, dir, k, tail, base) => {
        const N = 80;
        const at = (phi) => [O[0] + r * Math.cos(phi), O[1] + r * Math.sin(phi), O[2]];
        for (let i = 0; i < N; i++) {
          const p0 = (i / N) * 2 * Math.PI, p1 = ((i + 1) / N) * 2 * Math.PI, pm = (p0 + p1) / 2;
          let d = dir > 0 ? head - pm : pm - head; // how far behind the head, along its way
          d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          W.lines.push([at(p0), at(p1), COL, k * (base + Math.exp(-d / tail)), 1.15, 7]);
        }
        W.quads.push({ p: board(at(head), 0.045, 0.045), col: [...v3.mul([0.9, 0.96, 1.0], 1.6 * k), 1], ex: [2, 0, 5, 0] });
      };
      let taken = 0;
      for (const Rg of RINGS) {
        const k = ss(t, Rg.born, Rg.born + 0.3) * (1 - ss(t, Rg.close - 0.1, Rg.close + 0.4));
        taken += flash(t, Rg.close + 0.05, 0.2, 0.7);
        if (k > 0.002) ring(radius(Rg, t), angle(Rg), Rg.dir, 2.8 * k, 0.9, 0.1);
      }
      // the light kept: the orb's glow, and one faint ring turning slowly at its rim
      const kept = ss(t, RINGS[2].close - 0.3, RINGS[2].close + 0.8);
      const arrive = ss(gather, 0.55, 1.0);
      const breath = 0.88 + 0.12 * Math.sin((t - T.aurixa) * 2.2);
      const orbK = 0.42 * arrive * (1 - 0.45 * kept) + 0.3 * taken + 0.3 * kept * breath;
      W.quads.push({ p: board(O, OR * 1.7, OR * 1.7), col: [...v3.mul([0.62, 0.84, 1.0], orbK), 1], ex: [2, 0, 3.2, 0] });
      W.lights.push([O, 0.8 * orbK, [0.6, 0.82, 1.0], 1.5]);
      if (kept > 0.002) ring(OR * 1.07, 0.6 + (t - RINGS[2].close) * 1.3, 1, 0.55 * kept * breath, 1.4, 0.18);
    }
    return W;
  }

  // ------------------------------------------------------------------ drawing
  function lightsU(W) {
    const L = new Float32Array(24 * 4), C = new Float32Array(24 * 4);
    const n = Math.min(24, W.lights.length);
    for (let i = 0; i < n; i++) {
      const [p, k, c, fall] = W.lights[i];
      L.set([p[0], p[1], p[2], k], i * 4);
      C.set([c[0], c[1], c[2], fall], i * 4);
    }
    return { uL: L, uLC: C, uNL: { int: n } };
  }
  function drawWorld(W, cam, mirror, t) {
    const vp = mirror ? cam.vpMirror : cam.vp;
    const eye = mirror ? [cam.eye[0], -cam.eye[1], cam.eye[2]] : cam.eye;
    const LU = lightsU(W);
    const tgt = mirror ? E.T.mirror : E.T.main;
    const common = { uVP: vp, uEye: eye, uMirror: mirror ? 1 : 0, uTime: t, uRes: [tgt.w, tgt.h], uWScale: tgt.w / E.w };
    // solids
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(SOLID.p);
    setU(SOLID, { ...common, ...LU, uMarble: TEX.marble, uAmb: 0.004 });
    GLX.draw(E, SOLID, new Float32Array(W.solid), MESH_LAYOUT);
    // light and glass, without writing depth
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // additive sprites (beam, fog, glows, cones, rings)
    gl.useProgram(QUAD.p);
    setU(QUAD, { ...common, uTex: TEX.white, uFog: TEX.fog });
    GLX.draw(E, QUAD, quadVerts(W.quads), QUAD_LAYOUT);
    // the panes, far to near
    const panes = W.panes.slice().sort((a, b) => b.depth - a.depth);
    for (const p of panes) {
      if (p.tex) {
        setU(QUAD, { uTex: p.tex, uFog: TEX.fog });
        GLX.draw(E, QUAD, quadVerts([{ p: p.q, uv: [0, 1, 1, 0], col: [1 + p.glint, 1 + p.glint, 1 + p.glint, p.alpha], ex: [0, 1, 0, 0] }]), QUAD_LAYOUT);
      } else {
        setU(QUAD, { uTex: TEX.white, uFog: TEX.fog });
        GLX.draw(E, QUAD, quadVerts([{ p: p.q, uv: [0, 0, 1, 1], col: [...p.fill.map((c) => Math.sqrt(c)), p.alpha], ex: [0, 1, 0, 0] }]), QUAD_LAYOUT);
      }
    }
    // glass
    gl.useProgram(GLASSP.p);
    setU(GLASSP, common);
    const gv = [];
    for (const g of W.glass) quadMesh(g.q, g.n, g.col, gv);
    GLX.draw(E, GLASSP, new Float32Array(gv), MESH_LAYOUT);
    // lines
    gl.useProgram(LINE.p);
    setU(LINE, { ...common, uBright: 1 });
    GLX.draw(E, LINE, lineVerts(W.lines), LINES_LAYOUT);
    // labels, tags and the emblem
    gl.useProgram(QUAD.p);
    setU(QUAD, { ...common, uTex: TEX.white, uFog: TEX.fog });
    for (const L of mirror ? [] : W.labels) {
      setU(QUAD, { uTex: L.tex, uFog: TEX.fog });
      GLX.draw(E, QUAD, quadVerts([{ p: L.q, uv: [0, 1, 1, 0], col: [3.2 * L.k, 2.6 * L.k, 1.6 * L.k, 1], ex: [6, 0, 0, 0] }]), QUAD_LAYOUT);
    }
    for (const G of mirror ? [] : W.tags) {
      setU(QUAD, { uTex: G.tex, uFog: TEX.fog });
      GLX.draw(E, QUAD, quadVerts([{ p: G.q, uv: [0, 1, 1, 0], col: [1.6, 1.6, 1.6, G.k], ex: [0, 1, 0, 0] }]), QUAD_LAYOUT);
    }
    for (const M of W.emblem) {
      setU(QUAD, { uTex: M.tex, uFog: TEX.fog });
      const uv = M.uv || [0, 1, 1, 0];
      const ek = (M.letter ? 1.1 : 0.82) * M.k;
      GLX.draw(E, QUAD, quadVerts([{ p: M.q, uv, col: [ek, ek, ek, 1], ex: [6, 0, 0, 0] }]), QUAD_LAYOUT);
    }
    gl.depthMask(true);
  }

  function bind(target_) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target_ ? target_.fb : null);
    gl.viewport(0, 0, target_ ? target_.w : E.w, target_ ? target_.h : E.h);
  }
  // One drawing of the world at t into the main target.
  function drawAt(t, jitter) {
    const cam = cameraAt(t, jitter);
    const W = world(t, cam);
    // the mirror
    bind(E.T.mirror);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawWorld(W, cam, true, t);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    bind(E.T.mirrorB);
    fullscreen(BLUR, { uSrc: { tex: E.T.mirror.tex }, uDir: [1 / E.T.mirrorB.w, 0] });
    bind(E.T.mirrorC);
    fullscreen(BLUR, { uSrc: { tex: E.T.mirrorB.tex }, uDir: [0, 1 / E.T.mirrorC.h] });
    bind(E.T.mirrorB);
    fullscreen(BLUR, { uSrc: { tex: E.T.mirrorC.tex }, uDir: [2 / E.T.mirrorB.w, 0] });
    bind(E.T.mirrorC);
    fullscreen(BLUR, { uSrc: { tex: E.T.mirrorB.tex }, uDir: [0, 2 / E.T.mirrorC.h] });
    // the room
    bind(E.T.main);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    fullscreen(SKY, { uFog: TEX.fog, uTime: t, uFogAmt: 0.55, uLow: [0.0018, 0.0040, 0.0090], uTop: [0.0004, 0.0009, 0.0022] });
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.useProgram(FLOOR.p);
    const LU = lightsU(W);
    setU(FLOOR, { uVP: cam.vp, uEye: cam.eye, ...LU, uMarble: TEX.marble, uRefl: { tex: E.T.mirror.tex }, uReflBlur: { tex: E.T.mirrorC.tex },
      uRes: [E.w, E.h], uTile: 4.0, uPolish: 1.0, uAmb: 0.0035, uFade: 5.5 });
    const F = 40;
    const fl = [];
    quadMesh([[-F, 0, F], [F, 0, F], [F, 0, -F], [-F, 0, -F]], [0, 1, 0], [1, 1, 1, 1], fl);
    GLX.draw(E, FLOOR, new Float32Array(fl), MESH_LAYOUT);
    drawWorld(W, cam, false, t);
    return { cam, W };
  }

  function bloom(srcTex) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    let src = srcTex, sw = E.w, sh = E.h;
    E.T.bloom.forEach((b, i) => {
      bind(b);
      fullscreen(DOWN, { uSrc: { tex: src }, uTexel: [1 / sw, 1 / sh], uThresh: i === 0 ? 0.9 : 0 });
      src = b.tex;
      sw = b.w;
      sh = b.h;
    });
    const n = E.T.bloom.length;
    let up = E.T.bloom[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      const dst = E.T.bloomUp[i];
      bind(dst);
      fullscreen(UP, { uSrc: { tex: up.tex }, uAdd: { tex: E.T.bloom[i].tex }, uTexel: [1 / up.w, 1 / up.h] });
      up = dst;
    }
    return up.tex;
  }

  // ------------------------------------------------------------------ the words
  const BLOCKS = D.blocks;
  const VIS = {
    b1: [null, wt("s2", 0) - 0.3], b2a: [null, wt("s2", 6) - 0.12], b2b: [null, wt("s2", 12) - 0.12], b2c: [null, T.at - 0.15],
    b3: [null, T.names[0] - 0.25], b4: [null, T.powerful - 0.22], b5: [null, DROP], b6: [null, T.when - 0.25],
    b7a: [null, T.so - 0.3], b7b: [null, T.so - 0.3], b7c: [null, T.so - 0.3],
    b8: [null, T.ask - 0.2], b9: [null, T.aurixa - 0.1], b11: [null, 99],
  };
  function words(t) {
    let top = 0, low = 0;
    for (const [id, b] of Object.entries(BLOCKS)) {
      const el = document.getElementById(id);
      const first = b.words[0].start;
      const end = VIS[id][1];
      const hard = id === "b5"; // the drop cuts it
      const out = hard ? (t >= end ? 1 : 0) : lin(t, end, end + 0.28);
      const vis = t >= first - 0.12 && out < 1;
      el.style.visibility = vis ? "visible" : "hidden";
      if (!vis) continue;
      el.style.opacity = String(1 - out);
      b.words.forEach((w, i) => {
        const s = document.getElementById(`${id}-w${i}`);
        const f = easeOut(lin(t, w.start - 0.06, w.start + 0.24));
        s.style.opacity = String(f);
        s.style.transform = `translateY(${(1 - f) * 0.22}em)`;
        s.style.filter = f < 1 ? `blur(${(1 - f) * 6}px)` : "none";
      });
      const ul = document.getElementById(`${id}-ul`);
      if (ul) {
        const last = b.words[b.words.length - 1];
        ul.style.transform = `scaleX(${easeInOut(lin(t, last.start, last.end + 0.35))})`;
      }
      if (id === "b11") low = Math.max(low, (1 - out) * ss(t, first - 0.25, first + 0.25));
      else top = Math.max(top, (1 - out) * ss(t, first - 0.2, first + 0.2));
    }
    document.getElementById("bandTop").style.opacity = String(top);
    document.getElementById("bandLow").style.opacity = String(low);
  }

  // ------------------------------------------------------------------ the instant
  let ready = null;
  async function init() {
    await document.fonts.ready;
    const [marble, fog, emblem, letters] = await Promise.all([D.tex.marble, D.tex.fog, D.tex.emblem, D.tex.letters].map(loadImg));
    TEX.marble = { tex: GLX.texture(gl, marble, { repeat: true, mipmap: true }) };
    TEX.fog = { tex: GLX.texture(gl, fog, { repeat: true, mipmap: true }) };
    TEX.emblem = { tex: GLX.texture(gl, emblem, { mipmap: true }) };
    TEX.letters = { tex: GLX.texture(gl, letters, { mipmap: true }) };
    const white = document.createElement("canvas");
    white.width = white.height = 4;
    const wx = white.getContext("2d");
    wx.fillStyle = "#fff";
    wx.fillRect(0, 0, 4, 4);
    TEX.white = { tex: GLX.texture(gl, white) };
    for (const p of PANES) p.tex = { tex: paneTex(p.kind, p.seed).tex };
    TEX.tab = { tex: tabTex(null).tex };
    TEX.tabAI = { tex: tabTex("AI").tex };
    TEX.labels = ["RESEARCH", "CLIENTS", "REPORTS", "FINANCE", "COMMUNICATION"].map(labelTex);
    TEX.tags = ["JORDAN ELLIS", "14 WATTLE GROVE"].map(tagTex);
  }
  window.setT = async (t, opts = {}) => {
    if (!ready) ready = init();
    await ready;
    const n = Math.max(1, opts.n || 1), shutter = opts.shutter ?? 0.5 / 30;
    const halton = (i, b) => {
      let f = 1, r = 0;
      for (; i > 0; i = Math.floor(i / b)) {
        f /= b;
        r += f * (i % b);
      }
      return r;
    };
    for (let i = 0; i < n; i++) {
      const ts = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * shutter;
      drawAt(ts, n === 1 ? null : [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);
      gl.disable(gl.DEPTH_TEST);
      bind(E.T.accum);
      if (i === 0) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      fullscreen(COPY, { uSrc: { tex: E.T.main.tex }, uK: 1 / n });
      gl.disable(gl.BLEND);
    }
    const bl = bloom(E.T.accum.tex);
    bind(null);
    const fade = 1 - 0.0 * lin(t, 45.3, 45.5);
    fullscreen(FINAL, { uHdr: { tex: E.T.accum.tex }, uBloom: { tex: bl }, uBloomK: 0.62, uExposure: 1.0, uSeed: (t * 30) % 97, uVig: 0.55, uFade: fade });
    words(t);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // waits for the drawing
    return true;
  };
})();
