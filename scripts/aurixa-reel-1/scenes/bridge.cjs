// Reel 1, shot 09.1: bridging the gaps by hand, on today's desktop. Two plain document lists for 14 Wattle Grove
// stand side by side in depth under flat daylight (G-STAGE in today's paper: each window turned a few degrees
// toward the other, the right one nearer, both lifted off the dotted canvas by their shadows), each with its own
// copy of the contract and the floor plan. Dashed bridges reach across the gap between them; the floor plan is
// taken from the left list by hand and carried across, a bridge breaks under it and a third copy appears; then the
// grey frame holds, unresolved. The bridges, the card and the pointer are carried through the windows' own
// projections (./workflowStage.cjs), so they stay on their rows as the windows turn. 09.2's light sweep burns this
// desk away from the moment 09.1 leaves it (deskHtml, deskState and FROZEN).
const M = require("../motion.cjs");
const {
  beat,
  shotOf,
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
const S = require("./workflowStage.cjs");

// ------------------------------------------------------------------ the desk
// The two lists, the left one higher: a list's rows are 60 px tall every 72 px, the first's centre 152 px below
// the window's top (measured, `m.lrows`). The right list's last row (the third copy) grows in.
const LEFT = [40, 492, 420, 440];
const RIGHT = [620, 600, 420, 540];
const ROW = 72;
const L = (i) => [LEFT[0] + LEFT[2], LEFT[1] + 152 + i * ROW];
const R = (i) => [RIGHT[0], RIGHT[1] + 152 + i * ROW];
const BRIDGES = [
  [L(0), R(0)],
  [L(1), R(1)], // the floor plan's: it breaks as the card passes
  [L(1), R(2)], // and its copy's, as the third copy appears
  [L(2), R(3)],
];
const DASH = 22; // the bridge's dash and gap (12 + 10)
// The card is let rest across the gap by the right list's new row, turned 5 degrees, the pointer near its end.
const DROP = [300, R(4)[1] - 30];
const HOLD = [270, 38]; // the pointer's tip on the card, from its top left
const CARD_W = 300;
// Each window turned a few degrees toward the other and tipped back a touch; the right one nearer.
const POSE_L = { rx: 3, ry: 11, tz: -34, s: 1.05, d: 1600 };
const POSE_R = { rx: 3, ry: -9, tz: 22, s: 1.05, d: 1600 };
const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];

function times() {
  const [tIn, tBridges, tHold] = [0, 1, 2].map((i) => beat("09.1", i));
  // The bridges reach across one after another; the pointer takes the floor plan from the left list and carries
  // it across, the floor plan's bridge breaks as it passes and the right list gains a third copy; the hand lets
  // go and the frame holds on the beat.
  const tGrab = tBridges + 0.86;
  const tDrag = tGrab + 0.2; // once the press has dipped and risen
  const tDrop = tDrag + 0.92;
  const tBreak = tDrag + 0.4;
  const tCopy = tDrag + 0.52;
  return { tIn, tBridges, tHold, tGrab, tDrag, tDrop, tBreak, tCopy };
}

/** The camera's slow drift over the desk (a turn and a push), coming to rest as the bridge breaks. */
function driftOf(t) {
  const { tIn, tBreak } = times();
  const k = span(t, tIn, tBreak + 0.5, EASE.settle);
  return { ry: lerp(-2.4, 0, k), tz: lerp(-46, 0, k), ty: lerp(12, 0, k) };
}
/** A window's pose at t: its own turn, the camera's drift, and its drift in from the side at the cut. */
function windowPose(t, base, side) {
  const { tIn } = times();
  const d = driftOf(t);
  const settle = span(t, tIn, tIn + 0.9, EASE.settle);
  return {
    ...base,
    ry: base.ry + d.ry,
    tz: base.tz + d.tz,
    ty: d.ty,
    tx: side * (1 - settle) * 28,
  };
}

