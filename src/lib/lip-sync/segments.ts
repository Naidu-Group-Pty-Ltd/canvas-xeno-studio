/**
 * Where a voiceover is cut into clips.
 *
 * Each clip is made from its own piece of the voiceover, and the model moves
 * the lips to that piece from the clip's first frame. So a cut is only ever
 * put where nobody is speaking (in a pause, best of all at the end of a
 * sentence), on the frame grid the edit plays at, so that the clips laid end
 * to end in the edit start exactly where their pieces start in the voiceover,
 * with no rounding to build up from clip to clip.
 *
 * Among all the ways to cut it, the plan is the cheapest: each clip costs
 * something (fewer joins read better), a cut costs more the worse its place
 * (a sentence end costs nothing, a short pause more, a gap between two words
 * more again, and a cut through speech, only where no pause comes within a
 * clip's length, most of all), a very short clip costs more, and so does
 * every second asked of the model and then cut off (billed and thrown away).
 *
 * Shared by the Create page (to show the plan), the server (to check and run
 * it) and tests, so all of them always agree.
 */
import { LIP_SYNC, longestSegmentFor, requestSecondsFor } from "./models";

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** What the media worker found in a prepared voiceover (see media-worker/src/voice.js). */
export interface VoiceoverTiming {
  durationSeconds: number;
  /** Speech, as [start, end] seconds. */
  speech: [number, number][];
  /** The pauses between, as [start, end] seconds. */
  pauses: [number, number][];
  /** False when speech couldn't be told from the rest of the sound: then no pause is trusted. */
  clearPauses: boolean;
  /** The waveform: `rate` values a second, 0-255. Used to find the quietest moment for a cut no pause offers. */
  envelope?: { rate: number; values: ArrayLike<number> } | null;
}

export type CutKind = "sentence" | "pause" | "word" | "forced";

export interface VoiceoverSegment {
  index: number;
  /** Seconds on the voiceover's own clock; every start is on the frame grid. */
  start: number;
  end: number;
  /** The clip length asked of the model for it: its model's shortest that holds it and the headroom. */
  requestSeconds: number;
  /** How the cut that ends it was placed ("end": it runs to the end of the voiceover). */
  cut: CutKind | "end";
}

export interface SegmentPlan {
  segments: VoiceoverSegment[];
  fps: number;
  /** Why there is no plan, in plain words; null when there is one. */
  problem: string | null;
}

export interface SegmentPlanInput {
  timing: VoiceoverTiming;
  words?: TimedWord[] | null;
  /** Clip lengths the first clip's model accepts. */
  firstChoices: number[];
  /** Clip lengths the later clips' model accepts. */
  laterChoices: number[];
  /** The longest clip asked for ("clips up to"). */
  maxClipSeconds?: number;
  fps?: number;
  headroomSeconds?: number;
  minSegmentSeconds?: number;
  maxClips?: number;
}

interface Candidate {
  at: number;
  kind: CutKind;
  penalty: number;
}

