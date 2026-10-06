/**
 * Media worker transport.
 *
 * The worker is a separate, stateless rendering service. This module is the
 * only place that talks to it: requests are HMAC-signed, callbacks are verified
 * with the same scheme, and the shared secret never leaves the server.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface MediaWorkerSource {
  role: string;
  url: string;
  mime?: string | null;
}

export interface MediaWorkerUpload {
  url: string;
  method?: "PUT" | "POST";
  storage_key?: string;
  headers?: Record<string, string>;
}

export interface MediaWorkerTask {
  task_id: string;
  task_type: string;
  sources: MediaWorkerSource[];
  uploads: MediaWorkerUpload[];
  params: Record<string, unknown>;
  callback: { url: string };
  /** Ask for best-effort progress reports while the task renders. */
  report_progress?: boolean;
  /** Where the worker gets the URLs re-signed if they age in its queue. */
  credentials_url?: string;
  /** When the signed URLs sent with the task stop working. */
  credentials_expire_at?: string;
}

const SIGNATURE_WINDOW_SECONDS = 300;

function secret(): string {
  return process.env["MEDIA_WORKER_SHARED_SECRET"] ?? "";
}

function baseUrl(): string {
  return (process.env["MEDIA_WORKER_URL"] ?? "").replace(/\/$/, "");
}

export function mediaWorkerConfigured(): boolean {
  return Boolean(baseUrl() && secret().length >= 16);
}

export function signPayload(rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret()).update(`${timestamp}.${rawBody}`).digest("hex");
  return { timestamp: String(timestamp), signature: `sha256=${digest}` };
}

/** Verifies a callback coming back from the worker. */
export function verifyWorkerSignature(rawBody: string, timestampHeader: string | null, signatureHeader: string | null) {
  if (!secret()) return { ok: false, reason: "not configured" };
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing signature" };

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, reason: "stale signature" };
  }

  const expected = Buffer.from(signPayload(rawBody, timestamp).signature);
  const received = Buffer.from(signatureHeader);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true as const };
}

export interface WorkerCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: string }): Promise<WorkerCall<T>> {
  if (!mediaWorkerConfigured()) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorCode: "MEDIA_WORKER_NOT_CONFIGURED",
      errorMessage: "The media service is not configured — add MEDIA_WORKER_URL and MEDIA_WORKER_SHARED_SECRET.",
      durationMs: 0,
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (init.body) {
      const signed = signPayload(init.body);
      headers["x-xeno-timestamp"] = signed.timestamp;
      headers["x-xeno-signature"] = signed.signature;
    }
    const response = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const durationMs = Date.now() - started;
    if (!response.ok) {
      const record = (parsed ?? {}) as Record<string, unknown>;
      return {
        ok: false,
        status: response.status,
        data: null,
        errorCode: typeof record["error_code"] === "string" ? record["error_code"] : "MEDIA_WORKER_ERROR",
        errorMessage:
          typeof record["error"] === "string" ? record["error"] : `The media service rejected the task (HTTP ${response.status})`,
        durationMs,
      };
    }
    return { ok: true, status: response.status, data: parsed as T, durationMs };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorCode: "MEDIA_WORKER_UNREACHABLE",
      errorMessage: error instanceof Error && error.name === "AbortError"
        ? "The media service did not respond in time"
        : "The media service could not be reached",
      durationMs: Date.now() - started,
    };
  }
}

export interface WorkerHealth {
  ok: boolean;
  service?: string;
  ffmpeg?: string | null;
  tasks?: string[];
  running?: number;
  queued?: number;
  concurrency?: number;
}

export function workerHealth(): Promise<WorkerCall<WorkerHealth>> {
  return call<WorkerHealth>("/health", { method: "GET" });
}

export function submitWorkerTask(task: MediaWorkerTask): Promise<WorkerCall<{ accepted: boolean; task_id: string }>> {
  return call("/tasks", { method: "POST", body: JSON.stringify(task) });
}
