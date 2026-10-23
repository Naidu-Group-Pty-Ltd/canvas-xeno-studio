// Reel 2, shot 05.2: authorised property partners can securely access the client's Compliance Passport, in just a
// few clicks. The Command Centre's case workspace for Jordan Ellis at Stage 9, Passport & Partners (the product's
// own CaseStageWorkspace, drawn by the screens harness, under the Command Centre's bar): the three partners on the
// matter. On "partners" the camera moves in and the pointer comes to Send the Passport on Shah Legal's row; on
// "securely" it presses, Shah Legal's row turns to "They hold a live Passport", and SOLICITOR PASSPORT SHARED is
// struck. On "access" the film cuts to Priya Shah's Solicitor Portal (the product's own portal, with its DEMO
// WORKSPACE label): click one, on "just", AML/CTF Compliance; click two, on "clicks", Jordan Ellis's matter, and the
// same Passport opens, its booklet in the partner's view.
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
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

const BAR = {
  portal: "COMMAND CENTRE",
  page: "AML/CTF Compliance · Jordan Ellis",
  emblem: F.EMBLEM,
};
const ISSUED = K2.screenPlate("case-issued", { bar: BAR });
const SENT = K2.screenPlate("case-sent", { bar: BAR });
// The matter's screen kept to CSS y 830: the Passport's first leaf carries the product's banner at its foot
// (VERIFIED · TRUSTED · COMPLIANT, from y 837 on this screen), and the reel says "compliant" nowhere. The camera
// never looks below y 830 once the matter is open.
const KEEP = 830;
const DASH = K2.screenPlate("solicitor-dashboard");
const COMPLIANCE = K2.screenPlate("solicitor-compliance");
const MATTER = K2.screenPlate("solicitor-matter", { to: KEEP });
const STAMP = "r2-ink-solicitor.png";
const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];

function shareScene() {
  const s = shotOf("05.2");
  const [T0, TP, TS, TA, TJ, TK] = [0, 1, 2, 3, 4, 5].map((i) => beat("05.2", i));
  const END = s.out;

  // The case page (drawn 860 CSS px wide, so it reads), whole with its bar, drifting in a touch.
  const A0 = whole(ISSUED.css, 1.16, [540, 820]);
  const A1 = whole(ISSUED.css, 1.19, [540, 830]);
  const send = centre(ISSUED.at("send:Shah Legal"));
  // The Solicitor Portal whole (its top bar's DEMO WORKSPACE label in view), then in on its top left (its menu and
  // its matters, down to y 830) for the clicks; then, as the Passport opens, across to it, its foot at the page's
  // foot.
  const BW = whole(DASH.css, 0.72, [540, 800]);
  const RECT = [18, 352, 1044, 950];
  const PAGE = [RECT[0] + 14, RECT[1] + 14, RECT[2] - 28, RECT[3] - 28];
  const B0 = { rect: RECT, zoom: PAGE[3] / KEEP, focus: [0, 0], at: [PAGE[0], PAGE[1]] };
  const board = MATTER.at("passport:board");
  const B1 = {
    rect: RECT,
    zoom: 1.25,
    focus: [board[0] + board[2] / 2, KEEP],
    at: [PAGE[0] + PAGE[2] / 2, PAGE[1] + PAGE[3]],
  };

  const html = () =>
    [
      `<style>${K2.barCss}${K2.stampCss}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("A", [ISSUED.name, SENT.name], 5),
      K2.stampHtml("st-shared", `https://reel-bake.local/${STAMP}`, K2.INK_SIZE, 30),
      windowHtml("B", [DASH.name, COMPLIANCE.name, MATTER.name], 6),
      `<div class="fk-layer" style="z-index:40">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const inA = t < TA;
    if (inA) {
      // ---------------------------------------------------------------- the Command Centre
      const rise = span(t, T0, T0 + 0.35, EASE.settle);
      const push = span(t, T0, TS, EASE.linear);
      const framing = between(ISSUED.css, A0, A1, push);
      const sent = span(t, TS + 0.04, TS + 0.14, EASE.linear);
      const g = placeWindow(st, "A", ISSUED.css, framing, [1, sent], {
        opacity: rise,
        transform: `translateY(${px(lerp(40, 0, rise))})`,
      });
      st.set("#B", fade(0));
      const button = g.map(send);
      pointer(st, t, {
        from: [button[0] + 160, button[1] + 380],
        to: [button[0] - 20, button[1] + 4],
        a: TP - 0.2,
        b: TS - 0.08,
        show: TP - 0.3,
        press: TS,
      });
      // SOLICITOR PASSPORT SHARED, struck over Shah Legal's row as it turns live.
      const row = g.map(centre(ISSUED.at("row:Shah Legal")));
      K2.stampState(st, t, "st-shared", {
        at: TS + 0.12,
        x: Math.min(row[0], 470),
        y: row[1] - 150,
        size: K2.INK_SIZE,
        tilt: 6,
      });
      return st;
    }
    // ------------------------------------------------------------------ the Solicitor Portal
    st.set("#A", fade(0));
    st.set("#st-shared", fade(0));
    st.set("#st-shared-flash", fade(0));
    const rise = span(t, TA, TA + 0.3, EASE.settle);
    const inward = span(t, TA + 0.75, TJ - 0.55, EASE.move);
    const framing =
      t < TK
        ? between(DASH.css, BW, B0, inward)
        : between(MATTER.css, B0, B1, span(t, TK + 0.08, END, EASE.move));
    const compliance = span(t, TJ + 0.04, TJ + 0.12, EASE.linear);
    const matter = span(t, TK + 0.04, TK + 0.14, EASE.linear);
    const g = placeWindow(st, "B", MATTER.css, framing, [1, compliance, matter], {
      opacity: rise,
    });
    const nav = g.map(centre(DASH.at("nav:AML/CTF Compliance")));
    const row = g.map(centre(COMPLIANCE.at("matter:Jordan Ellis")));
    if (t < TJ + 0.12)
      pointer(st, t, {
        from: [nav[0] + 640, nav[1] + 420],
        to: [nav[0] - 40, nav[1] + 4],
        a: TJ - 0.75,
        b: TJ - 0.06,
        show: TJ - 0.85,
        press: TJ,
      });
    else
      pointer(st, t, {
        from: [nav[0] - 40, nav[1] + 4],
        to: [row[0] - 50, row[1] + 4],
        a: TJ + 0.12,
        b: TK - 0.05,
        show: TA,
        hide: TK + 0.35,
        press: TK,
      });
    return st;
  };

  return {
    id: "share",
    shots: ["05.2"],
    palette: "aurixa",
    html,
    state,
    bake: () => [
      {
        name: STAMP,
        width: K2.INK_SIZE[0],
        height: K2.INK_SIZE[1],
        html: K2.inkStamp({
          title: "Solicitor passport<br>shared",
          date: "09 OCT 2026 · 10:15",
          name: "Shah Legal",
          size: 33,
        }),
      },
    ],
  };
}

module.exports = shareScene;
