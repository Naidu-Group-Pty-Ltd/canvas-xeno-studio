import { createFileRoute } from "@tanstack/react-router";

/**
 * Where Higgsfield's sign-in sends an admin back after they approve the
 * studio. The one-time state (and its PKCE verifier) proves the sign-in was
 * started from Settings; the code is traded for tokens here, server side, and
 * the admin lands back in Settings with the outcome.
 */
export const Route = createFileRoute("/api/public/higgsfield-oauth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { completeHiggsfieldConnect } = await import("@/lib/katana/connection.server");
        const { appBaseUrl } = await import("@/lib/generation-pipeline.server");
        const outcome = await completeHiggsfieldConnect({
          state: url.searchParams.get("state"),
          code: url.searchParams.get("code"),
          error: url.searchParams.get("error"),
          errorDescription: url.searchParams.get("error_description"),
        }).catch((error: unknown) => ({
          ok: false,
          returnOrigin: new URL(appBaseUrl()).origin,
          message: error instanceof Error ? error.message : "The sign-in couldn't be finished.",
        }));
        const target = new URL("/settings", outcome.returnOrigin);
        target.searchParams.set("higgsfield", outcome.ok ? "connected" : "error");
        target.searchParams.set("message", outcome.message.slice(0, 300));
        target.hash = "katana";
        return new Response(null, {
          status: 302,
          headers: {
            Location: target.toString(),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
