// NEW-REPORT-CHARTS: the client's two reports for 14 Wattle Grove, drawn as figures (shots 05.2 and 08.2).
//
// The client asked for the report's pages to be shown as figures, charts and infographics, never as pages of
// prose (22 October 2026), and for more of them. These are the product's own documents in its own unbranded
// colours: white A4 sheets under the issuer's running head, in the family the product resolves for an issuer
// that set no brand colour (gold #D9A520 and obsidian #251F18, portals.cjs's DOC), Helvetica drawn in its
// metric twin Liberation Sans. The chart forms are the report's own (npc-client-dashboard
// _shared/reportDesign/charts.pure.ts and reports/investment/charts.pure.ts): the half-arc gauge with its
// "/100 · STRONG" band, score bars on one baseline in one accent, figure tiles, the value-debt-equity columns
// of the 10 Year Cash Flow with each column's equity above it, horizontal comparison bars against a median.
//
// Two documents, as the product makes them (reports/investment/tierIdentity.pure.ts):
//  - the Financial Analysis that 05.1 prepares from the Compass ("What it costs to buy and hold, what it
//    returns, and how the position moves over ten years"): its cover, key figures, capital growth and its
//    ten-year cash flow, in 05.2. The Compass carries no modelling of a purchase, so the yield and the
//    ten-year position belong here, and a variant restates its parent's grade (A+), never its own.
//  - the Investment Compass, further in: how the grade was reached, the suburb at a glance, rental comparables
//    and the risk dashboard, in 08.2. None of them appears in 05.2.
//
// Each page is 595.5 x 842.25 CSS px (one px a point of the sheet) and is set larger than the product's
// standard PDF sets it, so that on a phone, at about 1.5 frame px a point, every figure the film is about reads
// at 22 px or more. Every modelled page carries the illustrative label (guardrail 2). The parts a frame
// animates (a line drawing, a column growing, the gauge's sweep, the marker) carry ids; ./scenes/deliverable.cjs
// and ./scenes/pages.cjs move them.
const { widthOf } = require("../helvetica.cjs");

const A4 = [595.5, 842.25];
const DOC = {
  gold: "#D9A520",
  goldInk: "#624A0F",
  field: "#251F18",
  ivory: "#FAF7EF",
  wash: "#FCF7EB",
  stripe: "#FDFBF5",
  hair: "#E3D6B5",
  muted: "#544B40",
  prose: "#333333",
  note: "#373737",
  // The report's semantic colours (reportDesign/tokens.pure.ts).
  positive: "#157A3A",
  caution: "#856514",
  negative: "#D31212",
};
const SANS = "'Liberation Sans', Helvetica, Arial, sans-serif";
const SERIF = "'Liberation Serif', 'Times New Roman', serif";
const ILLUSTRATIVE =
  "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice.";

// ------------------------------------------------------------------ the record's figures, computed once
// The purchase: $1,150,000, a 20 percent deposit and a $920,000 loan at 6.1 percent, principal and interest
// over 30 years; the rent as supplied, $850 a week. The value grows at 5.0 percent a year in the modelled case,
// under the council area's own 5.1 percent a year of the last ten (GROWTH, below).
const PRICE = 1150000;
const RENT = 850;
const LOAN = 920000;
const RATE = 0.061;
const GROW = 0.05;
const YIELD = (RENT * 52) / PRICE; // 3.84 percent
const monthly = RATE / 12;
const PAYMENT = (LOAN * monthly) / (1 - (1 + monthly) ** -360);
const balance = (years) => {
  const g = (1 + monthly) ** (years * 12);
  return LOAN * g - (PAYMENT * (g - 1)) / monthly;
};
const POSITION = Array.from({ length: 11 }, (_, y) => {
  const value = PRICE * (1 + GROW) ** y;
  const loan = y === 0 ? LOAN : balance(y);
  return { year: y, value, loan, equity: value - loan };
});
// The council area's median house price, the year to June, as its publisher's series records it ($k).
const GROWTH = [
  [2016, 760],
  [2017, 795],
  [2018, 770],
  [2019, 745],
  [2020, 800],
  [2021, 1010],
  [2022, 1080],
  [2023, 1040],
  [2024, 1130],
  [2025, 1188],
  [2026, 1250],
];
const TEN_YEAR = GROWTH.at(-1)[1] / GROWTH[0][1] - 1; // +64 percent
const CAGR = (GROWTH.at(-1)[1] / GROWTH[0][1]) ** (1 / 10) - 1; // 5.1 percent a year
// The grade: the product's own for a composite of 84 on all five dimensions (scoringV2Production.pure.ts).
const DIMENSIONS = [
  ["Capital growth", 86, 40],
  ["Location", 90, 25],
  ["Rental yield", 72, 15],
  ["Demand", 84, 15],
  ["Property risk", 80, 5],
];
const COMPOSITE = DIMENSIONS.reduce((s, [, v, w]) => s + (v * w) / 100, 0); // 84.30
const VERDICT =
  "STRONG BUY - Excellent investment opportunity with strong fundamentals across all metrics";

// ------------------------------------------------------------------ drawing
const f2 = (v) => Number(v.toFixed(2));
const esc = (t) =>
  String(t)
    .replace(/&(?!amp;|nbsp;)/g, "&amp;")
    .replace(/</g, "&lt;");
