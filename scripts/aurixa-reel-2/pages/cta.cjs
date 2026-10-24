// G-CTA, the button alive: Reel 1's (../../aurixa-reel-1/pages/cta.cjs, the site's prismatic START YOUR FREE TRIAL,
// drawn from aurixa-systems src/index.css .btn-chrome-prismatic), on Reel 2's clock. Its beats are the music's
// (pacing.json's grid) once the music is fitted; until then the plan's tempo, 120 BPM, counted from the first drop
// (03.1's cut), so a press still lands on a beat of the grid the music will have.
// Every part is set frame by frame (the renderer stops CSS animation), so it holds at any frame.
const M = require("../motion.cjs");
const PACE = require("../pacing.cjs");

const { EASE, span, lerp, r3, px, fade, clamp01, PRESS } = M;

const PERIOD = PACE.MUSIC?.period ?? 0.5;
const DROP = PACE.MUSIC?.film_drop ?? M.shotOf("03.1").in;
const BAR = 4 * PERIOD;
/** The last beat at or before t on the film's grid, and whether it opens a bar. */
function lastBeat(t) {
  const n = Math.floor((t - DROP) / PERIOD + 1e-6);
  return { at: DROP + n * PERIOD, n, downbeat: ((n % 4) + 4) % 4 === 0 };
}
/** The beat's light at t: up on each beat, decaying over `tau` s; a downbeat stronger. */
function beatPulse(t, { tau = 0.26, bar = 1, beat = 0.55 } = {}) {
  const b = lastBeat(t);
  return Math.exp(-(t - b.at) / tau) * (b.downbeat ? bar : beat);
}

const ARROW = `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`;

const ctaCss = `
.cta { position:absolute; left:0; top:0; transform-origin:50% 50%; }
.cta-halo { position:absolute; left:-90px; right:-90px; top:-70px; bottom:-70px; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgba(255,218,146,.6), rgba(236,166,84,.28) 42%, rgba(176,96,82,.10) 72%, rgba(120,60,90,0) 100%); }
.cta-halo i { position:absolute; inset:0; border-radius:50%;
  background:radial-gradient(closest-side, rgba(94,221,232,.40), rgba(0,168,181,.14) 55%, rgba(0,168,181,0) 100%); }
.cta-btn { position:absolute; inset:0; transform-origin:50% 50%; }
.cta-edge { position:absolute; inset:-3px; border-radius:7px; padding:3px;
  mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite:exclude; }
.cta-body { position:absolute; inset:0; border-radius:4px; overflow:hidden; border:1px solid rgba(200,155,60,.85);
  box-shadow:0 18px 40px rgba(0,0,0,.55), 0 0 30px rgba(200,155,60,.30); }
.cta-grad { position:absolute; inset:0;
  background:linear-gradient(-45deg, #111827 0%, #C89B3C 25%, #00A8B5 50%, #0A192F 75%, #111827 100%); background-size:300% 300%; }
.cta-pulse { position:absolute; inset:0; mix-blend-mode:screen;
  background:radial-gradient(120% 160% at 50% 50%, rgba(255,231,170,.55), rgba(255,214,130,.18) 45%, rgba(94,221,232,.10) 70%, rgba(0,0,0,0) 100%); }
.cta-depth { position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,.06) 44%, rgba(0,0,0,0) 52%, rgba(0,0,0,.26) 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.34), inset 0 -2px 0 rgba(0,0,0,.30); }
.cta-spot { position:absolute; inset:0; mix-blend-mode:screen; }
.cta-sheen { position:absolute; top:-20%; bottom:-20%; width:46%; left:0; mix-blend-mode:screen;
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.30) 50%, rgba(255,255,255,0)); transform:skewX(-18deg); }
.cta-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:26px; color:#fff;
  font-family:Inter, sans-serif; font-weight:800; text-transform:uppercase; white-space:nowrap;
  text-shadow:0 2px 4px rgba(0,0,0,.55), 0 0 22px rgba(255,255,255,.16); }
.cta-label span { padding-left:.25em; }
.cta-label svg { flex:none; overflow:visible; filter:drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
.cta-flash { position:absolute; inset:0; mix-blend-mode:screen; }
.cta-ring { position:absolute; border-radius:9px; border:2px solid #00A8B5; box-shadow:0 0 18px rgba(94,221,232,.55), inset 0 0 12px rgba(94,221,232,.3); }
`;

