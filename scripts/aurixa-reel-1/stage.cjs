// G-STAGE for the brand's arrival (04.1 to 05.1): the site's own floor in depth, windows that stand over it with a
// shadow under them, depth of field on what is not the subject, and the light the brand arrives in.
//  - The floor is the site's grid-forward keyframe (aurixa-systems src/index.css: perspective(1000px)
//    rotateX(70deg)) laid under its framework visual's dot field (radial-gradient(rgba(94,221,232,.2) .7px, ...)
//    at 22 px, drawn at the kit's K) and its diligence grid's faint lines, fading into a horizon glow in the
//    prism cyan.
//  - A window is turned in depth by a transform on its own element (perspective, rotateY, rotateX, scale), so a
//    pointer or focus corners placed inside it turn with it, as on a real screen.
//  - The light is the site's: the traveller's gold (#f5d17a, its glow #d7b35f) and the focus cyan (#5edde8).
const M = require("./motion.cjs");
const { px, r3, fade, KIT } = M;

/** The site's floor: its grid-forward perspective and tilt. */
const FLOOR = { perspective: 1000, tilt: 70 };
/** How far above the perspective origin a plane tilted by FLOOR.tilt converges, in frame px. */
const CONVERGE =
  (FLOOR.perspective * Math.cos((FLOOR.tilt * Math.PI) / 180)) /
  Math.sin((FLOOR.tilt * Math.PI) / 180);
const DOT = 22 * KIT.K; // the dot field's pitch at the kit's K

const CSS = `<style>
.st-floor-wrap { position:absolute; inset:0; perspective:${FLOOR.perspective}px; overflow:hidden; pointer-events:none; }
.st-plane { position:absolute; left:-1800px; width:4680px; top:-1080px; height:3200px; transform-origin:50% 100%;
  transform:rotateX(${FLOOR.tilt}deg);
  background-image:
    radial-gradient(rgba(94,221,232,.62) 1.5px, transparent 2.1px),
    linear-gradient(rgba(94,221,232,.085) 2px, transparent 2px),
    linear-gradient(90deg, rgba(94,221,232,.085) 2px, transparent 2px);
  background-size:${DOT}px ${DOT}px, ${DOT * 4}px ${DOT * 4}px, ${DOT * 4}px ${DOT * 4}px;
  -webkit-mask-image:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.18) 30%, rgba(0,0,0,.75) 62%, #000 82%);
  mask-image:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.18) 30%, rgba(0,0,0,.75) 62%, #000 82%); }
.st-haze { position:absolute; left:-200px; right:-200px; height:900px; margin-top:-450px;
  background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,168,181,.16) 0%, rgba(16,35,61,.55) 34%, rgba(4,11,22,0) 72%); }
.st-sky { position:absolute; inset:0; background:radial-gradient(ellipse 85% 46% at 50% 38%, rgba(16,35,61,.9) 0%, rgba(10,25,47,.5) 46%, rgba(4,11,22,0) 78%); }
.st-shadow { position:absolute; border-radius:50%; background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,.62) 0%, rgba(0,0,0,.34) 45%, rgba(0,0,0,0) 72%); pointer-events:none; }
.st-glint { position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.10) 48%, rgba(245,209,122,.10) 52%, rgba(255,255,255,0) 62%) no-repeat;
  background-size:260% 100%; mix-blend-mode:screen; }
.st-label { position:absolute; left:0; right:0; text-align:center; pointer-events:none; }
.st-label .n { display:block; font:700 22px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.32em; padding-left:.32em; color:var(--reel-ink-muted); }
.st-label .t { display:block; margin-top:14px; font:700 52px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.26em; padding-left:.26em;
  color:var(--reel-gold-ink); text-transform:uppercase; white-space:nowrap; text-shadow:0 0 28px rgba(215,179,95,.28); }
.st-label.teal .t { color:#22c3ce; text-shadow:0 0 28px rgba(0,168,181,.35); }
.st-label .r { display:block; margin:18px auto 0; width:220px; height:2px; background:var(--reel-hairline); box-shadow:0 0 14px #d7b35f; transform-origin:50% 50%; }
.st-label.teal .r { background:#00a8b5; box-shadow:0 0 14px rgba(0,168,181,.8); }
.st-bloom { position:absolute; border-radius:50%; mix-blend-mode:screen; pointer-events:none;
  background:radial-gradient(circle, rgba(255,246,222,.95) 0%, rgba(245,209,122,.62) 14%, rgba(200,155,60,.22) 36%, rgba(200,155,60,0) 66%); }
.st-shock { position:absolute; border-radius:50%; mix-blend-mode:screen; pointer-events:none;
  background:radial-gradient(circle, rgba(245,209,122,0) 64%, rgba(245,209,122,.22) 67%, rgba(255,240,205,.8) 69.5%, rgba(245,209,122,.2) 72%, rgba(245,209,122,0) 75%); }
.st-streak { position:absolute; left:-240px; right:-240px; height:10px; margin-top:-5px; mix-blend-mode:screen; pointer-events:none;
  background:linear-gradient(90deg, rgba(245,209,122,0) 0%, rgba(245,209,122,.55) 30%, rgba(255,246,222,1) 50%, rgba(245,209,122,.55) 70%, rgba(245,209,122,0) 100%);
  filter:blur(2px); }
.st-line { position:absolute; left:0; top:0; height:2px; transform-origin:0 50%; pointer-events:none;
  background:linear-gradient(90deg, rgba(94,221,232,0) 0%, #5edde8 14%, #c89b3c 86%, rgba(200,155,60,0) 100%); }
.st-dot { position:absolute; left:0; top:0; width:12px; height:12px; margin:-6px 0 0 -6px; border-radius:50%; background:#f5d17a; box-shadow:0 0 28px #d7b35f, 0 0 8px #fff3d6; pointer-events:none; }
</style>`;

