// G-FLOORPLAN: 14 Wattle Grove's ground floor, drawn for the third cut (the client, 22 October 2026: "change the
// floor plan to a cleaner and better one"). A single-storey four-bedroom home on its 450 m² lot as a builder's
// marketing plan draws it: solid walls, doors with their swings, windows in the walls, every room named and
// dimensioned, a north point and a scale bar. Drawn as SVG in centimetres, so it is sharp at any size the film
// shows it, and it is the one plan every surface carries (the builder's PDF tab, the solicitor's notes, the
// devices, the wall).
//   const FP = require("./pages/floorplan.cjs");
//   FP.svg()               // the plan alone, in its own viewBox (VIEW, cm)
//   FP.sheet(width)        // the plan on its white sheet with the title block, `width` CSS px wide
//   FP.SHEET_RATIO         // the sheet's height over its width (an ISO sheet)
//   FP.withSheet(html)     // a plate's square D page (portals.cjs planPage) swapped for this sheet
//
// The house (metres, x to the right, y towards the street; the rear wall is y 0): 12.0 m wide and 18.8 m deep,
// 224 m² under its roof, the porch set 1.0 m back between the garage and the master bedroom. Rear: family, dining
// and kitchen open to each other, the walk-in pantry off the kitchen, the alfresco off the family. One hall runs
// from the living to the front door. Left of it: bedroom 4, the bathroom and the laundry, then the double garage.
// Right of it: bedrooms 2 and 3, then the master suite (walk-in robe, ensuite, bedroom 1) at the front. Every
// bedroom has an outside wall and its own door to the hall; the master is the largest of the four.

const M = 100; // centimetres a metre
const EXT = 25; // external walls, cm
const INT = 10; // internal walls, cm

const INK = "#1d2430"; // walls and lines
const SOFT = "#5b6575"; // furniture and fixtures
const FAINT = "#9aa3b2";
const PAPER = "#ffffff";

const r = (v) => Math.round(v * 100) / 100;
const cm = (m) => r(m * M);

// ---------------------------------------------------------------- the house
// The outside face, clockwise (with y down) from the rear-left corner.
const OUTLINE = [
  [0, 0],
  [12, 0],
  [12, 18.8],
  [6.8, 18.8],
  [6.8, 17.8],
  [5.6, 17.8],
  [5.6, 18.8],
  [0, 18.8],
];
// Each outline edge's inward normal: the inside is to the right of travel.
const NORMALS = OUTLINE.map((p, i) => {
  const q = OUTLINE[(i + 1) % OUTLINE.length];
  return [-Math.sign(q[1] - p[1]), Math.sign(q[0] - p[0])];
});
/** The outline moved inwards by d metres (each corner where its two edges' offsets meet). */
const inset = (d) =>
  OUTLINE.map((p, i) => {
    const a = NORMALS[(i - 1 + OUTLINE.length) % OUTLINE.length];
    const b = NORMALS[i];
    return [p[0] + (a[0] + b[0]) * d, p[1] + (a[1] + b[1]) * d];
  });

