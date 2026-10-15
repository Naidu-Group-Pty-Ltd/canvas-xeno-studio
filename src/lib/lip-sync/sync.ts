/**
 * Where a generated clip has the speech of the piece of voiceover it was made
 * from, as the media worker's measure_sync reports it (see
 * media-worker/src/voice.js), read into what a run keeps and the Editor uses.
 * Shared by the server and the browser.
 *
 * A model with driving audio puts the speech where the piece puts it, from the
 * clip's first frame, so the offset is expected to be nothing. Measuring it is
 * how a provider that pads, trims or re-times the sound is caught, and its
 * clip still lined up with the voiceover: only an offset that was clearly
 * measured, and is small enough to believe, is ever used.
 */
import { LIP_SYNC } from "./models";

export type SyncStatus = "none" | "measuring" | "measured" | "unverified" | "failed";

export interface SyncReading {
  status: "measured" | "unverified";
  /** Positive: the speech is later in the clip than in its piece. Null unless measured. */
  offsetSeconds: number | null;
  /** Why it couldn't be told, in words, when it couldn't. */
  reason: string | null;
  /** The worker's report, as kept with the clip. */
  result: Record<string, unknown>;
}

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

/** The parts of the worker's report a clip keeps. */
const KEPT = [
  "status",
  "has_audio",
  "fps",
  "video_duration_seconds",
  "video_frames",
  "offset_seconds",
  "confidence",
  "margin",
  "waveform_correlation",
  "drift_seconds",
  "audio_lead_seconds",
  "reference_seconds",
  "clip_audio_seconds",
] as const;

/** What a measure_sync task found, read (its output metadata). */
export function syncReading(
  metadata: unknown,
  maxOffsetSeconds: number = LIP_SYNC.maxOffsetSeconds,
): SyncReading {
  const meta = asRecord(metadata);
  const result: Json = {};
  for (const key of KEPT) if (meta[key] !== undefined) result[key] = meta[key];
  const offset = Number(meta["offset_seconds"]);
  if (meta["status"] === "measured" && Number.isFinite(offset)) {
    if (Math.abs(offset) <= maxOffsetSeconds)
      return {
        status: "measured",
        offsetSeconds: Number(offset.toFixed(5)),
        reason: null,
        result,
      };
    return {
      status: "unverified",
      offsetSeconds: null,
      reason: `Its speech measured ${Math.round(Math.abs(offset) * 1000)} ms ${offset > 0 ? "late" : "early"}, too far to believe, so it is taken as in step.`,
      result,
    };
  }
  const reason =
    meta["status"] === "no_audio"
      ? "The clip came back with no sound to measure, so it is taken as in step."
      : meta["status"] === "no_speech"
        ? "Its piece of the voiceover is silent, so there was nothing to measure."
        : "Its sound didn't match its piece of the voiceover clearly enough to measure, so it is taken as in step.";
  return { status: "unverified", offsetSeconds: null, reason, result };
}

/** The offset a clip is placed by: one that was measured, else none. */
export function syncOffsetOf(clip: {
  sync_status?: string | null;
  sync_offset_seconds?: number | string | null;
}): number | null {
  if (clip.sync_status !== "measured") return null;
  if (clip.sync_offset_seconds === null || clip.sync_offset_seconds === undefined) return null;
  const offset = Number(clip.sync_offset_seconds);
  return Number.isFinite(offset) && Math.abs(offset) <= LIP_SYNC.maxOffsetSeconds ? offset : null;
}

/** How a clip's lip sync reads in the studio: a short label, and a fuller line. */
export function syncSummary(clip: {
  sync_status?: string | null;
  sync_offset_seconds?: number | string | null;
  sync_result?: unknown;
}): { label: string; detail: string; tone: "good" | "neutral" | "warning" } | null {
  switch (clip.sync_status) {
    case "measuring":
      return {
        label: "Measuring sync",
        detail: "Measuring where the clip puts the speech",
        tone: "neutral",
      };
    case "measured": {
      const offset = syncOffsetOf(clip) ?? 0;
      const ms = Math.round(Math.abs(offset) * 1000);
      const drift = Number(asRecord(clip.sync_result)["drift_seconds"]);
      const drifting = Number.isFinite(drift) && Math.abs(drift) >= 0.06;
      if (drifting)
        return {
          label: "Speech drifts",
          detail: `Its speech drifts ${Math.round(Math.abs(drift) * 1000)} ms from the voiceover across the clip, so its lips may slip by its end. Make it again if it shows.`,
          tone: "warning",
        };
      return ms < 10
        ? { label: "In sync", detail: "Its speech lines up with the voiceover", tone: "good" }
        : {
            label: `In sync (${ms} ms)`,
            detail: `Its speech came ${ms} ms ${offset > 0 ? "late" : "early"}; the Editor lines it up with the voiceover`,
            tone: "good",
          };
    }
    case "unverified":
      return {
        label: "Sync not measured",
        detail: "Its sync couldn't be measured, so it is taken as in step",
        tone: "neutral",
      };
    case "failed":
      return {
        label: "Sync not measured",
        detail: "The media service couldn't measure its sync, so it is taken as in step",
        tone: "neutral",
      };
    default:
      return null;
  }
}
