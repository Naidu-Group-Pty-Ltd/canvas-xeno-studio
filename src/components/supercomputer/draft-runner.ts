import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProviderHealth } from "@/components/layout/AppShell";
import { useSettings } from "@/hooks/useStudioData";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import {
  draftRunKey,
  type DraftReference,
  type SupercomputerDraft,
} from "@/lib/supercomputer/types";

export type DraftEstimate =
  | { kind: "loading" }
  | { kind: "ready"; costUsd: number }
  | { kind: "metered"; description: string }
  | { kind: "unavailable"; reason: string };

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
 * Estimating and submitting drafts from a Supercomputer answer. Submission goes
 * through the same server path as Create: provider re-estimate, budget checks,
 * concurrency queue, and an idempotency key per draft run.
 */
export function useDraftRunner(context: {
  messageId: string;
  projectId: string | null;
  campaignId: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: health } = useProviderHealth();
  const { data: settings } = useSettings();
  const inFlight = useRef(new Set<string>());

  const providerReason = health ? providerBlockReason(health) : "Checking the provider…";
  const requireEstimate = settings?.["require_cost_estimate"] === true;

  const estimate = useCallback(
    async (
      draft: SupercomputerDraft,
      values: Record<string, unknown>,
      references: DraftReference[],
    ): Promise<DraftEstimate> => {
      try {
        const result = await estimateGeneration({
          data: { modelId: draft.modelId, parameters: values, inputs: inputsFor(references) },
        });
        if (result.ok && result.costUsd !== null) return { kind: "ready", costUsd: result.costUsd };
        if (result.ok && result.pricingDescription)
          return { kind: "metered", description: result.pricingDescription };
        return {
          kind: "unavailable",
          reason:
            result.code === "INSUFFICIENT_PROVIDER_BALANCE"
              ? "The provider account is out of credits"
              : result.code === "INVALID_PARAMETERS"
                ? "Some settings are not valid for this model"
                : "Estimate unavailable",
        };
      } catch {
        return { kind: "unavailable", reason: "Estimate unavailable" };
      }
    },
    [],
  );

  const run = useCallback(
    async ({
      draft,
      index,
      runNumber,
      values,
      references,
      estimate: quote,
    }: DraftRunInput): Promise<boolean> => {
      const key = draftRunKey(context.messageId, index, runNumber);
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
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The generation could not be submitted",
        );
        return false;
      } finally {
        inFlight.current.delete(key);
        await queryClient.invalidateQueries({ queryKey: ["generations"] });
      }
    },
    [context.messageId, context.projectId, context.campaignId, queryClient],
  );

  return { estimate, run, providerReason, requireEstimate };
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
  if (estimate.kind === "unavailable") return !requireEstimate;
  return true;
}

export function formatEstimate(estimate: DraftEstimate | null): string {
  if (!estimate || estimate.kind === "loading") return "Calculating…";
  if (estimate.kind === "ready") return `$${estimate.costUsd.toFixed(2)}`;
  if (estimate.kind === "metered") return "Metered";
  return estimate.reason;
}
