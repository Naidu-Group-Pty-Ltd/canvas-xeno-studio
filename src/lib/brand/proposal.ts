/**
 * What a brand import proposes: a brand kit and its design system, read from
 * the brand's website or guidelines, for a person to look over before it is
 * kept. The scan's findings (colours, fonts, logo and imagery found, copy)
 * travel with it, so the review can offer what the AI left out.
 *
 * Shared by the server, the browser and tests.
 */
import type { BrandFont } from "../edit/brand";
import type { OverlayBacking } from "../edit/timeline";
import { colourName, deltaE2000, isNeutral, relativeLuminance } from "./colour";
import {
  clip,
  designOf,
  EMPTY_DESIGN,
  kitColoursOf,
  normalizeHex,
  paletteOf,
  wordsOf,
  type BrandDesign,
  type BrandTypeface,
  type PaletteColour,
  type PaletteRole,
} from "./design";
import { dnaOf, EMPTY_DNA, type BrandDna } from "./dna";

/** A file an import keeps for the review: a logo, a picture of the brand's look, a page of its guidelines. */
export interface StagedImage {
  key: string;
  kind: "logo" | "image" | "page";
  bucket: string;
  path: string;
  mime: string;
  width: number | null;
  height: number | null;
  /** Where it was found: its address on the site, "inline SVG" or "page 3". */
  origin: string | null;
  bytes: number;
}

/** A typeface the brand uses, and the font file the kit can set it in. */
export interface ProposedFont {
  role: "heading" | "body";
  /** The brand's own family. */
  family: string;
  category: BrandTypeface["category"];
  weight: number | null;
  source: BrandTypeface["source"];
  /** A close Google font when the brand's own can't be installed. */
  alternative: string | null;
  /** The file installed for it (the brand's own family, or the alternative), if one could be. */
  installed: BrandFont | null;
}

/** A colour the scan found, with how much the brand uses it (0–1 of all colour use). */
export interface FoundColour {
  hex: string;
  name: string;
  share: number;
  neutral: boolean;
  /** Where it was found: CSS properties, variable names, "theme-color", "PMS 286 C"… */
  from: string[];
}

/** What a scan found, kept with the import. */
export interface ScanSignals {
  url: string | null;
  title: string | null;
  description: string | null;
  colours: FoundColour[];
  fonts: { family: string; roles: string[]; share: number }[];
  googleFonts: string[];
  adobeFonts: boolean;
  headings: string[];
  ctas: string[];
  /** For a document: how many pages and characters were read. */
  pages: number | null;
  characters: number | null;
}

export interface BrandProposal {
  name: string;
  website: string | null;
  tagline: string | null;
  callToAction: string | null;
  terms: string[];
  palette: PaletteColour[];
  /** The kit's title, accent and end-card colours. */
  colours: { text: string; accent: string; background: string };
  fonts: ProposedFont[];
  logos: StagedImage[];
  /** The logo picked (a key of `logos`), if any. */
  logo: string | null;
  imagery: StagedImage[];
  /** Pictures picked as style references (keys of `imagery`). */
  references: string[];
  design: BrandDesign;
  titleBacking: OverlayBacking;
  uppercaseTitles: boolean;
  /** What the import couldn't do, or wants a person to know. */
  notes: string[];
  /** What kind of brand it is, as read (see ./dna); empty when read from the scan alone. */
  dna: BrandDna;
  /** The AI model that read it (null: read without AI, from the scan alone). */
  model: string | null;
}

export const PROPOSAL_LIMITS = {
  colours: 40,
  fonts: 12,
  logos: 4,
  imagery: 8,
  pages: 10,
  references: 8,
  notes: 8,
} as const;

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function stagedOf(value: unknown, max: number): StagedImage[] {
  if (!Array.isArray(value)) return [];
  const out: StagedImage[] = [];
  for (const entry of value) {
    const item = record(entry);
    const key = clip(item["key"], 40);
    const bucket = clip(item["bucket"], 64);
    const path = clip(item["path"], 400);
    const kind = item["kind"];
    if (!key || !bucket || !path || (kind !== "logo" && kind !== "image" && kind !== "page"))
      continue;
    out.push({
      key,
      kind,
      bucket,
      path,
      mime: clip(item["mime"], 40) ?? "image/png",
      width: finite(item["width"]),
      height: finite(item["height"]),
      origin: clip(item["origin"], 400),
      bytes: finite(item["bytes"]) ?? 0,
    });
    if (out.length >= max) break;
  }
  return out;
}

