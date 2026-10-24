// G-FACTFIND (Reel 3, block 04): the client's fact find landing in the import, its count tiles ticking, its figures
// flying into the client card.
//  - The workbook is the product's own white-label Client Fact Find, as factfind.py filled it in for Jordan Ellis and
//    as the screens harness imported it: its Client Fact Find sheet, rows 1 to 19 (the title, the setup sheet's
//    organisation and document title, Applicant 1's personal details and current address), set from the file's own
//    cells with each cell's own font, fill, border and number format. The cells are held here (WORKBOOK) so the film
//    draws the same on any machine; `verifyWorkbook` reads the file again with openpyxl wherever it is to hand and
//    refuses a difference. Nothing is typed in: a cell the file leaves empty is drawn empty.
//    Two liberties, both of layout and neither of content: the view is Applicant 1's half of the sheet (columns A to
//    E; Applicant 2's half is empty for a single applicant), so the title and the organisation line, merged across
//    A to J in the file, are centred over the half that shows; and Century Gothic, which the machine lacks, is drawn
//    in Inter Display, as a spreadsheet application substitutes a missing face.
//  - The import's seven count tiles are the product's own pixels (the clients-add-parsed capture), lifted out of the
//    file card and laid out large; each value counts up in the product's own type (its system face, Inter on this
//    machine: text-lg, bold, tabular figures), over a patch of the tile's own background, measured.
//  - The figures that fly into the card are the workbook's cells (FIGURES), each with the label the sheet gives it
//    and formatted by the cell's own number format.
//  - A screen in a glass window whose DEMO WORKSPACE bar stays pinned to the window's top while the camera moves over
//    the page under it (kit3's bar), so the label is on screen however far in the camera goes.
// Nothing here times anything: ./scenes/factfind.cjs passes the times, from the brief's beats.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const M = require("./motion.cjs");
const K3 = require("./kit3.cjs");

const { lerp, r3, px, fade, clamp01, EASE } = M;

// ------------------------------------------------------------------ the workbook's cells
/** The workbook: its file name, its sheets, and its Client Fact Find sheet's columns A to E and rows 1 to 19. */
const WORKBOOK = {
  file: "Jordan Ellis - Client Fact Find.xlsx",
  sheets: ["White Label Setup", "Client Fact Find", "Living Expenses", "Client Form Output"],
  active: "Client Fact Find",
  /** Column widths in Excel's characters (E is the sheet's default, 10). */
  widths: [14, 24, 17, 15, 10],
  /** Each row: its number, its height in points and its cells: [style, column, rows, columns shown, text]. */
  rows: [
    [1, 26, [["title", 1, 2, 5, "CLIENT FACT FIND"]]],
    [2, 18, []],
    [
      3,
      20,
      [["org", 1, 1, 5, "Aurixa Systems · Property | Client Financial Position & Fact Find"]],
    ],
    [4, 14.5, []],
    [5, 22, [["section", 1, 1, 5, "APPLICANT 1 - PERSONAL DETAILS"]]],
    [
      6,
      20,
      [
        ["label", 1, 1, 2, "Title"],
        ["value", 3, 1, 3, ""],
      ],
    ],
    [
      7,
      20,
      [
        ["label", 1, 1, 2, "First Name"],
        ["value", 3, 1, 3, "Jordan"],
      ],
    ],
    [
      8,
      20,
      [
        ["label", 1, 1, 2, "Middle Name"],
        ["value", 3, 1, 3, ""],
      ],
    ],
    [
      9,
      20,
      [
        ["label", 1, 1, 2, "Surname"],
        ["value", 3, 1, 3, "Ellis"],
      ],
    ],
    [
      10,
      20,
      [
        ["label", 1, 1, 2, "Date of Birth"],
        ["value", 3, 1, 3, "14/05/1989"],
      ],
    ],
    [
      11,
      20,
      [
        ["label", 1, 1, 2, "Gender"],
        ["value", 3, 1, 3, ""],
      ],
    ],
    [
      12,
      20,
      [
        ["label", 1, 1, 2, "Marital Status"],
        ["value", 3, 1, 3, "Single"],
      ],
    ],
    [
      13,
      20,
      [
        ["label", 1, 1, 2, "Residency Status"],
        ["value", 3, 1, 3, "Australian Citizen"],
      ],
    ],
    [
      14,
      20,
      [
        ["label", 1, 1, 2, "Number of Dependants"],
        ["value", 3, 1, 3, "0"],
      ],
    ],
    [
      15,
      20,
      [
        ["label", 1, 1, 2, "Mobile"],
        ["value", 3, 1, 3, ""],
      ],
    ],
    [
      16,
      20,
      [
        ["label", 1, 1, 2, "Email"],
        ["value", 3, 1, 3, ""],
      ],
    ],
    [17, 14.5, []],
    [18, 22, [["section", 1, 1, 5, "APPLICANT 1 - ADDRESS HISTORY"]]],
    [
      19,
      20,
      [
        ["label", 1, 1, 2, "Current Address"],
        ["value", 3, 1, 3, "7/22 Banksia Parade, Banksia Rise NSW 2155"],
      ],
    ],
  ],
};
/**
 * The figures that fly into the record (04.2), each as the workbook holds it: the sheet's own label, the cell's
 * value in the cell's own number format, and where it is. The living expenses' total is the sheet's own SUM.
 */
