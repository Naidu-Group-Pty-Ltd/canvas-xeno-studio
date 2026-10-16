/**
 * What a single clip's file keeps about the voiceover it was made to
 * (assets.metadata.lip_sync), shared by the server (which writes it, see
 * ./clip.server) and the browser (which offers to open the clip with it).
 */
import { syncSummary } from "./sync";

export interface ClipLipSync {
  preparation_id: string;
  piece_asset_id: string;
  /** Its piece, on the voiceover's clock (the whole voiceover, for a single clip). */
  start_seconds: number;
  end_seconds: number;
  status: "measuring" | "measured" | "unverified" | "failed";
  attempts: number;
  task_id?: string | null;
  offset_seconds?: number | null;
  reason?: string | null;
  result?: Record<string, unknown> | null;
  measured_at?: string | null;
  updated_at: string;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/** Tries at measuring a clip's sync before it is taken as in step. */
export const MAX_SYNC_ATTEMPTS = 3;

/**
 * How long a measurement with no task yet is left to the request that is
 * asking for one, before the reconcile job asks again.
 */
export const SYNC_ASK_GRACE_MS = 2 * 60_000;

/**
 * What the reconcile job does for a single clip whose sync is still being
 * measured, given its task as it stands (null when it has none, or its task
 * is gone):
 * - "record": its task has finished, but the answer wasn't taken in (it came
 *   before the task was recorded on the clip, or the callback was cut short);
 * - "ask": no task is running for it (it couldn't be asked for, or the media
 *   service lost it), so another is asked for;
 * - "give_up": the same, with every try spent, so it is taken as in step;
 * - null: nothing yet (its task is running, or the request asking for one
 *   may still be).
 */
export function clipSyncStep(
  link: Pick<ClipLipSync, "status" | "task_id" | "attempts" | "updated_at">,
  task: { status: string } | null,
  now: number,
): "record" | "ask" | "give_up" | null {
  if (link.status !== "measuring") return null;
  if (link.task_id) {
    if (task?.status === "completed" || task?.status === "failed") return "record";
    if (task) return null;
  } else if (now - Date.parse(link.updated_at) < SYNC_ASK_GRACE_MS) return null;
  return link.attempts >= MAX_SYNC_ATTEMPTS ? "give_up" : "ask";
}

/** A clip file's link to its voiceover, or null for a clip made without one. */
export function clipLipSyncOf(metadata: unknown): ClipLipSync | null {
  const link = asRecord(asRecord(metadata)["lip_sync"]);
  return typeof link["preparation_id"] === "string" &&
    typeof link["piece_asset_id"] === "string" &&
    typeof link["start_seconds"] === "number" &&
    typeof link["end_seconds"] === "number"
    ? (link as unknown as ClipLipSync)
    : null;
}

/** How a single clip's lip sync reads in the studio. */
export function clipSyncSummary(link: ClipLipSync) {
  return syncSummary({
    sync_status: link.status,
    sync_offset_seconds: link.offset_seconds ?? null,
    sync_result: link.result ?? null,
  });
}
