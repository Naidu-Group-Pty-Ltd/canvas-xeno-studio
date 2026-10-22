// Reel 1, shot 05.1: from research into financial analysis.
const M = require("../motion.cjs");
const {
  BRIEF,
  FPS,
  frameOf,
  shotOf,
  beat,
  EASE,
  PRESS,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  PAD,
  whole,
  between,
  placeWindow,
  throughRect,
  POINTER_TIP,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  railHtml,
  RENDER_CSS,
  F,
  KIT,
  CAP,
} = M;

// ------------------------------------------------------------------ 05.1: research into financial analysis
function researchScene() {
  const css = F.plate("PL-05A-a").css;
  const [tIn, tPress] = [0, 1].map((i) => beat("05.1", i));
  const rect = [40, 388, 1000, 892];
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-05A-a", "PL-05A-b"], 5),
      railHtml("rail-a", "Research"),
      railHtml("rail-b", "Financial"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // Starts on the record's header and tiers (the page's column from the sidebar's edge); a short pan
    // to + Financial as the pointer goes to it.
    // The plate's x0 at the page's left edge: at zoom 1 the page is 972 px wide, its centre 486 px in.
    const view = (x0) => ({ rect, zoom: 1, focus: [x0 + 486, 432], at: [540, 834] });
    const pan = span(t, tPress - 0.95, tPress - 0.15, EASE.move);
    const x0 = lerp(m.start, m.end, pan);
    const preparing = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const g = placeWindow(st, "W", css, view(x0), [1, preparing]);
    st.set("#W-1 .qspin", { transform: `rotate(${r3(((t - tPress) * 360) % 360)}deg)` });
    // The journey rail slides in above the window with Research lit; at the press it moves to Financial.
    const railIn = span(t, tIn + 0.12, tIn + 0.62, EASE.settle);
    const moved = span(t, tPress + 0.14, tPress + 0.46, EASE.move);
    st.set("#rail-a", {
      transform: `translateY(${px((1 - railIn) * -22)})`,
      ...fade(railIn * (1 - moved)),
    });
    st.set("#rail-b", fade(moved));
    pointer(st, t, {
      from: [700, 940],
      to: g.map(m.financial),
      a: tPress - 0.9,
      b: tPress - 0.08,
      show: tPress - 1.05,
      press: tPress,
    });
    return st;
  };
  return {
    id: "research",
    shots: ["05.1"],
    palette: "aurixa",
    html,
    measure: { tiers: ["#W-0", ".qtier", true], col: ["#W-0", ".qcol"] },
    derive(m) {
      const fin = m.tiers[1];
      return {
        ...m,
        financial: [fin[0] + fin[2] * 0.64, fin[1] + fin[3] * 0.62],
        // The view's left edge in the plate: first the page's column, then with + Financial centred.
        start: m.col[0] - 8,
        end: fin[0] + fin[2] / 2 - 486,
      };
    },
    state,
  };
}

module.exports = researchScene;
