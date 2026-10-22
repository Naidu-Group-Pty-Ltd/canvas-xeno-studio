// Reel 1's desk (BRIEF.md: G-STAGE, G-WINDOW-PLAIN, G-PHONE): today's tools as windows standing in one room in
// depth, under one daylight, for 01.2, 02.1 and 03.1. The camera moves through the same room across the three
// shots, so a window 01.2 sends from is one of the desk 02.1 pulls back to reveal.
//
// How it is drawn: each window is a flat element of its own size, placed on the frame by one matrix3d that
// takes it through the camera (a pinhole: the frame's own perspective, computed here rather than by CSS), so
// anything a scene lays over the room (the pointer, a card in flight) can be put exactly on a window's point
// by the same projection. Shadows lie on the floor as soft ellipses taken through the same camera; the room
// behind is a gradient whose horizon is where the camera's own horizon falls.
const M = require("./motion.cjs");
const { KIT, r3 } = M;

// ------------------------------------------------------------------ the camera
const F_LEN = 1700; // focal length, frame px (a vertical field of about 59 degrees)
const D = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));

/**
 * A camera looking at `target` from `dist` away, turned `yaw` degrees to the right and `pitch` down; the target
 * lands on the frame at `at`. The room's axes: x to the right, y down, z away from the camera at yaw 0.
 */
function camera({ target, yaw = 0, pitch = 0, roll = 0, dist, at = [540, 830], f = F_LEN }) {
  const fwd = [Math.sin(yaw * D) * Math.cos(pitch * D), Math.sin(pitch * D), Math.cos(yaw * D) * Math.cos(pitch * D)];
  let right = [Math.cos(yaw * D), 0, -Math.sin(yaw * D)];
  let down = norm(cross(fwd, right));
  if (roll) {
    const c = Math.cos(roll * D);
    const s = Math.sin(roll * D);
    [right, down] = [add(mul(right, c), mul(down, s)), add(mul(down, c), mul(right, -s))];
  }
  return { pos: sub(target, mul(fwd, dist)), fwd, right, down, f, cx: at[0], cy: at[1], pitch };
}
/** A room point on the frame: [x, y, its depth]. */
function project(c, p) {
  const q = sub(p, c.pos);
  const z = dot(q, c.fwd);
  return [c.cx + (c.f * dot(q, c.right)) / z, c.cy + (c.f * dot(q, c.down)) / z, z];
}
/** A pose's rotation: turned `ry` about the vertical, tipped `rx` about the horizontal, rolled `rz`. */
function rotation({ ry = 0, rx = 0, rz = 0 }) {
  const [cy, sy, cx, sx, cz, sz] = [ry, ry, rx, rx, rz, rz].map((a, i) => (i % 2 ? Math.sin(a * D) : Math.cos(a * D)));
  // R = Ry . Rx . Rz, applied to the element's own axes.
  const Ry = (v) => [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy];
  const Rx = (v) => [v[0], v[1] * cx - v[2] * sx, v[1] * sx + v[2] * cx];
  const Rz = (v) => [v[0] * cz - v[1] * sz, v[0] * sz + v[1] * cz, v[2]];
  const R = (v) => Ry(Rx(Rz(v)));
  return { u: R([1, 0, 0]), v: R([0, 1, 0]), n: R([0, 0, 1]) };
}
/** Where a point of an element (its own px, from its top left) stands in the room, for a pose centred at p. */
function pointOf(pose, w, h, [x, y]) {
  const { u, v } = rotation(pose);
  const s = pose.s ?? 1;
  return add(pose.p, add(mul(u, (x - w / 2) * s), mul(v, (y - h / 2) * s)));
}
/**
 * The element's transform on the frame: its own px through its pose and the camera, as a matrix3d (with
 * transform-origin 0 0). The projection's w is the depth, so the browser divides as a lens does.
 */
function matrixFor(c, pose, w, h) {
  const { u, v, n } = rotation(pose);
  const s = pose.s ?? 1;
  const o = sub(pose.p, add(mul(u, (w / 2) * s), mul(v, (h / 2) * s)));
  // The element's axes and origin in the camera's terms.
  const cam = (a) => [dot(a, c.right), dot(a, c.down), dot(a, c.fwd)];
  const cu = mul(cam(u), s);
  const cv = mul(cam(v), s);
  const cn = cam(n);
  const co = cam(sub(o, c.pos));
  // Projection: (x, y, z) -> (f x + cx z, f y + cy z, 1, z).
  const P = (a, w0) => [c.f * a[0] + c.cx * a[2], c.f * a[1] + c.cy * a[2], w0, a[2]];
  const cols = [P(cu, 0), P(cv, 0), P(cn, 0), P(co, 1)];
  return `matrix3d(${cols.flat().map((x) => Number(x.toPrecision(9))).join(",")})`;
}

