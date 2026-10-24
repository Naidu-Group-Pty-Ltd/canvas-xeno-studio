// Reel 2's captions: Reel 1's (../aurixa-reel-1/captions.cjs), as the client approved them there, on Reel 2's words.
//  - the website's headline face, Playfair Display, in its silver headline gradient, at Medium;
//  - one phrase a line emphasised in its italic: silver before the brand arrives (01 and 02, the "before" palette),
//    gold once it has (from 03.1), where a gold hairline draws under it and the light crosses it once;
//  - a square panel behind them: before the brand, a white card of today's tools; after, the site's glass;
//  - each word rising into focus on its own spoken time (voiceover-words.json), on the brand's ease-settle.
// The lines and the phrase each leans on are the brief's (brief.py), as the script spells them; the times are the
// measured words', moved onto the film's clock by the pauses the film is paced with (./pacing.cjs).
const fs = require("fs");
const path = require("path");

const DOCS = path.join(__dirname, "../../docs/brands/aurixa-reel-2");
const PACE = require("./pacing.cjs");
const BRIEF = JSON.parse(fs.readFileSync(path.join(DOCS, "brief.json"), "utf8"));
const CAPTIONS = BRIEF.captions.map((c) => ({
  text: c.text,
  start: PACE.word(c.voice_start),
  end: PACE.word(c.voice_end),
}));
const MEASURED = JSON.parse(
  fs.readFileSync(path.join(DOCS, "voiceover-words.json"), "utf8"),
).words.map((w) => ({ ...w, start: PACE.word(w.start), end: PACE.word(w.end) }));

/** The phrase each line leans on (its words, as the script spells them). */
const EMPHASIS = Object.fromEntries(BRIEF.captions.map((c) => [c.text, c.emphasis]));
/** A line set as the site's eyebrow: none in Reel 2. */
const EYEBROW = new Set();

// ------------------------------------------------------------------ the words' times
/** A word as both spellings compare: lower case, no punctuation, the recogniser's variants mapped. */
const VARIANTS = { arixa: "aurixa", organized: "organised", authorized: "authorised" };
const norm = (w) => {
  const k = w
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'-]/g, "");
  return VARIANTS[k] ?? k;
};
/** Two words the recogniser heard apart that the script writes as one: "AML" "CTF", "better" "connected". */
const JOINED = [
  [["aml", "ctf"], "amlctf"],
  [["better", "connected"], "better-connected"],
];
/** The measured words with those pairs joined, as the script writes them. */
function measuredWords() {
  const out = [];
  for (let i = 0; i < MEASURED.length; i++) {
    const w = MEASURED[i];
    const next = MEASURED[i + 1];
    const pair = next && JOINED.find(([[a, b]]) => norm(w.text) === a && norm(next.text) === b);
    if (pair) {
      out.push({ key: pair[1], start: w.start, end: next.end });
      i++;
    } else out.push({ key: norm(w.text), start: w.start, end: w.end });
  }
  return out;
}

/** Each cue's words, with the time each is spoken (measured; one the recogniser missed is placed between). */
function timedCues() {
  const heard = measuredWords();
  let cursor = 0;
  const shotAt = (t) =>
    BRIEF.shots.find((s) => t >= s.in - 1e-6 && t < s.out) ?? BRIEF.shots.at(-1);
  return CAPTIONS.map((cue, ci) => {
    // An eyebrow's dash is drawn as its rules, not set.
    const tokens = cue.text
      .split(/\s+/)
      .filter((w) => w && !(EYEBROW.has(cue.text) && /^[\u2013\u2014-]$/.test(w)));
    const words = tokens.map((text) => ({ text, key: norm(text) }));
    for (const w of words) {
      if (!w.key) continue; // a dash
      // Look a few words ahead for it, never before the cue (the recogniser's times are rough at the edges).
      for (let j = cursor; j < Math.min(heard.length, cursor + 6); j++)
        if (heard[j].key === w.key && heard[j].start >= cue.start - 0.35) {
          w.at = heard[j].start;
          w.until = heard[j].end;
          cursor = j + 1;
          break;
        }
    }
    // A word nobody heard (or a dash) takes the time between its neighbours.
    words.forEach((w, i) => {
      if (w.at !== undefined) return;
      const before = words
        .slice(0, i)
        .reverse()
        .find((x) => x.at !== undefined);
      const after = words.slice(i + 1).find((x) => x.at !== undefined);
      w.at = before
        ? after
          ? (before.at + after.at) / 2
          : (before.until ?? before.at)
        : cue.start;
    });
    // Within the cue's own span, and never earlier than the word before it.
    let last = cue.start;
    for (const w of words) {
      w.at = Math.min(Math.max(w.at, last, cue.start), cue.end - 0.1);
      last = w.at;
    }
    // The phrase it leans on.
    const phrase = EMPHASIS[cue.text]?.split(/\s+/) ?? [];
    let em = -1;
    if (phrase.length)
      for (let i = 0; i + phrase.length <= words.length; i++)
        if (phrase.every((p, j) => words[i + j].text === p)) {
          em = i;
          break;
        }
    if (phrase.length && em < 0)
      throw new Error(`"${cue.text}" has no phrase "${EMPHASIS[cue.text]}"`);
    return {
      i: ci,
      text: cue.text,
      start: cue.start,
      end: cue.end,
      palette: shotAt(cue.start + 0.05).palette,
      eyebrow: EYEBROW.has(cue.text),
      em: em < 0 ? null : [em, em + phrase.length],
      words,
    };
  });
}

