/**
 * What a website's stylesheets say about its brand: the colours it paints
 * with (weighted by where they're used, brand-named custom properties
 * first), its custom properties, the fonts its headings, body and buttons
 * are set in, the font files it serves, and the stylesheets it imports.
 *
 * A small tolerant reader rather than a full CSS parser: comments and
 * strings are respected, nested blocks (@media, @supports, @layer, nested
 * rules) are walked, and anything malformed is skipped, never thrown on.
 * Pure, so it runs on the server (a Worker) and in tests.
 */
import { isNeutral, mergeColours, parseCssColour } from "./colour";

export interface CssColour {
  hex: string;
  weight: number;
  neutral: boolean;
  /** Distinct properties it was used in (at most 6). */
  properties: string[];
  /** Custom properties that hold it (at most 6). */
  variables: string[];
}

export interface CssVariable {
  name: string;
  value: string;
  hex: string | null;
  /** Defined for a dark scheme: a prefers-color-scheme: dark block, or a .dark or [data-theme=dark] selector. */
  dark: boolean;
}

export type FontRole = "heading" | "body" | "button" | "other";

export interface CssFont {
  family: string;
  stack: string;
  weight: number;
  roles: FontRole[];
}

export interface CssFontFace {
  family: string;
  weight: string | null;
  style: string | null;
  sources: { url: string; format: string | null }[];
}

export interface CssSignals {
  colours: CssColour[];
  variables: CssVariable[];
  fonts: CssFont[];
  fontFaces: CssFontFace[];
  imports: string[];
}

const MAX_INPUT = 2_000_000;
const MAX_DECLARATIONS = 60_000;
const MAX_DEPTH = 48;

/* ------------------------------------------------------------------ */
/* Reading the blocks                                                  */
/* ------------------------------------------------------------------ */

interface Declaration {
  /** Lowercase, except custom properties (whose names are case-sensitive). */
  property: string;
  value: string;
  selector: string;
  dark: boolean;
  keyframes: boolean;
  /** The rule it was declared in, for custom properties set alongside their use. */
  rule: number;
  /** Where the declaration starts in the sheet (comments taken out, lines kept). */
  at: number;
}

interface RawFace {
  family: string;
  weight: string | null;
  style: string | null;
  src: string | null;
}

interface Block {
  kind: "rule" | "wrapper" | "font-face" | "keyframes" | "ignored";
  selector: string;
  dark: boolean;
  keyframes: boolean;
  rule: number;
  face: RawFace | null;
}

