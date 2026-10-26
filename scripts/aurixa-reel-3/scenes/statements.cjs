// Reel 3, shot 13.1: Your business. Your experience. Your decision. Reel 1's statements (../../aurixa-reel-1/scenes/
// wall.cjs), as Reel 2 set them (../../aurixa-reel-2/scenes/statements.cjs): three here, as this voiceover has three,
// one to each of National Treasures' bass hits (bars 71 to 73, each on its "your"), over a wall of Reel 3's own screens
// (G-WALL: the Borrowing Capacity card and page, the scenarios, the Snapshot, the Finance Portal, the Client Portal,
// the questionnaire, the deal and the Aurixa Agent, under a softer blur and the brand's veil), drifting one way across the shot. Each phrase is set
// alone in the captions' face at display size, its key word in the gold italic, and lands word by word on the spoken
// words (voiceover-words.json), the gold rule drawing out under it as its gold word lands and the light crossing that
// word once; on each hit the wall breathes up a touch with the light. A phrase leaves just before the next arrives; the
// last holds into the closing card. No captions: the phrases are the type.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const PACE = require("../pacing.cjs");
const K3 = require("../kit3.cjs");

const { beat, shotOf, EASE, span, r3, px, State, fade, captionHtml, caption } = M;

const WORDS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../../docs/brands/aurixa-reel-3/voiceover-words.json"),
    "utf8",
  ),
).words.map((w) => ({
  ...w,
  key: w.text.toLowerCase().replace(/[^a-z0-9]/g, ""),
  start: PACE.word(w.start),
  end: PACE.word(w.end),
}));

/**
 * The wall's screens: the film's own, as the screens harness drew them, three to a row in Reel 1's G-WALL layout
 * (../../aurixa-reel-1/frames.cjs wall()), under its blur and veil. Only the product's dark screens and the Snapshot's
 * own dark covers: a cream page reads as a grey slab under the blur (Reel 2's finding), where the dark screens read as
 * Reel 1's wall does, points of the product's own light. `to` keeps a tall page to its top.
 */
const WALL = [
  { key: "clients-ws-bc-result" },
  { key: "fp-clients" },
  { key: "snap-p1" },
  { key: "bc-scen-head-carloan" },
  { key: "cp-reports" },
  { key: "bc-page-calc", to: 1500 },
  { key: "clients-add-parsed-top" },
  { key: "fp-profile-opened" },
  { key: "bc-scen-purchase" },
  { key: "clients-ws-deal-advisory-journey" },
  { key: "fp-bc-panel" },
  { key: "snap-p9" },
  { key: "clients-management" },
  { key: "clients-ws-finance" },
  { key: "agent-card-panel", to: 700 },
];
const TILE_W = 520;
/** Softer than Reel 1's 28 px, so the wall still reads as screens behind the type; nothing on it can be read. */
const WALL_BLUR = 14;
const MARGIN = 96;
const WALL_BAKE = (() => {
  const tiles = WALL.map((tile, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const at = `position:absolute;left:${col * 560 - 260 + (row % 2) * 180}px;top:${row * 340 - 40}px`;
    const s = K3.screen(tile.key);
    const h = Math.min(460, (TILE_W / s.css[0]) * Math.min(tile.to ?? Infinity, s.css[1]));
    return `<div style="${at};width:${TILE_W}px;height:${r3(h)}px;overflow:hidden;border-radius:18px;background:#0b0c15"><img src="${s.src}" alt="" style="width:${TILE_W}px;height:auto;display:block"></div>`;
  }).join("");
  const html = `<div style="position:absolute;left:${MARGIN}px;top:0;width:1080px;height:1920px"><div style="position:absolute;inset:-200px;transform:rotate(-8deg) scale(1.08);filter:blur(${WALL_BLUR}px);opacity:.95">${tiles}</div></div>`;
  const hash = require("crypto").createHash("sha256").update(html).digest("hex").slice(0, 12);
  return { name: `statements-wall-${hash}.png`, width: 1080 + 2 * MARGIN, height: 1920, html };
})();

const PHRASES = [
  { text: ["Your", "business."], em: 1, heard: ["your", "business"] },
  { text: ["Your", "experience."], em: 1, heard: ["your", "experience"] },
  { text: ["Your", "decision."], em: 1, heard: ["your", "decision"] },
];
const ENTER = 0.5;

