// Reel 1, shot 08.2: what the client is trusting you with. The client's report in the browser's PDF viewer at
// its summary (page 4), the marker settling under the case it sets out; then the page turns to page 19, how the
// grade was reached, and the marker settles under the two dimensions that were not scored.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  r3,
  px,
  State,
  fade,
  placeWindow,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;
const { PLATES } = require("../plates.cjs");

// ------------------------------------------------------------------ 08.2: the report's pages, marked
function pagesScene() {
  const KEYS = ["NEW-REPORT-PAGES-a", "NEW-REPORT-PAGES-b"];
  const css = F.plate(KEYS[0]).css; // the two viewer states share one size
  const [tIn, tTurn] = [0, 1].map((i) => beat("08.2", i));
  // Where the sheet is in the viewer (its left and top in the plate, and plate px a point), and the passages
  // each page marks: the readiness statement's lead on page 4, the two unscored rows' "- (not scored)" on 19.
  const [left, top, k] = PLATES[KEYS[0]].sheetAt;
  const onPage = ([x, y]) => [left + k * x, top + k * y];
  const MARKS = KEYS.map((key) => PLATES[key].marks);
  // A08b and F08: the page at 2.45 frame px a plate px, centred on the sheet, in the 1000 x 900 window.
  const ZOOM = 2.45;
  const rect = [40, 384, 1000, 900];
  const framing = (y) => ({ rect, zoom: ZOOM, focus: onPage([297.75, y]), at: [540, 834] });
  const FRAMINGS = [framing(288), framing(285)];
  // The turn scrolls the viewer from one page to the next: a page's height and the viewer's gap between
  // pages, in frame px.
  const SHEET = [595.5, 842.25];
  const TURN = SHEET[1] * k * ZOOM + 14 * k * ZOOM;

  // The window, as windowHtml draws it, with the viewer's grey behind the pages, each page cut to its sheet
  // (so the viewer's toolbar never rides the turn) and its marks inside it, in the sheet's own coordinates.
  const viewerHtml = (id, z) => {
    const layers = KEYS.map((key, n) => {
      const p = F.plate(key);
      const [x0, y0] = onPage([0, 0]);
      const [x1, y1] = onPage(SHEET);
      const clip = `inset(${r3(y0)}px ${r3(p.css[0] - x1)}px ${r3(p.css[1] - y1)}px ${r3(x0)}px)`;
      const marks = MARKS[n]
        .map(({ x, base, width }, i) => {
          const [mx, my] = onPage([x, base + 2.6]);
          return `<div class="fk-mark" id="${id}-m${n}-${i}" style="left:${r3(mx)}px;top:${r3(my)}px;width:${r3(width * k)}px;height:${r3(KIT.K / ZOOM)}px;transform-origin:0 50%;transform:scaleX(0)"></div>`;
        })
        .join("");
      return `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px;clip-path:${clip}">${p.html}${marks}</div>`;
    }).join("");
    return `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page" style="background:#525659">${layers}<div class="fk-veil" id="${id}-veil"></div></div></div>`;
  };

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      viewerHtml("W", 5),
      railHtml("rail", "Team"),
      captionHtml(),
    ].join("");

  /** A page's marks, drawn left to right one after the other from `a`, each over `d` on ease-settle. */
  const draw = (st, n, t, a, d = 0.42) =>
    MARKS[n].forEach((_, i) => {
      const p = span(t, a + i * 0.16, a + i * 0.16 + d, EASE.settle);
      st.set(`#W-m${n}-${i}`, { transform: `scaleX(${r3(p)})`, ...fade(p > 0 ? 1 : 0) });
    });

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#rail", fade(1));
    // The turn: the viewer scrolls from page 4 to page 19 in one move, both pages riding it.
    const s = TURN * span(t, tTurn, tTurn + 0.62, EASE.move);
    const g = placeWindow(st, "W", css, FRAMINGS[0], [1, 1]);
    const g19 = KIT.shotGeometry({ css, ...FRAMINGS[1] });
    st.set("#W-0", {
      transform: `translate(${px(g.ox)}, ${px(g.oy - s)}) scale(${ZOOM.toFixed(6)})`,
      ...fade(s < TURN - 1 ? 1 : 0),
    });
    st.set("#W-1", {
      transform: `translate(${px(g19.ox)}, ${px(g19.oy + TURN - s)}) scale(${ZOOM.toFixed(6)})`,
      ...fade(s > 1 ? 1 : 0),
    });
    // G-HIGHLIGHT: on page 4 under the readiness statement's lead, once the page has been read; on page 19
    // under the two dimensions not scored, once it has landed.
    draw(st, 0, t, tIn + 0.7);
    draw(st, 1, t, tTurn + 0.78);
    return st;
  };

  return { id: "pages", shots: ["08.2"], palette: "aurixa", html, state };
}

module.exports = pagesScene;
