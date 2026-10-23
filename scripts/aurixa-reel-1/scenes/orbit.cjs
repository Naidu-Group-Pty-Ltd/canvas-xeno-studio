// Reel 1, shot 01.1 (third cut): somewhere in Australia, one pin turns gold.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, zoomLerp, r3, px, State, fade, captionHtml, caption, KIT, F } = M;
const { G, GOLD, PINS, globeHtml } = require("../globe.cjs");

// ------------------------------------------------------------------ the camera
const T = (i) => beat("01.1", i);
const END = M.shotOf("01.1").out;
/**
 * The slow orbit the film opens on: the whole Earth's face with Australia on it, the camera coming in at a steady
 * rate and leaning over as it drifts south-east, until the continent fills the frame in depth under the limb.
 */
const orbit = (t) => {
  const u = t / T(2);
  return {
    lon: lerp(133.6, 137.4, u),
    lat: lerp(-24.6, -29.2, u),
    dist: 12500 * (6800 / 12500) ** u,
    heading: lerp(14, 1, u),
    tilt: lerp(11, 24, u),
    fov: 40,
    at: [540, lerp(900, 860, u)],
  };
};
/** Where the fall ends, still drifting: over Sydney's north-west at the state's scale, looking inland. */
const settled = (t) => {
  const s = t - T(3);
  return {
    lon: GOLD[0],
    lat: GOLD[1],
    dist: 760 * (1 - 0.018 * s),
    heading: -24 - 1.6 * s,
    tilt: 50 + 0.5 * s,
    fov: 40,
    at: [540, 1150],
  };
};
/**
 * The camera at t: the orbit, and from the gold pin's turn one fall to the suburb, easing in. The two are mixed
 * rather than cut between, so the orbit's drift carries into the fall without a stop.
 */
function cameraAt(t) {
  const a = orbit(t);
  const b = settled(t);
  const p = span(t, T(2), T(2) + 1.55, EASE.move);
  return {
    lon: lerp(a.lon, b.lon, p),
    lat: lerp(a.lat, b.lat, p),
    dist: zoomLerp(a.dist, b.dist, p),
    heading: lerp(a.heading, b.heading, p),
    tilt: lerp(a.tilt, b.tilt, p),
    fov: 40,
    at: [lerp(a.at[0], b.at[0], p), lerp(a.at[1], b.at[1], p)],
  };
}

// ------------------------------------------------------------------ the gold pin
// It lands as one of Sydney's crowd (satellite.py: the city blooms out from its centre from 1.16 s), white.
const GOLD_LAND = 1.16 + 0.55 * (25 / 75) ** 0.8;
/** The gold pin's moment at t: its colour, how far it has risen (pin heights), its scale, glow and ring. */
function goldAt(t, cam) {
  const tg = T(2);
  const colour = span(t, tg, tg + 0.24, EASE.settle);
  const up = span(t, tg + 0.04, tg + 0.62, EASE.settle);
  // Its head opens as the card leaves it: a brief flare of its glow.
  const flare = Math.exp(-Math.max(0, t - T(3)) / 0.18) * (t >= T(3) ? 1 : 0);
  const breathe = 0.9 + 0.1 * Math.cos((t - tg) * 2.4);
  const ring = span(t, tg + 0.08, tg + 1.35, EASE.settle);
  const alt = G.altitude(cam);
  return {
    colour: r3(colour),
    rise: r3(0.55 * up),
    scale: r3(lerp(1, 1.55, up)),
    glow: r3(span(t, tg, tg + 0.4, EASE.settle) * breathe + 0.8 * flare),
    ringR: r3(70 * ring),
    ringA: r3(t < tg + 0.08 ? 0 : 0.9 * (1 - ring) ** 1.5),
    ringW: r3(Math.max(alt * 0.0011, 0.35)),
    pool: r3(0.8 * up),
    poolR: 6,
  };
}

/** The camera's camera object (globe.cjs) at t, in frame px. */
const cam = (t) => G.camera(cameraAt(t), 1080, 1920);
/** Where the gold pin's head is at t (frame px), and its height: the card stands on it. */
function goldHead(t) {
  const c = cam(t);
  const g = goldAt(t, c);
  const P = G.ll(GOLD[0], GOLD[1]);
  const [, , z] = G.project(c, P);
  const size = G.pinSize(c, z) * g.scale;
  const pose = G.pinPose(t - GOLD_LAND) ?? { lift: 0 };
  const [x, y] = G.head(c, P, size, (pose.lift + g.rise) * size);
  return { x, y, size };
}

// ------------------------------------------------------------------ the card
const CARD_W = 620;
const TAIL = 19; // how far the tail's point stands below the card
/** The card's rect on the frame at t, its tail's point on the pin's head: [x, y, w, h] (its height measured). */
function cardRect(t, h) {
  const { x, y, size } = goldHead(t);
  const tipY = y - 0.29 * size - 10;
  return [x - CARD_W / 2, tipY - TAIL - h, CARD_W, h];
}

