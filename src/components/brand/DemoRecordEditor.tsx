import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_DEMO_RECORD,
  DEMO_LIMITS,
  demoRecordSchema,
  type DemoEntity,
  type DemoList,
  type DemoRecord,
} from "@/lib/compositions/demo";

/**
 * A brand's demo record: the fictional people, records and figures its
 * product screens show (see src/lib/compositions/demo). Every motion graphic
 * that names {{entity.field}} reads it, so renaming the record here renames
 * it in every one the next time it is drawn.
 */
export function DemoRecordEditor({
  record,
  onRecord,
}: {
  /** null: the kit uses the studio's own fictional record. */
  record: DemoRecord | null;
  onRecord: (record: DemoRecord | null) => void;
}) {
  if (!record)
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          This kit&apos;s product screens use the studio&apos;s own fictional record (Alex Morgan,
          Jordan Lee at Banksia Partners, Project Aurora).
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRecord(structuredClone(DEFAULT_DEMO_RECORD))}
        >
          Give it a record of its own
        </Button>
      </div>
    );

  const checked = demoRecordSchema.safeParse(record);
  const problem =
    duplicateKey(record) ??
    (checked.success
      ? null
      : (() => {
          const issue = checked.error.issues[0]!;
          return `${issue.path.join(" › ")}: ${issue.message}`;
        })());
  const setEntity = (index: number, entity: DemoEntity) =>
    onRecord({
      ...record,
      entities: record.entities.map((entry, at) => (at === index ? entity : entry)),
    });
  const setList = (index: number, list: DemoList) =>
    onRecord({ ...record, lists: record.lists.map((entry, at) => (at === index ? list : entry)) });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="demo-label">
          What its product screens say they are
        </Label>
        <Input
          id="demo-label"
          className="h-8 text-xs"
          value={record.label}
          maxLength={60}
          onChange={(event) => onRecord({ ...record, label: event.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">
          Shown on every recreated screen (e.g. &ldquo;Demo workspace&rdquo;), so nobody takes it
          for real data.
        </p>
      </div>

      {record.entities.map((entity, index) => (
        <fieldset key={index} className="space-y-2 rounded-md border border-border p-2.5">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Key"
              className="h-7 w-28 font-mono text-[11px]"
              value={entity.key}
              maxLength={40}
              onChange={(event) => setEntity(index, { ...entity, key: keyOf(event.target.value) })}
            />
            <Input
              aria-label="What it is"
              className="h-7 flex-1 text-xs"
              value={entity.label}
              maxLength={60}
              onChange={(event) => setEntity(index, { ...entity, label: event.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive"
              aria-label={`Remove ${entity.label}`}
              onClick={() =>
                onRecord({ ...record, entities: record.entities.filter((_, at) => at !== index) })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {entity.fields.map((field, fieldIndex) => {
            const setField = (patch: Partial<typeof field>) =>
              setEntity(index, {
                ...entity,
                fields: entity.fields.map((entry, at) =>
                  at === fieldIndex ? { ...entry, ...patch } : entry,
                ),
              });
            return (
              <div key={fieldIndex} className="grid grid-cols-[7rem_1fr_1.4fr_auto] gap-1.5">
                <Input
                  aria-label="Field key"
                  className="h-7 font-mono text-[11px]"
                  value={field.key}
                  maxLength={40}
                  title={`{{${entity.key}.${field.key}}}`}
                  onChange={(event) => setField({ key: keyOf(event.target.value) })}
                />
                <Input
                  aria-label="Field name"
                  className="h-7 text-xs"
                  value={field.label}
                  maxLength={60}
                  onChange={(event) => setField({ label: event.target.value })}
                />
                <Input
                  aria-label={`${field.label} value`}
                  className="h-7 text-xs"
                  value={field.value}
                  maxLength={200}
                  onChange={(event) => setField({ value: event.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5 text-muted-foreground"
                  aria-label={`Remove ${field.label}`}
                  onClick={() =>
                    setEntity(index, {
                      ...entity,
                      fields: entity.fields.filter((_, at) => at !== fieldIndex),
                    })
                  }
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] text-muted-foreground">
              {entity.fields.length
                ? `{{${entity.key}.${entity.fields[0]!.key}}}${entity.fields.length > 1 ? " …" : ""}`
                : ""}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={entity.fields.length >= DEMO_LIMITS.fields}
              onClick={() =>
                setEntity(index, {
                  ...entity,
                  fields: [
                    ...entity.fields,
                    { key: freeKey("field", entity.fields), label: "New field", value: "" },
                  ],
                })
              }
            >
              <Plus className="mr-1 size-3" /> Field
            </Button>
          </div>
        </fieldset>
      ))}

      {record.lists.map((list, index) => (
        <fieldset key={`list-${index}`} className="space-y-2 rounded-md border border-border p-2.5">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="List key"
              className="h-7 w-28 font-mono text-[11px]"
              value={list.key}
              maxLength={40}
              onChange={(event) => setList(index, { ...list, key: keyOf(event.target.value) })}
            />
            <Input
              aria-label="What the list is"
              className="h-7 flex-1 text-xs"
              value={list.label}
              maxLength={60}
              onChange={(event) => setList(index, { ...list, label: event.target.value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-destructive"
              aria-label={`Remove ${list.label}`}
              onClick={() =>
                onRecord({ ...record, lists: record.lists.filter((_, at) => at !== index) })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <Input
            aria-label="Columns"
            className="h-7 text-xs"
            value={list.columns.join(", ")}
            onChange={(event) =>
              setList(index, {
                ...list,
                columns: event.target.value
                  .split(",")
                  .map((column) => column.trimStart())
                  .slice(0, DEMO_LIMITS.columns),
              })
            }
            onBlur={() =>
              setList(index, {
                ...list,
                columns: list.columns.map((column) => column.trim()).filter(Boolean),
              })
            }
          />
          <div className="space-y-1">
            {list.rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {list.columns.map((column, columnIndex) => (
                  <Input
                    key={columnIndex}
                    aria-label={`${column}, row ${rowIndex + 1}`}
                    className="h-7 min-w-0 flex-1 text-[11px]"
                    value={row[columnIndex] ?? ""}
                    maxLength={200}
                    onChange={(event) =>
                      setList(index, {
                        ...list,
                        rows: list.rows.map((entry, at) =>
                          at === rowIndex
                            ? list.columns.map((_, cell) =>
                                cell === columnIndex ? event.target.value : (entry[cell] ?? ""),
                              )
                            : entry,
                        ),
                      })
                    }
                  />
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5 text-muted-foreground"
                  aria-label={`Remove row ${rowIndex + 1}`}
                  onClick={() =>
                    setList(index, { ...list, rows: list.rows.filter((_, at) => at !== rowIndex) })
                  }
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={list.rows.length >= DEMO_LIMITS.rows}
              onClick={() =>
                setList(index, { ...list, rows: [...list.rows, list.columns.map(() => "")] })
              }
            >
              <Plus className="mr-1 size-3" /> Row
            </Button>
          </div>
        </fieldset>
      ))}

      {problem && (
        <p className="text-[11px] text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={record.entities.length >= DEMO_LIMITS.entities}
          onClick={() =>
            onRecord({
              ...record,
              entities: [
                ...record.entities,
                {
                  key: freeKey("thing", record.entities),
                  label: "Something on screen",
                  fields: [{ key: "name", label: "Name", value: "" }],
                },
              ],
            })
          }
        >
          <Plus className="mr-1 size-3" /> Something on screen
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={record.lists.length >= DEMO_LIMITS.lists}
          onClick={() =>
            onRecord({
              ...record,
              lists: [
                ...record.lists,
                {
                  key: freeKey("list", record.lists),
                  label: "A list",
                  columns: ["Name", "Status"],
                  rows: [["", ""]],
                },
              ],
            })
          }
        >
          <Plus className="mr-1 size-3" /> List
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-xs"
          onClick={() => onRecord(null)}
        >
          Use the studio&apos;s own
        </Button>
      </div>
    </div>
  );
}

/** Typed text as a key: lowercase letters, numbers and _. */
function keyOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
}

function freeKey(base: string, taken: { key: string }[]): string {
  const keys = new Set(taken.map((entry) => entry.key));
  if (!keys.has(base)) return base;
  for (let n = 2; ; n += 1) if (!keys.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Two of the same key would make a placeholder ambiguous. */
function duplicateKey(record: DemoRecord): string | null {
  const seen = new Set<string>();
  for (const entity of record.entities) {
    if (seen.has(entity.key)) return `Two things on screen are both called “${entity.key}”.`;
    seen.add(entity.key);
    const fields = new Set<string>();
    for (const field of entity.fields) {
      if (fields.has(field.key)) return `“${entity.label}” has two fields called “${field.key}”.`;
      fields.add(field.key);
    }
  }
  const lists = new Set<string>();
  for (const list of record.lists) {
    if (lists.has(list.key)) return `Two lists are both called “${list.key}”.`;
    lists.add(list.key);
  }
  return null;
}
