/**
 * Single clips made to a voiceover: the Create page's one clip, on a model
 * whose audio drives the picture (see ./models).
 *
 * A voiceover attached to the model's driving-audio input is sent as its
 * prepared piece: the whole voiceover, cut from its canonical file (see
 * ./slices.server), not the file as uploaded. The provider then gets a WAV it
 * takes, with no encoder delay for one program to read differently from the
 * next, raised if it is quiet, and at least as long as a model takes. Only a
 * voiceover that has been prepared (and so made by the studio or confirmed
 * for use) is sent this way; anything else goes as it was given.
 *
 * Once the clip is in the library its sound is measured against that piece
 * (measure_sync), the answer kept on the clip's file (metadata.lip_sync), and
 * "Open in Editor" lays the clip and the voiceover so its lips meet the voice
 * (the same placement a long video's clips get). A measurement no event
 * settled (an answer not taken in, a task the media service lost, a link the
 * notification never wrote) is settled by the reconcile job (sweepClipSyncs).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import type { ModelRegistryEntry } from "../model-schema";
import { durationChoices } from "../long-video/plan";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import { compileFromVoiceoverLongVideo } from "../edit/compile";
import { drivingAudioSlot, LIP_SYNC, lipSyncChoices, longestSegmentFor } from "./models";
import { syncReading } from "./sync";
import { readWords } from "./analysis";
import {
  PREPARE_STALL_MS,
  preparationById,
  preparationForAsset,
  preparedFileOf,
  takeForEdit,
} from "./prepare.server";
import { pieceOf, voiceoverPiece } from "./slices.server";
import { clipLipSyncOf, clipSyncStep, MAX_SYNC_ATTEMPTS, type ClipLipSync } from "./clip";

export { clipLipSyncOf, type ClipLipSync } from "./clip";

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

type Input = { assetId: string; role: string; position: number };

/** How far back the reconcile job looks for single clips still being measured. */
const SWEEP_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** How far back it looks for clips made to a voiceover whose link was never written. */
const UNLINKED_WINDOW_MS = 24 * 60 * 60_000;

/**
 * A generation's inputs with a voiceover in the model's driving-audio input
 * swapped for its piece, where the voiceover is prepared and one clip can
 * hold it. Asked for estimates as well as generations, so the provider prices
 * exactly what it will be sent.
 */
export async function withVoiceoverPieces(
  model: ModelRegistryEntry,
  inputs: Input[],
  owner: { userId: string | null; projectId: string | null },
): Promise<Input[]> {
  const slot = drivingAudioSlot(model);
  if (!slot) return inputs;
  const index = inputs.findIndex((input) => input.role === slot.role);
  if (index < 0) return inputs;
  const input = inputs[index]!;
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,metadata")
    .eq("id", input.assetId)
    .maybeSingle();
  if (!asset) return inputs;
  // A piece already (a long video's clip): sent as it is.
  if (pieceOf(asset)) return inputs;
  const made = preparedFileOf(asset.metadata);
  const preparation = made
    ? await preparationById(made.preparation_id)
    : await preparationForAsset(asset.id);
  if (
    !preparation ||
    preparation.status !== "ready" ||
    !preparation.sample_rate ||
    !preparation.samples
  )
    return inputs;
  const seconds = Number(preparation.samples) / Number(preparation.sample_rate);
  // Longer than one clip holds: as given (the Create page offers a long video instead).
  const longest = longestSegmentFor(lipSyncChoices(durationChoices(model)));
  if (seconds > longest + 1e-6) return inputs;
  const piece = await voiceoverPiece({
    preparationId: preparation.id,
    startSeconds: 0,
    endSeconds: seconds,
    createdBy: owner.userId,
    projectId: owner.projectId,
    label: "Voiceover for one clip",
  });
  return inputs.map((item, at) => (at === index ? { ...item, assetId: piece.assetId } : item));
}

async function writeLipSync(assetId: string, link: ClipLipSync): Promise<void> {
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("metadata")
    .eq("id", assetId)
    .maybeSingle();
  await supabaseAdmin
    .from("assets")
    .update({ metadata: { ...asRecord(asset?.metadata), lip_sync: link } as never })
    .eq("id", assetId);
}

