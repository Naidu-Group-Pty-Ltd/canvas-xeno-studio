/**
 * Redacting a reference screenshot (see ./redaction): staged and uploaded
 * into the private originals bucket (never the library), read for its text
 * with where each piece is, its boxes checked by a person, then blurred in a
 * copy by the media worker. The copy joins the library already marked (layout
 * only unless the person said otherwise), so it is never in the library
 * unmarked; then the original is deleted, or moved for admins if a person
 * asked to keep it.
 *
 * Who imported a screenshot (and admins) can see and change it while it is
 * checked; no one else can. A screenshot left unchecked for a week is
 * cancelled and its original deleted (sweepRedactions, run by the studio's
 * recovery job).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { isMissingTableError } from "../edit/errors";
import { enqueueInternalMediaTask } from "./enqueue.server";
import { PRIVACY_NEEDS_UPDATE } from "./layout-only";
import { requireActiveMember } from "./members.server";
import {
  boxCounts,
  ORIGINALS_BUCKET,
  redactionBoxes,
  redactionMessage,
  redactionTaskParams,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  UNCHECKED_DAYS,
  type RedactionStatus,
  type RedactionView,
} from "./redaction";
import { proposeRedaction } from "./text-boxes";
import { requireWorkerFeature } from "./worker-feature.server";

const COLUMNS =
  "id,created_by,project_id,title,status,original_bucket,original_path,mime_type,file_size,width,height,boxes,reading,layout_only,keep_original,original_removed_at,attempt,media_task_id,redacted_asset_id,error_code,error_message,client_request_id,completed_at";

interface Row {
  id: string;
  created_by: string | null;
  project_id: string | null;
  title: string;
  status: RedactionStatus;
  original_bucket: string;
  original_path: string;
  mime_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  boxes: unknown;
  reading: unknown;
  layout_only: boolean;
  keep_original: boolean;
  original_removed_at: string | null;
  attempt: number;
  media_task_id: string | null;
  redacted_asset_id: string | null;
  error_code: string | null;
  error_message: string | null;
  client_request_id: string | null;
  completed_at: string | null;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/** Turns a missing table (the migration not applied) into the words people need. */
function checked<T extends { error: unknown }>(result: T, what: string): T {
  if (result.error) {
    if (isMissingTableError(result.error))
      throw new AppError("INVALID_PARAMETERS", PRIVACY_NEEDS_UPDATE);
    throw new AppError("UNKNOWN", `${what} Try again.`);
  }
  return result;
}

/** Whether screenshots can be redacted here: the database has migration 0035. */
export async function privacyReady(): Promise<boolean> {
  const { error } = await supabaseAdmin.from("reference_redactions").select("id").limit(1);
  return !error;
}

async function rowById(redactionId: string): Promise<Row | null> {
  const { data } = checked(
    await supabaseAdmin
      .from("reference_redactions")
      .select(COLUMNS)
      .eq("id", redactionId)
      .maybeSingle(),
    "The screenshot couldn't be read.",
  );
  return (data ?? null) as Row | null;
}

/** A screenshot its importer (or an admin) is working on. */
async function ownRow(
  redactionId: string,
  userId: string,
): Promise<{ row: Row; isAdmin: boolean }> {
  const { isAdmin } = await requireActiveMember(userId);
  const row = await rowById(redactionId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That screenshot no longer exists");
  if (row.created_by !== userId && !isAdmin)
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only who imported this screenshot, or an admin, can see it",
    );
  return { row, isAdmin };
}

async function patch(id: string, values: Json, onlyIf?: RedactionStatus[]): Promise<boolean> {
  let query = supabaseAdmin
    .from("reference_redactions")
    .update(values as never)
    .eq("id", id);
  if (onlyIf) query = query.in("status", onlyIf);
  const { data, error } = await query.select("id");
  if (error) throw new AppError("UNKNOWN", "The screenshot couldn't be saved. Try again.");
  return !!data?.length;
}

function viewOf(row: Row, isAdmin = false): RedactionView {
  const boxes = redactionBoxes(row.boxes);
  const open = !["completed", "cancelled"].includes(row.status) && !row.original_removed_at;
  const reading = asRecord(row.reading);
  const failure = row.error_message ?? null;
  const message =
    row.status === "review" && reading["skipped"] === true && !boxes.length
      ? "Not read for private details, as asked. Drag across anything that must not be shown, or add it as it is."
      : row.status === "review" && typeof reading["message"] === "string"
        ? `${reading["message"]} ${redactionMessage(row.status, boxes)}`
        : redactionMessage(row.status, boxes, failure);
  return {
    redactionId: row.id,
    title: row.title,
    status: row.status,
    width: row.width,
    height: row.height,
    boxes,
    layoutOnly: row.layout_only,
    keepOriginal: row.keep_original,
    original:
      open || (isAdmin && !row.original_removed_at)
        ? { bucket: row.original_bucket, path: row.original_path }
        : null,
    originalKept: row.status === "completed" && !row.original_removed_at,
    redactedAssetId: row.redacted_asset_id,
    found: boxCounts(boxes),
    message,
  };
}

