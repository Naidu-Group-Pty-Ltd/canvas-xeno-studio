// Reel 3, shots 02.1 to 02.3: traditionally, answering that means chasing documents, juggling spreadsheets, and
// waiting on internal teams and external partners (G-OLDWAY). Today's tools only, in Reel 1's "before" kit (white
// windows, a grey system bar, the system's own type; nothing of Aurixa's), and no document is ever pictured.
// 02.1: a plain mail client's Sent folder; the requests go out to Jordan Ellis one after another (payslips, bank
// statements, the car loan's and the credit card's statements, ID); on "chasing" none has an answer and each is
// chased, Following up…, again and again, the count climbing. 02.2: on "juggling" three grey spreadsheet windows
// cascade in towards the camera (Income, Expenses, Capacity) as the mail steps back; on "spreadsheets" a cell in
// the last reads #REF!. 02.3: on "waiting" messages come in from the internal team and the broker, Any update?, with
// typing dots that never resolve; on "partners" a clock sweeps an hour and a progress bar stalls; the frame cools
// and holds, still, as the music falls silent before the drop.
//
// The board is its own part (board(), below): 03.1 opens on it exactly as this scene leaves it, and sweeps it away.
const M = require("../motion.cjs");

const { beat, shotOf, span, lerp, r3, px, State, fade, captionHtml, caption, EASE, KIT } = M;

/** The requests, each sent to the client and then chased. */
const REQUESTS = [
  ["Payslips (last 3)", "9:02"],
  ["Bank statements (last 3 months)", "9:03"],
  ["Car loan statement", "9:03"],
  ["Credit card statement", "9:04"],
  ["ID", "9:04"],
];
const MAIL = { x: 80, y: 446, w: 920, h: 650 };
const ROW_H = 104;
/** The spreadsheets: their windows, where each lands, and its tilt; the cell that breaks. */
const SHEET = [620, 430];
const SHEETS = [
  {
    name: "Income",
    at: [70, 470],
    tilt: -2.4,
    head: ["", "Monthly", "Annual"],
    rows: [
      ["Base salary", "25,000", "300,000"],
      ["Bonus", "—", "—"],
      ["Other income", "—", "—"],
      ["Total", "25,000", "300,000"],
    ],
    formula: "=SUM(C2:C4)",
  },
  {
    name: "Expenses",
    at: [214, 590],
    tilt: 1.6,
    head: ["", "Monthly", ""],
    rows: [
      ["Rent", "2,817", ""],
      ["Car loan", "520", ""],
      ["Credit card", "300", ""],
      ["Living expenses", "3,400", ""],
      ["Total", "7,037", ""],
    ],
    formula: "=SUM(B2:B5)",
  },
  {
    name: "Capacity",
    at: [356, 710],
    tilt: -1.1,
    head: ["", "Value", ""],
    rows: [
      ["Net income", "=Income!C5", ""],
      ["Commitments", "=Expenses!B6", ""],
      ["Assessment rate", "9.50%", ""],
      ["Term (years)", "30", ""],
      ["Capacity", "", ""],
    ],
    formula: "=PV(B4/12,B5*12,-(B2-B3)/12)",
    broken: [5, 1],
  },
];
/** The messages, and the status card: a clock and a stalled bar. */
const CHAT = { x: 384, y: 372, w: 640, h: 360 };
const STATUS = { x: 100, y: 1124, w: 880, h: 140 };
/** The pull back of 02.3, about the board's middle. */
const BACK = { origin: [540, 800], k: 0.93 };

