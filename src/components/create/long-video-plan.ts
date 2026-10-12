import { useMemo } from "react";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import {
  cinemaSupported,
  compileCinemaPrompt,
  promptCinemaGroups,
  type CinemaSelection,
} from "@/lib/cinema";
import {
  clipEnd,
  clipLengthChoices,
  clipPrompt,
  clipStart,
  continuationCandidates,
  durationChoices,
  FINALE_SECONDS,
  finaleReveals,
  longVideoEligible,
  planClips,
  planDurations,
  planIssues,
  totalSeconds,
  type ClipDraft,
  type ClipEnd,
  type ClipStart,
  type FinaleMode,
  type PlanIssue,
  type PlannedClip,
  type RunFinale,
  type RunReference,
} from "@/lib/long-video/plan";
import { DEFAULT_END_CARD_STYLE, type EndCardStyle } from "@/lib/media/end-card";

/** The brand finisher as set up in the panel: one of the reference images. */
export interface FinaleDraft {
  assetId: string;
  mode: FinaleMode;
  /** How long its end card holds after the last clip. */
  seconds: number;
  /** How its end card is laid out at the video's shape. */
  style: EndCardStyle;
  /** Why the studio picked it, when the person didn't. */
  suggested: string | null;
}

/** A new finisher, ending the way the model allows best. */
export function newFinale(
  assetId: string,
  canMoveInto: boolean,
  suggested: string | null = null,
): FinaleDraft {
  return {
    assetId,
    mode: canMoveInto ? "both" : "end_card",
    seconds: FINALE_SECONDS.default,
    style: DEFAULT_END_CARD_STYLE,
    suggested,
  };
}

/** What the long-video panel holds while a run is being set up. */
export interface LongVideoDraft {
  enabled: boolean;
  targetSeconds: number;
  /** The longest a clip may be; null for the longest the model allows. */
  clipSeconds: number | null;
  /** The workflow of the same model for clips 2 onward; null to choose automatically. */
  continuationModelId: string | null;
  title: string;
  continuity: string;
  /** What happens in each clip, by clip; kept as the plan changes length. */
  beats: string[];
  /** The brand's logo or end card the video ends on, kept out of every clip. */
  finale: FinaleDraft | null;
  /** The person said this video has no finisher, so none is suggested. */
  finaleOff: boolean;
}

export const DEFAULT_LONG_VIDEO_DRAFT: LongVideoDraft = {
  enabled: false,
  targetSeconds: 60,
  clipSeconds: null,
  continuationModelId: null,
  title: "",
  continuity: "",
  beats: [],
  finale: null,
  finaleOff: false,
};

export interface LongVideoPlan {
  eligible: boolean;
  /** The first clip's model's workflows that can make the later clips. */
  candidates: ModelRegistryEntry[];
  continuation: ModelRegistryEntry | null;
  /** How the later clips start from the frame before. */
  start: ClipStart | null;
  /** How the last clip can end on the finisher, if its model can. */
  end: ClipEnd | null;
  /** The finisher as the run will use it (moving into it only where the model can). */
  finale: RunFinale | null;
  lengthChoices: number[];
  maxClipSeconds: number;
  durations: number[];
  totalSeconds: number;
  clips: ClipDraft[];
  planned: PlannedClip[];
  issues: PlanIssue[];
}

const NOT_ELIGIBLE: LongVideoPlan = {
  eligible: false,
  candidates: [],
  continuation: null,
  start: null,
  end: null,
  finale: null,
  lengthChoices: [],
  maxClipSeconds: 0,
  durations: [],
  totalSeconds: 0,
  clips: [],
  planned: [],
  issues: [],
};

/**
 * The run the panel describes, clip by clip, exactly as the server will check
 * and send it: lengths, models, prompts (with Cinema Mode's shot language when
 * it is on), settings, media and anything that would stop it.
 */
export function useLongVideoPlan(input: {
  draft: LongVideoDraft;
  model: ModelRegistryEntry | null;
  models: ModelRegistryEntry[];
  values: Record<string, unknown>;
  references: RunReference[];
  cinema: { on: boolean; selection: CinemaSelection };
}): LongVideoPlan {
  const { draft, model, models, values, references, cinema } = input;
  const valuesKey = JSON.stringify(values);
  const referencesKey = JSON.stringify(references);
  const cinemaKey = JSON.stringify(cinema);
  return useMemo(() => {
    if (!model || !longVideoEligible(model)) return NOT_ELIGIBLE;
    const candidates = continuationCandidates(model, models, {
      withReferences: references.some((item) => item.assetType === "image"),
    });
    const continuation =
      candidates.find((entry) => entry.id === draft.continuationModelId) ?? candidates[0] ?? null;
    const lengthChoices = clipLengthChoices(continuation);
    const maxClipSeconds =
      draft.clipSeconds !== null && lengthChoices.includes(draft.clipSeconds)
        ? draft.clipSeconds
        : (lengthChoices.at(-1) ?? 0);
    const durations = continuation
      ? planDurations({
          targetSeconds: draft.targetSeconds,
          maxClipSeconds,
          firstChoices: durationChoices(model),
          continuationChoices: lengthChoices,
        })
      : [];
    const story = typeof values["prompt"] === "string" ? values["prompt"] : "";
    const end = clipEnd(continuation);
    // A finisher still among the references; it can only be moved into where the model can.
    const chosen =
      draft.finale &&
      references.some(
        (item) => item.assetId === draft.finale!.assetId && item.assetType === "image",
      )
        ? draft.finale
        : null;
    const finale: RunFinale | null = chosen
      ? {
          assetId: chosen.assetId,
          mode: finaleReveals(chosen.mode) && !end ? "end_card" : chosen.mode,
          seconds: chosen.seconds,
        }
      : null;
    const clips: ClipDraft[] = durations.map((durationSeconds, index) => {
      const clipModel = index === 0 ? model : continuation!;
      const beat = draft.beats[index] ?? "";
      const base = clipPrompt({
        story,
        beat,
        continuity: draft.continuity,
        index,
        count: durations.length,
        finale: finale?.mode ?? null,
      });
      const prompt =
        cinema.on && cinemaSupported(clipModel)
          ? compileCinemaPrompt(base, cinema.selection, promptCinemaGroups(clipModel))
          : base;
      return { beat, durationSeconds, prompt };
    });
    const planned = continuation
      ? planClips({ first: model, continuation, values, references, clips, finale })
      : [];
    const total = totalSeconds(durations);
    return {
      eligible: true,
      candidates,
      continuation,
      start: clipStart(continuation),
      end,
      finale,
      lengthChoices,
      maxClipSeconds,
      durations,
      totalSeconds: total,
      clips,
      planned,
      issues: planIssues({
        first: model,
        continuation,
        clips: planned,
        targetSeconds: total,
        finale,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, model, models, valuesKey, referencesKey, cinemaKey]);
}
