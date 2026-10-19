import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import type { ModelRegistryEntry } from "./model-schema";

const inputSchema = z.object({
  assetId: z.string().uuid(),
  role: z.string(),
  position: z.number().int().min(0),
});

const estimateInput = z.object({
  modelId: z.string().uuid(),
  parameters: z.record(z.unknown()),
  inputs: z.array(inputSchema).default([]),
});

const submitInput = estimateInput.extend({
  projectId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  parentGenerationId: z.string().uuid().nullable().optional(),
  estimatedCostUsd: z.number().nullable().optional(),
  clientRequestId: z.string().min(8).max(64).optional(),
  /** Groups related generations, e.g. every draft run from one Supercomputer answer. */
  generationGroupId: z.string().uuid().nullable().optional(),
});

type Json = Record<string, unknown>;

async function loadContext(supabase: never, modelId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: model } = await supabaseAdmin
    .from("model_registry")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || !model.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  return { supabaseAdmin, model: model as unknown as ModelRegistryEntry };
}

/** Every user-facing server function requires an ACTIVE internal team member. */
async function assertActiveMember(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return profile;
}

/** Provider configuration/health, safe for all members (never exposes secrets). */
export const getProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveMember(context.userId);
    const { providerConfigured } = await import("./higgsfield/provider.server");
    const { getSettings } = await import("./generation-pipeline.server");
    const settings = await getSettings();
    const configured = providerConfigured();
    const enabled = settings["provider_enabled"] !== false;
    const lastError = settings["provider_last_error"] as Json | null;
    const lastSuccess = settings["provider_last_success_at"] as string | null;

    let state: "connected" | "degraded" | "not_configured" | "disabled" = "connected";
    if (!configured) state = "not_configured";
    else if (!enabled) state = "disabled";
    else if (
      lastError &&
      (!lastSuccess || new Date(lastError["at"] as string) > new Date(lastSuccess))
    )
      state = "degraded";

    return {
      provider: "higgsfield",
      configured,
      enabled,
      state,
      lastSuccessAt: lastSuccess,
      lastError: lastError
        ? { at: String(lastError["at"] ?? ""), message: String(lastError["message"] ?? "") }
        : null,
      requiredSecrets: ["HF_KEY_ID", "HF_KEY_SECRET"],
    };
  });

/**
 * Live cost estimate. Never falls back to a hardcoded price.
 *
 * The provider quotes exactly the request it would run, media included: a
 * model that needs an image or a video can't be quoted without it, and a
 * video's length can change the price. Media goes up once and is reused
 * while the estimate refreshes and when the generation is submitted.
 */
export const estimateGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => estimateInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { estimateGenerationCost } = await import("./generation-estimate.server");
    return estimateGenerationCost({ ...data, userId: context.userId });
  });

/** Creates the generation record first, then submits exactly once. */
export const submitGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitInput.parse(data))
  .handler(async ({ data, context }) => {
    const { model } = await loadContext(null as never, data.modelId);
    const { assertGenerationAllowed, createAndSubmitGeneration } =
      await import("./generation-create.server");
    await assertGenerationAllowed(context.userId);
    return createAndSubmitGeneration({
      userId: context.userId,
      model,
      parameters: data.parameters,
      inputs: data.inputs,
      projectId: data.projectId ?? null,
      campaignId: data.campaignId ?? null,
      parentGenerationId: data.parentGenerationId ?? null,
      generationGroupId: data.generationGroupId ?? null,
      estimatedCostUsd: data.estimatedCostUsd ?? null,
      clientRequestId: data.clientRequestId ?? null,
    });
  });

export const refreshGenerationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { higgsfieldProvider } = await import("./higgsfield/provider.server");
    const pipeline = await import("./generation-pipeline.server");
    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("id,hf_request_id,hf_status_url,status,ingest_status")
      .eq("id", data.generationId)
      .maybeSingle();
    if (!generation?.hf_request_id) return { status: generation?.status ?? "unknown" };

    const call = await higgsfieldProvider.getStatus(
      generation.hf_request_id,
      generation.hf_status_url,
    );
    if (!call.ok) return { status: generation.status, error: call.errorCode };
    const status = await pipeline.applyProviderPayload(generation.id, call.data);
    if (status === "completed") await pipeline.ingestOutputs(generation.id);
    return { status };
  });

export const cancelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { higgsfieldProvider } = await import("./higgsfield/provider.server");
    const pipeline = await import("./generation-pipeline.server");

    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("id,status,hf_request_id,hf_cancel_url")
      .eq("id", data.generationId)
      .maybeSingle();
    if (!generation) throw new AppError("UNKNOWN", "Generation not found");
    if (["completed", "failed", "nsfw", "canceled"].includes(generation.status))
      return { status: generation.status };

    if (generation.status === "local_queued") {
      await supabaseAdmin
        .from("generations")
        .update({ status: "canceled", completed_at: new Date().toISOString() })
        .eq("id", generation.id);
      await pipeline.logEvent(generation.id, "canceled", { scope: "local_queue" });
      await pipeline.notifyLongVideo(generation.id);
      return { status: "canceled" };
    }
    if (!generation.hf_request_id) return { status: generation.status };

    const call = await higgsfieldProvider.cancel(
      generation.hf_request_id,
      generation.hf_cancel_url,
    );
    if (!call.ok) return { status: generation.status, error: call.errorCode };
    await supabaseAdmin
      .from("generations")
      .update({ status: "canceled", completed_at: new Date().toISOString() })
      .eq("id", generation.id);
    await pipeline.logEvent(generation.id, "canceled", { scope: "provider" });
    await pipeline.notifyLongVideo(generation.id);
    return { status: "canceled" };
  });

