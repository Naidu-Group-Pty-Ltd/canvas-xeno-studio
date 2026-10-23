import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { FakeDb } from "../long-video/fake-db";

/**
 * A reference screenshot redacted on import, end to end against a stand-in
 * database and storage: the AI's reading and the media worker are stand-ins
 * too, so nothing is called. Each copy is finished by hand, as the worker's
 * report would record it.
 */

const db = new FakeDb();
const src = (path: string) => join(import.meta.dir, "../../src/lib", path);

/** The columns' defaults, as migration 0035_reference_privacy sets them. */
const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  reference_redactions: () => ({
    status: "uploading",
    original_bucket: "reference-originals",
    boxes: [],
    reading: null,
    layout_only: true,
    keep_original: false,
    original_removed_at: null,
    attempt: 0,
    media_task_id: null,
    redacted_asset_id: null,
    error_code: null,
    error_message: null,
    client_request_id: null,
    completed_at: null,
  }),
  asset_privacy: () => ({
    layout_only: false,
    redaction_id: null,
    redacted_areas: null,
    note: null,
    marked_by: null,
    marked_at: new Date().toISOString(),
    lifted_by: null,
    lifted_at: null,
  }),
};
const add = db.add.bind(db);
db.add = (table, row) => add(table, { ...(DEFAULTS[table]?.() ?? {}), ...row });

/** Storage, in memory: what is where, by bucket and path. */
const stored = new Map<string, Uint8Array>();
const at = (bucket: string, path: string) => `${bucket}/${path}`;
db.storage = {
  from: (bucket: string) => ({
    upload: async (path: string, body: Uint8Array | Blob, options: { upsert?: boolean } = {}) => {
      if (stored.has(at(bucket, path)) && !options.upsert)
        return { data: null, error: { message: "The resource already exists" } };
      stored.set(
        at(bucket, path),
        body instanceof Uint8Array ? body : new Uint8Array(await body.arrayBuffer()),
      );
      return { data: { path }, error: null };
    },
    download: async (path: string) => {
      const bytes = stored.get(at(bucket, path));
      return bytes
        ? { data: new Blob([bytes.slice()]), error: null }
        : { data: null, error: { message: "Object not found" } };
    },
    move: async (from: string, to: string) => {
      const bytes = stored.get(at(bucket, from));
      if (!bytes) return { data: null, error: { message: "Object not found" } };
      stored.delete(at(bucket, from));
      stored.set(at(bucket, to), bytes);
      return { data: {}, error: null };
    },
    remove: async (paths: string[]) => {
      for (const path of paths) stored.delete(at(bucket, path));
      return { data: [], error: null };
    },
    list: async (folder: string) => ({
      data: [...stored.keys()]
        .filter((key) => key.startsWith(`${at(bucket, folder)}/`))
        .map((key) => ({ name: key.slice(at(bucket, folder).length + 1) })),
      error: null,
    }),
    createSignedUrl: async (path: string, seconds: number) => ({
      data: { signedUrl: `https://storage.test/${bucket}/${path}?for=${seconds}` },
      error: null,
    }),
  }),
} as unknown as typeof db.storage;
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const tasks: Record<string, unknown>[] = [];
mock.module(src("media/enqueue.server.ts"), () => ({
  enqueueInternalMediaTask: async (request: Record<string, unknown>) => {
    const existing = db
      .rows("media_tasks")
      .find((task) => task["dedupe_key"] === request["dedupeKey"]);
    if (existing) return { ok: true, taskId: existing["id"], duplicate: true };
    tasks.push(request);
    const task = db.add("media_tasks", {
      task_type: request["taskType"],
      status: "processing",
      dedupe_key: request["dedupeKey"],
      input_payload: { params: request["params"], ...((request["context"] as object) ?? {}) },
    });
    return { ok: true, taskId: task["id"], duplicate: false };
  },
}));
const features = new Set(["redact_image"]);
mock.module(src("media/worker-feature.server.ts"), () => ({
  requireWorkerFeature: async (feature: string, what: string) => {
    if (!features.has(feature))
      throw Object.assign(new Error(`${what} needs a newer media service than the one deployed.`), {
        code: "INVALID_PARAMETERS",
      });
  },
}));
const readings: Record<string, unknown>[] = [];
const reading: Record<string, unknown> = {
  ok: true,
  model: "a-vision-model",
  pieces: [
    { text: "Jane Cooper", box: { x: 0.1, y: 0.1, w: 0.15, h: 0.03 }, kind: "name" },
    { text: "jane.cooper@example.com", box: { x: 0.1, y: 0.2, w: 0.25, h: 0.03 }, kind: "other" },
    { text: "+44 20 7946 0958", box: { x: 0.1, y: 0.3, w: 0.2, h: 0.03 }, kind: "phone" },
    { text: "Dashboard", box: { x: 0.4, y: 0.02, w: 0.2, h: 0.05 }, kind: "other" },
    {
      text: "221B Baker Street, London",
      box: { x: 0.6, y: 0.5, w: 0.3, h: 0.03 },
      kind: "address",
    },
  ],
};
let answer = reading;
mock.module(src("media/text-boxes.server.ts"), () => ({
  readTextBoxes: async (input: Record<string, unknown>) => {
    readings.push(input);
    return answer;
  },
}));

