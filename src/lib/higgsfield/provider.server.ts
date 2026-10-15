/**
 * Higgsfield provider adapter.
 *
 * The rest of the application only speaks the GenerationProvider interface, so
 * a second provider can be added without touching the frontend.
 */
import type { SoulVersion } from "../characters/model";
import { AppError } from "./errors";

export const HIGGSFIELD_BASE_URL = process.env["HF_BASE_URL"] || "https://api.higgsfield.ai";

/**
 * Endpoint map kept in one place so provider routes are never scattered.
 * Verified against the live API: model paths are posted at the API root, and
 * estimates use the same path behind /estimate.
 */
export const HF_ENDPOINTS = {
  estimate: (modelPath: string) => `/estimate/${modelPath}`,
  submit: (modelPath: string) => `/${modelPath}`,
  status: (requestId: string) => `/requests/${requestId}/status`,
  cancel: (requestId: string) => `/requests/${requestId}/cancel`,
  uploadUrl: "/files/generate-upload-url",
  /** Cheapest authenticated call available: an estimate charges nothing. */
  health: "/estimate/higgsfield-ai/soul/v2/standard",
  /** Soul ID: training a reusable character reference, then reading how it's going. */
  customReferences: "/v1/custom-references",
  customReference: (id: string) => `/v1/custom-references/${encodeURIComponent(id)}`,
};

/**
 * Live preset catalogues, by the source a registry preset control names.
 * Marketing Studio pages through its catalogue; Genjutsu returns it whole.
 */
export const PRESET_SOURCES = {
  "marketing-studio": { path: "/marketing-studio/image/presets", paged: true },
  "genjutsu-restyle": { path: "/models/higgsfield/genjutsu/restyle/v1.0/presets", paged: false },
} as const;

export type PresetSource = keyof typeof PRESET_SOURCES;

export interface ProviderCredentials {
  keyId: string;
  keySecret: string;
}

/**
 * Credentials are tolerated in either shape: a bare secret, or the combined
 * "keyId:secret" pair that the provider console offers as a single copy button.
 */
export function getCredentials(): ProviderCredentials | null {
  const keyId = process.env["HF_KEY_ID"]?.trim();
  const rawSecret = process.env["HF_KEY_SECRET"]?.trim();
  if (!keyId || !rawSecret) return null;
  const keySecret = rawSecret.includes(":") ? rawSecret.slice(rawSecret.lastIndexOf(":") + 1) : rawSecret;
  if (!keySecret) return null;
  return { keyId: keyId.includes(":") ? keyId.slice(0, keyId.indexOf(":")) : keyId, keySecret };
}

export function providerConfigured(): boolean {
  return getCredentials() !== null;
}

function authHeaders(): Record<string, string> {
  const creds = getCredentials();
  if (!creds) throw new AppError("PROVIDER_NOT_CONFIGURED");
  return {
    Authorization: `Key ${creds.keyId}:${creds.keySecret}`,
    "Content-Type": "application/json",
  };
}

export interface ProviderCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  raw: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
  uncertain?: boolean;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The API's error detail as one readable line. Validation errors arrive as a
 * list of `{ loc, msg }` entries; each is shown with the field it names.
 */
function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return null;
  const parts = detail
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text =
        typeof record["msg"] === "string"
          ? record["msg"]
          : typeof record["message"] === "string"
            ? record["message"]
            : null;
      if (!text) return null;
      const field = Array.isArray(record["loc"])
        ? record["loc"].filter((part) => part !== "body").join(".")
        : "";
      return field ? `${field}: ${text}` : text;
    })
    .filter((part): part is string => !!part);
  return parts.length ? parts.slice(0, 3).join("; ") : null;
}

