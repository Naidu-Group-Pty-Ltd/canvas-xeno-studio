// Reel 3, block 06 (the chosen property): what scenes/scenarios.cjs and scenes/snapshot.cjs draw beyond the kit.
//  - crop(): a part of a captured screen as a plate of Reel 1's G-WINDOW, cut on both axes. It is the camera's own
//    framing of the product's page, never a splice of two parts of it; the screen's top bar goes above it where
//    asked, so the screen carries its DEMO WORKSPACE label.
//  - box() and centred(): a window framing that shows such a plate whole, at a zoom where its words read.
//  - the property card: 14 Wattle Grove (Reel 1's photograph, the demo record's facts) in the brand's glass; the
//    client chip; the chips that carry their facts into Model next purchase, and the ring a field flashes as one lands.
//  - a pointer that travels a path of moves and presses (Reel 1's G-POINTER, several moves in one shot).
//  - the light that crosses a figure as it changes, and the film's eyebrow naming a section of the page.
//  - a Snapshot page as a sheet of paper, and a part of one lifted off it as a card.
// Nothing here times anything: the scenes pass the times, from the brief's words.
const fs = require("fs");
const path = require("path");
const M = require("./motion.cjs");
const P = require("./pacing.cjs");
const K3 = require("./kit3.cjs");

const { span, lerp, lerp2, r3, px, fade, EASE, PRESS, POINTER_TIP, KIT, PAD } = M;

// ------------------------------------------------------------------ the voice's words, on the film's clock
const WORDS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../docs/brands/aurixa-reel-3/voiceover-words.json"),
    "utf8",
  ),
).words.map((w) => ({
  text: String(w.word ?? w.text)
    .toLowerCase()
    .replace(/[^a-z0-9%$]/g, ""),
  at: P.word(w.start),
  until: P.word(w.end),
}));
/** When the film says `text` (its first time at or after `after`, film seconds). */
function word(text, after) {
  const key = text.toLowerCase().replace(/[^a-z0-9%$]/g, "");
  const w = WORDS.find((x) => x.text === key && x.at >= after - 1e-6);
  if (!w) throw new Error(`The voice never says "${text}" after ${after}`);
  return w;
}

// ------------------------------------------------------------------ a screen, cut to what the camera frames
/**
 * A part of screen `key` (x0..x1, y0..y1 in its CSS px) as a plate in Reel 1's PLATES, with the screen's top bar
 * (kit3's, its DEMO WORKSPACE label at the plate's right edge) above it when `bar` is given. Returns the plate's
 * name, its CSS size and `at`, which takes a region of the screen (a name, or [x, y, w, h]) to the plate.
 */
