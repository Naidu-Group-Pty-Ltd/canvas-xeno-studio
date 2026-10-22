// Renders Reel 1 (system edition, BRIEF.md) as motion: each shot's plates and graphics, animated on the
// brief's beats (brief.json), drawn in Chromium at twice the frame's size and scaled down, then encoded as
// the delivery master (H.264 High, 4:2:0, BT.709, 30 fps) with the voiceover. It draws from the same
// plates, kit, camera and stylesheet as the style frames (frames.cjs, kit.cjs), so a frame of the film
// and its style frame can't drift, and it moves only on the brand's own curves and durations, read from
// aurixa-reel.css (ease-move, ease-settle, motion-press).
// Run: node scripts/aurixa-reel-1/render.cjs <outDir> <assetsDir> <voiceover.wav> [firstShot lastShot]
//   e.g. node render.cjs out assets vo.wav 04.1 05.2
// It writes film.mp4 (the master), reference.mkv (the same frames, lossless RGB, for measuring the
// master against) and film.json (every frame: its shot, scene and caption).
// Motion is blurred as a camera's 180-degree shutter blurs it: each frame is the average of SUBFRAMES
// drawings spread over the half of its 1/30 s the shutter is open, so a fast pointer smears rather than
// jumps, and a still frame (all its drawings identical) stays exactly as sharp.
// RENDER_WORKERS (default 3) browsers draw frames side by side; RENDER_SUBFRAMES (default 8);
// RENDER_FRAMES=900,1100 draws just those frames to PNG, to look at.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const F = require("./frames.cjs");
const { KIT } = require("./plates.cjs");

const OUT = path.resolve(process.argv[2] || "reel-1-film");
const VOICEOVER = process.argv[4] ? path.resolve(process.argv[4]) : null;
const FIRST = process.argv[5] || "04.1";
const LAST = process.argv[6] || FIRST;
const FPS = 30;
const SUPERSAMPLE = 2;
const WIDTH = KIT.FRAME.width;
const HEIGHT = KIT.FRAME.height;
const WORKERS = Number(process.env.RENDER_WORKERS || 3);
const SUBFRAMES = Number(process.env.RENDER_SUBFRAMES || 8);
const SHUTTER = 0.5; // 180 degrees: open for half of each frame
/** The times a frame is drawn at: SUBFRAMES of them, evenly over the open shutter, centred on the frame. */
const subframeTimes = (f) =>
  Array.from({ length: SUBFRAMES }, (_, j) => (f + ((j + 0.5) / SUBFRAMES - 0.5) * SHUTTER) / FPS);
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
const captionHtml = () => `<div class="fk-cap" id="cap" style="visibility:hidden"></div>`;
/** The caption on screen at t: the spec's cue, frame-rounded as the animatic sets it. */
function caption(st, t) {
  const f = frameOf(t);
  const cue = F.CAPTIONS.find((c) => frameOf(c.start) <= f && f < frameOf(c.end));
  st.set("#cap", { $text: cue ? cue.text : "", visibility: cue ? "visible" : "hidden" });
}
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

// ------------------------------------------------------------------ 04.1 to 04.3: the brand, the system, Reports
/**
 * One stage for three shots, because one window carries through them: the Command Centre the emblem
 * becomes (04.1) shrinks to the system map's hub (04.2), and the camera pushes back into it, on Reports
 * (04.3). Today's last frame, dimmed, is the first thing on it: the turn from today's tools to Aurixa.
 */
