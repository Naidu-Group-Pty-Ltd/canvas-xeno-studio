// Reel 3, shots 09.1 to 09.3: and that's just the beginning; property intelligence, financial analysis, professional
// reporting, client communication and partner collaboration are all connected, with the Aurixa Agent in your arsenal
// supporting you wherever your business takes you.
//
// 09.1, the breakdown: the cut lands close on the Command Centre's Overview (../cc.cjs: Reel 1's Overview plate, its
// sidebar reaching the Portals group) and the camera pulls back to the whole Command Centre standing on the site's
// floor, quiet, and holds: the longest hold in the film, with only a slow drift and one pass of light across the glass.
// 09.2: on "Property" the camera swings in on the sidebar, at a size its entries read, and the page beyond it dims. A
// tile comes in on each part as it is named (a crop of a page the product draws, new to this reel) and, as the next
// one arrives, docks into its own entry, which lights: the Property Marketplace, Cash Flow Analysis (its 10-year cash
// flow, under the illustrative label while it shows), Generated Reports, the Message Hub, and on "partner
// collaboration" the four portals as four cards, each into its own entry in the Portals group. The camera moves down
// the sidebar from group to group. On "connected" every lit entry flares together, a thread of light runs down the
// sidebar through them, and the camera pulls back to the whole Command Centre.
// 09.3: the camera goes in to the launcher in the window's bottom right corner (the plate's floating Aurixa), the page
// stepping back around it; the pointer comes to it ("Ask Aurixa", its own tooltip) and presses it on "Agent", and stays
// where it pressed as the camera leaves. The panel headed Aurixa opens at the page's right, as the product floats it. On
// "arsenal" it is asking first: "Needs your go-ahead", the request it was given and its own question, then its card,
// "Give a finance partner a client", Jamie Chen and Jordan Ellis. On "supporting" the professional presses Approve; the
// camera moves down to the act's own words ("Assigned Jamie Chen with default permissions…") with "Aurixa may make
// mistakes" in shot under them, a light crossing the panel on "takes".
// The card's partner line carries the product's empty brackets where the record holds no email for Jamie; they are
// covered with the card's own ground, so the line reads "Partner: Jamie Chen".
const M = require("../motion.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const CC = require("../cc.cjs");
const K3 = require("../kit3.cjs");

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
  whole,
  between,
  placeWindow,
  pointerHtml,
  pointer,
  captionHtml,
  caption,
} = M;

// ------------------------------------------------------------------ the clock
const T91 = shotOf("09.1").in;
const T_HOLD = beat("09.1", 1);
const B = [0, 1, 2, 3, 4, 5].map((i) => beat("09.2", i));
const T_CONNECTED = B[5];
const T93 = shotOf("09.3").in;
const [T_AGENT, T_ARSENAL, T_SUPPORT, T_TAKES] = [0, 1, 2, 3].map((i) => beat("09.3", i));
const END = shotOf("09.3").out;

/** Each tile comes in on its phrase's first word (the captions' own starts), a moment ahead, and settles by its beat. */
const ARRIVE = [96.92, 98.19, 99.55, 100.99, 102.35].map((t) => t - 0.06);
const ARRIVE_TIME = 0.5;
/** A tile docks as the next one arrives; the four portal cards one after another once their tile has shown. */
const DOCK_TIME = 0.6;
const DOCK = [ARRIVE[1] - 0.12, ARRIVE[2] - 0.12, ARRIVE[3] - 0.12, ARRIVE[4] - 0.1];
const CARDS_DOCK = [0, 1, 2, 3].map((i) => 103.42 + i * 0.12);
/** The illustrative label shows while the 10-year cash flow is on screen. */
const LABEL = [ARRIVE[1], DOCK[1] + DOCK_TIME];

// ------------------------------------------------------------------ the camera
const PAGE = CC.CSS;
/**
 * A framing: `zoom` frame px per page px, the page's point `focus` brought to the frame's point `at`, in a window whose
 * rect is `rect`. The page is never shown past its own edges (KIT.shotGeometry), so a framing near the page's top or
 * foot takes a rect whose edge is in the bands at the frame's top and foot.
 */