/** At-rules whose blocks hold ordinary rules (or, nested in a rule, its declarations). */
const WRAPPERS = new Set([
  "media",
  "supports",
  "layer",
  "container",
  "document",
  "-moz-document",
  "scope",
  "starting-style",
]);
/** Tailwind 4's theme block (`@theme`, `@theme inline`): custom properties on the root, written in source. */
const THEME_BLOCK = "@theme";
const DARK_MEDIA = /prefers-color-scheme\s*:\s*dark/i;
const DARK_SELECTOR =
  /\.(?:dark|dark-mode|dark-theme|theme-dark)(?![\w-])|\[data-[\w-]*(?:theme|mode|scheme)[\w-]*\s*[~|^$*]?=\s*["']?dark(?![\w-])/i;

/** Where a quoted string that starts at `index` ends (its closing quote, or the line's end). */
function stringEnd(text: string, index: number): number {
  const quote = text.charCodeAt(index);
  let at = index + 1;
  while (at < text.length) {
    const code = text.charCodeAt(at);
    if (code === 92) at += 2;
    else if (code === quote || code === 10) return at;
    else at += 1;
  }
  return text.length;
}

/** The sheet with its comments taken out; a comment's line breaks stay, so lines keep their numbers. */
function stripComments(css: string): string {
  const parts: string[] = [];
  let start = 0;
  for (let at = 0; at < css.length; at += 1) {
    const code = css.charCodeAt(at);
    if (code === 34 || code === 39) at = stringEnd(css, at);
    else if (code === 47 && css.charCodeAt(at + 1) === 42) {
      const end = css.indexOf("*/", at + 2);
      const close = end < 0 ? css.length : end + 2;
      parts.push(css.slice(start, at), " ", css.slice(at, close).replace(/[^\n]+/g, ""));
      at = close - 1;
      start = close;
    }
  }
  parts.push(css.slice(start));
  return parts.join("");
}

/** Splits on `separator` outside quotes, brackets and parentheses. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '"' || char === "'") at = stringEnd(text, at);
    else if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function nest(parent: string, child: string): string {
  if (!parent) return child.slice(0, 2000);
  return (child.includes("&") ? child.replace(/&/g, parent) : `${parent} ${child}`).slice(0, 2000);
}

function readBlocks(css: string): {
  declarations: Declaration[];
  faces: RawFace[];
  imports: string[];
  keyframes: string[];
} {
  const declarations: Declaration[] = [];
  const faces: RawFace[] = [];
  const imports: string[] = [];
  const keyframes: string[] = [];
  const stack: Block[] = [];
  let rules = 0;

  const statement = (text: string, offset: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const at = offset + (text.length - text.trimStart().length);
    if (trimmed[0] === "@") {
      if (/^@import\b/i.test(trimmed) && imports.length < 50) imports.push(trimmed);
      return;
    }
    const block = stack[stack.length - 1];
    if (!block || block.kind === "ignored" || block.kind === "keyframes") return;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return;
    const name = trimmed.slice(0, colon).trim();
    if (!/^-{0,2}[a-zA-Z_][\w-]*$/.test(name) && !/^--[\w-]+$/.test(name)) return;
    const property = name.startsWith("--") ? name : name.toLowerCase();
    const value = trimmed
      .slice(colon + 1)
      .trim()
      .replace(/\s*!\s*important\s*$/i, "");
    if (block.kind === "font-face" && block.face) {
      const face = block.face;
      if (property === "font-family") face.family = cleanFamily(value);
      else if (property === "font-weight") face.weight = value.slice(0, 40);
      else if (property === "font-style") face.style = value.slice(0, 40);
      else if (property === "src") face.src = value;
      return;
    }
    if (block.selector && declarations.length < MAX_DECLARATIONS)
      declarations.push({
        property,
        value,
        selector: block.selector,
        dark: block.dark,
        keyframes: block.keyframes,
        rule: block.rule,
        at,
      });
  };

  const open = (prelude: string) => {
    const text = prelude.trim().replace(/\s+/g, " ");
    const parent = stack[stack.length - 1];
    const ignored: Block = {
      kind: "ignored",
      selector: "",
      dark: false,
      keyframes: false,
      rule: -1,
      face: null,
    };
    if (stack.length >= MAX_DEPTH || parent?.kind === "ignored" || parent?.kind === "font-face") {
      stack.push(ignored);
      return;
    }
    const inherited = {
      dark: parent?.dark ?? false,
      keyframes: parent?.keyframes ?? false,
      face: null,
    };
    if (text.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(text)?.[1]?.toLowerCase() ?? "";
      if (name === "font-face" && faces.length < 60) {
        const face: RawFace = { family: "", weight: null, style: null, src: null };
        faces.push(face);
        stack.push({ ...ignored, kind: "font-face", face });
      } else if (name.endsWith("keyframes")) {
        const named = text
          .slice(name.length + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (named && keyframes.length < 200 && !keyframes.includes(named)) keyframes.push(named);
        stack.push({ ...inherited, kind: "keyframes", selector: "", keyframes: true, rule: -1 });
      } else if (name === "theme" && !parent)
        stack.push({ ...inherited, kind: "rule", selector: THEME_BLOCK, rule: rules++ });
      else if (WRAPPERS.has(name))
        stack.push({
          ...inherited,
          kind: "wrapper",
          selector: parent?.selector ?? "",
          dark: inherited.dark || (name === "media" && DARK_MEDIA.test(text)),
          rule: parent?.rule ?? -1,
        });
      else stack.push(ignored);
    } else if (parent?.kind === "keyframes")
      stack.push({ ...inherited, kind: "rule", selector: "@keyframes", rule: rules++ });
    else {
      const selector = nest(parent?.selector ?? "", text);
      stack.push({
        ...inherited,
        kind: "rule",
        selector,
        dark: inherited.dark || DARK_SELECTOR.test(selector),
        rule: rules++,
      });
    }
  };

  let start = 0;
  let paren = 0;
  for (let at = 0; at < css.length; at += 1) {
    const code = css.charCodeAt(at);
    if (code === 34 || code === 39) at = stringEnd(css, at);
    else if (code === 40) paren += 1;
    else if (code === 41) paren = Math.max(0, paren - 1);
    else if (code === 59 && paren === 0) {
      statement(css.slice(start, at), start);
      start = at + 1;
    } else if (code === 123 && paren === 0) {
      open(css.slice(start, at));
      start = at + 1;
    } else if (code === 125) {
      // A stray "(" never swallows the rest of the sheet: a block's end ends it too.
      paren = 0;
      statement(css.slice(start, at), start);
      stack.pop();
      start = at + 1;
    }
  }
  statement(css.slice(start), start);
  return { declarations, faces, imports, keyframes };
}

/* ------------------------------------------------------------------ */
/* Custom properties                                                   */
/* ------------------------------------------------------------------ */

const ROOT_PART = /^(?::root|html|body|:host)(?:\[[^\]]*\]|\.[\w-]+|:[\w-]+)*$/i;
const isRootSelector = (selector: string) =>
  selector === THEME_BLOCK ||
  splitTop(selector, ",").some((part) => part.trim() === "*" || ROOT_PART.test(part.trim()));

const BRAND_NAME = /primary|brand|accent|secondary|highlight|main|theme|cta|action/i;
const NOT_BRAND = /foreground|contrast|(?:^|-)on-|-fg(?![a-z])/i;
const isBrandVariable = (name: string) => BRAND_NAME.test(name) && !NOT_BRAND.test(name);

/**
 * How var(--name) reads where it is used: the same rule's own definition
 * first, then the page-wide one for the same scheme (a definition on the
 * root wins over one on any other selector), then the other scheme's.
 */
function definitionsOf(declarations: Declaration[]) {
  const global = new Map<string, { light?: string; dark?: string }>();
  const local = new Map<number, Map<string, string>>();
  for (const decl of declarations) {
    if (!decl.property.startsWith("--")) continue;
    let own = local.get(decl.rule);
    if (!own) local.set(decl.rule, (own = new Map()));
    own.set(decl.property, decl.value);
    const entry = global.get(decl.property) ?? {};
    // The first definition, until one on the root (where later ones win, as in the cascade).
    const slot = decl.dark ? "dark" : "light";
    if (entry[slot] === undefined || isRootSelector(decl.selector)) entry[slot] = decl.value;
    global.set(decl.property, entry);
  }
  return (name: string, rule: number, dark: boolean): string | undefined => {
    const own = local.get(rule)?.get(name);
    if (own !== undefined) return own;
    const entry = global.get(name);
    return dark ? (entry?.dark ?? entry?.light) : (entry?.light ?? entry?.dark);
  };
}

function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code === 34 || code === 39) at = stringEnd(text, at);
    else if (code === 40) depth += 1;
    else if (code === 41 && --depth === 0) return at;
  }
  return -1;
}