/** The button, `w` by `h` CSS px, its label `size` px; ids prefixed `id`. The scene places `#id`. */
function ctaHtml(
  id,
  { w = 820, h = 132, size = 30, label = "START YOUR FREE TRIAL", z = 20 } = {},
) {
  const arrow = Math.round(size * 1.05);
  return `<div class="cta" id="${id}" style="width:${w}px;height:${h}px;z-index:${z}">
  <div class="cta-halo" id="${id}-halo"><i id="${id}-cyan"></i></div>
  <div class="cta-btn" id="${id}-btn">
    <div class="cta-edge" id="${id}-edge"></div>
    <div class="cta-body">
      <div class="cta-grad" id="${id}-grad"></div>
      <div class="cta-pulse" id="${id}-pulse"></div>
      <div class="cta-depth"></div>
      <div class="cta-spot" id="${id}-spot"></div>
      <div class="cta-sheen" id="${id}-sheen"></div>
      <div class="cta-label" style="font-size:${size}px;letter-spacing:.25em"><span>${label}</span><svg id="${id}-arrow" width="${arrow}" height="${arrow}" viewBox="0 0 24 24" fill="none" stroke="url(#${id}-gold)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="${id}-gold" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#F5D17A" offset="0%"/><stop stop-color="#C89B3C" offset="50%"/><stop stop-color="#8A6B29" offset="100%"/></linearGradient></defs>${ARROW}</svg></div>
      <div class="cta-flash" id="${id}-flash"></div>
    </div>
    <div class="cta-ring" id="${id}-ring" style="visibility:hidden"></div>
  </div>
</div>`;
}

/**
 * The button's life at t, everything inside `#id` (the scene places and shows `#id` itself):
 *  - `t0`: when its gradient's clock starts (it runs a cycle a bar, the site's prism-shine quickened);
 *  - `hover` (0 to 1): the pointer over it; `hoverAt`: when it came over (the gradient quickens from then, and
 *    the site's sheen crosses it once); `ptr`: the pointer's tip in the button's own px, which it leans toward;
 *  - `press`: the time it is pressed (null: never); after it the focus ring is thrown and the flash runs out
 *    from the point pressed;
 *  - `pulse` (0 to 1): how strongly it breathes on the beats; `edge` (0 to 1): the light running round its edge,
 *    `lap` the light's angle (degrees, the scene's clock: one lap a bar by default);
 *  - `glow`: the halo's strength; `breath` (0 to 1): a slow breath in place of the beats, once the music is out.
 * Returns the button's own transform's lift and scale, for a scene that needs the pointer to ride it.
 */
