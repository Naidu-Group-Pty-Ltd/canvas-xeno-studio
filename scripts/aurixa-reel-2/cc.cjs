// Reel 2's Command Centre (03.2 to 03.4): Reel 1's Overview plate (PL-11A-c, built from the product's own pages
// in ../aurixa-reel-1/portals.cjs) in a taller window, 1240 x 1100 CSS px, so the whole sidebar shows, as the
// product's navigation registry orders it (src/lib/navigation/registry.ts): Main Dashboard, AML/CTF Compliance,
// Reports & Analysis, Client & CRM. Two states: Overview on, and AML/CTF Compliance on (pressed in 03.4).
//
// And the tiles that dock into it in 03.3, one a capability, each a crop of a page the product draws (Reel 1's
// plates, and the Financial Analysis pages in ../aurixa-reel-1/pages/reportCharts.cjs), set in Aurixa's glass:
// drawn once to pictures (scene.bake) and moved as pictures. A crop never shows an email address: the client
// file's contact row is left out of its tile.
const M = require("./motion.cjs");
const { PLATES } = require("../aurixa-reel-1/plates.cjs");
const reportCharts = require("../aurixa-reel-1/pages/reportCharts.cjs");

const { F } = M;

/** The window's page, in CSS px, and the scale its plates are drawn at (Reel 1's Command Centre scale). */
const CSS = [1240, 1100];
const SCALE = 1.25;

/** The sidebar's entries, in the order the page draws them (measured as `.cside .grp a`). */
const ENTRIES = [
  "Overview",
  "Market News Feed",
  "Property Marketplace",
  "Commercial / Industrial",
  "Calendar",
  "AML/CTF Compliance",
  "Reports",
  "Quantitative Reports",
  "Generated Reports",
  "Cash Flow Analysis",
  "Aurixa Intelligence Hub",
  "Portfolio Reports",
  "Report Requests",
  "Charts",
  "Clients",
  "Client Tracker",
  "CRM Conversations",
  "Message Hub",
  "Email Copilot",
  "Call Logs",
];
const entry = (label) => {
  const i = ENTRIES.indexOf(label);
  if (i < 0) throw new Error(`The sidebar has no ${label}`);
  return i;
};

/** The Overview plate with `label` as the sidebar's selected entry instead of Overview. */
function selecting(html, label) {
  // One anchor exactly: its class, one icon (an svg with no svg inside it), its label.
  const anchor = (on, text) =>
    new RegExp(`<a class="${on ? "on" : ""}">(<svg(?:(?!</svg>)[^])*</svg>)${text}</a>`);
  const off = html.replace(anchor(true, "Overview"), '<a class="">$1Overview</a>');
  const out = off.replace(anchor(false, label), `<a class="on">$1${label}</a>`);
  if (out === off) throw new Error(`The sidebar's ${label} could not be selected`);
  return out;
}

const overview = F.plate("PL-11A-c").html;
PLATES["R2-CC-a"] = { size: [CSS[0] * SCALE, CSS[1] * SCALE], scale: SCALE, html: overview };
PLATES["R2-CC-b"] = {
  size: [CSS[0] * SCALE, CSS[1] * SCALE],
  scale: SCALE,
  html: selecting(overview, "AML/CTF Compliance"),
};

// ------------------------------------------------------------------ the tiles
const RC = reportCharts({ P: F.asset("P.png"), EMBLEM: F.EMBLEM });
/** A plate of Reel 1's, or a page of the Financial Analysis, as HTML at its own CSS size. */
const source = (key) => {
  if (key.startsWith("rc:")) {
    const page = RC.pages[key.slice(3)];
    return {
      css: RC.A4,
      html: `<div style="position:absolute;inset:0;background:#fff">${page.html}</div>`,
    };
  }
  return F.plate(key);
};

