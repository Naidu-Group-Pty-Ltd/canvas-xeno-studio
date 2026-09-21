import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useStudioData";
import { useCampaigns } from "@/hooks/useV2Data";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns · Xeno Studio" },
      { name: "description", content: "Campaign containers with objectives and budgets." },
      { property: "og:title", content: "Campaigns · Xeno Studio" },
      { property: "og:description", content: "Group productions under a campaign and track its budget." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: campaigns, isLoading } = useCampaigns();
  const { data: projects } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [projectId, setProjectId] = useState("");
  const [budgetMode, setBudgetMode] = useState("none");

  // Spend attributed to each campaign, from real generation costs.
  const { data: spend } = useQuery({
    queryKey: ["campaign-spend"],
    queryFn: async () => {
      const { data } = await supabase
        .from("generations")
        .select("campaign_id,estimated_cost_usd,actual_cost_usd,status")
        .not("campaign_id", "is", null);
      const totals: Record<string, { estimated: number; actual: number }> = {};
      for (const row of data ?? []) {
        if (!row.campaign_id || row.status === "failed" || row.status === "canceled") continue;
        const bucket = (totals[row.campaign_id] ??= { estimated: 0, actual: 0 });
        bucket.estimated += Number(row.estimated_cost_usd ?? 0);
        bucket.actual += Number(row.actual_cost_usd ?? 0);
      }
      return totals;
    },
  });

  async function updateBudget(id: string, patch: { budget_usd?: number | null; budget_mode?: string }) {
    const { error } = await supabase.from("campaigns").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success("Budget updated.");
  }

  async function create() {
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("campaigns").insert({
      name: name.trim(),
      objective: objective.trim() || null,
      budget_usd: budget ? Number(budget) : null,
      budget_mode: budgetMode,
      project_id: projectId || null,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setName("");
    setObjective("");
    setBudget("");
    setProjectId("");
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    toast.success("Campaign created.");
  }

  return (
    <AppShell title="Campaigns">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Campaign containers group storyboards, generations and budget.</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" /> New campaign
          </Button>
        </div>

        {isLoading && <Skeleton className="h-28 w-full" />}
        {!isLoading && !campaigns?.length && (
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Create a campaign to group related productions and their spend." />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(campaigns ?? []).map((campaign) => (
            <div key={campaign.id} className="panel space-y-1 p-4">
              <h3 className="font-display text-sm font-semibold">{campaign.name}</h3>
              <p className="text-xs text-muted-foreground">{campaign.objective ?? "No objective set"}</p>
              <p className="text-xs text-muted-foreground">
                Budget: {campaign.budget_usd != null ? `$${Number(campaign.budget_usd).toFixed(2)}` : "Not set"}
              </p>
              <p className="text-xs text-muted-foreground">
                Spent: ${(spend?.[campaign.id]?.estimated ?? 0).toFixed(2)} estimated
                {spend?.[campaign.id]?.actual ? ` · $${spend[campaign.id]!.actual.toFixed(2)} confirmed` : ""}
              </p>
              <p className="text-xs text-muted-foreground">Status: {campaign.status}</p>
              <div className="flex items-center gap-2 pt-1">
                <Label htmlFor={`mode-${campaign.id}`} className="text-xs text-muted-foreground">
                  Limit
                </Label>
                <select
                  id={`mode-${campaign.id}`}
                  className="h-8 flex-1 rounded-md border border-border bg-surface-raised px-2 text-xs"
                  value={(campaign as { budget_mode?: string }).budget_mode ?? "none"}
                  onChange={(e) => void updateBudget(campaign.id, { budget_mode: e.target.value })}
                >
                  <option value="none">Not enforced</option>
                  <option value="soft">Warn when exceeded</option>
                  <option value="hard">Block when exceeded</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="campaign-objective">Objective</Label>
              <Textarea id="campaign-objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="campaign-budget">Budget (USD)</Label>
              <Input id="campaign-budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="campaign-budget-mode">When the budget is reached</Label>
              <select
                id="campaign-budget-mode"
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface-raised px-2 text-sm"
                value={budgetMode}
                onChange={(e) => setBudgetMode(e.target.value)}
              >
                <option value="none">Do nothing</option>
                <option value="soft">Warn only</option>
                <option value="hard">Block new generations</option>
              </select>
            </div>
            <div>
              <Label htmlFor="campaign-project">Project</Label>
              <select
                id="campaign-project"
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface-raised px-2 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">No project</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button className="w-full" onClick={() => void create()} disabled={!name.trim()}>
              Create campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
