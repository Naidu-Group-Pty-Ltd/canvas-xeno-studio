#!/usr/bin/env node
/**
 * Builds the studio's Higgsfield model registry from the API schemas in
 * catalog.json and the presentation choices in curation.mjs, checks every row
 * against the schema it targets, and writes:
 *
 *   registry.json                                  the rows, for review and tests
 *   drizzle/migrations/0009_higgsfield_model_catalog.sql   the upsert
 *
 *   node scripts/higgsfield/build-registry.mjs
 *
 * Every schema param ends up as a field, a media slot, or an explicit skip with
 * a reason; a param this script doesn't account for fails the build. Sample
 * requests built from each row (its defaults, and every control at a
 * non-default value) are validated against the schema, so a registry row can
 * never produce a request the API rejects for its shape.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVANCED,
  FIELD_ORDER,
  LABELS,
  MEDIA_PARAMS,
  MODELS,
  OPTION_LABELS,
  SKIPPED_PARAMS,
} from "./curation.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MIGRATION = join(ROOT, "drizzle", "migrations", "0009_higgsfield_model_catalog.sql");
// ajv ships with the repo's eslint toolchain; it is only used here, at build time.
const Ajv = createRequire(import.meta.url)("ajv");

/** Database enums the rows must fit (public.operation_type, public.input_role). */
const OPERATIONS = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "video-to-video",
  "video-extend",
  "video-edit",
  "motion-transfer",
  "object-swap",
  "motion-control",
  "cinematic-video",
  "image-edit",
];
const ROLES = ["image", "video", "audio", "first_frame", "last_frame", "reference", "source"];
const RULE_KINDS = ["anyOf", "exclusive", "maxTotal"];

/** Descriptions the docs repeat for every model; a label says as much. */
const GENERIC_DESCRIPTIONS = [
  /^Write your prompt here/,
  /^See the complete JSON schema/,
  /^Requested output duration in seconds\.$/,
  /^Output resolution tier\.$/,
  /^Output width-to-height ratio\.$/,
  /^Generate audio with the video\.$/,
  /^Enable sound for the output video\.$/,
  /^Text instructions for the generation or edit\.$/,
  /^Output file format\.$/,
  /^Public URL of/,
  /^Ordered public/,
];

const problems = [];
const problem = (where, message) => problems.push(`${where}: ${message}`);

function unwrap(prop) {
  if (!prop?.anyOf) return prop;
  const real = prop.anyOf.filter((option) => option.type !== "null");
  if (real.length !== 1) return prop;
  return { ...real[0], ...(prop.default != null ? { default: prop.default } : {}) };
}

function humanize(value) {
  if (typeof value !== "string") return String(value);
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(value)) return value;
  if (/^\d+[kK]$/.test(value)) return value.toUpperCase();
  if (/^\d+p$/.test(value)) return value;
  const words = value.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelFor(key) {
  return LABELS[key] ?? humanize(key);
}

