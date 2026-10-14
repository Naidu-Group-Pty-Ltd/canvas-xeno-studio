import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProviderHealth } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  CHARACTERS_KEY,
  fetchCharacters,
  planCharacter,
  useCharacters,
  type CharacterEntry,
} from "@/hooks/useCharacters";
import { useModels, useSettings } from "@/hooks/useStudioData";
import { supabase } from "@/integrations/supabase/client";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { startLongVideo } from "@/lib/long-video.functions";
import { endCardSize } from "@/lib/long-video/finisher";
import {
  approxRunCost,
  durationChoices,
  durationValue,
  finaleReveals,
  nearest,
  type RunFinale,
} from "@/lib/long-video/plan";
import { DEFAULT_END_CARD_STYLE, makeEndCard } from "@/lib/media/end-card";
import type { RunCharacter } from "@/lib/characters/model";
import { keyframeWorkflow, openingFrameOf } from "@/lib/long-video/keyframes";
import { planDraftLongVideo, type DraftLongVideoPlan } from "@/lib/supercomputer/long-video-draft";
import {
  draftRunKey,
  type DraftReference,
  type SupercomputerDraft,
} from "@/lib/supercomputer/types";

export type DraftEstimate =
  | { kind: "loading" }
  /**
   * For a long video, `costUsd` is the whole video, approximated from its
   * first clip's quote per second; each clip is quoted again before it is sent.
   */
  | {
      kind: "ready";
      costUsd: number;
      /** What the figure leaves out because Higgsfield couldn't price it (e.g. "the 5 keyframes"). */
      unpriced?: string;
      longVideo?: {
        firstClipUsd: number;
        clips: number;
        /** Keyframes painted first, and their price in all (null: Higgsfield gave none). */
        keyframes: number;
        keyframesUsd: number | null;
      };
    }
  | { kind: "metered"; description: string }
  /** `blocking`: the draft can't run as it is, whatever the estimate policy. */
  | { kind: "unavailable"; reason: string; blocking?: boolean };

export interface DraftRunInput {
  draft: SupercomputerDraft;
  index: number;
  runNumber: number;
  values: Record<string, unknown>;
  references: DraftReference[];
  estimate: DraftEstimate | null;
}

function inputsFor(references: { assetId: string; role: string }[]) {
  return references.map((ref, position) => ({ assetId: ref.assetId, role: ref.role, position }));
}

/**
 * Run numbers whose start didn't come back (an error, or an answer lost on the
 * way), by draft. The next try reuses that number, and so its request key: a
 * run the server did record is then found by its key, never started twice.
 */
const unsettledRuns = new Map<string, number>();

/**
 * A draft's characters as they are now (sheets, best view first), from the
 * team's library (`library`: undefined while it loads), and why any of them
 * can't be kept the same.
 */
function castOf(
  draft: SupercomputerDraft,
  library: CharacterEntry[] | undefined,
  failed: boolean,
): { characters: RunCharacter[]; problems: string[] } {
  const wanted = draft.characters ?? [];
  if (!wanted.length) return { characters: [], problems: [] };
  if (!library)
    return {
      characters: [],
      problems: [failed ? "The characters couldn't be loaded" : "Loading the characters…"],
    };
  const characters: RunCharacter[] = [];
  const problems: string[] = [];
  for (const character of wanted) {
    const entry = library.find((candidate) => candidate.id === character.id);
    const planned = entry ? planCharacter(entry) : null;
    if (planned?.images.length) characters.push(planned);
    else
      problems.push(
        entry
          ? `${entry.name} has no reference images any more: add some on the Characters page`
          : `${character.name} is no longer in the Characters library`,
      );
  }
  return { characters, problems };
}

/** The provider's quote for one generation, put the way a draft shows it. */
async function estimateOne(
  modelId: string,
  values: Record<string, unknown>,
  inputs: { assetId: string; role: string }[],
): Promise<DraftEstimate> {
  try {
    const result = await estimateGeneration({
      data: { modelId, parameters: values, inputs: inputsFor(inputs) },
    });
    if (result.ok && result.costUsd !== null) return { kind: "ready", costUsd: result.costUsd };
    if (result.ok && result.pricingDescription)
      return { kind: "metered", description: result.pricingDescription };
    const detail = result.message?.trim();
    return {
      kind: "unavailable",
      reason:
        result.code === "INSUFFICIENT_PROVIDER_BALANCE"
          ? "The Higgsfield account is out of credits"
          : result.code === "INVALID_PARAMETERS"
            ? detail
              ? `Higgsfield rejected these settings: ${detail}`
              : "Some settings are not valid for this model"
            : result.code === "UPLOAD_FAILED"
              ? (detail ?? "A reference file couldn't be sent to Higgsfield")
              : "Estimate unavailable",
    };
  } catch {
    return { kind: "unavailable", reason: "Estimate unavailable" };
  }
}

