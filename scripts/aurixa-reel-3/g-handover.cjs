// G-HANDOVER and the parts blocks 07 and 08 share (scenes/handover.cjs, broker.cjs, gains.cjs), in Reel 1's kit:
//  - a window with its own top bar: the portal's mark and name, the page, and the DEMO WORKSPACE label, drawn at the
//    frame's size above the page rather than as part of the plate, so the label is in view whatever part of a wide
//    page the camera frames (a bar laid on the plate ends at the plate's right edge, and a camera on the left of a
//    1,440 px page never sees it);
//  - framings of a region of a page, and the moves between them, with the horizontal and the vertical able to move at
//    different times (a camera that must reach the right of a page before it goes down past something it must not
//    show);
//  - the product's toast, drawn by the product's own Toaster in the screens harness (r3-handover-toast.png: Capture
//    12's own picture of it caught it still sliding in, see the report), sliding in as sonner slides it;
//  - G-HANDOVER's line of light and its traveller, a ring that lights a button, and the flare where the line arrives.
// Nothing here times anything: the scenes pass the times, from the brief's beats.
const M = require("./motion.cjs");
const S = require("../aurixa-reel-1/stage.cjs");

const { KIT, F, PAD, fade, px, r3, lerp, lerp2, zoomLerp, span, EASE } = M;

/** The window bar's height, frame px. */
const BAR_PX = 62;
const RADIUS = "calc(var(--reel-radius-window) * 1.6 - 12px)";

const css = `
.hd-bar { position:relative; height:${BAR_PX}px; display:flex; align-items:center; gap:13px; padding:0 18px; box-sizing:border-box;
  background:linear-gradient(180deg, #121a30, #0c1325); border-bottom:1px solid rgba(255,255,255,.09);
  border-radius:${RADIUS} ${RADIUS} 0 0; font-family:var(--reel-sans); color:#fff; overflow:hidden; white-space:nowrap; z-index:3; }
.hd-bar .emb { width:34px; height:34px; flex:none; background:center/contain no-repeat; }
.hd-bar .who { display:flex; flex-direction:column; gap:4px; flex:none; }
.hd-bar .who b { font-size:15px; font-weight:800; letter-spacing:.06em; }
.hd-bar .who small { font-size:10.5px; font-weight:700; letter-spacing:.22em; color:#8d95a8; }
.hd-bar .sep { width:1px; height:30px; background:rgba(255,255,255,.12); margin:0 3px; flex:none; }
.hd-bar .page { font-size:19px; font-weight:700; color:#e8ecf4; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.hd-bar .demo { margin-left:auto; flex:none; font-size:12px; letter-spacing:.16em; font-weight:800; color:#D7B35F;
  border:1px solid rgba(215,179,95,.5); border-radius:999px; padding:7px 12px; }
.hd-win .fk-page { border-top-left-radius:0; border-top-right-radius:0; }
.hd-toast { position:absolute; left:0; top:0; transform-origin:0 0; z-index:22; pointer-events:none; }
.hd-toast img { display:block; width:100%; height:100%; }
.hd-line { position:absolute; left:0; top:0; height:3px; margin-top:-1.5px; transform-origin:0 50%; pointer-events:none; border-radius:2px;
  background:linear-gradient(90deg, rgba(94,221,232,.15) 0%, #5edde8 10%, #d7b35f 70%, #f5d17a 100%);
  box-shadow:0 0 14px rgba(215,179,95,.55), 0 0 4px rgba(94,221,232,.45); }
.hd-dot { position:absolute; left:0; top:0; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, #fffbe8 0%, #f5d17a 38%, rgba(215,179,95,.55) 62%, rgba(215,179,95,0) 72%);
  box-shadow:0 0 30px 6px rgba(215,179,95,.55); }
.hd-ring { position:absolute; left:0; top:0; border-radius:12px; pointer-events:none; border:2px solid #e2c278;
  box-shadow:0 0 0 1px rgba(255,236,190,.35), 0 0 26px rgba(215,179,95,.65), inset 0 0 18px rgba(215,179,95,.25); }
.hd-ring i { position:absolute; inset:0; border-radius:inherit; background:rgba(215,179,95,.16); mix-blend-mode:screen; }
.hd-sheen { position:absolute; inset:0; overflow:hidden; pointer-events:none; border-radius:inherit; z-index:4; mix-blend-mode:screen; }
.hd-sheen i { position:absolute; top:-30%; bottom:-30%; width:28%; left:0;
  background:linear-gradient(90deg, rgba(255,236,190,0), rgba(255,236,190,.38) 50%, rgba(255,236,190,0)); transform:skewX(-16deg); }
.hd-glow { position:absolute; inset:-2px; border-radius:inherit; pointer-events:none; z-index:5;
  border:2px solid rgba(226,194,120,.85); box-shadow:0 0 0 1px rgba(255,236,190,.25), 0 0 46px rgba(215,179,95,.55), inset 0 0 30px rgba(215,179,95,.18); }
.hd-doc { position:absolute; left:0; top:0; transform-origin:0 0; border-radius:4px; overflow:hidden;
  box-shadow:0 34px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(215,179,95,.28); }
.hd-doc img { display:block; width:100%; height:100%; }
`;

