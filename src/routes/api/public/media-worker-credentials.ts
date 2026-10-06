import { createFileRoute } from "@tanstack/react-router";

/**
 * Fresh signed URLs for a render the media worker is about to start or upload.
 *
 * Signed URLs expire and a render can wait in the worker's queue, so the
 * worker asks again when it gets to the work. Authenticated by the worker's
 * HMAC signature; it answers only for open render tasks, and only with URLs
 * for that task's own sources and destinations.
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
        try {
          taskId = (JSON.parse(raw) as Record<string, unknown>)["task_id"];
        } catch {
          return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
        }
        if (typeof taskId !== "string" || !taskId) {
          return new Response(JSON.stringify({ error: "Missing task id" }), { status: 400 });
        }

        const { refreshRenderCredentials } = await import("@/lib/edit/render.server");
        const result = await refreshRenderCredentials(taskId);
        const body =
          result.status === 200
            ? { sources: result.sources, uploads: result.uploads }
            : { error: result.status === 410 ? "Task closed" : "Unavailable" };
        return new Response(JSON.stringify(body), {
          status: result.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