const list = (title, items, copy = -1) =>
  `<div class="fk-doclist"><h4>${title}</h4>${items.map((t, i) => `<div class="${i === copy ? "copy" : ""}"${i === copy ? ' id="copy2"' : ""}>${t}</div>`).join("")}</div>`;
// A window lifted off the canvas: the plain window's shadow, and a longer, softer one beneath it.
const LIFT = "box-shadow:0 34px 70px rgba(17,24,39,.15),0 10px 22px rgba(17,24,39,.09)";
const win = (id, [x, y, w, h], title, inner) =>
  KIT.plainWin(x, y, w, h, title, inner).replace(
    'class="bp" style="',
    `class="bp" id="${id}" style="${LIFT};`,
  );
const stroke = `stroke="var(--reel-before-ink-muted)" stroke-width="3" stroke-dasharray="12 10" stroke-linecap="round" fill="none"`;

/** The desk: a dotted canvas under flat daylight, the two lists, the bridges and the card in hand. */
function deskHtml() {
  const paths = ["b0", "b1a", "b1b", "b2a", "b2b", "b3"]
    .map((id) => `<path id="${id}" d="M0 0" ${stroke}/>`)
    .join("");
  // The canvas is drawn a little larger than the frame, to move against the drift; out of focus behind the lists.
  return `<div id="desk" class="fk-layer" style="z-index:2">
    <div id="canvas" style="position:absolute;left:-120px;top:-120px;width:1320px;height:2160px;background-image:radial-gradient(rgba(55,65,81,.2) 1.6px, transparent 1.7px);background-size:36px 36px;filter:blur(.6px);-webkit-mask-image:radial-gradient(52% 34% at 50% 40%, #000 30%, transparent 100%);mask-image:radial-gradient(52% 34% at 50% 40%, #000 30%, transparent 100%)"></div>
    ${win(
      "LW",
      LEFT,
      "Documents",
      list("14 Wattle Grove — documents", [
        "Contract of sale (draft)",
        "Floor plan",
        "Building specification",
        "Planning certificate",
      ]),
    )}${win(
      "RW",
      RIGHT,
      "Documents (2)",
      list(
        "14 Wattle Grove — documents",
        [
          "Contract of sale (draft)",
          "Floor plan",
          "Floor plan (copy)",
          "Building specification",
          "Floor plan (copy 2)",
        ],
        4,
      ),
    )}<svg class="fk-layer" style="z-index:6" width="1080" height="1920">${paths}</svg>
    <div id="drag" style="position:absolute;left:0;top:0;z-index:9;border-radius:8px;font-family:var(--reel-before-type);color:var(--reel-before-ink);visibility:hidden"><div class="fk-doclist" style="padding:0"><div id="drag-card" style="background:var(--reel-before-surface);font-weight:600">Floor plan</div></div></div></div>`;
}
/** Today's daylight on the paper: brightest over the desk, falling off to the frame's edges. */
const daylightHtml = () =>
  `<div class="fk-layer" style="z-index:0;background:radial-gradient(72% 44% at 50% 40%, #FBFBFC 0%, var(--reel-before-paper) 60%, #E2E5EA 100%)"></div>`;

const line = (a, b) => `path("M${r3(a[0])} ${r3(a[1])} L${r3(b[0])} ${r3(b[1])}")`;
const curve = (a, c, b) =>
  `path("M${r3(a[0])} ${r3(a[1])} Q${r3(c[0])} ${r3(c[1])} ${r3(b[0])} ${r3(b[1])}")`;
const NONE = 'path("M0 0")';
/** A broken bridge's fall, s seconds after it breaks: 0 to 1, a little past it and back, as a cord settles. */
const hang = (s) => (s <= 0 ? 0 : 1 - Math.exp(-5.2 * s) * Math.cos(9.5 * s));

/**
 * The desk's state at t (the windows, the bridges, the card): `m.lrows` are the left list's rows. Returns the
 * projections the pointer is carried through: the left window's (PL), the card's (PC) and the card's path.
 */
