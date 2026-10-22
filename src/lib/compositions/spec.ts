/**
 * What a composition is, as an edit keeps it: its template, the template's
 * version, its settings and its length; and, on the Editor's clip, which
 * drawing of it the clip plays. Kept small (no templates, no drawing) so the
 * timeline can carry it.
 *
 * Shared by the browser, the server and tests.
 */
import { z } from "zod";
import { RENDER_QUALITIES } from "./settings";

/** The longest a composition runs: a shot, not a film (a film is a run of them). */
export const COMPOSITION_MAX_SECONDS = 60;

export const compositionSpecSchema = z.object({
  template: z.string().min(1).max(60),
  /** The template's version it was made with (see CompositionTemplate.version). */
  version: z.number().int().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  duration: z.number().finite().min(0.5).max(COMPOSITION_MAX_SECONDS),
});
export type CompositionSpec = z.infer<typeof compositionSpecSchema>;

/**
 * A clip that is a composition: what it is, the brand kit it is drawn in, and
 * the drawing its file is (so the Editor can tell when its settings have
 * changed since, and the render can take that drawing's lossless master).
 */
export const compositionClipSchema = z.object({
  spec: compositionSpecSchema,
  brandKitId: z.string().uuid().nullable().default(null),
  /** The drawing the clip's file comes from (a composition render). */
  renderId: z.string().uuid().nullable().default(null),
  quality: z.enum(RENDER_QUALITIES).default("draft"),
  /** The spec, as specKey, that drawing was made from: another means it is out of date. */
  renderedKey: z.string().max(40_000).nullable().default(null),
});
export type CompositionClip = z.infer<typeof compositionClipSchema>;

/** A spec as one stable string: two specs that draw the same are the same key. */
export function specKey(spec: CompositionSpec, brandKitId: string | null): string {
  const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
      );
    return value;
  };
  return JSON.stringify(
    sorted({
      template: spec.template,
      version: spec.version,
      params: spec.params,
      duration: spec.duration,
      brandKitId,
    }),
  );
}

/** Whether a composition clip's file shows its settings as they are now. */
export function compositionCurrent(composition: CompositionClip): boolean {
  return (
    composition.renderedKey !== null &&
    composition.renderedKey === specKey(composition.spec, composition.brandKitId)
  );
}