/** Asks the media service to measure a clip's sync (one more try), recording the task on its file. */
async function enqueueClipSync(
  output: { id: string; storage_bucket: string; storage_path: string; mime_type: string | null },
  link: ClipLipSync,
  owner: { userId: string | null; projectId: string | null },
): Promise<void> {
  const attempt = link.attempts + 1;
  const { data: piece } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,mime_type")
    .eq("id", link.piece_asset_id)
    .maybeSingle();
  const now = new Date().toISOString();
  if (!piece) {
    await writeLipSync(output.id, {
      ...link,
      status: "failed",
      attempts: attempt,
      reason: "Its piece of the voiceover is no longer stored, so its sync couldn't be measured.",
      updated_at: now,
    });
    return;
  }
  const result = await enqueueInternalMediaTask({
    createdBy: owner.userId,
    projectId: owner.projectId,
    taskType: "measure_sync",
    source: {
      assetId: output.id,
      assetType: "video",
      bucket: output.storage_bucket,
      path: output.storage_path,
      mimeType: output.mime_type,
    },
    extraSources: [
      {
        assetId: piece.id,
        assetType: "audio",
        bucket: piece.storage_bucket,
        path: piece.storage_path,
        mimeType: piece.mime_type,
        role: "audio",
      },
    ],
    params: { max_lag_seconds: 1 },
    dedupeKey: `clipsync:${output.id}:${attempt}`,
    output: { count: 0, ext: "json", mime: "application/json", kind: "audio" },
    context: { lip_sync_clip_asset_id: output.id },
  });
  if (result.ok) {
    await writeLipSync(output.id, {
      ...link,
      status: "measuring",
      attempts: attempt,
      task_id: result.taskId,
      updated_at: now,
    });
    // A quick answer can come before its task is recorded here, and is then
    // not taken in: it is taken in now (taking it in twice changes nothing).
    const { data: task } = await supabaseAdmin
      .from("media_tasks")
      .select("status")
      .eq("id", result.taskId)
      .maybeSingle();
    if (task?.status === "completed" || task?.status === "failed")
      await finishClipSync(result.taskId);
    return;
  }
  // A busy or unreachable media service is asked again by the reconcile job;
  // one that can't measure it at all leaves it taken as in step.
  await writeLipSync(
    output.id,
    result.retryable && !/unknown task/i.test(result.message)
      ? { ...link, status: "measuring", attempts: attempt, task_id: null, updated_at: now }
      : {
          ...link,
          status: "failed",
          attempts: attempt,
          task_id: null,
          reason: `Its sync couldn't be measured (${result.message}), so it is taken as in step.`,
          updated_at: now,
        },
  );
}

/**
 * A single clip made from a voiceover piece is in the library: its link to the
 * voiceover is kept on its file and its sync measured. A long video's clips
 * are measured by their run; any other generation is left alone. Repeating it
 * changes nothing. True when it linked the clip.
 */
export async function measureClipSync(generationId: string): Promise<boolean> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("id,status,ingest_status,user_id,project_id")
    .eq("id", generationId)
    .maybeSingle();
  if (!generation || generation.status !== "completed" || generation.ingest_status !== "completed")
    return false;
  const { data: inLongVideo } = await supabaseAdmin
    .from("long_video_clips")
    .select("id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (inLongVideo) return false;
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("asset_id")
    .eq("generation_id", generationId);
  const ids = (inputs ?? []).flatMap((input) => (input.asset_id ? [input.asset_id] : []));
  if (!ids.length) return false;
  const { data: rows } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,metadata")
    .in("id", ids);
  const pieceRow = (rows ?? []).find((row) => pieceOf(row));
  const piece = pieceRow ? pieceOf(pieceRow) : null;
  if (!pieceRow || !piece) return false;
  const { data: output } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,mime_type,metadata")
    .eq("generation_id", generationId)
    .eq("asset_type", "video")
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!output || clipLipSyncOf(output.metadata)) return false;
  const link: ClipLipSync = {
    preparation_id: piece.preparationId,
    piece_asset_id: pieceRow.id,
    start_seconds: Number((piece.fromSample / piece.sampleRate).toFixed(6)),
    end_seconds: Number((piece.toSample / piece.sampleRate).toFixed(6)),
    status: "measuring",
    attempts: 0,
    task_id: null,
    updated_at: new Date().toISOString(),
  };
  // The link is kept first: a clip whose measurement can't be asked for now
  // still opens with its voiceover, and the reconcile job asks for it.
  await writeLipSync(output.id, link);
  await enqueueClipSync(output, link, {
    userId: generation.user_id,
    projectId: generation.project_id,
  });
  return true;
}

