// Reel 3, shots 06.1 to 06.3: and why stop there? Bring their chosen property into focus. Adjust deposits, explore
// financial structures, model purchasing scenarios. Jordan Ellis's Borrowing Capacity page (the product's own, drawn
// by the screens harness), part by part, each at a zoom where its words read:
//  - 06.1: the page's head and tabs under its top bar. On "stop" the pointer presses Portfolio Scenario Modelling and
//    the tab turns (the scenario page's own head, with its CAPACITY chip, which the light crosses). Then the head
//    goes, and the top bar stays through 06.3 (and into 06.4, where it stands in the same place), carrying the DEMO
//    WORKSPACE label over every part of the page shown under it.
//  - 06.2: Model next purchase comes up under it. On "Bring" 14 Wattle Grove's card comes in, and Jordan Ellis's
//    chip; on "chosen" their facts fly into the form (the price, NSW and New build from the card; Jordan's savings and
//    intent from the client), each field ringing as one lands. On "focus" the card gives way to the answer: Effective
//    purchase power, $1,281,859, and beside it the product's own verdict, Target achievable.
//  - 06.3, a beat a phrase. On "deposits" the camera moves in on the cash on hand, which is typed down to $250,000;
//    the purchase power follows it, then both go back. On "financial" Debt Consolidation's switch pays the car loan
//    out of cash and the scenario's capacity rises to $1,111,628, +$61,842 against the base; on "structures" rates a
//    point higher take it to $964,993. On "model", "purchasing" and "scenarios" Save Scenario is pressed three times
//    and Saved Scenarios fills to four, each with its capacity.
// Kept out of frame, by where the camera cuts each part: the section's Phase 2 badge, the notes under the purchase
// power (the engine's internal codes), the headline's line under the scenario's capacity (it names a regulator and a
// serviceable ceiling), Debt Consolidation's description (it names a Phase), and the lender rates beside the page.
// The illustrative label holds through every cut of the block (05 before it and 07 after it carry it too).
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const G = require("../g-chosen.cjs");

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
  pointerHtml,
  captionHtml,
  caption,
  F,
} = M;

const BAR = { portal: "COMMAND CENTRE", page: "Borrowing Capacity", emblem: F.EMBLEM };

// ------------------------------------------------------------------ the parts of the page, as the camera cuts them
// The page's top bar, with its DEMO WORKSPACE label: up from the cut, through the block.
const APPBAR = G.barPlate(770, BAR);
// 06.1: the page's head and tabs, Calculator selected, then Portfolio Scenario Modelling with its CAPACITY chip.
const TOP = [
  G.crop("bc-page-calc", { x0: 0, y0: 50, x1: 660, y1: 226 }),
  G.crop("bc-scen-page", { x0: 0, y0: 50, x1: 660, y1: 226 }),
];
// Model next purchase, below its section's header row (the Phase 2 badge) and above the buyer toggles.
const FORM = [
  G.crop("bc-scen-purchase", { y0: 44, y1: 262 }),
  G.crop("bc-scen-purchase-250", { y0: 44, y1: 262 }),
];
// The purchase power, above the notes under it; the product's verdict at its right.
const POWER = [
  G.crop("bc-scen-purchase", { x0: 20, y0: 330, x1: 540, y1: 500 }),
  G.crop("bc-scen-purchase-250", { x0: 20, y0: 330, x1: 540, y1: 500 }),
];
const VERDICT = G.crop("bc-scen-purchase", { x0: 1262, y0: 356, x1: 1422, y1: 408 });
// Debt Consolidation's car loan row, below the section's description; the "on" capture sits 2 px lower (its
// "1 selected" badge), so it is cut 2 px lower to keep the row still across the switch.
const DEBTS = [
  G.crop("bc-scen-debts-off", { x0: 0, y0: 66, x1: 760, y1: 140 }),
  G.crop("bc-scen-debts-on", { x0: 0, y0: 68, x1: 760, y1: 142 }),
];
// The scenario's capacity, above the line under it.
const HEAD = ["purchase", "carloan", "rates"].map((k) =>
  G.crop(`bc-scen-head-${k}`, { x0: 0, y0: 0, x1: 700, y1: 98 }),
);
// The change against the base capacity.
const DELTA = ["carloan", "rates"].map((k) =>
  G.crop(`bc-scen-head-${k}`, { x0: 1236, y0: 126, x1: 1388, y1: 204 }),
);
// Interest Rate Adjustment from its +0.5% chip right: the slider, the chips, the +1.00% it reads.
const RATES = G.crop("bc-scen-rates", { x0: 720, y0: 60, x1: 1440, y1: 205 });
// Save Scenario, and Saved Scenarios with two, three and four rows.
const SAVE = G.crop("bc-scen-actions", { x0: 0, y0: 0, x1: 467, y1: 36 });
const SAVED = [
  G.crop("bc-scen-saved-2", { x0: 0, y0: 0, x1: 720, y1: 223 }),
  G.crop("bc-scen-saved-3", { x0: 0, y0: 0, x1: 720, y1: 298 }),
  G.crop("bc-scen-saved-4", { x0: 0, y0: 0, x1: 720, y1: 373 }),
];
const ROWS = [223, 298, 373];

