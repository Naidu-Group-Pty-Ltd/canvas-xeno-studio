// Reel 1, shots 12.2 and 12.3 (one scene, because one object carries across them): Daniel's Stock List with
// 14 Wattle Grove selected for a client; his floor plan opened in its own tab; then the same plan, lifted out as
// a document, beside the solicitor's Notes, saved: Matter updated.
const M = require("../motion.cjs");
const {
  FPS,
  frameOf,
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
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

// ------------------------------------------------------------------ 12.2 and 12.3: the builder, the solicitor
function builderScene() {
  const [tStock, tTab] = [0, 1].map((i) => beat("12.2", i));
  const [tLift, tSave] = [0, 1].map((i) => beat("12.3", i));
  const stockCss = F.plate("PL-12A-a").css;
  // A12b: the Stock List, focus on 14 Wattle Grove's "Selected for a client"; A12c: the plan's tab, whole.
  const A12B = { rect: [40, 475, 1000, 711], zoom: 0.79, focus: [888, 432], at: [540, 830] };
  const A12C = { rect: [40, 388, 1000, 892], zoom: 1, focus: [760, 432], at: [540, 834] };
  const CHIP = [1346, 503, 1479 - 1346, 521 - 503];
  // F12: the plan as one object above the matter's Notes (the Notes window over its foot), Matter updated.
  const F12_DOC = { x: 330, y: 386, width: 420, height: 420, rotate: -3 };
  const F12_NOTES = { rect: [40, 700, 1000, 584], zoom: 1.5, focus: [920, 530], at: [540, 1000] };
  const notes = F.plate("PL-12B-b", (html) =>
    html.replace(
      '<span class="btn" style="font-size:12.5px;padding:8px 14px">',
      '<span class="btn savebtn" style="font-size:12.5px;padding:8px 14px">',
    ),
  );
  // The tab's switch and the plan's lift happen between two frames.
  const between2 = (x) => (frameOf(x) - 0.5) / FPS;
  const tSwitch = between2(tTab + 0.05);
  const tOut = between2(tLift); // the plan leaves its tab

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-12A-a", "PL-12A-b"], 2),
      windowOf("N", [notes], 4),
      // The plan as an object: the floor plan (D) on its white page, as the PDF viewer draws it.
      `<div style="position:absolute;inset:0;z-index:3">${KIT.doc({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        html: `<div id="plan-img" style="width:100%;height:100%;background:#fff ${F.asset("D.png") ? `url('${F.asset("D.png")}')` : ""} center/100% no-repeat"></div>`,
      }).replace('class="fk-doc"', 'class="fk-doc" id="plan"')}</div>`,
      focusHtml(),
      pointerHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // 12.2: the Stock List; at the tab's press the plan's tab is in front, and the camera opens to it whole.
    const onPlan = t >= tSwitch ? 1 : 0;
    const open = span(t, tTab + 0.08, tTab + 0.72, EASE.move);
    const framing = between(stockCss, A12B, A12C, open);
    const windowGone = span(t, tLift + 0.02, tLift + 0.3, EASE.move);
    const g = placeWindow(st, "W", stockCss, framing, [1, onPlan], { opacity: 1 - windowGone });
    // Once the plan has left its tab, the viewer behind it is empty (no second copy fading out under it).
    st.set("#W-1 .ppage", { visibility: t >= tOut ? "hidden" : "visible" });
    // Focus on the selection, then gone as the pointer takes the tab.
    if (t >= tStock + 0.12) {
      corners(st, t, throughRect(g, CHIP), tStock + 0.12, tStock + 0.58);
      st.set(
        "#focus",
        fade(
          span(t, tStock + 0.12, tStock + 0.28, EASE.linear) *
            (1 - span(t, tTab - 0.1, tTab + 0.12, EASE.move)),
        ),
      );
    } else st.set("#focus", { left: "0px", top: "0px", width: "0px", height: "0px", ...fade(0) });

    // 12.3: the plan lifts out of its tab as one object, from exactly where the tab draws it, to F12's place.
    const sheet = throughRect(placeWindowGeometry(stockCss, A12C), m.plan);
    const lift = span(t, tLift + 0.02, tLift + 0.74, EASE.move);
    const centre = lerp2(
      [sheet[0] + sheet[2] / 2, sheet[1] + sheet[3] / 2],
      [F12_DOC.x + F12_DOC.width / 2, F12_DOC.y + F12_DOC.height / 2],
      lift,
    );
    const side = lerp(sheet[2], F12_DOC.width, lift);
    st.set("#plan", {
      left: px(centre[0] - side / 2),
      top: px(centre[1] - side / 2),
      width: px(side),
      height: px(side),
      transform: `rotate(${r3(F12_DOC.rotate * lift)}deg)`,
      // Its shadow grows as it lifts off the page it lay flat on.
      "box-shadow": `0 ${px(26 * lift)} ${px(60 * lift)} rgba(0,0,0,${r3(0.5 * lift)})`,
      ...fade(t >= tOut ? 1 : 0),
    });
    st.set("#plan-img", { "background-size": `${r3(lerp(100, 90, lift))}%` });
    // The matter's Notes window opens beside it, rising in.
    const rise = span(t, tLift + 0.24, tLift + 0.72, EASE.settle);
    const gn = placeWindow(st, "N", notes.css, F12_NOTES, [1], {
      opacity: span(t, tLift + 0.24, tLift + 0.5, EASE.linear),
      transform: `translateY(${px((1 - rise) * 40)})`,
    });
    // Save notes pressed: the button gives, and the product's toast arrives.
    const since = t - tSave;
    const give = since >= 0 && since < 0.2 ? Math.sin((Math.PI * since) / 0.2) : 0;
    st.set("#N-0 .savebtn", { transform: `scale(${r3(1 - 0.04 * give)})` });
    const toast = span(t, tSave + 0.1, tSave + 0.45, EASE.settle);
    st.set("#N-0 .ftoast", {
      transform: `translateY(${px((1 - toast) * 14)})`,
      ...fade(span(t, tSave + 0.1, tSave + 0.3, EASE.linear)),
    });

    // The pointer: in 12.2 up to the plan's tab and press; in 12.3 to Save notes and press.
    if (t < tLift)
      pointer(st, t, {
        from: [860, 1180],
        to: g.map(m.tab),
        a: tTab - 0.5,
        b: tTab - 0.03,
        show: tTab - 0.58,
        hide: tTab + 0.3,
        press: tTab,
      });
    else
      pointer(st, t, {
        from: [880, 1250],
        to: gn.map(m.save),
        a: tSave - 0.46,
        b: tSave - 0.03,
        show: tSave - 0.54,
        // F12 draws no pointer: once the toast is in, it goes.
        hide: tSave + 0.5,
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
      plan: ["#W-1", ".ppage"],
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

/** Where a window framed so lays its plate in the frame (placeWindow's geometry, without setting anything). */
function placeWindowGeometry(css, { rect, zoom, focus, at }) {
  return { ...KIT.shotGeometry({ css, zoom, focus, at, rect }), zoom };
}

module.exports = builderScene;
