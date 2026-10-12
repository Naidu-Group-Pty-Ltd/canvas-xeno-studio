import { useEffect, useRef } from "react";
import { drawFrame, type FrameLayout, type Picture } from "@/lib/media/compose";
import { cn } from "@/lib/utils";

/**
 * A small live preview of a picture laid out in a frame (an end card, a
 * reframed image), drawn exactly as the file will be, just smaller.
 */
export function FramePreview({
  picture,
  layout,
  className,
  label,
}: {
  picture: Picture | null;
  layout: FrameLayout;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height, fit, background, scale } = layout;
  const focusX = layout.focus?.x;
  const focusY = layout.focus?.y;
  useEffect(() => {
    const element = ref.current;
    const context = element?.getContext("2d");
    if (!element || !context || !picture) return;
    element.width = Math.max(1, Math.round(width));
    element.height = Math.max(1, Math.round(height));
    drawFrame(context, picture, {
      width: element.width,
      height: element.height,
      fit,
      ...(background !== undefined ? { background } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(focusX !== undefined && focusY !== undefined ? { focus: { x: focusX, y: focusY } } : {}),
    });
  }, [picture, width, height, fit, background, scale, focusX, focusY]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={cn("rounded-md border border-border bg-surface", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}
