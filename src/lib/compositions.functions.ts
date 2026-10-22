import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { demoRecordSchema } from "./compositions/demo";
import { RENDER_QUALITIES } from "./compositions/settings";
import { compositionSpecSchema } from "./compositions/spec";

/**
 * Compositions (motion graphics as code; see ./compositions): drawn by the
 * media worker, kept by the server, read by members. Drawing one is free of
 * provider costs, so any active member may start one.
 */

const frame = {
  width: z.number().int().min(64).max(3840),
  height: z.number().int().min(64).max(3840),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
};

/** Starts drawing a composition (or returns the drawing already made of it). */
export const startComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        spec: compositionSpecSchema,
        brandKitId: z.string().uuid().nullable().default(null),
        quality: z.enum(RENDER_QUALITIES).default("draft"),
        projectId: z.string().uuid().nullable().default(null),
        ...frame,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { startCompositionRender } = await import("./compositions/render.server");
    return startCompositionRender({ ...data, userId: context.userId });
  });

/** A composition drawing's progress, and its library video once drawn. */
export const getCompositionRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ renderId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { compositionRender } = await import("./compositions/render.server");
    return compositionRender(data.renderId);
  });

/** What one drawing has been measured to take at each quality, for estimates. */
export const getCompositionCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { measuredSecondsPerDrawing } = await import("./compositions/render.server");
    const [draft, final] = await Promise.all([
      measuredSecondsPerDrawing("draft"),
      measuredSecondsPerDrawing("final"),
    ]);
    return { draft, final };
  });

/** Saves a brand kit's demo record (null: the studio's own fictional one). */
export const saveDemoRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ brandKitId: z.string().uuid(), record: demoRecordSchema.nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { activeMember } = await import("./brand/kits.server");
    await activeMember(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin
      .from("brand_kits")
      .update({ demo_record: data.record } as never)
      .eq("id", data.brandKitId)
      .eq("is_archived", false)
      .select("id");
    if (error) {
      if (/demo_record/.test(error.message))
        throw new AppError(
          "INVALID_PARAMETERS",
          "The demo record needs a database update (migration 0034_compositions). Ask an admin to apply it.",
        );
      throw new AppError("UNKNOWN", "The demo record couldn't be saved. Try again.");
    }
    if (!saved?.length) throw new AppError("INVALID_PARAMETERS", "That brand kit no longer exists");
    return { ok: true };
  });