export function classify(status: number, body: unknown): { code: string; message: string } {
  const raw = (body && typeof body === "object" ? (body as Record<string, unknown>) : {}) as Record<string, unknown>;
  const message =
    (typeof raw["message"] === "string" && raw["message"]) ||
    (typeof raw["error"] === "string" && raw["error"]) ||
    detailMessage(raw["detail"]) ||
    `Provider returned HTTP ${status}`;
  const lowered = String(message).toLowerCase();
  // Higgsfield answers 403 when the account doesn't have the credits for a request.
  if (
    status === 402 ||
    status === 403 ||
    lowered.includes("not_enough_credits") ||
    lowered.includes("not enough credits") ||
    lowered.includes("insufficient") ||
    lowered.includes("balance")
  )
    return { code: "INSUFFICIENT_PROVIDER_BALANCE", message };
  if (status === 429) return { code: "RATE_LIMITED", message };
  if (status === 401) return { code: "PROVIDER_NOT_CONFIGURED", message };
  if (lowered.includes("nsfw") || lowered.includes("moderation")) return { code: "MODERATION_BLOCKED", message };
  // The account's concurrent-generation limit is reported as a 400.
  if (status === 400 && lowered.includes("concurren")) return { code: "RATE_LIMITED", message };
  if (status === 400 || status === 422) return { code: "INVALID_PARAMETERS", message };
  if (status === 404 || status === 423 || status === 503)
    return { code: "PROVIDER_REJECTED", message: `${message} (model unavailable for this account)` };
  return { code: "PROVIDER_REJECTED", message };
}

