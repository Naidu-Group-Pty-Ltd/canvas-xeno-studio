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
});

export const renderSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { startSequenceRender } = await import("./edit/render.server");
    return startSequenceRender({ ...data, userId: context.userId });
  });
