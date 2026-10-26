// Reel 3, shots 05.1 and 05.2: here's where speed meets opportunity; with just one click. Jordan's client workspace
// on its Borrowing Capacity tab (the product's own, drawn by the screens harness), under the Command Centre's bar with
// its DEMO WORKSPACE label. The Borrowing Capacity card comes forward out of the workspace and the pointer travels to
// Calculate Capacity, where it waits through the music falling away and the held silence. The press lands on the
// music's drop: a burst of light from the button, the card unfolds to its result as the product lays it out, and
// Maximum Borrowing Power counts up to the engine's $1,049,786, every number on the way the product's own type on
// the card's own ground (screens/captures/13-bc-countup.cjs). The camera rides in on the figure as it counts and
// back out as the rest lands in turn: the label, Strong Position, Monthly Surplus and DTI Ratio, the stress test with
// its bar filling, the last calculated line and View Full Calculator. The illustrative label comes up under it as
// the figure lands, and holds into 05.3.
//
// The card is one plate (CARD, below): the card's own ground (screens/captures/14-bc-pieces.cjs, every part of its
// content hidden so the parts keep their places), the parts laid back on it where the product put them, and the
// empty card over it all until the press. The ground grows from the empty card's height to the result's: its top and
// its foot, the foot sliding down as the card opens.
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const { MUSIC } = require("../pacing.cjs");

const {
  shotOf,
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
  whole,
  between,
  placeWindow,
  throughRect,
  pointerHtml,
  pointer,
  focusHtml,
  corners,
  captionHtml,
  caption,
  F,
  PAD,
} = M;

/** The music's drop under "With just one click": the second piece's bar 0 (pacing.json), where the press lands. */
const DROP = (() => {
  const piece = MUSIC.pieces[1];
  return piece.film_at + (MUSIC.drop - piece.file_from);
})();

const BAR = {
  portal: "COMMAND CENTRE",
  page: "Jordan Ellis · Borrowing Capacity",
  emblem: F.EMBLEM,
};
/** The workspace from its tab bar to just under the card (the toolbar above it carries "(legacy layout)" items). */
const WS = K3.screenPlate("clients-ws-bc-empty", { bar: BAR, from: 150, to: 440 });

// ------------------------------------------------------------------ the card, in its parts
const CARD_W = 760;
const EMPTY_H = 210;
const FULL_H = 452;
/** The foot of the ground that slides down as the card opens: its bottom border and the page under it. */
const FOOT = 54;
const FOOT_FROM = FULL_H - FOOT;
/** The rows the foot fades in over, so the join between the ground's top and its foot never shows. */
const BLEND = 18;
const B = K3.BAR_H;
const ground = K3.screen("bc-card-ground");
const PIECES = ["label", "band", "surplus", "dti", "stress", "calc", "full"];
const at = (name) => ground.regions[name];
const COUNT_STEPS = 120;
const countSrc = (i) => K3.screen(`bc-count-${String(i).padStart(3, "0")}`).src;

const cardCss = `
.cc-card { position:absolute; left:0; top:${B}px; width:${CARD_W}px; height:${FULL_H}px; }
.cc-card img { position:absolute; display:block; }
.cc-clip { position:absolute; left:0; width:${CARD_W}px; overflow:hidden; }
#cc-bot { -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 ${BLEND}px); mask-image:linear-gradient(to bottom, transparent 0, #000 ${BLEND}px); }
.cc-hover { position:absolute; border-radius:6px; background:#ffffff; mix-blend-mode:soft-light; pointer-events:none; }
.cc-sheen { position:absolute; overflow:hidden; pointer-events:none; mix-blend-mode:screen;
  -webkit-mask-image:url("${K3.screen("bc-count-glyphs").src}"); mask-image:url("${K3.screen("bc-count-glyphs").src}");
  -webkit-mask-size:100% 100%; mask-size:100% 100%; }
.cc-sheen i { position:absolute; top:-30%; bottom:-30%; width:22%; left:0;
  background:linear-gradient(90deg, rgba(255,226,160,0), rgba(255,236,190,1) 50%, rgba(255,226,160,0)); transform:skewX(-18deg); }
.cl-burst { position:absolute; left:0; top:0; width:600px; height:600px; margin:-300px 0 0 -300px; border-radius:50%; pointer-events:none;
  mix-blend-mode:screen; background:radial-gradient(closest-side, rgba(255,250,235,.95), rgba(245,209,122,.55) 22%, rgba(94,221,232,.22) 48%, rgba(94,221,232,0) 72%); }
.cl-shock { position:absolute; left:0; top:0; width:600px; height:600px; margin:-300px 0 0 -300px; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(closest-side, rgba(245,209,122,0) 86%, rgba(255,236,190,.55) 90%, rgba(245,209,122,0) 94%); }
.cl-vignette { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse 70% 52% at 50% 40%, rgba(2,6,14,0) 40%, rgba(2,6,14,.82) 100%); }
`;

