// The Aurixa portal plates (v2), built on the shells of the supplied portal screenshots: the
// Solicitor, Accountant, Finance, Client and Builder / Developer portals (the Command Center
// follows the same family until its screenshot is supplied). Structure only: every name, value,
// address and account detail is the reel's fictional material, and the brand is AURIXA SYSTEMS.
//
// Drawn at 1280 x 720 (or 800) CSS pixels and rendered at 1.5x, so a plate is 1920 wide and its
// type reads at phone size once it is on a monitor in a 9:16 frame.

const SCALE = 1.5;

const CSS = `
.pt { position:absolute; inset:0; display:flex; color:#fff; font-family:"Plus Jakarta Sans", Inter, sans-serif; overflow:hidden;
  background: radial-gradient(1100px 520px at 88% -8%, rgba(32,52,150,.42), transparent 62%), #08090c; }
.pt .side { width:226px; flex:none; background:#0c0d11; border-right:1px solid rgba(255,255,255,.06); padding:0; display:flex; flex-direction:column; gap:0; }
.pt .brand { height:66px; display:flex; align-items:center; gap:10px; padding:0 16px; border-bottom:1px solid rgba(255,255,255,.06); }
.pt .brand .t { font-size:12.5px; font-weight:800; letter-spacing:.07em; line-height:1.2; }
.pt .brand .s { font-size:8.5px; font-weight:600; letter-spacing:.16em; color:#8d95a8; margin-top:3px; }
.pt .brand .bell { margin-left:auto; opacity:.8; }
.pt .who { margin:12px; padding:12px; border-radius:12px; background:linear-gradient(135deg,#16181f,#101218); border:1px solid rgba(255,255,255,.06); display:flex; gap:10px; align-items:center; }
.pt .av { width:32px; height:32px; flex:none; border-radius:50%; background:#111a48; color:#4767ff; font-size:11px; font-weight:800; display:grid; place-items:center; }
.pt .who .n { font-size:12.5px; font-weight:700; }
.pt .who .o { font-size:10.5px; color:#8d95a8; margin-top:2px; }
.pt nav { padding:4px 8px; display:flex; flex-direction:column; gap:3px; }
.pt nav h6 { font-size:8.5px; letter-spacing:.18em; color:#6f778a; font-weight:700; margin:12px 10px 4px; padding-bottom:5px; border-bottom:1px solid rgba(200,155,60,.30); }
.pt nav a { height:38px; display:flex; align-items:center; gap:11px; padding:0 12px; border-radius:10px; font-size:12.5px; font-weight:500; color:#c3c8d4; position:relative; }
.pt nav a svg { width:15px; height:15px; flex:none; opacity:.85; }
.pt nav a.on { background:linear-gradient(90deg,#2147ff,#1238E8); color:#fff; font-weight:700; }
.pt .main { flex:1; min-width:0; display:flex; flex-direction:column; }
.pt .top { height:46px; flex:none; display:flex; align-items:center; gap:14px; padding:0 24px; border-bottom:1px solid rgba(255,255,255,.06);
  background:linear-gradient(90deg,#0e0f13,#121318); }
.pt .top .me { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:12px; font-weight:700; }
.pt .top .av { width:26px; height:26px; font-size:9.5px; }
.pt .search { height:30px; min-width:300px; border-radius:8px; background:#14161c; border:1px solid rgba(255,255,255,.08); color:#8d95a8; font-size:11.5px; display:flex; align-items:center; gap:8px; padding:0 12px; }
.pt .kbd { margin-left:auto; font-size:10px; color:#aab; border:1px solid rgba(255,255,255,.15); border-radius:5px; padding:1px 5px; }
.pt .demo { font-size:9px; letter-spacing:.16em; font-weight:800; color:#D7B35F; border:1px solid rgba(215,179,95,.5); border-radius:999px; padding:4px 9px; }
.pt .body { flex:1; min-height:0; padding:24px 34px; display:flex; flex-direction:column; gap:16px; }
.pt .banner { border-radius:14px; border:1px solid rgba(64,96,255,.30); background:linear-gradient(120deg,#141c37,#0e1328 70%); padding:22px 26px; display:flex; align-items:center; gap:20px; }
.pt .eb { font-size:9.5px; letter-spacing:.2em; color:#3556f0; font-weight:800; display:flex; gap:6px; align-items:center; }
.pt .h1 { font-size:27px; font-weight:800; letter-spacing:-.01em; margin-top:6px; }
.pt .sub { font-size:12.5px; color:#9aa3b5; margin-top:6px; }
.pt .btn { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; padding:9px 14px; border-radius:8px; background:#1238E8; color:#fff; position:relative; white-space:nowrap; }
.pt .btn.ghost { background:#14161c; border:1px solid rgba(255,255,255,.14); }
.pt .btn.teal { background:#0fa3a9; color:#fff; }
.pt .row { display:flex; gap:12px; align-items:stretch; }
.pt .stat { flex:1; border-radius:12px; background:#0f1015; border:1px solid rgba(255,255,255,.07); padding:16px; display:flex; gap:12px; align-items:center; min-width:0; }
.pt .tile { width:36px; height:36px; flex:none; border-radius:8px; background:#121a40; display:grid; place-items:center; }
.pt .tile svg { width:16px; height:16px; }
.pt .stat .v { font-size:19px; font-weight:800; }
.pt .stat .l { font-size:11px; color:#9aa3b5; margin-top:2px; }
.pt .panel { border-radius:14px; background:#0f1015; border:1px solid rgba(255,255,255,.07); padding:18px 20px; display:flex; flex-direction:column; gap:12px; min-width:0; }
.pt .ph { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:800; }
.pt .ph svg { width:15px; height:15px; }
.pt .ps { font-size:11.5px; color:#9aa3b5; margin-top:-6px; }
.pt .line { display:flex; align-items:center; gap:12px; border-radius:10px; background:#121318; border:1px solid rgba(255,255,255,.07); padding:12px 14px; position:relative; }
.pt .line .a { font-size:13.5px; font-weight:700; }
.pt .line .b { font-size:11px; color:#9aa3b5; margin-top:3px; }
.pt .line.sel { border:2px solid #1238E8; background:linear-gradient(90deg, rgba(18,56,232,.30), rgba(18,56,232,.10)); }
.pt .pill { margin-left:auto; font-size:10px; font-weight:700; border-radius:999px; padding:3px 9px; border:1px solid rgba(255,255,255,.18); color:#cfd5e2; white-space:nowrap; }
.pt .pill.ok { color:#45d58a; border-color:rgba(69,213,138,.45); background:rgba(69,213,138,.08); }
.pt .pill.teal { color:#5fe0e8; border-color:rgba(0,168,181,.5); background:rgba(0,168,181,.10); }
.pt .pill.gold { color:#D7B35F; border-color:rgba(215,179,95,.5); background:rgba(200,155,60,.08); }
.pt .tabs { display:flex; gap:6px; }
.pt .tab { font-size:12.5px; font-weight:600; color:#aab2c3; padding:8px 14px; border-radius:9px; background:#121318; border:1px solid rgba(255,255,255,.08); position:relative; }
.pt .tab.on { background:#1238E8; color:#fff; border-color:#1238E8; font-weight:700; }
.pt .card { flex:1; border-radius:12px; background:#101118; border:1px solid rgba(255,255,255,.08); padding:16px 18px; display:flex; flex-direction:column; gap:7px; position:relative; min-width:0; }
.pt .card .k { font-size:9px; letter-spacing:.18em; font-weight:800; color:#D7B35F; }
.pt .card .t { font-size:18px; font-weight:800; }
.pt .card .d { font-size:11.5px; color:#9aa3b5; line-height:1.45; }
.pt .card.sel { border:2px solid #1238E8; background:linear-gradient(180deg, rgba(18,56,232,.34), rgba(18,56,232,.10)); box-shadow:0 0 0 4px rgba(18,56,232,.14); }
.pt .card.tsel { border:2px solid #00A8B5; background:linear-gradient(180deg, rgba(0,168,181,.22), rgba(0,168,181,.06)); }
.pt .hero .t { font-size:30px; }
.pt .bars div { height:7px; border-radius:4px; background:#1b1d25; margin:7px 0; }
.pt .ok { color:#5fe0e8; font-weight:800; }
.pt .pimg { border-radius:9px; background:#22324a center/cover no-repeat; position:relative; overflow:hidden; flex:none; }
.pt .pimg.pph::after { content:attr(data-label); position:absolute; inset:0; display:grid; place-items:center; text-align:center; padding:6px; font-size:10px; font-weight:700;
  letter-spacing:.06em; color:#d6deea; background:repeating-linear-gradient(135deg,#22324a 0 9px,#2a3c57 9px 18px); }
.pt .emb { flex:none; border:1.5px dashed #D7B35F; border-radius:6px; display:grid; place-items:center; color:#D7B35F; font-weight:800; font-size:6.5px; letter-spacing:.04em;
  background-size:contain; background-repeat:no-repeat; background-position:center; }
.pt .emb.real { border:none; }
.pt .cur { position:absolute; width:24px; height:24px; z-index:9; filter:drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.pt .fab { position:absolute; right:26px; bottom:22px; width:44px; height:44px; border-radius:50%; background:#1238E8; display:grid; place-items:center; font-size:22px; font-weight:400; }
/* Finance: a page heading rather than a banner, and serif card titles */
.fin .welcome { font-size:26px; font-weight:800; letter-spacing:-.01em; }
.fin .welcome span { color:#3556f0; }
.fin .sec { font-size:10.5px; letter-spacing:.14em; font-weight:700; color:#aab2c3; }
.serif { font-family:"Playfair Display", serif !important; font-weight:700 !important; letter-spacing:0 !important; }
/* Client: a narrow menu and a centred column */
.cli .side { width:170px; }
.cli .brand { height:50px; padding:0 10px; }
.cli .brand .t { font-size:9.5px; letter-spacing:.04em; white-space:nowrap; }
.cli .brand .s { font-size:7px; }
.cli .who { margin:8px; padding:9px; }
.cli .who .n { font-size:10.5px; }
.cli .who .o { font-size:8.5px; }
.cli nav a { height:28px; font-size:10px; gap:8px; padding:0 9px; border-radius:7px; }
.cli nav a svg { width:12px; height:12px; }
.cli .body { align-items:center; padding:18px 24px; }
.cli .col { width:100%; max-width:720px; display:flex; flex-direction:column; gap:12px; }
.cli .team { display:flex; align-items:center; gap:12px; border-radius:12px; background:#0d0f16; border:1px solid rgba(64,96,255,.20); padding:12px 14px; position:relative; }
.cli .dots { display:flex; }
.cli .dots i { width:24px; height:24px; border-radius:50%; background:#1238E8; border:2px solid #0d0f16; margin-left:-6px; display:grid; place-items:center; }
.cli .dots i:first-child { margin-left:0; }
.cli .mini { flex:1; border-radius:10px; background:#0f1015; border:1px solid rgba(255,255,255,.07); padding:12px; }
.cli .mini .k { font-size:7.5px; letter-spacing:.14em; color:#8d95a8; font-weight:700; }
.cli .mini .v { font-size:14px; font-weight:800; margin-top:4px; }
/* Builder / Developer: navy-teal on a fine grid, serif headings, monospaced labels */
.bld { background:linear-gradient(rgba(0,168,181,.05) 1px, transparent 1px) 0 0/34px 34px, linear-gradient(90deg, rgba(0,168,181,.05) 1px, transparent 1px) 0 0/34px 34px,
  radial-gradient(900px 500px at 70% 0%, rgba(0,120,140,.30), transparent 60%), #08151d; }
.bld .side { background:linear-gradient(180deg,#0d2230,#0a1720); border-right-color:rgba(0,168,181,.12); }
.bld .brand, .bld .top { border-color:rgba(0,168,181,.12); }
.bld .top { background:linear-gradient(90deg,#0b1d28,#0c1a24); }
.bld .mono { font-family:"JetBrains Mono", monospace; letter-spacing:.2em; font-size:8.5px; font-weight:700; color:#7f97a3; }
.bld .chips { display:flex; gap:6px; margin-top:8px; }
.bld .chips span { font-family:"JetBrains Mono", monospace; font-size:7px; letter-spacing:.08em; font-weight:700; border:1px solid rgba(255,255,255,.18); border-radius:5px; padding:3px 6px; }
.bld .who { flex-direction:column; align-items:flex-start; background:linear-gradient(135deg,#112b3a,#0d2230); border-color:rgba(0,168,181,.15); }
.bld .av { background:#0d3a44; color:#33c6cf; }
.bld nav a.on { background:rgba(0,168,181,.14); color:#fff; font-weight:700; }
.bld nav a.on::before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:2px; background:#00A8B5; }
.bld .banner { border-color:rgba(0,168,181,.35); background:linear-gradient(120deg,#0e2f3c,#0b2230 70%); }
.bld .eb { color:#20b8c2; font-family:"JetBrains Mono", monospace; }
.bld .h1 { font-family:"Playfair Display", serif; font-weight:700; font-size:30px; }
.bld .panel, .bld .stat, .bld .line, .bld .card { background:rgba(12,30,40,.85); border-color:rgba(0,168,181,.14); }
.bld .line.sel, .bld .card.tsel { border:2px solid #00A8B5; background:linear-gradient(90deg, rgba(0,168,181,.24), rgba(0,168,181,.06)); }
.bld .ph { font-family:"Playfair Display", serif; font-weight:700; font-size:15px; }
.bld .info { display:grid; grid-template-columns:1fr 1fr; border:1px solid rgba(0,168,181,.18); border-radius:10px; overflow:hidden; min-width:330px; }
.bld .info div { padding:9px 12px; border-right:1px solid rgba(0,168,181,.12); border-bottom:1px solid rgba(0,168,181,.12); }
.bld .info b { display:block; font-size:11.5px; margin-top:3px; }
/* the white report page inside a portal */
.pt .page { background:#fff; color:#0A192F; border-radius:10px; padding:22px 26px; display:flex; flex-direction:column; gap:12px; box-shadow:0 14px 40px rgba(0,0,0,.45); }
.pt .page h2 { font-family:"Playfair Display", serif; font-size:30px; }
.pt .page h4 { font-size:11px; letter-spacing:.16em; font-weight:800; text-transform:uppercase; }
.pt .page .rule { height:1.5px; background:linear-gradient(90deg,#C89B3C,rgba(200,155,60,.15)); }
.pt .page .bars div { background:#e6ebf2; height:8px; }
/* the agent panel inside a portal */
.pt .agent { width:380px; flex:none; border-radius:14px; background:#0b1a33; border:1.5px solid #00A8B5; box-shadow:0 0 0 4px rgba(0,168,181,.12); padding:18px; display:flex; flex-direction:column; gap:12px; }
.pt .agent .hd { display:flex; align-items:center; gap:9px; font-size:16px; font-weight:800; }
.pt .agent .dot { width:10px; height:10px; border-radius:50%; background:#00A8B5; box-shadow:0 0 10px #00A8B5; }
.pt .draft { background:#fff; color:#0A192F; border-radius:10px; padding:14px 16px; font-size:17px; font-weight:600; line-height:1.35; position:relative; }
.pt .draft .lab { font-size:8.5px; letter-spacing:.18em; color:#5a6b85; font-weight:800; margin-bottom:6px; text-transform:uppercase; }
.pt .draft.editing { outline:2px solid #1238E8; }
.pt .draft.editing::after { content:""; display:inline-block; width:2px; height:18px; background:#1238E8; margin-left:2px; vertical-align:-3px; }
.pt .launcher { position:absolute; right:24px; bottom:22px; display:flex; align-items:center; gap:8px; border-radius:999px; padding:10px 16px; background:#0b1a33; border:1.5px solid #00A8B5;
  font-size:13px; font-weight:800; box-shadow:0 0 0 4px rgba(0,168,181,.10); }
`;

