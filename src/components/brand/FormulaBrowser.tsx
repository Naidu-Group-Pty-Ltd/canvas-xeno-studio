import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FlaskConical,
  Pin,
  PinOff,
  Scale,
  ShieldCheck,
} from "lucide-react";
import {
  CHANNEL_LABELS,
  CHANNELS,
  GOAL_INFO,
  GOALS,
  type BrandDna,
  type Channel,
  type Goal,
} from "@/lib/brand/dna";
import {
  CHANNEL_GUIDES,
  contentMix,
  GRADE_INFO,
  GUARDRAILS,
  rankFormulas,
  SOURCES,
  sourcesOf,
  timedBeats,
  UNIVERSAL_RULES,
  type BrandFormula,
  type FormulaSource,
  type RankedFormula,
} from "@/lib/brand/formulas";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ANY = "any";
const LENGTHS = [15, 30, 60, 90] as const;

const PURPOSE_LABELS = {
  brand: "Brand-building",
  activation: "Activation",
  both: "Brand and activation",
} as const;

export const FIT_STYLES = {
  strong: "bg-primary/15 text-primary",
  good: "bg-muted text-foreground",
  possible: "bg-muted text-muted-foreground",
} as const;

export const FIT_LABELS = { strong: "Strong fit", good: "Good fit", possible: "Possible" } as const;

/** How strong a formula's evidence is: measured, guided by a platform or research, or convention. */
export function GradeBadge({ grade }: { grade: BrandFormula["grade"] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
      title={GRADE_INFO[grade].hint}
    >
      <FlaskConical className="size-3" />
      {grade} · {GRADE_INFO[grade].label}
    </span>
  );
}

/** A source, linked, with how far it was checked and what it's relied on for. */
function SourceItem({ source }: { source: FormulaSource }) {
  return (
    <li>
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {source.title} · {source.publisher}
        {source.year ? ` (${source.year})` : ""}
        <ExternalLink className="size-3" />
      </a>
      <span
        className="ml-1.5 text-[10px] text-muted-foreground/80"
        title={
          source.checked === "opened"
            ? "The page itself was read"
            : "Its text was read from the publisher's page through web search"
        }
      >
        {source.checked === "opened" ? "read in full" : "read via search"}
      </span>
      {source.note && <p className="text-[11px] text-muted-foreground/80">{source.note}</p>}
    </li>
  );
}