/** Single fetch wrapper: never logs credentials, always normalizes errors. */
export async function hfFetch<T = unknown>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    absoluteUrl?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ProviderCall<T>> {
  const url = init.absoluteUrl ?? `${HIGGSFIELD_BASE_URL}${path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { ...authHeaders(), ...(init.headers ?? {}) },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const raw = await response.text();
    const data = safeJson(raw);
    const durationMs = Date.now() - started;
    if (!response.ok) {
      const { code, message } = classify(response.status, data);
      console.log(
        JSON.stringify({ provider: "higgsfield", path, http: response.status, code, durationMs }),
      );
      return { ok: false, status: response.status, data: null, raw, errorCode: code, errorMessage: message, durationMs };
    }
    console.log(JSON.stringify({ provider: "higgsfield", path, http: response.status, durationMs }));
    return { ok: true, status: response.status, data: data as T, raw, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      raw: "",
      errorCode: aborted ? "PROVIDER_TIMEOUT" : "PROVIDER_TIMEOUT",
      errorMessage: aborted ? "Provider request timed out" : "Provider request failed to complete",
      durationMs,
      uncertain: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Normalization helpers                                               */
/* ------------------------------------------------------------------ */

export type NormalizedStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export function normalizeStatus(value: unknown): NormalizedStatus {
  const v = String(value ?? "").toLowerCase();
  if (["completed", "complete", "succeeded", "success", "done"].includes(v)) return "completed";
  if (["failed", "error", "failure"].includes(v)) return "failed";
  if (["nsfw", "moderated", "blocked", "content_moderated"].includes(v)) return "nsfw";
  if (["canceled", "cancelled", "aborted"].includes(v)) return "canceled";
  if (["in_progress", "processing", "running", "started"].includes(v)) return "in_progress";
  return "queued";
}

export interface NormalizedOutput {
  url: string;
  type: "image" | "video" | "audio";
  width?: number;
  height?: number;
  durationSeconds?: number;
}

function guessType(url: string): "image" | "video" | "audio" {
  const clean = url.split("?")[0]!.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(clean)) return "video";
  if (/\.(wav|mp3|m4a|aac|ogg)$/.test(clean)) return "audio";
  return "image";
}

function collectUrls(node: unknown, out: NormalizedOutput[], depth = 0) {
  if (!node || depth > 6) return;
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push({ url: node, type: guessType(node) });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectUrls(item, out, depth + 1));
    return;
  }
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    for (const key of ["url", "video_url", "image_url", "audio_url", "output_url", "signed_url"]) {
      const value = record[key];
      if (typeof value === "string" && /^https?:\/\//.test(value)) {
        const entry: NormalizedOutput = { url: value, type: guessType(value) };
        if (typeof record["width"] === "number") entry.width = record["width"];
        if (typeof record["height"] === "number") entry.height = record["height"];
        if (typeof record["duration"] === "number") entry.durationSeconds = record["duration"];
        out.push(entry);
      }
    }
    for (const key of [
      "payload",
      "results",
      "result",
      "outputs",
      "output",
      "images",
      "image",
      "videos",
      "video",
      "audios",
      "audio",
      "data",
      "assets",
    ]) {
      if (key in record) collectUrls(record[key], out, depth + 1);
    }
  }
}

/** Provider results differ per model family; flatten them into a single shape. */
export function normalizeResult(payload: unknown): NormalizedOutput[] {
  const found: NormalizedOutput[] = [];
  collectUrls(payload, found);
  const seen = new Set<string>();
  return found.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
}

export function extractRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["request_id", "requestId", "job_id", "jobId", "task_id", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const nested = record["data"] ?? record["job"] ?? record["request"];
  if (nested && typeof nested === "object") return extractRequestId(nested);
  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function extractCost(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of [
    "usd",
    "cost",
    "cost_usd",
    "price",
    "price_usd",
    "estimated_cost",
    "estimated_cost_usd",
    "amount",
  ]) {
    const gross = numeric(record[key]);
    if (gross === null) continue;
    // Account discounts are returned separately; the figure shown to the team
    // must be what the account is actually charged.
    const discount = record["discount"];
    const off = discount && typeof discount === "object" ? numeric((discount as Record<string, unknown>)["usd"]) : null;
    const net = off !== null ? gross - off : gross;
    return net > 0 ? Number(net.toFixed(4)) : 0;
  }
  for (const key of ["data", "estimate", "pricing", "result"]) {
    if (record[key] && typeof record[key] === "object") {
      const nested = extractCost(record[key]);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/**
 * Some models are metered rather than quoted (per second, per token). For those
 * the provider answers with a pricing description instead of a figure, which is
 * shown verbatim rather than guessed at.
 */
export function extractPricingDescription(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const value = record["pricing_description"];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/* ------------------------------------------------------------------ */
/* Provider interface                                                  */
/* ------------------------------------------------------------------ */

export interface GenerationProvider {
  id: string;
  isConfigured(): boolean;
  estimate(modelPath: string, params: Record<string, unknown>): Promise<ProviderCall<unknown>>;
  /**
   * `idempotencyKey` identifies one intended generation: the provider answers a
   * repeat of the same request under the same key with the original request
   * instead of starting (and charging for) another.
   */
  submit(
    modelPath: string,
    params: Record<string, unknown>,
    webhookUrl?: string,
    idempotencyKey?: string,
  ): Promise<ProviderCall<unknown>>;
  getStatus(requestId: string, statusUrl?: string | null): Promise<ProviderCall<unknown>>;
  cancel(requestId: string, cancelUrl?: string | null): Promise<ProviderCall<unknown>>;
  uploadMedia(bytes: ArrayBuffer, mimeType: string, filename: string): Promise<string>;
  listPresets(source: PresetSource, cursor?: string): Promise<ProviderCall<unknown>>;
}

export const higgsfieldProvider: GenerationProvider = {
  id: "higgsfield",
  isConfigured: providerConfigured,

  estimate(modelPath, params) {
    // The estimate endpoint takes exactly the generation body.
    return hfFetch(HF_ENDPOINTS.estimate(modelPath), {
      method: "POST",
      body: params,
      timeoutMs: 20_000,
    });
  },

  submit(modelPath, params, webhookUrl, idempotencyKey) {
    // Webhooks are configured through the hf_webhook query parameter.
    const query = webhookUrl ? `?hf_webhook=${encodeURIComponent(webhookUrl)}` : "";
    return hfFetch(`${HF_ENDPOINTS.submit(modelPath)}${query}`, {
      method: "POST",
      body: params,
      timeoutMs: 45_000,
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
    });
  },


  getStatus(requestId, statusUrl) {
    return statusUrl
      ? hfFetch("", { absoluteUrl: statusUrl, timeoutMs: 20_000 })
      : hfFetch(HF_ENDPOINTS.status(requestId), { timeoutMs: 20_000 });
  },

  cancel(requestId, cancelUrl) {
    return cancelUrl
      ? hfFetch("", { absoluteUrl: cancelUrl, method: "POST", timeoutMs: 20_000 })
      : hfFetch(HF_ENDPOINTS.cancel(requestId), { method: "POST", timeoutMs: 20_000 });
  },

  async uploadMedia(bytes, mimeType, filename) {
    const created = await hfFetch<Record<string, unknown>>(HF_ENDPOINTS.uploadUrl, {
      method: "POST",
      body: { filename, content_type: mimeType },
      timeoutMs: 20_000,
    });
    if (!created.ok || !created.data) throw new AppError("UPLOAD_FAILED", created.errorMessage ?? undefined);

    const data = created.data;
    const uploadUrl =
      (data["upload_url"] as string) || (data["url"] as string) || (data["presigned_url"] as string);
    const publicUrl =
      (data["public_url"] as string) ||
      (data["file_url"] as string) ||
      (data["download_url"] as string) ||
      (typeof uploadUrl === "string" ? uploadUrl.split("?")[0]! : "");

    if (!uploadUrl) throw new AppError("UPLOAD_FAILED", "Provider did not return an upload destination");

    // Every header the provider returns must be replayed on the presigned PUT,
    // and provider credentials must never be sent to the storage host.
    const headers: Record<string, string> = { "Content-Type": mimeType };
    const provided = data["upload_headers"];
    if (provided && typeof provided === "object") {
      for (const [key, value] of Object.entries(provided as Record<string, unknown>)) {
        if (typeof value === "string") headers[key] = value;
      }
    }

    const put = await fetch(uploadUrl, { method: "PUT", headers, body: bytes });
    if (!put.ok) throw new AppError("UPLOAD_FAILED", `Provider upload failed (HTTP ${put.status})`);
    return publicUrl;
  },


  listPresets(source, cursor) {
    const { path, paged } = PRESET_SOURCES[source];
    const query = paged ? `?size=50&cursor=${encodeURIComponent(cursor ?? "0")}` : "";
    return hfFetch(`${path}${query}`, { timeoutMs: 20_000 });
  },
};

/* ------------------------------------------------------------------ */
/* Soul ID: trained character references                               */
/* ------------------------------------------------------------------ */

/** Where a character reference's training stands. */
export type SoulTrainingState = "training" | "ready" | "failed";

export interface CustomReference {
  id: string;
  state: SoulTrainingState;
  /** The provider's own word for it (not_ready, queued, in_progress, completed, failed). */
  status: string;
  /** Why it failed, when the provider says. */
  message: string | null;
}

/** A character reference as the provider reports it; null when the answer has no id. */
export function readCustomReference(payload: unknown): CustomReference | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = record["data"];
  if (typeof record["id"] !== "string" && nested && typeof nested === "object")
    return readCustomReference(nested);
  const id = typeof record["id"] === "string" ? record["id"] : null;
  if (!id) return null;
  const status = String(record["status"] ?? "").toLowerCase();
  const state: SoulTrainingState =
    status === "completed" ? "ready" : status === "failed" ? "failed" : "training";
  const message =
    (typeof record["error"] === "string" && record["error"]) ||
    (typeof record["error_message"] === "string" && record["error_message"]) ||
    (typeof record["message"] === "string" && record["message"]) ||
    null;
  return { id, state, status: status || "queued", message };
}

/**
 * Starts training a Soul ID character reference from public image URLs
 * (POST /v1/custom-references). Billed by Higgsfield; the idempotency key
 * makes a repeat of the same request return the first instead of training
 * (and charging) twice, where the API honours it.
 */
export function createCustomReference(
  input: { name: string; modelVersion: SoulVersion; imageUrls: string[] },
  idempotencyKey: string,
): Promise<ProviderCall<unknown>> {
  return hfFetch(HF_ENDPOINTS.customReferences, {
    method: "POST",
    body: {
      name: input.name.slice(0, 100),
      model_version: input.modelVersion,
      input_images: input.imageUrls.map((url) => ({ type: "image_url", image_url: url })),
    },
    timeoutMs: 60_000,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** How a character reference's training is going (GET /v1/custom-references/{id}). */
export function getCustomReference(id: string): Promise<ProviderCall<unknown>> {
  return hfFetch(HF_ENDPOINTS.customReference(id), { timeoutMs: 20_000 });
}

/**
 * Cheap authenticated round-trip used for the provider health indicator.
 * An estimate never charges the account.
 */
export async function providerHealthCheck(): Promise<ProviderCall<unknown>> {
  return hfFetch(HF_ENDPOINTS.health, {
    method: "POST",
    body: { prompt: "health check" },
    timeoutMs: 15_000,
  });
}

/**
 * Only result URLs on the provider's own delivery hosts are ever fetched during
 * ingestion, so a forged webhook cannot make the server fetch an arbitrary
 * address (SSRF guard).
 */
const OUTPUT_HOST_SUFFIXES = ["higgsfield.ai", "cloudfront.net", "amazonaws.com"];

export function isAllowedOutputUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return OUTPUT_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}
