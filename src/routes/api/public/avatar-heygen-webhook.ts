import { createFileRoute } from "@tanstack/react-router";

/**
 * HeyGen webhook receiver. Verifies the HMAC signature with the secret HeyGen
 * returned at registration, then records the event idempotently. Returns no
 * internal data.
 */
export const Route = createFileRoute("/api/public/avatar-heygen-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 256_000) return new Response("Payload too large", { status: 413 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secret } = await supabaseAdmin.rpc("avatar_get_provider_secret", { _name: "HEYGEN_WEBHOOK_SECRET" });
        if (!secret) return new Response("Not configured", { status: 503 });
        const { verifyHeyGenSignature } = await import("@/features/avatar-studio/server/heygen.server");
        const ok = await verifyHeyGenSignature(raw, request.headers.get("signature"), secret as string);
        if (!ok) return new Response("Invalid signature", { status: 401 });
        let payload: { event_type?: string; event_id?: string; event_data?: Record<string, unknown> };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const { createHash } = await import("node:crypto");
        const hash = createHash("sha256").update(raw).digest("hex");
        const { processWebhook } = await import("@/features/avatar-studio/server/jobs.server");
        await processWebhook(payload, hash);
        return new Response("ok");
      },
    },
  },
});
