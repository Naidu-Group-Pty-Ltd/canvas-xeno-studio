// Reel 1, shot 03.1: the market moves, the client waits.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  r3,
  px,
  State,
  fade,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
  KIT,
} = M;

// ------------------------------------------------------------------ the clock
// It starts to run on Monday 9:14 and runs faster as the days go: F03 (22.4 s) reads Tuesday 4:12 pm, and by the
// time everything clears it reads Wednesday. Minutes past Monday 9:14, u seconds in: a u + b u².
const CLOCK_FROM = 17.6;
const CLOCK_TO = 23.867;
const RATE = [136.58, 52.21];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];
/** The clock's reading at t: it ticks six times a second, each reading held around its own moment, so F03's
 * (22.4 s) is held either side of it and its frame reads crisply, whatever the shutter takes in. */
function clockText(t) {
  const tq = 22.4 + Math.round((Math.min(Math.max(t, CLOCK_FROM), CLOCK_TO) - 22.4) * 6) / 6;
  const u = Math.min(Math.max(tq, CLOCK_FROM), CLOCK_TO) - CLOCK_FROM;
  const minutes = 9 * 60 + 14 + Math.floor(RATE[0] * u + RATE[1] * u * u);
  const day = DAYS[Math.floor(minutes / 1440)];
  const h = Math.floor((minutes % 1440) / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  return `${day} ${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "am" : "pm"}`;
}
const clockHtml = (text) =>
  KIT.clock(36, 392, `<span id="clock-t">${text}</span>`).replace(
    'class="fk-clock"',
    'class="fk-clock" id="clock"',
  );

// ------------------------------------------------------------------ the client's question, unanswered
// PL-03C, its status as the brief words it: sent on Monday at 9:14, and no reply yet. The plate draws the
// line in the sent tick's green, which reads as good news; waiting is said in the window's own muted ink.
const question = () =>
  F.plate("PL-03C", (html) => {
    const status = 'color:#16794b;font-weight:700">Sent · no reply yet<';
    if (!html.includes(status)) throw new Error("PL-03C's status line has changed");
    return html.replace(status, 'color:#64748b;font-weight:600">Sent Monday 9:14 · No reply yet<');
  });
// As 01.2 left it (A01's framing), then the slow push in to the question and its status.
const Q0 = { rect: [40, 520, 1000, 560], zoom: 0.9, focus: [675, 420], at: [540, 830] };
const Q1 = { rect: [40, 520, 1000, 560], zoom: 1.12, focus: [720, 330], at: [540, 830] };

/** G-WINDOW holding plates given as { html, css }, as motion.windowHtml lays them. */
const windowOf = (id, plates, z) =>
  `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page">${plates
    .map(
      (p, n) =>
        `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px">${p.html}</div>`,
    )
    .join("")}<div class="fk-veil" id="${id}-veil"></div></div></div>`;

/**
 * The four tools hold where 02.1 left them (F02); the desktop clock starts to run; the listing slides back in
 * over them, its enquiries ticking up and two chips setting in; notifications arrive from every edge and nudge
 * the windows apart, to F03 (frames.cjs) at 22.4 s; then everything clears but the client's question, Sent
 * Monday 9:14 · No reply yet, the clock reading Wednesday, and the camera pushes slowly in to it as the frame
 * dims toward dark.
 */
function waitsScene() {
  const [tHold, tListing, tNotes, tClear, tDim] = [0, 1, 2, 3, 4].map((i) => beat("03.1", i));
  const tOut = M.shotOf("03.1").out; // the shot's end, 25.867 s
  const F02 = F.FRAMES.F02.draw();
  const F03 = F.FRAMES.F03.draw();
  // The four tools: F03's windows, each starting at its F02 place (the nudge takes it to F03's).
  const WIN = [
    { f02: [400, 470], f03: [560, 384], size: [650, 360] },
    { f02: [30, 640], f03: [-240, 560], size: [660, 340] },
    { f02: [470, 836], f03: [660, 900], size: [580, 300] },
    { f02: [120, 990], f03: [-170, 1020], size: [780, 290] },
  ];
  // The notifications, as F03 sets them (0.86 of their size), each from its own edge.
  const NOTES = [
    { key: "mail", at: [326, 366], from: [0, -566] },
    { key: "chat", at: [640, 650], from: [470, 0] },
    { key: "calendar", at: [-150, 770], from: [-440, 0] },
    { key: "plan", at: [700, 980], from: [410, 0] },
    { key: "crm", at: [150, 1166], from: [0, 774] },
  ];
  const q = question();

  const html = () =>
    [
      `<div class="fk-layer" id="wm">${F02[0]}</div>`,
      ...WIN.map((w, i) => {
        const [x, y] = w.f03;
        return `<div class="fk-layer" id="w${i}" style="transform-origin:${x + w.size[0] / 2}px ${y + w.size[1] / 2}px">${F03[i]}</div>`;
      }),
      F03[4].replace(
        '<div style="position:absolute;left:240px;top:552px;',
        '<div id="lst" style="position:absolute;left:240px;top:552px;',
      ),
      `<div class="fk-layer" style="z-index:9">${NOTES.map(
        ({ key, at: [x, y] }) =>
          `<div id="n-${key}" style="position:absolute;left:${x}px;top:${y}px;transform:scale(.86);transform-origin:0 0">${KIT.note(key, 0, 0)}</div>`,
      ).join("")}</div>`,
      windowOf("Q", [q], 12),
      clockHtml(clockText(CLOCK_FROM)),
      `<style>#lst .ls-chips { overflow:hidden; }</style>`,
      `<div class="fk-veil" id="dim" style="z-index:30;opacity:0"></div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // 02.1's pointer, in the empty report, gives way as the shot settles.
    pointer(st, t, {
      from: [600, 1150],
      to: [600, 1150],
      a: tHold,
      b: tHold + 0.01,
      show: -1,
      hide: tHold + 0.25,
    });

    // The clock: it comes up in the corner and runs.
    const clockIn = span(t, tHold + 0.05, tHold + 0.4, EASE.settle);
    st.set("#clock", { transform: `translateY(${px((1 - clockIn) * -10)})`, ...fade(clockIn) });
    st.set("#clock-t", { $text: clockText(t) });

    // The windows: held, nudged apart by the notifications (F02 to F03), then cleared.
    const nudge = span(t, tNotes + 0.02, tNotes + 0.8, EASE.move);
    const clear = (k) => span(t, tClear + 0.06 + k * 0.03, tClear + 0.4 + k * 0.03, EASE.move);
    WIN.forEach((w, i) => {
      const dx = (w.f02[0] - w.f03[0]) * (1 - nudge);
      const dy = (w.f02[1] - w.f03[1]) * (1 - nudge);
      const c = clear(i + 1);
      st.set(`#w${i}`, {
        transform: `translate(${px(dx)}, ${px(dy + c * 26)}) scale(${r3(1 - 0.04 * c)})`,
        ...fade(1 - c),
      });
    });
    // The empty report's caret blinks on, in step with 02.1's (from 0.45 s after the report opened there).
    const since = t - (M.beat("02.1", 4) + 0.45);
    st.set("#w3 .fk-caret", { opacity: Math.floor(since / 0.53) % 2 === 0 ? "1" : "0" });
    // The inbox, under them all, is pushed off to the upper left by the arrivals.
    const away = span(t, tNotes + 0.02, tNotes + 0.7, EASE.move);
    st.set("#wm", {
      transform: `translate(${px(away * -260)}, ${px(away * -60)})`,
      ...fade(1 - span(t, tNotes + 0.1, tNotes + 0.6, EASE.move)),
    });

    // The listing slides back in over them; its enquiries tick up and two chips set in, the row opening.
    const slide = span(t, tListing, tListing + 0.7, EASE.settle);
    const out = clear(0);
    st.set("#lst", {
      transform: `translate(${px((1 - slide) * 900)}, ${px(out * 26)}) scale(${r3(1 - 0.04 * out)})`,
      ...fade(Math.min(span(t, tListing, tListing + 0.12, EASE.linear), 1 - out)),
    });
    const enquiries = Math.round(lerp(9, 27, span(t, tListing + 0.35, tNotes - 0.25, EASE.move)));
    st.set("#lst .ls-addr", { $text: `${enquiries} enquiries` }, 1);
    const row = span(t, tListing + 0.5, tListing + 0.86, EASE.settle);
    st.set("#lst .ls-chips", { height: px(m.chips[3] * row), "margin-top": px(-8 * (1 - row)) });
    [tListing + 0.56, tListing + 1.0].forEach((a, i) => {
      const chip = span(t, a, a + 0.34, EASE.settle);
      st.set("#lst .ls-chip", { transform: `translateY(${px((1 - chip) * 6)})`, ...fade(chip) }, i);
    });

    // The notifications, from every edge, one after another; cleared first.
    NOTES.forEach(({ key, from }, i) => {
      const a = tNotes + i * 0.12;
      const p = span(t, a, a + 0.6, EASE.settle);
      const c = span(t, tClear, tClear + 0.32, EASE.move);
      st.set(`#n-${key}`, {
        transform: `translate(${px(from[0] * (1 - p) + from[0] * 0.06 * c)}, ${px(from[1] * (1 - p) + from[1] * 0.06 * c)}) scale(.86)`,
        ...fade(Math.min(span(t, a, a + 0.1, EASE.linear), 1 - c)),
      });
    });

    // The client's question, alone: it comes forward as the rest clears, and the camera pushes slowly in.
    const shown = span(t, tClear + 0.12, tClear + 0.55, EASE.settle);
    const push = span(t, tClear + 0.2, tOut, EASE.move);
    placeWindow(st, "Q", q.css, between(q.css, Q0, Q1, push), [1], {
      opacity: shown,
      transform: `scale(${r3(lerp(0.97, 1, shown))})`,
    });

    // The frame dims toward dark, evenly (an opacity, as the renderer's cross-fades are): 04.1 opens on this
    // frame under its own veil (.78) and goes on to the brand's navy from there.
    st.set("#dim", fade(0.78 * span(t, tDim, tOut, EASE.linear)));
    return st;
  };
  return {
    id: "waits",
    shots: ["03.1"],
    palette: "before",
    html,
    // The listing's chips row, at its own height.
    measure: { chips: ["#lst", ".ls-chips"] },
    state,
  };
}

module.exports = waitsScene;
/** 03.1's last state before its dim, as layers: the question, pushed in, and the clock on Wednesday. */
module.exports.finalLayers = () => [
  KIT.shot({ plate: question(), ...Q1 }).html,
  clockHtml(clockText(CLOCK_TO)),
];
