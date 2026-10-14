/**
 * Running long videos.
 *
 * A run is a chain of clips. Clip 1 is generated as set up; when its video is
 * in the library, the media service measures it and takes a frame just before
 * its end; clip 2 is generated from that frame, and so on until the last clip.
 *
 * Everything here moves a run one safe step at a time and can be called from
 * anywhere, as often as you like: the Higgsfield webhook (a clip finished
 * saving), the media-service callback (a measurement or frame came back), the
 * reconcile job (anything missed) and people (start, retry, continue). Each
 * step is a conditional update, so two callers can never both take it: a clip
 * is generated once per attempt, and its handoff frame taken once per try.
 *
 * Paid work is never repeated on its own: a clip that fails (or whose
 * submission is uncertain) stops the run until a person retries it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { assertGenerationAllowed, createAndSubmitGeneration } from "../generation-create.server";
import { mediaWorkerConfigured } from "../media/worker.server";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import { compileFromLongVideo, type LongVideoEndCard, type LongVideoSeam } from "../edit/compile";
import { isMissingTableError } from "../edit/errors";
import type { ModelRegistryEntry } from "../model-schema";
import { storedFinale, storeFinale } from "./finisher";
import {
  cameraMotionOf,
  countedLength,
  handoffFrameOf,
  inclusiveCut,
  withCameraLine,
} from "./handoff";
import {
  clipStart,
  durationChoices,
  finaleHolds,
  finaleReveals,
  HANDOFF_MARGINS_SECONDS,
  LONG_VIDEO_LIMITS,
  planClips,
  planIssues,
  totalSeconds,
  type ClipDraft,
  type RunFinale,
  type RunReference,
} from "./plan";

type RunRow = Database["public"]["Tables"]["long_videos"]["Row"];
type ClipRow = Database["public"]["Tables"]["long_video_clips"]["Row"];
type Json = Record<string, unknown>;

/** A clip being started for longer than this was interrupted and is looked at again. */
const CLAIM_STALE_MS = 2 * 60_000;
/** A measurement or frame with no answer after this long is taken as lost and tried again. */
const HANDOFF_TASK_STALE_MS = 10 * 60_000;
/** Failed tries at a handoff (measuring or taking the frame) before a person is asked. */
const MAX_HANDOFF_FAILURES = 5;
/** Steps one call takes at most; the rest is picked up by the next event. */
const MAX_STEPS = 10;

const db = supabaseAdmin;
const now = () => new Date().toISOString();
const clipLabel = (clip: Pick<ClipRow, "position">) => `Clip ${clip.position + 1}`;

/** The generation request key of a clip's attempt: one generation per attempt, ever. */
export function clipRequestKey(clip: Pick<ClipRow, "id" | "attempt">): string {
  return `lvc:${clip.id}:${clip.attempt}`;
}

