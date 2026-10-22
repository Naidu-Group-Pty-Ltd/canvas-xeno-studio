// The Aurixa portal plates (v2), built on the shells of the supplied portal screenshots: the
// Solicitor, Accountant, Finance, Client and Builder / Developer portals, and the Command Centre's
// Reports page. Structure only: every name, value, address and account detail is the reel's
// fictional material, and the brand is AURIXA SYSTEMS.
//
// Drawn at 1280 x 720 (or 800) CSS pixels and rendered at 1.5x, so a plate is 1920 wide and its
// type reads at phone size once it is on a monitor in a 9:16 frame. The Command Centre is drawn
// at 1536 x 864 and rendered at 1.25x: its screenshot's own measurements, at 125% zoom.

const SCALE = 1.5;
const CC_SCALE = 1.25;

const CSS = `
/* The client's report, inside (NEW-REPORT-PAGES): one CSS px a point of its A4 sheet. */
.rp { position:absolute; left:0; top:0; width:595.5px; height:842.25px; transform-origin:0 0; overflow:hidden; color:#333333;
  font-family:'Liberation Sans', Helvetica, Arial, sans-serif; font-kerning:none; text-rendering:geometricPrecision; }
.rp-t { position:absolute; white-space:nowrap; line-height:1; }
.rp-r { position:absolute; display:block; }
.rp-label { position:absolute; display:flex; align-items:center; justify-content:center; white-space:nowrap; background:#FCF7EB;
  box-shadow:inset 0 0 0 0.6px #D9A520; font-size:7px; line-height:1; color:#624A0F; }
.rp-photo { position:absolute; background:#2a3b52 center 38%/cover no-repeat; }
.rp-dots { position:absolute; height:1px; background:radial-gradient(circle at 0.5px 0.5px, #D9A520 0.5px, transparent 0.6px) 0 0/6px 1px repeat-x; }
.pt { position:absolute; inset:0; display:flex; color:#fff; font-family:Selawik, "Segoe UI", sans-serif; overflow:hidden;
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
.pt .emb.real { border:none; background-size:contain; background-position:center; background-repeat:no-repeat; }
.pt .cur { position:absolute; width:24px; height:24px; z-index:9; filter:drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.pt .fab { position:absolute; right:26px; bottom:22px; width:44px; height:44px; border-radius:50%; background:#1238E8; display:grid; place-items:center; font-size:22px; font-weight:400; }
/* Finance: a page heading rather than a banner, and serif card titles */
.fin .welcome { font-size:26px; font-weight:800; letter-spacing:-.01em; }
.fin .welcome span { color:#3556f0; }
.fin .sec { font-size:10.5px; letter-spacing:.14em; font-weight:700; color:#aab2c3; }
.serif { font-family:"Aurixa Display", Georgia, serif !important; font-weight:700 !important; letter-spacing:0 !important; }
/* Finance purchase file (after its code) */
.pt .fback { display:inline-flex; align-items:center; gap:7px; font-size:11.5px; font-weight:600; color:#c3c8d4; padding:5px 10px; border-radius:999px; }
.fin .body { gap:12px; padding:16px 30px; }
.pt .fbar { display:flex; align-items:center; margin:-16px -30px 0; padding:7px 30px; border-bottom:1px solid rgba(255,255,255,.07); background:rgba(14,15,20,.8); font-size:12px; }
.pt .fghost { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:#c3c8d4; padding:5px 9px; border-radius:8px; }
.pt .fghost.on { color:#9db0ff; background:rgba(18,56,232,.15); border:1px solid rgba(18,56,232,.35); }
.pt .fsel { display:flex; align-items:center; justify-content:space-between; height:30px; padding:0 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:#101116; font-size:11.5px; }
.pt .fsel::after { content:"⌄"; color:#8d95a8; }
.pt .ftabs { display:flex; align-items:center; gap:6px; overflow:hidden; }
.pt .ftab { position:relative; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; font-size:11.5px; font-weight:600; color:#9aa3b5; padding:8px 12px; border-radius:11px; background:#101116; border:1px solid rgba(255,255,255,.08); }
.pt .ftab.on { background:#1238E8; color:#fff; border-color:#1238E8; box-shadow:0 4px 14px rgba(18,56,232,.3); }
.pt .fchev { width:28px; height:28px; flex:none; border-radius:8px; border:1px solid rgba(255,255,255,.12); display:grid; place-items:center; color:#8d95a8; font-size:16px; }
.pt .fsum { border-color:rgba(64,96,255,.32); background:linear-gradient(135deg, rgba(18,56,232,.10), #0f1015 60%); gap:10px; }
.pt .qsm { font-size:10.5px; color:#8d95a8; font-weight:500; }
.pt .fli { margin:4px 0 0 16px; font-size:11.5px; color:#c3c8d4; line-height:1.6; }
.pt .fnext { display:flex; gap:8px; align-items:center; padding:9px 12px; border-radius:10px; border:1px solid rgba(64,96,255,.25); background:rgba(18,56,232,.07); font-size:11.5px; color:#dfe3ec; }
.pt .flab { font-size:10.5px; color:#8d95a8; font-weight:600; margin-bottom:4px; }
.pt .fin { display:flex; align-items:center; height:32px; padding:0 11px; border-radius:8px; border:1px solid rgba(255,255,255,.10); background:#0b0c10; font-size:12.5px; box-shadow:inset 0 1px 3px rgba(0,0,0,.5); }
.pt .fin.sel { border-color:rgba(18,56,232,.6); }
.pt .fpos { display:flex; gap:16px; align-items:flex-start; padding:20px 22px; border-radius:14px; border:2px solid; background:#0f1015; }
.pt .fposi { width:50px; height:50px; flex:none; border-radius:50%; display:grid; place-items:center; }
.pt .fposi.sm { width:30px; height:30px; }
.pt .fscrim { position:absolute; inset:0; background:rgba(3,4,8,.66); }
.pt .fdlg { position:absolute; left:50%; top:52%; transform:translate(-50%,-50%); width:560px; padding:22px 24px; border-radius:16px; border:1px solid rgba(255,255,255,.14);
  background:#121319; box-shadow:0 30px 80px rgba(0,0,0,.7); display:flex; flex-direction:column; gap:12px; }
.pt .ftoast { position:absolute; right:84px; bottom:24px; display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:#16171d; font-size:13px; font-weight:600; box-shadow:0 14px 40px rgba(0,0,0,.6); }
/* Client: My property team */
.cli .tgrid { display:grid; grid-template-columns:repeat(3, 1fr); gap:7px; }
.cli .ttile { display:flex; gap:8px; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:#0d0f16; }
.cli .tic { width:26px; height:26px; flex:none; border-radius:7px; display:grid; place-items:center; background:rgba(18,56,232,.14); }
.cli .tr { font-size:7px; letter-spacing:.12em; color:#8d95a8; font-weight:700; }
.cli .tn { font-size:11.5px; font-weight:700; margin-top:2px; }
.cli .to { font-size:8.5px; color:#9aa3b5; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cli .tl { display:flex; align-items:center; gap:4px; font-size:8.5px; color:#7d97ff; font-weight:700; margin-top:4px; }
/* Accountant: a client file */
.pt .atabs { display:flex; justify-content:center; gap:4px; padding:4px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:#0f1015; }
.pt .atabs span { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; color:#9aa3b5; }
.pt .atabs span.on { color:#fff; background:#17191f; border:1px solid rgba(18,56,232,.5); }
.pt .areply { font-size:12px; line-height:1.5; padding:9px 12px; border-radius:9px; background:rgba(18,56,232,.08); border:1px solid rgba(64,96,255,.22); color:#dfe3ec; }
.pt .areply b { color:#9db0ff; }
.pt .line.areq.sel { border:2px solid rgba(215,179,95,.55); background:rgba(200,155,60,.06); }
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
/* the white report page inside a portal */
.pt .page { background:#fff; color:#0A192F; border-radius:10px; padding:22px 26px; display:flex; flex-direction:column; gap:12px; box-shadow:0 14px 40px rgba(0,0,0,.45); }
.pt .page h2 { font-family:"Aurixa Display", Georgia, serif; font-size:30px; }
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
/* Solicitor: the matter's page (after SolicitorMatterDetail and MatterDocumentsPanel) */
.pt .sfoot { margin-top:auto; padding:12px 14px 16px; border-top:1px solid rgba(255,255,255,.06); display:flex; flex-direction:column; gap:8px; }
.pt .sfoot > span { display:flex; align-items:center; gap:10px; font-size:12px; color:#c3c8d4; padding:6px 8px; }
.pt .sfoot small { display:flex; align-items:center; gap:5px; font-size:8.5px; color:#6f778a; padding:0 8px; }
.pt .atabs.wrap { flex-wrap:wrap; row-gap:3px; }
.pt .atabs.wrap > span { position:relative; padding:6px 12px; }
.pt .atabs.wrap > span > span { padding:0; border:0; background:none; }
.pt .pill.blue { color:#9db0ff; border-color:rgba(64,96,255,.45); background:rgba(18,56,232,.14); }
.pt .sgrid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
.pt .s2 { display:grid; grid-template-columns:1fr 1fr; gap:11px 18px; }
.pt .slab { font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:#8d95a8; font-weight:600; }
.pt .sval { font-size:12.5px; font-weight:600; margin-top:3px; }
.pt .hr { height:1px; background:rgba(255,255,255,.08); }
.pt .shist { border-left:2px solid rgba(64,96,255,.55); padding:2px 0 2px 10px; }
.pt .shist .a { font-size:12.5px; font-weight:600; }
.pt .shist .b { font-size:10.5px; color:#8d95a8; margin-top:2px; }
.pt .sdoc { display:flex; align-items:center; gap:7px; padding:9px 12px; border-radius:9px; border:1px solid rgba(255,255,255,.08); background:#121318; }
.pt .sdoc .a { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; }
.pt .sdoc .b { font-size:10px; color:#8d95a8; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pt .sdoc .pill { font-size:9.5px; padding:2px 8px; }
.pt .sbtn { display:inline-flex; align-items:center; gap:5px; height:26px; padding:0 9px; border-radius:7px; border:1px solid rgba(255,255,255,.14); background:#14161c; font-size:10.5px; font-weight:600; white-space:nowrap; }
.pt .sico { width:24px; height:26px; display:grid; place-items:center; }
.pt .stog { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 8px; border-radius:7px; border:1px solid rgba(255,255,255,.10); font-size:10px; color:#c3c8d4; white-space:nowrap; }
.pt .stog i { width:22px; height:12px; border-radius:6px; background:#1238E8; position:relative; flex:none; }
.pt .stog i::after { content:""; position:absolute; right:2px; top:2px; width:8px; height:8px; border-radius:50%; background:#fff; }
.pt .fta { padding:9px 11px; border-radius:8px; border:1px solid rgba(255,255,255,.10); background:#0b0c10; font-size:12px; line-height:1.55; color:#e6e8ee; box-shadow:inset 0 1px 3px rgba(0,0,0,.5); }
.sol.narrow .top { padding:0 14px; gap:10px; }
.sol.narrow .body { padding:16px 18px; overflow:hidden; display:block; }
.sol.narrow .scrolled { display:flex; flex-direction:column; gap:14px; }
.sol.narrow .h1 { font-size:22px; }
/* Sonner's toast: bottom right, 32px in, 356px wide */
.sol.narrow .ftoast { right:32px; bottom:32px; width:356px; }
/* A browser window (generic, dark) */
.brw { position:absolute; display:flex; flex-direction:column; background:#35363a; overflow:hidden; color:#e8eaed; font-family:Selawik, "Segoe UI", sans-serif; }
.brw .btabs { height:34px; flex:none; display:flex; align-items:flex-end; gap:2px; padding:0 8px; background:#1f2023; }
.brw .btab { position:relative; height:28px; width:230px; min-width:0; display:flex; align-items:center; gap:8px; padding:0 10px 0 12px; border-radius:8px 8px 0 0; font-size:11.5px; color:#bdc1c6; }
.brw .btab.on { background:#35363a; color:#f1f3f4; }
.brw .btab .tt { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.brw .btab .x { color:#9aa0a6; font-size:13px; }
.brw .bplus { color:#9aa0a6; font-size:17px; padding:0 8px 6px; }
.brw .fav { width:15px; height:15px; flex:none; background:center/contain no-repeat; }
.brw .pdfic { width:16px; height:13px; flex:none; border-radius:2px; background:#e5484d; color:#fff; font-size:6px; font-weight:800; display:grid; place-items:center; }
.brw .bbar { height:38px; flex:none; display:flex; align-items:center; gap:12px; padding:0 12px; background:#35363a; border-bottom:1px solid #1f2023; }
.brw .bnav { display:flex; gap:14px; align-items:center; }
.brw .baddr { flex:1; min-width:0; height:28px; border-radius:14px; background:#202124; display:flex; align-items:center; gap:8px; padding:0 14px; font-size:12px; color:#e8eaed; white-space:nowrap; overflow:hidden; }
.brw .bview { flex:1; min-height:0; position:relative; overflow:hidden; }
.brw .btab > .cur { position:absolute; width:24px; height:24px; z-index:9; filter:drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
/* The browser's PDF viewer */
.pdfv { position:absolute; inset:0; display:flex; flex-direction:column; background:#525659; font-family:Selawik, "Segoe UI", sans-serif; color:#f1f3f4; }
.pdfv .ptb { height:48px; flex:none; display:flex; align-items:center; gap:16px; padding:0 18px; background:#323639; box-shadow:0 1px 4px rgba(0,0,0,.4); position:relative; z-index:1; font-size:13px; }
.pdfv .pname { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:30%; }
.pdfv .pmid { position:absolute; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:12px; }
.pdfv .ppg { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
.pdfv .ppg b { font-weight:400; background:#191b1c; padding:2px 7px; }
.pdfv .psep { width:1px; height:20px; background:#5f6368; }
.pdfv .ptb > span:last-child { margin-left:auto; }
.pdfv .pmain { flex:1; min-height:0; display:flex; }
.pdfv .pthumbs { width:160px; flex:none; background:#323639; display:flex; flex-direction:column; align-items:center; gap:14px; padding:16px 0; overflow:hidden; }
.pdfv .pt1 { display:flex; flex-direction:column; align-items:center; gap:6px; font-size:10.5px; color:#bdc1c6; }
.pdfv .pt1 > :first-child { outline:3px solid transparent; outline-offset:2px; }
.pdfv .pt1.on > :first-child { outline-color:#8ab4f8; }
.pdfv .pstage { flex:1; min-width:0; display:flex; justify-content:center; align-items:flex-start; padding:14px; overflow:hidden; }
.pdfv .ppage { position:relative; flex:none; box-shadow:0 2px 10px rgba(0,0,0,.45); overflow:hidden; }
.pdfv .mini { position:relative; width:95px; height:134px; background:#fff; padding:14px 10px; display:flex; flex-direction:column; gap:4px; overflow:hidden; }
.pdfv .mini .sh { position:absolute; width:22px; height:22px; background:linear-gradient(135deg,#111 0 45%,#C9A14A 45% 55%,transparent 55%); }
.pdfv .mini .sh.tl { left:0; top:0; }
.pdfv .mini .sh.br { right:0; bottom:0; transform:rotate(180deg); }
.pdfv .mini u { display:block; height:2px; background:#d6d9de; }
.pdfv .mini em { display:block; height:1px; width:40%; background:#C9A14A; }
.pdfv .mini .kpi { display:flex; gap:3px; }
.pdfv .mini .kpi i { flex:1; height:12px; border:1px solid #BF9B50; background:#FAF7F0; }
/* Builders Network: the Builder / Developer portal (after BuilderPortalLayout and BuilderStockList) */
.bn { position:absolute; inset:0; display:flex; color:#fff; font-family:Inter, sans-serif; overflow:hidden;
  background: radial-gradient(circle at top left, rgba(0,168,181,.10), transparent 28%), radial-gradient(circle at top right, rgba(0,168,181,.06), transparent 24%),
    linear-gradient(rgba(255,255,255,.075) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(255,255,255,.075) 1px, transparent 1px) 0 0/24px 24px, #040B16; }
.bn .ann, .bn .bchips span, .bn .bdemo, .bn .bchip, .bn .brev, .bn .beb, .bn .blk .s { font-family:Inconsolata, Consolas, monospace; }
.bn .bside { width:240px; flex:none; display:flex; flex-direction:column; background:rgba(7,18,34,.94); border-right:1px solid #1C2B41; }
.bn .blk { display:flex; align-items:center; gap:10px; padding:18px 16px 12px; }
.bn .bmark { width:34px; height:34px; flex:none; background:center/contain no-repeat; }
.bn .blk .t { font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bn .blk .s { font-size:8.5px; letter-spacing:.14em; color:#9CA3AF; margin-top:3px; }
.bn .blk > span:last-child { margin-left:auto; }
.bn .bsep { height:1px; background:#1C2B41; margin:0 14px; }
.bn .bcard { margin:12px; padding:12px; border-radius:14px; border:1px solid rgba(0,168,181,.15); background:linear-gradient(135deg, rgba(0,168,181,.10), rgba(11,22,44,.9)); }
.bn .bav { width:34px; height:34px; flex:none; border-radius:50%; display:grid; place-items:center; background:rgba(0,168,181,.12); color:#22C3CE; font-size:11px; font-weight:700; }
.bn .bcard .n { font-size:12.5px; font-weight:600; }
.bn .bcard .o { font-size:10.5px; color:#9CA3AF; margin-top:2px; }
.bn .bchips { display:flex; gap:5px; margin-top:9px; }
.bn .bchips span { font-size:7.5px; letter-spacing:.12em; font-weight:700; color:#cfd5df; border:1px solid #2a3b55; border-radius:3px; padding:2px 5px; }
.bn nav { padding:4px 10px; display:flex; flex-direction:column; gap:2px; }
.bn nav a { position:relative; height:36px; display:flex; align-items:center; gap:11px; padding:0 12px; border-radius:6px; font-size:12.5px; font-weight:500; color:#9CA3AF; }
.bn nav a.on { color:#fff; font-weight:600; background:linear-gradient(90deg, rgba(0,168,181,.22), rgba(0,168,181,0)); }
.bn nav a.on::before { content:""; position:absolute; left:0; top:6px; bottom:6px; width:2px; background:#00A8B5; }
.bn .bfoot { margin-top:auto; padding:12px 16px 16px; border-top:1px solid #1C2B41; display:flex; flex-direction:column; gap:8px; }
.bn .bfoot > span { display:flex; align-items:center; gap:10px; font-size:12px; color:#cfd5df; }
.bn .bfoot small { display:flex; align-items:center; gap:5px; font-size:8.5px; color:#6b7686; }
.bn .bmain { flex:1; min-width:0; display:flex; flex-direction:column; }
.bn .btop { height:50px; flex:none; display:flex; align-items:center; gap:12px; padding:0 22px; border-bottom:1px solid #1C2B41; background:rgba(7,18,34,.88); font-size:13px; position:relative; z-index:1; }
.bn .bback { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:#cfd5df; padding:5px 10px; border-radius:999px; }
.bn .btop .me { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:12px; font-weight:600; }
.bn .bdemo { font-size:9px; letter-spacing:.16em; font-weight:700; color:#C89B3C; border:1px solid rgba(200,155,60,.5); border-radius:3px; padding:3px 7px; }
.bn .bbody { flex:1; min-height:0; overflow:hidden; padding:22px 32px; }
.bn .bhero { position:relative; min-height:178px; padding:26px 30px; border:1px solid rgba(0,168,181,.5); border-left:2px solid #00A8B5; border-radius:6px; overflow:hidden;
  background: radial-gradient(420px 220px at 78% 35%, rgba(0,168,181,.16), transparent 70%), linear-gradient(115deg, #122036, #040B16); }
.bn .bhero::after { content:""; position:absolute; left:0; right:0; bottom:0; height:1px; background:rgba(0,168,181,.72); }
.bn .beb { display:flex; align-items:center; gap:7px; font-size:10px; letter-spacing:.2em; color:#22C3CE; font-weight:700; }
.bn .bh1 { font-family:"Playfair Display", Georgia, serif; font-weight:700; font-size:42px; line-height:1; letter-spacing:-.045em; margin-top:12px; }
.bn .bdesc { font-size:14px; color:rgba(255,255,255,.84); margin-top:10px; max-width:520px; line-height:1.5; }
.bn .btray { position:absolute; right:26px; bottom:22px; display:flex; gap:6px; padding:5px; border-radius:12px; border:1px solid rgba(0,168,181,.14); background:rgba(4,11,22,.34); }
.bn .bbtn { display:inline-flex; align-items:center; gap:7px; height:40px; padding:0 16px; border-radius:6px; border:1px solid rgba(0,168,181,.45); font-size:12.5px; font-weight:600; color:#e6f7f8; box-shadow:0 0 18px rgba(0,168,181,.18); white-space:nowrap; }
.bn .bbtn.teal { background:#00A8B5; color:#040B16; border-color:#00A8B5; }
.bn .bsched { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid #1C2B41; border-radius:6px; background:rgba(11,22,44,.6); }
.bn .bsched > div { padding:14px 18px; }
.bn .bsched > div + div { border-left:1px solid #1C2B41; }
.bn .ann { font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:#9CA3AF; font-weight:700; }
.bn .fig { font-size:32px; font-weight:600; letter-spacing:-.055em; margin-top:6px; font-variant-numeric:tabular-nums; }
.bn .bl { font-size:11px; color:#9CA3AF; }
.bn .bpanel { border:1px solid #1C2B41; border-radius:6px; background:rgba(11,22,44,.75); padding:18px 22px; display:flex; flex-direction:column; gap:8px; }
.bn .bstock { border-color:rgba(0,168,181,.25); background:radial-gradient(400px 200px at 100% 0%, rgba(0,168,181,.10), transparent 70%), rgba(18,32,54,.88); }
.bn .bct { font-family:"Playfair Display", Georgia, serif; font-weight:600; font-size:18px; }
.bn .bcd { font-size:12px; color:#9CA3AF; }
.bn .bsel { display:flex; align-items:center; gap:14px; padding:12px 14px; border:1px solid #1C2B41; border-radius:6px; margin-top:4px; }
.bn .brail { display:flex; margin-top:8px; border:1px solid #1C2B41; border-radius:6px; background:rgba(4,11,22,.4); }
.bn .bsearch { flex:1; display:flex; align-items:center; gap:9px; height:42px; padding:0 14px; font-size:12px; color:#9CA3AF; }
.bn .bselect { display:flex; align-items:center; justify-content:space-between; height:42px; padding:0 14px; border-left:1px solid #1C2B41; font-size:12px; }
.bn .bselect::after { content:"⌄"; color:#9CA3AF; }
.bn dd .bselect { height:28px; border:1px solid #1C2B41; border-radius:6px; }
.bn .bplates { list-style:none; margin:6px -22px 0; padding:0; }
.bn .bplate { display:grid; grid-template-columns:544px minmax(0, 1fr); gap:32px; padding:24px; border-top:1px solid #1C2B41; }
.bn .bframe { position:relative; width:544px; height:306px; border:1px solid #1C2B41; border-radius:6px; overflow:hidden; box-shadow:0 28px 56px -26px rgba(0,0,0,.95); background:#122036; }
.bn .bframe i { position:absolute; inset:-24px; background:center/cover no-repeat; filter:blur(16px) saturate(1.4); }
.bn .bframe i::after { content:""; position:absolute; inset:0; background:rgba(4,11,22,.30); }
.bn .bframe b { position:absolute; inset:0; background:center/contain no-repeat; }
.bn .bcap { display:flex; align-items:center; gap:6px; margin-top:10px; flex-wrap:wrap; }
.bn .bchip { display:inline-flex; align-items:center; gap:5px; font-size:9px; letter-spacing:.12em; font-weight:700; padding:3px 7px; border-radius:3px; border:1px solid; white-space:nowrap; }
.bn .bchip.ok { color:#4ADE80; border-color:rgba(74,222,128,.4); background:rgba(34,197,94,.08); }
.bn .bchip.gold { color:#E2B85A; border-color:rgba(200,155,60,.55); background:rgba(200,155,60,.10); }
.bn .bghost { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#9CA3AF; padding:3px 6px; }
.bn .bstage { display:inline-flex; align-items:center; gap:4px; font-size:9.5px; color:#9CA3AF; opacity:.68; padding:2px 6px; border:1px solid #2a3b55; border-radius:3px; }
.bn .bstage.dash { border-style:dashed; }
.bn .bsheet { display:flex; flex-direction:column; gap:12px; min-width:0; }
.bn .btitle { font-size:22px; font-weight:600; letter-spacing:-.032em; line-height:1.2; margin:5px 0 3px; }
.bn .bspec { display:grid; grid-template-columns:110px minmax(0, 1fr); margin:0; border-top:1px solid #2a3b55; border-bottom:1px solid #2a3b55; }
.bn .bspec dt, .bn .bspec dd { padding:5px 0; border-top:1px solid rgba(28,43,65,.9); margin:0; display:flex; flex-direction:column; justify-content:center; }
.bn .bspec dt:first-of-type, .bn .bspec dd:first-of-type { border-top:none; }
.bn .bspec dd { font-size:13px; font-weight:500; }
.bn .bprice { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
.bn .brev { display:inline-flex; align-items:center; gap:6px; font-size:10px; letter-spacing:.14em; font-weight:700; padding:6px 10px; border-radius:3px; border:1px solid #00A8B5; background:rgba(0,168,181,.20); color:#fff; white-space:nowrap; }
/* Command Centre, after its Reports page: a warm-black sidebar of gold-headed groups, a grey top
   bar, and a centred column of near-black sections on a faint navy glow */
.ccr { position:absolute; inset:0; display:flex; color:#fff; font-family:Selawik, "Segoe UI", sans-serif; overflow:hidden; background:#0b0c15; }
.ccr .cside { width:238px; flex:none; background:linear-gradient(180deg,#1a1c22 0%,#121214 30%,#111113 100%); border-right:1px solid rgba(255,255,255,.05);
  padding:15px 10px 0 12px; display:flex; flex-direction:column; overflow:hidden; }
.ccr .tenant { height:80px; flex:none; border-radius:12px; background:linear-gradient(160deg,#181d31,#12141d); border-bottom:1px solid rgba(255,255,255,.07);
  display:flex; align-items:center; gap:14px; padding:0 16px 0 24px; }
.ccr .tenant .t { font-size:14px; font-weight:800; letter-spacing:.06em; line-height:1.25; }
.ccr .tenant .s { font-size:8.5px; font-weight:700; letter-spacing:.22em; color:#8d95a8; margin-top:4px; }
.ccr .filter { height:30px; flex:none; margin:32px 4px 20px 15px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:#101012;
  display:flex; align-items:center; gap:8px; padding:0 10px; font-size:11px; color:#8a8a8f; }
.ccr .filter svg, .ccr .csearch svg { width:13px; height:13px; flex:none; }
.ccr .grp { flex:none; border-radius:12px; border:1px solid rgba(150,112,40,.30); background:linear-gradient(180deg,#17151a,#141317); padding:0 8px 8px; margin-bottom:10px; }
.ccr .grp h6 { display:flex; align-items:center; justify-content:space-between; font-size:9.5px; letter-spacing:.2em; font-weight:800; color:#B48D3C; padding:16px 10px 8px; }
.ccr .grp h6 svg { width:13px; height:13px; }
.ccr .grp a { height:34px; display:flex; align-items:center; gap:9px; padding:0 12px; font-size:12.5px; font-weight:700; color:#ececef; border-radius:8px; position:relative; }
.ccr .grp a svg { width:14px; height:14px; flex:none; }
.ccr .grp a.on { height:30px; margin:2px 0; background:#0832DE; border:1px solid rgba(120,150,255,.55); }
.ccr .grp a.on::before { content:""; position:absolute; left:5px; top:6px; bottom:6px; width:2.5px; border-radius:2px; background:#e4eeff; }
.ccr .cmain { flex:1; min-width:0; display:flex; flex-direction:column; }
.ccr .ctop { height:70px; flex:none; display:flex; align-items:center; gap:14px; padding:0 22px; background:#131417; border-bottom:1px solid rgba(255,255,255,.05); }
.ccr .ibtn { width:38px; height:38px; flex:none; border-radius:9px; border:1px solid rgba(255,255,255,.12); background:#17171a; display:grid; place-items:center; }
.ccr .ibtn svg { width:16px; height:16px; }
.ccr .csearch { width:420px; height:36px; border-radius:9px; background:#18181a; border:1px solid rgba(255,255,255,.05); display:flex; align-items:center; gap:10px; padding:0 14px;
  font-size:12px; color:#96969c; }
.ccr .right { margin-left:auto; display:flex; align-items:center; gap:9px; }
.ccr .chip { height:38px; display:flex; align-items:center; gap:9px; padding:0 13px; border-radius:9px; border:1px solid rgba(255,255,255,.12); background:#17161d; font-size:12.5px; font-weight:800; }
.ccr .chip svg { width:15px; height:15px; }
.ccr .ini { color:#2f55ff; font-size:11px; font-weight:800; }
.ccr .cdemo { font-size:9px; letter-spacing:.16em; font-weight:800; color:#D7B35F; border:1px solid rgba(215,179,95,.5); border-radius:999px; padding:5px 10px; margin-right:4px; }
.ccr .stage { flex:1; min-height:0; position:relative; background:radial-gradient(800px 380px at 30% 8%, rgba(24,36,100,.30), transparent 70%), #0b0c15; }
.ccr .col { position:absolute; left:16px; right:16px; top:20px; bottom:0; padding:25px 22px 0; background:linear-gradient(180deg,#0b1024,#0a0d1c 60%,#0a0c16);
  border:1px solid rgba(70,90,190,.10); border-bottom:none; border-radius:4px 4px 0 0; display:flex; flex-direction:column; gap:26px; }
.ccr .cbanner { height:127px; flex:none; border-radius:12px; border:1px solid rgba(255,255,255,.10); display:flex; align-items:flex-start; gap:16px; padding:22px; position:relative;
  background:radial-gradient(240px 150px at 4% 25%, rgba(40,70,230,.38), transparent 72%), linear-gradient(90deg,#191d30 0%,#121318 38%,#0f0f10 62%,#0f1527 100%); }
.ccr .itile { width:45px; height:45px; flex:none; border-radius:11px; background:#18245a; border:1px solid rgba(80,110,255,.30); display:grid; place-items:center; }
.ccr .itile svg { width:20px; height:20px; }
.ccr .eb { font-size:8.5px; letter-spacing:.36em; font-weight:800; color:#2449e0; margin-top:6px; }
.ccr .h1 { font-size:32px; font-weight:800; letter-spacing:-.015em; line-height:1; margin-top:8px; }
.ccr .sub { font-size:14px; color:#8f9097; margin-top:14px; }
.ccr .cgbtn { display:inline-flex; align-items:center; gap:9px; height:41px; padding:0 16px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:#151517;
  font-size:12.5px; font-weight:800; white-space:nowrap; position:relative; }
.ccr .cgbtn svg { width:14px; height:14px; }
.ccr .bbtn { display:inline-flex; align-items:center; gap:9px; height:41px; padding:0 18px; border-radius:10px; background:#1238E8; font-size:13.5px; font-weight:800; white-space:nowrap; position:relative; }
.ccr .sec { flex:none; border-radius:12px; background:#111112; border:1px solid rgba(255,255,255,.05); padding:26px 22px; display:flex; align-items:center; gap:20px; }
.ccr .kick { font-size:11px; letter-spacing:.3em; font-weight:700; color:#a7a7ad; }
.ccr .h2 { font-size:22px; font-weight:800; margin-top:14px; letter-spacing:-.005em; }
.ccr .desc { font-size:10.5px; color:#c6c6cb; margin-top:12px; }
.ccr .cctx { margin-left:auto; display:flex; align-items:center; gap:14px; padding:10px 18px 10px 10px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:#0c0d12; }
.ccr .cctx .n { font-size:15px; font-weight:800; }
.ccr .cctx .m { font-size:10.5px; color:#a7a7ad; margin-top:5px; }
.ccr .ana { flex:none; border-radius:12px; background:#0f0f11; border:1px solid rgba(255,255,255,.05); overflow:hidden; display:flex; flex-direction:column; }
.ccr .ana .hd { padding:26px 22px 20px; background:linear-gradient(90deg,#0f1324,#0e0f14 50%); }
.ccr .ana .hd .t { display:flex; gap:10px; align-items:center; font-size:16px; font-weight:800; }
.ccr .ana .hd .t svg { width:17px; height:17px; }
.ccr .ana .hd .d { font-size:12.5px; color:#b2b2b8; margin-top:12px; }
.ccr .tabsbox { margin:2px 22px 0; height:67px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:#0c0c0d; display:flex; align-items:center; justify-content:center; }
.ccr .seg { display:flex; gap:4px; padding:4px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:#0e0f12; }
.ccr .seg div { display:flex; align-items:center; gap:7px; padding:0 12px; height:41px; font-size:14px; font-weight:800; color:#9a9aa1; border-radius:9px; border:1px solid transparent; }
.ccr .seg div svg { width:15px; height:15px; }
.ccr .seg div.on { color:#fff; background:#141519; border-color:rgba(70,95,200,.45); }
.ccr .box { margin:24px 22px 22px; border-radius:14px; border:1px solid rgba(255,255,255,.07); background:#0d0d0e; padding:26px 16px 17px; }
.ccr .lab { font-size:11px; letter-spacing:.18em; font-weight:800; color:#d6d6db; padding-left:1px; }
.ccr .types { display:flex; gap:17px; margin-top:14px; }
.ccr .type { flex:1; min-width:0; height:103px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:#0b0b0c; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:9px; position:relative; text-align:center; }
.ccr .type svg { width:22px; height:22px; }
.ccr .type .t { font-size:12px; letter-spacing:.2em; font-weight:800; }
.ccr .type .s { font-size:8.5px; letter-spacing:.22em; font-weight:700; color:#b5b5ba; }
.ccr .type.on { border:1.5px solid #1238E8; background:linear-gradient(180deg,#0f1426,#0c1019); box-shadow:0 0 0 3px rgba(18,56,232,.12); }
.ccr .type.on .t { color:#2a4cf0; }
.ccr .bar { height:32px; flex:none; margin:0 22px; border-radius:16px; border:1px solid rgba(255,255,255,.07); background:#0e0e0f; }
.ccr .rowx { display:flex; gap:17px; }
.ccr .citem { display:flex; align-items:center; gap:16px; padding:14px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:#0b0b0c; position:relative; }
.ccr .citem > svg, .ccr .cagent .src svg { width:22px; height:22px; flex:none; }
.ccr .citem .a { font-size:16px; font-weight:800; }
.ccr .citem .b { font-size:11px; color:#a7a7ad; margin-top:5px; }
.ccr .citem.on { border:1.5px solid #1238E8; background:linear-gradient(90deg,#0f1630,#0c1019); }
.ccr .tag { font-size:9.5px; letter-spacing:.14em; font-weight:800; border-radius:999px; padding:5px 10px; border:1px solid rgba(255,255,255,.16); color:#cfd2da; white-space:nowrap; }
.ccr .tag.gold { color:#D7B35F; border-color:rgba(215,179,95,.5); background:rgba(200,155,60,.07); }
.ccr .tag.blue { color:#7d97ff; border-color:rgba(18,56,232,.6); background:rgba(18,56,232,.10); }
.ccr .tag.teal { color:#4fd2da; border-color:rgba(0,168,181,.5); background:rgba(0,168,181,.08); }
.ccr .skel div { height:8px; border-radius:4px; background:#1c1d22; margin:9px 0; }
.ccr .fab { position:absolute; right:22px; bottom:18px; width:68px; height:68px; border-radius:50%; display:grid; place-items:center;
  background:radial-gradient(circle at 50% 60%, rgba(30,40,80,.9), rgba(10,12,22,.9) 70%); box-shadow:0 6px 22px rgba(0,0,0,.6), 0 0 0 1px rgba(215,179,95,.25); }
.ccr .tip { position:absolute; right:100px; bottom:38px; padding:8px 12px; border-radius:8px; background:#1b1e2b; border:1px solid rgba(255,255,255,.14); font-size:12.5px; font-weight:800; white-space:nowrap; }
.ccr .cagent { position:absolute; right:16px; top:16px; bottom:16px; width:410px; border-radius:14px; background:linear-gradient(180deg,#121732,#0d1022); border:1px solid rgba(80,110,255,.35);
  box-shadow:-18px 0 40px rgba(0,0,0,.55); padding:20px; display:flex; flex-direction:column; gap:14px; }
.ccr .cagent .src { display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.10); background:#0b0e1c; }
.ccr .cagent .hd { display:flex; align-items:center; gap:11px; font-size:17px; font-weight:800; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,.08); }
.ccr .cagent .hd .x { margin-left:auto; color:#8f9097; font-size:18px; font-weight:400; }
.ccr .cdraft { background:#fff; color:#0A192F; border-radius:10px; padding:16px 18px; font-size:19px; font-weight:700; line-height:1.35; position:relative; }
.ccr .cdraft .lab2 { font-size:9px; letter-spacing:.2em; color:#5a6b85; font-weight:800; margin-bottom:8px; }
.ccr .cdraft.editing { outline:2.5px solid #1238E8; }
.ccr .cdraft.editing .caret { display:inline-block; width:2px; height:20px; background:#1238E8; margin-left:2px; vertical-align:-3px; }
.ccr .ask { margin-top:auto; height:42px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:#0b0d18; display:flex; align-items:center; padding:0 14px; font-size:12px; color:#8f9097; }
.ccr .saved { color:#33c6cf; font-size:15px; font-weight:800; }
.ccr .emb.real { flex:none; background-size:contain; background-position:center; background-repeat:no-repeat; }
.ccr svg.cur { position:absolute; width:24px; height:24px; z-index:9; filter:drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.ccr .pimg { border-radius:9px; background-color:#22324a; background-position:center; background-size:cover; background-repeat:no-repeat; flex:none; }
/* the supplied Command Centre pages past Reports */
.ccr .col.plain { background:none; border:none; padding:0 6px; top:18px; gap:0; }
.ccr .qpage { display:flex; flex-direction:column; gap:16px; }
.ccr .qpill { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; padding:5px 11px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:#121217; color:#e4e4e7; white-space:nowrap; }
.ccr .qpill.eyebrow { font-size:9.5px; letter-spacing:.24em; color:#a78bfa; border-color:rgba(139,92,246,.45); background:rgba(76,29,149,.12); }
.ccr .qpill.eyebrow.gold { color:#d6c08a; border-color:rgba(214,192,138,.35); background:rgba(120,90,30,.10); }
.ccr .qpill.violet { background:#5b3df5; border-color:#6d4cff; color:#fff; }
.ccr .qpill.dashed { border-style:dashed; color:#a1a1aa; background:none; }
.ccr .qbtn { display:inline-flex; align-items:center; gap:8px; height:34px; padding:0 14px; border-radius:9px; border:1px solid rgba(255,255,255,.13); background:#121216; font-size:12.5px; font-weight:700; color:#f4f4f5; position:relative; white-space:nowrap; }
.ccr .qbtn svg, .ccr .qlink svg, .ccr .qmeta svg, .ccr .qcard b svg, .ccr .qsearch svg, .ccr .qver svg { width:14px; height:14px; flex:none; }
.ccr .qbtn.blue { background:#1d4ed8; border-color:#2b5cff; }
.ccr .qbtn.ghost { background:none; border:none; }
.ccr .qbtn.on { background:#1c1c22; }
.ccr .qbtn.wide { flex:1; justify-content:center; height:32px; }
.ccr .qlink { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; padding:0 8px; }
.ccr .qbanner { border-radius:26px; border:1px solid rgba(110,100,200,.18); padding:26px 26px 22px; background:radial-gradient(600px 300px at 100% 90%, rgba(70,40,140,.22), transparent 70%), linear-gradient(180deg,#121216,#0e0e12); }
.ccr .qh1 { font-size:42px; font-weight:700; letter-spacing:-.02em; line-height:1.05; margin-top:14px; color:#f1f1f3; }
.ccr .qsub { font-size:14px; color:#a8a8b0; margin-top:12px; }
.ccr .qstats5 { display:flex; gap:12px; }
.ccr .qstat { flex:1; min-width:0; border-radius:12px; border:1px solid rgba(255,255,255,.09); background:#0f0f13; padding:14px 14px 16px; }
.ccr .qstat .l { font-size:9.5px; letter-spacing:.2em; color:#a1a1aa; font-weight:700; text-transform:uppercase; }
.ccr .qstat .l svg { width:13px; height:13px; }
.ccr .qstat .v { font-size:18px; font-weight:700; margin-top:12px; color:#f4f4f5; }
.ccr .qstat .d, .ccr .qsmall { font-size:11px; color:#a1a1aa; line-height:1.45; margin-top:5px; }
.ccr .qcats { display:flex; gap:16px; padding:14px; border-radius:20px; border:1px solid rgba(255,255,255,.07); background:#0d0d11; }
.ccr .qcat { flex:1; display:flex; align-items:center; gap:14px; padding:16px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background:#111115; }
.ccr .qcat b { font-size:14.5px; }
.ccr .qcat.on { border:1.5px solid #2b4cf0; background:linear-gradient(180deg,#101830,#0d1222); }
.ccr .qicon { width:40px; height:40px; flex:none; border-radius:11px; border:1px solid rgba(255,255,255,.12); display:grid; place-items:center; background:#16161b; }
.ccr .qicon svg { width:18px; height:18px; }
.ccr .qicon.gold { background:rgba(120,90,30,.25); border-color:rgba(214,170,60,.45); color:#e2b648; font-size:16px; }
.ccr .qicon.sq { width:36px; height:36px; background:rgba(40,70,200,.18); border-color:rgba(70,100,255,.35); }
.ccr .qicon.sq.green { background:rgba(34,197,94,.14); border-color:rgba(34,197,94,.4); }
.ccr .qcount { font-size:11px; font-weight:700; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.16); }
.ccr .qtools { display:flex; gap:10px; align-items:center; padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,.07); background:#0d0d11; }
.ccr .qsearch { flex:1; height:36px; border-radius:9px; border:1px solid rgba(255,255,255,.10); background:#0b0b0e; display:flex; align-items:center; gap:10px; padding:0 12px; font-size:12.5px; color:#8b8b93; }
.ccr .qseg { display:flex; border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:2px; }
.ccr .qseg .qbtn { border:none; height:30px; }
.ccr .qcountbox { font-size:10.5px; color:#a1a1aa; border:1px solid rgba(255,255,255,.10); border-radius:9px; padding:5px 10px; } .ccr .qcountbox b { color:#f4f4f5; }
.ccr .qcards { display:flex; gap:20px; }
.ccr .qrcard { flex:1; min-width:0; position:relative; border-radius:16px; border:1px solid rgba(255,255,255,.09); background:#0e0e12; padding:16px; }
.ccr .qpin { width:26px; flex:none; border-radius:8px; background:linear-gradient(180deg,#141b3a,#0e0e12); display:flex; justify-content:center; padding-top:4px; }
.ccr .qpin svg { width:16px; height:16px; }
.ccr .qrtitle { font-size:16px; font-weight:700; line-height:1.3; }
.ccr .qtags { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; } .ccr .qtags span { font-size:10.5px; font-weight:700; padding:4px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.18); }
.ccr .qver { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; border:1px solid rgba(255,255,255,.14); border-radius:9px; padding:4px 8px; }
.ccr .qrcard > div > div > svg { width:15px; height:15px; }
.ccr .qgtile { display:flex; gap:12px; align-items:center; margin-top:14px; padding:12px; border-radius:14px; border:1px solid rgba(255,255,255,.09); background:#0b0b0e; max-width:270px; }
.ccr .qgtile .l { font-size:9px; letter-spacing:.2em; color:#a1a1aa; font-weight:700; }
.ccr .qgrade { width:42px; height:42px; flex:none; border-radius:10px; display:grid; place-items:center; font-size:15px; font-weight:800; color:#2a1a00; }
.ccr .qgrade.gold { background:#e5b93a; } .ccr .qgrade.green { background:#22c55e; color:#fff; }
.ccr .qrep { background:#0c0c10; border-radius:4px; }
.ccr .qbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 26px; border-bottom:1px solid rgba(255,255,255,.07); background:#0a0a0d; }
.ccr .qtiers { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:7px; display:flex; flex-direction:column; align-items:center; gap:5px; background:#0b0b0f; }
.ccr .qtrow { display:flex; gap:5px; }
.ccr .qtier { position:relative; display:inline-flex; align-items:center; gap:7px; height:31px; padding:0 13px; border-radius:8px; font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,.08); }
.ccr .qtier b { font-weight:400; font-size:15px; color:#d4d4d8; } .ccr .qtier svg { width:14px; height:14px; }
.ccr .qtier.blue { background:#101225; } .ccr .qtier.red { background:#22101a; border-color:rgba(220,60,90,.3); } .ccr .qtier.indigo { background:#0f1530; border-color:rgba(70,100,255,.3); }
.ccr .qtier.teal { background:#0b1b22; border-color:rgba(0,168,181,.3); } .ccr .qtier.green { background:#101c0e; border-color:rgba(80,190,90,.3); }
.ccr .qtier.on { border:1.5px solid #6d5dfc; box-shadow:0 0 0 2px rgba(109,93,252,.25); }
.ccr .qtier.red.on { border-color:#f05a7e; box-shadow:0 0 0 2px rgba(240,90,126,.25); }
.ccr .qspin { width:12px; height:12px; border-radius:50%; border:2px solid rgba(240,90,126,.3); border-top-color:#f05a7e; }
.ccr .qcol { padding:20px 120px 0; display:flex; flex-direction:column; gap:18px; }
.ccr .qhero { display:flex; gap:24px; padding:20px 22px 18px; border-radius:14px; background:#101014; border:1px solid rgba(255,255,255,.05); }
.ccr .qtitle { font-size:32px; font-weight:700; line-height:1.15; letter-spacing:-.015em; margin-top:14px; }
.ccr .qmeta { display:flex; align-items:center; gap:7px; font-size:12px; color:#a1a1aa; margin-top:10px; }
.ccr .qgradebox { flex:1.3; align-self:flex-start; display:flex; gap:14px; align-items:center; padding:16px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background:#0d0d11; }
.ccr .qgradebox .qgrade { width:58px; height:58px; font-size:21px; }
.ccr .qnote { display:flex; align-items:center; gap:16px; padding:12px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.09); background:#0e0e12; font-size:12px; color:#b4b4bc; }
.ccr .qnote .qbtn { margin-left:auto; }
.ccr .qcard { border-radius:14px; border:1px solid rgba(255,255,255,.09); background:#0f0f13; padding:18px 18px 22px; }
.ccr .qops { border-radius:24px; border:1px solid rgba(70,90,200,.22); background:linear-gradient(180deg,#0f1428,#0d0f1c); padding:20px 24px 24px; }
.ccr .qeb { font-size:9.5px; letter-spacing:.24em; font-weight:700; color:#a1a1aa; }
.ccr .qchips { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; } .ccr .qchips span { font-size:12px; font-weight:700; padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:#121219; }
.ccr .qtiles { display:flex; gap:16px; margin-top:20px; }
.ccr .qtile { flex:1; border-radius:14px; border:1px solid rgba(255,255,255,.10); background:#0e0f18; padding:18px; }
.ccr .qtile.green { border-color:rgba(34,197,94,.35); background:linear-gradient(180deg,#0e1a16,#0c1210); }
.ccr .qtile .l { font-size:9.5px; letter-spacing:.2em; color:#a1a1aa; font-weight:700; }
.ccr .qtile .v { font-size:30px; font-weight:700; margin-top:14px; }
.ccr .qproj { display:flex; gap:14px; align-items:center; padding:12px; border-radius:14px; border:1.5px solid #2b4cf0; background:linear-gradient(90deg,#101830,#0d1222); }
.ccr .qfab { position:absolute; right:14px; bottom:6px; width:96px; height:96px; }
.ccr .qtip { position:absolute; right:118px; bottom:40px; padding:7px 12px; border-radius:8px; background:#17171d; border:1px solid rgba(255,255,255,.14); font-size:12.5px; font-weight:700; }
.ccr .qagent { position:absolute; right:30px; top:52px; width:470px; bottom:10px; border-radius:16px; border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(180deg,#101326,#0b0d18 40%); box-shadow:-20px 10px 60px rgba(0,0,0,.6); display:flex; flex-direction:column; overflow:hidden; }
.ccr .qagh { display:flex; align-items:center; gap:12px; padding:10px 18px; border-bottom:1px solid rgba(255,255,255,.07); }
.ccr .qagh svg { width:17px; height:17px; }
.ccr .qagb { flex:1; min-height:0; overflow:hidden; padding:14px 20px; display:flex; flex-direction:column; justify-content:flex-end; gap:10px; }
.ccr .qagb > * { flex:none; }
.ccr .qubub { align-self:flex-end; max-width:82%; background:#1d4ed8; color:#fff; font-size:13px; font-weight:600; line-height:1.45; padding:10px 14px; border-radius:16px; }
.ccr .qtrace { display:flex; align-items:center; gap:10px; font-size:12px; color:#a1a1aa; }
.ccr .qorb { width:18px; height:18px; border-radius:50%; background:radial-gradient(circle at 40% 35%, #ffe08a, #d4a017 60%, #6b4a00); box-shadow:0 0 10px rgba(240,190,60,.6); }
.ccr .qappr { border-radius:14px; border:1px solid rgba(229,185,58,.45); background:#0f0f13; overflow:hidden; box-shadow:0 0 0 3px rgba(229,185,58,.08); }
.ccr .qappr.given { border-color:rgba(81,70,41,.75); box-shadow:none; }
.ccr .qapprh { display:flex; align-items:center; gap:8px; padding:10px 12px 0; font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#8c8c8c; }
.ccr .qapprh svg { width:14px; height:14px; flex:none; }
.ccr .qact { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; }
.ccr .qacti { width:24px; height:24px; flex:none; margin-top:2px; border-radius:8px; display:grid; place-items:center; background:rgba(229,185,58,.12); color:#e5b93a; }
.ccr .qappr.given .qacti { background:#1f1f1f; color:#8c8c8c; }
.ccr .qacti svg { width:14px; height:14px; }
.ccr .qact b { display:block; font-size:13px; font-weight:500; line-height:1.35; color:#ececef; }
.ccr .qact .d { display:block; font-size:12px; color:#8c8c8c; overflow-wrap:anywhere; }
.ccr .qapprb { padding:0 12px 10px; }
.ccr .qapprf { display:flex; align-items:center; gap:4px; padding:8px 12px; border-top:1px solid rgba(81,70,41,.5); font-size:12px; color:#8fa6ff; }
.ccr .qapprf svg { width:12px; height:12px; }
.ccr .qapprk { display:flex; gap:8px; padding:10px 12px; border-top:1px solid rgba(81,70,41,.5); }
.ccr .qmail { border-radius:9px; border:1px solid rgba(61,99,255,.25); overflow:hidden; font-size:11.5px; }
.ccr .qmailh { font-weight:700; color:#8fa6ff; background:rgba(61,99,255,.10); padding:7px 12px; }
.ccr .qmail .m { color:#9c9ca5; }
.ccr .qmail b { font-weight:500; }
.ccr .qchip { font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:999px; border:1px solid rgba(255,255,255,.12); color:#a1a1aa; } .ccr .qchip.on { color:#8fa6ff; border-color:rgba(61,99,255,.35); background:rgba(61,99,255,.12); }
.ccr .qbody { margin-top:4px; padding:8px 10px; border-radius:6px; border:1px solid rgba(255,255,255,.07); background:#0b0b0e; font-size:12px; line-height:1.5; color:#e4e4e7; }
.ccr .qagf { padding:12px 16px 10px; border-top:1px solid rgba(255,255,255,.06); background:#08080b; display:flex; flex-direction:column; gap:10px; }
.ccr .qinput { display:flex; align-items:center; gap:12px; min-height:56px; padding:10px 12px; border-radius:14px; border:1px solid rgba(214,170,60,.35); background:#0a0a0e; font-size:13px; }
.ccr .qinput svg { width:16px; height:16px; }
.ccr .qmic { width:30px; height:30px; border-radius:50%; border:1px solid rgba(255,255,255,.14); display:grid; place-items:center; }
.ccr .qtalk { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:11px; background:linear-gradient(90deg,#123a3f,#2a1f55); font-size:12.5px; font-weight:700; color:#fff; }
.ccr .qcaret { display:inline-block; width:2px; height:15px; background:#f4f4f5; margin-left:2px; vertical-align:-2px; }
.ccr .qhint { display:flex; justify-content:space-between; font-size:8.5px; letter-spacing:.16em; color:#6b6b73; font-family:Inconsolata, Consolas, monospace; }
.ccr .qhint span:last-child { letter-spacing:0; font-family:Selawik, "Segoe UI", sans-serif; font-size:9.5px; }
.ccr .scrim { position:absolute; inset:0; background:rgba(4,6,12,.72); }
.ccr .creport { position:absolute; left:50%; top:50%; width:820px; transform:translate(-50%,-50%); background:#fff; color:#0A192F; border-radius:12px;
  box-shadow:0 24px 60px rgba(0,0,0,.6); padding:30px 38px; display:flex; flex-direction:column; gap:16px; }
.ccr .creport h2 { font-family:"Aurixa Display", Georgia, serif; font-size:40px; font-weight:700; }
.ccr .creport h4 { font-size:12px; letter-spacing:.18em; font-weight:800; }
.ccr .creport .rule { height:1.5px; background:linear-gradient(90deg,#C89B3C,rgba(200,155,60,.12)); }
.ccr .creport .skel div { background:#e6ebf2; height:9px; }
/* ---- system edition: the pages still to build (see the block before the plates) ---- */
/* Solicitor and Accountant dashboards */
.pt .nd-count { position:relative; overflow:hidden; }
.pt .nd-count::before { content:""; position:absolute; left:0; right:0; top:0; height:2px; background:linear-gradient(90deg, transparent, rgba(53,86,240,.32), transparent); }
.pt .nd-count .tile { width:42px; height:42px; border-radius:11px; border:1px solid rgba(53,86,240,.25); background:rgba(53,86,240,.10); }
.pt .nd-count .v { font-size:22px; font-weight:600; }
.pt .nd-kpi { flex-direction:column; align-items:flex-start; gap:3px; }
.pt .nd-kpi .k { display:flex; align-items:center; gap:6px; font-size:11px; color:#c3c8d4; }
.pt .nd-kpi .v { font-size:22px; font-weight:600; margin-top:3px; }
.pt .nd-empty { border:1px dashed rgba(255,255,255,.14); border-radius:10px; padding:16px; text-align:center; font-size:12px; color:#9aa3b5; }
.pt .nd-bar { display:flex; flex-direction:column; gap:7px; font-size:11.5px; }
.pt .nd-bar > div { display:flex; justify-content:space-between; }
.pt .nd-bar i { display:block; height:6px; border-radius:999px; background:#1b1d25; overflow:hidden; }
.pt .nd-bar b { display:block; height:100%; border-radius:999px; background:#1238E8; }
.pt .pill.muted { color:#aab2c3; border-color:rgba(255,255,255,.14); background:rgba(255,255,255,.04); }
.pt .pill.amber { color:#f2b544; border-color:rgba(242,181,68,.32); background:rgba(242,181,68,.10); display:inline-flex; align-items:center; gap:5px; }
/* Finance home: the agreement templates and the streak */
.fin .tpl { border-radius:14px; border:1px solid rgba(255,255,255,.08); background:#0f1015; padding:16px 18px; display:flex; flex-direction:column; gap:11px; }
.fin .tintro { font-size:11.5px; color:#aab2c3; line-height:1.55; max-width:720px; }
.fin .tnote { display:flex; gap:10px; border-radius:11px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.025); padding:11px 14px; font-size:10px; color:#aab2c3; line-height:1.85; }
.fin .tcard { flex:1; border-radius:11px; border:1px solid rgba(255,255,255,.08); background:#111218; padding:13px 15px; display:flex; flex-direction:column; gap:9px; min-width:0; }
.fin .tcard .tt { font-size:15px; display:flex; align-items:center; gap:10px; }
.fin .tcard .td { font-size:10.5px; color:#9aa3b5; line-height:1.5; }
.fin .tins { display:flex; justify-content:space-between; align-items:center; height:29px; padding:0 12px; border-radius:8px; border:1px solid rgba(255,255,255,.10); font-size:10.5px; font-weight:600; }
.fin .tdl { display:flex; align-items:center; gap:12px; font-size:10.5px; color:#8d95a8; }
.fin .tdl b { display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:600; color:#fff; border:1px solid rgba(255,255,255,.14); border-radius:8px; padding:7px 12px; }
.fin .tfile { width:26px; height:26px; flex:none; border-radius:7px; display:grid; place-items:center; background:rgba(18,56,232,.14); }
.fin .chips { display:flex; gap:8px; }
.fin .chips > span { display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:600; color:#aab2c3; border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:5px 11px; }
/* Builders Network home: the welcome, its title block, the schedule of counts */
.bn .bdash { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; align-items:center; }
.bn .btb { display:grid; grid-template-columns:1fr 1fr; margin:0; border:1px solid rgba(28,43,65,.9); border-radius:6px; background:rgba(11,22,44,.35); }
.bn .btb > div { padding:9px 13px; border-right:1px solid rgba(28,43,65,.45); border-bottom:1px solid rgba(28,43,65,.45); }
.bn .btb > div:nth-child(2n) { border-right:none; }
.bn .btb > div:nth-child(n+3) { border-bottom:none; }
.bn .btb dd { margin:3px 0 0; font-size:13px; font-weight:600; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
.bn .bsched.four { grid-template-columns:repeat(4,1fr); }
.bn .figu { font-family:Inconsolata, Consolas, monospace; font-size:10px; letter-spacing:.08em; color:#9CA3AF; margin-left:6px; font-weight:600; }
.bn .bempty { border:1px dashed #1C2B41; border-radius:6px; padding:24px 16px; text-align:center; font-size:12.5px; color:#9CA3AF; }
.bn .bhead { display:flex; align-items:center; gap:8px; }
/* Command Centre · Message Hub */
.ccr .mh { display:flex; flex-direction:column; gap:12px; height:100%; padding-bottom:16px; }
.ccr .mh-head { display:flex; align-items:center; gap:12px; flex:none; }
.ccr .mh-ic { width:40px; height:40px; flex:none; border-radius:12px; display:grid; place-items:center; background:rgba(18,56,232,.15); border:1px solid rgba(18,56,232,.28); }
.ccr .mh-ic svg { width:20px; height:20px; }
.ccr .mh-t { font-size:20px; font-weight:700; letter-spacing:-.01em; display:flex; align-items:center; gap:10px; }
.ccr .mh-live { display:inline-flex; align-items:center; gap:6px; font-size:10.5px; font-weight:700; color:#45d58a; border:1px solid rgba(69,213,138,.35); background:rgba(69,213,138,.08); border-radius:999px; padding:2px 9px; }
.ccr .mh-live i { width:6px; height:6px; border-radius:50%; background:#45d58a; box-shadow:0 0 0 3px rgba(69,213,138,.18); }
.ccr .mh-s { font-size:12.5px; color:#8f9097; margin-top:3px; }
.ccr .mh-acts { margin-left:auto; display:flex; align-items:center; gap:4px; }
.ccr .mh-g { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 11px; border-radius:9px; font-size:12px; font-weight:600; color:#d5d5da; }
.ccr .mh-g svg { width:15px; height:15px; flex:none; }
.ccr .mh-g.new { background:#1238E8; color:#fff; }
.ccr .mh-panes { flex:1; min-height:0; display:flex; gap:12px; }
.ccr .mh-pane { border-radius:16px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.025); display:flex; flex-direction:column; overflow:hidden; min-width:0; }
.ccr .mh-list { width:320px; flex:none; padding:12px 10px; gap:10px; }
.ccr .mh-find { height:36px; flex:none; display:flex; align-items:center; gap:9px; padding:0 12px; border-radius:12px; border:1px solid rgba(255,255,255,.10); background:#101012; font-size:12.5px; color:#7d7d84; }
.ccr .mh-find svg { width:14px; height:14px; }
.ccr .mh-pills { display:flex; gap:6px; flex:none; }
.ccr .mh-pills span { font-size:11.5px; font-weight:600; padding:4px 10px; border-radius:999px; color:#aab; background:rgba(255,255,255,.04); }
.ccr .mh-pills span.on { background:#1238E8; color:#fff; }
.ccr .mh-sec { font-size:10.5px; letter-spacing:.06em; font-weight:700; color:#8f9097; padding:6px 6px 2px; display:flex; gap:6px; }
.ccr .mh-row { position:relative; display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:12px; }
.ccr .mh-row.on { background:rgba(18,56,232,.10); box-shadow:inset 0 0 0 1px rgba(18,56,232,.28); }
.ccr .mh-row.on::before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:4px; border-radius:999px; background:#1238E8; }
.ccr .mh-av { position:relative; width:36px; height:36px; flex:none; border-radius:12px; display:grid; place-items:center; font-size:12px; font-weight:800; color:#fff; }
.ccr .mh-row.on .mh-av { box-shadow:0 0 0 2px #0b1024, 0 0 0 3.5px rgba(215,179,95,.75), 0 0 14px rgba(215,179,95,.35); }
.ccr .mh-av em { position:absolute; right:-3px; bottom:-3px; width:15px; height:15px; border-radius:50%; background:#0b1024; display:grid; place-items:center; }
.ccr .mh-av em svg { width:10px; height:10px; }
.ccr .mh-rt { flex:1; min-width:0; }
.ccr .mh-r1 { display:flex; align-items:baseline; gap:8px; font-size:13.5px; }
.ccr .mh-r1 b { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ccr .mh-r1 small { margin-left:auto; font-size:11px; color:#8f9097; font-variant-numeric:tabular-nums; }
.ccr .mh-r2 { font-size:12px; color:#8f9097; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ccr .mh-r2 i { font-style:normal; font-weight:600; color:rgba(236,236,239,.75); }
.ccr .mh-r2.mh-dr { color:#f2b544; display:flex; align-items:center; gap:5px; }
.ccr .mh-r2.mh-dr svg { width:12px; height:12px; flex:none; }
.ccr .mh-thread { flex:1; }
.ccr .mh-th { display:flex; align-items:center; gap:11px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.07); flex:none; }
.ccr .mh-th h3 { font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px; }
.ccr .mh-kind { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:999px; background:rgba(0,168,181,.14); color:#5fe0e8; }
.ccr .mh-sub2 { display:flex; align-items:center; gap:8px; font-size:11.5px; color:#8f9097; margin-top:3px; }
.ccr .mh-stack { display:flex; }
.ccr .mh-stack i { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:7.5px; font-weight:800; font-style:normal; color:#fff; box-shadow:0 0 0 2px #10121a; }
.ccr .mh-stack i + i { margin-left:-5px; }
.ccr .mh-sec2 { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:600; padding:1px 7px; border-radius:999px; background:rgba(255,255,255,.06); color:#aab; }
.ccr .mh-sec2 svg { width:11px; height:11px; }
.ccr .mh-tools { margin-left:auto; display:flex; gap:2px; }
.ccr .mh-tools span { width:36px; height:36px; border-radius:9px; display:grid; place-items:center; }
.ccr .mh-tools span.on { background:rgba(255,255,255,.06); }
.ccr .mh-tools svg { width:16px; height:16px; }
.ccr .mh-body { flex:1; min-height:0; padding:14px 16px; display:flex; flex-direction:column; gap:12px; justify-content:flex-end; }
.ccr .mh-date { display:flex; align-items:center; gap:10px; font-size:11px; font-weight:600; color:#8f9097; }
.ccr .mh-date::before, .ccr .mh-date::after { content:""; flex:1; height:1px; background:rgba(255,255,255,.08); }
.ccr .mh-date span { border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:2px 10px; }
.ccr .mh-msg { display:flex; gap:10px; align-items:flex-end; max-width:72%; }
.ccr .mh-msg.me { align-self:flex-end; flex-direction:row-reverse; }
.ccr .mh-mav { width:36px; height:36px; flex:none; border-radius:50%; display:grid; place-items:center; font-size:12px; font-weight:800; color:#fff; margin-bottom:20px; }
.ccr .mh-who { font-size:12px; font-weight:700; margin-bottom:4px; display:flex; gap:7px; align-items:baseline; color:#5fe0e8; }
.ccr .mh-who span { font-size:10px; letter-spacing:.08em; color:#8f9097; font-weight:600; }
.ccr .mh-bub { font-size:14px; line-height:1.6; padding:8px 12px; border-radius:16px 16px 16px 4px; background:#141418; box-shadow:inset 0 0 0 1px rgba(255,255,255,.10); color:#ececef; }
.ccr .mh-msg.me .mh-bub { border-radius:16px 16px 4px 16px; background:#1238E8; color:#fff; box-shadow:0 2px 10px rgba(18,56,232,.25); }
.ccr .mh-time { display:flex; align-items:center; gap:5px; font-size:11px; color:#8f9097; margin-top:5px; font-variant-numeric:tabular-nums; }
.ccr .mh-msg.me .mh-time { justify-content:flex-end; }
.ccr .mh-time svg { width:14px; height:14px; }
.ccr .mh-foot { flex:none; padding:0 12px 10px; }
.ccr .mh-comp { display:flex; align-items:flex-end; gap:4px; padding:6px; border-radius:16px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); }
.ccr .mh-comp.typing { box-shadow:0 0 0 2px rgba(18,56,232,.55); }
.ccr .mh-comp > span { width:36px; height:36px; flex:none; border-radius:9px; display:grid; place-items:center; }
.ccr .mh-comp > span svg { width:16px; height:16px; }
.ccr .mh-comp .mh-send { border-radius:50%; background:#1238E8; }
.ccr .mh-ta { flex:1; min-width:0; padding:8px 6px; font-size:14px; line-height:1.5; color:#ececef; }
.ccr .mh-ta.ph { color:#6f6f76; }
.ccr .mh-help { font-size:11px; color:#77777e; padding:6px 4px 0; }
.ccr .mh-det { width:320px; flex:none; }
.ccr .mh-dh { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.07); font-size:13px; font-weight:700; }
.ccr .mh-dh svg { width:15px; height:15px; }
.ccr .mh-dp { padding:18px 14px; display:flex; flex-direction:column; align-items:center; gap:6px; border-bottom:1px solid rgba(255,255,255,.07); }
.ccr .mh-big { width:64px; height:64px; border-radius:20px; display:grid; place-items:center; font-size:20px; font-weight:800; color:#fff; }
.ccr .mh-dn { font-size:15px; font-weight:700; margin-top:4px; }
.ccr .mh-dl { display:flex; align-items:center; gap:5px; font-size:11.5px; color:#8f9097; }
.ccr .mh-dl svg { width:12px; height:12px; }
.ccr .mh-badges { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; margin-top:4px; }
.ccr .mh-badges span { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.06); color:#c9c9cf; }
.ccr .mh-ds { padding:12px 14px 4px; display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; color:#c9c9cf; }
.ccr .mh-ds svg { width:14px; height:14px; }
.ccr .mh-ds small { color:#8f9097; font-weight:600; }
.ccr .mh-ds .chev { margin-left:auto; }
.ccr .mh-pp { display:flex; align-items:center; gap:10px; padding:7px 14px; }
.ccr .mh-pp .mh-mav { width:32px; height:32px; margin:0; font-size:11px; }
.ccr .mh-pp b { display:block; font-size:12.5px; font-weight:600; }
.ccr .mh-pp b small { font-size:11px; color:#8f9097; font-weight:400; margin-left:5px; }
.ccr .mh-pp div > span { font-size:11px; color:#8f9097; }
.ccr .mh-role { margin-left:auto; font-size:10px; font-weight:600; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.06); color:#aab; }
.ccr .mh-role.owner { background:rgba(18,56,232,.14); color:#8fa6ff; }
/* Client Portal · Reports and My Appointments */
.cli .cr-head { position:relative; overflow:hidden; display:flex; align-items:center; gap:12px; padding:16px 18px; border-radius:14px; border:1px solid rgba(255,255,255,.08);
  background:radial-gradient(220px 120px at 100% 0%, rgba(18,56,232,.22), transparent 70%), #0d0f16; }
.cli .cr-h1 { font-size:17px; font-weight:800; letter-spacing:-.01em; }
.cli .cr-sub { font-size:9.5px; color:#9aa3b5; margin-top:4px; }
.cli .cr-btn { margin-left:auto; display:inline-flex; align-items:center; gap:6px; font-size:9.5px; font-weight:700; padding:7px 11px; border-radius:9px; background:#1238E8; color:#fff; white-space:nowrap; }
.cli .cr-btn.ghost { margin-left:0; background:transparent; border:1px solid rgba(255,255,255,.16); }
.cli .cr-tabs { display:flex; gap:4px; padding:3px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:#0d0f16; align-self:flex-start; }
.cli .cr-tabs span { display:inline-flex; align-items:center; gap:5px; font-size:9.5px; font-weight:600; color:#9aa3b5; padding:5px 11px; border-radius:7px; }
.cli .cr-tabs span.on { background:#17191f; color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.cli .cr-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cli .cr-find { flex:1; min-width:160px; height:26px; display:flex; align-items:center; gap:6px; padding:0 9px; border-radius:8px; border:1px solid rgba(255,255,255,.10); background:#0b0c10; font-size:9.5px; color:#7d8496; }
.cli .cr-chip { font-size:8.5px; font-weight:600; padding:4px 9px; border-radius:999px; border:1px solid rgba(255,255,255,.12); color:#aab2c3; }
.cli .cr-chip.on { background:#1238E8; border-color:#1238E8; color:#fff; }
.cli .cr-card { display:flex; gap:11px; align-items:flex-start; padding:13px 14px; border-radius:14px; border:1px solid rgba(255,255,255,.09); background:#0f1118; }
.cli .cr-ic { width:32px; height:32px; flex:none; border-radius:10px; display:grid; place-items:center; border:1px solid rgba(18,56,232,.25); background:rgba(18,56,232,.12); }
.cli .cr-t { font-size:11px; font-weight:700; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.cli .cr-new { font-size:7px; font-weight:700; padding:1px 5px; border-radius:999px; background:rgba(18,56,232,.18); color:#8fa6ff; }
.cli .cr-tags { display:flex; gap:5px; margin-top:6px; }
.cli .cr-tags span { font-size:7.5px; font-weight:700; padding:2px 7px; border-radius:999px; border:1px solid rgba(255,255,255,.16); color:#cfd5e2; }
.cli .cr-tags span.sec { border-color:transparent; background:rgba(255,255,255,.08); }
.cli .cr-note { font-size:8.5px; color:#9aa3b5; margin-top:6px; }
.cli .cr-meta { display:flex; align-items:center; gap:10px; font-size:8.5px; color:#9aa3b5; margin-top:2px; }
.cli .cr-meta span { display:inline-flex; align-items:center; gap:4px; }
.cli .cr-when { margin-left:auto; text-align:right; flex:none; }
.cli .cr-when div { font-size:8.5px; color:#9aa3b5; }
.cli .cr-when small { display:block; font-size:7px; color:#6f778a; margin-top:2px; }
.cli .cr-dl { display:inline-flex; align-items:center; gap:5px; margin-top:9px; font-size:8.5px; font-weight:600; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.16); }
.cli .cr-up { font-size:7.5px; font-weight:700; padding:1px 7px; border-radius:999px; border:1px solid rgba(18,56,232,.25); background:rgba(18,56,232,.12); color:#8fa6ff; }
.cli .cr-sect { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; }
.cli .cr-foot { font-size:8.5px; color:#6f778a; text-align:center; }
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
  arrowl: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h9v9M12 3v6h9"/>',
  spark:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  // the Command Centre's
  news: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5"/>',
  shieldok: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  bars: '<path d="M3 3v18h18"/><path d="M8 17v-5M12 17V8M16 17v-3"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  msg: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  upload: '<path d="M4 17v3h16v-3M12 3v12M7 8l5-5 5 5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  // the Solicitor's, the Builders Network's and the browser's
  scale:
    '<path d="M12 3v18M7 21h10M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/><path d="M2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM16 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"/>',
  hardhat:
    '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M4 15v-3a6 6 0 0 1 6-6M14 6a6 6 0 0 1 6 6v3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  printer:
    '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  fit: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  pencil: '<path d="M17 3l4 4L8 20H4v-4z"/>',
  save: '<path d="M5 3h11l5 5v13H3V3z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2"/>',
  contact:
    '<rect x="3" y="4" width="18" height="17" rx="2"/><circle cx="12" cy="11" r="3"/><path d="M7 21c0-3 2.2-5 5-5s5 2 5 5M8 2v3M16 2v3"/>',
  route:
    '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>',
};
// The system edition's pages: Lucide's own glyphs (the products' icon set) that the plates before
// it never drew.
Object.assign(I, {
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  calclock:
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M16 2v4M8 2v4M3 10h5M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  circlecheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  filequestion:
    '<path d="M12 17h.01M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  keyboard:
    '<path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
  msgplus:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v6M9 10h6"/>',
  msgs: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zM18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  userplus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 8v6M22 11h-6"/><circle cx="9" cy="7" r="4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  paperclip:
    '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  checkcheck: '<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  tick: '<path d="M20 6 9 17l-5-5"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  filebar:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M8 18v-2M12 18v-4M16 18v-6"/>',
  calcheck:
    '<path d="M8 2v4M16 2v4M3 10h18M9 16l2 2 4-4"/><rect width="18" height="18" x="3" y="4" rx="2"/>',
  target:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  userround: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  sparkles:
    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3ZM5 3v4M19 17v4M3 5h4M17 19h4"/>',
  lockkey:
    '<circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
  activity:
    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  gavel: '<path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  shieldalert:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zM12 8v4M12 16h.01"/>',
  phone:
    '<path d="M13.83 16.57a1 1 0 0 0 1.21-.3l.36-.47A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.47.35a1 1 0 0 0-.29 1.23 14 14 0 0 0 6.39 6.39"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
});
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

// Helvetica's widths, for the report pages' lines (NEW-REPORT-PAGES).
const { widthOf } = require("./helvetica.cjs");

module.exports = function portals({ P, D, EMBLEM, MASCOT, BN_MARK }) {
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
    foot = "",
  }) {
    return `<div class="pt ${kind}">
      <aside class="side">
        <div class="brand">${emb(kind === "cli" ? 24 : 30)}<div><div class="t">AURIXA SYSTEMS</div><div class="s ${kind === "bld" ? "mono" : ""}">${label}</div></div>
          <span class="bell" style="width:14px;height:14px;display:inline-flex">${icon("bell", "#aab")}</span></div>
        <div class="who"><div style="display:flex;gap:10px;align-items:center"><div class="av">${initials}</div><div><div class="n">${who}</div><div class="o">${org}</div></div></div>${chips}</div>
        <nav>${nav(items)}</nav>${foot}
      </aside>
      <section class="main">
        <div class="top">${top || ""}<div class="me"><span class="demo">Demo workspace</span><span style="width:15px;height:15px;display:inline-flex">${icon("bell", "#aab")}</span><div class="av">${initials}</div>${who}</div></div>
        <div class="body">${body}</div>
      </section>${extra}
    </div>`;
  }

  // ---------------------------------------------------------------- Command Centre (Alex)
  // After the supplied Reports page: its menu groups and items, top bar, banner, Manual / URL
  // Extraction / PDF Upload tabs, build-type cards and the floating Aurixa emblem. The tenant is
  // Aurixa Systems and the signed-in user is Alex; the pages past Reports follow its components.
  const svg = (name, color = "currentColor", w = 1.8) => icon(name, color, w);
  const ccGroups = (on) =>
    [
      [
        "MAIN DASHBOARD",
        [
          ["home", "Overview"],
          ["news", "Market News Feed"],
          ["building", "Property Marketplace"],
          ["building", "Commercial / Industrial"],
          ["calendar", "Calendar"],
        ],
      ],
      ["AML/CTF COMPLIANCE", [["shieldok", "AML/CTF Compliance"]]],
      [
        "REPORTS & ANALYSIS",
        [
          ["bars", "Reports"],
          ["bars", "Quantitative Reports"],
          ["file", "Generated Reports"],
          ["pulse", "Cash Flow Analysis"],
          ["msg", "Aurixa Intelligence Hub"],
          ["file", "Portfolio Reports"],
          ["send", "Report Requests"],
          ["bars", "Charts"],
        ],
      ],
      // The registry's Client & CRM group (src/lib/navigation/registry.ts): below the fold on every
      // page but the Message Hub, whose menu is scrolled to it.
      [
        "CLIENT &amp; CRM",
        [
          ["users", "Clients"],
          ["target", "Client Tracker"],
          ["chat", "CRM Conversations"],
          ["inbox", "Message Hub"],
          ["sparkles", "Email Copilot"],
          ["phone", "Call Logs"],
        ],
      ],
    ]
      .map(
        ([head, items]) =>
          `<div class="grp"><h6>${head}${svg("chevron", "#B48D3C", 2)}</h6>${items
            .map(([ic, label]) => `<a class="${label === on ? "on" : ""}">${svg(ic)}${label}</a>`)
            .join("")}</div>`,
      )
      .join("");
  // `sideScroll`: the menu scrolled down by that much, as it is when its lower groups were reached.
  const cc = (on, col, extra = "", plain = false, sideScroll = 0) => `<div class="ccr">
    <aside class="cside">
      <div class="tenant">${emb(40)}<div><div class="t">AURIXA SYSTEMS</div><div class="s">COMMAND CENTRE</div></div></div>
      <div class="filter">${svg("search", "#8a8a8f")}Filter navigation...</div>
      ${sideScroll ? `<div style="flex:1;min-height:0;overflow:hidden"><div style="transform:translateY(-${sideScroll}px)">${ccGroups(on)}</div></div>` : ccGroups(on)}
    </aside>
    <section class="cmain">
      <div class="ctop"><div class="ibtn">${svg("panel", "#d5d5da")}</div><div class="csearch">${svg("search", "#5d5d63")}Search properties...</div>
        <div class="right"><span class="cdemo">DEMO WORKSPACE</span><div class="ibtn">${svg("sun", "#3d63ff")}</div><div class="chip">${svg("link", "#e8e8ec")}260k</div>
          <div class="ibtn">${svg("bell", "#e8e8ec")}</div><div class="chip"><span class="ini">AM</span>Alex Morgan</div></div></div>
      <div class="stage"><div class="col${plain ? " plain" : ""}">${col}</div>${extra}</div>
    </section>
  </div>`;
  const banner = (
    title,
    sub,
    right,
    eyebrow = "AURIXA REPORTING COMMAND CENTRE",
  ) => `<div class="cbanner"><div class="itile">${svg("trend", "#3d63ff", 2)}</div>
    <div style="flex:1"><div class="eb">${eyebrow}</div><div class="h1">${title}</div><div class="sub">${sub}</div></div>
    <div style="align-self:flex-end;margin-bottom:-2px">${right}</div></div>`;
  const reportsBanner = banner(
    "Reports",
    "Generate property investment reports and analysis.",
    `<div class="cgbtn">${svg("file", "#fff")}Recent Reports</div>`,
  );
  const generatedBanner = banner(
    "Generated Reports",
    "Reports prepared for your clients and their property teams.",
    `<div class="cgbtn">${svg("file", "#fff")}All Reports</div>`,
  );
  // The property Alex is preparing, on the right of the workspace section: P keeps this place
  // from 04B into 05A (the selected-property match).
  const ctx = `<div class="cctx">${pimg(118, 74)}<div><div class="kick" style="font-size:8.5px;letter-spacing:.24em">PREPARING FOR JORDAN ELLIS</div>
    <div class="n" style="margin-top:7px">Project Banksia / Residence 014</div><div class="m">BK-014 · Demo workspace</div></div></div>`;
  const workspace = `<div class="sec"><div><div class="kick">INVESTMENT REPORT WORKSPACE</div><div class="h2">Investment Report Generator</div>
    <div class="desc">Generate comprehensive property investment analysis for addresses, postcodes, or states across Australia.</div></div>${ctx}</div>`;
  const types = (selected) => {
    const card = (ic, t, s, on, pointer) =>
      `<div class="type ${on ? "on" : ""}">${svg(ic, on ? "#2a4cf0" : "#e6e6ea", 1.6)}<div class="t">${t}</div><div class="s">${s}</div>${pointer ? cur("left:74%;top:46%") : ""}</div>`;
    return `<div class="ana"><div class="hd"><div class="t">${svg("trend", "#fff", 2)}Generate Investment Analysis</div>
        <div class="d">Choose your input method - enter details manually, extract from a URL, or upload a PDF.</div></div>
      <div class="tabsbox"><div class="seg"><div class="on">${svg("pin", "#fff")}Manual</div><div>${svg("link", "#9a9aa1")}URL Extraction</div><div>${svg("upload", "#9a9aa1")}PDF Upload</div></div></div>
      <div class="box"><div class="lab">BUILD TYPE</div><div class="types">
        ${card("home", "EXISTING PROPERTY", "ESTABLISHED HOME", !selected)}
        ${card("building", "NEW BUILD", "HOUSE &amp; LAND PACKAGE", selected, !selected)}
        ${card("pin", "LAND ONLY", "VACANT LAND", false)}</div></div></div>`;
  };
  // The agent's presence, rendered from the portals' own sources (mascot.cjs), at rest and without her counts.
  const mascot = (size) =>
    MASCOT
      ? `<img src="${MASCOT}" alt="Aurixa" style="width:${size}px;height:${size}px;display:block;object-fit:contain">`
      : emb(size);
  const fab = (hover) =>
    `<div class="qfab">${mascot(96)}${hover ? cur("left:52px;top:56px") : ""}</div>${hover ? `<div class="qtip">Aurixa</div>` : ""}`;

  // ---- After the supplied Command Centre pages (Generated Reports, an investment report, the agent
  // open over it, and Overview): their structure and wording, with the demo's Residence 014.
  const pill = (t, cls = "") => `<span class="qpill ${cls}">${t}</span>`;
  const qbtn = (ic, t, cls = "", extra = "") =>
    `<div class="qbtn ${cls}">${ic ? svg(ic, "currentColor", 1.9) : ""}${t}${extra}</div>`;
  const grade = (g, tone = "gold") => `<div class="qgrade ${tone}">${g}</div>`;

  // The investment report's tier switcher: Compass made; the others prepared from it.
  const tiers = (state) => {
    const b = (name, tone, { made = false, on = false, busy = false, pointer = false } = {}) =>
      `<div class="qtier ${tone}${on ? " on" : ""}">${made ? svg(name === "Compass" ? "spark" : "pulse", "currentColor", 1.9) : busy ? '<span class="qspin"></span>' : "<b>+</b>"}${name}${pointer ? onIt() : ""}</div>`;
    return `<div class="qtiers"><div class="qtrow">${b("Compass", "blue", { made: true, on: true })}${b(
      "Financial",
      "red",
      {
        pointer: state === "compass",
        busy: state === "financial-preparing",
        made: state === "financial",
      },
    )}</div>
      <div class="qtrow">${b("Strategic", "indigo")}${b("Briefing", "teal")}</div><div class="qtrow">${b("Snapshot", "green")}</div></div>`;
  };
  const investmentReport = (
    state,
    scroll = 0,
  ) => `<div class="qrep" style="margin-top:${-scroll}px">
    <div class="qbar">
      <div><div style="display:flex;gap:10px;align-items:center">${qbtn("file", "Generated Reports")}<div class="qlink">${svg("arrowl", "#e5e5ea", 2)}Back</div></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:14px">${pill("Compass", "dark")}<b style="font-size:13px">Project Banksia / Residence 014</b></div></div>
      ${tiers(state)}
      <div style="display:flex;gap:8px;align-items:center">${qbtn("layers", "Choose template")}${qbtn("upload", "Export PDF", "blue")}${qbtn("send", "Send to Client")}${qbtn("", "··· More")}</div>
    </div>
    <div class="qcol">
      <div class="qhero"><div style="flex:1">
          <div style="display:flex;gap:8px">${pill("✧ Investment Report", "dark")}${pill("Compass", "dark")}${pill("ⓘ 4 Adjustments", "violet")}</div>
          <div class="qtitle">Project Banksia /<br>Residence 014</div>
          <div class="qmeta">${svg("calendar", "#a1a1aa", 1.8)}Generated Oct 21, 2026, 9:41 AM <span style="margin-left:14px"></span>${svg("file", "#a1a1aa", 1.8)}Internal report</div>
          <div class="qmeta">${svg("check", "#a1a1aa", 1.8)}Completed</div></div>
        <div class="qgradebox">${grade("B+", "gold")}<div><b style="font-size:14px">Investment Grade</b><div class="qsmall">Assessed on 3 of 5 dimensions: capital growth, location and rental yield.</div></div></div>
      </div>
      <div class="qstats5">
        <div class="qstat"><div class="l">Investment grade</div><div class="v">B+</div><div class="d">Measured across capital growth, location and rental yield</div></div>
        <div class="qstat"><div class="l">Score /100</div><div class="v"><span style="color:#f5c542">★</span> <span style="color:#e5b93a">74</span> <span class="d" style="font-size:13px">/100</span></div><div class="d">Qualified score — based on 3 of 5 assessed dimensions</div></div>
        <div class="qstat"><div class="l">Report tier</div><div class="v">Compass</div></div>
        <div class="qstat"><div class="l">Manual overrides</div><div class="v">4</div><div class="d">Adjusted fields</div></div>
        <div class="qstat"><div class="l">Report status</div><div class="v">Completed</div><div class="d">Internal report</div></div>
      </div>
      <div class="qnote"><span>${
        state === "compass"
          ? "Not prepared from this Compass yet: Financial, Strategic, Briefing, Snapshot. One click prepares all 4 at the same time — 2 are model runs."
          : state === "financial-preparing"
            ? "Preparing Financial from this Compass. Not prepared yet: Strategic, Briefing, Snapshot."
            : "Prepared from this Compass: Financial. Not prepared yet: Strategic, Briefing, Snapshot."
      }</span>${qbtn("layers", state === "compass" ? "Prepare all 4 reports" : "Prepare the other 3")}</div>
      <div style="display:flex;gap:22px;align-items:flex-start">
        <div class="qcard" style="flex:1.75"><div style="display:flex;align-items:center"><b style="font-size:15px">${svg("trend", "#fff", 2)} Analysis Report</b><span style="margin-left:auto">${qbtn("upload", "Raw text", "ghost")}</span></div>
          <div class="qsmall">Client-facing document view for Project Banksia / Residence 014</div></div>
        <div class="qcard" style="flex:1"><b style="font-size:15px">${svg("upload", "#fff", 2)} Publishing &amp; Export</b><div class="qsmall">Configure report content, generate PDFs, and manage premium styling.</div></div>
      </div>
    </div></div>`;

  // Generated Reports: the library, Residence 014's card first.
  const reportCard = (title, tags, g, score, pointer) => `<div class="qrcard">
      <div style="display:flex;gap:10px"><span class="qpin">${svg("pin", "#3d63ff", 1.9)}</span><div style="flex:1"><div class="qrtitle">${title}</div>
        <div class="qsmall" style="margin-top:4px">Latest Oct 21, 2026, 9:41 AM · completed</div>
        <div class="qtags">${tags.map((t) => `<span>${t}</span>`).join("")}</div>
        <div class="qgtile">${grade(g, "gold")}<div style="flex:1"><div class="l">INVESTMENT GRADE</div><b style="font-size:12.5px">Under review</b><div class="qsmall" style="font-size:9.5px">Qualified score</div></div>
          <div style="text-align:right"><div style="color:#e5b93a;font-size:21px;font-weight:700">${score}</div><div class="qsmall" style="font-size:10px">/100 score</div></div></div></div>
        <div style="display:flex;gap:8px;align-items:flex-start">${svg("inbox", "#d4d4d8", 1.8)}<span class="qver">${svg("layers", "#e5e5ea", 1.9)}${tags.length} ⌄</span></div></div>${pointer ? cur("left:46%;top:16%") : ""}</div>`;
  const generatedReports = (pointer) => `<div class="qpage">
    <div class="qbanner"><div style="display:flex;align-items:flex-start"><div>${pill("REPORT INTELLIGENCE LIBRARY", "eyebrow")}<div class="qh1">Generated Reports</div>
        <div class="qsub">Search, review, compare, archive, and export every generated property report from one governed workspace.</div></div>
        <div style="margin-left:auto;display:flex;gap:8px">${pill("Archived hidden", "dark")}${pill("0 active filters", "dark")}</div></div>
      <div class="qstats5" style="margin-top:22px">${[
        ["TOTAL REPORTS", "6", "layers"],
        ["INVESTMENT REPORTS", "3", "trend"],
        ["COMPARISON ANALYSES", "3", "file"],
        ["CURRENTLY VISIBLE", "6", "inbox"],
        ["ACTIVE FILTERS", "0", "search"],
      ]
        .map(
          ([l, v, ic]) =>
            `<div class="qstat"><div class="l" style="display:flex">${l}<span style="margin-left:auto">${svg(ic, "#8b7cf6", 1.8)}</span></div><div class="v" style="font-size:22px">${v}</div></div>`,
        )
        .join("")}</div></div>
    <div class="qcats">${[
      ["trend", "Investment", "Property, suburb, postcode, and state intelligence", 3, true],
      ["pin", "Comparisons", "Multi-property decision analysis", 3, false],
      [
        "building",
        "Commercial &amp; Industrial",
        "Capacity reports from your assessments",
        0,
        false,
      ],
    ]
      .map(
        ([ic, t, d, n, on]) =>
          `<div class="qcat${on ? " on" : ""}"><span class="qicon">${svg(ic, on ? "#3d63ff" : "#a1a1aa", 1.8)}</span><div style="flex:1"><b>${t}</b><div class="qsmall">${d}</div></div><span class="qcount">${n}</span></div>`,
      )
      .join("")}</div>
    <div class="qtools"><div class="qsearch">${svg("search", "#a1a1aa", 1.9)}Search by property address...</div>
      <div class="qseg">${qbtn("grid", "Cards", "on")}${qbtn("file", "Table")}</div>${qbtn("search", "Filters ⌄")}${qbtn("inbox", "Show Archived")}
      <div class="qcountbox"><b>3 of 3 reports</b><div>Showing last 30 days</div></div></div>
    <div class="qcards">${reportCard("Project Banksia / Residence 014", ["Compass", "Financial", "Strategic", "Snapshot", "Briefing"], "B+", 74, pointer)}
      ${reportCard("Project Banksia / Residence 015", ["Compass", "Financial"], "B", 68)}${reportCard("Project Banksia / Residence 016", ["Compass"], "B+", 71)}</div>
  </div>`;

  // The agent, open over the page: Alex's ask, Aurixa's draft for Jordan as a go-ahead card, and her edit.
  const agentPanel = (state) => {
    const bodyOf = (approved) =>
      approved
        ? "Hi Jordan, your client summary for Residence 014 is ready. Next step: review the remaining questions together."
        : "Hi Jordan, your client summary for Residence 014 is ready. Next step: discuss the next step.";
    // The go-ahead card as AgentApprovalCard draws it: its status as the heading, the act named in plain
    // words from the tool call (summarisePendingActions: "Send an email", then who and what about), the
    // email preview the widget passes in, and Approve / Cancel while pending or "Approved" once given.
    const approval = (approved) => `<div class="qappr${approved ? " given" : ""}">
      <div class="qapprh">${svg("shieldok", approved ? "#8c8c8c" : "#e5b93a", 2)}${approved ? "Approved" : "Needs your go-ahead"}</div>
      <div class="qact"><span class="qacti">${svg("mail", "currentColor", 2)}</span><div style="min-width:0"><b>Send an email</b><span class="d">To jordan.ellis@example.com · Residence 014: your client summary</span></div></div>
      <div class="qapprb"><div class="qmail"><div class="qmailh">📧 Email Preview</div><div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div><span class="m">From:</span> <span class="qchip on">🏢 Admin</span> <span class="qchip">👤 Personal</span></div>
        <div><span class="m">To:</span> <b>jordan.ellis@example.com</b></div><div><span class="m">Subject:</span> <b>Residence 014: your client summary</b></div>
        <div class="qbody"><div class="m" style="font-size:9.5px;letter-spacing:.12em;margin-bottom:4px">BODY</div>${bodyOf(approved)}</div></div></div></div>
      ${approved ? `<div class="qapprf">${svg("tick", "currentColor", 2.2)}Approved</div>` : `<div class="qapprk">${qbtn("tick", "Approve", "blue wide")}${qbtn("xcircle", "Cancel", "wide")}</div>`}</div>`;
    return `<div class="qagent">
      <div class="qagh">${mascot(50)}<div><b style="font-size:15px">Aurixa</b><div class="qsmall" style="font-size:12px">Ready when you are</div></div>
        <div style="margin-left:auto;display:flex;gap:14px;align-items:center">${["msg", "refresh", "users", "bell"].map((i) => svg(i, "#c4c4cc", 1.7)).join("")}<span style="color:#c4c4cc">···</span><span style="color:#c4c4cc;font-size:18px">×</span></div></div>
      <div class="qagb">
        <div class="qubub">Draft a short note to Jordan Ellis about his Residence 014 client summary.</div>
        <div class="qtrace"><span class="qorb"></span>Worked for 4s · 1 step<span style="margin-left:auto">⌄</span></div>
        <div style="font-size:13px;line-height:1.55">Here is a draft for <b>Jordan Ellis</b>. Nothing is sent until you give it the go-ahead.</div>
        ${approval(false)}
        ${
          state === "approved"
            ? `<div class="qubub">Make the next step: review the remaining questions together.</div>
          <div class="qtrace"><span class="qorb"></span>Worked for 3s · 1 step<span style="margin-left:auto">⌄</span></div>${approval(true)}`
            : ""
        }
      </div>
      <div class="qagf"><div style="display:flex">${pill("ⓘ General assistant · pick a skill", "dark")}<span style="margin-left:auto">${pill("⌖ Share this page", "dashed")}</span></div>
        <div class="qinput"><span style="color:#8b8b93">${svg("clip", "#8b8b93", 1.7)}</span>${
          state === "editing"
            ? `<span style="color:#f4f4f5">Make the next step: review the remaining questions together<span class="qcaret"></span></span>`
            : `<span style="color:#77777f">Plan tomorrow's briefing...</span>`
        }<span style="margin-left:auto" class="qmic">${svg("msg", "#c4c4cc", 1.7)}</span><span class="qtalk">${svg("pulse", "#fff", 2)}Talk</span></div>
        <div class="qhint"><span>↵ SEND · ⇧↵ NEWLINE · CTRL+J CLOSE</span><span>Aurixa may make mistakes</span></div></div></div>`;
  };

  // Overview, in the demo workspace, with the demo's project for the cut to Daniel's stock list.
  const overview = `<div class="qpage">
    <div class="qbanner" style="background:radial-gradient(420px 220px at 30% 10%, rgba(120,90,30,.25), transparent 70%), radial-gradient(600px 260px at 70% 60%, rgba(30,70,140,.25), transparent 70%), #0d0f17">
      <div style="display:flex;align-items:flex-start"><div>${pill("⦿ COMMAND CENTRE", "eyebrow gold")}<div class="qh1" style="font-size:44px">Overview</div><div class="qsub">Property intake dashboard overview and key metrics</div></div>
        <div style="margin-left:auto;display:flex;gap:8px">${qbtn("upload", "Export Snapshot")}${qbtn("refresh", "")}${qbtn("search", "Filters")}</div></div></div>
    <div class="qops"><div class="qeb">● OPERATIONS</div><div style="display:flex;gap:12px;align-items:center;margin-top:10px"><span class="qicon gold">⚡</span><div><b style="font-size:18px">Today's position</b><div class="qsmall" style="font-size:12.5px">Actionable operational metrics and shortcuts, available on every plan.</div></div></div>
      <div class="qchips">${["Add Client", "Create Report", "Add Reminder", "Open Calendar", "Cash-Flow Analysis", "Market News Feed", "Commercial Assessment", "Compare Reports", "Deal Pipeline", "Property Marketplace"].map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="qtiles">${[
        ["TASKS DUE TODAY", "0", "Reminders and follow-ups due today", "bell", ""],
        ["OVERDUE TASKS", "0", "Past-due reminders needing attention", "alert", ""],
        ["DUE THIS WEEK", "2", "Upcoming tasks and milestones (7 days)", "calendar", ""],
        ["REPORTS THIS MONTH", "3", "Investment reports generated this month", "file", "green"],
      ]
        .map(
          ([l, v, d, ic, tone]) =>
            `<div class="qtile ${tone}"><div style="display:flex"><span class="l">${l}</span><span class="qicon sq ${tone}" style="margin-left:auto">${svg(ic, tone ? "#22c55e" : "#3d63ff", 1.8)}</span></div><div class="v">${v}</div><div class="qsmall">${d}</div></div>`,
        )
        .join("")}</div></div>
    <div class="qops" style="padding-bottom:18px"><div class="qeb">● EXECUTIVE SNAPSHOT</div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:12px"><div class="qproj">${pimg(150, 94)}<div><div class="qeb" style="color:#7d97ff">DEMO PROJECT</div><b style="font-size:20px">Residence 014</b><div class="qsmall">Project Banksia · New Build</div></div></div>
        <div><b style="font-size:18px">Intake performance</b><div class="qsmall" style="font-size:12.5px">Headline operating metrics for the filtered property pipeline.</div></div></div></div>
  </div>`;
  // ---------------------------------------------------------------- Finance (Jamie)
  // After the Finance portal's code (FinancePortalLayout, FinancePortalPurchaseFileDetail, DealTrackerTabs) in
  // the supplied screenshot's colours: a purchase file, its tab strip and the Finance Decisions tab.
  const finItems = (on) => [
    ["grid", "Dashboard", on === "dash"],
    ["shield", "AML/CTF Compliance", false],
    ["case", "Active Purchase Files", on === "files"],
    ["layers", "Pipeline Kanban", false],
    ["users", "My Clients", false],
    ["chat", "Message Hub", false],
    ["inbox", "Client Inbox", false],
    ["swap", "Referrals", false],
    ["file", "Lender Intelligence", false],
    ["trend", "Pipeline Insights", false],
    ["chart", "Reports &amp; KPIs", false],
    ["case", "Earnings", false],
  ];
  const ic = (name, color = "currentColor", size = 13, w = 1.9) =>
    `<span style="width:${size}px;height:${size}px;display:inline-flex;flex:none">${icon(name, color, w)}</span>`;
  const finSearch = `<div class="search" style="margin-left:auto;min-width:220px">${ic("search", "#8d95a8")}Search…<span class="kbd">⌘K</span></div>`;
  // `on: "dash"` is the portal's home page, which has no way back to itself.
  const fin = (body, extra = "", { on = "files" } = {}) =>
    shell({
      kind: "fin",
      label: "FINANCE PORTAL",
      who: "Jamie Chen",
      org: "Harbour Finance Group",
      initials: "JC",
      items: finItems(on),
      top: `${on === "dash" ? "" : `<div class="fback">${ic("arrowl", "#c3c8d4")}Back to dashboard</div>`}${finSearch}`,
      body,
      extra: `<div class="fab">+</div>${extra}`,
    });
  const TABS = [
    "Overview",
    "Critical Dates",
    "Documents",
    "Finance Decisions",
    "Action Items",
    "Conditions",
    "Valuation",
    "Risks",
    "Settlement Runway",
  ];
  const TAB_ICON = {
    Overview: "case",
    "Critical Dates": "calendar",
    Documents: "file",
    "Finance Decisions": "spark",
    "Action Items": "tasks",
    Conditions: "shield",
    Valuation: "case",
    Risks: "alert",
    "Settlement Runway": "trend",
  };
  const purchaseFile = (tab, body, pointerOn) => `
    <div class="fbar"><b>Residence 014, Project Banksia</b><span class="pill" style="margin-left:8px">Active</span>
      <div style="margin-left:auto;display:flex;gap:4px">${[
        ["calendar", "Dates"],
        ["file", "Docs"],
        ["spark", "Decisions"],
        ["chat", "Message"],
      ]
        .map(([i, t]) => `<span class="fghost">${ic(i, "#c3c8d4", 12)}${t}</span>`)
        .join("")}
        <span class="fghost on">${ic("eye", "#7d97ff", 12)}Watching</span></div></div>
    <div class="fghost" style="align-self:flex-start;margin:-4px 0 -6px -8px">${ic("arrowl", "#c3c8d4", 12)}All purchase files</div>
    <div style="display:flex;align-items:flex-start;gap:14px">${pimg(118, 74)}
      <div style="flex:1"><div style="display:flex;align-items:center;gap:9px">${ic("case", "#4767ff", 20)}<span style="font-size:23px;font-weight:700;letter-spacing:-.01em">Residence 014, Project Banksia</span></div>
        <div class="sub" style="margin-top:6px">Jordan Ellis · Residence 014, Project Banksia NSW</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px"><span class="fsel" style="width:150px">Active</span><span class="fsel" style="width:200px">In Assessment</span>
        <span class="btn ghost" style="font-size:11.5px;padding:7px 12px">${ic("trend", "#fff", 12)}Record outcome</span></div></div>
    <div class="ftabs"><span class="fchev">‹</span>${TABS.map((t) => `<span class="ftab ${t === tab ? "on" : ""}">${ic(TAB_ICON[t], t === tab ? "#fff" : "#9aa3b5", 12)}${t}${t === pointerOn ? onIt() : ""}</span>`).join("")}<span class="fchev" style="margin-left:auto">›</span></div>
    ${body}`;
  const fileSummary = `<div class="panel fsum"><div class="ph">${ic("spark", "#4767ff", 15)}Intelligent File Summary<span class="qsm" style="margin-left:auto">2 hours ago</span></div>
      <div style="font-size:13px;font-weight:700">Residence 014 is in assessment for Jordan Ellis</div><div class="ps" style="margin-top:-8px">Docs received · lender shortlist in progress</div>
      <div style="display:flex;gap:28px"><div style="flex:1"><div class="qsm" style="font-weight:700;color:#cfd5e2">${ic("file", "#cfd5e2", 11)} Outstanding documents</div><ul class="fli"><li>Latest two payslips</li><li>Signed privacy consent</li></ul></div>
        <div style="flex:1"><div class="qsm" style="font-weight:700;color:#D7B35F">${ic("alert", "#D7B35F", 11)} Watch-outs</div><ul class="fli"><li>Valuation not yet ordered</li></ul></div></div>
      <div class="fnext">${ic("search", "#4767ff", 12)}<span><b>Next best action:</b> record the finance position for Residence 014 before the client summary goes out.</span></div></div>`;
  const overviewTab = `${fileSummary}<div class="row">
      <div class="panel" style="flex:1"><div class="ph">Property</div>${[["Address", "Residence 014, Project Banksia"]].map(([l, v]) => `<div><div class="flab">${l}</div><div class="fin">${v}</div></div>`).join("")}
        <div class="row" style="gap:8px">${[
          ["Suburb", "Banksia Rise"],
          ["State", "NSW"],
          ["Postcode", "2155"],
        ]
          .map(
            ([l, v]) =>
              `<div style="flex:1"><div class="flab">${l}</div><div class="fin">${v}</div></div>`,
          )
          .join("")}</div></div>
      <div class="panel" style="flex:1"><div class="ph">Finance</div>${[
        ["Lender", "Shortlist in progress"],
        ["Risk Level", "Low"],
      ]
        .map(([l, v]) => `<div><div class="flab">${l}</div><div class="fin">${v}</div></div>`)
        .join("")}</div></div>`;
  const OUTCOME = {
    info: ["More information required", "#30B9FD", "search"],
    valuation: ["Subject to valuation", "#a7adb9", "case"],
    deposit: ["Subject to deposit", "#a7adb9", "case"],
  };
  const position = (key, notes, when) => {
    const [label, color, icn] = OUTCOME[key];
    return `<div class="fpos" style="border-color:${color}55"><span class="fposi" style="background:${color}26">${ic(icn, color, 22)}</span>
      <div style="flex:1"><div class="flab" style="letter-spacing:.12em">CURRENT FINANCE POSITION</div><div style="font-size:21px;font-weight:700;color:${color};margin-top:4px">${label}</div>
        <div class="ps" style="margin-top:6px;font-size:12px">${notes}</div><div class="qsm" style="margin-top:6px">Pathway to be confirmed · ${when}</div></div>
      <span class="btn" style="align-self:flex-start;font-size:12px;padding:8px 13px">+ New decision</span></div>`;
  };
  const history = (rows) =>
    `<div class="panel"><div class="ph">Decision history</div>${rows
      .map(([key, notes, when]) => {
        const [label, color, icn] = OUTCOME[key];
        return `<div class="line" style="padding:10px 12px"><span class="fposi sm" style="background:${color}26">${ic(icn, color, 13)}</span><div style="flex:1"><div class="a" style="font-size:12.5px">${label}</div><div class="b">${notes}</div></div><span class="qsm">${when}</span></div>`;
      })
      .join("")}</div>`;
  const INFO = [
    "info",
    "Waiting on the latest two payslips before the lender shortlist is final.",
    "21/10/2026, 9:12 am",
  ];
  const DEPOSIT = ["deposit", "Deposit source confirmed with the client.", "14/10/2026, 4:30 pm"];
  const VALUATION = [
    "valuation",
    "Valuation ordered with the lender; revisit once it returns.",
    "21/10/2026, 10:42 am",
  ];
  const decisionsTab = (state) =>
    state === "recorded"
      ? `${position(...VALUATION)}${history([VALUATION, INFO, DEPOSIT])}`
      : `${position(...INFO)}${history([INFO, DEPOSIT])}`;
  // Jamie's call, about to be recorded (13A-a), and the toast after it (13A-b).
  const decisionDialog = `<div class="fscrim"></div><div class="fdlg"><div style="font-size:17px;font-weight:700">Record finance decision</div>
      <div class="ps" style="margin-top:2px">Broker's call on whether this purchase can proceed. Caution / Not suitable will auto-raise a finance risk.</div>
      <div><div class="flab">Decision</div><div class="fin sel">Subject to valuation<span style="margin-left:auto">⌄</span></div></div>
      <div class="row" style="gap:10px">${[
        ["Max comfortable purchase price ($)", "1,150,000"],
        ["Proposed loan amount ($)", "920,000"],
      ]
        .map(
          ([l, v]) =>
            `<div style="flex:1"><div class="flab">${l}</div><div class="fin">${v}</div></div>`,
        )
        .join("")}</div>
      <div class="row" style="gap:10px">${[
        ["Preferred lender pathway", "Shortlist in progress"],
        ["LVR (%)", "80"],
      ]
        .map(
          ([l, v]) =>
            `<div style="flex:1"><div class="flab">${l}</div><div class="fin">${v}</div></div>`,
        )
        .join("")}</div>
      <div><div class="flab">Broker notes</div><div class="fin" style="height:52px;align-items:flex-start;padding-top:8px">Valuation ordered with the lender; revisit once it returns.</div></div>
      <div style="display:flex;justify-content:flex-end;gap:8px"><span class="btn ghost" style="font-size:12px;padding:8px 14px">Cancel</span><span class="btn" style="font-size:12px;padding:8px 14px">Record decision${onIt()}</span></div></div>`;
  const toast = (text) =>
    `<div class="ftoast">${ic("check", "#45d58a", 15)}${text}<span style="margin-left:14px;color:#8d95a8">×</span></div>`;

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
    ["file", "Reports", on === "reports"],
    ["chat", "Message Hub", false],
    ["bell", "Notifications", false],
    ["calendar", "My Appointments", on === "appointments"],
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
  // After PortalPropertyTeam and PropertyTeamPanel: the product's four roles, and the demo project's builder beside them.
  const TEAM = [
    ["case", "BUYER'S AGENT", "Alex Morgan", "Aurixa Systems · Property"],
    ["building", "FINANCE BROKER", "Jamie Chen", "Harbour Finance Group"],
    ["shield", "SOLICITOR / CONVEYANCER", "Priya Shah", "Shah Legal"],
    ["chart", "ACCOUNTANT", "Mia Patel", "Patel &amp; Co Accountants"],
    ["building", "BUILDER / DEVELOPER", "Daniel Reed", "Reed Constructions · Project Banksia"],
  ];
  const cliWelcome = `<div class="banner" style="padding:16px 18px"><div class="av" style="width:40px;height:40px;font-size:13px">JE</div><div><div class="eb">WELCOME BACK</div>
    <div class="h1" style="font-size:22px">Jordan Ellis</div><div class="sub" style="font-size:11px">Here's the opportunity you're considering and the team around it.</div></div></div>`;
  const propertyTeam = `<div class="banner" style="padding:14px 18px;display:block"><div class="eb">${ic("users", "#3556f0", 10)}YOUR TEAM</div>
      <div class="h1" style="font-size:22px">My property team</div><div class="sub" style="font-size:10.5px">Your buyer's agent, finance broker, solicitor, accountant and builder work on your purchase together. Here is who they are, how to reach them, and anything they need from you.</div></div>
    <div class="panel" style="padding:12px 14px;gap:8px"><div class="ph" style="font-size:12.5px">${ic("users", "#3556f0", 13)}Who is working on your purchase<span class="pill" style="font-size:8.5px">5 of 5 roles engaged</span></div>
      <div class="ps" style="font-size:9.5px">The professionals working together on your purchase, and how to reach them.</div>
      <div class="tgrid">${TEAM.map(([i, r, n, o]) => `<div class="ttile"><span class="tic">${ic(i, "#4767ff", 14)}</span><div style="min-width:0"><div class="tr">${r}</div><div class="tn">${n}</div><div class="to">${o}</div><div class="tl">${ic("chat", "#4767ff", 9)}Message</div></div></div>`).join("")}</div></div>
    <div class="panel" style="padding:11px 14px;gap:6px"><div class="ph" style="font-size:12.5px">${ic("file", "#3556f0", 13)}What your accountant needs from you<span class="pill gold" style="font-size:8.5px">1 open</span></div>
      <div class="line" style="padding:9px 11px"><div style="flex:1"><div class="a" style="font-size:11.5px">FY2026 income statement</div><div class="b" style="font-size:9px">Income statement (PAYG) · from Patel &amp; Co · asked 3 days ago · please reply by 24 Oct 2026</div></div><span class="pill gold" style="font-size:8.5px">You replied</span></div></div>`;

  // ---------------------------------------------------------------- Accountant (Mia)
  // After AccountantPortalLayout and AccountantClientDetail: a client file's Requests tab; "Mark fulfilled" is her one click.
  const accItems = (on) => [
    ["grid", "Dashboard", on === "dash"],
    ["shield", "AML/CTF Compliance", false],
    ["users", "My Clients", on === "clients"],
    ["chat", "Message Hub", false],
    ["bell", "Notifications", false],
    ["gear", "Settings", false],
  ];
  const accFile = (fulfilled) =>
    shell({
      label: "ACCOUNTANT PORTAL",
      who: "Mia Patel",
      org: "Patel &amp; Co Accountants",
      initials: "MP",
      items: accItems("clients"),
      top: `<div class="fback">${ic("arrowl", "#c3c8d4")}Back to dashboard</div>`,
      body: `<div class="banner" style="align-items:flex-end"><div style="flex:1"><div class="eb">${ic("chart", "#3556f0", 11)}CLIENT FILE</div>
          <div class="h1">Jordan Ellis</div><div class="sub">Allocated 3 weeks ago · engaged for purchasing entity &amp; structuring, income evidence for finance, tax position on the purchase</div></div>
          <div style="display:flex;gap:8px"><span class="pill gold">${ic("clock", "#D7B35F", 10)} Entity: Recommended</span><span class="pill gold">${ic("clock", "#D7B35F", 10)} Income: Collecting</span></div></div>
        <div class="panel" style="flex-direction:row;padding:12px 18px">${[
          ["Email", "jordan.ellis@example.com"],
          ["Mobile", "0400 000 014"],
          ["Household", "Single · no dependants"],
          ["State", "NSW"],
        ]
          .map(
            ([l, v]) =>
              `<div style="flex:1"><div class="flab">${l}</div><div style="font-size:12.5px;font-weight:600;margin-top:3px">${v}</div></div>`,
          )
          .join("")}</div>
        <div class="atabs">${[
          ["check", "Brief"],
          ["home", "Portfolio"],
          ["building", "Purchases"],
          ["file", "Requests"],
          ["chat", "Message Hub"],
          ["users", "Property team"],
        ]
          .map(
            ([i, t]) =>
              `<span class="${t === "Requests" ? "on" : ""}">${ic(i, t === "Requests" ? "#fff" : "#9aa3b5", 12)}${t}</span>`,
          )
          .join("")}</div>
        <div class="row" style="align-items:flex-start">
          <div class="panel" style="flex:3"><div class="ph">Requests to the client</div><div class="ps">The client sees each one in their portal and can reply. Documents are still exchanged through your usual secure channel.</div>
            <div class="line areq ${fulfilled ? "" : "sel"}" style="flex-direction:column;align-items:stretch;gap:8px;padding:14px 16px">
              <div style="display:flex;align-items:flex-start"><div><div class="a" style="font-size:16px">FY2026 income statement</div><div class="b">Income statement (PAYG) · asked 3 days ago · due 24 Oct 2026</div></div>
                <span class="pill ${fulfilled ? "ok" : "gold"}" style="font-size:11px">${ic(fulfilled ? "check" : "clock", fulfilled ? "#45d58a" : "#D7B35F", 11)} ${fulfilled ? "Fulfilled" : "Client responded"}</span></div>
              <div class="b" style="font-size:12px;color:#c3c8d4">Your income statement from myGov, for the broker's income evidence.</div>
              <div class="areply"><b>Client replied 2 hours ago:</b> uploaded it to Documents and posted a printed copy to your office.</div>
              <div style="display:flex;gap:8px">${fulfilled ? `<span class="btn ghost" style="font-size:12px;padding:7px 13px">Reopen</span>` : `<span class="btn" style="font-size:12.5px;padding:8px 15px">Mark fulfilled${onIt()}</span><span class="btn ghost" style="font-size:12px;padding:7px 13px">Reopen</span><span class="btn ghost" style="font-size:12px;padding:7px 13px">Cancel</span>`}</div></div>
            <div class="line" style="padding:12px 16px"><div style="flex:1"><div class="a" style="font-size:13.5px">Photo ID</div><div class="b">Other · asked 2 weeks ago</div></div><span class="pill ok">${ic("check", "#45d58a", 11)} Fulfilled</span></div></div>
          <div class="panel" style="flex:2"><div class="ph">New request</div>${[
            ["What you need", "Choose a category"],
            ["Title", "e.g. FY2025 individual tax return"],
            ["Detail (optional)", ""],
            ["Due (optional)", "dd/mm/yyyy"],
          ]
            .map(
              ([l, v]) =>
                `<div><div class="flab">${l}</div><div class="fin" style="color:#6f778a">${v}</div></div>`,
            )
            .join("")}
            <span class="btn" style="justify-content:center;font-size:12.5px">${ic("file", "#fff", 12)}Send to client</span></div></div>`,
    });

  // ---------------------------------------------------------------- Browser windows and PDFs
  // A file opens in the browser's own tab (the portals have no in-page preview), so the scenes with a
  // floor plan or the report on screen draw the browser around the page: a dark tab strip, an address
  // bar and the browser's PDF viewer. Generic, with no browser maker's marks.
  const pdfIcon = `<span class="pdfic">PDF</span>`;
  const favicon = (mark) =>
    mark ? `<span class="fav" style="background-image:url('${mark}')"></span>` : pdfIcon;
  const browser = ({
    tabs,
    url,
    body,
    style = "",
    pointerTab,
  }) => `<div class="brw" style="${style}">
      <div class="btabs">${tabs.map(([mark, title, on], i) => `<div class="btab${on ? " on" : ""}">${favicon(mark)}<span class="tt">${title}</span><span class="x">×</span>${i === pointerTab ? cur("left:46%;top:14px") : ""}</div>`).join("")}<span class="bplus">+</span></div>
      <div class="bbar"><span class="bnav">${ic("arrowl", "#9aa0a6", 15)}${ic("arrow", "#5f6368", 15)}${ic("refresh", "#9aa0a6", 14)}</span>
        <div class="baddr">${url}</div><span class="bnav">${ic("dots", "#9aa0a6", 15)}</span></div>
      <div class="bview">${body}</div></div>`;
  /** The browser's PDF viewer: its toolbar, an optional page rail, and the page (HTML) on the grey stage. */
  const pdfViewer = ({
    title,
    page,
    pageOf,
    zoom,
    thumbs = "",
    stageStyle = "",
  }) => `<div class="pdfv">
      <div class="ptb"><span>${ic("menu", "#f1f3f4", 17)}</span><span class="pname">${title}</span>
        <div class="pmid"><span class="ppg"><b>${pageOf[0]}</b> / ${pageOf[1]}</span><span class="psep"></span>${ic("minus", "#f1f3f4", 16)}<span class="ppg"><b>${zoom}</b></span>${ic("plus", "#f1f3f4", 16)}<span class="psep"></span>${ic("fit", "#f1f3f4", 16)}${ic("rotate", "#f1f3f4", 16)}</div>
        <span style="display:flex;gap:18px">${ic("download", "#f1f3f4", 17)}${ic("printer", "#f1f3f4", 17)}${ic("dots", "#f1f3f4", 17)}</span></div>
      <div class="pmain">${thumbs}<div class="pstage" style="${stageStyle}">${page}</div></div></div>`;
  const planPage = (side) =>
    D
      ? `<div class="ppage" style="width:${side}px;height:${side}px;background:#fff url('${D}') center/contain no-repeat"></div>`
      : `<div class="ppage pimg pph" data-label="D · Residence 014 floor plan" style="width:${side}px;height:${side}px"></div>`;
  const PLAN_FILE = "floorplan-R014.pdf";
  // How far Daniel has scrolled his Stock List: to the Residence 014 plate.
  const STOCK_SCROLL = 316;

  // The client's report as the exported PDF delivers it (investmentPdfCover.ts): the issuer's cover, on
  // an A4 sheet of 595.5 × 842.25 pt, drawn at k px per pt. The issuer is Aurixa Systems; the grade and
  // score are not on the cover. PL-08B keeps the navy it was approved in; the report's own pages pass the
  // colours the product resolves for an issuer that set no brand colour (DOC, below).
  const reportCover = (k, { field = "#0C1526", gold = "#C9A14A", ink = "#FAF7F1" } = {}) => {
    const pt = (v) => `${(v * k).toFixed(2)}px`;
    const W = 595.5;
    const H = 842.25;
    const markH = 62; // the issuer mark's box is 220 × 62 pt
    const markW = markH * (679 / 628);
    const nameSize = 30; // "AURIXA SYSTEMS" fits one line at the first size tried
    const groupTop = 301 - (markH + 26 + nameSize * 0.662 + 16 + 18 + 9 * 0.718) / 2;
    const baseline = groupTop + markH + 26 + nameSize * 0.662;
    const rule = baseline + 16;
    const titleBase = rule + 18 + 9 * 0.718;
    const photoH = 230.25;
    const photoW = photoH * 1.5;
    const text = (top, size, family, color, tracking, body, weight = 400) =>
      `<div style="position:absolute;left:0;right:0;top:${pt(top - size * 0.84)};text-align:center;font:${weight} ${pt(size)}/1 ${family};letter-spacing:${pt(tracking)};color:${color};white-space:nowrap">${body}</div>`;
    return `<div class="ppage" style="width:${pt(W)};height:${pt(H)};background:${field}">
      <div style="position:absolute;left:${pt(22)};right:${pt(22)};top:${pt(590)};height:${pt(photoH)};display:flex;justify-content:center">
        ${P ? `<div style="width:${pt(photoW)};height:100%;background:url('${P}') center 38%/cover no-repeat"></div>` : `<div class="pimg pph" data-label="P" style="width:${pt(photoW)};height:100%"></div>`}</div>
      <div style="position:absolute;left:${pt(22)};right:${pt(22)};top:${pt(590)};border-top:${pt(0.75)} solid ${gold}"></div>
      <div style="position:absolute;inset:${pt(22)};border:${pt(0.6)} solid ${gold}"></div>
      <div style="position:absolute;left:${pt((W - markW) / 2)};top:${pt(groupTop)};width:${pt(markW)};height:${pt(markH)};${EMBLEM ? `background:url('${EMBLEM}') center/contain no-repeat` : `border:1px dashed ${gold}`}"></div>
      ${text(baseline, nameSize, "'Liberation Serif', 'Times New Roman', serif", gold, nameSize * 0.12, "AURIXA SYSTEMS")}
      <div style="position:absolute;left:${pt(W / 2 - 20)};width:${pt(40)};top:${pt(rule)};border-top:${pt(0.75)} solid ${gold}"></div>
      ${text(titleBase, 9, "'Liberation Sans', Helvetica, Arial, sans-serif", ink, 2.2, "INVESTMENT COMPASS")}
      <div style="position:absolute;left:${pt(70)};right:${pt(70)};top:${pt(560.5)};border-top:${pt(0.5)} solid ${gold}"></div>
      ${text(575.25 + 9 * 0.718 * 0.5, 9, "'Liberation Sans', Helvetica, Arial, sans-serif", ink, 1.2, "RESIDENCE 014, PROJECT BANKSIA, BANKSIA RISE NSW 2155")}
    </div>`;
  };
  // A content page in miniature for the page rail: white, with the black-and-gold corner shards.
  const miniPage = (inner) =>
    `<div class="mini"><i class="sh tl"></i><i class="sh br"></i>${inner}</div>`;
  const reportThumbs = `<div class="pthumbs">
      <div class="pt1 on">${reportCover(0.16)}<span>1</span></div>
      <div class="pt1">${miniPage(`<b style="font-size:5.5px;letter-spacing:.12em;color:#0D264D">TABLE OF CONTENTS</b>${"<u></u>".repeat(9)}`)}<span>2</span></div>
      <div class="pt1">${miniPage(`<b style="font-size:6px;color:#0D264D">Floor plan</b><em></em>${D ? `<div style="height:58px;background:url('${D}') center/contain no-repeat"></div>` : ""}`)}<span>3</span></div>
      <div class="pt1">${miniPage(`<b style="font-size:5.5px;color:#0D264D">Investment Compass</b><em></em><div class="kpi"><i></i><i></i></div>${"<u></u>".repeat(6)}`)}<span>4</span></div></div>`;

  // ---------------------------------------------------------------- The client's report, inside (NEW-REPORT-PAGES)
  // The standard Investment Compass PDF as npc-client-dashboard draws it for an issuer that set no brand colour
  // (investmentPdfDocument.ts, investmentPdfIssuerPage.ts, investmentPdfCover.ts; measured from a render of
  // that code on 21 Oct 2026): white pages under the issuer's running head, in the family brandFamily.pure.ts
  // resolves from no colour, with prose, the title and the headings in the code's own #333333. One CSS px is a
  // point of the A4 sheet. Helvetica is drawn in its metric twin, Liberation Sans, with kerning off, and lines
  // are broken and justified the way drawTextWithWrap breaks them (./helvetica.cjs), so they fall where the
  // product's PDF puts them.
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
  };
  const A4 = [595.5, 842.25];
  // Guardrail 2 (BRIEF.md): anything modelled carries the illustrative label on the page itself. The
  // product prints no such line; the film's pages carry it in the band above the first line of text.
  const ILLUSTRATIVE =
    "Illustrative example only: hypothetical client, figures and assumptions. Not a credit assessment or financial advice.";
  const f2 = (v) => Number(v.toFixed(2));
  const rule = (x, top, w, h, color) =>
    `<i class="rp-r" style="left:${f2(x)}px;top:${f2(top)}px;width:${f2(w)}px;height:${f2(h)}px;background:${color}"></i>`;
  /** Text on a baseline: x is its left edge, or with `end` its right edge, or with `mid` its centre. */
  const set = (
    x,
    base,
    size,
    text,
    { bold = false, color = DOC.prose, end = false, mid = false, track = 0 } = {},
  ) => {
    const top = base - 0.8465 * size; // at line-height 1, Liberation Sans' baseline is 0.8465 em down
    const pos = end
      ? `right:${f2(A4[0] - x - track)}px`
      : mid
        ? `left:${f2(x)}px;transform:translateX(calc(-50% + ${track / 2}px))`
        : `left:${f2(x)}px`;
    return `<div class="rp-t" style="${pos};top:${f2(top)}px;font-size:${size}px;font-weight:${bold ? 700 : 400};color:${color}${track ? `;letter-spacing:${track}px` : ""}">${text}</div>`;
  };
  const words = (src) => {
    // **bold** runs, then words with drawTextWithWrap's glue: a run that does not open with a space
    // continues the word before it.
    const out = [];
    let open = true;
    for (const seg of src.split(/(\*\*[^*]+\*\*)/)) {
      if (!seg) continue;
      const bold = /^\*\*.*\*\*$/.test(seg);
      const run = bold ? seg.slice(2, -2) : seg;
      const ws = run.split(" ").filter(Boolean);
      const continues = out.length > 0 && !open && !/^\s/.test(run);
      ws.forEach((w, i) => out.push({ w, bold, glue: i === 0 && continues }));
      if (ws.length) open = /\s$/.test(run);
    }
    return out;
  };
  /**
   * A paragraph, wrapped and (unless `left`) justified as drawTextWithWrap does: greedy lines, the extra
   * width spread over the real gaps, the last line left as it is. Lines stop at `bottom` (745.08, where the
   * product stops drawing on a page). Returns its HTML, the last baseline it drew and whether it was cut.
   */
  const prose = (
    src,
    {
      x = 55,
      base,
      width = 485,
      size = 9.5,
      lead = 15,
      left = false,
      bold = false,
      color = DOC.prose,
      bottom = 745.08,
    },
  ) => {
    const ws = words(src).map((w) => ({ ...w, bold: w.bold || bold }));
    const space = widthOf(" ", size);
    const measure = (line) =>
      line.reduce(
        (sum, w, i) => sum + widthOf(w.w, size, w.bold) + (i > 0 && !w.glue ? space : 0),
        0,
      );
    const lines = [];
    let line = [];
    for (const w of ws) {
      const need = widthOf(w.w, size, w.bold) + (line.length && !w.glue ? space : 0);
      if (line.length && measure(line) + need > width) {
        if (w.glue && line.length > 1) {
          const carried = line.pop();
          lines.push(line);
          line = [{ ...carried, glue: false }, w];
        } else {
          lines.push(line);
          line = [{ ...w, glue: false }];
        }
      } else line.push(w);
    }
    if (line.length) lines.push(line);
    let html = "";
    let y = base;
    let drawn = 0;
    for (const [li, l] of lines.entries()) {
      if (y > bottom) break;
      const last = li === lines.length - 1;
      const gaps = l.filter((w, i) => i > 0 && !w.glue).length;
      const ink = l.reduce((sum, w) => sum + widthOf(w.w, size, w.bold), 0);
      const gap = !left && !last && gaps ? (width - ink) / gaps : space;
      let at = x;
      for (const [wi, w] of l.entries()) {
        html += set(at, y, size, esc(w.w), { bold: w.bold, color });
        const next = l[wi + 1];
        at += widthOf(w.w, size, w.bold) + (next && !next.glue ? gap : 0);
      }
      drawn++;
      y += lead;
    }
    return { html, last: base + (drawn - 1) * lead, cut: drawn < lines.length };
  };
  const esc = (t) => t.replace(/&(?!amp;|nbsp;)/g, "&amp;").replace(/</g, "&lt;");
  /** The running head and the footer every content page carries. */
  const furniture = (page) =>
    `${set(55, 38, 6.5, "AURIXA SYSTEMS", { color: DOC.muted, track: 1.3 })}${set(540.5, 38, 6.5, "INVESTMENT COMPASS", { color: DOC.muted, track: 1.3, end: true })}
    ${rule(55, 45.75, 485.5, 0.5, DOC.hair)}${rule(55, 45, 34, 2, DOC.gold)}
    ${rule(55, 797.83, 485, 0.5, DOC.gold)}${set(55, 810.08, 7, "Investment Report&nbsp;&nbsp;|&nbsp;&nbsp;Confidential", { color: DOC.muted })}${set(540, 810.08, 7, `Page ${page}`, { color: DOC.muted, end: true })}`;
  /** A section's header, H2 and H3 alike: a gold bar, the heading, and its underline. */
  const head = (title, base, color = DOC.prose) =>
    `${rule(47, base - 12, 3, 18, DOC.gold)}${set(55, base, 14, esc(title), { bold: true, color })}${rule(55, base + 13.5, widthOf(title, 14, true) + 20, 1, DOC.gold)}`;
  const label = (top) =>
    `<div class="rp-label" style="left:55px;top:${top}px;width:485px;height:19px">${ILLUSTRATIVE}</div>`;
  /** A KPI tile: the wash, a 1.2 pt gold border, the 4 pt strip, the label, the value and its caption. */
  const kpiTile = (x, top, w, labelText, value, caption = null) =>
    `<i class="rp-r" style="left:${f2(x - 0.6)}px;top:${f2(top - 0.6)}px;width:${f2(w + 1.2)}px;height:${f2(72 + 1.2)}px;background:${DOC.wash};box-shadow:inset 0 0 0 1.2px ${DOC.gold}"></i>
    ${rule(x, top, w, 4, DOC.gold)}${set(x + w / 2, top + 18, 7, labelText, { bold: true, color: DOC.muted, mid: true })}
    ${caption ? `${set(x + w / 2, top + 44, 15, value, { bold: true, color: DOC.field, mid: true })}${set(x + w / 2, top + 62, 6.5, caption, { color: DOC.muted, mid: true })}` : set(x + w / 2, top + 48, 16, value, { bold: true, color: DOC.field, mid: true })}`;
  /** A page of the report, drawn at k px a point. */
  const sheet = (k, html, bg = "#fff") =>
    `<div class="ppage" style="position:relative;width:${f2(A4[0] * k)}px;height:${f2(A4[1] * k)}px;background:${bg}"><div class="rp" style="transform:scale(${k});background:${bg}">${html}</div></div>`;

  // Page 1: the cover, in the colours the product resolves for this issuer.
  const docCover = (k) => reportCover(k, { field: DOC.field, gold: DOC.gold, ink: DOC.ivory });

  // Page 2: the contents, with the Compass's own sections (compassSectionRegistry.ts) and the grade's method.
  const CONTENTS = [
    ["1.", "Executive Verdict", 4],
    ["2.", "Property & Locality Snapshot", 5],
    ["3.", "Why This Location Matters", 6],
    ["4.", "Infrastructure and Growth Context", 7],
    ["5.", "Demand Drivers", 8],
    ["6.", "Amenity & Access", 9],
    ["7.", "Transport & Connectivity", 9],
    ["8.", "Zoning, Planning and Development Considerations", 10],
    ["9.", "Environment, Climate & Safety", 12],
    ["10.", "Market Positioning", 13],
    ["11.", "Competitive Landscape and Supply Pipeline", 14],
    ["12.", "Property Fit Within the Suburb", 15],
    ["13.", "Risk Dashboard", 15],
    ["14.", "Due Diligence Checklist", 16],
    ["15.", "Final Recommendation", 17],
    ["16.", "Appendix, Source Notes & Disclaimer", 18],
    ["16.1", "How this grade was reached", 19, true],
  ];
  const contentsPage = () => {
    let y = 168.08;
    const rows = CONTENTS.map(([n, name, page, sub]) => {
      const size = sub ? 10 : 11;
      const x0 = sub ? 70 : 55;
      const nameX = x0 + widthOf(n, size, !sub) + 8;
      const dotsFrom = nameX + widthOf(name, size) + 5;
      const html = `${set(x0, y, size, n, { bold: !sub, color: DOC.goldInk })}${set(nameX, y, size, esc(name), { color: sub ? DOC.note : DOC.field })}
        <i class="rp-dots" style="left:${f2(dotsFrom)}px;top:${f2(y - 3.5)}px;width:${f2(505 - dotsFrom)}px"></i>${set(540, y, size, String(page), { bold: true, color: DOC.field, end: true })}`;
      y += sub ? 18 : 24;
      return html;
    }).join("");
    return `${furniture(2)}${set(55, 103.08, 20, "TABLE OF CONTENTS", { bold: true, color: DOC.field })}${rule(55, 127.08, 485, 2, DOC.gold)}${rows}`;
  };

  // Page 3: "The property", the lead photograph contained on its sheet (investmentPdfPictures.ts).
  const propertyPage = () =>
    `${furniture(3)}${head("The property", 103.08, DOC.field)}${set(55, 133.08, 9, "Residence 014, Project Banksia, Banksia Rise NSW 2155", { color: DOC.note })}
    <div class="rp-photo" style="left:55px;top:275.86px;width:485px;height:323.43px;${P ? `background-image:url('${P}')` : "background:#2a3b52"}"></div>
    ${rule(55, 739.83, 485, 0.5, DOC.hair)}${rule(55, 757.83, 485, 0.5, DOC.hair)}${rule(55, 775.83, 485, 0.5, DOC.hair)}
    ${set(55, 752.08, 8, "Source", { bold: true, color: DOC.field })}${set(173, 752.08, 8, "The listing's or the builder's marketing material.", { color: DOC.note })}
    ${set(55, 770.08, 8, "Before relying on it", { bold: true, color: DOC.field })}${set(173, 770.08, 8, "Inspect the property: images can be dated or staged.", { color: DOC.note })}`;

  // Page 4: the first section, Executive Verdict, under the report's title, with the Compass's two tiles. The
  // verdict opens with the label the product prints for B+ assessed on 3 of 5 dimensions (printedVerdict,
  // qualifyRecommendation), and the readiness statement follows the case (transactionReadiness.pure.ts).
  const SUMMARY = [
    "**BUY - Good investment opportunity with favourable metrics in most of the areas assessed.**",
    "Residence 014 is graded **B+** on a composite of **74**, carried by capital growth and location; rental yield is moderate, and demand and property risk were not scored. The case rests on the area's measured growth record and on the property's access to transport, schools and shops, not on any figure this report estimated.",
    "**Transaction readiness: material verification pending.** The grade is an assessment of the evidence this report holds. It is not permission to proceed, and it does not replace the checks in the Due Diligence Checklist, each of which can change the figures or the recommendation.",
  ];
  const WHAT_THIS_MEANS =
    "The grade supports moving to the checks that settle it: the review of the land and build contracts, the lot's title and approvals, and an independent appraisal of the rent at completion.";
  const summaryPage = () => {
    const title = prose(
      "Investment Compass: Residence 014, Project Banksia, Banksia Rise NSW 2155",
      { base: 103.08, size: 18, lead: 24, left: true, bold: true },
    );
    const headBase = title.last + 49;
    const tiles = headBase + 30;
    let html = `${furniture(4)}${label(57)}${title.html}${head("Executive Verdict", headBase)}
      ${kpiTile(55, tiles, 237.5, "PURCHASE PRICE", "$1,150,000")}${kpiTile(302.5, tiles, 237.5, "WEEKLY RENT", "$850", "Rent as supplied")}`;
    let base = tiles + 72 + 16;
    for (const src of SUMMARY) {
      const p = prose(src, { base });
      html += p.html;
      base = p.last + 21;
    }
    const lines = prose(WHAT_THIS_MEANS, {
      x: 72,
      base: base + 30,
      width: 454,
      lead: 14,
      left: true,
    });
    const n = Math.round((lines.last - (base + 30)) / 14) + 1;
    const h = n * 14 + 28;
    html += `${rule(55, base, 485, h, DOC.wash)}${rule(55, base, 3, h, DOC.gold)}${set(72, base + 16, 7.5, "WHAT THIS MEANS", { bold: true, color: DOC.goldInk })}${lines.html}`;
    return html;
  };

  // Page 19: how the grade was reached, composed as strategyPositions.composeScoreDimensionTable writes it for
  // a proportional grade whose record holds its weights. B+ at 74 on 3 of the 5 dimensions, as every plate
  // shows it: capital growth 76, location 81, rental yield 58 at the original 40 / 25 / 15 re-spread to
  // 50 / 31.25 / 18.75 (38.00 + 25.31 + 10.88 = 74.19, recorded as 74). The renderer sets "—" as "-".
  const GRADE_INTRO =
    "Five dimensions carry the method. Each has an **original weight**; the scoring method re-spreads those weights across the dimensions the evidence could measure - discounted by how much of each dimension's own method actually ran - giving the **adjusted weight** the composite is built from. That is why a dimension scored on part of its inputs can carry less than its original weight. The adjusted weights below are the ones the record holds, so they are the weights this grade was actually built from. A dimension that could not be assessed is disclosed rather than deducted: it lowers no score and caps no grade, and the scope of the assessment is stated with the result instead.";
  const GRADE_ROWS = [
    ["Capital growth", "76 / 100", "40%", "50%", "38.00"],
    ["Location", "81 / 100", "25%", "31%", "25.31"],
    ["Rental yield", "58 / 100", "15%", "19%", "10.88"],
    ["Demand", "-", "15%", "- (not scored)", "-"],
    ["Property risk", "-", "5%", "- (not scored)", "-"],
  ];
  const GRADE_AFTER = [
    "**What each dimension rested on.**",
    "• **Capital growth.** Scored on the published median sale price series for the council area, quarterly, as its publisher records it.",
    "• **Location.** Nearest transit stop 600 m away. 7 schools within 3 km, and shops and the commute to its centre measured at the property's address.",
    "• **Rental yield.** Scored on the recorded weekly rent against the purchase price.",
    "• **Demand.** Not assessed - sufficient verified demand evidence is currently unavailable. What is missing is a published measure of how actively this market trades: sale volumes, days on market, vendor discounting or auction results. Population change is a supporting indicator and cannot stand in for one.",
    "• **Property risk.** Not assessed - insufficient verified property-risk evidence is available. What is missing is property-specific risk measurement covering at least two independent subjects - for example a building condition assessment alongside hazard or planning controls checked against the parcel itself rather than a single map point.",
    "**How the grade follows.**",
    "• **Composite score 74.** The contributions come to 74.19, rounded once to the composite 74, the figure recorded with the grade. They are computed from the exact adjusted weights the scoring method retained with this grade, so they reproduce its arithmetic; the weights printed as whole percentages are those weights rounded for display.",
    "• **Grade the composite alone gives: B+.**",
    "• **Assessed on 3 of the 5 dimensions**, carrying 80% of the method's original weight. The dimensions that could not be assessed are named above with what would restore each one; none of them lowers this result.",
  ];
  const GRADE_EDGES = [55, 159.21, 246.76, 334.32, 424.68, 540];
  const GRADE_MARKS = [];
  const gradeTable = (top) => {
    const rows = [
      ["Dimension", "Score", "Original weight", "Adjusted weight", "Contribution"],
      ...GRADE_ROWS,
    ];
    let html = "";
    let y = top;
    for (const [ri, row] of rows.entries()) {
      const header = ri === 0;
      if (header) html += rule(55, y - 2, 485, 24.5, DOC.field);
      else if (ri % 2 === 0) html += rule(55, y - 2, 485, 24.5, DOC.stripe);
      for (const [ci, cell] of row.entries())
        html += set(GRADE_EDGES[ci] + 6, y + 15.5, 9.5, esc(cell), {
          bold: header,
          color: header ? "#FFFFFF" : DOC.prose,
        });
      for (const edge of GRADE_EDGES.slice(1, -1))
        html += rule(edge - 0.25, y, 0.5, 24.5, DOC.hair);
      html += header
        ? rule(55, y - 0.75, 485, 1.5, DOC.gold) + rule(55, y + 24.5 - 0.75, 485, 1.5, DOC.gold)
        : rule(55, y + 24.5 - 0.25, 485, 0.5, DOC.hair);
      y += 24.5;
    }
    return { html, bottom: y };
  };
  const gradePage = () => {
    let html = `${furniture(19)}${label(57)}${head("How this grade was reached", 103.08)}`;
    const intro = prose(GRADE_INTRO, { base: 133.08 });
    html += intro.html;
    const table = gradeTable(intro.last + 21);
    html += table.html;
    // Where the two unscored rows' "- (not scored)" sit on the sheet, for the film's marker (08.2).
    GRADE_MARKS.splice(
      0,
      GRADE_MARKS.length,
      ...[4, 5].map((row) => ({
        x: GRADE_EDGES[3] + 6,
        base: intro.last + 21 + row * 24.5 + 15.5,
        width: widthOf("- (not scored)", 9.5),
      })),
    );
    let base = table.bottom + 18;
    for (const src of GRADE_AFTER) {
      if (base > 725.08) break; // a paragraph that would start below this goes to the next page
      const p = prose(src, { base });
      html += p.html;
      if (p.cut) break;
      base = p.last + 21;
    }
    return html;
  };

  // The pages around them, for the viewer's page rail: a section's heading and its text, in miniature.
  const textPage = (page, heading, bars = 26) =>
    `${furniture(page)}${head(heading, 103.08)}${Array.from({ length: bars }, (_, i) => rule(55, 128 + i * 21, i % 6 === 5 ? 300 : 485, 4.5, "#D9DCE0")).join("")}`;
  const docThumbs = (pages, on) =>
    `<div class="pthumbs">${pages.map(([n, page]) => `<div class="pt1${n === on ? " on" : ""}">${page}<span>${n}</span></div>`).join("")}</div>`;
  const DOC_TITLE = "Investment Compass — Residence 014, Project Banksia, Banksia Rise NSW 2155";
  // The viewer at page 4, the summary; and at page 19, how the grade was reached.
  const docViewer = (page) =>
    pdfViewer({
      title: DOC_TITLE,
      page: sheet(0.76, page === 4 ? summaryPage() : gradePage()),
      pageOf: [page, 22],
      zoom: "57%",
      thumbs:
        page === 4
          ? docThumbs(
              [
                [1, docCover(0.16)],
                [2, sheet(0.16, contentsPage())],
                [3, sheet(0.16, propertyPage())],
                [4, sheet(0.16, summaryPage())],
              ],
              4,
            )
          : docThumbs(
              [
                [17, sheet(0.16, textPage(17, "Final Recommendation"))],
                [18, sheet(0.16, textPage(18, "Appendix, Source Notes & Disclaimer"))],
                [19, sheet(0.16, gradePage())],
                [20, sheet(0.16, textPage(20, "How this grade was reached", 18))],
              ],
              19,
            ),
    });

  // ---------------------------------------------------------------- Solicitor (Priya)
  // After SolicitorPortalLayout, SolicitorMatterDetail and MatterDocumentsPanel: the matter's page, its
  // Overview and Docs tabs, and its Notes tab with "Save notes" (toast "Matter updated").
  const solItems = [
    ["grid", "Dashboard", false],
    ["shield", "AML/CTF Compliance", false],
    ["case", "Matters", true],
    ["board", "Pipeline", false],
    ["chat", "Message Hub", false],
    ["gear", "Settings", false],
  ];
  const solFoot = `<div class="sfoot"><span>${ic("logout", "#c3c8d4", 14)}Sign Out</span><small>${ic("shield", "#6f778a", 10)}Secured Portal • Privileged &amp; encrypted</small></div>`;
  // `on` names the page the menu marks (the matter pages are under Matters); the Dashboard is home.
  const sol = (body, { on = "Matters" } = {}) =>
    shell({
      kind: "sol",
      label: "SOLICITOR PORTAL",
      who: "Priya Shah",
      org: "Shah Legal",
      initials: "PS",
      items: solItems.map(([i, t]) => [i, t, t === on]),
      top:
        on === "Dashboard"
          ? ""
          : `<div class="fback">${ic("arrowl", "#c3c8d4")}Back to dashboard</div>`,
      body,
      foot: solFoot,
    });
  // Below the md breakpoint (a window half the screen wide) the sidebar folds into a menu button.
  const solNarrow = (body, extra = "") => `<div class="pt sol narrow"><section class="main">
      <div class="top"><span>${ic("menu", "#dfe3ec", 18)}</span><span style="display:flex;align-items:center;gap:8px">${emb(24)}<b style="font-size:12.5px">Solicitor Portal</b></span>
        <div class="fback">${ic("arrowl", "#c3c8d4")}Back to dashboard</div>
        <div class="me"><span class="demo">Demo workspace</span><div class="av">PS</div>Priya Shah</div></div>
      <div class="body">${body}</div></section>${extra}</div>`;
  const matterHead = `<div class="banner" style="align-items:flex-end;flex-wrap:wrap;row-gap:12px"><div style="flex:1;min-width:300px"><div class="eb">${ic("scale", "#3556f0", 11)}MATTER</div>
      <div class="h1">Ellis: Purchase, Residence 014</div><div class="sub">Residence 014, Project Banksia, Banksia Rise NSW 2155</div></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="fghost">${ic("arrowl", "#c3c8d4", 12)}All matters</span><span class="pill blue" style="margin:0;font-size:12px;padding:5px 12px">Contract review</span>
        <span class="btn" style="font-size:12px;padding:7px 12px">${ic("pencil", "#fff", 12)}Change status</span></div></div>`;
  const MATTER_TABS = [
    ["file", "Overview"],
    ["users", "Parties"],
    ["users", "Property team"],
    ["calendar", "Dates"],
    ["route", "Settlement"],
    ["file", "Docs"],
    ["file", "Searches"],
    ["file", "Costs"],
    ["chat", "Messages"],
    ["spark", "Intelligence"],
    ["shield", "Compliance"],
    ["contact", "Notes"],
  ];
  const matterTabs = (on, pointerOn) =>
    `<div class="atabs wrap">${MATTER_TABS.map(([i, t]) => `<span class="${t === on ? "on" : ""}">${ic(i, t === on ? "#fff" : "#9aa3b5", 12)}${t}${t === pointerOn ? onIt() : ""}</span>`).join("")}</div>`;
  const field = (l, v) => `<div><div class="slab">${l}</div><div class="sval">${v}</div></div>`;
  const input = (l, v) => `<div><div class="flab">${l}</div><div class="fin">${v}</div></div>`;
  const matterOverview = `<div class="sgrid">
      <div class="panel" style="grid-column:span 2"><div class="ph">Matter details</div><div class="ps">Core file information for this conveyance.</div>
        <div class="s2">${[
          ["Client", "Jordan Ellis"],
          ["Matter type", "House &amp; land"],
          ["Reference", "MAT-2026-0142"],
          ["Purchase price", "$1,150,000"],
          ["Deposit", "$115,000"],
          ["Opened", "06 Oct 2026"],
        ]
          .map(([l, v]) => field(l, v))
          .join("")}</div>
        <div class="hr"></div>
        <div class="s2">${[
          ["Title reference", "Lot 14 DP 1290144"],
          ["Lot / plan", "Lot 14"],
          ["PEXA workspace", ""],
          ["Other side's firm", "Harbour Conveyancing"],
        ]
          .map(([l, v]) => input(l, v))
          .join("")}</div>
        <div style="display:flex;justify-content:flex-end"><span class="btn" style="font-size:12px;padding:7px 13px">${ic("save", "#fff", 12)}Save details</span></div></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="panel"><div class="ph">${ic("landmark", "#4767ff", 15)}Finance status</div><div class="ps">Finance clause visibility only — no client financials.</div>
          ${[
            ["Finance file", "Residence 014, Project Banksia"],
            ["Status", "More information required"],
            ["Finance clause", "Subject to finance"],
            ["Lender", "Shortlist in progress"],
          ]
            .map(([l, v]) => field(l, v))
            .join("")}</div>
        <div class="panel"><div class="ph">${ic("building", "#4767ff", 15)}Status history</div>
          <div class="shist"><div class="a">Instructed → Contract review</div><div class="b">08 Oct 2026 · solicitor</div></div></div></div></div>`;
  const DOC_STATUS = {
    "Under review": "blue",
    Accepted: "ok",
    Requested: "gold",
  };
  const DOCS = [
    [
      "Contract of sale (draft)",
      "Under review",
      "Contract of sale · Other side · due 24 Oct 2026 · contract-R014-draft.pdf (1.1 MB)",
    ],
    [
      "Floor plan — Residence 014",
      "Under review",
      `Plan / survey · Builder · ${PLAN_FILE} (2.4 MB)`,
    ],
    ["Building specification", "Accepted", "Other · Builder · specification-R014.pdf (860 KB)"],
    ["Planning certificate", "Requested", "Disclosure statement · Other side · due 28 Oct 2026"],
  ];
  const docsTab = `<div class="qsm" style="font-size:12px;margin:-2px 0 -4px">3 outstanding</div>
    <div class="panel"><div class="ph">Document register<span class="btn" style="margin-left:auto;font-size:11.5px;padding:6px 11px">${ic("plus", "#fff", 12)}Request document</span></div>
      <div class="ps">Matter-scoped documents. 3 outstanding of 4.</div>
      ${DOCS.map(
        ([
          label,
          status,
          meta,
        ]) => `<div class="sdoc"><div style="flex:1;min-width:0"><div class="a">${ic("file", "#8d95a8", 14)}${label}<span class="pill ${DOC_STATUS[status]}" style="margin-left:4px">${status}</span></div>
          <div class="b">${meta}</div></div>
          <span class="stog"><i></i>AI processing</span>${status === "Accepted" ? "" : `<span class="sbtn">Review and accept</span>`}
          <span class="sbtn">${ic("upload", "#dfe3ec", 11)}${status === "Requested" ? "Upload" : "Upload new version"}</span>${status === "Requested" ? "" : `<span class="sbtn">${ic("download", "#dfe3ec", 11)}Open</span>`}
          <span class="sico">${ic("pencil", "#9aa3b5", 12)}</span><span class="sico">${ic("trash", "#e5484d", 12)}</span></div>`,
      ).join("")}</div>`;
  const notesCard = (pointer) => `<div class="panel"><div class="ph">Notes</div>
      <div class="ps">The client summary is shared with the Command Centre and the client. Practice notes never leave this portal.</div>
      <div><div class="flab">Client-facing summary</div><div class="fta" style="height:70px">Your contract and the Residence 014 floor plan are with us for review. We will go through the remaining document questions with you before exchange.</div></div>
      <div><div class="flab">Practice-only notes</div><div class="fta" style="height:104px">Floor plan (${PLAN_FILE}) checked against the contract plan: four bedrooms, layout as drawn. Remaining questions: planning certificate still to come; confirm the specification's inclusions with the builder.</div></div>
      <div style="display:flex;justify-content:flex-end"><span class="btn" style="font-size:12.5px;padding:8px 14px">${ic("save", "#fff", 12)}Save notes${pointer ? onIt() : ""}</span></div></div>`;
  // Priya's screen in 12B: the floor plan's PDF tab and the matter's Notes, as two windows side by side.
  const tiled = (saved) => `<div style="position:absolute;inset:0;background:#05070c">
      ${browser({
        style: "left:0;top:0;bottom:0;width:calc(44% - 2px)",
        tabs: [[null, PLAN_FILE, true]],
        url: `${ic("lock", "#9aa0a6", 12)}<span>aurixasystems.com.au<span style="color:#80868b">/files/matter-documents/${PLAN_FILE}</span></span>`,
        body: pdfViewer({ title: PLAN_FILE, page: planPage(520), pageOf: [1, 1], zoom: "64%" }),
      })}
      ${browser({
        style: "right:0;top:0;bottom:0;width:calc(56% - 2px)",
        tabs: [[EMBLEM, "Solicitor Portal · Aurixa Systems", true]],
        url: `${ic("lock", "#9aa0a6", 12)}<span>aurixasystems.com.au<span style="color:#80868b">/solicitor/matters/mat-2026-0142?tab=notes</span></span>`,
        body: solNarrow(
          `<div class="scrolled" style="margin-top:-44px">${matterHead}${matterTabs("Notes")}${notesCard(true)}</div>`,
          saved ? toast("Matter updated") : "",
        ),
      })}</div>`;

  // ---------------------------------------------------------------- Builder / Developer (Daniel)
  // After the Builders Network's BuilderPortalLayout and BuilderStockList: its own drawing-set look (obsidian
  // navy, teal actions, Playfair headings, Inter, mono annotation labels, square corners on a setout grid).
  // A stock item is a "plate" (elevation and schedule) that opens nothing, so Daniel's floor plan is his own
  // PDF, in the browser's next tab.
  const bnItems = [
    ["grid", "Dashboard"],
    ["shield", "AML/CTF Compliance"],
    ["building", "Projects"],
    ["clip", "Stock List", true],
    ["chat", "Messages"],
    ["tasks", "Tasks"],
    ["bell", "Notifications"],
    ["history", "Activity"],
    ["gear", "Settings"],
  ];
  // `on` is the menu's page (the Stock List unless named); the Dashboard is home, with no way back.
  const bn = (page, body, scroll = 0, on = "Stock List") => `<div class="bn">
      <aside class="bside"><div class="blk"><span class="bmark" style="background-image:url('${BN_MARK}')"></span><div style="min-width:0"><div class="t">Aurixa Builders Network</div><div class="s">BUILDER / DEVELOPER PORTAL</div></div>${ic("bell", "#9CA3AF", 15)}</div>
        <div class="bsep"></div>
        <div class="bcard"><div style="display:flex;gap:10px;align-items:center"><div class="bav">DR</div><div><div class="n">Daniel Reed</div><div class="o">Reed Constructions</div></div></div>
          <div class="bchips"><span>ORGANISATION OWNER</span><span>PRIMARY</span></div></div>
        <nav>${bnItems.map(([i, t]) => `<a class="${t === on ? "on" : ""}">${ic(i, t === on ? "#fff" : "#9CA3AF", 16)}${t}</a>`).join("")}</nav>
        <div class="bfoot"><span>${ic("logout", "#cfd5df", 14)}Sign Out</span><small>${ic("shield", "#6b7686", 10)}Secured Portal • Access resolved per request</small></div></aside>
      <section class="bmain"><div class="btop">${on === "Dashboard" ? "" : `<span class="bback">${ic("arrowl", "#cfd5df", 13)}Back to dashboard</span>`}<b>${page}</b>
          <div class="me"><span class="bdemo">DEMO WORKSPACE</span><div class="bav" style="width:28px;height:28px;font-size:10px">DR</div>Daniel Reed</div></div>
        <div class="bbody"><div style="margin-top:${-scroll}px;display:flex;flex-direction:column;gap:18px">${body}</div></div></section></div>`;
  const stockHero = `<div class="bhero"><div class="beb">${ic("hardhat", "#22C3CE", 13)}BUILDER / DEVELOPER PORTAL</div>
      <div class="bh1">Stock List</div><div class="bdesc">Upload your available stock in whatever format you keep it, and see which properties have been selected for a buyer.</div>
      <div class="btray"><span class="bbtn">${ic("refresh", "#e6f7f8", 14)}Refresh</span><span class="bbtn teal">${ic("plus", "#040B16", 14)}Add stock list</span></div></div>
    <div class="bsched">${[
      ["PROPERTIES LISTED", "3", "No imagery outstanding"],
      ["STOCK LISTS UPLOADED", "1", "All have been read"],
      ["AWAITING YOUR ACKNOWLEDGEMENT", "1", "Selected by an adviser"],
    ]
      .map(
        ([l, v, d]) =>
          `<div><div class="ann">${l}</div><div class="fig">${v}</div><div class="bl">${d}</div></div>`,
      )
      .join("")}</div>
    <div class="bpanel"><div class="bct">Selected for a buyer</div><div class="bcd">A connected workspace has selected these properties from your stock list. Acknowledge each one to confirm you have seen it.</div>
      <div class="bsel"><div style="flex:1"><div style="font-size:13.5px;font-weight:600">Lot 14, Project Banksia · Residence 014</div><div class="bl" style="margin-top:3px">Selected 21/10/2026, 9:14:03 am · by Aurixa Systems · A. Morgan</div></div>
        <span class="bbtn" style="height:34px">${ic("check", "#e6f7f8", 14)}Acknowledge</span></div></div>`;
  const schedule = [
    ["PRICE", `<b class="bprice">$1,150,000</b><div class="bl">fixed price, house and land</div>`],
    ["BEDROOMS", "4"],
    ["BATHROOMS", "1"],
    ["CAR SPACES", "1"],
    ["HOME", "168 m²"],
    ["LAND", "290 m²"],
    ["AVAILABILITY", `<span class="bselect" style="width:170px">Available</span>`],
  ];
  const stockPlate = `<li class="bplate"><div><div class="bframe">${P ? `<i style="background-image:url('${P}')"></i><b style="background-image:url('${P}')"></b>` : ""}</div>
        <div class="bcap"><span class="bchip ok">${ic("image", "#4ADE80", 11)}BUILDER SUPPLIED</span><span class="bghost">${ic("image", "#9CA3AF", 11)}Replace</span>
          <span class="bstage">${ic("file", "#9CA3AF", 10)}Stock list 1</span><span class="bstage dash">${ic("map", "#9CA3AF", 10)}Street View —</span><span class="bstage dash">${ic("globe", "#9CA3AF", 10)}Online —</span></div></div>
      <div class="bsheet"><div style="display:flex;align-items:flex-start;gap:12px"><div style="flex:1;min-width:0"><div class="ann">PROJECT BANKSIA · HOUSE AND LAND</div>
          <div class="btitle">Lot 14, Project Banksia · Residence 014</div><div class="bl" style="font-size:12.5px">Banksia Rise NSW 2155 · Ref R014</div></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="bchip gold">SELECTED FOR A CLIENT</span><span class="bghost">${ic("trash", "#9CA3AF", 11)}Remove</span></div></div>
        <dl class="bspec">${schedule.map(([l, v]) => `<dt class="ann">${l}</dt><dd>${v}</dd>`).join("")}</dl>
        <div style="display:flex;align-items:center;gap:10px"><span class="bl" style="flex:1">Supplied by you: every figure.</span><span class="brev">${ic("ruler", "#fff", 12)}UPDATE THE SCHEDULE</span></div></div></li>`;
  const stockWorkspace = `<div class="bpanel bstock"><div class="ann" style="color:#22C3CE">YOUR STOCK</div><div class="bct" style="margin-top:4px">3 properties on the marketplace</div>
      <div class="bcd">Properties imported from your stock lists. These are what the Command Centre sees.</div>
      <div class="brail"><span class="bsearch">${ic("search", "#9CA3AF", 14)}Search address, suburb, development or reference</span><span class="bselect" style="width:180px">All availability</span><span class="bselect" style="width:220px">All stock lists</span></div>
      <ul class="bplates">${stockPlate}<li class="bplate" style="opacity:.75"><div><div class="bframe" style="background:#122036"></div></div><div class="bsheet"><div class="ann">PROJECT BANKSIA · HOUSE AND LAND</div><div class="btitle">Lot 15, Project Banksia · Residence 015</div></div></li></ul></div>`;
  const stockList = (scroll) => bn("Stock List", `${stockHero}${stockWorkspace}`, scroll);
  const bnUrl = `${ic("lock", "#9aa0a6", 12)}<span>aurixasystems.com.au<span style="color:#80868b">/builder/stock</span></span>`;
  const fileUrl = `<span style="color:#9aa0a6">File</span><span style="color:#5f6368">|</span><span>C:/Users/Daniel/Documents/Residence 014/${PLAN_FILE}</span>`;
  const daniel = (onPlan) =>
    browser({
      style: "inset:0",
      tabs: [
        [BN_MARK, "Stock List · Aurixa Builders Network", !onPlan],
        [null, PLAN_FILE, onPlan],
      ],
      url: onPlan ? fileUrl : bnUrl,
      pointerTab: 1,
      body: onPlan
        ? pdfViewer({ title: PLAN_FILE, page: planPage(700), pageOf: [1, 1], zoom: "84%" })
        : stockList(STOCK_SCROLL),
    });

  // ================================================================== System edition
  // BRIEF.md "Pages still to build", each rebuilt from its portal's code with the demo record
  // (npc-client-dashboard @ 398235c, aurixa-builders @ 16d2370) and drawn as the product draws it.
  // Where the brief's words and the product's differ, the product's stand.
  const ndPanel = (head, sub, body, style = "") =>
    `<div class="panel" style="${style}"><div class="ph">${head}</div><div class="ps">${sub}</div>${body}</div>`;

  // Solicitor home (SolicitorDashboard.tsx, PortfolioInsightsPanel.tsx). The matter moved to
  // Contract review on 08 Oct; on 21 Oct that is 13 days against the stage's 10
  // (STAGE_STALL_DAYS), which the product grades medium: Watch, and 1 stalled.
  const solDash = sol(
    `<div class="banner"><div style="flex:1"><div class="eb">${ic("scale", "#3556f0", 11)}WELCOME BACK</div>
        <div class="h1">Priya Shah</div><div class="sub">Your conveyancing workload across every client shared with your practice.</div></div>
      <span class="btn">Open matters${arrow()}</span></div>
    <div class="row">${[
      ["case", "1", "Active matters"],
      ["calclock", "0", "Settling in 30 days"],
      ["alert", "0", "Flagged at risk"],
    ]
      .map(
        ([i, v, l]) =>
          `<div class="stat nd-count">${tile(i, "rgba(53,86,240,.10)", "#4767ff")}<div><div class="v">${v}</div><div class="l">${l}</div></div></div>`,
      )
      .join("")}</div>
    <div class="row">${[
      ["trend", "Pipeline value", "$1.2M", "1 active matter"],
      ["calclock", "Settling this week", "0", "0 within 30 days"],
      ["circlecheck", "Avg days to settle", "—", "0 settled in 90 days"],
      ["clock", "Avg days in stage", "13", "1 stalled"],
      ["alert", "Needs attention", "0", "0 critical · 0 overdue"],
    ]
      .map(
        ([i, k, v, h]) =>
          `<div class="stat nd-kpi"><div class="k">${ic(i, "#4767ff", 12)}${k}</div><div class="v">${v}</div><div class="l">${h}</div></div>`,
      )
      .join("")}</div>
    <div class="row">
      ${ndPanel(
        `${ic("alert", "#f26464", 15)}At risk &amp; stuck matters`,
        "Ranked by severity from dates, stage dwell time and recent activity.",
        `<div class="line" style="display:block"><div style="display:flex;align-items:center;gap:10px"><div class="a">Ellis: Purchase, Residence 014</div><span class="pill muted">Watch</span></div>
          <div class="b">Contract review · 13 days in stage</div>
          <div class="b" style="color:#c3c8d4;margin-top:6px"><b style="color:#fff;font-weight:600">Stuck in stage:</b> 13 days in contract review (expected under 10).</div></div>`,
        "flex:2",
      )}
      ${ndPanel(
        `${ic("activity", "#4767ff", 15)}Stage mix`,
        "Where the book is sitting right now.",
        `<div class="nd-bar"><div><span>Contract review</span><span>1</span></div><i><b style="width:100%"></b></i></div>`,
        "flex:1",
      )}
    </div>
    <div class="row">
      ${ndPanel("Settlement runway", "Matters settling in the next 45 days, soonest first.", `<div class="nd-empty">Nothing settling in the next 45 days.</div>`, "flex:2")}
      ${ndPanel(`${ic("alert", "#f26464", 15)}Needs attention`, "Matters the Command Centre has flagged as at risk.", `<div class="nd-empty">No matters are flagged right now.</div>`, "flex:1")}
    </div>`,
    { on: "Dashboard" },
  );

  // Accountant home (AccountantDashboard.tsx). Jordan's entity is recommended but not confirmed,
  // which the product reads as Entity open, and puts first in Needs you next.
  const accDash = shell({
    label: "ACCOUNTANT PORTAL",
    who: "Mia Patel",
    org: "Patel &amp; Co Accountants",
    initials: "MP",
    items: accItems("dash"),
    body: `<div class="banner"><div style="flex:1"><div class="eb">${ic("calculator", "#3556f0", 11)}ACCOUNTANT PORTAL</div>
        <div class="h1">Good to see you, Mia</div><div class="sub">Last visit 3 days ago.</div></div>
      <span class="btn ghost">All clients${arrow()}</span></div>
    <div class="row">${[
      ["users", "1", "Allocated clients · active and paused"],
      ["scale", "1", "Entities to confirm · the contract name"],
      ["landmark", "1", "Income evidence outstanding · for the broker"],
      ["filequestion", "1", "Open client requests · awaiting the client or you"],
    ]
      .map(
        ([i, v, l]) =>
          `<div class="stat">${tile(i, "rgba(53,86,240,.10)", "#4767ff")}<div><div class="v">${v}</div><div class="l">${l}</div></div></div>`,
      )
      .join("")}</div>
    <div class="row">
      ${ndPanel(
        "Needs you next",
        "Ordered by what the rest of the property team is blocked on.",
        `<div class="line"><div style="flex:1;min-width:0"><div class="a">Jordan Ellis</div><div class="b">Purchasing entity not yet confirmed — the broker and solicitor are waiting on it</div></div>${ic("arrow", "#9aa3b5", 14)}</div>`,
        "flex:3",
      )}
      ${ndPanel(
        `${ic("chat", "#4767ff", 15)}Recently allocated`,
        "Clients the advisory team has handed to your practice.",
        `<div style="display:flex;align-items:center;font-size:13px;font-weight:700">Jordan Ellis<span class="pill amber">${ic("clock", "#f2b544", 10)}Entity open</span></div>`,
        "flex:2",
      )}
    </div>`,
  });

  // Finance home (FinancePortalDashboard.tsx, AgreementTemplateResources.tsx and the agreement
  // template modules): the greeting, the two templates (download only), the streak and Today.
  const TEMPLATE_NOTICE = [
    "These templates are provided as a convenience only. They are not legal advice, and they are not tailored to your circumstances.",
    "Any agreement you enter into is solely between you and the other party. Aurixa is not a party to it, does not facilitate it, and keeps no record of it.",
    "You are responsible for having the document reviewed, for your own licensing, credit representative, privacy, aggregator and AML/CTF obligations, and for how the agreement is signed and stored.",
    "Whether to use a template at all is entirely your choice.",
  ];
  const template = (title, about, sections, size) =>
    `<div class="tcard"><div class="tt serif"><span class="tfile">${ic("file", "#4767ff", 13)}</span>${title}</div><div class="td">${about}</div>
      <div class="tins">What's inside · ${sections} sections${ic("chevron", "#9aa3b5", 12)}</div>
      <div class="tdl"><b>${ic("download", "#fff", 13)}Word (.docx)</b>Version 2.0 · ${size}</div></div>`;
  const finDash = fin(
    `<div><div class="welcome">Welcome back, <span>Jamie</span></div><div class="sub">Harbour Finance Group · jamie.chen@example.com</div></div>
    <div class="tpl"><div class="sec">AGREEMENT TEMPLATES</div>
      <div class="tintro">Optional templates you are free to download, adapt and use — or not. Any agreement is made directly between you and the other party.</div>
      <div class="tnote">${ic("info", "#9aa3b5", 13)}<div>${TEMPLATE_NOTICE.join("<br>")}</div></div>
      <div class="row">${template("Strategic Property Referral Agreement", "The finance partner refers clients to the buyer's agency / real estate agency for property services.", 10, "190 KB")}${template("Finance Referral &amp; Commission Agreement", "The buyer's agency / real estate agency refers clients to the finance partner for credit services.", 15, "277 KB")}</div></div>
    <div class="chips"><span>${ic("flame", "#aab2c3", 12)}Start your streak</span></div>
    <div class="row">
      ${ndPanel(`${ic("sun", "#f2b544", 15)}Today<span class="pill">0 items</span>`, "Files waiting on you, ordered by urgency", `<div class="nd-empty">You're clear for today</div>`, "flex:2")}
      ${ndPanel(`${ic("target", "#4767ff", 15)}My monthly goals`, "October 2026 progress", `<div class="nd-empty">Set personal targets to track your month at a glance.</div>`, "flex:1")}
    </div>`,
    "",
    { on: "dash" },
  );

  // Builder / Developer home (BuilderDashboard.tsx, BuilderPortalShell, TitleBlock, BuilderSchedule).
  // The agency's selection and Daniel's acknowledgement write nothing its activity feed shows, so
  // Recent activity is empty, as is Project delivery attention.
  const bnDash = bn(
    "Dashboard",
    `<div class="bhero bdash"><div><div class="beb">${ic("hardhat", "#22C3CE", 13)}WELCOME BACK</div><div class="bh1">Daniel Reed</div>
        <div class="bdesc">Your project-delivery workspace across every organisation and project shared with your account.</div>
        <div style="display:flex;gap:8px;margin-top:16px"><span class="bbtn">${ic("refresh", "#e6f7f8", 13)}Refresh</span><span class="bbtn teal">Open projects${ic("arrow", "#040B16", 13)}</span></div></div>
      <dl class="btb">${[
        ["ORGANISATION", "Reed Constructions"],
        ["ACCESS", "Organisation Owner"],
        ["MEMBERSHIP", "Primary"],
        ["FIGURES AS AT", "21/10/2026, 09:41 am"],
      ]
        .map(([k, v]) => `<div><dt class="ann">${k}</dt><dd>${v}</dd></div>`)
        .join("")}</dl></div>
    <div class="bsched four">${[
      ["ACTIVE PROJECTS", "1", "PROJECT", "Shared with your account"],
      ["OPEN CONVERSATIONS", "0", "", "Nothing unread"],
      ["OPEN TASKS", "0", "", "Nothing waiting on you"],
      ["UNREAD NOTIFICATIONS", "0", "", "You are up to date"],
    ]
      .map(
        ([k, v, u, s]) =>
          `<div><div class="ann">${k}</div><div class="fig">${v}${u ? `<span class="figu">${u}</span>` : ""}</div><div class="bl">${s}</div></div>`,
      )
      .join("")}</div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:18px">
      <div class="bpanel"><div class="bhead">${ic("history", "#22C3CE", 15)}<span class="bct" style="font-size:16px">Recent activity</span><span class="bbtn" style="margin-left:auto;height:30px;padding:0 12px">View all</span></div>
        <div class="bcd">Changes to records you can reach. Administrative events are not shown here.</div>
        <div class="bempty">Nothing has happened yet. Changes to your projects, builds and tasks will appear here.</div></div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="bpanel"><div class="bhead">${ic("alert", "#f26464", 15)}<span class="bct" style="font-size:16px">Project delivery attention</span></div>
          <div class="bcd">What is waiting on you across this workspace.</div>
          <div class="bempty">Nothing needs your attention right now.</div></div>
        <div class="bpanel"><div class="bhead">${ic("building", "#22C3CE", 15)}<span class="bct" style="font-size:16px">Organisation context</span></div>
          <div style="font-size:13px;font-weight:600">Reed Constructions</div>
          <div class="bcap" style="margin-top:2px"><span class="bchip" style="border-color:#2a3b55;color:#cfd5df">ORGANISATION OWNER</span><span class="bchip" style="border-color:#2a3b55;color:#cfd5df">PRIMARY ORGANISATION</span></div></div>
        <div class="bpanel"><div class="bhead">${ic("shieldok", "#22C3CE", 15)}<span class="bct" style="font-size:16px">Access and security</span></div>
          <div class="fig" style="font-size:24px;margin-top:0">20</div><div style="font-size:13px">permission areas granted</div>
          <div class="bcd">Permissions are resolved by the server on every request. Anything not explicitly granted is denied.</div>
          <div class="bcd" style="display:flex;align-items:center;gap:6px;margin-top:4px">${ic("userround", "#9CA3AF", 13)}daniel.reed@example.com</div>
          <div class="bcd">Last signed in: 20/10/2026, 4:12:07 pm</div></div>
      </div>
    </div>`,
    0,
    "Dashboard",
  );

  // Command Centre · Message Hub (MessagingHub.tsx and its components), Jordan's thread: (a) the
  // reply typed and not yet sent, (b) sent, with its Delivered ticks. The list moves the thread to
  // Today once it has moved (conversationModel.pure.ts). Its avatar colours are a hash of each
  // account in the product, so these are the demo's own.
  const TONE = {
    JE: "linear-gradient(135deg,#00A8B5,#1238E8)",
    PS: "linear-gradient(135deg,#7c5cff,#3b2bd6)",
    JC: "linear-gradient(135deg,#C89B3C,#8a5d12)",
    MP: "linear-gradient(135deg,#2bb673,#11734a)",
    DR: "linear-gradient(135deg,#22C3CE,#0b6f78)",
    AM: "#2a2d3a",
  };
  const REPLY =
    "Your Residence 014 report is ready in your portal. Let's go through it together on Thursday.";
  const mhRow = (ini, name, time, line, { on = false, draft = false, client = false } = {}) =>
    `<div class="mh-row${on ? " on" : ""}"><div class="mh-av" style="background:${TONE[ini]}">${ini}${client ? `<em>${icon("userround", "#5fe0e8", 2.2)}</em>` : ""}</div>
      <div class="mh-rt"><div class="mh-r1"><b>${name}</b><small>${time}</small></div>
        <div class="mh-r2${draft ? " mh-dr" : ""}">${draft ? `${icon("pencil", "#f2b544", 2)}Draft: ${line}` : line}</div></div></div>`;
  const PARTNER_ROWS = {
    week: [
      [
        "PS",
        "Priya Shah",
        "Tue",
        "<i>Priya Shah:</i> Contract review is under way for Residence 014.",
      ],
      ["JC", "Jamie Chen", "Tue", "<i>Jamie Chen:</i> Valuation ordered with the lender."],
    ],
    monday: [
      [
        "MP",
        "Mia Patel",
        "Mon",
        "<i>Mia Patel:</i> I've asked Jordan for his FY2026 income statement.",
      ],
    ],
    earlier: [
      ["DR", "Daniel Reed", "14 Oct", "<i>Daniel Reed:</i> Residence 014 is on our stock list."],
    ],
  };
  const mhList = (sent) => {
    const rows = (list) => list.map((row) => mhRow(...row)).join("");
    const jordan = sent
      ? mhRow("JE", "Jordan Ellis", "now", `<i>Alex Morgan:</i> ${REPLY}`, {
          on: true,
          client: true,
        })
      : mhRow("JE", "Jordan Ellis", "Mon", REPLY, { on: true, draft: true, client: true });
    const week = sent
      ? rows([...PARTNER_ROWS.week, ...PARTNER_ROWS.monday])
      : rows(PARTNER_ROWS.week) + jordan + rows(PARTNER_ROWS.monday);
    return `<div class="mh-pane mh-list"><div class="mh-find">${svg("search", "#7d7d84")}Search conversations</div>
      <div class="mh-pills"><span class="on">All</span><span>Unread</span><span>Pinned</span></div>
      ${sent ? `<div class="mh-sec">TODAY<span>1</span></div>${jordan}` : ""}
      <div class="mh-sec">THIS WEEK<span>${sent ? 3 : 4}</span></div>${week}
      <div class="mh-sec">EARLIER<span>1</span></div>${rows(PARTNER_ROWS.earlier)}</div>`;
  };
  const mhThread = (sent) => `<div class="mh-pane mh-thread">
      <div class="mh-th"><div class="mh-av" style="background:${TONE.JE}">JE</div><div style="flex:1;min-width:0"><h3>Jordan Ellis<span class="mh-kind">Client</span></h3>
        <div class="mh-sub2"><span class="mh-stack"><i style="background:${TONE.JE}">JE</i><i style="background:${TONE.AM}">AM</i></span>Client<span class="mh-sec2">${svg("lock", "#aab", 2)}Encrypted</span></div></div>
        <div class="mh-tools"><span>${svg("userplus", "#c9c9cf")}</span><span>${svg("search", "#c9c9cf")}</span><span class="on">${svg("info", "#c9c9cf")}</span></div></div>
      <div class="mh-body">
        <div class="mh-date"><span>Monday 19 October</span></div>
        <div class="mh-msg"><div class="mh-mav" style="background:${TONE.JE}">JE</div><div><div class="mh-who">Jordan Ellis<span>CLIENT</span></div>
          <div class="mh-bub">Can we review whether this suits my plans?</div><div class="mh-time">9:14 am</div></div></div>
        ${
          sent
            ? `<div class="mh-date"><span>Today</span></div>
        <div class="mh-msg me"><div><div class="mh-bub">${REPLY}</div><div class="mh-time">10:12 am${svg("checkcheck", "#8f9097", 2)}</div></div></div>`
            : ""
        }
      </div>
      <div class="mh-foot"><div class="mh-comp${sent ? "" : " typing"}"><span>${svg("paperclip", "#c9c9cf")}</span><span>${svg("smile", "#c9c9cf")}</span>
        <div class="mh-ta${sent ? " ph" : ""}">${sent ? "Message Jordan Ellis" : REPLY}</div>
        ${sent ? `<span>${svg("mic", "#c9c9cf")}</span>` : `<span class="mh-send">${svg("send", "#fff", 2)}</span>`}</div>
        <div class="mh-help">Enter to send · Shift+Enter for a new line · / for commands</div></div></div>`;
  const mhDetails = (
    sent,
  ) => `<div class="mh-pane mh-det"><div class="mh-dh">Details${svg("x", "#aab")}</div>
      <div class="mh-dp"><div class="mh-big" style="background:${TONE.JE}">JE</div><div class="mh-dn">Jordan Ellis</div>
        <div class="mh-dl">${svg("clock", "#8f9097")}Last message ${sent ? "now" : "Mon"}</div>
        <div class="mh-badges"><span>Client</span><span>Encrypted in transit and at rest</span></div></div>
      <div class="mh-ds">${svg("users", "#c9c9cf")}People<small>2</small></div>
      <div class="mh-pp"><div class="mh-mav" style="background:${TONE.JE}">JE</div><div><b>Jordan Ellis</b><span>Client</span></div><span class="mh-role">Member</span></div>
      <div class="mh-pp"><div class="mh-mav" style="background:${TONE.AM}">AM</div><div><b>Alex Morgan<small>(you)</small></b><span>Command Center</span></div><span class="mh-role owner">Owner</span></div>
      <div class="mh-ds">${svg("msgs", "#c9c9cf")}Side conversations<span class="chev">${svg("chevron", "#8f9097")}</span></div>
      <div class="mh-ds">${svg("paperclip", "#c9c9cf")}Files<small>0</small></div></div>`;
  const messageHub = (sent) => `<div class="mh">
      <div class="mh-head"><div class="mh-ic">${svg("msgs", "#8fa6ff", 2)}</div><div><div class="mh-t">Message Hub<span class="mh-live"><i></i>Live</span></div>
        <div class="mh-s">Every conversation with clients, partners and your team, in one place.</div></div>
        <div class="mh-acts"><span class="mh-g">${svg("search", "#d5d5da")}Search</span><span class="mh-g">${svg("megaphone", "#d5d5da")}</span><span class="mh-g">${svg("bell", "#d5d5da")}Notifications</span><span class="mh-g">${svg("keyboard", "#d5d5da")}</span><span class="mh-g new">${svg("msgplus", "#fff")}New</span></div></div>
      <div class="mh-panes">${mhList(sent)}${mhThread(sent)}${mhDetails(sent)}</div></div>`;
  // The menu scrolled to its Client & CRM group, where Message Hub is.
  const MH_SCROLL = 220;

  // Client Portal · Reports (PortalReports.tsx) and My Appointments (PortalAppointments.tsx). The
  // portal names a published report by its address, with the badges Investment Report and Compass,
  // and New until it is downloaded; an appointment shows its title, day and time.
  const clientReports = cli(
    "reports",
    `<div class="cr-head"><div><div class="cr-h1">Reports</div><div class="cr-sub">View reports and request new analyses</div></div><span class="cr-btn">${ic("plus", "#fff", 10)}Request Report</span></div>
    <div class="cr-tabs"><span class="on">${ic("file", "#fff", 10)}My Reports</span><span>${ic("send", "#9aa3b5", 10)}Requests</span></div>
    <div class="cr-bar"><div class="cr-find">${ic("search", "#7d8496", 10)}Search reports...</div>${[
      "All Reports",
      "Investment",
      "Portfolio",
      "Borrowing Capacity",
      "Cash Flow",
    ]
      .map((c, i) => `<span class="cr-chip${i ? "" : " on"}">${c}</span>`)
      .join("")}</div>
    <div class="cr-card"><div class="cr-ic">${ic("filebar", "#4767ff", 15)}</div><div style="flex:1;min-width:0">
        <div class="cr-t">Project Banksia / Residence 014<span class="cr-new">New</span></div>
        <div class="cr-tags"><span>Investment Report</span><span class="sec">Compass</span></div>
        <div class="cr-note">Prepared for our discussion on Thursday.</div>
        <span class="cr-dl">${ic("download", "#fff", 10)}Download Report</span></div>
      <div class="cr-when"><div>21 Oct 2026</div><small>about 1 hour ago</small></div></div>
    <div class="cr-foot">Showing 1 report</div>`,
  );
  const clientAppointments = cli(
    "appointments",
    `<div class="cr-head"><div><div class="cr-h1">My Appointments</div><div class="cr-sub">View your scheduled and past appointments</div></div><span class="cr-btn ghost" style="margin-left:auto">${ic("refresh", "#fff", 10)}Refresh</span><span class="cr-btn" style="margin-left:0">${ic("calcheck", "#fff", 10)}Book New</span></div>
    <div class="cr-sect">${ic("calcheck", "#4767ff", 13)}Upcoming (1)</div>
    <div class="cr-card"><div class="cr-ic">${ic("calendar", "#4767ff", 14)}</div><div style="flex:1;min-width:0">
        <div class="cr-t">Report walkthrough with Alex Morgan<span class="cr-up">Upcoming</span></div>
        <div class="cr-meta"><span>${ic("calendar", "#9aa3b5", 9)}Thu, 22 Oct 2026</span><span>${ic("clock", "#9aa3b5", 9)}10:00 AM – 10:30 AM</span></div>
        <div class="cr-note">Residence 014 · your Investment Compass</div></div>
      <div class="cr-when"><small style="margin-top:0">in about 23 hours</small></div></div>`,
  );

  const W = [1920, 1080];
  const L = [1920, 1200];
  // An A4 page at 2 px a point, a pixel over so the sheet's own 595.5 × 842.25 fits whole.
  const SHEET = [1192, 1686];
  const onSheet = (html) =>
    `<div style="position:absolute;inset:0;background:#fff">${sheet(1, html)}</div>`;
  const plates = {
    // Command Centre
    "PL-04B-a": {
      size: W,
      scale: CC_SCALE,
      html: cc(
        "Reports",
        `${reportsBanner}${workspace}${types(false)}<div class="bar"></div>`,
        fab(false),
      ),
    },
    "PL-04B-b": {
      size: W,
      scale: CC_SCALE,
      html: cc(
        "Reports",
        `${reportsBanner}${workspace}${types(true)}<div class="bar"></div>`,
        fab(false),
      ),
    },
    // 05A: the research (the Compass report) moves into financial analysis at Alex's click.
    "PL-05A-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("compass"), fab(false), true),
    },
    "PL-05A-b": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial-preparing"), fab(false), true),
    },
    // 05C: the library, Residence 014's report under the pointer; the click opens the report's page.
    "PL-05C-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", generatedReports(true), fab(false), true),
    },
    "PL-05C-b": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial"), fab(false), true),
    },
    // 06B and 07A: the report with Financial prepared; the agent opened from her button, her draft, Alex's edit, approved.
    "PL-06B-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial"), fab(true), true),
    },
    "PL-06B-b": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial"), agentPanel("open"), true),
    },
    "PL-07A-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial"), agentPanel("editing"), true),
    },
    "PL-07A-b": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", investmentReport("financial"), agentPanel("approved"), true),
    },
    // 11A: the Demo workspace cut, Overview with the demo's project.
    "PL-11A-c": { size: W, scale: CC_SCALE, html: cc("Overview", overview, fab(false), true) },
    // Finance: 05B opens the file's Finance Decisions; 13A records Jamie's call.
    "PL-05B-a": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Overview", overviewTab, "Finance Decisions")),
    },
    "PL-05B-b": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Finance Decisions", decisionsTab("current"))),
    },
    "PL-13A-a": {
      size: W,
      scale: SCALE,
      html: fin(purchaseFile("Finance Decisions", decisionsTab("current")), decisionDialog),
    },
    "PL-13A-b": {
      size: W,
      scale: SCALE,
      html: fin(
        purchaseFile("Finance Decisions", decisionsTab("recorded")),
        toast("Decision recorded"),
      ),
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
    "PL-06A-b": { size: L, scale: 2, html: cli("team", propertyTeam) },
    // Accountant: a client file's Requests; Mia marks the income statement fulfilled.
    "PL-08A-a": { size: W, scale: SCALE, html: accFile(false) },
    "PL-08A-b": { size: W, scale: SCALE, html: accFile(true) },
    // 08B: the client's report as delivered, the exported PDF, on the meeting room's display.
    "PL-08B": {
      size: W,
      scale: SCALE,
      html: pdfViewer({
        title: "Investment Compass — Banksia Rise, NSW",
        page: reportCover(0.76),
        pageOf: [1, 22],
        zoom: "57%",
        thumbs: reportThumbs,
      }),
    },
    // Solicitor: 09B, the matter's Overview, then its Docs (the document register) at Priya's click.
    "PL-09B-a": {
      size: W,
      scale: SCALE,
      html: sol(`${matterHead}${matterTabs("Overview", "Docs")}${matterOverview}`),
    },
    "PL-09B-b": {
      size: W,
      scale: SCALE,
      html: sol(`${matterHead}${matterTabs("Docs", "Docs")}${docsTab}`),
    },
    // 12B: the floor plan's PDF beside the matter's Notes; "Save notes", then its toast.
    "PL-12B-a": { size: W, scale: SCALE, html: tiled(false) },
    "PL-12B-b": { size: W, scale: SCALE, html: tiled(true) },
    // Builder / Developer: 12A, the Residence 014 plate on the Stock List, then the plan's own tab. At the
    // Command Centre's scale: the plate's elevation is 34rem wide in the code, too wide for a 1280 px page.
    "PL-12A-a": { size: W, scale: CC_SCALE, html: daniel(false) },
    "PL-12A-b": { size: W, scale: CC_SCALE, html: daniel(true) },
    // ---- System edition: the pages still to build (BRIEF.md)
    // 04.2: four portals' home pages around the hub (the Client Portal's is PL-06A-a).
    "NEW-DASHBOARDS-solicitor": { size: W, scale: SCALE, html: solDash },
    "NEW-DASHBOARDS-accountant": { size: W, scale: SCALE, html: accDash },
    "NEW-DASHBOARDS-finance": { size: W, scale: SCALE, html: finDash },
    "NEW-DASHBOARDS-builders": { size: W, scale: CC_SCALE, html: bnDash },
    // 06.1: Jordan's thread, the reply typed; then sent.
    "NEW-MESSAGE-HUB-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Message Hub", messageHub(false), "", true, MH_SCROLL),
    },
    "NEW-MESSAGE-HUB-b": {
      size: W,
      scale: CC_SCALE,
      html: cc("Message Hub", messageHub(true), "", true, MH_SCROLL),
    },
    // 05.2 and 08.2: the client's report, inside, as the standard PDF draws it for this issuer. Each page on
    // its own for the document fan, and the viewer at the summary (page 4) and at how the grade was reached.
    "NEW-REPORT-PAGES-cover": {
      size: SHEET,
      scale: 2,
      html: `<div style="position:absolute;inset:0;background:${DOC.field}"><div style="position:absolute;left:0;top:0">${docCover(1)}</div></div>`,
    },
    "NEW-REPORT-PAGES-contents": { size: SHEET, scale: 2, html: onSheet(contentsPage()) },
    "NEW-REPORT-PAGES-property": { size: SHEET, scale: 2, html: onSheet(propertyPage()) },
    "NEW-REPORT-PAGES-summary": { size: SHEET, scale: 2, html: onSheet(summaryPage()) },
    "NEW-REPORT-PAGES-assessment": { size: SHEET, scale: 2, html: onSheet(gradePage()) },
    "NEW-REPORT-PAGES-a": { size: W, scale: SCALE, html: docViewer(4) },
    // `sheetAt` and `marks`: where the sheet is in the viewer, and the passages a frame marks on it.
    "NEW-REPORT-PAGES-b": {
      size: W,
      scale: SCALE,
      html: docViewer(19),
      sheetAt: [493.71, 62, 0.76],
      marks: GRADE_MARKS,
    },
    // 08.3: the report on the client's Reports page, and the next discussion on My Appointments.
    "NEW-CLIENT-REPORTS-a": { size: L, scale: 2, html: clientReports },
    "NEW-CLIENT-REPORTS-b": { size: L, scale: 2, html: clientAppointments },
  };
  return { css: CSS, plates };
};
