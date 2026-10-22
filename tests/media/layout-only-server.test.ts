import { afterAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "../long-video/fake-db";

/**
 * Layout-only files held out of every frame, on the server: each place a
 * library file could reach a frame or the provider refuses one, in plain
 * words, before anything is recorded or sent. Against a stand-in database.
 *
 * Other test files stand in for the generation path (bun keeps a module's
 * stand-in for the whole run), so the real modules are loaded fresh here.
 */

const db = new FakeDb();
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
const real = <T>(path: string): Promise<T> =>
  import(`${join(import.meta.dir, "../../src/lib", path)}?layout-only`) as Promise<T>;

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

/** The migration not applied yet: asset_privacy answers as a missing table does. */
let privacyMissing = false;
const realFrom = db.from.bind(db);
function missingTable() {
  const answer = {
    data: null,
    error: { code: "42P01", message: 'relation "asset_privacy" does not exist' },
  };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "in", "is", "maybeSingle", "single"])
    chain[method] = () => chain;
  chain["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  return chain;
}
db.from = ((table: string) =>
  privacyMissing && table === "asset_privacy" ? missingTable() : realFrom(table)) as typeof db.from;

const member = db.add("profiles", { is_active: true, role: "member" });
const admin = db.add("profiles", { is_active: true, role: "admin" });
const picture = (title: string, path: string) =>
  db.add("assets", {
    asset_type: "image",
    title,
    storage_bucket: "generation-inputs",
    storage_path: path,
    mime_type: "image/png",
    width: 1600,
    height: 1000,
  });
const screenshot = picture("Client portal", "portal.png");
const logo = picture("Logo", "logo.png");
const take = db.add("assets", {
  asset_type: "video",
  title: "Take",
  storage_bucket: "generation-outputs",
  storage_path: "take.mp4",
  mime_type: "video/mp4",
});
const model = db.add("model_registry", {
  is_active: true,
  provider: "higgsfield",
  model_path: "image/edit",
  operation: "image-to-image",
  output_type: "image",
  capabilities: { inputs: [{ role: "image", type: "image", param: "image" }] },
  parameter_schema: { fields: [] },
});
const userId = member["id"] as string;
const screenshotId = screenshot["id"] as string;
const logoId = logo["id"] as string;

const layoutOnly = await import("../../src/lib/media/layout-only.server");
const words = "is layout only: a reference for how a screen is laid out, never placed in a frame";

describe("the mark", () => {
  test("any member marks a picture layout only; only an admin lifts it", async () => {
    const mark = await layoutOnly.setLayoutOnly({
      assetId: screenshotId,
      userId,
      layoutOnly: true,
      note: "Real client names",
    });
    expect(mark).toMatchObject({ layoutOnly: true, note: "Real client names" });
    await expect(
      layoutOnly.setLayoutOnly({ assetId: screenshotId, userId, layoutOnly: false }),
    ).rejects.toThrow("Only an admin can lift a layout-only mark");
    // Lifting a file that has no mark is nothing to do.
    expect(
      await layoutOnly.setLayoutOnly({
        assetId: logoId,
        userId: admin["id"] as string,
        layoutOnly: false,
      }),
    ).toBeNull();
    expect(await layoutOnly.layoutOnlyAmong([screenshotId, logoId, null])).toEqual([
      { id: screenshotId, title: "Client portal" },
    ]);
    expect([...(await layoutOnly.privacyMarks([screenshotId, logoId])).keys()]).toEqual([
      screenshotId,
    ]);
  });

  test("an admin lifts it, and marks it again", async () => {
    const adminId = admin["id"] as string;
    const lifted = await layoutOnly.setLayoutOnly({
      assetId: screenshotId,
      userId: adminId,
      layoutOnly: false,
    });
    expect(lifted).toBeNull();
    expect(await layoutOnly.layoutOnlyAmong([screenshotId])).toEqual([]);
    const row = db.rows("asset_privacy").find((entry) => entry["asset_id"] === screenshotId)!;
    expect(row["lifted_by"]).toBe(adminId);
    await layoutOnly.setLayoutOnly({ assetId: screenshotId, userId, layoutOnly: true });
    expect(await layoutOnly.layoutOnlyAmong([screenshotId])).toHaveLength(1);
    expect(db.rows("asset_privacy").filter((entry) => entry["asset_id"] === screenshotId)).toEqual([
      expect.objectContaining({ layout_only: true, lifted_by: null, note: "Real client names" }),
    ]);
  });

  test("a person who isn't an active member can't mark anything", async () => {
    const left = db.add("profiles", { is_active: false, role: "member" });
    await expect(
      layoutOnly.setLayoutOnly({ assetId: logoId, userId: left["id"] as string, layoutOnly: true }),
    ).rejects.toThrow("not an active team member");
  });

  test("before the migration nothing is held, and marking says it needs the update", async () => {
    privacyMissing = true;
    try {
      expect(await layoutOnly.layoutOnlyAmong([screenshotId])).toEqual([]);
      await expect(
        layoutOnly.setLayoutOnly({ assetId: logoId, userId, layoutOnly: true }),
      ).rejects.toThrow(
        "Reference screenshots need a database update (migration 0035_reference_privacy). Ask an admin to apply it.",
      );
      expect((await layoutOnly.privacyMarks([screenshotId])).size).toBe(0);
    } finally {
      privacyMissing = false;
    }
  });
});

