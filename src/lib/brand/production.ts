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
 * - proposeProduction (./production-proposal): each role proposed from a
 *   design system read from code, by its tokens' names, values and how much
 *   they are used, with the evidence and the other candidates, for a person
 *   to change.
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
import { contrastRatio, hexToRgb, parseCssColour, rgbToHex } from "./colour";
import { normalizeHex } from "./design";
import {
  cubicBezierOf,
  formatCubicBezier,
  formatDuration,
  MAX_DURATION_MS,
  parseCubicBezier,
  type CubicBezier,
} from "./motion";
import type { FontLoading } from "./scan-code";
import type { TokenScheme } from "./scan-css";
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
  /** A person picked it from the code's other candidates: reading the code again keeps it. */
  picked?: boolean;
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
  const base = {
    from: sourceOf(item["from"]),
    why: clip(item["why"], PRODUCTION_LIMITS.why),
    ...(item["picked"] === true ? { picked: true } : {}),
  };
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
/* Shared with the proposal (./production-proposal)                    */
/* ------------------------------------------------------------------ */

/** A repository by its own name alone: `aurixa-systems`. */
export const shortRepo = (repo: string) => repo.split("/")[1] ?? repo;

/** A colour seen through something translucent laid over it. */
export function colourOver(top: { hex: string; alpha: number }, bottom: string): string {
  const a = hexToRgb(top.hex) ?? { r: 0, g: 0, b: 0 };
  const b = hexToRgb(bottom) ?? { r: 0, g: 0, b: 0 };
  const mix = (x: number, y: number) => x * top.alpha + y * (1 - top.alpha);
  return rgbToHex({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) });
}

/** A length in pixels (rem and em as 16px); null for anything else. */
export function cssPixels(value: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * (match[2] === "rem" || match[2] === "em" ? 16 : 1);
}

/** Typefaces drawn with serifs, by name: a stack set in one falls back to serif. */
export const SERIF_FAMILY =
  /serif|playfair|garamond|times|georgia|merriweather|lora|baskerville|caslon|didot|bodoni|cormorant|libre|fraunces|dm serif|crimson|spectral/i;

/** How the brand's code loads a face, in words: `from Google Fonts`. */
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
    stack: `"${name}", ${SERIF_FAMILY.test(name) ? "serif" : /mono|code/i.test(name) ? "ui-monospace, monospace" : "sans-serif"}`,
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
  if (kind !== "shadow" && cssPixels(value) === null) return null;
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
    const behind =
      back.alpha < 1 && ground && on !== "ground" ? colourOver(back, ground.hex) : back.hex;
    const ratio = Math.round(contrastRatio(colourOver(fore, behind), behind) * 100) / 100;
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
