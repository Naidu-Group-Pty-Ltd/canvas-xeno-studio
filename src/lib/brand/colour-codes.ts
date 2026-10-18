/**
 * The colour codes in a brand's guidelines, from the text of its PDF: hex,
 * RGB, CMYK, HSL and Pantone specs in the many ways designers write them
 * ("HEX #1E40AF", "R30 G64 B175", "C100 M80 Y0 K0", "PMS 286 C"), each with
 * the colour name written just before it. CMYK is turned into an
 * approximate screen colour; Pantone has none (its hex is null).
 *
 * Pure, shared by the server and tests.
 */
import { parseCssColour, rgbToHex } from "./colour";

export type ColourSystem = "hex" | "rgb" | "cmyk" | "pantone" | "hsl";

export interface ColourCode {
  /** Lowercase #rrggbb; null for a Pantone reference. */
  hex: string | null;
  /** The colour's name as the guide gives it ("Aurixa Blue"), at most 40 characters. */
  label: string | null;
  system: ColourSystem;
  /** The code as written. */
  raw: string;
  /** Where it was first written in the text. */
  index: number;
  /** How many times the guide gives this colour (in any notation). */
  count: number;
}

const MAX_INPUT = 2_000_000;
const MAX_CODES = 60;

const N = String.raw`(\d{1,3}(?:\.\d+)?)`;
const SEP = String.raw`\s*[,/|]?\s*`;
const PANTONE_NAMES = [
  String.raw`(?:Cool|Warm)\s+Gr[ae]y\s+\d{1,2}`,
  String.raw`Process\s+(?:Blue|Cyan|Magenta|Yellow|Black)`,
  String.raw`(?:Reflex|Dark|Medium)\s+Blue`,
  String.raw`(?:Rhodamine|Rubine|Warm|Bright)\s+Red`,
  String.raw`(?:Bright|Medium)\s+(?:Orange|Green|Yellow|Purple)`,
  String.raw`(?:Red\s+032|Orange\s+021|Blue\s+072|Yellow\s+012|Neutral\s+Black)`,
  String.raw`(?:Black|White|Green|Yellow|Purple|Violet|Pink)(?:\s+\d{1,2})?`,
].join("|");

interface Matcher {
  system: ColourSystem;
  pattern: RegExp;
  /** The colour a match gives (null: values out of range, not a colour). */
  read: (match: RegExpExecArray) => string | null | undefined;
}

const inRange = (values: number[], max: number) =>
  values.every((value) => Number.isFinite(value) && value >= 0 && value <= max);

const fromHex = (digits: string | undefined) => {
  const hex = (digits ?? "").toLowerCase();
  if (hex.length === 3) return `#${[...hex].map((digit) => digit + digit).join("")}`;
  return hex.length === 6 ? `#${hex}` : null;
};

const fromRgb = (match: RegExpExecArray) => {
  const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  return inRange([r, g, b], 255) ? rgbToHex({ r, g, b }) : null;
};

/** CMYK percentages as an approximate screen colour (no colour profile, as most guides assume). */
const fromCmyk = (match: RegExpExecArray) => {
  const [c, m, y, k] = [match[1], match[2], match[3], match[4]].map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if (!inRange([c, m, y, k], 100)) return null;
  const channel = (ink: number) => 255 * (1 - ink / 100) * (1 - k / 100);
  return rgbToHex({ r: channel(c), g: channel(m), b: channel(y) });
};

const fromHsl = (match: RegExpExecArray) => {
  const [h, s, l] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  if (!inRange([h], 360) || !inRange([s, l], 100)) return null;
  return parseCssColour(`hsl(${h} ${s}% ${l}%)`)?.hex ?? null;
};

