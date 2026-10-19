import { createFileRoute } from "@tanstack/react-router";

/**
 * The Supercomputer agent (see src/lib/supercomputer/agent-turn.server): POST
 * a message, an edit, a redo or an approval with the person's own session
 * (`Authorization: Bearer <access token>`); the turn's events stream back as
 * text/event-stream.
 */
export const Route = createFileRoute("/api/public/supercomputer-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAgentRequest } = await import("@/lib/supercomputer/agent-turn.server");
        return handleAgentRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
