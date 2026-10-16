/**
 * What the studio says to Katana and reads back from it. Requests are written
 * the way Higgsfield's own Katana form writes them (a /katana command, a
 * `MEDIA:` block of `<input>: <kind> media_id=<uuid>` lines and an `INPUTS:`
 * block of `<input>: <JSON value>` lines), so Katana's instructions apply to
 * them unchanged. Pure.
 */
import { formatCredits } from "./guard";

export type KatanaMode = "remix" | "preset" | "edit";
export type KatanaMediaKind = "image" | "video" | "audio";

/** The form fields the studio fills: Katana's own names for them. */
export const KATANA_FIELDS = {
  referenceVideo: "media.reference_video",
  images: "media.images",
  videos: "media.videos",
  audio: "media.audio",
} as const;

export type KatanaField = (typeof KATANA_FIELDS)[keyof typeof KATANA_FIELDS];

export const FIELD_KIND: Record<KatanaField, KatanaMediaKind> = {
  "media.reference_video": "video",
  "media.images": "image",
  "media.videos": "video",
  "media.audio": "audio",
};

/** A form field that takes media (Katana's own, or one a preset's form names). */
export const MEDIA_FIELD = /^media\.[a-z][a-z0-9_]{0,63}$/;

export interface KatanaMediaInput {
  /** A `media.*` field: one of KATANA_FIELDS, or a preset form's own. */
  field: string;
  kind: KatanaMediaKind;
  mediaId: string;
}

export const PRESET_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function mediaBlock(inputs: KatanaMediaInput[]): string[] {
  if (!inputs.length) return [];
  return [
    "MEDIA:",
    ...inputs.map((input) => `${input.field}: ${input.kind} media_id=${input.mediaId}`),
  ];
}

function inputsBlock(values: Record<string, string>): string[] {
  const entries = Object.entries(values).filter(([, value]) => value.trim());
  if (!entries.length) return [];
  return [
    "INPUTS:",
    ...entries.map(([field, value]) => `${field}: ${JSON.stringify(value.trim())}`),
  ];
}

function limitsBlock(creditLimit: number): string {
  return (
    `Credit limit for this run: ${formatCredits(creditLimit)} Higgsfield credits in total. ` +
    "This is the user's numeric budget for the whole run; the studio's credit guard enforces it."
  );
}

function section(lines: string[]): string {
  return lines.join("\n");
}

export interface KickoffInput {
  mode: KatanaMode;
  presetSlug: string | null;
  brief: string;
  referenceUrl: string | null;
  inputs: KatanaMediaInput[];
  creditLimit: number;
}

/** The run's first message: a Katana request as Higgsfield's form would write it, plus its limits. */
export function kickoffMessage(input: KickoffInput): string {
  const brief = input.brief.trim();
  const parts: string[] = [];
  if (input.mode === "preset") {
    if (!input.presetSlug || !PRESET_SLUG.test(input.presetSlug))
      throw new Error("A preset run needs its slug");
    parts.push(`/katana/${input.presetSlug}`);
  } else if (input.mode === "edit") {
    // An edit's brief is the request itself ("/katana make a sigma edit out of it").
    parts.push(brief ? `/katana ${brief}` : "/katana");
  } else {
    parts.push("/katana");
  }
  if (input.referenceUrl) {
    parts.push(`Reference video: ${input.referenceUrl}`);
  }
  const media = mediaBlock(input.inputs);
  if (media.length) parts.push(section(media));
  const values = section(inputsBlock(input.mode === "edit" ? {} : { "slot_values.prompt": brief }));
  if (values) parts.push(values);
  parts.push(limitsBlock(input.creditLimit));
  return parts.join("\n\n");
}

/** A follow-up from the person: their words, and any media they added. */
export function followUpMessage(input: { text: string; inputs: KatanaMediaInput[] }): string {
  const parts = [input.text.trim()];
  const media = mediaBlock(input.inputs);
  if (media.length) parts.push(section(media));
  return parts.filter(Boolean).join("\n\n");
}

/**
 * The first message of a revision in a new session: Katana's own resume line
 * (it restores the earlier run's saved state and jobs from it), then the change.
 */