// ------------------------------------------------------------------ where they stand (frame px)
const Z = {
  bar: 1.3,
  top: 1.5,
  form: 1,
  power: 1.9,
  verdict: 1.7,
  debts: 1.3,
  head: 1.4,
  delta: 1.9,
  rates: 1.36,
  save: 2,
  saved: 1.38,
};
const BAR_AT = G.centred(APPBAR.css, Z.bar, 376); // the page's top bar
const BELOW = 512; // the first part under it
// Model next purchase's window: the form from its left to the cash on hand and New build (1000 CSS px of it).
const formFrame = (zoom = Z.form) => ({
  rect: [26, BELOW, 1028, 218 * Z.form + 2 * M.PAD],
  zoom,
  focus: [0, 0],
  at: [26 + M.PAD, BELOW + M.PAD],
});
const FIELDS = {
  target: [25, 91, 689, 40],
  cash: [726, 91, 689, 40],
  state: [25, 175, 338.5, 40],
  intent: [375.5, 175, 338.5, 40],
  property: [726, 175, 338.5, 40],
};
// Each field's value as the product sets it (crop px, measured on bc-scen-purchase): `at` is its text's centre, where
// its chip lands; until then the value is held back under a patch of the field's own ground (`box`), a gradient fitted
// to the ground either side of it to within a code value. The patches sit inside the form's page, so they come in and
// go with it exactly as its pixels do.
const VALUES = {
  target: { at: [64.75, 112], box: [32.5, 102, 66.5, 20], ground: ["#16161c", "#16161b"] },
  cash: { at: [761.75, 112], box: [733, 102, 59.5, 20], ground: ["#101016", "#101015"] },
  state: { at: [53.75, 195], box: [32, 185, 45.5, 20], ground: ["#141419", "#141419"] },
  intent: { at: [413.5, 195], box: [382.5, 185, 64, 20], ground: ["#111117", "#101017"] },
  property: { at: [770.5, 194.75], box: [733, 184.5, 77, 20.5], ground: ["#0e0e13", "#0e0e13"] },
};
const FORM_HELD = (() => {
  const { PLATES } = require("../../aurixa-reel-1/plates.cjs");
  const name = `${FORM[0].name}-held`;
  if (!PLATES[name])
    PLATES[name] = {
      ...PLATES[FORM[0].name],
      html:
        PLATES[FORM[0].name].html +
        Object.entries(VALUES)
          .map(
            ([k, v]) =>
              `<div id="mk-${k}" style="position:absolute;left:${v.box[0]}px;top:${v.box[1]}px;width:${v.box[2]}px;height:${v.box[3]}px;background:linear-gradient(90deg, ${v.ground[0]}, ${v.ground[1]})"></div>`,
          )
          .join(""),
    };
  return { ...FORM[0], name };
})();
const POWER_AT = G.centred(POWER[0].css, Z.power, 784);
// The verdict, at the purchase power's right as the product sets it, nearer: over the empty right of its window.
const VERDICT_AT = G.box(
  VERDICT.css,
  Z.verdict,
  POWER_AT.rect[0] + POWER_AT.rect[2] - (VERDICT.css[0] * Z.verdict + 2 * M.PAD) - 18,
  778,
);
const DEBTS_AT = G.centred(DEBTS[0].css, Z.debts, 556);
const RATES_AT = G.centred(RATES.css, Z.rates, 556);
const HEAD_AT = [G.centred(HEAD[0].css, Z.head, 712), G.centred(HEAD[0].css, Z.head, 808)];
// The change against the base, over the empty right of the capacity's window, where the product sets it.
const DELTA_AT = (y) =>
  G.box(
    DELTA[0].css,
    Z.delta,
    HEAD_AT[0].rect[0] + HEAD_AT[0].rect[2] - (DELTA[0].css[0] * Z.delta + 2 * M.PAD) - 14,
    y,
  );