const css = `
.ow-ground { position:absolute; inset:0; background:radial-gradient(90% 60% at 50% 42%, #FFFFFF 0%, #F3F4F6 62%, #E9EBEF 100%); }
.ow-cool { position:absolute; inset:0; background:linear-gradient(180deg, rgba(71,85,105,.24), rgba(30,41,59,.34)); mix-blend-mode:multiply; }
.ow-board { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${BACK.origin[0]}px ${BACK.origin[1]}px; }
.ow-win { position:absolute; left:0; top:0; transform-origin:50% 50%; }
.ow-win .bp { left:0 !important; top:0 !important; }
.ow-veil { position:absolute; inset:0; border-radius:10px; background:#E5E7EB; pointer-events:none; }
.ow-mail .bp-list { width:100%; border-right:none; }
.ow-mail .bp-list h4 { margin:0; }
.ow-count { display:inline-grid; place-items:center; min-width:44px; height:34px; padding:0 10px; border-radius:999px; background:#374151; color:#fff;
  font-size:20px; font-weight:700; }
.ow-rows { position:relative; flex:1; min-height:0; overflow:hidden; }
.ow-row { position:absolute; left:0; right:0; top:0; height:${ROW_H}px; box-sizing:border-box; padding:17px 24px; border-bottom:1px solid #E5E7EB;
  background:#fff; display:flex; flex-direction:column; gap:7px; }
.ow-row .subj { font-size:27px; font-weight:700; color:#111827; line-height:1.15; }
.ow-row .to { display:flex; align-items:center; gap:10px; font-size:21px; font-weight:600; color:#6B7280; }
.ow-row .to svg { width:21px; height:21px; }
.ow-pill { position:absolute; right:24px; top:50%; margin-top:-21px; display:inline-flex; align-items:center; gap:10px; height:42px; box-sizing:border-box;
  padding:0 16px; border-radius:999px; font-size:22px; font-weight:700; white-space:nowrap; }
.ow-pill.sent { background:#F3F4F6; color:#6B7280; border:1px solid #E5E7EB; }
.ow-pill.none { background:#FEF2F2; color:#B91C1C; border:1px solid #FECACA; }
.ow-pill.chase { background:#FFFBEB; color:#92400E; border:1px solid #FDE68A; }
.ow-pill b { display:inline-grid; place-items:center; min-width:30px; height:30px; border-radius:999px; background:#92400E; color:#fff; font-size:18px; }
.ow-sheet .bp-in { flex-direction:column; }
.ow-sheet .bp-bar { font-size:23px; color:#4B5563; }
.ow-fx { height:46px; flex:none; display:flex; align-items:center; gap:12px; padding:0 16px; border-bottom:1px solid #E5E7EB; font:400 20px/1 "Inconsolata", ui-monospace, monospace;
  color:#374151; }
.ow-fx i { font-style:italic; font-family:Georgia, serif; color:#9CA3AF; }
.ow-fx span { padding-left:12px; border-left:1px solid #E5E7EB; white-space:nowrap; overflow:hidden; }
.ow-grid { border-collapse:collapse; width:100%; table-layout:fixed; font-size:21px; color:#111827; }
.ow-grid th { height:34px; background:#F3F4F6; color:#6B7280; font-weight:600; font-size:18px; border:1px solid #E5E7EB; }
.ow-grid th:first-child { width:46px; }
.ow-grid td { height:44px; padding:0 12px; border:1px solid #E5E7EB; white-space:nowrap; overflow:hidden; text-overflow:clip; }
.ow-grid td:first-child { background:#F3F4F6; color:#6B7280; font-size:18px; text-align:center; padding:0; }
.ow-grid td.n { text-align:right; font-variant-numeric:tabular-nums; }
.ow-grid td.f { color:#6B7280; font:400 19px/1 "Inconsolata", ui-monospace, monospace; }
.ow-grid tr.tot td { font-weight:700; }
.ow-bad { position:relative; color:#B91C1C !important; font-weight:700; font-size:24px; outline:3px solid #374151; outline-offset:-3px; background:#FEF2F2; }
.ow-tri { position:absolute; left:0; top:0; width:0; height:0; border-style:solid; border-width:13px 13px 0 0; border-color:#16A34A transparent transparent transparent; }
.ow-tabs { margin-top:auto; height:40px; flex:none; display:flex; align-items:stretch; gap:2px; padding:0 12px; border-top:1px solid #E5E7EB; background:#F3F4F6; }
.ow-tabs span { display:flex; align-items:center; padding:0 16px; font-size:20px; color:#6B7280; }
.ow-tabs span.on { background:#fff; color:#111827; font-weight:700; border-bottom:3px solid #374151; }
.ow-chat .bp-in { flex-direction:column; padding:20px 24px; gap:12px; background:#F9FAFB; }
.ow-msg { display:flex; flex-direction:column; gap:7px; }
.ow-from { font-size:25px; font-weight:700; color:#4B5563; padding-left:6px; display:flex; align-items:center; gap:10px; }
.ow-from small { font-weight:400; font-size:19px; color:#9CA3AF; }
.ow-line { display:flex; align-items:center; gap:14px; }
.ow-bubble { padding:14px 22px; border-radius:20px 20px 20px 6px; background:#fff; border:1px solid #D1D5DB; font-size:29px; line-height:1.2; color:#111827; }
.ow-typing { display:flex; gap:7px; padding:13px 16px; border-radius:18px; background:#E5E7EB; }
.ow-typing i { width:11px; height:11px; border-radius:50%; background:#6B7280; }
.ow-status { position:absolute; left:0; top:0; width:${STATUS.w}px; height:${STATUS.h}px; box-sizing:border-box; padding:22px 28px; border-radius:16px;
  background:#fff; border:1px solid #D1D5DB; box-shadow:0 14px 34px rgba(17,24,39,.16); display:flex; align-items:center; gap:26px;
  font-family:Selawik, "Segoe UI", sans-serif; }
.ow-clock { width:104px; height:104px; flex:none; }
.ow-st-w { flex:1; min-width:0; }
.ow-st-l { display:flex; font-size:27px; font-weight:700; color:#111827; }
.ow-st-l span { margin-left:auto; font-weight:600; color:#6B7280; }
.ow-st-track { height:18px; border-radius:9px; background:#E5E7EB; margin-top:13px; overflow:hidden; }
.ow-st-fill { height:100%; width:0; border-radius:9px; background:#6B7280; }
.ow-st-note { margin-top:10px; font-size:21px; color:#6B7280; }
`;