const FIGURES = [
  { label: "Base Salary (Annual)", value: "$300,000", from: "Client Fact Find!C32" },
  { label: "Car loan", value: "$18,000", from: "Client Fact Find!F53 (Current Balance)" },
  { label: "Credit card", value: "$1,200", from: "Client Fact Find!F54 (Current Balance)" },
  { label: "Rent", value: "$2,817.00", from: "Living Expenses!C31 (Monthly Amount)" },
  {
    label: "TOTAL MONTHLY LIVING EXPENSES",
    value: "$6,447.00",
    from: "Living Expenses!C55 (=SUM(C5:C54))",
  },
];
/** Each style as the file sets it (font, size in points, weight, colour, fill, alignment, indent, border). */
const STYLES = {
  title: {
    face: "gothic",
    pt: 20,
    bold: true,
    color: "#FFFFFF",
    fill: "#12345B",
    align: "center",
    border: "#C9A227",
  },
  org: { face: "gothic", pt: 10.5, bold: true, color: "#12345B", fill: "#C9A227", align: "center" },
  section: {
    face: "gothic",
    pt: 12,
    bold: true,
    color: "#FFFFFF",
    fill: "#12345B",
    align: "left",
    indent: 1,
  },
  label: {
    face: "calibri",
    pt: 10.5,
    bold: true,
    color: "#12345B",
    fill: "#F3F6FA",
    indent: 1,
    border: "#D9E1EC",
  },
  value: {
    face: "calibri",
    pt: 11,
    bold: false,
    color: "#1F2937",
    fill: "#FFFBEA",
    indent: 1,
    box: "#E6DBB4",
  },
};

/** The file the screens harness imported (captures/20-clients.cjs reads the same). */
const WORKBOOK_FILE =
  process.env.REEL_FACTFIND_XLSX ??
  "/tmp/claude-0/-home-user/0467c194-592b-542b-9c40-975738e514e0/scratchpad/r3-data/Jordan Ellis - Client Fact Find.xlsx";