const redaction = await import("../../src/lib/media/redaction.server");
const { assertPlaceable } = await import("../../src/lib/media/layout-only.server");

const member = db.add("profiles", { is_active: true, role: "member" });
const colleague = db.add("profiles", { is_active: true, role: "member" });
const admin = db.add("profiles", { is_active: true, role: "admin" });
const userId = member["id"] as string;
const adminId = admin["id"] as string;

/** A PNG's first bytes: enough for its kind and size to be read. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A screenshot staged and uploaded, as the app does it. */
async function uploaded(choices = { layoutOnly: true, keepOriginal: false }) {
  const staged = await redaction.stageScreenshot({
    userId,
    fileName: "Client portal.png",
    mimeType: "image/png",
    size: 64,
    projectId: null,
    choices,
  });
  stored.set(at(staged.bucket, staged.path), png(1600, 1000));
  return staged;
}

const rowOf = (id: string) => db.find("reference_redactions", id)!;
const taskOf = (id: string) => db.find("media_tasks", rowOf(id)["media_task_id"])!;

/** Finishes a copy's task as the worker's report records it (kept out of the library). */
function finishCopy(id: string, outcome: "completed" | "failed" = "completed") {
  const task = taskOf(id);
  if (outcome === "failed") {
    Object.assign(task, { status: "failed", error_message: "The picture couldn't be read" });
    return;
  }
  const path = `unassigned/${userId}/inputs/${id}-redacted.png`;
  stored.set(at("generation-inputs", path), png(1600, 1000));
  Object.assign(task, {
    status: "completed",
    output_payload: {
      asset_ids: [],
      files: [{ bucket: "generation-inputs", path, timestamp_seconds: null }],
      metadata: { width: 1600, height: 1000, size_bytes: 2048, redaction: { boxes: 4, block: 19 } },
    },
  });
}