const MATCHERS: Matcher[] = [
  {
    system: "hex",
    // Without a #, only six digits after the word "hex" are taken: "Web add" isn't a colour.
    pattern:
      /\bhex(?:adecimal)?(?:\s*code)?\s*[:=-]?\s*(?:#([0-9a-f]{6}|[0-9a-f]{3})|([0-9a-f]{6}))(?![0-9a-z])/gi,
    read: (match) => fromHex(match[1] ?? match[2]),
  },
  {
    system: "hex",
    // A bare three-digit code must hold a letter: "#123" is more often a number than a colour.
    pattern: /#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi,
    read: (match) =>
      match[1]?.length === 3 && !/[a-f]/i.test(match[1]) ? null : fromHex(match[1]),
  },
  {
    system: "rgb",
    pattern: new RegExp(
      String.raw`\brgba?\(\s*${N}\s*[,\s]\s*${N}\s*[,\s]\s*${N}\s*(?:[,/]\s*[\d.]+%?\s*)?\)`,
      "gi",
    ),
    read: fromRgb,
  },
  {
    system: "rgb",
    pattern: new RegExp(String.raw`\bRGB\s*[:=]?\s*${N}${SEP}${N}${SEP}${N}(?![\d.])`, "gi"),
    read: fromRgb,
  },
  {
    system: "rgb",
    pattern: new RegExp(
      String.raw`\bR\s*[:=]?\s*${N}${SEP}G\s*[:=]?\s*${N}${SEP}B\s*[:=]?\s*${N}(?![\d.])`,
      "gi",
    ),
    read: fromRgb,
  },
  {
    system: "cmyk",
    pattern: new RegExp(
      String.raw`\bCMYK\s*[:=]?\s*${N}\s*%?${SEP}${N}\s*%?${SEP}${N}\s*%?${SEP}${N}(?![\d.])%?`,
      "gi",
    ),
    read: fromCmyk,
  },
  {
    system: "cmyk",
    pattern: new RegExp(
      String.raw`\bC\s*[:=]?\s*${N}\s*%?${SEP}M\s*[:=]?\s*${N}\s*%?${SEP}Y\s*[:=]?\s*${N}\s*%?${SEP}K\s*[:=]?\s*${N}(?![\d.])%?`,
      "gi",
    ),
    read: fromCmyk,
  },
  {
    system: "hsl",
    pattern: new RegExp(
      String.raw`\bhsla?\(\s*${N}(?:deg)?\s*[,\s]\s*${N}%?\s*[,\s]\s*${N}%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)`,
      "gi",
    ),
    read: fromHsl,
  },
  {
    system: "hsl",
    pattern: new RegExp(
      String.raw`\bHSL\s*[:=]?\s*${N}\s*(?:°|deg)?${SEP}${N}\s*%?${SEP}${N}(?![\d.])%?`,
      "gi",
    ),
    read: fromHsl,
  },
  {
    system: "pantone",
    pattern: new RegExp(
      String.raw`\b(?:PMS|Pantone)(?:\s*®|\s*\(R\))?\s*:?\s*(?:\d{2}-\d{4}\s?(?:TCX|TPX|TPG|TSX)|(?:\d{3,4}|${PANTONE_NAMES})(?:\s?(?:C|U|CP|UP|M|XGC))?)(?![a-z0-9])`,
      "gi",
    ),
    read: () => undefined,
  },
];

const KEYWORD =
  /\b(?:hex(?:adecimal)?(?:\s*code)?|html|web|rgb|cmyk|pms|pantone|hsl|colou?r\s*codes?)\s*[:#=]?\s*$/i;

/** A short colour name from the text before a code, or null when it isn't one. */
function cleanLabel(raw: string): string | null {
  let text = raw.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 3; pass += 1)
    text = text
      .replace(KEYWORD, "")
      .replace(/^[\s:;,.|•·\-–—/=([\]]+|[\s:;,|•·\-–—/=([\]]+$/gu, "")
      .trim();
  if (!/\p{L}/u.test(text) || text.length > 60 || text.split(" ").length > 6) return null;
  if (/^(?:[rgbcmyk]|hex|rgb|cmyk|pms|pantone|hsl)$/i.test(text)) return null;
  if (text.length <= 40) return text;
  return (
    text
      .slice(0, 40)
      .replace(/\s+\S*$/, "")
      .trim() || text.slice(0, 40)
  );
}

/**
 * The name written before a code: the nearest stretch of its own line
 * between codes that reads as one, else the same on the nearest lines above
 * (passing over lines that only hold codes).
 */
function labelBefore(text: string, start: number, spans: [number, number][]): string | null {
  // The stretches of text between codes from `from` to `to`, nearest last.
  const stretches = (from: number, to: number) => {
    let low = 0;
    let high = spans.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((spans[middle]?.[1] ?? 0) <= from) low = middle + 1;
      else high = middle;
    }
    const parts: string[] = [];
    let at = from;
    for (let index = low; index < spans.length; index += 1) {
      const [s, e] = spans[index]!;
      if (s >= to) break;
      parts.push(text.slice(at, Math.max(at, s)));
      at = Math.max(at, e);
    }
    parts.push(text.slice(at, Math.max(at, to)));
    return parts;
  };
  const nearest = (parts: string[]) => {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const label = cleanLabel(parts[index] ?? "");
      if (label) return label;
    }
    return null;
  };
  // Names sit close to their codes: only the last 240 characters of a line are read.
  const lineOf = (index: number) => {
    const from = Math.max(0, index - 2000);
    const at = text.slice(from, index).lastIndexOf("\n");
    return at < 0 ? from : from + at + 1;
  };
  const near = (from: number, to: number) => Math.max(from, to - 240);
  const lineStart = lineOf(start);
  const same = nearest(stretches(near(lineStart, start), start));
  if (same) return same;
  let end = lineStart - 1;
  for (let lines = 0; end > 0 && lines < 8;) {
    const begin = lineOf(end);
    if (text.slice(near(begin, end), end).trim()) {
      lines += 1;
      const parts = stretches(near(begin, end), end);
      const label = nearest(parts);
      if (label) return label;
      // Words that aren't a name: whatever is above belongs to something else.
      if (parts.length === 1) return null;
    }
    end = begin - 1;
  }
  return null;
}

/**
 * Every colour code in a guide's text, in the order written, once per
 * colour (its first label kept, or a later one when the first had none),
 * at most 60. Values out of range (an RGB channel over 255, an ink over
 * 100%) are passed over. Never throws.
 */
export function extractColourCodes(text: string): ColourCode[] {
  if (typeof text !== "string" || !text) return [];
  const source = text.slice(0, MAX_INPUT).replace(/\r\n?/g, "\n");
  const found: { start: number; end: number; system: ColourSystem; hex: string | null }[] = [];
  for (const { system, pattern, read } of MATCHERS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      if (found.length > 20_000) break;
      const hex = read(match);
      if (hex !== null)
        found.push({
          start: match.index,
          end: match.index + match[0].length,
          system,
          hex: hex ?? null,
        });
    }
  }
  // Where two readings overlap ("HEX #1E40AF" and "#1E40AF"), the earlier and longer one stands.
  found.sort((x, y) => x.start - y.start || y.end - x.end);
  const kept: typeof found = [];
  for (const code of found)
    if (!kept.length || code.start >= kept[kept.length - 1]!.end) kept.push(code);
  const spans = kept.map((code): [number, number] => [code.start, code.end]);

  const codes: ColourCode[] = [];
  const byKey = new Map<string, ColourCode>();
  for (const code of kept) {
    const raw = source.slice(code.start, code.end).replace(/\s+/g, " ").trim().slice(0, 80);
    const key =
      code.hex ?? `pantone ${raw.toUpperCase().replace(/PMS|PANTONE|®|\(R\)|[\s:]/g, "")}`;
    const known = byKey.get(key);
    if (known) {
      known.count += 1;
      if (!known.label && known.count <= 8) known.label = labelBefore(source, code.start, spans);
      continue;
    }
    if (codes.length >= MAX_CODES) continue;
    const label = labelBefore(source, code.start, spans);
    const entry: ColourCode = {
      hex: code.hex,
      label,
      system: code.system,
      raw,
      index: code.start,
      count: 1,
    };
    byKey.set(key, entry);
    codes.push(entry);
  }
  return codes;
}
