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
 * The timing, layout and look are the media worker's own: this module is
 * media-worker/src/brand-captions.js in TypeScript, and
 * tests/edit/brand-captions.test.ts holds the two to the same answers, so the
 * Editor's preview moves as the render does. Times are seconds on the edit's
 * clock; lengths are pixels on the frame. Below them are what only the app
 * does: a line's words matched to its text as edited, and its emphasis.
 *
 * Shared by the Editor, the server and tests.
 */
import type { CaptionSegment } from "./timeline";

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
} as const;

/** A CSS cubic-bezier as a function of progress (0 to 1), solved as a browser solves it. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
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
export function span(t: number, a: number, b: number, ease: (p: number) => number = EASE.move) {
  if (!(b > a)) return t >= b ? 1 : 0;
  return ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** A word of a line, its times in seconds from the line's start. */
export interface LineWord {
  text: string;
  start: number;
  end: number;
}

/** A word on the edit's clock: when it is spoken, and until when. */
export interface TimedWord {
  text: string;
  at: number;
  until: number;
}

/**
 * A line's words spread over its time when no word was measured: spoken over
 * the first part of the line at a talking pace, each by its length.
 * Times are seconds from the line's start.
 */
export function evenWords(text: string, duration: number): LineWord[] {
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
    cursor += weights[index]!;
    return { text: word, start, end: (spoken * cursor) / total };
  });
}

/** A caption line as the brand style takes it. */
export interface BrandLine {
  start: number;
  end: number;
  text?: string;
  /** Seconds from the line's start; none spreads its words evenly. */
  words?: LineWord[] | null;
  /** The words [from, to) set in the italic. */
  emphasis?: [number, number] | null;
}

export interface Cue {
  start: number;
  end: number;
  words: TimedWord[];
  emphasis: [number, number] | null;
}

/**
 * A caption line ready to schedule: its words at their times on the edit's
 * clock, each within the line's own time and never before the word before.
 */
export function timedCue({ start, end, text = "", words = null, emphasis = null }: BrandLine): Cue {
  const list = words && words.length ? words : evenWords(text, end - start);
  const latest = Math.max(start, end - 0.1);
  let last = start;
  const timed = list.map((word) => {
    const at = Math.min(Math.max(start + word.start, last), latest);
    last = at;
    return { text: word.text, at, until: Math.max(at, Math.min(start + word.end, end)) };
  });
  const range: [number, number] | null =
    emphasis && emphasis[0] >= 0 && emphasis[1] <= timed.length && emphasis[0] < emphasis[1]
      ? [emphasis[0], emphasis[1]]
      : null;
  return { start, end, words: timed, emphasis: range };
}

/* ------------------------------------------------------------------ */
/* When lines come and go                                              */
/* ------------------------------------------------------------------ */

export interface ScheduledCue extends Cue {
  /** When its words may start coming in, where it waits for the line before. */
  appear: number | null;
  leave: number;
  gone: number;
  /** The palette cut before the next line, where it ends the run. */
  cut: number | null;
  /** The next line's index in its run. */
  next: number | null;
  /** Its run's first line. */
  first: number;
  /** On a run's first line: when the run's panel has gone. */
  panelGone: number | null;
}

/**
 * When each line leaves and is gone, and the runs of lines one panel carries
 * (see the module comment). `cues` are timed lines in order; `cuts` are the
 * times the picture's palette changes at.
 */
