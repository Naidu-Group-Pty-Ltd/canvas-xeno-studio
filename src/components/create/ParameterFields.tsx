import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  fieldVisible,
  normalizeOption,
  type FieldSchema,
  type ModelRegistryEntry,
} from "@/lib/model-schema";
import { listProviderPresets } from "@/lib/generation.functions";
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
  /** Settings set elsewhere on the page (e.g. a long video's clip lengths), so not shown here. */
  hiddenKeys?: string[] | undefined;
}

export function ParameterFields({
  model,
  values,
  inputRoles,
  onChange,
  advanced = false,
  issues,
  hiddenKeys,
}: Props) {
  const fields = (model.parameter_schema?.fields ?? []).filter(
    (field) =>
      Boolean(field.advanced) === advanced &&
      fieldVisible(field, values, inputRoles) &&
      field.key !== "prompt" &&
      !hiddenKeys?.includes(field.key),
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

function FieldLabel({ field, issue }: { field: FieldSchema; issue?: string | undefined }) {
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

/** Shown for an optional choice with no default: nothing is sent and the model decides. */
const AUTO = "__auto__";

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
  // An optional choice without a default can be left to the model.
  const auto = !field.required && field.default === undefined;
  const unset = value === undefined || value === null || value === "";

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
          <Select
            value={unset ? (auto ? AUTO : "") : String(value)}
            onValueChange={(next) => onChange(next === AUTO ? undefined : coerce(next, options))}
          >
            <SelectTrigger id={field.key}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {auto && <SelectItem value={AUTO}>Auto</SelectItem>}
              {options.map((option) => (
                <SelectItem key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {auto && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  unset
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                Auto
              </button>
            )}
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
            placeholder={auto ? "Auto" : undefined}
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
              onClick={() => {
                // Within the model's own range: some seeds start at 1, some go to 2^31.
                const min = Math.max(field.min ?? 0, 0);
                const max = Math.min(field.max ?? 1_000_000, 1_000_000);
                onChange(min + Math.floor(Math.random() * (max - min + 1)));
              }}
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

/** Presets are always fetched live from the catalogue the field names — never hardcoded. */
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
  const [term, setTerm] = useState("");
  const source = field.source === "genjutsu-restyle" ? "genjutsu-restyle" : "marketing-studio";
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["provider-presets", source],
      queryFn: ({ pageParam }) =>
        listProviderPresets({ data: pageParam ? { source, cursor: pageParam } : { source } }),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      staleTime: 5 * 60_000,
    });

  const firstPage = data?.pages[0];
  const presets = (data?.pages ?? []).flatMap(
    (page) => page.presets as { id: string; name: string; type?: string | null; previewUrl?: string | null }[],
  );
  const visible = term.trim()
    ? presets.filter((preset) => `${preset.name} ${preset.type ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()))
    : presets;

  return (
    <div className="space-y-2">
      <FieldLabel field={field} issue={issue} />
      {isLoading && <p className="text-xs text-muted-foreground">Loading presets…</p>}
      {(isError || (firstPage && !firstPage.ok)) && (
        <p className="text-xs text-primary">
          {firstPage?.code === "PROVIDER_NOT_CONFIGURED"
            ? "Presets load once Higgsfield credentials are configured."
            : "Presets are unavailable right now."}
        </p>
      )}
      {!isLoading && firstPage?.ok && presets.length === 0 && (
        <p className="text-xs text-muted-foreground">No presets returned by the provider.</p>
      )}
      {presets.length > 12 && (
        <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search presets" className="h-8 text-xs" />
      )}
      <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto scroll-slim">
        {visible.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={cn(
              "overflow-hidden rounded-md border text-left text-xs transition-colors",
              value === preset.id
                ? "border-primary/60 bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {preset.previewUrl && (
              <img
                src={preset.previewUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="aspect-[4/3] w-full bg-surface-raised object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="block truncate px-2 pt-1.5">{preset.name}</span>
            <span className="block truncate px-2 pb-1.5 text-[10px] opacity-70">{preset.type ?? "\u00a0"}</span>
          </button>
        ))}
      </div>
      {hasNextPage && (
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? "Loading…" : "Load more presets"}
        </Button>
      )}
    </div>
  );
}
