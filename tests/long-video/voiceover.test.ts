import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";
import {
  clipPrompt,
  FINALE_REVEAL_NOTE,
  planClips,
  planIssues,
  type ClipDraft,
} from "../../src/lib/long-video/plan";
import {
  lastClipPlaysOut,
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
import { keyframeWorkflow, planKeyframes } from "../../src/lib/long-video/keyframes";
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

  test("can't be made by a model without driving audio, nor keyframed on one that can't end on a frame", () => {
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
        first: wan26,
        continuation: wan26,
        clips: [],
        targetSeconds: 20,
        voiceover: true,
        keyframes: true,
      })[0]?.message,
    ).toMatch(/can't end a clip on a given frame/);
  });

  test("never carry the line twice", () => {
    expect(withLipSyncLine(withLipSyncLine("A"))).toBe(`A\n\n${LIP_SYNC_LINE}`);
  });
});

describe("keyframes with a voiceover", () => {
  // The catalogue as the studio loads it: every model on.
  const active = registry.map((row) => ({ ...row, is_active: true }));
  const on = (model: ModelRegistryEntry) => active.find((row) => row.id === model.id)!;

  test("are made by a workflow that moves lips to it and ends on a frame (Wan 2.7), or not at all", () => {
    expect(keyframeWorkflow(on(wan27t), active, { drivingAudio: true })?.model_path).toBe(
      "wan/v2.7/image-to-video",
    );
    expect(keyframeWorkflow(on(wan27), active, { drivingAudio: true })?.id).toBe(wan27.id);
    expect(keyframeWorkflow(on(wan26), active, { drivingAudio: true })).toBeNull();
    const ending = active.find(
      (row) =>
        row.output_type === "video" &&
        keyframeWorkflow(row, active) !== null &&
        keyframeWorkflow(row, active, { drivingAudio: true }) === null,
    );
    // A model that can end on a frame but not move lips keeps keyframes without a voiceover only.
    expect(ending).toBeDefined();
  });

  const plan = planVoiceoverClips({ analysis: longRead, first: wan27, continuation: wan27 });
  const clips: ClipDraft[] = plan.segments.map((segment, index) => ({
    beat: `The founder, beat ${index + 1}`,
    durationSeconds: segment.requestSeconds,
    prompt: clipPrompt({
      story: "A founder talks to camera.",
      beat: `The founder, beat ${index + 1}`,
      index,
      count: plan.segments.length,
    }),
  }));
  const references = [
    { assetId: "22222222-2222-4222-8222-222222222222", role: "audio", assetType: "audio" as const },
  ];
  const planned = planClips({
    first: wan27,
    continuation: wan27,
    values: { prompt: "A founder talks to camera." },
    references,
    clips,
    keyframes: true,
    voiceover: true,
  });

  test("send every clip its start frame, its piece and the keyframe it ends on", () => {
    expect(plan.problem).toBeNull();
    expect(planned.length).toBeGreaterThan(1);
    planned.forEach((clip, index) => {
      expect([...clip.roles].sort()).toEqual(["audio", "last_frame", "source"]);
      // The frames and the piece are supplied when it starts, never from the references.
      expect(clip.inputs).toEqual([]);
      expect(clip.startKeyframe).toBe(index === 0 ? 0 : null);
      expect(clip.endKeyframe).toBe(index + 1);
      expect(clip.prompt.endsWith(LIP_SYNC_LINE)).toBe(true);
      expect(clip.durationSeconds).toBe(plan.segments[index]!.requestSeconds);
    });
  });

  test("pass the plan's checks, with a storyboard of one keyframe per clip and the opening", () => {
    expect(
      planIssues({
        first: wan27,
        continuation: wan27,
        clips: planned,
        targetSeconds: longRead.duration_seconds,
        keyframes: true,
        voiceover: true,
      }),
    ).toEqual([]);
    const storyboard = planKeyframes({
      models: registry,
      painterModelId: null,
      workflow: wan27,
      values: { prompt: "A founder talks to camera.", aspect_ratio: "16:9" },
      clips: planned.length,
      finale: null,
      references,
      characters: [],
    });
    expect(storyboard.count).toBe(planned.length + 1);
  });

  test("of a single clip still move into the end card, which stands for its closing keyframe", () => {
    const card = "eeeeeeee-1111-4111-8111-111111111111";
    const finale = { assetId: card, mode: "both" as const, seconds: 3 };
    const [only] = planClips({
      first: wan27,
      continuation: wan27,
      values: { prompt: "A founder says thank you." },
      references: [...references, { assetId: card, role: "unused", assetType: "image" }],
      clips: [
        {
          beat: "The founder smiles",
          durationSeconds: 4,
          prompt: clipPrompt({
            story: "A founder says thank you.",
            index: 0,
            count: 1,
            finale: "both",
          }),
        },
      ],
      finale,
      keyframes: true,
      voiceover: true,
    });
    expect(only!.startKeyframe).toBe(0);
    expect(only!.endKeyframe).toBeNull();
    expect(only!.inputs).toEqual([{ assetId: card, role: "last_frame" }]);
    expect([...only!.roles].sort()).toEqual(["audio", "last_frame", "source"]);
    expect(only!.prompt.split(FINALE_REVEAL_NOTE)).toHaveLength(2);
    expect(
      lastClipPlaysOut({
        position: 0,
        clipCount: 1,
        keyframed: true,
        finale,
        endFrameAssetId: null,
        inputAssetIds: only!.inputs.map((item) => item.assetId),
      }),
    ).toBe(true);
  });
});

