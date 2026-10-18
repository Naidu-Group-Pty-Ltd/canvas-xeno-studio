import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { kitInput } from "./brand/kit-input";

/**
 * Brand kits (see ./edit/brand and ./brand/design): kept by the server, read
 * by members. Any active member may make or change one (a kit is the
 * team's); only whoever made it, or an admin, archives it. A font is kept
 * only once its file is read by the server as a font (see ./brand/kits.server).
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activeMember(userId: string): Promise<{ role: string }> {
  const { activeMember: check } = await import("./brand/kits.server");
  return check(userId);
}

export const saveBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => kitInput.parse(data))
  .handler(async ({ data, context }) => {
    const { writeBrandKit } = await import("./brand/kits.server");
    return writeBrandKit(context.userId, data);
  });

export const archiveBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const member = await activeMember(context.userId);
    const db = await admin();
    const { data: kit } = await db
      .from("brand_kits")
      .select("id,created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!kit) throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");
    if (kit.created_by !== context.userId && member.role !== "admin")
      throw new AppError(
        "NOT_AUTHORIZED",
        "Only the person who made this kit, or an admin, can archive it",
      );
    const { error } = await db
      .from("brand_kits")
      .update({ is_archived: true, is_default: false })
      .eq("id", data.id);
    if (error) throw new AppError("UNKNOWN", error.message);
    return { ok: true };
  });
