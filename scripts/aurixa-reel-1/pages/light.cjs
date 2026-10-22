// Light for Reel 1's arrivals (third cut): the dawn the brand rises in (G-SUNRISE, 10.1, and the ground 10.2's
// logo leaps from), and the light an arrival throws (G-LOGO-JUMP's burst, the press's ripple, the closing card's
// slam). Everything is drawn in the brand's own colours: the ground #040B16 and page navy #0A192F, the gold
// #C89B3C, its ink #D7B35F, the traveller's light #F5D17A and its glow, the focus cyan #5EDDE8 and the cyan
// #00A8B5 (aurixa-systems src/index.css, as aurixa-reel.css records them). Nothing here is footage: it is CSS
// and SVG, set frame by frame like every other layer, so it holds at any frame and moves only on the brand's
// curves. The perspective floor is the site's own grid-forward (perspective(1000px) rotateX(70deg), a grid
// moving toward the viewer), drawn as lines projected here so it stays crisp at any size.
const M = require("../motion.cjs");

const { EASE, span, lerp, r3, px, fade, clamp01 } = M;

const W = 1080;
const H = 1920;
const GOLD = "#C89B3C";
const GOLD_INK = "#D7B35F";
const GOLD_LIGHT = "#F5D17A";
const CYAN = "#5EDDE8";

/** A seeded random stream, so the stars and the sparks fall the same on every render. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the floor: grid-forward, projected
/**
 * The site's grid-forward floor below a horizon, as one SVG path: rows that come toward the viewer as `travel`
 * grows (one row a unit) and lines running into the distance, all meeting at the centre of the horizon. A row
 * at depth z (rows) lies at horizon + depth * zb / z, so the nearest, at zb, is at the frame's foot; the lines
 * are `gap` px apart at the foot.
 */
function floorPath(
  horizon,
  travel,
  { gap = 150, zb = 2.2, rows = 130, cells = 16, height = H } = {},
) {
  const depth = height - horizon;
  const segs = [];
  const frac = travel - Math.floor(travel);
  for (let k = -1; k < rows; k++) {
    const z = zb + k + (1 - frac);
    if (z <= 0.05) continue;
    const y = horizon + (depth * zb) / z;
    if (y > height + 4) continue;
    segs.push(`M0 ${r3(y)}H${W}`);
  }
  const yEnd = height + 80;
  const s = (yEnd - horizon) / depth;
  for (let c = -cells; c <= cells; c++)
    segs.push(`M${W / 2} ${r3(horizon)}L${r3(W / 2 + c * gap * s)} ${r3(yEnd)}`);
  return segs.join("");
}

// ------------------------------------------------------------------ the dawn (G-SUNRISE)
const SUN_R = 112;
/** The reach of the sun's glow, the drawing's radius. */
const SUN_G = 520;
const smooth = (x) => x * x * (3 - 2 * x);
/** Where the dawn stands at time t (10.1's clock; 10.2 carries it on): the horizon, the sun, how far up. */
function dawnAt(t, t0) {
  const u = t - t0; // seconds into 10.1
  // One slow rise with the sun: the camera tilts up as the sun climbs, so the horizon sinks in the frame.
  const horizon = 1188 + 74 * smooth(clamp01(u / 2.9));
  // The sun: its edge at the horizon at the cut, clear of it 1.3 s in, slowing to rest just as 10.2 begins,
  // where the logo leaps out of it.
  const rise = smooth(clamp01(u / 2.85));
  const lift = lerp(-SUN_R * 0.82, SUN_R * 2.9, rise);
  const sunY = horizon - lift;
  // How clear of the horizon (0: its edge; 1: wholly above), which is how lit the sky is.
  const clear = clamp01((lift + SUN_R) / (2 * SUN_R));
  return { horizon, sunX: W / 2, sunY, clear, rise };
}

