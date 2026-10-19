import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  CHANNEL_LABELS,
  CHANNELS,
  FACE_LABELS,
  FACES,
  GOAL_INFO,
  GOALS,
  type BrandDna,
} from "@/lib/brand/dna";
import { formulaById, GUARDRAILS, type BrandFormula, type FormulaBeat } from "@/lib/brand/formulas";
import { OWN_FORMULA_LIMITS, ownFormulaOf } from "@/lib/brand/own-formulas";
import { GradeBadge } from "@/components/brand/FormulaBrowser";
import { FormulaBeats } from "@/components/brand/FormulaPicker";
import { Field, ListField } from "@/components/brand/DesignSystemEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ANYONE = "anyone";
const PURPOSES = {
  brand: "Brand-building",
  activation: "Activation",
  both: "Brand and activation",
} as const;

/** Chips that are on or off, for picking several of a few. */
function Toggles<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? value.filter((entry) => entry !== option) : [...value, option])
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

/** One beat: its name, length, whether it's a hook or call to action, and its job, picture and words. */
function BeatRow({
  beat,
  index,
  count,
  maxSeconds,
  onChange,
  onMove,
  onRemove,
}: {
  beat: FormulaBeat;
  index: number;
  count: number;
  maxSeconds: number;
  onChange: (patch: Partial<FormulaBeat>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-1.5 rounded-md border border-border p-2" data-testid="own-formula-beat">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-5 text-center font-mono text-[11px] text-muted-foreground">
          {index + 1}
        </span>
        <Input
          value={beat.label}
          maxLength={60}
          placeholder="Beat"
          className="h-8 min-w-0 flex-1 text-xs"
          aria-label="Beat name"
          onChange={(event) => onChange({ label: event.target.value })}
        />
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Input
            type="number"
            min={0.5}
            max={OWN_FORMULA_LIMITS.seconds.most}
            step={0.5}
            value={beat.share}
            className="h-8 w-16 text-xs"
            aria-label="Seconds at the ideal length"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) onChange({ share: value });
            }}
          />
          s
        </label>
        <label
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          title="A hook or call to action keeps about its length when the piece is longer or shorter"
        >
          <Checkbox
            checked={!!beat.edge}
            onCheckedChange={(checked) => onChange({ edge: checked === true || undefined })}
          />
          Hook or CTA
        </label>
        <label
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          title="Only in pieces at least this long"
        >
          from
          <Input
            type="number"
            min={0}
            max={maxSeconds}
            step={1}
            value={beat.from ?? ""}
            placeholder="any"
            className="h-8 w-16 text-xs"
            aria-label="Only in pieces at least this many seconds long"
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({ from: event.target.value && value > 0 ? value : undefined });
            }}
          />
          s
        </label>
        <div className="ml-auto flex gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={index === 0}
            aria-label="Move up"
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={index === count - 1}
            aria-label="Move down"
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={count <= 2}
            aria-label={`Remove ${beat.label || "this beat"}`}
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {(
          [
            ["job", "What it must do"],
            ["show", "What's on screen"],
            ["say", "What's said or written"],
          ] as const
        ).map(([key, placeholder]) => (
          <Textarea
            key={key}
            value={beat[key]}
            maxLength={300}
            rows={2}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-h-14 text-xs"
            onChange={(event) => onChange({ [key]: event.target.value })}
          />
        ))}
      </div>
    </li>
  );
}

/**
 * A formula written for the brand, edited: its name and who it's for, what
 * it's for and where it runs, its beats and their timing, its rules and the
 * guardrails it keeps (those of the library formulas it was written from
 * can't be taken off), with its beats timed as a preview.
 */