/** The file's cells, read with openpyxl into WORKBOOK's and FIGURES' shapes. */
const READ_WORKBOOK = String.raw`
import datetime, json, sys
import openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws, le, setup = wb["Client Fact Find"], wb["Living Expenses"], wb["White Label Setup"]
def fmt(c, v=None):
    v = c.value if v is None else v
    if v is None: return ""
    if isinstance(v, datetime.datetime): return v.strftime("%d/%m/%Y")
    if isinstance(v, (int, float)):
        if c.number_format in ("\\$#,##0", "$#,##0"): return "$" + f"{v:,.0f}"
        if c.number_format in ("\\$#,##0.00", "$#,##0.00"): return "$" + f"{v:,.2f}"
        return str(v)
    return str(v)
merges = {(r.min_row, r.min_col): (r.max_row, r.max_col) for r in ws.merged_cells.ranges}
covered = {(r, c) for (r0, c0), (r1, c1) in merges.items() for r in range(r0, r1 + 1) for c in range(c0, c1 + 1) if (r, c) != (r0, c0)}
rows = []
for r in range(1, 20):
    cells = []
    for col in range(1, 6):
        c = ws.cell(r, col)
        if (r, col) in covered or (c.value is None and c.fill.fill_type != "solid"): continue
        text = fmt(c)
        if isinstance(c.value, str) and c.value.startswith("="):
            assert c.value == "='White Label Setup'!B5&\" | \"&'White Label Setup'!E5", c.value
            text = f"{setup['B5'].value} | {setup['E5'].value}"
        r1, c1 = merges.get((r, col), (r, col))
        cells.append([col, r1 - r + 1, min(c1, 5) - col + 1, text])
    rows.append([r, ws.row_dimensions[r].height or ws.sheet_format.defaultRowHeight, cells])
assert le["C55"].value == "=SUM(C5:C54)"
total = sum(v for v in (le.cell(r, 3).value for r in range(5, 55)) if isinstance(v, (int, float)))
figures = [[ws["A32"].value, fmt(ws["C32"])], [ws["A53"].value, fmt(ws["F53"])], [ws["A54"].value, fmt(ws["F54"])],
           [le["B31"].value, fmt(le["C31"])], [le["A55"].value, fmt(le["C55"], total)]]
print(json.dumps({"sheets": wb.sheetnames, "rows": rows, "figures": figures}))
`;
/**
 * Reads the workbook again (openpyxl) and refuses any difference from what the film draws. Where the file or
 * openpyxl isn't on this machine (a render machine with only the assets), it says so and draws what it holds.
 */
function verifyWorkbook() {
  if (!fs.existsSync(WORKBOOK_FILE)) return "not checked: the workbook isn't on this machine";
  let read;
  try {
    read = JSON.parse(
      execFileSync("python3", ["-I", "-c", READ_WORKBOOK, WORKBOOK_FILE], { encoding: "utf8" }),
    );
  } catch (err) {
    return `not checked: ${String(err.message).split("\n")[0]}`;
  }
  const held = {
    sheets: WORKBOOK.sheets,
    rows: WORKBOOK.rows.map(([r, pt, cells]) => [
      r,
      pt,
      cells.map(([, col, rows, cols, text]) => [col, rows, cols, text]),
    ]),
    figures: FIGURES.map((f) => [f.label, f.value]),
  };
  // Row 4 and 17 hold unfilled empty cells, which the reading leaves out as the film does.
  const a = JSON.stringify(held);
  const b = JSON.stringify(read);
  if (a !== b)
    throw new Error(`The fact find's cells differ from the workbook's:\n held ${a}\n file ${b}`);
  return "checked against the workbook";
}

// ------------------------------------------------------------------ the workbook, drawn
/** The sheet's scale: Calibri 11 pt at 22 px. */
const S = 1.5;
const PT = (4 / 3) * S;
/** A column's width in px at 100% (Calibri 11's maximum digit width, 7 px, plus Excel's 5 px of padding). */
const colPx = (chars) => chars * 7 + 5;
const ROWNUM_W = 46;
const TITLE_H = 48;
const COLHDR_H = 30;
const TABS_H = 44;
const GRID_W = WORKBOOK.widths.reduce((s, w) => s + colPx(w) * S, 0);
const COL_X = WORKBOOK.widths.reduce((xs, w, i) => [...xs, xs[i] + colPx(w) * S], [ROWNUM_W]);
const ROW_Y = WORKBOOK.rows.reduce(
  (ys, [, pt], i) => [...ys, ys[i] + pt * PT],
  [TITLE_H + COLHDR_H],
);
const BOOK_W = Math.round(ROWNUM_W + GRID_W);
const BOOK_H = Math.round(ROW_Y.at(-1) + TABS_H);
const FACES = {
  gothic: `'Century Gothic', 'Inter Display', 'Inter', sans-serif`,
  calibri: `'Calibri', 'Carlito', sans-serif`,
};

