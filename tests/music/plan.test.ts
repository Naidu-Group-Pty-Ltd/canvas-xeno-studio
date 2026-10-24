import { describe, expect, test } from "bun:test";
import {
  isPlanModel,
  MUSIC_PLAN_LIMITS,
  musicPlanSchema,
  planBody,
  planMilliseconds,
  planSummary,
} from "../../src/lib/music/plan";

const chunk = (text: string, durationMs: number, extra: Record<string, unknown> = {}) => ({
  text,
  durationMs,
  positiveStyles: ["cinematic corporate", "120 BPM", "warm pads"],
  ...extra,
});

// A film's opening: an intro of 11 bars at 120 BPM, then its drop on the cut.
const PLAN = musicPlanSchema.parse({
  chunks: [
    chunk("[Intro]", 22_000, { negativeStyles: ["vocals"] }),
    chunk("[Drop]", 18_000, { contextAdherence: "high" }),
  ],
});

describe("Eleven Music's composition plan", () => {
  test("goes to ElevenLabs under its own names, leaving out what wasn't said", () => {
    expect(planBody(PLAN)).toEqual({
      chunks: [
        {
          text: "[Intro]",
          duration_ms: 22_000,
          positive_styles: ["cinematic corporate", "120 BPM", "warm pads"],
          negative_styles: ["vocals"],
        },
        {
          text: "[Drop]",
          duration_ms: 18_000,
          positive_styles: ["cinematic corporate", "120 BPM", "warm pads"],
          context_adherence: "high",
        },
      ],
    });
    expect(planMilliseconds(PLAN)).toBe(40_000);
  });

  test("holds each chunk to 3 s to 2 min, its lines to the API's, and the song to 10 minutes", () => {
    const refused = (plan: unknown) => !musicPlanSchema.safeParse(plan).success;
    expect(refused({ chunks: [chunk("[Hit]", 2_999)] })).toBe(true);
    expect(refused({ chunks: [chunk("[Long]", 120_001)] })).toBe(true);
    expect(refused({ chunks: [chunk("[Half]", 4_500.5)] })).toBe(true);
    expect(refused({ chunks: [] })).toBe(true);
    expect(refused({ chunks: [chunk("[Verse]", 10_000, { positiveStyles: [] })] })).toBe(true);
    const lines = Array.from({ length: MUSIC_PLAN_LIMITS.lines + 1 }, () => "la").join("\n");
    expect(refused({ chunks: [chunk(lines, 10_000)] })).toBe(true);
    expect(refused({ chunks: [chunk(`[Verse]\n${"a".repeat(201)}`, 10_000)] })).toBe(true);
    const sixMinutes = Array.from({ length: 6 }, (_, index) => chunk(`[Part ${index}]`, 110_000));
    expect(refused({ chunks: sixMinutes })).toBe(true);
    expect(
      refused({ chunks: Array.from({ length: 25 }, (_, index) => chunk(`[${index}]`, 3_000)) }),
    ).toBe(true);
    expect(refused({ chunks: [chunk("[Verse]", 120_000)] })).toBe(false);
  });

  test("is for Eleven Music v2 and v2.5 only", () => {
    expect(isPlanModel("music_v2_5")).toBe(true);
    expect(isPlanModel("music_v2")).toBe(true);
    expect(isPlanModel("music_v1")).toBe(false);
  });

  test("is kept in the library as where its parts fall, with a fingerprint and its seed", async () => {
    const summary = await planSummary(PLAN, 7);
    expect(summary).toMatch(
      /^Composition plan [0-9a-f]{12}, seed 7: Intro 0 s–22 s · Drop 22 s–40 s$/,
    );
    // Another seed, or another plan, is never the same music.
    expect(await planSummary(PLAN, 8)).not.toBe(summary);
    const other = musicPlanSchema.parse({
      chunks: [chunk("[Intro]", 22_000), chunk("[Drop]", 18_000, { contextAdherence: "low" })],
    });
    expect((await planSummary(other, 7)).slice(0, 29)).not.toBe(summary.slice(0, 29));
    // A chunk without a name is numbered, and a part of a second is kept.
    const unnamed = musicPlanSchema.parse({ chunks: [chunk("la la", 3_500)] });
    expect(await planSummary(unnamed, null)).toMatch(/: Part 1 0 s–3\.5 s$/);
  });
});
