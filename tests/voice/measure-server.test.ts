import { describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

/**
 * A voice measured through the API's server code, against a stand-in
 * database: the media service is a stand-in too, so nothing is called. Its
 * report is recorded by hand, as the media service's callback records one.
 */
const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
// The member asking, as the real check reads them (a stand-in for it would outlive this file).
db.add("profiles", { id: "u", is_active: true, role: "member" });
const featuresAsked: string[] = [];
mock.module("@/lib/media/worker-feature.server", () => ({
  requireWorkerFeature: async (feature: string) => {
    featuresAsked.push(feature);
  },
}));
const queued: Record<string, unknown>[] = [];
mock.module("@/lib/media/enqueue.server", () => ({
  enqueueInternalMediaTask: async (request: Record<string, unknown>) => {
    queued.push(request);
    const id = crypto.randomUUID();
    db.add("media_tasks", {
      id,
      status: "processing",
      dedupe_key: request["dedupeKey"],
      task_type: request["taskType"],
      output_payload: null,
      error_message: null,
    });
    return { ok: true, taskId: id, duplicate: false };
  },
}));

const { measureVoice } = await import("../../src/lib/voice/measure.server");

const TAKE = "11111111-1111-4111-8111-111111111111";
const REFERENCE = "22222222-2222-4222-8222-222222222222";
const STILL = "33333333-3333-4333-8333-333333333333";
const asset = (id: string, type: string) =>
  db.add("assets", {
    id,
    asset_type: type,
    storage_bucket: "generated-assets",
    storage_path: `projects/p/${id}`,
    mime_type: type === "video" ? "video/mp4" : type === "audio" ? "audio/wav" : "image/png",
    project_id: "44444444-4444-4444-8444-444444444444",
    deleted_at: null,
  });
asset(TAKE, "audio");
asset(REFERENCE, "video");
asset(STILL, "image");

const REPORT = {
  voice: {
    seconds: 42.8,
    status: "measured",
    speech_seconds: 28.9,
    phrases: 20,
    phrase_spans: [],
    syllables: 148,
    syllables_per_second: 5.12,
    pitch_hz: { median: 235.3, p25: 213.3, p75: 262.3, frames: 2071 },
    phrase_end_drop_db: { median: 16.3, ends: 15, values: [] },
    dryness: "dry",
    loudness: { integrated_lufs: -20.6, range_lu: 5, true_peak_dbtp: -6.2 },
  },
  reference: {
    seconds: 45.5,
    status: "measured",
    speech_seconds: 31.5,
    phrases: 23,
    phrase_spans: [],
    syllables: 139,
    syllables_per_second: 4.41,
    pitch_hz: { median: 235.3, p25: 216.2, p75: 266.7, frames: 2195 },
    phrase_end_drop_db: { median: 15.1, ends: 17, values: [] },
    dryness: "dry",
    loudness: { integrated_lufs: -20.3, range_lu: 6.1, true_peak_dbtp: -0.9 },
  },
  compared: {
    pitch_semitones: 0,
    pace_ratio: 1.161,
    phrase_end_drop_db_difference: 1.2,
    loudness_lu_difference: -0.3,
  },
};

describe("measure_voice", () => {
  test("starts the media service's measure_voice with the take and its reference, then reads its report", async () => {
    const started = await measureVoice({
      userId: "u",
      assetId: TAKE,
      referenceAssetId: REFERENCE,
      start: 0.5,
      referenceEnd: 44,
      dedupeKey: "voice-measure:u:take-against-reference",
      waitMs: 0,
    });
    expect(started.status).toBe("measuring");
    expect(featuresAsked).toEqual(["voice_measure"]);
    const request = queued[0]!;
    expect(request["taskType"]).toBe("measure_voice");
    expect((request["source"] as { assetId: string }).assetId).toBe(TAKE);
    expect(request["extraSources"]).toEqual([
      expect.objectContaining({ assetId: REFERENCE, assetType: "video", role: "reference" }),
    ]);
    expect(request["params"]).toEqual({ start: 0.5, reference_end: 44 });
    expect(request["output"]).toEqual({
      count: 0,
      ext: "json",
      mime: "application/json",
      kind: "audio",
    });

    // The media service reports; asking again with the same key reads it and measures nothing new.
    const task = db
      .rows("media_tasks")
      .find((row) => row["dedupe_key"] === "voice-measure:u:take-against-reference")!;
    task["status"] = "completed";
    task["output_payload"] = { asset_ids: [], metadata: REPORT };
    const done = await measureVoice({
      userId: "u",
      assetId: TAKE,
      referenceAssetId: REFERENCE,
      dedupeKey: "voice-measure:u:take-against-reference",
      waitMs: 0,
    });
    expect(queued).toHaveLength(1);
    expect(done.status).toBe("completed");
    expect(done.measurement?.compared?.pace_ratio).toBe(1.161);
    expect(done.summary.at(-1)).toBe(
      "Against the reference: the same pitch, 16% faster, as dry, as loud.",
    );
  });

  test("a failed measurement says why", async () => {
    await measureVoice({
      userId: "u",
      assetId: TAKE,
      dedupeKey: "voice-measure:u:fails",
      waitMs: 0,
    });
    const task = db
      .rows("media_tasks")
      .find((row) => row["dedupe_key"] === "voice-measure:u:fails")!;
    task["status"] = "failed";
    task["error_message"] = "It has no sound to measure";
    const state = await measureVoice({
      userId: "u",
      assetId: TAKE,
      dedupeKey: "voice-measure:u:fails",
      waitMs: 0,
    });
    expect(state).toMatchObject({
      status: "failed",
      message: "It has no sound to measure",
      measurement: null,
    });
  });

  test("a picture, a missing file or a recording held against itself is refused before anything starts", async () => {
    const before = queued.length;
    await expect(
      measureVoice({ userId: "u", assetId: STILL, dedupeKey: "k1", waitMs: 0 }),
    ).rejects.toThrow("not a picture");
    await expect(
      measureVoice({
        userId: "u",
        assetId: "55555555-5555-4555-8555-555555555555",
        dedupeKey: "k2",
        waitMs: 0,
      }),
    ).rejects.toThrow("no longer in the library");
    await expect(
      measureVoice({
        userId: "u",
        assetId: TAKE,
        referenceAssetId: TAKE,
        dedupeKey: "k3",
        waitMs: 0,
      }),
    ).rejects.toThrow("its own reference");
    await expect(
      measureVoice({ userId: "u", assetId: TAKE, start: 5, end: 2, dedupeKey: "k4", waitMs: 0 }),
    ).rejects.toThrow("end must come after start");
    expect(queued.length).toBe(before);
  });
});
