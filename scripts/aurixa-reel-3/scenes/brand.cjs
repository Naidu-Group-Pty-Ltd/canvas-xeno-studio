// Reel 3, shot 03.1: with Aurixa Systems, everything changes. The cut lands on 02.3's last frame, the old way held
// and cooled (./oldway.cjs's board, frozen). On the music's drop a pass of light rises up the frame and lifts the old
// way away; behind it the ground is the brand's navy. The logo leaps out of the light on "Aurixa": Reel 1's reveal
// take (logo-A, the client's own logo, made from its clean plate), its horizon's hairline as the light passes, its
// gold point bursting open, a bloom, a ring and a streak of the traveller's light; the art's own lettering rises
// letter by letter, AURIXA then SYSTEMS on its word, laid exact over the footage; on "everything" a light crosses the
// wordmark and the logo glows. On "changes" the logo settles high in the frame, and holds there for a breath.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const PACE = require("../pacing.cjs");
const L = require("../../aurixa-reel-1/logo.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const oldway = require("./oldway.cjs");

const { FPS, shotOf, beat, EASE, span, lerp, r3, px, State, fade, captionHtml, caption, F } = M;

const SHOT = shotOf("03.1");
const [T0, TA, TCH] = [0, 1, 2].map((i) => beat("03.1", i));
const END = SHOT.out;
/** A word of this shot's voice, on the film's clock (voiceover-words.json through the pacing). */
function wordAt(text) {
  const W = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../../docs/brands/aurixa-reel-3/voiceover-words.json"),
      "utf8",
    ),
  );
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const w = W.words.find((x) => x.start >= SHOT.voice_in - 1e-6 && norm(x.text) === text);
  if (!w) throw new Error(`03.1's voice has no "${text}"`);
  return PACE.word(w.start);
}
const TSY = wordAt("systems");
const TEV = wordAt("everything");
/** The old way, as 02.3 leaves it: frozen on its last drawn moment. */
const PILE_AT = T0 - 1 / FPS;
/** The hero's centre for its drift and its settling; where it settles (up, and a touch smaller). */
const ORIGIN = [540, 830];
const SETTLED = { dy: -70, k: 0.93 };
const smooth = (u) => u * u * (3 - 2 * u);

