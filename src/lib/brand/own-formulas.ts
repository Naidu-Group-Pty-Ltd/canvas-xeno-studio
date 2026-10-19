/**
 * A brand's own formulas: proven formulas from the library (./formula-library)
 * written for one brand (its audiences, offers, proof, distinctive assets and
 * voice) by a person or the studio's AI, and kept on its kit (`formulas`).
 * They come first wherever the brand's content is planned (see ./formulas).
 *
 * Read tolerantly, like the DNA: whatever is stored (or an AI answered) is
 * cut to size and anything malformed is dropped. A formula keeps every
 * guardrail and source of the library formulas it was written from, and
 * never claims stronger evidence than they have.
 *
 * Shared by the server, the browser and tests.
 */
import { BRAND_TYPES, CHANNELS, FACES, GOALS, type BrandType } from "./dna";
import {
  formulaById,
  GUARDRAILS,
  SOURCES,
  type BrandFormula,
  type FormulaBeat,
  type Shape,
} from "./formulas";
import { clip, wordsOf } from "./text";

export const OWN_FORMULA_LIMITS = {
  formulas: 16,
  beats: 12,
  rules: 10,
  avoid: 8,
  basedOn: 3,
  seconds: { least: 3, most: 900 },
} as const;

const SHAPES: readonly Shape[] = ["9:16", "1:1", "4:5", "16:9"];
const PURPOSES: readonly BrandFormula["purpose"][] = ["brand", "activation", "both"];
const GRADES: readonly BrandFormula["grade"][] = ["A", "B", "C"];

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;

function someOf<T extends string>(values: readonly T[], value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    const known = oneOf(values, entry);
    if (known && !out.includes(known)) out.push(known);
  }
  return out;
}

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** "Pain → product proof" → "pain-product-proof". */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * `stem` if it's free, else `stem-2`, `stem-3`… (cut short first so the
 * number always fits in an id's 60 characters).
 */
export function freeId(stem: string, taken: (id: string) => boolean): string {
  if (!taken(stem)) return stem;
  const base = stem.slice(0, 56).replace(/-+$/, "");
  for (let n = 2; ; n += 1) {
    const id = `${base}-${n}`;
    if (!taken(id)) return id;
  }
}

/** The best (lowest-letter) grade among some, or C. */
const bestGrade = (grades: BrandFormula["grade"][]): BrandFormula["grade"] =>
  [...grades].sort()[0] ?? "C";

function secondsOf(value: unknown, fallback: BrandFormula["seconds"]): BrandFormula["seconds"] {
  const item = record(value);
  const { least, most } = OWN_FORMULA_LIMITS.seconds;
  const read = (key: "min" | "ideal" | "max") => {
    const given = number(item[key]);
    return Math.round(Math.min(most, Math.max(least, given ?? fallback[key])));
  };
  const [min, ideal, max] = [read("min"), read("ideal"), read("max")].sort((a, b) => a - b) as [
    number,
    number,
    number,
  ];
  return { min, ideal, max };
}

function beatsOf(value: unknown, seconds: BrandFormula["seconds"]): FormulaBeat[] {
  if (!Array.isArray(value)) return [];
  const out: FormulaBeat[] = [];
  for (const entry of value) {
    const item = record(entry);
    const label = clip(item["label"], 60);
    if (!label) continue;
    let key =
      slugOf(typeof item["key"] === "string" && item["key"] ? item["key"] : label) || "beat";
    while (out.some((beat) => beat.key === key)) key = `${key}-${out.length + 1}`;
    const share = number(item["share"]);
    const from = number(item["from"]);
    out.push({
      key,
      label,
      share: share && share > 0 ? Math.min(share, OWN_FORMULA_LIMITS.seconds.most) : 1,
      job: clip(item["job"], 300) ?? "",
      show: clip(item["show"], 300) ?? "",
      say: clip(item["say"], 300) ?? "",
      ...(item["edge"] === true ? { edge: true } : {}),
      ...(from && from > 0 && from <= seconds.max ? { from: Math.round(from) } : {}),
    });
    if (out.length >= OWN_FORMULA_LIMITS.beats) break;
  }
  return out;
}

function fitOf(value: unknown, fallback: BrandFormula["fit"]): BrandFormula["fit"] {
  const item = record(value);
  const fit: Partial<Record<BrandType, 1 | 2 | 3>> = {};
  for (const type of BRAND_TYPES) {
    const level = number(item[type]);
    if (level === 1 || level === 2 || level === 3) fit[type] = level;
  }
  return Object.keys(fit).length ? fit : { ...fallback };
}

