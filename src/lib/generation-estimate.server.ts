/**
 * A generation's live cost estimate, as the provider quotes exactly the
 * request it would run (media included). Never falls back to a hardcoded
 * price. Used by Create (estimateGeneration) and by the Supercomputer's
 * approval cards.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "./higgsfield/errors";
import { meteredQuoteFor, type MeteredQuote } from "./higgsfield/metered";
import {
  normalizeOption,
  providerPayload,
  validateParameters,
  type ModelRegistryEntry,
} from "./model-schema";

async function loadModel(modelId: string) {
  const { data: model } = await supabaseAdmin
    .from("model_registry")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || !model.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  return { supabaseAdmin, model: model as unknown as ModelRegistryEntry };
}

export async function estimateGenerationCost(data: {
  userId: string;
  modelId: string;
  parameters: Record<string, unknown>;
  inputs: { assetId: string; role: string; position: number }[];
}) {
  const { higgsfieldProvider, extractCost, extractPricingDescription, providerConfigured } =
    await import("./higgsfield/provider.server");
  const unavailable = (code: string, message: string | null = null) => ({
    ok: false as const,
    code,
    costUsd: null,
    pricingDescription: null as string | null,
    metered: null as MeteredQuote | null,
    byResolution: [] as { resolution: string; usd: number }[],
    message,
  });
  // A layout-only picture (a real client's screen, say) is never sent, even to price a run
  // (shown as a problem with a reference, in the refusal's own words).
  const { assertPlaceable } = await import("./media/layout-only.server");
  try {
    await assertPlaceable(
      data.inputs.map((input) => input.assetId),
      "estimate",
    );
  } catch (error) {
    return unavailable("UPLOAD_FAILED", error instanceof Error ? error.message : null);
  }
  if (!providerConfigured()) return unavailable("PROVIDER_NOT_CONFIGURED");

  const { supabaseAdmin, model } = await loadModel(data.modelId);
  const slotRoles = new Set((model.capabilities?.inputs ?? []).map((slot) => slot.role));
  // Priced as it will be sent: a prepared voiceover as its piece (see lip-sync/clip.server).
  const { withVoiceoverPieces } = await import("./lip-sync/clip.server");
  let inputs: { assetId: string; role: string; position: number }[];
  try {
    inputs = await withVoiceoverPieces(
      model,
      data.inputs
        .filter((input) => slotRoles.has(input.role))
        .sort((a, b) => a.position - b.position),
      { userId: data.userId, projectId: null },
    );
  } catch (error) {
    return unavailable(
      "UPLOAD_FAILED",
      error instanceof Error ? error.message : "The voiceover couldn't be prepared",
    );
  }
  const issues = validateParameters(
    model,
    data.parameters,
    inputs.map((input) => input.role),
  );
  if (issues.length) return { ...unavailable("INVALID_PARAMETERS", issues[0]!.message), issues };

  const pipeline = await import("./generation-pipeline.server");
  const media: { role: string; url: string }[] = [];
  if (inputs.length) {
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id,storage_bucket,storage_path,mime_type")
      .in(
        "id",
        inputs.map((input) => input.assetId),
      );
    try {
      // One at a time: a worker holds each file in memory while it uploads.
      for (const input of inputs) {
        const asset = (assets ?? []).find((entry) => entry.id === input.assetId);
        if (!asset)
          throw new AppError("UPLOAD_FAILED", "A reference file is no longer in the library");
        const url = await pipeline.providerMediaUrl({
          assetId: asset.id,
          bucket: asset.storage_bucket,
          path: asset.storage_path,
          mimeType: asset.mime_type,
        });
        media.push({ role: input.role, url });
      }
    } catch (error) {
      return unavailable(
        "UPLOAD_FAILED",
        error instanceof Error ? error.message : "A reference file could not be prepared",
      );
    }
  }

  const payload = providerPayload(model, data.parameters, media);
  const call = await higgsfieldProvider.estimate(model.model_path, payload);
  if (pipeline.reflectsProviderHealth(call))
    await pipeline.recordProviderHealth(call.ok, call.errorMessage);
  if (!call.ok) return unavailable(call.errorCode ?? "ESTIMATE_FAILED", call.errorMessage ?? null);

  const cost = extractCost(call.data);
  const pricingDescription = extractPricingDescription(call.data);
  // Metered models are quoted as a rate rather than a figure; that is a valid
  // answer from the provider, not an estimate failure.
  if (cost === null && !pricingDescription) return unavailable("ESTIMATE_FAILED");
  if (cost !== null)
    return {
      ok: true as const,
      code: null,
      costUsd: cost,
      pricingDescription,
      metered: null,
      byResolution: [],
      message: null,
    };
  // The rate turned into what this request costs, as the server records it
  // when the generation is sent, and what it would cost at each resolution
  // the model offers, so a cheaper one is a visible choice.
  const fields = model.parameter_schema?.fields ?? [];
  const video = await pipeline.videoSecondsOf(inputs);
  const quote = (values: Record<string, unknown>) =>
    meteredQuoteFor({
      description: pricingDescription,
      fields,
      values,
      inputVideoSeconds: video.seconds,
      sourceVideoSeconds: video.sourceSeconds,
    });
  const metered = quote(payload);
  const resolutions = (fields.find((field) => field.key === "resolution")?.options ?? []).map(
    (option) => String(normalizeOption(option).value),
  );
  const byResolution = resolutions.flatMap((resolution) => {
    const priced = quote({ ...payload, resolution });
    return priced ? [{ resolution, usd: priced.usd }] : [];
  });
  return {
    ok: true as const,
    code: null,
    costUsd: metered?.usd ?? null,
    pricingDescription,
    metered,
    byResolution,
    message: null,
  };
}
