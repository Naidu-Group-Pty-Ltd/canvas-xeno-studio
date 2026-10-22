// Reel 1, shot 14.1: Fourteen days. Your business. Your experience. Your decision. The wall of the film's own
// screens (G-WALL, dimmed and softened) drifts one way across the shot and on into 15.1, never reversing; each
// phrase is set alone over it in the captions' face at display size, its key word in the gold italic, and lands
// word by word on the spoken words (voiceover-words.json), the gold rule drawing out under it as its gold word
// lands and the light crossing that word once; a phrase leaves just before the next arrives.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const { F, beat, shotOf, EASE, span, r3, px, State, fade, captionHtml, caption } = M;

const WORDS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../../docs/brands/aurixa-reel-1/system-edition/voiceover-words.json"),
    "utf8",
  ),
).words;

/** The wall's drift: one slow lateral move from 14.1's first frame to the end of 15.1, at an even pace. */
const DRIFT = { from: 94.4, to: 106.031, x: [64, -64] };
const driftAt = (t) =>
  DRIFT.x[0] +
  (DRIFT.x[1] - DRIFT.x[0]) * Math.min(1, Math.max(0, (t - DRIFT.from) / (DRIFT.to - DRIFT.from)));
/**
 * G-WALL as the stills draw it (frames.cjs A14a): its screens under the 28 px blur, baked once to a picture
 * (render.cjs bakes it, wider than the frame by the drift and a margin), which drifts; then its veil.
 */
const MARGIN = 96;
const [wallTiles, wallVeil] = F.STILLS.A14a.draw();
const WALL_BAKE = (() => {
  const html = `<div style="position:absolute;left:${MARGIN}px;top:0;width:1080px;height:1920px">${wallTiles}</div>`;
  const hash = require("crypto").createHash("sha256").update(html).digest("hex").slice(0, 12);
  return { name: `wall-${hash}.png`, width: 1080 + 2 * MARGIN, height: 1920, html };
})();
const wallHtml = (id = "wall") =>
  `<div id="${id}" class="fk-layer" style="z-index:1"><img src="https://reel-bake.local/${WALL_BAKE.name}" alt="" style="position:absolute;left:${-MARGIN}px;top:0;width:${WALL_BAKE.width}px;height:1920px"></div>` +
  `<div class="fk-layer" style="z-index:1">${wallVeil}</div>`;

// The phrases: [their words as set, the index of the gold word, the voiceover's words they are spoken as].
const PHRASES = [
  { text: ["Fourteen", "days."], em: 0, heard: ["14", "days"] },
  { text: ["Your", "business."], em: 1, heard: ["Your", "business"] },
  { text: ["Your", "experience."], em: 1, heard: ["Your", "experience"] },
  { text: ["Your", "decision."], em: 1, heard: ["Your", "decision"] },
];
const ENTER = 0.5;

function wallScene() {
  const shot = shotOf("14.1");
  // Each phrase's words on their spoken times: its beat opens the search, the measured word is its time.
  const phrases = PHRASES.map((p, i) => {
    const from = beat("14.1", i + 1) - 0.2;
    let k = WORDS.findIndex((w) => w.start >= from && w.text === p.heard[0]);
    if (k < 0) throw new Error(`14.1: no spoken "${p.heard[0]}" after ${from}`);
    const at = p.text.map((_, j) => Math.max(beat("14.1", i + 1), WORDS[k + j].start - 0.08));
    return { ...p, at };
  });
  phrases.forEach((p, i) => {
    const next = phrases[i + 1];
    p.leave = next ? next.at[0] - 0.28 : shot.out + 1; // the last holds through the cut
  });

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
  `;
  const html = () =>
    [
      `<style>${css}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      wallHtml(),
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
          // The light crosses the gold word once, as it lands.
          const sweep = span(t, a + ENTER * 0.55, a + ENTER * 0.55 + 1.0, EASE.move);
          props["background-size"] = "70% 100%, 100% 100%";
          // A band 70% of the word wide moves by 30% of the word per 100%: from -240% (wholly left of the
          // word) to 340% (wholly right).
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

  return { id: "wall", shots: ["14.1"], palette: "aurixa", html, state, bake: () => [WALL_BAKE] };
}

module.exports = wallScene;
module.exports.wallHtml = wallHtml;
module.exports.driftAt = driftAt;
module.exports.WALL_BAKE = WALL_BAKE;
