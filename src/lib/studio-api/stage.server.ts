/**
 * A stage of generations through the studio's API: priced together
 * (estimate_stage), then queued all together or not at all (queue_stage).
 * Each item is priced and sent exactly as estimate_generation and
 * queue_generation would (its characters and brand kit in it), every take of
 * it; the stage is checked whole (see ../stage-check) before any of it is
 * queued, so a stage never stops part way for want of credits that could be
 * seen coming.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError, messageForCode } from "../higgsfield/errors";
import { stageTotals, type StageVerdict } from "../stage-check";
import type { ModelRegistryEntry } from "../model-schema";
import type { ApiCaller } from "./tokens.server";

export interface StageItemRequest {
  modelId: string;
  parameters: Record<string, unknown>;
  inputs: { assetId: string; role: string }[];
  characterIds: string[];
  brandKitId?: string | null | undefined;
  takes: number;
  label?: string | undefined;
}

export interface StageRequest {
  generations: StageItemRequest[];
  retakeAllowance: number;
  projectId?: string | null | undefined;
  campaignId?: string | null | undefined;
}

/** How the API sends a generation (tools.server's own): its model, and its settings as sent. */
export interface SendHelpers {
  activeModel: (modelId: string) => Promise<ModelRegistryEntry>;
  asSent: (
    model: ModelRegistryEntry,
    item: StageItemRequest,
  ) => Promise<{
    parameters: Record<string, unknown>;
    inputs: { assetId: string; role: string }[];
    /** What its prompt asks that the model is known to get wrong (../media/prompt-warnings). */
    warnings?: Array<{ code: string; message: string }>;
  }>;
}

interface StageItem {
  index: number;
  label: string;
  modelId: string;
  takes: number;
  /** One take's price, or null. */
  usd: number | null;
  costSource: string | null;
  /** Why it isn't priced, or can't be sent. */
  problem: string | null;
  /** It can't be sent as it is (its model, inputs or settings), whatever it costs. */
  blocking: boolean;
  model: ModelRegistryEntry | null;
  sent: {
    parameters: Record<string, unknown>;
    inputs: { assetId: string; role: string }[];
    warnings?: Array<{ code: string; message: string }>;
  } | null;
}

const labelOf = (item: StageItemRequest, index: number) =>
  item.label?.trim() || `item ${index + 1}`;

/** An item ready to send: its model and its settings as sent, or why it can't be. */
async function prepared(
  item: StageItemRequest,
  index: number,
  helpers: SendHelpers,
): Promise<StageItem> {
  const base: StageItem = {
    index,
    label: labelOf(item, index),
    modelId: item.modelId,
    takes: item.takes,
    usd: null,
    costSource: null,
    problem: null,
    blocking: false,
    model: null,
    sent: null,
  };
  try {
    const model = await helpers.activeModel(item.modelId);
    return { ...base, model, sent: await helpers.asSent(model, item) };
  } catch (error) {
    return {
      ...base,
      problem: error instanceof Error ? error.message : "it can't be sent",
      blocking: true,
    };
  }
}

/** One item priced as estimate_generation prices it. */
async function priced(item: StageItem, caller: ApiCaller): Promise<StageItem> {
  if (!item.model || !item.sent) return item;
  const { estimateGenerationCost } = await import("../generation-estimate.server");
  const quote = await estimateGenerationCost({
    userId: caller.userId,
    modelId: item.model.id,
    parameters: item.sent.parameters,
    inputs: item.sent.inputs.map((input, position) => ({ ...input, position })),
  });
  if (quote.ok && quote.costUsd !== null)
    return { ...item, usd: quote.costUsd, costSource: quote.costSource ?? null };
  if (quote.ok)
    return {
      ...item,
      problem: quote.pricingDescription
        ? `Higgsfield prices it as “${quote.pricingDescription.slice(0, 160)}”, which isn't a price the studio can total`
        : "Higgsfield gave no price for it",
    };
  return {
    ...item,
    problem: quote.message ?? messageForCode(quote.code),
    // Settings or media Higgsfield won't take can't be sent either.
    blocking: quote.code === "INVALID_PARAMETERS" || quote.code === "UPLOAD_FAILED",
  };
}

/** Every item of a stage priced (a few at a time), and whether the whole of it fits. */
export async function priceStage(
  request: StageRequest & { allowUnpriced?: boolean },
  caller: ApiCaller,
  helpers: SendHelpers,
): Promise<{ items: StageItem[]; verdict: StageVerdict }> {
  const { inBatches } = await import("../brand/fetch.server");
  const items = await inBatches(request.generations, 3, async (item, index) =>
    priced(await prepared(item, index, helpers), caller),
  );
  const totals = stageTotals(
    items.map((item) => ({
      label: item.label,
      usd: item.usd,
      takes: item.takes,
      problem: item.problem,
    })),
    request.retakeAllowance,
  );
  const { checkStage } = await import("../stage.server");
  const verdict = await checkStage({
    userId: caller.userId,
    projectId: request.projectId ?? null,
    campaignId: request.campaignId ?? null,
    totals,
    allowUnpriced: request.allowUnpriced ?? false,
  });
  return { items, verdict };
}