async function loadModel(id: string): Promise<ModelRegistryEntry | null> {
  const { data } = await db.from("model_registry").select("*").eq("id", id).maybeSingle();
  return (data as unknown as ModelRegistryEntry | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Starting a run                                                      */
/* ------------------------------------------------------------------ */

export interface StartLongVideoRequest {
  userId: string;
  title: string;
  firstModelId: string;
  continuationModelId: string;
  story: string;
  continuity: string;
  values: Record<string, unknown>;
  references: { assetId: string; role: string }[];
  clips: ClipDraft[];
  /** The brand's logo or end card the video ends on; never sent with the clips as a reference. */
  finale: RunFinale | null;
  projectId: string | null;
  campaignId: string | null;
  clientRequestId: string | null;
}

const TABLES_MISSING =
  "Long videos need a database update (migration 0010_long_videos). Ask an admin to apply it.";

export async function startLongVideo(
  request: StartLongVideoRequest,
): Promise<{ longVideoId: string; status: string; duplicate: boolean }> {
  if (request.clientRequestId) {
    const { data: existing, error } = await db
      .from("long_videos")
      .select("id,status")
      .eq("client_request_id", request.clientRequestId)
      .maybeSingle();
    if (isMissingTableError(error)) throw new AppError("UNKNOWN", TABLES_MISSING);
    if (existing) return { longVideoId: existing.id, status: existing.status, duplicate: true };
  }

  const [first, continuation] = await Promise.all([
    loadModel(request.firstModelId),
    loadModel(request.continuationModelId),
  ]);
  if (!first?.is_active || !continuation?.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  if (!mediaWorkerConfigured())
    throw new AppError(
      "INVALID_PARAMETERS",
      "Long videos need the media service, which takes each clip's last frame. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
    );
  await assertGenerationAllowed(request.userId);

  // References are checked against the library, never taken from the browser's word.
  const finale = request.finale;
  const ids = [
    ...new Set([
      ...request.references.map((item) => item.assetId),
      ...(finale ? [finale.assetId, ...(finale.frameAssetId ? [finale.frameAssetId] : [])] : []),
    ]),
  ];
  const { data: assets } = ids.length
    ? await db.from("assets").select("id,asset_type").in("id", ids).is("deleted_at", null)
    : { data: [] as { id: string; asset_type: string }[] };
  const references: RunReference[] = [];
  for (const item of request.references) {
    const asset = (assets ?? []).find((entry) => entry.id === item.assetId);
    if (!asset)
      throw new AppError("INVALID_PARAMETERS", "A reference file is no longer in the library");
    references.push({
      assetId: asset.id,
      role: item.role,
      assetType: asset.asset_type as RunReference["assetType"],
    });
  }
  if (finale) {
    for (const id of [finale.assetId, finale.frameAssetId]) {
      if (!id) continue;
      const asset = (assets ?? []).find((entry) => entry.id === id);
      if (!asset)
        throw new AppError("INVALID_PARAMETERS", "The finisher is no longer in the library");
      if (asset.asset_type !== "image")
        throw new AppError("INVALID_PARAMETERS", "The finisher must be an image");
    }
  }
  // The finisher ends the video; it isn't one of the clips' references.
  const finisher = new Set([finale?.assetId, finale?.frameAssetId].filter(Boolean));
  const clipReferences = references.filter((item) => !finisher.has(item.assetId));

  const firstChoices = durationChoices(first);
  const laterChoices = durationChoices(continuation);
  for (const [position, clip] of request.clips.entries()) {
    const allowed = position === 0 ? firstChoices : laterChoices;
    if (!allowed.includes(clip.durationSeconds))
      throw new AppError(
        "INVALID_PARAMETERS",
        `Clip ${position + 1} can't be ${clip.durationSeconds}s long with ${(position === 0 ? first : continuation).display_name}`,
      );
  }

  const planned = planClips({
    first,
    continuation,
    values: request.values,
    // All of them, the finisher too: a prompt names images by their place
    // among them (<<<image_n>>>). The plan keeps the finisher out of what
    // each clip is sent.
    references,
    clips: request.clips,
    finale,
  });
  const target = totalSeconds(request.clips.map((clip) => clip.durationSeconds));
  const issues = planIssues({
    first,
    continuation,
    clips: planned,
    targetSeconds: target,
    finale,
  });
  if (issues.length)
    throw new AppError("INVALID_PARAMETERS", issues.map((issue) => issue.message).join("; "));

  const { data: run, error } = await db
    .from("long_videos")
    .insert({
      title: request.title.trim().slice(0, LONG_VIDEO_LIMITS.titleChars) || "Long video",
      status: "running",
      project_id: request.projectId,
      campaign_id: request.campaignId,
      first_model_id: first.id,
      continuation_model_id: continuation.id,
      story: request.story.slice(0, LONG_VIDEO_LIMITS.storyChars),
      continuity: request.continuity.slice(0, LONG_VIDEO_LIMITS.continuityChars),
      target_seconds: target,
      clip_count: planned.length,
      settings: request.values as never,
      // The finisher is kept with them, for the Editor's end card.
      references_used: [
        ...clipReferences.map((item) => ({ asset_id: item.assetId, role: item.role })),
        ...(finale ? [storeFinale(finale)] : []),
      ] as never,
      client_request_id: request.clientRequestId,
      created_by: request.userId,
    } as never)
    .select("id")
    .single();
  if (error || !run) {
    if (error?.code === "23505" && request.clientRequestId) {
      const { data: raced } = await db
        .from("long_videos")
        .select("id,status")
        .eq("client_request_id", request.clientRequestId)
        .maybeSingle();
      if (raced) return { longVideoId: raced.id, status: raced.status, duplicate: true };
    }
    if (isMissingTableError(error)) throw new AppError("UNKNOWN", TABLES_MISSING);
    throw new AppError("UNKNOWN", error?.message ?? "The long video could not be recorded");
  }

  const { error: clipsError } = await db.from("long_video_clips").insert(
    planned.map((clip) => ({
      long_video_id: run.id,
      position: clip.position,
      model_registry_id: clip.model.id,
      beat: clip.beat,
      prompt: clip.prompt,
      duration_seconds: clip.durationSeconds,
      parameters: clip.values as never,
      inputs: clip.inputs.map((item) => ({ asset_id: item.assetId, role: item.role })) as never,
    })),
  );
  if (clipsError) {
    await db.from("long_videos").delete().eq("id", run.id);
    throw new AppError("UNKNOWN", "The long video's clips could not be recorded");
  }

  await advanceLongVideo(run.id);
  const { data: latest } = await db.from("long_videos").select("status").eq("id", run.id).single();
  return { longVideoId: run.id, status: latest?.status ?? "running", duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Moving a run on                                                     */
/* ------------------------------------------------------------------ */

/** Moves a run on as far as it can go right now. Safe to call at any time, from anywhere. */
export async function advanceLongVideo(longVideoId: string): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (!(await stepRun(longVideoId))) return;
  }
}

/** One step. True when something moved, so another look may move it further. */
async function stepRun(longVideoId: string): Promise<boolean> {
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", longVideoId)
    .maybeSingle();
  if (!run) return false;
  const { data: clips } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", longVideoId)
    .order("position");
  if (!clips?.length) return false;
  const lastPosition = clips.length - 1;

  if (run.status !== "running") {
    // A stopped run starts nothing new, but a clip that was already generating
    // still finishes: it is recorded, so it can be opened in the Editor.
    const generating = clips.find((clip) => clip.status === "generating");
    if (generating) await followGeneration(run, generating);
    return false;
  }

  // A clip is done once its video is in and measured and, for all but the
  // last, the next clip's start frame has been taken from it.
  const current = clips.find(
    (clip) =>
      !(
        clip.status === "completed" &&
        (clip.handoff_status === "ready" ||
          (clip.position === lastPosition && clip.handoff_status === "not_needed"))
      ),
  );
  if (!current) {
    await db
      .from("long_videos")
      .update({ status: "completed", completed_at: now(), error_code: null, error_message: null })
      .eq("id", run.id)
      .eq("status", "running");
    return false;
  }
  const previous = current.position > 0 ? (clips[current.position - 1] ?? null) : null;

  switch (current.status) {
    case "waiting":
      return startClip(run, current, previous);
    case "submitting":
      return recoverClaim(current);
    case "generating":
      return followGeneration(run, current);
    case "completed":
      return followHandoff(run, current, current.position === lastPosition);
    default:
      await pause(
        run,
        current.error_code ?? "CLIP_FAILED",
        current.error_message ?? `${clipLabel(current)} didn't finish`,
      );
      return false;
  }
}

/** Stops a run for a person to look at. */
async function pause(run: Pick<RunRow, "id">, code: string, message: string): Promise<void> {
  await db
    .from("long_videos")
    .update({ status: "needs_attention", error_code: code, error_message: message })
    .eq("id", run.id)
    .eq("status", "running");
}

async function failClip(
  run: Pick<RunRow, "id">,
  clip: ClipRow,
  from: ClipRow["status"],
  code: string,
  message: string,
): Promise<false> {
  await db
    .from("long_video_clips")
    .update({ status: "failed", error_code: code, error_message: message })
    .eq("id", clip.id)
    .eq("status", from);
  await pause(run, code, `${clipLabel(clip)}: ${message}`);
  return false;
}

async function generationForKey(key: string): Promise<{ id: string } | null> {
  const { data } = await db
    .from("generations")
    .select("id")
    .eq("client_request_id", key)
    .maybeSingle();
  return data ?? null;
}

async function attachGeneration(clip: ClipRow, generationId: string): Promise<void> {
  await db
    .from("long_video_clips")
    .update({ status: "generating", generation_id: generationId, started_at: now() })
    .eq("id", clip.id)
    .eq("status", "submitting");
}

async function startClip(run: RunRow, clip: ClipRow, previous: ClipRow | null): Promise<boolean> {
  const { data: claimed } = await db
    .from("long_video_clips")
    .update({ status: "submitting", claimed_at: now(), error_code: null, error_message: null })
    .eq("id", clip.id)
    .eq("status", "waiting")
    .select("id");
  if (!claimed?.length) return true;

  const model = await loadModel(clip.model_registry_id);
  if (!model?.is_active)
    return failClip(
      run,
      clip,
      "submitting",
      "MODEL_UNAVAILABLE",
      "Its model is no longer available",
    );

  const inputs: { assetId: string; role: string; position: number }[] = [];
  if (clip.position > 0) {
    // Its start frame, or (Cinema Studio) its first reference image, which its prompt names.
    const role = clipStart(model)?.role;
    const frame = previous?.handoff_asset_id;
    if (!role || !frame)
      return failClip(
        run,
        clip,
        "submitting",
        "HANDOFF_FAILED",
        "The frame it starts from isn't available",
      );
    inputs.push({ assetId: frame, role, position: 0 });
    await db.from("long_video_clips").update({ start_frame_asset_id: frame }).eq("id", clip.id);
  }
  for (const item of (clip.inputs ?? []) as { asset_id?: string; role?: string }[]) {
    if (typeof item.asset_id === "string" && typeof item.role === "string")
      inputs.push({ assetId: item.asset_id, role: item.role, position: inputs.length });
  }

  // A later clip is told how the camera was moving as the one before ended,
  // so it carries the move on instead of starting from rest.
  const parameters = { ...((clip.parameters ?? {}) as Json) };
  if (clip.position > 0 && typeof parameters["prompt"] === "string") {
    const motion = await handoffMotion(previous);
    const field = model.parameter_schema?.fields?.find((entry) => entry.key === "prompt");
    parameters["prompt"] = withCameraLine(parameters["prompt"], motion, field?.maxLength ?? null);
  }

  const key = clipRequestKey(clip);
  try {
    if (!run.created_by)
      throw new AppError(
        "NOT_AUTHORIZED",
        "The person who started this run is no longer on the team",
      );
    await assertGenerationAllowed(run.created_by);
    const started = await createAndSubmitGeneration({
      userId: run.created_by,
      model,
      parameters,
      inputs,
      projectId: run.project_id,
      campaignId: run.campaign_id,
      parentGenerationId: previous?.generation_id ?? null,
      generationGroupId: run.id,
      clientRequestId: key,
    });
    await attachGeneration(clip, started.generationId);
    return true;
  } catch (error) {
    // A generation recorded before the failure is followed, never started again.
    const existing = await generationForKey(key);
    if (existing) {
      await attachGeneration(clip, existing.id);
      return true;
    }
    const code = error instanceof AppError ? error.code : "UNKNOWN";
    const message = error instanceof Error ? error.message : "It couldn't be started";
    return failClip(run, clip, "submitting", code, message);
  }
}

/** How the camera was moving as a clip ended, as its handoff frame's task read it (null if unknown). */
async function handoffMotion(clip: ClipRow | null) {
  if (!clip?.handoff_task_id) return null;
  const { data: task } = await db
    .from("media_tasks")
    .select("output_payload")
    .eq("id", clip.handoff_task_id)
    .maybeSingle();
  return cameraMotionOf(((task?.output_payload ?? {}) as Json)["metadata"]);
}

/** A clip left "submitting" by an interrupted start: follow its generation if it got one, else start it again. */
async function recoverClaim(clip: ClipRow): Promise<boolean> {
  if (!clip.claimed_at || Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
    return false;
  const existing = await generationForKey(clipRequestKey(clip));
  if (existing) {
    await attachGeneration(clip, existing.id);
    return true;
  }
  const { data } = await db
    .from("long_video_clips")
    .update({ status: "waiting", claimed_at: null })
    .eq("id", clip.id)
    .eq("status", "submitting")
    .eq("claimed_at", clip.claimed_at)
    .select("id");
  return !!data?.length;
}

const FAILED_GENERATION: Record<string, string> = {
  failed: "Higgsfield couldn't generate it",
  nsfw: "Higgsfield's moderation blocked it",
  canceled: "Its generation was canceled",
};

/** A generation recorded but never sent (an interrupted start) is given up on after this long. */
const NEVER_SENT_MS = 10 * 60_000;

async function followGeneration(run: RunRow, clip: ClipRow): Promise<boolean> {
  if (!clip.generation_id)
    return failClip(run, clip, "generating", "GENERATION_MISSING", "Its generation is missing");
  const { data: generation } = await db
    .from("generations")
    .select("id,status,ingest_status,error_code,error_message,created_at")
    .eq("id", clip.generation_id)
    .maybeSingle();
  if (!generation)
    return failClip(run, clip, "generating", "GENERATION_MISSING", "Its generation is missing");

  if (generation.status === "completed") {
    if (generation.ingest_status === "completed") {
      const { data: video } = await db
        .from("assets")
        .select("id,duration_seconds,width,height")
        .eq("generation_id", generation.id)
        .eq("asset_type", "video")
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!video)
        return failClip(run, clip, "generating", "NO_VIDEO", "It finished without a video");
      const { data: done } = await db
        .from("long_video_clips")
        .update({
          status: "completed",
          output_asset_id: video.id,
          output_duration_seconds: video.duration_seconds,
          output_width: video.width,
          output_height: video.height,
          completed_at: now(),
          handoff_status: "none",
        })
        .eq("id", clip.id)
        .eq("status", "generating")
        .select("id");
      if (done?.length)
        await db
          .from("assets")
          .update({ title: `${run.title} · clip ${clip.position + 1}`.slice(0, 120) })
          .eq("id", video.id);
      return true;
    }
    if (
      generation.ingest_status === "failed" &&
      generation.error_code === "INGEST_RETRIES_EXHAUSTED"
    )
      await pause(
        run,
        "SAVE_FAILED",
        `${clipLabel(clip)} was made but couldn't be saved to the library. Retry the save in Activity, then press Continue.`,
      );
    return false;
  }
  if (generation.status === "submission_uncertain")
    return failClip(
      run,
      clip,
      "generating",
      "SUBMISSION_UNCERTAIN",
      "Higgsfield's answer was unclear, so it may or may not be running. Check Activity before retrying, or you could be charged twice.",
    );
  const reason = FAILED_GENERATION[generation.status];
  if (reason)
    return failClip(
      run,
      clip,
      "generating",
      generation.error_code ?? "PROVIDER_REJECTED",
      generation.error_message ? `${reason}: ${generation.error_message}` : reason,
    );
  // Still waiting to be sent long after it was recorded: its start was cut
  // short before it reached Higgsfield, so nothing is running or charging.
  if (
    ["ready", "draft", "estimating"].includes(generation.status) &&
    Date.now() - new Date(generation.created_at).getTime() > NEVER_SENT_MS
  )
    return failClip(
      run,
      clip,
      "generating",
      "NOT_SUBMITTED",
      "It was never sent to Higgsfield (its start was interrupted), so nothing was charged",
    );
  return false;
}

/* ------------------------------------------------------------------ */
/* Measuring clips and taking handoff frames                           */
/* ------------------------------------------------------------------ */

type HandoffKind = "probe" | "frame";

/**
 * The handoff frame is the clip's true last frame: the media service decodes
 * and counts the clip's frames and takes the last (see ./handoff). A media
 * service from before it could count frames takes one by time instead, so it
 * is sent this too: just before the clip's end, a little earlier on each
 * retry. With the frame rate known, that cut falls exactly on a frame: the
 * Editor ends the clip at `cut` (frames 0 … k-1) and the frame taken is frame
 * k itself, asked for half a frame early so the media service (which returns
 * the first frame at or after a time) can only return frame k. The next clip
 * starts from it, so no frame is shown twice or skipped.
 */
function handoffPoint(clip: ClipRow): { cut: number; at: number } {
  const length = Number(clip.output_duration_seconds ?? clip.duration_seconds);
  const tries = clip.handoff_attempts % MAX_HANDOFF_FAILURES;
  const margin = HANDOFF_MARGINS_SECONDS[Math.min(tries, HANDOFF_MARGINS_SECONDS.length - 1)]!;
  const fps = Number(clip.output_fps) || 0;
  if (fps > 0) {
    const frame = Math.max(1, Math.floor((length - margin) * fps + 1e-6));
    return { cut: Number((frame / fps).toFixed(6)), at: Number(((frame - 0.5) / fps).toFixed(4)) };
  }
  const cut = Math.max(0, Number((length - margin).toFixed(3)));
  return { cut, at: cut };
}

/** The frame at the clip's own width (even, as encoders need), within what the media service takes. */
function frameWidth(clip: ClipRow): number {
  const width = Number(clip.output_width ?? 0);
  if (!(width > 0)) return 1280;
  return Math.max(64, Math.min(3840, Math.floor(width / 2) * 2));
}

/** Frames larger than this (past 1440p) go as best-quality JPEG: as PNG they can pass what a provider takes. */
const PNG_MAX_PIXELS = 2_600_000;

/** The handoff frame's file: lossless PNG, so the next clip starts from exactly the picture shown. */
function handoffFile(clip: ClipRow): { ext: "png" | "jpg"; mime: string } {
  const pixels = Number(clip.output_width ?? 0) * Number(clip.output_height ?? 0);
  return pixels > PNG_MAX_PIXELS
    ? { ext: "jpg", mime: "image/jpeg" }
    : { ext: "png", mime: "image/png" };
}

/**
 * After a clip's video is in: measure it, then take its true last frame:
 * the next clip's start frame or, from the last clip, the final frame the
 * end card can sit over. Every clip, so the Editor knows its exact length.
 */
async function followHandoff(run: RunRow, clip: ClipRow, isLast: boolean): Promise<boolean> {
  switch (clip.handoff_status) {
    case "none": {
      const { data: claimed } = await db
        .from("long_video_clips")
        .update({ handoff_status: "probing", handoff_task_id: null, claimed_at: now() })
        .eq("id", clip.id)
        .eq("handoff_status", "none")
        .select("*");
      const next = claimed?.[0];
      return next ? enqueueHandoff(run, next, "probe", isLast) : true;
    }
    case "probing":
      return followTask(run, clip, "probe", isLast);
    case "extracting":
      return followTask(run, clip, "frame", isLast);
    case "failed":
      await pause(
        run,
        "HANDOFF_FAILED",
        clip.error_message ??
          `The next clip's start frame couldn't be taken from ${clipLabel(clip).toLowerCase()}`,
      );
      return false;
    default:
      // "not_needed" on a clip that now has one after it: take its frame after all.
      await db
        .from("long_video_clips")
        .update({ handoff_status: "none" })
        .eq("id", clip.id)
        .eq("handoff_status", clip.handoff_status);
      return true;
  }
}

async function enqueueHandoff(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
): Promise<boolean> {
  const status = kind === "probe" ? "probing" : "extracting";
  const { data: asset } = clip.output_asset_id
    ? await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,mime_type")
        .eq("id", clip.output_asset_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (!asset)
    return handoffFailed(run, clip, kind, isLast, {
      code: "VIDEO_MISSING",
      message: "Its video is no longer in the library",
      retryable: false,
    });

  const point = kind === "frame" ? handoffPoint(clip) : null;
  const file = handoffFile(clip);
  const result = await enqueueInternalMediaTask({
    createdBy: run.created_by,
    projectId: run.project_id,
    taskType: kind === "probe" ? "probe" : "extract_frames",
    source: {
      assetId: asset.id,
      assetType: asset.asset_type as "video",
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      mimeType: asset.mime_type,
    },
    // The true last frame; the time is for a media service that can't count frames.
    params: point
      ? { frame: "last", format: file.ext, times_seconds: [point.at], width: frameWidth(clip) }
      : {},
    dedupeKey: `lvh:${clip.id}:${clip.attempt}:${kind}:${clip.handoff_attempts}`,
    output:
      kind === "probe"
        ? { count: 0, ext: "json", mime: "application/json", kind: "image" }
        : { count: 1, ext: file.ext, mime: file.mime, kind: "image" },
    context: { long_video_clip_id: clip.id },
  });
  if (!result.ok)
    return handoffFailed(run, clip, kind, isLast, {
      code: result.code,
      message: result.message,
      retryable: result.retryable,
    });

  await db
    .from("long_video_clips")
    .update({
      handoff_task_id: result.taskId,
      ...(point ? { handoff_time_seconds: point.cut } : {}),
    })
    .eq("id", clip.id)
    .eq("handoff_status", status)
    .eq("handoff_attempts", clip.handoff_attempts);
  return true;
}

async function followTask(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
): Promise<boolean> {
  if (!clip.handoff_task_id) {
    // Claimed, but its task was never recorded (an interrupted step, or a
    // media service that was busy): ask again once the claim has gone stale.
    if (clip.claimed_at && Date.now() - new Date(clip.claimed_at).getTime() < CLAIM_STALE_MS)
      return false;
    const { data: reclaimed } = await db
      .from("long_video_clips")
      .update({ claimed_at: now() })
      .eq("id", clip.id)
      .eq("handoff_status", clip.handoff_status)
      .eq("handoff_attempts", clip.handoff_attempts)
      .is("handoff_task_id", null)
      .select("*");
    const next = reclaimed?.[0];
    return next ? enqueueHandoff(run, next, kind, isLast) : true;
  }

  const { data: task } = await db
    .from("media_tasks")
    .select(
      "id,status,error_code,error_message,result_asset_id,output_payload,created_at,updated_at",
    )
    .eq("id", clip.handoff_task_id)
    .maybeSingle();
  if (!task)
    return handoffFailed(run, clip, kind, isLast, {
      code: "TASK_MISSING",
      message: "The media task went missing",
      retryable: true,
    });

  if (task.status === "completed") {
    if (kind === "probe") {
      const probe = (((task.output_payload ?? {}) as Json)["metadata"] ?? {}) as Json;
      // The picture's own length where the media service reports it: the
      // container's can run on with the sound.
      const length =
        Number(probe["video_duration_seconds"]) > 0
          ? Number(probe["video_duration_seconds"])
          : Number(probe["duration_seconds"]);
      if (!(length > 0))
        return handoffFailed(run, clip, kind, isLast, {
          code: "PROBE_FAILED",
          message: "Its length couldn't be read",
          retryable: true,
        });
      const measured = {
        output_duration_seconds: length,
        output_fps: Number(probe["fps"]) > 0 ? Number(probe["fps"]) : null,
        output_width: Number(probe["width"]) > 0 ? Number(probe["width"]) : clip.output_width,
        output_height: Number(probe["height"]) > 0 ? Number(probe["height"]) : clip.output_height,
      };
      // Measured. Then its last frame: the next clip's start, or the last clip's final frame.
      const { data: moved } = await db
        .from("long_video_clips")
        .update({
          ...measured,
          handoff_status: "extracting",
          handoff_task_id: null,
          claimed_at: now(),
        })
        .eq("id", clip.id)
        .eq("handoff_status", "probing")
        .eq("handoff_task_id", task.id)
        .select("*");
      const next = moved?.[0];
      if (!next) return true;
      if (clip.output_asset_id)
        await db
          .from("assets")
          .update({
            duration_seconds: measured.output_duration_seconds,
            width: measured.output_width,
            height: measured.output_height,
          })
          .eq("id", clip.output_asset_id)
          .is("duration_seconds", null);
      return enqueueHandoff(run, next, "frame", isLast);
    }
    if (!task.result_asset_id)
      return handoffFailed(run, clip, kind, isLast, {
        code: "FRAME_MISSING",
        message: "No frame came back",
        retryable: true,
      });
    // A frame found by counting the clip's frames: the clip plays through it
    // (the next clip skips its own copy of it), and its exact length is known.
    const counted = handoffFrameOf(((task.output_payload ?? {}) as Json)["metadata"]);
    const { data: ready } = await db
      .from("long_video_clips")
      .update({
        handoff_status: "ready",
        handoff_asset_id: task.result_asset_id,
        ...(counted
          ? {
              handoff_time_seconds: inclusiveCut(counted),
              output_duration_seconds: countedLength(counted),
              output_fps: counted.fps,
            }
          : {}),
        error_code: null,
        error_message: null,
      })
      .eq("id", clip.id)
      .eq("handoff_status", "extracting")
      .eq("handoff_task_id", task.id)
      .select("id");
    if (ready?.length)
      await db
        .from("assets")
        .update({
          title: (isLast
            ? `${run.title} · final frame`
            : `${run.title} · clip ${clip.position + 2} start frame`
          ).slice(0, 120),
        })
        .eq("id", task.result_asset_id);
    return true;
  }

  if (task.status === "failed")
    return handoffFailed(run, clip, kind, isLast, {
      code: task.error_code ?? "RENDER_FAILED",
      message: task.error_message ?? "The media service couldn't do it",
      retryable: true,
      again: true,
    });
  const since = new Date(task.updated_at ?? task.created_at).getTime();
  if (Date.now() - since > HANDOFF_TASK_STALE_MS) {
    // Taken as lost: a late result is still recorded, but no longer used.
    await db
      .from("media_tasks")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "No result from the media service in time",
        completed_at: now(),
      })
      .eq("id", task.id)
      .in("status", ["submitting", "processing"]);
    return handoffFailed(run, clip, kind, isLast, {
      code: "STALLED",
      message: "The media service didn't answer",
      retryable: true,
      again: true,
    });
  }
  return false;
}

/**
 * A measuring or frame try that didn't work. It is tried again (a frame a
 * little earlier in the clip) up to a few times; then, or straight away when
 * trying again can't help, the run waits for a person, except for the last
 * clip, which is only measured and so is done without it. A task the media
 * service ran and failed is tried again at once; one it couldn't take (busy,
 * unreachable) is left for a later pass, so a busy service isn't asked again
 * immediately.
 */
async function handoffFailed(
  run: RunRow,
  clip: ClipRow,
  kind: HandoffKind,
  isLast: boolean,
  problem: { code: string; message: string; retryable: boolean; again?: boolean },
): Promise<boolean> {
  const failures = clip.handoff_attempts + 1;
  const status = kind === "probe" ? "probing" : "extracting";
  // Tries in this round (see resetHandoff): each round has the full number.
  const thisRound = (clip.handoff_attempts % MAX_HANDOFF_FAILURES) + 1;
  if (!problem.retryable || thisRound >= MAX_HANDOFF_FAILURES) {
    if (isLast) {
      // The last clip is done without it: without a measurement the Editor
      // uses the length the clip was asked for, and without its final frame
      // the end card is laid out on its own.
      const { data } = await db
        .from("long_video_clips")
        .update({
          handoff_status: "not_needed",
          handoff_attempts: failures,
          handoff_task_id: null,
          error_code: problem.code,
          error_message:
            kind === "probe"
              ? `It couldn't be measured: ${problem.message}`
              : `Its final frame couldn't be taken: ${problem.message}`,
        })
        .eq("id", clip.id)
        .eq("handoff_status", status)
        .eq("handoff_attempts", clip.handoff_attempts)
        .select("id");
      return !!data?.length;
    }
    const text = `The start frame for clip ${clip.position + 2} couldn't be taken from clip ${clip.position + 1}: ${problem.message}`;
    const { data } = await db
      .from("long_video_clips")
      .update({
        handoff_status: "failed",
        handoff_attempts: failures,
        error_code: problem.code,
        error_message: text,
      })
      .eq("id", clip.id)
      .eq("handoff_status", status)
      .eq("handoff_attempts", clip.handoff_attempts)
      .select("id");
    if (data?.length) await pause(run, "HANDOFF_FAILED", text);
    return false;
  }
  const { data: moved } = await db
    .from("long_video_clips")
    .update({
      handoff_status: kind === "probe" ? "none" : "extracting",
      handoff_attempts: failures,
      handoff_task_id: null,
      claimed_at: problem.again ? now() : new Date(Date.now() - CLAIM_STALE_MS).toISOString(),
      error_code: problem.code,
      error_message: problem.message,
    })
    .eq("id", clip.id)
    .eq("handoff_status", status)
    .eq("handoff_attempts", clip.handoff_attempts)
    .select("*");
  const next = moved?.[0];
  if (!next) return true;
  if (!problem.again) return false;
  return kind === "probe" ? true : enqueueHandoff(run, next, "frame", isLast);
}

/* ------------------------------------------------------------------ */
/* Events and the recovery pass                                        */
/* ------------------------------------------------------------------ */

/** A generation reached an end (saved, failed, canceled): move on the run it belongs to, if any. */
export async function advanceForGeneration(generationId: string): Promise<void> {
  const { data } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (data) await advanceLongVideo(data.long_video_id);
}

/** A handoff task reported back: move on the run it belongs to, if any. */
export async function advanceForMediaTask(taskId: string): Promise<void> {
  const { data } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("handoff_task_id", taskId)
    .maybeSingle();
  if (data) await advanceLongVideo(data.long_video_id);
}

/**
 * The reconcile job's pass: moves on every running run, and records clips that
 * finished in stopped runs, picking up anything an event missed.
 */
export async function sweepLongVideos(limit = 25): Promise<number> {
  const [{ data: running }, { data: generating }] = await Promise.all([
    db
      .from("long_videos")
      .select("id")
      .eq("status", "running")
      .order("created_at", { ascending: true })
      .limit(limit),
    db.from("long_video_clips").select("long_video_id").eq("status", "generating").limit(limit),
  ]);
  const ids = [
    ...new Set([
      ...(running ?? []).map((run) => run.id),
      ...(generating ?? []).map((clip) => clip.long_video_id),
    ]),
  ];
  for (const id of ids) {
    try {
      await advanceLongVideo(id);
    } catch (error) {
      console.error("long video sweep step failed", {
        longVideoId: id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return ids.length;
}

/* ------------------------------------------------------------------ */
/* People: retry, continue, stop                                       */
/* ------------------------------------------------------------------ */

async function reopen(runId: string): Promise<void> {
  await db
    .from("long_videos")
    .update({ status: "running", error_code: null, error_message: null, completed_at: null })
    .eq("id", runId)
    .in("status", ["needs_attention", "canceled"]);
}

/**
 * Tries a failed clip again as a new generation (a new attempt, billed like
 * any generation). A clip whose submission was uncertain may already be
 * running at the provider, so it is only retried once a person confirms it.
 */
export async function retryLongVideoClip(input: {
  clipId: string;
  confirmUncertain: boolean;
}): Promise<void> {
  const { data: clip } = await db
    .from("long_video_clips")
    .select("*")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");

  if (clip.status === "failed") {
    if (clip.error_code === "SUBMISSION_UNCERTAIN" && !input.confirmUncertain)
      throw new AppError(
        "SUBMISSION_UNCERTAIN",
        "This clip may already be running at Higgsfield. Check Activity, then confirm the retry.",
      );
    const { data: reset } = await db
      .from("long_video_clips")
      .update({
        status: "waiting",
        attempt: clip.attempt + 1,
        generation_id: null,
        claimed_at: null,
        started_at: null,
        completed_at: null,
        output_asset_id: null,
        output_duration_seconds: null,
        output_fps: null,
        output_width: null,
        output_height: null,
        handoff_status: "none",
        handoff_task_id: null,
        handoff_attempts: 0,
        handoff_time_seconds: null,
        handoff_asset_id: null,
        error_code: null,
        error_message: null,
      })
      .eq("id", clip.id)
      .eq("status", "failed")
      .eq("attempt", clip.attempt)
      .select("id");
    if (!reset?.length)
      throw new AppError("INVALID_PARAMETERS", "That clip has already been retried");
  } else if (clip.status === "completed" && clip.handoff_status === "failed") {
    await resetHandoff(clip);
  } else {
    throw new AppError("INVALID_PARAMETERS", "That clip hasn't failed");
  }
  await reopen(clip.long_video_id);
  await advanceLongVideo(clip.long_video_id);
}

/**
 * A failed handoff tried afresh, with a full round of tries. Tries keep
 * counting from round to round (each round starts at the next multiple of
 * MAX_HANDOFF_FAILURES), so a fresh round asks the media service for new
 * tasks rather than finding the ones that already failed under the same keys.
 */
async function resetHandoff(clip: Pick<ClipRow, "id" | "handoff_attempts">): Promise<void> {
  const nextRound =
    Math.ceil(Math.max(1, clip.handoff_attempts) / MAX_HANDOFF_FAILURES) * MAX_HANDOFF_FAILURES;
  await db
    .from("long_video_clips")
    .update({
      handoff_status: "none",
      handoff_attempts: nextRound,
      handoff_task_id: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", clip.id)
    .eq("handoff_status", "failed")
    .eq("handoff_attempts", clip.handoff_attempts);
}

/**
 * Picks a stopped run up again: failed handoffs are tried afresh and the chain
 * goes on from where it stopped. A clip whose generation failed still needs
 * its own retry (it is billed), so the run stops at it again until then.
 */
export async function continueLongVideo(longVideoId: string): Promise<void> {
  const { data: failed } = await db
    .from("long_video_clips")
    .select("id,handoff_attempts")
    .eq("long_video_id", longVideoId)
    .eq("handoff_status", "failed");
  for (const clip of failed ?? []) await resetHandoff(clip);
  await reopen(longVideoId);
  await advanceLongVideo(longVideoId);
}

/** Stops a run: no further clips are started. A clip already generating still finishes and is saved. */
export async function stopLongVideo(longVideoId: string): Promise<void> {
  await db
    .from("long_videos")
    .update({ status: "canceled" })
    .eq("id", longVideoId)
    .in("status", ["running", "needs_attention"]);
}

/* ------------------------------------------------------------------ */
/* Into the Editor                                                     */
/* ------------------------------------------------------------------ */

/**
 * Opens a run in the Editor as one edit: its clips in order, each cut at its
 * handoff frame so the next picks up seamlessly, then its end card. Once
 * made, the same edit is opened again (unless a fresh one is asked for), so a
 * second click never leaves two copies of the work.
 *
 * The end card is the run's finisher (when it was set to hold after the last
 * clip) unless `endCard` names another image, or none (null).
 */
export async function openLongVideoInEditor(input: {
  longVideoId: string;
  userId: string;
  seam: LongVideoSeam;
  keepSound: boolean;
  fresh: boolean;
  endCard?: { assetId: string; seconds: number } | null | undefined;
}): Promise<{ sequenceId: string; created: boolean; missing: number[] }> {
  const { data: run } = await db
    .from("long_videos")
    .select("*")
    .eq("id", input.longVideoId)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");

  if (run.sequence_id && !input.fresh) {
    const { data: existing } = await db
      .from("sequences")
      .select("id,is_archived")
      .eq("id", run.sequence_id)
      .maybeSingle();
    if (existing && !existing.is_archived)
      return { sequenceId: existing.id, created: false, missing: [] };
  }

  const { data: clips } = await db
    .from("long_video_clips")
    .select("*")
    .eq("long_video_id", run.id)
    .order("position");
  const outputIds = (clips ?? []).flatMap((clip) =>
    clip.status === "completed" && clip.output_asset_id ? [clip.output_asset_id] : [],
  );
  if (!outputIds.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      "No clip has finished yet, so there is nothing to edit",
    );
  const { data: assets } = await db
    .from("assets")
    .select("id,duration_seconds,width,height,title")
    .in("id", outputIds)
    .is("deleted_at", null);

  // The end card: as asked, else the run's finisher when it holds after the last clip.
  const finale = storedFinale(run.references_used);
  const wanted =
    input.endCard !== undefined
      ? input.endCard
      : finale && finaleHolds(finale.mode)
        ? { assetId: finale.frameAssetId || finale.assetId, seconds: finale.seconds }
        : null;
  let endCard: LongVideoEndCard | null = null;
  if (wanted) {
    // The finisher laid out at the video's shape is a library file of its own;
    // when it has been deleted, the finisher itself stands in for it.
    const ids = [wanted.assetId];
    if (finale?.frameAssetId && wanted.assetId === finale.frameAssetId) ids.push(finale.assetId);
    const { data: rows } = await db
      .from("assets")
      .select("id,asset_type,width,height")
      .in("id", ids)
      .is("deleted_at", null);
    const image = ids
      .map((id) => (rows ?? []).find((row) => row.id === id && row.asset_type === "image"))
      .find((row) => !!row);
    if (input.endCard && !image)
      throw new AppError("INVALID_PARAMETERS", "The end card must be an image in the library");
    if (image)
      endCard = {
        assetId: image.id,
        seconds: wanted.seconds,
        width: image.width,
        height: image.height,
        // The last clip already ends on it: the card follows on with barely a blend.
        revealed:
          !!finale &&
          finaleReveals(finale.mode) &&
          image.id === (finale.frameAssetId || finale.assetId),
      };
  }

  // Handoff frames found by counting the clip's frames (its true last frame),
  // as against ones taken by time just before its end, by task.
  const handoffTaskIds = (clips ?? []).flatMap((clip) =>
    clip.handoff_status === "ready" && clip.handoff_task_id ? [clip.handoff_task_id] : [],
  );
  const { data: handoffTasks } = handoffTaskIds.length
    ? await db.from("media_tasks").select("id,output_payload").in("id", handoffTaskIds)
    : { data: [] as { id: string; output_payload: unknown }[] };
  const counted = new Set(
    (handoffTasks ?? []).flatMap((task) =>
      handoffFrameOf(((task.output_payload ?? {}) as Json)["metadata"]) ? [task.id] : [],
    ),
  );

  const result = compileFromLongVideo(
    { title: run.title, settings: (run.settings ?? {}) as Json },
    (clips ?? []).map((clip) => ({
      position: clip.position,
      assetId: clip.status === "completed" ? clip.output_asset_id : null,
      cutSeconds:
        clip.handoff_status === "ready" ? Number(clip.handoff_time_seconds) || null : null,
      // Measured length, else the length it was asked for.
      lengthSeconds: Number(clip.output_duration_seconds) || Number(clip.duration_seconds) || null,
      fps: Number(clip.output_fps) || null,
      width: clip.output_width,
      height: clip.output_height,
      handsOffLastFrame: !!clip.handoff_task_id && counted.has(clip.handoff_task_id),
    })),
    (assets ?? []).map((asset) => ({
      id: asset.id,
      durationSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
      width: asset.width,
      height: asset.height,
    })),
    { seam: input.seam, keepSound: input.keepSound, endCard },
  );
  if (!result.timeline.clips.length)
    throw new AppError("INVALID_PARAMETERS", "The clips' videos are no longer in the library");

  const { data: sequence, error } = await db
    .from("sequences")
    .insert({
      title: result.title,
      timeline: result.timeline as never,
      project_id: run.project_id,
      campaign_id: run.campaign_id,
      source: { kind: "long_video", long_video_id: run.id } as never,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !sequence)
    throw new AppError("UNKNOWN", error?.message ?? "The edit could not be created");

  // Linked only if nobody linked another edit meanwhile (two clicks at once);
  // then theirs is opened and this copy removed.
  const link = db.from("long_videos").update({ sequence_id: sequence.id }).eq("id", run.id);
  const { data: linked } = await (
    run.sequence_id ? link.eq("sequence_id", run.sequence_id) : link.is("sequence_id", null)
  ).select("id");
  if (!linked?.length && !input.fresh) {
    const { data: latest } = await db
      .from("long_videos")
      .select("sequence_id")
      .eq("id", run.id)
      .maybeSingle();
    if (latest?.sequence_id) {
      await db.from("sequences").delete().eq("id", sequence.id);
      return { sequenceId: latest.sequence_id, created: false, missing: [] };
    }
  }
  if (!linked?.length)
    await db.from("long_videos").update({ sequence_id: sequence.id }).eq("id", run.id);
  return { sequenceId: sequence.id, created: true, missing: result.missing };
}
