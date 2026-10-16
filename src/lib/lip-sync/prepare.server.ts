/**
 * Voiceovers made ready to drive lip sync.
 *
 * A voiceover (any sound file in the library, or a take made in the Voice tab)
 * is prepared once by the media service (prepare_audio, see
 * media-worker/src/voice.js): the canonical WAV every time is then measured
 * in, a 16 kHz copy for transcription, and where its speech and pauses are.
 * The canonical file joins the library, as the Editor plays it from there;
 * each clip's piece is cut from it (./slices.server). Asked again, the same
 * preparation is used.
 *
 * A recording someone made is only used with the confirmation the Editor's
 * import asks for (that the brand may use the voice in it), recorded with who
 * gave it and when; a take the studio made needs none.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import {
  IMPORTED_VOICEOVER_STATEMENT,
  MAX_SCRIPT_CHARS,
  requireActiveMember,
  voiceScope,
} from "../voice/service.server";
import { readAnalysis, readWords } from "./analysis";
import type { TimedWord } from "./segments";
import type { LipSyncVoiceover } from "./view";

/** A preparation not heard back from in this long is given up on, and can be tried again. */
export const PREPARE_STALL_MS = 15 * 60_000;
/** A transcription still pending after this long was cut off, and can be tried again. */
const TRANSCRIBE_STALL_MS = 5 * 60_000;

export const LIP_SYNC_CONSENT_STATEMENT = IMPORTED_VOICEOVER_STATEMENT;

export type { LipSyncVoiceover, PreparationStatus, TranscriptStatus } from "./view";

export interface Consent {
  statement: string;
  confirmedBy: string;
  confirmedAt: string;
}

const PREPARATION_COLUMNS =
  "id,source_asset_id,status,media_task_id,attempts,prepared_asset_id,speech_storage_bucket,speech_storage_path,sample_rate,samples,duration_seconds,analysis,transcript_status,transcript,words,consent,project_id,created_by,error_code,error_message,created_at,updated_at,completed_at";

export interface PreparationRow {
  id: string;
  source_asset_id: string;
  status: string;
  media_task_id: string | null;
  attempts: number;
  prepared_asset_id: string | null;
  speech_storage_bucket: string | null;
  speech_storage_path: string | null;
  sample_rate: number | null;
  samples: number | null;
  duration_seconds: number | string | null;
  analysis: Json | null;
  transcript_status: string;
  transcript: string | null;
  words: Json | null;
  consent: Json | null;
  project_id: string | null;
  created_by: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
}

interface SourceAsset {
  id: string;
  asset_type: "image" | "video" | "audio";
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  title: string | null;
  metadata: Json | null;
  project_id: string | null;
  deleted_at: string | null;
}

type Json$ = Record<string, unknown>;
const asRecord = (value: unknown): Json$ =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json$) : {};

/** A take made in the Voice tab: the studio's own voice, which needs no one's confirmation. */
function studioMade(metadata: unknown): boolean {
  const record = asRecord(metadata);
  return typeof record["voiceover_id"] === "string" && record["ai_generated_voice"] === true;
}

/** A confirmation the file already carries (importing a recording into an edit stamps one). */
function stampedConsent(metadata: unknown): Consent | null {
  const stamp = asRecord(asRecord(metadata)["imported_voiceover"]);
  return typeof stamp["statement"] === "string" &&
    typeof stamp["confirmedBy"] === "string" &&
    typeof stamp["confirmedAt"] === "string"
    ? {
        statement: stamp["statement"],
        confirmedBy: stamp["confirmedBy"],
        confirmedAt: stamp["confirmedAt"],
      }
    : null;
}

function consentOf(value: unknown): Consent | null {
  const record = asRecord(value);
  return typeof record["statement"] === "string" &&
    typeof record["confirmedBy"] === "string" &&
    typeof record["confirmedAt"] === "string"
    ? (record as unknown as Consent)
    : null;
}

/** What a prepared file says about itself (its own preparation). */
export function preparedFileOf(metadata: unknown): {
  preparation_id: string;
  source_asset_id: string;
  sample_rate: number;
  samples: number;
} | null {
  const record = asRecord(asRecord(metadata)["lip_sync_voiceover"]);
  return typeof record["preparation_id"] === "string" &&
    typeof record["source_asset_id"] === "string" &&
    typeof record["sample_rate"] === "number" &&
    typeof record["samples"] === "number"
    ? (record as never)
    : null;
}

