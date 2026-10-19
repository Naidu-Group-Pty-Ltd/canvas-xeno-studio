/**
 * Colours as a brand's website and guidelines give them: any CSS colour
 * value read as a hex code, the contrast and perceived difference between
 * two colours, a short name for one (for an image prompt or a label), and
 * near-duplicates merged into one swatch.
 *
 * Pure functions, shared by the server, the browser and tests.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** CIE Lab against the D65 white: lightness 0-100 and the two opponent axes. */
export interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface ParsedColour {
  /** Lowercase #rrggbb. */
  hex: string;
  /** Opacity, 0-1. */
  alpha: number;
}

type Vec3 = [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];

/* ------------------------------------------------------------------ */
/* Named colours                                                       */
/* ------------------------------------------------------------------ */

const NAMED_SOURCE = [
  "aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc",
  "bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a",
  "burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50",
  "cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b",
  "darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b",
  "darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000",
  "darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f",
  "darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff",
  "dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0",
  "forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700",
  "goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0",
  "hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa",
  "lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080",
  "lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90",
  "lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa",
  "lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0",
  "lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000",
  "mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db",
  "mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc",
  "mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5",
  "navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500",
  "orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee",
  "palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd",
  "powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f",
  "royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57",
  "seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090",
  "slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080",
  "thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff",
  "whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32",
].join(" ");

/** The CSS named colours (all 148), name to lowercase #rrggbb. */
export const NAMED_COLOURS: ReadonlyMap<string, string> = (() => {
  const words = NAMED_SOURCE.split(" ");
  const map = new Map<string, string>();
  for (let index = 0; index + 1 < words.length; index += 2)
    map.set(words[index]!, `#${words[index + 1]!}`);
  return map;
})();

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

const SRGB_TO_XYZ: Mat3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const XYZ_TO_SRGB: Mat3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const P3_TO_XYZ: Mat3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];
/** Bradford chromatic adaptation, D50 to D65 (as CSS Color 4 gives it). */
const D50_TO_D65: Mat3 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const D50_WHITE: Vec3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const D65_WHITE: Vec3 = [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329];
const KAPPA = 24389 / 27;
const EPSILON = 216 / 24389;

const clamp01 = (value: number) => (value > 1 ? 1 : value > 0 ? value : 0);
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const map3 = (v: Vec3, f: (value: number) => number): Vec3 => [f(v[0]), f(v[1]), f(v[2])];

function apply(m: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ];
}

/** sRGB's transfer curve, both ways (sign kept, so out-of-gamut values stay finite). */
function decode(c: number): number {
  const abs = Math.abs(c);
  return abs <= 0.04045 ? c / 12.92 : Math.sign(c) * ((abs + 0.055) / 1.055) ** 2.4;
}
function encode(c: number): number {
  const abs = Math.abs(c);
  return abs > 0.0031308 ? Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055) : 12.92 * c;
}

function labToXyz(l: number, a: number, b: number, white: Vec3): Vec3 {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const x = fx ** 3 > EPSILON ? fx ** 3 : (116 * fx - 16) / KAPPA;
  const y = l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA;
  const z = fz ** 3 > EPSILON ? fz ** 3 : (116 * fz - 16) / KAPPA;
  return [x * white[0], y * white[1], z * white[2]];
}

function xyzToLab([x, y, z]: Vec3, white: Vec3): Lab {
  const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x / white[0]);
  const fy = f(y / white[1]);
  const fz = f(z / white[2]);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CSS lab()/lch() are CIE Lab against D50: adapted to D65 before sRGB. */
function labD50ToSrgb(l: number, a: number, b: number): Vec3 {
  const xyz = apply(D50_TO_D65, labToXyz(l, a, b, D50_WHITE));
  return map3(apply(XYZ_TO_SRGB, xyz), encode);
}

