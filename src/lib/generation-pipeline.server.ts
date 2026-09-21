/**
 * Server-side generation lifecycle: submission, ingestion, dispatch, recovery.
 * Runs with the admin client because it is provider-facing work, never called
 * directly from the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "./higgsfield/errors";
import {
  extractCost,
  extractRequestId,
  higgsfieldProvider,
  isAllowedOutputUrl,
  normalizeResult,
  normalizeStatus,
  type NormalizedOutput,
} from "./higgsfield/provider.server";
import type { InputSlot, ModelRegistryEntry } from "./model-schema";

type Json = Record<string, unknown>;

export function appBaseUrl(): string {
  return (
    process.env["PUBLIC_APP_URL"] ||
    `https://project--${process.env["VITE_SUPABASE_PROJECT_ID"] ?? ""}.lovable.app`
  );
}

export function webhookUrl(): string | undefined {
  // Always attach a callback URL: the stable project URL is used when no
  // explicit public URL is configured, otherwise webhooks would never arrive.
  const base = process.env["PUBLIC_APP_URL"] || process.env["APP_BASE_URL"] || appBaseUrl();
  if (!base) return undefined;
  const token = process.env["LOVABLE_CRON_SECRET"];
  return `${base.replace(/\/$/, "")}/api/public/higgsfield-webhook${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export async function logEvent(generationId: string, eventType: string, payload: Json = {}) {
  await supabaseAdmin.from("generation_events").insert({
    generation_id: generationId,
    event_type: eventType,
    payload: payload as never,
  });
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value");
  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key] = row.value;
  return settings;
}

export async function recordProviderHealth(success: boolean, message?: string) {
  if (success) {
    await supabaseAdmin
      .from("app_settings")
      .update({ value: new Date().toISOString() as never, updated_at: new Date().toISOString() })
      .eq("key", "provider_last_success_at");
  } else {
    await supabaseAdmin
      .from("app_settings")
      .update({
        value: { at: new Date().toISOString(), message: message ?? "Unknown error" } as never,
        updated_at: new Date().toISOString(),
      })
      .eq("key", "provider_last_error");
  }
}

/* ------------------------------------------------------------------ */
/* Media preparation                                                   */
/* ------------------------------------------------------------------ */

export async function prepareMediaForGeneration(generationId: string): Promise<void> {
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("*")
    .eq("generation_id", generationId)
    .order("position");

  for (const input of inputs ?? []) {
    if (input.hf_public_url) continue; // reuse an already prepared URL
    if (!input.storage_bucket || !input.storage_path) continue;
    const { data: file, error } = await supabaseAdmin.storage
      .from(input.storage_bucket)
      .download(input.storage_path);
    if (error || !file) throw new AppError("UPLOAD_FAILED", "Reference file could not be read from storage");
    const bytes = await file.arrayBuffer();
    const mime = (input.metadata as Json)?.["mime_type"];
    const filename = input.storage_path.split("/").pop() ?? "reference";
    const url = await higgsfieldProvider.uploadMedia(
      bytes,
      typeof mime === "string" ? mime : file.type || "application/octet-stream",
      filename.replace(/[^\w.-]/g, "_"),
    );
    await supabaseAdmin.from("generation_inputs").update({ hf_public_url: url }).eq("id", input.id);
  }
}

/** Builds the provider payload from registry parameters plus prepared media. */
export async function buildProviderParams(
  model: Pick<ModelRegistryEntry, "capabilities">,
  parameters: Json,
  generationId: string,
): Promise<Json> {
  const payload: Json = { ...parameters };
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("*")
    .eq("generation_id", generationId)
    .order("position");

  const slots: InputSlot[] = model.capabilities?.inputs ?? [];
  for (const slot of slots) {
    const matching = (inputs ?? []).filter((i) => i.input_type === slot.role && i.hf_public_url);
    if (matching.length === 0) continue;
    if (slot.array) payload[slot.param] = matching.map((i) => i.hf_public_url);
    else payload[slot.param] = matching[0]!.hf_public_url;
  }
  return payload;
}

