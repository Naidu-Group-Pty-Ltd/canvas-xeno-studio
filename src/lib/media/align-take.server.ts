/**
 * A take aligned to the picture it must end on (see ./align-take): the media
 * worker's align_take task, started for a person or a script under a key of
 * theirs, so asking again follows the one started instead of making another.
 * Its result joins the library like any rendered file, with what was measured
 * kept on it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { alignmentOf, type AlignAnchor, type AlignmentReport } from "./align-take";
import { enqueueInternalMediaTask } from "./enqueue.server";
import { requireActiveMember } from "./members.server";
import { requireWorkerFeature } from "./worker-feature.server";

export interface AlignTakeState {
  taskId: string;
  status: "processing" | "completed" | "failed";
  /** The aligned take in the library, once it is made. */
  assetId: string | null;
  alignment: AlignmentReport | null;
  /** Why it failed, in words; null otherwise. */
  message: string | null;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

interface TaskRow {
  id: string;
  status: string;
  result_asset_id: string | null;
  output_payload: unknown;
  error_message: string | null;
}

const TASK_COLUMNS = "id,status,result_asset_id,output_payload,error_message";

function stateOf(task: TaskRow): AlignTakeState {
  const status =
    task.status === "completed"
      ? "completed"
      : ["failed", "cancelled", "stalled"].includes(task.status)
        ? "failed"
        : "processing";
  return {
    taskId: task.id,
    status,
    assetId: task.result_asset_id ?? null,
    alignment: alignmentOf(asRecord(task.output_payload)["metadata"]),
    message:
      status === "failed"
        ? (task.error_message ?? "The take couldn't be aligned. Try again.")
        : null,
  };
}

/** Where an alignment started under `dedupeKey` stands (null if none was). */
export async function alignTakeByKey(dedupeKey: string): Promise<AlignTakeState | null> {
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select(TASK_COLUMNS)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return data ? stateOf(data as TaskRow) : null;
}

export async function alignTakeState(taskId: string): Promise<AlignTakeState> {
  const { data } = await supabaseAdmin
    .from("media_tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .eq("task_type", "align_take")
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That alignment no longer exists");
  return stateOf(data as TaskRow);
}

export interface AlignTakeRequest {
  userId: string;
  takeAssetId: string;
  pictureAssetId: string;
  anchor: AlignAnchor;
  crossSeconds: number;
  holdSeconds: number;
  /** One task per key: asking again returns the one already started. */
  dedupeKey: string;
  projectId?: string | null;
  /** What the aligned take is called in the library. */
  title?: string | null;
  /** Kept with the task, so its result can be routed back (a recipe's step). */
  context?: Json;
}

/**
 * Starts aligning a take (a video in the library) to the picture it must
 * land on (an image in the library), or returns where the one started under
 * the same key stands.
 */
export async function startAlignTake(input: AlignTakeRequest): Promise<AlignTakeState> {
  await requireActiveMember(input.userId);
  const known = await alignTakeByKey(input.dedupeKey);
  if (known) return known;

  const { data: assets, error } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,mime_type,title,project_id")
    .in("id", [input.takeAssetId, input.pictureAssetId])
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", "The files couldn't be read. Try again.");
  const take = (assets ?? []).find((asset) => asset.id === input.takeAssetId);
  const picture = (assets ?? []).find((asset) => asset.id === input.pictureAssetId);
  if (!take || !picture)
    throw new AppError("INVALID_PARAMETERS", "The take or its picture is no longer in the library");
  if (take.asset_type !== "video")
    throw new AppError("INVALID_PARAMETERS", "The take must be a video");
  if (picture.asset_type !== "image")
    throw new AppError("INVALID_PARAMETERS", "The picture it lands on must be an image");
  await requireWorkerFeature("align_take", "Aligning a take to its picture");

  const task = await enqueueInternalMediaTask({
    createdBy: input.userId,
    projectId: input.projectId ?? take.project_id ?? null,
    taskType: "align_take",
    source: {
      assetId: take.id,
      assetType: "video",
      bucket: take.storage_bucket,
      path: take.storage_path,
      mimeType: take.mime_type,
    },
    extraSources: [
      {
        assetId: picture.id,
        assetType: "image",
        bucket: picture.storage_bucket,
        path: picture.storage_path,
        mimeType: picture.mime_type,
        role: "source",
      },
    ],
    params: {
      anchor: input.anchor,
      cross_seconds: input.crossSeconds,
      hold_seconds: input.holdSeconds,
      format: "mp4",
    },
    dedupeKey: input.dedupeKey,
    output: { count: 1, ext: "mp4", mime: "video/mp4", kind: "video" },
    context: {
      output_title: (
        input.title ?? `${take.title ?? "Take"} · on ${picture.title ?? "its picture"}`
      ).slice(0, 200),
      align_take_picture_asset_id: picture.id,
      ...(input.context ?? {}),
    },
    notConfiguredMessage:
      "The media service is not configured, so the take can't be aligned. An admin needs to set MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
  });
  if (!task.ok)
    throw new AppError(
      task.retryable ? "PROVIDER_TIMEOUT" : "UNKNOWN",
      task.retryable ? `${task.message}. Try again in a moment.` : task.message,
    );
  return alignTakeState(task.taskId);
}
