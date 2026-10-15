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