// ------------------------------------------------------------------ timing of the whole
const ENTER = 0.42; // a word rising into focus
const LEAVE = 0.22; // a line leaving
const RUN_GAP = 0.8; // a gap longer than this ends a run: the panel goes
const HOLD = 0.2; // where the speech runs straight on, a line's last word is up at least this long
const QUICK = 0.12; // and the line then leaves this quickly, before the next line's first word comes in
/**
 * The cuts between the palettes (into 03.1, where the brand arrives). A run of lines never crosses one: the line before it
 * leaves, and its panel goes, by the cut, and the next line arrives on a panel of the new shot's material. A
 * panel carried over the cut would show today's white card on the brand's first dark frames (or its glass on
 * today's white page) while the one material faded into the other.
 */
const PALETTE_CUTS = BRIEF.shots
  .filter((s, k) => k > 0 && s.palette !== BRIEF.shots[k - 1].palette)
  .map((s) => s.in);

/** When each line leaves, and the runs of lines one panel carries. */
function schedule(cues) {
  cues.forEach((c, i) => {
    const next = cues[i + 1];
    const cut = next ? PALETTE_CUTS.find((T) => T > c.start && T <= next.start + 1e-6) : undefined;
    const spoken = Math.max(...c.words.map((w) => w.until ?? w.at));
    if (cut !== undefined && spoken > cut - LEAVE - 0.02)
      throw new Error(`"${c.text}" is still being spoken at the cut between the palettes (${cut})`);
    const together = next && cut === undefined && next.start - c.end < RUN_GAP;
    c.leave = together ? Math.max(c.words.at(-1).at + 0.3, next.start - LEAVE) : c.end + 0.15;
    if (cut !== undefined) c.leave = Math.min(c.leave, cut - LEAVE - 0.02);
    c.cut = cut ?? null;
    c.gone = c.leave + LEAVE;
    // A line never arrives over the one before it. Where the speech runs straight on (the next line's first
    // word comes in before this one would have gone), this one leaves quickly once its own last word has been
    // up for HOLD, and the next line's words wait for it to go: measured, by 0.1 s at most.
    if (next) {
      const lastIn = Math.max(c.start, c.words.at(-1).at - 0.07);
      const firstIn = Math.max(next.start, next.words[0].at - 0.07);
      if (c.gone > firstIn) {
        c.leave = Math.max(lastIn + HOLD, firstIn - QUICK);
        c.gone = c.leave + QUICK;
        next.appear = Math.max(next.start, c.gone);
      }
    }
    c.runStart = i > 0 && cues[i - 1].next === c ? cues[i - 1].runStart : c.start;
    c.next = together ? next : null;
  });
  // A run's first line, and when its panel goes (after its last line has left).
  let first = null;
  cues.forEach((c, i) => {
    const prev = cues[i - 1];
    first = prev && prev.next === c ? first : c;
    c.first = first;
  });
  for (const c of cues) c.first.panelGone = Math.max(c.first.panelGone ?? 0, c.gone + 0.12);
  for (const c of cues) if (c.cut !== null) c.first.panelGone = Math.min(c.first.panelGone, c.cut);
  return cues;
}