const money = (v) => `$${Math.round(v).toLocaleString("en-AU")}`;
const short = (v) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2).replace(/0$/, "")}m` : `$${Math.round(v / 1000)}k`;
const rule = (x, top, w, h, color, extra = "") =>
  `<i class="rc-r" style="left:${f2(x)}px;top:${f2(top)}px;width:${f2(w)}px;height:${f2(h)}px;background:${color}${extra}"></i>`;
/** Text on a baseline: x its left edge, or with `end` its right edge, or with `mid` its centre. */
const set = (
  x,
  base,
  size,
  text,
  {
    bold = false,
    color = DOC.prose,
    end = false,
    mid = false,
    track = 0,
    family = SANS,
    id = "",
    style = "",
  } = {},
) => {
  const top = base - 0.8465 * size;
  const pos = end
    ? `right:${f2(A4[0] - x - track)}px`
    : mid
      ? `left:${f2(x)}px;transform:translateX(calc(-50% + ${f2(track / 2)}px))`
      : `left:${f2(x)}px`;
  return `<div class="rc-t"${id ? ` id="${id}"` : ""} style="${pos};top:${f2(top)}px;font-size:${size}px;font-weight:${bold ? 700 : 400};color:${color};font-family:${family}${track ? `;letter-spacing:${track}px` : ""}${style ? `;${style}` : ""}">${text}</div>`;
};
const W = (text, size, bold = false) => widthOf(text, size, bold);

/** The running head and the footer every content page carries, under the document's own title. */
const furniture = (title, page) =>
  `${set(48, 36, 7, "AURIXA SYSTEMS", { color: DOC.muted, track: 1.4, bold: true })}${set(547.5, 36, 7, title.toUpperCase(), { color: DOC.muted, track: 1.4, end: true, bold: true })}
  ${rule(48, 44, 499.5, 0.5, DOC.hair)}${rule(48, 43.25, 36, 2, DOC.gold)}
  ${rule(48, 800, 499.5, 0.5, DOC.gold)}${set(48, 814, 7.5, `${title}&nbsp;&nbsp;|&nbsp;&nbsp;14 Wattle Grove, Banksia Rise NSW 2155&nbsp;&nbsp;|&nbsp;&nbsp;Confidential`, { color: DOC.muted })}${set(547.5, 814, 7.5, `Page ${page}`, { color: DOC.muted, end: true })}`;
/** A section's opening: its number and name as an eyebrow, the heading, its gold rule, the illustrative band. */
const opening = (eyebrow, title, { label = true } = {}) =>
  `${set(48, 78, 8, eyebrow.toUpperCase(), { color: DOC.goldInk, bold: true, track: 1.6 })}
  ${rule(40, 89, 3.5, 25, DOC.gold)}${set(48, 110, 24, esc(title), { bold: true, color: DOC.field })}
  ${rule(48, 120, W(title, 24, true) + 22, 1.5, DOC.gold)}
  ${label ? `<div class="rc-label" style="left:48px;top:130px;width:499.5px;height:17px">${ILLUSTRATIVE}</div>` : ""}`;
const sheet = (html, { bg = "#fff" } = {}) =>
  `<div class="rc" style="background:${bg}">${html}</div>`;

// Line icons, drawn on a 24-unit square in the report's ink (the products' own icon weight, 1.8).
const ICONS = {
  house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  key: '<circle cx="8" cy="14" r="4.5"/><path d="M11.2 10.8 20 2"/><path d="M16 6l3 3"/><path d="M14 8l2 2"/>',
  people:
    '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><path d="M15 14.5c3 0 6 1.8 6 5.5"/>',
  door: '<path d="M6 21V4h12v17"/><path d="M3 21h18"/><circle cx="14.5" cy="12.5" r="0.9" fill="currentColor"/>',
  bed: '<path d="M3 18V8"/><path d="M3 14h18v4"/><path d="M21 14v-3a3 3 0 0 0-3-3h-6v6"/><circle cx="7.5" cy="11" r="2"/>',
  bath: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M6 12V6a2 2 0 0 1 4 0"/>',
  car: '<path d="M5 16h14v-4l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
  land: '<path d="M3 20h18"/><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-5h6v5"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  school:
    '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  train:
    '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12"/><circle cx="9.5" cy="14" r="0.8" fill="currentColor"/><circle cx="14.5" cy="14" r="0.8" fill="currentColor"/><path d="M8 21l2-4M16 21l-2-4"/>',
};
const icon = (name, x, y, size, color = DOC.goldInk, width = 1.8) =>
  `<svg class="rc-svg" style="left:${f2(x)}px;top:${f2(y)}px;width:${size}px;height:${size}px;color:${color}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** A KPI tile as the report draws it: the wash, a gold border, the 4 pt strip, the label, the figure, its note. */
const tile = (x, y, w, h, label, value, note, { valueSize = 34, id = "", extra = "" } = {}) =>
  `<div class="rc-tile"${id ? ` id="${id}"` : ""} style="left:${f2(x)}px;top:${f2(y)}px;width:${f2(w)}px;height:${f2(h)}px">
    ${rule(0, 0, w, 4, DOC.gold)}
    ${setIn(18, 30, 8.5, label, { bold: true, color: DOC.muted, track: 1.3 })}
    ${setIn(18, 30 + 18 + valueSize * 0.78, valueSize, value, { bold: true, color: DOC.field })}
    ${note ? setIn(18, 30 + 18 + valueSize * 0.78 + 22, 10, note, { color: DOC.muted }) : ""}${extra}</div>`;
/** Text inside a positioned box (its own left and top). */
const setIn = (
  x,
  base,
  size,
  text,
  { bold = false, color = DOC.prose, track = 0, end = false } = {},
) =>
  `<div class="rc-t" style="${end ? `right:${f2(x)}px` : `left:${f2(x)}px`};top:${f2(base - 0.8465 * size)}px;font-size:${size}px;font-weight:${bold ? 700 : 400};color:${color}${track ? `;letter-spacing:${track}px` : ""}">${text}</div>`;

// ------------------------------------------------------------------ the pages

