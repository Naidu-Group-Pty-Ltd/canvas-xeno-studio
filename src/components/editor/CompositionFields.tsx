import { useState } from "react";
import { ImageIcon, Plus, X } from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import type { SignedMedia } from "@/hooks/useEditorData";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateField } from "@/lib/compositions/types";
import { cn } from "@/lib/utils";

type Params = Record<string, unknown>;

/**
 * A template's settings as a form, from its fields. Values are the template's
 * own (its schema checks them); library images are picked from the library
 * and shown from signed links.
 */
export function CompositionFields({
  fields,
  params,
  onChange,
  media,
  assets,
  held,
}: {
  fields: readonly TemplateField[];
  params: Params;
  onChange: (params: Params) => void;
  media: Map<string, SignedMedia>;
  assets: Map<string, AssetRow>;
  /** Pictures marked layout only (a client's screen): never shown in a frame. */
  held: Set<string>;
}) {
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });
  // A point is placed on the template's first picture, when it has one.
  const firstImage = fields.find((field) => field.kind === "image");
  const pictureFor =
    firstImage && typeof params[firstImage.key] === "string"
      ? (media.get(params[firstImage.key] as string)?.url ?? null)
      : null;

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          {field.kind !== "toggle" && (
            <Label className="text-xs" htmlFor={`cf-${field.key}`}>
              {field.label}
            </Label>
          )}
          <FieldInput
            field={field}
            value={params[field.key]}
            onChange={(value) => set(field.key, value)}
            media={media}
            assets={assets}
            held={held}
            picture={pictureFor}
          />
          {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  media,
  assets,
  held,
  picture,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  media: Map<string, SignedMedia>;
  assets: Map<string, AssetRow>;
  held: Set<string>;
  picture: string | null;
}) {
  const id = `cf-${field.key}`;
  switch (field.kind) {
    case "text":
      return (
        <Input
          id={id}
          className="h-8 text-xs"
          value={typeof value === "string" ? value : ""}
          maxLength={field.max}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "longtext":
      return (
        <Textarea
          id={id}
          className="min-h-[64px] text-xs"
          value={typeof value === "string" ? value : ""}
          maxLength={field.max}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "lines":
      return <LinesField id={id} max={field.max} value={value} onChange={onChange} />;
    case "number":
      return <NumberField id={id} field={field} value={value} onChange={onChange} />;
    case "choice":
      return (
        <Select
          {...(typeof value === "string" ? { value } : {})}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "toggle":
      return (
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs" htmlFor={id}>
            {field.label}
          </Label>
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );
    case "point":
      return <PointField value={value} onChange={onChange} picture={picture} label={field.label} />;
    case "image":
      return (
        <ImagesField
          ids={typeof value === "string" ? [value] : []}
          max={1}
          optional={field.optional === true}
          media={media}
          assets={assets}
          held={held}
          onChange={(ids) => onChange(ids[0] ?? null)}
          label={field.label}
        />
      );
    case "images":
      return (
        <ImagesField
          ids={Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []}
          max={field.max}
          optional
          media={media}
          assets={assets}
          held={held}
          onChange={onChange}
          label={field.label}
        />
      );
  }
}

/** One entry a line (blank lines dropped once the text is left). */
function LinesField({
  id,
  max,
  value,
  onChange,
}: {
  id: string;
  max: number;
  value: unknown;
  onChange: (value: string[]) => void;
}) {
  const lines = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? lines.join("\n");
  const over = text.split("\n").filter((line) => line.trim()).length > max;
  return (
    <>
      <Textarea
        id={id}
        className="min-h-[84px] font-mono text-[11px] leading-relaxed"
        value={text}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trimEnd())
              .filter((line) => line.trim())
              .slice(0, max),
          );
        }}
        onBlur={() => setDraft(null)}
      />
      {over && (
        <p className="text-[11px] text-warning">Up to {max} lines: the rest aren&apos;t shown.</p>
      )}
    </>
  );
}

