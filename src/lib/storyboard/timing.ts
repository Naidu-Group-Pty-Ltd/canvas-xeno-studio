/**
 * A storyboard timed from the measured voice: where each shot's cut falls,
 * found from a prepared voiceover's words and speech rather than estimated.
 *
 * Reel 1's prompt pack timed its cues in proportion to the script, and they
 * drifted from the recording by up to 2.6 s. The fix was a rule, written in
 * scripts/aurixa-reel-1/timing.py and used for every cut of the film: a cut
 * sits in the pause before its cue's first word, 0.15 s ahead of where the
 * word's sound begins (but never closer than 0.04 s to the speech before it),
 * or 0.1 s ahead when the speech before runs straight into it; then back to
 * the frame it falls in. Each shot names its cue (the words it starts on),
 * and its start and length follow from the cues.
 *
 * Beside the cuts, a music track's beats and bars, so a person can see which
 * cuts already land on the music and which don't.
 *
 * Pure functions, shared by the Storyboards page and tests.
 */
import { musicStructureSchema } from "../music/structure";
import type { TimedWord } from "../lip-sync/segments";

/** The rule's numbers: timing.py's, which cut Reel 1. */
export const CUT_RULE = {
  /** A cut in a pause sits this far ahead of the speech onset... */
  leadSeconds: 0.15,
  /** ...but at least this long after the speech before it ends. */
  afterSpeechSeconds: 0.04,
  /** Speech closer than this to the speech before is one phrase: no pause to cut in. */
  pauseSeconds: 0.05,
  /** Mid-phrase, a cut sits this far ahead of the word. */
  midPhraseLeadSeconds: 0.1,
  /**
   * Word timings are rough: the word's sound begins where a stretch of
   * speech opens, from a little before the word before it ended...
   */
  onsetBeforeSeconds: 0.1,
  /** ...to a little after the word's own start. */
  onsetAfterSeconds: 0.15,
} as const;

/** Speech, as [start, end] seconds (what a prepared voiceover's analysis found). */
export type Speech = [number, number][];

/**
 * Where a cut sits against the speech: in a pause before its word; at a
 * join, where the speech before runs into the word with no pause; or in
 * speech, where the word comes in the middle of a stretch of speech (the
 * cut then goes through it, 0.15 s ahead of the word).
 */
export type CutPlace = "pause" | "join" | "speech";

export const CUT_PLACE_LABELS: Record<CutPlace, string> = {
  pause: "In the pause",
  join: "Mid-phrase",
  speech: "Through speech",
};

export interface VoiceCut {
  /** The frame the cut falls on. */
  frame: number;
  /** The cut, in seconds on the voiceover's clock (on the frame grid). */
  seconds: number;
  /** Where the cue's sound begins. */
  onset: number;
  place: CutPlace;
}

const round6 = (value: number) => Number(value.toFixed(6));

/** Speech segments in order of their start (a copy). */
function ordered(speech: Speech): Speech {
  return [...speech].sort((a, b) => a[0] - b[0]);
}

/**
 * Speech from the words alone, for a voiceover whose analysis found none:
 * each word, joined to the next when nothing parts them.
 */
export function speechFromWords(words: TimedWord[]): Speech {
  const out: Speech = [];
  for (const word of [...words].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && word.start - last[1] < CUT_RULE.pauseSeconds) last[1] = Math.max(last[1], word.end);
    else out.push([word.start, Math.max(word.start, word.end)]);
  }
  return out;
}

/**
 * Where a word's sound begins: the start of a stretch of speech that opens
 * after the word before it ended (word timings are rough, so from a tenth of
 * a second before that to 0.15 s after the word's own start), else the
 * word's own start. The first word's "word before" ends at 0.
 */
export function speechOnset(words: TimedWord[], index: number, speech: Speech): number {
  const word = words[index];
  if (!word) throw new RangeError(`There is no word ${index}`);
  const before = Math.min(index > 0 ? words[index - 1]!.end : 0, word.start);
  for (const [from] of ordered(speech)) {
    if (
      from >= before - CUT_RULE.onsetBeforeSeconds &&
      from <= word.start + CUT_RULE.onsetAfterSeconds
    )
      return from;
  }
  return word.start;
}

