// The teaser's motion (film.py writes the page and its DATA): window.setT(t) draws the instant t, in seconds, of the
// 37.5 seconds, and resolves once every picture it changed has decoded. Nothing moves on its own: every position,
// fade and curve is worked out here from t, so any frame can be drawn in any order, by any number of browsers.
//
// One camera holds the city: its scale (s, px a km on the screen, the closest plate's 18 at rest) and the point of
// the closest plate at the screen's centre. The plates are the same streets at 2.5, 7 and 18 px a km, so each is
// placed by its scale alone. The orbit is laid over them about the pin and turned and sheared onto them as the
// camera falls, so by the time it fades the streets beneath it are where its lights were.
// Under node, it exports the camera, to measure the margins the orbit needs (film.py's orbit render).
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ curves
  /** A CSS cubic-bezier as a function of time (0 to 1), solved as the browser solves it (Reel 1's motion.cjs). */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const X = (s) => ((ax * s + bx) * s + cx) * s;
    const Y = (s) => ((ay * s + by) * s + cy) * s;
    const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let s = t;
      for (let i = 0; i < 8; i++) {
        const e = X(s) - t;
        if (Math.abs(e) < 1e-7) return Y(s);
        const d = dX(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      let lo = 0;
      let hi = 1;
      s = t;
      for (let i = 0; i < 50; i++) {
        const x = X(s);
        if (Math.abs(x - t) < 1e-7) break;
        if (x < t) lo = s;
        else hi = s;
        s = (lo + hi) / 2;
      }
      return Y(s);
    };
  }
  const EASE = {
    move: bezier(0.2, 0, 0, 1), // the brand's ease-move (aurixa-reel.css)
    settle: bezier(0.22, 1, 0.36, 1), // the brand's ease-settle
    inout: bezier(0.65, 0, 0.35, 1),
    dive: bezier(0.44, 0, 0.38, 0.95), // the fall: gathering off the orbit, fastest through the air, a long settle
    sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
    lin: (u) => u,
    out: (u) => 1 - (1 - u) ** 3,
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const lerp2 = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p)];
  const span = (t, a, b, e = EASE.move) => e(clamp01((t - a) / (b - a)));
  /** Up over [a, b], down over [c, d]. */
  const env = (t, a, b, c, d, e = EASE.sine) => Math.min(span(t, a, b, e), 1 - span(t, c, d, e));
  const C = [540, 960];

  // ------------------------------------------------------------------ 2 x 2 algebra, for the orbit's hand-over
  const m2mul = (a, b) => [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
  const m2inv = (a) => {
    const d = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    return [
      [a[1][1] / d, -a[0][1] / d],
      [-a[1][0] / d, a[0][0] / d],
    ];
  };
  const rot = (th) => [
    [Math.cos(th), -Math.sin(th)],
    [Math.sin(th), Math.cos(th)],
  ];
  /** A symmetric positive matrix to the power p (its eigenvalues raised). */
  function symPow(m, p) {
    const a = m[0][0];
    const b = m[0][1];
    const c = m[1][1];
    const mid = (a + c) / 2;
    const r = Math.hypot((a - c) / 2, b);
    const l1 = mid + r;
    const l2 = mid - r;
    let v = Math.abs(b) > 1e-12 ? [b, l1 - a] : a >= c ? [1, 0] : [0, 1];
    const n = Math.hypot(v[0], v[1]);
    v = [v[0] / n, v[1] / n];
    const w = [-v[1], v[0]];
    const p1 = l1 ** p;
    const p2 = l2 ** p;
    return [
      [p1 * v[0] * v[0] + p2 * w[0] * w[0], p1 * v[0] * v[1] + p2 * w[0] * w[1]],
      [p1 * v[1] * v[0] + p2 * w[1] * w[0], p1 * v[1] * v[1] + p2 * w[1] * w[1]],
    ];
  }

  // ------------------------------------------------------------------ 4 x 4 (column-major, as CSS matrix3d)
  const M4 = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) {
      const o = new Array(16).fill(0);
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++) {
          let v = 0;
          for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
          o[c * 4 + r] = v;
        }
      return o;
    },
    tr(x, y) {
      const m = M4.id();
      m[12] = x;
      m[13] = y;
      return m;
    },
    rotX(deg) {
      const a = (deg * Math.PI) / 180;
      const m = M4.id();
      m[5] = Math.cos(a);
      m[6] = Math.sin(a);
      m[9] = -Math.sin(a);
      m[10] = Math.cos(a);
      return m;
    },
    persp(d) {
      const m = M4.id();
      m[11] = -1 / d;
      return m;
    },
    apply(m, x, y) {
      const X = m[0] * x + m[4] * y + m[12];
      const Y = m[1] * x + m[5] * y + m[13];
      const W = m[3] * x + m[7] * y + m[15];
      return [X / W, Y / W];
    },
    css: (m) => `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`,
  };

  // ------------------------------------------------------------------ the film's clock
  const T = {
    dive: [5.0, 7.4], // the fall, from the end of the push-in to rest on the closest plate
    q: [7.5, 12.5, 17.5], // the three questions
    gap: 22.5,
    shape: 27.5,
    answer: 30.0,
    name: 32.5,
    soon: 35.0,
    end: 37.5,
  };

  function core(D) {
    const PQ = D.property; // 14 Wattle Grove on the closest plate
    const OQ = D.offices; // the three offices, 01 to 03
    const PIN0 = D.orbit.pin; // 14 Wattle Grove on the orbit's frame
    const S_ORB = D.orbit.mean; // the orbit's px a km about the pin (the mean of its two directions)
    const S0 = S_ORB * 1.05; // where the night's push-in leaves it
    const S1 = 18;
    // The hand-over (camera px a km): the widest plate comes up over the orbit from HAND[0] to HAND[1], when the
    // orbit goes; by then the orbit is turned fully onto it (orbitShape).
    const HAND = [2.0, 3.0];
    // The orbit's shape against the plates': G1 takes the orbit's kilometre about the pin onto the plates', at one
    // px a km. It turns by THETA and stretches by SYM; the fall turns and stretches it a share at a time.
    const JO = D.orbit.J;
    const JP = [
      [D.plateFrame.e[0], D.plateFrame.n[0]],
      [D.plateFrame.e[1], D.plateFrame.n[1]],
    ];
    const G1 = m2mul(JP, m2inv(JO)).map((row) => row.map((v) => v * S_ORB));
    const THETA = Math.atan2(G1[1][0] - G1[0][1], G1[0][0] + G1[1][1]);
    const SYM = m2mul(rot(-THETA), G1);
    SYM[0][1] = SYM[1][0] = (SYM[0][1] + SYM[1][0]) / 2;

    /** The night's slow push toward the pin: 1.00 to 1.05 over its five seconds, gathering. */
    const push = (t) => 1 + 0.05 * clamp01(t / T.dive[0]) ** 1.6;

    /** The camera at t: its scale s, where the pin is on the screen, and the closest plate's point at the centre. */
    function camera(t) {
      if (t < T.dive[1] + 1e-9) {
        let s;
        let pin;
        if (t <= T.dive[0]) {
          s = S_ORB * push(t);
          pin = PIN0;
        } else {
          const u = span(t, T.dive[0], T.dive[1], EASE.dive);
          s = S0 * (S1 / S0) ** u;
          pin = lerp2(PIN0, PQ, span(t, T.dive[0] + 0.1, T.dive[1], EASE.inout));
        }
        const z = s / 18;
        return { s, z, pin, cc: [PQ[0] - (pin[0] - C[0]) / z, PQ[1] - (pin[1] - C[1]) / z] };
      }
      // At rest on the closest plate: a slow drift in through the questions and the gap, then the draw-in.
      let z = lerp(1, 1.035, span(t, T.dive[1], T.gap, EASE.lin));
      z = lerp(z, 1.05, span(t, T.gap, T.shape - 0.3, EASE.lin));
      const draw = span(t, T.shape - 0.3, T.answer - 0.4, EASE.inout);
      z = z * (1.333 / 1.05) ** draw;
      z *= 1 + 0.012 * span(t, T.answer - 0.4, T.answer + 3, EASE.out);
      const cc = lerp2(C, [540, 1045], draw);
      return { s: 18 * z, z, cc, pin: [(PQ[0] - cc[0]) * z + C[0], (PQ[1] - cc[1]) * z + C[1]] };
    }
    /** A point of the closest plate on the screen (before the answer's tilt). */
    const onScreen = (cam, q) => [(q[0] - cam.cc[0]) * cam.z + C[0], (q[1] - cam.cc[1]) * cam.z + C[1]];

    /** The orbit's 2 x 2 at t (frame px about the pin): scaled with the camera, turned and sheared onto the plates. */
    function orbitShape(t, cam) {
      const k = cam.s / S_ORB;
      // the turn by time, so it reads as a roll and not a whip; done as the widest plate comes up over it
      const e = span(t, T.dive[0], T.dive[0] + 0.95, EASE.sine);
      const G = m2mul(rot(THETA * e), symPow(SYM, e));
      return G.map((row) => row.map((x) => x * k));
    }
    return { camera, onScreen, orbitShape, S0, S1, HAND, THETA };
  }

  if (typeof module !== "undefined" && typeof window === "undefined") {
    module.exports = { core, T, EASE, span, bezier };
    return;
  }

  // ================================================================== the page
  const D = root.DATA;
  const K = core(D);
  const PQ = D.property;
  const OQ = D.offices;
  const BULGE = [-0.16, 0.16, 0.1];
  const ART = D.art;
  const $ = (id) => document.getElementById(id);

  // Each element's last written style, so a frame writes only what changed.
  const last = new Map();
  function css(id, props) {
    const el = typeof id === "string" ? $(id) : id;
    if (!el) throw new Error(`The page has no #${id}`);
    let seen = last.get(el);
    if (!seen) last.set(el, (seen = {}));
    for (const [k, v] of Object.entries(props)) {
      const val = typeof v === "number" ? String(+v.toFixed(4)) : v;
      if (seen[k] === val) continue;
      seen[k] = val;
      if (k === "d" || k === "x1" || k === "y1" || k === "x2" || k === "y2" || k === "cx" || k === "cy" || k === "r" || k === "points")
        el.setAttribute(k, val);
      else el.style.setProperty(k, val);
    }
  }
  const px = (v) => `${+v.toFixed(2)}px`;
  const op = (v) => clamp01(v);
  let decoding = [];
  function src(id, url) {
    const el = $(id);
    if (el.getAttribute("src") === url) return;
    el.setAttribute("src", url);
    decoding.push(el.decode().catch(() => null));
  }

  // ------------------------------------------------------------------ the spoken words
  const LINES = Object.fromEntries(D.lines.map((l) => [l.take, l]));
  /** A block's words: each rises as it is heard (or at `at[i]` for one never spoken), its hairline drawn after. */
  function words(t, bid, { at = null, size = 80, ul = null } = {}) {
    const B = D.blocks[bid];
    const times = at || LINES[B.take].words.map((w) => w.start);
    if (times.length !== B.n) throw new Error(`${bid}: ${B.n} words on screen, ${times.length} spoken`);
    for (let i = 0; i < B.n; i++) {
      const p = span(t, times[i] - 0.07, times[i] + 0.36, EASE.settle);
      const lift = (1 - p) * size * 0.32;
      const blur = (1 - p) * 7;
      css(`${bid}-w${i}`, {
        opacity: op(p * 1.25),
        transform: `translateY(${px(lift)})`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
      });
    }
    const u = ul ?? times[times.length - 1] + 0.12;
    const el = $(`${bid}-ul`);
    if (el) css(el, { transform: `scaleX(${span(t, u, u + 0.5, EASE.move).toFixed(4)})` });
  }
  /** The block as a whole: its fade, a little rise out, and a blur as it goes. */
  function block(bid, alpha, out = 0) {
    css(bid, {
      opacity: op(alpha),
      transform: `translateY(${px(-out * 14)})`,
      filter: out > 0.01 ? `blur(${(out * 5).toFixed(2)}px)` : "none",
      visibility: alpha > 0.002 ? "visible" : "hidden",
    });
  }
  function eyebrow(id, t, a, b) {
    const p = span(t, a, a + 0.55, EASE.settle);
    const gone = span(t, b, b + 0.35, EASE.sine);
    css(id, {
      opacity: op(Math.min(p, 1 - gone)),
      "letter-spacing": `${(0.28 + 0.16 * (1 - p)).toFixed(4)}em`,
      visibility: p > 0 && gone < 1 ? "visible" : "hidden",
    });
  }

  // ------------------------------------------------------------------ pins
  /** A pin at (x, y): its strength (0 to 1), its halo's breath (a scale), and a ring going out at `pulse` s. */
  function pin(id, x, y, { alpha = 1, halo = 1, pulse = null, t = 0, ring = 1 } = {}) {
    const el = $(id);
    css(el, {
      transform: `translate(${px(x)}, ${px(y)})`,
      opacity: op(alpha),
      visibility: alpha > 0.002 ? "visible" : "hidden",
    });
    css(el.querySelector(".halo"), { transform: `scale(${halo.toFixed(4)})` });
    css(el.querySelector(".ring"), { opacity: op(ring) });
    const pz = el.querySelector(".pulse");
    if (pz) {
      const age = pulse === null ? -1 : t - pulse;
      const on = age >= 0 && age < 1.1;
      const p = on ? age / 1.1 : 0;
      css(pz, {
        opacity: on ? op((1 - p) ** 1.6) : 0,
        transform: `scale(${(0.4 + 2.6 * EASE.out(p)).toFixed(4)})`,
      });
    }
  }

  // ------------------------------------------------------------------ arcs
  /** The quadratic arc from p to q, bowed by `bulge` of its length (frames.py's arc). */
  function arcOf(p, q, bulge) {
    const [x0, y0] = p;
    const [x1, y1] = q;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    const c = [(x0 + x1) / 2 + (-dy / L) * bulge * L, (y0 + y1) / 2 + (dx / L) * bulge * L];
    const at = (u) => [
      (1 - u) ** 2 * x0 + 2 * (1 - u) * u * c[0] + u * u * x1,
      (1 - u) ** 2 * y0 + 2 * (1 - u) * u * c[1] + u * u * y1,
    ];
    // Its length, and the curve's parameter at each share of it (for an even speed along it).
    const n = 64;
    const cum = [0];
    let prev = at(0);
    for (let i = 1; i <= n; i++) {
      const pt = at(i / n);
      cum.push(cum[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]));
      prev = pt;
    }
    const len = cum[n];
    const atShare = (f) => {
      const target = clamp01(f) * len;
      let i = 1;
      while (i < n && cum[i] < target) i++;
      const u = (i - 1 + (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])) / n;
      return at(clamp01(u));
    };
    return { d: `M${x0.toFixed(2)} ${y0.toFixed(2)} Q${c[0].toFixed(2)} ${c[1].toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`, len, atShare };
  }

  // ------------------------------------------------------------------ the logo
  const EMB = { apex: ART.apex, bl: ART.bl, br: ART.br, orb: ART.orb };
  /** The logo laid at k CSS px an art px with its apex at (540, apexY): where an art point lands. */
  const logoAt = (k, apexY) => {
    const ox = 540 - EMB.apex[0] * k;
    const oy = apexY - EMB.apex[1] * k;
    return { k, ox, oy, pt: (a) => [ox + a[0] * k, oy + a[1] * k] };
  };
  const B1 = D.b1;

  // ------------------------------------------------------------------ the frame
  function draw(t) {
    const cam = K.camera(t);
    const Qs = T.q;
    const inDive = t < T.dive[1];

    // ---------------- the orbit and the plates
    // Each plate is placed by its scale alone; it comes up over the one below as the camera reaches its scale.
    // Where a plate does not yet reach an edge of the frame (the pin is off centre as the dive begins), that edge
    // is feathered by twice its distance inside, so it melts into what lies beneath and needs no feather once it
    // reaches the edge. A layer is drawn only while nothing opaque above it covers the frame, and after the dive
    // only the closest plate is.
    const logIn = (s, a, b) => EASE.sine(clamp01(Math.log(s / a) / Math.log(b / a)));
    const plates = [
      { id: "pwide", sp: D.plates.wide, alpha: logIn(cam.s, K.HAND[0], K.HAND[1]) },
      { id: "pmid", sp: D.plates.mid, alpha: logIn(cam.s, 5.0, 6.6) },
      { id: "pq", sp: D.plates.q, alpha: logIn(cam.s, 11, 15) },
    ];
    const plx = (C[0] - PQ[0]) * cam.z + (cam.pin[0] - C[0]);
    const ply = (C[1] - PQ[1]) * cam.z + (cam.pin[1] - C[1]);
    for (const L of plates) {
      L.k = cam.s / L.sp;
      L.o = {
        l: -(540 - 540 * L.k + plx),
        r: 540 + 540 * L.k + plx - 1080,
        t: -(960 - 960 * L.k + ply),
        b: 960 + 960 * L.k + ply - 1920,
      };
      L.covers = L.alpha >= 0.999 && Math.min(L.o.l, L.o.r, L.o.t, L.o.b) >= 0;
    }
    const coveredAbove = (i) => plates.slice(i + 1).some((L) => L.covers);
    const ge = span(t, T.answer, T.answer + 0.35, EASE.sine); // the ground tilting back
    plates.forEach((L, i) => {
      const live = inDive ? L.alpha > 0.001 && !coveredAbove(i) : L.id === "pq";
      if (!live) {
        css(L.id, { visibility: "hidden" });
        return;
      }
      const W = 1080 * L.k;
      const H = 1920 * L.k;
      const fl = (o, size) => (Math.min(160, Math.max(0, -2 * o)) / size) * 100; // a feather, in the plate's own %
      // as the ground tilts back in the answer its far edge and sides fade, so its border never shows
      const left = Math.max(fl(L.o.l, W), 24 * ge);
      const right = Math.max(fl(L.o.r, W), 24 * ge);
      const top = Math.max(fl(L.o.t, H), 38 * ge);
      const bottom = fl(L.o.b, H);
      const mask =
        left + right + top + bottom > 0.01
          ? `linear-gradient(90deg, transparent 0, #000 ${left.toFixed(3)}%, #000 ${(100 - right).toFixed(3)}%, transparent 100%), linear-gradient(180deg, transparent 0, #000 ${top.toFixed(3)}%, #000 ${(100 - bottom).toFixed(3)}%, transparent 100%)`
          : "none";
      css(L.id, {
        visibility: "visible",
        opacity: op(L.alpha),
        transform: `translate(${px(plx)}, ${px(ply)}) scale(${L.k.toFixed(6)})`,
        "-webkit-mask-image": mask,
        "mask-image": mask,
      });
    });
    if (t <= T.dive[1] && !coveredAbove(-1)) {
      const M = K.orbitShape(t, cam);
      const [padX, padY] = D.orbit.pad;
      const pinO = [D.orbit.pin[0] + padX, D.orbit.pin[1] + padY];
      const e = cam.pin[0] - (M[0][0] * pinO[0] + M[0][1] * pinO[1]);
      const f = cam.pin[1] - (M[1][0] * pinO[0] + M[1][1] * pinO[1]);
      css("orbit", {
        transform: `matrix(${M[0][0].toFixed(6)},${M[1][0].toFixed(6)},${M[0][1].toFixed(6)},${M[1][1].toFixed(6)},${e.toFixed(3)},${f.toFixed(3)})`,
        visibility: "visible",
      });
    } else css("orbit", { visibility: "hidden" });

    // ---------------- the city's light: dimmed in the questions, more in the gap, most under the logo
    let dim = 0.08 * span(t, T.dive[1], T.q[0] + 0.6, EASE.sine);
    dim = lerp(dim, 0.45, span(t, T.gap + 0.1, T.gap + 1.2, EASE.sine));
    dim = lerp(dim, 0.4, span(t, T.shape, T.shape + 0.8, EASE.sine));
    dim = lerp(dim, 0.5, span(t, T.answer - 0.6, T.answer, EASE.sine)); // the breath
    dim = lerp(dim, 0.25, span(t, T.answer, T.answer + 0.4, EASE.out)); // the hit lights it
    dim = lerp(dim, 0.62, span(t, T.name - 0.2, T.name + 0.6, EASE.sine));
    dim = lerp(dim, 1, span(t, T.soon, T.soon + 0.6, EASE.sine));
    css("dim", { opacity: op(dim) });

    // ---------------- the answer's tilt: the ground falls back toward a horizon
    const tilt = span(t, T.answer, T.answer + 1.25, EASE.settle);
    const TH = 63 * tilt;
    const PERSP = 820;
    const OY = 1480;
    const PY = 1010;
    let TM = M4.id();
    if (tilt > 0) {
      TM = M4.mul(
        M4.mul(M4.mul(M4.tr(540, PY), M4.persp(PERSP)), M4.tr(-540, -PY)),
        M4.mul(M4.mul(M4.tr(0, OY), M4.rotX(TH)), M4.tr(0, -OY)),
      );
      css("world", { transform: M4.css(TM) });
    } else css("world", { transform: "none" });
    css("horizon", { opacity: op(tilt * 1.1) });
    css("world", { opacity: op(1 - span(t, T.soon, T.soon + 0.6, EASE.sine)) });

    // ---------------- the haze the camera falls through
    for (const [id, at, peak, grow, width] of [
      ["hz0", 2.25, 0.8, 1.4, 0.5],
      ["hz1", 3.9, 0.5, 1.3, 0.4],
    ]) {
      const x = Math.log(cam.s / at);
      const a = inDive ? peak * Math.exp(-((x / width) ** 2)) : 0;
      if (a < 0.003) {
        css(id, { visibility: "hidden" });
        continue;
      }
      const sc = Math.exp(x * grow);
      css(id, {
        visibility: "visible",
        opacity: op(a),
        transform: `translate(${px(cam.pin[0] - 540)}, ${px(cam.pin[1] - 960)}) scale(${sc.toFixed(5)})`,
      });
    }

    // ---------------- the property
    const P = cam.pin;
    const onS = (q) => K.onScreen(cam, q);
    const O = OQ.map(onS);

    // The pin rises into the emblem's orb in the answer, then gives way to the logo's own.
    const L6 = logoAt(1.0, 430);
    const L7 = logoAt(0.78, 390);
    const rise = span(t, T.answer + 0.35, T.answer + 1.3, EASE.inout);
    const pinAt = lerp2(P, L6.pt(EMB.orb), rise);
    const pinGone = span(t, T.answer + 1.5, T.answer + 2.1, EASE.sine);
    let pinAlpha = 1;
    pinAlpha *= 1 - 0.45 * span(t, T.gap, T.gap + 0.8, EASE.sine) * (1 - span(t, T.shape, T.shape + 0.5, EASE.sine));
    pinAlpha *= 1 - pinGone;
    // the beam: up from the pin in the night and the dive, again as the triangle closes
    const beamH =
      lerp(200, 230, span(t, T.dive[0], T.dive[1], EASE.inout)) * (1 - span(t, T.q[0] - 0.2, T.q[0] + 0.5, EASE.sine)) +
      150 * env(t, T.shape + 1.4, T.shape + 1.9, T.answer, T.answer + 0.3);
    const pulseAt = t < 3 ? 0.4 : null;
    pin("pin", pinAt[0], pinAt[1], {
      alpha: pinAlpha,
      halo: 1 + 0.08 * Math.sin(t * 2.4) + 0.5 * env(t, 0.4, 0.55, 0.6, 1.4, EASE.sine) + 0.6 * env(t, T.answer + 0.3, T.answer + 0.8, T.answer + 1.2, T.answer + 1.8),
      t,
      pulse: pulseAt,
    });
    css("beam", {
      transform: `translate(${px(P[0])}, ${px(P[1] - beamH)})`,
      height: px(Math.max(0, beamH)),
      opacity: op(beamH > 1 ? 1 : 0),
    });
    // the beam's pulse on the first bell
    const bp = span(t, 0.4, 1.3, EASE.out);
    css("beampulse", {
      transform: `translate(${px(P[0])}, ${px(P[1] - 40 - bp * 200)})`,
      opacity: op(env(t, 0.4, 0.5, 0.95, 1.3, EASE.sine)),
    });
    // the trail the light leaves as it rises into the orb
    const trailOn = env(t, T.answer + 0.4, T.answer + 0.7, T.answer + 1.6, T.answer + 2.3);
    const trailEnd = [P[0], Math.max(P[1], pinAt[1] + 1)];
    css("trail", { x1: pinAt[0], y1: pinAt[1], x2: trailEnd[0], y2: trailEnd[1], opacity: op(trailOn * 0.9) });
    css("trailg", { x1: pinAt[0], y1: pinAt[1], x2: trailEnd[0], y2: trailEnd[1] });

    // The pin's labels: by the pin in the night, under it once the city is close, small through the questions.
    const lab0 = 1 - span(t, T.dive[0] - 0.6, T.dive[0] + 0.1, EASE.sine);
    css("lab0", {
      right: px(1080 - P[0] + 34),
      top: px(P[1] - 9),
      opacity: op(lab0),
      visibility: lab0 > 0.002 ? "visible" : "hidden",
    });
    const lab12 = env(t, T.dive[1] - 0.6, T.dive[1] - 0.05, T.q[0] + 0.35, T.q[0] + 0.85, EASE.settle);
    for (const [id, dy] of [
      ["lab1", -30],
      ["lab2", 2],
    ])
      css(id, {
        left: px(P[0] + 34),
        top: px(P[1] + dy),
        opacity: op(lab12),
        visibility: lab12 > 0.002 ? "visible" : "hidden",
      });
    const lab3 = env(t, T.q[0] + 0.6, T.q[0] + 1.0, T.gap, T.gap + 0.6, EASE.sine);
    css("lab3", {
      left: px(P[0] + 30),
      top: px(P[1] - 34),
      opacity: op(lab3 * 0.95),
      visibility: lab3 > 0.002 ? "visible" : "hidden",
    });

    // ---------------- the offices, the spokes and the sparks
    const arcs = O.map((o, i) => arcOf(P, o, BULGE[i]));
    let sparkShown = false;
    for (let i = 0; i < 3; i++) {
      const T0 = Qs[i];
      const land = T0 + 0.8; // the line arrives with the question's note (sound.py)
      // The spoke: drawn behind the spark, full while its question is asked, dimmed after, gone in the gap.
      const drawn = span(t, T0 + 0.05, land, EASE.inout);
      const current = t < (Qs[i + 1] ?? T.gap);
      const after = span(t, Qs[i + 1] ?? T.gap, (Qs[i + 1] ?? T.gap) + 0.5, EASE.sine);
      let w = lerp(3.0, 2.2, after);
      let a = lerp(1, 0.45, after);
      a *= 1 - span(t, T.gap, T.gap + 0.9, EASE.sine);
      // solid again as the shape forms, at the shape frame's strength
      const back = span(t, T.shape + 0.1, T.shape + 0.9, EASE.sine);
      w = lerp(w, 2.0, back);
      a = Math.max(a, 0.55 * back * (1 - span(t, T.answer, T.answer + 0.35, EASE.sine)));
      const A = arcs[i];
      if (drawn <= 0 || a < 0.003) css(`sp${i}`, { opacity: 0 });
      else
        css(`sp${i}`, {
          d: A.d,
          "stroke-width": w.toFixed(3),
          "stroke-dasharray": `${A.len.toFixed(2)} ${(A.len * 2).toFixed(2)}`,
          "stroke-dashoffset": (A.len * (1 - drawn)).toFixed(2),
          opacity: op(a),
        });
      // the dashes of the gap: each answered somewhere else
      const dash = env(t, T.gap + 0.2, T.gap + 1.0, T.shape + 0.1, T.shape + 0.7) * lerp(0.46, 0.26, span(t, T.gap + 1, T.shape, EASE.lin));
      css(`dp${i}`, {
        d: A.d,
        "stroke-dashoffset": (-(t - T.gap) * 9).toFixed(2),
        opacity: op(dash),
      });
      // the spark on its way, with a short bright tail
      if (t >= T0 + 0.02 && t <= land + 0.08) {
        const f = drawn;
        const head = A.atShare(f);
        const tail = Math.min(70, A.len * f);
        css("spark", { cx: head[0], cy: head[1], opacity: op(1 - span(t, land, land + 0.08, EASE.lin)) });
        css("trailseg", {
          d: A.d,
          "stroke-dasharray": `${tail.toFixed(2)} ${(A.len * 3).toFixed(2)}`,
          "stroke-dashoffset": (-(A.len * f - tail)).toFixed(2),
          opacity: op(0.95 * (1 - span(t, land, land + 0.08, EASE.lin))),
        });
        sparkShown = true;
      }
      // the office's light: lit as the line lands, dimmed when the next question begins, all three in the gap
      const lit = span(t, land - 0.04, land + 0.25, EASE.settle);
      let oa = lit * lerp(1, 0.55, after);
      oa = Math.max(oa, lit * span(t, T.gap, T.gap + 0.6, EASE.sine));
      oa *= 1 - span(t, T.answer + 1.0, T.answer + 1.6, EASE.sine);
      // in the gap each burns on its own; in the shape each flares as its edge leaves it
      const breath = 1 + 0.14 * Math.sin((t - T.gap) * (2 * Math.PI / [2.6, 3.1, 2.2][i]) + i * 2.1) * span(t, T.gap, T.gap + 1, EASE.sine) * (1 - span(t, T.shape, T.shape + 0.5, EASE.sine));
      const edgeAt = T.shape + 0.25 + 0.5 * i; // the riser's notes: D, F sharp, A
      const gapNote = [1.86, 4.28, null][i]; // the gap's two notes (sound.py: 24.36, 26.78), on 01 and 02
      const pulses = [land, gapNote === null ? null : T.gap + gapNote, edgeAt].filter((x) => x !== null && t >= x);
      const vtx = vertexAt(t, i, O);
      pin(`o${i}`, vtx[0], vtx[1], {
        alpha: oa,
        halo: breath * (1 + 0.5 * env(t, land, land + 0.12, land + 0.2, land + 0.9) + 0.45 * env(t, edgeAt, edgeAt + 0.1, edgeAt + 0.2, edgeAt + 0.8)),
        t,
        pulse: pulses.length ? pulses[pulses.length - 1] : null,
      });
      const na = oa * lerp(1, 0.6, after) * (1 - span(t, T.answer, T.answer + 0.4, EASE.sine));
      css(`n${i}`, {
        left: px(vtx[0] + (i !== 0 ? 22 : -52)),
        top: px(vtx[1] + 10),
        opacity: op(na),
        visibility: na > 0.002 ? "visible" : "hidden",
      });
    }
    if (!sparkShown) {
      css("spark", { opacity: 0 });
      css("trailseg", { opacity: 0 });
    }

    // ---------------- the windows over the offices
    for (let i = 0; i < 3; i++) {
      const T0 = Qs[i];
      const W = D.windows[i];
      const [x, y, w, h] = W.box;
      const dx = O[i][0] - OQ[i][0];
      const dy = (O[i][1] - OQ[i][1]) * 0.35;
      const open = span(t, T0 + 1.0, T0 + 1.55, EASE.settle);
      const close = span(t, T0 + 4.3, T0 + 4.68, EASE.move);
      const a = Math.min(open, 1 - close);
      const id = `win${i}`;
      if (a <= 0.001) {
        css(id, { visibility: "hidden" });
      } else {
        const sc = lerp(0.9, 1, open) * lerp(1, 0.86, close);
        css(id, {
          visibility: "visible",
          opacity: op(a),
          "transform-origin": `${px(O[i][0] - (x + dx))} 100%`,
          transform: `translate(${px(dx)}, ${px(dy + (1 - open) * 26 + close * 18)}) scale(${sc.toFixed(4)})`,
        });
      }
      // the tether: up from the office to the window's foot as it opens, back down as it folds
      const up = Math.min(span(t, T0 + 0.85, T0 + 1.15, EASE.inout), 1 - span(t, T0 + 4.36, T0 + 4.66, EASE.inout));
      if (i === tetherOf(t) && up > 0) {
        const foot = [O[i][0], y + h + dy];
        const from = [O[i][0], O[i][1] - 16];
        const to = lerp2(from, foot, up);
        css("tether", { x1: from[0], y1: from[1], x2: to[0], y2: to[1], opacity: 0.9 });
      }
    }
    if (tetherOf(t) < 0) css("tether", { opacity: 0 });
    // The window's own moment: the plan drawn in, a light across the Passport, the pointer arriving.
    const wipe = span(t, Qs[0] + 1.25, Qs[0] + 2.45, EASE.inout) * 118 - 9;
    const planMask = `linear-gradient(100deg, #000 ${(wipe - 9).toFixed(2)}%, transparent ${wipe.toFixed(2)}%)`;
    css("plan", { "-webkit-mask-image": planMask, "mask-image": planMask });
    css("ppsweep", { transform: `translateX(${px(lerp(-220, 520, span(t, Qs[1] + 1.55, Qs[1] + 2.6, EASE.inout)))})` });
    const arrive = span(t, Qs[2] + 1.35, Qs[2] + 2.15, EASE.settle);
    const [ptx, pty] = D.pointer;
    css("pointer", {
      transform: `translate(${px(ptx + (1 - arrive) * 150)}, ${px(pty + (1 - arrive) * 95)})`,
      opacity: op(span(t, Qs[2] + 1.3, Qs[2] + 1.6, EASE.sine)),
    });

    // ---------------- the shape: the three lights reach for each other
    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    const V = [0, 1, 2].map((i) => vertexAt(t, i, O));
    for (let e = 0; e < 3; e++) {
      const [i, j] = edges[e];
      const a0 = T.shape + 0.25 + 0.5 * e;
      const g = span(t, a0, a0 + 0.62, EASE.inout);
      const fade = 1 - span(t, T.answer + 1.3, T.answer + 2.0, EASE.sine);
      const w = lerp(4.2, 3.2, span(t, T.answer + 0.3, T.answer + 1.3, EASE.inout));
      if (g <= 0 || fade <= 0) {
        css(`e${e}`, { opacity: 0 });
        continue;
      }
      const end = lerp2(V[i], V[j], g);
      const charge = 1 + 0.25 * span(t, T.answer - 0.6, T.answer, EASE.in) * (1 - span(t, T.answer, T.answer + 0.5, EASE.out));
      css(`e${e}`, {
        x1: V[i][0],
        y1: V[i][1],
        x2: end[0],
        y2: end[1],
        "stroke-width": (w * charge).toFixed(3),
        opacity: op(fade),
      });
    }
    const fillA = 0.0 + span(t, T.shape + 1.75, T.shape + 2.15, EASE.sine) * (1 - span(t, T.answer + 0.2, T.answer + 0.7, EASE.sine));
    const cen = [(V[0][0] + V[1][0] + V[2][0]) / 3, (V[0][1] + V[1][1] + V[2][1]) / 3];
    css("fill", { points: V.map((v) => `${v[0].toFixed(2)},${v[1].toFixed(2)}`).join(" "), opacity: op(fillA) });
    css("tfill", { cx: cen[0], cy: cen[1] });

    // ---------------- the flash on the hit
    const fl = t >= T.answer ? Math.exp(-(t - T.answer) / 0.16) * span(t, T.answer, T.answer + 0.03, EASE.lin) : 0;
    css("flash", { opacity: op(fl * 0.9), "background-position": `${px(cen[0] - 540)} ${px(cen[1] - 1000)}` });

    // ---------------- the logo
    const logoIn = span(t, T.answer + 0.75, T.answer + 1.75, EASE.sine);
    const toName = span(t, T.name - 0.3, T.name + 0.2, EASE.inout);
    const L = logoAt(lerp(1.0, 0.78, toName), lerp(430, 390, toName));
    let la = logoIn;
    la = lerp(la, 0.12, span(t, T.soon, T.soon + 0.7, EASE.sine));
    if (la > 0.002) {
      const blur = 2 * span(t, T.soon, T.soon + 0.7, EASE.sine);
      css("logo", {
        visibility: "visible",
        opacity: op(la),
        transform: `translate(${px(L.ox)}, ${px(L.oy)}) scale(${L.k.toFixed(5)})`,
        filter: blur > 0.02 ? `blur(${(blur / L.k).toFixed(2)}px)` : "none",
      });
      const n = Math.max(0, Math.floor((t - (T.answer + 0.75)) * 30 + 1e-6));
      src("b1", B1[n % B1.length]);
      // the letters rise, AURIXA then SYSTEMS, on the name: each glyph alone out of a blur, then the supplied
      // letter with the art around it, pixel for pixel, as it lands
      const gone = span(t, T.soon, T.soon + 0.5, EASE.sine);
      D.letters.forEach((_, i) => {
        const a0 = i < 6 ? T.name + 0.02 + 0.045 * i : T.name + 0.24 + 0.035 * (i - 6);
        const p = span(t, a0, a0 + 0.48, EASE.settle);
        const land = EASE.sine(clamp01((p - 0.9) / 0.1));
        const b = (1 - p) * 8;
        css(`K${i}`, {
          transform: `translateY(${px((1 - p) * 16)})`,
          filter: b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none",
          opacity: op(Math.min(1, p * 1.6) * (1 - land) * (1 - gone)),
        });
        css(`L${i}`, { opacity: op(land * (1 - gone)) });
      });
      // a light across each line of the lettering once its letters have landed (the glints, 32.62 and 32.86 in
      // sound.py, are the first letters arriving)
      for (const [id, mid] of [
        ["sweep0", 33.45],
        ["sweep1", 33.6],
      ]) {
        const p = span(t, mid - 0.32, mid + 0.32, EASE.lin);
        css(id, {
          "background-position": `${(-70 + p * 240).toFixed(2)}% 0`,
          opacity: p > 0 && p < 1 ? 1 : 0,
        });
      }
    } else css("logo", { visibility: "hidden" });

    // ---------------- the bands behind the words
    const bandA =
      env(t, Qs[0] + 0.5, Qs[0] + 1.0, T.answer - 0.5, T.answer, EASE.sine);
    css("band", { opacity: op(bandA) });
    css("topshade", { opacity: op(env(t, Qs[0] + 0.8, Qs[0] + 1.4, T.gap - 0.4, T.gap + 0.4, EASE.sine)) });
    css("nameband", { opacity: op(env(t, T.name + 0.6, T.name + 1.2, T.soon, T.soon + 0.5, EASE.sine)) });

    // ---------------- the words
    // the opening line: on screen from the first frame, its phrase underlined as it is said
    words(t, "t0", { at: LINES.l1.words.map(() => -1), ul: LINES.l1.words[4].start });
    const glow = env(t, 2.35, 2.6, 3.4, 4.0);
    css("t0-em", { filter: glow > 0.01 ? `drop-shadow(0 0 ${(14 * glow).toFixed(2)}px rgba(245,209,122,${(0.55 * glow).toFixed(3)}))` : "none" });
    const t0out = span(t, 4.2, 4.85, EASE.sine);
    block("t0", 1 - t0out, t0out);
    // the questions
    ["q1", "q2", "q3"].forEach((bid, i) => {
      const T0 = Qs[i];
      words(t, bid);
      const out = span(t, T0 + 4.45, T0 + 4.85, EASE.sine);
      block(bid, t > T0 ? 1 - out : 0, out);
      eyebrow(`eb${i}`, t, T0 + 0.55, T0 + 4.42);
    });
    // the gap, the shape
    words(t, "gap");
    const gapOut = span(t, T.shape - 0.76, T.shape - 0.53, EASE.sine); // gone before "We've" (27.03) rises
    block("gap", t > T.gap ? 1 - gapOut : 0, gapOut);
    words(t, "shape", { ul: 29.0 });
    const shapeOut = span(t, T.answer - 0.55, T.answer - 0.12, EASE.sine);
    block("shape", t > T.shape - 0.6 ? 1 - shapeOut : 0, shapeOut);
    // the line under the name, never spoken
    const nameAt = [33.6, 33.68, 33.76, 33.84, 33.98, 34.08, 34.18];
    words(t, "name", { at: nameAt, size: 54, ul: 34.36 });
    const nameOut = span(t, T.soon, T.soon + 0.45, EASE.sine);
    block("name", t > 33.4 ? 1 - nameOut : 0, nameOut);
    // soon
    words(t, "soon", { size: 150, ul: 36.0 });
    block("soon", t > 35.3 ? 1 : 0, 0);
    css("url", { opacity: op(span(t, 36.1, 36.65, EASE.sine)) });

    // the orb's light, alone at the end
    const o8 = L7.pt(EMB.orb);
    const orbA = span(t, T.soon + 0.1, T.soon + 0.7, EASE.sine);
    const bell = env(t, 36.25, 36.33, 36.4, 37.1, EASE.sine);
    css("orb", {
      transform: `translate(${px(o8[0] - 170)}, ${px(o8[1] - 170)}) scale(${(1 + 0.12 * bell + 0.03 * Math.sin(t * 2)).toFixed(4)})`,
      opacity: op(orbA * (0.92 + 0.08 * bell)),
    });
    css("orbcore", { transform: `translate(${px(o8[0] - 9)}, ${px(o8[1] - 9)})`, opacity: op(orbA) });
  }

  /** Which window's tether is up at t (-1 for none). */
  function tetherOf(t) {
    for (let i = 0; i < 3; i++) if (t >= T.q[i] + 0.85 && t < T.q[i] + 4.7) return i;
    return -1;
  }
  /** Where office i's light is: on the city, until the answer lifts it, upright, to the emblem's corner while the
   * ground falls away beneath it. */
  function vertexAt(t, i, O) {
    const L6 = logoAt(1.0, 430);
    const target = [L6.pt(ART.bl), L6.pt(ART.br), L6.pt(ART.apex)][i];
    const up = span(t, T.answer + 0.2, T.answer + 1.35, EASE.inout);
    return lerp2(O[i], target, up);
  }

  root.setT = async (t) => {
    decoding = [];
    draw(t);
    await Promise.all(decoding);
  };
  root.FILM = { T, core: K };
})(typeof window !== "undefined" ? window : globalThis);
