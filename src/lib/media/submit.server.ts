/**
 * Sending the media tasks people ask for (see submitMediaTask) to the worker.
 *
 * No answer, or one from the infrastructure in front of the worker, doesn't
 * mean it didn't take a task. It acknowledges a task id it already has
 * without running it twice, so the same task is simply sent again. A task it
 * still never confirmed taking is closed as unconfirmed: a result it reports
 * still counts, and asking for it again (the same request id) sends that
 * same task again, never a second one. A task sent again can reach another
 * instance of the worker, so each task checks in with the app when it starts
 * (see refreshTaskCredentials): the first instance claims it, and any other
 * drops it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appBaseUrl } from "../generation-pipeline.server";
import { AppError } from "../higgsfield/errors";
import { submitWorkerTask, type MediaWorkerTask, type WorkerCall } from "./worker.server";

/** The error code of a task the worker never confirmed taking. */
export const UNCONFIRMED = "SUBMISSION_UNCERTAIN";
export const UNCONFIRMED_MESSAGE =
  "The media service didn't confirm it took this task. Try again: a task it already has is never done twice.";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 2 * 60 * 60;
/** How long a task's signed links last (signed upload URLs last two hours). */
const LINKS_VALID_MS = 2 * 60 * 60 * 1000;
/**
 * How long a task can go without word from the worker before it is taken as
 * lost: past its links (and so the worker's claim on it) and a task's longest run.
 */
const LOST_AFTER_MS = LINKS_VALID_MS + 30 * 60 * 1000;
const LOST_MESSAGE = "The media service never reported back on this task. Try it again.";

/** No answer, or one from the infrastructure in front of the worker: it may have the task. */
export function unanswered(call: { ok: boolean; status: number }): boolean {
  return !call.ok && (call.status === 0 || call.status >= 500);
}

/** Sends a task, and once more a moment later if no answer comes back. */
export async function sendTask(
  task: MediaWorkerTask,
): Promise<WorkerCall<{ accepted: boolean; task_id: string }>> {
  const first = await submitWorkerTask(task);
  if (!unanswered(first)) return first;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return submitWorkerTask(task);
}

/** Where the worker reports a task's result, and where it checks in with it. */
export function taskRoutes(): Pick<
  MediaWorkerTask,
  "callback" | "credentials_url" | "credentials_expire_at"
> {
  const base = appBaseUrl().replace(/\/$/, "");
  return {
    callback: { url: `${base}/api/public/media-worker-callback` },
    credentials_url: `${base}/api/public/media-worker-credentials`,
    credentials_expire_at: new Date(Date.now() + LINKS_VALID_MS).toISOString(),
  };
}

/**
 * A recorded task's links, signed afresh in the order first sent: its sources
 * (even one deleted from the library since) and its destinations.
 */
async function signLinks(task: {
  storage_bucket: string | null;
  input_payload: unknown;
}): Promise<
  | { ok: true; sources: MediaWorkerTask["sources"]; uploads: MediaWorkerTask["uploads"] }
  | { ok: false; message: string }
> {
  const input = (task.input_payload ?? {}) as Record<string, unknown>;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  // A task whose sources aren't library files (a composition's bundle, its
  // stretches) names where each is kept and its role instead.
  if (Array.isArray(input["source_files"])) return signFiles(task, input, strings);
  const ids = strings(input["sources"]);
  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type")
    .in("id", ids);
  const sources: MediaWorkerTask["sources"] = [];
  for (const id of ids) {
    const asset = (assets ?? []).find((entry) => entry.id === id);
    const { data: signed } = asset
      ? await supabaseAdmin.storage
          .from(asset.storage_bucket)
          .createSignedUrl(asset.storage_path, SOURCE_URL_TTL)
      : { data: null };
    if (!asset || !signed?.signedUrl)
      return { ok: false, message: "A source file could not be read from storage. Try again." };
    sources.push({
      role:
        asset.asset_type === "audio" ? "audio" : asset.asset_type === "video" ? "video" : "source",
      url: signed.signedUrl,
      mime: asset.mime_type,
    });
  }
  // A worker that lost the task (a restart) makes it again, over anything it uploaded before.
  const uploads: MediaWorkerTask["uploads"] = [];
  for (const path of strings(input["storage_paths"])) {
    const { data: signed, error } = await supabaseAdmin.storage
      .from(task.storage_bucket ?? OUTPUT_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !signed?.signedUrl)
      return {
        ok: false,
        message: "A destination for the rendered file could not be prepared. Try again.",
      };
    uploads.push({ url: signed.signedUrl, method: "PUT", storage_key: path });
  }
  return { ok: true, sources, uploads };
}

