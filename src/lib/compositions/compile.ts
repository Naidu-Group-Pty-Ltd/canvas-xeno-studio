/**
 * A composition turned into what the media service draws: its page (one HTML
 * document in the brand's colours and type) and its track (every drawing's
 * changes, in order). The template's state function runs here, once per
 * drawing, so the media service only ever applies style changes to a page it
 * holds: it never runs code from an edit. The Editor's preview builds the same
 * scene and calls its state function directly at the playhead.
 *
 * Pure: shared by the browser, the server and tests.
 */
import type { BrandFont } from "../edit/brand";
import { fontFilesFor, type CompositionBrand } from "./brand";
import { fillDemo } from "./demo";
import { kitCss } from "./kit";
import { drawingTimes, frameCount, type RenderSettings } from "./settings";
import { motionOf, type ElementProps } from "./state";
import type { CompositionSpec } from "./spec";
import { templateById } from "./templates";
import type { BuiltScene } from "./types";

export { COMPOSITION_MAX_SECONDS, compositionSpecSchema, specKey } from "./spec";
export type { CompositionSpec } from "./spec";

/** Where the page the media service holds reads its files from (it answers these itself). */
export const COMPOSITION_HOST = "https://composition.local";

export interface SceneInput {
  spec: CompositionSpec;
  brand: CompositionBrand;
  width: number;
  height: number;
  fps: number;
  /** What the library knows of an image (its size), by asset id. */
  imageInfo?: (assetId: string) => { width: number; height: number } | null;
  /** Where the page reads image `assetId`, the `index`-th the scene uses. */
  imageUrl: (assetId: string, index: number) => string;
  /** Where the page reads a font file, the `index`-th it loads. */
  fontUrl: (font: BrandFont, index: number) => string;
}

export interface Scene {
  scene: BuiltScene;
  /** The images the scene shows, in the order it first asked for them. */
  imageIds: string[];
  fonts: BrandFont[];
  /** The demo record's fields the scene's text names but the record lacks. */
  missing: string[];
  /** The whole page, ready to load. */
  document: string;
  /** The template's settings with their defaults filled in. */
  params: Record<string, unknown>;
}

/** Builds a composition's scene and its page (throws for an unknown template or settings it can't take). */
export function buildScene(input: SceneInput): Scene {
  const template = templateById(input.spec.template);
  if (!template)
    throw new Error(`There is no composition template called "${input.spec.template}"`);
  const parsed = template.schema.safeParse(input.spec.params ?? {});
  if (!parsed.success)
    throw new Error(
      `The ${template.title} settings aren't valid: ${parsed.error.issues
        .slice(0, 2)
        .map((issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`)
        .join("; ")}`,
    );
  const imageIds: string[] = [];
  const missing = new Set<string>();
  const u = Math.min(input.width, input.height) / 1080;
  const scene = template.build({
    params: parsed.data,
    brand: input.brand,
    motion: motionOf(input.brand.motion),
    width: input.width,
    height: input.height,
    u,
    duration: input.spec.duration,
    fps: input.fps,
    image: (assetId) => {
      let index = imageIds.indexOf(assetId);
      if (index === -1) {
        imageIds.push(assetId);
        index = imageIds.length - 1;
      }
      return input.imageUrl(assetId, index);
    },
    imageSize: (assetId) => input.imageInfo?.(assetId) ?? null,
    fill: (text) => {
      const filled = fillDemo(text, input.brand.demo);
      for (const path of filled.missing) missing.add(path);
      return filled.text;
    },
  });
  const fonts = fontFilesFor(input.brand);
  return {
    scene,
    imageIds,
    fonts,
    missing: [...missing],
    document: pageDocument(scene, input.brand, fonts, input.width, input.height, u, input.fontUrl),
    params: parsed.data as Record<string, unknown>,
  };
}

/** The page: the kit's stylesheet, the brand's font files, the scene's own stylesheet and markup. */
function pageDocument(
  scene: BuiltScene,
  brand: CompositionBrand,
  fonts: BrandFont[],
  width: number,
  height: number,
  u: number,
  fontUrl: (font: BrandFont, index: number) => string,
): string {
  const faces = fonts
    .map(
      (font, index) =>
        `@font-face { font-family:"${font.family.replace(/["\\]/g, "")}"; src:url("${fontUrl(font, index)}"); font-display:block; }`,
    )
    .join("\n");
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=${width}, height=${height}">`,
    `<style>${faces}\n${kitCss(brand, width, height, u)}\n${scene.css}</style>`,
    "</head><body>",
    `<div class="cx-frame" id="cx-frame">${scene.html}</div>`,
    "</body></html>",
  ].join("");
}

/* ------------------------------------------------------------------ */
/* The track                                                           */
/* ------------------------------------------------------------------ */

/** One drawing's changes: [selector's index in the table, element index (-1: the first match), properties]. */
export type TrackUpdate = [number, number, ElementProps];

