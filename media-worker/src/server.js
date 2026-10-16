import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { config, assertConfigured } from "./config.js";
import { verify } from "./signature.js";
import { validateTask, executeTask, pendingReports, sendHeartbeat } from "./runner.js";
import { describeTasks, FEATURES } from "./tasks.js";
import { ffmpegVersion } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { Lanes, idleLongEnough } from "./lanes.js";

assertConfigured();
await mkdir(config.workDir, { recursive: true });

const seen = new Map(); // task_id -> accepted at, for cheap duplicate suppression
const active = new Set(); // accepted tasks, queued or running, for heartbeats
/** The renderer's version, for answers to tasks (it can't change while this runs). */
const ffmpegLine = ffmpegVersion();
/** Since when nothing has been running, queued or reported (renewed while anything is). */
let idleSince = Date.now();
/** Set once the worker has decided to stop: tasks are turned away until it has. */
let stopping = false;

/** In-flight accounting: two bounded lanes, so the box cannot be overwhelmed. */
const lanes = new Lanes(
  { heavy: config.heavyConcurrency, quick: config.quickConcurrency },
  executeTask,
  (task) => {
    active.delete(task);
    idleSince = Date.now();
  },
);

/**
 * Tasks that opted into progress reports also get a heartbeat while they wait
 * in the queue or work, so the app can tell a long queue from a lost task.
 */
setInterval(() => {
  for (const task of active) {
    const position = lanes.position(task);
    const stage =
      position >= 0
        ? `Waiting for a free renderer${position > 0 ? ` (${position} ahead)` : ""}`
        : (task.lastStage ?? "Working");
    sendHeartbeat(task, stage);
  }
}, config.heartbeatSeconds * 1000).unref();

/**
 * Stopping when idle: with nothing running, queued or still being reported
 * for IDLE_STOP_SECONDS, the worker exits cleanly, and its Fly machine stops
 * (and costs nothing but its disk). Fly starts it again for the next request.
 * Fly's own auto-stop can't be used: tasks run after their request has been
 * answered, so the proxy would see a machine mid-render as idle.
 */
if (config.idleStopSeconds > 0) {
  // Looked at as often as the limit, up to every 15 seconds.
  const every = Math.min(15, config.idleStopSeconds) * 1000;
  setInterval(() => {
    const now = Date.now();
    const reporting = pendingReports();
    if (lanes.busy > 0 || lanes.queued > 0 || reporting > 0) {
      idleSince = now;
      return;
    }
    if (
      stopping ||
      !idleLongEnough({
        busy: lanes.busy,
        queued: lanes.queued,
        reporting,
        idleSince,
        now,
        stopAfterMs: config.idleStopSeconds * 1000,
      })
    )
      return;
    stopping = true;
    console.log(
      `[xeno-media-worker] idle for ${Math.round((now - idleSince) / 1000)}s, stopping until the next task`,
    );
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 5_000).unref();
  }, every).unref();
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new TaskError("INVALID_PARAMETERS", "Task body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://worker.local");

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      ok: true,
      service: "xeno-media-worker",
      ffmpeg: await ffmpegVersion(),
      tasks: describeTasks(),
      features: FEATURES,
      running: lanes.busy,
      queued: lanes.queued,
      concurrency: config.heavyConcurrency,
      lanes: lanes.describe(),
      // Seconds idle before the worker stops itself (0: it keeps running).
      idle_stop_seconds: config.idleStopSeconds,
      // Seconds an FFmpeg step may take: any task's, an Editor render's, and
      // how long a render's step may write nothing new before it is stopped.
      limits: {
        task_timeout_seconds: config.taskTimeoutSeconds,
        render_timeout_seconds: config.renderTimeoutSeconds,
        render_stall_seconds: config.renderStallSeconds,
      },
    });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/tasks") {
    json(response, 404, { error: "Not found" });
    return;
  }
  // Stopping: the task is turned away unread, and sent again it starts the worker afresh.
  if (stopping) {
    json(response, 503, {
      error_code: "WORKER_STOPPING",
      error: "The media worker is stopping; send the task again",
    });
    return;
  }

  let raw;
  try {
    raw = await readBody(request);
  } catch (error) {
    json(response, 413, { error: error.message });
    return;
  }

  // Authentication first: an unsigned or stale request never reaches parsing.
  const check = verify(raw, request.headers["x-xeno-timestamp"], request.headers["x-xeno-signature"]);
  if (!check.ok) {
    json(response, 401, { error: "Unauthorized", reason: check.reason });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    json(response, 400, { error: "Task body is not valid JSON" });
    return;
  }

  let task;
  try {
    task = await validateTask(body);
  } catch (error) {
    json(response, 400, { error_code: error.code ?? "INVALID_PARAMETERS", error: error.message });
    return;
  }

  // Duplicate delivery of the same task id is acknowledged, never run twice.
  const now = Date.now();
  for (const [id, at] of seen) if (now - at > 6 * 60 * 60 * 1000) seen.delete(id);
  if (seen.has(task.taskId)) {
    json(response, 200, { accepted: true, duplicate: true, task_id: task.taskId });
    return;
  }
  // The worker may have decided to stop while the task was read: it isn't taken.
  if (stopping) {
    json(response, 503, {
      error_code: "WORKER_STOPPING",
      error: "The media worker is stopping; send the task again",
    });
    return;
  }
  if (lanes.queued >= config.maxQueueDepth) {
    json(response, 429, { error_code: "WORKER_BUSY", error: "The media worker queue is full — try again shortly" });
    return;
  }

  seen.set(task.taskId, now);
  idleSince = now;
  if (task.reportProgress && task.callback?.url) active.add(task);
  lanes.add(task);
  // Accept and return immediately: rendering happens in the background and the
  // result is reported through the signed callback. What this worker can do
  // comes along, so the app knows without asking (and waking it) separately.
  json(response, 202, {
    accepted: true,
    task_id: task.taskId,
    queued: lanes.queued,
    ffmpeg: await ffmpegLine,
    features: FEATURES,
    tasks: describeTasks(),
    limits: {
      task_timeout_seconds: config.taskTimeoutSeconds,
      render_timeout_seconds: config.renderTimeoutSeconds,
      render_stall_seconds: config.renderStallSeconds,
    },
    idle_stop_seconds: config.idleStopSeconds,
  });
});

server.listen(config.port, () => {
  console.log(
    `[xeno-media-worker] listening on :${server.address().port} (heavy ${config.heavyConcurrency}, quick ${config.quickConcurrency}, ` +
      `clips side by side ${config.clipParallelism}, ${config.idleStopSeconds > 0 ? `stops after ${config.idleStopSeconds}s idle` : "always on"})`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[xeno-media-worker] ${signal} received, draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 20_000).unref();
  });
}
