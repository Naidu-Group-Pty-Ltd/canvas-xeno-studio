/**
 * Server-side generation lifecycle: submission, ingestion, dispatch, recovery.
 * Runs with the admin client because it is provider-facing work, never called
 * directly from the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "./higgsfield/errors";
import { nextRetryAt, submissionKey, transientFailure, transientRefusal } from "./higgsfield/retry";
import {
  extractCost,
  extractPricingDescription,
  extractRequestId,
  higgsfieldProvider,
  isAllowedOutputUrl,
  normalizeResult,
  normalizeStatus,
  type NormalizedOutput,
} from "./higgsfield/provider.server";
import { providerPayload, type ModelRegistryEntry } from "./model-schema";
import { meteredQuoteFor } from "./higgsfield/metered";
import { LOVABLE_PROJECT_URL } from "./app-config";

type Json = Record<string, unknown>;

export function appBaseUrl(): string {
  // The fallback is the project's stable published address. (It is keyed by the
  // Lovable project id, not the database project id, which has no app behind it.)
  return (
    process.env["PUBLIC_APP_URL"] ||
    process.env["APP_BASE_URL"] ||
    LOVABLE_PROJECT_URL
  ).replace(/\/$/, "");
}

export function webhookUrl(): string | undefined {
  // Always attach a callback URL: the stable project URL is used when no
  // explicit public URL is configured, otherwise webhooks would never arrive.
  const base = appBaseUrl();
  if (!base) return undefined;
  const token = process.env["LOVABLE_CRON_SECRET"];
  return `${base.replace(/\/$/, "")}/api/public/higgsfield-webhook${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** Generation lifecycle status -> operation status, so Activity and lineage share one vocabulary. */
const OPERATION_STATUS: Record<string, string> = {
  draft: "draft",
  estimating: "awaiting_estimate",
  ready: "ready",
  local_queued: "local_queued",
  submitting: "submitting",
  submission_uncertain: "submission_uncertain",
  queued: "provider_queued",
  in_progress: "running",
  completed: "completed",
  failed: "failed",
  nsfw: "failed",
  canceled: "canceled",
};

/**
 * Every generation is mirrored into exactly one operation record (unique on
 * generation_id) so the V2 operation graph, lineage and cost attribution stay
 * accurate without changing the V1 submission path. Mirrors are excluded from
 * the durable queue, so they can never cause a second provider request.
 */
export async function mirrorOperation(generationId: string): Promise<void> {
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select(
      "id,user_id,project_id,model_registry_id,provider,operation,status,parameters,prompt,estimated_cost_usd,actual_cost_usd,hf_request_id,hf_status_url,hf_cancel_url,client_request_id,generation_group_id,parent_generation_id,error_code,error_message,ingest_status,submitted_at,started_at,completed_at,created_at",
    )
    .eq("id", generationId)
    .maybeSingle();
  if (!generation) return;

  const status =
    generation.status === "completed" && generation.ingest_status === "pending"
      ? "processing_output"
      : (OPERATION_STATUS[generation.status] ?? "running");

  const { data: parentOperation } = generation.parent_generation_id
    ? await supabaseAdmin
        .from("operations")
        .select("id,root_operation_id")
        .eq("generation_id", generation.parent_generation_id)
        .maybeSingle()
    : { data: null };

  const row = {
    generation_id: generation.id,
    created_by: generation.user_id,
    project_id: generation.project_id,
    operation_type: generation.operation,
    provider: generation.provider,
    model_registry_id: generation.model_registry_id,
    generation_group_id: generation.generation_group_id,
    parent_operation_id: parentOperation?.id ?? null,
    root_operation_id: parentOperation?.root_operation_id ?? parentOperation?.id ?? null,
    status,
    input_payload: { prompt: generation.prompt, parameters: generation.parameters } as never,
    estimated_cost_usd: generation.estimated_cost_usd,
    actual_cost_usd: generation.actual_cost_usd,
    provider_request_id: generation.hf_request_id,
    provider_status_url: generation.hf_status_url,
    provider_cancel_url: generation.hf_cancel_url,
    dedupe_key: generation.client_request_id,
    error_code: generation.error_code,
    error_message: generation.error_message,
    submitted_at: generation.submitted_at,
    started_at: generation.started_at,
    completed_at: generation.completed_at,
  };

  // The uniqueness index is partial, so ON CONFLICT inference does not apply: read then write.
  const { data: existing } = await supabaseAdmin
    .from("operations")
    .select("id")
    .eq("generation_id", generation.id)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("operations")
      .update(row as never)
      .eq("id", existing.id);
  } else {
    const { error } = await supabaseAdmin.from("operations").insert(row as never);
    // A concurrent worker may have inserted the mirror first; that is fine.
    if (error && error.code !== "23505") throw error;
  }
}

