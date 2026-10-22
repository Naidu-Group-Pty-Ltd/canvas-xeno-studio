// Reel 1, shot 09.1: bridging the gaps by hand, on today's desktop. Two plain document lists for Residence 014 side
// by side, each with its own copy of the contract and the floor plan; dashed bridges reach across the gap between
// them, the floor plan is dragged across by hand, a bridge breaks and a third copy appears.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  POINTER_TIP,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  KIT,
} = M;

// ------------------------------------------------------------------ 09.1: two lists, three copies, no bridge holding
function bridgeScene() {
  const [tIn, tBridges] = [0, 1].map((i) => beat("09.1", i));
  // F09's lists and bridges: the left list's rows end at x 486, the right list's start at x 594; rows every
  // 72 px, from y 573 on the left and 673 on the right.
  const LEFT = [36, 420, 450, 440];
  const RIGHT = [594, 520, 450, 540];
  const ROW = 72;
  const L = (i) => [486, 573 + i * ROW];
  const R = (i) => [594, 673 + i * ROW];
  const BRIDGES = [
    [L(0), R(0)],
    [L(1), R(1)], // the one that breaks
    [L(1), R(2)],
    [L(2), R(3)],
  ];
  const BREAKS = 1;
  const DASH = 22; // the bridge's dash and gap (12 + 10)
  // The drag, as F09 ends it: the card's top left at (330, 930), turned 5 degrees, the pointer at (600, 968).
  const DROP = [330, 930];
  const HOLD = [600, 968];
  const CARD_W = 300;
  // Times: the bridges reach across one after another; the pointer takes the floor plan from the left list,
  // drags it across, the floor plan's bridge breaks under it, and the right list gains a third copy.
  const tGrab = tBridges + 0.95;
  const tDrag = tGrab + 0.2; // once the press has dipped and risen
  const tDrop = tDrag + 0.78;
  const tBreak = tDrag + 0.33;
  const tCopy = tDrag + 0.45;

  const list = (title, items, copy = -1) =>
    `<div class="fk-doclist"><h4>${title}</h4>${items.map((t, i) => `<div class="${i === copy ? "copy" : ""}"${i === copy ? ' id="copy2"' : ""}>${t}</div>`).join("")}</div>`;
  const win = (id, [x, y, w, h], title, inner) =>
    KIT.plainWin(x, y, w, h, title, inner).replace('class="bp"', `class="bp" id="${id}"`);
  const stroke = `stroke="var(--reel-before-ink-muted)" stroke-width="3" stroke-dasharray="12 10" stroke-linecap="round" fill="none"`;
  const paths = ["b0", "b1a", "b1b", "b2", "b3"]
    .map((id) => `<path id="${id}" d="M0 0" ${stroke}/>`)
    .join("");

  const html = () =>
    [
      win(
        "LW",
        LEFT,
        "Documents",
        list("Residence 014 — documents", [
          "Contract of sale (draft)",
          "Floor plan",
          "Building specification",
          "Planning certificate",
        ]),
      ),
      win(
        "RW",
        RIGHT,
        "Documents (2)",
        list(
          "Residence 014 — documents",
          [
            "Contract of sale (draft)",
            "Floor plan",
            "Floor plan (copy)",
            "Building specification",
            "Floor plan (copy 2)",
          ],
          4,
        ),
      ),
      `<svg class="fk-layer" style="z-index:6" width="1080" height="1920">${paths}</svg>`,
      `<div id="drag" style="position:absolute;left:0;top:0;z-index:9;border-radius:8px;visibility:hidden"><div class="fk-doclist" style="padding:0"><div id="drag-card" style="background:var(--reel-before-surface);font-weight:600">Floor plan</div></div></div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const line = (a, b) => `path("M${r3(a[0])} ${r3(a[1])} L${r3(b[0])} ${r3(b[1])}")`;
  const NONE = 'path("M0 0")';

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The two windows settle into place at the cut, drifting in from either side.
    const settle = span(t, tIn, tIn + 0.7, EASE.settle);
    st.set("#LW", { transform: `translateX(${px((1 - settle) * -18)})` });
    // The right list grows a row when the third copy appears.
    const grown = span(t, tCopy, tCopy + 0.45, EASE.settle);
    st.set("#RW", {
      transform: `translateX(${px((1 - settle) * 18)})`,
      height: px(RIGHT[3] - ROW + ROW * grown),
    });
    st.set("#copy2", {
      transform: `translateY(${px((1 - grown) * 14)})`,
      ...fade(span(t, tCopy + 0.05, tCopy + 0.3, EASE.linear)),
    });
    // G-BRIDGE: each bridge reaches across from the left list, one after another.
    BRIDGES.forEach(([a, b], i) => {
      const p = span(t, tBridges + i * 0.16, tBridges + i * 0.16 + 0.55, EASE.move);
      const end = lerp2(a, b, p);
      if (i !== BREAKS) {
        st.set(`#b${i}`, { d: p > 0 ? line(a, end) : NONE });
        return;
      }
      // The floor plan's bridge, in two halves that meet at its middle until it breaks there.
      const mid = lerp2(a, b, 0.5);
      const u = span(t, tBreak, tBreak + 0.3, EASE.settle);
      const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
      st.set("#b1a", {
        d: p > 0 ? line(a, p < 0.5 ? end : [mid[0] - 14 * u, mid[1] + 10 * u]) : NONE,
      });
      st.set("#b1b", {
        d: p > 0.5 ? line([mid[0] + 14 * u, mid[1] - 16 * u], end) : NONE,
        // Its dashes carry on from the first half's.
        "stroke-dashoffset": String(r3(-(half % DASH))),
      });
    });
    // The floor plan, taken from the left list as a card, dragged across by hand on a gentle curve.
    const row = m.lrows[1];
    const start = [LEFT[0] + row[0], LEFT[1] + row[1]];
    const u = span(t, tDrag, tDrop, EASE.move);
    const ctrl = [start[0] + 260, start[1] + 40];
    const q = (s) => [
      (1 - s) ** 2 * start[0] + 2 * (1 - s) * s * ctrl[0] + s * s * DROP[0],
      (1 - s) ** 2 * start[1] + 2 * (1 - s) * s * ctrl[1] + s * s * DROP[1],
    ];
    const [cx, cy] = q(u);
    const lift = span(t, tGrab, tGrab + 0.3, EASE.settle);
    const turn = span(t, tDrag, tDrop + 0.1, EASE.settle);
    st.set("#drag", {
      // Lifted, it grows a little and its shadow with it; it settles back to its own size where it is let rest.
      transform: `translate(${px(cx)}, ${px(cy)}) rotate(${r3(-5 * turn)}deg) scale(${r3(1 + 0.02 * lift * (1 - span(t, tDrop - 0.15, tDrop + 0.25, EASE.settle)))})`,
      "box-shadow": `0 ${r3(22 * lift)}px ${r3(40 * lift)}px rgba(17,24,39,${r3(0.24 * lift)})`,
      ...fade(t >= tGrab ? 1 : 0),
    });
    // It leaves the row as the row looks (today's grey) and is white once it is in hand.
    st.set("#drag-card", {
      width: px(lerp(row[2], CARD_W, span(t, tDrag, tDrop, EASE.settle))),
      background: `color-mix(in srgb, var(--reel-before-surface) ${r3(100 * lift)}%, var(--reel-before-paper))`,
    });
    // The pointer: in from below, onto the floor plan's row, a press to take it, then with the card.
    const grab = [start[0] + HOLD[0] - DROP[0], start[1] + row[3] / 2];
    pointer(st, t, {
      from: [210, 1130],
      to: grab,
      a: tGrab - 0.5,
      b: tGrab - 0.06,
      show: tGrab - 0.62,
      press: tGrab,
    });
    if (t > tDrag) {
      const offset = lerp2(
        [grab[0] - start[0], grab[1] - start[1]],
        [HOLD[0] - DROP[0], HOLD[1] - DROP[1]],
        u,
      );
      st.set("#ptr", {
        transform: `translate(${px(cx + offset[0] - POINTER_TIP[0])}, ${px(cy + offset[1] - POINTER_TIP[1])}) scale(1)`,
      });
    }
    return st;
  };

  return {
    id: "bridge",
    shots: ["09.1"],
    palette: "before",
    html,
    measure: { lrows: ["#LW", ".fk-doclist > div", true] },
    state,
  };
}

module.exports = bridgeScene;
