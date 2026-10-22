import { useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import type { Box } from "@/lib/media/text-boxes";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface EditableBox extends Box {
  id: string;
  /** What it covers, in a few words. */
  label?: string;
}

/** The smallest box a drag draws, as a share of the picture each way. */
const LEAST = 0.004;

/**
 * Boxes over a picture for a person to check: each shows what it covers,
 * comes away with its cross, and a new one is drawn by dragging across the
 * picture. Boxes are shares of the picture, so they hold at any size (see
 * lib/media/text-boxes).
 */
export function BoxEditor({
  url,
  aspect,
  boxes,
  onChange,
  disabled = false,
  tone = "private",
}: {
  url: string | null;
  /** The picture's width over its height. */
  aspect: number;
  boxes: EditableBox[];
  onChange: (boxes: EditableBox[]) => void;
  disabled?: boolean;
  /** Private details are hidden by their boxes; lettering is outlined. */
  tone?: "private" | "lettering";
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ from: [number, number]; to: [number, number] } | null>(null);

  const at = (event: PointerEvent): [number, number] => {
    const rect = frame.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    ];
  };
  const drawn = draft
    ? {
        x: Math.min(draft.from[0], draft.to[0]),
        y: Math.min(draft.from[1], draft.to[1]),
        w: Math.abs(draft.to[0] - draft.from[0]),
        h: Math.abs(draft.to[1] - draft.from[1]),
      }
    : null;
  const place = (box: Box) => ({
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  });

  return (
    <div
      ref={frame}
      className={cn(
        "relative w-full touch-none select-none overflow-hidden rounded-md border border-border bg-background",
        !disabled && "cursor-crosshair",
      )}
      style={{ aspectRatio: String(aspect || 1) }}
      onPointerDown={(event) => {
        if (disabled || (event.target as HTMLElement).closest("button")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = at(event);
        setDraft({ from: point, to: point });
      }}
      onPointerMove={(event) => {
        if (draft) setDraft({ ...draft, to: at(event) });
      }}
      onPointerUp={() => {
        if (drawn && drawn.w >= LEAST && drawn.h >= LEAST)
          onChange([
            ...boxes,
            { ...drawn, id: `p${Date.now().toString(36)}`, label: "Marked by hand" },
          ]);
        setDraft(null);
      }}
      data-testid="box-editor"
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-fill"
        />
      ) : (
        <Skeleton className="absolute inset-0" />
      )}
      {boxes.map((box) => (
        <div
          key={box.id}
          className={cn(
            "group absolute border-2",
            tone === "private"
              ? "border-destructive bg-destructive/40 backdrop-blur-sm"
              : "border-primary bg-primary/15",
          )}
          style={place(box)}
          title={box.label}
        >
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove the box${box.label ? ` over ${box.label}` : ""}`}
              className="absolute -top-2.5 -right-2.5 hidden size-5 items-center justify-center rounded-full bg-background text-foreground shadow group-hover:flex"
              onClick={() => onChange(boxes.filter((other) => other.id !== box.id))}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      {drawn && (
        <div className="absolute border-2 border-dashed border-primary" style={place(drawn)} />
      )}
    </div>
  );
}