const barHtml = (id, { portal, page }) =>
  `<div class="hd-bar" id="${id}-bar"><div class="emb" style="background-image:url('${F.EMBLEM}')"></div><div class="who"><b>AURIXA SYSTEMS</b><small>${portal}</small></div>${page ? `<div class="sep"></div><div class="page">${page}</div>` : ""}<span class="demo">DEMO WORKSPACE</span></div>`;

/**
 * A G-WINDOW (../aurixa-reel-1/motion.cjs windowHtml) holding `keys` (plates stacked to cross-fade), with the bar above
 * its page when `bar` ({ portal, page }) is given, and a light to sweep its glass (`${id}-sheen`).
 */
function windowHtml(id, keys, z, bar = null) {
  let html = M.windowHtml(id, keys, z).replace(
    'class="fk-win"',
    `class="fk-win${bar ? " hd-win" : ""}"`,
  );
  if (bar)
    html = html.replace(
      `<div class="fk-page" id="${id}-page">`,
      `${barHtml(id, bar)}<div class="fk-page" id="${id}-page">`,
    );
  return S.intoWindow(
    html,
    `<div class="hd-sheen" id="${id}-sheen" style="visibility:hidden"><i></i></div><div class="hd-glow" id="${id}-glow" style="visibility:hidden"></div>`,
  );
}

/**
 * A framing that shows `region` ([x, y, w, h], plate CSS px) at `zoom`, the window centred on the frame point
 * `centre`; with a bar, the window is taller by the bar and the region sits under it.
 */
function frameRegion(region, zoom, centre, bar = true) {
  const [x, y, w, h] = region;
  const top = bar ? BAR_PX : 0;
  const W = w * zoom + 2 * PAD;
  const H = h * zoom + 2 * PAD + top;
  return {
    rect: [centre[0] - W / 2, centre[1] - H / 2, W, H],
    zoom,
    focus: [x + w / 2, y + h / 2],
    at: [centre[0], centre[1] + top / 2],
    bar: top,
  };
}
/**
 * Between two framings: the zoom by ratio; the horizontal (the rect's x and width, the focus's x and the at's x) on
 * `px`, and the vertical on `py` (both default to `p`), so a camera can finish one before it starts the other.
 */
function mix(a, b, p, { px: ph = p, py: pv = p } = {}) {
  const z = zoomLerp(a.zoom, b.zoom, p);
  return {
    rect: [
      lerp(a.rect[0], b.rect[0], ph),
      lerp(a.rect[1], b.rect[1], pv),
      lerp(a.rect[2], b.rect[2], ph),
      lerp(a.rect[3], b.rect[3], pv),
    ],
    zoom: z,
    focus: [lerp(a.focus[0], b.focus[0], ph), lerp(a.focus[1], b.focus[1], pv)],
    at: [lerp(a.at[0], b.at[0], ph), lerp(a.at[1], b.at[1], pv)],
    bar: a.bar,
  };
}
/** A framing moved by [dx, dy] frame px, and scaled about its centre by `k` (its zoom with it). */
function shift(f, dx, dy, k = 1) {
  const cx = f.rect[0] + f.rect[2] / 2 + dx;
  const cy = f.rect[1] + f.rect[3] / 2 + dy;
  const W = (f.rect[2] - 2 * PAD) * k + 2 * PAD;
  const H = (f.rect[3] - 2 * PAD - f.bar) * k + 2 * PAD + f.bar;
  return {
    rect: [cx - W / 2, cy - H / 2, W, H],
    zoom: f.zoom * k,
    focus: f.focus,
    at: [cx + (f.at[0] - (f.rect[0] + f.rect[2] / 2)) * k, cy + f.bar / 2],
    bar: f.bar,
  };
}

