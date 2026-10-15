import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";
import { clipPrompt, planClips, planIssues, type ClipDraft } from "../../src/lib/long-video/plan";
import {
  pieceTranscripts,
  planVoiceoverClips,
  storedVoiceover,
  storeVoiceover,
  voiceoverChoices,
  voiceoverModelProblem,
  voiceoverPlanProblems,
} from "../../src/lib/long-video/voiceover";
import { LIP_SYNC_LINE, withLipSyncLine } from "../../src/lib/lip-sync/prompt";
import { lipSyncChoices, lipSyncValues } from "../../src/lib/lip-sync/models";
import type { PreparedAnalysis } from "../../src/lib/lip-sync/analysis";

const registry = JSON.parse(
  readFileSync(join(import.meta.dir, "../../scripts/higgsfield/registry.json"), "utf8"),
) as ModelRegistryEntry[];
const byPath = (path: string) => registry.find((row) => row.model_path === path)!;
const wan27 = byPath("wan/v2.7/image-to-video");
const wan27t = byPath("wan/v2.7/text-to-video");
const wan26 = byPath("wan/v2.6/image-to-video");
const kling = registry.find(
  (row) => row.model_path.startsWith("kling-video/") && row.output_type === "video",
)!;

/** A prepared voiceover: phrases of `length` s with `gap` s pauses, as the worker reports it. */
function analysis(
  count: number,
  length: number,
  gap: number,
  lead = 0.3,
  tail = 0.4,
): PreparedAnalysis {
  const speech: [number, number][] = [];
  const pauses: [number, number][] = [[0, lead]];
  let at = lead;
  for (let index = 0; index < count; index += 1) {
    speech.push([at, at + length]);
    at += length;
    const pause = index < count - 1 ? gap : tail;
    pauses.push([at, at + pause]);
    at += pause;
  }
  const rate = 48000;
  const samples = Math.round(at * rate);
  return {
    sample_rate: rate,
    channels: 1,
    samples,
    duration_seconds: samples / rate,
    speech,
    pauses,
    clear_pauses: true,
  };
}

const longRead = analysis(9, 4.2, 0.5);

describe("models a voiceover can drive", () => {
  test("are those with driving audio, for every clip", () => {
    expect(voiceoverModelProblem(wan27t, wan27)).toBeNull();
    expect(voiceoverModelProblem(kling, kling)).toMatch(/can't move a speaker's lips/);
    expect(voiceoverModelProblem(wan27, kling)).toMatch(/can't move a speaker's lips/);
  });

  test("are never asked for less than the shortest driving audio a model takes", () => {
    expect(lipSyncChoices([2, 3, 4, 5])).toEqual([3, 4, 5]);
    expect(voiceoverChoices(wan27, wan27).first[0]).toBe(3);
    expect(voiceoverChoices(wan26, wan26).later).toEqual([5, 10, 15]);
  });

  test("make one continuous shot, never Wan 2.6's multi-shot", () => {
    expect(lipSyncValues({ multi_shots: true, resolution: "720p" }, [wan26])).toEqual({
      multi_shots: false,
      resolution: "720p",
    });
    const none = { resolution: "720p" };
    expect(lipSyncValues(none, [wan27])).toBe(none);
  });
});

describe("a long video planned from its voiceover", () => {
  test("has one clip per piece, each asked for its piece's length", () => {
    const plan = planVoiceoverClips({ analysis: longRead, first: wan27, continuation: wan27 });
    expect(plan.problem).toBeNull();
    const total = longRead.samples / longRead.sample_rate;
    expect(plan.segments[0]!.start).toBe(0);
    expect(plan.segments.at(-1)!.end).toBeCloseTo(total, 6);
    for (const segment of plan.segments) {
      expect(segment.requestSeconds).toBeGreaterThanOrEqual(3);
      expect(segment.requestSeconds).toBeLessThanOrEqual(15);
      expect(segment.end - segment.start + 0.25).toBeLessThanOrEqual(segment.requestSeconds + 1e-9);
    }
    expect(
      voiceoverPlanProblems({
        pieces: plan.segments,
        clipSeconds: plan.segments.map((segment) => segment.requestSeconds),
        durationSeconds: total,
        first: wan27,
        continuation: wan27,
      }),
    ).toEqual([]);
  });

  test("is refused when a clip isn't asked for its piece's length, or the pieces don't cover it", () => {
    const plan = planVoiceoverClips({ analysis: longRead, first: wan27, continuation: wan27 });
    const total = longRead.samples / longRead.sample_rate;
    const asked = plan.segments.map((segment) => segment.requestSeconds);
    asked[1] = asked[1]! + 1;
    expect(
      voiceoverPlanProblems({
        pieces: plan.segments,
        clipSeconds: asked,
        durationSeconds: total,
        first: wan27,
        continuation: wan27,
      }).join(" "),
    ).toMatch(/Clip 2 must be/);
    expect(
      voiceoverPlanProblems({
        pieces: plan.segments.slice(0, -1),
        clipSeconds: asked.slice(0, -1),
        durationSeconds: total,
        first: wan27,
        continuation: wan27,
      }).join(" "),
    ).toMatch(/last clip must end where the voiceover does/);
  });

  test("keeps to the longest clip chosen", () => {
    const plan = planVoiceoverClips({
      analysis: longRead,
      first: wan27,
      continuation: wan27,
      maxClipSeconds: 6,
    });
    expect(plan.problem).toBeNull();
    for (const segment of plan.segments) expect(segment.requestSeconds).toBeLessThanOrEqual(6);
  });

  test("says what is said in each piece", () => {
    const words = [
      { text: "Hello", start: 0.3, end: 0.8 },
      { text: "there.", start: 0.9, end: 1.4 },
      { text: "Next", start: 30, end: 30.5 },
    ];
    const pieces = [
      { start: 0, end: 10 },
      { start: 10, end: 40 },
    ];
    expect(pieceTranscripts(pieces, words)).toEqual(["Hello there.", "Next"]);
    expect(pieceTranscripts(pieces, null)).toEqual(["", ""]);
  });
});

