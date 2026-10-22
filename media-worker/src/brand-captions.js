/**
 * Brand captions: every word rising into focus from a soft blur on its own
 * spoken time, one phrase a line set in the italic in the brand's accent,
 * with a hairline drawn under it and one pass of light across it, and a panel
 * behind the words that reshapes from one line to the next. Reel 1's captions
 * (scripts/aurixa-reel-1/captions.cjs), made a caption style.
 *
 *  - Words. A word comes in over 0.42 s from just before it is spoken; a line
 *    leaves over 0.22 s, just before the next arrives.
 *  - Runs. Lines closer than 0.8 s follow on in one run, on one panel; a
 *    longer pause ends the run and its panel goes. Where the speech runs
 *    straight on, a line's last word is up at least 0.2 s and the line then
 *    leaves quickly, and the next line's words wait for it to go.
 *  - Cuts. No run is carried across a cut where the picture's palette
 *    changes: the line before it leaves, and its panel goes, by the cut, and
 *    the next line arrives on a panel of the new picture's material. (A line
 *    still being spoken at the cut keeps its run: it is never cut short.)
 *  - The panel's look follows the picture behind it: a light card over light
 *    pictures, a dark glass over dark ones, its glass nearer opaque the
 *    lighter the picture; or a light card, the glass, a solid panel in the
 *    brand's colour, or none, as chosen.
 *
 * Pure maths, shared with the Editor's preview: src/lib/edit/brand-captions.ts
 * is this module in TypeScript, and tests/edit/brand-captions.test.ts holds the
 * two to the same answers. Times are seconds on the edit's clock; lengths are
 * pixels on the frame.
 */

/** The motion's timing, Reel 1's. */
export const MOTION = {
  /** A word rising into focus. */
  enter: 0.42,
  /** A line leaving. */
  leave: 0.22,
  /** A pause longer than this between two lines ends a run: the panel goes. */
  runGap: 0.8,
  /** Where the speech runs straight on, a line's last word is up at least this long... */
  hold: 0.2,
  /** ...and the line then leaves this quickly, before the next line's first word comes in. */
  quick: 0.12,
  /** A word starts coming in this long before it is spoken. */
  lead: 0.07,
};

/** A CSS cubic-bezier as a function of progress (0 to 1), solved as a browser solves it. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const e = X(s) - t;
      if (Math.abs(e) < 1e-7) return Y(s);
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 50; i += 1) {
      const x = X(s);
      if (Math.abs(x - t) < 1e-7) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}

/** The products' emphasized ease (anything that travels) and their ease-out (arrivals), as Reel 1 moved. */
export const EASE = { move: bezier(0.2, 0, 0, 1), settle: bezier(0.22, 1, 0.36, 1) };

