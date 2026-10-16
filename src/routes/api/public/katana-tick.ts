import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** How long one tick keeps following runs (the scheduler calls every minute and waits 65 s). */
const TICK_MS = 50_000;

/**
 * The Katana tick, called every minute while a run is going (the database
 * makes no call otherwise). Katana stops at each paid call until the studio
 * answers, so for most of the minute this reads the running sessions every
 * few seconds, answering what waits, and saves finished videos.
 */
export const Route = createFileRoute("/api/public/katana-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const deadline = Date.now() + TICK_MS;
        const { katanaTick } = await import("@/lib/katana/service.server");
        const { runWhileConnected } = await import("@/lib/generation-pipeline.server");
        const outcome = await runWhileConnected(request, () => katanaTick(deadline)).catch(
          (error: unknown) => {
            console.error("katana tick failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return { passes: 0, runs: 0, failed: true };
          },
        );
        return new Response(JSON.stringify(outcome), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
