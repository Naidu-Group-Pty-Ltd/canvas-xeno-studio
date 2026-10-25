// Reel 3, shot 10.1 (G-MEANS): this means less administration, faster answers, smarter collaboration, more
// opportunities to deliver results. On the track's stop, its bass hit, a pulse of light goes out from the frame's
// middle and THIS MEANS sets at the head of the frame on its own words. Then the four phrases arrive one to a row, each
// in the captions' face at display size with its key word in the gold italic, landing word by word on the spoken words
// (voiceover-words.json) with the gold rule drawing under it; beside each, a small callback to a screen already seen,
// in its glass with the DEMO WORKSPACE bar: the fact find's import (04.1), the capacity figure (05.2), the Finance
// Portal's assessment (07.4) and the Snapshot's capacity chart (06.4). A gold spine joins the rows as they land; each
// earlier row steps back as the next arrives. On "results" they all come up together and the keys build under them:
// light rising behind the rows and a glow gathering at the frame's heart into the biggest section (11.1).
// No captions: the phrases are the type. The capacity figure, the broker's assessment and the Snapshot are modelled,
// so the illustrative label is up from the first of them to the cut.
const fs = require("fs");
const path = require("path");
const M = require("../motion.cjs");
const PACE = require("../pacing.cjs");
const S = require("../../aurixa-reel-1/stage.cjs");
const K3 = require("../kit3.cjs");

const { shotOf, EASE, span, lerp, r3, px, State, fade, captionHtml, caption, F } = M;

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
 * The four phrases, each its words, its gold word (index), the words as spoken, and its callback: a screen already
 * seen (screens.json), the part of it shown [x, y, w, h] in its own units.
 */
const ROWS = [
  {
    text: ["Less", "administration"],
    em: 1,
    heard: ["less", "administration"],
    // The import's result and its counts, with the panel's own margin at its left; the counts run on under its foot.
    callback: { key: "clients-add-parsed-top", rect: [75, 636, 527, 202] },
  },
  {
    text: ["Faster", "answers"],
    em: 1,
    heard: ["faster", "answers"],
    // The figure and its badge, short of the tiles under them.
    callback: { key: "bc-card-result", rect: [196, 99, 368, 113] },
  },
  {
    text: ["Smarter", "collaboration"],
    em: 1,
    heard: ["smarter", "collaboration"],
    // The panel's head, its latest assessment and its maximum, with the panel's own margin at its left, short of the
    // badge at its right.
    callback: { key: "fp-bc-panel", rect: [10, 16, 492, 174] },
  },
  {
    text: ["More", "opportunities", "to", "deliver", "results"],
    em: 4,
    heard: ["more", "opportunities", "to", "deliver", "results"],
    // The Snapshot's capacity chart: the loan against its limits and the headroom written under it, short of the
    // chart's caption.
    callback: { key: "snap-p2", rect: [52, 403, 490, 96] },
  },
];

/** The rows (frame px): each row's middle, its phrase's left edge and width, and its card's left edge and width. */
const EYEBROW_Y = 330;
const ROW_Y = [495, 690, 885, 1080];
const PHRASE = { x: 84, w: 484 };
const CARD = { x: 600, w: 410 };
const BAR_H = 28;
const SPINE_X = 58;
const ENTER = 0.5;

