// Reel 1's graphics kit, system edition (docs/brands/aurixa-reel-1/system-edition/BRIEF.md, "The graphics
// kit"): the devices the plates of today's tools and the style frames both draw, so the two can't drift.
// Today's tools are drawn in the before tokens; everything else in the Aurixa tokens. Both come from
// aurixa-reel.css, which reel_css.ts writes from the brand's code.
//   const KIT = require("./kit.cjs")({ P, D });  // P and D: the listing image and the floor plan, as data URLs
module.exports = function kit({ P = null, D = null } = {}) {
  /** Today's tools (G-WINDOW-PLAIN, G-LISTING, the notifications), in the before tokens. */
  const css = `/* system edition: today's tools (G-WINDOW-PLAIN, G-LISTING, the notifications), in the before tokens */
.before { background:var(--reel-before-paper); color:var(--reel-before-ink); font-family:var(--reel-before-type); }
.bp { position:absolute; display:flex; flex-direction:column; overflow:hidden; background:var(--reel-before-surface); color:var(--reel-before-ink);
  font-family:var(--reel-before-type); border:1px solid var(--reel-before-border); border-radius:10px; box-shadow:0 14px 36px rgba(17,24,39,.14); }
.bp-bar { height:52px; flex:none; display:flex; align-items:center; gap:10px; padding:0 18px; background:var(--reel-before-paper);
  border-bottom:1px solid var(--reel-before-border); font-size:20px; font-weight:600; color:var(--reel-before-ink-muted); }
.bp-bar i { width:13px; height:13px; border-radius:50%; background:var(--reel-before-border); }
.bp-bar span { margin-left:10px; }
.bp-in { flex:1; min-height:0; display:flex; }
.bp-muted { color:var(--reel-before-ink-muted); }
.bp-folders { width:250px; flex:none; padding:22px 14px; display:flex; flex-direction:column; gap:4px; border-right:1px solid var(--reel-before-border); font-size:22px; }
.bp-folders div { display:flex; align-items:center; padding:11px 14px; border-radius:8px; }
.bp-folders div.on { background:var(--reel-before-paper); font-weight:700; }
.bp-folders b { margin-left:auto; font-size:19px; }
.bp-list { width:640px; flex:none; display:flex; flex-direction:column; border-right:1px solid var(--reel-before-border); }
.bp-list h4 { font-size:24px; padding:22px 24px 16px; border-bottom:1px solid var(--reel-before-border); display:flex; align-items:baseline; gap:12px; }
.bp-row { padding:18px 24px; border-bottom:1px solid var(--reel-before-border); display:flex; flex-direction:column; gap:6px; position:relative; }
.bp-row.on { background:var(--reel-before-paper); }
.bp-row.on::before { content:""; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--reel-before-ink); }
.bp-row .who { display:flex; align-items:center; gap:10px; font-size:23px; font-weight:700; }
.bp-row .who em { width:10px; height:10px; border-radius:50%; background:var(--reel-before-ink); }
.bp-row .who small { margin-left:auto; font-size:19px; font-weight:400; color:var(--reel-before-ink-muted); }
.bp-row .subj { font-size:21px; font-weight:600; }
.bp-row .prev { font-size:20px; color:var(--reel-before-ink-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bp-row .bars div { height:13px; border-radius:7px; background:var(--reel-before-paper); margin:7px 0; }
.bp-read { flex:1; min-width:0; padding:30px 36px; display:flex; flex-direction:column; gap:18px; }
.bp-read h3 { font-size:34px; font-weight:700; line-height:1.2; }
.bp-meta { font-size:21px; color:var(--reel-before-ink-muted); display:flex; gap:14px; }
.bp-meta b { color:var(--reel-before-ink); font-weight:600; }
.bp-msg { font-size:30px; line-height:1.4; }
.bp-btns { display:flex; gap:14px; margin-top:6px; }
.bp-btn { display:inline-flex; align-items:center; gap:10px; font-size:23px; font-weight:600; padding:13px 24px; border-radius:8px;
  border:1px solid var(--reel-before-border); background:var(--reel-before-surface); color:var(--reel-before-ink); }
.bp-btn.bp-reply { background:var(--reel-before-ink); border-color:var(--reel-before-ink); color:var(--reel-before-surface); }
.bp-btn svg { width:22px; height:22px; }
/* G-LISTING: a plain property-site card */
.ls-card { display:flex; flex-direction:column; overflow:hidden; background:var(--reel-before-surface); color:var(--reel-before-ink);
  font-family:var(--reel-before-type); border:1px solid var(--reel-before-border); border-radius:12px; }
.ls-card.row { flex-direction:row; align-items:stretch; }
.ls-photo { background:var(--reel-before-paper) center/cover no-repeat; flex:none; }
.ls-body { padding:18px 22px; display:flex; flex-direction:column; gap:8px; min-width:0; }
.ls-title { font-size:26px; font-weight:700; }
.ls-addr { font-size:20px; color:var(--reel-before-ink-muted); }
.ls-facts { display:flex; flex-wrap:wrap; gap:6px 18px; font-size:20px; font-weight:600; }
.ls-facts span { display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
.ls-facts svg { width:20px; height:20px; color:var(--reel-before-ink-muted); }
.ls-chips { display:flex; flex-wrap:wrap; gap:8px; }
.ls-chip { font-size:17px; font-weight:600; padding:5px 11px; border-radius:999px; border:1px solid var(--reel-before-border); background:var(--reel-before-paper); }
/* today's notifications */
.nt-toast { position:absolute; display:flex; gap:16px; align-items:flex-start; width:640px; padding:20px 22px; background:var(--reel-before-surface);
  color:var(--reel-before-ink); font-family:var(--reel-before-type); border:1px solid var(--reel-before-border); border-radius:14px;
  box-shadow:0 12px 30px rgba(17,24,39,.18); }
.nt-glyph { width:46px; height:46px; flex:none; border-radius:11px; background:var(--reel-before-paper); border:1px solid var(--reel-before-border);
  display:grid; place-items:center; color:var(--reel-before-ink); }
.nt-glyph svg { width:24px; height:24px; }
.nt-thumb { width:92px; height:92px; flex:none; border-radius:10px; border:1px solid var(--reel-before-border); background:#fff center/contain no-repeat; }
.nt-app { display:flex; font-size:19px; color:var(--reel-before-ink-muted); }
.nt-app small { margin-left:auto; font-size:18px; }
.nt-title { font-size:25px; font-weight:700; margin-top:3px; }
.nt-text { font-size:21px; color:var(--reel-before-ink-muted); margin-top:2px; }`;

  /** G-WINDOW-PLAIN: white, a grey system title bar, the system's own type; no brand colour, no glass. */
  const plainWin = (x, y, w, h, title, inner) =>
    `<div class="bp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="bp-bar"><i></i><i></i><i></i><span>${title}</span></div><div class="bp-in">${inner}</div></div>`;
  /** Line glyphs for today's tools, deliberately not the products' icon set. */
  const GLYPH = {
    bed: '<path d="M3 18v-8h18v8M3 14h18M7 10V7h6v3"/>',
    bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0"/>',
    car: '<path d="M5 16l1.5-5h11l1.5 5M4 16h16v3H4zM7 19v1M17 19v1"/>',
    land: '<path d="M4 4h16v16H4zM4 9h5M15 20v-5"/>',
    mail: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
    chat: '<path d="M4 5h16v10H9l-5 4z"/>',
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
    crm: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a5 5 0 0 1 10 0M16 8h5M16 12h5M16 16h5"/>',
    reply: '<path d="M10 8L5 12l5 4M5 12h9a5 5 0 0 1 5 5v1"/>',
    forward: '<path d="M14 8l5 4-5 4M19 12h-9a5 5 0 0 0-5 5v1"/>',
  };
  const glyph = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[name]}</svg>`;
  /** G-LISTING: a plain property-site card: the image P, the address line, four facts, small status chips. */
  const listing = ({ width, row = false, chips = [], enquiries = null }) => {
    const photo = row
      ? `width:${Math.round(width * 0.36)}px`
      : `height:${Math.round(width * 0.62)}px`;
    const facts = [
      ["bed", "4 bed"],
      ["bath", "2 bath"],
      ["car", "2 car"],
      ["land", "450 m² land"],
    ]
      .map(([g, t]) => `<span>${glyph(g)}${t}</span>`)
      .join("");
    return `<div class="ls-card${row ? " row" : ""}" style="width:${width}px">
    <div class="ls-photo" style="${photo};${P ? `background-image:url('${P}')` : ""}"></div>
    <div class="ls-body"><div class="ls-title">14 Wattle Grove</div><div class="ls-addr">Banksia Rise NSW 2155</div>
      <div class="ls-facts">${facts}</div>
      ${chips.length ? `<div class="ls-chips">${chips.map((c) => `<span class="ls-chip">${c}</span>`).join("")}</div>` : ""}
      ${enquiries === null ? "" : `<div class="ls-addr">${enquiries} enquiries</div>`}</div></div>`;
  };
  /** NEW-INBOX: a plain mail client with Jordan Ellis's question as the top row, and Reply (02.1). */
  const inbox = () => {
    const folders = [["Inbox", "1"], ["Starred"], ["Sent"], ["Drafts"], ["Archive"]]
      .map(([name, n], i) => `<div${i ? "" : ' class="on"'}>${name}${n ? `<b>${n}</b>` : ""}</div>`)
      .join("");
    const other = (a, b) =>
      `<div class="bp-row"><div class="bars"><div style="width:${a}%"></div><div style="width:${b}%"></div></div></div>`;
    return `<div class="bp-folders">${folders}</div>
    <div class="bp-list"><h4>Inbox<span class="bp-muted" style="font-size:19px;font-weight:400">Today</span></h4>
      <div class="bp-row on"><div class="who"><em></em>Jordan Ellis<small>9:14</small></div><div class="subj">14 Wattle Grove, Banksia Rise</div><div class="prev">Can we review whether this suits my plans?</div></div>
      ${other(46, 80)}${other(38, 72)}${other(52, 64)}${other(30, 76)}${other(44, 58)}</div>
    <div class="bp-read"><h3>14 Wattle Grove, Banksia Rise</h3>
      <div class="bp-meta"><span>From: <b>Jordan Ellis</b> · To: <b>Alex Morgan</b></span><span style="margin-left:auto">Monday 9:14</span></div>
      <div class="bp-msg">Can we review whether this suits my plans?</div>
      ${listing({ width: 780, row: true, chips: ["Expressions of interest close Friday"] })}
      <div class="bp-btns"><span class="bp-btn bp-reply">${glyph("reply")}Reply</span><span class="bp-btn">${glyph("forward")}Forward</span></div></div>`;
  };
  /** NEW-NOTIFICATIONS: plain toasts from mail, chat, a calendar and a CRM, and PL-03A's floor plan (03.1). */
  const NOTES = {
    mail: ["mail", "Mail", "6 new messages", "2 flagged for follow-up"],
    chat: ["chat", "Team chat", "3 unread in #listings", "Can someone pick up the 2 pm call?"],
    calendar: ["calendar", "Calendar", "Team meeting in 10 minutes", "Weekly pipeline · Room 2"],
    crm: ["crm", "CRM", "4 follow-ups due today", "The oldest is 3 days overdue"],
    plan: [null, "Property information", "Floor plan received", "14 Wattle Grove"],
  };
  const note = (key, x = 24, y = 24) => {
    const [g, app, title, text] = NOTES[key];
    const lead = g
      ? `<div class="nt-glyph">${glyph(g)}</div>`
      : `<div class="nt-thumb" style="${D ? `background-image:url('${D}')` : ""}"></div>`;
    return `<div class="nt-toast" style="left:${x}px;top:${y}px">${lead}<div style="flex:1;min-width:0"><div class="nt-app">${app}<small>now</small></div><div class="nt-title">${title}</div><div class="nt-text">${text}</div></div></div>`;
  };

  // ------------------------------------------------------------------ the frame (1080 × 1920)
  // BRIEF.md, "How every screen behaves": the frame is used in zones, so captions and the platforms' own
  // buttons never cover the work. The site's sizes are CSS px at 1×; a frame px is about a third of a
  // phone's CSS px, so the kit draws the site's lines, corners, dots and glows at K times their size, and
  // sets any text the voiceover names at least 22 px tall.
  const FRAME = { width: 1080, height: 1920 };
  const ZONES = {
    top: [0, 250],
    rail: [250, 360],
    action: [360, 1300],
    captions: [1300, 1560],
    bottom: [1560, 1920],
  };
  const K = 2;
  const px = (v) => `${Math.round(v * 100) / 100}px`;
  const MONO = `"Inconsolata", ui-monospace, monospace`; // the site's ui-monospace, drawn as the plates draw it

  const frameCss = `
