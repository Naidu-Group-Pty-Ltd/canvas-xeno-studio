// Reel 1, shot 10.1: not on the horizon. A gold horizon line across the lower third, the traveller's glow along it;
// then one tilt down, past it into the system map, every portal live: a traveller runs each line, and the small
// confirmations seen earlier (Selected, Approved, Fulfilled) blink once in their portals.
const M = require("../motion.cjs");
const { beat, EASE, span, lerp, lerp2, r3, px, State, fade, captionHtml, caption, F, KIT } = M;

/**
 * Every portal live: a traveller runs each line from the hub to its portal, again and again, each on its own
 * phase, fading in as it leaves the hub and out as it reaches the portal. 10.2 carries them on (invitation.cjs)
 * until it dims the map, so the cut between the two shots moves nothing.
 */
function travellerAt(i, t) {
  const { hub, portals } = F.SYSTEM_MAP;
  const run = ((((t - beat("10.1", 1)) / 1.15 + i * 0.37) % 1) + 1) % 1;
  return {
    at: lerp2(hub.at, portals[i].at, lerp(0.18, 0.9, EASE.move(run))),
    o: Math.min(span(run, 0, 0.12, EASE.linear), 1 - span(run, 0.82, 1, EASE.linear)),
  };
}

/** The ground's dot field repeats every 22 px (--reel-dot-field-background-size), drawn at the kit's K. */
const DOT = 22 * KIT.K;

// ------------------------------------------------------------------ 10.1: the horizon, then the whole system, live
function horizonScene() {
  const [tIn, tTilt] = [0, 1].map((i) => beat("10.1", i));
  const { hub, portals: PORTALS } = F.SYSTEM_MAP;
  const hubPlate = F.plate(hub.key);
  const Zh = hub.width / hubPlate.css[0];
  // A10: the horizon at y 330 above the map, its traveller resting at x 676. Before the tilt the horizon is
  // across the lower third, just above the captions, so the tilt carries everything up by TILT px.
  const HORIZON = 330;
  const TILT = 1270 - HORIZON;
  // The dots ride the tilt by a whole number of their periods (21, 1.7% short of the map's move), so they
  // end where every other scene draws them and the cut into 10.2 does not move them.
  const FIELD_TILT = Math.round(TILT / DOT) * DOT;
  const tLand = tTilt + 0.86;
  // A10's confirmations, where each portal showed its own earlier in the film.
  const CONFIRMS = [
    ["Selected", 890, 1020],
    ["Approved", 744, 692],
    ["Fulfilled", 190, 1020],
  ];

  const html = () => {
    const pieces = PORTALS.map((_, i) => F.mapPortal(i, { traveller: 0 }));
    const lines = pieces
      .map((p, i) =>
        p.line
          .replace('class="fk-link"', `class="fk-link" id="Lk${i}"`)
          .replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`),
      )
      .join("");
    const hubWindow = KIT.camera({
      plate: hubPlate,
      zoom: Zh,
      focus: [hubPlate.css[0] / 2, hubPlate.css[1] / 2],
      at: hub.at,
      style: "z-index:5",
    });
    const hubChip = F.mapChip(hub.label, hub.at[0], hub.at[1] - (hubPlate.css[1] * Zh) / 2 - 72, 6);
    const confirms = CONFIRMS.map(
      ([label, x, y], i) =>
        `<div class="fk-confirm" id="cf${i}" style="left:${x}px;top:${y}px;visibility:hidden">${label}</div>`,
    ).join("");
    return [
      // The ground, its dot field long enough to ride the tilt.
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field" id="field" style="height:${(1920 + FIELD_TILT) / KIT.K}px"></div><div class="fk-glow"></div></div>`,
      `<div id="tilt" class="fk-layer" style="z-index:1">
        <div class="fk-horizon" id="hz" style="top:${HORIZON}px;transform-origin:50% 50%"></div>
        <div class="fk-traveller" id="hz-t" style="left:0;top:${HORIZON + 1}px;z-index:3;visibility:hidden"></div>
        <div id="map" class="fk-layer" style="visibility:hidden">${lines}${pieces.map((p) => p.window).join("")}${hubWindow}${pieces.map((p) => p.chip).join("")}${hubChip}</div>
        ${confirms}</div>`,
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // One tilt down: everything, the ground's dots with it, rises by TILT.
    const tilt = span(t, tTilt, tLand, EASE.move);
    const lift = TILT * (1 - tilt);
    st.set("#tilt", { transform: `translateY(${px(lift)})` });
    st.set("#field", { transform: `translateY(${px(-FIELD_TILT * tilt)}) scale(${KIT.K})` });
    // G-HORIZON: the line opens out from the middle; the traveller glides in along it and comes to rest.
    const open = span(t, tIn, tIn + 0.55, EASE.move);
    st.set("#hz", { transform: `scaleX(${r3(open)})`, ...fade(Math.min(1, open * 4)) });
    const glide = span(t, tIn + 0.08, tTilt + 0.05, EASE.settle);
    st.set("#hz-t", {
      transform: `translate(${px(lerp(-30, 676, glide))}, 0) translate(-50%, -50%)`,
      ...fade(span(t, tIn + 0.08, tIn + 0.3, EASE.linear)),
    });
    // The map comes up from beneath the horizon with the tilt.
    st.set("#map", fade(span(t, tTilt + 0.08, tTilt + 0.62, EASE.move)));
    // Every portal live.
    PORTALS.forEach((_, i) => {
      const { at, o } = travellerAt(i, t);
      st.set(`#T${i}`, { left: px(at[0]), top: px(at[1]), ...fade(o) });
    });
    // The confirmations blink once each, one after another, as the camera settles on the map; the last is
    // gone before the cut into 10.2, which does not draw them.
    CONFIRMS.forEach((_, i) => {
      const a = tLand - 0.06 + i * 0.1;
      const on = span(t, a, a + 0.14, EASE.settle);
      const off = span(t, a + 0.36, a + 0.6, EASE.move);
      st.set(`#cf${i}`, {
        transform: `translate(-50%, -50%) scale(${r3(lerp(0.86, 1, on))})`,
        ...fade(on * (1 - off)),
      });
    });
    return st;
  };

  return { id: "horizon", shots: ["10.1"], palette: "aurixa", html, state };
}

module.exports = horizonScene;
module.exports.travellerAt = travellerAt;
