import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captionFrame, type LayoutFaces } from "@/lib/edit/brand-captions";
import { editCaptionPlan } from "@/lib/edit/brand-caption-plan";
import { fontFamily, fontMetrics, type FontMetrics } from "@/lib/edit/font-family";
import type { Timeline } from "@/lib/edit/timeline";

/**
 * Brand captions in the Editor's preview: the same plan and the same state
 * at each moment as the render (see lib/edit/brand-captions), drawn on the
 * frame's own pixels in SVG, each word on its baseline where the render sets
 * it. The words are laid out from the brand's own font files, as the render
 * lays them out; until they have loaded (or where the captions are set in
 * Inter), from the browser's measure of the type.
 */

interface Face {
  family: string;
  metrics: FontMetrics;
}

/** Font files read for their metrics, each once. */
const faces = new Map<string, Promise<Face | null>>();

function readFace(font: { bucket: string; path: string; family: string }): Promise<Face | null> {
  const key = `${font.bucket}/${font.path}`;
  let work = faces.get(key);
  if (!work) {
    work = (async () => {
      const { data } = await supabase.storage.from(font.bucket).download(font.path);
      if (!data) return null;
      const bytes = new Uint8Array(await data.arrayBuffer());
      const metrics = fontMetrics(bytes);
      return metrics ? { family: fontFamily(bytes) ?? font.family, metrics } : null;
    })().catch(() => null);
    faces.set(key, work);
    void work.then((face) => face ?? faces.delete(key));
  }
  return work;
}

