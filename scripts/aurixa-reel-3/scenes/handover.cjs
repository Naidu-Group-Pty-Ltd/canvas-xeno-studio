// Reel 3, shots 07.1 to 07.3: ready for the next step? One click, one connected handover. Share assessments and
// scenarios directly with yours or their allocated finance broker.
//  - 07.1: Jordan's Overview, its Team & Partners card (ClientTeamPartnersCard, drawn by the screens harness on the
//    product's own functions): on "next step" the pointer presses the Finance tile and the card opens Finance Partners,
//    "Finance officers with portal access to this client", with Jamie Chen already on it.
//  - 07.2: the Borrowing Capacity page with the chosen scenario on it (14 Wattle Grove · car loan repaid, loaded into
//    the calculator), and the assessment it gives under it: Save is pressed on "click", and on "handover" the product's
//    own toast lands: Scenario "14 Wattle Grove · car loan repaid" saved as the current assessment. There is no send:
//    a finance partner allocated to the client sees every saved assessment in their own portal (PLAN.md 6.5), so this
//    save is the handover.
//  - 07.3: G-HANDOVER. The saved assessment lifts off the calculator on "Share"; a line of light runs down to the
//    Finance Partners card, and the assessment rides it in; the card's two doors light on "yours" (Assign existing)
//    and "their" (Invite new); the camera runs along to Jamie Chen, the broker allocated; and the line runs on to
//    Jamie's Finance Portal, which flares as it lands on "broker". ./broker.cjs opens on that window exactly where
//    this leaves it (g-handover.cjs PORTAL_ARRIVAL).
// Out of frame throughout: the workspace's toolbar (its two "(legacy layout)" buttons), the Proposed Loan Check (its
// "Serviceable" badge) between the page's header and the assessment, and the page's last-saved line.
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

// The plates. Team & Partners from just below the card above it, in both captures, so the card sits at the same
// place in each (the Finance capture is scrolled 164 px further).
const TEAM = K3.screenPlate("clients-ws-team", { from: 662 });
const FIN = K3.screenPlate("clients-ws-finance", { from: 498 });
// The calculator's header strip: its tabs, Save and Recalculate, and the Scenario Active banner (y 140 to 282).
const CALC = K3.screenPlate("bc-calc-scenario", { from: 140, to: 282 });
const CALC_SAVED = K3.screenPlate("bc-calc-saved", { from: 140, to: 282 });
// The assessment, as the Results panel draws it: BORROWING CAPACITY, its bar and the stress test (y 553 to 705, x 757
// to 1405, measured on the capture's own border). The Proposed Loan Check above it ends at 537.
const BOX_PLATE = K3.screenPlate("bc-calc-scenario", { from: 520, to: 740 });
const BOX = [751, 27, 660, 164];
const PORTAL = K3.screenPlate("fp-clients");

const CC_BAR = { portal: "COMMAND CENTRE", page: "Jordan Ellis · Overview" };
const CALC_BAR = { portal: "COMMAND CENTRE", page: "Borrowing Capacity" };
const DOORS_BAR = { portal: "COMMAND CENTRE", page: "Team &amp; Partners" };

const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];
/**
 * Where a cut inside the scene falls: between the frame before the shot's first frame and that frame, as the renderer
 * cuts between scenes, so no subframe of the shot's first frame shows the shot before it (a cut at the shot's time in
 * seconds lands a frame late wherever that time rounds down, and the shutter then blends the two shots).
 */
const cutOf = (shot) => (frameOf(shot.in) - 0.5) / FPS;
/** A framing moved so its window's top edge is at `top`. */
const topAt = (f, top) => G.shift(f, 0, top - f.rect[1]);