// Line icons (Lucide-style), 24 x 24.
const I = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v6M12 7v10M16 7v4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  tasks: '<path d="M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M4 20h16"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.5 2.6 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6M20 5v6h-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h9v9M12 3v6h9"/>',
  spark:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
};
const icon = (name, color = "currentColor", w = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
const tile = (name, bg = "#121a40", color = "#4767ff") =>
  `<div class="tile" style="background:${bg}">${icon(name, color)}</div>`;
const arrow = () =>
  `<span style="display:inline-flex;width:14px;height:14px">${icon("arrow", "#fff", 2.2)}</span>`;
const cur = (style) =>
  `<svg class="cur" style="${style}" viewBox="0 0 24 24"><path d="M3 2l17 9.5-7.5 1.6L9 21z" fill="#fff" stroke="#0A192F" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
// A pointer resting at a control's lower right, clear of its label.
const onIt = () => cur("right:-12px;bottom:-16px");

module.exports = function portals({ P, D, EMBLEM }) {
  const pimg = (w, h, label = "P · Residence 014") =>
    P
      ? `<div class="pimg" style="width:${w}px;height:${h}px;background-image:url('${P}')"></div>`
      : `<div class="pimg pph" data-label="${label}" style="width:${w}px;height:${h}px"></div>`;
  const dimg = (w, h) =>
    D
      ? `<div class="pimg" style="width:${w}px;height:${h}px;background:#fff url('${D}') center/contain no-repeat"></div>`
      : `<div class="pimg pph" data-label="D · Residence 014 floor plan" style="width:${w}px;height:${h}px"></div>`;
  const emb = (size) =>
    EMBLEM
      ? `<div class="emb real" style="width:${size}px;height:${size}px;background-image:url('${EMBLEM}')"></div>`
      : `<div class="emb" style="width:${size}px;height:${size}px;font-size:${Math.max(4.5, size / 6.5)}px">EMBLEM</div>`;

  const nav = (items) =>
    items
      .map((it) =>
        typeof it === "string" && it.startsWith("#")
          ? `<h6>${it.slice(1)}</h6>`
          : `<a class="${it[2] ? "on" : ""}">${icon(it[0])}${it[1]}${it[3] || ""}</a>`,
      )
      .join("");

  /** A portal: the sidebar (brand, who is signed in, menu), the top bar and the page. */
  function shell({
    kind = "",
    label,
    who,
    org,
    initials,
    items,
    top,
    body,
    extra = "",
    chips = "",
  }) {
    return `<div class="pt ${kind}">
      <aside class="side">
        <div class="brand">${emb(kind === "cli" ? 24 : 30)}<div><div class="t">AURIXA SYSTEMS</div><div class="s ${kind === "bld" ? "mono" : ""}">${label}</div></div>
          <span class="bell" style="width:14px;height:14px;display:inline-flex">${icon("bell", "#aab")}</span></div>
        <div class="who"><div style="display:flex;gap:10px;align-items:center"><div class="av">${initials}</div><div><div class="n">${who}</div><div class="o">${org}</div></div></div>${chips}</div>
        <nav>${nav(items)}</nav>
      </aside>
      <section class="main">
        <div class="top">${top || ""}<div class="me"><span class="demo">Demo workspace</span><span style="width:15px;height:15px;display:inline-flex">${icon("bell", "#aab")}</span><div class="av">${initials}</div>${who}</div></div>
        <div class="body">${body}</div>
      </section>${extra}
    </div>`;
  }

  // ---------------------------------------------------------------- Command Center (Alex)
  const ccItems = (on) => [
    "#OVERVIEW",
    ["grid", "Dashboard", on === "dash"],
    "#INTELLIGENCE",
    ["file", "Reports", on === "reports"],
    ["search", "Research", on === "research"],
    ["chart", "Financial Modelling", false],
    "#CLIENTS",
    ["users", "Clients", false],
    ["chat", "Message Hub", false],
    "#GOVERNANCE",
    ["shield", "Compliance", false],
  ];
  const cc = (on, body, extra) =>
    shell({
      label: "COMMAND CENTER",
      who: "Alex Morgan",
      org: "Property adviser",
      initials: "AM",
      items: ccItems(on),
      top: `<div class="search">${'<span style="width:13px;height:13px;display:inline-flex">' + icon("search", "#8d95a8") + "</span>"}Search properties, clients and reports</div>`,
      body,
      extra,
    });
  const ccBanner = `<div class="banner"><div style="flex:1"><div class="eb">${'<span style="width:11px;height:11px;display:inline-flex">' + icon("file", "#3556f0") + "</span>"}AURIXA REPORTING COMMAND CENTER</div>
      <div class="h1">Reports</div><div class="sub">Investment report workspace</div></div></div>`;
  const ccTypes = (
    selected,
  ) => `<div class="tabs"><div class="tab on">Manual</div><div class="tab">URL Extraction</div><div class="tab">PDF Upload</div></div>
    <div class="row">
      <div class="card"><div class="k">PROPERTY TYPE</div><div class="t">Existing Property</div><div class="d">An established home</div></div>
      <div class="card ${selected ? "sel" : ""}"><div class="k">PROPERTY TYPE</div><div class="t">New Build</div><div class="d">A new-build opportunity</div>${selected ? "" : cur("left:58%;top:56%")}</div>
      <div class="card"><div class="k">PROPERTY TYPE</div><div class="t">Land Only</div><div class="d">A vacant lot</div></div>
    </div>`;
  const ccContext = (
    big = false,
  ) => `<div class="card" style="flex:none;flex-direction:row;gap:18px;align-items:center">${pimg(big ? 230 : 170, big ? 144 : 106)}
    <div><div class="k">PREPARED CONTEXT</div><div class="t" style="font-size:${big ? 26 : 20}px">Project Banksia / Residence 014</div><div class="d">BK-014 · Opportunity under consideration</div></div></div>`;
  const research = (open) => `${ccContext(true)}<div class="row">
    <div class="card ${open ? "sel hero" : ""}" style="flex:1.4">${
      open
        ? `<div class="k" style="color:#b9c6ff">RESEARCH BRIEF</div><div class="t">Location overview</div><div class="d" style="font-size:13px">Property characteristics</div><div class="d" style="font-size:13px">Questions for review</div>`
        : `<div class="k">RESEARCH BRIEF</div><div class="t">Research brief</div><div class="d">Location overview · Property characteristics · Questions for review</div>${cur("left:44%;top:58%")}`
    }</div>
    <div class="card"><div class="k">NEXT</div><div class="t">Financial analysis</div><div class="d">Prepared for review</div></div></div>`;
  const agentRecord = `${ccContext(false)}<div class="card"><div class="k">QUESTIONS FOR REVIEW</div><div class="t">Residence 014</div><div class="d">Prepared with the client's enquiry</div><div class="bars"><div style="width:86%"></div><div style="width:64%"></div></div></div>`;
  const agentPanel = (
    state,
  ) => `<div class="agent"><div class="hd"><span class="dot"></span>Aurixa Agent</div>
    <div class="draft ${state === "editing" ? "editing" : ""}"><div class="lab">Draft client summary</div>${state === "saved" ? "Review the remaining questions together" : "Discuss the next step"}</div>
    ${
      state === "saved"
        ? `<div class="ok" style="font-size:14px">✓ Draft saved</div>`
        : `<div style="display:flex;gap:8px"><span class="pill gold" style="margin-left:0">Review required</span><span class="pill teal" style="margin-left:0">Question to verify</span></div>
         ${state === "editing" ? `<div class="btn" style="align-self:flex-start">Save draft</div>` : ""}`
    }</div>`;

  // ---------------------------------------------------------------- Finance (Jamie)
  const finItems = (on) => [
    ["grid", "Dashboard", false],
    ["shield", "AML/CTF Compliance", false],
    ["case", "Active Purchase Files", on === "files"],
    ["layers", "Pipeline Kanban", false],
    ["users", "My Clients", false],
    ["chat", "Message Hub", false],
    ["inbox", "Client Inbox", false],
  ];
  const fin = (body) =>
    shell({
      kind: "fin",
      label: "FINANCE PORTAL",
      who: "Jamie Chen",
      org: "Finance partner",
      initials: "JC",
      items: finItems("files"),
      top: `<div class="search">${'<span style="width:13px;height:13px;display:inline-flex">' + icon("search", "#8d95a8") + "</span>"}Search…<span class="kbd">⌘K</span></div>`,
      body,
      extra: `<div class="fab">+</div>`,
    });
  const finHead = `<div><div class="welcome">Welcome back, <span>Jamie</span></div><div class="sub" style="margin-top:4px">Finance partner · Demo workspace</div></div>`;
  const purchaseFile = (tab, body) => `${finHead}<div class="panel" style="flex:1">
      <div style="display:flex;align-items:center;gap:14px">${pimg(150, 94)}<div><div class="sec">ACTIVE PURCHASE FILE</div>
        <div class="serif" style="font-size:22px;margin-top:4px">Project Banksia / Residence 014</div><div class="sub" style="margin-top:2px">Jordan Ellis · Opportunity under consideration</div></div></div>
      <div class="tabs">${["Overview", "Scenario comparison", "Documents"].map((t) => `<div class="tab ${t === tab ? "on" : ""}">${t}${tab === "Overview" && t === "Scenario comparison" ? onIt() : ""}</div>`).join("")}</div>
      ${body}</div>`;
  const scenarios = (selected, pointer) => `<div class="row">
      <div class="card"><div class="k">SCENARIO</div><div class="t serif" style="font-size:22px">Base case</div><div class="bars"><div style="width:80%"></div><div style="width:58%"></div></div></div>
      <div class="card ${selected ? "sel" : ""}"><div class="k" style="${selected ? "color:#b9c6ff" : ""}">SCENARIO${selected ? " · SELECTED" : ""}</div><div class="t serif" style="font-size:22px">Alternative case</div>
        <div class="bars"><div style="width:72%;${selected ? "background:linear-gradient(90deg,#00A8B5,#1b1d25)" : ""}"></div><div style="width:50%"></div></div>${pointer ? cur("left:62%;top:52%") : ""}</div>
    </div><div style="display:flex;gap:8px"><span class="pill gold" style="margin-left:0">Illustrative scenario</span><span class="pill" style="margin-left:0">Questions for discussion</span></div>`;

  // ---------------------------------------------------------------- Client (Jordan)
  const cliItems = (on) => [
    ["home", "Dashboard", on === "dash"],
    ["shield", "Identity & Compliance", false],
    ["user", "My Profile", false],
    ["trend", "Deal Progress", false],
    ["users", "My Property Team", on === "team", on === "dash" ? cur("left:62%;top:58%") : ""],
    ["tasks", "Action Items", false],
    ["case", "Finance Hub", false],
    ["building", "Properties", false],
    ["file", "Documents", false],
    ["file", "Reports", false],
    ["chat", "Message Hub", false],
    ["bell", "Notifications", false],
    ["calendar", "My Appointments", false],
  ];
  const cli = (on, body) =>
    shell({
      kind: "cli",
      label: "CLIENT PORTAL",
      who: "Jordan Ellis",
      org: "Client",
      initials: "JE",
      items: cliItems(on),
      body: `<div class="col">${body}</div>`,
    });
  const roles = [
    ["Property", "Alex Morgan"],
    ["Finance", "Jamie Chen"],
    ["Legal", "Priya Shah"],
    ["Builder / Developer", "Daniel Reed"],
    ["Accounting", "Mia Patel"],
  ];
  const cliWelcome = `<div class="banner" style="padding:16px 18px"><div class="av" style="width:40px;height:40px;font-size:13px">JE</div><div><div class="eb">WELCOME BACK</div>
    <div class="h1" style="font-size:22px">Jordan Ellis</div><div class="sub" style="font-size:11px">Here's the opportunity you're considering and the team around it.</div></div></div>`;

  // ---------------------------------------------------------------- Accountant (Mia)
  const accItems = [
    ["grid", "Dashboard", true],
    ["shield", "AML/CTF Compliance", false],
    ["users", "My Clients", false],
    ["chat", "Message Hub", false],
    ["bell", "Notifications", false],
    ["gear", "Settings", false],
  ];
  const acc = (reviewed) =>
    shell({
      label: "ACCOUNTANT PORTAL",
      who: "Mia Patel",
      org: "Accounting partner",
      initials: "MP",
      items: accItems,
      body: `<div class="banner"><div style="flex:1"><div class="eb">${'<span style="width:11px;height:11px;display:inline-flex">' + icon("clip", "#3556f0") + "</span>"}ACCOUNTANT PORTAL</div>
        <div class="h1">Good to see you, Mia</div><div class="sub">Your allocated clients and what the property team needs from you.</div></div><div class="btn ghost">All clients ${arrow()}</div></div>
      <div class="row">
        <div class="stat">${tile("users")}<div><div class="v">Jordan Ellis</div><div class="l">Allocated client · active</div></div></div>
        <div class="stat">${tile("file")}<div><div class="v">${reviewed ? "Reviewed" : "1 to review"}</div><div class="l">Supporting information</div></div></div>
        <div class="stat">${tile("chat")}<div><div class="v">Residence 014</div><div class="l">Shared opportunity</div></div></div>
      </div>
      <div class="row" style="align-items:flex-start">
        <div class="panel" style="flex:1.5"><div class="ph">Needs you next</div><div class="ps">Ordered by what the rest of the property team is waiting on.</div>
          <div class="line ${reviewed ? "" : "sel"}" style="${reviewed ? "border:2px solid #00A8B5;background:rgba(0,168,181,.10)" : ""}">${tile("file")}<div><div class="a" style="font-size:17px">Supporting information</div><div class="b" style="font-size:12px">Jordan Ellis · Residence 014</div></div>
            ${reviewed ? `<span class="ok" style="margin-left:auto;font-size:15px">✓ Reviewed</span>` : `<div class="btn" style="margin-left:auto">Mark reviewed${onIt()}</div>`}</div></div>
        <div class="panel"><div class="ph">${'<span style="width:15px;height:15px;display:inline-flex">' + icon("chat", "#3556f0") + "</span>"}Recently allocated</div><div class="ps">Clients the advisory team has handed to your practice.</div>
          <div class="line"><div class="a">Jordan Ellis</div><span class="pill ok">Allocated</span></div></div>
      </div>`,
    });

  // ---------------------------------------------------------------- Solicitor (Priya)
  const solItems = (on) => [
    ["grid", "Dashboard", false],
    ["shield", "AML/CTF Compliance", false],
    ["case", "Matters", on === "matters"],
    ["board", "Pipeline", false],
    ["chat", "Message Hub", false],
    ["tasks", "Tasks", false],
    ["bell", "Notifications", false],
    ["gear", "Settings", false],
  ];
  const sol = (body) =>
    shell({
      label: "SOLICITOR PORTAL",
      who: "Priya Shah",
      org: "Legal partner",
      initials: "PS",
      items: solItems("matters"),
      body,
    });
  const solBanner = `<div class="banner"><div style="flex:1"><div class="eb">${'<span style="width:11px;height:11px;display:inline-flex">' + icon("case", "#3556f0") + "</span>"}MATTERS</div>
      <div class="h1">Open matters</div><div class="sub">Matters shared with your practice by the property team.</div></div><div class="btn">Open matters ${arrow()}</div></div>`;

  // ---------------------------------------------------------------- Builder / Developer (Daniel)
  const bldItems = [
    ["grid", "Dashboard", false],
    ["shield", "AML/CTF Compliance", false],
    ["building", "Projects", false],
    ["clip", "Stock List", true],
    ["chat", "Messages", false],
    ["tasks", "Tasks", false],
    ["bell", "Notifications", false],
  ];
  const bld = (body) =>
    shell({
      kind: "bld",
      label: "BUILDER / DEVELOPER PORTAL",
      who: "Daniel Reed",
      org: "Builder / developer",
      initials: "DR",
      items: bldItems,
      chips: `<div class="chips"><span>PROJECT MEMBER</span><span>DEMO</span></div>`,
      top: `<div style="font-size:13px;font-weight:700">Stock List</div>`,
      body,
    });
  const bldBanner = `<div class="banner" style="align-items:stretch"><div style="flex:1"><div class="eb">${'<span style="width:11px;height:11px;display:inline-flex">' + icon("building", "#20b8c2") + "</span>"}PROJECTS · STOCK LIST</div>
      <div class="h1">Project Banksia</div><div class="sub">Stock and documents for the project shared with your account.</div>
      <div style="display:flex;gap:8px;margin-top:12px"><div class="btn ghost">${'<span style="width:13px;height:13px;display:inline-flex">' + icon("refresh", "#fff") + "</span>"}Refresh</div><div class="btn teal">Open projects ${arrow()}</div></div></div>
      <div class="info"><div><span class="mono">PROJECT</span><b>Project Banksia</b></div><div><span class="mono">ACCESS</span><b>Project member</b></div>
        <div><span class="mono">STAGE</span><b>Under consideration</b></div><div><span class="mono">RECORD</span><b>BK-014</b></div></div></div>`;

  const W = [1920, 1080];
  const L = [1920, 1200];
  const plates = {
    // Command Center
    "PL-04B-a": { size: W, scale: SCALE, html: cc("reports", `${ccBanner}${ccTypes(false)}`) },
    "PL-04B-b": {
      size: W,
      scale: SCALE,
      html: cc("reports", `${ccBanner}${ccTypes(true)}${ccContext(false)}`),
    },
    "PL-05A-a": { size: W, scale: SCALE, html: cc("research", research(false)) },
    "PL-05A-b": { size: W, scale: SCALE, html: cc("research", research(true)) },
    "PL-05C-a": {
      size: W,
      scale: SCALE,
      html: cc(
        "reports",
        `${ccContext(true)}<div class="card" style="flex:none;flex-direction:row;align-items:center;gap:20px">
        <div style="flex:1"><div class="k">REPORT</div><div class="t" style="font-size:26px">Client summary</div><div class="d">Prepared for Jordan Ellis</div></div><div class="btn" style="font-size:15px;padding:12px 18px">Open preview${onIt()}</div></div>`,
      ),
    },
    "PL-06B-a": {
      size: W,
      scale: SCALE,
      html: cc(
        "reports",
        agentRecord,
        `<div class="launcher"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:#00A8B5;box-shadow:0 0 8px #00A8B5"></span>Aurixa Agent${onIt()}</div>`,
      ),
    },
    "PL-06B-b": {
      size: W,
      scale: SCALE,
      html: cc(
        "reports",
        `<div class="row" style="align-items:flex-start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">${agentRecord}</div>${agentPanel("open")}</div>`,
      ),
    },
    "PL-07A-a": {
      size: W,
      scale: SCALE,
      html: cc(
        "reports",
        `<div class="row" style="align-items:flex-start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">${agentRecord}</div>${agentPanel("editing")}</div>`,
      ),
    },
    "PL-07A-b": {
      size: W,
      scale: SCALE,
      html: cc(
        "reports",
        `<div class="row" style="align-items:flex-start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">${agentRecord}</div>${agentPanel("saved")}</div>`,
      ),
    },
    "PL-11A-c": {
      size: W,
      scale: SCALE,
      html: shell({
        label: "DEMO WORKSPACE",
        who: "Alex Morgan",
        org: "Property adviser",
        initials: "AM",
        items: [
          ["grid", "Demo workspace", true],
          ["building", "Projects", false],
          ["file", "Reports", false],
          ["chat", "Message Hub", false],
        ],
        body: `<div class="banner"><div style="flex:1"><div class="eb">DEMO WORKSPACE</div><div class="h1">Explore your workspace</div><div class="sub">A prepared project to try every portal with.</div></div></div>
          <div class="row"><div class="card sel" style="flex:none;width:520px;flex-direction:row;gap:16px;align-items:center">${pimg(200, 125)}<div><div class="k" style="color:#b9c6ff">PROJECT</div><div class="t" style="font-size:26px">Residence 014</div><div class="d">Project Banksia</div></div></div>
          <div class="card"><div class="k">PORTALS</div><div class="t" style="font-size:16px">Client · Finance · Legal · Builder / Developer · Accounting</div></div></div>`,
      }),
    },
    // Finance
    "PL-05B-a": {
      size: W,
      scale: SCALE,
      html: fin(
        purchaseFile(
          "Overview",
          `<div class="row"><div class="card"><div class="k">STAGE</div><div class="t">Under consideration</div></div>
        <div class="card"><div class="k">CLIENT</div><div class="t">Jordan Ellis</div></div><div class="card"><div class="k">NEXT</div><div class="t">Scenario comparison</div></div></div>`,
        ),
      ),
    },
    "PL-05B-b": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Scenario comparison", scenarios(false, false))),
    },
    "PL-13A-a": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Scenario comparison", scenarios(false, true))),
    },
    "PL-13A-b": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Scenario comparison", scenarios(true, false))),
    },
    // Client
    "PL-06A-a": {
      size: L,
      scale: 2,
      html: cli(
        "dash",
        `${cliWelcome}
        <div class="team"><div class="dots">${roles.map(() => `<i>${'<span style="width:11px;height:11px;display:inline-flex">' + icon("user", "#fff", 2) + "</span>"}</i>`).join("")}</div>
          <div><div style="font-size:12px;font-weight:800">Your property team</div><div style="font-size:9.5px;color:#9aa3b5">5 professionals working on Residence 014</div></div><span style="margin-left:auto;font-size:10px;color:#3556f0;font-weight:700">View team →</span></div>
        <div class="row"><div class="mini"><div class="k">OPPORTUNITY</div><div class="v">Residence 014</div></div><div class="mini"><div class="k">STAGE</div><div class="v">Under consideration</div></div>
          <div class="mini"><div class="k">NEXT</div><div class="v">Client summary</div></div></div>
        <div class="panel"><div class="ph" style="font-size:12.5px">Active opportunity</div><div class="line">${pimg(90, 56)}<div><div class="a" style="font-size:12px">Project Banksia / Residence 014</div><div class="b">New build</div></div><span class="pill">Under consideration</span></div></div>`,
      ),
    },
    "PL-06A-b": {
      size: L,
      scale: 2,
      html: cli(
        "team",
        `<div class="banner" style="padding:16px 18px"><div><div class="eb">MY PROPERTY TEAM</div><div class="h1" style="font-size:24px">Your property team</div>
          <div class="sub" style="font-size:11px">Project Banksia / Residence 014</div></div></div>
        <div class="card sel" style="flex:none;padding:14px"><div class="k" style="color:#b9c6ff">YOUR PROPERTY TEAM · RESIDENCE 014</div>
          <div class="row" style="gap:8px">${roles.map(([r, n]) => `<div class="card" style="padding:11px;background:#0b1430"><div class="k" style="color:#5fe0e8;font-size:7.5px">${r.toUpperCase()}</div><div class="t" style="font-size:14px">${n}</div></div>`).join("")}</div></div>
        <div class="row"><div class="card" style="flex-direction:row;gap:12px;align-items:center">${pimg(110, 70)}<div><div class="k">YOUR PROPERTY</div><div class="t" style="font-size:14px">Residence 014</div></div></div>
          <div class="card"><div class="k">NEXT DISCUSSION</div><div class="t" style="font-size:16px">Client summary</div><div class="d">Questions for discussion</div></div></div>`,
      ),
    },
    // Accountant
    "PL-08A-a": { size: W, scale: SCALE, html: acc(false) },
    "PL-08A-b": { size: W, scale: SCALE, html: acc(true) },
    // Solicitor
    "PL-09B-a": {
      size: W,
      scale: SCALE,
      html: sol(`${solBanner}<div class="panel"><div class="ph">Open matters</div><div class="ps">Shared with your practice.</div>
        <div class="line" style="padding:14px">${pimg(96, 60)}<div><div class="a" style="font-size:17px">Project Banksia / Residence 014</div><div class="b" style="font-size:12px">Jordan Ellis · Under consideration</div></div><span class="pill">Document review</span>${cur("left:46%;top:56%")}</div></div>`),
    },
    "PL-09B-b": {
      size: W,
      scale: SCALE,
      html: sol(`<div class="row" style="align-items:flex-start">
        <div class="panel" style="flex:1"><div class="ph">Open matters</div><div class="line sel" style="padding:14px">${pimg(96, 60)}<div><div class="a" style="font-size:16px">Project Banksia / Residence 014</div><div class="b">Jordan Ellis</div></div></div></div>
        <div class="panel" style="flex:1.2"><div class="ph">${'<span style="width:15px;height:15px;display:inline-flex">' + icon("file", "#3556f0") + "</span>"}Document review</div>
          ${["Contract of sale (draft)", "Floor plan", "Building specification"].map((t) => `<div class="line"><div class="a">${t}</div><span class="pill">To review</span></div>`).join("")}
          <div class="line" style="border-color:rgba(64,96,255,.4)"><div><div class="a">Next discussion</div><div class="b">Questions for the client and adviser</div></div></div></div></div>`),
    },
    "PL-12B-a": {
      size: W,
      scale: SCALE,
      html: sol(`<div class="row" style="flex:1"><div class="panel" style="flex:1.25;align-items:center;justify-content:center">${dimg(520, 340)}</div>
        <div class="panel" style="flex:1"><div class="ph">Residence 014 · document review</div><div class="draft"><div class="lab">Note</div>Discuss the remaining document questions.</div>
          <div class="btn" style="align-self:flex-start;font-size:15px;padding:11px 18px">Save note${onIt()}</div></div></div>`),
    },
    "PL-12B-b": {
      size: W,
      scale: SCALE,
      html: sol(`<div class="row" style="flex:1"><div class="panel" style="flex:1.25;align-items:center;justify-content:center">${dimg(520, 340)}</div>
        <div class="panel" style="flex:1"><div class="ph">Residence 014 · document review</div><div class="draft"><div class="lab">Note</div>Discuss the remaining document questions.</div>
          <div class="ok" style="font-size:16px">✓ Note saved</div><span class="pill" style="margin-left:0;align-self:flex-start">Matter remains under review</span></div></div>`),
    },
    // Builder / Developer
    "PL-12A-a": {
      size: W,
      scale: SCALE,
      html: bld(`${bldBanner}<div class="panel"><div class="ph">Stock list</div>
        <div class="line sel" style="padding:13px">${pimg(96, 60)}<div><div class="a" style="font-size:17px">Residence 014</div><div class="b">Floor plan · Specification</div></div><span class="pill teal">Plan updated</span>${cur("left:40%;top:56%")}</div>
        <div class="line" style="opacity:.55"><div class="a">Residence 015</div></div><div class="line" style="opacity:.55"><div class="a">Residence 016</div></div></div>`),
    },
    "PL-12A-b": {
      size: W,
      scale: SCALE,
      html: bld(`<div class="row" style="flex:1"><div class="panel" style="flex:1.6;align-items:center;justify-content:center;border:2px solid #00A8B5">${dimg(620, 400)}</div>
        <div class="panel" style="flex:1"><div class="mono">FLOOR PLAN</div><div class="h1" style="font-size:24px;margin:0;font-family:'Playfair Display',serif">Residence 014</div><div class="ps" style="margin:0">Project Banksia</div></div></div>`),
    },
  };
  return { css: CSS, plates };
};
