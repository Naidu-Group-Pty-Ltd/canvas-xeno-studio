/**
 * Making a finished render's review sheet (see ./review-sheet): one media task
 * (review_sheet) on the render's video, its picture kept in the library like
 * any file a media task makes, and the task linked to the render
 * (sequence_renders.review_sheet_task_id, migration 0031_render_quality).
 * Asking again while a sheet is being made, or once it is made, returns that
 * one; a task the media service never confirmed taking is sent again, never
 * a second one.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { mediaWorkerConfigured, workerHealth } from "../media/worker.server";
import {
  UNCONFIRMED,
  UNCONFIRMED_MESSAGE,
  repeatTask,
  sendTask,
  taskRoutes,
  unanswered,
} from "../media/submit.server";
import { isMissingTableError } from "./errors";
import { serviceFeatures } from "./render-extras.server";
import {
  REVIEW_SHEET_FEATURE,
  briefImageNotes,
  draftNotes,
  reviewSheetParams,
  reviewSheetState,
  shotNotes,
  type ReviewSheetState,
  type ShotSources,
  type StoryboardShotNote,
} from "./review-sheet";
import { parseTimeline } from "./timeline";

const OUTPUT_BUCKET = "generated-assets";
const SOURCE_URL_TTL = 2 * 60 * 60;

export const REVIEW_SHEETS_NEED_MIGRATION =
  "Review sheets need a database update (migration 0031_render_quality). Ask an admin to apply it.";
const NOT_OFFERED =
  "The media service can't make review sheets until it is updated. Ask an admin to deploy the latest media worker.";

export interface ReviewSheetStarted {
  taskId: string;
  status: string;
  duplicate: boolean;
}

/** Whether the media service makes review sheets: as it last said, else as it says now. */
async function sheetsOffered(): Promise<boolean> {
  if ((await serviceFeatures(null)).includes(REVIEW_SHEET_FEATURE)) return true;
  // What it last said may be from before it was updated.
  const health = await workerHealth().catch(() => null);
  return !!health?.ok && (health.data?.features ?? []).includes(REVIEW_SHEET_FEATURE);
}