const ICON = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#d7b35f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/**
 * The tiles, in the order they are named: each a label, the sidebar entry it docks into, and its crops (a
 * source, the rect of it shown [x, y, w, h] in its own CSS px, the zoom it is shown at, and where it sits in the
 * tile's body). The body is WIDTH wide; a tile's height follows from its crops.
 */
const WIDTH = 816;
const TILES = [
  {
    id: "intel",
    label: "Property intelligence",
    icon: "pin",
    dock: "Reports",
    illustrative: true,
    crops: [{ src: "PL-05A-a", rect: [381, 262, 770, 340] }],
  },
  {
    id: "finance",
    label: "Financial analysis",
    icon: "chart",
    dock: "Cash Flow Analysis",
    illustrative: true,
    // The page's title and its year-ten equity, then the chart (value, debt and equity, Now to Y10).
    crops: [
      { src: "rc:cashFlow", rect: [0, 58, 595.5, 186], width: 720 },
      { src: "rc:cashFlow", rect: [0, 338, 595.5, 302], width: 720 },
    ],
  },
  {
    id: "report",
    label: "Reporting",
    icon: "file",
    dock: "Generated Reports",
    crops: [
      { src: "rc:cover", rect: [0, 0, 595.5, 842.25], width: 400 },
      { src: "rc:keyFigures", rect: [0, 0, 595.5, 842.25], width: 400, beside: true },
    ],
  },
  {
    id: "client",
    label: "Client management",
    icon: "user",
    dock: "Clients",
    // The client file's head and the requests to the client: its contact row (an email address) is left out.
    crops: [
      { src: "PL-08A-a", rect: [262, 72, 680, 136], width: 720 },
      { src: "PL-08A-a", rect: [262, 358, 574, 290], width: 720 },
    ],
  },
  {
    id: "comms",
    label: "Communication",
    icon: "chat",
    dock: "Message Hub",
    crops: [
      { src: "NEW-MESSAGE-HUB-b", rect: [593, 150, 588, 62] },
      { src: "NEW-MESSAGE-HUB-b", rect: [593, 520, 588, 244] },
    ],
  },
];
/** The "and more" chips, each the sidebar entry it docks into (the last one leads to 03.4). */
const MORE = [
  "Market News Feed",
  "Property Marketplace",
  "Commercial / Industrial",
  "Calendar",
  "AML/CTF Compliance",
];

const HEAD = 78; // the tile's label row
const PADX = 28;
const GAP = 14;
/** A tile's crops laid out: each [x, y, w, h] in the tile, the zoom, and the source. */
function layout(tile) {
  let y = HEAD;
  let x = PADX;
  let rowH = 0;
  const placed = tile.crops.map((c) => {
    const w = c.width ?? WIDTH;
    const zoom = w / c.rect[2];
    const h = c.rect[3] * zoom;
    if (c.beside) {
      x += GAP;
    } else {
      if (rowH) y += rowH + GAP;
      x = PADX;
      rowH = 0;
    }
    const at = [x, y, w, h];
    x += w;
    rowH = Math.max(rowH, h);
    return { ...c, at, zoom };
  });
  const width = PADX * 2 + Math.max(...placed.map((p) => p.at[0] + p.at[2] - PADX));
  return { placed, size: [Math.round(width), Math.round(y + rowH + PADX)] };
}

const TILE_CSS = `
.r2t { position:relative; overflow:hidden; border-radius:30px; font-family:var(--reel-sans);
  background:linear-gradient(180deg, rgba(18,28,56,.97), rgba(8,14,30,.97)); border:1.5px solid rgba(215,179,95,.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07); }
.r2t-h { position:absolute; left:${PADX}px; right:${PADX}px; top:24px; height:34px; display:flex; align-items:center; gap:14px;
  font:700 21px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.24em; text-transform:uppercase; color:#d7b35f; }
.r2t-h svg { width:30px; height:30px; flex:none; }
.r2t-h em { margin-left:auto; font:600 15px/1 var(--reel-sans); letter-spacing:.04em; text-transform:none; font-style:normal; color:#B7C1D0;
  border:1px solid rgba(183,193,208,.45); border-radius:999px; padding:7px 12px; }
.r2t-c { position:absolute; overflow:hidden; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:#0b0c15; }
.r2t-c > div { position:absolute; left:0; top:0; transform-origin:0 0; }
`;

function tileHtml(tile) {
  const { placed, size } = layout(tile);
  const crops = placed
    .map(({ src, rect, zoom, at }) => {
      const s = source(src);
      return `<div class="r2t-c" style="left:${at[0]}px;top:${at[1]}px;width:${at[2]}px;height:${at[3]}px"><div style="width:${s.css[0]}px;height:${s.css[1]}px;transform:translate(${-rect[0] * zoom}px, ${-rect[1] * zoom}px) scale(${zoom})">${s.html}</div></div>`;
    })
    .join("");
  return {
    size,
    html: `<style>${TILE_CSS}${RC.CSS}</style><div class="r2t" style="width:${size[0]}px;height:${size[1]}px"><div class="r2t-h">${icon(tile.icon)}${tile.label}${tile.illustrative ? "<em>Illustrative</em>" : ""}</div>${crops}</div>`,
  };
}

/** The tiles as the scenes use them: their size, the picture they are baked to, and what they dock into. */
const tiles = TILES.map((tile) => {
  const { size, html } = tileHtml(tile);
  return { ...tile, size, html, file: `r2-tile-${tile.id}.png`, dockAt: entry(tile.dock) };
});
const tileBakes = () =>
  tiles.map((t) => ({ name: t.file, width: t.size[0], height: t.size[1], html: t.html }));

module.exports = { CSS, SCALE, ENTRIES, entry, tiles, tileBakes, MORE, TILE_CSS };
