// Reel 1, shot 13.1: the Finance Portal records the decision for 14 Wattle Grove, Subject to valuation; then, as the
// music falls away, the camera pulls back slowly to the journey rail, complete, its last reading Subject to
// valuation, and holds in the quiet. The window floats in depth (./workflowStage.cjs) and falls back behind the
// rail as the camera leaves it, so the rail is what the shot ends on.
const M = require("../motion.cjs");
const {
  beat,
  shotOf,
  EASE,
  span,
  r3,
  px,
  State,
  fade,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  bezier,
  F,
  KIT,
} = M;
const S = require("./workflowStage.cjs");

// ------------------------------------------------------------------ 13.1: a decision recorded
function decisionScene() {
  const css = F.plate("PL-13A-a").css;
  const shot = shotOf("13.1");
  const [tIn, tPress, tBack] = [0, 1, 2].map((i) => beat("13.1", i));
  const rect = [40, 440, 1000, 712];
  // Close on the dialog, Record finance decision, its Decision reading Subject to valuation.
  const DIALOG = { rect, zoom: 1.45, focus: [640, 374], at: [540, 790] };
  // F13: the page with the decision recorded, the rail above it complete.
  const F13 = { rect: [40, 476, 1000, 712], zoom: 0.95, focus: [760, 400], at: [540, 896] };
  // The pull back: one long, even move into the quiet, under way gently and coming slowly to rest.
  const BACK = bezier(0.42, 0, 0.18, 1);
  const pulled = (t) => span(t, tBack, tBack + 1.8, BACK);

  const html = () =>
    [
      S.stageHtml(),
      S.stageWindow("W", ["PL-13A-a", "PL-13A-b"], 5),
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
    const back = pulled(t);
    const fr = between(css, DIALOG, F13, back);
    // As the camera leaves the page, the window falls back and dims a little, out of focus behind the rail.
    const pose = S.drift(t);
    const P = S.stageState(
      st,
      fr.rect,
      { ...pose, tz: pose.tz - 220 * back },
      { pool: 1 - 0.5 * back },
    );
    const g = placeWindow(st, "W", css, fr, [1, closed], { transform: P.css, veil: 0.26 * back });
    st.set("#W", { filter: `blur(${px(1.3 * span(t, tBack + 0.6, tBack + 1.8, EASE.settle))})` });
    st.set("#W-0 .fdlg", {
      transform: `translate(-50%, -50%) scale(${r3(1 - 0.03 * span(t, tPress + 0.05, tPress + 0.32, EASE.move))})`,
    });
    // The product's toast: Decision recorded.
    const toast = span(t, tPress + 0.27, tPress + 0.62, EASE.settle);
    st.set("#W-1 .ftoast", {
      transform: `translateY(${px((1 - toast) * 14)})`,
      ...fade(span(t, tPress + 0.27, tPress + 0.45, EASE.linear)),
    });
    // The rail comes into view above as the camera pulls back, Decision lit; then its reading; then it holds,
    // drawing a little nearer and lower through the quiet, the window falling away beneath it.
    const railIn = span(t, tBack + 0.3, tBack + 1.05, EASE.settle);
    const reading = span(t, tBack + 1.05, tBack + 1.5, EASE.settle);
    const near = span(t, tBack + 0.9, shot.out, EASE.settle);
    const rail = {
      transform: `translateY(${px((1 - railIn) * -22 + 56 * near)}) scale(${r3(1 + 0.05 * near)})`,
      "transform-origin": "540px 310px",
    };
    st.set("#rail-a", { ...rail, ...fade(railIn * (1 - reading)) });
    st.set("#rail-b", { ...rail, ...fade(reading) });
    // The pointer to Record decision and the press; it goes before the pull back (F13 draws none).
    pointer(st, t, {
      from: [880, 1240],
      to: P.map(g.map(m.record)),
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
