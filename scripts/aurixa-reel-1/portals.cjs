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
/* Builder / Developer: navy-teal on a fine grid, serif headings, monospaced labels */
.bld { background:linear-gradient(rgba(0,168,181,.05) 1px, transparent 1px) 0 0/34px 34px, linear-gradient(90deg, rgba(0,168,181,.05) 1px, transparent 1px) 0 0/34px 34px,
  radial-gradient(900px 500px at 70% 0%, rgba(0,120,140,.30), transparent 60%), #08151d; }
.bld .side { background:linear-gradient(180deg,#0d2230,#0a1720); border-right-color:rgba(0,168,181,.12); }
.bld .brand, .bld .top { border-color:rgba(0,168,181,.12); }
.bld .top { background:linear-gradient(90deg,#0b1d28,#0c1a24); }
.bld .mono { font-family:Inconsolata, Consolas, monospace; letter-spacing:.2em; font-size:8.5px; font-weight:700; color:#7f97a3; }
.bld .chips { display:flex; gap:6px; margin-top:8px; }
.bld .chips span { font-family:Inconsolata, Consolas, monospace; font-size:7px; letter-spacing:.08em; font-weight:700; border:1px solid rgba(255,255,255,.18); border-radius:5px; padding:3px 6px; }
.bld .who { flex-direction:column; align-items:flex-start; background:linear-gradient(135deg,#112b3a,#0d2230); border-color:rgba(0,168,181,.15); }
.bld .av { background:#0d3a44; color:#33c6cf; }
.bld nav a.on { background:rgba(0,168,181,.14); color:#fff; font-weight:700; }
.bld nav a.on::before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px; border-radius:2px; background:#00A8B5; }
.bld .banner { border-color:rgba(0,168,181,.35); background:linear-gradient(120deg,#0e2f3c,#0b2230 70%); }
.bld .eb { color:#20b8c2; font-family:Inconsolata, Consolas, monospace; }
.bld .h1 { font-family:"Aurixa Display", Georgia, serif; font-weight:700; font-size:30px; }
.bld .panel, .bld .stat, .bld .line, .bld .card { background:rgba(12,30,40,.85); border-color:rgba(0,168,181,.14); }
.bld .line.sel, .bld .card.tsel { border:2px solid #00A8B5; background:linear-gradient(90deg, rgba(0,168,181,.24), rgba(0,168,181,.06)); }
.bld .ph { font-family:"Aurixa Display", Georgia, serif; font-weight:700; font-size:15px; }
.bld .info { display:grid; grid-template-columns:1fr 1fr; border:1px solid rgba(0,168,181,.18); border-radius:10px; overflow:hidden; min-width:330px; }
.bld .info div { padding:9px 12px; border-right:1px solid rgba(0,168,181,.12); border-bottom:1px solid rgba(0,168,181,.12); }
.bld .info b { display:block; font-size:11.5px; margin-top:3px; }
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
.ccr .qappr.old { opacity:.55; }
.ccr .qubub { align-self:flex-end; max-width:82%; background:#1d4ed8; color:#fff; font-size:13px; font-weight:600; line-height:1.45; padding:10px 14px; border-radius:16px; }
.ccr .qtrace { display:flex; align-items:center; gap:10px; font-size:12px; color:#a1a1aa; }
.ccr .qorb { width:18px; height:18px; border-radius:50%; background:radial-gradient(circle at 40% 35%, #ffe08a, #d4a017 60%, #6b4a00); box-shadow:0 0 10px rgba(240,190,60,.6); }
.ccr .qappr { border-radius:12px; border:1px solid rgba(229,185,58,.35); background:#0f0f13; padding:12px; }
.ccr .qapprh { display:flex; align-items:center; font-size:12px; font-weight:700; }
.ccr .qapprh .wait { color:#e5b93a; } .ccr .qapprh .ok { color:#33c6cf; }
.ccr .qmail { border-radius:9px; border:1px solid rgba(61,99,255,.25); overflow:hidden; font-size:11.5px; }
.ccr .qmailh { font-weight:700; color:#8fa6ff; background:rgba(61,99,255,.10); padding:7px 12px; }
.ccr .qmail .m { color:#9c9ca5; }
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

module.exports = function portals({ P, D, EMBLEM, MASCOT }) {
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
      ["CLIENT &amp; CRM", [["users", "Clients"]]],
    ]
      .map(
        ([head, items]) =>
          `<div class="grp"><h6>${head}${svg("chevron", "#B48D3C", 2)}</h6>${items
            .map(([ic, label]) => `<a class="${label === on ? "on" : ""}">${svg(ic)}${label}</a>`)
            .join("")}</div>`,
      )
      .join("");
  const cc = (on, col, extra = "", plain = false) => `<div class="ccr">
    <aside class="cside">
      <div class="tenant">${emb(40)}<div><div class="t">AURIXA SYSTEMS</div><div class="s">COMMAND CENTRE</div></div></div>
      <div class="filter">${svg("search", "#8a8a8f")}Filter navigation...</div>
      ${ccGroups(on)}
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
    const approval = (
      approved,
      superseded = false,
    ) => `<div class="qappr${superseded ? " old" : ""}"><div class="qapprh"><span class="${approved ? "ok" : "wait"}">${approved ? "✓ Approved" : "Needs your go-ahead"}</span><span class="qsmall" style="margin-left:auto">Proposed action</span></div>
      <div style="font-size:12.5px;font-weight:600;margin:8px 0">This action needs your approval</div>
      <div class="qmail"><div class="qmailh">📧 Email Preview</div><div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div><span class="m">From:</span> <span class="qchip on">🏢 Admin</span> <span class="qchip">👤 Personal</span></div>
        <div><span class="m">To:</span> <b>Jordan Ellis</b></div><div><span class="m">Subject:</span> <b>Residence 014: your client summary</b></div>
        <div class="qbody"><div class="m" style="font-size:9.5px;letter-spacing:.12em;margin-bottom:4px">BODY</div>${bodyOf(approved)}</div></div></div>
      ${approved || superseded ? "" : `<div style="display:flex;gap:8px;margin-top:10px">${qbtn("check", "Approve", "blue wide")}${qbtn("", "⊗ Cancel", "wide")}</div>`}</div>`;
    return `<div class="qagent">
      <div class="qagh">${mascot(50)}<div><b style="font-size:15px">Aurixa</b><div class="qsmall" style="font-size:12px">Ready when you are</div></div>
        <div style="margin-left:auto;display:flex;gap:14px;align-items:center">${["msg", "refresh", "users", "bell"].map((i) => svg(i, "#c4c4cc", 1.7)).join("")}<span style="color:#c4c4cc">···</span><span style="color:#c4c4cc;font-size:18px">×</span></div></div>
      <div class="qagb">
        <div class="qubub">Draft a short note to Jordan Ellis about his Residence 014 client summary.</div>
        <div class="qtrace"><span class="qorb"></span>Worked for 4s · 1 step<span style="margin-left:auto">⌄</span></div>
        <div style="font-size:13px;line-height:1.55">Here is a draft for <b>Jordan Ellis</b>. Nothing is sent until you give it the go-ahead.</div>
        ${approval(false, state === "approved")}
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
    ["grid", "Dashboard", false],
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
  const fin = (body, extra = "") =>
    shell({
      kind: "fin",
      label: "FINANCE PORTAL",
      who: "Jamie Chen",
      org: "Harbour Finance Group",
      initials: "JC",
      items: finItems("files"),
      top: `<div class="fback">${ic("arrowl", "#c3c8d4")}Back to dashboard</div><div class="search" style="margin-left:auto;min-width:220px">${ic("search", "#8d95a8")}Search…<span class="kbd">⌘K</span></div>`,
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
    // 05C: the library, Residence 014's report under the pointer; then its client-facing document (pending its page).
    "PL-05C-a": {
      size: W,
      scale: CC_SCALE,
      html: cc("Generated Reports", generatedReports(true), fab(false), true),
    },
    "PL-05C-b": {
      size: W,
      scale: CC_SCALE,
      html: cc(
        "Generated Reports",
        generatedReports(false),
        `<div class="scrim"></div><div class="creport">
          <div style="display:flex;gap:26px;align-items:center">${pimg(300, 186)}<div><div style="font-size:11px;letter-spacing:.2em;font-weight:800;color:#9a7424">PROJECT BANKSIA / RESIDENCE 014</div><h2>Client summary</h2></div></div>
          <div class="rule"></div><h4>KEY CONSIDERATIONS</h4><div class="skel"><div style="width:92%"></div><div style="width:84%"></div><div style="width:66%"></div></div>
          <div class="rule"></div><h4>QUESTIONS FOR DISCUSSION</h4><div class="skel"><div style="width:88%"></div><div style="width:70%"></div><div style="width:78%"></div></div>
          <div style="font-size:11px;color:#5a6b85;margin-top:6px">Prepared by Alex Morgan · Aurixa Systems · Demo workspace</div></div>`,
        true,
      ),
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
      html: bld(`<div class="row" style="flex:1"><div class="panel" style="flex:1.6;align-items:center;justify-content:center;border:2px solid #00A8B5">${dimg(540, 372)}</div>
        <div class="panel" style="flex:1"><div class="mono">FLOOR PLAN</div><div class="h1" style="font-size:24px;margin:0;font-family:'Aurixa Display',Georgia,serif">Residence 014</div><div class="ps" style="margin:0">Project Banksia</div></div></div>`),
    },
  };
  return { css: CSS, plates };
};
