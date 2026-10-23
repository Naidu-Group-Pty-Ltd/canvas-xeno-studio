import { useEffect, useRef } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useCompositionRenders } from "@/hooks/useCompositions";
import { Progress } from "@/components/ui/progress";
import type { DrawStarted } from "./CompositionDialog";

/** A drawing the edit is waiting for. */
export interface PendingDrawing extends DrawStarted {
  id: string;
  title: string;
  /** For a new clip: the clip it goes after (the one selected when it was asked for). */
  after: string | null;
}

type RenderView = DrawStarted["view"];

/**
 * Motion graphics being drawn for this edit, each with its progress. Each is
 * placed (or given to its clip) the moment it is drawn; one that fails says
 * why. Closing the Editor leaves the drawing to finish in the library.
 */
export function DrawingTray({
  pending,
  onDrawn,
  onFailed,
  onDismiss,
}: {
  pending: PendingDrawing[];
  onDrawn: (drawing: PendingDrawing, view: RenderView & { assetId: string }) => void;
  onFailed: (drawing: PendingDrawing, message: string) => void;
  onDismiss: (drawing: PendingDrawing) => void;
}) {
  const results = useCompositionRenders(pending.map((drawing) => drawing.view.renderId));
  const handled = useRef(new Set<string>());

  useEffect(() => {
    pending.forEach((drawing, index) => {
      const view = results[index]?.data as RenderView | undefined;
      if (!view || handled.current.has(drawing.id)) return;
      if (view.status === "completed" && view.assetId) {
        handled.current.add(drawing.id);
        onDrawn(drawing, { ...view, assetId: view.assetId });
      } else if (view.status === "failed") {
        handled.current.add(drawing.id);
        onFailed(drawing, view.errorMessage ?? "The media service couldn't draw it");
      }
    });
  }, [pending, results, onDrawn, onFailed]);

  if (!pending.length) return null;
  return (
    <ul className="space-y-1 border-t border-border px-3 py-2" aria-live="polite">
      {pending.map((drawing, index) => {
        const view = (results[index]?.data as RenderView | undefined) ?? drawing.view;
        const progress = Math.round((view.progress ?? 0) * 100);
        return (
          <li key={drawing.id} className="flex items-center gap-2 text-xs">
            {view.status === "queued" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Sparkles className="size-3.5 shrink-0 text-primary" />
            )}
            <span className="min-w-0 shrink truncate">
              Drawing {drawing.title}
              {drawing.quality === "final" ? " (final)" : ""}
            </span>
            <Progress value={Math.max(3, progress)} className="h-1.5 min-w-[60px] flex-1" />
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {view.status === "queued" ? (view.stage ?? "Waiting") : `${progress}%`}
            </span>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => onDismiss(drawing)}
              aria-label={`Stop waiting for ${drawing.title}`}
              title="Stop waiting (it still lands in the library)"
            >
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
