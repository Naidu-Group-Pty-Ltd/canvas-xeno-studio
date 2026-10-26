// The living lockup for 11.1 and 12.1: Reel 1's living logo take (B1, logo-B1-*.jpg, the supplied art's own scene
// made with a video model from its clean plate) laid where it was made from (../aurixa-reel-1/logo.cjs CARD_CROP)
// over the clean plate, with the supplied lettering laid over it letter by letter (logo-letters.png, cut on Reel 1's
// measure of its letters, as Reel 2's 03.1 lets them rise), so the letters are the supplied ones, pixel for pixel.
// It is one layer in the art's own coordinates (2000 x 1333) scaled by `k`, screened over the ground and feathered
// into it as Reel 1's card logo is (cardLogoHtml), so a scene places it by the emblem's centre and scales it
// whole: 11.1 lands it at the viewer and 12.1 carries the same layer, its footage running on, into the card.
const M = require("./motion.cjs");
const LOGO = require("../aurixa-reel-1/logo.cjs");

const { F, EASE, span, r3, px, fade } = M;

const ART = LOGO.ART;
/** The emblem's centre in the art (art px): the layer is placed by it. */
const EMBLEM_C = [ART.emblem[0] + ART.emblem[2] / 2, ART.emblem[1] + ART.emblem[3] / 2];
/** Where the triangle's light sits in the emblem (its burst point): a little below the box's centre. */
const BURST_C = [EMBLEM_C[0], ART.emblem[1] + ART.emblem[3] * 0.56];

/**
 * The art's letters (Reel 1's measure of logo-letters.png, as Reel 2's 03.1 cuts them), in art px: AURIXA, then
 * SYSTEMS, each with a halo of the lettering's own shadow so nothing of it is cut.
 */
