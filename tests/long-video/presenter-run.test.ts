import { afterAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "./fake-db";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";
import type { PreparedAnalysis } from "../../src/lib/lip-sync/analysis";

/*
 * A presenter video made to a voiceover, run end to end against an
 * in-memory database: every clip from one still, made side by side, no clip
 * for the B-roll, lips scored, a poor take made again, and the edit opened.
 * The provider, the media service and the voiceover's files are stand-ins.
 */

const db = new FakeDb();
const src = (path: string) => join(import.meta.dir, "../../src/lib", path);
const registry = JSON.parse(
  readFileSync(join(import.meta.dir, "../../scripts/higgsfield/registry.json"), "utf8"),
) as ModelRegistryEntry[];
const wan27 = {
  ...registry.find((row) => row.model_path === "wan/v2.7/image-to-video")!,
  is_active: true,
};

const user = db.add("profiles", { is_active: true, role: "member" });
const still = db.add("assets", {
  asset_type: "image",
  width: 720,
  height: 1280,
  storage_bucket: "b",
  storage_path: "still.png",
});
const voiceSource = db.add("assets", {
  asset_type: "audio",
  storage_bucket: "b",
  storage_path: "v.wav",
});
const voicePrepared = db.add("assets", {
  asset_type: "audio",
  storage_bucket: "b",
  storage_path: "vp.wav",
});
db.add("model_registry", wan27 as never);

/** A read in phrases of `length` s with `gap` s between, as the worker reports it. */
function analysis(count: number, length: number, gap: number): PreparedAnalysis {
  const speech: [number, number][] = [];
  const pauses: [number, number][] = [[0, 0.3]];
  let at = 0.3;
  for (let index = 0; index < count; index += 1) {
    speech.push([at, at + length]);
    at += length;
    const pause = index < count - 1 ? gap : 0.4;
    pauses.push([at, at + pause]);
    at += pause;
  }
  const samples = Math.round(at * 48000);
  return {
    sample_rate: 48000,
    channels: 1,
    samples,
    duration_seconds: samples / 48000,
    speech,
    pauses,
    clear_pauses: true,
  };
}
const read = analysis(14, 4.2, 0.5);
const preparation = db.add("audio_preparations", {
  status: "ready",
  prepared_asset_id: voicePrepared["id"],
  words: [],
});

// The media service is set up, and said it can score lips (what it can do is remembered).
const env = {
  url: process.env["MEDIA_WORKER_URL"],
  secret: process.env["MEDIA_WORKER_SHARED_SECRET"],
};
process.env["MEDIA_WORKER_URL"] = "https://media.example.test";
process.env["MEDIA_WORKER_SHARED_SECRET"] = "a-shared-secret-of-some-length";
afterAll(() => {
  for (const [key, value] of [
    ["MEDIA_WORKER_URL", env.url],
    ["MEDIA_WORKER_SHARED_SECRET", env.secret],
  ] as const)
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});
db.add("app_settings", {
  key: "media_worker_health",
  value: {
    at: new Date().toISOString(),
    ffmpeg: null,
    tasks: [],
    features: ["lip_check"],
    limits: null,
    idle_stop_seconds: null,
  },
});

const requests: Record<string, unknown>[] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
mock.module(src("generation-create.server.ts"), () => ({
  assertGenerationAllowed: async () => {},
  createAndSubmitGeneration: async (request: Record<string, unknown>) => {
    requests.push(request);
    const row = db.add("generations", {
      client_request_id: request["clientRequestId"],
      status: "queued",
    });
    return { generationId: row["id"], status: "queued", budgetWarning: null };
  },
}));
mock.module(src("media/enqueue.server.ts"), () => ({
  enqueueInternalMediaTask: async (request: Record<string, unknown>) => {
    const existing = db
      .rows("media_tasks")
      .find((task) => task["dedupe_key"] === request["dedupeKey"]);
    if (existing) return { ok: true, taskId: existing["id"], duplicate: true };
    const task = db.add("media_tasks", {
      task_type: request["taskType"],
      status: "processing",
      dedupe_key: request["dedupeKey"],
      input_payload: { params: request["params"], ...((request["context"] as object) ?? {}) },
    });
    return { ok: true, taskId: task["id"], duplicate: false };
  },
}));
mock.module(src("lip-sync/slices.server.ts"), () => ({
  voiceoverPiece: async () => ({
    assetId: db.add("assets", {
      asset_type: "audio",
      storage_bucket: "b",
      storage_path: "piece.wav",
    })["id"],
  }),
}));
mock.module(src("lip-sync/prepare.server.ts"), () => ({
  usableVoiceover: async (id: string) => ({
    row: {
      id,
      samples: read.samples,
      sample_rate: read.sample_rate,
      source_asset_id: voiceSource["id"],
    },
    view: { preparedAssetId: voicePrepared["id"] },
    title: "Janice read",
  }),
  preparationById: async () => ({ ...preparation, id: preparation["id"] }),
  takeForEdit: async () => ({
    voiceoverId: "take",
    assetId: voicePrepared["id"],
    durationSeconds: 1,
    words: [],
  }),
}));
mock.module(src("characters/service.server.ts"), () => ({ charactersForRun: async () => [] }));

const service = await import("../../src/lib/long-video/service.server");
const { planVoiceoverClips } = await import("../../src/lib/long-video/voiceover");
const { presenterPrompt, presenterValues } = await import("../../src/lib/lip-sync/presenter");

/** Clips (by id) whose next generation Higgsfield refuses for want of credits. */
const outOfCredits = new Set<string>();

/** Lip scores to report, by clip position, take after take. */
const lipScores = new Map<number, number[]>([[1, [3.1, 7.4]]]);

function clipOfTask(task: Record<string, unknown>) {
  const input = (task["input_payload"] ?? {}) as Record<string, unknown>;
  return db.find("long_video_clips", input["long_video_clip_id"]);
}

/** Lets the provider and the media service finish everything they were given, in turn. */
async function settleAll(runId: string, rounds = 60) {
  for (let round = 0; round < rounds; round += 1) {
    const generation = db.rows("generations").find((row) => row["status"] === "queued");
    if (generation) {
      const clip = db
        .rows("long_video_clips")
        .find((row) => row["generation_id"] === generation["id"]);
      // Out of credits for this one (refused, so nothing was charged).
      if (clip && outOfCredits.has(String(clip["id"]))) {
        outOfCredits.delete(String(clip["id"]));
        generation["status"] = "failed";
        generation["error_code"] = "INSUFFICIENT_PROVIDER_BALANCE";
        generation["error_message"] = "not_enough_credits";
        await service.advanceForGeneration(String(generation["id"]));
        continue;
      }
      const seconds = Number(clip?.["duration_seconds"] ?? 5);
      generation["status"] = "completed";
      generation["ingest_status"] = "completed";
      db.add("assets", {
        asset_type: "video",
        generation_id: generation["id"],
        duration_seconds: seconds,
        width: 720,
        height: 1280,
        storage_bucket: "b",
        storage_path: `clip-${generation["id"]}.mp4`,
      });
      await service.advanceForGeneration(String(generation["id"]));
      continue;
    }
    const task = db.rows("media_tasks").find((row) => row["status"] === "processing");
    if (task) {
      const clip = clipOfTask(task)!;
      const length = Number(clip["duration_seconds"]);
      let metadata: Record<string, unknown> = {};
      if (task["task_type"] === "probe")
        metadata = {
          duration_seconds: length,
          video_duration_seconds: length,
          fps: 30,
          width: 720,
          height: 1280,
        };
      else if (task["task_type"] === "measure_sync")
        metadata = { status: "measured", offset_seconds: 0 };
      else if (task["task_type"] === "lip_check") {
        const scores = lipScores.get(Number(clip["position"])) ?? [];
        const score = scores.length ? scores.shift()! : 7;
        metadata = {
          status: "scored",
          confidence: score,
          confidence_at_zero: score - 0.5,
          offset_frames: -1,
        };
      } else if (task["task_type"] === "extract_frames") {
        const params = ((task["input_payload"] as Record<string, unknown>)["params"] ??
          {}) as Record<string, unknown>;
        const index = Number(params["index"] ?? Math.round(length * 30) - 1);
        task["result_asset_id"] = db.add("assets", {
          asset_type: "image",
          storage_bucket: "b",
          storage_path: "frame.png",
        })["id"];
        metadata = {
          frame_mode: "index",
          frame_index: index,
          frame_count: Math.round(length * 30),
          fps: 30,
          requested_index: index,
        };
      }
      task["status"] = "completed";
      task["output_payload"] = { metadata };
      await service.advanceForMediaTask(String(task["id"]));
      continue;
    }
    // Nothing waiting on the outside: a pass of the recovery job.
    await service.advanceLongVideo(runId);
    const run = db.find("long_videos", runId)!;
    if (run["status"] !== "running") return;
  }
}

describe("a presenter video with cutaways, every clip from one still", async () => {
  const plan = planVoiceoverClips({
    analysis: read,
    first: wan27,
    continuation: wan27,
    cutaways: [
      { start: 9.4, end: 18.6 },
      { start: 28, end: 37.1 },
    ],
  });
  const started = await service.startLongVideo({
    userId: String(user["id"]),
    title: "Janice presents",
    firstModelId: wan27.id,
    continuationModelId: wan27.id,
    story: presenterPrompt({ who: "Janice", where: "her office at dusk" }),
    continuity: "",
    values: presenterValues(wan27, { resolution: "720p", prompt: "Janice speaks" }),
    references: [{ assetId: String(still["id"]), role: "source" }],
    clips: plan.segments.map((segment) => ({
      beat: "",
      durationSeconds: segment.requestSeconds,
      prompt: presenterPrompt({ who: "Janice" }),
    })),
    finale: null,
    projectId: null,
    campaignId: null,
    clientRequestId: "presenter-run-test",
    voiceover: {
      preparationId: String(preparation["id"]),
      pieces: plan.segments.map(({ start, end, requestSeconds }) => ({
        start,
        end,
        requestSeconds,
      })),
      cutaways: plan.cutaways,
    },
    startFrom: "anchor",
    qc: { lipCheck: true, takes: 2 },
  });
  const runId = started.longVideoId;
  const clips = () =>
    db
      .rows("long_video_clips")
      .filter((clip) => clip["long_video_id"] === runId)
      .sort((a, b) => Number(a["position"]) - Number(b["position"]));

  test("makes clips for the presenter's lines only, and starts three side by side from the still", () => {
    expect(plan.problem).toBeNull();
    expect(clips().length).toBe(plan.segments.length);
    expect(clips().length).toBeGreaterThan(3);
    const run = db.find("long_videos", runId)!;
    expect(run["start_from"]).toBe("anchor");
    expect(run["anchor_frame_asset_id"]).toBe(still["id"]);
    const generating = clips().filter((clip) => clip["status"] === "generating");
    expect(generating.length).toBe(3);
    expect(clips()[3]!["status"]).toBe("waiting");
    for (const clip of generating.slice(1)) expect(clip["start_frame_asset_id"]).toBe(still["id"]);
    // Each sent the still and its own piece of the voiceover, with no camera line.
    for (const request of requests) {
      const inputs = request["inputs"] as { assetId: string; role: string }[];
      expect(inputs.find((item) => item.role === "source")?.assetId).toBe(String(still["id"]));
      expect(inputs.some((item) => item.role === "audio")).toBe(true);
      const parameters = request["parameters"] as Record<string, unknown>;
      expect(String(parameters["prompt"])).not.toContain("Camera continuity");
    }
  });

  test("scores every clip's lips, makes a poor take again, and finishes without handoff frames", async () => {
    await settleAll(runId);
    const run = db.find("long_videos", runId)!;
    expect(run["status"]).toBe("completed");
    const all = clips();
    const second = all[1]!;
    // Its first take scored 3.1: made again, and the new take (7.4) kept.
    expect(second["attempt"]).toBe(2);
    expect(Number(second["lip_score"])).toBeCloseTo(7.4, 3);
    const takes = db
      .rows("long_video_clip_takes")
      .filter((take) => take["clip_id"] === second["id"]);
    expect(takes.length).toBe(1);
    expect(Number(takes[0]!["lip_score"])).toBeCloseTo(3.1, 3);
    expect(requests.some((request) => request["clientRequestId"] === `lvc:${second["id"]}:2`)).toBe(
      true,
    );
    // No clip starts from another's frame: only the last takes one (for the end card).
    for (const clip of all.slice(0, -1)) expect(clip["handoff_status"]).toBe("not_needed");
    expect(all.at(-1)!["handoff_status"]).toBe("ready");
    for (const clip of all) expect(clip["lip_status"]).toBe("scored");
  });

  test("opens as one edit: the presenter on the voiceover's clock, placeholders for the B-roll", async () => {
    const opened = await service.openLongVideoInEditor({
      longVideoId: runId,
      userId: String(user["id"]),
      seam: "smart",
      keepSound: false,
      fresh: true,
      captions: false,
    });
    const sequence = db.find("sequences", opened.sequenceId)!;
    const timeline = sequence["timeline"] as { clips: { label?: string; trimStart: number }[] };
    const labels = timeline.clips.map((clip) => clip.label ?? "");
    expect(labels.filter((label) => label.endsWith("add B-roll here")).length).toBe(2);
    expect(labels.filter((label) => label.startsWith("Clip ")).length).toBe(clips().length);
    // The lips lead their sound by a frame (SyncNet −1 at 25 fps): taken out of the trim.
    expect(timeline.clips[0]!.trimStart).toBeGreaterThan(0);
  });

  test("a held clip waits, and the run carries on once it is released", async () => {
    const plan2 = planVoiceoverClips({
      analysis: read,
      first: wan27,
      continuation: wan27,
      cutaways: [{ start: 28, end: 37.1 }],
    });
    const second = await service.startLongVideo({
      userId: String(user["id"]),
      title: "Held",
      firstModelId: wan27.id,
      continuationModelId: wan27.id,
      story: "Janice speaks",
      continuity: "",
      values: { resolution: "720p", prompt: "Janice speaks" },
      references: [{ assetId: String(still["id"]), role: "source" }],
      clips: plan2.segments.map((segment) => ({
        beat: "",
        durationSeconds: segment.requestSeconds,
        prompt: "Janice speaks",
      })),
      finale: null,
      projectId: null,
      campaignId: null,
      clientRequestId: "held-run-test",
      voiceover: {
        preparationId: String(preparation["id"]),
        pieces: plan2.segments.map(({ start, end, requestSeconds }) => ({
          start,
          end,
          requestSeconds,
        })),
        cutaways: plan2.cutaways,
      },
      startFrom: "anchor",
    });
    const own = () =>
      db
        .rows("long_video_clips")
        .filter((clip) => clip["long_video_id"] === second.longVideoId)
        .sort((a, b) => Number(a["position"]) - Number(b["position"]));
    const last = own().at(-1)!;
    expect(last["status"]).toBe("waiting");
    await service.holdLongVideoClip({ clipId: String(last["id"]), held: true });
    await settleAll(second.longVideoId);
    const run = db.find("long_videos", second.longVideoId)!;
    expect(run["status"]).toBe("needs_attention");
    expect(run["error_code"]).toBe("CLIP_HELD");
    expect(own().at(-1)!["status"]).toBe("waiting");
    await service.holdLongVideoClip({ clipId: String(last["id"]), held: false });
    await settleAll(second.longVideoId);
    expect(db.find("long_videos", second.longVideoId)!["status"]).toBe("completed");
  });

  test("a plain chain still makes one clip after another, each from the frame the last is cut on", async () => {
    const plan3 = planVoiceoverClips({ analysis: read, first: wan27, continuation: wan27 });
    const chain = await service.startLongVideo({
      userId: String(user["id"]),
      title: "Chain",
      firstModelId: wan27.id,
      continuationModelId: wan27.id,
      story: "Janice speaks",
      continuity: "",
      values: { resolution: "720p", prompt: "Janice speaks" },
      references: [{ assetId: String(still["id"]), role: "source" }],
      clips: plan3.segments.map((segment) => ({
        beat: "",
        durationSeconds: segment.requestSeconds,
        prompt: "Janice speaks",
      })),
      finale: null,
      projectId: null,
      campaignId: null,
      clientRequestId: "chain-run-test",
      voiceover: {
        preparationId: String(preparation["id"]),
        pieces: plan3.segments.map(({ start, end, requestSeconds }) => ({
          start,
          end,
          requestSeconds,
        })),
      },
    });
    const own = () =>
      db
        .rows("long_video_clips")
        .filter((clip) => clip["long_video_id"] === chain.longVideoId)
        .sort((a, b) => Number(a["position"]) - Number(b["position"]));
    const run = db.find("long_videos", chain.longVideoId)!;
    expect(run["start_from"]).toBe("chain");
    expect(run["anchor_frame_asset_id"]).toBeNull();
    expect(own().filter((clip) => clip["status"] === "generating").length).toBe(1);
    await settleAll(chain.longVideoId);
    expect(db.find("long_videos", chain.longVideoId)!["status"]).toBe("completed");
    const all = own();
    for (const clip of all) expect(clip["handoff_status"]).toBe("ready");
    for (let index = 1; index < all.length; index += 1)
      expect(all[index]!["start_frame_asset_id"]).toBe(all[index - 1]!["handoff_asset_id"]);
  });

  test("a chain with cutaways starts again from the still after each cutaway, and chains within a section", async () => {
    const plan4 = planVoiceoverClips({
      analysis: read,
      first: wan27,
      continuation: wan27,
      cutaways: [{ start: 9.4, end: 18.6 }],
      maxClipSeconds: 8,
    });
    const run4 = await service.startLongVideo({
      userId: String(user["id"]),
      title: "Chain with B-roll",
      firstModelId: wan27.id,
      continuationModelId: wan27.id,
      story: "Janice speaks",
      continuity: "",
      values: { resolution: "720p", prompt: "Janice speaks" },
      references: [{ assetId: String(still["id"]), role: "source" }],
      clips: plan4.segments.map((segment) => ({
        beat: "",
        durationSeconds: segment.requestSeconds,
        prompt: "Janice speaks",
      })),
      finale: null,
      projectId: null,
      campaignId: null,
      clientRequestId: "chain-broll-test",
      voiceover: {
        preparationId: String(preparation["id"]),
        pieces: plan4.segments.map(({ start, end, requestSeconds }) => ({
          start,
          end,
          requestSeconds,
        })),
        cutaways: plan4.cutaways,
      },
    });
    const own = () =>
      db
        .rows("long_video_clips")
        .filter((clip) => clip["long_video_id"] === run4.longVideoId)
        .sort((a, b) => Number(a["position"]) - Number(b["position"]));
    // The clip right after the cutaway starts with the first, from the still.
    const afterCutaway = own().findIndex((clip) => Number(clip["audio_start_seconds"]) > 17);
    expect(afterCutaway).toBeGreaterThan(0);
    const started = own()
      .filter((clip) => clip["status"] === "generating")
      .map((clip) => clip["position"]);
    expect(started).toEqual([0, afterCutaway]);
    expect(own()[afterCutaway]!["start_frame_asset_id"]).toBe(still["id"]);
    await settleAll(run4.longVideoId);
    expect(db.find("long_videos", run4.longVideoId)!["status"]).toBe("completed");
    const all = own();
    // Within a section each clip starts from the frame the one before is cut on.
    for (let index = 1; index < all.length; index += 1) {
      if (index === afterCutaway) continue;
      expect(all[index]!["start_frame_asset_id"]).toBe(all[index - 1]!["handoff_asset_id"]);
    }
    // The clip before the cutaway hands nothing on.
    expect(all[afterCutaway - 1]!["handoff_status"]).toBe("not_needed");
  });

  test("stops cleanly when the balance runs out, and Continue makes the clip again", async () => {
    const plan5 = planVoiceoverClips({
      analysis: read,
      first: wan27,
      continuation: wan27,
      cutaways: [{ start: 28, end: 37.1 }],
    });
    const run5 = await service.startLongVideo({
      userId: String(user["id"]),
      title: "Credits",
      firstModelId: wan27.id,
      continuationModelId: wan27.id,
      story: "Janice speaks",
      continuity: "",
      values: { resolution: "720p", prompt: "Janice speaks" },
      references: [{ assetId: String(still["id"]), role: "source" }],
      clips: plan5.segments.map((segment) => ({
        beat: "",
        durationSeconds: segment.requestSeconds,
        prompt: "Janice speaks",
      })),
      finale: null,
      projectId: null,
      campaignId: null,
      clientRequestId: "credits-run-test",
      voiceover: {
        preparationId: String(preparation["id"]),
        pieces: plan5.segments.map(({ start, end, requestSeconds }) => ({
          start,
          end,
          requestSeconds,
        })),
        cutaways: plan5.cutaways,
      },
      startFrom: "anchor",
    });
    const own = () =>
      db
        .rows("long_video_clips")
        .filter((clip) => clip["long_video_id"] === run5.longVideoId)
        .sort((a, b) => Number(a["position"]) - Number(b["position"]));
    const refused = own()[1]!;
    outOfCredits.add(String(refused["id"]));
    await settleAll(run5.longVideoId);
    const stopped = db.find("long_videos", run5.longVideoId)!;
    expect(stopped["status"]).toBe("needs_attention");
    expect(stopped["error_code"]).toBe("INSUFFICIENT_PROVIDER_BALANCE");
    expect(String(stopped["error_message"])).toContain("nothing was charged");
    await service.continueLongVideo(run5.longVideoId);
    await settleAll(run5.longVideoId);
    expect(db.find("long_videos", run5.longVideoId)!["status"]).toBe("completed");
    expect(db.find("long_video_clips", refused["id"])!["attempt"]).toBe(2);
  });
});