function brandScene() {
  const hub = F.SYSTEM_MAP.hub;
  const css = F.plate(hub.key).css; // the Command Centre's plates share one size
  const Zb = 972 / css[0]; // 04.1's window, whole, as A04b frames it
  const Zh = hub.width / css[0]; // the hub
  const built = [540, 543 + 575 / 2];
  const A04C = { rect: [40, 462, 1000, 737], zoom: 0.82, focus: [887, 432], at: [540, 830] };

  const [t0, tEmblem, tWordmark, tLift] = [0, 1, 2, 3].map((i) => beat("04.1", i));
  const [tShrink, tPortals] = [0, 1].map((i) => beat("04.2", i));
  // 04.3's last beat (35.833) is the hold: nothing moves after the corners close.
  const [tPush, tTravel, tPress] = [0, 1, 2].map((i) => beat("04.3", i));

  // The supplied logo: the emblem 440 px wide with its foot 20 px above the hairline, the wordmark 620 px
  // wide below it (A04a), the wordmark cut into its letters where the file's own gaps fall (13 of them).
  const EM = { w: 440, h: (440 * 628) / 679, file: [679, 628] };
  EM.left = 540 - EM.w / 2;
  EM.top = 948 - EM.h;
  const ORB = [340, 392]; // the orb's centre in the emblem's file
  const WM = { w: 620, h: (620 * 187) / 882, top: 996, file: [882, 187] };
  WM.left = 540 - WM.w / 2;
  const k = WM.w / WM.file[0];
  const letters = [];
  const cut = (runs, y0, y1) =>
    runs.forEach(([a, b], i) => {
      const l = i === 0 ? 0 : (runs[i - 1][1] + a) / 2;
      const r = i === runs.length - 1 ? WM.file[0] : (b + runs[i + 1][0]) / 2;
      letters.push({ l, r, y0, y1 });
    });
  // AURIXA, then SYSTEMS: each letter's columns in wordmark.png (measured from its alpha).
  cut(
    [
      [1, 141],
      [174, 295],
      [346, 470],
      [514, 537],
      [581, 712],
      [742, 881],
    ],
    0,
    114,
  );
  cut(
    [
      [137, 186],
      [224, 280],
      [318, 367],
      [407, 457],
      [498, 544],
      [588, 647],
      [690, 739],
    ],
    114,
    WM.file[1],
  );

  const html = () => {
    const lead = F.FRAMES.F03.draw().join("");
    const logo = (file) => (file ? `url('${file}')` : "none");
    const letterDivs = letters
      .map(
        ({ l, r, y0, y1 }, i) =>
          `<div id="wm-${i}" style="position:absolute;left:${px(WM.left + l * k)};top:${px(WM.top + y0 * k)};width:${px((r - l) * k)};height:${px((y1 - y0) * k)};background:${logo(F.WORDMARK)} ${px(-l * k)} ${px(-y0 * k)}/${px(WM.w)} ${px(WM.h)} no-repeat;visibility:hidden"></div>`,
      )
      .join("");
    const portals = F.SYSTEM_MAP.portals.map((_, i) => F.mapPortal(i, { traveller: 0 }));
    const lines = portals
      .map(
        (p, i) =>
          `<div id="L${i}" style="position:absolute;inset:0;z-index:1">${p.line.replace('class="fk-link"', `class="fk-link" id="Lk${i}"`).replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`)}</div>`,
      )
      .join("");
    const wins = portals
      .map(
        (p, i) =>
          `<div id="P${i}" style="position:absolute;inset:0;z-index:3;visibility:hidden">${p.window}</div>`,
      )
      .join("");
    const chips = portals
      .map(
        (p, i) =>
          `<div id="C${i}" style="position:absolute;inset:0;z-index:4;visibility:hidden">${p.chip}</div>`,
      )
      .join("");
    // The hub's label where systemMap puts it, 72 px above the hub's page.
    const hubChip = F.mapChip(hub.label, hub.at[0], hub.at[1] - (css[1] * Zh) / 2 - 72, 6).replace(
      'class="fk-chip"',
      'class="fk-chip" id="CH"',
    );
    return [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="lead" class="fk-layer before" style="z-index:1">${lead}<div class="fk-veil" id="lead-veil" style="opacity:.78;z-index:100"></div></div>`,
      `<div id="map" class="fk-layer" style="z-index:3;transform-origin:${hub.at[0]}px ${hub.at[1]}px">${lines}${wins}${chips}${hubChip}</div>`,
      windowHtml("W", [hub.key, "PL-04B-a", "PL-04B-b"], 5),
      `<div class="fk-horizon" id="hair" style="left:110px;right:110px;top:968px;transform-origin:0 50%;visibility:hidden"></div>`,
      `<div class="fk-traveller" id="hair-head" style="left:0;top:969px;z-index:3;visibility:hidden"></div>`,
      `<div id="wordmark" class="fk-layer" style="z-index:6">${letterDivs}</div>`,
      `<div id="emblem" style="position:absolute;left:${px(EM.left)};top:${px(EM.top)};width:${px(EM.w)};height:${px(EM.h)};z-index:8;transform-origin:0 0;background:${logo(F.EMBLEM)} center/contain no-repeat;visibility:hidden">
        <div id="orb" style="position:absolute;left:${px((ORB[0] / EM.file[0]) * EM.w - 130)};top:${px((ORB[1] / EM.file[1]) * EM.h - 130)};width:260px;height:260px;border-radius:50%;mix-blend-mode:screen;
          background:radial-gradient(closest-side, rgba(245,209,122,.85), rgba(215,179,95,.35) 45%, rgba(215,179,95,0) 100%);visibility:hidden"></div></div>`,
      focusHtml(),
      pointerHtml(),
      captionHtml(),
    ].join("");
  };

  // Where the Command Centre's window is at t, and the map's camera around it.
  const ccFraming = (t, m) => {
    // 04.1: the window settles in with one slow push.
    const settle = span(t, tLift + 0.05, tLift + 1.7, EASE.settle);
    const built41 = whole(css, Zb * lerp(0.93, 1, settle), built);
    if (t < tShrink) return { framing: built41, map: { s: 1, d: [0, 0] } };
    // 04.2: it shrinks to the centre and becomes the hub; the camera pulls slowly back from the map.
    const pull = lerp(1.035, 1, span(t, tShrink + 0.3, tPush, EASE.move));
    const hubFraming = (s) => whole(css, Zh * s, hub.at);
    if (t < tPush) {
      const p = span(t, tShrink, tShrink + 0.9, EASE.move);
      const from = whole(css, Zb, built);
      const to = hubFraming(pull);
      return {
        framing: whole(css, zoomLerp(from.zoom, to.zoom, p), lerp2(built, hub.at, p)),
        map: { s: pull, d: [0, 0] },
      };
    }
    // 04.3: the camera pushes back into the hub, onto Reports; the map goes past it.
    const p = span(t, tPush, tPush + 0.82, EASE.move);
    const framing = between(css, hubFraming(1), A04C, p);
    const c = [framing.rect[0] + framing.rect[2] / 2, framing.rect[1] + framing.rect[3] / 2];
    return {
      framing,
      map: { s: framing.zoom / Zh, d: [c[0] - hub.at[0], c[1] - hub.at[1]] },
      push: p,
    };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t);
    // The dimmed frame becomes the brand's deep navy.
    st.set("#lead", fade(1 - span(t, t0, t0 + 0.4, EASE.move)));
    st.set("#ground", fade(span(t, t0 + 0.05, t0 + 0.75, EASE.move)));
    // G-HAIRLINE: one gold line drawn across, the traveller's glow at its leading end.
    const drawn = span(t, t0 + 0.08, tEmblem + 0.05, EASE.move);
    // The hairline and the wordmark give way quickly, so they are gone before the window comes in.
    const away = span(t, tLift, tLift + 0.32, EASE.settle);
    st.set("#hair", { transform: `scaleX(${r3(drawn)})`, ...fade(Math.min(drawn * 8, 1) - away) });
    st.set("#hair-head", {
      transform: `translate(${px(110 + 860 * drawn)}, 0) translate(-50%, -50%)`,
      ...fade(Math.min(drawn * 10, 1) - span(t, tEmblem, tEmblem + 0.5, EASE.move)),
    });
    // G-EMBLEM: the emblem through a mask that opens from the hairline (its edge travels, on ease-move,
    // and the emblem settles up out of the line, on ease-settle); then the orb's glow.
    const open = span(t, tEmblem, tEmblem + 0.78, EASE.move);
    const rise = span(t, tEmblem, tEmblem + 0.9, EASE.settle);
    const { framing, map, push = 0 } = ccFraming(t, m);
    // ...and from the lift, the emblem flies to the Command Centre's own sidebar mark.
    const lift = span(t, tLift, tLift + 0.78, EASE.move);
    const g = KIT.shotGeometry({ css, ...framing });
    const [ex, ey, ew] = m.emb; // the sidebar mark's box in the plate
    const drawnW = ew; // the mark draws the emblem contained in its square: full width
    const target = g.map([ex, ey + (ew - (ew * EM.file[1]) / EM.file[0]) / 2]);
    const scale = zoomLerp(1, (drawnW * framing.zoom) / EM.w, lift);
    const pos = lerp2([EM.left, EM.top], target, lift);
    const landed = lift >= 1;
    st.set("#emblem", {
      transform: `translate(${px(pos[0] - EM.left)}, ${px(pos[1] - EM.top)}) translateY(${px((1 - rise) * 18)}) scale(${scale.toFixed(6)})`,
      "clip-path": open < 1 ? `inset(${r3((1 - open) * 100)}% 0 0 0)` : "none",
      ...fade(t < tEmblem ? 0 : landed ? 0 : 1),
    });
    const glow =
      span(t, tEmblem + 0.62, tEmblem + 1.0, EASE.settle) *
      lerp(1, 0.42, span(t, tEmblem + 0.9, tWordmark + 0.6, EASE.move));
    st.set("#orb", fade(glow * (1 - span(t, tLift, tLift + 0.3, EASE.move))));
    // The wordmark through a mask that opens letter by letter, out of the hairline.
    letters.forEach((_, i) => {
      const a = i < 6 ? tWordmark + i * 0.045 : tWordmark + 0.12 + (i - 6) * 0.035;
      const p = span(t, a, a + 0.32, EASE.settle);
      st.set(`#wm-${i}`, {
        transform: `translateY(${px(-(1 - p) * 12 + away * 8)})`,
        "clip-path": p < 1 ? `inset(0 0 ${r3((1 - p) * 100)}% 0)` : "none",
        ...fade(Math.min(p * 3, 1) * (1 - away)),
      });
    });
    // The Command Centre's window: it settles in as the emblem lands; its sidebar's groups set in,
    // then the top bar with its Demo workspace badge, then the Overview page.
    const winIn = span(t, tLift + 0.1, tLift + 0.5, EASE.move);
    // Reports comes in while the push is at its fastest, so the change of page doesn't linger as a double image.
    const reports = span(t, tPush + 0.12, tPush + 0.36, EASE.linear);
    const selected = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const wg = placeWindow(st, "W", css, framing, [1, reports, selected], {
      opacity: winIn,
      transform: `translateY(${px((1 - winIn) * 10)})`,
    });
    const set = (sel, a, d, dy = 0, dx = 0, i = null) => {
      const p = span(t, a, a + d, EASE.settle);
      st.set(
        `#W-0 ${sel}`,
        { transform: `translate(${px((1 - p) * dx)}, ${px((1 - p) * dy)})`, ...fade(p) },
        i,
      );
    };
    st.set("#W-0 .cside .tenant .emb", fade(landed ? 1 : 0));
    set(".cside .tenant .t", tLift + 0.62, 0.36, 0, -6);
    set(".cside .tenant .s", tLift + 0.7, 0.36, 0, -6);
    set(".cside .filter", tLift + 0.52, 0.34, 0, -8);
    m.groups.forEach((_, i) => set(".cside .grp", tLift + 0.6 + i * 0.07, 0.36, 0, -10, i));
    set(".ctop", tLift + 0.95, 0.36, -8);
    set(".ctop .cdemo", tLift + 1.12, 0.32, 0, 6);
    set(".stage .col", tLift + 1.22, 0.45, 14);
    // 04.2: five portals arrive around the hub, a line drawn to each, each labelled; the hub labelled.
    const mapFade = 1 - (push ? span(t, tPush, tPush + 0.42, EASE.move) : 0);
    st.set("#map", {
      transform: `translate(${px(map.d[0])}, ${px(map.d[1])}) scale(${map.s.toFixed(6)})`,
      ...fade(t >= tShrink ? mapFade : 0),
    });
    st.set(
      "#CH",
      fade(span(t, tPortals - 0.3, tPortals + 0.05, EASE.move) * (1 - span(t, tPush, tPush + 0.2))),
    );
    F.SYSTEM_MAP.portals.forEach(({ at }, i) => {
      const a = tPortals + i * 0.11;
      const p = span(t, a, a + 0.55, EASE.settle);
      const from = lerp2(hub.at, at, 0.62);
      st.set(`#P${i}`, {
        transform: `translate(${px((from[0] - at[0]) * (1 - p))}, ${px((from[1] - at[1]) * (1 - p))}) scale(${r3(lerp(0.84, 1, p))})`,
        "transform-origin": `${at[0]}px ${at[1]}px`,
        ...fade(span(t, a, a + 0.28, EASE.linear)),
      });
      const drawnTo = span(t, a - 0.06, a + 0.4, EASE.move);
      const len = Math.hypot(at[0] - hub.at[0], at[1] - hub.at[1]);
      const angle = (Math.atan2(at[1] - hub.at[1], at[0] - hub.at[0]) * 180) / Math.PI;
      st.set(`#Lk${i}`, {
        transform: `rotate(${angle.toFixed(3)}deg) scaleX(${r3(drawnTo)})`,
        ...fade(drawnTo > 0 ? 1 : 0),
      });
      // The traveller runs the line once, from the hub to the portal, and is gone into it.
      const run = span(t, a + 0.3, a + 1.25, EASE.move);
      const pos = lerp2(hub.at, at, lerp(0.18, 0.9, run));
      st.set(`#T${i}`, {
        left: px(pos[0]),
        top: px(pos[1]),
        ...fade(
          Math.min(
            span(t, a + 0.3, a + 0.42, EASE.linear),
            1 - span(t, a + 1.05, a + 1.25, EASE.linear),
          ),
        ),
      });
      st.set(`#C${i}`, {
        transform: `translateY(${px((1 - span(t, a + 0.34, a + 0.7, EASE.settle)) * 8)})`,
        ...fade(span(t, a + 0.34, a + 0.7, EASE.settle)),
      });
    });
    // 04.3: the pointer travels to New Build and presses; focus corners close in on the three build types.
    const types = throughRect(wg, m.types);
    const newBuild = wg.map(m.newBuild);
    const from = wg.map(m.property);
    pointer(st, t, {
      from,
      to: newBuild,
      a: tTravel,
      b: tPress - 0.08,
      show: tTravel - 0.16,
      press: tPress,
    });
    if (t >= tPress) corners(st, t, types, tPress + 0.06, tPress + 0.52);
    else st.set("#focus", { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });
    return st;
  };

  return {
    id: "brand",
    shots: ["04.1", "04.2", "04.3"],
    palette: "aurixa",
    html,
    measure: {
      emb: ["#W-0", ".cside .tenant .emb"],
      groups: ["#W-0", ".cside .grp", true],
      types: ["#W-1", ".types"],
      newBuildCard: ["#W-1", ".type", true],
      propertyCard: ["#W-1", ".cctx"],
    },
    derive(m) {
      const nb = m.newBuildCard[1];
      return {
        ...m,
        // The pointer's tip on New Build's label, right of its centre; it starts on Residence 014's card.
        newBuild: [nb[0] + nb[2] * 0.66, nb[1] + nb[3] * 0.58],
        property: [
          m.propertyCard[0] + m.propertyCard[2] * 0.5,
          m.propertyCard[1] + m.propertyCard[3] * 0.62,
        ],
      };
    },
    state,
  };
}

