// Reel 1, shot 12.1: explore the platform. The Command Centre's Property Marketplace (NEW-MARKETPLACE,
// ../pages/marketplace.cjs) laid back in depth; one slow lateral glide across its grid while the pointer moves
// over the cards, each card it passes lifting under it, until both come to rest on 14 Wattle Grove, whose card
// lifts and brightens, its A+ in gold. The page arrives out of the depth rather than cutting in, and the card
// holds for most of a second before the builder's page (12.2), so the move from screen to screen has room.
const M = require("../motion.cjs");
const { beat, shotOf, EASE, span, lerp, r3, px, State, fade, PAD, pointerHtml, pointer, captionHtml, caption } = M;
const MK = require("../pages/marketplace.cjs");

/** A point (relative to the transform's origin) through perspective(P) translateZ(tz) rotateY(ay) rotateX(ax). */
function project([x, y], { ax, ay, tz, P }) {
  const a = (ax * Math.PI) / 180;
  const b = (ay * Math.PI) / 180;
  // The transform list read from the right: rotateX, rotateY, then translateZ, then the perspective.
  const y1 = y * Math.cos(a);
  const z1 = y * Math.sin(a);
  const x2 = x * Math.cos(b) + z1 * Math.sin(b);
  const z2 = -x * Math.sin(b) + z1 * Math.cos(b) + tz;
  const s = P / (P - z2);
  return [x2 * s, y1 * s];
}

/** An even ease in and out (a sine's half turn): the glide starts and stops without a jolt, as a camera on a track. */
const inOut = (u) => 0.5 - Math.cos(Math.PI * u) / 2;

