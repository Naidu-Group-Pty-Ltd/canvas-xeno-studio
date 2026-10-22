/**
 * Where a voiceover may be held open: its measured silences. A pause (see
 * voicePauseSchema in ./timeline) only ever goes where nobody speaks, as the
 * media service measured the recording when it was prepared (its speech, see
 * src/lib/lip-sync/analysis), and never inside a word the transcription
 * found, so no word is split or stretched. Reel 1's pacing kept the same rule
 * (in_silence in scripts/aurixa-reel-1/pacing.py).
 *
 * Pure, so the Editor (which offers only these silences) and the server
 * (which checks pauses sent through the API, and before a render) agree.
 */
import type { TimedWord } from "../lip-sync/segments";
import { LIMITS, sortedPauses, type VoicePause } from "./timeline";

/** A pause closer than this (seconds) to speech would take the edge off it. */
const SPEECH_EDGE = 0.005;
/** A word's own edges: a pause right where a word starts or ends doesn't split it. */
const WORD_EDGE = 0.005;
/**
 * The least of a word's measured sound (seconds) on each side of a pause for
 * the pause to split it. A transcription's word times are rough (Reel 1's ran
 * a word on 0.3 s into the silence after it), so a word is split only where
 * the measured speech says it sounds before the pause and after it, as a word
 * with a long stop in it does.
 */
const WORD_SOUND = 0.05;
/** The farthest a pause asked for off a silence is moved into one (seconds). */
export const PAUSE_SNAP_SECONDS = 0.25;
/** A silence at least this long (seconds) ends a sentence, when the words carry no full stop. */
const SENTENCE_GAP = 0.45;
/** A silence at least this long ends a phrase, when the words carry no comma. */
const PHRASE_GAP = 0.2;

/** What came before a silence: the end of a sentence, of a phrase, or a breath between words. */
export type SilenceKind = "start" | "sentence" | "phrase" | "breath";

export interface VoiceSilence {
  /** Where nobody speaks, on the recording's own clock (seconds). */
  from: number;
  to: number;
  /** Where its pause goes: the middle of the stretch no word overlaps. */
  at: number;
  kind: SilenceKind;
  /** The word just before it, for a person to know it by (null before the first). */
  after: string | null;
}

export interface MeasuredVoice {
  /** The recording's length, in seconds. */
  duration: number;
  /** Where someone speaks, as the media service found it. */
  speech: [number, number][];
  words: TimedWord[];
  silences: VoiceSilence[];
}

const round3 = (value: number) => Number(value.toFixed(3));

/**
 * A prepared voiceover's silences: the stretches between its speech (before
 * the first and after the last too), less any part a word overlaps (the
 * transcription's word times are rough), each with where its pause goes and
 * what kind of break it is. A recording whose speech couldn't be told from
 * the rest of its sound (`clear` false) has none: nowhere is safe to pause.
 */
export function measuredVoice(input: {
  duration: number;
  speech: [number, number][];
  words?: TimedWord[];
  clear?: boolean;
}): MeasuredVoice {
  // Speech that couldn't be told from the rest counts as speech throughout.
  const measured: [number, number][] =
    input.clear === false ? [[0, input.duration]] : [...input.speech];
  const speech = measured
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
    .sort((a, b) => a[0] - b[0]);
  const words = [...(input.words ?? [])]
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end))
    .sort((a, b) => a.start - b.start);
  const voice: MeasuredVoice = { duration: input.duration, speech, words, silences: [] };

  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [from, to] of speech) {
    if (from > cursor) gaps.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (input.duration > cursor) gaps.push([cursor, input.duration]);

  // Before the first word nothing can be split: its pause holds the opening.
  const lead = gaps[0]?.[0] === 0 ? gaps.shift()! : ([0, 0] as [number, number]);
  voice.silences.push({ from: 0, to: round3(lead[1]), at: 0, kind: "start", after: null });

  for (const [from, to] of gaps) {
    // Its pause goes in the middle of the longest stretch no word's rough
    // timing overlaps, or else the middle of the silence, if no word is split there.
    let best: [number, number] | null = null;
    let start = from;
    const overlapping = words.filter((word) => word.end > from && word.start < to);
    for (const word of [...overlapping, { text: "", start: to, end: to }]) {
      const end = Math.min(to, word.start);
      if (end > start && (!best || end - start > best[1] - best[0])) best = [start, end];
      start = Math.max(start, word.end);
    }
    const at = round3(best ? (best[0] + best[1]) / 2 : (from + to) / 2);
    if (pauseProblem(at, voice)) continue;
    const before =
      [...words].reverse().find((word) => word.end <= (best?.[0] ?? from) + WORD_EDGE) ?? null;
    voice.silences.push({
      from: round3(from),
      to: round3(to),
      at,
      kind: silenceKind(before, to - from, from <= 0),
      after: before?.text ?? null,
    });
  }
  return voice;
}

/** Seconds of measured speech between two moments. */
function speechWithin(speech: [number, number][], from: number, to: number): number {
  let total = 0;
  for (const [start, end] of speech)
    total += Math.max(0, Math.min(end, to) - Math.max(start, from));
  return total;
}