const dawnCss = `
.dw-sky, .dw-stars, .dw-rays, .dw-floor, .dw-reflect, .dw-haze, .dw-flare, .dw-sunclip { position:absolute; left:0; top:0; width:${W}px; }
.dw-sky { height:${H}px; }
.dw-sunclip { overflow:hidden; }
/* The sun and its glow are one gradient, never a box-shadow: Chromium draws a blur that wide in tiles, and the
   tiles' edges showed as rectangles of light about the sun. */
.dw-sun { position:absolute; width:${2 * SUN_G}px; height:${2 * SUN_G}px; border-radius:50%;
  background:radial-gradient(circle at 50% 50%, #fffefa 0px, #fffbef ${SUN_R * 0.6}px, #fff5dc ${SUN_R * 0.9}px, #ffefc9 ${SUN_R - 1}px,
    rgba(255,234,184,.93) ${SUN_R + 2}px, rgba(255,230,172,.66) ${SUN_R + 26}px, rgba(245,209,122,.40) ${SUN_R + 74}px,
    rgba(232,182,98,.19) ${SUN_R + 160}px, rgba(214,150,80,.07) ${SUN_R + 270}px, rgba(200,130,70,0) ${SUN_G}px); }
.dw-rays { height:${H}px; overflow:hidden; }
/* God rays, two wheels of irregular spokes turning against each other, so the light breathes rather than
   standing as a star. */
.dw-rays i { position:absolute; width:2600px; height:2600px; border-radius:50%;
  -webkit-mask-image:radial-gradient(circle, #000 0%, rgba(0,0,0,.5) 9%, rgba(0,0,0,.16) 21%, transparent 35%);
  mask-image:radial-gradient(circle, #000 0%, rgba(0,0,0,.5) 9%, rgba(0,0,0,.16) 21%, transparent 35%); }
.dw-rays i.a { background:repeating-conic-gradient(from 0deg, rgba(255,232,170,0) 0deg 4deg, rgba(255,232,170,.15) 6deg 7.5deg, rgba(255,232,170,0) 10deg 17deg); }
.dw-rays i.b { background:repeating-conic-gradient(from 5deg, rgba(255,242,205,0) 0deg 3deg, rgba(255,242,205,.09) 4deg 6deg, rgba(255,242,205,0) 8deg 11deg); }
.dw-line { position:absolute; left:0; width:${W}px; height:3px; z-index:6;
  background:linear-gradient(90deg, transparent, ${GOLD} 12%, ${GOLD_INK} 50%, ${GOLD} 88%, transparent); box-shadow:0 0 18px rgba(215,179,95,.75); }
.dw-glint { position:absolute; width:900px; height:70px; z-index:7; border-radius:50%;
  background:radial-gradient(closest-side, rgba(255,246,220,.95), rgba(245,209,122,.55) 35%, rgba(215,179,95,.12) 70%, transparent); }
.dw-floor { overflow:hidden; z-index:4; }
.dw-floor svg { position:absolute; left:0; top:0; }
.dw-reflect { z-index:5; overflow:hidden; }
.dw-reflect i { position:absolute; width:300px; left:${W / 2 - 150}px; top:0;
  background:linear-gradient(180deg, rgba(255,232,176,.8) 0%, rgba(245,209,122,.36) 18%, rgba(200,155,60,.12) 55%, transparent 100%);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 38%, #000 62%, transparent); mask-image:linear-gradient(90deg, transparent, #000 38%, #000 62%, transparent); }
.dw-reflect u { position:absolute; left:${W / 2 - 520}px; top:-90px; width:1040px; height:300px; border-radius:50%; text-decoration:none;
  background:radial-gradient(closest-side, rgba(245,209,122,.32), rgba(200,155,60,.10) 55%, transparent); }
.dw-flare { height:${H}px; z-index:8; pointer-events:none; mix-blend-mode:screen; }
.dw-flare b { position:absolute; left:-200px; width:${W + 400}px; height:10px; border-radius:50%;
  background:linear-gradient(90deg, transparent 0%, rgba(245,209,122,.10) 18%, rgba(255,240,200,.85) 50%, rgba(245,209,122,.10) 82%, transparent 100%); filter:blur(1.5px); }
.dw-flare u { position:absolute; border-radius:50%; text-decoration:none; }
`;