const CUES = schedule(timedCues());

// ------------------------------------------------------------------ drawing
/** The captions' layer: every line laid out once (hidden), the panel, and its hairline. */
function html() {
  const lines = CUES.map((c) => {
    const words = c.words
      .map((w, j) => {
        const inEm = c.em && j >= c.em[0] && j < c.em[1];
        const first = c.em && j === c.em[0];
        const last = c.em && j === c.em[1] - 1;
        const word = `<span class="cw${inEm ? " em" : ""}" id="cw-${c.i}-${j}">${w.text}</span>`;
        return `${first ? `<span class="cem" id="cem-${c.i}">` : ""}${word}${last ? `<i class="cul" id="cul-${c.i}"></i></span>` : ""}`;
      })
      .join(" ");
    return `<div class="cline${c.eyebrow ? " eyebrow" : ""} cap-${c.palette}" id="cl-${c.i}"><div class="ctext" id="ct-${c.i}">${c.eyebrow ? `<i class="crule l"></i>${words}<i class="crule r"></i>` : words}</div></div>`;
  }).join("");
  return `<div id="captions" class="fk-layer" style="z-index:40">
    <div class="cpanel paper" id="cpanel-paper"></div>
    <div class="cpanel" id="cpanel"><i class="cpanel-line" id="cpanel-line"></i></div>${lines}</div>`;
}

/** The captions' styles. The zone is the brief's (1300 to 1560 px); the panel is centred in it. */
const CENTRE = 1430;
const css = `
#captions { pointer-events:none; }
.cpanel { position:absolute; left:540px; top:${CENTRE}px; width:0; height:0; transform:translate(-50%,-50%);
  background:linear-gradient(180deg, rgba(10,23,42,.88), rgba(4,11,22,.93)); border:2px solid rgba(255,255,255,.09);
  -webkit-backdrop-filter:blur(14px) saturate(1.15); backdrop-filter:blur(14px) saturate(1.15);
  box-shadow:0 18px 60px rgba(0,0,0,.38); visibility:hidden; }
/* Before the brand arrives, the panel is today's: a white card on the paper desktop, its border and shadow. */
.cpanel.paper { background:rgba(255,255,255,.95); border-color:var(--reel-before-border, #D1D5DB);
  box-shadow:0 2px 6px rgba(15,23,42,.06), 0 18px 44px rgba(15,23,42,.16); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); }
.cpanel-line { position:absolute; left:50%; top:-1px; width:112px; height:2px; margin-left:-56px; transform-origin:50% 50%;
  background:linear-gradient(90deg, rgba(200,155,60,0), #c89b3c 22%, #d7b35f 50%, #c89b3c 78%, rgba(200,155,60,0)); }
.cline { position:absolute; left:86px; right:86px; top:${CENTRE}px; transform:translateY(-50%); display:flex; justify-content:center; }
.ctext { max-width:860px; text-align:center; text-wrap:balance; font:500 60px/1.16 "Aurixa Caption", "Playfair Display", serif;
  letter-spacing:-.012em; }
.cw { display:inline-block; visibility:hidden; color:transparent; -webkit-background-clip:text; background-clip:text;
  background-image:linear-gradient(180deg, #fff 8%, #c6cedb 68%, #fff); padding:.06em .12em .14em; margin:-.06em -.12em -.14em; }
.cw.em { font-style:italic; }
.cap-aurixa .cw.em { background-image:linear-gradient(105deg, rgba(255,247,222,0) 0%, rgba(255,247,222,.9) 50%, rgba(255,247,222,0) 100%),
  linear-gradient(180deg, #f5d17a 6%, #d7b35f 52%, #c89b3c 82%, #e6c36e 100%);
  background-size:0 100%, 100% 100%; background-repeat:no-repeat; background-position:-9999px 0, 0 0; }
.cem { position:relative; display:inline-block; white-space:nowrap; }
.cul { position:absolute; left:.04em; right:.04em; bottom:.02em; height:2px; transform:scaleX(0); transform-origin:0 50%; visibility:hidden;
  background:linear-gradient(90deg, #c89b3c, #d7b35f 60%, rgba(215,179,95,.2)); }
.cap-before .cul { display:none; }
.cap-before .cw { background-image:none; color:var(--reel-before-ink, #374151); }
.cline.eyebrow .ctext { font:700 34px/1.2 ui-monospace, "Inconsolata", monospace; letter-spacing:.28em; text-transform:uppercase;
  display:flex; align-items:center; gap:22px; white-space:nowrap; padding-left:.28em; }
.cline.eyebrow .cw { background-image:none; color:#e8edf5; padding:0; margin:0; }
.cline.eyebrow.cap-before .cw { color:var(--reel-before-ink, #374151); }
.crule { display:block; width:72px; height:2px; background:#b7c1d0; transform:scaleX(0); visibility:hidden; }
.cap-before .crule { background:var(--reel-before-ink-muted, #6B7280); }
.crule.l { transform-origin:100% 50%; } .crule.r { transform-origin:0 50%; }
`;

