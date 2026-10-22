// Reel 1, shot 06.1: the reply the client was waiting for, in the Command Centre's Message Hub. The window floats in
// depth (./workflowStage.cjs) and the camera eases in toward the thread as the reply goes.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp2,
  zoomLerp,
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
} = M;
const S = require("./workflowStage.cjs");

// ------------------------------------------------------------------ 06.1: the reply the client was waiting for
function hubScene() {
  const shot = M.shotOf("06.1");
  const [tIn, tSend] = [0, 1].map((i) => beat("06.1", i));
  // The thread, from A06a's framing in toward its two messages as the reply goes: the window keeps the block's
  // glass box (its top at 384, 1000 x 900), so the cuts on either side change the page, never the window.
  const RECT = [40, 384, 1000, 900];
  const OPEN = { rect: RECT, zoom: 1.55, focus: [910, 600], at: [540, 834] };
  const CLOSE = { rect: RECT, zoom: 1.7, focus: [887, 652], at: [540, 834] };
  const framing = (t) => {
    const p = span(t, tIn, shot.out, EASE.linear);
    const q = EASE.settle(p);
    return {
      rect: RECT,
      zoom: zoomLerp(OPEN.zoom, CLOSE.zoom, q),
      focus: lerp2(OPEN.focus, CLOSE.focus, q),
      at: OPEN.at,
    };
  };
  const drafted = F.plate("NEW-MESSAGE-HUB-a");
  // Sent: the thread clips what it scrolls, so the reply can rise into it from the composer's edge.
  const sent = F.plate("NEW-MESSAGE-HUB-b", (html) => {
    const body = '<div class="mh-body">';
    if (html.split(body).length !== 2) throw new Error("NEW-MESSAGE-HUB-b: no single thread body");
    return html.replace(body, '<div class="mh-body" style="overflow:hidden">');
  });
  // When the click lands, the composer clears and the thread scrolls up to take the reply.
  const tGone = tSend + 0.07;
  const html = () =>
    [
      S.stageHtml(),
      S.stageWindow("W", [drafted, sent], 5),
      railHtml("rail-a", "Report"),
      railHtml("rail-b", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The window floats in depth, on the film's clock.
    const pose = S.drift(t);
    const P = S.stageState(st, RECT, pose);
    // The drafted reply until the click; then the thread with the reply in it, scrolled from where the
    // drafted thread stood (the question unmoved), up to its place.
    const isSent = t >= tGone ? 1 : 0;
    const g = placeWindow(st, "W", drafted.css, framing(t), [1 - isSent, isSent], {
      transform: P.css,
    });
    const scroll = (1 - span(t, tGone, tGone + 0.5, EASE.move)) * m.offset;
    m.bodyItems.forEach((_, i) =>
      st.set("#W-1 .mh-body > *", { transform: `translateY(${px(scroll)})` }, i),
    );
    // Its delivered tick, once the reply has arrived.
    const ticked = span(t, tGone + 0.42, tGone + 0.62, EASE.settle);
    st.set("#W-1 .mh-msg.me .mh-time svg", {
      transform: `scale(${r3(0.6 + 0.4 * ticked)})`,
      ...fade(ticked),
    });
    // The rail moves to Team as the reply goes.
    const moved = span(t, tSend + 0.05, tSend + 0.4, EASE.move);
    st.set("#rail-a", fade(1 - moved));
    st.set("#rail-b", fade(moved));
    // The pointer comes up from the composer's text to Send, presses it, and is gone; its points are the page's,
    // carried through the window's turn.
    const on = (pt) => P.map(g.map(pt));
    const to = on(m.send);
    pointer(st, t, {
      from: lerp2(to, on(m.text), 0.55),
      to,
      a: tIn + 0.12,
      b: tSend - 0.08,
      show: tIn + 0.04,
      hide: tSend + 0.38,
      press: tSend,
    });
    return st;
  };

  return {
    id: "hub",
    shots: ["06.1"],
    palette: "aurixa",
    html,
    measure: {
      sendBox: ["#W-0", ".mh-send"],
      textBox: ["#W-0", ".mh-ta"],
      askedA: ["#W-0", ".mh-body .mh-msg"],
      askedB: ["#W-1", ".mh-body .mh-msg"],
      bodyItems: ["#W-1", ".mh-body > *", true],
    },
    derive(m) {
      const [sx, sy, sw, sh] = m.sendBox;
      const [tx, ty, , th] = m.textBox;
      return {
        ...m,
        // The pointer's tip on Send, a little low and right of its centre.
        send: [sx + sw * 0.56, sy + sh * 0.6],
        text: [tx + 40, ty + th * 0.5],
        // How far the sent thread starts below its place: where the drafted thread's question stood.
        offset: m.askedA[1] - m.askedB[1],
      };
    },
    state,
  };
}

module.exports = hubScene;