// ------------------------------------------------------------------ 05.1: research into financial analysis
function researchScene() {
  const css = F.plate("PL-05A-a").css;
  const [tIn, tPress] = [0, 1].map((i) => beat("05.1", i));
  const rect = [40, 388, 1000, 892];
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-05A-a", "PL-05A-b"], 5),
      railHtml("rail-a", "Research"),
      railHtml("rail-b", "Financial"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t);
    // Starts on the record's header and tiers (the page's column from the sidebar's edge); a short pan
    // to + Financial as the pointer goes to it.
    // The plate's x0 at the page's left edge: at zoom 1 the page is 972 px wide, its centre 486 px in.
    const view = (x0) => ({ rect, zoom: 1, focus: [x0 + 486, 432], at: [540, 834] });
    const pan = span(t, tPress - 0.95, tPress - 0.15, EASE.move);
    const x0 = lerp(m.start, m.end, pan);
    const preparing = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const g = placeWindow(st, "W", css, view(x0), [1, preparing]);
    st.set("#W-1 .qspin", { transform: `rotate(${r3(((t - tPress) * 360) % 360)}deg)` });
    // The journey rail slides in above the window with Research lit; at the press it moves to Financial.
    const railIn = span(t, tIn + 0.12, tIn + 0.62, EASE.settle);
    const moved = span(t, tPress + 0.14, tPress + 0.46, EASE.move);
    st.set("#rail-a", {
      transform: `translateY(${px((1 - railIn) * -22)})`,
      ...fade(railIn * (1 - moved)),
    });
    st.set("#rail-b", fade(moved));
    pointer(st, t, {
      from: [700, 940],
      to: g.map(m.financial),
      a: tPress - 0.9,
      b: tPress - 0.08,
      show: tPress - 1.05,
      press: tPress,
    });
    return st;
  };
  return {
    id: "research",
    shots: ["05.1"],
    palette: "aurixa",
    html,
    measure: { tiers: ["#W-0", ".qtier", true], col: ["#W-0", ".qcol"] },
    derive(m) {
      const fin = m.tiers[1];
      return {
        ...m,
        financial: [fin[0] + fin[2] * 0.64, fin[1] + fin[3] * 0.62],
        // The view's left edge in the plate: first the page's column, then with + Financial centred.
        start: m.col[0] - 8,
        end: fin[0] + fin[2] / 2 - 486,
      };
    },
    state,
  };
}

