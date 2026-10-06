/**
 * Worker configuration. Everything is read from the environment; nothing is
 * baked into the image and no credential is ever accepted inside a task body.
 */

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
  /** How many tasks may run at once. FFmpeg is CPU bound: keep this small. */
  concurrency: intEnv("CONCURRENCY", 2),
  /** Tasks waiting beyond this depth are rejected with 429 rather than queued forever. */
  maxQueueDepth: intEnv("MAX_QUEUE_DEPTH", 50),
  heartbeatSeconds: intEnv("HEARTBEAT_SECONDS", 60),
  /**
   * Signed URLs older than this are re-signed by the app (for tasks that give
   * a `credentials_url`) before downloading and again before uploading.
   */
  credentialsRefreshSeconds: intEnv("CREDENTIALS_REFRESH_SECONDS", 900),
  /** Hard wall-clock limit for a single FFmpeg invocation. */
  taskTimeoutSeconds: intEnv("TASK_TIMEOUT_SECONDS", 900),
  /** Refuse source media larger than this. */
  maxDownloadBytes: intEnv("MAX_DOWNLOAD_MB", 1024) * 1024 * 1024,
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
