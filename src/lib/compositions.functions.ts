import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
