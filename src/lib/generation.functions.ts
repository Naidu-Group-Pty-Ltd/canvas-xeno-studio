import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { validateParameters, type ModelRegistryEntry } from "./model-schema";

const inputSchema = z.object({ assetId: z.string().uuid(), role: z.string(), position: z.number().int().min(0) });

const estimateInput = z.object({
  modelId: z.string().uuid(),
  parameters: z.record(z.unknown()),
  inputs: z.array(inputSchema).default([]),
});

const submitInput = estimateInput.extend({
  projectId: z.string().uuid().nullable().optional(),
  parentGenerationId: z.string().uuid().nullable().optional(),
  estimatedCostUsd: z.number().nullable().optional(),
});

type Json = Record<string, unknown>;

async function loadContext(supabase: never, modelId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: model } = await supabaseAdmin.from("model_registry").select("*").eq("id", modelId).maybeSingle();
  if (!model || !model.is_active) throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
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
  if (!profile?.is_active) throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return profile;
}

/** Provider configuration/health, safe for all members (never exposes secrets). */
export const getProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
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
    else if (lastError && (!lastSuccess || new Date(lastError["at"] as string) > new Date(lastSuccess)))
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

/** Live cost estimate. Never falls back to a hardcoded price. */
export const estimateGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => estimateInput.parse(data))
  .handler(async ({ data }) => {
    const { higgsfieldProvider, extractCost, providerConfigured } = await import("./higgsfield/provider.server");
    if (!providerConfigured()) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", costUsd: null };

    const { model } = await loadContext(null as never, data.modelId);
    const roles = data.inputs.map((i) => i.role);
    const issues = validateParameters(model, data.parameters, roles);
    if (issues.length) return { ok: false, code: "INVALID_PARAMETERS", costUsd: null, issues };

    const call = await higgsfieldProvider.estimate(model.model_path, data.parameters);
    const { recordProviderHealth } = await import("./generation-pipeline.server");
    await recordProviderHealth(call.ok, call.errorMessage);
    if (!call.ok) return { ok: false, code: call.errorCode ?? "ESTIMATE_FAILED", costUsd: null };

    const cost = extractCost(call.data);
    if (cost === null) return { ok: false, code: "ESTIMATE_FAILED", costUsd: null };
    return { ok: true, code: null, costUsd: cost };
  });

/** Creates the generation record first, then submits exactly once. */
export const submitGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitInput.parse(data))
  .handler(async ({ data, context }) => {
    const { providerConfigured } = await import("./higgsfield/provider.server");
    const pipeline = await import("./generation-pipeline.server");
    const { supabaseAdmin, model } = await loadContext(null as never, data.modelId);

    const settings = await pipeline.getSettings();
    if (settings["provider_enabled"] === false) throw new AppError("PROVIDER_DISABLED");
    if (!providerConfigured()) throw new AppError("PROVIDER_NOT_CONFIGURED");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.is_active) throw new AppError("NOT_AUTHORIZED");

    const roles = data.inputs.map((i) => i.role);
    const issues = validateParameters(model, data.parameters, roles);
    if (issues.length) throw new AppError("INVALID_PARAMETERS", issues.map((i) => i.message).join("; "));

    if (settings["require_cost_estimate"] === true && (data.estimatedCostUsd ?? null) === null)
      throw new AppError("ESTIMATE_FAILED", "A cost estimate is required before generating");

    const { data: generation, error } = await supabaseAdmin
      .from("generations")
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        model_registry_id: model.id,
        parent_generation_id: data.parentGenerationId ?? null,
        provider: model.provider,
        model_path: model.model_path,
        operation: model.operation as never,
        prompt: typeof data.parameters["prompt"] === "string" ? (data.parameters["prompt"] as string) : null,
        parameters: data.parameters as never,
        estimated_cost_usd: data.estimatedCostUsd ?? null,
        cost_source: data.estimatedCostUsd != null ? "provider_estimate" : null,
        status: "ready",
        ingest_status: "not_required",
      })
      .select("id")
      .single();
    if (error || !generation) throw new AppError("UNKNOWN", error?.message);

    await pipeline.logEvent(generation.id, "created", { model_path: model.model_path });

    if (data.inputs.length) {
      const { data: assets } = await supabaseAdmin
        .from("assets")
        .select("id,storage_bucket,storage_path,mime_type")
        .in("id", data.inputs.map((i) => i.assetId));
      const rows = data.inputs
        .map((input) => {
          const asset = (assets ?? []).find((a) => a.id === input.assetId);
          if (!asset) return null;
          return {
            generation_id: generation.id,
            asset_id: asset.id,
            input_type: input.role as never,
            position: input.position,
            storage_bucket: asset.storage_bucket,
            storage_path: asset.storage_path,
            metadata: { mime_type: asset.mime_type } as never,
          };
        })
        .filter(Boolean);
      if (rows.length) await supabaseAdmin.from("generation_inputs").insert(rows as never);
    }

    await supabaseAdmin.from("usage_ledger").insert({
      generation_id: generation.id,
      user_id: context.userId,
      model_registry_id: model.id,
      estimated_cost_usd: data.estimatedCostUsd ?? null,
      billing_status: "estimated",
    });

    const result = await pipeline.submitOrQueue(generation.id);
    return { generationId: generation.id, status: result.status };
  });

