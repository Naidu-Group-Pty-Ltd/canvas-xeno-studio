import { Film, ScanFace, Sparkles, TriangleAlert, UserRound } from "lucide-react";
import type { LongVideoDraft, LongVideoPlan } from "@/components/create/long-video-plan";
import { LIP_CHECK } from "@/lib/lip-sync/lip-check";
import { voiceLength } from "@/lib/lip-sync/view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  draft: LongVideoDraft;
  plan: LongVideoPlan;
  onChange: (patch: Partial<LongVideoDraft>) => void;
  /** The database can run presenter videos (undefined while asking, false before migration 0017). */
  presenterRuns: boolean | undefined;
  /** Puts the presenter recipe in the prompt and settings (null: the model has nothing to set). */
  onApplyRecipe: (() => void) | null;
}

/**
 * A video made to a voiceover with someone speaking to camera: where its
 * clips start from, which of its lines are covered by B-roll (no clip is
 * made for those), whether every clip's lips are scored, and what would
 * weaken the lip sync.
 */
export function PresenterSetup({ draft, plan, onChange, presenterRuns, onApplyRecipe }: Props) {
  const voiced = plan.voiceover;
  if (!voiced) return null;
  const lines = voiced.lines;
  const chosen = new Set(draft.brollLines);
  const covered = voiced.cutaways.reduce((sum, item) => sum + (item.end - item.start), 0);
  const unavailable = presenterRuns === false;

  const toggleLine = (index: number) => {
    const next = new Set(chosen);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange({ brollLines: [...next].sort((a, b) => a - b) });
  };

  return (
    <div
      className="space-y-3 rounded-md border border-border bg-background/60 p-3"
      data-testid="presenter-setup"
    >
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <UserRound className="size-3.5 text-primary" /> Presenter
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          For someone speaking to camera: keep their likeness, cut away to other footage while the
          voice goes on, and check their lips.
        </p>
      </div>

      {unavailable && (
        <p className="rounded-md bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed">
          Starting every clip from one still, B-roll cutaways and lip scores need a database update
          (migration 0017_presenter_runs). Until an admin applies it, the clips are made one after
          another.
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium">Clips start from</p>
        <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup">
          {(
            [
              { value: "anchor", label: "The same still" },
              { value: "chain", label: "The clip before" },
            ] as const
          ).map((option) => {
            const disabled = option.value === "anchor" && !!plan.anchorProblem;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={plan.startFrom === option.value}
                disabled={disabled}
                onClick={() => onChange({ startFrom: option.value })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  plan.startFrom === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`presenter-start-${option.value}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {plan.startFrom === "anchor"
            ? "Every clip starts from clip 1's start image, so the presenter looks the same throughout (a likeness drifts when each clip starts from the last frame of the one before), and up to three clips are made at once."
            : plan.anchorProblem
              ? `Each clip starts where the one before is cut, as one continuous shot. ${plan.anchorProblem}`
              : "Each clip starts where the one before is cut, as one continuous shot. A clip after a cutaway starts from clip 1's start image."}
        </p>
      </div>

      {lines.length > 1 && !plan.keyframed && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium">
            <Film className="size-3.5" /> Lines covered by B-roll
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Tick the lines to cut away from the presenter during. No clip is made for them; in the
            Editor they hold a placeholder to replace with your B-roll.
          </p>
          <ol
            className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1.5"
            data-testid="presenter-lines"
          >
            {lines.map((line, index) => (
              <li key={index}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[11px]",
                    chosen.has(index) ? "bg-primary/10" : "hover:bg-muted/50",
                    unavailable && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={chosen.has(index)}
                    disabled={unavailable}
                    onCheckedChange={() => toggleLine(index)}
                    className="mt-0.5"
                    aria-label={`Cover ${voiceLength(line.start)} to ${voiceLength(line.end)} with B-roll`}
                  />
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {voiceLength(line.start)}–{voiceLength(line.end)}
                  </span>
                  <span
                    className={cn("line-clamp-2", !line.text && "italic text-muted-foreground")}
                  >
                    {line.text || "(words not known)"}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          {voiced.cutaways.length > 0 && (
            <p className="text-[11px] text-muted-foreground" data-testid="presenter-cutaways">
              {voiced.cutaways.length} {voiced.cutaways.length === 1 ? "cutaway" : "cutaways"} ·{" "}
              {voiceLength(covered)} of the voiceover with no presenter clip made for it.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="flex items-start gap-2 text-[11px]">
          <Checkbox
            checked={draft.lipCheck && !unavailable}
            disabled={unavailable}
            onCheckedChange={(checked) => onChange({ lipCheck: checked === true })}
            className="mt-0.5"
            aria-label="Score every clip's lips"
          />
          <span>
            <ScanFace className="mr-1 inline size-3.5 text-primary" />
            Score every clip's lips against the voice (SyncNet). Real speech scores about 6 to 8; a
            clip under {LIP_CHECK.flagBelow} is flagged, and a lead of a frame or two is taken out
            when it is laid in the Editor.
          </span>
        </label>
        {draft.lipCheck && !unavailable && (
          <div className="flex flex-wrap items-center gap-2 pl-6 text-[11px]">
            <span>A clip that scores under {LIP_CHECK.redoBelow} gets</span>
            <Select
              value={String(draft.takes)}
              onValueChange={(value) => onChange({ takes: Number(value) })}
            >
              <SelectTrigger className="h-7 w-36" aria-label="Takes per clip">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: LIP_CHECK.maxTakes }, (_, index) => index + 1).map(
                  (takes) => (
                    <SelectItem key={takes} value={String(takes)}>
                      {takes === 1
                        ? "no more takes"
                        : `up to ${takes - 1} more ${takes === 2 ? "take" : "takes"}`}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">
              (each billed like the clip; the best is kept, the rest stay to swap in)
            </span>
          </div>
        )}
      </div>

      {plan.warnings.length > 0 && (
        <div
          className="space-y-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed"
          data-testid="presenter-warnings"
        >
          {plan.warnings.map((warning) => (
            <p key={warning} className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>{warning}</span>
            </p>
          ))}
          {onApplyRecipe && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={onApplyRecipe}
              data-testid="presenter-recipe"
            >
              <Sparkles className="mr-1.5 size-3.5 text-primary" /> Use the presenter recipe
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