const css = `
.mn-eye { position:absolute; left:0; right:0; top:${EYEBROW_Y}px; display:flex; justify-content:center; align-items:center; gap:22px;
  transform:translateY(-50%); font:700 32px/1 "Inconsolata", ui-monospace, monospace; letter-spacing:.3em; text-transform:uppercase; color:#e8edf5; }
.mn-eye .w { display:inline-block; visibility:hidden; }
.mn-eye .r { display:block; width:76px; height:2px; background:linear-gradient(90deg, rgba(215,179,95,0), #d7b35f); transform:scaleX(0); transform-origin:100% 50%; }
.mn-eye .r.b { background:linear-gradient(90deg, #d7b35f, rgba(215,179,95,0)); transform-origin:0 50%; }
.mn-ph { position:absolute; left:${PHRASE.x}px; width:${PHRASE.w}px; transform:translateY(-50%); }
.mn-ph .t { font:500 54px/1.12 "Aurixa Caption", "Playfair Display", serif; letter-spacing:-.016em; text-wrap:balance; }
.mn-ph .w { display:inline-block; visibility:hidden; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff 8%, #c6cedb 68%, #fff); padding:.08em .12em .16em; margin:-.08em -.12em -.16em; }
.mn-ph .w.em { font-style:italic; background-image:linear-gradient(105deg, rgba(255,247,222,0) 0%, rgba(255,247,222,.9) 50%, rgba(255,247,222,0) 100%),
  linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%);
  background-size:0 100%, 100% 100%; background-repeat:no-repeat; background-position:-9999px 0, 0 0; }
.mn-ph .ul { width:150px; height:3px; margin-top:16px; transform:scaleX(0); transform-origin:0 50%; visibility:hidden;
  background:linear-gradient(90deg, #c89b3c, #d7b35f 55%, rgba(215,179,95,0)); }
.mn-card { position:absolute; left:${CARD.x}px; width:${CARD.w}px; overflow:hidden; border-radius:18px; transform-origin:0 50%;
  background:#0b0c15; border:1.5px solid rgba(215,179,95,.42); box-shadow:0 26px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06); }
.mn-card .bar { position:absolute; left:0; right:0; top:0; height:${BAR_H}px; display:flex; align-items:center; gap:7px; padding:0 10px;
  background:linear-gradient(180deg, #121a30, #0d1426); border-bottom:1px solid rgba(255,255,255,.08); font-family:var(--reel-sans); }
.mn-card .bar .emb { width:16px; height:16px; flex:none; background:center/contain no-repeat; }
.mn-card .bar b { font-size:9px; font-weight:800; letter-spacing:.08em; color:#fff; }
.mn-card .bar .demo { margin-left:auto; font-size:8px; letter-spacing:.14em; font-weight:800; color:#D7B35F; border:1px solid rgba(215,179,95,.5);
  border-radius:999px; padding:3px 7px; }
.mn-card .crop { position:absolute; left:0; right:0; overflow:hidden; }
.mn-card .crop img { position:absolute; display:block; }
.mn-card .sheen { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; visibility:hidden;
  background:linear-gradient(105deg, rgba(255,240,205,0) 38%, rgba(255,240,205,.22) 50%, rgba(255,240,205,0) 62%) no-repeat; background-size:260% 100%; }
.mn-spine { position:absolute; left:${SPINE_X - 1}px; top:0; width:2px; transform-origin:50% 0; visibility:hidden;
  background:linear-gradient(180deg, rgba(215,179,95,0), #d7b35f 8%, #c89b3c 92%, rgba(200,155,60,0)); box-shadow:0 0 10px rgba(215,179,95,.55); }
.mn-node { position:absolute; left:${SPINE_X - 6}px; width:12px; height:12px; margin-top:-6px; border-radius:50%; background:#f5d17a; visibility:hidden;
  box-shadow:0 0 18px #d7b35f, 0 0 5px #fff3d6; }
.mn-warm { position:absolute; left:-200px; right:-200px; top:420px; height:1100px; pointer-events:none; mix-blend-mode:screen; visibility:hidden;
  background:radial-gradient(ellipse 50% 46% at 50% 62%, rgba(245,209,122,.30) 0%, rgba(200,155,60,.14) 38%, rgba(200,155,60,0) 70%); }
.mn-mote { position:absolute; left:0; top:0; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:50%; background:#f5d17a; visibility:hidden;
  box-shadow:0 0 12px #d7b35f; }
`;

/** Motes for the build: a fixed scatter (no randomness from run to run). */
const MOTES = Array.from({ length: 22 }, (_, i) => {
  const a = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  const b = Math.sin(i * 78.233 + 1.7) * 12345.6789;
  const u = a - Math.floor(a);
  const v = b - Math.floor(b);
  return {
    x: 90 + u * 900,
    y0: 1260 + v * 160,
    rise: 520 + v * 420,
    delay: u * 0.6,
    size: 0.6 + v * 0.9,
  };
});