.fk { position:relative; width:1080px; height:1920px; overflow:hidden; font-family:var(--reel-sans); color:var(--reel-ink);
  -webkit-font-smoothing:antialiased; }
.fk.aurixa { background:var(--reel-ground); }
.fk.before { background:var(--reel-before-paper); color:var(--reel-before-ink); font-family:var(--reel-before-type); }
.fk-layer { position:absolute; inset:0; }
/* The site's dot field (.framework-visual::before) at K times its pitch and dot. The layer's own .25 opacity is
   left off: at a third of a phone pixel a dot that faint doesn't survive video compression. */
.fk-field { position:absolute; left:0; top:0; width:${FRAME.width / K}px; height:${FRAME.height / K}px; transform:scale(${K});
  transform-origin:0 0; background-image:var(--reel-dot-field); background-size:var(--reel-dot-field-background-size); }
.fk-glow { position:absolute; inset:0; background:radial-gradient(75% 42% at 50% 44%, color-mix(in srgb, var(--reel-surface) 85%, transparent), transparent 74%); }
/* G-WINDOW: the products' glass around a page at its drawn zoom. */
.fk-win { position:absolute; padding:12px; border-radius:calc(var(--reel-radius-window) * 1.6); background:var(--reel-glass);
  background-image:var(--reel-sheen); border:${K}px solid var(--reel-border); box-shadow:var(--reel-shadow-window);
  backdrop-filter:blur(var(--reel-glass-blur)); -webkit-backdrop-filter:blur(var(--reel-glass-blur)); }
