// Reel 1, shot 04.2 (third cut): one connected operating environment, one portal at a time.
// The client asked for each portal to be seen on its own and clearly (22 October 2026), so the orbit is the payoff,
// never the introduction:
//  - the Command Centre's window (04.1's, from exactly where ./brand.cjs leaves it) swings back and shrinks to the
//    top of the frame: the hub, its label lit;
//  - each portal in turn comes forward out from behind the hub, almost the frame's width and turned a few degrees
//    in depth, in a cone of the site's light from the hub (its two edges the site's rail line, a traveller running
//    each), its name above it in large mono with the eyebrow's gold rule drawing under it; just before the next
//    comes forward it swings aside to the hub's left or right, turned toward the hub, out of focus and joined to it;
//  - the camera pulls back: the hub in the middle of the frame, the five portals in their orbit around it, every
//    line lit and a traveller running each once.
// Windows are drawn nearest last, judged by their size, so a portal coming forward rises from behind the hub and
// one leaving passes behind the one arriving. ./research.cjs (05.1) carries the constellation on from exactly where
// this leaves it (orbitHtml, orbitState).
const M = require("../motion.cjs");
const S = require("../stage.cjs");
const brand = require("./brand.cjs");
const {
  shotOf,
  beat,
  EASE,
  bezier,
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
  placeWindow,
  captionHtml,
  caption,
  F,
} = M;

const B = [0, 1, 2, 3, 4, 5, 6].map((i) => beat("04.2", i));
const END = shotOf("04.2").out;
/** Stage moves, longer than a control's: arriving (away briskly, a long settle) and leaving (a gentle lift-off). */
const ARRIVE = bezier(0.3, 0, 0.15, 1);
const LEAVE = bezier(0.42, 0, 0.18, 1);
/** The depth a portal's window is turned in: nearer than 04.1's, so a turn reads on a phone. */
const PERSP = 1200;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const CC_CSS = F.plate(brand.CC).css;
/** The five portals in the order they come forward, the side each swings to, and their place in the orbit. */
const PORTALS = [
  { key: "PL-06A-a", name: "Client portal", side: -1, angle: -126, front: 880 },
  { key: "NEW-DASHBOARDS-finance", name: "Finance portal", side: 1, angle: -54, front: 940 },
  { key: "NEW-DASHBOARDS-accountant", name: "Accountant portal", side: -1, angle: 162, front: 940 },
  { key: "NEW-DASHBOARDS-solicitor", name: "Solicitor portal", side: 1, angle: 18, front: 940 },
  {
    key: "NEW-DASHBOARDS-builders",
    name: "Builders Network",
    side: 0,
    angle: 90,
    front: 940,
    teal: true,
  },
].map((p) => ({ ...p, css: F.plate(p.key).css }));

/** A window's height at a width, for a plate shown whole. */
const heightAt = (css, width) => ((width - 2 * PAD) * css[1]) / css[0] + 2 * PAD;

// ------------------------------------------------------------------ the stage's places
const pose = (o) => ({ ry: 0, rx: 0, persp: PERSP, opacity: 1, blur: 0, veil: 0, ...o });
/** The hub while the portals come forward: the top of the frame. */
const HUB_TOP = pose({ at: [540, 384], width: 340 });
/** The hub in the orbit, and the orbit around it (seen from above: the far side smaller). */
const HUB_ORBIT = pose({ at: [540, 760], width: 380 });
const ORBIT = { rx: 362, ry: 384 };
/** Where the floor converges once the camera has pulled back to the orbit. */
const ORBIT_HORIZON = 560;
/** Where a portal stands when it is the one on show: its label above it, its window under the label. */
const LABEL_TOP = 592;
const FRONT_TOP = 724;

const hidden = () =>
  pose({ at: [HUB_TOP.at[0], HUB_TOP.at[1] + 30], width: 150, rx: 24, opacity: 0 });
const front = (i) => {
  const p = PORTALS[i];
  const h = heightAt(p.css, p.front);
  // Turned a few degrees toward the side it will swing to.
  return pose({
    at: [540, FRONT_TOP + h / 2],
    width: p.front,
    ry: p.side ? -4 * p.side : 3,
    rx: 3,
  });
};
/** Beside the hub, turned toward it and out of focus: the nearest first, the one before it further back. */
const stacked = (side, back) =>
  pose({
    at: [540 + side * (back ? 398 : 368), back ? 348 : 390],
    width: back ? 268 : 300,
    ry: -side * (back ? 40 : 33),
    rx: 4,
    blur: back ? 2.4 : 1.4,
    veil: back ? 0.52 : 0.3,
    opacity: back ? 0.9 : 1,
  });
