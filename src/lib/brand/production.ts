/**
 * A brand's production roles: what its graphics are drawn in (the ground,
 * the surfaces and glass, the ink, the accent and the brand's signature
 * colour, its lines; its display, body and mono type and its eyebrow; the
 * corners, shadows and blur of a window or a card; and how things move), each
 * read from the brand's code with the repository, file and line it is
 * declared on, checked, and written out as a stylesheet a production reads.
 *
 * Reel 1 needed a script for this (scripts/aurixa-reel-1/reel_css.ts): the
 * code scanner (./scan-code) reads every token, and this turns them into the
 * roles graphics are drawn in, so nothing is picked by eye.
 *
 * The parts:
 * - PRODUCTION_ROLES: the catalogue, and what each role is for.
 * - proposeProduction: each role proposed from a design system read from
 *   code, by its tokens' names, values and how much they are used, with the
 *   evidence and the other candidates, for a person to change.
 * - productionOf: a stored production, read tolerantly.
 * - productionChecks: every role filled, the ink's contrast on the ground and
 *   the surface (WCAG), each face loaded, every disagreement decided in
 *   writing.
 * - productionStylesheet / productionTokens: the roles as CSS custom
 *   properties (`--brand-ground`), each naming where it is declared, and the
 *   same as JSON.
 * - brandMotion: its motion roles as curves and durations (see ./motion).
 *
 * Pure: shared by the server, the browser and tests.
 */
import {
  chroma,
  contrastRatio,
  hexToRgb,
  isNeutral,
  parseCssColour,
  relativeLuminance,
  rgbToHex,
} from "./colour";
import { normalizeHex } from "./design";
import {
  cubicBezierOf,
  formatCubicBezier,
  formatDuration,
  MAX_DURATION_MS,
  motionParts,
  parseCubicBezier,
  type CubicBezier,
} from "./motion";
import type { CodeColour, CodeDesignSystem, CodeToken, FontLoading, ScaleToken } from "./scan-code";
import { fontStackFamily, type TokenScheme } from "./scan-css";
import { clip } from "./text";

/* ------------------------------------------------------------------ */
/* The roles                                                           */
/* ------------------------------------------------------------------ */

export const PRODUCTION_ROLE_KINDS = [
  "colour",
  "type",
  "radius",
  "shadow",
  "blur",
  "motion",
] as const;
export type ProductionRoleKind = (typeof PRODUCTION_ROLE_KINDS)[number];

export const PRODUCTION_KIND_LABELS: Record<ProductionRoleKind, string> = {
  colour: "Colour",
  type: "Type",
  radius: "Corners",
  shadow: "Shadows",
  blur: "Blur",
  motion: "Motion",
};

export interface ProductionRoleSpec {
  key: string;
  kind: ProductionRoleKind;
  label: string;
  /** What the role is for, in a few words. */
  about: string;
  /** A production needs it; the others are for brands that have them. */
  required: boolean;
}

/** The roles a production is drawn in, in the order the stylesheet writes them. */
export const PRODUCTION_ROLES = [
  {
    key: "ground",
    kind: "colour",
    label: "Ground",
    about: "The field every frame stands on: the brand's own background.",
    required: true,
  },
  {
    key: "surface",
    kind: "colour",
    label: "Surface",
    about: "Panels and strips set on the ground.",
    required: true,
  },
  {
    key: "raised",
    kind: "colour",
    label: "Raised",
    about: "A card lifted off the ground.",
    required: true,
  },
  {
    key: "glass",
    kind: "colour",
    label: "Glass",
    about: "A pane the picture shows through.",
    required: false,
  },
  { key: "ink", kind: "colour", label: "Ink", about: "Text on the ground.", required: true },
  {
    key: "ink-muted",
    kind: "colour",
    label: "Muted ink",
    about: "Secondary text: labels and the quieter line.",
    required: true,
  },
  {
    key: "accent",
    kind: "colour",
    label: "Accent",
    about: "The colour of what to press: a button, a link, a call to action.",
    required: true,
  },
  {
    key: "signature",
    kind: "colour",
    label: "Signature",
    about: "The colour that says it is the brand: its hairlines, rules and marks (Aurixa's gold).",
    required: true,
  },
  { key: "line", kind: "colour", label: "Line", about: "Hairlines and borders.", required: true },
  {
    key: "selection",
    kind: "colour",
    label: "Selection",
    about: "Focus and selection: the ring a press draws.",
    required: false,
  },
  {
    key: "danger",
    kind: "colour",
    label: "Danger",
    about: "Errors and warnings.",
    required: false,
  },
  {
    key: "display",
    kind: "type",
    label: "Display",
    about: "Headlines and titles.",
    required: true,
  },
  {
    key: "display-italic",
    kind: "type",
    label: "Display italic",
    about: "The display face's italic, for a phrase set apart.",
    required: false,
  },
  { key: "body", kind: "type", label: "Body", about: "Interface and body text.", required: true },
  {
    key: "mono",
    kind: "type",
    label: "Mono",
    about: "Figures, codes and references.",
    required: false,
  },
  {
    key: "eyebrow",
    kind: "type",
    label: "Eyebrow",
    about: "The small label over a heading: its face, tracking and case.",
    required: false,
  },
  {
    key: "radius-window",
    kind: "radius",
    label: "Window corners",
    about: "What holds the product: a window or a panel.",
    required: true,
  },
  {
    key: "radius-card",
    kind: "radius",
    label: "Card corners",
    about: "A card or a chip inside a window.",
    required: true,
  },
  {
    key: "shadow-window",
    kind: "shadow",
    label: "Window shadow",
    about: "Under a window.",
    required: true,
  },
  {
    key: "shadow-lift",
    kind: "shadow",
    label: "Lift shadow",
    about: "Under a card or a document that lifts.",
    required: false,
  },
  {
    key: "blur-glass",
    kind: "blur",
    label: "Glass blur",
    about: "Behind a pane of glass.",
    required: false,
  },
  {
    key: "blur-backdrop",
    kind: "blur",
    label: "Backdrop blur",
    about: "A heavy blur behind a wall of screens.",
    required: false,
  },
  {
    key: "move",
    kind: "motion",
    label: "Move",
    about: "Anything that travels: a pointer, a camera, a window crossing the frame.",
    required: true,
  },
  {
    key: "settle",
    kind: "motion",
    label: "Settle",
    about: "Anything that arrives and comes to rest.",
    required: true,
  },
  {
    key: "enter",
    kind: "motion",
    label: "Enter",
    about: "A title or a card coming in.",
    required: true,
  },
  {
    key: "exit",
    kind: "motion",
    label: "Exit",
    about: "A title or a card going.",
    required: true,
  },
  {
    key: "press",
    kind: "motion",
    label: "Press",
    about: "A press: the control's own response, and its ring.",
    required: true,
  },
] as const satisfies readonly ProductionRoleSpec[];

export type ProductionRoleKey = (typeof PRODUCTION_ROLES)[number]["key"];
export type ColourRoleKey = Extract<(typeof PRODUCTION_ROLES)[number], { kind: "colour" }>["key"];
export type TypeRoleKey = Extract<(typeof PRODUCTION_ROLES)[number], { kind: "type" }>["key"];
export type MotionRoleKey = Extract<(typeof PRODUCTION_ROLES)[number], { kind: "motion" }>["key"];

export const MOTION_ROLE_KEYS: readonly MotionRoleKey[] = [
  "move",
  "settle",
  "enter",
  "exit",
  "press",
];

/** What a motion role needs to be filled: its curve, its duration, or both. */
export const MOTION_NEEDS: Record<MotionRoleKey, readonly ("ease" | "duration")[]> = {
  move: ["ease"],
  settle: ["ease"],
  enter: ["ease", "duration"],
  exit: ["ease", "duration"],
  press: ["duration"],
};

