import { createFileRoute } from "@tanstack/react-router";

/**
 * Writes a library formula for a brand (see
 * src/lib/brand/formula-adapt-stream.server): POST the formula's id and the
 * brand as the kit editor holds it, with the person's own session
 * (`Authorization: Bearer <access token>`); the formula streams back as
 * text/event-stream.
 */
export const Route = createFileRoute("/api/public/brand-formula")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBrandFormulaRequest } =
          await import("@/lib/brand/formula-adapt-stream.server");
        return handleBrandFormulaRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
