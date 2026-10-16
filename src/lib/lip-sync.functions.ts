import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Voiceovers made ready to drive lip sync: prepared by the media service once
 * (the canonical file, its speech and pauses), then transcribed where a
 * transcription service is set up. Members follow a preparation by asking for
 * it again, which also settles one the media service has answered.
 */

export const prepareLipSyncVoiceover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: z.string().uuid(),
        projectId: z.string().uuid().nullable().optional(),
        // The person's confirmation that the voice in a recording may be used.
        confirmed: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { prepareVoiceover } = await import("./lip-sync/prepare.server");
    return prepareVoiceover({
      userId: context.userId,
      assetId: data.assetId,
      projectId: data.projectId ?? null,
      confirmed: data.confirmed,
    });
  });

export const getLipSyncVoiceover = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        preparationId: z.string().uuid().nullable().optional(),
        assetId: z.string().uuid().nullable().optional(),
      })
      .refine((value) => !!value.preparationId || !!value.assetId, "Say which voiceover")
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { readVoiceover } = await import("./lip-sync/prepare.server");
    return readVoiceover({
      userId: context.userId,
      preparationId: data.preparationId ?? null,
      assetId: data.assetId ?? null,
    });
  });

export const transcribeLipSyncVoiceover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ preparationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runWhileConnected } = await import("./generation-pipeline.server");
    const { transcribeVoiceover } = await import("./lip-sync/prepare.server");
    // A transcription that has started is recorded even if the browser goes away.
    return runWhileConnected(getRequest(), () =>
      transcribeVoiceover({ userId: context.userId, preparationId: data.preparationId }),
    );
  });

/**
 * A single clip made to a voiceover, opened in the Editor as a new edit with
 * its voiceover, the clip laid so its lips meet it.
 */
export const openLipSyncClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: z.string().uuid(),
        keepSound: z.boolean().default(false),
        captions: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireActiveMember } = await import("./voice/service.server");
    await requireActiveMember(context.userId);
    const { openClipWithVoiceover } = await import("./lip-sync/clip.server");
    return openClipWithVoiceover({ userId: context.userId, ...data });
  });
