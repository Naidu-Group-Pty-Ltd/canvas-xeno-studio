import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Recovery worker: dispatches locally queued jobs, polls stale provider jobs
 * whose webhook may have been missed, and ingests pending outputs. It also
 * clears licensed music uploads whose licence was never recorded.
 */
export const Route = createFileRoute("/api/public/higgsfield-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { dispatchQueue, reconcileStaleGenerations, ingestPending, runWhileConnected } =
          await import("@/lib/generation-pipeline.server");
        const { clearAbandonedMusicUploads } = await import("@/lib/music/service.server");

        // First and on its own, so a problem elsewhere never holds it up (or the reverse).
        const musicUploads = await clearAbandonedMusicUploads().catch(() => 0);
        const dispatched = await dispatchQueue();
        const polled = await reconcileStaleGenerations();
        // Saving runs while the scheduler waits for this call (up to two
        // minutes), so large outputs aren't held to the ~30 s Cloudflare allows
        // after a response. A save that outlasts the scheduler still gets that
        // time to finish instead of being cancelled with the request.
        const ingested = await runWhileConnected(request, () => ingestPending());

        return new Response(JSON.stringify({ dispatched, polled, ingested, musicUploads }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
