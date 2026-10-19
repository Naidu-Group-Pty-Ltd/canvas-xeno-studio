import { useRef, useState } from "react";
import { Copy, Loader2, PenLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CHANNEL_LABELS, CHANNELS, type BrandDna, type Channel } from "@/lib/brand/dna";
import { writeFormulaForBrand } from "@/lib/brand/formula-adapt-client";
import { FORMULAS, formulaById, rankFormulas, type BrandFormula } from "@/lib/brand/formulas";
import { copyForBrand, freeId, OWN_FORMULA_LIMITS } from "@/lib/brand/own-formulas";
import { FormulaBrowser } from "@/components/brand/FormulaBrowser";
import { OwnFormulaEditor } from "@/components/brand/OwnFormulaEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ANY = "any";

/** The brand as the kit editor holds it, for the AI that writes formulas for it. */
export interface FormulaBrand {
  name: string;
  website: string | null;
  tagline: string | null;
  callToAction: string | null;
  terms: string[];
  design: Record<string, unknown>;
  dna: BrandDna;
}

/**
 * A brand's formulas: the library ranked for its DNA with those written for
 * it first (to pin, edit or take away), and a way to write another, by the
 * studio's AI from a library formula (for a person to look over) or copied to
 * rewrite by hand.
 */
export function OwnFormulas({
  brand,
  own,
  onOwn,
  onPins,
}: {
  brand: FormulaBrand;
  own: BrandFormula[];
  onOwn: (own: BrandFormula[]) => void;
  onPins: (ids: string[]) => void;
}) {
  // The formula in the editor, the one of the brand's it replaces (none for a new one), and
  // which opening this is, so every editor starts from its own formula.
  const [editing, setEditing] = useState<{
    formula: BrandFormula;
    replaces: string | null;
    opened: number;
  } | null>(null);
  const openings = useRef(0);
  const open = (formula: BrandFormula, replaces: string | null) =>
    setEditing({ formula, replaces, opened: (openings.current += 1) });
  const ranked = rankFormulas(brand.dna).map((entry) => entry.formula);
  const [baseId, setBaseId] = useState<string>(ranked[0]?.id ?? FORMULAS[0]!.id);
  const [audience, setAudience] = useState<string>(ANY);
  const [channel, setChannel] = useState<Channel | typeof ANY>(ANY);
  const [length, setLength] = useState("");
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const full = own.length >= OWN_FORMULA_LIMITS.formulas;
  const named = !!brand.name.trim();
  const base = FORMULAS.find((formula) => formula.id === baseId) ?? FORMULAS[0]!;
  // As typed; a length under 5 seconds is no length.
  const typed = Math.round(Number(length));
  const seconds = length.trim() && typed >= 5 ? Math.min(600, typed) : null;

  const keep = (formula: BrandFormula) => {
    const replaces = editing?.replaces ?? null;
    if (replaces) onOwn(own.map((entry) => (entry.id === replaces ? formula : entry)));
    else if (full) {
      toast.error(`A brand keeps up to ${OWN_FORMULA_LIMITS.formulas} formulas of its own.`);
      return;
    } else {
      // A new one never takes the id of one the brand already has.
      const id = freeId(
        formula.id,
        (id) => own.some((entry) => entry.id === id) || !!formulaById(id),
      );
      onOwn([...own, { ...formula, id }]);
    }
    setEditing(null);
    toast.success(`"${formula.name}" is kept with the brand. Save the kit to keep it for good.`);
  };

  const write = async () => {
    setWriting(true);
    try {
      const { formula, model } = await writeFormulaForBrand({
        formulaId: base.id,
        brand: {
          name: brand.name,
          website: brand.website,
          tagline: brand.tagline,
          callToAction: brand.callToAction,
          terms: brand.terms.slice(0, 50),
          design: brand.design,
          dna: brand.dna as unknown as Record<string, unknown>,
        },
        audience: audience === ANY ? null : audience,
        channel: channel === ANY ? null : channel,
        seconds,
        note: note.trim() || null,
        taken: own.map((formula) => formula.id),
      });
      // Edit and Copy wait while it is written, so no other formula is open.
      open(formula, null);
      toast.success(
        `Written${model ? ` by ${model}` : ""}. Look it over: change anything, then keep it.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The formula couldn't be written");
    } finally {
      setWriting(false);
    }
  };

  if (editing)
    return (
      <OwnFormulaEditor
        key={editing.opened}
        formula={editing.formula}
        dna={brand.dna}
        brandName={brand.name || "the brand"}
        onSave={keep}
        onCancel={() => setEditing(null)}
      />
    );

  return (
    <div className="space-y-3" data-testid="own-formulas">
      <div className="space-y-2 rounded-md border border-border p-2.5">
        <p className="flex items-center gap-1 text-xs font-medium">
          <PenLine className="size-3.5 text-primary" /> Write a formula for{" "}
          {brand.name || "this brand"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          A proven formula, rewritten for this brand: the same beats doing the same jobs, showing
          and saying what this brand would, for one of its audiences. It keeps the formula's
          guardrails and sources.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger className="h-8 text-xs" aria-label="The formula to write from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ranked.map((formula) => (
                <SelectItem key={formula.id} value={formula.id}>
                  {formula.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger className="h-8 text-xs" aria-label="Who it's for">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>For any of its audiences</SelectItem>
              {brand.dna.audiences.map((entry) => (
                <SelectItem key={entry.name} value={entry.name}>
                  For {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as Channel | typeof ANY)}
          >
            <SelectTrigger className="h-8 text-xs" aria-label="Where it runs">
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
          <Input
            type="number"
            min={5}
            max={600}
            value={length}
            placeholder={`Length (it runs ${base.seconds.min}–${base.seconds.max} s)`}
            className="h-8 text-xs"
            aria-label="Length in seconds"
            onChange={(event) => setLength(event.target.value)}
          />
        </div>
        <Input
          value={note}
          maxLength={600}
          placeholder="Anything else it should do (optional)"
          className="h-8 text-xs"
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">{base.summary}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={writing || full || !named || !brand.dna.type}
            title={
              !named
                ? "Name the brand first"
                : !brand.dna.type
                  ? "Say what kind of brand this is (its DNA) first"
                  : undefined
            }
            onClick={() => void write()}
            data-testid="own-formula-write"
          >
            {writing ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3.5" />
            )}
            {writing ? "Writing it…" : "Write it with AI"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={writing || full}
            onClick={() =>
              open(
                copyForBrand(
                  base,
                  brand.name || "Brand",
                  own.map((formula) => formula.id),
                ),
                null,
              )
            }
          >
            <Copy className="mr-1.5 size-3.5" /> Copy it to rewrite by hand
          </Button>
        </div>
        {full && (
          <p className="text-[11px] text-warning">
            A brand keeps up to {OWN_FORMULA_LIMITS.formulas} formulas of its own.
          </p>
        )}
      </div>
      <FormulaBrowser
        dna={brand.dna}
        own={own}
        onFormulas={onPins}
        // While one is being written, the others wait to be edited.
        onEditOwn={writing ? undefined : (formula) => open(formula, formula.id)}
        onRemoveOwn={(formula) => {
          onOwn(own.filter((entry) => entry.id !== formula.id));
          onPins(brand.dna.formulas.filter((id) => id !== formula.id));
        }}
        limit={Math.max(6, own.length + 3)}
      />
    </div>
  );
}
