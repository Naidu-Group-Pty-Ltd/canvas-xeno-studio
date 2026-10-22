// Reel 1, shot 08.3: the next decision, in the client's portal. The Client Portal's Reports page with the report
// marked New; then the next discussion's card from My Appointments slides in beside it, and the pointer comes to
// rest on Download Report. Both are framed close, at the size the client reads them: the Reports page from its
// heading to the report's card, and My Appointments' upcoming card in a window of its own beneath, at the same
// zoom and cut to the same columns. Both float in depth (./workflowStage.cjs).
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  r3,
  px,
  State,
  fade,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;
const S = require("./workflowStage.cjs");

// ------------------------------------------------------------------ 08.3: the report and the next discussion
function clientReportsScene() {
  const css = F.plate("NEW-CLIENT-REPORTS-a").css;
  const [tIn, tCard] = [0, 1].map((i) => beat("08.3", i));
  // The page's columns both windows show (the menu left out, the report card's date beyond the edge), at ZOOM.
  const ZOOM = 1.9;
  const COLS = [196, 972 / ZOOM];
  // The Reports page from its heading to the report's card.
  const VIEW_Y = [56, 350];
  const RECT = [40, 396, 1000, (VIEW_Y[1] - VIEW_Y[0]) * ZOOM + 2 * M.PAD];
  const framing = {
    rect: RECT,
    zoom: ZOOM,
    focus: [COLS[0] + COLS[1] / 2, (VIEW_Y[0] + VIEW_Y[1]) / 2],
    at: [540, RECT[1] + RECT[3] / 2],
  };
  const DOWNLOAD = [352, 324]; // the pointer's tip on Download Report, as A08c sets it
  // My Appointments: its Upcoming heading and the walkthrough's card, in a window beneath.
  const CROP = [COLS[0], 142, COLS[1], 116];
  const APPT_TOP = RECT[1] + RECT[3] + 30;
  const APPT = [40, APPT_TOP, CROP[2] * ZOOM + 2 * M.PAD, CROP[3] * ZOOM + 2 * M.PAD];
  const appointment = KIT.camera({
    plate: F.plate("NEW-CLIENT-REPORTS-b"),
    zoom: ZOOM,
    focus: [CROP[0], CROP[1]],
    at: [APPT[0] + M.PAD, APPT[1] + M.PAD],
    crop: CROP,
  });
  const html = () =>
    [
      S.stageHtml(),
      S.stageWindow("W", ["NEW-CLIENT-REPORTS-a"], 5),
      `<div id="appt" class="fk-layer" style="z-index:6;visibility:hidden;transform-origin:${px(APPT[0] + APPT[2] / 2)} ${px(APPT[1] + APPT[3] / 2)}">${appointment}</div>`,
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    const pose = S.drift(t);
    // The two windows float as one, their light pooled beneath the lower once it is there.
    const p = span(t, tCard, tCard + 0.62, EASE.settle);
    const P = S.stageState(st, RECT, pose);
    S.poolState(st, [RECT[0], RECT[1], RECT[2], APPT[1] + APPT[3] - RECT[1]], pose, "pool", {
      strength: 1,
    });
    const g = placeWindow(st, "W", css, framing, [1], { transform: P.css });
    // Marked New: the badge glows once as the page comes up.
    const glow = Math.sin(Math.PI * span(t, tIn + 0.15, tIn + 0.75, EASE.linear));
    st.set("#W-0 .cr-new", {
      "box-shadow": `0 0 ${r3(10 * glow)}px ${r3(2 * glow)}px rgba(71,103,255,${r3(0.75 * glow)})`,
    });
    // The next discussion slides in beside the report, from the right, settling.
    st.set("#appt", {
      transform: S.pose(APPT, { ...pose, tx: (1 - p) * 140 }).css,
      ...fade(span(t, tCard, tCard + 0.26, EASE.linear)),
    });
    // The pointer comes in from the lower right and rests on Download Report.
    pointer(st, t, {
      from: [900, 1300],
      to: P.map(g.map(DOWNLOAD)),
      a: tCard + 0.05,
      b: tCard + 0.8,
      bow: 0.1,
      show: tCard - 0.05,
    });
    return st;
  };
  return { id: "clientReports", shots: ["08.3"], palette: "aurixa", html, state };
}

module.exports = clientReportsScene;