export function roleSpec(key: ProductionRoleKey): ProductionRoleSpec {
  return PRODUCTION_ROLES.find((spec) => spec.key === key)!;
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/** Where a role's value is declared in the brand's code. */
export interface RoleSource {
  /** The token as written (`--color-base-950`, `colors.brand`); empty for a colour only written out. */
  token: string;
  repo: string;
  /** The file, from the repository's top (empty for a colour written out in many files). */
  path: string;
  line: number | null;
  scheme: TokenScheme;
  /** As the code writes it, when that isn't the value (another token read through it). */
  written: string | null;
  /** Other repositories that declare it with the same value. */
  alsoIn: string[];
  /** How often a colour that is never a token is written out. */
  uses: number | null;
}

interface RoleBase {
  /** Where it is declared; null when a person set it. */
  from: RoleSource | null;
  /** Why it was proposed (the evidence), or a person's note. */
  why: string | null;
}

export interface ColourRole extends RoleBase {
  kind: "colour";
  /** As CSS takes it, as the code writes it where it can be (`#040B16`, `hsl(220 60% 11% / 0.55)`). */
  value: string;
  /** Lowercase #rrggbb, and its opacity (0-1). */
  hex: string;
  alpha: number;
}

export interface TypeRole extends RoleBase {
  kind: "type";
  /** The typeface, and the stack CSS sets it with. */
  family: string;
  stack: string;
  weight: number | null;
  italic: boolean;
  /** Tracking, as CSS writes it (`0.28em`). */
  letterSpacing: string | null;
  uppercase: boolean;
  /** How the brand's code loads it (empty: it doesn't). */
  loaded: FontLoading[];
}

export interface ScaleRole extends RoleBase {
  kind: "radius" | "shadow" | "blur";
  /** As CSS takes it: `1.25rem`, `0 28px 70px -24px hsl(0 0% 0% / 0.78)`, `16px`. */
  value: string;
}

export interface MotionRole extends RoleBase {
  kind: "motion";
  ease: CubicBezier | null;
  durationMs: number | null;
  /** Where the duration is declared, when it isn't where the curve is. */
  durationFrom: RoleSource | null;
}

export type RoleValue = ColourRole | TypeRole | ScaleRole | MotionRole;
export type ProductionRoles = Partial<Record<ProductionRoleKey, RoleValue>>;

/** A value the repositories disagree on, and what production does about it, in writing. */
export interface ProductionDecision {
  token: string;
  scheme: TokenScheme;
  values: { value: string; hex: string | null; repos: string[] }[];
  /** The value production uses (null: none of them). */
  chosen: string | null;
  /** Why, in a person's words. */
  note: string;
}

export interface BrandProduction {
  /** The scheme its roles are read in: the brand's own (dark, for a brand that is dark by default). */
  scheme: "dark" | "light";
  roles: ProductionRoles;
  decisions: ProductionDecision[];
  /** The repositories and the commits read, the brand's own first. */
  read: { repo: string; sha: string | null }[];
  /** The import it was read from. */
  importId: string | null;
}

export const EMPTY_PRODUCTION: BrandProduction = {
  scheme: "dark",
  roles: {},
  decisions: [],
  read: [],
  importId: null,
};

export const PRODUCTION_LIMITS = {
  value: 400,
  stack: 300,
  family: 80,
  note: 600,
  why: 300,
  decisions: 40,
  read: 6,
  candidates: 6,
} as const;

/** Whether a kit has no production roles yet. */
export function isEmptyProduction(production: BrandProduction): boolean {
  return !Object.keys(production.roles).length && !production.decisions.length;
}

/* ------------------------------------------------------------------ */
/* Reading a stored production                                         */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const SCHEMES: readonly TokenScheme[] = ["default", "dark", "light", "scoped"];
const LOADINGS: readonly FontLoading[] = ["google", "fontsource", "package", "font-face", "adobe"];

/**
 * A value a stylesheet can carry as it is: nothing that ends a declaration,
 * a rule or a comment, opens markup, or fetches anything.
 */
export function safeCssValue(value: unknown, max: number = PRODUCTION_LIMITS.value): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  if (/[{};<>\\]|\/\*|\*\/|url\(|expression\(|@import/i.test(text)) return null;
  return text;
}

const LETTER_SPACING = /^(?:normal|-?(?:\d+\.?\d*|\.\d+)(?:em|rem|px))$/;

function sourceOf(value: unknown): RoleSource | null {
  const item = record(value);
  const repo = clip(item["repo"], 140);
  if (!repo) return null;
  const line = Number(item["line"]);
  const uses = Number(item["uses"]);
  return {
    token: clip(item["token"], 200) ?? "",
    repo,
    path: clip(item["path"], 400) ?? "",
    line: Number.isInteger(line) && line > 0 ? line : null,
    scheme: SCHEMES.includes(item["scheme"] as TokenScheme)
      ? (item["scheme"] as TokenScheme)
      : "default",
    written: clip(item["written"], 400),
    alsoIn: Array.isArray(item["alsoIn"])
      ? (item["alsoIn"] as unknown[])
          .flatMap((entry) => (clip(entry, 140) ? [clip(entry, 140)!] : []))
          .slice(0, 6)
      : [],
    uses: Number.isInteger(uses) && uses > 0 ? uses : null,
  };
}

/** One stored role, if it is well formed for its kind; null otherwise. */
export function roleOf(spec: ProductionRoleSpec, value: unknown): RoleValue | null {
  const item = record(value);
  const base = { from: sourceOf(item["from"]), why: clip(item["why"], PRODUCTION_LIMITS.why) };
  switch (spec.kind) {
    case "colour": {
      const css = safeCssValue(item["value"]);
      const parsed = css ? parseCssColour(css) : null;
      const hex = parsed?.hex ?? normalizeHex(item["hex"]);
      if (!css || !hex) return null;
      const alpha = parsed ? parsed.alpha : Number(item["alpha"]);
      return {
        kind: "colour",
        value: css,
        hex,
        alpha: Number.isFinite(alpha)
          ? Math.min(1, Math.max(0, Math.round(alpha * 1000) / 1000))
          : 1,
        ...base,
      };
    }
    case "type": {
      const family = clip(item["family"], PRODUCTION_LIMITS.family);
      const stack = safeCssValue(item["stack"], PRODUCTION_LIMITS.stack);
      if (!family || !stack || !/^[\p{L}\p{N} ._'&+-]+$/u.test(family)) return null;
      const weight = Number(item["weight"]);
      const spacing = typeof item["letterSpacing"] === "string" ? item["letterSpacing"].trim() : "";
      return {
        kind: "type",
        family,
        stack,
        weight: Number.isInteger(weight) && weight >= 100 && weight <= 950 ? weight : null,
        italic: item["italic"] === true,
        letterSpacing: LETTER_SPACING.test(spacing) ? spacing : null,
        uppercase: item["uppercase"] === true,
        loaded: Array.isArray(item["loaded"])
          ? LOADINGS.filter((how) => (item["loaded"] as unknown[]).includes(how))
          : [],
        ...base,
      };
    }
    case "radius":
    case "shadow":
    case "blur": {
      const css = safeCssValue(item["value"]);
      return css ? { kind: spec.kind, value: css, ...base } : null;
    }
    case "motion": {
      const ease = cubicBezierOf(item["ease"]);
      const duration = Number(item["durationMs"]);
      const durationMs =
        item["durationMs"] !== null &&
        Number.isFinite(duration) &&
        duration >= 0 &&
        duration <= MAX_DURATION_MS
          ? Math.round(duration * 100) / 100
          : null;
      if (!ease && durationMs === null) return null;
      return {
        kind: "motion",
        ease,
        durationMs,
        durationFrom: sourceOf(item["durationFrom"]),
        ...base,
      };
    }
  }
}

function decisionsOf(value: unknown): ProductionDecision[] {
  if (!Array.isArray(value)) return [];
  const out: ProductionDecision[] = [];
  for (const entry of value) {
    const item = record(entry);
    const token = clip(item["token"], 200);
    if (!token) continue;
    const values = Array.isArray(item["values"])
      ? (item["values"] as unknown[]).flatMap((raw) => {
          const option = record(raw);
          const text = clip(option["value"], 200);
          if (!text) return [];
          return [
            {
              value: text,
              hex: normalizeHex(option["hex"]),
              repos: Array.isArray(option["repos"])
                ? (option["repos"] as unknown[]).flatMap((repo) =>
                    clip(repo, 140) ? [clip(repo, 140)!] : [],
                  )
                : [],
            },
          ];
        })
      : [];
    out.push({
      token,
      scheme: SCHEMES.includes(item["scheme"] as TokenScheme)
        ? (item["scheme"] as TokenScheme)
        : "default",
      values: values.slice(0, 6),
      chosen: clip(item["chosen"], 200),
      note:
        typeof item["note"] === "string"
          ? item["note"].trim().slice(0, PRODUCTION_LIMITS.note)
          : "",
    });
    if (out.length >= PRODUCTION_LIMITS.decisions) break;
  }
  return out;
}

/** A production as stored (or sent), every part checked; a kit from before production roles has none. */
export function productionOf(value: unknown): BrandProduction {
  const item = record(value);
  const raw = record(item["roles"]);
  const roles: ProductionRoles = {};
  for (const spec of PRODUCTION_ROLES) {
    const role = roleOf(spec, raw[spec.key]);
    if (role && role.kind === spec.kind) roles[spec.key] = role;
  }
  return {
    scheme: item["scheme"] === "light" ? "light" : "dark",
    roles,
    decisions: decisionsOf(item["decisions"]),
    read: Array.isArray(item["read"])
      ? (item["read"] as unknown[])
          .flatMap((entry) => {
            const read = record(entry);
            const repo = clip(read["repo"], 140);
            return repo ? [{ repo, sha: clip(read["sha"], 64) }] : [];
          })
          .slice(0, PRODUCTION_LIMITS.read)
      : [],
    importId: clip(item["importId"] ?? item["import_id"], 64),
  };
}

/* ------------------------------------------------------------------ */
/* Proposing the roles from code                                       */
/* ------------------------------------------------------------------ */

/** A role's value as found in the code, with why it fits. */
export interface RoleCandidate {
  value: RoleValue;
  /** Why it fits, in words: its name, its value, how much it is used. */
  why: string;
  score: number;
}

export interface ProductionProposal {
  production: BrandProduction;
  /** Each role's candidates, best first (the first, when good enough, is the one proposed). */
  candidates: Partial<Record<ProductionRoleKey, RoleCandidate[]>>;
}

/** How sure a candidate must be to be proposed: a name that fits, or a value that does unmistakably. */
const PROPOSE_AT = 3;

/** A token's name as words: `--color-marketing-panel` reads "color marketing panel". */
export function nameWords(name: string): string {
  return name
    .replace(/^(?:--|\$|@)/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_.:/]+/g, " ")
    .toLowerCase()
    .trim();
}

interface Rule {
  test: RegExp;
  points: number;
  /** What the evidence says when it matches (none for a rule that only rules a token out). */
  why?: string;
}

/** A score and its reasons, the reasons in the order they were found. */
interface Score {
  points: number;
  reasons: string[];
}

const add = (score: Score, points: number, why?: string | null) => {
  score.points += points;
  if (why && !score.reasons.includes(why)) score.reasons.push(why);
};

function byName(words: string, rules: Rule[], score: Score) {
  for (const rule of rules) if (rule.test.test(words)) add(score, rule.points, rule.why);
}

const shortRepo = (repo: string) => repo.split("/")[1] ?? repo;
const sentence = (reasons: string[]) => {
  const text = reasons.join("; ");
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}.` : "";
};

/** A colour as CSS takes it: as the code writes it where it can, else its hex (and opacity). */
const CHANNELS = /^\d+(?:\.\d+)?(?:deg)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*[\d.]+%?)?$/;
function cssColour(resolved: string, hex: string, alpha: number): string {
  const text = resolved.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  if (!text.includes("var(") && safeCssValue(text) && parseCssColour(text)) return text;
  if (CHANNELS.test(text)) return `hsl(${text})`;
  if (alpha >= 0.999) return hex;
  const rgb = hexToRgb(hex)!;
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${Math.round(alpha * 1000) / 1000})`;
}

/** A colour seen through something translucent laid over it. */
function over(top: { hex: string; alpha: number }, bottom: string): string {
  const a = hexToRgb(top.hex) ?? { r: 0, g: 0, b: 0 };
  const b = hexToRgb(bottom) ?? { r: 0, g: 0, b: 0 };
  const mix = (x: number, y: number) => x * top.alpha + y * (1 - top.alpha);
  return rgbToHex({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) });
}

type Token = CodeToken & { repo: string };

interface Context {
  system: CodeDesignSystem;
  scheme: "dark" | "light";
  primary: string | null;
  /** Each repository's own scheme, as the scanner read it. */
  repoSchemes: Map<string, "dark" | "light" | null>;
  tokens: Token[];
  /** The tokens by name, so a token's namesakes in other repositories and themes are found at once. */
  byName: Map<string, Token[]>;
  /** What every candidate is measured against, worked out once a proposal. */
  once: { extreme?: number | null; vivid?: string[]; steps?: Map<string, number[]> };
}

/**
 * The scheme a production is read in: the brand's own source's, as its
 * background reads (Aurixa's site is dark), else the first repository's that
 * says, else light.
 */
export function productionScheme(system: CodeDesignSystem): "dark" | "light" {
  const own = system.repos.find((repo) => repo.label === system.primary)?.defaultScheme;
  return own ?? system.repos.find((repo) => repo.defaultScheme)?.defaultScheme ?? "light";
}

/**
 * How well a token's scheme fits the production's: its own theme's value over
 * the other's. A root value that the production's theme overrides (a light
 * product's `:root --background` beside its `.dark` one) is the other theme's;
 * one it doesn't override is what that theme shows too.
 */
function schemeFit(
  token: { name: string; scheme: TokenScheme; repo: string },
  context: Context,
  score: Score,
) {
  if (token.scheme === context.scheme) add(score, 1, `its ${context.scheme} theme's value`);
  else if (token.scheme === "default") {
    const own = context.repoSchemes.get(token.repo);
    const overridden = (context.byName.get(token.name) ?? []).some(
      (other) => other.repo === token.repo && other.scheme === context.scheme,
    );
    add(score, own && own !== context.scheme && overridden ? -1.5 : 0.5);
  } else add(score, -3);
}

function primaryFit(repo: string, context: Context, score: Score) {
  if (repo === context.primary) add(score, 1.5, `in ${shortRepo(repo)}, the brand's own source`);
}

/** Other repositories that declare a token with the same value. */
function alsoIn(token: Token, context: Context): string[] {
  const value = token.resolved.replace(/\s+/g, " ").trim().toLowerCase();
  const repos = (context.byName.get(token.name) ?? [])
    .filter(
      (other) =>
        other.repo !== token.repo &&
        other.name === token.name &&
        other.scheme === token.scheme &&
        (token.hex && other.hex
          ? other.hex === token.hex
          : other.resolved.replace(/\s+/g, " ").trim().toLowerCase() === value),
    )
    .map((other) => other.repo);
  return [...new Set(repos)];
}

function tokenSource(token: Token, context: Context, value: string): RoleSource {
  return {
    token: token.name,
    repo: token.repo,
    path: token.path,
    line: token.line,
    scheme: token.scheme,
    written: token.value.trim() !== value.trim() ? clip(token.value, 400) : null,
    alsoIn: alsoIn(token, context),
    uses: null,
  };
}

function scaleSource(token: ScaleToken, value: string): RoleSource {
  return {
    token: token.name,
    repo: token.repo,
    path: token.path,
    line: token.line,
    scheme: token.scheme,
    written: token.value.trim() !== value.trim() ? clip(token.value, 400) : null,
    alsoIn: token.alsoIn ?? [],
    uses: null,
  };
}

/** The best candidates first, one per value and token; none the evidence speaks against. */
function ranked(list: RoleCandidate[]): RoleCandidate[] {
  const seen = new Set<string>();
  return list
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      const from = candidate.value.from;
      const key = `${JSON.stringify(valueKey(candidate.value))} ${from?.token ?? ""} ${from?.repo ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, PRODUCTION_LIMITS.candidates);
}

function valueKey(role: RoleValue): unknown {
  switch (role.kind) {
    case "colour":
      return [role.hex, role.alpha];
    case "type":
      return [role.family.toLowerCase(), role.italic];
    case "motion":
      return [role.ease, role.durationMs];
    default:
      return role.value.toLowerCase();
  }
}

/* Colours ------------------------------------------------------------ */

interface ColourSource {
  token: Token | null;
  hex: string;
  alpha: number;
  value: string;
  repo: string;
  words: string;
  /** The scanner's colour it belongs to (its weight, its repositories). */
  cluster: CodeColour | null;
}

/**
 * A colour with a hue of its own: colourful enough, and not so dark it reads
 * as the ground (a navy panel is a surface, never the brand's signature).
 */
function vivid(hex: string): boolean {
  return chroma(hex) >= 25 && relativeLuminance(hex) >= 0.04;
}

/** Names of a colour's job in an interface that rule it out of the brand's surfaces. */
const NOT_SURFACE =
  /\b(?:foreground|fg|text|ink|border|stroke|line|divider|ring|focus|outline|shadow|chart|destructive|danger|error|success|warning|info|selection|placeholder|disabled|hover|active|pressed|scrollbar|caret|tooltip|toast)\b/;
/** A background named for one part of an interface rather than the page. */
const PART_BACKGROUND =
  /\b(?:card|muted|sidebar|popover|button|input|accent|primary|secondary|hover|active|selected|overlay|tooltip|toast|chart|destructive|danger|success|warning|info|inverse|subtle|alt|elevated|raised|code|kbd|badge|nav|header|footer|hero)\b/;

const COLOUR_RULES: Record<
  ColourRoleKey,
  (source: ColourSource, context: Context, roles: ProductionRoles, score: Score) => void
> = {
  ground: (source, context, _roles, score) => {
    const { words } = source;
    if (NOT_SURFACE.test(words)) return add(score, -10);
    if (/\b(?:background|bg|canvas|ground)\b/.test(words) && !PART_BACKGROUND.test(words))
      add(score, 3, "named for the background");
    if (/\bpage\b/.test(words)) add(score, 2, "named for the page");
    const step = /\b(\d{2,4})$/.exec(words)?.[1];
    if (/\b(?:base|neutral|gray|grey|slate|navy|ink)\b/.test(words) && step) {
      const darkest = context.scheme === "dark" ? Number(step) >= 900 : Number(step) <= 50;
      if (darkest)
        add(
          score,
          2,
          `the ${context.scheme === "dark" ? "darkest" : "lightest"} step of its scale`,
        );
    }
    groundValue(source, context, score);
  },
  surface: (source, context, roles, score) => {
    const { words } = source;
    if (NOT_SURFACE.test(words)) return add(score, -10);
    if (/\b(?:surface|panel)\b/.test(words)) add(score, 3, "named for a surface or panel");
    if (/\bcard\b/.test(words)) add(score, 1.5, "named for a card");
    if (/\b(?:secondary|muted)\b/.test(words)) add(score, 0.5);
    if (/\b(?:raised|elevated)\b/.test(words)) add(score, -1);
    layerValue(source, context, roles, score);
  },
  raised: (source, context, roles, score) => {
    const { words } = source;
    if (NOT_SURFACE.test(words)) return add(score, -10);
    if (/\b(?:raised|elevated|card|popover|float\w*)\b/.test(words))
      add(score, 3, "named for something raised (a card)");
    const ground = roles.ground?.kind === "colour" ? roles.ground : null;
    if (
      ground?.from?.token &&
      source.token &&
      nextStep(ground.from.token, source.token.name, context)
    )
      add(score, 3, `the step next to the ground's on its scale`);
    if (roles.surface?.kind === "colour" && roles.surface.hex === source.hex) add(score, -1);
    layerValue(source, context, roles, score);
  },
  glass: (source, _context, _roles, score) => {
    const { words } = source;
    if (/\b(?:stroke|border|line|edge|shadow|specular|sheen|highlight|ring|scrim)\b/.test(words))
      return add(score, -10);
    if (/\b(?:glass|frost\w*|translucent|acrylic)\b/.test(words)) add(score, 3, "named for glass");
    if (source.alpha < 0.95)
      add(score, 2, `translucent (${Math.round(source.alpha * 100)}% opaque)`);
    else add(score, -2);
  },
  ink: (source, context, roles, score) => {
    const { words } = source;
    if (
      /\b(?:muted|secondary|tertiary|subtle|subdued|disabled|placeholder|inverse|hint|dim|faint|soft|quiet)\b/.test(
        words,
      )
    )
      return add(score, -10);
    if (
      /\b(?:primary|accent|destructive|danger|success|warning|info|sidebar|chart|button|badge)\b.*\b(?:foreground|fg)\b/.test(
        words,
      )
    )
      return add(score, -10);
    if (/\b(?:foreground|fg|ink|text|content)\b/.test(words)) add(score, 2, "named for text");
    else if (!isNeutral(source.hex)) return add(score, -10);
    if (/\btext\b.*\bprimary\b|\bprimary\b.*\btext\b/.test(words))
      add(score, 1, "the primary text");
    readsOn(source, context, roles, score, 7);
  },
  "ink-muted": (source, context, roles, score) => {
    const { words } = source;
    if (/\b(?:border|stroke|line|ring|shadow|chart|destructive|danger|background|bg)\b/.test(words))
      return add(score, -10);
    if (/\b(?:muted|secondary|tertiary|subtle|subdued|dim|soft|faint|quiet|hint)\b/.test(words))
      add(score, 2, "named as the quieter text");
    else if (!isNeutral(source.hex)) return add(score, -10);
    if (/\b(?:foreground|fg|text|ink)\b/.test(words)) add(score, 1);
    const ink = roles.ink?.kind === "colour" ? roles.ink : null;
    const ground = roles.ground?.kind === "colour" ? roles.ground.hex : null;
    if (ground) {
      const ratio = contrastRatio(over(source, ground), ground);
      const top = ink ? contrastRatio(over(ink, ground), ground) : 21;
      if (ratio < 3) add(score, -10);
      else if (ratio < top)
        add(score, 2, `reads at ${ratio.toFixed(1)}:1 on the ground, below the ink`);
    }
    if (ink?.hex === source.hex) add(score, -3);
  },
  accent: (source, _context, roles, score) => {
    const { words } = source;
    if (
      /\b(?:foreground|fg|on|ring|focus|border|hover|active|pressed|disabled|muted|subtle|soft|text|chart)\b/.test(
        words,
      )
    )
      return add(score, -10);
    if (/\b(?:primary|accent|action|cta|link|interactive)\b/.test(words))
      add(score, 2.5, "named for the brand's action colour");
    else if (/\bbrand\b/.test(words)) add(score, 1, "named for the brand");
    else return add(score, -10);
    if (!vivid(source.hex)) return add(score, -10);
    add(score, 1);
    if (roles.signature?.kind === "colour" && roles.signature.hex === source.hex) add(score, -1);
  },
  signature: (source, context, _roles, score) => {
    const { words, cluster } = source;
    if (
      /\b(?:warn\w*|success|danger|error|destructive|info|chart|ring|focus|border|stroke|foreground|fg|text|link|selection|shadow)\b/.test(
        words,
      )
    )
      return add(score, -10);
    if (!vivid(source.hex) || source.alpha < 0.9) return add(score, -10);
    if (/\b(?:brand|signature|hallmark)\b/.test(words)) add(score, 2, "named for the brand");
    if (source.token) add(score, 1.5, "declared as a token");
    const rank = cluster ? vividRank(context).indexOf(cluster.hex) : -1;
    if (rank === 0) add(score, 2, "the brand's most used colour");
    else if (rank === 1) add(score, 1.5, "one of its most used colours");
    else if (rank === 2) add(score, 1);
    if (cluster && cluster.repos.length > 1) {
      add(score, 0.5 * (cluster.repos.length - 1), `in ${cluster.repos.length} repositories`);
    }
  },
  line: (source, context, roles, score) => {
    const { words } = source;
    if (/\b(?:ring|focus|shadow|selection|chart|caret)\b/.test(words)) return add(score, -10);
    if (/\b(?:border|stroke|line|divider|separator|hairline|rule|edge)\b/.test(words))
      add(score, 3, "named for borders and hairlines");
    const ground = roles.ground?.kind === "colour" ? roles.ground.hex : null;
    if (ground && contrastRatio(over(source, ground), ground) < 1.1) add(score, -2);
  },
  selection: (source, _context, _roles, score) => {
    const { words } = source;
    if (/\b(?:foreground|fg|text|offset|shadow)\b/.test(words)) return add(score, -10);
    if (/\b(?:ring|focus|selection|selected)\b/.test(words))
      add(score, 3, "named for focus and selection");
    else return add(score, -10);
    if (!isNeutral(source.hex)) add(score, 1);
  },
  danger: (source, _context, _roles, score) => {
    const { words } = source;
    if (/\b(?:foreground|fg|text|border|ring|muted|subtle|soft)\b/.test(words))
      return add(score, -10);
    if (/\b(?:destructive|danger|error|critical|negative)\b/.test(words))
      add(score, 3, "named for errors");
    else return add(score, -10);
    if (!isNeutral(source.hex)) add(score, 0.5);
  },
};

