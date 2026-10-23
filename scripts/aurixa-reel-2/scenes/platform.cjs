// Reel 2, shots 03.3 and 03.4: everything in one connected operating environment, and where it gets exciting.
// The Command Centre's window, from exactly where ./brand.cjs leaves it. Its page dims and steps back; on each
// word a tile comes forward (a crop of a page the product draws, ../cc.cjs), and as the next one arrives it docks
// into its own entry in the sidebar, which lights: Property intelligence into Reports, Financial analysis into Cash
// Flow Analysis, Reporting into Generated Reports, Client management into Clients, Communication into Message Hub.
// On "more" five more fan out and, on "connected", dock into theirs (Market News Feed, Property Marketplace,
// Commercial / Industrial, Calendar and AML/CTF Compliance); a thread of light runs down the sidebar through every
// lit entry and the page comes back up. 03.4: the camera runs down the sidebar to the AML/CTF COMPLIANCE group, the
// pointer presses AML/CTF Compliance on "exciting" (its cyan ring; the entry turns selected), and the frame dims
// under a riser into 04.1's dark.
const M = require("../motion.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const CC = require("../cc.cjs");
const brand = require("./brand.cjs");

const {
  shotOf,
  beat,
  EASE,
  span,
  lerp,
  lerp2,
  r3,
  px,
  State,
  fade,
  windowHtml,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
} = M;

const B = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => beat("03.3", i));
const [T_IN, , , , , , T_MORE, T_CONNECTED] = B;
const [T4, T_EXCITING] = [0, 1].map((i) => beat("03.4", i));
const END = shotOf("03.4").out;
/** The tiles' arrivals: one on each named capability. */
const ARRIVE = B.slice(1, 6);
/** A tile docks as the next one arrives (the last as "more" is said); the chips on "connected". */
const DOCK = [...ARRIVE.slice(1), T_MORE].map((t) => t - 0.08);
const CHIPS_AT = CC.MORE.map((_, i) => T_MORE + 0.05 + i * 0.08);
const CHIPS_DOCK = CC.MORE.map((_, i) => T_CONNECTED - 0.05 + i * 0.09);
const DOCK_TIME = 0.62;
/** Where a tile stands while it is the one on show (its centre), and its scale. */
const SHOW = { at: [610, 840], k: 0.96 };
/** The thread of light down the sidebar, once every entry has docked. */
const THREAD = [CHIPS_DOCK.at(-1) + DOCK_TIME - 0.1, CHIPS_DOCK.at(-1) + DOCK_TIME + 0.9];

/** The camera in 03.4: into the sidebar's top, then down it to AML/CTF Compliance. */
const RECT_IN = [-40, -40, 1160, 2000];
const RUN = [
  [T4, T4 + 0.55],
  [T4 + 0.55, T4 + 1.05],
];

const css = `
.pf-tile { position:absolute; left:0; top:0; transform-origin:50% 50%; border-radius:30px; box-shadow:0 40px 90px rgba(0,0,0,.6); }
.pf-tile img { display:block; width:100%; height:100%; border-radius:30px; }
.pf-chip { position:absolute; left:0; top:0; height:74px; display:flex; align-items:center; gap:16px; padding:0 28px 0 22px; border-radius:20px;
  background:linear-gradient(180deg, rgba(18,28,56,.97), rgba(8,14,30,.97)); border:1.5px solid rgba(215,179,95,.5);
  box-shadow:0 22px 50px rgba(0,0,0,.55); font:700 30px/1 var(--reel-sans); color:#fff; white-space:nowrap; transform-origin:50% 50%; }
.pf-chip svg { width:34px; height:34px; flex:none; }
.pf-chip.gold { border-color:#d7b35f; box-shadow:0 22px 50px rgba(0,0,0,.55), 0 0 26px rgba(215,179,95,.4); color:#f5d17a; }
.pf-riser { position:absolute; inset:0; background:radial-gradient(ellipse 80% 60% at 30% 42%, rgba(4,11,22,.55) 0%, rgba(4,11,22,.92) 60%, #040B16 100%); }
.r2-thread { position:absolute; left:0; top:0; width:3px; border-radius:2px; background:linear-gradient(180deg, #5edde8, #d7b35f 30%, #d7b35f 80%, rgba(215,179,95,0));
  box-shadow:0 0 12px rgba(215,179,95,.7); transform-origin:50% 0; }
.r2-dot { position:absolute; left:0; top:0; width:12px; height:12px; margin:-6px 0 0 -6px; border-radius:50%; background:#f5d17a; box-shadow:0 0 22px #d7b35f, 0 0 6px #fff3d6; }
`;

