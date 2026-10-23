// Reel 2's own graphics, in Reel 1's kit and tokens (aurixa-reel.css):
//  - the screens the film draws from the product (screens.json: each picture's file, its size in the product's
//    CSS px and the regions measured on it, written by assets.py from the screens harness's captures);
//  - G-PASSPORT: the Compliance Passport as a booklet in depth, its cover and leaves the product's own (PassportBook,
//    drawn by the harness), opening and turning about its spine with the light falling on each page as it turns;
//  - G-STAMP: an impression struck, as a stamp is pressed: in from above, the press, and the ink settling.
// Nothing here times anything: the scenes pass the times, from the brief's beats.
const fs = require("fs");
const path = require("path");
const M = require("./motion.cjs");

const { span, lerp, r3, px, fade, clamp01, EASE } = M;

const SCREENS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../docs/brands/aurixa-reel-2/screens.json"), "utf8"),
);
/** A screen the harness drew: its file (served from the assets folder), size (CSS px) and regions. */
const screen = (key) => {
  const s = SCREENS.screens[key];
  if (!s) throw new Error(`screens.json has no ${key}`);
  return { ...s, src: `https://reel-assets.local/${s.file}` };
};
/** A named region of a screen, [x, y, w, h] in its CSS px. */
const region = (key, name) => {
  const r = screen(key).regions[name];
  if (!r) throw new Error(`${key} has no region ${name}`);
  return r;
};
const centre = ([x, y, w, h]) => [x + w / 2, y + h / 2];

/**
 * A screen's own top bar, for a capture that is a part of a page (the Client Portal's consents, the Command
 * Centre's case workspace): the portal's mark and name, the page, and its DEMO WORKSPACE label, as the product's
 * top bars carry it, so every screen in the film carries the label.
 */
const BAR_H = 66;
const barCss = `
.r2-bar { position:absolute; left:0; right:0; top:0; height:${BAR_H}px; z-index:4; display:flex; align-items:center; gap:14px; padding:0 22px;
  background:linear-gradient(180deg, #121a30, #0d1426); border-bottom:1px solid rgba(255,255,255,.08); font-family:var(--reel-sans); color:#fff; }
.r2-bar .emb { width:36px; height:36px; flex:none; background:center/contain no-repeat; }
.r2-bar .who { display:flex; flex-direction:column; gap:4px; }
.r2-bar .who b { font-size:15px; font-weight:800; letter-spacing:.06em; }
.r2-bar .who small { font-size:10px; font-weight:700; letter-spacing:.24em; color:#8d95a8; }
.r2-bar .sep { width:1px; height:30px; background:rgba(255,255,255,.12); margin:0 6px; }
.r2-bar .page { font-size:19px; font-weight:700; color:#e8ecf4; white-space:nowrap; }
.r2-bar .demo { margin-left:auto; font-size:11px; letter-spacing:.16em; font-weight:800; color:#D7B35F; border:1px solid rgba(215,179,95,.5);
  border-radius:999px; padding:7px 12px; white-space:nowrap; }
`;
const barHtml = ({ portal, page, emblem }) =>
  `<div class="r2-bar"><div class="emb" style="background-image:url('${emblem}')"></div><div class="who"><b>AURIXA SYSTEMS</b><small>${portal}</small></div><div class="sep"></div><div class="page">${page}</div><span class="demo">DEMO WORKSPACE</span></div>`;

/**
 * A captured screen as a plate of Reel 1's G-WINDOW (../aurixa-reel-1/motion.cjs windowHtml), so a scene moves a
 * camera over it as Reel 1 moves one over a plate: R2S-<key>[-<from>][-to<to>][-bar] in Reel 1's PLATES. The
 * plate keeps the screen from CSS y `from` to `to`; `bar` ({ portal, page, emblem }) puts the screen's top bar
 * above it. Returns the plate's name, its CSS size and `at`, which takes a region of the screen to where it is on
 * the plate.
 */
