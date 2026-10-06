import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Recovery worker: dispatches locally queued jobs, polls stale provider jobs
 * whose webhook may have been missed, and ingests pending outputs.
 */
export const Route = createFileRoute("/api/public/higgsfield-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { dispatchQueue, reconcileStaleGenerations, ingestPending, runAfterResponse } =
          await import("@/lib/generation-pipeline.server");

        const dispatched = await dispatchQueue();
        const polled = await reconcileStaleGenerations();
        // Saving outputs can outlast the scheduler's short HTTP timeout, and a
        // caller that hangs up cancels the request. Where the runtime allows it,
        // saving continues after the response instead.
        let ingested: number | "background" = "background";
        await runAfterResponse(request, async () => {
          ingested = await ingestPending();
        });

        return new Response(JSON.stringify({ dispatched, polled, ingested }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