function ctaState(
  st,
  t,
  id,
  {
    w = 820,
    h = 132,
    t0,
    hover = 0,
    hoverAt = Infinity,
    ptr = null,
    press = null,
    pulse = 1,
    edge = 1,
    lap = null,
    glow = 1,
    breath = 0,
  },
) {
  // The gradient: the site's 0% → 100% → 0% (ease-in-out each way), a cycle a bar; from the hover, twice as fast.
  const quick = t > hoverAt ? Math.max(0, t - hoverAt - 0.08) : 0;
  const phase = (t - t0) / BAR + quick / BAR;
  const u = phase - Math.floor(phase);
  const half = u < 0.5 ? u * 2 : (1 - u) * 2;
  // Its swing is kept to the gold-and-cyan half of the site's gradient (100% to 45%), where it pulses gold to
  // light gold to cyan and back, rather than resting on the slate the site's longer cycle passes through.
  const pos = 100 - 55 * half * half * (3 - 2 * half);
  st.set(`#${id}-grad`, { "background-position": `${r3(pos)}% 50%` });

  // The beat: pulse-glow's halo (its 0.2 → 0.8, scale 1 → 1.05) on each beat, the button's own light with it.
  // With the music rung out there are no beats to breathe on: `breath` breathes it slowly instead.
  const b = beatPulse(t) * pulse + breath * 0.5 * (1 - Math.cos((2 * Math.PI * t) / 1.4));
  const pressed = press !== null && t >= press;
  const since = pressed ? t - press : -1;
  const flare = pressed ? Math.exp(-since / 0.18) : 0;
  const haloO = clamp01((0.34 + 0.4 * b + 0.32 * hover + 0.5 * flare) * glow);
  st.set(`#${id}-halo`, {
    transform: `scale(${r3(1 + 0.05 * b + 0.06 * hover + 0.12 * flare)})`,
    ...fade(haloO),
  });
  st.set(`#${id}-cyan`, { opacity: r3(clamp01(0.25 + 0.55 * hover + 0.5 * flare)) });
  st.set(`#${id}-pulse`, { opacity: r3(clamp01(0.16 + 0.42 * b + 0.18 * hover + 0.35 * flare)) });

  // Light round the edge: a comet of traveller's light and cyan on a gold hairline.
  const ang = lap ?? ((t - t0) / BAR) * 360;
  const e = clamp01(edge);
  st.set(`#${id}-edge`, {
    background: `conic-gradient(from ${r3(ang)}deg at 50% 50%, rgba(200,155,60,${r3(0.35 * e)}) 0deg, rgba(200,155,60,${r3(0.35 * e)}) 250deg, rgba(245,209,122,${r3(0.9 * e)}) 318deg, rgba(255,255,255,${r3(e)}) 340deg, rgba(94,221,232,${r3(0.95 * e)}) 352deg, rgba(200,155,60,${r3(0.35 * e)}) 360deg)`,
    ...fade(e > 0.001 ? 1 : 0),
  });

  // Under the pointer: lifts (the site's hover scale, 1.05) and is drawn a little toward the pointer (in the
  // plane: a 3D lean leaves the drawing a frame behind its layer, and a frame went blank); the press sinks it.
  const sink = pressed ? Math.sin(Math.PI * clamp01(since / 0.24)) : 0;
  const lx = ptr ? clamp01(ptr[0] / w) * 2 - 1 : 0;
  const ly = ptr ? clamp01(ptr[1] / h) * 2 - 1 : 0;
  const scale = 1 + 0.045 * hover - 0.05 * sink;
  const lift = -8 * hover + 6 * sink;
  st.set(`#${id}-btn`, {
    transform: `translate(${px(lx * 6 * hover)}, ${px(lift + ly * 3 * hover)}) scale(${r3(scale)})`,
  });
  // The pointer's spotlight on the glass, and the arrow stepping forward (group-hover:translate-x-1).
  const [sx, sy] = ptr ?? [w / 2, h / 2];
  st.set(`#${id}-spot`, {
    background: `radial-gradient(circle at ${px(sx)} ${px(sy)}, rgba(255,255,255,.34), rgba(255,236,190,.12) 120px, rgba(255,255,255,0) 260px)`,
    ...fade(hover * 0.95),
  });
  st.set(`#${id}-arrow`, { transform: `translateX(${px(8 * hover)})` });
  // The site's sheen: once across from the hover, over 700 ms, on its ease-in-out.
  const sheen = span(t, hoverAt, hoverAt + 0.7, EASE.move);
  const shown = t >= hoverAt && sheen < 1;
  st.set(`#${id}-sheen`, {
    transform: `translateX(${px(lerp(-0.5 * w, 1.1 * w, sheen))}) skewX(-18deg)`,
    ...fade(shown ? 1 : 0),
  });

  // The press: a flash out from the point pressed, and the focus ring (ring-2 #00A8B5, its offset opening).
  st.set(`#${id}-flash`, {
    background: `radial-gradient(circle at ${px(sx)} ${px(sy)}, rgba(235,252,255,${r3(0.62 * flare)}), rgba(94,221,232,${r3(0.32 * flare)}) ${r3(140 + 400 * (1 - flare))}px, rgba(255,255,255,0) ${r3(260 + 700 * (1 - flare))}px)`,
    ...fade(flare > 0.004 ? 1 : 0),
  });
  if (pressed && since < PRESS * 2.2) {
    const v = clamp01(since / (PRESS * 2.2));
    const off = 4 + 16 * EASE.settle(v);
    st.set(`#${id}-ring`, {
      left: px(-off),
      top: px(-off),
      width: px(w + 2 * off - 4),
      height: px(h + 2 * off - 4),
      ...fade((1 - v) ** 1.2),
    });
  } else
    st.set(`#${id}-ring`, { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });
  return { lift, scale };
}

module.exports = { ctaCss, ctaHtml, ctaState, lastBeat, beatPulse, BAR, PERIOD, DROP };