/** The dawn's layers (z 0 to 8), ids prefixed `p`. */
function dawnHtml(p = "dw") {
  const rnd = seeded(1726);
  const stars = Array.from({ length: 140 }, () => {
    const x = rnd() * W;
    const y = rnd() * 1100;
    const r = 0.6 + rnd() * 1.6;
    const o = 0.25 + rnd() * 0.6;
    return `<circle cx="${r3(x)}" cy="${r3(y)}" r="${r3(r)}" fill="#E8F1FF" opacity="${r3(o)}"/>`;
  }).join("");
  const ghosts = [
    [0.35, 40, "rgba(94,221,232,.10)"],
    [0.62, 18, "rgba(245,209,122,.16)"],
    [1.25, 70, "rgba(94,221,232,.06)"],
    [1.6, 28, "rgba(245,209,122,.10)"],
  ]
    .map(
      ([, d, c], i) =>
        `<u id="${p}-gh${i}" style="width:${d * 2}px;height:${d * 2}px;background:radial-gradient(circle, ${c}, transparent 70%)"></u>`,
    )
    .join("");
  return [
    `<div class="dw-sky" id="${p}-sky" style="z-index:0"></div>`,
    `<svg class="dw-stars" id="${p}-stars" width="${W}" height="1100" style="z-index:1">${stars}</svg>`,
    `<div class="dw-rays" id="${p}-raysclip" style="z-index:2"><i class="a" id="${p}-rays"></i><i class="b" id="${p}-rays2"></i></div>`,
    `<div class="dw-sunclip" id="${p}-sunclip" style="z-index:3"><div class="dw-sun" id="${p}-sun"></div></div>`,
    `<div class="dw-floor" id="${p}-floor"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path id="${p}-grid" fill="none" stroke="${CYAN}" stroke-opacity=".5" stroke-width="1.6"/></svg></div>`,
    `<div class="dw-reflect" id="${p}-reflect"><u></u><i id="${p}-ref"></i></div>`,
    `<div class="dw-line" id="${p}-line"></div><div class="dw-glint" id="${p}-glint"></div>`,
    `<div class="dw-flare" id="${p}-flare"><b id="${p}-streak"></b>${ghosts}</div>`,
  ].join("");
}

/**
 * The dawn at t (10.1's clock, `t0` its start). `o` scales the whole of it; `sun` the sun, its rays, its flare
 * and its road on the floor (10.2 flares it as the logo leaps out of it, then lets it go); `sky` the light it
 * throws on the sky (by default the sun's); `burst` throws the rays out (a bar's accent); `drop` moves the
 * whole down by px.
 */
