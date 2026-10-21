/**
 * A brand's design system read from its source code: the GitHub
 * repositories it is built in, rather than the website they build. Several
 * repositories can be read together (a public site, a product, its portals),
 * and what each declares is kept with where it declares it, so the result
 * says not only "the gold is #C89B3C" but "aurixa-systems src/index.css:18
 * names it --color-prism-magenta, and two other repositories agree".
 *
 * The parts, in the order a scan uses them:
 * - parseRepoRef: what a person typed (owner/repo, a GitHub address, a
 *   branch or folder in it) as a repository to read.
 * - planCodeFiles: which files in a repository's tree hold its styling (its
 *   stylesheets, Tailwind config, shadcn config, design-token JSON,
 *   package.json, index.html, theme modules and logo files), within a budget.
 * - importedFiles: the stylesheets a stylesheet imports, for a second round.
 * - readCodeFile: what one file declares (tokens, fonts, colours it uses).
 * - mergeCodeScans: every repository's readings as one design system, with
 *   each colour's names and sources, the fonts, the scales (radius, shadow,
 *   motion, blur), and where the repositories disagree.
 * - codeScanSignals / codeEvidenceText / codeTokensCss: that design system as
 *   a brand import's findings, as the evidence the AI reads, and as a
 *   stylesheet of the tokens with their sources.
 *
 * Code is read as text, never run. Pure: shared by the server, the browser
 * and tests.
 */
import { colourName, deltaE2000, isNeutral, parseCssColour, relativeLuminance } from "./colour";
import { brandNameOf, type FoundColour, type ScanSignals } from "./proposal";
import { fontStackFamily, scanCss, scanCssTokens, type TokenScheme } from "./scan-css";
import { decodeEntities } from "./scan-html";
import { namedObjects, scanTailwindConfig } from "./scan-tailwind";
import {
  fontPackageFamily,
  scanPackageJson,
  scanShadcnConfig,
  scanTokenJson,
  type PackageSignals,
  type ShadcnConfig,
} from "./scan-tokens";

/* ------------------------------------------------------------------ */
/* Repositories                                                        */
/* ------------------------------------------------------------------ */

export interface RepoRef {
  owner: string;
  repo: string;
  /** A branch, tag or commit; null for the repository's default branch. */
  ref: string | null;
  /** A folder to read alone (a monorepo's app), or null for the whole repository. */
  path: string | null;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^[\w.\-/]{1,200}$/;
const FOLDER = /^[\w.\-/ @]{1,300}$/;

const safeSegments = (value: string) =>
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

/**
 * A repository as someone might give it: `owner/repo`, `owner/repo@branch`,
 * `github.com/owner/repo`, its https or git@ address, or an address into a
 * branch and folder (`…/tree/main/apps/web`). Null for anything else.
 */
export function parseRepoRef(input: string): RepoRef | null {
  if (typeof input !== "string") return null;
  let text = input.trim();
  if (!text || text.length > 500 || /\s/.test(text)) return null;
  text = text.replace(/^git@github\.com:/i, "https://github.com/");
  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | null = null;
  let path: string | null = null;
  if (/^(?:https?:\/\/)?(?:www\.)?github\.com\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return null;
    }
    if (!/^(?:www\.)?github\.com$/i.test(url.hostname)) return null;
    let parts: string[];
    try {
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return null;
    }
    [owner, repo] = parts;
    const kind = parts[2];
    if (kind === "tree" || kind === "blob") {
      ref = parts[3] ?? null;
      path = parts.slice(4).join("/") || null;
    } else if (kind) return null;
  } else {
    const at = text.indexOf("@");
    if (at > 0) {
      ref = text.slice(at + 1) || null;
      text = text.slice(0, at);
    }
    const parts = text.split("/");
    if (parts.length !== 2) return null;
    [owner, repo] = parts;
  }
  repo = repo?.replace(/\.git$/i, "");
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..")
    return null;
  if (ref !== null && (!REF.test(ref) || !safeSegments(ref))) return null;
  if (path !== null) {
    path = path.replace(/\/+$/, "");
    if (!FOLDER.test(path) || !safeSegments(path)) return null;
  }
  return { owner, repo, ref, path };
}

/** "owner/repo", as a repository is named on the page. */
export const repoLabel = (ref: Pick<RepoRef, "owner" | "repo">) => `${ref.owner}/${ref.repo}`;

