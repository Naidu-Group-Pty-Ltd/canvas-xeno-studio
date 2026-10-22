// Reel 1, shot 12.1: the pointer runs down the Command Centre's sidebar, and the page changes as the product
// changes pages: Overview, Reports, Generated Reports, then the report, where the tour stops.
const M = require("../motion.cjs");
const {
  FPS,
  frameOf,
  beat,
  EASE,
  span,
  State,
  windowHtml,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
  F,
} = M;

// ------------------------------------------------------------------ 12.1: explore the platform
function tourScene() {
  const css = F.plate("PL-05A-a").css; // the Command Centre's pages share one size
  const tIn = beat("12.1", 0);
  // A12a: the sidebar and the page beside it, still; the pages change under the camera.
  const VIEW = { rect: [40, 384, 1000, 900], zoom: 1.25, focus: [389, 432], at: [540, 834] };
  const PAGES = ["PL-11A-c", "PL-04B-a", "PL-05C-a", "PL-05A-a"];
  // The sidebar's items in the order they are drawn: Overview first, Reports and Generated Reports in the
  // Reports & Analysis group (after the Main Dashboard's five and AML/CTF Compliance).
  const ITEM = { overview: 0, reports: 6, generated: 8 };
  // The run: to Reports and press, to Generated Reports and press; the report's page opens from the list.
  const RUN = [
    { a: tIn + 0.05, b: tIn + 0.31, press: tIn + 0.34 },
    { a: tIn + 0.47, b: tIn + 0.65, press: tIn + 0.68 },
  ];
  const tReport = tIn + 0.93;

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", PAGES, 5),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // Each page replaces the last as the press lands, at once, as the product changes pages: between two
    // frames, so no frame holds two pages.
    const at = (x) => (frameOf(x) - 0.5) / FPS;
    const shown = [1, RUN[0].press + 0.06, RUN[1].press + 0.06, tReport].map((x, i) =>
      i === 0 || t >= at(x) ? 1 : 0,
    );
    const g = placeWindow(st, "W", css, VIEW, shown);
    const [overview, reports, generated] = [m.overview, m.reports, m.generated].map((p) =>
      g.map(p),
    );
    const second = t >= RUN[1].a;
    pointer(st, t, {
      from: second ? reports : overview,
      to: second ? generated : reports,
      a: second ? RUN[1].a : RUN[0].a,
      b: second ? RUN[1].b : RUN[0].b,
      bow: 0.06,
      show: tIn - 1,
      press: t >= RUN[1].press ? RUN[1].press : RUN[0].press,
    });
    return st;
  };

  return {
    id: "tour",
    shots: ["12.1"],
    palette: "aurixa",
    html,
    measure: { items: ["#W-0", ".cside .grp a", true] },
    derive(m) {
      // The tip on each item where A12a draws it on Generated Reports ([172, 624]): the same x, and the
      // same place in the item's height.
      const g = m.items[ITEM.generated];
      const dy = 624 - (g[1] + g[3] / 2);
      const at = (i) => [172, m.items[i][1] + m.items[i][3] / 2 + dy];
      return {
        ...m,
        overview: at(ITEM.overview),
        reports: at(ITEM.reports),
        generated: at(ITEM.generated),
      };
    },
    state,
  };
}

module.exports = tourScene;
