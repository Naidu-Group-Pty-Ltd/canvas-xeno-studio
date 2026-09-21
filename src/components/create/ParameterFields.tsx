import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  fieldVisible,
  normalizeOption,
  type FieldSchema,
  type ModelRegistryEntry,
} from "@/lib/model-schema";
import { listMarketingPresets } from "@/lib/generation.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  model: ModelRegistryEntry;
  values: Record<string, unknown>;
  inputRoles: string[];
  onChange: (key: string, value: unknown) => void;
  advanced?: boolean;
  issues?: Record<string, string> | undefined;
}

export function ParameterFields({ model, values, inputRoles, onChange, advanced = false, issues }: Props) {
  const fields = (model.parameter_schema?.fields ?? []).filter(
    (field) => Boolean(field.advanced) === advanced && fieldVisible(field, values, inputRoles) && field.key !== "prompt",
  );

  if (!fields.length) return null;

  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(value) => onChange(field.key, value)}
          issue={issues?.[field.key]}
        />
      ))}
    </div>
  );
}

function FieldLabel({ field, issue }: { field: FieldSchema; issue?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={field.key} className="text-xs font-medium">
        {field.label}
        {field.required && <span className="ml-1 text-primary">*</span>}
      </Label>
      {field.description && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-[10px] text-muted-foreground">info</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{field.description}</TooltipContent>
        </Tooltip>
      )}
      {issue && <span className="text-[11px] text-primary">{issue}</span>}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  issue,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  issue?: string | undefined;
}) {
  const options = (field.options ?? []).map(normalizeOption);

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-raised/40 px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={field.key} className="text-xs font-medium">
            {field.label}
          </Label>
          {field.description && <p className="mt-0.5 text-[11px] text-muted-foreground">{field.description}</p>}
        </div>
        <Switch id={field.key} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
      </div>
    );
  }

  if (field.type === "preset") {
    return <PresetField field={field} value={value} onChange={onChange} issue={issue} />;
  }

  return (
    <div className="space-y-2">
      <FieldLabel field={field} issue={issue} />

      {field.type === "textarea" && (
        <Textarea
          id={field.key}
          value={(value as string) ?? ""}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
        />
      )}

      {field.type === "text" && (
        <Input id={field.key} value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />
      )}

      {(field.type === "select" || field.type === "segmented" || field.type === "aspect_ratio") &&
        (options.length > 6 || field.type === "select" ? (
          <Select value={value === undefined || value === null ? "" : String(value)} onValueChange={(next) => onChange(coerce(next, options))}>
            <SelectTrigger id={field.key}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onChange(option.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  String(value) === String(option.value)
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ))}

      {(field.type === "number" || field.type === "seed") && (
        <div className="flex gap-2">
          <Input
            id={field.key}
            type="number"
            inputMode="numeric"
            value={value === undefined || value === null ? "" : String(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
          />
          {field.type === "seed" && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Randomize seed"
              onClick={() => onChange(Math.floor(Math.random() * (field.max ?? 1_000_000)))}
            >
              <RefreshCw className="size-4" />
            </Button>
          )}
        </div>
      )}

      {field.type === "slider" && (
        <div className="flex items-center gap-3">
          <Slider
            id={field.key}
            value={[Number(value ?? field.default ?? field.min ?? 0)]}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            onValueChange={([next]) => onChange(next)}
            className="flex-1"
          />
          <span className="w-12 text-right font-mono text-xs text-muted-foreground">
            {String(value ?? field.default ?? "")}
          </span>
        </div>
      )}
    </div>
  );
}

function coerce(raw: string, options: { value: string | number }[]) {
  const match = options.find((option) => String(option.value) === raw);
  return match ? match.value : raw;
}

/** Marketing Studio presets are always fetched live — never hardcoded. */
function PresetField({
  field,
  value,
  onChange,
  issue,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  issue?: string | undefined;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["marketing-presets"],
    queryFn: () => listMarketingPresets({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const presets = (data?.presets ?? []) as { id: string; name: string; type?: string }[];

  return (
    <div className="space-y-2">
      <FieldLabel field={field} issue={issue} />
      {isLoading && <p className="text-xs text-muted-foreground">Loading presets…</p>}
      {isError && <p className="text-xs text-primary">Presets are unavailable right now.</p>}
      {!isLoading && !isError && presets.length === 0 && (
        <p className="text-xs text-muted-foreground">No presets returned by the provider.</p>
      )}
      <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto scroll-slim">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={cn(
              "rounded-md border px-2.5 py-2 text-left text-xs transition-colors",
              value === preset.id
                ? "border-primary/60 bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block truncate">{preset.name}</span>
            {preset.type && <span className="block truncate text-[10px] opacity-70">{preset.type}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