function oklabToSrgb(l: number, a: number, b: number): Vec3 {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [lc, mc, sc] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return map3(
    [
      4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
      -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
      -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
    ],
    encode,
  );
}

function srgbToOklab({ r, g, b }: Rgb): Vec3 {
  const [lr, lg, lb] = map3([r / 255, g / 255, b / 255], decode);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hslToSrgb(h: number, s: number, l: number): Vec3 {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function hwbToSrgb(h: number, w: number, b: number): Vec3 {
  if (w + b >= 1) {
    const grey = w / (w + b);
    return [grey, grey, grey];
  }
  return map3(hslToSrgb(h, 1, 0.5), (c) => c * (1 - w - b) + w);
}

/** An sRGB colour with channels 0-1 (clipped into gamut) as #rrggbb. */
const unitToHex = (c: Vec3) =>
  rgbToHex({ r: clamp01(c[0]) * 255, g: clamp01(c[1]) * 255, b: clamp01(c[2]) * 255 });

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const NOT_A_COLOUR = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "none",
  "revert",
  "revert-layer",
  "auto",
]);
const HUE_UNITS: Record<string, number> = {
  "": 1,
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
};

interface Token {
  value: number;
  unit: string;
}

function parseToken(text: string): Token | null {
  if (text === "none") return { value: 0, unit: "" };
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? { value, unit: match[2] ?? "" } : null;
}

/** A plain number, or a percentage of `scale`. */
function amount(token: Token | null, scale: number): number | null {
  if (!token) return null;
  if (token.unit === "%") return (token.value / 100) * scale;
  return token.unit === "" ? token.value : null;
}

function hueOf(token: Token | null): number | null {
  const factor = token ? HUE_UNITS[token.unit] : undefined;
  if (!token || factor === undefined) return null;
  return (((token.value * factor) % 360) + 360) % 360;
}

/** The channels and the alpha of a colour function, in either the comma or the space syntax. */
function splitArgs(body: string): { channels: string[]; alpha: string | null } | null {
  const parts = body.split("/");
  if (parts.length > 2) return null;
  const channels = (parts[0] ?? "")
    .trim()
    .split(/\s*,\s*|\s+/)
    .filter(Boolean);
  let alpha = parts.length === 2 ? (parts[1] ?? "").trim() : null;
  if (alpha === null && channels.length === 4) alpha = channels.pop() ?? null;
  if (alpha !== null && !/^\S+$/.test(alpha)) return null;
  return channels.length === 3 ? { channels, alpha } : null;
}

function topLevelComma(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) return index;
  }
  return -1;
}

function parseHex(digits: string): ParsedColour | null {
  if (!/^[0-9a-f]+$/.test(digits)) return null;
  const full =
    digits.length === 3 || digits.length === 4
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  if (full.length !== 6 && full.length !== 8) return null;
  const alpha = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
  return { hex: `#${full.slice(0, 6)}`, alpha: round3(alpha) };
}

/** color(<space> r g b): sRGB, linear sRGB, Display P3 and XYZ. */
function colorFunction(body: string): Vec3 | null {
  const match = /^\s*([a-z0-9-]+)\s+([\s\S]*)$/.exec(body);
  const args = match ? splitArgs(match[2] ?? "") : null;
  if (!match || !args) return null;
  const [x, y, z] = args.channels.map((channel) => amount(parseToken(channel), 1));
  if (x == null || y == null || z == null) return null;
  const v: Vec3 = [x, y, z];
  switch (match[1]) {
    case "srgb":
      return v;
    case "srgb-linear":
      return map3(v, encode);
    case "display-p3":
      return map3(apply(XYZ_TO_SRGB, apply(P3_TO_XYZ, map3(v, decode))), encode);
    case "xyz":
    case "xyz-d65":
      return map3(apply(XYZ_TO_SRGB, v), encode);
    case "xyz-d50":
      return map3(apply(XYZ_TO_SRGB, apply(D50_TO_D65, v)), encode);
    default:
      return null;
  }
}

