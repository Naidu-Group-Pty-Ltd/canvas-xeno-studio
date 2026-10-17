/**
 * How well a clip's lips follow its voice, seen in its picture.
 *
 * The media worker's measure_sync compares a clip's own sound with its piece
 * of the voiceover. A model with driving audio hands that sound back
 * unchanged, so it always reads in step, even when the mouth is early or
 * barely moves. The worker's lip_check looks at the mouth instead: SyncNet
 * (Chung & Zisserman) scores how well the lips match the sound at each offset
 * up to fifteen frames either way (at 25 fps), and reports its confidence at
 * the best offset and where the clip actually sits (offset 0).
 *
 * From the job this was built on: real, well-synced speech scores about 6 to
 * 8; the same settings scored anywhere from 6 to 8.7 depending on the seed;
 * Wan 2.7's lips usually led their sound by a frame. So a clip under 6.5 is
 * flagged, one under 4 is made again where the run allows takes, and a clear
 * lead of a frame or two is taken out when the clip is laid in the Editor
 * (see ./placement).
 *
 * Shared by the server, the browser and tests.
 */

export const LIP_CHECK = {
  /** SyncNet's frame rate: offsets are counted in its frames. */
  fps: 25,
  /** Under this a clip is flagged: its lips may visibly miss the words. */
  flagBelow: 6.5,
  /** Under this a clip is made again, where the run takes more than one take. */
  redoBelow: 4,
  /** A lead believed only this far (frames): past it, something else is wrong. */
  maxLeadFrames: 3,
  /** A lead believed only from a clip scored at least this well. */
  leadConfidence: 4,
  /** Takes a clip may have, at most. */
  maxTakes: 4,
} as const;

export type LipStatus = "none" | "checking" | "scored" | "unscored" | "failed" | "skipped";

/** What a run does about lips (long_videos.qc_settings). */
export interface QcSettings {
  /** Score every clip's lips (where the media service can). */
  lipCheck: boolean;
  /** How many takes a clip may be given to reach a good score (1: no more than the first). */
  takes: number;
  /** Flag clips under this. */
  flagBelow: number;
  /** Make again (within `takes`) clips under this. */
  redoBelow: number;
}

export const DEFAULT_QC: QcSettings = {
  lipCheck: false,
  takes: 1,
  flagBelow: LIP_CHECK.flagBelow,
  redoBelow: LIP_CHECK.redoBelow,
};

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A run's quality settings as stored, filled with the defaults. */
export function storedQc(value: unknown): QcSettings {
  const record = asRecord(value);
  const takes = finite(record["takes"]);
  const flag = finite(record["flag_below"]);
  const redo = finite(record["redo_below"]);
  return {
    lipCheck: record["lip_check"] === true,
    takes: takes === null ? 1 : Math.max(1, Math.min(LIP_CHECK.maxTakes, Math.round(takes))),
    flagBelow: flag === null ? DEFAULT_QC.flagBelow : Math.max(0, Math.min(15, flag)),
    redoBelow: redo === null ? DEFAULT_QC.redoBelow : Math.max(0, Math.min(15, redo)),
  };
}

/** A run's quality settings as they are stored. */
export function storeQc(settings: QcSettings): Json {
  return {
    lip_check: settings.lipCheck,
    takes: settings.takes,
    flag_below: settings.flagBelow,
    redo_below: settings.redoBelow,
  };
}

export interface LipReading {
  status: "scored" | "unscored";
  /** Confidence at the best offset. */
  score: number | null;
  /** Confidence where the clip sits (offset 0). */
  scoreAtZero: number | null;
  /** The best offset, in SyncNet frames (25 fps): negative, the lips lead the sound. */
  offsetFrames: number | null;
  /** Why it couldn't be scored, in words. */
  reason: string | null;
  /** The worker's report, as kept with the clip. */
  result: Json;
}

const KEPT = [
  "status",
  "offset_frames",
  "confidence",
  "confidence_at_zero",
  "min_distance",
  "frames",
  "face_frames",
  "windows",
  "fps",
  "model",
] as const;

