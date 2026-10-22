import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Editor server functions. Edits themselves are read and saved by the browser
 * under row-level security; rendering needs the media service, signed storage
 * URLs and the worker secret, so it runs here.
 */

const renderInput = z.object({
  sequenceId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  clientRequestId: z.string().min(8).max(64),
  /** For public use: held until every file is cleared or its exceptions are confirmed. */
  publicUse: z.boolean().default(false),
  confirmExceptions: z.union([z.boolean(), z.array(z.string().uuid()).max(500)]).default(false),
});

export const renderSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { startSequenceRender } = await import("./edit/render.server");
    return startSequenceRender({ ...data, userId: context.userId });
  });

/** Sends again a render the media service never confirmed taking. */
export const resendRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ renderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { resendSequenceRender } = await import("./edit/render.server");
    return resendSequenceRender({ renderId: data.renderId, userId: context.userId });
  });

/** Finishes a render that stopped reporting from the video it uploaded, if it did. */
export const recoverRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ renderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { recoverSequenceRender } = await import("./edit/render.server");
    return recoverSequenceRender({ renderId: data.renderId, userId: context.userId });
  });

/**
 * Makes a finished render's review sheet: every shot half a second in and on
 * its last frame, labelled, as one picture in the library (see ./edit/review-sheet).
 */
export const makeReviewSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        renderId: z.string().uuid(),
        clientRequestId: z.string().min(8).max(64),
        again: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { startReviewSheet } = await import("./edit/review-sheet.server");
    return startReviewSheet({ ...data, userId: context.userId });
  });
