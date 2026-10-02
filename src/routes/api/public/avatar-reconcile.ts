import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Avatar Studio recovery: polls stale HeyGen jobs, retries ingestion, reaps orphaned realtime sessions. */
export const Route = createFileRoute("/api/public/avatar-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { reconcile } = await import("@/features/avatar-studio/server/jobs.server");
        const result = await reconcile();
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