function colourFunction(name: string, body: string): ParsedColour | null {
  if (name === "light-dark") {
    // The light-scheme colour: what the page shows by default.
    const comma = topLevelComma(body);
    return comma < 0 ? null : parseCssColour(body.slice(0, comma));
  }
  let channels: Vec3 | null = null;
  let alphaText: string | null = null;
  if (name === "color") {
    const slash = body.lastIndexOf("/");
    channels = colorFunction(slash < 0 ? body : body.slice(0, slash));
    alphaText = slash < 0 ? null : body.slice(slash + 1).trim();
  } else {
    const args = splitArgs(body);
    if (!args) return null;
    alphaText = args.alpha;
    const [t0, t1, t2] = args.channels.map(parseToken) as [
      Token | null,
      Token | null,
      Token | null,
    ];
    channels = channelsFor(name, t0, t1, t2);
  }
  if (!channels || channels.some((value) => !Number.isFinite(value))) return null;
  let alpha = 1;
  if (alphaText !== null) {
    const value = amount(parseToken(alphaText), 1);
    if (value === null) return null;
    alpha = clamp01(value);
  }
  return { hex: unitToHex(channels), alpha: round3(alpha) };
}

function channelsFor(
  name: string,
  t0: Token | null,
  t1: Token | null,
  t2: Token | null,
): Vec3 | null {
  switch (name) {
    case "rgb":
    case "rgba": {
      const [r, g, b] = [amount(t0, 255), amount(t1, 255), amount(t2, 255)];
      return r === null || g === null || b === null ? null : [r / 255, g / 255, b / 255];
    }
    case "hsl":
    case "hsla":
    case "hwb": {
      // Saturation and lightness (whiteness and blackness) are percentages, with or without the sign.
      const [h, p, q] = [hueOf(t0), amount(t1, 100), amount(t2, 100)];
      if (h === null || p === null || q === null) return null;
      return name === "hwb"
        ? hwbToSrgb(h, clamp01(p / 100), clamp01(q / 100))
        : hslToSrgb(h, clamp01(p / 100), clamp01(q / 100));
    }
    case "lab":
    case "lch": {
      const l = amount(t0, 100);
      if (l === null) return null;
      const lightness = Math.min(100, Math.max(0, l));
      if (name === "lab") {
        const [a, b] = [amount(t1, 125), amount(t2, 125)];
        return a === null || b === null ? null : labD50ToSrgb(lightness, a, b);
      }
      const [c, h] = [amount(t1, 150), hueOf(t2)];
      if (c === null || h === null) return null;
      const radians = (h * Math.PI) / 180;
      const chroma = Math.max(0, c);
      return labD50ToSrgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians));
    }
    case "oklab":
    case "oklch": {
      const l = amount(t0, 1);
      if (l === null) return null;
      const lightness = clamp01(l);
      if (name === "oklab") {
        const [a, b] = [amount(t1, 0.4), amount(t2, 0.4)];
        return a === null || b === null ? null : oklabToSrgb(lightness, a, b);
      }
      const [c, h] = [amount(t1, 0.4), hueOf(t2)];
      if (c === null || h === null) return null;
      const radians = (h * Math.PI) / 180;
      const chroma = Math.max(0, c);
      return oklabToSrgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians));
    }
    default:
      return null;
  }
}

/**
 * A CSS colour value as a hex code and an opacity, or null when it isn't one
 * that can be pinned down here: a keyword like currentColor, anything still
 * holding a var(), or something malformed. Wide-gamut colours are clipped
 * into sRGB.
 */
export function parseCssColour(value: string): ParsedColour | null {
  if (typeof value !== "string" || value.length > 400) return null;
  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s*!\s*important\s*$/, "");
  if (!text || NOT_A_COLOUR.has(text) || text.includes("var(")) return null;
  if (text.startsWith("#")) return parseHex(text.slice(1));
  const call = /^([a-z][a-z0-9-]*)\(([\s\S]*)\)$/.exec(text);
  if (call) return colourFunction(call[1] ?? "", call[2] ?? "");
  const named = NAMED_COLOURS.get(text);
  return named ? { hex: named, alpha: 1 } : null;
}