describe("refused wherever it would reach a frame", () => {
  test("a generation, before anything is recorded or billed", async () => {
    const { createAndSubmitGeneration } = await real<
      typeof import("../../src/lib/generation-create.server")
    >("generation-create.server.ts");
    await expect(
      createAndSubmitGeneration({
        userId,
        model: model as never,
        parameters: { prompt: "a dashboard" },
        inputs: [
          { assetId: logoId, role: "image", position: 0 },
          { assetId: screenshotId, role: "image", position: 1 },
        ],
        clientRequestId: "layout-only-generation",
      }),
    ).rejects.toThrow(`“Client portal” ${words}, so it can't go into a generation.`);
    expect(db.rows("generations")).toHaveLength(0);
  });

  test("an estimate, before the provider is asked", async () => {
    const { estimateGenerationCost } = await real<
      typeof import("../../src/lib/generation-estimate.server")
    >("generation-estimate.server.ts");
    const quote = await estimateGenerationCost({
      userId,
      modelId: model["id"] as string,
      parameters: { prompt: "a dashboard" },
      inputs: [{ assetId: screenshotId, role: "image", position: 0 }],
    });
    expect(quote.ok).toBe(false);
    // Shown on Create as a problem with a reference, in these words.
    expect(quote.code).toBe("UPLOAD_FAILED");
    expect(quote.message).toContain(`${words}, so it can't be sent to a model, even to price one.`);
  });

  test("the provider, whatever sends it there (a queued generation, a long video, a Soul ID)", async () => {
    const { providerMediaUrl } = await import("../../src/lib/generation-pipeline.server");
    await expect(
      providerMediaUrl({
        assetId: screenshotId,
        bucket: "generation-inputs",
        path: "portal.png",
        mimeType: "image/png",
      }),
    ).rejects.toThrow(`“Client portal” ${words}, so it can't be sent to Higgsfield.`);
  });

  test("a render of an edit that places it", async () => {
    const { startSequenceRender } = await import("../../src/lib/edit/render.server");
    const sequence = db.add("sequences", {
      title: "Portal tour",
      version: 3,
      project_id: null,
      campaign_id: null,
      timeline: {
        clips: [{ id: "c1", assetId: logoId, kind: "image", duration: 4 }],
        images: [{ id: "i1", assetId: screenshotId, start: 0, end: 4 }],
      },
    });
    await expect(
      startSequenceRender({
        sequenceId: sequence["id"] as string,
        expectedVersion: 3,
        clientRequestId: "render-layout-only",
        userId,
      }),
    ).rejects.toThrow("so this edit can't be rendered with it. Take it out of the timeline");
    expect(db.rows("sequence_renders")).toHaveLength(0);
    expect(db.rows("media_tasks")).toHaveLength(0);
  });

  test("an edit made or changed through the API", async () => {
    const { studioTool } = await import("../../src/lib/studio-api/tools.server");
    const caller = {
      userId,
      tokenId: "token",
      scopes: new Set(["read", "generate", "edit"]),
    } as never;
    const timeline = {
      clips: [{ id: "c1", assetId: screenshotId, kind: "image", duration: 3 }],
    };
    await expect(
      studioTool("create_edit")!.run({ title: "Tour", timeline }, caller),
    ).rejects.toThrow("so it can't be used in an edit. Take it out of the timeline.");
    const before = db.rows("sequences").length;
    const sequence = db.add("sequences", { title: "Tour", version: 1, timeline: { clips: [] } });
    await expect(
      studioTool("update_edit")!.run(
        { sequenceId: sequence["id"], expectedVersion: 1, timeline },
        caller,
      ),
    ).rejects.toThrow("can't be used in an edit");
    expect(db.rows("sequences")).toHaveLength(before + 1);
    expect(db.find("sequences", sequence["id"])).toMatchObject({
      version: 1,
      timeline: { clips: [] },
    });
  });

  test("a take aligned to it, and a clean plate made from it", async () => {
    const { startAlignTake } = await import("../../src/lib/media/align-take.server");
    await expect(
      startAlignTake({
        userId,
        takeAssetId: take["id"] as string,
        pictureAssetId: screenshotId,
        anchor: "last",
        crossSeconds: 0.5,
        holdSeconds: 0,
        dedupeKey: "align-take:layout-only",
      }),
    ).rejects.toThrow("so no copy can be made from it here.");
    const { startCleanPlate } = await import("../../src/lib/media/clean-plate.server");
    await expect(
      startCleanPlate({
        userId,
        artAssetId: screenshotId,
        boxes: [],
        dedupeKey: "plate:layout-only",
      }),
    ).rejects.toThrow("so it can't go into a generation.");
    expect(db.rows("media_tasks")).toHaveLength(0);
    expect(db.rows("operations")).toHaveLength(0);
  });

  test("a file without the mark goes on as ever", async () => {
    await expect(
      layoutOnly.assertPlaceable([logoId, take["id"] as string], "generation"),
    ).resolves.toBeUndefined();
  });

  test("when the marks can't be read, nothing is let through unchecked", async () => {
    const from = db.from;
    db.from = ((table: string) => {
      if (table !== "asset_privacy") return from(table);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "in", "eq"]) chain[method] = () => chain;
      chain["then"] = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(resolve);
      return chain;
    }) as typeof db.from;
    try {
      await expect(layoutOnly.assertPlaceable([logoId], "render")).rejects.toThrow(
        "couldn't be checked just now",
      );
    } finally {
      db.from = from;
    }
  });
});

