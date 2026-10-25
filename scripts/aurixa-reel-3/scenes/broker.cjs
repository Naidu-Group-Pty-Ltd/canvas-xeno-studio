// Reel 3, shot 07.4: through Aurixa's partner portal, enabling professional review without repeating the entire
// process. Jamie Chen's Finance Portal, alone (the product's own FinancePortalLayout and FinancePortalClientProfile,
// drawn by the screens harness): it opens out of the window G-HANDOVER landed on (./handover.cjs ends on it, at
// g-handover.cjs PORTAL_ARRIVAL), on the portal's own mark, "Finance Portal · Partner Access", and Jamie's card; down
// Jamie's path, My Clients, then Jordan Ellis's row; his profile; the Borrowing Capacity tab; and the latest
// assessment, the one 07.2 saved: "Latest assessment · 24 Oct 2026, 9:15 AM", Maximum borrowing $1,111,628, and then
// the inputs it was worked on. Nothing is keyed in again.
// Out of frame: the panel's band badge ("GREEN · SERVICEABILITY") and its Buffer rate (APRA) row (the camera keeps to
// the left of x 848 on the panel), its Recommendations and footer, the mirror card (its email line) and the property
// team between the header and the tabs (the camera cuts past them), the sidebar's compliance entry and the floating
// quick-add button.
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

const PORTAL = K3.screenPlate("fp-clients");
const PROF_T = K3.screenPlate("fp-profile-tabs");
const PROF_BC = K3.screenPlate("fp-profile-bc");
const PROFILE_BAR = { portal: "FINANCE PORTAL", page: "Jordan Ellis" };

const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];

