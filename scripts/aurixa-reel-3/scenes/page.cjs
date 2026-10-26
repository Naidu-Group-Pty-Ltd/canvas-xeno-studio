// Reel 3, shots 05.3 to 05.5: an indicative borrowing capacity assessment; purchasing power, deposit requirements,
// financial commitments; and key considerations tailored to their specific circumstances. The card from 05.2, as it
// was left; the pointer presses View Full Calculator, and the Borrowing Capacity page opens (the product's own,
// drawn by the screens harness from the same assessment). The page stands behind in depth, out of focus and dimmed,
// drifting to wherever the voice is, and each thing the voice names lifts out of it, sharp, to the front, where the
// focus corners close on it:
//   05.3: the page's header; on "indicative", the page's own line, "This calculator is for indicative purposes only";
//         on "borrowing capacity assessment", BORROWING CAPACITY $1,049,786, Stress-tested $964,993.
//   05.4: on "purchasing power", the capacity figure; on "deposit requirements", Lenders Mortgage Insurance on 14
//         Wattle Grove's $1,150,000 with its $230,000 deposit, the LVR at 80.0% and No LMI Required; on "financial
//         commitments", Existing Liabilities: the car loan, the credit card, Total Monthly Commitments $820.
//   05.5: Assumptions Used (9.50%, 30 years) and the expense method with the HEM benchmark of $3,780; then the
//         declared $6,447 that is used, being the higher, and the band: GREEN, Strong borrowing position.
// What the page draws that the film doesn't say stays in the page out of focus (the proposed loan check's
// "Serviceable", the band's heading, the Recommendations, the Results panel's compliance wording, the employer): no
// lift-out includes any of it. When the page comes into focus at the end of 05.5, for 05.6 to pull back from, the
// words the brand keeps out of frame are under covers of the page's own ground (COVERS). The illustrative label holds
// through all three shots.
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const click = require("./click.cjs");

const {
  shotOf,
  beat,
  EASE,
  span,
  lerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  between,
  placeWindow,
  throughRect,
  pointerHtml,
  pointer,
  focusHtml,
  corners,
  captionHtml,
  caption,
  PAD,
} = M;

const PAGE = "bc-page-calc";
const PAGE_CSS = K3.screen(PAGE).css; // [1440, 4117]
const CARD = click.card;
/** The page behind: its zoom and window (centred, its foot above the illustrative label). */
const BGZ = 0.7;
const BG_W = PAGE_CSS[0] * BGZ + 2 * PAD;
const BG_RECT = [(1080 - BG_W) / 2, 300, BG_W, 880];
const BG_AT = [BG_RECT[0] + BG_RECT[2] / 2, BG_RECT[1] + BG_RECT[3] / 2];
/** Where the page behind ends 05.5, sharp: 05.6 pulls back from exactly here. */
const BG_END_Y = 1220;
const SHARP = K3.screenPlate(PAGE);
/**
 * What the film keeps off the page, each under a cover of the page's own ground (the page's CSS px). These are the words
 * the brand keeps out of frame: the proposed loan check's "Serviceable", the employer, the audit's line on
 * serviceability, the band's heading and the Recommendations row. Also covered are the two liabilities' type chips,
 * because the car loan's prints the engine's own key, "vehicle_loan", where the credit card's prints a name. Each is
 * fitted by ../ground_fit.py to the rows just above and below it, to within a code value, blending from the one to the
 * other down the cover where they differ. A lift-out carries every cover inside its rect, so the two never disagree.
 */