describe("the last clip of a video made to a voiceover", () => {
  const card = "cccccccc-1111-4111-8111-111111111111";
  const laidOut = "dddddddd-1111-4111-8111-111111111111";
  const base = {
    position: 3,
    clipCount: 4,
    keyframed: false,
    finale: null,
    endFrameAssetId: null,
    inputAssetIds: [] as string[],
  };

  test("plays out when it ends on its closing keyframe", () => {
    expect(lastClipPlaysOut({ ...base, keyframed: true })).toBe(true);
    expect(lastClipPlaysOut({ ...base, endFrameAssetId: laidOut })).toBe(true);
    // ...but not a clip before the last, which the next one starts from where it's cut.
    expect(lastClipPlaysOut({ ...base, position: 2, keyframed: true })).toBe(false);
  });

  test("plays out when it moves into the brand's end card, and only then", () => {
    const reveal = { assetId: card, frameAssetId: laidOut, mode: "reveal" as const };
    expect(lastClipPlaysOut({ ...base, finale: reveal, inputAssetIds: [laidOut] })).toBe(true);
    expect(
      lastClipPlaysOut({
        ...base,
        finale: { ...reveal, frameAssetId: null },
        inputAssetIds: [card],
      }),
    ).toBe(true);
    // A single clip isn't sent the end card, so it is cut as usual.
    expect(lastClipPlaysOut({ ...base, finale: reveal, inputAssetIds: [] })).toBe(false);
    // Held after the last clip, the end card isn't something it moves into.
    expect(
      lastClipPlaysOut({
        ...base,
        finale: { ...reveal, mode: "end_card" },
        inputAssetIds: [laidOut],
      }),
    ).toBe(false);
    expect(lastClipPlaysOut(base)).toBe(false);
  });

  test("with keyframes, moving into the end card counts too", () => {
    const reveal = { assetId: card, frameAssetId: null, mode: "both" as const };
    // Its keyframe is replaced by the end card, which it is sent instead.
    expect(lastClipPlaysOut({ ...base, keyframed: true, finale: reveal })).toBe(false);
    expect(
      lastClipPlaysOut({ ...base, keyframed: true, finale: reveal, inputAssetIds: [card] }),
    ).toBe(true);
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
      cutaways: [] as { start: number; end: number }[],
    };
    expect(storedVoiceover(storeVoiceover(voiceover))).toEqual(voiceover);
    // With B-roll: its cutaways come back as planned.
    const withBroll = { ...voiceover, cutaways: [{ start: 8.1, end: 17.4 }] };
    expect(storedVoiceover(storeVoiceover(withBroll))).toEqual(withBroll);
    // An older run's has none.
    expect(
      storedVoiceover({ ...storeVoiceover(voiceover), cutaways: undefined })?.cutaways,
    ).toEqual([]);
    expect(storedVoiceover(null)).toBeNull();
    expect(storedVoiceover({ prepared_asset_id: "x" })).toBeNull();
  });
});

describe("a voiceover with cutaways to B-roll", () => {
  const cutaways = [
    { start: 9.4, end: 18.6 },
    { start: 28, end: 37.1 },
  ];
  const plan = planVoiceoverClips({
    analysis: longRead,
    first: wan27,
    continuation: wan27,
    cutaways,
  });

  test("is cut into clips for the presenter's lines only, which pass the server's check", () => {
    expect(plan.problem).toBeNull();
    expect(plan.cutaways.length).toBe(2);
    for (const segment of plan.segments)
      expect(
        plan.cutaways.some((item) => segment.start >= item.start && segment.end <= item.end),
      ).toBe(false);
    expect(
      voiceoverPlanProblems({
        pieces: plan.segments,
        clipSeconds: plan.segments.map((segment) => segment.requestSeconds),
        durationSeconds: longRead.samples / longRead.sample_rate,
        first: wan27,
        continuation: wan27,
        cutaways: plan.cutaways,
      }),
    ).toEqual([]);
  });

  test("is refused as a plain plan, whose pieces must cover the voiceover end to end", () => {
    expect(
      voiceoverPlanProblems({
        pieces: plan.segments,
        clipSeconds: plan.segments.map((segment) => segment.requestSeconds),
        durationSeconds: longRead.samples / longRead.sample_rate,
        first: wan27,
        continuation: wan27,
      }).length,
    ).toBeGreaterThan(0);
  });
});