function NumberField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Extract<TemplateField, { kind: "number" }>;
  value: unknown;
  onChange: (value: number) => void;
}) {
  const number = typeof value === "number" ? value : field.min;
  const step = field.step ?? 1;
  return (
    <div className="flex items-center gap-2">
      <Slider
        className="flex-1"
        min={field.min}
        max={field.max}
        step={step}
        value={[number]}
        onValueChange={([next]) => onChange(next ?? field.min)}
        aria-label={field.label}
      />
      <Input
        id={id}
        type="number"
        className="h-7 w-20 px-2 text-xs tabular-nums"
        min={field.min}
        max={field.max}
        step={step}
        value={Number.isFinite(number) ? number : ""}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(next))
            onChange(Math.min(field.max, Math.max(field.min, next)));
        }}
      />
    </div>
  );
}

/** A point on the picture (0 to 1 across and down): click or drag to place it. */
function PointField({
  value,
  onChange,
  picture,
  label,
}: {
  value: unknown;
  onChange: (value: { x: number; y: number }) => void;
  picture: string | null;
  label: string;
}) {
  const point =
    value && typeof value === "object" && "x" in value && "y" in value
      ? (value as { x: number; y: number })
      : { x: 0.5, y: 0.5 };
  const place = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    onChange({
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    });
  };
  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuetext={`${Math.round(point.x * 100)}% across, ${Math.round(point.y * 100)}% down`}
      tabIndex={0}
      className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-md border border-border bg-surface-raised bg-cover bg-center"
      style={picture ? { backgroundImage: `url(${JSON.stringify(picture)})` } : undefined}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) place(event);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
        onChange({ x: clamp(point.x + move[0]), y: clamp(point.y + move[1]) });
      }}
    >
      <span
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      />
    </div>
  );
}

/** Library pictures, in order (one, or up to `max`). */
function ImagesField({
  ids,
  max,
  optional,
  media,
  assets,
  held,
  onChange,
  label,
}: {
  ids: string[];
  max: number;
  optional: boolean;
  media: Map<string, SignedMedia>;
  assets: Map<string, AssetRow>;
  held: Set<string>;
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const [picking, setPicking] = useState(false);
  const room = max - ids.length;
  return (
    <div className="space-y-1.5">
      <div className={cn("grid gap-1.5", max === 1 ? "grid-cols-1" : "grid-cols-4")}>
        {ids.map((id, index) => {
          const asset = assets.get(id);
          const url = media.get(id)?.url;
          return (
            <div
              key={`${id}-${index}`}
              className={cn(
                "group relative overflow-hidden rounded-md border border-border bg-surface-raised",
                max === 1 ? "aspect-video" : "aspect-square",
              )}
              title={asset?.title ?? undefined}
            >
              {url ? (
                <img src={url} alt={asset?.title ?? ""} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                  {asset === undefined ? "Loading…" : "Not in the library"}
                </div>
              )}
              {(optional || max > 1) && (
                <button
                  type="button"
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onChange(ids.filter((_, at) => at !== index))}
                  aria-label={`Remove ${asset?.title ?? "picture"}`}
                >
                  <X className="size-3" />
                </button>
              )}
              {held.has(id) && (
                <span className="absolute inset-x-0 bottom-0 bg-destructive/90 px-1 text-[9px] text-white">
                  Layout only: can&apos;t be shown
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full text-xs"
        onClick={() => setPicking(true)}
        disabled={max > 1 && room <= 0}
      >
        {max === 1 ? (
          <>
            <ImageIcon className="mr-1 size-3" />{" "}
            {ids.length ? "Choose another" : "Choose a picture"}
          </>
        ) : (
          <>
            <Plus className="mr-1 size-3" /> Add pictures ({ids.length} of {max})
          </>
        )}
      </Button>
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image"]}
        max={max === 1 ? 1 : Math.max(1, room)}
        title={label}
        onConfirm={(picked) => {
          const chosen = picked.map((asset) => asset.id);
          onChange(max === 1 ? chosen.slice(0, 1) : [...ids, ...chosen].slice(0, max));
        }}
      />
    </div>
  );
}