/**
 * Places a window (windowHtml) at a framing: its layers at their opacities, its veil, and its bar across the top of
 * its page. Returns where its plate lands (placeWindow's map, zoom and page size).
 */
function place(st, id, css, framing, layers, opts = {}) {
  const top = framing.bar ?? 0;
  const [x, y, w, h] = framing.rect;
  const g = M.placeWindow(
    st,
    id,
    css,
    { ...framing, rect: [x, y + top, w, h - top] },
    layers,
    opts,
  );
  st.set(`#${id}`, { left: px(x), top: px(y) });
  if (top) st.set(`#${id}-bar`, { width: px(g.pw) });
  // A check (outside the render) records every window's camera, to test what it shows against what it must not.
  if (globalThis.__HD_RECORD)
    globalThis.__HD_RECORD.push({ id, css, framing, g, layers, opacity: opts.opacity ?? 1 });
  return g;
}
/** A window's gold edge, at `o`. */
const glow = (st, id, o) => st.set(`#${id}-glow`, fade(o));
/** A light across a window's glass, over [a, b]. */
function sheen(st, t, id, a, b, opacity = 1) {
  const p = span(t, a, b, EASE.move);
  st.set(`#${id}-sheen i`, { transform: `translateX(${r3(-120 + 520 * p)}%) skewX(-16deg)` });
  st.set(`#${id}-sheen`, fade(p > 0 && p < 1 ? opacity * Math.sin(Math.PI * p) : 0));
}

// ------------------------------------------------------------------ the product's toast
/** The toast's picture (scale 3): its size and where its body and words are in it (CSS px). */
const TOAST = {
  src: "https://reel-assets.local/r3-handover-toast.png",
  css: [408, 125],
  body: [26, 26, 356, 73],
  words: [66, 43, 299, 39],
};
const toastHtml = (id = "toast") =>
  `<div class="hd-toast" id="${id}" style="width:${TOAST.css[0]}px;height:${TOAST.css[1]}px;visibility:hidden"><img src="${TOAST.src}" alt=""></div>`;
/**
 * The toast at `scale`, its body's top-left corner at the frame point `at`: in as sonner brings it (up from below, and
 * faded in, on ease-settle) from `a`, out from `b`.
 */
function toastState(st, t, { a, b = Infinity, at, scale, id = "toast" }) {
  const p = span(t, a, a + 0.42, EASE.settle);
  const q = Number.isFinite(b) ? span(t, b, b + 0.3, EASE.move) : 0;
  const x = at[0] - TOAST.body[0] * scale;
  const y = at[1] - TOAST.body[1] * scale + 34 * (1 - p) - 18 * q;
  st.set(`#${id}`, {
    transform: `translate(${px(x)}, ${px(y)}) scale(${r3(scale)})`,
    ...fade(Math.min(p, 1 - q)),
  });
}

// ------------------------------------------------------------------ G-HANDOVER: the line, its traveller, a lit door
const lineHtml = (id, z = 12) =>
  `<div class="hd-line" id="${id}" style="z-index:${z};visibility:hidden"></div>`;
const dotHtml = (id, z = 13) =>
  `<div class="hd-dot" id="${id}" style="z-index:${z};visibility:hidden"></div>`;
const ringHtml = (id, z = 14) =>
  `<div class="hd-ring" id="${id}" style="z-index:${z};visibility:hidden"><i></i></div>`;
