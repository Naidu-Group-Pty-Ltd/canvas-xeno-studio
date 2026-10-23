// Reel 2, shots 05.3 and 06.1: supporting legislative compliance while eliminating unnecessary duplication; the
// result? The camera pulls back from the Passport that opened in Shah Legal's portal: the Passport, closed (its
// own cover, as the product draws it), and around it the three partners on the matter, each in its own portal,
// with the site's lines of light running from the Passport to them. On "legislative" the responsibility line
// comes up under it and holds through 06.1 (at 30 px, for 5 s). On "eliminating" the requests from 02 drift in
// as ghosts, in today's plain tools, and fold into the Passport one after another. On "The result?" everything
// else falls away: the Passport alone on the navy.
const M = require("../motion.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const K2 = require("../kit2.cjs");

const { shotOf, beat, EASE, span, lerp, lerp2, r3, px, State, fade, captionHtml, caption } = M;

/** The Passport's cover where it stands (its centre and width), and the partners' portals around it. */
const BOOK = { at: [540, 720], w: 300 };
const BOOK_H = (BOOK.w * K2.LEAF[1]) / K2.LEAF[0];
const PORTALS = [
  { id: "sol", portal: "Solicitor portal", org: "Shah Legal", icon: "scale", at: [540, 352] },
  {
    id: "fin",
    portal: "Finance portal",
    org: "Harbour Finance Group",
    icon: "landmark",
    at: [196, 790],
  },
  {
    id: "acc",
    portal: "Accountant portal",
    org: "Patel &amp; Co Accountants",
    icon: "calculator",
    at: [884, 790],
  },
];
const CARD = [316, 148];
/** The requests of 02, as their ghosts: where each drifts in from. */
const GHOSTS = [
  ["Certified copy of your ID", [-260, 520]],
  ["Proof of residential address", [1340, 470]],
  ["Please verify your identity again", [-240, 1080]],
  ["Bank statements (last 3 months)", [1320, 1110]],
  ["Which entity is buying?", [540, 1540]],
];
const RESPONSIBILITY = "Your business remains responsible for its AML/CTF obligations.";

const ICON = {
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  landmark:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
};

const css = `
.nw-book { position:absolute; left:0; top:0; transform-origin:50% 50%; border-radius:10px;
  box-shadow:0 40px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(215,179,95,.25); }
.nw-book img { display:block; width:100%; height:100%; border-radius:10px; }
.nw-halo { position:absolute; left:0; top:0; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(closest-side, rgba(245,209,122,.26), rgba(94,221,232,.08) 55%, rgba(4,11,22,0)); }
.nw-card { position:absolute; left:0; top:0; width:${CARD[0]}px; height:${CARD[1]}px; box-sizing:border-box; padding:20px 22px; border-radius:22px;
  background:linear-gradient(180deg, rgba(18,28,56,.95), rgba(8,14,30,.95)); border:1.5px solid rgba(215,179,95,.45);
  box-shadow:0 26px 60px rgba(0,0,0,.5); font-family:var(--reel-sans); color:#fff; display:flex; flex-direction:column; gap:10px; transform-origin:50% 50%; }
.nw-card .k { display:flex; align-items:center; gap:10px; font:700 15px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.22em;
  text-transform:uppercase; color:#d7b35f; }
.nw-card .k svg { width:24px; height:24px; flex:none; }
.nw-card .o { font-size:26px; font-weight:700; line-height:1.15; }
.nw-card .s { align-self:flex-start; display:flex; align-items:center; gap:8px; font-size:16px; font-weight:700; color:#5edde8;
  border:1px solid rgba(94,221,232,.45); border-radius:999px; padding:6px 12px; background:rgba(0,168,181,.08); }
.nw-card .s i { width:8px; height:8px; border-radius:50%; background:#5edde8; box-shadow:0 0 10px #5edde8; }
.nw-ghost { position:absolute; left:0; top:0; padding:16px 22px; border-radius:12px; background:#fff; border:1px solid #D1D5DB;
  font:600 24px/1.2 Selawik, "Segoe UI", sans-serif; color:#374151; white-space:nowrap; transform-origin:50% 50%; }
.nw-resp { position:absolute; left:90px; right:90px; top:1104px; text-align:center; font:500 30px/1.35 var(--reel-sans); color:#E6EBF3;
  letter-spacing:.005em; }
.nw-resp::before { content:""; display:block; width:120px; height:2px; margin:0 auto 18px; background:#c89b3c; box-shadow:0 0 14px #d7b35f; }
`;
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="#d7b35f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/** Where a line from the Passport to a portal leaves the cover's edge and meets the card's. */
function ends(p) {
  const [cx, cy] = BOOK.at;
  const [px2, py2] = p.at;
  const dx = px2 - cx;
  const dy = py2 - cy;
  // Leave the cover through its nearer edge, meet the card at its nearer edge.
  const kb = Math.min(BOOK.w / 2 / Math.abs(dx || 1e-6), BOOK_H / 2 / Math.abs(dy || 1e-6));
  const kc = Math.min(CARD[0] / 2 / Math.abs(dx || 1e-6), CARD[1] / 2 / Math.abs(dy || 1e-6));
  return [
    [cx + dx * kb, cy + dy * kb],
    [px2 - dx * kc, py2 - dy * kc],
  ];
}

function networkScene() {
  const s1 = shotOf("06.1");
  const [T0, TL, TE] = [0, 1, 2].map((i) => beat("05.3", i));
  const TR = s1.in;
  const END = s1.out;
  const cover = K2.screen("pp-par-cover").src;
  const cardAt = PORTALS.map((_, i) => T0 + 0.35 + i * 0.14);
  const lineAt = PORTALS.map((_, i) => T0 + 0.55 + i * 0.14);
  const ghostIn = GHOSTS.map((_, i) => TE - 0.1 + i * 0.12);
  const ghostFold = GHOSTS.map((_, i) => TE + 0.55 + i * 0.16);

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="nw-halo" id="halo" style="z-index:1;visibility:hidden"></div>`,
      PORTALS.map((p) => S.lineHtml(`ln-${p.id}`, 2) + S.dotHtml(`dot-${p.id}`, 3)).join(""),
      PORTALS.map(
        (p) =>
          `<div class="nw-card" id="card-${p.id}" style="z-index:4;visibility:hidden"><div class="k">${icon(p.icon)}${p.portal}</div><div class="o">${p.org}</div><div class="s"><i></i>Live Passport</div></div>`,
      ).join(""),
      GHOSTS.map(
        ([text], i) =>
          `<div class="nw-ghost" id="gh-${i}" style="z-index:6;visibility:hidden">${text}</div>`,
      ).join(""),
      `<div class="nw-book" id="book" style="z-index:5;width:${BOOK.w}px;height:${r3(BOOK_H)}px"><img src="${cover}" alt=""></div>`,
      `<div class="nw-resp" id="resp" style="z-index:7;visibility:hidden">${RESPONSIBILITY}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The pull back: from close on the Passport (as 05.2 leaves it) to its place among the portals; then, on
    // "The result?", alone, a touch nearer.
    const back = span(t, T0, T0 + 1.25, EASE.settle);
    const alone = span(t, TR, TR + 0.7, EASE.move);
    const k = lerp(lerp(2.5, 1, back), 1.12, alone);
    const [bx, by] = lerp2(lerp2([540, 980], BOOK.at, back), [540, 700], alone);
    // Each ghost that folds in makes the cover take the light.
    const took = GHOSTS.reduce((n, _, i) => {
      const d = t - (ghostFold[i] + 0.5);
      return n + (d >= 0 ? Math.exp(-d / 0.25) : 0);
    }, 0);
    st.set("#book", {
      transform: `translate(${px(bx - BOOK.w / 2)}, ${px(by - BOOK_H / 2)}) scale(${r3(k)})`,
      filter: took > 0.01 ? `brightness(${r3(1 + 0.35 * Math.min(1, took))})` : "none",
    });
    st.set("#halo", {
      transform: `translate(${px(bx - 420)}, ${px(by - 420)})`,
      width: px(840),
      height: px(840),
      ...fade(0.6 * back + 0.3 * Math.min(1, took)),
    });
    // The portals, and the lines running to them; all of it gone on "The result?".
    const gone = span(t, TR - 0.05, TR + 0.5, EASE.move);
    PORTALS.forEach((p, i) => {
      const a = span(t, cardAt[i], cardAt[i] + 0.45, EASE.settle);
      const out = [p.at[0] - BOOK.at[0], p.at[1] - BOOK.at[1]];
      st.set(`#card-${p.id}`, {
        transform: `translate(${px(p.at[0] - CARD[0] / 2 + 0.25 * out[0] * gone)}, ${px(p.at[1] - CARD[1] / 2 + lerp(30, 0, a) + 0.25 * out[1] * gone)}) scale(${r3(lerp(0.92, 1, a))})`,
        ...fade(a * (1 - gone)),
      });
      const [from, to] = ends(p);
      S.lineState(st, `ln-${p.id}`, from, to, {
        drawn: span(t, lineAt[i], lineAt[i] + 0.6, EASE.move),
        opacity: 1 - gone,
      });
      // A traveller runs each line, from the Passport out, over and over.
      const runT = t - (lineAt[i] + 0.6);
      const u = runT < 0 ? -1 : (runT / 1.1 + i * 0.33) % 1;
      st.set(`#dot-${p.id}`, {
        transform: `translate(${px(lerp(from[0], to[0], Math.max(0, u)))}, ${px(lerp(from[1], to[1], Math.max(0, u)))})`,
        ...fade(u < 0 ? 0 : Math.sin(Math.PI * u) * (1 - gone)),
      });
    });
    // The ghosts of the requests: in from the edges, then folded into the Passport one after another.
    GHOSTS.forEach(([, from], i) => {
      const inn = span(t, ghostIn[i], ghostIn[i] + 0.6, EASE.settle);
      const fold = span(t, ghostFold[i], ghostFold[i] + 0.5, EASE.move);
      const rest = lerp2(
        from,
        [BOOK.at[0] + (i % 2 ? 1 : -1) * 250, BOOK.at[1] + (i - 2) * 120],
        inn,
      );
      const [x, y] = lerp2(rest, BOOK.at, fold);
      st.set(`#gh-${i}`, {
        transform: `translate(-50%, -50%) translate(${px(x)}, ${px(y)}) scale(${r3(lerp(1, 0.12, fold))}) rotate(${r3(lerp((i % 2 ? 1 : -1) * 6, 0, fold))}deg)`,
        ...fade(
          0.55 *
            span(t, ghostIn[i], ghostIn[i] + 0.25, EASE.linear) *
            (1 - span(t, ghostFold[i] + 0.3, ghostFold[i] + 0.5, EASE.linear)),
        ),
      });
    });
    // The responsibility line, from "legislative" to the end of 06.1.
    st.set("#resp", {
      transform: `translateY(${px(lerp(18, 0, span(t, TL, TL + 0.5, EASE.settle)))})`,
      ...fade(span(t, TL, TL + 0.4, EASE.linear) * (1 - span(t, END - 0.2, END, EASE.linear))),
    });
    return st;
  };

  return { id: "network", shots: ["05.3", "06.1"], palette: "aurixa", html, state };
}

module.exports = networkScene;