/** Opaque, and at the far end of the brand's scheme. */
function groundValue(source: ColourSource, context: Context, score: Score) {
  if (source.alpha < 0.98) return add(score, -10);
  const luminance = relativeLuminance(source.hex);
  if (context.scheme === "dark") {
    if (luminance > 0.25) return add(score, -10);
    if (luminance <= 0.02) add(score, 2, `near black (${source.hex})`);
    else if (luminance <= 0.06) add(score, 1);
  } else {
    if (luminance < 0.5) return add(score, -10);
    if (luminance >= 0.9) add(score, 2, `near white (${source.hex})`);
    else if (luminance >= 0.75) add(score, 1);
  }
  const target = extremeLuminance(context);
  if (target !== null && Math.abs(target - luminance) < 1e-6)
    add(score, 1, `the ${context.scheme === "dark" ? "darkest" : "lightest"} colour declared`);
}

/**
 * The darkest (or, for a light brand, lightest) of the opaque colours declared
 * for the brand's scheme that aren't text, lines or rings; null for none.
 */
function extremeLuminance(context: Context): number | null {
  if (context.once.extreme !== undefined) return context.once.extreme;
  const opposite = context.scheme === "dark" ? "light" : "dark";
  const levels = context.tokens
    .filter(
      (token) =>
        token.kind === "colour" &&
        token.hex &&
        (token.alpha ?? 1) >= 0.98 &&
        token.scheme !== opposite &&
        token.scheme !== "scoped" &&
        !NOT_SURFACE.test(nameWords(token.name)),
    )
    .map((token) => relativeLuminance(token.hex!));
  context.once.extreme = levels.length
    ? context.scheme === "dark"
      ? Math.min(...levels)
      : Math.max(...levels)
    : null;
  return context.once.extreme;
}