function deskState(st, t, m) {
  const { tBridges, tGrab, tDrag, tDrop, tBreak, tCopy } = times();
  // The floor plan's two bridges break: its own as the card passes, its copy's as the third copy appears.
  const breaks = { 1: tBreak, 2: tCopy + 0.1 };
  const pl = windowPose(t, POSE_L, -1);
  const pr = windowPose(t, POSE_R, 1);
  const PL = S.pose(LEFT, pl);
  const PR = S.pose(RIGHT, pr);
  st.set("#LW", { transform: PL.css });
  // The right list grows a row when the third copy appears: it turns about its full height's centre, so it grows
  // down and nothing above the new row moves.
  const grown = span(t, tCopy, tCopy + 0.45, EASE.settle);
  st.set("#RW", {
    transform: PR.css,
    "transform-origin": `${px(RIGHT[2] / 2)} ${px(RIGHT[3] / 2)}`,
    height: px(RIGHT[3] - ROW + ROW * grown),
  });
  st.set("#copy2", {
    transform: `translateY(${px((1 - grown) * 14)})`,
    ...fade(span(t, tCopy + 0.05, tCopy + 0.3, EASE.linear)),
  });
  // The canvas moves against the drift, a little: it is further away than the lists.
  const d = driftOf(t);
  st.set("#canvas", { transform: `translate(${px(-d.ry * 7)}, ${px(-d.ty * 0.5 + d.tz * 0.08)})` });
  // G-BRIDGE: each bridge reaches across from the left list, one after another.
  BRIDGES.forEach(([a0, b0], i) => {
    const [a, b] = [PL.map(a0), PR.map(b0)];
    const p = span(t, tBridges + i * 0.17, tBridges + i * 0.17 + 0.6, EASE.move);
    const end = lerp2(a, b, p);
    if (!(i in breaks)) {
      st.set(`#b${i}`, { d: p > 0 ? line(a, end) : NONE });
      return;
    }
    // A bridge that breaks is drawn as two halves meeting at its middle; once it breaks they part there, each
    // falling back toward its own list and sagging, and hang.
    const mid = lerp2(a, b, 0.5);
    const u = hang(t - breaks[i]);
    const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    // Each half swings down from its own list, as a cord does, a little shorter, and sags.
    const fall = (from, toward) => {
      const a0 = Math.atan2(mid[1] - from[1], mid[0] - from[0]);
      const d0 = [Math.cos(a0), Math.sin(a0)];
      let delta = Math.atan2(lerp(d0[1], 1, toward), lerp(d0[0], 0, toward)) - a0;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // the short way round
      const ang = a0 + delta * u;
      const len = half * (1 - 0.14 * u);
      const tip = [from[0] + len * Math.cos(ang), from[1] + len * Math.sin(ang)];
      return { tip, ctrl: [lerp(from[0], tip[0], 0.55), lerp(from[1], tip[1], 0.55) + 14 * u] };
    };
    const A = fall(a, 0.6);
    const B = fall(b, 0.75);
    st.set(`#b${i}a`, {
      d: p <= 0 ? NONE : p < 0.5 ? line(a, end) : curve(a, A.ctrl, A.tip),
    });
    st.set(`#b${i}b`, {
      d: p > 0.5 ? curve(B.tip, B.ctrl, p < 1 ? end : b) : NONE,
      // Its dashes carry on from the first half's.
      "stroke-dashoffset": String(r3(-(half % DASH))),
    });
  });
  // The floor plan, taken from the left list as a card: in the left window's plane where it lies, lifted toward
  // the viewer, carried across on a gentle curve, turning to face the right list, and let rest across the gap.
  const row = m.lrows[1];
  const start = [LEFT[0] + row[0], LEFT[1] + row[1]];
  const u = span(t, tDrag, tDrop, EASE.move);
  const ctrl = [start[0] + 210, start[1] + 150];
  const q = (s) => [
    (1 - s) ** 2 * start[0] + 2 * (1 - s) * s * ctrl[0] + s * s * DROP[0],
    (1 - s) ** 2 * start[1] + 2 * (1 - s) * s * ctrl[1] + s * s * DROP[1],
  ];
  const [cx, cy] = q(u);
  const lift = span(t, tGrab, tGrab + 0.3, EASE.settle);
  const rest = span(t, tDrop - 0.15, tDrop + 0.3, EASE.settle);
  const turn = span(t, tDrag, tDrop + 0.1, EASE.settle);
  const card = {
    ...pl,
    rx: lerp(pl.rx, 1, turn),
    ry: lerp(pl.ry, -3, turn),
    rz: -5 * turn,
    tx: pl.tx + cx - start[0],
    ty: pl.ty + cy - start[1],
    tz: pl.tz + lerp(0, 60, lift) - 24 * rest,
    s: pl.s * (1 + 0.02 * lift * (1 - rest)),
  };
  const O = centre(LEFT);
  const PC = S.pose([O[0] - 1, O[1] - 1, 2, 2], card);
  st.set("#drag", {
    left: px(start[0]),
    top: px(start[1]),
    "transform-origin": `${px(O[0] - start[0])} ${px(O[1] - start[1])}`,
    transform: PC.css,
    // Lifted, its shadow grows with it; let rest, the shadow settles back.
    "box-shadow": `0 ${r3(26 * lift - 10 * rest)}px ${r3(46 * lift - 14 * rest)}px rgba(17,24,39,${r3(0.24 * lift - 0.06 * rest)})`,
    ...fade(t >= tGrab ? 1 : 0),
  });
  // It leaves the row as the row looks (today's grey) and is white once it is in hand.
  st.set("#drag-card", {
    width: px(lerp(row[2], CARD_W, span(t, tDrag, tDrop, EASE.settle))),
    background: `color-mix(in srgb, var(--reel-before-surface) ${r3(100 * lift)}%, var(--reel-before-paper))`,
  });
  return { PL, PC, start, row, u };
}

