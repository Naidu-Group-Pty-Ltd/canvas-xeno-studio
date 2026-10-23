import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useWorkList } from "@/hooks/useWork";
import { agoLabel, WORK_NEEDS_UPDATE } from "@/lib/work/model";
import { EmptyState } from "@/components/studio/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { HoldBadge, WorkStatusBadge } from "./WorkBadges";

const minutesSince = (iso: string | null) =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : null;

/**
 * Work in progress, latest first: each with who is working on it now, its
 * plan's progress, what was last done and what comes next. All of it, or a
 * project's.
 */
export function WorkList({
  projectId,
  includeFinished = false,
}: {
  projectId?: string | null;
  includeFinished?: boolean;
}) {
  const { data, isLoading, error } = useWorkList({ projectId: projectId ?? null, includeFinished });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        The work couldn&apos;t be read: {error instanceof Error ? error.message : "try again"}.
      </p>
    );
  if (!data?.ready)
    return (
      <div className="panel p-6 text-sm text-muted-foreground" data-testid="work-needs-update">
        {WORK_NEEDS_UPDATE}
      </div>
    );
  if (!data.works.length)
    return (
      <EmptyState
        icon={ClipboardList}
        title={projectId ? "No work in this project" : "No work in progress"}
        description="A job that runs over many sessions, in Claude Code or the Supercomputer, is kept here as it goes: its plan, its journal, its files, and who is working on it now."
      />
    );
  return (
    <ul className="space-y-3">
      {data.works.map((work) => (
        <li key={work.id}>
          <Link
            to="/work/$workId"
            params={{ workId: work.id }}
            className="panel block p-4 transition-colors hover:bg-surface-raised/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold">
                {work.title}
              </h3>
              <WorkStatusBadge status={work.status} />
              <HoldBadge hold={work.hold} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {work.projectName ? `${work.projectName} · ` : ""}
              {work.entries} journal entr{work.entries === 1 ? "y" : "ies"}
              {work.lastEntryAt
                ? ` · last written ${agoLabel(minutesSince(work.lastEntryAt))}`
                : ""}
              {work.questions ? ` · ${work.questions} waiting on a person` : ""}
            </p>
            {work.steps.total > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={(work.steps.done / work.steps.total) * 100}
                  className="h-1.5 flex-1"
                />
                <span className="text-xs text-muted-foreground">
                  {work.steps.done} of {work.steps.total} steps
                </span>
              </div>
            )}
            {work.lastSummary && <p className="mt-3 line-clamp-2 text-sm">{work.lastSummary}</p>}
            {work.nextSteps.length > 0 && (
              <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                Next: {work.nextSteps[0]}
                {work.nextSteps.length > 1 ? ` (and ${work.nextSteps.length - 1} more)` : ""}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
