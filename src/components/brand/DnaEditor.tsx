import { Loader2, Plus, Sparkles, X } from "lucide-react";
import {
  ARCHETYPE_INFO,
  ARCHETYPES,
  BRAND_TYPE_INFO,
  BRAND_TYPES,
  CHANNEL_LABELS,
  CHANNELS,
  FACE_LABELS,
  FACES,
  GOAL_INFO,
  GOALS,
  MARKET_LABELS,
  MARKETS,
  positioningLine,
  type Archetype,
  type BrandDna,
  type BrandPillar,
  type BrandType,
} from "@/lib/brand/dna";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, ListField, Section, TextField } from "@/components/brand/DesignSystemEditor";
import { cn } from "@/lib/utils";

const NONE = "none";

/** Chips that are on or off, for picking several of a few. */
function Chips<T extends string>({
  options,
  labels,
  value,
  onChange,
  max,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
  max?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value.includes(option);
        const full = !on && max !== undefined && value.length >= max;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            disabled={full}
            onClick={() =>
              onChange(on ? value.filter((entry) => entry !== option) : [...value, option])
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
              full && "opacity-40",
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

function PillarRows({
  pillars,
  onChange,
}: {
  pillars: BrandPillar[];
  onChange: (pillars: BrandPillar[]) => void;
}) {
  const set = (index: number, patch: Partial<BrandPillar>) =>
    onChange(pillars.map((pillar, at) => (at === index ? { ...pillar, ...patch } : pillar)));
  return (
    <div className="space-y-1.5">
      {pillars.map((pillar, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] gap-1.5">
          <Input
            value={pillar.name}
            maxLength={60}
            placeholder="Pillar"
            className="h-8 text-xs"
            onChange={(event) => set(index, { name: event.target.value })}
          />
          <Input
            value={pillar.about ?? ""}
            maxLength={160}
            placeholder="What content under it covers"
            className="h-8 text-xs"
            onChange={(event) => set(index, { about: event.target.value || null })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Remove ${pillar.name || "this pillar"}`}
            onClick={() => onChange(pillars.filter((_, at) => at !== index))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {pillars.length < 6 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange([...pillars, { name: "", about: null }])}
        >
          <Plus className="mr-1 size-3.5" /> Add a pillar
        </Button>
      )}
    </div>
  );
}

/**
 * A brand's DNA, edited: what kind of brand it is and who it sells to, its
 * archetype, what it is and why it rather than another, the themes its
 * content comes back to, the moments buyers think of it, what it can prove,
 * its distinctive assets, who fronts its content, where it publishes and
 * what its content is for now. With `onSuggest`, the studio's AI reads it
 * from the brand for a person to look over.
 */
export function DnaEditor({
  dna,
  onDna,
  name,
  audience,
  onSuggest,
  suggesting = false,
}: {
  dna: BrandDna;
  onDna: (dna: BrandDna) => void;
  name: string;
  audience: string | null;
  onSuggest?: (() => void) | undefined;
  suggesting?: boolean;
}) {
  const set = (patch: Partial<BrandDna>) => onDna({ ...dna, ...patch });
  const archetype = dna.archetype ? ARCHETYPE_INFO[dna.archetype] : null;
  const positioning = positioningLine(dna, { name: name || "The brand", audience });
  const typeLabels = Object.fromEntries(
    BRAND_TYPES.map((type) => [type, BRAND_TYPE_INFO[type].label]),
  ) as Record<BrandType, string>;

  return (
    <div className="space-y-5" data-testid="dna-editor">
      {onSuggest && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            The DNA ranks the formulas content is made with, and tells the AI what kind of brand
            this is.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={suggesting}
            onClick={onSuggest}
          >
            {suggesting ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3.5" />
            )}
            {suggesting ? "Reading the brand…" : "Suggest from the brand"}
          </Button>
        </div>
      )}

      <Section title="Kind of brand">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="It is mainly"
            hint={dna.type ? BRAND_TYPE_INFO[dna.type].hint : "Formulas are ranked for this"}
          >
            <Select
              value={dna.type ?? NONE}
              onValueChange={(value) => {
                const type = value === NONE ? null : (value as BrandType);
                set({ type, alsoTypes: dna.alsoTypes.filter((entry) => entry !== type) });
              }}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="dna-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {BRAND_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {BRAND_TYPE_INFO[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Selling to">
            <Select
              value={dna.market ?? NONE}
              onValueChange={(value) =>
                set({ market: value === NONE ? null : (value as BrandDna["market"]) })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {MARKETS.map((market) => (
                  <SelectItem key={market} value={market}>
                    {MARKET_LABELS[market]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="It is also (up to two)">
          <Chips
            options={BRAND_TYPES.filter((type) => type !== dna.type)}
            labels={typeLabels}
            value={dna.alsoTypes}
            onChange={(alsoTypes) => set({ alsoTypes })}
            max={2}
          />
        </Field>
      </Section>

      <Section title="Character">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Archetype" hint="Mark & Pearson's twelve brand archetypes">
            <Select
              value={dna.archetype ?? NONE}
              onValueChange={(value) => {
                const next = value === NONE ? null : (value as Archetype);
                set({
                  archetype: next,
                  archetypeAlso: dna.archetypeAlso === next ? null : dna.archetypeAlso,
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {ARCHETYPES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {ARCHETYPE_INFO[entry].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="With a touch of">
            <Select
              value={dna.archetypeAlso ?? NONE}
              onValueChange={(value) =>
                set({ archetypeAlso: value === NONE ? null : (value as Archetype) })
              }
              disabled={!dna.archetype}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nothing else</SelectItem>
                {ARCHETYPES.filter((entry) => entry !== dna.archetype).map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {ARCHETYPE_INFO[entry].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {archetype && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {archetype.label}: driven by {archetype.desire}. It reads as {archetype.tells}.
          </p>
        )}
      </Section>

      <Section title="Positioning">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What it is, in its buyers' words">
            <Input
              value={dna.category ?? ""}
              maxLength={200}
              placeholder="e.g. an AI operating system for property firms"
              className="h-8 text-xs"
              onChange={(event) => set({ category: event.target.value || null })}
            />
          </Field>
          <Field label="The job buyers hire it for">
            <Input
              value={dna.job ?? ""}
              maxLength={200}
              placeholder="e.g. run the whole firm from one governed place"
              className="h-8 text-xs"
              onChange={(event) => set({ job: event.target.value || null })}
            />
          </Field>
        </div>
        <TextField
          label="Why it, rather than the alternative"
          value={dna.difference}
          onChange={(difference) => set({ difference })}
          placeholder="What it does that the usual way doesn't"
        />
        {positioning && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {positioning}
          </p>
        )}
      </Section>

      <Section title="What its content is about">
        <Field label="Content pillars" hint="Three to five themes its content keeps coming back to">
          <PillarRows pillars={dna.pillars} onChange={(pillars) => set({ pillars })} />
        </Field>
        <Field
          label="Buying moments"
          hint="When buyers think of it (one a line): hooks start from these"
        >
          <ListField
            lines
            value={dna.moments}
            onChange={(moments) => set({ moments })}
            placeholder="When a firm outgrows its spreadsheets"
          />
        </Field>
        <Field
          label="Proof it stands behind"
          hint="Results, numbers, clients, reviews (one a line): content claims only these"
        >
          <ListField lines value={dna.proof} onChange={(proof) => set({ proof })} />
        </Field>
        <Field
          label="Distinctive assets"
          hint="What makes it recognisable at a glance (one a line): shown early and often"
        >
          <ListField
            lines
            value={dna.assets}
            onChange={(assets) => set({ assets })}
            placeholder="The gold triangular emblem"
          />
        </Field>
      </Section>

      <Section title="Publishing">
        <Field label="Fronted by">
          <Chips
            options={FACES}
            labels={FACE_LABELS}
            value={dna.faces}
            onChange={(faces) => set({ faces })}
          />
        </Field>
        <Field label="Publishes on">
          <Chips
            options={CHANNELS}
            labels={CHANNEL_LABELS}
            value={dna.channels}
            onChange={(channels) => set({ channels })}
          />
        </Field>
        <Field label="Most content is for" hint={dna.goal ? GOAL_INFO[dna.goal].hint : undefined}>
          <Select
            value={dna.goal ?? NONE}
            onValueChange={(value) =>
              set({ goal: value === NONE ? null : (value as BrandDna["goal"]) })
            }
          >
            <SelectTrigger className="h-8 text-xs sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {GOALS.map((goal) => (
                <SelectItem key={goal} value={goal}>
                  {GOAL_INFO[goal].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>
    </div>
  );
}
