/**
 * Asking the studio's AI to suggest a brand's DNA (see ./dna-stream.server),
 * as the page asks and hears back: the brand as the kit editor holds it, and
 * the DNA it read. Shared by the server, the browser and tests.
 */
import { z } from "zod";

export const dnaSuggestRequest = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().max(200).nullable(),
  tagline: z.string().trim().max(160).nullable(),
  callToAction: z.string().trim().max(60).nullable(),
  terms: z.array(z.string().trim().max(80)).max(50),
  /** The kit's design system as the editor holds it (read tolerantly). */
  design: z.record(z.string(), z.unknown()),
});
export type DnaSuggestRequest = z.input<typeof dnaSuggestRequest>;

export type DnaSuggestEvent =
  /** The DNA as read (not saved: a person looks it over), and what it was read from. */
  | { type: "dna"; dna: Record<string, unknown>; model: string | null; read: string[] }
  | { type: "error"; error: string };