const DELTA_Y = HEAD_AT[0].rect[1] - 6;
const SAVE_AT = G.centred(SAVE.css, Z.save, 516);
const SAVED_AT = G.centred(SAVED[2].css, Z.saved, 636);
const EYE_AT = [64, 530];
const PROP_AT = [60, 786];
const CLIENT_AT = [600, 1044];

function scenariosScene() {
  const s1 = shotOf("06.1");
  const s3 = shotOf("06.3");
  const T0 = s1.in;
  const END = s3.out;
  const tPress = beat("06.1", 1); // "stop"
  const w = (text, after) => G.word(text, after).at;
  const tBring = w("bring", T0);
  const tChosen = w("chosen", tBring);
  const tFocus = w("focus", tChosen);
  const tAdjust = w("adjust", tFocus);
  const tDeposits = w("deposits", tAdjust);
  const tExplore = w("explore", tDeposits);
  const tFinancial = w("financial", tExplore);
  const tStructures = w("structures", tFinancial);
  const tModel = w("model", tStructures);
  const tPurchasing = w("purchasing", tModel);
  const tScenarios = w("scenarios", tPurchasing);

  // 06.2: the facts, leaving the card and the client chip in turn and landing in their fields.
  const CHIPS = [
    { id: "cp-price", text: "$1,150,000", from: "price", field: "target" },
    { id: "cp-state", text: "NSW", from: "state", field: "state" },
    { id: "cp-build", text: "New build", from: "build", field: "property" },
    { id: "cp-cash", text: "$300,000", from: "savings", field: "cash", cyan: true },
    { id: "cp-intent", text: "Investor", from: "intent", field: "intent", cyan: true },
  ].map((c, i) => ({ ...c, a: tChosen + 0.08 + i * 0.12, b: tChosen + 0.5 + i * 0.12 }));
  // 06.3's presses: the cash, back again; the switch; +1%; Save Scenario three times.
  const tCash = tDeposits + 0.02;
  const tBack = tDeposits + 0.6;
  const tSwitch = tFinancial + 0.08;
  const tRate = tStructures + 0.3;
  const tSaves = [tModel + 0.3, tPurchasing + 0.2, tScenarios + 0.04];
  const tOutA = tExplore - 0.06; // the purchase's parts go
  const tOutB = tModel - 0.12; // the scenario's parts go

  const html = () =>
    [
      `<style>${K3.barCss}${K3.labelCss}${G.css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("AB", [APPBAR.name], 9),
      windowHtml(
        "TP",
        TOP.map((p) => p.name),
        8,
      ),
      windowHtml("FM", [FORM_HELD.name, FORM[1].name], 5),
      windowHtml(
        "PW",
        POWER.map((p) => p.name),
        5,
      ),
      windowHtml("VD", [VERDICT.name], 6),
      windowHtml(
        "DB",
        DEBTS.map((p) => p.name),
        5,
      ),
      windowHtml("RT", [RATES.name], 5),
      windowHtml(
        "HD",
        HEAD.map((p) => p.name),
        5,
      ),
      windowHtml(
        "DL",
        DELTA.map((p) => p.name),
        6,
      ),
      windowHtml("SV", [SAVE.name], 5),
      windowHtml(
        "SL",
        SAVED.map((p) => p.name),
        5,
      ),
      `<div class="fk-layer" style="z-index:12">`,
      G.eyeHtml("ey-debts", "Debt consolidation"),
      G.eyeHtml("ey-rates", "Interest rate adjustment"),
      G.propHtml("prop"),
      G.clientHtml("client"),
      ...Object.keys(FIELDS).map((k) => G.ringHtml(`rg-${k}`)),
      G.sweepHtml("sw-chip"),
      G.sweepHtml("sw-power"),
      G.sweepHtml("sw-head"),
      G.sweepHtml("sw-row"),
      `</div>`,
      `<div class="fk-layer" style="z-index:14">${CHIPS.map((c) => G.chipHtml(c.id, c.text, c.cyan)).join("")}</div>`,
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  // Where each part stands at t, and how much of it shows.
  // 06.1's head and tabs: the camera easing in on them until the press.
  const topFrame = (t) => {
    const zoom = lerp(1.4, Z.top, span(t, T0, tPress + 0.3, EASE.move));
    const css = TOP[0].css;
    return G.box(css, zoom, 540 - (css[0] * zoom) / 2 - M.PAD, 586);
  };
  const formFrameAt = (t) => {
    const into = span(t, tAdjust - 0.12, tDeposits - 0.08, EASE.move);
    if (into <= 0) return formFrame();
    const cash = FIELDS.cash;
    const r = formFrame().rect;
    const near = {
      rect: r,
      zoom: 1.42,
      focus: [cash[0] + 300, cash[1] + 2],
      at: [r[0] + r[2] / 2, r[1] + r[3] / 2],
    };
    return between(FORM[0].css, formFrame(), near, into);
  };

  // A value changing at `a`: the page with the new value comes over the one before in 0.08 s (2.4 frames, under the
  // light that crosses it); the parts that do not change are the same on both, so they never dip.
  const over = (t, a) => span(t, a, a + 0.08, EASE.linear);
  // A part entering from below (rise over [a, a + d]) and leaving upwards (over [b, b + d]): its offset and opacity.
  const comeGo = (t, a, b, d = 0.34, dist = 70) => {
    const inn = span(t, a, a + d, EASE.settle);
    const out = span(t, b, b + d * 0.85, EASE.move);
    return { dy: dist * (1 - inn) - dist * 1.2 * out, o: Math.min(inn, 1 - out) };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    K3.labelState(st, t, { a: T0, inAtCut: true, outAtCut: true });

    // ---------------------------------------------------------------- 06.1, under the page's top bar
    const settle = 1 - span(t, T0, T0 + 0.4, EASE.settle);
    placeWindow(st, "AB", APPBAR.css, BAR_AT, [1], {
      transform: `translateY(${px(-10 * settle)})`,
    });
    const tf = topFrame(t);
    const turned = over(t, tPress + 0.03);
    const tIn = comeGo(t, T0 - 1, tPress + 0.5, 0.34, 70);
    const gTop = placeWindow(st, "TP", TOP[0].css, tf, [1, turned], {
      opacity: tIn.o,
      transform: `translateY(${px(16 * settle + tIn.dy)})`,
    });
    // The CAPACITY chip lights as the tab turns.
    const chip = G.toFrame(gTop, tf.zoom, TOP[1].at([459, 170, 182, 35]));
    G.sweepState(
      st,
      t,
      "sw-chip",
      [chip[0], chip[1] + tIn.dy, chip[2], chip[3]],
      tPress + 0.14,
      tPress + 0.52,
    );

    // ---------------------------------------------------------------- 06.2: Model next purchase
    const fIn = comeGo(t, tPress + 0.62, tOutA, 0.4, 80);
    const ff = formFrameAt(t);
    const typed = over(t, tCash + 0.06) * (1 - over(t, tBack + 0.04));
    const gForm = placeWindow(st, "FM", FORM[0].css, ff, [1, typed], {
      opacity: fIn.o,
      transform: `translateY(${px(fIn.dy)})`,
    });
    // A field's frame rect, cut to the window's page (a field running past the window's edge rings only inside it).
    const fieldAt = (k) => {
      const r = G.toFrame(gForm, ff.zoom, FIELDS[k]);
      const x0 = ff.rect[0] + M.PAD;
      const x1 = x0 + gForm.pw;
      const left = Math.max(r[0], x0);
      const right = Math.min(r[0] + r[2], x1 - 4);
      return [left, r[1] + fIn.dy, right - left, r[3]];
    };

    // 14 Wattle Grove's card, in from the left on "Bring"; out, down, on "focus".
    const cardIn = span(t, tBring - 0.1, tChosen, EASE.move);
    const cardOut = span(t, tFocus - 0.16, tFocus + 0.18, EASE.move);
    const cx = lerp(-1040, PROP_AT[0], cardIn) - 1100 * cardOut;
    const cy = PROP_AT[1];
    st.set("#prop", {
      transform: `translate(${px(cx)}, ${px(cy)}) rotate(${r3(lerp(-4, 0, cardIn))}deg)`,
      ...fade(Math.min(span(t, tBring - 0.12, tBring + 0.08, EASE.linear), 1 - cardOut)),
    });
    st.set("#prop-gl", {
      transform: `translateX(${px(lerp(-240, 1020, span(t, tChosen - 0.05, tChosen + 0.6, EASE.move)))}) skewX(-16deg)`,
    });
    // Jordan Ellis's chip, in from the right.
    const clIn = span(t, tBring + 0.12, tChosen + 0.12, EASE.move);
    st.set("#client", {
      transform: `translate(${px(lerp(1120, CLIENT_AT[0], clIn) + 600 * cardOut)}, ${px(CLIENT_AT[1])})`,
      ...fade(Math.min(span(t, tBring + 0.1, tBring + 0.3, EASE.linear), 1 - cardOut)),
    });
    // The facts, into their fields.
    const fromAt = {
      price: [PROP_AT[0] + m.price[0] + m.price[2] / 2, PROP_AT[1] + m.price[1] + m.price[3] / 2],
      state: [PROP_AT[0] + m.addr[0] + m.addr[2] * 0.72, PROP_AT[1] + m.addr[1] + m.addr[3] / 2],
      build: [PROP_AT[0] + m.tag[0] + m.tag[2] / 2, PROP_AT[1] + m.tag[1] + m.tag[3] / 2],
      savings: [
        CLIENT_AT[0] + m.save[0] + m.save[2] * 0.42,
        CLIENT_AT[1] + m.save[1] + m.save[3] / 2,
      ],
      intent: [
        CLIENT_AT[0] + m.save[0] + m.save[2] * 0.86,
        CLIENT_AT[1] + m.save[1] + m.save[3] / 2,
      ],
    };
    for (const c of CHIPS) {
      const f = fieldAt(c.field);
      // The chip lands on its value's own words and is taken into them as the value comes up from under its patch.
      const [vx, vy] = gForm.map(VALUES[c.field].at);
      G.chipState(st, t, c.id, {
        from: fromAt[c.from],
        to: [vx, vy + fIn.dy],
        a: c.a,
        b: c.b,
        scale: 0.78,
      });
      G.ringState(st, t, `rg-${c.field}`, f, c.b - 0.04);
      st.set(`#mk-${c.field}`, { opacity: r3(1 - span(t, c.b + 0.02, c.b + 0.2, EASE.linear)) });
    }

    // On "focus": the purchase power, and the product's verdict beside it.
    const pIn = comeGo(t, tFocus + 0.04, tOutA, 0.36, 90);
    const powered = over(t, tCash + 0.16) * (1 - over(t, tBack + 0.12));
    const gPow = placeWindow(st, "PW", POWER[0].css, POWER_AT, [1, powered], {
      opacity: pIn.o,
      transform: `translateY(${px(pIn.dy)})`,
    });
    const figure = G.toFrame(gPow, Z.power, POWER[0].at([36, 368, 200, 44]));
    const sweepPower =
      t < tCash
        ? [tFocus + 0.12, tFocus + 0.62]
        : t < tBack
          ? [tCash + 0.2, tCash + 0.62]
          : [tBack + 0.18, tBack + 0.6];
    G.sweepState(
      st,
      t,
      "sw-power",
      [figure[0], figure[1] + pIn.dy, figure[2], figure[3]],
      ...sweepPower,
    );
    const vIn = comeGo(t, tFocus + 0.22, tOutA + 0.04, 0.32, 60);
    placeWindow(st, "VD", VERDICT.css, VERDICT_AT, [1], {
      opacity: vIn.o,
      transform: `translateY(${px(vIn.dy)}) scale(${r3(lerp(0.9, 1, span(t, tFocus + 0.22, tFocus + 0.5, EASE.settle)))})`,
    });

    // ---------------------------------------------------------------- 06.3: the structures
    const dIn = comeGo(t, tExplore - 0.02, tStructures - 0.06, 0.34, 80);
    const switched = over(t, tSwitch + 0.04);
    const gDebt = placeWindow(st, "DB", DEBTS[0].css, DEBTS_AT, [1, switched], {
      opacity: dIn.o,
      transform: `translate(${px(-140 * span(t, tStructures - 0.06, tStructures + 0.24, EASE.move))}, ${px(Math.max(0, dIn.dy))})`,
    });
    G.eyeState(st, t, "ey-debts", EYE_AT, tExplore + 0.02, tStructures + 0.12);
    const rIn = span(t, tStructures - 0.02, tStructures + 0.3, EASE.settle);
    const rOut = span(t, tOutB, tOutB + 0.24, EASE.move);
    const gRate = placeWindow(st, "RT", RATES.css, RATES_AT, [1], {
      opacity: Math.min(rIn, 1 - rOut),
      transform: `translate(${px(160 * (1 - rIn))}, ${px(-84 * rOut)})`,
    });
    G.eyeState(st, t, "ey-rates", EYE_AT, tStructures + 0.06, tOutB + 0.24);
    // The scenario's capacity: in with the debts, down a little as the rates' taller card comes, up and away on "model".
    const hIn = comeGo(t, tExplore + 0.06, tOutB, 0.3, 90);
    const down = span(t, tStructures - 0.04, tStructures + 0.3, EASE.move);
    const hf = G.moved(HEAD_AT[0], 0, (HEAD_AT[1].rect[1] - HEAD_AT[0].rect[1]) * down);
    const gHead = placeWindow(
      st,
      "HD",
      HEAD[0].css,
      hf,
      [1, over(t, tSwitch + 0.16), over(t, tRate + 0.06)],
      {
        opacity: hIn.o,
        transform: `translateY(${px(hIn.dy)})`,
      },
    );
    const capFig = G.toFrame(gHead, Z.head, HEAD[0].at([20, 52, 320, 46]));
    const sweepHead = t < tRate ? [tSwitch + 0.18, tSwitch + 0.5] : [tRate + 0.06, tRate + 0.36];
    G.sweepState(
      st,
      t,
      "sw-head",
      [capFig[0], capFig[1] + hIn.dy, capFig[2], capFig[3]],
      ...sweepHead,
    );
    const lIn = span(t, tSwitch + 0.26, tSwitch + 0.56, EASE.settle);
    const lOut = span(t, tOutB, tOutB + 0.24, EASE.move);
    const lf = G.moved(DELTA_AT(DELTA_Y), 0, (HEAD_AT[1].rect[1] - HEAD_AT[0].rect[1]) * down);
    placeWindow(st, "DL", DELTA[0].css, lf, [1, over(t, tRate + 0.1)], {
      opacity: Math.min(lIn, 1 - lOut),
      transform: `translateY(${px(-84 * lOut)}) scale(${r3(lerp(0.9, 1, lIn))})`,
    });

    // ---------------------------------------------------------------- 06.3: the scenarios, saved
    const sIn = comeGo(t, tOutB + 0.1, END + 1, 0.3, 80);
    const gSave = placeWindow(st, "SV", SAVE.css, SAVE_AT, [1], {
      opacity: sIn.o,
      transform: `translateY(${px(sIn.dy)})`,
    });
    const lsIn = comeGo(t, tSaves[0] + 0.04, END + 1, 0.34, 80);
    const grow1 = span(t, tSaves[1] + 0.06, tSaves[1] + 0.4, EASE.settle);
    const grow2 = span(t, tSaves[2] + 0.06, tSaves[2] + 0.4, EASE.settle);
    const rows = lerp(lerp(ROWS[0], ROWS[1], grow1), ROWS[2], grow2);
    const lf2 = G.box(SAVED[2].css, Z.saved, SAVED_AT.rect[0], SAVED_AT.rect[1], rows);
    const gSaved = placeWindow(
      st,
      "SL",
      SAVED[2].css,
      lf2,
      [
        1,
        span(t, tSaves[1] + 0.06, tSaves[1] + 0.16, EASE.linear),
        span(t, tSaves[2] + 0.06, tSaves[2] + 0.16, EASE.linear),
      ],
      { opacity: lsIn.o, transform: `translateY(${px(lsIn.dy)})` },
    );
    const newRow = t < tSaves[2] ? [25, 206, 680, 67] : [25, 281, 680, 67];
    const rowAt = G.toFrame(gSaved, Z.saved, newRow);
    const sweepRow =
      t < tSaves[2] ? [tSaves[1] + 0.2, tSaves[1] + 0.62] : [tSaves[2] + 0.2, tSaves[2] + 0.62];
    G.sweepState(st, t, "sw-row", [rowAt[0], rowAt[1] + lsIn.dy, rowAt[2], rowAt[3]], ...sweepRow);

    // ---------------------------------------------------------------- the pointer, through the block
    const cashAt = (() => {
      const r = G.toFrame(
        G.geometry(FORM[0].css, formFrameAt(tCash)),
        formFrameAt(tCash).zoom,
        FIELDS.cash,
      );
      return [r[0] + r[2] * 0.12, r[1] + r[3] * 0.55];
    })();
    const sw = G.centreOf(
      G.toFrame(G.geometry(DEBTS[0].css, DEBTS_AT), Z.debts, DEBTS[0].at([38, 92, 44, 24])),
    );
    const plus1 = G.centreOf(
      G.toFrame(G.geometry(RATES.css, RATES_AT), Z.rates, RATES.at([957, 171, 225, 28])),
    );
    const save = (() => {
      const r = G.toFrame(G.geometry(SAVE.css, SAVE_AT), Z.save, [140, 4, 190, 28]);
      return [r[0] + r[2] * 0.5, r[1] + r[3] * 0.6];
    })();
    const p1 = topFrame(tPress);
    const tabAt = G.centreOf(
      G.toFrame(G.geometry(TOP[0].css, p1), p1.zoom, TOP[0].at("tabScenarios")),
    );
    if (t < s1.out) {
      G.pointerPath(st, t, {
        start: [930, 1110],
        moves: [{ to: [tabAt[0] + 10, tabAt[1] + 4], a: T0 + 0.05, b: tPress - 0.04, bow: 0.12 }],
        presses: [tPress],
        show: T0 + 0.02,
        hide: tPress + 0.38,
      });
    } else {
      G.pointerPath(st, t, {
        start: [1000, 1120],
        moves: [
          { to: cashAt, a: tAdjust + 0.02, b: tCash - 0.03, bow: 0.1 },
          { to: [sw[0] + 6, sw[1] + 4], a: tExplore + 0.12, b: tSwitch - 0.03, bow: -0.1 },
          { to: [plus1[0] + 8, plus1[1] + 4], a: tStructures + 0.02, b: tRate - 0.03, bow: 0.12 },
          { to: save, a: tOutB + 0.16, b: tSaves[0] - 0.04, bow: -0.12 },
        ],
        presses: [tCash, tBack - 0.04, tSwitch, tRate, ...tSaves],
        show: tAdjust,
        hide: tSaves[2] + 0.42,
      });
    }
    return st;
  };

  return {
    id: "scenarios",
    shots: ["06.1", "06.2", "06.3"],
    palette: "aurixa",
    html,
    state,
    measure: {
      price: ["#prop", ".p", false],
      addr: ["#prop", ".a", false],
      tag: ["#prop", ".tag", false],
      save: ["#client", ".r", false],
    },
  };
}

module.exports = scenariosScene;
