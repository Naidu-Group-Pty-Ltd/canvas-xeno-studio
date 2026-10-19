/**
 * A brand import's long part, as the page asks for it and hears back (see
 * ./import-stream.server): scanning a website, or reading the guidelines
 * document the page has already opened and uploaded; then the AI's reading.
 * Shared by the server, the browser and tests.
 */
import { z } from "zod";

/** A picture from a guidelines document, uploaded to the import's folder. */
export const documentPicture = z.object({
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

export const brandImportRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("website"), url: z.string().trim().min(3).max(2000) }),
  z.object({
    action: z.literal("document"),
    importId: z.string().uuid(),
    text: z.string().max(200_000),
    pageCount: z.number().int().min(0).max(10_000).nullable(),
    pictures: z.array(documentPicture).max(24),
  }),
]);
export type BrandImportRequest = z.input<typeof brandImportRequest>;

export type BrandImportEvent =
  /** The import the work is for: from here the page follows its row. */
  | { type: "import"; importId: string }
  /** How it ended (the row says the same). */
  | { type: "done"; importId: string; ok: boolean; error: string | null }
  /** It couldn't start. */
  | { type: "error"; error: string };
