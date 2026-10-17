/**
 * Long videos made to a voiceover.
 *
 * A model with driving audio (Wan 2.6 and 2.7) moves a speaker's lips to the
 * sound it is given, from its clip's first frame. Given the whole voiceover,
 * only the first clip would move to it, and only to its opening seconds. So
 * the voiceover is cut into pieces, one per clip, only where nobody is
 * speaking (see ../lip-sync/segments), and each clip is made from its own
 * piece: its length is decided by its piece (the model's shortest that holds
 * it, with a little room), not chosen. Every later clip still starts from the
 * frame where the clip before is cut, so the picture runs on as one shot.
 *
 * In the Editor the voiceover plays whole, from its own file, and each clip is
 * laid where its piece is (see ../lip-sync/placement), lined up by where its
 * sound was measured to have the speech; the clips' own sound, which is their
 * piece again, is muted.
 *
 * Shared by the Create page (to show the plan) and the server (to check it and
 * run it), so both always agree.
 */
import type { ModelRegistryEntry } from "../model-schema";
import { LIP_SYNC, lipSyncCapable, lipSyncChoices } from "../lip-sync/models";
import {
  planVoiceoverSegments,
  segmentProblems,
  transcriptOf,
  type SegmentPlan,
  type TimedWord,
  type VoiceoverSegment,
} from "../lip-sync/segments";
import { timingOf, type PreparedAnalysis } from "../lip-sync/analysis";
import {
  normaliseCutaways,
  planSectionedSegments,
  sectionedPlanProblems,
  type Cutaway,
} from "../lip-sync/sections";
import {
  clipKeyframes,
  durationChoices,
  finaleReveals,
  LONG_VIDEO_LIMITS,
  modelLine,
  type RunFinale,
} from "./plan";

/** A long video's voiceover, as the run keeps it (long_videos.voiceover). */
export interface RunVoiceover {
  /** The canonical file the Editor plays. */
  preparedAssetId: string;
  durationSeconds: number;
  sampleRate: number;
  samples: number;
  /** The frame rate its cuts are on, which the Editor plays at. */
  fps: number;
  headroomSeconds: number;
  title: string;
  /** The Editor plays the clips' own sound under the voiceover. */
  keepClipSound: boolean;
  /**
   * Stretches covered by other footage (B-roll), on the voiceover's clock: no
   * clip is made for them (see ../lip-sync/sections). Empty: the presenter
   * throughout.
   */
  cutaways: Cutaway[];
}

/** A piece of the voiceover a clip is made from, as the browser sends it and the server checks it. */
export interface PlannedPiece {
  start: number;
  end: number;
  requestSeconds: number;
}

/** The clip lengths each clip of a voiceover run can be asked for. */
export function voiceoverChoices(
  first: ModelRegistryEntry,
  continuation: ModelRegistryEntry,
): { first: number[]; later: number[] } {
  return {
    first: lipSyncChoices(durationChoices(first)),
    later: lipSyncChoices(durationChoices(continuation)),
  };
}

/** Why these models can't make a video to a voiceover, or null when they can. */
export function voiceoverModelProblem(
  first: ModelRegistryEntry | null,
  continuation: ModelRegistryEntry | null,
): string | null {
  if (!first) return "Choose a video model.";
  if (!lipSyncCapable(first) || (continuation && !lipSyncCapable(continuation)))
    return `${modelLine(first)} can't move a speaker's lips to a voiceover. Choose a model with driving audio (Wan 2.6 or Wan 2.7).`;
  return null;
}

/**
 * The voiceover cut into clips for these models: each clip within the longest
 * chosen, cut in pauses on the frame grid (see ../lip-sync/segments).
 */
export function planVoiceoverClips(input: {
  analysis: PreparedAnalysis;
  words?: TimedWord[] | null;
  first: ModelRegistryEntry;
  continuation: ModelRegistryEntry;
  /** The longest a clip may be; none for the longest the model allows. */
  maxClipSeconds?: number | null;
  /** Stretches covered by B-roll, which no clip is made for. */
  cutaways?: Cutaway[] | null;
}): SegmentPlan & { cutaways: Cutaway[] } {
  const choices = voiceoverChoices(input.first, input.continuation);
  if (input.cutaways?.length)
    return planSectionedSegments({
      timing: timingOf(input.analysis),
      words: input.words ?? null,
      firstChoices: choices.first,
      laterChoices: choices.later,
      ...(input.maxClipSeconds ? { maxClipSeconds: input.maxClipSeconds } : {}),
      fps: LIP_SYNC.gridFps,
      headroomSeconds: LIP_SYNC.headroomSeconds,
      maxClips: LONG_VIDEO_LIMITS.maxClips,
      cutaways: input.cutaways,
    });
  const plan = planVoiceoverSegments({
    timing: timingOf(input.analysis),
    words: input.words ?? null,
    firstChoices: choices.first,
    laterChoices: choices.later,
    ...(input.maxClipSeconds ? { maxClipSeconds: input.maxClipSeconds } : {}),
    fps: LIP_SYNC.gridFps,
    headroomSeconds: LIP_SYNC.headroomSeconds,
    maxClips: LONG_VIDEO_LIMITS.maxClips,
  });
  return { ...plan, cutaways: [] };
}

