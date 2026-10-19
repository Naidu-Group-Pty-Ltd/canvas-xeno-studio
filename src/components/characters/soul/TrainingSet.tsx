import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ScanFace, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { checkSoulTrainingSet } from "@/lib/characters.functions";
import {
  storedTrainingCheck,
  SOUL_TRAINING,
  TRAINING_ISSUE_LABELS,
  type TrainingImageCheck,
  type TrainingSetCheck,
  type VarietyLevel,
} from "@/lib/characters/soul";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { defaultSelection } from "./selection";

const VERDICT_COPY: Record<TrainingSetCheck["verdict"], { label: string; tone: string }> = {
  good: { label: "Good set", tone: "text-success" },
  usable: { label: "Usable set", tone: "text-foreground" },
  weak: { label: "Weak set", tone: "text-warning" },
};

const LEVEL_COPY: Record<VarietyLevel, string> = { low: "Low", ok: "Some", good: "Good" };

/**
 * The images a Soul ID is trained on: the character's training photos and
 * sheet, picked by a person (the default leaves out what the check found
 * unusable), and the studio's AI check of the set: one person, one sharp,
 * uncovered face per image, from enough angles and lights.
 */
export function TrainingSet({
  character,
  canEdit,
  selection,
  onSelection,
  check,
  onCheck,
}: {
  character: CharacterEntry;
  canEdit: boolean;
  selection: string[];
  onSelection: (ids: string[]) => void;
  check: TrainingSetCheck | null;
  onCheck: (check: TrainingSetCheck) => void;
}) {
  const [checking, setChecking] = useState(false);
  const images = [
    ...character.images.filter((image) => image.role === "photo"),
    ...character.images.filter((image) => image.role === "sheet"),
  ];
  const chosen = new Set(selection);
  const verdictOf = (assetId: string, metadata: unknown): TrainingImageCheck | null =>
    check?.images[assetId] ?? storedTrainingCheck(metadata);

  async function runCheck() {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkSoulTrainingSet({
        data: {
          characterId: character.id,
          ...(selection.length ? { assetIds: selection } : {}),
        },
      });
      onCheck(result);
      // Images the check rules out are taken out of the set.
      const unusable = new Set(
        Object.entries(result.images).flatMap(([id, entry]) => (entry.usable ? [] : [id])),
      );
      if (unusable.size) onSelection(selection.filter((id) => !unusable.has(id)));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The images couldn't be checked");
    } finally {
      setChecking(false);
    }
  }

  const count = selection.length;
  return (
    <div className="space-y-3" data-testid="soul-training-set">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">What it's trained on</h4>
          <p className="text-xs text-muted-foreground">
            {count} picked: at least {SOUL_TRAINING.minImages}, best with{" "}
            {SOUL_TRAINING.recommendedImages} or more varied photos of the face. Real photos make
            the truest likeness; an AI character can use a training pack below.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => onSelection(defaultSelection(character))}
            >
              Default set
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={checking || !images.length}
              onClick={() => void runCheck()}
              data-testid="soul-check-set"
            >
              {checking ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <ScanFace className="mr-1.5 size-3.5" />
              )}
              Check with AI
            </Button>
          </div>
        )}
      </div>

      {images.length ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {images.map((image) => {
            const verdict = verdictOf(image.assetId, image.asset?.metadata);
            const picked = chosen.has(image.assetId);
            return (
              <button
                key={image.assetId}
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  onSelection(
                    picked
                      ? selection.filter((id) => id !== image.assetId)
                      : [...selection, image.assetId],
                  )
                }
                className={cn(
                  "group relative aspect-[3/4] overflow-hidden rounded-md border text-left transition",
                  picked ? "border-primary ring-2 ring-primary/40" : "border-border opacity-60",
                  canEdit && "hover:opacity-100",
                )}
                aria-pressed={picked}
                aria-label={`${picked ? "Leave out" : "Train on"} this image`}
              >
                {image.asset ? (
                  <MediaPreview
                    bucket={image.asset.storage_bucket}
                    path={image.asset.storage_path}
                    type="image"
                  />
                ) : null}
                <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px] font-medium">
                  {image.role === "photo" ? "Photo" : "Sheet"}
                </span>
                {verdict && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90",
                          verdict.usable && !verdict.issues.length
                            ? "text-success"
                            : verdict.usable
                              ? "text-foreground"
                              : "text-warning",
                        )}
                      >
                        {verdict.usable && !verdict.issues.length ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <AlertTriangle className="size-3.5" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 text-xs">
                      {verdict.issues.length
                        ? verdict.issues.map((issue) => TRAINING_ISSUE_LABELS[issue]).join(", ")
                        : "Good for training"}
                      {!verdict.usable ? " — left out of the default set" : ""}
                    </TooltipContent>
                  </Tooltip>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No images yet. Add training photos (or sheet images) above, or paint a training pack.
        </p>
      )}

      {check && (
        <div
          className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs"
          data-testid="soul-set-verdict"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className={cn("font-medium", VERDICT_COPY[check.verdict].tone)}>
              {VERDICT_COPY[check.verdict].label}
            </span>
            <span className="text-muted-foreground">
              {check.usable} of {check.total} usable
              {check.samePerson ? ", one person" : ", more than one person"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["Angles", check.variety.angles],
                ["Lighting", check.variety.lighting],
                ["Expressions", check.variety.expressions],
                ["Framing", check.variety.framing],
              ] as const
            ).map(([label, level]) => (
              <Badge
                key={label}
                variant="outline"
                className={cn("text-[10px]", level === "low" && "border-warning text-warning")}
              >
                {label}: {LEVEL_COPY[level]}
              </Badge>
            ))}
          </div>
          {check.advice.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {check.advice.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
