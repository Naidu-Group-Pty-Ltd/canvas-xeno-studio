import { GATE_STATUS_LABELS, type GateStatus } from "@/lib/reviews/gates";
import { cn } from "@/lib/utils";

const TONES: Record<GateStatus, string> = {
  empty: "bg-muted text-muted-foreground border-border",
  in_review: "bg-info/15 text-info border-info/30",
  changes_requested: "bg-warning/15 text-warning border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
};

/** A gate's state, in the studio's status colours. */
export function GateStatusBadge({ status, className }: { status: GateStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {GATE_STATUS_LABELS[status]}
    </span>
  );
}