const bookCss = `
.ff-persp { position:absolute; inset:0; perspective:2400px; perspective-origin:540px 620px; pointer-events:none; }
.ff-book { position:absolute; left:0; top:0; width:${BOOK_W}px; height:${BOOK_H}px; border-radius:16px; overflow:hidden; background:#fff;
  transform-origin:50% 50%; box-shadow:0 46px 100px rgba(0,0,0,.6), 0 12px 30px rgba(0,0,0,.38), 0 0 0 1px rgba(255,255,255,.22); }
.ff-tb { position:absolute; left:0; top:0; width:100%; height:${TITLE_H}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
  gap:12px; background:linear-gradient(180deg, #f6f7f9, #eceef2); border-bottom:1px solid #d6dae1; font:600 19px/1 "Inter", sans-serif; color:#394150; }
.ff-tb .ic { width:24px; height:24px; border-radius:6px; background:linear-gradient(180deg, #2f8f5b, #1f6d44); position:relative; flex:none;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.12); }
.ff-tb .ic::before { content:""; position:absolute; left:5px; right:5px; top:5px; bottom:5px; border:1.5px solid rgba(255,255,255,.9); border-radius:1px;
  background:linear-gradient(rgba(255,255,255,.9), rgba(255,255,255,.9)) 50% 0/1.5px 100% no-repeat, linear-gradient(rgba(255,255,255,.9), rgba(255,255,255,.9)) 0 50%/100% 1.5px no-repeat; }
.ff-ch { position:absolute; top:${TITLE_H}px; height:${COLHDR_H}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
  background:#f6f7f9; border-bottom:1px solid #dadde3; border-right:1px solid #e3e6eb; font:500 15px/1 "Inter", sans-serif; color:#6b7280; }
.ff-rn { position:absolute; left:0; width:${ROWNUM_W}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
  background:#f6f7f9; border-right:1px solid #dadde3; border-bottom:1px solid #e8eaee; font:500 14px/1 "Inter", sans-serif; color:#6b7280; }
.ff-c { position:absolute; box-sizing:border-box; display:flex; align-items:center; overflow:hidden; white-space:nowrap; }
.ff-freeze { position:absolute; left:0; width:100%; height:2px; background:#b9c0ca; }
.ff-tabs { position:absolute; left:0; bottom:0; width:100%; height:${TABS_H}px; box-sizing:border-box; display:flex; align-items:stretch; gap:2px;
  padding-left:${ROWNUM_W + 8}px; background:#eef0f3; border-top:1px solid #d6dae1; font:500 16px/1 "Inter", sans-serif; color:#4b5563; }
.ff-tabs span { display:flex; align-items:center; padding:0 18px; white-space:nowrap; }
.ff-tabs span.on { background:#fff; color:#12345B; font-weight:700; box-shadow:inset 0 -3px 0 #12345B; }
.ff-glint { position:absolute; box-sizing:border-box; border:2px solid #C9A227; border-radius:3px; pointer-events:none;
  box-shadow:0 0 0 3px rgba(201,162,39,.22), 0 0 22px rgba(201,162,39,.5); }
`;

/** A cell's box in the book: [x, y, w, h]. */
const cellBox = (rowIndex, col, rows, cols) => {
  const x = COL_X[col - 1];
  const y = ROW_Y[rowIndex];
  return [x, y, COL_X[col - 1 + cols] - x, ROW_Y[rowIndex + rows] - y];
};
/** The value cells Jordan filled in, for the glints: their boxes in the book. */
const FILLED = WORKBOOK.rows.flatMap(([, , cells], i) =>
  cells
    .filter(([style, , , , text]) => style === "value" && text)
    .map(([, col, rows, cols]) => cellBox(i, col, rows, cols)),
);