const PLATE = "R3-card-composite";
(() => {
  const { PLATES } = require("../../aurixa-reel-1/plates.cjs");
  const img = (id, key, [x, y, w, h], extra = "") =>
    `<img id="${id}" src="${K3.screen(key).src}" alt="" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">`;
  const [fx, fy, fw, fh] = at("figure");
  const [bx, by, bw, bh] = K3.region("bc-card-empty", "calculate");
  PLATES[PLATE] = {
    size: [CARD_W, B + FULL_H],
    scale: 1,
    html:
      `<div class="cc-card">` +
      `<div class="cc-clip" id="cc-top" style="top:0;height:${FULL_H}px"><img src="${ground.src}" alt="" style="left:0;top:0;width:${CARD_W}px;height:${FULL_H}px"></div>` +
      `<div class="cc-clip" id="cc-bot" style="top:${FOOT_FROM}px;height:${FOOT}px"><img src="${ground.src}" alt="" style="left:0;top:${-FOOT_FROM}px;width:${CARD_W}px;height:${FULL_H}px"></div>` +
      PIECES.map((p) => img(`cc-${p}`, `bc-pc-${p}`, at(p), "visibility:hidden")).join("") +
      // The stress test's bar filling: the filled picture over the empty one, revealed from the left.
      img("cc-stress-empty", "bc-pc-stress-empty", at("stress"), "visibility:hidden") +
      `<img id="cc-fig" src="${countSrc(0)}" alt="" style="left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px;visibility:hidden">` +
      `<div class="cc-sheen" id="cc-sheen" style="left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px;visibility:hidden"><i id="cc-sheen-bar"></i></div>` +
      img("cc-empty", "bc-card-empty", [0, 0, CARD_W, EMPTY_H]) +
      `<div class="cc-hover" id="cc-hover" style="left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;visibility:hidden"></div>` +
      `</div>` +
      K3.barHtml(BAR),
  };
})();

// Framings. The card's window: wide in the frame, centred in the action zone, its foot well above the label.
const Z = 1.28;
const CX = 540;
const CY = 762;
const cardRect = (h) => {
  const w = CARD_W * Z + 2 * PAD;
  const hh = (B + h) * Z + 2 * PAD;
  return [CX - w / 2, CY - hh / 2, w, hh];
};
const fit = (h, zoom = Z, focus = [CARD_W / 2, (B + h) / 2], at2 = [CX, CY]) => ({
  rect: cardRect(h),
  zoom,
  focus,
  at: at2,
});
/** The drift the card is held in to the end of 05.2 (and 05.3 carries on from). */
const DRIFT = 1.022;

/** Where the card's ground shows to, for a card `h` tall, and where its foot sits. */
function groundState(st, h) {
  st.set("#cc-top", { height: px(h - FOOT + BLEND) });
  st.set("#cc-bot", { top: px(h - FOOT) });
}

