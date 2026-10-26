// Reel 3, shot 11.1: Aurixa Systems has arrived, and has been built by property professionals for property
// professionals. On the first bar of National Treasures' biggest section (bar 65, a frame after the cut) a flash
// opens at the frame's heart and the living logo (Reel 1's take B1, ../g-lockup.cjs: the supplied art's own scene,
// its lettering exact) comes out of it at the viewer, faster as it comes, and lands on the bar's second beat with a
// shock ring, sparks and a streak of light (../../aurixa-reel-1/pages/light.cjs); it overshoots a breath and settles,
// the footage's own light moving across it. AURIXA rises letter by letter as "Aurixa" is said, SYSTEMS on its word;
// on "arrived" a light crosses the wordmark and the emblem's glow swells. On "built" the line sets in under the
// lockup word by word on the spoken words, in the captions' face, its last "property professionals" in the gold
// italic with its rule drawing out and the light crossing it once. No captions: the line is the type.
// ./trial.cjs carries the lockup on from exactly where this leaves it (REST, restScale) and takes the line away.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const PACE = require("../pacing.cjs");
const L = require("../../aurixa-reel-1/pages/light.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const C = require("../g-cta.cjs");
const G = require("../g-lockup.cjs");

const { shotOf, EASE, span, lerp, r3, px, State, fade, clamp01, captionHtml, caption } = M;

const WORDS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../../docs/brands/aurixa-reel-3/voiceover-words.json"),
    "utf8",
  ),
).words.map((w) => ({
  ...w,
  key: w.text.toLowerCase().replace(/[^a-z0-9]/g, ""),
  start: PACE.word(w.start),
  end: PACE.word(w.end),
}));
/** The spoken word `key`, the first at or after `from` (film clock). */
const spoken = (key, from) => {
  const w = WORDS.find((x) => x.start >= from - 1e-6 && x.key === key);
  if (!w) throw new Error(`11.1: no spoken "${key}" after ${from}`);
  return w;
};

/** The lockup at rest: the art at K CSS px an art px (the emblem 530 px wide), its emblem's centre at REST. */
const K = 0.78;
const REST = [540, 666];
const SHOT = shotOf("11.1");
const T0 = SHOT.in;
const END = SHOT.out;
/** The slow push across the held lockup, about its emblem: ./trial.cjs takes it on from here. */
const PUSH = { from: 122.1, k: 0.025 };
const restScale = (t) => 1 + PUSH.k * clamp01((t - PUSH.from) / (END - PUSH.from));

/** The line under the lockup: two lines, in the captions' face; the last two words its emphasis. */
const LINE = [
  ["Built", "by", "property", "professionals"],
  ["for", "property", "professionals."],
];
const EM_LINE = 1;
const EM_FROM = 1; // "property professionals." on the second line
const LINE_TOP = 1194;
const ENTER = 0.5;

const css = `
.av-glow { position:absolute; left:0; top:0; width:1240px; height:1240px; margin:-620px 0 0 -620px; transform-origin:50% 50%; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(circle, rgba(245,209,122,.34) 0%, rgba(200,155,60,.14) 38%, rgba(200,155,60,0) 68%); }
.av-rays { position:absolute; left:0; top:0; width:1700px; height:1700px; margin:-850px 0 0 -850px; transform-origin:50% 50%; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:repeating-conic-gradient(from 0deg, rgba(255,236,190,0) 0deg 7deg, rgba(255,236,190,.42) 8.5deg 9.5deg, rgba(255,236,190,0) 11deg 18deg);
  -webkit-mask-image:radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,.5) 34%, transparent 50%);
  mask-image:radial-gradient(circle, rgba(0,0,0,0) 14%, #000 22%, rgba(0,0,0,.5) 34%, transparent 50%); }
.av-expose { position:absolute; inset:0; background:#fff3dc; mix-blend-mode:screen; pointer-events:none; }
.av-line { position:absolute; left:40px; right:40px; top:${LINE_TOP}px; display:flex; flex-direction:column; align-items:center; gap:4px; }
.av-line .t { font:500 56px/1.18 "Aurixa Caption", "Playfair Display", serif; letter-spacing:-.012em; white-space:nowrap; }
.av-line .w { display:inline-block; visibility:hidden; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff 8%, #c6cedb 68%, #fff); padding:.06em .12em .14em; margin:-.06em -.12em -.14em; }
.av-line .em { position:relative; display:inline-block; white-space:nowrap; }
.av-line .w.g { font-style:italic; background-image:linear-gradient(105deg, rgba(255,247,222,0) 0%, rgba(255,247,222,.9) 50%, rgba(255,247,222,0) 100%),
  linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%);
  background-size:0 100%, 100% 100%; background-repeat:no-repeat; background-position:-9999px 0, 0 0; }
.av-line .ul { position:absolute; left:.1em; right:.1em; bottom:-.02em; height:3px; transform:scaleX(0); transform-origin:0 50%; visibility:hidden;
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.2)); }
`;

