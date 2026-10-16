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
  /** Framing it understands beyond the basics: "frame_focus" (crop position), "frame_background" (pad colour). */
  features?: string[];
  running?: number;
  queued?: number;
  concurrency?: number;
  /** Seconds an FFmpeg step may take: any task's, an Editor render's, and a render's step writing nothing. */
  limits?: {
    task_timeout_seconds?: number;
    render_timeout_seconds?: number;
    render_stall_seconds?: number;
  };
  /** Its two lanes: renders and other video encodes, and quick tasks. */
  lanes?: Record<"heavy" | "quick", { running: number; queued: number; concurrency: number }>;
  /** Seconds idle before it stops itself (0: it keeps running). */
  idle_stop_seconds?: number;
}

/**
 * What the worker last said it can do. It stops itself when idle (and Fly
 * starts it again for the next request), so asking it wakes it: pages that
 * only need to know what it can do read this instead.
 */
export interface RememberedWorker {
  /** When it said so. */
  at: string;
  ffmpeg: string | null;
  tasks: string[];
  features: string[];
  limits: WorkerHealth["limits"] | null;
  idleStopSeconds: number | null;
}

const REMEMBERED_KEY = "media_worker_health";

/** What a worker's answer (its health, or its answer to a task) says it can do; null if it doesn't say. */
export function rememberedFrom(data: unknown, at: Date): RememberedWorker | null {
  const record = (data ?? {}) as Record<string, unknown>;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
  const features = strings(record["features"]);
  if (!features) return null;
  return {
    at: at.toISOString(),
    ffmpeg: typeof record["ffmpeg"] === "string" ? record["ffmpeg"] : null,
    tasks: strings(record["tasks"]) ?? [],
    features,
    limits: (record["limits"] as WorkerHealth["limits"] | undefined) ?? null,
    idleStopSeconds:
      typeof record["idle_stop_seconds"] === "number" ? record["idle_stop_seconds"] : null,
  };
}

/** Keeps what the worker said it can do (from its health, or its answer to a task). */
async function remember(data: unknown): Promise<void> {
  const remembered = rememberedFrom(data, new Date());
  if (!remembered) return;
  // Kept in the worker's own words, so it reads back as an answer does.
  const value = {
    at: remembered.at,
    ffmpeg: remembered.ffmpeg,
    tasks: remembered.tasks,
    features: remembered.features,
    limits: remembered.limits,
    idle_stop_seconds: remembered.idleStopSeconds,
  };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_settings").upsert({
    key: REMEMBERED_KEY,
    value: value as never,
    updated_at: remembered.at,
  } as never);
}

/** Forgets it, once the worker couldn't be reached: the next status check asks it. */
async function forget(): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_settings").delete().eq("key", REMEMBERED_KEY);
}

/** What the worker last said it can do, if it said so within `maxAgeMs`. */
export async function rememberedWorker(maxAgeMs: number): Promise<RememberedWorker | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", REMEMBERED_KEY)
    .maybeSingle();
  const value = (data?.value ?? null) as Record<string, unknown> | null;
  const at = typeof value?.["at"] === "string" ? Date.parse(value["at"]) : Number.NaN;
  if (!value || !Number.isFinite(at) || Date.now() - at > maxAgeMs) return null;
  return rememberedFrom(value, new Date(at));
}

/** Asks the worker how it is (which starts it, if it was stopped), and remembers what it can do. */
export async function workerHealth(): Promise<WorkerCall<WorkerHealth>> {
  const result = await call<WorkerHealth>("/health", { method: "GET" });
  if (result.ok) await remember(result.data).catch(() => undefined);
  else if (result.status === 0 || result.status >= 500) await forget().catch(() => undefined);
  return result;
}

/**
 * A quick failure of the kind a worker stopping or starting gives: it turns
 * tasks away (503) while it stops, and a request caught between the two can
 * be refused or fail at Fly's proxy. A slow one (a timeout) isn't.
 */
export function restarting(result: WorkerCall<unknown>): boolean {
  return (
    !result.ok &&
    result.durationMs < 10_000 &&
    (result.status === 0 || result.status === 502 || result.status === 503 || result.status === 504)
  );
}

/** How long to wait before each resend of a task caught while the worker stops or starts. */
const RESTART_WAITS_MS = [2000, 4000, 8000];

/**
 * Sends a task. One caught while the worker stops or starts is sent again a
 * few seconds later: the worker never runs a task id twice. Its answer says
 * what it can do, which is remembered; if it can't be reached, that is
 * forgotten.
 */
export async function submitWorkerTask(
  task: MediaWorkerTask,
  waits: number[] = RESTART_WAITS_MS,
): Promise<WorkerCall<{ accepted: boolean; task_id: string }>> {
  const body = JSON.stringify(task);
  const send = () =>
    call<{ accepted: boolean; task_id: string }>("/tasks", { method: "POST", body });
  let result = await send();
  for (const wait of waits) {
    if (!restarting(result)) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    result = await send();
  }
  if (result.ok) await remember(result.data).catch(() => undefined);
  else if (result.status === 0 || result.status >= 500) await forget().catch(() => undefined);
  return result;
}
