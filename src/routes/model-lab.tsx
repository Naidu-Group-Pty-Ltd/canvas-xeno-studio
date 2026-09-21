import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useGenerations, useModels } from "@/hooks/useStudioData";
import { useArenaSessions, useModelMetrics } from "@/hooks/useV2Data";
import { estimateGeneration, submitGeneration } from "@/lib/generation.functions";
import { defaultsForModel } from "@/lib/model-schema";

export const Route = createFileRoute("/model-lab")({
  head: () => ({
    meta: [
      { title: "Model Lab · Xeno Studio" },
      { name: "description", content: "Compare models side by side and review measured performance." },
      { property: "og:title", content: "Model Lab · Xeno Studio" },
      { property: "og:description", content: "Arena comparisons and evidence-based model intelligence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelLabPage,
});

function ModelLabPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: models, isLoading } = useModels();
  const { data: metrics } = useModelMetrics();
  const { data: sessions } = useArenaSessions();
  const { data: generations } = useGenerations({ limit: 60 });

  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [totalEstimate, setTotalEstimate] = useState<number | null>(null);

  const eligible = useMemo(
    () => (models ?? []).filter((m) => m.output_type === mediaType && ["text-to-image", "text-to-video"].includes(m.operation)),
    [models, mediaType],
  );

  const byFamily = useMemo(() => {
    const map = new Map<string, typeof eligible>();
    for (const model of models ?? []) {
      const list = map.get(model.family) ?? [];
      list.push(model);
      map.set(model.family, list);
    }
    return [...map.entries()];
  }, [models]);

  function toggle(id: string) {
    setTotalEstimate(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 6 ? prev : [...prev, id]));
  }

  async function estimateAll() {
    if (selected.length < 2 || !prompt.trim()) return;
    setBusy(true);
    try {
      let total = 0;
      for (const id of selected) {
        const model = eligible.find((m) => m.id === id);
        if (!model) continue;
        const result = await estimateGeneration({
          data: { modelId: id, parameters: { ...defaultsForModel(model), prompt }, inputs: [] },
        });
        if (result.ok && result.costUsd !== null) total += result.costUsd;
      }
      setTotalEstimate(total);
    } catch {
      toast.error("Estimate unavailable for one or more models.");
    } finally {
      setBusy(false);
    }
  }

  async function runArena() {
    if (!user || selected.length < 2 || !prompt.trim()) return;
    setBusy(true);
    try {
      const { data: session, error } = await supabase
        .from("arena_sessions")
        .insert({
          created_by: user.id,
          prompt,
          media_type: mediaType,
          status: "running",
          estimated_cost_usd: totalEstimate,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      for (const id of selected) {
        const model = eligible.find((m) => m.id === id);
        if (!model) continue;
        const result = await submitGeneration({
          data: {
            modelId: id,
            parameters: { ...defaultsForModel(model), prompt },
            inputs: [],
            clientRequestId: crypto.randomUUID(),
          },
        });
        await supabase.from("arena_entries").insert({
          session_id: session.id,
          model_registry_id: id,
          generation_id: result.generationId ?? null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["arena_sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Arena running. Results appear as each model finishes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the arena");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Model Lab">
      <div className="space-y-6 p-4">
        <section className="panel space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Swords className="size-4 text-primary" /> Arena
          </h2>
          <div className="flex gap-2">
            {(["image", "video"] as const).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={mediaType === type ? "default" : "outline"}
                onClick={() => {
                  setMediaType(type);
                  setSelected([]);
                  setTotalEstimate(null);
                }}
              >
                {type === "image" ? "Image" : "Video"}
              </Button>
            ))}
          </div>
          <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="One prompt, several models…" />
          <div className="flex flex-wrap gap-2">
            {eligible.map((model) => (
              <button
                key={model.id}
                onClick={() => toggle(model.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${selected.includes(model.id) ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {model.display_name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={busy || selected.length < 2 || !prompt.trim()} onClick={() => void estimateAll()}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Estimate total
            </Button>
            <span className="text-sm text-muted-foreground">
              {totalEstimate !== null
                ? `Estimated total $${totalEstimate.toFixed(2)} across ${selected.length} models`
                : "Select 2–6 models, then estimate before running."}
            </span>
            <Button size="sm" disabled={busy || totalEstimate === null} onClick={() => void runArena()}>
              Run arena
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold">Recent arena sessions</h2>
          {!sessions?.length && (
            <EmptyState icon={Swords} title="No comparisons yet" description="Run one prompt across several models to build routing evidence." />
          )}
          {(sessions ?? []).map((session) => (
            <div key={session.id} className="panel p-4">
              <p className="text-sm">{session.prompt}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(session.arena_entries ?? []).map((entry) => {
                  const generation = generations?.find((g) => g.id === entry.generation_id);
                  const model = models?.find((m) => m.id === entry.model_registry_id);
                  return (
                    <div key={entry.id} className="rounded-md bg-surface-raised p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{model?.display_name ?? "Model"}</span>
                        {generation ? <StatusBadge status={generation.status} /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold">Model intelligence</h2>
          {isLoading && <Skeleton className="h-32 w-full" />}
          {!isLoading && !models?.length && <EmptyState icon={Boxes} title="No models configured" description="Add models to the registry first." />}
          {byFamily.map(([family, list]) => (
            <div key={family} className="panel p-4">
              <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{family}</h3>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {list.map((model) => {
                  const metric = metrics?.find((m) => m.model_registry_id === model.id);
                  return (
                    <div key={model.id} className="rounded-md bg-surface-raised p-3">
                      <p className="text-sm font-medium">{model.display_name}</p>
                      <p className="text-xs text-muted-foreground">{model.operation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {metric?.sample_count
                          ? `${metric.sample_count} samples · ${Math.round((metric.success_rate ?? 0) * 100)}% success`
                          : "No measured samples yet"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