describe("staged and read", () => {
  test("it goes into the importer's own folder of the private bucket, never the library", async () => {
    const staged = await uploaded();
    expect(staged.bucket).toBe("reference-originals");
    expect(staged.path).toBe(`${userId}/${staged.redactionId}/original.png`);
    expect(rowOf(staged.redactionId)).toMatchObject({
      status: "uploading",
      title: "Client portal",
      layout_only: true,
      keep_original: false,
    });
    expect(db.rows("assets")).toHaveLength(0);
    await expect(
      redaction.stageScreenshot({
        userId,
        fileName: "a.gif",
        mimeType: "image/gif",
        size: 64,
        projectId: null,
        choices: { layoutOnly: true, keepOriginal: false },
      }),
    ).rejects.toThrow("A screenshot must be a PNG, JPEG or WebP");
  });

  test("its private details become boxes to check, and the text itself is never kept", async () => {
    const { redactionId, path } = await uploaded();
    const view = await redaction.readScreenshot(redactionId, userId);
    expect(readings.at(-1)).toMatchObject({
      purpose: "privacy",
      url: `https://storage.test/reference-originals/${path}?for=900`,
    });
    expect(view.status).toBe("review");
    expect([view.width, view.height]).toEqual([1600, 1000]);
    expect(view.boxes.map((box) => [box.id, box.kind, box.source])).toEqual([
      ["t1", "name", "ai"],
      ["t2", "email", "pattern"],
      ["t3", "phone", "pattern"],
      ["t5", "address", "ai"],
    ]);
    expect(view.found).toEqual({ name: 1, email: 1, phone: 1, address: 1, drawn: 0 });
    expect(view.message).toContain("4 areas to blur. Check every box");
    // A box covers the whole piece, with a margin.
    const name = view.boxes[0]!;
    expect(name.x).toBeLessThan(0.1);
    expect(name.x + name.w).toBeGreaterThan(0.25);
    const saved = JSON.stringify(rowOf(redactionId));
    for (const secret of ["Jane", "Cooper", "example.com", "7946", "Baker", "Dashboard"])
      expect(saved).not.toContain(secret);
    expect(rowOf(redactionId)["reading"]).toMatchObject({ pieces: 5, model: "a-vision-model" });
    // Asked again, the boxes are as they were: the AI isn't asked twice.
    const again = await redaction.readScreenshot(redactionId, userId);
    expect(again.boxes).toEqual(view.boxes);
    expect(readings).toHaveLength(1);
  });

  test("when the AI can't read it, the person is asked to look for themselves", async () => {
    answer = { ok: false, message: "No AI model is set up to read pictures" };
    try {
      const { redactionId } = await uploaded();
      const view = await redaction.readScreenshot(redactionId, userId);
      expect(view.status).toBe("review");
      expect(view.boxes).toEqual([]);
      expect(view.message).toBe(
        "The text couldn't be read automatically (No AI model is set up to read pictures). Nothing private was found. Look for yourself: drag across anything that must not be shown, or add it as it is.",
      );
    } finally {
      answer = reading;
    }
  });

  test("only who imported it, or an admin, can see it", async () => {
    const { redactionId } = await uploaded();
    await expect(redaction.getRedaction(redactionId, colleague["id"] as string)).rejects.toThrow(
      "Only who imported this screenshot, or an admin, can see it",
    );
    expect((await redaction.getRedaction(redactionId, adminId)).status).toBe("uploading");
  });
});