/** The workbook as a window: `id` its element; `glints` draws a ring on each filled value cell. */
function bookHtml(id, { glints = false } = {}) {
  const cells = WORKBOOK.rows
    .flatMap(([, , list], i) =>
      list.map(([style, col, rows, cols, text]) => {
        const s = STYLES[style];
        const [x, y, w, h] = cellBox(i, col, rows, cols);
        const pad = (s.indent ? 9 * s.indent : 3) * S;
        const css = [
          `left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)}`,
          `background:${s.fill}`,
          `color:${s.color}`,
          `font:${s.bold ? 700 : 400} ${r3(s.pt * PT)}px/1.1 ${FACES[s.face]}`,
          `justify-content:${s.align === "center" ? "center" : "flex-start"}`,
          `padding:0 ${px(pad)}`,
          s.border ? `border-bottom:${S}px solid ${s.border}` : "",
          s.box ? `border:${S * 0.75}px solid ${s.box}` : "",
          style === "title" ? "letter-spacing:.04em" : "",
        ]
          .filter(Boolean)
          .join(";");
        return `<div class="ff-c" style="${css}">${text}</div>`;
      }),
    )
    .join("");
  const letters = "ABCDE"
    .split("")
    .map(
      (L, i) =>
        `<div class="ff-ch" style="left:${px(COL_X[i])};width:${px(COL_X[i + 1] - COL_X[i])}">${L}</div>`,
    )
    .join("");
  const numbers = WORKBOOK.rows
    .map(
      ([r], i) =>
        `<div class="ff-rn" style="top:${px(ROW_Y[i])};height:${px(ROW_Y[i + 1] - ROW_Y[i])}">${r}</div>`,
    )
    .join("");
  const tabs = WORKBOOK.sheets
    .map((name) => `<span class="${name === WORKBOOK.active ? "on" : ""}">${name}</span>`)
    .join("");
  const rings = glints
    ? FILLED.map(
        ([x, y, w, h], k) =>
          `<i class="ff-glint" id="${id}-g${k}" style="left:${px(x - 3)};top:${px(y - 3)};width:${px(w + 6)};height:${px(h + 6)};visibility:hidden"></i>`,
      ).join("")
    : "";
  return `<div class="ff-book" id="${id}" style="visibility:hidden">
    <div class="ff-tb"><i class="ic"></i><span>${WORKBOOK.file}</span></div>
    <div class="ff-ch" style="left:0;width:${ROWNUM_W}px"></div>${letters}${numbers}${cells}
    <i class="ff-freeze" style="top:${px(ROW_Y.at(-1) - 1)}"></i>
    <div class="ff-tabs">${tabs}</div>${rings}</div>`;
}

// ------------------------------------------------------------------ a screen in a window, its bar pinned
const BAR = K3.BAR_H;
/** fk-win's padding and border: the page sits this far inside the window's rect. */
const INSET = 12 + M.KIT.K;
const winCss = `
.ff-view { position:absolute; left:0; overflow:hidden; }
.ff-cam { position:absolute; left:0; top:0; transform-origin:0 0; }
.ff-cam > img, .ff-cam > .ff-plate { position:absolute; left:0; top:0; }
.ff-barslot { position:absolute; left:0; top:0; width:100%; height:${BAR}px; z-index:3; }
.ff-scan { position:absolute; height:3px; margin-top:-1.5px; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(90deg, rgba(245,209,122,0), #f5d17a 18%, #fff6de 50%, #f5d17a 82%, rgba(245,209,122,0));
  box-shadow:0 0 18px 4px rgba(215,179,95,.55); }
.ff-flash { position:absolute; box-sizing:border-box; border-radius:14px; pointer-events:none; border:3px solid #f5d17a;
  box-shadow:0 0 0 6px rgba(215,179,95,.18), 0 0 46px rgba(215,179,95,.55), inset 0 0 60px rgba(215,179,95,.16); }
`;
/**
 * A glass window holding a screen's states (`keys`, stacked to cross-fade between), its DEMO WORKSPACE bar pinned at
 * its top, and `inside`: anything drawn on the page in the screen's own CSS px (it moves with the camera).
 */
