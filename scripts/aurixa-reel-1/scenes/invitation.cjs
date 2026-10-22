// Reel 1, shot 10.2 (third cut): we've arrived, and the invitation is open. One shot from the logo to the press.
// Out of 10.1's sun the supplied emblem leaps at the viewer (G-LOGO-JUMP): it rushes from a point in the sun to
// filling the frame, faster as it comes, and lands on the music's beat with a flash, a shock ring and sparks
// (../pages/light.cjs); then it pulls back and settles at the top of the card, its light now the sun's. AURIXA
// SYSTEMS sets in beneath it on the next bar, 14-DAY FREE TRIAL on the beat after, and the button (G-CTA,
// ../pages/cta.cjs: the site's prismatic button, alive) rises in and lands as "invitation" is said. The pointer
// comes over it; it lifts and quickens; the press on the bar before "Experience", and the light ripples out
// across the card; it holds, pulsing, as the camera pushes slowly in. The emblem and the wordmark are the
// supplied files (emblem.png, wordmark.png: exact crops of the art), never redrawn; 15.1 uses the living card
// logo instead, so the two cards differ.
const M = require("../motion.cjs");
const L = require("../pages/light.cjs");
const C = require("../pages/cta.cjs");

const { F, beat, shotOf, span, lerp, r3, px, State, fade, pointerHtml, pointer } = M;
const { captionHtml, caption, EASE, clamp01 } = M;

/** The film's beat n (0 is the drop) and the first beat at or after t. */
const grid = (n) => C.DROP + n * C.PERIOD;
const beatFrom = (t) => grid(Math.ceil((t - C.DROP) / C.PERIOD - 1e-6));

// The card, in frame px (the action zone, 360 to 1300; the captions below it).
const EMB = { w: 440, h: (440 * 628) / 679, cx: 540, top: 360 };
EMB.cy = EMB.top + EMB.h / 2;
const WM = { w: 560, h: (560 * 187) / 882, top: 806 };
const EYE = { top: 954 };
const BTN = { w: 820, h: 132, left: 130, top: 1030 };
BTN.c = [BTN.left + BTN.w / 2, BTN.top + BTN.h / 2];
/** Where the emblem lands from the sun: the frame's centre, a little above. */
const PEAK = { cy: 900, scale: 2.4 };

const css = `
.iv-group { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${BTN.c[0]}px ${BTN.c[1]}px; }
.iv-aura { position:absolute; left:0; top:0; width:1000px; height:1000px; border-radius:50%;
  background:radial-gradient(closest-side, rgba(255,226,160,.42), rgba(245,209,122,.20) 34%, rgba(200,155,60,.08) 62%, rgba(200,155,60,0) 100%); }
.iv-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; }
.iv-emb { position:absolute; left:0; top:0; width:${EMB.w}px; height:${r3(EMB.h)}px; transform-origin:50% 50%;
  filter:drop-shadow(0 0 26px rgba(245,209,122,.42)) drop-shadow(0 0 70px rgba(200,155,60,.22)); }
.iv-wm { position:absolute; left:${540 - WM.w / 2}px; top:${WM.top}px; width:${WM.w}px; height:${r3(WM.h)}px; }
.iv-wm img { position:absolute; inset:0; width:100%; height:100%; }
.iv-wm b { position:absolute; inset:0; mix-blend-mode:screen;
  -webkit-mask-image:url('${F.WORDMARK}'); -webkit-mask-size:100% 100%; mask-image:url('${F.WORDMARK}'); mask-size:100% 100%;
  background:linear-gradient(105deg, rgba(255,244,214,0) 0%, rgba(255,244,214,.95) 50%, rgba(255,244,214,0) 100%) no-repeat; background-size:34% 100%; }
.iv-eye { position:absolute; left:0; right:0; top:${EYE.top}px; display:flex; align-items:center; justify-content:center; gap:26px; }
.iv-eye span { font:700 30px/1 Inter, sans-serif; color:${L.CYAN}; text-shadow:0 0 18px rgba(94,221,232,.35); white-space:nowrap; }
.iv-eye i { display:block; width:92px; height:2px; }
.iv-eye i.l { background:linear-gradient(90deg, rgba(200,155,60,0), ${L.GOLD_INK}); transform-origin:100% 50%; }
.iv-eye i.r { background:linear-gradient(90deg, ${L.GOLD_INK}, rgba(200,155,60,0)); transform-origin:0 50%; }
`;

/**
 * 10.2's clock: the brief's beats, and the music's beats the moves land on. The landing on the first beat the
 * rush can reach; the wordmark on the next bar; the trial on the beat after; the button lands on bar 34
 * ("invitation"); the press on bar 35, the beat before "Experience what we've built".
 */
