// Reel 1, shot 11.1 (third cut): your fourteen days begin. The press carries through: 10.2's button, carried on
// across the cut exactly as it stood (./invitation.cjs hands it over: its place, the push, its gradient's clock,
// its hover and its press), opens into a G-WINDOW: the button grows to the window's rect, its label and its light
// running out as the glass opens behind it, and in the window the Command Centre sets the trial up
// (NEW-TRIAL-SETUP, ../pages/trialSetup.cjs): three steps checking off on the music's beats, the progress bar
// filling, then "Your 14-day trial is ready" with its ring drawing round to 14 days left. A short push as the
// steps complete.
const M = require("../motion.cjs");
const C = require("../pages/cta.cjs");
const TS = require("../pages/trialSetup.cjs");
const invitation = require("./invitation.cjs");

const { beat, shotOf, span, lerp, r3, px, State, fade, whole, PAD, captionHtml, caption, EASE } = M;
const { pointerHtml, pointer } = M;

const grid = (n) => C.DROP + n * C.PERIOD;
const beatFrom = (t) => grid(Math.ceil((t - C.DROP) / C.PERIOD - 1e-6));

const css = `
.tr-wrap { position:absolute; left:0; top:0; width:1080px; height:1920px; }
.tr-light { position:absolute; left:0; top:0; width:1500px; height:1500px; border-radius:50%;
  background:radial-gradient(closest-side, rgba(94,221,232,.20), rgba(200,155,60,.10) 45%, rgba(10,25,47,0) 100%); }
`;

function trialScene() {
  const shot = shotOf("11.1");
  const tCut = beat("11.1", 0);
  const tReady = beat("11.1", 1);
  // The steps check off on the beats: the first on bar 36, the others on the two beats after it.
  const done = [beatFrom(tCut + 0.3)];
  done.push(done[0] + C.PERIOD, done[0] + 2 * C.PERIOD);
  const run = [tCut + 0.2, done[0] + 0.05, done[1] + 0.05];
  if (!(done[2] < tReady + 0.05))
    throw new Error("11.1: the steps don't finish before the trial is ready");

  // The window, whole at zoom 1 in the action zone.
  const WIN = whole(TS.SIZE, 1, [540, 830]);
  const WC = [WIN.rect[0] + WIN.rect[2] / 2, WIN.rect[1] + WIN.rect[3] / 2];
  // The button as the cut leaves it: its own px under the push about its centre, and its hover's grow.
  const B = invitation.handoff();
  const k0 = B.push(tCut);
  const grow = 1.045;
  const FROM = [
    B.BTN.c[0] - (B.BTN.w * k0 * grow) / 2,
    B.BTN.c[1] - 8 * k0 - (B.BTN.h * k0 * grow) / 2,
    B.BTN.w * k0 * grow,
    B.BTN.h * k0 * grow,
  ];
  const OPEN = 0.46; // the window's opening, on ease-settle

  const html = () =>
    [
      `<style>${TS.css}${C.ctaCss}${css}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="tr-light" id="light" style="z-index:1"></div>`,
      `<div class="tr-wrap" id="wrap" style="z-index:5">`,
      `<div class="fk-win" id="win" style="left:0;top:0"><div class="fk-page" id="win-page"><div class="fk-scale" id="win-0" style="width:${TS.SIZE[0]}px;height:${TS.SIZE[1]}px">${TS.html("ts")}</div></div></div>`,
      C.ctaHtml("mo", { w: B.BTN.w, h: B.BTN.h, size: 33, z: 8 }),
      `</div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const o = span(t, tCut, tCut + OPEN, EASE.settle);
    // The window opens out of the button: its rect from the button's to its own, the page held where it will
    // stand and shown through the opening.
    const r = FROM.map((v, i) => lerp(v, WIN.rect[i], o));
    st.set("#win", { left: px(r[0]), top: px(r[1]) });
    st.set("#win-page", { width: px(r[2] - 2 * PAD), height: px(r[3] - 2 * PAD) });
    st.set("#win-0", {
      transform: `translate(${px(WIN.rect[0] - r[0])}, ${px(WIN.rect[1] - r[1])})`,
    });
    // The button itself, carried on: the same life it had at the cut, growing with the window (in its own px,
    // under 10.2's push), its label and its light running out as the glass opens.
    const c = [lerp(B.BTN.c[0], WC[0], o), lerp(B.BTN.c[1] - 8 * k0, WC[1], o)];
    const w = lerp(B.BTN.w, WIN.rect[2] / (k0 * grow), o);
    const h = lerp(B.BTN.h, WIN.rect[3] / (k0 * grow), o);
    st.set("#mo", {
      transform: `translate(${px(c[0] - w / 2)}, ${px(c[1] + 8 * k0 - h / 2)}) scale(${r3(k0)})`,
      width: px(w),
      height: px(h),
      ...fade(1 - span(t, tCut + 0.06, tCut + 0.36, EASE.move)),
    });
    st.set("#mo .cta-label", { opacity: r3(1 - span(t, tCut, tCut + 0.12, EASE.linear)) });
    // Its lean toward the pointer eases off as it opens (the pointer's point drawn to its middle).
    const lean = [lerp(B.LOCAL[0], w / 2, o), lerp(B.LOCAL[1], h / 2, o)];
    C.ctaState(st, t, "mo", { ...B.life(t, lean), w, h });
    // The pointer, where it pressed, fading as the window takes over.
    const tip = B.tip(tCut);
    pointer(st, t, {
      from: tip,
      to: tip,
      a: tCut - 1,
      b: tCut - 0.5,
      show: tCut - 1,
      hide: tCut + 0.08,
    });
    // The button's light, behind the window, settling.
    st.set("#light", {
      transform: `translate(${px(540 - 750)}, ${px(lerp(FROM[1] + FROM[3] / 2, 830, o) - 750)})`,
      ...fade(0.5 + 0.5 * Math.exp(-(t - tCut) / 0.5)),
    });
    // A short push as the steps complete.
    const k = 1 + 0.045 * span(t, tCut + 0.3, shot.out, EASE.move);
    st.set("#wrap", { transform: `scale(${r3(k)})`, "transform-origin": "540px 830px" });
    TS.state(st, t, "ts", { run, done, ready: tReady });
    return st;
  };

  return { id: "trial", shots: ["11.1"], palette: "aurixa", html, state };
}

module.exports = trialScene;
