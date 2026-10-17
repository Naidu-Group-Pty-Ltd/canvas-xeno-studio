import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** How long one tick keeps moving runs on (the scheduler calls every minute and waits 65 s). */
const TICK_MS = 50_000;

/**
 * The long-video tick, called every minute while a run is going (the database
 * makes no call otherwise; see migration 0017). Runs move on as events come
 * (a webhook, the media service's callback), but a step that needs a minute,
 * like a clip's identity check, doesn't fit in the time an event leaves, and
 * an event can be missed: this takes those steps within the minute instead of
 * at the five-minute reconcile job. Generations waiting in the local queue
 * (a free rejection tried again later, see generation-pipeline) are sent too.
 */
export const Route = createFileRoute("/api/public/long-video-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const deadline = Date.now() + TICK_MS;
        const { dispatchQueue, runWhileConnected } =
          await import("@/lib/generation-pipeline.server");
        const dispatched = await dispatchQueue().catch((error: unknown) => {
          console.error("long video tick: dispatch failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          return 0;
        });
        const { sweepLongVideos } = await import("@/lib/long-video/service.server");
        const runs = await runWhileConnected(request, () => sweepLongVideos(25, deadline)).catch(
          (error: unknown) => {
            console.error("long video tick failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          },
        );
        return new Response(JSON.stringify({ dispatched, runs }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