const extensionOf = (mime: string) => SCREENSHOT_TYPES[mime] ?? null;

function titleOf(name: string): string {
  const bare = name.replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  return (bare || "Screenshot").slice(0, 180);
}

export interface ScreenshotChoices {
  /** The copy is marked layout only (true unless a person says otherwise). */
  layoutOnly: boolean;
  /** Keep the original once the copy is made, for admins only. */
  keepOriginal: boolean;
}

/**
 * Starts importing a screenshot to redact: the server records it and picks
 * where in the private bucket it goes (the importer's own folder), and the
 * browser uploads it there.
 */
export async function stageScreenshot(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  size: number;
  projectId: string | null;
  choices: ScreenshotChoices;
}): Promise<{ redactionId: string; bucket: string; path: string }> {
  await requireActiveMember(input.userId);
  const extension = extensionOf(input.mimeType);
  if (!extension)
    throw new AppError("INVALID_PARAMETERS", "A screenshot must be a PNG, JPEG or WebP");
  if (input.size > SCREENSHOT_MAX_BYTES)
    throw new AppError("INVALID_PARAMETERS", "The screenshot is larger than 15 MB");
  const redactionId = crypto.randomUUID();
  const path = `${input.userId}/${redactionId}/original.${extension}`;
  checked(
    await supabaseAdmin.from("reference_redactions").insert({
      id: redactionId,
      created_by: input.userId,
      project_id: input.projectId,
      title: titleOf(input.fileName),
      status: "uploading",
      original_bucket: ORIGINALS_BUCKET,
      original_path: path,
      mime_type: input.mimeType,
      file_size: input.size,
      layout_only: input.choices.layoutOnly,
      keep_original: input.choices.keepOriginal,
    }),
    "The screenshot couldn't be recorded.",
  );
  return { redactionId, bucket: ORIGINALS_BUCKET, path };
}

/**
 * Reads an uploaded screenshot for its private details: what the AI reads
 * becomes boxes for a person to check (none, with a note, if it couldn't
 * read). With `read` false (a person turned blurring off) the AI isn't asked:
 * the screenshot is only measured, for a person to add as it is. Asked again
 * once read, it gives the boxes as they are.
 */
