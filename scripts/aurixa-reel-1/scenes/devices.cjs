// Reel 1, shot 12.4: what a more connected business could feel like (G-DEVICES, ../pages/devices.cjs). A laptop,
// a tablet and a phone stand in depth, each on a different portal and the same record: the Command Centre, the
// Client Portal, the Builders Network. The Command Centre takes the update first; a pulse of light leaves the
// laptop along the site's rail line to the others, and as it arrives both screens update at once, the same
// Matter updated on all three; then the three settle together, in sync, as the pulse fades. The camera makes one
// slow orbit round them, never reversing.
const M = require("../motion.cjs");
const { beat, shotOf, EASE, span, lerp, r3, px, State, fade, captionHtml, caption, F } = M;
const DV = require("../pages/devices.cjs");

// ------------------------------------------------------------------ the 3D the browser draws, in numbers
// 4 × 4 matrices (row-major, column vectors) for the CSS transforms the scene uses, so a point on any device's
// face can be found in the frame exactly where the browser draws it (the links run between such points).
const mul = (A, B) => {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) C[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j];
  return C;
};
const T = (x, y, z = 0) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const RX = (deg) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
};
const RY = (deg) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
};
const PERSP = (d) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1];
const chain = (...ms) => ms.reduce(mul);
const point = (Mx, [x, y]) => {
  const v = [0, 1, 2, 3].map((i) => Mx[i * 4] * x + Mx[i * 4 + 1] * y + Mx[i * 4 + 3]);
  return [v[0] / v[3], v[1] / v[3]];
};

const STAGE = { origin: [540, 806], perspective: 1700 };
// The devices in the rig's space (px; y down, z toward the viewer): where each stands and how it is turned.
const LAYOUT = {
  laptop: { at: [0, -46, -330], yaw: 0, pitch: 0 },
  tablet: { at: [236, 168, -50], yaw: -17, pitch: 9 },
  phone: { at: [-252, 150, 170], yaw: 19, pitch: 7 },
};
const ORBIT = [-13, 9]; // the rig's turn over the shot (degrees)
const LOOK = -11; // the camera a little above them, looking down