const lookupFailed = () =>
  new AppError("UNKNOWN", "The voiceover couldn't be looked up. Try again in a moment.");

export function viewOf(row: PreparationRow, sourceMetadata: unknown = null): LipSyncVoiceover {
  const status =
    (["preparing", "ready", "failed"] as const).find((value) => value === row.status) ?? "failed";
  const transcriptStatus =
    (["none", "pending", "ready", "unavailable"] as const).find(
      (value) => value === row.transcript_status,
    ) ?? "none";
  return {
    id: row.id,
    sourceAssetId: row.source_asset_id,
    status,
    preparedAssetId: row.prepared_asset_id,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    analysis: readAnalysis(row.analysis),
    transcriptStatus,
    transcript: row.transcript,
    words: readWords(row.words),
    usable: consentOf(row.consent) !== null || studioMade(sourceMetadata),
    errorMessage: row.error_message,
  };
}

export async function preparationById(id: string): Promise<PreparationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("audio_preparations")
    .select(PREPARATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw lookupFailed();
  return (data as PreparationRow | null) ?? null;
}

export async function preparationForAsset(assetId: string): Promise<PreparationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("audio_preparations")
    .select(PREPARATION_COLUMNS)
    .eq("source_asset_id", assetId)
    .maybeSingle();
  if (error) throw lookupFailed();
  return (data as PreparationRow | null) ?? null;
}

async function sourceAsset(assetId: string): Promise<SourceAsset | null> {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select(
      "id,asset_type,storage_bucket,storage_path,mime_type,title,metadata,project_id,deleted_at",
    )
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw lookupFailed();
  return (data as SourceAsset | null) ?? null;
}

/** Why a media service answer couldn't prepare the voiceover, in words a person can act on. */
function preparationFailure(code: string | null, message: string | null): string {
  if (code === "INVALID_PARAMETERS" && message && /Unknown task type/i.test(message))
    return "The media service needs updating before it can prepare voiceovers for lip sync. An admin needs to deploy the latest media worker.";
  if (code === "MEDIA_WORKER_NOT_CONFIGURED")
    return message ?? "The media service isn't configured.";
  return message?.trim() || "The voiceover couldn't be prepared. Try again.";
}

/**
 * Prepares a voiceover for lip sync, or returns its preparation as it stands
 * (preparing, ready, or failed with why). A failed or stalled preparation is
 * tried again. `confirmed` is the person's confirmation that the voice may be
 * used, needed for a recording the studio didn't make.
 */
