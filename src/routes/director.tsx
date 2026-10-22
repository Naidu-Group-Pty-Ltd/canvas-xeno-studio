import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Coins, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandPicker } from "@/components/brand/BrandPicker";
import { FormulaBeats, FormulaPicker } from "@/components/brand/FormulaPicker";
import { useAuth } from "@/hooks/useAuth";
import { useBrandKits } from "@/hooks/useBrandKits";
import { useProjects } from "@/hooks/useStudioData";
import { useProductionPlans } from "@/hooks/useV2Data";
import { CHANNEL_LABELS, CHANNELS, EMPTY_DNA, type Channel } from "@/lib/brand/dna";
import { CHANNEL_GUIDES, formulaById } from "@/lib/brand/formulas";
import { brandKitIn } from "@/lib/edit/brand";
import { askDirector } from "@/lib/director-client";
import {
  createStoryboardFromPlan,
  estimateProductionPlan,
  getReasoningHealth,
} from "@/lib/director.functions";
import type { ProductionPlan } from "@/lib/production-plan-schema";
import { checkGenerationStage } from "@/lib/costs.functions";
import { setCreatePrefill } from "@/lib/create-draft";

export const Route = createFileRoute("/director")({
  head: () => ({
    meta: [
      { title: "Director · Xeno Studio" },
      {
        name: "description",
        content: "Turn a creative brief into a structured, costed production plan.",
      },
      { property: "og:title", content: "Director · Xeno Studio" },
      {
        property: "og:description",
        content: "AI creative direction and production planning for the internal team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorPage,
});

function DirectorPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects } = useProjects();
  const { data: plans, isLoading } = useProductionPlans();
  const { data: health } = useQuery({
    queryKey: ["reasoning-health"],
    enabled: !!profile?.is_active,
    queryFn: () => getReasoningHealth(),
  });

  const [brief, setBrief] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  // The brand: the project's (else the studio default) until one is chosen or cleared.
  const [brandChoice, setBrandChoice] = useState<string | null | undefined>(undefined);
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [revision, setRevision] = useState("");

  const { data: brandData } = useBrandKits();
  const kits = brandData?.kits ?? [];
  const brandKit = brandKitIn(kits, projectId, brandChoice);
  const formula = formulaById(formulaId, brandKit?.ownFormulas ?? []);
  const length = seconds ?? formula?.seconds.ideal ?? 30;

  const activePlan = plans?.find((p) => p.id === activePlanId) ?? plans?.[0] ?? null;
  const plan = (activePlan?.plan ?? null) as ProductionPlan | null;

  async function generatePlan() {
    if (!brief.trim()) return;
    setBusy(true);
    try {
      const result = await askDirector({
        action: "plan",
        brief,
        projectId,
        brandKitId: brandKit?.id ?? null,
        formula: formula ? { id: formula.id, seconds: length, channel } : null,
      });
      setActivePlanId(result.planId);
      setBrief("");
      toast.success("Production plan ready. Nothing has been generated or charged yet.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Director could not build a plan");
    } finally {
      // A plan kept on the server shows even if its answer was lost on the way.
      await queryClient.invalidateQueries({ queryKey: ["production_plans"] });
      setBusy(false);
    }
  }

  async function revise() {
    if (!activePlan || !revision.trim()) return;
    setBusy(true);
    try {
      await askDirector({ action: "revise", planId: activePlan.id, instruction: revision });
      setRevision("");
      toast.success("Plan revised.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revision failed");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["production_plans"] });
      setBusy(false);
    }
  }

  async function estimate() {
    if (!activePlan) return;
    setBusy(true);
    try {
      const result = await estimateProductionPlan({ data: { planId: activePlan.id } });
      await queryClient.invalidateQueries({ queryKey: ["production_plans"] });
      toast.success(
        `Estimated total $${result.totalEstimatedUsd.toFixed(2)}${result.unresolvedShots ? ` · ${result.unresolvedShots} shot(s) without a priced model` : ""}`,
      );
      // The plan's shots are the next stage: checked whole against the
      // Higgsfield balance and the spending limit before any of it is shot.
      const verdict = result.perShot.length
        ? await checkGenerationStage({
            data: {
              items: result.perShot.slice(0, 200).map((shot) => ({
                label: `Shot ${shot.shot}`,
                usd: shot.cost,
              })),
              projectId:
                (activePlan as { project_id?: string | null }).project_id ?? projectId ?? null,
              allowUnpriced: true,
            },
          }).catch(() => null)
        : null;
      if (verdict && !verdict.fits && verdict.reasons[0]) toast.warning(verdict.reasons[0]);
      else if (verdict?.warnings[0]) toast.message(verdict.warnings[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Estimate unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function toStoryboard() {
    if (!activePlan) return;
    setBusy(true);
    try {
      await createStoryboardFromPlan({ data: { planId: activePlan.id, projectId } });
      await queryClient.invalidateQueries({ queryKey: ["storyboards"] });
      toast.success("Storyboard created.");
      navigate({ to: "/storyboards" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the storyboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Director">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section className="panel space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> Creative brief
          </h2>
          {health && !health.configured && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              Reasoning provider not configured. Add an OPENAI_API_KEY backend secret, or enable
              Lovable AI for this project, to use Director. Manual creation is unaffected.
            </p>
          )}
          <Textarea
            rows={8}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Create a premium 30-second automotive campaign. Black supercar, night city, wet roads, six cinematic shots, blue lighting, no dialogue."
          />
          <select
            className="h-9 w-full rounded-md border border-border bg-surface-raised px-2 text-sm"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
            aria-label="Project"
          >
            <option value="">No project</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="director-brand-formula">
            <BrandPicker
              kitId={brandKit?.id ?? null}
              onChange={(kitId) => setBrandChoice(kitId)}
              kind="video"
              room={0}
            />
            <FormulaPicker
              dna={brandKit?.dna ?? EMPTY_DNA}
              own={brandKit?.ownFormulas ?? []}
              brandName={brandKit?.name ?? null}
              value={formulaId}
              onChange={(id) => {
                setFormulaId(id);
                setSeconds(null);
              }}
              ask={{ channel, seconds }}
            />
          </div>
          {formula && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs"
                  value={channel ?? ""}
                  onChange={(e) => {
                    const next = (e.target.value || null) as Channel | null;
                    setChannel(next);
                  }}
                  aria-label="Where it runs"
                >
                  <option value="">Any channel</option>
                  {CHANNELS.map((entry) => (
                    <option key={entry} value={entry}>
                      {CHANNEL_LABELS[entry]} · {CHANNEL_GUIDES[entry].shape}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    step={1}
                    value={length}
                    onChange={(e) => {
                      const value = Math.round(Number(e.target.value));
                      if (Number.isFinite(value)) setSeconds(Math.max(5, Math.min(600, value)));
                    }}
                    className="h-8 text-xs"
                    aria-label="Length in seconds"
                  />
                  s
                </label>
              </div>
              <FormulaBeats formula={formula} seconds={length} />
            </div>
          )}
          <Button
            className="w-full"
            disabled={busy || !brief.trim() || !health?.configured}
            onClick={() => void generatePlan()}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 size-4" />
            )}
            Build production plan
          </Button>
          <p className="text-xs text-muted-foreground">
            Planning is free. Nothing is submitted to the generation provider until you choose to
            generate.
          </p>

          <div className="pt-2">
            <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Recent plans
            </h3>
            <div className="space-y-1">
              {(plans ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePlanId(p.id)}
                  className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${activePlan?.id === p.id ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p.title} · v{p.version}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel min-w-0 space-y-4 p-4">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && !plan && (
            <EmptyState
              icon={Sparkles}
              title="No production plan yet"
              description="Describe the campaign on the left and Director will structure scenes, shots and model routing."
            />
          )}
          {plan && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{plan.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {plan.creative_summary ?? plan.objective}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void estimate()}
                  >
                    <Coins className="mr-2 size-4" /> Estimate plan
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void toStoryboard()}>
                    <Clapperboard className="mr-2 size-4" /> Create storyboard
                  </Button>
                </div>
              </header>

              {activePlan?.total_estimated_cost_usd != null && (
                <p className="text-sm">
                  Estimated total cost:{" "}
                  <span className="font-semibold text-primary">
                    ${Number(activePlan.total_estimated_cost_usd).toFixed(2)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    (provider estimate, not a confirmed charge)
                  </span>
                </p>
              )}

              {plan.unsupported_capability?.length ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  No active model covers: {plan.unsupported_capability.join(", ")}
                </p>
              ) : null}

              <div className="space-y-4">
                {(plan.scenes ?? []).map((scene) => (
                  <div key={scene.scene_number} className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold">
                      Scene {scene.scene_number} · {scene.name}
                    </h3>
                    {scene.purpose && (
                      <p className="text-xs text-muted-foreground">{scene.purpose}</p>
                    )}
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(scene.shots ?? []).map((shot) => (
                        <div
                          key={shot.shot_number}
                          className="rounded-md bg-surface-raised p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {shot.shot_number}. {shot.name}
                            </span>
                            {shot.duration ? (
                              <span className="text-xs text-muted-foreground">
                                {shot.duration}s
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{shot.description}</p>
                          <p className="mt-2 line-clamp-3 text-xs">{shot.prompt}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 px-0 text-primary"
                            onClick={() => {
                              setCreatePrefill({
                                prompt: shot.prompt,
                                ...(shot.recommended_model_id
                                  ? { modelId: shot.recommended_model_id }
                                  : {}),
                                projectId,
                              });
                              navigate({ to: "/" });
                            }}
                          >
                            Send to Create
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="Make shot 3 darker, use fewer expensive models…"
                />
                <Button
                  variant="outline"
                  disabled={busy || !revision.trim()}
                  onClick={() => void revise()}
                >
                  Revise
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
