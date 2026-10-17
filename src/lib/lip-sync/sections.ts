/**
 * A voiceover in two kinds of section: the presenter on screen (A), and
 * cutaways to other footage (B-roll) while the voice goes on.
 *
 * Clips are made only for the presenter's sections: under a cutaway nobody
 * sees the presenter, so nothing is paid for there. Each presenter section is
 * cut into clips as a whole voiceover is (see ./segments): in pauses, on the
 * frame grid, within what the model makes. A cutaway can start and end
 * anywhere (the picture changes, not the sound), so its edges are only put on
 * the frame grid.
 *
 * A clip after a cutaway is made from a moment more of the voiceover than it
 * shows (its lead-in, hidden under the cutaway's end): a model eases into
 * speech over its first second or so, and this way it has done so before it
 * is seen.
 *
 * Shared by the Create page (to show the plan), the server (to check and run
 * it), the Editor compile and tests.
 */
import { LIP_SYNC, longestSegmentFor, requestSecondsFor } from "./models";
import {
  onGrid,
  planVoiceoverSegments,
  type SegmentPlan,
  type SegmentPlanInput,
  type TimedWord,
  type VoiceoverSegment,
  type VoiceoverTiming,
} from "./segments";

/** A stretch of the voiceover covered by other footage, in seconds on its clock. */
export interface Cutaway {
  start: number;
  end: number;
}

/** A stretch of the voiceover, and who is on screen for it. */
export interface VoiceoverSection {
  start: number;
  end: number;
  kind: "presenter" | "cutaway";
}

export const SECTION_LIMITS = {
  /** A cutaway shorter than this can't be read as a shot: it is left out. */
  minCutawaySeconds: 0.5,
  /** The presenter on screen for less than this between two cutaways is a flash: the cutaways join. */
  minPresenterSeconds: 0.5,
  maxCutaways: 30,
  /** How much of the voiceover before it a clip after a cutaway is made from, at most. */
  leadInSeconds: 0.5,
} as const;

const EPSILON = 1e-6;
/** Times are kept to the microsecond; a boundary within this of another is the same one. */
const SAME = 1e-3;
const round6 = (value: number) => Number(value.toFixed(6));

/** An edge on the grid, except the voiceover's own end, which stays where it is. */
function edge(at: number, duration: number, fps: number): number {
  if (at >= duration - 1 / fps / 2) return round6(duration);
  return Math.max(0, onGrid(at, fps));
}

/**
 * Cutaways as a plan uses them: on the frame grid, within the voiceover, in
 * order, none too short, and joined where they overlap or leave the
 * presenter on screen for only a flash between them.
 */
export function normaliseCutaways(
  cutaways: Cutaway[],
  durationSeconds: number,
  fps: number = LIP_SYNC.gridFps,
): Cutaway[] {
  const snapped = cutaways
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .map((item) => ({
      start: edge(Math.max(0, Math.min(item.start, item.end)), durationSeconds, fps),
      end: edge(Math.min(durationSeconds, Math.max(item.start, item.end)), durationSeconds, fps),
    }))
    .sort((a, b) => a.start - b.start);
  const joined: Cutaway[] = [];
  for (const item of snapped) {
    const last = joined.at(-1);
    if (last && item.start - last.end < SECTION_LIMITS.minPresenterSeconds - EPSILON)
      last.end = Math.max(last.end, item.end);
    else joined.push({ ...item });
  }
  // A flash of the presenter at either end goes too.
  const first = joined[0];
  if (first && first.start > 0 && first.start < SECTION_LIMITS.minPresenterSeconds - EPSILON)
    first.start = 0;
  const final = joined.at(-1);
  if (
    final &&
    final.end < durationSeconds &&
    durationSeconds - final.end < SECTION_LIMITS.minPresenterSeconds - EPSILON
  )
    final.end = round6(durationSeconds);
  return joined
    .filter((item) => item.end - item.start >= SECTION_LIMITS.minCutawaySeconds - EPSILON)
    .slice(0, SECTION_LIMITS.maxCutaways);
}

