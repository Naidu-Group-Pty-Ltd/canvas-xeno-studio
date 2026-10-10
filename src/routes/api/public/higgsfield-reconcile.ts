import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** The most time the music upload cleanup may take in one run. */
const CLEANUP_MS = 20_000;

/**
 * Recovery worker: dispatches locally queued jobs, polls stale provider jobs
 * whose webhook may have been missed, ingests pending outputs and moves long
 * videos on. It also clears licensed music uploads whose licence was never
 * recorded.
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

        // Alongside the generation work rather than ahead of it: a slow or
        // stalled storage call there never holds up dispatch, polling or
        // saving, and a failure of theirs doesn't cut it short. At CLEANUP_MS
        // it stops, taking no further step, and the job answers only once it
        // has: nothing of it runs on after the response. What it hasn't
        // cleared is left for the next run.
        const musicUploads = clearAbandonedMusicUploads(AbortSignal.timeout(CLEANUP_MS)).catch(
          () => 0,
        );
        try {
          const dispatched = await dispatchQueue();
          const polled = await reconcileStaleGenerations();
          // Saving runs while the scheduler waits for this call (up to two
          // minutes), so large outputs aren't held to the ~30 s Cloudflare allows
          // after a response. A save that outlasts the scheduler still gets that
          // time to finish instead of being cancelled with the request.
          const ingested = await runWhileConnected(request, () => ingestPending());
          // Long videos whose next step an event didn't take (a missed webhook or
          // callback, a busy media service) move on here.
          const { sweepLongVideos } = await import("@/lib/long-video/service.server");
          const longVideos = await runWhileConnected(request, () => sweepLongVideos()).catch(
            (error: unknown) => {
              console.error("long video sweep failed", {
                message: error instanceof Error ? error.message : String(error),
              });
              return 0;
            },
          );

          return new Response(
            JSON.stringify({
              dispatched,
              polled,
              ingested,
              longVideos,
              musicUploads: await musicUploads,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } finally {
          await musicUploads;
        }
      },
    },
  },
});