/** One formula as stored or answered, or null when it doesn't hold together. */
export function ownFormulaOf(value: unknown): BrandFormula | null {
  const item = record(value);
  const note = record(item["own"]);
  const name = clip(item["name"], 80);
  if (!name) return null;
  const basedOn = wordsOf(note["basedOn"] ?? item["basedOn"], OWN_FORMULA_LIMITS.basedOn, 60)
    .map((id) => formulaById(id))
    .filter((formula): formula is BrandFormula => !!formula && !formula.own);
  const base = basedOn[0] ?? null;
  const seconds = secondsOf(item["seconds"], base?.seconds ?? { min: 15, ideal: 30, max: 60 });
  const beats = beatsOf(item["beats"], seconds);
  if (beats.length < 2) return null;
  const given = slugOf(typeof item["id"] === "string" && item["id"] ? item["id"] : name);
  // A brand's own formula never takes a library formula's id.
  const id = !given ? null : formulaById(given) ? `own-${given}`.slice(0, 60) : given;
  if (!id) return null;

  const inherited = (pick: (formula: BrandFormula) => string[]) => [
    ...new Set(basedOn.flatMap(pick)),
  ];
  const baseGrade = basedOn.length ? bestGrade(basedOn.map((formula) => formula.grade)) : "C";
  const grade = oneOf(GRADES, item["grade"]) ?? baseGrade;
  return {
    id,
    name,
    origin:
      clip(item["origin"], 160) ??
      (basedOn.length
        ? `Written for the brand, after ${basedOn.map((formula) => formula.name).join(" and ")}`
        : "Written for the brand"),
    summary: clip(item["summary"], 300) ?? base?.summary ?? "",
    purpose: oneOf(PURPOSES, item["purpose"]) ?? base?.purpose ?? "both",
    goals: someOf(GOALS, item["goals"]).length
      ? someOf(GOALS, item["goals"])
      : [...(base?.goals ?? ["consideration"])],
    fit: fitOf(item["fit"], base?.fit ?? {}),
    markets: someOf(["b2b", "b2c"] as const, item["markets"]),
    channels: someOf(CHANNELS, item["channels"]).length
      ? someOf(CHANNELS, item["channels"])
      : [...(base?.channels ?? ["web"])],
    faces: someOf(FACES, item["faces"]),
    seconds,
    shapes: someOf(SHAPES, item["shapes"]).length
      ? someOf(SHAPES, item["shapes"])
      : [...(base?.shapes ?? ["9:16"])],
    beats,
    rules: wordsOf(item["rules"], OWN_FORMULA_LIMITS.rules, 220),
    avoid: wordsOf(item["avoid"], OWN_FORMULA_LIMITS.avoid, 200),
    // Its own guardrails, and never fewer than the formulas it was written from.
    guardrails: [
      ...new Set([
        ...inherited((formula) => formula.guardrails),
        ...someOf(Object.keys(GUARDRAILS), item["guardrails"]),
      ]),
    ],
    why: clip(item["why"], 600) ?? base?.why ?? "",
    // No stronger evidence than the formulas it was written from.
    grade: [grade, baseGrade].sort().at(-1) ?? "C",
    sources: [
      ...new Set([
        ...inherited((formula) => formula.sources),
        ...someOf(Object.keys(SOURCES), item["sources"]),
      ]),
    ],
    own: {
      basedOn: basedOn.map((formula) => formula.id),
      audience: clip(note["audience"] ?? item["audience"], 80),
      cadence: clip(note["cadence"] ?? item["cadence"], 80),
    },
  };
}

/** A kit's own formulas as stored, each one whole and each id once. */
export function ownFormulasOf(value: unknown): BrandFormula[] {
  if (!Array.isArray(value)) return [];
  const out: BrandFormula[] = [];
  for (const entry of value) {
    const formula = ownFormulaOf(entry);
    if (!formula) continue;
    const id = freeId(formula.id, (id) => out.some((other) => other.id === id));
    out.push({ ...formula, id });
    if (out.length >= OWN_FORMULA_LIMITS.formulas) break;
  }
  return out;
}

/**
 * A library formula copied for a brand to rewrite by hand: its structure,
 * rules and guardrails, with a name and id of its own.
 */
export function copyForBrand(
  formula: BrandFormula,
  brandName: string,
  taken: readonly string[] = [],
): BrandFormula {
  const stem = slugOf([brandName, formula.id].join(" ")) || formula.id;
  const id = freeId(stem, (id) => taken.includes(id) || !!formulaById(id));
  return {
    ...formula,
    id,
    name: `${formula.name} for ${brandName}`.slice(0, 80),
    origin: `Written for ${brandName}, after ${formula.name}`.slice(0, 160),
    beats: formula.beats.map((beat) => ({ ...beat })),
    rules: [...formula.rules],
    avoid: [...formula.avoid],
    guardrails: [...formula.guardrails],
    sources: [...formula.sources],
    own: { basedOn: [formula.id], audience: null, cadence: null },
  };
}
