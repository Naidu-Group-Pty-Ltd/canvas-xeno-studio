import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { API_SCOPES, newApiToken, tokenPrefixOf } from "./studio-api/tokens";

/**
 * Personal tokens for the studio's API and MCP server. A token is shown once,
 * when it is made; only its hash is kept. Members make and revoke their own.
 */

/** Active tokens a member may hold at once. */
const MAX_TOKENS = 20;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activeMember(userId: string): Promise<void> {
  const db = await admin();
  const { data } = await db.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

export const createApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        scopes: z.array(z.enum(API_SCOPES)).min(1),
        /** Days until it stops working; 0 for never. */
        expiresInDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const db = await admin();
    const { count, error: countError } = await db
      .from("api_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (countError)
      throw new AppError(
        "UNKNOWN",
        "API tokens need a database update (migration 0019_studio_api). Ask an admin to apply it.",
      );
    if ((count ?? 0) >= MAX_TOKENS)
      throw new AppError(
        "INVALID_PARAMETERS",
        `Revoke a token first: at most ${MAX_TOKENS} at once`,
      );
    const token = newApiToken((bytes) => crypto.getRandomValues(bytes));
    const { hashApiToken } = await import("./studio-api/tokens.server");
    const { data: row, error } = await db
      .from("api_tokens")
      .insert({
        user_id: context.userId,
        name: data.name,
        token_prefix: tokenPrefixOf(token),
        token_hash: await hashApiToken(token),
        scopes: [...new Set(data.scopes)],
        expires_at: data.expiresInDays
          ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
          : null,
      })
      .select("id")
      .maybeSingle();
    if (error || !row) throw new AppError("UNKNOWN", "The token couldn't be made");
    // The only time the token itself leaves the server.
    return { id: row.id, token, prefix: tokenPrefixOf(token) };
  });

export const revokeApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const db = await admin();
    const { data: revoked, error } = await db
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new AppError("UNKNOWN", error.message);
    if (!revoked?.length)
      throw new AppError("INVALID_PARAMETERS", "That token isn't yours, or is already revoked");
    return { ok: true };
  });
