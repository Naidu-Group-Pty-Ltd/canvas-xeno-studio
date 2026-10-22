import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

// The database as a stand-in, and the media service as a stand-in behind fetch: nothing is sent anywhere.
const db = new FakeDb();
db.storage = {
  from: () => ({
    remove: async () => ({ error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
    createSignedUploadUrl: async () => ({
      data: { signedUrl: "https://example.test/upload" },
      error: null,
    }),
  }),
} as unknown as FakeDb["storage"];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const { startReviewSheet, reviewSheetOf } = await import("../../src/lib/edit/review-sheet.server");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIDEO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TAKE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const realFetch = globalThis.fetch;
const env = {
  url: process.env["MEDIA_WORKER_URL"],
  secret: process.env["MEDIA_WORKER_SHARED_SECRET"],
};

/** What the media service was sent, and how it answers: its health, and each task in turn. */
const service = {
  features: ["render_quality", "review_sheet"],
  answers: [] as number[],
  sent: [] as Record<string, unknown>[],
};
function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/health"))
    return answer(200, { ok: true, features: service.features, tasks: ["review_sheet"] });
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  service.sent.push(body);
  const status = service.answers.shift() ?? 202;
  return status < 300
    ? answer(status, { accepted: true, task_id: body["task_id"] })
    : answer(status, { error_code: "MEDIA_WORKER_ERROR", error: "Something broke" });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
  if (env.url === undefined) delete process.env["MEDIA_WORKER_URL"];
  else process.env["MEDIA_WORKER_URL"] = env.url;
  if (env.secret === undefined) delete process.env["MEDIA_WORKER_SHARED_SECRET"];
  else process.env["MEDIA_WORKER_SHARED_SECRET"] = env.secret;
});

let renderId = "";
beforeEach(() => {
  process.env["MEDIA_WORKER_URL"] = "https://xeno-media-worker.example.test";
  process.env["MEDIA_WORKER_SHARED_SECRET"] = "0123456789abcdef";
  db.tables.clear();
  service.features = ["render_quality", "review_sheet"];
  service.answers = [];
  service.sent = [];
  db.add("profiles", { id: USER, is_active: true });
  db.add("assets", {
    id: VIDEO,
    asset_type: "video",
    storage_bucket: "generated-assets",
    storage_path: "projects/p/renders/v2.mp4",
    mime_type: "video/mp4",
    width: 1080,
    height: 1920,
    project_id: null,
  });
  const board = db.add("storyboards", { title: "Board" });
  const scene = db.add("scenes", { storyboard_id: board["id"], scene_number: 1 });
  const shot = db.add("shots", {
    scene_id: scene["id"],
    shot_number: 1,
    description: "The globe turns to Australia",
    prompt: "orbit",
  });
  db.add("shot_takes", { shot_id: shot["id"], asset_id: TAKE });
  const sequence = db.add("sequences", {
    title: "Aurixa reel",
    project_id: null,
    storyboard_id: board["id"],
    brief_id: null,
    source: { kind: "storyboard", storyboard_id: board["id"] },
  });
  renderId = String(
    db.add("sequence_renders", {
      sequence_id: sequence["id"],
      sequence_version: 2,
      status: "completed",
      asset_id: VIDEO,
      review_sheet_task_id: null,
      timeline: {
        fps: 30,
        clips: [
          { id: "one", assetId: TAKE, kind: "video", duration: 2, label: "1.1 Orbit" },
          { id: "two", assetId: OTHER, kind: "video", duration: 2, label: "Pins" },
        ],
      },
    })["id"],
  );
});

const render = () => db.find("sequence_renders", renderId)!;
const sheetTask = (id: string) => db.find("media_tasks", id)!;