/** A surface or a raised card: opaque, not the ground, and near it rather than the ink. */
function layerValue(source: ColourSource, context: Context, roles: ProductionRoles, score: Score) {
  if (source.alpha < 0.95) return add(score, -10);
  const ground = roles.ground?.kind === "colour" ? roles.ground : null;
  if (ground?.hex === source.hex) return add(score, -10);
  const luminance = relativeLuminance(source.hex);
  if (context.scheme === "dark") {
    if (luminance > 0.3) return add(score, -10);
    if (luminance <= 0.12) add(score, 1);
  } else {
    if (luminance < 0.45) return add(score, -10);
    if (luminance >= 0.7) add(score, 1);
  }
}

/** Text: how well it reads on the ground. */
function readsOn(
  source: ColourSource,
  _context: Context,
  roles: ProductionRoles,
  score: Score,
  best: number,
) {
  const ground = roles.ground?.kind === "colour" ? roles.ground.hex : null;
  if (!ground) return;
  const ratio = contrastRatio(over(source, ground), ground);
  if (ratio >= best) add(score, 2, `reads at ${ratio.toFixed(1)}:1 on the ground`);
  else if (ratio >= 4.5) add(score, 1, `reads at ${ratio.toFixed(1)}:1 on the ground`);
  else if (ratio < 3) add(score, -10);
}

/** Whether `candidate` is the next step toward the ink after `ground` on the same scale (base-950, then base-900). */
function nextStep(ground: string, candidate: string, context: Context): boolean {
  const split = (name: string) => {
    const match = /^(.*?)[-_.]?(\d{2,4})$/.exec(name);
    return match ? { stem: match[1]!, step: Number(match[2]) } : null;
  };
  const a = split(ground);
  const b = split(candidate);
  if (!a || !b || a.stem !== b.stem || a.step === b.step) return false;
  // Every scale's steps, read once a proposal.
  if (!context.once.steps) {
    const scales = new Map<string, number[]>();
    for (const token of context.tokens) {
      const entry = split(token.name);
      if (entry) scales.set(entry.stem, [...(scales.get(entry.stem) ?? []), entry.step]);
    }
    context.once.steps = scales;
  }
  const steps = context.once.steps.get(a.stem) ?? [];
  const toward =
    context.scheme === "dark"
      ? steps.filter((step) => step < a.step).sort((x, y) => y - x)
      : steps.filter((step) => step > a.step).sort((x, y) => x - y);
  return toward[0] === b.step;
}

/** The scanner's vivid colours, heaviest first. */
function vividRank(context: Context): string[] {
  context.once.vivid ??= context.system.colours
    .filter((colour) => vivid(colour.hex))
    .sort((a, b) => b.weight - a.weight)
    .map((colour) => colour.hex);
  return context.once.vivid;
}

function clusterOf(system: CodeDesignSystem, hex: string): CodeColour | null {
  return (
    system.colours.find((colour) => colour.hex === hex || colour.variants?.includes(hex)) ?? null
  );
}

function colourSources(context: Context): ColourSource[] {
  const out: ColourSource[] = [];
  for (const token of context.tokens) {
    if (token.kind !== "colour" || !token.hex || token.scheme === "scoped") continue;
    const alpha = token.alpha ?? 1;
    out.push({
      token,
      hex: token.hex,
      alpha,
      value: cssColour(token.resolved, token.hex, alpha),
      repo: token.repo,
      words: nameWords(token.name),
      cluster: clusterOf(context.system, token.hex),
    });
  }
  // Colours only ever written out (Aurixa's gold ink, 102 times in its site's CSS).
  for (const colour of context.system.colours) {
    if (colour.declared || !colour.uses) continue;
    out.push({
      token: null,
      hex: colour.hex,
      alpha: 1,
      value: colour.hex,
      repo: colour.repos.includes(context.primary ?? "")
        ? context.primary!
        : (colour.repos[0] ?? ""),
      words: "",
      cluster: colour,
    });
  }
  return out;
}