/**
 * A value with its var() references replaced (recursively, at most six deep,
 * never round a cycle); one that can't be resolved and has no fallback is
 * left as written.
 */
function substitute(
  value: string,
  lookup: (name: string) => string | undefined,
  depth = 0,
  chain: string[] = [],
  budget = { steps: 0 },
): string {
  if (depth > 6 || !value.includes("var(")) return value;
  let out = "";
  let index = 0;
  for (;;) {
    const start = value.indexOf("var(", index);
    if (start < 0 || budget.steps > 200 || out.length > 4000) break;
    const end = closingParen(value, start + 3);
    if (end < 0) break;
    budget.steps += 1;
    const [head = "", ...rest] = splitTop(value.slice(start + 4, end), ",");
    const name = head.trim();
    const fallback = rest.length ? rest.join(",").trim() : null;
    const raw = chain.includes(name) ? undefined : lookup(name);
    let replacement =
      raw === undefined ? null : substitute(raw, lookup, depth + 1, [...chain, name], budget);
    if ((replacement === null || replacement.includes("var(")) && fallback !== null)
      replacement = substitute(fallback, lookup, depth + 1, chain, budget);
    out += value.slice(index, start) + (replacement ?? value.slice(start, end + 1));
    index = end + 1;
  }
  return out + value.slice(index);
}