describe("blurred in a copy", () => {
  test("the person's boxes are blurred, in the picture's own pixels, kept out of the library", async () => {
    const { redactionId, path } = await uploaded();
    const read = await redaction.readScreenshot(redactionId, userId);
    // The switchboard number isn't private: taken out. A signature the reading missed: added.
    const boxes = [
      ...read.boxes.filter((box) => box.kind !== "phone"),
      { x: 0.5, y: 0.8, w: 0.25, h: 0.1 },
    ];
    features.clear();
    await expect(redaction.applyRedaction(redactionId, userId, { boxes })).rejects.toThrow(
      "needs a newer media service",
    );
    expect(rowOf(redactionId)["status"]).toBe("review");
    features.add("redact_image");

    const view = await redaction.applyRedaction(redactionId, userId, { boxes });
    expect(view.status).toBe("applying");
    expect(view.message).toBe("Blurring the boxes in a copy…");
    const task = tasks.at(-1)!;
    expect(task).toMatchObject({
      taskType: "redact_image",
      source: { assetId: null, bucket: "reference-originals", path, mimeType: "image/png" },
      dedupeKey: `redaction:${redactionId}:1`,
      context: { reference_redaction_id: redactionId, register_outputs: false },
    });
    const params = task["params"] as { boxes: Record<string, number>[]; format: string };
    expect(params.format).toBe("png");
    expect(params.boxes).toHaveLength(4);
    expect(params.boxes.at(-1)).toEqual({ x: 800, y: 800, w: 400, h: 100 });
    // Numbers only: nothing the boxes cover goes to the worker.
    expect(Object.keys(params).sort()).toEqual(["boxes", "format"]);
    for (const box of params.boxes) expect(Object.keys(box).sort()).toEqual(["h", "w", "x", "y"]);
    expect(db.rows("assets")).toHaveLength(0);

    // The copy joins the library already marked, and the original is deleted.
    finishCopy(redactionId);
    await redaction.advanceForMediaTask(taskOf(redactionId)["id"] as string);
    const done = await redaction.getRedaction(redactionId, userId);
    expect(done.status).toBe("completed");
    expect(done.message).toBe("The copy with its private details blurred is in the library.");
    const copy = db.find("assets", done.redactedAssetId)!;
    expect(copy).toMatchObject({
      title: "Client portal (redacted)",
      asset_type: "image",
      deleted_at: null,
      metadata: { reference_screenshot: true, redaction_id: redactionId, redacted_areas: 4 },
    });
    expect(db.rows("asset_privacy").find((row) => row["asset_id"] === copy["id"])).toMatchObject({
      layout_only: true,
      redacted_areas: 4,
      redaction_id: redactionId,
    });
    expect(stored.has(at("reference-originals", path))).toBe(false);
    expect(rowOf(redactionId)["original_removed_at"]).toBeTruthy();
    expect(done.original).toBeNull();
    // And no frame may hold it.
    await expect(assertPlaceable([copy["id"] as string], "generation")).rejects.toThrow(
      "“Client portal (redacted)” is layout only",
    );
    // Taken up again (a repeated report, the recovery job): nothing more is made.
    await redaction.advanceForMediaTask(taskOf(redactionId)["id"] as string);
    expect(db.rows("assets")).toHaveLength(1);
    await expect(redaction.keptOriginalLink(redactionId, adminId)).rejects.toThrow(
      "The original wasn't kept",
    );
  });

  test("an original kept on request is put away for admins only", async () => {
    const { redactionId, path } = await uploaded({ layoutOnly: false, keepOriginal: true });
    await redaction.readScreenshot(redactionId, userId);
    await redaction.applyRedaction(redactionId, userId, {});
    finishCopy(redactionId);
    const done = await redaction.getRedaction(redactionId, userId);
    expect(done.status).toBe("completed");
    expect(done.originalKept).toBe(true);
    // Its importer no longer sees where it is; an admin does.
    expect(done.original).toBeNull();
    const kept = `kept/${redactionId}/original.png`;
    expect((await redaction.getRedaction(redactionId, adminId)).original).toEqual({
      bucket: "reference-originals",
      path: kept,
    });
    expect(stored.has(at("reference-originals", path))).toBe(false);
    expect(stored.has(at("reference-originals", kept))).toBe(true);
    expect(await redaction.keptOriginalLink(redactionId, adminId)).toBe(
      `https://storage.test/reference-originals/${kept}?for=600`,
    );
    await expect(redaction.keptOriginalLink(redactionId, userId)).rejects.toThrow(
      "Only an admin can open a screenshot's original",
    );
    // Not layout only, as the person chose: a redacted copy, which frames may hold.
    const mark = db.rows("asset_privacy").find((row) => row["asset_id"] === done.redactedAssetId);
    expect(mark).toMatchObject({ layout_only: false, redacted_areas: 4 });
    await expect(assertPlaceable([done.redactedAssetId], "generation")).resolves.toBeUndefined();
  });

  test("a copy that couldn't be made waits for the person, then goes again under a new key", async () => {
    const { redactionId } = await uploaded();
    await redaction.readScreenshot(redactionId, userId);
    await redaction.applyRedaction(redactionId, userId, {});
    finishCopy(redactionId, "failed");
    const failed = await redaction.getRedaction(redactionId, userId);
    expect(failed.status).toBe("failed");
    expect(failed.message).toBe(
      "The copy couldn't be made: The picture couldn't be read. Check the boxes and try again.",
    );
    const again = await redaction.applyRedaction(redactionId, userId, {});
    expect(again.status).toBe("applying");
    expect(tasks.at(-1)!["dedupeKey"]).toBe(`redaction:${redactionId}:2`);
  });

  test("with no box at all, the screenshot itself joins the library, still marked", async () => {
    const { redactionId, path } = await uploaded();
    await redaction.readScreenshot(redactionId, userId);
    const before = tasks.length;
    const view = await redaction.applyRedaction(redactionId, userId, { boxes: [] });
    expect(tasks).toHaveLength(before);
    expect(view.status).toBe("completed");
    expect(view.message).toBe(
      "The screenshot is in the library as it was: nothing in it was blurred.",
    );
    const file = db.find("assets", view.redactedAssetId)!;
    expect(file).toMatchObject({
      title: "Client portal",
      storage_bucket: "generation-inputs",
      deleted_at: null,
    });
    expect(stored.has(at("generation-inputs", file["storage_path"] as string))).toBe(true);
    expect(stored.has(at("reference-originals", path))).toBe(false);
    await expect(assertPlaceable([file["id"] as string], "render")).rejects.toThrow(
      "“Client portal” is layout only",
    );
  });
});