.fk-page { position:relative; overflow:hidden; border-radius:calc(var(--reel-radius-window) * 1.6 - 12px); }
.fk-scale { position:absolute; left:0; top:0; transform-origin:0 0; overflow:hidden; }
.fk-shot { position:absolute; inset:0; background-size:100% 100%; }
.fk-veil { position:absolute; inset:0; background:var(--reel-ground); pointer-events:none; }
/* G-WINDOW-PLAIN's shadow and G-DOCUMENT's: the document lifted off its page. */
.fk-doc { position:absolute; transform-origin:50% 60%; box-shadow:var(--reel-shadow-document); overflow:hidden; }
/* G-RAIL: the journey rail, in the site's eyebrow. */
.fk-rail { position:absolute; left:60px; right:60px; top:264px; height:84px; display:flex; align-items:center; justify-content:center; gap:12px;
  border-radius:calc(var(--reel-radius-card) * ${K}); background:color-mix(in srgb, var(--reel-surface) 92%, transparent);
  border:${K}px solid var(--reel-border); box-shadow:var(--reel-shadow-window); }
.fk-rail > span { display:inline-flex; align-items:center; gap:10px; white-space:nowrap; font:var(--reel-mono); font-family:${MONO};
  font-size:22px; letter-spacing:var(--reel-mono-letter-spacing); text-transform:var(--reel-mono-text-transform); color:var(--reel-ink-muted); }