function meansScene() {
  const shot = shotOf("10.1");
  const T0 = shot.in;
  const END = shot.out;
  /** A phrase's words on the voice: each word's time, a moment ahead of its start. */
  const spoken = (heard, from) => {
    const k = WORDS.findIndex((w) => w.start >= from && w.key === heard[0]);
    if (k < 0) throw new Error(`10.1: no spoken "${heard[0]}" after ${from}`);
    heard.forEach((h, j) => {
      if (WORDS[k + j].key !== h)
        throw new Error(`10.1: expected "${h}", heard "${WORDS[k + j].key}"`);
    });
    return heard.map((_, j) => Math.max(T0, WORDS[k + j].start - 0.06));
  };
  const EYE = spoken(["this", "means"], T0 - 0.3);
  // Each phrase's words, found from the shot's own start; each after the one before.
  const rows = ROWS.map((r, i) => ({ ...r, at: spoken(r.heard, T0 - 0.3), i }));
  rows.forEach((r, i) => {
    if (i && r.at[0] <= rows[i - 1].at[0]) throw new Error("10.1: the phrases are out of order");
  });
  const LAST = rows.at(-1);
  const RESULTS = LAST.at[LAST.em];
  /** All the rows come up together once the last word has landed, and the keys build to the cut. */
  const TOGETHER = RESULTS + 0.45;

  const cards = rows.map((r) => {
    const s = K3.screen(r.callback.key);
    const [x, y, w, h] = r.callback.rect;
    const z = CARD.w / w;
    return {
      src: s.src,
      img: [-x * z, -y * z, s.css[0] * z, s.css[1] * z],
      cropH: h * z,
      height: BAR_H + h * z,
    };
  });

  const html = () =>
    [
      S.stageCss(),
      `<style>${css}${K3.labelCss}</style>`,
      `<div id="ground" class="fk-layer" style="z-index:0"><div class="fk-field"></div><div class="fk-glow"></div></div>`,
      `<div class="fk-layer" style="z-index:1"><div class="mn-warm" id="warm"></div></div>`,
      `<div class="fk-layer" style="z-index:2">`,
      `<div class="st-bloom" id="hit-bloom" style="visibility:hidden"></div>`,
      `<div class="st-shock" id="hit-ring" style="visibility:hidden"></div>`,
      MOTES.map((_, i) => `<i class="mn-mote" id="mote-${i}"></i>`).join(""),
      `</div>`,
      `<div class="fk-layer" id="block" style="z-index:5;transform-origin:540px 760px">`,
      `<div class="mn-eye" id="eye"><i class="r" id="eye-l"></i><span class="w" id="eye-0">This</span><span class="w" id="eye-1">means</span><i class="r b" id="eye-r"></i></div>`,
      `<div class="mn-spine" id="spine"></div>`,
      rows
        .map((r, i) => `<i class="mn-node" id="node-${i}" style="top:${ROW_Y[i]}px"></i>`)
        .join(""),
      rows
        .map((r, i) => {
          const c = cards[i];
          const top = ROW_Y[i] - c.height / 2;
          const words = r.text
            .map(
              (w, j) => `<span class="w${j === r.em ? " em" : ""}" id="mp-${i}-${j}">${w}</span>`,
            )
            .join(" ");
          return (
            `<div class="mn-ph" id="mp-${i}" style="top:${ROW_Y[i]}px"><div class="t">${words}</div><div class="ul" id="mp-${i}-ul"></div></div>` +
            `<div class="mn-card" id="mc-${i}" style="top:${r3(top)}px;height:${r3(c.height)}px;visibility:hidden">` +
            `<div class="bar"><span class="emb" style="background-image:url('${F.EMBLEM}')"></span><b>AURIXA SYSTEMS</b><span class="demo">DEMO WORKSPACE</span></div>` +
            `<div class="crop" style="top:${BAR_H}px;height:${r3(c.cropH)}px"><img src="${c.src}" alt="" style="left:${r3(c.img[0])}px;top:${r3(c.img[1])}px;width:${r3(c.img[2])}px;height:${r3(c.img[3])}px"></div>` +
            `<i class="sheen" id="mc-${i}-sheen"></i></div>`
          );
        })
        .join(""),
      `</div>`,
      K3.labelHtml(),
      captionHtml(),
    ].join("");

  const state = (t, m) => {
    const st = new State();
    caption(st, t, m);
    // The stop's bass hit: a pulse of light from the frame's heart and a ring going out.
    const hit = t - T0;
    const ring = span(t, T0, T0 + 1.1, EASE.settle);
    const ringD = lerp(300, 2200, ring);
    st.set("#hit-ring", {
      left: px(540 - ringD / 2),
      top: px(760 - ringD / 2),
      width: px(ringD),
      height: px(ringD),
      ...fade(ring > 0 && ring < 1 ? 0.5 * (1 - ring) ** 1.5 : 0),
    });
    const bloom = hit >= 0 ? Math.exp(-hit / 0.22) : 0;
    const bloomD = 1300;
    st.set("#hit-bloom", {
      left: px(540 - bloomD / 2),
      top: px(760 - bloomD / 2),
      width: px(bloomD),
      height: px(bloomD),
      ...fade(0.2 * bloom),
    });
    // The whole block: one slow push through the shot, so it is never quite still.
    const push = span(t, T0, END, EASE.linear);
    st.set("#block", { transform: `scale(${r3(1 + 0.035 * push)})` });

    // THIS MEANS, on its words, its rules drawing out to either side.
    EYE.forEach((a, j) => {
      const u = span(t, a, a + 0.36, EASE.settle);
      st.set(`#eye-${j}`, {
        ...fade(u),
        transform: `translateY(${px((1 - u) * 14)})`,
        filter: u < 1 ? `blur(${r3((1 - u) * 6)}px)` : "none",
      });
    });
    const rules = span(t, EYE[1] + 0.1, EYE[1] + 0.7, EASE.move);
    st.set("#eye-l", { transform: `scaleX(${r3(rules)})` });
    st.set("#eye-r", { transform: `scaleX(${r3(rules)})` });

    // The rows: each lands on its words; the earlier ones step back as the next arrives; all come up on "results".
    const together = span(t, TOGETHER, TOGETHER + 0.5, EASE.move);
    rows.forEach((r, i) => {
      const a0 = r.at[0];
      const next = rows[i + 1];
      const back = next ? span(t, next.at[0] - 0.1, next.at[0] + 0.35, EASE.move) : 0;
      const level = lerp(1 - 0.55 * back, 1, together);
      // The card, from depth: a touch ahead of the first word.
      const ca = span(t, a0 - 0.14, a0 + 0.46, EASE.settle);
      st.set(`#mc-${i}`, {
        ...fade(ca * lerp(1, 0.62, 1 - level)),
        transform: `translateX(${px((1 - ca) * 70)}) perspective(1300px) rotateY(${r3(lerp(-28, -7, ca))}deg) scale(${r3(lerp(1.18, 1, ca))})`,
        filter:
          ca < 1
            ? `blur(${r3((1 - ca) * 8)}px)`
            : level < 0.999
              ? `saturate(${r3(lerp(0.55, 1, level))})`
              : "none",
      });
      const sheen = span(t, a0 + 0.3, a0 + 1.2, EASE.move);
      const sheen2 = span(t, TOGETHER + 0.1 + i * 0.09, TOGETHER + 0.85 + i * 0.09, EASE.move);
      const s = sheen > 0 && sheen < 1 ? sheen : sheen2;
      st.set(`#mc-${i}-sheen`, {
        "background-position": `${r3(130 - s * 160)}% 0`,
        ...fade(s > 0 && s < 1 ? 1 : 0),
      });
      // The phrase, word by word, rising into place; its gold word catches the light once.
      r.text.forEach((_, j) => {
        const a = r.at[j];
        const u = span(t, a, a + ENTER, EASE.settle);
        const o = span(t, a, a + ENTER * 0.6, EASE.settle) * level;
        const blur = (1 - u) * 10;
        const glow = "drop-shadow(0 2px 18px rgba(4,11,22,.7))";
        const props = {
          ...fade(o),
          transform: `translateY(${px((1 - u) * 26)})`,
          filter: blur > 0.05 ? `blur(${r3(blur)}px) ${glow}` : glow,
        };
        if (j === r.em) {
          const pass = span(t, a + ENTER * 0.5, a + ENTER * 0.5 + 0.95, EASE.move);
          // The second pass (all together) never starts before the word's own has finished.
          const from2 = Math.max(TOGETHER + 0.2 + i * 0.09, a + ENTER * 0.5 + 1.0);
          const pass2 = span(t, from2, from2 + 0.8, EASE.move);
          const p = pass > 0 && pass < 1 ? pass : pass2;
          props["background-size"] = "70% 100%, 100% 100%";
          props["background-position"] = `${r3(-240 + p * 580)}% 0, 0 0`;
        }
        st.set(`#mp-${i}-${j}`, props);
      });
      const gold = r.at[r.em] + ENTER * 0.35;
      const drawn = span(t, gold, gold + 0.55, EASE.move);
      st.set(`#mp-${i}-ul`, {
        transform: `scaleX(${r3(drawn)})`,
        ...fade(Math.min(1, drawn * 4) * level),
      });
      // The spine's node for this row lights as the row lands.
      const node = span(t, a0, a0 + 0.3, EASE.settle);
      st.set(`#node-${i}`, {
        ...fade(node * lerp(0.8, 1, level)),
        transform: `scale(${r3(lerp(0.4, 1, node) * (1 + 0.5 * Math.exp(-Math.max(0, t - a0) / 0.25)))})`,
      });
    });
    // The spine: from just above the first row down to each row as it lands.
    const reach = rows.reduce((y, r, i) => {
      const p = span(t, r.at[0] - 0.1, r.at[0] + 0.35, EASE.move);
      return p > 0 ? lerp(i ? ROW_Y[i - 1] : ROW_Y[0] - 70, ROW_Y[i], p) : y;
    }, ROW_Y[0] - 70);
    const spineTop = ROW_Y[0] - 70;
    const end = lerp(reach, ROW_Y.at(-1) + 70, span(t, TOGETHER, TOGETHER + 0.6, EASE.move));
    st.set("#spine", {
      transform: `translateY(${px(spineTop)})`,
      height: px(Math.max(0, end - spineTop)),
      ...fade(span(t, rows[0].at[0] - 0.1, rows[0].at[0] + 0.2, EASE.linear)),
    });

    // The keys building under it: warmth rising behind the rows, motes going up, gathering to the cut.
    const build = span(t, TOGETHER - 0.2, END, EASE.linear);
    st.set("#warm", {
      transform: `translateY(${px(lerp(240, 0, build))}) scale(${r3(lerp(0.85, 1.12, build * build))})`,
      ...fade(build > 0 ? 0.25 + 0.75 * build * build : 0),
    });
    MOTES.forEach((mo, i) => {
      const u = span(t, TOGETHER - 0.1 + mo.delay * 0.7, END + 0.3, EASE.linear);
      st.set(`#mote-${i}`, {
        transform: `translate(${px(mo.x)}, ${px(mo.y0 - mo.rise * u)}) scale(${r3(mo.size)})`,
        ...fade(u > 0 ? Math.sin(Math.PI * Math.min(1, u)) * 0.85 : 0),
      });
    });

    K3.labelState(st, t, { a: rows[1].at[0] - 0.1, b: END, outAtCut: true });
    return st;
  };

  return { id: "means", shots: ["10.1"], palette: "aurixa", html, state };
}

module.exports = meansScene;