/** A sheet's picture, if it is still in the library (not deleted from it). */
async function keptSheet(assetId: string) {
  const { data } = await supabaseAdmin
    .from("assets")
    .select("storage_bucket,storage_path")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

/** What the edit was made from, to describe its shots by; whatever can't be read is left out. */
async function shotSources(sequence: {
  storyboard_id: string | null;
  brief_id: string | null;
  source: unknown;
}): Promise<ShotSources> {
  const sources: ShotSources = {};
  if (sequence.storyboard_id) {
    const { data: scenes } = await supabaseAdmin
      .from("scenes")
      .select("id,scene_number")
      .eq("storyboard_id", sequence.storyboard_id);
    const sceneNumbers = new Map((scenes ?? []).map((scene) => [scene.id, scene.scene_number]));
    const { data: shots } = sceneNumbers.size
      ? await supabaseAdmin
          .from("shots")
          .select("id,scene_id,shot_number,description,prompt")
          .in("scene_id", [...sceneNumbers.keys()])
      : { data: [] };
    const { data: takes } = shots?.length
      ? await supabaseAdmin
          .from("shot_takes")
          .select("shot_id,asset_id")
          .in(
            "shot_id",
            shots.map((shot) => shot.id),
          )
          .not("asset_id", "is", null)
      : { data: [] };
    sources.shots = (shots ?? []).map((shot): StoryboardShotNote => ({
      sceneNumber: sceneNumbers.get(shot.scene_id) ?? 0,
      shotNumber: shot.shot_number,
      description: shot.description,
      prompt: shot.prompt,
      assetIds: (takes ?? [])
        .filter((take) => take.shot_id === shot.id && take.asset_id)
        .map((take) => take.asset_id!),
    }));
  }
  const source = (sequence.source ?? {}) as Record<string, unknown>;
  if (source["kind"] === "supercomputer" && typeof source["message_id"] === "string") {
    const { data: message } = await supabaseAdmin
      .from("supercomputer_messages")
      .select("payload")
      .eq("id", source["message_id"])
      .maybeSingle();
    if (message) sources.drafts = draftNotes(message.payload);
  }
  if (sequence.brief_id) {
    const { data: brief } = await supabaseAdmin
      .from("creative_briefs")
      .select("analysis")
      .eq("id", sequence.brief_id)
      .maybeSingle();
    if (brief) sources.imageNotes = briefImageNotes(brief.analysis);
  }
  return sources;
}

/**
 * Makes a finished render's review sheet, as an active member asked. With
 * `again`, a sheet already made is made afresh (one being made is still
 * returned).
 */
export async function startReviewSheet(input: {
  renderId: string;
  userId: string;
  clientRequestId?: string | undefined;
  again?: boolean | undefined;
}): Promise<ReviewSheetStarted> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");

  const { data: render, error: renderError } = await supabaseAdmin
    .from("sequence_renders")
    .select("id,sequence_id,sequence_version,status,asset_id,timeline,review_sheet_task_id")
    .eq("id", input.renderId)
    .maybeSingle();
  if (renderError) {
    if (isMissingTableError(renderError))
      throw new AppError("PROVIDER_NOT_CONFIGURED", REVIEW_SHEETS_NEED_MIGRATION);
    throw new AppError("UNKNOWN", "The render couldn't be looked up. Try again.");
  }
  if (!render) throw new AppError("INVALID_PARAMETERS", "That render doesn't exist");
  if (render.status !== "completed" || !render.asset_id)
    throw new AppError("INVALID_PARAMETERS", "Only a finished render has a review sheet");
  if (!mediaWorkerConfigured())
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "The media service is not configured. An administrator needs to deploy it and set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );

  // The same request again, or the sheet this render already has.
  const dedupeKey = input.clientRequestId ? `review-sheet:${input.clientRequestId}` : null;
  if (dedupeKey) {
    const { data: existing } = await supabaseAdmin
      .from("media_tasks")
      .select("id,status,error_code")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing) return repeatTask(existing);
  }
  if (render.review_sheet_task_id) {
    const { data: linked } = await supabaseAdmin
      .from("media_tasks")
      .select("id,status,error_code,result_asset_id,error_message")
      .eq("id", render.review_sheet_task_id)
      .maybeSingle();
    if (linked) {
      if (linked.status === "failed" && linked.error_code === UNCONFIRMED)
        return repeatTask(linked);
      const state = reviewSheetState(linked);
      const kept = state.assetId && !input.again ? await keptSheet(state.assetId) : null;
      if (state.status === "making" || kept)
        return { taskId: linked.id, status: linked.status, duplicate: true };
    }
  }

  if (!(await sheetsOffered())) throw new AppError("PROVIDER_NOT_CONFIGURED", NOT_OFFERED);

  const timeline = parseTimeline(render.timeline);
  if (!timeline?.clips.length)
    throw new AppError("INVALID_PARAMETERS", "This render's edit has no clips to show");
  const [{ data: sequence }, { data: video }] = await Promise.all([
    supabaseAdmin
      .from("sequences")
      .select("title,project_id,storyboard_id,brief_id,source")
      .eq("id", render.sequence_id)
      .maybeSingle(),
    supabaseAdmin
      .from("assets")
      .select("id,storage_bucket,storage_path,mime_type,width,height,project_id")
      .eq("id", render.asset_id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!video)
    throw new AppError("INVALID_PARAMETERS", "The rendered video is no longer in the library");
  const title = sequence?.title ?? "Edit";
  const notes = sequence
    ? shotNotes(timeline.clips, await shotSources(sequence).catch(() => ({})))
    : [];
  const params = reviewSheetParams({
    title,
    version: render.sequence_version,
    timeline,
    notes,
    size: { width: video.width, height: video.height },
  });

  const projectId = sequence?.project_id ?? video.project_id ?? null;
  const taskId = crypto.randomUUID();
  const scope = projectId ? `projects/${projectId}` : `unassigned/${input.userId}`;
  const storagePath = `${scope}/derived/${taskId}/1.jpg`;
  const outputTitle = `${title} · review sheet · version ${render.sequence_version}`.slice(0, 200);
  const now = new Date().toISOString();

  // Operation first: the task is visible in the operation graph even if the
  // worker never answers.
  const { data: operation, error: operationError } = await supabaseAdmin
    .from("operations")
    .insert({
      created_by: input.userId,
      project_id: projectId,
      operation_type: "review_sheet",
      provider: "media_worker",
      status: "running",
      input_payload: {
        task_type: "review_sheet",
        params,
        sources: [video.id],
        review_sheet_render_id: render.id,
      } as never,
      dedupe_key: dedupeKey,
      submitted_at: now,
    } as never)
    .select("id")
    .maybeSingle();
  if (operationError || !operation) {
    if (operationError?.code === "23505" && dedupeKey) {
      const { data: raced } = await supabaseAdmin
        .from("media_tasks")
        .select("id,status,error_code")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      if (raced) return repeatTask(raced);
      throw new AppError(
        "UNKNOWN",
        "This review sheet is already being started. Give it a moment.",
      );
    }
    throw new AppError("UNKNOWN", "The review sheet could not be recorded. Try again.");
  }

  // Recorded with where its picture lands before the worker is asked, so a
  // result that comes back at once is always kept.
  const { error: taskError } = await supabaseAdmin.from("media_tasks").insert({
    id: taskId,
    operation_id: operation.id,
    created_by: input.userId,
    project_id: projectId,
    source_asset_id: video.id,
    task_type: "review_sheet",
    status: "submitting",
    storage_bucket: OUTPUT_BUCKET,
    storage_path: storagePath,
    input_payload: {
      params,
      sources: [video.id],
      storage_paths: [storagePath],
      mime_type: "image/jpeg",
      output_kind: "image",
      output_title: outputTitle,
      review_sheet_render_id: render.id,
    } as never,
    dedupe_key: dedupeKey,
    submitted_at: now,
  } as never);
  if (taskError) {
    if (taskError.code === "23505" && dedupeKey) {
      const { data: raced } = await supabaseAdmin
        .from("media_tasks")
        .select("id,status,error_code")
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();
      if (raced) return repeatTask(raced);
    }
    throw new AppError("UNKNOWN", "The review sheet could not be recorded. Try again.");
  }

  const fail = async (code: string, message: string): Promise<never> => {
    const at = new Date().toISOString();
    await supabaseAdmin
      .from("media_tasks")
      .update({ status: "failed", error_code: code, error_message: message, completed_at: at })
      .eq("id", taskId)
      .eq("status", "submitting");
    await supabaseAdmin
      .from("operations")
      .update({ status: "failed", error_code: code, error_message: message, failed_at: at })
      .eq("id", operation.id)
      .eq("status", "running");
    throw new AppError(code as never, message);
  };

  // The render shows its sheet from now on, whatever becomes of the task.
  const { error: linkError } = await supabaseAdmin
    .from("sequence_renders")
    .update({ review_sheet_task_id: taskId } as never)
    .eq("id", render.id);
  if (linkError)
    await fail(
      "UNKNOWN",
      isMissingTableError(linkError)
        ? REVIEW_SHEETS_NEED_MIGRATION
        : "The review sheet couldn't be linked to its render. Try again.",
    );

  const { data: signed } = await supabaseAdmin.storage
    .from(video.storage_bucket)
    .createSignedUrl(video.storage_path, SOURCE_URL_TTL);
  if (!signed?.signedUrl)
    await fail("STORAGE_FAILED", "The rendered video could not be read from storage. Try again.");
  const { data: upload, error: uploadError } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (uploadError || !upload?.signedUrl)
    await fail("STORAGE_FAILED", "A place for the review sheet could not be prepared. Try again.");

  const submission = await sendTask({
    task_id: taskId,
    task_type: "review_sheet",
    sources: [{ role: "video", url: signed!.signedUrl, mime: video.mime_type }],
    uploads: [{ url: upload!.signedUrl, method: "PUT", storage_key: storagePath }],
    params: params as unknown as Record<string, unknown>,
    ...taskRoutes(),
  });

  if (unanswered(submission)) {
    // It may have the task: its result still counts if it comes, and asking
    // again sends this same task again.
    const at = new Date().toISOString();
    const { data: marked } = await supabaseAdmin
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: UNCONFIRMED,
        error_message: UNCONFIRMED_MESSAGE,
        completed_at: at,
      })
      .eq("id", taskId)
      .eq("status", "submitting")
      .select("id");
    if (marked?.length) {
      await supabaseAdmin
        .from("operations")
        .update({
          status: "failed",
          error_code: UNCONFIRMED,
          error_message: UNCONFIRMED_MESSAGE,
          failed_at: at,
        })
        .eq("id", operation.id)
        .eq("status", "running");
      throw new AppError("SUBMISSION_UNCERTAIN", UNCONFIRMED_MESSAGE);
    }
  } else if (!submission.ok) {
    await fail(
      submission.errorCode ?? "UNKNOWN",
      submission.errorMessage ?? "The media service turned the review sheet down",
    );
  } else {
    // Only a task still waiting moves on: a result that already arrived wins.
    await supabaseAdmin
      .from("media_tasks")
      .update({ status: "processing" })
      .eq("id", taskId)
      .eq("status", "submitting");
  }
  const { data: current } = await supabaseAdmin
    .from("media_tasks")
    .select("status")
    .eq("id", taskId)
    .maybeSingle();
  return { taskId, status: current?.status ?? "processing", duplicate: false };
}

/**
 * Where a render's review sheet stands, with a link to it once made (valid for
 * an hour); null when it has none (or its picture was deleted from the
 * library), or before migration 0031_render_quality.
 */
export async function reviewSheetOf(
  taskId: string | null | undefined,
): Promise<(ReviewSheetState & { url: string | null }) | null> {
  if (!taskId) return null;
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("id,status,result_asset_id,error_message")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return null;
  const state = reviewSheetState(task);
  if (!state.assetId) return { ...state, url: null };
  const asset = await keptSheet(state.assetId);
  if (!asset) return null;
  const { data: signed } = await supabaseAdmin.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 3600);
  return { ...state, url: signed?.signedUrl ?? null };
}
