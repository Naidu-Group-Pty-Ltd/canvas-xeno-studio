import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALIGN_ANCHORS, ALIGN_DEFAULTS, ALIGN_LIMITS } from "./media/align-take";

/**
 * A take aligned to the picture it must end on (see ./media/align-take): the
 * media worker does it; these start it and follow it.
 */

const alignInput = z.object({
  takeAssetId: z.string().uuid(),
  pictureAssetId: z.string().uuid(),
  anchor: z.enum(ALIGN_ANCHORS).default("last"),
  crossSeconds: z.number().min(0).max(ALIGN_LIMITS.cross).default(ALIGN_DEFAULTS.cross),
  holdSeconds: z.number().min(0).max(ALIGN_LIMITS.hold).default(ALIGN_DEFAULTS.hold),
  clientRequestId: z.string().min(8).max(64),
});

/** Starts aligning a take, or returns where the one started for the same request stands. */
export const alignTakeToPicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => alignInput.parse(data))
  .handler(async ({ data, context }) => {
    const { startAlignTake } = await import("./media/align-take.server");
    const { clientRequestId, ...rest } = data;
    return startAlignTake({
      ...rest,
      userId: context.userId,
      dedupeKey: `align-take:${context.userId}:${clientRequestId}`,
    });
  });

export const getAlignTake = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ taskId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireActiveMember } = await import("./media/members.server");
    await requireActiveMember(context.userId);
    const { alignTakeState } = await import("./media/align-take.server");
    return alignTakeState(data.taskId);
  });
