import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useModels } from "@/hooks/useStudioData";
import type { AssetRow } from "@/hooks/useStudioData";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { addCharacterImages } from "@/lib/characters.functions";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { softDeleteAsset } from "@/lib/asset-actions";
import { keyframePainters, painterSlot } from "@/lib/long-video/keyframes";
import {
  CHARACTER_LIMITS,
  SOUL_MODEL_PATHS,
  VIEW_LABELS,
  type CharacterView,
} from "@/lib/characters/model";
import {
  MAKEABLE_VIEWS,
  paintedViewValues,
  soulViewValues,
  viewKeyPrefix,
  viewOfKey,
  viewPrompt,
  viewRequestKey,
  type MakeableView,
} from "@/lib/characters/views";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

const SOUL_SOURCE = "soul";

interface MadeView {
  generationId: string;
  status: string;
  /** Whether its saving to the library has ended (completed or given up). */
  ingested: "pending" | "completed" | "failed";
  view: CharacterView;
  asset: AssetRow | null;
  createdAt: string;
}

/** Views made for a character (by their request keys), newest first, with their images once in. */
function useMadeViews(characterId: string) {
  return useQuery({
    queryKey: ["character-views", characterId],
    queryFn: async (): Promise<MadeView[]> => {
      const { data: generations, error } = await supabase
        .from("generations")
        .select("id,status,ingest_status,client_request_id,created_at")
        .like("client_request_id", `${viewKeyPrefix(characterId)}%`)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      const ids = (generations ?? []).map((row) => row.id);
      const { data: assets, error: assetsError } = ids.length
        ? await supabase.from("assets").select("*").in("generation_id", ids).is("deleted_at", null)
        : { data: [], error: null };
      if (assetsError) throw assetsError;
      return (generations ?? []).flatMap((row) => {
        const view = viewOfKey(row.client_request_id);
        if (!view) return [];
        const asset =
          ((assets ?? []) as unknown as AssetRow[]).find(
            (entry) => entry.generation_id === row.id && entry.asset_type === "image",
          ) ?? null;
        const ingested: MadeView["ingested"] =
          row.ingest_status === "completed"
            ? "completed"
            : row.ingest_status === "failed"
              ? "failed"
              : "pending";
        return [
          {
            generationId: row.id,
            status: row.status,
            ingested,
            view,
            asset,
            createdAt: row.created_at,
          },
        ];
      });
    },
    refetchInterval: (query) => ((query.state.data ?? []).some(stillComing) ? 8_000 : false),
  });
}

/** Generation states after which nothing more comes (an unclear one is a person's to check). */
const ENDED = new Set(["failed", "nsfw", "canceled", "submission_uncertain"]);

/** A view still on its way: being made, or made and being saved. */
function stillComing(made: MadeView): boolean {
  if (made.asset || ENDED.has(made.status)) return false;
  return !(made.status === "completed" && made.ingested !== "pending");
}

/** Made and saved, but no longer in the library: discarded (shown no more). */
function discarded(made: MadeView): boolean {
  return !made.asset && made.status === "completed" && made.ingested === "completed";
}

/**
 * Makes a character's reference views (face, full body front, three-quarter,
 * side, back) from their photos with an image model that takes references,
 * or from their Soul ID. Priced first; the views come back here to be added
 * to the sheet or discarded.
 */
