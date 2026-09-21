import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity as ActivityIcon } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { GenerationDetail } from "@/components/studio/GenerationDetail";
import { EmptyState } from "@/components/studio/EmptyState";
import { useGenerations, useProjects, useTeam } from "@/hooks/useStudioData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ generation: z.string().optional() });

export const Route = createFileRoute("/activity")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Activity · Xeno Studio" },
      { name: "description", content: "Track every queued, running and completed generation in real time." },
      { property: "og:title", content: "Activity · Xeno Studio" },
      { property: "og:description", content: "The generation operations center for the internal creative studio." },
    ],
  }),
  component: ActivityPage,
});

const FILTERS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "queued", label: "Queued", statuses: ["local_queued", "queued", "submitting"] },
  { id: "generating", label: "Generating", statuses: ["in_progress"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "failed", label: "Failed", statuses: ["failed"] },
  { id: "nsfw", label: "Moderated", statuses: ["nsfw"] },
  { id: "canceled", label: "Canceled", statuses: ["canceled"] },
  { id: "uncertain", label: "Submission uncertain", statuses: ["submission_uncertain"] },
];

function ActivityPage() {
  const search = Route.useSearch();
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const active = FILTERS.find((item) => item.id === filter)!;
  const { data: generations, isLoading } = useGenerations({
    limit: 100,
    ...(active.statuses ? { status: active.statuses } : {}),
  });
  const { data: projects = [] } = useProjects(true);
  const { data: team = [] } = useTeam();

  useEffect(() => {
    if (search.generation) setOpenId(search.generation);
  }, [search.generation]);

  return (
    <AppShell title="Activity">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === item.id
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !generations?.length && (
          <EmptyState
            icon={ActivityIcon}
            title="No generations yet"
            description="Generations you and your team start will be tracked here from submission to delivery."
            actionLabel="Open Create"
            actionTo="/"
          />
        )}

        {!isLoading && !!generations?.length && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="hidden grid-cols-[1fr_140px_120px_120px_120px_150px] gap-3 border-b border-border bg-surface px-4 py-2 text-[11px] tracking-wide text-muted-foreground uppercase lg:grid">
              <span>Prompt</span>
              <span>Model</span>
              <span>Creator</span>
              <span>Project</span>
              <span>Est. cost</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-border">
              {generations.map((generation) => (
                <button
                  key={generation.id}
                  onClick={() => setOpenId(generation.id)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-raised/40 lg:grid-cols-[1fr_140px_120px_120px_120px_150px] lg:items-center lg:gap-3"
                >
                  <span className="truncate">
                    {generation.prompt || <span className="text-muted-foreground">No prompt</span>}
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(generation.created_at).toLocaleString()} · {generation.operation}
                    </span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {generation.model_path.split("/").pop()}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {team.find((member) => member.id === generation.user_id)?.full_name ?? "—"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {projects.find((project) => project.id === generation.project_id)?.name ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {generation.estimated_cost_usd !== null
                      ? `~$${Number(generation.estimated_cost_usd).toFixed(2)}`
                      : "—"}
                  </span>
                  <StatusBadge status={generation.status} className="justify-self-start" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <GenerationDetail generationId={openId} onOpenChange={(open) => !open && setOpenId(null)} />
    </AppShell>
  );
}
