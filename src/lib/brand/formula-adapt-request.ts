/**
 * Asking the studio's AI to write a library formula for one brand (see
 * ./formula-adapt.server), as the kit editor asks and hears back. Shared by
 * the server, the browser and tests.
 */
import { z } from "zod";
import { CHANNELS } from "./dna";

export const formulaAdaptRequest = z.object({
  /** The library formula to write from. */
  formulaId: z.string().trim().min(1).max(60),
  /** The brand as the kit editor holds it (read tolerantly). */
  brand: z.object({
    name: z.string().trim().min(1).max(120),
    website: z.string().trim().max(200).nullable(),
    tagline: z.string().trim().max(160).nullable(),
    callToAction: z.string().trim().max(60).nullable(),
    terms: z.array(z.string().trim().max(80)).max(50),
    design: z.record(z.string(), z.unknown()),
    dna: z.record(z.string(), z.unknown()),
  }),
  /** The audience it is for (one of the DNA's), if one. */
  audience: z.string().trim().max(80).nullable(),
  channel: z.enum(CHANNELS).nullable(),
  seconds: z.number().int().min(5).max(600).nullable(),
  /** Anything else the person wants of it. */
  note: z.string().trim().max(600).nullable(),
  /** Ids the brand's formulas already have, so the new one gets its own. */
  taken: z.array(z.string().max(60)).max(16),
});
export type FormulaAdaptRequest = z.input<typeof formulaAdaptRequest>;

export type FormulaAdaptEvent =
  /** The formula as written (not saved: a person looks it over). */
  | { type: "formula"; formula: Record<string, unknown>; model: string | null }
  | { type: "error"; error: string };
