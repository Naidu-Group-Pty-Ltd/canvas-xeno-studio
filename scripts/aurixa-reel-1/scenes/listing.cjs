// Reel 1, shot 01.1: somewhere in Australia, one listing.
const M = require("../motion.cjs");
const {
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  zoomLerp,
  r3,
  px,
  State,
  fade,
  captionHtml,
  caption,
  KIT,
  F,
} = M;

// ------------------------------------------------------------------ 01.1: the map, the pin, the listing
/**
 * The dot-matrix map draws itself west to east while the camera pushes in from the whole continent; the gold
 * pin drops on the New South Wales coast and its ring pulses once, slowly; the listing card opens out of the
 * pin, then its chip. From 3.6 s the frame is F01 (frames.cjs), the style frame: the push ends there.
 */
function listingScene() {
  const [t0, tPin, tCard, tChip] = [0, 1, 2, 3].map((i) => beat("01.1", i));
  const tEnd = 3.6; // F01's moment: the push lands on its framing exactly
  // F01's map, pin and card, in F01's frame.
  const map = KIT.ausMap({
    centre: [134.0, -27.5],
    at: [470, 845],
    scale: 25,
    region: [0, 300, 1080, 1260],
  });
  const [px0, py0] = map.toFrame([150.92, -33.68]);
  const point = [Math.round(px0), Math.round(py0)];
  const width = 470;
  const left = Math.round(point[0] - width + 70);
  const cardBottom = point[1] - 96;

  // The camera: from the whole continent, centred in the action zone, in to F01's own framing (identity).
  // A point p of F01 lands at FOCUS + (p - c) * z, c the F01 point at the frame's focus.
  const FOCUS = [540, 830];
  const continent = [(4 + 905) / 2, (425 + 1248) / 2]; // the dots' extent in F01, west coast to Byron, Cape York to Tasmania
  const Z0 = 0.82;
  const camera = (t) => {
    const p = span(t, t0 + 0.25, tEnd, EASE.move);
    return { z: zoomLerp(Z0, 1, p), c: lerp2(continent, FOCUS, p) };
  };
  const toFrame = ({ z, c }, [x, y]) => [FOCUS[0] + (x - c[0]) * z, FOCUS[1] + (y - c[1]) * z];

  // The pin, drawn as the kit draws it (kit.pin), its parts named so they move.
  const [x, y] = point;
  const pinSvg = `<svg class="fk-layer" width="1080" height="1920" viewBox="0 0 1080 1920" style="z-index:5;overflow:visible">
    <circle id="pin-ring" cx="${x}" cy="${y}" r="18" fill="none" stroke="var(--reel-gold)" stroke-width="${KIT.K}" style="stroke-opacity:0"/>
    <ellipse id="pin-shadow" cx="${x}" cy="${y + 2}" rx="12" ry="4.5" fill="rgba(17,24,39,.22)" style="transform-box:fill-box;transform-origin:center"/>
    <g id="pin-body"><path d="M${x} ${y} C ${x - 6} ${y - 18}, ${x - 24} ${y - 30}, ${x - 24} ${y - 50} A 24 24 0 1 1 ${x + 24} ${y - 50} C ${x + 24} ${y - 30}, ${x + 6} ${y - 18}, ${x} ${y} Z" fill="var(--reel-gold)"/>
    <circle cx="${x}" cy="${y - 50}" r="9" fill="var(--reel-before-surface)"/></g></svg>`;
  // F01's card, opening out of the pin's head (its tail points at the pin).
  const card = `<div id="card" style="position:absolute;left:${left}px;bottom:${1920 - cardBottom}px;width:${width}px;z-index:6;filter:drop-shadow(0 18px 36px rgba(17,24,39,.18));transform-origin:${point[0] - left}px calc(100% + 46px);visibility:hidden">${KIT.listing(
    { width, chips: ["New listing · just now"] },
  ).replace('class="ls-chip"', 'class="ls-chip" id="chip"')}
      <div class="fk-tail down" style="left:${point[0] - left - 14}px;bottom:-13px"></div></div>`;

  const html = () =>
    [
      `<style>#card .ls-chips { overflow:hidden; }</style>`,
      `<div id="cam" class="fk-layer" style="transform-origin:0 0">${map.svg.replace(
        '<svg class="fk-layer"',
        '<svg class="fk-layer" id="map"',
      )}${pinSvg}${card}</div>`,
      captionHtml(),
    ].join("");

  // The ring's one pulse is slow: it opens as the pin lands and is still opening at F01, 0.55 of the way.
  const LANDED = tPin + 0.42;
  const PULSE_AT_F01 = 0.55;
  const pulseSpan = (() => {
    // EASE.settle reaches 0.55 a short way in: find where, and stretch the pulse so F01 falls there.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (EASE.settle(mid) < PULSE_AT_F01) lo = mid;
      else hi = mid;
    }
    return (tEnd - LANDED) / lo;
  })();

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const cam = camera(t);
    const [tx, ty] = toFrame(cam, [0, 0]);
    st.set("#cam", { transform: `translate(${px(tx)}, ${px(ty)}) scale(${cam.z.toFixed(6)})` });
    // G-MAP: drawn west to east, a soft edge travelling across it.
    const edge = lerp(-180, 1260, span(t, t0, t0 + 1.0, EASE.move));
    const mask = `linear-gradient(90deg, #000 ${px(edge - 160)}, transparent ${px(edge)})`;
    st.set("#map", { "-webkit-mask-image": mask, "mask-image": mask });
    // The pin drops from above and settles on its point; its shadow gathers under it.
    const drop = span(t, tPin, LANDED, EASE.settle);
    st.set("#pin-body", {
      transform: `translateY(${px((1 - drop) * -110)})`,
      ...fade(span(t, tPin, tPin + 0.12, EASE.linear)),
    });
    st.set("#pin-shadow", {
      transform: `scale(${r3(lerp(0.3, 1, drop))})`,
      ...fade(span(t, tPin + 0.1, LANDED, EASE.linear)),
    });
    const pulse = span(t, LANDED, LANDED + pulseSpan, EASE.settle);
    st.set("#pin-ring", {
      r: px(18 + 70 * pulse),
      "stroke-opacity": r3(t >= LANDED ? 0.9 - pulse * 0.7 : 0),
    });
    // The card opens out of the pin's head, as a map marker opens on a property site.
    const open = span(t, tCard, tCard + 0.55, EASE.settle);
    st.set("#card", {
      transform: `translateY(${px((1 - open) * 30)}) scale(${r3(lerp(0.12, 1, open))})`,
      ...fade(span(t, tCard, tCard + 0.18, EASE.linear)),
    });
    // Then its chip, New listing · just now: its row opens (the card grows up from its tail) and the chip
    // sets in, so the open card carries no empty row before it.
    const row = span(t, tChip, tChip + 0.36, EASE.settle);
    st.set("#card .ls-chips", {
      height: px(m.chips[3] * row),
      "margin-top": px(-8 * (1 - row)),
    });
    const chip = span(t, tChip + 0.08, tChip + 0.44, EASE.settle);
    st.set("#chip", {
      transform: `translateY(${px((1 - chip) * 6)})`,
      ...fade(chip),
    });
    return st;
  };
  return {
    id: "listing",
    shots: ["01.1"],
    palette: "before",
    html,
    // The chips' row, at its own height (the card isn't scaled yet when the page is measured).
    measure: { chips: ["#card", ".ls-chips"] },
    state,
  };
}

module.exports = listingScene;
