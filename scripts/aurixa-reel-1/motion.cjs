// The motion toolkit Reel 1's scenes are written in (./scenes/*.cjs): the brief's beats, the brand's own curves and
// durations (aurixa-reel.css), a frame's state, G-WINDOW moving, G-POINTER, G-FOCUS, the captions and the rail.
// ./render.cjs draws the scenes and encodes them; nothing here draws or encodes.
const fs = require("fs");
const path = require("path");
const F = require("./frames.cjs");
const { KIT } = require("./plates.cjs");
const CAP = require("./captions.cjs");

const FPS = 30;
const BRIEF = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../docs/brands/aurixa-reel-1/system-edition/brief.json"),
    "utf8",
  ),
);
const frameOf = (t) => Math.round(t * FPS);
const shotOf = (id) => {
  const shot = BRIEF.shots.find((s) => s.id === id);
  if (!shot) throw new Error(`The brief has no shot ${id}`);
  return shot;
};
/** A beat's time: shot `id`'s beat `i`, as the brief times it. */
const beat = (id, i) => {
  const b = shotOf(id).beats[i];
  if (!b) throw new Error(`Shot ${id} has no beat ${i}`);
  return b.at;
};

// ------------------------------------------------------------------ the brand's motion, from its code
const REEL_CSS = fs.readFileSync(
  path.join(__dirname, "../../docs/brands/aurixa-reel-1/system-edition/aurixa-reel.css"),
  "utf8",
);
const token = (name) => {
  const m = new RegExp(`--reel-${name}:\\s*([^;]+);`).exec(REEL_CSS);
  if (!m) throw new Error(`aurixa-reel.css has no --reel-${name}`);
  return m[1].trim();
};
/** A CSS cubic-bezier as a function of time (0 to 1), solved as the browser solves it. */
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
const curve = (name) => {
  const m = /cubic-bezier\(([^)]+)\)/.exec(token(name));
  if (!m) throw new Error(`--reel-${name} is not a cubic-bezier`);
  return bezier(...m[1].split(",").map(Number));
};
/** ease-move: the products' emphasized ease (anything that travels); ease-settle: their ease-out (arrivals). */
const EASE = { move: curve("ease-move"), settle: curve("ease-settle"), linear: (t) => t };
/** motion-press: the products' slow step, the press ring's whole life. */
const PRESS = parseFloat(token("motion-press")) / 1000;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** How far through [a, b] the time t is, on a curve. */
const span = (t, a, b, ease = EASE.move) => {
  if (!(b > a)) throw new Error(`An empty or reversed span: ${a} to ${b}`);
  return ease(clamp01((t - a) / (b - a)));
};
const lerp = (a, b, p) => a + (b - a) * p;
const lerp2 = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p)];
/** Zoom moves evenly to the eye when it moves by ratio, not by difference. */
const zoomLerp = (a, b, p) => a * (b / a) ** p;
const r3 = (v) => Math.round(v * 1000) / 1000;
const px = (v) => `${r3(v)}px`;

// ------------------------------------------------------------------ the frame's state
/**
 * What a frame sets: for each element (a selector, and an index where it matches several) its style
 * properties, and `$text` for its text. Every frame of a scene sets every property the scene animates,
 * so a frame never depends on the one before; a worker sends only what changed since its last frame.
 */
class State {
  constructor() {
    this.items = new Map();
  }
  set(selector, props, index = null) {
    const key = index === null ? selector : `${selector}\u0000${index}`;
    const item = this.items.get(key) ?? { selector, index, props: {} };
    for (const [k, v] of Object.entries(props))
      item.props[k] = typeof v === "number" ? String(r3(v)) : v;
    this.items.set(key, item);
    return this;
  }
  /** The updates since `last` (key → props as last sent), which it brings up to date. */
  diff(last) {
    const out = [];
    for (const [key, { selector, index, props }] of this.items) {
      const before = last.get(key) ?? {};
      const changed = {};
      let any = false;
      for (const [k, v] of Object.entries(props))
        if (before[k] !== v) {
          changed[k] = v;
          any = true;
        }
      if (any) {
        out.push([selector, index, changed]);
        last.set(key, { ...before, ...changed });
      }
    }
    return out;
  }
}