export function ViewsMaker({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: models = [] } = useModels();
  const painters = useMemo(() => keyframePainters(models), [models]);
  const soulModel =
    character.soul_model_version && character.soul_reference_id
      ? (models.find(
          (model) =>
            model.is_active && model.model_path === SOUL_MODEL_PATHS[character.soul_model_version!],
        ) ?? null)
      : null;
  const [source, setSource] = useState<string>("");
  const usingSoul = source === SOUL_SOURCE && !!soulModel;
  const model = usingSoul
    ? soulModel
    : (painters.find((entry) => entry.id === source) ?? painters[0] ?? null);
  useEffect(() => {
    // Soul ID first once it's ready: the likeness it was trained on.
    if (!source) setSource(soulModel ? SOUL_SOURCE : (painters[0]?.id ?? ""));
  }, [source, soulModel, painters]);

  const sheetViews = new Set(
    character.images.filter((image) => image.role === "sheet").map((image) => image.view),
  );
  const [views, setViews] = useState<MakeableView[] | null>(null);
  const chosenViews =
    views ?? MAKEABLE_VIEWS.filter((view) => view !== "three_quarter" && !sheetViews.has(view));
  // The photos it's made from: the sheet's best ones, as many as the model takes.
  const slot = model && !usingSoul ? painterSlot(model) : null;
  const sourceImages = character.images
    .filter((image) => image.role === "sheet")
    .concat(character.images.filter((image) => image.role === "photo"))
    .slice(0, Math.min(slot?.max ?? 0, 4));

  const [quote, setQuote] = useState<{
    key: string;
    usd: number | null;
    note: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [making, setMaking] = useState(false);
  // One batch per click: a second click while one is being sent does nothing.
  const lock = useRef(false);
  const { data: made = [] } = useMadeViews(character.id);

  function request(view: MakeableView) {
    if (!model) return null;
    if (usingSoul && character.soul_reference_id)
      return {
        modelId: model.id,
        parameters: {
          ...soulViewValues(model, view, character.soul_reference_id),
          prompt: viewPrompt(view, { fromImages: false, description: character.description }),
        },
        inputs: [] as { assetId: string; role: string; position: number }[],
      };
    if (!slot || !sourceImages.length) return null;
    return {
      modelId: model.id,
      parameters: {
        ...paintedViewValues(model, view),
        prompt: viewPrompt(view, { fromImages: true, description: character.description }),
      },
      inputs: sourceImages.map((image, position) => ({
        assetId: image.assetId,
        role: slot.role,
        position,
      })),
    };
  }

  const quoteKey = `${model?.id ?? ""}:${usingSoul}:${sourceImages.map((image) => image.assetId).join(",")}`;
  useEffect(() => {
    let current = true;
    const sample = request("front");
    if (!sample) {
      setQuote(null);
      return;
    }
    setQuote(null);
    estimateGeneration({ data: sample })
      .then((result) => {
        if (!current) return;
        setQuote({
          key: quoteKey,
          usd: result.ok ? result.costUsd : null,
          note: result.ok ? result.pricingDescription : (result.message ?? null),
        });
      })
      .catch(() => current && setQuote({ key: quoteKey, usd: null, note: null }));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const priced = quote?.key === quoteKey ? quote : null;
  const total = priced?.usd != null ? priced.usd * chosenViews.length : null;
  const sheetCount = character.images.filter((image) => image.role === "sheet").length;
  const waiting = made.filter(
    (entry) => entry.asset && !character.images.some((image) => image.assetId === entry.asset!.id),
  );
  const pending = made.filter(stillComing);
  const failed = made
    .filter((entry) => !entry.asset && !stillComing(entry) && !discarded(entry))
    .slice(0, 3);

  async function make() {
    if (lock.current) return;
    lock.current = true;
    setConfirming(false);
    setMaking(true);
    const wanted = chosenViews.filter((view) => !!request(view));
    let started = 0;
    try {
      for (const view of wanted) {
        await submitGeneration({
          data: {
            ...request(view)!,
            estimatedCostUsd: priced?.usd ?? null,
            clientRequestId: viewRequestKey(character.id, view),
          },
        });
        started += 1;
      }
      toast.success(
        `Making ${started} view${started === 1 ? "" : "s"}. They appear here in about a minute.`,
      );
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "it couldn't be started";
      // Those already started go on (and are billed): only the rest need making again.
      toast.error(
        started
          ? `${started} of ${wanted.length} views started; the rest weren't (${reason}). Make only those again.`
          : `The views couldn't be started: ${reason}`,
      );
    } finally {
      lock.current = false;
      setMaking(false);
      void queryClient.invalidateQueries({ queryKey: ["character-views", character.id] });
    }
  }

  async function keep(entry: MadeView) {
    if (!entry.asset) return;
    try {
      await addCharacterImages({
        data: {
          characterId: character.id,
          images: [{ assetId: entry.asset.id, role: "sheet", view: entry.view }],
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success(`Added to the sheet as ${VIEW_LABELS[entry.view].toLowerCase()}.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "It couldn't be added");
    }
  }

  async function discard(entry: MadeView) {
    if (!entry.asset) return;
    try {
      await softDeleteAsset(entry.asset.id);
      await queryClient.invalidateQueries({ queryKey: ["character-views", character.id] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "It couldn't be discarded");
    }
  }

  const options = [
    ...(soulModel ? [{ id: SOUL_SOURCE, label: `Soul ID on ${soulModel.display_name}` }] : []),
    ...painters.map((entry) => ({
      id: entry.id,
      label: `From the photos with ${entry.display_name}`,
    })),
  ];
  const canMake =
    canEdit && !!model && chosenViews.length > 0 && (usingSoul || sourceImages.length > 0);

  return (
    <section className="panel space-y-3 p-4" data-testid="character-views-maker">
      <div>
        <h3 className="label-eyebrow">Make reference views</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Turn one good photo into the views video models need: a face close-up and the full figure
          from the front, side and back, on a plain background. Each view is one image, billed like
          any other; you choose which go on the sheet.
        </p>
      </div>

      {canEdit && options.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Made with</Label>
            <Select value={usingSoul ? SOUL_SOURCE : (model?.id ?? "")} onValueChange={setSource}>
              <SelectTrigger className="h-9" aria-label="How the views are made">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!usingSoul && (
              <p className="text-[11px] text-muted-foreground">
                {sourceImages.length
                  ? `From ${sourceImages.length === 1 ? "the first image" : `the first ${sourceImages.length} images`} of the sheet${sourceImages.length > 1 ? " and photos" : ""}.`
                  : "Add a photo of the character to the sheet first."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {MAKEABLE_VIEWS.map((view) => {
              const id = `view-${character.id}-${view}`;
              return (
                <label key={view} htmlFor={id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    id={id}
                    checked={chosenViews.includes(view)}
                    onCheckedChange={(checked) =>
                      setViews(
                        checked
                          ? [...chosenViews, view]
                          : chosenViews.filter((entry) => entry !== view),
                      )
                    }
                  />
                  {VIEW_LABELS[view]}
                  {sheetViews.has(view) && (
                    <span className="text-[10px] text-muted-foreground">(on the sheet)</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!canMake || making}
              onClick={() => setConfirming(true)}
              data-testid="character-make-views"
            >
              {making ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 size-3.5" />
              )}
              Make {chosenViews.length} view{chosenViews.length === 1 ? "" : "s"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {total !== null
                ? `About $${total.toFixed(2)} (Higgsfield's estimate).`
                : priced?.note
                  ? priced.note
                  : model
                    ? "Getting the price…"
                    : ""}
            </span>
          </div>
        </div>
      )}

      {(waiting.length > 0 || pending.length > 0 || failed.length > 0) && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium">New views</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((entry) => (
              <li
                key={entry.generationId}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[11px] text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" />
                {VIEW_LABELS[entry.view]}
              </li>
            ))}
            {waiting.map((entry) => (
              <li key={entry.generationId} className="space-y-1.5">
                <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-surface">
                  <MediaPreview
                    bucket={entry.asset!.storage_bucket}
                    path={entry.asset!.storage_path}
                    type="image"
                    alt={VIEW_LABELS[entry.view]}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{VIEW_LABELS[entry.view]}</p>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-[11px]"
                      disabled={sheetCount >= CHARACTER_LIMITS.sheetImages}
                      onClick={() => void keep(entry)}
                    >
                      <Check className="mr-1 size-3" /> Add to sheet
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label="Discard"
                      onClick={() => void discard(entry)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {failed.map((entry) => (
              <li
                key={entry.generationId}
                className={cn(
                  "flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-warning/40 p-2 text-center text-[11px] text-muted-foreground",
                )}
              >
                {VIEW_LABELS[entry.view]}:{" "}
                {entry.status === "nsfw"
                  ? "blocked by moderation. See Activity."
                  : entry.status === "submission_uncertain"
                    ? "Higgsfield's answer was unclear, so it may still come. Check Activity before making it again (it could be charged twice)."
                    : entry.status === "completed"
                      ? "made, but it couldn't be saved. Retry the save in Activity."
                      : "didn't come back. See Activity."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && options.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> No image model that takes reference images is switched
          on.
        </p>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make {chosenViews.length} view{chosenViews.length === 1 ? "" : "s"} of{" "}
              {character.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {usingSoul
                ? `Made from ${character.name}'s Soul ID on ${model?.display_name}.`
                : `Made from ${sourceImages.length === 1 ? "one image" : `${sourceImages.length} images`} with ${model?.display_name}.`}{" "}
              Each view is one generation
              {total !== null ? `: about $${total.toFixed(2)} in all` : ""}. They come back here for
              you to add to the sheet or discard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={making}
              onClick={(event) => {
                event.preventDefault();
                void make();
              }}
            >
              Make them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
