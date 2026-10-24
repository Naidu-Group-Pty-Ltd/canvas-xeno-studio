// Reel 2, shot 05.1: with appropriate consent and controlled access. The Client Portal's Identity & Compliance page,
// at the consent Jordan Ellis gives for sharing (the product's own card, drawn by the screens harness: "Sharing your
// completed verification with partner organisations"), under the portal's bar with its DEMO WORKSPACE label. On
// "consent" the pointer ticks "I have read this and I consent." and presses "I confirm — continue", and CLIENT
// CONSENT RECORDED is struck beside it, an ink impression of the product's own stamp. On "controlled" the page
// recedes, into 05.2.
const M = require("../motion.cjs");
const K2 = require("../kit2.cjs");

const {
  shotOf,
  beat,
  EASE,
  span,
  lerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  whole,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

const BAR = { portal: "CLIENT PORTAL", page: "Identity &amp; Compliance", emblem: F.EMBLEM };
/** The card from just above the sharing consent down (CSS y 760 of the capture), under the portal's bar. */
const OPEN = K2.screenPlate("consent-open", { bar: BAR, from: 760 });
const TICKED = K2.screenPlate("consent-ticked", { bar: BAR, from: 760 });
const ZOOM = 1.34;
const AT = [540, 820];
const STAMP = "r2-ink-consent.png";

function consentScene() {
  const s = shotOf("05.1");
  const [T0, TC, TR] = [0, 1, 2].map((i) => beat("05.1", i));
  const END = s.out;
  // The tick, then the confirm, then the stamp: all on "consent".
  const tick = TC - 0.12;
  const confirm = TC + 0.36;
  const strike = confirm + 0.1;

  const html = () =>
    [
      `<style>${K2.barCss}${K2.stampCss}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="fk-layer" id="rec" style="z-index:2;transform-origin:540px 820px">`,
      windowHtml("C", [OPEN.name, TICKED.name], 5),
      K2.stampHtml("st-consent", `https://reel-bake.local/${STAMP}`, K2.INK_SIZE, 30),
      `</div>`,
      `<div class="fk-layer" style="z-index:40">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The page: up on the cut, settling in a touch; then receding on "controlled".
    const rise = span(t, T0, T0 + 0.4, EASE.settle);
    const framing = whole(OPEN.css, ZOOM * lerp(0.97, 1, span(t, T0, TR, EASE.move)), AT);
    const ticked = span(t, tick + 0.02, tick + 0.1, EASE.linear);
    const g = placeWindow(st, "C", OPEN.css, framing, [1, ticked], {
      opacity: rise,
      transform: `translateY(${px(lerp(46, 0, rise))})`,
    });
    const recede = span(t, TR, END, EASE.move);
    st.set("#rec", {
      transform: `translateY(${px(-60 * recede)}) scale(${r3(lerp(1, 0.82, recede))})`,
      opacity: r3(1 - 0.75 * recede),
    });
    // The pointer: to the consent's tick, then to I confirm — continue.
    const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];
    const tickRow = OPEN.at("tick:compliance_sharing");
    const box = g.map([tickRow[0] + 9, tickRow[1] + tickRow[3] / 2]);
    const button = g.map(centre(OPEN.at("confirm:true")));
    if (t < tick + 0.12)
      pointer(st, t, {
        from: [box[0] + 520, box[1] + 330],
        to: [box[0] + 6, box[1] + 6],
        a: T0 + 0.25,
        b: tick - 0.05,
        show: T0 + 0.2,
        press: tick,
      });
    else
      pointer(st, t, {
        from: [box[0] + 6, box[1] + 6],
        to: [button[0] - 30, button[1] + 6],
        a: tick + 0.12,
        b: confirm - 0.05,
        show: T0,
        hide: TR + 0.2,
        press: confirm,
      });
    // CLIENT CONSENT RECORDED, struck beside the button.
    K2.stampState(st, t, "st-consent", {
      at: strike,
      x: button[0] - 430,
      y: button[1] - 40,
      size: K2.INK_SIZE,
      tilt: -7,
    });
    return st;
  };

  return {
    id: "consent",
    shots: ["05.1"],
    palette: "aurixa",
    html,
    state,
    bake: () => [
      {
        name: STAMP,
        width: K2.INK_SIZE[0],
        height: K2.INK_SIZE[1],
        html: K2.inkStamp({
          title: "Client consent<br>recorded",
          date: "08 OCT 2026 · 09:12",
          name: "Jordan Ellis",
        }),
      },
    ],
  };
}

module.exports = consentScene;
