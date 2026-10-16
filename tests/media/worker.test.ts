import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// What the worker says it can do is kept in app_settings: a stand-in records it.
const writes: Array<{ op: string; row?: unknown; key?: string }> = [];
let stored: { key: string; value: unknown } | null = null;
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: async (row: { key: string; value: unknown }) => {
        writes.push({ op: "upsert", row });
        stored = row;
        return { error: null };
      },
      delete: () => ({
        eq: async (_column: string, key: string) => {
          writes.push({ op: "delete", key });
          stored = null;
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: stored ? { value: stored.value } : null, error: null }),
        }),
      }),
    }),
  },
}));

const { rememberedFrom, rememberedWorker, restarting, submitWorkerTask } =
  await import("../../src/lib/media/worker.server");

const TASK = {
  task_id: "task-1",
  task_type: "render_sequence",
  sources: [],
  uploads: [],
  params: {},
  callback: { url: "https://example.lovable.app/api/public/media-worker-callback" },
};

const ACCEPTED = {
  accepted: true,
  task_id: "task-1",
  queued: 0,
  ffmpeg: "ffmpeg version 5.1.6",
  features: ["smart_join", "channel_mix"],
  tasks: ["render_sequence", "probe"],
  limits: { task_timeout_seconds: 900, render_timeout_seconds: 43200, render_stall_seconds: 1200 },
  idle_stop_seconds: 600,
};

const realFetch = globalThis.fetch;
const env = {
  url: process.env["MEDIA_WORKER_URL"],
  secret: process.env["MEDIA_WORKER_SHARED_SECRET"],
};

/** Answers the worker's requests in turn: a status and body, or "down" (the connection is refused). */
function worker(answers: Array<[number, unknown] | "down">) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    if (answer === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(answer[1]), { status: answer[0] });
  }) as typeof fetch;
  return calls;
}

beforeEach(() => {
  writes.length = 0;
  stored = null;
  process.env["MEDIA_WORKER_URL"] = "https://xeno-media-worker.fly.dev";
  process.env["MEDIA_WORKER_SHARED_SECRET"] = "0123456789abcdef";
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (env.url === undefined) delete process.env["MEDIA_WORKER_URL"];
  else process.env["MEDIA_WORKER_URL"] = env.url;
  if (env.secret === undefined) delete process.env["MEDIA_WORKER_SHARED_SECRET"];
  else process.env["MEDIA_WORKER_SHARED_SECRET"] = env.secret;
});

describe("a worker that stops when idle", () => {
  test("a task turned away while it stops is sent again, and its answer remembered", async () => {
    const calls = worker([
      [
        503,
        {
          error_code: "WORKER_STOPPING",
          error: "The media worker is stopping; send the task again",
        },
      ],
      [202, ACCEPTED],
    ]);
    const result = await submitWorkerTask(TASK, [0, 0, 0]);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.op).toBe("upsert");
    const row = writes[0]!.row as {
      key: string;
      value: { features: string[]; idle_stop_seconds: number };
    };
    expect(row.key).toBe("media_worker_health");
    expect(row.value.features).toEqual(["smart_join", "channel_mix"]);
    expect(row.value.idle_stop_seconds).toBe(600);
  });

  test("a refused connection is tried again while the machine starts, then forgotten if it never answers", async () => {
    const calls = worker(["down"]);
    const result = await submitWorkerTask(TASK, [0, 0, 0]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(calls).toHaveLength(4);
    expect(writes).toEqual([{ op: "delete", key: "media_worker_health" }]);
  });

  test("a task the worker refuses on its merits isn't sent again", async () => {
    const calls = worker([[400, { error_code: "INVALID_TASK", error: "Unknown task type" }]]);
    const result = await submitWorkerTask(TASK, [0, 0, 0]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(calls).toHaveLength(1);
    expect(writes).toHaveLength(0);
  });

  test("a full queue isn't sent again here (its callers wait longer)", async () => {
    const calls = worker([
      [429, { error_code: "WORKER_BUSY", error: "The media worker queue is full" }],
    ]);
    const result = await submitWorkerTask(TASK, [0, 0, 0]);
    expect(result.status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  test("what it said is read back as it was said, until it is too old", async () => {
    worker([[202, ACCEPTED]]);
    await submitWorkerTask(TASK, [0, 0, 0]);
    const remembered = await rememberedWorker(60_000);
    expect(remembered).not.toBeNull();
    expect(remembered!.features).toEqual(["smart_join", "channel_mix"]);
    expect(remembered!.tasks).toEqual(["render_sequence", "probe"]);
    expect(remembered!.ffmpeg).toBe("ffmpeg version 5.1.6");
    expect(remembered!.limits).toEqual(ACCEPTED.limits);
    // It stops itself when idle: the status pages say so without waking it.
    expect(remembered!.idleStopSeconds).toBe(600);
    expect(await rememberedWorker(-1)).toBeNull();
  });

  test("only a quick failure of the kind a stop or start gives counts as restarting", () => {
    const failed = (status: number, durationMs: number) => ({
      ok: false,
      status,
      data: null,
      durationMs,
    });
    expect(restarting(failed(503, 40))).toBe(true);
    expect(restarting(failed(502, 900))).toBe(true);
    expect(restarting(failed(0, 120))).toBe(true);
    // A timeout may have reached the worker: it is left to the callers, who know the task.
    expect(restarting(failed(0, 30_000))).toBe(false);
    expect(restarting(failed(500, 50))).toBe(false);
    expect(restarting(failed(429, 50))).toBe(false);
    expect(restarting({ ok: true, status: 202, data: null, durationMs: 50 })).toBe(false);
  });

  test("what it can do is read from its health or its answer to a task, not from a duplicate's", () => {
    const at = new Date("2026-10-16T09:00:00.000Z");
    expect(rememberedFrom(ACCEPTED, at)).toEqual({
      at: "2026-10-16T09:00:00.000Z",
      ffmpeg: "ffmpeg version 5.1.6",
      tasks: ["render_sequence", "probe"],
      features: ["smart_join", "channel_mix"],
      limits: ACCEPTED.limits,
      idleStopSeconds: 600,
    });
    // A task sent twice is answered without the worker's details.
    expect(rememberedFrom({ accepted: true, duplicate: true, task_id: "task-1" }, at)).toBeNull();
    // An older worker says nothing about stopping.
    expect(
      rememberedFrom({ ok: true, features: [], tasks: ["probe"] }, at)?.idleStopSeconds,
    ).toBeNull();
  });
});
