// Reel 3, shot 05.6: from information to financial insight in moments (G-CHAIN). The Borrowing Capacity page, in
// focus as 05.5 leaves it; the camera pulls back and the page settles low in the frame, the card from 05.2 coming in
// above it and Jordan's fact find (the workbook as G-FACTFIND draws it from the file's own cells) at the top: the
// information, the assessment and the page. On "insight" a gold line draws from the fact find to the card and on to
// the page, a light running along it and each one catching it as it arrives; then it holds, the three joined. The
// illustrative label holds through it.
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const G = require("../g-factfind.cjs");
const click = require("./click.cjs");
const page = require("./page.cjs");

const {
  shotOf,
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
  between,
  placeWindow,
  captionHtml,
  caption,
  PAD,
} = M;

const CARD = click.card;
const PAGE = page.pageEnd;
const PAGE_CSS = PAGE.plate.css;

// Where the three come to rest (frame px): the fact find high on the left, the card to the right of it and lower,
// the page under them; the line runs between them in that order.
const BOOK_K = 0.42;
const BOOK = [64, 384, G.BOOK_W * BOOK_K, G.BOOK_H * BOOK_K];
const CARD_RECT = [576, 548, 448, 0];
const CARD_Z = (CARD_RECT[2] - 2 * PAD) / CARD.css[0];
CARD_RECT[3] = CARD.css[1] * CARD_Z + 2 * PAD;
const PAGE_RECT = [66, 884, 610, 296];
const PAGE_Z = (PAGE_RECT[2] - 2 * PAD) / PAGE_CSS[0];

/** A cubic Bézier's point at u. */
const bez = (p0, p1, p2, p3, u) => {
  const v = 1 - u;
  return [
    v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
  ];
};
// The line: out of the fact find's right edge, into the card's left, behind it, out of its foot, into the page.
const A = [BOOK[0] + BOOK[2] + 2, BOOK[1] + BOOK[3] * 0.48];
const Bin = [CARD_RECT[0] - 2, CARD_RECT[1] + CARD_RECT[3] * 0.46];
const Bout = [CARD_RECT[0] + CARD_RECT[2] * 0.42, CARD_RECT[1] + CARD_RECT[3] + 2];
const C = [PAGE_RECT[0] + PAGE_RECT[2] + 2, PAGE_RECT[1] + PAGE_RECT[3] * 0.42];
const SEGMENTS = [
  [A, [A[0] + 70, A[1]], [Bin[0] - 70, Bin[1]], Bin],
  [Bin, [Bin[0] + 120, Bin[1]], [Bout[0], Bout[1] - 120], Bout],
  [Bout, [Bout[0], Bout[1] + 80], [C[0] + 90, C[1]], C],
];
/** The line as points, evenly enough to run a light along, with each point's share of the length. */
const POINTS = (() => {
  const pts = SEGMENTS.flatMap((s, k) =>
    Array.from({ length: 60 }, (_, i) => bez(...s, i / 60)).concat(
      k === SEGMENTS.length - 1 ? [s[3]] : [],
    ),
  );
  const len = [0];
  for (let i = 1; i < pts.length; i++)
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len.at(-1) };
})();
const pointAt = (f) => {
  const d = f * POINTS.total;
  const i = POINTS.len.findIndex((l) => l >= d);
  if (i <= 0) return POINTS.pts[0];
  const a = POINTS.len[i - 1];
  const b = POINTS.len[i];
  return lerp2(POINTS.pts[i - 1], POINTS.pts[i], (d - a) / Math.max(1e-6, b - a));
};
/** How far along the line (0 to 1) each one is reached. */
const REACH = {
  book: 0,
  card: POINTS.len[60] / POINTS.total,
  page: 1,
};
const PATH = SEGMENTS.map(
  ([p0, p1, p2, p3], k) =>
    `${k ? "" : `M${p0.map(r3).join(" ")} `}C${[p1, p2, p3].map((p) => p.map(r3).join(" ")).join(", ")}`,
).join(" ");

const css = `
.ck-book-wrap { position:absolute; left:0; top:0; transform-origin:0 0; }
.ck-book-wrap .ff-book { visibility:inherit !important; }
.ck-line { position:absolute; left:0; top:0; width:1080px; height:1920px; pointer-events:none; overflow:visible; }
.ck-line path { fill:none; stroke-linecap:round; }
.ck-dot { position:absolute; left:0; top:0; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, #fff6de, #f5d17a 45%, rgba(245,209,122,0)); box-shadow:0 0 30px 10px rgba(245,209,122,.45); }
.ck-ring { position:absolute; left:0; top:0; border-radius:26px; pointer-events:none;
  box-shadow:0 0 0 2px rgba(245,209,122,.75), 0 0 44px rgba(245,209,122,.45); }
`;

