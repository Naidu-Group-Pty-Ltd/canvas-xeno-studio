// Reel 1, shot 05.1 (third cut): from research into financial analysis.
// The orbit's Command Centre (where ./portals.cjs leaves it, in the middle of the frame) comes forward, the
// portals falling away past the camera out of focus, and opens on 14 Wattle Grove's investment report: its
// Overview gives way to the report page inside the same window (the two share the Command Centre's sidebar and
// top bar), and the camera moves in on the record's header and its A+ grade card while the journey rail slides
// in above with Research lit. Then a short pan up to the tiers: focus corners close on + Financial, the pointer
// presses it on the music's beat, the tier reads preparing and the rail moves to Financial.
// The window is turned a few degrees in depth over the site's floor; the pointer and the corners are inside it,
// so they turn with it.
const M = require("../motion.cjs");
const S = require("../stage.cjs");
const PACE = require("../pacing.cjs");
const brand = require("./brand.cjs");
const portals = require("./portals.cjs");
const {
  shotOf,
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
  windowHtml,
  PAD,
  pointerHtml,
  pointer,
  corners,
  focusHtml,
  captionHtml,
  caption,
  railHtml,
  F,
  KIT,
} = M;

const [B0, B1] = [0, 1].map((i) => beat("05.1", i));
const END = shotOf("05.1").out;
const CC = F.plate(brand.CC).css;
const PAGE = F.plate("PL-05A-a").css;
/** The press lands on the music's beat: the first of its grid (pacing.json) once the corners have closed. */
const PRESS = (() => {
  const { film_drop: drop, period } = PACE.MUSIC;
  return drop + Math.ceil((B1 + 0.45 - drop) / period) * period;
})();
/** The report's window: the Command Centre's width at the plate's own shape, then opened into the action zone. */
const WIDE = { x: 40, y: 392, w: 1000 };
const OPEN_H = 836;
/** How near the camera comes to the page: the record's header and its grade card side by side, readable. */
const ZOOM = 1.3;
/** How much of the page the opened window shows at ZOOM. */
const VIEW = [(WIDE.w - 2 * PAD) / ZOOM, (OPEN_H - 2 * PAD) / ZOOM];

