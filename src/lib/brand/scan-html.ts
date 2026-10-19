/**
 * What a website's home page says about its brand: its name, words and
 * calls to action, theme colours, icons and logo candidates, imagery, the
 * stylesheets and fonts it loads, and its JSON-LD organisation.
 *
 * A small tolerant tokenizer rather than a DOM (none exists in a Worker):
 * tags and attributes are read the way browsers forgive them, the contents
 * of scripts, templates and iframes are skipped, entities are decoded, and
 * malformed markup gives what it can rather than throwing. Pure.
 */
import { parseCssColour } from "./colour";

export interface LogoCandidate {
  url: string | null;
  /** Inline SVG markup (standalone: it carries its xmlns). */
  svg: string | null;
  alt: string | null;
  source: "img" | "svg" | "icon" | "og" | "jsonld";
  score: number;
}

export interface HtmlImage {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface HtmlIcon {
  url: string;
  rel: string;
  sizes: string | null;
  type: string | null;
}

export interface HtmlJsonLd {
  name: string | null;
  logo: string | null;
  slogan: string | null;
  sameAs: string[];
}

export interface HtmlSignals {
  url: string;
  title: string | null;
  siteName: string | null;
  description: string | null;
  lang: string | null;
  /** Hex codes from theme-color (every media variant), msapplication-TileColor and mask-icon. */
  themeColours: string[];
  icons: HtmlIcon[];
  manifestUrl: string | null;
  ogImage: string | null;
  logos: LogoCandidate[];
  images: HtmlImage[];
  stylesheets: string[];
  inlineCss: string;
  /** Family names. */
  googleFonts: string[];
  adobeFonts: boolean;
  headings: string[];
  ctas: string[];
  text: string;
  jsonLd: HtmlJsonLd;
  /** Links to the brand's profiles on social platforms (where it publishes). */
  socials: string[];
}

const MAX_INPUT = 2_000_000;
const MAX_INLINE_CSS = 400_000;
const MAX_TEXT = 8000;
const MAX_SVG = 150_000;

/* ------------------------------------------------------------------ */
/* Text and URLs                                                       */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  euro: "€",
  pound: "£",
  times: "×",
};

/** Named (the common ones) and numeric character references. */
/** File names that are a logo's by convention (a lockup, a wordmark, a brand symbol). */
const LOGO_FILE =
  /(?:^|[-_.@\s])(?:lockup|wordmark|logotype|emblem|monogram|symbol)(?=[-_.@\s]|$)/i;

/** The last part of an address's path (its file's name), decoded. */
function fileName(url: string | null): string {
  if (!url) return "";
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(name);
  } catch {
    return "";
  }
}

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(
    /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,7})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g,
    (match: string, dec?: string, hex?: string, name?: string) => {
      if (name) return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
      if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
      return String.fromCodePoint(code);
    },
  );
}

const collapse = (text: string) => text.replace(/[\s\u00a0]+/g, " ").trim();

