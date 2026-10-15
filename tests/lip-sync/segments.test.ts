import { describe, expect, test } from "bun:test";
import {
  onGrid,
  planVoiceoverSegments,
  segmentProblems,
  transcriptOf,
  type TimedWord,
  type VoiceoverTiming,
} from "../../src/lib/lip-sync/segments";

const WAN27 = Array.from({ length: 14 }, (_, index) => index + 2); // 2-15 s
const WAN26 = [5, 10, 15];
const FPS = 30;

/** Speech in phrases separated by pauses: [start, end] of each phrase. */
function timing(duration: number, phrases: [number, number][]): VoiceoverTiming {
  const pauses: [number, number][] = [];
  let cursor = 0;
  for (const [from, to] of phrases) {
    if (from > cursor) pauses.push([cursor, from]);
    cursor = to;
  }
  if (duration > cursor) pauses.push([cursor, duration]);
  return { durationSeconds: duration, speech: phrases, pauses, clearPauses: true, envelope: null };
}

/** Phrases of `length` s with `gap` s between, from `lead` s, for `count` phrases. */
function phrases(count: number, length: number, gap: number, lead = 0.3): [number, number][] {
  return Array.from({ length: count }, (_, index) => {
    const from = lead + index * (length + gap);
    return [Number(from.toFixed(3)), Number((from + length).toFixed(3))];
  });
}

function insidePause(t: VoiceoverTiming, at: number) {
  return t.pauses.some(([from, to]) => at > from && at < to);
}

describe("cutting a voiceover into clips", () => {
  test("cuts only in pauses, on the frame grid, every clip within what the model makes", () => {
    const t = timing(62.4, phrases(14, 3.9, 0.45));
    const plan = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      fps: FPS,
    });
    expect(plan.problem).toBeNull();
    const { segments } = plan;
    expect(segments[0]!.start).toBe(0);
    expect(segments.at(-1)!.end).toBeCloseTo(62.4, 9);
    segments.forEach((segment, index) => {
      if (index > 0) {
        expect(segment.start).toBe(segments[index - 1]!.end);
        expect(insidePause(t, segment.start)).toBe(true);
        // Times are kept to the microsecond: on a frame to within a thousandth of one.
        expect(segment.start * FPS).toBeCloseTo(Math.round(segment.start * FPS), 3);
      }
      expect(segment.end - segment.start + 0.25).toBeLessThanOrEqual(segment.requestSeconds + 1e-9);
      expect(segment.requestSeconds).toBeLessThanOrEqual(15);
    });
    expect(
      segmentProblems(segments, {
        firstChoices: WAN27,
        laterChoices: WAN27,
        durationSeconds: 62.4,
        fps: FPS,
      }),
    ).toEqual([]);
  });

  test("uses as few clips as the model's longest allows, give or take a better cut", () => {
    const t = timing(62.4, phrases(14, 3.9, 0.45));
    const { segments } = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      fps: FPS,
    });
    // 62.4 s at most 14.75 s a clip is at least 5 clips.
    expect(segments.length).toBeGreaterThanOrEqual(5);
    expect(segments.length).toBeLessThanOrEqual(6);
  });

  test("keeps to the longest clip asked for", () => {
    const t = timing(40, phrases(10, 3.2, 0.5));
    const { segments, problem } = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      maxClipSeconds: 8,
      fps: FPS,
    });
    expect(problem).toBeNull();
    for (const segment of segments) expect(segment.requestSeconds).toBeLessThanOrEqual(8);
  });

  test("prefers the end of a sentence to any other pause", () => {
    // Phrases every 4 s; with word timings, only the pause after 7.9 s ends a sentence.
    const t = timing(16, phrases(4, 3.4, 0.6, 0.3));
    const words: TimedWord[] = [
      { text: "One", start: 0.3, end: 3.7 },
      { text: "two,", start: 4.3, end: 7.7 },
      { text: "three.", start: 8.3, end: 11.7 },
      { text: "Four", start: 12.3, end: 15.7 },
    ];
    const plan = planVoiceoverSegments({
      timing: t,
      words,
      firstChoices: WAN27,
      laterChoices: WAN27,
      maxClipSeconds: 13,
      fps: FPS,
    });
    expect(plan.problem).toBeNull();
    expect(plan.segments.map((segment) => segment.cut)).toEqual(["sentence", "end"]);
    expect(plan.segments[0]!.end).toBeCloseTo(onGrid((11.7 + 12.3) / 2, FPS), 9);
    expect(transcriptOf(words, plan.segments[0]!.start, plan.segments[0]!.end)).toBe(
      "One two, three.",
    );
  });

  test("keeps one clip for a voiceover that fits in one", () => {
    const t = timing(6.1, [[0.2, 5.9]]);
    const { segments } = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN26,
      laterChoices: WAN26,
      fps: FPS,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]!.requestSeconds).toBe(10);
    expect(segments[0]!.cut).toBe("end");
  });

  test("cuts through speech only where no pause comes within a clip's length", () => {
    // 30 s of unbroken speech: no pause at all.
    const t = timing(30, [[0, 30]]);
    const { segments, problem } = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      fps: FPS,
    });
    expect(problem).toBeNull();
    expect(segments.length).toBe(3);
    expect(segments.slice(0, -1).every((segment) => segment.cut === "forced")).toBe(true);
  });

  test("trusts no pause in a recording where speech can't be told from the rest", () => {
    const t = { ...timing(20, phrases(5, 3, 1)), clearPauses: false };
    const { segments } = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      fps: FPS,
    });
    expect(segments.slice(0, -1).every((segment) => segment.cut === "forced")).toBe(true);
  });

  test("says when a voiceover needs more clips than a long video holds", () => {
    const t = timing(600, phrases(150, 3.5, 0.5));
    const plan = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN26,
      laterChoices: WAN26,
      maxClipSeconds: 5,
      fps: FPS,
    });
    expect(plan.segments).toEqual([]);
    expect(plan.problem).toMatch(/at most 40/);
  });

  test("lets the first clip's model run longer than the rest's", () => {
    // A 14 s phrase opens the voiceover: only Wan 2.7 can hold it, as the first clip.
    const t = timing(30, [[0.2, 14.2], ...phrases(4, 3, 0.8, 15)]);
    const plan = planVoiceoverSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN26,
      fps: FPS,
    });
    expect(plan.problem).toBeNull();
    expect(plan.segments[0]!.requestSeconds).toBe(15);
    for (const segment of plan.segments.slice(1)) expect(WAN26).toContain(segment.requestSeconds);
  });
});

describe("checking a plan", () => {
  test("finds a cut off the grid, a gap, and a length the model doesn't make", () => {
    const problems = segmentProblems(
      [
        { start: 0, end: 4.01, requestSeconds: 5 },
        { start: 4.02, end: 8, requestSeconds: 4.5 },
      ],
      { firstChoices: WAN27, laterChoices: WAN27, durationSeconds: 8, fps: FPS },
    );
    expect(problems.join(" ")).toMatch(/doesn't start where clip 1 ends/);
    expect(problems.join(" ")).toMatch(/doesn't start on a frame/);
    expect(problems.join(" ")).toMatch(/isn't one its model makes/);
  });
});
