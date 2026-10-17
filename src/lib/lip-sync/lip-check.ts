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
  "framing",
  "silence",
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

/**
 * Beyond lip sync, from the same face landmarks (media worker
 * lipcheck/face_qc.py): how big the presenter's face is and where it sits,
 * and how often the mouth is open where the voice is silent. In the Aurixa
 * job the eye span held at 136 to 153 px at 720p; a clip far off the others'
 * was framed differently (a zoom or push-in), and a mouth moving in silence
 * reads as mumbling.
 */
export const FACE_CHECK = {
  /** A face this much bigger or smaller than the run's first presenter clip's is flagged. */
  sizeChange: 0.12,
  /** ...or one that moved this far across or down the frame (a share of it). */
  moved: 0.08,
  /** A face whose size changes this much within the clip (a push-in or pull-back). */
  spread: 0.2,
  /** The mouth open in this share of the silences' frames... */
  mouthOpen: 0.35,
  /** ...over at least this much silence, is flagged. */
  silentSeconds: 0.6,
} as const;

export interface ClipFraming {
  /** The span between the outer eye corners, in pixels and as a share of the frame's width. */
  eyeSpanPx: number;
  eyeSpanFrac: number;
  /** How much it changes within the clip ((90th - 10th percentile) / median). */
  spread: number;
  /** Where the face sits, 0-1 across and down. */
  faceX: number;
  faceY: number;
}

export interface SilentMouth {
  /** Silence judged (seconds, its edges left out). */
  silentSeconds: number;
  /** The share of those frames whose mouth was open. */
  openFraction: number;
}

/** A clip's framing, as its lip check reported it (null without one). */
export function framingOf(result: unknown): ClipFraming | null {
  const framing = asRecord(asRecord(result)["framing"]);
  const px = finite(framing["eye_span_px"]);
  const frac = finite(framing["eye_span_frac"]);
  if (px === null || frac === null || frac <= 0) return null;
  return {
    eyeSpanPx: px,
    eyeSpanFrac: frac,
    spread: finite(framing["eye_span_spread"]) ?? 0,
    faceX: finite(framing["face_x"]) ?? 0.5,
    faceY: finite(framing["face_y"]) ?? 0.5,
  };
}

/** How the mouth behaved in a clip's silences, as its lip check reported it (null without any). */
export function silentMouthOf(result: unknown): SilentMouth | null {
  const silence = asRecord(asRecord(result)["silence"]);
  const seconds = finite(silence["silent_seconds"]);
  const open = finite(silence["mouth_open_fraction"]);
  if (seconds === null || open === null) return null;
  return { silentSeconds: seconds, openFraction: open };
}

/** The framing a run's clips are held to: its first clip (by position) whose framing is known. */
export function referenceFraming(
  clips: { position: number; lip_result?: unknown }[],
): { position: number; framing: ClipFraming } | null {
  for (const clip of [...clips].sort((a, b) => a.position - b.position)) {
    const framing = framingOf(clip.lip_result);
    if (framing) return { position: clip.position, framing };
  }
  return null;
}

/** What a person should know about a clip's face beyond its lip score: one line each. */
export function faceNotes(
  clip: { position: number; lip_result?: unknown },
  reference: { position: number; framing: ClipFraming } | null,
): { label: string; detail: string }[] {
  const notes: { label: string; detail: string }[] = [];
  const framing = framingOf(clip.lip_result);
  if (framing && reference && reference.position !== clip.position) {
    const size = framing.eyeSpanFrac / reference.framing.eyeSpanFrac - 1;
    const moved = Math.hypot(
      framing.faceX - reference.framing.faceX,
      framing.faceY - reference.framing.faceY,
    );
    if (Math.abs(size) > FACE_CHECK.sizeChange)
      notes.push({
        label: size > 0 ? "Framed closer" : "Framed wider",
        detail: `The face is ${Math.round(Math.abs(size) * 100)}% ${size > 0 ? "bigger" : "smaller"} than in clip ${reference.position + 1} (eye span ${Math.round(framing.eyeSpanPx)} px against ${Math.round(reference.framing.eyeSpanPx)}), so the cut between them jumps. Another take, or one from the video's still, usually matches.`,
      });
    else if (moved > FACE_CHECK.moved)
      notes.push({
        label: "Face moved",
        detail: `The face sits ${Math.round(moved * 100)}% of the frame away from where it is in clip ${reference.position + 1}, so the cut between them jumps.`,
      });
  }
  if (framing && framing.spread > FACE_CHECK.spread)
    notes.push({
      label: "Camera moves",
      detail: `The face grows or shrinks by ${Math.round(framing.spread * 100)}% within the clip: the camera pushes in or pulls back, which weakens lip sync. A locked-off camera holds it.`,
    });
  const mouth = silentMouthOf(clip.lip_result);
  if (
    mouth &&
    mouth.silentSeconds >= FACE_CHECK.silentSeconds &&
    mouth.openFraction > FACE_CHECK.mouthOpen
  )
    notes.push({
      label: "Mouth moves in pauses",
      detail: `The mouth is open in ${Math.round(mouth.openFraction * 100)}% of the ${mouth.silentSeconds.toFixed(1)} s where the voice pauses: it can read as mumbling. Another take may hold it closed.`,
    });
  return notes;
}