describe("not read, as a person asked", () => {
  test("with blurring turned off the AI isn't asked, and it joins the library marked as chosen", async () => {
    const { redactionId } = await uploaded();
    const asked = readings.length;
    const view = await redaction.readScreenshot(redactionId, userId, { read: false });
    expect(readings).toHaveLength(asked);
    expect(view).toMatchObject({ status: "review", boxes: [], width: 1600, height: 1000 });
    expect(view.message).toBe(
      "Not read for private details, as asked. Drag across anything that must not be shown, or add it as it is.",
    );
    const done = await redaction.applyRedaction(redactionId, userId, { boxes: [] });
    expect(done.status).toBe("completed");
    await expect(assertPlaceable([done.redactedAssetId], "katana")).rejects.toThrow(
      "can't be handed to Katana",
    );
  });
});

describe("dropped, or left", () => {
  test("dropped before its copy is made, the original is deleted", async () => {
    const { redactionId, path } = await uploaded();
    await redaction.readScreenshot(redactionId, userId);
    const view = await redaction.cancelRedaction(redactionId, userId);
    expect(view.status).toBe("cancelled");
    expect(view.message).toBe("Cancelled: the screenshot was deleted.");
    expect(stored.has(at("reference-originals", path))).toBe(false);
    await expect(redaction.applyRedaction(redactionId, userId, {})).resolves.toMatchObject({
      status: "cancelled",
    });
  });

  test("the recovery job takes up a copy no report did, and cancels one left unchecked for a week", async () => {
    const left = await uploaded();
    await redaction.readScreenshot(left.redactionId, userId);
    rowOf(left.redactionId)["updated_at"] = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const made = await uploaded();
    await redaction.readScreenshot(made.redactionId, userId);
    await redaction.applyRedaction(made.redactionId, userId, {});
    finishCopy(made.redactionId);

    expect(await redaction.sweepRedactions(10)).toBeGreaterThanOrEqual(2);
    expect(rowOf(made.redactionId)["status"]).toBe("completed");
    expect(rowOf(left.redactionId)).toMatchObject({
      status: "cancelled",
      error_message: "Left unchecked for 7 days",
    });
    expect(stored.has(at("reference-originals", left.path))).toBe(false);
    expect((await redaction.getRedaction(left.redactionId, userId)).message).toBe(
      "Cancelled: the screenshot was deleted (left unchecked for 7 days).",
    );
  });
});

describe("from a script (import_image with a reference choice)", () => {
  test("stored privately and read; the same request id gives back the first", async () => {
    const choices = { layoutOnly: true, keepOriginal: false };
    const bytes = png(1200, 800);
    const first = await redaction.importScreenshot({
      userId,
      bytes,
      mimeType: "image/png",
      title: "Inbox",
      projectId: null,
      choices,
      clientRequestId: "import-inbox-1",
    });
    expect(first.status).toBe("review");
    expect(first.boxes).toHaveLength(4);
    expect(stored.has(at("reference-originals", first.original!.path))).toBe(true);
    const again = await redaction.importScreenshot({
      userId,
      bytes,
      mimeType: "image/png",
      title: "Inbox",
      projectId: null,
      choices,
      clientRequestId: "import-inbox-1",
    });
    expect(again.redactionId).toBe(first.redactionId);
    expect(
      db
        .rows("reference_redactions")
        .filter((row) => row["client_request_id"] === "import-inbox-1"),
    ).toHaveLength(1);
  });

  test("before the migration, it says what's needed", async () => {
    const from = db.from.bind(db);
    db.from = ((table: string) => {
      if (table !== "reference_redactions") return from(table);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "insert", "eq", "limit", "maybeSingle"])
        chain[method] = () => chain;
      chain["then"] = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: null,
          error: { code: "PGRST205", message: "Could not find the table" },
        }).then(resolve);
      return chain;
    }) as typeof db.from;
    try {
      expect(await redaction.privacyReady()).toBe(false);
      await expect(uploaded()).rejects.toThrow(
        "Reference screenshots need a database update (migration 0035_reference_privacy). Ask an admin to apply it.",
      );
    } finally {
      db.from = from;
    }
  });
});

