/**
 * A voice measured on the media service (see ./measure): its measure_voice
 * task, started for a person or a script under a key of theirs, so asking
 * again follows the one started instead of measuring again. The call waits a
 * little for it (a few seconds for a minute of sound), and answers
 * "measuring" when it takes longer.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { enqueueInternalMediaTask } from "../media/enqueue.server";
import { requireActiveMember } from "../media/members.server";
import { requireWorkerFeature } from "../media/worker-feature.server";
import { voiceMeasurementOf, voiceSummary, type VoiceMeasurement } from "./measure";

export interface VoiceMeasureState {
  taskId: string;
  status: "measuring" | "completed" | "failed";
  measurement: VoiceMeasurement | null;
  /** The measurement in words, once it is done. */
  summary: string[];
  /** Why it failed, in words; null otherwise. */
  message: string | null;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

interface TaskRow {
  id: string;
  status: string;
  output_payload: unknown;
  error_message: string | null;
}

const TASK_COLUMNS = "id,status,output_payload,error_message";
/** How long a call waits for the measurement before answering "measuring". */
export const VOICE_MEASURE_WAIT_MS = 25_000;
const POLL_MS = 1_000;

function stateOf(task: TaskRow): VoiceMeasureState {
  const status =
    task.status === "completed"
      ? "completed"
      : ["failed", "cancelled", "stalled"].includes(task.status)
        ? "failed"
        : "measuring";
  const measurement =
    status === "completed" ? voiceMeasurementOf(asRecord(task.output_payload)["metadata"]) : null;
  return {
    taskId: task.id,
    status,
    measurement,
    summary: measurement ? voiceSummary(measurement) : [],
    message:
      status === "failed"
        ? (task.error_message ?? "The voice couldn't be measured. Try again.")
        : null,
  };
}

async function taskByKey(dedupeKey: string): Promise<TaskRow | null> {
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select(TASK_COLUMNS)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

/** Waits for the task to finish, up to `waitMs`, then says where it stands. */
async function followed(dedupeKey: string, waitMs: number): Promise<VoiceMeasureState | null> {
  const until = Date.now() + waitMs;
  for (;;) {
    const task = await taskByKey(dedupeKey);
    if (!task) return null;
    const state = stateOf(task);
    if (state.status !== "measuring" || Date.now() + POLL_MS > until) return state;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export interface VoiceMeasureRequest {
  userId: string;
  /** The recording: an audio file or a video in the library. */
  assetId: string;
  /** What it is held against: another audio file or video in the library. */
  referenceAssetId?: string | null | undefined;
  /** A stretch of each, in seconds from its start. */
  start?: number | undefined;
  end?: number | undefined;
  referenceStart?: number | undefined;
  referenceEnd?: number | undefined;
  /** One measurement per key: asking again follows the one started. */
  dedupeKey: string;
  waitMs?: number;
}

const SOUNDING = new Set(["audio", "video"]);

/**
 * Measures a recording's voice (and any reference's), or follows the
 * measurement started under the same key.
 */
export async function measureVoice(input: VoiceMeasureRequest): Promise<VoiceMeasureState> {
  await requireActiveMember(input.userId);
  const waitMs = input.waitMs ?? VOICE_MEASURE_WAIT_MS;
  const known = await followed(input.dedupeKey, waitMs);
  if (known) return known;

  for (const [from, to, name] of [
    [input.start, input.end, ""],
    [input.referenceStart, input.referenceEnd, "reference"],
  ] as const)
    if (from !== undefined && to !== undefined && to <= from)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${name ? `${name}End` : "end"} must come after ${name ? `${name}Start` : "start"}`,
      );
  if (input.referenceAssetId && input.referenceAssetId === input.assetId)
    throw new AppError("INVALID_PARAMETERS", "A recording can't be its own reference");
  const ids = [input.assetId, ...(input.referenceAssetId ? [input.referenceAssetId] : [])];
  const { data: assets, error } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,project_id")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", "The files couldn't be read. Try again.");
  const voice = (assets ?? []).find((asset) => asset.id === input.assetId);
  const reference = input.referenceAssetId
    ? (assets ?? []).find((asset) => asset.id === input.referenceAssetId)
    : null;
  if (!voice)
    throw new AppError("INVALID_PARAMETERS", "That recording is no longer in the library");
  if (input.referenceAssetId && !reference)
    throw new AppError("INVALID_PARAMETERS", "The reference is no longer in the library");
  for (const asset of [voice, reference]) {
    if (asset && !SOUNDING.has(asset.asset_type))
      throw new AppError(
        "INVALID_PARAMETERS",
        "A voice is measured from an audio file or a video, not a picture",
      );
  }
  await requireWorkerFeature("voice_measure", "Measuring a voice");

  const span = (key: string, value: number | undefined) =>
    value === undefined ? {} : { [key]: value };
  const task = await enqueueInternalMediaTask({
    createdBy: input.userId,
    projectId: voice.project_id ?? null,
    taskType: "measure_voice",
    source: {
      assetId: voice.id,
      assetType: voice.asset_type as "audio" | "video",
      bucket: voice.storage_bucket,
      path: voice.storage_path,
      mimeType: voice.mime_type,
    },
    extraSources: reference
      ? [
          {
            assetId: reference.id,
            assetType: reference.asset_type as "audio" | "video",
            bucket: reference.storage_bucket,
            path: reference.storage_path,
            mimeType: reference.mime_type,
            role: "reference",
          },
        ]
      : [],
    params: {
      ...span("start", input.start),
      ...span("end", input.end),
      ...span("reference_start", input.referenceStart),
      ...span("reference_end", input.referenceEnd),
    },
    dedupeKey: input.dedupeKey,
    output: { count: 0, ext: "json", mime: "application/json", kind: "audio" },
    context: { voice_measure: true },
    notConfiguredMessage:
      "The media service is not configured, so the voice can't be measured. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
  });
  if (!task.ok)
    throw new AppError(
      task.retryable ? "PROVIDER_TIMEOUT" : "UNKNOWN",
      task.retryable ? `${task.message}. Try again in a moment.` : task.message,
    );
  return (
    (await followed(input.dedupeKey, waitMs)) ?? {
      taskId: task.taskId,
      status: "measuring",
      measurement: null,
      summary: [],
      message: null,
    }
  );
}