/** The voiceover as presenter and cutaway sections, in order, end to end. */
export function voiceoverSections(
  cutaways: Cutaway[],
  durationSeconds: number,
): VoiceoverSection[] {
  const sections: VoiceoverSection[] = [];
  let cursor = 0;
  for (const item of cutaways) {
    if (item.start > cursor + SAME)
      sections.push({ start: cursor, end: item.start, kind: "presenter" });
    sections.push({ start: Math.max(cursor, item.start), end: item.end, kind: "cutaway" });
    cursor = item.end;
  }
  if (durationSeconds > cursor + SAME)
    sections.push({ start: cursor, end: round6(durationSeconds), kind: "presenter" });
  return sections;
}

/** The presenter's sections alone. */
export function presenterSpans(cutaways: Cutaway[], durationSeconds: number): Cutaway[] {
  return voiceoverSections(cutaways, durationSeconds)
    .filter((section) => section.kind === "presenter")
    .map(({ start, end }) => ({ start, end }));
}

/** Whether a moment of the voiceover is under a cutaway. */
export function underCutaway(cutaways: Cutaway[], at: number): boolean {
  return cutaways.some((item) => at >= item.start - EPSILON && at < item.end - EPSILON);
}

/** A voiceover's timing within [from, to], on a clock starting at `from`. */
export function timingWithin(timing: VoiceoverTiming, from: number, to: number): VoiceoverTiming {
  const clip = (pairs: [number, number][]) =>
    pairs.flatMap(([a, b]): [number, number][] => {
      const start = Math.max(a, from);
      const end = Math.min(b, to);
      return end > start ? [[round6(start - from), round6(end - from)]] : [];
    });
  const envelope = timing.envelope;
  let within: VoiceoverTiming["envelope"] = null;
  if (envelope && envelope.rate > 0 && envelope.values.length) {
    const first = Math.max(0, Math.round(from * envelope.rate));
    const last = Math.min(envelope.values.length, Math.round(to * envelope.rate));
    const values = Array.from(envelope.values).slice(first, Math.max(first, last));
    within = values.length ? { rate: envelope.rate, values } : null;
  }
  return {
    durationSeconds: round6(to - from),
    speech: clip(timing.speech),
    pauses: clip(timing.pauses),
    clearPauses: timing.clearPauses,
    envelope: within,
  };
}

function wordsWithin(words: TimedWord[] | null | undefined, from: number, to: number) {
  return (words ?? [])
    .filter((word) => (word.start + word.end) / 2 >= from && (word.start + word.end) / 2 < to)
    .map((word) => ({ ...word, start: word.start - from, end: word.end - from }));
}

export interface SectionedPlan extends SegmentPlan {
  /** The cutaways as planned (on the grid, joined, in order). */
  cutaways: Cutaway[];
  /** Every section, end to end. */
  sections: VoiceoverSection[];
}

/**
 * Clips for the presenter's sections only (see the module comment): each
 * section cut as a whole voiceover would be, the first clip of the video by
 * the first clip's model and the rest by the later clips', and each section
 * after a cutaway given its lead-in where the model's lengths allow it.
 */