function colourCandidate(
  key: ColourRoleKey,
  source: ColourSource,
  context: Context,
  roles: ProductionRoles,
): RoleCandidate {
  const score: Score = { points: 0, reasons: [] };
  COLOUR_RULES[key](source, context, roles, score);
  if (source.token) schemeFit(source.token, context, score);
  primaryFit(source.repo, context, score);
  const from: RoleSource = source.token
    ? tokenSource(source.token, context, source.value)
    : {
        token: "",
        repo: source.repo,
        path: "",
        line: null,
        scheme: "default",
        written: null,
        alsoIn: (source.cluster?.repos ?? []).filter((repo) => repo !== source.repo),
        uses: source.cluster?.uses ?? null,
      };
  if (!source.token && source.cluster?.uses)
    score.reasons.push(`written out ${source.cluster.uses}× and never a token`);
  return {
    value: {
      kind: "colour",
      value: source.value,
      hex: source.hex,
      alpha: source.alpha,
      from,
      why: null,
    },
    why: sentence(score.reasons),
    score: Math.round(score.points * 100) / 100,
  };
}

/* Type --------------------------------------------------------------- */

const SERIF =
  /serif|playfair|garamond|times|georgia|merriweather|lora|baskerville|caslon|didot|bodoni|cormorant|libre|fraunces|dm serif|crimson|spectral/i;

function typeCandidates(
  key: TypeRoleKey,
  context: Context,
  roles: ProductionRoles,
): RoleCandidate[] {
  const { system } = context;
  if (key === "display-italic") {
    const display = roles.display?.kind === "type" ? roles.display : null;
    if (!display) return [];
    return [
      {
        value: { ...display, italic: true, why: null },
        why: `The display face's italic (${display.family}).`,
        score: PROPOSE_AT,
      },
    ];
  }
  if (key === "eyebrow") {
    const face = roles.mono?.kind === "type" ? roles.mono : null;
    if (!face) return [];
    return [
      {
        value: {
          ...face,
          italic: false,
          uppercase: false,
          letterSpacing: null,
          weight: null,
          why: null,
        },
        why: "No eyebrow style is a token: set in the mono face. Give it the brand's tracking and case.",
        score: PROPOSE_AT,
      },
    ];
  }
  const want: Record<"display" | "body" | "mono", { roles: Record<string, number>; name: RegExp }> =
    {
      display: {
        roles: { display: 3, heading: 2.5 },
        name: /\b(?:display|heading|headline|title|serif)\b/,
      },
      body: { roles: { body: 3 }, name: /\b(?:sans|body|base|text|ui|copy)\b/ },
      mono: { roles: { mono: 3 }, name: /\b(?:mono|code)\b/ },
    };
  const rule = want[key];
  const out: RoleCandidate[] = [];
  for (const font of system.fonts) {
    const score: Score = { points: 0, reasons: [] };
    for (const role of font.roles) {
      const points = rule.roles[role];
      if (points)
        add(score, points, `set as the ${role === "heading" ? "headings'" : `${role}`} face`);
    }
    if (key === "display" && SERIF.test(font.family)) add(score, 0.5);
    if (key === "body" && font.roles.includes("display")) add(score, -2);
    if (key === "mono" && !font.roles.includes("mono") && !/mono|code/i.test(font.family))
      add(score, -10);
    if (font.repos.includes(context.primary ?? "")) add(score, 1.5, "in the brand's own source");
    if (font.repos.length > 1)
      add(score, 0.5 * (font.repos.length - 1), `in ${font.repos.length} repositories`);
    if (font.loaded.length) add(score, 0.5, `loaded ${loadingWords(font.loaded)}`);
    // The token that sets it, for where it is declared and the stack it is set with.
    const token = context.tokens
      .filter(
        (entry) =>
          entry.kind === "font" &&
          fontStackFamily(entry.resolved)?.toLowerCase() === font.family.toLowerCase() &&
          entry.scheme !== "scoped",
      )
      .sort(
        (a, b) =>
          Number(rule.name.test(nameWords(b.name))) - Number(rule.name.test(nameWords(a.name))) ||
          Number(b.repo === context.primary) - Number(a.repo === context.primary),
      )[0];
    if (token && rule.name.test(nameWords(token.name))) add(score, 1, `declared as ${token.name}`);
    const stack =
      token &&
      safeCssValue(token.resolved, PRODUCTION_LIMITS.stack) &&
      !token.resolved.includes("var(")
        ? token.resolved.replace(/\s+/g, " ").trim()
        : `"${font.family}", ${key === "mono" ? "ui-monospace, monospace" : SERIF.test(font.family) ? "serif" : "sans-serif"}`;
    const where = font.sources[0];
    const from: RoleSource | null = token
      ? tokenSource(token, context, stack)
      : where
        ? {
            token: "",
            repo: where.repo,
            path: where.path,
            line: where.line,
            scheme: "default",
            written: null,
            alsoIn: font.repos.filter((repo) => repo !== where.repo),
            uses: null,
          }
        : null;
    out.push({
      value: {
        kind: "type",
        family: font.family,
        stack,
        weight: null,
        italic: false,
        letterSpacing: null,
        uppercase: false,
        loaded: [...font.loaded],
        from,
        why: null,
      },
      why: sentence(score.reasons),
      score: Math.round(score.points * 100) / 100,
    });
  }
  return out;
}

export function loadingWords(loaded: readonly FontLoading[]): string {
  const words = loaded.map((how) =>
    how === "google"
      ? "from Google Fonts"
      : how === "fontsource"
        ? "as an @fontsource package"
        : how === "font-face"
          ? "from its own font files"
          : how === "adobe"
            ? "from Adobe Fonts"
            : "as a package",
  );
  return words.join(" and ");
}

/* Corners, shadows and blur ------------------------------------------ */

/** A length in pixels (rem and em as 16px); null for anything else. */
function pixels(value: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * (match[2] === "rem" || match[2] === "em" ? 16 : 1);
}

/** A shadow's largest blur, in pixels. */
function shadowBlur(value: string): number {
  let largest = 0;
  for (const layer of value.split(/,(?![^(]*\))/)) {
    const lengths = layer
      .replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)|#[0-9a-f]{3,8}/gi, " ")
      .trim()
      .split(/\s+/)
      .map((part) => pixels(part))
      .filter((length): length is number => length !== null);
    if (lengths[2] !== undefined) largest = Math.max(largest, lengths[2]);
  }
  return largest;
}

type ScaleKey =
  | "radius-window"
  | "radius-card"
  | "shadow-window"
  | "shadow-lift"
  | "blur-glass"
  | "blur-backdrop";

const SCALE_RULES: Record<
  ScaleKey,
  {
    scale: "radius" | "shadow" | "blur";
    names: Rule[];
    value: (value: string, score: Score) => void;
  }
> = {
  "radius-window": {
    scale: "radius",
    names: [
      {
        test: /\b(?:window|panel|dialog|modal|sheet)\b/,
        points: 3,
        why: "named for a window or panel",
      },
      { test: /\bxl$/, points: 3, why: "the scale's xl step" },
      { test: /\b2xl$/, points: 2 },
      { test: /\blg$/, points: 1 },
      { test: /\b(?:full|pill|round|circle)\b/, points: -10 },
    ],
    value: (value, score) => {
      const px = pixels(value);
      if (px === null || px <= 0 || px >= 999) return add(score, -10);
      if (px >= 12 && px <= 32) add(score, 1.5, `${value} (${px}px)`);
      else if (px > 8) add(score, 0.5);
    },
  },
  "radius-card": {
    scale: "radius",
    names: [
      { test: /\b(?:card|tile|chip)\b/, points: 3, why: "named for a card" },
      { test: /\blg$/, points: 3, why: "the scale's lg step" },
      { test: /\bmd$/, points: 2 },
      { test: /^(?:radius|border radius|rounded)(?: default)?$/, points: 1.5 },
      { test: /\b(?:full|pill|round|circle)\b/, points: -10 },
    ],
    value: (value, score) => {
      const px = pixels(value);
      if (px === null || px <= 0 || px >= 999) return add(score, -10);
      if (px >= 6 && px <= 16) add(score, 1.5, `${value} (${px}px)`);
    },
  },
  "shadow-window": {
    scale: "shadow",
    names: [
      {
        test: /\b(?:window|glass|dialog|modal|overlay|popover)\b/,
        points: 1.5,
        why: "named for a window or glass",
      },
      { test: /\b(?:lg|xl|2xl)$/, points: 2, why: "a large step of the scale" },
      { test: /\belevation (?:4|5|6)$/, points: 1 },
      { test: /\b(?:inner|inset|glow|ring|focus|text)\b/, points: -10 },
    ],
    value: (value, score) => {
      const blur = shadowBlur(value);
      if (/\binset\b/.test(value)) return add(score, -10);
      if (blur >= 40) add(score, 1, `a deep shadow (${blur}px blur)`);
      else if (blur < 8) add(score, -2);
    },
  },
  "shadow-lift": {
    scale: "shadow",
    names: [
      {
        test: /\b(?:elevation|card|lift|raised|float\w*|document)\b/,
        points: 2.5,
        why: "named for something that lifts",
      },
      { test: /\bmd$/, points: 1 },
      { test: /\b(?:inner|inset|glow|ring|focus|text)\b/, points: -10 },
    ],
    value: (value, score) => {
      const blur = shadowBlur(value);
      if (/\binset\b/.test(value)) return add(score, -10);
      if (blur >= 16 && blur <= 64) add(score, 1, `${blur}px of blur`);
    },
  },
  "blur-glass": {
    scale: "blur",
    names: [
      { test: /\bglass\b/, points: 1.5, why: "named for glass" },
      {
        test: /\b(?:glass|backdrop) blur$|^blur$|\bblur (?:md|default)$/,
        points: 1,
        why: "the scale's plain step",
      },
      { test: /\b(?:xs|sm|lg|xl|2xl|3xl)$/, points: -0.5 },
    ],
    value: (value, score) => {
      const px = pixels(value);
      if (px === null || px <= 0) return add(score, -10);
      if (px >= 8 && px <= 24) add(score, 1, value);
    },
  },
  "blur-backdrop": {
    scale: "blur",
    names: [
      { test: /\b(?:lg|xl|2xl|3xl|heavy|strong)$/, points: 2.5, why: "the scale's heavy step" },
      { test: /\bbackdrop\b/, points: 0.5 },
    ],
    value: (value, score) => {
      const px = pixels(value);
      if (px === null || px <= 0) return add(score, -10);
      if (px >= 24) add(score, 1.5, `a heavy blur (${value})`);
    },
  },
};

