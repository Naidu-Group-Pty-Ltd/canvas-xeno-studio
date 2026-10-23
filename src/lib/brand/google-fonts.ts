/**
 * Google Fonts, for installing a brand's typeface: the stylesheet address
 * for a family at some weights, the @font-face rules Google answers with,
 * and the one file that best fits a weight and style. Only TrueType and
 * OpenType files will do: the media service's subtitle renderer can't read
 * WOFF, which is what Google sends browsers.
 *
 * Pure, shared by the server and tests.
 */

export interface FontFaceRule {
  family: string;
  /** The lowest weight the file covers (a static file's only weight). */
  weight: number;
  /** The highest: above `weight` only for a variable font's range, like "100 900". */
  weightMax: number;
  /** "normal", "italic" or "oblique". */
  style: string;
  url: string;
  /** As declared by format(), else from the file's extension; lowercase. */
  format: string | null;
  unicodeRange: string | null;
}

/** The css2 stylesheet for a family at some weights (sorted, once each), its italic faces when asked. */
export function googleFontsCssUrl(
  family: string,
  weights: number[] = [400, 700],
  options: { italic?: boolean } = {},
): string {
  const name = encodeURIComponent(
    String(family ?? "")
      .trim()
      .replace(/\s+/g, " "),
  ).replace(/%20/g, "+");
  const list = [
    ...new Set(
      (Array.isArray(weights) ? weights : [])
        .filter((weight) => Number.isFinite(weight))
        .map((weight) => Math.round(Math.min(1000, Math.max(1, weight)))),
    ),
  ].sort((a, b) => a - b);
  const axes = (list.length ? list : [400]).map((weight) =>
    options.italic ? `1,${weight}` : String(weight),
  );
  return `https://fonts.googleapis.com/css2?family=${name}:${options.italic ? "ital,wght" : "wght"}@${axes.join(";")}&display=swap`;
}

/** Splits on `separator` outside quotes and parentheses. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const unquote = (value: string) =>
  value
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim();

function weightRange(value: string | undefined): [number, number] {
  const read = (word: string | undefined) =>
    word === "bold" ? 700 : word === undefined || word === "normal" ? 400 : Number(word);
  const words = (value ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const low = read(words[0]);
  const high = words.length > 1 ? read(words[1]) : low;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [400, 400];
  return [Math.min(low, high), Math.max(low, high)];
}

function formatFromUrl(url: string): string | null {
  const extension = /\.(ttf|otf|woff2?|eot|svg)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  if (extension === "ttf") return "truetype";
  if (extension === "otf") return "opentype";
  return extension ?? null;
}

/**
 * Every font file in a stylesheet's @font-face rules (one entry per src
 * url; local() and relative sources are skipped). A variable font's weight
 * range keeps its lower bound in `weight` and its upper in `weightMax`.
 */
export function parseFontFaceRules(css: string): FontFaceRule[] {
  if (typeof css !== "string") return [];
  const text = css.slice(0, 2_000_000).replace(/\/\*[\s\S]*?\*\//g, " ");
  const rules: FontFaceRule[] = [];
  for (const block of text.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const props = new Map<string, string>();
    for (const declaration of splitTop(block[1] ?? "", ";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0)
        props.set(
          declaration.slice(0, colon).trim().toLowerCase(),
          declaration.slice(colon + 1).trim(),
        );
    }
    const family = unquote(props.get("font-family") ?? "");
    if (!family) continue;
    const [weight, weightMax] = weightRange(props.get("font-weight"));
    const style =
      (props.get("font-style") ?? "normal").trim().split(/\s+/)[0]?.toLowerCase() || "normal";
    const unicodeRange = props.get("unicode-range")?.replace(/\s+/g, " ").trim() || null;
    for (const entry of splitTop(props.get("src") ?? "", ",")) {
      const match = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/i.exec(entry);
      const url = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const declared = /format\(\s*["']?([^"')]+)["']?\s*\)/i
        .exec(entry)?.[1]
        ?.trim()
        .toLowerCase();
      rules.push({
        family,
        weight,
        weightMax,
        style,
        url,
        format: declared ?? formatFromUrl(url),
        unicodeRange,
      });
      if (rules.length >= 500) return rules;
    }
  }
  return rules;
}

/** Whether a unicode-range covers basic Latin letters (no range covers everything). */
function coversLatin(range: string | null): boolean {
  if (!range) return true;
  const spans = range.split(",").map((part) => part.trim().toUpperCase().replace(/^U\+/, ""));
  const covers = (code: number) =>
    spans.some((span) => {
      const [from = "", to] = span.includes("?")
        ? [span.replace(/\?/g, "0"), span.replace(/\?/g, "F")]
        : span.split("-");
      const low = parseInt(from, 16);
      const high = to === undefined ? low : parseInt(to, 16);
      return code >= low && code <= high;
    });
  return covers(0x41) && covers(0x7a);
}

const isTrueTypeOrOpenType = (face: FontFaceRule) =>
  /^(?:truetype|opentype)(?:-variations)?$/.test(face.format ?? "") ||
  (face.format === null && /\.(?:ttf|otf)(?:[?#]|$)/i.test(face.url));

/**
 * The best TrueType or OpenType file for a weight and style: the style
 * asked for (any, if there's none), then the subset holding Latin, then
 * the nearest weight (a variable range holding it counts as exact, though
 * a static file at that very weight is preferred), then TrueType. Null when
 * only WOFF files are offered.
 */
export function pickFontFile(
  faces: FontFaceRule[],
  wantWeight: number,
  wantStyle = "normal",
): FontFaceRule | null {
  const usable = (Array.isArray(faces) ? faces : []).filter(
    (face) => face && typeof face.url === "string" && isTrueTypeOrOpenType(face),
  );
  if (!usable.length) return null;
  const want = Number.isFinite(wantWeight) ? wantWeight : 400;
  const style = String(wantStyle).toLowerCase();
  const sameStyle = usable.filter((face) => face.style === style);
  const pool = sameStyle.length ? sameStyle : usable;
  const key = (face: FontFaceRule, index: number) => {
    const distance =
      want < face.weight ? face.weight - want : want > face.weightMax ? want - face.weightMax : 0;
    // At equal distance, as CSS matches: heavier for bold requests, lighter for light ones.
    const wrongSide = distance > 0 && want >= 500 !== face.weight > want ? 1 : 0;
    return [
      coversLatin(face.unicodeRange) ? 0 : 1,
      distance,
      wrongSide,
      face.weightMax > face.weight ? 1 : 0,
      face.format?.startsWith("truetype") ? 0 : 1,
      index,
    ];
  };
  const compare = (x: number[], y: number[]) => {
    for (let index = 0; index < x.length; index += 1)
      if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) - (y[index] ?? 0);
    return 0;
  };
  return (
    pool
      .map((face, index) => ({ face, key: key(face, index) }))
      .sort((x, y) => compare(x.key, y.key))[0]?.face ?? null
  );
}
