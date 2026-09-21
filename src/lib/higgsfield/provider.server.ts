/**
 * Higgsfield provider adapter.
 *
 * The rest of the application only speaks the GenerationProvider interface, so
 * a second provider can be added without touching the frontend.
 */
import { AppError } from "./errors";

export const HIGGSFIELD_BASE_URL = process.env["HF_BASE_URL"] || "https://api.higgsfield.ai";

/** Endpoint map kept in one place so provider routes are never scattered. */
export const HF_ENDPOINTS = {
  estimate: "/v1/estimate",
  submit: (modelPath: string) => `/v1/${modelPath}`,
  status: (requestId: string) => `/v1/jobs/${requestId}`,
  cancel: (requestId: string) => `/v1/jobs/${requestId}/cancel`,
  uploadUrl: "/v1/media/upload-url",
  presets: "/v1/marketing-studio/presets",
  health: "/v1/account",
};

export interface ProviderCredentials {
  keyId: string;
  keySecret: string;
}

export function getCredentials(): ProviderCredentials | null {
  const keyId = process.env["HF_KEY_ID"];
  const keySecret = process.env["HF_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
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

function classify(status: number, body: unknown): { code: string; message: string } {
  const raw = (body && typeof body === "object" ? (body as Record<string, unknown>) : {}) as Record<string, unknown>;
  const message =
    (typeof raw["message"] === "string" && raw["message"]) ||
    (typeof raw["error"] === "string" && raw["error"]) ||
    (typeof raw["detail"] === "string" && raw["detail"]) ||
    `Provider returned HTTP ${status}`;
  const lowered = String(message).toLowerCase();
  if (status === 402 || lowered.includes("insufficient") || lowered.includes("balance"))
    return { code: "INSUFFICIENT_PROVIDER_BALANCE", message };
  if (status === 429) return { code: "RATE_LIMITED", message };
  if (status === 401 || status === 403) return { code: "PROVIDER_NOT_CONFIGURED", message };
  if (status === 400 || status === 422) return { code: "INVALID_PARAMETERS", message };
  if (lowered.includes("nsfw") || lowered.includes("moderation")) return { code: "MODERATION_BLOCKED", message };
  return { code: "PROVIDER_REJECTED", message };
}

/** Single fetch wrapper: never logs credentials, always normalizes errors. */
export async function hfFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number; absoluteUrl?: string } = {},
): Promise<ProviderCall<T>> {
  const url = init.absoluteUrl ?? `${HIGGSFIELD_BASE_URL}${path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: authHeaders(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
        out.push({
          url: value,
          type: guessType(value),
          width: typeof record["width"] === "number" ? record["width"] : undefined,
          height: typeof record["height"] === "number" ? record["height"] : undefined,
          durationSeconds: typeof record["duration"] === "number" ? record["duration"] : undefined,
        });
      }
    }
    for (const key of ["results", "result", "outputs", "output", "images", "image", "videos", "video", "data", "assets"]) {
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
  for (const key of ["id", "request_id", "job_id", "jobId", "requestId", "task_id"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const nested = record["data"] ?? record["job"] ?? record["request"];
  if (nested && typeof nested === "object") return extractRequestId(nested);
  return null;
}

export function extractCost(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["cost", "cost_usd", "price", "price_usd", "estimated_cost", "estimated_cost_usd", "amount"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  for (const key of ["data", "estimate", "pricing", "result"]) {
    if (record[key] && typeof record[key] === "object") {
      const nested = extractCost(record[key]);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Provider interface                                                  */
/* ------------------------------------------------------------------ */

export interface GenerationProvider {
  id: string;
  isConfigured(): boolean;
  estimate(modelPath: string, params: Record<string, unknown>): Promise<ProviderCall<unknown>>;
  submit(
    modelPath: string,
    params: Record<string, unknown>,
    webhookUrl?: string,
  ): Promise<ProviderCall<unknown>>;
  getStatus(requestId: string, statusUrl?: string | null): Promise<ProviderCall<unknown>>;
  cancel(requestId: string, cancelUrl?: string | null): Promise<ProviderCall<unknown>>;
  uploadMedia(bytes: ArrayBuffer, mimeType: string, filename: string): Promise<string>;
  listPresets(cursor?: string): Promise<ProviderCall<unknown>>;
}

export const higgsfieldProvider: GenerationProvider = {
  id: "higgsfield",
  isConfigured: providerConfigured,

  estimate(modelPath, params) {
    return hfFetch(HF_ENDPOINTS.estimate, {
      method: "POST",
      body: { model: modelPath, model_path: modelPath, params, parameters: params },
      timeoutMs: 20_000,
    });
  },

  submit(modelPath, params, webhookUrl) {
    const body: Record<string, unknown> = { params, ...params };
    if (webhookUrl) body["webhook"] = { url: webhookUrl };
    return hfFetch(HF_ENDPOINTS.submit(modelPath), { method: "POST", body, timeoutMs: 45_000 });
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

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: bytes,
    });
    if (!put.ok) throw new AppError("UPLOAD_FAILED", `Provider upload failed (HTTP ${put.status})`);
    return publicUrl;
  },

  listPresets(cursor) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return hfFetch(`${HF_ENDPOINTS.presets}${query}`, { timeoutMs: 20_000 });
  },
};

/** Only provider result URLs are ever fetched during ingestion (SSRF guard). */
export function isAllowedOutputUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}