/** The media service's answer to a single clip's measure_sync, taken in (or tried again). */
export async function finishClipSync(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("id,status,error_message,input_payload,output_payload,created_by,project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return;
  const assetId = asRecord(task.input_payload)["lip_sync_clip_asset_id"];
  if (typeof assetId !== "string") return;
  const { data: output } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,mime_type,metadata")
    .eq("id", assetId)
    .maybeSingle();
  const link = output ? clipLipSyncOf(output.metadata) : null;
  if (!output || !link || link.status !== "measuring" || link.task_id !== task.id) return;
  const now = new Date().toISOString();
  if (task.status === "completed") {
    const reading = syncReading(asRecord(task.output_payload)["metadata"]);
    await writeLipSync(output.id, {
      ...link,
      status: reading.status,
      offset_seconds: reading.offsetSeconds,
      reason: reading.reason,
      result: reading.result,
      measured_at: now,
      updated_at: now,
    });
    return;
  }
  if (task.status !== "failed") return;
  if (link.attempts >= MAX_SYNC_ATTEMPTS) {
    await writeLipSync(output.id, {
      ...link,
      status: "failed",
      task_id: null,
      reason: `Its sync couldn't be measured (${task.error_message ?? "the media service couldn't"}), so it is taken as in step.`,
      updated_at: now,
    });
    return;
  }
  await enqueueClipSync(output, link, { userId: task.created_by, projectId: task.project_id });
}

/**
 * Single clips made to a voiceover whose sync no event settled, settled by the
 * reconcile job (see clipSyncStep): an answer that wasn't taken in, a task the
 * media service lost (closeLostMediaTasks closes it first), a measurement that
 * couldn't be asked for, and a clip whose link was never written because the
 * notification that writes it failed. Each step is one an event would have
 * taken, so taking it twice changes nothing. Returns how many clips it moved on.
 */
export async function sweepClipSyncs(
  limit = 25,
  jobDeadline: number | null = null,
): Promise<number> {
  const deadline = jobDeadline ?? Number.POSITIVE_INFINITY;
  let moved = 0;

  const { data: measuring, error } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,mime_type,metadata,uploaded_by,project_id")
    .eq("asset_type", "video")
    .is("deleted_at", null)
    .eq("metadata->lip_sync->>status", "measuring")
    .gte("created_at", new Date(Date.now() - SWEEP_WINDOW_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const failed = (assetId: string, problem: unknown) =>
    console.error("clip sync sweep step failed", {
      assetId,
      message: problem instanceof Error ? problem.message : String(problem),
    });
  for (const output of measuring ?? []) {
    if (Date.now() > deadline) return moved;
    try {
      if (await settleClipSync(output)) moved += 1;
    } catch (problem) {
      failed(output.id, problem);
    }
  }

  // Clips made from a piece of a voiceover in the last day that were never linked.
  const { data: inputs, error: inputsError } = await supabaseAdmin
    .from("generation_inputs")
    .select("generation_id,asset_id")
    .eq("input_type", "audio")
    .not("asset_id", "is", null)
    .gte("created_at", new Date(Date.now() - UNLINKED_WINDOW_MS).toISOString())
    .limit(200);
  if (inputsError) throw new Error(inputsError.message);
  const assetIds = [
    ...new Set((inputs ?? []).flatMap((row) => (row.asset_id ? [row.asset_id] : []))),
  ];
  if (!assetIds.length) return moved;
  const { data: pieces, error: piecesError } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,metadata")
    .in("id", assetIds);
  if (piecesError) throw new Error(piecesError.message);
  const pieceIds = new Set((pieces ?? []).filter((row) => pieceOf(row)).map((row) => row.id));
  const made = [
    ...new Set(
      (inputs ?? []).flatMap((row) =>
        row.asset_id && pieceIds.has(row.asset_id) ? [row.generation_id] : [],
      ),
    ),
  ];
  if (!made.length) return moved;
  const [runClips, outputs] = await Promise.all([
    supabaseAdmin.from("long_video_clips").select("generation_id").in("generation_id", made),
    supabaseAdmin
      .from("assets")
      .select("generation_id,metadata")
      .in("generation_id", made)
      .eq("asset_type", "video")
      .is("deleted_at", null),
  ]);
  if (runClips.error) throw new Error(runClips.error.message);
  if (outputs.error) throw new Error(outputs.error.message);
  const inRuns = new Set((runClips.data ?? []).map((row) => row.generation_id));
  const linked = new Set(
    (outputs.data ?? [])
      .filter((row) => clipLipSyncOf(row.metadata))
      .map((row) => row.generation_id),
  );
  const unlinked = [
    ...new Set(
      (outputs.data ?? []).flatMap((row) => (row.generation_id ? [row.generation_id] : [])),
    ),
  ].filter((id) => !inRuns.has(id) && !linked.has(id));
  for (const generationId of unlinked.slice(0, limit)) {
    if (Date.now() > deadline) break;
    try {
      if (await measureClipSync(generationId)) moved += 1;
    } catch (problem) {
      failed(generationId, problem);
    }
  }
  return moved;
}

/**
 * One clip still being measured, moved on as clipSyncStep says, given its task
 * as it stands. True when a step was taken.
 */
async function settleClipSync(output: {
  id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  metadata: unknown;
  uploaded_by: string | null;
  project_id: string | null;
}): Promise<boolean> {
  const link = clipLipSyncOf(output.metadata);
  if (!link) return false;
  let task: { status: string } | null = null;
  if (link.task_id) {
    const { data, error } = await supabaseAdmin
      .from("media_tasks")
      .select("status")
      .eq("id", link.task_id)
      .maybeSingle();
    // A task that couldn't be read isn't one that is gone: left for the next run.
    if (error) return false;
    task = data;
  }
  const step = clipSyncStep(link, task, Date.now());
  if (step === "record") await finishClipSync(link.task_id!);
  else if (step === "ask")
    await enqueueClipSync(output, link, {
      userId: output.uploaded_by,
      projectId: output.project_id,
    });
  else if (step === "give_up")
    await writeLipSync(output.id, {
      ...link,
      status: "failed",
      task_id: null,
      reason: "The media service never answered about its sync, so it is taken as in step.",
      updated_at: new Date().toISOString(),
    });
  return step !== null;
}

/** The offset a single clip is placed by: a measured one, else none (a stalled measurement counts as none). */
function placedOffset(link: ClipLipSync): number | null {
  if (link.status !== "measured") return null;
  const offset = Number(link.offset_seconds);
  return link.offset_seconds !== null &&
    link.offset_seconds !== undefined &&
    Number.isFinite(offset) &&
    Math.abs(offset) <= LIP_SYNC.maxOffsetSeconds
    ? offset
    : null;
}

/**
 * A single clip made to a voiceover, opened in the Editor as a new edit: the
 * voiceover (one of the edit's takes) from the start, and the clip laid so its
 * lips meet it, its own sound muted unless asked for, its words as captions
 * where they are known. A measurement still running is not waited for.
 */
export async function openClipWithVoiceover(input: {
  userId: string;
  assetId: string;
  keepSound: boolean;
  captions: boolean;
}): Promise<{ sequenceId: string; measured: boolean }> {
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select(
      "id,title,asset_type,duration_seconds,width,height,metadata,project_id,generation_id,deleted_at",
    )
    .eq("id", input.assetId)
    .maybeSingle();
  if (!asset || asset.deleted_at || asset.asset_type !== "video")
    throw new AppError("INVALID_PARAMETERS", "That clip is no longer in the library.");
  const link = clipLipSyncOf(asset.metadata);
  if (!link) throw new AppError("INVALID_PARAMETERS", "That clip wasn't made to a voiceover.");
  const preparation = await preparationById(link.preparation_id);
  if (!preparation || preparation.status !== "ready" || !preparation.prepared_asset_id)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The voiceover this clip was made to is no longer prepared, so it can't be lined up with it.",
    );
  const { data: generation } = asset.generation_id
    ? await supabaseAdmin
        .from("generations")
        .select("parameters,campaign_id")
        .eq("id", asset.generation_id)
        .maybeSingle()
    : { data: null };
  const { data: source } = await supabaseAdmin
    .from("assets")
    .select("title")
    .eq("id", preparation.source_asset_id)
    .maybeSingle();
  const voiceTitle =
    (source?.title ?? "Voiceover").replace(/^Voiceover · /, "").trim() || "Voiceover";
  const stalled =
    link.status === "measuring" && Date.now() - Date.parse(link.updated_at) > PREPARE_STALL_MS;
  const title = (asset.title ?? "Clip").replace(/ · clip \d+$/, "").slice(0, 160) || "Clip";
  const result = compileFromVoiceoverLongVideo(
    { title: `${title} · lip sync`, settings: asRecord(generation?.parameters) },
    [
      {
        position: 0,
        assetId: asset.id,
        audioStart: link.start_seconds,
        audioEnd: link.end_seconds,
        offsetSeconds: stalled ? null : placedOffset(link),
        lengthSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
      },
    ],
    [
      {
        id: asset.id,
        durationSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
        width: asset.width,
        height: asset.height,
      },
    ],
    {
      assetId: preparation.prepared_asset_id,
      durationSeconds: Number(preparation.samples) / Number(preparation.sample_rate),
      fps: LIP_SYNC.gridFps,
      title: `Voiceover · ${voiceTitle}`,
      words: readWords(preparation.words),
    },
    { keepSound: input.keepSound, captions: input.captions },
  );
  const { data: sequence, error } = await supabaseAdmin
    .from("sequences")
    .insert({
      title: result.title,
      timeline: result.timeline as never,
      project_id: asset.project_id,
      campaign_id: generation?.campaign_id ?? null,
      source: { kind: "lip_sync_clip", asset_id: asset.id } as never,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !sequence)
    throw new AppError("UNKNOWN", error?.message ?? "The edit could not be created");
  try {
    await takeForEdit({
      userId: input.userId,
      preparationId: preparation.id,
      sequenceId: sequence.id,
    });
  } catch (problem) {
    await supabaseAdmin.from("sequences").delete().eq("id", sequence.id);
    throw problem;
  }
  return { sequenceId: sequence.id, measured: link.status === "measured" };
}