describe("making a render's review sheet", () => {
  test("sends its shots, described from the storyboard, and links the task to the render", async () => {
    const started = await startReviewSheet({
      renderId,
      userId: USER,
      clientRequestId: "sheet-request-1",
    });
    expect(started).toEqual({ taskId: started.taskId, status: "processing", duplicate: false });
    expect(render()["review_sheet_task_id"]).toBe(started.taskId);

    const task = sheetTask(started.taskId);
    expect(task["task_type"]).toBe("review_sheet");
    const input = task["input_payload"] as Record<string, unknown>;
    expect(input["output_kind"]).toBe("image");
    expect(input["mime_type"]).toBe("image/jpeg");
    expect(input["output_title"]).toBe("Aurixa reel · review sheet · version 2");
    expect(input["storage_paths"]).toEqual([`unassigned/${USER}/derived/${started.taskId}/1.jpg`]);
    expect(input["sources"]).toEqual([VIDEO]);

    expect(service.sent).toHaveLength(1);
    const sent = service.sent[0]!;
    expect(sent["task_type"]).toBe("review_sheet");
    expect(sent["sources"]).toEqual([
      { role: "video", url: "https://example.test/file", mime: "video/mp4" },
    ]);
    const params = sent["params"] as { title: string; tiles: { label: string; note: string }[] };
    expect(params.title).toBe("Aurixa reel · version 2 · 0:04.0");
    expect(params.tiles).toEqual([
      { time: 0.5, label: "1 · 1.1 Orbit", note: "0:00.5 · The globe turns to Australia" },
      { time: 59 / 30, label: "1 · last frame", note: "0:01.9" },
      { time: 2.5, label: "2 · Pins", note: "0:02.5" },
      { time: 119 / 30, label: "2 · last frame", note: "0:03.9" },
    ]);
  });

  test("returns the sheet being made, or made, and makes it afresh only when asked", async () => {
    const first = await startReviewSheet({ renderId, userId: USER, clientRequestId: "request-a1" });
    const again = await startReviewSheet({ renderId, userId: USER, clientRequestId: "request-a2" });
    expect(again).toEqual({ taskId: first.taskId, status: "processing", duplicate: true });

    // Made, and in the library.
    const picture = db.add("assets", {
      asset_type: "image",
      storage_bucket: "generated-assets",
      storage_path: "sheet.jpg",
    });
    Object.assign(sheetTask(first.taskId), {
      status: "completed",
      result_asset_id: picture["id"],
    });
    const made = await startReviewSheet({ renderId, userId: USER, clientRequestId: "request-a3" });
    expect(made).toEqual({ taskId: first.taskId, status: "completed", duplicate: true });
    expect(await reviewSheetOf(first.taskId)).toEqual({
      taskId: first.taskId,
      status: "ready",
      assetId: String(picture["id"]),
      error: null,
      url: "https://example.test/file",
    });

    const afresh = await startReviewSheet({
      renderId,
      userId: USER,
      clientRequestId: "request-a4",
      again: true,
    });
    expect(afresh.duplicate).toBe(false);
    expect(afresh.taskId).not.toBe(first.taskId);
    expect(render()["review_sheet_task_id"]).toBe(afresh.taskId);

    // Deleted from the library: the render has none, and asking makes one.
    picture["deleted_at"] = new Date().toISOString();
    expect(await reviewSheetOf(first.taskId)).toBeNull();
  });

  test("sends a task the media service never confirmed taking again, never a second one", async () => {
    service.answers = [500, 500];
    let refused: unknown = null;
    try {
      await startReviewSheet({ renderId, userId: USER, clientRequestId: "request-b1" });
    } catch (error) {
      refused = error;
    }
    expect((refused as { code?: string }).code).toBe("SUBMISSION_UNCERTAIN");
    const taskId = String(render()["review_sheet_task_id"]);
    expect(sheetTask(taskId)["error_code"]).toBe("SUBMISSION_UNCERTAIN");

    const resent = await startReviewSheet({
      renderId,
      userId: USER,
      clientRequestId: "request-b2",
    });
    expect(resent).toEqual({ taskId, status: "processing", duplicate: true });
    expect(service.sent.map((body) => body["task_id"])).toEqual([taskId, taskId, taskId]);
    expect(db.rows("media_tasks")).toHaveLength(1);
  });

  test("is refused plainly for a render that isn't finished, or a media service that can't", async () => {
    const message = async () => {
      try {
        await startReviewSheet({ renderId, userId: USER, clientRequestId: "request-c1" });
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };
    render()["status"] = "rendering";
    expect(await message()).toBe("Only a finished render has a review sheet");
    render()["status"] = "completed";
    service.features = ["render_quality"];
    expect(await message()).toMatch(/can't make review sheets until it is updated/);
    expect(service.sent).toHaveLength(0);
    expect(db.rows("media_tasks")).toHaveLength(0);
  });
});