const LETTERS = (() => {
  const [WX, WY, WW] = ART.wordmark;
  const HALO = 40;
  const out = [];
  const cut = (runs, y0, y1) =>
    runs.forEach(([a, b], i) => {
      const l = i === 0 ? -HALO : (runs[i - 1][1] + a) / 2;
      const r = i === runs.length - 1 ? WW + HALO : (b + runs[i + 1][0]) / 2;
      out.push({ l: WX + l, r: WX + r, y0: WY + y0, y1: WY + y1 });
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
  return out;
})();
const AURIXA = 6; // the first six letters are AURIXA, the next seven SYSTEMS

const FILM = LOGO.takeFrames("B1");
const FEATHER = "linear-gradient(to bottom, transparent 0, #000 7%, #000 93%, transparent 100%)";
const VIGNETTE = "radial-gradient(ellipse 50% 50% at 50% 50%, #000 62%, transparent 100%)";

/**
 * The layer, `id`, drawn at `k` CSS px an art px (its box 2000k by 1333k); the scene sets its transform (origin 0 0).
 * Inside: the clean plate, the footage over its crop, the letters (each `${id}-l<i>`) and a light that crosses the
 * wordmark (`${id}-sweep`, masked to the wordmark's own shapes).
 */
function lockupHtml(id, k, z = 3) {
  const w = ART.w * k;
  const h = ART.h * k;
  const [cx, cy, cw, ch] = LOGO.CARD_CROP.map((v) => v * k);
  const lettering = F.asset("logo-letters.png");
  const letters = LETTERS.map(
    ({ l, r, y0, y1 }, i) =>
      `<div id="${id}-l${i}" style="position:absolute;left:${px(l * k)};top:${px(y0 * k)};width:${px((r - l) * k)};height:${px((y1 - y0) * k)};background:url('${lettering}') ${px(-l * k)} ${px(-y0 * k)}/${px(w)} ${px(h)} no-repeat;visibility:hidden"></div>`,
  ).join("");
  const [wx, wy, ww, wh] = ART.wordmark.map((v) => v * k);
  const sweep = `<div id="${id}-sweep" style="position:absolute;left:${px(wx)};top:${px(wy)};width:${px(ww)};height:${px(wh)};mix-blend-mode:screen;visibility:hidden;
    -webkit-mask-image:url('${F.WORDMARK}');-webkit-mask-size:100% 100%;mask-image:url('${F.WORDMARK}');mask-size:100% 100%;
    background:linear-gradient(105deg, rgba(255,240,205,0) 0%, rgba(255,240,205,.9) 50%, rgba(255,240,205,0) 100%) no-repeat;background-size:40% 100%"></div>`;
  const film = FILM.length
    ? `<img id="${id}-film" src="${FILM[0]}" alt="" style="position:absolute;left:${px(cx)};top:${px(cy)};width:${px(cw)};height:${px(ch)};-webkit-mask-image:${FEATHER};mask-image:${FEATHER}">`
    : "";
  return `<div id="${id}" role="img" aria-label="AURIXA SYSTEMS" style="position:absolute;left:0;top:0;width:${px(w)};height:${px(h)};z-index:${z};transform-origin:0 0;mix-blend-mode:screen;-webkit-mask-image:${VIGNETTE};mask-image:${VIGNETTE};visibility:hidden"><img src="${F.asset("logo-clean.png")}" alt="" style="position:absolute;inset:0;width:100%;height:100%">${film}${letters}${sweep}</div>`;
}

/** The frame point the art point `a` lands on, with the layer drawn at `k`, scaled `s` and its emblem's centre at `c`. */
const artToFrame = (a, k, s, c) => [
  c[0] + (a[0] - EMBLEM_C[0]) * k * s,
  c[1] + (a[1] - EMBLEM_C[1]) * k * s,
];

/**
 * The layer at t: scaled `s` about its emblem's centre, which sits at `c` (frame px); its footage on the frame
 * (offset + film frames since t0), looping (the take starts and ends on one frame); each letter shown as `letter(i)`
 * gives it (0 to 1: rising into place out of a blur); the light across the wordmark at `sweep` (0 to 1, or null);
 * `opacity`, `brightness` and `blur` on the whole.
 */
function lockupState(
  st,
  t,
  id,
  {
    k,
    s = 1,
    c,
    t0,
    offset = 0,
    letter = () => 1,
    sweep = null,
    opacity = 1,
    brightness = 1,
    blur = 0,
  },
) {
  const [x, y] = artToFrame([0, 0], k, s, c);
  const filters = [];
  if (Math.abs(brightness - 1) > 1e-3) filters.push(`brightness(${r3(brightness)})`);
  if (blur > 0.05) filters.push(`blur(${r3(blur)}px)`);
  st.set(`#${id}`, {
    transform: `translate(${px(x)}, ${px(y)}) scale(${s.toFixed(5)})`,
    filter: filters.length ? filters.join(" ") : "none",
    ...fade(opacity),
  });
  if (FILM.length) {
    const n = Math.max(0, offset + M.frameOf(t) - M.frameOf(t0));
    st.set(`#${id}-film`, { $src: FILM[n % FILM.length] });
  }
  LETTERS.forEach((_, i) => {
    const p = Math.max(0, Math.min(1, letter(i)));
    const b = (1 - p) * 8;
    st.set(`#${id}-l${i}`, {
      transform: `translateY(${px((1 - p) * 16 * k)})`,
      filter: b > 0.05 ? `blur(${r3(b * k)}px)` : "none",
      ...fade(Math.min(1, p * 1.6)),
    });
  });
  const on = sweep !== null && sweep > 0 && sweep < 1;
  st.set(`#${id}-sweep`, {
    "background-position": `${r3(-70 + (sweep ?? 0) * 240)}% 0`,
    ...fade(on ? 1 : 0),
  });
}

/** A letter's rise: from `a`, over `d` s on ease-settle. */
const rise = (t, a, d = 0.5) => span(t, a, a + d, EASE.settle);

module.exports = {
  ART,
  EMBLEM_C,
  BURST_C,
  LETTERS,
  AURIXA,
  FILM,
  lockupHtml,
  lockupState,
  artToFrame,
  rise,
};