const frame = (zoom, focus, at, rect) => ({ rect, zoom, focus, at });
/** The whole Command Centre, standing in the action zone: the page down to Help & Usage. */
const ZW = Math.min(1000 / PAGE[0], 920 / CC.SHOWN_H);
const WHOLE = frame(
  ZW,
  [PAGE[0] / 2, CC.SHOWN_H / 2],
  [540, 830],
  [
    540 - (PAGE[0] * ZW) / 2 - M.PAD,
    830 - (CC.SHOWN_H * ZW) / 2 - M.PAD,
    PAGE[0] * ZW + 2 * M.PAD,
    CC.SHOWN_H * ZW + 2 * M.PAD,
  ],
);
/** 09.1's first framing: close on the Overview's own heading, the window's top edge high in the frame. */
const OPEN = frame(1.6, [590, 170], [540, 700], [-40, 300, 1160, 1700]);
/**
 * The sidebar at a size its entries read (12.5 px type at 1.8 is 22.5 px), each stop a group the tiles dock into. The
 * window's left edge is in shot at x 20; its top and foot are in the bands.
 */
const ZS = 1.8;
const SIDE = [20, 120, 1100, 1240];
const sideAt = (y) => frame(ZS, [120, y], [250, 720], SIDE);
const STOP = {
  main: sideAt(300), // Main Dashboard: the Property Marketplace
  reports: sideAt(645), // Reports & Analysis: Generated Reports, Cash Flow Analysis
  crm: sideAt(950), // Client & CRM: the Message Hub
  portals: sideAt(1238), // Portals: the four portals
};
/** 09.3: the launcher, the panel's head, its card, and the act's own words (the panel at CC.PANEL). */
const [PX, PY] = CC.PANEL;
/** The panel's framings end the window just short of the frame's right edge, so the panel sits in the frame's middle. */
const LOW = [-40, 120, 1100, 1240];
const panelAt = (zoom, y, rect = LOW) => frame(zoom, [PX + 224, PY + y], [540, 765], rect);
/**
 * The launcher in the corner of the window's view (the page down to CC.SHOWN_H, as the whole Command Centre shows it):
 * that corner is the window's own, in shot, its foot clear of the band at the frame's foot.
 */
const LAUNCH_RECT = [-40, 60, 1000, 1040];
const LAUNCH = frame(
  1.8,
  [PAGE[0], CC.SHOWN_H],
  [LAUNCH_RECT[0] + LAUNCH_RECT[2] - M.PAD, LAUNCH_RECT[1] + LAUNCH_RECT[3] - M.PAD],
  LAUNCH_RECT,
);
const PANEL_HEAD = panelAt(2.15, 188, [-40, 280, 1100, 1080]);
const CARD = panelAt(2.2, 494);
const RESULT = panelAt(2.3, 818);

/** Each move: from one framing to the next over [a, b] on ease-move. */
const MOVES = [
  [OPEN, WHOLE, T91, T_HOLD + 0.02],
  [WHOLE, STOP.main, 96.68, 97.3],
  [STOP.main, STOP.reports, 98.55, 99.22],
  [STOP.reports, STOP.crm, 101.5, 102.16],
  [STOP.crm, STOP.portals, 102.98, 103.56],
  [STOP.portals, WHOLE, T_CONNECTED + 0.06, T93 + 0.12],
  [WHOLE, LAUNCH, T93 + 0.12, T93 + 0.9],
  [LAUNCH, PANEL_HEAD, T_AGENT + 0.04, T_AGENT + 0.64],
  [PANEL_HEAD, CARD, T_ARSENAL + 0.1, T_ARSENAL + 0.52],
  [CARD, RESULT, T_SUPPORT + 0.16, T_SUPPORT + 0.74],
];
/** The camera at t: the move under way (or the last one made), with a slow drift through 09.1's hold. */
function framingAt(t) {
  let f = MOVES[0][0];
  for (const [a, b, t0, t1] of MOVES) {
    if (t < t0) break;
    f = t >= t1 ? b : between(PAGE, a, b, span(t, t0, t1, EASE.move));
  }
  // The hold: one slow push, barely there.
  const drift = span(t, T_HOLD, MOVES[1][2] + 0.02, EASE.linear);
  if (drift > 0 && drift < 1) return { ...f, zoom: f.zoom * (1 + 0.035 * drift) };
  return f;
}

