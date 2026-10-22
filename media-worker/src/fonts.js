import { readFile } from "node:fs/promises";

/**
 * A brand's own font, uploaded as a TrueType or OpenType file, is used for
 * the titles and captions burned in: the file is put in a fonts directory the
 * subtitle renderer (libass) reads, and the text is set in the family the
 * file itself names (its "name" table), whatever the file is called.
 */

/** The kind of font file, from its first bytes: TrueType, OpenType (CFF), a collection, or neither. */
export function sfntKind(bytes) {
  if (bytes.length < 12) return null;
  const tag = bytes.toString("latin1", 0, 4);
  if (tag === "OTTO") return "otf";
  if (tag === "ttcf") return "ttc";
  if (tag === "true" || bytes.readUInt32BE(0) === 0x00010000) return "ttf";
  return null;
}

function decode(bytes, platform, encoding) {
  // Windows and Unicode names are UTF-16 (big-endian); Mac Roman is close enough to Latin-1 for a name.
  if (platform === 3 || platform === 0) {
    const swapped = Buffer.alloc(bytes.length - (bytes.length % 2));
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      swapped[index] = bytes[index + 1];
      swapped[index + 1] = bytes[index];
    }
    return swapped.toString("utf16le");
  }
  if (platform === 1 && encoding === 0) return bytes.toString("latin1");
  return null;
}

/**
 * The family a font file names itself by (its name table's font family,
 * name ID 1, as the subtitle renderer matches it), or null when it can't be
 * read. A collection is read for its first font.
 */
export function fontFamily(bytes) {
  const kind = sfntKind(bytes);
  if (!kind) return null;
  try {
    const base = kind === "ttc" ? bytes.readUInt32BE(12) : 0;
    const tables = bytes.readUInt16BE(base + 4);
    let name = null;
    for (let index = 0; index < tables; index += 1) {
      const record = base + 12 + index * 16;
      if (bytes.toString("latin1", record, record + 4) === "name") {
        name = { offset: bytes.readUInt32BE(record + 8), length: bytes.readUInt32BE(record + 12) };
        break;
      }
    }
    if (!name || name.offset + 6 > bytes.length) return null;
    const count = bytes.readUInt16BE(name.offset + 2);
    const strings = name.offset + bytes.readUInt16BE(name.offset + 4);
    let best = null;
    for (let index = 0; index < count; index += 1) {
      const record = name.offset + 6 + index * 12;
      if (record + 12 > bytes.length) break;
      const platform = bytes.readUInt16BE(record);
      const encoding = bytes.readUInt16BE(record + 2);
      const language = bytes.readUInt16BE(record + 4);
      const nameId = bytes.readUInt16BE(record + 6);
      if (nameId !== 1) continue;
      const length = bytes.readUInt16BE(record + 8);
      const start = strings + bytes.readUInt16BE(record + 10);
      if (start + length > bytes.length) continue;
      const text = decode(bytes.subarray(start, start + length), platform, encoding);
      if (!text?.trim()) continue;
      // English (US) on Windows first, then any Windows name, then any other.
      const rank = platform === 3 && language === 0x0409 ? 0 : platform === 3 ? 1 : 2;
      if (!best || rank < best.rank) best = { rank, text: text.trim() };
    }
    return best ? best.text.slice(0, 80) : null;
  } catch {
    return null;
  }
}

/** Reads a font file's family from disk (null if it isn't a font it can read). */
export async function fontFamilyOf(path) {
  return fontFamily(await readFile(path));
}

/** Where each table of a font file starts, by its tag (a collection's first font). */
function tableOffsets(bytes) {
  const kind = sfntKind(bytes);
  if (!kind) return null;
  const base = kind === "ttc" ? bytes.readUInt32BE(12) : 0;
  const count = bytes.readUInt16BE(base + 4);
  const tables = new Map();
  for (let index = 0; index < count; index += 1) {
    const record = base + 12 + index * 16;
    if (record + 16 > bytes.length) break;
    const offset = bytes.readUInt32BE(record + 8);
    if (offset < bytes.length) tables.set(bytes.toString("latin1", record, record + 4), offset);
  }
  return tables;
}

/**
 * The style a font file is drawn in, as the subtitle renderer reads it when
 * it picks a face: italic (an italic or oblique face) and bold from its OS/2
 * table (else its head table), and its weight. "regular", "italic", "bold"
 * or "bold_italic"; null when it can't be read.
 */