const TINT = {
  living: "#fbf6ec",
  bed: "#fdfcf9",
  wet: "#eef3f7",
  hall: "#fbfaf7",
  garage: "#f1f2f4",
  outside: "#f6f3ec",
};
// The rooms: [name, internal size as shown, [x0, y0, x1, y1] on the wall centre lines (m), tint, label (m), size].
// The sizes are the rooms' internal dimensions (inside the walls), rounded to 0.1 m as a builder's plan shows them.
const ROOMS = [
  ["FAMILY", "5.0 × 6.1", [0, 0, 5.2, 6.4], "living", [2.6, 5.4]],
  ["DINING", "2.6 × 6.1", [5.2, 0, 7.8, 6.4], "living", [6.5, 5.4]],
  ["KITCHEN", "4.0 × 4.8", [7.8, 0, 12, 6.4], "living", [8.85, 5.3]],
  ["WIP", "", [10.0, 5.0, 12, 6.4], "wet", [10.82, 6.02], 26],
  ["BED 4", "5.3 × 2.9", [0, 6.4, 5.6, 9.4], "bed", [4.0, 8.0]],
  ["LDRY", "2.1 × 3.3", [0, 9.4, 2.4, 12.8], "wet", [1.0, 11.3]],
  ["BATH", "3.1 × 3.3", [2.4, 9.4, 5.6, 12.8], "wet", [3.55, 10.98]],
  ["HALL", "", [5.6, 6.4, 6.8, 17.8], "hall", null],
  ["GARAGE", "5.3 × 5.7", [0, 12.8, 5.6, 18.8], "garage", [2.9, 13.42]],
  ["BED 2", "4.9 × 3.1", [6.8, 6.4, 12, 9.6], "bed", [8.42, 8.04]],
  ["BED 3", "4.9 × 3.1", [6.8, 9.6, 12, 12.8], "bed", [8.42, 11.3]],
  ["WIR", "", [6.8, 12.8, 9.0, 14.8], "bed", [7.9, 14.22], 26],
  ["ENS", "2.7 × 1.9", [9.0, 12.8, 12, 14.8], "wet", [9.78, 14.04], 30],
  ["BED 1", "4.9 × 3.7", [6.8, 14.8, 12, 18.8], "bed", [8.3, 16.78]],
];
const OUTSIDE = [
  ["ALFRESCO", "5.2 × 3.0", [0, -3.0, 5.2, 0], [3.62, -1.3]],
  ["PORCH", "", [5.6, 17.8, 6.8, 18.8], [6.2, 18.4]],
];
// Internal walls, as centre lines [x0, y0, x1, y1] (m).
const WALLS = [
  [0, 6.4, 5.6, 6.4], // bedroom 4's head wall
  [6.8, 6.4, 12, 6.4], // bedroom 2's
  [10.0, 5.0, 12, 5.0], // the pantry
  [10.0, 5.0, 10.0, 6.4],
  [5.6, 6.4, 5.6, 17.8], // the hall, left
  [6.8, 6.4, 6.8, 17.8], // the hall, right
  [0, 9.4, 5.6, 9.4], // bedroom 4 / laundry and bathroom
  [2.4, 9.4, 2.4, 12.8], // laundry / bathroom
  [0, 12.8, 5.6, 12.8], // laundry and bathroom / garage
  [6.8, 9.6, 12, 9.6], // bedroom 2 / bedroom 3
  [6.8, 12.8, 12, 12.8], // bedroom 3 / the suite
  [9.0, 12.8, 9.0, 14.8], // robe / ensuite
  [6.8, 14.8, 12, 14.8], // the suite / bedroom 1
];
// Doors: the wall's axis ("x" for a wall along x = c, "y" along y = c), its coordinate c, the opening [a, b] along
// it, the hinge end ("a" or "b") and the side the leaf swings into (+1 or -1 across the wall).
const DOORS = [
  ["x", 5.6, [8.3, 9.12], "b", -1], // bedroom 4
  ["x", 5.6, [9.75, 10.57], "a", -1], // bathroom
  ["y", 12.8, [1.3, 2.12], "b", -1], // laundry, from the garage
  ["x", 5.6, [13.2, 14.02], "a", 1], // garage to the hall
  ["y", 17.8, [5.86, 6.68], "b", -1], // the front door
  ["x", 6.8, [8.4, 9.22], "b", 1], // bedroom 2
  ["x", 6.8, [9.95, 10.77], "a", 1], // bedroom 3
  ["x", 6.8, [15.05, 15.87], "a", 1], // bedroom 1
  ["y", 14.8, [9.6, 10.42], "a", 1], // ensuite, opening into bedroom 1
];
// Openings with no leaf: the pantry and the robe.
const OPENINGS = [
  ["x", 10.0, [5.4, 6.2]],
  ["y", 14.8, [7.45, 8.25]],
];
// Windows: [axis, c, [a, b]] in the external walls.
const WINDOWS = [
  ["y", 0, [5.5, 7.5]], // dining
  ["y", 0, [8.6, 11.0]], // kitchen, over the sink
  ["x", 0, [7.0, 8.8]], // bedroom 4
  ["x", 0, [10.4, 11.6]], // laundry
  ["x", 12, [7.2, 8.8]], // bedroom 2
  ["x", 12, [10.4, 12.0]], // bedroom 3
  ["x", 12, [13.9, 14.6]], // ensuite
  ["y", 18.8, [8.0, 10.8]], // bedroom 1, to the street
];
// The family's stacking doors to the alfresco, and the garage's panel door.
const STACKER = ["y", 0, [0.6, 4.6]];
const PANEL = ["y", 18.8, [0.4, 5.2]];

// ---------------------------------------------------------------- walls and openings
const near = (a, b) => Math.abs(a - b) < 1e-9;
/** The outline edge an opening [a, b] on a wall at axis/c lies in, or null (an internal wall). */
function edgeOf(axis, c, a, b) {
  for (let i = 0; i < OUTLINE.length; i++) {
    const p = OUTLINE[i];
    const q = OUTLINE[(i + 1) % OUTLINE.length];
    const k = axis === "x" ? 0 : 1;
    if (!near(p[k], c) || !near(q[k], c)) continue;
    const lo = Math.min(p[1 - k], q[1 - k]);
    const hi = Math.max(p[1 - k], q[1 - k]);
    if (a >= lo - 1e-9 && b <= hi + 1e-9) return i;
  }
  return null;
}
/** Whether a point lies on the outline (an internal wall ending there runs into the external wall). */
const onOutline = ([x, y]) =>
  OUTLINE.some((p, i) => {
    const q = OUTLINE[(i + 1) % OUTLINE.length];
    if (near(p[0], q[0]) && near(x, p[0]))
      return y >= Math.min(p[1], q[1]) - 1e-9 && y <= Math.max(p[1], q[1]) + 1e-9;
    if (near(p[1], q[1]) && near(y, p[1]))
      return x >= Math.min(p[0], q[0]) - 1e-9 && x <= Math.max(p[0], q[0]) + 1e-9;
    return false;
  });