/** The Financial Analysis's cover: the issuer's, in the colours resolved for no brand colour, its grade beside the address. */
function cover({ P, EMBLEM }) {
  const W0 = A4[0];
  const markH = 58;
  const markW = markH * (679 / 628);
  const photo = P
    ? `<div class="rc-photo" style="left:22px;top:548px;width:551.5px;height:272.25px;background-image:url('${P}')"></div>`
    : `<div class="rc-photo" style="left:22px;top:548px;width:551.5px;height:272.25px;background:#3a4a5e"></div>`;
  const seal = `<div id="rc-cover-seal" style="position:absolute;left:418px;top:388px;width:116px;height:116px">
      <svg class="rc-svg" style="left:0;top:0;width:116px;height:116px" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r="55" fill="none" stroke="${DOC.gold}" stroke-width="1.2"/>
        <circle cx="58" cy="58" r="49" fill="${DOC.gold}" fill-opacity="0.12" stroke="${DOC.gold}" stroke-width="0.6"/>
      </svg>
      <div class="rc-t" style="left:0;right:0;top:${f2(52 - 44 * 0.84)}px;text-align:center;font:700 44px/1 ${SERIF};color:${DOC.gold}">A+</div>
      <div class="rc-t" style="left:0;right:0;top:76px;text-align:center;font:700 7px/1 ${SANS};letter-spacing:1.4px;color:${DOC.ivory}">INVESTMENT</div>
      <div class="rc-t" style="left:0;right:0;top:86px;text-align:center;font:700 7px/1 ${SANS};letter-spacing:1.4px;color:${DOC.ivory}">GRADE</div></div>`;
  return sheet(
    `${photo}
    <div style="position:absolute;left:22px;right:22px;top:548px;height:272.25px;background:linear-gradient(180deg, ${DOC.field} 0%, rgba(37,31,24,0) 34%)"></div>
    <i class="rc-r" style="left:22px;top:22px;width:551.5px;height:798.25px;box-shadow:inset 0 0 0 0.6px ${DOC.gold}"></i>
    <div style="position:absolute;left:${f2((W0 - markW) / 2)}px;top:92px;width:${f2(markW)}px;height:${markH}px;${EMBLEM ? `background:url('${EMBLEM}') center/contain no-repeat` : `border:1px dashed ${DOC.gold}`}"></div>
    ${set(W0 / 2, 196, 30, "AURIXA SYSTEMS", { family: SERIF, color: DOC.gold, track: 3.6, mid: true })}
    ${rule(W0 / 2 - 22, 210, 44, 0.75, DOC.gold)}
    ${set(W0 / 2, 236, 11, "FINANCIAL ANALYSIS", { color: DOC.ivory, track: 3, mid: true, bold: true })}
    ${set(W0 / 2, 256, 8.5, "What it costs to buy and hold, what it returns, and how the position moves over ten years.", { color: "#CBBFA6", mid: true })}
    ${rule(60, 352, 475.5, 0.5, DOC.gold)}
    ${set(60, 382, 8, "PREPARED FOR JORDAN ELLIS", { color: DOC.gold, track: 1.8, bold: true })}
    ${set(60, 432, 34, "14 Wattle Grove", { family: SERIF, color: DOC.ivory, bold: true })}
    ${set(60, 462, 12, "BANKSIA RISE NSW 2155", { color: DOC.gold, track: 2.4, bold: true })}
    ${set(60, 490, 9.5, "House and land · new build · 4 bed · 2 bath · 2 car · 450 m² land", { color: "#CBBFA6" })}
    ${seal}
    ${rule(60, 520, 475.5, 0.5, DOC.gold)}
    <div class="rc-label" style="left:60px;top:527px;width:475.5px;height:15px;background:rgba(217,165,32,.1);color:#E3D9C3;font-size:7px">${ILLUSTRATIVE}</div>`,
    { bg: DOC.field },
  );
}

/** Key figures: the four the client asks about first, as the report's figure tiles, and the grade restated. */
function keyFigures() {
  const T = "Financial Analysis";
  const spark = (() => {
    const xs = GROWTH.map((_, i) => 18 + (i * 196) / 10);
    const lo = 700;
    const hi = 1300;
    const ys = GROWTH.map(([, v]) => 140 - ((v - lo) / (hi - lo)) * 26);
    const d = xs.map((x, i) => `${i ? "L" : "M"}${f2(x)} ${f2(ys[i])}`).join(" ");
    return `<svg class="rc-svg" style="left:0;top:0;width:242px;height:150px" viewBox="0 0 242 150"><path id="rc-kf-spark" d="${d}" pathLength="1" fill="none" stroke="${DOC.gold}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1.001 1.001" stroke-dashoffset="0"/><circle id="rc-kf-spark-end" cx="${f2(xs.at(-1))}" cy="${f2(ys.at(-1))}" r="3.4" fill="${DOC.gold}"/></svg>`;
  })();
  const yieldBar = `<div style="position:absolute;left:18px;top:122px;width:206px;height:8px;background:${DOC.hair};border-radius:4px"></div>
    <div id="rc-kf-yield" style="position:absolute;left:18px;top:122px;width:${f2((206 * YIELD) / 0.06)}px;height:8px;background:${DOC.gold};border-radius:4px;transform-origin:0 50%"></div>
    ${setIn(18, 145, 8, "0%", { color: DOC.muted })}${setIn(18, 145, 8, "6%", { color: DOC.muted, end: true })}`;
  // The price as it is paid: the deposit and the loan, on one bar.
  const deposit = PRICE - LOAN;
  const split = `<div id="rc-kf-dep" style="position:absolute;left:18px;top:114px;width:${f2((206 * deposit) / PRICE)}px;height:10px;background:${DOC.gold};border-radius:5px 0 0 5px;transform-origin:0 50%"></div>
    <div id="rc-kf-loan" style="position:absolute;left:${f2(18 + (206 * deposit) / PRICE + 2)}px;top:114px;width:${f2((206 * LOAN) / PRICE - 2)}px;height:10px;background:${DOC.field};opacity:.86;border-radius:0 5px 5px 0;transform-origin:0 50%"></div>
    ${setIn(18, 140, 8.5, `<b style="color:${DOC.goldInk}">DEPOSIT</b> ${short(deposit)}`, { color: DOC.muted, track: 0.4 })}${setIn(18, 140, 8.5, `<b style="color:${DOC.field}">LOAN</b> ${short(LOAN)}`, { color: DOC.muted, track: 0.4, end: true })}`;
  // The rent against the comparable leases the Compass read: their range, and this rent inside it.
  const [cLo, cHi] = [800, 890];
  const at = 18 + (206 * (RENT - cLo)) / (cHi - cLo);
  const range = `<div style="position:absolute;left:18px;top:118px;width:206px;height:3px;background:${DOC.hair};border-radius:1.5px"></div>
    <div id="rc-kf-rent" style="position:absolute;left:${f2(at - 6)}px;top:113.5px;width:12px;height:12px;border-radius:6px;background:${DOC.gold};box-shadow:0 0 0 2px ${DOC.wash}"></div>
    ${setIn(18, 140, 8.5, `$${cLo}`, { color: DOC.muted })}${setIn(18, 140, 8.5, `$${cHi}`, { color: DOC.muted, end: true })}
    <div class="rc-t" style="left:${f2(at)}px;top:${f2(140 - 0.8465 * 8.5)}px;transform:translateX(-50%);font-size:8.5px;font-weight:700;letter-spacing:.6px;color:${DOC.goldInk}">6 LEASES NEARBY</div>`;
  const facts = [
    ["bed", "4 bed"],
    ["bath", "2 bath"],
    ["car", "2 car"],
    ["land", "450 m² land"],
    ["ruler", "224 m² home"],
  ];
  let fx = 48;
  const factRow = facts
    .map(([ic, t]) => {
      const html = `${icon(ic, fx, 521, 20)}${set(fx + 26, 536, 12, t, { bold: true, color: DOC.field })}`;
      fx += 26 + W(t, 12, true) + 22;
      return html;
    })
    .join("");
  return sheet(
    `${furniture(T, 4)}${opening("1 · Executive summary", "Key figures")}
    <div class="rc-grid" id="rc-kf-tiles">
      ${tile(48, 168, 242, 150, "PURCHASE PRICE", "$1,150,000", "House and land, new build", { id: "rc-kf-0", extra: split })}
      ${tile(305.5, 168, 242, 150, "WEEKLY RENT", "$850", "As supplied · $44,200 a year", { id: "rc-kf-1", extra: range })}
      <div class="rc-tile" id="rc-kf-2" style="left:48px;top:334px;width:242px;height:150px">${rule(0, 0, 242, 4, DOC.gold)}
        ${setIn(18, 30, 8.5, "GROSS YIELD", { bold: true, color: DOC.muted, track: 1.3 })}${setIn(18, 30 + 18 + 34 * 0.78, 34, `${(YIELD * 100).toFixed(1)}%`, { bold: true, color: DOC.field })}
        ${setIn(18, 104, 10, "On the purchase price", { color: DOC.muted })}${yieldBar}</div>
      <div class="rc-tile" id="rc-kf-3" style="left:305.5px;top:334px;width:242px;height:150px">${rule(0, 0, 242, 4, DOC.gold)}
        ${setIn(18, 30, 8.5, "10-YEAR MEDIAN GROWTH", { bold: true, color: DOC.muted, track: 1.3 })}${setIn(18, 30 + 18 + 34 * 0.78, 34, `+${Math.round(TEN_YEAR * 100)}%`, { bold: true, color: DOC.field })}
        ${setIn(18, 104, 10, `Council area · ${(CAGR * 100).toFixed(1)}% a year`, { color: DOC.muted })}${spark}</div>
    </div>
    ${set(48, 510, 8.5, "THE PROPERTY", { color: DOC.goldInk, bold: true, track: 1.6 })}${factRow}
    <div class="rc-band" id="rc-kf-grade" style="left:48px;top:556px;width:499.5px;height:122px">
      ${setIn(22, 28, 8.5, "INVESTMENT GRADE · FROM THE COMPASS", { bold: true, color: DOC.gold, track: 1.6 })}
      <div class="rc-t" style="left:20px;top:${f2(90 - 64 * 0.84)}px;font:700 64px/1 ${SERIF};color:${DOC.gold}">A+</div>
      ${setIn(132, 63, 15, "STRONG BUY", { bold: true, color: DOC.ivory, track: 1.2 })}
      ${setIn(132, 85, 10.5, "Excellent investment opportunity with strong", { color: "#E3D9C3" })}
      ${setIn(132, 100, 10.5, "fundamentals across all metrics.", { color: "#E3D9C3" })}
      ${setIn(22, 85, 30, "84", { bold: true, color: DOC.ivory, end: true })}${setIn(22, 101, 8, "COMPOSITE /100", { color: "#CBBFA6", end: true, track: 1 })}</div>
    ${rule(48, 700, 499.5, 0.5, DOC.hair)}
    ${set(48, 720, 8.5, "The grade is the Compass's, restated: an assessment of the evidence the report holds, not permission to proceed.", { color: DOC.muted })}`,
  );
}

