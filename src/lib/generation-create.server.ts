/**
 * Creating and submitting a generation. Create (single runs and batches) and
 * long videos all start generations here, so every one goes through the same
 * checks, spending limits, idempotency and bookkeeping before the provider is
 * called exactly once.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "./higgsfield/errors";
import { providerConfigured } from "./higgsfield/provider.server";
import { getSettings, logEvent, submitOrQueue } from "./generation-pipeline.server";
import { parameterValues, validateParameters, type ModelRegistryEntry } from "./model-schema";

export interface GenerationRequest {
  /** Who the generation is made for (its owner). */
  userId: string;
  model: ModelRegistryEntry;
  parameters: Record<string, unknown>;
  inputs: { assetId: string; role: string; position: number }[];
  projectId?: string | null;
  campaignId?: string | null;
  parentGenerationId?: string | null;
  generationGroupId?: string | null;
  estimatedCostUsd?: number | null;
  clientRequestId?: string | null;
}

export interface GenerationStarted {
  generationId: string;
  status: string;
  budgetWarning: string | null;
}

/** The provider is on and configured, and the owner is an active team member. */
export async function assertGenerationAllowed(userId: string): Promise<void> {
  const settings = await getSettings();
  if (settings["provider_enabled"] === false) throw new AppError("PROVIDER_DISABLED");
  if (!providerConfigured()) throw new AppError("PROVIDER_NOT_CONFIGURED");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

/** Creates the generation record first, then submits exactly once. */
export async function createAndSubmitGeneration(
  request: GenerationRequest,
): Promise<GenerationStarted> {
  const { model } = request;

  // Only inputs that map to a slot the model declares are kept, so a stray
  // reference is never uploaded to the provider for nothing.
  const slotRoles = new Set((model.capabilities?.inputs ?? []).map((slot) => slot.role));
  // A prepared voiceover in a driving-audio input goes as its piece (see
  // lip-sync/clip.server): a WAV the provider takes, exactly as it will be measured.
  const { withVoiceoverPieces } = await import("./lip-sync/clip.server");
  const inputs = await withVoiceoverPieces(
    model,
    request.inputs.filter((input) => slotRoles.has(input.role)),
    { userId: request.userId, projectId: request.projectId ?? null },
  );
  const roles = inputs.map((i) => i.role);
  const issues = validateParameters(model, request.parameters, roles);
  if (issues.length)
    throw new AppError("INVALID_PARAMETERS", issues.map((i) => i.message).join("; "));

  // Idempotency: a retried or double-clicked submission carries the same
  // client_request_id and can therefore never create a second billable job.
  const clientRequestId = request.clientRequestId ?? null;
  if (clientRequestId) {
    const { data: existing } = await supabaseAdmin
      .from("generations")
      .select("id,status")
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing)
      return { generationId: existing.id, status: existing.status, budgetWarning: null };
  }

  // Spending limits are checked atomically in the database (the owning row is
  // locked), so two simultaneous submissions cannot together pass a hard limit.
  let budgetWarning: string | null = null;
  if (request.projectId || request.campaignId) {
    const { data: allowance } = await supabaseAdmin.rpc("check_spend_allowance", {
      _project_id: (request.projectId ?? null) as string,
      _campaign_id: (request.campaignId ?? null) as string,
      _amount: request.estimatedCostUsd ?? 0,
    });
    const verdict = (allowance ?? {}) as {
      allowed?: boolean;
      message?: string;
      warning?: string | null;
    };
    if (verdict.allowed === false) throw new AppError("BUDGET_EXCEEDED", verdict.message);
    budgetWarning = verdict.warning ?? null;
  }

  // The provisional browser estimate is stored here; the pipeline re-requests
  // the authoritative estimate with the exact serialized provider payload.
  const estimatedCost = request.estimatedCostUsd ?? null;

  const { data: generation, error } = await supabaseAdmin
    .from("generations")
    .insert({
      user_id: request.userId,
      project_id: request.projectId ?? null,
      campaign_id: request.campaignId ?? null,
      model_registry_id: model.id,
      parent_generation_id: request.parentGenerationId ?? null,
      generation_group_id: request.generationGroupId ?? null,
      client_request_id: clientRequestId,
      provider: model.provider,
      model_path: model.model_path,
      operation: model.operation as never,
      prompt:
        typeof request.parameters["prompt"] === "string"
          ? (request.parameters["prompt"] as string)
          : null,
      // Only the model's own settings in play are kept: what the provider is sent.
      parameters: parameterValues(model, request.parameters, roles) as never,
      estimated_cost_usd: estimatedCost,
      cost_source: estimatedCost != null ? "provider_estimate" : null,
      status: "ready",
      ingest_status: "not_required",
    })
    .select("id")
    .single();
  if (error || !generation) {
    // Unique violation = a concurrent duplicate of the same click.
    if (error?.code === "23505" && clientRequestId) {
      const { data: raced } = await supabaseAdmin
        .from("generations")
        .select("id,status")
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (raced) return { generationId: raced.id, status: raced.status, budgetWarning: null };
    }
    throw new AppError("UNKNOWN", error?.message);
  }

  await logEvent(generation.id, "created", { model_path: model.model_path });

  if (inputs.length) {
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id,storage_bucket,storage_path,mime_type")
      .in(
        "id",
        inputs.map((i) => i.assetId),
      );
    const rows = inputs
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
    user_id: request.userId,
    model_registry_id: model.id,
    estimated_cost_usd: estimatedCost,
    billing_status: "estimated",
  });

  const result = await submitOrQueue(generation.id);
  return { generationId: generation.id, status: result.status, budgetWarning };
}