const ICON = {
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/** A plain clock: its face, twelve ticks, an hour hand and a minute hand (rotated by the state). */
const clockSvg = () => {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const r0 = i % 3 ? 40 : 36;
    return `<line x1="${r3(52 + r0 * Math.sin(a))}" y1="${r3(52 - r0 * Math.cos(a))}" x2="${r3(52 + 45 * Math.sin(a))}" y2="${r3(52 - 45 * Math.cos(a))}" stroke="#9CA3AF" stroke-width="${i % 3 ? 2 : 3}" stroke-linecap="round"/>`;
  }).join("");
  return `<svg class="ow-clock" viewBox="0 0 104 104"><circle cx="52" cy="52" r="50" fill="#fff" stroke="#D1D5DB" stroke-width="3"/>${ticks}
    <line id="ow-hour" x1="52" y1="52" x2="52" y2="28" stroke="#374151" stroke-width="5" stroke-linecap="round" style="transform-origin:52px 52px"/>
    <line id="ow-min" x1="52" y1="52" x2="52" y2="14" stroke="#6B7280" stroke-width="3.5" stroke-linecap="round" style="transform-origin:52px 52px"/>
    <circle cx="52" cy="52" r="5" fill="#374151"/></svg>`;
};

/** A spreadsheet's window: its formula bar, its grid (columns A to C), and its tab. */
const sheetHtml = (s, i) => {
  const cell = (v, c, r) => {
    const bad = s.broken && s.broken[0] === r && s.broken[1] === c;
    const formula = typeof v === "string" && v.startsWith("=");
    const num = c > 0 && /^[\d,.%—]+$/.test(v);
    return `<td class="${bad ? "ow-bad" : formula ? "f" : num ? "n" : ""}"${bad ? ` id="ow-bad-${i}"` : ""}>${bad ? `<i class="ow-tri" id="ow-tri-${i}" style="visibility:hidden"></i><span id="ow-badv-${i}"></span>` : v}</td>`;
  };
  const rows = s.rows
    .map(
      (row, r) =>
        `<tr class="${row[0] === "Total" ? "tot" : ""}"><td>${r + 2}</td>${row.map((v, c) => cell(v, c, r + 1)).join("")}</tr>`,
    )
    .join("");
  const inner = `<div class="ow-fx"><i>fx</i><span>${s.formula}</span></div>
    <table class="ow-grid"><tr><th></th><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td>${s.head.map((h, c) => `<td style="font-weight:700;color:#374151">${h}</td>`).join("")}</tr>${rows}</table>
    <div class="ow-tabs"><span class="on">${s.name}</span><span>Sheet2</span></div>`;
  return KIT.plainWin(0, 0, SHEET[0], SHEET[1], `${s.name}.xlsx`, inner);
};