/** The cut before a word: the rule above, on the frame it falls in. */
export function cutBeforeWord(
  words: TimedWord[],
  index: number,
  speech: Speech,
  fps: number,
): VoiceCut {
  const onset = speechOnset(words, index, speech);
  // The speech before: the latest stretch that has ended by the onset.
  let previousEnd = 0;
  for (const [, to] of speech) if (to <= onset + 1e-6 && to > previousEnd) previousEnd = to;
  const joined = onset - previousEnd < CUT_RULE.pauseSeconds;
  const at = joined
    ? onset - CUT_RULE.midPhraseLeadSeconds
    : Math.max(previousEnd + CUT_RULE.afterSpeechSeconds, onset - CUT_RULE.leadSeconds);
  // Floored as timing.py floors it: the frame the moment falls in, never one after it.
  const frame = Math.max(0, Math.floor(at * fps));
  const inSpeech = speech.some(([from, to]) => from < onset && onset < to);
  return {
    frame,
    seconds: round6(frame / fps),
    onset,
    place: joined ? "join" : inSpeech ? "speech" : "pause",
  };
}

/* ------------------------------------------------------------------ */
/* Finding a cue in the words                                          */
/* ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
};

/**
 * Words to compare, from a script line or a recogniser's word: lower case,
 * without accents, punctuation or apostrophes ("it's" is "its"), split at
 * hyphens and dashes ("14-day" is "14 day"), numbers as digits ("Fourteen"
 * is "14").
 */