/* ------------------------------------------------------------------ */
/* Hex, luminance, Lab                                                 */
/* ------------------------------------------------------------------ */

/** A hex code's channels (0-255); 3, 4, 6 or 8 digits, with or without the #; null otherwise. */
export function hexToRgb(hex: string): Rgb | null {
  if (typeof hex !== "string") return null;
  const parsed = parseHex(hex.trim().toLowerCase().replace(/^#/, ""));
  if (!parsed) return null;
  const value = parseInt(parsed.hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Channels (0-255, rounded and clamped) as lowercase #rrggbb. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Number.isFinite(value) ? Math.min(255, Math.max(0, value)) : 0)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Anything unreadable is taken as black, so the measures below never throw. */
const rgbOf = (hex: string): Rgb => hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = rgbOf(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function labOfRgb({ r, g, b }: Rgb): Lab {
  return xyzToLab(apply(SRGB_TO_XYZ, map3([r / 255, g / 255, b / 255], decode)), D65_WHITE);
}

/** CIE Lab (D65) of a hex colour. */
export function hexToLab(hex: string): Lab {
  return labOfRgb(rgbOf(hex));
}

/** How colourful a colour is: its Lab chroma (0 for greys, about 130 at most in sRGB). */
export function chroma(hex: string): number {
  const { a, b } = hexToLab(hex);
  return Math.hypot(a, b);
}

/** Greys, near-blacks and near-whites: colours too faint to count as a hue. */
export function isNeutral(hex: string): boolean {
  return chroma(hex) < 8;
}

/** CIEDE2000 colour difference between two Lab colours (about 1 is just noticeable). */
export function deltaE2000Lab(x: Lab, y: Lab): number {
  const rad = Math.PI / 180;
  const c1 = Math.hypot(x.a, x.b);
  const c2 = Math.hypot(y.a, y.b);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1 = (1 + g) * x.a;
  const a2 = (1 + g) * y.a;
  const cp1 = Math.hypot(a1, x.b);
  const cp2 = Math.hypot(a2, y.b);
  const hue = (b: number, a: number) =>
    b === 0 && a === 0 ? 0 : (((Math.atan2(b, a) / rad) % 360) + 360) % 360;
  const h1 = hue(x.b, a1);
  const h2 = hue(y.b, a2);
  const dL = y.l - x.l;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);
  const lBar = (x.l + y.l) / 2;
  const cBar = (cp1 + cp2) / 2;
  let hBar = h1 + h2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hBar = (h1 + h2) / 2;
    else hBar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * rad) +
    0.24 * Math.cos(2 * hBar * rad) +
    0.32 * Math.cos((3 * hBar + 6) * rad) -
    0.2 * Math.cos((4 * hBar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** CIEDE2000 colour difference between two hex colours. */
export function deltaE2000(a: string, b: string): number {
  return deltaE2000Lab(hexToLab(a), hexToLab(b));
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

type Family =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan"
  | "sky blue"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "magenta"
  | "pink"
  | "rose";

/** Hue families by OKLCH hue, each up to (not including) its bound; after Tailwind's palette. */
const FAMILIES: readonly (readonly [number, Family])[] = [
  [8, "pink"],
  [20, "rose"],
  [33, "red"],
  [68, "orange"],
  [82, "amber"],
  [115, "yellow"],
  [140, "lime"],
  [170, "green"],
  [192, "teal"],
  [225, "cyan"],
  [248, "sky blue"],
  [270, "blue"],
  [285, "indigo"],
  [298, "violet"],
  [315, "purple"],
  [340, "magenta"],
  [361, "pink"],
];

/**
 * A family's names by lightness (Lab L): deep (below 25) and dark (below
 * 45) are whole names; mid (below 72), light (below 88) and pale are bases
 * that take "vivid", "muted", "bright", "light", "soft" or "pale".
 */
const VIVID: Record<Family, readonly [string, string, string, string, string]> = {
  red: ["maroon", "dark red", "red", "coral", "coral"],
  orange: ["dark brown", "burnt orange", "orange", "orange", "peach"],
  amber: ["dark brown", "golden brown", "amber", "amber", "yellow"],
  yellow: ["dark olive", "olive", "yellow", "yellow", "yellow"],
  lime: ["dark olive green", "olive green", "lime green", "lime", "lime"],
  green: ["deep forest green", "forest green", "green", "green", "mint"],
  teal: ["deep teal", "dark teal", "teal", "aqua", "aqua"],
  cyan: ["deep teal", "dark cyan", "cyan", "cyan", "cyan"],
  "sky blue": ["deep navy blue", "ocean blue", "sky blue", "sky blue", "sky blue"],
  blue: ["deep navy blue", "royal blue", "blue", "blue", "blue"],
  indigo: ["deep indigo", "dark indigo", "indigo", "periwinkle", "periwinkle"],
  violet: ["deep violet", "dark violet", "violet", "lavender", "lavender"],
  purple: ["deep purple", "dark purple", "purple", "lilac", "lilac"],
  magenta: ["deep plum", "purple", "magenta", "orchid", "pink"],
  pink: ["deep plum", "raspberry", "pink", "pink", "pink"],
  rose: ["burgundy", "crimson", "rose", "rose", "pink"],
};

/** Names that already say a colour is light: they take "soft" or "bright", never "light". */
const LIGHT_WORDS = new Set([
  "coral",
  "peach",
  "aqua",
  "periwinkle",
  "lavender",
  "lilac",
  "orchid",
  "mint",
]);

type Group = "cool" | "aqua" | "green" | "yellow" | "warm" | "red" | "pink" | "purple";
const GROUP: Record<Family, Group> = {
  red: "red",
  orange: "warm",
  amber: "warm",
  yellow: "yellow",
  lime: "green",
  green: "green",
  teal: "aqua",
  cyan: "aqua",
  "sky blue": "cool",
  blue: "cool",
  indigo: "cool",
  violet: "purple",
  purple: "purple",
  magenta: "pink",
  pink: "pink",
  rose: "pink",
};

/** Low-chroma colours: slates, sages, tans, mauves. Same bands as above, all whole names. */
const MUTED: Record<Group, readonly [string, string, string, string, string]> = {
  cool: ["deep navy blue", "dark slate grey", "slate grey", "light slate grey", "pale blue"],
  aqua: ["deep teal", "dark teal", "muted teal", "soft aqua", "pale aqua"],
  green: ["deep forest green", "dark olive green", "sage green", "light sage", "pale mint"],
  yellow: ["dark olive", "olive", "khaki", "khaki", "cream"],
  warm: ["dark brown", "brown", "tan", "tan", "beige"],
  red: ["dark brown", "brown", "dusty rose", "soft pink", "pale pink"],
  pink: ["deep plum", "dark mauve", "dusty rose", "soft pink", "pale pink"],
  purple: ["deep plum", "dark mauve", "mauve", "soft lavender", "pale lavender"],
};

function neutralName(l: number): string {
  if (l >= 98.5) return "white";
  if (l >= 93) return "off-white";
  if (l >= 82) return "light grey";
  if (l >= 70) return "silver";
  if (l >= 45) return "grey";
  if (l >= 28) return "dark grey";
  if (l >= 9) return "charcoal grey";
  return "black";
}

function familyOf(hue: number): Family {
  for (const [bound, family] of FAMILIES) if (hue < bound) return family;
  return "pink";
}

/**
 * A short plain-English name for a colour, for an image prompt or a label:
 * "deep navy blue", "vivid orange", "off-white", "charcoal grey", "soft
 * lavender". Deterministic, at most three words.
 */
export function colourName(hex: string): string {
  const rgb = rgbOf(hex);
  const { l, a, b } = labOfRgb(rgb);
  const c = Math.hypot(a, b);
  if (c < 8) return neutralName(l);
  const [, oa, ob] = srgbToOklab(rgb);
  const hue = ((Math.atan2(ob, oa) * 180) / Math.PI + 360) % 360;
  const family = familyOf(hue);
  const group = GROUP[family];
  const band = l < 25 ? 0 : l < 45 ? 1 : l < 72 ? 2 : l < 88 ? 3 : 4;
  // Warm colours read as browns, tans and creams well before they read as grey.
  const muted = c < (group === "warm" || group === "yellow" ? 30 : 22);
  if (muted) {
    if (l < 4) return "black";
    // A dark slate only reads as navy once its tint is strong for how dark it is.
    if (band === 0 && group === "cool" && c < 14 && c / l < 1.6) return "charcoal grey";
    if (band === 2 && group === "yellow" && l < 60) return "olive";
    if (band === 2 && group === "warm" && l < 60) return "brown";
    if (band === 3 && group === "warm" && l >= 80) return "beige";
    if (band === 4 && (group === "warm" || group === "yellow") && l >= 93)
      return group === "yellow" || hue >= 85 ? "ivory" : "cream";
    return MUTED[group][band];
  }
  if (family === "blue" && band <= 1 && l < 30) return l < 25 ? "deep navy blue" : "navy blue";
  if (family === "yellow" && band === 2 && l < 60) return "olive";
  // Dark oranges and ambers are rust only while they stay strong; otherwise brown.
  if ((family === "orange" || family === "amber") && band === 1 && c < 55) return "brown";
  const base = VIVID[family][band];
  if (band <= 1) return base;
  if (band === 2) return c >= 65 ? `vivid ${base}` : c < 35 ? `muted ${base}` : base;
  if (band === 4) return c >= 45 ? `bright ${base}` : `pale ${base}`;
  if (c >= 60) return `bright ${base}`;
  if (LIGHT_WORDS.has(base)) return c < 30 ? `soft ${base}` : base;
  return `light ${base}`;
}

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

export interface MergedColour {
  /** The heaviest member's colour. */
  hex: string;
  /** The members' weights summed. */
  weight: number;
  /** Every distinct colour folded in, heaviest first. */
  members: string[];
}

/**
 * Near-duplicate colours folded together: heaviest first, each joins the
 * first swatch within `threshold` (CIEDE2000) of it, or starts its own.
 * Identical codes are summed before anything is compared.
 */
const MERGE_LIMIT = 1500;

export function mergeColours(
  list: { hex: string; weight: number }[],
  threshold = 6,
): MergedColour[] {
  const totals = new Map<string, number>();
  for (const item of Array.isArray(list) ? list.slice(0, 100_000) : []) {
    const rgb = item && typeof item.hex === "string" ? hexToRgb(item.hex) : null;
    const weight = Number(item?.weight);
    if (!rgb || !Number.isFinite(weight)) continue;
    const hex = rgbToHex(rgb);
    totals.set(hex, (totals.get(hex) ?? 0) + weight);
  }
  // Comparing is quadratic: only the heaviest distinct colours are worth it.
  const sorted = [...totals].sort((x, y) => y[1] - x[1]).slice(0, MERGE_LIMIT);
  const clusters: (MergedColour & { lab: Lab })[] = [];
  for (const [hex, weight] of sorted) {
    const lab = hexToLab(hex);
    const home = clusters.find((cluster) => deltaE2000Lab(cluster.lab, lab) <= threshold);
    if (home) {
      home.weight += weight;
      home.members.push(hex);
    } else clusters.push({ hex, weight, members: [hex], lab });
  }
  return clusters
    .sort((x, y) => y.weight - x.weight)
    .map(({ hex, weight, members }) => ({ hex, weight, members }));
}