/** The beats this part moves on, from the brief and the voice. */
function times() {
  const [t21, tChase] = [0, 1].map((i) => beat("02.1", i));
  const [tJuggle, tRef] = [0, 1].map((i) => beat("02.2", i));
  const [tWait, tPartners] = [0, 1].map((i) => beat("02.3", i));
  const s23 = shotOf("02.3");
  const sentAt = REQUESTS.map((_, i) => t21 + 0.22 + i * 0.33);
  const noneAt = REQUESTS.map((_, i) => tChase - 0.12 + i * 0.07);
  const chaseAt = REQUESTS.map((_, i) => tChase + 0.2 + i * 0.1);
  const againAt = REQUESTS.map((_, i) => tChase + 0.55 + i * 0.08);
  const thirdAt = REQUESTS.map((_, i) => tChase + 0.86 + i * 0.06);
  const sheetAt = SHEETS.map((_, i) => tJuggle + i * 0.17);
  // Internal team's arrives with the window, on "waiting"; the broker's on "external" (beat + 1.67).
  const msgAt = [tWait + 0.22, tWait + 1.62];
  // Everything stops where it is once the clock has swept: the frame holds still, cool, into the silence.
  const still = tPartners + 0.62;
  return {
    t21,
    tChase,
    tJuggle,
    tRef,
    tWait,
    tPartners,
    s23,
    sentAt,
    noneAt,
    chaseAt,
    againAt,
    thirdAt,
    sheetAt,
    msgAt,
    still,
  };
}

/**
 * The board: the mail, the three spreadsheets, the messages and the status card (no ground, no captions), as this
 * scene draws them and as 03.1 opens on them. state(st, t) sets every one of its layers at t; after `still` nothing
 * moves.
 */