export function OwnFormulaEditor({
  formula,
  dna,
  brandName,
  onSave,
  onCancel,
}: {
  formula: BrandFormula;
  dna: BrandDna;
  brandName: string;
  onSave: (formula: BrandFormula) => void;
  onCancel: () => void;
}) {
  const [work, setWork] = useState<BrandFormula>(formula);
  const set = (patch: Partial<BrandFormula>) => setWork((current) => ({ ...current, ...patch }));
  const own = work.own ?? { basedOn: [], audience: null, cadence: null };
  const setOwn = (patch: Partial<typeof own>) => set({ own: { ...own, ...patch } });
  const bases = own.basedOn.flatMap((id) => {
    const base = formulaById(id);
    return base ? [base] : [];
  });
  const locked = new Set(bases.flatMap((base) => base.guardrails));
  const setBeat = (index: number, patch: Partial<FormulaBeat>) =>
    set({
      beats: work.beats.map((beat, at) => {
        if (at !== index) return beat;
        const next = { ...beat, ...patch };
        if (!next.edge) delete next.edge;
        if (!next.from) delete next.from;
        return next;
      }),
    });
  const moveBeat = (index: number, by: -1 | 1) => {
    const beats = [...work.beats];
    const [moved] = beats.splice(index, 1);
    beats.splice(index + by, 0, moved!);
    set({ beats });
  };
  const preview = ownFormulaOf(work);

  const save = () => {
    const clean = ownFormulaOf(work);
    if (!clean) {
      toast.error("A formula needs a name and at least two named beats");
      return;
    }
    onSave(clean);
  };

  return (
    <div
      className="space-y-4 rounded-lg border border-primary/40 p-3"
      data-testid="own-formula-editor"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-sm font-medium">Written for {brandName}</p>
        <GradeBadge grade={preview?.grade ?? work.grade} />
        {bases.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            after {bases.map((base) => base.name).join(" and ")}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={work.name}
            maxLength={80}
            className="h-8 text-xs"
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field label="For" hint="One of the brand's audiences, or anyone">
          <Select
            value={own.audience ?? ANYONE}
            onValueChange={(value) => setOwn({ audience: value === ANYONE ? null : value })}
          >
            <SelectTrigger aria-label="For" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANYONE}>Anyone</SelectItem>
              {[
                ...new Set([
                  ...dna.audiences.map((audience) => audience.name),
                  ...(own.audience ? [own.audience] : []),
                ]),
              ].map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="What it does, in a sentence">
        <Textarea
          value={work.summary}
          maxLength={300}
          rows={2}
          className="text-xs"
          onChange={(event) => set({ summary: event.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <Field label="Purpose">
          <Select
            value={work.purpose}
            onValueChange={(value) => set({ purpose: value as BrandFormula["purpose"] })}
          >
            <SelectTrigger aria-label="Purpose" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PURPOSES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Built for">
          <Toggles
            options={GOALS}
            labels={
              Object.fromEntries(GOALS.map((goal) => [goal, GOAL_INFO[goal].label])) as Record<
                (typeof GOALS)[number],
                string
              >
            }
            value={work.goals}
            onChange={(goals) => set({ goals })}
          />
        </Field>
      </div>
      <Field label="Runs on">
        <Toggles
          options={CHANNELS}
          labels={CHANNEL_LABELS}
          value={work.channels}
          onChange={(channels) => set({ channels })}
        />
      </Field>
      <Field label="Fronted by" hint="Who must be in it (none: anyone, or no one)">
        <Toggles
          options={FACES}
          labels={FACE_LABELS}
          value={work.faces}
          onChange={(faces) => set({ faces })}
        />
      </Field>
      <Field
        label="Length (seconds)"
        hint="It works from the shortest to the longest; beats are timed at the ideal"
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["min", "Shortest"],
              ["ideal", "Ideal"],
              ["max", "Longest"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              {label}
              <Input
                type="number"
                min={OWN_FORMULA_LIMITS.seconds.least}
                max={OWN_FORMULA_LIMITS.seconds.most}
                value={work.seconds[key]}
                className="h-8 w-20 text-xs"
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value > 0)
                    set({ seconds: { ...work.seconds, [key]: Math.round(value) } });
                }}
              />
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Beats"
        hint="In order: what each must do, show and say, and its seconds at the ideal length"
      >
        <ol className="space-y-1.5">
          {work.beats.map((beat, index) => (
            <BeatRow
              key={index}
              beat={beat}
              index={index}
              count={work.beats.length}
              maxSeconds={work.seconds.max}
              onChange={(patch) => setBeat(index, patch)}
              onMove={(by) => moveBeat(index, by)}
              onRemove={() => set({ beats: work.beats.filter((_, at) => at !== index) })}
            />
          ))}
        </ol>
        {work.beats.length < OWN_FORMULA_LIMITS.beats && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              set({
                beats: [
                  ...work.beats,
                  {
                    key: `beat-${work.beats.length + 1}`,
                    label: "",
                    share: 5,
                    job: "",
                    show: "",
                    say: "",
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 size-3.5" /> Add a beat
          </Button>
        )}
      </Field>
      {preview && <FormulaBeats formula={preview} seconds={preview.seconds.ideal} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rules it keeps" hint="One a line">
          <ListField lines value={work.rules} onChange={(rules) => set({ rules })} />
        </Field>
        <Field label="Avoid" hint="One a line">
          <ListField lines value={work.avoid} onChange={(avoid) => set({ avoid })} />
        </Field>
      </div>
      <Field
        label="Guardrails"
        hint="Never broken. Those of the formula it was written from stay on."
      >
        <ul className="space-y-1">
          {Object.entries(GUARDRAILS).map(([key, guardrail]) => {
            const on = work.guardrails.includes(key);
            return (
              <li key={key} className="flex items-start gap-2 text-[11px]">
                <Checkbox
                  checked={on}
                  disabled={locked.has(key)}
                  aria-label={guardrail.rule}
                  onCheckedChange={(checked) =>
                    set({
                      guardrails: checked
                        ? [...work.guardrails, key]
                        : work.guardrails.filter((entry) => entry !== key),
                    })
                  }
                />
                <span className={cn(on ? "text-foreground" : "text-muted-foreground")}>
                  {locked.has(key) && <ShieldCheck className="mr-1 inline size-3 text-primary" />}
                  {guardrail.rule}
                </span>
              </li>
            );
          })}
        </ul>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How often" hint="A suggestion, e.g. Weekly on LinkedIn">
          <Input
            value={own.cadence ?? ""}
            maxLength={80}
            className="h-8 text-xs"
            onChange={(event) => setOwn({ cadence: event.target.value || null })}
          />
        </Field>
        <Field label="Why it works">
          <Textarea
            value={work.why}
            maxLength={600}
            rows={2}
            className="text-xs"
            onChange={(event) => set({ why: event.target.value })}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} data-testid="own-formula-save">
          Keep this formula
        </Button>
      </div>
    </div>
  );
}
