// Reel 1, shot 08.3: the next decision, in the client's portal. The Client Portal's Reports page with the report
// marked New; then the next discussion's card from My Appointments slides in beside it, and the pointer comes to
// rest on Download Report.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;

// ------------------------------------------------------------------ 08.3: the report and the next discussion
function clientReportsScene() {
  const css = F.plate("NEW-CLIENT-REPORTS-a").css;
  const [tIn, tCard] = [0, 1].map((i) => beat("08.3", i));
  // A08c: the Reports page, whole, in a window cut to it; the appointment's card below it.
  const framing = {
    rect: [40, 400, 1000, 636],
    zoom: 972 / 960,
    focus: [480, 300],
    at: [540, 718],
  };
  const DOWNLOAD = [352, 324]; // the pointer's tip on Download Report, as A08c sets it
  const card = KIT.camera({
    plate: F.plate("NEW-CLIENT-REPORTS-b"),
    zoom: 1.25,
    focus: [205, 176],
    at: [90, 1078],
    crop: [205, 176, 720, 73],
    chrome: false,
    style: "z-index:6;border-radius:14px;box-shadow:var(--reel-shadow-document)",
  });
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["NEW-CLIENT-REPORTS-a"], 5),
      `<div id="appt" class="fk-layer" style="z-index:6;visibility:hidden">${card}</div>`,
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    const g = placeWindow(st, "W", css, framing, [1]);
    // Marked New: the badge glows once as the page comes up.
    const glow = Math.sin(Math.PI * span(t, tIn + 0.15, tIn + 0.75, EASE.linear));
    st.set("#W-0 .cr-new", {
      "box-shadow": `0 0 ${r3(10 * glow)}px ${r3(2 * glow)}px rgba(71,103,255,${r3(0.75 * glow)})`,
    });
    // The next discussion slides in beside the report, from the right, settling.
    const p = span(t, tCard, tCard + 0.62, EASE.settle);
    st.set("#appt", {
      transform: `translateX(${px((1 - p) * 140)})`,
      ...fade(span(t, tCard, tCard + 0.26, EASE.linear)),
    });
    // The pointer comes in from the lower right and rests on Download Report.
    pointer(st, t, {
      from: [930, 1020],
      to: g.map(DOWNLOAD),
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
