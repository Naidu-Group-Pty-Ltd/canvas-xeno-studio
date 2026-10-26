import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

/**
 * A recording transcribed through the API's server code, against a stand-in
 * database: the media service is a stand-in, its speech copy is put in
 * storage by hand as its callback would record it, and OpenAI answers from a
 * stand-in fetch, so nothing is called.
 */
class StorageDb extends FakeDb {
  files = new Map<string, Uint8Array>();
  override storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = this.files.get(`${bucket}/${path}`);
        return bytes
          ? { data: new Blob([new Uint8Array(bytes)]), error: null }
          : { data: null, error: { message: "Object not found" } };
      },
      remove: async (paths: string[]) => {
        for (const path of paths) this.files.delete(`${bucket}/${path}`);
        return { error: null };
      },
      createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
    }),
  };
}

const db = new StorageDb();
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
      input_payload: { ...(request["context"] as object) },
      output_payload: null,
      error_message: null,
    });
    return { ok: true, taskId: id, duplicate: false };
  },
}));

const { transcribeAudio } = await import("../../src/lib/voice/transcribe.server");

const TAKE = "11111111-1111-4111-8111-111111111111";
const FILM = "22222222-2222-4222-8222-222222222222";
const STILL = "33333333-3333-4333-8333-333333333333";
const KIT = "55555555-5555-4555-8555-555555555555";
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
asset(FILM, "video");
asset(STILL, "image");
db.add("brand_kits", { id: KIT, is_default: true, is_archived: false, terms: ["Aurixa"] });
db.add("brand_kits", {
  id: "66666666-6666-4666-8666-666666666666",
  is_default: false,
  is_archived: false,
  terms: ["Xeno Studio"],
});

/** What OpenAI was asked, in order: the form's fields and the file's size. */
const asked: { fields: Record<string, string>; bytes: number }[] = [];
/** OpenAI's next answers, first first; a transcript when none is set. */
const answers: Response[] = [];
const realFetch = globalThis.fetch;
const realKey = process.env["OPENAI_API_KEY"];

const HEARD = {
  text: "We are Arixa Systems. Built as one.",
  language: "english",
  duration: 3.4,
  words: [
    { word: "We", start: 0.1, end: 0.3 },
    { word: "are", start: 0.3, end: 0.5 },
    { word: "Arixa", start: 0.5, end: 0.9 },
    { word: "Systems", start: 0.9, end: 1.5 },
    { word: "Built", start: 2.0, end: 2.3 },
    { word: "as", start: 2.3, end: 2.5 },
    { word: "one", start: 2.5, end: 2.9 },
  ],
};