// ------------------------------------------------------------------ the room
const FLOOR = 2200; // the desk's surface, below every window
const CSS = `
.dk-room { position:absolute; inset:0; overflow:hidden; }
.dk-bg { position:absolute; inset:0; }
.dk-obj { position:absolute; left:0; top:0; transform-origin:0 0; }
.dk-shadow { position:absolute; left:0; top:0; width:400px; height:140px; transform-origin:0 0;
  background:radial-gradient(closest-side, rgba(17,24,39,.30), rgba(17,24,39,.12) 55%, rgba(17,24,39,0)); }
.dk-veil { position:absolute; inset:0; background:var(--reel-before-paper); pointer-events:none; opacity:0; }
.dk-vig { position:absolute; inset:0; z-index:19; pointer-events:none;
  background:radial-gradient(130% 95% at 48% 42%, rgba(17,24,39,0) 52%, rgba(17,24,39,.16) 82%, rgba(17,24,39,.34) 100%); }
.dk-win { position:relative; overflow:hidden; font-family:var(--reel-before-type); color:var(--reel-before-ink); }
/* The message window (01.2) */
.dk-msg { width:1200px; height:900px; background:var(--reel-before-surface); border:1px solid var(--reel-before-border); border-radius:14px;
  box-shadow:0 30px 70px -20px rgba(17,24,39,.28), 0 8px 18px -8px rgba(17,24,39,.18); display:flex; flex-direction:column; }
.dk-msg .bp-bar { height:58px; }
.dk-msg-head { padding:22px 34px 18px; border-bottom:1px solid var(--reel-before-border); display:flex; flex-direction:column; gap:8px; }
.dk-msg-head .dk-to { font-size:25px; color:var(--reel-before-ink-muted); }
.dk-msg-head .dk-to b { color:var(--reel-before-ink); font-weight:700; }
.dk-msg-head .dk-subj { font-size:31px; font-weight:700; }
.dk-msg-body { position:relative; flex:1; }
/* The outgoing message: the attached card (01.1's own card, at two thirds) and the question beside it. */
.dk-out { position:absolute; left:34px; right:34px; top:0; display:flex; gap:30px; align-items:flex-start; }
.dk-att { position:relative; width:409px; height:376px; flex:none; }
.dk-att > .ls-card { position:absolute; left:0; top:0; transform:scale(.66); transform-origin:0 0; box-shadow:0 8px 22px rgba(17,24,39,.10); }
.dk-eoi { position:absolute; left:16px; top:16px; z-index:2; font-size:21px; font-weight:700; padding:8px 16px; border-radius:999px; white-space:nowrap;
  background:var(--reel-before-surface); color:var(--reel-before-ink); border:1px solid var(--reel-before-border); box-shadow:0 8px 20px rgba(17,24,39,.22); }
.dk-out .dk-text { position:relative; flex:1; font-size:38px; line-height:1.3; padding-top:8px; min-height:2.6em; }
.dk-out .dk-caret { display:inline-block; width:3px; height:1.05em; background:var(--reel-before-ink); vertical-align:-0.16em; margin-left:2px; }
.dk-bubble { position:absolute; inset:-18px -22px; border-radius:20px; background:#EEF2F7; opacity:0; }
.dk-status { position:absolute; right:34px; font-size:24px; font-weight:700; color:var(--reel-before-ink-muted); }
.dk-compose { position:absolute; left:0; right:0; bottom:0; height:100px; border-top:1px solid var(--reel-before-border); display:flex; align-items:center; gap:18px; padding:0 34px; }
.dk-compose .dk-ph { flex:1; font-size:27px; color:#9CA3AF; }
.dk-send { font-size:27px; font-weight:700; padding:15px 38px; border-radius:10px; background:var(--reel-before-ink); color:var(--reel-before-surface); }
/* Today's other tools (02.1, 03.1): each its own look, none a product's. */
.dk-inbox { width:1600px; height:960px; }
.dk-research { width:1000px; height:760px; background:#fff; border-radius:6px; border:1px solid #cfd6df;
  box-shadow:0 30px 70px -24px rgba(17,24,39,.3); display:flex; flex-direction:column; }
.dk-research .dk-nav { height:66px; flex:none; background:#334155; color:#e2e8f0; display:flex; align-items:center; gap:16px; padding:0 22px; font-size:24px; font-weight:700; }
.dk-research .dk-nav i { width:30px; height:30px; border-radius:7px; background:#64748b; }
.dk-research .dk-nav span { margin-left:auto; width:330px; height:38px; border-radius:19px; background:#475569; color:#94a3b8; font-size:19px; font-weight:400;
  display:flex; align-items:center; padding:0 18px; }
.dk-research .dk-body { flex:1; display:flex; min-height:0; }
.dk-research .dk-map { width:560px; position:relative; background:#eef1ea; border-right:1px solid #d5dbe2; }
.dk-research .dk-list { flex:1; padding:22px; display:flex; flex-direction:column; gap:16px; }
.dk-research h5 { font-size:24px; font-weight:700; }
.dk-research .dk-row { display:flex; gap:14px; align-items:center; }
.dk-research .dk-row b { width:70px; height:52px; border-radius:6px; background:#e5e9ee; flex:none; }
.dk-bar { height:14px; border-radius:7px; background:#e8ebef; }
.dk-sheet { width:1120px; height:700px; background:#fff; border:1px solid #c9ced6; border-radius:4px; box-shadow:0 30px 70px -24px rgba(17,24,39,.3);
  display:flex; flex-direction:column; font-size:21px; }
.dk-sheet .dk-title { height:52px; flex:none; display:flex; align-items:center; padding:0 18px; gap:12px; background:#f8f9fb; border-bottom:1px solid #dde1e7;
  font-size:22px; font-weight:600; color:#4b5563; }
.dk-sheet .dk-title i { width:22px; height:22px; border-radius:4px; background:#9ca3af; }
.dk-sheet .dk-tools { height:46px; flex:none; display:flex; align-items:center; gap:10px; padding:0 16px; border-bottom:1px solid #e5e7eb; }
.dk-sheet .dk-tools u { width:30px; height:22px; border-radius:4px; background:#eceef1; text-decoration:none; }
.dk-sheet .dk-fx { height:50px; flex:none; display:flex; align-items:center; gap:18px; padding:0 18px; border-bottom:1px solid #dde1e7; font-family:Inconsolata, monospace; font-size:23px; }
.dk-sheet .dk-fx b { font-family:var(--reel-before-type); font-style:italic; color:#9ca3af; font-weight:600; }
.dk-grid { display:grid; grid-template-columns:56px 300px 200px 200px 1fr; }
.dk-grid span { height:52px; border-right:1px solid #e3e6ea; border-bottom:1px solid #e3e6ea; display:flex; align-items:center; padding:0 14px; white-space:nowrap; }
.dk-grid .dk-hd { background:#f3f4f6; color:#6b7280; justify-content:center; font-size:18px; }
.dk-grid .dk-lab { font-weight:700; }
.dk-grid .dk-sel { outline:4px solid #374151; outline-offset:-4px; font-family:Inconsolata, monospace; position:relative; }
.dk-contact { width:860px; height:600px; background:#fff; border-radius:26px; box-shadow:0 30px 70px -24px rgba(17,24,39,.32), 0 0 0 1px rgba(17,24,39,.06);
  display:flex; flex-direction:column; }
.dk-contact .dk-band { height:150px; flex:none; background:linear-gradient(120deg, #dfe6ee, #eef2f6); }
.dk-contact .dk-who { display:flex; gap:22px; align-items:flex-end; padding:0 34px; margin-top:-62px; }
.dk-contact .dk-av { width:124px; height:124px; border-radius:50%; background:#fff; border:5px solid #fff; box-shadow:0 0 0 2px #d6dde6;
  display:grid; place-items:center; font-size:42px; font-weight:700; color:#475569; }
.dk-contact .dk-nm { font-size:38px; font-weight:700; }
.dk-contact .dk-rl { font-size:22px; color:#6b7280; margin-top:2px; }
.dk-contact .dk-fields { padding:28px 34px; display:grid; grid-template-columns:140px 1fr; gap:22px 18px; align-items:center; font-size:22px; color:#6b7280; }
.dk-contact .dk-tag { display:inline-block; padding:6px 14px; border-radius:999px; background:#f1f4f7; font-size:19px; color:#4b5563; margin-right:8px; }
.dk-report { width:1000px; height:1240px; background:#e9ebee; border-radius:8px; box-shadow:0 30px 70px -24px rgba(17,24,39,.3); display:flex; flex-direction:column; }
.dk-report .dk-chrome { height:56px; flex:none; display:flex; align-items:center; gap:12px; padding:0 20px; background:#f7f8fa; border-bottom:1px solid #d9dde3; border-radius:8px 8px 0 0;
  font-size:22px; font-weight:600; color:#6b7280; }
.dk-report .dk-chrome i { width:14px; height:14px; border-radius:50%; background:#d1d5db; }
.dk-report .dk-tb { height:50px; flex:none; display:flex; gap:12px; align-items:center; padding:0 20px; background:#fbfbfc; border-bottom:1px solid #e3e6ea; }
.dk-report .dk-tb u { width:26px; height:20px; border-radius:4px; background:#e5e7eb; }
.dk-report .dk-page { margin:34px auto 0; width:780px; flex:1; background:#fff; box-shadow:0 2px 10px rgba(17,24,39,.08); padding:70px 70px; display:flex; flex-direction:column; gap:26px; }
.dk-report h2 { font-size:44px; font-weight:700; color:#9ca3af; display:flex; align-items:center; }
.dk-report .dk-caret { display:inline-block; width:3px; height:46px; background:#374151; margin-left:6px; }
.dk-report .dk-ln { height:2px; background:#f1f3f5; }
/* The phone (03.1), face up on the desk. */
.dk-phone { width:420px; height:860px; border-radius:64px; background:#0c0f14; padding:16px; box-shadow:0 0 0 3px #2a2f37; }
.dk-phone .dk-scr { position:relative; width:100%; height:100%; border-radius:50px; overflow:hidden; background:linear-gradient(170deg, #233041, #0f141c 70%); }
.dk-phone .dk-lit { position:absolute; inset:0; background:linear-gradient(170deg, #3b5677, #1a2433 55%, #0d1219); }
.dk-phone .dk-date { position:absolute; left:0; right:0; top:120px; text-align:center; font-size:26px; font-weight:600; color:#e6ebf2; }
.dk-phone .dk-time { position:absolute; left:0; right:0; top:156px; text-align:center; font-size:112px; font-weight:300; color:#f4f7fb; letter-spacing:-.02em; }
.dk-phone .dk-nt { position:absolute; left:20px; right:20px; top:380px; padding:20px 22px; border-radius:26px; background:rgba(235,240,247,.92); color:#111827;
  display:flex; flex-direction:column; gap:6px; }
.dk-phone .dk-nt .dk-hd { display:flex; align-items:center; gap:10px; font-size:19px; color:#4b5563; }
.dk-phone .dk-nt .dk-hd i { width:30px; height:30px; border-radius:8px; background:#94a3b8; }
.dk-phone .dk-nt .dk-hd small { margin-left:auto; font-size:18px; }
.dk-phone .dk-nt b { font-size:25px; }
.dk-phone .dk-nt p { font-size:24px; line-height:1.3; }
`;