function clickScene() {
  const s1 = shotOf("05.1");
  const s2 = shotOf("05.2");
  const T0 = s1.in;
  const TP = beat("05.1", 1); // the pointer travels
  const TW = beat("05.1", 2); // it waits
  const TC = beat("05.2", 1); // the rest lands in turn
  const TH = beat("05.2", 2); // the figure holds
  const END = s2.out;
  if (!(DROP > TW && DROP < TC))
    throw new Error(`The drop (${DROP}) isn't between 05.1's wait and 05.2's cascade`);

  // The count: from just after the press to the landing, the engine's figure in the end.
  const COUNT_A = DROP + 0.1;
  const COUNT_B = DROP + 1.16;
  const LAND = COUNT_B;
  // The rest, in turn.
  const ENTER = {
    label: LAND - 0.12,
    band: TC,
    surplus: TC + 0.17,
    dti: TC + 0.27,
    stress: TC + 0.42,
    calc: TC + 0.66,
    full: TC + 0.8,
  };
  const FILL = [ENTER.stress + 0.08, ENTER.stress + 0.85];

  const FIGURE_AT = [
    at("figure")[0] + at("figure")[2] / 2,
    B + at("figure")[1] + at("figure")[3] / 2,
  ];
  const CALC = K3.region("bc-card-empty", "calculate");
  /** Where the pointer rests on Calculate Capacity, and the point the camera leans in on through the wait. */
  const REST = [CALC[0] + CALC[2] * 0.6, B + CALC[1] + CALC[3] / 2 + 5];
  const BUTTON_AT = [CALC[0] + CALC[2] * 0.53, B + CALC[1] + CALC[3] / 2];

  const html = () =>
    [
      `<style>${K3.barCss}${K3.labelCss}${K3.demoCss}${cardCss}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow" id="cl-glow"></div></div>`,
      windowHtml("WS", [WS.name], 3),
      windowHtml("CW", [PLATE], 6),
      `<div class="fk-layer" style="z-index:9;pointer-events:none"><div class="cl-vignette" id="cl-vig" style="visibility:hidden"></div></div>`,
      `<div class="fk-layer" style="z-index:12;pointer-events:none"><div class="cl-burst" id="cl-burst" style="visibility:hidden"></div><div class="cl-shock" id="cl-shock" style="visibility:hidden"></div></div>`,
      `<div class="fk-layer" style="z-index:30">${focusHtml()}</div>`,
      K3.demoHtml(),
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // ---------------------------------------------------------------- the workspace, then the card coming forward
    const wsIn = span(t, T0, T0 + 0.28, EASE.settle);
    const lift = span(t, T0 + 0.58, T0 + 1.2, EASE.move);
    const wsFraming = whole(WS.css, 0.71, [540, 760]);
    const gw = placeWindow(st, "WS", WS.css, wsFraming, [1], {
      opacity: wsIn * lerp(1, 0.55, lift),
      veil: 0.72 * lift,
      transform: `translateY(${px(lerp(26, 0, wsIn) + 60 * lift)}) scale(${r3(lerp(1, 0.9, lift))})`,
    });
    // The tab it is on: the focus corners close on Borrowing Capacity, and go as the card comes forward.
    const tab = WS.at("tabBorrowing");
    const tabRect = throughRect(gw, tab);
    tabRect[1] += lerp(26, 0, wsIn) + 60 * lift;
    corners(st, t, tabRect, T0 + 0.12, T0 + 0.46);
    if (t > T0 + 0.6) st.set("#focus", fade(1 - span(t, T0 + 0.6, T0 + 0.78, EASE.linear)));

    // ---------------------------------------------------------------- the card's height and framing
    // The card opens as the camera pulls back from the figure (the card is in close-up while it counts).
    const open = span(t, LAND - 0.14, LAND + 0.5, EASE.move);
    const h = lerp(EMPTY_H, FULL_H, open);
    groundState(st, h);
    // The camera inside the card's window: the whole card; in on the button through the wait; on the drop, in on the
    // figure as it counts; back out to the whole card as the rest lands.
    const css = [CARD_W, B + FULL_H];
    const whole2 = fit(h);
    const onButton = fit(h, 1.8, BUTTON_AT);
    const onFigure = fit(h, 3.0, FIGURE_AT, [CX, CY - 24]);
    const pWait = span(t, TW - 0.1, DROP - 0.04, EASE.move);
    const pPunch = span(t, DROP + 0.02, DROP + 0.44, EASE.move);
    const pBack = span(t, LAND - 0.12, LAND + 0.62, EASE.move);
    let framing = between(css, whole2, onButton, pWait);
    framing = between(css, framing, onFigure, pPunch);
    framing = between(css, framing, whole2, pBack);
    // A last breath of drift while it holds.
    const drift = span(t, TH - 0.4, END, EASE.linear);
    framing = { ...framing, zoom: framing.zoom * lerp(1, DRIFT, drift) };
    const cardIn = span(t, T0 + 0.58, T0 + 1.15, EASE.settle);
    const ty = lerp(70, 0, cardIn);
    const sc = lerp(0.9, 1, cardIn);
    const g = placeWindow(st, "CW", css, framing, [1], {
      opacity: cardIn,
      transform: `translateY(${px(ty)}) scale(${r3(sc)})`,
    });
    // Where a point of the card lands once the window's own rise (about its centre) is applied.
    const [rx, ry, rw, rh] = g.rect;
    const xf = ([x, y]) => [
      rx + rw / 2 + (x - rx - rw / 2) * sc,
      ry + rh / 2 + (y - ry - rh / 2) * sc + ty,
    ];
    // The DEMO WORKSPACE label, on the window itself whenever the camera is in close enough to lose the bar.
    K3.demoState(st, t, g, { opacity: cardIn, bar: B, xf });

    // ---------------------------------------------------------------- the empty card, the press, the result
    const gone = span(t, DROP + 0.02, DROP + 0.16, EASE.linear);
    st.set("#cc-empty", {
      transform: `translateY(${px(12 * span(t, DROP, DROP + 0.2, EASE.move))})`,
      ...fade(1 - gone),
    });
    const hover =
      span(t, TW - 0.12, TW + 0.05, EASE.settle) *
      (1 - span(t, DROP + 0.02, DROP + 0.12, EASE.linear));
    const flash = t >= DROP ? Math.max(0, 1 - (t - DROP) / 0.18) : 0;
    st.set("#cc-hover", fade(0.18 * hover + 0.55 * flash));
    // The figure, counting: one of the product's own steps per frame (held still within a frame, so the digits are
    // sharp), on the brand's settle curve, the engine's figure from LAND.
    const frameT = Math.round(t * 30) / 30;
    const u = span(frameT, COUNT_A, COUNT_B, EASE.settle);
    const step =
      frameT >= COUNT_B ? COUNT_STEPS : Math.min(COUNT_STEPS - 1, Math.round(COUNT_STEPS * u));
    st.set("#cc-fig", {
      $src: countSrc(step),
      ...fade(span(t, DROP + 0.06, DROP + 0.16, EASE.linear)),
    });
    // A light crosses the figure as it lands.
    const sweep = span(t, LAND, LAND + 0.55, EASE.move);
    st.set("#cc-sheen", fade(sweep > 0 && sweep < 1 ? 1 : 0));
    st.set("#cc-sheen-bar", {
      transform: `translateX(${px(lerp(-200, 820, sweep))}) skewX(-18deg)`,
    });
    // The rest, in turn: each settles up into place.
    for (const p of PIECES) {
      const a = span(t, ENTER[p], ENTER[p] + 0.34, EASE.settle);
      const lift2 = p === "band" ? "" : `translateY(${px(lerp(9, 0, a))})`;
      const pop = p === "band" ? `scale(${r3(lerp(0.86, 1, a))})` : "";
      st.set(`#cc-${p}`, { transform: `${lift2} ${pop}`.trim() || "none", ...fade(a) });
    }
    const fill = span(t, FILL[0], FILL[1], EASE.settle);
    const sa = span(t, ENTER.stress, ENTER.stress + 0.34, EASE.settle);
    st.set("#cc-stress-empty", { transform: `translateY(${px(lerp(9, 0, sa))})`, ...fade(sa) });
    st.set("#cc-stress", {
      "-webkit-mask-image": `linear-gradient(90deg, #000 ${r3(100 * fill)}%, transparent ${r3(100 * fill + 0.01)}%)`,
      "mask-image": `linear-gradient(90deg, #000 ${r3(100 * fill)}%, transparent ${r3(100 * fill + 0.01)}%)`,
    });

    // ---------------------------------------------------------------- the pointer, the press
    const btn = xf(g.map(REST));
    const restAt = [btn[0], btn[1]];
    if (t < DROP + 0.34) {
      // To the button, and on it as the window leans in and settles back.
      pointer(st, t, {
        from: [940, 1380],
        to: restAt,
        a: TP,
        b: TP + 0.78,
        bow: 0.1,
        show: TP - 0.08,
        press: DROP,
      });
    } else
      pointer(st, t, {
        from: restAt,
        to: [restAt[0] + 260, restAt[1] + 420],
        a: DROP + 0.34,
        b: DROP + 1.1,
        bow: -0.08,
        show: T0,
        hide: DROP + 0.62,
        press: DROP,
      });

    // ---------------------------------------------------------------- the light
    // Through the wait the frame darkens around the card; on the drop it opens up in a burst from the button.
    const hush =
      span(t, TW - 0.2, DROP - 0.05, EASE.move) * (1 - span(t, DROP, DROP + 0.5, EASE.settle));
    st.set("#cl-vig", fade(0.85 * hush));
    st.set("#cl-glow", {
      opacity: r3(lerp(1, 0.55, hush) + 0.5 * Math.max(0, 1 - Math.abs(t - DROP - 0.12) / 0.45)),
    });
    const b0 = t - DROP;
    const burst = b0 >= 0 && b0 < 0.7 ? b0 / 0.7 : b0 < 0 ? 0 : 1;
    st.set("#cl-burst", {
      transform: `translate(${px(btn[0])}, ${px(btn[1])}) scale(${r3(lerp(0.15, 1.9, EASE.settle(burst)))})`,
      ...fade(b0 >= 0 && b0 < 0.7 ? 0.95 * (1 - burst) ** 1.6 : 0),
    });
    const s0 = t - DROP - 0.02;
    const shock = s0 >= 0 && s0 < 0.6 ? s0 / 0.6 : 0;
    st.set("#cl-shock", {
      transform: `translate(${px(btn[0])}, ${px(btn[1])}) scale(${r3(lerp(0.25, 2.3, EASE.settle(shock)))})`,
      ...fade(s0 >= 0 && s0 < 0.6 ? 0.6 * (1 - shock) ** 1.4 : 0),
    });

    // ---------------------------------------------------------------- the illustrative label, from the landing on
    K3.labelState(st, t, { a: LAND - 0.1, outAtCut: true });
    return st;
  };

  return { id: "click", shots: ["05.1", "05.2"], palette: "aurixa", html, state, DROP };
}

