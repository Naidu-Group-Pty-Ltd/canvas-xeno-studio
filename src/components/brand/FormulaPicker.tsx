import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ListOrdered, X } from "lucide-react";
import type { BrandDna } from "@/lib/brand/dna";
import {
  formulaById,
  rankFormulas,
  timedBeats,
  type BrandFormula,
  type FormulaAsk,
} from "@/lib/brand/formulas";
import { FIT_LABELS, FIT_STYLES, GradeBadge } from "@/components/brand/FormulaBrowser";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The formula a piece is built on, chosen from the library ranked for the
 * brand's DNA and what the piece is for (the brand's own formulas first).
 */
export function FormulaPicker({
  dna,
  brandName,
  value,
  onChange,
  ask = {},
}: {
  dna: BrandDna;
  /** The brand it's ranked for, if any. */
  brandName: string | null;
  value: string | null;
  onChange: (formulaId: string | null) => void;
  ask?: FormulaAsk;
}) {
  const [open, setOpen] = useState(false);
  const formula = formulaById(value);
  const ranked = rankFormulas(dna, ask);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={formula ? "secondary" : "ghost"}
          className="h-7 max-w-full gap-1.5 px-2 text-xs"
          data-testid="formula-picker"
        >
          <ListOrdered className="size-3.5 shrink-0" />
          <span className="truncate">{formula ? formula.name : "Formula"}</span>
          {formula && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Make it without a formula"
              className="-mr-1 rounded p-0.5 hover:bg-background/60"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(null);
                }
              }}
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] space-y-2 p-2">
        <p className="px-1 text-[11px] text-muted-foreground">
          A proven structure the AI builds on: its beats, timing, rules and guardrails.{" "}
          {brandName
            ? dna.type
              ? `Ranked for ${brandName}'s DNA.`
              : `${brandName} has no DNA yet, so they aren't ranked for it.`
            : "Choose a brand to rank them for it."}
        </p>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto" data-testid="formula-picker-list">
          {ranked.map((entry) => (
            <li key={entry.formula.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(entry.formula.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  entry.formula.id === value && "bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="font-medium">{entry.formula.name}</span>
                    {dna.type && (
                      <span className={cn("rounded px-1 py-px text-[10px]", FIT_STYLES[entry.fit])}>
                        {FIT_LABELS[entry.fit]}
                      </span>
                    )}
                    <GradeBadge grade={entry.formula.grade} />
                  </span>
                  <span className="line-clamp-2 block text-[11px] text-muted-foreground">
                    {entry.formula.summary}
                  </span>
                  {entry.cautions.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-warning">
                      <AlertTriangle className="size-3" /> {entry.cautions.join(" · ")}
                    </span>
                  )}
                </span>
                {entry.formula.id === value && <Check className="size-3.5 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
        <Link
          to="/brand"
          className="block rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          The formula library and brand DNA
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** A chosen formula's beats at a length, in a line each, with a note when the length is outside its range. */
export function FormulaBeats({ formula, seconds }: { formula: BrandFormula; seconds: number }) {
  const outside = seconds < formula.seconds.min || seconds > formula.seconds.max;
  return (
    <div
      className="space-y-1 rounded-md bg-background/60 px-3 py-2 text-[11px]"
      data-testid="formula-beats"
    >
      <p className="font-medium">
        {formula.name} at {seconds} s
      </p>
      <ol className="space-y-0.5 text-muted-foreground">
        {timedBeats(formula, seconds).map((beat) => (
          <li key={beat.key} className="flex gap-2">
            <span className="w-16 shrink-0 font-mono">
              {beat.from}–{beat.to} s
            </span>
            <span>
              <span className="text-foreground/80">{beat.label}:</span> {beat.job}
            </span>
          </li>
        ))}
      </ol>
      {outside && (
        <p className="flex items-center gap-1 text-warning">
          <AlertTriangle className="size-3" /> It works best at {formula.seconds.min}–
          {formula.seconds.max} s (ideally {formula.seconds.ideal} s).
        </p>
      )}
    </div>
  );
}
