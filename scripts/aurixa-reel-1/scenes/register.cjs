// Reel 1, shot 09.2: one register instead. G-LIGHT-SWEEP: on the cut's beat a band of gold light crosses the frame
// from left to right, and behind it today's desk (09.1's last frame, held) burns away into the brand's night: the
// paper ahead of the light scorches gold, the light passes, and the dark of Aurixa is left in its place. The
// Solicitor Portal's matter, Ellis: Purchase, 14 Wattle Grove, settles in its glass window behind the light; the
// pointer presses Docs and the document register opens, four documents, one copy of each, each with its status,
// as the camera pushes in to it. The window floats in depth (./workflowStage.cjs).
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  bezier,
  F,
} = M;
const S = require("./workflowStage.cjs");
const BRIDGE = require("./bridge.cjs");

// ------------------------------------------------------------------ the sweep
// Its front is a line slanted SLANT degrees from the vertical, its top leading; X is where it crosses the frame's
// middle row. The light reaches GLOW px behind it; it starts and ends wholly off the frame.
const [FW, FH] = [1080, 1920];
const SLANT = 14;
const TAN = Math.tan((SLANT * Math.PI) / 180);
const GLOW = 280;
const X0 = -(FH / 2) * TAN - 140;
const X1 = FW + (FH / 2) * TAN + GLOW;
// A CSS gradient across the frame at 90 + SLANT degrees runs along the front's normal (toward the paper); a stop
// at `along(X) + d` lies d px from the front.
const ANGLE = 90 + SLANT;
const NORMAL = [Math.cos((SLANT * Math.PI) / 180), Math.sin((SLANT * Math.PI) / 180)];
const LENGTH = FW * NORMAL[0] + FH * NORMAL[1];
const along = (X) => (X - FW / 2) * NORMAL[0] + LENGTH / 2;
/** The sweep's pace: under way on the beat, quickest through the frame's middle, easing out past its edge. */
const PACE = bezier(0.32, 0.1, 0.3, 1);
const gradient = (s, stops) =>
  `linear-gradient(${ANGLE}deg, ${stops.map(([c, d]) => `${c} ${px(s + d)}`).join(", ")})`;
// The hairline's gold, the traveller's light and its glow.
const GOLD = "200,155,60";
const GLOW_GOLD = "215,179,95";
const TRAVELLER = "245,209,122";

