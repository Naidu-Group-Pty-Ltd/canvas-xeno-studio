import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { kitInput, paletteInput } from "./brand/kit-input";

/**
 * Importing a brand's design system (see ./brand/imports.server): from its
 * website, scanned by the server, or from its guidelines, read in the
 * browser. The long part (the scan, the AI's reading) streams from
 * /api/public/brand-import (./brand/import-stream.server); these are the
 * quick steps around it. Either way the AI's reading waits as a proposal
 * until a person keeps it as a brand kit. Any active member may import (kits
 * are the team's); an import is thrown away by whoever started it, or an
 * admin.
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
