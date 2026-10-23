// Reel 1, shots 12.2 and 12.3 (one scene, because one object carries across them). 12.2: Daniel Reed's Stock
// List on the Builders Network, 14 Wattle Grove Selected for a client; the pointer opens its floor plan in the
// browser's next tab, and the plan (G-FLOORPLAN, drawn new for the third cut: ../pages/floorplan.cjs) lifts out
// of the page as a sheet, clean and whole, and holds, turned a little toward the camera. 12.3: the same sheet
// travels across to the left while the solicitor's matter opens beside it on its Notes; Save notes, and the
// product's toast: Matter updated. Each state is given time to be read before the next begins.
const M = require("../motion.cjs");
const {
  FPS,
  frameOf,
  beat,
  shotOf,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  between,
  placeWindow,
  throughRect,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  F,
  KIT,
} = M;
const FP = require("../pages/floorplan.cjs");

/** A G-WINDOW holding plates already made (edited), one layer each, as windowHtml lays them out. */
function windowOf(id, plates, z) {
  const layers = plates
    .map(
      (p, n) =>
        `<div class="fk-scale" id="${id}-${n}" style="width:${p.css[0]}px;height:${p.css[1]}px">${p.html}</div>`,
    )
    .join("");
  return `<div class="fk-win" id="${id}" style="z-index:${z}"><div class="fk-page" id="${id}-page">${layers}<div class="fk-veil" id="${id}-veil"></div></div></div>`;
}
/** Where a window framed so lays its plate in the frame (placeWindow's geometry, without setting anything). */
const geometry = (css, { rect, zoom, focus, at }) => ({ ...KIT.shotGeometry({ css, zoom, focus, at, rect }), zoom });

