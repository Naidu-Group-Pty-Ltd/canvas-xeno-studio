import { useEffect, useRef } from "react";
import { drawBrandCard, type BrandCardStyle } from "@/lib/media/brand-card";
import type { Picture } from "@/lib/media/compose";
import { cn } from "@/lib/utils";

/**
 * A small live preview of a long video's end card, drawn by the same code
 * that makes the card, just smaller.
 */
export function EndCardPreview({
  picture,
  scene = null,
  style,
  width,
  height,
  className,
  label,
}: {
  picture: Picture | null;
  scene?: Picture | null;
  style: BrandCardStyle;
  width: number;
  height: number;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { background, scale } = style;
  useEffect(() => {
    const element = ref.current;
    const context = element?.getContext("2d");
    if (!element || !context || !picture) return;
    element.width = Math.max(1, Math.round(width));
    element.height = Math.max(1, Math.round(height));
    drawBrandCard(context, {
      picture,
      scene,
      style: { background, scale },
      width: element.width,
      height: element.height,
    });
  }, [picture, scene, background, scale, width, height]);
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