function fontsOf(value: unknown): ProposedFont[] {
  if (!Array.isArray(value)) return [];
  const out: ProposedFont[] = [];
  for (const entry of value) {
    const item = record(entry);
    const family = clip(item["family"], 80);
    const role = item["role"];
    if (!family || (role !== "heading" && role !== "body")) continue;
    const installed = record(item["installed"]);
    const face = designOf({ typography: [{ ...item, role }] }).typography[0];
    out.push({
      role,
      family,
      category: face?.category ?? null,
      weight: face?.weight ?? null,
      source: face?.source ?? "unknown",
      alternative: clip(item["alternative"], 80),
      installed:
        typeof installed["family"] === "string" &&
        typeof installed["bucket"] === "string" &&
        typeof installed["path"] === "string"
          ? { family: installed["family"], bucket: installed["bucket"], path: installed["path"] }
          : null,
    });
    if (out.length >= 4) break;
  }
  return out;
}

/** A stored proposal, or null when there isn't a readable one. */
export function proposalOf(value: unknown): BrandProposal | null {
  const item = record(value);
  const name = clip(item["name"], 120);
  if (!name) return null;
  const palette = paletteOf(item["palette"]);
  const colours = record(item["colours"]);
  const fallback = kitColoursOf(palette);
  const logos = stagedOf(item["logos"], PROPOSAL_LIMITS.logos);
  const imagery = stagedOf(item["imagery"], PROPOSAL_LIMITS.imagery + PROPOSAL_LIMITS.pages);
  const logo = clip(item["logo"], 40);
  const backing = item["titleBacking"];
  return {
    name,
    website: clip(item["website"], 120),
    tagline: clip(item["tagline"], 160),
    callToAction: clip(item["callToAction"], 60),
    terms: wordsOf(item["terms"], 50, 80),
    palette,
    colours: {
      text: normalizeHex(colours["text"]) ?? fallback.text,
      accent: normalizeHex(colours["accent"]) ?? fallback.accent,
      background: normalizeHex(colours["background"]) ?? fallback.background,
    },
    fonts: fontsOf(item["fonts"]),
    logos,
    logo: logo && logos.some((entry) => entry.key === logo) ? logo : null,
    imagery,
    references: wordsOf(item["references"], PROPOSAL_LIMITS.references, 40).filter((key) =>
      imagery.some((entry) => entry.key === key),
    ),
    design: designOf(item["design"]),
    titleBacking: backing === "outline" || backing === "box" ? backing : "halo",
    uppercaseTitles: item["uppercaseTitles"] === true,
    notes: wordsOf(item["notes"], PROPOSAL_LIMITS.notes, 300),
    // Imports from before brand DNA have none.
    dna: dnaOf(item["dna"]),
    model: clip(item["model"], 120),
  };
}

/** Stored scan findings, or empty ones. */
export function signalsOf(value: unknown): ScanSignals {
  const item = record(value);
  const colours: FoundColour[] = [];
  for (const entry of Array.isArray(item["colours"]) ? item["colours"] : []) {
    const colour = record(entry);
    const hex = normalizeHex(colour["hex"]);
    if (!hex) continue;
    colours.push({
      hex,
      name: clip(colour["name"], 40) ?? hex,
      share: Math.max(0, Math.min(1, finite(colour["share"]) ?? 0)),
      neutral: colour["neutral"] === true,
      from: wordsOf(colour["from"], 6, 60),
    });
    if (colours.length >= PROPOSAL_LIMITS.colours) break;
  }
  const fonts = (Array.isArray(item["fonts"]) ? item["fonts"] : []).flatMap((entry) => {
    const font = record(entry);
    const family = clip(font["family"], 80);
    return family
      ? [{ family, roles: wordsOf(font["roles"], 4, 20), share: finite(font["share"]) ?? 0 }]
      : [];
  });
  return {
    url: clip(item["url"], 2000),
    title: clip(item["title"], 300),
    description: clip(item["description"], 500),
    colours,
    fonts: fonts.slice(0, PROPOSAL_LIMITS.fonts),
    googleFonts: wordsOf(item["googleFonts"], 12, 80),
    adobeFonts: item["adobeFonts"] === true,
    headings: wordsOf(item["headings"], 12, 120),
    ctas: wordsOf(item["ctas"], 16, 60),
    pages: finite(item["pages"]),
    characters: finite(item["characters"]),
  };
}

/* ------------------------------------------------------------------ */
/* Building a proposal                                                 */
/* ------------------------------------------------------------------ */

/**
 * A colour an AI named, held to what was found: it becomes the found colour
 * it is within `maxDelta` (CIEDE2000) of, so a near-miss reads as the
 * brand's exact colour. Colours far from anything found are kept as given
 * (read from a picture, or a guideline's own code).
 */
export function snapToFound(hex: string, found: { hex: string }[], maxDelta = 6): string {
  let best: { hex: string; delta: number } | null = null;
  for (const colour of found) {
    const delta = deltaE2000(hex, colour.hex);
    if (delta <= maxDelta && (!best || delta < best.delta)) best = { hex: colour.hex, delta };
  }
  return best?.hex ?? hex;
}

