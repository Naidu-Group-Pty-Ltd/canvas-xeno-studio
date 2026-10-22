// Reel 1, shot 02.1: four tools, one question.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

// The frame's focus: the action zone's centre, where the camera's point of interest is held.
const FOCUS = [540, 830];
/** Where an F02 point lands in the frame under the camera { z, c }. */
const through = ({ z, c }, [x, y]) => [FOCUS[0] + (x - c[0]) * z, FOCUS[1] + (y - c[1]) * z];

// ------------------------------------------------------------------ 02.1: the question meets four tools
/**
 * The question lands at the top of a plain inbox, and the pointer goes to Reply and stops: there is nothing to
 * reply with yet. A research tool, a spreadsheet, a contact card and an empty report open over it one by one,
 * each in its own style, the camera pulling back a little with each until all four are in frame, overlapping
 * and misaligned: F02 (frames.cjs), whose own layers these are. The pointer then hops once between them.
 */
function toolsScene() {
  const beats = [0, 1, 2, 3, 4].map((i) => beat("02.1", i));
  const [tLand, tResearch, tSheet, tContact, tReport] = beats;
  // F02's layers, in its order: the mail client (scaled to half), Research, the worksheet, the contact card,
  // the empty report, and F02's pointer (drawn here by the moving one instead).
  const layers = F.FRAMES.F02.draw();
  // Each window's box in F02 (frame px): where it opens from, and what the camera must take in.
  const BOX = [
    [24, 384, 870, 520],
    [400, 470, 650, 360],
    [30, 640, 660, 340],
    [470, 836, 580, 300],
    [120, 990, 780, 290],
  ];
  const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];
  // The camera after each arrival: in close on the inbox's new row and Reply, then back a little with each
  // window, to F02's own framing (z 1, its focus at the frame's) for the fourth.
  // (The first takes in the inbox's list and its reading pane, Reply included, above the caption zone.)
  const SHOTS = [
    { z: 1.3, c: [480, 600] },
    { z: 1.2, c: [600, 620] },
    { z: 1.12, c: [545, 690] },
    { z: 1.06, c: [545, 760] },
    { z: 1, c: FOCUS },
  ];
  const camera = (t) => {
    let cam = SHOTS[0];
    beats.forEach((b, i) => {
      if (i === 0) return;
      const p = span(t, b - 0.15, b + 0.75, EASE.move);
      if (p > 0) {
        const from = cam;
        const to = SHOTS[i];
        cam = { z: zoomLerp(from.z, to.z, p), c: lerp2(from.c, to.c, p) };
      }
    });
    return cam;
  };

  const html = () =>
    [
      `<div id="cam" class="fk-layer" style="transform-origin:0 0">${layers
        .slice(0, 5)
        .map((layer, i) => {
          const [cx, cy] = centre(BOX[i]);
          return `<div class="fk-layer" id="w${i}" style="transform-origin:${cx}px ${cy}px${i ? ";visibility:hidden" : ""}">${layer}</div>`;
        })
        .join("")}</div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const cam = camera(t);
    const [tx, ty] = through(cam, [0, 0]);
    st.set("#cam", { transform: `translate(${px(tx)}, ${px(ty)}) scale(${cam.z.toFixed(6)})` });

    // The inbox: the question lands as the top row, the rows below making room for it, and opens beside them.
    const land = span(t, tLand + 0.05, tLand + 0.55, EASE.settle);
    const rowH = m.rows[0][3];
    m.rows.forEach((_, i) => {
      if (i === 0)
        st.set(
          "#w0 .bp-row",
          {
            transform: `translateY(${px((1 - land) * -18)})`,
            ...fade(span(t, tLand + 0.05, tLand + 0.3, EASE.linear)),
          },
          0,
        );
      else st.set("#w0 .bp-row", { transform: `translateY(${px((1 - land) * -rowH)})` }, i);
    });
    st.set("#w0 .bp-read", {
      transform: `translateY(${px((1 - span(t, tLand + 0.2, tLand + 0.7, EASE.settle)) * 14)})`,
      ...fade(span(t, tLand + 0.2, tLand + 0.6, EASE.settle)),
    });

    // The other tools open one by one, each in its own style, each a little off from the last.
    beats.slice(1).forEach((b, k) => {
      const i = k + 1;
      const open = span(t, b, b + 0.42, EASE.settle);
      st.set(`#w${i}`, {
        transform: `translateY(${px((1 - open) * 18)}) scale(${r3(lerp(0.94, 1, open))})`,
        ...fade(span(t, b, b + 0.2, EASE.linear)),
      });
    });
    // The empty report's caret blinks once it is open.
    const since = t - (tReport + 0.45);
    st.set("#w4 .fk-caret", {
      opacity: since < 0 || Math.floor(since / 0.53) % 2 === 0 ? "1" : "0",
    });

    // The pointer: to Reply, where it stops (there is nothing to reply with yet), held there as the camera
    // pulls back; then once to each of the four tools, ending in the empty report (F02's pointer).
    // On Reply, at its lower right (as the plates set a pointer on a button), clear of its label.
    const reply = [m.reply[0] + m.reply[2] * 0.86, m.reply[1] + m.reply[3] * 0.74];
    const sel = [m.sel[0] + m.sel[2] * 0.62, m.sel[1] + m.sel[3] * 0.66];
    const stops = [
      [880, 1210], // in from the lower right
      reply,
      [652, 612], // Research: its comparable sales
      sel, // the worksheet's selected formula cell
      [696, 960], // Jordan Ellis's contact card
      [600, 1150], // the empty report, by its caret: F02's pointer
    ];
    // Four hops of 0.34 s, 0.12 s apart, the last landing before F02's moment (17.2 s).
    const hop0 = tReport + 0.12;
    const times = [
      [tLand + 0.45, tLand + 1.25],
      ...[0, 1, 2, 3].map((k) => [hop0 + k * 0.46, hop0 + k * 0.46 + 0.34]),
    ];
    let leg = 0;
    while (leg < times.length - 1 && t >= times[leg + 1][0]) leg++;
    pointer(st, t, {
      from: through(cam, stops[leg]),
      to: through(cam, stops[leg + 1]),
      a: times[leg][0],
      b: times[leg][1],
      show: leg === 0 ? tLand + 0.35 : -1,
      bow: leg === 0 ? 0.12 : 0.18,
    });
    return st;
  };
  return {
    id: "tools",
    shots: ["02.1"],
    palette: "before",
    html,
    measure: {
      // The inbox's rows, in the mail client's own px (it is drawn at half size).
      rows: ["#w0 .bp", ".bp-row", true],
      // Reply and the worksheet's selected cell, in F02's frame px.
      reply: ["#cam", "#w0 .bp-reply"],
      sel: ["#cam", "#w2 .sel"],
    },
    state,
  };
}

module.exports = toolsScene;
