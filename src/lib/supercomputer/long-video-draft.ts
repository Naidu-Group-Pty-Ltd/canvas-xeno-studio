/**
 * A Supercomputer draft that makes a long video: its plan, worked out with the
 * same helpers Create and the server use, from the draft's story, settings and
 * references and the catalogue as it is now. The server uses it to check a
 * draft when the agent writes it; the draft card uses it to show, quote and
 * start the run, so all three agree.
 */
import type { ModelRegistryEntry } from "../model-schema";
import {
  clipEnd,
  clipPrompt,
  continuationCandidates,
  durationChoices,
  finaleReveals,
  LONG_VIDEO_LIMITS,
  longestClips,
  longVideoEligible,
  planClips,
  planDurations,
  planIssues,
  totalSeconds,
  type ClipDraft,
  type PlannedClip,
  type RunFinale,
} from "../long-video/plan";
import type { DraftLongVideo, DraftReference } from "./types";

export interface DraftLongVideoPlan {
  /** The model's workflow for clips 2 onward, or null when none can continue. */
  continuation: ModelRegistryEntry | null;
  durations: number[];
  totalSeconds: number;
  /** As sent to start the run. */
  clips: ClipDraft[];
  /** As the run will send each clip. */
  planned: PlannedClip[];
  issues: string[];
  /** The 40-clip limit makes the video shorter than the length asked for. */
  capped: boolean;
  /** The finisher it ends on, as the run will use it (moving into it only where the model can). */
  finale: RunFinale | null;
}

/** The workflow of the draft's model that makes clips 2 onward, best first. */
export function draftContinuation(
  model: ModelRegistryEntry,
  models: ModelRegistryEntry[],
  references: DraftReference[],
  preferredId?: string | null,
): ModelRegistryEntry | null {
  if (!longVideoEligible(model)) return null;
  const candidates = continuationCandidates(model, models, {
    withReferences: references.some((ref) => ref.assetType === "image"),
  });
  return candidates.find((entry) => entry.id === preferredId) ?? candidates[0] ?? null;
}

/** The lengths a draft's clips are planned from: each model's own, up to the later clips' longest. */
function draftChoices(model: ModelRegistryEntry, continuation: ModelRegistryEntry) {
  const continuationChoices = durationChoices(continuation);
  return {
    maxClipSeconds: continuationChoices.length ? Math.max(...continuationChoices) : 0,
    firstChoices: durationChoices(model),
    continuationChoices,
  };
}

/** Clip lengths for a long video on a model: each as long as the model allows. */
export function draftDurations(
  model: ModelRegistryEntry,
  continuation: ModelRegistryEntry,
  targetSeconds: number,
): number[] {
  return planDurations({ targetSeconds, ...draftChoices(model, continuation) });
}

/** How long clip 1 and each later clip of a draft's long video run at most. */
export function draftLongestClips(model: ModelRegistryEntry, continuation: ModelRegistryEntry) {
  return longestClips(draftChoices(model, continuation));
}

export function planDraftLongVideo(input: {
  model: ModelRegistryEntry;
  models: ModelRegistryEntry[];
  longVideo: Pick<
    DraftLongVideo,
    "targetSeconds" | "continuationModelId" | "continuity" | "beats" | "finisher"
  >;
  /** The draft's settings; their prompt is the story. */
  values: Record<string, unknown>;
  references: DraftReference[];
}): DraftLongVideoPlan {
  const { model, models, longVideo, values, references } = input;
  const continuation = draftContinuation(model, models, references, longVideo.continuationModelId);
  const durations = continuation
    ? draftDurations(model, continuation, longVideo.targetSeconds)
    : [];
  const story = typeof values["prompt"] === "string" ? values["prompt"] : "";
  const finisher = longVideo.finisher ?? null;
  const finale: RunFinale | null =
    finisher && continuation
      ? {
          assetId: finisher.assetId,
          mode: finaleReveals(finisher.mode) && !clipEnd(continuation) ? "end_card" : finisher.mode,
          seconds: finisher.seconds,
        }
      : null;
  const clips: ClipDraft[] = durations.map((durationSeconds, index) => {
    const beat = longVideo.beats[index] ?? "";
    return {
      beat,
      durationSeconds,
      prompt: clipPrompt({
        story,
        beat,
        continuity: longVideo.continuity,
        index,
        count: durations.length,
        finale: finale?.mode ?? null,
      }),
    };
  });
  const planned = continuation
    ? planClips({
        first: model,
        continuation,
        values,
        references: references.map((ref) => ({
          assetId: ref.assetId,
          role: ref.role,
          assetType: ref.assetType,
        })),
        clips,
        finale,
      })
    : [];
  const total = totalSeconds(durations);
  // Clip 1 is checked with every setting of the draft, so this covers them too.
  const issues = planIssues({
    first: model,
    continuation,
    clips: planned,
    targetSeconds: total,
    finale,
  }).map((issue) =>
    // Create's way out ("switch to One clip") isn't on a draft.
    planned.length && planned.length < LONG_VIDEO_LIMITS.minClips && issue.position === null
      ? issue.message.includes("fits in one clip")
        ? "That length now fits in one clip: open it in Create and make it as one clip"
        : issue.message
      : issue.message,
  );
  const capped =
    durations.length >= LONG_VIDEO_LIMITS.maxClips && total + 0.5 < longVideo.targetSeconds;
  return { continuation, durations, totalSeconds: total, clips, planned, issues, capped, finale };
}
