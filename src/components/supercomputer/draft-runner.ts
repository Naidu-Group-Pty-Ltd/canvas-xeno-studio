import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProviderHealth } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useModels, useSettings } from "@/hooks/useStudioData";
import { supabase } from "@/integrations/supabase/client";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { startLongVideo } from "@/lib/long-video.functions";
import { endCardSize } from "@/lib/long-video/finisher";
import { approxRunCost, finaleReveals, type RunFinale } from "@/lib/long-video/plan";
import { DEFAULT_END_CARD_STYLE, makeEndCard } from "@/lib/media/end-card";
import { planDraftLongVideo } from "@/lib/supercomputer/long-video-draft";
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
      longVideo?: { firstClipUsd: number; clips: number };
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

function inputsFor(references: DraftReference[]) {
  return references.map((ref, position) => ({ assetId: ref.assetId, role: ref.role, position }));
}

/**
 * Run numbers whose start didn't come back (an error, or an answer lost on the
 * way), by draft. The next try reuses that number, and so its request key: a
 * run the server did record is then found by its key, never started twice.
 */
const unsettledRuns = new Map<string, number>();

/** The provider's quote for one generation, put the way a draft shows it. */
async function estimateOne(
  modelId: string,
  values: Record<string, unknown>,
  references: DraftReference[],
): Promise<DraftEstimate> {
  try {
    const result = await estimateGeneration({
      data: { modelId, parameters: values, inputs: inputsFor(references) },
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
  const inFlight = useRef(new Set<string>());

  const providerReason = health ? providerBlockReason(health) : "Checking the provider…";
  const requireEstimate = settings?.["require_cost_estimate"] === true;

  /** A long-video draft's plan as it would run now, or null when its model is gone. */
  const longPlan = useCallback(
    (draft: SupercomputerDraft, values: Record<string, unknown>, references: DraftReference[]) => {
      const model = models.find((entry) => entry.id === draft.modelId);
      if (!draft.longVideo || !model) return null;
      return planDraftLongVideo({ model, models, longVideo: draft.longVideo, values, references });
    },
    [models],
  );

  const estimate = useCallback(
    async (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
    ): Promise<DraftEstimate> => {
      if (!draft.longVideo) return estimateOne(draft.modelId, values, references);
      const plan = longPlan(draft, values, references);
      if (!plan)
        return { kind: "unavailable", reason: "This model is no longer active", blocking: true };
      const first = plan.planned[0];
      if (plan.issues.length || !first)
        return {
          kind: "unavailable",
          reason: plan.issues[0] ?? "This long video can't be planned",
          blocking: true,
        };
      // Quoted by its first clip, exactly as that clip will be sent (the finisher isn't).
      const quote = await estimateOne(
        draft.modelId,
        first.values,
        references.filter((ref) => first.inputs.some((input) => input.assetId === ref.assetId)),
      );
      if (quote.kind !== "ready") return quote;
      return {
        kind: "ready",
        costUsd: approxRunCost(quote.costUsd, first.durationSeconds, plan.totalSeconds),
        longVideo: { firstClipUsd: quote.costUsd, clips: plan.planned.length },
      };
    },
    [longPlan],
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
      const plan = longPlan(draft, values, references);
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
            firstModelId: draft.modelId,
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
          },
        });
        settle(true);
        if (result.duplicate)
          toast.info(`"${draft.title}" had already started. Follow it in its card.`);
        else if (result.status === "needs_attention")
          toast.warning(`"${draft.title}" stopped before its first clip. See why in its card.`);
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
    [context.projectId, context.campaignId, longPlan, queryClient, runKey, withEndCard],
  );

  const run = useCallback(
    (input: DraftRunInput) => (input.draft.longVideo ? runLongVideo(input) : runOne(input)),
    [runLongVideo, runOne],
  );

  return { estimate, run, longPlan, providerReason, requireEstimate };
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
  return true;
}

export function formatEstimate(estimate: DraftEstimate | null): string {
  if (!estimate || estimate.kind === "loading") return "Calculating…";
  if (estimate.kind === "ready")
    return `${estimate.longVideo ? "~" : ""}$${estimate.costUsd.toFixed(2)}`;
  if (estimate.kind === "metered") return "Metered";
  return estimate.reason;
}
