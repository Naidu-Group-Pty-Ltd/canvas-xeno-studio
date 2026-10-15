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
 * (the same placement a long video's clips get).
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
import { clipLipSyncOf, type ClipLipSync } from "./clip";

export { clipLipSyncOf, type ClipLipSync } from "./clip";

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

type Input = { assetId: string; role: string; position: number };

/** Tries at measuring a clip's sync before it is taken as in step. */
const MAX_SYNC_ATTEMPTS = 3;

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
  await writeLipSync(
    output.id,
    result.ok
      ? { ...link, status: "measuring", attempts: attempt, task_id: result.taskId, updated_at: now }
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
 * changes nothing.
 */
export async function measureClipSync(generationId: string): Promise<void> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("id,status,ingest_status,user_id,project_id")
    .eq("id", generationId)
    .maybeSingle();
  if (!generation || generation.status !== "completed" || generation.ingest_status !== "completed")
    return;
  const { data: inLongVideo } = await supabaseAdmin
    .from("long_video_clips")
    .select("id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (inLongVideo) return;
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("asset_id")
    .eq("generation_id", generationId);
  const ids = (inputs ?? []).flatMap((input) => (input.asset_id ? [input.asset_id] : []));
  if (!ids.length) return;
  const { data: rows } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,metadata")
    .in("id", ids);
  const pieceRow = (rows ?? []).find((row) => pieceOf(row));
  const piece = pieceRow ? pieceOf(pieceRow) : null;
  if (!pieceRow || !piece) return;
  const { data: output } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path,mime_type,metadata")
    .eq("generation_id", generationId)
    .eq("asset_type", "video")
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!output || clipLipSyncOf(output.metadata)) return;
  await enqueueClipSync(
    output,
    {
      preparation_id: piece.preparationId,
      piece_asset_id: pieceRow.id,
      start_seconds: Number((piece.fromSample / piece.sampleRate).toFixed(6)),
      end_seconds: Number((piece.toSample / piece.sampleRate).toFixed(6)),
      status: "measuring",
      attempts: 0,
      updated_at: new Date().toISOString(),
    },
    { userId: generation.user_id, projectId: generation.project_id },
  );
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