/** What a lip_check task found, read (its output metadata). */
export function lipReading(metadata: unknown): LipReading {
  const meta = asRecord(metadata);
  const result: Json = {};
  for (const key of KEPT) if (meta[key] !== undefined) result[key] = meta[key];
  if (Array.isArray(result["windows"]))
    result["windows"] = (result["windows"] as unknown[]).slice(0, 60);
  const score = finite(meta["confidence"]);
  const atZero = finite(meta["confidence_at_zero"]);
  const offset = finite(meta["offset_frames"]);
  if (meta["status"] === "scored" && score !== null && offset !== null)
    return {
      status: "scored",
      score: Number(score.toFixed(3)),
      scoreAtZero: atZero === null ? null : Number(atZero.toFixed(3)),
      offsetFrames: Math.round(offset),
      reason: null,
      result,
    };
  const reason =
    meta["status"] === "no_face"
      ? "No face could be found to score its lips."
      : meta["status"] === "no_speech"
        ? "Its piece of the voiceover is too short or silent to score."
        : "Its lips couldn't be scored.";
  return { status: "unscored", score: null, scoreAtZero: null, offsetFrames: null, reason, result };
}

interface LipFields {
  lip_status?: string | null;
  lip_score?: number | string | null;
  lip_score_at_zero?: number | string | null;
  lip_offset_frames?: number | string | null;
}

const numberOf = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * How far a clip's lips run ahead of its sound, in seconds (positive: the
 * mouth first), to take out when it is laid: only from a clip scored well
 * enough to believe, and only a lead of a frame or three. Null otherwise.
 */
export function lipLeadOf(clip: LipFields): number | null {
  if (clip.lip_status !== "scored") return null;
  const score = numberOf(clip.lip_score);
  const offset = numberOf(clip.lip_offset_frames);
  if (score === null || offset === null || score < LIP_CHECK.leadConfidence) return null;
  if (offset === 0 || Math.abs(offset) > LIP_CHECK.maxLeadFrames) return null;
  return Number((-offset / LIP_CHECK.fps).toFixed(4));
}

/** Where a scored clip stands: good, flagged (weak) or poor (to make again). */
export function lipVerdict(
  score: number | null,
  settings: Pick<QcSettings, "flagBelow" | "redoBelow"> = DEFAULT_QC,
): "good" | "weak" | "poor" | null {
  if (score === null) return null;
  if (score < settings.redoBelow) return "poor";
  if (score < settings.flagBelow) return "weak";
  return "good";
}

/** How a clip's lip score reads in the studio: a short label, and a fuller line. */
export function lipSummary(
  clip: LipFields,
  settings: Pick<QcSettings, "flagBelow" | "redoBelow"> = DEFAULT_QC,
): { label: string; detail: string; tone: "good" | "neutral" | "warning" } | null {
  switch (clip.lip_status) {
    case "checking":
      return {
        label: "Scoring lips",
        detail: "Looking at its mouth against the voice",
        tone: "neutral",
      };
    case "scored": {
      const score = numberOf(clip.lip_score);
      const offset = numberOf(clip.lip_offset_frames) ?? 0;
      const verdict = lipVerdict(score, settings);
      const lead =
        offset < 0
          ? ` Its lips lead the voice by ${-offset * 40} ms, which the Editor takes out.`
          : offset > 0
            ? ` Its lips trail the voice by ${offset * 40} ms, which the Editor takes out.`
            : "";
      const value = score === null ? "?" : score.toFixed(1);
      if (verdict === "good")
        return {
          label: `Lips ${value}`,
          detail: `Its lips follow the voice well (SyncNet ${value}; real speech scores about 6 to 8).${lead}`,
          tone: "good",
        };
      return {
        label: `Lips ${value}`,
        detail:
          verdict === "poor"
            ? `Its lips barely follow the voice (SyncNet ${value}). Make it again: another take of the same clip often scores far better.`
            : `Its lips may miss words (SyncNet ${value}, under ${settings.flagBelow}). Another take may score better.${lead}`,
        tone: "warning",
      };
    }
    case "unscored":
      return { label: "Lips not scored", detail: "No face or speech to score", tone: "neutral" };
    case "failed":
      return {
        label: "Lips not scored",
        detail: "The media service couldn't score its lips",
        tone: "neutral",
      };
    default:
      return null;
  }
}

/** The take to use: the best scored, else the latest. */
export function bestTake<T extends { lipScore: number | null; attempt: number }>(
  takes: T[],
): T | null {
  if (!takes.length) return null;
  const scored = takes.filter((take) => take.lipScore !== null);
  if (scored.length)
    return scored.reduce((best, take) =>
      take.lipScore! > best.lipScore! ||
      (take.lipScore === best.lipScore && take.attempt > best.attempt)
        ? take
        : best,
    );
  return takes.reduce((latest, take) => (take.attempt > latest.attempt ? take : latest));
}
