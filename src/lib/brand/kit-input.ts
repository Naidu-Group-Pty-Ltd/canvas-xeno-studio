/**
 * What a brand kit is saved from (see ./kits.server): checked in the browser
 * and again by the server.
 */
import { z } from "zod";
import { FONT_FAMILY_PATTERN } from "../edit/font-family";
import { DESIGN_LIMITS, PALETTE_ROLES } from "./design";

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A colour like #1a2b3c");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

export const paletteInput = z
  .array(
    z.object({
      hex: colour,
      name: z.string().trim().min(1).max(40),
      role: z.enum(PALETTE_ROLES),
      usage: z.string().trim().max(120).nullable().default(null),
    }),
  )
  .max(DESIGN_LIMITS.palette);

export const kitInput = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  projectId: z.string().uuid().nullable().default(null),
  isDefault: z.boolean().default(false),
  logoAssetId: z.string().uuid().nullable().default(null),
  endCardAssetId: z.string().uuid().nullable().default(null),
  headingFont: z.string().regex(FONT_FAMILY_PATTERN).default("Inter"),
  bodyFont: z.string().regex(FONT_FAMILY_PATTERN).default("Inter"),
  fonts: z
    .array(
      z.object({
        family: z.string().regex(FONT_FAMILY_PATTERN),
        bucket: z.string().max(64),
        path: z.string().max(300),
      }),
    )
    .max(6)
    .default([]),
  textColor: colour.default("#ffffff"),
  accentColor: colour.default("#2563eb"),
  backgroundColor: colour.default("#0b1020"),
  titleBacking: z.enum(["outline", "halo", "box"]).default("halo"),
  uppercaseTitles: z.boolean().default(false),
  tagline: optionalText(160).default(null),
  callToAction: optionalText(60).default(null),
  website: optionalText(120).default(null),
  terms: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  // The design system: left as it is when not sent (an editor that doesn't show it).
  palette: paletteInput.optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  // Its DNA (see ./dna): left as it is when not sent, like the design system.
  dna: z.record(z.string(), z.unknown()).optional(),
  // The formulas written for it (see ./own-formulas): left as they are when not sent.
  formulas: z.array(z.record(z.string(), z.unknown())).max(16).optional(),
  referenceAssetIds: z.array(z.string().uuid()).max(12).optional(),
  source: z
    .object({
      kind: z.enum(["url", "document", "repos"]),
      url: z.string().max(2000).nullable(),
      title: z.string().max(300).nullable(),
      importId: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
});
export type KitInput = z.infer<typeof kitInput>;