/** The line from a to b (frame px), drawn to `drawn` of its length (../aurixa-reel-1/stage.cjs lineState). */
const lineState = (st, id, a, b, opts) => S.lineState(st, id, a, b, opts);
/** The traveller at `u` (0 to 1) along a to b; faded in and out at the ends of its run. */
function dotState(st, id, a, b, u, opacity = 1) {
  const v = Math.max(0, Math.min(1, u));
  const [x, y] = lerp2(a, b, v);
  const o = u <= 0 || u >= 1 ? 0 : Math.min(1, v / 0.08, (1 - v) / 0.12) * opacity;
  st.set(`#${id}`, { transform: `translate(${px(x)}, ${px(y)})`, ...fade(o) });
}
/** A ring lighting a frame rect (a button through a window's map) from `a`: in quickly, a pulse, held until `b`. */
function ringState(st, t, id, rect, a, b = Infinity, grow = 7, opacity = 1) {
  const p = span(t, a, a + 0.22, EASE.settle);
  const q = Number.isFinite(b) ? span(t, b, b + 0.3, EASE.linear) : 0;
  const pulse = span(t, a, a + 0.6, EASE.settle);
  const g = grow + 10 * (1 - pulse);
  const [x, y, w, h] = rect;
  st.set(`#${id}`, {
    transform: `translate(${px(x - g)}, ${px(y - g)})`,
    width: px(w + 2 * g),
    height: px(h + 2 * g),
    ...fade(Math.min(p, 1 - q) * opacity),
  });
}
/** Where a line leaves a frame rect towards the point p (the rect's own centre outwards). */
function edge(rect, p) {
  const [x, y, w, h] = rect;
  const c = [x + w / 2, y + h / 2];
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const q = Math.min(w / 2 / Math.abs(dx || 1e-6), h / 2 / Math.abs(dy || 1e-6));
  return [c[0] + dx * q, c[1] + dy * q];
}
/** The flare where the line arrives (stage.cjs's bloom and shock ring), at frame point c from `a`. */
const flareHtml = (id, z = 15) =>
  `<div class="st-bloom" id="${id}-bloom" style="z-index:${z};visibility:hidden;left:0;top:0;width:200px;height:200px"></div><div class="st-shock" id="${id}-shock" style="z-index:${z};visibility:hidden;left:0;top:0;width:200px;height:200px"></div>`;
function flareState(st, t, id, c, a, size = 520, life = 0.7) {
  const p = span(t, a, a + 0.55, EASE.settle);
  const bloom = t < a ? 0 : Math.max(0, 1 - (t - a) / life);
  const b = size * (0.35 + 0.65 * p);
  st.set(`#${id}-bloom`, {
    transform: `translate(${px(c[0] - b / 2)}, ${px(c[1] - b / 2)}) scale(${r3(b / 200)})`,
    "transform-origin": "0 0",
    ...fade(0.85 * bloom),
  });
  const s = size * 1.25 * EASE.settle(Math.min(1, Math.max(0, (t - a) / 0.7)));
  st.set(`#${id}-shock`, {
    transform: `translate(${px(c[0] - s / 2)}, ${px(c[1] - s / 2)}) scale(${r3(Math.max(s, 1) / 200)})`,
    "transform-origin": "0 0",
    ...fade(t < a ? 0 : 0.6 * Math.max(0, 1 - (t - a) / Math.min(0.6, life))),
  });
}

// ------------------------------------------------------------------ the handover's arrival, shared by 07.3 and 07.4
/**
 * The Finance Portal as G-HANDOVER's line reaches it at the end of 07.3, and as 07.4 opens on it: Jamie's portal (My
 * Clients, the portal's own mark and Partner Access, Jamie Chen of Harbour Finance Group), framed on its top left.
 * 07.3 ends with this window exactly here, and 07.4 starts from it, so the cut between them doesn't move it.
 */
const PORTAL_BAR = { portal: "FINANCE PORTAL", page: "My Clients" };
const PORTAL_ARRIVAL = { region: [0, 0, 700, 205], zoom: 0.95, centre: [540, 1030] };

module.exports = {
  BAR_PX,
  css,
  stageCss: S.stageCss,
  windowHtml,
  frameRegion,
  mix,
  shift,
  place,
  sheen,
  glow,
  TOAST,
  toastHtml,
  toastState,
  lineHtml,
  dotHtml,
  ringHtml,
  lineState,
  dotState,
  ringState,
  edge,
  flareHtml,
  flareState,
  PORTAL_BAR,
  PORTAL_ARRIVAL,
};