function brandScene() {
  const B = oldway.board();
  const H = L.HERO;
  const EM = { left: H.emblem[0], top: H.emblem[1], w: H.emblem[2], h: H.emblem[3] };
  const [WX, WY] = L.ART.wordmark;
  const HALO = 40;
  const letters = [];
  const cut = (runs, y0, y1) =>
    runs.forEach(([a, b], i) => {
      const l = i === 0 ? -HALO : (runs[i - 1][1] + a) / 2;
      const r = i === runs.length - 1 ? L.ART.wordmark[2] + HALO : (b + runs[i + 1][0]) / 2;
      letters.push({ l: WX + l, r: WX + r, y0: WY + y0, y1: WY + y1 });
    });
  // The art's letters (Reel 1's measure of logo-letters.png): AURIXA, then SYSTEMS.
  cut(
    [
      [1, 141],
      [174, 295],
      [346, 470],
      [514, 537],
      [581, 712],
      [742, 881],
    ],
    -HALO,
    114,
  );
  cut(
    [
      [137, 186],
      [224, 280],
      [318, 367],
      [407, 457],
      [498, 544],
      [588, 647],
      [690, 739],
    ],
    114,
    187 + HALO,
  );

  // The reveal take (logo-A-0001.jpg on, 30 fps) against the film's clock: its horizon's hairline as the light
  // passes, its gold point, the triangle bursting open on "Aurixa" (the take's frame 92), forming through "Systems",
  // ending on the hero exactly.
  const FILM = L.takeFrames("A");
  const TAKE_END = TSY + 0.7;
  const FILM_KEYS = [
    [T0 + 0.02, 1.95],
    [TA - 0.04, 2.58],
    [TA + 0.08, 3.05],
    [TSY, 4.1],
    [TAKE_END, (Math.max(1, FILM.length) - 1) / FPS],
  ];
  const footageAt = (t) => {
    const k = FILM_KEYS;
    const sec = (() => {
      if (t <= k[0][0]) return k[0][1];
      if (t >= k.at(-1)[0]) return k.at(-1)[1];
      // Monotone cubic between the keys (Fritsch-Carlson), so the take's speed changes without a jolt.
      const d = k.slice(1).map(([x, y], i) => (y - k[i][1]) / (x - k[i][0]));
      const m = k.map((_, i) =>
        i === 0
          ? d[0]
          : i === k.length - 1
            ? d.at(-1)
            : d[i - 1] * d[i] <= 0
              ? 0
              : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]),
      );
      const i = k.findIndex(([x], j) => j < k.length - 1 && t >= x && t < k[j + 1][0]);
      const [x0, y0] = k[i];
      const [x1, y1] = k[i + 1];
      const h = x1 - x0;
      const u = (t - x0) / h;
      return (
        (2 * u ** 3 - 3 * u ** 2 + 1) * y0 +
        (u ** 3 - 2 * u ** 2 + u) * h * m[i] +
        (-2 * u ** 3 + 3 * u ** 2) * y1 +
        (u ** 3 - u ** 2) * h * m[i + 1]
      );
    })();
    return FILM[Math.min(FILM.length - 1, Math.max(0, Math.round(sec * FPS)))];
  };

  /** The hero's scale and lift at t: drifting in slowly from the burst, then settling high on "changes". */
  const heroAt = (t) => {
    const drift = 1 + 0.035 * smooth(Math.min(1, Math.max(0, (t - TA) / (TCH - 0.25 - TA))));
    // It travels (up, and down to its settled size) on ease-move, from rest to rest.
    const settle = span(t, TCH - 0.25, TCH + 0.85, EASE.move);
    const breath = 0.006 * span(t, TCH + 0.85, END, EASE.linear);
    return {
      k: lerp(drift, SETTLED.k, settle) + breath,
      dy: SETTLED.dy * settle,
    };
  };
  const BURST = [EM.left + EM.w / 2, EM.top + EM.h * 0.56];
  /** The sweep's leading edge (frame y) at t: from below the frame to above it. It sets off a frame before the cut,
   * so its edge is in the picture on the frame after the drop's attack, never behind it. */
  const SWEEP = [T0 - 1 / FPS, T0 - 1 / FPS + 0.62];
  const sweepY = (t) => lerp(2060, -160, span(t, SWEEP[0], SWEEP[1], EASE.move));

  const html = () => {
    const lettering = F.asset("logo-letters.png");
    const [ax, ay, aw, ah] = H.art;
    const letterDivs = letters
      .map(
        ({ l, r, y0, y1 }, i) =>
          `<div id="wm-${i}" style="position:absolute;left:${px(ax + l * H.k)};top:${px(ay + y0 * H.k)};width:${px((r - l) * H.k)};height:${px((y1 - y0) * H.k)};background:url('${lettering}') ${px(-l * H.k)} ${px(-y0 * H.k)}/${px(aw)} ${px(ah)} no-repeat;visibility:hidden"></div>`,
      )
      .join("");
    const [wx, wy, ww, wh] = H.wordmark;
    const sweep = `<div id="wm-sweep" style="position:absolute;left:${px(wx)};top:${px(wy)};width:${px(ww)};height:${px(wh)};z-index:7;mix-blend-mode:screen;visibility:hidden;
      -webkit-mask-image:url('${F.WORDMARK}');-webkit-mask-size:100% 100%;mask-image:url('${F.WORDMARK}');mask-size:100% 100%;
      background:linear-gradient(105deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.85) 50%, rgba(255,240,205,0) 100%) no-repeat;background-size:40% 100%"></div>`;
    // The take is full frame; its foot fades into the ground so the logo can settle up without showing an edge.
    const foot = `-webkit-mask-image:linear-gradient(to bottom, #000 0, #000 1500px, rgba(0,0,0,0) 1900px);mask-image:linear-gradient(to bottom, #000 0, #000 1500px, rgba(0,0,0,0) 1900px)`;
    const film = FILM.length
      ? `<div class="fk-layer" id="hero-film" style="z-index:1;${foot}"><img id="hero-film-img" src="${FILM[0]}" alt="" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></div>`
      : "";
    return [
      S.stageCss(),
      `<style>${oldway.css}
.br-before { position:absolute; inset:0; overflow:hidden; }
.br-light { position:absolute; left:-60px; right:-60px; height:340px; margin-top:-170px; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(180deg, rgba(245,209,122,0) 0%, rgba(245,209,122,.35) 30%, rgba(255,246,222,.95) 50%, rgba(245,209,122,.35) 70%, rgba(245,209,122,0) 100%); filter:blur(6px); }
.br-glow { position:absolute; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(circle, rgba(245,209,122,.30) 0%, rgba(200,155,60,.12) 40%, rgba(200,155,60,0) 70%); }
</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="hero" class="fk-layer" style="z-index:3;transform-origin:${ORIGIN[0]}px ${ORIGIN[1]}px">${film}${L.heroArtHtml(F.asset("logo-clean.png"), "hero-art", 2)}<div id="wordmark" class="fk-layer" style="z-index:6">${letterDivs}</div>${sweep}
        <div class="br-glow" id="glow" style="z-index:2;left:${px(BURST[0] - 560)};top:${px(BURST[1] - 560)};width:1120px;height:1120px;visibility:hidden"></div></div>`,
      `<div class="st-streak" id="streak" style="z-index:7;top:${px(BURST[1])};visibility:hidden"></div>`,
      `<div class="st-bloom" id="bloom" style="z-index:7;left:${px(BURST[0] - 520)};top:${px(BURST[1] - 520)};width:1040px;height:1040px;visibility:hidden"></div>`,
      `<div class="st-shock" id="shock" style="z-index:7;left:${px(BURST[0] - 200)};top:${px(BURST[1] - 200)};width:400px;height:400px;visibility:hidden"></div>`,
      // 02.3's frame, held: the before ground, the old way and its cooling, lifted away by the sweep.
      `<div class="br-before before" id="before" style="z-index:9"><div class="fk-layer"><div class="ow-ground"></div></div><div id="pile" class="fk-layer" style="transform-origin:540px 800px">${B.html()}</div><div class="fk-layer ow-cool" id="br-cool"></div></div>`,
      `<div class="br-light" id="light" style="z-index:10;top:0;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The old way, frozen, under the sweep: everything above the light's edge is still 02.3's frame, lifting and
    // going pale as the light reaches it; below the edge, the navy.
    B.state(st, PILE_AT);
    st.set("#br-cool", fade(oldway.coolAt(PILE_AT)));
    const edge = sweepY(t);
    const lifted = span(t, SWEEP[0] + 0.05, SWEEP[1] + 0.1, EASE.move);
    st.set("#before", {
      "clip-path": `inset(0 0 ${px(Math.max(0, 1920 - edge + 40))} 0)`,
      ...fade(t < SWEEP[1] + 0.12 ? 1 : 0),
    });
    st.set("#pile", {
      transform: `translateY(${px(-220 * lifted)}) scale(${r3(1 + 0.04 * lifted)})`,
      filter:
        lifted > 0.01 ? `blur(${r3(6 * lifted)}px) brightness(${r3(1 + 0.6 * lifted)})` : "none",
      opacity: r3(1 - 0.55 * lifted),
    });
    st.set("#light", {
      transform: `translateY(${px(edge)})`,
      ...fade(
        t >= SWEEP[0] && t <= SWEEP[1] + 0.08
          ? 1 - 0.6 * span(t, SWEEP[1] - 0.2, SWEEP[1] + 0.08)
          : 0,
      ),
    });
    // The hero: the take, the art and its lettering together, drifting in, then settling high.
    const { k, dy } = heroAt(t);
    st.set("#hero", {
      transform: `translateY(${px(dy)}) scale(${k.toFixed(5)})`,
      ...fade(span(t, T0 + 0.04, T0 + 0.3, EASE.linear)),
    });
    if (FILM.length) {
      st.set("#hero-film-img", { $src: footageAt(t) });
      // Once the take has ended on the hero, the art carries it alone: the take gives way under it.
      st.set("#hero-film", fade(1 - span(t, TAKE_END + 0.05, TAKE_END + 0.45, EASE.linear)));
      st.set("#hero-art", fade(span(t, TAKE_END - 0.3, TAKE_END, EASE.linear)));
    } else st.set("#hero-art", fade(span(t, TA, TA + 0.8, EASE.settle)));
    // The burst on "Aurixa": a bloom of the traveller's light, a ring going out, one streak across the frame.
    const since = t - TA;
    const flash =
      since >= 0
        ? Math.min(1, since / 0.045) * (1 - span(t, TA + 0.05, TA + 0.75, EASE.settle))
        : 0;
    st.set("#bloom", {
      transform: `scale(${r3(lerp(0.5, 1.25, span(t, TA, TA + 0.8, EASE.settle)))})`,
      ...fade(flash * 0.95),
    });
    const ring = span(t, TA, TA + 0.95, EASE.settle);
    st.set("#shock", {
      transform: `scale(${r3(lerp(0.12, 2.7, ring))})`,
      ...fade(since >= 0 ? Math.min(1, since / 0.04) * (1 - ring) ** 2 * 0.85 : 0),
    });
    const streak =
      since >= 0 ? Math.min(1, since / 0.035) * (1 - span(t, TA + 0.04, TA + 0.5, EASE.settle)) : 0;
    st.set("#streak", {
      transform: `scaleX(${r3(lerp(0.35, 1.25, span(t, TA, TA + 0.5, EASE.settle)))})`,
      ...fade(streak * 0.85),
    });
    // The lettering: AURIXA rises letter by letter from "Aurixa", SYSTEMS on its word; then the light crosses it.
    letters.forEach((_, i) => {
      const a = i < 6 ? TA + 0.28 + i * 0.07 : TSY + (i - 6) * 0.05;
      const p = span(t, a, a + 0.5, EASE.settle);
      const blur = (1 - p) * 8;
      st.set(`#wm-${i}`, {
        transform: `translateY(${px((1 - p) * 16)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(span(t, a, a + 0.3, EASE.settle)),
      });
    });
    const swept = span(t, TEV - 0.05, TEV + 0.8, EASE.move);
    st.set("#wm-sweep", {
      "background-position": `${r3(-70 + swept * 240)}% 0`,
      ...fade(swept > 0 && swept < 1 ? 1 : 0),
    });
    // The glow on "everything": the light behind the emblem swells once, and settles with the logo.
    const glow =
      span(t, TEV, TEV + 0.5, EASE.settle) * (1 - 0.45 * span(t, TEV + 0.6, TEV + 1.6, EASE.move));
    st.set("#glow", {
      transform: `scale(${r3(lerp(0.85, 1.05, span(t, TEV, TEV + 1.2, EASE.settle)))})`,
      ...fade(glow),
    });
    return st;
  };

  return { id: "brand", shots: ["03.1"], palette: "aurixa", html, state };
}

module.exports = brandScene;
module.exports.END = END;
