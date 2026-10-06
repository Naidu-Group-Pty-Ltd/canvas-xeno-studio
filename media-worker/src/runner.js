import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { TASKS } from "./tasks.js";
import { downloadTo, TaskError, uploadFile, assertAllowedUrl } from "./net.js";
import { sign } from "./signature.js";
import { withWorkspace } from "./workspace.js";

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
  const credentialsUrl = typeof body.credentials_url === "string" ? body.credentials_url : null;
  if (credentialsUrl) await assertAllowedUrl(credentialsUrl, config.callbackHostSuffixes);

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
    credentialsUrl,
    credentialsExpireAt: expiry(body.credentials_expire_at),
  };
}

function expiry(value) {
  const at = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : null;
}

/** URLs this close to expiry aren't trusted for a download or upload. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
/** How long a claim keeps trying when the task doesn't say how long its links last. */
const CLAIM_PATIENCE_MS = 2 * 60 * 60_000;

/**
 * A task that names a `credentials_url` checks in with the app when it starts
 * and again before it uploads. The app claims the task for this instance (a
 * task delivered to two instances, after a lost acknowledgement, runs on only
 * one), can tell it to drop a task it has closed meanwhile, and re-signs its
 * sources and upload slots (same order, same destinations), so time spent in
 * the queue or rendering never outlives them. Transient failures are retried.
 *
 * The first check-in is the claim, and nothing starts without it. While the
 * app can't be reached the claim keeps trying (the task's id is already taken
 * here, so a resend would be ignored: giving up after a short outage would
 * strand it), with waits growing to 30 seconds apart, until the app answers or
 * the task's links are past use. If the app refuses, or never answers in that
 * time, the task is left alone, neither run nor reported, since another
 * instance may hold it (the app closes it as stalled if none does). Once
 * claimed, a later check-in that can't reach the app falls back to the URLs
 * held while they are valid; otherwise the task fails with a clear reason
 * instead of an upload that can't succeed.
 *
 * Returns "dropped" when the app says the task isn't this instance's to run,
 * and "unclaimed" when a claim couldn't be confirmed.
 */
async function checkIn(task, { claim = false } = {}) {
  if (!task.credentialsUrl) return "ok";
  const deadline = claim ? (task.credentialsExpireAt ?? Date.now() + CLAIM_PATIENCE_MS) : null;
  // The app answering at all (2xx) confirms the claim, even when the links it
  // sent can't be used (then the ones held are kept).
  let answered = false;
  for (let attempt = 1; ; attempt += 1) {
    const answer = await askForCredentials(task);
    if (answer === "dropped") return "dropped";
    if (answer === "ok") return "ok";
    if (answer === "unusable") {
      answered = true;
      break;
    }
    if (answer === "refused") break;
    const wait = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    if (claim ? Date.now() + wait > deadline : attempt >= 4) break;
    if (claim && attempt === 3) task.lastStage = "Waiting for the app to confirm this render";
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  if (claim && !answered) return "unclaimed";
  if (task.credentialsExpireAt !== null && Date.now() > task.credentialsExpireAt - EXPIRY_MARGIN_MS) {
    throw new TaskError(
      "CREDENTIALS_EXPIRED",
      "The task waited longer than its media links last, and they couldn't be renewed. Start it again.",
    );
  }
  return "ok";
}

/**
 * One request for fresh URLs: "ok", "dropped", "retry" (transient), "refused"
 * (won't change) or "unusable" (answered, but with links that can't be used).
 */
async function askForCredentials(task) {
  const rawBody = JSON.stringify({ task_id: task.taskId, worker_id: config.workerId });
  const { timestamp, signature } = sign(rawBody);
  let response;
  try {
    response = await fetch(task.credentialsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-xeno-timestamp": timestamp, "x-xeno-signature": signature },
      body: rawBody,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return "retry";
  }
  if (response.status === 410) return "dropped";
  if (response.status >= 500 || response.status === 429) return "retry";
  if (!response.ok) return "refused";
  try {
    const body = await response.json();
    const sources = Array.isArray(body?.sources) ? body.sources : [];
    const uploads = Array.isArray(body?.uploads) ? body.uploads : [];
    if (sources.length !== task.sources.length || uploads.length !== task.uploads.length) return "unusable";
    for (const item of [...sources, ...uploads]) await assertAllowedUrl(item?.url);
    task.sources = task.sources.map((source, index) => ({ ...source, url: sources[index].url }));
    task.uploads = task.uploads.map((slot, index) => ({ ...slot, url: uploads[index].url }));
    task.credentialsExpireAt = expiry(body.expires_at) ?? task.credentialsExpireAt;
    return "ok";
  } catch {
    // Malformed, or a URL off the allow list: not usable.
    return "unusable";
  }
}

/** Downloads, renders, uploads and reports. Never throws to the caller. */
export async function executeTask(task) {
  const startedAt = Date.now();
  let dir = null;
  try {
    const claimed = await checkIn(task, { claim: true });
    if (claimed === "dropped") return dropped(task);
    if (claimed === "unclaimed") return unclaimed(task);
    dir = await mkdtemp(join(config.workDir, "task-"));
    const workspace = dir;

    // Everything the task keeps on disk is watched against its budget.
    const result = await withWorkspace(workspace, async () => {
      const localSources = [];
      // The sources share one budget (within the workspace's): past it, the
      // task stops downloading and fails.
      const sourceBudget = Math.min(config.maxTaskDownloadBytes, config.maxTaskWorkspaceBytes);
      let room = sourceBudget;
      for (const [index, source] of task.sources.entries()) {
        const path = join(workspace, `source-${index}`);
        const allowance = Math.min(config.maxDownloadBytes, room);
        const bytes = await downloadTo(source.url, path, allowance).catch((error) => {
          if (error instanceof TaskError && error.code === "SOURCE_TOO_LARGE" && allowance < config.maxDownloadBytes)
            throw new TaskError(
              "SOURCES_TOO_LARGE",
              `The media for this task is more than ${Math.round(sourceBudget / (1024 * 1024))} MB together. Use fewer or shorter clips.`,
            );
          throw error;
        });
        room -= bytes;
        localSources.push({ path, role: source.role ?? "source", mime: source.mime ?? null, bytes });
      }

      return task.definition.run({
        sources: localSources,
        params: task.params,
        dir: workspace,
        progress: progressReporter(task),
      });
    });

    if ((await checkIn(task)) === "dropped") return dropped(task);
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

/** The app closed the task, or another instance has it: nothing is reported. */
function dropped(task) {
  console.log(`[xeno-media-worker] task ${task.taskId} dropped: the app no longer wants it from this instance`);
}

/** The app couldn't confirm this instance holds the task: it isn't run, and nothing is reported. */
function unclaimed(task) {
  console.log(`[xeno-media-worker] task ${task.taskId} not started: the app couldn't confirm it is this instance's to run`);
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