function dawnState(st, t, p, { t0, o = 1, sun = 1, sky = sun, burst = 0, drop = 0 } = {}) {
  const d = dawnAt(t, t0);
  const horizon = d.horizon + drop;
  const sunY = d.sunY + drop;
  const warm = d.clear; // the sky warms as the sun clears
  // The sky: the brand's night, kept navy overhead; gold gathers about the sun and along the horizon as it
  // clears (the sun's own glow, then a band of light lying on the horizon), never a brown wash over the frame.
  // Gold over navy at a low alpha mixes to khaki, so the warmth is kept strong where it is and passes to the
  // night through a deep rose, as a dawn sky does, rather than thinning out across the frame.
  const core = r3(Math.min(1, 0.92 * sky));
  const near = r3(Math.min(1, (0.32 + 0.45 * warm) * sky));
  const mid = r3(Math.min(1, (0.14 + 0.2 * warm) * sky));
  const far = r3(Math.min(1, (0.05 + 0.1 * warm) * sky));
  const hz1 = r3(Math.min(1, (0.3 + 0.5 * warm) * sky));
  const hz2 = r3(Math.min(1, (0.12 + 0.26 * warm) * sky));
  const hz3 = r3(Math.min(1, (0.05 + 0.14 * warm) * sky));
  // Below the horizon the ground holds the light back: a thin haze on the line, then the night floor.
  const BELOW = `linear-gradient(180deg, rgba(4,11,22,0) ${r3(horizon)}px, rgba(4,11,22,.42) ${r3(horizon + 1)}px, rgba(4,11,22,.7) ${r3(horizon + 70)}px, rgba(4,11,22,.82) ${r3(horizon + 260)}px), `;
  st.set(`#${p}-sky`, {
    background:
      BELOW +
      `radial-gradient(circle at ${W / 2}px ${r3(sunY)}px, rgba(255,248,228,${core}) 0px, rgba(255,226,160,${near}) ${r3(110 + 30 * warm)}px, rgba(242,172,84,${mid}) ${r3(250 + 60 * warm)}px, rgba(176,92,74,${far}) ${r3(420 + 110 * warm)}px, rgba(120,60,92,0) ${r3(660 + 160 * warm)}px), ` +
      `radial-gradient(ellipse 900px ${r3(170 + 130 * warm)}px at ${W / 2}px ${r3(horizon)}px, rgba(248,184,96,${hz1}) 0%, rgba(214,124,64,${hz2}) 38%, rgba(118,58,92,${hz3}) 70%, rgba(60,40,90,0) 100%), ` +
      `linear-gradient(180deg, #030914 0px, #05101f ${r3(horizon * 0.35)}px, #0A192F ${r3(horizon * 0.72)}px, #112848 ${r3(horizon - 2)}px, #0b1a33 ${r3(horizon + 2)}px, #060f1f ${r3(horizon + 300)}px, #040B16 ${H}px)`,
    ...fade(o),
  });
  st.set(`#${p}-stars`, fade(o * (1 - 0.8 * warm)));
  // The sun, clipped at the horizon, and its rays (wheeling slowly, brighter as it clears, a burst on the bar).
  st.set(`#${p}-sunclip`, { height: px(horizon), ...fade(o) });
  st.set(`#${p}-sun`, {
    transform: `translate(${px(d.sunX - SUN_G)}, ${px(sunY - SUN_G)}) scale(${r3(sun)})`,
    ...fade(sun > 0.001 ? 1 : 0),
  });
  st.set(`#${p}-raysclip`, {
    height: px(horizon),
    ...fade(o * sun * clamp01(0.2 + 0.8 * warm + 0.7 * burst)),
  });
  const reach = 0.78 + 0.3 * warm + 0.32 * burst;
  st.set(`#${p}-rays`, {
    transform: `translate(${px(d.sunX - 1300)}, ${px(sunY - 1300)}) rotate(${r3(8 + (t - t0) * 5.5)}deg) scale(${r3(reach)})`,
  });
  st.set(`#${p}-rays2`, {
    transform: `translate(${px(d.sunX - 1300)}, ${px(sunY - 1300)}) rotate(${r3(-3 - (t - t0) * 3.2)}deg) scale(${r3(reach * 1.08)})`,
  });
  // The floor: grid-forward, the lines moving toward the viewer; the sun's road on it.
  st.set(`#${p}-floor`, { top: "0px", height: px(H), ...fade(o) });
  st.set(`#${p}-grid`, { d: `path("${floorPath(horizon, (t - t0) * 0.55)}")` });
  st.set(`#${p}-floor svg`, {
    "-webkit-mask-image": `linear-gradient(180deg, transparent ${r3(horizon)}px, rgba(0,0,0,.14) ${r3(horizon + 16)}px, rgba(0,0,0,.5) ${r3(horizon + 90)}px, #000 ${r3(horizon + 300)}px)`,
    "mask-image": `linear-gradient(180deg, transparent ${r3(horizon)}px, rgba(0,0,0,.14) ${r3(horizon + 16)}px, rgba(0,0,0,.5) ${r3(horizon + 90)}px, #000 ${r3(horizon + 300)}px)`,
  });
  st.set(`#${p}-reflect`, {
    top: px(horizon),
    height: px(H - horizon),
    ...fade(o * sun * clamp01(0.3 + warm)),
  });
  st.set(`#${p}-ref`, { height: px(H - horizon), transform: `scaleX(${r3(0.7 + 0.5 * warm)})` });
  // The horizon: the gold hairline, a glint where the sun meets it.
  st.set(`#${p}-line`, { top: px(horizon - 1.5), ...fade(o) });
  const glint = clamp01(1 - Math.abs(sunY - horizon) / (SUN_R * 3.2));
  st.set(`#${p}-glint`, {
    transform: `translate(${px(W / 2 - 450)}, ${px(horizon - 35)}) scaleX(${r3(0.6 + 0.6 * glint)})`,
    ...fade(o * sun * clamp01(0.35 + 0.9 * glint)),
  });
  // The flare: an anamorphic streak through the sun, and its ghosts on the line through the frame's centre.
  st.set(`#${p}-flare`, fade(o * sun * clamp01(0.15 + 0.85 * warm + 0.5 * burst)));
  st.set(`#${p}-streak`, {
    transform: `translateY(${px(sunY - 5)}) scaleX(${r3(0.8 + 0.4 * warm + 0.4 * burst)})`,
    opacity: r3(clamp01(0.55 + 0.45 * burst)),
  });
  [0.35, 0.62, 1.25, 1.6].forEach((k, i) => {
    const d0 = [40, 18, 70, 28][i];
    // Ghosts lie on a line from the light through the lens's centre. With the sun at the frame's centre that
    // line would put every ghost on the sun, so it runs down and to the right of it instead.
    const gx = d.sunX + 200 * k;
    const gy = sunY + 520 * k;
    st.set(`#${p}-gh${i}`, { transform: `translate(${px(gx - d0)}, ${px(gy - d0)})` });
  });
  return { ...d, horizon, sunY };
}

