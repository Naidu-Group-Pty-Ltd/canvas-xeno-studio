// NEW-TRIAL-SETUP, the trial's first minute (third cut, 11.1): "Setting up your trial workspace", three steps
// checking themselves off (Workspace created · Demo data loaded · Portals connected), then "Your 14-day trial is
// ready" with a day counter at 14 days left. Drawn in the Command Centre's own parts, as portals.cjs draws them
// from npc-client-dashboard (.ccr): its warm-black ground under a faint navy glow, Selawik, the tenant block
// (the emblem, AURIXA SYSTEMS, COMMAND CENTRE), the gold DEMO WORKSPACE pill, its near-black cards on hairline
// borders, its blue (#1238E8) and its success green (--success: 142 71% 45%); the progress ring is the report
// progress widget's (src/components/reports/progress/parts.tsx: a track and an arc, the figure inside it).
// Every name and figure on it is the demo's.
const M = require("../motion.cjs");

const { F, EASE, span, lerp, r3, px, fade, clamp01 } = M;

/** The page's size, CSS px: it is shown at zoom 1 in a G-WINDOW across the action zone. */
const SIZE = [912, 862];
const RING = { d: 176, w: 12 };
RING.r = (RING.d - RING.w) / 2;
RING.c = 2 * Math.PI * RING.r;

