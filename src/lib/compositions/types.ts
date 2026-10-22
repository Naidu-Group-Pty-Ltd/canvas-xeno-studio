/**
 * What a composition template is: a page (markup and stylesheet, in the
 * brand's own colours and type) and a pure function of time saying what every
 * element looks like at time t (see ./state), with the settings a person can
 * change. Templates are the graphics kit Reel 1 was built from (the window,
 * the pointer and its press, the rail, the record card, the document, the
 * pages running past, the call to action) and product pages drawn from a
 * brand's demo record, so a person can assemble a product reel without
 * writing code.
 */
import type { z } from "zod";
import type { CompositionBrand } from "./brand";
import type { CompositionState, Motion } from "./state";

/** How a setting is shown in the Editor's form. */
export type TemplateField =
  | { key: string; label: string; kind: "text"; help?: string; max?: number }
  | { key: string; label: string; kind: "longtext"; help?: string; max?: number }
  | { key: string; label: string; kind: "image"; help?: string; optional?: boolean }
  | { key: string; label: string; kind: "images"; help?: string; max: number }
  | {
      key: string;
      label: string;
      kind: "number";
      help?: string;
      min: number;
      max: number;
      step?: number;
    }
  | { key: string; label: string; kind: "choice"; help?: string; options: readonly string[] }
  | { key: string; label: string; kind: "toggle"; help?: string }
  | { key: string; label: string; kind: "lines"; help?: string; max: number }
  | { key: string; label: string; kind: "point"; help?: string };

export interface TemplateInput<P> {
  params: P;
  brand: CompositionBrand;
  /** The brand's curves, ready to call. */
  motion: Motion;
  /** The frame in CSS pixels (the edit's own size). */
  width: number;
  height: number;
  /** One unit: 1 at 1080 on the frame's short side. */
  u: number;
  duration: number;
  fps: number;
  /** Where a library image is read from in this page (a signed link in the preview, the render's own copy there). */
  image: (assetId: string) => string;
  /** A library image's size in pixels, when the library knows it (to frame it at its own shape). */
  imageSize: (assetId: string) => { width: number; height: number } | null;
  /** Text with the demo record's {{entity.field}} filled in. */
  fill: (text: string) => string;
}

export interface BuiltScene {
  /** Markup inside the frame (a box the frame's size, its ground drawn by the scene). */
  html: string;
  /** The scene's stylesheet. */
  css: string;
  /** Everything it animates, at time t. */
  state: (t: number) => CompositionState;
  /** The moments things happen, labelled, for review sheets and the timeline. */
  beats: { at: number; label: string }[];
  /** Draws with WebGL: it then wants a media service with a GPU (see A5 in docs/compositions.md). */
  webgl?: boolean;
}

export type TemplateGroup = "kit" | "product" | "brand";

export const TEMPLATE_GROUP_LABELS: Record<TemplateGroup, string> = {
  kit: "Graphics kit",
  product: "Product pages",
  brand: "Brand cards",
};

export interface CompositionTemplate<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  /** Raised whenever what the template draws changes, so earlier renders aren't reused for it. */
  version: number;
  title: string;
  description: string;
  group: TemplateGroup;
  /** Its settings, each with a default, so `{}` is always a valid start. */
  schema: S;
  fields: readonly TemplateField[];
  duration: { default: number; min: number; max: number };
  build: (input: TemplateInput<z.output<S>>) => BuiltScene;
}

/**
 * A template as the registry holds it: its settings' type is checked where it
 * is written, and its schema checks them again before `build` is called.
 */
export type AnyCompositionTemplate = Omit<CompositionTemplate, "build"> & {
  build: (input: TemplateInput<Record<string, unknown>>) => BuiltScene;
};

export function defineTemplate<S extends z.ZodTypeAny>(
  template: CompositionTemplate<S>,
): AnyCompositionTemplate {
  return template as unknown as AnyCompositionTemplate;
}
