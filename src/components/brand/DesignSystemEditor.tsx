import {
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Plus, Sparkles, X } from "lucide-react";
import {
  brandAvoidLine,
  brandStyleLine,
  PALETTE_ROLE_LABELS,
  PALETTE_ROLES,
  type BrandDesign,
  type PaletteColour,
  type PaletteRole,
} from "@/lib/brand/design";
import { colourName } from "@/lib/brand/colour";
import type { FoundColour } from "@/lib/brand/proposal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A list edited as text: words split at commas (or lines at line breaks), kept once typing stops. */
export function ListField({
  value,
  onChange,
  lines = false,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  lines?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const joined = value.join(lines ? "\n" : ", ");
  const [text, setText] = useState(joined);
  useEffect(() => setText(joined), [joined]);
  const commit = () => {
    const next = text
      .split(lines ? /\n/ : /[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (next.join("\u0000") !== value.join("\u0000")) onChange(next);
  };
  return lines ? (
    <Textarea
      id={id}
      value={text}
      placeholder={placeholder}
      className="min-h-[72px] text-xs"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
    />
  ) : (
    <Input
      id={id}
      value={text}
      placeholder={placeholder}
      className="h-8 text-xs"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  const id = useId();
  // One control (an input or a text box) is named by the label; a select names its own trigger.
  const single =
    isValidElement<{ id?: string }>(children) && children.type !== Fragment && !children.props.id;
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={single ? id : undefined} className="text-xs">
        {label}
      </Label>
      {single ? cloneElement(children, { id }) : children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  hint,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Textarea
        value={value ?? ""}
        rows={rows}
        placeholder={placeholder}
        className="min-h-0 text-xs"
        onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
      />
    </Field>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** One colour of a palette: its swatch, name, role and use. */
function PaletteRow({
  colour,
  onChange,
  onRemove,
}: {
  colour: PaletteColour;
  onChange: (colour: PaletteColour) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2" data-testid="palette-colour">
      <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
        <span className="absolute inset-0" style={{ background: colour.hex }} />
        <input
          type="color"
          value={colour.hex}
          onChange={(event) => onChange({ ...colour, hex: event.target.value.toLowerCase() })}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`Change ${colour.name}`}
        />
      </label>
      <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[1fr_8rem_1fr]">
        <Input
          value={colour.name}
          maxLength={40}
          className="h-8 text-xs"
          onChange={(event) => onChange({ ...colour, name: event.target.value })}
          aria-label="Colour name"
        />
        <Select
          value={colour.role}
          onValueChange={(value) => onChange({ ...colour, role: value as PaletteRole })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PALETTE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {PALETTE_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={colour.usage ?? ""}
          maxLength={120}
          placeholder="What it's used for"
          className="h-8 text-xs"
          onChange={(event) => onChange({ ...colour, usage: event.target.value || null })}
          aria-label="What it's used for"
        />
      </div>
      <span className="hidden w-16 font-mono text-[11px] text-muted-foreground md:block">
        {colour.hex}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        onClick={onRemove}
        aria-label={`Remove ${colour.name}`}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/** Adds a colour: one the scan found, or any. */
function AddColour({
  found,
  palette,
  onAdd,
}: {
  found: FoundColour[];
  palette: PaletteColour[];
  onAdd: (colour: PaletteColour) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("#2563eb");
  const unused = found.filter((colour) => !palette.some((entry) => entry.hex === colour.hex));
  const add = (hex: string, name?: string) => {
    onAdd({ hex, name: name ?? colourName(hex), role: "other", usage: null });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8" disabled={palette.length >= 24}>
          <Plus className="mr-1.5 size-3.5" /> Add a colour
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        {unused.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Found on the site or in the document
            </p>
            <div className="grid grid-cols-8 gap-1">
              {unused.slice(0, 32).map((colour) => (
                <button
                  key={colour.hex}
                  type="button"
                  title={`${colour.name} ${colour.hex}${colour.share ? ` · ${Math.round(colour.share * 100)}%` : ""}`}
                  className="aspect-square rounded border border-border transition hover:scale-110"
                  style={{ background: colour.hex }}
                  onClick={() => add(colour.hex, colour.name)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Any colour"
          />
          <Button size="sm" variant="secondary" className="h-8" onClick={() => add(custom)}>
            Add {custom}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A brand's design system, edited: its palette (each colour with its job),
 * the look of its imagery, its voice and its rules, with the line every
 * picture and clip made in it carries shown as it reads.
 */
export function DesignSystemEditor({
  name,
  palette,
  onPalette,
  design,
  onDesign,
  found = [],
}: {
  name: string;
  palette: PaletteColour[];
  onPalette: (palette: PaletteColour[]) => void;
  design: BrandDesign;
  onDesign: (design: BrandDesign) => void;
  found?: FoundColour[];
}) {
  const setDesign = (patch: Partial<BrandDesign>) => onDesign({ ...design, ...patch });
  const setVisual = (patch: Partial<BrandDesign["visual"]>) =>
    setDesign({ visual: { ...design.visual, ...patch } });
  const setVoice = (patch: Partial<BrandDesign["voice"]>) =>
    setDesign({ voice: { ...design.voice, ...patch } });
  const look = {
    name: name || "the brand",
    tagline: null,
    callToAction: null,
    website: null,
    palette,
    design,
    terms: [],
  };
  const styleLine = brandStyleLine(look, "video");
  const avoidLine = brandAvoidLine(look);

  return (
    <div className="space-y-6" data-testid="design-system-editor">
      <Section title="Palette">
        <div className="flex h-10 overflow-hidden rounded-md border border-border">
          {palette.length ? (
            palette.map((colour) => (
              <div
                key={colour.hex}
                className="flex-1"
                style={{ background: colour.hex }}
                title={`${colour.name} · ${PALETTE_ROLE_LABELS[colour.role]}`}
              />
            ))
          ) : (
            <p className="m-auto text-xs text-muted-foreground">No colours yet</p>
          )}
        </div>
        <div className="space-y-2">
          {palette.map((colour, index) => (
            <PaletteRow
              key={`${colour.hex}-${index}`}
              colour={colour}
              onChange={(next) =>
                onPalette(palette.map((entry, at) => (at === index ? next : entry)))
              }
              onRemove={() => onPalette(palette.filter((_, at) => at !== index))}
            />
          ))}
        </div>
        <AddColour
          found={found}
          palette={palette}
          onAdd={(colour) => onPalette([...palette, colour])}
        />
      </Section>

      <Section title="The look">
        <TextField
          label="The line every picture and clip carries"
          value={design.promptStyle}
          onChange={(value) => setDesign({ promptStyle: value })}
          rows={3}
          placeholder="e.g. Clean, sunlit documentary photography in deep navy, warm sand and off-white; calm, confident, generous negative space."
          hint="One sentence on the look: colours by name, light, style, mood. No brand names or text."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mood">
            <ListField
              value={design.visual.mood}
              onChange={(mood) => setVisual({ mood })}
              placeholder="calm, premium, optimistic"
            />
          </Field>
          <Field label="Personality">
            <ListField
              value={design.personality}
              onChange={(personality) => setDesign({ personality })}
              placeholder="confident, warm, precise"
            />
          </Field>
          <TextField
            label="Photography"
            value={design.visual.photography}
            onChange={(photography) => setVisual({ photography })}
          />
          <TextField
            label="Lighting"
            value={design.visual.lighting}
            onChange={(lighting) => setVisual({ lighting })}
          />
          <TextField
            label="Colour grading"
            value={design.visual.colourGrading}
            onChange={(colourGrading) => setVisual({ colourGrading })}
          />
          <TextField
            label="Composition"
            value={design.visual.composition}
            onChange={(composition) => setVisual({ composition })}
          />
          <TextField
            label="Motion (for video)"
            value={design.visual.motion}
            onChange={(motion) => setVisual({ motion })}
          />
          <TextField
            label="Illustration"
            value={design.visual.illustration}
            onChange={(illustration) => setVisual({ illustration })}
          />
          <TextField
            label="Graphics and shapes"
            value={design.visual.graphics}
            onChange={(graphics) => setVisual({ graphics })}
          />
          <TextField
            label="Texture"
            value={design.visual.texture}
            onChange={(texture) => setVisual({ texture })}
          />
        </div>
        <TextField
          label="Never show"
          value={design.avoid}
          onChange={(avoid) => setDesign({ avoid })}
          placeholder="e.g. neon colours, cluttered backgrounds, staged stock-photo poses"
        />
      </Section>

      <Section title="Voice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tone">
            <ListField
              value={design.voice.tone}
              onChange={(tone) => setVoice({ tone })}
              placeholder="plain-spoken, reassuring"
            />
          </Field>
          <TextField
            label="How it speaks"
            value={design.voice.description}
            onChange={(description) => setVoice({ description })}
          />
          <Field label="Words it uses">
            <ListField
              value={design.voice.vocabulary}
              onChange={(vocabulary) => setVoice({ vocabulary })}
            />
          </Field>
          <Field label="Words it never uses">
            <ListField value={design.voice.avoid} onChange={(avoid) => setVoice({ avoid })} />
          </Field>
        </div>
        <Field label="Lines that sound like it (one per line)">
          <ListField
            lines
            value={design.voice.sampleLines}
            onChange={(sampleLines) => setVoice({ sampleLines })}
          />
        </Field>
      </Section>

      <Section title="About and rules">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="What the brand is"
            value={design.summary}
            onChange={(summary) => setDesign({ summary })}
            rows={3}
          />
          <TextField
            label="Who it speaks to"
            value={design.audience}
            onChange={(audience) => setDesign({ audience })}
            rows={3}
          />
          <Field label="Always (one per line)">
            <ListField lines value={design.dos} onChange={(dos) => setDesign({ dos })} />
          </Field>
          <Field label="Never (one per line)">
            <ListField lines value={design.donts} onChange={(donts) => setDesign({ donts })} />
          </Field>
          <TextField
            label="The logo"
            value={design.logo.description}
            onChange={(description) => setDesign({ logo: { ...design.logo, description } })}
          />
          <TextField
            label="Logo rules"
            value={design.logo.usage}
            onChange={(usage) => setDesign({ logo: { ...design.logo, usage } })}
          />
        </div>
      </Section>

      <div
        className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"
        data-testid="brand-style-preview"
      >
        <p className="flex items-center gap-1.5 font-medium">
          <Sparkles className="size-3.5 text-primary" /> What every generation in this brand carries
        </p>
        <p className="text-muted-foreground">
          {styleLine || "Add a look line, mood or palette and it shows here."}
        </p>
        {avoidLine && <p className="text-muted-foreground">Avoid: {avoidLine}</p>}
      </div>
    </div>
  );
}