/** The repository's address on GitHub (into its branch and folder, when one is given). */
export function repoUrl(ref: RepoRef): string {
  const base = `https://github.com/${ref.owner}/${ref.repo}`;
  if (!ref.ref) return base;
  return `${base}/tree/${ref.ref}${ref.path ? `/${ref.path}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Which files to read                                                 */
/* ------------------------------------------------------------------ */

export type CodeFileKind =
  | "css"
  | "scss"
  | "less"
  | "tailwind"
  | "shadcn"
  | "tokens"
  | "package"
  | "html"
  | "manifest"
  | "module"
  | "entry"
  | "logo";

export interface TreeFile {
  path: string;
  /** In bytes, when the tree says. */
  size: number | null;
}

export interface PlannedFile {
  path: string;
  kind: CodeFileKind;
  size: number | null;
  /** Why it was picked, for the report: "entry stylesheet", "named for its tokens"… */
  why: string;
}

export interface FilePlan {
  /** The files to read, most telling first. */
  files: PlannedFile[];
  /** Styling files left out, and why (too large, over the budget). */
  skipped: { path: string; why: string }[];
  /** Bytes the text files come to, as far as the tree says. */
  bytes: number;
}

export const CODE_SCAN_LIMITS = {
  /** Repositories in one scan. */
  repos: 6,
  /** Text files read in one repository (stylesheets, configs, modules). */
  files: 40,
  /** Logo files staged from one repository. */
  logos: 4,
  /** A text file larger than this is left out. */
  fileBytes: 600_000,
  /** The text one repository may take. */
  repoBytes: 3_000_000,
  logoBytes: 2_000_000,
  /** The tree entries looked at. */
  treeEntries: 100_000,
} as const;

/** Build output, dependencies, tooling, documentation and back ends: never the app's design system. */
const IGNORED_DIR =
  /(?:^|\/)(?:node_modules|dist|build|out|coverage|vendor|bower_components|storybook-static|playwright-report|test-results|__snapshots__|__fixtures__|fixtures|tmp|temp|Pods|DerivedData|docs?|documentation|examples?|samples?|scripts|supabase|\.[^/]+)\//i;
const TEST_FILE =
  /(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|cypress|specs?)\/|\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$/i;
const MINIFIED = /\.min\.(?:css|js)$|\.bundle\.css$|[.-][0-9a-f]{8,}\.css$/i;
const ENTRY_CSS =
  /^(?:index|globals?|app|main|styles?|tailwind|theme|tokens|variables|base|root|design-tokens)\.(?:css|scss|less|pcss)$/i;
const TELLING_NAME =
  /token|theme|variable|colou?r|palette|brand|glass|typograph|font|motion|design|foundation|primitive|semantic/i;
const TOKEN_JSON =
  /(?:^|[/._-])(?:design[-_]?)?tokens?(?:[._-][\w-]+)*\.json$|(?:^|\/)(?:theme|colou?rs|palette|design[-_]?system|style[-_]?dictionary)(?:[._-][\w-]+)*\.json$/i;
const NOT_TOKEN_JSON =
  /(?:^|\/)(?:package(?:-lock)?|tsconfig[\w.-]*|jsconfig|composer|deno|bun|vercel|netlify|renovate|turbo|nx|lerna|app|eslint[\w.-]*|\.?prettierrc[\w.-]*)\.json$/i;
/** A module whose own name says it holds the theme (`theme.ts`, `aurixa-brand.ts`, `brand-defaults.ts`), not code that merely mentions one. */
const MODULE_BASE =
  /^(?:themes?|tokens?|design[-_]?tokens|palette|colou?rs|brand(?:ing)?|typography|fonts)$|^[\w-]+[-_](?:theme|palette|brand|tokens|colou?rs)$|^(?:brand|theme)[-_](?:defaults|config|palette|colou?rs|tokens|fonts|theme)$/i;
/** An app's entry module (`src/main.tsx`): where it imports its fonts and stylesheets. */
const ENTRY_MODULE = /^(?:src\/)?(?:main|index|app)\.(?:tsx|jsx|ts|js)$/i;
/**
 * A framework's root route or layout, where it links its fonts and names the
 * site: TanStack's `routes/__root`, Remix's `app/root`, Next's `app/layout`,
 * `pages/_app` and `pages/_document`. A component that happens to be called
 * `layout.tsx` is none of them.
 */
const ROOT_MODULE =
  /^(?:src\/)?(?:(?:app\/)?routes\/__root|app\/root|app\/layout|pages\/_(?:app|document))\.(?:tsx|jsx|ts|js)$/i;
const IMAGE = /\.(?:svg|png|webp|jpe?g)$/i;
const LOGO_NAME =
  /logo|lockup|wordmark|logotype|emblem|monogram|symbol|brand[-_]?mark|(?:^|[-_.])mark(?:[-_.@]|$)|apple-touch-icon|favicon|icon[-_]?(?:192|256|512)/i;
const LOGO_DIR =
  /(?:^|\/)(?:public|static|assets?|brand(?:ing|-source)?|images?|img|media|logos?|icons?)(?:\/|$)/i;
/** Pictures with a logo in them that are something else: an email signature, a share card, a banner. */
const NOT_LOGO =
  /signature|e-?mail|banner|letterhead|footer|(?:^|[-_.])og(?:[-_.]|$)|social|share|cover|hero|background|(?:^|[-_.])bg(?:[-_.]|$)|screenshot|placeholder|avatar|portrait|team|staff|photo|(?:^|[-_.])qr(?:[-_.]|$)/i;
/** Other companies' logos: partners, integrations and the platforms a product links to. */
const OTHER_BRAND =
  /(?:^|\/)(?:brands|partners?|integrations?|vendors?|clients?|customers?|sponsors?|third[-_]?party|providers?|social)\/|(?:^|[/_-])(?:openai|anthropic|claude|google|microsoft|apple|github|gitlab|bitbucket|slack|stripe|paypal|visa|mastercard|amex|xero|myob|quickbooks|hubspot|salesforce|zapier|notion|figma|meta|facebook|instagram|linkedin|twitter|youtube|tiktok|whatsapp|discord|telegram|domain|realestate|landchecker|corelogic|pricefinder|docusign|dropbox|zoom|calendly|mailchimp|twilio|aws|azure|vercel|netlify|supabase|firebase|lovable)(?:[/._-]|$)/i;

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const depthOf = (path: string) => path.split("/").length;

/**
 * What a file in a repository is, for reading its styling; null for
 * everything else. `path` is taken from the folder being read, so an entry
 * module is one at its top (`src/main.tsx`), not any `index.ts`.
 */
export function codeFileKind(path: string): CodeFileKind | null {
  const name = base(path);
  const lower = name.toLowerCase();
  if (lower === "components.json") return "shadcn";
  if (lower === "package.json") return "package";
  if (/^tailwind\.config\.(?:js|cjs|mjs|ts|cts|mts)$/.test(lower)) return "tailwind";
  if (MINIFIED.test(lower)) return null;
  if (/\.(?:css|pcss|postcss)$/.test(lower)) return "css";
  if (lower.endsWith(".scss")) return "scss";
  if (lower.endsWith(".less")) return "less";
  if (lower === "index.html") return "html";
  if (lower === "manifest.json" || lower.endsWith(".webmanifest")) return "manifest";
  if (lower.endsWith(".json"))
    return TOKEN_JSON.test(path) && !NOT_TOKEN_JSON.test(path) ? "tokens" : null;
  if (IMAGE.test(lower))
    return LOGO_NAME.test(lower) &&
      !NOT_LOGO.test(lower) &&
      LOGO_DIR.test(path) &&
      !OTHER_BRAND.test(path)
      ? "logo"
      : null;
  if (ENTRY_MODULE.test(path) || ROOT_MODULE.test(path)) return "entry";
  if (/\.(?:ts|js|mjs|cjs)$/i.test(lower) && !lower.endsWith(".d.ts")) {
    const stem = name.replace(/\.(?:ts|js|mjs|cjs)$/i, "");
    if (MODULE_BASE.test(stem)) return "module";
  }
  return null;
}

interface Candidate extends PlannedFile {
  rank: number;
}

const KIND_CAP: Partial<Record<CodeFileKind, number>> = {
  shadcn: 2,
  package: 3,
  tailwind: 3,
  html: 2,
  manifest: 1,
  tokens: 6,
  module: 8,
  entry: 4,
};

/**
 * The files in a repository's tree that hold its styling, most telling
 * first, within CODE_SCAN_LIMITS: its shadcn and Tailwind configs, its
 * entry stylesheets and the ones named for tokens or themes, its other
 * stylesheets, design-token JSON, package.json (the fonts it installs),
 * index.html (the fonts it loads), theme modules and logo files. Build
 * output, dependencies, tests and minified files are never read.
 */
export function planCodeFiles(
  tree: TreeFile[],
  options: {
    path?: string | null;
    limits?: Partial<typeof CODE_SCAN_LIMITS>;
    /** Words of the brand's name (`aurixa`): a logo file named for it comes first. */
    brand?: string[];
  } = {},
): FilePlan {
  const limits = { ...CODE_SCAN_LIMITS, ...options.limits };
  const brand = (options.brand ?? [])
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3);
  const folder = options.path ? `${options.path.replace(/\/+$/, "")}/` : "";
  const candidates: Candidate[] = [];
  for (const entry of (Array.isArray(tree) ? tree : []).slice(0, limits.treeEntries)) {
    const path = typeof entry?.path === "string" ? entry.path : "";
    if (!path || path.length > 400 || (folder && !path.startsWith(folder))) continue;
    // Judged inside the folder asked for: a monorepo's `apps/web` is read as if it were the repository.
    const inside = folder ? path.slice(folder.length) : path;
    if (IGNORED_DIR.test(inside)) continue;
    const kind = codeFileKind(inside);
    if (!kind) continue;
    if (kind !== "package" && kind !== "tailwind" && TEST_FILE.test(inside)) continue;
    const size = typeof entry.size === "number" && entry.size >= 0 ? entry.size : null;
    const depth = depthOf(inside);
    const name = base(path);
    let rank: number;
    let why: string;
    if (kind === "shadcn") [rank, why] = [0, "the shadcn config (it names the theme's stylesheet)"];
    else if (kind === "tailwind") [rank, why] = [1, "the Tailwind config"];
    else if (kind === "package")
      [rank, why] =
        depth <= 1 ? [2, "the fonts and packages it installs"] : [8, "a workspace's packages"];
    else if (kind === "css" || kind === "scss" || kind === "less") {
      if (ENTRY_CSS.test(name) && depth <= 4) [rank, why] = [3, "an entry stylesheet"];
      else if (TELLING_NAME.test(name)) [rank, why] = [4, "named for its tokens or theme"];
      else [rank, why] = [7, "a stylesheet"];
    } else if (kind === "tokens") [rank, why] = [5, "design tokens"];
    else if (kind === "html")
      [rank, why] = [depth <= 2 ? 6 : 9, "the fonts and theme colour it loads"];
    else if (kind === "manifest") {
      if (depth > 3) continue;
      [rank, why] = [9, "the web app's theme colour"];
    } else if (kind === "module") [rank, why] = [6, "a theme module"];
    else if (kind === "entry") [rank, why] = [6, "the fonts the app loads"];
    else {
      // A logo named for the brand first; a mark drawn in SVG before a picture of one; a logo before an icon.
      const own = brand.some((word) => name.toLowerCase().includes(word)) ? 0 : 1;
      const drawn = /\.svg$/i.test(name) ? 0 : 1;
      const named = /lockup|wordmark|logotype|logo|emblem|mark|symbol|monogram/i.test(name) ? 0 : 1;
      [rank, why] = [11 + own * 0.4 + drawn * 0.1 + named * 0.01, "a logo file"];
    }
    candidates.push({ path, kind, size, why, rank: Math.round(rank * 1000) + Math.min(depth, 9) });
  }
  candidates.sort(
    (x, y) => x.rank - y.rank || (y.size ?? 0) - (x.size ?? 0) || x.path.localeCompare(y.path),
  );

  const files: PlannedFile[] = [];
  const skipped: FilePlan["skipped"] = [];
  const perKind = new Map<CodeFileKind, number>();
  let bytes = 0;
  let texts = 0;
  let logos = 0;
  for (const candidate of candidates) {
    const { rank: _rank, ...file } = candidate;
    const count = perKind.get(file.kind) ?? 0;
    const cap = KIND_CAP[file.kind];
    if (cap !== undefined && count >= cap) continue;
    if (file.kind === "logo") {
      if (logos >= limits.logos) continue;
      if ((file.size ?? 0) > limits.logoBytes) {
        skipped.push({ path: file.path, why: "a logo file over 2 MB" });
        continue;
      }
      logos += 1;
    } else {
      const size = file.size ?? 0;
      if (size > limits.fileBytes) {
        skipped.push({ path: file.path, why: `over ${Math.round(limits.fileBytes / 1000)} KB` });
        continue;
      }
      if (texts >= limits.files || bytes + size > limits.repoBytes) {
        skipped.push({ path: file.path, why: "over the scan's budget" });
        continue;
      }
      texts += 1;
      bytes += size;
    }
    perKind.set(file.kind, count + 1);
    files.push(file);
  }
  return { files, skipped: skipped.slice(0, 60), bytes };
}

/* ------------------------------------------------------------------ */
/* Stylesheets a stylesheet imports                                    */
/* ------------------------------------------------------------------ */