/**
 * The card as 05.2 leaves it, for 05.3 to pick up: every part in place, the count at the engine's figure, nothing
 * moving. `card.framing(zoom)` is its window's framing (the whole card at `zoom` times the scene's own).
 */
function finalCard(st) {
  groundState(st, FULL_H);
  st.set("#cc-empty", fade(0));
  st.set("#cc-hover", fade(0));
  st.set("#cc-sheen", fade(0));
  st.set("#cc-fig", { $src: countSrc(COUNT_STEPS), ...fade(1) });
  for (const p of [...PIECES, "stress-empty"])
    st.set(`#cc-${p}`, { transform: "none", ...fade(1) });
  st.set("#cc-stress", { "-webkit-mask-image": "none", "mask-image": "none" });
}
const card = {
  PLATE,
  css: [CARD_W, B + FULL_H],
  bar: B,
  DRIFT,
  framing: (k = DRIFT) => {
    const f = fit(FULL_H);
    return { ...f, zoom: f.zoom * k };
  },
  /** A part of the card (its regions, as the ground's), in the plate's own px. */
  part: (name) => {
    const [x, y, w, h] = at(name);
    return [x, B + y, w, h];
  },
  html: () => `<style>${cardCss}</style>`,
  finalCard,
};

module.exports = clickScene;
module.exports.DROP = DROP;
module.exports.card = card;
