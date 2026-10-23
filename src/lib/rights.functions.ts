import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";

/**
 * The licence and credits ledger (see ./rights/rights): a file's rights as
 * they stand, a person's record of them (stamped by the server with who and
 * when), and an edit's credits. Worked out on the server, which reads the
 * music library, the studio's own records of what it made, and the ledger.
 */

async function activeMember(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

/** Library files' rights as they stand. */
export const getAssetRights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assetIds: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const { rightsForAssets } = await import("./rights/service.server");
    const rights = await rightsForAssets(data.assetIds);
    return data.assetIds.flatMap((assetId) => rights.get(assetId) ?? []);
  });

const text = (max: number) => z.string().trim().max(max).nullable().optional();

/** Records a file's rights; a field left out keeps what was recorded, null clears it. */
export const recordAssetRights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: z.string().uuid(),
        status: z.enum(["cleared", "to_confirm", "not_cleared"]),
        source: text(300),
        licence: text(300),
        licenceUrl: text(500),
        creditLine: text(1000),
        notes: text(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setAssetRights } = await import("./rights/service.server");
    const { assetId, ...change } = data;
    return setAssetRights({ userId: context.userId, assetId, change });
  });

/** Forgets what was recorded of a file's rights: they are worked out again. */
export const forgetAssetRights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ assetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { clearAssetRights } = await import("./rights/service.server");
    return clearAssetRights({ userId: context.userId, assetId: data.assetId });
  });

/**
 * The credits of an edit as it is being edited: the files it uses, as the
 * Editor lays them out (see timelineUses), each with its rights, and the
 * credit lines owed.
 */
export const getEditCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        uses: z
          .array(
            z.object({
              assetId: z.string().uuid(),
              use: z.enum(["clip", "still", "picture", "voiceover", "music", "sound_effect"]),
            }),
          )
          .max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const { editCredits } = await import("./rights/rights");
    const { rightsForAssets } = await import("./rights/service.server");
    return editCredits(data.uses, await rightsForAssets(data.uses.map((use) => use.assetId)));
  });