function statementsScene() {
  const shot = shotOf("13.1");
  const DRIFT = { from: shot.in, to: shot.out, x: [56, -56] };
  const driftAt = (t) =>
    DRIFT.x[0] +
    (DRIFT.x[1] - DRIFT.x[0]) *
      Math.min(1, Math.max(0, (t - DRIFT.from) / (DRIFT.to - DRIFT.from)));
  const phrases = PHRASES.map((p, i) => {
    const from = beat("13.1", i) - 0.25;
    const k = WORDS.findIndex((w) => w.start >= from && w.key === p.heard[0]);
    if (k < 0) throw new Error(`13.1: no spoken "${p.heard[0]}" after ${from}`);
    p.heard.forEach((h, j) => {
      if (WORDS[k + j].key !== h)
        throw new Error(`13.1: expected "${h}", heard "${WORDS[k + j].text}"`);
    });
    const at = p.text.map((_, j) => Math.max(shot.in, WORDS[k + j].start - 0.08));
    return { ...p, at };
  });
  phrases.forEach((p, i) => {
    const next = phrases[i + 1];
    p.leave = next ? next.at[0] - 0.28 : shot.out + 1; // the last holds through the cut
  });
  // The bass hits (bars 71 to 73), each on its "your": the wall breathes up with each.
  const HITS = PACE.MUSIC?.bars?.statements ?? phrases.map((p) => p.at[0]);

  const css = `
  .wph { position:absolute; left:60px; right:60px; top:1052px; display:flex; flex-direction:column; align-items:center; }
  .wph .t { font:500 112px/1.16 "Aurixa Caption", "Playfair Display", serif; letter-spacing:-.02em; white-space:nowrap; }
  .wph .w { display:inline-block; visibility:hidden; color:transparent; -webkit-background-clip:text; background-clip:text;
    background-image:linear-gradient(180deg, #fff 8%, #c6cedb 68%, #fff); padding:.08em .12em .16em; margin:-.08em -.12em -.16em; }
  .wph .w.em { font-style:italic; background-image:linear-gradient(105deg, rgba(255,247,222,0) 0%, rgba(255,247,222,.9) 50%, rgba(255,247,222,0) 100%),
    linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%);
    background-size:0 100%, 100% 100%; background-repeat:no-repeat; background-position:-9999px 0, 0 0; }
  .wph .ul { width:240px; height:3px; margin-top:22px; transform:scaleX(0); visibility:hidden;
    background:linear-gradient(90deg, rgba(200,155,60,0), #c89b3c 20%, #d7b35f 50%, #c89b3c 80%, rgba(200,155,60,0)); }
  .st-hit { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen;
    background:radial-gradient(70% 45% at 50% 60%, rgba(245,209,122,.16), rgba(200,155,60,.05) 50%, rgba(10,25,47,0) 100%); }
  `;
  const html = () =>
    [
      `<style>${css}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div id="wall" class="fk-layer" style="z-index:1"><img src="https://reel-bake.local/${WALL_BAKE.name}" alt="" style="position:absolute;left:${-MARGIN}px;top:0;width:${WALL_BAKE.width}px;height:1920px"></div>`,
      `<div class="fk-layer" id="veil" style="z-index:1;background:var(--reel-ground);opacity:.24"></div>`,
      `<div class="st-hit" id="hit" style="z-index:2;visibility:hidden"></div>`,
      ...phrases.map(
        (p, i) =>
          `<div class="wph" id="ph-${i}" style="z-index:20"><div class="t">${p.text
            .map(
              (w, j) => `<span class="w${j === p.em ? " em" : ""}" id="ph-${i}-${j}">${w}</span>`,
            )
            .join(" ")}</div><div class="ul" id="ph-${i}-ul"></div></div>`,
      ),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    st.set("#wall", { transform: `translateX(${px(driftAt(t))})` });
    // Each bass hit: the wall's veil lifts a breath and a warm light swells behind the type, both decaying.
    const pulse = HITS.reduce((a, h) => a + (t >= h ? Math.exp(-(t - h) / 0.32) : 0), 0);
    st.set("#veil", { opacity: r3(0.24 - 0.08 * Math.min(1, pulse)) });
    st.set("#hit", fade(0.9 * Math.min(1, pulse)));
    phrases.forEach((p, i) => {
      const leaving = span(t, p.leave, p.leave + 0.24, EASE.move);
      p.text.forEach((_, j) => {
        const a = p.at[j];
        const u = span(t, a, a + ENTER, EASE.settle);
        const o = Math.min(span(t, a, a + ENTER * 0.6, EASE.settle), 1 - leaving);
        const blur = (1 - u) * 12 + leaving * 6;
        const glow = "drop-shadow(0 2px 22px rgba(4,11,22,.7))";
        const props = {
          ...fade(o),
          transform: `translateY(${px((1 - u) * 34 - leaving * 14)})`,
          filter: blur > 0.05 ? `blur(${r3(blur)}px) ${glow}` : glow,
        };
        if (j === p.em) {
          const sweep = span(t, a + ENTER * 0.55, a + ENTER * 0.55 + 1.0, EASE.move);
          props["background-size"] = "70% 100%, 100% 100%";
          props["background-position"] = `${r3(-240 + sweep * 580)}% 0, 0 0`;
        }
        st.set(`#ph-${i}-${j}`, props);
      });
      const gold = p.at[p.em] + ENTER * 0.4;
      const drawn = span(t, gold, gold + 0.6, EASE.move);
      st.set(`#ph-${i}-ul`, {
        transform: `scaleX(${r3(drawn)})`,
        ...fade(Math.min(1, drawn * 4) * (1 - leaving)),
      });
    });
    return st;
  };

  return {
    id: "statements",
    shots: ["13.1"],
    palette: "aurixa",
    html,
    state,
    bake: () => [WALL_BAKE],
  };
}

module.exports = statementsScene;
