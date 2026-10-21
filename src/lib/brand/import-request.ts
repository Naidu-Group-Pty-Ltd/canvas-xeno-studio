/**
 * A brand import's long part, as the page asks for it and hears back (see
 * ./import-stream.server): scanning a website, reading the guidelines
 * document the page has already opened and uploaded, or reading the brand's
 * code from its GitHub repositories; then the AI's reading. Shared by the
 * server, the browser and tests.
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

/** The most repositories one code import reads (see CODE_SCAN_LIMITS in ./scan-code). */
export const MAX_IMPORT_REPOS = 6;

/**
 * A GitHub token, sent for one scan of private repositories and never kept:
 * a fine-grained or classic personal access token, or an app's.
 */
export const GITHUB_TOKEN_PATTERN = /^(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,250}$/;
export const githubToken = z
  .string()
  .trim()
  .regex(GITHUB_TOKEN_PATTERN, "That isn't a GitHub token");

export const brandImportRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("website"), url: z.string().trim().min(3).max(2000) }),
  z.object({
    action: z.literal("document"),
    importId: z.string().uuid(),
    text: z.string().max(200_000),
    pageCount: z.number().int().min(0).max(10_000).nullable(),
    pictures: z.array(documentPicture).max(24),
  }),
  z.object({
    action: z.literal("repos"),
    /** owner/repo, a GitHub address, or one into a branch and folder; the first is the brand's own. */
    repos: z.array(z.string().trim().min(3).max(500)).min(1).max(MAX_IMPORT_REPOS),
    token: githubToken.nullable().default(null),
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
