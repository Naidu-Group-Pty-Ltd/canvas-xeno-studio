/**
 * Provider-agnostic model schema types.
 *
 * The Create page renders controls purely from these structures, so adding a
 * model is a database operation, not a frontend change.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "slider"
  | "select"
  | "segmented"
  | "boolean"
  | "aspect_ratio"
  | "seed"
  | "preset";

export type FieldOption = string | number | { value: string | number; label?: string };

export interface ShowIf {
  field?: string;
  equals?: unknown;
  hasInput?: string;
}

export interface FieldSchema {
  key: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  options?: FieldOption[];
  advanced?: boolean;
  showIf?: ShowIf;
}

export interface ParameterSchema {
  fields: FieldSchema[];
}

export type InputMediaType = "image" | "video" | "audio";

export interface InputSlot {
  role: string;
  type: InputMediaType;
  required?: boolean;
  max?: number;
  param: string;
  array?: boolean;
}

export interface ModelCapabilities {
  inputs?: InputSlot[];
  presets?: boolean;
  cancelable?: boolean;
}

export interface ModelRegistryEntry {
  id: string;
  provider: string;
  family: string;
  display_name: string;
  description: string | null;
  model_path: string;
  output_type: "image" | "video" | "audio";
  operation: string;
  capabilities: ModelCapabilities;
  parameter_schema: ParameterSchema;
  ui_schema: Record<string, unknown>;
  default_parameters: Record<string, unknown>;
  recommended_for: string | null;
  is_active: boolean;
  sort_order: number;
  /** Router / Cinema Mode tags, e.g. "cinematic", "camera_control", "fast". */
  capability_tags?: string[] | null;
}

export function normalizeOption(option: FieldOption): { value: string | number; label: string } {
  if (typeof option === "object" && option !== null) {
    return { value: option.value, label: option.label ?? String(option.value) };
  }
  return { value: option, label: String(option) };
}

export function fieldVisible(
  field: FieldSchema,
  values: Record<string, unknown>,
  presentInputRoles: string[],
): boolean {
  const cond = field.showIf;
  if (!cond) return true;
  if (cond.hasInput && !presentInputRoles.includes(cond.hasInput)) return false;
  if (cond.field !== undefined && values[cond.field] !== cond.equals) return false;
  return true;
}

export const TRUE_WORDS = new Set(["true", "yes", "on", "1", "enabled"]);
export const FALSE_WORDS = new Set(["false", "no", "off", "0", "disabled"]);

/** Maps a boolean onto a two-state text choice such as "on"/"off" or "yes"/"no". */
export function booleanOption(field: FieldSchema, value: boolean): string | undefined {
  const words = value ? TRUE_WORDS : FALSE_WORDS;
  const match = (field.options ?? [])
    .map(normalizeOption)
    .find((option) => typeof option.value === "string" && words.has(option.value.toLowerCase()));
  return match?.value as string | undefined;
}

/**
 * Registry defaults overlaid with the row's default_parameters. A stored
 * default that the field's own choices cannot represent (e.g. `true` for an
 * "on"/"off" control) is mapped when unambiguous, otherwise the field default
 * wins, so a freshly selected model always validates.
 */
export function defaultsForModel(model: ModelRegistryEntry): Record<string, unknown> {
  const fields = model.parameter_schema?.fields ?? [];
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) values[field.key] = field.default;
  }
  for (const [key, value] of Object.entries(model.default_parameters ?? {})) {
    const field = fields.find((entry) => entry.key === key);
    const allowed = (field?.options ?? []).map((option) => normalizeOption(option).value);
    if (!field || !allowed.length || allowed.includes(value as string | number)) {
      values[key] = value;
      continue;
    }
    const mapped = typeof value === "boolean" ? booleanOption(field, value) : undefined;
    if (mapped !== undefined) values[key] = mapped;
  }
  return values;
}

export interface ValidationIssue {
  key: string;
  message: string;
}

/** Authoritative shape validation shared by browser and server. */
export function validateParameters(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  inputRoles: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fields = model.parameter_schema?.fields ?? [];

  for (const field of fields) {
    if (!fieldVisible(field, values, inputRoles)) continue;
    const value = values[field.key];
    const empty = value === undefined || value === null || value === "";

    if (field.required && empty) {
      issues.push({ key: field.key, message: `${field.label} is required` });
      continue;
    }
    if (empty) continue;

    if (typeof value === "string") {
      if (field.minLength && value.trim().length < field.minLength)
        issues.push({ key: field.key, message: `${field.label} must be at least ${field.minLength} characters` });
      if (field.maxLength && value.length > field.maxLength)
        issues.push({ key: field.key, message: `${field.label} must be under ${field.maxLength} characters` });
    }
    if (typeof value === "number") {
      // Registry rows can store null bounds; only numeric bounds apply.
      if (typeof field.min === "number" && value < field.min)
        issues.push({ key: field.key, message: `${field.label} must be at least ${field.min}` });
      if (typeof field.max === "number" && value > field.max)
        issues.push({ key: field.key, message: `${field.label} must be at most ${field.max}` });
    }
    if (field.options?.length) {
      const allowed = field.options.map((o) => normalizeOption(o).value);
      if (!allowed.includes(value as string | number))
        issues.push({ key: field.key, message: `${field.label} has an unsupported value` });
    }
  }

  for (const slot of model.capabilities?.inputs ?? []) {
    const count = inputRoles.filter((r) => r === slot.role).length;
    if (slot.required && count === 0)
      issues.push({ key: slot.role, message: `A ${slot.type} for "${slot.role}" is required` });
    if (slot.max && count > slot.max)
      issues.push({ key: slot.role, message: `At most ${slot.max} ${slot.role} files allowed` });
  }

  return issues;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  estimating: "Estimating",
  ready: "Ready",
  local_queued: "Waiting for a slot",
  submitting: "Submitting",
  submission_uncertain: "Submission uncertain",
  queued: "Queued",
  in_progress: "Generating",
  completed: "Completed",
  failed: "Failed",
  nsfw: "Blocked by moderation",
  canceled: "Canceled",
};

export const ACTIVE_STATUSES = ["submitting", "queued", "in_progress", "local_queued"] as const;
export const TERMINAL_STATUSES = ["completed", "failed", "nsfw", "canceled"] as const;