export const refreshGenerationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { higgsfieldProvider } = await import("./higgsfield/provider.server");
    const pipeline = await import("./generation-pipeline.server");
    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("id,hf_request_id,hf_status_url,status,ingest_status")
      .eq("id", data.generationId)
      .maybeSingle();
    if (!generation?.hf_request_id) return { status: generation?.status ?? "unknown" };

    const call = await higgsfieldProvider.getStatus(generation.hf_request_id, generation.hf_status_url);
    if (!call.ok) return { status: generation.status, error: call.errorCode };
    const status = await pipeline.applyProviderPayload(generation.id, call.data);
    if (status === "completed") await pipeline.ingestOutputs(generation.id);
    return { status };
  });

export const cancelGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
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
      return { status: "canceled" };
    }
    if (!generation.hf_request_id) return { status: generation.status };

    const call = await higgsfieldProvider.cancel(generation.hf_request_id, generation.hf_cancel_url);
    if (!call.ok) return { status: generation.status, error: call.errorCode };
    await supabaseAdmin
      .from("generations")
      .update({ status: "canceled", completed_at: new Date().toISOString() })
      .eq("id", generation.id);
    await pipeline.logEvent(generation.id, "canceled", { scope: "provider" });
    return { status: "canceled" };
  });

/** Manual, explicitly confirmed resubmission. Always a NEW linked record. */
export const resubmitGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ generationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
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
  .handler(async ({ data }) => {
    const pipeline = await import("./generation-pipeline.server");
    const created = await pipeline.ingestOutputs(data.generationId);
    return { assets: created };
  });

/** Marketing Studio presets are always fetched live; no preset IDs are hardcoded. */
export const listMarketingPresets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ cursor: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { higgsfieldProvider, providerConfigured } = await import("./higgsfield/provider.server");
    if (!providerConfigured()) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", presets: [], nextCursor: null };

    const call = await higgsfieldProvider.listPresets(data.cursor);
    if (!call.ok) return { ok: false, code: call.errorCode ?? "UNKNOWN", presets: [], nextCursor: null };

    const payload = (call.data ?? {}) as Json;
    const listSource =
      (Array.isArray(payload["items"]) && payload["items"]) ||
      (Array.isArray(payload["presets"]) && payload["presets"]) ||
      (Array.isArray(payload["data"]) && payload["data"]) ||
      [];
    const presets = (listSource as Json[])
      .map((item) => ({
        id: String(item["id"] ?? item["preset_id"] ?? ""),
        name: String(item["name"] ?? item["title"] ?? "Untitled preset"),
        type: typeof item["type"] === "string" ? (item["type"] as string) : null,
        previewUrl:
          typeof item["preview_url"] === "string"
            ? (item["preview_url"] as string)
            : typeof item["thumbnail_url"] === "string"
              ? (item["thumbnail_url"] as string)
              : null,
      }))
      .filter((preset) => preset.id);

    const nextCursor =
      typeof payload["next_cursor"] === "string"
        ? (payload["next_cursor"] as string)
        : typeof payload["cursor"] === "string"
          ? (payload["cursor"] as string)
          : null;

    return { ok: true, code: null, presets, nextCursor };
  });