/** The stage's own styles: once in a scene's page. */
const stageCss = () => CSS;

/** The site's ground under the stage: its navy, a deep glow above the horizon, the floor and its haze. */
const floorHtml = (id = "floor", z = 0) =>
  `<div id="${id}" class="fk-layer" style="z-index:${z}"><div class="st-sky"></div>` +
  `<div class="st-floor-wrap" id="${id}-wrap"><div class="st-plane" id="${id}-plane"></div></div>` +
  `<div class="st-haze" id="${id}-haze"></div></div>`;

/**
 * The floor's state: where it converges (`horizon`, frame px), how far it has travelled toward the viewer
 * (`flow`, frame px along the floor: a camera moving in makes it flow toward the viewer), and how much of it shows.
 */
function floorState(st, id, { horizon = 760, flow = 0, opacity = 1 }) {
  st.set(`#${id}-wrap`, { "perspective-origin": `540px ${px(horizon + CONVERGE)}` });
  const y = ((flow % DOT) + DOT) % DOT;
  st.set(`#${id}-plane`, {
    "background-position": `0 ${px(y)}, 0 ${px(((flow % (DOT * 4)) + DOT * 4) % (DOT * 4))}, 0 0`,
  });
  st.set(`#${id}-haze`, { top: px(horizon) });
  st.set(`#${id}`, fade(opacity));
}

/** A window's turn in depth, about its own centre. */
const turn = ({ ry = 0, rx = 0, s = 1, persp = 2200 } = {}) =>
  `perspective(${persp}px) rotateY(${r3(ry)}deg) rotateX(${r3(rx)}deg) scale(${s.toFixed(5)})`;

/** A soft contact shadow on the floor under a window: its centre x, the window's foot, its width. */
const shadowHtml = (id, z = 1) =>
  `<div class="st-shadow" id="${id}" style="z-index:${z};left:0;top:0;width:100px;height:20px;visibility:hidden"></div>`;
function shadowState(st, id, { cx, foot, width, opacity = 1, lift = 46 }) {
  const w = width * 0.92;
  const h = Math.max(24, width * 0.085);
  st.set(`#${id}`, {
    transform: `translate(${px(cx - w / 2)}, ${px(foot + lift - h / 2)})`,
    width: px(w),
    height: px(h),
    ...fade(opacity),
  });
}

/** Depth of field: a layer that is not the subject, softened (blur px) and dimmed by its veil. */
const soften = (b) => (b > 0.05 ? `blur(${r3(b)}px)` : "none");

/** A line of light from a to b (frame px), drawn to `drawn` of its length. */
function lineState(st, id, a, b, { drawn = 1, opacity = 1 } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  st.set(`#${id}`, {
    width: px(Math.max(0, len)),
    transform: `translate(${px(a[0])}, ${px(a[1])}) rotate(${angle.toFixed(3)}deg) scaleX(${r3(Math.max(0, Math.min(1, drawn)))})`,
    ...fade(drawn > 0.001 ? opacity : 0),
  });
}
const lineHtml = (id, z = 2) =>
  `<div class="st-line" id="${id}" style="z-index:${z};visibility:hidden"></div>`;
const dotHtml = (id, z = 3) =>
  `<div class="st-dot" id="${id}" style="z-index:${z};visibility:hidden"></div>`;

/** Inserts `inner` into a window's own element (windowHtml's .fk-win), after its page: it turns with the window. */
const intoWindow = (windowHtmlString, inner) => {
  const i = windowHtmlString.lastIndexOf("</div>");
  return windowHtmlString.slice(0, i) + inner + windowHtmlString.slice(i);
};
/** A point of a window's plate (through placeWindow's map) in the window's own coordinates (inside its border). */
const local = (g, rect, p) => {
  const [x, y] = g.map(p);
  return [x - rect[0] - KIT.K, y - rect[1] - KIT.K];
};

module.exports = {
  FLOOR,
  CONVERGE,
  stageCss,
  floorHtml,
  floorState,
  turn,
  shadowHtml,
  shadowState,
  soften,
  lineState,
  lineHtml,
  dotHtml,
  intoWindow,
  local,
};