/** What a stage's pricing answers: each item, then the totals and whether it fits. */
function answerOf(items: StageItem[], verdict: StageVerdict) {
  return {
    items: items.map((item) => ({
      index: item.index,
      label: item.label,
      modelId: item.modelId,
      takes: item.takes,
      costUsd: item.usd,
      subtotalUsd: item.usd === null ? null : Number((item.usd * item.takes).toFixed(4)),
      costSource: item.costSource,
      problem: item.problem,
      ...(item.sent?.warnings?.length ? { warnings: item.sent.warnings } : {}),
    })),
    totalUsd: verdict.totalUsd,
    withAllowanceUsd: verdict.withAllowanceUsd,
    allowance: verdict.allowance,
    generations: verdict.generations,
    balanceUsd: verdict.balanceUsd,
    fits: verdict.fits && !items.some((item) => item.blocking),
    reasons: [
      ...items
        .filter((item) => item.blocking)
        .map((item) => `${item.label} can't be sent as it is: ${item.problem}`),
      ...verdict.reasons,
    ],
    warnings: verdict.warnings,
  };
}

/** Prices a stage and says whether it fits (estimate_stage). Nothing is billed. */
export async function estimateStage(
  request: StageRequest & { allowUnpriced?: boolean },
  caller: ApiCaller,
  helpers: SendHelpers,
) {
  const { items, verdict } = await priceStage(request, caller, helpers);
  return answerOf(items, verdict);
}

/** The request id one take of a stage is queued under: its owner's, so two people's stages never meet. */
export function stageRequestKey(
  userId: string,
  clientRequestId: string,
  index: number,
  take: number,
): string {
  return `stage:${userId}:${clientRequestId}:${index + 1}:${take + 1}`;
}

/**
 * Queues a stage all together or not at all (queue_stage). It is priced and
 * checked whole first, and refused with nothing queued when it doesn't fit or
 * any item can't be sent; then every take is queued, each through the same
 * checks as queue_generation. Asked again with the same clientRequestId (its
 * answer lost, or cut short), it returns what it queued and queues the rest,
 * without pricing or checking again what its first request checked.
 */
export async function queueStage(
  request: StageRequest & { allowUnpriced: boolean; clientRequestId: string },
  caller: ApiCaller,
  helpers: SendHelpers,
) {
  const { assertGenerationAllowed, createAndSubmitGeneration } =
    await import("../generation-create.server");
  await assertGenerationAllowed(caller.userId);
  const takes = request.generations.flatMap((item, index) =>
    Array.from({ length: item.takes }, (_, take) => ({
      index,
      take,
      key: stageRequestKey(caller.userId, request.clientRequestId, index, take),
    })),
  );
  const { data: earlier, error } = await db
    .from("generations")
    .select("id,status,client_request_id")
    .in(
      "client_request_id",
      takes.map((take) => take.key),
    );
  if (error) throw new AppError("UNKNOWN", "The stage couldn't be checked. Try again in a moment.");
  const started = new Map((earlier ?? []).map((row) => [row.client_request_id, row]));

  let items: StageItem[];
  let answer: ReturnType<typeof answerOf> | null = null;
  if (!started.size) {
    const pricing = await priceStage(request, caller, helpers);
    items = pricing.items;
    answer = answerOf(items, pricing.verdict);
    if (!answer.fits)
      throw new AppError(
        items.some((item) => item.blocking) ||
          (pricing.verdict.unpriced.length > 0 && !request.allowUnpriced)
          ? "INVALID_PARAMETERS"
          : "BUDGET_EXCEEDED",
        `Nothing was queued. ${answer.reasons.join(" ")}`,
      );
  } else {
    items = await Promise.all(
      request.generations.map((item, index) => prepared(item, index, helpers)),
    );
  }

  const queued: {
    index: number;
    label: string;
    take: number;
    generationId: string;
    status: string;
  }[] = [];
  const warnings = new Set(answer?.warnings ?? []);
  for (const { index, take, key } of takes) {
    const item = items[index]!;
    const before = started.get(key);
    if (before) {
      queued.push({
        index,
        label: item.label,
        take: take + 1,
        generationId: before.id,
        status: before.status,
      });
      continue;
    }
    try {
      if (!item.model || !item.sent)
        throw new AppError("INVALID_PARAMETERS", item.problem ?? undefined);
      const result = await createAndSubmitGeneration({
        userId: caller.userId,
        model: item.model,
        parameters: item.sent.parameters,
        inputs: item.sent.inputs.map((input, position) => ({ ...input, position })),
        projectId: request.projectId ?? null,
        campaignId: request.campaignId ?? null,
        estimatedCostUsd: item.usd,
        clientRequestId: key,
      });
      if (result.budgetWarning) warnings.add(result.budgetWarning);
      queued.push({
        index,
        label: item.label,
        take: take + 1,
        generationId: result.generationId,
        status: result.status,
      });
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : "it couldn't be queued";
      throw new AppError(
        problem instanceof AppError ? problem.code : "UNKNOWN",
        `${queued.length} of the stage's ${takes.length} generations were queued before ${item.label} (take ${take + 1}) couldn't be: ${message.replace(/\.?$/, ".")} Ask again with the same clientRequestId to queue the rest.`,
      );
    }
  }
  return {
    queued,
    totalUsd: answer?.totalUsd ?? null,
    withAllowanceUsd: answer?.withAllowanceUsd ?? null,
    balanceUsd: answer?.balanceUsd ?? null,
    warnings: [...warnings],
  };
}