function crop(key, { x0 = 0, y0 = 0, x1 = null, y1 = null, bar = null } = {}) {
  const { PLATES } = require("../aurixa-reel-1/plates.cjs");
  const s = K3.screen(key);
  const [W, H] = s.css;
  const right = x1 ?? W;
  const bottom = y1 ?? H;
  const w = right - x0;
  const h = bottom - y0;
  const top = bar ? K3.BAR_H : 0;
  const name = `R3C-${key}-${x0}-${y0}-${right}-${bottom}${bar ? "-bar" : ""}`;
  if (!PLATES[name])
    PLATES[name] = {
      size: [w, h + top],
      scale: 1,
      html:
        `<div style="position:absolute;left:0;top:${top}px;width:${w}px;height:${h}px;overflow:hidden"><img src="${s.src}" alt="" style="position:absolute;left:${-x0}px;top:${-y0}px;width:${W}px;height:${H}px;max-width:none"></div>` +
        (bar ? K3.barHtml(bar) : ""),
    };
  const at = (r) => {
    const [x, y, rw, rh] = Array.isArray(r) ? r : K3.region(key, r);
    return [x - x0, y - y0 + top, rw, rh];
  };
  return { name, css: [w, h + top], at };
}
/** A screen's top bar alone (kit3's, with its DEMO WORKSPACE label), as a plate `width` CSS px wide. */
function barPlate(width, bar) {
  const { PLATES } = require("../aurixa-reel-1/plates.cjs");
  const name = `R3C-bar-${width}-${bar.portal}-${bar.page}`.replace(/[^A-Za-z0-9-]/g, "_");
  if (!PLATES[name]) PLATES[name] = { size: [width, K3.BAR_H], scale: 1, html: K3.barHtml(bar) };
  return { name, css: [width, K3.BAR_H] };
}
/** A window showing a plate whole at `zoom`, its glass's top-left at (x, y); `h` (plate px) shows only its top. */
const box = (css, zoom, x, y, h = css[1]) => ({
  rect: [x, y, css[0] * zoom + 2 * PAD, h * zoom + 2 * PAD],
  zoom,
  focus: [0, 0],
  at: [x + PAD, y + PAD],
});
/** box(), centred across the frame. */
const centred = (css, zoom, y, h = css[1]) => box(css, zoom, 540 - (css[0] * zoom) / 2 - PAD, y, h);
/** A framing moved by (dx, dy) frame px. */
const moved = (f, dx, dy) => ({
  ...f,
  rect: [f.rect[0] + dx, f.rect[1] + dy, f.rect[2], f.rect[3]],
  at: [f.at[0] + dx, f.at[1] + dy],
});
/** Where a framing puts a plate's points: Reel 1's window geometry, without drawing anything. */
const geometry = (css, f) => KIT.shotGeometry({ css, ...f });
/** A plate rect [x, y, w, h] as a frame rect under a framing. */
const toFrame = (g, zoom, [x, y, w, h]) => {
  const [fx, fy] = g.map([x, y]);
  return [fx, fy, w * zoom, h * zoom];
};
const centreOf = ([x, y, w, h]) => [x + w / 2, y + h / 2];

