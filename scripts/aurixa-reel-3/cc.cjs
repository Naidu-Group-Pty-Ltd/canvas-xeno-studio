// Reel 3's Command Centre (09.1 to 09.3): Reel 1's Overview plate (PL-11A-c, built from the product's own pages in
// ../aurixa-reel-1/portals.cjs) on a page tall enough for the sidebar to reach its Portals group, as the product's
// navigation registry orders it (npc-client-dashboard src/lib/navigation/registry.ts, NAVIGATION_GROUP_ORDER, with
// AML/CTF Compliance drawn after Main Dashboard as DashboardSidebar.tsx draws it): Main Dashboard, AML/CTF
// Compliance, Reports & Analysis, Client & CRM, then Operations and Help & Usage folded (a folded group says how many
// pages it holds, as sidebarGroupParts.tsx's NavGroupHeading does) around Portals open: Finance Portal, Solicitor
// Portal, Accountant Portal and Client Portal (the Builder Portal is behind a feature flag this workspace leaves off).
//
// The Overview runs on past the Executive snapshot into its next section, Workflow control (src/pages/Overview.tsx),
// so the page fills the window and carries on past its foot as the product's does.
//
// The page also carries the Aurixa Agent's panel (09.3): the product's own panel as the screens harness drew it
// (captures/40-agent.cjs: agent-card-panel, then agent-approved-panel), at the page's right as the product floats it,
// hidden until the launcher (the plate's own floating Aurixa, in the bottom right corner of the window's view, where
// the product fixes it) is pressed; and the launcher's tooltip, "Ask Aurixa", its own title
// (src/components/agent/presence/AgentLauncher.tsx).
//
// And the tiles that dock into the sidebar in 09.2, one a capability, each a crop of a page the product draws, new to
// this reel: the Property Marketplace (../aurixa-reel-1/pages/marketplace.cjs), the Financial Analysis' 10-year cash
// flow with its illustrative band (../aurixa-reel-1/pages/reportCharts.cjs), Generated Reports (PL-05C-a), the
// Message Hub (NEW-MESSAGE-HUB-b), and the four portals each as its own card: the portal's own mark and the person
// signed in to it, as each portal's sidebar draws them (NEW-DASHBOARDS-finance, -solicitor, -accountant, PL-06A-a).
// Drawn once to pictures (scene.bake) and moved as pictures. No crop shows an email address, a grade's buying word or
// a pointer baked into a plate.
const M = require("./motion.cjs");
const K3 = require("./kit3.cjs");
const { PLATES } = require("../aurixa-reel-1/plates.cjs");
const reportCharts = require("../aurixa-reel-1/pages/reportCharts.cjs");
const marketplace = require("../aurixa-reel-1/pages/marketplace.cjs");

const { F, r3 } = M;

/** The page, in CSS px, and the scale its plate is drawn at (Reel 1's Command Centre scale). */
const W = 1240;
const H = 1600;
/** How much of the page the whole Command Centre shows: down to Help & Usage (the page runs on, so the camera can
 * stand the Portals group in the middle of the frame). It is the window's view: the launcher floats at its foot. */
const SHOWN_H = 1420;
const CSS = [W, H];
const SCALE = 1.25;
const PLATE = "R3-CC";

/** Lucide's glyphs (the product's icon set), as the sidebar draws its entries. */
const GLYPH = {
  shieldCheck:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
};
const entrySvg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[name]}</svg>`;
const chevron = (rotate = 0) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#B48D3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${rotate ? ` style="transform:rotate(${rotate}deg)"` : ""}><path d="M6 9l6 6 6-6"/></svg>`;
/** A folded group: its heading, and how many pages it holds back (NavGroupHeading's count and chevron, one pill). */
const folded = (head, count) =>
  `<div class="grp folded"><h6>${head}<span class="cnt">${count}${chevron(-90)}</span></h6></div>`;
const PORTALS = [
  ["shieldCheck", "Finance Portal"],
  ["scale", "Solicitor Portal"],
  ["calculator", "Accountant Portal"],
  ["globe", "Client Portal"],
];
const portalsGroup = `<div class="grp"><h6>PORTALS${chevron()}</h6>${PORTALS.map(
  ([g, label]) => `<a class="">${entrySvg(g)}${label}</a>`,
).join("")}</div>`;

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
  "Finance Portal",
  "Solicitor Portal",
  "Accountant Portal",
  "Client Portal",
];
const entry = (label) => {
  const i = ENTRIES.indexOf(label);
  if (i < 0) throw new Error(`The sidebar has no ${label}`);
  return i;
};