/** The orbit turning, slowly, once the camera has pulled back to it (degrees; it eases into its turn). */
const drift = (t) => {
  const u = t - (B[6] + 0.6);
  return u <= 0 ? 0 : 2.4 * (u < 0.5 ? u * u : u - 0.25);
};
const orbit = (i, t) => {
  const a = ((PORTALS[i].angle + drift(t)) * Math.PI) / 180;
  const x = HUB_ORBIT.at[0] + ORBIT.rx * Math.cos(a);
  const y = HUB_ORBIT.at[1] + ORBIT.ry * Math.sin(a);
  return pose({ at: [x, y], width: 284 + 36 * Math.sin(a), ry: ((540 - x) / 540) * 10, rx: 5 });
};
/** Between two poses: places evenly, sizes by ratio, the turn and the light evenly. */
const mix = (a, b, p) => ({
  at: lerp2(a.at, b.at, p),
  width: zoomLerp(a.width, b.width, p),
  ry: lerp(a.ry, b.ry, p),
  rx: lerp(a.rx, b.rx, p),
  persp: lerp(a.persp, b.persp, p),
  opacity: lerp(a.opacity, b.opacity, p),
  blur: lerp(a.blur, b.blur, p),
  veil: lerp(a.veil, b.veil, p),
});

/**
 * When portal i comes forward (on its beat), leaves the front (just before the next one's beat, so the one
 * coming forward never crosses it), is pushed further back by the next on its side, and goes to its orbit.
 */
const timesOf = (i) => {
  const b = B[i + 1];
  const nb = i < 4 ? B[i + 2] : null;
  return {
    b,
    enter: [b - 0.26, b + 0.4],
    exit: nb ? [nb - 0.42, nb + 0.16] : null,
    back: i < 2 ? [B[i + 4] - 0.42, B[i + 4] + 0.16] : null,
    pull: [B[6] - 0.32 + i * 0.03, B[6] + 0.9 + i * 0.03],
    leave: nb ? nb - 0.42 : B[6] - 0.32,
  };
};
function portalPose(i, t) {
  const T = timesOf(i);
  const p = mix(hidden(), front(i), span(t, ...T.enter, ARRIVE));
  // It is drawn from behind the hub, so it can be fully there before it clears it.
  p.opacity = clamp01((t - T.enter[0]) / 0.16);
  // On show it drifts a little nearer, so it is never quite still.
  p.width *= 1 + 0.014 * span(t, T.enter[1] - 0.15, T.leave + 0.25, EASE.linear);
  let q = p;
  if (T.exit) q = mix(q, stacked(PORTALS[i].side, false), span(t, ...T.exit, LEAVE));
  if (T.back) q = mix(q, stacked(PORTALS[i].side, true), span(t, ...T.back, LEAVE));
  return mix(q, orbit(i, t), span(t, ...T.pull, LEAVE));
}

/** The hub: from 04.1's window, back to the top; then down into the orbit's middle as the camera pulls back. */
function hubPose(t) {
  const a = brand.ccAt(B[0]);
  const from = pose({
    at: a.framing.at,
    width: a.framing.rect[2],
    ry: a.ry,
    rx: a.rx,
    persp: 2200,
  });
  const back = span(t, B[0], B[0] + 0.86, LEAVE);
  // It swings back as it goes: a few more degrees away at the middle of the move, then square to us.
  const p = mix(from, HUB_TOP, back);
  p.ry -= 9 * Math.sin(Math.PI * back);
  p.rx += 11 * Math.sin(Math.PI * back);
  // A little out of focus while a portal is on show in front of it.
  const shown =
    span(t, B[1] - 0.1, B[1] + 0.3, EASE.settle) * (1 - span(t, B[6] - 0.32, B[6] + 0.4));
  p.veil = 0.18 * shown;
  p.blur = 0.6 * shown;
  return mix(p, HUB_ORBIT, span(t, B[6] - 0.32, B[6] + 0.9, LEAVE));
}

