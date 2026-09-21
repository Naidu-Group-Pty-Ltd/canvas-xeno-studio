import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/model-schema";

const TONES: Record<string, string> = {
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-primary/15 text-primary border-primary/30",
  nsfw: "bg-warning/15 text-warning border-warning/30",
  canceled: "bg-muted text-muted-foreground border-border",
  submission_uncertain: "bg-warning/15 text-warning border-warning/30",
  in_progress: "bg-info/15 text-info border-info/30",
  queued: "bg-info/10 text-info border-info/25",
  submitting: "bg-info/10 text-info border-info/25",
  local_queued: "bg-muted text-muted-foreground border-border",
  estimating: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  ready: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const pulsing = ["in_progress", "submitting", "queued"].includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", pulsing && "animate-pulse")} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
