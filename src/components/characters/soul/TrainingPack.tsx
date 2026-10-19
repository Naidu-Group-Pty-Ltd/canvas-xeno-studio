import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { useModels } from "@/hooks/useStudioData";
import { stillComing, useKeyedGenerations } from "@/hooks/useKeyedGenerations";
import {
  addCharacterImages,
  scoreCharacterLikeness,
  soulTrainingPackModel,
  startSoulTrainingPack,
} from "@/lib/characters.functions";
import { estimateGeneration } from "@/lib/generation.functions";
import { CHARACTER_LIMITS, sheetOrder } from "@/lib/characters/model";
import { PACK_SHOTS, packKeyPrefix, packOfKey, packPrompt } from "@/lib/characters/soul";
import { painterSlot, painterValues } from "@/lib/long-video/keyframes";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const SIZES = [8, 12, 16] as const;

/** An image's likeness score for this character, as kept with the image. */
function likenessOf(
  metadata: unknown,
  characterId: string,
): { score: number; notes: string } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const check = (metadata as Record<string, unknown>)["likeness_check"];
  if (!check || typeof check !== "object") return null;
  const record = check as Record<string, unknown>;
  const score = Number(record["score"]);
  return record["character_id"] === characterId && Number.isFinite(score)
    ? { score, notes: typeof record["notes"] === "string" ? record["notes"] : "" }
    : null;
}

/**
 * A training pack: for a character who exists only as AI images, varied
 * photos of them (angles, light, expressions, framing) painted from their
 * reference sheet, each scored for likeness against them; the good ones go
 * into the training photos a Soul ID learns from. Each image is a billed
 * generation; scoring is free.
 */