export function revisionMessage(input: {
  resumeLine: string;
  text: string;
  inputs: KatanaMediaInput[];
  creditLimit: number;
}): string {
  const parts = [
    input.resumeLine.trim(),
    "This continues an earlier Katana run from its saved state. The user's change:",
    input.text.trim(),
  ];
  const media = mediaBlock(input.inputs);
  if (media.length) parts.push(section(media));
  parts.push(limitsBlock(input.creditLimit));
  return parts.join("\n\n");
}

export interface ResultLine {
  delivered: boolean;
  mediaId: string | null;
  url: string | null;
  reason: string | null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The last `XENO_RESULT` line in a message, if any. */
export function parseResultLine(text: string): ResultLine | null {
  const lines = text.split(/\r?\n/).filter((line) => /^\s*`?XENO_RESULT\b/.test(line));
  const last = lines.at(-1);
  if (!last) return null;
  const rest = last
    .replace(/^\s*`?XENO_RESULT\s*/, "")
    .replace(/`\s*$/, "")
    .trim();
  if (/^none\b/i.test(rest)) {
    const reason = rest.match(/reason=(.*)$/i)?.[1]?.trim() ?? null;
    return { delivered: false, mediaId: null, url: null, reason: reason || null };
  }
  const mediaId = rest.match(new RegExp(`media_id=(${UUID.source})`, "i"))?.[1] ?? null;
  const url = rest.match(/url=(https:\/\/\S+)/i)?.[1]?.replace(/[)>\].,`]+$/, "") ?? null;
  if (!mediaId && !url) return null;
  return { delivered: true, mediaId, url, reason: null };
}

/** The last Katana `RESUME katana ...` line in a message, if any. */
export function parseResumeLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^`+|`+$/g, ""))
    .filter((line) => /^RESUME katana\s+\S/.test(line));
  return lines.at(-1)?.slice(0, 4000) ?? null;
}

/** Katana's own words in a message, without the lines meant for the studio. */
export function visibleText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*`?XENO_RESULT\b/.test(line))
    .join("\n")
    .trim();
}

export interface PresetInput {
  field: string;
  label: string;
  description: string;
  kind: "image" | "video" | "audio" | "text" | "other";
  min: number;
  max: number;
  required: boolean;
}

/**
 * A preset's form, from the `## Inputs` section of its instructions:
 * - `media.images` ("Label", "Description"): image files, 1–10; required
 */
export function parsePresetInputs(markdown: string): PresetInput[] {
  const start = markdown.search(/^##\s+Inputs\s*$/m);
  if (start === -1) return [];
  const rest = markdown.slice(start).split(/\r?\n/).slice(1);
  const inputs: PresetInput[] = [];
  for (const line of rest) {
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    const match = line.match(/^\s*-\s+`([^`]+)`\s*\((.*)\):\s*(.+?);\s*(required|optional)\s*$/i);
    if (!match) continue;
    const [, field, labels, kindText, need] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const quoted = [...labels.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((part) => part[1] ?? "");
    const lower = kindText.toLowerCase();
    const kind: PresetInput["kind"] = /image/.test(lower)
      ? "image"
      : /video|clip/.test(lower)
        ? "video"
        : /audio|sound|music|voice/.test(lower)
          ? "audio"
          : /text|string/.test(lower)
            ? "text"
            : "other";
    const range = lower.match(/(\d+)\s*[–—-]\s*(\d+)/);
    const single = lower.match(/\b(\d+)\b/);
    const required = need.toLowerCase() === "required";
    let min = required ? 1 : 0;
    let max = 1;
    if (range) {
      min = Number(range[1]);
      max = Number(range[2]);
    } else if (single) {
      max = Number(single[1]);
      min = required ? Math.min(1, max) : 0;
    } else if (/files/.test(lower)) {
      max = 10;
    }
    if (!required) min = 0;
    inputs.push({
      field,
      label: quoted[0] ?? field,
      description: quoted[1] ?? "",
      kind,
      min,
      max: Math.max(max, min),
      required,
    });
  }
  return inputs;
}