const smooth = (u) => u * u * (3 - 2 * u);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function researchScene() {
  const html = () =>
    [
      S.stageCss(),
      portals.CSS,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      portals.orbitHtml(),
      S.intoWindow(
        windowHtml("W", [brand.CC, "PL-05A-a", "PL-05A-b"], 9),
        focusHtml() + pointerHtml(),
      ),
      railHtml("rail-a", "Research"),
      railHtml("rail-b", "Financial"),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The camera moves in toward the hub: the floor flows on under it and its horizon settles a little lower.
    const push = span(t, B0, B0 + 1.37, portals.LEAVE);
    const horizon = lerp(portals.ORBIT_HORIZON, 620, push);
    S.floorState(st, "floor", { horizon, flow: brand.flowAt(t) - 150 + 300 * push, opacity: 1 });

    // The window: the hub as the orbit leaves it, coming forward at its own shape to the Command Centre's width
    // (grow), then opened down into the action zone as the camera moves in on the page (open).
    const grow = span(t, B0, B0 + 0.78, portals.LEAVE);
    const open = span(t, B0 + 0.55, B0 + 1.45, portals.LEAVE);
    const hub = portals.framingOf(CC, portals.HUB_ORBIT);
    const shapeOf = (w) => ((w - 2 * PAD) * CC[1]) / CC[0] + 2 * PAD;
    const width = zoomLerp(hub.rect[2], WIDE.w, grow);
    const centre = lerp2(hub.at, [WIDE.x + WIDE.w / 2, WIDE.y + shapeOf(WIDE.w) / 2], grow);
    const rect = [
      centre[0] - width / 2,
      centre[1] - shapeOf(width) / 2,
      width,
      lerp(shapeOf(width), OPEN_H, open),
    ];
    const framing = { rect, at: [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2] };
    const pw = rect[2] - 2 * PAD;
    const ph = rect[3] - 2 * PAD;
    // Turned a few degrees in depth once it has come forward, and turning on a little while it is read.
    const settle = smooth(Math.min(1, Math.max(0, (t - B0) / 1.6)));
    const ry = -3 * settle - 1.4 * span(t, B0 + 1.4, END, EASE.linear);
    const rx = 2 * settle;
    st.set("#W", {
      left: px(rect[0]),
      top: px(rect[1]),
      transform: S.turn({ ry, rx, persp: portals.PERSP }),
      filter: "none",
      "z-index": "9",
      ...fade(1),
    });
    st.set("#W-page", { width: px(pw), height: px(ph) });
    st.set("#W-veil", fade(0));
    portals.shadowOf(st, "W-shadow", framing, horizon);

    // The page in the window: the Overview whole as the hub showed it, giving way to the report page whole; then
    // the camera moves in on the record's header and its grade card, and later pans up to the tiers.
    const zoom = zoomLerp(pw / PAGE[0], ZOOM, open);
    const pan = span(t, B1 - 0.72, B1 - 0.02, EASE.move);
    const centreOf = lerp2(lerp2([PAGE[0] / 2, PAGE[1] / 2], m.startC, open), m.endC, pan);
    const viewOf = (c, z) => [
      clamp(c[0] - pw / (2 * z), 0, PAGE[0] - pw / z),
      clamp(c[1] - ph / (2 * z), 0, PAGE[1] - ph / z),
    ];
    const [x0, y0] = viewOf(centreOf, zoom);
    const swap = span(t, B0 + 0.34, B0 + 0.56, EASE.linear);
    const preparing = span(t, PRESS + 0.03, PRESS + 0.2, EASE.linear);
    const layer = (n, z, ox, oy, o) =>
      st.set(`#W-${n}`, {
        transform: `translate(${px(ox)}, ${px(oy)}) scale(${z.toFixed(6)})`,
        ...fade(o),
      });
    layer(0, pw / CC[0], 0, 0, 1 - swap);
    layer(1, zoom, -x0 * zoom, -y0 * zoom, swap);
    layer(2, zoom, -x0 * zoom, -y0 * zoom, preparing);
    st.set("#W-2 .qspin", {
      transform: `rotate(${r3(((((t - PRESS) * 360) % 360) + 360) % 360)}deg)`,
    });
    /** A point of the report page in the window's own coordinates (inside its border), at a view. */
    const local = ([x, y], [vx, vy] = [x0, y0]) => [
      PAD - KIT.K + (x - vx) * zoom,
      PAD - KIT.K + (y - vy) * zoom,
    ];
    // The grade card lit for a moment once the camera has arrived on it.
    const glow =
      span(t, B0 + 1.2, B0 + 1.55, EASE.settle) * (1 - span(t, B1 - 0.65, B1 - 0.27, EASE.linear));
    st.set("#W-1 .qgradebox", {
      "box-shadow": `0 0 0 2px rgba(215,179,95,${r3(0.7 * glow)}), 0 0 34px rgba(215,179,95,${r3(0.32 * glow)})`,
    });

    // The orbit falling away past the camera, its spokes drawing back into the hub, its labels gone first.
    portals.orbitState(st, t, {
      horizon,
      away: span(t, B0, B0 + 0.72, EASE.linear) ** 1.6,
      lines: 1 - span(t, B0, B0 + 0.36, portals.LEAVE),
      labels: 1 - span(t, B0, B0 + 0.24, EASE.linear),
      hubLabel: 1 - span(t, B0 + 0.04, B0 + 0.3, EASE.linear),
      hub: framing,
    });

    // The journey rail slides in above the window with Research lit; at the press it moves to Financial.
    const railIn = span(t, B0 + 0.92, B0 + 1.42, EASE.settle);
    const moved = span(t, PRESS + 0.14, PRESS + 0.36, EASE.linear);
    st.set("#rail-a", {
      transform: `translateY(${px((1 - railIn) * -22)})`,
      ...fade(railIn * (1 - moved)),
    });
    st.set("#rail-b", fade(moved));

    // Focus corners close on + Financial once the pan has brought it up; the pointer comes to it from below as
    // the page moves, and presses it on the beat.
    const fin = m.tiers[1];
    const [fx, fy] = local([fin[0], fin[1]]);
    corners(st, t, [fx, fy, fin[2] * zoom, fin[3] * zoom], B1, B1 + 0.42, { inset: 8, from: 30 });
    pointer(st, t, {
      from: [pw * 0.8, ph * 0.84],
      to: local(m.financial, viewOf(m.endC, ZOOM)),
      a: B1 - 0.7,
      b: B1 + 0.05,
      show: B1 - 0.78,
      press: PRESS,
    });
    return st;
  };

  return {
    id: "research",
    shots: ["05.1"],
    palette: "aurixa",
    html,
    measure: {
      tiers: ["#W-1", ".qtier", true],
      tierBox: ["#W-1", ".qtiers"],
      hero: ["#W-1", ".qhero"],
      title: ["#W-1", ".qtitle"],
      grade: ["#W-1", ".qgradebox > div:last-child"],
      bar: ["#W-1", ".qbar .qbtn"],
      top: ["#W-1", ".ctop"],
    },
    derive(m) {
      const fin = m.tiers[1];
      // The view's centre in the page: first the record's title and its grade card side by side; then up and
      // left to the report's own bar (its Generated Reports, the record's name and the tiers), under the top bar.
      return {
        ...m,
        financial: [fin[0] + fin[2] * 0.64, fin[1] + fin[3] * 0.62],
        startC: [(m.title[0] + m.grade[0] + m.grade[2]) / 2, m.hero[1] - 24 + VIEW[1] / 2],
        endC: [m.bar[0] - 10 + VIEW[0] / 2, m.top[1] + m.top[3] + 1 + VIEW[1] / 2],
      };
    },
    state,
  };
}

module.exports = researchScene;