const CHANNEL_USE = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*var\(\s*(--[\w-]+)/gi;

/**
 * The colour function each bare-channel variable is used in: shadcn's
 * `--primary: 222.2 47.4% 11.2%` read through hsl(var(--primary)), or
 * `--brand: 37 99 235` through rgb(var(--brand)). Aliases inherit it.
 */
function channelSpaces(declarations: Declaration[]): Map<string, string> {
  const spaces = new Map<string, string>();
  const aliases: [string, string][] = [];
  for (const decl of declarations) {
    if (!decl.value.includes("var(")) continue;
    for (const match of decl.value.matchAll(CHANNEL_USE)) {
      const [, fn = "", name = ""] = match;
      if (!spaces.has(name)) spaces.set(name, fn.toLowerCase().replace(/^(rgb|hsl)a$/, "$1"));
    }
    const alias = /^var\(\s*(--[\w-]+)\s*(?:,[\s\S]*)?\)$/.exec(decl.value.trim());
    if (decl.property.startsWith("--") && alias?.[1]) aliases.push([decl.property, alias[1]]);
  }
  for (let pass = 0; pass < 3; pass += 1)
    for (const [name, target] of aliases) {
      const space = spaces.get(name);
      if (space && !spaces.has(target)) spaces.set(target, space);
    }
  return spaces;
}

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const TRIPLE = new RegExp(
  String.raw`^${NUMBER}(?:%|deg|turn|rad|grad)?(?:\s*,\s*|\s+)${NUMBER}%?(?:\s*,\s*|\s+)${NUMBER}(?:%|deg|turn|rad|grad)?(?:\s*\/\s*${NUMBER}%?)?$`,
  "i",
);
const HSL_TRIPLE = new RegExp(String.raw`^${NUMBER}(?:deg)?\s+${NUMBER}%\s+${NUMBER}%$`, "i");

/** The single colour a custom property holds, reading bare channels in the function they're used in. */
function heldColour(name: string, resolved: string, spaces: Map<string, string>) {
  const value = resolved.trim();
  if (TRIPLE.test(value)) {
    // Unused, "h s% l%" can only be hsl channels; other triples are left alone.
    const space = spaces.get(name) ?? (HSL_TRIPLE.test(value) ? "hsl" : undefined);
    return space ? parseCssColour(`${space}(${value})`) : null;
  }
  return parseCssColour(value);
}

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

const COLOUR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "light-dark",
]);
const PROPERTY_WEIGHTS: Record<string, number> = {
  background: 2,
  "background-color": 2,
  "background-image": 1,
  color: 1.5,
  fill: 1.5,
  stroke: 1.5,
  "-webkit-text-fill-color": 1.5,
  "accent-color": 1,
  "stop-color": 1,
  "box-shadow": 0.25,
  "text-shadow": 0.25,
};
/** A custom property's definition alone (before ×4 for a brand name): defining isn't using. */
const DEFINITION_WEIGHT = 0.5;

function propertyWeight(property: string): number | null {
  const weight = PROPERTY_WEIGHTS[property];
  if (weight !== undefined) return weight;
  if (/^(?:border|outline|column-rule)(?:-|$)/.test(property))
    return /(?:radius|width|style|collapse|spacing|offset)$/.test(property) ? null : 0.5;
  return /^(?:text-decoration|text-emphasis|caret-color|scrollbar-color|flood-color|lighting-color|-webkit-text-stroke)/.test(
    property,
  )
    ? 0.5
    : null;
}

interface Found {
  hex: string;
  alpha: number;
  gradient: boolean;
}

const isIdentChar = (code: number) =>
  (code >= 97 && code <= 122) ||
  (code >= 65 && code <= 90) ||
  (code >= 48 && code <= 57) ||
  code === 45 ||
  code === 95;
const UNRESOLVED_ALPHA = /\s*[,/]\s*var\((?:[^()]|\([^()]*\))*\)\s*\)$/;

/** Every colour written in a value: hex codes, colour functions (gradients' too) and names. */
function coloursIn(value: string, gradient = false, out: Found[] = [], depth = 0): Found[] {
  if (depth > 6) return out;
  const push = (text: string) => {
    const parsed =
      parseCssColour(text) ??
      (text.includes("var(") ? parseCssColour(text.replace(UNRESOLVED_ALPHA, ")")) : null);
    if (parsed) out.push({ ...parsed, gradient });
  };
  let at = 0;
  while (at < value.length && out.length < 48) {
    const code = value.charCodeAt(at);
    if (code === 34 || code === 39) at = stringEnd(value, at) + 1;
    else if (code === 35) {
      const hex = /^#[0-9a-f]{3,8}(?![\w-])/i.exec(value.slice(at, at + 10))?.[0];
      if (hex) push(hex);
      at += hex ? hex.length : 1;
    } else if (
      isIdentChar(code) &&
      !(code >= 48 && code <= 57) &&
      !isIdentChar(value.charCodeAt(at - 1))
    ) {
      let end = at + 1;
      while (end < value.length && isIdentChar(value.charCodeAt(end))) end += 1;
      const word = value.slice(at, end).toLowerCase();
      if (value.charCodeAt(end) !== 40) {
        push(word);
        at = end;
        continue;
      }
      const close = closingParen(value, end);
      if (close < 0) break;
      if (COLOUR_FUNCTIONS.has(word)) push(value.slice(at, close + 1));
      else if (word !== "url" && word !== "var")
        coloursIn(
          value.slice(end + 1, close),
          gradient || word.endsWith("gradient"),
          out,
          depth + 1,
        );
      at = close + 1;
    } else at += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

/** Generic families, system-font keywords and emoji fonts: never a brand's typeface. */
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "math",
  "emoji",
  "fangsong",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "segoe ui variable",
  "segoe ui emoji",
  "segoe ui symbol",
  "apple color emoji",
  "noto color emoji",
  "android emoji",
  "emojisymbols",
  "emojione mozilla",
  "twemoji mozilla",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "caption",
  "icon",
  "menu",
  "message-box",
  "small-caption",
  "status-bar",
]);
/** Families a system stack falls back to: the brand's only when they come first. */
const FALLBACK_FAMILIES = new Set([
  "roboto",
  "arial",
  "helvetica",
  "helvetica neue",
  "oxygen",
  "oxygen-sans",
  "ubuntu",
  "cantarell",
  "fira sans",
  "droid sans",
  "noto sans",
  "liberation sans",
  "dejavu sans",
  "tahoma",
  "verdana",
  "geneva",
  "lucida grande",
  "times new roman",
  "times",
  "georgia",
  "courier new",
  "courier",
  "menlo",
  "monaco",
  "consolas",
  "liberation mono",
  "sfmono-regular",
  "sf mono",
  "sf pro text",
  "sf pro display",
]);