/** The page's measurements: each line's text box (CSS px), to size the panel to it. */
async function measure(tab) {
  const phrases = await tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll(".cem")].map((em) => {
        const box = em.getBoundingClientRect();
        return [
          em.id.slice(4),
          {
            width: box.width,
            words: [...em.querySelectorAll(".cw")].map(
              (w) => w.getBoundingClientRect().left - box.left,
            ),
          },
        ];
      }),
    ),
  );
  const lines = await tab.evaluate(() =>
    [...document.querySelectorAll(".ctext")].map((el) => {
      const r = el.getBoundingClientRect();
      // An eyebrow is one line, its rules and words: its own box. Otherwise the widest of its lines: the
      // boxes of the words in it (a balanced line is narrower than the block it is set in).
      if (el.querySelector(".crule")) return [r.width, r.height];
      let left = Infinity;
      let right = -Infinity;
      for (const w of el.querySelectorAll(".cw")) {
        const b = w.getBoundingClientRect();
        left = Math.min(left, b.left);
        right = Math.max(right, b.right);
      }
      return [right - left, r.height];
    }),
  );
  return { lines, phrases };
}

// ------------------------------------------------------------------ moving
/**
 * The captions at t, into a frame's state: `ease` is the renderer's (settle, move, linear), `span` its
 * eased progress through [a, b], `fade` its shown-or-hidden, `boxes` the measured text boxes.
 */
