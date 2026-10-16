import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clapperboard, Film, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoryboards } from "@/hooks/useV2Data";
import { setCreatePrefill } from "@/lib/create-draft";
import { useAuth } from "@/hooks/useAuth";
import { createSequence } from "@/hooks/useEditorData";
import { compileFromStoryboard, type CompileAsset, type CompileTake } from "@/lib/edit/compile";
import { SendToKatana } from "@/components/katana/SendToKatana";

export const Route = createFileRoute("/storyboards")({
  head: () => ({
    meta: [
      { title: "Storyboards · Xeno Studio" },
      { name: "description", content: "Scenes, shots and takes for every planned production." },
      { property: "og:title", content: "Storyboards · Xeno Studio" },
      { property: "og:description", content: "Plan, shoot and track takes scene by scene." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoryboardsPage,
});

type StoryboardWithScenes = NonNullable<ReturnType<typeof useStoryboards>["data"]>[number];

/** The takes of every shot in a storyboard, each with the library file it produced. */
async function loadTakes(board: StoryboardWithScenes): Promise<CompileTake[]> {
  const shotIds = (board.scenes ?? []).flatMap((scene) =>
    (scene.shots ?? []).map((shot) => shot.id),
  );
  if (!shotIds.length) return [];
  const { data: takes, error } = await supabase
    .from("shot_takes")
    .select("id,shot_id,take_number,is_selected,asset_id,generation_id")
    .in("shot_id", shotIds);
  if (error) throw error;
  const assetIds = (takes ?? []).map((take) => take.asset_id).filter((id): id is string => !!id);
  const generationIds = (takes ?? [])
    .map((take) => take.generation_id)
    .filter((id): id is string => !!id);
  const columns = "id,asset_type,title,duration_seconds,created_at,generation_id";
  const [byId, byGeneration] = await Promise.all([
    assetIds.length
      ? supabase.from("assets").select(columns).in("id", assetIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    generationIds.length
      ? supabase
          .from("assets")
          .select(columns)
          .in("generation_id", generationIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  // A failed lookup is an error to retry, never "no finished takes".
  for (const result of [byId, byGeneration])
    if ("error" in result && result.error) throw result.error;
  const assets = [...(byId.data ?? []), ...(byGeneration.data ?? [])] as (CompileAsset & {
    generation_id: string | null;
  })[];
  return (takes ?? []).map((take) => {
    const fromGeneration = assets.filter(
      (asset) => take.generation_id && asset.generation_id === take.generation_id,
    );
    const asset =
      assets.find((candidate) => candidate.id === take.asset_id) ??
      fromGeneration.find((candidate) => candidate.asset_type === "video") ??
      fromGeneration.find((candidate) => candidate.asset_type === "image") ??
      null;
    return {
      id: take.id,
      shot_id: take.shot_id,
      take_number: take.take_number,
      is_selected: take.is_selected,
      asset,
    };
  });
}

function StoryboardsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useStoryboards();
  const [openId, setOpenId] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const open = data?.find((s) => s.id === openId) ?? data?.[0] ?? null;

  async function compile(board: StoryboardWithScenes) {
    if (!user) return;
    setCompiling(true);
    try {
      const takes = await loadTakes(board);
      const result = compileFromStoryboard(
        {
          title: board.title,
          primary_aspect_ratio: board.primary_aspect_ratio,
          scenes: (board.scenes ?? []).map((scene) => ({
            scene_number: scene.scene_number,
            shots: (scene.shots ?? []).map((shot) => ({
              id: shot.id,
              shot_number: shot.shot_number,
              name: shot.name,
              duration_seconds: shot.duration_seconds,
              selected_take_id: shot.selected_take_id,
            })),
          })),
        },
        takes,
      );
      if (!result.timeline.clips.length) {
        toast.error("No shot has a finished take yet. Shoot a shot first.");
        return;
      }
      const id = await createSequence({
        userId: user.id,
        title: result.title,
        timeline: result.timeline,
        projectId: board.project_id,
        campaignId: board.campaign_id,
        storyboardId: board.id,
        source: { kind: "storyboard", storyboard_id: board.id },
      });
      if (result.missing.length) {
        const count = result.timeline.clips.length;
        toast.message(`Compiled ${count} shot${count === 1 ? "" : "s"}`, {
          description: `No take yet for: ${result.missing.join(", ")}.`,
        });
      }
      navigate({ to: "/editor/$sequenceId", params: { sequenceId: id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The storyboard could not be compiled");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <AppShell title="Storyboards">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <aside className="panel space-y-1 p-3">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Storyboards</h2>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && !data?.length && <p className="text-sm text-muted-foreground">None yet.</p>}
          {(data ?? []).map((board) => (
            <button
              key={board.id}
              onClick={() => setOpenId(board.id)}
              className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${open?.id === board.id ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {board.title}
            </button>
          ))}
        </aside>

        <section className="panel min-w-0 p-4">
          {!open && (
            <EmptyState
              icon={Clapperboard}
              title="No storyboards yet"
              description="Build a production plan in Director, then create a storyboard from it."
              actionLabel="Open Director"
              onAction={() => navigate({ to: "/director" })}
            />
          )}
          {open && (
            <>
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">{open.title}</h2>
                  <p className="text-sm text-muted-foreground">{open.objective}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void compile(open)}
                  disabled={compiling}
                  data-testid="compile-storyboard"
                >
                  {compiling ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Film className="mr-1.5 size-3.5" />
                  )}
                  Compile selected takes
                </Button>
              </header>
              <div className="space-y-4">
                {[...(open.scenes ?? [])]
                  .sort((a, b) => a.scene_number - b.scene_number)
                  .map((scene) => (
                    <div key={scene.id} className="rounded-lg border border-border p-3">
                      <h3 className="text-sm font-semibold">
                        Scene {scene.scene_number} · {scene.name}
                      </h3>
                      {scene.environment && <p className="text-xs text-muted-foreground">{scene.environment}</p>}
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {[...(scene.shots ?? [])]
                          .sort((a, b) => a.shot_number - b.shot_number)
                          .map((shot) => (
                            <div key={shot.id} className="rounded-md bg-surface-raised p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {shot.shot_number}. {shot.name}
                                </span>
                                <span className="text-xs text-muted-foreground">{shot.status}</span>
                              </div>
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{shot.prompt}</p>
                              <ShotTakes
                                shotId={shot.id}
                                shotName={shot.name ?? `Shot ${shot.shot_number}`}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 px-0 text-primary"
                                onClick={() => {
                                  setCreatePrefill({
                                    prompt: shot.prompt ?? "",
                                    ...(shot.recommended_model_id ? { modelId: shot.recommended_model_id } : {}),
                                    projectId: open.project_id,
                                    shotId: shot.id,
                                  });
                                  navigate({ to: "/" });
                                }}
                              >
                                Shoot this shot
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/** Every generation launched from a shot is filed here as a numbered take. */
function ShotTakes({ shotId, shotName }: { shotId: string; shotName: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["shot_takes", shotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shot_takes")
        .select("id,take_number,is_selected,generation_id")
        .eq("shot_id", shotId)
        .order("take_number");
      if (error) throw error;
      const generationIds = (data ?? []).map((take) => take.generation_id).filter((id): id is string => !!id);
      // Outputs are linked through the generation, so a take shows its result as soon as ingestion finishes.
      const { data: assets } = generationIds.length
        ? await supabase
            .from("assets")
            .select("id,title,project_id,generation_id,asset_type,storage_bucket,storage_path")
            .in("generation_id", generationIds)
            .is("deleted_at", null)
        : { data: [] };
      return (data ?? []).map((take) => {
        const outputs = (assets ?? []).filter(
          (asset) => asset.generation_id === take.generation_id,
        );
        // A take's video when it has one (as compiling picks it), else its image.
        return {
          ...take,
          asset: outputs.find((asset) => asset.asset_type === "video") ?? outputs[0] ?? null,
        };
      });
    },
  });

  if (!data?.length) return null;

  async function select(takeId: string) {
    await supabase.from("shot_takes").update({ is_selected: false }).eq("shot_id", shotId);
    await supabase.from("shot_takes").update({ is_selected: true }).eq("id", takeId);
    await supabase.from("shots").update({ selected_take_id: takeId, status: "approved" }).eq("id", shotId);
    await queryClient.invalidateQueries({ queryKey: ["shot_takes", shotId] });
    await queryClient.invalidateQueries({ queryKey: ["storyboards"] });
    toast.success("Take selected for this shot.");
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {data.map((take) => {
        const asset = take.asset;
        return (
          <div key={take.id} className="group relative">
            <button
              type="button"
              onClick={() => void select(take.id)}
              title={`Take ${take.take_number}`}
              className={`h-14 w-20 overflow-hidden rounded border ${take.is_selected ? "border-primary" : "border-border"}`}
            >
              {asset ? (
                <MediaPreview bucket={asset.storage_bucket} path={asset.storage_path} type={asset.asset_type} contain />
              ) : (
                <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                  Take {take.take_number}
                </span>
              )}
            </button>
            {asset && (
              <SendToKatana
                file={asset}
                title={`${shotName} · take ${take.take_number}`}
                look="pill"
                label=""
                className="absolute top-0.5 right-0.5 px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
