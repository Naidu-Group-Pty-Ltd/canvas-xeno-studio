// Reel 1, shot 08.2: what the client is trusting you with. The report again, further into the Investment
// Compass, the camera running through its pages in depth (G-PAGE-SCROLL) as it did in 05.2, on a different
// stretch: how this grade was reached (A+ on its dial, the five dimensions as bars, every one scored, and the
// marker settling under the composite, 84), then the suburb at a glance, rental comparables and the risk
// dashboard, each held long enough to read and each drawing its figures as it lands (NEW-REPORT-CHARTS). None
// of these pages appears in 05.2.
const M = require("../motion.cjs");
const { beat, shotOf, EASE, span, lerp, r3, State, fade, captionHtml, caption, F } = M;
const reportCharts = require("../pages/reportCharts.cjs");
const reportDeck = require("../pages/reportDeck.cjs");

function pagesScene() {
  const RC = reportCharts({ P: F.asset("P.png"), EMBLEM: F.EMBLEM });
  const KEYS = ["grade", "suburb", "comparables", "risk"];
  // A little smaller than 05.2's, so that what each page is about (the composite and its marker, the places
  // within reach, the last risk) stands clear of the captions without the camera having to scroll to it.
  const deck = reportDeck({ RC, keys: KEYS, id: "deck", width: 820, top: 330, rise: 0.39 });

  // The shot's times, from the brief's beats: the grade page comes in on the cut and is read longest, its
  // figures drawing as it lands; the others follow on the brief's run of pages.
  const [t0, tRun] = [0, 1].map((i) => beat("08.2", i));
  const end = shotOf("08.2").out;
  // Each page is read for 0.9 s or more, counting the settle of its arrival, and leaves in half a second; the
  // grade's marker is held a moment before the run moves on, and the last move is the slowest.
  const LAND = [t0 + 0.36, t0 + 1.943, tRun - 0.1, end - 0.733];
  const MOVE = [0, 0.5, 0.5, 0.55];
  const LEAVE = LAND.map((l, k) => (k + 1 < LAND.length ? LAND[k + 1] - MOVE[k + 1] : end));
  const STOPS = [
    [t0, -0.32],
    [LAND[0], 0, EASE.settle],
  ];
  LAND.forEach((l, k) => {
    if (k) STOPS.push([l, k]);
    STOPS.push([LEAVE[k], k + (k === LAND.length - 1 ? 0.015 : 0.03)]);
  });
  // How far each page scrolls up while it is read (frame px): the camera rides it.
  const RIDE = [-26, -24, -20, -24];
  const rideSpan = [
    [t0 + 0.4, LEAVE[0] + 0.2],
    ...LAND.slice(1).map((l, k) => [l - 0.05, LEAVE[k + 1] + 0.2]),
  ];

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      deck.html(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const c = deck.camera(t, STOPS, EASE.move);
    deck.place(st, c, {
      ride: (i) => RIDE[i] * EASE.move(span(t, rideSpan[i][0], rideSpan[i][1], EASE.linear)),
    });

    // How this grade was reached: the dial sweeps to 84 as its number counts, the five dimensions fill in
    // turn with their scores and what each contributes, and the marker settles under the composite.
    const sweep = span(t, t0 + 0.1, t0 + 0.8, EASE.move);
    const composite = RC.figures.COMPOSITE;
    st.set("#rc-g-arc", {
      "stroke-dashoffset": String(r3(1.001 * (1 - (sweep * composite) / 100))),
    });
    st.set("#rc-g-num", { $text: String(Math.round(composite * sweep)) });
    RC.figures.DIMENSIONS.forEach((_, i) => {
      const a = t0 + 0.2 + i * 0.06;
      st.set(`#rc-g-bar-${i}`, { transform: `scaleX(${r3(span(t, a, a + 0.45, EASE.settle))})` });
      st.set(`#rc-g-score-${i}`, fade(span(t, a + 0.27, a + 0.43, EASE.linear)));
      st.set(`#rc-g-part-${i}`, fade(span(t, a + 0.33, a + 0.49, EASE.linear)));
    });
    st.set("#rc-g-mark", {
      transform: `scaleX(${r3(span(t, t0 + 0.8, t0 + 1.12, EASE.settle))})`,
    });

    // The suburb at a glance: the line out from the lot reaches each place in turn; the owners fill in.
    const a1 = LAND[1] - 0.25;
    const reach = span(t, a1, a1 + 0.52, EASE.linear);
    st.set("#rc-sb-reach", { transform: `scaleX(${r3(EASE.settle(reach))})` });
    RC.reachAlong.forEach((f, i) => {
      const p = span(t, a1 + 0.52 * f - 0.12, a1 + 0.52 * f + 0.1, EASE.settle);
      st.set(`#rc-sb-stop-${i}`, { transform: `scale(${r3(lerp(0.3, 1, p))})`, ...fade(p) });
    });
    for (let k = 0; k < 10; k++) {
      const p = span(t, a1 + k * 0.035, a1 + k * 0.035 + 0.2, EASE.settle);
      st.set(".rc-sb-home", { transform: `scale(${r3(lerp(0.5, 1, p))})`, ...fade(p) }, k);
    }

    // Rental comparables: the leases fill, longest first, each with its rent.
    const a2 = LAND[2] - 0.25;
    for (let i = 0; i < 7; i++) {
      const a = a2 + i * 0.035;
      st.set(`#rc-cp-bar-${i}`, { transform: `scaleX(${r3(span(t, a, a + 0.36, EASE.settle))})` });
      st.set(`#rc-cp-val-${i}`, fade(span(t, a + 0.24, a + 0.38, EASE.linear)));
    }

    // The risk dashboard: each risk's level fills in, row by row.
    const a3 = LAND[3] - 0.22;
    RC.riskMeters.forEach((n, i) => {
      for (let k = 0; k < n; k++) {
        const a = a3 + i * 0.045 + k * 0.05;
        st.set(`#rc-rk-${i}-${k}`, {
          transform: `scaleX(${r3(span(t, a, a + 0.18, EASE.settle))})`,
        });
      }
    });
    return st;
  };

  return { id: "pages", shots: ["08.2"], palette: "aurixa", html, state };
}

module.exports = pagesScene;