function board() {
  const T = times();
  const mail = KIT.plainWin(
    0,
    0,
    MAIL.w,
    MAIL.h,
    "Mail",
    `<div class="bp-list"><h4>Sent<span class="ow-count" id="ow-count">0</span><span class="bp-muted" style="font-size:19px;font-weight:400;margin-left:auto">Today</span></h4>
      <div class="ow-rows">${REQUESTS.map(
        ([subj, prev], i) =>
          `<div class="ow-row" id="ow-r${i}" style="visibility:hidden"><div class="subj">${subj}</div><div class="to">${icon("send")}To: Jordan Ellis · ${prev}</div>
          <span class="ow-pill sent" id="ow-ps${i}">Sent</span><span class="ow-pill none" id="ow-pn${i}" style="visibility:hidden">No reply</span>
          <span class="ow-pill chase" id="ow-pc${i}" style="visibility:hidden">Following up…<b id="ow-n${i}">2</b></span></div>`,
      ).join("")}</div></div>`,
  );
  const chat = KIT.plainWin(
    0,
    0,
    CHAT.w,
    CHAT.h,
    "Messages",
    [
      ["Internal team", "Any update?"],
      ["Broker", "Any update?"],
    ]
      .map(
        ([who, text], i) =>
          `<div class="ow-msg" id="ow-m${i}" style="visibility:hidden"><div class="ow-from">${who}<small>now</small></div><div class="ow-line"><div class="ow-bubble">${text}</div><div class="ow-typing" id="ow-ty${i}"><i></i><i></i><i></i></div></div></div>`,
      )
      .join(""),
  );

  const html = () =>
    [
      `<div class="ow-board" id="ow-board">`,
      `<div class="ow-win ow-mail" id="ow-mail" style="z-index:2;width:${MAIL.w}px;height:${MAIL.h}px">${mail}<div class="ow-veil" id="ow-mail-veil" style="visibility:hidden"></div></div>`,
      SHEETS.map(
        (s, i) =>
          `<div class="ow-win ow-sheet" id="ow-s${i}" style="z-index:${4 + i};width:${SHEET[0]}px;height:${SHEET[1]}px;visibility:hidden">${sheetHtml(s, i)}<div class="ow-veil" id="ow-s${i}-veil" style="visibility:hidden"></div></div>`,
      ).join(""),
      `<div class="ow-win ow-chat" id="ow-chat" style="z-index:8;width:${CHAT.w}px;height:${CHAT.h}px;visibility:hidden">${chat}</div>`,
      `<div class="ow-status" id="ow-status" style="z-index:9;visibility:hidden">${clockSvg()}<div class="ow-st-w"><div class="ow-st-l">Assessment progress<span id="ow-pct">38%</span></div><div class="ow-st-track"><div class="ow-st-fill" id="ow-fill"></div></div><div class="ow-st-note">Waiting on documents · 0 of 5 received</div></div></div>`,
      `</div>`,
    ].join("");

  const state = (st, tIn) => {
    // After `still`, the board is its last moment: nothing in it moves.
    const t = Math.min(tIn, T.still);
    // The pull back of 02.3.
    const back = span(t, T.s23.in, T.still + 0.4, EASE.move);
    st.set("#ow-board", { transform: `scale(${r3(lerp(1, BACK.k, back))})` });

    // The mail: up on the cut, settling; stepping back and dimming as the spreadsheets come.
    const rise = span(t, T.t21, T.t21 + 0.45, EASE.settle);
    const recede = span(t, T.tJuggle - 0.1, T.tJuggle + 0.5, EASE.move);
    st.set("#ow-mail", {
      transform: `translate(${px(MAIL.x)}, ${px(MAIL.y + lerp(40, 0, rise) - 96 * recede)}) scale(${r3(lerp(0.97, 1, rise) * lerp(1, 0.93, recede))})`,
      ...fade(rise),
    });
    st.set("#ow-mail-veil", fade(0.42 * recede));
    // The requests going out, one after another: each lands at the foot of the list.
    let sent = 0;
    REQUESTS.forEach((_, i) => {
      const u = span(t, T.sentAt[i], T.sentAt[i] + 0.3, EASE.settle);
      if (t >= T.sentAt[i]) sent++;
      st.set(`#ow-r${i}`, {
        transform: `translate(${px(lerp(-40, 0, u))}, ${px(ROW_H * i)})`,
        ...fade(u),
      });
      // Sent, then no reply, then chased, again and again.
      const none = t >= T.noneAt[i];
      const chased = t >= T.chaseAt[i];
      st.set(`#ow-ps${i}`, fade(none ? 0 : 1));
      const np = span(t, T.noneAt[i], T.noneAt[i] + 0.16, EASE.settle);
      st.set(`#ow-pn${i}`, {
        transform: `scale(${r3(lerp(0.8, 1, np))})`,
        ...fade(none && !chased ? np : 0),
      });
      const cp = span(t, T.chaseAt[i], T.chaseAt[i] + 0.2, EASE.settle);
      st.set(`#ow-pc${i}`, {
        transform: `scale(${r3(lerp(0.8, 1, cp))})`,
        ...fade(chased ? cp : 0),
      });
      const n = t >= T.thirdAt[i] ? 4 : t >= T.againAt[i] ? 3 : 2;
      st.set(`#ow-n${i}`, { $text: String(n) });
    });
    // The Sent count: every request, then every chase.
    const chases = REQUESTS.reduce(
      (s, _, i) =>
        s + (t >= T.chaseAt[i] ? 1 : 0) + (t >= T.againAt[i] ? 1 : 0) + (t >= T.thirdAt[i] ? 1 : 0),
      0,
    );
    st.set("#ow-count", { $text: String(sent + chases) });

    // The spreadsheets, cascading towards the camera on "juggling"; dimming a little as the messages come.
    const dimSheets = span(t, T.tWait - 0.1, T.tWait + 0.5, EASE.move);
    SHEETS.forEach((s, i) => {
      const a = T.sheetAt[i];
      const u = span(t, a, a + 0.5, EASE.settle);
      const k = lerp(0.8, 1, u);
      const blur = (1 - u) * 6;
      // The broken one gives a jolt on "spreadsheets".
      const since = t - T.tRef;
      const jolt =
        s.broken && since >= 0 && since < 0.32 ? 6 * Math.sin(since * 60) * (1 - since / 0.32) : 0;
      st.set(`#ow-s${i}`, {
        transform: `translate(${px(s.at[0] + lerp(110, 0, u) + jolt)}, ${px(s.at[1] + lerp(150, 0, u))}) rotate(${r3(lerp(s.tilt * 3, s.tilt, u))}deg) scale(${r3(k)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(span(t, a, a + 0.18, EASE.linear)),
      });
      st.set(`#ow-s${i}-veil`, fade(0.22 * dimSheets * (i === 2 ? 0.6 : 1)));
      if (s.broken) {
        const bad = t >= T.tRef;
        st.set(`#ow-badv-${i}`, { $text: bad ? "#REF!" : "" });
        st.set(`#ow-tri-${i}`, fade(bad ? 1 : 0));
        st.set(`#ow-bad-${i}`, {
          "outline-color": bad ? "#374151" : "rgba(55,65,81,0)",
          "background-color": bad ? "#FEF2F2" : "#fff",
        });
      }
    });

    // The messages, on "waiting": the window comes in; Internal team on "internal", the broker on "external".
    const cin = span(t, T.tWait - 0.05, T.tWait + 0.42, EASE.settle);
    st.set("#ow-chat", {
      transform: `translate(${px(CHAT.x + lerp(70, 0, cin))}, ${px(CHAT.y + lerp(-30, 0, cin))}) rotate(${r3(lerp(4, 1.2, cin))}deg)`,
      ...fade(cin),
    });
    T.msgAt.forEach((a, i) => {
      const u = span(t, a, a + 0.3, EASE.settle);
      st.set(`#ow-m${i}`, { transform: `translateY(${px(lerp(18, 0, u))})`, ...fade(u) });
      // Typing dots that never resolve: each dot in turn.
      for (let d = 0; d < 3; d++) {
        const ph = (((t * 2.3 - d * 0.22 + i * 0.4) % 1) + 1) % 1;
        st.set(`#ow-ty${i} i:nth-child(${d + 1})`, {
          opacity: r3(0.32 + 0.68 * Math.max(0, Math.sin(Math.PI * ph))),
          transform: `translateY(${px(-4 * Math.max(0, Math.sin(Math.PI * ph)))})`,
        });
      }
    });

    // The status card, on "partners": the clock sweeps an hour, the bar creeps and stalls.
    const sin = span(t, T.tPartners - 0.35, T.tPartners + 0.1, EASE.settle);
    st.set("#ow-status", {
      transform: `translate(${px(STATUS.x)}, ${px(STATUS.y + lerp(70, 0, sin))})`,
      ...fade(sin),
    });
    const sweep = span(t, T.tPartners - 0.05, T.still, EASE.move);
    st.set("#ow-min", { transform: `rotate(${r3(60 + 360 * sweep)}deg)` });
    st.set("#ow-hour", { transform: `rotate(${r3(305 + 30 * sweep)}deg)` });
    const creep = 38 + 3 * span(t, T.tPartners - 0.2, T.tPartners + 0.3, EASE.settle);
    st.set("#ow-fill", { width: `${r3(creep)}%` });
    st.set("#ow-pct", { $text: `${Math.round(creep)}%` });
  };

  return { css, html, state, times: T };
}

function oldwayScene() {
  const B = board();
  const T = B.times;

  const html = () =>
    [
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="ow-ground"></div></div>`,
      `<div class="fk-layer" style="z-index:2">${B.html()}</div>`,
      `<div class="fk-layer ow-cool" id="ow-cool" style="z-index:9;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    B.state(st, t);
    // The frame cools as the clock sweeps, and holds.
    st.set("#ow-cool", fade(coolAt(t)));
    return st;
  };

  return {
    id: "oldway",
    shots: ["02.1", "02.2", "02.3"],
    palette: "before",
    html,
    state,
  };
}

/** How cool the frame is at t: from the stall, settled once the board holds still. */
function coolAt(t) {
  const T = times();
  return span(t, T.tPartners + 0.05, T.still + 0.55, EASE.move);
}

module.exports = oldwayScene;
module.exports.board = board;
module.exports.css = css;
module.exports.coolAt = coolAt;
