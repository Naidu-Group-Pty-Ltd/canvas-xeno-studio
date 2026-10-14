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
  extendsVideo,
  FINALE_SECONDS,
  finaleReveals,
  longVideoEligible,
  planClips,
  planDurations,
  planIssues,
  startFrameSlot,
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
import type { RunCharacter } from "@/lib/characters/model";
import {
  choosePainter,
  clipQuote,
  keyframeCount,
  keyframeQuote as keyframeQuoteFor,
  keyframeWorkflow,
  openingHasImages,
  painterValues,
  standInImage,
  videoAspect,
  type QuoteRequest,
} from "@/lib/long-video/keyframes";

export type { QuoteRequest };

/** The brand finisher as set up in the panel: one of the reference images. */
export interface FinaleDraft {
  assetId: string;
  mode: FinaleMode;
  /** How long its end card holds after the last clip. */
  seconds: number;
  /** How its end card is laid out at the video's shape. */
  style: EndCardStyle;
  /**
   * The artwork extended to the video's shape with AI (see
   * lib/media/extend-artwork), its end card made from it; none to use the
   * finisher as uploaded.
   */
  sourceAssetId?: string | null;
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
  /** Characters who must look the same throughout. */
  characterIds: string[];
  /** Paint the frame each clip ends on first; null: on when there are characters (where the model can). */
  keyframes: boolean | null;
  /** The image model that paints them; null for the best one on. */
  painterModelId: string | null;
  /** A person looks the keyframes over before the clips are made. */
  reviewKeyframes: boolean;
  /** Every clip is checked against the characters' images before the next is made. */
  identityCheck: boolean;
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
  characterIds: [],
  keyframes: null,
  painterModelId: null,
  reviewKeyframes: true,
  identityCheck: true,
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
  /** The characters as planned (their sheets, best view first). */
  characters: RunCharacter[];
  /** The workflow that can move from keyframe to keyframe, if the model has one. */
  workflow: ModelRegistryEntry | null;
  /** Keyframes are on (and possible). */
  keyframed: boolean;
  /** Image models that can paint keyframes, best first, and the one chosen. */
  painters: ModelRegistryEntry[];
  painter: ModelRegistryEntry | null;
  keyframeCount: number;
  /** The video's shape, as the keyframes are painted. */
  aspect: { ratio: number; label: string };
  /** The first clip as it will be sent, to price it (null: nothing to price yet). */
  quote: QuoteRequest | null;
  /** One keyframe as it will be painted, to price it. */
  keyframeQuote: QuoteRequest | null;
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
  characters: [],
  workflow: null,
  keyframed: false,
  painters: [],
  painter: null,
  keyframeCount: 0,
  aspect: { ratio: 16 / 9, label: "16:9" },
  quote: null,
  keyframeQuote: null,
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
  /** The characters chosen (from the team's library), as plans use them. */
  characters?: RunCharacter[];
  /** The person's own opening frame's size, when they gave one (it sets the video's shape). */
  openingFrame?: { width: number | null; height: number | null } | null;
}): LongVideoPlan {
  const { draft, model, models, values, references, cinema } = input;
  const characters = input.characters ?? [];
  const valuesKey = JSON.stringify(values);
  const referencesKey = JSON.stringify(references);
  const cinemaKey = JSON.stringify(cinema);
  const charactersKey = JSON.stringify(characters);
  const openingKey = JSON.stringify(input.openingFrame ?? null);
  return useMemo(() => {
    if (!model || !longVideoEligible(model)) return NOT_ELIGIBLE;
    // Keyframes: every clip by the model's workflow that moves from a frame to a frame.
    const workflow = keyframeWorkflow(model, models);
    const keyframed = !!workflow && (draft.keyframes ?? characters.length > 0);
    // Video extend is offered too, but only ever used when chosen: it is experimental.
    const candidates = keyframed
      ? [workflow!]
      : continuationCandidates(model, models, {
          withReferences: references.some((item) => item.assetType === "image"),
          extend: true,
        });
    const continuation = keyframed
      ? workflow
      : (candidates.find((entry) => entry.id === draft.continuationModelId) ??
        candidates.find((entry) => !extendsVideo(entry)) ??
        null);
    const firstModel = keyframed ? workflow! : model;
    const lengthChoices = clipLengthChoices(continuation);
    const maxClipSeconds =
      draft.clipSeconds !== null && lengthChoices.includes(draft.clipSeconds)
        ? draft.clipSeconds
        : (lengthChoices.at(-1) ?? 0);
    const durations = continuation
      ? planDurations({
          targetSeconds: draft.targetSeconds,
          maxClipSeconds,
          firstChoices: durationChoices(firstModel),
          continuationChoices: lengthChoices,
        })
      : [];
    const story = typeof values["prompt"] === "string" ? values["prompt"] : "";
    const end = clipEnd(continuation);
    // A finisher still among the references; it can only be moved into where the model can.
    // ...and never the image clip 1 starts from, which it would lose.
    const startRole = startFrameSlot(firstModel)?.role ?? null;
    const chosen =
      draft.finale &&
      references.some(
        (item) =>
          item.assetId === draft.finale!.assetId &&
          item.assetType === "image" &&
          !(startRole && item.role === startRole),
      )
        ? draft.finale
        : null;
    const finale: RunFinale | null = chosen
      ? {
          assetId: chosen.assetId,
          mode: finaleReveals(chosen.mode) && !end ? "end_card" : chosen.mode,
          seconds: chosen.seconds,
          sourceAssetId: chosen.sourceAssetId ?? null,
        }
      : null;
    const clips: ClipDraft[] = durations.map((durationSeconds, index) => {
      const clipModel = index === 0 ? firstModel : continuation!;
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
      ? planClips({
          first: firstModel,
          continuation,
          values,
          references,
          clips,
          finale,
          characters,
          keyframes: keyframed,
        })
      : [];
    const total = totalSeconds(durations);
    const issues = planIssues({
      first: firstModel,
      continuation,
      clips: planned,
      targetSeconds: total,
      finale,
      keyframes: keyframed,
    });

    // The keyframes: painted by the chosen image model at the video's shape.
    const aspect = videoAspect(values, input.openingFrame ?? null);
    const choice = choosePainter({
      models,
      painterModelId: draft.painterModelId,
      aspect,
      openingImages: openingHasImages({ startRole, references, characters }),
    });
    const painters = choice.painters;
    const painter = keyframed ? choice.painter : null;
    const count = keyframed ? keyframeCount(planned.length, finale?.mode ?? null) : 0;
    if (keyframed) for (const message of choice.issues) issues.push({ position: null, message });

    // Priced as sent, with a stand-in image where a frame will go (a keyframe,
    // or the clip before's last frame).
    const standIn = standInImage({ keyframed, startRole, references, characters });
    const quote: QuoteRequest | null = planned[0] ? clipQuote(planned[0], standIn) : null;
    const keyframeQuote: QuoteRequest | null =
      painter && standIn
        ? keyframeQuoteFor({
            painter,
            values: painterValues(painter, aspect.ratio),
            standIn,
            characters,
            references,
          })
        : null;

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
      issues,
      characters,
      workflow,
      keyframed,
      painters,
      painter,
      keyframeCount: count,
      aspect,
      quote,
      keyframeQuote,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, model, models, valuesKey, referencesKey, cinemaKey, charactersKey, openingKey]);
}
