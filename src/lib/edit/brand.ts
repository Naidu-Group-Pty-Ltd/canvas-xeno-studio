/**
 * A brand kit: the brand's name, logo, end-card background, fonts, colours
 * and title style, its tagline and call to action, and the names its
 * captions must spell right. Applied to an edit, its titles and captions
 * take the kit's fonts and colours; its end card is composed from it inside
 * the area the platform's own buttons and captions leave clear.
 *
 * Shared by the server, the browser and tests.
 */
import {
  BRAND_FONT_BUCKET,
  BRAND_FONT_PREFIX,
  FONT_FAMILY_PATTERN,
  isBrandFontFile,
} from "./font-family";
import {
  designOf,
  paletteOf,
  sourceOf,
  type BrandDesign,
  type BrandSource,
  type PaletteColour,
} from "../brand/design";
import { dnaOf, type BrandDna } from "../brand/dna";
import type { BrandFormula } from "../brand/formulas";
import { ownFormulasOf } from "../brand/own-formulas";
import {
  aspectQuotient,
  layoutTimeline,
  LIMITS,
  newId,
  type AspectRatio,
  type ImageOverlay,
  type Overlay,
  type OverlayBacking,
  type Timeline,
  type TimelineClip,
} from "./timeline";

export { BRAND_FONT_BUCKET, BRAND_FONT_PREFIX, isBrandFontFile };

/** The typeface titles are set in without a brand font. */
export const DEFAULT_FONT = "Inter";

export interface BrandFont {
  /** The family the file names itself by (see ./font-family). */
  family: string;
  bucket: string;
  path: string;
}

/** The families a kit's text can be set in: Inter, then its own, each once. */
export function fontChoices(fonts: readonly { family: string }[]): string[] {
  return [...new Set([DEFAULT_FONT, ...fonts.map((font) => font.family)])];
}

export interface BrandKit {
  id: string;
  name: string;
  projectId: string | null;
  isDefault: boolean;
  logoAssetId: string | null;
  endCardAssetId: string | null;
  /** Families for titles and for subtitles and captions (null: Inter). */
  headingFont: string | null;
  bodyFont: string | null;
  fonts: BrandFont[];
  textColor: string;
  accentColor: string;
  backgroundColor: string;
  titleBacking: OverlayBacking;
  uppercaseTitles: boolean;
  tagline: string | null;
  callToAction: string | null;
  website: string | null;
  /** Names captions must spell right (the brand dictionary). */
  terms: string[];
  /** The brand's whole palette, each colour with its role (see ../brand/design). */
  palette: PaletteColour[];
  /** Its design language: type, imagery, voice, rules and the line generations carry. */
  design: BrandDesign;
  /** Where its design system was imported from, if it was. */
  source: BrandSource | null;
  /** Library images that show its look, used as style references. */
  referenceAssetIds: string[];
  /** What kind of brand it is and what it stands for, and the formulas it works with (see ../brand/dna). */
  dna: BrandDna;
  /** The formulas written for this brand (see ../brand/own-formulas), first wherever it plans content. */
  ownFormulas: BrandFormula[];
}

const HEX = /^#[0-9a-f]{6}$/i;

type Json = Record<string, unknown>;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** A brand kit's fonts as stored (only well-formed ones, kept where brand fonts are). */
export function brandFontsOf(value: unknown): BrandFont[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = (entry ?? {}) as Json;
    const font = {
      family: text(record["family"]) ?? "",
      bucket: text(record["bucket"]) ?? "",
      path: text(record["path"]) ?? "",
    };
    return FONT_FAMILY_PATTERN.test(font.family) && isBrandFontFile(font) ? [font] : [];
  });
}

/** A brand kit from its database row. */
export function brandKitOf(row: Json): BrandKit {
  const colour = (value: unknown, fallback: string) =>
    typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
  const family = (value: unknown) => {
    const name = text(value);
    return name && name !== DEFAULT_FONT && FONT_FAMILY_PATTERN.test(name) ? name : null;
  };
  const backing = row["title_backing"];
  return {
    id: String(row["id"]),
    name: text(row["name"]) ?? "Brand",
    projectId: text(row["project_id"]),
    isDefault: row["is_default"] === true,
    logoAssetId: text(row["logo_asset_id"]),
    endCardAssetId: text(row["end_card_asset_id"]),
    headingFont: family(row["heading_font"]),
    bodyFont: family(row["body_font"]),
    fonts: brandFontsOf(row["fonts"]),
    textColor: colour(row["text_color"], "#ffffff"),
    accentColor: colour(row["accent_color"], "#2563eb"),
    backgroundColor: colour(row["background_color"], "#0b1020"),
    titleBacking: backing === "outline" || backing === "box" ? backing : "halo",
    uppercaseTitles: row["uppercase_titles"] === true,
    tagline: text(row["tagline"]),
    callToAction: text(row["call_to_action"]),
    website: text(row["website"]),
    terms: Array.isArray(row["terms"])
      ? (row["terms"] as unknown[]).flatMap((term) => (text(term) ? [text(term)!] : []))
      : [],
    // Kits from before design systems (migration 0021) have none of these yet.
    palette: paletteOf(row["palette"]),
    design: designOf(row["design"]),
    source: sourceOf(row["source"]),
    referenceAssetIds: Array.isArray(row["reference_asset_ids"])
      ? (row["reference_asset_ids"] as unknown[]).flatMap((id) =>
          typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? [id] : [],
        )
      : [],
    // Kits from before brand DNA (migration 0023) have none yet.
    dna: dnaOf(row["dna"]),
    // And from before its own formulas (migration 0024), none.
    ownFormulas: ownFormulasOf(row["formulas"]),
  };
}