/** signLinks for a task that names its sources by where they are kept (`source_files`). */
async function signFiles(
  task: { storage_bucket: string | null },
  input: Record<string, unknown>,
  strings: (value: unknown) => string[],
): Promise<
  | { ok: true; sources: MediaWorkerTask["sources"]; uploads: MediaWorkerTask["uploads"] }
  | { ok: false; message: string }
> {
  const sources: MediaWorkerTask["sources"] = [];
  for (const entry of input["source_files"] as unknown[]) {
    const file = (entry ?? {}) as Record<string, unknown>;
    const bucket = typeof file["bucket"] === "string" ? file["bucket"] : null;
    const path = typeof file["path"] === "string" ? file["path"] : null;
    const { data: signed } =
      bucket && path
        ? await supabaseAdmin.storage.from(bucket).createSignedUrl(path, SOURCE_URL_TTL)
        : { data: null };
    if (!signed?.signedUrl)
      return { ok: false, message: "A source file could not be read from storage. Try again." };
    sources.push({
      role: typeof file["role"] === "string" ? file["role"] : "source",
      url: signed.signedUrl,
      mime: typeof file["mime"] === "string" ? file["mime"] : null,
    });
  }
  const uploads: MediaWorkerTask["uploads"] = [];
  for (const path of strings(input["storage_paths"])) {
    const { data: signed, error } = await supabaseAdmin.storage
      .from(task.storage_bucket ?? OUTPUT_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !signed?.signedUrl)
      return {
        ok: false,
        message: "A destination for the rendered file could not be prepared. Try again.",
      };
    uploads.push({ url: signed.signedUrl, method: "PUT", storage_key: path });
  }
  return { ok: true, sources, uploads };
}

/** Opens again a task the worker never confirmed taking, now that it has it. */
async function reopen(task: { id: string; operation_id: string | null }) {
  const { data: reopened, error } = await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing", error_code: null, error_message: null, completed_at: null })
    .eq("id", task.id)
    .eq("status", "failed")
    .eq("error_code", UNCONFIRMED)
    .select("id");
  if (error || !reopened?.length || !task.operation_id) return { error };
  const { error: operationError } = await supabaseAdmin
    .from("operations")
    .update({ status: "running", error_code: null, error_message: null, failed_at: null })
    .eq("id", task.operation_id)
    .eq("status", "failed");
  return { error: operationError };
}

/**
 * The task a repeated request (the same request id) started: one the worker
 * never confirmed taking is sent to it again, under its own id. Any other is
 * returned as it is.
 */
export async function repeatTask(row: {
  id: string;
  status: string;
  error_code: string | null;
}): Promise<{ taskId: string; status: string; duplicate: true }> {
  if (row.status !== "failed" || row.error_code !== UNCONFIRMED)
    return { taskId: row.id, status: row.status, duplicate: true };

  const { data: task, error } = await supabaseAdmin
    .from("media_tasks")
    .select("id,task_type,operation_id,storage_bucket,input_payload")
    .eq("id", row.id)
    .maybeSingle();
  if (error || !task)
    throw new AppError("UNKNOWN", "The media task couldn't be looked up. Try again.");
  const links = await signLinks(task);
  if (!links.ok) throw new AppError("STORAGE_FAILED", links.message);

  const submission = await sendTask({
    task_id: task.id,
    task_type: task.task_type,
    sources: links.sources,
    uploads: links.uploads,
    params: ((task.input_payload as Record<string, unknown> | null)?.["params"] ?? {}) as Record<
      string,
      unknown
    >,
    ...taskRoutes(),
  });
  if (unanswered(submission)) throw new AppError("SUBMISSION_UNCERTAIN", UNCONFIRMED_MESSAGE);

  if (submission.ok) {
    // Taken now, or acknowledged as one it had.
    await reopen(task);
  } else {
    // Refused outright, it doesn't have it (it acknowledges a task it has even
    // with a full queue, and the same task is no less valid the second time),
    // so the task failed. (Had another instance taken it, that one is refused
    // when it checks in, as the task is closed.)
    const code = submission.errorCode ?? "UNKNOWN";
    const message = submission.errorMessage ?? "The media service rejected the task";
    const { data: closed } = await supabaseAdmin
      .from("media_tasks")
      .update({ error_code: code, error_message: message })
      .eq("id", task.id)
      .eq("status", "failed")
      .eq("error_code", UNCONFIRMED)
      .select("id");
    if (closed?.length && task.operation_id)
      await supabaseAdmin
        .from("operations")
        .update({ error_code: code, error_message: message })
        .eq("id", task.operation_id)
        .eq("status", "failed");
  }
  // As it is now: its result may have come back meanwhile.
  const { data: current } = await supabaseAdmin
    .from("media_tasks")
    .select("status")
    .eq("id", task.id)
    .maybeSingle();
  return {
    taskId: task.id,
    status: current?.status ?? (submission.ok ? "processing" : "failed"),
    duplicate: true,
  };
}