// ------------------------------------------------------------------ geometry of a turned window
/** A window's framing at a pose (its plate whole at the pose's width). */
const framingOf = (css, ps) => whole(css, (ps.width - 2 * PAD) / css[0], ps.at);
/** Where a point of a window's own box (u, v in 0..1) lands once it is turned in depth (S.turn about its centre). */
function project(framing, ps, u, v) {
  const [x, y, w, h] = framing.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = (u - 0.5) * w;
  const dy = (v - 0.5) * h;
  const a = (ps.ry * Math.PI) / 180;
  const b = (ps.rx * Math.PI) / 180;
  const X = dx * Math.cos(a) + dy * Math.sin(b) * Math.sin(a);
  const Y = dy * Math.cos(b);
  const Z = -dx * Math.sin(a) + dy * Math.sin(b) * Math.cos(a);
  const k = ps.persp / (ps.persp - Z);
  return [cx + X * k, cy + Y * k];
}
/** Where a line from a's centre to b's centre leaves a and reaches b (rects as [x, y, w, h]), as fractions of it. */
function clipLine(ra, rb) {
  const ca = [ra[0] + ra[2] / 2, ra[1] + ra[3] / 2];
  const cb = [rb[0] + rb[2] / 2, rb[1] + rb[3] / 2];
  const d = [cb[0] - ca[0], cb[1] - ca[1]];
  const out = (r) =>
    Math.min(
      Math.abs(d[0]) > 1e-6 ? r[2] / 2 / Math.abs(d[0]) : Infinity,
      Math.abs(d[1]) > 1e-6 ? r[3] / 2 / Math.abs(d[1]) : Infinity,
    );
  return { from: ca, to: cb, a: out(ra), b: 1 - out(rb) };
}

// ------------------------------------------------------------------ the page
const TEAL_LINE =
  "background:linear-gradient(90deg, rgba(0,168,181,0) 0%, #22c3ce 14%, #00a8b5 86%, rgba(0,168,181,0) 100%)";
const TEAL_DOT = "background:#5ff3fb;box-shadow:0 0 28px rgba(0,168,181,.95), 0 0 8px #e2feff";
/** A line of the site's light (S.lineHtml) with its own class, in the Builders Network's teal where it is theirs. */
const lightHtml = (id, z, cls, teal) =>
  S.lineHtml(id, z)
    .replace('class="st-line"', `class="st-line ${cls}${teal ? " teal" : ""}"`)
    .replace("visibility:hidden", `visibility:hidden${teal ? `;${TEAL_LINE}` : ""}`);
const travellerHtml = (id, z, teal) =>
  S.dotHtml(id, z).replace("visibility:hidden", `visibility:hidden${teal ? `;${TEAL_DOT}` : ""}`);
const portalWindowHtml = (i, z) => {
  const p = PORTALS[i];
  let html = windowHtml(`P${i}`, [p.key], z);
  if (p.teal)
    html = html.replace(`class="fk-win" id="P${i}"`, `class="fk-win" id="P${i}" data-teal="1"`);
  return S.intoWindow(html, `<div class="st-glint" id="P${i}-glint"></div>`);
};
const CSS = `<style>
.fk-win[data-teal] { border-color:color-mix(in srgb, var(--reel-teal-builders) 70%, transparent); }
.pt-beam { position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(180deg, rgba(94,221,232,.14) 0%, rgba(215,179,95,.075) 55%, rgba(215,179,95,0) 100%); }
.pt-beam.teal { background:linear-gradient(180deg, rgba(34,195,206,.17) 0%, rgba(0,168,181,.085) 55%, rgba(0,168,181,0) 100%); }
.pt-edge { filter:drop-shadow(0 0 5px rgba(94,221,232,.6)); }
.pt-edge.teal { filter:drop-shadow(0 0 5px rgba(0,168,181,.75)); }
.pt-spoke { height:3px; filter:drop-shadow(0 0 6px rgba(215,179,95,.5)); }
.pt-spoke.teal { filter:drop-shadow(0 0 6px rgba(0,168,181,.65)); }
.fk-chip.lit { border-color:rgba(215,179,95,.75); box-shadow:0 0 26px rgba(215,179,95,.38), inset 0 0 12px rgba(215,179,95,.12); }
.fk-chip.teal { color:#22c3ce; }
.fk-chip.teal.lit { border-color:rgba(0,168,181,.8); box-shadow:0 0 26px rgba(0,168,181,.45), inset 0 0 12px rgba(0,168,181,.14); }
</style>`;