/** Capital growth: the council area's median house price over ten years, as the publisher's series records it. */
let GROWTH_ALONG = null;
function capitalGrowth() {
  const T = "Financial Analysis";
  const X0 = 66;
  const X1 = 532;
  const Y0 = 384;
  const Y1 = 616;
  const lo = 600;
  const hi = 1300;
  const x = (i) => X0 + ((X1 - X0) * i) / (GROWTH.length - 1);
  const y = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
  const pts = GROWTH.map(([, v], i) => [x(i), y(v)]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${f2(px)} ${f2(py)}`).join(" ");
  const area = `${line} L${f2(X1)} ${Y1} L${X0} ${Y1} Z`;
  // How far along the line each year's point is (0 to 1), for the frame that draws it.
  const lengths = pts.map((p, i) =>
    i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0,
  );
  const length = lengths.reduce((a, b) => a + b, 0);
  let run = 0;
  GROWTH_ALONG = lengths.map((l) => (run += l) / length);
  const grid = [600, 800, 1000, 1200]
    .map(
      (v) =>
        `<line x1="${X0}" x2="${X1}" y1="${f2(y(v))}" y2="${f2(y(v))}" stroke="${DOC.hair}" stroke-width="0.7"/><text x="${X0 - 9}" y="${f2(y(v) + 4)}" text-anchor="end" font-size="11" fill="${DOC.muted}">$${(v / 1000).toFixed(1)}m</text>`,
    )
    .join("");
  const years = GROWTH.map(
    ([yr], i) =>
      `<text x="${f2(x(i))}" y="${Y1 + 20}" text-anchor="middle" font-size="11" fill="${DOC.muted}"${i % 2 ? ' opacity="0"' : ""}>${yr}</text>`,
  ).join("");
  const dots = pts
    .map(
      ([px, py], i) =>
        `<circle class="rc-cg-dot" id="rc-cg-dot-${i}" cx="${f2(px)}" cy="${f2(py)}" r="${i === pts.length - 1 ? 5 : 3.2}" fill="${i === pts.length - 1 ? DOC.gold : "#fff"}" stroke="${DOC.gold}" stroke-width="2"/>`,
    )
    .join("");
  const [lx, ly] = pts.at(-1);
  const pill = `<div class="rc-pill" id="rc-cg-pill" style="left:${f2(lx - 100)}px;top:${f2(ly - 40)}px">2026 · $1.25m</div>`;
  return sheet(
    `${furniture(T, 11)}${opening("4 · How the position moves", "Capital growth")}
    ${set(48, 214, 52, `+${Math.round(TEN_YEAR * 100)}%`, { bold: true, color: DOC.goldInk, id: "rc-cg-hero" })}
    ${set(48 + W(`+${Math.round(TEN_YEAR * 100)}%`, 52, true) + 16, 190, 13, "the council area's median house price", { bold: true, color: DOC.field })}
    ${set(48 + W(`+${Math.round(TEN_YEAR * 100)}%`, 52, true) + 16, 210, 13, `in ten years: ${(CAGR * 100).toFixed(1)}% a year, compound`, { color: DOC.prose })}
    <div class="rc-grid">
      ${tile(48, 238, 158, 82, "2016 MEDIAN", "$760k", null, { valueSize: 22 })}
      ${tile(218.75, 238, 158, 82, "2026 MEDIAN", "$1.25m", null, { valueSize: 22 })}
      ${tile(389.5, 238, 158, 82, "TEN-YEAR CHANGE", `+$${GROWTH.at(-1)[1] - GROWTH[0][1]}k`, null, { valueSize: 22 })}
    </div>
    ${set(48, 352, 9, "MEDIAN HOUSE PRICE · COUNCIL AREA · YEAR TO JUNE", { color: DOC.muted, bold: true, track: 1.2 })}
    <svg class="rc-svg" style="left:0;top:0;width:595.5px;height:842.25px;font-family:${SANS}" viewBox="0 0 595.5 842.25">
      ${grid}${years}
      <path id="rc-cg-area" d="${area}" fill="${DOC.gold}" fill-opacity="0.13"/>
      <path id="rc-cg-line" d="${line}" pathLength="1" fill="none" stroke="${DOC.gold}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1.001 1.001" stroke-dashoffset="0"/>
      ${dots}
    </svg>${pill}
    ${set(48, 676, 8.5, "Source: the publisher's quarterly median sale price series for the council area, as the record holds it.", { color: DOC.muted })}`,
  );
}