function screenPlate(key, { bar = null, from = 0, to = null } = {}) {
  const { PLATES } = require("../aurixa-reel-1/plates.cjs");
  const s = screen(key);
  const [w, full] = s.css;
  const h = to ?? full;
  const top = bar ? BAR_H : 0;
  const css = [w, h - from + top];
  const name = `R2S-${key}${from ? `-${from}` : ""}${to ? `-to${to}` : ""}${bar ? "-bar" : ""}`;
  if (!PLATES[name])
    PLATES[name] = {
      size: css,
      scale: 1,
      html:
        `<div style="position:absolute;left:0;top:${top}px;width:${w}px;height:${h - from}px;overflow:hidden"><img src="${s.src}" alt="" style="position:absolute;left:0;top:${-from}px;width:${w}px;height:${full}px"></div>` +
        (bar ? barHtml(bar) : ""),
    };
  const at = (name2) => {
    const [x, y, rw, rh] = region(key, name2);
    return [x, y - from + top, rw, rh];
  };
  return { name, css, at };
}

// ------------------------------------------------------------------ G-PASSPORT
/** The leaf's design size (passportBooklet.pure.ts, LEAF_W x LEAF_H): every leaf is drawn at it. */
const LEAF = [470, 648];
/** Where each sheet sits in the stack, towards the viewer: the cover on top, then leaf n under the one before. */
const COVER_Z = 0.6;
const leafZ = (n) => -1 - n * 0.6;

const bookCss = `
.pp-cam { position:absolute; left:0; top:0; width:1080px; height:1920px; perspective:2600px; perspective-origin:540px 760px; }
.pp-book { position:absolute; left:0; top:0; transform-style:preserve-3d; transform-origin:0 0; }
.pp-ground { position:absolute; border-radius:50%; background:radial-gradient(closest-side, rgba(0,0,0,.62), rgba(0,0,0,.28) 55%, rgba(0,0,0,0));
  transform-origin:50% 50%; }
.pp-block { position:absolute; left:0; top:0; transform-style:preserve-3d; }
.pp-edge { position:absolute; background:linear-gradient(90deg, #d9cfb6, #f3ecdb 30%, #e7dcc2 60%, #cfc3a5);
  box-shadow:inset 0 0 0 1px rgba(90,70,30,.18); }
.pp-edge.b { background:linear-gradient(180deg, #e9dfc6, #d2c5a6); }
.pp-leaf { position:absolute; left:0; top:0; transform-style:preserve-3d; transform-origin:0 50%; }
.pp-face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; overflow:hidden; border-radius:6px; }
.pp-face img { position:absolute; left:0; top:0; width:100%; height:100%; display:block; }
.pp-face.back { transform:rotateY(180deg); background:#efe6d2;
  background-image:repeating-radial-gradient(circle at 30% 40%, rgba(176,140,60,.10) 0 1px, transparent 1px 9px); }
.pp-cover .pp-face.back { background:linear-gradient(160deg, #0f1d36, #08111f 60%, #050b16); background-image:none; }
.pp-shade { position:absolute; inset:0; border-radius:6px; pointer-events:none; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
.pp-cast { position:absolute; inset:0; border-radius:6px; pointer-events:none;
  background:linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.18) 38%, rgba(0,0,0,0) 72%); }
.pp-sheen { position:absolute; inset:0; overflow:hidden; border-radius:6px; pointer-events:none; mix-blend-mode:screen; }
.pp-sheen i { position:absolute; top:-40%; bottom:-40%; width:34%; left:0;
  background:linear-gradient(90deg, rgba(255,236,190,0), rgba(255,236,190,.55) 50%, rgba(255,236,190,0)); transform:skewX(-18deg); }
.pp-glint { position:absolute; border-radius:50%; mix-blend-mode:screen; pointer-events:none;
  background:radial-gradient(closest-side, rgba(255,246,222,.95), rgba(245,209,122,.45) 40%, rgba(245,209,122,0)); }
.pp-seal { position:absolute; left:0; top:0; width:100%; height:100%; }
.pp-ink { position:absolute; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgba(40,30,10,.22), rgba(40,30,10,0)); }
`;

/**
 * The booklet: `leaves` from the top of the stack down (each { key, src, seals? }), under its `cover` (a src), all
 * at the leaf's design size times `scale`. A leaf's `seals` are layers drawn on its face (each { src, at: [x, y] the
 * die's centre in leaf px }), struck one by one by bookState.
 */