/** The orbit's own layers (shared with 05.1): the portals' windows and shadows, spokes, travellers and labels. */
function orbitHtml() {
  const out = [];
  PORTALS.forEach((p, i) => {
    out.push(lightHtml(`sp${i}`, 2, "pt-spoke", p.teal));
    out.push(travellerHtml(`sd${i}`, 3, p.teal));
    out.push(S.shadowHtml(`P${i}-shadow`, 1));
    out.push(portalWindowHtml(i, 4));
    out.push(
      `<div class="fk-chip lit${p.teal ? " teal" : ""}" id="ch${i}" style="z-index:12;visibility:hidden">${p.name}</div>`,
    );
  });
  out.push(
    `<div class="fk-chip" id="chH" style="z-index:12;visibility:hidden">Command Centre</div>`,
  );
  return out.join("");
}

/** The shadow a window throws on the floor, fading out as its foot rises past the horizon. */
function shadowOf(st, id, framing, horizon, opacity = 1) {
  const foot = framing.rect[1] + framing.rect[3];
  S.shadowState(st, id, {
    cx: framing.at[0],
    foot,
    width: framing.rect[2],
    opacity: opacity * clamp01((foot - horizon - 30) / 180),
  });
}
/** A portal's window at a pose; returns its framing. */
function placePortal(st, i, ps, horizon) {
  const p = PORTALS[i];
  const framing = framingOf(p.css, ps);
  placeWindow(st, `P${i}`, p.css, framing, [1], {
    opacity: ps.opacity,
    veil: ps.veil,
    transform: S.turn({ ry: ps.ry, rx: ps.rx, persp: ps.persp }),
  });
  st.set(`#P${i}`, { filter: S.soften(ps.blur) });
  shadowOf(st, `P${i}-shadow`, framing, horizon, ps.opacity);
  return framing;
}
/** The hub's window at a pose (its layers' opacities as placeWindow takes them); returns its framing. */
function placeHub(st, ps, layers, horizon) {
  const framing = framingOf(CC_CSS, ps);
  placeWindow(st, "W", CC_CSS, framing, layers, {
    opacity: ps.opacity,
    veil: ps.veil,
    transform: S.turn({ ry: ps.ry, rx: ps.rx, persp: ps.persp }),
  });
  st.set("#W", { filter: S.soften(ps.blur) });
  shadowOf(st, "W-shadow", framing, horizon, ps.opacity);
  return framing;
}
/** A chip under (or, for the two at the top of the orbit and the hub, over) a window. */
function chipAt(st, id, framing, above, opacity) {
  const [, y, , h] = framing.rect;
  st.set(`#${id}`, {
    left: px(framing.at[0]),
    top: px(above ? y - 54 : y + h + 16),
    ...fade(opacity),
  });
}
/** The hub's label, lit: the eyebrow's gold at its edge and a glow (0 to 1). */
const hubChipLit = (st, k) =>
  st.set("#chH", {
    "border-color": `rgba(215,179,95,${r3(0.1 + 0.65 * k)})`,
    "box-shadow": `0 0 26px rgba(215,179,95,${r3(0.38 * k)}), inset 0 0 12px rgba(215,179,95,${r3(0.12 * k)})`,
  });
/** A spoke from the hub to portal i's window: the part between them drawn, and its traveller at `run`. */
function spoke(st, i, hubFraming, fr, drawn, opacity, run) {
  const c = clipLine(hubFraming.rect, fr.rect);
  const a = lerp2(c.from, c.to, c.a);
  const b = lerp2(c.from, c.to, c.b);
  S.lineState(st, `sp${i}`, a, b, { drawn, opacity });
  const on = run !== null && run > 0 && run < 1;
  const at = lerp2(a, b, on ? EASE.move(run) : 0);
  st.set(`#sd${i}`, {
    transform: `translate(${px(at[0])}, ${px(at[1])})`,
    ...fade(on ? Math.min(1, run * 8, (1 - run) * 6) : 0),
  });
}
const isAbove = (i) => Math.sin((PORTALS[i].angle * Math.PI) / 180) < -0.5;

/**
 * The constellation at t as the camera has pulled back to it (the end of 04.2, the start of 05.1). `away` (0 to 1)
 * is how far the portals have fallen out of the frame as the hub comes forward in 05.1; `lines`, `labels` and
 * `hubLabel` how much of the spokes, the portals' chips and the hub's still show; `hub` the hub's framing where
 * it has moved. The portals are drawn behind the hub.
 */