const COVERS = {
  badge: { box: [1281, 323, 110, 30], top: ["#1d252a", "#1c2529"], bottom: ["#1c2428", "#1c2428"] },
  employer: {
    box: [22, 331, 210, 20],
    top: ["#1e1e22", "#1c1d20", "#19191e"],
    bottom: ["#1c1c20", "#1a1b1f", "#17181d"],
  },
  audit: {
    box: [768, 826, 626, 38],
    top: [
      "#1e1f24",
      "#1d1e22",
      "#1a1c20",
      "#181a1f",
      "#16171d",
      "#13151b",
      "#121319",
      "#0f1117",
      "#0d0f15",
      "#0d0f16",
      "#0d0f17",
    ],
    bottom: [
      "#1b1d21",
      "#191a1f",
      "#17181e",
      "#14161b",
      "#13141a",
      "#0f1117",
      "#0d0f15",
      "#0d0f16",
      "#0d0f17",
      "#0d1018",
      "#0d101a",
    ],
  },
  band: { box: [771, 1153, 125, 18], top: ["#122223", "#122223"] },
  recommendations: { box: [752, 1288, 656, 30], top: ["#0c0f18", "#0c101c"] },
  carLoanType: {
    box: [119, 1486, 93, 26],
    top: ["#1a1b21", "#181920"],
    bottom: ["#181920", "#18181f"],
  },
  creditCardType: {
    box: [136, 1626, 88, 26],
    top: ["#14151c", "#14141b"],
    bottom: ["#14141b", "#12131a"],
  },
};
/** A cover (see COVERS) as markup on a plate whose top left is the page's point [ox, oy]. */
const coverHtml = ({ box: [x, y, w, h], top, bottom }, [ox, oy] = [0, 0]) =>
  `<div style="position:absolute;left:${x - ox}px;top:${y - oy}px;width:${w}px;height:${h}px;background:linear-gradient(90deg, ${top.join(", ")})">` +
  (bottom
    ? `<div style="position:absolute;inset:0;background:linear-gradient(90deg, ${bottom.join(", ")});-webkit-mask-image:linear-gradient(180deg, transparent, #000);mask-image:linear-gradient(180deg, transparent, #000)"></div>`
    : "") +
  `</div>`;
/** The page in focus, as the film shows it: the sharp page under its covers. */
const SAFE = (() => {
  const { PLATES } = require("../../aurixa-reel-1/plates.cjs");
  const name = `${SHARP.name}-covered`;
  if (!PLATES[name])
    PLATES[name] = {
      ...PLATES[SHARP.name],
      html:
        PLATES[SHARP.name].html +
        Object.values(COVERS)
          .map((c) => coverHtml(c))
          .join(""),
    };
  return { ...SHARP, name };
})();

// ------------------------------------------------------------------ the page behind, out of focus
const BG_BAKE = "page-bg.png";
const BG_PLATE = "R3P-page-bg";
(() => {
  const { PLATES } = require("../../aurixa-reel-1/plates.cjs");
  PLATES[BG_PLATE] = {
    size: PAGE_CSS,
    scale: 1,
    html: `<img src="https://reel-bake.local/${BG_BAKE}" alt="" style="position:absolute;left:0;top:0;width:${PAGE_CSS[0]}px;height:${PAGE_CSS[1]}px">`,
  };
})();
/**
 * A part of a screen as a plate of its own: the screen's rect [x, y, w, h] (CSS px), nothing around it. A part of the
 * page carries every cover that falls in it.
 */
function cutPlate(key, [x, y, w, h]) {
  const { PLATES } = require("../../aurixa-reel-1/plates.cjs");
  const s = K3.screen(key);
  const inside = (key === PAGE ? Object.values(COVERS) : []).filter(
    ({ box: [cx, cy, cw, ch] }) => cx < x + w && cx + cw > x && cy < y + h && cy + ch > y,
  );
  const name = `R3C-${key}-${x}-${y}-${w}-${h}${inside.length ? "-covered" : ""}`;
  if (!PLATES[name])
    PLATES[name] = {
      size: [w, h],
      scale: 1,
      html: `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden"><img src="${s.src}" alt="" style="position:absolute;left:${-x}px;top:${-y}px;width:${s.css[0]}px;height:${s.css[1]}px">${inside.map((c) => coverHtml(c, [x, y])).join("")}</div>`,
    };
  return { name, css: [w, h], rect: [x, y, w, h] };
}