function FormulaCard({
  entry,
  seconds,
  channel,
  pinned,
  onPin,
  ranked,
}: {
  entry: RankedFormula;
  seconds: number | null;
  channel: Channel | null;
  pinned: boolean;
  onPin?: (() => void) | undefined;
  /** Ranked for a kind of brand (else its fit says nothing). */
  ranked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { formula } = entry;
  const length =
    seconds && seconds >= formula.seconds.min && seconds <= formula.seconds.max
      ? seconds
      : formula.seconds.ideal;
  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-3 text-sm",
        pinned ? "border-primary/50" : "border-border",
      )}
      data-testid="formula-card"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-medium">{formula.name}</p>
            {ranked && (
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", FIT_STYLES[entry.fit])}>
                {FIT_LABELS[entry.fit]}
              </span>
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {PURPOSE_LABELS[formula.purpose]}
            </span>
            <GradeBadge grade={formula.grade} />
          </div>
          <p className="text-xs text-muted-foreground">{formula.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            {formula.seconds.min}–{formula.seconds.max} s ·{" "}
            {formula.channels.map((entry) => CHANNEL_LABELS[entry]).join(", ")} · {formula.origin}
          </p>
          {(entry.reasons.length > 0 || entry.cautions.length > 0) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {entry.reasons.map((reason) => (
                <span key={reason} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {reason}
                </span>
              ))}
              {entry.cautions.map((caution) => (
                <span
                  key={caution}
                  className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
                >
                  <AlertTriangle className="size-3" /> {caution}
                </span>
              ))}
            </div>
          )}
        </div>
        {onPin && (
          <Button
            type="button"
            size="sm"
            variant={pinned ? "secondary" : "ghost"}
            className="h-7 shrink-0 text-xs"
            onClick={onPin}
            aria-pressed={pinned}
          >
            {pinned ? <PinOff className="mr-1 size-3.5" /> : <Pin className="mr-1 size-3.5" />}
            {pinned ? "Unpin" : "Pin"}
          </Button>
        )}
      </div>

      <button
        type="button"
        className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide the beats" : `The beats at ${length} s, its rules and sources`}
      </button>

      {open && (
        <div className="mt-2 space-y-3 border-t border-border pt-3 text-xs">
          <ol className="space-y-2">
            {timedBeats(formula, length).map((beat) => (
              <li key={beat.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {beat.from}–{beat.to} s
                </span>
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {beat.label}{" "}
                    <span className="font-normal text-muted-foreground">· {beat.job}</span>
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground/80">Show:</span> {beat.show}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="text-foreground/80">Say:</span> {beat.say}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {formula.rules.length > 0 && (
            <div>
              <p className="font-medium">Rules</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {formula.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          {channel && CHANNEL_GUIDES[channel].rules.length > 0 && (
            <div>
              <p className="font-medium">On {CHANNEL_LABELS[channel]}</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {CHANNEL_GUIDES[channel].rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          {formula.avoid.length > 0 && (
            <div>
              <p className="font-medium">Avoid</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {formula.avoid.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          {formula.guardrails.length > 0 && (
            <div>
              <p className="flex items-center gap-1 font-medium">
                <ShieldCheck className="size-3.5 text-primary" /> Guardrails
              </p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {formula.guardrails.flatMap((key) =>
                  GUARDRAILS[key] ? [<li key={key}>{GUARDRAILS[key]!.rule}</li>] : [],
                )}
              </ul>
            </div>
          )}
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Why it works: </span>
            {formula.why}
          </p>
          <div>
            <p className="font-medium">
              Sources{" "}
              <span className="font-normal text-muted-foreground">
                · evidence {formula.grade}: {GRADE_INFO[formula.grade].hint.toLowerCase()}
              </span>
            </p>
            <ul className="space-y-1">
              {sourcesOf(formula, channel).map((source) => (
                <SourceItem key={source.url} source={source} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The formula library ranked for a brand's DNA and what a piece is for:
 * each formula's fit and why, its beats timed to a length, the rules and
 * guardrails it keeps and the sources it rests on. With `onFormulas`, the
 * brand's own formulas are pinned here: they come first wherever its
 * content is planned.
 */
export function FormulaBrowser({
  dna,
  onFormulas,
  limit = 6,
  houseRules = false,
}: {
  dna: BrandDna;
  onFormulas?: ((ids: string[]) => void) | undefined;
  /** How many show before "Show all". */
  limit?: number;
  /** Also list the rules every formula keeps. */
  houseRules?: boolean;
}) {
  const [goal, setGoal] = useState<Goal | typeof ANY>(ANY);
  const [channel, setChannel] = useState<Channel | typeof ANY>(ANY);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const ranked = rankFormulas(dna, {
    goal: goal === ANY ? null : goal,
    channel: channel === ANY ? null : channel,
    seconds,
  });
  const shown = all ? ranked : ranked.slice(0, limit);
  const pin = (id: string) => {
    if (!onFormulas) return;
    onFormulas(
      dna.formulas.includes(id)
        ? dna.formulas.filter((entry) => entry !== id)
        : [...dna.formulas, id].slice(0, 12),
    );
  };

  const mix = dna.type ? contentMix(dna.market) : null;

  return (
    <div className="space-y-3" data-testid="formula-browser">
      {!dna.type && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Set what kind of brand this is (its DNA) to rank the formulas for it.
        </p>
      )}
      {mix && (
        <div className="space-y-1.5 rounded-md border border-border p-2.5 text-[11px]">
          <p className="flex items-center gap-1 font-medium">
            <Scale className="size-3.5 text-primary" /> The balance over time
          </p>
          <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
            <span className="bg-primary" style={{ width: `${mix.brand}%` }} />
            <span className="bg-primary/30" style={{ width: `${mix.activation}%` }} />
          </div>
          <p className="flex justify-between text-muted-foreground">
            <span>Brand-building {mix.brand}%</span>
            <span>Activation {mix.activation}%</span>
          </p>
          <p className="text-muted-foreground">{mix.line}</p>
          <p className="flex flex-wrap gap-x-2 text-muted-foreground/80">
            {mix.sources.flatMap((key) =>
              SOURCES[key]
                ? [
                    <a
                      key={key}
                      href={SOURCES[key]!.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {SOURCES[key]!.publisher}
                    </a>,
                  ]
                : [],
            )}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Select value={goal} onValueChange={(value) => setGoal(value as Goal | typeof ANY)}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="What it's for">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>
              {dna.goal ? `For ${GOAL_INFO[dna.goal].label.toLowerCase()}` : "Any goal"}
            </SelectItem>
            {GOALS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {GOAL_INFO[entry].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={channel}
          onValueChange={(value) => setChannel(value as Channel | typeof ANY)}
        >
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Where it runs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any channel</SelectItem>
            {CHANNELS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {CHANNEL_LABELS[entry]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={seconds ? String(seconds) : ANY}
          onValueChange={(value) => setSeconds(value === ANY ? null : Number(value))}
        >
          <SelectTrigger className="h-8 w-32 text-xs" aria-label="How long">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any length</SelectItem>
            {LENGTHS.map((entry) => (
              <SelectItem key={entry} value={String(entry)}>
                {entry} seconds
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="space-y-2">
        {shown.map((entry) => (
          <FormulaCard
            key={entry.formula.id}
            entry={entry}
            seconds={seconds}
            channel={channel === ANY ? null : channel}
            pinned={dna.formulas.includes(entry.formula.id)}
            onPin={onFormulas ? () => pin(entry.formula.id) : undefined}
            ranked={!!dna.type}
          />
        ))}
      </ul>
      {ranked.length > limit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAll((value) => !value)}
        >
          {all ? "Show fewer" : `Show all ${ranked.length} formulas`}
        </Button>
      )}
      {houseRules && <HouseRules />}
    </div>
  );
}

/** The rules every formula keeps, with what each rests on. */
function HouseRules() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border p-2.5 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left font-medium"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        Rules every formula keeps
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          {UNIVERSAL_RULES.map((entry) => (
            <li key={entry.rule} className="space-y-0.5">
              <p>{entry.rule}</p>
              <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground/80">
                {entry.sources.flatMap((key) =>
                  SOURCES[key]
                    ? [
                        <a
                          key={key}
                          href={SOURCES[key]!.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {SOURCES[key]!.title} · {SOURCES[key]!.publisher}
                        </a>,
                      ]
                    : [],
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