/** A family name as written, unquoted; next/font's "__Inter_aaf875" becomes "Inter". */
function cleanFamily(raw: string): string {
  let name = raw.trim();
  const quote = name[0];
  if (quote === '"' || quote === "'") name = name.slice(1, name.endsWith(quote) ? -1 : undefined);
  name = name.replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim();
  const hashed = /^__(.+?)_[0-9a-f]{5,8}$/i.exec(name);
  return (hashed?.[1] ? hashed[1].replace(/_/g, " ") : name).slice(0, 80);
}

/** The typeface a stack asks for: its first family that isn't generic or a system fallback. */
function primaryFamily(stack: string): string | null {
  const names = splitTop(stack, ",").map(cleanFamily);
  for (const [index, name] of names.entries()) {
    const key = name.toLowerCase();
    if (!name || GENERIC_FAMILIES.has(key) || /\bfallback$|emoji/i.test(key)) continue;
    if (key.includes("var(") || key.includes("(") || (FALLBACK_FAMILIES.has(key) && index > 0))
      return null;
    return name;
  }
  return null;
}

/** The typeface a font stack names (`"Inter", system-ui, sans-serif` is Inter), or null for a system stack. */
export function fontStackFamily(stack: string): string | null {
  return typeof stack === "string" && stack.length < 2000 ? primaryFamily(stack) : null;
}

/** The family list of the `font` shorthand: what follows the size (and any /line-height). */
function shorthandStack(value: string): string | null {
  const match =
    /(?:^|\s)(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|pt|pc|vw|vh|vmin|vmax|ex|ch|cm|mm|in|q|lh|rlh)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)(?:\s*\/\s*[^\s,]+)?\s+([^\s][\s\S]*)$/i.exec(
      value,
    );
  return match?.[1]?.trim() ?? null;
}