/** What the globe draws at t (globe.cjs reads it from #globe-state): the camera, the pins' clock, the gold pin. */
function globeState(t) {
  const c = cameraAt(t);
  const camObj = G.camera(c, 1080, 1920);
  const gold = goldAt(t, camObj);
  // The rest of the pins dim a little as the gold one turns; the ground a touch too, as the card arrives.
  const dim = lerp(1, 0.5, span(t, T(2), T(2) + 0.5, EASE.settle));
  const groundDim = lerp(1, 0.86, span(t, T(3), T(3) + 0.6, EASE.settle));
  // Depth of field once the camera is low: the band round the pin sharp, the horizon and the near ground soft.
  const low = span(t, T(2) + 0.4, T(2) + 1.3, EASE.settle);
  const pinY = G.project(camObj, G.ll(GOLD[0], GOLD[1]))[1];
  return JSON.stringify({
    t: r3(t),
    cam: {
      lon: Number(c.lon.toFixed(5)),
      lat: Number(c.lat.toFixed(5)),
      dist: Number(c.dist.toFixed(3)),
      heading: Number(c.heading.toFixed(4)),
      tilt: Number(c.tilt.toFixed(4)),
      fov: c.fov,
      at: c.at.map((v) => Number(v.toFixed(3))),
    },
    dim: r3(dim),
    gold,
    dof: [r3(pinY), 380, 640, r3(1.2 * low)],
    look: [r3(lerp(1.0, 1.12, low)), r3(groundDim), 0.34, r3(lerp(1, 0.55, low))],
  });
}

// ------------------------------------------------------------------ 01.1
/**
 * The continent from orbit, the sun low in the north-west: white pins rain onto it, a few and then hundreds,
 * the towns across the country and the cities blooming out from their centres west to east, each landing with a
 * small bounce, a shadow and a ripple. One pin in Sydney's north-west turns gold, rises out of the field and
 * sends a ring out over the ground as the rest dim; the camera falls to it, and the property's card springs out
 * of its head.
 */
function orbitScene() {
  const tCard = T(3);
  const card = `<div id="card" style="position:absolute;left:0;top:0;width:${CARD_W}px;z-index:6;visibility:hidden;
    filter:drop-shadow(0 22px 34px rgba(2,8,20,.55)) drop-shadow(0 4px 10px rgba(2,8,20,.35))">${KIT.listing({
      width: CARD_W,
      chips: ["New listing · just now"],
    })}<div class="fk-tail down" style="left:${CARD_W / 2 - 14}px;bottom:-13px"></div></div>`;
  const html = () =>
    [
      globeHtml({ goldLand: GOLD_LAND, assets: F.ASSETS }),
      card,
      captionHtml(),
    ].join("");

  const state = (time, m) => {
    const st = new State();
    caption(st, time, m);
    // The globe's own clock runs at 120 drawings a second (240 while the camera falls): of a frame's eight
    // subframes only two (four) differ, and the rest reuse the drawing before. The card stands on the pin, so it
    // keeps the same clock; its spring and the captions keep the frame's own.
    const q = time > T(2) - 0.1 && time < T(2) + 1.8 ? 240 : 120;
    const t = Math.floor(time * q + 1e-6) / q;
    st.set("#globe-state", { $text: globeState(t) });
    // The card springs out of the pin's head, overshooting a little, then settles.
    const tau = time - tCard;
    const s = tau < 0 ? 0 : 1 - Math.exp(-tau / 0.13) * Math.cos((tau * 2 * Math.PI) / 0.62);
    const [x, y, , h] = cardRect(t, m.card[3]);
    st.set("#card", {
      left: px(x),
      top: px(y),
      "transform-origin": `${CARD_W / 2}px ${px(h + TAIL)}`,
      transform: `scale(${r3(Math.max(0.0001, lerp(0.08, 1, s)))})`,
      ...fade(span(time, tCard, tCard + 0.14, EASE.linear)),
    });
    return st;
  };
  return {
    id: "orbit",
    shots: ["01.1"],
    palette: "before",
    html,
    measure: { card: ["#card", ".ls-card"] },
    state,
  };
}

module.exports = orbitScene;
// For 01.2, which opens on this shot's last frame: its camera, its card and the pins' landing.
module.exports.cameraAt = cameraAt;
module.exports.globeState = globeState;
module.exports.cardRect = cardRect;
module.exports.goldAt = goldAt;
module.exports.GOLD_LAND = GOLD_LAND;
module.exports.CARD_W = CARD_W;
module.exports.TAIL = TAIL;
module.exports.END = END;
module.exports.PINS = PINS;
