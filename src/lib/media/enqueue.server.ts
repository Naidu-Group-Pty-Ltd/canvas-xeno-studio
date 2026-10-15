/**
 * Media tasks the server starts on its own (no person asked for them), such
 * as measuring a long video's clip and taking its handoff frame. Each task is
 * recorded before the worker is asked, keyed so a repeat never runs twice, and
 * its result comes back through the usual media-worker callback.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appBaseUrl } from "../generation-pipeline.server";
import { mediaWorkerConfigured, submitWorkerTask } from "./worker.server";
import type { MediaKind } from "./tasks";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 2 * 60 * 60;

export interface InternalTaskSource {
  assetId: string;
  assetType: MediaKind;
  bucket: string;
  path: string;
  mimeType: string | null;
}

export interface InternalTaskRequest {
  createdBy: string | null;
  projectId: string | null;
  taskType:
    "probe" | "extract_frames" | "trim_video" | "resize_image" | "prepare_audio" | "measure_sync";
  source: InternalTaskSource;
  /** More sources after the first, each in its role (measure_sync's voiceover piece, as "audio"). */
  extraSources?: (InternalTaskSource & { role: string })[];
  params: Record<string, unknown>;
  /** One task per key: asking again returns the task already recorded. */
  dedupeKey: string;
  /** Files the task produces (none for a probe). */
  output: { count: number; ext: string; mime: string; kind: MediaKind };
  /** Kept with the task so its result can be routed back, e.g. the long video clip it is for. */
  context?: Record<string, unknown>;
  /** What can't be done when the media service isn't set up, in the words of what asked. */
  notConfiguredMessage?: string;
}

export type InternalTaskResult =
  | { ok: true; taskId: string; duplicate: boolean }
  | { ok: false; code: string; message: string; retryable: boolean };

/** Worker answers worth trying again later: it was busy, unreachable or broken for a moment. */
function retryable(code: string, status: number): boolean {
  return status === 0 || status === 429 || status >= 500 || code === "MEDIA_WORKER_UNREACHABLE";
}

export async function enqueueInternalMediaTask(
  request: InternalTaskRequest,
): Promise<InternalTaskResult> {
  if (!mediaWorkerConfigured())
    return {
      ok: false,
      code: "MEDIA_WORKER_NOT_CONFIGURED",
      message:
        request.notConfiguredMessage ??
        "The media service is not configured, so the next clip's start frame can't be taken. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
      retryable: false,
    };

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("media_tasks")
    .select("id")
    .eq("dedupe_key", request.dedupeKey)
    .maybeSingle();
  if (lookupError)
    return { ok: false, code: "UNKNOWN", message: lookupError.message, retryable: true };
  if (existing) return { ok: true, taskId: existing.id, duplicate: true };

  const taskId = crypto.randomUUID();
  const scope = request.projectId
    ? `projects/${request.projectId}`
    : `unassigned/${request.createdBy ?? "studio"}`;
  const storagePaths = Array.from(
    { length: request.output.count },
    (_, index) => `${scope}/derived/${taskId}/${index + 1}.${request.output.ext}`,
  );

  // Recorded (with where its results land) before the worker is asked, so a
  // result that comes back at once can always be registered.
  const { error: insertError } = await supabaseAdmin.from("media_tasks").insert({
    id: taskId,
    created_by: request.createdBy,
    project_id: request.projectId,
    source_asset_id: request.source.assetId,
    task_type: request.taskType,
    status: "submitting",
    storage_bucket: OUTPUT_BUCKET,
    storage_path: storagePaths[0] ?? null,
    input_payload: {
      params: request.params,
      sources: [
        request.source.assetId,
        ...(request.extraSources ?? []).map((source) => source.assetId),
      ],
      storage_paths: storagePaths,
      mime_type: request.output.mime,
      output_kind: request.output.kind,
      ...(request.context ?? {}),
    } as never,
    dedupe_key: request.dedupeKey,
    submitted_at: new Date().toISOString(),
  } as never);
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("media_tasks")
        .select("id")
        .eq("dedupe_key", request.dedupeKey)
        .maybeSingle();
      if (raced) return { ok: true, taskId: raced.id, duplicate: true };
    }
    return { ok: false, code: "UNKNOWN", message: insertError.message, retryable: true };
  }

  const fail = async (
    code: string,
    message: string,
    again: boolean,
  ): Promise<InternalTaskResult> => {
    await supabaseAdmin
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: code,
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("status", "submitting");
    return { ok: false, code, message, retryable: again };
  };

  const { data: signed } = await supabaseAdmin.storage
    .from(request.source.bucket)
    .createSignedUrl(request.source.path, SOURCE_URL_TTL);
  if (!signed?.signedUrl)
    return fail("STORAGE_FAILED", "The clip could not be read from storage", true);
  const extras: { role: string; url: string; mime: string | null }[] = [];
  for (const source of request.extraSources ?? []) {
    const { data: extra } = await supabaseAdmin.storage
      .from(source.bucket)
      .createSignedUrl(source.path, SOURCE_URL_TTL);
    if (!extra?.signedUrl)
      return fail("STORAGE_FAILED", "A file for the task could not be read from storage", true);
    extras.push({ role: source.role, url: extra.signedUrl, mime: source.mimeType });
  }

  const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
  for (const path of storagePaths) {
    const { data: upload, error } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !upload?.signedUrl)
      return fail("STORAGE_FAILED", "A destination for the frame could not be prepared", true);
    uploads.push({ url: upload.signedUrl, method: "PUT", storage_key: path });
  }

  const submission = await submitWorkerTask({
    task_id: taskId,
    task_type: request.taskType,
    sources: [
      {
        role: request.source.assetType === "video" ? "video" : request.source.assetType,
        url: signed.signedUrl,
        mime: request.source.mimeType,
      },
      ...extras,
    ],
    uploads,
    params: request.params,
    callback: { url: `${appBaseUrl()}/api/public/media-worker-callback` },
  });
  if (!submission.ok) {
    const code = submission.errorCode ?? "MEDIA_WORKER_ERROR";
    return fail(
      code,
      submission.errorMessage ?? "The media service rejected the task",
      retryable(code, submission.status),
    );
  }

  // Only a task still waiting moves on: a result that already arrived wins.
  await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing" })
    .eq("id", taskId)
    .eq("status", "submitting");
  return { ok: true, taskId, duplicate: false };
}
