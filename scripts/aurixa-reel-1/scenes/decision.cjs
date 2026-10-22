// Reel 1, shot 13.1: the Finance Portal records the decision for Residence 014, Subject to valuation; then the
// camera pulls back to the journey rail, complete, its last reading Subject to valuation.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  r3,
  px,
  State,
  fade,
  windowHtml,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;

// ------------------------------------------------------------------ 13.1: a decision recorded
function decisionScene() {
  const css = F.plate("PL-13A-a").css;
  const [tIn, tPress, tBack] = [0, 1, 2].map((i) => beat("13.1", i));
  const rect = [40, 440, 1000, 712];
  // Close on the dialog, Record finance decision, its Decision reading Subject to valuation.
  const DIALOG = { rect, zoom: 1.45, focus: [640, 374], at: [540, 790] };
  // F13: the page with the decision recorded, the rail above it complete.
  const F13 = { rect, zoom: 0.95, focus: [760, 400], at: [540, 860] };

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-13A-a", "PL-13A-b"], 5),
      railHtml("rail-a", "Decision"),
      `<div id="rail-b" style="position:absolute;inset:0;z-index:30;visibility:hidden">${KIT.rail("Decision", { complete: true, reading: "Subject to valuation" })}</div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The press closes the dialog (it eases back as it goes) and the page shows the decision recorded.
    const closed = span(t, tPress + 0.05, tPress + 0.32, EASE.linear);
    const back = span(t, tBack, tBack + 0.95, EASE.move);
    const g = placeWindow(st, "W", css, between(css, DIALOG, F13, back), [1, closed]);
    st.set("#W-0 .fdlg", {
      transform: `translate(-50%, -50%) scale(${r3(1 - 0.03 * span(t, tPress + 0.05, tPress + 0.32, EASE.move))})`,
    });
    // The product's toast: Decision recorded.
    const toast = span(t, tPress + 0.27, tPress + 0.62, EASE.settle);
    st.set("#W-1 .ftoast", {
      transform: `translateY(${px((1 - toast) * 14)})`,
      ...fade(span(t, tPress + 0.27, tPress + 0.45, EASE.linear)),
    });
    // The rail comes into view above as the camera pulls back, Decision lit; then its reading.
    const railIn = span(t, tBack + 0.15, tBack + 0.65, EASE.settle);
    const reading = span(t, tBack + 0.75, tBack + 1.15, EASE.settle);
    st.set("#rail-a", {
      transform: `translateY(${px((1 - railIn) * -22)})`,
      ...fade(railIn * (1 - reading)),
    });
    st.set("#rail-b", fade(reading));
    // The pointer to Record decision and the press; it goes before the pull back (F13 draws none).
    pointer(st, t, {
      from: [880, 1240],
      to: g.map(m.record),
      a: tPress - 0.45,
      b: tPress - 0.03,
      show: tPress - 0.53,
      hide: tPress + 0.62,
      press: tPress,
    });
    return st;
  };

  return {
    id: "decision",
    shots: ["13.1"],
    palette: "aurixa",
    html,
    measure: { buttons: ["#W-0", ".fdlg .btn", true] },
    derive(m) {
      const [x, y, w, h] = m.buttons[1]; // Cancel, then Record decision
      return { ...m, record: [x + w * 0.64, y + h * 0.6] };
    },
    state,
  };
}

module.exports = decisionScene;