function state(st, t, { lines: boxes, phrases }, { span, fade, EASE, px, r3 }) {
  const PAD = [40, 26]; // the panel's padding around the text (x, y)
  // The panel: in with its run's first line, from one line's size to the next's, out after its last. At a
  // cut between the palettes one run's panel has gone before the next one's arrives.
  const run = CUES.find((c) => t >= c.first.start - 0.2 && t < c.first.panelGone)?.first ?? null;
  if (run) {
    const lines = CUES.filter((c) => c.first === run);
    const cur = [...lines].reverse().find((c) => t >= c.start - 0.06) ?? lines[0];
    const prev = lines[lines.indexOf(cur) - 1];
    const size = (c) => [boxes[c.i][0] + 2 * PAD[0], boxes[c.i][1] + 2 * PAD[1]];
    const p = prev ? span(t, cur.start - 0.06, cur.start + 0.3, EASE.move) : 1;
    const [w, h] = prev ? size(prev).map((v, k) => v + (size(cur)[k] - v) * p) : size(cur);
    // It leads its first line by 0.08 s, but never into the time before the film begins: the first line is
    // spoken on the film's first frame, which would otherwise open on an empty card part-way in.
    const enter = Math.max(0, run.start - 0.08);
    const shown = Math.min(
      span(t, enter, run.start + 0.24, EASE.settle),
      1 - span(t, run.panelGone - 0.3, run.panelGone, EASE.move),
    );
    const grow = 0.965 + 0.035 * span(t, enter, run.start + 0.32, EASE.settle);
    // The material is the run's: the brand's glass from the cut where it arrives (03.1),
    // today's white card before it.
    const g = run.palette === "aurixa" ? 1 : 0;
    const box = {
      width: px(w),
      height: px(h),
      transform: `translate(-50%, -50%) scale(${r3(grow)})`,
    };
    st.set("#cpanel", { ...box, ...fade(shown * g) });
    st.set("#cpanel-paper", { ...box, ...fade(shown * (1 - g)) });
    // Its hairline: drawn out from the centre as the panel arrives; gold from the brand's arrival.
    const drawn = span(t, run.start, run.start + 0.5, EASE.move);
    st.set("#cpanel-line", { transform: `scaleX(${r3(drawn)})` });
  } else
    for (const id of ["#cpanel", "#cpanel-paper"])
      st.set(id, { width: "0px", height: "0px", transform: "translate(-50%, -50%)", ...fade(0) });

  for (const c of CUES) {
    const on = t >= c.start - 0.1 && t < c.gone;
    st.set(`#cl-${c.i}`, { visibility: on ? "visible" : "hidden" });
    const leaving = span(t, c.leave, c.gone, EASE.move);
    c.words.forEach((w, j) => {
      if (!on) {
        st.set(`#cw-${c.i}-${j}`, { ...fade(0), transform: "none", filter: "none" });
        return;
      }
      // In: from just before it is spoken, rising a third of an em out of a soft blur.
      const a = Math.max(c.appear ?? c.start, w.at - 0.07);
      const p = span(t, a, a + ENTER, EASE.settle);
      const o = Math.min(span(t, a, a + ENTER * 0.6, EASE.settle), 1 - leaving);
      const blur = (1 - p) * 9 + leaving * 5;
      st.set(`#cw-${c.i}-${j}`, {
        ...fade(o),
        transform: `translateY(${px((1 - p) * 20 - leaving * 10)})`,
        filter: blur > 0.05 ? `blur(${r3(blur)}px)` : "none",
      });
      // The gold phrase: once its last word is in, the light crosses the whole phrase once, left to right
      // (each word's band is the phrase's, offset by where the word sits in it).
      if (c.em && j >= c.em[0] && j < c.em[1] && c.palette === "aurixa") {
        const ph = phrases[c.i];
        const lastIn = Math.max(c.appear ?? c.start, c.words[c.em[1] - 1].at - 0.07) + ENTER * 0.7;
        const sweep = span(t, lastIn, lastIn + 0.95, EASE.move);
        const band = ph.width * 0.9; // the highlight's width
        const x = -band + sweep * (ph.width + 2 * band); // its centre's travel, in phrase px
        st.set(`#cw-${c.i}-${j}`, {
          "background-size": `${px(band)} 100%, 100% 100%`,
          "background-position": `${px(x - band / 2 - ph.words[j - c.em[0]])} 0, 0 0`,
        });
      }
    });
    if (c.em && c.palette === "aurixa") {
      const lastIn = Math.max(c.appear ?? c.start, c.words[c.em[1] - 1].at - 0.07) + ENTER * 0.5;
      const drawn = on ? span(t, lastIn, lastIn + 0.5, EASE.move) : 0;
      st.set(`#cul-${c.i}`, {
        transform: `scaleX(${r3(drawn)})`,
        ...fade(on ? Math.min(1, drawn * 4) * (1 - leaving) : 0),
      });
    }
    if (c.eyebrow) {
      const drawn = on ? span(t, c.start, c.start + 0.5, EASE.move) : 0;
      for (const side of ["l", "r"])
        st.set(`#cl-${c.i} .crule.${side}`, {
          transform: `scaleX(${r3(drawn)})`,
          ...fade(on ? 1 - leaving : 0),
        });
    }
  }
}

/** The caption words on screen at t (each at least half in), as one string: what film.json records. */
function visibleAt(t, { span, EASE }) {
  const words = [];
  for (const c of CUES) {
    if (!(t >= c.start - 0.1 && t < c.gone)) continue;
    const leaving = span(t, c.leave, c.gone, EASE.move);
    c.words.forEach((w) => {
      const a = Math.max(c.appear ?? c.start, w.at - 0.07);
      if (Math.min(span(t, a, a + ENTER * 0.6, EASE.settle), 1 - leaving) > 0.5) words.push(w.text);
    });
  }
  return words.join(" ");
}

module.exports = { CUES, html, css, measure, state, visibleAt };

if (require.main === module) {
  for (const c of CUES)
    console.log(
      `${c.start.toFixed(2)}-${c.end.toFixed(2)} [${c.palette}${c.eyebrow ? ", eyebrow" : ""}] ` +
        c.words
          .map(
            (w, j) =>
              `${c.em && j >= c.em[0] && j < c.em[1] ? "*" : ""}${w.text}@${w.at.toFixed(2)}`,
          )
          .join(" ") +
        ` | leaves ${c.leave.toFixed(2)}${c.first === c ? `, panel to ${c.panelGone.toFixed(2)}` : ""}`,
    );
}
