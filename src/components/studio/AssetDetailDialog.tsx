import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Crop, Cpu, Download, Film, Heart, Loader2, Mic, Repeat, Shuffle, SquareStack, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AssetRow } from "@/hooks/useStudioData";
import { useModels, useProjects } from "@/hooks/useStudioData";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { MediaTaskPanel } from "@/components/studio/MediaTaskPanel";
import { ReframeDialog } from "@/components/studio/ReframeDialog";
import {
  downloadAsset,
  moveAsset,
  prefillAnimate,
  prefillFromGeneration,
  prefillUseAsReference,
  softDeleteAsset,
  toggleFavorite,
} from "@/lib/asset-actions";
import { analyseAsset, type AssetAnalysis } from "@/lib/analysis.functions";
import { openLipSyncClip } from "@/lib/lip-sync.functions";
import { clipLipSyncOf, clipSyncSummary } from "@/lib/lip-sync/clip";
import { setSupercomputerHandoff } from "@/lib/supercomputer/handoff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function AssetDetailDialog({
  asset,
  onOpenChange,
}: {
  asset: AssetRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: models = [] } = useModels();
  const { data: projects = [] } = useProjects();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reframing, setReframing] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [openingWithVoice, setOpeningWithVoice] = useState(false);
  const analysis = (asset?.metadata as { analysis?: AssetAnalysis } | null)?.analysis ?? null;
  // A clip made to a voiceover: it opens in the Editor with it, lips lined up.
  const lipSync = asset?.asset_type === "video" ? clipLipSyncOf(asset.metadata) : null;

  async function runAnalysis() {
    if (!asset || analysing) return;
    setAnalysing(true);
    try {
      await analyseAsset({ data: { assetId: asset.id } });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Analysis complete.");
    } catch (error) {
      // A failed analysis never affects the media itself — it can be retried.
      toast.error(error instanceof Error ? error.message : "The analysis could not be completed.");
    } finally {
      setAnalysing(false);
    }
  }

  const { data: generation } = useQuery({
    queryKey: ["asset-generation", asset?.generation_id],
    enabled: !!asset?.generation_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("generations")
        .select("id,prompt,parameters,status,model_path,operation,estimated_cost_usd,created_at")
        .eq("id", asset!.generation_id!)
        .maybeSingle();
      return data;
    },
  });

  // Lineage: where this output came from, and everything derived from it.
  const { data: lineage } = useQuery({
    queryKey: ["asset-lineage", asset?.generation_id],
    enabled: !!asset?.generation_id,
    queryFn: async () => {
      const { data: self } = await supabase
        .from("generations")
        .select("id,parent_generation_id")
        .eq("id", asset!.generation_id!)
        .maybeSingle();
      const { data: children } = await supabase
        .from("generations")
        .select("id,model_path,operation,status,created_at")
        .eq("parent_generation_id", asset!.generation_id!)
        .order("created_at");
      const { data: parent } = self?.parent_generation_id
        ? await supabase
            .from("generations")
            .select("id,model_path,operation,status,created_at")
            .eq("id", self.parent_generation_id)
            .maybeSingle()
        : { data: null };
      return { parent, children: children ?? [] };
    },
  });

  if (!asset) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["assets"] });
  const guard = (fn: () => Promise<void> | void) => async () => {
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That action failed");
    }
  };

  return (
    <>
      <Dialog open={!!asset} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto scroll-slim">
          <DialogHeader>
            <DialogTitle className="truncate">{asset.title ?? "Untitled asset"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              <MediaPreview
                bucket={asset.storage_bucket}
                path={asset.storage_path}
                type={asset.asset_type}
                controls
                contain
                alt={asset.title ?? "Asset preview"}
              />
            </div>

            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Meta label="Type" value={asset.asset_type} />
                <Meta label="Source" value={asset.source_type} />
                <Meta label="Created" value={new Date(asset.created_at).toLocaleString()} />
                <Meta
                  label="Project"
                  value={projects.find((project) => project.id === asset.project_id)?.name ?? "Unassigned"}
                />
                {asset.width && asset.height && <Meta label="Size" value={`${asset.width}×${asset.height}`} />}
                {asset.duration_seconds && <Meta label="Duration" value={`${asset.duration_seconds}s`} />}
              </div>

              {generation && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="label-eyebrow">Generation</span>
                    <StatusBadge status={generation.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{generation.model_path}</p>
                  {generation.prompt && <p className="text-xs whitespace-pre-wrap">{generation.prompt}</p>}
                  {generation.estimated_cost_usd !== null && (
                    <p className="text-xs text-muted-foreground">
                      Estimated cost ${Number(generation.estimated_cost_usd).toFixed(2)}
                    </p>
                  )}
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Parameters</summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2 font-mono text-[11px] scroll-slim">
                      {JSON.stringify(generation.parameters, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              <div className="space-y-2">
                <span className="label-eyebrow">Move to project</span>
                <Select
                  value={asset.project_id ?? "none"}
                  onValueChange={(value: string) => {
                    void moveAsset(asset.id, value === "none" ? null : value)
                      .then(() => {
                        refresh();
                        toast.success("Asset moved");
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "That action failed"),
                      );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {lipSync && (
                <div
                  className="space-y-2 rounded-md border border-border p-3 text-xs"
                  data-testid="asset-lip-sync"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <Mic className="size-3.5 text-primary" /> Made to a voiceover
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {clipSyncSummary(lipSync)?.detail ?? "Measuring where it puts the speech…"}
                  </p>
                  <Button
                    size="sm"
                    disabled={openingWithVoice}
                    onClick={guard(async () => {
                      setOpeningWithVoice(true);
                      try {
                        const result = await openLipSyncClip({
                          data: { assetId: asset.id, keepSound: false, captions: false },
                        });
                        onOpenChange(false);
                        navigate({
                          to: "/editor/$sequenceId",
                          params: { sequenceId: result.sequenceId },
                        });
                      } finally {
                        setOpeningWithVoice(false);
                      }
                    })}
                    data-testid="asset-open-lip-sync"
                  >
                    {openingWithVoice ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Film className="mr-1.5 size-4" />
                    )}
                    Open in Editor with its voiceover
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={guard(() => downloadAsset(asset))}>
                  <Download className="mr-1.5 size-4" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={guard(async () => {
                    await toggleFavorite(asset);
                    refresh();
                  })}
                >
                  <Heart className={asset.is_favorite ? "mr-1.5 size-4 fill-primary text-primary" : "mr-1.5 size-4"} />
                  {asset.is_favorite ? "Unfavorite" : "Favorite"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    prefillUseAsReference(asset);
                    onOpenChange(false);
                    navigate({ to: "/" });
                  }}
                >
                  <SquareStack className="mr-1.5 size-4" /> Use as reference
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSupercomputerHandoff({
                      text:
                        asset.source_type === "generated"
                          ? "Review this output and suggest how to push it further, with ready-to-run drafts."
                          : "Brainstorm what we could make from this reference, with ready-to-run drafts.",
                      intent: asset.source_type === "generated" ? "review" : "brainstorm",
                      attachments: [
                        {
                          assetId: asset.id,
                          type: asset.asset_type,
                          title: asset.title,
                          bucket: asset.storage_bucket,
                          path: asset.storage_path,
                        },
                      ],
                      projectId: asset.project_id,
                    });
                    onOpenChange(false);
                    navigate({ to: "/supercomputer" });
                  }}
                >
                  <Cpu className="mr-1.5 size-4" /> Ask Supercomputer
                </Button>
                {asset.asset_type !== "audio" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReframing(true)}
                    data-testid="asset-reframe"
                  >
                    <Crop className="mr-1.5 size-4" /> Reframe
                  </Button>
                )}
                {asset.asset_type === "image" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      prefillAnimate(asset, models);
                      onOpenChange(false);
                      navigate({ to: "/" });
                    }}
                  >
                    <Film className="mr-1.5 size-4" /> Animate
                  </Button>
                )}
                {asset.asset_type === "image" && (
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs uppercase tracking-wide text-muted-foreground">AI evaluation</h4>
                      <Button size="sm" variant="outline" onClick={() => void runAnalysis()} disabled={analysing}>
                        {analysing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Brain className="mr-1.5 size-3.5" />}
                        {analysis ? "Re-analyse" : "Analyse"}
                      </Button>
                    </div>
                    {analysis ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <p>{analysis.summary}</p>
                        <p className="text-muted-foreground">Style: {analysis.style}</p>
                        <p className="text-muted-foreground">
                          AI quality score: {analysis.quality_score}/5
                          {analysis.prompt_adherence ? ` · prompt adherence ${analysis.prompt_adherence}/5` : ""}
                        </p>
                        {analysis.issues.length > 0 && (
                          <p className="text-muted-foreground">Noted issues: {analysis.issues.join("; ")}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Automated evaluation — it never sets an approval status on its own.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Not analysed yet. Requires the reasoning key to be configured.
                      </p>
                    )}
                  </div>
                )}

                {(lineage?.parent || !!lineage?.children.length) && (
                  <div className="rounded-md border border-border p-3">
                    <h4 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Lineage</h4>
                    {lineage.parent && (
                      <p className="text-xs text-muted-foreground">
                        Derived from <span className="text-foreground">{lineage.parent.model_path}</span> ·{" "}
                        {lineage.parent.operation}
                      </p>
                    )}
                    {lineage.children.map((child) => (
                      <p key={child.id} className="text-xs text-muted-foreground">
                        Led to <span className="text-foreground">{child.model_path}</span> · {child.operation} ·{" "}
                        {child.status}
                      </p>
                    ))}
                  </div>
                )}

                <MediaTaskPanel asset={asset} />

                {asset.generation_id && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={guard(async () => {
                        await prefillFromGeneration(asset.generation_id!);
                        onOpenChange(false);
                        navigate({ to: "/" });
                      })}
                    >
                      <Repeat className="mr-1.5 size-4" /> Recreate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={guard(async () => {
                        await prefillFromGeneration(asset.generation_id!, { variation: true });
                        onOpenChange(false);
                        navigate({ to: "/" });
                      })}
                    >
                      <Shuffle className="mr-1.5 size-4" /> Create variation
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="text-primary" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 size-4" /> Delete
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {asset.asset_type !== "audio" && (
        <ReframeDialog key={asset.id} asset={asset} open={reframing} onOpenChange={setReframing} />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from the library but the generation history is kept for auditing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={guard(async () => {
                await softDeleteAsset(asset.id);
                refresh();
                setConfirmDelete(false);
                onOpenChange(false);
                toast.success("Asset deleted");
              })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label-eyebrow block">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}
