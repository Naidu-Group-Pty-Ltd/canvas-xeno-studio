import { useMemo } from "react";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import {
  cinemaSupported,
  compileCinemaPrompt,
  promptCinemaGroups,
  type CinemaSelection,
} from "@/lib/cinema";
import {
  clipLengthChoices,
  clipPrompt,
  continuationCandidates,
  durationChoices,
  longVideoEligible,
  planClips,
  planDurations,
  planIssues,
  totalSeconds,
  type ClipDraft,
  type PlanIssue,
  type PlannedClip,
  type RunReference,
} from "@/lib/long-video/plan";

/** What the long-video panel holds while a run is being set up. */
export interface LongVideoDraft {
  enabled: boolean;
  targetSeconds: number;
  /** The longest a clip may be; null for the longest the model allows. */
  clipSeconds: number | null;
  /** The model for clips 2 onward; null to choose automatically. */
  continuationModelId: string | null;
  title: string;
  continuity: string;
  /** What happens in each clip, by clip; kept as the plan changes length. */
  beats: string[];
}

export const DEFAULT_LONG_VIDEO_DRAFT: LongVideoDraft = {
  enabled: false,
  targetSeconds: 60,
  clipSeconds: null,
  continuationModelId: null,
  title: "",
  continuity: "",
  beats: [],
};

export interface LongVideoPlan {
  eligible: boolean;
  candidates: ModelRegistryEntry[];
  continuation: ModelRegistryEntry | null;
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
    const clips: ClipDraft[] = durations.map((durationSeconds, index) => {
      const clipModel = index === 0 ? model : continuation!;
      const beat = draft.beats[index] ?? "";
      const base = clipPrompt({ story, beat, continuity: draft.continuity, index });
      const prompt =
        cinema.on && cinemaSupported(clipModel)
          ? compileCinemaPrompt(base, cinema.selection, promptCinemaGroups(clipModel))
          : base;
      return { beat, durationSeconds, prompt };
    });
    const planned = continuation
      ? planClips({ first: model, continuation, values, references, clips })
      : [];
    const total = totalSeconds(durations);
    return {
      eligible: true,
      candidates,
      continuation,
      lengthChoices,
      maxClipSeconds,
      durations,
      totalSeconds: total,
      clips,
      planned,
      issues: planIssues({ first: model, continuation, clips: planned, targetSeconds: total }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, model, models, valuesKey, referencesKey, cinemaKey]);
}
