import { cn } from "@/lib/utils";
import {
  KATANA_ACTIVE_STATUSES,
  KATANA_STATUS_LABELS,
  KATANA_STATUS_TONES,
  katanaStatus,
} from "@/lib/katana/model";

export function KatanaStatusBadge({ status, className }: { status: string; className?: string }) {
  const known = katanaStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        KATANA_STATUS_TONES[known],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          KATANA_ACTIVE_STATUSES.has(known) && "animate-pulse",
        )}
      />
      {KATANA_STATUS_LABELS[known]}
    </span>
  );
}
