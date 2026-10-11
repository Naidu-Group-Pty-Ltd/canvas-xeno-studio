/**
 * A Supercomputer draft that makes a long video: its plan, worked out with the
 * same helpers Create and the server use, from the draft's story, settings and
 * references and the catalogue as it is now. The server uses it to check a
 * draft when the agent writes it; the draft card uses it to show, quote and
 * start the run, so all three agree.
 */
import type { ModelRegistryEntry } from "../model-schema";
import {
  clipPrompt,
  continuationCandidates,
  durationChoices,
  longVideoEligible,
  planClips,
  planDurations,
  planIssues,
  totalSeconds,
  type ClipDraft,
  type PlannedClip,
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

/** Clip lengths for a long video on a model: each as long as the model allows. */
export function draftDurations(
  model: ModelRegistryEntry,
  continuation: ModelRegistryEntry,
  targetSeconds: number,
): number[] {
  const laterChoices = durationChoices(continuation);
  if (!laterChoices.length) return [];
  return planDurations({
    targetSeconds,
    maxClipSeconds: Math.max(...laterChoices),
    firstChoices: durationChoices(model),
    continuationChoices: laterChoices,
  });
}

export function planDraftLongVideo(input: {
  model: ModelRegistryEntry;
  models: ModelRegistryEntry[];
  longVideo: Pick<DraftLongVideo, "targetSeconds" | "continuationModelId" | "continuity" | "beats">;
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
  const clips: ClipDraft[] = durations.map((durationSeconds, index) => {
    const beat = longVideo.beats[index] ?? "";
    return {
      beat,
      durationSeconds,
      prompt: clipPrompt({ story, beat, continuity: longVideo.continuity, index }),
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
      })
    : [];
  const total = totalSeconds(durations);
  // Clip 1 is checked with every setting of the draft, so this covers them too.
  const issues = planIssues({
    first: model,
    continuation,
    clips: planned,
    targetSeconds: total,
  }).map((issue) => issue.message);
  return { continuation, durations, totalSeconds: total, clips, planned, issues };
}