// ------------------------------------------------------------------ the page
const css = `
.pf-tile { position:absolute; left:0; top:0; transform-origin:50% 50%; border-radius:30px; box-shadow:0 40px 90px rgba(0,0,0,.62); }
.pf-tile img { display:block; width:100%; height:100%; border-radius:30px; }
.pf-card { position:absolute; left:0; top:0; transform-origin:50% 50%; border-radius:22px; box-shadow:0 26px 60px rgba(0,0,0,.6); }
.pf-card img { display:block; width:100%; height:100%; border-radius:22px; }
.pf-band { position:absolute; left:0; right:0; pointer-events:none; }
.pf-band.pf-top { top:0; height:380px; background:linear-gradient(180deg, #040B16 0%, #040B16 64%, rgba(4,11,22,0) 100%); }
.pf-band.pf-bot { top:1110px; bottom:0; background:linear-gradient(180deg, rgba(4,11,22,0) 0%, rgba(4,11,22,.9) 11%, #040B16 22%, #040B16 100%); }
.pf-glint { position:absolute; pointer-events:none; mix-blend-mode:screen; border-radius:26px;
  background:linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,.08) 47%, rgba(245,209,122,.10) 52%, rgba(255,255,255,0) 61%) no-repeat;
  background-size:300% 100%; }
.pf-mask { position:absolute; background:#141417; }
`;

/** The portal cards' places in their tile (2 x 2 under its head). */
const cardSlot = (i) => [
  26 + (i % 2) * (CC.CARD_W + 14) + CC.CARD_W / 2,
  84 + Math.floor(i / 2) * (CC.portalCards[0].size[1] + 14) + CC.portalCards[0].size[1] / 2,
];
/** Where a tile stands while it is the one on show (its centre). */
const SHOW = [720, 770];