// ------------------------------------------------------------------ 09.2: the matter's document register
function registerScene() {
  const css = F.plate("PL-09B-a").css;
  const [tSweep, tSettled, tRegister] = [0, 1, 2].map((i) => beat("09.2", i));
  const tCross = tSweep + 1.05; // the light has left the frame
  // The window rises out of the night behind the light and is settled on the beat; the pointer presses Docs and
  // the register is open on its beat.
  const tPress = tRegister - 0.17;
  const RECT = [40, 384, 1000, 900];
  // The push to the register: the page closes in on it inside the window (as far as the page's own top allows,
  // the matter's name kept in view) and the window comes forward.
  const OPEN = { zoom: 1.3, focus: [640, 380] };
  const CLOSE = { zoom: 1.38, focus: [596, 404] };
  const PUSH = 80; // px the window comes toward the camera
  const pushed = (t) => span(t, tPress + 0.1, tPress + 1.3, EASE.settle);
  const framing = (t) => {
    const q = pushed(t);
    return {
      rect: RECT,
      zoom: zoomLerp(OPEN.zoom, CLOSE.zoom, q),
      focus: lerp2(OPEN.focus, CLOSE.focus, q),
      at: [540, 834],
    };
  };
  const html = () =>
    [
      S.stageHtml(),
      S.stageWindow("W", ["PL-09B-a", "PL-09B-b"], 5),
      // Today's desk as 09.1 left it, burned away from behind the light.
      `<div id="before" class="fk-layer" style="z-index:20">${BRIDGE.daylightHtml()}${BRIDGE.deskHtml()}</div>`,
      // The paper ahead of the light scorching gold, the light itself, and the warmth it throws on the frame.
      `<div id="scorch" class="fk-layer" style="z-index:21;visibility:hidden"></div>`,
      `<div id="band" class="fk-layer" style="z-index:22;mix-blend-mode:screen;visibility:hidden"></div>`,
      `<div id="warmth" class="fk-layer" style="z-index:23;mix-blend-mode:screen;visibility:hidden"></div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The sweep.
    const p = span(t, tSweep, tCross, PACE);
    const X = lerp(X0, X1, p);
    const s = along(X);
    const live = t >= tSweep && p < 1;
    BRIDGE.deskState(st, BRIDGE.FROZEN(), m);
    st.set("#before", {
      "-webkit-mask-image": gradient(s, [
        ["transparent", -5],
        ["#000", 7],
      ]),
      "mask-image": gradient(s, [
        ["transparent", -5],
        ["#000", 7],
      ]),
      ...fade(p < 1 ? 1 : 0),
    });
    st.set("#scorch", {
      background: gradient(s, [
        ["transparent", -1],
        ["rgba(255,244,214,.96)", 2],
        [`rgba(${TRAVELLER},.85)`, 16],
        [`rgba(${GLOW_GOLD},.5)`, 46],
        [`rgba(${GOLD},.22)`, 104],
        [`rgba(${GOLD},.07)`, 170],
        ["transparent", 260],
      ]),
      ...fade(live ? 1 : 0),
    });
    st.set("#band", {
      background: gradient(s, [
        ["transparent", -GLOW],
        [`rgba(${GOLD},.08)`, -190],
        [`rgba(${GOLD},.22)`, -96],
        [`rgba(${GLOW_GOLD},.5)`, -34],
        [`rgba(${TRAVELLER},.9)`, -9],
        ["rgba(255,248,226,1)", -1],
        [`rgba(${TRAVELLER},.75)`, 6],
        [`rgba(${GLOW_GOLD},.22)`, 30],
        ["transparent", 70],
      ]),
      ...fade(live ? 1 : 0),
    });
    // The whole frame warms a little as the light crosses its middle.
    st.set("#warmth", {
      background: `rgba(${GOLD},${r3(0.07 * Math.sin(Math.PI * p))})`,
      ...fade(live ? 1 : 0),
    });

    // The window: out of the night behind the light, settling into its float on the beat.
    const arrive = span(t, tSweep + 0.16, tSettled + 0.08, EASE.settle);
    const pose = S.mix({ tz: -300, rx: 6, ry: -7, s: 0.95 }, S.drift(t), arrive);
    pose.tz += PUSH * pushed(t);
    const P = S.stageState(st, RECT, pose, { pool: arrive });
    const docs = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const g = placeWindow(st, "W", css, framing(t), [1 - docs, docs], {
      transform: P.css,
      opacity: span(t, tSweep + 0.1, tSweep + 0.42, EASE.linear),
    });
    // The register's documents rise into place one after another.
    m.docRows.forEach((_, i) => {
      const r = span(t, tPress + 0.1 + 0.07 * i, tPress + 0.46 + 0.07 * i, EASE.settle);
      st.set("#W-1 .sdoc", { transform: `translateY(${px((1 - r) * 12)})`, opacity: r3(r) }, i);
    });
    // The pointer comes up to the Docs tab once the light has passed, presses it, and gives way.
    const on = (pt) => P.map(g.map(pt));
    pointer(st, t, {
      from: [830, 1180],
      to: on(m.docs),
      a: tSettled - 0.02,
      b: tPress - 0.05,
      show: tSettled - 0.08,
      hide: tPress + 0.42,
      press: tPress,
    });
    return st;
  };
  return {
    id: "register",
    shots: ["09.2"],
    palette: "aurixa",
    html,
    measure: {
      tabs: ["#W-0", ".atabs > span", true],
      docRows: ["#W-1", ".sdoc", true],
      lrows: ["#LW", ".fk-doclist > div", true],
    },
    derive(m) {
      // The tip on the Docs tab's label, a little right of its icon.
      const docs = m.tabs[5];
      return { ...m, docs: [docs[0] + docs[2] * 0.62, docs[1] + docs[3] * 0.58] };
    },
    state,
  };
}

module.exports = registerScene;
