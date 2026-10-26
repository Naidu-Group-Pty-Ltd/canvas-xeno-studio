// Reel 3, shot 06.4: and generate professional reports that turn numbers into meaningful decisions. Report pages as
// charts, from the client's notes on Reel 1.
//  - The cut lands on the Borrowing Capacity page's Results panel (the product's own, drawn by the screens harness):
//    its Export PDF, and under it the assessment being exported, BORROWING CAPACITY $1,049,786. On "generate" the
//    pointer presses Export PDF.
//  - The Borrowing Capacity Snapshot comes out of the press: the product's own document, drawn by its route and render
//    container from the request the page sends (snapshot-scen). Its cover, Jordan Ellis, lands on "reports".
//  - On "that turn" its pages run past the camera, and on "numbers" page 2 stops: Capacity at a glance lifts off it,
//    the $920,000 loan its bar (the bar running out to its length), the stress-tested and assessed limits its named
//    lines, the headroom written under it.
//  - On "meaningful" the rest run past to page 7, and on "decisions" Scenario comparison lifts off it: the base and
//    the three scenarios with their capacities, the car loan's row lit, the one 07 hands over.
// Kept out of frame, by where the camera cuts each page or by the page being too small and veiled to read: the
// Results panel's loan check (its verdict word), page 2's lede (what Jordan can borrow) and its Serviceability
// column, page 7's Serviceability column and the purchase-power lines under the table, and the cover's date (it fades
// into the cover's own dark above its meta row).
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const G = require("../g-chosen.cjs");

const {
  shotOf,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
  placeWindow,
  pointerHtml,
  captionHtml,
  caption,
  F,
} = M;

const BAR = { portal: "COMMAND CENTRE", page: "Borrowing Capacity", emblem: F.EMBLEM };
const APPBAR = G.barPlate(770, BAR);
// The Results panel's head (Choose template, Export PDF), above its loan check; and the capacity card under that.
const HEADER = G.crop("bc-calc-export", { x0: 732, y0: 242, x1: 1430, y1: 308 });
const CAPACITY = G.crop("bc-calc-export", { x0: 757, y0: 495, x1: 1405, y1: 647 });

const Z = { bar: 1.3, header: 1.42, capacity: 1.5 };
const BAR_AT = G.centred(APPBAR.css, Z.bar, 376);
const HEADER_AT = G.centred(HEADER.css, Z.header, 524);
const CAPACITY_AT = G.centred(CAPACITY.css, Z.capacity, 668);

// The Snapshot: the cover as it lands, and the pages as they run (frame px, and frame px per PDF point).
const COVER = { c: [540, 748], s: 1.176 };
const RUN = { c: [540, 760], s: 0.82, gap: 400, far: 260, turn: 38 };
const PAGES = [1, 2, 3, 4, 5, 6, 7, 8];
// What lifts off them (PDF points): Capacity at a glance's chart with its caption, from 13 pt left of the page's
// margin so the caption has the card's own margin; the modelled scenarios, cut left of the Serviceability column.
const CHART = { page: 2, k: 1, crop: [38, 398, 425, 516], s: 2.54, top: 562 };
const TABLE = { page: 7, k: 6, crop: [45, 196, 368, 386], s: 2.72, top: 596 };
const BAR_RECT = [64, 436.2, 214.9, 16.9]; // the loan's bar (page 2, points)
const ROW_LIT = [51, 320.2, 317, 24.5]; // the car loan repaid row (page 7, points)