/** An http(s) address resolved against the page (or its <base>); null for anything else. */
function absolute(raw: string | undefined | null, base: string | null): string | null {
  if (!raw) return null;
  const value = raw.replace(/[\t\n\r]/g, "").trim();
  if (!value || value.length > 4096 || /^data:/i.test(value)) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The SVG markup in a data: URL (base64 or percent-encoded), or null. */
function svgFromDataUrl(value: string): string | null {
  const match = /^data:image\/svg\+xml(;[^,]*)?,([\s\S]*)$/i.exec(value.trim());
  if (!match || value.length > MAX_SVG * 2) return null;
  try {
    const body = match[2] ?? "";
    const markup = /;base64/i.test(match[1] ?? "")
      ? new TextDecoder().decode(
          Uint8Array.from(atob(body.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
        )
      : decodeURIComponent(body);
    return /<svg[\s>]/i.test(markup) && markup.length <= MAX_SVG ? withXmlns(markup.trim()) : null;
  } catch {
    return null;
  }
}

/** SVG markup that stands alone as a file: it names its namespaces. */
function withXmlns(markup: string): string {
  const start = markup.search(/<svg[\s>]/i);
  if (start < 0) return markup;
  const openEnd = markup.indexOf(">", start);
  const open = markup.slice(start, openEnd < 0 ? markup.length : openEnd);
  let extra = "";
  if (!/\sxmlns\s*=/.test(open)) extra += ' xmlns="http://www.w3.org/2000/svg"';
  if (markup.includes("xlink:") && !/\sxmlns:xlink\s*=/.test(open))
    extra += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  return extra ? `${markup.slice(0, start + 4)}${extra}${markup.slice(start + 4)}` : markup;
}

/** The largest candidate in a srcset (by width, else density), or null. */
function largestInSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  const text = srcset.slice(0, 20_000);
  let best: { url: string; size: number } | null = null;
  let at = 0;
  while (at < text.length) {
    while (at < text.length && /[\s,]/.test(text[at] ?? "")) at += 1;
    let end = at;
    while (end < text.length && !/\s/.test(text[end] ?? "")) end += 1;
    // A URL may hold commas; one it ends with separates it from the next candidate.
    let url = text.slice(at, end);
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
      at = end;
    } else {
      const comma = text.indexOf(",", end);
      const stop = comma < 0 ? text.length : comma;
      descriptor = text.slice(end, stop).trim();
      at = stop + 1;
    }
    if (!url || /^data:/i.test(url)) continue;
    const match = /^(\d+(?:\.\d+)?)([wx])$/i.exec(descriptor.split(/\s+/)[0] ?? "");
    const size = match ? Number(match[1]) * (match[2]?.toLowerCase() === "x" ? 1000 : 1) : 1;
    if (!best || size > best.size) best = { url, size };
  }
  return best?.url ?? null;
}

/** Family names from a Google Fonts stylesheet address, css2 and v1 alike. */
function googleFamilies(href: string): string[] {
  try {
    const url = new URL(href, "https://fonts.googleapis.com/");
    if (url.hostname.toLowerCase() !== "fonts.googleapis.com") return [];
    return url.searchParams
      .getAll("family")
      .flatMap((value) => value.split("|"))
      .map((part) => collapse((part.split(":")[0] ?? "").replace(/\+/g, " ")))
      .filter((name) => name.length > 0 && name.length <= 80);
  } catch {
    return [];
  }
}

const dimension = (value: string | undefined): number | null => {
  const match = value ? /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(value) : null;
  return match ? Math.round(Number(match[1])) : null;
};

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

const ORGANISATION_TYPES = new Set([
  "organization",
  "corporation",
  "localbusiness",
  "onlinestore",
  "onlinebusiness",
  "store",
  "restaurant",
  "professionalservice",
  "ngo",
  "educationalorganization",
  "newsmediaorganization",
  "medicalorganization",
  "governmentorganization",
  "sportsorganization",
  "airline",
]);

interface LdState extends HtmlJsonLd {
  /** How sure each field is: organisations (0) over brands (1) over websites (2). */
  nameRank: number;
  logoRank: number;
  nodes: number;
}

function ldLogo(value: unknown, base: string | null): string | null {
  if (typeof value === "string") return absolute(value, base);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = ldLogo(item, base);
      if (url) return url;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["url", "contentUrl", "@id"]) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      const url = absolute(candidate, base);
      if (url && (key !== "@id" || /\.(?:png|jpe?g|svg|webp|gif|avif)(?:[?#]|$)/i.test(url)))
        return url;
    }
  }
  return null;
}

function walkJsonLd(node: unknown, state: LdState, base: string | null, depth = 0): void {
  if (depth > 10 || state.nodes++ > 4000 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, state, base, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  const types = [record["@type"]]
    .flat()
    .filter((type): type is string => typeof type === "string")
    .map((type) => type.toLowerCase().replace(/^.*[/#:]/, ""));
  const rank = types.some((type) => ORGANISATION_TYPES.has(type))
    ? 0
    : types.includes("brand")
      ? 1
      : types.includes("website")
        ? 2
        : -1;
  if (rank >= 0) {
    const name = record["name"];
    if (typeof name === "string" && collapse(name) && rank < state.nameRank) {
      state.name = collapse(decodeEntities(name)).slice(0, 200);
      state.nameRank = rank;
    }
    const logo = ldLogo(record["logo"], base);
    if (logo && rank < state.logoRank) {
      state.logo = logo;
      state.logoRank = rank;
    }
    const slogan = record["slogan"];
    if (typeof slogan === "string" && collapse(slogan) && !state.slogan)
      state.slogan = collapse(decodeEntities(slogan)).slice(0, 300);
    for (const link of [record["sameAs"]].flat()) {
      const url = typeof link === "string" ? absolute(link, null) : null;
      if (url && !state.sameAs.includes(url) && state.sameAs.length < 10) state.sameAs.push(url);
    }
  }
  for (const value of Object.values(record)) walkJsonLd(value, state, base, depth + 1);
}

function readJsonLd(text: string, state: LdState, base: string | null): void {
  const json = text
    .trim()
    .replace(/^(?:<!--|\/\/\s*<!\[CDATA\[|\/\*\s*<!\[CDATA\[\s*\*\/)/, "")
    .replace(/(?:-->|\/\/\s*\]\]>|\/\*\s*\]\]>\s*\*\/)$/, "");
  try {
    walkJsonLd(JSON.parse(json), state, base);
  } catch {
    // Not JSON (a template left unrendered, a trailing comma): nothing to read.
  }
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

interface Tag {
  name: string;
  attrs: Map<string, string>;
  selfClosing: boolean;
  /** Where the markup after the tag starts. */
  end: number;
}

const isSpace = (code: number) => code === 32 || (code >= 9 && code <= 13);
const isLetter = (code: number) => (code >= 97 && code <= 122) || (code >= 65 && code <= 90);

/** A start tag at `start` ("<" then a letter): its name and attributes, read as a browser would. */
function readTag(html: string, start: number): Tag {
  const n = html.length;
  let at = start + 1;
  while (at < n) {
    const code = html.charCodeAt(at);
    if (isSpace(code) || code === 47 || code === 62) break;
    at += 1;
  }
  const name = html.slice(start + 1, at).toLowerCase();
  const attrs = new Map<string, string>();
  while (at < n) {
    const code = html.charCodeAt(at);
    if (isSpace(code)) {
      at += 1;
      continue;
    }
    if (code === 62) return { name, attrs, selfClosing: false, end: at + 1 };
    if (code === 47) {
      if (html.charCodeAt(at + 1) === 62) return { name, attrs, selfClosing: true, end: at + 2 };
      at += 1;
      continue;
    }
    const keyStart = at;
    while (at < n) {
      const c = html.charCodeAt(at);
      if (isSpace(c) || c === 47 || c === 62 || (c === 61 && at > keyStart)) break;
      at += 1;
    }
    const key = html.slice(keyStart, at).toLowerCase();
    while (at < n && isSpace(html.charCodeAt(at))) at += 1;
    let value = "";
    if (html.charCodeAt(at) === 61) {
      at += 1;
      while (at < n && isSpace(html.charCodeAt(at))) at += 1;
      const quote = html.charCodeAt(at);
      if (quote === 34 || quote === 39) {
        const close = html.indexOf(quote === 34 ? '"' : "'", at + 1);
        const stop = close < 0 ? n : close;
        value = html.slice(at + 1, stop);
        at = stop + 1;
      } else {
        const valueStart = at;
        while (at < n && !isSpace(html.charCodeAt(at)) && html.charCodeAt(at) !== 62) at += 1;
        value = html.slice(valueStart, at);
      }
    }
    if (key && !attrs.has(key) && attrs.size < 64)
      attrs.set(key, value.length > 2 * MAX_SVG ? "" : decodeEntities(value));
  }
  return { name, attrs, selfClosing: false, end: n };
}

const closers = new Map<string, RegExp>();

/** The raw contents of a script, style, title or skipped element, and where its end tag ends. */
function rawContents(html: string, name: string, from: number): { content: string; next: number } {
  let pattern = closers.get(name);
  if (!pattern) closers.set(name, (pattern = new RegExp(`</${name}(?=[\\s/>])`, "gi")));
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (!match) return { content: html.slice(from), next: html.length };
  const close = html.indexOf(">", match.index);
  return { content: html.slice(from, match.index), next: close < 0 ? html.length : close + 1 };
}

/** Where an inline <svg> (nested ones counted) ends, or null when it never does. */
function svgEnd(html: string, from: number): number | null {
  const pattern = /<(\/?)svg(?=[\s/>])/gi;
  pattern.lastIndex = from;
  let depth = 1;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      const close = html.indexOf(">", match.index);
      return close < 0 ? html.length : close + 1;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

/** Elements whose contents aren't markup to read (only ld+json scripts, styles and the title are kept). */
const RAW = new Set([
  "script",
  "style",
  "title",
  "textarea",
  "noscript",
  "iframe",
  "template",
  "xmp",
  "noembed",
  "noframes",
]);
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "button",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "label",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);
const ICON_RELS = new Set([
  "icon",
  "apple-touch-icon",
  "apple-touch-icon-precomposed",
  "mask-icon",
  "fluid-icon",
]);
const PARTNER =
  /partner|client|customer|sponsor|trusted|testimonial|press|featured|as-seen|integration|marquee|carousel|logos(?![a-z])/i;
const HERO = /hero|banner|jumbotron|masthead|cover|showcase|splash|product|feature|gallery/i;
const CTA_CLASS = /(?:^|[\s_-])(?:btn|button|cta)(?:$|[\s_-])/i;
const ICONISH = /icon|arrow|chevron|caret|close|menu|hamburger|search|social|spinner/i;
const DRAWING = /<(?:path|rect|circle|polygon|ellipse|text|line|polyline|image)[\s/>]/i;
const TRACKING =
  /(?:^|[/._?&=-])(?:pixel|tracking|tracker|beacon|analytics|spacer|blank|1x1)(?:[/._?&=-]|$)|facebook\.com\/tr|doubleclick|google-analytics|googletagmanager|bat\.bing|px\.ads/i;

type Flag =
  | "head"
  | "header"
  | "nav"
  | "footer"
  | "article"
  | "home"
  | "logo"
  | "partner"
  | "hero"
  | "hidden"
  | "picture"
  | "video";

interface Capture {
  kind: "heading" | "cta";
  parts: string[];
  length: number;
}

interface Candidate extends LogoCandidate {
  strong: boolean;
  order: number;
}

interface Ranked extends HtmlImage {
  score: number;
  order: number;
}

function emptySignals(url: string): HtmlSignals {
  return {
    url,
    title: null,
    siteName: null,
    description: null,
    lang: null,
    themeColours: [],
    icons: [],
    manifestUrl: null,
    ogImage: null,
    logos: [],
    images: [],
    stylesheets: [],
    inlineCss: "",
    googleFonts: [],
    adobeFonts: false,
    headings: [],
    ctas: [],
    text: "",
    jsonLd: { name: null, logo: null, slogan: null, sameAs: [] },
    socials: [],
  };
}

/** Hosts of the social platforms a brand publishes on. */
const SOCIAL_HOST =
  /(?:^|\.)(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com|fb\.com|x\.com|twitter\.com|threads\.net|pinterest\.com)$/i;

/** Whether an address is a profile on a social platform (not a share button). */
export function isSocialProfile(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      SOCIAL_HOST.test(url.hostname) &&
      url.pathname.replace(/\/+$/, "").length > 1 &&
      // Not a share button, a single post or video, or a search.
      !/\/(?:share|sharer|intent|shareArticle|watch|embed|status|p|reel|posts|hashtag|explore|search)\b/i.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}

function scan(html: string, pageUrl: string): HtmlSignals {
  const pageBase = absolute(pageUrl, null);
  const bodyAt = html.search(/<body[\s>]/i);
  const baseTag = /<base\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
    bodyAt < 0 ? html : html.slice(0, bodyAt),
  );
  const base =
    (baseTag
      ? absolute(decodeEntities(baseTag[1] ?? baseTag[2] ?? baseTag[3] ?? ""), pageBase)
      : null) ?? pageBase;
  const site = pageBase ? new URL(pageBase) : null;
  const signals = emptySignals(pageUrl);

  const meta = new Map<string, string>();
  const css: string[] = [];
  let cssLength = 0;
  const text: string[] = [];
  let textLength = 0;
  const logos = new Map<string, Candidate>();
  const images = new Map<string, Ranked>();
  const ld: LdState = {
    name: null,
    logo: null,
    slogan: null,
    sameAs: [],
    nameRank: 9,
    logoRank: 9,
    nodes: 0,
  };
  let pictures = 0;
  let order = 0;

  const stack: { name: string; flags: Flag[]; capture: Capture | null }[] = [];
  const count: Record<Flag, number> = {
    head: 0,
    header: 0,
    nav: 0,
    footer: 0,
    article: 0,
    home: 0,
    logo: 0,
    partner: 0,
    hero: 0,
    hidden: 0,
    picture: 0,
    video: 0,
  };
  const captures: Capture[] = [];

  const addTheme = (value: string | undefined) => {
    const colour = value ? parseCssColour(value) : null;
    if (colour && !signals.themeColours.includes(colour.hex) && signals.themeColours.length < 12)
      signals.themeColours.push(colour.hex);
  };
  const addCss = (chunk: string) => {
    if (cssLength >= MAX_INLINE_CSS || !chunk.trim()) return;
    const piece = chunk.slice(0, MAX_INLINE_CSS - cssLength);
    css.push(piece);
    cssLength += piece.length + 1;
  };
  const addGoogleFonts = (href: string) => {
    for (const family of googleFamilies(href))
      if (
        signals.googleFonts.length < 12 &&
        !signals.googleFonts.some((known) => known.toLowerCase() === family.toLowerCase())
      )
        signals.googleFonts.push(family);
  };
  const addText = (chunk: string) => {
    if (count.head || count.hidden || textLength > MAX_TEXT * 2) return;
    text.push(chunk);
    textLength += chunk.length;
  };
  // A logo found at its srcset's largest file is the same logo as its plain src.
  const aliases = new Map<string, string>();
  const addLogo = (candidate: Omit<Candidate, "order">, alias: string | null = null) => {
    const key =
      (candidate.url && aliases.get(candidate.url)) ??
      candidate.url ??
      `svg ${candidate.svg?.length} ${candidate.svg?.slice(0, 400)}`;
    if (alias && alias !== key && !aliases.has(alias)) aliases.set(alias, key);
    const known = logos.get(key);
    if (!known) {
      if (logos.size < 200) logos.set(key, { ...candidate, order: order++ });
      return;
    }
    // The same file found another way is more likely the logo; found the same way twice, it isn't.
    known.score =
      known.source === candidate.source
        ? Math.max(known.score, candidate.score)
        : known.score + candidate.score;
    known.strong ||= candidate.strong;
    known.alt ??= candidate.alt;
  };
  const logoScore = (own: string, named = false) => {
    const mention = /logo|brand/i.test(own) || named || count.logo > 0;
    let score = (mention ? 5 : 0) + (count.header || count.nav ? 3 : 0) + (count.home ? 3 : 0);
    const qualifies = score > 0;
    if (pictures === 0) score += 2;
    if (count.footer) score -= 3;
    if (count.partner || PARTNER.test(own)) score -= 4;
    return { score, qualifies, strong: mention || count.home > 0 };
  };
  const addImage = (
    url: string,
    alt: string | null,
    width: number | null,
    height: number | null,
    own: string,
    curated = false,
  ) => {
    if ((width !== null && width < 120) || (height !== null && height < 120)) return;
    if (TRACKING.test(url)) return;
    const svgFile = /\.svg(?:[?#]|$)/i.test(url);
    if (svgFile && (/sprite|icon/i.test(url) || url.includes("#") || !width || !height)) return;
    const size = Math.max(width ?? 0, height ?? 0);
    const hero = count.hero > 0 || HERO.test(own);
    const score =
      (curated ? 2 : 0) +
      (size >= 600 ? 2 : size >= 300 ? 1 : 0) +
      (hero ? 1 : 0) -
      (!curated && !hero && (count.header || count.nav) ? 1 : 0) -
      (count.footer ? 2 : 0) -
      (svgFile ? 1 : 0);
    const known = images.get(url);
    if (known) {
      known.score = Math.max(known.score, score);
      known.alt ??= alt;
    } else if (images.size < 300)
      images.set(url, { url, alt, width, height, score, order: order++ });
  };
  const addHeading = (value: string) => {
    const heading = value.slice(0, 120).trim();
    if (heading && signals.headings.length < 12 && !signals.headings.includes(heading))
      signals.headings.push(heading);
  };
  const addCta = (value: string) => {
    const label = collapse(value);
    if (
      label &&
      label.length <= 60 &&
      signals.ctas.length < 16 &&
      !signals.ctas.some((known) => known.toLowerCase() === label.toLowerCase())
    )
      signals.ctas.push(label);
  };
  const isHome = (href: string | undefined): boolean => {
    const value = href?.trim();
    if (!value) return false;
    if (value === "/" || value === "./") return true;
    const url = absolute(value, base);
    if (!url || !site) return false;
    const parsed = new URL(url);
    return (
      parsed.hostname.replace(/^www\./, "") === site.hostname.replace(/^www\./, "") &&
      !parsed.search &&
      /^\/(?:index\.(?:html?|php)|home\/?|[a-z]{2}(?:[-_][a-z]{2})?\/?)?$/i.test(parsed.pathname)
    );
  };

  const popOne = () => {
    const entry = stack.pop();
    if (!entry) return;
    for (const flag of entry.flags) count[flag] -= 1;
    if (!entry.capture) return;
    captures.splice(captures.lastIndexOf(entry.capture), 1);
    const value = collapse(entry.capture.parts.join(""));
    if (entry.capture.kind === "heading") addHeading(value);
    else addCta(value);
  };
  const close = (name: string) => {
    for (let index = stack.length - 1; index >= 0 && index >= stack.length - 128; index -= 1)
      if (stack[index]?.name === name) {
        while (stack.length > index) popOne();
        return;
      }
  };
  const onText = (raw: string) => {
    if (!raw || count.head || count.hidden) return;
    const decoded = decodeEntities(raw.length > 50_000 ? raw.slice(0, 50_000) : raw);
    addText(decoded);
    for (const capture of captures)
      if (capture.length < 400) {
        capture.parts.push(decoded);
        capture.length += decoded.length;
      }
  };

  const onImg = (attrs: Map<string, string>) => {
    // Lazy loaders keep the real address aside and put a placeholder in src.
    const lazy = attrs.get("data-src") ?? attrs.get("data-lazy-src") ?? attrs.get("data-original");
    let raw = attrs.get("src");
    if (lazy && (!raw || /^data:image\/(?:gif|png)|blank|placeholder|spacer|lazy/i.test(raw)))
      raw = lazy;
    const svg = raw && /^data:image\/svg\+xml/i.test(raw) ? svgFromDataUrl(raw) : null;
    const url = svg
      ? null
      : (absolute(largestInSrcset(attrs.get("srcset") ?? attrs.get("data-srcset")), base) ??
        absolute(raw, base));
    if (!url && !svg) return;
    const alt = collapse(attrs.get("alt") ?? "") || null;
    const width = dimension(attrs.get("width"));
    const height = dimension(attrs.get("height"));
    // What the picture says about itself: its file's name and its labels (a
    // folder called "brand" says nothing about any one picture in it).
    const file = fileName(url);
    const own = [file, alt, attrs.get("class"), attrs.get("id"), attrs.get("aria-label")].join(" ");
    const { score, qualifies, strong } = logoScore(own, LOGO_FILE.test(file));
    pictures += 1;
    const tiny = (width !== null && width < 16) || (height !== null && height < 16);
    if (qualifies && !(tiny && !/logo|brand/i.test(own)))
      addLogo({ url, svg, alt, source: svg ? "svg" : "img", score, strong }, absolute(raw, base));
    if (url) addImage(url, alt, width, height, own);
  };

  const onSvg = (tag: Tag, start: number): number => {
    const end = svgEnd(html, tag.end);
    if (end === null) return tag.end;
    const markup = html.slice(start, end);
    if (markup.length > MAX_SVG || !DRAWING.test(markup)) return end;
    const attrs = tag.attrs;
    const titleText = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(markup)?.[1];
    const label =
      collapse(attrs.get("aria-label") ?? "") ||
      (titleText ? collapse(decodeEntities(titleText.replace(/<[^>]*>/g, ""))) : "") ||
      null;
    const own = [attrs.get("class"), attrs.get("id"), label].join(" ");
    const mention = /logo|brand/i.test(own) || count.logo > 0;
    const width = dimension(attrs.get("width"));
    const height = dimension(attrs.get("height"));
    const tiny = (width !== null && width <= 32) || (height !== null && height <= 32);
    // Icons (menus, arrows, social links) aren't logos unless something says they are.
    const decorative = ICONISH.test(own) || tiny || attrs.get("aria-hidden") === "true";
    if (!mention && !count.home && decorative) return end;
    const { score, qualifies, strong } = logoScore(own);
    pictures += 1;
    if (qualifies)
      addLogo({ url: null, svg: withXmlns(markup), alt: label, source: "svg", score, strong });
    return end;
  };

  const onLink = (attrs: Map<string, string>) => {
    const rels = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const href = absolute(attrs.get("href"), base);
    if (!href) return;
    if (/^https?:\/\/fonts\.googleapis\.com\//i.test(href)) addGoogleFonts(href);
    const stylesheet =
      (rels.includes("stylesheet") && !rels.includes("alternate")) ||
      (rels.includes("preload") && (attrs.get("as") ?? "").toLowerCase() === "style");
    if (
      stylesheet &&
      !/^https?:\/\/(?:fonts\.googleapis\.com|use\.typekit\.net|p\.typekit\.net)\//i.test(href) &&
      !signals.stylesheets.includes(href) &&
      signals.stylesheets.length < 12
    )
      signals.stylesheets.push(href);
    if (rels.includes("manifest")) signals.manifestUrl ??= href;
    if (rels.includes("mask-icon")) addTheme(attrs.get("color"));
    if (!rels.some((rel) => ICON_RELS.has(rel))) return;
    const sizes = attrs.get("sizes")?.trim() || null;
    const type = attrs.get("type")?.trim().toLowerCase() || null;
    if (signals.icons.length < 16 && !signals.icons.some((icon) => icon.url === href))
      signals.icons.push({ url: href, rel: rels.join(" "), sizes, type });
    const largest = Math.max(
      0,
      ...[...(sizes ?? "").matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((m) =>
        Math.max(Number(m[1]), Number(m[2])),
      ),
    );
    const vector =
      !!type?.includes("svg") ||
      /\.svg(?:[?#]|$)/i.test(href) ||
      /\bany\b/i.test(sizes ?? "") ||
      rels.includes("mask-icon");
    if (rels.some((rel) => rel.startsWith("apple-touch-icon")))
      addLogo({ url: href, svg: null, alt: null, source: "icon", score: 2, strong: false });
    else if (largest >= 64 || vector)
      addLogo({ url: href, svg: null, alt: null, source: "icon", score: 1, strong: false });
  };

  const onMeta = (attrs: Map<string, string>) => {
    const key = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop") ?? "")
      .trim()
      .toLowerCase();
    const content = attrs.get("content");
    if (!key || content === undefined) return;
    if (/^(?:theme-color|msapplication-tilecolor|msapplication-navbutton-color)$/.test(key))
      addTheme(content);
    else if (!meta.has(key) && collapse(content)) meta.set(key, collapse(content).slice(0, 2000));
  };

  const open = (tag: Tag) => {
    const { name, attrs } = tag;
    const role = (attrs.get("role") ?? "").toLowerCase();
    const label = `${attrs.get("class") ?? ""} ${attrs.get("id") ?? ""}`;
    if (name === "body") close("head");
    if (BLOCK.has(name)) addText("\n");
    const style = attrs.get("style");
    if (style) {
      addCss(`${name}[style]{${style.replace(/[{}]/g, "")}}`);
      for (const match of style.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
        const url = absolute(match[1] ?? match[2] ?? match[3], base);
        if (url) addImage(url, null, null, null, label);
      }
    }
    for (const key of ["data-bg", "data-background", "data-background-image", "data-bg-src"]) {
      const value = attrs.get(key)?.replace(/^url\(\s*(["']?)(.*)\1\s*\)$/, "$2");
      const url = absolute(value, base);
      if (url) addImage(url, null, null, null, label);
    }
    switch (name) {
      case "html":
        signals.lang ??=
          collapse(attrs.get("lang") ?? attrs.get("xml:lang") ?? "").slice(0, 35) || null;
        break;
      case "meta":
        onMeta(attrs);
        break;
      case "link":
        onLink(attrs);
        break;
      case "img":
        onImg(attrs);
        break;
      case "source":
        if (count.picture && !count.video) {
          const url = absolute(
            largestInSrcset(attrs.get("srcset") ?? attrs.get("data-srcset")) ?? attrs.get("src"),
            base,
          );
          const [width, height] = [dimension(attrs.get("width")), dimension(attrs.get("height"))];
          if (url) addImage(url, null, width, height, label);
        }
        break;
      case "video": {
        const poster = absolute(attrs.get("poster"), base);
        if (poster) addImage(poster, null, null, null, `${label} hero`);
        break;
      }
      case "input":
        if (/^(?:submit|button)$/i.test(attrs.get("type") ?? "") && !count.hidden)
          addCta(attrs.get("value") ?? "");
        break;
    }
    if (VOID.has(name) || tag.selfClosing || stack.length >= 512) return;
    const flags: Flag[] = [];
    if (name === "head") flags.push("head");
    if (name === "article" || name === "aside") flags.push("article");
    // A page's header, not an article's.
    if ((name === "header" && !count.article) || role === "banner") flags.push("header");
    if (name === "nav" || role === "navigation") flags.push("nav");
    if (name === "footer" || role === "contentinfo") flags.push("footer");
    if (name === "a" && isHome(attrs.get("href"))) flags.push("home");
    if (name === "a") {
      const href = absolute(attrs.get("href"), base);
      if (href && isSocialProfile(href) && signals.socials.length < 10) {
        const profile = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
        if (!signals.socials.includes(profile)) signals.socials.push(profile);
      }
    }
    if (PARTNER.test(label)) flags.push("partner");
    else if (/logo|brand/i.test(label)) flags.push("logo");
    if (HERO.test(label)) flags.push("hero");
    if (attrs.has("hidden") || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style ?? ""))
      flags.push("hidden");
    if (name === "picture") flags.push("picture");
    if (name === "video" || name === "audio") flags.push("video");
    const capture: Capture | null = /^h[1-3]$/.test(name)
      ? { kind: "heading", parts: [], length: 0 }
      : name === "button" ||
          role === "button" ||
          (name === "a" && CTA_CLASS.test(attrs.get("class") ?? ""))
        ? { kind: "cta", parts: [], length: 0 }
        : null;
    stack.push({ name, flags, capture });
    for (const flag of flags) count[flag] += 1;
    if (capture) captures.push(capture);
  };

  const n = html.length;
  let at = 0;
  while (at < n) {
    const lt = html.indexOf("<", at);
    if (lt < 0) {
      onText(html.slice(at));
      break;
    }
    if (lt > at) onText(html.slice(at, lt));
    at = lt;
    const next = html.charCodeAt(at + 1);
    if (next === 33 || next === 63) {
      // Comments, CDATA, doctypes and processing instructions.
      const [opener, closer] = html.startsWith("<!--", at)
        ? ["<!--", "-->"]
        : html.startsWith("<![CDATA[", at)
          ? ["<![CDATA[", "]]>"]
          : ["<!", ">"];
      const end = html.indexOf(closer, at + opener.length);
      at = end < 0 ? n : end + closer.length;
    } else if (next === 47) {
      const end = html.indexOf(">", at + 2);
      const name = /^[a-zA-Z][^\s/>]*/.exec(html.slice(at + 2, at + 40))?.[0]?.toLowerCase();
      if (name) {
        if (BLOCK.has(name)) addText("\n");
        close(name);
      }
      at = end < 0 ? n : end + 1;
    } else if (isLetter(next)) {
      const tag = readTag(html, at);
      if (tag.name === "svg" && !tag.selfClosing) at = onSvg(tag, at);
      else if (RAW.has(tag.name) && !tag.selfClosing) {
        const { content, next: after } = rawContents(html, tag.name, tag.end);
        if (tag.name === "style") {
          const media = (tag.attrs.get("media") ?? "").trim();
          addCss(
            media && !/^(?:all|screen)$/i.test(media) ? `@media ${media}{${content}}` : content,
          );
          for (const match of content.matchAll(
            /(?:https?:)?\/\/fonts\.googleapis\.com\/css2?\?[^"')\s;]+/gi,
          ))
            addGoogleFonts(match[0].startsWith("//") ? `https:${match[0]}` : match[0]);
        } else if (tag.name === "script" && /ld\+json/i.test(tag.attrs.get("type") ?? ""))
          readJsonLd(content, ld, base);
        else if (tag.name === "title" && signals.title === null)
          signals.title = collapse(decodeEntities(content)).slice(0, 300) || null;
        at = after;
      } else {
        open(tag);
        at = tag.end;
      }
    } else {
      onText("<");
      at += 1;
    }
  }
  while (stack.length) popOne();

  // What the head's meta tags add, now that the whole page is read.
  const first = (...keys: string[]) => keys.map((key) => meta.get(key)).find(Boolean) ?? null;
  signals.title ??= first("og:title", "twitter:title");
  signals.siteName =
    first("og:site_name", "application-name", "apple-mobile-web-app-title") ?? ld.name;
  signals.description = first("description", "og:description", "twitter:description");
  signals.ogImage = absolute(
    first("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"),
    base,
  );
  for (const key of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    const url = absolute(meta.get(key), base);
    const [width, height] = key.startsWith("og")
      ? [dimension(meta.get("og:image:width")), dimension(meta.get("og:image:height"))]
      : [null, null];
    if (url) addImage(url, first("og:image:alt", "twitter:image:alt"), width, height, "", true);
  }
  if (signals.ogImage)
    addLogo({ url: signals.ogImage, svg: null, alt: null, source: "og", score: 1, strong: false });
  const ogLogo = absolute(meta.get("og:logo"), base);
  if (ogLogo) addLogo({ url: ogLogo, svg: null, alt: null, source: "og", score: 3, strong: true });
  if (ld.logo)
    addLogo({ url: ld.logo, svg: null, alt: ld.name, source: "jsonld", score: 4, strong: true });

  const ranked = [...logos.values()].sort((x, y) => y.score - x.score || x.order - y.order);
  signals.logos = ranked
    .slice(0, 8)
    .map(({ url, svg, alt, source, score }) => ({ url, svg, alt, source, score }));
  const logoUrls = new Set(
    ranked.filter((logo) => logo.strong && logo.url).map((logo) => logo.url),
  );
  signals.images = [...images.values()]
    .filter((image) => !logoUrls.has(image.url))
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .slice(0, 12)
    .map(({ url, alt, width, height }) => ({ url, alt, width, height }));
  signals.inlineCss = css.join("\n");
  signals.adobeFonts = /(?:use|p)\.typekit\.net/i.test(html);
  signals.text = text
    .join("")
    .split("\n")
    .map(collapse)
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT)
    .trim();
  signals.jsonLd = { name: ld.name, logo: ld.logo, slogan: ld.slogan, sameAs: ld.sameAs };
  return signals;
}

/**
 * The brand signals in a page's HTML. URLs are made absolute against the
 * page's address (or its <base href>). Reads at most the first 2 MB; never
 * throws.
 */
export function scanHtml(html: string, pageUrl: string): HtmlSignals {
  const url = typeof pageUrl === "string" ? pageUrl : "";
  if (typeof html !== "string" || !html) return emptySignals(url);
  try {
    return scan(html.slice(0, MAX_INPUT), url);
  } catch {
    return emptySignals(url);
  }
}
