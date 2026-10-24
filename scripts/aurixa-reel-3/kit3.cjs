// Reel 3's own graphics, in Reel 1's kit and tokens (aurixa-reel.css):
//  - the screens the film draws from the product (screens.json: each picture's file, its size in the product's
//    CSS px and the regions measured on it, written by assets.py from the screens harness's captures and the
//    Snapshot's pages);
//  - the top bar a part of a page is shown under, so every screen in the film carries the DEMO WORKSPACE label.
//  - the illustrative label every modelled figure carries (the brand's guardrail 2), in one place on every shot it
//    is on, so it never jumps at a cut;
//  - a figure counting up to the engine's own value, set in the product's own face over the screen it lands on.
// Nothing here times anything: the scenes pass the times, from the brief's beats.
const fs = require("fs");
const path = require("path");

const SCREENS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../docs/brands/aurixa-reel-3/screens.json"), "utf8"),
);
/** A screen the harness drew: its file (served from the assets folder), size (CSS px) and regions. */
const screen = (key) => {
  const s = SCREENS.screens[key];
  if (!s) throw new Error(`screens.json has no ${key}`);
  return { ...s, src: `https://reel-assets.local/${s.file}` };
};
/** A named region of a screen, [x, y, w, h] in its CSS px. */
const region = (key, name) => {
  const r = screen(key).regions[name];
  if (!r) throw new Error(`${key} has no region ${name}`);
  return r;
};
const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];

/**
 * A screen's own top bar, for a capture that is a part of a page: the portal's mark and name, the page, and its
 * DEMO WORKSPACE label, as the product's top bars carry it (Reel 2's, unchanged), so every screen in the film carries
 * the label.
 */
const BAR_H = 66;
const barCss = `
.r3-bar { position:absolute; left:0; right:0; top:0; height:${BAR_H}px; z-index:4; display:flex; align-items:center; gap:14px; padding:0 22px;
  background:linear-gradient(180deg, #121a30, #0d1426); border-bottom:1px solid rgba(255,255,255,.08); font-family:var(--reel-sans); color:#fff; }
.r3-bar .emb { width:36px; height:36px; flex:none; background:center/contain no-repeat; }
.r3-bar .who { display:flex; flex-direction:column; gap:4px; }
.r3-bar .who b { font-size:15px; font-weight:800; letter-spacing:.06em; }
.r3-bar .who small { font-size:10px; font-weight:700; letter-spacing:.24em; color:#8d95a8; }
.r3-bar .sep { width:1px; height:30px; background:rgba(255,255,255,.12); margin:0 6px; }
.r3-bar .page { font-size:19px; font-weight:700; color:#e8ecf4; white-space:nowrap; }
.r3-bar .demo { margin-left:auto; font-size:11px; letter-spacing:.16em; font-weight:800; color:#D7B35F; border:1px solid rgba(215,179,95,.5);
  border-radius:999px; padding:7px 12px; white-space:nowrap; }
`;
const barHtml = ({ portal, page, emblem }) =>
  `<div class="r3-bar"><div class="emb" style="background-image:url('${emblem}')"></div><div class="who"><b>AURIXA SYSTEMS</b><small>${portal}</small></div><div class="sep"></div><div class="page">${page}</div><span class="demo">DEMO WORKSPACE</span></div>`;

/**
 * A captured screen as a plate of Reel 1's G-WINDOW (../aurixa-reel-1/motion.cjs windowHtml), so a scene moves a
 * camera over it as Reel 1 moves one over a plate: R3S-<key>[-<from>][-to<to>][-bar] in Reel 1's PLATES. The plate
 * keeps the screen from CSS y `from` to `to`; `bar` ({ portal, page, emblem }) puts the screen's top bar above it.
 * Returns the plate's name, its CSS size and `at`, which takes a region of the screen to where it is on the plate.
 */
function screenPlate(key, { bar = null, from = 0, to = null } = {}) {
  const { PLATES } = require("../aurixa-reel-1/plates.cjs");
  const s = screen(key);
  const [w, full] = s.css;
  const h = to ?? full;
  const top = bar ? BAR_H : 0;
  const css = [w, h - from + top];
  const name = `R3S-${key}${from ? `-${from}` : ""}${to ? `-to${to}` : ""}${bar ? "-bar" : ""}`;
  if (!PLATES[name])
    PLATES[name] = {
      size: css,
      scale: 1,
      html:
        `<div style="position:absolute;left:0;top:${top}px;width:${w}px;height:${h - from}px;overflow:hidden"><img src="${s.src}" alt="" style="position:absolute;left:0;top:${-from}px;width:${w}px;height:${full}px"></div>` +
        (bar ? barHtml(bar) : ""),
    };
  const at = (name2) => {
    const [x, y, rw, rh] = region(key, name2);
    return [x, y - from + top, rw, rh];
  };
  return { name, css, at };
}