// ------------------------------------------------------------------ the property, the client and their facts
const css = `
.c6-prop { position:absolute; left:0; top:0; width:960px; height:236px; display:flex; border-radius:24px; overflow:hidden; transform-origin:0 0;
  background:linear-gradient(120deg, rgba(17,32,58,.98), rgba(7,14,28,.98)); border:2px solid rgba(215,179,95,.42);
  box-shadow:0 34px 80px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.04) inset; font-family:var(--reel-sans); color:#fff; }
.c6-prop .ph { position:relative; width:260px; height:100%; flex:none; background:url('https://reel-assets.local/P.png') 50% 48%/cover no-repeat; }
.c6-prop .ph::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(4,11,22,0) 70%, rgba(7,14,28,.75)); }
.c6-prop .tag { position:absolute; left:16px; bottom:16px; z-index:2; padding:8px 13px; border-radius:999px; background:rgba(4,11,22,.74);
  border:1.5px solid rgba(215,179,95,.6); font:700 17px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.2em; color:#e6c574; }
.c6-prop .bd { flex:1; min-width:0; padding:20px 30px; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; gap:6px; }
.c6-prop .t { font:700 38px/1.08 var(--reel-sans); letter-spacing:-.012em; }
.c6-prop .a { font:500 24px/1.2 var(--reel-sans); color:#b7c1d0; }
.c6-prop .p { margin-top:8px; font:700 42px/1 var(--reel-sans); letter-spacing:-.01em;
  background:linear-gradient(180deg, #f5d17a, #d7b35f 60%, #c89b3c); -webkit-background-clip:text; background-clip:text; color:transparent; }
.c6-prop .f { margin-top:8px; font:500 22px/1.25 var(--reel-sans); color:#cfd6e2; white-space:nowrap; }
.c6-prop .gl { position:absolute; inset:0; pointer-events:none; overflow:hidden; mix-blend-mode:screen; }
.c6-prop .gl i { position:absolute; top:-30%; bottom:-30%; width:22%; left:0;
  background:linear-gradient(90deg, rgba(255,240,205,0), rgba(255,240,205,.45) 50%, rgba(255,240,205,0)); transform:skewX(-16deg); }
.c6-client { position:absolute; left:0; top:0; width:420px; height:112px; box-sizing:border-box; display:flex; align-items:center; gap:18px; padding:0 22px;
  border-radius:26px; background:linear-gradient(180deg, rgba(18,34,52,.97), rgba(8,18,30,.97)); border:1.5px solid rgba(94,221,232,.55);
  box-shadow:0 22px 48px rgba(0,0,0,.55); font-family:var(--reel-sans); color:#fff; transform-origin:50% 50%; }
.c6-client .av { width:68px; height:68px; flex:none; border-radius:50%; display:grid; place-items:center; background:#10233D;
  border:1.5px solid rgba(94,221,232,.6); font:700 26px/1 var(--reel-sans); }
.c6-client .n { font:700 27px/1.1 var(--reel-sans); }
.c6-client .r { margin-top:6px; font:500 20px/1.2 var(--reel-sans); color:#b7c1d0; white-space:nowrap; }
.c6-chip { position:absolute; left:0; top:0; padding:11px 20px; border-radius:999px; white-space:nowrap; transform-origin:50% 50%;
  background:linear-gradient(180deg, rgba(30,26,14,.96), rgba(16,14,8,.96)); border:2px solid rgba(215,179,95,.85);
  box-shadow:0 0 22px rgba(215,179,95,.35), 0 12px 28px rgba(0,0,0,.5); font:700 26px/1 var(--reel-sans); color:#f5d17a; }
.c6-chip.cy { border-color:rgba(94,221,232,.85); color:#bff4f8; box-shadow:0 0 22px rgba(94,221,232,.3), 0 12px 28px rgba(0,0,0,.5);
  background:linear-gradient(180deg, rgba(10,30,40,.96), rgba(6,16,24,.96)); }
.c6-ring { position:absolute; left:0; top:0; border-radius:10px; border:3px solid #5edde8; pointer-events:none;
  box-shadow:0 0 18px rgba(94,221,232,.55), inset 0 0 12px rgba(94,221,232,.25); }
.c6-sweep { position:absolute; left:0; top:0; overflow:hidden; pointer-events:none; mix-blend-mode:screen; border-radius:8px; }
.c6-sweep i { position:absolute; top:-20%; bottom:-20%; width:34%; left:0;
  background:linear-gradient(90deg, rgba(255,236,190,0), rgba(255,236,190,.75) 50%, rgba(255,236,190,0)); transform:skewX(-18deg); }
.c6-eye { position:absolute; left:0; top:0; display:flex; align-items:center; gap:16px; white-space:nowrap;
  font:700 21px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.3em; text-transform:uppercase; color:#d7b35f;
  text-shadow:0 0 18px rgba(215,179,95,.25); }
.c6-eye::before { content:""; display:block; width:44px; height:2px; background:#c89b3c; box-shadow:0 0 10px rgba(215,179,95,.6); }
.c6-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; perspective:1900px; perspective-origin:540px 760px; }
.c6-sheet { position:absolute; left:0; top:0; width:595.2px; height:841.92px; transform-origin:50% 50%; backface-visibility:hidden;
  box-shadow:0 30px 60px -14px rgba(0,0,0,.7), 0 10px 22px -10px rgba(0,0,0,.5); border-radius:3px; overflow:hidden; }
.c6-sheet img { position:absolute; left:0; top:0; width:100%; height:100%; display:block; }
.c6-sheet .v { position:absolute; inset:0; background:#040B16; }
.c6-sheet .g { position:absolute; inset:0; overflow:hidden; mix-blend-mode:screen; }
.c6-sheet .g i { position:absolute; top:-20%; bottom:-20%; width:32%; left:0;
  background:linear-gradient(90deg, rgba(255,240,205,0), rgba(255,240,205,.32) 50%, rgba(255,240,205,0)); transform:skewX(-14deg); }
.c6-lift { position:absolute; left:0; top:0; overflow:hidden; transform-origin:0 0; border-radius:4px; background:#FAF7EF;
  box-shadow:0 40px 90px -20px rgba(0,0,0,.8), 0 14px 30px -12px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06); }
.c6-lift img { position:absolute; display:block; max-width:none; }
.c6-lift .m { position:absolute; }
.c6-lift .hl { position:absolute; border-radius:2px; background:linear-gradient(90deg, rgba(215,179,95,.30), rgba(215,179,95,.10) 70%, rgba(215,179,95,0));
  box-shadow:inset 3px 0 0 #c89b3c; }
`;

