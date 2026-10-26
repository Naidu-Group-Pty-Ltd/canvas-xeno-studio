// As One's renderer: a small WebGL2 engine for film.js. One camera in metres; HDR targets; the world drawn twice, once
// mirrored in the floor for the marble's polish; lines drawn as anti-aliased quads in the screen's own pixels; bloom;
// and a filmic tone map. Nothing here knows the film: film.js says what is where at each instant.
"use strict";

const GLX = (() => {
  // ---------------------------------------------------------------- maths
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };
  // Column-major 4x4, as WebGL takes them.
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(eye, target, up, roll = 0) {
    const f = v3.norm(v3.sub(target, eye));
    let r = v3.norm(v3.cross(f, up));
    let u = v3.cross(r, f);
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      const r2 = v3.add(v3.mul(r, c), v3.mul(u, s));
      u = v3.add(v3.mul(u, c), v3.mul(r, -s));
      r = r2;
    }
    return {
      m: new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
        -v3.dot(r, eye), -v3.dot(u, eye), v3.dot(f, eye), 1]),
      r, u, f,
    };
  }
  function mul4(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
    return o;
  }
  // The mirror in the floor (y = 0).
  const MIRROR = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  /** A camera: eye, target, vertical field of view (degrees), roll (radians), for a w x h frame; `jitter` moves its
   * picture by a fraction of a pixel ([x, y], in pixels of a gw x gh target), for samples that average to smooth edges. */
  function camera(eye, target, fovDeg, w, h, roll = 0, jitter = null, gw = w, gh = h) {
    const fov = (fovDeg * Math.PI) / 180;
    const view = lookAt(eye, target, [0, 1, 0], roll);
    const proj = perspective(fov, w / h, 0.05, 200);
    if (jitter) {
      proj[8] += (2 * jitter[0]) / gw;
      proj[9] += (2 * jitter[1]) / gh;
    }
    const vp = mul4(proj, view.m);
    const vpMirror = mul4(vp, MIRROR);
    const focal = h / 2 / Math.tan(fov / 2);
    return {
      eye, target, fov, w, h, vp, vpMirror, view, focal,
      /** Where a world point falls in the frame (CSS px), its depth, and whether it is in front of the camera. */
      project(p) {
        const d = v3.sub(p, eye);
        const z = v3.dot(d, view.f);
        const x = v3.dot(d, view.r), y = v3.dot(d, view.u);
        return { x: w / 2 + (x / z) * focal, y: h / 2 - (y / z) * focal, z, front: z > 0.05 };
      },
    };
  }

  // ---------------------------------------------------------------- GL plumbing
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
      throw new Error(`shader: ${log}\n${lines}`);
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    const a = {};
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return { p, u, a };
  }
  function texture(gl, src, { repeat = false, mipmap = false, linear = true } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    return t;
  }
  function target(gl, w, h, { depth = false } = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (ok !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer ${w}x${h}: ${ok}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h, rb };
  }

  // ---------------------------------------------------------------- shaders
  const HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
  const FULL_VS = HEADER + `
  out vec2 vUv;
  void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  // Positions in the world; the same shader draws the world and its mirror (uVP is the mirror's), and discards
  // what falls below the floor in the mirror.
  const MESH_VS = HEADER + `
  in vec3 aPos; in vec3 aNor; in vec4 aCol; in vec2 aUv;
  uniform mat4 uVP; uniform float uMirror;
  out vec3 vPos; out vec3 vNor; out vec4 vCol; out vec2 vUv;
  void main() {
    vPos = aPos; vNor = aNor; vCol = aCol; vUv = aUv;
    gl_Position = uVP * vec4(aPos, 1.0);
  }`;

  // Lines as quads: each vertex knows its segment's two ends and which corner it is; the quad is widened in the
  // screen's pixels, so a line is as sharp near as far, with a core and a glow. Each end ramps over the glow's reach,
  // so the segments of a polyline overlap to exactly one at their joints. Positions are given with w = 1, so the
  // quad's measures interpolate in the screen's own terms. Additive.
  const LINE_VS = HEADER + `
  in vec3 aA; in vec3 aB; in vec2 aCorner; in vec4 aCol; in vec2 aWidth; in float aT;
  uniform mat4 uVP; uniform vec2 uRes; uniform float uWScale;
  out vec4 vCol; out vec2 vD; out float vHalf; out float vCore; out float vL; out float vY;
  void main() {
    vec4 a = uVP * vec4(aA, 1.0), b = uVP * vec4(aB, 1.0);
    float n = 0.06;
    if (a.w < n && b.w < n) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    if (a.w < n) a = mix(a, b, (n - a.w) / (b.w - a.w));
    if (b.w < n) b = mix(b, a, (n - b.w) / (a.w - b.w));
    vec2 sa = a.xy / a.w * 0.5 * uRes, sb = b.xy / b.w * 0.5 * uRes;
    vec2 dir = sb - sa; float L = length(dir); dir = L > 1e-4 ? dir / L : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float core = aWidth.x * uWScale, half_ = aWidth.y * uWScale + 1.5;
    bool atB = aCorner.x > 0.5;
    float side = aCorner.y * 2.0 - 1.0;
    vec2 s = (atB ? sb : sa) + nrm * side * half_ + dir * (atB ? half_ : -half_);
    float z = atB ? b.z / b.w : a.z / a.w;
    gl_Position = vec4(s / (0.5 * uRes), z, 1.0);
    vCol = aCol; vD = vec2(atB ? L + half_ : -half_, side * half_); vHalf = half_; vCore = core; vL = L;
    vY = atB ? aB.y : aA.y;
  }`;
  const LINE_FS = HEADER + `
  in vec4 vCol; in vec2 vD; in float vHalf; in float vCore; in float vL; in float vY;
  uniform float uMirror; uniform float uBright;
  out vec4 o;
  void main() {
    if (uMirror > 0.5 && vY < 0.0) discard;
    float d = abs(vD.y);
    float ramp = clamp((vD.x + vHalf) / (2.0 * vHalf), 0.0, 1.0) * clamp((vL + vHalf - vD.x) / (2.0 * vHalf), 0.0, 1.0);
    float core = 1.0 - smoothstep(vCore * 0.5 - 0.6, vCore * 0.5 + 0.6, d);
    float glow = exp(-d * d / (vHalf * vHalf * 0.18));
    o = vec4(vCol.rgb * vCol.a * (core + 0.35 * glow) * ramp * uBright, 0.0);
  }`;

  // Billboards and planes with a texture or a procedure; premultiplied, so one blend serves both light (additive,
  // alpha 0) and matter (alpha over).
  const QUAD_VS = HEADER + `
  in vec3 aPos; in vec2 aUv; in vec4 aCol; in vec4 aExtra;
  uniform mat4 uVP;
  out vec2 vUv; out vec4 vCol; out vec4 vExtra; out vec3 vPos;
  void main() { vUv = aUv; vCol = aCol; vExtra = aExtra; vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;

  // ---------------------------------------------------------------- the engine
  function create(canvas, W, H, scale) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("no WebGL2");
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("no float targets");
    gl.getExtension("OES_texture_float_linear");
    const w = Math.round(W * scale), h = Math.round(H * scale);
    canvas.width = w;
    canvas.height = h;
    const T = {
      main: target(gl, w, h, { depth: true }),
      mirror: target(gl, w >> 1, h >> 1, { depth: true }),
      mirrorB: target(gl, w >> 2, h >> 2),
      mirrorC: target(gl, w >> 2, h >> 2),
      accum: target(gl, w, h),
      bloom: [],
    };
    for (let k = 1; k <= 6; k++) T.bloom.push(target(gl, Math.max(1, w >> k), Math.max(1, h >> k)));
    T.bloomUp = T.bloom.map((b) => target(gl, b.w, b.h));
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    return { gl, W, H, w, h, scale, T, vao, buf };
  }

  /** Draws `verts` (Float32Array, `stride` floats each) with `prog`, its attributes laid out as `layout` [[name, n], ...]. */
  function draw(E, prog, verts, layout, mode) {
    const { gl } = E;
    if (!verts.length) return;
    gl.bindVertexArray(E.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, E.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    const stride = layout.reduce((s, [, n]) => s + n, 0);
    let off = 0;
    for (let i = 0; i < 16; i++) gl.disableVertexAttribArray(i);
    for (const [name, n] of layout) {
      const loc = prog.a[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride * 4, off * 4);
      }
      off += n;
    }
    gl.drawArrays(mode ?? gl.TRIANGLES, 0, verts.length / stride);
  }

  return { v3, camera, program, texture, target, create, draw, HEADER, FULL_VS, MESH_VS, LINE_VS, LINE_FS, QUAD_VS };
})();