export function scheduleCues(cues: Cue[], cuts: number[] = []): ScheduledCue[] {
  const { leave: LEAVE, runGap, hold, quick, lead } = MOTION;
  const out: ScheduledCue[] = cues.map((cue) => ({
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
    const last = cue.words[cue.words.length - 1]!;
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
      const firstIn = Math.max(next.start, next.words[0]!.at - lead);
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
    const first = out[cue.first]!;
    first.panelGone = Math.max(first.panelGone ?? 0, cue.gone + 0.12);
  }
  for (const cue of out)
    if (cue.cut !== null) out[cue.first]!.panelGone = Math.min(out[cue.first]!.panelGone!, cue.cut);
  return out;
}

/* ------------------------------------------------------------------ */
/* Where the words go                                                  */
/* ------------------------------------------------------------------ */

export interface CaptionGeometry {
  em: number;
  pitch: number;
  maxWidth: number;
  padX: number;
  padY: number;
  centreX: number;
  centreY: number;
}

/**
 * The type's size and place on a frame: the em (60 px on a 1080-wide
 * portrait frame at 100%, as Reel 1 set it), the line pitch, the widest a
 * line may run, the panel's padding, and the middle of the caption block for
 * where the captions sit.
 */
export function captionGeometry(
  { width, height }: { width: number; height: number },
  { position = "lower_third", size = 1 }: { position?: string; size?: number } = {},
): CaptionGeometry {
  const em = Math.min(width, height) * 0.0556 * size;
  const portrait = height > width;
  const centre =
    (
      {
        top: portrait ? 0.2 : 0.16,
        center: 0.5,
        lower_third: portrait ? 0.745 : 0.78,
        bottom: portrait ? 0.84 : 0.86,
      } as Record<string, number>
    )[position] ?? 0.745;
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

/** How text is measured for a layout: a text's advance at the em, and the regular face's ascent and descent in ems. */
export interface LayoutFaces {
  measure(text: string, italic: boolean): number;
  ascent: number;
  descent: number;
}

export interface CueLayout {
  lines: { from: number; to: number; width: number; baseline: number }[];
  words: { x: number; baseline: number; width: number; italic: boolean; line: number }[];
  box: { width: number; height: number };
  emphasis: { left: number; right: number; baseline: number } | null;
}

/**
 * Where each word of a line goes: broken into as few lines as fit the width,
 * as even as they can be made (the emphasis phrase is never broken), each
 * line centred, the block centred on the caption's middle.
 */
export function layoutCue(
  cue: Cue,
  geometry: CaptionGeometry,
  { measure, ascent, descent }: LayoutFaces,
): CueLayout {
  const { em, pitch, maxWidth, centreX, centreY } = geometry;
  const words = cue.words;
  const count = words.length;
  if (!count) return { lines: [], words: [], box: { width: 0, height: 0 }, emphasis: null };
  const inPhrase = (index: number) =>
    cue.emphasis !== null && index >= cue.emphasis[0] && index < cue.emphasis[1];
  const widths = words.map((word, index) => measure(word.text, inPhrase(index)));
  const spaces = words.map((_, index) => measure(" ", inPhrase(index)));
  // A line's width from word a to word b (exclusive).
  const lineWidth = (a: number, b: number) => {
    let total = 0;
    for (let index = a; index < b; index += 1)
      total += widths[index]! + (index < b - 1 ? spaces[index]! : 0);
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
    while (end < units && lineWidth(stops[at]!, stops[end + 1]!) <= maxWidth) end += 1;
    at = end;
  }
  // ...then the most even split into that many: the widest line as narrow as
  // it can be, then the lines as alike as they can be. best[left][at] is the
  // best split of the words from stops[at] on into `left` lines.
  type Choice = { widest: number; squares: number; next: number };
  const best: (Choice | null)[][] = Array.from({ length: fewest + 1 }, () =>
    new Array<Choice | null>(units + 1).fill(null),
  );
  best[0]![units] = { widest: 0, squares: 0, next: units };
  for (let left = 1; left <= fewest; left += 1) {
    for (let at = units - 1; at >= 0; at -= 1) {
      let choice: Choice | null = null;
      for (let end = at + 1; end <= units; end += 1) {
        const width = lineWidth(stops[at]!, stops[end]!);
        if (width > maxWidth && end - at > 1) break;
        const rest = best[left - 1]![end];
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
      best[left]![at] = choice;
    }
  }
  const breaks = [0];
  for (let at = 0, left = fewest; left > 0; left -= 1) {
    at = best[left]![at]!.next;
    breaks.push(stops[at]!);
  }
  const lineCount = breaks.length - 1;
  const top = centreY - (lineCount * pitch) / 2;
  const lines: CueLayout["lines"] = [];
  const placed: CueLayout["words"] = new Array(count);
  for (let line = 0; line < lineCount; line += 1) {
    const from = breaks[line]!;
    const to = breaks[line + 1]!;
    const width = lineWidth(from, to);
    const baseline = top + line * pitch + (pitch - (ascent + descent) * em) / 2 + ascent * em;
    let x = centreX - width / 2;
    for (let index = from; index < to; index += 1) {
      placed[index] = { x, baseline, width: widths[index]!, italic: inPhrase(index), line };
      x += widths[index]! + spaces[index]!;
    }
    lines.push({ from, to, width, baseline });
  }
  const emphasis =
    cue.emphasis === null
      ? null
      : {
          left: placed[cue.emphasis[0]]!.x,
          right: placed[cue.emphasis[1] - 1]!.x + placed[cue.emphasis[1] - 1]!.width,
          baseline: placed[cue.emphasis[0]]!.baseline,
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
export const CAPTION_PANELS = ["auto", "light", "dark", "solid", "none"] as const;
export type CaptionPanel = (typeof CAPTION_PANELS)[number];

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
export function luminance(hex: string): number {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** How far apart two colours read (WCAG contrast ratio, 1 to 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/**
 * How opaque the glass is over a picture of this lightness (0 dark to 1
 * light; null when it wasn't measured): the site's 74% over a dark picture,
 * up to 93% over a white page, where Reel 1 found 74% read as a grey slab.
 */
export function glassOpacity(backdrop: number | null | undefined): number {
  if (backdrop === null || backdrop === undefined) return 0.88;
  return 0.74 + 0.19 * Math.min(1, Math.max(0, (backdrop - 0.25) / 0.35));
}

/** A picture this light or lighter takes the light card, where the panel follows the picture. */
export const LIGHT_BACKDROP = 0.6;

export interface PanelLook {
  kind: "light" | "dark" | "solid" | "none";
  fill: string | null;
  fillOpacity: number;
  stroke: string | null;
  strokeOpacity: number;
  ink: string;
  emphasis: string;
  hairline: string;
  /** Whether the light passes across the emphasis (not on a light panel, where it wouldn't show). */
  light: boolean;
}

/**
 * The panel behind a run of lines, and the colours its words are set in:
 * the material, its fill and border, the words' ink, the emphasis colour, the
 * hairline's, and whether the light passes across the emphasis. The ink and
 * emphasis are the edit's own colours wherever they read on the panel, else
 * the material's.
 */
export function panelLook(
  panel: CaptionPanel | null | undefined,
  backdrop: number | null | undefined,
  {
    color = null,
    accent = null,
    panelColor = null,
  }: { color?: string | null; accent?: string | null; panelColor?: string | null } = {},
): PanelLook {
  const kind: PanelLook["kind"] =
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
          stroke: CARD.stroke as string | null,
          strokeOpacity: CARD.strokeOpacity,
          ink: CARD.ink,
        }
      : kind === "dark"
        ? {
            fill: GLASS.fill,
            fillOpacity: glassOpacity(backdrop),
            stroke: GLASS.stroke as string | null,
            strokeOpacity: GLASS.strokeOpacity,
            ink: GLASS.ink,
          }
        : (() => {
            const fill = panelColor ?? accent ?? "#0b1020";
            return {
              fill,
              fillOpacity: 1,
              stroke: null as string | null,
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

export interface PlannedCue extends ScheduledCue {
  index: number;
  layout: CueLayout;
  look: PanelLook;
}

export interface BrandCaptionPlan {
  geometry: CaptionGeometry;
  cues: PlannedCue[];
}

/**
 * Brand captions laid out and scheduled: each line with its words' times,
 * its layout, and the look of its run's panel. `cuts` are the times the
 * picture's palette changes at, and `lookOf(run)` the look of a run's panel,
 * given its lines' indexes (see `panelLook`).
 */
export function planBrandCaptions(
  lines: BrandLine[],
  {
    geometry,
    faces,
    cuts = [],
    lookOf,
  }: {
    geometry: CaptionGeometry;
    faces: LayoutFaces;
    cuts?: number[];
    lookOf: (run: number[]) => PanelLook;
  },
): BrandCaptionPlan {
  const cues = scheduleCues(lines.map(timedCue), cuts);
  const looks = new Map<number, PanelLook>();
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
      look: looks.get(cue.first)!,
    })),
  };
}

/** Each word's state at t: how far in it is, its rise and blur (in ems), and how far its line has left. */
export function wordState(
  cue: ScheduledCue,
  index: number,
  t: number,
): { opacity: number; rise: number; blur: number; leaving: number } | null {
  const { enter, lead } = MOTION;
  if (!(t >= cue.start - 0.1 && t < cue.gone)) return null;
  const word = cue.words[index]!;
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
function emphasisIn(cue: ScheduledCue, share: number): number {
  const last = cue.words[cue.emphasis![1] - 1]!;
  return Math.max(cue.appear ?? cue.start, last.at - MOTION.lead) + MOTION.enter * share;
}

/** The light's slices across its band, from its leading edge: how bright each is. */
const SLICES = [0.18, 0.54, 0.9, 0.54, 0.18];

export interface CaptionFrameState {
  panel: {
    run: number;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    look: PanelLook;
  } | null;
  words: {
    cue: number;
    index: number;
    text: string;
    x: number;
    baseline: number;
    italic: boolean;
    colour: string;
    opacity: number;
    rise: number;
    blur: number;
  }[];
  hairlines: {
    cue: number;
    x: number;
    y: number;
    width: number;
    height: number;
    colour: string;
    opacity: number;
  }[];
  lights: {
    cue: number;
    index: number;
    slice: number;
    x0: number;
    x1: number;
    colour: string;
    opacity: number;
  }[];
}

/**
 * What is on the frame at t: the panel, each word (its place, ink, and how
 * far in it is: `rise` and `blur` are in ems, the rise downward), the
 * hairline under each emphasis, and the slices of light passing across it
 * (each word's copy in the light, between two edges across the frame).
 */
export function captionFrame(plan: BrandCaptionPlan, t: number): CaptionFrameState {
  const { geometry, cues } = plan;
  const { em, padX, padY, centreX, centreY } = geometry;
  const frame: CaptionFrameState = { panel: null, words: [], hairlines: [], lights: [] };

  // The panel: in with its run's first line, from one line's size to the
  // next's, out after its last. At a palette cut one run's panel has gone
  // before the next one's arrives.
  const run = cues.find(
    (cue) => cue.first === cue.index && t >= cue.start - 0.2 && t < cue.panelGone!,
  );
  if (run && run.look.kind !== "none") {
    const lines = cues.filter((cue) => cue.first === run.index);
    let current = lines[0]!;
    for (const cue of lines) if (t >= cue.start - 0.06) current = cue;
    const previous = lines[lines.indexOf(current) - 1];
    const size = (cue: PlannedCue) => [
      cue.layout.box.width + 2 * padX,
      cue.layout.box.height + 2 * padY,
    ];
    const p = previous ? span(t, current.start - 0.06, current.start + 0.3, EASE.move) : 1;
    const [w, h] = (
      previous
        ? size(previous).map((value, k) => value + (size(current)[k]! - value) * p)
        : size(current)
    ) as [number, number];
    // It leads its first line by 0.08 s, but never into the time before the edit begins.
    const enter = Math.max(0, run.start - 0.08);
    const shown = Math.min(
      span(t, enter, run.start + 0.24, EASE.settle),
      1 - span(t, run.panelGone! - 0.3, run.panelGone!, EASE.move),
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
      const place = layout.words[index]!;
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
        const place = layout.words[word.index]!;
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

/* ------------------------------------------------------------------ */
/* A line's words and emphasis (the app's)                             */
/* ------------------------------------------------------------------ */

/** A word as compared: lower case, letters and digits only ("Aurixa's," → "aurixas"). */
function keyOf(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const ms = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A word as the media service sets it: without control characters, or the
 * braces and backslashes that mean something in a subtitle file, and at most
 * 80 characters (see media-worker/src/sequence.js cleanText).
 */
function cleanWord(text: string): string {
  return [...text]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x1f && code !== 0x7f && char !== "{" && char !== "}" && char !== "\\";
    })
    .join("")
    .trim()
    .slice(0, 80);
}

/**
 * A caption line's words, each with its time from the line's start, as the
 * brand style draws them: the times kept with it (measured from its
 * voiceover) matched to its text as it now reads, else spread evenly. A word
 * edited since takes the time of the word it replaced (in a line with as
 * many words), else of the kept word it matches; one added takes a share of
 * the time between its neighbours.
 */
export function segmentWords(
  segment: Pick<CaptionSegment, "start" | "end" | "text" | "words">,
): LineWord[] {
  // Words as the media service sets them: one it would empty is left out.
  const texts = segment.text.split(/\s+/).map(cleanWord).filter(Boolean);
  const duration = Math.max(0, segment.end - segment.start);
  const kept = (segment.words ?? [])
    .map((word) => ({ ...word, text: cleanWord(word.text) }))
    .filter((word) => word.text);
  if (!texts.length) return [];
  if (!kept.length)
    return evenWords(texts.join(" "), duration).map((word) => ({
      ...word,
      start: ms(word.start),
      end: ms(word.end),
    }));
  const timed: (LineWord | null)[] = new Array(texts.length).fill(null);
  if (kept.length === texts.length) {
    texts.forEach((text, index) => {
      const word = kept[index]!;
      timed[index] = { text, start: word.start, end: word.end };
    });
  } else {
    // The longest run of words the two have in common, in order.
    const a = texts.map(keyOf);
    const b = kept.map((word) => keyOf(word.text));
    const table = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i -= 1)
      for (let j = b.length - 1; j >= 0; j -= 1)
        table[i]![j] =
          a[i] && a[i] === b[j]
            ? table[i + 1]![j + 1]! + 1
            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] && a[i] === b[j]) {
        timed[i] = { text: texts[i]!, start: kept[j]!.start, end: kept[j]!.end };
        i += 1;
        j += 1;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
      else j += 1;
    }
  }
  // Words with no time of their own share out the time between their neighbours, by length.
  for (let index = 0; index < texts.length;) {
    if (timed[index]) {
      index += 1;
      continue;
    }
    let stop = index;
    while (stop < texts.length && !timed[stop]) stop += 1;
    const from = index > 0 ? timed[index - 1]!.end : 0;
    const to = stop < texts.length ? timed[stop]!.start : Math.max(from, duration * 0.85);
    const lengths = texts.slice(index, stop).map((text) => text.length + 1);
    const total = lengths.reduce((sum, value) => sum + value, 0);
    let cursor = from;
    for (let k = index; k < stop; k += 1) {
      const share = (Math.max(0, to - from) * lengths[k - index]!) / total;
      timed[k] = { text: texts[k]!, start: cursor, end: cursor + share };
      cursor += share;
    }
    index = stop;
  }
  // Within the line, and never before the word before.
  let last = 0;
  return (timed as LineWord[]).map((word) => {
    const start = Math.min(Math.max(word.start, last, 0), duration);
    last = start;
    return {
      text: word.text,
      start: ms(start),
      end: ms(Math.min(Math.max(word.end, start), duration)),
    };
  });
}

/** The words [from, to) of a line its emphasis phrase is, or null where the phrase isn't in it. */
export function emphasisRange(
  words: readonly string[],
  phrase: string | null | undefined,
): [number, number] | null {
  const wanted = (phrase ?? "").split(/\s+/).map(keyOf).filter(Boolean);
  if (!wanted.length) return null;
  const keys = words.map(keyOf);
  for (let from = 0; from + wanted.length <= keys.length; from += 1)
    if (wanted.every((key, offset) => keys[from + offset] === key))
      return [from, from + wanted.length];
  return null;
}

/** Words that carry a phrase's grammar rather than its meaning, which an emphasis never rests on. */
const FUNCTION_WORDS = new Set(
  (
    "a an the and or but nor so yet to of in on at for with by from as into onto over under about " +
    "is are was were be been being am it its it's this that these those your you you're you've we " +
    "we're we've our they they're they've their them he she his her him i i'm i've my me us not no " +
    "if then than can will would should could do does did has have had just what what's which who " +
    "whom how why when where there there's that's let's"
  )
    .split(" ")
    .map(keyOf),
);

/**
 * The phrase a line leans on, where none is chosen: a brand name in it,
 * else where English puts a phrase's stress, at its end: its last word that
 * carries meaning, the meaningful word before it (or the one before that,
 * across a little word: "time to act."), and the little words that close
 * the line after it ("right for them,"). At most three words, and never the
 * whole line; null for a line of one word.
 */
export function emphasisFor(
  words: readonly string[],
  terms: readonly string[] = [],
): string | null {
  if (words.length < 2) return null;
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const range = emphasisRange(words, term);
    if (range && range[1] - range[0] < words.length) return words.slice(...range).join(" ");
  }
  const meaningful = (index: number) => {
    const key = keyOf(words[index] ?? "");
    return !!key && !FUNCTION_WORDS.has(key);
  };
  let last = words.length - 1;
  while (last >= 0 && !meaningful(last)) last -= 1;
  if (last < 0) return null;
  let from = last;
  if (last >= 1 && meaningful(last - 1)) from = last - 1;
  else if (last >= 2 && meaningful(last - 2)) from = last - 2;
  let to = words.length;
  if (to - from > 3) from = Math.min(last, to - 3);
  if (to - from > 3) to = from + 3;
  if (from === 0 && to === words.length) from = Math.min(last, 1);
  // It starts on a word that carries meaning ("Australia,", not "in Australia,").
  while (from < last && !meaningful(from)) from += 1;
  return from < to ? words.slice(from, to).join(" ") : null;
}
