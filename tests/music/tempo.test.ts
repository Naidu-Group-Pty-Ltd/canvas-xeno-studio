import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

/**
 * A library track at another tempo, its pitch kept (Reel 2: Reel 1's track,
 * 129 BPM, under a cut paced to 120): a new track the media service makes,
 * with the original's licence, and ready once it is in.
 */
const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
// The output's place in storage, as the media task is recorded with it.
db.storage = {
  from: () => ({
    remove: async () => ({ error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
    createSignedUploadUrl: async (path: string) => ({
      data: { signedUrl: `https://example.test/upload/${path}` },
      error: null,
    }),
  }),
} as unknown as FakeDb["storage"];

type Service = typeof import("../../src/lib/music/service.server");
let music: Service;

const realFetch = globalThis.fetch;
const env = {
  url: process.env["MEDIA_WORKER_URL"],
  secret: process.env["MEDIA_WORKER_SHARED_SECRET"],
};
const worker = { features: ["audio_stretch"], sent: [] as Record<string, unknown>[] };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/health"))
    return Response.json({ ok: true, features: worker.features, tasks: ["stretch_audio"] });
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  worker.sent.push(body);
  return Response.json({ accepted: true, task_id: body["task_id"] }, { status: 202 });
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
  if (env.url === undefined) delete process.env["MEDIA_WORKER_URL"];
  else process.env["MEDIA_WORKER_URL"] = env.url;
  if (env.secret === undefined) delete process.env["MEDIA_WORKER_SHARED_SECRET"];
  else process.env["MEDIA_WORKER_SHARED_SECRET"] = env.secret;
});

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let parentId = "";
beforeEach(async () => {
  music ??= await import("../../src/lib/music/service.server");
  process.env["MEDIA_WORKER_URL"] = "https://xeno-media-worker.example.test";
  process.env["MEDIA_WORKER_SHARED_SECRET"] = "0123456789abcdef";
  db.tables.clear();
  worker.features = ["audio_stretch"];
  worker.sent = [];
  db.add("profiles", { id: USER, is_active: true, role: "member" });
  const asset = db.add("assets", {
    asset_type: "audio",
    title: "National Treasures (Instrumental).mp3",
    storage_bucket: "generated-assets",
    storage_path: "music/national-treasures.mp3",
    mime_type: "audio/mpeg",
    project_id: null,
    deleted_at: null,
  });
  parentId = String(
    db.add("music_tracks", {
      asset_id: asset["id"],
      title: "National Treasures (Instrumental)",
      artist: "Drake",
      kind: "music",
      source: "upload",
      provider: null,
      license: "owned",
      rights: { licensor: "The brand" },
      attribution: null,
      usage_notes: null,
      bpm: 128.99,
      status: "ready",
      instrumental: true,
      project_id: null,
      created_by: USER,
      created_at: new Date().toISOString(),
    })["id"],
  );
});

const ask = (bpm: number, extra: Record<string, unknown> = {}) =>
  music.changeTempo({
    userId: USER,
    trackId: parentId,
    bpm,
    clientRequestId: `tempo-${bpm}-${JSON.stringify(extra).length}`,
    ...extra,
  });

describe("a track at another tempo", () => {
  test("is a new track with the original's licence, asked of the media service, and ready once it is in", async () => {
    const made = await ask(120);
    expect(made.duplicate).toBe(false);
    expect(made.tempo).toBeCloseTo(120 / 128.99, 9);
    expect(made.note).toBeNull();
    expect(made.track).toMatchObject({
      title: "National Treasures (Instrumental) (at 120 BPM)",
      source: "derived",
      provider: "tempo",
      source_id: parentId,
      parent_track_id: null,
      license: "owned",
      rights: { licensor: "The brand" },
      bpm: 120,
      instrumental: true,
      status: "generating",
      usage_notes: "Slowed 7.0% from 128.99 to 120 BPM, its pitch kept.",
    });
    // The media service was asked to stretch the original, at that tempo, into one lossless file.
    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0]).toMatchObject({ task_type: "stretch_audio" });
    expect((worker.sent[0]!["params"] as { tempo: number }).tempo).toBeCloseTo(0.930305, 5);
    const task = db
      .rows("media_tasks")
      .find((row) => row["dedupe_key"] === `tempo:${made.track.id}`)!;
    expect(task["input_payload"]).toMatchObject({
      tempo_track_id: made.track.id,
      output_title: "National Treasures (Instrumental) (at 120 BPM)",
      mime_type: "audio/flac",
    });
    // Asked again: the same track, nothing sent again.
    expect((await ask(120)).duplicate).toBe(true);
    expect(worker.sent).toHaveLength(1);
    // The media service reports: the track takes the new recording.
    Object.assign(task, {
      status: "completed",
      result_asset_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      output_payload: { metadata: { duration_seconds: 292.645, stretch: { tool: "rubberband" } } },
    });
    expect(await music.finishTempoChange(made.track.id)).toBe(true);
    expect(db.find("music_tracks", made.track.id)).toMatchObject({
      status: "ready",
      asset_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      duration_seconds: 292.645,
    });
    // A tempo track is not taken for the original's instrumental.
    expect(
      db.rows("music_tracks").filter((row) => row["parent_track_id"] === parentId),
    ).toHaveLength(0);
  });

  test("a task the media service failed fails the track, saying why", async () => {
    const made = await ask(140);
    const task = db
      .rows("media_tasks")
      .find((row) => row["dedupe_key"] === `tempo:${made.track.id}`)!;
    Object.assign(task, { status: "failed", error_message: "ffmpeg failed: no audio" });
    expect(await music.finishTempoChange(made.track.id)).toBe(true);
    expect(db.find("music_tracks", made.track.id)).toMatchObject({
      status: "failed",
      error_message: "ffmpeg failed: no audio",
    });
    // Still under way: nothing changes.
    const other = await ask(125);
    expect(await music.finishTempoChange(other.track.id)).toBe(false);
    expect(db.find("music_tracks", other.track.id)!["status"]).toBe("generating");
  });

  test("a change of more than about 12% is made, and the answer says it can be heard", async () => {
    const made = await ask(100);
    expect(made.note).toBe(
      "That is 22%: past about 12%, a change of tempo can be heard. Listen to it before using it.",
    );
    expect(made.track["usage_notes"]).toBe("Slowed 22.5% from 128.99 to 100 BPM, its pitch kept.");
  });

  test("what can't be done is refused, before anything is recorded or sent", async () => {
    await expect(ask(300)).rejects.toThrow(
      "too far: a track's tempo can be halved or doubled at most",
    );
    await expect(ask(128.99)).rejects.toThrow("It already plays at 128.99 BPM.");
    db.find("music_tracks", parentId)!["bpm"] = null;
    await expect(ask(120)).rejects.toThrow("This track's tempo isn't known yet");
    expect((await ask(120, { fromBpm: 129 })).track["usage_notes"]).toBe(
      "Slowed 7.0% from 129 to 120 BPM, its pitch kept.",
    );
    // Only the one the media service could make was sent.
    expect(worker.sent).toHaveLength(1);
  });
});
