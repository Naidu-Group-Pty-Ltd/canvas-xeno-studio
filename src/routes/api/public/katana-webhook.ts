import { createFileRoute } from "@tanstack/react-router";

/**
 * Anthropic's Managed Agents webhook (optional; registered in the Claude
 * Console with the session event types). A signed notice that a Katana
 * session went idle, needs an answer or ended makes the studio read it at
 * once, so a paid call never waits for the next tick. Notices carry IDs only
 * and may repeat or arrive out of order; reading the session is idempotent.
 */
export const Route = createFileRoute("/api/public/katana-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["ANTHROPIC_WEBHOOK_SIGNING_KEY"];
        if (!key || !process.env["ANTHROPIC_API_KEY"]) {
          return new Response("Webhooks are not set up", { status: 503 });
        }
        const body = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, name) => {
          headers[name] = value;
        });
        const { anthropicClient } = await import("@/lib/katana/agent.server");
        let event;
        try {
          event = anthropicClient().beta.webhooks.unwrap(body, { headers, key });
        } catch {
          return new Response("Invalid signature", { status: 400 });
        }
        const data = event.data;
        if (data.type.startsWith("session.")) {
          const { syncRunForSession } = await import("@/lib/katana/service.server");
          const { runAfterResponse } = await import("@/lib/generation-pipeline.server");
          await runAfterResponse(request, () => syncRunForSession(data.id));
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