export function wordTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((token) => token.replace(/'/g, ""))
    .filter(Boolean)
    .map((token) => NUMBER_WORDS[token] ?? token);
}

/** Edit distance between two words, giving up past `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Whether a script's word and a recogniser's are the same word: equal, a
 * plural of it, or (for words of four letters or more) a letter or two
 * apart, as a recogniser spells names and variants ("Arixa" for "Aurixa",
 * "judgment" for "judgement").
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b || a === `${b}s` || b === `${a}s`) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  const allowed = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return distance(a, b, allowed) <= allowed;
}

/** How many of a cue's first words are compared with the voiceover's. */
const CUE_WORDS = 6;

export interface CueMatch {
  /** The measured word the cue starts on. */
  index: number;
  /** Of the cue's first words compared, how many were found in order. */
  matched: number;
  compared: number;
}

/**
 * Where a cue (the words a shot starts on) is spoken: the measured word its
 * first words start at, searching from word `from` on. Its first word must
 * be there; of its first few words, at least three in five must follow in
 * order (a recogniser drops and adds words). The best match wins, the
 * earliest of equals. Null when it isn't spoken there.
 */
export function findCue(words: TimedWord[], cue: string, from = 0): CueMatch | null {
  const wanted = wordTokens(cue).slice(0, CUE_WORDS);
  if (!wanted.length) return null;
  // Every token of the voiceover, with the word it came from.
  const tokens: { token: string; word: number }[] = [];
  words.forEach((word, index) => {
    for (const token of wordTokens(word.text)) tokens.push({ token, word: index });
  });
  const needed = Math.max(1, Math.ceil(wanted.length * 0.6));
  let best: CueMatch | null = null;
  for (let start = 0; start < tokens.length; start += 1) {
    if (tokens[start]!.word < from || !sameWord(wanted[0]!, tokens[start]!.token)) continue;
    // The longest run of the cue's words found in order in a window a word longer than it.
    const window = tokens.slice(start, start + wanted.length + 1).map((entry) => entry.token);
    const table = Array.from({ length: wanted.length + 1 }, () =>
      new Array<number>(window.length + 1).fill(0),
    );
    for (let i = 1; i <= wanted.length; i += 1)
      for (let j = 1; j <= window.length; j += 1)
        table[i]![j] = sameWord(wanted[i - 1]!, window[j - 1]!)
          ? table[i - 1]![j - 1]! + 1
          : Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
    const matched = table[wanted.length]![window.length]!;
    if (matched >= needed && (!best || matched > best.matched))
      best = { index: tokens[start]!.word, matched, compared: wanted.length };
    if (best && best.matched === wanted.length) break;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Shots from their cues                                               */
/* ------------------------------------------------------------------ */

export interface CuedShot {
  id: string;
  /** The words it starts on; null for a shot that starts where the one before ends. */
  cue: string | null;
  /** Its length now: kept for a shot with no cue, and to show how far the voice moves it. */
  seconds?: number | null;
}

/**
 * How a shot's start was found: the first shot starts the edit; "voice": a
 * cut before its cue's first word; "kept": it has no cue (or its cue isn't
 * spoken), so it starts where the shot before ends at that shot's own length.
 */
export type ShotTiming = "first" | "voice" | "kept";

export interface TimedShot {
  id: string;
  cue: string | null;
  timing: ShotTiming;
  startFrame: number;
  endFrame: number;
  /** Seconds on the voiceover's clock, on the frame grid. */
  start: number;
  end: number;
  seconds: number;
  /** The measured word its cue starts on, where it was found. */
  wordIndex: number | null;
  word: string | null;
  /** Where that word's sound begins, and where the cut sits against the speech. */
  onset: number | null;
  place: CutPlace | null;
  /** How far the voice moves its start from where its present length puts it (seconds). */
  drift: number | null;
  /** What a person should look at, in plain words; null when nothing. */
  problem: string | null;
}

export interface VoiceTimingInput {
  shots: CuedShot[];
  words: TimedWord[];
  /** The voiceover's speech; empty: found from the words. */
  speech: Speech;
  fps: number;
  /** The voiceover's length: the last shot runs to its end. */
  durationSeconds: number;
}

export interface VoiceTiming {
  shots: TimedShot[];
  fps: number;
  /** Where the last shot ends (the voiceover's end, on the frame grid). */
  end: number;
  /** How many shots were timed from their cue. */
  timed: number;
}

/** Seconds a shot with neither a cue nor a length is given. */
const DEFAULT_SHOT_SECONDS = 3;

const quote = (text: string) => `“${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`;

/**
 * Every shot's start and length from the cues: the first shot starts at 0,
 * each shot whose cue is spoken starts on the cut before its first word,
 * and each shot runs to the next one's start (the last to the voiceover's
 * end). Cues are looked for in order, each after the one before.
 */
export function timeShotsFromVoice(input: VoiceTimingInput): VoiceTiming {
  const { fps, words } = input;
  const speech = input.speech.length ? input.speech : speechFromWords(words);
  const endFrame = Math.max(1, Math.ceil(input.durationSeconds * fps - 1e-6));
  let from = 0;
  let presentStart = 0;
  const starts: {
    frame: number;
    timing: ShotTiming;
    match: CueMatch | null;
    cut: VoiceCut | null;
    problem: string | null;
    present: number;
  }[] = [];
  input.shots.forEach((shot, index) => {
    const cue = shot.cue?.trim() || null;
    const match = cue ? findCue(words, cue, from) : null;
    if (match) from = match.index + 1;
    const cut = match ? cutBeforeWord(words, match.index, speech, fps) : null;
    const previous = starts.at(-1);
    const present = presentStart;
    presentStart += Number(shot.seconds ?? 0) > 0 ? Number(shot.seconds) : DEFAULT_SHOT_SECONDS;
    if (index === 0 || !previous) {
      starts.push({ frame: 0, timing: "first", match, cut, problem: null, present });
      return;
    }
    const before = input.shots[index - 1]!;
    const keptFrame =
      previous.frame +
      Math.max(
        1,
        Math.round(
          (Number(before.seconds ?? 0) > 0 ? Number(before.seconds) : DEFAULT_SHOT_SECONDS) * fps,
        ),
      );
    if (cut && cut.frame > previous.frame) {
      starts.push({ frame: cut.frame, timing: "voice", match, cut, problem: null, present });
      return;
    }
    const problem = !cue
      ? null
      : !match
        ? `Its cue ${quote(cue)} isn't in the voiceover after the shot before's.`
        : `Its cue ${quote(cue)} is spoken before the shot before starts.`;
    starts.push({
      frame: keptFrame,
      timing: "kept",
      match: cut ? match : null,
      cut: null,
      problem,
      present,
    });
  });

  // Starts only ever move on (a cut must come after the shot before's start, and a kept
  // shot follows the one before), so each shot runs to the next one's start.
  const shots: TimedShot[] = input.shots.map((shot, index) => {
    const entry = starts[index]!;
    const next = starts[index + 1];
    const stop = next ? next.frame : Math.max(endFrame, entry.frame + 1);
    const start = round6(entry.frame / fps);
    return {
      id: shot.id,
      cue: shot.cue?.trim() || null,
      timing: entry.timing,
      startFrame: entry.frame,
      endFrame: stop,
      start,
      end: round6(stop / fps),
      seconds: round6((stop - entry.frame) / fps),
      wordIndex: entry.match?.index ?? null,
      word: entry.match ? (words[entry.match.index]?.text ?? null) : null,
      onset: entry.cut?.onset ?? null,
      place: entry.cut?.place ?? null,
      drift: entry.timing === "voice" ? round6(start - entry.present) : null,
      problem:
        entry.problem ?? (entry.frame >= endFrame ? "It starts after the voiceover ends." : null),
    };
  });
  return {
    shots,
    fps,
    end: round6(Math.max(endFrame, shots.at(-1)?.endFrame ?? 0) / fps),
    timed: shots.filter((shot) => shot.timing === "voice").length,
  };
}

/* ------------------------------------------------------------------ */
/* The music beside the cuts                                           */
/* ------------------------------------------------------------------ */

/** A track's beat grid on the voiceover's clock: every beat, and the bars' first beats where known. */
export interface MusicGrid {
  beats: number[];
  /** Bar lines (downbeats); empty when the track's analysis has no structure. */
  bars: number[];
  bpm: number | null;
}

const times = (value: unknown): number[] =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          if (typeof entry === "number") return entry;
          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            const at = record["start"] ?? record["at"] ?? record["time"];
            return typeof at === "number" ? at : Number.NaN;
          }
          return Number.NaN;
        })
        .filter((at) => Number.isFinite(at) && at >= 0)
    : [];