const IMPORT_SPEC = /@(?:import|use|forward)\s+(?:url\(\s*)?["']([^"'\n]+)["']/g;

function joinPath(dir: string, spec: string): string | null {
  const parts = dir ? dir.split("/") : [];
  for (const part of spec.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/**
 * The repository files a stylesheet imports (`@import "./tokens.css"`,
 * `@import "@/styles/glass.css"`, SCSS's `@use "theme"`), or the stylesheets
 * a module does (`import "./index.css"`), found in `paths` (the tree's
 * files). Packages (`@import "tailwindcss"`) and addresses are left out.
 */
export function importedFiles(text: string, fromPath: string, paths: Set<string>): string[] {
  const out: string[] = [];
  if (typeof text !== "string") return out;
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const script = SCRIPT_FILE.test(fromPath);
  // A commented-out import isn't one (CSS has no line comments: `url(//cdn…)` is an address).
  const source = stripCodeComments(text.slice(0, 2_000_000), {
    lines: script || /\.(?:s[ac]ss|less)$/i.test(fromPath),
  });
  for (const match of source.matchAll(script ? MODULE_STYLE_IMPORT : IMPORT_SPEC)) {
    const spec = (match[1] ?? "").trim().split("?")[0]!;
    if (!spec || /^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith("//")) continue;
    let target: string | null;
    if (spec.startsWith("@/")) target = joinPath("src", spec.slice(2));
    else if (spec.startsWith("~/")) target = joinPath("src", spec.slice(2));
    else if (spec.startsWith("/")) target = joinPath("", spec.slice(1));
    else if (spec.startsWith("./") || spec.startsWith("../")) target = joinPath(dir, spec);
    // A bare name is a package, except to SCSS, where `@use "theme"` is a file beside it.
    else if (/\.s[ac]ss$/i.test(fromPath) && !spec.includes("@")) target = joinPath(dir, spec);
    else continue;
    if (!target) continue;
    const slash = target.lastIndexOf("/");
    const partial = `${target.slice(0, slash + 1)}_${target.slice(slash + 1)}`;
    const tries = [
      target,
      `${target}.css`,
      `${target}.scss`,
      `${partial}.scss`,
      `${target}.less`,
      `${target}/index.css`,
      `${target}/_index.scss`,
    ];
    const found = tries.find((path) => paths.has(path));
    if (found && found !== fromPath && !out.includes(found)) out.push(found);
    if (out.length >= 20) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reading a file                                                      */
/* ------------------------------------------------------------------ */

export type TokenKind =
  "colour" | "font" | "radius" | "shadow" | "motion" | "blur" | "spacing" | "gradient" | "other";

export type TokenSource = "css" | "scss" | "less" | "tailwind" | "tokens" | "module";

/** One thing a repository declares: a custom property, a Tailwind theme entry, a design token. */
export interface CodeToken {
  /** As written: `--color-base-950`, `colors.primary`, `$gold`, `color.brand.gold`, `AURIXA_PALETTE.gold`. */
  name: string;
  value: string;
  /** Read through what it refers to, as far as the code says. */
  resolved: string;
  hex: string | null;
  alpha: number | null;
  kind: TokenKind;
  scheme: TokenScheme;
  /** Where in the file: the selector (":root", ".dark", "@theme"), "tailwind theme", "design tokens"… */
  context: string;
  source: TokenSource;
  path: string;
  line: number | null;
}

export type FontRole = "heading" | "body" | "display" | "mono" | "button" | "other";
/** How a typeface reaches the page: Google Fonts, an @fontsource package, another package (Geist), an @font-face rule, Adobe Fonts. */
export type FontLoading = "google" | "fontsource" | "package" | "font-face" | "adobe";

/** A typeface a file sets, declares or loads. */
export interface FontUse {
  family: string;
  roles: FontRole[];
  loaded: FontLoading | null;
  weights: number[];
  path: string;
  line: number | null;
}

export interface HtmlFacts {
  title: string | null;
  description: string | null;
  themeColours: string[];
}

export interface FileReading {
  path: string;
  kind: CodeFileKind;
  tokens: CodeToken[];
  fonts: FontUse[];
  /** The colours written out in the file (hex codes and colour functions), with how often. */
  uses: { hex: string; count: number }[];
  keyframes: string[];
  /** What it imports, as written (for importedFiles). */
  imports: string[];
  /** A Tailwind font family that reads a custom property (`sans: ["var(--font-sans)"]`), by role. */
  fontVariables: { variable: string; roles: FontRole[]; path: string; line: number | null }[];
  shadcn: ShadcnConfig | null;
  packages: PackageSignals | null;
  html: HtmlFacts | null;
  tailwind: { darkMode: string | null; plugins: string[] } | null;
}

const GRADIENT = /gradient\(/i;
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vh|vw|ch|pt)?$/i;

/** What kind of thing a token is, by its name first and its value second. */
export function tokenKind(name: string, value: string, hex: string | null): TokenKind {
  const key = name.toLowerCase();
  if (GRADIENT.test(value)) return "gradient";
  if (/(?:^|[-_.$])(?:font|fonts|family|typeface|typography)(?:[-_.]|$)/.test(key) && !hex)
    return /size|weight|leading|tracking|height|spacing|feature|variation|optical|smooth|style|stretch|synthesis|kerning/.test(
      key,
    )
      ? "other"
      : "font";
  if (/radius|rounded|corner/.test(key)) return "radius";
  if (/shadow|elevation|glow(?![\w]*colou?r)/.test(key) && !(hex && !/\d+px/.test(value)))
    return "shadow";
  if (/blur|backdrop/.test(key) && !hex) return "blur";
  if (
    /(?:^|[-_.$])(?:motion|duration|ease|easing|transition|timing|delay|animations?|speed)(?:[-_.]|$)/.test(
      key,
    ) ||
    /cubic-bezier\(|^\d+(?:\.\d+)?m?s$/.test(value.trim())
  )
    return "motion";
  if (hex) return "colour";
  if (
    /(?:^|[-_.])(?:space|spacing|gap|gutter|inset|padding|margin)(?:[-_.]|$)/.test(key) &&
    LENGTH.test(value.trim())
  )
    return "spacing";
  return "other";
}

/** Only hex codes and colour functions, the forms a colour is written in code. */
const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^()]*\)/g;

/** Every colour written out in some code, counted exactly (comments already taken out). */
export function colourUses(text: string): { hex: string; count: number }[] {
  const counts = new Map<string, number>();
  if (typeof text !== "string") return [];
  for (const match of text.slice(0, 3_000_000).matchAll(COLOUR_LITERAL)) {
    const written = match[0];
    const at = match.index ?? 0;
    if (written.startsWith("#")) {
      // An HTML entity (&#123;), a URL fragment or an id is not a colour.
      const before = text[at - 1] ?? "";
      if (/[\w&/]/.test(before) || ![4, 5, 7, 9].includes(written.length)) continue;
    }
    if (written.includes("var(")) continue;
    const colour = parseCssColour(written);
    if (!colour || colour.alpha < 0.05) continue;
    counts.set(colour.hex, (counts.get(colour.hex) ?? 0) + 1);
    if (counts.size > 2000) break;
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 400);
}

/** Block and (unless `lines` is false) line comments taken out; strings respected, line breaks kept. */
export function stripCodeComments(text: string, options: { lines?: boolean } = {}): string {
  const lines = options.lines !== false;
  let out = "";
  let at = 0;
  while (at < text.length) {
    const c = text[at]!;
    if (c === '"' || c === "'" || c === "`") {
      let j = at + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      out += text.slice(at, j + 1);
      at = j + 1;
    } else if (c === "/" && text[at + 1] === "*") {
      const end = text.indexOf("*/", at + 2);
      const close = end < 0 ? text.length : end + 2;
      out += text.slice(at, close).replace(/[^\n]+/g, " ");
      at = close;
    } else if (lines && c === "/" && text[at + 1] === "/" && text[at - 1] !== ":") {
      const end = text.indexOf("\n", at);
      at = end < 0 ? text.length : end;
    } else {
      out += c;
      at += 1;
    }
  }
  return out;
}

const ROLE_OF_FONT_NAME: [RegExp, FontRole][] = [
  [/mono|code/, "mono"],
  [/display|hero/, "display"],
  [/heading|headline|title|serif(?!-?sans)/, "heading"],
  [/sans|body|base|text|copy|ui|default|primary|main/, "body"],
  [/button|cta/, "button"],
];

/** A font's job from the name it is declared under (`--font-display`, `fontFamily.sans`, `headingFontFamily`). */
export function fontRoleOf(name: string): FontRole {
  const whole = name.toLowerCase();
  // What follows "font" says it (`--font-display`); failing that, what comes before (`headingFont`).
  for (const key of [whole.replace(/^.*?(?:font|family)[-_.]?/, ""), whole])
    for (const [pattern, role] of ROLE_OF_FONT_NAME) if (pattern.test(key)) return role;
  return "other";
}

/** A typeface's name as it is written: letters first, none of a label's punctuation (`Aurixa — Inter`), not a keyword. */
const FAMILY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+-]{0,63}$/u;
const NOT_A_FAMILY =
  /^(?:inherit|initial|unset|revert|revert-layer|normal|none|auto|default|swap|block|fallback|optional|true|false|null|undefined|system|sans|serif|mono)$/i;

/** Whether a name can be a typeface's (and isn't a keyword or a label). */
export function plausibleFamily(name: string): boolean {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return FAMILY_NAME.test(trimmed) && /\p{L}/u.test(trimmed) && !NOT_A_FAMILY.test(trimmed);
}

/**
 * The typeface a value in code names, held to how code writes one: quoted
 * (`'"Inter", sans-serif'`), a stack, or a capitalised name (`"Inter"`). A
 * lone lowercase word (`fontFamily: "aurixa-sans"`) is a setting's key, not a
 * typeface.
 */
function familyInCode(value: string): string | null {
  const family = fontStackFamily(value);
  if (!family || !plausibleFamily(family)) return null;
  return /^\s*["']/.test(value) || value.includes(",") || /^\p{Lu}/u.test(family) ? family : null;
}

/** The families and weights a Google Fonts stylesheet address asks for. */
export function googleFontsOf(href: string): { family: string; weights: number[] }[] {
  let url: URL;
  try {
    url = new URL(decodeEntities(href));
  } catch {
    return [];
  }
  if (url.hostname !== "fonts.googleapis.com") return [];
  const out: { family: string; weights: number[] }[] = [];
  for (const value of url.searchParams.getAll("family").flatMap((item) => item.split("|"))) {
    const [rawName = "", spec = ""] = value.split(":");
    const family = rawName.replace(/\+/g, " ").trim();
    if (!family) continue;
    const weights = new Set<number>();
    // css2: "ital,wght@0,400;0,600;1,400" or "wght@300;400" or "wdth,wght@62..125,400..700"; css: "400,700".
    const axes = spec.includes("@") ? spec.split("@")[0]!.split(",") : [];
    const tuples = spec.includes("@") ? spec.split("@")[1]!.split(";") : spec.split(",");
    const wghtIndex = axes.length ? axes.indexOf("wght") : 0;
    for (const tuple of tuples) {
      const part = (wghtIndex >= 0 ? tuple.split(",")[wghtIndex] : undefined) ?? "";
      const range = /^(\d{3})\.\.(\d{3})$/.exec(part);
      if (range) {
        for (let weight = Number(range[1]); weight <= Number(range[2]); weight += 100)
          weights.add(weight);
      } else if (/^\d{3}$/.test(part.replace(/i(?:talic)?$/, "")))
        weights.add(Number(part.replace(/i(?:talic)?$/, "")));
    }
    out.push({ family: family.slice(0, 80), weights: [...weights].sort((x, y) => x - y) });
  }
  return out.slice(0, 12);
}

const GOOGLE_HREF = /https?:\/\/fonts\.googleapis\.com\/[^"'()\s>]+/gi;
const ADOBE = /use\.typekit\.net|p\.typekit\.net|use\.edgefonts\.net/i;

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let at = text.indexOf("\n"); at >= 0 && at < offset; at = text.indexOf("\n", at + 1))
    line += 1;
  return line;
}

function googleFontUses(text: string, path: string): FontUse[] {
  const out: FontUse[] = [];
  for (const match of text.matchAll(GOOGLE_HREF)) {
    const line = lineAt(text, match.index ?? 0);
    for (const font of googleFontsOf(match[0]))
      out.push({
        family: font.family,
        roles: [],
        loaded: "google",
        weights: font.weights,
        path,
        line,
      });
  }
  return out;
}

const PREPROCESSOR_VARIABLE = /^[ \t]*([$@])([\w-]+)\s*:\s*([^;{}\n]+?)\s*(?:!default\s*)?;/gm;
const AT_RULES = new Set([
  "media",
  "import",
  "use",
  "forward",
  "font-face",
  "keyframes",
  "supports",
  "layer",
  "charset",
  "namespace",
  "page",
  "container",
  "theme",
  "tailwind",
  "apply",
  "custom-variant",
  "utility",
  "plugin",
  "source",
  "config",
  "include",
  "mixin",
  "function",
  "return",
  "if",
  "else",
  "each",
  "for",
  "while",
]);

/** SCSS `$name: value;` and Less `@name: value;` variables, their references to each other read through. */
function preprocessorTokens(text: string, path: string, source: TokenSource): CodeToken[] {
  const found: { name: string; sigil: string; value: string; line: number }[] = [];
  for (const match of text.matchAll(PREPROCESSOR_VARIABLE)) {
    const [, sigil = "$", name = "", value = ""] = match;
    if (sigil === "@" && AT_RULES.has(name.toLowerCase())) continue;
    found.push({ name, sigil, value: value.trim(), line: lineAt(text, match.index ?? 0) });
    if (found.length >= 2000) break;
  }
  const values = new Map(found.map((entry) => [`${entry.sigil}${entry.name}`, entry.value]));
  const resolve = (value: string, depth = 0): string =>
    depth > 6
      ? value
      : value.replace(/([$@])([\w-]+)/g, (whole, sigil: string, name: string) => {
          const target = values.get(`${sigil}${name}`);
          return target === undefined ? whole : resolve(target, depth + 1);
        });
  return found.map((entry) => {
    const resolved = resolve(entry.value).slice(0, 400);
    const colour = parseCssColour(resolved);
    const name = `${entry.sigil}${entry.name}`;
    return {
      name,
      value: entry.value.slice(0, 400),
      resolved,
      hex: colour?.hex ?? null,
      alpha: colour ? Math.round(colour.alpha * 100) / 100 : null,
      kind: tokenKind(name, resolved, colour?.hex ?? null),
      scheme: "default",
      context: source === "less" ? "Less variables" : "SCSS variables",
      source,
      path,
      line: entry.line,
    };
  });
}

function emptyReading(path: string, kind: CodeFileKind): FileReading {
  return {
    path,
    kind,
    tokens: [],
    fonts: [],
    uses: [],
    keyframes: [],
    imports: [],
    fontVariables: [],
    shadcn: null,
    packages: null,
    html: null,
    tailwind: null,
  };
}

function readStylesheet(path: string, kind: "css" | "scss" | "less", raw: string): FileReading {
  const reading = emptyReading(path, kind);
  // Line comments aren't CSS; in SCSS and Less they are, and can hold braces and colons.
  const text = kind === "css" ? raw : stripCodeComments(raw);
  const { tokens, keyframes } = scanCssTokens(text);
  for (const token of tokens)
    reading.tokens.push({
      name: token.name,
      value: token.value,
      resolved: token.resolved,
      hex: token.hex,
      alpha: token.alpha,
      kind: tokenKind(token.name, token.resolved, token.hex),
      scheme: token.scheme,
      context: token.selector,
      source: kind,
      path,
      line: token.line,
    });
  if (kind !== "css") reading.tokens.push(...preprocessorTokens(text, path, kind));
  reading.keyframes = keyframes;
  const sheet = scanCss(text);
  const faces = new Set(sheet.fontFaces.map((face) => face.family.toLowerCase()));
  for (const font of sheet.fonts) {
    if (!plausibleFamily(font.family)) continue;
    reading.fonts.push({
      family: font.family,
      roles: [...font.roles],
      loaded: faces.has(font.family.toLowerCase()) ? "font-face" : null,
      weights: [],
      path,
      line: null,
    });
  }
  for (const face of sheet.fontFaces) {
    if (!plausibleFamily(face.family)) continue;
    const weight = Number(/\d{3}/.exec(face.weight ?? "")?.[0]);
    reading.fonts.push({
      family: face.family,
      roles: [],
      loaded: "font-face",
      weights: Number.isFinite(weight) ? [weight] : [],
      path,
      line: null,
    });
  }
  for (const token of reading.tokens) {
    if (token.kind !== "font" || token.scheme === "scoped") continue;
    const family = fontStackFamily(token.resolved);
    if (family && plausibleFamily(family))
      reading.fonts.push({
        family,
        roles: [fontRoleOf(token.name)],
        loaded: null,
        weights: [],
        path,
        line: token.line,
      });
  }
  const uncommented = kind === "css" ? stripCodeComments(raw, { lines: false }) : text;
  reading.fonts.push(...googleFontUses(uncommented, path));
  if (ADOBE.test(uncommented))
    reading.fonts.push({
      family: "Adobe Fonts kit",
      roles: [],
      loaded: "adobe",
      weights: [],
      path,
      line: null,
    });
  reading.uses = colourUses(uncommented);
  reading.imports = [...uncommented.matchAll(IMPORT_SPEC)].map((match) => match[1]!).slice(0, 40);
  return reading;
}

function readTailwind(path: string, text: string): FileReading {
  const reading = emptyReading(path, "tailwind");
  const config = scanTailwindConfig(text);
  const theme = config.theme;
  const push = (group: string, name: string, value: string, kind: TokenKind) => {
    const colour = parseCssColour(value);
    reading.tokens.push({
      name: `${group}.${name}`,
      value: value.slice(0, 400),
      resolved: value.slice(0, 400),
      hex: colour?.hex ?? null,
      alpha: colour ? Math.round(colour.alpha * 100) / 100 : null,
      kind: kind === "colour" && !colour && !/var\(|hsl|rgb|oklch/.test(value) ? "other" : kind,
      scheme: "default",
      context: "tailwind theme",
      source: "tailwind",
      path,
      line: theme.lines[`${group}.${name}`] ?? null,
    });
  };
  for (const [name, value] of Object.entries(theme.colors)) push("colors", name, value, "colour");
  for (const [name, value] of Object.entries(theme.borderRadius))
    push("borderRadius", name, value, "radius");
  for (const [name, value] of Object.entries(theme.boxShadow))
    push("boxShadow", name, value, "shadow");
  for (const [name, value] of Object.entries(theme.backgroundImage))
    push("backgroundImage", name, value, "gradient");
  for (const [name, value] of Object.entries(theme.animation))
    push("animation", name, value, "motion");
  for (const [name, stack] of Object.entries(theme.fontFamily)) {
    const role = fontRoleOf(name);
    const line = theme.lines[`fontFamily.${name}`] ?? null;
    const variable = /^var\(\s*(--[\w-]+)/.exec(stack[0] ?? "")?.[1];
    if (variable) {
      reading.fontVariables.push({ variable, roles: [role], path, line });
      continue;
    }
    const family = fontStackFamily(stack.filter((item) => !item.startsWith("...")).join(", "));
    if (family && plausibleFamily(family))
      reading.fonts.push({ family, roles: [role], loaded: null, weights: [], path, line });
  }
  reading.keyframes = theme.keyframes;
  reading.tailwind = { darkMode: config.darkMode, plugins: config.plugins };
  return reading;
}

function readTokenJson(path: string, text: string): FileReading {
  const reading = emptyReading(path, "tokens");
  for (const token of scanTokenJson(text) ?? []) {
    const colour = parseCssColour(token.value);
    const kind =
      token.type === "color"
        ? "colour"
        : token.type === "fontFamily"
          ? "font"
          : token.type === "shadow"
            ? "shadow"
            : token.type === "duration" || token.type === "cubicBezier"
              ? "motion"
              : tokenKind(token.name, token.value, colour?.hex ?? null);
    reading.tokens.push({
      name: token.name,
      value: token.value.slice(0, 400),
      resolved: token.value.slice(0, 400),
      hex: colour?.hex ?? null,
      alpha: colour ? Math.round(colour.alpha * 100) / 100 : null,
      kind: kind === "colour" && !colour ? "other" : kind,
      scheme: /(?:^|\.)dark(?:\.|$)/i.test(token.name) ? "dark" : "default",
      context: "design tokens",
      source: "tokens",
      path,
      line: null,
    });
    if (kind === "font") {
      const family = fontStackFamily(token.value);
      if (family && plausibleFamily(family))
        reading.fonts.push({
          family,
          roles: [fontRoleOf(token.name)],
          loaded: null,
          weights: [],
          path,
          line: null,
        });
    }
  }
  return reading;
}

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META = /<meta\b[^>]*>/gi;
const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
const attrValue = (tag: string, name: string) => {
  const match = attr(tag, name);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
};

function readHtml(path: string, text: string): FileReading {
  const reading = emptyReading(path, "html");
  const page = text.slice(0, 1_000_000);
  const title = decodeEntities(TITLE.exec(page)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  let description: string | null = null;
  const themeColours: string[] = [];
  for (const match of page.matchAll(META)) {
    const tag = match[0];
    const name = (attrValue(tag, "name") ?? attrValue(tag, "property") ?? "").toLowerCase();
    const content = attrValue(tag, "content");
    if (!content) continue;
    if ((name === "description" || name === "og:description") && !description)
      description = content.slice(0, 500);
    if (name === "theme-color" || name === "msapplication-tilecolor") {
      const hex = parseCssColour(content)?.hex;
      if (hex && !themeColours.includes(hex)) themeColours.push(hex);
    }
  }
  reading.html = { title: title.slice(0, 300) || null, description, themeColours };
  reading.fonts = googleFontUses(page, path);
  if (ADOBE.test(page))
    reading.fonts.push({
      family: "Adobe Fonts kit",
      roles: [],
      loaded: "adobe",
      weights: [],
      path,
      line: null,
    });
  // A page's inline styles are styling code too.
  const inline = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join("\n");
  if (inline.trim()) {
    const sheet = readStylesheet(path, "css", inline);
    reading.tokens = sheet.tokens.map((token) => ({ ...token, line: null }));
    reading.uses = sheet.uses;
  }
  return reading;
}

function readManifest(path: string, text: string): FileReading {
  const reading = emptyReading(path, "manifest");
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const themeColours: string[] = [];
    for (const key of ["theme_color", "background_color"]) {
      const value = parsed[key];
      const hex = typeof value === "string" ? parseCssColour(value)?.hex : null;
      if (hex && !themeColours.includes(hex)) themeColours.push(hex);
    }
    const name = typeof parsed["name"] === "string" ? parsed["name"].slice(0, 300) : null;
    reading.html = { title: name, description: null, themeColours };
  } catch {
    // A manifest that isn't JSON says nothing.
  }
  return reading;
}

/** The last part of a key that names a typeface: `font`, `fontFamily`, `fontDisplay`, `headingFont`, `family`. */
const FONT_LEAF =
  /^(?:fonts?|famil(?:y|ies)|typefaces?)$|^font[-_]?[a-z]|[a-z0-9](?:[-_]?font|[-_]?family|[-_]?typeface)(?:[-_]?family)?$/i;
/** A group of typefaces, whose entries are named for their jobs: `fonts.heading`, `fontFamily.sans`, `typography.body`. */
const FONT_GROUP = /^(?:fonts?|font[-_]?famil(?:y|ies)|typefaces?|typography)$/i;
const ROLE_LEAF =
  /^(?:sans|serif|mono|display|headings?|headline|body|base|ui|code|title|text|copy|primary|secondary|brand|default|main|accent)$/i;
/** A font's size, weight or other setting, or something about it that isn't its name. */
const NOT_FONT_LEAF =
  /size|weight|height|spacing|leading|tracking|style|feature|variation|scale|smoothing|stretch|kerning|synthesis|(?:options?|keys?|ids?|labels?|urls?|src|path|class(?:name)?|loaded|enabled)$/i;

/** Whether a key in a theme module (`AURIXA.fontDisplay`, `theme.fonts.heading`) names a typeface. */
function namesTypeface(name: string): boolean {
  const parts = name.split(".");
  const leaf = parts[parts.length - 1] ?? "";
  if (!leaf || NOT_FONT_LEAF.test(leaf)) return false;
  return (
    FONT_LEAF.test(leaf) || (FONT_GROUP.test(parts[parts.length - 2] ?? "") && ROLE_LEAF.test(leaf))
  );
}

/** A font's job from its key in a module: its own name, or its group's (`heading.family`). */
function moduleFontRole(name: string): FontRole {
  const parts = name.split(".");
  const role = fontRoleOf(parts[parts.length - 1] ?? name);
  return role === "other" && parts.length > 1 ? fontRoleOf(parts[parts.length - 2] ?? "") : role;
}

/** `export const AURIXA_DISPLAY_STACK = '"Playfair Display", ui-serif, Georgia, serif'`: a font named at a module's top. */
const NAMED_STRING =
  /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(["'`])((?:(?!\2)[^\n\\]|\\.){2,300})\2/gm;

function readModule(path: string, text: string): FileReading {
  const reading = emptyReading(path, "module");
  const scheme = (name: string): TokenScheme =>
    /(?:^|\.)(?:dark|night)(?:\.|$)/i.test(name)
      ? "dark"
      : /(?:^|\.)light(?:\.|$)/i.test(name)
        ? "light"
        : "default";
  for (const entry of namedObjects(text)) {
    const value = entry.value.trim();
    if (/^(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|hwb\()/i.test(value)) {
      const colour = parseCssColour(value);
      if (!colour) continue;
      reading.tokens.push({
        name: entry.name,
        value: value.slice(0, 400),
        resolved: value.slice(0, 400),
        hex: colour.hex,
        alpha: Math.round(colour.alpha * 100) / 100,
        kind: "colour",
        scheme: scheme(entry.name),
        context: "theme module",
        source: "module",
        path,
        line: entry.line,
      });
    } else if (namesTypeface(entry.name) && value.length < 300) {
      const family = familyInCode(value);
      if (family)
        reading.fonts.push({
          family,
          roles: [moduleFontRole(entry.name)],
          loaded: null,
          weights: [],
          path,
          line: entry.line,
        });
    }
    if (reading.tokens.length >= 600) break;
  }
  const code = stripCodeComments(text.slice(0, 1_000_000));
  for (const match of code.matchAll(NAMED_STRING)) {
    const [, name = "", quote, raw = ""] = match;
    if (!/font|family|typeface|stack/i.test(name) || NOT_FONT_LEAF.test(name)) continue;
    // A template literal is read up to its first interpolation: `"Inter", ${SYSTEM_STACK}` names Inter.
    const value = quote === "`" ? raw.split("${")[0]! : raw;
    const family = familyInCode(value);
    if (family)
      reading.fonts.push({
        family,
        roles: [fontRoleOf(name)],
        loaded: null,
        weights: [],
        path,
        line: lineAt(code, match.index ?? 0),
      });
    if (reading.fonts.length >= 40) break;
  }
  reading.uses = colourUses(code);
  return reading;
}

/** `import { Inter, Playfair_Display as Display } from "next/font/google"`. */
const NEXT_FONT_IMPORT = /\bimport\s*\{([^{}]{1,2000})\}\s*from\s*["']next\/font\/google["']/g;
/** `import "@fontsource/inter/400.css"`, `import "@fontsource-variable/archivo"`. */
const FONTSOURCE_IMPORT =
  /["']@fontsource(?:-variable)?\/([a-z0-9][a-z0-9-]*)(?:\/([\w.-]+))?["']/g;
/** `import { GeistSans } from "geist/font/sans"`. */
const GEIST_IMPORT = /["']geist\/font\/(sans|mono)["']/g;
/** A stylesheet a module imports: `import "./index.css"`, `import appCss from "../styles.css?url"`. */
const MODULE_STYLE_IMPORT =
  /(?:^|[\s;])import\s+(?:[\w$]+\s+from\s+|\*\s+as\s+[\w$]+\s+from\s+)?["']([^"'\n]+?\.(?:css|scss|sass|less|pcss)(?:\?[^"'\n]*)?)["']/g;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/i;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stringIn = (pattern: RegExp, text: string) => {
  const value = pattern.exec(text)?.[2]?.replace(/\s+/g, " ").trim();
  return value && !/[{}<>]|\$\{/.test(value) ? value : null;
};

/** The site's name, description and theme colour as an app's root module sets them (TanStack's `head`, Next's `metadata`, JSX meta tags). */
function headFacts(code: string): HtmlFacts | null {
  const metadata =
    /\bexport\s+const\s+metadata\b[^=]{0,80}=\s*\{([\s\S]{0,4000}?)\n\}/.exec(code)?.[1] ?? "";
  const title =
    // TanStack: `meta: [{ title: "Aurixa" }]`; JSX: `<title>Aurixa</title>`; Next: `metadata.title` (or its `default`).
    stringIn(/\{\s*title\s*:\s*(["'`])([^"'`\n]{2,200})\1\s*,?\s*\}/, code) ??
    stringIn(/<title[^>]*>()([^<]{2,200})<\/title>/i, code) ??
    stringIn(/\btitle\s*:\s*(?:\{[^}]*?\bdefault\s*:\s*)?(["'`])([^"'`\n]{2,200})\1/, metadata);
  const description =
    stringIn(/name\s*:\s*["']description["']\s*,\s*content\s*:\s*(["'`])([^"'`]{2,500})\1/, code) ??
    stringIn(/<meta\s+name=["']description["']\s+content=(["'])([^"']{2,500})\1/i, code) ??
    stringIn(/\bdescription\s*:\s*(["'`])([^"'`\n]{2,500})\1/, metadata);
  const themeColours: string[] = [];
  for (const match of code.matchAll(
    /(?:name\s*[:=]\s*["']theme-color["']\s*,?\s*content\s*[:=]\s*|\bthemeColor\s*:\s*)["']([^"']{3,60})["']/g,
  )) {
    const hex = parseCssColour(match[1] ?? "")?.hex;
    if (hex && !themeColours.includes(hex)) themeColours.push(hex);
  }
  return title || description || themeColours.length ? { title, description, themeColours } : null;
}

/**
 * An app's entry module or root route: the fonts it loads (a Google Fonts
 * link, next/font, @fontsource and Geist imports, with the weights it asks
 * for), the stylesheets it imports, and the name and description it gives
 * the site.
 */
function readEntry(path: string, raw: string): FileReading {
  const reading = emptyReading(path, "entry");
  const code = stripCodeComments(raw.slice(0, 1_000_000));
  reading.fonts.push(...googleFontUses(code, path));
  if (ADOBE.test(code))
    reading.fonts.push({
      family: "Adobe Fonts kit",
      roles: [],
      loaded: "adobe",
      weights: [],
      path,
      line: null,
    });
  for (const match of code.matchAll(NEXT_FONT_IMPORT)) {
    const line = lineAt(code, match.index ?? 0);
    for (const part of (match[1] ?? "").split(",")) {
      const [imported = "", local = imported] = part.trim().split(/\s+as\s+/);
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(imported) || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
      // The call that sets it up: `Playfair_Display({ weight: ["400", "700"], variable: "--font-display" })`.
      const call =
        new RegExp(`\\b${escapeRegExp(local)}\\s*\\(\\s*\\{([^{}]{0,1000})\\}`).exec(code)?.[1] ??
        "";
      const weights = [
        ...(/\bweight\s*:\s*(\[[^\]]*\]|["'][^"']*["'])/.exec(call)?.[1] ?? "").matchAll(/\d{3}/g),
      ].map((weight) => Number(weight[0]));
      const variable = /\bvariable\s*:\s*["'](--[\w-]+)["']/.exec(call)?.[1];
      reading.fonts.push({
        family: imported.replace(/_/g, " "),
        roles: variable ? [fontRoleOf(variable)] : [],
        loaded: "google",
        weights: [...new Set(weights)].sort((x, y) => x - y),
        path,
        line,
      });
    }
  }
  const packaged = new Map<string, FontUse>();
  for (const match of code.matchAll(FONTSOURCE_IMPORT)) {
    const [, slug = "", file = ""] = match;
    const family = fontPackageFamily(slug);
    const entry = packaged.get(family) ?? {
      family,
      roles: [],
      loaded: "fontsource" as const,
      weights: [],
      path,
      line: lineAt(code, match.index ?? 0),
    };
    const weight = Number(/(?:^|-)(\d{3})(?:-italic)?\.css$/.exec(file)?.[1]);
    if (Number.isFinite(weight) && !entry.weights.includes(weight)) entry.weights.push(weight);
    packaged.set(family, entry);
  }
  for (const match of code.matchAll(GEIST_IMPORT)) {
    const family = match[1] === "mono" ? "Geist Mono" : "Geist";
    if (!packaged.has(family))
      packaged.set(family, {
        family,
        roles: match[1] === "mono" ? ["mono"] : [],
        loaded: "package",
        weights: [],
        path,
        line: lineAt(code, match.index ?? 0),
      });
  }
  for (const font of packaged.values())
    reading.fonts.push({ ...font, weights: font.weights.sort((x, y) => x - y) });
  reading.html = headFacts(code);
  // The repository's own stylesheets (a font package's are read above).
  reading.imports = [...code.matchAll(MODULE_STYLE_IMPORT)]
    .map((match) => match[1]!)
    .filter((spec) => /^(?:\.{1,2}\/|[@~]\/|\/)/.test(spec))
    .slice(0, 40);
  return reading;
}

/** What one file in a repository declares about the design system. Never throws. */
export function readCodeFile(file: {
  path: string;
  kind: CodeFileKind;
  text: string;
}): FileReading {
  const { path, kind } = file;
  const text = typeof file.text === "string" ? file.text.replace(/^\uFEFF/, "") : "";
  try {
    switch (kind) {
      case "css":
      case "scss":
      case "less":
        return readStylesheet(path, kind, text);
      case "tailwind":
        return readTailwind(path, text);
      case "tokens":
        return readTokenJson(path, text);
      case "html":
        return readHtml(path, text);
      case "manifest":
        return readManifest(path, text);
      case "module":
        return readModule(path, text);
      case "entry":
        return readEntry(path, text);
      case "shadcn":
        return { ...emptyReading(path, kind), shadcn: scanShadcnConfig(text) };
      case "package": {
        const packages = scanPackageJson(text);
        const reading = { ...emptyReading(path, kind), packages };
        for (const font of packages?.fonts ?? [])
          reading.fonts.push({
            family: font.family,
            roles: [],
            loaded: font.package.startsWith("@fontsource") ? "fontsource" : "package",
            weights: [],
            path,
            line: null,
          });
        return reading;
      }
      default:
        return emptyReading(path, kind);
    }
  } catch {
    return emptyReading(path, kind);
  }
}

/* ------------------------------------------------------------------ */
/* Every repository as one design system                               */
/* ------------------------------------------------------------------ */

export interface RepoScan {
  ref: RepoRef;
  /** The commit read, when known: what the result can be checked against later. */
  sha: string | null;
  readings: FileReading[];
  plan: FilePlan;
  /** Files that were planned and couldn't be read, with why. */
  failed: { path: string; why: string }[];
  /** The logo files found (their paths), for staging. */
  logos: string[];
}

export interface Provenance {
  repo: string;
  path: string;
  line: number | null;
}

export interface CodeColour {
  hex: string;
  name: string;
  neutral: boolean;
  /** The tokens that hold it, as declared (the primary repository's first). */
  tokens: (Provenance & { name: string; scheme: TokenScheme })[];
  /** How often it is written out in the files read. */
  uses: number;
  repos: string[];
  /** Whether any repository declares it as a token (rather than only writing it out). */
  declared: boolean;
  /** Near-identical codes folded into it (a palette converted to HSL and back drifts by a step). */
  variants: string[];
  weight: number;
}

export interface CodeFont {
  family: string;
  roles: FontRole[];
  loaded: FontLoading[];
  weights: number[];
  repos: string[];
  sources: Provenance[];
}

export interface ScaleToken extends Provenance {
  name: string;
  value: string;
  resolved: string;
  scheme: TokenScheme;
}

export interface CodeConflict {
  name: string;
  scheme: TokenScheme;
  values: { value: string; hex: string | null; repos: string[] }[];
}

export interface RepoSummary {
  label: string;
  url: string;
  ref: string | null;
  path: string | null;
  sha: string | null;
  files: number;
  skipped: number;
  failed: number;
  tokens: number;
  colours: number;
  /** What it is built with: "Tailwind 4 (@theme)", "Tailwind 3", "shadcn", "SCSS", "design tokens"… */
  stack: string[];
  /** The theme it shows with none chosen, read from its own background token. */
  defaultScheme: "light" | "dark" | null;
}

export interface CodeDesignSystem {
  version: 1;
  /** The repository whose names and values lead where they disagree: the first one given. */
  primary: string | null;
  repos: RepoSummary[];
  colours: CodeColour[];
  fonts: CodeFont[];
  scales: Record<"radius" | "shadow" | "motion" | "blur" | "gradient" | "spacing", ScaleToken[]>;
  keyframes: { name: string; repos: string[] }[];
  conflicts: CodeConflict[];
  /** Whether any of them loads an Adobe Fonts kit (whose families the code doesn't name). */
  adobeFonts: boolean;
  /** What the sites built from them call themselves. */
  title: string | null;
  description: string | null;
  themeColours: string[];
  /** Every token read, for the stylesheet (capped). */
  tokens: (CodeToken & { repo: string })[];
  notes: string[];
}

export const CODE_RESULT_LIMITS = {
  colours: 60,
  fonts: 16,
  scale: 40,
  keyframes: 60,
  conflicts: 30,
  tokens: 1500,
  tokensPerRepo: 600,
  tokenSources: 12,
  fontSources: 8,
} as const;

/** A name for the colour's job in the brand (`--primary`, `colors.brand`, `--accent`), not for its hue (`gold`): any palette has a gold. */
const BRAND_NAME = /primary|brand|accent|secondary|highlight|signature|cta|action/i;
const NOT_BRAND = /foreground|contrast|(?:^|-)on-|-fg(?![a-z])/i;
const isBrandName = (name: string) => BRAND_NAME.test(name) && !NOT_BRAND.test(name);
/** A colour named for what it does in an interface (a warning, a chart series, a border), not for the brand. */
const UI_ROLE =
  /warn|success|danger|destructive|error|(?:^|[-_.])info(?:[-_.]|$)|chart|sidebar|input|ring|border|outline|divider|separator|popover|tooltip|toast|muted|disabled|placeholder|skeleton|overlay|scrim|selection|scrollbar|focus|caret|status|positive|negative|caution|alert|foreground|(?:^|[-_.])fg(?:[-_.]|$)|shadow/i;

/** How much one declaration says a colour is the brand's: its name, its scheme, and whether it only points at another. */
function declarationWeight(token: CodeToken, alias: boolean): number {
  const role = isBrandName(token.name) ? 3 : UI_ROLE.test(token.name) ? 0.4 : 1;
  // A palette set inside one component (`.passport { --seal: … }`) is that component's, not the system's.
  const scheme = token.scheme === "scoped" ? 0.35 : token.scheme === "dark" ? 0.75 : 1;
  return role * scheme * (alias ? 0.3 : 1);
}
const ALIAS = /^var\(\s*--[\w-]+\s*\)$/;

/** A colour a token reads through another file's custom property: Tailwind's `hsl(var(--primary))`. */
function throughVariables(
  value: string,
  lookup: (name: string) => string | undefined,
): { resolved: string; hex: string | null; alpha: number | null } {
  let resolved = value.replace(/<alpha-value>/g, "1");
  for (let pass = 0; pass < 4 && resolved.includes("var("); pass += 1)
    resolved = resolved.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (whole, name: string, fallback?: string) => lookup(name) ?? fallback ?? whole,
    );
  const colour = parseCssColour(resolved);
  return {
    resolved,
    hex: colour?.hex ?? null,
    alpha: colour ? Math.round(colour.alpha * 100) / 100 : null,
  };
}

const normal = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Every repository's readings as one design system. The first repository
 * given is the primary: its names and values lead where repositories
 * disagree. Each repository's say about its colours is weighed as shares of
 * its whole say, so a repository with a thousand tokens and one with fifty
 * count once each (the primary twice); a colour several repositories agree
 * on counts for more.
 */
export function mergeCodeScans(scans: RepoScan[]): CodeDesignSystem {
  const primary = scans[0] ? repoLabel(scans[0].ref) : null;
  const notes: string[] = [];
  const all: (CodeToken & { repo: string })[] = [];
  const repos: RepoSummary[] = [];
  const colourTally = new Map<
    string,
    {
      weight: number;
      uses: number;
      repos: Set<string>;
      tokens: CodeColour["tokens"];
      declared: boolean;
    }
  >();
  const fontTally = new Map<string, CodeFont>();
  const keyframes = new Map<string, Set<string>>();
  let title: string | null = null;
  let description: string | null = null;
  const themeColours: string[] = [];

  /** A colour seen in a repository (declared as `token`, or only written out); its weight is added per repository below. */
  const addColour = (hex: string, repo: string, token?: CodeColour["tokens"][number]) => {
    const entry = colourTally.get(hex) ?? {
      weight: 0,
      uses: 0,
      repos: new Set<string>(),
      tokens: [],
      declared: false,
    };
    entry.repos.add(repo);
    if (token) {
      entry.declared = true;
      if (
        entry.tokens.length < CODE_RESULT_LIMITS.tokenSources &&
        !entry.tokens.some(
          (other) =>
            other.name === token.name && other.repo === token.repo && other.scheme === token.scheme,
        )
      )
        entry.tokens.push(token);
    }
    colourTally.set(hex, entry);
  };
  let adobeFonts = false;
  const addFont = (font: FontUse, repo: string) => {
    if (font.loaded === "adobe") adobeFonts = true;
    const key = font.family.toLowerCase();
    if (!key || key === "adobe fonts kit" || !plausibleFamily(font.family)) return;
    const entry = fontTally.get(key) ?? {
      family: font.family,
      roles: [],
      loaded: [],
      weights: [],
      repos: [],
      sources: [],
    };
    for (const role of font.roles) if (!entry.roles.includes(role)) entry.roles.push(role);
    if (font.loaded && !entry.loaded.includes(font.loaded)) entry.loaded.push(font.loaded);
    for (const weight of font.weights)
      if (!entry.weights.includes(weight)) entry.weights.push(weight);
    if (!entry.repos.includes(repo)) entry.repos.push(repo);
    if (
      entry.sources.length < CODE_RESULT_LIMITS.fontSources &&
      !entry.sources.some((source) => source.repo === repo && source.path === font.path)
    )
      entry.sources.push({ repo, path: font.path, line: font.line });
    fontTally.set(key, entry);
  };

  for (const scan of scans) {
    const repo = repoLabel(scan.ref);
    // This repository's say about each colour, before it is turned into shares.
    const say = new Map<string, number>();
    const vote = (hex: string, amount: number) => say.set(hex, (say.get(hex) ?? 0) + amount);
    // What the code calls each colour, at best (a brand name, a plain one, a warning's), for weighing how often it is written.
    const naming = new Map<string, number>();
    // Custom properties by name and scheme, to read other files' var() references through.
    const css = new Map<string, Partial<Record<TokenScheme, CodeToken>>>();
    for (const reading of scan.readings)
      for (const token of reading.tokens) {
        if (!token.name.startsWith("--")) continue;
        const entry = css.get(token.name) ?? {};
        if (!entry[token.scheme]) entry[token.scheme] = token;
        css.set(token.name, entry);
      }
    const lookup = (name: string) => {
      const entry = css.get(name);
      return (entry?.default ?? entry?.light ?? entry?.dark ?? entry?.scoped)?.resolved;
    };
    const stack = new Set<string>();
    let tokens = 0;
    let kept = 0;
    const colours = new Set<string>();
    for (const reading of scan.readings) {
      if (reading.kind === "tailwind") stack.add("Tailwind 3");
      if (reading.kind === "shadcn" && reading.shadcn) stack.add("shadcn");
      if (reading.kind === "scss") stack.add("SCSS");
      if (reading.kind === "less") stack.add("Less");
      if (reading.kind === "tokens" && reading.tokens.length) stack.add("design tokens");
      if (reading.packages?.tailwind === 4) stack.add("Tailwind 4");
      if (reading.tokens.some((token) => token.context === "@theme"))
        stack.add("Tailwind 4 (@theme)");
      if (reading.html || reading.kind === "manifest") {
        title ??= reading.html?.title ?? null;
        description ??= reading.html?.description ?? null;
        for (const hex of reading.html?.themeColours ?? [])
          if (!themeColours.includes(hex)) themeColours.push(hex);
      }
      if (reading.packages) description ??= reading.packages.description;
      for (const name of reading.keyframes) {
        const set = keyframes.get(name) ?? new Set<string>();
        set.add(repo);
        keyframes.set(name, set);
      }
      for (const font of reading.fonts) addFont(font, repo);
      for (const variable of reading.fontVariables) {
        const family = fontStackFamily(lookup(variable.variable) ?? "");
        if (family && plausibleFamily(family))
          addFont(
            {
              family,
              roles: variable.roles,
              loaded: null,
              weights: [],
              path: variable.path,
              line: variable.line,
            },
            repo,
          );
      }
      for (const raw of reading.tokens) {
        let token = raw;
        if (!token.hex && token.value.includes("var(") && !token.name.startsWith("--")) {
          const through = throughVariables(token.value, lookup);
          token = { ...token, ...through, kind: through.hex ? "colour" : token.kind };
        }
        tokens += 1;
        if (all.length < CODE_RESULT_LIMITS.tokens && kept < CODE_RESULT_LIMITS.tokensPerRepo) {
          kept += 1;
          all.push({
            ...token,
            value: token.value.slice(0, 200),
            resolved: token.resolved.slice(0, 200),
            repo,
          });
        }
        if (!token.hex || token.kind !== "colour") continue;
        colours.add(token.hex);
        const alias =
          ALIAS.test(token.value.trim()) ||
          (token.source === "tailwind" && token.value.includes("var("));
        const weight = declarationWeight(token, alias);
        vote(token.hex, weight);
        naming.set(token.hex, Math.max(naming.get(token.hex) ?? 0, alias ? weight / 0.3 : weight));
        addColour(token.hex, repo, {
          repo,
          path: token.path,
          line: token.line,
          name: token.name,
          scheme: token.scheme,
        });
      }
      for (const use of reading.uses) {
        addColour(use.hex, repo);
        const entry = colourTally.get(use.hex)!;
        entry.uses += use.count;
      }
    }
    // Writing a colour out often makes it the brand's, whether or not it is a token, but no more
    // than what the code calls it: a warning's yellow written sixty times is still a warning's.
    const usesInRepo = new Map<string, number>();
    for (const reading of scan.readings)
      for (const use of reading.uses)
        usesInRepo.set(use.hex, (usesInRepo.get(use.hex) ?? 0) + use.count);
    for (const [hex, count] of usesInRepo)
      vote(hex, 2 * Math.log2(1 + count) * Math.min(1, naming.get(hex) ?? 1));
    const said = [...say.values()].reduce((sum, amount) => sum + amount, 0);
    const voice = repo === primary ? 2 : 1;
    if (said > 0)
      for (const [hex, amount] of say)
        colourTally.get(hex)!.weight += (amount / said) * 100 * voice;

    const background =
      css.get("--background") ?? css.get("--color-background") ?? css.get("--color-base-950");
    const ground = background?.default?.hex ?? null;
    if (!scan.readings.length) notes.push(`${repo}: no styling files were found.`);
    if (scan.plan.skipped.length)
      notes.push(
        `${repo}: ${scan.plan.skipped.length} styling file${scan.plan.skipped.length === 1 ? " was" : "s were"} left out (${[...new Set(scan.plan.skipped.map((file) => file.why))].join(", ")}).`,
      );
    if (scan.failed.length)
      notes.push(
        `${repo}: ${scan.failed.length} file${scan.failed.length === 1 ? "" : "s"} couldn't be read.`,
      );
    repos.push({
      label: repo,
      url: repoUrl(scan.ref),
      ref: scan.ref.ref,
      path: scan.ref.path,
      sha: scan.sha,
      files: scan.readings.length,
      skipped: scan.plan.skipped.length,
      failed: scan.failed.length,
      tokens,
      colours: colours.size,
      stack: [...stack].filter(
        (item) => !(item === "Tailwind 4" && stack.has("Tailwind 4 (@theme)")),
      ),
      defaultScheme: ground ? (relativeLuminance(ground) > 0.4 ? "light" : "dark") : null,
    });
  }

  // Near-identical codes fold into the heaviest (a palette converted to HSL and back drifts by a step).
  const sorted = [...colourTally].sort((x, y) => y[1].weight - x[1].weight).slice(0, 800);
  const clusters: CodeColour[] = [];
  for (const [hex, entry] of sorted) {
    const home = clusters.find((cluster) => deltaE2000(cluster.hex, hex) <= 2.5);
    if (home) {
      home.weight += entry.weight;
      home.uses += entry.uses;
      home.declared ||= entry.declared;
      for (const repo of entry.repos) if (!home.repos.includes(repo)) home.repos.push(repo);
      for (const token of entry.tokens)
        if (home.tokens.length < CODE_RESULT_LIMITS.tokenSources) home.tokens.push(token);
      home.variants.push(hex);
      continue;
    }
    clusters.push({
      hex,
      name: colourName(hex),
      neutral: isNeutral(hex),
      tokens: [...entry.tokens],
      uses: entry.uses,
      repos: [...entry.repos],
      declared: entry.declared,
      variants: [],
      weight: entry.weight,
    });
  }
  for (const cluster of clusters) {
    cluster.weight =
      Math.round(cluster.weight * (1 + 0.5 * (cluster.repos.length - 1)) * 100) / 100;
    // The primary repository's names first.
    cluster.tokens.sort((x, y) => Number(y.repo === primary) - Number(x.repo === primary));
  }
  const colours = clusters.sort((x, y) => y.weight - x.weight).slice(0, CODE_RESULT_LIMITS.colours);

  const fonts = [...fontTally.values()]
    .map((font) => ({ ...font, weights: font.weights.sort((x, y) => x - y) }))
    .sort((x, y) => {
      const score = (font: CodeFont) =>
        font.repos.length * 4 +
        font.sources.length +
        (font.roles.some((role) => role === "heading" || role === "display") ? 3 : 0) +
        (font.repos.includes(primary ?? "") ? 2 : 0);
      return score(y) - score(x);
    })
    .slice(0, CODE_RESULT_LIMITS.fonts);

  const scales: CodeDesignSystem["scales"] = {
    radius: [],
    shadow: [],
    motion: [],
    blur: [],
    gradient: [],
    spacing: [],
  };
  for (const token of all) {
    const list = scales[token.kind as keyof typeof scales];
    if (!list || token.scheme === "scoped") continue;
    if (
      list.some(
        (other) =>
          other.repo === token.repo && other.name === token.name && other.scheme === token.scheme,
      )
    )
      continue;
    list.push({
      repo: token.repo,
      path: token.path,
      line: token.line,
      name: token.name,
      value: token.value,
      resolved: token.resolved,
      scheme: token.scheme,
    });
  }
  // Each repository's scale in turn, the primary's first and custom properties before Tailwind
  // keys, so the list hears from every repository rather than only the first with a long one.
  const order = scans.map((scan) => repoLabel(scan.ref));
  for (const key of Object.keys(scales) as (keyof typeof scales)[]) {
    const byRepo = order.map((repo) =>
      scales[key]
        .filter((token) => token.repo === repo)
        .sort((x, y) => Number(y.name.startsWith("--")) - Number(x.name.startsWith("--"))),
    );
    const turns: ScaleToken[] = [];
    for (let round = 0; turns.length < CODE_RESULT_LIMITS.scale; round += 1) {
      const next = byRepo.flatMap((list) => {
        const token = list[round];
        return token ? [token] : [];
      });
      if (!next.length) break;
      turns.push(...next);
    }
    scales[key] = turns.slice(0, CODE_RESULT_LIMITS.scale);
  }

  // Where the same name means different things in different repositories.
  const byName = new Map<string, (CodeToken & { repo: string })[]>();
  for (const token of all) {
    if (token.scheme === "scoped") continue;
    const key = `${token.scheme} ${token.name}`;
    const list = byName.get(key) ?? [];
    if (!list.some((other) => other.repo === token.repo)) list.push(token);
    byName.set(key, list);
  }
  const conflicts: CodeConflict[] = [];
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const values: CodeConflict["values"] = [];
    for (const token of list) {
      const same = values.find((value) =>
        value.hex && token.hex
          ? deltaE2000(value.hex, token.hex) <= 2.5
          : normal(value.value) === normal(token.resolved),
      );
      if (same) same.repos.push(token.repo);
      else values.push({ value: token.resolved, hex: token.hex, repos: [token.repo] });
    }
    if (values.length > 1) conflicts.push({ name: list[0]!.name, scheme: list[0]!.scheme, values });
  }
  conflicts.sort(
    (x, y) =>
      Number(isBrandName(y.name)) - Number(isBrandName(x.name)) || x.name.localeCompare(y.name),
  );

  return {
    version: 1,
    primary,
    repos,
    colours,
    fonts,
    scales,
    keyframes: [...keyframes]
      .map(([name, set]) => ({ name, repos: [...set] }))
      .sort((x, y) => y.repos.length - x.repos.length)
      .slice(0, CODE_RESULT_LIMITS.keyframes),
    conflicts: conflicts.slice(0, CODE_RESULT_LIMITS.conflicts),
    adobeFonts,
    title,
    description,
    themeColours: themeColours.slice(0, 6),
    tokens: all,
    notes: notes.slice(0, 8),
  };
}

/* ------------------------------------------------------------------ */
/* As a brand import's findings                                        */
/* ------------------------------------------------------------------ */

const where = (source: Provenance) => `${source.path}${source.line ? `:${source.line}` : ""}`;
const schemeNote = (scheme: TokenScheme) =>
  scheme === "dark"
    ? " (dark)"
    : scheme === "light"
      ? " (light)"
      : scheme === "scoped"
        ? " (scoped)"
        : "";
const shortName = (repo: string) => repo.split("/")[1] ?? repo;

/** The brand's name, as its code's own site calls itself, else its primary repository's. */
export function codeBrandName(system: CodeDesignSystem): string {
  if (system.title) return brandNameOf({ title: system.title });
  const name = system.repos[0]?.label.split("/")[1];
  return name
    ? name.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : "Brand";
}

/** The design system as what a brand import found, for the proposal and its review. */
export function codeScanSignals(system: CodeDesignSystem): ScanSignals {
  const total = system.colours.reduce((sum, colour) => sum + colour.weight, 0) || 1;
  const colours: FoundColour[] = system.colours.slice(0, 40).map((colour) => ({
    hex: colour.hex,
    name: colour.name,
    share: Number((colour.weight / total).toFixed(4)),
    neutral: colour.neutral,
    from: [
      ...colour.tokens.slice(0, 4).map((token) => token.name),
      ...(colour.uses ? [`written ${colour.uses}×`] : []),
    ].slice(0, 6),
  }));
  const fontTotal =
    system.fonts.reduce((sum, font) => sum + font.sources.length + font.repos.length, 0) || 1;
  const fonts = system.fonts.slice(0, 12).map((font) => ({
    family: font.family,
    roles: [
      ...new Set(
        font.roles.map((role) =>
          role === "display" || role === "heading"
            ? "heading"
            : role === "body"
              ? "body"
              : role === "button"
                ? "button"
                : "other",
        ),
      ),
    ],
    share: Number(((font.sources.length + font.repos.length) / fontTotal).toFixed(4)),
  }));
  const [first] = system.repos;
  return {
    url: first?.url ?? null,
    title: system.title ?? (system.repos.map((repo) => repo.label).join(", ") || null),
    description: system.description,
    colours,
    fonts,
    googleFonts: system.fonts
      .filter((font) => font.loaded.includes("google"))
      .map((font) => font.family)
      .slice(0, 12),
    adobeFonts: system.adobeFonts,
    headings: [],
    ctas: [],
    pages: null,
    characters: null,
  };
}

/** The design system as the AI reads it: compact, most telling first. */
export function codeEvidenceText(system: CodeDesignSystem): string {
  const lines: string[] = [
    `Read from the source code of ${system.repos.length} repositor${system.repos.length === 1 ? "y" : "ies"} (the first is the brand's own source; the others build on it):`,
  ];
  for (const repo of system.repos)
    lines.push(
      `- ${repo.label}${repo.sha ? ` @ ${repo.sha.slice(0, 7)}` : ""}: ${repo.files} files, ${repo.tokens} tokens; ${repo.stack.join(", ") || "plain CSS"}${repo.defaultScheme ? `; ${repo.defaultScheme} by default` : ""}`,
    );
  if (system.title) lines.push(`Its site's title: ${system.title}`);
  if (system.description) lines.push(`Described as: ${system.description}`);
  lines.push(
    "",
    "Colours, heaviest first (hex, name; the tokens that declare it and where; how often it is written out; repositories):",
  );
  for (const colour of system.colours.slice(0, 32)) {
    const tokens = colour.tokens
      .slice(0, 4)
      .map(
        (token) =>
          `${token.name}${schemeNote(token.scheme)} in ${shortName(token.repo)} ${where(token)}`,
      )
      .join("; ");
    lines.push(
      `- ${colour.hex} ${colour.name}${colour.neutral ? " (neutral)" : ""}: ${tokens || "not a token"}${colour.uses ? `; written ${colour.uses}×` : ""}; ${colour.repos.length} repo${colour.repos.length === 1 ? "" : "s"}`,
    );
  }
  if (system.fonts.length) {
    lines.push("", "Typefaces (family: roles; how it is loaded; weights; repositories):");
    for (const font of system.fonts.slice(0, 10))
      lines.push(
        `- ${font.family}: ${font.roles.join(", ") || "set somewhere"}; ${font.loaded.join(", ") || "not loaded by the code read"}${font.weights.length ? `; ${font.weights.join(" ")}` : ""}; ${font.repos.length} repo${font.repos.length === 1 ? "" : "s"}`,
      );
  }
  const scale = (label: string, list: ScaleToken[]) => {
    if (!list.length) return;
    lines.push("", `${label}:`);
    for (const token of list.slice(0, 8))
      lines.push(
        `- ${token.name}${schemeNote(token.scheme)}: ${token.resolved} (${shortName(token.repo)})`,
      );
  };
  scale("Corner radius", system.scales.radius);
  scale("Shadows and elevation", system.scales.shadow);
  scale("Motion (durations and easing)", system.scales.motion);
  scale("Gradients", system.scales.gradient);
  if (system.keyframes.length)
    lines.push(
      "",
      `Animations it defines: ${system.keyframes
        .slice(0, 20)
        .map((frame) => frame.name)
        .join(", ")}`,
    );
  if (system.conflicts.length) {
    lines.push("", "Where the repositories disagree (same token, different values):");
    for (const conflict of system.conflicts.slice(0, 10))
      lines.push(
        `- ${conflict.name}${schemeNote(conflict.scheme)}: ${conflict.values.map((value) => `${value.hex ?? value.value} in ${value.repos.map(shortName).join(", ")}`).join("; ")}`,
      );
  }
  if (system.themeColours.length)
    lines.push(`Theme colour it gives browsers: ${system.themeColours.join(", ")}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* As a stylesheet                                                     */
/* ------------------------------------------------------------------ */

const SAFE_VALUE = /^[^{};<>]*$/;
const comment = (text: string) => text.replace(/\*\//g, "* /");

/**
 * The design system's tokens as one stylesheet: every custom property the
 * repositories declare for the root and for a dark scheme, the primary
 * repository's value where they disagree (the others' in a comment), and
 * each one's repository, file and line beside it. Values are as written, so
 * a bare HSL channel token stays one (with its colour in the comment).
 */
export function codeTokensCss(
  system: CodeDesignSystem,
  options: { generatedAt?: string } = {},
): string {
  const lines: string[] = [
    "/*",
    " * Design tokens read from the code of:",
    ...system.repos.map(
      (repo) =>
        ` *   ${repo.label}${repo.sha ? ` @ ${repo.sha.slice(0, 12)}` : ""}${repo.label === system.primary ? " (primary)" : ""}`,
    ),
    ` * by Xeno Studio${options.generatedAt ? ` on ${options.generatedAt}` : ""}. Each value names where it is declared.`,
    " */",
  ];
  const order = (repo: string) =>
    repo === system.primary ? 0 : 1 + system.repos.findIndex((item) => item.label === repo);
  for (const scheme of ["default", "dark", "light"] as const) {
    const chosen = new Map<string, (CodeToken & { repo: string }) | undefined>();
    const others = new Map<string, string[]>();
    for (const token of system.tokens) {
      if (token.scheme !== scheme || !token.name.startsWith("--") || !SAFE_VALUE.test(token.value))
        continue;
      const current = chosen.get(token.name);
      if (!current || order(token.repo) < order(current.repo)) {
        if (current && normal(current.value) !== normal(token.value))
          others.set(token.name, [
            ...(others.get(token.name) ?? []),
            `${current.repo.split("/")[1]}: ${current.value}`,
          ]);
        chosen.set(token.name, token);
      } else if (current.repo !== token.repo && normal(current.value) !== normal(token.value))
        others.set(token.name, [
          ...(others.get(token.name) ?? []),
          `${token.repo.split("/")[1]}: ${token.value}`,
        ]);
    }
    if (!chosen.size) continue;
    lines.push("", scheme === "default" ? ":root {" : scheme === "dark" ? ".dark {" : ".light {");
    const groups: [string, TokenKind[]][] = [
      ["colours", ["colour"]],
      ["type", ["font"]],
      ["radius", ["radius"]],
      ["shadows", ["shadow"]],
      ["motion", ["motion"]],
      ["blur", ["blur"]],
      ["gradients", ["gradient"]],
      ["spacing", ["spacing"]],
      ["other", ["other"]],
    ];
    for (const [label, kinds] of groups) {
      const list = [...chosen.values()].filter(
        (token): token is CodeToken & { repo: string } => !!token && kinds.includes(token.kind),
      );
      if (!list.length) continue;
      lines.push(`  /* ${label} */`);
      for (const token of list) {
        const notesFor = [
          `${token.repo.split("/")[1]} ${where({ repo: token.repo, path: token.path, line: token.line })}`,
          token.hex && !/^#/.test(token.value.trim()) ? token.hex : null,
          ...(others.get(token.name) ?? []).map((other) => `also ${other}`),
        ].filter(Boolean);
        lines.push(`  ${token.name}: ${token.value}; /* ${comment(notesFor.join("; "))} */`);
      }
    }
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}
