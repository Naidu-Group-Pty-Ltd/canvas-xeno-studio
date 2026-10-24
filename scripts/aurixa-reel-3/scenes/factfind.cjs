// Reel 3, shots 04.1 and 04.2: one simple client questionnaire captures and organises their information, seamlessly
// populating their client card. The product's questionnaire is its white-label Client Fact Find workbook, imported in
// one go (PLAN.md 6.1), so that is what the film shows, from the product's own screens (captures/20-clients.cjs) and
// the workbook's own cells (../g-factfind.cjs):
//  - 04.1. On the cut Jordan's fact find lands, filled in, on the navy: the Client Fact Find sheet, its title, the
//    workbook's "Client Financial Position & Fact Find" and Jordan's answers, each glinting as the light reaches it.
//    On "questionnaire" it drops into Add New Client, Advanced, on its Excel Import tab: the dropzone flares and the
//    file card comes up, "Workbook selected". The camera crosses to Parse Excel Sheet and the pointer presses it on
//    "captures": "Import successful". The camera pulls back and the import's seven count tiles lift out of the file
//    card, one a beat, into a grid large enough to read, each counting up to what the import found (1, 1, 1, 3, 2,
//    21 and no warnings) as it lands; on "organises" the last of them land and the light crosses them.
//  - 04.2. The tiles go back into the card and the camera comes to Create Client, which the pointer presses on
//    "seamlessly". The dialog closes and Client Management comes up with Jordan Ellis' card assembling, top to
//    bottom, under a line of light; on "populating" the fact find's figures (the base salary, the car loan, the
//    credit card, the rent and the living expenses, each as the workbook holds it) fly out of the workbook into the
//    card; on "card" it settles, complete.
// Out of frame throughout: everything GoHighLevel on Client Management (the subtitle, the import, the sync, the
// pending count and the card's sync chip: the card is framed from its name to View details) and the file card's
// MIME type (the camera keeps to the file card's right half until the tiles take the frame).
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const G = require("../g-factfind.cjs");

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
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

const MODAL = ["clients-add-empty", "clients-add-selected", "clients-add-parsed-top"];
const MODAL_BAR = { portal: "COMMAND CENTRE", page: "Client Management", emblem: F.EMBLEM };
const CARD_PAGE = ["clients-management"];
const CARD_BAR = MODAL_BAR;
const CARD = K3.screen("clients-card");
/** Where the card capture sits on Client Management (it is the page's own card, captured with 12 px of page round it). */
const CARD_AT = [12, 550];
/** The card itself on Client Management. */
const CARD_BOX = K3.region("clients-management", "card");
/** Client Management's ground round the card, measured on the capture. */
const PAGE_GROUND = "#0b0c14";

/** The dialog's window, and its camera's framings ({ z, c }: the zoom and the screen point it centres). */
const W_RECT = [54, 330, 972, 960];
const C_DROP = { z: 1.06, c: [485.3, 433.5] }; // the header, the tabs and the dropzone, Excel Import on the left
const C_RIGHT = { z: 1.12, c: [960, 560] }; // the file card's right half (clear of its MIME type), Parse Excel Sheet and Create Client
const C_WIDE = { z: 0.76, c: [691.2, 470] }; // the whole dialog, all seven tiles
/** Client Management's window: Jordan's card from its name to View details. */
const W2_RECT = [117, 660, 846, 614];
const D_IN = { z: 1.6, c: [250, 689.5] }; // the view ends at y 852, just above the card's sync chip (859)
const D_END = { z: 1.66, c: [250, 695.5] };

