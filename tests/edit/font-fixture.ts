/**
 * A small TrueType-shaped font built in memory, with the tables text layout
 * reads (head, hhea, hmtx, cmap, OS/2, name) and no outlines: enough for the
 * studio's and the media worker's font readers, without a font on the
 * machine.
 */

export interface FixtureFont {
  family: string;
  unitsPerEm?: number;
  /** The OS/2 "win" metrics the subtitle renderer sizes a line by. */
  winAscent?: number;
  winDescent?: number;
  /** The hhea metrics, which differ from the win metrics in some fonts. */
  ascender?: number;
  descender?: number;
  italic?: boolean;
  weight?: number;
  /** Advances by character, in font units; any other character takes `missing`. */
  advances: Record<string, number>;
  missing?: number;
}

const u16 = (value: number) => [(value >> 8) & 255, value & 255];
const i16 = (value: number) => u16(value < 0 ? value + 65536 : value);
const u32 = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];

export function buildFont(font: FixtureFont): Uint8Array {
  const unitsPerEm = font.unitsPerEm ?? 1000;
  const winAscent = font.winAscent ?? 900;
  const winDescent = font.winDescent ?? 300;
  const chars = Object.keys(font.advances).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  // Glyph 0 is the missing glyph; then one glyph per character, in code order.
  const advances = [font.missing ?? 500, ...chars.map((char) => font.advances[char]!)];

  const head = [
    ...u32(0x00010000),
    ...u32(0x00010000),
    ...u32(0),
    ...u32(0x5f0f3cf5),
    ...u16(0),
    ...u16(unitsPerEm),
    ...new Array(16).fill(0),
    ...i16(0),
    ...i16(-winDescent),
    ...i16(unitsPerEm),
    ...i16(winAscent),
    ...u16((font.italic ? 2 : 0) | ((font.weight ?? 400) >= 600 ? 1 : 0)),
    ...u16(8),
    ...i16(2),
    ...i16(0),
    ...i16(0),
  ];
  const hhea = [
    ...u32(0x00010000),
    ...i16(font.ascender ?? winAscent),
    ...i16(-(font.descender ?? winDescent)),
    ...i16(0),
    ...u16(Math.max(...advances)),
    ...new Array(22).fill(0),
    ...u16(advances.length),
  ];
  const hmtx = advances.flatMap((advance) => [...u16(advance), ...i16(0)]);

  // cmap format 4: a segment per character, and the closing 0xFFFF one.
  const codes = chars.map((char) => char.codePointAt(0)!);
  const segments = codes.length + 1;
  const ends = [...codes, 0xffff];
  const starts = [...codes, 0xffff];
  const deltas = [...codes.map((code, index) => (index + 1 - code) & 0xffff), 1];
  const format4 = [
    ...u16(4),
    ...u16(16 + segments * 8),
    ...u16(0),
    ...u16(segments * 2),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...ends.flatMap(u16),
    ...u16(0),
    ...starts.flatMap(u16),
    ...deltas.flatMap(u16),
    ...new Array(segments).fill(0).flatMap(() => u16(0)),
  ];
  const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...format4];

  const os2 = new Array(96).fill(0);
  const put = (offset: number, bytes: number[]) =>
    bytes.forEach((byte, index) => (os2[offset + index] = byte));
  put(0, u16(4));
  put(4, u16(font.weight ?? 400));
  put(62, u16((font.italic ? 0x1 : 0) | ((font.weight ?? 400) >= 600 ? 0x20 : 0x40)));
  put(68, i16(winAscent));
  put(70, i16(-winDescent));
  put(74, u16(winAscent));
  put(76, u16(winDescent));

  const family = [...font.family].flatMap((char) => u16(char.charCodeAt(0)));
  const name = [
    ...u16(0),
    ...u16(1),
    ...u16(18),
    ...u16(3),
    ...u16(1),
    ...u16(0x0409),
    ...u16(1),
    ...u16(family.length),
    ...u16(0),
    ...family,
  ];

  const tables: [string, number[]][] = [
    ["OS/2", os2],
    ["cmap", cmap],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx],
    ["name", name],
  ];
  const directory = 12 + tables.length * 16;
  const out: number[] = [...u32(0x00010000), ...u16(tables.length), 0, 0, 0, 0, 0, 0];
  let offset = directory;
  const bodies: number[] = [];
  for (const [tag, bytes] of tables) {
    out.push(
      ...[...tag].map((char) => char.charCodeAt(0)),
      ...u32(0),
      ...u32(offset),
      ...u32(bytes.length),
    );
    const padded = [...bytes, ...new Array((4 - (bytes.length % 4)) % 4).fill(0)];
    bodies.push(...padded);
    offset += padded.length;
  }
  return new Uint8Array([...out, ...bodies]);
}
