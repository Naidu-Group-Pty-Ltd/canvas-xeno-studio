import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** The most time the music upload cleanup may take in one run. */
const CLEANUP_MS = 20_000;

/**
 * How long the passes may keep taking new steps, counted from the start of
 * the call: the scheduler waits two minutes for it (pg_net's timeout), so a
 * slow pass early on leaves the later ones less time instead of pushing them
 * past the point where the call is cut off.
 */
const JOB_BUDGET_MS = 110_000;

/**
 * Recovery worker: dispatches locally queued jobs, polls stale provider jobs
 * whose webhook may have been missed, ingests pending outputs, moves long
 * videos on and follows Soul ID trainings. It also clears licensed music uploads whose licence was never
 * recorded, closes media tasks the media service never reported back on,
 * settles the lip sync of single clips made to a voiceover, and follows Katana
 * runs a tick missed.
 */
export const Route = createFileRoute("/api/public/higgsfield-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const deadline = Date.now() + JOB_BUDGET_MS;

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
          // Soul ID trainings are asked how they're going (and starts that were
          // cut short settled), so a character becomes usable without anyone
          // keeping its page open.
          const { sweepSoulTrainings } = await import("@/lib/characters/service.server");
          const soulTrainings = await sweepSoulTrainings(10, deadline).catch((error: unknown) => {
            console.error("soul id sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          // Media tasks the media service never reported back on are closed (a
          // result that still comes is recorded).
          const { closeLostMediaTasks } = await import("@/lib/media/submit.server");
          const mediaTasks = await closeLostMediaTasks().catch((error: unknown) => {
            console.error("media task sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          // Single clips made to a voiceover whose sync no event settled (an
          // answer not taken in, a task closed just above as lost, a link
          // never written) are settled, so each still opens with its voiceover
          // and ends up measured or taken as in step.
          const { sweepClipSyncs } = await import("@/lib/lip-sync/clip.server");
          const clipSyncs = await sweepClipSyncs(25, deadline).catch((error: unknown) => {
            console.error("clip sync sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          // Screenshots being redacted and clean-plate recipes move on here when
          // no report did; a screenshot left unchecked for a week is cancelled
          // and its original deleted (an original is kept only if a person asks).
          const { sweepRedactions } = await import("@/lib/media/redaction.server");
          const redactions = await sweepRedactions(10).catch((error: unknown) => {
            console.error("redaction sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });
          const { sweepCleanPlates } = await import("@/lib/media/clean-plate.server");
          const cleanPlates = await sweepCleanPlates(10).catch((error: unknown) => {
            console.error("clean plate sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          // Katana runs are followed by their own one-minute tick; this pass is
          // its fallback (a tick that didn't come), answering paid calls that
          // wait and saving finished videos.
          const { sweepKatanaRuns } = await import("@/lib/katana/service.server");
          const katanaRuns = await sweepKatanaRuns(
            10,
            Math.min(deadline, Date.now() + 20_000),
          ).catch((error: unknown) => {
            console.error("katana sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          // Long videos whose next step an event didn't take (a missed webhook or
          // callback, a busy media service) move on here: last, as the longest
          // (an AI check can take a minute), so the quick passes above always run.
          const { sweepLongVideos } = await import("@/lib/long-video/service.server");
          const longVideos = await runWhileConnected(request, () =>
            sweepLongVideos(25, deadline),
          ).catch((error: unknown) => {
            console.error("long video sweep failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return 0;
          });

          return new Response(
            JSON.stringify({
              dispatched,
              polled,
              ingested,
              longVideos,
              soulTrainings,
              mediaTasks,
              clipSyncs,
              redactions,
              cleanPlates,
              katanaRuns,
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