const HEADING =
  /(?:^|[^\w-])h[1-6](?![\w-])|\.(?:[\w-]*-)?(?:title|heading|headline|display)(?:-\d)?(?![\w-])|\[class\*=["']?heading/i;
const BUTTON =
  /(?:^|[^\w-])button(?![\w-])|\.(?:[\w-]*-)?(?:btn|button|cta)(?:-[\w-]+)?(?![\w-])|\[type=["']?(?:submit|button)|\[role=["']?button/i;
const BODY = /(?:^|[^\w-])(?:html|body|p|main|article)(?![\w-])|:root(?![\w-])/i;
const ROLE_ORDER: FontRole[] = ["heading", "body", "button", "other"];

/** The element a selector styles: its last compound, after any combinator. */
function subjectOf(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let at = 0; at < selector.length; at += 1) {
    const char = selector[at];
    if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    else if (depth === 0 && (char === " " || char === ">" || char === "+" || char === "~"))
      start = at + 1;
  }
  return selector.slice(start);
}

function rolesOf(selector: string): FontRole[] {
  const roles = new Set<FontRole>();
  for (const part of splitTop(selector, ",")) {
    const subject = subjectOf(part.trim());
    if (HEADING.test(subject)) roles.add("heading");
    else if (BUTTON.test(subject)) roles.add("button");
    else if (BODY.test(subject)) roles.add("body");
    else roles.add("other");
  }
  return ROLE_ORDER.filter((role) => roles.has(role));
}

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

function resolveUrl(raw: string, baseUrl: string | undefined): string | null {
  const value = raw.trim();
  if (!value || /^(?:javascript|data|about|blob):/i.test(value)) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    // Relative, with nothing to resolve it against: kept as written.
    return baseUrl ? null : value;
  }
}

const URL_TOKEN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/i;

function faceSources(src: string, baseUrl: string | undefined) {
  const sources: { url: string; format: string | null }[] = [];
  for (const entry of splitTop(src, ",")) {
    const match = URL_TOKEN.exec(entry);
    const url = match ? resolveUrl(match[1] ?? match[2] ?? match[3] ?? "", baseUrl) : null;
    if (!url || sources.length >= 8) continue;
    const format = /format\(\s*["']?([^"')]+)["']?\s*\)/i.exec(entry)?.[1]?.trim().toLowerCase();
    sources.push({ url, format: format ?? null });
  }
  return sources;
}

function importUrl(statement: string, baseUrl: string | undefined): string | null {
  const match =
    /^@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')/i.exec(
      statement,
    );
  if (!match) return null;
  return resolveUrl(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "", baseUrl);
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

const round2 = (value: number) => Math.round(value * 100) / 100;

function scan(css: string, baseUrl: string | undefined): CssSignals {
  const { declarations, faces, imports } = readBlocks(stripComments(css));
  const lookupIn = definitionsOf(declarations);
  const spaces = channelSpaces(declarations);
  // Each value may take 200 lookups, the whole sheet 100,000: a web of variables can't stall it.
  let lookups = 0;
  const resolve = (decl: Declaration) => {
    if (lookups > 100_000) return decl.value;
    const budget = { steps: 0 };
    const value = substitute(
      decl.value,
      (name) => lookupIn(name, decl.rule, decl.dark),
      0,
      [],
      budget,
    );
    lookups += budget.steps;
    return value;
  };

  // What each custom property holds, and the colours brand-named ones hold.
  const held = new Map<Declaration, { hex: string; alpha: number } | null>();
  const brandHexes = new Set<string>();
  for (const decl of declarations) {
    if (!decl.property.startsWith("--")) continue;
    const colour = heldColour(decl.property, resolve(decl), spaces);
    held.set(decl, colour);
    if (colour && isBrandVariable(decl.property)) brandHexes.add(colour.hex);
  }

  const tally = new Map<
    string,
    { weight: number; properties: Set<string>; variables: Set<string> }
  >();
  for (const decl of declarations) {
    const custom = decl.property.startsWith("--");
    const base = custom ? DEFINITION_WEIGHT : propertyWeight(decl.property);
    if (base === null || decl.value.length > 20_000) continue;
    const colour = held.get(decl);
    const found = colour ? [{ ...colour, gradient: false }] : coloursIn(resolve(decl));
    if (!found.length) continue;
    const brand = custom
      ? isBrandVariable(decl.property)
      : [...decl.value.matchAll(/var\(\s*(--[\w-]+)/g)].some(([, name]) =>
          isBrandVariable(name ?? ""),
        );
    const context = (decl.dark ? 0.5 : 1) * (decl.keyframes ? 0.25 : 1);
    const seen = new Set<string>();
    for (const { hex, alpha, gradient } of found) {
      if (alpha < 0.15 || seen.has(hex)) continue;
      seen.add(hex);
      const boost = brand && (custom || brandHexes.has(hex)) ? 4 : 1;
      const entry = tally.get(hex) ?? { weight: 0, properties: new Set(), variables: new Set() };
      entry.weight += (gradient ? Math.min(1, base) : base) * context * boost;
      (custom ? entry.variables : entry.properties).add(decl.property);
      tally.set(hex, entry);
    }
  }
  const weighed = [...tally].map(([hex, { weight }]) => ({ hex, weight }));
  const colours = mergeColours(weighed.sort((x, y) => y.weight - x.weight).slice(0, 600), 4)
    .slice(0, 40)
    .map((cluster): CssColour => {
      const properties = new Set<string>();
      const variables = new Set<string>();
      for (const member of cluster.members) {
        const entry = tally.get(member);
        for (const property of entry?.properties ?? []) properties.add(property);
        for (const variable of entry?.variables ?? []) variables.add(variable);
      }
      return {
        hex: cluster.hex,
        weight: round2(cluster.weight),
        neutral: isNeutral(cluster.hex),
        properties: [...properties].slice(0, 6),
        variables: [...variables].slice(0, 6),
      };
    });

  // Each custom property once per scheme, its root definition first; brand names, then colours, lead.
  const listed = new Map<string, { decl: Declaration; root: boolean }>();
  for (const decl of declarations) {
    if (!decl.property.startsWith("--") || listed.size >= 3000) continue;
    const key = `${decl.property} ${decl.dark}`;
    const root = isRootSelector(decl.selector);
    const current = listed.get(key);
    if (!current || (root && !current.root)) listed.set(key, { decl, root });
  }
  const variables = [...listed.values()]
    .map(({ decl }): CssVariable => ({
      name: decl.property,
      value: decl.value.replace(/\s+/g, " ").slice(0, 200),
      hex: held.get(decl)?.hex ?? null,
      dark: decl.dark,
    }))
    .map((variable, index) => ({
      variable,
      rank: (isBrandVariable(variable.name) ? 0 : variable.hex ? 1 : 2) * 1e6 + index,
    }))
    .sort((x, y) => x.rank - y.rank)
    .slice(0, 300)
    .map(({ variable }) => variable);

  const fonts = new Map<string, CssFont>();
  for (const decl of declarations) {
    if (decl.keyframes || (decl.property !== "font-family" && decl.property !== "font")) continue;
    const resolved = resolve(decl).replace(/\s+/g, " ").trim();
    const stack = decl.property === "font" ? shorthandStack(resolved) : resolved;
    const family = stack ? primaryFamily(stack) : null;
    if (!stack || !family) continue;
    const roles = rolesOf(decl.selector);
    const weight = roles.includes("heading") || roles.includes("body") ? 2 : 1;
    const key = family.toLowerCase();
    const font = fonts.get(key);
    if (font) {
      font.weight += weight;
      font.roles = ROLE_ORDER.filter((role) => font.roles.includes(role) || roles.includes(role));
    } else fonts.set(key, { family, stack: stack.slice(0, 200), weight, roles });
  }

  const urls = new Set<string>();
  for (const statement of imports) {
    const url = importUrl(statement, baseUrl);
    if (url && urls.size < 10) urls.add(url);
  }

  return {
    colours,
    variables,
    fonts: [...fonts.values()].sort((x, y) => y.weight - x.weight).slice(0, 12),
    fontFaces: faces
      .filter((face) => face.family)
      .slice(0, 40)
      .map((face) => ({
        family: face.family,
        weight: face.weight,
        style: face.style,
        sources: face.src ? faceSources(face.src, baseUrl) : [],
      })),
    imports: [...urls],
  };
}

/**
 * The brand signals in a stylesheet (or several, joined): colours, custom
 * properties, fonts, @font-face files and @imports. Relative URLs resolve
 * against `baseUrl` (the stylesheet's own address). Reads at most the first
 * 2 MB; never throws.
 */
export function scanCss(css: string, options: { baseUrl?: string } = {}): CssSignals {
  if (typeof css !== "string" || !css)
    return { colours: [], variables: [], fonts: [], fontFaces: [], imports: [] };
  try {
    return scan(css.slice(0, MAX_INPUT), options.baseUrl);
  } catch {
    return { colours: [], variables: [], fonts: [], fontFaces: [], imports: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Tokens, as source code declares them                                */
/* ------------------------------------------------------------------ */

/**
 * Which theme a value belongs to: the one a page gets with no theme chosen
 * (`:root`, `@theme`), a dark or light one (`.dark`, `[data-theme=light]`,
 * a prefers-color-scheme block), or only inside some part of a page
 * (`.marketing-page`, `.builder-portal-theme`).
 */
export type TokenScheme = "default" | "dark" | "light" | "scoped";

export interface CssToken {
  /** The custom property, as written (its case kept). */
  name: string;
  value: string;
  /** With its var() references read through, in this token's scheme, as far as the sheet defines them. */
  resolved: string;
  /** The one colour it holds, if it holds one (bare channels read in the colour function they're used in). */
  hex: string | null;
  alpha: number | null;
  /** The rule it is set in: ":root", ".dark", "@theme" (Tailwind 4's theme block)… */
  selector: string;
  scheme: TokenScheme;
  /** Its line in the sheet, from 1. */
  line: number;
}

export interface CssTokens {
  /** Every custom property declaration, in the order written: once per scheme its rule sets it for. */
  tokens: CssToken[];
  /** The @keyframes the sheet names. */
  keyframes: string[];
}

const MAX_TOKENS = 4000;
const DARK_PART = new RegExp(
  `${DARK_SELECTOR.source}|\\[data-[\\w-]+\\s*[~|^$*]?=\\s*["']?dark(?![\\w-])`,
  "i",
);
const LIGHT_PART =
  /\.(?:light|light-mode|light-theme|theme-light)(?![\w-])|\[data-[\w-]+\s*[~|^$*]?=\s*["']?light(?![\w-])/i;

/** The schemes a rule sets its custom properties for, one per part of its selector list. */
function schemesOf(decl: Declaration): TokenScheme[] {
  // A prefers-color-scheme: dark block makes everything in it dark.
  if (decl.dark && !DARK_PART.test(decl.selector)) return ["dark"];
  const out = new Set<TokenScheme>();
  for (const raw of splitTop(decl.selector, ",")) {
    const part = raw.trim();
    // `:root:not(.dark)` is the light theme, not the dark one.
    const negated = /:not\([^)]*dark[^)]*\)/i.test(part);
    const bare = part.replace(/:not\((?:[^()]|\([^()]*\))*\)/gi, "");
    if (DARK_PART.test(bare)) out.add("dark");
    else if (LIGHT_PART.test(bare) || negated) out.add("light");
    else if (part === THEME_BLOCK || isRootSelector(part) || /^:where\(\s*:root/i.test(part))
      out.add("default");
    else out.add("scoped");
  }
  return [...out];
}

/** How var(--name) reads for a scheme: the same rule's own definition, then that scheme's, then the default's. */
function schemeDefinitions(declarations: Declaration[], schemes: Map<Declaration, TokenScheme[]>) {
  const global = new Map<string, Partial<Record<TokenScheme, string>>>();
  const local = new Map<number, Map<string, string>>();
  for (const decl of declarations) {
    if (!decl.property.startsWith("--")) continue;
    let own = local.get(decl.rule);
    if (!own) local.set(decl.rule, (own = new Map()));
    own.set(decl.property, decl.value);
    const entry = global.get(decl.property) ?? {};
    for (const scheme of schemes.get(decl) ?? []) {
      // The first definition, until a root one (where later ones win, as in the cascade).
      if (entry[scheme] === undefined || isRootSelector(decl.selector)) entry[scheme] = decl.value;
    }
    global.set(decl.property, entry);
  }
  return (name: string, rule: number, scheme: TokenScheme): string | undefined => {
    const own = local.get(rule)?.get(name);
    if (own !== undefined) return own;
    const entry = global.get(name);
    if (!entry) return undefined;
    return entry[scheme] ?? entry.default ?? entry.light ?? entry.dark ?? entry.scoped;
  };
}

/** Where each line starts, for turning an offset into a line number. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/**
 * Every custom property a stylesheet declares, where it declares it (its
 * rule, scheme and line) and what it comes to there: for reading a design
 * system from its source code, where a token's name and place matter as
 * much as its value. Tailwind 4's `@theme` blocks count as the root. Reads
 * at most the first 2 MB; never throws.
 */
export function scanCssTokens(css: string): CssTokens {
  if (typeof css !== "string" || !css) return { tokens: [], keyframes: [] };
  try {
    const text = stripComments(css.slice(0, MAX_INPUT));
    const { declarations, keyframes } = readBlocks(text);
    const custom = declarations.filter((decl) => decl.property.startsWith("--") && !decl.keyframes);
    const schemes = new Map(custom.map((decl) => [decl, schemesOf(decl)] as const));
    const lookupIn = schemeDefinitions(custom, schemes);
    const spaces = channelSpaces(declarations);
    const starts = lineStarts(text);
    const tokens: CssToken[] = [];
    let lookups = 0;
    for (const decl of custom) {
      for (const scheme of schemes.get(decl) ?? []) {
        if (tokens.length >= MAX_TOKENS) break;
        const budget = { steps: 0 };
        const resolved =
          lookups > 100_000
            ? decl.value
            : substitute(decl.value, (name) => lookupIn(name, decl.rule, scheme), 0, [], budget);
        lookups += budget.steps;
        const colour = heldColour(decl.property, resolved, spaces);
        tokens.push({
          name: decl.property,
          value: decl.value.replace(/\s+/g, " ").slice(0, 400),
          resolved: resolved.replace(/\s+/g, " ").slice(0, 400),
          hex: colour?.hex ?? null,
          alpha: colour ? round2(colour.alpha) : null,
          selector: decl.selector.replace(/\s+/g, " ").slice(0, 200),
          scheme,
          line: lineOf(starts, decl.at),
        });
      }
    }
    return { tokens, keyframes };
  } catch {
    return { tokens: [], keyframes: [] };
  }
}