/** How far through [a, b] the time t is, on a curve (an empty span is a step at b). */
export function span(t, a, b, ease = EASE.move) {
  if (!(b > a)) return t >= b ? 1 : 0;
  return ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/**
 * A line's words spread over its time when no word was measured: spoken over
 * the first part of the line at a talking pace, each by its length.
 * Times are seconds from the line's start.
 */
export function evenWords(text, duration) {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];
  const spoken = Math.max(0.1, Math.min(Math.max(0.1, duration) * 0.7, words.length * 0.35));
  const weights = words.map((word) => word.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return words.map((word, index) => {
    const start = (spoken * cursor) / total;
    cursor += weights[index];
    return { text: word, start, end: (spoken * cursor) / total };
  });
}

/**
 * A caption line ready to schedule: its words at their times on the edit's
 * clock, each within the line's own time and never before the word before.
 * `words` are seconds from the line's start; none spreads them evenly.
 */
export function timedCue({ start, end, text = "", words = null, emphasis = null }) {
  const list = words && words.length ? words : evenWords(text, end - start);
  const latest = Math.max(start, end - 0.1);
  let last = start;
  const timed = list.map((word) => {
    const at = Math.min(Math.max(start + word.start, last), latest);
    last = at;
    return { text: word.text, at, until: Math.max(at, Math.min(start + word.end, end)) };
  });
  const range =
    emphasis && emphasis[0] >= 0 && emphasis[1] <= timed.length && emphasis[0] < emphasis[1]
      ? [emphasis[0], emphasis[1]]
      : null;
  return { start, end, words: timed, emphasis: range };
}

/* ------------------------------------------------------------------ */
/* When lines come and go                                              */
/* ------------------------------------------------------------------ */

/**
 * When each line leaves and is gone, and the runs of lines one panel carries
 * (see the module comment). `cues` are timed lines in order; `cuts` are the
 * times the picture's palette changes at. Each cue comes back with `leave`,
 * `gone`, `appear` (when its words may start, where it waits for the line
 * before; else null), `cut` (the palette cut before the next line, if it
 * ends its run), `next` (the next line's index in its run, else null),
 * `first` (its run's first line) and, on a run's first line, `panelGone`
 * (when the run's panel has gone; else null).
 */
export function scheduleCues(cues, cuts = []) {
  const { leave: LEAVE, runGap, hold, quick, lead } = MOTION;
  const out = cues.map((cue) => ({
    ...cue,
    appear: null,
    leave: 0,
    gone: 0,
    cut: null,
    next: null,
    first: 0,
    panelGone: null,
  }));
  out.forEach((cue, index) => {
    const next = out[index + 1];
    const last = cue.words[cue.words.length - 1];
    const spoken = Math.max(...cue.words.map((word) => word.until));
    let cut = next ? cuts.find((at) => at > cue.start && at <= next.start + 1e-6) : undefined;
    // A line still being spoken at the cut keeps its run, rather than be cut short.
    if (cut !== undefined && spoken > cut - LEAVE - 0.02) cut = undefined;
    const together = !!next && cut === undefined && next.start - cue.end < runGap;
    cue.leave = together ? Math.max(last.at + 0.3, next.start - LEAVE) : cue.end + 0.15;
    if (cut !== undefined) cue.leave = Math.min(cue.leave, cut - LEAVE - 0.02);
    cue.cut = cut ?? null;
    cue.gone = cue.leave + LEAVE;
    // A line never arrives over the one before it: where the next line's first
    // word comes in before this one would have gone, this one leaves quickly
    // once its own last word has been up a moment, and the next one's words wait.
    if (next) {
      const lastIn = Math.max(cue.start, last.at - lead);
      const firstIn = Math.max(next.start, next.words[0].at - lead);
      if (cue.gone > firstIn) {
        cue.leave = Math.max(lastIn + hold, firstIn - quick);
        cue.gone = cue.leave + quick;
        next.appear = Math.max(next.start, cue.gone);
      }
    }
    cue.next = together ? index + 1 : null;
  });
  // A run's first line, and when its panel goes: after its last line has
  // left, and by the cut that ends it.
  out.forEach((cue, index) => {
    const before = out[index - 1];
    cue.first = before && before.next === index ? before.first : index;
  });
  for (const cue of out) {
    const first = out[cue.first];
    first.panelGone = Math.max(first.panelGone ?? 0, cue.gone + 0.12);
  }
  for (const cue of out)
    if (cue.cut !== null) out[cue.first].panelGone = Math.min(out[cue.first].panelGone, cue.cut);
  return out;
}

/* ------------------------------------------------------------------ */
/* Where the words go                                                  */
/* ------------------------------------------------------------------ */

/**
 * The type's size and place on a frame: the em (60 px on a 1080-wide
 * portrait frame at 100%, as Reel 1 set it), the line pitch, the widest a
 * line may run, the panel's padding, and the middle of the caption block for
 * where the captions sit.
 */
export function captionGeometry({ width, height }, { position = "lower_third", size = 1 } = {}) {
  const em = Math.min(width, height) * 0.0556 * size;
  const portrait = height > width;
  const centre =
    {
      top: portrait ? 0.2 : 0.16,
      center: 0.5,
      lower_third: portrait ? 0.745 : 0.78,
      bottom: portrait ? 0.84 : 0.86,
    }[position] ?? 0.745;
  return {
    em,
    pitch: em * 1.16,
    maxWidth: Math.min(width * 0.8, em * 16),
    padX: em * (40 / 60),
    padY: em * (26 / 60),
    centreX: width / 2,
    centreY: height * centre,
  };
}

/**
 * Where each word of a line goes: broken into as few lines as fit the width,
 * as even as they can be made (the emphasis phrase is never broken), each
 * line centred, the block centred on the caption's middle. `measure(text,
 * italic)` is a text's advance in pixels at the em; `ascent` and `descent`
 * are the regular face's, in ems, to set the baseline in its line.
 */
export function layoutCue(cue, geometry, { measure, ascent, descent }) {
  const { em, pitch, maxWidth, centreX, centreY } = geometry;
  const words = cue.words;
  const count = words.length;
  if (!count) return { lines: [], words: [], box: { width: 0, height: 0 }, emphasis: null };
  const inPhrase = (index) =>
    cue.emphasis !== null && index >= cue.emphasis[0] && index < cue.emphasis[1];
  const widths = words.map((word, index) => measure(word.text, inPhrase(index)));
  const spaces = words.map((_, index) => measure(" ", inPhrase(index)));
  // A line's width from word a to word b (exclusive).
  const lineWidth = (a, b) => {
    let total = 0;
    for (let index = a; index < b; index += 1)
      total += widths[index] + (index < b - 1 ? spaces[index] : 0);
    return total;
  };
  // Where a line may break: before any word but one inside the emphasis phrase.
  const stops = [0];
  for (let index = 1; index < count; index += 1)
    if (!(inPhrase(index - 1) && inPhrase(index))) stops.push(index);
  stops.push(count);
  const units = stops.length - 1;
  // The fewest lines that fit, filled greedily (a line of one unbreakable
  // piece may run over)...
  let fewest = 0;
  for (let at = 0; at < units; fewest += 1) {
    let end = at + 1;
    while (end < units && lineWidth(stops[at], stops[end + 1]) <= maxWidth) end += 1;
    at = end;
  }
  // ...then the most even split into that many: the widest line as narrow as
  // it can be, then the lines as alike as they can be. best[left][at] is the
  // best split of the words from stops[at] on into `left` lines.
  const best = Array.from({ length: fewest + 1 }, () => new Array(units + 1).fill(null));
  best[0][units] = { widest: 0, squares: 0, next: units };
  for (let left = 1; left <= fewest; left += 1) {
    for (let at = units - 1; at >= 0; at -= 1) {
      let choice = null;
      for (let end = at + 1; end <= units; end += 1) {
        const width = lineWidth(stops[at], stops[end]);
        if (width > maxWidth && end - at > 1) break;
        const rest = best[left - 1][end];
        if (!rest) continue;
        const widest = Math.max(width, rest.widest);
        const squares = width * width + rest.squares;
        if (
          !choice ||
          widest < choice.widest - 1e-9 ||
          (Math.abs(widest - choice.widest) <= 1e-9 && squares < choice.squares - 1e-9)
        ) {
          choice = { widest, squares, next: end };
        }
      }
      best[left][at] = choice;
    }
  }
  const breaks = [0];
  for (let at = 0, left = fewest; left > 0; left -= 1) {
    at = best[left][at].next;
    breaks.push(stops[at]);
  }
  const lineCount = breaks.length - 1;
  const top = centreY - (lineCount * pitch) / 2;
  const lines = [];
  const placed = new Array(count);
  for (let line = 0; line < lineCount; line += 1) {
    const from = breaks[line];
    const to = breaks[line + 1];
    const width = lineWidth(from, to);
    const baseline = top + line * pitch + (pitch - (ascent + descent) * em) / 2 + ascent * em;
    let x = centreX - width / 2;
    for (let index = from; index < to; index += 1) {
      placed[index] = { x, baseline, width: widths[index], italic: inPhrase(index), line };
      x += widths[index] + spaces[index];
    }
    lines.push({ from, to, width, baseline });
  }
  const emphasis =
    cue.emphasis === null
      ? null
      : {
          left: placed[cue.emphasis[0]].x,
          right: placed[cue.emphasis[1] - 1].x + placed[cue.emphasis[1] - 1].width,
          baseline: placed[cue.emphasis[0]].baseline,
        };
  return {
    lines,
    words: placed,
    box: { width: Math.max(...lines.map((line) => line.width)), height: lineCount * pitch },
    emphasis,
  };
}

/* ------------------------------------------------------------------ */
/* The panel's look                                                    */
/* ------------------------------------------------------------------ */

/** What can be behind the words. */
export const CAPTION_PANELS = ["auto", "light", "dark", "solid", "none"];

/** The brand style's accent where the edit has none: Reel 1's gold. */
export const DEFAULT_ACCENT = "#d7b35f";
/** A card of today's tools (Reel 1 before the brand arrives): white, its border and its ink. */
const CARD = {
  fill: "#ffffff",
  opacity: 0.95,
  stroke: "#d1d5db",
  strokeOpacity: 1,
  ink: "#1f2937",
};
/** The brand's glass (Reel 1 after it arrives): deep navy, a hairline border of white at 9%. */
const GLASS = { fill: "#0a172a", stroke: "#ffffff", strokeOpacity: 0.09, ink: "#ffffff" };
/** The light that passes across the emphasis. */
const LIGHT = "#fff7de";

/** A colour's relative luminance (WCAG). */
export function luminance(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  const channel = (offset) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** How far apart two colours read (WCAG contrast ratio, 1 to 21). */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * How opaque the glass is over a picture of this lightness (0 dark to 1
 * light; null when it wasn't measured): the site's 74% over a dark picture,
 * up to 93% over a white page, where Reel 1 found 74% read as a grey slab.
 */
export function glassOpacity(backdrop) {
  if (backdrop === null || backdrop === undefined) return 0.88;
  return 0.74 + 0.19 * Math.min(1, Math.max(0, (backdrop - 0.25) / 0.35));
}

/** A picture this light or lighter takes the light card, where the panel follows the picture. */
export const LIGHT_BACKDROP = 0.6;

/**
 * The panel behind a run of lines, and the colours its words are set in:
 * the material ("light", "dark", "solid" or "none"), its fill and border,
 * the words' ink, the emphasis colour, the hairline's, and whether the light
 * passes across the emphasis. The ink and emphasis are the edit's own
 * colours wherever they read on the panel, else the material's.
 */
export function panelLook(
  panel,
  backdrop,
  { color = null, accent = null, panelColor = null } = {},
) {
  const kind =
    panel === "light" || panel === "dark" || panel === "solid" || panel === "none"
      ? panel
      : backdrop !== null && backdrop !== undefined && backdrop >= LIGHT_BACKDROP
        ? "light"
        : "dark";
  const brandAccent = accent ?? DEFAULT_ACCENT;
  if (kind === "none") {
    const ink = color ?? "#ffffff";
    return {
      kind,
      fill: null,
      fillOpacity: 0,
      stroke: null,
      strokeOpacity: 0,
      ink,
      emphasis: brandAccent,
      hairline: brandAccent,
      light: true,
    };
  }
  const base =
    kind === "light"
      ? {
          fill: CARD.fill,
          fillOpacity: CARD.opacity,
          stroke: CARD.stroke,
          strokeOpacity: CARD.strokeOpacity,
          ink: CARD.ink,
        }
      : kind === "dark"
        ? {
            fill: GLASS.fill,
            fillOpacity: glassOpacity(backdrop),
            stroke: GLASS.stroke,
            strokeOpacity: GLASS.strokeOpacity,
            ink: GLASS.ink,
          }
        : (() => {
            const fill = panelColor ?? accent ?? "#0b1020";
            return {
              fill,
              fillOpacity: 1,
              stroke: null,
              strokeOpacity: 0,
              ink: contrast(fill, "#000000") >= contrast(fill, "#ffffff") ? "#000000" : "#ffffff",
            };
          })();
  const ink = color && contrast(color, base.fill) >= 4.5 ? color : base.ink;
  const emphasis = contrast(brandAccent, base.fill) >= 3 ? brandAccent : ink;
  return {
    kind,
    ...base,
    ink,
    emphasis,
    hairline: contrast(brandAccent, base.fill) >= 1.5 ? brandAccent : ink,
    light: luminance(base.fill) < 0.4,
  };
}

/* ------------------------------------------------------------------ */
/* What is on the frame at a time                                      */
/* ------------------------------------------------------------------ */

/**
 * Brand captions laid out and scheduled: each line with its words' times,
 * its layout, and the look of its run's panel. `lines` are caption segments
 * ({ start, end, text, words, emphasis }), `cuts` the times the picture's
 * palette changes at, and `lookOf(run)` the look of a run's panel, given its
 * lines' indexes (see `panelLook`).
 */
export function planBrandCaptions(lines, { geometry, faces, cuts = [], lookOf }) {
  const cues = scheduleCues(lines.map(timedCue), cuts);
  const looks = new Map();
  for (const cue of cues) {
    if (looks.has(cue.first)) continue;
    const run = cues.flatMap((other, index) => (other.first === cue.first ? [index] : []));
    looks.set(cue.first, lookOf(run));
  }
  return {
    geometry,
    cues: cues.map((cue, index) => ({
      ...cue,
      index,
      layout: layoutCue(cue, geometry, faces),
      look: looks.get(cue.first),
    })),
  };
}

/** Each word's state at t: how far in it is, its rise and blur, and how far its line has left. */
export function wordState(cue, index, t) {
  const { enter, lead } = MOTION;
  if (!(t >= cue.start - 0.1 && t < cue.gone)) return null;
  const word = cue.words[index];
  const leaving = span(t, cue.leave, cue.gone, EASE.move);
  const from = Math.max(cue.appear ?? cue.start, word.at - lead);
  const p = span(t, from, from + enter, EASE.settle);
  const opacity = Math.min(span(t, from, from + enter * 0.6, EASE.settle), 1 - leaving);
  return {
    opacity,
    rise: (1 - p) * (20 / 60) - leaving * (10 / 60),
    blur: (1 - p) * (9 / 60) + leaving * (5 / 60),
    leaving,
  };
}

/** When a line's emphasis is in: its last word, a moment after it starts to come in. */
function emphasisIn(cue, share) {
  const last = cue.words[cue.emphasis[1] - 1];
  return Math.max(cue.appear ?? cue.start, last.at - MOTION.lead) + MOTION.enter * share;
}

/** The light's slices across its band, from its leading edge: where each sits in the band, and how bright. */
const SLICES = [0.18, 0.54, 0.9, 0.54, 0.18];

/**
 * What is on the frame at t: the panel, each word (its place, ink, and how
 * far in it is: `rise` and `blur` are in ems, the rise downward), the
 * hairline under each emphasis, and the slices of light passing across it
 * (each word's copy in the light, between two edges across the frame).
 */
export function captionFrame(plan, t) {
  const { geometry, cues } = plan;
  const { em, padX, padY, centreX, centreY } = geometry;
  const frame = { panel: null, words: [], hairlines: [], lights: [] };

  // The panel: in with its run's first line, from one line's size to the
  // next's, out after its last. At a palette cut one run's panel has gone
  // before the next one's arrives.
  const run = cues.find(
    (cue) => cue.first === cue.index && t >= cue.start - 0.2 && t < cue.panelGone,
  );
  if (run && run.look.kind !== "none") {
    const lines = cues.filter((cue) => cue.first === run.index);
    let current = lines[0];
    for (const cue of lines) if (t >= cue.start - 0.06) current = cue;
    const previous = lines[lines.indexOf(current) - 1];
    const size = (cue) => [cue.layout.box.width + 2 * padX, cue.layout.box.height + 2 * padY];
    const p = previous ? span(t, current.start - 0.06, current.start + 0.3, EASE.move) : 1;
    const [w, h] = previous
      ? size(previous).map((value, k) => value + (size(current)[k] - value) * p)
      : size(current);
    // It leads its first line by 0.08 s, but never into the time before the edit begins.
    const enter = Math.max(0, run.start - 0.08);
    const shown = Math.min(
      span(t, enter, run.start + 0.24, EASE.settle),
      1 - span(t, run.panelGone - 0.3, run.panelGone, EASE.move),
    );
    const grow = 0.965 + 0.035 * span(t, enter, run.start + 0.32, EASE.settle);
    if (shown > 0)
      frame.panel = {
        run: run.index,
        x: centreX,
        y: centreY,
        width: w * grow,
        height: h * grow,
        opacity: shown,
        look: run.look,
      };
  }

  for (const cue of cues) {
    if (!(t >= cue.start - 0.1 && t < cue.gone)) continue;
    const { layout, look } = cue;
    let leaving = 0;
    cue.words.forEach((word, index) => {
      const state = wordState(cue, index, t);
      if (!state) return;
      leaving = state.leaving;
      const place = layout.words[index];
      frame.words.push({
        cue: cue.index,
        index,
        text: word.text,
        x: place.x,
        baseline: place.baseline,
        italic: place.italic,
        colour: place.italic ? look.emphasis : look.ink,
        opacity: state.opacity,
        rise: state.rise,
        blur: state.blur,
      });
    });
    if (!cue.emphasis || !layout.emphasis) continue;
    // The hairline: drawn out under the phrase once its last word is in.
    const drawn = span(t, emphasisIn(cue, 0.5), emphasisIn(cue, 0.5) + 0.5, EASE.move);
    const opacity = Math.min(1, drawn * 4) * (1 - leaving);
    const { left, right, baseline } = layout.emphasis;
    if (opacity > 0 && drawn > 0) {
      frame.hairlines.push({
        cue: cue.index,
        x: left + 0.04 * em,
        y: baseline + 0.18 * em,
        width: Math.max(0, right - left - 0.08 * em) * drawn,
        height: Math.max(1, em / 30),
        colour: look.hairline,
        opacity,
      });
    }
    // The light: once the phrase is in, it crosses the phrase once, left to right.
    if (!look.light) continue;
    const from = emphasisIn(cue, 0.7);
    const sweep = span(t, from, from + 0.95, EASE.move);
    if (sweep <= 0 || sweep >= 1) continue;
    const phrase = right - left;
    const band = phrase * 0.9;
    const centre = left - band + sweep * (phrase + 2 * band);
    SLICES.forEach((bright, slice) => {
      const x0 = centre - band / 2 + (slice * band) / SLICES.length;
      const x1 = x0 + band / SLICES.length;
      for (const word of frame.words) {
        if (word.cue !== cue.index || !word.italic) continue;
        const place = layout.words[word.index];
        if (x1 <= place.x || x0 >= place.x + place.width) continue;
        frame.lights.push({
          cue: cue.index,
          index: word.index,
          slice,
          x0,
          x1,
          colour: LIGHT,
          opacity: bright * word.opacity,
        });
      }
    });
  }
  return frame;
}
