/**
 * A Supercomputer draft that makes a long video: its plan, worked out with the
 * same helpers Create and the server use, from the draft's story, settings,
 * references and characters and the catalogue as it is now. The server uses
 * it to check a draft when the agent writes it; the draft card uses it to
 * show, quote and start the run, so all three agree.
 */
import type { ModelRegistryEntry } from "../model-schema";
import type { RunCharacter } from "../characters/model";
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
  startFrameSlot,
  totalSeconds,
  type ClipDraft,
  type PlannedClip,
  type RunFinale,
  type RunReference,
} from "../long-video/plan";
import {
  clipQuote,
  keyframeWorkflow,
  planKeyframes,
  type QuoteRequest,
} from "../long-video/keyframes";
import type { DraftLongVideo, DraftReference } from "./types";

export interface DraftLongVideoPlan {
  /** The model that makes clip 1: the draft's own, or its keyframe workflow. */
  first: ModelRegistryEntry;
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
  /** The characters kept the same throughout (their sheets, best view first). */
  characters: RunCharacter[];
  /** The model's workflow that can move from keyframe to keyframe, if it has one. */
  workflow: ModelRegistryEntry | null;
  /** Keyframes are painted first (on, and possible). */
  keyframed: boolean;
  /** The image model that paints them. */
  painter: ModelRegistryEntry | null;
  /** How many keyframes, and how many are painted (the person's own frames aren't). */
  keyframeCount: number;
  paintedKeyframes: number;
  /** The first clip as it will be sent (a stand-in image where a frame goes), to price it. */
  quote: QuoteRequest | null;
  /** One keyframe as it will be painted, to price it. */
  keyframeQuote: QuoteRequest | null;
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
    "targetSeconds" | "continuationModelId" | "continuity" | "beats" | "finisher" | "keyframes"
  >;
  /** The draft's settings; their prompt is the story. */
  values: Record<string, unknown>;
  references: DraftReference[];
  /** The draft's characters, as they are now. */
  characters?: RunCharacter[];
  /**
   * The size of the draft's own opening frame (its start-frame reference),
   * "reading" while it's being read; unset when it isn't known (not checked).
   */
  openingSize?: { width: number | null; height: number | null } | null | "reading";
}): DraftLongVideoPlan {
  const { model, models, longVideo, values, references } = input;
  const characters = input.characters ?? [];
  // Keyframes, as Create sets them: on with characters, where a workflow of
  // the model can end a clip on a given frame; then it makes every clip.
  const workflow = keyframeWorkflow(model, models);
  const keyframed = !!workflow && (longVideo.keyframes ?? characters.length > 0);
  const first = keyframed ? workflow! : model;
  const continuation = keyframed
    ? workflow
    : draftContinuation(model, models, references, longVideo.continuationModelId);
  const durations = continuation
    ? draftDurations(first, continuation, longVideo.targetSeconds)
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
  const runReferences: RunReference[] = references.map((ref) => ({
    assetId: ref.assetId,
    role: ref.role,
    assetType: ref.assetType,
  }));
  const planned = continuation
    ? planClips({
        first,
        continuation,
        values,
        references: runReferences,
        clips,
        finale,
        characters,
        keyframes: keyframed,
      })
    : [];
  const total = totalSeconds(durations);
  // Clip 1 is checked with every setting of the draft, so this covers them too.
  const issues = planIssues({
    first,
    continuation,
    clips: planned,
    targetSeconds: total,
    finale,
    keyframes: keyframed,
  }).map((issue) =>
    // Create's way out ("switch to One clip") isn't on a draft.
    planned.length && planned.length < LONG_VIDEO_LIMITS.minClips && issue.position === null
      ? issue.message.includes("fits in one clip")
        ? "That length now fits in one clip: open it in Create and make it as one clip"
        : issue.message
      : issue.message,
  );

  // The keyframes: painted at the video's shape by the best image model on,
  // planned exactly as Create and the server plan them.
  const storyboard =
    keyframed && workflow
      ? planKeyframes({
          models,
          workflow,
          values,
          clips: planned.length,
          finale,
          references: runReferences,
          characters,
          openingSize: input.openingSize === "reading" ? undefined : (input.openingSize ?? null),
        })
      : null;
  if (storyboard) issues.push(...storyboard.issues);
  // With keyframes and no image at all to stand in for clip 1's frames, the
  // runner prices the model's own clip instead (about the same).
  const quote =
    planned[0] && !(storyboard && !storyboard.standIn)
      ? clipQuote(planned[0], storyboard?.standIn ?? null)
      : null;
  const capped =
    durations.length >= LONG_VIDEO_LIMITS.maxClips && total + 0.5 < longVideo.targetSeconds;
  return {
    first,
    continuation,
    durations,
    totalSeconds: total,
    clips,
    planned,
    issues,
    capped,
    finale,
    characters,
    workflow,
    keyframed,
    painter: storyboard?.painter ?? null,
    keyframeCount: storyboard?.count ?? 0,
    paintedKeyframes: storyboard?.painted ?? 0,
    quote,
    keyframeQuote: storyboard?.quote ?? null,
  };
}