function bookHtml(id, { cover, leaves, scale }) {
  const [w, h] = LEAF.map((v) => v * scale);
  const leaf = (lid, src, extra = "", cls = "", z = 0) =>
    `<div class="pp-leaf ${cls}" id="${lid}" style="width:${w}px;height:${h}px;transform:translateZ(${z}px)">` +
    `<div class="pp-face front"><img src="${src}" alt="">${extra}<div class="pp-cast" id="${lid}-cast" style="opacity:0"></div><div class="pp-shade" id="${lid}-shade"></div></div>` +
    `<div class="pp-face back"><div class="pp-shade" id="${lid}-bshade"></div></div></div>`;
  const seals = (lid, list = []) =>
    list
      .map(
        (s, i) =>
          `<div class="pp-ink" id="${lid}-ink${i}" style="visibility:hidden"></div><img class="pp-seal" id="${lid}-s${i}" src="${s.src}" alt="" style="visibility:hidden;transform-origin:${r3((s.at[0] / LEAF[0]) * 100)}% ${r3((s.at[1] / LEAF[1]) * 100)}%">`,
      )
      .join("");
  // The page block under the leaves: its fore-edge and foot, a few millimetres deep.
  const D = 7 * scale;
  const block =
    `<div class="pp-block" id="${id}-block">` +
    `<div class="pp-edge" style="left:${w - 1}px;top:${4 * scale}px;width:${D}px;height:${h - 8 * scale}px;transform-origin:0 0;transform:rotateY(90deg)"></div>` +
    `<div class="pp-edge b" style="left:${4 * scale}px;top:${h - 1}px;width:${w - 8 * scale}px;height:${D}px;transform-origin:0 0;transform:rotateX(-90deg)"></div>` +
    `</div>`;
  const pages = leaves
    .map((l, n) => leaf(`${id}-L${n}`, l.src, seals(`${id}-L${n}`, l.seals), "", leafZ(n)))
    .join("");
  const coverHtml = leaf(
    `${id}-cover`,
    cover,
    `<div class="pp-sheen" id="${id}-sheen"><i id="${id}-sheen-i"></i></div><div class="pp-glint" id="${id}-glint" style="visibility:hidden"></div>`,
    "pp-cover",
    COVER_Z,
  );
  return (
    `<div class="pp-cam" id="${id}"><div class="pp-ground" id="${id}-ground"></div>` +
    `<div class="pp-book" id="${id}-book" style="width:${w}px;height:${h}px">${block}${pages}${coverHtml}</div></div>`
  );
}

/**
 * The booklet at a moment: its pose (the centre of the leaf at [x, y] in the frame, z towards the viewer, its
 * rotations in degrees, the light's sweep across the cover at p in [0, 1] or null, the clasp's glint), how far the
 * cover and each leaf have turned (0 closed, 180 over to the left), and which seals are struck (times).
 */
