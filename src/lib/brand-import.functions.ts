import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { kitInput, paletteInput } from "./brand/kit-input";

/**
 * Importing a brand's design system (see ./brand/imports.server): from its
 * website, scanned by the server, or from its guidelines, read in the
 * browser and finished here. Either way the AI's reading waits as a
 * proposal until a person keeps it as a brand kit. Any active member may
 * import (kits are the team's); an import is thrown away by whoever started
 * it, or an admin.
 */

async function member(userId: string) {
  const { activeMember } = await import("./brand/kits.server");
  return activeMember(userId);
}

async function ownImport(importId: string, userId: string) {
  const { loadImport } = await import("./brand/imports.server");
  const row = await loadImport(importId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That import no longer exists");
  const { role } = await member(userId);
  if (row.created_by !== userId && role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only whoever started this import, or an admin, can change it",
    );
  return row;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The import couldn't finish";

/** Scans a website and reads its design system (a minute or so). */
export const importBrandFromWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ url: z.string().trim().min(3).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await member(context.userId);
    const { createImport, scanWebsite, siteUrlOf } = await import("./brand/imports.server");
    const url = siteUrlOf(data.url);
    if (!url) throw new AppError("INVALID_PARAMETERS", "That isn't a website address");
    const importId = await createImport({
      userId: context.userId,
      kind: "url",
      sourceUrl: url,
      sourceTitle: null,
    });
    try {
      await scanWebsite(importId, url);
      return { importId, ok: true as const };
    } catch (error) {
      // The import records why; the review shows it.
      return { importId, ok: false as const, error: message(error) };
    }
  });

/** Starts a guidelines import: the folder its page pictures are uploaded to. */
export const startBrandDocumentImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ title: z.string().trim().min(1).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await member(context.userId);
    const { createImport, importFolder } = await import("./brand/imports.server");
    const importId = await createImport({
      userId: context.userId,
      kind: "document",
      sourceUrl: null,
      sourceTitle: data.title,
    });
    return { importId, folder: importFolder(importId) };
  });

const documentPicture = z.object({
  path: z.string().max(400),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  width: z.number().int().min(1).max(20_000).nullable(),
  height: z.number().int().min(1).max(20_000).nullable(),
  kind: z.enum(["page", "image"]),
  page: z.number().int().min(1).max(10_000).nullable(),
  bytes: z
    .number()
    .int()
    .min(0)
    .max(50 * 1024 * 1024),
});

/** Reads an uploaded guidelines document's text and pictures into a proposal. */
export const readBrandDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        importId: z.string().uuid(),
        text: z.string().max(200_000),
        pageCount: z.number().int().min(0).max(10_000).nullable(),
        pictures: z.array(documentPicture).max(24),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const row = await ownImport(data.importId, context.userId);
    if (row.kind !== "document" || row.status !== "scanning")
      throw new AppError("INVALID_PARAMETERS", "That import isn't waiting for a document");
    const { readDocument } = await import("./brand/imports.server");
    try {
      await readDocument(data.importId, {
        title: row.source_title ?? "Brand guidelines",
        text: data.text,
        pageCount: data.pageCount,
        pictures: data.pictures,
      });
      return { importId: data.importId, ok: true as const };
    } catch (error) {
      return { importId: data.importId, ok: false as const, error: message(error) };
    }
  });

const applyInput = z.object({
  importId: z.string().uuid(),
  kit: kitInput
    .omit({ logoAssetId: true, referenceAssetIds: true, source: true, palette: true, design: true })
    .extend({ palette: paletteInput, design: z.record(z.string(), z.unknown()) }),
  logo: z
    .union([z.object({ key: z.string().min(1).max(40) }), z.object({ assetId: z.string().uuid() })])
    .nullable(),
  references: z.array(z.string().min(1).max(40)).max(8).default([]),
  /** Library pictures the kit already uses as references, kept beside the new ones. */
  keepReferences: z.array(z.string().uuid()).max(12).default([]),
});

/** Keeps a reviewed import as a brand kit (new, or the kit it updates). */
export const applyBrandImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => applyInput.parse(data))
  .handler(async ({ data, context }) => {
    await member(context.userId);
    const { applyImport } = await import("./brand/imports.server");
    return applyImport(context.userId, data);
  });

/** Throws an import away, with the pictures it staged that weren't kept. */
export const discardBrandImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ importId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await ownImport(data.importId, context.userId);
    const { discardImport } = await import("./brand/imports.server");
    await discardImport(data.importId);
    return { ok: true };
  });
