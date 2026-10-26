// Reel 3, shots 08.1 to 08.3: your client gains clarity and transparency, and the broker gains context. Your business
// gains momentum. One portal at a time.
//  - 08.1: Jordan's Client Portal, Reports (the product's own PortalReports, drawn by the screens harness): the Snapshot
//    published to him, under its Borrowing Capacity label, "Borrowing Capacity – $1,111,628 (green)". The camera comes
//    in on it; Download Report is pressed on "transparency", and the Snapshot's own cover rises out of the card (the
//    product's own page, drawn by its renderer): AURIXA SYSTEMS · PROPERTY, BORROWING CAPACITY SNAPSHOT, Jordan
//    Ellis. Only the cover's head comes out above the card; its dates stay behind it (the Snapshot drawn for the film
//    is the one 06.4 shows, of the assessment before this one, and its date line is the product's UTC defect).
//  - 08.2: back in Jamie's Finance Portal, Jordan's profile, its parts laid out one under another rather than scrolled
//    through (the mirror card's email line and the property team sit between them on the page): the header, "11 of
//    13 sections accessible"; the tabs he may open, Documents, Borrowing Capacity and Message Hub; and, on "context",
//    the assessment's Inputs used. G-HANDOVER's line comes back down into them.
//  - 08.3: Jordan's Deals tab, the deal's journey (DealJourneyStrip on the product's own lifecycle): at Onboarding, and
//    on "momentum" it moves on to Advisory, Strategy Confirmed.
// The product's tooltip on the Advisory stage ("Strategy agreed before anything is committed.") is a title attribute,
// drawn by the browser on hover only, so it is not in any capture and the film does not set it.
const M = require("../motion.cjs");
const K3 = require("../kit3.cjs");
const G = require("../g-handover.cjs");

const {
  shotOf,
  beat,
  frameOf,
  FPS,
  EASE,
  span,
  lerp,
  px,
  r3,
  State,
  fade,
  throughRect,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
} = M;

const CP = K3.screenPlate("cp-reports");
const COVER = K3.screen("snap-p1");
const HEADER = K3.screenPlate("fp-profile-header");
const TABS = K3.screenPlate("fp-profile-bc", { from: 815, to: 885 });
const PANEL = K3.screenPlate("fp-bc-panel");
const J1 = K3.screenPlate("clients-ws-deal-onboarding-journey", { from: 280 });
const J2 = K3.screenPlate("clients-ws-deal-advisory-journey", { from: 280 });

const CP_BAR = { portal: "CLIENT PORTAL", page: "Reports" };
const FP_BAR = { portal: "FINANCE PORTAL", page: "Jordan Ellis" };
const DEAL_BAR = { portal: "COMMAND CENTRE", page: "Jordan Ellis · Deals" };

const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];
/** Where a cut inside the scene falls: on the frame boundary before the shot's first frame (see ./handover.cjs). */
const cutOf = (shot) => (frameOf(shot.in) - 0.5) / FPS;
/** The cover's width on the frame, px. */
const COVER_W = 468;
const COVER_K = COVER_W / COVER.css[0];

const css = `
.gn-sleeve { position:absolute; left:0; top:0; width:1080px; overflow:hidden; z-index:4; pointer-events:none; }
.gn-cover { position:absolute; left:0; top:0; width:${COVER_W}px; height:${r3(COVER.css[1] * COVER_K)}px; border-radius:3px; overflow:hidden;
  box-shadow:0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(215,179,95,.3); }
.gn-cover img { display:block; width:100%; height:100%; }
.gn-cover i { position:absolute; top:-20%; bottom:-20%; width:30%; left:0; mix-blend-mode:screen;
  background:linear-gradient(90deg, rgba(255,236,190,0), rgba(255,236,190,.32) 50%, rgba(255,236,190,0)); }
`;

