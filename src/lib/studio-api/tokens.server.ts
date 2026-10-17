/**
 * Who an API request is from: its bearer token, looked up by its hash. A
 * token works while it isn't revoked or expired and its owner is an active
 * team member; it acts as that member, within the scopes it was made with.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { API_SCOPES, isTokenShaped, type ApiScope } from "./tokens";

export interface ApiCaller {
  userId: string;
  tokenId: string;
  scopes: Set<ApiScope>;
}

/** A token's SHA-256, hex: what is kept and looked up. */
export async function hashApiToken(token: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** How often a token's "last used" is written (it is read on every request). */
const LAST_USED_EVERY_MS = 5 * 60_000;

export type ApiAuth =
  { ok: true; caller: ApiCaller } | { ok: false; status: 401 | 403 | 503; message: string };

/** The caller of a request, from its `Authorization: Bearer xs_…` header. */
export async function authenticateApiRequest(request: Request): Promise<ApiAuth> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1] ?? "";
  if (!isTokenShaped(token))
    return {
      ok: false,
      status: 401,
      message:
        "Send a studio API token as Authorization: Bearer xs_… (make one in Settings → API access).",
    };
  const { data: row, error } = await supabaseAdmin
    .from("api_tokens")
    .select("id,user_id,scopes,expires_at,revoked_at,last_used_at")
    .eq("token_hash", await hashApiToken(token))
    .maybeSingle();
  if (error)
    return {
      ok: false,
      status: 503,
      message: /does not exist|schema cache/i.test(error.message)
        ? "The studio API isn't set up yet: an admin needs to apply migration 0019_studio_api."
        : "Tokens can't be checked just now. Try again in a moment.",
    };
  if (
    !row ||
    row.revoked_at ||
    (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
  )
    return {
      ok: false,
      status: 401,
      message: "That token isn't valid (revoked, expired or unknown).",
    };
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", row.user_id)
    .maybeSingle();
  if (!profile?.is_active)
    return { ok: false, status: 403, message: "The token's owner is not an active team member." };
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > LAST_USED_EVERY_MS)
    await supabaseAdmin
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  return {
    ok: true,
    caller: {
      userId: row.user_id,
      tokenId: row.id,
      scopes: new Set(
        (row.scopes ?? []).filter((scope): scope is ApiScope =>
          (API_SCOPES as readonly string[]).includes(scope),
        ),
      ),
    },
  };
}
