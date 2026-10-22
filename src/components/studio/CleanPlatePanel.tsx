import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clapperboard, Loader2, RotateCcw, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AssetRow } from "@/hooks/useStudioData";
import { useModels } from "@/hooks/useStudioData";
import {
  estimateCleanPlateStep,
  getCleanPlate,
  listCleanPlates,
  queueCleanPlateStep,
  retryCleanPlateStep,
  setCleanPlateMask,
  startCleanPlate,
} from "@/lib/clean-plate.functions";
import {
  EDIT_PROMPT,
  frameRoles,
  PLATE_LIMITS,
  type BilledStep,
  type CleanPlateView,
  type PlateEnd,
  type WorkerStep,
} from "@/lib/media/clean-plate";
import { alignmentOf, alignmentSummary } from "@/lib/media/align-take";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { BoxEditor, type EditableBox } from "@/components/studio/BoxEditor";
import { MediaPreview, useSignedUrl } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The clean-plate recipe from a picture's detail: a logo moved by a video
 * model without the model ever drawing a letter. Lists the recipes made from
 * this picture and starts one.
 */
export function CleanPlatePanel({ asset }: { asset: AssetRow }) {
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { data: recipes = [], refetch } = useQuery({
    queryKey: ["clean-plates", asset.id],
    queryFn: () => listCleanPlates({ data: { artAssetId: asset.id } }),
    enabled: asset.asset_type === "image",
  });
  if (asset.asset_type !== "image") return null;

  async function start() {
    setStarting(true);
    try {
      const view = await startCleanPlate({
        data: { artAssetId: asset.id, clientRequestId: crypto.randomUUID() },
      });
      await refetch();
      setOpen(view.recipeId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The recipe couldn't be started.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="clean-plate">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Logo in motion</h4>
        <Button size="sm" variant="outline" disabled={starting} onClick={() => void start()}>
          {starting ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Clapperboard className="mr-1.5 size-3.5" />
          )}
          {starting ? "Reading the lettering…" : "Start a clean plate"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Video models garble lettering. The lettering is taken out of the art, the clean plate is
        animated, and the supplied letters are laid back over the take, so no model draws a letter.
      </p>
      {recipes.length > 0 && (
        <ul className="space-y-1 text-xs">
          {recipes.map((recipe) => (
            <li key={recipe.recipeId}>
              <button
                type="button"
                className="text-left text-primary hover:underline"
                onClick={() => setOpen(recipe.recipeId)}
              >
                {recipe.title}
              </button>
              <span className="text-muted-foreground"> · {recipe.next}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <CleanPlateDialog
          recipeId={open}
          onOpenChange={(next) => {
            if (!next) {
              setOpen(null);
              void refetch();
            }
          }}
        />
      )}
    </div>
  );
}

interface FileRow {
  id: string;
  asset_type: "image" | "video" | "audio";
  storage_bucket: string;
  storage_path: string;
}

/** The library files a recipe's steps made, for previews. */
function useFiles(ids: string[]) {
  return useQuery({
    queryKey: ["clean-plate-files", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path")
        .in("id", ids);
      return new Map(((data ?? []) as FileRow[]).map((row) => [row.id, row]));
    },
  });
}

const STEP_HINTS: Record<string, string> = {
  mask: "Where the lettering is. The edit is laid into the art only here.",
  edit: "One image edit takes the lettering out of the art.",
  blend: "The edit laid into the art inside the mask; everything else is the art's own.",
  animate: "A video model moves the clean plate. It is told never to draw a letter.",
  align: "The take put on the plate exactly, its colour matched, then crossed to it.",
  overlay: "The supplied letters laid back over the take, exactly.",
};

function CleanPlateDialog({
  recipeId,
  onOpenChange,
}: {
  recipeId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: view, refetch } = useQuery({
    queryKey: ["clean-plate", recipeId],
    queryFn: () => getCleanPlate({ data: { recipeId } }),
    refetchInterval: (query) => (query.state.data?.status === "running" ? 4000 : false),
  });
  const ids = useMemo(
    () =>
      [view?.art.assetId, ...(view?.steps.map((step) => step.assetId) ?? [])].filter(
        (id): id is string => !!id,
      ),
    [view],
  );
  const { data: files } = useFiles(ids);
  const art = view ? files?.get(view.art.assetId) : undefined;
  const artUrl = useSignedUrl(art?.storage_bucket, art?.storage_path);
  const shown = (assetId: string | null) => (assetId ? files?.get(assetId) : undefined);

  const update = async (work: () => Promise<CleanPlateView>) => {
    try {
      const next = await work();
      queryClient.setQueryData(["clean-plate", recipeId], next);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
      await refetch();
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto scroll-slim">
        <DialogHeader>
          <DialogTitle>{view ? `${view.title}: clean plate` : "Clean plate"}</DialogTitle>
        </DialogHeader>
        {!view ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Opening the recipe…
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p
              className={cn(
                "flex items-start gap-1.5 text-xs",
                view.status === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {view.status === "running" ? (
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
              ) : view.status === "completed" ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : view.status === "failed" ? (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              ) : null}
              {view.next}
            </p>
            <MaskStep
              view={view}
              artUrl={artUrl}
              onSave={(change) =>
                update(() => setCleanPlateMask({ data: { recipeId, ...change } }))
              }
            />
            {view.steps
              .filter((step) => step.step !== "mask")
              .map((step) => {
                const file = shown(step.assetId);
                const alignment = step.step === "align" ? alignmentOf(step.report) : null;
                return (
                  <section
                    key={step.step}
                    className="space-y-2 rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-medium">{step.label}</h4>
                      <span className="text-[11px] text-muted-foreground">
                        {step.status === "completed" && !step.upToDate
                          ? "made from an earlier step"
                          : step.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{STEP_HINTS[step.step]}</p>
                    {step.error && <p className="text-xs text-destructive">{step.error.message}</p>}
                    {alignment && <p className="text-xs">{alignmentSummary(alignment)}</p>}
                    {file && (
                      <button
                        type="button"
                        className="block h-32 w-56 overflow-hidden rounded border border-border"
                        onClick={() => navigate({ to: "/assets", search: { asset: file.id } })}
                        title="Open in the library"
                      >
                        <MediaPreview
                          bucket={file.storage_bucket}
                          path={file.storage_path}
                          type={file.asset_type}
                          contain
                        />
                      </button>
                    )}
                    {step.billed ? (
                      <BilledStepForm
                        view={view}
                        step={step.step as BilledStep}
                        onQueue={(request) =>
                          update(() =>
                            queueCleanPlateStep({
                              data: { recipeId, step: step.step as BilledStep, ...request },
                            }),
                          )
                        }
                      />
                    ) : (
                      step.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void update(() =>
                              retryCleanPlateStep({
                                data: { recipeId, step: step.step as WorkerStep },
                              }),
                            )
                          }
                        >
                          <RotateCcw className="mr-1.5 size-3.5" /> Try again
                        </Button>
                      )
                    )}
                  </section>
                );
              })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MaskStep({
  view,
  artUrl,
  onSave,
}: {
  view: CleanPlateView;
  artUrl: string | null;
  onSave: (change: { boxes: EditableBox[]; grow: number; feather: number }) => Promise<void>;
}) {
  const step = view.steps.find((entry) => entry.step === "mask")!;
  const [boxes, setBoxes] = useState<EditableBox[]>([]);
  const [grow, setGrow] = useState(String(view.mask.grow));
  const [feather, setFeather] = useState(String(view.mask.feather));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setBoxes(
      view.mask.boxes.map((box, index) => ({ ...box, id: `b${index}`, label: "Lettering" })),
    );
    setGrow(String(view.mask.grow));
    setFeather(String(view.mask.feather));
  }, [view.mask.revision, view.mask.boxes, view.mask.grow, view.mask.feather]);
  const number = (value: string, most: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(most, parsed)) : 0;
  };

  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">{step.label}</h4>
        <span className="text-[11px] text-muted-foreground">{step.status}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {view.mask.lettering
          ? "From the transparent lettering file (its alpha), and any boxes below."
          : "Each box covers lettering. Remove a box with its cross, or drag across the picture to add one."}
      </p>
      {view.note && <p className="text-xs text-warning">{view.note}</p>}
      <div className="max-w-xl">
        <BoxEditor
          url={artUrl}
          aspect={view.art.width / view.art.height}
          boxes={boxes}
          onChange={setBoxes}
          tone="lettering"
        />
      </div>
      <div className="grid max-w-sm grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Past the lettering (px)</Label>
          <Input
            className="h-9"
            inputMode="decimal"
            value={grow}
            onChange={(event) => setGrow(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Feather (px)</Label>
          <Input
            className="h-9"
            inputMode="decimal"
            value={feather}
            onChange={(event) => setFeather(event.target.value)}
          />
        </div>
      </div>
      {step.error && <p className="text-xs text-destructive">{step.error.message}</p>}
      <Button
        size="sm"
        disabled={saving || (!boxes.length && !view.mask.lettering)}
        onClick={async () => {
          setSaving(true);
          await onSave({
            boxes,
            grow: number(grow, PLATE_LIMITS.grow),
            feather: number(feather, PLATE_LIMITS.feather),
          });
          setSaving(false);
        }}
      >
        {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        {view.mask.revision ? "Use the changed mask" : "Use this mask"}
      </Button>
    </section>
  );
}

/** Models for a billed step: image models that take a picture, or video models that start or end on one. */
function modelsFor(models: ModelRegistryEntry[], step: BilledStep): ModelRegistryEntry[] {
  return models.filter((model) => {
    const roles = frameRoles(model);
    return step === "edit"
      ? model.output_type === "image" && !!roles.first
      : model.output_type === "video" && (!!roles.first || !!roles.last);
  });
}

function BilledStepForm({
  view,
  step,
  onQueue,
}: {
  view: CleanPlateView;
  step: BilledStep;
  onQueue: (request: {
    modelId: string;
    parameters: Record<string, unknown>;
    estimatedCostUsd: number | null;
    end?: PlateEnd;
    crossSeconds?: number;
    holdSeconds?: number;
  }) => Promise<void>;
}) {
  const { data: models = [] } = useModels();
  const choices = useMemo(() => modelsFor(models, step), [models, step]);
  const [modelId, setModelId] = useState<string>("");
  const [prompt, setPrompt] = useState(step === "edit" ? EDIT_PROMPT : "");
  const [end, setEnd] = useState<PlateEnd>(view.landing.end);
  const [cross, setCross] = useState(String(view.landing.crossSeconds));
  const [hold, setHold] = useState(String(view.landing.holdSeconds));
  const [price, setPrice] = useState<{ usd: number | null; message: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const state = view.steps.find((entry) => entry.step === step)!;
  const model = choices.find((entry) => entry.id === modelId) ?? null;
  const ready =
    step === "edit" || view.steps.find((entry) => entry.step === "blend")?.upToDate === true;
  if (!ready) return null;

  const request = () => ({
    modelId,
    parameters: { prompt },
    ...(step === "animate"
      ? {
          end,
          crossSeconds: Math.max(0, Math.min(PLATE_LIMITS.cross, Number(cross) || 0)),
          holdSeconds: Math.max(0, Math.min(PLATE_LIMITS.hold, Number(hold) || 0)),
        }
      : {}),
  });

  return (
    <div className="space-y-2">
      <Select
        value={modelId}
        onValueChange={(value) => {
          setModelId(value);
          setPrice(null);
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue
            placeholder={step === "edit" ? "Choose an image model" : "Choose a video model"}
          />
        </SelectTrigger>
        <SelectContent>
          {choices.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        className="min-h-20 text-xs"
        value={prompt}
        placeholder={
          step === "animate" ? "How it moves: a slow highlight along the emblem's edges…" : ""
        }
        onChange={(event) => {
          setPrompt(event.target.value);
          setPrice(null);
        }}
      />
      {step === "animate" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">The plate is its</Label>
            <Select value={end} onValueChange={(value) => setEnd(value as PlateEnd)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last" disabled={!!model && !frameRoles(model).last}>
                  Last frame
                </SelectItem>
                <SelectItem value="first" disabled={!!model && !frameRoles(model).first}>
                  First frame
                </SelectItem>
                <SelectItem
                  value="both"
                  disabled={!!model && !(frameRoles(model).first && frameRoles(model).last)}
                >
                  First and last
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Cross (s)</Label>
            <Input
              className="h-9"
              inputMode="decimal"
              value={cross}
              onChange={(event) => setCross(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Hold (s)</Label>
            <Input
              className="h-9"
              inputMode="decimal"
              value={hold}
              onChange={(event) => setHold(event.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!modelId || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const quote = await estimateCleanPlateStep({
                data: { recipeId: view.recipeId, step, ...request() },
              });
              setPrice({
                usd: quote.costUsd,
                message: quote.ok ? null : (quote.message ?? quote.code),
              });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "It couldn't be priced.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Price it
        </Button>
        <Button
          size="sm"
          disabled={!modelId || busy || !price || price.usd === null || state.status === "running"}
          onClick={async () => {
            setBusy(true);
            await onQueue({ ...request(), estimatedCostUsd: price?.usd ?? null });
            setPrice(null);
            setBusy(false);
          }}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 size-3.5" />
          )}
          {step === "edit"
            ? state.assetId
              ? "Make another edit"
              : "Make the edit"
            : state.assetId
              ? "Make another take"
              : "Make the take"}
        </Button>
        {price && (
          <span className="text-xs text-muted-foreground">
            {price.usd !== null
              ? `About US$${price.usd.toFixed(2)}, billed by the provider.`
              : price.message}
          </span>
        )}
      </div>
    </div>
  );
}