const bars = (ws) => ws.map((w) => `<div class="dk-bar" style="width:${w}%"></div>`).join("");

/** The message window: from Jordan Ellis to Alex Morgan, the property attached, the question and Send. */
const msgHtml = () => `<div class="dk-win dk-msg">
  <div class="bp-bar"><i></i><i></i><i></i><span>Message</span></div>
  <div class="dk-msg-head"><div class="dk-to">From: <b>Jordan Ellis</b> · To: <b>Alex Morgan</b></div><div class="dk-subj">14 Wattle Grove, Banksia Rise</div></div>
  <div class="dk-msg-body" id="dk-msg-body">
    <div class="dk-out" id="dk-out"><div class="dk-bubble" id="dk-bubble"></div>
      <div class="dk-att" id="dk-att">${KIT.listing({ width: 620, chips: ["New listing · just now"] })}<span class="dk-eoi" id="dk-eoi">Expressions of interest close Friday</span></div>
      <div class="dk-text"><span id="dk-text"></span><i class="dk-caret" id="dk-caret"></i></div>
    </div>
    <div class="dk-status" id="dk-status">✓ Sent</div>
    <div class="dk-compose"><div class="dk-ph">Write a message…</div><div class="dk-send" id="dk-send">Send</div></div>
  </div>
</div>`;

