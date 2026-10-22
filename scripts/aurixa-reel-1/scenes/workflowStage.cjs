// Reel 1, the third cut's stage in depth (G-STAGE), for the workflow shots (06.1 to 09.2 and 13.1): a page's glass
// window floats in front of the brand's night, turned a few degrees and drifting slowly, never far enough to soften
// its text; the dot field behind it moves against its drift, its light pools beneath it, and the light on its
// glass moves as it turns. A point on the page (where the pointer goes, what a press lands on) is carried through the same
// projection the browser draws the window with, so the pointer stays on what it touches.
//
// The drift is a function of the film's own clock, so a run of shots in one window (06.1 to 08.1) floats on
// across its cuts: a cut changes the page, never the window's pose.
const M = require("../motion.cjs");
const { r3, px, fade, lerp } = M;

// ------------------------------------------------------------------ 3D, as CSS composes it
// A 4 x 4 matrix as rows, acting on column vectors [x, y, z, 1]: a transform list A B C is the matrix A·B·C.
const I4 = () => [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
const mul = (a, b) =>
  a.map((row) => [0, 1, 2, 3].map((j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const rad = (deg) => (deg * Math.PI) / 180;
const perspectiveM = (d) => {
  const m = I4();
  m[3][2] = -1 / d;
  return m;
};
const translateM = (x, y, z) => {
  const m = I4();
  m[0][3] = x;
  m[1][3] = y;
  m[2][3] = z;
  return m;
};
const rotateXM = (deg) => {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ];
};
const rotateYM = (deg) => {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ];
};
const rotateZM = (deg) => {
  const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
};
const scaleM = (k) => [
  [k, 0, 0, 0],
  [0, k, 0, 0],
  [0, 0, k, 0],
  [0, 0, 0, 1],
];

/** The camera's distance from the frame, for every pose: the site's grid-forward perspective, 1000 px at its scale. */
const PERSPECTIVE = 2000;

/**
 * A pose (degrees, px, a scale) as a CSS transform about an element's centre, and the projection that goes with
 * it: `map([x, y])` takes a frame point on the element, as it would lie unturned, to where the browser draws it.
 */
function pose(
  rect,
  { rx = 0, ry = 0, rz = 0, s = 1, tx = 0, ty = 0, tz = 0, d = PERSPECTIVE } = {},
) {
  const [vx, vy, vw, vh] = rect;
  const c = [vx + vw / 2, vy + vh / 2];
  const m = [
    perspectiveM(d),
    translateM(tx, ty, tz),
    rotateXM(rx),
    rotateYM(ry),
    rotateZM(rz),
    scaleM(s),
  ].reduce(mul);
  const css = `perspective(${d}px) translate3d(${px(tx)}, ${px(ty)}, ${px(tz)}) rotateX(${r3(rx)}deg) rotateY(${r3(ry)}deg) rotateZ(${r3(rz)}deg) scale(${s.toFixed(5)})`;
  const map = ([x, y]) => {
    const p = [x - c[0], y - c[1], 0, 1];
    const q = m.map((row) => row.reduce((acc, v, k) => acc + v * p[k], 0));
    return [c[0] + q[0] / q[3], c[1] + q[1] / q[3]];
  };
  return { css, map, centre: c };
}

// ------------------------------------------------------------------ the drift
/**
 * The window's float at film time t: a slow turn about both axes (periods of 13 and 17 s, so it never repeats
 * within a shot) and a lift, a few degrees at most. Every shot floats on the same clock at the same amplitude,
 * so the float carries on across a cut.
 */
function drift(t, { amp = 1 } = {}) {
  const k = amp;
  return {
    ry: k * 3.4 * Math.sin((2 * Math.PI * (t - 50)) / 13),
    rx: k * (1.4 + 1.1 * Math.sin((2 * Math.PI * (t - 50)) / 17 + 0.9)),
    tz: k * 18 * Math.sin((2 * Math.PI * (t - 50)) / 11 + 2.1),
  };
}
/** Two poses mixed: p of the way from a to b. */
const mix = (a, b, p) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const k of keys) out[k] = lerp(a[k] ?? (k === "s" ? 1 : 0), b[k] ?? (k === "s" ? 1 : 0), p);
  return out;
};

// ------------------------------------------------------------------ the ground, the light and the shadow
const STAGE_CSS = `
.ws-pool { position:absolute; border-radius:50%; pointer-events:none; mix-blend-mode:screen; }
.ws-shadow { position:absolute; border-radius:50%; pointer-events:none; }
.ws-glint { position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:2; mix-blend-mode:screen; }
`;
/**
 * The ground: the site's dot field and glow as every Aurixa frame has them, the field drawn two pitches larger
 * than the frame on every side (so its dots keep their phase) to move against the window's drift: the parallax
 * that puts the window in front of the night rather than on it.
 */
