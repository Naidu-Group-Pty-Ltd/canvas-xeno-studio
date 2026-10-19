/**
 * The person a streamed request comes from. The studio's streaming endpoints
 * (the Supercomputer agent, brand imports) are API routes rather than server
 * functions, so they read the person's own session from the request:
 * `Authorization: Bearer <access token>`.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "./higgsfield/errors";

/** The signed-in person's id, or a NOT_AUTHORIZED error saying what to do (`signInTo`: "talk to the Supercomputer"). */
export async function signedInUser(request: Request, signInTo: string): Promise<string> {
  const refused = new AppError("NOT_AUTHORIZED", `Sign in again to ${signInTo}`);
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token.split(".").length !== 3) throw refused;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new AppError("PROVIDER_NOT_CONFIGURED", "The studio isn't set up");
  const supabase = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw refused;
  return userId;
}