const EPSILON = 1e-6;
const SENTENCE_END = /[.!?…]["”’')\]]*$/;
const CLAUSE_END = /[,;:—–-]["”’')\]]*$/;

/** Cost of one more clip, and of each second asked for and cut off. */
const CLIP_COST = 1;
const WASTE_PER_SECOND = 0.15;
/** Clips shorter than this cost more, the shorter the more. */
const COMFORTABLE_SECONDS = 3;
const SHORT_PER_SECOND = 0.4;
/** A cut through speech: only where nothing better comes within a clip's length. */
const FORCED_PENALTY = 6;

const round6 = (value: number) => Number(value.toFixed(6));

/** A time on the frame grid. */
export function onGrid(seconds: number, fps: number): number {
  return round6(Math.round(seconds * fps) / fps);
}

/** The words a piece of voiceover holds (by where each word's middle falls). */
export function wordsIn(words: TimedWord[] | null | undefined, start: number, end: number) {
  return (words ?? []).filter((word) => {
    const middle = (word.start + word.end) / 2;
    return middle >= start - EPSILON && middle < end - EPSILON;
  });
}

/** What is said in a piece of voiceover, from its word timings. */
export function transcriptOf(
  words: TimedWord[] | null | undefined,
  start: number,
  end: number,
): string {
  return wordsIn(words, start, end)
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(" ");
}

/** The word that ends nearest before a moment (within a little either side). */
function wordEndingAt(words: TimedWord[], at: number): TimedWord | null {
  let best: TimedWord | null = null;
  for (const word of words) {
    if (word.end < at - 0.35 || word.end > at + 0.15) continue;
    if (!best || Math.abs(word.end - at) < Math.abs(best.end - at)) best = word;
  }
  return best;
}

/** Places to cut, from the pauses and (where there are word timings) the gaps between words. */
function candidates(
  input: Required<Pick<SegmentPlanInput, "fps">> & SegmentPlanInput,
): Candidate[] {
  const { timing, fps } = input;
  const words = input.words ?? [];
  const duration = timing.durationSeconds;
  const found: Candidate[] = [];
  const inside = (at: number) => at > EPSILON && at < duration - EPSILON;

  if (timing.clearPauses) {
    for (const [from, to] of timing.pauses) {
      // The silence before the first word and after the last stays with the first and last clips.
      if (from <= EPSILON || to >= duration - EPSILON) continue;
      const at = onGrid((from + to) / 2, fps);
      if (!(at > from && at < to) || !inside(at)) continue;
      const length = to - from;
      const before = words.length ? wordEndingAt(words, from) : null;
      if (before && SENTENCE_END.test(before.text.trim())) {
        found.push({ at, kind: "sentence", penalty: 0 });
        continue;
      }
      const clause = before && CLAUSE_END.test(before.text.trim()) ? 0.1 : 0;
      const penalty = (length >= 0.35 ? 0.15 : length >= 0.2 ? 0.35 : 0.6) - clause;
      found.push({ at, kind: "pause", penalty });
    }
  }

  // Gaps between words no pause already covers: the transcript's own timing.
  for (let index = 0; index + 1 < words.length; index += 1) {
    const left = words[index]!;
    const right = words[index + 1]!;
    const gap = right.start - left.end;
    if (!(gap >= 0.03)) continue;
    const at = onGrid((left.end + right.start) / 2, fps);
    if (!(at > left.end && at < right.start) || !inside(at)) continue;
    if (found.some((candidate) => Math.abs(candidate.at - at) < 0.12)) continue;
    const sentence = SENTENCE_END.test(left.text.trim());
    found.push({ at, kind: "word", penalty: sentence ? 0.5 : 0.9 });
  }

  // Cuts through speech, every quarter second at its quietest moment nearby:
  // what is left where no pause comes within a clip's length.
  const quietest = quietestNear(timing.envelope ?? null);
  for (let at = 0.25; at < duration - 0.25 + EPSILON; at += 0.25) {
    const moment = onGrid(quietest(at, 0.125), fps);
    if (!inside(moment)) continue;
    if (found.some((candidate) => Math.abs(candidate.at - moment) < 1 / fps / 2)) continue;
    found.push({ at: moment, kind: "forced", penalty: FORCED_PENALTY });
  }

  const unique = new Map<number, Candidate>();
  for (const candidate of found) {
    const key = Math.round(candidate.at * fps);
    const kept = unique.get(key);
    if (!kept || candidate.penalty < kept.penalty) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => a.at - b.at);
}

/** Finds the quietest moment of the waveform within `radius` of a time (the time itself without one). */
function quietestNear(envelope: VoiceoverTiming["envelope"]) {
  return (at: number, radius: number) => {
    if (!envelope || !envelope.values.length || !(envelope.rate > 0)) return at;
    const first = Math.max(0, Math.floor((at - radius) * envelope.rate));
    const last = Math.min(envelope.values.length - 1, Math.ceil((at + radius) * envelope.rate));
    let best = Math.min(Math.max(0, Math.round(at * envelope.rate)), envelope.values.length - 1);
    for (let bin = first; bin <= last; bin += 1)
      if ((envelope.values[bin] ?? 255) < (envelope.values[best] ?? 255)) best = bin;
    return (best + 0.5) / envelope.rate;
  };
}

/**
 * The plan: pieces of the voiceover, one per clip, end to end from its start
 * to its end. See the module comment for how the cuts are chosen.
 */
export function planVoiceoverSegments(input: SegmentPlanInput): SegmentPlan {
  const fps = input.fps ?? LIP_SYNC.gridFps;
  const headroom = input.headroomSeconds ?? LIP_SYNC.headroomSeconds;
  const minSegment = input.minSegmentSeconds ?? LIP_SYNC.minSegmentSeconds;
  const maxClips = input.maxClips ?? 40;
  const cap = input.maxClipSeconds ?? Infinity;
  const duration = input.timing.durationSeconds;
  const empty = (problem: string): SegmentPlan => ({ segments: [], fps, problem });

  if (!(duration > 0)) return empty("The voiceover has no length.");
  if (!input.firstChoices.length || !input.laterChoices.length)
    return empty("The model doesn't say what clip lengths it makes.");
  const longestFirst = longestSegmentFor(input.firstChoices, cap, headroom);
  const longestLater = longestSegmentFor(input.laterChoices, cap, headroom);
  if (!(longestFirst > 0) || !(longestLater > 0))
    return empty("The clips are too short to hold any of the voiceover.");

  const points = [
    { at: 0, kind: "forced" as CutKind, penalty: 0 },
    ...candidates({ ...input, fps }),
    { at: duration, kind: "forced" as CutKind, penalty: 0 },
  ];
  const last = points.length - 1;

  const plan = (clipCost: number) => {
    const cost = new Float64Array(points.length).fill(Infinity);
    const from = new Int32Array(points.length).fill(-1);
    const count = new Int32Array(points.length);
    cost[0] = 0;
    const reach = Math.max(longestFirst, longestLater);
    for (let j = 1; j <= last; j += 1) {
      for (let i = j - 1; i >= 0; i -= 1) {
        const length = points[j]!.at - points[i]!.at;
        if (length > reach + EPSILON) break;
        if (length > (i === 0 ? longestFirst : longestLater) + EPSILON) continue;
        if (!Number.isFinite(cost[i]!)) continue;
        // Too short a clip only where the whole voiceover is that short.
        if (length < minSegment - EPSILON && !(i === 0 && j === last)) continue;
        const request = requestSecondsFor(
          i === 0 ? input.firstChoices : input.laterChoices,
          length,
          headroom,
        );
        if (request === null || request > cap + EPSILON) continue;
        const short = Math.max(0, COMFORTABLE_SECONDS - length) * SHORT_PER_SECOND;
        const total =
          cost[i]! +
          clipCost +
          WASTE_PER_SECOND * (request - length) +
          short +
          (j === last ? 0 : points[j]!.penalty);
        if (total < cost[j]! - 1e-9) {
          cost[j] = total;
          from[j] = i;
          count[j] = count[i]! + 1;
        }
      }
    }
    return { cost, from, count };
  };

  // Fewer clips are made to count for more until the plan fits a long video.
  let result = plan(CLIP_COST);
  for (
    let weight = CLIP_COST * 4;
    Number.isFinite(result.cost[last]!) && result.count[last]! > maxClips && weight < 1e6;
    weight *= 4
  )
    result = plan(weight);
  if (!Number.isFinite(result.cost[last]!))
    return empty(
      "The voiceover can't be cut into clips this model makes. Allow longer clips, or use a shorter voiceover.",
    );
  if (result.count[last]! > maxClips) {
    const needed = Math.ceil(duration / longestLater);
    return empty(
      `This voiceover needs about ${needed} clips; a long video holds at most ${maxClips}. Allow longer clips, or shorten the voiceover.`,
    );
  }

  const chain: number[] = [];
  for (let at = last; at > 0; at = result.from[at]!) chain.unshift(at);
  chain.unshift(0);
  const segments: VoiceoverSegment[] = [];
  for (let index = 0; index + 1 < chain.length; index += 1) {
    const start = points[chain[index]!]!.at;
    const end = points[chain[index + 1]!]!.at;
    const choices = index === 0 ? input.firstChoices : input.laterChoices;
    segments.push({
      index,
      start: round6(start),
      end: round6(end),
      requestSeconds: requestSecondsFor(choices, end - start, headroom)!,
      cut: chain[index + 1] === last ? "end" : points[chain[index + 1]!]!.kind,
    });
  }
  return { segments, fps, problem: null };
}

/**
 * Checks a plan someone else made (the browser's, stored, or sent back)
 * against the voiceover and the models: pieces end to end from 0 to the end,
 * starts on the frame grid, each within its model's lengths. Problems in
 * plain words; empty when it holds.
 */
export function segmentProblems(
  segments: Pick<VoiceoverSegment, "start" | "end" | "requestSeconds">[],
  input: Pick<
    SegmentPlanInput,
    "firstChoices" | "laterChoices" | "headroomSeconds" | "maxClips"
  > & {
    durationSeconds: number;
    fps: number;
  },
): string[] {
  const problems: string[] = [];
  const headroom = input.headroomSeconds ?? LIP_SYNC.headroomSeconds;
  if (!segments.length) return ["There are no clips in the voiceover plan."];
  if (segments.length > (input.maxClips ?? 40))
    problems.push("The voiceover plan has too many clips.");
  if (Math.abs(segments[0]!.start) > EPSILON)
    problems.push("The first clip must start where the voiceover does.");
  if (Math.abs(segments.at(-1)!.end - input.durationSeconds) > 1e-3)
    problems.push("The last clip must end where the voiceover does.");
  segments.forEach((segment, index) => {
    const choices = index === 0 ? input.firstChoices : input.laterChoices;
    if (index > 0 && Math.abs(segment.start - segments[index - 1]!.end) > EPSILON)
      problems.push(`Clip ${index + 1} doesn't start where clip ${index} ends.`);
    if (Math.abs(segment.start * input.fps - Math.round(segment.start * input.fps)) > 1e-3)
      problems.push(`Clip ${index + 1} doesn't start on a frame.`);
    if (!(segment.end > segment.start)) problems.push(`Clip ${index + 1} has no length.`);
    if (!choices.includes(segment.requestSeconds))
      problems.push(`Clip ${index + 1}'s length isn't one its model makes.`);
    else if (segment.requestSeconds + EPSILON < segment.end - segment.start + headroom)
      problems.push(`Clip ${index + 1} is too short for its piece of the voiceover.`);
  });
  return problems;
}