const propHtml = (id) =>
  `<div class="c6-prop" id="${id}" style="visibility:hidden"><div class="ph"><span class="tag">NEW BUILD</span></div>
  <div class="bd"><div class="t">14 Wattle Grove</div><div class="a">Banksia Rise NSW 2155</div><div class="p">$1,150,000</div>
  <div class="f">4 bed · 2 bath · 2 car · 450 m² land</div></div><div class="gl"><i id="${id}-gl"></i></div></div>`;
/** Where the card's facts sit on it (card px, at scale 1), for the chips that leave from them. */
const clientHtml = (id) =>
  `<div class="c6-client" id="${id}" style="visibility:hidden"><div class="av">JE</div><div><div class="n">Jordan Ellis</div><div class="r">Savings $300,000 · Investor</div></div></div>`;
const CLIENT = { w: 420, h: 112, savings: [250, 82], intent: [356, 82] };
const chipHtml = (id, text, cyan = false) =>
  `<div class="c6-chip${cyan ? " cy" : ""}" id="${id}" style="visibility:hidden">${text}</div>`;
const ringHtml = (id) => `<div class="c6-ring" id="${id}" style="visibility:hidden"></div>`;
const sweepHtml = (id) =>
  `<div class="c6-sweep" id="${id}" style="visibility:hidden"><i id="${id}-i"></i></div>`;
const eyeHtml = (id, text) =>
  `<div class="c6-eye" id="${id}" style="visibility:hidden">${text}</div>`;

/**
 * A chip flying from `from` to `to` (frame px, its centre) over [a, b] on a bow, landing at `scale`, then taken into
 * what it lands on (shrinking and fading) over the 0.22 s after `b`.
 */
function chipState(st, t, id, { from, to, a, b, bow = 0.18, scale = 0.9 }) {
  const p = span(t, a, b, EASE.move);
  const mid = lerp2(from, to, 0.5);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const ctrl = [mid[0] - dy * bow, mid[1] + dx * bow];
  const x = (1 - p) ** 2 * from[0] + 2 * (1 - p) * p * ctrl[0] + p * p * to[0];
  const y = (1 - p) ** 2 * from[1] + 2 * (1 - p) * p * ctrl[1] + p * p * to[1];
  const into = span(t, b, b + 0.22, EASE.linear);
  const born = span(t, a - 0.06, a + 0.1, EASE.settle);
  const k = lerp(0.82, 1.06, born) * lerp(1, scale, p) * lerp(1, 0.55, into);
  st.set(`#${id}`, {
    transform: `translate(${px(x)}, ${px(y)}) translate(-50%, -50%) scale(${r3(k)})`,
    ...fade(Math.min(born, 1 - into)),
  });
}
/** A field's ring: on a frame rect, flashing once from `at` (on and fading over 0.6 s). */
function ringState(st, t, id, rect, at) {
  const u = (t - at) / 0.6;
  const o = u < 0 || u > 1 ? 0 : u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
  const g = 4 + 6 * EASE.settle(Math.max(0, Math.min(1, u)));
  st.set(`#${id}`, {
    left: px(rect[0] - g),
    top: px(rect[1] - g),
    width: px(rect[2] + 2 * g),
    height: px(rect[3] + 2 * g),
    ...fade(o),
  });
}
/** The light crossing a frame rect over [a, b]. */
function sweepState(st, t, id, rect, a, b) {
  const p = span(t, a, b, EASE.move);
  const on = t > a && t < b;
  st.set(`#${id}`, {
    left: px(rect[0]),
    top: px(rect[1]),
    width: px(rect[2]),
    height: px(rect[3]),
    ...fade(on ? 1 : 0),
  });
  st.set(`#${id}-i`, {
    transform: `translateX(${px(lerp(-0.45, 1.15, p) * rect[2])}) skewX(-18deg)`,
  });
}
/** The film's eyebrow at (x, y) (its left and its middle), rising in over [a, a + 0.35] and away over [b - 0.25, b]. */
function eyeState(st, t, id, [x, y], a, b) {
  const up = span(t, a, a + 0.35, EASE.settle);
  const down = span(t, b - 0.25, b, EASE.move);
  st.set(`#${id}`, {
    transform: `translate(${px(x)}, ${px(y - 11 + 14 * (1 - up) - 18 * down)})`,
    ...fade(Math.min(up, 1 - down)),
  });
}