const ICON = {
  news: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>',
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  factory: '<path d="M2 20V10l6 4V10l6 4V6l8 4v10z"/><path d="M2 20h20"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
};
const CHIP_ICON = ["news", "building", "factory", "calendar", "shield"];
const chipIcon = (name, gold) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${gold ? "#f5d17a" : "#d7b35f"}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
/** The chips' widths, set by their labels (30 px Inter, measured on the page). */
const CHIP_H = 74;

function platformScene() {
  // The window's two states: the Overview, and AML/CTF Compliance selected (03.4's press). The thread of light
  // and its traveller run inside the plate, so they move with the page.
  const win = windowHtml("W", ["R2-CC-a", "R2-CC-b"], 5);
  const withThread = win.replace(
    /(<div class="fk-scale" id="W-0"[^>]*>)/,
    `$1<div class="r2-thread" id="thread" style="visibility:hidden;z-index:3"></div><div class="r2-dot" id="tdot" style="visibility:hidden;z-index:3"></div>`,
  );
  if (withThread === win) throw new Error("platform: the window's first layer was not found");

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      withThread,
      CC.tiles
        .map(
          (t) =>
            `<div class="pf-tile" id="tile-${t.id}" style="z-index:8;width:${t.size[0]}px;height:${t.size[1]}px;visibility:hidden"><img src="https://reel-bake.local/${t.file}" alt=""></div>`,
        )
        .join(""),
      CC.MORE.map(
        (label, i) =>
          `<div class="pf-chip${i === CC.MORE.length - 1 ? " gold" : ""}" id="chip-${i}" style="z-index:9;visibility:hidden">${chipIcon(CHIP_ICON[i], i === CC.MORE.length - 1)}${label}</div>`,
      ).join(""),
      `<div class="fk-layer pf-riser" id="riser" style="z-index:20;visibility:hidden"></div>`,
      `<div class="fk-layer" style="z-index:21">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  /** The window's framing at t: settled (from 03.2), then in 03.4 into the sidebar and down it. */
  const framingAt = (t, m) => {
    const settled = brand.ccAt(t).framing;
    if (t < RUN[0][0]) return settled;
    const entry = m.entries[CC.entry("AML/CTF Compliance")];
    const top = m.groups[0];
    const a = {
      rect: RECT_IN,
      zoom: 1.9,
      focus: [entry[0] + entry[2] / 2, top[1] + 40],
      at: [380, 760],
    };
    const b = {
      rect: RECT_IN,
      zoom: 2.4,
      focus: [entry[0] + entry[2] / 2, entry[1] + entry[3] / 2],
      at: [340, 780],
    };
    const p1 = span(t, RUN[0][0], RUN[0][1], EASE.move);
    const p2 = span(t, RUN[1][0], RUN[1][1], EASE.move);
    const f1 = between(CC.CSS, settled, a, p1);
    if (p2 <= 0) return f1;
    // After the press, the camera keeps easing in, into 04.1's dark.
    const f2 = between(CC.CSS, f1, b, p2);
    const push = span(t, T_EXCITING + 0.1, END, EASE.linear);
    return push > 0 ? { ...f2, zoom: f2.zoom * (1 + 0.06 * push) } : f2;
  };

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const framing = framingAt(t, m);
    // The press turns AML/CTF Compliance selected: the second layer, crossed in quickly.
    const selected = span(t, T_EXCITING + 0.04, T_EXCITING + 0.16, EASE.linear);
    const g = placeWindow(st, "W", CC.CSS, framing, [1, selected]);
    // The page dims and steps back while the tiles come forward, and comes back up once they have docked.
    const dim =
      span(t, T_IN + 0.1, T_IN + 0.9, EASE.move) * (1 - span(t, THREAD[0], THREAD[1], EASE.move));
    for (const layer of ["#W-0", "#W-1"])
      st.set(`${layer} .cmain`, { opacity: r3(1 - 0.62 * dim) });
    // The floor and the window's shadow, as 03.2 left them; gone as the camera moves in.
    const away = span(t, RUN[0][0], RUN[0][0] + 0.5, EASE.move);
    S.floorState(st, "floor", {
      horizon: brand.HORIZON,
      flow: brand.flowAt(t),
      opacity: 1 - away,
    });
    S.shadowState(st, "W-shadow", {
      cx: framing.at[0],
      foot: framing.rect[1] + framing.rect[3],
      width: framing.rect[2],
      opacity: 1 - away,
    });

    /** An entry's centre in the frame, and its width there. */
    const entryAt = (i) => {
      const [x, y, w, h] = m.entries[i];
      return { at: g.map([x + w / 2, y + h / 2]), w: w * g.zoom };
    };
    /** When each entry's tile lands (it lights from then): Infinity for an entry nothing docks into. */
    const landed = new Array(CC.ENTRIES.length).fill(Infinity);

    // The tiles: forward on their word, docking as the next arrives.
    CC.tiles.forEach((tile, i) => {
      const a = ARRIVE[i];
      const d = DOCK[i];
      const arrive = span(t, a - 0.12, a + 0.4, EASE.settle);
      const dock = span(t, d, d + DOCK_TIME, EASE.move);
      const target = entryAt(tile.dockAt);
      const [w, h] = tile.size;
      const k0 = SHOW.k * lerp(0.86, 1, arrive);
      const k = lerp(k0, target.w / w, dock);
      // A gentle bow on the way to the sidebar, up and to the left.
      const mid = lerp2(SHOW.at, target.at, 0.5);
      const ctrl = [mid[0] + 60, mid[1] - 120];
      const q = (u) => [
        (1 - u) ** 2 * SHOW.at[0] + 2 * (1 - u) * u * ctrl[0] + u * u * target.at[0],
        (1 - u) ** 2 * SHOW.at[1] + 2 * (1 - u) * u * ctrl[1] + u * u * target.at[1],
      ];
      const [x, y] = dock > 0 ? q(dock) : [SHOW.at[0], SHOW.at[1] + lerp(70, 0, arrive)];
      const opacity =
        span(t, a - 0.12, a + 0.1, EASE.linear) *
        (1 - span(t, d + DOCK_TIME * 0.7, d + DOCK_TIME, EASE.linear));
      st.set(`#tile-${tile.id}`, {
        transform: `translate(${px(x - w / 2)}, ${px(y - h / 2)}) perspective(1400px) rotateX(${r3(lerp(12, 0, arrive))}deg) scale(${r3(k)})`,
        ...fade(opacity),
      });
      landed[tile.dockAt] = Math.min(landed[tile.dockAt], d + DOCK_TIME * 0.85);
    });

    // The chips: fanned out on "more", docking on "connected".
    const chipW = m.chips;
    CC.MORE.forEach((label, i) => {
      const n = CC.MORE.length;
      const home = [SHOW.at[0], SHOW.at[1] + (i - (n - 1) / 2) * (CHIP_H + 26)];
      const out = span(t, CHIPS_AT[i] - 0.06, CHIPS_AT[i] + 0.36, EASE.settle);
      const dock = span(t, CHIPS_DOCK[i], CHIPS_DOCK[i] + DOCK_TIME, EASE.move);
      const target = entryAt(CC.entry(label));
      const w = chipW[i][2];
      const start = lerp2([SHOW.at[0], SHOW.at[1]], home, out);
      const [x, y] = lerp2(start, target.at, dock);
      const k = lerp(lerp(0.7, 1, out), target.w / w, dock);
      st.set(`#chip-${i}`, {
        transform: `translate(${px(x - w / 2)}, ${px(y - CHIP_H / 2)}) scale(${r3(k)})`,
        ...fade(
          span(t, CHIPS_AT[i] - 0.06, CHIPS_AT[i] + 0.08, EASE.linear) *
            (1 - span(t, CHIPS_DOCK[i] + DOCK_TIME * 0.7, CHIPS_DOCK[i] + DOCK_TIME, EASE.linear)),
        ),
      });
      const e = CC.entry(label);
      landed[e] = Math.min(landed[e], CHIPS_DOCK[i] + DOCK_TIME * 0.85);
    });

    // The lit entries: a gold edge and glow on the entry itself, in both layers of the window, flaring as the
    // tile lands and settling.
    const lit = landed.map((a) => (Number.isFinite(a) ? span(t, a, a + 0.15, EASE.linear) : 0));
    lit.forEach((v, i) => {
      if (v <= 0) return;
      const flash = 1 + 1.4 * Math.exp(-Math.max(0, t - landed[i]) / 0.3);
      for (const layer of ["#W-0", "#W-1"])
        st.set(
          `${layer} .cside .grp a`,
          {
            "box-shadow": `inset 0 0 0 1px rgba(215,179,95,${r3(0.75 * v)}), 0 0 ${r3(16 * v * flash)}px rgba(215,179,95,${r3(0.38 * v)})`,
            "background-color": `rgba(200,155,60,${r3(0.14 * v * flash)})`,
          },
          i,
        );
    });

    // The thread of light: down the sidebar from the first lit entry to the last, a traveller running it once.
    const litRects = m.entries.filter((_, i) => lit[i] > 0);
    if (litRects.length && t >= THREAD[0]) {
      const y0 = Math.min(...litRects.map((r) => r[1]));
      const y1 = Math.max(...litRects.map((r) => r[1] + r[3]));
      const x = m.entries[0][0] + 4;
      const drawn = span(t, THREAD[0], THREAD[0] + 0.7, EASE.move);
      st.set("#thread", {
        transform: `translate(${px(x)}, ${px(y0)}) scaleY(${r3(drawn)})`,
        height: px(y1 - y0),
        ...fade(1 - span(t, T4 + 0.2, T4 + 0.6, EASE.linear)),
      });
      const run = span(t, THREAD[0] + 0.1, THREAD[1], EASE.move);
      st.set("#tdot", {
        transform: `translate(${px(x + 1.5)}, ${px(lerp(y0, y1, run))})`,
        ...fade(run > 0 && run < 1 ? 1 : 0),
      });
    }

    // 03.4: the pointer comes to AML/CTF Compliance and presses it on "exciting".
    const amlAt = entryAt(CC.entry("AML/CTF Compliance")).at;
    pointer(st, t, {
      from: [amlAt[0] + 420, amlAt[1] + 300],
      to: [amlAt[0] + 40, amlAt[1] + 6],
      a: T4 + 0.55,
      b: T_EXCITING - 0.08,
      show: T4 + 0.5,
      hide: T_EXCITING + 0.7,
      press: T_EXCITING,
    });
    // The riser: the frame dims into 04.1's dark.
    st.set("#riser", fade(span(t, T_EXCITING + 0.25, END, EASE.move)));
    return st;
  };

  return {
    id: "platform",
    shots: ["03.3", "03.4"],
    palette: "aurixa",
    html,
    measure: {
      entries: ["#W-0", ".cside .grp a", true],
      groups: ["#W-0", ".cside .grp", true],
      chips: ["body", ".pf-chip", true],
    },
    state,
    bake: CC.tileBakes,
  };
}

module.exports = platformScene;
