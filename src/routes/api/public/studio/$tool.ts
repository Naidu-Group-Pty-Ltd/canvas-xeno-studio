import { createFileRoute } from "@tanstack/react-router";

/**
 * The studio's API as plain JSON over HTTP (see src/lib/studio-api): GET
 * /api/public/studio/tools lists the operations; POST
 * /api/public/studio/<operation> runs one with its arguments as the JSON
 * body. Every request carries `Authorization: Bearer xs_…`.
 */
export const Route = createFileRoute("/api/public/studio/$tool")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleRestRequest } = await import("@/lib/studio-api/mcp.server");
        return handleRestRequest(request, params.tool);
      },
      POST: async ({ request, params }) => {
        const { handleRestRequest } = await import("@/lib/studio-api/mcp.server");
        return handleRestRequest(request, params.tool);
      },
    },
  },
});
