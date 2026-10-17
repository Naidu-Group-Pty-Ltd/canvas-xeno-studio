import { createFileRoute } from "@tanstack/react-router";

/**
 * The studio's MCP server (see src/lib/studio-api/mcp.server): POST a
 * JSON-RPC message with `Authorization: Bearer xs_…` (a token made in
 * Settings → API access). Stateless, so there is no event stream to GET.
 */
export const Route = createFileRoute("/api/public/studio-mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMcpRequest } = await import("@/lib/studio-api/mcp.server");
        return handleMcpRequest(request);
      },
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
      DELETE: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
