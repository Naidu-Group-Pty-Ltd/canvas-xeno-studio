/**
 * A voiceover's preparation for lip sync as the studio shows it, shared by
 * the server (which makes it) and the browser (which follows it).
 */
import type { PreparedAnalysis } from "./analysis";
import type { TimedWord } from "./segments";

export type PreparationStatus = "preparing" | "ready" | "failed";
export type TranscriptStatus = "none" | "pending" | "ready" | "unavailable";

export interface LipSyncVoiceover {
  id: string;
  sourceAssetId: string;
  status: PreparationStatus;
  /** The canonical file: what the Editor plays. */
  preparedAssetId: string | null;
  durationSeconds: number | null;
  analysis: PreparedAnalysis | null;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  words: TimedWord[];
  /** Made by the studio, or confirmed by someone: it may be used. */
  usable: boolean;
  errorMessage: string | null;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/**
 * Whether a file needs nobody's confirmation to be prepared: a take made in
 * the Voice tab, a recording whose confirmation it already carries, or a file
 * a preparation made.
 */
export function voiceNeedsNoConfirmation(metadata: unknown): boolean {
  const record = asRecord(metadata);
  if (typeof record["voiceover_id"] === "string" && record["ai_generated_voice"] === true)
    return true;
  const stamp = asRecord(record["imported_voiceover"]);
  if (typeof stamp["confirmedBy"] === "string" && typeof stamp["confirmedAt"] === "string")
    return true;
  return typeof asRecord(record["lip_sync_voiceover"])["preparation_id"] === "string";
}

/** "41.2s", "1:05.4": a voiceover's length, to a tenth of a second. */
export function voiceLength(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}