function timeline() {
  const shot = shotOf("10.2");
  const t0 = beat("10.1", 0); // the dawn's clock: it carries on from 10.1 unbroken
  const tCut = beat("10.2", 0);
  const tArrive = beat("10.2", 2); // the pointer over the button
  const tHold = beat("10.2", 3);
  const tImpact = beatFrom(tCut + 0.42);
  const tWord = beatFrom(tImpact + 0.3);
  const tEye = tWord + 2 * C.PERIOD;
  const tLand = beatFrom(tEye + 0.75);
  const tRise = tLand - C.PERIOD;
  const tPress = beatFrom(tArrive + 0.3);
  if (!(tPress < tHold && tPress > tArrive))
    throw new Error("10.2: the press isn't between beats 2 and 3");
  if (!(tLand < tArrive - 0.6))
    throw new Error("10.2: the button hasn't landed before the pointer comes");
  return {
    shot,
    t0,
    tCut,
    tArrive,
    tHold,
    tImpact,
    tWord,
    tEye,
    tLand,
    tRise,
    tPress,
    tPush: tLand,
  };
}
/** Where the pointer's tip rests on the button (its own px). */
const LOCAL = [BTN.w * 0.71, BTN.h * 0.6];
/** The camera's push at t: a scale about the button's centre. */
const pushAt = (T, t) => 1 + 0.075 * span(t, T.tPush, T.shot.out, EASE.move);
const pushed = (k, [x, y]) => [BTN.c[0] + (x - BTN.c[0]) * k, BTN.c[1] + (y - BTN.c[1]) * k];
/** The button's own life at t (G-CTA's terms), so 11.1 can carry the same button on across the cut. */
function buttonLife(T, t, ptr) {
  const live = span(t, T.tLand - 0.05, T.tLand + 0.25, EASE.settle);
  const hover = span(t, T.tArrive - 0.14, T.tArrive + 0.1, EASE.settle);
  return {
    w: BTN.w,
    h: BTN.h,
    t0: T.tRise,
    hover,
    hoverAt: T.tArrive - 0.14,
    ptr: hover > 0 ? ptr : null,
    press: T.tPress,
    pulse: live,
    edge: live,
    glow: live + 0.6 * Math.exp(-Math.abs(t - T.tLand) / 0.16) * (t >= T.tLand - 0.05 ? 1 : 0),
  };
}