/** The 10-year cash flow's value, debt and equity: each year's value as a column, the loan beneath, the equity above it. */
function cashFlow() {
  const T = "Financial Analysis";
  const X0 = 74;
  const X1 = 536;
  const BASE = 616;
  const TOP = 388;
  const max = 2000000;
  const yOf = (v) => BASE - (v / max) * (BASE - TOP);
  const n = POSITION.length;
  const slot = (X1 - X0) / n;
  const colW = slot * 0.62;
  const grid = [0, 500000, 1000000, 1500000, 2000000]
    .map(
      (v) =>
        `<line x1="${X0}" x2="${X1}" y1="${f2(yOf(v))}" y2="${f2(yOf(v))}" stroke="${v ? DOC.hair : DOC.field}" stroke-width="${v ? 0.7 : 1}"/><text x="${X0 - 9}" y="${f2(yOf(v) + 4)}" text-anchor="end" font-size="10.5" fill="${DOC.muted}">${v ? `$${(v / 1e6).toFixed(1)}m` : "$0"}</text>`,
    )
    .join("");
  const cols = POSITION.map((p, i) => {
    const cx = X0 + slot * i + (slot - colW) / 2;
    const loanTop = yOf(p.loan);
    const valueTop = yOf(p.value);
    const label = short(p.equity);
    return `<g class="rc-cf-col" id="rc-cf-col-${i}" style="transform-origin:${f2(cx + colW / 2)}px ${BASE}px">
        <rect x="${f2(cx)}" y="${f2(loanTop)}" width="${f2(colW)}" height="${f2(BASE - loanTop)}" fill="${DOC.field}" fill-opacity="0.86"/>
        <rect x="${f2(cx)}" y="${f2(valueTop)}" width="${f2(colW)}" height="${f2(loanTop - valueTop)}" fill="${DOC.gold}"/>
      </g><text id="rc-cf-lab-${i}" x="${f2(cx + colW / 2)}" y="${f2(valueTop - 7)}" text-anchor="middle" font-size="${i === n - 1 ? 12 : 9.5}" font-weight="700" fill="${i === n - 1 ? DOC.goldInk : DOC.field}">${label}</text>
      <text x="${f2(cx + colW / 2)}" y="${BASE + 18}" text-anchor="middle" font-size="10.5" fill="${DOC.muted}">${i === 0 ? "Now" : `Y${i}`}</text>`;
  }).join("");
  const last = POSITION.at(-1);
  return sheet(
    `${furniture(T, 17)}${opening("9 · Ten years", "10-year cash flow")}
    ${set(48, 176, 9, "EQUITY IN YEAR 10", { color: DOC.muted, bold: true, track: 1.4 })}
    ${set(48, 226, 52, short(last.equity), { bold: true, color: DOC.goldInk, id: "rc-cf-hero" })}
    ${set(48 + W(short(last.equity), 52, true) + 18, 202, 13, `from ${short(POSITION[0].equity)} at settlement`, { bold: true, color: DOC.field })}
    ${set(48 + W(short(last.equity), 52, true) + 18, 222, 13, `value ${short(last.value)} · loan ${short(last.loan)}`, { color: DOC.prose })}
    <div class="rc-key" style="left:48px;top:346px"><i style="background:${DOC.gold}"></i>Equity<i style="background:${DOC.field};opacity:.86;margin-left:16px"></i>Loan</div>
    ${set(547.5, 357, 9, "VALUE, DEBT AND EQUITY", { color: DOC.muted, bold: true, track: 1.2, end: true })}
    <svg class="rc-svg" style="left:0;top:0;width:595.5px;height:842.25px;font-family:${SANS}" viewBox="0 0 595.5 842.25">${grid}${cols}</svg>
    <div class="rc-grid">
      ${tile(48, 246, 158, 82, "DEPOSIT", "$230k", null, { valueSize: 22 })}
      ${tile(218.75, 246, 158, 82, "LOAN · 6.1% P&amp;I", "$920k", null, { valueSize: 22 })}
      ${tile(389.5, 246, 158, 82, "VALUE GROWTH", "5.0% a year", null, { valueSize: 22 })}
    </div>
    ${set(48, 676, 8.5, "Modelled: the loan repaid principal and interest over 30 years; the value at 5.0% a year, under the council area's 5.1% of the last ten.", { color: DOC.muted })}`,
  );
}