function devicesScene() {
  const shot = shotOf("12.4");
  const [tIn, tSettle] = [0, 1].map((i) => beat("12.4", i));
  const tOut = shot.out;
  // The Command Centre updates first; the pulse leaves it and lands on the bar line, where both screens update.
  const tFirst = tIn + 0.24;
  const tLeave = tIn + 0.36;
  const tLand = 107.84;
  const { laptop: LT, tablet: TB, phone: PH } = DV.SIZE;

  const html = () =>
    [
      `<style>${DV.CSS}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="dv-stage" class="fk-layer" style="z-index:3;perspective:${STAGE.perspective}px;perspective-origin:${STAGE.origin[0]}px ${STAGE.origin[1]}px">
        <div id="dv-rig" class="dv" style="left:${STAGE.origin[0]}px;top:${STAGE.origin[1]}px">
          ${DV.laptop({ id: "dv-laptop", plate: F.plate("PL-05A-a") })}
          ${DV.tablet({ id: "dv-tablet", plate: F.plate("PL-06A-a") })}
          ${DV.phone({ id: "dv-phone", page: DV.builderMobile() })}
        </div></div>`,
      // The rail line (the site's G-LINKS: cyan into gold) and its traveller, one for each device the pulse reaches.
      `<svg id="dv-links" class="fk-layer" style="z-index:6;overflow:visible" width="1080" height="1920" viewBox="0 0 1080 1920">
        <defs>
          <linearGradient id="dv-gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5edde8"/><stop offset=".55" stop-color="#d7b35f"/><stop offset="1" stop-color="#c89b3c"/></linearGradient>
          <linearGradient id="dv-gl" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5edde8"/><stop offset=".55" stop-color="#d7b35f"/><stop offset="1" stop-color="#c89b3c"/></linearGradient>
          <filter id="dv-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        ${[0, 1]
          .map(
            (i) =>
              `<path id="dv-g${i}" fill="none" stroke="url(#${i ? "dv-gl" : "dv-gr"})" stroke-width="9" stroke-linecap="round" filter="url(#dv-soft)" style="visibility:hidden"/>` +
              `<path id="dv-l${i}" fill="none" stroke="url(#${i ? "dv-gl" : "dv-gr"})" stroke-width="2.6" stroke-linecap="round" style="visibility:hidden"/>`,
          )
          .join("")}
      </svg>`,
      `<div class="fk-traveller" id="dv-t0" style="z-index:7;visibility:hidden"></div><div class="fk-traveller" id="dv-t1" style="z-index:7;visibility:hidden"></div>`,
      captionHtml(),
    ].join("");

  // The rig and each device at t; returns the matrices that place each face in the frame.
  const pose = (t) => {
    const orbit = lerp(ORBIT[0], ORBIT[1], span(t, tIn, tOut + 0.4, (u) => u));
    const dolly = lerp(-420, 0, span(t, tIn, tIn + 0.95, EASE.settle));
    const rig = chain(T(STAGE.origin[0], STAGE.origin[1]), PERSP(STAGE.perspective), T(0, 0, dolly), RX(LOOK), RY(orbit));
    const dev = (name, float = 0) => {
      const L = LAYOUT[name];
      return chain(T(L.at[0], L.at[1] + float, L.at[2]), RY(L.yaw), RX(L.pitch));
    };
    // A breath of float, each at its own phase, so the three are objects in a room and not one picture.
    const f = (k) => Math.sin((t - tIn) * 1.9 + k) * 4;
    const laptop = dev("laptop", f(0));
    const tablet = dev("tablet", f(2.1));
    const phone = dev("phone", f(4.2));
    return {
      css: {
        rig: `translateZ(${r3(dolly)}px) rotateX(${LOOK}deg) rotateY(${r3(orbit)}deg)`,
        laptop: { at: LAYOUT.laptop.at, float: f(0) },
        tablet: { at: LAYOUT.tablet.at, float: f(2.1) },
        phone: { at: LAYOUT.phone.at, float: f(4.2) },
      },
      // Each face's frame matrix (its own left/top and transform folded in, as devices.cjs lays it out).
      lid: chain(rig, laptop, RX(LT.tilt), T(-LT.lid[0] / 2, -LT.lid[1])),
      tablet: chain(rig, tablet, T(-TB.body[0] / 2, -TB.body[1] / 2)),
      phone: chain(rig, phone, T(-PH.body[0] / 2, -PH.body[1] / 2)),
    };
  };
  const devCss = (name, { at, float }) => {
    const L = LAYOUT[name];
    return `translate3d(${at[0]}px, ${r3(at[1] + float)}px, ${at[2]}px) rotateY(${L.yaw}deg) rotateX(${L.pitch}deg)`;
  };

  /** A quadratic curve from a to b bowing out by `bow` px to the side `side` (+1 right of travel, -1 left). */
  const curve = (a, b, bow, side) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = [b[0] - a[0], b[1] - a[1]];
    const n = Math.hypot(...d) || 1;
    const c = [m[0] - (d[1] / n) * bow * side, m[1] + (d[0] / n) * bow * side];
    const at = (u) => [
      (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0],
      (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1],
    ];
    let length = 0;
    for (let i = 1, p = a; i <= 24; i++) {
      const q = at(i / 24);
      length += Math.hypot(q[0] - p[0], q[1] - p[1]);
      p = q;
    }
    return { d: `M ${r3(a[0])} ${r3(a[1])} Q ${r3(c[0])} ${r3(c[1])} ${r3(b[0])} ${r3(b[1])}`, at, length };
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const p = pose(t);
    st.set("#dv-stage", fade(span(t, tIn, tIn + 0.4, EASE.linear)));
    st.set("#dv-rig", { transform: p.css.rig });
    st.set("#dv-laptop", { transform: devCss("laptop", p.css.laptop) });
    st.set("#dv-tablet", { transform: devCss("tablet", p.css.tablet) });
    st.set("#dv-phone", { transform: devCss("phone", p.css.phone) });

    // The links: from the laptop's screen edges, round the outside, to the top of the tablet and of the phone.
    const scr = LT.screen;
    const [bx, by] = LT.bezel;
    const fromR = point(p.lid, [bx + scr[0], by + scr[1] * 0.62]);
    const fromL = point(p.lid, [bx, by + scr[1] * 0.62]);
    const toTab = point(p.tablet, [TB.body[0] * 0.3, 0]);
    const toPhone = point(p.phone, [PH.body[0] * 0.66, 0]);
    const links = [curve(fromR, toTab, 70, -1), curve(fromL, toPhone, 70, 1)];
    const run = span(t, tLeave, tLand, EASE.move);
    const fadeOut = span(t, tSettle, tSettle + 0.5, EASE.move);
    links.forEach((c, i) => {
      const drawn = run;
      const o = (t >= tLeave ? 1 : 0) * (1 - fadeOut);
      const dash = { "stroke-dasharray": `${r3(c.length)} ${r3(c.length + 10)}`, "stroke-dashoffset": `${r3(c.length * (1 - drawn))}` };
      st.set(`#dv-l${i}`, { d: `path("${c.d}")`, ...dash, ...fade(0.9 * o) });
      st.set(`#dv-g${i}`, { d: `path("${c.d}")`, ...dash, ...fade(0.55 * o * (1 - 0.5 * span(t, tLand, tLand + 0.3, EASE.linear))) });
      const [x, y] = c.at(drawn);
      const arrive = span(t, tLand - 0.02, tLand + 0.22, EASE.linear);
      st.set(`#dv-t${i}`, {
        left: px(x),
        top: px(y),
        transform: `translate(-50%, -50%) scale(${r3(1.6 + 1.4 * Math.sin(Math.PI * Math.min(1, arrive)))})`,
        ...fade((t >= tLeave ? 1 : 0) * (1 - arrive) * span(t, tLeave, tLeave + 0.08, EASE.linear)),
      });
    });

    // Each screen takes the update: a band of light crosses it, its edge glows once, and the toast rises in.
    const update = (id, at) => {
      const u = span(t, at, at + 0.7, EASE.move);
      st.set(`#${id}-sweep`, { "background-position": `${r3(160 - 220 * u)}% 0`, ...fade(t >= at ? Math.sin(Math.PI * u) : 0) });
      st.set(`#${id}-flash`, fade(t >= at ? (1 - span(t, at, at + 0.6, EASE.settle)) * 0.9 : 0));
      const k = span(t, at + 0.06, at + 0.42, EASE.settle);
      const ty = id === "dv-phone" ? "translateX(-50%) " : "";
      st.set(`#${id}-toast`, { transform: `${ty}translateY(${px((1 - k) * 12)})`, ...fade(span(t, at + 0.06, at + 0.24, EASE.linear)) });
    };
    update("dv-laptop", tFirst);
    update("dv-tablet", tLand);
    update("dv-phone", tLand);
    return st;
  };

  return { id: "devices", shots: ["12.4"], palette: "aurixa", html, state };
}

module.exports = devicesScene;
