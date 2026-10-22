/**
 * A brand's production roles proposed from its code (the roles, their checks
 * and the stylesheet are ./production). Each role is proposed from a design
 * system the code scanner read (./scan-code): from its tokens' names
 * (`--color-base-950` is a ground, `--motion-ease-out` a settle), their values
 * (a ground is near black in a dark brand, glass is translucent, ink reads on
 * the ground) and how much the code uses them, the brand's own repository and
 * theme first. Each comes with the evidence and the other candidates, for a
 * person to change on the Brand page.
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
} from "./colour";
import { formatCubicBezier, formatDuration, motionParts, type CubicBezier } from "./motion";
import {
  colourOver,
  cssPixels,
  loadingWords,
  MOTION_ROLE_KEYS,
  PRODUCTION_LIMITS,
  PRODUCTION_ROLES,
  safeCssValue,
  SERIF_FAMILY,
  shortRepo,
  type BrandProduction,
  type ColourRoleKey,
  type MotionRoleKey,
  type ProductionDecision,
  type ProductionRoleKey,
  type ProductionRoles,
  type RoleSource,
  type RoleValue,
  type ScaleRole,
  type TypeRoleKey,
} from "./production";
import type { CodeColour, CodeDesignSystem, CodeToken, ScaleToken } from "./scan-code";
import { fontStackFamily, type TokenScheme } from "./scan-css";
import { clip } from "./text";

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
      const ratio = contrastRatio(colourOver(source, ground), ground);
      const top = ink ? contrastRatio(colourOver(ink, ground), ground) : 21;
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
    if (ground && contrastRatio(colourOver(source, ground), ground) < 1.1) add(score, -2);
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
  const ratio = contrastRatio(colourOver(source, ground), ground);
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
    if (key === "display" && SERIF_FAMILY.test(font.family)) add(score, 0.5);
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
        : `"${font.family}", ${key === "mono" ? "ui-monospace, monospace" : SERIF_FAMILY.test(font.family) ? "serif" : "sans-serif"}`;
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

/* Corners, shadows and blur ------------------------------------------ */

/** A shadow's largest blur, in pixels. */
function shadowBlur(value: string): number {
  let largest = 0;
  for (const layer of value.split(/,(?![^(]*\))/)) {
    const lengths = layer
      .replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)|#[0-9a-f]{3,8}/gi, " ")
      .trim()
      .split(/\s+/)
      .map((part) => cssPixels(part))
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
      const px = cssPixels(value);
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
      const px = cssPixels(value);
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
      const px = cssPixels(value);
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
      const px = cssPixels(value);
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
