// Reel 1, shot 06.3: Aurixa Agent, beside the work.
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
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
} = M;

// ------------------------------------------------------------------ 06.3: Aurixa Agent, beside the work
function agentScene() {
  const css = F.plate("PL-06B-a").css; // the Command Centre's plates share one size
  const [tIn, tPress, tCard] = [0, 1, 2].map((i) => beat("06.3", i));
  const tHover = tIn + 0.34;
  // The report's page at A06b's zoom, low on the page: from the gap between the third and fourth score
  // tiles (so nothing readable is cut) down to the page's foot, the agent's button in its corner. As the
  // panel opens the camera rises with it onto A06b.
  const A06B = { rect: [40, 384, 1000, 900], zoom: 1.75, focus: [1268, 462], at: [540, 834] };
  const half = [972 / 2 / A06B.zoom, 872 / 2 / A06B.zoom];
  const LOW = { ...A06B, focus: [990 + half[0], css[1] - half[1]] };
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-06B-a", "PL-06B-b"], 5),
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    // Still until the press; then the camera rises to the panel as it opens.
    const push = span(t, tPress + 0.05, tPress + 0.95, EASE.move);
    const opened = span(t, tPress + 0.02, tPress + 0.1, EASE.linear);
    const g = placeWindow(st, "W", css, between(css, LOW, A06B, push), [1, opened]);
    // The button's label shows as the pointer reaches it.
    const hover = span(t, tHover - 0.04, tHover + 0.18, EASE.settle);
    st.set("#W-0 .qtip", { transform: `translateX(${px((1 - hover) * 8)})`, ...fade(hover) });
    // The panel opens out of the button: it grows from its own lower right corner, where the button was.
    const grow = span(t, tPress + 0.02, tPress + 0.5, EASE.settle);
    st.set("#W-1 .qagent", {
      transform: `scale(${r3(lerp(0.2, 1, grow))})`,
      "transform-origin": "100% 100%",
      ...fade(span(t, tPress + 0.02, tPress + 0.22, EASE.linear)),
    });
    // Its conversation: the request already there; the agent's note sets in, then the draft card that
    // reads Needs your go-ahead, rising into place.
    const items = [
      [tPress + 0.42, 0.22, 0],
      [tPress + 0.5, 0.26, 6],
      [tCard, 0.45, 16],
    ];
    items.forEach(([a, d, rise], k) => {
      const p = span(t, a, a + d, EASE.settle);
      st.set(
        "#W-1 .qagb > *",
        { transform: `translateY(${px((1 - p) * rise)})`, ...fade(p) },
        k + 1,
      );
    });
    // The pointer comes to the button, rests on it while its label shows, presses it and is gone.
    const to = g.map(m.button);
    pointer(st, t, {
      from: g.map(m.start),
      to,
      a: tIn + 0.06,
      b: tHover,
      show: tIn,
      hide: tPress + 0.3,
      press: tPress,
    });
    return st;
  };

  return {
    id: "agent",
    shots: ["06.3"],
    palette: "aurixa",
    html,
    measure: {
      fab: ["#W-0", ".qfab"],
      score: ["#W-0", ".qstat", true],
    },
    derive(m) {
      const [x, y, w, h] = m.fab;
      const [sx, sy, sw, sh] = m.score[m.score.length - 1];
      return {
        ...m,
        // The pointer's tip on the agent's emblem, a little right of its centre; it comes from the page.
        button: [x + w * 0.56, y + h * 0.58],
        start: [sx + sw * 0.3, sy + sh * 0.7],
      };
    },
    state,
  };
}

module.exports = agentScene;
