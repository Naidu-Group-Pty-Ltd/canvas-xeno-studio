// Reel 2, shot 06.2: less paperwork, less repetition, better-connected professionals and a smoother property
// journey, without clients constantly providing the same information. The website's own two chains
// (aurixa-systems src/pages/CompliancePassport.tsx, JourneyContrast: its words and its styles): on "paperwork"
// the "Instead of" chain (Forms, Emails, Follow-ups, Documents, More Emails, Repetition) comes up under the
// Passport and falls away, gone by "repetition". On "better" the six professionals of 01 come back, on a ring
// around the Passport, each wired to it rather than to the client. On "smoother" the ring steps back and the
// "Aurixa creates" chain lights step by step (Invite, Verify, Review, Approve, Passport, Connect, Progress). On
// "without" the chain gives way and the client takes the ring's seventh place: one line to the Passport, calm.
const M = require("../motion.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const K2 = require("../kit2.cjs");

const { shotOf, beat, EASE, span, lerp, lerp2, r3, px, State, fade, captionHtml, caption } = M;

const BEFORE = ["Forms", "Emails", "Follow-ups", "Documents", "More Emails", "Repetition"];
const AFTER = ["Invite", "Verify", "Review", "Approve", "Passport", "Connect", "Progress"];

const I = {
  briefcase:
    '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  landmark:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  hardhat:
    '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>',
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
};
const svg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#d7b35f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;

/**
 * The ring: seven places about the Passport (the group's own coordinates, its centre at 0, 0), the client's at
 * the foot; the six professionals in reading order from the top left, as in 01.
 */
const RING = { rx: 340, ry: 400 };
const placeAt = (k) => {
  const a = ((90 + (360 / 7) * k) * Math.PI) / 180;
  return [RING.rx * Math.cos(a), RING.ry * Math.sin(a)];
};
const ROLES = [
  { label: "Buyer's agent", icon: "briefcase", k: 3 },
  { label: "Finance broker", icon: "landmark", k: 4 },
  { label: "Solicitor / conveyancer", icon: "scale", k: 2 },
  { label: "Accountant", icon: "calculator", k: 5 },
  { label: "Builder", icon: "hardhat", k: 1 },
  { label: "Developer", icon: "building", k: 6 },
].map((r) => ({ ...r, at: placeAt(r.k) }));
const CLIENT_AT = placeAt(0);
const CHIP = [272, 96];
const COVER_W = 220;
const COVER_H = (COVER_W * K2.LEAF[1]) / K2.LEAF[0];

const css = `
.rs-group { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:0 0; }
.rs-book { position:absolute; left:0; top:0; border-radius:8px; box-shadow:0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(215,179,95,.25); }
.rs-book img { display:block; width:100%; height:100%; border-radius:8px; }
.rs-chip { position:absolute; left:0; top:0; width:${CHIP[0]}px; height:${CHIP[1]}px; box-sizing:border-box; display:flex; align-items:center; gap:14px;
  padding:0 18px; border-radius:20px; background:linear-gradient(180deg, rgba(18,28,56,.96), rgba(8,14,30,.96)); border:1.5px solid rgba(215,179,95,.5);
  box-shadow:0 18px 40px rgba(0,0,0,.5); font:600 23px/1.12 var(--reel-sans); color:#fff; transform-origin:50% 50%; }
.rs-chip svg { width:34px; height:34px; flex:none; }
.rs-client { position:absolute; left:0; top:0; width:300px; height:104px; box-sizing:border-box; display:flex; align-items:center; gap:16px; padding:0 20px;
  border-radius:24px; background:linear-gradient(180deg, rgba(18,34,52,.97), rgba(8,18,30,.97)); border:1.5px solid rgba(94,221,232,.55);
  box-shadow:0 18px 40px rgba(0,0,0,.5); font-family:var(--reel-sans); color:#fff; transform-origin:50% 50%; }
.rs-client .av { width:64px; height:64px; flex:none; border-radius:50%; display:grid; place-items:center; background:#10233D; border:1.5px solid rgba(94,221,232,.6);
  font-size:25px; font-weight:700; }
.rs-client .n { font-size:26px; font-weight:700; }
.rs-client .r { font-size:18px; color:#B7C1D0; margin-top:3px; }
.rs-calm { position:absolute; left:0; top:0; border-radius:30px; border:2px solid rgba(94,221,232,.6); pointer-events:none; }
.rs-chain { position:absolute; left:60px; right:60px; top:0; box-sizing:border-box; padding:28px 30px 32px; border-radius:22px;
  border:1px solid rgba(255,255,255,.10); background:linear-gradient(140deg, rgba(16,30,52,.92), rgba(8,15,30,.95)); box-shadow:0 26px 60px rgba(0,0,0,.45); }
.rs-chain small { display:block; font:700 17px/1 ui-monospace, "Inconsolata", monospace; letter-spacing:.24em; text-transform:uppercase; color:#7f8da0; }
.rs-chain ol { display:flex; flex-wrap:wrap; align-items:center; gap:14px 14px; margin:20px 0 0; padding:0; list-style:none; }
.rs-chain li { display:flex; align-items:center; gap:14px; font:300 27px/1 var(--reel-sans); }
.rs-chain li+li::before { content:""; flex:none; width:12px; height:12px; border-top:2px solid #4a5668; border-right:2px solid #4a5668; transform:rotate(45deg); }
.rs-chain li span { display:inline-block; padding:12px 16px; }
.rs-before li span { border:2px dashed rgba(255,255,255,.22); color:#8b96a6; }
.rs-after { border-color:rgba(215,179,95,.35); }
.rs-after small { color:#d7b35f; }
.rs-after li+li::before { border-color:#d7b35f; }
.rs-after li span { border:2px solid rgba(94,221,232,.35); background:rgba(0,168,181,.07); color:#dfe5ec; }
.rs-after li.is-passport span { border-color:rgba(215,179,95,.65); background:rgba(215,179,95,.08); color:#d7b35f; box-shadow:0 0 18px rgba(215,179,95,.18); }
`;

function resultScene() {
  const s = shotOf("06.2");
  const [TP, TR, TB, TS, TW] = [0, 1, 2, 3, 4].map((i) => beat("06.2", i));
  const T0 = s.in;
  const cover = K2.screen("pp-par-cover").src;
  const ringAt = ROLES.map((_, i) => TB - 0.05 + i * 0.12);
  const stepAt = AFTER.map((_, i) => TS + 0.15 + i * 0.17);
  const dropAt = BEFORE.map((_, i) => TP + 0.45 + i * 0.13);

  const chain = (cls, label, steps, idp) =>
    `<div class="rs-chain ${cls}" id="${idp}"><small>${label}</small><ol>${steps
      .map(
        (step, i) =>
          `<li id="${idp}-${i}" class="${step === "Passport" ? "is-passport" : ""}"><span>${step}</span></li>`,
      )
      .join("")}</ol></div>`;

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="rs-group" id="group" style="z-index:2">`,
      ROLES.map((_, i) => S.lineHtml(`rl-${i}`, 1) + S.dotHtml(`rd-${i}`, 2)).join(""),
      S.lineHtml("rl-client", 1),
      `<div class="rs-book" id="book" style="z-index:3;width:${COVER_W}px;height:${r3(COVER_H)}px"><img src="${cover}" alt=""></div>`,
      ROLES.map(
        (r, i) =>
          `<div class="rs-chip" id="ch-${i}" style="z-index:4;visibility:hidden">${svg(r.icon)}<span>${r.label}</span></div>`,
      ).join(""),
      `<div class="rs-calm" id="calm" style="z-index:4;visibility:hidden"></div>`,
      `<div class="rs-client" id="client" style="z-index:5;visibility:hidden"><div class="av">JE</div><div><div class="n">Jordan Ellis</div><div class="r">Client</div></div></div>`,
      `</div>`,
      `<div class="fk-layer" style="z-index:6">${chain("rs-before", "Instead of", BEFORE, "cb")}${chain("rs-after", "Aurixa creates", AFTER, "ca")}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The group (the Passport and its ring): its centre and scale through the shot. Up top while the before chain
    // falls; centred for the ring; stepped back for the after chain; back for the client.
    const toRing = span(t, TB - 0.5, TB + 0.3, EASE.move);
    const back =
      span(t, TS - 0.1, TS + 0.5, EASE.move) * (1 - span(t, TW - 0.1, TW + 0.6, EASE.move));
    const c = lerp2(lerp2([540, 560], [540, 720], toRing), [540, 600], back);
    const k = lerp(lerp(1.15, 1, toRing), 0.72, back);
    const ink = (p) => [c[0] + p[0] * k, c[1] + p[1] * k];
    // The Passport, from where 06.1 leaves it.
    const enter = span(t, T0, T0 + 0.6, EASE.move);
    const bw = COVER_W * k * lerp(1.53, 1, enter);
    const bh = COVER_H * k * lerp(1.53, 1, enter);
    const bc = lerp2([540, 700], c, enter);
    st.set("#book", {
      transform: `translate(${px(bc[0] - bw / 2)}, ${px(bc[1] - bh / 2)}) scale(${r3(bw / COVER_W)})`,
      "transform-origin": "0 0",
    });
    const edge = (p) => {
      // Where the line to p leaves the Passport's edge.
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      const q = Math.min(bw / 2 / Math.abs(dx || 1e-6), bh / 2 / Math.abs(dy || 1e-6));
      return [c[0] + dx * q, c[1] + dy * q];
    };
    // The six, on the ring, each wired to the Passport, a traveller running each line.
    ROLES.forEach((r, i) => {
      const a = span(t, ringAt[i], ringAt[i] + 0.45, EASE.settle);
      const [x, y] = ink(r.at);
      st.set(`#ch-${i}`, {
        transform: `translate(${px(x - CHIP[0] / 2)}, ${px(y - CHIP[1] / 2)}) scale(${r3(k * lerp(0.85, 1, a))})`,
        ...fade(a),
      });
      const from = edge([x, y]);
      S.lineState(st, `rl-${i}`, from, [x, y], {
        drawn: span(t, ringAt[i] + 0.1, ringAt[i] + 0.6, EASE.move),
      });
      const run = t - (ringAt[i] + 0.6);
      const u = run < 0 ? -1 : (run / 1.3 + i * 0.17) % 1;
      st.set(`#rd-${i}`, {
        transform: `translate(${px(lerp(from[0], x, Math.max(0, u)))}, ${px(lerp(from[1], y, Math.max(0, u)))})`,
        ...fade(u < 0 ? 0 : Math.sin(Math.PI * u)),
      });
    });
    // The client, on "without": the seventh place, one line to the Passport, calm.
    const ca = span(t, TW + 0.1, TW + 0.6, EASE.settle);
    const [cx, cy] = ink(CLIENT_AT);
    st.set("#client", {
      transform: `translate(${px(cx - 150)}, ${px(cy - 52)}) scale(${r3(k * lerp(0.86, 1, ca))})`,
      ...fade(ca),
    });
    S.lineState(st, "rl-client", edge([cx, cy]), [cx, cy - 52 * k], {
      drawn: span(t, TW + 0.35, TW + 0.9, EASE.move),
    });
    // Calm: one slow breath of light around it, settling.
    const breath = span(t, TW + 0.7, TW + 2.6, EASE.move);
    const g = 10 + 26 * breath;
    st.set("#calm", {
      transform: `translate(${px(cx - 150 - g)}, ${px(cy - 52 - g)})`,
      width: px(300 + 2 * g),
      height: px(104 + 2 * g),
      ...fade(breath > 0 && breath < 1 ? 0.7 * Math.sin(Math.PI * breath) : 0),
    });
    // The before chain: up under the Passport on "paperwork", its steps falling away, gone by "repetition".
    const bin = span(t, TP - 0.2, TP + 0.3, EASE.settle);
    const bout = span(t, TR - 0.1, TR + 0.3, EASE.linear);
    st.set("#cb", {
      transform: `translateY(${px(lerp(1020, 900, bin))})`,
      ...fade(bin * (1 - bout)),
    });
    BEFORE.forEach((_, i) => {
      const d = span(t, dropAt[i], dropAt[i] + 0.55, EASE.linear);
      st.set(`#cb-${i}`, {
        transform: `translate(${px((i % 2 ? 1 : -1) * 30 * d)}, ${px(520 * d * d)}) rotate(${r3((i % 2 ? 1 : -1) * 24 * d)}deg)`,
        opacity: r3(1 - d),
      });
    });
    // The after chain, on "smoother": its steps lighting one after another; giving way on "without".
    const ain = span(t, TS - 0.05, TS + 0.4, EASE.settle);
    const aout = span(t, TW - 0.1, TW + 0.3, EASE.move);
    st.set("#ca", {
      transform: `translateY(${px(lerp(1110, 1030, ain) + 60 * aout)})`,
      ...fade(ain * (1 - aout)),
    });
    AFTER.forEach((_, i) => {
      const lit = span(t, stepAt[i], stepAt[i] + 0.25, EASE.settle);
      st.set(`#ca-${i}`, {
        opacity: r3(lerp(0.25, 1, lit)),
        transform: `scale(${r3(lerp(0.94, 1, lit))})`,
      });
    });
    return st;
  };

  return { id: "result", shots: ["06.2"], palette: "aurixa", html, state };
}

module.exports = resultScene;