function platformScene() {
  // The window: the Command Centre's one page. The panel's partner line carries the product's empty brackets (no
  // email is on Jamie's record): each state's are covered with the card's own ground.
  const MASKS = [
    [203, 375.6],
    [203, 328.6],
  ];
  let win = windowHtml("W", [CC.PLATE], 5);
  MASKS.forEach(([x, y], n) => {
    const tag = `<img id="agp-${n}"`;
    const i = win.indexOf(tag);
    if (i < 0) throw new Error(`platform: the panel's state ${n} was not found`);
    const close = win.indexOf(">", i) + 1;
    win = `${win.slice(0, close)}<i class="pf-mask" id="agm-${n}" style="left:${x}px;top:${y}px;width:10px;height:15px${n ? ";visibility:hidden;opacity:0" : ""}"></i>${win.slice(close)}`;
  });

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}${K3.labelCss}${K3.demoCss}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      win,
      `<div class="pf-glint" id="glint" style="z-index:6;visibility:hidden"></div>`,
      `<div class="fk-layer" id="bands" style="z-index:7;visibility:hidden"><div class="pf-band pf-top"></div><div class="pf-band pf-bot"></div></div>`,
      CC.tiles
        .map(
          (t) =>
            `<div class="pf-tile" id="tile-${t.id}" style="z-index:9;width:${t.size[0]}px;height:${t.size[1]}px;visibility:hidden"><img src="https://reel-bake.local/${t.file}" alt=""></div>`,
        )
        .join(""),
      `<div class="pf-tile" id="phead" style="z-index:9;width:${CC.PARTNER_HEAD.size[0]}px;height:${CC.PARTNER_HEAD.size[1]}px;visibility:hidden"><img src="https://reel-bake.local/${CC.PARTNER_HEAD.file}" alt=""></div>`,
      CC.portalCards
        .map(
          (c) =>
            `<div class="pf-card" id="pc-${c.id}" style="z-index:10;width:${c.size[0]}px;height:${c.size[1]}px;visibility:hidden"><img src="https://reel-bake.local/${c.file}" alt=""></div>`,
        )
        .join(""),
      K3.labelHtml(),
      K3.demoHtml(),
      `<div class="fk-layer" style="z-index:30">${pointerHtml()}</div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    const framing = framingAt(t);
    const g = placeWindow(st, "W", PAGE, framing, [1]);
    const at = (p) => g.map(p);

    // The floor and the window's shadow while the window stands whole on it.
    const stand =
      1 -
      span(t, MOVES[1][2], MOVES[1][2] + 0.35, EASE.move) +
      span(t, MOVES[5][2] + 0.2, MOVES[5][3], EASE.move) -
      span(t, MOVES[6][2], MOVES[6][2] + 0.4, EASE.move);
    const standing = Math.max(
      0,
      Math.min(1, t < MOVES[0][3] ? span(t, T91, MOVES[0][3], EASE.move) : stand),
    );
    S.floorState(st, "floor", { horizon: 700, flow: t * 22, opacity: standing });
    S.shadowState(st, "W-shadow", {
      cx: framing.rect[0] + framing.rect[2] / 2,
      foot: framing.rect[1] + framing.rect[3],
      width: framing.rect[2],
      opacity: standing * 0.9,
    });
    // The bands at the frame's top and foot while the camera is inside the page.
    const inside = 1 - standing;
    st.set("#bands", fade(inside));
    // One pass of light across the glass, in the hold.
    const gl = span(t, T_HOLD + 0.55, T_HOLD + 2.05, EASE.move);
    st.set("#glint", {
      left: px(g.rect[0] + 6),
      top: px(g.rect[1] + 6),
      width: px(g.rect[2] - 12),
      height: px(g.rect[3] - 12),
      "background-position": `${r3(130 - gl * 160)}% 0`,
      ...fade(gl > 0 && gl < 1 ? standing : 0),
    });

    // 09.2: the page beyond the sidebar steps back while the tiles come forward, and comes back up once all is connected.
    const dim =
      span(t, MOVES[1][2] + 0.1, MOVES[1][3], EASE.move) *
      (1 - span(t, T_CONNECTED + 0.05, T_CONNECTED + 0.7, EASE.move));
    st.set("#W-0 .cmain", { opacity: r3(1 - 0.68 * dim) });
    // 09.3: the page steps back around the launcher as the camera goes in to it, and stays back behind the panel.
    const back = r3(1 - 0.62 * span(t, MOVES[6][2] + 0.1, MOVES[6][3], EASE.move));
    st.set("#W-0 .qpage", { opacity: back });
    st.set("#W-0 .ctop", { opacity: back });

    /** An entry's centre in the frame and its width there. */
    const entryAt = (i) => {
      const [x, y, w, h] = m.entries[i];
      return { at: at([x + w / 2, y + h / 2]), w: w * g.zoom };
    };
    const landed = new Array(CC.ENTRIES.length).fill(Infinity);
    /** A tile flying from where it shows to its entry, along a bow: its centre and scale, at `dock` (0 to 1). */
    const flight = (from, k0, target, w, dock) => {
      const mid = lerp2(from, target.at, 0.5);
      const ctrl = [mid[0] + 40, mid[1] - 150];
      const q = (u) => [
        (1 - u) ** 2 * from[0] + 2 * (1 - u) * u * ctrl[0] + u * u * target.at[0],
        (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * ctrl[1] + u * u * target.at[1],
      ];
      return { c: q(dock), k: lerp(k0, target.w / w, dock) };
    };

    // The tiles: in on their phrase, docking as the next arrives.
    CC.tiles.forEach((tile, i) => {
      const a = ARRIVE[i];
      const d = DOCK[i];
      const arrive = span(t, a, a + ARRIVE_TIME, EASE.settle);
      const dock = span(t, d, d + DOCK_TIME, EASE.move);
      const [w, h] = tile.size;
      const target = entryAt(tile.dockAt);
      const home = [SHOW[0] + lerp(420, 0, arrive), SHOW[1] + lerp(40, 0, arrive)];
      const { c, k } = flight(home, lerp(0.92, 1, arrive), target, w, dock);
      const opacity =
        span(t, a, a + 0.18, EASE.linear) *
        (1 - span(t, d + DOCK_TIME * 0.72, d + DOCK_TIME, EASE.linear));
      st.set(`#tile-${tile.id}`, {
        transform: `translate(${px(c[0] - w / 2)}, ${px(c[1] - h / 2)}) perspective(1600px) rotateY(${r3(lerp(-22, 0, arrive))}deg) scale(${r3(k)})`,
        ...fade(opacity),
      });
      landed[tile.dockAt] = Math.min(landed[tile.dockAt], d + DOCK_TIME * 0.86);
    });

    // Partner collaboration: the tile's head with the four portals under it, each docking into its own entry.
    {
      const a = ARRIVE[4];
      const arrive = span(t, a, a + ARRIVE_TIME, EASE.settle);
      const [w, h] = CC.PARTNER_HEAD.size;
      const c = [SHOW[0] + lerp(420, 0, arrive), SHOW[1] + lerp(40, 0, arrive)];
      const left = c[0] - w / 2;
      const top = c[1] - h / 2;
      const turn = `perspective(1600px) rotateY(${r3(lerp(-22, 0, arrive))}deg)`;
      const headOut = span(t, CARDS_DOCK[0] - 0.05, CARDS_DOCK[0] + 0.3, EASE.linear);
      st.set("#phead", {
        transform: `translate(${px(left)}, ${px(top)}) ${turn} scale(${r3(lerp(0.92, 1, arrive))})`,
        ...fade(span(t, a, a + 0.18, EASE.linear) * (1 - headOut)),
      });
      CC.portalCards.forEach((card, i) => {
        const [cw, ch] = card.size;
        const slot = cardSlot(i);
        const home = [left + slot[0], top + slot[1]];
        const d = CARDS_DOCK[i];
        const dock = span(t, d, d + DOCK_TIME, EASE.move);
        const { c: cc, k } = flight(home, lerp(0.92, 1, arrive), entryAt(card.dockAt), cw, dock);
        const opacity =
          span(t, a + 0.04 * i, a + 0.2 + 0.04 * i, EASE.linear) *
          (1 - span(t, d + DOCK_TIME * 0.72, d + DOCK_TIME, EASE.linear));
        st.set(`#pc-${card.id}`, {
          transform: `translate(${px(cc[0] - cw / 2)}, ${px(cc[1] - ch / 2)}) ${dock > 0 ? "" : turn} scale(${r3(k)})`,
          ...fade(opacity),
        });
        landed[card.dockAt] = Math.min(landed[card.dockAt], d + DOCK_TIME * 0.86);
      });
    }

    // The lit entries: lit as their part lands, all flaring together on "connected".
    landed.forEach((when, i) => {
      if (!Number.isFinite(when)) return;
      const v = span(t, when, when + 0.15, EASE.linear);
      if (v <= 0) return;
      const own = 1 + 1.5 * Math.exp(-Math.max(0, t - when) / 0.3);
      const together =
        1 +
        1.2 *
          span(t, T_CONNECTED - 0.02, T_CONNECTED + 0.07, EASE.linear) *
          Math.exp(-Math.max(0, t - T_CONNECTED - 0.07) / 0.45);
      CC.lightEntry(st, i, v, Math.max(own, together));
    });
    // The thread of light: down the sidebar through every lit entry, a traveller running it once, on "connected".
    {
      const lit = m.entries.filter((_, i) => Number.isFinite(landed[i]));
      const y0 = Math.min(...lit.map((r) => r[1])) + 4;
      const y1 = Math.max(...lit.map((r) => r[1] + r[3])) - 4;
      const x = 15;
      const drawn = span(t, T_CONNECTED, T_CONNECTED + 0.62, EASE.move);
      const away = span(t, T93 + 0.3, T93 + 0.9, EASE.linear);
      st.set("#litbar", {
        transform: `translate(${px(x)}, ${px(y0)}) scaleY(${r3(drawn)})`,
        height: px(y1 - y0),
        ...fade(drawn > 0 ? 1 - away : 0),
      });
      const run = span(t, T_CONNECTED + 0.08, T_CONNECTED + 1.05, EASE.move);
      st.set("#litdot", {
        transform: `translate(${px(x + 1.5)}, ${px(lerp(y0, y1, run))})`,
        ...fade(run > 0 && run < 1 ? Math.min(1, run * 8, (1 - run) * 8) : 0),
      });
    }
    K3.labelState(st, t, { a: LABEL[0], b: LABEL[1] });
    // DEMO WORKSPACE: the page's own top bar carries it; once that bar is out of view (or under the band at the frame's
    // top), the window carries it in its top-right corner, kept inside the frame.
    {
      const [dx, dy, dw, dh] = m.demo;
      // How much of the page's own label is in view at t' (once the agent's panel is open over it, it is under the
      // panel), averaged over a quarter of a second about t so the window's label crosses rather than snaps.
      const ownAt = (u) => {
        const f = framingAt(u);
        const gu = M.KIT.shotGeometry({
          css: PAGE,
          zoom: f.zoom,
          focus: f.focus,
          at: f.at,
          rect: f.rect,
        });
        const [cx, cy] = gu.map([dx + dw / 2, dy + dh / 2]);
        const c = (v) => Math.min(1, Math.max(0, v));
        return (
          c((cy - 300) / 50) *
          c((1150 - cy) / 50) *
          c((cx - 20) / 60) *
          c((1060 - cx) / 60) *
          (1 - span(u, T_AGENT + 0.05, T_AGENT + 0.3, EASE.linear))
        );
      };
      const own = [-0.12, -0.06, 0, 0.06, 0.12].reduce((sum, d) => sum + ownAt(t + d), 0) / 5;
      K3.demoState(
        st,
        t,
        { ...g, oy: -1e6 },
        {
          opacity: 1 - own,
          xf: ([x, y]) => [Math.min(x, 1046), Math.max(y, 270)],
        },
      );
    }

    // 09.3: the launcher, its tooltip and the press; the panel opening; Approve; the act's own words.
    const fab = m.fab;
    const fabC = [fab[0] + fab[2] / 2, fab[1] + fab[3] * 0.56];
    const hover =
      span(t, T_AGENT - 0.28, T_AGENT - 0.14, EASE.linear) *
      (1 - span(t, T_AGENT, T_AGENT + 0.1, EASE.linear));
    st.set("#W-0 #ltip", fade(hover));
    const since = t - T_AGENT;
    const dip = since >= 0 && since < 0.22 ? 1 - 0.08 * Math.sin((Math.PI * since) / 0.22) : 1;
    st.set("#W-0 #lfab", {
      transform: `scale(${r3(dip)})`,
      "transform-origin": "50% 60%",
      opacity: r3(1 - span(t, T_AGENT + 0.12, T_AGENT + 0.32, EASE.linear)),
    });
    const open = span(t, T_AGENT + 0.02, T_AGENT + 0.38, EASE.settle);
    st.set("#W-0 #agp", {
      transform: `translateX(${px(lerp(46, 0, open))}) scale(${r3(lerp(0.975, 1, open))})`,
      "transform-origin": "100% 0",
      ...fade(open),
    });
    // The act done: the panel's next state, crossed in once the camera has passed its card.
    const done = span(t, MOVES[9][3] - 0.2, MOVES[9][3] - 0.02, EASE.linear);
    st.set("#W-0 #agp-1", fade(done));
    st.set("#W-0 #agm-1", fade(done));
    const sweep = span(t, T_TAKES - 0.05, T_TAKES + 0.95, EASE.move);
    st.set("#W-0 #agp-sheen", {
      "background-position": `${r3(130 - sweep * 160)}% 0`,
      ...fade(sweep > 0 && sweep < 1 ? 1 : 0),
    });
    // The pointer: to the launcher and its press on "Agent"; then to Approve and its press on "supporting".
    const approve = at([PX + 62 + 86, PY + 637 + 17]);
    if (t < T_AGENT + 0.5) {
      // Once it has pressed, it stays where it pressed while the camera leaves for the panel, and is gone.
      const pressed = M.KIT.shotGeometry({ css: PAGE, ...framingAt(T_AGENT) });
      const tip = t < T_AGENT ? at(fabC) : pressed.map(fabC);
      pointer(st, t, {
        from: [tip[0] + 260, tip[1] + 330],
        to: [tip[0] - 6, tip[1] - 4],
        a: T93 + 0.3,
        b: T_AGENT - 0.12,
        show: T93 + 0.25,
        hide: T_AGENT + 0.08,
        press: T_AGENT,
      });
    } else
      pointer(st, t, {
        from: [approve[0] + 360, approve[1] + 360],
        to: [approve[0] - 20, approve[1] + 4],
        a: T_SUPPORT - 0.48,
        b: T_SUPPORT - 0.08,
        show: T_SUPPORT - 0.5,
        hide: T_SUPPORT + 0.3,
        press: T_SUPPORT,
      });
    return st;
  };

  return {
    id: "platform",
    shots: ["09.1", "09.2", "09.3"],
    palette: "aurixa",
    html,
    measure: {
      entries: ["#W-0", ".cside .grp a", true],
      fab: ["#W-0", "#lfab", false],
      demo: ["#W-0", ".cdemo", false],
    },
    state,
    bake: CC.tileBakes,
  };
}

module.exports = platformScene;
