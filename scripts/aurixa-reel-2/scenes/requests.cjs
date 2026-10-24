// Reel 2, shots 02.1 to 02.3: the perfect property is found, and the requests keep coming (G-PILE). Today's tools
// only, in Reel 1's "before" kit (white windows, a grey system bar, the system's own type; nothing of Aurixa's).
// 14 Wattle Grove's listing comes forward and a green Found stamps onto it on "found". On "requests" it rises to
// the top of the frame and an unbranded inbox slides up under it, its requests landing one from each professional;
// on "coming" more pour in and the unread count climbs. On each "another" a card lands on the pile: a generic
// Verify your identity page (no document pictured), an Upload: bank statements request, a question about a
// transfer with someone typing under it. On "Suddenly" the pile spreads over the property and a Purchase progress
// bar comes up under it, creeping; on "paperwork" it stalls, and the frame cools and holds.
//
// The pile is its own part (pile(), below): 03.1 opens on it exactly as this scene leaves it, and lifts it away.
const M = require("../motion.cjs");

const { beat, span, lerp, r3, px, State, fade, captionHtml, caption, EASE, KIT } = M;

// The requests, as each professional would word them: the client is asked the same things again and again.
const REQUESTS = [
  [
    "Finance broker",
    "Certified copy of your ID",
    "Please send a certified copy of your passport or licence.",
  ],
  [
    "Solicitor / conveyancer",
    "Proof of residential address",
    "A recent utility bill or bank statement is fine.",
  ],
  [
    "Finance broker",
    "Bank statements (last 3 months)",
    "For the deposit: every account, the last three months.",
  ],
  ["Builder", "Please verify your identity again", "We need to verify you before the contract."],
  [
    "Accountant",
    "Which entity is buying?",
    "Your own name, a trust or a company? It changes the paperwork.",
  ],
  [
    "Solicitor / conveyancer",
    "Identification for the contract",
    "Two forms of ID, certified, before exchange.",
  ],
  ["Developer", "Purchaser details form", "Full legal name, address and ID number, please."],
];

/** The listing as it is drawn (KIT.listing at 640 px wide), and where it stands: forward, then risen. */
const LISTING = [640, 576];
const FORWARD = { top: 500, k: 1 };
const RISEN = { top: 362, k: 0.58 };
/** The inbox under it, and its rows. */
const INBOX = { x: 90, y: 724, w: 900, h: 560 };
const ROW_H = 118;
/** The three cards that land on the pile, centred at `at` with a tilt; and where "Suddenly" spreads them. */
const CARDS = {
  idv: { size: [560, 470], at: [470, 930], tilt: -4, spread: [-40, -350] },
  up: { size: [600, 300], at: [620, 1010], tilt: 3, spread: [40, -380] },
  msg: { size: [600, 290], at: [500, 1110], tilt: -2, spread: [-10, -390] },
};
const SPREAD_INBOX = [-12, -330, -1.5];
const PROGRESS = { x: 110, y: 1072, w: 860 };