function handoverScene() {
  const s1 = shotOf("07.1");
  const s2 = shotOf("07.2");
  const s3 = shotOf("07.3");
  const TFIN = beat("07.1", 1);
  const [TCLICK, TTOAST] = [0, 1].map((i) => beat("07.2", i));
  const [TSHARE, TYOURS, TTHEIR, TBROKER] = [0, 1, 2, 3].map((i) => beat("07.3", i));

  // ---------------------------------------------------------------- 07.1: Command Center and Finance, then Jamie
  const F1a = topAt(G.frameRegion([40, 24, 520, 176], 1.9, [540, 0]), 404);
  const F1b = topAt(G.frameRegion([40, 24, 520, 312], 1.9, [540, 0]), 404);
  const press1 = TFIN - 0.08;

  // ---------------------------------------------------------------- 07.2: Save, then along to the banner
  const FA1 = G.frameRegion([1050, 4, 390, 134], 2.35, [540, 588]);
  const FA2 = G.frameRegion([0, 4, 390, 134], 2.35, [540, 588]);
  const FB1 = G.frameRegion(BOX, 1.42, [540, 952], false);
  const press2 = TCLICK;

  // ---------------------------------------------------------------- 07.3: the path down to the broker's portal
  // Lifted, the assessment first takes the middle of the frame, then goes up to the head of the path.
  const FB2 = G.frameRegion(BOX, 1.3, [540, 650], false);
  const FB3 = G.frameRegion(BOX, 1.2, [540, 470], false);
  const FD1 = G.frameRegion([960, 208, 360, 130], 2.6, [540, 935]);
  const FD2 = G.frameRegion([960, 208, 360, 130], 2.6, [540, 770]);
  const FD3 = G.frameRegion([36, 208, 360, 130], 2.6, [540, 569]);
  const A = G.PORTAL_ARRIVAL;
  const FT = G.frameRegion(A.region, A.zoom, A.centre);
  const lift = TSHARE - 0.1;
  const doorsIn = TSHARE + 1.15;
  const collapse = TSHARE + 1.8; // on "directly"
  const toJamie = TTHEIR + 0.42; // on "allocated"
  const portalIn = TBROKER - 0.9;
  const run2 = TBROKER - 0.45;
  const out3 = TBROKER + 0.05;

  const html = () =>
    [
      `<style>${K3.labelCss}${G.css}</style>`,
      G.stageCss(),
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      G.windowHtml("W1", [TEAM.name, FIN.name], 5, CC_BAR),
      G.windowHtml("WA", [CALC.name, CALC_SAVED.name], 6, CALC_BAR),
      G.windowHtml("WB", [BOX_PLATE.name], 8),
      G.windowHtml("WD", [FIN.name], 7, DOORS_BAR),
      G.windowHtml("WT", [PORTAL.name], 7, G.PORTAL_BAR),
      G.lineHtml("L1", 6),
      G.lineHtml("L2", 6),
      G.dotHtml("D1", 11),
      G.dotHtml("D2", 11),
      G.ringHtml("R1", 12),
      G.ringHtml("R2", 12),
      G.flareHtml("FL", 13),
      G.toastHtml(),
      focusHtml(),
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const hide = (st, ids) => ids.forEach((id) => st.set(id, { opacity: "0", visibility: "hidden" }));

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The label: up as 06.4 leaves it, and held through all three shots (07.2 and 07.3 carry the assessment).
    K3.labelState(st, t, { a: cutOf(s1), inAtCut: true });
    const in1 = t < cutOf(s2);
    const in2 = t >= cutOf(s2) && t < cutOf(s3);
    const in3 = t >= cutOf(s3);
    hide(st, ["#W1-sheen", "#W1-glow", "#WA-glow", "#WD-glow"]);

    // ---------------------------------------------------------------- 07.1
    if (in1) {
      const settle = span(t, s1.in, s1.in + 0.5, EASE.settle);
      const grow = span(t, TFIN - 0.02, TFIN + 0.6, EASE.move);
      const f = G.shift(G.mix(F1a, F1b, grow), 0, 22 * (1 - settle), lerp(0.975, 1, settle));
      const opened = span(t, press1 + 0.02, press1 + 0.14, EASE.linear);
      const g = G.place(st, "W1", FIN.css, f, [1, opened]);
      const tile = centre(throughRect(g, [303.8, 115.5, 244.8, 78]));
      pointer(st, t, {
        from: [tile[0] + 300, tile[1] + 470],
        to: [tile[0] + 30, tile[1] + 10],
        a: s1.in + 0.22,
        b: press1 - 0.04,
        show: s1.in + 0.16,
        hide: TFIN + 0.42,
        press: press1,
      });
      // Jamie Chen: the focus closes on his row as the card reaches it.
      corners(st, t, throughRect(g, [52, 270.5, 506, 58]), TFIN + 0.36, TFIN + 0.7, { inset: 8 });
    } else hide(st, ["#W1"]);

    // ---------------------------------------------------------------- 07.2, and its strip leaving in 07.3
    if (in2 || (in3 && t < s3.in + 0.5)) {
      const settle = span(t, s2.in, s2.in + 0.45, EASE.settle);
      const pan = span(t, press2 + 0.32, TTOAST - 0.3, EASE.move);
      const away = span(t, s3.in, s3.in + 0.45, EASE.move);
      const fa = G.shift(
        G.mix(FA1, FA2, pan),
        0,
        28 * (1 - settle) - 170 * away,
        lerp(0.975, 1, settle),
      );
      const saved = span(t, press2 + 0.01, press2 + 0.09, EASE.linear);
      const g = G.place(st, "WA", CALC.css, fa, [1, saved], { opacity: 1 - away });
      G.sheen(st, t, "WA", press2 + 0.02, press2 + 0.62, 0.55);
      if (in2) {
        const save = centre(throughRect(g, [1224.75, 169 - 140, 78.59, 36]));
        pointer(st, t, {
          from: [save[0] - 60, save[1] + 560],
          to: [save[0] + 6, save[1] + 8],
          a: s2.in + 0.06,
          b: press2 - 0.05,
          show: s2.in + 0.02,
          hide: press2 + 0.42,
          press: press2,
        });
        // The banner, once the camera reaches it.
        corners(st, t, throughRect(g, [13, 249 - 140, 295.16, 16]), TTOAST - 0.32, TTOAST + 0.02, {
          inset: 10,
        });
      } else hide(st, ["#focus"]);
    } else hide(st, ["#WA", "#WA-sheen"]);
    if (in3) hide(st, ["#fk-ptr", "#fk-ring"]);

    // The toast: in on "handover", out as 07.3 begins.
    if (in2 || in3) G.toastState(st, t, { a: TTOAST, b: s3.in, at: [482, 1018], scale: 1.55 });
    else hide(st, ["#toast"]);

    // ---------------------------------------------------------------- the assessment (07.2 and 07.3)
    let boxFrame = null;
    if (in2 || in3) {
      const settle = span(t, s2.in, s2.in + 0.5, EASE.settle);
      const up = span(t, lift, lift + 0.75, EASE.move);
      // Lifted, it tips towards the viewer and back, its edge lit gold.
      const tip = Math.sin(Math.PI * up);
      // On "directly" it folds into the line, down to its own lower edge, and goes.
      const c = span(t, collapse, collapse + 0.4, EASE.move);
      const head = span(t, doorsIn - 0.1, doorsIn + 0.5, EASE.move);
      let fb = G.shift(
        G.mix(G.mix(FB1, FB2, up), FB3, head),
        0,
        32 * (1 - settle),
        lerp(0.975, 1, settle),
      );
      const k = lerp(1, 0.22, c);
      fb = G.shift(fb, 0, ((fb.rect[3] - 28) * (1 - k)) / 2, k);
      boxFrame = fb;
      G.place(st, "WB", BOX_PLATE.css, fb, [1], {
        opacity: 1 - span(t, collapse + 0.18, collapse + 0.4, EASE.linear),
        transform: `perspective(1500px) rotateX(${r3(11 * tip)}deg) translateZ(${r3(60 * tip)}px)`,
      });
      G.sheen(
        st,
        t,
        "WB",
        in3 ? lift + 0.1 : press2 + 0.25,
        in3 ? lift + 0.95 : press2 + 1.15,
        0.9,
      );
      G.glow(st, "WB", in3 ? span(t, lift + 0.05, lift + 0.4, EASE.settle) : 0.0);
    } else hide(st, ["#WB", "#WB-sheen", "#WB-glow"]);

    // ---------------------------------------------------------------- 07.3: the doors, the line, the portal
    if (in3) {
      const rise = span(t, doorsIn, doorsIn + 0.55, EASE.settle);
      const along = span(t, toJamie, toJamie + 0.62, EASE.move);
      const out = span(t, out3, out3 + 0.27, EASE.linear);
      const upDoors = span(t, collapse + 0.5, collapse + 1.05, EASE.move);
      const fd = G.shift(G.mix(G.mix(FD1, FD2, upDoors), FD3, along), 0, 70 * (1 - rise));
      const gd = G.place(st, "WD", FIN.css, fd, [1], { opacity: rise * (1 - out) });
      G.sheen(st, t, "WD", collapse + 0.5, collapse + 1.2, 0.75);
      // The doors light on "yours" and on "their".
      // (gone as the camera leaves them: a ring is drawn over the frame, not inside the window)
      const doorsLeave = 1 - span(t, toJamie, toJamie + 0.14, EASE.linear);
      G.ringState(
        st,
        t,
        "R1",
        throughRect(gd, [1181.4, 226.5, 126.6, 28]),
        TYOURS,
        Infinity,
        6,
        doorsLeave,
      );
      G.ringState(
        st,
        t,
        "R2",
        throughRect(gd, [1075.4, 226.5, 100, 28]),
        TTHEIR,
        Infinity,
        6,
        doorsLeave,
      );
      // Jamie Chen, the broker allocated: the focus closes on him as the camera arrives.
      corners(st, t, throughRect(gd, [58, 273, 222, 52]), toJamie + 0.45, toJamie + 0.78, {
        inset: 8,
      });
      if (out > 0) st.set("#focus", fade(1 - out));

      // The line from the assessment down to the card, the assessment riding it.
      const doorsTop = [fd.rect[0] + fd.rect[2] / 2, fd.rect[1] + 2];
      const boxBottom = [
        boxFrame.rect[0] + boxFrame.rect[2] / 2,
        boxFrame.rect[1] + boxFrame.rect[3] - 4,
      ];
      G.lineState(st, "L1", boxBottom, doorsTop, {
        drawn: span(t, doorsIn + 0.35, doorsIn + 0.8, EASE.move),
        opacity: 1 - span(t, collapse + 0.55, collapse + 0.85, EASE.linear),
      });
      G.dotState(st, "D1", boxBottom, doorsTop, (t - (collapse + 0.12)) / 0.42);

      // The portal: up from below as the line runs on to it; the line from the card to it, its traveller, the flare.
      const pin = span(t, portalIn, portalIn + 0.5, EASE.settle);
      const ft = G.shift(FT, 0, 64 * (1 - pin), lerp(0.95, 1, pin));
      G.place(st, "WT", PORTAL.css, ft, [1], { opacity: pin });
      // The arrival's light is spent by the cut, so ./broker.cjs takes the window over as it is.
      const end = cutOf({ in: s3.out }) - 0.02;
      G.sheen(st, t, "WT", TBROKER - 0.12, end, 0.85);
      const doorsBottom = [fd.rect[0] + fd.rect[2] / 2, fd.rect[1] + fd.rect[3] - 2];
      const portalTop = [ft.rect[0] + ft.rect[2] / 2, ft.rect[1] + 2];
      G.lineState(st, "L2", doorsBottom, portalTop, {
        drawn: span(t, run2 - 0.22, run2 + 0.15, EASE.move),
        opacity: 1 - out,
      });
      G.dotState(st, "D2", doorsBottom, portalTop, (t - run2) / 0.45);
      G.flareState(st, t, "FL", [portalTop[0], portalTop[1] + 24], TBROKER, 260, end - TBROKER);
      G.glow(
        st,
        "WT",
        span(t, TBROKER - 0.05, TBROKER + 0.1, EASE.settle) *
          (1 - span(t, TBROKER + 0.1, end, EASE.linear)),
      );
    } else
      hide(st, [
        "#WD",
        "#WD-sheen",
        "#WT",
        "#WT-sheen",
        "#WT-glow",
        "#L1",
        "#L2",
        "#D1",
        "#D2",
        "#R1",
        "#R2",
        "#FL-bloom",
        "#FL-shock",
      ]);
    return st;
  };

  return { id: "handover", shots: ["07.1", "07.2", "07.3"], palette: "aurixa", html, state };
}

module.exports = handoverScene;