export function TrainingPack({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: models = [] } = useModels();
  const { data: painterInfo } = useQuery({
    queryKey: ["soul-pack-model"],
    queryFn: () => soulTrainingPackModel(),
    staleTime: 5 * 60_000,
  });
  const painter = models.find((model) => model.id === painterInfo?.modelId) ?? null;
  const sheet = sheetOrder(character.images.filter((image) => image.role === "sheet"));
  const [size, setSize] = useState<number>(12);
  const [confirming, setConfirming] = useState(false);
  const [quote, setQuote] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lock = useRef(false);
  const { data: entries = [] } = useKeyedGenerations(
    ["soul-pack", character.id],
    packKeyPrefix(character.id),
    { limit: 48 },
  );
  const inUse = new Set(character.images.map((image) => image.assetId));
  const images = useMemo(
    () =>
      entries
        .filter((entry) => packOfKey(entry.key))
        .flatMap((entry) => entry.assets.map((asset) => ({ entry, asset }))),
    [entries],
  );
  const pending = entries.filter(stillComing).length;
  const offered = images.filter(({ asset }) => !inUse.has(asset.id));
  const unscored = offered.filter(({ asset }) => !likenessOf(asset.metadata, character.id));

  // Good-scoring images are picked to add as they're scored.
  const scores = offered
    .map(({ asset }) => `${asset.id}:${likenessOf(asset.metadata, character.id)?.score ?? ""}`)
    .join();
  useEffect(() => {
    setPicked((current) => {
      const next = new Set(current);
      for (const { asset } of offered) {
        const scored = likenessOf(asset.metadata, character.id);
        if (scored && scored.score >= 7.5 && !current.has(asset.id)) next.add(asset.id);
      }
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores]);

  async function openPack() {
    setConfirming(true);
    setQuote(null);
    if (!painter) return;
    const slot = painterSlot(painter);
    try {
      const result = await estimateGeneration({
        data: {
          modelId: painter.id,
          parameters: {
            ...painterValues(painter, 3 / 4),
            prompt: packPrompt(PACK_SHOTS[0], character),
          },
          inputs: sheet.slice(0, slot?.max ?? 4).map((image, position) => ({
            assetId: image.assetId,
            role: slot?.role ?? "reference",
            position,
          })),
        },
      });
      if (result.ok && result.costUsd != null) setQuote(result.costUsd * size);
    } catch {
      /* no quote: the dialog says so */
    }
  }

  async function act(name: string, run: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    try {
      await run();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work");
    } finally {
      lock.current = false;
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ["soul-pack", character.id] });
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    }
  }

  const photoRoom =
    CHARACTER_LIMITS.photoImages -
    character.images.filter((image) => image.role === "photo").length;

  return (
    <div className="space-y-3" data-testid="soul-training-pack">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">Training pack</h4>
          <p className="text-xs text-muted-foreground">
            For a character who exists only as AI images: varied photos of them from their sheet
            (angles, light, expressions), each scored for likeness, to train a Soul ID on.
            {painterInfo?.name ? ` Painted with ${painterInfo.name}.` : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={String(size)} onValueChange={(value) => setSize(Number(value))}>
              <SelectTrigger className="h-8 w-28" aria-label="How many images">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((entry) => (
                  <SelectItem key={entry} value={String(entry)}>
                    {entry} images
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!!busy || !sheet.length || !painter}
              onClick={() => void openPack()}
              data-testid="soul-paint-pack"
            >
              {busy === "paint" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Palette className="mr-1.5 size-3.5" />
              )}
              Paint pack
            </Button>
          </div>
        )}
      </div>
      {!sheet.length && (
        <p className="text-xs text-muted-foreground">
          Add reference sheet images first: the pack is painted from them.
        </p>
      )}

      {(images.length > 0 || pending > 0) && (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {images.map(({ asset }) => {
              const scored = likenessOf(asset.metadata, character.id);
              const added = inUse.has(asset.id);
              const chosen = picked.has(asset.id);
              return (
                <button
                  key={asset.id}
                  type="button"
                  disabled={!canEdit || added}
                  onClick={() =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(asset.id)) next.delete(asset.id);
                      else next.add(asset.id);
                      return next;
                    })
                  }
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-md border",
                    added
                      ? "border-success/50 opacity-50"
                      : chosen
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border",
                  )}
                  aria-pressed={chosen}
                >
                  <MediaPreview
                    bucket={asset.storage_bucket}
                    path={asset.storage_path}
                    type="image"
                  />
                  {scored && (
                    <span
                      title={scored.notes}
                      className={cn(
                        "absolute bottom-1 right-1 rounded bg-background/90 px-1 text-[10px] font-medium",
                        scored.score >= 7.5
                          ? "text-success"
                          : scored.score >= 5.5
                            ? ""
                            : "text-warning",
                      )}
                    >
                      {scored.score.toFixed(1)}
                    </span>
                  )}
                  {added && (
                    <span className="absolute left-1 top-1 rounded bg-background/90 px-1 text-[10px]">
                      Added
                    </span>
                  )}
                </button>
              );
            })}
            {Array.from({ length: pending }, (_, index) => (
              <div
                key={`pending-${index}`}
                className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed"
              >
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={!!busy || !unscored.length}
                onClick={() =>
                  void act("score", async () => {
                    for (let start = 0; start < unscored.length; start += 12) {
                      await scoreCharacterLikeness({
                        data: {
                          characterId: character.id,
                          assetIds: unscored.slice(start, start + 12).map(({ asset }) => asset.id),
                        },
                      });
                    }
                    toast.success("Likeness scored: the good ones are picked");
                  })
                }
              >
                {busy === "score" ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                Score likeness{unscored.length ? ` (${unscored.length})` : ""}
              </Button>
              <Button
                size="sm"
                className="h-8"
                disabled={!!busy || !picked.size || photoRoom <= 0}
                onClick={() =>
                  void act("add", async () => {
                    const ids = [...picked]
                      .filter((id) => !inUse.has(id))
                      .slice(0, Math.max(0, photoRoom));
                    const result = await addCharacterImages({
                      data: {
                        characterId: character.id,
                        images: ids.map((assetId) => ({ assetId, role: "photo", view: "other" })),
                      },
                    });
                    setPicked(new Set());
                    toast.success(`${result.added} added to the training photos`);
                  })
                }
              >
                {busy === "add" ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1.5 size-3.5" />
                )}
                Add {picked.size || ""} to training photos
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paint a training pack of {character.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {painterInfo?.name ?? "An image model"} paints {size} varied photos of them from their
              reference sheet: different angles, light, expressions and framing, with the face, age,
              hair and build kept. They land in the library; score them, then add the good ones to
              the training photos.{" "}
              {quote != null ? `About $${quote.toFixed(2)} in all.` : "Billed like any generation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setConfirming(false);
                void act("paint", async () => {
                  const result = await startSoulTrainingPack({
                    data: { characterId: character.id, count: size, modelId: painter?.id ?? null },
                  });
                  toast.success(
                    result.started < size
                      ? `${result.started} of ${size} started (the rest couldn't be: check credits and limits)`
                      : `Painting ${result.started} images`,
                  );
                });
              }}
            >
              Paint {size} images
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