function bookState(st, t, id, o) {
  const {
    scale,
    pose,
    cover = 0,
    turns = [],
    strikes = [],
    sheen = null,
    glint = null,
    opacity = 1,
  } = o;
  const [w, h] = LEAF.map((v) => v * scale);
  const { x, y, z = 0, rx = 0, ry = 0, rz = 0, k = 1 } = pose;
  st.set(`#${id}-book`, {
    transform: `translate3d(${px(x - w / 2)}, ${px(y - h / 2)}, ${px(z)}) translate(${px(w / 2)}, ${px(h / 2)}) rotateX(${r3(rx)}deg) rotateY(${r3(ry)}deg) rotateZ(${r3(rz)}deg) scale(${r3(k)}) translate(${px(-w / 2)}, ${px(-h / 2)})`,
    ...fade(opacity),
  });
  // Its shadow on the ground: wider and softer as it rises, darker as it settles.
  const lift = clamp01(z / 600);
  st.set(`#${id}-ground`, {
    left: px(x - w * 0.62),
    top: px(y + h * 0.42 - 40 * lift),
    width: px(w * 1.24 * k),
    height: px(h * 0.24 * k),
    ...fade(opacity * (0.85 - 0.45 * lift)),
  });
  // A page turning: its face darkens to the half-turn and its back lightens past it; the page under it takes the
  // shadow it casts, from the spine, until it is over.
  // Each leaf keeps its place in the stack (the cover above, every leaf a little under the one before it, as
  // bookHtml lays them), lifted above the rest while it turns.
  const turn = (lid, deg, under, base) => {
    const d = Math.max(0, Math.min(180, deg));
    const s = Math.sin((d * Math.PI) / 180);
    st.set(`#${lid}`, {
      transform: `translateZ(${px(base + (d > 0 ? 1.4 : 0))}) rotateY(${r3(-d)}deg)`,
      visibility: d >= 179.5 ? "hidden" : "visible",
    });
    st.set(`#${lid}-shade`, {
      background: `linear-gradient(90deg, rgba(0,0,0,${r3(0.1 * s)}), rgba(0,0,0,${r3(0.42 * s)}))`,
    });
    st.set(`#${lid}-bshade`, {
      background: `linear-gradient(270deg, rgba(0,0,0,${r3(0.05 + 0.3 * (1 - s))}), rgba(0,0,0,${r3(0.25 * (1 - s))}))`,
    });
    if (under) st.set(`#${under}-cast`, { opacity: r3(d < 179 ? 0.85 * s : 0) });
  };
  const ids = turns.map((_, n) => `${id}-L${n}`);
  turn(`${id}-cover`, cover, ids[0] ?? null, COVER_Z);
  turns.forEach((deg, n) => turn(ids[n], deg, ids[n + 1] ?? null, leafZ(n)));
  // The light across the cover, once.
  if (sheen === null) st.set(`#${id}-sheen-i`, { transform: "translateX(-200%) skewX(-18deg)" });
  else
    st.set(`#${id}-sheen-i`, {
      transform: `translateX(${r3(lerp(-140, 420, sheen))}%) skewX(-18deg)`,
    });
  // The clasp's glint: the gold tab at the foot of the cover (BookletCover's clasp).
  if (glint === null) st.set(`#${id}-glint`, fade(0));
  else {
    const g = Math.sin(Math.PI * clamp01(glint));
    const cx = w / 2;
    const cy = h * 0.947;
    const r = 60 * scale * (0.6 + 0.4 * g);
    st.set(`#${id}-glint`, {
      left: px(cx - r),
      top: px(cy - r),
      width: px(2 * r),
      height: px(2 * r),
      ...fade(g),
    });
  }
  // The seals, struck in turn: in from above (larger, tilted), pressed, the ink spreading under the die.
  strikes.forEach(({ leaf, seals }) =>
    seals.forEach(({ at, die }, i) => {
      const sid = `${id}-L${leaf}-s${i}`;
      const u = span(t, at - 0.12, at, EASE.linear);
      const settle = span(t, at, at + 0.22, EASE.settle);
      const kk =
        u < 1 ? lerp(1.45, 1.0, u * u) : 1 + 0.035 * Math.sin(Math.PI * settle) * (1 - settle);
      st.set(`#${sid}`, {
        transform: `scale(${r3(kk)}) rotate(${r3(lerp(-7, 0, u))}deg)`,
        ...fade(u),
      });
      const ink = span(t, at, at + 0.5, EASE.settle);
      const [dx, dy, dw, dh] = die.map((v) => v * scale);
      const rr = Math.max(dw, dh) * (0.55 + 0.35 * ink);
      st.set(`#${id}-L${leaf}-ink${i}`, {
        left: px(dx + dw / 2 - rr),
        top: px(dy + dh / 2 - rr),
        width: px(2 * rr),
        height: px(2 * rr),
        ...fade(u >= 1 ? 0.9 * (1 - ink) : 0),
      });
    }),
  );
}

