// Reel 1, shot 09.2: one register instead. The Solicitor Portal's matter, Ellis: Purchase, 14 Wattle Grove; the pointer
// presses Docs, and the document register opens: four documents, one copy of each, each with its status.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  State,
  fade,
  windowHtml,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

// ------------------------------------------------------------------ 09.2: the matter's document register
function registerScene() {
  const css = F.plate("PL-09B-a").css;
  const [tIn, tDocs] = [0, 1].map((i) => beat("09.2", i));
  // A09: the matter at 1.3, its header, tabs and register in the 1000 x 900 window.
  const framing = { rect: [40, 384, 1000, 900], zoom: 1.3, focus: [640, 380], at: [540, 834] };
  const tPress = tDocs - 0.1; // the press, so the register is open on the beat
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-09B-a", "PL-09B-b"], 5),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const docs = span(t, tPress + 0.03, tPress + 0.18, EASE.linear);
    const g = placeWindow(st, "W", css, framing, [1, docs]);
    // The pointer comes up to the Docs tab and presses it; once the register is open it gives way.
    pointer(st, t, {
      from: [760, 1060],
      to: g.map(m.docs),
      a: tIn + 0.04,
      b: tPress - 0.06,
      show: tIn,
      hide: tDocs + 0.5,
      press: tPress,
    });
    return st;
  };
  return {
    id: "register",
    shots: ["09.2"],
    palette: "aurixa",
    html,
    measure: { tabs: ["#W-0", ".atabs > span", true] },
    derive(m) {
      // The tip on the Docs tab's label, a little right of its icon.
      const docs = m.tabs[5];
      return { ...m, docs: [docs[0] + docs[2] * 0.62, docs[1] + docs[3] * 0.58] };
    },
    state,
  };
}

module.exports = registerScene;