/** Manual, explicitly confirmed resubmission. Always a NEW linked record. */
export const resubmitGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pipeline = await import("./generation-pipeline.server");

    const { data: original } = await supabaseAdmin
      .from("generations")
      .select("*")
      .eq("id", data.generationId)
      .maybeSingle();
    if (!original) throw new AppError("UNKNOWN", "Generation not found");

    const { data: created, error } = await supabaseAdmin
      .from("generations")
      .insert({
        user_id: context.userId,
        project_id: original.project_id,
        model_registry_id: original.model_registry_id,
        parent_generation_id: original.id,
        generation_group_id: original.generation_group_id ?? original.id,
        provider: original.provider,
        model_path: original.model_path,
        operation: original.operation,
        prompt: original.prompt,
        parameters: original.parameters,
        estimated_cost_usd: original.estimated_cost_usd,
        cost_source: original.cost_source,
        status: "ready",
      })
      .select("id")
      .single();
    if (error || !created) throw new AppError("UNKNOWN", error?.message);

    const { data: inputs } = await supabaseAdmin
      .from("generation_inputs")
      .select("asset_id,input_type,position,storage_bucket,storage_path,metadata")
      .eq("generation_id", original.id);
    if (inputs?.length)
      await supabaseAdmin
        .from("generation_inputs")
        .insert(inputs.map((i) => ({ ...i, generation_id: created.id })) as never);

    await supabaseAdmin.from("usage_ledger").insert({
      generation_id: created.id,
      user_id: context.userId,
      model_registry_id: original.model_registry_id,
      estimated_cost_usd: original.estimated_cost_usd,
      billing_status: "estimated",
    });
    await pipeline.logEvent(created.id, "created", { resubmission_of: original.id });

    const result = await pipeline.submitOrQueue(created.id);
    return { generationId: created.id, status: result.status };
  });

export const ingestGenerationOutputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pipeline = await import("./generation-pipeline.server");
    const created = await pipeline.ingestOutputs(data.generationId);
    // Another worker may hold the save; report where it actually stands.
    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("ingest_status")
      .eq("id", data.generationId)
      .maybeSingle();
    return { assets: created, ingestStatus: generation?.ingest_status ?? null };
  });

const presetInput = z.object({
  /** The catalogue a preset control names (FieldSchema.source). */
  source: z.enum(["marketing-studio", "genjutsu-restyle"]).default("marketing-studio"),
  cursor: z.string().optional(),
});

/** Provider presets (Marketing Studio, Genjutsu styles) are always fetched live; no preset IDs are hardcoded. */
export const listProviderPresets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => presetInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertActiveMember(context.userId);
    const { higgsfieldProvider, providerConfigured } = await import("./higgsfield/provider.server");
    if (!providerConfigured())
      return { ok: false, code: "PROVIDER_NOT_CONFIGURED", presets: [], nextCursor: null };

    const call = await higgsfieldProvider.listPresets(data.source, data.cursor);
    if (!call.ok)
      return { ok: false, code: call.errorCode ?? "UNKNOWN", presets: [], nextCursor: null };

    const payload = (call.data ?? {}) as Json;
    const listSource =
      (Array.isArray(payload["items"]) && payload["items"]) ||
      (Array.isArray(payload["presets"]) && payload["presets"]) ||
      (Array.isArray(payload["data"]) && payload["data"]) ||
      [];
    const presets = (listSource as Json[])
      .map((item) => {
        const cover = (item["cover_image"] ?? {}) as Json;
        return {
          id: String(item["id"] ?? item["preset_id"] ?? ""),
          name: String(item["name"] ?? item["title"] ?? "Untitled preset"),
          type: typeof item["type"] === "string" ? (item["type"] as string) : null,
          previewUrl:
            typeof cover["url"] === "string"
              ? (cover["url"] as string)
              : typeof item["preview_url"] === "string"
                ? (item["preview_url"] as string)
                : typeof item["thumbnail_url"] === "string"
                  ? (item["thumbnail_url"] as string)
                  : null,
        };
      })
      .filter((preset) => preset.id);

    // The provider paginates with a numeric cursor; it stops advancing once the
    // whole catalogue has been read.
    const rawCursor = payload["next_cursor"] ?? payload["cursor"];
    const total = typeof payload["total"] === "number" ? payload["total"] : null;
    const cursorValue =
      typeof rawCursor === "string" || typeof rawCursor === "number" ? String(rawCursor) : null;
    const nextCursor =
      cursorValue &&
      (total === null || Number(cursorValue) < total) &&
      cursorValue !== (data.cursor ?? "0")
        ? cursorValue
        : null;

    return { ok: true, code: null, presets, nextCursor };
  });
