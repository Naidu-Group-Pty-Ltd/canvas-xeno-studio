// Reel 1, shot 05.2: into a report the client can understand. Generated Reports, the pointer on 14 Wattle
// Grove's card; the press lifts the client's report out of the card and brings it forward, the library falling
// away behind it, and then the camera runs through the report's pages in depth (G-PAGE-SCROLL): the Financial
// Analysis's cover with its A+, its key figures, capital growth and the ten-year cash flow, each held long
// enough to read its headline figure and each drawing its chart as it lands, the run slowing on the cash flow
// as its last column settles on the music's beat. None of these pages appears in 08.2 (NEW-REPORT-CHARTS).
const M = require("../motion.cjs");
const {
  beat,
  shotOf,
  EASE,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  placeWindow,
  throughRect,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  railHtml,
  F,
} = M;
const { MUSIC } = require("../pacing.cjs");
const reportCharts = require("../pages/reportCharts.cjs");
const reportDeck = require("../pages/reportDeck.cjs");

/** The music's beat n (n = 0 is the drop), on the film's clock. */
const onBeat = (n) => MUSIC.film_drop + n * MUSIC.period;

function deliverableScene() {
  const css = F.plate("PL-05C-a").css;
  const RC = reportCharts({ P: F.asset("P.png"), EMBLEM: F.EMBLEM });
  const KEYS = ["cover", "keyFigures", "growth", "cashFlow"];
  const deck = reportDeck({ RC, keys: KEYS, id: "deck", width: 860, top: 380 });
  const [SW, SH] = RC.A4;

  // The shot's times, from the brief's beats and the music's.
  const [t0, tLift, tRun, tSlow] = [0, 1, 2, 3].map((i) => beat("05.2", i));
  const end = shotOf("05.2").out;
  const press = t0 + 0.2;
  const liftA = Math.min(press + 0.06, tLift - 0.2);
  const liftB = liftA + 0.58;
  // Each page lands, is read (0.9 s or more, counting the settle of its arrival), and leaves for the next in
  // half a second; the last move is the slowest, and the last column settles on the music's beat.
  const LAND = [liftB, tRun - 0.227, tRun + 1.053, tSlow + 0.233];
  const MOVE = [0, 0.52, 0.52, 0.54];
  const LEAVE = LAND.map((l, k) => (k + 1 < LAND.length ? LAND[k + 1] - MOVE[k + 1] : end));
  const STOPS = [[liftB, 0]];
  LAND.forEach((l, k) => {
    if (k) STOPS.push([l, k]);
    STOPS.push([LEAVE[k], k + (k === LAND.length - 1 ? 0.015 : 0.035)]);
  });
  // How far each page scrolls up while it is read (frame px): the camera rides it.
  const RIDE = [0, -40, -54, -30];
  const railOut = [LEAVE[0] - 0.36, LEAVE[0] - 0.06];

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-05C-a"], 2),
      deck.html(),
      railHtml("rail-a", "Financial"),
      railHtml("rail-b", "Report"),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // Generated Reports, the pointer on 14 Wattle Grove's card. As the report comes forward the library falls
    // back and away.
    const start = {
      rect: [40, 384, 1000, 892],
      zoom: 1,
      focus: [m.start + 486, 432],
      at: [540, 830],
    };
    const away = span(t, liftA, liftB, EASE.move);
    const recede = lerp(1, 0.94, away);
    const g = placeWindow(st, "W", css, start, [1], {
      opacity: 1 - span(t, liftA + 0.18, liftB, EASE.linear),
      veil: 0.55 * away,
      transform: `scale(${recede.toFixed(6)})`,
    });
    // The window's own scale is about its centre: a point on the page, as the frame now sees it.
    const wc = [start.rect[0] + start.rect[2] / 2, start.rect[1] + start.rect[3] / 2];
    const seen = ([x, y]) => [wc[0] + (x - wc[0]) * recede, wc[1] + (y - wc[1]) * recede];

    // The rail moves to Report as the press lands, and leaves as the run begins.
    const moved = span(t, press + 0.05, press + 0.4, EASE.move);
    const out = 1 - span(t, railOut[0], railOut[1], EASE.linear);
    st.set("#rail-a", fade((1 - moved) * out));
    st.set("#rail-b", fade(moved * out));

    // The pointer settles on the card and presses it.
    const at0 = g.map(m.card);
    pointer(st, t, {
      from: [at0[0] + 12, at0[1] + 10],
      to: at0,
      a: t0,
      b: t0 + 0.16,
      show: t0 - 1,
      hide: liftA + 0.04,
      press,
    });

    // G-DOCUMENT: the cover rises out of the card, turning square to the camera as it comes forward, into
    // the run's first place.
    const card = throughRect(g, m.cards[0]);
    const [ca, cb] = [seen([card[0], card[1]]), seen([card[0] + card[2], card[1] + card[3]])];
    const from = {
      c: [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2],
      scale: ((cb[1] - ca[1]) * 1.04) / SH,
    };
    const home = deck.at(0, 0);
    const to = {
      c: [home.x + (SW * home.scale) / 2, home.y + (SH * home.scale) / 2],
      scale: home.scale,
    };
    const override = {};
    if (t < liftB) {
      const u = span(t, liftA, liftB, EASE.settle);
      const c = lerp2(from.c, to.c, EASE.move(span(t, liftA, liftB, EASE.linear)));
      override[0] = {
        cx: c[0],
        cy: c[1],
        scale: zoomLerp(from.scale, to.scale, u),
        rotate: lerp(-6, 0, u),
        opacity: span(t, liftA, liftA + 0.07, EASE.linear),
        veil: 0.35 * (1 - u),
      };
    }

    // The run: the camera through the pages, each page riding up a little while it is read.
    const c = deck.camera(t, STOPS, EASE.move);
    deck.place(st, c, {
      override,
      peek: span(t, railOut[0] + 0.12, railOut[1] + 0.12, EASE.linear),
      ride: (i) => RIDE[i] * EASE.move(span(t, LAND[i] - 0.05, LEAVE[i] + 0.2, EASE.linear)),
    });

    // The cover's grade arrives with it.
    const seal = span(t, liftB - 0.16, liftB + 0.22, EASE.settle);
    st.set("#rc-cover-seal", {
      transform: `scale(${r3(lerp(0.82, 1, seal))})`,
      "transform-origin": "50% 50%",
      ...fade(seal),
    });

    // Key figures: the bars fill and the ten years draw as the page lands.
    const a1 = LAND[1] - 0.24;
    const draw1 = span(t, a1, a1 + 0.62, EASE.settle);
    st.set("#rc-kf-spark", { "stroke-dashoffset": String(r3(1.001 * (1 - draw1))) });
    st.set("#rc-kf-spark-end", fade(span(t, a1 + 0.5, a1 + 0.66, EASE.linear)));
    st.set("#rc-kf-yield", {
      transform: `scaleX(${r3(span(t, a1 + 0.04, a1 + 0.5, EASE.settle))})`,
    });
    st.set("#rc-kf-dep", { transform: `scaleX(${r3(span(t, a1, a1 + 0.34, EASE.settle))})` });
    st.set("#rc-kf-loan", {
      transform: `scaleX(${r3(span(t, a1 + 0.12, a1 + 0.5, EASE.settle))})`,
    });
    const rent = span(t, a1 + 0.06, a1 + 0.46, EASE.settle);
    st.set("#rc-kf-rent", { transform: `translateX(${px(-70 * (1 - rent))})`, ...fade(rent) });

    // Capital growth: the line draws across the ten years, each year's point arriving as the line reaches it,
    // and the headline counts with it.
    const a2 = LAND[2] - 0.36;
    const draw2 = span(t, a2, a2 + 0.62, EASE.linear);
    const along = EASE.settle(draw2);
    st.set("#rc-cg-line", { "stroke-dashoffset": String(r3(1.001 * (1 - along))) });
    st.set("#rc-cg-area", { "fill-opacity": String(r3(0.13 * span(t, a2 + 0.16, a2 + 0.72))) });
    RC.growthAlong.forEach((f, i) => {
      const on = along >= f - 1e-6 ? 1 : 0;
      st.set(`#rc-cg-dot-${i}`, fade(on));
    });
    const grown = Math.round(RC.figures.TEN_YEAR * 100 * along);
    st.set("#rc-cg-hero", { $text: `+${grown}%` });
    const pill = span(t, a2 + 0.56, a2 + 0.76, EASE.settle);
    st.set("#rc-cg-pill", { transform: `translateY(${px(8 * (1 - pill))})`, ...fade(pill) });

    // The ten-year cash flow: the columns rise one after another, the last settling on the beat.
    const settle = onBeat(52);
    const COL = 0.3;
    const STAGGER = 0.03;
    const first = settle - COL - 10 * STAGGER;
    RC.figures.POSITION.forEach((_, i) => {
      const a = first + i * STAGGER;
      const p = span(t, a, a + COL, EASE.settle);
      st.set(`#rc-cf-col-${i}`, { transform: `scaleY(${r3(p)})` });
      st.set(`#rc-cf-lab-${i}`, fade(span(t, a + COL - 0.1, a + COL + 0.06, EASE.linear)));
    });
    return st;
  };

  return {
    id: "deliverable",
    shots: ["05.2"],
    palette: "aurixa",
    html,
    measure: {
      cards: ["#W-0", ".qrcard", true],
      col: ["#W-0", ".qcards"],
    },
    derive(m) {
      const c = m.cards[0];
      return { ...m, card: [c[0] + c[2] * 0.5, c[1] + 44], start: m.col[0] - 10 };
    },
    state,
  };
}

module.exports = deliverableScene;
