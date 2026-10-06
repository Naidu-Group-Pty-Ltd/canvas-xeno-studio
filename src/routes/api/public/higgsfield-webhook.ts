import { createFileRoute } from "@tanstack/react-router";

/**
 * Provider-facing webhook. Isolated from authenticated endpoints, idempotent,
 * and returns quickly: a completed output is saved to the library right after
 * the response (the reconcile job remains the fallback).
 */
export const Route = createFileRoute("/api/public/higgsfield-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const expected = process.env["LOVABLE_CRON_SECRET"];
        if (expected && token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyProviderPayload, ingestOutputs, logEvent, runAfterResponse } =
          await import("@/lib/generation-pipeline.server");
        const { extractRequestId } = await import("@/lib/higgsfield/provider.server");

        const requestId = extractRequestId(payload);
        if (!requestId) return new Response(JSON.stringify({ error: "Missing request id" }), { status: 400 });

        const { data: generation } = await supabaseAdmin
          .from("generations")
          .select("id")
          .eq("hf_request_id", requestId)
          .maybeSingle();
        if (!generation) return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });

        await logEvent(generation.id, "webhook_received", { request_id: requestId });
        const status = await applyProviderPayload(generation.id, payload);
        // Save the output now instead of waiting up to five minutes for the
        // reconcile job. The claim inside ingestOutputs makes repeats no-ops.
        if (status === "completed")
          await runAfterResponse(request, () => ingestOutputs(generation.id));

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