const css = `
.rq-ground { position:absolute; inset:0; background:radial-gradient(90% 60% at 50% 40%, #FFFFFF 0%, #F3F4F6 62%, #E9EBEF 100%); }
.rq-cool { position:absolute; inset:0; background:linear-gradient(180deg, rgba(71,85,105,.22), rgba(30,41,59,.32)); mix-blend-mode:multiply; }
.rq-card { position:absolute; left:0; top:0; transform-origin:50% 50%; }
.rq-listing { position:absolute; left:0; top:0; width:${LISTING[0]}px; transform-origin:50% 0; }
.rq-listing .ls-card { box-shadow:0 2px 6px rgba(15,23,42,.06), 0 26px 60px rgba(15,23,42,.16); }
.rq-found { position:absolute; right:22px; top:22px; display:flex; align-items:center; gap:10px; padding:10px 22px 10px 16px; border-radius:999px;
  background:#16A34A; color:#fff; font:700 30px/1 Selawik, "Segoe UI", sans-serif; box-shadow:0 10px 24px rgba(22,163,74,.35); transform-origin:50% 50%; }
.rq-found svg { width:34px; height:34px; }
.rq-inbox .bp-list { width:100%; border-right:none; }
.rq-badge { display:inline-grid; place-items:center; min-width:44px; height:36px; padding:0 10px; border-radius:999px; background:#DC2626; color:#fff;
  font-size:21px; font-weight:700; }
.rq-rows { position:relative; flex:1; min-height:0; overflow:hidden; }
.rq-row { position:absolute; left:0; right:0; top:0; height:${ROW_H}px; box-sizing:border-box; padding:13px 24px; border-bottom:1px solid #E5E7EB;
  background:#fff; display:flex; flex-direction:column; gap:4px; }
.rq-row > div { line-height:1.22; }
.rq-row .who { display:flex; align-items:center; gap:10px; font-size:22px; font-weight:700; color:#111827; }
.rq-row .who em { width:10px; height:10px; border-radius:50%; background:#2563EB; }
.rq-row .who small { margin-left:auto; font-size:18px; font-weight:400; color:#6B7280; }
.rq-row .subj { font-size:22px; font-weight:600; color:#1F2937; }
.rq-row .prev { font-size:19px; color:#6B7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rq-idv .bp-in { flex-direction:column; padding:26px 30px; gap:16px; font-size:22px; }
.rq-step { display:flex; gap:10px; }
.rq-step i { flex:1; height:8px; border-radius:4px; background:#E5E7EB; }
.rq-step i.on { background:#374151; }
.rq-drop { height:150px; border:2px dashed #CBD5E1; border-radius:12px; display:grid; place-items:center; color:#6B7280; font-size:21px; text-align:center; line-height:1.4; }
.rq-btn { align-self:flex-start; padding:12px 22px; border-radius:8px; background:#374151; color:#fff; font-size:21px; font-weight:600; }
.rq-up .bp-in { flex-direction:column; padding:22px 26px; gap:12px; font-size:21px; }
.rq-file { display:flex; align-items:center; gap:14px; padding:12px 16px; border:1px solid #E5E7EB; border-radius:10px; color:#374151; }
.rq-file b { margin-left:auto; color:#DC2626; font-size:19px; }
.rq-chat .bp-in { flex-direction:column; padding:18px 22px; gap:10px; background:#F9FAFB; }
.rq-bubble { align-self:flex-start; max-width:540px; padding:16px 22px; border-radius:20px 20px 20px 6px; background:#fff; border:1px solid #D1D5DB;
  font-size:27px; line-height:1.32; color:#111827; }
.rq-from { font-size:20px; font-weight:600; color:#6B7280; padding-left:6px; }
.rq-typing { align-self:flex-start; display:flex; gap:8px; padding:14px 18px; border-radius:18px; background:#E5E7EB; }
.rq-typing i { width:12px; height:12px; border-radius:50%; background:#6B7280; }
.rq-progress { position:absolute; left:0; top:0; width:${PROGRESS.w}px; padding:22px 26px; border-radius:16px; background:#fff; border:1px solid #D1D5DB;
  box-shadow:0 14px 34px rgba(17,24,39,.16); font-family:Selawik, "Segoe UI", sans-serif; }
.rq-progress .l { display:flex; font-size:26px; font-weight:700; color:#111827; }
.rq-progress .l span { margin-left:auto; font-weight:600; color:#6B7280; }
.rq-progress .track { height:18px; border-radius:9px; background:#E5E7EB; margin-top:16px; overflow:hidden; }
.rq-progress .fill { height:100%; width:0; border-radius:9px; background:#6B7280; }
.rq-progress .rq-note { margin-top:12px; font-size:20px; color:#6B7280; }
`;