// ------------------------------------------------------------------ 05.2: into a report the client can understand
function deliverableScene() {
  const css = F.plate("PL-05C-a").css;
  const [tIn, tOpen, tLift] = [0, 1, 2].map((i) => beat("05.2", i));
  const DOC_W = 470;
  const DOC_H = (DOC_W * 842.25) / 595.5;
  // F05's fan: [plate, left, top, rotation, z], the cover in front.
  const FAN = [
    ["NEW-REPORT-PAGES-contents", 150, 470, -11, 1],
    ["NEW-REPORT-PAGES-property", 300, 440, -2, 2],
    ["NEW-REPORT-PAGES-summary", 470, 470, 9, 3],
    ["NEW-REPORT-PAGES-cover", 270, 520, -4, 4],
  ];
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-05C-a", "PL-05C-b"], 2),
      `<div style="position:absolute;inset:0;z-index:4">${FAN.map(([key, , , , z], i) => {
        const p = F.plate(key);
        return KIT.doc({
          x: 0,
          y: 0,
          width: DOC_W,
          height: DOC_H,
          z,
          html: `<div style="position:relative;width:${p.css[0]}px;height:${p.css[1]}px;transform:scale(${DOC_W / 595.5});transform-origin:0 0">${p.html}</div>`,
        }).replace('class="fk-doc"', `class="fk-doc" id="D${i}"`);
      }).join("")}</div>`,
      railHtml("rail-a", "Financial"),
      railHtml("rail-b", "Report"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t);
    // Generated Reports, the pointer on Residence 014; it opens the report's page, and the camera follows
    // the click back to the whole page (F05's framing), which dims while the document comes forward.
    const start = {
      rect: [40, 384, 1000, 892],
      zoom: 1,
      focus: [m.start + 486, 432],
      at: [540, 830],
    };
    const F05 = { rect: [40, 384, 1000, 900], zoom: 0.68, focus: [768, 432], at: [540, 840] };
    const back = span(t, tOpen + 0.05, tOpen + 1.0, EASE.move);
    const framing = {
      rect: start.rect.map((v, i) => lerp(v, F05.rect[i], back)),
      zoom: zoomLerp(start.zoom, F05.zoom, back),
      focus: lerp2(start.focus, F05.focus, back),
      at: lerp2(start.at, F05.at, back),
    };
    const opened = span(t, tOpen - 0.02, tOpen + 0.13, EASE.linear);
    const dim = 0.6 * span(t, tLift, tLift + 0.45, EASE.move);
    const g = placeWindow(st, "W", css, framing, [1, opened], { veil: dim });
    // The rail moves to Report as the report's page opens.
    const moved = span(t, tOpen + 0.05, tOpen + 0.4, EASE.move);
    st.set("#rail-a", fade(1 - moved));
    st.set("#rail-b", fade(moved));
    // The pointer is on the card at the cut, settles, presses; then goes as the camera pulls back.
    const press = tIn + 0.27;
    const at0 = g.map(m.card);
    pointer(st, t, {
      from: [at0[0] + 10, at0[1] + 8],
      to: at0,
      a: tIn,
      b: tIn + 0.22,
      show: tIn - 1,
      hide: tOpen + 0.12,
      press,
    });
    // G-DOCUMENT: the cover lifts out of the page's document view, then the pages fan out behind it.
    const card = throughRect(g, m.docCard);
    const cardCentre = [card[0] + card[2] / 2, card[1] + card[3] / 2];
    const [, cx, cy, crot] = FAN[FAN.length - 1];
    // The cover at time u: from the size of the page's document view, centred on it, up to F05's place.
    // It starts as a small page on the document view (a fifth of its size, a little below where it
    // lands) and rises to full size as it comes forward, its shadow growing with it.
    const coverAt = (u) => {
      const p = span(u, tLift, tLift + 0.8, EASE.settle);
      const c = lerp2([cardCentre[0], cardCentre[1] + 30], [cx + DOC_W / 2, cy + DOC_H / 2], p);
      return {
        left: c[0] - DOC_W / 2,
        top: c[1] - DOC_H / 2,
        angle: lerp(0, crot, p),
        scale: zoomLerp(0.2, 1, p),
      };
    };
    FAN.forEach(([, x, y, rot], i) => {
      const cover = i === FAN.length - 1;
      let s;
      let opacity;
      if (cover) {
        s = coverAt(t);
        opacity = span(t, tLift, tLift + 0.1, EASE.linear);
      } else {
        // Each page starts exactly behind the cover, where the cover is at that moment, and fans out.
        const a = tLift + 0.62 + i * 0.09;
        const from = coverAt(a);
        const p = span(t, a, a + 0.6, EASE.settle);
        s = {
          left: lerp(from.left, x, p),
          top: lerp(from.top, y, p),
          angle: lerp(from.angle, rot, p),
          scale: lerp(from.scale, 1, p),
        };
        opacity = t >= a ? 1 : 0;
      }
      st.set(`#D${i}`, {
        left: "0px",
        top: "0px",
        transform: `translate(${px(s.left)}, ${px(s.top)}) rotate(${r3(s.angle)}deg) scale(${s.scale.toFixed(6)})`,
        "transform-origin": "50% 60%",
        ...fade(opacity),
      });
    });
    return st;
  };
  return {
    id: "deliverable",
    shots: ["05.2"],
    palette: "aurixa",
    html,
    measure: {
      cards: ["#W-0", ".qrcard", true],
      docCards: ["#W-1", ".qcard", true],
      col: ["#W-0", ".qcards"],
    },
    derive(m) {
      const c = m.cards[0];
      return {
        ...m,
        card: [c[0] + c[2] * 0.5, c[1] + 44],
        docCard: m.docCards[0],
        start: m.col[0] - 10,
      };
    },
    state,
  };
}