// ------------------------------------------------------------------ an arrival's light
const burstCss = `
.lt-flash { position:absolute; inset:0; pointer-events:none; }
.lt-ring { position:absolute; left:0; top:0; border-radius:50%; pointer-events:none; }
.lt-burst { position:absolute; left:0; top:0; width:2400px; height:2400px; border-radius:50%; pointer-events:none;
  background:repeating-conic-gradient(from 0deg, rgba(255,236,190,0) 0deg 6deg, rgba(255,236,190,.5) 7.5deg 8.5deg, rgba(255,236,190,0) 10deg 14deg);
  -webkit-mask-image:radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 10%, transparent 42%); mask-image:radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 10%, transparent 42%); }
.lt-spark { position:absolute; left:0; top:0; border-radius:50%; pointer-events:none; }
`;

/** A flash, a shock ring (or two), a burst of rays and sparks, ids prefixed `p`, `sparks` of them. */
function burstHtml(p, { z = 30, sparks = 36, rings = 2 } = {}) {
  const sp = Array.from(
    { length: sparks },
    (_, i) => `<i class="lt-spark" id="${p}-s${i}" style="visibility:hidden"></i>`,
  ).join("");
  const rg = Array.from(
    { length: rings },
    (_, i) => `<div class="lt-ring" id="${p}-r${i}" style="visibility:hidden"></div>`,
  ).join("");
  return `<div class="fk-layer" id="${p}" style="z-index:${z};pointer-events:none"><div class="lt-burst" id="${p}-b" style="visibility:hidden"></div>${rg}${sp}<div class="lt-flash" id="${p}-f" style="visibility:hidden"></div></div>`;
}

/**
 * The burst at t, struck at `at` from the point `c`: the flash (`flash` its strength, `fr` its reach, gold-white),
 * rings growing to `reach` px, rays, and sparks flying out `spread` px. Nothing shows before `at`.
 */
function burstState(
  st,
  t,
  p,
  {
    at,
    c,
    flash = 0.85,
    reach = 1300,
    spread = 520,
    sparks = 36,
    rings = 2,
    ray = 1,
    ringColour = GOLD_LIGHT,
    seed = 7,
    fr = 1,
  },
) {
  const u = t - at;
  const on = u >= 0;
  // The flash: up at once, down over 0.3 s, centred on the strike; white at its heart and amber at its edge
  // (gold thinned over the navy turns khaki, so it never thins out across the frame in gold).
  const f = on ? Math.exp(-u / 0.1) * flash : 0;
  st.set(`#${p}-f`, {
    background: `radial-gradient(circle at ${px(c[0])} ${px(c[1])}, rgba(255,252,242,${r3(f)}) 0px, rgba(255,234,186,${r3(f * 0.66)}) ${r3(230 * fr)}px, rgba(244,184,108,${r3(f * 0.26)}) ${r3(540 * fr)}px, rgba(170,96,92,${r3(f * 0.08)}) ${r3(860 * fr)}px, rgba(10,25,47,0) ${r3(1150 * fr)}px)`,
    ...fade(f > 0.004 ? 1 : 0),
  });
  // The rays: they open out and fade.
  const rb = on ? span(u, 0, 0.75, EASE.settle) : 0;
  st.set(`#${p}-b`, {
    transform: `translate(${px(c[0] - 1200)}, ${px(c[1] - 1200)}) rotate(${r3(14 + 22 * rb)}deg) scale(${r3(0.25 + 0.95 * rb)})`,
    ...fade(on ? ray * (1 - span(u, 0.1, 0.8, EASE.move)) : 0),
  });
  // The rings: the first quick and bright, the second slower and fainter.
  for (let i = 0; i < rings; i++) {
    const d0 = 0.06 + i * 0.12;
    const dur = 0.7 + i * 0.35;
    const v = on ? span(u, d0, d0 + dur, EASE.settle) : 0;
    const r = lerp(40, reach * (1 - i * 0.18), v);
    const w = lerp(10, 2, v) * (i ? 0.8 : 1);
    const a = on && u >= d0 ? (1 - v) * (i ? 0.55 : 0.9) : 0;
    st.set(`#${p}-r${i}`, {
      transform: `translate(${px(c[0] - r)}, ${px(c[1] - r)})`,
      width: px(2 * r),
      height: px(2 * r),
      border: `${r3(w)}px solid ${i ? "rgba(94,221,232,.9)" : ringColour}`,
      "box-shadow": `0 0 ${r3(26 * (1 - v) + 4)}px ${i ? "rgba(94,221,232,.6)" : "rgba(245,209,122,.75)"}, inset 0 0 ${r3(22 * (1 - v) + 2)}px ${i ? "rgba(94,221,232,.35)" : "rgba(245,209,122,.45)"}`,
      ...fade(a),
    });
  }
  // The sparks: each its own direction, speed and size, slowing as it flies, fading as it goes.
  const rnd = seeded(seed);
  for (let i = 0; i < sparks; i++) {
    const ang = rnd() * Math.PI * 2;
    const sp = spread * (0.45 + 0.75 * rnd());
    const size = 3 + rnd() * 6;
    const life = 0.55 + 0.6 * rnd();
    const lag = rnd() * 0.06;
    const v = on ? clamp01((u - lag) / life) : 0;
    const dist = sp * (1 - (1 - v) ** 3);
    const x = c[0] + Math.cos(ang) * dist;
    const y = c[1] + Math.sin(ang) * dist;
    const a = on && u >= lag ? (1 - v) ** 1.4 : 0;
    const col = i % 4 === 0 ? CYAN : i % 3 === 0 ? "#FFFFFF" : GOLD_LIGHT;
    st.set(`#${p}-s${i}`, {
      transform: `translate(${px(x - size / 2)}, ${px(y - size / 2)})`,
      width: px(size),
      height: px(size),
      background: col,
      "box-shadow": `0 0 ${r3(size * 2.5)}px ${col}`,
      ...fade(a),
    });
  }
}