/** How this grade was reached: the gauge, the five dimensions as bars on one baseline, the composite. */
const GRADE_ROW0 = 390; // the first dimension's row
const GRADE_ROWH = 46; // and the step between rows
function grade() {
  const T = "Investment Compass";
  const cx = 168;
  const cy = 296;
  const r = 104;
  const arc = (from, to) => {
    const a0 = Math.PI + from * Math.PI;
    const a1 = Math.PI + to * Math.PI;
    return `M ${f2(cx + r * Math.cos(a0))} ${f2(cy + r * Math.sin(a0))} A ${r} ${r} 0 0 1 ${f2(cx + r * Math.cos(a1))} ${f2(cy + r * Math.sin(a1))}`;
  };
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI + (i / 10) * Math.PI;
    return `<line x1="${f2(cx + (r - 17) * Math.cos(a))}" y1="${f2(cy + (r - 17) * Math.sin(a))}" x2="${f2(cx + (r - 13) * Math.cos(a))}" y2="${f2(cy + (r - 13) * Math.sin(a))}" stroke="${DOC.hair}" stroke-width="${i % 5 ? 0.8 : 1.6}"/>`;
  }).join("");
  const gauge = `<svg class="rc-svg" style="left:0;top:0;width:595.5px;height:842.25px;font-family:${SANS}" viewBox="0 0 595.5 842.25">
      <defs><linearGradient id="rc-g-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${DOC.goldInk}"/><stop offset="1" stop-color="${DOC.gold}"/></linearGradient></defs>
      <path d="${arc(0, 0.99999)}" stroke="${DOC.wash}" stroke-width="22" fill="none" stroke-linecap="round"/>
      <path d="${arc(0, 0.99999)}" stroke="${DOC.hair}" stroke-width="22" fill="none" stroke-linecap="round" stroke-opacity="0.55"/>
      <path id="rc-g-arc" d="${arc(0, 0.99999)}" pathLength="1" stroke="url(#rc-g-grad)" stroke-width="22" fill="none" stroke-linecap="round" stroke-dasharray="1.001 1.001" stroke-dashoffset="${f2(1.001 * (1 - COMPOSITE / 100))}"/>
      ${ticks}
    </svg>
    <div class="rc-t" id="rc-g-num" style="left:${cx - 80}px;width:160px;top:${f2(cy - 18 - 52 * 0.84)}px;text-align:center;font:700 52px/1 ${SANS};color:${DOC.field}">84</div>
    ${set(cx, cy + 10, 9, "/100 · STRONG", { color: DOC.muted, bold: true, track: 1.6, mid: true })}
    ${rule(cx - 36, cy + 20, 72, 3, DOC.positive, ";border-radius:1.5px")}
    ${set(cx - r - 11, cy + 30, 9, "0", { color: DOC.muted, mid: true })}${set(cx + r + 11, cy + 30, 9, "100", { color: DOC.muted, mid: true })}`;
  const verdict = `${set(318, 190, 8.5, "INVESTMENT GRADE", { color: DOC.muted, bold: true, track: 1.6 })}
    <div class="rc-t" style="left:314px;top:${f2(268 - 84 * 0.84)}px;font:700 84px/1 ${SERIF};color:${DOC.goldInk}">A+</div>
    ${set(318, 298, 16, "STRONG BUY", { bold: true, color: DOC.field, track: 1 })}
    ${set(318, 318, 10, "Excellent investment opportunity", { color: DOC.prose })}${set(318, 332, 10, "with strong fundamentals across", { color: DOC.prose })}${set(318, 346, 10, "all metrics.", { color: DOC.prose })}`;
  const BX0 = 196;
  const BX1 = 470;
  const rows = DIMENSIONS.map(([name, score, weight], i) => {
    const top = GRADE_ROW0 + i * GRADE_ROWH;
    const w = ((BX1 - BX0) * score) / 100;
    return `${set(48, top + 16, 13, name, { bold: true, color: DOC.field })}${set(48, top + 31, 8.5, `${weight}% WEIGHT`, { color: DOC.muted, track: 1 })}
      ${rule(BX0, top + 5, BX1 - BX0, 16, DOC.wash, `;box-shadow:inset 0 0 0 0.6px ${DOC.hair}`)}
      <i class="rc-r rc-g-bar" id="rc-g-bar-${i}" style="left:${BX0}px;top:${top + 5}px;width:${f2(w)}px;height:16px;background:${DOC.gold};transform-origin:0 50%"></i>
      ${set(BX0 + w + 8, top + 19, 14, String(score), { bold: true, color: DOC.field, id: `rc-g-score-${i}` })}
      ${set(547.5, top + 19, 13, ((score * weight) / 100).toFixed(2), { color: DOC.goldInk, end: true, bold: true, id: `rc-g-part-${i}` })}`;
  }).join("");
  const totalTop = GRADE_ROW0 + DIMENSIONS.length * GRADE_ROWH + 6;
  const composite = `${rule(48, totalTop, 499.5, 1.5, DOC.gold)}
    ${set(48, totalTop + 34, 14, "Composite", { bold: true, color: DOC.field })}
    ${set(48, totalTop + 50, 8.5, `${COMPOSITE.toFixed(2)}, ROUNDED ONCE`, { color: DOC.muted, track: 1 })}
    ${set(547.5, totalTop + 40, 34, "84", { bold: true, color: DOC.field, end: true, id: "rc-g-composite" })}
    <i class="rc-r" id="rc-g-mark" style="left:${f2(547.5 - W("84", 34, true))}px;top:${totalTop + 47}px;width:${f2(W("84", 34, true))}px;height:2px;background:${DOC.gold};transform-origin:0 50%"></i>
    ${set(547.5 - W("84", 34, true) - 12, totalTop + 40, 12, "→", { color: DOC.muted, end: true })}`;
  return sheet(
    `${furniture(T, 3)}${opening("1 · The assessment", "How this grade was reached")}
    ${gauge}${verdict}
    ${set(48, 372, 9, "FIVE DIMENSIONS · SCORE OUT OF 100", { color: DOC.muted, bold: true, track: 1.2 })}${set(547.5, 372, 9, "CONTRIBUTION", { color: DOC.muted, bold: true, track: 1.2, end: true })}
    ${rows}${composite}
    ${set(48, 718, 9, "Assessed on all 5 dimensions, carrying the whole of the method's original weight.", { color: DOC.muted })}`,
  );
}
/** Where the marker settles on the grade page: under the composite, 84 (sheet points). */
const GRADE_MARK = (() => {
  const totalTop = GRADE_ROW0 + DIMENSIONS.length * GRADE_ROWH + 6;
  return { x: 547.5 - W("84", 34, true), y: totalTop + 47, width: W("84", 34, true) };
})();