/** The kit that applies to a project: its own, else the team's default. */
export function kitForProject(kits: BrandKit[], projectId: string | null): BrandKit | null {
  return (
    (projectId ? kits.find((kit) => kit.projectId === projectId) : undefined) ??
    kits.find((kit) => kit.isDefault) ??
    null
  );
}

/** Black or white, whichever reads better on a colour (the higher WCAG contrast ratio). */
export function contrastOn(hex: string): "#000000" | "#ffffff" {
  const value = HEX.test(hex) ? hex : "#000000";
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const onBlack = (luminance + 0.05) / 0.05;
  const onWhite = 1.05 / (luminance + 0.05);
  return onBlack > onWhite ? "#000000" : "#ffffff";
}

/* ------------------------------------------------------------------ */
/* Safe areas                                                          */
/* ------------------------------------------------------------------ */

/** Platforms whose own buttons and captions cover part of the picture. */
export const SAFE_AREAS = ["none", "tiktok", "reels", "shorts", "youtube"] as const;
export type SafeArea = (typeof SAFE_AREAS)[number];
export const SAFE_AREA_LABELS: Record<SafeArea, string> = {
  none: "Title-safe only",
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
  youtube: "YouTube (wide)",
};

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The share of the frame (per side) a platform's own interface covers, for
 * text and logos to keep out of: its caption and buttons along the bottom
 * and up the right, its header along the top.
 */
export function safeInsets(area: SafeArea, aspect: AspectRatio): Insets {
  const portrait = aspectQuotient(aspect) < 1;
  switch (area) {
    case "tiktok":
      return { top: 0.08, bottom: 0.21, left: 0.06, right: 0.13 };
    case "reels":
      return { top: 0.13, bottom: 0.22, left: 0.06, right: 0.12 };
    case "shorts":
      return { top: 0.08, bottom: 0.18, left: 0.06, right: 0.12 };
    case "youtube":
      return portrait
        ? { top: 0.08, bottom: 0.18, left: 0.06, right: 0.12 }
        : { top: 0.05, bottom: 0.12, left: 0.05, right: 0.05 };
    default:
      return { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 };
  }
}

/* ------------------------------------------------------------------ */
/* Applying a kit                                                      */
/* ------------------------------------------------------------------ */

/** A brand's look for one title, subtitle or call to action. */
export function brandedOverlay(overlay: Overlay, kit: BrandKit): Overlay {
  const font = overlay.style === "subtitle" ? kit.bodyFont : kit.headingFont;
  if (overlay.style === "cta")
    return {
      ...overlay,
      font,
      accent: kit.accentColor,
      color: contrastOn(kit.accentColor),
    };
  return {
    ...overlay,
    font,
    color: kit.textColor,
    accent: kit.accentColor,
    backing: kit.titleBacking,
    text:
      kit.uppercaseTitles && overlay.style === "title" ? overlay.text.toUpperCase() : overlay.text,
  };
}

/** An edit in a brand's look: its titles, calls to action and captions in the kit's fonts and colours. */
export function applyBrandKit(timeline: Timeline, kit: BrandKit): Timeline {
  const families = new Set([kit.headingFont, kit.bodyFont].filter(Boolean));
  return {
    ...timeline,
    brandKitId: kit.id,
    fonts: kit.fonts.filter((font) => families.has(font.family)).slice(0, LIMITS.fonts),
    overlays: timeline.overlays.map((overlay) => brandedOverlay(overlay, kit)),
    captions: {
      ...timeline.captions,
      font: kit.bodyFont,
      color: kit.textColor,
      accent: kit.accentColor,
    },
  };
}

/** An edit back in the studio's own text style: no kit's fonts, colours or font files. */
export function clearBrand(timeline: Timeline): Timeline {
  return {
    ...timeline,
    brandKitId: null,
    fonts: [],
    overlays: timeline.overlays.map((overlay) => ({
      ...overlay,
      font: null,
      color: null,
      accent: null,
    })),
    captions: { ...timeline.captions, font: null, color: null, accent: null },
  };
}

/* ------------------------------------------------------------------ */
/* End card                                                            */
/* ------------------------------------------------------------------ */

export interface EndCardLayout {
  /** Centres (0-1 down the frame) of the logo, tagline, call to action and website. */
  logoY: number;
  taglineY: number;
  ctaY: number;
  websiteY: number;
  /** Centre across the frame: the middle of the area left clear. */
  x: number;
  /** The logo's width as a share of the frame's. */
  logoWidth: number;
}

