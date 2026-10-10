import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What an area taking dropped files shows while files are dragged over it
 * (see useFileDrop). Its parent is positioned (`relative`).
 */
export function DropOverlay({
  active,
  label,
  className,
}: {
  active: boolean;
  label: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-primary bg-background/85 p-3 text-center text-sm font-medium backdrop-blur-[1px]",
        className,
      )}
      data-testid="drop-overlay"
      role="status"
    >
      <Upload className="size-5 text-primary" />
      {label}
    </div>
  );
}
