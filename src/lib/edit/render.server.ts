/**
 * Sequence rendering: validates an edit, records the render, signs the media
 * it needs and hands the media worker one fully described job.
 *
 * The worker only ever sees short-lived signed URLs: storage credentials stay
 * here. Everything the callback needs (where the result lands) is written
 * before the job is submitted, so even an instant result is recorded.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { appBaseUrl } from "../generation-pipeline.server";
import { mediaWorkerConfigured, submitWorkerTask } from "../media/worker.server";
import { RENDER_STALL_MS } from "./renders";
import { buildRenderRequest, parseTimeline, renderBlockers, type Timeline } from "./timeline";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 3 * 60 * 60;

interface RenderInput {
  sequenceId: string;
  expectedVersion: number;
  clientRequestId: string;
  userId: string;
}

export interface RenderStarted {
  renderId: string;
  status: string;
  duplicate: boolean;
}

/** Checks every clip and track against the library before anything is recorded. */
async function resolveAssets(timeline: Timeline) {
  const wanted = new Map<string, "video" | "image" | "audio">();
  for (const clip of timeline.clips) wanted.set(clip.assetId, clip.kind);
  for (const item of timeline.audio) {
    if (wanted.has(item.assetId) && wanted.get(item.assetId) !== "audio") {
      throw new AppError("INVALID_PARAMETERS", "One file is used both as a clip and as audio");
    }
    wanted.set(item.assetId, "audio");
  }
  const ids = [...wanted.keys()];
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,duration_seconds,title")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", "The edit's media could not be checked");
  const assets = new Map((data ?? []).map((asset) => [asset.id, asset]));
  for (const [id, kind] of wanted) {
    const asset = assets.get(id);
    if (!asset)
      throw new AppError(
        "INVALID_PARAMETERS",
        "A file used in this edit is no longer in the library. Remove it and try again.",
      );
    if (asset.asset_type !== kind) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `"${asset.title ?? "A file"}" is a ${asset.asset_type} file and cannot be used as ${kind}`,
      );
    }
  }
  for (const [index, clip] of timeline.clips.entries()) {
    const known = assets.get(clip.assetId)?.duration_seconds;
    if (clip.kind === "video" && known && clip.trimStart >= Number(known)) {
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${index + 1} starts after the end of its footage`,
      );
    }
  }
  return assets;
}

export async function startSequenceRender(input: RenderInput): Promise<RenderStarted> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");

  if (!mediaWorkerConfigured()) {
    throw new AppError(
      "UNKNOWN",
      "Rendering needs the media service. An administrator needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );
  }

  // A repeated click or a retried request returns the render already started.
  const { data: existing } = await supabaseAdmin
    .from("sequence_renders")
    .select("id,status")
    .eq("dedupe_key", input.clientRequestId)
    .maybeSingle();
  if (existing) return { renderId: existing.id, status: existing.status, duplicate: true };

  const { data: sequence } = await supabaseAdmin
    .from("sequences")
    .select("id,title,project_id,campaign_id,version,timeline")
    .eq("id", input.sequenceId)
    .maybeSingle();
  if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit no longer exists");
  if (sequence.version !== input.expectedVersion) {
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit changed since it was last saved. Let it save, then render again.",
    );
  }

  const timeline = parseTimeline(sequence.timeline);
  if (!timeline)
    throw new AppError(
      "INVALID_PARAMETERS",
      "This edit could not be read. Reopen it and save again.",
    );
  const blockers = renderBlockers(timeline);
  if (blockers.length) throw new AppError("INVALID_PARAMETERS", blockers[0]);

  const assets = await resolveAssets(timeline);
  const request = buildRenderRequest(timeline);

  const renderId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const scope = sequence.project_id
    ? `projects/${sequence.project_id}`
    : `unassigned/${input.userId}`;
  const videoPath = `${scope}/edits/${sequence.id}/${renderId}.mp4`;
  const posterPath = `${scope}/edits/${sequence.id}/${renderId}.jpg`;
  const now = new Date().toISOString();

  // Earlier renders of this edit that stopped reporting are closed as failed.
  await supabaseAdmin
    .from("sequence_renders")
    .update({
      status: "failed",
      error_code: "STALLED",
      error_message: "This render stopped responding.",
      completed_at: now,
    } as never)
    .eq("sequence_id", sequence.id)
    .in("status", ["queued", "rendering"])
    .lt("updated_at", new Date(Date.now() - RENDER_STALL_MS).toISOString());

  const { data: operation } = await supabaseAdmin
    .from("operations")
    .insert({
      created_by: input.userId,
      project_id: sequence.project_id,
      campaign_id: sequence.campaign_id,
      operation_type: "render_sequence",
      provider: "media_worker",
      status: "running",
      input_payload: {
        sequence_id: sequence.id,
        render_id: renderId,
        version: sequence.version,
      } as never,
      dedupe_key: `render:${input.clientRequestId}`,
      submitted_at: now,
    } as never)
    .select("id")
    .maybeSingle();

  const { error: taskError } = await supabaseAdmin.from("media_tasks").insert({
    id: taskId,
    operation_id: operation?.id ?? null,
    created_by: input.userId,
    project_id: sequence.project_id,
    source_asset_id: timeline.clips[0]?.assetId ?? null,
    task_type: "render_sequence",
    status: "submitting",
    storage_bucket: OUTPUT_BUCKET,
    storage_path: videoPath,
    input_payload: {
      sequence_id: sequence.id,
      render_id: renderId,
      storage_paths: [videoPath, posterPath],
      mime_type: "video/mp4",
      output_kind: "video",
      sources: request.sources.map((source) => source.assetId),
    } as never,
    dedupe_key: `render:${input.clientRequestId}`,
    submitted_at: now,
  } as never);
  if (taskError) {
    if (taskError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("sequence_renders")
        .select("id,status")
        .eq("dedupe_key", input.clientRequestId)
        .maybeSingle();
      if (raced) return { renderId: raced.id, status: raced.status, duplicate: true };
      throw new AppError("UNKNOWN", "This render is already starting. Give it a moment.");
    }
    throw new AppError("UNKNOWN", "The render could not be recorded");
  }

  const { error: renderError } = await supabaseAdmin.from("sequence_renders").insert({
    id: renderId,
    sequence_id: sequence.id,
    sequence_version: sequence.version,
    timeline: timeline as never,
    status: "queued",
    stage: "Queued",
    media_task_id: taskId,
    dedupe_key: input.clientRequestId,
    created_by: input.userId,
  } as never);
  if (renderError) {
    await supabaseAdmin.from("media_tasks").delete().eq("id", taskId);
    if (renderError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("sequence_renders")
        .select("id,status")
        .eq("dedupe_key", input.clientRequestId)
        .maybeSingle();
      if (raced) return { renderId: raced.id, status: raced.status, duplicate: true };
    }
    throw new AppError("UNKNOWN", "The render could not be recorded");
  }

  await supabaseAdmin
    .from("sequences")
    .update({ status: "rendering", last_render_id: renderId } as never)
    .eq("id", sequence.id);

  async function fail(code: string, message: string): Promise<never> {
    const at = new Date().toISOString();
    await supabaseAdmin
      .from("media_tasks")
      .update({ status: "failed", error_code: code, error_message: message, completed_at: at })
      .eq("id", taskId);
    await supabaseAdmin
      .from("sequence_renders")
      .update({
        status: "failed",
        error_code: code,
        error_message: message,
        completed_at: at,
      } as never)
      .eq("id", renderId);
    await supabaseAdmin
      .from("sequences")
      .update({ status: "failed" } as never)
      .eq("id", sequence!.id)
      .eq("last_render_id", renderId);
    if (operation?.id) {
      await supabaseAdmin
        .from("operations")
        .update({ status: "failed", error_code: code, error_message: message, failed_at: at })
        .eq("id", operation.id);
    }
    throw new AppError(code as never, message);
  }

  const sources: { role: string; url: string; mime?: string | null }[] = [];
  for (const source of request.sources) {
    const asset = assets.get(source.assetId)!;
    const { data: signed } = await supabaseAdmin.storage
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, SOURCE_URL_TTL);
    if (!signed?.signedUrl)
      await fail("STORAGE_FAILED", `"${asset.title ?? "A file"}" could not be read from storage`);
    sources.push({ role: source.role, url: signed!.signedUrl, mime: asset.mime_type });
  }

  const uploads: { url: string; method: "PUT"; storage_key: string }[] = [];
  for (const path of [videoPath, posterPath]) {
    const { data: signed, error } = await supabaseAdmin.storage
      .from(OUTPUT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed?.signedUrl)
      await fail("STORAGE_FAILED", "A destination for the rendered video could not be prepared");
    uploads.push({ url: signed!.signedUrl, method: "PUT", storage_key: path });
  }

  const submission = await submitWorkerTask({
    task_id: taskId,
    task_type: "render_sequence",
    sources,
    uploads,
    params: request.params,
    callback: { url: `${appBaseUrl().replace(/\/$/, "")}/api/public/media-worker-callback` },
    report_progress: true,
  });
  if (!submission.ok) {
    await fail(
      submission.errorCode ?? "UNKNOWN",
      submission.errorMessage ?? "The media service rejected the render",
    );
  }

  // Only a task still waiting moves on: a result that already arrived wins.
  await supabaseAdmin
    .from("media_tasks")
    .update({ status: "processing" })
    .eq("id", taskId)
    .eq("status", "submitting");
  await supabaseAdmin
    .from("sequence_renders")
    .update({ status: "rendering", stage: "Starting" } as never)
    .eq("id", renderId)
    .eq("status", "queued");

  return { renderId, status: "rendering", duplicate: false };
}