function screenWinHtml(id, keys, { bar, z = 5, inside = "", pageBg = "#0b0c14" }) {
  const [w, h] = K3.screen(keys[0]).css;
  const layers = keys
    .map((key, n) => {
      const s = K3.screen(key);
      return `<img id="${id}-${n}" src="${s.src}" alt="" style="width:${s.css[0]}px;height:${s.css[1]}px;visibility:hidden">`;
    })
    .join("");
  return `<div class="fk-win" id="${id}" style="z-index:${z};visibility:hidden"><div class="fk-page" id="${id}-page">
    <div class="ff-view" id="${id}-view" style="background:${pageBg}"><div class="ff-cam" id="${id}-cam" style="width:${w}px;height:${h}px">${layers}${inside}</div><div class="fk-veil" id="${id}-veil"></div></div>
    <div class="ff-barslot">${K3.barHtml(bar)}</div></div></div>`;
}
/**
 * Where a window's camera puts its screen: the window's `rect` in the frame, the camera's zoom `z` and the screen
 * point `c` it centres. The screen never leaves an edge of the view uncovered on an axis it fills; on an axis it
 * doesn't fill, it is centred. Returns the view's size, the screen point at its top-left, and `map` (screen → frame).
 */
function camera(css, rect, z, c) {
  const vw = rect[2] - 2 * INSET;
  const vh = rect[3] - 2 * INSET - BAR;
  const fit = (size, view, centre) => {
    const span = view / z;
    if (size <= span) return (size - span) / 2;
    return Math.min(size - span, Math.max(0, centre - span / 2));
  };
  const x0 = fit(css[0], vw, c[0]);
  const y0 = fit(css[1], vh, c[1]);
  const left = rect[0] + INSET;
  const top = rect[1] + INSET + BAR;
  return {
    vw,
    vh,
    x0,
    y0,
    z,
    map: ([x, y]) => [left + (x - x0) * z, top + (y - y0) * z],
    mapRect: ([x, y, w, h]) => [left + (x - x0) * z, top + (y - y0) * z, w * z, h * z],
  };
}
/** Between two cameras ({ z, c }), at p: the zoom by ratio, the centre evenly. */
const camBetween = (a, b, p) => ({ z: M.zoomLerp(a.z, b.z, p), c: M.lerp2(a.c, b.c, p) });
/** Sets a screen window: its rect, its camera, its layers' opacities, its veil, and its own opacity and transform. */
function screenWinState(
  st,
  id,
  keys,
  { rect, cam, layers, veil = 0, opacity = 1, transform = "none" },
) {
  const css = K3.screen(keys[0]).css;
  const g = camera(css, rect, cam.z, cam.c);
  st.set(`#${id}`, { left: px(rect[0]), top: px(rect[1]), transform, ...fade(opacity) });
  st.set(`#${id}-page`, { width: px(rect[2] - 2 * INSET), height: px(rect[3] - 2 * INSET) });
  st.set(`#${id}-view`, { top: px(BAR), width: px(g.vw), height: px(g.vh) });
  st.set(`#${id}-cam`, {
    transform: `translate(${px(-g.x0 * g.z)}, ${px(-g.y0 * g.z)}) scale(${g.z.toFixed(6)})`,
  });
  layers.forEach((o, n) => st.set(`#${id}-${n}`, fade(o)));
  st.set(`#${id}-veil`, fade(veil));
  return g;
}