const PITCH = 44; // the dot field's pitch on the frame (22 px at K = 2)
const groundHtml = (id = "ground") =>
  `<div id="${id}" class="fk-layer" style="z-index:0"><div class="fk-field" id="${id}-field" style="left:${-2 * PITCH}px;top:${-2 * PITCH}px;width:${(1080 + 4 * PITCH) / 2}px;height:${(1920 + 4 * PITCH) / 2}px"></div><div class="fk-glow"></div></div>`;
function groundState(st, p, id = "ground") {
  const dx = -(p.ry ?? 0) * 5;
  const dy = (p.rx ?? 0) * 4 - (p.tz ?? 0) * 0.12;
  st.set(`#${id}-field`, { transform: `translate(${px(dx)}, ${px(dy)}) scale(2)` });
}
/** A pool of the window's light beneath it, and its shadow: both follow the window and its turn. */
const poolHtml = (id = "pool") =>
  `<div class="ws-shadow" id="${id}-shadow" style="visibility:hidden"></div><div class="ws-pool" id="${id}" style="visibility:hidden"></div>`;
function poolState(st, rect, p, id = "pool", { strength = 1, tint = "94,221,232" } = {}) {
  const [vx, vy, vw, vh] = rect;
  const cx = vx + vw / 2 + (p.ry ?? 0) * 6;
  const top = vy + vh - 26 - (p.rx ?? 0) * 4;
  const w = vw * 0.92;
  st.set(`#${id}`, {
    left: px(cx - w / 2),
    top: px(top),
    width: px(w),
    height: px(150),
    background: `radial-gradient(50% 50% at 50% 40%, rgba(${tint},${r3(0.16 * strength)}), transparent 70%)`,
    ...fade(strength > 0 ? 1 : 0),
  });
  st.set(`#${id}-shadow`, {
    left: px(cx - w * 0.48),
    top: px(top + 10),
    width: px(w * 0.96),
    height: px(110),
    background: `radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,${r3(0.55 * strength)}), transparent 72%)`,
    ...fade(strength > 0 ? 1 : 0),
  });
}
/** The light on the window's glass, moving across it as it turns: a soft diagonal band, brightest facing the light. */
const glintHtml = (id = "W") => `<div class="ws-glint" id="${id}-glint"></div>`;
function glintState(st, p, id = "W", { strength = 1 } = {}) {
  const at = 50 + (p.ry ?? 0) * 9 - (p.rx ?? 0) * 4;
  const a = r3(0.032 * strength + 0.014 * strength * Math.abs(p.ry ?? 0));
  st.set(`#${id}-glint`, {
    background: `linear-gradient(115deg, transparent ${r3(at - 22)}%, rgba(255,255,255,${a}) ${r3(at)}%, transparent ${r3(at + 22)}%)`,
  });
}

// ------------------------------------------------------------------ the stage, whole
/** The stage's own layers: its stylesheet, the ground and the pool (a scene adds its window, with stageWindow). */
const stageHtml = () => `<style>${STAGE_CSS}</style>${groundHtml("ground")}${poolHtml("pool")}`;
/**
 * G-WINDOW (motion.cjs's windowHtml) with the light on its glass. Its layers are plate keys, or plates given
 * whole ({ html, css }) where a scene edits a plate's markup.
 */
const stageWindow = (id, plates, z) =>
  `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page">${plates
    .map((key, n) => {
      const p = typeof key === "string" ? M.F.plate(key) : key;
      return `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px">${p.html}</div>`;
    })
    .join("")}<div class="fk-veil" id="${id}-veil"></div></div>${glintHtml(id)}</div>`;
/**
 * The stage at a pose for the window `id` whose rect is `rect`: the ground against its drift, its pool and shadow
 * (at `pool`, 0 to 1), the light on its glass; returns the window's projection.
 */
function stageState(st, rect, p, { id = "W", pool = 1 } = {}) {
  groundState(st, p, "ground");
  poolState(st, rect, p, "pool", { strength: pool });
  glintState(st, p, id);
  return pose(rect, p);
}

module.exports = {
  PERSPECTIVE,
  pose,
  drift,
  mix,
  STAGE_CSS,
  stageHtml,
  stageWindow,
  stageState,
  groundHtml,
  groundState,
  poolHtml,
  poolState,
  glintHtml,
  glintState,
  matrices: { mul, perspectiveM, translateM, rotateXM, rotateYM, rotateZM, scaleM },
};
