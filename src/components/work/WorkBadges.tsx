import { Bot, Cpu, User, Workflow } from "lucide-react";
import { agoLabel, WORK_STATUS_LABELS, type Hold, type WorkStatus } from "@/lib/work/model";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<WorkStatus, string> = {
  active: "bg-info/15 text-info border-info/30",
  blocked: "bg-warning/15 text-warning border-warning/30",
  paused: "bg-muted text-muted-foreground border-border",
  done: "bg-success/15 text-success border-success/30",
  abandoned: "bg-muted text-muted-foreground border-border",
};

/** A work's status, in the studio's status colours. */
export function WorkStatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONES[status] ?? STATUS_TONES.paused,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {WORK_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const HOLDER_ICONS = {
  claude_code: Bot,
  supercomputer: Cpu,
  person: User,
  script: Workflow,
} as const;

/** Who is working on a work now: live (pulsing), stopped (its hold lapsed), or nobody. */
export function HoldBadge({ hold, className }: { hold: Hold; className?: string }) {
  if (hold.state === "free")
    return <span className={cn("text-xs text-muted-foreground", className)}>Free to pick up</span>;
  const Icon = HOLDER_ICONS[hold.kind ?? "script"] ?? Workflow;
  const live = hold.state === "held";
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
        live
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
      title={
        live
          ? `Working on it now: heard from ${agoLabel(hold.heardMinutesAgo)}`
          : `Stopped renewing its hold: last heard from ${agoLabel(hold.heardMinutesAgo)}`
      }
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{hold.label ?? hold.holder}</span>
      <span className="shrink-0 opacity-75">
        · {live ? agoLabel(hold.heardMinutesAgo) : "stopped"}
      </span>
      {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />}
    </span>
  );
}
