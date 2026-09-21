import { Clapperboard, RotateCcw } from "lucide-react";
import {
  compileCinemaPrompt,
  nativeCinemaKeys,
  promptCinemaGroups,
  type CinemaSelection,
} from "@/lib/cinema";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  model: ModelRegistryEntry;
  prompt: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  selection: CinemaSelection;
  onSelectionChange: (selection: CinemaSelection) => void;
}

export function CinemaControls({ model, prompt, enabled, onEnabledChange, selection, onSelectionChange }: Props) {
  const groups = promptCinemaGroups(model);
  const native = [...nativeCinemaKeys(model)];
  const compiled = compileCinemaPrompt(prompt, selection, groups);
  const chosen = groups.filter((group) => selection[group.key]).length;

  function pick(key: string, value: string) {
    const next = { ...selection };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    onSelectionChange(next);
  }

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-4 text-primary" />
          <div>
            <h2 className="font-display text-sm font-semibold">Cinema Mode</h2>
            <p className="text-[11px] text-muted-foreground">
              Shot language for {model.display_name}. {chosen ? `${chosen} selected` : "Nothing selected yet"}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="cinema-toggle" className="text-[11px] text-muted-foreground">
            Apply
          </Label>
          <Switch id="cinema-toggle" checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>

      {enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <span className="label-eyebrow">{group.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selection[group.key] === option}
                      onClick={() => pick(group.key, option)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] transition-colors",
                        selection[group.key] === option
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {native.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {native.join(", ")} {native.length === 1 ? "is" : "are"} a native provider parameter for this model — set{" "}
              {native.length === 1 ? "it" : "them"} in Model settings rather than the prompt.
            </p>
          )}

          <div className="rounded-md border border-border bg-surface-raised/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="label-eyebrow">Prompt sent to the provider</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                disabled={!chosen}
                onClick={() => onSelectionChange({})}
              >
                <RotateCcw className="mr-1 size-3" /> Clear
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {compiled || "Write a prompt to see the compiled shot description."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