function snapshotScene() {
  const s = shotOf("06.4");
  const T0 = s.in;
  const END = s.out;
  const w = (text, after) => G.word(text, after).at;
  const tGenerate = w("generate", T0 - 0.1);
  const tReports = w("reports", tGenerate);
  const tThat = w("that", tReports);
  const tNumbers = w("numbers", tThat);
  const tMeaningful = w("meaningful", tNumbers);
  const tDecisions = w("decisions", tMeaningful);
  const tPress = tGenerate + 0.01;
  const tFly = tPress + 0.06; // the cover leaves the button
  const tLand = tReports - 0.12; // and is up

  const liftHtml = (L, id, marks) =>
    G.liftHtml(
      id,
      L.page,
      L.crop,
      marks
        .map(
          ({ cls, id: mid, style }) =>
            `<div class="${cls}" id="${mid}" style="${style ?? ""}"></div>`,
        )
        .join(""),
    );

  const html = () =>
    [
      `<style>${K3.barCss}${K3.labelCss}${G.css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("AB", [APPBAR.name], 9),
      windowHtml("HR", [HEADER.name], 8),
      windowHtml("CP", [CAPACITY.name], 7),
      `<div class="c6-stage" style="z-index:10">`,
      PAGES.map((n) =>
        n === 1
          ? G.sheetHtml(`sh-${n}`, G.pageSrc(n), [640, 702])
          : G.sheetHtml(`sh-${n}`, G.softSrc("snapshot", n)),
      ).join(""),
      `</div>`,
      `<div class="fk-layer" style="z-index:20">`,
      G.eyeHtml("ey-chart", "Capacity at a glance"),
      G.eyeHtml("ey-table", "Scenario comparison"),
      liftHtml(CHART, "lf-chart", [{ cls: "m", id: "lf-chart-m", style: "background:#E9E5DD" }]),
      liftHtml(TABLE, "lf-table", [{ cls: "hl", id: "lf-table-hl" }]),
      G.sweepHtml("sw-cap"),
      G.sweepHtml("sw-row"),
      `</div>`,
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  // The pages' run: where page k is when page `u` is in front.
  const run = (t) => {
    const a = span(t, tThat, tNumbers - 0.02, EASE.move);
    const b = span(t, tMeaningful - 0.04, tDecisions - 0.08, EASE.move);
    return lerp(0, CHART.k, a) + (TABLE.k - CHART.k) * b;
  };
  const placeInRun = (k, u) => {
    const d = k - u;
    const ad = Math.abs(d);
    const near = Math.min(ad, 1);
    const x = RUN.c[0] + Math.sign(d) * (RUN.gap * near + RUN.far * Math.max(0, ad - 1));
    return {
      c: [x, RUN.c[1]],
      s: RUN.s * (1 - 0.16 * near),
      turn: -Math.max(-1, Math.min(1, d)) * RUN.turn,
      z: -220 * Math.min(ad, 1.5),
      veil: 0.2 + 0.66 * near,
      opacity: 1 - Math.max(0, Math.min(1, ad - 1.9)),
      order: Math.round(100 - ad * 10),
    };
  };
  // A lifted card's frame rect: from where its crop sits on its page in the run, to its own place.
  const liftRect = (L, p) => {
    const [x0, y0, x1, y1] = L.crop;
    const pageTL = [RUN.c[0] - (G.PAGE[0] * RUN.s) / 2, RUN.c[1] - (G.PAGE[1] * RUN.s) / 2];
    const from = [pageTL[0] + x0 * RUN.s, pageTL[1] + y0 * RUN.s, RUN.s];
    const to = [540 - ((x1 - x0) * L.s) / 2, L.top, L.s];
    const k = M.zoomLerp(from[2], to[2], p);
    return [lerp(from[0], to[0], p), lerp(from[1], to[1], p), k];
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    K3.labelState(st, t, { a: T0, inAtCut: true, outAtCut: true });

    // ---------------------------------------------------------------- the Results panel and the press
    const away = span(t, tPress + 0.14, tPress + 0.62, EASE.move);
    const recede = {
      opacity: 1 - away,
      transform: `translateY(${px(-46 * away)}) scale(${r3(1 - 0.06 * away)})`,
    };
    placeWindow(st, "AB", APPBAR.css, BAR_AT, [1], recede);
    const push = lerp(0.96, 1, span(t, T0, tPress, EASE.settle));
    const hf = G.centred(HEADER.css, Z.header * push, HEADER_AT.rect[1]);
    placeWindow(st, "HR", HEADER.css, hf, [1], recede);
    placeWindow(st, "CP", CAPACITY.css, CAPACITY_AT, [1], {
      opacity: 1 - away,
      transform: `translateY(${px(30 * away)}) scale(${r3(1 - 0.06 * away)})`,
    });
    const capFig = G.toFrame(
      G.geometry(CAPACITY.css, CAPACITY_AT),
      Z.capacity,
      CAPACITY.at([775, 530, 300, 52]),
    );
    G.sweepState(st, t, "sw-cap", capFig, T0 + 0.02, T0 + 0.5);
    const exportAtPress = (() => {
      const f = G.centred(HEADER.css, Z.header, HEADER_AT.rect[1]);
      return G.centreOf(G.toFrame(G.geometry(HEADER.css, f), f.zoom, HEADER.at("exportPdf")));
    })();
    G.pointerPath(st, t, {
      start: [860, 1010],
      moves: [
        {
          to: [exportAtPress[0] + 4, exportAtPress[1] + 6],
          a: T0 + 0.02,
          b: tPress - 0.03,
          bow: 0.12,
        },
      ],
      presses: [tPress],
      show: T0,
      hide: tPress + 0.3,
    });

    // ---------------------------------------------------------------- the Snapshot
    const u = run(t);
    const fly = span(t, tFly, tLand, EASE.move);
    const landed = span(t, tLand - 0.1, tLand + 0.3, EASE.settle);
    for (const n of PAGES) {
      const k = n - 1;
      const r = placeInRun(k, u);
      let c = r.c;
      let sc = r.s;
      let turn = r.turn;
      let z = r.z;
      let veil = r.veil;
      let opacity = r.opacity;
      let tilt = 0;
      let roll = 0;
      if (k === 0) {
        // The cover: out of the button, up to its place, then into the run.
        const into = span(t, tThat, tNumbers - 0.02, EASE.move);
        const hold = lerp(1, 1.024, span(t, tLand, tThat, EASE.linear));
        const coverC = lerp2(exportAtPress, COVER.c, EASE.settle(fly));
        const coverS = M.zoomLerp(0.05, COVER.s * hold, fly);
        c = lerp2(coverC, r.c, into);
        sc = lerp(coverS, r.s, into);
        turn = lerp(lerp(28, 0, fly), r.turn, into);
        tilt = lerp(46, 0, EASE.settle(fly)) * (1 - into);
        roll = lerp(-9, 0, EASE.settle(fly)) * (1 - into);
        z = lerp(0, r.z, into);
        veil = lerp(0, r.veil, into);
        opacity = span(t, tFly, tFly + 0.12, EASE.linear) * r.opacity;
      } else {
        // The pages behind it come up as it lands.
        opacity *= span(t, tLand - 0.05, tLand + 0.35, EASE.linear);
      }
      // A page that a card lifts off is veiled under it.
      if (k === CHART.k)
        veil = Math.max(
          veil,
          0.62 *
            span(t, tNumbers, tNumbers + 0.3, EASE.linear) *
            (1 - span(t, tMeaningful - 0.04, tMeaningful + 0.2, EASE.linear)),
        );
      if (k === TABLE.k)
        veil = Math.max(veil, 0.62 * span(t, tDecisions - 0.04, tDecisions + 0.26, EASE.linear));
      if (k > TABLE.k) veil = Math.max(veil, 0.9);
      G.sheetState(st, `sh-${n}`, {
        c,
        s: sc,
        turn,
        z,
        tilt,
        roll,
        veil: k === 0 && t < tThat ? 0 : veil,
        opacity,
        glint: k === 0 ? span(t, tLand - 0.05, tLand + 0.6, EASE.move) : null,
      });
      st.set(`#sh-${n}`, { "z-index": String(k === 0 && t < tThat ? 200 : r.order) });
    }

    // ---------------------------------------------------------------- Capacity at a glance, lifted
    {
      const L = CHART;
      const lift = span(t, tNumbers + 0.02, tNumbers + 0.42, EASE.move);
      const out = span(t, tMeaningful - 0.06, tMeaningful + 0.16, EASE.move);
      const [x, y, k] = liftRect(L, lift);
      const on = t >= tNumbers - 0.01 && out < 1;
      st.set("#lf-chart", {
        transform: `translate(${px(x)}, ${px(y - 40 * out)}) scale(${r3(k * (1 - 0.06 * out))})`,
        ...fade(on ? 1 - out : 0),
      });
      // The bar: it fades as the card lifts, then runs out from $0 to its length.
      const grow = span(t, tNumbers + 0.36, tNumbers + 0.9, EASE.settle);
      const [bx, by, bw, bh] = BAR_RECT;
      st.set("#lf-chart-m", {
        left: px(bx - L.crop[0] + bw * grow),
        top: px(by - L.crop[1] - 0.6),
        width: px(bw * (1 - grow) + 1.2),
        height: px(bh + 1.2),
        opacity: r3(span(t, tNumbers + 0.04, tNumbers + 0.24, EASE.linear)),
      });
      G.eyeState(st, t, "ey-chart", [70, 380], tNumbers + 0.2, tMeaningful + 0.08);
    }

    // ---------------------------------------------------------------- Scenario comparison, lifted
    {
      const L = TABLE;
      const lift = span(t, tDecisions - 0.04, tDecisions + 0.36, EASE.move);
      const [x, y, k] = liftRect(L, lift);
      const hold = lerp(1, 1.02, span(t, tDecisions + 0.36, END, EASE.linear));
      const kk = k * hold;
      const w = (L.crop[2] - L.crop[0]) * kk;
      const xx = x - ((hold - 1) * (L.crop[2] - L.crop[0]) * k) / 2;
      const on = t >= tDecisions - 0.05;
      st.set("#lf-table", {
        transform: `translate(${px(xx)}, ${px(y)}) scale(${r3(kk)})`,
        ...fade(on ? 1 : 0),
      });
      // The car loan repaid row lit: the scenario 07 hands over.
      const lit = span(t, tDecisions + 0.42, tDecisions + 0.72, EASE.settle);
      const [rx, ry, rw, rh] = ROW_LIT;
      st.set("#lf-table-hl", {
        left: px(rx - L.crop[0] - 4),
        top: px(ry - L.crop[1]),
        width: px((rw + 4) * lit),
        height: px(rh),
        ...fade(lit),
      });
      const rowFrame = [
        xx + (rx - L.crop[0]) * kk,
        y + (ry - L.crop[1]) * kk,
        Math.min(rw * kk, w),
        rh * kk,
      ];
      G.sweepState(st, t, "sw-row", rowFrame, tDecisions + 0.46, tDecisions + 0.98);
      G.eyeState(st, t, "ey-table", [70, 380], tDecisions + 0.16, END + 1);
    }
    return st;
  };

  return {
    id: "snapshot",
    shots: ["06.4"],
    palette: "aurixa",
    html,
    state,
    bake: () => PAGES.filter((n) => n !== 1).map((n) => G.softBake("snapshot", n)),
  };
}

module.exports = snapshotScene;