function brokerScene() {
  const s = shotOf("07.4");
  const [TPATH, TTAB, TINPUTS] = [0, 1, 2].map((i) => beat("07.4", i));
  const A = G.PORTAL_ARRIVAL;
  const A0 = G.frameRegion(A.region, A.zoom, A.centre);
  // The portal's mark and Jamie's card, with My Clients beside them; then Jordan's row.
  const A1 = G.frameRegion([0, 0, 600, 205], 1.65, [540, 640]);
  const A2 = G.frameRegion([296, 70, 600, 250], 1.65, [540, 660]);
  // Jordan's profile: its header (the mirror card and the property team under it are cut past).
  const B1 = G.frameRegion([288, 72, 600, 210], 1.65, [540, 650]);
  // The tab row, its Borrowing Capacity tab; then down into the panel it opens, and down again to its inputs.
  const C1 = G.frameRegion([690, 806, 515, 84], 1.92, [540, 640]);
  const D1 = G.frameRegion([300, 905, 548, 270], 1.8, [540, 690]);
  const D2 = G.frameRegion([300, 1210, 548, 262], 1.8, [540, 690]);

  const open = s.in + 0.05;
  const toRow = TPATH - 0.45;
  const pressRow = TPATH + 0.29; // on the bar line, on "portal"
  const toProfile = pressRow + 0.18;
  const toTabs = TTAB - 0.62;
  const pressTab = TTAB - 0.2;
  const toPanel = TTAB - 0.02;
  const toInputs = TINPUTS - 0.02;

  const html = () =>
    [
      `<style>${K3.labelCss}${G.css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      G.windowHtml("WA", [PORTAL.name], 5, G.PORTAL_BAR),
      G.windowHtml("WB", [PROF_T.name], 6, PROFILE_BAR),
      G.windowHtml("WC", [PROF_T.name, PROF_BC.name], 7, PROFILE_BAR),
      focusHtml(),
      K3.labelHtml(),
      `<div class="fk-layer" style="z-index:41">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const hide = (st, ids) => ids.forEach((id) => st.set(id, { opacity: "0", visibility: "hidden" }));

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    K3.labelState(st, t, { a: (frameOf(s.in) - 0.5) / FPS, inAtCut: true });
    hide(st, ["#WA-glow", "#WB-glow", "#WC-glow", "#WB-sheen"]);

    // ---------------------------------------------------------------- My Clients
    const dissolve1 = span(t, toProfile, toProfile + 0.26, EASE.linear);
    if (dissolve1 < 1) {
      const grow = span(t, open, open + 0.85, EASE.move);
      // Across to Jordan's row before going down to it, so the sidebar's entries below Jamie's card stay out of view.
      const hx = span(t, toRow, toRow + 0.45, EASE.move);
      const vy = span(t, toRow + 0.3, toRow + 0.78, EASE.move);
      const f = G.mix(G.mix(A0, A1, grow), A2, 0, { px: hx, py: vy });
      const g = G.place(st, "WA", PORTAL.css, f, [1], { opacity: 1 });
      G.sheen(st, t, "WA", open + 0.1, open + 0.95, 0.8);
      const row = centre(throughRect(g, [373, 253, 72, 20]));
      pointer(st, t, {
        from: [row[0] + 380, row[1] + 380],
        to: [row[0] + 16, row[1] + 6],
        a: toRow + 0.35,
        b: pressRow - 0.05,
        show: toRow + 0.3,
        hide: toProfile,
        press: pressRow,
      });
    } else hide(st, ["#WA", "#WA-sheen"]);

    // ---------------------------------------------------------------- Jordan's profile: its header
    const dissolve2 = span(t, toTabs, toTabs + 0.26, EASE.linear);
    if (dissolve1 > 0 && dissolve2 < 1) {
      // In from where My Clients was, as the page changes, and a touch of drift while it reads.
      const f = G.shift(
        G.mix(A2, B1, span(t, toProfile, toProfile + 0.4, EASE.settle)),
        0,
        -34 * dissolve2,
      );
      G.place(st, "WB", PROF_T.css, f, [1], { opacity: Math.min(dissolve1, 1 - dissolve2) });
    } else hide(st, ["#WB"]);

    // ---------------------------------------------------------------- the tab row, the panel, its inputs
    if (dissolve2 > 0) {
      // Up from below into the tab row, as if scrolled; the press; down into the panel; down again to the inputs.
      let f = G.shift(C1, 0, 40 * (1 - span(t, toTabs, toTabs + 0.4, EASE.settle)));
      f = G.mix(f, D1, span(t, toPanel, toPanel + 0.62, EASE.move));
      f = G.mix(f, D2, span(t, toInputs, toInputs + 0.62, EASE.move));
      // Held on the inputs to the cut, the window floats up a touch so the frame stays alive while they read.
      const hold = span(t, toInputs + 0.3, s.out, (p) => p * p * (3 - 2 * p));
      f = G.shift(f, 0, -14 * hold, 1 + 0.012 * hold);
      const opened = span(t, pressTab + 0.02, pressTab + 0.12, EASE.linear);
      const g = G.place(st, "WC", PROF_BC.css, f, [1, opened], { opacity: dissolve2 });
      G.sheen(st, t, "WC", toPanel + 0.3, toPanel + 1.1, 0.7);
      const tab = centre(throughRect(g, [1033.1, 827, 175, 38]));
      if (t < toPanel + 0.35)
        pointer(st, t, {
          from: [tab[0] - 120, tab[1] + 360],
          to: [tab[0] + 10, tab[1] + 6],
          a: toTabs + 0.12,
          b: pressTab - 0.05,
          show: toTabs + 0.1,
          hide: toPanel + 0.12,
          press: pressTab,
        });
      // The latest assessment's figure, then the inputs it was worked on.
      if (t < toInputs + 0.1)
        corners(st, t, throughRect(g, [334, 994, 500, 66]), toPanel + 0.42, toPanel + 0.72, {
          inset: 8,
        });
      else
        corners(st, t, throughRect(g, [314, 1268, 528, 192]), toInputs + 0.55, toInputs + 0.88, {
          inset: 8,
        });
      if (t >= toInputs && t < toInputs + 0.55) st.set("#focus", fade(0));
    } else hide(st, ["#WC", "#WC-sheen", "#focus"]);
    // The pointer: on My Clients, then on the tab row; nowhere else.
    if (!(dissolve1 < 1 || (dissolve2 > 0 && t < toPanel + 0.35)))
      hide(st, ["#fk-ptr", "#fk-ring"]);
    return st;
  };

  return { id: "broker", shots: ["07.4"], palette: "aurixa", html, state };
}

module.exports = brokerScene;
