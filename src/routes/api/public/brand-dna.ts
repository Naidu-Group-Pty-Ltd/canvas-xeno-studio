import { createFileRoute } from "@tanstack/react-router";

/**
 * Suggests a brand's DNA (see src/lib/brand/dna-stream.server): POST the
 * brand as the kit editor holds it, with the person's own session
 * (`Authorization: Bearer <access token>`); the DNA the studio's AI read
 * streams back as text/event-stream.
 */
export const Route = createFileRoute("/api/public/brand-dna")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBrandDnaRequest } = await import("@/lib/brand/dna-stream.server");
        return handleBrandDnaRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
