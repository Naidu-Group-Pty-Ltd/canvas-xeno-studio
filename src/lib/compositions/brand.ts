/**
 * What a composition draws with from a brand: the roles its graphics are set
 * in (the ground, the surfaces on it, the ink, the accent and the highlight),
 * its typefaces and their files, its logo and its words, how it moves, and its
 * demo record. Read from the brand kit; where the kit doesn't name a role it
 * is mixed from the ones it does, so any kit (or none) draws.
 *
 * Shared by the browser, the server and tests.
 */
import type { BrandFont, BrandKit } from "../edit/brand";
import { DEFAULT_DEMO_RECORD, type DemoRecord } from "./demo";
import { DEFAULT_MOTION, mix, safeColour } from "./state";

export interface CompositionColours {
  /** The ground everything stands on. */
  ground: string;
  /** Cards, windows and panels on the ground. */
  surface: string;
  /** A surface raised above another (a selected row, a field). */
  raised: string;
  /** Text and icons. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Hairlines and borders. */
  line: string;
  /** The brand's working colour: links, selection, the press ring. */
  accent: string;
  /** What is celebrated: a grade, an arrival, a call to action's light. */
  highlight: string;
}

export interface CompositionBrand {
  name: string;
  colours: CompositionColours;
  /** The families text is set in (null: Inter). */
  fonts: { display: string | null; body: string | null };
  /** The brand's own font files, so the page sets text exactly as the brand does. */
  fontFiles: BrandFont[];
  logoAssetId: string | null;
  tagline: string | null;
  callToAction: string | null;
  website: string | null;
  /** How it moves: its curves (cubic-bezier numbers) and its press. */
  motion: {
    move: [number, number, number, number];
    settle: [number, number, number, number];
    pressSeconds: number;
  };
  demo: DemoRecord;
}

/** Light or dark, from the ground's luminance (what a dark glass or a light card follows). */
export function isDarkColour(hex: string): boolean {
  const value = safeColour(hex, "#000000");
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) < 0.2;
}

/** The roles from a kit's colours and palette. */
export function compositionColours(
  kit: Pick<BrandKit, "backgroundColor" | "textColor" | "accentColor" | "palette"> | null,
): CompositionColours {
  const ground = safeColour(kit?.backgroundColor, "#0b1020");
  const ink = safeColour(kit?.textColor, "#ffffff");
  const accent = safeColour(kit?.accentColor, "#2563eb");
  const role = (name: string) => kit?.palette.find((colour) => colour.role === name)?.hex ?? null;
  const dark = isDarkColour(ground);
  return {
    ground,
    surface: safeColour(role("surface"), mix(ground, ink, dark ? 0.07 : 0.04)),
    raised: mix(ground, ink, dark ? 0.13 : 0.08),
    ink,
    muted: safeColour(role("muted"), mix(ink, ground, 0.42)),
    line: mix(ground, ink, dark ? 0.2 : 0.14),
    accent,
    highlight: safeColour(role("highlight"), accent),
  };
}

/** A kit (or none) as compositions draw it. */
export function compositionBrandOf(
  kit: BrandKit | null,
  extras: {
    demo?: DemoRecord | null;
    motion?: Partial<CompositionBrand["motion"]> | null;
  } = {},
): CompositionBrand {
  return {
    name: kit?.name ?? "Brand",
    colours: compositionColours(kit),
    fonts: { display: kit?.headingFont ?? null, body: kit?.bodyFont ?? null },
    fontFiles: kit?.fonts ?? [],
    logoAssetId: kit?.logoAssetId ?? null,
    tagline: kit?.tagline ?? null,
    callToAction: kit?.callToAction ?? null,
    website: kit?.website ?? null,
    motion: {
      move: extras.motion?.move ?? DEFAULT_MOTION.move,
      settle: extras.motion?.settle ?? DEFAULT_MOTION.settle,
      pressSeconds: extras.motion?.pressSeconds ?? DEFAULT_MOTION.pressSeconds,
    },
    demo: extras.demo ?? DEFAULT_DEMO_RECORD,
  };
}

/** The fonts a page must load: the brand's files for the families it sets text in. */
export function fontFilesFor(brand: CompositionBrand): BrandFont[] {
  const wanted = new Set([brand.fonts.display, brand.fonts.body].filter((name) => !!name));
  const seen = new Set<string>();
  return brand.fontFiles.filter((font) => {
    const id = `${font.bucket}/${font.path}`;
    if (!wanted.has(font.family) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
