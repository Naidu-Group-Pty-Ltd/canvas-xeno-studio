// Reel 2, shots 03.1 and 03.2: Aurixa Systems changes the experience; built by property professionals.
// The cut lands on 02.3's last frame, the pile held and cooled (./requests.cjs's pile, frozen). On the music's
// first drop a sweep of light rises up the frame and lifts the pile away; behind it the ground is the brand's navy.
// The A rises out of the light: Reel 1's reveal take (logo-A, the client's own logo, made from its clean plate), its
// gold point bursting open on "Aurixa", the art's own lettering rising letter by letter, AURIXA then SYSTEMS on
// its word; on "experience" a light crosses the wordmark and the logo glows. On "professionals" the emblem lifts
// off the logo into the Command Centre's sidebar, its own mark, and the glass window settles in around it (Reel 2's
// taller Command Centre, ../cc.cjs, so the whole sidebar shows); on "for" its sidebar fills, group by group.
// ./platform.cjs carries the window on from exactly where this leaves it (ccAt).
const M = require("../motion.cjs");
const L = require("../../aurixa-reel-1/logo.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const CC = require("../cc.cjs");
const requests = require("./requests.cjs");

const {
  FPS,
  shotOf,
  beat,
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
  whole,
  placeWindow,
  captionHtml,
  caption,
  F,
} = M;

/** The window's place once settled: its page whole at ZOOM, centred on BUILT (the action zone's middle). */
const ZOOM = 0.84;
const BUILT = [540, 838];
const smooth = (u) => u * u * (3 - 2 * u);
/** A quick fade that still starts gently. */
const GIVE_WAY = M.bezier(0.25, 0.6, 0.35, 1);
const flowAt = (t) => t * 34;
const HORIZON = 640;

const [T0, TA, TW, TX] = [0, 1, 2, 3].map((i) => beat("03.1", i));
const [, TP, TF] = [0, 1, 2].map((i) => beat("03.2", i));
/** The emblem lifts just before "professionals", so the window is settling as the word is said. */
const TL = TP - 0.22;
const END = shotOf("03.2").out;
/** The pile, as 02.3 leaves it: frozen on its last drawn moment. */
const PILE_AT = T0 - 1 / FPS;

/** The window at t: settling in from the lift with one slow push; flat, so 03.3's tiles land on its entries. */
function ccAt(t) {
  const settle = span(t, TL + 0.05, TL + 1.7, EASE.settle);
  return { framing: whole(CC.CSS, ZOOM * lerp(0.93, 1, settle), BUILT) };
}

function brandScene() {
  const pile = requests.pile();
  const H = L.HERO;
  const EM = {
    left: H.emblem[0],
    top: H.emblem[1],
    w: H.emblem[2],
    h: H.emblem[3],
    file: [679, 628],
  };
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

  // The reveal take (logo-A-0001.jpg on, 30 fps) against the film's clock: its dark opening under the sweep, its
  // gold point as the light passes, the hairline, the triangle bursting open on "Aurixa" (the take's frame 92),
  // forming through "Systems", ending on the hero exactly.
  const FILM = L.takeFrames("A");
  const TAKE_END = TW + 0.65;
  const FILM_KEYS = [
    [T0 + 0.15, 0.86],
    [T0 + 0.42, 1.95],
    [TA - 0.04, 2.58],
    [TA + 0.08, 3.05],
    [TW, 4.3],
    [TAKE_END, (FILM.length - 1) / FPS],
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

  const ORIGIN = [540, 830];
  /** The hero drifts in, slowly, from the burst to the lift. */
  const heroScale = (t) => 1 + 0.05 * smooth(Math.min(1, Math.max(0, (t - TA) / (TL - TA))));
  const BURST = [EM.left + EM.w / 2, EM.top + EM.h * 0.56];
  /** The sweep's leading edge (frame y) at t: from below the frame to above it. */
  const SWEEP = [T0, T0 + 0.62];
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
    const film = FILM.length
      ? `<div class="fk-layer" id="hero-film" style="z-index:1"><img id="hero-film-img" src="${FILM[0]}" alt="" style="position:absolute;left:0;top:0;width:1080px;height:1920px"></div>`
      : "";
    return [
      S.stageCss(),
      `<style>${requests.css}
.br-before { position:absolute; inset:0; overflow:hidden; }
.br-light { position:absolute; left:-60px; right:-60px; height:340px; margin-top:-170px; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(180deg, rgba(245,209,122,0) 0%, rgba(245,209,122,.35) 30%, rgba(255,246,222,.95) 50%, rgba(245,209,122,.35) 70%, rgba(245,209,122,0) 100%); filter:blur(6px); }
.br-glow { position:absolute; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:radial-gradient(circle, rgba(245,209,122,.30) 0%, rgba(200,155,60,.12) 40%, rgba(200,155,60,0) 70%); }
</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      windowHtml("W", ["R2-CC-a"], 5),
      `<div id="hero" class="fk-layer" style="z-index:3;transform-origin:${ORIGIN[0]}px ${ORIGIN[1]}px">${film}${L.heroArtHtml(F.asset("logo-clean.png"), "hero-art", 2)}<div id="wordmark" class="fk-layer" style="z-index:6">${letterDivs}</div>${sweep}</div>`,
      `<div class="br-glow" id="glow" style="z-index:2;left:${px(BURST[0] - 560)};top:${px(BURST[1] - 560)};width:1120px;height:1120px;visibility:hidden"></div>`,
      `<div class="st-streak" id="streak" style="z-index:7;top:${px(BURST[1])};visibility:hidden"></div>`,
      `<div class="st-bloom" id="bloom" style="z-index:7;left:${px(BURST[0] - 520)};top:${px(BURST[1] - 520)};width:1040px;height:1040px;visibility:hidden"></div>`,
      `<div class="st-shock" id="shock" style="z-index:7;left:${px(BURST[0] - 200)};top:${px(BURST[1] - 200)};width:400px;height:400px;visibility:hidden"></div>`,
      `<div id="emblem" style="position:absolute;left:${px(EM.left)};top:${px(EM.top)};width:${px(EM.w)};height:${px(EM.h)};z-index:8;transform-origin:0 0;background:url('${F.EMBLEM}') center/contain no-repeat;visibility:hidden"></div>`,
      // 02.3's frame, held: the before ground, the pile and its cooling, lifted away by the sweep.
      `<div class="br-before before" id="before" style="z-index:9"><div class="fk-layer"><div class="rq-ground"></div></div><div id="pile" class="fk-layer" style="transform-origin:540px 900px">${pile.html()}</div><div class="fk-layer rq-cool"></div></div>`,
      `<div class="br-light" id="light" style="z-index:10;top:0;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The pile, frozen, under the sweep: everything above the light's edge is still 02.3's frame, lifting and
    // going pale as the light reaches it; below the edge, the navy.
    pile.state(st, PILE_AT);
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
    // When the emblem lifts off, the hero gives way quickly (its own emblem must not linger behind the one
    // flying), but not in a jump.
    const away = span(t, TL, TL + 0.34, GIVE_WAY);
    const hs = heroScale(t);
    st.set("#hero", {
      transform: `scale(${hs.toFixed(5)})`,
      ...fade((1 - away) * span(t, T0 + 0.12, T0 + 0.45, EASE.linear)),
    });
    if (FILM.length) {
      st.set("#hero-film-img", { $src: footageAt(t) });
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
      const a = i < 6 ? TA + 0.28 + i * 0.07 : TW + (i - 6) * 0.05;
      const p = span(t, a, a + 0.5, EASE.settle);
      const blur = (1 - p) * 8;
      st.set(`#wm-${i}`, {
        transform: `translateY(${px((1 - p) * 16 + away * 8)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(span(t, a, a + 0.3, EASE.settle)),
      });
    });
    const swept = span(t, TX - 0.05, TX + 0.8, EASE.move);
    st.set("#wm-sweep", {
      "background-position": `${r3(-70 + swept * 240)}% 0`,
      ...fade(swept > 0 && swept < 1 ? 1 : 0),
    });
    // The glow on "experience": the light behind the emblem swells once and settles.
    const glow =
      span(t, TX, TX + 0.5, EASE.settle) * (1 - 0.45 * span(t, TX + 0.6, TX + 1.6, EASE.move));
    st.set("#glow", {
      transform: `scale(${r3(lerp(0.85, 1.05, span(t, TX, TX + 1.2, EASE.settle)))})`,
      ...fade(glow * (1 - away)),
    });
    // The Command Centre's window: it settles in as the emblem lands; its sidebar's groups set in on "for",
    // then its top bar with the DEMO WORKSPACE label, then the Overview page.
    const { framing } = ccAt(t);
    const winIn = span(t, TL + 0.1, TL + 0.5, EASE.move);
    const g = placeWindow(st, "W", CC.CSS, framing, [1], {
      opacity: winIn,
      transform: `translateY(${px((1 - winIn) * 10)})`,
    });
    const set = (sel, a, d, dy = 0, dx = 0, i = null) => {
      const p = span(t, a, a + d, EASE.settle);
      st.set(
        `#W-0 ${sel}`,
        { transform: `translate(${px((1 - p) * dx)}, ${px((1 - p) * dy)})`, ...fade(p) },
        i,
      );
    };
    const lift = span(t, TL, TL + 0.78, EASE.move);
    const landed = lift >= 1;
    st.set("#W-0 .cside .tenant .emb", fade(landed ? 1 : 0));
    set(".cside .tenant .t", TL + 0.58, 0.34, 0, -6);
    set(".cside .tenant .s", TL + 0.66, 0.34, 0, -6);
    set(".cside .filter", TL + 0.3, 0.32, 0, -8);
    m.groups.forEach((_, i) => set(".cside .grp", TF - 0.1 + i * 0.14, 0.38, 0, -10, i));
    set(".ctop", TL + 0.5, 0.34, -8);
    set(".ctop .cdemo", TL + 0.66, 0.3, 0, 6);
    set(".stage .col", TL + 0.72, 0.42, 14);
    // The emblem (the exact file, from where the drifting hero has it) flies to the sidebar's own mark.
    const [ex, ey, ew] = m.emb;
    const target = g.map([ex, ey + (ew - (ew * EM.file[1]) / EM.file[0]) / 2]);
    const from = [ORIGIN[0] + (EM.left - ORIGIN[0]) * hs, ORIGIN[1] + (EM.top - ORIGIN[1]) * hs];
    const scale = zoomLerp(hs, (ew * framing.zoom) / EM.w, lift);
    const pos = lerp2(from, target, lift);
    st.set("#emblem", {
      transform: `translate(${px(pos[0] - EM.left)}, ${px(pos[1] - EM.top)}) scale(${scale.toFixed(6)})`,
      ...fade(landed ? 0 : span(t, TL - 0.12, TL, EASE.linear)),
    });
    // The floor comes up under the window as the hero gives way, and the window's shadow falls on it.
    const floor = span(t, TL + 0.2, TL + 1.2, EASE.settle);
    S.floorState(st, "floor", { horizon: HORIZON, flow: flowAt(t), opacity: floor });
    S.shadowState(st, "W-shadow", {
      cx: framing.at[0],
      foot: framing.rect[1] + framing.rect[3],
      width: framing.rect[2],
      opacity: floor * winIn,
    });
    return st;
  };

  return {
    id: "brand",
    shots: ["03.1", "03.2"],
    palette: "aurixa",
    html,
    measure: {
      emb: ["#W-0", ".cside .tenant .emb"],
      groups: ["#W-0", ".cside .grp", true],
    },
    state,
  };
}

module.exports = brandScene;
module.exports.ccAt = ccAt;
module.exports.flowAt = flowAt;
module.exports.HORIZON = HORIZON;
module.exports.END = END;