// ------------------------------------------------------------------ G-STAMP, struck outside the booklet
const stampCss = `
.st-stamp { position:absolute; left:0; top:0; transform-origin:50% 50%; }
.st-stamp img { display:block; width:100%; height:100%; }
.st-flash { position:absolute; left:0; top:0; border-radius:50%; mix-blend-mode:screen; pointer-events:none;
  background:radial-gradient(closest-side, rgba(255,246,222,.55), rgba(215,179,95,.22) 45%, rgba(215,179,95,0)); }
`;
const stampHtml = (sid, src, size, z = 30) =>
  `<div class="st-flash" id="${sid}-flash" style="z-index:${z - 1};visibility:hidden"></div><div class="st-stamp" id="${sid}" style="width:${size[0]}px;height:${size[1]}px;z-index:${z};visibility:hidden"><img src="${src}" alt=""></div>`;
/** A stamp struck at `at`, centred on [x, y], resting at `tilt` degrees; gone again (faded) from `out`. */
/**
 * An ink impression of one of the product's stamps (StampFace's own wording and layout: the issuer, the event, the
 * diamond rule, the date and the person), for striking onto a dark screen, where the leaf's paper face would read
 * as a pasted card: gold ink with the grain of a real impression, on nothing. Drawn once (scene.bake) at INK_SIZE.
 */
const INK_SIZE = [460, 268];
function inkStamp({
  title,
  date,
  name = "",
  org = "AURIXA SYSTEMS · PROPERTY",
  ink = "#E2BE6A",
  size = 38,
}) {
  const [w, h] = INK_SIZE;
  const grain = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3.2 2.55"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
  );
  // Single quotes: the mask sits inside a double-quoted style attribute.
  const mask = `url('data:image/svg+xml,${grain}')`;
  return `<div style="position:relative;width:${w}px;height:${h}px;color:${ink};-webkit-mask-image:${mask};mask-image:${mask}">
    <div style="position:absolute;inset:8px;border:5px solid currentColor;border-radius:14px"></div>
    <div style="position:absolute;inset:20px;border:1.5px solid currentColor;border-radius:8px"></div>
    <div style="position:absolute;inset:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center">
      <div style="font:800 15px/1 var(--reel-sans);letter-spacing:.26em">${org}</div>
      <div style="font:700 ${size}px/1.02 'Playfair Display', Georgia, serif;letter-spacing:.05em;text-transform:uppercase">${title}</div>
      <div style="display:flex;align-items:center;gap:12px;width:70%"><i style="flex:1;height:1.5px;background:currentColor"></i><span style="font-size:13px">◆</span><i style="flex:1;height:1.5px;background:currentColor"></i></div>
      <div style="font:700 21px/1 'Inconsolata', ui-monospace, monospace;letter-spacing:.14em">${date}</div>
      ${name ? `<div style="font:600 17px/1 var(--reel-sans);letter-spacing:.04em;opacity:.92">${name}</div>` : ""}
    </div></div>`;
}

function stampState(st, t, sid, { at, x, y, size, tilt = -6, out = Infinity, k = 1 }) {
  const u = span(t, at - 0.13, at, EASE.linear);
  const settle = span(t, at, at + 0.26, EASE.settle);
  const gone = Number.isFinite(out) ? span(t, out, out + 0.3, EASE.move) : 0;
  const kk =
    (u < 1 ? lerp(1.6, 1, u * u) : 1 + 0.05 * Math.sin(Math.PI * settle) * (1 - settle)) * k;
  st.set(`#${sid}`, {
    transform: `translate(${px(x - size[0] / 2)}, ${px(y - size[1] / 2)}) scale(${r3(kk)}) rotate(${r3(lerp(tilt - 10, tilt, u))}deg)`,
    ...fade(u * (1 - gone)),
  });
  const f = span(t, at, at + 0.45, EASE.settle);
  const r = Math.max(...size) * (0.5 + 0.6 * f) * k;
  st.set(`#${sid}-flash`, {
    transform: `translate(${px(x - r)}, ${px(y - r)})`,
    width: px(2 * r),
    height: px(2 * r),
    ...fade(u >= 1 ? 0.85 * (1 - f) * (1 - gone) : 0),
  });
}

module.exports = {
  SCREENS,
  screen,
  region,
  centre,
  screenPlate,
  BAR_H,
  barCss,
  barHtml,
  LEAF,
  bookCss,
  bookHtml,
  bookState,
  stampCss,
  stampHtml,
  stampState,
  INK_SIZE,
  inkStamp,
};
