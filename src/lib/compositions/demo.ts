/**
 * A brand's demo record: the one fictional set of people, records and figures
 * every product screen in its compositions reads, so a reel never shows a
 * real client and renaming the record is one edit (Reel 1's rename to 14
 * Wattle Grove touched every file that named the old record).
 *
 * A template's text names a field as {{entity.field}} ("{{record.title}}",
 * "{{person.name}}") and a list by its key; the record fills them in when the
 * composition is drawn. Kept on the brand kit (`demo_record`, migration
 * 0034_compositions) and edited on the Brand page.
 *
 * Read tolerantly (anything malformed is dropped, so a kit always reads);
 * shared by the browser, the server and tests.
 */
import { z } from "zod";

const key = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "A key is lowercase letters, numbers and _ (e.g. record)");
const value = z.string().trim().max(200);

export const DEMO_LIMITS = { entities: 12, fields: 24, lists: 6, columns: 8, rows: 30 } as const;

export const demoFieldSchema = z.object({ key, label: z.string().trim().min(1).max(60), value });
export const demoEntitySchema = z.object({
  key,
  label: z.string().trim().min(1).max(60),
  fields: z.array(demoFieldSchema).max(DEMO_LIMITS.fields),
});
export const demoListSchema = z.object({
  key,
  label: z.string().trim().min(1).max(60),
  columns: z.array(z.string().trim().min(1).max(40)).min(1).max(DEMO_LIMITS.columns),
  rows: z.array(z.array(value).max(DEMO_LIMITS.columns)).max(DEMO_LIMITS.rows),
});
export const demoRecordSchema = z.object({
  /** What every recreated product screen says it is, so nobody takes it for real data. */
  label: z.string().trim().min(1).max(60).default("Demo workspace"),
  entities: z.array(demoEntitySchema).max(DEMO_LIMITS.entities).default([]),
  lists: z.array(demoListSchema).max(DEMO_LIMITS.lists).default([]),
});
export type DemoRecord = z.infer<typeof demoRecordSchema>;
export type DemoEntity = z.infer<typeof demoEntitySchema>;
export type DemoList = z.infer<typeof demoListSchema>;

/**
 * The record a brand without its own starts from: plainly fictional people
 * and figures, with the fields the studio's product templates read.
 */
export const DEFAULT_DEMO_RECORD: DemoRecord = {
  label: "Demo workspace",
  entities: [
    {
      key: "person",
      label: "The person using the product",
      fields: [
        { key: "name", label: "Name", value: "Alex Morgan" },
        { key: "role", label: "Role", value: "Account lead" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
    },
    {
      key: "client",
      label: "Their client",
      fields: [
        { key: "name", label: "Name", value: "Jordan Lee" },
        { key: "company", label: "Company", value: "Banksia Partners" },
        { key: "location", label: "Location", value: "Sydney NSW" },
      ],
    },
    {
      key: "record",
      label: "The record on screen",
      fields: [
        { key: "title", label: "Title", value: "Project Aurora" },
        { key: "subtitle", label: "Subtitle", value: "Opened 12 October" },
        { key: "reference", label: "Reference", value: "DEMO-0142" },
        { key: "status", label: "Status", value: "In review" },
        { key: "grade", label: "Grade", value: "A+" },
        { key: "score", label: "Score", value: "84" },
        { key: "verdict", label: "Verdict", value: "Strong" },
      ],
    },
    {
      key: "metrics",
      label: "Figures",
      fields: [
        { key: "first", label: "First figure", value: "1,284" },
        { key: "first_label", label: "First figure's label", value: "Active records" },
        { key: "second", label: "Second figure", value: "96%" },
        { key: "second_label", label: "Second figure's label", value: "On time" },
        { key: "third", label: "Third figure", value: "4.8" },
        { key: "third_label", label: "Third figure's label", value: "Client rating" },
      ],
    },
  ],
  lists: [
    {
      key: "items",
      label: "Records",
      columns: ["Record", "Owner", "Status"],
      rows: [
        ["Project Aurora", "Alex Morgan", "In review"],
        ["Harbour Fitout", "Sam Patel", "Approved"],
        ["Northside Launch", "Riley Chen", "In progress"],
        ["Coastal Refresh", "Jordan Lee", "Booked"],
        ["Market Study", "Casey Ford", "Drafting"],
      ],
    },
  ],
};

/** A kit's stored record, read tolerantly: what doesn't fit is dropped; nothing stored gives null. */
export function demoRecordOf(value: unknown): DemoRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entities = (Array.isArray(record["entities"]) ? record["entities"] : []).flatMap(
    (entry) => {
      const parsed = demoEntitySchema.safeParse(entry);
      if (parsed.success) return [parsed.data];
      // An entity with one bad field keeps the rest.
      const loose = (entry ?? {}) as Record<string, unknown>;
      const fields = (Array.isArray(loose["fields"]) ? loose["fields"] : []).flatMap((field) => {
        const one = demoFieldSchema.safeParse(field);
        return one.success ? [one.data] : [];
      });
      const shell = demoEntitySchema.safeParse({ ...loose, fields });
      return shell.success ? [shell.data] : [];
    },
  );
  const lists = (Array.isArray(record["lists"]) ? record["lists"] : []).flatMap((entry) => {
    const parsed = demoListSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const label =
    typeof record["label"] === "string" && record["label"].trim() ? record["label"] : "";
  const parsed = demoRecordSchema.safeParse({
    ...(label ? { label } : {}),
    entities: entities.slice(0, DEMO_LIMITS.entities),
    lists: lists.slice(0, DEMO_LIMITS.lists),
  });
  return parsed.success ? parsed.data : null;
}

/** A field's value by its path ("record.title"), or null when the record has none. */
export function demoValue(record: DemoRecord, path: string): string | null {
  const [entityKey, fieldKey] = path.split(".");
  if (!entityKey || !fieldKey) return null;
  const entity = record.entities.find((entry) => entry.key === entityKey);
  return entity?.fields.find((field) => field.key === fieldKey)?.value ?? null;
}

/** A list by its key, or null. */
export function demoList(record: DemoRecord, listKey: string): DemoList | null {
  return record.lists.find((list) => list.key === listKey) ?? null;
}

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\s*\}\}/g;

/**
 * Text with the record's fields filled in. A field the record doesn't have is
 * left out (never shown as "{{…}}" in a video) and reported in `missing`, so
 * the Editor can say what to add.
 */
export function fillDemo(text: string, record: DemoRecord): { text: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(PLACEHOLDER, (_whole, path: string) => {
    const found = demoValue(record, path);
    if (found === null) {
      missing.push(path);
      return "";
    }
    return found;
  });
  return { text: filled.replace(/[ \t]{2,}/g, " ").trim(), missing: [...new Set(missing)] };
}

/** Every placeholder a text names. */
export function demoPaths(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]!))];
}