/**
 * Roles for found colours when no AI read them: the brand's most-used
 * colourful colour is its primary, the next distinct ones its accent (most
 * brands pair one signature colour with one for calls to action) and
 * secondary; the most-used light and dark neutrals its background and text.
 */
export function paletteFromFound(found: FoundColour[], max = 8): PaletteColour[] {
  const vivid = found.filter((colour) => !colour.neutral);
  const neutral = found.filter((colour) => colour.neutral);
  const picked: { colour: FoundColour; role: PaletteRole }[] = [];
  const distinct = (hex: string) => picked.every((entry) => deltaE2000(entry.colour.hex, hex) > 12);
  for (const role of ["primary", "accent", "secondary"] as const) {
    const next = vivid.find((colour) => distinct(colour.hex));
    if (next) picked.push({ colour: next, role });
  }
  const light = neutral.find((colour) => relativeLuminance(colour.hex) > 0.75);
  const dark = neutral.find((colour) => relativeLuminance(colour.hex) < 0.1);
  if (light && distinct(light.hex)) picked.push({ colour: light, role: "background" });
  if (dark && distinct(dark.hex)) picked.push({ colour: dark, role: "text" });
  for (const colour of found) {
    if (picked.length >= max) break;
    if (distinct(colour.hex)) picked.push({ colour, role: colour.neutral ? "muted" : "other" });
  }
  return picked.map(({ colour, role }) => ({
    hex: colour.hex,
    name: colour.name || colourName(colour.hex),
    role,
    usage: null,
  }));
}

/** An AI's palette made safe: real colours, found ones where it nearly named one, named, each role sensible. */
export function finishPalette(answer: unknown, found: FoundColour[]): PaletteColour[] {
  const palette = paletteOf(answer).map((colour) => {
    const hex = snapToFound(colour.hex, found);
    const known = found.find((entry) => entry.hex === hex);
    return {
      ...colour,
      hex,
      name:
        colour.name && colour.name !== colour.hex ? colour.name : (known?.name ?? colourName(hex)),
    };
  });
  // Snapping can make two entries the same colour: the first keeps it.
  const unique = paletteOf(palette);
  if (!unique.length) return paletteFromFound(found);
  // A palette whose colours are all neutrals still names its strongest as primary.
  if (!unique.some((colour) => colour.role === "primary")) {
    const lead = unique.find((colour) => !isNeutral(colour.hex)) ?? unique[0]!;
    lead.role = "primary";
  }
  return unique;
}

/** A proposal from the scan alone (no AI): its colours and fonts, and what the page says of itself. */
export function proposalFromScan(input: {
  name: string;
  signals: ScanSignals;
  fonts: ProposedFont[];
  logos: StagedImage[];
  imagery: StagedImage[];
  website: string | null;
  tagline: string | null;
  notes: string[];
}): BrandProposal {
  const palette = paletteFromFound(input.signals.colours);
  return {
    name: input.name,
    website: input.website,
    tagline: input.tagline,
    callToAction: input.signals.ctas[0] ?? null,
    terms: [input.name],
    palette,
    colours: kitColoursOf(palette),
    fonts: input.fonts,
    logos: input.logos,
    logo: input.logos[0]?.key ?? null,
    imagery: input.imagery,
    references: input.imagery
      .filter((image) => image.kind === "image")
      .slice(0, 4)
      .map((image) => image.key),
    design: {
      ...EMPTY_DESIGN,
      summary: input.signals.description,
      typography: input.fonts.map((font) => ({
        role: font.role,
        family: font.family,
        category: font.category,
        weight: font.weight,
        source: font.source,
        rendered: font.installed?.family ?? null,
        notes: null,
      })),
    },
    titleBacking: "halo",
    uppercaseTitles: false,
    notes: input.notes,
    dna: EMPTY_DNA,
    model: null,
  };
}

/** The site's own address, as a kit shows it: "aurixasystems.com.au". */
export function websiteOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** A brand's name from what a page says of itself: its JSON-LD or site name, else its title's first part. */
export function brandNameOf(input: {
  jsonLdName?: string | null;
  siteName?: string | null;
  title?: string | null;
  url?: string | null;
}): string {
  const direct = clip(input.jsonLdName, 120) ?? clip(input.siteName, 120);
  if (direct) return direct;
  const title = clip(input.title, 200);
  if (title) {
    const parts = title.split(/\s+[|·–—-]\s+|\s*:\s+/).filter((part) => part.trim().length > 1);
    // "Home | Aurixa Systems" names the brand last; "Aurixa Systems | Home" first.
    const generic = /^(home|welcome|homepage|official site)$/i;
    const named = parts.find((part) => !generic.test(part.trim()));
    if (named) return clip(named, 120)!;
  }
  const host = websiteOf(input.url ?? null);
  if (host) {
    const word = host.split(".")[0] ?? host;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return "Brand";
}
