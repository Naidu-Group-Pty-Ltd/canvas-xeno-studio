// Reel 2, shot 07.1: and that's just one part of Aurixa Systems. The Passport, from the ring of 06.2, flies back
// into the Command Centre, into its own AML/CTF Compliance entry (selected, as 03.4 left it), which flares as it
// lands. On "part" the camera pulls back out of the sidebar to the whole Command Centre: every part 03.3 docked
// still lit, the AML/CTF Compliance entry one among them.
const M = require("../motion.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const CC = require("../cc.cjs");
const K2 = require("../kit2.cjs");
const brand = require("./brand.cjs");

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
  whole,
  between,
  placeWindow,
  captionHtml,
  caption,
} = M;

const RECT_IN = [-40, -40, 1160, 2000];
const COVER_W = 220;
const COVER_H = (COVER_W * K2.LEAF[1]) / K2.LEAF[0];

const css = `
.pt-book { position:absolute; left:0; top:0; transform-origin:0 0; border-radius:8px; box-shadow:0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(215,179,95,.3); }
.pt-book img { display:block; width:100%; height:100%; border-radius:8px; }
`;

function partScene() {
  const s = shotOf("07.1");
  const [T0, TP] = [0, 1].map((i) => beat("07.1", i));
  const END = s.out;
  const cover = K2.screen("pp-par-cover").src;
  const AML = CC.entry("AML/CTF Compliance");
  const LAND = T0 + 0.62;

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}</style>`,
      `<div class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      S.floorHtml("floor", 1),
      S.shadowHtml("W-shadow", 2),
      windowHtml("W", ["R2-CC-b"], 5),
      `<div class="pt-book" id="book" style="z-index:8;width:${COVER_W}px;height:${r3(COVER_H)}px"><img src="${cover}" alt=""></div>`,
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The camera: in on the AML/CTF Compliance entry (as 03.4 left it), then out to the whole window on "part".
    const [ex, ey, ew, eh] = m.entries[AML];
    const near = { rect: RECT_IN, zoom: 2.4, focus: [ex + ew / 2, ey + eh / 2], at: [340, 780] };
    const far = brand.ccAt(Infinity).framing;
    const out = span(t, TP - 0.1, END - 0.1, EASE.move);
    const framing = between(CC.CSS, near, far, out);
    const g = placeWindow(st, "W", CC.CSS, framing, [1], {
      opacity: span(t, T0, T0 + 0.25, EASE.linear),
    });
    // Every docked part lit; the AML/CTF Compliance entry flares as the Passport lands in it.
    for (const label of CC.DOCKED) {
      const i = CC.entry(label);
      const flare = i === AML && t >= LAND ? 1 + 2.2 * Math.exp(-(t - LAND) / 0.35) : 1;
      CC.lightEntry(st, i, 1, flare, ["#W-0"]);
    }
    // The Passport: from the ring's centre, shrinking into the entry's icon.
    const fly = span(t, T0, LAND, EASE.move);
    const to = g.map([ex + 22, ey + eh / 2]);
    const from = [540, 720];
    const mid = lerp2(from, to, 0.5);
    const ctrl = [mid[0] + 80, mid[1] - 160];
    const q = (u) => [
      (1 - u) ** 2 * from[0] + 2 * (1 - u) * u * ctrl[0] + u * u * to[0],
      (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * ctrl[1] + u * u * to[1],
    ];
    const [bx, by] = q(fly);
    const w = zoomLerp(COVER_W, 30, fly);
    st.set("#book", {
      transform: `translate(${px(bx - w / 2)}, ${px(by - (w * COVER_H) / COVER_W / 2)}) scale(${r3(w / COVER_W)})`,
      ...fade(1 - span(t, LAND - 0.12, LAND, EASE.linear)),
    });
    // The floor comes up under the window as the camera pulls back, and its shadow falls on it.
    const floor = span(t, TP + 0.3, END, EASE.settle);
    S.floorState(st, "floor", { horizon: brand.HORIZON, flow: brand.flowAt(t), opacity: floor });
    S.shadowState(st, "W-shadow", {
      cx: framing.at[0],
      foot: framing.rect[1] + framing.rect[3],
      width: framing.rect[2],
      opacity: floor,
    });
    return st;
  };

  return {
    id: "part",
    shots: ["07.1"],
    palette: "aurixa",
    html,
    measure: { entries: ["#W-0", ".cside .grp a", true] },
    state,
  };
}

module.exports = partScene;
