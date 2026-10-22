/**
 * An edit's brand captions as the Editor's preview plans them: the caption
 * lines the render is sent (see buildRenderRequest), laid out, scheduled and
 * given their panel's look as the media worker does (see ./brand-captions
 * and media-worker/src/caption-script.js), so the preview moves as the
 * render does.
 *
 * Shared by the Editor and tests.
 */
import {
  emphasisRange,
  panelLook,
  planBrandCaptions,
  captionGeometry,
  segmentWords,
  type BrandCaptionPlan,
  type BrandLine,
  type LayoutFaces,
} from "./brand-captions";
import { layoutTimeline, type Timeline } from "./timeline";

/**
 * The caption lines the render takes: none after the picture ends, the last
 * cut at its end, in order, each with its words' times and its emphasis,
 * upper-cased where the captions are.
 */
export function brandCaptionLines(timeline: Timeline): BrandLine[] {
  const { captions } = timeline;
  const total = layoutTimeline(timeline).total;
  const upper = (text: string) => (captions.uppercase ? text.toUpperCase() : text);
  return captions.segments
    .filter(
      (segment) =>
        segment.text.trim() &&
        segment.start < total &&
        Math.min(segment.end, total) - segment.start >= 0.1,
    )
    .map((segment) => {
      const words = segmentWords(segment);
      return {
        start: segment.start,
        end: Math.min(segment.end, total),
        text: upper(segment.text),
        words: words.map((word) => ({ ...word, text: upper(word.text) })),
        emphasis: emphasisRange(
          words.map((word) => word.text),
          segment.emphasis,
        ),
      };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * The plan the preview draws, on the frame the render makes. `faces(em)`
 * measures the type at the em; `backdrops` is the lightness behind each line
 * (null where it isn't known), and `cuts` the times the picture's palette
 * changes at, where they are known.
 */
export function editCaptionPlan(
  timeline: Timeline,
  frame: { width: number; height: number },
  faces: (em: number) => LayoutFaces,
  { backdrops = [], cuts = [] }: { backdrops?: (number | null)[]; cuts?: number[] } = {},
): BrandCaptionPlan {
  const { captions } = timeline;
  const geometry = captionGeometry(frame, captions);
  const colours = {
    color: captions.color,
    accent: captions.accent,
    panelColor: captions.panelColor,
  };
  return planBrandCaptions(brandCaptionLines(timeline), {
    geometry,
    faces: faces(geometry.em),
    cuts,
    lookOf: (run) => {
      const measured = run
        .map((index) => backdrops[index])
        .filter((value): value is number => typeof value === "number");
      return panelLook(
        captions.panel ?? "auto",
        measured.length ? Math.max(...measured) : null,
        colours,
      );
    },
  });
}

/** A #rrggbb colour at an opacity, as CSS writes it. */
function rgba(hex: string, opacity: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

/**
 * The box behind a classic style's captions where a panel is chosen, as the
 * preview draws it: its fill and the words' colour (see the media worker's
 * classicPanel). Where it follows the picture, the preview shows the glass
 * at the opacity it has where the picture isn't measured. Null: the style's
 * own look ("none" takes a boxed style's box away).
 */
export function classicPanelLook(
  captions: Pick<Timeline["captions"], "style" | "panel" | "panelColor" | "color" | "accent">,
): { background: string | null; color: string | null } | null {
  if (!captions.panel) return null;
  if (captions.panel === "none")
    return captions.style === "boxed" ? { background: null, color: null } : null;
  const own =
    captions.style === "bold" ? (captions.accent ?? "#ffe500") : (captions.color ?? "#ffffff");
  const look = panelLook(captions.panel, null, {
    color: own,
    accent: captions.accent,
    panelColor: captions.panelColor,
  });
  return { background: rgba(look.fill!, look.fillOpacity), color: look.ink };
}
