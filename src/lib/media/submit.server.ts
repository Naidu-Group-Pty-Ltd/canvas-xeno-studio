/**
 * Sending the media tasks people ask for (see submitMediaTask) to the worker.
 *
 * No answer, or one from the infrastructure in front of the worker, doesn't
 * mean it didn't take a task. It acknowledges a task id it already has
 * without running it twice, so the same task is simply sent again. A task it
 * still never confirmed taking is closed as unconfirmed: a result it reports
 * still counts, and asking for it again (the same request id) sends that
 * same task again, never a second one.
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

export function workerCallbackUrl(): string {
  return `${appBaseUrl().replace(/\/$/, "")}/api/public/media-worker-callback`;
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
  const input = (task.input_payload ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(input["sources"]) ? (input["sources"] as string[]) : [];
  const paths = Array.isArray(input["storage_paths"]) ? (input["storage_paths"] as string[]) : [];

  // The same task: its files (even one deleted from the library since) and destinations, signed afresh.
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
      throw new AppError(
        "STORAGE_FAILED",
        "A source file could not be read from storage. Try again.",
      );
    sources.push({
      role:
        asset.asset_type === "audio" ? "audio" : asset.asset_type === "video" ? "video" : "source",
      url: signed.signedUrl,
      mime: asset.mime_type,
    });
  }
  // A worker that lost the task (a restart) makes it again, over anything it uploaded before.
  const uploads: MediaWorkerTask["uploads"] = [];
  for (const path of paths) {
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(task.storage_bucket ?? OUTPUT_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signError || !signed?.signedUrl)
      throw new AppError(
        "STORAGE_FAILED",
        "A destination for the rendered file could not be prepared. Try again.",
      );
    uploads.push({ url: signed.signedUrl, method: "PUT", storage_key: path });
  }

  const submission = await sendTask({
    task_id: task.id,
    task_type: task.task_type,
    sources,
    uploads,
    params: (input["params"] ?? {}) as Record<string, unknown>,
    callback: { url: workerCallbackUrl() },
  });
  if (unanswered(submission)) throw new AppError("SUBMISSION_UNCERTAIN", UNCONFIRMED_MESSAGE);

  // Taken (now, or acknowledged as one it had): open again. Refused outright,
  // it doesn't have it (it acknowledges a task it has even with a full queue,
  // and the same task is no less valid the second time), so the task failed.
  const code = submission.errorCode ?? "UNKNOWN";
  const message = submission.errorMessage ?? "The media service rejected the task";
  const { data: changed } = await supabaseAdmin
    .from("media_tasks")
    .update(
      submission.ok
        ? { status: "processing", error_code: null, error_message: null, completed_at: null }
        : { error_code: code, error_message: message },
    )
    .eq("id", task.id)
    .eq("status", "failed")
    .eq("error_code", UNCONFIRMED)
    .select("id");
  if (changed?.length && task.operation_id)
    await supabaseAdmin
      .from("operations")
      .update(
        submission.ok
          ? { status: "running", error_code: null, error_message: null, failed_at: null }
          : { error_code: code, error_message: message },
      )
      .eq("id", task.operation_id)
      .eq("status", "failed");
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
