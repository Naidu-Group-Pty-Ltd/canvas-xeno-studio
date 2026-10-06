import { useState } from "react";
import { FileText, Images, Loader2, Shuffle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { assistPrompt } from "@/lib/supercomputer.functions";
import type { PromptSuggestion } from "@/lib/supercomputer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Mode = "enhance" | "variations" | "describe" | "brief";

export interface PromptAssistContext {
  modelId: string;
  /** Image (or video-poster) references the model may look at. */
  referenceAssetIds: string[];
  briefId: string | null;
  /** Null when the assistant can run; otherwise why it cannot. */
  unavailableReason: string | null;
}

interface Props {
  prompt: string;
  context: PromptAssistContext;
  onApply: (prompt: string) => void;
}

const MODES: { id: Mode; label: string; icon: typeof Sparkles; hint: string }[] = [
  {
    id: "enhance",
    label: "Enhance",
    icon: Sparkles,
    hint: "Sharper, more visual wording for this model",
  },
  {
    id: "variations",
    label: "Variations",
    icon: Shuffle,
    hint: "Four different creative directions",
  },
  {
    id: "describe",
    label: "From references",
    icon: Images,
    hint: "Write a prompt from your reference images",
  },
  {
    id: "brief",
    label: "From brief",
    icon: FileText,
    hint: "Deliver the selected brief's key message",
  },
];

/** Inline prompt help in Create. Suggestions are only applied when chosen, and can be undone. */
export function PromptAssist({ prompt, context, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);

  const availability: Record<Mode, string | null> = {
    enhance: prompt.trim() ? null : "Write a rough prompt first",
    variations: null,
    describe: context.referenceAssetIds.length ? null : "Attach a reference image first",
    brief: context.briefId ? null : "Choose a brief first",
  };

  async function run(next: Mode) {
    if (availability[next]) return;
    setMode(next);
    setBusy(true);
    setSuggestions([]);
    try {
      const result = await assistPrompt({
        data: {
          modelId: context.modelId,
          prompt,
          mode: next,
          referenceAssetIds: context.referenceAssetIds.slice(0, 8),
          briefId: context.briefId,
          ...(note.trim() ? { instruction: note.trim() } : {}),
        },
      });
      setSuggestions(result.suggestions);
      if (!result.suggestions.length)
        toast.info("No suggestions this time. Try again or add a note.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Suggestions are unavailable right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  function apply(suggestion: PromptSuggestion, append = false) {
    const previous = prompt;
    const next =
      append && previous.trim() ? `${previous.trim()}\n\n${suggestion.prompt}` : suggestion.prompt;
    onApply(next);
    setOpen(false);
    toast.success(`Applied “${suggestion.title}”`, {
      action: { label: "Undo", onClick: () => onApply(previous) },
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!!context.unavailableReason}
          title={context.unavailableReason ?? "Prompt assistant"}
          className="text-primary"
        >
          <Wand2 className="mr-1 size-3.5" /> Assist
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(32rem,calc(100vw-2rem))] space-y-3 p-3">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={busy || !!availability[entry.id]}
              title={availability[entry.id] ?? entry.hint}
              onClick={() => void run(entry.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] transition-colors disabled:opacity-40",
                mode === entry.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:border-input",
              )}
            >
              <entry.icon className="size-4 text-primary" />
              {entry.label}
            </button>
          ))}
        </div>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note, e.g. moodier, for TikTok, keep the logo visible"
          className="h-8 text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter" && mode) void run(mode);
          }}
        />
        {busy && (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Writing suggestions…
          </div>
        )}
        {!busy && suggestions.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scroll-slim">
            {suggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.title}-${index}`}
                className="space-y-1.5 rounded-md border border-border p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{suggestion.title}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => apply(suggestion, true)}
                    >
                      Append
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => apply(suggestion)}
                    >
                      Use
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-5 text-[11px] leading-relaxed text-muted-foreground">
                  {suggestion.prompt}
                </p>
                {suggestion.rationale && (
                  <p className="text-[10px] text-muted-foreground/80 italic">
                    {suggestion.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {!busy && !suggestions.length && (
          <p className="text-[11px] text-muted-foreground">
            Suggestions are written for the selected model. Nothing is generated or charged.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
