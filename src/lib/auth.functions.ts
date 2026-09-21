import { createServerFn } from "@tanstack/react-start";

/**
 * Tells the sign-in screen whether the workspace still has zero team members.
 * Only in that state is creating the first (admin) account allowed — there is
 * no public registration afterwards.
 */
export const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
  return { needsFirstAdmin: (count ?? 0) === 0 };
});