/** The generic inbox: the question as its top row, its reading pane, and Reply (02.1). No listing card. */
const inboxHtml = () => {
  const folders = [["Inbox", "1"], ["Starred"], ["Sent"], ["Drafts"], ["Archive"]]
    .map(([name, n], i) => `<div${i ? "" : ' class="on"'}>${name}${n ? `<b>${n}</b>` : ""}</div>`)
    .join("");
  const other = (a, b) => `<div class="bp-row"><div class="bars"><div style="width:${a}%"></div><div style="width:${b}%"></div></div></div>`;
  return `<div class="dk-win dk-inbox"><div class="bp" style="left:0;top:0;width:1600px;height:960px">
    <div class="bp-bar"><i></i><i></i><i></i><span>Mail</span></div><div class="bp-in">
    <div class="bp-folders">${folders}</div>
    <div class="bp-list"><h4>Inbox<span class="bp-muted" style="font-size:19px;font-weight:400">Today</span></h4>
      <div class="bp-row on" id="dk-row"><div class="who"><em></em>Jordan Ellis<small>9:14</small></div><div class="subj">14 Wattle Grove, Banksia Rise</div><div class="prev">Can we review whether this suits my plans?</div></div>
      ${other(46, 80)}${other(38, 72)}${other(52, 64)}${other(30, 76)}${other(44, 58)}</div>
    <div class="bp-read" id="dk-read"><h3>14 Wattle Grove, Banksia Rise</h3>
      <div class="bp-meta"><span>From: <b>Jordan Ellis</b> · To: <b>Alex Morgan</b></span><span style="margin-left:auto">Monday 9:14</span></div>
      <div class="bp-msg">Can we review whether this suits my plans?</div>
      <div class="bp-muted" style="font-size:22px">14 Wattle Grove, Banksia Rise NSW 2155 · listing link</div>
      <div class="bp-btns"><span class="bp-btn bp-reply" id="dk-reply">${KIT.glyph("reply")}Reply</span><span class="bp-btn">${KIT.glyph("forward")}Forward</span></div></div>
  </div></div></div>`;
};