function scaleCandidates(key: ScaleKey, context: Context): RoleCandidate[] {
  const rule = SCALE_RULES[key];
  return context.system.scales[rule.scale]
    .filter((token) => token.scheme !== "scoped")
    .map((token) => {
      const value = token.resolved.replace(/\s+/g, " ").trim();
      const score: Score = { points: 0, reasons: [] };
      byName(nameWords(token.name), rule.names, score);
      if (value.includes("var(") || !safeCssValue(value)) add(score, -10);
      else rule.value(value, score);
      schemeFit(token, context, score);
      primaryFit(token.repo, context, score);
      if (token.alsoIn?.length)
        add(score, 0.25, `the same in ${token.alsoIn.map(shortRepo).join(", ")}`);
      return {
        value: {
          kind: rule.scale,
          value,
          from: scaleSource(token, value),
          why: null,
        } satisfies ScaleRole,
        why: sentence(score.reasons),
        score: Math.round(score.points * 100) / 100,
      };
    });
}

/* Motion ------------------------------------------------------------- */

interface MotionToken {
  token: ScaleToken;
  words: string;
  ease: CubicBezier | null;
  durationMs: number | null;
}

/** The step of a duration scale a name says: fast, base or slow. */
function durationStep(words: string): "fast" | "base" | "slow" | null {
  if (/\b(?:fast|quick|short|xs|sm|snappy|instant)\b/.test(words)) return "fast";
  if (/\b(?:base|normal|medium|default|md|moderate|standard)\b/.test(words)) return "base";
  if (/\b(?:slow|long|lg|xl|gentle|relaxed)\b/.test(words)) return "slow";
  return null;
}

/** An ease-out (`--motion-ease-out`) and an ease-in (`--ease-in`), never the ease-in-out between them. */
const easesOut = (words: string) => /\bout$/.test(words) && !/\bin out$/.test(words);
const easesIn = (words: string) => /\bin$/.test(words);

const EASE_NAMES: Record<MotionRoleKey, { test: (words: string) => boolean; why: string }> = {
  move: {
    test: (words) => /\b(?:emphasi[sz]ed|standard|move|travel)\b|\bin out$/.test(words),
    why: "named for moving",
  },
  settle: {
    test: (words) => easesOut(words) || /\b(?:decelerat\w*|settle\w*|arriv\w*)\b/.test(words),
    why: "named for arriving (an ease-out)",
  },
  enter: {
    test: (words) => /\b(?:enter\w*|entrance|appear\w*|incoming)\b/.test(words),
    why: "named for coming in",
  },
  exit: {
    test: (words) => easesIn(words) || /\b(?:exit\w*|leav\w*|outgoing|accelerat\w*)\b/.test(words),
    why: "named for going (an ease-in)",
  },
  press: {
    test: (words) => /\b(?:press|tap|active|click|spring)\b/.test(words),
    why: "named for a press",
  },
};

const DURATION_NAMES: Record<
  MotionRoleKey,
  { test: RegExp; why: string; step: ("fast" | "base" | "slow")[]; stepWhy: string }
> = {
  move: { test: /\b(?:move|travel)\b/, why: "named for moving", step: [], stepWhy: "" },
  settle: { test: /\bsettle/, why: "named for settling", step: [], stepWhy: "" },
  enter: {
    test: /\b(?:enter|entrance|appear)\b/,
    why: "named for coming in",
    step: ["slow", "base"],
    stepWhy: "the scale's slower step: a title is large, and comes in unhurried",
  },
  exit: {
    test: /\b(?:exit|leave|dismiss)\b/,
    why: "named for going",
    step: ["base", "fast"],
    stepWhy: "a step quicker than coming in: going takes less time",
  },
  press: {
    test: /\b(?:press|tap|active|click)\b/,
    why: "named for a press",
    step: ["slow", "base"],
    stepWhy: "the control scale's slowest step: a press and its ring live this long",
  },
};

function motionTokens(context: Context): MotionToken[] {
  return context.system.scales.motion
    .filter((token) => token.scheme !== "scoped")
    .map((token) => ({ token, words: nameWords(token.name), ...motionParts(token.resolved) }))
    .filter((entry) => entry.ease || entry.durationMs !== null);
}

function motionCandidates(
  key: MotionRoleKey,
  context: Context,
  roles: ProductionRoles,
): RoleCandidate[] {
  const tokens = motionTokens(context);
  // The curve.
  const curves = tokens
    .filter((entry) => entry.ease)
    .map((entry) => {
      const score: Score = { points: 0, reasons: [] };
      if (EASE_NAMES[key].test(entry.words)) add(score, 3, EASE_NAMES[key].why);
      primaryFit(entry.token.repo, context, score);
      if (entry.token.alsoIn?.length)
        add(score, 0.25, `the same in ${entry.token.alsoIn.map(shortRepo).join(", ")}`);
      return { entry, score };
    })
    .sort((a, b) => b.score.points - a.score.points);
  let ease: CubicBezier | null = null;
  let easeFrom: RoleSource | null = null;
  const reasons: string[] = [];
  const named = curves[0] && curves[0].score.points >= PROPOSE_AT ? curves[0] : null;
  if (named) {
    ease = named.entry.ease;
    easeFrom = scaleSource(named.entry.token, formatCubicBezier(named.entry.ease!));
    reasons.push(`its curve ${named.score.reasons.join(", ")}`);
  } else {
    // A role the code doesn't name takes the curve of the one it moves like.
    const like: MotionRoleKey | null =
      key === "enter" || key === "press" ? "settle" : key === "exit" ? "move" : null;
    const borrowed = like ? roles[like] : undefined;
    if (borrowed?.kind === "motion" && borrowed.ease) {
      ease = borrowed.ease;
      easeFrom = borrowed.from;
      reasons.push(
        key === "exit"
          ? "going on the move curve, as nothing is named for it"
          : `${key === "press" ? "a press settles" : "coming in settles"}: the settle curve, as nothing is named for it`,
      );
    }
  }
  // The duration.
  const rule = DURATION_NAMES[key];
  const durations = tokens.filter((entry) => entry.durationMs !== null);
  let duration: MotionToken | null = durations.find((entry) => rule.test.test(entry.words)) ?? null;
  if (duration) reasons.push(`its duration ${rule.why}`);
  else
    for (const step of rule.step) {
      const found = durations
        .filter((entry) => durationStep(entry.words) === step)
        .sort(
          (a, b) =>
            Number(b.token.repo === context.primary) - Number(a.token.repo === context.primary),
        )[0];
      if (found) {
        duration = found;
        reasons.push(`its duration ${rule.stepWhy}`);
        break;
      }
    }
  if (!ease && !duration) return [];
  const durationMs = duration?.durationMs ?? null;
  const durationFrom = duration ? scaleSource(duration.token, formatDuration(durationMs!)) : null;
  // Half a role is still proposed: the checks say what it lacks.
  return [
    {
      value: {
        kind: "motion",
        ease,
        durationMs,
        // The curve's source leads; a role with only a duration is declared where the duration is.
        from: easeFrom ?? durationFrom,
        durationFrom: easeFrom ? durationFrom : null,
        why: null,
      },
      why: sentence(reasons),
      score: PROPOSE_AT,
    },
  ];
}

/* The proposal ------------------------------------------------------- */

const COLOUR_ORDER: ColourRoleKey[] = [
  "ground",
  "signature",
  "surface",
  "raised",
  "glass",
  "ink",
  "ink-muted",
  "accent",
  "line",
  "selection",
  "danger",
];

/**
 * Every role proposed from a design system read from code (an import's
 * `code`, see ./scan-code): from its tokens' names (`--color-base-950` is a
 * ground, `--motion-ease-out` a settle), their values (a ground is near black
 * in a dark brand, glass is translucent, ink reads on the ground) and how much
 * the code uses them, the brand's own repository first. Each comes with the
 * evidence and the other candidates. The disagreements between repositories
 * are listed to be decided, the brand's own value chosen to begin with but
 * none of them written up: that is a person's.
 */