/** The suburb at a glance: six figures, each with its icon. */
let REACH_ALONG = null;
function suburb() {
  const T = "Investment Compass";
  const cells = [
    ["house", "MEDIAN HOUSE PRICE", "$1.25m", "Council area, year to June 2026"],
    ["trend", "12-MONTH GROWTH", "+5.2%", "Houses, the council area"],
    ["clock", "DAYS ON MARKET", "24", "Median, houses sold this year"],
    ["key", "OWNER-OCCUPIERS", "78%", null],
    ["people", "FAMILIES WITH CHILDREN", "54%", "Of households, 2021 Census"],
    ["door", "RENTAL VACANCY", "1.4%", "The area's own rate"],
  ];
  const html = cells
    .map(([ic, label, value, note], i) => {
      const x = i % 2 ? 305.5 : 48;
      const y = 166 + Math.floor(i / 2) * 136;
      const owners =
        label === "OWNER-OCCUPIERS"
          ? `<div style="position:absolute;left:18px;top:90px;display:flex;gap:4px">${Array.from(
              { length: 10 },
              (_, k) =>
                `<svg class="rc-svg rc-sb-home" style="position:relative;width:17px;height:17px;color:${k < 8 ? DOC.gold : DOC.hair}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 11h3v10h5v-6h4v6h5V11h3z"/></svg>`,
            ).join("")}</div>`
          : "";
      return `<div class="rc-tile" id="rc-sb-${i}" style="left:${x}px;top:${y}px;width:242px;height:124px">${rule(0, 0, 242, 4, DOC.gold)}
        ${icon(ic, 196, 16, 28)}
        ${setIn(18, 30, 8.5, label, { bold: true, color: DOC.muted, track: 1.2 })}
        ${setIn(18, 80, 40, value, { bold: true, color: DOC.field })}
        ${note ? setIn(18, 102, 10, note, { color: DOC.muted }) : ""}${owners}</div>`;
    })
    .join("");
  // What is within reach of the lot, on one line from it: the nearest of each, by road.
  const LINE = 670;
  const reach = [
    ["school", "Primary school", 0.6],
    ["bag", "Shopping centre", 1.2],
    ["train", "Train station", 1.8],
    ["school", "High school", 2.3],
  ];
  const xAt = (km) => 70 + (km / 2.5) * 462;
  REACH_ALONG = reach.map(([, , km]) => km / reach.at(-1)[2]);
  const stops = reach
    .map(
      ([ic, name, km], i) => `${icon(ic, xAt(km) - 12, LINE - 44, 24)}
      <i class="rc-r rc-sb-stop" id="rc-sb-stop-${i}" style="left:${f2(xAt(km) - 6)}px;top:${LINE - 6}px;width:12px;height:12px;border-radius:6px;background:#fff;box-shadow:inset 0 0 0 2.5px ${DOC.gold}"></i>
      ${set(xAt(km), LINE + 30, 14, `${km} km`, { bold: true, color: DOC.field, mid: true })}
      ${set(xAt(km), LINE + 45, 9, name, { color: DOC.muted, mid: true })}`,
    )
    .join("");
  const within = `${set(48, 600, 9, "WITHIN REACH · NEAREST, BY ROAD FROM THE LOT", { color: DOC.muted, bold: true, track: 1.2 })}
    ${rule(70, LINE - 1.5, xAt(reach.at(-1)[2]) - 70, 3, DOC.hair, ";border-radius:1.5px")}
    <i class="rc-r" id="rc-sb-reach" style="left:70px;top:${LINE - 1.5}px;width:${f2(xAt(reach.at(-1)[2]) - 70)}px;height:3px;background:${DOC.gold};border-radius:1.5px;transform-origin:0 50%"></i>
    <div style="position:absolute;left:52px;top:${LINE - 18}px;width:36px;height:36px;border-radius:18px;background:${DOC.field};box-shadow:0 0 0 3px #fff"></div>
    ${icon("house", 61, LINE - 9, 18, DOC.gold, 2.2)}
    ${set(70, LINE + 38, 9, "THE LOT", { color: DOC.goldInk, bold: true, mid: true, track: 1 })}
    ${stops}`;
  return sheet(
    `${furniture(T, 6)}${opening("2 · Property & locality snapshot", "Banksia Rise at a glance")}
    <div class="rc-grid">${html}</div>
    ${within}
    ${rule(48, 740, 499.5, 0.5, DOC.hair)}
    ${set(48, 762, 8.5, "Market figures are the council area's, from its publisher's series; the households are the 2021 Census's.", { color: DOC.muted })}`,
  );
}

/** Rental comparables: the rent as supplied against six recent leases nearby, on one scale. */
function comparables() {
  const T = "Investment Compass";
  const rows = [
    ["4-bed house · 1.4 km · leased Sep 2026", 890],
    ["4-bed house · 0.9 km · leased Aug 2026", 875],
    ["4-bed house · 1.8 km · leased Sep 2026", 860],
    ["14 Wattle Grove · as supplied", 850, true],
    ["4-bed house · 0.6 km · leased Jul 2026", 840],
    ["4-bed house · 2.0 km · leased Aug 2026", 820],
    ["4-bed house · 1.1 km · leased Sep 2026", 800],
  ];
  const X0 = 48;
  const X1 = 547.5;
  const lo = 700;
  const hi = 950;
  const xOf = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const html = rows
    .map(([label, v, own], i) => {
      const top = 262 + i * 64;
      const w = xOf(v) - X0;
      return `${set(X0, top + 14, 11, label, { bold: !!own, color: own ? DOC.goldInk : DOC.prose })}
        <i class="rc-r rc-cp-bar" id="rc-cp-bar-${i}" style="left:${X0}px;top:${top + 22}px;width:${f2(w)}px;height:22px;background:${own ? DOC.gold : DOC.field};${own ? "" : "opacity:.82;"}transform-origin:0 50%"></i>
        ${set(X0 + w + 5, top + 39, own ? 17 : 14, `$${v}`, { bold: true, color: own ? DOC.goldInk : DOC.field, style: "background:#fff;padding:0 4px", id: `rc-cp-val-${i}` })}`;
    })
    .join("");
  const median = xOf(850);
  return sheet(
    `${furniture(T, 14)}${opening("10 · Market positioning", "Rental comparables")}
    ${set(48, 212, 46, "$850", { bold: true, color: DOC.goldInk })}${set(48 + W("$850", 46, true) + 14, 190, 13, "a week, at the median of six", { bold: true, color: DOC.field })}${set(48 + W("$850", 46, true) + 14, 210, 13, "comparable leases within 2 km", { color: DOC.prose })}
    ${set(48, 246, 9, "4-BEDROOM HOUSES · WEEKLY RENT", { color: DOC.muted, bold: true, track: 1.2 })}
    <i class="rc-r" style="left:${f2(median - 0.6)}px;top:252px;width:1.2px;height:${7 * 64 + 4}px;background-image:linear-gradient(${DOC.goldInk} 50%, transparent 0);background-size:1.2px 6px"></i>
    ${set(median, 252 + 7 * 64 + 22, 9, "MEDIAN $850", { color: DOC.goldInk, bold: true, track: 1.2, mid: true })}
    ${html}
    ${set(48, 760, 8.5, "Leases recorded for the area in the last 90 days, matched on bedrooms and dwelling type.", { color: DOC.muted })}`,
  );
}