.fk-rail > span.done { color:var(--reel-ink); }
.fk-rail > span.done svg { width:20px; height:20px; color:var(--reel-gold-ink); }
.fk-rail > span.on { color:var(--reel-gold-ink); }
.fk-rail > span.on::before { content:""; display:block; width:var(--reel-hairline-width); height:${K}px; background:var(--reel-hairline); }
.fk-rail > i { font-style:normal; color:var(--reel-ink-muted); opacity:.55; font-family:${MONO}; font-size:22px; }
.fk-reading { position:absolute; top:356px; display:flex; align-items:center; gap:12px; padding:12px 20px; border-radius:calc(var(--reel-radius-card) * ${K});
  background:color-mix(in srgb, var(--reel-surface) 92%, transparent); border:${K}px solid var(--reel-border); font-size:26px; font-weight:600; color:var(--reel-ink); }
.fk-reading::before { content:""; display:block; width:28px; height:${K}px; background:var(--reel-hairline); }
/* The site's eyebrow (.compliance-eyebrow), and a label chip in it on the panel. */
.fk-eyebrow { display:flex; align-items:center; gap:.75em; font:var(--reel-mono); font-family:${MONO}; letter-spacing:var(--reel-mono-letter-spacing);
  text-transform:var(--reel-mono-text-transform); color:var(--reel-mono-color); white-space:nowrap; }
.fk-eyebrow::before { content:""; display:block; width:var(--reel-hairline-width); height:${K}px; background:var(--reel-hairline); }
.fk-chip { position:absolute; transform:translateX(-50%); padding:9px 16px; border-radius:999px; white-space:nowrap;
  background:color-mix(in srgb, var(--reel-surface) 94%, transparent); border:${K}px solid var(--reel-border);
  font:var(--reel-mono); font-family:${MONO}; font-size:19px; letter-spacing:var(--reel-mono-letter-spacing); text-transform:var(--reel-mono-text-transform); color:var(--reel-gold-ink); }