// ------------------------------------------------------------------ what lifts out (the page's CSS px)
const LIFTS = {
  header: { rect: [0, 36, 496, 180], zoom: 1.5 },
  indicative: { rect: [766, 1572, 616, 40], zoom: 1.62 },
  capacity: { rect: [752, 490, 658, 162], zoom: 1.48 },
  lmi: { rect: [12, 2953, 690, 200], zoom: 1.42 },
  noLmi: { rect: [14, 3408, 680, 78], zoom: 1.42 },
  liabilities: { rect: [0, 1390, 708, 455], zoom: 1.36 },
  assumptions: { rect: [732, 1328, 698, 98], zoom: 1.42 },
  method: { rect: [0, 760, 708, 138], zoom: 1.38 },
  declared: { rect: [0, 1128, 708, 145], zoom: 1.38 },
  band: { rect: [770, 1172, 622, 60], zoom: 1.5 },
};
for (const L of Object.values(LIFTS)) L.plate = cutPlate(PAGE, L.rect);
const NAMES = Object.keys(LIFTS);
/** A lift-out's window height in the frame, at its zoom. */
const tall = (name) => LIFTS[name].rect[3] * LIFTS[name].zoom + 2 * PAD;

/** A rect of the page (CSS px) within a lift-out's plate. */
const within = (name, [x, y, w, h]) => [x - LIFTS[name].rect[0], y - LIFTS[name].rect[1], w, h];

const css = `
.pg-glow { position:absolute; left:0; top:0; border-radius:28px; pointer-events:none; z-index:7;
  box-shadow:0 0 0 2px rgba(215,179,95,.55), 0 0 46px rgba(215,179,95,.35), inset 0 0 30px rgba(215,179,95,.10); }
.pg-rule { position:absolute; left:0; top:0; height:3px; border-radius:2px; transform-origin:0 50%; pointer-events:none; z-index:20;
  background:linear-gradient(90deg, #c89b3c, #f5d17a 55%, rgba(245,209,122,.25)); box-shadow:0 0 14px rgba(245,209,122,.6); }
`;

