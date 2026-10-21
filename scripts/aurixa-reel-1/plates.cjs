// Typesets Reel 1's screen plates, overlays and end card (docs/brands/aurixa-reel-1, stage 3) and
// renders them to PNG. v2: the portals are built on the supplied portal screenshots (./portals.cjs);
// the Command Center follows the same family until its screenshot is supplied. P, D and the emblem
// are placeholders until their files are given.
// Run: node scripts/aurixa-reel-1/plates.cjs <outDir> [assetsDir with P.png, D.png, emblem.png]
const fs = require("fs");
const os = require("os");
const path = require("path");

function playwright() {
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((file) =>
  fs.existsSync(file),
);

const OUT = path.resolve(process.argv[2] || "reel-1-plates");
const ASSETS = process.argv[3] ? path.resolve(process.argv[3]) : null;
fs.mkdirSync(OUT, { recursive: true });
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
const asset = (name) => {
  const file = ASSETS && path.join(ASSETS, name);
  return file && fs.existsSync(file) ? dataUrl(file, "image/png") : null;
};
const P = asset("P.png");
const D = asset("D.png");
const EMBLEM = asset("emblem.png");
const WORDMARK = asset("wordmark.png");
// The supplied logo itself (its glow, rings, skyline and lettering), for the trial and closing cards.
const LOGO = asset("logo-art.png");

/** A Google font as a data URL, kept in the temp folder (Inter is a system font). */
async function googleFont(family, weight) {
  const file = path.join(os.tmpdir(), `${family.replace(/ /g, "-").toLowerCase()}-${weight}.ttf`);
  if (!fs.existsSync(file)) {
    const sheet = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`,
        { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } },
      )
    ).text();
    const url = /url\((https:[^)]+)\)/.exec(sheet)?.[1];
    if (!url) throw new Error(`${family} couldn't be found on Google Fonts`);
    fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  return dataUrl(file, "font/ttf");
}

// The portals' own fonts: they set the system stack, so the supplied (Windows) screenshots show Segoe UI,
// drawn here in Selawik (its open stand-in, built by ./selawik.py into the assets folder); their code face
// falls to Consolas, drawn in Inconsolata; and their brand serif is Playfair Display Medium alone (its
// bold is the browser's, as in the product), named Aurixa Display so the editorial plates keep their
// own Playfair weights. The website, the trial card and the end card set Inter (a system font here).
const FONTS = [
  ["Playfair Display", [600, 700]],
  ["Playfair Display", [500], "Aurixa Display"],
  ["Inconsolata", [400, 700]],
];
const LOCAL_FONTS = [["Selawik", [400, 600, 700]]];
async function fontFaces() {
  const faces = [];
  for (const [family, weights, as = family] of FONTS)
    for (const weight of weights)
      faces.push(
        `@font-face { font-family: "${as}"; font-weight: ${weight}; src: url("${await googleFont(family, weight)}") format("truetype"); }`,
      );
  for (const [family, weights] of LOCAL_FONTS)
    for (const weight of weights) {
      const file = ASSETS && path.join(ASSETS, `${family}-${weight}.ttf`);
      if (!file || !fs.existsSync(file))
        throw new Error(
          `${family}-${weight}.ttf isn't in the assets folder: build it with selawik.py`,
        );
      faces.push(
        `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url("${dataUrl(file, "font/ttf")}") format("truetype"); }`,
      );
    }
  return faces.join("\n");
}

const css = (faces) => `
${faces}
:root { --navy:#0A192F; --deep:#040B16; --panel:#10233D; --panel2:#15304f; --gold:#C89B3C; --gold2:#D7B35F; --teal:#00A8B5;
  --blue:#1238E8; --white:#FFFFFF; --muted:#B7C1D0; --line:rgba(183,193,208,.16); }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { width:100%; height:100%; background:transparent; font-family:Inter, sans-serif; -webkit-font-smoothing:antialiased; }
.screen { position:absolute; inset:0; overflow:hidden; }
/* Aurixa shell */
.aurixa { background:var(--navy); color:var(--white); display:flex; }
.side { width:330px; background:var(--deep); border-right:1px solid var(--line); padding:40px 28px; display:flex; flex-direction:column; gap:34px; }
.brand { display:flex; align-items:center; gap:16px; }
.emblem { width:58px; height:58px; flex:none; border:2px dashed var(--gold2); border-radius:8px; display:grid; place-items:center;
  color:var(--gold2); font-weight:700; letter-spacing:.02em; background-size:contain; background-repeat:no-repeat; background-position:center; }
.emblem.real { border:none; background-size:contain; background-position:center; background-repeat:no-repeat; }
.wm { color:var(--gold2); font-weight:700; letter-spacing:.32em; font-size:22px; line-height:1.15; }
.wm small { display:block; font-size:12px; letter-spacing:.62em; color:var(--muted); font-weight:600; }
.sublabel { color:var(--teal); font-size:13px; letter-spacing:.24em; font-weight:700; margin-top:-18px; }
.group { display:flex; flex-direction:column; gap:6px; }
.group h6 { font-size:13px; letter-spacing:.2em; color:var(--muted); opacity:.7; font-weight:700; margin-bottom:6px; border-bottom:1px solid rgba(200,155,60,.28); padding-bottom:8px; }
.nav { font-size:22px; color:var(--muted); padding:12px 16px; border-radius:10px; }
.nav.on { background:var(--blue); color:var(--white); font-weight:600; }
.nav.teal.on { background:var(--teal); }
.main { flex:1; display:flex; flex-direction:column; min-width:0; }
.top { height:96px; display:flex; align-items:center; gap:24px; padding:0 44px; border-bottom:1px solid var(--line); }
.search { flex:1; max-width:720px; height:54px; border-radius:12px; background:var(--panel); border:1px solid var(--line); color:var(--muted);
  font-size:21px; display:flex; align-items:center; padding:0 22px; }
.demo { margin-left:auto; font-size:15px; letter-spacing:.14em; font-weight:700; color:var(--gold2); border:1px solid rgba(215,179,95,.55);
  padding:8px 14px; border-radius:999px; text-transform:uppercase; }
.body { flex:1; padding:40px 44px; display:flex; flex-direction:column; gap:30px; min-height:0; }
.banner { border-radius:18px; padding:30px 36px; background:linear-gradient(110deg, #132c4f, #0d2140 60%, #0b1c36);
  border:1px solid rgba(200,155,60,.35); position:relative; }
.eyebrow { font-size:15px; letter-spacing:.26em; color:var(--gold2); font-weight:700; }
.title { font-family:"Playfair Display", serif; font-weight:700; font-size:54px; margin-top:8px; }
.lede { font-size:22px; color:var(--muted); margin-top:8px; }
.btn { display:inline-flex; align-items:center; gap:12px; font-size:22px; font-weight:600; padding:14px 26px; border-radius:12px; background:var(--panel2);
  border:1px solid var(--line); color:var(--white); }
.btn.blue { background:var(--blue); border-color:var(--blue); }
.btn.teal { background:var(--teal); border-color:var(--teal); }
.tabs { display:flex; gap:10px; }
.tab { font-size:22px; padding:14px 24px; border-radius:12px; color:var(--muted); background:var(--panel); border:1px solid var(--line); }
.tab.on { background:var(--blue); color:#fff; border-color:var(--blue); font-weight:600; }
.row { display:flex; gap:24px; align-items:flex-start; }
.card { flex:1; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:28px; display:flex; flex-direction:column; gap:12px; min-width:0; }
.card h3 { font-size:30px; font-weight:600; }
.card p { font-size:20px; color:var(--muted); line-height:1.4; }
.card.sel { border:3px solid var(--blue); background:linear-gradient(180deg, rgba(18,56,232,.38), rgba(18,56,232,.14)); box-shadow:0 0 0 6px rgba(18,56,232,.18); }
.card.tealsel { border:3px solid var(--teal); background:linear-gradient(180deg, rgba(0,168,181,.30), rgba(0,168,181,.10)); }
.kicker { font-size:15px; letter-spacing:.2em; color:var(--gold2); font-weight:700; text-transform:uppercase; }
.pimg { border-radius:12px; background:#2a3b52 center/cover no-repeat; position:relative; overflow:hidden; flex:none; }
.pimg.ph::after { content:attr(data-label); position:absolute; inset:0; display:grid; place-items:center; text-align:center; padding:10px;
  font-size:16px; font-weight:700; letter-spacing:.08em; color:#d6deea; background:repeating-linear-gradient(135deg, #2a3b52 0 14px, #31455f 14px 28px); }
.ctx { display:flex; gap:28px; align-items:center; }
.ctx .name { font-size:34px; font-weight:600; }
.ctx .meta { font-size:20px; color:var(--muted); margin-top:6px; letter-spacing:.04em; }
.pill { display:inline-block; font-size:17px; font-weight:700; padding:7px 14px; border-radius:999px; background:rgba(0,168,181,.18); color:#7fe3ea; letter-spacing:.04em; }
.pill.blue { background:rgba(18,56,232,.28); color:#b9c6ff; }
.pill.gold { background:rgba(200,155,60,.18); color:var(--gold2); }
.list { display:flex; flex-direction:column; gap:12px; }
.item { display:flex; align-items:center; gap:18px; padding:20px 22px; background:var(--panel); border:1px solid var(--line); border-radius:14px; font-size:24px; }
.item .sub { color:var(--muted); font-size:19px; margin-top:4px; }
.item.sel { border:3px solid var(--blue); background:rgba(18,56,232,.24); }
.done { color:#7fe3ea; font-weight:700; }
.grid-bg { background-image:linear-gradient(rgba(0,168,181,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,168,181,.06) 1px, transparent 1px); background-size:48px 48px; }
.cursor { position:absolute; width:46px; height:46px; z-index:9; filter:drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
/* the white report */
.report { background:#fff; color:#0A192F; border-radius:14px; padding:44px 54px; display:flex; flex-direction:column; gap:22px; box-shadow:0 20px 60px rgba(0,0,0,.45); }
.report h2 { font-family:"Playfair Display", serif; font-size:52px; color:#0A192F; }
.report h4 { font-size:22px; letter-spacing:.16em; color:#0A192F; font-weight:800; text-transform:uppercase; }
.report .rule { height:2px; background:linear-gradient(90deg, var(--gold), rgba(200,155,60,.15)); }
.report .lines div { height:14px; border-radius:7px; background:#e6ebf2; margin:12px 0; }
/* the agent panel */
.agent { background:#0c1f39; border:2px solid var(--teal); border-radius:18px; padding:30px; display:flex; flex-direction:column; gap:18px; box-shadow:0 0 0 6px rgba(0,168,181,.12); }
.agent .hd { display:flex; align-items:center; gap:14px; font-size:28px; font-weight:700; }
.agent .dot { width:16px; height:16px; border-radius:50%; background:var(--teal); box-shadow:0 0 12px var(--teal); }
.draft { background:#fff; color:#0A192F; border-radius:12px; padding:24px 26px; font-size:28px; line-height:1.35; }
.draft .lab { font-size:15px; letter-spacing:.18em; color:#5a6b85; font-weight:800; margin-bottom:8px; text-transform:uppercase; }
/* generic, unbranded desktop */
.generic { background:#dfe4ea; color:#1f2937; }
.win { position:absolute; background:#fff; border-radius:12px; box-shadow:0 12px 40px rgba(15,23,42,.18); overflow:hidden; border:1px solid #cfd6df; display:flex; flex-direction:column; }
.win .bar { height:54px; background:#f1f4f7; border-bottom:1px solid #dde3ea; display:flex; align-items:center; gap:10px; padding:0 18px; font-size:22px; font-weight:600; color:#334155; }
.win .bar i { width:14px; height:14px; border-radius:50%; background:#cbd5e1; display:inline-block; }
.win .in { padding:26px; display:flex; flex-direction:column; gap:16px; font-size:22px; color:#334155; flex:1; }
.gl div { height:14px; border-radius:7px; background:#e5e9ef; margin:10px 0; }
.gbtn { align-self:flex-start; background:#2f6fde; color:#fff; font-weight:600; padding:12px 24px; border-radius:10px; font-size:22px; }
.gbtn.off { background:#e2e8f0; color:#475569; }
.note { background:#fff8e1; border:1px solid #f1d58b; border-radius:10px; padding:16px 18px; font-size:21px; color:#5b4a14; }
/* overlays and the closing card */
.phrase { position:absolute; left:100px; right:100px; top:1080px; text-align:center; color:#fff; font-family:"Playfair Display", serif; font-weight:700; font-size:104px;
  text-shadow:0 2px 24px rgba(4,11,22,.65); }
.phrase .ul { display:block; margin:26px auto 0; width:220px; height:4px; border-radius:2px; background:linear-gradient(90deg, transparent, var(--gold2), transparent); }
.close { position:absolute; inset:0; background:linear-gradient(180deg, rgba(10,25,47,0) 0%, rgba(10,25,47,.55) 18%, rgba(10,25,47,.94) 34%, #0A192F 55%, #0A192F 78%, rgba(4,11,22,.96) 100%); }
`;

// On a button the pointer rests at its lower right, clear of the label.
const onButton = () =>
  `<svg class="cursor" style="right:-18px;bottom:-26px" viewBox="0 0 24 24"><path d="M3 2l17 9.5-7.5 1.6L9 21z" fill="#fff" stroke="#0A192F" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const cursor = (x, y) =>
  `<svg class="cursor" style="left:${x}px;top:${y}px" viewBox="0 0 24 24"><path d="M3 2l17 9.5-7.5 1.6L9 21z" fill="#fff" stroke="#0A192F" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const pimg = (w, h, label = "P · Residence 014 image") =>
  P
    ? `<div class="pimg" style="width:${w}px;height:${h}px;background-image:url('${P}')"></div>`
    : `<div class="pimg ph" data-label="${label}" style="width:${w}px;height:${h}px"></div>`;
const dimg = (w, h) =>
  D
    ? `<div class="pimg" style="width:${w}px;height:${h}px;background:#fff url('${D}') center/contain no-repeat"></div>`
    : `<div class="pimg ph" data-label="D · Residence 014 floor plan" style="width:${w}px;height:${h}px"></div>`;
const emblem = (size = 58) =>
  EMBLEM
    ? `<div class="emblem real" style="width:${size}px;height:${size}px;background-image:url('${EMBLEM}')"></div>`
    : `<div class="emblem" style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size / 7))}px">EMBLEM</div>`;
/** The logo's own AURIXA SYSTEMS wordmark at a width, or the typeset one (its sizes in px) until the file is given. */
const wordmark = (width, [big, small, track = ".3em", smallTrack = ".62em", gap = 0]) =>
  WORDMARK
    ? `<img src="${WORDMARK}" style="width:${width}px;height:auto;display:block" alt="AURIXA SYSTEMS">`
    : `<div class="wm" style="font-size:${big}px;letter-spacing:${track};text-align:center">AURIXA<small style="font-size:${small}px;letter-spacing:${smallTrack};margin-top:${gap}px">SYSTEMS</small></div>`;

function shell({ secondary = "", groups, top = "", body, teal = false, grid = false }) {
  const nav = groups
    .map(
      ([h, items]) =>
        `<div class="group">${h ? `<h6>${h}</h6>` : ""}${items
          .map(
            (it) =>
              `<div class="nav${teal ? " teal" : ""}${it.startsWith("*") ? " on" : ""}">${it.replace(/^\*/, "")}</div>`,
          )
          .join("")}</div>`,
    )
    .join("");
  return `<div class="screen aurixa${grid ? " grid-bg" : ""}">
    <aside class="side"><div class="brand">${emblem()}<div class="wm">AURIXA<small>SYSTEMS</small></div></div>
      ${secondary ? `<div class="sublabel">${secondary}</div>` : ""}${nav}</aside>
    <section class="main"><div class="top">${top || `<div class="search">Search properties, clients and matters</div>`}<div class="demo">Demo workspace</div></div>
      <div class="body">${body}</div></section></div>`;
}

const ctxCard = (
  sel = false,
) => `<div class="card${sel ? " sel" : ""}" style="flex:none"><div class="ctx">${pimg(300, 190)}<div>
  <div class="kicker">Prepared context</div><div class="name">Project Banksia / Residence 014</div><div class="meta">BK-014 · Opportunity under consideration</div></div></div></div>`;

// Portal shells, after the pack's reference map (pages 7-8).
const CC = (activeNav, body) =>
  shell({
    groups: [
      ["Overview", ["Dashboard"]],
      ["Intelligence", [activeNav === "reports" ? "*Reports" : "Reports", "Research"]],
      ["Workspace", ["Clients", "Message Hub"]],
    ],
    body,
  });
const SOL = (body) =>
  shell({
    secondary: "SOLICITOR PORTAL",
    groups: [["", ["Dashboard", "*Matters", "Documents", "Tasks", "Message Hub"]]],
    body,
  });
const ACC = (body) =>
  shell({
    secondary: "ACCOUNTANT PORTAL",
    groups: [["", ["Dashboard", "*My Clients", "Tasks", "Message Hub"]]],
    body,
  });
const FIN = (body) =>
  shell({
    secondary: "FINANCE PORTAL",
    groups: [
      ["", ["Dashboard", "*Active Purchase Files", "My Clients", "Message Hub", "Client Inbox"]],
    ],
    body,
  });
const CLI = (body) =>
  shell({
    secondary: "CLIENT PORTAL",
    groups: [["", ["Home", "*My Property Team", "Reports", "Message Hub"]]],
    body,
  });
const BLD = (active, body) =>
  shell({
    secondary: "BUILDER / DEVELOPER PORTAL",
    teal: true,
    grid: true,
    groups: [
      [
        "",
        [
          active === "projects" ? "*Projects" : "Projects",
          active === "stock" ? "*Stock List" : "Stock List",
          "Messages",
          "Tasks",
        ],
      ],
    ],
    body,
  });

const ccReports = (selected) =>
  CC(
    "reports",
    `
  <div class="banner"><div class="eyebrow">AURIXA REPORTING COMMAND CENTER</div><div class="title">Reports</div><div class="lede">Investment report workspace</div></div>
  <div class="tabs"><div class="tab on">Manual</div><div class="tab">URL Extraction</div><div class="tab">PDF Upload</div></div>
  <div class="row">
    <div class="card"><div class="kicker">Property type</div><h3>Existing Property</h3><p>An established home</p></div>
    <div class="card${selected ? " sel" : ""}" style="position:relative"><div class="kicker">Property type</div><h3>New Build</h3><p>A new-build opportunity</p>${selected ? "" : cursor(250, 70)}</div>
    <div class="card"><div class="kicker">Property type</div><h3>Land Only</h3><p>A vacant lot</p></div>
  </div>${selected ? ctxCard(false) : ""}`,
  );

/** The supplied logo, whole: screened onto the card so its black ground becomes the card's own. */
const logoArt = (width, style = "") =>
  LOGO
    ? `<img src="${LOGO}" alt="AURIXA SYSTEMS" style="width:${width}px;height:auto;display:block;mix-blend-mode:screen;
        -webkit-mask-image:radial-gradient(ellipse 50% 50% at 50% 50%, #000 62%, transparent 100%);${style}">`
    : `${emblem(Math.round(width / 5))}${wordmark(Math.round(width / 2), [64, 24])}`;

// The campaign's trial card (10B, 11A): the logo as supplied, the offer, and the saturated-blue CTA,
// set in the website's Inter and in the closing card's capitals. Pressed, the button sinks and takes a gold edge.
const trialCard = (
  pressed,
) => `<div class="screen" style="background:radial-gradient(ellipse 60% 70% at 50% 42%, #0b1a33, #050b16 62%, #000 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:40px;font-family:Inter, sans-serif">
    ${logoArt(1010)}
    <div style="margin-top:-6px;font-size:30px;font-weight:700;letter-spacing:.34em;color:var(--teal);padding-left:.34em">14-DAY FREE TRIAL</div>
    <div style="position:relative;margin-top:34px;font-size:32px;font-weight:800;letter-spacing:.14em;padding:24px 52px 24px calc(52px + .14em);border-radius:14px;color:#fff;
      background:${pressed ? "#0d2bb5" : "var(--blue)"};box-shadow:${pressed ? "inset 0 4px 12px rgba(0,0,0,.5), 0 0 0 4px rgba(215,179,95,.7)" : "0 0 0 2px rgba(0,168,181,.55), 0 10px 40px rgba(18,56,232,.45)"}">
      START YOUR FREE TRIAL${onButton()}</div>
  </div>`;

const generic = (wins) => `<div class="screen generic">${wins}</div>`;
const win = (x, y, w, h, title, inner) =>
  `<div class="win" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="bar"><i></i><i></i><i></i><span style="margin-left:10px">${title}</span></div><div class="in">${inner}</div></div>`;
const lines = (n, widths = []) =>
  `<div class="gl">${Array.from({ length: n }, (_, i) => `<div style="width:${widths[i % (widths.length || 1)] || 90}%"></div>`).join("")}</div>`;

const enquiry = (sent) => `
  <div style="display:flex;gap:24px;align-items:flex-start">${pimg(420, 270)}
  <div style="flex:1;display:flex;flex-direction:column;gap:12px">
    <div style="font-size:20px;color:#64748b">From <b style="color:#1f2937">Jordan Ellis</b> · To <b style="color:#1f2937">Alex Morgan</b></div>
    <div style="font-size:26px;font-weight:700;color:#0f172a">Project Banksia / Residence 014</div>
    <div class="note" style="background:#f8fafc;border-color:#dbe3ec;color:#0f172a;font-size:28px;line-height:1.35">Can we review whether this suits my plans?</div>
    ${sent ? `<div style="font-size:22px;color:#16794b;font-weight:700">✓ Sent</div>` : `<div class="gbtn" style="position:relative">Send${onButton()}</div>`}
  </div></div>`;

const PLATES = {
  // ---- generic, unbranded problem scenes
  "PL-01B-a": {
    size: [1920, 1200],
    html: generic(win(120, 110, 1680, 980, "Message", enquiry(false))),
  },
  "PL-01B-b": {
    size: [1920, 1200],
    html: generic(win(120, 110, 1680, 980, "Message", enquiry(true))),
  },
  "PL-02A": {
    size: [1920, 1080],
    html: generic(
      win(
        40,
        40,
        900,
        470,
        "Research",
        `<div style="font-weight:700">Residence 014 · area notes</div>${lines(6, [92, 80, 86, 70])}`,
      ) +
        win(
          980,
          40,
          900,
          470,
          "Financial worksheet",
          `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${Array.from({ length: 16 }, () => `<div style="height:40px;background:#eef2f6;border-radius:6px"></div>`).join("")}</div>`,
        ) +
        win(
          40,
          550,
          900,
          490,
          "Client details",
          `<div style="font-weight:700">Jordan Ellis</div>${lines(5, [60, 75, 50])}`,
        ) +
        win(
          980,
          550,
          900,
          490,
          "Report draft",
          `<div style="font-weight:700;color:#94a3b8">Untitled report</div><div style="flex:1;border:2px dashed #e2e8f0;border-radius:10px"></div>`,
        ),
    ),
  },
  "PL-03A": {
    size: [1920, 1080],
    html: generic(
      win(
        60,
        60,
        860,
        960,
        "Report draft",
        `<div style="font-weight:700;color:#94a3b8">Untitled report</div><div style="flex:1;border:2px dashed #e2e8f0;border-radius:10px"></div>`,
      ) +
        win(
          980,
          60,
          880,
          960,
          "Property information",
          `<div style="display:flex;gap:18px;align-items:center;background:#eef5ff;border:2px solid #9cc0f5;border-radius:12px;padding:18px">${pimg(200, 130)}<div><div style="font-size:30px;font-weight:700;color:#0f172a">Floor plan received</div><div style="color:#475569">Residence 014</div></div></div>${lines(5, [88, 70, 80])}`,
        ),
    ),
  },
  "PL-03B": {
    size: [1920, 1080],
    html: generic(
      win(260, 120, 1400, 840, "Message", enquiry(true).replace("✓ Sent", "Awaiting reply")),
    ),
  },
  "PL-03C": {
    size: [1920, 1200],
    html: generic(
      win(120, 110, 1680, 980, "Message", enquiry(true).replace("✓ Sent", "Sent · no reply yet")),
    ),
  },
  "PL-09A": {
    size: [1920, 1080],
    html: generic(
      win(
        60,
        60,
        880,
        960,
        "Documents",
        `<div style="font-weight:700">Residence 014 — documents</div>${["Contract of sale (draft)", "Floor plan", "Building specification", "Strata information"].map((t) => `<div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${t}</div>`).join("")}`,
      ) +
        win(
          980,
          60,
          880,
          960,
          "Documents (2)",
          `<div style="font-weight:700">Residence 014 — documents</div>${["Contract of sale (draft)", "Floor plan", "Floor plan (copy)", "Building specification"].map((t, i) => `<div style="padding:14px 16px;background:${i === 2 ? "#fff7ed" : "#f8fafc"};border:1px solid ${i === 2 ? "#fdba74" : "#e2e8f0"};border-radius:8px">${t}</div>`).join("")}`,
        ),
    ),
  },

  // ---- the sign on the glass and the campaign
  "PL-SIGN": {
    size: [1600, 520],
    transparent: true,
    html: `<div class="screen" style="display:flex;align-items:center;justify-content:center;gap:48px">${emblem(260)}
      ${wordmark(760, [96, 40, ".3em", ".66em", 10])}</div>`,
  },

  // ---- Command Center
  "PL-04B-a": { size: [1920, 1080], html: ccReports(false) },
  "PL-04B-b": { size: [1920, 1080], html: ccReports(true) },
  "PL-05A": {
    size: [1920, 1080],
    html: CC(
      "reports",
      `${ctxCard(false)}
      <div class="row"><div class="card sel" style="flex:1.3"><div class="kicker">Research brief</div><h3 style="font-size:44px">Location overview</h3>
        <p style="font-size:24px">Property characteristics</p><p style="font-size:24px">Questions for review</p></div>
        <div class="card"><div class="kicker">Next</div><h3>Financial analysis</h3><p>Prepared for review</p></div></div>`,
    ),
  },
  "PL-05C-a": {
    size: [1920, 1080],
    html: CC(
      "reports",
      `${ctxCard(false)}
      <div class="card" style="flex:none;flex-direction:row;align-items:center;gap:30px"><div style="flex:1"><div class="kicker">Report</div><h3 style="font-size:42px">Client summary</h3><p>Prepared for Jordan Ellis</p></div>
      <div class="btn blue" style="position:relative;font-size:26px">Open preview${onButton()}</div></div>`,
    ),
  },
  "PL-05C-b": {
    size: [1920, 1080],
    html: `<div class="screen aurixa" style="padding:40px 220px;display:block">
      <div class="report" style="height:100%">
        <div style="display:flex;gap:30px;align-items:center">${pimg(340, 210)}<div><div class="kicker" style="color:#9a7424">Project Banksia / Residence 014</div><h2>Client summary</h2></div></div>
        <div class="rule"></div><h4>Key considerations</h4><div class="lines"><div style="width:92%"></div><div style="width:84%"></div></div>
        <div class="rule"></div><h4>Questions for discussion</h4><div class="lines"><div style="width:88%"></div><div style="width:70%"></div></div></div></div>`,
  },
  "PL-06B": {
    size: [1920, 1080],
    html: CC(
      "reports",
      `<div class="row" style="flex:1">
      <div style="flex:1;display:flex;flex-direction:column;gap:24px">${ctxCard(false)}<div class="card"><div class="kicker">Questions for review</div><h3>Residence 014</h3><p>Prepared with the client's enquiry</p></div></div>
      <div class="agent" style="width:700px"><div class="hd"><span class="dot"></span>Aurixa Agent</div>
        <div class="draft"><div class="lab">Draft client summary</div>Discuss the next step</div>
        <div style="display:flex;gap:12px"><span class="pill gold">Review required</span><span class="pill">Question to verify</span></div></div></div>`,
    ),
  },
  "PL-07A-a": {
    size: [1920, 1080],
    html: CC(
      "reports",
      `<div class="row" style="flex:1">
      <div style="flex:1;display:flex;flex-direction:column;gap:24px">${ctxCard(false)}<div class="card"><div class="kicker">Questions for review</div><h3>Residence 014</h3><p>Prepared with the client's enquiry</p></div></div>
      <div class="agent" style="width:700px"><div class="hd"><span class="dot"></span>Aurixa Agent</div>
        <div class="draft" style="outline:3px solid var(--blue)"><div class="lab">Draft client summary</div>Discuss the next step</div>
        <div style="display:flex;gap:12px"><span class="pill gold">Review required</span></div><div class="btn blue" style="align-self:flex-start">Save draft</div></div></div>`,
    ),
  },
  "PL-07A-b": {
    size: [1920, 1080],
    html: CC(
      "reports",
      `<div class="row" style="flex:1">
      <div style="flex:1;display:flex;flex-direction:column;gap:24px">${ctxCard(false)}<div class="card"><div class="kicker">Questions for review</div><h3>Residence 014</h3><p>Prepared with the client's enquiry</p></div></div>
      <div class="agent" style="width:700px"><div class="hd"><span class="dot"></span>Aurixa Agent</div>
        <div class="draft"><div class="lab">Draft client summary</div>Review the remaining questions together</div>
        <div class="done" style="font-size:24px">✓ Draft saved</div></div></div>`,
    ),
  },
  "PL-11A-a": { size: [1920, 1080], html: trialCard(false) },
  "PL-11A-b": { size: [1920, 1080], html: trialCard(true) },
  "PL-11A-c": {
    size: [1920, 1080],
    html: shell({
      groups: [["", ["*Demo workspace", "Projects", "Reports", "Message Hub"]]],
      body: `
      <div class="banner"><div class="eyebrow">DEMO WORKSPACE</div><div class="title">Explore your workspace</div></div>
      <div class="row"><div class="card sel" style="flex:none;width:820px;flex-direction:row;gap:26px;align-items:center">${pimg(320, 210)}<div><div class="kicker">Project</div><h3 style="font-size:38px">Residence 014</h3><p>Project Banksia</p></div></div>
      <div class="card"><div class="kicker">Portals</div><h3>Finance · Legal · Builder · Accounting</h3></div></div>`,
    }),
  },

  // ---- Finance
  "PL-05B": {
    size: [1920, 1080],
    html: FIN(`${ctxCard(false)}
      <div class="tabs"><div class="tab">Purchase file</div><div class="tab on">Scenario comparison</div><div class="tab">Documents</div></div>
      <div class="row"><div class="card"><div class="kicker">Scenario</div><h3 style="font-size:40px">Base case</h3>${lines(2)}</div>
      <div class="card"><div class="kicker" style="color:#7fe3ea">Scenario</div><h3 style="font-size:40px">Alternative case</h3>${lines(2)}</div></div>
      <span class="pill gold" style="align-self:flex-start">Illustrative scenario</span>`),
  },
  "PL-13A-a": {
    size: [1920, 1080],
    html: FIN(`<div class="ctx">${pimg(240, 150)}<div><div class="kicker">Active Purchase Files</div><div class="name">Project Banksia / Residence 014</div></div></div>
      <div class="tabs"><div class="tab on">Scenario comparison</div><div class="tab">Questions for discussion</div></div>
      <div class="row"><div class="card"><div class="kicker">Scenario</div><h3 style="font-size:40px">Base case</h3>${lines(2)}</div>
      <div class="card" style="position:relative"><div class="kicker">Scenario</div><h3 style="font-size:40px">Alternative case</h3>${lines(2)}${cursor(360, 60)}</div></div>
      <span class="pill gold" style="align-self:flex-start">Illustrative scenario</span>`),
  },
  "PL-13A-b": {
    size: [1920, 1080],
    html: FIN(`<div class="ctx">${pimg(240, 150)}<div><div class="kicker">Active Purchase Files</div><div class="name">Project Banksia / Residence 014</div></div></div>
      <div class="tabs"><div class="tab on">Scenario comparison</div><div class="tab">Questions for discussion</div></div>
      <div class="row"><div class="card"><div class="kicker">Scenario</div><h3 style="font-size:40px">Base case</h3>${lines(2)}</div>
      <div class="card sel"><div class="kicker" style="color:#b9c6ff">Scenario · selected</div><h3 style="font-size:40px">Alternative case</h3>${lines(2)}<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,var(--teal),transparent);width:70%"></div></div></div>
      <span class="pill gold" style="align-self:flex-start">Illustrative scenario</span>`),
  },

  // ---- Client
  "PL-06A": {
    size: [1920, 1200],
    html: CLI(`<div class="banner"><div class="eyebrow">WELCOME BACK, JORDAN</div><div class="title" style="font-size:46px">Your property team</div></div>
      <div class="card sel" style="flex:none;padding:26px"><div class="kicker" style="color:#b9c6ff">Your property team · Residence 014</div>
        <div class="row" style="gap:16px">${[
          ["Property", "Alex Morgan"],
          ["Finance", "Jamie Chen"],
          ["Legal", "Priya Shah"],
          ["Builder / Developer", "Daniel Reed"],
          ["Accounting", "Mia Patel"],
        ]
          .map(
            ([r, n]) =>
              `<div class="card" style="padding:20px;background:#0c1f39"><div class="kicker" style="font-size:14px;color:#7fe3ea">${r}</div><h3 style="font-size:25px">${n}</h3></div>`,
          )
          .join("")}</div></div>
      <div class="row"><div class="card" style="flex-direction:row;gap:22px;align-items:center">${pimg(260, 160)}<div><div class="kicker">Your property</div><h3>Project Banksia / Residence 014</h3></div></div>
      <div class="card"><div class="kicker">Next discussion</div><h3>Client summary</h3><p>Questions for discussion</p></div></div>`),
  },

  // ---- Accountant
  "PL-08A-a": {
    size: [1920, 1080],
    html: ACC(`<div class="banner" style="display:flex;align-items:center"><div><div class="eyebrow">WELCOME BACK, MIA</div><div class="title" style="font-size:46px">Needs you next</div></div><div class="btn" style="margin-left:auto">All clients</div></div>
      <div class="list"><div class="item sel" style="position:relative"><div style="flex:1"><div style="font-size:30px;font-weight:600">Supporting information</div><div class="sub">Jordan Ellis · Residence 014</div></div><div class="btn blue" style="position:relative">Mark reviewed${onButton()}</div></div>
      <div class="item"><div style="flex:1">Recently allocated<div class="sub">Client documents</div></div></div></div>`),
  },
  "PL-08A-b": {
    size: [1920, 1080],
    html: ACC(`<div class="banner" style="display:flex;align-items:center"><div><div class="eyebrow">WELCOME BACK, MIA</div><div class="title" style="font-size:46px">Needs you next</div></div><div class="btn" style="margin-left:auto">All clients</div></div>
      <div class="list"><div class="item" style="border:3px solid var(--teal)"><div style="flex:1"><div style="font-size:30px;font-weight:600">Supporting information</div><div class="sub">Jordan Ellis · Residence 014</div></div><div class="done" style="font-size:28px">✓ Reviewed</div></div>
      <div class="item"><div style="flex:1">Recently allocated<div class="sub">Client documents</div></div></div></div>`),
  },
  "PL-08B": {
    size: [1920, 1080],
    html: `<div class="screen aurixa" style="padding:50px 160px;display:block"><div class="report" style="height:100%">
      <div style="display:flex;gap:30px;align-items:center">${pimg(300, 190)}<div><div class="kicker" style="color:#9a7424">Residence 014</div><h2>Client summary</h2></div></div>
      <div class="rule"></div><h4>Key considerations</h4><div class="lines"><div style="width:90%"></div><div style="width:78%"></div></div>
      <div class="rule"></div><h4>Questions for discussion</h4><div class="lines"><div style="width:86%"></div><div style="width:64%"></div></div></div></div>`,
  },

  // ---- Solicitor
  "PL-09B": {
    size: [1920, 1080],
    html: SOL(`<div class="banner" style="display:flex;align-items:center"><div><div class="eyebrow">WELCOME BACK, PRIYA</div><div class="title" style="font-size:46px">Open matters</div></div><div class="btn blue" style="margin-left:auto">Open matters</div></div>
      <div class="row"><div class="list" style="flex:1.2"><div class="item sel">${pimg(130, 84)}<div><div style="font-size:28px;font-weight:600">Project Banksia / Residence 014</div><div class="sub">Opportunity under consideration</div></div></div>
        <div class="item" style="opacity:.6">Other matter<div class="sub" style="margin-left:auto">Review</div></div></div>
      <div class="card"><div class="kicker">Residence 014</div><h3>Document review</h3><p>Contract of sale · Floor plan · Specification</p><span class="pill blue" style="align-self:flex-start">Next discussion</span></div></div>`),
  },
  "PL-12B-a": {
    size: [1920, 1080],
    html: SOL(`<div class="row" style="flex:1"><div class="card" style="flex:1.25;align-items:center;justify-content:center">${dimg(860, 560)}</div>
      <div class="card"><div class="kicker">Residence 014 · document review</div><div class="draft" style="font-size:30px"><div class="lab">Note</div>Discuss the remaining document questions.</div>
      <div class="btn blue" style="align-self:flex-start;position:relative">Save note${onButton()}</div></div></div>`),
  },
  "PL-12B-b": {
    size: [1920, 1080],
    html: SOL(`<div class="row" style="flex:1"><div class="card" style="flex:1.25;align-items:center;justify-content:center">${dimg(860, 560)}</div>
      <div class="card"><div class="kicker">Residence 014 · document review</div><div class="draft" style="font-size:30px"><div class="lab">Note</div>Discuss the remaining document questions.</div>
      <div class="done" style="font-size:26px">✓ Note saved</div><span class="pill blue" style="align-self:flex-start">Matter remains under review</span></div></div>`),
  },

  // ---- Builder / Developer
  "PL-12A-a": {
    size: [1920, 1080],
    html: BLD(
      "stock",
      `<div class="banner" style="border-color:rgba(0,168,181,.45)"><div class="eyebrow" style="color:var(--teal)">PROJECTS · STOCK LIST</div><div class="title" style="font-size:46px">Project Banksia</div></div>
      <div class="list"><div class="item tealsel" style="border:3px solid var(--teal);background:rgba(0,168,181,.16);position:relative">${pimg(150, 96)}<div style="flex:1"><div style="font-size:30px;font-weight:600">Residence 014</div><div class="sub">Floor plan · Specification</div></div>${cursor(1080, 30)}</div>
      <div class="item" style="opacity:.55">Residence 015</div><div class="item" style="opacity:.55">Residence 016</div></div>`,
    ),
  },
  "PL-12A-b": {
    size: [1920, 1080],
    html: BLD(
      "stock",
      `<div class="row" style="flex:1"><div class="card" style="flex:1.5;align-items:center;justify-content:center;border:3px solid var(--teal)">${dimg(1000, 640)}</div>
      <div class="card"><div class="kicker" style="color:var(--teal)">Floor plan</div><h3>Residence 014</h3><p>Project Banksia</p></div></div>`,
    ),
  },

  // ---- Block 14 phrases and the closing card (1080 x 1920, transparent)
  ...Object.fromEntries(
    ["Fourteen days.", "Your business.", "Your experience.", "Your decision."].map((text, i) => [
      `PL-14A-${i + 1}`,
      {
        size: [1080, 1920],
        transparent: true,
        html: `<div class="screen"><div class="phrase">${text}<span class="ul"></span></div></div>`,
      },
    ]),
  ),
  "PL-15A": {
    size: [1080, 1920],
    transparent: true,
    html: `<div class="screen" style="font-family:Inter, sans-serif"><div class="close"></div>
      <div style="position:absolute;left:0;right:0;top:600px;display:flex;flex-direction:column;align-items:center;gap:36px;text-align:center">
        ${logoArt(1000, "margin:-40px 0 -70px")}
        <div style="font-family:'Playfair Display',serif;font-weight:600;font-size:46px;line-height:1.25;color:#fff;padding:0 100px">The operating system for modern property professionals.</div>
        <div style="height:2px;width:260px;background:linear-gradient(90deg,transparent,var(--gold2),transparent)"></div>
        <div style="font-size:34px;font-weight:800;letter-spacing:.28em;color:var(--teal)">14-DAY FREE TRIAL</div>
        <div class="btn blue" style="font-size:36px;font-weight:800;letter-spacing:.12em;padding:26px 46px;border-radius:16px;box-shadow:0 0 0 2px rgba(0,168,181,.6)">START YOUR FREE TRIAL</div>
        <div style="font-size:32px;color:var(--muted);letter-spacing:.06em">aurixasystems.com.au</div>
      </div></div>`,
  },
};

// v2 portals: the plates they replace (one state became two) go, the rest are overwritten.
const portals = require("./portals.cjs")({ P, D, EMBLEM });
for (const key of ["PL-05A", "PL-05B", "PL-06A", "PL-06B", "PL-09B"]) delete PLATES[key];
Object.assign(PLATES, portals.plates);

(async () => {
  const CSS = css(await fontFaces()) + portals.css;
  const { chromium } = playwright();
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  // A plate drawn at a smaller CSS size and rendered at its scale, so its type is phone-sized.
  const pages = new Map();
  for (const [key, plate] of Object.entries(PLATES)) {
    const scale = plate.scale ?? 1;
    if (!pages.has(scale))
      pages.set(scale, await (await browser.newContext({ deviceScaleFactor: scale })).newPage());
    const page = pages.get(scale);
    const [width, height] = plate.size;
    await page.setViewportSize({
      width: Math.round(width / scale),
      height: Math.round(height / scale),
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${plate.html}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(OUT, `${key}.png`),
      omitBackground: !!plate.transparent,
    });
  }
  await browser.close();
  console.log(Object.keys(PLATES).length, "plates →", OUT);
})();