/** An internal wall's centre line as a filled band, run past each end by half its width unless the end meets
 * the external wall (where running on would show outside the house). */
function band([x0, y0, x1, y1]) {
  const h = INT / 2;
  const e0 = onOutline([x0, y0]) ? 0 : h;
  const e1 = onOutline([x1, y1]) ? 0 : h;
  if (near(y0, y1)) {
    const [a, b, ea, eb] = x0 < x1 ? [x0, x1, e0, e1] : [x1, x0, e1, e0];
    return `<rect x="${r(cm(a) - ea)}" y="${r(cm(y0) - h)}" width="${r(cm(b) - cm(a) + ea + eb)}" height="${INT}"/>`;
  }
  const [a, b, ea, eb] = y0 < y1 ? [y0, y1, e0, e1] : [y1, y0, e1, e0];
  return `<rect x="${r(cm(x0) - h)}" y="${r(cm(a) - ea)}" width="${INT}" height="${r(cm(b) - cm(a) + ea + eb)}"/>`;
}
/** The external walls: the outline less the outline moved in by the wall's width, as one shape. */
function externalWalls() {
  const ring = (pts) => `M ${pts.map(([x, y]) => `${cm(x)} ${cm(y)}`).join(" L ")} Z`;
  return `<path fill-rule="evenodd" d="${ring(OUTLINE)} ${ring(inset(EXT / M))}"/>`;
}
/** The wall's face-to-face band at an opening, in cm across the wall: [low, high]. */
function across(axis, c, [a, b]) {
  const edge = edgeOf(axis, c, a, b);
  if (edge === null) return [cm(c) - INT / 2 - 1, cm(c) + INT / 2 + 1];
  const inside = NORMALS[edge][axis === "x" ? 0 : 1];
  const o = cm(c);
  const f = o + inside * EXT;
  return [Math.min(o, f) - 1, Math.max(o, f) + 1];
}
/** Clears the wall at an opening (paper). */
function gap(axis, c, [a, b]) {
  const [lo, hi] = across(axis, c, [a, b]);
  return axis === "x"
    ? `<rect x="${lo}" y="${cm(a)}" width="${hi - lo}" height="${cm(b - a)}" fill="${PAPER}"/>`
    : `<rect x="${cm(a)}" y="${lo}" width="${cm(b - a)}" height="${hi - lo}" fill="${PAPER}"/>`;
}
/** An opening with no leaf: the gap and its two jambs. */
function opening([axis, c, [a, b]]) {
  const [lo, hi] = across(axis, c, [a, b]);
  const jamb = (v) =>
    axis === "x"
      ? `<line x1="${lo}" y1="${cm(v)}" x2="${hi}" y2="${cm(v)}"/>`
      : `<line x1="${cm(v)}" y1="${lo}" x2="${cm(v)}" y2="${hi}"/>`;
  return `${gap(axis, c, [a, b])}<g stroke="${INK}" stroke-width="2">${jamb(a)}${jamb(b)}</g>`;
}
function door([axis, c, [a, b], hinge, side]) {
  const w = cm(b - a);
  const [lo, hi] = across(axis, c, [a, b]);
  const face = side > 0 ? hi - 1 : lo + 1; // the face the leaf swings from
  const h = hinge === "a" ? cm(a) : cm(b);
  const far = hinge === "a" ? cm(b) : cm(a);
  // The leaf, open at right angles to the wall from its hinge; the swing, dashed, from its tip to the far jamb.
  if (axis === "x") {
    const tip = face + side * w;
    return `${gap(axis, c, [a, b])}<line x1="${face}" y1="${h}" x2="${tip}" y2="${h}" stroke="${INK}" stroke-width="3.2"/>
      <path d="M ${tip} ${h} A ${w} ${w} 0 0 ${(side > 0) === (hinge === "a") ? 1 : 0} ${face} ${far}" fill="none" stroke="${SOFT}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  }
  const tip = face + side * w;
  return `${gap(axis, c, [a, b])}<line x1="${h}" y1="${face}" x2="${h}" y2="${tip}" stroke="${INK}" stroke-width="3.2"/>
    <path d="M ${h} ${tip} A ${w} ${w} 0 0 ${(side > 0) === (hinge === "a") ? 0 : 1} ${far} ${face}" fill="none" stroke="${SOFT}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
}
function windowAt([axis, c, [a, b]]) {
  const [lo, hi] = across(axis, c, [a, b]);
  const mid = (lo + hi) / 2;
  const lines = [lo + 2.5, mid, hi - 2.5]
    .map((v) =>
      axis === "x"
        ? `<line x1="${v}" y1="${cm(a)}" x2="${v}" y2="${cm(b)}"/>`
        : `<line x1="${cm(a)}" y1="${v}" x2="${cm(b)}" y2="${v}"/>`,
    )
    .join("");
  const jambs =
    axis === "x"
      ? `<line x1="${lo}" y1="${cm(a)}" x2="${hi}" y2="${cm(a)}"/><line x1="${lo}" y1="${cm(b)}" x2="${hi}" y2="${cm(b)}"/>`
      : `<line x1="${cm(a)}" y1="${lo}" x2="${cm(a)}" y2="${hi}"/><line x1="${cm(b)}" y1="${lo}" x2="${cm(b)}" y2="${hi}"/>`;
  return `${gap(axis, c, [a, b])}<g stroke="${INK}" stroke-width="2.2">${lines}${jambs}</g>`;
}
/** The stacking doors: two panes overlapping in the opening. */
function stacker([axis, c, [a, b]]) {
  const [lo, hi] = across(axis, c, [a, b]);
  const m = (cm(a) + cm(b)) / 2;
  return `${gap(axis, c, [a, b])}<g stroke="${INK}" stroke-width="2.4" fill="none">
    <line x1="${cm(a)}" y1="${lo + 7}" x2="${m + 24}" y2="${lo + 7}"/><line x1="${m - 24}" y1="${hi - 7}" x2="${cm(b)}" y2="${hi - 7}"/>
    <line x1="${cm(a)}" y1="${lo}" x2="${cm(a)}" y2="${hi}"/><line x1="${cm(b)}" y1="${lo}" x2="${cm(b)}" y2="${hi}"/></g>`;
}
function panelDoor([axis, c, [a, b]]) {
  const [lo, hi] = across(axis, c, [a, b]);
  return `${gap(axis, c, [a, b])}<g stroke="${INK}" stroke-width="2"><line x1="${cm(a)}" y1="${(lo + hi) / 2}" x2="${cm(b)}" y2="${(lo + hi) / 2}" stroke-dasharray="14 8"/>
    <line x1="${cm(a)}" y1="${lo}" x2="${cm(a)}" y2="${hi}"/><line x1="${cm(b)}" y1="${lo}" x2="${cm(b)}" y2="${hi}"/></g>`;
}

// ---------------------------------------------------------------- furniture and fixtures (fine lines)
const rect = (x0, y0, x1, y1, extra = "") =>
  `<rect x="${cm(x0)}" y="${cm(y0)}" width="${r(cm(x1) - cm(x0))}" height="${r(cm(y1) - cm(y0))}" ${extra}/>`;
const circle = (x, y, rad, extra = "") => `<circle cx="${cm(x)}" cy="${cm(y)}" r="${cm(rad)}" ${extra}/>`;
const line = (x0, y0, x1, y1, extra = "") =>
  `<line x1="${cm(x0)}" y1="${cm(y0)}" x2="${cm(x1)}" y2="${cm(y1)}" ${extra}/>`;
/** A bed with its pillows and turned-down sheet, its head at the edge `head` ("top", "bottom", "right"). */
function bed(x0, y0, x1, y1, head) {
  const w = x1 - x0;
  const h = y1 - y0;
  const across = head === "top" || head === "bottom" ? w : h;
  const n = across > 1.2 ? 2 : 1;
  const pillows = [];
  for (let i = 0; i < n; i++) {
    const span = (across - 0.3) / n;
    if (head === "top" || head === "bottom") {
      const px0 = x0 + 0.15 + i * span + 0.04;
      const py0 = head === "top" ? y0 + 0.1 : y1 - 0.48;
      pillows.push(rect(px0, py0, px0 + span - 0.08, py0 + 0.38, 'rx="8"'));
    } else {
      const py0 = y0 + 0.15 + i * span + 0.04;
      const px0 = x1 - 0.48;
      pillows.push(rect(px0, py0, px0 + 0.38, py0 + span - 0.08, 'rx="8"'));
    }
  }
  const fold =
    head === "top"
      ? line(x0, y0 + h * 0.34, x1, y0 + h * 0.34)
      : head === "bottom"
        ? line(x0, y1 - h * 0.34, x1, y1 - h * 0.34)
        : line(x1 - w * 0.34, y0, x1 - w * 0.34, y1);
  return `<g>${rect(x0, y0, x1, y1, 'rx="6"')}${pillows.join("")}${fold}</g>`;
}
/** A built-in robe: its doors' line, and the hanging rail dashed down its length. */
function robe(x0, y0, x1, y1) {
  const long = x1 - x0 > y1 - y0;
  const rail = long
    ? line(x0 + 0.08, (y0 + y1) / 2, x1 - 0.08, (y0 + y1) / 2, 'stroke-dasharray="9 7"')
    : line((x0 + x1) / 2, y0 + 0.08, (x0 + x1) / 2, y1 - 0.08, 'stroke-dasharray="9 7"');
  return `${rect(x0, y0, x1, y1)}${rail}`;
}
const car = (x0, y0) => {
  const w = 1.85;
  const l = 4.5;
  return `<g opacity=".8">${rect(x0, y0, x0 + w, y0 + l, 'rx="38"')}${rect(x0 + 0.18, y0 + 1.15, x0 + w - 0.18, y0 + 2.0, 'rx="16"')}${rect(x0 + 0.18, y0 + 3.0, x0 + w - 0.18, y0 + 3.6, 'rx="14"')}
    ${line(x0 + 0.2, y0 + 0.55, x0 + w - 0.2, y0 + 0.55)}</g>`;
};
/** A toilet: (x, y) the cistern's centre against its wall; `facing` the way the pan points. */
const toilet = (x, y, facing) => {
  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[facing];
  const upright = facing === "down" || facing === "up";
  const cis = upright
    ? rect(x - 0.22, y - 0.1, x + 0.22, y + 0.1, 'rx="4"')
    : rect(x - 0.1, y - 0.22, x + 0.1, y + 0.22, 'rx="4"');
  const bx = x + d[0] * 0.38;
  const by = y + d[1] * 0.38;
  return `${cis}<ellipse cx="${cm(bx)}" cy="${cm(by)}" rx="${cm(upright ? 0.19 : 0.26)}" ry="${cm(upright ? 0.26 : 0.19)}"/>`;
};
const basin = (x, y) => `<ellipse cx="${cm(x)}" cy="${cm(y)}" rx="${cm(0.21)}" ry="${cm(0.15)}"/>`;
const shower = (x0, y0, x1, y1) =>
  `${rect(x0, y0, x1, y1)}${line(x0, y0, x1, y1, 'opacity=".5"')}${line(x1, y0, x0, y1, 'opacity=".5"')}${circle((x0 + x1) / 2, (y0 + y1) / 2, 0.05)}`;
const chair = (x, y) => `<rect x="${cm(x) - 21}" y="${cm(y) - 21}" width="42" height="42" rx="8"/>`;

function furniture() {
  const f = [];
  // Family: the TV on the side wall, an L sofa on a rug facing it, a coffee table.
  f.push(rect(0.32, 1.6, 0.7, 3.4, 'rx="4"'));
  f.push(rect(1.25, 1.25, 4.15, 3.75, 'rx="10" stroke-dasharray="4 6" opacity=".7"'));
  f.push(rect(1.4, 3.6, 4.45, 4.45, 'rx="14"'), rect(3.6, 1.15, 4.45, 3.6, 'rx="14"'));
  f.push(rect(1.75, 1.95, 3.1, 2.85, 'rx="12"'));
  // Dining: a table for six.
  f.push(rect(5.85, 1.9, 7.15, 3.7, 'rx="10"'));
  for (const y of [2.3, 2.8, 3.3]) f.push(chair(5.52, y), chair(7.48, y));
  // Kitchen: the benches under the window and along the side wall, the sink, the cooktop, the fridge, the island.
  f.push(rect(8.25, 0.25, 11.75, 0.9), rect(11.1, 0.9, 11.75, 4.0));
  f.push(rect(9.3, 0.36, 10.3, 0.8, 'rx="6"'), line(9.8, 0.36, 9.8, 0.8));
  for (const [x, y] of [
    [11.27, 1.95],
    [11.58, 1.95],
    [11.27, 2.4],
    [11.58, 2.4],
  ])
    f.push(circle(x, y, 0.11));
  f.push(rect(11.05, 4.05, 11.75, 4.8), line(11.05, 4.05, 11.75, 4.8, 'opacity=".5"'));
  f.push(rect(8.4, 2.6, 10.6, 3.6, 'rx="6"'));
  for (const x of [8.85, 9.5, 10.15]) f.push(circle(x, 3.95, 0.2));
  // The walk-in pantry's shelves.
  f.push(rect(10.6, 5.1, 11.7, 5.45), rect(11.35, 5.45, 11.7, 6.3));
  // Alfresco: a table for four and the barbecue bench.
  f.push(circle(1.55, -1.6, 0.5));
  for (const [x, y] of [
    [1.55, -2.42],
    [1.55, -0.78],
    [0.73, -1.6],
    [2.37, -1.6],
  ])
    f.push(circle(x, y, 0.17));
  f.push(rect(3.4, -2.85, 5.05, -2.3, 'rx="4"'));
  // Bedroom 4: a queen bed against its head wall, its tables, a robe.
  f.push(bed(1.5, 6.6, 3.1, 8.7, "top"), rect(1.0, 6.6, 1.4, 7.0, 'rx="4"'), rect(3.2, 6.6, 3.6, 7.0, 'rx="4"'));
  f.push(robe(4.0, 6.55, 5.45, 7.15));
  // Laundry: the bench with its trough and the washer.
  f.push(rect(0.3, 9.5, 2.3, 10.1), rect(0.45, 9.58, 1.05, 10.02, 'rx="6"'), rect(1.55, 9.52, 2.15, 10.08, 'rx="4"'), circle(1.85, 9.8, 0.2));
  // Bathroom: the vanity, the toilet, the bath and the shower.
  f.push(rect(2.65, 9.5, 3.95, 10.0), basin(3.3, 9.75));
  f.push(toilet(4.35, 9.55, "down"));
  f.push(rect(2.6, 11.95, 4.3, 12.7, 'rx="18"'), rect(2.72, 12.05, 4.18, 12.6, 'rx="24"'));
  f.push(shower(4.6, 11.75, 5.5, 12.7));
  // Garage: two cars.
  f.push(car(0.65, 13.95), car(3.3, 13.95));
  // The hall's console.
  f.push(rect(5.68, 14.3, 6.0, 15.3, 'rx="4"'));
  // Bedrooms 2 and 3: queen beds, their tables, robes beside the doors.
  f.push(bed(9.4, 6.6, 11.0, 8.7, "top"), rect(8.9, 6.6, 9.3, 7.0, 'rx="4"'), rect(11.1, 6.6, 11.5, 7.0, 'rx="4"'));
  f.push(robe(6.9, 6.55, 7.5, 8.2));
  f.push(bed(9.4, 10.6, 11.0, 12.7, "bottom"), rect(8.9, 12.3, 9.3, 12.7, 'rx="4"'), rect(11.1, 12.3, 11.5, 12.7, 'rx="4"'));
  f.push(robe(6.9, 11.0, 7.5, 12.7));
  // The walk-in robe: hanging on three sides.
  f.push(robe(6.9, 12.95, 7.4, 14.7), robe(8.4, 12.95, 8.9, 14.7), robe(7.4, 12.9, 8.4, 13.4));
  // Ensuite: the double vanity, the shower, the toilet.
  f.push(rect(9.15, 12.9, 10.45, 13.4), basin(9.48, 13.15), basin(10.12, 13.15));
  f.push(shower(10.8, 12.9, 11.7, 13.8));
  f.push(toilet(11.64, 14.25, "left"));
  // Bedroom 1: a king bed with its head to the side wall, its tables, a tallboy.
  f.push(bed(9.55, 15.95, 11.7, 17.85, "right"), rect(11.28, 15.45, 11.7, 15.85, 'rx="4"'), rect(11.28, 17.95, 11.7, 18.37, 'rx="4"'));
  f.push(rect(6.9, 17.0, 7.4, 18.45, 'rx="4"'));
  return `<g fill="none" stroke="${SOFT}" stroke-width="1.8" stroke-linejoin="round">${f.join("")}</g>`;
}

// ---------------------------------------------------------------- labels and dimensions
const SANS = `Inter, "Helvetica Neue", Arial, sans-serif`;
const halo = `paint-order="stroke" stroke="${PAPER}" stroke-width="9" stroke-linejoin="round"`;
const text = (x, y, size, weight, fill, body, extra = "") =>
  `<text x="${cm(x)}" y="${cm(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" font-family='${SANS}' letter-spacing="${r(size * 0.05)}" ${halo} ${extra}>${body}</text>`;
const times = (s) => s.replace("×", "&#215;");
function labels() {
  const out = [];
  for (const [name, dims, , , at, size = 36] of ROOMS) {
    if (!at) continue;
    out.push(text(at[0], at[1], size, 700, INK, name));
    if (dims) out.push(text(at[0], at[1] + 0.38, 24, 500, SOFT, times(dims)));
  }
  for (const [name, dims, , at] of OUTSIDE) {
    out.push(text(at[0], at[1], name === "PORCH" ? 24 : 30, 700, SOFT, name));
    if (dims) out.push(text(at[0], at[1] + 0.36, 22, 500, FAINT, times(dims)));
  }
  // The hall and its entry, set along their length.
  const along = (x, y, body) =>
    `<text x="${cm(x)}" y="${cm(y)}" font-size="26" font-weight="700" fill="${SOFT}" text-anchor="middle" font-family='${SANS}' letter-spacing="2.6" transform="rotate(-90 ${cm(x)} ${cm(y)})">${body}</text>`;
  out.push(along(6.29, 9.95, "HALL"), along(6.29, 16.05, "ENTRY"));
  return out.join("");
}
/** A dimension line with its ticks and figure. */
function dimension(axis, at, a, b, label) {
  const t = 14;
  const fig = `font-size="26" font-weight="600" fill="${INK}" text-anchor="middle" font-family='${SANS}' letter-spacing="1.5"`;
  if (axis === "h") {
    const y = cm(at);
    return `<g stroke="${INK}" stroke-width="1.6"><line x1="${cm(a)}" y1="${y}" x2="${cm(b)}" y2="${y}"/>
      <line x1="${cm(a) - t}" y1="${y + t}" x2="${cm(a) + t}" y2="${y - t}"/><line x1="${cm(b) - t}" y1="${y + t}" x2="${cm(b) + t}" y2="${y - t}"/>
      <line x1="${cm(a)}" y1="${y - 22}" x2="${cm(a)}" y2="${y + 22}"/><line x1="${cm(b)}" y1="${y - 22}" x2="${cm(b)}" y2="${y + 22}"/></g>
      <text x="${r((cm(a) + cm(b)) / 2)}" y="${y - 14}" ${fig}>${label}</text>`;
  }
  const x = cm(at);
  const mid = r((cm(a) + cm(b)) / 2);
  return `<g stroke="${INK}" stroke-width="1.6"><line x1="${x}" y1="${cm(a)}" x2="${x}" y2="${cm(b)}"/>
    <line x1="${x - t}" y1="${cm(a) + t}" x2="${x + t}" y2="${cm(a) - t}"/><line x1="${x - t}" y1="${cm(b) + t}" x2="${x + t}" y2="${cm(b) - t}"/>
    <line x1="${x - 22}" y1="${cm(a)}" x2="${x + 22}" y2="${cm(a)}"/><line x1="${x - 22}" y1="${cm(b)}" x2="${x + 22}" y2="${cm(b)}"/></g>
    <text x="${x - 16}" y="${mid}" ${fig} transform="rotate(-90 ${x - 16} ${mid})">${label}</text>`;
}

// The drawing's extent (cm): the plan from the alfresco to the street, with its dimensions to the left, above and below.
const VIEW = { x: -115, y: -410, w: 1345, h: 2375 };

/** The plan alone, in its own viewBox (cm); `width`/`height` give it a size in CSS px. */
function svg({ width = null, height = null } = {}) {
  const tints = ROOMS.map(([, , [x0, y0, x1, y1], tint]) => rect(x0, y0, x1, y1, `fill="${TINT[tint]}"`)).join("");
  const outside = OUTSIDE.map(([, , [x0, y0, x1, y1]]) => rect(x0, y0, x1, y1, `fill="${TINT.outside}"`)).join("");
  // The alfresco's roof line, dashed, and its two posts.
  const roof = `<g fill="none" stroke="${SOFT}" stroke-width="1.6" stroke-dasharray="12 8">${rect(0, -3.0, 5.2, 0)}</g>
    ${[
      [0.03, -2.97],
      [5.02, -2.97],
    ]
      .map(([x, y]) => `<rect x="${cm(x)}" y="${cm(y)}" width="15" height="15" fill="${INK}"/>`)
      .join("")}`;
  const walls = `<g fill="${INK}">${externalWalls()}${WALLS.map(band).join("")}</g>`;
  const openings = [
    ...WINDOWS.map(windowAt),
    stacker(STACKER),
    panelDoor(PANEL),
    ...OPENINGS.map(opening),
    ...DOORS.map(door),
  ].join("");
  const dims = [
    dimension("h", -3.65, 0, 12, "12.0 m"),
    dimension("v", -0.75, 0, 18.8, "18.8 m"),
    dimension("h", 19.35, 0, 5.6, "5.6"),
    dimension("h", 19.35, 5.6, 6.8, "1.2"),
    dimension("h", 19.35, 6.8, 12, "5.2"),
  ].join("");
  const size = width ? `width="${width}" height="${height ?? r((width * VIEW.h) / VIEW.w)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" ${size} style="display:block">
    ${outside}${tints}${roof}${furniture()}${walls}${openings}${labels()}${dims}</svg>`;
}

// ---------------------------------------------------------------- the sheet
// A portrait A3 sheet: the plan at 1:75 (so the scale bar and the stated scale agree with the drawing), a north
// point, and the title block under a gold rule in the report's unbranded gold and obsidian, so it reads as the
// builder's own document.
const SHEET_RATIO = Math.SQRT2;
const SHEET_MM = 297; // A3's short side
const SCALE = 75;
const GOLD = "#C89B3C";
const OBSIDIAN = "#251F18";
function north(size) {
  return `<svg viewBox="-50 -62 100 124" width="${r(size)}" height="${r(size * 1.24)}" style="display:block">
    <circle cx="0" cy="0" r="34" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M 0 -48 L 14 12 L 0 3 L -14 12 Z" fill="${INK}"/><path d="M 0 3 L 14 12 L 0 -48 Z" fill="${GOLD}"/>
    <text x="0" y="58" font-size="22" font-weight="800" fill="${INK}" text-anchor="middle" font-family='${SANS}'>N</text></svg>`;
}
/** A scale bar of `metres`, `unit` px a metre, alternating ink and paper. */
function scaleBar(metres, unit, k) {
  const h = Math.max(3, 6 * k);
  const segs = Array.from({ length: metres }, (_, i) =>
    `<rect x="${r(i * unit)}" y="0" width="${r(unit)}" height="${r(h)}" fill="${i % 2 ? PAPER : INK}" stroke="${INK}" stroke-width="${r(Math.max(0.6, k))}"/>`,
  ).join("");
  const fs = r(10 * k);
  const ticks = [0, 1, metres]
    .map((m) => `<text x="${r(m * unit)}" y="${r(h + 14 * k)}" font-size="${fs}" font-weight="600" fill="${INK}" text-anchor="middle" font-family='${SANS}'>${m}${m === metres ? " m" : ""}</text>`)
    .join("");
  const w = metres * unit;
  return `<svg viewBox="${r(-8 * k)} ${r(-2 * k)} ${r(w + 26 * k)} ${r(h + 20 * k)}" width="${r(w + 34 * k)}" style="display:block;overflow:visible">${segs}${ticks}</svg>`;
}
/** The plan on its sheet, `width` CSS px wide (height width × SHEET_RATIO), with its title block. */
function sheet(width, { id = "", extra = "" } = {}) {
  const k = width / 1000; // everything below is laid out on a 1000-wide sheet
  const H = r(width * SHEET_RATIO);
  // 1:75 on A3: the drawing's width in metres, over the scale, over the sheet's width in mm.
  const planW = ((VIEW.w / M / SCALE) * 1000 * 1000) / SHEET_MM; // on the 1000-wide sheet
  const planH = (planW * VIEW.h) / VIEW.w;
  const unit = (planW / (VIEW.w / M)) * k; // CSS px a metre
  const left = (1000 - planW) / 2;
  return `<div class="fp-sheet"${id ? ` id="${id}"` : ""} style="position:relative;width:${r(width)}px;height:${H}px;background:${PAPER};overflow:hidden;font-family:${SANS};color:${INK}">
    <div style="position:absolute;left:${r(34 * k)}px;top:${r(34 * k)}px;right:${r(34 * k)}px;bottom:${r(34 * k)}px;border:${r(Math.max(1, 1.6 * k))}px solid ${INK}"></div>
    <div style="position:absolute;left:${r(70 * k)}px;top:${r(66 * k)}px;font-size:${r(15 * k)}px;font-weight:700;letter-spacing:${r(3.2 * k)}px;color:${SOFT};white-space:nowrap">GROUND FLOOR PLAN</div>
    <div style="position:absolute;left:${r(70 * k)}px;top:${r(90 * k)}px;font-size:${r(12 * k)}px;font-weight:500;letter-spacing:${r(1.2 * k)}px;color:${FAINT};white-space:nowrap">SINGLE STOREY · 4 BED · 2 BATH</div>
    <div style="position:absolute;left:${r(left * k)}px;top:${r(104 * k)}px;width:${r(planW * k)}px;height:${r(planH * k)}px">${svg({ width: r(planW * k), height: r(planH * k) })}</div>
    <div style="position:absolute;right:${r(80 * k)}px;top:${r(64 * k)}px">${north(56 * k)}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${r(232 * k)}px">
      <div style="position:absolute;left:${r(70 * k)}px;right:${r(70 * k)}px;top:0;height:${r(Math.max(1, 3 * k))}px;background:${GOLD}"></div>
      <div style="position:absolute;left:${r(70 * k)}px;top:${r(30 * k)}px;font-size:${r(13 * k)}px;font-weight:700;letter-spacing:${r(3 * k)}px;color:${GOLD};white-space:nowrap">REED CONSTRUCTIONS · BANKSIA RISE</div>
      <div style="position:absolute;left:${r(70 * k)}px;top:${r(56 * k)}px;font:600 ${r(42 * k)}px/1.05 'Playfair Display', Georgia, serif;color:${OBSIDIAN};letter-spacing:-.01em;white-space:nowrap">14 Wattle Grove</div>
      <div style="position:absolute;left:${r(70 * k)}px;top:${r(112 * k)}px;font-size:${r(16 * k)}px;font-weight:500;color:${SOFT};white-space:nowrap">Banksia Rise NSW 2155 · Lot 14 · Ref WG-14</div>
      <div style="position:absolute;left:${r(70 * k)}px;top:${r(150 * k)}px;display:flex;gap:${r(16 * k)}px;font-size:${r(14.5 * k)}px;font-weight:700;letter-spacing:${r(0.6 * k)}px;color:${INK};white-space:nowrap">
        <span>4 BED</span><span style="color:${GOLD}">·</span><span>2 BATH</span><span style="color:${GOLD}">·</span><span>2 CAR</span><span style="color:${GOLD}">·</span><span>224 m² HOME</span><span style="color:${GOLD}">·</span><span>450 m² LAND</span></div>
      <div style="position:absolute;right:${r(80 * k)}px;top:${r(30 * k)}px;text-align:right;font-size:${r(12 * k)}px;font-weight:600;color:${SOFT};line-height:1.65;white-space:nowrap">SCALE 1:${SCALE} @ A3<br>DRAWING FP-01 · REV B</div>
      <div style="position:absolute;right:${r(80 * k)}px;top:${r(98 * k)}px">${scaleBar(5, unit, k)}</div>
    </div>${extra}
  </div>`;
}

/**
 * A plate's floor plan page (portals.cjs planPage: a square page with the old image D on it) swapped for this
 * sheet, as tall as that page and as wide as its proportion makes it, so the PDF viewer shows the new plan.
 */
function withSheet(html) {
  const re = /<div class="ppage" style="width:(\d+(?:\.\d+)?)px;height:\1px;background:#fff url\('[^']*D\.png'\) center\/contain no-repeat"><\/div>/g;
  let n = 0;
  const out = html.replace(re, (_, side) => {
    n++;
    const h = Number(side);
    const w = r(h / SHEET_RATIO);
    return `<div class="ppage" style="width:${w}px;height:${h}px;background:#fff">${sheet(w)}</div>`;
  });
  if (n === 0) throw new Error("floorplan.withSheet: the page has no floor plan page to swap");
  return out;
}

module.exports = { svg, sheet, withSheet, SHEET_RATIO, VIEW };
