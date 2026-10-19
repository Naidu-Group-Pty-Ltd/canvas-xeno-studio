import { createFileRoute } from "@tanstack/react-router";

/**
 * A brand import's long part (see src/lib/brand/import-stream.server): POST a
 * website to scan, or a guidelines document to read, with the person's own
 * session (`Authorization: Bearer <access token>`); the import's id and how it
 * ended stream back as text/event-stream.
 */
export const Route = createFileRoute("/api/public/brand-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleBrandImportRequest } = await import("@/lib/brand/import-stream.server");
        return handleBrandImportRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