/**
 * The illustrative label (the brand's guardrail 2, its words exactly): on every shot with a modelled figure on screen,
 * at 24 px (the reel's legibility floor is 22 px on the final frame), centred under the action zone and above the
 * captions' zone (LABEL_TOP to LABEL_TOP + LABEL_H), so a scene keeps its figures above LABEL_TOP while it shows.
 * Every scene that carries it puts it in the same place: across a cut it holds still.
 */
const ILLUSTRATIVE =
  "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice.";
const LABEL_TOP = 1198;
const LABEL_H = 84;
const labelCss = `
.r3-label { position:absolute; left:70px; right:70px; top:${LABEL_TOP}px; height:${LABEL_H}px; z-index:38; display:flex; align-items:center;
  justify-content:center; pointer-events:none; }
.r3-label p { margin:0; max-width:900px; text-align:center; text-wrap:balance; font:500 24px/1.3 var(--reel-sans); letter-spacing:.005em;
  color:#c9d1de; text-shadow:0 1px 10px rgba(2,6,14,.9), 0 0 2px rgba(2,6,14,.8); }
.r3-label b { font-weight:700; color:#e2c278; letter-spacing:.01em; }
.r3-label i { display:block; width:64px; height:2px; margin:0 auto 9px; background:linear-gradient(90deg, rgba(200,155,60,0), #d7b35f, rgba(200,155,60,0)); }
`;
const labelHtml = (id = "r3-label") =>
  `<div class="r3-label" id="${id}" style="visibility:hidden"><p><i></i><b>Illustrative example only:</b> hypothetical client, figures and assumptions. Not a credit assessment or financial advice.</p></div>`;
/**
 * The label's state: shown from `a` (faded in over 0.3 s unless `cut` says it is already up at a cut) to `b` (faded
 * out over 0.3 s unless it holds through the cut).
 */
function labelState(
  st,
  t,
  { a, b = Infinity, inAtCut = false, outAtCut = false, id = "r3-label" },
) {
  const { span, fade, EASE } = require("./motion.cjs");
  const up = inAtCut ? (t >= a ? 1 : 0) : span(t, a, a + 0.3, EASE.settle);
  const down = !Number.isFinite(b) || outAtCut ? 0 : span(t, b - 0.3, b, EASE.linear);
  st.set(`#${id}`, fade(Math.min(up, 1 - down)));
}

/**
 * The DEMO WORKSPACE label on a window itself, for when the camera is in close enough on a screen to lose the bar it
 * carries: a pill in the window's top-right corner, drawn only while the bar is mostly out of view, so a screen is
 * never seen without it and never shows it twice.
 */
const demoCss = `
.r3-demo { position:absolute; left:auto; right:0; top:0; z-index:36; transform-origin:100% 0; font:800 15px/1 var(--reel-sans); letter-spacing:.16em; color:#D7B35F;
  border:1px solid rgba(215,179,95,.55); border-radius:999px; padding:9px 14px; white-space:nowrap; pointer-events:none;
  background:rgba(6,12,24,.86); box-shadow:0 6px 18px rgba(0,0,0,.45); }
`;
const demoHtml = (id = "r3-demo") =>
  `<div class="r3-demo" id="${id}" style="visibility:hidden">DEMO WORKSPACE</div>`;
/**
 * The label's state for a window placed by placeWindow (`g`, its result): shown as the window's bar (the plate's top
 * `bar` px) leaves the view, in the window's top-right corner (through `xf`, the window's own transform, if any).
 */
function demoState(
  st,
  t,
  g,
  { opacity = 1, bar = BAR_H, xf = (p) => p, scale = 1, id = "r3-demo" } = {},
) {
  const { fade, px, clamp01, r3 } = require("./motion.cjs");
  const top = -g.oy / g.zoom;
  const shown = clamp01((top - bar * 0.35) / (bar * 0.4));
  const [x, y] = xf([g.rect[0] + g.rect[2] - g.pad - 16 * scale, g.rect[1] + g.pad + 16 * scale]);
  st.set(`#${id}`, {
    right: px(1080 - x),
    top: px(y),
    transform: `scale(${r3(scale)})`,
    ...fade(opacity * shown),
  });
}

/** A dollar figure as the product prints it: $1,049,786. */
const dollars = (v) => `$${Math.round(v).toLocaleString("en-AU")}`;
/**
 * A figure counting up to `value` over [a, b]: its digits run on ease-settle, so it slows into the engine's own value,
 * and the last 3% of the time it holds exactly that. `format` prints it (dollars by default).
 */
function countUp(t, value, a, b, format = dollars) {
  const { span, EASE } = require("./motion.cjs");
  const p = span(t, a, a + (b - a) * 0.97, EASE.settle);
  return format(p >= 1 ? value : value * p);
}

module.exports = {
  SCREENS,
  screen,
  region,
  centre,
  BAR_H,
  barCss,
  barHtml,
  screenPlate,
  ILLUSTRATIVE,
  LABEL_TOP,
  LABEL_H,
  labelCss,
  labelHtml,
  labelState,
  demoCss,
  demoHtml,
  demoState,
  dollars,
  countUp,
};
