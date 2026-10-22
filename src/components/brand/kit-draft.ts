/**
 * A brand kit as the kit editor holds it while it is changed (see
 * ./BrandKitsPanel): fonts, colours, words, its design system and its DNA.
 */
import { EMPTY_DESIGN, type BrandDesign, type PaletteColour } from "@/lib/brand/design";
import { EMPTY_DNA, type BrandDna } from "@/lib/brand/dna";
import type { BrandFormula } from "@/lib/brand/formulas";
import { EMPTY_PRODUCTION, type BrandProduction } from "@/lib/brand/production";
import { DEFAULT_FONT, type BrandFont, type BrandKit } from "@/lib/edit/brand";
import type { OverlayBacking } from "@/lib/edit/timeline";

export interface Draft {
  id: string | null;
  name: string;
  projectId: string | null;
  isDefault: boolean;
  logoAssetId: string | null;
  endCardAssetId: string | null;
  headingFont: string;
  bodyFont: string;
  fonts: BrandFont[];
  textColor: string;
  accentColor: string;
  backgroundColor: string;
  titleBacking: OverlayBacking;
  uppercaseTitles: boolean;
  tagline: string;
  callToAction: string;
  website: string;
  terms: string;
  palette: PaletteColour[];
  design: BrandDesign;
  referenceAssetIds: string[];
  dna: BrandDna;
  /** The formulas written for this brand. */
  ownFormulas: BrandFormula[];
  /** The roles its graphics are drawn in, and how they move. */
  production: BrandProduction;
}

export const EMPTY: Draft = {
  id: null,
  name: "",
  projectId: null,
  isDefault: false,
  logoAssetId: null,
  endCardAssetId: null,
  headingFont: DEFAULT_FONT,
  bodyFont: DEFAULT_FONT,
  fonts: [],
  textColor: "#ffffff",
  accentColor: "#2563eb",
  backgroundColor: "#0b1020",
  titleBacking: "halo",
  uppercaseTitles: false,
  tagline: "",
  callToAction: "",
  website: "",
  terms: "",
  palette: [],
  design: EMPTY_DESIGN,
  referenceAssetIds: [],
  dna: EMPTY_DNA,
  ownFormulas: [],
  production: EMPTY_PRODUCTION,
};

export function draftOf(kit: BrandKit): Draft {
  return {
    id: kit.id,
    name: kit.name,
    projectId: kit.projectId,
    isDefault: kit.isDefault,
    logoAssetId: kit.logoAssetId,
    endCardAssetId: kit.endCardAssetId,
    headingFont: kit.headingFont ?? DEFAULT_FONT,
    bodyFont: kit.bodyFont ?? DEFAULT_FONT,
    fonts: kit.fonts,
    textColor: kit.textColor,
    accentColor: kit.accentColor,
    backgroundColor: kit.backgroundColor,
    titleBacking: kit.titleBacking,
    uppercaseTitles: kit.uppercaseTitles,
    tagline: kit.tagline ?? "",
    callToAction: kit.callToAction ?? "",
    website: kit.website ?? "",
    terms: kit.terms.join("\n"),
    palette: kit.palette,
    design: kit.design,
    referenceAssetIds: kit.referenceAssetIds,
    dna: kit.dna,
    ownFormulas: kit.ownFormulas,
    production: kit.production,
  };
}