// ------------------------------------------------------------------ 12.2 and 12.3: the builder, the solicitor
function builderScene() {
  const [tStock, tTab, tHold] = [0, 1, 2].map((i) => beat("12.2", i));
  const [tTravel, tSave] = [0, 1].map((i) => beat("12.3", i));
  const tEnd = shotOf("12.3").out;
  // The builder's browser: the Stock List, and the floor plan's PDF in the next tab (the new sheet in its viewer).
  const stock = F.plate("PL-12A-a");
  const pdf = F.plate("PL-12A-b", FP.withSheet);
  const css = stock.css;
  // The solicitor's screen: the matter's Notes (the plan's PDF beside it carries the new sheet too).
  const notes = F.plate("PL-12B-b", (html) => {
    const btn = '<span class="btn" style="font-size:12.5px;padding:8px 14px">';
    if (html.split(btn).length !== 2) throw new Error("12.3: PL-12B-b's Save notes button is not there once");
    return FP.withSheet(html).replace(btn, '<span class="btn savebtn" style="font-size:12.5px;padding:8px 14px">');
  });

  // The Stock List, its tab strip at the window's top and 14 Wattle Grove's plate in full; then the PDF tab, its
  // page centred, as the camera opens to it.
  const STOCK = { rect: [20, 470, 1040, 702], zoom: 0.78, focus: [880, 0], at: [540, 470] };
  const PDF = { rect: [20, 380, 1040, 892], zoom: 1, focus: [768, 484], at: [540, 826] };
  // The matter's Notes, the solicitor's browser alone from its tabs down, beside the plan.
  const NOTES = { rect: [211, 716, 849, 584], zoom: 1.15, focus: [566, 258], at: [225, 730] };
  // The sheet as an object: drawn once at SHEET px wide, scaled and turned as it moves.
  const SHEET = 700;
  const SHEET_H = Math.round(SHEET * FP.SHEET_RATIO);
  const HOLD = { c: [540, 800], w: 690, ax: 4, ay: -8, az: -1.2 };
  const DESK = { c: [298, 524], w: 432, ax: 2, ay: 10, az: -3 };

  // The tab changes between two frames; the camera opens to the page; the sheet leaves it.
  const between2 = (x) => (frameOf(x) - 0.5) / FPS;
  const tSwitch = between2(tTab + 0.05);
  const tOpenA = tTab + 0.03;
  const tOpenB = tTab + 0.36;
  const tLift = between2(tTab + 0.3);
  const tLifted = tHold - 0.04;
  const framing = (t) => between(css, STOCK, PDF, span(t, tOpenA, tOpenB, EASE.move));

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowOf("W", [stock, pdf], 2),
      windowOf("N", [notes], 4),
      `<div class="fk-doc" id="plan" style="left:0;top:0;width:${SHEET}px;height:${SHEET_H}px;z-index:6;transform-origin:${SHEET / 2}px ${SHEET_H / 2}px;visibility:hidden">${FP.sheet(SHEET)}</div>`,
      focusHtml(),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);

    // 12.2: the Stock List arrives out of the depth, then the PDF tab opens and the camera opens to its page.
    const arrive = span(t, tStock, tStock + 0.45, EASE.settle);
    const exit = span(t, tEnd - 0.34, tEnd, (u) => 0.5 - Math.cos(Math.PI * u) / 2);
    const onPdf = t >= tSwitch ? 1 : 0;
    const lift = span(t, tLift, tLifted, EASE.move);
    const leave = span(t, tTravel, tTravel + 0.36, EASE.move);
    const g = placeWindow(st, "W", css, framing(t), [1, onPdf], {
      opacity: Math.min(span(t, tStock, tStock + 0.28, EASE.linear), 1 - leave),
      veil: 0.58 * lift,
      transform: `translateY(${px((1 - arrive) * 44)}) scale(${r3((0.965 + 0.035 * arrive) * (1 - 0.05 * lift))})`,
    });
    // Once the sheet has left its page, the viewer behind it is empty (no second copy under it).
    st.set("#W-1 .ppage", { visibility: t >= tLift ? "hidden" : "visible" });

    // G-FOCUS on Selected for a client, gone as the pointer takes the tab.
    if (t >= tStock + 0.2) {
      corners(st, t, throughRect(g, m.chip), tStock + 0.2, tStock + 0.66);
      st.set(
        "#focus",
        fade(span(t, tStock + 0.2, tStock + 0.36, EASE.linear) * (1 - span(t, tTab - 0.12, tTab + 0.1, EASE.move))),
      );
    } else st.set("#focus", { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });

    // The sheet: from exactly where the viewer draws its page, out to the hold, then across to the desk.
    const page = throughRect(geometry(css, framing(tLift)), m.page);
    const start = { c: [page[0] + page[2] / 2, page[1] + page[3] / 2], w: page[2], ax: 0, ay: 0, az: 0 };
    const drift = span(t, tLifted, tTravel, EASE.linear);
    const hold = { ...HOLD, c: [HOLD.c[0], HOLD.c[1] - 8 * drift], ay: HOLD.ay + 2 * drift };
    const travel = span(t, tTravel, tTravel + 0.86, EASE.move);
    const at = (a, b, p) => ({
      c: lerp2(a.c, b.c, p),
      w: lerp(a.w, b.w, p),
      ax: lerp(a.ax, b.ax, p),
      ay: lerp(a.ay, b.ay, p),
      az: lerp(a.az, b.az, p),
    });
    const s = t < tTravel ? at(start, hold, lift) : at(hold, DESK, travel);
    // Rising off the page: a little up and back before it settles, and its shadow opening as it leaves the page.
    const rise = Math.sin(Math.PI * lift) * (t < tTravel ? 1 : 0);
    const up = t < tTravel ? lift : 1;
    st.set("#plan", {
      transform: `translate(${px(s.c[0] - SHEET / 2)}, ${px(s.c[1] - SHEET_H / 2 - 26 * rise)}) perspective(1700px) rotateX(${r3(s.ax)}deg) rotateY(${r3(s.ay)}deg) rotateZ(${r3(s.az)}deg) scale(${(s.w / SHEET).toFixed(5)})`,
      "box-shadow": `0 ${px(30 * up)} ${px(80 * up)} rgba(0,0,0,${r3(0.55 * up)}), 0 ${px(4 * up)} ${px(14 * up)} rgba(0,0,0,${r3(0.3 * up)})`,
      ...fade((t >= tLift ? 1 : 0) * (1 - exit)),
    });

    // 12.3: the matter's Notes rises in beside the plan; Save notes, and the toast. Both ease back into the
    // dark over the shot's last third of a second, so the devices (12.4) arrive from a breath rather than a cut.
    const rise3 = span(t, tTravel + 0.2, tTravel + 0.82, EASE.settle);
    const gn = placeWindow(st, "N", notes.css, NOTES, [1], {
      opacity: Math.min(span(t, tTravel + 0.2, tTravel + 0.5, EASE.linear), 1 - exit),
      transform: `translateY(${px((1 - rise3) * 56 - 10 * exit)}) scale(${r3(1 - 0.025 * exit)})`,
    });
    const since = t - tSave;
    const give = since >= 0 && since < 0.2 ? Math.sin((Math.PI * since) / 0.2) : 0;
    st.set("#N-0 .savebtn", { transform: `scale(${r3(1 - 0.05 * give)})` });
    const toast = span(t, tSave + 0.12, tSave + 0.5, EASE.settle);
    st.set("#N-0 .ftoast", {
      transform: `translateY(${px((1 - toast) * 16)})`,
      ...fade(span(t, tSave + 0.12, tSave + 0.32, EASE.linear)),
    });

    // The pointer: in 12.2 up to the plan's tab and press; in 12.3 to Save notes and press.
    if (t < tTravel)
      pointer(st, t, {
        from: [880, 1200],
        to: g.map(m.tab),
        a: tTab - 0.52,
        b: tTab - 0.03,
        show: tTab - 0.6,
        hide: tTab + 0.3,
        press: tTab,
      });
    else
      pointer(st, t, {
        from: [930, 1440],
        to: gn.map(m.save),
        a: tSave - 0.5,
        b: tSave - 0.03,
        show: tSave - 0.58,
        hide: tSave + 0.62,
        press: tSave,
      });
    return st;
  };

  return {
    id: "builder",
    shots: ["12.2", "12.3"],
    palette: "aurixa",
    html,
    measure: {
      tabs: ["#W-0", ".btab", true],
      chip: ["#W-0", ".bchip.gold"],
      page: ["#W-1", ".ppage"],
      save: ["#N-0", ".savebtn"],
    },
    derive(m) {
      const [x, y, w, h] = m.tabs[1];
      const [sx, sy, sw, sh] = m.save;
      return {
        ...m,
        // The pointer's tip on the plan's tab title, and on Save notes' label, right of centre.
        tab: [x + w * 0.46 + 4, y + h * 0.6],
        save: [sx + sw * 0.64, sy + sh * 0.6],
      };
    },
    state,
  };
}

module.exports = builderScene;
