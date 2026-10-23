/**
 * Installing a brand's typeface from Google Fonts, so titles and captions
 * render in it: Google answers the studio (an agent it doesn't know) with
 * TrueType files, which is what the media service's subtitle renderer
 * reads. A font is installed once per family, weight and face (its regular,
 * and its italic where it has one) and shared by every kit that uses it. Fonts from anywhere else (Adobe Fonts, a brand's own
 * files) are licensed, so they are never copied from a site: the kit uses a
 * close Google font until someone uploads the licensed file.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BrandFont } from "../edit/brand";
import {
  BRAND_FONT_BUCKET,
  BRAND_FONT_PREFIX,
  FONT_FAMILY_PATTERN,
  fontFamily,
  fontKind,
  fontStyle,
  isBrandFontFile,
} from "../edit/font-family";
import { decodeText, fetchCapped } from "./fetch.server";
import { googleFontsCssUrl, parseFontFaceRules, pickFontFile } from "./google-fonts";

const MAX_FONT_BYTES = 8 * 1024 * 1024;

/** A face of a family: its upright one, or its italic. */
export type FaceStyle = "normal" | "italic";

/** Where an installed Google font is kept: one file per family, weight and face. */
function installedPath(family: string, weight: number, style: FaceStyle = "normal"): string {
  const slug = family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${BRAND_FONT_PREFIX}google/${slug || "font"}-${weight}${style === "italic" ? "-italic" : ""}.ttf`;
}

/** A stored font file as a kit keeps it, or null when it isn't there or isn't a font. */
async function storedFont(path: string): Promise<BrandFont | null> {
  const { data, error } = await supabaseAdmin.storage.from(BRAND_FONT_BUCKET).download(path);
  if (error || !data || data.size > MAX_FONT_BYTES) return null;
  return fontAt(new Uint8Array(await data.arrayBuffer()), path);
}

/** A font file as a kit keeps it: the family and style it names itself by. */
function fontAt(bytes: Uint8Array, path: string): BrandFont | null {
  const family = fontFamily(bytes);
  if (!family || !FONT_FAMILY_PATTERN.test(family)) return null;
  const style = fontStyle(bytes)?.style;
  return { family, bucket: BRAND_FONT_BUCKET, path, ...(style ? { style } : {}) };
}

/**
 * The Google Fonts face for a family at a weight (its italic, when asked):
 * its TrueType file's address and the weight it really has. Null when Google
 * has no such family, or no italic for one asked for.
 */
export async function googleFontFace(
  family: string,
  weight: number,
  style: FaceStyle = "normal",
): Promise<{ url: string; weight: number } | null> {
  const name = family.trim();
  if (!FONT_FAMILY_PATTERN.test(name)) return null;
  const italic = style === "italic";
  // Asking for weights a family doesn't have is refused, so ask for the one wanted, then any.
  for (const weights of [[weight], [] as number[]]) {
    const cssUrl = weights.length
      ? googleFontsCssUrl(name, weights, { italic })
      : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}${italic ? ":ital@1" : ""}&display=swap`;
    const fetched = await fetchCapped(cssUrl, {
      maxBytes: 256 * 1024,
      timeoutMs: 8000,
      accept: ["text/css"],
      hosts: ["fonts.googleapis.com"],
    });
    if (!fetched.ok) continue;
    const faces = parseFontFaceRules(decodeText(fetched.bytes, "text/css"));
    const face = pickFontFile(faces, weight, style);
    // An italic asked for is an italic or nothing: never the upright face standing in.
    if (face && italic && face.style !== "italic") continue;
    // A variable face covers a range: the weight wanted, within it.
    if (face)
      return { url: face.url, weight: Math.min(Math.max(weight, face.weight), face.weightMax) };
  }
  return null;
}

/**
 * Installs a Google font at a weight (or the nearest it has) for brand kits,
 * its upright face or (asked) its italic: the TrueType file, read as a font,
 * kept under brand-fonts/google/ with the style it names itself by. Null when
 * it isn't a Google font, has no such face, or couldn't be fetched.
 */
export async function installGoogleFont(
  family: string,
  weight: number,
  style: FaceStyle = "normal",
): Promise<BrandFont | null> {
  const face = await googleFontFace(family, weight, style);
  if (!face) return null;
  const path = installedPath(family, face.weight, style);
  if (!isBrandFontFile({ bucket: BRAND_FONT_BUCKET, path })) return null;
  // The upright face as before (taken for the regular); an italic with the style it names
  // itself by, and only when the file says it is one.
  const right = (font: BrandFont | null): BrandFont | null => {
    if (!font) return null;
    if (style === "normal") return { family: font.family, bucket: font.bucket, path: font.path };
    return font.style === "italic" || font.style === "bold_italic" ? font : null;
  };

  // Already installed for another kit: the same file serves this one.
  const existing = right(await storedFont(path));
  if (existing) return existing;

  const fetched = await fetchCapped(face.url, {
    maxBytes: MAX_FONT_BYTES,
    timeoutMs: 15_000,
    hosts: ["fonts.gstatic.com"],
  });
  if (!fetched.ok) return null;
  const kind = fontKind(fetched.bytes);
  const font = right(fontAt(fetched.bytes, path));
  if (!kind || kind === "ttc" || !font) return null;
  const { error } = await supabaseAdmin.storage
    .from(BRAND_FONT_BUCKET)
    .upload(path, fetched.bytes, {
      contentType: kind === "otf" ? "font/otf" : "font/ttf",
      upsert: true,
    });
  if (error) return null;
  return font;
}

/** Typefaces nobody needs to install: what a renderer or a phone already has. */
const SYSTEM_FAMILIES = new Set([
  "arial",
  "helvetica",
  "helvetica neue",
  "times new roman",
  "times",
  "georgia",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "courier new",
  "segoe ui",
  "sf pro",
  "sf pro display",
  "sf pro text",
  "-apple-system",
  "system-ui",
  "blinkmacsystemfont",
]);

export function isSystemFamily(family: string): boolean {
  return SYSTEM_FAMILIES.has(family.trim().toLowerCase());
}
