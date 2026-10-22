// Reel 1, shot 04.1 (third cut): the brand arrives on the music's drop, then its Command Centre.
// In the silence before the drop the dimmed frame becomes the brand's navy and the reveal's gold hairline draws;
// on the drop the emblem bursts open out of it (the light flaring once across the frame); the wordmark rises
// letter by letter on the second beat after it; then the emblem lifts into the Command Centre's sidebar and the
// Command Centre assembles in its glass window, over the site's floor, and turns a few degrees in depth.
// ./portals.cjs (04.2) carries the window on from exactly where this leaves it (ccAt).
const M = require("../motion.cjs");
const L = require("../logo.cjs");
const S = require("../stage.cjs");
const PACE = require("../pacing.cjs");
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
  KIT,
} = M;

const CC = "PL-11A-c"; // the Command Centre's Overview
const CSS = F.plate(CC).css;
const Zb = 972 / CSS[0]; // the window whole, 1000 px wide, as A04b frames it
const BUILT = [540, 805];
/** The music's drop, on the film's clock (pacing.json): beat 0 of its grid. */
const DROP = PACE.MUSIC.film_drop;
/** A smooth step, for moves that start and end at rest. */
const smooth = (u) => u * u * (3 - 2 * u);
/** A quick fade that still starts gently: a gentler ease-out than the products' ease-settle. */
const GIVE_WAY = M.bezier(0.25, 0.6, 0.35, 1);
/** The floor's travel toward the viewer: the site's grid-forward, slowly, on the film's own clock. */
const flowAt = (t) => t * 34;
/** Where the floor converges behind the Command Centre. */
const HORIZON = 640;

const [T0, TD, TW, TL] = [0, 1, 2, 3].map((i) => beat("04.1", i));
const END = shotOf("04.1").out;

/**
 * The Command Centre's window at t: settling in with one slow push from the lift, then turning a few degrees in
 * depth once the emblem has landed on its sidebar (so the emblem flies to a flat window).
 */
function ccAt(t) {
  const settle = span(t, TL + 0.05, TL + 1.7, EASE.settle);
  const turnP = smooth(Math.min(1, Math.max(0, (t - (TL + 0.82)) / (END - 0.15 - (TL + 0.82)))));
  return {
    framing: whole(CSS, Zb * lerp(0.93, 1.04, settle), BUILT),
    ry: lerp(0, -7, turnP),
    rx: lerp(0, 3, turnP),
  };
}