describe("clips made to a voiceover", () => {
  const plan = planVoiceoverClips({ analysis: longRead, first: wan26, continuation: wan26 });
  const clips: ClipDraft[] = plan.segments.map((segment, index) => ({
    beat: `Beat ${index + 1}`,
    durationSeconds: segment.requestSeconds,
    prompt: clipPrompt({
      story: "A founder talks to camera.",
      beat: `Beat ${index + 1}`,
      index,
      count: plan.segments.length,
    }),
  }));
  const planned = planClips({
    first: wan26,
    continuation: wan26,
    values: { ...{ multi_shots: true }, prompt: "A founder talks to camera." },
    references: [
      { assetId: "11111111-1111-4111-8111-111111111111", role: "source", assetType: "image" },
      { assetId: "22222222-2222-4222-8222-222222222222", role: "audio", assetType: "audio" },
    ],
    clips,
    voiceover: true,
  });

  test("are each sent their piece in the driving-audio input, and no other sound", () => {
    for (const clip of planned) {
      expect(clip.roles.filter((role) => role === "audio")).toHaveLength(1);
      expect(clip.inputs.some((item) => item.role === "audio")).toBe(false);
    }
    expect(planned[0]!.inputs.map((item) => item.role)).toEqual(["source"]);
  });

  test("are told someone speaks, as one continuous shot", () => {
    for (const clip of planned) {
      expect(clip.prompt.endsWith(LIP_SYNC_LINE)).toBe(true);
      expect(clip.prompt.split(LIP_SYNC_LINE)).toHaveLength(2);
      expect(clip.values["multi_shots"]).toBe(false);
    }
  });

  test("pass the plan's checks, even as a single clip", () => {
    expect(
      planIssues({
        first: wan26,
        continuation: wan26,
        clips: planned,
        targetSeconds: 40,
        voiceover: true,
      }),
    ).toEqual([]);
    const one = planned.slice(0, 1);
    expect(
      planIssues({
        first: wan26,
        continuation: wan26,
        clips: one,
        targetSeconds: 8,
        voiceover: true,
      }),
    ).toEqual([]);
    expect(
      planIssues({ first: wan26, continuation: wan26, clips: one, targetSeconds: 8 }).map(
        (issue) => issue.message,
      ),
    ).toContain("That length fits in one clip; switch to One clip");
  });

  test("can't be made by a model without driving audio, or with keyframes", () => {
    expect(
      planIssues({
        first: kling,
        continuation: kling,
        clips: [],
        targetSeconds: 20,
        voiceover: true,
      })[0]?.message,
    ).toMatch(/driving audio/);
    expect(
      planIssues({
        first: wan27,
        continuation: wan27,
        clips: [],
        targetSeconds: 20,
        voiceover: true,
        keyframes: true,
      })[0]?.message,
    ).toMatch(/Keyframes and a voiceover/);
  });

  test("never carry the line twice", () => {
    expect(withLipSyncLine(withLipSyncLine("A"))).toBe(`A\n\n${LIP_SYNC_LINE}`);
  });
});

describe("a run's voiceover as stored", () => {
  test("reads back as it was kept", () => {
    const voiceover = {
      preparedAssetId: "33333333-3333-4333-8333-333333333333",
      durationSeconds: 41.2,
      sampleRate: 48000,
      samples: 1977600,
      fps: 30,
      headroomSeconds: 0.25,
      title: "Launch read",
      keepClipSound: false,
    };
    expect(storedVoiceover(storeVoiceover(voiceover))).toEqual(voiceover);
    expect(storedVoiceover(null)).toBeNull();
    expect(storedVoiceover({ prepared_asset_id: "x" })).toBeNull();
  });
});