/** The figures' list over the card: its first row's top and the gap between rows. */
const LIST_TOP = 878;
const LIST_GAP = 12;
/** The tiles' grid, in the frame: two rows (four, then three), each tile at T_SCALE of the product's size. */
const T_SCALE = 1.42;
const T_GAP = 16;
const T_TOP = 713;
const gridAt = (k) => {
  const [, , w, h] = G.TILES[k].box;
  const row = k < 4 ? 0 : 1;
  const inRow = row ? 3 : 4;
  const i = row ? k - 4 : k;
  const total = inRow * w * T_SCALE + (inRow - 1) * T_GAP;
  return [540 - total / 2 + i * (w * T_SCALE + T_GAP), T_TOP + row * (h * T_SCALE + T_GAP)];
};
/** A tile's box in the dialog as the window shows it (parsed-top: the file card unscrolled, its tiles at y 762). */
const tileInDialog = (k) => {
  const [x, , w, h] = G.TILES[k].box;
  return [x, K3.region("clients-add-parsed-top", "tileApplicantsFound")[1], w, h];
};

const centreOf = ([x, y, w, h]) => [x + w / 2, y + h / 2];

function factfindScene() {
  const s1 = shotOf("04.1");
  const s2 = shotOf("04.2");
  const [A0, A1, A2, A3] = [0, 1, 2, 3].map((i) => beat("04.1", i));
  const [B0, B1, B2] = [0, 1, 2].map((i) => beat("04.2", i));
  const END = s2.out;
  if (s1.out > B0) throw new Error("04.2's press comes before its shot");
  const checked = G.verifyWorkbook();
  console.log(`factfind: the workbook's cells are ${checked}`);

  // ---------------------------------------------------------------- times
  // The workbook: lands on the cut, its answers glinting; drops into the dropzone on "questionnaire" (A1).
  const LAND = [A0, A0 + 0.66];
  const GLINT = (k) => A0 + 0.42 + k * 0.085;
  const DROP = [A1 - 0.2, A1 + 0.1];
  const W_IN = [A1 - 0.4, A1 - 0.16];
  // The dialog: the file card on the drop; across to Parse Excel Sheet, pressed on "captures" (A2).
  const SELECTED = A1 + 0.07;
  const TO_PARSE = [A1 + 0.04, A2 - 0.15];
  const PARSED = A2 + 0.03;
  // The tiles: out of the card one a beat, landing from A2 + 0.47; the last three on "organises" (A3).
  const TO_WIDE = [A2 + 0.03, A2 + 0.39];
  const LIFT = (k) => A2 + 0.11 + 0.07 * k;
  const FLY = 0.36;
  const COUNT = 0.28;
  const SWEEP = [A3 + 0.36, A3 + 0.86];
  const EXIT = (k) => A3 + 0.95 + 0.035 * k;
  const EXIT_FOR = 0.26;
  const TO_CREATE = [A3 + 0.95, A3 + 1.55];
  // Create Client on "seamlessly" (B0); the card; the figures on "populating" (B1); settled on "card" (B2).
  const W_OUT = [B0 + 0.06, B0 + 0.48];
  const W2_IN = [B0 + 0.12, B0 + 0.56];
  const REVEAL = [B0 + 0.25, B0 + 0.85];
  const MINI_IN = [B0 + 0.2, B0 + 0.55];
  // The figures: dealt out of the workbook into a list over the card on "populating", read, then taken into it.
  const DEAL = (k) => B1 - 0.04 + 0.06 * k;
  const DEAL_FOR = 0.3;
  const DIVE = (k) => B1 + 0.6 + 0.08 * k;
  const DIVE_FOR = 0.28;
  const MINI_OUT = [DIVE(0), DIVE(4) + 0.2];
  const SETTLE = [B2, B2 + 0.7];

  // ---------------------------------------------------------------- the page
  const html = () =>
    [
      `<style>${K3.barCss}${G.css}
.ff-sheen { position:absolute; top:0; bottom:0; width:42%; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(100deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.34) 50%, rgba(255,240,205,0) 100%); }
.ff-gridglow { position:absolute; left:-60px; width:1200px; top:${T_TOP - 210}px; height:700px; pointer-events:none;
  background:radial-gradient(50% 42% at 50% 50%, rgba(215,179,95,.13), rgba(94,221,232,.05) 45%, rgba(4,11,22,0) 72%); }
.ff-rim { position:absolute; box-sizing:border-box; border-radius:16px; pointer-events:none; border:2px solid #f5d17a;
  box-shadow:0 0 0 5px rgba(215,179,95,.16), 0 0 46px rgba(215,179,95,.45); }
.ff-cardsheen { position:absolute; overflow:hidden; border-radius:16px; pointer-events:none; }
.ff-cardsheen i { position:absolute; top:-20%; bottom:-20%; width:36%; left:0; mix-blend-mode:screen;
  background:linear-gradient(100deg, rgba(255,240,205,0), rgba(255,240,205,.22) 50%, rgba(255,240,205,0)); transform:skewX(-14deg); }
</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      // The dialog, its dropzone's flare drawn on its page.
      G.screenWinHtml("W", MODAL, {
        bar: MODAL_BAR,
        z: 4,
        inside: `<i class="ff-flash" id="flash" style="visibility:hidden"></i>`,
      }),
      // Client Management, Jordan's card on it: the page's spot for the card, the card over it, the line that draws
      // it, its rim and its sheen.
      G.screenWinHtml("W2", CARD_PAGE, {
        bar: CARD_BAR,
        z: 4,
        pageBg: PAGE_GROUND,
        inside: [
          `<i style="position:absolute;left:${CARD_AT[0]}px;top:${CARD_AT[1]}px;width:${CARD.css[0]}px;height:${CARD.css[1]}px;background:${PAGE_GROUND}"></i>`,
          `<div id="card" style="position:absolute;left:${CARD_AT[0]}px;top:${CARD_AT[1]}px;width:${CARD.css[0]}px;height:${CARD.css[1]}px"><img src="${CARD.src}" alt="" style="position:absolute;left:0;top:0;width:${CARD.css[0]}px;height:${CARD.css[1]}px"></div>`,
          `<i class="ff-scan" id="scan" style="left:${CARD_BOX[0] - 6}px;width:${CARD_BOX[2] + 12}px;top:0;visibility:hidden"></i>`,
          `<i class="ff-rim" id="rim" style="left:${CARD_BOX[0]}px;top:${CARD_BOX[1]}px;width:${CARD_BOX[2]}px;height:${CARD_BOX[3]}px;visibility:hidden"></i>`,
          `<div class="ff-cardsheen" style="left:${CARD_BOX[0]}px;top:${CARD_BOX[1]}px;width:${CARD_BOX[2]}px;height:${CARD_BOX[3]}px"><i id="csheen" style="visibility:hidden"></i></div>`,
        ].join(""),
      }),
      // The workbook (it lands, then drops into the dialog), and its small copy the figures fly out of.
      `<div class="ff-persp" style="z-index:8">${G.bookHtml("book", { glints: true })}<div id="bsheen-clip" style="position:absolute;left:0;top:0;width:${G.BOOK_W}px;height:${G.BOOK_H}px;overflow:hidden;border-radius:16px;visibility:hidden"><i class="ff-sheen" id="bsheen"></i></div></div>`,
      `<div class="ff-persp" style="z-index:6">${G.bookHtml("mini")}</div>`,
      // The count tiles, and the light that crosses them.
      `<div class="fk-layer" style="z-index:20"><i class="ff-gridglow" id="gridglow" style="visibility:hidden"></i>${G.tilesHtml("tile")}</div>`,
      // The figures, and their bursts on the card.
      `<div class="fk-layer" style="z-index:25">${G.chipsHtml("chip")}${G.FIGURES.map((_, k) => `<i class="ff-burst" id="burst-${k}" style="visibility:hidden"></i>`).join("")}</div>`,
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  // ---------------------------------------------------------------- the state at t
  /** The dialog's camera at t. */
  const modalCam = (t) => {
    if (t < TO_PARSE[0]) return C_DROP;
    if (t < TO_WIDE[0]) return G.camBetween(C_DROP, C_RIGHT, span(t, ...TO_PARSE, EASE.move));
    if (t < TO_CREATE[0]) return G.camBetween(C_RIGHT, C_WIDE, span(t, ...TO_WIDE, EASE.move));
    return G.camBetween(C_WIDE, C_RIGHT, span(t, ...TO_CREATE, EASE.move));
  };
  const cardCam = (t) => G.camBetween(D_IN, D_END, span(t, W2_IN[0], END, EASE.settle));

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // The dialog.
    const wIn = span(t, ...W_IN, EASE.settle);
    const wOut = span(t, ...W_OUT, EASE.move);
    const toSelected = span(t, SELECTED, SELECTED + 0.08, EASE.linear);
    const toParsed = span(t, PARSED, PARSED + 0.08, EASE.linear);
    const veil =
      0.7 *
      span(t, LIFT(0), LIFT(0) + 0.3, EASE.move) *
      (1 - span(t, EXIT(0), EXIT(6) + EXIT_FOR, EASE.move));
    const g = G.screenWinState(st, "W", MODAL, {
      rect: W_RECT,
      cam: modalCam(t),
      layers: [1 - toSelected, toSelected * (1 - toParsed), toParsed],
      veil,
      opacity: wIn * (1 - wOut),
      transform: `translateY(${px(lerp(30, 0, wIn) - 34 * wOut)}) scale(${r3(1 - 0.06 * wOut)})`,
    });
    // The dropzone flares as the workbook lands in it.
    const dz = K3.region("clients-add-empty", "dropzone");
    const flare =
      span(t, A1 - 0.02, A1 + 0.08, EASE.settle) * (1 - span(t, A1 + 0.12, A1 + 0.5, EASE.linear));
    st.set("#flash", {
      left: px(dz[0]),
      top: px(dz[1]),
      width: px(dz[2]),
      height: px(dz[3]),
      ...fade(flare),
    });

    // The workbook: lands, glints, drops into the dropzone.
    const land = span(t, ...LAND, EASE.settle);
    const drop = span(t, ...DROP, EASE.move);
    const rest = [540, 778];
    const into = G.camera(K3.screen(MODAL[0]).css, W_RECT, C_DROP.z, C_DROP.c).map(centreOf(dz));
    const at = lerp2(rest, into, drop);
    const scale =
      lerp(1.06, 1, land) *
      lerp(1, 1.02, span(t, LAND[1], DROP[0], EASE.move)) *
      lerp(1, 0.13, drop);
    // Already there on the cut, coming down onto the navy: never a blank frame after the logo.
    const bookO =
      lerp(0.35, 1, span(t, A0, A0 + 0.16, EASE.linear)) *
      (1 - span(t, DROP[1] - 0.07, DROP[1] + 0.02, EASE.linear));
    st.set("#book", {
      transform: `translate(${px(at[0] - G.BOOK_W / 2)}, ${px(at[1] - G.BOOK_H / 2 + lerp(-170, 0, land))}) rotateX(${r3(lerp(16, 0, land))}deg) rotateZ(${r3(-4 * drop)}deg) scale(${r3(scale)})`,
      ...fade(bookO),
    });
    G.FILLED.forEach((_, k) => {
      const u = (t - GLINT(k)) / 0.5;
      st.set(`#book-g${k}`, fade(u > 0 && u < 1 ? 0.95 * Math.sin(Math.PI * u) : 0));
    });
    // A light across the sheet as its answers glint.
    const bs = span(t, GLINT(0) - 0.1, GLINT(6) + 0.45, EASE.move);
    st.set("#bsheen-clip", {
      transform: `translate(${px(at[0] - G.BOOK_W / 2)}, ${px(at[1] - G.BOOK_H / 2 + lerp(-170, 0, land))}) rotateX(${r3(lerp(16, 0, land))}deg) rotateZ(${r3(-4 * drop)}deg) scale(${r3(scale)})`,
      "transform-origin": "50% 50%",
      ...fade(bs > 0 && bs < 1 ? bookO : 0),
    });
    st.set("#bsheen", { transform: `translateX(${px(lerp(-0.5, 1.2, bs) * G.BOOK_W)})` });

    // The count tiles: out of the card, into the grid, counting; the light crosses them; they go.
    st.set(
      "#gridglow",
      fade(
        span(t, LIFT(0) + 0.1, LIFT(6) + FLY, EASE.settle) *
          (1 - span(t, EXIT(0), EXIT(6) + EXIT_FOR, EASE.move)),
      ),
    );
    const sweep = span(t, ...SWEEP, EASE.move);
    const sweepX = lerp(-320, 1400, sweep);
    G.TILES.forEach((tile, k) => {
      const [sx, sy, sw] = g.mapRect(tileInDialog(k));
      const p = span(t, LIFT(k), LIFT(k) + FLY, EASE.move);
      const exit = span(t, EXIT(k), EXIT(k) + EXIT_FOR, EASE.move);
      const [gx, gy] = gridAt(k);
      const x = lerp(sx, gx, p);
      const y = lerp(sy, gy, p) - 40 * Math.sin(Math.PI * p) - 14 * exit;
      const sc = lerp(sw / tile.box[2], T_SCALE, p) * lerp(1, 0.94, exit);
      st.set(`#tile-${k}`, {
        transform: `translate(${px(x)}, ${px(y)}) scale(${r3(sc)})`,
        ...fade(span(t, LIFT(k), LIFT(k) + 0.12, EASE.linear) * (1 - exit)),
      });
      const landed = LIFT(k) + FLY;
      const c = span(t, landed - 0.06, landed - 0.06 + COUNT, EASE.settle);
      st.set(`#tile-${k}-n`, { $text: String(Math.round(tile.n * c)) });
      const lit = (t - landed) / 0.5;
      st.set(
        `#tile-${k}-l`,
        fade(lit > -0.1 && lit < 1 ? Math.min(1, (lit + 0.1) / 0.1) * (1 - Math.max(0, lit)) : 0),
      );
      st.set(`#tile-${k}-s`, {
        transform: `translateX(${px((sweepX - gx) / T_SCALE - 60)})`,
        ...fade(sweep > 0 && sweep < 1 ? 1 : 0),
      });
    });

    // The pointer: to Parse Excel Sheet, pressed on "captures"; then to Create Client, pressed on "seamlessly".
    const right = G.camera(K3.screen(MODAL[0]).css, W_RECT, C_RIGHT.z, C_RIGHT.c);
    if (t < A3) {
      const to = right.map(centreOf(K3.region("clients-add-selected", "parse")));
      pointer(st, t, {
        from: [to[0] + 230, to[1] + 300],
        to: [to[0] - 18, to[1] + 6],
        a: TO_PARSE[0] + 0.04,
        b: A2 - 0.08,
        show: TO_PARSE[0] + 0.02,
        hide: A2 + 0.1,
        press: A2,
      });
    } else {
      const to = right.map(centreOf(K3.region("clients-add-parsed-top", "createClient")));
      pointer(st, t, {
        from: [to[0] + 190, to[1] + 260],
        to: [to[0] - 22, to[1] + 6],
        a: TO_CREATE[1] - 0.28,
        b: B0 - 0.08,
        show: TO_CREATE[1] - 0.3,
        hide: B0 + 0.2,
        press: B0,
      });
    }

    // Client Management: Jordan's card assembles, top to bottom, under its line of light.
    const w2 = span(t, ...W2_IN, EASE.settle);
    const g2 = G.screenWinState(st, "W2", CARD_PAGE, {
      rect: W2_RECT,
      cam: cardCam(t),
      layers: [1],
      opacity: w2,
      transform: `translateY(${px(lerp(46, 0, w2))})`,
    });
    const rev = span(t, ...REVEAL, EASE.move);
    st.set("#card", { "clip-path": `inset(0 0 ${r3((1 - rev) * 100)}% 0)` });
    st.set("#scan", {
      transform: `translateY(${px(CARD_AT[1] + rev * CARD.css[1])})`,
      ...fade(rev > 0 && rev < 1 ? Math.min(1, rev / 0.08, (1 - rev) / 0.08) : 0),
    });
    // Settled on "card": a rim of light and a sheen across it.
    const settle = span(t, ...SETTLE, EASE.linear);
    st.set("#rim", fade(settle > 0 && settle < 1 ? Math.sin(Math.PI * settle) : 0));
    st.set("#csheen", {
      transform: `translateX(${px(lerp(-0.45, 1.25, span(t, SETTLE[0] - 0.05, SETTLE[1] - 0.1, EASE.move)) * CARD_BOX[2])}) skewX(-14deg)`,
      ...fade(settle > 0 && settle < 1 ? 1 : 0),
    });

    // The workbook again, small, above the card: the figures fly out of it into the card.
    const mIn = span(t, ...MINI_IN, EASE.settle);
    const mOut = span(t, ...MINI_OUT, EASE.move);
    const mini = 0.36 * lerp(0.86, 1, mIn);
    const mc = [540, 470 + lerp(18, 0, mIn) - 26 * mOut];
    st.set("#mini", {
      transform: `translate(${px(mc[0] - G.BOOK_W / 2)}, ${px(mc[1] - G.BOOK_H / 2)}) rotateZ(${r3(lerp(-3, -1.5, mIn))}deg) scale(${r3(mini)})`,
      ...fade(mIn * (1 - mOut)),
    });
    const into2 = g2.map([CARD_BOX[0] + CARD_BOX[2] / 2, CARD_BOX[1] + 128]);
    // The list: every figure on one left edge, centred on the longest; one under another over the card.
    const widest = Math.max(...m.chips.map((c) => c[2]));
    const listX = 540 - widest / 2;
    G.FIGURES.forEach((_, k) => {
      const [, , w, h] = m.chips[k];
      const deal = span(t, DEAL(k), DEAL(k) + DEAL_FOR, EASE.settle);
      const dive = span(t, DIVE(k), DIVE(k) + DIVE_FOR, EASE.move);
      const fromC = [mc[0], mc[1] + 30];
      const slotC = [listX + w / 2, LIST_TOP + k * (h + LIST_GAP) + h / 2];
      const toC = [into2[0] + (k - 2) * 40, into2[1] + (k % 2 ? 16 : -12)];
      const c = dive > 0 ? lerp2(slotC, toC, dive) : lerp2(fromC, slotC, deal);
      // A small arc on the way out, so the list is dealt rather than slid.
      const arc = dive > 0 ? 0 : -36 * Math.sin(Math.PI * deal);
      const sc = dive > 0 ? lerp(1, 0.32, dive) : lerp(0.5, 1, deal);
      const o =
        t < DEAL(k)
          ? 0
          : Math.min(
              span(t, DEAL(k), DEAL(k) + 0.08, EASE.linear),
              1 - span(t, DIVE(k) + DIVE_FOR * 0.7, DIVE(k) + DIVE_FOR, EASE.linear),
            );
      st.set(`#chip-${k}`, {
        transform: `translate(${px(c[0] - w / 2)}, ${px(c[1] - h / 2 + arc)}) rotate(${r3((k % 2 ? -2.5 : 2.5) * (1 - deal))}deg) scale(${r3(sc)})`,
        ...fade(o),
      });
      const b = (t - (DIVE(k) + DIVE_FOR * 0.85)) / 0.42;
      st.set(`#burst-${k}`, {
        transform: `translate(${px(toC[0])}, ${px(toC[1])}) scale(${r3(lerp(0.35, 1.15, Math.max(0, Math.min(1, b))))})`,
        ...fade(b > 0 && b < 1 ? 0.8 * (1 - b) : 0),
      });
    });
    return st;
  };

  return {
    id: "factfind",
    shots: ["04.1", "04.2"],
    palette: "aurixa",
    html,
    state,
    // Each figure's size as drawn, so the list can share one left edge.
    measure: { chips: [".fk", ".ff-chip", true] },
  };
}

module.exports = factfindScene;