function chainScene() {
  const s = shotOf("05.6");
  const T0 = s.in;
  const DRAW = beat("05.6", 1);
  const HOLD = beat("05.6", 2);
  const END = s.out;
  const DRAWN = HOLD + 0.2;

  const html = () =>
    [
      `<style>${G.css}${K3.barCss}${K3.labelCss}${K3.demoCss}${css}</style>`,
      CARD.html(),
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="fk-layer" style="z-index:3"><svg class="ck-line" viewBox="0 0 1080 1920">
        <path id="ck-glow" d="${PATH}" stroke="rgba(245,209,122,.35)" stroke-width="12" style="filter:blur(6px)" pathLength="1000"/>
        <path id="ck-path" d="${PATH}" stroke="url(#ck-grad)" stroke-width="3.5" pathLength="1000"/>
        <defs><linearGradient id="ck-grad" gradientUnits="userSpaceOnUse" x1="${A[0]}" y1="${A[1]}" x2="${C[0]}" y2="${C[1]}">
          <stop offset="0" stop-color="#5edde8"/><stop offset=".45" stop-color="#d7b35f"/><stop offset="1" stop-color="#f5d17a"/></linearGradient></defs>
      </svg></div>`,
      windowHtml("PG", [PAGE.plate.name], 4),
      windowHtml("CW", [CARD.PLATE], 6),
      `<div class="ck-book-wrap" id="ck-book" style="z-index:7;visibility:hidden">${G.bookHtml("ck-book-in")}</div>`,
      ["book", "card", "page"]
        .map(
          (n) =>
            `<div class="ck-ring" id="ck-ring-${n}" style="z-index:8;visibility:hidden"></div>`,
        )
        .join(""),
      `<div class="fk-layer" style="z-index:9"><div class="ck-dot" id="ck-dot" style="visibility:hidden"></div></div>`,
      K3.demoHtml(),
      K3.labelHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // ---------------------------------------------------------------- the pull back
    const back = span(t, T0, T0 + 1.15, EASE.move);
    const pageTo = {
      rect: PAGE_RECT,
      zoom: PAGE_Z,
      // The capacity and its working, below the proposed loan check (whose verdict the film never shows).
      focus: [PAGE_CSS[0] / 2, 800],
      at: [PAGE_RECT[0] + PAGE_RECT[2] / 2, PAGE_RECT[1] + PAGE_RECT[3] / 2],
    };
    const gp = placeWindow(st, "PG", PAGE_CSS, between(PAGE_CSS, PAGE.framing, pageTo, back), [1], {
      veil: lerp(PAGE.veil, 0.05, back),
    });
    // DEMO WORKSPACE on the page, which carries no bar of its own.
    K3.demoState(st, t, { ...gp, oy: -1e6 }, { scale: lerp(1, 0.62, back) });

    // The card comes in from the right, the fact find from above.
    const cardIn = span(t, T0 + 0.25, T0 + 1.2, EASE.move);
    CARD.finalCard(st);
    const cardTo = {
      rect: CARD_RECT,
      zoom: CARD_Z,
      focus: [CARD.css[0] / 2, CARD.css[1] / 2],
      at: [CARD_RECT[0] + CARD_RECT[2] / 2, CARD_RECT[1] + CARD_RECT[3] / 2],
    };
    placeWindow(st, "CW", CARD.css, cardTo, [1], {
      opacity: span(t, T0 + 0.25, T0 + 0.55, EASE.linear),
      transform: `translateX(${px(lerp(520, 0, cardIn))}) scale(${r3(lerp(0.8, 1, cardIn))})`,
    });
    const bookIn = span(t, T0 + 0.4, T0 + 1.35, EASE.move);
    st.set("#ck-book", {
      transform: `translate(${px(BOOK[0] - 160 * (1 - bookIn))}, ${px(BOOK[1] - 380 * (1 - bookIn))}) scale(${r3(BOOK_K * lerp(0.85, 1, bookIn))}) rotate(${r3(lerp(-6, 0, bookIn))}deg)`,
      ...fade(span(t, T0 + 0.4, T0 + 0.7, EASE.linear)),
    });

    // ---------------------------------------------------------------- the line, and the light along it
    const drawn = span(t, DRAW, DRAWN, EASE.move);
    for (const id of ["ck-path", "ck-glow"])
      st.set(`#${id}`, {
        "stroke-dasharray": "1000 1000",
        "stroke-dashoffset": r3(1000 * (1 - drawn)),
      });
    const run = drawn > 0 && drawn < 1;
    const [dx, dy] = pointAt(drawn);
    st.set("#ck-dot", {
      transform: `translate(${px(dx)}, ${px(dy)})`,
      ...fade(run ? 1 : drawn >= 1 ? 1 - span(t, DRAWN, DRAWN + 0.3, EASE.linear) : 0),
    });
    // Each one catches the light as the line reaches it, and keeps a little of it while it holds.
    const rects = {
      book: [BOOK[0] - 6, BOOK[1] - 6, BOOK[2] + 12, BOOK[3] + 12],
      card: CARD_RECT,
      page: PAGE_RECT,
    };
    for (const [n, r] of Object.entries(rects)) {
      const at = DRAW + (DRAWN - DRAW) * REACH[n];
      const flash = t >= at ? Math.max(0, 1 - (t - at) / 0.6) : 0;
      const keep = 0.35 * span(t, at, at + 0.4, EASE.settle);
      st.set(`#ck-ring-${n}`, {
        transform: `translate(${px(r[0])}, ${px(r[1])})`,
        width: px(r[2]),
        height: px(r[3]),
        ...fade(Math.min(1, keep + flash)),
      });
    }

    K3.labelState(st, t, { a: T0, inAtCut: true, outAtCut: true });
    void END;
    return st;
  };

  return { id: "chain", shots: ["05.6"], palette: "aurixa", html, state };
}

module.exports = chainScene;