/* ------------------------------------------------------------------ */
/* Concurrency                                                         */
/* ------------------------------------------------------------------ */

export async function activeProviderCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitting", "queued", "in_progress"]);
  return count ?? 0;
}

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

export async function submitToProvider(generationId: string): Promise<{ status: string }> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("*, model_registry(*)")
    .eq("id", generationId)
    .maybeSingle();
  if (!generation) throw new AppError("UNKNOWN", "Generation not found");
  if (!["ready", "local_queued", "draft", "estimating"].includes(generation.status)) {
    return { status: generation.status };
  }

  await supabaseAdmin
    .from("generations")
    .update({ status: "submitting", submission_started_at: new Date().toISOString() })
    .eq("id", generationId);
  await logEvent(generationId, "submission_started");

  try {
    await prepareMediaForGeneration(generationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference preparation failed";
    await supabaseAdmin
      .from("generations")
      .update({ status: "failed", error_code: "UPLOAD_FAILED", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", generationId);
    await logEvent(generationId, "failed", { code: "UPLOAD_FAILED", message });
    return { status: "failed" };
  }

  const model = generation.model_registry as unknown as ModelRegistryEntry;
  const params = await buildProviderParams(model, (generation.parameters ?? {}) as Json, generationId);
  const call = await higgsfieldProvider.submit(generation.model_path, params, webhookUrl());

  if (call.ok) {
    const requestId = extractRequestId(call.data);
    const record = (call.data ?? {}) as Json;
    await supabaseAdmin
      .from("generations")
      .update({
        status: "queued",
        hf_request_id: requestId,
        hf_status_url: typeof record["status_url"] === "string" ? record["status_url"] : null,
        hf_cancel_url: typeof record["cancel_url"] === "string" ? record["cancel_url"] : null,
        provider_response: record as never,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", generationId);
    await logEvent(generationId, "provider_accepted", { request_id: requestId });
    await recordProviderHealth(true);
    return { status: "queued" };
  }

  // A transport failure or provider 5xx after the POST left is ambiguous: the
  // request may already be running and charging, so it is never auto-retried.
  if (call.uncertain || call.status === 0 || call.status >= 500) {
    await supabaseAdmin
      .from("generations")
      .update({
        status: "submission_uncertain",
        error_code: "SUBMISSION_UNCERTAIN",
        error_message: call.errorMessage ?? "Provider response was ambiguous",
      })
      .eq("id", generationId);
    await logEvent(generationId, "submission_uncertain", { message: call.errorMessage });
    return { status: "submission_uncertain" };
  }

  await supabaseAdmin
    .from("generations")
    .update({
      status: "failed",
      error_code: call.errorCode ?? "PROVIDER_REJECTED",
      error_message: call.errorMessage ?? "Provider rejected the request",
      completed_at: new Date().toISOString(),
      provider_response: (call.data ?? { raw: call.raw.slice(0, 2000) }) as never,
    })
    .eq("id", generationId);
  await logEvent(generationId, "failed", { code: call.errorCode, message: call.errorMessage });
  await recordProviderHealth(false, call.errorMessage);
  return { status: "failed" };
}

/** Either submits immediately or parks the job in the local FIFO queue. */
export async function submitOrQueue(generationId: string): Promise<{ status: string }> {
  const settings = await getSettings();
  const limit = Number(settings["max_provider_concurrency"] ?? 15);
  if ((await activeProviderCount()) >= limit) {
    await supabaseAdmin.from("generations").update({ status: "local_queued" }).eq("id", generationId);
    await logEvent(generationId, "queued", { reason: "local_concurrency_limit" });
    return { status: "local_queued" };
  }
  return submitToProvider(generationId);
}

export async function dispatchQueue(): Promise<number> {
  const settings = await getSettings();
  const limit = Number(settings["max_provider_concurrency"] ?? 15);
  let slots = limit - (await activeProviderCount());
  if (slots <= 0) return 0;

  const { data: waiting } = await supabaseAdmin
    .from("generations")
    .select("id")
    .eq("status", "local_queued")
    .order("created_at", { ascending: true })
    .limit(slots);

  let dispatched = 0;
  for (const row of waiting ?? []) {
    if (slots-- <= 0) break;
    await submitToProvider(row.id);
    dispatched += 1;
  }
  return dispatched;
}

/* ------------------------------------------------------------------ */
/* Terminal state + ingestion                                          */
/* ------------------------------------------------------------------ */

export async function applyProviderPayload(generationId: string, payload: unknown): Promise<string> {
  const record = (payload ?? {}) as Json;
  const statusValue =
    record["status"] ?? record["state"] ?? (record["job"] as Json | undefined)?.["status"] ?? "queued";
  const status = normalizeStatus(statusValue);

  const { data: current } = await supabaseAdmin
    .from("generations")
    .select("id,status,ingest_status")
    .eq("id", generationId)
    .maybeSingle();
  if (!current) return "missing";
  if (["completed", "failed", "nsfw", "canceled"].includes(current.status)) return current.status; // idempotent

  const update: Json = { provider_response: record, last_polled_at: new Date().toISOString() };
  if (status === "in_progress") {
    update["status"] = "in_progress";
    update["started_at"] = new Date().toISOString();
  } else if (status === "queued") {
    update["status"] = "queued";
  } else {
    update["status"] = status;
    update["completed_at"] = new Date().toISOString();
    if (status === "completed") {
      update["ingest_status"] = "pending";
      const cost = extractCost(record);
      if (cost !== null) {
        update["actual_cost_usd"] = cost;
        update["cost_source"] = "provider";
      }
    }
    if (status === "failed") {
      update["error_code"] = "PROVIDER_REJECTED";
      update["error_message"] =
        (typeof record["error"] === "string" && record["error"]) ||
        (typeof record["message"] === "string" && record["message"]) ||
        "Generation failed at the provider";
    }
    if (status === "nsfw") {
      update["error_code"] = "MODERATION_BLOCKED";
      update["error_message"] = "Generation blocked by provider moderation";
    }
  }

  await supabaseAdmin.from("generations").update(update as never).eq("id", generationId);
  await logEvent(generationId, status, { provider_status: statusValue });

  if (status === "completed") {
    await supabaseAdmin
      .from("usage_ledger")
      .update({
        actual_cost_usd: (update["actual_cost_usd"] as number | undefined) ?? null,
        billing_status: update["actual_cost_usd"] !== undefined ? "actual" : "estimated",
      })
      .eq("generation_id", generationId);
  }
  return status;
}

export async function ingestOutputs(generationId: string): Promise<number> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (!generation || generation.status !== "completed") return 0;
  if (generation.ingest_status === "completed" || generation.ingest_status === "processing") return 0;

  await supabaseAdmin.from("generations").update({ ingest_status: "processing" }).eq("id", generationId);
  await logEvent(generationId, "asset_ingest_started");

  let outputs: NormalizedOutput[] = normalizeResult(generation.provider_response);
  if (outputs.length === 0 && generation.hf_request_id) {
    const refreshed = await higgsfieldProvider.getStatus(generation.hf_request_id, generation.hf_status_url);
    if (refreshed.ok) outputs = normalizeResult(refreshed.data);
  }

  const usable = outputs.filter((output) => isAllowedOutputUrl(output.url));
  if (usable.length === 0) {
    await supabaseAdmin
      .from("generations")
      .update({ ingest_status: "failed", error_code: "INGEST_FAILED", error_message: "No usable output URLs returned" })
      .eq("id", generationId);
    await logEvent(generationId, "failed", { code: "INGEST_FAILED" });
    return 0;
  }

  // Deterministic paths + an existing-asset check make repeat deliveries safe:
  // a duplicate webhook can never create a second asset row.
  const { data: existing } = await supabaseAdmin
    .from("assets")
    .select("storage_path")
    .eq("generation_id", generationId);
  const existingPaths = new Set((existing ?? []).map((row) => row.storage_path));

  let created = existingPaths.size;
  for (const [index, output] of usable.entries()) {
    try {
      const response = await fetch(output.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = response.headers.get("content-type") ?? "application/octet-stream";
      const buffer = await response.arrayBuffer();
      const extension = (output.url.split("?")[0]!.split(".").pop() ?? "bin").slice(0, 5).replace(/[^a-z0-9]/gi, "");
      const scope = generation.project_id
        ? `projects/${generation.project_id}`
        : `unassigned/${generation.user_id}`;
      const path = `${scope}/outputs/${generationId}/${index}-${crypto.randomUUID()}.${extension}`;

      const upload = await supabaseAdmin.storage
        .from("generated-assets")
        .upload(path, buffer, { contentType: mime, upsert: true });
      if (upload.error) throw new Error(upload.error.message);

      const insert: Json = {
        generation_id: generationId,
        project_id: generation.project_id,
        uploaded_by: generation.user_id,
        asset_type: output.type,
        source_type: "generated",
        title: (generation.prompt ?? "Generation").slice(0, 120),
        storage_bucket: "generated-assets",
        storage_path: path,
        mime_type: mime,
        file_size: buffer.byteLength,
        metadata: { provider_url: output.url, model_path: generation.model_path },
      };
      if (output.width) insert["width"] = output.width;
      if (output.height) insert["height"] = output.height;
      if (output.durationSeconds) insert["duration_seconds"] = output.durationSeconds;

      const { error } = await supabaseAdmin.from("assets").insert(insert as never);
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
      created += 1;
    } catch (error) {
      console.error("ingest failed", { generationId, message: (error as Error).message });
    }
  }

  await supabaseAdmin
    .from("generations")
    .update({ ingest_status: created > 0 ? "completed" : "failed" })
    .eq("id", generationId);
  await logEvent(generationId, "asset_ingest_completed", { assets: created });
  return created;
}

export async function ingestPending(limit = 5): Promise<number> {
  const { data } = await supabaseAdmin
    .from("generations")
    .select("id")
    .eq("status", "completed")
    .eq("ingest_status", "pending")
    .limit(limit);
  let total = 0;
  for (const row of data ?? []) total += await ingestOutputs(row.id);
  return total;
}

/* ------------------------------------------------------------------ */
/* Recovery polling                                                    */
/* ------------------------------------------------------------------ */

export async function reconcileStaleGenerations(limit = 10): Promise<number> {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("generations")
    .select("id,hf_request_id,hf_status_url,poll_attempts,last_polled_at,submitted_at")
    .in("status", ["queued", "in_progress"])
    .not("hf_request_id", "is", null)
    .or(`last_polled_at.is.null,last_polled_at.lt.${staleBefore}`)
    .order("submitted_at", { ascending: true })
    .limit(limit);

  let checked = 0;
  for (const row of data ?? []) {
    // Exponential backoff: skip rows polled more recently than their backoff window.
    const backoffMs = Math.min(15 * 60_000, 30_000 * Math.pow(1.6, row.poll_attempts ?? 0));
    if (row.last_polled_at && Date.now() - new Date(row.last_polled_at).getTime() < backoffMs) continue;

    const call = await higgsfieldProvider.getStatus(row.hf_request_id!, row.hf_status_url);
    await supabaseAdmin
      .from("generations")
      .update({ last_polled_at: new Date().toISOString(), poll_attempts: (row.poll_attempts ?? 0) + 1 })
      .eq("id", row.id);
    checked += 1;
    if (call.ok) {
      await recordProviderHealth(true);
      await applyProviderPayload(row.id, call.data);
    } else {
      await recordProviderHealth(false, call.errorMessage);
    }
  }
  return checked;
}