function silenceKind(before: TimedWord | null, length: number, first: boolean): SilenceKind {
  if (first || !before) return "start";
  const text = before.text.trim();
  if (/[.!?]["”’)]?$/.test(text)) return "sentence";
  if (/[,;:—–-]["”’)]?$/.test(text)) return length >= SENTENCE_GAP ? "sentence" : "phrase";
  if (length >= SENTENCE_GAP) return "sentence";
  return length >= PHRASE_GAP ? "phrase" : "breath";
}

/** Why a pause can't go at `at` (the recording's clock), in words a person can act on; null when it can. */
export function pauseProblem(at: number, voice: MeasuredVoice): string | null {
  // The recording's own start: nothing has been said yet.
  if (Math.abs(at) <= 1e-6) return null;
  const word = voice.words.find(
    (entry) =>
      at > entry.start + WORD_EDGE &&
      at < entry.end - WORD_EDGE &&
      speechWithin(voice.speech, entry.start, at) >= WORD_SOUND &&
      speechWithin(voice.speech, at, entry.end) >= WORD_SOUND,
  );
  if (word) return `it falls inside the word “${word.text}”`;
  const speaking = voice.speech.some(
    ([from, to]) => at > from - SPEECH_EDGE && at < to + SPEECH_EDGE,
  );
  if (speaking) return "it falls where someone is speaking";
  if (at > voice.duration + SPEECH_EDGE) return "it comes after the recording ends";
  return null;
}

/** The silence a pause at `at` sits in, if any. */
export function silenceAt(at: number, voice: MeasuredVoice): VoiceSilence | null {
  return (
    voice.silences.find(
      (silence) => at >= silence.from - SPEECH_EDGE && at <= silence.to + SPEECH_EDGE,
    ) ?? null
  );
}

/**
 * Where a pause asked for at `at` goes: there, if that is a silence; else
 * into the nearest silence within PAUSE_SNAP_SECONDS (at its pause point);
 * else nowhere (null).
 */
export function placePause(at: number, voice: MeasuredVoice): number | null {
  if (!pauseProblem(at, voice)) return at;
  let best: { at: number; distance: number } | null = null;
  for (const silence of voice.silences) {
    const distance = at < silence.from ? silence.from - at : at > silence.to ? at - silence.to : 0;
    if (distance <= PAUSE_SNAP_SECONDS && (!best || distance < best.distance))
      best = { at: silence.at, distance };
  }
  return best && !pauseProblem(best.at, voice) ? best.at : null;
}

export interface SettledPauses {
  pauses: VoicePause[];
  /** Pauses moved into the silence nearest them. */
  snapped: number;
  /** Pauses that couldn't go anywhere near where they were asked for, and why. */
  refused: { at: number; reason: string }[];
}

/** Pauses checked against the voice's silences: kept, snapped into one nearby, or refused. */
export function settlePauses(pauses: readonly VoicePause[], voice: MeasuredVoice): SettledPauses {
  const kept: VoicePause[] = [];
  const refused: SettledPauses["refused"] = [];
  let snapped = 0;
  for (const pause of pauses) {
    const placed = placePause(pause.at, voice);
    if (placed === null) {
      refused.push({
        at: pause.at,
        reason: pauseProblem(pause.at, voice) ?? "there's no silence there",
      });
      continue;
    }
    if (Math.abs(placed - pause.at) > 1e-6) snapped += 1;
    kept.push({ at: placed, frames: pause.frames });
  }
  return { pauses: sortedPauses(kept), snapped, refused };
}

/** What a person reads for a refused pause: where it was and why it can't go there. */
export function refusalMessage(refused: SettledPauses["refused"], title: string): string {
  const first = refused[0]!;
  const more = refused.length > 1 ? ` (and ${refused.length - 1} more)` : "";
  return `The voiceover “${title}” has a pause at ${first.at.toFixed(2)}s, but ${first.reason}${more}. A pause can only go in one of its silences: move it there or remove it.`;
}

/**
 * Quick pacing: `frames` of room in every silence after a sentence (or after
 * every phrase as well), on top of the pauses already there elsewhere. A
 * silence it adds to keeps one pause, at its pause point.
 */
export function breathingRoom(
  voice: MeasuredVoice,
  existing: readonly VoicePause[],
  options: { frames: number; after: "sentences" | "phrases" },
): VoicePause[] {
  const wanted = (kind: SilenceKind) =>
    kind === "sentence" || (options.after === "phrases" && kind === "phrase");
  const chosen = voice.silences.filter((silence) => wanted(silence.kind));
  const inChosen = (at: number) =>
    chosen.some((silence) => at >= silence.from - SPEECH_EDGE && at <= silence.to + SPEECH_EDGE);
  const frames = Math.max(1, Math.min(LIMITS.pauseFrames, Math.round(options.frames)));
  return sortedPauses([
    ...existing.filter((pause) => !inChosen(pause.at)),
    ...chosen.map((silence) => ({ at: silence.at, frames })),
  ]);
}