/** The light a press throws across a card: a ripple of the focus cyan and gold from the point pressed. */
function rippleHtml(p, z = 26) {
  return `<div class="fk-layer" id="${p}" style="z-index:${z};pointer-events:none;overflow:hidden"><div class="lt-ring" id="${p}-a" style="visibility:hidden"></div><div class="lt-ring" id="${p}-b" style="visibility:hidden"></div><div class="lt-flash" id="${p}-w" style="visibility:hidden"></div></div>`;
}
function rippleState(st, t, p, { at, c, reach = 1500 }) {
  const u = t - at;
  const on = u >= 0;
  [
    ["a", 0, 0.95, "rgba(94,221,232,", 0.85],
    ["b", 0.08, 1.25, "rgba(245,209,122,", 0.6],
  ].forEach(([k, d0, dur, col, peak]) => {
    const v = on ? span(u, d0, d0 + dur, EASE.settle) : 0;
    const r = lerp(30, reach, v);
    const a = on && u >= d0 ? (1 - v) * peak : 0;
    st.set(`#${p}-${k}`, {
      transform: `translate(${px(c[0] - r)}, ${px(c[1] - r)})`,
      width: px(2 * r),
      height: px(2 * r),
      border: `${r3(lerp(6, 1.5, v))}px solid ${col}1)`,
      background: `radial-gradient(circle, ${col}0) 55%, ${col}${r3(0.12 * (1 - v))}) 92%, ${col}0) 100%)`,
      "box-shadow": `0 0 ${r3(30 * (1 - v) + 6)}px ${col}.55)`,
      ...fade(a),
    });
  });
  const w = on ? Math.exp(-u / 0.16) * 0.35 : 0;
  st.set(`#${p}-w`, {
    background: `radial-gradient(circle at ${px(c[0])} ${px(c[1])}, rgba(200,250,255,${r3(w)}), rgba(94,221,232,${r3(w * 0.4)}) 300px, transparent 760px)`,
    ...fade(w > 0.004 ? 1 : 0),
  });
}

module.exports = {
  W,
  H,
  GOLD,
  GOLD_INK,
  GOLD_LIGHT,
  CYAN,
  SUN_R,
  SUN_G,
  seeded,
  floorPath,
  dawnAt,
  dawnCss,
  dawnHtml,
  dawnState,
  burstCss,
  burstHtml,
  burstState,
  rippleHtml,
  rippleState,
};