function orbitState(st, t, { horizon, away = 0, lines = 1, labels = 1, hubLabel = 1, hub = null }) {
  const hubFraming = hub ?? framingOf(CC_CSS, HUB_ORBIT);
  chipAt(st, "chH", hubFraming, true, hubLabel);
  hubChipLit(st, 1);
  PORTALS.forEach((p, i) => {
    const o = orbit(i, t);
    // Falling away: outward from the hub, nearer, softer and gone.
    const k = 1 + 0.8 * away;
    const ps = {
      ...o,
      at: [
        HUB_ORBIT.at[0] + (o.at[0] - HUB_ORBIT.at[0]) * k,
        HUB_ORBIT.at[1] + (o.at[1] - HUB_ORBIT.at[1]) * k,
      ],
      width: o.width * (1 + 0.35 * away),
      blur: 8 * away,
      opacity: 1 - away,
    };
    const fr = placePortal(st, i, ps, horizon);
    st.set(`#P${i}`, { "z-index": "4" });
    spoke(st, i, hubFraming, fr, lines, 1, null);
    chipAt(st, `ch${i}`, fr, isAbove(i), labels);
    st.set(`#P${i}-glint`, { "background-position": "-20% 0" });
  });
}

// ------------------------------------------------------------------ the scene
function portalsScene() {
  const html = () =>
    [
      S.stageCss(),
      CSS,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      // Each portal's cone of light from the hub while it is on show: its fill, its edges and their travellers.
      PORTALS.map(
        (p, i) =>
          `<div class="pt-beam${p.teal ? " teal" : ""}" id="bm${i}" style="z-index:2;visibility:hidden"></div>` +
          ["a", "b"]
            .map(
              (e) =>
                lightHtml(`bl${i}${e}`, 3, "pt-edge", p.teal) +
                travellerHtml(`bd${i}${e}`, 3, p.teal),
            )
            .join(""),
      ).join(""),
      orbitHtml(),
      windowHtml("W", [brand.CC], 5),
      // Each portal's name, in large mono with the eyebrow's gold rule under it.
      PORTALS.map(
        (p, i) =>
          `<div class="st-label${p.teal ? " teal" : ""}" id="Lb${i}" style="top:${LABEL_TOP}px;z-index:11;visibility:hidden"><span class="n">0${i + 1} / 05</span><span class="t">${p.name}</span><span class="r"></span></div>`,
      ).join(""),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The floor: as 04.1 left it; then the camera rising and drawing back over it as it pulls back to the orbit.
    const pull = span(t, B[6] - 0.32, B[6] + 0.9, LEAVE);
    const horizon = lerp(brand.HORIZON, ORBIT_HORIZON, pull);
    S.floorState(st, "floor", { horizon, flow: brand.flowAt(t) - 150 * pull, opacity: 1 });

    // The hub, and its label lit once it is in its place. Its glass glows gold for a moment just before each
    // portal comes out from behind it, and once more as the orbit's lines light: the light starts at the hub.
    const hp = hubPose(t);
    const hub = placeHub(st, hp, [1], horizon);
    const bump = (c, w) => {
      const u = (t - c) / w + 0.5;
      return u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
    };
    const glow = Math.max(
      ...PORTALS.map((_, i) => bump(B[i + 1] - 0.12, 0.44)),
      bump(B[6] + 0.86, 0.5),
    );
    st.set("#W", {
      "box-shadow": `0 0 ${r3(46 * glow)}px rgba(215,179,95,${r3(0.5 * glow)}), 0 0 0 ${r3(2 * glow)}px rgba(215,179,95,${r3(0.55 * glow)}), var(--reel-shadow-window)`,
    });
    chipAt(st, "chH", hub, true, span(t, B[0] + 0.5, B[0] + 0.85, EASE.settle));
    hubChipLit(st, span(t, B[0] + 0.62, B[0] + 1.1, EASE.settle));

    // The portals, one at a time, then their orbit.
    const poses = PORTALS.map((_, i) => portalPose(i, t));
    // Nearest last: the windows drawn in order of their size.
    [{ id: "W", w: hp.width }, ...poses.map((ps, i) => ({ id: `P${i}`, w: ps.width }))]
      .sort((a, b) => a.w - b.w)
      .forEach((o, k) => st.set(`#${o.id}`, { "z-index": String(4 + k) }));
    PORTALS.forEach((p, i) => {
      const T = timesOf(i);
      const ps = poses[i];
      const fr = placePortal(st, i, ps, horizon);
      // The light crossing its glass as it arrives: its dashboard, live.
      const glint = span(t, T.b - 0.02, T.b + 0.78, EASE.linear);
      st.set(`#P${i}-glint`, { "background-position": `${r3(120 - glint * 140)}% 0` });

      // Its cone of light from the hub while it is on show.
      const drawn = span(t, T.b - 0.14, T.b + 0.3, EASE.settle);
      const beamOn = drawn * (1 - span(t, T.leave - 0.1, T.leave + 0.14, EASE.linear));
      const hubL = project(hub, hp, 0.08, 0.97);
      const hubR = project(hub, hp, 0.92, 0.97);
      const winL = project(fr, ps, 0.03, 0.02);
      const winR = project(fr, ps, 0.97, 0.02);
      S.lineState(st, `bl${i}a`, hubL, winL, { drawn, opacity: beamOn });
      S.lineState(st, `bl${i}b`, hubR, winR, { drawn, opacity: beamOn });
      st.set(`#bm${i}`, {
        "clip-path": `polygon(${[hubL, hubR, winR, winL].map(([x, y]) => `${r3(x)}px ${r3(y)}px`).join(", ")})`,
        ...fade(beamOn * span(t, T.b - 0.06, T.b + 0.34, EASE.settle)),
      });
      const run = (t - (T.b + 0.06)) / 0.6;
      ["a", "b"].forEach((e, k) => {
        const at = lerp2(k ? hubR : hubL, k ? winR : winL, EASE.move(clamp01(run)));
        st.set(`#bd${i}${e}`, {
          transform: `translate(${px(at[0])}, ${px(at[1])})`,
          ...fade(run > 0 && run < 1 ? Math.min(1, run * 8, (1 - run) * 5) * beamOn : 0),
        });
      });

      // Its name: the number, then the name rising into focus, then the rule drawing under it.
      // (It is drawn over the window rising through its line, and goes as the window starts to swing away.)
      const nIn = span(t, T.b - 0.1, T.b + 0.2, EASE.settle);
      const tIn = span(t, T.b - 0.04, T.b + 0.32, EASE.settle);
      const rIn = span(t, T.b + 0.1, T.b + 0.6, EASE.move);
      const out = span(t, T.leave + 0.02, T.leave + 0.22, EASE.linear);
      st.set(`#Lb${i}`, {
        transform: `translateY(${px(-12 * out)})`,
        ...fade(Math.max(nIn, tIn) * (1 - out)),
      });
      st.set(`#Lb${i} .n`, { transform: `translateY(${px((1 - nIn) * 12)})`, ...fade(nIn) });
      st.set(`#Lb${i} .t`, {
        transform: `translateY(${px((1 - tIn) * 18)})`,
        filter: S.soften((1 - tIn) * 6),
        ...fade(tIn),
      });
      st.set(`#Lb${i} .r`, { transform: `scaleX(${r3(rIn)})`, ...fade(rIn > 0.001 ? 1 : 0) });

      // Its spoke: faint while it waits beside the hub (fainter once it is the further back), lit in the orbit, a
      // traveller running it once there.
      const waiting =
        (T.exit ? span(t, T.exit[1] - 0.1, T.exit[1] + 0.3, EASE.settle) : 0) *
        (T.back ? 1 - 0.75 * span(t, ...T.back, EASE.linear) : 1);
      const lit = span(t, B[6] + 0.4 + i * 0.05, B[6] + 0.9 + i * 0.05, EASE.settle);
      const runAt = B[6] + 0.82 + i * 0.06;
      spoke(
        st,
        i,
        hub,
        fr,
        Math.max(waiting, lit),
        Math.max(0.42 * waiting, lit),
        t > runAt ? (t - runAt) / 0.56 : null,
      );
      chipAt(
        st,
        `ch${i}`,
        fr,
        isAbove(i),
        span(t, B[6] + 0.62 + i * 0.05, B[6] + 1.0 + i * 0.05, EASE.settle),
      );
    });
    return st;
  };

  return { id: "portals", shots: ["04.2"], palette: "aurixa", html, state };
}

module.exports = portalsScene;
module.exports.orbitHtml = orbitHtml;
module.exports.orbitState = orbitState;
module.exports.placeHub = placeHub;
module.exports.shadowOf = shadowOf;
module.exports.framingOf = framingOf;
module.exports.project = project;
module.exports.pose = pose;
module.exports.mix = mix;
module.exports.HUB_ORBIT = HUB_ORBIT;
module.exports.ORBIT_HORIZON = ORBIT_HORIZON;
module.exports.PORTALS = PORTALS;
module.exports.CSS = CSS;
module.exports.ARRIVE = ARRIVE;
module.exports.LEAVE = LEAVE;
module.exports.PERSP = PERSP;
module.exports.END = END;