// ------------------------------------------------------------------ G-POINTER along a path
/**
 * Reel 1's pointer (motion.cjs, G-POINTER) through several moves in one shot: from `start`, each move { to, a, b,
 * bow } travels from where the last ended on ease-move, bowed right of travel; each press (a time) dips it and draws
 * the focus-cyan ring over motion-press. Shown from `show`, gone over 0.2 s from `hide`.
 */
function pointerPath(st, t, { start, moves, presses = [], show, hide = Infinity }) {
  let from = start;
  let pos = start;
  for (const mv of moves) {
    if (t < mv.a) break;
    const p = span(t, mv.a, mv.b, EASE.move);
    const bow = mv.bow ?? 0.1;
    const mid = lerp2(from, mv.to, 0.5);
    const dx = mv.to[0] - from[0];
    const dy = mv.to[1] - from[1];
    const ctrl = [mid[0] - dy * bow, mid[1] + dx * bow];
    pos = [
      (1 - p) ** 2 * from[0] + 2 * (1 - p) * p * ctrl[0] + p * p * mv.to[0],
      (1 - p) ** 2 * from[1] + 2 * (1 - p) * p * ctrl[1] + p * p * mv.to[1],
    ];
    if (t < mv.b) break;
    from = mv.to;
  }
  const [x, y] = pos;
  const gone = Number.isFinite(hide) ? span(t, hide, hide + 0.2) : 0;
  const opacity = Math.min(span(t, show, show + 0.14, EASE.linear), 1 - gone);
  const press = presses.filter((p) => p <= t).at(-1);
  const since = press === undefined ? -1 : t - press;
  const dip = since >= 0 && since < 0.2 ? 1 - 0.1 * Math.sin((Math.PI * since) / 0.2) : 1;
  st.set("#fk-ptr", {
    transform: `translate(${px(x - POINTER_TIP[0])}, ${px(y - POINTER_TIP[1])}) scale(${r3(dip)})`,
    "transform-origin": `${POINTER_TIP[0]}px ${POINTER_TIP[1]}px`,
    ...fade(opacity),
  });
  if (since >= 0 && since < PRESS) {
    const u = since / PRESS;
    const d = 24 * KIT.K * EASE.settle(u);
    st.set("#fk-ring", {
      transform: `translate(${px(x - d / 2)}, ${px(y - d / 2)})`,
      width: px(d),
      height: px(d),
      ...fade((1 - u) * opacity),
    });
  } else st.set("#fk-ring", { transform: "none", width: "0px", height: "0px", ...fade(0) });
  return [x, y];
}

// ------------------------------------------------------------------ the Snapshot, as paper
/** A Snapshot page as drawn by the product (screens.json snap-p<n>: PDF points, 300 dpi). */
const PAGE = [595.2, 841.92];
const pageSrc = (n) => K3.screen(`snap-p${n}`).src;
/**
 * A page drawn small and soft, as the camera's depth of field draws a page it is not focused on: the product's page at
 * SOFT_W CSS px under a blur, baked once (scene.bake) as `<scene>-p<n>-soft<SOFT_W>.png`. A page running past or lying
 * under a lifted card is drawn from it, so none of its text can be read; what is lifted off it is drawn from the
 * page itself, sharp.
 */
