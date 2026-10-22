import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRIVACY_NEEDS_UPDATE } from "./media/layout-only";
import { SCREENSHOT_MAX_BYTES } from "./media/redaction";
import { MAX_BOXES } from "./media/text-boxes";

/**
 * Reference screenshots kept private (see ./media/redaction and
 * ./media/layout-only): redacted on import, and held out of every frame.
 */

const redactionId = z.string().uuid();
const share = z.number().min(0).max(1);
const box = z.object({
  id: z.string().max(40).optional(),
  x: share,
  y: share,
  w: share,
  h: share,
  kind: z.string().max(20).optional(),
  source: z.string().max(20).optional(),
  label: z.string().max(60).optional(),
});

/** Whether screenshots can be redacted here, and if not, why not in words. */
export const getReferencePrivacyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveMember } = await import("./media/members.server");
    await requireActiveMember(context.userId);
    const { privacyReady } = await import("./media/redaction.server");
    const ready = await privacyReady();
    return { ready, message: ready ? null : PRIVACY_NEEDS_UPDATE };
  });

/** Starts importing a screenshot to redact: where the browser uploads it (the private bucket). */
export const stageReferenceScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(300),
        mimeType: z.string().max(100),
        size: z.number().int().positive().max(SCREENSHOT_MAX_BYTES),
        projectId: z.string().uuid().nullable().default(null),
        layoutOnly: z.boolean().default(true),
        keepOriginal: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { stageScreenshot } = await import("./media/redaction.server");
    return stageScreenshot({
      userId: context.userId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      size: data.size,
      projectId: data.projectId,
      choices: { layoutOnly: data.layoutOnly, keepOriginal: data.keepOriginal },
    });
  });

/**
 * Reads an uploaded screenshot for its private details: boxes for a person
 * to check. With `read` false (blurring turned off) it is only measured.
 */
export const readReferenceScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ redactionId, read: z.boolean().default(true) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { readScreenshot } = await import("./media/redaction.server");
    return readScreenshot(data.redactionId, context.userId, { read: data.read });
  });

export const getReferenceRedaction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ redactionId }).parse(data))
  .handler(async ({ data, context }) => {
    const { getRedaction } = await import("./media/redaction.server");
    return getRedaction(data.redactionId, context.userId);
  });

/** Blurs the checked boxes in a copy (none: the screenshot joins the library as it is). */
export const applyReferenceRedaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        redactionId,
        boxes: z.array(box).max(MAX_BOXES),
        layoutOnly: z.boolean().optional(),
        keepOriginal: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { applyRedaction } = await import("./media/redaction.server");
    return applyRedaction(data.redactionId, context.userId, {
      boxes: data.boxes,
      layoutOnly: data.layoutOnly,
      keepOriginal: data.keepOriginal,
    });
  });

/** Drops a screenshot before its copy is made: its original is deleted. */
export const cancelReferenceRedaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ redactionId }).parse(data))
  .handler(async ({ data, context }) => {
    const { cancelRedaction } = await import("./media/redaction.server");
    return cancelRedaction(data.redactionId, context.userId);
  });

/** A link to a screenshot's kept original, for an admin only. */
export const openKeptOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ redactionId }).parse(data))
  .handler(async ({ data, context }) => {
    const { keptOriginalLink } = await import("./media/redaction.server");
    return { url: await keptOriginalLink(data.redactionId, context.userId) };
  });

/** The privacy marks of library files, by file (those without a mark are left out). */
export const getPrivacyMarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assetIds: z.array(z.string().uuid()).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireActiveMember } = await import("./media/members.server");
    await requireActiveMember(context.userId);
    const { privacyMarks } = await import("./media/layout-only.server");
    return Object.fromEntries(await privacyMarks(data.assetIds));
  });

/** Marks a file layout only (any member), or lifts the mark (admins only). */
export const setAssetLayoutOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assetId: z.string().uuid(),
        layoutOnly: z.boolean(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setLayoutOnly } = await import("./media/layout-only.server");
    return setLayoutOnly({ ...data, userId: context.userId });
  });