const tick = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const fileIcon = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></svg>`;

/** The beats this part moves on, from the brief. */
function times() {
  const [tIn, tFound, tRequests, tComing] = [0, 1, 2, 3].map((i) => beat("02.1", i));
  const tAnother = [0, 1, 2].map((i) => beat("02.2", i));
  const [tSuddenly, tPaperwork] = [0, 1].map((i) => beat("02.3", i));
  const rowAt = REQUESTS.map((_, i) =>
    i < 5 ? tRequests + 0.12 + i * 0.3 : tComing + (i - 5) * 0.28,
  );
  return { tIn, tFound, tRequests, tComing, tAnother, tSuddenly, tPaperwork, rowAt };
}

/**
 * The pile: the listing, the inbox, the three cards and the progress bar (no ground, no captions), as this scene
 * draws them and as 03.1 opens on them. state(st, t) sets every one of its layers at t.
 */
function pile() {
  const T = times();
  const inbox = KIT.plainWin(
    0,
    0,
    INBOX.w,
    INBOX.h,
    "Mail",
    `<div class="bp-list"><h4>Inbox<span class="rq-badge" id="rq-count">0</span><span class="bp-muted" style="font-size:19px;font-weight:400;margin-left:auto">Today</span></h4>
      <div class="rq-rows">${REQUESTS.map(
        ([who, subj, prev], i) =>
          `<div class="rq-row" id="rq-r${i}" style="visibility:hidden"><div class="who"><em></em>${who}<small>now</small></div><div class="subj">${subj}</div><div class="prev">${prev}</div></div>`,
      ).join("")}</div></div>`,
  );
  const idv = KIT.plainWin(
    0,
    0,
    ...CARDS.idv.size,
    "Verify your identity",
    `<div class="rq-step"><i class="on"></i><i class="on"></i><i></i><i></i></div><div style="font-size:28px;font-weight:700;color:#111827">Verify your identity</div><div style="color:#6B7280">Step 2 of 4 · Upload your ID</div><div class="rq-drop">Upload a photo of your ID<br>or take a picture with your phone</div><div class="rq-btn">Continue</div>`,
  );
  const upload = KIT.plainWin(
    0,
    0,
    ...CARDS.up.size,
    "Upload: bank statements",
    `<div style="font-size:26px;font-weight:700;color:#111827">Upload: bank statements</div><div style="color:#6B7280">Last 3 months · every account</div><div class="rq-file">${fileIcon}Statement_July.pdf<b>Missing</b></div><div class="rq-file">${fileIcon}Statement_August.pdf<b>Missing</b></div>`,
  );
  const message = KIT.plainWin(
    0,
    0,
    ...CARDS.msg.size,
    "Messages",
    `<div class="rq-from">Finance broker</div><div class="rq-bubble">Can you explain the transfer on 2 October?</div><div class="rq-typing" id="rq-typing"><i></i><i></i><i></i></div>`,
  );

  const html = () =>
    [
      `<div class="rq-listing" id="rq-listing" style="z-index:2">${KIT.listing({ width: LISTING[0], chips: ["New build"] })}<div class="rq-found" id="rq-found" style="visibility:hidden">${tick}Found</div></div>`,
      `<div class="rq-card rq-inbox" id="rq-inbox" style="z-index:4;width:${INBOX.w}px;height:${INBOX.h}px;visibility:hidden">${inbox}</div>`,
      `<div class="rq-card rq-idv" id="rq-idv" style="z-index:5;width:${CARDS.idv.size[0]}px;height:${CARDS.idv.size[1]}px;visibility:hidden">${idv}</div>`,
      `<div class="rq-card rq-up" id="rq-up" style="z-index:6;width:${CARDS.up.size[0]}px;height:${CARDS.up.size[1]}px;visibility:hidden">${upload}</div>`,
      `<div class="rq-card rq-chat" id="rq-msg" style="z-index:7;width:${CARDS.msg.size[0]}px;height:${CARDS.msg.size[1]}px;visibility:hidden">${message}</div>`,
      `<div class="rq-progress" id="rq-progress" style="z-index:8;visibility:hidden"><div class="l">Purchase progress<span id="rq-pct">22%</span></div><div class="track"><div class="fill" id="rq-fill"></div></div><div class="rq-note">Waiting on documents</div></div>`,
    ].join("");

  /** How far "Suddenly" has spread the pile. */
  const spreadAt = (t) => span(t, T.tSuddenly, T.tSuddenly + 1.1, EASE.move);

  /** A card landing on the pile at `at`: down from above, turning to its resting tilt, settling. */
  const land = (st, t, sel, at, card) => {
    const [w, h] = card.size;
    const u = span(t, at - 0.08, at + 0.42, EASE.settle);
    const s = spreadAt(t);
    const x = card.at[0] + card.spread[0] * s;
    const y = card.at[1] + card.spread[1] * s;
    st.set(sel, {
      transform: `translate(${px(x - w / 2)}, ${px(y - h / 2 + lerp(-140, 0, u))}) rotate(${r3(lerp(card.tilt * 2.5, card.tilt, u))}deg) scale(${r3(lerp(1.08, 1, u))})`,
      ...fade(span(t, at - 0.08, at + 0.06, EASE.linear)),
    });
  };

  const state = (st, t) => {
    // The listing: forward (it settles in on the cut), then risen to the top on "requests".
    const settle = span(t, T.tIn, T.tIn + 0.5, EASE.settle);
    const rise = span(t, T.tRequests - 0.35, T.tRequests + 0.3, EASE.move);
    const top = lerp(FORWARD.top + lerp(26, 0, settle), RISEN.top, rise);
    const k = lerp(FORWARD.k * lerp(0.96, 1, settle), RISEN.k, rise);
    st.set("#rq-listing", {
      transform: `translate(${px(540 - LISTING[0] / 2)}, ${px(top)}) scale(${r3(k)})`,
    });
    // Found: stamped on, a touch big and turned, settling.
    const f = span(t, T.tFound - 0.06, T.tFound + 0.32, EASE.settle);
    st.set("#rq-found", {
      transform: `scale(${r3(lerp(1.7, 1, f))}) rotate(${r3(lerp(-14, -5, f))}deg)`,
      ...fade(span(t, T.tFound - 0.06, T.tFound + 0.04, EASE.linear)),
    });
    // The inbox slides up under it on "requests", and goes with the pile on "Suddenly".
    const ib = span(t, T.tRequests - 0.3, T.tRequests + 0.32, EASE.move);
    const s = spreadAt(t);
    st.set("#rq-inbox", {
      transform: `translate(${px(INBOX.x + SPREAD_INBOX[0] * s)}, ${px(lerp(1940, INBOX.y, ib) + SPREAD_INBOX[1] * s)}) rotate(${r3(SPREAD_INBOX[2] * s)}deg)`,
      ...fade(ib > 0 ? 1 : 0),
    });
    // The rows: each lands at the top, pushing the ones before it down a row.
    let count = 0;
    REQUESTS.forEach((_, i) => {
      const u = span(t, T.rowAt[i], T.rowAt[i] + 0.3, EASE.settle);
      if (t >= T.rowAt[i]) count++;
      const after = T.rowAt.slice(i + 1).reduce((n, a) => n + span(t, a, a + 0.3, EASE.settle), 0);
      st.set(`#rq-r${i}`, {
        transform: `translate(0, ${px(ROW_H * after + lerp(-ROW_H * 0.6, 0, u))})`,
        ...fade(u),
      });
    });
    // The unread count climbs past what has landed, from "coming".
    const extra = Math.floor(6 * span(t, T.tComing, T.tComing + 1.4, EASE.linear));
    st.set("#rq-count", { $text: String(count + extra) });
    // The cards, one on each "another".
    land(st, t, "#rq-idv", T.tAnother[0], CARDS.idv);
    land(st, t, "#rq-up", T.tAnother[1], CARDS.up);
    land(st, t, "#rq-msg", T.tAnother[2], CARDS.msg);
    // Someone typing under the question: the dots in turn.
    for (let i = 0; i < 3; i++) {
      const ph = (((t * 2.4 - i * 0.25) % 1) + 1) % 1;
      st.set(`#rq-typing i:nth-child(${i + 1})`, {
        opacity: r3(0.35 + 0.65 * Math.max(0, Math.sin(Math.PI * ph))),
      });
    }
    // The progress bar: up under the pile as it spreads, creeping, stalled on "paperwork".
    const pIn = span(t, T.tSuddenly + 0.35, T.tSuddenly + 0.85, EASE.settle);
    st.set("#rq-progress", {
      transform: `translate(${px(PROGRESS.x)}, ${px(PROGRESS.y + lerp(70, 0, pIn))})`,
      ...fade(pIn),
    });
    const creep = 22 + 12 * span(t, T.tSuddenly + 0.6, T.tPaperwork, EASE.linear);
    st.set("#rq-fill", { width: `${r3(creep)}%` });
    st.set("#rq-pct", { $text: `${Math.round(creep)}%` });
  };

  return { css, html, state, times: T };
}

function requestsScene() {
  const P = pile();
  const T = P.times;

  const html = () =>
    [
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="rq-ground"></div></div>`,
      P.html(),
      `<div class="fk-layer rq-cool" id="rq-cool" style="z-index:9;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    P.state(st, t);
    // The frame cools on "paperwork", and holds.
    st.set("#rq-cool", fade(span(t, T.tPaperwork - 0.1, T.tPaperwork + 0.6, EASE.move)));
    return st;
  };

  return {
    id: "requests",
    shots: ["02.1", "02.2", "02.3"],
    palette: "before",
    html,
    state,
  };
}

module.exports = requestsScene;
module.exports.pile = pile;
module.exports.css = css;