/** A research platform: a map and comparable sales, all still placeholders. */
const researchHtml = () => `<div class="dk-win dk-research">
  <div class="dk-nav"><i></i>Research<span>Search an address…</span></div>
  <div class="dk-body"><div class="dk-map"><svg width="560" height="694" viewBox="0 0 560 694">
      <g fill="#e1e6dc">${[[30, 40, 150, 110], [210, 40, 130, 150], [380, 60, 150, 120], [40, 200, 140, 170], [220, 240, 170, 120], [420, 230, 120, 180], [30, 420, 170, 130], [240, 410, 150, 170], [420, 460, 110, 140], [60, 600, 200, 80], [300, 620, 220, 60]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`).join("")}</g>
      <g stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"><path d="M0 180 L560 210"/><path d="M0 390 L560 405"/><path d="M195 0 L215 694"/><path d="M400 0 L385 694"/></g>
      <path d="M232 250 h140 v100 h-140 z" fill="none" stroke="#9aa5b1" stroke-width="4" stroke-dasharray="10 8"/>
      ${[[120, 120], [470, 150], [300, 480], [110, 500], [480, 540]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#94a3b8" stroke="#fff" stroke-width="4"/>`).join("")}
    </svg></div>
    <div class="dk-list"><h5>Comparable sales</h5>${[72, 64, 80, 58, 68].map((w) => `<div class="dk-row"><b></b><div style="flex:1;display:flex;flex-direction:column;gap:10px">${bars([w, w - 28])}</div></div>`).join("")}</div></div>
</div>`;

/** A spreadsheet: a few labelled columns and one formula cell selected. */
const sheetHtml = () => {
  const cols = ["", "A", "B", "C", "D"];
  const rows = [
    ["Item", "Amount", "Notes", ""],
    ["Purchase price", "", "", ""],
    ["Deposit", "", "", ""],
    ["Loan", "=B2-B3", "", ""],
    ["Rent / week", "", "", ""],
    ["Yield", "", "", ""],
    ["", "", "", ""],
  ];
  const head = cols.map((c) => `<span class="dk-hd">${c}</span>`).join("");
  const body = rows
    .map(
      (cells, i) =>
        `<span class="dk-hd">${i + 1}</span>${cells
          .map((c, j) => `<span class="${i === 0 ? "dk-lab" : ""}${i === 3 && j === 1 ? " dk-sel" : ""}">${c}${i === 3 && j === 1 ? '<i class="dk-caret" id="dk-cell-caret" style="display:inline-block;width:3px;height:26px;background:#374151;margin-left:3px"></i>' : ""}</span>`)
          .join("")}`,
    )
    .join("");
  return `<div class="dk-win dk-sheet"><div class="dk-title"><i></i>Financial worksheet</div>
    <div class="dk-tools">${"<u></u>".repeat(12)}</div><div class="dk-fx"><b>fx</b>=B2-B3</div>
    <div class="dk-grid">${head}${body}</div></div>`;
};

/** A contact card for Jordan Ellis, in a third tool's style. */
const contactHtml = () => `<div class="dk-win dk-contact"><div class="dk-band"></div>
  <div class="dk-who"><div class="dk-av">JE</div><div style="padding-bottom:10px"><div class="dk-nm">Jordan Ellis</div><div class="dk-rl">Client details</div></div></div>
  <div class="dk-fields"><span>Phone</span>${bars([46])}<span>Email</span>${bars([70])}<span>Notes</span>${bars([84])}<span>Tags</span><div><span class="dk-tag">Buyer</span><span class="dk-tag">New</span></div></div>
</div>`;

/** An empty report, its caret blinking. */
const reportHtml = () => `<div class="dk-win dk-report"><div class="dk-chrome"><i></i><i></i><i></i><span style="margin-left:8px">Untitled report</span></div>
  <div class="dk-tb">${"<u></u>".repeat(14)}</div>
  <div class="dk-page"><h2>Untitled report<i class="dk-caret" id="dk-report-caret"></i></h2>${'<div class="dk-ln"></div>'.repeat(9)}</div></div>`;

/** The phone, face up: its lock screen and the client's follow-up. */
const phoneHtml = () => `<div class="dk-win dk-phone"><div class="dk-scr"><div class="dk-lit" id="dk-lit"></div>
  <div class="dk-date">Wednesday 4:52 PM</div><div class="dk-time">4:52</div>
  <div class="dk-nt" id="dk-nt"><div class="dk-hd"><i></i>Messages<small>now</small></div><b>Jordan Ellis</b><p>Any update on 14 Wattle Grove? EOIs close Friday.</p></div>
</div></div>`;

/**
 * The room's objects: each its size, where it stands (centre, turn) and its page. The four tools hang
 * together in the middle of the room, overlapping from 02.1's last framing; the message window stands to their
 * left and the inbox to their right, so the pull back finds them on its way; the phone lies on the desk.
 */
const OBJECTS = {
  msg: { w: 1200, h: 900, html: msgHtml, pose: { p: [-1500, 300, 400], ry: 0 } },
  inbox: { w: 1600, h: 960, html: inboxHtml, pose: { p: [1350, -300, 300], ry: -6 } },
  research: { w: 1000, h: 760, html: researchHtml, pose: { p: [-520, -950, 1450], ry: 14 } },
  sheet: { w: 1120, h: 700, html: sheetHtml, pose: { p: [540, -380, 1750], ry: -15 } },
  contact: { w: 860, h: 600, html: contactHtml, pose: { p: [-520, 380, 1250], ry: 9 } },
  report: { w: 1000, h: 1240, html: reportHtml, pose: { p: [430, 1180, 2300], ry: -5 } },
  phone: { w: 420, h: 860, html: phoneHtml, pose: { p: [150, FLOOR - 6, 1300], rx: -90, ry: -12 } },
};
/** The four tools 02.1 ends on and 03.1 holds. */
const TOOLS = ["research", "sheet", "contact", "report"];

// ------------------------------------------------------------------ the camera's one path, 01.2 to 03.1
const B = (id, i) => M.beat(id, i);
/** Looking at an object: its centre (plus an offset in its own px), from `dist`, turned and tipped. */
const look = (id, { dx = 0, dy = 0, yaw = 0, pitch = 3, dist, roll = 0, y = 830 } = {}) => {
  const o = OBJECTS[id];
  return { target: pointOf(o.pose, o.w, o.h, [o.w / 2 + dx, o.h / 2 + dy]), yaw, pitch, dist, roll, at: [540, y] };
};
/** The four tools together, misaligned and overlapping (02.1's end, 03.1's hold). */
const WIDE = { target: [0, -50, 1500], yaw: 0, pitch: 4, dist: 3300, at: [540, 800] };
const KEYS = () => [
  // 01.2: three-quarter to front-on, easing in to the message and Send; holding on Sent, the whole message read.
  { t: B("01.2", 0), cam: look("msg", { dx: 40, dy: 30, yaw: -20, pitch: 4, dist: 2050 }) },
  // (The window is 1200 px: from under about 1950 it is wider than the frame, so the camera stays further out.)
  { t: B("01.2", 2) - 0.1, cam: look("msg", { dx: 30, dy: 90, yaw: -5, pitch: 2, dist: 2000 }) },
  { t: B("01.2", 3) + 0.3, cam: look("msg", { dx: 0, dy: 10, yaw: -3, pitch: 2, dist: 2020 }) },
  { t: B("02.1", 0), cam: look("msg", { dx: 0, dy: 10, yaw: -2.5, pitch: 2, dist: 2060 }), ease: M.EASE.linear },
  // 02.1: the pull back (one window of a desk of them), then across to the inbox and its Reply.
  { t: B("02.1", 0) + 0.85, cam: { target: [-700, 0, 600], yaw: 5, pitch: 3, dist: 3800, at: [540, 830] } },
  { t: B("02.1", 0) + 1.7, cam: look("inbox", { dx: -120, dy: 40, yaw: 7, pitch: 3, dist: 2500 }) },
  { t: B("02.1", 1), cam: look("inbox", { dx: -60, dy: 60, yaw: 6, pitch: 3, dist: 2380 }), ease: M.EASE.linear },
  // The research tool, nearer and to the left: it comes forward and fills the frame.
  { t: B("02.1", 1) + 0.75, cam: look("research", { yaw: 13, pitch: 3, dist: 1900 }) },
  { t: B("02.1", 2), cam: look("research", { dx: 40, yaw: 11, pitch: 3, dist: 1560 }), ease: M.EASE.linear },
  // A whip to the right: the spreadsheet.
  { t: B("02.1", 2) + 0.42, cam: look("sheet", { dx: -60, dy: 40, yaw: -13, pitch: 3, dist: 1750, roll: -1.5 }) },
  { t: B("02.1", 3), cam: look("sheet", { dx: -100, dy: 60, yaw: -11, pitch: 3, dist: 1600 }), ease: M.EASE.linear },
  // Another whip, down and left: the contact card.
  { t: B("02.1", 3) + 0.42, cam: look("contact", { yaw: 8, pitch: 7, dist: 1500, roll: 1.2 }) },
  { t: B("02.1", 4), cam: look("contact", { dx: 20, yaw: 7, pitch: 6, dist: 1400 }), ease: M.EASE.linear },
  // The fourth, behind them all: past the others to the empty report, its title and caret; then the pull back
  // until all four hang in the frame together.
  { t: B("02.1", 4) + 0.5, cam: look("report", { dy: -330, yaw: -4, pitch: 3, dist: 1750 }) },
  { t: B("02.1", 5) - 0.12, cam: WIDE },
  { t: B("03.1", 3), cam: { ...WIDE, dist: 3650, yaw: -1 }, ease: M.EASE.linear },
  // 03.1: locked off while everything moves; then one slow push down to the phone on the desk.
  { t: B("03.1", 3) + 1.7, cam: look("phone", { dy: 40, yaw: -8, pitch: 58, dist: 1500 }) },
  { t: M.shotOf("03.1").out, cam: look("phone", { dy: 40, yaw: -8, pitch: 60, dist: 1420 }), ease: M.EASE.linear },
];
let cameraPath = null;
/** The camera at film time t, from 01.2's first frame to 03.1's last (its distance kept, for the focus). */
const cameraAt = (t) => {
  const k = (cameraPath ??= path(KEYS()))(t);
  return { ...camera(k), dist: k.dist };
};
/**
 * Which objects are in the room at t: the message window leaves once 02.1 has panned off it, the inbox once
 * the camera has swung away to the research tool, and the phone is there only when the room falls dark.
 */
const fadesAt = (t) => ({
  msg: 1 - M.span(t, B("02.1", 0) + 1.0, B("02.1", 0) + 1.4, M.EASE.linear),
  inbox: 1 - M.span(t, B("02.1", 1) + 0.45, B("02.1", 1) + 0.8, M.EASE.linear),
  phone: M.span(t, B("03.1", 3) - 0.2, B("03.1", 3) + 0.4, M.EASE.linear),
});

/** The room's page: its ground, a shadow and an element for each object named, in that order. */
function roomHtml(ids) {
  return `<div class="dk-room" id="dk-room"><div class="dk-bg" id="dk-bg"></div>${ids
    .filter((id) => id !== "phone")
    .map((id) => `<div class="dk-shadow" id="dk-sh-${id}" style="visibility:hidden"></div>`)
    .join("")}${ids
    .map((id) => {
      const o = OBJECTS[id];
      return `<div class="dk-obj" id="dk-${id}" style="width:${o.w}px;height:${o.h}px;visibility:hidden">${o.html()}<div class="dk-veil" id="dk-veil-${id}"></div></div>`;
    })
    .join("")}<div class="dk-vig" id="dk-vig"></div></div>`;
}

/**
 * Sets the room for a camera: the ground's horizon and light, each object through the camera (nearest drawn
 * last), its shadow on the desk, its haze with distance and its depth of field. `poses` overrides an object's
 * pose; `fades` its opacity; `focus` is the depth held sharp (and `dof` how fast the rest softens).
 */
function placeRoom(st, c, ids, { poses = {}, fades = {}, focus = c.dist ?? null, dof = 9, light = 1, haze = 1 } = {}) {
  // The room behind: a wall above the camera's horizon, the desk below it, in a warm daylight from the upper
  // left; `light` turns the room down to dark (03.1's end).
  const horizon = c.cy - c.f * Math.tan(c.pitch * D);
  const hz = (horizon / 1920) * 100;
  const L = (rgb, k) => `rgb(${rgb.map((v) => Math.round(v * k * light + 5 * (1 - light))).join(",")})`;
  const paper = [243, 244, 246];
  st.set("#dk-bg", {
    background: `radial-gradient(110% 62% at 18% ${r3(hz - 18)}%, rgba(255,250,240,${r3(0.75 * light)}), rgba(255,250,240,0) 62%), linear-gradient(180deg, ${L(paper, 0.965)} 0%, ${L(paper, 1.0)} ${r3(hz - 2)}%, ${L([238, 239, 242], 1.0)} ${r3(hz)}%, ${L([214, 218, 225], 1.0)} 100%)`,
  });
  st.set("#dk-vig", { opacity: r3(0.55 + 0.45 * (1 - light)) });
  const placed = [];
  for (const id of ids) {
    const o = OBJECTS[id];
    const pose = { ...o.pose, ...(poses[id] || {}) };
    const centre = project(c, pose.p);
    const op = fades[id] ?? 1;
    if (centre[2] < 60 || op <= 0.001) {
      st.set(`#dk-${id}`, { transform: "none", visibility: "hidden", opacity: "0", "z-index": "0", filter: "none" });
      if (id !== "phone") st.set(`#dk-sh-${id}`, { visibility: "hidden" });
      continue;
    }
    placed.push({ id, o, pose, z: centre[2], op });
  }
  placed.sort((a, b) => b.z - a.z);
  placed.forEach(({ id, o, pose, z, op }, i) => {
    // Depth of field: how far from the held depth, in the frame's px of blur (quantised, so a slow move doesn't
    // re-blur every drawing), carried back to the element's own px.
    const scale = (c.f / z) * (pose.s ?? 1);
    let blur = focus ? Math.min(14, (dof * Math.abs(z - focus)) / z) : 0;
    blur = Math.round(blur * 2) / 2;
    st.set(`#dk-${id}`, {
      transform: matrixFor(c, pose, o.w, o.h),
      "z-index": String(10 + i),
      filter: blur >= 0.5 ? `blur(${r3(blur / scale)}px)` : "none",
      ...M.fade(op),
    });
    // Distance hazes a window toward the room's paper.
    st.set(`#dk-veil-${id}`, { opacity: r3(Math.min(0.45, Math.max(0, (z - 2600) / 9000)) * haze) });
    if (id === "phone") return;
    // Its shadow on the desk, under it and a little toward the camera (the daylight is high and behind it).
    const sw = o.w * 1.15 * (pose.s ?? 1);
    const height = FLOOR - pose.p[1];
    const sp = { p: [pose.p[0] + height * 0.08, FLOOR, pose.p[2] - height * 0.12], rx: -90, ry: pose.ry || 0, s: sw / 400 };
    const sc = project(c, sp.p);
    const soft = Math.min(1, Math.max(0.25, 1 - height / 5200));
    if (sc[2] > 60) st.set(`#dk-sh-${id}`, { transform: matrixFor(c, sp, 400, 140), ...M.fade(op * soft * light) });
    else st.set(`#dk-sh-${id}`, { transform: "none", ...M.fade(0) });
  });
  return placed;
}