/** The caption family's regular and italic, read from the edit's font files (null until read, or for Inter). */
function useCaptionFaces(timeline: Timeline): { regular: Face; italic: Face | null } | null {
  const family = timeline.captions.font;
  const files = timeline.fonts.filter((font) => font.family === family);
  const regular = files.find((font) => (font.style ?? "regular") === "regular") ?? files[0];
  const italic =
    files.find((font) => font !== regular && font.style === "italic") ??
    files.find((font) => font !== regular && font.style === "bold_italic");
  const key = [regular, italic]
    .map((font) => (font ? `${font.bucket}/${font.path}` : ""))
    .join("|");
  const [loaded, setLoaded] = useState<{ key: string; regular: Face; italic: Face | null } | null>(
    null,
  );
  useEffect(() => {
    if (!regular) return;
    let live = true;
    void Promise.all([readFace(regular), italic ? readFace(italic) : null]).then(([own, slant]) => {
      if (live && own) setLoaded({ key, regular: own, italic: slant });
    });
    return () => {
      live = false;
    };
    // The files are named by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return loaded && loaded.key === key ? loaded : null;
}

/** Inter's ascent and descent (its win metrics), in ems, for text measured by the browser. */
const INTER = { ascent: 1984 / 2048, descent: 494 / 2048 };

let canvas: HTMLCanvasElement | null = null;

/** Faces measured by the browser, unkerned as the render sets type, where no font file has been read. */
function browserFaces(family: string, em: number): LayoutFaces {
  canvas ??= typeof document !== "undefined" ? document.createElement("canvas") : null;
  const context = canvas?.getContext("2d") ?? null;
  const widths = new Map<string, number>();
  return {
    ...INTER,
    measure(text, italic) {
      const key = `${italic ? "i" : "r"}${text}`;
      let width = widths.get(key);
      if (width === undefined) {
        if (context) {
          context.font = `${italic ? "italic " : ""}400 ${em}px "${family}", Inter, ui-sans-serif, sans-serif`;
          if ("fontKerning" in context) context.fontKerning = "none";
          width = context.measureText(text).width;
        } else width = text.length * em * 0.56;
        widths.set(key, width);
      }
      return width;
    },
  };
}

/** The faces a plan is laid out in: the brand's own files where read, else the browser's measure. */
function layoutFaces(
  loaded: { regular: Face; italic: Face | null } | null,
  family: string,
  em: number,
): LayoutFaces {
  if (!loaded) return browserFaces(family, em);
  const faceOf = (italic: boolean) => (italic && loaded.italic ? loaded.italic : loaded.regular);
  const { metrics } = loaded.regular;
  return {
    ascent: metrics.ascent / metrics.unitsPerEm,
    descent: metrics.descent / metrics.unitsPerEm,
    measure(text, italic) {
      const face = faceOf(italic).metrics;
      let units = 0;
      for (const char of text) units += face.advance(char.codePointAt(0)!);
      return (units * em) / face.unitsPerEm;
    },
  };
}

/** A rectangle's border `size` thick, inside its edge (the inner path wound the other way). */
function framePath(width: number, height: number, size: number): string {
  const s = Math.min(size, width / 2, height / 2);
  return `M0 0H${width}V${height}H0Z M${s} ${s}V${height - s}H${width - s}V${s}Z`;
}

export function BrandCaptionLayer({
  timeline,
  time,
  frameWidth,
  frameHeight,
}: {
  timeline: Timeline;
  time: number;
  frameWidth: number;
  frameHeight: number;
}) {
  const id = useId().replace(/:/g, "");
  const loaded = useCaptionFaces(timeline);
  const family = loaded?.regular.family ?? timeline.captions.font ?? "Inter";
  const italicFamily = loaded?.italic?.family ?? family;
  const { captions } = timeline;
  const plan = useMemo(
    () =>
      editCaptionPlan(timeline, { width: frameWidth, height: frameHeight }, (em) =>
        layoutFaces(loaded, family, em),
      ),
    // The plan follows the captions, the picture's length, the frame and the faces read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [captions, timeline.clips, timeline.fps, frameWidth, frameHeight, loaded, family],
  );
  const state = captionFrame(plan, time);
  const { em } = plan.geometry;
  if (!state.panel && !state.words.length) return null;
  const words = new Map(state.words.map((word) => [`${word.cue}:${word.index}`, word]));
  const font = (italic: boolean) => ({
    fontFamily: `"${italic ? italicFamily : family}", Inter, ui-sans-serif, sans-serif`,
    fontStyle: italic ? "italic" : "normal",
    fontWeight: 400,
    fontKerning: "none" as const,
  });
  const panel = state.panel;
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      aria-hidden
      data-testid="brand-captions"
    >
      <defs>
        {state.words.map((word) =>
          word.blur > 0.0005 ? (
            <filter
              key={`${word.cue}:${word.index}`}
              id={`${id}-b-${word.cue}-${word.index}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation={word.blur * em} />
            </filter>
          ) : null,
        )}
        {state.lights.map((light) => (
          <clipPath
            key={`${light.cue}:${light.index}:${light.slice}`}
            id={`${id}-l-${light.cue}-${light.index}-${light.slice}`}
          >
            <rect x={light.x0} y={0} width={light.x1 - light.x0} height={frameHeight} />
          </clipPath>
        ))}
      </defs>
      {panel && panel.look.fill && (
        <g
          transform={`translate(${panel.x - panel.width / 2} ${panel.y - panel.height / 2})`}
          opacity={panel.opacity}
        >
          <rect
            width={panel.width}
            height={panel.height}
            fill={panel.look.fill}
            fillOpacity={panel.look.fillOpacity}
          />
          {panel.look.stroke && (
            <path
              d={framePath(panel.width, panel.height, Math.max(1, em / 30))}
              fill={panel.look.stroke}
              fillOpacity={panel.look.strokeOpacity}
              fillRule="evenodd"
            />
          )}
        </g>
      )}
      {state.hairlines.map((line) => (
        <rect
          key={line.cue}
          x={line.x}
          y={line.y}
          width={line.width}
          height={line.height}
          fill={line.colour}
          opacity={line.opacity}
        />
      ))}
      {state.words.map((word) => (
        <text
          key={`${word.cue}:${word.index}`}
          x={word.x}
          y={word.baseline + word.rise * em}
          fontSize={em}
          fill={word.colour}
          opacity={word.opacity}
          filter={word.blur > 0.0005 ? `url(#${id}-b-${word.cue}-${word.index})` : undefined}
          style={{ ...font(word.italic), whiteSpace: "pre" }}
        >
          {word.text}
        </text>
      ))}
      {state.lights.map((light) => {
        const word = words.get(`${light.cue}:${light.index}`);
        if (!word) return null;
        return (
          <text
            key={`${light.cue}:${light.index}:${light.slice}`}
            x={word.x}
            y={word.baseline + word.rise * em}
            fontSize={em}
            fill={light.colour}
            opacity={light.opacity}
            clipPath={`url(#${id}-l-${light.cue}-${light.index}-${light.slice})`}
            filter={word.blur > 0.0005 ? `url(#${id}-b-${word.cue}-${word.index})` : undefined}
            style={{ ...font(true), whiteSpace: "pre" }}
          >
            {word.text}
          </text>
        );
      })}
    </svg>
  );
}
