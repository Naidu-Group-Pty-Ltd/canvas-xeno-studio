import { createFileRoute } from "@tanstack/react-router";

/**
 * Fresh signed URLs for a render (or another media task) the media worker is
 * about to start or upload.
 *
 * Signed URLs expire and a render can wait in the worker's queue, so the
 * worker asks again when it gets to the work. Authenticated by the worker's
 * HMAC signature; it answers only for open tasks, and only with URLs for that
 * task's own sources and destinations. The asking worker instance claims the
 * task, so a task delivered to two instances runs on one. A claimed task
 * whose links couldn't be renewed just now is answered 202 with no links: the
 * worker goes on with the ones it has.
 */
export const Route = createFileRoute("/api/public/media-worker-credentials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyWorkerSignature } = await import("@/lib/media/worker.server");
        const check = verifyWorkerSignature(
          raw,
          request.headers.get("x-xeno-timestamp"),
          request.headers.get("x-xeno-signature"),
        );
        if (!check.ok) return new Response("Unauthorized", { status: 401 });

        let taskId: unknown;
        let workerId: unknown;
        try {
          const body = JSON.parse(raw) as Record<string, unknown>;
          taskId = body["task_id"];
          workerId = body["worker_id"];
        } catch {
          return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
        }
        if (typeof taskId !== "string" || !taskId) {
          return new Response(JSON.stringify({ error: "Missing task id" }), { status: 400 });
        }
        // The worker instance asking (workers that predate it send none).
        if (
          workerId !== undefined &&
          (typeof workerId !== "string" || !/^[\w-]{1,64}$/.test(workerId))
        ) {
          return new Response(JSON.stringify({ error: "Invalid worker id" }), { status: 400 });
        }

        const { refreshRenderCredentials } = await import("@/lib/edit/render.server");
        const { refreshTaskCredentials } = await import("@/lib/media/submit.server");
        // An Editor render, or else any other media task.
        let result = await refreshRenderCredentials(taskId, workerId ?? null);
        if (result.status === 404) result = await refreshTaskCredentials(taskId, workerId ?? null);
        const body =
          result.status === 200
            ? { sources: result.sources, uploads: result.uploads, expires_at: result.expires_at }
            : result.status === 202
              ? { claimed: true }
              : { error: result.status === 410 ? "Task closed" : "Unavailable" };
        return new Response(JSON.stringify(body), {
          status: result.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
