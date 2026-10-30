import { beforeAll, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "../long-video/fake-db";

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

type Render = typeof import("../../src/lib/compositions/render.server");
type Callback = typeof import("../../src/lib/compositions/callback.server");
type Sequence = typeof import("../../src/lib/compositions/sequence.server");
let render: Render;
let callback: Callback;
let sequence: Sequence;

beforeAll(async () => {
  render = await import("../../src/lib/compositions/render.server");
  callback = await import("../../src/lib/compositions/callback.server");
  sequence = await import("../../src/lib/compositions/sequence.server");
  // An edit render's failure, as migration 0004's function records it.
  db.rpcs.set("fail_sequence_render", (args) => {
    const row = db.find("sequence_renders", args["p_render_id"]);
    if (row && (row["status"] === "queued" || row["status"] === "rendering"))
      Object.assign(row, {
        status: "failed",
        error_code: args["p_error_code"],
        error_message: args["p_error_message"],
      });
    return null;
  });
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const hash = (n: number) => n.toString(16).padStart(64, "0");
let made = 0;

function task(fields: Record<string, unknown>) {
  return db.add("media_tasks", {
    task_type: "render_composition",
    status: "processing",
    error_code: null,
    error_message: null,
    input_payload: {},
    ...fields,
  });
}

function drawing(fields: Record<string, unknown>) {
  made += 1;
  return db.add("composition_renders", {
    hash: hash(made),
    template: "title-card",
    template_version: 1,
    spec: { template: "title-card", version: 1, params: {}, duration: 4 },
    brand_kit_id: null,
    quality: "draft",
    status: "drawing",
    stage: "Drawing",
    progress: 0.4,
    frames: 120,
    drawings: 120,
    changing: 60,
    width: 1080,
    height: 1920,
    fps: 30,
    stretches: [],
    media_task_id: null,
    proxy_asset_id: null,
    master_bucket: null,
    master_path: null,
    seconds_per_drawing: null,
    missing_fields: [],
    error_code: null,
    error_message: null,
    ...fields,
  });
}

describe("a drawing the media service lost", () => {
  test("its task failed: the drawing fails with the task's reason", async () => {
    const lost = task({ status: "failed", error_message: "This render stopped responding." });
    const row = drawing({ media_task_id: lost["id"] });
    const view = await render.compositionRender(row["id"] as string);
    expect(view.status).toBe("failed");
    expect(view.errorMessage).toBe("This render stopped responding.");
  });

  test("its task went silent for ten minutes: it fails, and says to draw it again", async () => {
    const silent = task({ status: "processing", updated_at: ago(11) });
    const row = drawing({ media_task_id: silent["id"] });
    const view = await render.compositionRender(row["id"] as string);
    expect(view.status).toBe("failed");
    expect(view.errorMessage).toMatch(/stopped answering/);
  });

  test("its task is still reporting: it is left drawing", async () => {
    const alive = task({ status: "processing", updated_at: ago(2) });
    const row = drawing({ media_task_id: alive["id"] });
    const view = await render.compositionRender(row["id"] as string);
    expect(view.status).toBe("drawing");
    expect(view.progress).toBe(0.4);
  });

  test("recorded but never sent: after ten minutes it fails", async () => {
    const stuck = drawing({ status: "queued", media_task_id: null, updated_at: ago(12) });
    expect((await render.compositionRender(stuck["id"] as string)).status).toBe("failed");
    const fresh = drawing({ status: "queued", media_task_id: null });
    expect((await render.compositionRender(fresh["id"] as string)).status).toBe("queued");
  });

  test("one stretch lost: the stretch fails, and the render with it, saying why", async () => {
    const done = db.add("composition_stretches", {
      hash: hash(900),
      from_frame: 0,
      to_frame: 240,
      status: "completed",
      progress: 1,
      master_bucket: "generated-assets",
      master_path: "compositions/stretches/a.mkv",
      media_task_id: null,
      error_message: null,
    });
    const silent = task({ status: "processing", updated_at: ago(15) });
    const lost = db.add("composition_stretches", {
      hash: hash(901),
      from_frame: 240,
      to_frame: 480,
      status: "drawing",
      progress: 0.3,
      master_bucket: null,
      master_path: null,
      media_task_id: silent["id"],
      error_message: null,
    });
    const row = drawing({
      quality: "final",
      frames: 480,
      stretches: [
        { from: 0, to: 240, hash: hash(900), stretch_id: done["id"] },
        { from: 240, to: 480, hash: hash(901), stretch_id: lost["id"] },
      ],
    });
    const view = await render.compositionRender(row["id"] as string);
    expect(db.find("composition_stretches", lost["id"])?.["status"]).toBe("failed");
    expect(db.find("composition_stretches", done["id"])?.["status"]).toBe("completed");
    expect(view.status).toBe("failed");
    expect(view.errorMessage).toMatch(/stopped answering/);
  });
});

describe("word from the media worker", () => {
  test("a heartbeat keeps the task alive without setting the drawing's progress back", async () => {
    const alive = task({ status: "processing", updated_at: ago(5) });
    const row = drawing({ media_task_id: alive["id"], progress: 0.55 });
    const input = { composition_render_id: row["id"], composition_step: "whole" };
    const media = {
      ...alive,
      input_payload: input,
      project_id: null,
      created_by: null,
      storage_bucket: null,
    };
    expect(await callback.recordCompositionReport(media as never, { status: "heartbeat" })).toBe(
      true,
    );
    expect(db.find("composition_renders", row["id"])?.["progress"]).toBe(0.55);
    expect(
      Date.parse(db.find("media_tasks", alive["id"])?.["updated_at"] as string),
    ).toBeGreaterThan(Date.now() - 60_000);
    await callback.recordCompositionReport(media as never, {
      status: "progress",
      progress: 0.7,
      stage: "Drawing frame 84 of 120",
    });
    expect(db.find("composition_renders", row["id"])).toMatchObject({
      progress: 0.7,
      stage: "Drawing frame 84 of 120",
    });
  });
});

describe("an edit render waiting on its motion graphics", () => {
  function waiting(compositionId: string) {
    const editTask = db.add("media_tasks", {
      task_type: "render_sequence",
      status: "submitting",
      error_code: null,
      error_message: null,
      input_payload: {
        storage_paths: ["edits/a.mp4", "edits/a.jpg"],
        composition_renders: [compositionId],
        composition_files: [
          { asset_id: "aaaaaaaa-0000-4000-8000-000000000001", render_id: compositionId },
        ],
      },
    });
    const edit = db.add("sequence_renders", {
      status: "queued",
      stage: "Drawing motion graphics (0 of 1 done)",
      media_task_id: editTask["id"],
      error_code: null,
      error_message: null,
    });
    return { editTask, edit };
  }

  test("a drawing that was lost fails the render, plainly", async () => {
    const silent = task({ status: "processing", updated_at: ago(20) });
    const row = drawing({ media_task_id: silent["id"] });
    const { editTask, edit } = waiting(row["id"] as string);
    const outcome = await sequence.checkWaitingRender(edit["id"] as string, editTask as never);
    expect(outcome).toBe("failed");
    expect(db.find("sequence_renders", edit["id"])).toMatchObject({
      status: "failed",
      error_code: "COMPOSITION_FAILED",
    });
    expect(String(db.find("sequence_renders", edit["id"])?.["error_message"])).toMatch(
      /couldn't be drawn: The media service stopped answering/,
    );
  });

  test("drawings still under way keep it waiting", async () => {
    const alive = task({ status: "processing", updated_at: ago(1) });
    const row = drawing({ media_task_id: alive["id"] });
    const { editTask, edit } = waiting(row["id"] as string);
    expect(await sequence.checkWaitingRender(edit["id"] as string, editTask as never)).toBe(
      "waiting",
    );
    expect(db.find("sequence_renders", edit["id"])?.["status"]).toBe("queued");
  });

  test("a drawing's progress keeps a waiting render looking alive, and says how many are done", async () => {
    const alive = task({ status: "processing", updated_at: ago(1) });
    const row = drawing({ media_task_id: alive["id"] });
    const { edit } = waiting(row["id"] as string);
    const before = db.find("sequence_renders", edit["id"]);
    before!["updated_at"] = ago(4);
    await sequence.compositionProgress(row["id"] as string);
    const after = db.find("sequence_renders", edit["id"])!;
    expect(after["stage"]).toBe("Drawing motion graphics (0 of 1 done)");
    expect(Date.parse(after["updated_at"] as string)).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("a still drawn", () => {
  test("its picture joins the library as a PNG twice the frame, and the drawing completes once", async () => {
    const media = task({ status: "processing", storage_bucket: "generated-assets" });
    const row = drawing({
      template: "cover",
      spec: { template: "cover", version: 1, params: {}, duration: 3 },
      quality: "still",
      frames: 1,
      drawings: 1,
      changing: 1,
      width: 1920,
      height: 1080,
      media_task_id: media["id"],
    });
    const report = {
      ...media,
      input_payload: {
        composition_render_id: row["id"],
        composition_step: "still",
        storage_paths: [`compositions/${row["hash"]}/still.png`],
      },
      project_id: null,
      created_by: null,
      storage_bucket: "generated-assets",
    };
    const done = {
      status: "completed",
      outputs: [{ storage_key: `compositions/${row["hash"]}/still.png`, bytes: 4_812_345 }],
      metadata: {
        width: 3840,
        height: 2160,
        composition: { still: true, seconds_per_drawing: 0.61, seconds: 6.2 },
      },
    };
    expect(await callback.recordCompositionReport(report as never, done)).toBe(true);
    const drawn = db.find("composition_renders", row["id"])!;
    expect(drawn).toMatchObject({
      status: "completed",
      progress: 1,
      master_path: `compositions/${row["hash"]}/still.png`,
      poster_path: null,
      seconds_per_drawing: 0.61,
    });
    const picture = db.find("assets", drawn["proxy_asset_id"] as string)!;
    expect(picture).toMatchObject({
      asset_type: "image",
      source_type: "generated",
      title: "Still · Cover",
      mime_type: "image/png",
      width: 3840,
      height: 2160,
      storage_path: `compositions/${row["hash"]}/still.png`,
    });
    expect(db.find("media_tasks", media["id"])?.["status"]).toBe("completed");
    // Reported again: the same picture, nothing new.
    const pictures = db.rows("assets").length;
    expect(await callback.recordCompositionReport(report as never, done)).toBe(true);
    expect(db.rows("assets").length).toBe(pictures);
    expect(db.find("composition_renders", row["id"])?.["proxy_asset_id"]).toBe(picture["id"]);
  });
});