/** The line's markup (ids av-w<line>-<word>, the emphasis's rule av-ul): ./trial.cjs draws it too, to take it away. */
const lineHtml = () =>
  `<div class="av-line" id="av-line" style="z-index:12">${LINE.map(
    (words, i) =>
      `<div class="t">${words
        .map((w, j) =>
          i === EM_LINE && j === EM_FROM
            ? `<span class="em">${words
                .slice(EM_FROM)
                .map((x, jj) => `<span class="w g" id="av-w${i}-${EM_FROM + jj}">${x}</span>`)
                .join(" ")}<i class="ul" id="av-ul"></i></span>`
            : i === EM_LINE && j > EM_FROM
              ? ""
              : `<span class="w" id="av-w${i}-${j}">${w}</span>`,
        )
        .filter(Boolean)
        .join(" ")}</div>`,
  ).join("")}</div>`;

/** When each word of the line lands: on its spoken time, a touch ahead (as Reel 2's statements land). */
const LINE_AT = (() => {
  let from = 123.5;
  return LINE.map((words) =>
    words.map((w) => {
      const s = spoken(w.toLowerCase().replace(/[^a-z0-9]/g, ""), from);
      from = s.end - 0.02;
      return Math.max(T0, s.start - 0.08);
    }),
  );
})();
const EM_AT = LINE_AT[EM_LINE][EM_FROM];
const EM_LAST = LINE_AT[EM_LINE].at(-1);

/** The line at t: each word rising into place out of a blur; `leave` (0 to 1) takes it down and away. */
function lineState(st, t, leave = 0) {
  st.set("#av-line", {
    transform: `translateY(${px(36 * leave)})`,
    filter: leave > 0.01 ? `blur(${r3(6 * leave)}px)` : "none",
    opacity: r3(1 - leave),
  });
  LINE.forEach((words, i) =>
    words.forEach((_, j) => {
      const a = LINE_AT[i][j];
      const u = span(t, a, a + ENTER, EASE.settle);
      const blur = (1 - u) * 10;
      const glow = "drop-shadow(0 2px 18px rgba(4,11,22,.75))";
      const props = {
        ...fade(span(t, a, a + ENTER * 0.6, EASE.settle)),
        transform: `translateY(${px((1 - u) * 26)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px) ${glow}` : glow,
      };
      if (i === EM_LINE && j >= EM_FROM) {
        // The light crosses the emphasis once its last word is in.
        const sweep = span(t, EM_LAST + ENTER * 0.5, EM_LAST + ENTER * 0.5 + 1.0, EASE.move);
        props["background-size"] = "70% 100%, 100% 100%";
        props["background-position"] = `${r3(-240 + sweep * 580)}% 0, 0 0`;
      }
      st.set(`#av-w${i}-${j}`, props);
    }),
  );
  const drawn = span(t, EM_AT + ENTER * 0.4, EM_LAST + 0.6, EASE.move);
  st.set("#av-ul", { transform: `scaleX(${r3(drawn)})`, ...fade(Math.min(1, drawn * 4)) });
}

/** The launch (the bar's downbeat, a frame after the cut) and the landing (its second beat). */
// The launch is drawn from the cut's own frame, the bar's downbeat a frame later: a flash a frame ahead of its hit
// reads as on it, and the shot never opens on an empty frame.
const LAUNCH_AT = () => T0;

/** The emblem's light behind the lockup: a gold glow and slowly turning rays, about its burst point. */
const auraHtml = () =>
  `<div class="av-rays" id="rays" style="z-index:1;visibility:hidden"></div><div class="av-glow" id="glow" style="z-index:2;visibility:hidden"></div>`;
/**
 * The aura at t, for the lockup scaled `s` with its emblem's centre at `c`: up with the landing, swelling once on
 * "arrived", breathing on the bars; `rays` and `glow` (0 to 1) take each away.
 */
function auraState(st, t, { s, c, tArrived, rays = 1, glow = 1 }) {
  const land = C.lastBeat(Math.max(T0, PACE.MUSIC?.bars?.biggest ?? T0) + C.PERIOD + 1e-3).at;
  const b = G.artToFrame(G.BURST_C, K, s, c);
  const landed = span(t, land, land + 0.5, EASE.settle);
  const swell =
    span(t, tArrived, tArrived + 0.5, EASE.settle) *
    (1 - 0.45 * span(t, tArrived + 0.6, tArrived + 1.8, EASE.move));
  const bp = C.beatPulse(t, { tau: 0.42, bar: 1, beat: 0.3 });
  st.set("#glow", {
    transform: `translate(${px(b[0])}, ${px(b[1])}) scale(${r3(s * lerp(0.85, 1.06, span(t, tArrived, tArrived + 1.2, EASE.settle)))})`,
    ...fade(glow * landed * (0.55 + 0.45 * swell + 0.12 * bp)),
  });
  st.set("#rays", {
    transform: `translate(${px(b[0])}, ${px(b[1])}) rotate(${r3(14 + 3.2 * (t - land))}deg) scale(${r3(s * lerp(0.7, 1, landed))})`,
    ...fade(rays * landed * (0.16 + 0.1 * bp + 0.16 * swell)),
  });
}