const ICON = {
  building: `<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>`,
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>`,
  plug: `<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  arrow: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  sparkles: `<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>`,
};
const icon = (name, colour, size = 22, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

/** The three steps, in order: the record's words. */
const STEPS = [
  ["building", "Workspace created", "Your own Command Centre, on Aurixa Systems"],
  ["database", "Demo data loaded", "Clients, properties and reports to explore"],
  ["plug", "Portals connected", "Client, finance, solicitor and builder portals"],
];

const css = `
.tsp { position:absolute; left:0; top:0; width:${SIZE[0]}px; height:${SIZE[1]}px; overflow:hidden; color:#fff;
  font-family:Selawik, "Segoe UI", sans-serif; background:radial-gradient(700px 420px at 30% 0%, rgba(24,36,100,.42), transparent 70%), #0b0c15; }
.tsp .ts-top { height:78px; display:flex; align-items:center; gap:14px; padding:0 28px; background:#131417; border-bottom:1px solid rgba(255,255,255,.06); }
.tsp .ts-top .ts-emb { width:44px; height:44px; background:center/contain no-repeat; flex:none; }
.tsp .ts-top .ts-t { font-size:16px; font-weight:700; letter-spacing:.08em; }
.tsp .ts-top .ts-s { font-size:10px; font-weight:700; letter-spacing:.24em; color:#8d95a8; margin-top:4px; }
.tsp .ts-top .ts-demo { margin-left:auto; font-size:12px; letter-spacing:.18em; font-weight:700; color:#D7B35F; border:1.5px solid rgba(215,179,95,.55); border-radius:999px; padding:7px 14px; background:rgba(200,155,60,.07); }
.tsp .ts-body { position:absolute; left:34px; right:34px; top:112px; bottom:34px; }
.tsp .ts-head { position:relative; height:196px; }
.tsp .ts-head > div { position:absolute; inset:0; }
.tsp .ts-eb { font-size:12.5px; letter-spacing:.34em; font-weight:700; color:#6d86ff; }
.tsp .ts-eb.ts-gold { color:#D7B35F; }
.tsp .ts-h1 { font-size:40px; font-weight:700; letter-spacing:-.015em; line-height:1.08; margin-top:14px; }
.tsp .ts-sub { font-size:17px; color:#9a9ba3; margin-top:14px; }
.tsp .ts-ring { position:absolute; right:6px; top:2px; width:${RING.d}px; height:${RING.d}px; }
.tsp .ts-ring svg { position:absolute; inset:0; transform:rotate(-90deg); }
.tsp .ts-ring .ts-n { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.tsp .ts-ring .ts-n b { display:block; font-size:62px; font-weight:700; line-height:1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.tsp .ts-ring .ts-n span { font-size:13px; letter-spacing:.2em; color:#c9cbd3; font-weight:700; margin-top:6px; }
.tsp .ts-bar { height:8px; border-radius:999px; background:#1a1b22; overflow:hidden; margin:6px 0 26px; }
.tsp .ts-bar i { display:block; height:100%; width:100%; border-radius:999px; transform-origin:0 50%;
  background:linear-gradient(90deg, #1238E8, #3d63ff 70%, #5EDDE8); }
.tsp .ts-steps { display:flex; flex-direction:column; gap:16px; }
.tsp .ts-step { position:relative; display:flex; align-items:center; gap:20px; height:112px; padding:0 24px; border-radius:14px;
  border:1px solid rgba(255,255,255,.10); background:#0f0f13; }
.tsp .ts-step .ts-tile { width:56px; height:56px; flex:none; border-radius:13px; display:grid; place-items:center; background:#18245a; border:1px solid rgba(80,110,255,.32); }
.tsp .ts-step .ts-a { font-size:21px; font-weight:700; }
.tsp .ts-step .ts-b { font-size:14.5px; color:#a7a7ad; margin-top:7px; }
.tsp .ts-step .ts-st { margin-left:auto; position:relative; width:150px; height:40px; flex:none; }
.tsp .ts-step .ts-st > div { position:absolute; inset:0; display:flex; align-items:center; justify-content:flex-end; gap:10px; font-size:14px; font-weight:700; }
.tsp .ts-step .ts-wait { color:#6f7079; }
.tsp .ts-step .ts-wait i { width:22px; height:22px; border-radius:50%; border:2px dashed #45464f; }
.tsp .ts-step .ts-run { color:#8ea2ff; }
.tsp .ts-step .ts-run svg { width:26px; height:26px; }
.tsp .ts-step .ts-done { color:#4ade80; }
.tsp .ts-step .ts-done i { width:30px; height:30px; border-radius:50%; background:#22c55e; display:grid; place-items:center; box-shadow:0 0 18px rgba(34,197,94,.45); }
.tsp .ts-step .ts-lit { position:absolute; inset:-1px; border-radius:14px; border:1.5px solid #1238E8; background:linear-gradient(90deg, rgba(18,56,232,.16), rgba(18,56,232,0) 70%); }
.tsp .ts-open { position:absolute; left:0; right:0; bottom:0; height:62px; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:12px;
  background:#1238E8; font-size:18px; font-weight:700; letter-spacing:.02em; box-shadow:0 10px 30px rgba(18,56,232,.45), inset 0 1px 0 rgba(255,255,255,.18); }
`;

/** The page, its ids prefixed `p`. */
function html(p = "ts") {
  const ringSvg = `<svg width="${RING.d}" height="${RING.d}" viewBox="0 0 ${RING.d} ${RING.d}">
    <defs><linearGradient id="${p}-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5D17A"/><stop offset=".55" stop-color="#D7B35F"/><stop offset="1" stop-color="#5EDDE8"/></linearGradient></defs>
    <circle cx="${RING.d / 2}" cy="${RING.d / 2}" r="${RING.r}" fill="none" stroke="#1d1e26" stroke-width="${RING.w}"/>
    <circle id="${p}-arc" cx="${RING.d / 2}" cy="${RING.d / 2}" r="${RING.r}" fill="none" stroke="url(#${p}-rg)" stroke-width="${RING.w}" stroke-linecap="round" stroke-dasharray="${r3(RING.c)}" stroke-dashoffset="${r3(RING.c)}"/></svg>`;
  const spinner = `<svg viewBox="0 0 24 24" fill="none" stroke="#6d86ff" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke="#24263a"/><path id="${p}-SPIN" d="M21 12a9 9 0 0 0-9-9"/></svg>`;
  const steps = STEPS.map(
    (
      [ic, a, b],
      i,
    ) => `<div class="ts-step" id="${p}-s${i}"><div class="ts-lit" id="${p}-lit${i}" style="visibility:hidden"></div>
      <div class="ts-tile">${icon(ic, "#8ea2ff", 26)}</div><div><div class="ts-a">${a}</div><div class="ts-b">${b}</div></div>
      <div class="ts-st"><div class="ts-wait" id="${p}-w${i}"><i></i>Waiting</div>
        <div class="ts-run" id="${p}-r${i}" style="visibility:hidden">Setting up${spinner.replace(`id="${p}-SPIN"`, `id="${p}-sp${i}"`)}</div>
        <div class="ts-done" id="${p}-d${i}" style="visibility:hidden">Done<i id="${p}-dc${i}">${icon("check", "#fff", 20, 3)}</i></div></div></div>`,
  ).join("");
  return `<div class="tsp" id="${p}">
    <div class="ts-top"><div class="ts-emb" style="background-image:url('${F.EMBLEM}')"></div><div><div class="ts-t">AURIXA SYSTEMS</div><div class="ts-s">COMMAND CENTRE</div></div><span class="ts-demo">DEMO WORKSPACE</span></div>
    <div class="ts-body">
      <div class="ts-head">
        <div id="${p}-h0"><div class="ts-eb">YOUR 14-DAY FREE TRIAL</div><div class="ts-h1">Setting up your<br>trial workspace</div><div class="ts-sub">Three steps, a few seconds.</div></div>
        <div id="${p}-h1" style="visibility:hidden"><div class="ts-eb ts-gold">TRIAL ACTIVE</div><div class="ts-h1">Your 14-day trial<br>is ready</div><div class="ts-sub">Everything is set up to explore.</div>
          <div class="ts-ring" id="${p}-ring">${ringSvg}<div class="ts-n"><b id="${p}-days">14</b><span>DAYS LEFT</span></div></div></div>
      </div>
      <div class="ts-bar"><i id="${p}-bar"></i></div>
      <div class="ts-steps">${steps}</div>
      <div class="ts-open" id="${p}-open" style="visibility:hidden">Open your Command Centre${icon("arrow", "#fff", 22, 2.4)}</div>
    </div>
  </div>`;
}

/**
 * The page at t: step i is set up over [run[i], done[i]] (a spinner, then the check landing); the header turns to
 * the trial being ready at `ready`, where the ring draws round to its 14 days and the button rises in.
 */
function state(st, t, p, { run, done, ready }) {
  // The progress bar: each step's share filling as it is set up, to the full bar on the last check.
  let filled = 0;
  STEPS.forEach((_, i) => {
    const part = span(t, run[i], done[i], EASE.move);
    filled += part / STEPS.length;
  });
  st.set(`#${p}-bar`, { transform: `scaleX(${r3(Math.max(0.012, filled))})` });
  STEPS.forEach((_, i) => {
    const running = t >= run[i] && t < done[i];
    const isDone = t >= done[i];
    st.set(`#${p}-w${i}`, fade(t < run[i] ? 1 : 0));
    st.set(`#${p}-r${i}`, fade(running ? 1 : 0));
    st.set(`#${p}-sp${i}`, {
      transform: `rotate(${r3(((t - run[i]) * 420) % 360)}deg)`,
      "transform-origin": "12px 12px",
    });
    // The check lands: up from nothing, a touch over, then settles; its glow fades back.
    const c = span(t, done[i], done[i] + 0.28, EASE.settle);
    const pop = isDone
      ? 0.55 + 0.45 * c + 0.18 * Math.sin(Math.PI * clamp01((t - done[i]) / 0.28))
      : 0;
    st.set(`#${p}-d${i}`, { ...fade(isDone ? span(t, done[i], done[i] + 0.1, EASE.linear) : 0) });
    st.set(`#${p}-dc${i}`, { transform: `scale(${r3(pop)})` });
    // The step being set up is lit in the Command Centre's blue (its selected card), the light leaving as it ends.
    const lit = running
      ? span(t, run[i], run[i] + 0.12, EASE.linear)
      : isDone
        ? 1 - span(t, done[i], done[i] + 0.3, EASE.move)
        : 0;
    st.set(`#${p}-lit${i}`, fade(lit));
  });
  // Ready: the header turns over, the ring draws round, the days count up to 14, the button rises in.
  const h = span(t, ready, ready + 0.36, EASE.settle);
  st.set(`#${p}-h0`, { ...fade(1 - h), transform: `translateY(${px(-18 * h)})` });
  st.set(`#${p}-h1`, { ...fade(h), transform: `translateY(${px(18 * (1 - h))})` });
  // The ring is the trial's fourteen days, whole: it draws round to full, and the 14 inside it lands with it.
  const ring = span(t, ready + 0.1, ready + 0.62, EASE.move);
  st.set(`#${p}-arc`, { "stroke-dashoffset": `${r3(RING.c * (1 - ring))}` });
  const n = span(t, ready + 0.12, ready + 0.45, EASE.settle);
  st.set(`#${p}-days`, { transform: `scale(${r3(lerp(0.6, 1, n))})`, opacity: r3(n) });
  st.set(`#${p}-ring`, {
    transform: `scale(${r3(lerp(0.86, 1, span(t, ready, ready + 0.5, EASE.settle)))})`,
  });
  const o = span(t, ready + 0.25, ready + 0.6, EASE.settle);
  st.set(`#${p}-open`, { ...fade(o), transform: `translateY(${px(16 * (1 - o))})` });
}

module.exports = { SIZE, css, html, state, STEPS };