/* G-POINTER and its press: the plates' own arrow, and a ring in the focus cyan. */
.fk-pointer { position:absolute; width:46px; height:46px; z-index:20; filter:drop-shadow(0 2px 4px rgba(0,0,0,.55)); }
.fk-press { position:absolute; border-radius:50%; border:${K}px solid var(--reel-press-ring); z-index:19; }
/* G-FOCUS: the site's corner marks (.compliance-corners). */
.fk-focus { position:absolute; z-index:18; }
.fk-focus::before, .fk-focus::after { content:""; position:absolute; width:calc(var(--reel-corners-width) * ${K}); height:calc(var(--reel-corners-height) * ${K}); }
.fk-focus::before { left:0; top:0; border-top:${K}px solid var(--reel-press-ring); border-left:${K}px solid var(--reel-press-ring); }
.fk-focus::after { right:0; bottom:0; border-right:${K}px solid var(--reel-gold-ink); border-bottom:${K}px solid var(--reel-gold-ink); }
/* G-HIGHLIGHT: the eyebrow's gold rule, under a passage. */
.fk-mark { position:absolute; height:${K}px; background:var(--reel-hairline); z-index:17; }
/* G-LINKS: the site's rail line, with its traveller. */
.fk-link { position:absolute; height:${K}px; transform-origin:0 50%; background:linear-gradient(90deg, transparent, #5edde8 12%, #c89b3c 88%, transparent); }
.fk-traveller { position:absolute; width:calc(var(--reel-traveller-width) * ${K}); height:calc(var(--reel-traveller-height) * ${K});
  border-radius:var(--reel-traveller-border-radius); background:var(--reel-traveller); box-shadow:0 0 28px #d7b35f; transform:translate(-50%, -50%); }
/* G-RECORD-CARD: 14 Wattle Grove, the object the film follows. */
.fk-record { position:absolute; overflow:hidden; border-radius:calc(var(--reel-radius-card) * ${K}); background:var(--reel-surface-raised);
  border:${K}px solid var(--reel-border); box-shadow:var(--reel-shadow-window); }
.fk-record .img { background:#2a3b52 center/cover no-repeat; }
.fk-record .body { padding:22px 26px 24px; display:flex; flex-direction:column; gap:10px; }
.fk-record .fk-eyebrow { font-size:19px; }
.fk-record h3 { font-family:var(--reel-display); font-weight:700; font-size:46px; line-height:1.08; color:var(--reel-ink); font-variant-numeric:lining-nums; }
.fk-record p { font-size:24px; color:var(--reel-ink-muted); }
/* A person on the team, as the Client Portal's team page names them. */
.fk-person { position:absolute; display:flex; align-items:center; gap:14px; padding:16px 18px; border-radius:calc(var(--reel-radius-card) * ${K});
  background:var(--reel-glass); background-image:var(--reel-sheen); border:${K}px solid var(--reel-border); box-shadow:var(--reel-shadow-window);
  backdrop-filter:blur(var(--reel-glass-blur)); -webkit-backdrop-filter:blur(var(--reel-glass-blur)); }
.fk-person .av { width:58px; height:58px; flex:none; border-radius:50%; display:grid; place-items:center; font-weight:700; font-size:21px; color:#fff; }
.fk-person .r { font:var(--reel-mono); font-family:${MONO}; font-size:16px; letter-spacing:.18em; color:var(--reel-gold-ink); text-transform:uppercase; white-space:nowrap; }
.fk-person .n { font-size:27px; font-weight:700; margin-top:3px; white-space:nowrap; }
.fk-person .o { font-size:19px; color:var(--reel-ink-muted); margin-top:2px; white-space:nowrap; }
/* G-MAP, G-CLOCK and G-BRIDGE: today's desktop, in the before tokens. */
.fk-clock { position:absolute; display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:10px; background:var(--reel-before-surface);
  border:1px solid var(--reel-before-border); box-shadow:0 8px 20px rgba(17,24,39,.12); font-family:var(--reel-before-type); font-size:24px;
  font-weight:600; color:var(--reel-before-ink); white-space:nowrap; z-index:16; }
.fk-clock svg { width:24px; height:24px; color:var(--reel-before-ink-muted); }
/* Captions as the media worker burns them (media-worker/src/sequence.js, "clean" at the lower third): Inter bold
   63 px, 461 px from the foot, 86 px a side, a 5 px black outline and a 3 px shadow at half strength. */
.fk-cap { position:absolute; left:86px; right:86px; bottom:461px; text-align:center; font:700 63px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
  color:#fff; -webkit-text-stroke:10px #000; paint-order:stroke fill; text-shadow:3px 3px 0 rgba(0,0,0,.5); z-index:40; }
/* The zones, drawn only when a frame is checked. */
.fk-zone { position:absolute; left:0; right:0; border-top:2px dashed rgba(255,0,128,.55); z-index:50; }
.fk-zone b { position:absolute; left:8px; top:4px; font:700 16px/1 ${MONO}; color:rgba(255,0,128,.85); }
`;

  /** The ground a frame stands on: the site's (with its dot field) or today's desktop. */
  const ground = (palette) =>
    palette === "before" ? "" : `<div class="fk-field"></div><div class="fk-glow"></div>`;

  /** A whole frame. `layers` are drawn in order over the ground; the rail and the caption over them. */
  const frame = ({ palette = "aurixa", layers = [], rail = "", caption = "", zones = false }) =>
    `<div class="fk ${palette}">${ground(palette)}${layers.join("")}${rail}${caption ? `<div class="fk-cap">${caption}</div>` : ""}${
      zones
        ? Object.entries(ZONES)
            .map(
              ([name, [top]]) => `<div class="fk-zone" style="top:${top}px"><b>${name}</b></div>`,
            )
            .join("")
        : ""
    }</div>`;

  // ------------------------------------------------------------------ G-RAIL
  const STAGES = ["Research", "Financial", "Report", "Team", "Decision"];
  const TICK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  /** The journey rail at a stage: those before it ticked, it in gold with the eyebrow's rule, the rest muted. */
  const rail = (at, { complete = false, reading = null } = {}) => {
    const now = STAGES.indexOf(at);
    if (now < 0) throw new Error(`The rail has no stage ${at}`);
    const items = STAGES.map((stage, i) => {
      const done = i < now || (complete && i < STAGES.length - 1);
      const cls = i === now ? "on" : done ? "done" : "";
      return `<span class="${cls}">${done ? TICK : ""}${stage}</span>`;
    }).join("<i>·</i>");
    return `<div class="fk-rail">${items}</div>${reading ? `<div class="fk-reading" style="right:60px">${reading}</div>` : ""}`;
  };

  // ------------------------------------------------------------------ G-WINDOW and the camera
  /**
   * A plate inside the products' glass, framed by a virtual camera. `plate` is { html, css: [w, h] } at its
   * drawn size in CSS px; the camera puts the plate's point `focus` at the frame's point `at`, at `zoom`
   * frame px per plate px. The window may run past the frame: the camera has moved in on it.
   */
  const camera = ({ plate, zoom, focus, at, crop = null, chrome = true, dim = 0, style = "" }) => {
    const [cx, cy, cw, ch] = crop ?? [0, 0, ...plate.css];
    const pad = chrome ? 12 + K : 0;
    const left = at[0] - (focus[0] - cx) * zoom - pad;
    const top = at[1] - (focus[1] - cy) * zoom - pad;
    const veil = dim ? `<div class="fk-veil" style="opacity:${dim}"></div>` : "";
    const page = `<div class="fk-page" style="width:${px(cw * zoom)};height:${px(ch * zoom)}${chrome ? "" : ";border-radius:0"}"><div class="fk-scale" style="width:${plate.css[0]}px;height:${plate.css[1]}px;transform:translate(${px(-cx * zoom)}, ${px(-cy * zoom)}) scale(${zoom})">${plate.html}</div>${veil}</div>`;
    return chrome
      ? `<div class="fk-win" style="left:${px(left)};top:${px(top)};${style}">${page}</div>`
      : `<div style="position:absolute;left:${px(left)};top:${px(top)};${style}">${page}</div>`;
  };
  /**
   * Where a window's page sits and how its plate is laid in it (`shot`'s camera, shared with the motion
   * renderer so a still and the film can't frame a page differently): the page's size inside the window
   * (`pw`, `ph`), the plate's offset in the page (`ox`, `oy`) and `map`, which says where any of the
   * plate's points lands in the frame. `css` is the plate's size in CSS px.
   */
  const shotGeometry = ({ css, zoom, focus, at, rect }) => {
    const [vx, vy, vw, vh] = rect;
    const pad = 12 + K;
    const pw = vw - 2 * pad;
    const ph = vh - 2 * pad;
    const [w, h] = css;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const ox = clamp(at[0] - vx - pad - focus[0] * zoom, Math.min(0, pw - w * zoom), 0);
    const oy = clamp(at[1] - vy - pad - focus[1] * zoom, Math.min(0, ph - h * zoom), 0);
    return {
      pad,
      pw,
      ph,
      ox,
      oy,
      map: ([x, y]) => [vx + pad + ox + x * zoom, vy + pad + oy + y * zoom],
    };
  };
  /**
   * A plate in a window that stays put inside the frame (`rect`, frame px) while the camera moves in on
   * the page within it: the plate's point `focus` is brought as near the frame's point `at` as the page's
   * edges allow, at `zoom` frame px per plate px. Returns the window and `map`, which says where any of
   * the plate's points lands in the frame.
   */
  const shot = ({ plate, zoom, focus, at, rect, dim = 0, style = "" }) => {
    const [vx, vy] = rect;
    const [w, h] = plate.css;
    const { pw, ph, ox, oy, map } = shotGeometry({ css: plate.css, zoom, focus, at, rect });
    const veil = dim ? `<div class="fk-veil" style="opacity:${dim}"></div>` : "";
    return {
      html: `<div class="fk-win" style="left:${px(vx)};top:${px(vy)};${style}"><div class="fk-page" style="width:${px(pw)};height:${px(ph)}"><div class="fk-scale" style="width:${w}px;height:${h}px;transform:translate(${px(ox)}, ${px(oy)}) scale(${zoom})">${plate.html}</div>${veil}</div></div>`,
      map,
    };
  };
  /** Where a plate's point lands in the frame under that camera. */
  const through = ({ zoom, focus, at }, [x, y]) => [
    at[0] + (x - focus[0]) * zoom,
    at[1] + (y - focus[1]) * zoom,
  ];

  // ------------------------------------------------------------------ G-POINTER, G-FOCUS, G-HIGHLIGHT
  const ARROW =
    '<path d="M3 2l17 9.5-7.5 1.6L9 21z" fill="var(--reel-pointer)" stroke="var(--reel-pointer-edge)" stroke-width="1.4" stroke-linejoin="round"/>';
  /** The pointer with its tip at (x, y); `press` (0 to 1) is how far its ring has grown and faded. */
  const pointer = (x, y, { press = null } = {}) => {
    const tip = [3 * (46 / 24), 2 * (46 / 24)];
    const ring =
      press === null
        ? ""
        : (() => {
            const d = 24 * K * press;
            return `<div class="fk-press" style="left:${px(x - d / 2)};top:${px(y - d / 2)};width:${px(d)};height:${px(d)};opacity:${(1 - press * 0.75).toFixed(2)}"></div>`;
          })();
    return `${ring}<svg class="fk-pointer" style="left:${px(x - tip[0])};top:${px(y - tip[1])}" viewBox="0 0 24 24">${ARROW}</svg>`;
  };
  const focusCorners = (x, y, w, h, inset = 10) =>
    `<div class="fk-focus" style="left:${px(x - inset)};top:${px(y - inset)};width:${px(w + inset * 2)};height:${px(h + inset * 2)}"></div>`;
  const marker = (x, y, w) =>
    `<div class="fk-mark" style="left:${px(x)};top:${px(y)};width:${px(w)}"></div>`;

  // ------------------------------------------------------------------ G-LINKS, G-RECORD-CARD, the team
  /** The site's rail line from one point to another, with its traveller at `t` (0 to 1) when given. */
  const link = ([x1, y1], [x2, y2], { traveller = null } = {}) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const dot =
      traveller === null
        ? ""
        : `<div class="fk-traveller" style="left:${px(x1 + (x2 - x1) * traveller)};top:${px(y1 + (y2 - y1) * traveller)}"></div>`;
    return `<div class="fk-link" style="left:${px(x1)};top:${px(y1 - K / 2)};width:${px(length)};transform:rotate(${angle.toFixed(3)}deg)"></div>${dot}`;
  };
  const recordCard = ({ x, y, width = 520, imageHeight = 300, titleSize = 46 }) =>
    `<div class="fk-record" style="left:${px(x)};top:${px(y)};width:${px(width)}"><div class="img" style="height:${px(imageHeight)};${P ? `background-image:url('${P}')` : ""}"></div>
      <div class="body"><div class="fk-eyebrow">Banksia Rise</div><h3 style="font-size:${titleSize}px">14 Wattle Grove</h3><p>WG-14 · New Build</p></div></div>`;
  const person = ({ x, y, initials, tone, role, name, firm, width = null }) =>
    `<div class="fk-person" style="left:${px(x)};top:${px(y)}${width ? `;width:${px(width)}` : ""}"><div class="av" style="background:${tone}">${initials}</div>
      <div style="min-width:0"><div class="r">${role}</div><div class="n">${name}</div><div class="o">${firm}</div></div></div>`;

  // ------------------------------------------------------------------ G-DOCUMENT
  /** A page of a document as an object: its own page, lifted, at `rotate` degrees. */
  const doc = ({ x, y, width, height, html, rotate = 0, z = 1, style = "" }) =>
    `<div class="fk-doc" style="left:${px(x)};top:${px(y)};width:${px(width)};height:${px(height)};transform:rotate(${rotate}deg);z-index:${z};${style}">${html}</div>`;

  // ------------------------------------------------------------------ G-MAP
  // Australia's coast, simplified to the eye (longitude, latitude), for a dot-matrix map: never a survey.
  const MAINLAND = [
    [142.5, -10.7],
    [143.4, -12.3],
    [143.6, -13.8],
    [144.5, -14.3],
    [145.3, -15.0],
    [145.4, -16.3],
    [145.9, -16.9],
    [146.1, -17.9],
    [146.4, -18.9],
    [147.4, -19.4],
    [148.6, -20.1],
    [149.0, -20.8],
    [149.6, -22.0],
    [150.2, -22.4],
    [150.8, -22.9],
    [151.2, -23.8],
    [152.0, -24.5],
    [152.7, -25.3],
    [153.1, -25.9],
    [153.1, -27.0],
    [153.4, -27.8],
    [153.6, -28.6],
    [153.6, -29.4],
    [153.3, -30.0],
    [153.1, -30.9],
    [152.9, -31.6],
    [152.6, -32.3],
    [152.0, -32.8],
    [151.5, -33.3],
    [151.2, -33.9],
    [150.9, -34.4],
    [150.7, -35.0],
    [150.2, -35.8],
    [150.1, -36.6],
    [149.9, -37.5],
    [149.5, -37.8],
    [148.6, -37.8],
    [147.8, -37.9],
    [147.0, -38.4],
    [146.4, -39.0],
    [146.0, -38.8],
    [145.4, -38.5],
    [144.9, -38.4],
    [144.6, -38.3],
    [144.0, -38.5],
    [143.5, -38.8],
    [142.6, -38.4],
    [141.8, -38.3],
    [141.0, -38.0],
    [140.4, -37.9],
    [139.8, -37.2],
    [139.6, -36.6],
    [139.3, -35.8],
    [138.6, -35.6],
    [138.1, -35.6],
    [138.5, -34.9],
    [138.1, -34.2],
    [137.7, -34.6],
    [137.0, -35.3],
    [137.5, -34.4],
    [137.8, -32.5],
    [137.0, -33.6],
    [135.8, -34.8],
    [135.2, -33.9],
    [134.2, -32.8],
    [133.6, -32.1],
    [132.5, -32.0],
    [131.2, -31.5],
    [128.9, -31.7],
    [126.0, -32.3],
    [124.2, -33.0],
    [123.5, -33.9],
    [121.9, -33.9],
    [120.0, -33.9],
    [119.2, -34.4],
    [117.9, -35.1],
    [116.5, -35.0],
    [115.6, -34.4],
    [115.1, -34.4],
    [115.0, -33.5],
    [115.6, -33.3],
    [115.7, -32.5],
    [115.75, -31.95],
    [115.4, -31.0],
    [115.0, -29.9],
    [114.6, -28.8],
    [114.1, -27.6],
    [113.5, -26.5],
    [113.7, -25.6],
    [113.4, -24.5],
    [113.7, -23.5],
    [114.0, -21.9],
    [114.6, -21.7],
    [115.1, -21.6],
    [116.3, -20.8],
    [117.2, -20.6],
    [118.6, -20.3],
    [120.0, -19.9],
    [121.0, -19.5],
    [121.8, -18.5],
    [122.2, -18.0],
    [122.4, -17.0],
    [123.0, -16.5],
    [123.8, -16.2],
    [124.4, -15.5],
    [125.2, -14.6],
    [126.0, -14.1],
    [126.9, -13.8],
    [127.8, -14.3],
    [128.2, -14.9],
    [128.6, -14.8],
    [129.4, -14.9],
    [129.7, -14.0],
    [130.1, -13.3],
    [130.4, -12.7],
    [130.8, -12.4],
    [131.3, -12.1],
    [132.0, -11.6],
    [132.6, -11.4],
    [133.5, -11.8],
    [134.3, -12.0],
    [135.2, -12.2],
    [136.6, -12.0],
    [136.9, -12.3],
    [136.6, -13.0],
    [135.9, -13.4],
    [135.9, -14.0],
    [135.4, -14.8],
    [135.9, -15.3],
    [136.6, -15.8],
    [137.7, -16.4],
    [138.7, -16.8],
    [139.6, -17.3],
    [140.6, -17.6],
    [140.8, -17.5],
    [141.3, -16.4],
    [141.6, -15.0],
    [141.6, -13.7],
    [141.6, -12.6],
    [141.9, -12.6],
    [142.1, -11.6],
  ];
  const TASMANIA = [
    [144.6, -40.7],
    [145.3, -40.8],
    [146.0, -41.1],
    [146.6, -41.1],
    [147.3, -41.0],
    [148.0, -40.8],
    [148.3, -41.0],
    [148.3, -42.0],
    [148.0, -42.6],
    [147.9, -43.2],
    [147.3, -43.3],
    [146.9, -43.6],
    [146.0, -43.5],
    [145.5, -42.9],
    [145.2, -42.2],
    [144.7, -41.4],
  ];
  const inside = ([x, y], polygon) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  /**
   * The dot-matrix map, projected so that `centre` (longitude, latitude) lands at the frame's `at`, at
   * `scale` px a degree of latitude. Dots sit on a fixed `pitch` in the frame, in the before ink.
   */
  const ausMap = ({
    centre,
    at,
    scale,
    pitch = 16,
    dot = 3.4,
    region = [0, 0, FRAME.width, FRAME.height],
  }) => {
    const k = Math.cos((centre[1] * Math.PI) / 180);
    const toLonLat = ([x, y]) => [
      centre[0] + (x - at[0]) / (scale * k),
      centre[1] - (y - at[1]) / scale,
    ];
    const toFrame = ([lon, lat]) => [
      at[0] + (lon - centre[0]) * scale * k,
      at[1] - (lat - centre[1]) * scale,
    ];
    const dots = [];
    const [rx, ry, rw, rh] = region;
    for (let y = ry + pitch / 2; y < ry + rh; y += pitch)
      for (let x = rx + pitch / 2; x < rx + rw; x += pitch) {
        const ll = toLonLat([x, y]);
        if (inside(ll, MAINLAND) || inside(ll, TASMANIA))
          dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dot}"/>`);
      }
    return {
      toFrame,
      svg: `<svg class="fk-layer" width="${FRAME.width}" height="${FRAME.height}" viewBox="0 0 ${FRAME.width} ${FRAME.height}"><g fill="var(--reel-before-ink)" fill-opacity=".62">${dots.join("")}</g></svg>`,
    };
  };
  /** The map's one gold pin at (x, y) (its point), with its ring part-way through its single pulse. */
  const pin = (x, y, { pulse = 0.6 } = {}) => {
    const r = 18 + 70 * pulse;
    return `<svg class="fk-layer" width="${FRAME.width}" height="${FRAME.height}" viewBox="0 0 ${FRAME.width} ${FRAME.height}" style="z-index:5">
      <circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="none" stroke="var(--reel-gold)" stroke-width="${K}" stroke-opacity="${(0.9 - pulse * 0.7).toFixed(2)}"/>
      <ellipse cx="${x}" cy="${y + 2}" rx="12" ry="4.5" fill="rgba(17,24,39,.22)"/>
      <path d="M${x} ${y} C ${x - 6} ${y - 18}, ${x - 24} ${y - 30}, ${x - 24} ${y - 50} A 24 24 0 1 1 ${x + 24} ${y - 50} C ${x + 24} ${y - 30}, ${x + 6} ${y - 18}, ${x} ${y} Z" fill="var(--reel-gold)"/>
      <circle cx="${x}" cy="${y - 50}" r="9" fill="var(--reel-before-surface)"/></svg>`;
  };

  // ------------------------------------------------------------------ G-CLOCK, G-BRIDGE
  const CLOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const clock = (x, y, text) =>
    `<div class="fk-clock" style="left:${px(x)};top:${px(y)}">${CLOCK}${text}</div>`;
  /** A dashed bridge between two points, broken at `gap` (0 to 1 along it) when given. */
  const bridge = ([x1, y1], [x2, y2], { broken = null } = {}) => {
    const stroke = `stroke="var(--reel-before-ink-muted)" stroke-width="3" stroke-dasharray="12 10" stroke-linecap="round" fill="none"`;
    if (broken === null)
      return `<svg class="fk-layer" style="z-index:6" width="${FRAME.width}" height="${FRAME.height}"><path d="M${x1} ${y1} L${x2} ${y2}" ${stroke}/></svg>`;
    const mx = x1 + (x2 - x1) * broken;
    const my = y1 + (y2 - y1) * broken;
    return `<svg class="fk-layer" style="z-index:6" width="${FRAME.width}" height="${FRAME.height}"><path d="M${x1} ${y1} L${mx - 14} ${my + 10}" ${stroke}/><path d="M${mx + 14} ${my - 16} L${x2} ${y2}" ${stroke}/></svg>`;
  };

  return {
    css,
    plainWin,
    GLYPH,
    glyph,
    listing,
    inbox,
    NOTES,
    note,
    frameCss,
    FRAME,
    ZONES,
    K,
    frame,
    STAGES,
    TICK,
    rail,
    camera,
    shotGeometry,
    shot,
    through,
    ARROW,
    pointer,
    focusCorners,
    marker,
    link,
    recordCard,
    person,
    doc,
    ausMap,
    pin,
    clock,
    bridge,
  };
};