/**
 * A track's bars from its analysed structure (music_tracks.structure, when
 * the analysis has found one): its `bars` (bar start times, or objects with
 * a start), else its `downbeats`. Empty when it has neither.
 */
export function barsFromStructure(structure: unknown): number[] {
  if (!structure || typeof structure !== "object") return [];
  const record = structure as Record<string, unknown>;
  const bars = times(record["bars"]);
  return [...new Set(bars.length ? bars : times(record["downbeats"]))].sort((a, b) => a - b);
}

/**
 * The music's grid where it plays under the voiceover: `offsetSeconds` is
 * where the track's own start falls on the voiceover's clock (negative to
 * come in part-way through the track).
 */
export function musicGrid(
  track: { bpm?: number | null; beats?: unknown; structure?: unknown },
  offsetSeconds = 0,
): MusicGrid {
  const shift = (list: number[]) =>
    list.map((at) => round6(at + offsetSeconds)).filter((at) => at >= 0);
  // A found structure's beats are moved onto their attacks, and its bars lie on
  // them (see ../music/structure): the track's own beat grid can be some 30 ms
  // off them, so the structure's are used where there is one.
  const structure = musicStructureSchema.safeParse(track.structure ?? null);
  const beats = structure.success ? structure.data.beats : times(track.beats);
  const bpm = structure.success
    ? structure.data.bpm
    : typeof track.bpm === "number" && track.bpm > 0
      ? track.bpm
      : null;
  return {
    beats: shift(beats).sort((a, b) => a - b),
    bars: shift(barsFromStructure(track.structure ?? null)),
    bpm,
  };
}

export interface GridMark {
  kind: "bar" | "beat";
  /** The beat or bar line nearest the cut. */
  at: number;
  /** Its number, from 1. */
  number: number;
  /** The cut's distance from it: positive when the cut comes after it (seconds). */
  offset: number;
}

function nearest(list: number[], time: number): { at: number; index: number } | null {
  if (!list.length) return null;
  let low = 0;
  let high = list.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (list[middle]! < time) low = middle + 1;
    else high = middle;
  }
  const after = low;
  const before = Math.max(0, low - 1);
  const index = Math.abs(list[before]! - time) <= Math.abs(list[after]! - time) ? before : after;
  return { at: list[index]!, index };
}

/**
 * The beat or bar line nearest a cut: a bar line when one is as near as
 * the nearest beat (within a millisecond), else the beat. Null without beats.
 */
export function nearestOnGrid(time: number, grid: MusicGrid): GridMark | null {
  const beat = nearest(grid.beats, time);
  const bar = nearest(grid.bars, time);
  if (bar && (!beat || Math.abs(bar.at - time) <= Math.abs(beat.at - time) + 1e-3))
    return { kind: "bar", at: bar.at, number: bar.index + 1, offset: round6(time - bar.at) };
  if (!beat) return null;
  return { kind: "beat", at: beat.at, number: beat.index + 1, offset: round6(time - beat.at) };
}

/**
 * "On bar 12", "0.08 s after beat 57": where a cut sits on the music. A cut
 * within a frame of a beat is on it, since a cut can only fall on a frame.
 */
export function describeGridMark(mark: GridMark, fps: number): string {
  const name = `${mark.kind} ${mark.number}`;
  if (Math.abs(mark.offset) <= 1 / fps + 1e-6) return `On ${name}`;
  const seconds = Math.abs(mark.offset).toFixed(2);
  return `${seconds} s ${mark.offset > 0 ? "after" : "before"} ${name}`;
}
