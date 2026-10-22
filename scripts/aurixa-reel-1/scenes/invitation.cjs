// Reel 1, shots 10.2 and 11.1 (one scene): the invitation rises over the system map, the pointer comes to its
// button; then close on the button, and the press.
const M = require("../motion.cjs");
const L = require("../logo.cjs");
const { travellerAt } = require("./horizon.cjs");
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
  placeWindow,
  pointerHtml,
  pointer,
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

/** The pointer's tip in the plate's own baked cursor (where the approved stills draw it). */
const tipOf = ([x, y, w, h]) => [x + (w * 3) / 24, y + (h * 2) / 24];

// ------------------------------------------------------------------ 10.2 and 11.1: the invitation, the press
function invitationScene() {
  const [tRise, tHover] = [0, 1].map((i) => beat("10.2", i));
  const [tClose, tPress] = [0, 1].map((i) => beat("11.1", i));
  // The cut to the close-up falls between two frames, so no frame's shutter holds both pictures.
  const cut = (frameOf(tClose) - 0.5) / FPS;
  // F10: the invitation drawn whole (no window), its left at -420 and top at 280, under a soft round mask.
  const INV = { left: -420, top: 280, centre: [540, 820] };
  // A11: close on the label and the button, in a window.
  const A11 = { rect: [40, 640, 1000, 380], zoom: 1.6, focus: [960, 785], at: [540, 830] };
  const button = (html) =>
    html.replace(
      '<div style="position:relative;margin-top:34px',
      '<div class="tbtn" style="position:relative;margin-top:34px',
    );
  // The invitation over the map: its logo lives, as the closing card's does (../logo.cjs: the card take's
  // footage, under the art's own lettering), drawn where the plate draws the supplied art. The close-up
  // frames the label and the button, below the footage, so its plate keeps the art.
  const LOGO = /<img src="[^"]*logo-art\.png" alt="AURIXA SYSTEMS"[^>]*>/;
  const invitation = F.plate("PL-11A-a", (html) => {
    if (!LOGO.test(html)) throw new Error("PL-11A-a has no logo image to lay the footage in");
    return button(html)
      .replace('<div class="tbtn"', '<div class="tbtn" id="trial-btn"')
      .replace(LOGO, L.cardLogoHtml({ id: "trial-logo", width: 1010 }));
  });
  // Close up, one plate: the press is drawn on its own button (PL-11A-b's pressed look: the deeper blue, the
  // inset shadow and the gold edge), so the label never doubles in a cross-fade.
  const close = [F.plate("PL-11A-a", button)];
  const css = close[0].css;
  const hub = F.SYSTEM_MAP.hub;
  const hubPlate = F.plate(hub.key);
  const hubZoom = hub.width / hubPlate.css[0];
  // 10.1's last state: the map live, a traveller on each line (still running, as 10.1 runs them), the horizon
  // above with its traveller at rest; the confirmations have blinked and gone.
  const T = F.SYSTEM_MAP.portals.map(() => 0);

  const html = () => {
    const portals = F.SYSTEM_MAP.portals.map((_, i) => F.mapPortal(i, { traveller: T[i] }));
    const map = [
      ...portals.map((p, i) =>
        p.line.replace('class="fk-traveller"', `class="fk-traveller" id="T${i}"`),
      ),
      ...portals.map((p) => p.window),
      KIT.camera({
        plate: hubPlate,
        zoom: hubZoom,
        focus: [hubPlate.css[0] / 2, hubPlate.css[1] / 2],
        at: hub.at,
        style: "z-index:5",
      }),
      ...portals.map((p) => p.chip),
      F.mapChip(hub.label, hub.at[0], hub.at[1] - (hubPlate.css[1] * hubZoom) / 2 - 72, 6),
    ].join("");
    const extras = `<div class="fk-horizon" style="top:330px"></div><div class="fk-traveller" style="left:676px;top:331px;z-index:3"></div>`;
    const mask = "radial-gradient(46% 52% at 50% 48%, #000 62%, transparent 100%)";
    return [
      // The plates' own drawn pointer gives way to the moving one, as every scene's does.
      `<style>.fk svg.cursor { visibility:hidden !important; }</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="map" class="fk-layer" style="z-index:2">${map}</div>`,
      `<div id="extras" class="fk-layer" style="z-index:3">${extras}</div>`,
      `<div id="rise" class="fk-layer" style="z-index:4;visibility:hidden"><div id="inv" style="position:absolute;left:${INV.left}px;top:${INV.top}px;width:${invitation.css[0]}px;height:${invitation.css[1]}px;-webkit-mask-image:${mask};mask-image:${mask}">${invitation.html}</div></div>`,
      windowOf("W", close, 5),
      pointerHtml(),
      captionHtml(),
    ].join("");
  };

  // The button: its hover (the site's CTA hover: a lift and a stronger glow), h, and its press, p (to PL-11A-b's
  // pressed look: the deeper blue, an inset shadow, the gold edge), sinking by `sink` as the pointer dips.
  const mix = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const buttonStyle = (h, p = 0, sink = 0) => {
    const ring = mix([0, 168, 181], [215, 179, 95], p);
    const lift = 1 - p;
    return {
      transform: `translateY(${px(-2 * h * lift + 3 * sink)}) scale(${r3(1 - 0.012 * sink)})`,
      background: `rgb(${mix([18, 56, 232], [13, 43, 181], p).join(",")})`,
      "box-shadow": `inset 0 ${px(4 * p)} ${px(12 * p)} rgba(0,0,0,${r3(0.5 * p)}), 0 0 0 ${px(2 + 2 * p)} rgba(${ring.join(",")},${r3(lerp(0.55 + 0.25 * h, 0.7, p))}), 0 ${px((10 + 4 * h) * lift)} ${px((40 + 14 * h) * lift)} rgba(18,56,232,${r3((0.45 + 0.17 * h) * lift)})`,
      filter: h * lift > 0.001 ? `brightness(${r3(1 + 0.06 * h * lift)})` : "none",
    };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const closeUp = t >= cut;
    // 10.2: the map dims; the live extras (the horizon and the travellers, still running) go first.
    const dim = span(t, tRise, tRise + 0.7, EASE.move);
    const live = 1 - span(t, tRise, tRise + 0.35, EASE.move);
    st.set("#map", fade(closeUp ? 0 : lerp(1, 0.32, dim)));
    st.set("#extras", fade(closeUp ? 0 : live));
    T.forEach((_, i) => {
      const { at, o } = travellerAt(i, t);
      st.set(`#T${i}`, { left: px(at[0]), top: px(at[1]), ...fade(closeUp ? 0 : o * live) });
    });
    // The invitation rises into the centre over it.
    const rise = span(t, tRise + 0.15, tRise + 1.05, EASE.settle);
    st.set("#rise", {
      transform: `translateY(${px((1 - rise) * 70)}) scale(${r3(lerp(0.96, 1, rise))})`,
      "transform-origin": `${INV.centre[0]}px ${INV.centre[1]}px`,
      ...fade(closeUp ? 0 : span(t, tRise + 0.15, tRise + 0.6, EASE.linear)),
    });
    // Its logo's footage, from 4 s into the take (15.1 plays it from the start), so the two cards differ.
    L.cardLogoState(st, "trial-logo", t, { t0: tRise, offset: 120, frameOf });
    // Its hover state, once the pointer is over the button (and still, close on it, until the press).
    const hover = span(t, tHover, tHover + 0.18, EASE.settle);
    st.set("#trial-btn", buttonStyle(closeUp ? 1 : hover));

    // 11.1: close on the button, in its window; the press sinks it and gives it its gold edge.
    const pressed = span(t, tPress + 0.02, tPress + 0.16, EASE.settle);
    const sink =
      t < tPress
        ? 0
        : 0.6 * Math.sin(Math.min(1, (t - tPress) / 0.22) * Math.PI) +
          0.4 * span(t, tPress, tPress + 0.12, EASE.settle);
    const g = placeWindow(st, "W", css, A11, [1], { opacity: closeUp ? 1 : 0 });
    st.set("#W-0 .tbtn", buttonStyle(1, closeUp ? pressed : 0, closeUp ? sink : 0));

    // The pointer: up from the lower right to the button (its tip where the approved frame draws it); at the
    // cut, on the same point of the button close up; then the press.
    const onButton = [INV.left + m.tip[0], INV.top + m.tip[1]];
    if (!closeUp)
      pointer(st, t, {
        from: [900, 1250],
        to: onButton,
        a: tHover - 0.42,
        b: tHover,
        show: tHover - 0.5,
      });
    else {
      const at = g.map(m.tipW);
      pointer(st, t, { from: at, to: at, a: cut, b: cut + 0.01, show: cut - 1, press: tPress });
    }
    return st;
  };

  return {
    id: "invitation",
    shots: ["10.2", "11.1"],
    palette: "aurixa",
    html,
    measure: { cur: ["#inv", "svg.cursor"], curW: ["#W-0", "svg.cursor"] },
    derive: (m) => ({ ...m, tip: tipOf(m.cur), tipW: tipOf(m.curW) }),
    state,
  };
}

module.exports = invitationScene;