function gainsScene() {
  const s1 = shotOf("08.1");
  const s2 = shotOf("08.2");
  const s3 = shotOf("08.3");
  const [TREPORT, TOPENS] = [0, 1].map((i) => beat("08.1", i));
  const [TPROFILE, TCONTEXT] = [0, 1].map((i) => beat("08.2", i));
  const [TONBOARD, TADVISORY] = [0, 1].map((i) => beat("08.3", i));

  // ---------------------------------------------------------------- 08.1
  const P1 = G.frameRegion([320, 36, 760, 470], 1.3, [540, 760]);
  // In on the card in the middle of the frame; then, as the cover comes out of it, the card drops to make room.
  const P2 = G.frameRegion([330, 352, 560, 144], 1.6, [540, 770]);
  const P3 = G.frameRegion([330, 352, 560, 144], 1.6, [540, 1030]);
  const pressDl = TOPENS - 0.06;
  const rise = TOPENS - 0.02;
  // The cover ends with its head above the card, its dates behind it (the window's top edge is the sleeve's foot).
  const COVER_TOP = 360;

  // ---------------------------------------------------------------- 08.2: three parts of Jordan's profile
  const H1 = G.frameRegion([0, 0, 640, 130], 1.4, [540, 0]);
  const T1 = G.frameRegion([905, 8, 500, 56], 1.85, [540, 0], false);
  const I1 = G.frameRegion([0, 305, 548, 255], 1.35, [540, 0], false);
  const GAP = 16;
  // Where each sits: the header and the tabs together, centred, then the stack up to make room for the inputs.
  const stack = (withInputs) => {
    const hH = H1.rect[3];
    const tH = T1.rect[3];
    const iH = I1.rect[3];
    const total = withInputs ? hH + tH + iH + 2 * GAP : hH + tH + GAP;
    const top = withInputs ? 1190 - total : 700 - total / 2;
    return [top + hH / 2, top + hH + GAP + tH / 2, top + hH + GAP + tH + GAP + iH / 2];
  };
  const [hA, tA] = stack(false);
  const [hB, tB, iB] = stack(true);

  // ---------------------------------------------------------------- 08.3: the deal's journey
  // Both end in the gap after Our Next Step (x 675–683), so no sliver of the third card shows at the window's edge.
  const Q1 = G.frameRegion([46, 50, 633, 370], 1.48, [540, 770]);
  const Q2 = G.frameRegion([52, 50, 627, 370], 1.56, [540, 770]);

  const html = () =>
    [
      `<style>${K3.labelCss}${G.css}${css}</style>`,
      G.stageCss(),
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="gn-sleeve" id="sleeve" style="height:0px"><div class="gn-cover" id="cover"><img src="${COVER.src}" alt=""><i id="cover-sheen"></i></div></div>`,
      G.windowHtml("WP", [CP.name], 5, CP_BAR),
      G.windowHtml("WH", [HEADER.name], 6, FP_BAR),
      G.windowHtml("WT", [TABS.name], 6),
      G.windowHtml("WI", [PANEL.name], 6),
      G.windowHtml("WJ", [J1.name, J2.name], 5, DEAL_BAR),
      G.lineHtml("L1", 4),
      G.lineHtml("L2", 4),
      G.dotHtml("D1", 11),
      G.dotHtml("D2", 11),
      G.dotHtml("D3", 11),
      G.ringHtml("R1", 12),
      G.ringHtml("R2", 12),
      G.flareHtml("FL", 13),
      focusHtml(),
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const hide = (st, ids) => ids.forEach((id) => st.set(id, { opacity: "0", visibility: "hidden" }));

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The label: up from 07.4, through the client's report and the broker's inputs; away as the deal's journey comes
    // in, which carries no figure.
    K3.labelState(st, t, { a: cutOf(s1), b: s3.in + 0.3, inAtCut: true });
    const in1 = t < cutOf(s2);
    const in2 = t >= cutOf(s2) && t < cutOf(s3);
    const in3 = t >= cutOf(s3);
    hide(st, [
      "#WP-glow",
      "#WH-glow",
      "#WT-glow",
      "#WI-glow",
      "#WJ-glow",
      "#WH-sheen",
      "#WT-sheen",
    ]);

    // ---------------------------------------------------------------- 08.1: the client's report
    if (in1) {
      const settle = span(t, s1.in, s1.in + 0.5, EASE.settle);
      const push = span(t, TREPORT - 0.08, TREPORT + 0.55, EASE.move);
      const drop = span(t, pressDl + 0.04, pressDl + 0.5, EASE.move);
      const f = G.shift(
        G.mix(G.mix(P1, P2, push), P3, drop),
        0,
        24 * (1 - settle),
        lerp(0.975, 1, settle),
      );
      const g = G.place(st, "WP", CP.css, f, [1]);
      G.sheen(st, t, "WP", TREPORT + 0.45, TREPORT + 1.2, 0.6);
      corners(st, t, throughRect(g, [400, 372, 320, 38]), TREPORT + 0.5, TREPORT + 0.82, {
        inset: 8,
      });
      const dl = centre(throughRect(g, [407, 436, 149.1, 32]));
      pointer(st, t, {
        from: [dl[0] + 360, dl[1] + 300],
        to: [dl[0] + 12, dl[1] + 6],
        a: pressDl - 0.48,
        b: pressDl - 0.05,
        show: pressDl - 0.52,
        press: pressDl,
      });
      // The cover, out of the card: the sleeve ends at the window's top edge, so only what has come above it shows.
      const up = span(t, rise, rise + 0.62, EASE.move);
      const top = lerp(f.rect[1] + 12, COVER_TOP, up);
      st.set("#sleeve", { height: px(f.rect[1] + 10), ...fade(up > 0 ? 1 : 0) });
      st.set("#cover", {
        transform: `translate(${px(540 - COVER_W / 2)}, ${px(top)}) rotate(${r3(-1.4 * (1 - up))}deg)`,
      });
      const sweep = span(t, rise + 0.35, rise + 1.05, EASE.move);
      st.set("#cover-sheen", {
        transform: `translateX(${r3(-100 + 460 * sweep)}%) skewX(-16deg)`,
        ...fade(sweep > 0 && sweep < 1 ? Math.sin(Math.PI * sweep) : 0),
      });
    } else {
      hide(st, ["#WP", "#WP-sheen", "#sleeve", "#fk-ptr", "#fk-ring"]);
    }

    // ---------------------------------------------------------------- 08.2: the broker's context
    if (in2) {
      const shiftUp = span(t, TCONTEXT - 0.28, TCONTEXT + 0.3, EASE.move);
      const yH = lerp(hA, hB, shiftUp);
      const yT = lerp(tA, tB, shiftUp);
      // On the cut the header is there already, settling; the tabs follow it in at once.
      const inH = span(t, s2.in - 0.25, s2.in + 0.3, EASE.settle);
      const inT = span(t, s2.in - 0.02, s2.in + 0.4, EASE.settle);
      const inI = span(t, TCONTEXT - 0.12, TCONTEXT + 0.38, EASE.settle);
      const fh = G.shift(G.shift(H1, 0, yH - (H1.rect[1] + H1.rect[3] / 2)), 0, 30 * (1 - inH));
      const ft = G.shift(G.shift(T1, 0, yT - (T1.rect[1] + T1.rect[3] / 2)), 0, 40 * (1 - inT));
      const fi = G.shift(G.shift(I1, 0, iB - (I1.rect[1] + I1.rect[3] / 2)), 0, 60 * (1 - inI));
      const gh = G.place(st, "WH", HEADER.css, fh, [1], { opacity: inH });
      const gt = G.place(st, "WT", TABS.css, ft, [1], { opacity: inT });
      const gi = G.place(st, "WI", PANEL.css, fi, [1], { opacity: inI });
      G.sheen(st, t, "WI", TCONTEXT + 0.15, TCONTEXT + 0.95, 0.7);
      // What he may see: the sections line, then the Borrowing Capacity tab lit.
      corners(st, t, throughRect(gh, [138, 66, 160, 30]), TPROFILE + 0.05, TPROFILE + 0.36, {
        inset: 7,
      });
      G.ringState(
        st,
        t,
        "R1",
        throughRect(gt, [1053.1, 12, 155, 38]),
        TPROFILE + 0.45,
        Infinity,
        6,
      );
      // G-HANDOVER, back as context: down into the header, then from the tab to the inputs.
      const hTop = [fh.rect[0] + fh.rect[2] / 2, fh.rect[1] + 2];
      const from0 = [hTop[0], 290];
      G.lineState(st, "L1", from0, hTop, {
        drawn: span(t, s2.in + 0.05, s2.in + 0.5, EASE.move),
        opacity: 1 - span(t, TCONTEXT - 0.2, TCONTEXT + 0.1, EASE.linear),
      });
      G.dotState(st, "D1", from0, hTop, (t - (s2.in + 0.18)) / 0.42);
      const tab = centre(throughRect(gt, [1053.1, 12, 155, 38]));
      const tabFoot = [tab[0], ft.rect[1] + ft.rect[3] - 4];
      const iTop = [Math.min(fi.rect[0] + fi.rect[2] - 60, tab[0]), fi.rect[1] + 2];
      G.lineState(st, "L2", tabFoot, iTop, {
        drawn: span(t, TCONTEXT - 0.02, TCONTEXT + 0.32, EASE.move),
      });
      G.dotState(st, "D2", tabFoot, iTop, (t - (TCONTEXT + 0.12)) / 0.4);
      void gi;
    } else hide(st, ["#WH", "#WT", "#WI", "#WI-sheen", "#L1", "#L2", "#D1", "#D2", "#R1"]);

    // ---------------------------------------------------------------- 08.3: the deal's momentum
    if (in3) {
      const settle = span(t, s3.in, s3.in + 0.5, EASE.settle);
      const drift = span(t, s3.in, s3.out, EASE.move);
      const f = G.shift(G.mix(Q1, Q2, drift), 0, 26 * (1 - settle), lerp(0.975, 1, settle));
      const moved = span(t, TADVISORY - 0.02, TADVISORY + 0.14, EASE.linear);
      const g = G.place(st, "WJ", J1.css, f, [1, moved]);
      G.sheen(st, t, "WJ", TADVISORY + 0.02, TADVISORY + 0.85, 0.75);
      // At Onboarding: the focus on it. Then a light runs along the journey to Advisory, which lights as it lands.
      const onb = throughRect(g, [63, 260.5, 103.8, 28]);
      const adv = throughRect(g, [177.7, 260.5, 87, 28]);
      if (t < TADVISORY - 0.1) corners(st, t, onb, TONBOARD - 0.05, TONBOARD + 0.28, { inset: 7 });
      else corners(st, t, adv, TADVISORY + 0.05, TADVISORY + 0.32, { inset: 7 });
      const a = [onb[0] + onb[2] + 4, onb[1] + onb[3] / 2];
      const b = [adv[0] - 4, adv[1] + adv[3] / 2];
      G.dotState(st, "D3", a, b, (t - (TADVISORY - 0.3)) / 0.3);
      G.ringState(st, t, "R2", adv, TADVISORY, Infinity, 5);
      G.flareState(st, t, "FL", centre(adv), TADVISORY, 150);
    } else hide(st, ["#WJ", "#WJ-sheen", "#D3", "#R2", "#FL-bloom", "#FL-shock"]);
    if (in2 && t < TPROFILE + 0.05) hide(st, ["#focus"]);
    return st;
  };

  return { id: "gains", shots: ["08.1", "08.2", "08.3"], palette: "aurixa", html, state };
}

module.exports = gainsScene;