export function proposeProduction(
  system: CodeDesignSystem,
  options: { importId?: string | null } = {},
): ProductionProposal {
  const scheme = productionScheme(system);
  const tokens = system.tokens.filter(
    (token) => typeof token?.name === "string" && typeof token.resolved === "string",
  );
  const byName = new Map<string, Token[]>();
  for (const token of tokens) byName.set(token.name, [...(byName.get(token.name) ?? []), token]);
  const context: Context = {
    system,
    scheme,
    primary: system.primary,
    repoSchemes: new Map(system.repos.map((repo) => [repo.label, repo.defaultScheme])),
    tokens,
    byName,
    once: {},
  };
  const roles: ProductionRoles = {};
  const candidates: ProductionProposal["candidates"] = {};
  const keep = (key: ProductionRoleKey, list: RoleCandidate[]) => {
    const best = ranked(list);
    candidates[key] = best;
    const first = best[0];
    if (first && first.score >= PROPOSE_AT) roles[key] = { ...first.value, why: first.why || null };
  };

  const colours = colourSources(context);
  for (const key of COLOUR_ORDER)
    keep(
      key,
      colours.map((source) => colourCandidate(key, source, context, roles)),
    );
  for (const key of ["display", "body", "mono", "display-italic", "eyebrow"] as const)
    keep(key, typeCandidates(key, context, roles));
  for (const key of Object.keys(SCALE_RULES) as ScaleKey[])
    keep(key, scaleCandidates(key, context));
  // Window and card corners are different things: a card whose corners are the window's says so.
  const windowCorners = roles["radius-window"];
  const cardCorners = roles["radius-card"];
  if (
    windowCorners?.kind === "radius" &&
    cardCorners?.kind === "radius" &&
    windowCorners.value === cardCorners.value
  ) {
    const other = candidates["radius-card"]?.find(
      (candidate) =>
        candidate.value.kind === "radius" &&
        candidate.value.value !== windowCorners.value &&
        candidate.score >= PROPOSE_AT,
    );
    if (other) roles["radius-card"] = { ...other.value, why: other.why || null };
  }
  for (const key of MOTION_ROLE_KEYS) keep(key, motionCandidates(key, context, roles));

  const decisions: ProductionDecision[] = system.conflicts
    .slice(0, PRODUCTION_LIMITS.decisions)
    .map((conflict) => {
      const own = conflict.values.find((value) => value.repos.includes(system.primary ?? ""));
      const most = [...conflict.values].sort((a, b) => b.repos.length - a.repos.length)[0];
      return {
        token: conflict.name,
        scheme: conflict.scheme,
        values: conflict.values.slice(0, 6).map((value) => ({
          value: clip(value.value, 200) ?? "",
          hex: value.hex,
          repos: value.repos,
        })),
        chosen: clip((own ?? most)?.value, 200),
        note: "",
      };
    });

  return {
    production: {
      scheme,
      roles,
      decisions,
      read: system.repos
        .slice(0, PRODUCTION_LIMITS.read)
        .map((repo) => ({ repo: repo.label, sha: repo.sha })),
      importId: options.importId ?? null,
    },
    candidates,
  };
}

/**
 * A production read again from code, keeping what a person did: the roles
 * they set by hand and the notes they wrote on the disagreements that remain.
 */
export function reproposeProduction(
  previous: BrandProduction,
  next: BrandProduction,
): BrandProduction {
  const roles: ProductionRoles = { ...next.roles };
  for (const spec of PRODUCTION_ROLES) {
    const role = previous.roles[spec.key];
    if (role && !role.from) roles[spec.key] = role;
  }
  const decisions = next.decisions.map((decision) => {
    const before = previous.decisions.find(
      (entry) => entry.token === decision.token && entry.scheme === decision.scheme,
    );
    return before?.note
      ? { ...decision, chosen: before.chosen ?? decision.chosen, note: before.note }
      : decision;
  });
  return { ...next, roles, decisions };
}

/* ------------------------------------------------------------------ */
/* Changed by a person                                                 */
/* ------------------------------------------------------------------ */

/** The production with one role set (by a person, or to a candidate), or cleared with null. */
export function withRole(
  production: BrandProduction,
  key: ProductionRoleKey,
  value: RoleValue | null,
): BrandProduction {
  const roles = { ...production.roles };
  if (value) roles[key] = value;
  else delete roles[key];
  return { ...production, roles };
}

/** A colour a person typed, as a role: any CSS colour; null when it isn't one. */
export function colourByHand(text: string, why: string | null = null): ColourRole | null {
  const value = safeCssValue(text);
  const parsed = value ? parseCssColour(value) : null;
  if (!value || !parsed) return null;
  return { kind: "colour", value, hex: parsed.hex, alpha: parsed.alpha, from: null, why };
}