/**
 * Estimating and submitting drafts from a Supercomputer answer. Submission goes
 * through the same server path as Create: provider re-estimate, budget checks,
 * concurrency queue, and an idempotency key per draft run. A long-video draft
 * starts a long video, planned with the same helpers as Create's.
 */
export function useDraftRunner(context: {
  messageId: string;
  projectId: string | null;
  campaignId: string | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: health } = useProviderHealth();
  const { data: settings } = useSettings();
  const { data: models = [] } = useModels();
  const { data: library, isError: charactersFailed } = useCharacters();
  const inFlight = useRef(new Set<string>());

  const providerReason = health ? providerBlockReason(health) : "Checking the provider…";
  const requireEstimate = settings?.["require_cost_estimate"] === true;

  /**
   * A long-video draft's plan as it would run now with its characters as they
   * are now (`characters`: the team's library, undefined while it loads), or
   * null when its model is gone.
   */
  const planWith = useCallback(
    (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
      library: { characters: CharacterEntry[] | undefined; failed: boolean },
      openingSize: { width: number | null; height: number | null } | null | "reading",
    ): DraftLongVideoPlan | null => {
      const model = models.find((entry) => entry.id === draft.modelId);
      if (!draft.longVideo || !model) return null;
      const cast = castOf(draft, library.characters, library.failed);
      const plan = planDraftLongVideo({
        model,
        models,
        longVideo: draft.longVideo,
        values,
        references,
        characters: cast.characters,
        openingSize,
      });
      return cast.problems.length ? { ...plan, issues: [...cast.problems, ...plan.issues] } : plan;
    },
    [models],
  );

  /**
   * The draft's own opening frame (the keyframe workflow's start-frame
   * reference), whose shape the video must take; null when it has none.
   */
  const openingFrame = useCallback(
    (draft: SupercomputerDraft, references: DraftReference[]): string | null => {
      const model = models.find((entry) => entry.id === draft.modelId);
      if (!draft.longVideo || !model) return null;
      return openingFrameOf(keyframeWorkflow(model, models), references)?.assetId ?? null;
    },
    [models],
  );

  /**
   * A long-video draft's plan as it would run now, as the card shows it, with
   * its opening frame's size (undefined while the card is reading it).
   */
  const longPlan = useCallback(
    (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
      openingSize?: { width: number | null; height: number | null } | null,
    ) =>
      planWith(
        draft,
        values,
        references,
        { characters: library, failed: charactersFailed },
        openingFrame(draft, references)
          ? openingSize === undefined
            ? "reading"
            : openingSize
          : null,
      ),
    [planWith, library, charactersFailed, openingFrame],
  );

  /** The plan as it is started and priced: with the characters and the opening frame read. */
  const settledPlan = useCallback(
    async (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
    ) => {
      const characters = draft.characters?.length
        ? await queryClient
            .ensureQueryData({ queryKey: CHARACTERS_KEY, queryFn: fetchCharacters })
            .catch(() => undefined)
        : [];
      const opening = openingFrame(draft, references);
      const { data: size } = opening
        ? await supabase.from("assets").select("width,height").eq("id", opening).maybeSingle()
        : { data: null };
      return planWith(draft, values, references, { characters, failed: !characters }, size ?? null);
    },
    [planWith, queryClient, openingFrame],
  );

  const estimate = useCallback(
    async (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
    ): Promise<DraftEstimate> => {
      if (!draft.longVideo) return estimateOne(draft.modelId, values, references);
      const plan = await settledPlan(draft, values, references);
      if (!plan)
        return { kind: "unavailable", reason: "This model is no longer active", blocking: true };
      const first = plan.planned[0];
      if (plan.issues.length || !first)
        return {
          kind: "unavailable",
          reason: plan.issues[0] ?? "This long video can't be planned",
          blocking: true,
        };
      // Quoted by its first clip, exactly as that clip will be sent (a stand-in
      // image where its keyframes go; with no image at all, as the model's own
      // clip, about the same), and one keyframe as it will be painted.
      const own = models.find((entry) => entry.id === draft.modelId);
      // With no image at all, a model that needs one to start from can't be
      // priced ahead: each clip is priced just before it is made.
      if (
        !plan.quote &&
        own?.capabilities?.inputs?.some((slot) => slot.required && slot.type === "image")
      )
        return {
          kind: "metered",
          description:
            "Each clip is priced just before it's made: with no image to stand in for its frames, clip 1 can't be priced until its opening keyframe is painted.",
        };
      const ownChoices = own ? durationChoices(own) : [];
      const ownSeconds = ownChoices.length
        ? nearest(ownChoices, first.durationSeconds)
        : first.durationSeconds;
      const quotedSeconds = plan.quote ? first.durationSeconds : ownSeconds;
      const [quote, keyframe] = await Promise.all([
        plan.quote
          ? estimateOne(plan.quote.model.id, plan.quote.values, plan.quote.inputs)
          : estimateOne(
              draft.modelId,
              own ? { ...values, duration: durationValue(own, ownSeconds) } : values,
              references,
            ),
        plan.keyframeQuote
          ? estimateOne(
              plan.keyframeQuote.model.id,
              plan.keyframeQuote.values,
              plan.keyframeQuote.inputs,
            )
          : Promise.resolve(null),
      ]);
      if (quote.kind !== "ready") return quote;
      // Only the keyframes that are painted are billed (the person's own frames aren't).
      const keyframesUsd =
        keyframe?.kind === "ready" ? keyframe.costUsd * plan.paintedKeyframes : null;
      // A figure that leaves the keyframes out says so (and isn't enough where
      // an estimate is required, unless Higgsfield prices them by size).
      const unpriced =
        plan.paintedKeyframes > 0 && keyframesUsd === null && keyframe?.kind !== "metered"
          ? `the ${plan.paintedKeyframes} keyframes`
          : undefined;
      return {
        kind: "ready",
        ...(unpriced ? { unpriced } : {}),
        costUsd:
          approxRunCost(quote.costUsd, quotedSeconds, plan.totalSeconds) + (keyframesUsd ?? 0),
        longVideo: {
          firstClipUsd: quote.costUsd,
          clips: plan.planned.length,
          keyframes: plan.paintedKeyframes,
          keyframesUsd,
        },
      };
    },
    [settledPlan, models],
  );

  /**
   * The request key for a draft's next run: a start that didn't come back is
   * tried again under its own key. Settled once the server has answered.
   */
  const runKey = useCallback(
    (index: number, runNumber: number) => {
      const slot = `${context.messageId}:${index}`;
      const number = unsettledRuns.get(slot) ?? runNumber;
      return {
        key: draftRunKey(context.messageId, index, number),
        settle: (answered: boolean) =>
          answered ? unsettledRuns.delete(slot) : unsettledRuns.set(slot, number),
      };
    },
    [context.messageId],
  );

  const runOne = useCallback(
    async ({
      draft,
      index,
      runNumber,
      values,
      references,
      estimate: quote,
    }: DraftRunInput): Promise<boolean> => {
      const { key, settle } = runKey(index, runNumber);
      if (inFlight.current.has(key)) return false;
      inFlight.current.add(key);
      try {
        const result = await submitGeneration({
          data: {
            modelId: draft.modelId,
            parameters: values,
            inputs: inputsFor(references),
            projectId: context.projectId,
            campaignId: context.campaignId,
            estimatedCostUsd: quote?.kind === "ready" ? quote.costUsd : null,
            clientRequestId: key,
            generationGroupId: context.messageId,
          },
        });
        if (result.budgetWarning) toast.warning(result.budgetWarning);
        if (result.status === "submission_uncertain")
          toast.warning(
            "Submission status is uncertain. Automatic retry is disabled to prevent accidental duplicate generation charges. Review it in Activity.",
          );
        else if (result.status === "failed")
          toast.error(
            `"${draft.title}" was rejected by the provider. Open it in Activity for the reason.`,
          );
        else if (result.status === "local_queued")
          toast.success(
            `"${draft.title}" is queued and submits as soon as a provider slot frees up.`,
          );
        else
          toast.success(
            `"${draft.title}" is generating. The result appears here when it is ready.`,
          );
        settle(true);
        return true;
      } catch (error) {
        settle(false);
        toast.error(
          error instanceof Error ? error.message : "The generation could not be submitted",
        );
        return false;
      } finally {
        inFlight.current.delete(key);
        await queryClient.invalidateQueries({ queryKey: ["generations"] });
      }
    },
    [context.messageId, context.projectId, context.campaignId, queryClient, runKey],
  );

  /**
   * The finisher with its end card, laid out at the video's shape: the last
   * clip ends on it and the Editor holds it. Without one the Editor shows the
   * image as it is, which won't do for a last clip moving into it.
   */
  const withEndCard = useCallback(
    async (
      finale: RunFinale,
      values: Record<string, unknown>,
      references: DraftReference[],
      title: string,
    ): Promise<RunFinale> => {
      if (!user) return finale;
      try {
        const start = references.find(
          (ref) =>
            ref.assetType === "image" && ["source", "first_frame", "image"].includes(ref.role),
        );
        const { data: frame } = start
          ? await supabase
              .from("assets")
              .select("width,height")
              .eq("id", start.assetId)
              .maybeSingle()
          : { data: null };
        const frameAssetId = await makeEndCard({
          finisher: { assetId: finale.assetId },
          size: endCardSize(values, frame ?? null),
          style: DEFAULT_END_CARD_STYLE,
          userId: user.id,
          projectId: context.projectId,
          title,
        });
        return { ...finale, frameAssetId, style: DEFAULT_END_CARD_STYLE };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "it couldn't be saved";
        if (finaleReveals(finale.mode))
          throw new Error(`The end card couldn't be made (${reason})`);
        toast.warning(
          `The end card couldn't be laid out (${reason}): the Editor shows the image as it is.`,
        );
        return finale;
      }
    },
    [user, context.projectId],
  );

  /** Starts a long-video draft's run; the server makes its clips one after another. */
  const runLongVideo = useCallback(
    async ({ draft, index, runNumber, values, references }: DraftRunInput): Promise<boolean> => {
      if (!draft.longVideo) return false;
      const plan = await settledPlan(draft, values, references);
      if (!plan?.continuation || plan.issues.length) {
        toast.error(plan?.issues[0] ?? "This model is no longer active");
        return false;
      }
      const { key, settle } = runKey(index, runNumber);
      if (inFlight.current.has(key)) return false;
      inFlight.current.add(key);
      const title = draft.longVideo.title || draft.title;
      try {
        const finale = plan.finale
          ? await withEndCard(plan.finale, values, references, title)
          : null;
        const result = await startLongVideo({
          data: {
            title,
            // Clip 1 too is made by the keyframe workflow when keyframes are painted.
            firstModelId: plan.first.id,
            continuationModelId: plan.continuation.id,
            story: typeof values["prompt"] === "string" ? values["prompt"] : draft.prompt,
            continuity: draft.longVideo.continuity,
            values,
            references: references.map((ref) => ({ assetId: ref.assetId, role: ref.role })),
            clips: plan.clips,
            finale,
            projectId: context.projectId,
            campaignId: context.campaignId,
            clientRequestId: key,
            // Create's defaults: every clip checked against the characters, and
            // the keyframes looked over before any clip is made.
            characterIds: plan.characters.map((character) => character.id),
            identityCheck: true,
            keyframes:
              plan.keyframed && plan.painter
                ? { painterModelId: plan.painter.id, review: true }
                : null,
          },
        });
        settle(true);
        if (result.duplicate)
          toast.info(`"${draft.title}" had already started. Follow it in its card.`);
        else if (result.status === "needs_attention")
          toast.warning(`"${draft.title}" stopped before its first clip. See why in its card.`);
        else if (plan.keyframed)
          toast.success(
            `"${draft.title}" started: ${plan.paintedKeyframes} keyframes are painted first, for you to look over in its card before the ${plan.clips.length} clips are made.`,
          );
        else
          toast.success(
            `"${draft.title}" started: ${plan.clips.length} clips, made one after another. Follow it in its card.`,
          );
        return true;
      } catch (error) {
        settle(false);
        toast.error(error instanceof Error ? error.message : "The long video could not be started");
        return false;
      } finally {
        inFlight.current.delete(key);
        await queryClient.invalidateQueries({ queryKey: ["long_videos"] });
        await queryClient.invalidateQueries({ queryKey: ["generations"] });
      }
    },
    [context.projectId, context.campaignId, settledPlan, queryClient, runKey, withEndCard],
  );

  const run = useCallback(
    (input: DraftRunInput) => (input.draft.longVideo ? runLongVideo(input) : runOne(input)),
    [runLongVideo, runOne],
  );

  return { estimate, run, longPlan, openingFrame, providerReason, requireEstimate };
}

/** Why the generation provider cannot take work right now, or null when it can. */
export function providerBlockReason(health: { configured: boolean; state: string }): string | null {
  if (!health.configured) return "Higgsfield credentials are not configured";
  if (health.state === "disabled") return "The provider is switched off in Settings";
  return null;
}

/** Whether a quote allows submission under the studio's estimate policy. */
export function estimateAllows(estimate: DraftEstimate | null, requireEstimate: boolean): boolean {
  if (!estimate || estimate.kind === "loading") return false;
  if (estimate.kind === "unavailable") return !requireEstimate && !estimate.blocking;
  if (estimate.kind === "ready" && estimate.unpriced) return !requireEstimate;
  return true;
}

export function formatEstimate(estimate: DraftEstimate | null): string {
  if (!estimate || estimate.kind === "loading") return "Calculating…";
  if (estimate.kind === "ready")
    return `${estimate.longVideo ? "~" : ""}$${estimate.costUsd.toFixed(2)}${estimate.unpriced ? ` + ${estimate.unpriced}` : ""}`;
  if (estimate.kind === "metered") return "Metered";
  return estimate.reason;
}