/** The launch (the bar's downbeat, a frame after the cut) and the landing (its second beat). */
const LAUNCH = LAUNCH_AT();
/** The landing: the second beat of the biggest section's first bar. */
const LAND = C.lastBeat(Math.max(T0, PACE.MUSIC?.bars?.biggest ?? T0) + C.PERIOD + 1e-3).at;
const S0 = 0.2;
const PEAK = 1.2;

function arrivedScene() {
  const tAurixa = spoken("erixa", T0).start; // the recogniser's spelling of "Aurixa"
  const tSystems = spoken("systems", tAurixa).start;
  const tArrived = spoken("arrived", tSystems).start;
  if (!(LAND > tAurixa - 0.2 && LAND < tSystems))
    throw new Error(`11.1: the landing (${LAND}) is not between "Aurixa" and "Systems"`);
  const letterAt = G.LETTERS.map((_, i) =>
    i < G.AURIXA ? LAND + 0.04 + i * 0.07 : tSystems - 0.06 + (i - G.AURIXA) * 0.05,
  );
  const burst = G.artToFrame(G.BURST_C, K, 1, REST);

  const html = () =>
    [
      S.stageCss(),
      `<style>${L.burstCss}${css}</style>`,
      `<div class="fk-layer" id="ground" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      auraHtml(),
      L.burstHtml("ln", { z: 2, sparks: 0, rings: 1 }),
      G.lockupHtml("lk", K, 4),
      L.burstHtml("lj", { z: 6, sparks: 44, rings: 2 }),
      `<div class="st-streak" id="streak" style="z-index:7;top:${r3(burst[1])}px;visibility:hidden"></div>`,
      lineHtml(),
      `<div class="av-expose" id="expose" style="z-index:30;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // ---- the arrival: out of the flash at S0, rushing at the viewer faster as it comes (zooming by ratio), to an
    // overshoot on the landing; then back, a breath under, and settled; then the slow push.
    const rush = span(t, LAUNCH, LAND, EASE.linear);
    let s;
    if (t < LAND) s = S0 * (PEAK / S0) ** (rush ** 1.35);
    else {
      const v = span(t, LAND, LAND + 0.62, EASE.settle);
      const w = clamp01((t - LAND - 0.2) / 0.62);
      s = 1 + (PEAK - 1) * (1 - v) - 0.018 * Math.sin(Math.PI * w) * (1 - w);
    }
    s *= restScale(t);
    const since = t - LAND;
    const kick =
      t < LAND ? 1 + 1.6 * (1 - rush) + 0.35 * rush * rush : 1 + 0.45 * Math.exp(-since / 0.14);
    const tArrivedGlow =
      span(t, tArrived, tArrived + 0.5, EASE.settle) *
      (1 - 0.45 * span(t, tArrived + 0.6, tArrived + 1.8, EASE.move));
    G.lockupState(st, t, "lk", {
      k: K,
      s,
      c: REST,
      t0: T0,
      letter: (i) => G.rise(t, letterAt[i]),
      sweep: t >= tArrived - 0.05 ? span(t, tArrived - 0.05, tArrived + 0.8, EASE.move) : null,
      opacity: span(t, LAUNCH - 0.02, LAUNCH + 0.1, EASE.linear),
      brightness: kick + 0.12 * tArrivedGlow,
      blur: t < LAND ? 5 * (1 - rush) : 0,
    });
    // The emblem's own light behind it: up with the landing, swelling once on "arrived"; the rays turning slowly.
    auraState(st, t, { s, c: REST, tArrived });
    // ---- the light: the launch's flash and rays on the downbeat; the landing's shock rings, sparks and streak.
    L.burstState(st, t, "ln", {
      at: LAUNCH,
      c: burst,
      flash: 0.8,
      fr: 0.8,
      ray: 0.55,
      reach: 900,
      sparks: 0,
      rings: 1,
      seed: 61,
    });
    L.burstState(st, t, "lj", {
      at: LAND,
      c: burst,
      flash: 0.7,
      fr: 0.9,
      reach: 1450,
      spread: 700,
      sparks: 44,
      rings: 2,
      seed: 65,
    });
    const streak = Math.max(
      t >= LAUNCH ? 0.7 * Math.exp(-(t - LAUNCH) / 0.2) : 0,
      t >= LAND ? Math.exp(-since / 0.3) : 0,
    );
    st.set("#streak", { transform: `scaleX(${r3(0.6 + 0.6 * streak)})`, ...fade(streak) });
    const ex =
      (t >= LAUNCH ? 0.12 * Math.exp(-(t - LAUNCH) / 0.1) : 0) +
      (t >= LAND ? 0.1 * Math.exp(-since / 0.07) : 0);
    st.set("#expose", { opacity: r3(ex), visibility: ex > 0.004 ? "visible" : "hidden" });
    // ---- the line under it, on "built".
    lineState(st, t, 0);
    return st;
  };

  return { id: "arrived", shots: ["11.1"], palette: "aurixa", html, state };
}

module.exports = arrivedScene;
Object.assign(module.exports, {
  K,
  REST,
  T0,
  END,
  restScale,
  lineHtml,
  lineState,
  auraHtml,
  auraState,
  css,
  LINE_AT,
  spoken,
});
