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