/**
 * Where an end card's parts go: stacked in the middle of the area the
 * platform leaves clear, the logo in its upper part and the words below.
 */
export function endCardLayout(aspect: AspectRatio, area: SafeArea): EndCardLayout {
  const insets = safeInsets(area, aspect);
  const top = insets.top;
  const bottom = 1 - insets.bottom;
  const room = bottom - top;
  const clamp = (value: number) =>
    Math.max(Math.max(0.04, top + 0.03), Math.min(Math.min(0.96, bottom - 0.03), value));
  const portrait = aspectQuotient(aspect) < 1;
  return {
    logoY: Number(clamp(top + room * 0.34).toFixed(4)),
    taglineY: Number(clamp(top + room * 0.6).toFixed(4)),
    ctaY: Number(clamp(top + room * 0.74).toFixed(4)),
    websiteY: Number(clamp(top + room * 0.86).toFixed(4)),
    x: Number(((insets.left + (1 - insets.right)) / 2).toFixed(4)),
    logoWidth: portrait ? 0.38 : aspect === "1:1" ? 0.3 : 0.2,
  };
}

export interface EndCardInput {
  /** How long it holds (seconds). */
  seconds: number;
  area: SafeArea;
  /** What it is set on: the kit's end-card background, or a still in the brand's colour. */
  background: { assetId: string; kind: "video" | "image"; durationSeconds: number | null };
  /** The logo laid over it (null for none). */
  logoAssetId: string | null;
}

/**
 * An edit with the brand's end card after its last clip: its background as
 * a clip (dissolving in from the clip before), the logo over it, and the
 * tagline, call to action and website below, all inside the area the
 * platform leaves clear. Each part is an ordinary clip, picture or title, so
 * it can be changed like any other.
 */
export function addEndCard(timeline: Timeline, kit: BrandKit, input: EndCardInput): Timeline {
  const seconds = Math.max(1, Math.min(input.seconds, LIMITS.clipSeconds));
  const length =
    input.background.kind === "video" && input.background.durationSeconds
      ? Math.min(seconds, input.background.durationSeconds)
      : seconds;
  const clip: TimelineClip = {
    id: newId(),
    assetId: input.background.assetId,
    kind: input.background.kind,
    trimStart: 0,
    duration: Number(length.toFixed(3)),
    speed: 1,
    volume: 0,
    fit: "cover",
    focus: null,
    motion: "none",
    transition: timeline.clips.length
      ? { type: "fade", duration: 0.5 }
      : { type: "cut", duration: 0 },
    matchPrevious: false,
    smartBlend: false,
    label: "End card",
    sourceDuration: input.background.durationSeconds,
  };
  const withCard: Timeline = {
    ...timeline,
    clips: [...timeline.clips, clip].slice(0, LIMITS.clips),
  };
  const laid = layoutTimeline(withCard).clips.at(-1);
  if (!laid || laid.clip.id !== clip.id) return timeline;
  const to = Number(laid.end.toFixed(3));
  // Once it has dissolved in; on a card too short for that, from its start.
  const settled = laid.start + laid.transitionIn + 0.2;
  const from = Number((settled < to - 0.3 ? settled : laid.start).toFixed(3));
  const place = endCardLayout(timeline.aspectRatio, input.area);

  const images: ImageOverlay[] = input.logoAssetId
    ? [
        {
          id: newId(),
          assetId: input.logoAssetId,
          start: from,
          end: to,
          x: place.x,
          y: place.logoY,
          width: place.logoWidth,
          opacity: 1,
          fade: 0.4,
          label: "Logo",
        },
      ]
    : [];
  const overlay = (value: string | null, style: Overlay["style"], y: number): Overlay[] =>
    value
      ? [
          brandedOverlay(
            {
              id: newId(),
              text: value,
              start: from,
              end: to,
              style,
              position: "center",
              y,
              backing: "outline",
              font: null,
              color: null,
              accent: null,
            },
            kit,
          ),
        ]
      : [];
  const overlays = [
    ...overlay(kit.tagline, "subtitle", place.taglineY),
    ...overlay(kit.callToAction, "cta", place.ctaY),
    ...overlay(kit.website, "subtitle", place.websiteY),
  ];
  return applyFontsFor(
    {
      ...withCard,
      images: [...withCard.images, ...images].slice(0, LIMITS.images),
      overlays: [...withCard.overlays, ...overlays].slice(0, LIMITS.overlays),
      brandKitId: kit.id,
    },
    kit,
  );
}

/** Carries the kit's font files an edit's text now asks for. */
function applyFontsFor(timeline: Timeline, kit: BrandKit): Timeline {
  const have = new Set(timeline.fonts.map((font) => font.family));
  const wanted = new Set(
    [...timeline.overlays.map((overlay) => overlay.font), timeline.captions.font].filter(
      (family): family is string => !!family && !have.has(family),
    ),
  );
  const added = kit.fonts.filter((font) => wanted.has(font.family));
  return added.length
    ? { ...timeline, fonts: [...timeline.fonts, ...added].slice(0, LIMITS.fonts) }
    : timeline;
}
