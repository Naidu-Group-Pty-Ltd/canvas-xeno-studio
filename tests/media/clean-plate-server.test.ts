import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { FakeDb } from "../long-video/fake-db";
import { NO_LETTERING, EDIT_PROMPT } from "../../src/lib/media/clean-plate";

/**
 * The clean-plate recipe run end to end against a stand-in database: the
 * AI's reading of the lettering, the generation path (with its spending
 * checks) and the media worker are stand-ins too, so nothing is called or
 * billed. Each job is finished by hand, as its result would arrive.
 */

const db = new FakeDb();
const src = (path: string) => join(import.meta.dir, "../../src/lib", path);
db.storage = {
  from: () => ({
    remove: async () => ({ error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/file" } }),
  }),
} as typeof db.storage;

const member = db.add("profiles", { is_active: true, role: "member" });
const art = db.add("assets", {
  asset_type: "image",
  title: "Aurixa logo",
  width: 2000,
  height: 1333,
  storage_bucket: "generation-inputs",
  storage_path: "art.png",
  mime_type: "image/png",
  project_id: null,
});
const editor = db.add("model_registry", {
  is_active: true,
  model_path: "gpt-image/edit",
  output_type: "image",
  capabilities: { inputs: [{ role: "image", type: "image", param: "image" }] },
});
const kling = db.add("model_registry", {
  is_active: true,
  model_path: "kling-video/v3.0/pro/image-to-video",
  output_type: "video",
  capabilities: {
    inputs: [
      { role: "source", type: "image", param: "image" },
      { role: "last_frame", type: "image", param: "last_image" },
    ],
  },
});

const generations: Record<string, unknown>[] = [];
const allowedFor: string[] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
mock.module(src("generation-create.server.ts"), () => ({
  assertGenerationAllowed: async (userId: string) => {
    allowedFor.push(userId);
  },
  createAndSubmitGeneration: async (request: Record<string, unknown>) => {
    const existing = db
      .rows("generations")
      .find((row) => row["client_request_id"] === request["clientRequestId"]);
    if (existing)
      return { generationId: existing["id"], status: existing["status"], budgetWarning: null };
    generations.push(request);
    const row = db.add("generations", {
      client_request_id: request["clientRequestId"],
      status: "queued",
    });
    return { generationId: row["id"], status: "queued", budgetWarning: null };
  },
}));
const estimates: Record<string, unknown>[] = [];
mock.module(src("generation-estimate.server.ts"), () => ({
  estimateGenerationCost: async (request: Record<string, unknown>) => {
    estimates.push(request);
    return { ok: true, code: null, costUsd: 0.12, message: null };
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
      source_asset_id: (request["source"] as { assetId: string }).assetId,
      input_payload: {
        params: request["params"],
        sources: [
          (request["source"] as { assetId: string }).assetId,
          ...((request["extraSources"] as { assetId: string; role: string }[]) ?? []).map(
            (source) => `${source.role}:${source.assetId}`,
          ),
        ],
        ...((request["context"] as object) ?? {}),
      },
    });
    return { ok: true, taskId: task["id"], duplicate: false };
  },
}));
const features = new Set(["align_take", "clean_plate"]);
mock.module(src("media/worker-feature.server.ts"), () => ({
  requireWorkerFeature: async (feature: string, what: string) => {
    if (!features.has(feature))
      throw Object.assign(new Error(`${what} needs a newer media service than the one deployed.`), {
        code: "INVALID_PARAMETERS",
      });
  },
}));
mock.module(src("media/text-boxes.server.ts"), () => ({
  readTextBoxes: async () => ({
    ok: true,
    model: "test",
    pieces: [
      { text: "AURIXA", box: { x: 0.28, y: 0.7, w: 0.2, h: 0.1 }, kind: "other" },
      { text: "SYSTEMS", box: { x: 0.5, y: 0.7, w: 0.22, h: 0.1 }, kind: "other" },
    ],
  }),
}));

const plate = await import("../../src/lib/media/clean-plate.server");
const userId = member["id"] as string;

/** The media task a step is running, by its dedupe key. */
const taskFor = (recipeId: string, step: string, attempt = 1) =>
  db
    .rows("media_tasks")
    .find((task) => task["dedupe_key"] === `clean-plate:${recipeId}:${step}:${attempt}`);