/**
 * The matrix3d (transform-origin 0 0) that lays an element of w x h onto four frame points: its top left, top
 * right, bottom right and bottom left (the unit square to a quad, after Heckbert). A card in flight between the
 * flat frame and a window's slanted plane is moved by moving its corners.
 */
function quadMatrix(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let [a, b, c, d, e, f, g, k] = [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0];
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const [dx1, dx2, dy1, dy2] = [x1 - x2, x3 - x2, y1 - y2, y3 - y2];
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    k = (dx1 * sy - sx * dy1) / den;
    [a, b, d, e] = [x1 - x0 + g * x1, x3 - x0 + k * x3, y1 - y0 + g * y1, y3 - y0 + k * y3];
  }
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => Number(v.toPrecision(9))).join(",")})`;
}

/** Where an object's own point (its px from its top left) lands on the frame, for a camera (and its pose). */
function on(c, id, xy, pose = {}) {
  const o = OBJECTS[id];
  return project(c, pointOf({ ...o.pose, ...pose }, o.w, o.h, xy));
}

/** Between two cameras' settings at p (target and distance by ratio, angles directly). */
function between(a, b, p) {
  const L = (x, y) => x + (y - x) * p;
  return {
    target: a.target.map((v, i) => L(v, b.target[i])),
    yaw: L(a.yaw ?? 0, b.yaw ?? 0),
    pitch: L(a.pitch ?? 0, b.pitch ?? 0),
    roll: L(a.roll ?? 0, b.roll ?? 0),
    dist: a.dist * (b.dist / a.dist) ** p,
    at: [L(a.at?.[0] ?? 540, b.at?.[0] ?? 540), L(a.at?.[1] ?? 830, b.at?.[1] ?? 830)],
  };
}
/**
 * A camera path: keys of { t, cam } and, between each and the next, a move on ease-move (or the key's own
 * `ease`). Before the first key it holds the first; after the last, the last.
 */
function path(keys) {
  return (t) => {
    if (t <= keys[0].t) return keys[0].cam;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (t < b.t) return between(a.cam, b.cam, M.span(t, a.t, b.t, b.ease || M.EASE.move));
    }
    return keys.at(-1).cam;
  };
}

/** A clock that ticks `q` times a second: of a frame's eight subframes only q/60 differ (the rest reuse). */
const tick = (t, q = 120) => Math.floor(t * q + 1e-6) / q;

module.exports = {
  CSS,
  OBJECTS,
  TOOLS,
  FLOOR,
  camera,
  cameraAt,
  fadesAt,
  WIDE,
  look,
  project,
  matrixFor,
  quadMatrix,
  pointOf,
  roomHtml,
  placeRoom,
  on,
  between,
  path,
  tick,
  F_LEN,
};