const SOFT_W = 220;
const SOFT_BLUR = 1.6;
const softBake = (scene, n) => ({
  name: `${scene}-p${n}-soft${SOFT_W}.png`,
  width: SOFT_W,
  height: Math.round((SOFT_W * PAGE[1]) / PAGE[0]),
  html: `<img src="${pageSrc(n)}" alt="" style="position:absolute;left:0;top:0;width:${SOFT_W}px;height:${Math.round((SOFT_W * PAGE[1]) / PAGE[0])}px;filter:blur(${SOFT_BLUR}px)">`,
});
const softSrc = (scene, n) => `https://reel-bake.local/${scene}-p${n}-soft${SOFT_W}.png`;
/** A page as a sheet of paper (from `src`); `mask` fades it out below a point (PDF points) to another. */
const sheetHtml = (id, src, mask = null) =>
  `<div class="c6-sheet" id="${id}" style="visibility:hidden${mask ? `;-webkit-mask-image:linear-gradient(180deg, #000 ${r3((mask[0] / PAGE[1]) * 100)}%, transparent ${r3((mask[1] / PAGE[1]) * 100)}%);mask-image:linear-gradient(180deg, #000 ${r3((mask[0] / PAGE[1]) * 100)}%, transparent ${r3((mask[1] / PAGE[1]) * 100)}%)` : ""}"><img src="${src}" alt=""><div class="g"><i id="${id}-g"></i></div><div class="v" id="${id}-v"></div></div>`;
/**
 * A sheet's state: its centre (frame px), its scale (frame px per PDF point), a turn about its upright axis (deg),
 * how far towards the viewer it is (px), its veil and the light across it (0..1, or null for none).
 */
function sheetState(
  st,
  id,
  { c, s, turn = 0, z = 0, tilt = 0, roll = 0, veil = 0, opacity = 1, glint = null },
) {
  st.set(`#${id}`, {
    transform: `translate3d(${px(c[0] - PAGE[0] / 2)}, ${px(c[1] - PAGE[1] / 2)}, ${px(z)}) rotateY(${r3(turn)}deg) rotateX(${r3(tilt)}deg) rotateZ(${r3(roll)}deg) scale(${r3(s)})`,
    ...fade(opacity),
  });
  st.set(`#${id}-v`, { opacity: r3(Math.max(0, Math.min(1, veil))) });
  st.set(`#${id}-g`, {
    transform: `translateX(${px(lerp(-0.4, 1.15, glint ?? 0) * PAGE[0])}) skewX(-14deg)`,
    opacity: glint === null || glint <= 0 || glint >= 1 ? "0" : "1",
  });
}
/**
 * A part of page `n` (x0..x1, y0..y1, PDF points) lifted off it as a card: the product's own drawing, cropped by the
 * camera, never redrawn. `marks` are rects (points, page coordinates) drawn on it by the scene: a mask in the track's
 * colour (the bar growing) or a highlight on a row.
 */
function liftHtml(id, n, [x0, y0, x1, y1], extra = "") {
  return `<div class="c6-lift" id="${id}" style="visibility:hidden;width:${r3(x1 - x0)}px;height:${r3(y1 - y0)}px"><img src="${pageSrc(n)}" alt="" style="left:${r3(-x0)}px;top:${r3(-y0)}px;width:${PAGE[0]}px;height:${PAGE[1]}px">${extra}</div>`;
}

module.exports = {
  word,
  crop,
  barPlate,
  box,
  centred,
  moved,
  geometry,
  toFrame,
  centreOf,
  css,
  propHtml,
  clientHtml,
  CLIENT,
  chipHtml,
  ringHtml,
  sweepHtml,
  eyeHtml,
  chipState,
  ringState,
  sweepState,
  eyeState,
  pointerPath,
  PAGE,
  pageSrc,
  softBake,
  softSrc,
  sheetHtml,
  sheetState,
  liftHtml,
};
