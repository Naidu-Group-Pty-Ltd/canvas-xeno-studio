import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { config, assertConfigured } from "./config.js";
import { verify } from "./signature.js";
import { validateTask, executeTask, sendHeartbeat } from "./runner.js";
import { describeTasks, FEATURES } from "./tasks.js";
import { ffmpegVersion } from "./ffmpeg.js";
import { TaskError } from "./net.js";

assertConfigured();
await mkdir(config.workDir, { recursive: true });

/** In-flight accounting: a bounded queue, so the box cannot be overwhelmed. */
const queue = [];
let running = 0;
const seen = new Map(); // task_id -> accepted at, for cheap duplicate suppression
const active = new Set(); // accepted tasks, queued or running, for heartbeats

function pump() {
  while (running < config.concurrency && queue.length > 0) {
    const task = queue.shift();
    running += 1;
    executeTask(task).finally(() => {
      running -= 1;
      active.delete(task);
      pump();
    });
  }
}

/**
 * Tasks that opted into progress reports also get a heartbeat while they wait
 * in the queue or work, so the app can tell a long queue from a lost task.
 */
setInterval(() => {
  for (const task of active) {
    const position = queue.indexOf(task);
    const stage =
      position >= 0
        ? `Waiting for a free renderer${position > 0 ? ` (${position} ahead)` : ""}`
        : (task.lastStage ?? "Working");
    sendHeartbeat(task, stage);
  }
}, config.heartbeatSeconds * 1000).unref();

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
      running,
      queued: queue.length,
      concurrency: config.concurrency,
    });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/tasks") {
    json(response, 404, { error: "Not found" });
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
  if (queue.length >= config.maxQueueDepth) {
    json(response, 429, { error_code: "WORKER_BUSY", error: "The media worker queue is full — try again shortly" });
    return;
  }

  seen.set(task.taskId, now);
  queue.push(task);
  if (task.reportProgress && task.callback?.url) active.add(task);
  // Accept and return immediately: rendering happens in the background and the
  // result is reported through the signed callback.
  json(response, 202, { accepted: true, task_id: task.taskId, queued: queue.length });
  pump();
});

server.listen(config.port, () => {
  console.log(`[xeno-media-worker] listening on :${config.port} (concurrency ${config.concurrency})`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[xeno-media-worker] ${signal} received, draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 20_000).unref();
  });
}
