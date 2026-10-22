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

/** The styles a brand's font files come in, as a family's files are told apart. */
export const FONT_STYLES = ["regular", "italic", "bold", "bold_italic"] as const;
export type FontStyle = (typeof FONT_STYLES)[number];

/** Where each table of a font file starts, by its tag (a collection's first font). */
function tableOffsets(bytes: Uint8Array): Map<string, number> | null {
  const kind = fontKind(bytes);
  if (!kind) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = kind === "ttc" ? view.getUint32(12) : 0;
  const count = view.getUint16(base + 4);
  const tables = new Map<string, number>();
  for (let index = 0; index < count; index += 1) {
    const record = base + 12 + index * 16;
    if (record + 16 > bytes.length) break;
    const offset = view.getUint32(record + 8);
    const tag = String.fromCharCode(
      bytes[record]!,
      bytes[record + 1]!,
      bytes[record + 2]!,
      bytes[record + 3]!,
    );
    if (offset < bytes.length) tables.set(tag, offset);
  }
  return tables;
}

export interface FontStyleInfo {
  style: FontStyle;
  italic: boolean;
  bold: boolean;
  weight: number;
}

/**
 * The style a font file is drawn in, as the subtitle renderer reads it when
 * it picks a face: italic (an italic or oblique face) and bold from its OS/2
 * table (else its head table), and its weight. Null when it can't be read.
 * The same reading as media-worker/src/fonts.js.
 */
export function fontStyle(bytes: Uint8Array): FontStyleInfo | null {
  try {
    const tables = tableOffsets(bytes);
    if (!tables) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const os2 = tables.get("OS/2");
    const head = tables.get("head");
    let italic = false;
    let weight = 400;
    let bold = false;
    if (os2 !== undefined && os2 + 64 <= bytes.length) {
      const selection = view.getUint16(os2 + 62);
      weight = view.getUint16(os2 + 4) || 400;
      italic = (selection & 0x1) !== 0 || (selection & 0x200) !== 0;
      bold = (selection & 0x20) !== 0 || weight >= 600;
    } else if (head !== undefined && head + 46 <= bytes.length) {
      const macStyle = view.getUint16(head + 44);
      italic = (macStyle & 0x2) !== 0;
      bold = (macStyle & 0x1) !== 0;
      weight = bold ? 700 : 400;
    } else return null;
    return {
      style: bold ? (italic ? "bold_italic" : "bold") : italic ? "italic" : "regular",
      italic,
      bold,
      weight,
    };
  } catch {
    return null;
  }
}

/** A cmap subtable's glyph for a character: formats 4 and 12, as fonts carry them for Unicode. */
function glyphReader(bytes: Uint8Array, view: DataView, cmap: number): (code: number) => number {
  const count = view.getUint16(cmap + 2);
  let best: { offset: number; format: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const record = cmap + 4 + index * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmap + view.getUint32(record + 4);
    if (offset + 4 > bytes.length) continue;
    const format = view.getUint16(offset);
    const unicode = (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
    if (!unicode || (format !== 4 && format !== 12)) continue;
    // A full-repertoire table (format 12) is preferred to the basic plane's.
    if (!best || (format === 12 && best.format !== 12)) best = { offset, format };
  }
  if (!best) return () => 0;
  const { offset, format } = best;
  if (format === 12) {
    const groups = view.getUint32(offset + 12);
    return (code) => {
      let low = 0;
      let high = groups - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const group = offset + 16 + middle * 12;
        const start = view.getUint32(group);
        const end = view.getUint32(group + 4);
        if (code < start) high = middle - 1;
        else if (code > end) low = middle + 1;
        else return view.getUint32(group + 8) + (code - start);
      }
      return 0;
    };
  }
  const segments = view.getUint16(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (code) => {
    if (code > 0xffff) return 0;
    for (let index = 0; index < segments; index += 1) {
      if (code > view.getUint16(ends + index * 2)) continue;
      const start = view.getUint16(starts + index * 2);
      if (code < start) return 0;
      const delta = view.getInt16(deltas + index * 2);
      const range = view.getUint16(ranges + index * 2);
      if (!range) return (code + delta) & 0xffff;
      const at = ranges + index * 2 + range + (code - start) * 2;
      if (at + 2 > bytes.length) return 0;
      const glyph = view.getUint16(at);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/** What laying text out in a font needs (see `fontMetrics`). */
export interface FontMetrics extends FontStyleInfo {
  unitsPerEm: number;
  /** The OS/2 "win" ascent and descent (else the hhea's), in font units. */
  ascent: number;
  descent: number;
  /** A character's advance, in font units. */
  advance(code: number): number;
}

/**
 * What laying text out in a font needs, read from the file as the subtitle
 * renderer (libass) sets it: its em, the OS/2 "win" ascent and descent the
 * renderer sizes and places a line by (a font size there is the ascent and
 * descent together, and the top of a line is the ascent above its
 * baseline), its style, and each character's advance. Kerning is left out:
 * the renderer doesn't kern a script that doesn't ask it to, and ours never
 * do. Null when the file can't be read as a font. The same reading as
 * media-worker/src/fonts.js.
 */
export function fontMetrics(bytes: Uint8Array): FontMetrics | null {
  try {
    const tables = tableOffsets(bytes);
    if (!tables) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const head = tables.get("head");
    const hhea = tables.get("hhea");
    const hmtx = tables.get("hmtx");
    const cmap = tables.get("cmap");
    if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined)
      return null;
    const unitsPerEm = view.getUint16(head + 18);
    if (!unitsPerEm) return null;
    let ascent = view.getInt16(hhea + 4);
    let descent = -view.getInt16(hhea + 6);
    const os2 = tables.get("OS/2");
    if (os2 !== undefined && os2 + 78 <= bytes.length) {
      const winAscent = view.getUint16(os2 + 74);
      const winDescent = view.getUint16(os2 + 76);
      if (winAscent + winDescent > 0) {
        ascent = winAscent;
        descent = winDescent;
      }
    }
    if (ascent + descent <= 0) return null;
    const metrics = view.getUint16(hhea + 34);
    const glyphOf = glyphReader(bytes, view, cmap);
    const advanceOf = (glyph: number) => {
      const at = hmtx + Math.min(glyph, Math.max(0, metrics - 1)) * 4;
      return at + 2 <= bytes.length ? view.getUint16(at) : 0;
    };
    const cache = new Map<number, number>();
    return {
      unitsPerEm,
      ascent,
      descent,
      ...(fontStyle(bytes) ?? { style: "regular", italic: false, bold: false, weight: 400 }),
      advance(code: number) {
        let value = cache.get(code);
        if (value === undefined) {
          value = advanceOf(glyphOf(code));
          cache.set(code, value);
        }
        return value;
      },
    };
  } catch {
    return null;
  }
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