export function planSectionedSegments(
  input: SegmentPlanInput & { cutaways: Cutaway[]; leadInSeconds?: number },
): SectionedPlan {
  const fps = input.fps ?? LIP_SYNC.gridFps;
  const headroom = input.headroomSeconds ?? LIP_SYNC.headroomSeconds;
  const maxClips = input.maxClips ?? 40;
  const duration = input.timing.durationSeconds;
  const cutaways = normaliseCutaways(input.cutaways, duration, fps);
  const sections = voiceoverSections(cutaways, duration);
  const spans = presenterSpans(cutaways, duration);
  const empty = (problem: string): SectionedPlan => ({
    segments: [],
    fps,
    problem,
    cutaways,
    sections,
  });
  if (!(duration > 0)) return empty("The voiceover has no length.");
  if (!spans.length)
    return empty("Every line is covered by B-roll: leave at least one for the presenter.");

  // Never more than a checked plan allows (see sectionedPlanProblems).
  const leadIn = Math.max(
    0,
    Math.min(SECTION_LIMITS.leadInSeconds, input.leadInSeconds ?? SECTION_LIMITS.leadInSeconds),
  );
  const cap = input.maxClipSeconds ?? Infinity;
  const segments: VoiceoverSegment[] = [];
  for (const [index, span] of spans.entries()) {
    const firstChoices = index === 0 ? input.firstChoices : input.laterChoices;
    const plan = planVoiceoverSegments({
      ...input,
      timing: timingWithin(input.timing, span.start, span.end),
      words: wordsWithin(input.words, span.start, span.end),
      firstChoices,
      laterChoices: input.laterChoices,
      fps,
      maxClips: Math.max(1, maxClips - segments.length),
    });
    if (plan.problem)
      return empty(
        spans.length > 1
          ? `The presenter's lines at ${span.start.toFixed(1)}–${span.end.toFixed(1)}s: ${plan.problem}`
          : plan.problem,
      );
    const shifted = plan.segments.map((segment) => ({
      ...segment,
      start: round6(segment.start + span.start),
      end: round6(segment.end + span.start),
    }));
    // The lead-in: from inside the cutaway before, as long as the model makes it.
    const before = cutaways.find((item) => Math.abs(item.end - span.start) < SAME);
    const opening = shifted[0];
    if (opening && before && leadIn > 0) {
      const choices = segments.length ? input.laterChoices : firstChoices;
      const longest = longestSegmentFor(choices, cap, headroom);
      for (let frames = Math.floor(leadIn * fps + EPSILON); frames > 0; frames -= 1) {
        const start = round6(Math.max(before.start, span.start - frames / fps));
        const request = requestSecondsFor(choices, opening.end - start, headroom);
        if (opening.end - start > longest + EPSILON || request === null || request > cap + EPSILON)
          continue;
        opening.start = start;
        opening.requestSeconds = request;
        break;
      }
    }
    segments.push(...shifted);
  }
  if (segments.length > maxClips)
    return empty(
      `The presenter's lines need ${segments.length} clips; a long video holds at most ${maxClips}. Cover more with B-roll, or allow longer clips.`,
    );
  return {
    segments: segments.map((segment, index) => ({ ...segment, index })),
    fps,
    problem: null,
    cutaways,
    sections,
  };
}

/**
 * Where each clip shows, for pieces planned around cutaways: from where its
 * presenter section starts (its lead-in is under the cutaway before) to where
 * its piece ends.
 */
export function shownSpans(
  pieces: Pick<VoiceoverSegment, "start" | "end">[],
  cutaways: Cutaway[],
): { start: number; end: number }[] {
  return pieces.map((piece) => {
    const covering = cutaways.find(
      (item) => item.start <= piece.start + SAME && item.end > piece.start + SAME,
    );
    const start = covering ? Math.min(piece.end, covering.end) : piece.start;
    return { start: round6(start), end: piece.end };
  });
}

/**
 * Checks pieces planned around cutaways (sent from the browser) against the
 * voiceover and the models: the cutaways as a plan keeps them, every moment
 * of the presenter's sections in exactly one piece, nothing made for a
 * cutaway alone, starts on the frame grid, each piece within its model's
 * lengths. Problems in plain words; empty when it holds.
 */
export function sectionedPlanProblems(
  pieces: Pick<VoiceoverSegment, "start" | "end" | "requestSeconds">[],
  cutaways: Cutaway[],
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
  const kept = normaliseCutaways(cutaways, input.durationSeconds, input.fps);
  if (
    kept.length !== cutaways.length ||
    kept.some(
      (item, index) =>
        Math.abs(item.start - cutaways[index]!.start) > SAME ||
        Math.abs(item.end - cutaways[index]!.end) > SAME,
    )
  )
    return ["The B-roll sections have changed since the plan was made: look at it again."];
  if (!pieces.length) return ["There are no clips in the voiceover plan."];
  if (pieces.length > (input.maxClips ?? 40))
    problems.push("The voiceover plan has too many clips.");

  const spans = presenterSpans(kept, input.durationSeconds);
  if (!spans.length)
    problems.push("Every line is covered by B-roll: leave at least one for the presenter.");
  pieces.forEach((piece, index) => {
    const label = `Clip ${index + 1}`;
    if (index > 0 && piece.start < pieces[index - 1]!.end - SAME)
      problems.push(`${label} starts before clip ${index} ends.`);
    if (Math.abs(piece.start * input.fps - Math.round(piece.start * input.fps)) > 1e-3)
      problems.push(`${label} doesn't start on a frame.`);
    if (!(piece.end > piece.start)) problems.push(`${label} has no length.`);
    const choices = index === 0 ? input.firstChoices : input.laterChoices;
    if (!choices.includes(piece.requestSeconds))
      problems.push(`${label}'s length isn't one its model makes.`);
    else if (piece.requestSeconds + EPSILON < piece.end - piece.start + headroom)
      problems.push(`${label} is too short for its piece of the voiceover.`);
    // It ends in (or at the end of) a presenter section, and starts in it or in
    // the cutaway just before it, no further back than its lead-in.
    const span = spans.find(
      (item) => piece.end > item.start + SAME && piece.end <= item.end + SAME,
    );
    if (!span) problems.push(`${label} is made only for a stretch covered by B-roll.`);
    else if (piece.start < span.start - SECTION_LIMITS.leadInSeconds - SAME)
      problems.push(`${label} starts too far into the B-roll before it.`);
  });
  // Every presenter section is covered, piece after piece.
  for (const span of spans) {
    const inside = pieces.filter(
      (piece) => piece.end > span.start + SAME && piece.end <= span.end + SAME,
    );
    const label = `The presenter's lines at ${span.start.toFixed(1)}–${span.end.toFixed(1)}s`;
    if (!inside.length) {
      problems.push(`${label} have no clip.`);
      continue;
    }
    if (inside[0]!.start > span.start + SAME)
      problems.push(`${label} start before their clip does.`);
    if (Math.abs(inside.at(-1)!.end - span.end) > SAME)
      problems.push(`${label} run past their last clip.`);
    for (let index = 1; index < inside.length; index += 1)
      if (Math.abs(inside[index]!.start - inside[index - 1]!.end) > SAME)
        problems.push(`${label} have a gap between two of their clips.`);
  }
  return [...new Set(problems)];
}