/** What the media service draws: the page, and every drawing's changes in order. */
export interface CompositionBundle {
  format: "xeno-composition";
  version: 1;
  width: number;
  height: number;
  fps: number;
  frames: number;
  settings: RenderSettings;
  html: string;
  /** Library images, in the order of the render's sources (the page reads image i at /image/i). */
  images: string[];
  /** Font files' families, in source order after the images (the page reads font i at /font/i). */
  fonts: string[];
  webgl: boolean;
  selectors: string[];
  /** Every drawing, frame by frame: its changes, or 0 when nothing changed (it reuses the one before). */
  drawings: (0 | TrackUpdate[])[];
  beats: { at: number; label: string }[];
}

export interface CompiledComposition {
  bundle: CompositionBundle;
  /** The library images and font files the render must be given, in its source order. */
  imageIds: string[];
  fonts: BrandFont[];
  missing: string[];
  /** Drawings that change something (the rest reuse the one before): what the render really costs. */
  changing: number;
}

/** A composition compiled for the media service at `settings`. */
export function compileComposition(
  input: Omit<SceneInput, "imageUrl" | "fontUrl"> & { settings: RenderSettings },
): CompiledComposition {
  const built = buildScene({
    ...input,
    imageUrl: (_assetId, index) => `${COMPOSITION_HOST}/image/${index}`,
    fontUrl: (_font, index) => `${COMPOSITION_HOST}/font/${index}`,
  });
  const frames = frameCount(input.spec.duration, input.fps);
  const selectors: string[] = [];
  const selectorIndex = new Map<string, number>();
  const last = new Map<string, ElementProps>();
  const drawings: (0 | TrackUpdate[])[] = [];
  let changing = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const time of drawingTimes(frame, input.settings, input.fps)) {
      const updates = built.scene.state(Math.max(0, time)).diff(last);
      // Without reuse every drawing is taken afresh, even when nothing changed.
      if (!updates.length && input.settings.reuse && drawings.length) {
        drawings.push(0);
        continue;
      }
      changing += 1;
      drawings.push(
        updates.map(([selector, index, props]) => {
          let at = selectorIndex.get(selector);
          if (at === undefined) {
            at = selectors.length;
            selectors.push(selector);
            selectorIndex.set(selector, at);
          }
          return [at, index ?? -1, props];
        }),
      );
    }
  }
  return {
    bundle: {
      format: "xeno-composition",
      version: 1,
      width: input.width,
      height: input.height,
      fps: input.fps,
      frames,
      settings: input.settings,
      html: built.document,
      images: built.imageIds,
      fonts: built.fonts.map((font) => font.family),
      webgl: built.scene.webgl === true,
      selectors,
      drawings,
      beats: built.scene.beats,
    },
    imageIds: built.imageIds,
    fonts: built.fonts,
    missing: built.missing,
    changing,
  };
}

/* ------------------------------------------------------------------ */
/* Stretches                                                           */
/* ------------------------------------------------------------------ */

/** About how many frames a stretch is: eight seconds at 30 fps. */
export const STRETCH_FRAMES = 240;

/**
 * A long composition's stretches: runs of whole frames, about STRETCH_FRAMES
 * each, the last taking any short remainder, so the media service can draw
 * them side by side and join them frame for frame. One stretch for a short one.
 */
export function planStretches(
  frames: number,
  size = STRETCH_FRAMES,
): { from: number; to: number }[] {
  const count = Math.max(1, Math.round(frames / size));
  const stretches: { from: number; to: number }[] = [];
  for (let k = 0; k < count; k += 1)
    stretches.push({
      from: Math.round((frames * k) / count),
      to: Math.round((frames * (k + 1)) / count),
    });
  return stretches;
}

/**
 * Everything the page has been set to by the start of frame `from`: each
 * element's properties, as one canonical record (sorted), so two bundles whose
 * stretch starts the same way say so in the same words.
 */
export function stateAtFrame(bundle: CompositionBundle, from: number): string {
  const merged = new Map<string, ElementProps>();
  const end = from * bundle.settings.drawings;
  for (let index = 0; index < end; index += 1) {
    const drawing = bundle.drawings[index];
    if (!drawing) continue;
    for (const [selector, element, props] of drawing) {
      const key = `${bundle.selectors[selector]}\u0000${element}`;
      merged.set(key, { ...(merged.get(key) ?? {}), ...props });
    }
  }
  return JSON.stringify(
    [...merged.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, props]) => [
        key,
        Object.fromEntries(Object.entries(props).sort(([a], [b]) => (a < b ? -1 : 1))),
      ]),
  );
}

/**
 * What decides a stretch's frames, as text to hash: the page, its files, its
 * size, rate and drawing settings, the state it starts from and its own
 * drawings (with their selectors spelled out). A change elsewhere in the
 * composition leaves the stretch's text, and so its drawing, as it was.
 */
export function stretchIdentity(
  bundle: CompositionBundle,
  from: number,
  to: number,
  files: string[],
): string {
  const per = bundle.settings.drawings;
  const own = bundle.drawings
    .slice(from * per, to * per)
    .map((drawing) =>
      drawing === 0
        ? 0
        : drawing.map(([selector, element, props]) => [bundle.selectors[selector], element, props]),
    );
  return JSON.stringify({
    format: bundle.format,
    version: bundle.version,
    html: bundle.html,
    files,
    width: bundle.width,
    height: bundle.height,
    fps: bundle.fps,
    settings: bundle.settings,
    webgl: bundle.webgl,
    from,
    to,
    start: stateAtFrame(bundle, from),
    own,
  });
}