/** A typeface a person named, as a role; null when the name can't be a typeface's. */
export function typeByHand(
  family: string,
  base: Partial<
    Pick<TypeRole, "weight" | "italic" | "letterSpacing" | "uppercase" | "loaded">
  > = {},
): TypeRole | null {
  const name = family.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  if (!name || name.length > PRODUCTION_LIMITS.family || !/^[\p{L}\p{N} ._'&+-]+$/u.test(name))
    return null;
  return {
    kind: "type",
    family: name,
    stack: `"${name}", ${SERIF.test(name) ? "serif" : /mono|code/i.test(name) ? "ui-monospace, monospace" : "sans-serif"}`,
    weight: base.weight ?? null,
    italic: base.italic ?? false,
    letterSpacing: base.letterSpacing ?? null,
    uppercase: base.uppercase ?? false,
    loaded: base.loaded ?? [],
    from: null,
    why: null,
  };
}

/** A length or shadow a person typed, as a role; null when CSS couldn't take it here. */
export function scaleByHand(kind: ScaleRole["kind"], text: string): ScaleRole | null {
  const value = safeCssValue(text);
  if (!value) return null;
  if (kind !== "shadow" && pixels(value) === null) return null;
  return { kind, value, from: null, why: null };
}

/** A curve and a duration a person set, as a role (either may be left out). */
export function motionByHand(
  ease: string | CubicBezier | null,
  durationMs: number | null,
): MotionRole | null {
  const curve =
    typeof ease === "string" ? parseCubicBezier(ease) : ease ? cubicBezierOf(ease) : null;
  const duration =
    durationMs !== null &&
    Number.isFinite(durationMs) &&
    durationMs >= 0 &&
    durationMs <= MAX_DURATION_MS
      ? Math.round(durationMs)
      : null;
  if (!curve && duration === null) return null;
  return {
    kind: "motion",
    ease: curve,
    durationMs: duration,
    from: null,
    durationFrom: null,
    why: null,
  };
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

export type ContrastLevel = "AAA" | "AA" | "AA large" | "fails";

export interface ContrastCheck {
  text: ColourRoleKey;
  on: ColourRoleKey;
  ratio: number;
  level: ContrastLevel;
  /** One of the two pairs a production must pass (ink on the ground and on the surface). */
  required: boolean;
}

export interface FaceCheck {
  role: TypeRoleKey;
  family: string;
  loaded: boolean;
  /** How it is loaded, or what to do about it. */
  detail: string;
}

export interface ProductionCheck {
  key: "roles" | "contrast" | "faces" | "decisions";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ProductionChecks {
  ok: boolean;
  roles: {
    filled: number;
    total: number;
    missing: ProductionRoleKey[];
    unused: ProductionRoleKey[];
  };
  contrast: ContrastCheck[];
  faces: FaceCheck[];
  decisions: { decided: number; total: number; open: string[] };
  /** The four checks in words, for the page and the stylesheet's header. */
  list: ProductionCheck[];
}

/** WCAG's levels for text: AAA at 7:1, AA at 4.5:1, large text at 3:1. */
export function contrastLevel(ratio: number): ContrastLevel {
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fails";
}

/** Whether a role has what it needs to be drawn with. */
export function roleFilled(key: ProductionRoleKey, role: RoleValue | undefined): boolean {
  if (!role) return false;
  if (role.kind !== "motion") return true;
  return MOTION_NEEDS[key as MotionRoleKey].every((need) =>
    need === "ease" ? !!role.ease : role.durationMs !== null,
  );
}

const SYSTEM_FACES =
  /^(?:system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|sans-serif|serif|monospace|cursive|fantasy|-apple-system|blinkmacsystemfont|segoe ui|helvetica|arial)$/i;

/**
 * A production's checks: every role a production needs is filled; the ink
 * reads on the ground and on the surface (WCAG AA, 4.5:1); each face is
 * loaded by the brand's code or the kit has its file; and every value the
 * repositories disagree on is decided, with a note saying why.
 */
export function productionChecks(
  production: BrandProduction,
  options: { fonts?: readonly { family: string }[] } = {},
): ProductionChecks {
  const { roles } = production;
  const missing: ProductionRoleKey[] = [];
  const unused: ProductionRoleKey[] = [];
  let filled = 0;
  for (const spec of PRODUCTION_ROLES) {
    if (roleFilled(spec.key, roles[spec.key])) filled += 1;
    else if (spec.required) missing.push(spec.key);
    else unused.push(spec.key);
  }

  const colour = (key: ColourRoleKey) => {
    const role = roles[key];
    return role?.kind === "colour" ? role : null;
  };
  const ground = colour("ground");
  const contrast: ContrastCheck[] = [];
  const pairs: [ColourRoleKey, ColourRoleKey, boolean][] = [
    ["ink", "ground", true],
    ["ink", "surface", true],
    ["ink", "raised", false],
    ["ink", "glass", false],
    ["ink-muted", "ground", false],
  ];
  for (const [text, on, required] of pairs) {
    const fore = colour(text);
    const back = colour(on);
    if (!fore || !back) continue;
    // Something translucent is seen over the ground; text over what it is set on.
    const behind = back.alpha < 1 && ground && on !== "ground" ? over(back, ground.hex) : back.hex;
    const ratio = Math.round(contrastRatio(over(fore, behind), behind) * 100) / 100;
    contrast.push({ text, on, ratio, level: contrastLevel(ratio), required });
  }

  const kitFamilies = new Set((options.fonts ?? []).map((font) => font.family.toLowerCase()));
  const faces: FaceCheck[] = [];
  for (const key of ["display", "display-italic", "body", "mono", "eyebrow"] as const) {
    const role = roles[key];
    if (role?.kind !== "type") continue;
    const own = kitFamilies.has(role.family.toLowerCase());
    const system = SYSTEM_FACES.test(role.family);
    const loaded = (role.loaded.length > 0 && !role.loaded.every((how) => how === "adobe")) || own;
    faces.push({
      role: key,
      family: role.family,
      loaded: loaded && !system,
      detail: system
        ? "A system face, which differs from machine to machine: name the face it should be, and upload its file."
        : own
          ? "The kit has its file."
          : loaded
            ? `Loaded by the brand's code ${loadingWords(role.loaded)}.`
            : "Not loaded by the code read: upload its file to the kit, or choose a Google font.",
    });
  }

  const conflicts = production.decisions;
  const open = conflicts
    .filter((decision) => decision.chosen === null || decision.note.trim().length < 3)
    .map((decision) => decision.token);
  const decided = conflicts.length - open.length;

  const label = (key: ProductionRoleKey) => roleSpec(key).label.toLowerCase();
  const required = contrast.filter((check) => check.required);
  const contrastOk = required.length === 2 && required.every((check) => check.ratio >= 4.5);
  const list: ProductionCheck[] = [
    {
      key: "roles",
      label: "Every role filled",
      ok: missing.length === 0,
      detail: missing.length
        ? `${missing.length} still to fill: ${missing.map(label).join(", ")}.`
        : `${filled} of ${PRODUCTION_ROLES.length} roles${unused.length ? `; not used: ${unused.map(label).join(", ")}` : ""}.`,
    },
    {
      key: "contrast",
      label: "Ink reads on the ground and the surface",
      ok: contrastOk,
      detail: required.length
        ? required
            .map(
              (check) =>
                `${label(check.text)} on ${label(check.on)} ${check.ratio.toFixed(2)}:1 (${check.level})`,
            )
            .join(", ")
        : "Fill the ink, the ground and the surface to measure it.",
    },
    {
      key: "faces",
      label: "Each face loaded",
      ok: faces.length > 0 && faces.every((face) => face.loaded),
      detail: faces.length
        ? faces.every((face) => face.loaded)
          ? `${faces
              .map((face) => face.family)
              .filter((family, index, all) => all.indexOf(family) === index)
              .join(", ")}.`
          : faces
              .filter((face) => !face.loaded)
              .map((face) => `${face.family} (${label(face.role)}): ${face.detail}`)
              .join(" ")
        : "No typeface yet.",
    },
    {
      key: "decisions",
      label: "Every disagreement decided in writing",
      ok: open.length === 0,
      detail: conflicts.length
        ? open.length
          ? `${decided} of ${conflicts.length} decided; still to write: ${open.slice(0, 6).join(", ")}${open.length > 6 ? "…" : ""}.`
          : conflicts.length === 1
            ? "Decided."
            : `All ${conflicts.length} decided.`
        : "The repositories agree.",
    },
  ];
  return {
    ok: list.every((check) => check.ok),
    roles: { filled, total: PRODUCTION_ROLES.length, missing, unused },
    contrast,
    faces,
    decisions: { decided, total: conflicts.length, open },
    list,
  };
}

/* ------------------------------------------------------------------ */
/* The stylesheet                                                      */
/* ------------------------------------------------------------------ */

/** What a stylesheet is written from: a brand kit has it all. */
export interface ProductionKit {
  name: string;
  production: BrandProduction;
  /** The kit's own font files (for the faces check). */
  fonts?: readonly { family: string }[];
}

export interface ProductionProperty {
  /** The custom property: `--brand-ground`. */
  name: string;
  value: string;
  /** Where it is declared, in words. */
  note: string;
}

const comment = (text: string) => text.replace(/\*\//g, "* /").replace(/\s+/g, " ").trim();
const schemeNote = (scheme: TokenScheme) =>
  scheme === "dark"
    ? " (dark)"
    : scheme === "light"
      ? " (light)"
      : scheme === "scoped"
        ? " (scoped)"
        : "";

/** Where a role's value is declared, as the stylesheet's comment says it. */
export function sourceNote(source: RoleSource | null, why?: string | null): string {
  if (!source) return why ? `set by hand: ${why}` : "set by hand";
  if (!source.token)
    return `written out ${source.uses ?? "many"}× in ${shortRepo(source.repo)}${source.path ? ` ${source.path}` : ""}, never a token`;
  const at = `${shortRepo(source.repo)} ${source.path}${source.line ? `:${source.line}` : ""}`;
  return [
    `${source.token}${schemeNote(source.scheme)} · ${at}`,
    source.alsoIn.length ? `the same in ${source.alsoIn.map(shortRepo).join(", ")}` : null,
    source.written ? `written ${source.written}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/** The custom properties a role is written as. */
export function roleProperties(key: ProductionRoleKey, role: RoleValue): ProductionProperty[] {
  const name = `--brand-${key}`;
  const note = sourceNote(role.from, role.why && !role.from ? role.why : null);
  switch (role.kind) {
    case "colour":
    case "radius":
    case "shadow":
    case "blur":
      return [{ name, value: role.value, note }];
    case "type":
      return [
        { name, value: role.stack, note },
        ...(role.weight ? [{ name: `${name}-weight`, value: String(role.weight), note: "" }] : []),
        ...(role.italic ? [{ name: `${name}-style`, value: "italic", note: "" }] : []),
        ...(role.letterSpacing
          ? [{ name: `${name}-letter-spacing`, value: role.letterSpacing, note: "" }]
          : []),
        ...(role.uppercase
          ? [{ name: `${name}-text-transform`, value: "uppercase", note: "" }]
          : []),
      ];
    case "motion":
      return [
        ...(role.ease
          ? [{ name: `--brand-ease-${key}`, value: formatCubicBezier(role.ease), note }]
          : []),
        ...(role.durationMs !== null
          ? [
              {
                name: `--brand-duration-${key}`,
                value: formatDuration(role.durationMs),
                note: role.ease ? sourceNote(role.durationFrom ?? role.from, null) : note,
              },
            ]
          : []),
      ];
  }
}

function headerLines(kit: ProductionKit, checks: ProductionChecks, generatedAt?: string): string[] {
  const { production } = kit;
  const lines = [` * ${comment(kit.name)} · production stylesheet`, " *"];
  if (production.read.length)
    lines.push(
      " * The brand's production roles, read with Xeno Studio's code scanner",
      " * (src/lib/brand/scan-code.ts) from the code of:",
      ...production.read.map(
        (read) => ` *   ${read.repo}${read.sha ? ` @ ${read.sha.slice(0, 12)}` : ""}`,
      ),
    );
  else lines.push(" * The brand's production roles, set in Xeno Studio.");
  lines.push(
    " * Each value names the repository, file and line it is declared on; one set by hand says so.",
    ` * ${checks.roles.filled} of ${checks.roles.total} roles filled.${generatedAt ? ` Written ${generatedAt}.` : ""}`,
  );
  for (const check of checks.list)
    lines.push(
      ` * ${check.ok ? "Checked" : "Not yet"}: ${comment(check.label.toLowerCase())}. ${comment(check.detail)}`,
    );
  if (production.decisions.length) {
    lines.push(" *", " * Where the repositories disagree, and what production uses:");
    for (const decision of production.decisions) {
      const others = decision.values
        .map((value) => `${value.hex ?? value.value} in ${value.repos.map(shortRepo).join(", ")}`)
        .join("; ");
      lines.push(
        ` *   ${decision.token}${schemeNote(decision.scheme)}: ${comment(decision.chosen ?? "none of them")} (${comment(others)}).${decision.note ? ` ${comment(decision.note)}` : " Not yet decided."}`,
      );
    }
  }
  return lines;
}

/**
 * The production roles as one stylesheet: a custom property for every role
 * filled (`--brand-ground`, `--brand-display`, `--brand-ease-move`), each
 * with a comment naming the repository, file and line it is declared on (as
 * Reel 1's aurixa-reel.css does), the checks and the decisions in its header.
 * The same kit always writes the same stylesheet.
 */
export function productionStylesheet(
  kit: ProductionKit,
  options: { generatedAt?: string } = {},
): string {
  const checks = productionChecks(kit.production, { fonts: kit.fonts ?? [] });
  const lines = ["/*", ...headerLines(kit, checks, options.generatedAt), " */", "", ":root {"];
  for (const spec of PRODUCTION_ROLES) {
    const role = kit.production.roles[spec.key];
    if (!role) continue;
    const properties = roleProperties(spec.key, role);
    if (!properties.length) continue;
    lines.push(`  /* ${spec.key} */`);
    for (const property of properties)
      lines.push(
        `  ${property.name}: ${property.value};${property.note ? ` /* ${comment(property.note)} */` : ""}`,
      );
  }
  lines.push("}", "");
  return lines.join("\n");
}

/** The production as JSON: the same properties, each role with its value and source, the checks and decisions. */
export function productionTokens(kit: ProductionKit) {
  const { production } = kit;
  const properties: Record<string, string> = {};
  const roles = PRODUCTION_ROLES.flatMap((spec) => {
    const role = production.roles[spec.key];
    if (!role) return [];
    const written = roleProperties(spec.key, role);
    for (const property of written) properties[property.name] = property.value;
    return [
      {
        key: spec.key,
        kind: spec.kind,
        label: spec.label,
        about: spec.about,
        properties: written,
        value: role,
      },
    ];
  });
  return {
    brand: kit.name,
    scheme: production.scheme,
    read: production.read,
    properties,
    roles,
    decisions: production.decisions,
    checks: productionChecks(production, { fonts: kit.fonts ?? [] }),
  };
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

export type BrandMotion = Record<
  MotionRoleKey,
  { ease: CubicBezier | null; durationMs: number | null }
>;

/** The brand's motion roles as curves and durations (each null where the kit has none). */
export function brandMotion(production: BrandProduction): BrandMotion {
  const entry = (key: MotionRoleKey) => {
    const role = production.roles[key];
    return role?.kind === "motion"
      ? { ease: role.ease, durationMs: role.durationMs }
      : { ease: null, durationMs: null };
  };
  return {
    move: entry("move"),
    settle: entry("settle"),
    enter: entry("enter"),
    exit: entry("exit"),
    press: entry("press"),
  };
}