/** Shown or not, faded: opacity, and visibility so a hidden element costs nothing to draw. */
const fade = (o) => {
  if (!Number.isFinite(o)) throw new Error(`An opacity that isn't a number: ${o}`);
  return { opacity: r3(clamp01(o)), visibility: o > 0.001 ? "visible" : "hidden" };
};

// ------------------------------------------------------------------ G-WINDOW, moving
/**
 * A G-WINDOW holding several plates (states of one page), stacked to cross-fade between, each in its own
 * layer `${id}-${n}`. Its veil (`${id}-veil`) dims the page.
 */
function windowHtml(id, keys, z) {
  const layers = keys
    .map((key, n) => {
      const p = F.plate(key);
      return `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px">${p.html}</div>`;
    })
    .join("");
  return `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page">${layers}<div class="fk-veil" id="${id}-veil"></div></div></div>`;
}
const PAD = 12 + KIT.K;
/** A window whose page shows the whole plate at `zoom`, centred on the frame point `centre`. */
const whole = (css, zoom, centre) => ({
  rect: [
    centre[0] - (css[0] * zoom) / 2 - PAD,
    centre[1] - (css[1] * zoom) / 2 - PAD,
    css[0] * zoom + 2 * PAD,
    css[1] * zoom + 2 * PAD,
  ],
  zoom,
  focus: [css[0] / 2, css[1] / 2],
  at: centre,
});
/**
 * Between two framings of one window (`shot`'s terms: rect, zoom, focus, at), at p: the rect and the
 * point it brings into view move evenly, the zoom by ratio, and the page never shows past the plate's
 * edge (it is kept within the plate at that zoom, about its centre).
 */
function between(css, a, b, p) {
  const zoom = zoomLerp(a.zoom, b.zoom, p);
  const r = a.rect.map((v, i) => lerp(v, b.rect[i], p));
  const cx = r[0] + r[2] / 2;
  const cy = r[1] + r[3] / 2;
  const pw = Math.min(r[2] - 2 * PAD, css[0] * zoom);
  const ph = Math.min(r[3] - 2 * PAD, css[1] * zoom);
  return {
    rect: [cx - pw / 2 - PAD, cy - ph / 2 - PAD, pw + 2 * PAD, ph + 2 * PAD],
    zoom,
    focus: lerp2(a.focus, b.focus, p),
    at: lerp2(a.at, b.at, p),
  };
}
/** Sets a window to a framing, its layers to their opacities and its veil; returns where its plate lands. */
function placeWindow(
  st,
  id,
  css,
  framing,
  layers,
  { opacity = 1, veil = 0, transform = "none" } = {},
) {
  const { rect, zoom, focus, at } = framing;
  const g = KIT.shotGeometry({ css, zoom, focus, at, rect });
  st.set(`#${id}`, { left: px(rect[0]), top: px(rect[1]), transform, ...fade(opacity) });
  st.set(`#${id}-page`, { width: px(g.pw), height: px(g.ph) });
  layers.forEach((o, n) =>
    st.set(`#${id}-${n}`, {
      transform: `translate(${px(g.ox)}, ${px(g.oy)}) scale(${zoom.toFixed(6)})`,
      ...fade(o),
    }),
  );
  st.set(`#${id}-veil`, fade(veil));
  return { ...g, zoom, rect };
}
/** A plate rect [x, y, w, h] through a window's map, as a frame rect. */
const throughRect = (g, [x, y, w, h]) => {
  const [fx, fy] = g.map([x, y]);
  return [fx, fy, w * g.zoom, h * g.zoom];
};

// ------------------------------------------------------------------ G-POINTER, G-FOCUS, the caption
const POINTER_TIP = [3 * (46 / 24), 2 * (46 / 24)];
const pointerHtml = () =>
  `<div class="fk-press" id="ring" style="visibility:hidden"></div><svg class="fk-pointer" id="ptr" style="left:0;top:0;visibility:hidden" viewBox="0 0 24 24">${KIT.ARROW}</svg>`;