// ------------------------------------------------------------------ the agent's panel, in the page
/** Where the panel floats on the page (CSS px): at its right, 12 px in, as the product floats it. */
const PANEL = [W - 448 - 12, 12, 448, 976];
const PANEL_STATES = ["agent-card-panel", "agent-approved-panel"];
const agentPanelHtml = () => {
  const imgs = PANEL_STATES.map((key, n) => {
    const s = K3.screen(key);
    return `<img id="agp-${n}" src="${s.src}" alt="" style="position:absolute;left:0;top:0;width:${s.css[0]}px;height:${s.css[1]}px;${n ? "visibility:hidden;opacity:0" : ""}">`;
  }).join("");
  return `<div class="agp" id="agp" style="left:${PANEL[0]}px;top:${PANEL[1]}px;width:${PANEL[2]}px;height:${PANEL[3]}px;visibility:hidden">${imgs}<i class="agp-sheen" id="agp-sheen"></i></div>`;
};

const EXTRA_CSS = `
.ccr .grp.folded { padding-bottom:0; }
.ccr .grp.folded h6 { padding-bottom:16px; }
.ccr .grp.back { border-color:rgba(255,255,255,.06); background:rgba(255,255,255,.015); }
.ccr .grp h6 .cnt { display:inline-flex; align-items:center; gap:3px; height:17px; padding:0 5px 0 7px; border-radius:999px;
  border:1px solid rgba(180,141,60,.45); font-size:9.5px; letter-spacing:.04em; color:#B48D3C; }
.ccr .grp h6 .cnt svg { width:11px; height:11px; }
.ccr .agp { position:absolute; z-index:30; border-radius:18px; overflow:hidden; box-shadow:0 40px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06); }
.ccr .agp-sheen { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; opacity:0; visibility:hidden;
  background:linear-gradient(105deg, rgba(255,240,205,0) 40%, rgba(255,240,205,.16) 50%, rgba(255,240,205,0) 60%) no-repeat; background-size:260% 100%; }
.ccr #lfab { bottom:${6 + H - SHOWN_H}px; }
.ccr .ltip { position:absolute; right:118px; bottom:${42 + H - SHOWN_H}px; padding:8px 13px; border-radius:9px; background:#17171d; border:1px solid rgba(255,255,255,.16);
  font-size:13px; font-weight:700; color:#ececef; white-space:nowrap; box-shadow:0 10px 26px rgba(0,0,0,.5); visibility:hidden; opacity:0; z-index:12; }
.ccr .r3-litbar { position:absolute; left:0; top:0; width:3px; border-radius:2px; transform-origin:50% 0; visibility:hidden; z-index:5;
  background:linear-gradient(180deg, #5edde8, #d7b35f 22%, #d7b35f 82%, rgba(215,179,95,0)); box-shadow:0 0 12px rgba(215,179,95,.75); }
.ccr .r3-litdot { position:absolute; left:0; top:0; width:12px; height:12px; margin:-6px 0 0 -6px; border-radius:50%; background:#f5d17a;
  box-shadow:0 0 22px #d7b35f, 0 0 6px #fff3d6; visibility:hidden; z-index:6; }
.ccr .r3rem { margin-top:18px; border-radius:16px; border:1px solid rgba(255,255,255,.09); overflow:hidden;
  background:linear-gradient(135deg, #111219, #0f1016 60%, #13141b); }
.ccr .r3rem-h { display:flex; align-items:center; gap:12px; padding:14px 18px 12px; border-bottom:1px solid rgba(255,255,255,.07);
  background:rgba(255,255,255,.02); font-size:14px; font-weight:700; }
.ccr .r3rem-dot { width:32px; height:32px; flex:none; border-radius:50%; display:grid; place-items:center; background:rgba(61,99,255,.12); }
.ccr .r3rem svg { width:16px; height:16px; flex:none; }
.ccr .r3rem-b { padding:16px; }
.ccr .r3rem-list { height:228px; overflow:hidden; display:flex; flex-direction:column; gap:12px; }
.ccr .r3rem-row { flex:none; min-height:64px; display:flex; align-items:center; gap:12px; padding:12px; border-radius:16px;
  border:1px solid rgba(255,255,255,.08); background:#0b0c12; }
.ccr .r3rem-ic { width:38px; height:38px; flex:none; border-radius:12px; display:grid; place-items:center; background:#1a1b22; }
.ccr .r3rem-row b { display:block; font-size:14px; font-weight:700; color:#f4f4f5; }
.ccr .r3rem-due { margin-left:auto; min-width:94px; text-align:right; }
.ccr .r3rem-badge { display:inline-block; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; }
.ccr .r3rem-badge.week { background:rgba(61,99,255,.14); color:#8aa2ff; }
.ccr .r3rem-badge.later { border:1px solid rgba(255,255,255,.16); color:#a1a1aa; padding:2px 8px; }
.ccr .r3rem-date { font:500 11.5px/1 "Inconsolata", ui-monospace, monospace; color:#a1a1aa; margin-top:8px; }
.ccr .r3rem-all { margin-top:16px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:4px;
  background:#1d4ed8; border:1px solid rgba(43,92,255,.6); font-size:14px; font-weight:700; box-shadow:0 14px 30px rgba(29,78,216,.2); }
`;

