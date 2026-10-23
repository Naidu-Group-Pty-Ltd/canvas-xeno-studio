/**
 * Worker configuration. Everything is read from the environment; nothing is
 * baked into the image and no credential is ever accepted inside a task body.
 */
import { randomUUID } from "node:crypto";
import { availableParallelism } from "node:os";

const instanceId = (value) =>
  typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : null;

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: intEnv("PORT", 8080),
  /** Shared HMAC secret. The worker refuses to start without it. */
  sharedSecret: process.env["MEDIA_WORKER_SHARED_SECRET"] ?? "",
  /** Signature freshness window, in seconds. */
  signatureWindowSeconds: intEnv("SIGNATURE_WINDOW_SECONDS", 300),
  /**
   * How many heavy tasks (renders and other video encodes) may run at once.
   * FFmpeg is CPU bound: keep this small. (CONCURRENCY is its older name.)
   */
  heavyConcurrency: intEnv("HEAVY_CONCURRENCY", intEnv("CONCURRENCY", 2)),
  /**
   * How many quick tasks (probes, thumbnails, frames, image resizes, audio)
   * may run at once, in a lane of their own, so they never wait behind a render.
   */
  quickConcurrency: intEnv("QUICK_CONCURRENCY", 2),
  /**
   * How many of a render's clips are encoded side by side (clips joined to the
   * one before go in order). Two on a machine with four cores or more.
   */
  clipParallelism: intEnv("CLIP_PARALLELISM", availableParallelism() >= 4 ? 2 : 1),
  /**
   * How many browsers draw a composition's frames side by side (each takes
   * every Nth frame). Two on a machine with four cores or more.
   */
  compositionBrowsers: intEnv("COMPOSITION_BROWSERS", availableParallelism() >= 4 ? 2 : 1),
  /**
   * This machine has a GPU for compositions' WebGL (MEDIA_WORKER_GPU=1): the
   * browser draws on it. Without one, WebGL runs in software, which a heavy
   * scene (Reel 1's globe) makes slow; the app sends those to a GPU worker
   * when one is set up (MEDIA_WORKER_GPU_URL).
   */
  gpu: process.env["MEDIA_WORKER_GPU"] === "1",
  /**
   * With nothing running, queued or still being reported for this long, the
   * worker exits, and so its Fly machine stops; Fly starts it again for the
   * next request. 0 (the default) keeps it running.
   */
  idleStopSeconds: intEnv("IDLE_STOP_SECONDS", 0),
  /** Tasks waiting beyond this depth are rejected with 429 rather than queued forever. */
  maxQueueDepth: intEnv("MAX_QUEUE_DEPTH", 50),
  heartbeatSeconds: intEnv("HEARTBEAT_SECONDS", 60),
  /**
   * How long a task's result keeps being reported while the app can't take it
   * (a 5xx, no answer, or a request that hangs). After the first few tries this
   * goes on in the background, so it doesn't hold a render slot.
   */
  reportRetrySeconds: intEnv("REPORT_RETRY_SECONDS", 6 * 60 * 60),
  /** One try at reporting a result is abandoned (and tried again) after this long. */
  reportTimeoutSeconds: intEnv("REPORT_TIMEOUT_SECONDS", 30),
  /**
   * This instance, as it names itself to the app: a task delivered to two
   * instances (an acknowledgement lost, then the task sent again) runs only on
   * the one that checks in first. The Fly machine id, else WORKER_ID, else a
   * fresh id for this process.
   */
  workerId:
    instanceId(process.env["FLY_MACHINE_ID"]) ??
    instanceId(process.env["WORKER_ID"]) ??
    randomUUID(),
  /** Hard wall-clock limit for a single FFmpeg invocation. */
  taskTimeoutSeconds: intEnv("TASK_TIMEOUT_SECONDS", 900),
  /**
   * The same limit for each FFmpeg step of an Editor render (render_sequence),
   * which can take hours: an edit runs up to ten minutes at up to 60 fps, and
   * shared vCPUs are throttled to a fraction of a core under sustained load.
   * A step that stops making progress is caught sooner, by the stall limit.
   */
  renderTimeoutSeconds: intEnv("RENDER_TIMEOUT_SECONDS", 12 * 60 * 60),
  /** An Editor render's FFmpeg step that writes nothing new for this long has hung, and is stopped. */
  renderStallSeconds: intEnv("RENDER_STALL_SECONDS", 20 * 60),
  /** Refuse source media larger than this. */
  maxDownloadBytes: intEnv("MAX_DOWNLOAD_MB", 1024) * 1024 * 1024,
  /**
   * All of one task's sources together may take at most this much disk (an
   * edit can name dozens of files), so the tasks running at once can't fill
   * the disk they share: CONCURRENCY × this, at most.
   */
  maxTaskDownloadBytes: intEnv("MAX_TASK_DOWNLOAD_MB", 2048) * 1024 * 1024,
  /**
   * Everything one task keeps on disk at once (sources, intermediates, the mix
   * and its outputs) may take at most this much: CONCURRENCY × this, at most,
   * for the tasks running together.
   */
  maxTaskWorkspaceBytes: intEnv("MAX_TASK_WORKSPACE_MB", 4096) * 1024 * 1024,
  /** Refuse to upload a result larger than this. */
  maxOutputBytes: intEnv("MAX_OUTPUT_MB", 2048) * 1024 * 1024,
  /**
   * Hosts the worker may download from or upload to. Only exact hosts or
   * suffix matches are allowed; everything else (including private ranges and
   * redirects off the list) is refused.
   */
  allowedHostSuffixes: (
    process.env["ALLOWED_HOST_SUFFIXES"] ??
    "supabase.co,supabase.in,higgsfield.ai,cloudfront.net,amazonaws.com"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Hosts the worker may report results to. Kept separate from the media list:
   * callbacks go to the app, which is hosted on Lovable (or a custom domain set here).
   */
  callbackHostSuffixes: (process.env["CALLBACK_HOST_SUFFIXES"] ?? "lovable.app,lovableproject.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  workDir: process.env["WORK_DIR"] ?? "/tmp/xeno-media",
};

export function assertConfigured() {
  if (!config.sharedSecret || config.sharedSecret.length < 16) {
    throw new Error("MEDIA_WORKER_SHARED_SECRET is missing or too short (min 16 characters)");
  }
}