/** Finishes a media task with a file, as the worker's callback records it. */
function finishTask(
  task: Record<string, unknown> | undefined,
  kind: "image" | "video",
  metadata = {},
) {
  if (!task) throw new Error("no such task");
  const file = db.add("assets", {
    asset_type: kind,
    storage_bucket: "generated-assets",
    storage_path: `${task["id"]}.out`,
  });
  Object.assign(task, {
    status: "completed",
    result_asset_id: file["id"],
    output_payload: { metadata },
  });
  return file["id"] as string;
}

/** Finishes a generation with its file, as the pipeline's ingest saves it. */
function finishGeneration(generationId: unknown, kind: "image" | "video") {
  const row = db.find("generations", generationId)!;
  row["status"] = "completed";
  return db.add("assets", {
    asset_type: kind,
    generation_id: generationId,
    storage_bucket: "generated-assets",
    storage_path: `${String(generationId)}.out`,
  })["id"] as string;
}

describe("a clean-plate recipe, run", () => {
  let recipeId = "";

  test("it starts from the AI's reading of the lettering, one box a line, and nothing is made yet", async () => {
    const view = await plate.startCleanPlate({
      userId,
      artAssetId: art["id"] as string,
      dedupeKey: "clean-plate:test:1",
    });
    recipeId = view.recipeId;
    expect(view.mask.boxes).toHaveLength(1);
    expect(view.mask.source).toBe("ai");
    expect(view.mask.revision).toBe(0);
    expect(view.steps.every((step) => step.status === "waiting")).toBe(true);
    expect(db.rows("media_tasks")).toHaveLength(0);
    // Asked again with the same key, it is the same recipe.
    const again = await plate.startCleanPlate({
      userId,
      artAssetId: art["id"] as string,
      dedupeKey: "clean-plate:test:1",
    });
    expect(again.recipeId).toBe(recipeId);
    expect(
      db.rows("operations").filter((row) => row["operation_type"] === "clean_plate_recipe"),
    ).toHaveLength(1);
  });

  test("using the mask draws it, in the art's pixels", async () => {
    const view = await plate.setCleanPlateMask(recipeId, userId, { grow: 45, feather: 14 });
    expect(view.steps.find((step) => step.step === "mask")!.status).toBe("running");
    const task = taskFor(recipeId, "mask")!;
    expect(task["task_type"]).toBe("clean_plate");
    const params = (task["input_payload"] as Record<string, unknown>)["params"] as Record<
      string,
      unknown
    >;
    expect(params).toMatchObject({ output: "mask", grow: 45, feather: 14 });
    expect((params["boxes"] as unknown[]).length).toBe(1);
    expect((task["input_payload"] as Record<string, unknown>)["clean_plate_recipe_id"]).toBe(
      recipeId,
    );
    finishTask(task, "image");
    const read = await plate.getCleanPlate(recipeId, userId);
    expect(read.steps.find((step) => step.step === "mask")).toMatchObject({
      status: "completed",
      upToDate: true,
    });
    expect(read.next).toBe("Make the edit that takes the lettering out of the art.");
  });

  test("the edit is priced and made through the normal generation path, once", async () => {
    const quote = await plate.estimateCleanPlateStep(recipeId, userId, "edit", {
      modelId: editor["id"] as string,
      parameters: {},
    });
    expect(quote).toMatchObject({ costUsd: 0.12 });
    expect(estimates[0]).toMatchObject({
      modelId: editor["id"],
      inputs: [{ assetId: art["id"], role: "image", position: 0 }],
      parameters: { prompt: EDIT_PROMPT },
    });
    await plate.queueCleanPlateStep(recipeId, userId, "edit", {
      modelId: editor["id"] as string,
      parameters: {},
      estimatedCostUsd: 0.12,
    });
    expect(allowedFor).toEqual([userId]);
    expect(generations).toHaveLength(1);
    expect(generations[0]).toMatchObject({
      userId,
      estimatedCostUsd: 0.12,
      clientRequestId: `clean-plate:${recipeId}:edit:1`,
      inputs: [{ assetId: art["id"], role: "image", position: 0 }],
    });
    // While it is being made it can't be started again, and nothing more is billed.
    await expect(
      plate.queueCleanPlateStep(recipeId, userId, "edit", {
        modelId: editor["id"] as string,
        parameters: {},
      }),
    ).rejects.toThrow("is being made");
    await expect(
      plate.queueCleanPlateStep(recipeId, userId, "animate", {
        modelId: kling["id"] as string,
        parameters: {},
      }),
    ).rejects.toThrow("Make the clean plate first");
    expect(generations).toHaveLength(1);
  });

  test("once the edit is in the library it is blended into the art by itself", async () => {
    const view = await plate.getCleanPlate(recipeId, userId);
    const edit = view.steps.find((step) => step.step === "edit")!;
    finishGeneration(edit.generationId, "image");
    const read = await plate.getCleanPlate(recipeId, userId);
    expect(read.steps.find((step) => step.step === "edit")!.status).toBe("completed");
    const blend = taskFor(recipeId, "blend")!;
    const payload = blend["input_payload"] as Record<string, unknown>;
    expect((payload["params"] as Record<string, unknown>)["output"]).toBe("plate");
    expect((payload["sources"] as string[])[1]).toMatch(/^edit:/);
    finishTask(blend, "image", { kept_difference_levels: 0.4 });
    // The worker's report moves the recipe on without anyone reading it.
    await plate.advanceForMediaTask(blend["id"] as string);
    const after = await plate.getCleanPlate(recipeId, userId);
    expect(after.steps.find((step) => step.step === "blend")).toMatchObject({
      status: "completed",
      report: { kept_difference_levels: 0.4 },
    });
    expect(after.next).toBe("Animate the clean plate with a video model.");
  });

  test("the take is made from the plate, told never to draw a letter; then aligned and lettered by itself", async () => {
    await plate.queueCleanPlateStep(recipeId, userId, "animate", {
      modelId: kling["id"] as string,
      parameters: { prompt: "The orb at the emblem's heart breathes in cool blue", duration: 5 },
      end: "last",
      crossSeconds: 0.4,
      estimatedCostUsd: 0.84,
    });
    expect(generations).toHaveLength(2);
    const blendAsset = (await plate.getCleanPlate(recipeId, userId)).steps.find(
      (step) => step.step === "blend",
    )!.assetId;
    expect(generations[1]).toMatchObject({
      clientRequestId: `clean-plate:${recipeId}:animate:1`,
      inputs: [{ assetId: blendAsset, role: "last_frame", position: 0 }],
      parameters: {
        prompt: `The orb at the emblem's heart breathes in cool blue. ${NO_LETTERING}`,
        duration: 5,
      },
    });
    const animate = (await plate.getCleanPlate(recipeId, userId)).steps.find(
      (step) => step.step === "animate",
    )!;
    finishGeneration(animate.generationId, "video");
    await plate.getCleanPlate(recipeId, userId);
    const align = taskFor(recipeId, "align")!;
    expect(align["task_type"]).toBe("align_take");
    expect((align["input_payload"] as Record<string, unknown>)["params"]).toMatchObject({
      anchor: "last",
      cross_seconds: 0.4,
      hold_seconds: 0.5,
    });
    finishTask(align, "video", { alignment: { registered: true } });
    await plate.advanceForMediaTask(align["id"] as string);
    const overlay = taskFor(recipeId, "overlay")!;
    expect(overlay["task_type"]).toBe("lay_lettering");
    const params = (overlay["input_payload"] as Record<string, unknown>)["params"] as Record<
      string,
      unknown
    >;
    expect(params).toMatchObject({ letters: "art", grow: 23, feather: 9.1 });
    finishTask(overlay, "video");
    const done = await plate.getCleanPlate(recipeId, userId);
    expect(done.status).toBe("completed");
    expect(done.steps.every((step) => step.status === "completed")).toBe(true);
    expect(db.find("operations", recipeId)!["status"]).toBe("completed");
    // Two billed steps, each through the normal path, each once.
    expect(generations).toHaveLength(2);
  });

  test("a worker that can't do a step fails it plainly; tried again once it can, it starts again", async () => {
    features.delete("clean_plate");
    const view = await plate.setCleanPlateMask(recipeId, userId, { grow: 30 });
    const mask = view.steps.find((step) => step.step === "mask")!;
    expect(mask.status).toBe("failed");
    expect(mask.error?.message).toContain("needs a newer media service");
    expect(view.next).toContain("The lettering's mask failed");
    features.add("clean_plate");
    // Not by itself: it waits for a person.
    expect(
      (await plate.getCleanPlate(recipeId, userId)).steps.find((step) => step.step === "mask")!
        .status,
    ).toBe("failed");
    const retried = await plate.retryCleanPlateStep(recipeId, userId, "mask");
    expect(retried.steps.find((step) => step.step === "mask")!.status).toBe("running");
    expect(taskFor(recipeId, "mask", 3)).toBeDefined();
  });
});
