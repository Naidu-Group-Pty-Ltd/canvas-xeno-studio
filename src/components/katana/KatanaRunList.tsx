import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/studio/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useKatanaRuns } from "@/hooks/useKatana";
import { KATANA_MODE_LABELS, formatUsd } from "@/lib/katana/model";
import { formatCredits } from "@/lib/katana/guard";
import { KatanaStatusBadge } from "./KatanaStatusBadge";

/** The team's recent Katana runs, newest first. */
export function KatanaRunList() {
  const { data: runs = [], isLoading, error } = useKatanaRuns();
  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Runs couldn't be loaded."}
      </p>
    );
  }
  if (!runs.length) {
    return (
      <EmptyState
        icon={Clapperboard}
        title="No Katana runs yet"
        description="Start one above. Each run shows its progress, what it spent and the finished video."
      />
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {runs.map((run) => (
        <Link
          key={run.id}
          to="/katana/$runId"
          params={{ runId: run.id }}
          className="panel block space-y-2 p-4 transition-colors hover:border-input"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium">{run.title || "Katana run"}</span>
            <KatanaStatusBadge status={run.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {run.mode === "preset"
              ? `Preset · ${run.preset_name ?? run.preset_slug}`
              : KATANA_MODE_LABELS[run.mode as "remix" | "edit"]}
            {" · "}
            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCredits(Number(run.credits_reserved))} of{" "}
            {formatCredits(Number(run.credit_limit))} credits · {formatUsd(run.claude_cost_cents)}{" "}
            of {formatUsd(run.claude_budget_cents)} Claude
          </p>
          {(run.status_detail || run.error) && (
            <p className="line-clamp-2 text-xs text-warning">{run.error ?? run.status_detail}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