/** The risk dashboard: each risk as a level and its evidence, nothing in prose. */
let RISK_METERS = null;
function risk() {
  const T = "Investment Compass";
  const LEVEL = {
    "Not mapped": [DOC.positive, 1],
    Low: [DOC.positive, 1],
    Moderate: [DOC.caution, 2],
    High: [DOC.negative, 3],
  };
  const rows = [
    ["Flood", "Not mapped", "Verified", "Flood planning map, read at the lot"],
    ["Bushfire", "Not mapped", "Verified", "Bush fire prone land map"],
    ["Planning", "Low", "Verified", "Low density residential, no overlays"],
    ["Vacancy", "Low", "Measured", "1.4%, the area's own rate"],
    ["Market supply", "Moderate", "Watch", "New estates releasing nearby"],
    ["Interest rates", "Moderate", "Modelled", "Repayments tested at +2%"],
    ["Construction", "Moderate", "Watch", "New build: staged payments, warranty"],
  ];
  RISK_METERS = rows.map(([, level]) => LEVEL[level][1]);
  const html = rows
    .map(([name, level, chip, fact], i) => {
      const top = 190 + i * 80;
      const [color, n] = LEVEL[level];
      const meter = [0, 1, 2]
        .map(
          (k) =>
            `<i class="rc-r rc-rk-seg" id="rc-rk-${i}-${k}" style="left:${210 + k * 30}px;top:${top + 12}px;width:26px;height:9px;border-radius:2px;background:${k < n ? color : DOC.hair};transform-origin:0 50%"></i>`,
        )
        .join("");
      return `${i % 2 ? "" : rule(40, top - 14, 515.5, 80, DOC.stripe)}
        ${set(48, top + 22, 15, name, { bold: true, color: DOC.field })}
        ${meter}${set(310, top + 22, 15, level, { bold: true, color })}
        <div class="rc-chip" style="right:48px;top:${top + 6}px">${chip.toUpperCase()}</div>
        ${set(48, top + 44, 10.5, fact, { color: DOC.muted })}`;
    })
    .join("");
  return sheet(
    `${furniture(T, 15)}${opening("13 · Risk dashboard", "Risk Dashboard")}
    <div class="rc-key" style="right:48px;top:101px">${["Low", "Moderate", "High"].map((l) => `<i style="background:${LEVEL[l][0]}"></i>${l}`).join('<span style="width:10px;display:inline-block"></span>')}</div>
    ${html}
    ${set(48, 770, 8.5, "Hazards are read at the lot from the state's planning maps; the market and finance risks are measured or modelled.", { color: DOC.muted })}`,
  );
}

const CSS = `
.rc { position:absolute; left:0; top:0; width:${A4[0]}px; height:${A4[1]}px; overflow:hidden; color:${DOC.prose};
  font-family:${SANS}; font-kerning:none; text-rendering:geometricPrecision; transform-origin:0 0; }
.rc-t { position:absolute; white-space:nowrap; line-height:1; }
.rc-r { position:absolute; display:block; }
.rc-svg { position:absolute; overflow:visible; }
.rc-label { position:absolute; display:flex; align-items:center; justify-content:center; white-space:nowrap; background:${DOC.wash};
  box-shadow:inset 0 0 0 0.6px ${DOC.gold}; font-size:7.5px; line-height:1; color:${DOC.goldInk}; }
.rc-photo { position:absolute; background:#2a3b52 center 46%/cover no-repeat; }
.rc-tile { position:absolute; background:${DOC.wash}; box-shadow:inset 0 0 0 1.2px ${DOC.gold}; }
.rc-band { position:absolute; background:${DOC.field}; box-shadow:inset 0 0 0 0.8px ${DOC.gold}; }
.rc-pill { position:absolute; width:92px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:12px;
  background:${DOC.field}; color:${DOC.ivory}; font-size:11px; font-weight:700; letter-spacing:.3px; white-space:nowrap; }
.rc-key { position:absolute; display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; color:${DOC.muted}; letter-spacing:.6px; }
.rc-key i { display:inline-block; width:12px; height:12px; border-radius:2px; }
.rc-chip { position:absolute; height:18px; padding:0 9px; display:flex; align-items:center; border-radius:9px; font-size:8px; font-weight:700;
  letter-spacing:1px; color:${DOC.goldInk}; background:${DOC.wash}; box-shadow:inset 0 0 0 0.8px ${DOC.gold}; white-space:nowrap; }
`;

/**
 * The pages: each { html, doc, page, title } at 595.5 x 842.25 CSS px. `P` and `EMBLEM` are the asset URLs
 * (frames.cjs's asset()); without them the photograph and the mark are drawn as placeholders.
 */
module.exports = function reportCharts({ P = null, EMBLEM = null } = {}) {
  return {
    A4,
    DOC,
    CSS,
    ILLUSTRATIVE,
    GRADE_MARK,
    figures: {
      PRICE,
      RENT,
      YIELD,
      POSITION,
      GROWTH,
      TEN_YEAR,
      CAGR,
      DIMENSIONS,
      COMPOSITE,
      VERDICT,
    },
    get growthAlong() {
      return GROWTH_ALONG;
    },
    get reachAlong() {
      return REACH_ALONG;
    },
    get riskMeters() {
      return RISK_METERS;
    },
    pages: {
      cover: { html: cover({ P, EMBLEM }), doc: "Financial Analysis", page: 1, title: "Cover" },
      keyFigures: { html: keyFigures(), doc: "Financial Analysis", page: 4, title: "Key figures" },
      growth: {
        html: capitalGrowth(),
        doc: "Financial Analysis",
        page: 11,
        title: "Capital growth",
      },
      cashFlow: {
        html: cashFlow(),
        doc: "Financial Analysis",
        page: 17,
        title: "10-year cash flow",
      },
      grade: {
        html: grade(),
        doc: "Investment Compass",
        page: 3,
        title: "How this grade was reached",
      },
      suburb: {
        html: suburb(),
        doc: "Investment Compass",
        page: 6,
        title: "Banksia Rise at a glance",
      },
      comparables: {
        html: comparables(),
        doc: "Investment Compass",
        page: 14,
        title: "Rental comparables",
      },
      risk: { html: risk(), doc: "Investment Compass", page: 15, title: "Risk Dashboard" },
    },
  };
};