export type TaskCredentials =
  | {
      status: 200;
      sources: { url: string }[];
      uploads: { url: string; method: "PUT"; storage_key: string }[];
      expires_at: string;
    }
  // Claimed, but its links couldn't be renewed just now: the worker goes on
  // with the ones it has.
  | { status: 202 }
  | { status: 404 | 410 | 503 };

/**
 * A media task checking in, when the worker starts it and again before it
 * uploads (Editor renders have their own: see refreshRenderCredentials). A
 * task sent again can reach another instance of the worker, so the first
 * instance to ask claims it, and any other is told to drop it (410), as is
 * one asking about a task that has been closed. A task the worker never
 * confirmed taking is open again: it has it. Its links are signed afresh.
 */
export async function refreshTaskCredentials(
  taskId: string,
  workerId: string | null,
): Promise<TaskCredentials> {
  const { data: task, error } = await supabaseAdmin
    .from("media_tasks")
    .select("id,task_type,status,error_code,operation_id,storage_bucket,input_payload")
    .eq("id", taskId)
    .maybeSingle();
  if (error) return { status: 503 };
  if (!task || task.task_type === "render_sequence") return { status: 404 };
  const unconfirmed = task.status === "failed" && task.error_code === UNCONFIRMED;
  if (task.status !== "submitting" && task.status !== "processing" && !unconfirmed)
    return { status: 410 };
  if (workerId !== null && !/^[\w-]{1,64}$/.test(workerId)) return { status: 404 };
  if (workerId) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("media_tasks")
      .update({ worker_id: workerId } as never)
      .eq("id", task.id)
      .or(`worker_id.is.null,worker_id.eq.${workerId}`)
      .select("id");
    if (claimError) return { status: 503 };
    if (!claimed?.length) return { status: 410 };
  }
  if (unconfirmed && (await reopen(task)).error) return { status: 503 };

  const links = await signLinks(task);
  if (!links.ok) return { status: 202 };
  return {
    status: 200,
    sources: links.sources.map((source) => ({ url: source.url })),
    uploads: links.uploads.map((upload) => ({
      url: upload.url,
      method: "PUT" as const,
      storage_key: upload.storage_key ?? "",
    })),
    expires_at: new Date(Date.now() + LINKS_VALID_MS).toISOString(),
  };
}

/**
 * Closes the media tasks people asked for that the worker hasn't reported on,
 * nor checked in about, for longer than it could still be working on them:
 * never taken, its worker gone, or its claim given up while the app was away.
 * Each is closed as presumed lost (STALLED): a result that still comes is
 * recorded, a worker that asks about it is told to drop it, and asking for it
 * again starts it afresh. (Editor renders and a long video's own tasks have
 * their own recovery.)
 */
export async function closeLostMediaTasks(limit = 50): Promise<number> {
  const cutoff = new Date(Date.now() - LOST_AFTER_MS).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("media_tasks")
    .select("id,operation_id")
    .in("status", ["submitting", "processing"])
    .neq("task_type", "render_sequence")
    .is("input_payload->>long_video_clip_id", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  let closed = 0;
  for (const row of rows ?? []) {
    const at = new Date().toISOString();
    // Unless word came from it meanwhile.
    const { data: lost } = await supabaseAdmin
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: LOST_MESSAGE,
        completed_at: at,
      })
      .eq("id", row.id)
      .in("status", ["submitting", "processing"])
      .lt("updated_at", cutoff)
      .select("id");
    if (!lost?.length) continue;
    closed += 1;
    if (row.operation_id)
      await supabaseAdmin
        .from("operations")
        .update({
          status: "failed",
          error_code: "STALLED",
          error_message: LOST_MESSAGE,
          failed_at: at,
        })
        .eq("id", row.operation_id)
        .eq("status", "running");
  }
  return closed;
}
