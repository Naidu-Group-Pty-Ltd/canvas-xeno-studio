/**
 * The family a TrueType or OpenType font file names itself by (its "name"
 * table's font family, name ID 1), as the media service's subtitle renderer
 * matches it. Read when a brand font is uploaded, so titles ask for the font
 * by its own name, and again by the server before the font is kept. The same
 * reading as media-worker/src/fonts.js.
 *
 * Shared by the server, the browser and tests.
 */

/** What a family name may be: it goes into the subtitle file, where commas and braces mean something. */
export const FONT_FAMILY_PATTERN = /^[\p{L}\p{N} ._'&+-]{1,80}$/u;

/** Where brand fonts are kept: the upload bucket, under this folder. */
export const BRAND_FONT_BUCKET = "generation-inputs";
export const BRAND_FONT_PREFIX = "brand-fonts/";

/** Whether a font file is one kept where brand fonts are (nothing else is ever signed for a render). */
export function isBrandFontFile(font: { bucket: string; path: string }): boolean {
  return (
    font.bucket === BRAND_FONT_BUCKET &&
    font.path.startsWith(BRAND_FONT_PREFIX) &&
    !font.path.includes("..") &&
    /^[\w/.-]{1,300}$/.test(font.path)
  );
}

/** The kind of font file from its first bytes, or null when it isn't one the studio can use. */
export function fontKind(bytes: Uint8Array): "ttf" | "otf" | "ttc" | null {
  if (bytes.length < 12) return null;
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === "OTTO") return "otf";
  if (tag === "ttcf") return "ttc";
  if (tag === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0))
    return "ttf";
  return null;
}

function decodeName(bytes: Uint8Array, platform: number, encoding: number): string | null {
  // Windows and Unicode names are UTF-16 (big-endian); Mac Roman is close enough to Latin-1 for a name.
  if (platform === 3 || platform === 0) {
    let text = "";
    for (let index = 0; index + 1 < bytes.length; index += 2)
      text += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
    return text;
  }
  if (platform === 1 && encoding === 0) return String.fromCharCode(...bytes);
  return null;
}

/** The font's family, or null when the file can't be read as a font (WOFF files aren't). */
export function fontFamily(bytes: Uint8Array): string | null {
  const kind = fontKind(bytes);
  if (!kind) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const base = kind === "ttc" ? view.getUint32(12) : 0;
    const tables = view.getUint16(base + 4);
    let name: { offset: number } | null = null;
    for (let index = 0; index < tables; index += 1) {
      const record = base + 12 + index * 16;
      const tag = String.fromCharCode(
        bytes[record]!,
        bytes[record + 1]!,
        bytes[record + 2]!,
        bytes[record + 3]!,
      );
      if (tag === "name") {
        name = { offset: view.getUint32(record + 8) };
        break;
      }
    }
    if (!name || name.offset + 6 > bytes.length) return null;
    const count = view.getUint16(name.offset + 2);
    const strings = name.offset + view.getUint16(name.offset + 4);
    let best: { rank: number; text: string } | null = null;
    for (let index = 0; index < count; index += 1) {
      const record = name.offset + 6 + index * 12;
      if (record + 12 > bytes.length) break;
      const platform = view.getUint16(record);
      const encoding = view.getUint16(record + 2);
      const language = view.getUint16(record + 4);
      if (view.getUint16(record + 6) !== 1) continue;
      const length = view.getUint16(record + 8);
      const start = strings + view.getUint16(record + 10);
      if (start + length > bytes.length) continue;
      const text = decodeName(bytes.subarray(start, start + length), platform, encoding)?.trim();
      if (!text) continue;
      // English (US) on Windows first, then any Windows name, then any other.
      const rank = platform === 3 && language === 0x0409 ? 0 : platform === 3 ? 1 : 2;
      if (!best || rank < best.rank) best = { rank, text };
    }
    return best ? best.text.slice(0, 80) : null;
  } catch {
    return null;
  }
}
