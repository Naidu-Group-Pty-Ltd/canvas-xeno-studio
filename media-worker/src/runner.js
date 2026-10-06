import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { TASKS } from "./tasks.js";
import { downloadTo, TaskError, uploadFile, assertAllowedUrl } from "./net.js";
import { sign } from "./signature.js";

/**
 * Validates a task body before anything is downloaded or executed. This is the
 * single gate: unknown task types, missing sources, mismatched upload slots and
 * unsupported URLs are all rejected here, synchronously, with a clear reason.
 */
export async function validateTask(body) {
  if (!body || typeof body !== "object") throw new TaskError("INVALID_PARAMETERS", "Task body must be an object");

  const taskId = String(body.task_id ?? "");
  if (!/^[\w-]{8,64}$/.test(taskId)) throw new TaskError("INVALID_PARAMETERS", "task_id is missing or malformed");

  const definition = TASKS[body.task_type];
  if (!definition) throw new TaskError("INVALID_PARAMETERS", `Unknown task type "${body.task_type}"`);

  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (sources.length < definition.sources.min || sources.length > definition.sources.max) {
    throw new TaskError(
      "INVALID_PARAMETERS",
      `${body.task_type} needs between ${definition.sources.min} and ${definition.sources.max} sources`,
    );
  }
  for (const source of sources) await assertAllowedUrl(source?.url);

  const params = body.params && typeof body.params === "object" ? body.params : {};
  const expectedOutputs = definition.outputs(params);
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];
  if (uploads.length !== expectedOutputs) {
    throw new TaskError("INVALID_PARAMETERS", `${body.task_type} produces ${expectedOutputs} file(s) but ${uploads.length} upload slot(s) were supplied`);
  }
  for (const upload of uploads) await assertAllowedUrl(upload?.url);
  if (body.callback?.url) await assertAllowedUrl(body.callback.url, config.callbackHostSuffixes);

  return {
    taskId,
    definition,
    sources,
    params,
    uploads,
    callback: body.callback ?? null,
    // Progress reports are opt-in, so an app that only understands final
    // results is never sent anything else.
    reportProgress: body.report_progress === true,
  };
}

/** Downloads, renders, uploads and reports. Never throws to the caller. */
export async function executeTask(task) {
  const startedAt = Date.now();
  let dir = null;
  try {
    dir = await mkdtemp(join(config.workDir, "task-"));

    const localSources = [];
    for (const [index, source] of task.sources.entries()) {
      const path = join(dir, `source-${index}`);
      const bytes = await downloadTo(source.url, path);
      localSources.push({ path, role: source.role ?? "source", mime: source.mime ?? null, bytes });
    }

    const result = await task.definition.run({
      sources: localSources,
      params: task.params,
      dir,
      progress: progressReporter(task),
    });

    const outputs = [];
    for (const [index, output] of result.outputs.entries()) {
      const slot = task.uploads[index];
      const bytes = await uploadFile(slot, output.path, output.mime);
      outputs.push({
        index,
        kind: output.kind,
        mime_type: output.mime,
        bytes,
        storage_key: slot.storage_key ?? null,
        ...(output.timestamp_seconds !== undefined ? { timestamp_seconds: output.timestamp_seconds } : {}),
      });
    }

    await report(task, {
      task_id: task.taskId,
      status: "completed",
      outputs,
      metadata: result.metadata ?? null,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const code = error instanceof TaskError ? error.code : "WORKER_ERROR";
    await report(task, {
      task_id: task.taskId,
      status: "failed",
      error_code: code,
      error_message: error?.message ? String(error.message).slice(0, 500) : "The media task failed",
      duration_ms: Date.now() - startedAt,
    });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Throttled, best-effort progress reports. They are never retried and never
 * awaited by the render: only the final result has to arrive.
 */
function progressReporter(task) {
  if (!task.reportProgress || !task.callback?.url) return () => {};
  let lastSentAt = 0;
  let lastValue = -1;
  return (fraction, stage) => {
    if (typeof stage === "string") task.lastStage = stage.slice(0, 80);
    const value = Math.max(0, Math.min(0.99, Number(fraction) || 0));
    const now = Date.now();
    if (now - lastSentAt < 3000 || value - lastValue < 0.02) return;
    lastSentAt = now;
    lastValue = value;
    const rawBody = JSON.stringify({
      task_id: task.taskId,
      status: "progress",
      progress: Number(value.toFixed(3)),
      stage: typeof stage === "string" ? stage.slice(0, 80) : null,
    });
    const { timestamp, signature } = sign(rawBody);
    fetch(task.callback.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-xeno-timestamp": timestamp, "x-xeno-signature": signature },
      body: rawBody,
    }).catch(() => {});
  };
}

/** Signed callback to the app, retried a few times for transient network faults only. */
async function report(task, payload) {
  if (!task.callback?.url) return;
  const rawBody = JSON.stringify(payload);
  const { timestamp, signature } = sign(rawBody);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(task.callback.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-xeno-timestamp": timestamp,
          "x-xeno-signature": signature,
        },
        body: rawBody,
      });
      // The callback is idempotent on the app side, so a 2xx or a 4xx both end the loop:
      // only transport faults and 5xx are worth repeating.
      if (response.status < 500) return;
    } catch {
      /* retry below */
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
}

/** "Still here": a signed, best-effort report for a task that is queued or working. */
export function sendHeartbeat(task, stage) {
  if (!task.reportProgress || !task.callback?.url) return;
  const rawBody = JSON.stringify({ task_id: task.taskId, status: "heartbeat", stage: String(stage).slice(0, 80) });
  const { timestamp, signature } = sign(rawBody);
  fetch(task.callback.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-xeno-timestamp": timestamp, "x-xeno-signature": signature },
    body: rawBody,
  }).catch(() => {});
}
