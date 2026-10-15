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

/** A control that only works alongside another setting, e.g. reasoning needs prompt expansion. */
export interface FieldRequirement {
  field: string;
  equals: unknown;
  message?: string;
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
  /** Where a preset control loads its choices from, e.g. "marketing-studio". */
  source?: string;
  /** Text the provider only accepts in one shape, e.g. an ID. */
  format?: "uuid";
  /** Checked when the control is switched on or filled in. */
  requires?: FieldRequirement;
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
  /** What the media is for on this model, e.g. "Start frame" or "Character image". */
  label?: string;
}

/**
 * Rules across a model's media inputs that single slots can't express. A rule
 * with `when` applies only while that setting has that value.
 *   anyOf     at least one input in one of these roles
 *   exclusive inputs from at most one of these groups of roles
 *   maxTotal  at most `max` inputs across these roles
 */
export type InputRule = { message: string; when?: { field: string; equals: unknown } } & (
  | { kind: "anyOf"; roles: string[] }
  | { kind: "exclusive"; groups: string[][] }
  | { kind: "maxTotal"; roles: string[]; max: number }
);

export interface ModelCapabilities {
  inputs?: InputSlot[];
  presets?: boolean;
  cancelable?: boolean;
  inputRules?: InputRule[];
  /** Provider parameters always sent with one value and never shown as a control. */
  fixedParameters?: Record<string, unknown>;
  /**
   * Opens a clip on a given frame sent as its first reference image, which the
   * prompt names as <<<image_1>>> (for a model with no start-frame input).
   */
  referenceStart?: boolean;
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

/** What each media role is called when a model doesn't name the slot itself. */
export const SLOT_ROLE_LABELS: Record<string, string> = {
  image: "Source image",
  video: "Source video",
  audio: "Audio",
  source: "Source",
  reference: "Reference",
  first_frame: "Start frame",
  last_frame: "End frame",
};

export function slotLabel(slot: Pick<InputSlot, "role" | "label">): string {
  return slot.label ?? SLOT_ROLE_LABELS[slot.role] ?? slot.role;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UUID_EXAMPLE = "3db34ab5-3439-4317-9e03-08dc30852e69";

const MEDIA_NOUNS: Record<InputMediaType, string> = {
  image: "an image",
  video: "a video",
  audio: "an audio file",
};

/** Unset, or text with nothing in it: never sent to the provider, and missing when required. */
export function isBlank(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
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
 * wins, so a freshly selected model always validates. A stored default for a
 * setting the model no longer has is ignored.
 */
export function defaultsForModel(model: ModelRegistryEntry): Record<string, unknown> {
  const fields = model.parameter_schema?.fields ?? [];
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) values[field.key] = field.default;
  }
  for (const [key, value] of Object.entries(model.default_parameters ?? {})) {
    const field = fields.find((entry) => entry.key === key);
    if (!field) continue;
    const allowed = (field.options ?? []).map((option) => normalizeOption(option).value);
    if (!allowed.length || allowed.includes(value as string | number)) {
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
    const empty = isBlank(value);

    if (field.required && empty) {
      issues.push({ key: field.key, message: `${field.label} is required` });
      continue;
    }
    if (empty) continue;

    if (typeof value === "string") {
      if (field.format === "uuid" && !UUID.test(value.trim()))
        issues.push({
          key: field.key,
          message: `${field.label} must be an ID like ${UUID_EXAMPLE}`,
        });
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
    const needs = field.requires;
    if (needs && value !== false && values[needs.field] !== needs.equals) {
      const other = fields.find((entry) => entry.key === needs.field)?.label ?? needs.field;
      issues.push({
        key: field.key,
        message: needs.message ?? `${field.label} needs ${other} changed`,
      });
    }
  }

  for (const slot of model.capabilities?.inputs ?? []) {
    const count = inputRoles.filter((r) => r === slot.role).length;
    const label = slotLabel(slot);
    if (slot.required && count === 0)
      issues.push({ key: slot.role, message: `${label}: add ${MEDIA_NOUNS[slot.type]}` });
    if (slot.max && count > slot.max)
      issues.push({
        key: slot.role,
        message: `${label} takes at most ${slot.max} file${slot.max === 1 ? "" : "s"}`,
      });
  }

  const count = (roles: string[]) => inputRoles.filter((role) => roles.includes(role)).length;
  for (const rule of model.capabilities?.inputRules ?? []) {
    if (rule.when && values[rule.when.field] !== rule.when.equals) continue;
    const broken =
      rule.kind === "anyOf"
        ? count(rule.roles) === 0
        : rule.kind === "maxTotal"
          ? count(rule.roles) > rule.max
          : rule.groups.filter((group) => count(group) > 0).length > 1;
    if (broken) issues.push({ key: "inputs", message: rule.message });
  }

  return issues;
}

/**
 * The settings that go to the provider: the model's own controls that are in
 * play (shown for these values and inputs) and filled in. Anything else in
 * `values` (a setting another model had, a hidden control's leftover value,
 * an empty text box) is never sent; the API rejects keys it doesn't know.
 */
export function parameterValues(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  inputRoles: string[],
): Record<string, unknown> {
  const sent: Record<string, unknown> = {};
  for (const field of model.parameter_schema?.fields ?? []) {
    const value = values[field.key];
    if (isBlank(value) || !fieldVisible(field, values, inputRoles)) continue;
    // A one-line value (an ID, a name) is sent without stray spaces around it.
    sent[field.key] = field.type === "text" && typeof value === "string" ? value.trim() : value;
  }
  return sent;
}

/** A provider request body: the settings in play, the model's fixed parameters and its media. */
export function providerPayload(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  media: { role: string; url: string }[],
): Record<string, unknown> {
  const roles = media.map((item) => item.role);
  const payload: Record<string, unknown> = {
    ...parameterValues(model, values, roles),
    ...(model.capabilities?.fixedParameters ?? {}),
  };
  for (const slot of model.capabilities?.inputs ?? []) {
    const urls = media.filter((item) => item.role === slot.role).map((item) => item.url);
    if (!urls.length) continue;
    payload[slot.param] = slot.array ? urls : urls[0];
  }
  return payload;
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