export function fontStyle(bytes) {
  try {
    const tables = tableOffsets(bytes);
    if (!tables) return null;
    const os2 = tables.get("OS/2");
    const head = tables.get("head");
    let italic = false;
    let weight = 400;
    let bold = false;
    if (os2 !== undefined && os2 + 64 <= bytes.length) {
      const selection = bytes.readUInt16BE(os2 + 62);
      weight = bytes.readUInt16BE(os2 + 4) || 400;
      italic = (selection & 0x1) !== 0 || (selection & 0x200) !== 0;
      bold = (selection & 0x20) !== 0 || weight >= 600;
    } else if (head !== undefined && head + 46 <= bytes.length) {
      const macStyle = bytes.readUInt16BE(head + 44);
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
function glyphReader(bytes, cmap) {
  const count = bytes.readUInt16BE(cmap + 2);
  let best = null;
  for (let index = 0; index < count; index += 1) {
    const record = cmap + 4 + index * 8;
    const platform = bytes.readUInt16BE(record);
    const encoding = bytes.readUInt16BE(record + 2);
    const offset = cmap + bytes.readUInt32BE(record + 4);
    if (offset + 4 > bytes.length) continue;
    const format = bytes.readUInt16BE(offset);
    const unicode = (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
    if (!unicode || (format !== 4 && format !== 12)) continue;
    // A full-repertoire table (format 12) is preferred to the basic plane's.
    if (!best || (format === 12 && best.format !== 12)) best = { offset, format };
  }
  if (!best) return () => 0;
  const { offset, format } = best;
  if (format === 12) {
    const groups = bytes.readUInt32BE(offset + 12);
    return (code) => {
      let low = 0;
      let high = groups - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const group = offset + 16 + middle * 12;
        const start = bytes.readUInt32BE(group);
        const end = bytes.readUInt32BE(group + 4);
        if (code < start) high = middle - 1;
        else if (code > end) low = middle + 1;
        else return bytes.readUInt32BE(group + 8) + (code - start);
      }
      return 0;
    };
  }
  const segments = bytes.readUInt16BE(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (code) => {
    if (code > 0xffff) return 0;
    for (let index = 0; index < segments; index += 1) {
      if (code > bytes.readUInt16BE(ends + index * 2)) continue;
      const start = bytes.readUInt16BE(starts + index * 2);
      if (code < start) return 0;
      const delta = bytes.readInt16BE(deltas + index * 2);
      const range = bytes.readUInt16BE(ranges + index * 2);
      if (!range) return (code + delta) & 0xffff;
      const at = ranges + index * 2 + range + (code - start) * 2;
      if (at + 2 > bytes.length) return 0;
      const glyph = bytes.readUInt16BE(at);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };
}

/**
 * What laying text out in a font needs, read from the file as the subtitle
 * renderer (libass) sets it: its em, the OS/2 "win" ascent and descent the
 * renderer sizes and places a line by (a font size there is the ascent and
 * descent together, and the top of a line is the ascent above its
 * baseline), its style, and each character's advance. Kerning is left out:
 * the renderer doesn't kern a script that doesn't ask it to, and ours never
 * do. Null when the file can't be read as a font.
 */
export function fontMetrics(bytes) {
  try {
    const tables = tableOffsets(bytes);
    if (!tables) return null;
    const head = tables.get("head");
    const hhea = tables.get("hhea");
    const hmtx = tables.get("hmtx");
    const cmap = tables.get("cmap");
    if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined)
      return null;
    const unitsPerEm = bytes.readUInt16BE(head + 18);
    if (!unitsPerEm) return null;
    let ascent = bytes.readInt16BE(hhea + 4);
    let descent = -bytes.readInt16BE(hhea + 6);
    const os2 = tables.get("OS/2");
    if (os2 !== undefined && os2 + 78 <= bytes.length) {
      const winAscent = bytes.readUInt16BE(os2 + 74);
      const winDescent = bytes.readUInt16BE(os2 + 76);
      if (winAscent + winDescent > 0) {
        ascent = winAscent;
        descent = winDescent;
      }
    }
    if (ascent + descent <= 0) return null;
    const metrics = bytes.readUInt16BE(hhea + 34);
    const glyphOf = glyphReader(bytes, cmap);
    const advanceOf = (glyph) => {
      const at = hmtx + Math.min(glyph, Math.max(0, metrics - 1)) * 4;
      return at + 2 <= bytes.length ? bytes.readUInt16BE(at) : 0;
    };
    const cache = new Map();
    return {
      unitsPerEm,
      ascent,
      descent,
      ...(fontStyle(bytes) ?? { style: "regular", italic: false, bold: false, weight: 400 }),
      /** A character's advance, in font units. */
      advance(code) {
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