// ------------------------------------------------------------------ the import's count tiles
/** The seven tiles in the clients-add-parsed capture (the file card scrolled whole): label, value and box. */
const TILE_KEY = "clients-add-parsed";
const TILE_NAMES = [
  "ApplicantsFound",
  "AddressRecordsFound",
  "EmploymentRecordsFound",
  "AssetsPopulated",
  "LiabilitiesPopulated",
  "LivingExpensesPopulated",
  "WarningCount",
];
/** Each tile's value, as the import counted Jordan's workbook (the capture's own figures). */
const TILE_VALUES = [1, 1, 1, 3, 2, 21, 0];
/** Each tile's background under its value, measured on the capture (it varies a little across the row). */
const TILE_GROUND = [
  "rgb(16,16,24)",
  "rgb(13,13,22)",
  "rgb(12,13,20)",
  "rgb(12,12,20)",
  "rgb(12,12,22)",
  "rgb(12,12,23)",
  "rgb(12,12,23)",
];
const TILES = TILE_NAMES.map((name, k) => {
  const box = K3.region(TILE_KEY, `tile${name}`);
  const value = K3.region(TILE_KEY, `value${name}`);
  return {
    box,
    // The value's line, in the tile's own px (text-lg: 18 px on a 28 px line).
    value: [value[0] - box[0], value[1] - box[1], value[2], value[3]],
    n: TILE_VALUES[k],
    ground: TILE_GROUND[k],
  };
});
const tileCss = `
.ff-tile { position:absolute; left:0; top:0; overflow:hidden; border-radius:12px; transform-origin:0 0;
  box-shadow:0 22px 46px rgba(0,0,0,.55), 0 0 0 1.5px rgba(215,179,95,.42); }
.ff-tile img { position:absolute; }
.ff-tile .cov { position:absolute; }
.ff-tile .num { position:absolute; font:700 18px/28px "Inter", ui-sans-serif, system-ui, sans-serif; font-variant-numeric:tabular-nums;
  color:#ececee; white-space:nowrap; }
.ff-tile .lit { position:absolute; inset:0; border-radius:12px; box-shadow:inset 0 0 0 2px #f5d17a, inset 0 0 26px rgba(215,179,95,.35); }
.ff-tile .sheen { position:absolute; top:-30%; bottom:-30%; left:0; width:120px; mix-blend-mode:screen; pointer-events:none;
  background:linear-gradient(100deg, rgba(255,240,205,0), rgba(255,240,205,.30) 50%, rgba(255,240,205,0)); }
`;
/** The tiles, each the capture's own pixels with its value's line covered and counted in the product's type. */
function tilesHtml(idp) {
  const s = K3.screen(TILE_KEY);
  return TILES.map((t, k) => {
    const [x, y, w, h] = t.box;
    const [vx, vy] = t.value;
    return `<div class="ff-tile" id="${idp}-${k}" style="width:${w}px;height:${h}px;visibility:hidden">
      <img src="${s.src}" alt="" style="left:${px(-x)};top:${px(-y)};width:${s.css[0]}px;height:${s.css[1]}px">
      <i class="cov" style="left:${px(vx - 1)};top:${px(vy + 1)};width:62px;height:26px;background:${t.ground}"></i>
      <b class="num" id="${idp}-${k}-n" style="left:${px(vx)};top:${px(vy)}">${t.n}</b>
      <i class="lit" id="${idp}-${k}-l" style="visibility:hidden"></i><i class="sheen" id="${idp}-${k}-s" style="visibility:hidden"></i></div>`;
  }).join("");
}

// ------------------------------------------------------------------ the figures, flying
const chipCss = `
.ff-chip { position:absolute; left:0; top:0; display:flex; align-items:stretch; white-space:nowrap; border-radius:10px; overflow:hidden;
  transform-origin:50% 50%; box-shadow:0 18px 40px rgba(0,0,0,.5), 0 0 0 2px #C9A227; }
.ff-chip .l { display:flex; align-items:center; padding:0 18px; background:#F3F6FA; color:#12345B; font:700 23px/1 "Carlito", "Calibri", sans-serif;
  border-right:2px solid #D9E1EC; }
.ff-chip .v { display:flex; align-items:center; padding:0 20px; background:#FFFBEA; color:#1F2937; font:700 28px/1 "Carlito", "Calibri", sans-serif;
  font-variant-numeric:tabular-nums; }
.ff-burst { position:absolute; left:0; top:0; width:240px; height:240px; margin:-120px 0 0 -120px; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(circle, rgba(255,246,222,.95) 0%, rgba(245,209,122,.55) 18%, rgba(200,155,60,.18) 42%, rgba(200,155,60,0) 68%); }
`;
const CHIP_H = 54;
const chipsHtml = (idp) =>
  FIGURES.map(
    (f, k) =>
      `<div class="ff-chip" id="${idp}-${k}" style="height:${CHIP_H}px;visibility:hidden"><span class="l">${f.label}</span><span class="v">${f.value}</span></div>`,
  ).join("");

const css = bookCss + winCss + tileCss + chipCss;

module.exports = {
  WORKBOOK,
  FIGURES,
  verifyWorkbook,
  BOOK_W,
  BOOK_H,
  FILLED,
  bookHtml,
  screenWinHtml,
  screenWinState,
  camera,
  camBetween,
  TILES,
  TILE_KEY,
  tilesHtml,
  CHIP_H,
  chipsHtml,
  css,
  clamp01,
  lerp,
  EASE,
};
