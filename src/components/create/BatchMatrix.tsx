import { Grid3x3, X } from "lucide-react";
import { normalizeOption, type ModelRegistryEntry } from "@/lib/model-schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type MatrixSelection = Record<string, (string | number)[]>;

/**
 * Batch matrix: pick several values for one or more registry-declared choice
 * fields and every combination becomes its own generation. Purely
 * registry-driven — no model-specific code.
 */
export function BatchMatrix({
  model,
  values,
  selection,
  onChange,
}: {
  model: ModelRegistryEntry | null;
  values: Record<string, unknown>;
  selection: MatrixSelection;
  onChange: (next: MatrixSelection) => void;
}) {
  if (!model) return null;
  // Main settings with a handful of choices (aspect ratios however many); a
  // 50-entry palette or an advanced setting isn't a sensible matrix axis.
  const fields = (model.parameter_schema?.fields ?? []).filter((field) => {
    const count = field.options?.length ?? 0;
    return !field.advanced && count > 1 && (count <= 12 || field.type === "aspect_ratio");
  });
  if (!fields.length) return null;

  function toggle(key: string, value: string | number) {
    const current = selection[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const updated = { ...selection };
    if (next.length > 1) updated[key] = next;
    else delete updated[key];
    onChange(updated);
  }

  const combinations = Object.values(selection).reduce((total, list) => total * list.length, 1);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Grid3x3 className="size-4 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Batch matrix</h4>
        {combinations > 1 && (
          <>
            <span className="text-xs text-primary">{combinations} generations</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => onChange({})}>
              <X className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Select two or more values for a setting to generate every combination. Each combination is a separate, separately
        estimated generation.
      </p>
      {fields.map((field) => (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground">{field.label ?? field.key}</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(field.options ?? []).map((option) => {
              const { value, label } = normalizeOption(option);
              const picked = (selection[field.key] ?? []).includes(value);
              const isCurrent = values[field.key] === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => toggle(field.key, value)}
                  className={
                    picked
                      ? "rounded-md border border-primary bg-primary/15 px-2 py-1 text-xs text-foreground"
                      : `rounded-md border border-border px-2 py-1 text-xs ${isCurrent ? "text-foreground" : "text-muted-foreground"} hover:text-foreground`
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Expand a matrix selection into concrete parameter overrides. */
export function expandMatrix(selection: MatrixSelection): Record<string, string | number>[] {
  const keys = Object.keys(selection).filter((key) => (selection[key] ?? []).length > 1);
  if (!keys.length) return [];
  let combos: Record<string, string | number>[] = [{}];
  for (const key of keys) {
    const next: Record<string, string | number>[] = [];
    for (const combo of combos) for (const value of selection[key]!) next.push({ ...combo, [key]: value });
    combos = next;
  }
  return combos;
}