/**
 * Checks pieces someone else planned (sent from the browser) against the
 * voiceover and the models, and that each clip is asked for its piece's
 * length. Problems in plain words; empty when the plan holds.
 */
export function voiceoverPlanProblems(input: {
  pieces: PlannedPiece[];
  clipSeconds: number[];
  durationSeconds: number;
  first: ModelRegistryEntry;
  continuation: ModelRegistryEntry;
  /** Stretches covered by B-roll, as planned: the pieces leave them out. */
  cutaways?: Cutaway[] | null;
}): string[] {
  const choices = voiceoverChoices(input.first, input.continuation);
  const checks = {
    firstChoices: choices.first,
    laterChoices: choices.later,
    durationSeconds: input.durationSeconds,
    fps: LIP_SYNC.gridFps,
    headroomSeconds: LIP_SYNC.headroomSeconds,
    maxClips: LONG_VIDEO_LIMITS.maxClips,
  };
  const problems = input.cutaways?.length
    ? sectionedPlanProblems(input.pieces, input.cutaways, checks)
    : segmentProblems(input.pieces, checks);
  if (input.clipSeconds.length !== input.pieces.length)
    problems.push("Every clip needs its own piece of the voiceover.");
  else
    input.pieces.forEach((piece, index) => {
      if (input.clipSeconds[index] !== piece.requestSeconds)
        problems.push(
          `Clip ${index + 1} must be ${piece.requestSeconds}s long, to hold its piece of the voiceover.`,
        );
    });
  return problems;
}

/**
 * Whether the last clip of a video made to a voiceover plays out to its own
 * end. Every clip is cut where its piece ends, so the next can start from
 * that frame; but a last clip made to end on a given frame (its closing
 * keyframe, or the brand's end card it moves into) would then never reach
 * it. So it plays on after its piece (the voiceover is over by then), the
 * video lands on that frame, and its final frame is its true last one.
 */
export function lastClipPlaysOut(input: {
  position: number;
  clipCount: number;
  /** The video paints its keyframes first. */
  keyframed: boolean;
  finale: Pick<RunFinale, "assetId" | "frameAssetId" | "mode"> | null;
  /** The keyframe it was sent to end on, if any. */
  endFrameAssetId: string | null;
  /** The media it was sent (its references, and the end card it moves into). */
  inputAssetIds: string[];
}): boolean {
  if (input.position !== input.clipCount - 1) return false;
  if (input.endFrameAssetId) return true;
  const mode = input.finale?.mode ?? null;
  if (input.keyframed && clipKeyframes(input.position, input.clipCount, mode).end !== null)
    return true;
  if (!input.finale || !finaleReveals(input.finale.mode)) return false;
  return input.inputAssetIds.includes(input.finale.frameAssetId || input.finale.assetId);
}

/** What is said in each piece, from the voiceover's word timings (empty where unknown). */
export function pieceTranscripts(
  segments: Pick<VoiceoverSegment, "start" | "end">[],
  words: TimedWord[] | null | undefined,
): string[] {
  return segments.map((segment) => transcriptOf(words, segment.start, segment.end));
}

/** A run's voiceover as stored, or null for a run made without one. */
export function storedVoiceover(value: unknown): RunVoiceover | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const number = (key: string) =>
    typeof record[key] === "number" && Number.isFinite(record[key])
      ? (record[key] as number)
      : null;
  const preparedAssetId =
    typeof record["prepared_asset_id"] === "string" ? record["prepared_asset_id"] : null;
  const durationSeconds = number("duration_seconds");
  const sampleRate = number("sample_rate");
  const samples = number("samples");
  if (!preparedAssetId || !durationSeconds || !sampleRate || !samples) return null;
  const cutaways = Array.isArray(record["cutaways"])
    ? normaliseCutaways(
        (record["cutaways"] as Record<string, unknown>[]).flatMap((item) =>
          typeof item?.["start"] === "number" && typeof item?.["end"] === "number"
            ? [{ start: item["start"], end: item["end"] }]
            : [],
        ),
        durationSeconds,
        number("fps") ?? LIP_SYNC.gridFps,
      )
    : [];
  return {
    preparedAssetId,
    durationSeconds,
    sampleRate,
    samples,
    fps: number("fps") ?? LIP_SYNC.gridFps,
    headroomSeconds: number("headroom_seconds") ?? LIP_SYNC.headroomSeconds,
    title: typeof record["title"] === "string" ? record["title"] : "Voiceover",
    keepClipSound: record["keep_clip_sound"] === true,
    cutaways,
  };
}

/** A run's voiceover as it is stored. */
export function storeVoiceover(voiceover: RunVoiceover): Record<string, unknown> {
  return {
    prepared_asset_id: voiceover.preparedAssetId,
    duration_seconds: voiceover.durationSeconds,
    sample_rate: voiceover.sampleRate,
    samples: voiceover.samples,
    fps: voiceover.fps,
    headroom_seconds: voiceover.headroomSeconds,
    title: voiceover.title,
    keep_clip_sound: voiceover.keepClipSound,
    ...(voiceover.cutaways.length
      ? { cutaways: voiceover.cutaways.map(({ start, end }) => ({ start, end })) }
      : {}),
  };
}
