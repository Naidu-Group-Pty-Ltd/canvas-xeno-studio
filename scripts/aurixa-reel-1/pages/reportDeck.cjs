// G-PAGE-SCROLL: the client's report as a run of pages in depth, the camera travelling through them (shots 05.2
// and 08.2). The pages stand one behind another, each further back and a little higher, so the next page's head
// shows above the one being read; the camera's position along the run is `c` (0 at the first page, 1 at the
// second, and between them on its way), and each page is projected from where it stands to the frame as a lens
// of `perspective` would draw it. A page the camera has passed flies at the viewer and down, fading; the page
// ahead comes forward into the reading place, sharpening and brightening as it comes. A passed page falls faster
// than the run rises (`fall`), so it clears the page arriving rather than lying over it.
//
// Every page is drawn with a flat 2D transform (a translate and a scale): the projection is done here, not by
// the browser, so a page at rest is set by the browser at the size it is seen, and its type is as crisp as the
// frame can carry. The scenes animate what is on a page by its ids (./reportCharts.cjs).
const { r3, px, fade } = require("../motion.cjs");

const smooth = (a, b, v) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * The run of `keys` (pages of `RC`, ./reportCharts.cjs), as a layer of the frame. `width` is a page's width in
 * the reading place, its top at `top`; the pages stand `spacing` apart in depth and rise `rise` frame px for
 * each px of depth; the lens is `perspective` from the reading place, looking at `origin`.
 */
module.exports = function reportDeck({
  RC,
  keys,
  id = "deck",
  width = 860,
  top = 380,
  spacing = 900,
  perspective = 1800,
  rise = 0.465,
  fall = 1.15,
  pass = 0.5,
  origin = null,
  z = 10,
}) {
  const [SW, SH] = RC.A4;
  const s0 = width / SW;
  const H = SH * s0;
  const left = (1080 - width) / 2;
  const O = origin ?? [540, top + 0.4 * H];
  const CSS = `
.rd-page { position:absolute; left:0; top:0; width:${SW}px; height:${SH}px; transform-origin:0 0; visibility:hidden;
  box-shadow:0 14px 30px -10px rgba(0,0,0,.7), 0 4px 10px -4px rgba(0,0,0,.5), 0 0 0 .6px rgba(255,255,255,.06); }
.rd-page > .rc { position:absolute; left:0; top:0; }
.rd-veil { position:absolute; inset:0; display:block; background:#040B16; opacity:0; pointer-events:none; }
`;
  const html = () =>
    `<style>${RC.CSS}${CSS}</style><div id="${id}" style="position:absolute;inset:0;z-index:${z}">${keys
      .map(
        (k, i) =>
          `<div class="rd-page" id="${id}-${i}">${RC.pages[k].html}<i class="rd-veil" id="${id}-${i}-veil"></i></div>`,
      )
      .join("")}</div>`;

  /** Where page i stands when the camera is at c, with `ride` frame px of its own scroll: its frame box and look. */
  const at = (i, c, ride = 0) => {
    const Z = (i - c) * spacing;
    // A page the camera has passed falls away at `pass` of the run's pace, so it is seen to go rather than
    // vanishing in a frame; one far behind the lens is long gone (place() hides it) and is held finite.
    const Zp = Z < 0 ? Math.max(Z * pass, -0.85 * perspective) : Z;
    const s = perspective / (perspective + Zp);
    const wy = top - Zp * (Zp > 0 ? rise : fall) + ride;
    return {
      Z,
      Zp,
      x: O[0] + (left - O[0]) * s,
      y: O[1] + (wy - O[1]) * s,
      scale: s0 * s,
    };
  };

  /**
   * Sets every page for the camera at `c`. `ride(i)` is page i's own scroll (frame px, negative is up), `peek`
   * how much of the pages ahead shows (0 to 1), and `override` sets a page outright ({ cx, cy, scale, rotate,
   * opacity, veil }: its centre in the frame, turned about it), for a page on its way into the run from
   * somewhere else.
   */
  const place = (st, c, { ride = () => 0, peek = 1, override = {} } = {}) => {
    keys.forEach((_, i) => {
      const o = override[i];
      if (o) {
        st.set(`#${id}-${i}`, {
          transform: `translate(${px(o.cx)}, ${px(o.cy)}) rotate(${r3(o.rotate ?? 0)}deg) scale(${o.scale.toFixed(6)}) translate(${px(-SW / 2)}, ${px(-SH / 2)})`,
          "z-index": String(20000),
          filter: "none",
          ...fade(o.opacity ?? 1),
        });
        st.set(`#${id}-${i}-veil`, { opacity: String(r3(o.veil ?? 0)) });
        return;
      }
      const p = at(i, c, ride(i));
      const D = spacing;
      let opacity;
      if (p.Z >= 0) opacity = (1 - smooth(0.72 * D, 1.55 * D, p.Z)) * (p.Z > 0.02 * D ? peek : 1);
      else opacity = 1 - smooth(0.03 * D, 0.34 * D, -p.Zp);
      if (p.Zp <= -0.84 * perspective) opacity = 0;
      const ahead = Math.max(0, p.Z) / D;
      // Out of focus both ways: the pages ahead a little, a page falling past more.
      const blur = 2.4 * Math.min(1, ahead) + 7 * smooth(0.02 * D, 0.3 * D, -p.Zp);
      st.set(`#${id}-${i}`, {
        transform: `translate(${px(p.x)}, ${px(p.y)}) scale(${p.scale.toFixed(6)})`,
        "z-index": String(Math.round(10000 - p.Z)),
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
        ...fade(opacity),
      });
      st.set(`#${id}-${i}-veil`, { opacity: String(r3(Math.min(0.58, 0.52 * ahead))) });
    });
  };

  /**
   * The camera along the run: `stops` is [[t, c, ease?], ...] in time order. Into a stop the camera moves on
   * the stop's ease (else `ease`) when it changes page (the two c differ by more than a drift), and evenly when
   * it drifts within one.
   */
  const camera = (t, stops, ease) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let k = 1; k < stops.length; k++) {
      const [t1, c1, e1] = stops[k];
      const [t0, c0] = stops[k - 1];
      if (t <= t1) {
        const u = (t - t0) / (t1 - t0);
        return c0 + (c1 - c0) * (Math.abs(c1 - c0) > 0.2 ? (e1 ?? ease)(u) : u);
      }
    }
    return stops.at(-1)[1];
  };

  return { html, place, at, camera, s0, H, left, top, origin: O, CSS };
};
