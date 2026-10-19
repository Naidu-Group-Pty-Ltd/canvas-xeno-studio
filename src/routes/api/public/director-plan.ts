import { createFileRoute } from "@tanstack/react-router";

/**
 * The Director (see src/lib/director-stream.server): POST
 * `{"action": "plan", brief, …}` or `{"action": "revise", planId,
 * instruction}` with the person's own session (`Authorization: Bearer
 * <access token>`); the plan streams back as text/event-stream.
 */
export const Route = createFileRoute("/api/public/director-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleDirectorRequest } = await import("@/lib/director-stream.server");
        return handleDirectorRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