function brandScene() {
  // The supplied logo where the hero stands it (logo.cjs HERO): its clean plate, the art's own lettering cut
  // into its letters where the wordmark's gaps fall (13 of them), and the emblem (emblem.png, an exact crop).
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

  // The reveal's footage (logo-A-0001.jpg on, 30 fps) against the film's clock: its dark first second under the
  // cut, its gold point and the hairline it draws in the silence before the drop; the triangle, a speck until then
  // (the take's frame 78), bursting open from it in the drop's own attack (to its frame 92 within four frames);
  // the emblem forming through "Aurixa Systems", ending on the hero exactly.
  const FILM = L.takeFrames("A");
  const TAKE_END = TW + 0.65;
  const FILM_KEYS = [
    [T0, 0.86],
    [T0 + 0.42, 1.95],
    [DROP - 0.02, 2.58],
    [DROP + 0.1, 3.05],
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

  // The hero drifts in, slowly, from the cut to the lift: the take, the art, its letters and the light together.
  const ORIGIN = [540, 830];
  const heroScale = (t) => 1 + 0.05 * smooth(Math.min(1, Math.max(0, (t - T0) / (TL - T0))));
  // Where the burst happens in the take: the emblem's own centre as the hero stands it.
  const BURST = [EM.left + EM.w / 2, EM.top + EM.h * 0.56];

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
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      windowHtml("W", [CC], 5),
      `<div id="hero" class="fk-layer" style="z-index:3;transform-origin:${ORIGIN[0]}px ${ORIGIN[1]}px">${film}${L.heroArtHtml(F.asset("logo-clean.png"), "hero-art", 2)}<div id="wordmark" class="fk-layer" style="z-index:6">${letterDivs}</div>${sweep}</div>`,
      `<div class="st-streak" id="streak" style="z-index:7;top:${px(BURST[1])};visibility:hidden"></div>`,
      `<div class="st-bloom" id="bloom" style="z-index:7;left:${px(BURST[0] - 520)};top:${px(BURST[1] - 520)};width:1040px;height:1040px;visibility:hidden"></div>`,
      `<div class="st-shock" id="shock" style="z-index:7;left:${px(BURST[0] - 200)};top:${px(BURST[1] - 200)};width:400px;height:400px;visibility:hidden"></div>`,
      `<div id="emblem" style="position:absolute;left:${px(EM.left)};top:${px(EM.top)};width:${px(EM.w)};height:${px(EM.h)};z-index:8;transform-origin:0 0;background:url('${F.EMBLEM}') center/contain no-repeat;visibility:hidden"></div>`,
      `<div id="lead" class="fk-layer" style="z-index:9;background:#000"></div>`,
      captionHtml(),
    ].join("");
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The cut lands on today's last, darkened frame: the brand's navy comes up out of it. When the emblem lifts
    // off, the hero gives way quickly (its own emblem must not linger behind the one flying), but not in a jump.
    st.set("#lead", fade(1 - span(t, T0, T0 + 0.4, smooth)));
    const away = span(t, TL, TL + 0.34, GIVE_WAY);
    const hs = heroScale(t);
    st.set("#hero", { transform: `scale(${hs.toFixed(5)})`, ...fade(1 - away) });
    if (FILM.length) {
      st.set("#hero-film-img", { $src: footageAt(t) });
      st.set("#hero-art", fade(span(t, TAKE_END - 0.3, TAKE_END, EASE.linear)));
    } else st.set("#hero-art", fade(span(t, TD, TD + 0.8, EASE.settle)));
    // The drop: a bloom of the traveller's light from the emblem, a ring going out from it, and one streak
    // across the frame; all of it gone within the beat that follows.
    const since = t - DROP;
    const flash =
      since >= 0
        ? Math.min(1, since / 0.045) * (1 - span(t, DROP + 0.05, DROP + 0.75, EASE.settle))
        : 0;
    st.set("#bloom", {
      transform: `scale(${r3(lerp(0.5, 1.25, span(t, DROP, DROP + 0.8, EASE.settle)))})`,
      ...fade(flash * 0.95),
    });
    const ring = span(t, DROP, DROP + 0.95, EASE.settle);
    st.set("#shock", {
      transform: `scale(${r3(lerp(0.12, 2.7, ring))})`,
      ...fade(since >= 0 ? Math.min(1, since / 0.04) * (1 - ring) ** 2 * 0.85 : 0),
    });
    const streak =
      since >= 0
        ? Math.min(1, since / 0.035) * (1 - span(t, DROP + 0.04, DROP + 0.5, EASE.settle))
        : 0;
    st.set("#streak", {
      transform: `scaleX(${r3(lerp(0.35, 1.25, span(t, DROP, DROP + 0.5, EASE.settle)))})`,
      ...fade(streak * 0.85),
    });
    // The wordmark, the art's own letters and their shadow, rising into focus one by one as AURIXA, then
    // SYSTEMS, on the second beat after the drop; then the light crosses it once.
    letters.forEach((_, i) => {
      const a = i < 6 ? TW + i * 0.06 : TW + 0.2 + (i - 6) * 0.045;
      const p = span(t, a, a + 0.5, EASE.settle);
      const blur = (1 - p) * 8;
      st.set(`#wm-${i}`, {
        transform: `translateY(${px((1 - p) * 16 + away * 8)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(span(t, a, a + 0.3, EASE.settle)),
      });
    });
    const swept = span(t, TW + 0.75, TW + 1.55, EASE.move);
    st.set("#wm-sweep", {
      "background-position": `${r3(-70 + swept * 240)}% 0`,
      ...fade(swept > 0 && swept < 1 ? 1 : 0),
    });
    // The Command Centre's window: it settles in as the emblem lands; its sidebar's groups set in, then the top
    // bar with its Demo workspace badge, then the Overview page; then it turns a few degrees in depth.
    const { framing, ry, rx } = ccAt(t);
    const winIn = span(t, TL + 0.1, TL + 0.5, EASE.move);
    const g = placeWindow(st, "W", CSS, framing, [1], {
      opacity: winIn,
      transform: `translateY(${px((1 - winIn) * 10)}) ${S.turn({ ry, rx })}`,
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
    // (It fills as soon as the glass is there, never standing empty, and is whole a second before the cut.)
    set(".cside .tenant .t", TL + 0.58, 0.34, 0, -6);
    set(".cside .tenant .s", TL + 0.66, 0.34, 0, -6);
    set(".cside .filter", TL + 0.3, 0.32, 0, -8);
    m.groups.forEach((_, i) => set(".cside .grp", TL + 0.34 + i * 0.06, 0.34, 0, -10, i));
    set(".ctop", TL + 0.56, 0.34, -8);
    set(".ctop .cdemo", TL + 0.7, 0.3, 0, 6);
    set(".stage .col", TL + 0.74, 0.42, 14);
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
    shots: ["04.1"],
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
module.exports.CC = CC;
module.exports.flowAt = flowAt;
module.exports.HORIZON = HORIZON;