export async function prepareVoiceover(input: {
  userId: string;
  assetId: string;
  projectId: string | null;
  confirmed: boolean;
}): Promise<LipSyncVoiceover> {
  await requireActiveMember(input.userId);
  const asset = await sourceAsset(input.assetId);
  if (!asset || asset.deleted_at)
    throw new AppError("INVALID_PARAMETERS", "That voiceover is no longer in the library.");
  if (asset.asset_type !== "audio" && asset.asset_type !== "video")
    throw new AppError(
      "INVALID_PARAMETERS",
      "A voiceover has to be a sound file, or a video with sound.",
    );

  // A file a preparation made is already prepared: its own preparation is used.
  const made = preparedFileOf(asset.metadata);
  if (made) {
    const own = await preparationById(made.preparation_id);
    if (own) return refreshed(own);
  }

  let row = await preparationForAsset(asset.id);
  // A confirmation already given (on the file, or for an earlier try) stands.
  const consent =
    stampedConsent(asset.metadata) ??
    (row ? consentOf(row.consent) : null) ??
    (input.confirmed
      ? {
          statement: LIP_SYNC_CONSENT_STATEMENT,
          confirmedBy: input.userId,
          confirmedAt: new Date().toISOString(),
        }
      : null);
  if (!studioMade(asset.metadata) && !consent)
    throw new AppError(
      "INVALID_PARAMETERS",
      `Confirm the voice in this recording may be used: “${LIP_SYNC_CONSENT_STATEMENT}”`,
    );

  if (row && !consentOf(row.consent) && consent) {
    await supabaseAdmin
      .from("audio_preparations")
      .update({ consent: consent as never })
      .eq("id", row.id)
      .is("consent", null);
    row = { ...row, consent: consent as never };
  }
  if (row) {
    const current = await refreshed(row, asset);
    if (current.status !== "failed") return current;
    const latest = await preparationById(row.id);
    return latest ? startPreparing(latest, asset) : current;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("audio_preparations")
    .insert({
      source_asset_id: asset.id,
      status: "preparing",
      attempts: 0,
      consent: consent as never,
      project_id: input.projectId ?? asset.project_id,
      created_by: input.userId,
    } as never)
    .select(PREPARATION_COLUMNS)
    .maybeSingle();
  if (error?.code === "23505") {
    // Someone asked for it at the same moment: theirs is used.
    const raced = await preparationForAsset(asset.id);
    if (raced) return viewOf(raced, asset.metadata);
  }
  if (error || !inserted)
    throw new AppError("UNKNOWN", "The voiceover couldn't be prepared. Try again.");
  return startPreparing(inserted as PreparationRow, asset);
}

/** Asks the media service to prepare it (one more try), recording the task. */
async function startPreparing(row: PreparationRow, asset: SourceAsset): Promise<LipSyncVoiceover> {
  const attempt = row.attempts + 1;
  // Only one request starts a try: the one that moves the count on.
  const { data: claimed } = await supabaseAdmin
    .from("audio_preparations")
    .update({
      status: "preparing",
      attempts: attempt,
      error_code: null,
      error_message: null,
      media_task_id: null,
    } as never)
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .select("id");
  if (!claimed?.length) {
    const latest = await preparationById(row.id);
    return latest ? viewOf(latest, asset.metadata) : viewOf(row, asset.metadata);
  }
  const result = await enqueueInternalMediaTask({
    createdBy: row.created_by,
    projectId: row.project_id,
    taskType: "prepare_audio",
    source: {
      assetId: asset.id,
      assetType: asset.asset_type,
      bucket: asset.storage_bucket,
      path: asset.storage_path,
      mimeType: asset.mime_type,
    },
    params: {},
    dedupeKey: `prepare_audio:${row.id}:${attempt}`,
    output: { count: 2, ext: "wav", mime: "audio/wav", kind: "audio" },
    // The files are the preparation's: they join the library once it is recorded.
    context: { audio_preparation_id: row.id, register_outputs: false },
    notConfiguredMessage:
      "The media service isn't configured, so the voiceover can't be prepared for lip sync. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
  });
  const update = result.ok
    ? { media_task_id: result.taskId }
    : {
        status: "failed",
        error_code: result.code,
        error_message: preparationFailure(result.code, result.message),
      };
  await supabaseAdmin
    .from("audio_preparations")
    .update(update as never)
    .eq("id", row.id)
    .eq("attempts", attempt);
  const latest = await preparationById(row.id);
  return viewOf(latest ?? row, asset.metadata);
}

/**
 * A preparation as it stands, settled first where the media service has
 * answered but the answer wasn't taken in, or where it has said nothing for
 * too long.
 */
async function refreshed(
  row: PreparationRow,
  asset?: SourceAsset | null,
): Promise<LipSyncVoiceover> {
  const metadata = asset?.metadata ?? (await sourceAsset(row.source_asset_id))?.metadata ?? null;
  if (row.status !== "preparing") return viewOf(row, metadata);
  if (row.media_task_id) {
    const { data: task } = await supabaseAdmin
      .from("media_tasks")
      .select("status")
      .eq("id", row.media_task_id)
      .maybeSingle();
    if (task && (task.status === "completed" || task.status === "failed")) {
      await finishAudioPreparation(row.media_task_id);
      const latest = await preparationById(row.id);
      return viewOf(latest ?? row, metadata);
    }
  }
  if (Date.now() - Date.parse(row.updated_at) > PREPARE_STALL_MS) {
    await supabaseAdmin
      .from("audio_preparations")
      .update({
        status: "failed",
        error_code: "STALLED",
        error_message: "The media service didn't finish preparing the voiceover. Try again.",
      } as never)
      .eq("id", row.id)
      .eq("status", "preparing")
      .eq("attempts", row.attempts);
    const latest = await preparationById(row.id);
    return viewOf(latest ?? row, metadata);
  }
  return viewOf(row, metadata);
}

/**
 * A preparation a run can be made to: ready, and either made by the studio or
 * confirmed for use. Throws, in words a person can act on, when it isn't.
 */
export async function usableVoiceover(
  preparationId: string,
): Promise<{ row: PreparationRow; view: LipSyncVoiceover; title: string }> {
  const row = await preparationById(preparationId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That voiceover hasn't been prepared.");
  const source = await sourceAsset(row.source_asset_id);
  const view = await refreshed(row, source);
  if (view.status === "preparing")
    throw new AppError(
      "INVALID_PARAMETERS",
      "The voiceover is still being prepared. Try again in a moment.",
    );
  if (view.status !== "ready" || !view.preparedAssetId || !view.analysis || !view.durationSeconds)
    throw new AppError(
      "INVALID_PARAMETERS",
      view.errorMessage ?? "The voiceover couldn't be prepared. Prepare it again.",
    );
  if (!view.usable)
    throw new AppError(
      "INVALID_PARAMETERS",
      `Confirm the voice in this recording may be used: “${LIP_SYNC_CONSENT_STATEMENT}”`,
    );
  const latest = (await preparationById(preparationId)) ?? row;
  const title = (source?.title ?? "Voiceover").replace(/^Voiceover · /, "").trim() || "Voiceover";
  return { row: latest, view, title };
}

/** A voiceover's preparation, by its id or its file's, settled first where it can be. */
export async function readVoiceover(input: {
  userId: string;
  preparationId?: string | null;
  assetId?: string | null;
}): Promise<LipSyncVoiceover | null> {
  await requireActiveMember(input.userId);
  const row = input.preparationId
    ? await preparationById(input.preparationId)
    : input.assetId
      ? await preparationForAsset(input.assetId)
      : null;
  return row ? refreshed(row) : null;
}

/**
 * The media service's answer to a prepare_audio task, taken in: the canonical
 * file joins the library and the preparation is ready, or it failed and says
 * why. Repeating it changes nothing.
 */
export async function finishAudioPreparation(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from("media_tasks")
    .select("id,status,error_code,error_message,input_payload,output_payload")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return;
  const preparationId = asRecord(task.input_payload)["audio_preparation_id"];
  if (typeof preparationId !== "string") return;
  const row = await preparationById(preparationId);
  if (!row || row.status !== "preparing" || row.media_task_id !== task.id) return;
  const settle = (values: Record<string, unknown>) =>
    supabaseAdmin
      .from("audio_preparations")
      .update(values as never)
      .eq("id", row.id)
      .eq("status", "preparing")
      .eq("media_task_id", task.id);

  if (task.status === "failed") {
    await settle({
      status: "failed",
      error_code: task.error_code ?? "PREPARE_FAILED",
      error_message: preparationFailure(task.error_code, task.error_message),
    });
    return;
  }
  if (task.status !== "completed") return;

  const output = asRecord(task.output_payload);
  const files = (Array.isArray(output["files"]) ? output["files"] : []).map(asRecord);
  const analysis = readAnalysis(output["metadata"]);
  const canonical = files[0];
  const speech = files[1];
  if (
    !analysis ||
    typeof canonical?.["bucket"] !== "string" ||
    typeof canonical["path"] !== "string" ||
    typeof speech?.["bucket"] !== "string" ||
    typeof speech["path"] !== "string"
  ) {
    await settle({
      status: "failed",
      error_code: "PREPARE_FAILED",
      error_message: "The media service's answer wasn't a prepared voiceover. Try again.",
    });
    return;
  }

  const source = await sourceAsset(row.source_asset_id);
  const sourceTitle =
    (source?.title ?? "Voiceover").replace(/^Voiceover · /, "").trim() || "Voiceover";
  const bucket = canonical["bucket"];
  const path = canonical["path"];
  const seconds = analysis.samples / analysis.sample_rate;
  const findFile = () =>
    supabaseAdmin
      .from("assets")
      .select("id")
      .eq("storage_bucket", bucket)
      .eq("storage_path", path)
      .maybeSingle();
  let assetId = (await findFile()).data?.id ?? null;
  if (!assetId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("assets")
      .insert({
        uploaded_by: row.created_by,
        project_id: row.project_id,
        asset_type: "audio",
        source_type: "generated",
        storage_bucket: bucket,
        storage_path: path,
        mime_type: "audio/wav",
        file_size: 44 + analysis.samples * analysis.channels * 2,
        duration_seconds: Number(seconds.toFixed(2)),
        title: `Voiceover · ${sourceTitle} (for lip sync)`.slice(0, 200),
        metadata: {
          derived: true,
          media_task_id: task.id,
          derived_from_asset_id: row.source_asset_id,
          lip_sync_voiceover: {
            preparation_id: row.id,
            source_asset_id: row.source_asset_id,
            sample_rate: analysis.sample_rate,
            samples: analysis.samples,
            duration_seconds: Number(seconds.toFixed(6)),
          },
        } as never,
      } as never)
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") assetId = (await findFile()).data?.id ?? null;
    else if (error || !inserted)
      throw new AppError("UNKNOWN", "The prepared voiceover couldn't be added to the library");
    else assetId = inserted.id;
  }
  if (!assetId)
    throw new AppError("UNKNOWN", "The prepared voiceover couldn't be added to the library");

  // A file uploaded on the Create page has no length on record: now it has.
  const sourceSeconds = asRecord(asRecord(output["metadata"])["source"])["duration_seconds"];
  if (typeof sourceSeconds === "number" && sourceSeconds > 0)
    await supabaseAdmin
      .from("assets")
      .update({ duration_seconds: Number(sourceSeconds.toFixed(2)) } as never)
      .eq("id", row.source_asset_id)
      .is("duration_seconds", null);

  await settle({
    status: "ready",
    prepared_asset_id: assetId,
    speech_storage_bucket: speech["bucket"],
    speech_storage_path: speech["path"],
    sample_rate: analysis.sample_rate,
    samples: analysis.samples,
    duration_seconds: Number(seconds.toFixed(6)),
    analysis: analysis as never,
    error_code: null,
    error_message: null,
    completed_at: new Date().toISOString(),
  });
}

/**
 * What is said in a prepared voiceover, with each word's timing, from its
 * 16 kHz copy (best effort: a voiceover with no transcription is planned from
 * its pauses alone). Asked again once it has an answer, nothing is done.
 */
export async function transcribeVoiceover(input: {
  userId: string;
  preparationId: string;
}): Promise<LipSyncVoiceover> {
  await requireActiveMember(input.userId);
  const row = await preparationById(input.preparationId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That voiceover hasn't been prepared.");
  if (row.status !== "ready" || !row.speech_storage_bucket || !row.speech_storage_path)
    return refreshed(row);
  if (row.transcript_status === "ready" || row.transcript_status === "unavailable")
    return refreshed(row);
  if (
    row.transcript_status === "pending" &&
    Date.now() - Date.parse(row.updated_at) < TRANSCRIBE_STALL_MS
  )
    return refreshed(row);

  const { openAIVoiceConfigured, openAIWordTimings } = await import("../voice/providers.server");
  const mark = (values: Record<string, unknown>, from: string[]) =>
    supabaseAdmin
      .from("audio_preparations")
      .update(values as never)
      .eq("id", row.id)
      .in("transcript_status", from)
      .select("id");
  if (!openAIVoiceConfigured()) {
    await mark({ transcript_status: "unavailable" }, ["none", "pending"]);
    return refreshed((await preparationById(row.id)) ?? row);
  }
  const { data: claimed } = await mark({ transcript_status: "pending" }, [row.transcript_status]);
  if (!claimed?.length) return refreshed((await preparationById(row.id)) ?? row);

  let words: TimedWord[] = [];
  try {
    const { data: file } = await supabaseAdmin.storage
      .from(row.speech_storage_bucket)
      .download(row.speech_storage_path);
    const result = file
      ? await openAIWordTimings(new Uint8Array(await file.arrayBuffer()), {
          mime: "audio/wav",
          name: "voiceover.wav",
        })
      : null;
    words = (result?.words ?? []).filter((word) => word.end >= word.start).slice(0, 8000);
  } catch {
    words = [];
  }
  const transcript = words
    .map((word) => word.text)
    .join(" ")
    .slice(0, 20000);
  await mark(
    words.length
      ? { transcript_status: "ready", transcript, words: words as never }
      : { transcript_status: "unavailable" },
    ["pending"],
  );
  return refreshed((await preparationById(row.id)) ?? row);
}

/**
 * The prepared voiceover as one of an edit's takes, so the edit renders with
 * it like a take made in the Voice tab (the render only plays voiceovers that
 * are takes). One take per voiceover per edit: asked again, the same one. A
 * recording someone made carries their confirmation on its file, as the
 * Editor's own import stamps it.
 */
export async function takeForEdit(input: {
  userId: string;
  preparationId: string;
  sequenceId: string;
}): Promise<{ voiceoverId: string; assetId: string; durationSeconds: number; words: TimedWord[] }> {
  const row = await preparationById(input.preparationId);
  if (!row || row.status !== "ready" || !row.prepared_asset_id || row.duration_seconds === null)
    throw new AppError("INVALID_PARAMETERS", "The voiceover isn't prepared yet.");
  const source = await sourceAsset(row.source_asset_id);
  const consent = consentOf(row.consent);
  const madeHere = studioMade(source?.metadata ?? null);
  if (!consent && !madeHere)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The voice in this recording hasn't been confirmed for use.",
    );
  const words = readWords(row.words);
  const durationSeconds = Number(row.duration_seconds);
  const dedupeKey = `lipsync:${row.id}:${input.sequenceId}`;
  const existing = async () => {
    const { data, error } = await supabaseAdmin
      .from("voiceovers")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (error) throw lookupFailed();
    return data?.id ?? null;
  };
  const found = await existing();
  if (found) return { voiceoverId: found, assetId: row.prepared_asset_id, durationSeconds, words };

  // A take from the Voice tab keeps its voice and maker on the new take.
  const original = madeHere
    ? (
        await supabaseAdmin
          .from("voiceovers")
          .select("voice_id,provider,model,provider_voice_id")
          .eq("id", String(asRecord(source?.metadata)["voiceover_id"]))
          .maybeSingle()
      ).data
    : null;
  const scope = await voiceScope({ sequenceId: input.sequenceId });
  const title = (source?.title ?? "Voiceover").replace(/^Voiceover · /, "").trim() || "Voiceover";
  const voiceoverId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("voiceovers").insert({
    id: voiceoverId,
    voice_id: original?.voice_id ?? null,
    script: (row.transcript?.trim() || title).slice(0, MAX_SCRIPT_CHARS) || "Voiceover",
    spoken_text: row.transcript?.trim() || null,
    status: "completed",
    asset_id: row.prepared_asset_id,
    duration_seconds: Number(durationSeconds.toFixed(3)),
    alignment: words.length ? ({ words } as never) : null,
    provider: original?.provider ?? "upload",
    model: original?.model ?? null,
    provider_voice_id: original?.provider_voice_id ?? null,
    sequence_id: input.sequenceId,
    project_id: scope.projectId,
    campaign_id: scope.campaignId,
    dedupe_key: dedupeKey,
    created_by: input.userId,
    completed_at: new Date().toISOString(),
  } as never);
  if (error) {
    const raced = error.code === "23505" ? await existing() : null;
    if (raced)
      return { voiceoverId: raced, assetId: row.prepared_asset_id, durationSeconds, words };
    throw new AppError("UNKNOWN", "The voiceover couldn't be added to the edit. Try again.");
  }
  if (consent && !madeHere) {
    const { data: file } = await supabaseAdmin
      .from("assets")
      .select("metadata")
      .eq("id", row.prepared_asset_id)
      .maybeSingle();
    await supabaseAdmin
      .from("assets")
      .update({
        metadata: {
          ...asRecord(file?.metadata),
          imported_voiceover: { voiceoverId, ...consent },
        } as never,
      })
      .eq("id", row.prepared_asset_id);
  }
  return { voiceoverId, assetId: row.prepared_asset_id, durationSeconds, words };
}