/** Sentences written for API integrators (wire formats, nulls, IDs) rather than for people. */
const INTEGRATION_SENTENCE =
  /Omit this field|`null`|\bnull\b|case-sensitive|Send the |Send a |items\[\]|\]\(#|JSON|UUID|Defaults to|omitted|Must contain|\benum\b|\b[a-z]+_[a-z_]+\b/;

function docsDescription(text) {
  if (!text || GENERIC_DESCRIPTIONS.some((pattern) => pattern.test(text))) return undefined;
  const sentences = (text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !INTEGRATION_SENTENCE.test(sentence));
  const kept = sentences.slice(0, 2).join(" ");
  if (!kept) return undefined;
  return kept.length > 240 ? `${kept.slice(0, 237).trimEnd()}…` : kept;
}

/**
 * Slot order, which is also the order new references fill slots in: required
 * media first, then what the media is for, then supporting references. A
 * reference workflow leads with its references; frames there are optional extras.
 */
const ROLE_ORDER = ["source", "first_frame", "image", "last_frame", "reference", "video", "audio"];
const REFERENCE_ROLE_ORDER = [
  "reference",
  "video",
  "audio",
  "source",
  "first_frame",
  "image",
  "last_frame",
];

function options(key, values) {
  const labels = OPTION_LABELS[key] ?? {};
  return values.map((value) => {
    const label = labels[value] ?? humanize(value);
    return label === String(value) ? value : { value, label };
  });
}

/** A field for one schema param, or a reason it is left out. */
function buildField(key, rawProp, { entry, workflow, schemaRequired }) {
  const prop = unwrap(rawProp);
  const override = entry.fields?.[key] ?? {};
  const field = { key, label: override.label ?? labelFor(key) };
  const required =
    schemaRequired || (key === "prompt" && entry.promptRequired) || override.required;

  if (key === "prompt" || key === "negative_prompt") {
    field.type = "textarea";
    if (prop.minLength && prop.minLength > 1) field.minLength = prop.minLength;
    if (prop.maxLength) field.maxLength = prop.maxLength;
  } else if (key === "preset_id") {
    field.type = "preset";
    if (!override.source) problem(entry.endpoint, "preset_id needs a preset source");
  } else if (Array.isArray(prop.enum)) {
    if (prop.enum.length === 1) return { skip: `only accepts ${JSON.stringify(prop.enum[0])}` };
    field.type =
      key === "aspect_ratio"
        ? "aspect_ratio"
        : prop.enum.length <= 5 && prop.enum.every((value) => humanize(value).length <= 12)
          ? "segmented"
          : "select";
    field.options = options(key, prop.enum);
    if (prop.default !== undefined) field.default = prop.default;
  } else if (prop.type === "integer" || prop.type === "number") {
    const integer = prop.type === "integer";
    field.type = key === "seed" ? "seed" : prop.default !== undefined ? "slider" : "number";
    if (typeof prop.minimum === "number") field.min = prop.minimum;
    if (typeof prop.maximum === "number") field.max = prop.maximum;
    if (field.type !== "seed") {
      field.step = integer ? 1 : (prop.multipleOf ?? (prop.maximum <= 1 ? 0.01 : 1));
      if (prop.default !== undefined) field.default = prop.default;
    }
    if (field.type === "slider" && (field.min === undefined || field.max === undefined))
      field.type = "number";
  } else if (prop.type === "boolean") {
    field.type = "boolean";
    if (prop.default !== undefined) field.default = prop.default;
  } else if (prop.type === "string") {
    // Free text is only sent when filled in; the API's own default applies otherwise.
    field.type = "text";
    if (prop.maxLength) field.maxLength = prop.maxLength;
    if (prop.format === "uuid") field.format = "uuid";
  } else {
    return null;
  }

  const description = override.description ?? docsDescription(workflow.params?.[key]);
  if (description) field.description = description;
  if (required) field.required = true;
  if (override.advanced ?? ADVANCED.has(key)) field.advanced = true;
  for (const property of ["type", "showIf", "source", "requires"]) {
    if (override[property] !== undefined) field[property] = override[property];
  }
  return field;
}

function buildSlot(param, rawProp, { entry, schemaRequired }) {
  const prop = unwrap(rawProp);
  const base = MEDIA_PARAMS[param];
  const override = entry.media?.[param] ?? {};
  const array = prop.type === "array";
  const max = override.max ?? (array ? prop.maxItems : 1);
  if (array && max === undefined)
    problem(entry.endpoint, `${param} has no published limit; set media.${param}.max`);
  if (array && prop.maxItems !== undefined && max > prop.maxItems)
    problem(entry.endpoint, `${param} max ${max} exceeds the schema's ${prop.maxItems}`);
  const slot = {
    role: override.role ?? base.role,
    type: base.type,
    param,
    label: override.label ?? base.label,
    max,
  };
  if (array) slot.array = true;
  if (override.required ?? schemaRequired) slot.required = true;
  return slot;
}

function orderFields(fields) {
  const rank = (field) => {
    const index = FIELD_ORDER.indexOf(field.key);
    return index === -1 ? FIELD_ORDER.length : index;
  };
  return fields
    .map((field, index) => ({ field, index }))
    .sort(
      (a, b) =>
        Number(!!a.field.advanced) - Number(!!b.field.advanced) ||
        rank(a.field) - rank(b.field) ||
        a.index - b.index,
    )
    .map((entry) => entry.field);
}

function stableId(path, operation) {
  const hash = createHash("sha1").update(`higgsfield|${path}|${operation}`).digest("hex");
  const variant = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function buildRow(entry, workflow) {
  const schema = workflow.schema;
  const required = new Set(schema.required ?? []);
  const omit = new Set(entry.omit ?? []);
  const fixed = entry.fixed ?? {};
  const fields = [];
  const inputs = [];
  const skipped = {};

  for (const key of [
    ...Object.keys(entry.fields ?? {}),
    ...Object.keys(entry.media ?? {}),
    ...omit,
    ...Object.keys(fixed),
  ])
    if (!(key in schema.properties))
      problem(entry.endpoint, `curated param ${key} is not in the schema`);

  for (const [key, prop] of Object.entries(schema.properties)) {
    const context = { entry, workflow, schemaRequired: required.has(key) };
    if (key in fixed) continue;
    if (omit.has(key)) skipped[key] = "left to this endpoint's other studio entry";
    else if (SKIPPED_PARAMS[key]) skipped[key] = SKIPPED_PARAMS[key];
    else if (MEDIA_PARAMS[key]) inputs.push(buildSlot(key, prop, context));
    else {
      const field = buildField(key, prop, context);
      if (!field) problem(entry.endpoint, `param ${key} has a shape the builder can't map`);
      else if (field.skip) skipped[key] = field.skip;
      else fields.push(field);
    }
  }
  for (const key of Object.keys(skipped))
    if (required.has(key)) problem(entry.endpoint, `required param ${key} is skipped`);

  const order = entry.operation === "reference-to-video" ? REFERENCE_ROLE_ORDER : ROLE_ORDER;
  inputs.sort(
    (a, b) =>
      Number(!a.required) - Number(!b.required) || order.indexOf(a.role) - order.indexOf(b.role),
  );
  const roles = inputs.map((slot) => slot.role);
  if (new Set(roles).size !== roles.length)
    problem(entry.endpoint, `duplicate media roles ${roles}`);

  const output = workflow.category;
  const has = (key) => fields.some((field) => field.key === key);
  const slotsOf = (type) => inputs.filter((slot) => slot.type === type);
  const total = (type) => slotsOf(type).reduce((sum, slot) => sum + slot.max, 0);
  const capabilities = { cancelable: true, inputs };
  if (fields.some((field) => field.type === "preset")) capabilities.presets = true;
  if (entry.rules?.length) capabilities.inputRules = entry.rules;
  if (Object.keys(fixed).length) capabilities.fixedParameters = fixed;

  return {
    id: stableId(entry.endpoint, entry.operation),
    provider: "higgsfield",
    family: entry.family,
    display_name: entry.name,
    description: workflow.family_description ?? null,
    model_path: entry.endpoint,
    legacy_path: entry.legacyPath ?? null,
    output_type: output,
    operation: entry.operation,
    capabilities,
    parameter_schema: { fields: orderFields(fields) },
    recommended_for: entry.recommended,
    sort_order: entry.sort,
    capability_tags: [...new Set(entry.tags ?? [])].sort(),
    max_reference_images: total("image"),
    max_reference_videos: total("video"),
    max_reference_audio: total("audio"),
    supports_text: has("prompt"),
    supports_image_input: slotsOf("image").length > 0,
    supports_video_input: slotsOf("video").length > 0,
    supports_audio_input: slotsOf("audio").length > 0,
    supports_first_frame:
      roles.includes("first_frame") ||
      (entry.operation === "image-to-video" && roles.includes("source")),
    supports_last_frame: roles.includes("last_frame"),
    supports_native_audio: has("generate_audio") || has("sound"),
    supports_seed: has("seed"),
    supports_edit: ["image-to-image", "image-edit", "video-edit", "video-to-video"].includes(
      entry.operation,
    ),
    supports_extend: entry.operation === "video-extend",
    supports_batch: has("batch_size"),
    metadata: { docs_url: workflow.docs_url, docs_title: workflow.title, skipped_params: skipped },
  };
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

const ajv = new Ajv({ allErrors: true, format: "full" });

function optionValues(field) {
  return (field.options ?? []).map((option) =>
    typeof option === "object" ? option.value : option,
  );
}

function visible(field, values, roles) {
  const condition = field.showIf;
  if (!condition) return true;
  if (condition.hasInput && !roles.includes(condition.hasInput)) return false;
  if (condition.field !== undefined && values[condition.field] !== condition.equals) return false;
  return true;
}

const SAMPLE_URL = {
  image: "https://example.com/i.png",
  video: "https://example.com/v.mp4",
  audio: "https://example.com/a.wav",
};

/** The request the studio would send for these values and media, as the app builds it. */
function request(row, values, slots) {
  const roles = slots.map((slot) => slot.role);
  const payload = {};
  for (const field of row.parameter_schema.fields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (!visible(field, values, roles)) continue;
    payload[field.key] = value;
  }
  Object.assign(payload, row.capabilities.fixedParameters ?? {});
  for (const slot of slots) {
    if (!slot.count) continue;
    const urls = Array.from({ length: slot.count }, () => SAMPLE_URL[slot.type]);
    payload[slot.param] = slot.array ? urls : urls[0];
  }
  return payload;
}

function sampleValue(field, prop, which) {
  const values = optionValues(field);
  if (values.length)
    return which === "default"
      ? field.default
      : (values.find((v) => v !== field.default) ?? values[0]);
  switch (field.type) {
    case "boolean":
      return which === "default" ? field.default : !field.default;
    case "slider":
    case "number":
      return which === "default" ? field.default : (field.max ?? field.min ?? 1);
    case "seed":
      return which === "default" ? undefined : (field.min ?? 0) + 1;
    case "preset":
      return which === "default" ? undefined : "c2143317-f28d-4c3c-a0b8-39bd547e08a7";
    default:
      if (which === "default") return undefined;
      return unwrap(prop)?.format === "uuid"
        ? "c2143317-f28d-4c3c-a0b8-39bd547e08a7"
        : "Sample text";
  }
}

function checkRow(row, workflow) {
  const where = `${row.display_name} (${row.model_path})`;
  const schema = workflow.schema;
  const props = schema.properties;
  if (!OPERATIONS.includes(row.operation)) problem(where, `unknown operation ${row.operation}`);

  const keys = new Set();
  for (const field of row.parameter_schema.fields) {
    if (keys.has(field.key)) problem(where, `duplicate field ${field.key}`);
    keys.add(field.key);
    const prop = unwrap(props[field.key]);
    if (!prop) {
      problem(where, `field ${field.key} is not in the schema`);
      continue;
    }
    const allowed = optionValues(field);
    if (allowed.length && !allowed.every((value) => prop.enum?.includes(value)))
      problem(where, `${field.key} offers values outside the schema's enum`);
    if (field.default !== undefined && allowed.length && !allowed.includes(field.default))
      problem(where, `${field.key} default isn't one of its options`);
    if (
      typeof prop.minimum === "number" &&
      typeof field.min === "number" &&
      field.min < prop.minimum
    )
      problem(where, `${field.key} min below the schema's`);
    if (
      typeof prop.maximum === "number" &&
      typeof field.max === "number" &&
      field.max > prop.maximum
    )
      problem(where, `${field.key} max above the schema's`);
    for (const dependency of [field.showIf?.field, field.requires?.field])
      if (dependency && !row.parameter_schema.fields.some((f) => f.key === dependency))
        problem(where, `${field.key} depends on a missing field ${dependency}`);
  }

  const roles = row.capabilities.inputs.map((slot) => slot.role);
  for (const slot of row.capabilities.inputs) {
    if (!ROLES.includes(slot.role)) problem(where, `unknown role ${slot.role}`);
    if (!(slot.param in props)) problem(where, `slot param ${slot.param} is not in the schema`);
  }
  for (const rule of row.capabilities.inputRules ?? []) {
    if (!RULE_KINDS.includes(rule.kind)) problem(where, `unknown rule ${rule.kind}`);
    const ruleRoles = rule.kind === "exclusive" ? rule.groups.flat() : rule.roles;
    if (!ruleRoles.every((role) => roles.includes(role)))
      problem(where, `rule names a role the row lacks`);
    if (!rule.message) problem(where, "rule without a message");
  }

  // Every param the API requires is always sent: a required field or slot, a default, or a fixed value.
  for (const key of schema.required ?? []) {
    const field = row.parameter_schema.fields.find((f) => f.key === key);
    const slot = row.capabilities.inputs.find((s) => s.param === key);
    const fixed = key in (row.capabilities.fixedParameters ?? {});
    if (!(field?.required || field?.default !== undefined || slot?.required || fixed))
      problem(where, `the API requires ${key} but the row doesn't`);
  }

  const validate = ajv.compile(schema);
  for (const which of ["default", "changed"]) {
    const values = {};
    for (const field of row.parameter_schema.fields) {
      // A required control without a default is one the person must fill in.
      const value =
        which === "default" && field.default === undefined && field.required
          ? sampleValue(field, props[field.key], "changed")
          : sampleValue(field, props[field.key], which);
      if (value !== undefined) values[field.key] = value;
    }
    if (keys.has("prompt")) values.prompt = "A lighthouse on a cliff at dusk";
    // What the studio's own checks make a person fix before it would send anything.
    for (const field of row.parameter_schema.fields) {
      const needs = field.requires;
      if (needs && values[field.key] === true && values[needs.field] !== needs.equals)
        values[field.key] = false;
    }
    const slots = row.capabilities.inputs.map((slot) => ({
      ...slot,
      count: which === "changed" ? slot.max : slot.required ? 1 : 0,
    }));
    applyRules(row, values, slots);
    const payload = request(row, values, slots);
    if (!validate(payload))
      problem(
        where,
        `${which} request fails the schema: ${ajv.errorsText(validate.errors)} — ${JSON.stringify(payload)}`,
      );
  }
}

/** Adjusts sample media the way the studio's input rules make a person adjust it. */
function applyRules(row, values, slots) {
  const roles = () => slots.filter((slot) => slot.count > 0).map((slot) => slot.role);
  for (const rule of row.capabilities.inputRules ?? []) {
    if (rule.when && values[rule.when.field] !== rule.when.equals) continue;
    if (rule.kind === "exclusive") {
      const keep = rule.groups.find((group) => group.some((role) => roles().includes(role))) ?? [];
      for (const slot of slots)
        if (rule.groups.flat().includes(slot.role) && !keep.includes(slot.role)) slot.count = 0;
    } else if (rule.kind === "maxTotal") {
      let room = rule.max;
      for (const slot of slots) {
        if (!rule.roles.includes(slot.role)) continue;
        slot.count = Math.min(slot.count, room);
        room -= slot.count;
      }
    } else if (rule.kind === "anyOf" && !rule.roles.some((role) => roles().includes(role))) {
      const slot = slots.find((entry) => entry.role === rule.roles[0]);
      if (slot) slot.count = 1;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const catalog = JSON.parse(await readFile(join(HERE, "catalog.json"), "utf8"));
const byEndpoint = new Map(catalog.workflows.filter((w) => w.endpoint).map((w) => [w.endpoint, w]));

const rows = [];
for (const entry of MODELS) {
  const workflow = byEndpoint.get(entry.endpoint);
  if (!workflow) {
    problem(entry.endpoint, "not in catalog.json");
    continue;
  }
  rows.push(buildRow(entry, workflow));
  for (const variant of entry.variants ?? []) {
    const media = { ...(entry.media ?? {}) };
    for (const [param, override] of Object.entries(variant.media ?? {}))
      media[param] = { ...(media[param] ?? {}), ...override };
    rows.push(buildRow({ ...entry, ...variant, media, variants: undefined }, workflow));
  }
}

const curated = new Set(MODELS.map((entry) => entry.endpoint));
for (const workflow of catalog.workflows)
  if (workflow.endpoint && !curated.has(workflow.endpoint))
    problem(workflow.endpoint, "in the catalogue but has no curation entry");

const seen = new Set();
for (const row of rows) {
  const key = `${row.model_path}|${row.operation}`;
  if (seen.has(key)) problem(row.display_name, `duplicate ${key}`);
  seen.add(key);
  checkRow(row, byEndpoint.get(row.model_path));
}
const sorts = rows.map((row) => row.sort_order);
if (new Set(sorts).size !== sorts.length) problem("catalogue", "sort orders repeat");

if (problems.length) {
  console.error(`${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

const sqlText = (value) =>
  value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;
const sqlJson = (value) => `${sqlText(JSON.stringify(value))}::jsonb`;
const sqlTags = (tags) =>
  tags.length ? `ARRAY[${tags.map(sqlText).join(", ")}]::text[]` : "'{}'::text[]";

const COLUMNS = [
  "id",
  "provider",
  "family",
  "model_family",
  "provider_family",
  "display_name",
  "description",
  "model_path",
  "output_type",
  "operation",
  "capabilities",
  "parameter_schema",
  "default_parameters",
  "recommended_for",
  "is_active",
  "sort_order",
  "capability_tags",
  "documentation_status",
  "max_reference_images",
  "max_reference_videos",
  "max_reference_audio",
  "supports_text",
  "supports_image_input",
  "supports_video_input",
  "supports_audio_input",
  "supports_first_frame",
  "supports_last_frame",
  "supports_native_audio",
  "supports_seed",
  "supports_edit",
  "supports_extend",
  "supports_batch",
  "metadata",
];

function valuesTuple(row) {
  const values = [
    `${sqlText(row.id)}::uuid`,
    sqlText(row.provider),
    sqlText(row.family),
    sqlText(row.family),
    sqlText(row.provider),
    sqlText(row.display_name),
    sqlText(row.description),
    sqlText(row.model_path),
    `${sqlText(row.output_type)}::public.asset_type`,
    `${sqlText(row.operation)}::public.operation_type`,
    sqlJson(row.capabilities),
    sqlJson(row.parameter_schema),
    "'{}'::jsonb",
    sqlText(row.recommended_for),
    "true",
    String(row.sort_order),
    sqlTags(row.capability_tags),
    "'verified'",
    String(row.max_reference_images),
    String(row.max_reference_videos),
    String(row.max_reference_audio),
    ...[
      "supports_text",
      "supports_image_input",
      "supports_video_input",
      "supports_audio_input",
      "supports_first_frame",
      "supports_last_frame",
      "supports_native_audio",
      "supports_seed",
      "supports_edit",
      "supports_extend",
      "supports_batch",
    ].map((column) => String(row[column])),
    sqlJson(row.metadata),
  ];
  return `  -- ${row.display_name}\n  (${values.join(",\n   ")})`;
}

const UPDATED = [
  "family",
  "model_family",
  "provider_family",
  "display_name",
  "description",
  "output_type",
  "capabilities",
  "parameter_schema",
  "sort_order",
  "documentation_status",
  "max_reference_images",
  "max_reference_videos",
  "max_reference_audio",
  "supports_text",
  "supports_image_input",
  "supports_video_input",
  "supports_audio_input",
  "supports_first_frame",
  "supports_last_frame",
  "supports_native_audio",
  "supports_seed",
  "supports_edit",
  "supports_extend",
  "supports_batch",
];

const renames = rows
  .filter((row) => row.legacy_path)
  .map(
    (row) => `UPDATE public.model_registry AS m
   SET model_path = ${sqlText(row.model_path)}
 WHERE m.provider = 'higgsfield'
   AND m.model_path = ${sqlText(row.legacy_path)}
   AND m.operation = ${sqlText(row.operation)}::public.operation_type
   AND NOT EXISTS (
     SELECT 1 FROM public.model_registry AS current
      WHERE current.provider = 'higgsfield'
        AND current.model_path = ${sqlText(row.model_path)}
        AND current.operation = m.operation);`,
  );

const sql = `-- Higgsfield model catalogue: every image and video generation workflow the
-- Higgsfield API documents, with controls derived from each endpoint's own
-- request schema.
--
-- GENERATED by scripts/higgsfield/build-registry.mjs from
-- scripts/higgsfield/catalog.json (a snapshot of docs.higgsfield.ai) and
-- scripts/higgsfield/curation.mjs. Change those and rebuild; don't edit here.
--
-- Rows are upserted on (provider, model_path, operation). A model already in
-- the registry keeps its id (so defaults in Settings, generations and plans
-- still point at it), its on/off switch, its UI overrides, its "best for" text
-- and those of its stored default values its new controls still accept.
-- Everything describing the API (controls, media inputs, limits) is replaced.
-- Rows for endpoints outside this catalogue are left as they are.
-- Re-runnable.

-- Genjutsu moved off its misspelled legacy endpoints; the old paths stay
-- callable for in-flight generations, but new requests use the documented ones.
${renames.join("\n\n")}

-- Stored defaults the new controls can't represent are dropped, so a freshly
-- selected model always starts valid.
CREATE OR REPLACE FUNCTION pg_temp.kept_defaults(stored jsonb, schema jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
    FROM jsonb_each(COALESCE(stored, '{}'::jsonb)) AS d
    JOIN jsonb_array_elements(schema -> 'fields') AS f ON f ->> 'key' = d.key
   WHERE CASE
           WHEN f -> 'options' IS NOT NULL THEN EXISTS (
             SELECT 1 FROM jsonb_array_elements(f -> 'options') AS o
              WHERE o = d.value OR o -> 'value' = d.value)
           WHEN f ->> 'type' = 'boolean' THEN jsonb_typeof(d.value) = 'boolean'
           WHEN f ->> 'type' IN ('slider', 'number', 'seed') THEN
             jsonb_typeof(d.value) = 'number'
             AND (f -> 'min' IS NULL OR (d.value #>> '{}')::numeric >= (f ->> 'min')::numeric)
             AND (f -> 'max' IS NULL OR (d.value #>> '{}')::numeric <= (f ->> 'max')::numeric)
           ELSE jsonb_typeof(d.value) = 'string'
         END
$$;

INSERT INTO public.model_registry AS m
  (${COLUMNS.join(", ")})
VALUES
${rows.map(valuesTuple).join(",\n")}
ON CONFLICT (provider, model_path, operation) DO UPDATE SET
  ${UPDATED.map((column) => `${column} = EXCLUDED.${column}`).join(",\n  ")},
  default_parameters = pg_temp.kept_defaults(m.default_parameters, EXCLUDED.parameter_schema),
  recommended_for = COALESCE(m.recommended_for, EXCLUDED.recommended_for),
  capability_tags = ARRAY(
    SELECT DISTINCT tag FROM unnest(m.capability_tags || EXCLUDED.capability_tags) AS tag ORDER BY tag
  ),
  metadata = m.metadata || EXCLUDED.metadata;
`;

const registry = rows.map(({ legacy_path, ...row }) => row);
await writeFile(join(HERE, "registry.json"), `${JSON.stringify(registry, null, 1)}\n`);
await writeFile(MIGRATION, sql);
const counts = rows.reduce(
  (acc, row) => ({ ...acc, [row.output_type]: (acc[row.output_type] ?? 0) + 1 }),
  {},
);
console.log(
  `${rows.length} registry rows (${counts.image} image, ${counts.video} video) → ${MIGRATION}`,
);
