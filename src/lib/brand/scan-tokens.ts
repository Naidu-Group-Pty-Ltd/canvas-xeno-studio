/**
 * The small files beside a codebase's stylesheets that say what its design
 * system is: design-token JSON (the W3C format's `$value`, or Style
 * Dictionary's `value`), shadcn's components.json (which stylesheet is the
 * theme, and its base colour), and package.json (the fonts it installs as
 * packages, and the Tailwind it builds with).
 *
 * Parsed as data, never run; anything malformed reads as nothing. Pure.
 */

export interface DesignToken {
  /** Its path in the file, dotted (`color.brand.gold`). */
  name: string;
  /** Resolved where it refers to another token (`{color.brand.gold}`); as written otherwise. */
  value: string;
  /** The token's own type (`color`, `dimension`, `fontFamily`, `shadow`…), when the file says. */
  type: string | null;
  description: string | null;
}

export interface ShadcnConfig {
  style: string | null;
  /** The stylesheet the theme lives in (tailwind.css): the codebase's entry stylesheet. */
  css: string | null;
  config: string | null;
  baseColor: string | null;
  cssVariables: boolean | null;
  prefix: string | null;
}

export interface PackageSignals {
  /** The package's own name and description, as written. */
  name: string | null;
  description: string | null;
  /** The site it says it is for (`homepage`), an https address. */
  homepage: string | null;
  /** Families installed as packages (@fontsource/playfair-display → Playfair Display; Geist). */
  fonts: { family: string; package: string; variable: boolean }[];
  /** The Tailwind major version it depends on, when it does. */
  tailwind: number | null;
  /** Design packages worth knowing about (shadcn's tw-animate-css, tailwindcss-animate, Radix…). */
  ui: string[];
}

const MAX_TOKENS = 4000;
const MAX_DEPTH = 16;

function parse(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(scalar).filter((part): part is string => !!part);
    return parts.length ? parts.join(", ") : null;
  }
  if (isObject(value)) {
    // A composite token (a shadow's offsetX/offsetY/blur/color, a typography token): kept as CSS-like text.
    const parts = Object.entries(value)
      .map(([key, part]) => {
        const written = scalar(part);
        return written ? `${key}: ${written}` : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  return null;
}

/**
 * Every token in a design-token file, flattened; `{a.b}` references resolved
 * (up to a few levels, never in a loop). Null when the file isn't token JSON.
 */
export function scanTokenJson(text: string): DesignToken[] | null {
  const root = parse(text);
  if (!isObject(root)) return null;
  const tokens: DesignToken[] = [];
  let looksLikeTokens = false;
  const walk = (
    node: Record<string, unknown>,
    path: string[],
    inheritedType: string | null,
    depth: number,
  ) => {
    if (depth > MAX_DEPTH || tokens.length >= MAX_TOKENS) return;
    const type = typeof node["$type"] === "string" ? (node["$type"] as string) : inheritedType;
    const hasValue = "$value" in node || ("value" in node && !isObject(node["value"]));
    if (hasValue && path.length) {
      looksLikeTokens = true;
      const value = scalar(node["$value"] ?? node["value"]);
      if (value !== null)
        tokens.push({
          name: path.join("."),
          value,
          type: type ?? (typeof node["type"] === "string" ? (node["type"] as string) : null),
          description:
            typeof node["$description"] === "string"
              ? (node["$description"] as string)
              : typeof node["description"] === "string"
                ? (node["description"] as string)
                : null,
        });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (isObject(child)) walk(child, [...path, key], type, depth + 1);
    }
  };
  walk(root, [], null, 0);
  if (!looksLikeTokens) return null;
  const byName = new Map(tokens.map((token) => [token.name, token]));
  const resolve = (value: string, depth: number): string =>
    depth > 6
      ? value
      : value.replace(/\{([\w.-]+)\}/g, (whole, ref: string) => {
          const target = byName.get(ref);
          return target ? resolve(target.value, depth + 1) : whole;
        });
  return tokens.map((token) => ({ ...token, value: resolve(token.value, 0) }));
}

/** shadcn's components.json, or null when the file isn't one. */
export function scanShadcnConfig(text: string): ShadcnConfig | null {
  const root = parse(text);
  if (!isObject(root) || !("tailwind" in root || "style" in root || "aliases" in root)) return null;
  const tailwind = isObject(root["tailwind"]) ? root["tailwind"] : {};
  const str = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    style: str(root["style"]),
    css: str(tailwind["css"]),
    config: str(tailwind["config"]),
    baseColor: str(tailwind["baseColor"]),
    cssVariables:
      typeof tailwind["cssVariables"] === "boolean" ? (tailwind["cssVariables"] as boolean) : null,
    prefix: str(tailwind["prefix"]),
  };
}

/** Words a family's name writes in capitals or in its own casing (DM Sans, JetBrains Mono, EB Garamond). */
const FAMILY_WORDS: Record<string, string> = {
  dm: "DM",
  eb: "EB",
  ibm: "IBM",
  pt: "PT",
  im: "IM",
  jetbrains: "JetBrains",
  sf: "SF",
  ui: "UI",
  sc: "SC",
  kr: "KR",
  jp: "JP",
  tc: "TC",
};

/** A font package's family: the words of its name, title-cased (playfair-display → Playfair Display; jetbrains-mono → JetBrains Mono). */
export function fontPackageFamily(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map(
      (word) =>
        FAMILY_WORDS[word] ??
        (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)),
    )
    .join(" ");
}

const UI_PACKAGES = [
  "tailwindcss-animate",
  "tw-animate-css",
  "@radix-ui/themes",
  "class-variance-authority",
  "framer-motion",
  "motion",
  "@headlessui/react",
  "@mui/material",
  "@chakra-ui/react",
  "styled-components",
  "@emotion/react",
  "@vanilla-extract/css",
  "@stitches/react",
];

/** What a package.json installs that shapes the look, or null when it isn't one. */
export function scanPackageJson(text: string): PackageSignals | null {
  const root = parse(text);
  if (!isObject(root)) return null;
  const deps: Record<string, string> = {};
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = root[field];
    if (isObject(block))
      for (const [name, version] of Object.entries(block))
        if (typeof version === "string") deps[name] = version;
  }
  if (!Object.keys(deps).length && !("name" in root)) return null;
  const fonts: PackageSignals["fonts"] = [];
  for (const name of Object.keys(deps)) {
    const match = /^@fontsource(-variable)?\/(.+)$/.exec(name);
    if (match)
      fonts.push({
        family: fontPackageFamily(match[2]!),
        package: name,
        variable: !!match[1],
      });
    else if (name === "geist") fonts.push({ family: "Geist", package: name, variable: true });
  }
  const tailwindVersion =
    deps["tailwindcss"] ?? deps["@tailwindcss/vite"] ?? deps["@tailwindcss/postcss"];
  const major = tailwindVersion ? Number(/(\d+)/.exec(tailwindVersion)?.[1]) : NaN;
  const str = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const homepage = str(root["homepage"]);
  return {
    name: str(root["name"]),
    description: str(root["description"]),
    homepage: homepage && /^https:\/\/[^\s/]+\.[^\s/]+/i.test(homepage) ? homepage : null,
    fonts,
    tailwind: Number.isFinite(major) ? major : null,
    ui: UI_PACKAGES.filter((name) => name in deps),
  };
}