describe("through the API", () => {
  // jsonb containment, which import_image finds a script's earlier import by.
  const query = Object.getPrototypeOf(db.from("assets")) as Record<string, unknown>;
  if (!("contains" in query))
    query["contains"] = function (
      this: { filters: ((row: Record<string, unknown>) => boolean)[] },
      column: string,
      value: Record<string, unknown>,
    ) {
      this.filters.push((row) =>
        Object.entries(value).every(
          ([key, wanted]) => ((row[column] ?? {}) as Record<string, unknown>)[key] === wanted,
        ),
      );
      return this;
    };
  const caller = { userId, tokenId: "token", scopes: new Set(["read", "edit"]) } as never;
  const data = Buffer.from(png(1000, 600)).toString("base64");
  const tools = () => import("../../src/lib/studio-api/tools.server");
  const run = async (name: string, args: Record<string, unknown>, by: unknown = caller) =>
    (await (await tools()).studioTool(name)!.run(args, by as never)) as Record<string, unknown>;

  test("import_image with a reference choice keeps a screenshot out of the library until it is blurred", async () => {
    const files = db.rows("assets").length;
    const imported = await run("import_image", {
      title: "Portal",
      data,
      clientRequestId: "api-portal-1",
      reference: {},
    });
    expect(imported["assetId"]).toBeNull();
    const view = imported["redaction"] as Record<string, unknown>;
    expect(view).toMatchObject({ status: "review", layoutOnly: true, keepOriginal: false });
    expect(db.rows("assets")).toHaveLength(files);
    const redactionId = view["redactionId"] as string;
    // Sent again with the same id: the same screenshot, not a second.
    const again = await run("import_image", {
      title: "Portal",
      data,
      clientRequestId: "api-portal-1",
      reference: {},
    });
    expect((again["redaction"] as Record<string, unknown>)["redactionId"]).toBe(redactionId);

    expect((await run("apply_redaction", { redactionId }))["status"]).toBe("applying");
    finishCopy(redactionId);
    const done = await run("get_redaction", { redactionId });
    expect(done["status"]).toBe("completed");
    const file = await run("get_asset", { assetId: done["redactedAssetId"] });
    expect(file["privacy"]).toMatchObject({ layoutOnly: true, redactedAreas: 4 });
  });

  test("import_image can mark a picture layout only without blurring it; only an admin lifts it", async () => {
    const imported = await run("import_image", {
      title: "Wireframe",
      data,
      clientRequestId: "api-wireframe-1",
      reference: { redact: false },
    });
    expect(imported).toMatchObject({ imported: true, layoutOnly: true });
    const assetId = imported["assetId"] as string;
    await expect(assertPlaceable([assetId], "edit")).rejects.toThrow("“Wireframe” is layout only");
    await expect(run("set_layout_only", { assetId, layoutOnly: false })).rejects.toThrow(
      "Only an admin can lift a layout-only mark",
    );
    const admins = { userId: adminId, tokenId: "admin-token", scopes: new Set(["edit"]) };
    expect(await run("set_layout_only", { assetId, layoutOnly: false }, admins)).toEqual({
      assetId,
      privacy: null,
    });
    await expect(assertPlaceable([assetId], "edit")).resolves.toBeUndefined();
  });

  test("a screenshot to blur must be one the worker can read", async () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 10, 0]).toString("base64");
    await expect(
      run("import_image", {
        title: "Animated",
        data: gif,
        clientRequestId: "api-gif-0001",
        reference: {},
      }),
    ).rejects.toThrow("A screenshot to redact must be a PNG, JPEG or WebP");
  });
});