beforeAll(() => {
  process.env["OPENAI_API_KEY"] = "test-key";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== "https://api.openai.com/v1/audio/transcriptions")
      return new Response("not found", { status: 404 });
    const form = init?.body as FormData;
    const fields: Record<string, string> = {};
    let bytes = 0;
    for (const [name, value] of form.entries())
      if (typeof value === "string") fields[name] = value;
      else bytes = value.size;
    asked.push({ fields, bytes });
    return answers.shift() ?? new Response(JSON.stringify(HEARD), { status: 200 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env["OPENAI_API_KEY"];
  else process.env["OPENAI_API_KEY"] = realKey;
});

/** The media service's speech copy, recorded as its callback records one kept out of the library. */
function extracted(dedupeKey: string, bytes = 4096) {
  const task = db.rows("media_tasks").find((row) => row["dedupe_key"] === dedupeKey)!;
  const path = `internal/${task["id"]}/audio.mp3`;
  db.files.set(`generated-assets/${path}`, new Uint8Array(bytes).fill(7));
  task["status"] = "completed";
  task["output_payload"] = {
    asset_ids: [],
    files: [{ bucket: "generated-assets", path, timestamp_seconds: null }],
    metadata: { duration_seconds: 3.4 },
    duration_ms: 900,
  };
  return task;
}

describe("transcribe_audio", () => {
  test("takes the speech out, hears it with the brand's names, puts them right and keeps it", async () => {
    const key = "transcribe:u:as-one-reference";
    const started = await transcribeAudio({
      userId: "u",
      assetId: FILM,
      language: "EN",
      terms: ["Aurixa Systems"],
      dedupeKey: key,
      waitMs: 0,
    });
    expect(started.status).toBe("extracting");
    expect(featuresAsked).toEqual(["speech_audio"]);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      taskType: "extract_audio",
      source: { assetId: FILM, assetType: "video" },
      params: { format: "mp3", speech: true },
      dedupeKey: key,
      output: { count: 1, ext: "mp3", mime: "audio/mpeg", kind: "audio" },
      context: { register_outputs: false, transcribe: true },
    });
    expect(asked).toHaveLength(0);

    const task = extracted(key);
    const done = await transcribeAudio({
      userId: "u",
      assetId: FILM,
      language: "en",
      terms: ["Aurixa Systems"],
      dedupeKey: key,
      waitMs: 0,
    });
    expect(queued).toHaveLength(1);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.bytes).toBe(4096);
    expect(asked[0]!.fields).toMatchObject({
      model: "whisper-1",
      response_format: "verbose_json",
      "timestamp_granularities[]": "word",
      language: "en",
      // The names given, then the default kit's.
      prompt: "Aurixa Systems, Aurixa.",
    });
    expect(done).toMatchObject({
      taskId: task["id"],
      status: "completed",
      text: "We are Aurixa Systems. Built as one.",
      durationSeconds: 3.4,
      language: "english",
      terms: ["Aurixa Systems", "Aurixa"],
      corrections: [{ heard: "Arixa", written: "Aurixa", at: 0.5 }],
      message: null,
    });
    expect(done.words.map((word) => word.text).slice(0, 4)).toEqual([
      "We",
      "are",
      "Aurixa",
      "Systems",
    ]);
    // Kept with its task, and the speech copy goes: asking again reads it, and OpenAI isn't asked (or paid) again.
    const [copy] = (task["output_payload"] as { files: { bucket: string; path: string }[] }).files;
    expect(db.files.has(`${copy!.bucket}/${copy!.path}`)).toBe(false);
    const again = await transcribeAudio({
      userId: "u",
      assetId: FILM,
      dedupeKey: key,
      waitMs: 0,
    });
    expect(asked).toHaveLength(1);
    expect(again).toEqual(done);
  });

  test("a brand kit named gives its own names", async () => {
    const key = "transcribe:u:named-kit";
    await transcribeAudio({ userId: "u", assetId: TAKE, dedupeKey: key, waitMs: 0 });
    extracted(key);
    const done = await transcribeAudio({
      userId: "u",
      assetId: TAKE,
      brandKitId: "66666666-6666-4666-8666-666666666666",
      dedupeKey: key,
      waitMs: 0,
    });
    expect(done.terms).toEqual(["Xeno Studio"]);
    expect(asked.at(-1)!.fields["prompt"]).toBe("Xeno Studio.");
    expect(asked.at(-1)!.fields["language"]).toBeUndefined();
    // A kit that isn't there is said before anything is started.
    const before = queued.length;
    await expect(
      transcribeAudio({
        userId: "u",
        assetId: TAKE,
        brandKitId: "77777777-7777-4777-8777-777777777777",
        dedupeKey: "transcribe:u:missing-kit",
        waitMs: 0,
      }),
    ).rejects.toThrow("That brand kit doesn't exist");
    expect(queued).toHaveLength(before);
  });

  test("OpenAI's refusal says why, keeps nothing, and the same key hears it again later", async () => {
    const key = "transcribe:u:rate-limited";
    await transcribeAudio({ userId: "u", assetId: TAKE, dedupeKey: key, waitMs: 0 });
    const task = extracted(key);
    answers.push(
      new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 }),
    );
    const refused = await transcribeAudio({
      userId: "u",
      assetId: TAKE,
      dedupeKey: key,
      waitMs: 0,
    }).catch((error: unknown) => error as { code: string; message: string });
    expect(refused).toMatchObject({ code: "RATE_LIMITED" });
    expect((task["output_payload"] as Record<string, unknown>)["transcript"]).toBeUndefined();
    // The speech copy stays, to be heard again.
    const [copy] = (task["output_payload"] as { files: { bucket: string; path: string }[] }).files;
    expect(db.files.has(`${copy!.bucket}/${copy!.path}`)).toBe(true);
    const heard = await transcribeAudio({ userId: "u", assetId: TAKE, dedupeKey: key, waitMs: 0 });
    expect(heard.status).toBe("completed");
    expect(queued.filter((request) => request["dedupeKey"] === key)).toHaveLength(1);
  });

  test("a speech copy that couldn't be made says why", async () => {
    const key = "transcribe:u:no-sound";
    await transcribeAudio({ userId: "u", assetId: FILM, dedupeKey: key, waitMs: 0 });
    const task = db.rows("media_tasks").find((row) => row["dedupe_key"] === key)!;
    task["status"] = "failed";
    task["error_message"] = "That video has no audio track";
    const state = await transcribeAudio({ userId: "u", assetId: FILM, dedupeKey: key, waitMs: 0 });
    expect(state).toMatchObject({
      status: "failed",
      message: "That video has no audio track. Ask again with a new clientRequestId.",
    });
  });

  test("refuses a picture, a file gone, a language it can't name, and a studio without OpenAI", async () => {
    const before = queued.length;
    await expect(
      transcribeAudio({ userId: "u", assetId: STILL, dedupeKey: "transcribe:u:still", waitMs: 0 }),
    ).rejects.toThrow("Speech is transcribed from an audio file or a video");
    await expect(
      transcribeAudio({
        userId: "u",
        assetId: "88888888-8888-4888-8888-888888888888",
        dedupeKey: "transcribe:u:gone",
        waitMs: 0,
      }),
    ).rejects.toThrow("That file is no longer in the library");
    await expect(
      transcribeAudio({
        userId: "u",
        assetId: TAKE,
        language: "english",
        dedupeKey: "transcribe:u:language",
        waitMs: 0,
      }),
    ).rejects.toThrow("language: two letters");
    delete process.env["OPENAI_API_KEY"];
    try {
      await expect(
        transcribeAudio({
          userId: "u",
          assetId: TAKE,
          dedupeKey: "transcribe:u:no-key",
          waitMs: 0,
        }),
      ).rejects.toThrow("OPENAI_API_KEY");
    } finally {
      process.env["OPENAI_API_KEY"] = "test-key";
    }
    expect(queued).toHaveLength(before);
  });
});
