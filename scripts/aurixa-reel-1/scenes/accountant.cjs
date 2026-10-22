// Reel 1, shot 08.1: the accountant's part, done in the same system. Mia's Requests on Jordan's client file:
// she marks his income statement fulfilled.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
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
} = M;

// ------------------------------------------------------------------ 08.1: the request, Fulfilled
function accountantScene() {
  const css = F.plate("PL-08A-a").css; // the portal's two states share one size
  const [tIn, tPress] = [0, 1].map((i) => beat("08.1", i));
  // A08a's framing, still: the client file from its heading to the requests.
  const VIEW = { rect: [40, 384, 1000, 900], zoom: 1.5, focus: [560, 380], at: [540, 834] };
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-08A-a", "PL-08A-b"], 5),
      railHtml("rail", "Team"),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    // Pressed: the request turns Fulfilled (its border, its status, the actions that remain). The fulfilled
    // card is held where the pending one's contents stood while one gives way to the other, then settles
    // into its own place as the list closes up under it; Reopen moves across to where the actions now
    // start, in both states at once, so it is one button throughout.
    const turned = span(t, tPress + 0.06, tPress + 0.3, EASE.linear);
    // The fulfilled state is laid over the pending one (which stays whole beneath until it is covered),
    // so the page never dims through the change.
    const g = placeWindow(st, "W", css, VIEW, [turned < 1 ? 1 : 0, turned]);
    const settled = span(t, tPress + 0.3, tPress + 0.62, EASE.move);
    const [ax, ay] = m.align;
    st.set("#W-1 .areq", {
      transform: `translate(${px(ax * (1 - settled))}, ${px(ay * (1 - settled))})`,
    });
    st.set("#W-1 .line", { transform: `translateY(${px(m.below * (1 - settled))})` }, 1);
    const moved = span(t, tPress + 0.08, tPress + 0.5, EASE.move);
    const [dx, dy] = m.reopenShift;
    st.set("#W-0 .areq .btn", { transform: `translate(${px(dx * moved)}, ${px(dy * moved)})` }, 1);
    st.set("#W-1 .areq .btn", {
      transform: `translate(${px(-dx * (1 - moved))}, ${px(-dy * (1 - moved))})`,
    });
    // Its status: Client responded goes, then Fulfilled sets in.
    const gone = span(t, tPress + 0.06, tPress + 0.16, EASE.linear);
    const shown = span(t, tPress + 0.14, tPress + 0.3, EASE.linear);
    st.set("#W-0 .areq .pill", fade(1 - gone));
    st.set("#W-1 .areq .pill", {
      transform: `scale(${(0.9 + 0.1 * span(t, tPress + 0.14, tPress + 0.46, EASE.settle)).toFixed(4)})`,
      "transform-origin": "100% 50%",
      ...fade(shown),
    });
    // The pointer comes from the request's status to Mark fulfilled, presses it and is gone.
    pointer(st, t, {
      from: g.map(m.status),
      to: g.map(m.fulfil),
      a: tIn + 0.35,
      b: tPress - 0.08,
      show: tIn + 0.32,
      hide: tPress + 0.4,
      press: tPress,
    });
    return st;
  };

  return {
    id: "accountant",
    shots: ["08.1"],
    palette: "aurixa",
    html,
    measure: {
      acts: ["#W-0", ".areq .btn", true],
      after: ["#W-1", ".areq .btn"],
      pill: ["#W-0", ".areq .pill"],
      titles: ["#W-0", ".areq .a"],
      titlesAfter: ["#W-1", ".areq .a"],
      list: ["#W-0", ".line", true],
      listAfter: ["#W-1", ".line", true],
    },
    derive(m) {
      if (m.acts.length !== 3) throw new Error("PL-08A-a: the request has not three actions");
      const [x, y, w, h] = m.acts[0]; // Mark fulfilled
      const [rx, ry, rw, rh] = m.acts[1]; // Reopen, before
      const [bx, by, bw, bh] = m.after; // and after
      const [px0, py0, , ph] = m.pill;
      // The selected card's border is a pixel wider: its contents stand that much further in.
      const align = [m.titles[0] - m.titlesAfter[0], m.titles[1] - m.titlesAfter[1]];
      return {
        ...m,
        // The pointer's tip on Mark fulfilled's label; it comes from just under the request's status.
        fulfil: [x + w * 0.6, y + h * 0.62],
        status: [px0 + 30, py0 + ph + 17],
        align,
        // How far the list under the request closes up once it is fulfilled.
        below: m.list[1][1] - m.listAfter[1][1],
        // Reopen's move, centre to centre, from where it stood to where the fulfilled card (held in line
        // with the pending one) has it.
        reopenShift: [
          bx + bw / 2 + align[0] - (rx + rw / 2),
          by + bh / 2 + align[1] - (ry + rh / 2),
        ],
      };
    },
    state,
  };
}

module.exports = accountantScene;