function marketplaceScene() {
  const shot = shotOf("12.1");
  const [tIn, tRest] = [0, 1].map((i) => beat("12.1", i));
  const tOut = shot.out;
  const page = MK.plate();
  const [W, H] = page.css;
  const Z = 1; // frame px a plate px, before the depth
  const P = 1900; // the perspective's distance
  // Where 14 Wattle Grove's card comes to rest, and where the glide starts it (the camera travels the difference).
  const REST = [560, 770];
  const START = [1080, 810];

  const html = () =>
    [
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="fk-win" id="M" style="z-index:2;width:${W * Z + 2 * PAD}px;height:${H * Z + 2 * PAD}px;padding:12px;box-sizing:border-box">` +
        `<div class="fk-page" id="M-page" style="width:${W * Z}px;height:${H * Z}px"><div class="fk-scale" id="M-0" style="width:${W}px;height:${H}px;transform:scale(${Z})">${page.html}</div></div></div>`,
      pointerHtml(),
      captionHtml(),
    ].join("");

  // The camera at t: the page's tilt, its depth, and where the resting card's centre (the transform's origin) is.
  const camera = (t) => {
    const arrive = span(t, tIn, tIn + 0.62, EASE.settle);
    const glide = span(t, tIn + 0.02, tRest + 0.4, inOut);
    const settle = span(t, tRest - 0.25, tOut + 0.3, EASE.settle);
    return {
      ax: lerp(13, 8, glide),
      ay: lerp(24, 9, glide),
      // Out of the depth as it arrives; a little nearer as it comes to rest on the card.
      tz: lerp(-260, 0, arrive) + 150 * settle,
      P,
      at: [lerp(START[0], REST[0], glide), lerp(START[1], REST[1], glide) - 10 * settle],
      // In out of the dark, and back into it over the shot's last third of a second (a breath before 12.2).
      opacity: Math.min(span(t, tIn, tIn + 0.32, EASE.linear), 1 - span(t, tOut - 0.32, tOut, inOut)),
    };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const cards = m.cards; // plate rects, in the grid's order
    const target = cards[MK.TARGET];
    const origin = [PAD + (target[0] + target[2] / 2) * Z, PAD + (target[1] + target[3] / 2) * Z];
    const cam = camera(t);
    st.set("#M", {
      left: px(cam.at[0] - origin[0]),
      top: px(cam.at[1] - origin[1]),
      "transform-origin": `${px(origin[0])} ${px(origin[1])}`,
      transform: `perspective(${P}px) translateZ(${r3(cam.tz)}px) rotateY(${r3(cam.ay)}deg) rotateX(${r3(cam.ax)}deg)`,
      ...fade(cam.opacity),
    });
    // A plate point, through the window's tilt, to the frame.
    const toFrame = ([x, y]) => {
      const local = [PAD + x * Z - origin[0], PAD + y * Z - origin[1]];
      const [fx, fy] = project(local, cam);
      return [cam.at[0] + fx, cam.at[1] + fy];
    };

    // The pointer's run across the first row, over the pictures, to rest on 14 Wattle Grove's.
    const run = span(t, tIn + 0.24, tRest, inOut);
    const first = cards[0];
    const from = [first[0] + first[2] * 0.3, first[1] + first[3] * 0.42];
    const to = [target[0] + target[2] * 0.56, target[1] + target[3] * 0.36];
    const tip = [lerp(from[0], to[0], run), lerp(from[1], to[1], run) - Math.sin(Math.PI * run) * 26];
    pointer(st, t, { from: toFrame(tip), to: toFrame(tip), a: tIn, b: tIn + 1, show: tIn + 0.22, hide: tOut - 0.34 });

    // Each card in the first row lifts while the pointer is over it; 14 Wattle Grove's stays lifted, brightened.
    // As it is chosen the rest of the page settles back a little: every listing is a photograph now, and the chosen
    // card has to lead by its light as well as its ring (the drawn covers it was first set among sat back by themselves).
    const chosen = span(t, tRest - 0.04, tRest + 0.4, EASE.settle);
    cards.forEach((c, i) => {
      const inRow = Math.abs(c[1] - target[1]) < 4;
      let lift = 0;
      if (inRow && t >= tIn + 0.2) {
        const d = Math.max(0, Math.abs(tip[0] - (c[0] + c[2] / 2)) - c[2] * 0.42);
        lift = EASE.settle(Math.max(0, 1 - d / 70));
      }
      if (i !== MK.TARGET) {
        st.set(`#mk-card-${i}`, {
          transform: `translateY(${px(-11 * lift)}) scale(${r3(1 + 0.028 * lift)})`,
          "box-shadow": `0 ${px(10 + 20 * lift)} ${px(30 + 34 * lift)} rgba(0,0,0,${r3(0.3 + 0.26 * lift)})`,
          "border-color": `rgba(255,255,255,${r3(0.1 + 0.2 * lift)})`,
          filter: `brightness(${r3(1 + 0.1 * lift - 0.14 * chosen)})`,
        });
        return;
      }
      // 14 Wattle Grove: lifted further, and selected as the product selects a card (its border and ring in the
      // workspace's blue), with that light on the page around it.
      const held = Math.max(lift, span(t, tRest - 0.14, tRest + 0.32, EASE.settle));
      const b = chosen;
      st.set(`#mk-card-${i}`, {
        transform: `translateY(${px(-12 * held)}) scale(${r3(1 + 0.03 * held)})`,
        "box-shadow": `0 0 0 ${px(2 * b)} rgba(61,99,255,${r3(0.95 * b)}), 0 0 0 ${px(7 * b)} rgba(43,76,240,${r3(0.24 * b)}), 0 ${px(18 * b)} ${px(64 * b)} rgba(61,99,255,${r3(0.34 * b)}), 0 ${px(10 + 22 * held)} ${px(30 + 34 * held)} rgba(0,0,0,${r3(0.3 + 0.25 * held)})`,
        "border-color": `rgba(${Math.round(255 - 194 * b)},${Math.round(255 - 156 * b)},255,${r3(0.1 + 0.12 * held + 0.78 * b)})`,
      });
    });
    const bright = span(t, tRest, tRest + 0.42, EASE.settle);
    st.set(`#mk-card-${MK.TARGET} .mk-glow`, fade(bright));
    st.set(`#mk-card-${MK.TARGET} .mk-photo`, { filter: `brightness(${r3(1 + 0.08 * bright)}) saturate(${r3(1 + 0.06 * bright)})` });
    // The grade answers once, as the card brightens.
    const since = t - (tRest + 0.08);
    const pulse = since > 0 && since < 0.5 ? Math.sin((Math.PI * since) / 0.5) : 0;
    st.set("#mk-grade", {
      transform: `scale(${r3(1 + 0.08 * pulse)})`,
      "box-shadow": `0 6px 16px rgba(229,185,58,${r3(0.28 + 0.4 * bright)}), 0 0 ${px(22 * bright)} rgba(229,185,58,${r3(0.45 * bright)})`,
    });
    return st;
  };

  return {
    id: "marketplace",
    shots: ["12.1"],
    palette: "aurixa",
    html,
    measure: { cards: ["#M-0", ".mk-card", true] },
    state,
  };
}

module.exports = marketplaceScene;
