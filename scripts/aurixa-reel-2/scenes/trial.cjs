// Reel 2, shot 07.2: experience it yourself with a 14-day free trial, and discover what a truly connected business
// can achieve. Reel 1's invitation card (../../aurixa-reel-1/scenes/invitation.cjs), on Reel 2's clock: on the cut
// the emblem leaps out of the Command Centre's own mark (where 07.1 leaves it) at the viewer and lands with a flash,
// a shock ring and sparks, then settles at the top of the card; AURIXA SYSTEMS sets in under it, then 14-DAY FREE
// TRIAL, and the button (G-CTA, ../pages/cta.cjs, the site's prismatic button, alive) rises in and lands. The
// pointer comes over it and presses it on "14-day", the light rippling out across the card. On "discover" the
// portals light one at a time around it, each joined to the emblem by a line of light; the camera pushes slowly
// in. The emblem and the wordmark are the supplied files, never redrawn.
const M = require("../motion.cjs");
const L = require("../../aurixa-reel-1/pages/light.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const C = require("../pages/cta.cjs");
const CC = require("../cc.cjs");
const brand = require("./brand.cjs");

const { F, beat, shotOf, span, lerp, r3, px, State, fade, pointerHtml, pointer } = M;
const { windowHtml, placeWindow } = M;
const { captionHtml, caption, EASE, clamp01 } = M;

/** The film's beat n (0 is the drop) and the first beat at or after t. */
const grid = (n) => C.DROP + n * C.PERIOD;
const beatFrom = (t) => grid(Math.ceil((t - C.DROP) / C.PERIOD - 1e-6));

// The card, in frame px (Reel 1's 10.2): the emblem, the wordmark, the eyebrow and the button.
const EMB = { w: 440, h: (440 * 628) / 679, cx: 540, top: 360 };
EMB.cy = EMB.top + EMB.h / 2;
const WM = { w: 560, h: (560 * 187) / 882, top: 806 };
const EYE = { top: 954 };
const BTN = { w: 820, h: 132, left: 130, top: 1030 };
BTN.c = [BTN.left + BTN.w / 2, BTN.top + BTN.h / 2];
const PEAK = { cy: 900, scale: 2.4 };
/** Where the emblem leaves from: the Command Centre's own mark, as 07.1 leaves the window (measured, ./brand.cjs). */
const FAR = brand.ccAt(Infinity).framing;
/**
 * The emblem keyed off the art's own navy ground, as Reel 1's card shows it: emblem.png is an exact crop of the
 * supplied art, square, on that ground, so its alpha is drawn from its luminance (5 L - 0.6: the ground, L 0.06 to
 * 0.11, goes; the triangle and its light stay), and its glow then follows the triangle rather than the square.
 */
const KEY = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="iv-key" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1.063 3.576 0.361 0 -0.6"/></filter></svg>`;
/** The portals, around the emblem, lit one at a time. */
const PORTALS = [
  { label: "Client Portal", at: [168, 438] },
  { label: "Finance Portal", at: [912, 438] },
  { label: "Solicitor Portal", at: [168, 660] },
  { label: "Accountant Portal", at: [912, 660] },
  { label: "Builders Network", at: [540, 300], teal: true },
];
const CHIP = [256, 64];

const css = `
.iv-group { position:absolute; left:0; top:0; width:1080px; height:1920px; transform-origin:${BTN.c[0]}px ${BTN.c[1]}px; }
.iv-aura { position:absolute; left:0; top:0; width:1000px; height:1000px; border-radius:50%;
  background:radial-gradient(closest-side, rgba(255,226,160,.42), rgba(245,209,122,.20) 34%, rgba(200,155,60,.08) 62%, rgba(200,155,60,0) 100%); }
.iv-stage { position:absolute; left:0; top:0; width:1080px; height:1920px; }
.iv-emb { position:absolute; left:0; top:0; width:${EMB.w}px; height:${r3(EMB.h)}px; transform-origin:50% 50%;
  filter:url(#iv-key) drop-shadow(0 0 26px rgba(245,209,122,.42)) drop-shadow(0 0 70px rgba(200,155,60,.22)); }
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
.iv-chip { position:absolute; left:0; top:0; width:${CHIP[0]}px; height:${CHIP[1]}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center;
  border-radius:16px; background:linear-gradient(180deg, rgba(18,28,56,.92), rgba(8,14,30,.92)); border:1.5px solid rgba(215,179,95,.25);
  font:700 16px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.2em; text-transform:uppercase; color:#8d95a8; white-space:nowrap; transform-origin:50% 50%; }
`;

function timeline() {
  const shot = shotOf("07.2");
  const tCut = shot.in;
  const tPress = beat("07.2", 1); // "14-day"
  const tDiscover = beat("07.2", 2);
  const tImpact = beatFrom(tCut + 0.34);
  // The card sets in a beat at a time (the wordmark, the eyebrow, the button landing), or half a beat at a time
  // where "14-day" comes too soon after the cut for that: the voice reaches it 1.9 s after the cut, until the
  // music's pauses hold it open.
  const step = tImpact + 3 * C.PERIOD < tPress - 0.3 ? C.PERIOD : C.PERIOD / 2;
  const tWord = tImpact + step;
  const tEye = tWord + step;
  const tLand = tEye + step;
  const tRise = tLand - step;
  const tArrive = Math.max(tLand + 0.15, tPress - 0.42);
  if (!(tLand < tPress - 0.3)) throw new Error("07.2: the button hasn't landed before the press");
  return { shot, tCut, tPress, tDiscover, tImpact, tWord, tEye, tLand, tRise, tArrive };
}
const LOCAL = [BTN.w * 0.71, BTN.h * 0.6];
const pushAt = (T, t) => 1 + 0.06 * span(t, T.tLand, T.shot.out, EASE.move);
const pushed = (k, [x, y]) => [BTN.c[0] + (x - BTN.c[0]) * k, BTN.c[1] + (y - BTN.c[1]) * k];

function trialScene() {
  const T = timeline();
  const { tCut, tPress, tDiscover, tImpact, tWord, tEye, tLand, tRise, tArrive } = T;
  const lightAt = PORTALS.map((_, i) => tDiscover + 0.05 + i * 0.26);

  const html = () =>
    [
      S.stageCss(),
      `<style>${L.burstCss}${C.ctaCss}${css}</style>`,
      KEY,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      windowHtml("W", ["R2-CC-b"], 5),
      `<div class="iv-group" id="card" style="z-index:10">`,
      `<div class="iv-aura" id="aura" style="visibility:hidden"></div>`,
      PORTALS.map((p, i) => S.lineHtml(`pl-${i}`, 1)).join(""),
      PORTALS.map(
        (p, i) =>
          `<div class="iv-chip" id="pc-${i}" style="z-index:2;visibility:hidden">${p.label}</div>`,
      ).join(""),
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
    st.set("#card", { transform: `scale(${r3(k)})` });

    // The Command Centre as 07.1 leaves it (every part lit, on its floor), falling away as the emblem leaves its
    // own mark: the mark in the window gives way to the emblem at the cut, at the mark's size and place.
    const away = span(t, tCut, tImpact, EASE.move);
    const g = placeWindow(st, "W", CC.CSS, FAR, [1], {
      opacity: 1 - away,
      transform: `translateY(${px(away * 40)})`,
    });
    for (const label of CC.DOCKED) CC.lightEntry(st, CC.entry(label), 1, 1, ["#W-0"]);
    st.set("#W-0 .cside .tenant .emb", fade(t < tCut ? 1 : 0));
    S.floorState(st, "floor", { horizon: brand.HORIZON, flow: brand.flowAt(t), opacity: 1 - away });
    S.shadowState(st, "W-shadow", {
      cx: FAR.at[0],
      foot: FAR.rect[1] + FAR.rect[3],
      width: FAR.rect[2],
      opacity: 1 - away,
    });
    const [mx, my, mw, mh] = m.emb;
    const FROM = { c: g.map([mx + mw / 2, my + mh / 2]), w: mw * FAR.zoom };

    // The leap: out of the Command Centre's mark at the cut, rushing at the viewer, faster as it comes; over-size
    // at the landing, filling the frame; then back, settling at the top of the card.
    const rush = span(t, tCut, tImpact, EASE.linear);
    let s;
    let cx;
    let cy;
    if (t < tImpact) {
      const p = rush ** 1.8;
      const s0 = FROM.w / EMB.w;
      s = s0 * (PEAK.scale / s0) ** p;
      cx = lerp(FROM.c[0], 540, rush * rush);
      cy = lerp(FROM.c[1], PEAK.cy, rush * rush);
    } else {
      const v = span(t, tImpact, tImpact + 0.62, EASE.settle);
      const w = clamp01((t - tImpact - 0.18) / 0.6);
      s = 1 + (PEAK.scale - 1) * (1 - v) - 0.045 * Math.sin(Math.PI * w) * (1 - w);
      cx = 540;
      cy = lerp(PEAK.cy, EMB.cy, v);
    }
    const kick = t < tImpact ? 1 + 0.35 * rush * rush : 1 + 0.42 * Math.exp(-(t - tImpact) / 0.12);
    st.set("#emb", {
      transform: `translate(${px(cx - EMB.w / 2)}, ${px(cy - EMB.h / 2)}) scale(${r3(s)})`,
      filter: `url(#iv-key) brightness(${r3(kick)}) drop-shadow(0 0 26px rgba(245,209,122,.42)) drop-shadow(0 0 70px rgba(200,155,60,.22))`,
      ...fade(span(t, tCut, tCut + 0.05, EASE.linear)),
    });
    const landed = span(t, tImpact, tImpact + 0.5, EASE.settle);
    const aura = t < tImpact ? 0.5 * rush : lerp(1, 0.62, landed) + 0.18 * C.beatPulse(t) * landed;
    st.set("#aura", {
      transform: `translate(${px(cx - 500)}, ${px(cy - 500)}) scale(${r3(0.6 + 0.4 * Math.min(s, 1.6))})`,
      ...fade(aura),
    });
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

    // AURIXA SYSTEMS on the next beat: opening from its centre and rising into place, then the light crosses it.
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
    // 14-DAY FREE TRIAL on the beat after: its letters closing in, the gold rules drawing out from it.
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
      from: [1000, 1520],
      to: target,
      a: tArrive - 0.42,
      b: tArrive,
      bow: 0.1,
      show: tArrive - 0.48,
      hide: tPress + 0.9,
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

    // The portals, on "discover": each in and lit in turn, a line of light running to it from the emblem.
    PORTALS.forEach((p, i) => {
      const a = span(t, lightAt[i] - 0.12, lightAt[i] + 0.3, EASE.settle);
      const lit = span(t, lightAt[i], lightAt[i] + 0.25, EASE.linear);
      const flare = t >= lightAt[i] ? 1 + 1.2 * Math.exp(-(t - lightAt[i]) / 0.3) : 1;
      const gold = p.teal ? "0,168,181" : "215,179,95";
      st.set(`#pc-${i}`, {
        transform: `translate(${px(p.at[0] - CHIP[0] / 2)}, ${px(p.at[1] - CHIP[1] / 2)}) scale(${r3(lerp(0.9, 1, a))})`,
        "border-color": `rgba(${gold},${r3(lerp(0.25, 0.85, lit))})`,
        color: lit > 0.5 ? (p.teal ? "#22c3ce" : "#f5d17a") : "#8d95a8",
        "box-shadow": `0 0 ${r3(22 * lit * flare)}px rgba(${gold},${r3(0.45 * lit)})`,
        ...fade(a),
      });
      const dx = p.at[0] - 540;
      const dy = p.at[1] - EMB.cy;
      const len = Math.hypot(dx, dy);
      const from = [540 + (dx / len) * 170, EMB.cy + (dy / len) * 150];
      S.lineState(st, `pl-${i}`, from, p.at, {
        drawn: span(t, lightAt[i] - 0.1, lightAt[i] + 0.25, EASE.move),
        opacity: 0.8,
      });
    });
    return st;
  };

  return {
    id: "trial",
    shots: ["07.2"],
    palette: "aurixa",
    html,
    measure: { emb: ["#W-0", ".cside .tenant .emb"] },
    state,
  };
}

module.exports = trialScene;