describe("each place a file reaches a frame still asks", () => {
  // Merged from many branches, these calls are easy to lose, so each one is
  // looked for (spacing and line breaks aside).
  const squashed = (text: string) =>
    text.replace(/\s+/g, "").replace(/,\)/g, ")").replace(/,\]/g, "]");
  const timelineFiles =
    "[...timeline.clips.map((clip) => clip.assetId), ...timeline.images.map((image) => image.assetId)]";
  test.each([
    ["generation-create.server.ts", 'request.inputs.map((input) => input.assetId), "generation"'],
    ["generation-estimate.server.ts", 'data.inputs.map((input) => input.assetId), "estimate"'],
    ["generation-pipeline.server.ts", '[assetId], "provider"'],
    ["katana/service.server.ts", 'ids, "katana"'],
    ["edit/render.server.ts", `${timelineFiles}, "render"`],
    ["studio-api/tools.server.ts", `${timelineFiles}, "edit"`],
    ["media.functions.ts", 'data.sourceAssetIds, "copy"'],
    ["media/align-take.server.ts", '[take.id, picture.id], "copy"'],
    ["media/clean-plate.server.ts", '[art.id, letteringFile?.id], "generation"'],
    ["compositions/render.server.ts", 'compiled.imageIds, "motion"'],
  ])("%s", (path, args) => {
    const source = readFileSync(join(import.meta.dir, "../../src/lib", path), "utf8");
    expect(squashed(source)).toContain(squashed(`await assertPlaceable(${args})`));
  });

  test("the API checks an edit's timeline both when it is made and when it is changed", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../src/lib/studio-api/tools.server.ts"),
      "utf8",
    );
    expect(source.match(/await assertPlaceableTimeline\(timeline\)/g)).toHaveLength(2);
  });
});