function invitationScene() {
  const T = timeline();
  const { t0, tCut, tArrive, tImpact, tWord, tEye, tLand, tRise, tPress } = T;

  const html = () =>
    [
      `<style>${L.dawnCss}${L.burstCss}${C.ctaCss}${css}</style>`,
      `<div class="fk-layer" style="z-index:0;background:#040B16"></div>`,
      `<div class="iv-group" id="dawn" style="z-index:1">${L.dawnHtml("dw")}</div>`,
      `<div class="iv-group" id="card" style="z-index:10">`,
      `<div class="iv-aura" id="aura" style="visibility:hidden"></div>`,
      `<div class="iv-stage"><img class="iv-emb" id="emb" src="${F.EMBLEM}" alt="" style="visibility:hidden"></div>`,
      `<div class="iv-wm" id="wm" style="visibility:hidden"><img src="${F.WORDMARK}" alt="AURIXA SYSTEMS"><b id="wm-sweep"></b></div>`,
      `<div class="iv-eye" id="eye" style="visibility:hidden"><i class="l" id="eye-l"></i><span id="eye-t">14-DAY FREE TRIAL</span><i class="r" id="eye-r"></i></div>`,
      C.ctaHtml("cta", { w: BTN.w, h: BTN.h, size: 33 }),
      L.rippleHtml("rp", 26),
      `</div>`,
      L.burstHtml("lj", { z: 9, sparks: 44, rings: 2 }),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const k = pushAt(T, t);

    // ---- the dawn: the sun flares as the emblem leaves it and is gone under the landing's flash; its warmth
    // stays on the sky, lower. The dawn is far off, so the push moves it a third as much.
    const rush = span(t, tCut, tImpact, EASE.linear);
    const after = span(t, tImpact, tImpact + 0.14, EASE.linear);
    const sun = t < tImpact ? 1 + 0.4 * EASE.move(rush) : 1.4 * (1 - after);
    const sky = t < tImpact ? sun : lerp(1.4, 0.46, span(t, tImpact, tImpact + 0.5, EASE.settle));
    const rays = t < tImpact ? 0.9 * rush : 0.9 * Math.exp(-(t - tImpact) / 0.3);
    L.dawnState(st, t, "dw", { t0, sun, sky, burst: rays });
    st.set("#dawn", { transform: `scale(${r3(1 + (k - 1) * 0.35)})` });
    st.set("#card", { transform: `scale(${r3(k)})` });

    // ---- the leap: out of the sun at the cut, rushing at the viewer (its scale growing by ratio, faster as it
    // comes, as a thing flying at you does), turning square to the camera; over-size at the landing, filling the
    // frame; then back, settling at the top of the card on ease-settle with a breath of undershoot.
    let s;
    let cy;
    let ry = 0;
    let rz = 0;
    if (t < tImpact) {
      const p = rush ** 1.8;
      s = 0.07 * (PEAK.scale / 0.07) ** p;
      cy = lerp(L.dawnAt(tCut, t0).sunY, PEAK.cy, rush * rush);
      ry = -26 * (1 - p);
      rz = -9 * (1 - rush) ** 2;
    } else {
      const v = span(t, tImpact, tImpact + 0.62, EASE.settle);
      const w = clamp01((t - tImpact - 0.18) / 0.6);
      s = 1 + (PEAK.scale - 1) * (1 - v) - 0.045 * Math.sin(Math.PI * w) * (1 - w);
      cy = lerp(PEAK.cy, EMB.cy, v);
    }
    // At the landing its own light kicks, so its edges hold as the flash goes off behind it.
    const kick = t < tImpact ? 1 + 0.35 * rush * rush : 1 + 0.42 * Math.exp(-(t - tImpact) / 0.12);
    st.set("#emb", {
      // Its turn to the camera is drawn in the plane (a 3D turn can leave a frame's drawing a layer behind).
      transform: `translate(${px(EMB.cx - EMB.w / 2)}, ${px(cy - EMB.h / 2)}) rotate(${r3(rz)}deg) scale(${r3(s * Math.cos((ry * Math.PI) / 180))}, ${r3(s)})`,
      filter: `brightness(${r3(kick)}) drop-shadow(0 0 26px rgba(245,209,122,.42)) drop-shadow(0 0 70px rgba(200,155,60,.22))`,
      ...fade(span(t, tCut, tCut + 0.06, EASE.linear)),
    });
    // Its light: the sun's, now the emblem's, breathing on the beats once it has landed.
    const landed = span(t, tImpact, tImpact + 0.5, EASE.settle);
    const aura = t < tImpact ? 0.5 * rush : lerp(1, 0.62, landed) + 0.18 * C.beatPulse(t) * landed;
    const as = 0.6 + 0.4 * Math.min(s, 1.6);
    st.set("#aura", {
      transform: `translate(${px(EMB.cx - 500)}, ${px(cy - 500)}) scale(${r3(as)})`,
      ...fade(aura),
    });
    // The landing: a flash, the shock ring (and a second, cyan), sparks; from the emblem's centre.
    L.burstState(st, t, "lj", {
      at: tImpact,
      c: [540, PEAK.cy],
      flash: 0.95,
      reach: 1500,
      spread: 720,
      sparks: 44,
      rings: 2,
      seed: 33,
    });

    // ---- AURIXA SYSTEMS sets in on the bar: opening from its centre and rising into place, then the light
    // crosses it once, kept to the letters' own shapes.
    const wp = span(t, tWord, tWord + 0.5, EASE.settle);
    st.set("#wm", {
      transform: `translateY(${px((1 - wp) * 22)})`,
      "clip-path": `inset(-10% ${r3((1 - wp) * 50)}% -10% ${r3((1 - wp) * 50)}%)`,
      ...fade(span(t, tWord, tWord + 0.3, EASE.linear)),
    });
    const sweep = span(t, tWord + 0.32, tWord + 1.2, EASE.move);
    st.set("#wm-sweep", {
      "background-position": `${r3(-60 + 200 * sweep)}% 0`,
      ...fade(t > tWord + 0.32 && sweep < 1 ? 1 : 0),
    });

    // ---- 14-DAY FREE TRIAL on the beat after: its letters closing in to the site's tracking, the gold rules
    // drawing out from it.
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

    // ---- the button rises in and lands on the bar; from then it breathes on the beats and its edge runs.
    const bp = span(t, tRise, tLand, EASE.settle);
    st.set("#cta", {
      transform: `translate(${px(BTN.left)}, ${px(BTN.top + (1 - bp) * 90)}) scale(${r3(lerp(0.86, 1, bp))})`,
      ...fade(span(t, tRise, tRise + 0.28, EASE.linear)),
    });
    // ---- the pointer: up from the lower right onto the button's label, riding the push; its press on the bar.
    const target = pushed(k, [BTN.left + LOCAL[0], BTN.top + LOCAL[1]]);
    const tip = pointer(st, t, {
      from: [1000, 1520],
      to: target,
      a: tArrive - 0.5,
      b: tArrive,
      bow: 0.1,
      show: tArrive - 0.56,
      press: tPress,
    });
    // The tip in the button's own px (undoing the push), for its spotlight and lean.
    const ptr = [
      (tip[0] - BTN.c[0]) / k + BTN.c[0] - BTN.left,
      (tip[1] - BTN.c[1]) / k + BTN.c[1] - BTN.top,
    ];
    C.ctaState(st, t, "cta", buttonLife(T, t, ptr));
    // The press throws a ripple of light out across the card from the point pressed.
    L.rippleState(st, t, "rp", {
      at: tPress,
      c: [BTN.left + LOCAL[0], BTN.top + LOCAL[1]],
      reach: 1500,
    });
    return st;
  };

  return { id: "invitation", shots: ["10.2"], palette: "aurixa", html, state };
}

module.exports = invitationScene;
// What 11.1 carries on from the cut: the button as it stands (its place, the push and its life), and where the
// pointer rests on it.
module.exports.handoff = () => {
  const T = timeline();
  return {
    BTN,
    LOCAL,
    push: (t) => pushAt(T, t),
    life: (t, ptr) => buttonLife(T, t, ptr),
    tip: (t) => pushed(pushAt(T, t), [BTN.left + LOCAL[0], BTN.top + LOCAL[1]]),
  };
};
