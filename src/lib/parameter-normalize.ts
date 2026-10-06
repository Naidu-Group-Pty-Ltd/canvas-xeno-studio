/**
 * Coerces loosely typed parameter values (AI drafts, hand-offs, older records)
 * into what a registry field accepts. Purely registry-driven: no model names.
 */
import {
  booleanOption,
  defaultsForModel,
  fieldVisible,
  FALSE_WORDS,
  normalizeOption,
  TRUE_WORDS,
  type FieldSchema,
  type ModelRegistryEntry,
} from "./model-schema";

function asNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const match = raw.trim().match(/^-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}

function asFlag(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const word = String(raw).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

/** "16x9", "16/9", "16 : 9" → "16:9" so aspect ratios match registry options. */
function normalizeRatio(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "").replace(/[x/]/g, ":");
}

const RATIO_WORDS: Record<string, string> = {
  square: "1:1",
  portrait: "9:16",
  vertical: "9:16",
  landscape: "16:9",
  horizontal: "16:9",
  widescreen: "16:9",
};

/** Width ÷ height for "16:9"-style text (or a shape word), else null. */
function ratioValue(raw: string): number | null {
  const text = RATIO_WORDS[raw.trim().toLowerCase()] ?? raw;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(normalizeRatio(text));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

/** Plain numbers only: "9:16" or "1080p" are not numeric choices. */
function numericOption(value: string | number): number | null {
  if (typeof value === "number") return value;
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
}

/** Returns the value the field accepts, or undefined when the input cannot be mapped. */
export function coerceFieldValue(field: FieldSchema, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const options = (field.options ?? []).map(normalizeOption);

  if (options.length) {
    const text = String(raw).trim();
    const exact = options.find((option) => option.value === raw || String(option.value) === text);
    if (exact) return exact.value;
    const lower = text.toLowerCase();
    const loose = options.find(
      (option) =>
        String(option.value).toLowerCase() === lower ||
        option.label.toLowerCase() === lower ||
        normalizeRatio(String(option.value)) === normalizeRatio(text),
    );
    if (loose) return loose.value;
    // Two-state choices ("on"/"off", "yes"/"no") also accept booleans.
    const flag = asFlag(raw);
    const mapped = flag === null ? undefined : booleanOption(field, flag);
    if (mapped !== undefined) return mapped;
    // Aspect ratios: the closest offered shape, so 4:5 becomes 3:4, never 4:3.
    const wantedRatio = ratioValue(text);
    const shapes = options.flatMap((option) => {
      const ratio = ratioValue(String(option.value));
      return ratio === null ? [] : [{ value: option.value, ratio }];
    });
    if (wantedRatio !== null && shapes.length) {
      const distance = (ratio: number) => Math.abs(Math.log(ratio / wantedRatio));
      return shapes.reduce((best, shape) =>
        distance(shape.ratio) < distance(best.ratio) ? shape : best,
      ).value;
    }
    // Numeric choices (durations, batch sizes): snap to the nearest offered value.
    const numbers = options.flatMap((option) => {
      const number = numericOption(option.value);
      return number === null ? [] : [{ value: option.value, number }];
    });
    const wanted = asNumber(raw);
    if (wanted !== null && numbers.length && numbers.length === options.length) {
      return numbers.reduce((best, entry) =>
        Math.abs(entry.number - wanted) < Math.abs(best.number - wanted) ? entry : best,
      ).value;
    }
    return undefined;
  }

  switch (field.type) {
    case "boolean":
      return asFlag(raw) ?? undefined;
    case "number":
    case "slider":
    case "seed": {
      let value = asNumber(raw);
      if (value === null) return undefined;
      // Registry rows can carry null bounds, so only numeric bounds apply.
      if (typeof field.min === "number") value = Math.max(field.min, value);
      if (typeof field.max === "number") value = Math.min(field.max, value);
      if (field.type === "seed") value = Math.round(value);
      else if (field.step) value = Math.round(value / field.step) * field.step;
      return Number(value.toFixed(4));
    }
    case "text":
    case "textarea": {
      const text = String(raw);
      return field.maxLength ? text.slice(0, field.maxLength) : text;
    }
    case "preset":
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    default:
      return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
        ? raw
        : undefined;
  }
}

/**
 * Builds a complete value set for a model: registry defaults, overlaid with
 * every supplied value the schema accepts. Unknown or unmappable keys are
 * reported rather than silently sent to the provider.
 */
export function normalizeParameters(
  model: ModelRegistryEntry,
  raw: Record<string, unknown>,
  inputRoles: string[] = [],
): { values: Record<string, unknown>; dropped: string[] } {
  const fields = model.parameter_schema?.fields ?? [];
  const values: Record<string, unknown> = { ...defaultsForModel(model) };
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const field = fields.find((entry) => entry.key === key);
    if (!field) {
      dropped.push(key);
      continue;
    }
    const coerced = coerceFieldValue(field, value);
    if (coerced === undefined) dropped.push(key);
    else values[key] = coerced;
  }

  // A choice field that needs a live provider list (e.g. a preset) cannot be
  // filled in advance: switch off the mode that requires it instead of
  // producing a draft that can never validate.
  for (const field of fields) {
    if (field.type !== "preset" || !field.required || values[field.key] !== undefined) continue;
    if (!fieldVisible(field, values, inputRoles)) continue;
    const gate = field.showIf?.field;
    if (gate && typeof field.showIf?.equals === "boolean") values[gate] = !field.showIf.equals;
  }

  return { values, dropped };
}

/** Key parameters worth showing as chips on a draft (non-advanced choices). */
export function summarizeParameters(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
): string[] {
  return (model.parameter_schema?.fields ?? [])
    .filter((field) => field.key !== "prompt" && !field.advanced && values[field.key] !== undefined)
    .filter((field) =>
      ["aspect_ratio", "segmented", "select", "slider", "number", "boolean"].includes(field.type),
    )
    .slice(0, 5)
    .map((field) => {
      const value = values[field.key];
      if (typeof value === "boolean")
        return value ? field.label : `No ${field.label.toLowerCase()}`;
      const label = (field.options ?? [])
        .map(normalizeOption)
        .find((option) => option.value === value)?.label;
      const shown = label ?? String(value);
      return field.type === "aspect_ratio" ? shown : `${field.label}: ${shown}`;
    });
}
