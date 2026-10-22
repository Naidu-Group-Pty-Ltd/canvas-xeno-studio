// Reel 1, shot 11.2: the demo workspace opens, its badge glows once, and focus settles on 14 Wattle Grove.
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
  throughRect,
  corners,
  focusHtml,
  captionHtml,
  caption,
  F,
} = M;

// ------------------------------------------------------------------ 11.2: the demo workspace opens
function demoScene() {
  const css = F.plate("PL-11A-c").css;
  const [tOpen, tFocus] = [0, 1].map((i) => beat("11.2", i));
  const rect = [40, 384, 1000, 900];
  // Opening: the whole of what this shot is about at once, the Demo workspace badge (top right) and the
  // Demo project card (lower left), at the page's own size.
  const OPEN = { rect, zoom: 1, focus: [736, 424], at: [540, 834] };
  // F11: the short push ends close on the Demo project card, focus corners round it.
  const F11 = { rect, zoom: 1.9, focus: [447, 770], at: [540, 900] };
  const CARD = [286, 711, 608 - 286, 830 - 711];

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-11A-c"], 5),
      focusHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The Overview opens: its window rises in, then the short push to the Demo project card.
    const opened = span(t, tOpen, tOpen + 0.36, EASE.settle);
    const push = span(t, tOpen + 0.5, tFocus + 0.55, EASE.move);
    const framing = between(css, OPEN, F11, push);
    const g = placeWindow(st, "W", css, framing, [1], {
      opacity: span(t, tOpen, tOpen + 0.22, EASE.linear),
      transform: `translateY(${px((1 - opened) * 14)}) scale(${r3(lerp(0.985, 1, opened))})`,
    });
    // The Demo workspace badge glows once: its own gold, brightening and gathering a halo, then settling.
    const up = span(t, tOpen + 0.3, tOpen + 0.55, EASE.settle);
    const down = span(t, tOpen + 0.55, tOpen + 1.15, EASE.move);
    const glow = up * (1 - down);
    st.set("#W-0 .cdemo", {
      "box-shadow": `0 0 ${px(14 * glow)} ${px(2 * glow)} rgba(215,179,95,${r3(0.75 * glow)}), inset 0 0 ${px(10 * glow)} rgba(215,179,95,${r3(0.35 * glow)})`,
      background: `rgba(215,179,95,${r3(0.16 * glow)})`,
      color:
        glow > 0.001
          ? `rgb(${Math.round(lerp(215, 245, glow))},${Math.round(lerp(179, 214, glow))},${Math.round(lerp(95, 130, glow))})`
          : "#D7B35F",
    });
    // Focus settles on the card.
    if (t >= tFocus) corners(st, t, throughRect(g, CARD), tFocus, tFocus + 0.46, { inset: 16 });
    else st.set("#focus", { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });
    return st;
  };

  return {
    id: "demo",
    shots: ["11.2"],
    palette: "aurixa",
    html,
    measure: { card: ["#W-0", ".qproj"], badge: ["#W-0", ".cdemo"] },
    state,
  };
}

module.exports = demoScene;