// ------------------------------------------------------------------ 09.1: two lists, three copies, no bridge holding
function bridgeScene() {
  const { tGrab, tDrag, tDrop } = times();
  const html = () => [daylightHtml(), deskHtml(), pointerHtml(), captionHtml()].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const { PL, PC, start, row, u } = deskState(st, t, m);
    // The pointer: up from below, onto the floor plan's row, a press to take it, then with the card; once the
    // card is let rest it lets go and leaves the desk to hold, unresolved.
    const grab = [start[0] + HOLD[0], start[1] + row[3] / 2];
    pointer(st, t, {
      from: [330, 1250],
      to: PL.map(grab),
      a: tGrab - 0.55,
      b: tGrab - 0.06,
      show: tGrab - 0.66,
      hide: tDrop + 0.32,
      press: tGrab,
    });
    if (t > tDrag) {
      // On the card, from where it was taken to where the hand holds it as it is let rest.
      const off = lerp2([HOLD[0], row[3] / 2], HOLD, u);
      const [x, y] = PC.map([start[0] + off[0], start[1] + off[1]]);
      // Letting go, the hand drifts off the card as it fades.
      const away = span(t, tDrop + 0.3, tDrop + 0.55, EASE.move);
      st.set("#fk-ptr", {
        transform: `translate(${px(x + 26 * away - POINTER_TIP[0])}, ${px(y + 34 * away - POINTER_TIP[1])}) scale(1)`,
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
module.exports.deskHtml = deskHtml;
module.exports.daylightHtml = daylightHtml;
module.exports.deskState = deskState;
/** The moment 09.2's light sweep takes the desk from: 09.1's last frame. */
module.exports.FROZEN = () => shotOf("09.1").out - 0.5 / 30;
