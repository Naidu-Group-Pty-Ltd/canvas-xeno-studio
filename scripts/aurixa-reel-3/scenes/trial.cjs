// Reel 3, shot 12.1: experience the difference with a 14-day free trial. Reel 1's living call to action (its
// invitation card, as Reels 1 and 2 set it: ../../aurixa-reel-2/scenes/trial.cjs), carried on from 11.1: the living
// lockup, exactly where ./arrived.cjs leaves it and its footage running on, glides up and in to the top of the card
// as the line under it goes; 14-DAY FREE TRIAL sets in under it on the bar, its letters closing in and its gold rules
// drawing out; the button (G-CTA, ../g-cta.cjs: the site's prismatic button, alive) rises in and lands on the next
// beat, its gradient breathing on the bars. The pointer comes over it and presses it on "14-day", the light rippling
// out across the card and the emblem flaring once; then it holds, breathing, as the camera pushes slowly in.
const M = require("../motion.cjs");
const L = require("../../aurixa-reel-1/pages/light.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const C = require("../g-cta.cjs");
const G = require("../g-lockup.cjs");
const A = require("./arrived.cjs");

const { shotOf, EASE, span, lerp, lerp2, zoomLerp, r3, px, State, fade } = M;
const { pointerHtml, pointer, captionHtml, caption } = M;

const SHOT = shotOf("12.1");
const T0 = SHOT.in;
/** The lockup on the card: its emblem 430 px wide, centred at CARD_C. */
const CARD_S = 430 / (G.ART.emblem[2] * A.K);
const CARD_C = [540, 560];
/** The wordmark's foot on the card, and under it the eyebrow and the button (frame px). */
const WM_FOOT = CARD_C[1] + (G.ART.wordmark[1] + G.ART.wordmark[3] - G.EMBLEM_C[1]) * A.K * CARD_S;
const EYE = { top: Math.round(WM_FOOT + 34) };
const BTN = { w: 820, h: 132, left: 130, top: EYE.top + 66 };
BTN.c = [BTN.left + BTN.w / 2, BTN.top + BTN.h / 2];
const LOCAL = [BTN.w * 0.71, BTN.h * 0.6];

const css = `
.tr-card { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${BTN.c[0]}px ${BTN.c[1]}px; }
.tr-eye { position:absolute; left:0; right:0; top:${EYE.top}px; display:flex; align-items:center; justify-content:center; gap:26px; }
.tr-eye span { font:700 30px/1 Inter, sans-serif; color:${L.CYAN}; text-shadow:0 0 18px rgba(94,221,232,.35); white-space:nowrap; }
.tr-eye i { display:block; width:92px; height:2px; }
.tr-eye i.l { background:linear-gradient(90deg, rgba(200,155,60,0), ${L.GOLD_INK}); transform-origin:100% 50%; }
.tr-eye i.r { background:linear-gradient(90deg, ${L.GOLD_INK}, rgba(200,155,60,0)); transform-origin:0 50%; }
`;

function timeline() {
  const tPress = A.spoken("14day", T0).start; // "14-day", on the brief's beat
  // The first bar line a breath after the cut: the lockup arrives on it and the eyebrow sets in under it.
  const tGlide = C.DROP + Math.ceil((T0 + 0.25 - C.DROP) / C.BAR - 1e-6) * C.BAR;
  const tEye = tGlide;
  const tLand = tEye + C.PERIOD; // the button lands on the next beat
  const tRise = tLand - 0.5;
  const tArrive = Math.max(tLand + 0.15, tPress - 0.4);
  if (!(tLand < tPress - 0.3)) throw new Error("12.1: the button hasn't landed before the press");
  return { tPress, tGlide, tEye, tLand, tRise, tArrive };
}

function trialScene() {
  const { tPress, tGlide, tEye, tLand, tRise, tArrive } = timeline();
  const tArrived = A.spoken("arrived", A.T0).start;
  const sFrom = A.restScale(A.END);
  const pushAt = (t) => 1 + 0.05 * span(t, tLand, SHOT.out, EASE.move);
  const pushed = (k, [x, y]) => [BTN.c[0] + (x - BTN.c[0]) * k, BTN.c[1] + (y - BTN.c[1]) * k];

  const html = () =>
    [
      S.stageCss(),
      `<style>${L.burstCss}${C.ctaCss}${A.css}${css}</style>`,
      `<div class="fk-layer" id="ground" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      // The lockup and its light stay in the page's own stacking context, as 11.1 draws them, so they screen over the
      // ground exactly as they did there (inside the card's transform they would blend in a group of their own and
      // their ground would darken at the cut); the push is applied to them by hand.
      A.auraHtml(),
      G.lockupHtml("lk", A.K, 4),
      `<div class="tr-card" id="card" style="z-index:5">`,
      `<div class="tr-eye" id="eye" style="z-index:6;visibility:hidden"><i class="l" id="eye-l"></i><span id="eye-t">14-DAY FREE TRIAL</span><i class="r" id="eye-r"></i></div>`,
      C.ctaHtml("cta", { w: BTN.w, h: BTN.h, size: 33, z: 8 }),
      L.rippleHtml("rp", 9),
      `</div>`,
      A.lineHtml(),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const k = pushAt(t);
    st.set("#card", { transform: `scale(${r3(k)})` });

    // The lockup: from where 11.1 leaves it, up and in to the card's top, on the bar's first beats.
    const g = span(t, T0, tGlide, EASE.move);
    const s = zoomLerp(sFrom, CARD_S, g) * k;
    const c = pushed(k, lerp2(A.REST, CARD_C, g));
    const since = t - tPress;
    const flare = since >= 0 ? 0.5 * Math.exp(-since / 0.2) : 0;
    const settle = span(t, tGlide - 0.05, tGlide + 0.35, EASE.settle);
    G.lockupState(st, t, "lk", {
      k: A.K,
      s,
      c,
      t0: A.T0,
      brightness: 1.066 + 0.18 * Math.exp(-Math.max(0, t - tGlide) / 0.16) * settle + flare,
    });
    A.auraState(st, t, {
      s,
      c,
      tArrived,
      rays: 1 - 0.7 * span(t, T0, tGlide + 0.3, EASE.move),
      glow: 1 + 0.6 * flare,
    });
    // The line under it goes as the lockup lifts.
    A.lineState(st, t, span(t, T0, T0 + 0.34, EASE.move));

    // 14-DAY FREE TRIAL on the bar: its letters closing in, the gold rules drawing out from it.
    const ep = span(t, tEye, tEye + 0.6, EASE.settle);
    st.set("#eye", {
      ...fade(span(t, tEye, tEye + 0.3, EASE.linear)),
      transform: `translateY(${px((1 - ep) * 12)})`,
    });
    st.set("#eye-t", {
      "letter-spacing": `${r3(lerp(0.7, 0.34, ep))}em`,
      "padding-left": `${r3(lerp(0.7, 0.34, ep))}em`,
    });
    const rule = span(t, tEye + 0.15, tEye + 0.7, EASE.move);
    st.set("#eye-l", { transform: `scaleX(${r3(rule)})` });
    st.set("#eye-r", { transform: `scaleX(${r3(rule)})` });

    // The button rises in and lands on the beat; from then it breathes on the beats and its edge runs.
    const bp = span(t, tRise, tLand, EASE.settle);
    st.set("#cta", {
      transform: `translate(${px(BTN.left)}, ${px(BTN.top + (1 - bp) * 90)}) scale(${r3(lerp(0.86, 1, bp))})`,
      ...fade(span(t, tRise, tRise + 0.28, EASE.linear)),
    });
    const target = pushed(k, [BTN.left + LOCAL[0], BTN.top + LOCAL[1]]);
    const tip = pointer(st, t, {
      from: [1000, 1500],
      to: target,
      a: tArrive - 0.42,
      b: tArrive,
      bow: 0.1,
      show: tArrive - 0.48,
      hide: tPress + 0.95,
      press: tPress,
    });
    const ptr = [
      (tip[0] - BTN.c[0]) / k + BTN.c[0] - BTN.left,
      (tip[1] - BTN.c[1]) / k + BTN.c[1] - BTN.top,
    ];
    const live = span(t, tLand - 0.05, tLand + 0.25, EASE.settle);
    const hover =
      span(t, tArrive - 0.14, tArrive + 0.1, EASE.settle) *
      (1 - span(t, tPress + 0.6, tPress + 1.1, EASE.move));
    C.ctaState(st, t, "cta", {
      w: BTN.w,
      h: BTN.h,
      t0: tRise,
      hover,
      hoverAt: tArrive - 0.14,
      ptr: hover > 0 ? ptr : null,
      press: tPress,
      pulse: live,
      edge: live,
      glow: live + 0.6 * Math.exp(-Math.abs(t - tLand) / 0.16) * (t >= tLand - 0.05 ? 1 : 0),
    });
    L.rippleState(st, t, "rp", {
      at: tPress,
      c: [BTN.left + LOCAL[0], BTN.top + LOCAL[1]],
      reach: 1500,
    });
    return st;
  };

  return { id: "trial", shots: ["12.1"], palette: "aurixa", html, state };
}

module.exports = trialScene;
module.exports.CARD = { CARD_S, CARD_C, EYE, BTN };