/* ------------------------------------------------------------------ */
/* Lines to choose cutaways by                                         */
/* ------------------------------------------------------------------ */

export interface VoiceoverLine {
  start: number;
  end: number;
  /** What is said, where the words are known. */
  text: string;
}

/**
 * The voiceover as lines to mark for B-roll: split where there is a clear
 * pause (in its middle, on the grid), end to end from 0 to its end, so a
 * person can say "cut away during these" without placing times by hand.
 * Lines shorter than `minSeconds` join the next.
 */
export function voiceoverLines(
  timing: VoiceoverTiming,
  words: TimedWord[] | null | undefined,
  options: { fps?: number; minPause?: number; minSeconds?: number } = {},
): VoiceoverLine[] {
  const fps = options.fps ?? LIP_SYNC.gridFps;
  const minPause = options.minPause ?? 0.3;
  const minSeconds = options.minSeconds ?? 1.2;
  const duration = timing.durationSeconds;
  if (!(duration > 0)) return [];
  const cuts = timing.clearPauses
    ? timing.pauses
        .filter(([from, to]) => from > EPSILON && to < duration - EPSILON && to - from >= minPause)
        .map(([from, to]) => onGrid((from + to) / 2, fps))
        .filter((at) => at > 0 && at < duration)
    : [];
  const bounds = [0, ...new Set(cuts), duration].sort((a, b) => a - b);
  const lines: VoiceoverLine[] = [];
  for (let index = 0; index + 1 < bounds.length; index += 1) {
    const start = bounds[index]!;
    const end = bounds[index + 1]!;
    const last = lines.at(-1);
    if (last && last.end - last.start < minSeconds) last.end = round6(end);
    else lines.push({ start: round6(start), end: round6(end), text: "" });
  }
  const tail = lines.at(-1);
  if (lines.length > 1 && tail && tail.end - tail.start < minSeconds) {
    lines.pop();
    lines.at(-1)!.end = tail.end;
  }
  for (const line of lines)
    line.text = (words ?? [])
      .filter((word) => {
        const middle = (word.start + word.end) / 2;
        return middle >= line.start && middle < line.end;
      })
      .map((word) => word.text.trim())
      .filter(Boolean)
      .join(" ");
  return lines;
}

/** Cutaways covering the lines chosen (by index), adjacent lines as one. */
export function cutawaysForLines(lines: VoiceoverLine[], chosen: Set<number>): Cutaway[] {
  const cutaways: Cutaway[] = [];
  lines.forEach((line, index) => {
    if (!chosen.has(index)) return;
    const last = cutaways.at(-1);
    if (last && Math.abs(last.end - line.start) < SAME) last.end = line.end;
    else cutaways.push({ start: line.start, end: line.end });
  });
  return cutaways;
}