export async function readScreenshot(
  redactionId: string,
  userId: string,
  { read = true }: { read?: boolean } = {},
): Promise<RedactionView> {
  const { row, isAdmin } = await ownRow(redactionId, userId);
  if (row.status !== "uploading" && row.status !== "reading") return viewOf(row, isAdmin);
  const { data: file } = await supabaseAdmin.storage
    .from(row.original_bucket)
    .download(row.original_path);
  if (!file)
    throw new AppError("INVALID_PARAMETERS", "The screenshot hasn't arrived yet. Upload it again.");
  const { imageKind, imageSize } = await import("../brand/fetch.server");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(bytes);
  const size = imageSize(bytes);
  if (!kind || !extensionOf(kind.mime) || !size)
    throw new AppError("INVALID_PARAMETERS", "That isn't a PNG, JPEG or WebP picture");
  await patch(row.id, {
    status: "reading",
    width: size.width,
    height: size.height,
    mime_type: kind.mime,
  });

  if (!read) {
    await patch(row.id, { status: "review", boxes: [], reading: { skipped: true } }, [
      "uploading",
      "reading",
    ]);
    return viewOf((await rowById(row.id))!, isAdmin);
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(row.original_bucket)
    .createSignedUrl(row.original_path, 900);
  const { readTextBoxes } = await import("./text-boxes.server");
  const reading = signed?.signedUrl
    ? await readTextBoxes({ url: signed.signedUrl, purpose: "privacy" })
    : { ok: false as const, message: "the screenshot couldn't be read from storage" };
  const boxes = reading.ok ? proposeRedaction(reading.pieces, size.width / size.height) : [];
  await patch(
    row.id,
    {
      status: "review",
      boxes,
      // How many of each were found, and by what: never the text itself.
      reading: reading.ok
        ? {
            pieces: reading.pieces.length,
            found: boxCounts(boxes),
            model: reading.model,
            read_at: new Date().toISOString(),
          }
        : { message: `The text couldn't be read automatically (${reading.message}).` },
    },
    ["uploading", "reading"],
  );
  return viewOf((await rowById(row.id))!, isAdmin);
}

/**
 * A screenshot a script sends (import_image with a reference choice): put in
 * the private bucket by the server, then read like an upload. The same
 * request id returns the first import.
 */
export async function importScreenshot(input: {
  userId: string;
  bytes: Uint8Array;
  mimeType: string;
  title: string;
  projectId: string | null;
  choices: ScreenshotChoices;
  clientRequestId: string;
}): Promise<RedactionView> {
  await requireActiveMember(input.userId);
  const { data: known } = checked(
    await supabaseAdmin
      .from("reference_redactions")
      .select("id")
      .eq("created_by", input.userId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle(),
    "The screenshot couldn't be checked.",
  );
  if (known) return getRedaction(known.id, input.userId);
  const staged = await stageScreenshot({
    userId: input.userId,
    fileName: input.title,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    projectId: input.projectId,
    choices: input.choices,
  });
  await patch(staged.redactionId, {
    client_request_id: input.clientRequestId,
    title: input.title.slice(0, 200),
  });
  const { error } = await supabaseAdmin.storage
    .from(staged.bucket)
    .upload(staged.path, input.bytes, { contentType: input.mimeType, upsert: false });
  if (error) {
    await patch(staged.redactionId, {
      status: "cancelled",
      error_message: "It couldn't be stored",
    });
    throw new AppError("STORAGE_FAILED", "The screenshot couldn't be stored");
  }
  return readScreenshot(staged.redactionId, input.userId);
}

/**
 * Blurs the checked boxes in a copy (the media worker), or, with no box at
 * all, adds the screenshot to the library as it is. The choices made when it
 * was imported can be changed until then.
 */
export async function applyRedaction(
  redactionId: string,
  userId: string,
  input: { boxes?: unknown; layoutOnly?: boolean | undefined; keepOriginal?: boolean | undefined },
): Promise<RedactionView> {
  const { row, isAdmin } = await ownRow(redactionId, userId);
  if (row.status !== "review" && row.status !== "failed") return getRedaction(row.id, userId);
  const boxes = input.boxes === undefined ? redactionBoxes(row.boxes) : redactionBoxes(input.boxes);
  const choices = {
    layout_only: input.layoutOnly ?? row.layout_only,
    keep_original: input.keepOriginal ?? row.keep_original,
  };
  if (!boxes.length) {
    // Nothing private, by a person's own look: the screenshot itself joins the library.
    await patch(row.id, { ...choices, boxes: [] }, ["review", "failed"]);
    await addUnchanged({ ...row, ...choices, boxes: [] });
    return viewOf((await rowById(row.id))!, isAdmin);
  }
  if (!row.width || !row.height)
    throw new AppError("INVALID_PARAMETERS", "The screenshot's size isn't known: read it first");
  await requireWorkerFeature("redact_image", "Blurring a screenshot's private details");
  const attempt = row.attempt + 1;
  const task = await enqueueInternalMediaTask({
    createdBy: row.created_by,
    projectId: row.project_id,
    taskType: "redact_image",
    source: {
      assetId: null,
      assetType: "image",
      bucket: row.original_bucket,
      path: row.original_path,
      mimeType: row.mime_type,
    },
    params: redactionTaskParams(boxes, row.width, row.height),
    dedupeKey: `redaction:${row.id}:${attempt}`,
    output: { count: 1, ext: "png", mime: "image/png", kind: "image" },
    // Kept out of the library until it is marked (see finishRedaction).
    context: { reference_redaction_id: row.id, register_outputs: false },
    notConfiguredMessage:
      "The media service is not configured, so the screenshot can't be blurred. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
  });
  if (!task.ok) throw new AppError(task.retryable ? "PROVIDER_TIMEOUT" : "UNKNOWN", task.message);
  await patch(
    row.id,
    {
      ...choices,
      boxes,
      attempt,
      status: "applying",
      media_task_id: task.taskId,
      error_code: null,
      error_message: null,
    },
    ["review", "failed"],
  );
  return getRedaction(row.id, userId);
}

/**
 * A library file for a picture in storage, made once (by its place), with
 * its privacy mark: made hidden, marked, and only then shown, so it is never
 * in the library unmarked (a run cut short leaves it hidden, for the next
 * run to finish).
 */
async function addToLibrary(
  row: Row,
  file: {
    bucket: string;
    path: string;
    mime: string;
    size: number | null;
    width: number | null;
    height: number | null;
  },
  areas: number,
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("storage_bucket", file.bucket)
    .eq("storage_path", file.path)
    .maybeSingle();
  let assetId = existing?.id ?? null;
  if (!assetId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("assets")
      .insert({
        uploaded_by: row.created_by,
        project_id: row.project_id,
        asset_type: "image",
        source_type: "uploaded",
        title: areas ? `${row.title} (redacted)` : row.title,
        storage_bucket: file.bucket,
        storage_path: file.path,
        mime_type: file.mime,
        file_size: file.size,
        width: file.width,
        height: file.height,
        deleted_at: new Date().toISOString(),
        metadata: {
          reference_screenshot: true,
          redaction_id: row.id,
          redacted_areas: areas,
        } as never,
      })
      .select("id")
      .maybeSingle();
    if (error || !inserted)
      throw new AppError("UNKNOWN", "The copy couldn't be added to the library");
    assetId = inserted.id;
  }
  const { error: markError } = await supabaseAdmin.from("asset_privacy").upsert(
    {
      asset_id: assetId,
      layout_only: row.layout_only,
      redaction_id: row.id,
      redacted_areas: areas,
      marked_by: row.created_by,
    },
    { onConflict: "asset_id" },
  );
  if (markError) throw new AppError("UNKNOWN", "The copy's mark couldn't be saved");
  const { error: showError } = await supabaseAdmin
    .from("assets")
    .update({ deleted_at: null })
    .eq("id", assetId);
  if (showError) throw new AppError("UNKNOWN", "The copy couldn't be shown in the library");
  return assetId;
}

/** The original, once the copy is in the library: kept for admins if asked, else deleted. */
async function settleOriginal(row: Row): Promise<Json> {
  const store = supabaseAdmin.storage.from(row.original_bucket);
  if (row.keep_original) {
    const name = row.original_path.split("/").pop() ?? "original";
    const kept = `kept/${row.id}/${name}`;
    if (row.original_path !== kept) {
      const { error } = await store.move(row.original_path, kept);
      if (error) {
        // Put away already by a run cut short before it was recorded.
        const { data: there } = await store.list(`kept/${row.id}`);
        if (!(there ?? []).some((file) => file.name === name))
          throw new AppError("STORAGE_FAILED", "The original couldn't be put away for admins");
      }
    }
    return { original_path: kept };
  }
  await store.remove([row.original_path]);
  return { original_removed_at: new Date().toISOString() };
}

/** No box at all: the screenshot itself goes into the library, marked as chosen. */
async function addUnchanged(row: Row): Promise<void> {
  const extension = extensionOf(row.mime_type) ?? "png";
  const scope = row.project_id
    ? `projects/${row.project_id}`
    : `unassigned/${row.created_by ?? "studio"}`;
  const path = `${scope}/inputs/${row.id}-reference.${extension}`;
  const { data: file } = await supabaseAdmin.storage
    .from(row.original_bucket)
    .download(row.original_path);
  if (!file) throw new AppError("STORAGE_FAILED", "The screenshot couldn't be read");
  const { error } = await supabaseAdmin.storage
    .from("generation-inputs")
    .upload(path, file, { contentType: row.mime_type, upsert: true });
  if (error)
    throw new AppError("STORAGE_FAILED", "The screenshot couldn't be added to the library");
  const assetId = await addToLibrary(
    row,
    {
      bucket: "generation-inputs",
      path,
      mime: row.mime_type,
      size: row.file_size,
      width: row.width,
      height: row.height,
    },
    0,
  );
  // Nothing private in it: no copy of it needs keeping apart.
  await supabaseAdmin.storage.from(row.original_bucket).remove([row.original_path]);
  await patch(row.id, {
    status: "completed",
    redacted_asset_id: assetId,
    original_removed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}

/**
 * Takes up a finished copy: it joins the library already marked, then the
 * original is deleted (or kept for admins). Safe to run again at any point.
 */
export async function finishRedaction(redactionId: string): Promise<void> {
  const row = await rowById(redactionId);
  if (!row || row.status !== "applying" || !row.media_task_id) return;
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("status,output_payload,error_code,error_message")
    .eq("id", row.media_task_id)
    .maybeSingle();
  if (!task) return;
  if (["failed", "cancelled", "stalled"].includes(task.status)) {
    await patch(
      row.id,
      {
        status: "failed",
        error_code: task.error_code ?? "RENDER_FAILED",
        error_message: task.error_message ?? "The media service couldn't blur it",
      },
      ["applying"],
    );
    return;
  }
  if (task.status !== "completed") return;
  const output = asRecord(task.output_payload);
  const files = Array.isArray(output["files"]) ? (output["files"] as Json[]) : [];
  const file = files[0];
  if (!file || typeof file["bucket"] !== "string" || typeof file["path"] !== "string") {
    await patch(
      row.id,
      {
        status: "failed",
        error_code: "RENDER_FAILED",
        error_message: "The media service made no copy",
      },
      ["applying"],
    );
    return;
  }
  const metadata = asRecord(output["metadata"]);
  const boxes = redactionBoxes(row.boxes);
  const assetId = await addToLibrary(
    row,
    {
      bucket: file["bucket"],
      path: file["path"],
      mime: "image/png",
      size: typeof metadata["size_bytes"] === "number" ? metadata["size_bytes"] : null,
      width: typeof metadata["width"] === "number" ? metadata["width"] : row.width,
      height: typeof metadata["height"] === "number" ? metadata["height"] : row.height,
    },
    boxes.length,
  );
  const original = await settleOriginal(row);
  await patch(
    row.id,
    {
      ...original,
      status: "completed",
      redacted_asset_id: assetId,
      completed_at: new Date().toISOString(),
    },
    ["applying"],
  );
}

/** A screenshot as it is now (taken up first, if its copy was just made). */
export async function getRedaction(redactionId: string, userId: string): Promise<RedactionView> {
  const { row, isAdmin } = await ownRow(redactionId, userId);
  if (row.status === "applying") await finishRedaction(row.id);
  return viewOf((await rowById(row.id)) ?? row, isAdmin);
}

/** Drops a screenshot before its copy is made: the original is deleted. */
export async function cancelRedaction(redactionId: string, userId: string): Promise<RedactionView> {
  const { row, isAdmin } = await ownRow(redactionId, userId);
  if (row.status === "completed" || row.status === "cancelled" || row.status === "applying")
    return viewOf(row, isAdmin);
  await supabaseAdmin.storage.from(row.original_bucket).remove([row.original_path]);
  await patch(row.id, { status: "cancelled", original_removed_at: new Date().toISOString() });
  return viewOf((await rowById(row.id))!, isAdmin);
}

/** A link to a kept original, for an admin only (valid for ten minutes). */
export async function keptOriginalLink(redactionId: string, userId: string): Promise<string> {
  const { isAdmin } = await requireActiveMember(userId);
  if (!isAdmin)
    throw new AppError("NOT_AUTHORIZED", "Only an admin can open a screenshot's original");
  const row = await rowById(redactionId);
  if (!row || row.original_removed_at)
    throw new AppError("INVALID_PARAMETERS", "The original wasn't kept");
  const { data } = await supabaseAdmin.storage
    .from(row.original_bucket)
    .createSignedUrl(row.original_path, 600);
  if (!data?.signedUrl) throw new AppError("STORAGE_FAILED", "The original couldn't be opened");
  return data.signedUrl;
}

/** The redaction a media task belongs to, moved on once its result is recorded. */
export async function advanceForMediaTask(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("input_payload")
    .eq("id", taskId)
    .maybeSingle();
  const redactionId = asRecord(task?.input_payload)["reference_redaction_id"];
  if (typeof redactionId === "string") await finishRedaction(redactionId);
}

/**
 * The studio's recovery job: copies made that no report took up are taken
 * up, and screenshots left unchecked for a week are cancelled, their
 * originals deleted (an original is kept only if a person asks). Returns how
 * many it moved on. Nothing happens before migration 0035.
 */
export async function sweepRedactions(limit = 10): Promise<number> {
  const { data: applying, error } = await supabaseAdmin
    .from("reference_redactions")
    .select("id")
    .eq("status", "applying")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) return 0;
  let moved = 0;
  for (const row of (applying ?? []) as { id: string }[]) {
    await finishRedaction(row.id).catch(() => undefined);
    moved += 1;
  }
  const stale = new Date(Date.now() - UNCHECKED_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: unchecked } = await supabaseAdmin
    .from("reference_redactions")
    .select("id,original_bucket,original_path")
    .in("status", ["uploading", "reading", "review", "failed"])
    .lt("updated_at", stale)
    .limit(limit);
  for (const row of (unchecked ?? []) as {
    id: string;
    original_bucket: string;
    original_path: string;
  }[]) {
    await supabaseAdmin.storage
      .from(row.original_bucket)
      .remove([row.original_path])
      .catch(() => undefined);
    if (
      await patch(
        row.id,
        {
          status: "cancelled",
          original_removed_at: new Date().toISOString(),
          error_message: `Left unchecked for ${UNCHECKED_DAYS} days`,
        },
        ["uploading", "reading", "review", "failed"],
      ).catch(() => false)
    )
      moved += 1;
  }
  return moved;
}