/**
 * The pointer's state: its tip on a gentle curve from `from` to `to` over [a, b] on ease-move (the
 * curve's bow is a fraction of the distance, to the right of travel), shown from `show`, hidden at
 * `hide`; a press at `press` (a time) dips it and draws the focus-cyan ring, which grows to 24 px (at
 * the kit's K) and fades over motion-press.
 */
function pointer(st, t, { from, to, a, b, bow = 0.12, show, hide = Infinity, press = null }) {
  const p = span(t, a, b, EASE.move);
  const mid = lerp2(from, to, 0.5);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const ctrl = [mid[0] - dy * bow, mid[1] + dx * bow];
  const q = (u) => [
    (1 - u) ** 2 * from[0] + 2 * (1 - u) * u * ctrl[0] + u * u * to[0],
    (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * ctrl[1] + u * u * to[1],
  ];
  const [x, y] = q(p);
  const gone = Number.isFinite(hide) ? span(t, hide, hide + 0.2) : 0;
  const opacity = Math.min(span(t, show, show + 0.14, EASE.linear), 1 - gone);
  const since = press === null ? -1 : t - press;
  const dip = since >= 0 && since < 0.2 ? 1 - 0.1 * Math.sin((Math.PI * since) / 0.2) : 1;
  st.set("#ptr", {
    transform: `translate(${px(x - POINTER_TIP[0])}, ${px(y - POINTER_TIP[1])}) scale(${r3(dip)})`,
    "transform-origin": `${POINTER_TIP[0]}px ${POINTER_TIP[1]}px`,
    ...fade(opacity),
  });
  if (since >= 0 && since < PRESS) {
    const u = since / PRESS;
    const d = 24 * KIT.K * EASE.settle(u);
    st.set("#ring", {
      transform: `translate(${px(x - d / 2)}, ${px(y - d / 2)})`,
      width: px(d),
      height: px(d),
      ...fade((1 - u) * opacity),
    });
  } else st.set("#ring", { transform: "none", width: "0px", height: "0px", ...fade(0) });
  return [x, y];
}
/** G-FOCUS closing in on a frame rect from `from` px further out, over [a, b] on ease-settle. */
function corners(st, t, rect, a, b, { inset = 10, from = 34 } = {}) {
  const p = span(t, a, b, EASE.settle);
  const i = lerp(from, inset, p);
  const [x, y, w, h] = rect;
  st.set("#focus", {
    left: px(x - i),
    top: px(y - i),
    width: px(w + 2 * i),
    height: px(h + 2 * i),
    ...fade(span(t, a, a + 0.16, EASE.linear)),
  });
}
const focusHtml = () => `<div class="fk-focus" id="focus" style="visibility:hidden"></div>`;
const captionHtml = () => CAP.html();
/** The captions at t (./captions.cjs): the brand's type, each word on its spoken time. */
const caption = (st, t, m) => CAP.state(st, t, m.captions, { span, fade, EASE, px, r3 });
/** A journey rail at a stage, in its own layer to slide and cross-fade. */
const railHtml = (id, stage) =>
  `<div id="${id}" style="position:absolute;inset:0;z-index:30;visibility:hidden">${KIT.rail(stage)}</div>`;

// The renderer's own rules: the plates' baked pointers give way to the moving one, and nothing in a
// plate moves except what a frame moves.
const RENDER_CSS = `
.fk-scale .cur { display:none !important; }
*, *::before, *::after { transition:none !important; animation:none !important; caret-color:transparent; }
.fk-press, .fk-pointer { left:0; top:0; }
`;

module.exports = {
  BRIEF,
  FPS,
  frameOf,
  shotOf,
  beat,
  REEL_CSS,
  token,
  bezier,
  curve,
  EASE,
  PRESS,
  clamp01,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  PAD,
  whole,
  between,
  placeWindow,
  throughRect,
  POINTER_TIP,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  railHtml,
  RENDER_CSS,
  F,
  KIT,
  CAP,
};