const SCENES = [brandScene(), researchScene(), deliverableScene()].map((scene) => {
  const shots = scene.shots.map(shotOf);
  return { ...scene, from: frameOf(shots[0].in), to: frameOf(shots.at(-1).out) };
});

// ------------------------------------------------------------------ drawing
function launchArgs() {
  return {
    ...(F.CHROMIUM ? { executablePath: F.CHROMIUM } : {}),
    // Large images are decoded before a frame is drawn, never filled in a frame later.
    args: ["--disable-checker-imaging", "--force-color-profile=srgb"],
  };
}
/** A scene's page: the frame (.fk) with the scene's layers; each scene draws its own ground, to fade it. */
const page = (scene, css) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}${RENDER_CSS}</style></head><body><div class="fk ${scene.palette}">${scene.html()}</div></body></html>`;
/** Loads a scene, waits for its fonts and images, and installs the frame applier. */
async function load(tab, scene, css) {
  await tab.setContent(page(scene, css), { waitUntil: "load" });
  await tab.evaluate(async () => {
    await document.fonts.ready;
    const urls = new Set();
    for (const el of document.querySelectorAll("*")) {
      const bg = getComputedStyle(el).backgroundImage;
      for (const m of bg.matchAll(/url\("([^"]+)"\)/g)) urls.add(m[1]);
    }
    for (const img of document.images) urls.add(img.src);
    await Promise.all(
      [...urls].map((u) => {
        const i = new Image();
        i.src = u;
        return i.decode().catch(() => null);
      }),
    );
    const els = new Map();
    window.__apply = (updates) => {
      for (const [selector, index, props] of updates) {
        const key = `${selector}\u0000${index}`;
        let el = els.get(key);
        if (el === undefined) {
          el =
            index === null
              ? document.querySelector(selector)
              : document.querySelectorAll(selector)[index];
          if (!el)
            throw new Error(
              `Nothing on the page matches ${selector}${index === null ? "" : ` [${index}]`}`,
            );
          els.set(key, el);
        }
        for (const [k, v] of Object.entries(props)) {
          if (k === "$text") el.textContent = v;
          else el.style.setProperty(k, v);
        }
      }
    };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
/** A scene's plate measurements: each named element's box in its plate's own CSS px. */
async function measure(tab, scene) {
  const raw = await tab.evaluate((queries) => {
    const out = {};
    for (const [name, [root, selector, all]] of Object.entries(queries)) {
      const plate = document.querySelector(root);
      const box = plate.getBoundingClientRect();
      const zoom = box.width / plate.offsetWidth;
      const rects = [...plate.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return [
          (r.left - box.left) / zoom,
          (r.top - box.top) / zoom,
          r.width / zoom,
          r.height / zoom,
        ];
      });
      if (!rects.length) throw new Error(`${root} has no ${selector}`);
      out[name] = all ? rects : rects[0];
    }
    return out;
  }, scene.measure);
  return scene.derive ? scene.derive(raw) : raw;
}

/** Draws frames [from, to) on WORKERS browsers, handing each PNG (2x) to `sink` in order. */
async function draw(frames, sink) {
  const { chromium } = F.playwright();
  const css = await F.stylesheet();
  // Measure each scene once.
  const probe = await chromium.launch(launchArgs());
  const measures = new Map();
  {
    const ctx = await probe.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
    const tab = await ctx.newPage();
    await F.routeAssets(tab);
    for (const scene of SCENES)
      if (frames.some((f) => f >= scene.from && f < scene.to)) {
        await load(tab, scene, css);
        measures.set(scene.id, await measure(tab, scene));
      }
  }
  await probe.close();
  const sceneAt = (f) => {
    const s = SCENES.find((x) => f >= x.from && f < x.to);
    if (!s) throw new Error(`No scene draws frame ${f}`);
    return s;
  };
  // Workers take frames in turn, so the frames finish roughly in order.
  const done = new Map();
  let next = 0;
  let wake = null;
  const deliver = async () => {
    while (next < frames.length && done.has(frames[next])) {
      const f = frames[next];
      const png = done.get(f);
      done.delete(f);
      next++;
      await sink(f, png);
    }
  };
  let captures = 0;
  const worker = async (k) => {
    const browser = await chromium.launch(launchArgs());
    const ctx = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SUPERSAMPLE,
    });
    const tab = await ctx.newPage();
    await F.routeAssets(tab);
    const cdp = await ctx.newCDPSession(tab);
    let loaded = null;
    let last = new Map();
    for (let i = k; i < frames.length; i += WORKERS) {
      const f = frames[i];
      const scene = sceneAt(f);
      if (loaded !== scene) {
        await load(tab, scene, css);
        loaded = scene;
        last = new Map();
      }
      // The frame's drawings over its open shutter; a drawing that changes nothing reuses the one before.
      const pngs = [];
      let previous = null;
      for (const t of subframeTimes(f)) {
        const updates = scene.state(t, measures.get(scene.id)).diff(last);
        if (previous && !updates.length) {
          pngs.push(previous);
          continue;
        }
        await tab.evaluate((u) => window.__apply(u), updates);
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          optimizeForSpeed: true,
          clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SUPERSAMPLE },
        });
        previous = Buffer.from(data, "base64");
        pngs.push(previous);
        captures++;
      }
      done.set(f, pngs);
      if (wake) wake();
      // Not too far ahead of the frame the encoder waits for (never the worker drawing that frame).
      while (i + WORKERS - next > WORKERS * 6) await new Promise((r) => setTimeout(r, 20));
    }
    await browser.close();
  };
  let finished = 0;
  const pump = (async () => {
    while (next < frames.length) {
      await deliver();
      if (next >= frames.length) break;
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 50);
      });
      if (finished === WORKERS && !done.has(frames[next]))
        throw new Error(`Frame ${frames[next]} was never drawn`);
    }
  })();
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, frames.length) }, (_, k) =>
      worker(k).then(() => {
        finished++;
      }),
    ),
  );
  await pump;
  return { measures: Object.fromEntries(measures), captures };
}

// ------------------------------------------------------------------ encoding
/**
 * The master: Lanczos down to 1080 x 1920 from the 2x drawing, BT.709 4:2:0 in the TV range by zimg with
 * error-diffusion dither (so the ground's gradients don't band), x264 High at CRF 12 with its dark-scene
 * adaptive quantisation, every colour tag written. The reference is the same picture before any of that
 * is lost: the 1080 x 1920 RGB frames, lossless.
 */
function encoder(film, reference, audio) {
  const scale = `zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos`;
  // Each frame's SUBFRAMES drawings come in a row: averaged, the last of each row kept, back to 30 fps.
  const shutter =
    SUBFRAMES > 1
      ? `,tmix=frames=${SUBFRAMES},select='eq(mod(n,${SUBFRAMES}),${SUBFRAMES - 1})',setpts=N/(${FPS}*TB)`
      : "";
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS * SUBFRAMES),
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    ...(audio ? ["-ss", String(audio.start), "-t", String(audio.seconds), "-i", audio.file] : []),
    "-filter_complex",
    `[0:v]format=gbrp,${scale}${shutter},split=2[m][r];` +
      `[m]zscale=rangein=full:primariesin=709:transferin=709:matrix=709:primaries=709:transfer=709:range=limited:dither=error_diffusion,format=yuv420p[master];` +
      `[r]format=gbrp[ref]`,
    "-map",
    "[master]",
    ...(audio ? ["-map", "1:a"] : []),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "12",
    "-profile:v",
    "high",
    "-level:v",
    "4.2",
    "-x264-params",
    "aq-mode=3:aq-strength=0.9",
    "-pix_fmt",
    "yuv420p",
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-r",
    String(FPS),
    "-g",
    String(FPS * 2),
    ...(audio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2"] : []),
    "-movflags",
    "+faststart",
    film,
    "-map",
    "[ref]",
    "-c:v",
    "ffv1",
    "-level",
    "3",
    "-g",
    "1",
    "-r",
    String(FPS),
    reference,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((resolve, reject) =>
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))),
  );
  return {
    write: (buf) =>
      new Promise((resolve, reject) =>
        ff.stdin.write(buf, (err) => (err ? reject(err) : resolve())),
      ),
    end: async () => {
      ff.stdin.end();
      await closed;
    },
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shots = BRIEF.shots;
  const i0 = shots.findIndex((s) => s.id === FIRST);
  const i1 = shots.findIndex((s) => s.id === LAST);
  if (i0 < 0 || i1 < i0)
    throw new Error(`Shots ${FIRST} to ${LAST} aren't a run of the brief's shots`);
  const from = frameOf(shots[i0].in);
  const to = frameOf(shots[i1].out);
  for (const s of shots.slice(i0, i1 + 1))
    if (!SCENES.some((x) => x.shots.includes(s.id)))
      throw new Error(`Shot ${s.id} has no scene to draw it yet`);
  const only = process.env.RENDER_FRAMES?.split(",").map(Number);
  const started = Date.now();
  if (only) {
    // A few frames to PNG at the frame's size, to look at.
    const { measures } = await draw(only, async (f, pngs) => {
      const file = path.join(OUT, `frame-${String(f).padStart(5, "0")}.png`);
      await new Promise((resolve, reject) => {
        const ff = spawn(
          "ffmpeg",
          [
            "-y",
            "-loglevel",
            "error",
            "-f",
            "image2pipe",
            "-c:v",
            "png",
            "-i",
            "pipe:0",
            "-vf",
            `format=gbrp,zscale=w=${WIDTH}:h=${HEIGHT}:filter=lanczos${SUBFRAMES > 1 ? `,tmix=frames=${SUBFRAMES}` : ""},format=rgb24`,
            "-update",
            "1",
            file,
          ],
          { stdio: ["pipe", "inherit", "inherit"] },
        );
        ff.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
        );
        for (const png of pngs) ff.stdin.write(png);
        ff.stdin.end();
      });
    });
    console.log(
      `${only.length} frames → ${OUT} (${((Date.now() - started) / 1000).toFixed(1)} s)`,
      JSON.stringify(measures),
    );
    return;
  }
  const frames = Array.from({ length: to - from }, (_, i) => from + i);
  const film = path.join(OUT, "film.mp4");
  const reference = path.join(OUT, "reference.mkv");
  const audio = VOICEOVER
    ? { file: VOICEOVER, start: from / FPS, seconds: (to - from) / FPS }
    : null;
  const enc = encoder(film, reference, audio);
  let count = 0;
  const { measures, captures } = await draw(frames, async (f, pngs) => {
    for (const png of pngs) await enc.write(png);
    count++;
    if (count % 60 === 0)
      console.log(
        `${count}/${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`,
      );
  });
  await enc.end();
  const log = frames.map((f) => {
    const t = f / FPS;
    const shot = shots.find((s) => frameOf(s.in) <= f && f < frameOf(s.out));
    const cue = F.CAPTIONS.find((c) => frameOf(c.start) <= f && f < frameOf(c.end));
    return { frame: f, t: Number(t.toFixed(4)), shot: shot?.id ?? null, caption: cue?.text ?? "" };
  });
  fs.writeFileSync(
    path.join(OUT, "film.json"),
    `${JSON.stringify({ fps: FPS, from, to, supersample: SUPERSAMPLE, subframes: SUBFRAMES, shutter: SHUTTER, drawings: captures, shots: shots.slice(i0, i1 + 1).map((s) => s.id), measures, frames: log }, null, 1)}\n`,
  );
  console.log(
    `${frames.length} frames (${FIRST} to ${LAST}), ${captures} drawings → ${film} in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
