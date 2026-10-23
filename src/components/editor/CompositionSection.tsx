import { Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import type { ClipDrawing } from "@/hooks/useCompositions";
import { Button } from "@/components/ui/button";
import type { RenderQuality } from "@/lib/compositions/settings";
import type { CompositionClip } from "@/lib/compositions/spec";
import { templateById } from "@/lib/compositions/templates";
import type { TimelineClip } from "@/lib/edit/timeline";

/** What the Inspector can do with the edit's motion graphics (see EditorWorkspace). */
export interface CompositionControls {
  /** Each composition clip's state: whether its drawing still matches it. */
  states: Map<string, ClipDrawing>;
  /** Clips a new drawing is being made for. */
  drawing: Set<string>;
  /** Opens the clip's composition to change it. */
  onChange: (clipId: string) => void;
  /** Draws the clip as it is now, at a quality. */
  onDraw: (clipId: string, quality: RenderQuality) => void;
}

/** A composition clip in the Inspector: what it is, whether its drawing is current, and drawing it again. */
export function CompositionSection({
  clip,
  composition,
  controls,
}: {
  clip: TimelineClip;
  composition: CompositionClip;
  controls: CompositionControls;
}) {
  const template = templateById(composition.spec.template);
  const state = controls.states.get(clip.id);
  const drawing = controls.drawing.has(clip.id);
  const stale = state?.stale ?? null;
  const status = drawing
    ? "Being drawn: the clip takes the new drawing when it's done."
    : stale === null
      ? "Checking its drawing…"
      : stale
        ? (state?.error ??
          "Changed since it was drawn (its settings, its brand kit, the demo record or the edit's frame): the preview plays it live. Draw it again to update its file.")
        : composition.quality === "draft"
          ? "A draft drawing to edit with. The edit's render draws it final."
          : "Drawn final: the edit's render uses this drawing.";
  return (
    <section
      className="space-y-3 border-b border-border p-3 last:border-b-0"
      data-testid="composition-section"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="label-eyebrow">Motion graphic</h3>
        <span className="rounded border border-border px-1.5 py-px text-[10px] uppercase text-muted-foreground">
          {composition.quality}
        </span>
      </div>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-3.5 text-primary" />
        {template?.title ?? composition.spec.template}
        <span className="font-normal text-muted-foreground">
          · {composition.spec.duration.toFixed(1)}s
        </span>
      </p>
      <p
        className={stale && !drawing ? "text-xs text-warning" : "text-xs text-muted-foreground"}
        aria-live="polite"
      >
        {drawing && <Loader2 className="mr-1 inline size-3 animate-spin" />}
        {status}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => controls.onChange(clip.id)}
        >
          <Wand2 className="mr-1 size-3.5" /> Change…
        </Button>
        {stale ? (
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={drawing || Boolean(state?.error)}
            onClick={() => controls.onDraw(clip.id, composition.quality)}
          >
            <RefreshCw className="mr-1 size-3.5" /> Draw again
          </Button>
        ) : (
          composition.quality === "draft" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={drawing || stale === null}
              onClick={() => controls.onDraw(clip.id, "final")}
              title="Draw it as the render will now, so the render needn't wait for it"
            >
              Draw final now
            </Button>
          )
        )}
      </div>
    </section>
  );
}