function pageScene() {
  const s3 = shotOf("05.3");
  const s5 = shotOf("05.5");
  const T0 = s3.in;
  const [, PRESS, LIT, LANDS] = [0, ...[0, 1, 2].map((i) => beat("05.3", i))];
  const [POWER, DEPOSIT, COMMIT] = [0, 1, 2].map((i) => beat("05.4", i));
  const [ASSUME, USED] = [0, 1].map((i) => beat("05.5", i));
  const END = s5.out;

  // When each lift-out flies out of the page, where it sits (its window's top, frame px) from when, and when it goes.
  const PLAN = {
    header: { enter: PRESS + 0.1, slots: [[0, 396]], exit: POWER - 0.42 },
    indicative: { enter: LIT - 0.45, slots: [[0, 724]], exit: POWER - 0.42 },
    capacity: {
      enter: LANDS - 0.5,
      slots: [
        [0, 836],
        [POWER - 0.42, 404],
      ],
      exit: DEPOSIT + 1.2,
    },
    lmi: { enter: DEPOSIT - 0.45, slots: [[0, 700]], exit: COMMIT - 0.5 },
    noLmi: { enter: DEPOSIT - 0.22, slots: [[0, 1030]], exit: COMMIT - 0.5 },
    liabilities: { enter: COMMIT - 0.42, slots: [[0, 430]], exit: ASSUME - 0.42 },
    assumptions: { enter: ASSUME - 0.42, slots: [[0, 420]], exit: USED - 0.48 },
    method: {
      enter: ASSUME - 0.2,
      slots: [
        [0, 610],
        [USED - 0.48, 404],
      ],
      exit: END - 0.45,
    },
    declared: { enter: USED - 0.42, slots: [[0, 634]], exit: END - 0.45 },
    band: { enter: USED + 0.42, slots: [[0, 884]], exit: END - 0.45 },
  };
  // Lift-outs after 05.2's card: the capacity rides up once the first two have gone, so the deposit can come in under it.
  PLAN.capacity.slots = [
    [0, 836],
    [POWER - 0.42, 404],
  ];
  // What the focus corners close on, in turn: [lift-out, the page's rect, from].
  const MARKS = [
    ["indicative", [766, 1572, 616, 40], LIT - 0.05],
    ["capacity", [775, 535, 200, 44], POWER - 0.02],
    ["lmi", [32, 3100, 652, 46], DEPOSIT + 0.05],
    ["noLmi", [17, 3412, 674, 70], DEPOSIT + 0.9],
    ["liabilities", [25, 1788, 658, 52], COMMIT],
    ["assumptions", [757, 1360, 648, 60], ASSUME],
    ["method", [25, 818, 230, 34], ASSUME + 1.05],
    ["declared", [25, 1228, 658, 44], USED],
    ["band", [770, 1172, 622, 60], USED + 0.9],
  ];
  // The backdrop's drift: the page's y at the window's centre, to where the voice is.
  const DRIFT = [
    [T0, 520],
    [PRESS + 0.6, 560],
    [LIT - 0.6, 1180],
    [LANDS - 0.6, 900],
    [DEPOSIT - 0.7, 2900],
    [COMMIT - 0.6, 1600],
    [ASSUME - 0.6, 1120],
    [USED - 0.6, 1160],
    [END - 0.5, BG_END_Y],
  ];
  const keyed = (keys, t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++)
      if (t < keys[i][0]) {
        const [a, va] = keys[i - 1];
        const [b, vb] = keys[i];
        return lerp(va, vb, span(t, a, b, EASE.move));
      }
    return keys.at(-1)[1];
  };

  const html = () =>
    [
      `<style>${K3.barCss}${K3.labelCss}${K3.demoCss}${css}</style>`,
      CARD.html(),
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("BG", [BG_PLATE, SAFE.name], 2),
      windowHtml("CW", [CARD.PLATE], 6),
      ...NAMES.map((n, i) => windowHtml(`L${i}`, [LIFTS[n].plate.name], 8 + i)),
      `<div class="pg-glow" id="pg-glow" style="visibility:hidden"></div>`,
      `<div class="pg-rule" id="pg-rule" style="visibility:hidden"></div>`,
      `<div class="fk-layer" style="z-index:30">${focusHtml()}</div>`,
      K3.demoHtml(),
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // ---------------------------------------------------------------- 05.2's card, and View Full Calculator
    CARD.finalCard(st);
    const go = span(t, PRESS + 0.06, PRESS + 0.55, EASE.move);
    const cardFraming = CARD.framing(
      lerp(CARD.DRIFT, CARD.DRIFT * 1.01, span(t, T0, PRESS, EASE.linear)),
    );
    const gc = placeWindow(st, "CW", CARD.css, cardFraming, [1], {
      opacity: 1 - span(t, PRESS + 0.12, PRESS + 0.5, EASE.linear),
      transform: `scale(${r3(lerp(1, 1.16, go))})`,
    });
    const full = CARD.part("full");
    const button = gc.map([full[0] + full[2] * 0.5 + 40, full[1] + full[3] / 2 + 6]);
    pointer(st, t, {
      from: [930, 1330],
      to: button,
      a: T0 + 0.05,
      b: PRESS - 0.08,
      bow: 0.1,
      show: T0,
      hide: PRESS + 0.3,
      press: PRESS,
    });

    // ---------------------------------------------------------------- the page behind
    const bgIn = span(t, PRESS + 0.05, PRESS + 0.5, EASE.settle);
    // At the end of 05.5 the page comes into focus, for 05.6 to pull back from.
    const sharp = span(t, END - 0.5, END - 0.04, EASE.move);
    const gb = placeWindow(
      st,
      "BG",
      PAGE_CSS,
      { rect: BG_RECT, zoom: BGZ, focus: [PAGE_CSS[0] / 2, keyed(DRIFT, t)], at: BG_AT },
      [1 - sharp, sharp],
      {
        opacity: lerp(0.62, 1, sharp) * bgIn,
        veil: lerp(0.5, 0.1, sharp),
        transform: `scale(${r3(lerp(0.94, 1, bgIn))})`,
      },
    );

    // ---------------------------------------------------------------- the lift-outs
    const placed = {};
    NAMES.forEach((n, i) => {
      const L = LIFTS[n];
      const P = PLAN[n];
      const w = L.rect[2] * L.zoom + 2 * PAD;
      const h = tall(n);
      // Its place: the first slot from when it lands; each later one moved to over half a second from its time.
      let top = P.slots[0][1];
      for (const [at, y] of P.slots.slice(1)) top = lerp(top, y, span(t, at, at + 0.5, EASE.move));
      const front = {
        rect: [540 - w / 2, top, w, h],
        zoom: L.zoom,
        focus: [L.rect[2] / 2, L.rect[3] / 2],
        at: [540, top + h / 2],
      };
      // Where it sits in the page behind, at the moment it leaves.
      const src = throughRect(gb, L.rect);
      const from = {
        rect: [src[0] - PAD, src[1] - PAD, src[2] + 2 * PAD, src[3] + 2 * PAD],
        zoom: BGZ,
        focus: front.focus,
        at: [src[0] + src[2] / 2, src[1] + src[3] / 2],
      };
      const fly = span(t, P.enter, P.enter + 0.62, EASE.move);
      const gone = span(t, P.exit, P.exit + 0.42, EASE.move);
      const shown = t >= P.enter && gone < 1;
      const framing = fly < 1 ? between(L.plate.css, from, front, fly) : front;
      const g = placeWindow(st, `L${i}`, L.plate.css, framing, [1], {
        opacity: shown ? span(t, P.enter, P.enter + 0.2, EASE.linear) * (1 - gone) : 0,
        transform: `translateY(${px(-70 * gone)}) scale(${r3(lerp(1, 0.96, gone))})`,
      });
      placed[n] = { g, gone };
    });

    // ---------------------------------------------------------------- the focus, closing on what the voice names
    const mark = [...MARKS].reverse().find(([, , a]) => t >= a);
    if (mark) {
      const [n, rect, a] = mark;
      const { g, gone } = placed[n];
      const r = throughRect(g, within(n, rect));
      r[1] -= 70 * gone;
      corners(st, t, r, a, a + 0.36);
      const next = MARKS[MARKS.indexOf(mark) + 1];
      const out = Math.max(gone, next ? span(t, next[2] - 0.12, next[2], EASE.linear) : 0);
      if (out > 0) st.set("#focus", fade(1 - out));
    } else st.set("#focus", fade(0));
    // "Indicative": the page's own line, lit.
    {
      const { g, gone } = placed.indicative;
      const [x, y, w, h] = g.rect;
      const lit = span(t, LIT - 0.1, LIT + 0.3, EASE.settle) * (1 - gone);
      st.set("#pg-glow", {
        transform: `translate(${px(x)}, ${px(y - 70 * gone)})`,
        width: px(w),
        height: px(h),
        ...fade(lit),
      });
      // A gold rule draws under "for indicative purposes only" (the words' place on the page, measured on the frame).
      const ruleAt = throughRect(g, within("indicative", [884, 1601, 147, 3]));
      const draw = span(t, LIT, LIT + 0.55, EASE.move);
      st.set("#pg-rule", {
        transform: `translate(${px(ruleAt[0])}, ${px(ruleAt[1] - 70 * gone)}) scaleX(${r3(draw)})`,
        width: px(ruleAt[2]),
        ...fade(draw > 0 ? 1 - gone : 0),
      });
    }

    // ---------------------------------------------------------------- the labels
    // DEMO WORKSPACE on the page behind (its bar is the page's own top bar: the product's, never cropped away here)
    K3.demoState(st, t, { ...gb, oy: -1e6 }, { opacity: bgIn });
    K3.labelState(st, t, { a: T0, inAtCut: true, outAtCut: true });
    return st;
  };

  return {
    id: "page",
    shots: ["05.3", "05.4", "05.5"],
    palette: "aurixa",
    html,
    state,
    bake: () => [
      {
        name: BG_BAKE,
        width: PAGE_CSS[0],
        height: PAGE_CSS[1],
        html: `<img src="${K3.screen(PAGE).src}" alt="" style="position:absolute;left:0;top:0;width:${PAGE_CSS[0]}px;height:${PAGE_CSS[1]}px;filter:blur(5px) saturate(.85)">`,
      },
    ],
  };
}

module.exports = pageScene;
/** The page's window as 05.5 leaves it (sharp under its covers, its veil at 0.1): 05.6 starts here. */
module.exports.pageEnd = {
  plate: SAFE,
  framing: { rect: BG_RECT, zoom: BGZ, focus: [PAGE_CSS[0] / 2, BG_END_Y], at: BG_AT },
  veil: 0.1,
};
