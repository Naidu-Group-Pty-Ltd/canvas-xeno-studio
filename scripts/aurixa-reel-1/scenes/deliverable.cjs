// Reel 1, shot 05.2: into a report the client can understand.
const M = require("../motion.cjs");
const {
  BRIEF,
  FPS,
  frameOf,
  shotOf,
  beat,
  EASE,
  PRESS,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  windowHtml,
  PAD,
  whole,
  between,
  placeWindow,
  throughRect,
  POINTER_TIP,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  railHtml,
  RENDER_CSS,
  F,
  KIT,
  CAP,
} = M;

// ------------------------------------------------------------------ 05.2: into a report the client can understand
function deliverableScene() {
  const css = F.plate("PL-05C-a").css;
  const [tIn, tOpen, tLift] = [0, 1, 2].map((i) => beat("05.2", i));
  const DOC_W = 470;
  const DOC_H = (DOC_W * 842.25) / 595.5;
  // F05's fan: [plate, left, top, rotation, z], the cover in front.
  const FAN = [
    ["NEW-REPORT-PAGES-contents", 150, 470, -11, 1],
    ["NEW-REPORT-PAGES-property", 300, 440, -2, 2],
    ["NEW-REPORT-PAGES-summary", 470, 470, 9, 3],
    ["NEW-REPORT-PAGES-cover", 270, 520, -4, 4],
  ];
  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      windowHtml("W", ["PL-05C-a", "PL-05C-b"], 2),
      `<div style="position:absolute;inset:0;z-index:4">${FAN.map(([key, , , , z], i) => {
        const p = F.plate(key);
        return KIT.doc({
          x: 0,
          y: 0,
          width: DOC_W,
          height: DOC_H,
          z,
          html: `<div style="position:relative;width:${p.css[0]}px;height:${p.css[1]}px;transform:scale(${DOC_W / 595.5});transform-origin:0 0">${p.html}</div>`,
        }).replace('class="fk-doc"', `class="fk-doc" id="D${i}"`);
      }).join("")}</div>`,
      railHtml("rail-a", "Financial"),
      railHtml("rail-b", "Report"),
      pointerHtml(),
      captionHtml(),
    ].join("");
  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // Generated Reports, the pointer on 14 Wattle Grove; it opens the report's page, and the camera follows
    // the click back to the whole page (F05's framing), which dims while the document comes forward.
    const start = {
      rect: [40, 384, 1000, 892],
      zoom: 1,
      focus: [m.start + 486, 432],
      at: [540, 830],
    };
    const F05 = { rect: [40, 384, 1000, 900], zoom: 0.68, focus: [768, 432], at: [540, 840] };
    const back = span(t, tOpen + 0.05, tOpen + 1.0, EASE.move);
    const framing = {
      rect: start.rect.map((v, i) => lerp(v, F05.rect[i], back)),
      zoom: zoomLerp(start.zoom, F05.zoom, back),
      focus: lerp2(start.focus, F05.focus, back),
      at: lerp2(start.at, F05.at, back),
    };
    const opened = span(t, tOpen - 0.02, tOpen + 0.13, EASE.linear);
    const dim = 0.6 * span(t, tLift, tLift + 0.45, EASE.move);
    const g = placeWindow(st, "W", css, framing, [1, opened], { veil: dim });
    // The rail moves to Report as the report's page opens.
    const moved = span(t, tOpen + 0.05, tOpen + 0.4, EASE.move);
    st.set("#rail-a", fade(1 - moved));
    st.set("#rail-b", fade(moved));
    // The pointer is on the card at the cut, settles, presses; then goes as the camera pulls back.
    const press = tIn + 0.27;
    const at0 = g.map(m.card);
    pointer(st, t, {
      from: [at0[0] + 10, at0[1] + 8],
      to: at0,
      a: tIn,
      b: tIn + 0.22,
      show: tIn - 1,
      hide: tOpen + 0.12,
      press,
    });
    // G-DOCUMENT: the cover lifts out of the page's document view, then the pages fan out behind it.
    const card = throughRect(g, m.docCard);
    const cardCentre = [card[0] + card[2] / 2, card[1] + card[3] / 2];
    const [, cx, cy, crot] = FAN[FAN.length - 1];
    // The cover at time u: from the size of the page's document view, centred on it, up to F05's place.
    // It starts as a small page on the document view (a fifth of its size, a little below where it
    // lands) and rises to full size as it comes forward, its shadow growing with it.
    const coverAt = (u) => {
      const p = span(u, tLift, tLift + 0.8, EASE.settle);
      const c = lerp2([cardCentre[0], cardCentre[1] + 30], [cx + DOC_W / 2, cy + DOC_H / 2], p);
      return {
        left: c[0] - DOC_W / 2,
        top: c[1] - DOC_H / 2,
        angle: lerp(0, crot, p),
        scale: zoomLerp(0.2, 1, p),
      };
    };
    FAN.forEach(([, x, y, rot], i) => {
      const cover = i === FAN.length - 1;
      let s;
      let opacity;
      if (cover) {
        s = coverAt(t);
        opacity = span(t, tLift, tLift + 0.1, EASE.linear);
      } else {
        // Each page starts exactly behind the cover, where the cover is at that moment, and fans out.
        const a = tLift + 0.62 + i * 0.09;
        const from = coverAt(a);
        const p = span(t, a, a + 0.6, EASE.settle);
        s = {
          left: lerp(from.left, x, p),
          top: lerp(from.top, y, p),
          angle: lerp(from.angle, rot, p),
          scale: lerp(from.scale, 1, p),
        };
        opacity = t >= a ? 1 : 0;
      }
      st.set(`#D${i}`, {
        left: "0px",
        top: "0px",
        transform: `translate(${px(s.left)}, ${px(s.top)}) rotate(${r3(s.angle)}deg) scale(${s.scale.toFixed(6)})`,
        "transform-origin": "50% 60%",
        ...fade(opacity),
      });
    });
    return st;
  };
  return {
    id: "deliverable",
    shots: ["05.2"],
    palette: "aurixa",
    html,
    measure: {
      cards: ["#W-0", ".qrcard", true],
      docCards: ["#W-1", ".qcard", true],
      col: ["#W-0", ".qcards"],
    },
    derive(m) {
      const c = m.cards[0];
      return {
        ...m,
        card: [c[0] + c[2] * 0.5, c[1] + 44],
        docCard: m.docCards[0],
        start: m.col[0] - 10,
      };
    },
    state,
  };
}

module.exports = deliverableScene;