/**
 * The Overview's Intake performance row (src/pages/Overview.tsx, its MetricTile row), worked out as the page works it
 * out from the workspace's own listings, the Property Marketplace's (../aurixa-reel-1/pages/marketplace.cjs): received
 * in the last seven days, with an inspection booked, below 0.7 confidence (none is), and the average asking price.
 */
function intakeRow() {
  const L = marketplace.LISTINGS;
  const days = (l) => {
    if (/^New$/i.test(l.fresh ?? "")) return 0;
    const m = /Added (\d+) days? ago/.exec(l.fresh ?? "");
    return m ? Number(m[1]) : Infinity;
  };
  const newThisWeek = L.filter((l) => days(l) < 7).length;
  const withInspections = L.filter((l) => l.inspect).length;
  const average = L.reduce((s, l) => s + l.price, 0) / L.length;
  const aud = (v) => `$${Math.round(v).toLocaleString("en-AU")}`;
  const glyph = {
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    dollar:
      '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  };
  const tone = {
    info: ["#3d63ff", "rgba(40,70,200,.18)", "rgba(70,100,255,.35)"],
    plain: ["#c9c9d1", "rgba(255,255,255,.05)", "rgba(255,255,255,.14)"],
    warning: ["#f59e0b", "rgba(245,158,11,.12)", "rgba(245,158,11,.38)"],
    success: ["#22c55e", "rgba(34,197,94,.14)", "rgba(34,197,94,.4)"],
  };
  const tile = (title, value, ic, desc, t) => {
    const [c, bg, bd] = tone[t];
    return `<div class="qtile"><div style="display:flex"><span class="l">${title.toUpperCase()}</span><span class="qicon sq" style="margin-left:auto;background:${bg};border-color:${bd}"><svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph[ic]}</svg></span></div><div class="v">${value}</div><div class="qsmall">${desc}</div></div>`;
  };
  return `<div class="qtiles">${[
    tile("New This Week", newThisWeek, "trend", "Properties received in last 7 days", "info"),
    tile(
      "With Inspections",
      withInspections,
      "calendar",
      "Properties with scheduled inspections",
      "plain",
    ),
    tile("Needs Review", 0, "alert", "Low confidence (&lt;0.7) properties", "warning"),
    tile("Average Price", aud(average), "dollar", "Last 30 days", "success"),
  ].join("")}</div>`;
}

/**
 * The Overview's next section, Workflow control (src/pages/Overview.tsx), and its Upcoming Reminders card
 * (src/components/overview/UpcomingRemindersWidget.tsx): the demo client's two follow-ups the Operations tiles count as
 * due this week (the demo's today is Saturday 24 October 2026, the screens harness's clock) and the next after them,
 * each with its due badge and date, then View All Reminders. The card's list is the widget's own 228 px.
 */
function workflowSection() {
  const glyph = {
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  const svg = (name, color, width = 1.8) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${glyph[name] ?? GLYPH[name]}</svg>`;
  const REMINDERS = [
    [
      "bell",
      "Share the Borrowing Capacity Snapshot",
      "Jordan Ellis",
      "week",
      "This Week",
      "26 Oct 2026",
    ],
    ["user", "Introduce a finance partner", "Jordan Ellis", "week", "This Week", "28 Oct 2026"],
    ["bell", "Book a building inspection", "Jordan Ellis", "later", "Upcoming", "04 Nov 2026"],
  ];
  const row = ([ic, title, who, tone, due, date]) =>
    `<div class="r3rem-row"><span class="r3rem-ic">${svg(ic, "#a1a1aa")}</span><div style="min-width:0"><b>${title}</b><div class="qsmall" style="font-size:12px;margin-top:3px">${who}</div></div><div class="r3rem-due"><span class="r3rem-badge ${tone}">${due}</span><div class="r3rem-date">${date}</div></div>${svg("chevron", "#a1a1aa", 2)}</div>`;
  return `<div class="qops" style="padding-bottom:22px"><div class="qeb">● OPERATIONAL REMINDERS AND VALIDATION</div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:10px"><span class="qicon">${svg("shieldCheck", "#c9c9d1")}</span><div><b style="font-size:18px">Workflow control</b><div class="qsmall" style="font-size:12.5px">Current follow-ups and data consistency checks remain close to the executive metrics.</div></div></div>
    <div class="r3rem"><div class="r3rem-h"><span class="r3rem-dot">${svg("bell", "#3d63ff")}</span>Upcoming Reminders</div>
      <div class="r3rem-b"><div class="r3rem-list">${REMINDERS.map(row).join("")}</div><div class="r3rem-all">View All Reminders${svg("chevron", "#fff", 2)}</div></div></div></div>`;
}

function buildPlate() {
  let html = F.plate("PL-11A-c").html;
  // The Executive snapshot's head, then the section's close: its tiles go between, and Workflow control after it.
  const snapshot = "pipeline.</div></div></div>";
  if (html.split(`${snapshot}</div>`).length !== 2)
    throw new Error("cc: the Overview's Executive snapshot was not found");
  html = html.replace(`${snapshot}</div>`, `${snapshot}${intakeRow()}</div>${workflowSection()}`);
  const aside = html.indexOf("</aside>");
  if (aside < 0) throw new Error("cc: the Command Centre's sidebar was not found");
  // Administration (the back office) is drawn recessed after the module groups; its pages are those an Admin opens.
  html = `${html.slice(0, aside)}${folded("OPERATIONS", 9)}${portalsGroup}${folded("HELP &amp; USAGE", 4)}${folded("ADMINISTRATION", 13).replace('class="grp folded"', 'class="grp folded back"')}${html.slice(aside)}`;
  // The launcher (the plate's floating Aurixa) and its tooltip, each addressable.
  const fab = '<div class="qfab">';
  if (!html.includes(fab)) throw new Error("cc: the Command Centre's launcher was not found");
  html = html.replace(
    fab,
    `<div class="ltip" id="ltip">Ask Aurixa</div><div class="qfab" id="lfab">`,
  );
  // The thread of light down the sidebar (09.2's "all connected") lives in the page, so it moves with it.
  html = html.replace(
    '<aside class="cside">',
    '<aside class="cside" style="position:relative"><i class="r3-litbar" id="litbar"></i><i class="r3-litdot" id="litdot"></i>',
  );
  // The panel floats over everything else on the page.
  const end = html.lastIndexOf("</div>");
  html = `<style>${EXTRA_CSS}</style>${html.slice(0, end)}${agentPanelHtml()}${html.slice(end)}`;
  return html;
}
PLATES[PLATE] = { size: [W * SCALE, H * SCALE], scale: SCALE, html: buildPlate() };

// ------------------------------------------------------------------ the tiles
// The 10-year cash flow carries its loan at the assessment's own rate, 6.50% (Jordan's assessment in 07.4 and 08.2).
const RC = reportCharts({ P: F.asset("P.png"), EMBLEM: F.EMBLEM, rate: 0.065 });
const MK = marketplace.plate();
/** A page as HTML at its own CSS size: a Reel 1 plate, the marketplace, or a page of the Financial Analysis. */
const source = (key) => {
  if (key === "marketplace") return MK;
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
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#d7b35f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/**
 * The tiles, in the order they are named: each its label (the voice's words), the sidebar entry it docks into, and
 * its crops (a source, the rect of it shown [x, y, w, h] in its own CSS px, the width it is shown at, and whether it
 * sits beside the crop before it). A tile's height follows from its crops.
 */
/** A tile's crops are TILE_W wide, so the tile shows at its own size (its 26 px label is never scaled under 22 px). */
const TILE_W = 628;
const TILES = [
  {
    id: "intel",
    label: "Property intelligence",
    icon: "pin",
    dock: "Property Marketplace",
    // The page's head and its first row of listings: the photographs, prices and specifications.
    crops: [
      { src: "marketplace", rect: [262, 90, 1250, 160], width: TILE_W },
      { src: "marketplace", rect: [262, 466, 1250, 392], width: TILE_W },
    ],
  },
  {
    id: "finance",
    label: "Financial analysis",
    icon: "chart",
    dock: "Cash Flow Analysis",
    illustrative: true,
    // The 10-year cash flow: its illustrative band, year ten's equity, its three inputs, and the chart.
    crops: [{ src: "rc:cashFlow", rect: [30, 126, 535.5, 520], width: TILE_W }],
  },
  {
    id: "report",
    label: "Professional reporting",
    icon: "file",
    dock: "Generated Reports",
    // The library's head and counts, then its reports' own rows (above their grades).
    crops: [
      { src: "PL-05C-a", rect: [262, 90, 1250, 252], width: TILE_W },
      { src: "PL-05C-a", rect: [262, 584, 1250, 124], width: TILE_W },
    ],
  },
  {
    id: "comms",
    label: "Client communication",
    icon: "chat",
    dock: "Message Hub",
    // The hub's head, then its conversations and the conversation open with the client.
    crops: [
      { src: "NEW-MESSAGE-HUB-b", rect: [262, 88, 1252, 52], width: TILE_W },
      { src: "NEW-MESSAGE-HUB-b", rect: [262, 148, 920, 586], width: TILE_W },
    ],
  },
];
/**
 * Partner collaboration: the four portals, each as its own card (the portal's own mark and the person signed in to
 * it, from its own sidebar), each docking into its own entry. The crops stop above any email address.
 */
const PORTAL_CARDS = [
  { id: "finance", dock: "Finance Portal", src: "NEW-DASHBOARDS-finance", rect: [0, 0, 226, 140] },
  {
    id: "solicitor",
    dock: "Solicitor Portal",
    src: "NEW-DASHBOARDS-solicitor",
    rect: [0, 0, 226, 140],
  },
  {
    id: "accountant",
    dock: "Accountant Portal",
    src: "NEW-DASHBOARDS-accountant",
    rect: [0, 0, 226, 140],
  },
  { id: "client", dock: "Client Portal", src: "PL-06A-a", rect: [0, 0, 170, 105.3] },
];

const HEAD = 84; // the tile's label row
const PADX = 26;
const GAP = 14;
/** A tile's crops laid out: each [x, y, w, h] in the tile, the zoom, and the source. */
function layout(tile) {
  let y = HEAD;
  let x = PADX;
  let rowH = 0;
  const placed = tile.crops.map((c) => {
    const w = c.width;
    const zoom = w / c.rect[2];
    const h = c.rect[3] * zoom;
    if (c.beside) x += GAP;
    else {
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
.r3t { position:relative; overflow:hidden; border-radius:30px; font-family:var(--reel-sans);
  background:linear-gradient(180deg, rgba(18,28,56,.97), rgba(8,14,30,.97)); border:1.5px solid rgba(215,179,95,.55);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07); }
.r3t-h { position:absolute; left:${PADX}px; right:${PADX}px; top:24px; height:38px; display:flex; align-items:center; gap:14px;
  font:700 26px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.2em; text-transform:uppercase; color:#e2c278; white-space:nowrap; }
.r3t-h svg { width:32px; height:32px; flex:none; }
.r3t-h em { margin-left:auto; font:600 16px/1 var(--reel-sans); letter-spacing:.04em; text-transform:none; font-style:normal; color:#B7C1D0;
  border:1px solid rgba(183,193,208,.45); border-radius:999px; padding:7px 12px; }
.r3t-c { position:absolute; overflow:hidden; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:#0b0c15; }
.r3t-c > div { position:absolute; left:0; top:0; transform-origin:0 0; }
.r3t .cur, .r3t svg.cur, .r3t svg.cursor { display:none !important; }
.r3p { position:relative; overflow:hidden; border-radius:22px; border:1.5px solid rgba(215,179,95,.55);
  background:#0b0c15; box-shadow:inset 0 1px 0 rgba(255,255,255,.07); }
.r3p > div { position:absolute; left:0; top:0; transform-origin:0 0; }
.r3p .cur, .r3p svg.cur, .r3p svg.cursor { display:none !important; }
`;

const cropHtml = (src, rect, zoom) => {
  const s = source(src);
  return `<div style="width:${s.css[0]}px;height:${s.css[1]}px;transform:translate(${r3(-rect[0] * zoom)}px, ${r3(-rect[1] * zoom)}px) scale(${zoom})">${s.html}</div>`;
};
function tileHtml(tile) {
  const { placed, size } = layout(tile);
  const crops = placed
    .map(
      ({ src, rect, zoom, at }) =>
        `<div class="r3t-c" style="left:${r3(at[0])}px;top:${r3(at[1])}px;width:${r3(at[2])}px;height:${r3(at[3])}px">${cropHtml(src, rect, zoom)}</div>`,
    )
    .join("");
  return {
    size,
    html: `<style>${TILE_CSS}${RC.CSS}</style><div class="r3t" style="width:${size[0]}px;height:${size[1]}px"><div class="r3t-h">${icon(tile.icon)}${tile.label}${tile.illustrative ? "<em>Illustrative</em>" : ""}</div>${crops}</div>`,
  };
}
/** A portal's card: its own sidebar head (its mark, and the person signed in), at CARD_W wide. */
const CARD_W = 320;
function portalCardHtml(card) {
  const zoom = CARD_W / card.rect[2];
  const size = [CARD_W, Math.round(card.rect[3] * zoom)];
  return {
    size,
    html: `<style>${TILE_CSS}</style><div class="r3p" style="width:${size[0]}px;height:${size[1]}px">${cropHtml(card.src, card.rect, zoom)}</div>`,
  };
}

/** The tiles as the scenes use them: their size, the picture they are baked to, and what they dock into. */
/** A baked picture's name carries a hash of what it draws, so a changed tile is never served from an old bake. */
const hashed = (stem, html) =>
  `${stem}-${require("crypto").createHash("sha256").update(html).digest("hex").slice(0, 10)}.png`;
const tiles = TILES.map((tile) => {
  const { size, html } = tileHtml(tile);
  return {
    ...tile,
    size,
    html,
    file: hashed(`platform-tile-${tile.id}`, html),
    dockAt: entry(tile.dock),
  };
});
const portalCards = PORTAL_CARDS.map((card) => {
  const { size, html } = portalCardHtml(card);
  return {
    ...card,
    size,
    html,
    file: hashed(`platform-portal-${card.id}`, html),
    dockAt: entry(card.dock),
  };
});
/** The partner collaboration tile's head, on its own (the four portal cards come up under it). */
const CARD_H = Math.max(...portalCards.map((c) => c.size[1]));
const PARTNER_HEAD = {
  label: "Partner collaboration",
  icon: "door",
  size: [2 * CARD_W + GAP + 2 * PADX, HEAD + 2 * CARD_H + GAP + PADX],
};
const partnerHeadHtml = () =>
  `<style>${TILE_CSS}</style><div class="r3t" style="width:${PARTNER_HEAD.size[0]}px;height:${PARTNER_HEAD.size[1]}px"><div class="r3t-h">${icon(PARTNER_HEAD.icon)}${PARTNER_HEAD.label}</div></div>`;
PARTNER_HEAD.file = hashed("platform-partner-head", partnerHeadHtml());
const tileBakes = () => [
  ...tiles.map((t) => ({ name: t.file, width: t.size[0], height: t.size[1], html: t.html })),
  ...portalCards.map((c) => ({ name: c.file, width: c.size[0], height: c.size[1], html: c.html })),
  {
    name: PARTNER_HEAD.file,
    width: PARTNER_HEAD.size[0],
    height: PARTNER_HEAD.size[1],
    html: partnerHeadHtml(),
  },
];

/**
 * Lights sidebar entry i in the window's page: a gold edge and glow on the entry itself, `v` of the way on (0 to 1),
 * its glow `flash` times its resting strength.
 */
function lightEntry(st, i, v, flash = 1, layer = "#W-0") {
  st.set(
    `${layer} .cside .grp a`,
    {
      "box-shadow": `inset 0 0 0 1px rgba(215,179,95,${r3(0.8 * v)}), 0 0 ${r3(18 * v * flash)}px rgba(215,179,95,${r3(0.42 * v)})`,
      "background-color": `rgba(200,155,60,${r3(0.16 * v * Math.min(flash, 2))})`,
      // The label warms with it: #ececef to #f5e3b5.
      color: `rgb(${Math.round(236 + 9 * v)}, ${Math.round(236 - 9 * v)}, ${Math.round(239 - 58 * v)})`,
    },
    i,
  );
}

module.exports = {
  PLATE,
  CSS,
  SHOWN_H,
  SCALE,
  ENTRIES,
  entry,
  PANEL,
  PANEL_STATES,
  tiles,
  portalCards,
  PARTNER_HEAD,
  CARD_W,
  tileBakes,
  TILE_CSS,
  lightEntry,
};