export async function logEvent(generationId: string, eventType: string, payload: Json = {}) {
  await supabaseAdmin.from("generation_events").insert({
    generation_id: generationId,
    event_type: eventType,
    payload: payload as never,
  });
  // Keep the operation mirror and its event trail in step with the generation.
  await mirrorOperation(generationId);
  const { data: operation } = await supabaseAdmin
    .from("operations")
    .select("id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (operation) {
    await supabaseAdmin
      .from("operation_events")
      .insert({ operation_id: operation.id, event_type: eventType, payload: payload as never });
  }
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value");
  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key] = row.value;
  return settings;
}

/**
 * Whether a provider answer says anything about the provider's health. A
 * request the provider rejected for its own content (invalid settings,
 * moderation) shows the provider working, not failing.
 */
export function reflectsProviderHealth(call: { ok: boolean; errorCode?: string }): boolean {
  return call.ok || !["INVALID_PARAMETERS", "MODERATION_BLOCKED"].includes(call.errorCode ?? "");
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

/**
 * Tells the long video a generation belongs to (if any) that it reached an
 * end, so the run moves on now rather than at the next reconcile pass; and a
 * single clip made to a voiceover that it is in, so its sync is measured.
 * Never fails the caller: the reconcile job picks up anything a long video
 * misses.
 */
export async function notifyLongVideo(generationId: string): Promise<void> {
  try {
    const { advanceForGeneration } = await import("./long-video/service.server");
    await advanceForGeneration(generationId);
  } catch (error) {
    console.error("long video not moved on", {
      generationId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const { measureClipSync } = await import("./lip-sync/clip.server");
    await measureClipSync(generationId);
  } catch (error) {
    console.error("clip sync not measured", {
      generationId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Media preparation                                                   */
/* ------------------------------------------------------------------ */

/** Reference media types the provider's upload endpoint accepts. */
const PROVIDER_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "audio/wav",
  "audio/x-wav",
]);

function providerMime(mime: string): string {
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "audio/wave" || mime === "audio/vnd.wave") return "audio/wav";
  return mime;
}

/** A stored file and what it is, as the provider upload needs it. */
export interface StoredMedia {
  assetId: string | null;
  bucket: string;
  path: string;
  mimeType: string | null;
}

/**
 * How long a provider upload is reused. The provider keeps uploads only
 * temporarily, so a copy is reused for a while (a live estimate refreshing as
 * settings change, then the generation itself), never indefinitely.
 */
const UPLOAD_REUSE_MS = 30 * 60_000;

/** Uploads in flight in this worker, so overlapping estimates share one. */
const uploadsInFlight = new Map<string, Promise<string>>();

async function uploadStoredMedia(media: StoredMedia): Promise<{ url: string; mime: string }> {
  const { data: file, error } = await supabaseAdmin.storage.from(media.bucket).download(media.path);
  if (error || !file)
    throw new AppError("UPLOAD_FAILED", "Reference file could not be read from storage");
  const mime = providerMime(media.mimeType || file.type || "application/octet-stream");
  const filename = media.path.split("/").pop() ?? "reference";
  // Rejected here, before any provider call, with a reason the team can act on.
  if (!PROVIDER_UPLOAD_TYPES.has(mime)) {
    throw new AppError(
      "UPLOAD_FAILED",
      `${filename} is ${mime}, which Higgsfield does not accept as a reference. Use MP4 video, WAV audio or a JPEG, PNG, WebP or GIF image.`,
    );
  }
  const bytes = await file.arrayBuffer();
  const url = await higgsfieldProvider.uploadMedia(bytes, mime, filename.replace(/[^\w.-]/g, "_"));
  return { url, mime };
}

/**
 * The provider's URL for a stored file: a recent upload of the same file when
 * there is one, otherwise a fresh upload, remembered for reuse. The memory is
 * an optimisation only; without it (or its table) every call simply uploads.
 */
export async function providerMediaUrl(media: StoredMedia): Promise<string> {
  const assetId = media.assetId;
  if (!assetId) return (await uploadStoredMedia(media)).url;
  const key = `${assetId}:${media.bucket}/${media.path}`;
  const pending = uploadsInFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const { data: cached } = await supabaseAdmin
      .from("provider_media_uploads")
      .select("public_url,storage_bucket,storage_path,uploaded_at")
      .eq("asset_id", assetId)
      .eq("provider", "higgsfield")
      .maybeSingle();
    if (
      cached &&
      cached.storage_bucket === media.bucket &&
      cached.storage_path === media.path &&
      Date.now() - new Date(cached.uploaded_at).getTime() < UPLOAD_REUSE_MS
    )
      return cached.public_url;

    const uploaded = await uploadStoredMedia(media);
    await supabaseAdmin.from("provider_media_uploads").upsert(
      {
        asset_id: assetId,
        provider: "higgsfield",
        storage_bucket: media.bucket,
        storage_path: media.path,
        mime_type: uploaded.mime,
        public_url: uploaded.url,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "asset_id,provider" },
    );
    return uploaded.url;
  })();
  uploadsInFlight.set(key, work);
  try {
    return await work;
  } finally {
    uploadsInFlight.delete(key);
  }
}

export async function prepareMediaForGeneration(generationId: string): Promise<void> {
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("*")
    .eq("generation_id", generationId)
    .order("position");

  for (const input of inputs ?? []) {
    if (input.hf_public_url) continue; // reuse an already prepared URL
    if (!input.storage_bucket || !input.storage_path) continue;
    const declared = (input.metadata as Json)?.["mime_type"];
    const url = await providerMediaUrl({
      assetId: input.asset_id,
      bucket: input.storage_bucket,
      path: input.storage_path,
      mimeType: typeof declared === "string" ? declared : null,
    });
    await supabaseAdmin.from("generation_inputs").update({ hf_public_url: url }).eq("id", input.id);
  }
}

/** Seconds of video given as input, in all and as the source video (null without one). */
export interface InputVideo {
  seconds: number;
  sourceSeconds: number | null;
}

/**
 * The video given to a generation as input (references, a source video),
 * which metered models bill alongside what they generate. A video whose
 * length isn't recorded counts as 30 seconds, the most these models take, so
 * a quote is never low.
 */
export async function inputVideoSeconds(generationId: string): Promise<InputVideo> {
  const { data } = await supabaseAdmin
    .from("generation_inputs")
    .select("asset_id,input_type")
    .eq("generation_id", generationId);
  return videoSecondsOf(
    ((data ?? []) as { asset_id: string | null; input_type: string }[]).flatMap((row) =>
      row.asset_id ? [{ assetId: row.asset_id, role: row.input_type }] : [],
    ),
  );
}

/** The video among these inputs (see inputVideoSeconds). */
export async function videoSecondsOf(
  inputs: { assetId: string; role: string }[],
): Promise<InputVideo> {
  if (!inputs.length) return { seconds: 0, sourceSeconds: null };
  const { data } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,mime_type,duration_seconds")
    .in("id", [...new Set(inputs.map((input) => input.assetId))]);
  const lengths = new Map(
    (
      (data ?? []) as {
        id: string;
        asset_type: string | null;
        mime_type: string | null;
        duration_seconds: number | string | null;
      }[]
    )
      .filter(
        (asset) => asset.asset_type === "video" || (asset.mime_type ?? "").startsWith("video/"),
      )
      .map((asset) => {
        const seconds = Number(asset.duration_seconds);
        return [asset.id, Number.isFinite(seconds) && seconds > 0 ? seconds : 30] as const;
      }),
  );
  let seconds = 0;
  let sourceSeconds: number | null = null;
  for (const input of inputs) {
    const length = lengths.get(input.assetId);
    if (length === undefined) continue;
    seconds += length;
    if (input.role === "source") sourceSeconds = (sourceSeconds ?? 0) + length;
  }
  return { seconds, sourceSeconds };
}

/** Builds the provider payload from registry parameters plus prepared media. */
export async function buildProviderParams(
  model: ModelRegistryEntry,
  parameters: Json,
  generationId: string,
): Promise<Json> {
  const { data: inputs } = await supabaseAdmin
    .from("generation_inputs")
    .select("*")
    .eq("generation_id", generationId)
    .order("position");
  const media = (inputs ?? []).flatMap((input) =>
    input.hf_public_url ? [{ role: input.input_type as string, url: input.hf_public_url }] : [],
  );
  return providerPayload(model, parameters, media);
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

  // Atomic claim: only one caller can move this record into "submitting", so
  // two concurrent dispatch/submit paths can never POST the same job twice.
  const { data: claimed } = await supabaseAdmin
    .from("generations")
    .update({ status: "submitting", submission_started_at: new Date().toISOString() })
    .eq("id", generationId)
    .in("status", ["ready", "local_queued", "draft", "estimating"])
    .select("id");
  if (!claimed?.length) return { status: generation.status };
  await logEvent(generationId, "submission_started");

  try {
    await prepareMediaForGeneration(generationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference preparation failed";
    await supabaseAdmin
      .from("generations")
      .update({
        status: "failed",
        error_code: "UPLOAD_FAILED",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);
    await logEvent(generationId, "failed", { code: "UPLOAD_FAILED", message });
    return { status: "failed" };
  }

  const model = generation.model_registry as unknown as ModelRegistryEntry;
  const params = await buildProviderParams(
    model,
    (generation.parameters ?? {}) as Json,
    generationId,
  );

  // Authoritative estimate: requested with the SAME payload that is submitted,
  // so the stored figure always corresponds to the generation being run.
  const settings = await getSettings();
  await logEvent(generationId, "estimate_requested", { model_path: generation.model_path });
  const estimateCall = await higgsfieldProvider.estimate(generation.model_path, params);
  const serverCost = estimateCall.ok ? extractCost(estimateCall.data) : null;
  const meteredPricing = estimateCall.ok ? extractPricingDescription(estimateCall.data) : null;
  // A metered model is quoted as a rate; its price follows from the rate and
  // what is sent (resolution, length, video given as input).
  const metered =
    serverCost === null && meteredPricing
      ? meteredQuoteFor({
          description: meteredPricing,
          fields: model.parameter_schema?.fields ?? [],
          values: params as Record<string, unknown>,
          ...(await inputVideoSeconds(generationId).then((video) => ({
            inputVideoSeconds: video.seconds,
            sourceVideoSeconds: video.sourceSeconds,
          }))),
        })
      : null;
  const quoted = serverCost ?? metered?.usd ?? null;

  // Spending limits, against the authoritative figure: the record's own
  // earlier figure (the browser's, if any) is already counted, so only the
  // difference is added. Clips started by the server (long videos) and other
  // callers without a browser quote are held to the limits here too.
  // Work with no project or campaign, against its owner's monthly cap (if set).
  if (quoted !== null && !generation.project_id && !generation.campaign_id && generation.user_id) {
    const { memberAllowance } = await import("./generation-create.server");
    const verdict = await memberAllowance(
      generation.user_id,
      quoted - (Number(generation.estimated_cost_usd) || 0),
    );
    if (!verdict.allowed) {
      await supabaseAdmin
        .from("generations")
        .update({
          status: "failed",
          error_code: "BUDGET_EXCEEDED",
          error_message: verdict.message ?? "This would go over your monthly spending cap",
          estimated_cost_usd: quoted,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      await logEvent(generationId, "failed", {
        code: "BUDGET_EXCEEDED",
        estimated_cost_usd: quoted,
      });
      return { status: "failed" };
    }
  }
  if (quoted !== null && (generation.project_id || generation.campaign_id)) {
    const { data: allowance } = await supabaseAdmin.rpc("check_spend_allowance", {
      _project_id: (generation.project_id ?? null) as string,
      _campaign_id: (generation.campaign_id ?? null) as string,
      _amount: Math.max(0, quoted - (Number(generation.estimated_cost_usd) || 0)),
    });
    const verdict = (allowance ?? {}) as { allowed?: boolean; message?: string };
    if (verdict.allowed === false) {
      const message =
        verdict.message ?? "This would go over the spending limit, so nothing was submitted";
      await supabaseAdmin
        .from("generations")
        .update({
          status: "failed",
          error_code: "BUDGET_EXCEEDED",
          error_message: message,
          estimated_cost_usd: quoted,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      await logEvent(generationId, "failed", {
        code: "BUDGET_EXCEEDED",
        estimated_cost_usd: quoted,
      });
      return { status: "failed" };
    }
  }

  if (metered) {
    await supabaseAdmin
      .from("generations")
      .update({ estimated_cost_usd: metered.usd, cost_source: "metered_estimate" })
      .eq("id", generationId);
    await supabaseAdmin
      .from("usage_ledger")
      .update({ estimated_cost_usd: metered.usd })
      .eq("generation_id", generationId);
    await logEvent(generationId, "estimate_received", {
      estimated_cost_usd: metered.usd,
      metered,
      pricing_description: meteredPricing,
      provider_estimate: estimateCall.data as Json,
    });
  } else if (serverCost === null && meteredPricing) {
    // Metered, but in terms this doesn't follow: the rate is recorded as given
    // rather than a figure invented, and the submission proceeds.
    await logEvent(generationId, "estimate_received", {
      pricing_description: meteredPricing,
      provider_estimate: estimateCall.data as Json,
    });
  } else if (serverCost !== null) {
    await supabaseAdmin
      .from("generations")
      .update({ estimated_cost_usd: serverCost, cost_source: "provider_estimate" })
      .eq("id", generationId);
    await supabaseAdmin
      .from("usage_ledger")
      .update({ estimated_cost_usd: serverCost })
      .eq("generation_id", generationId);
    await logEvent(generationId, "estimate_received", {
      estimated_cost_usd: serverCost,
      provider_estimate: estimateCall.data as Json,
    });
  } else if (settings["require_cost_estimate"] === true) {
    await supabaseAdmin
      .from("generations")
      .update({
        status: "failed",
        error_code: "ESTIMATE_FAILED",
        error_message: "A valid cost estimate could not be obtained, so nothing was submitted",
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);
    await logEvent(generationId, "failed", { code: "ESTIMATE_FAILED" });
    return { status: "failed" };
  }

  // The generation's id is its idempotency key: the provider never runs one
  // generation twice, even if this request were ever repeated. An automatic
  // try after a refusal that cost nothing goes under a key of its own.
  const retries = Number((generation as { auto_retries?: unknown }).auto_retries) || 0;
  const call = await higgsfieldProvider.submit(
    generation.model_path,
    params,
    webhookUrl(),
    submissionKey(generationId, retries),
  );

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

  // Turned away for the moment (rate limited, a model briefly unavailable):
  // nothing ran or was charged, so it goes back in the queue to try again.
  if (
    transientRefusal({ code: call.errorCode, message: call.errorMessage, status: call.status }) &&
    (await requeueForRetry(generationId, retries, call.errorMessage ?? "Turned away for now", [
      "submitting",
    ]))
  )
    return { status: "local_queued" };

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
  if (reflectsProviderHealth(call)) await recordProviderHealth(false, call.errorMessage);
  return { status: "failed" };
}

/**
 * Puts a generation that cost nothing back in the local queue, to be sent
 * again after a wait (see ./higgsfield/retry), while it is still in one of
 * `from`. False when its tries are spent, it moved on meanwhile, or the
 * database can't hold retries yet (it then fails as before).
 */
async function requeueForRetry(
  generationId: string,
  retries: number,
  reason: string,
  from: string[],
): Promise<boolean> {
  const at = nextRetryAt(retries);
  if (!at) return false;
  const { data, error } = await supabaseAdmin
    .from("generations")
    .update({
      status: "local_queued",
      auto_retries: retries + 1,
      retry_after: at.toISOString(),
      hf_request_id: null,
      hf_status_url: null,
      hf_cancel_url: null,
      submitted_at: null,
      completed_at: null,
      error_code: null,
      error_message: `Higgsfield said: ${reason.slice(0, 300)}. Trying again on its own (${retries + 1} of 3); nothing was charged.`,
    } as never)
    .eq("id", generationId)
    .in("status", from as never)
    .select("id");
  if (error || !data?.length) return false;
  await logEvent(generationId, "auto_retry_scheduled", {
    retry: retries + 1,
    retry_after: at.toISOString(),
    reason: reason.slice(0, 300),
  });
  return true;
}

/** Either submits immediately or parks the job in the local FIFO queue. */
export async function submitOrQueue(generationId: string): Promise<{ status: string }> {
  const settings = await getSettings();
  const limit = Number(settings["max_provider_concurrency"] ?? 15);
  if ((await activeProviderCount()) >= limit) {
    await supabaseAdmin
      .from("generations")
      .update({ status: "local_queued" })
      .eq("id", generationId);
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

  // Jobs whose wait before another try (see requeueForRetry) is over; a
  // database without retries has no waits.
  const queued = () =>
    supabaseAdmin
      .from("generations")
      .select("id")
      .eq("status", "local_queued")
      .order("created_at", { ascending: true })
      .limit(slots);
  const due = await queued().or(`retry_after.is.null,retry_after.lte.${new Date().toISOString()}`);
  const { data: waiting } = due.error ? await queued() : due;

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

const TERMINAL_STATUSES = ["completed", "failed", "nsfw", "canceled"];

export async function applyProviderPayload(
  generationId: string,
  payload: unknown,
): Promise<string> {
  const record = (payload ?? {}) as Json;
  const statusValue =
    record["status"] ??
    record["state"] ??
    (record["job"] as Json | undefined)?.["status"] ??
    "queued";
  const status = normalizeStatus(statusValue);

  const { data: current } = await supabaseAdmin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (!current) return "missing";
  if (TERMINAL_STATUSES.includes(current.status)) return current.status; // idempotent

  // Failed for the moment at the provider (and so refunded): queued again to
  // try again on its own, rather than failed, while its tries last.
  if (status === "failed") {
    const reason =
      (typeof record["error"] === "string" && record["error"]) ||
      (typeof record["message"] === "string" && record["message"]) ||
      "";
    if (
      transientFailure(reason) &&
      (await requeueForRetry(
        generationId,
        Number((current as { auto_retries?: unknown }).auto_retries) || 0,
        reason,
        ["queued", "in_progress"],
      ))
    )
      return "local_queued";
  }

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

  // Overlapping deliveries of the same result can both pass the check above;
  // only the first may apply it. A second write would reset a save that is
  // already running back to "pending" and start it twice.
  const { data: applied } = await supabaseAdmin
    .from("generations")
    .update(update as never)
    .eq("id", generationId)
    .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
    .select("id");
  if (!applied?.length) {
    const { data: latest } = await supabaseAdmin
      .from("generations")
      .select("status")
      .eq("id", generationId)
      .maybeSingle();
    return latest?.status ?? current.status;
  }
  await logEvent(generationId, status, { provider_status: statusValue });
  if (status === "failed" || status === "nsfw" || status === "canceled")
    await notifyLongVideo(generationId);

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

/** A save still "processing" after this long was interrupted and may be retried. */
const INGEST_STALE_MS = 10 * 60_000;
/** Automatic retries of a failed save; a person can still retry from the UI. */
const MAX_AUTO_INGEST_ATTEMPTS = 3;

/** Stamped on a failed save once its automatic attempts are used up; only a person retries it then. */
const INGEST_EXHAUSTED = "INGEST_RETRIES_EXHAUSTED";

/**
 * Failed saves automatic retries may still pick up, plus any interrupted save
 * (an interrupted save is always reconsidered, so it can never stay
 * "processing"; if its attempts are used up the scan stamps it exhausted).
 */
function retryableIngestFilter(): string {
  const staleBefore = new Date(Date.now() - INGEST_STALE_MS).toISOString();
  const notExhausted = `or(error_code.is.null,error_code.neq.${INGEST_EXHAUSTED})`;
  return [
    `and(ingest_status.eq.failed,${notExhausted})`,
    `and(ingest_status.eq.processing,updated_at.lt.${staleBefore})`,
  ].join(",");
}

/** Saves that may be (re)started: never started, failed, or interrupted mid-way. */
function claimableIngestFilter(): string {
  const staleBefore = new Date(Date.now() - INGEST_STALE_MS).toISOString();
  return `ingest_status.in.(pending,failed),and(ingest_status.eq.processing,updated_at.lt.${staleBefore})`;
}

/**
 * Atomically claims a completed generation's outputs for saving. The webhook,
 * the reconcile job and a manual retry can all race here; only one wins, so an
 * output is never fetched and stored twice at the same time. Returns the
 * claim's updated_at (stamped by the row trigger) as a fencing token, or null.
 * The previous save error (including an exhausted stamp) is cleared, so an
 * interrupted attempt is recovered like any other.
 */
async function claimIngest(
  generationId: string,
  options: { freshOnly?: boolean; expectVersion?: string },
): Promise<string | null> {
  let query = supabaseAdmin
    .from("generations")
    .update({ ingest_status: "processing", error_code: null, error_message: null })
    .eq("id", generationId)
    .eq("status", "completed");
  // The row must be exactly as it was when its attempts were counted; any
  // change in between (another worker's attempt) voids this claim.
  if (options.expectVersion) query = query.eq("updated_at", options.expectVersion);
  const { data } = await (
    options.freshOnly ? query.eq("ingest_status", "pending") : query.or(claimableIngestFilter())
  ).select("updated_at");
  return data?.[0]?.updated_at ?? null;
}

/**
 * Saves a completed generation's outputs to the library. `freshOnly` limits it
 * to a save nobody has attempted yet: provider deliveries use it, so repeated
 * webhooks never spend retries; retries belong to the reconcile job's budget
 * and to people.
 */
export async function ingestOutputs(
  generationId: string,
  options: { freshOnly?: boolean; expectVersion?: string } = {},
): Promise<number> {
  const claim = await claimIngest(generationId, options);
  if (!claim) return 0;
  const { data: generation } = await supabaseAdmin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (!generation) return 0;
  await logEvent(generationId, "asset_ingest_started");
  // Results are written only while this worker still holds the claim, so a
  // worker that outlived its claim can never overwrite a newer outcome.
  const finish = (values: Json) =>
    supabaseAdmin
      .from("generations")
      .update(values as never)
      .eq("id", generationId)
      .eq("updated_at", claim);

  let outputs: NormalizedOutput[] = normalizeResult(generation.provider_response);
  if (outputs.length === 0 && generation.hf_request_id) {
    const refreshed = await higgsfieldProvider.getStatus(
      generation.hf_request_id,
      generation.hf_status_url,
    );
    if (refreshed.ok) outputs = normalizeResult(refreshed.data);
  }

  const usable = outputs.filter((output) => isAllowedOutputUrl(output.url));
  if (usable.length === 0) {
    await finish({
      ingest_status: "failed",
      error_code: "INGEST_FAILED",
      error_message: "No usable output URLs returned",
    });
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
  let failures = 0;
  for (const [index, output] of usable.entries()) {
    try {
      const extension = (output.url.split("?")[0]!.split(".").pop() ?? "bin")
        .slice(0, 5)
        .replace(/[^a-z0-9]/gi, "");
      const scope = generation.project_id
        ? `projects/${generation.project_id}`
        : `unassigned/${generation.user_id}`;
      const path = `${scope}/outputs/${generationId}/${index}.${extension || "bin"}`;
      if (existingPaths.has(path)) continue;

      const response = await fetch(output.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = response.headers.get("content-type") ?? "application/octet-stream";
      const buffer = await response.arrayBuffer();

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
      failures += 1;
      console.error("ingest failed", { generationId, message: (error as Error).message });
    }
  }

  // A partially ingested generation stays "failed" so reconciliation retries it
  // instead of quietly leaving an output only on the provider's servers.
  const complete = failures === 0 && created > 0;
  await finish({
    ingest_status: complete ? "completed" : "failed",
    // A successful retry clears the earlier save error.
    ...(complete
      ? { error_code: null, error_message: null }
      : {
          error_code: "INGEST_FAILED",
          error_message: "Some outputs could not be saved to storage",
        }),
  });
  await logEvent(generationId, complete ? "asset_ingest_completed" : "failed", {
    assets: created,
    failures,
    code: complete ? undefined : "INGEST_FAILED",
  });
  if (complete) {
    await notifyLongVideo(generationId);
    // Its videos measured exactly (the provider gives the length asked for).
    const { measureGeneratedAssets } = await import("./media/measure-asset.server");
    await measureGeneratedAssets(generationId).catch((error: unknown) => {
      console.error("generated media not measured", {
        generationId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return created;
}

/** Save attempts per generation, counted from their "asset_ingest_started" events. */
async function ingestAttempts(generationIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!generationIds.length) return counts;
  const { data } = await supabaseAdmin
    .from("generation_events")
    .select("generation_id")
    .in("generation_id", generationIds)
    .eq("event_type", "asset_ingest_started")
    .limit(5000);
  for (const row of data ?? [])
    counts.set(row.generation_id, (counts.get(row.generation_id) ?? 0) + 1);
  return counts;
}

/** Retry candidates are scanned in pages; the per-run bound only limits work per tick. */
const RETRY_SCAN_PAGE = 50;
const RETRY_SCAN_MAX = 1000;

/**
 * Saves outputs nobody has saved yet (oldest first), then retries failed or
 * interrupted saves a limited number of times (most recent first).
 */
export async function ingestPending(limit = 5): Promise<number> {
  const { data: pending } = await supabaseAdmin
    .from("generations")
    .select("id,updated_at")
    .eq("status", "completed")
    .eq("ingest_status", "pending")
    .order("completed_at", { ascending: true })
    .limit(limit);
  // Each pick carries the row version its attempt count was based on, so an
  // overlapping run that already used an attempt can never push it past the budget.
  const picks = (pending ?? []).map((row) => ({ id: row.id, version: row.updated_at }));

  // Exhausted saves found here are stamped so every later scan excludes them in
  // the query itself: each is skipped at most once, so none can crowd out an
  // older save that still has attempts left. Stamped rows leave the result set,
  // so the next page starts after the rows that remain.
  let kept = 0;
  for (let scanned = 0; picks.length < limit && scanned < RETRY_SCAN_MAX;) {
    const { data: page } = await supabaseAdmin
      .from("generations")
      .select("id,updated_at")
      .eq("status", "completed")
      .or(retryableIngestFilter())
      .order("updated_at", { ascending: false })
      .order("id")
      .range(kept, kept + RETRY_SCAN_PAGE - 1);
    if (!page?.length) break;
    scanned += page.length;
    const attempts = await ingestAttempts(page.map((row) => row.id));
    const exhausted: string[] = [];
    for (const row of page) {
      if ((attempts.get(row.id) ?? 0) >= MAX_AUTO_INGEST_ATTEMPTS) exhausted.push(row.id);
      else {
        kept += 1;
        if (picks.length < limit) picks.push({ id: row.id, version: row.updated_at });
      }
    }
    if (exhausted.length)
      await supabaseAdmin
        .from("generations")
        .update({
          ingest_status: "failed",
          error_code: INGEST_EXHAUSTED,
          error_message: "Saving to the library failed 3 times. Use Retry to try again.",
        })
        .in("id", exhausted)
        .or(retryableIngestFilter());
    if (page.length < RETRY_SCAN_PAGE) break;
  }

  let total = 0;
  for (const pick of picks) total += await ingestOutputs(pick.id, { expectVersion: pick.version });
  return total;
}

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * The runtime's waitUntil for this request, or null where there is none.
 *
 * On Cloudflare, nitro's module runtime copies the execution context's
 * waitUntil onto the incoming Request (`request.waitUntil`, and the context
 * itself onto `request.runtime.cloudflare.context`) before routing, and that
 * same Request object reaches server route handlers. Local dev has neither.
 */
function waitUntilFor(request: Request): WaitUntil | null {
  const carrier = request as Request & {
    waitUntil?: WaitUntil;
    runtime?: { cloudflare?: { context?: { waitUntil?: WaitUntil } } };
  };
  if (typeof carrier.waitUntil === "function") return carrier.waitUntil.bind(carrier);
  const context = carrier.runtime?.cloudflare?.context;
  if (typeof context?.waitUntil === "function") return context.waitUntil.bind(context);
  return null;
}

/**
 * Runs work after the HTTP response when the runtime can keep the request
 * alive, otherwise before responding. Failures are logged, never thrown.
 * Cloudflare gives such work about 30 s after the response.
 */
export async function runAfterResponse(
  request: Request,
  work: () => Promise<unknown>,
): Promise<void> {
  const task = work().then(
    () => undefined,
    (error: unknown) => {
      console.error("background task failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
  const waitUntil = waitUntilFor(request);
  if (waitUntil) waitUntil(task);
  else await task;
}

/**
 * Runs work while the caller waits for it, with no time cap while the caller
 * stays connected. The work is also registered with the runtime's waitUntil:
 * a caller that hangs up first (an HTTP client timeout) would otherwise
 * cancel it with the request, whereas this gives it about 30 s more to
 * finish. Failures reach the caller.
 */
export async function runWhileConnected<T>(request: Request, work: () => Promise<T>): Promise<T> {
  const task = work();
  waitUntilFor(request)?.(task.catch(() => undefined));
  return task;
}

/* ------------------------------------------------------------------ */
/* Recovery polling                                                    */
/* ------------------------------------------------------------------ */

export async function reconcileStaleGenerations(limit = 10): Promise<number> {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();

  // A record left in "submitting" (crashed worker, dropped connection) is
  // ambiguous: it may already be running and charging. It becomes
  // submission_uncertain and waits for a human decision — never auto-retried.
  const stuckBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuck } = await supabaseAdmin
    .from("generations")
    .select("id")
    .eq("status", "submitting")
    .lt("submission_started_at", stuckBefore)
    .limit(limit);
  for (const row of stuck ?? []) {
    await supabaseAdmin
      .from("generations")
      .update({
        status: "submission_uncertain",
        error_code: "SUBMISSION_UNCERTAIN",
        error_message: "Submission did not complete and its provider outcome is unknown",
      })
      .eq("id", row.id)
      .eq("status", "submitting");
    await logEvent(row.id, "submission_uncertain", { reason: "stuck_submitting" });
  }

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
    if (row.last_polled_at && Date.now() - new Date(row.last_polled_at).getTime() < backoffMs)
      continue;

    const call = await higgsfieldProvider.getStatus(row.hf_request_id!, row.hf_status_url);
    await supabaseAdmin
      .from("generations")
      .update({
        last_polled_at: new Date().toISOString(),
        poll_attempts: (row.poll_attempts ?? 0) + 1,
      })
      .eq("id", row.id);
    checked += 1;
    if (call.ok) {
      await recordProviderHealth(true);
      await applyProviderPayload(row.id, call.data);
    } else {
      await recordProviderHealth(false, call.errorMessage);
      const attempts = (row.poll_attempts ?? 0) + 1;
      const unknownJob = call.status === 404;
      const exhausted = attempts >= 40; // ~several hours with backoff
      // A job the provider no longer recognises, or one that never resolves, is
      // closed out with a readable reason instead of hanging in the list forever.
      if (unknownJob || exhausted) {
        await supabaseAdmin
          .from("generations")
          .update({
            status: "failed",
            error_code: unknownJob ? "PROVIDER_REJECTED" : "PROVIDER_TIMEOUT",
            error_message: unknownJob
              ? "The provider no longer recognises this request. Retry it as a new generation."
              : "The provider never reported a result for this request. Retry it as a new generation.",
            completed_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .in("status", ["queued", "in_progress"]);
        await logEvent(row.id, "failed", {
          reason: unknownJob ? "provider_unknown_request" : "poll_exhausted",
          poll_attempts: attempts,
        });
      }
    }
  }
  return checked;
}
