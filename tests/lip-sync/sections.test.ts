import { describe, expect, test } from "bun:test";
import {
  cutawaysForLines,
  normaliseCutaways,
  planSectionedSegments,
  presenterSpans,
  sectionedPlanProblems,
  SECTION_LIMITS,
  shownSpans,
  voiceoverLines,
  voiceoverSections,
} from "../../src/lib/lip-sync/sections";
import type { VoiceoverTiming } from "../../src/lib/lip-sync/segments";

const WAN27 = Array.from({ length: 14 }, (_, index) => index + 2).filter((value) => value >= 3);
const FPS = 30;

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

function phrases(count: number, length: number, gap: number, lead = 0.3): [number, number][] {
  return Array.from({ length: count }, (_, index) => {
    const from = lead + index * (length + gap);
    return [Number(from.toFixed(3)), Number((from + length).toFixed(3))];
  });
}

const onFrame = (seconds: number) => Math.abs(seconds * FPS - Math.round(seconds * FPS)) < 1e-3;

describe("cutaways", () => {
  test("are put on the grid, in order, joined where they nearly meet, short ones dropped", () => {
    const kept = normaliseCutaways(
      [
        { start: 20.01, end: 25.5 },
        { start: 8.11, end: 17.4 },
        { start: 25.8, end: 26.0 }, // 0.3 s of presenter between: joins
        { start: 40, end: 40.2 }, // too short
      ],
      60,
      FPS,
    );
    expect(kept).toEqual([
      { start: 8.1, end: 17.4 },
      { start: 20, end: 26 },
    ]);
    for (const item of kept) expect(onFrame(item.start) && onFrame(item.end)).toBe(true);
  });

  test("leave no flash of the presenter at the very start or end", () => {
    expect(
      normaliseCutaways(
        [
          { start: 0.2, end: 5 },
          { start: 55, end: 59.8 },
        ],
        60,
        FPS,
      ),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 55, end: 60 },
    ]);
  });

  test("split the voiceover into presenter and cutaway sections, end to end", () => {
    const cutaways = [{ start: 8.1, end: 17.4 }];
    expect(voiceoverSections(cutaways, 30)).toEqual([
      { start: 0, end: 8.1, kind: "presenter" },
      { start: 8.1, end: 17.4, kind: "cutaway" },
      { start: 17.4, end: 30, kind: "presenter" },
    ]);
    expect(presenterSpans(cutaways, 30)).toEqual([
      { start: 0, end: 8.1 },
      { start: 17.4, end: 30 },
    ]);
  });
});

describe("planning clips around cutaways", () => {
  const t = timing(60.2, phrases(12, 4.2, 0.6));
  const cutaways = normaliseCutaways(
    [
      { start: 9.9, end: 19.5 },
      { start: 34.5, end: 44.1 },
    ],
    60.2,
    FPS,
  );
  const plan = planSectionedSegments({
    timing: t,
    firstChoices: WAN27,
    laterChoices: WAN27,
    fps: FPS,
    cutaways,
  });

  test("makes clips only for the presenter's sections", () => {
    expect(plan.problem).toBeNull();
    const madeSeconds = plan.segments.reduce(
      (sum, segment) => sum + (segment.end - segment.start),
      0,
    );
    const presenterSeconds = presenterSpans(plan.cutaways, 60.2).reduce(
      (sum, span) => sum + (span.end - span.start),
      0,
    );
    // Only the presenter's time, and a lead-in per section after a cutaway.
    expect(madeSeconds).toBeLessThanOrEqual(
      presenterSeconds + 2 * SECTION_LIMITS.leadInSeconds + 1e-6,
    );
    for (const segment of plan.segments) {
      expect(onFrame(segment.start)).toBe(true);
      expect(segment.end - segment.start + 0.25).toBeLessThanOrEqual(segment.requestSeconds + 1e-9);
    }
  });

  test("gives a clip after a cutaway its lead-in, hidden under the cutaway", () => {
    const after = plan.segments.find((segment) => segment.end > 19.5 && segment.start < 19.6)!;
    expect(after.start).toBeCloseTo(19.5 - SECTION_LIMITS.leadInSeconds, 6);
    const shown = shownSpans(plan.segments, plan.cutaways);
    const index = plan.segments.indexOf(after);
    expect(shown[index]!.start).toBeCloseTo(19.5, 6);
  });

  test("passes its own check, and the check finds what a browser could get wrong", () => {
    const input = {
      firstChoices: WAN27,
      laterChoices: WAN27,
      durationSeconds: 60.2,
      fps: FPS,
    };
    expect(sectionedPlanProblems(plan.segments, plan.cutaways, input)).toEqual([]);
    // A clip made for the B-roll only.
    const hidden = [...plan.segments];
    hidden.splice(1, 0, { start: 12, end: 15, requestSeconds: 4 });
    expect(sectionedPlanProblems(hidden, plan.cutaways, input).join(" ")).toMatch(
      /covered by B-roll/,
    );
    // A presenter section left without its clip.
    const missing = plan.segments.filter((segment) => !(segment.end > 44 && segment.end < 61));
    expect(sectionedPlanProblems(missing, plan.cutaways, input).join(" ")).toMatch(/no clip/);
    // Cutaways that aren't the plan's.
    expect(
      sectionedPlanProblems(plan.segments, [{ start: 9.91, end: 19.5 }], input).join(" "),
    ).toMatch(/changed/);
  });

  test("says when everything is covered by B-roll", () => {
    const all = planSectionedSegments({
      timing: t,
      firstChoices: WAN27,
      laterChoices: WAN27,
      fps: FPS,
      cutaways: [{ start: 0, end: 60.2 }],
    });
    expect(all.problem).toMatch(/at least one/);
  });
});

describe("lines to mark for B-roll", () => {
  const t = timing(20, phrases(4, 4, 0.8));
  const words = [
    { text: "First", start: 0.4, end: 0.8 },
    { text: "line.", start: 0.9, end: 4.2 },
    { text: "Second", start: 5.2, end: 9 },
    { text: "Third", start: 10, end: 13.9 },
    { text: "Fourth", start: 14.8, end: 18.6 },
  ];
  const lines = voiceoverLines(t, words);

  test("split at clear pauses, end to end, with what is said", () => {
    expect(lines.length).toBe(4);
    expect(lines[0]!.start).toBe(0);
    expect(lines.at(-1)!.end).toBe(20);
    for (let index = 1; index < lines.length; index += 1)
      expect(lines[index]!.start).toBe(lines[index - 1]!.end);
    expect(lines[0]!.text).toBe("First line.");
  });

  test("make one cutaway of neighbouring lines", () => {
    expect(cutawaysForLines(lines, new Set([1, 2]))).toEqual([
      { start: lines[1]!.start, end: lines[2]!.end },
    ]);
  });
});
