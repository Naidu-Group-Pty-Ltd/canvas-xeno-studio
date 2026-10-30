/**
 * How a composition is drawn: as a camera would, or quickly for a draft.
 *
 * Reel 1's renderer drew every frame at twice its size and averaged eight
 * drawings spread over a 180-degree shutter, so a fast move smears as a
 * camera's would rather than strobing, and a still frame (its drawings all
 * the same) stays exactly as sharp. A drawing whose state hasn't changed
 * reuses the one before, so a still costs one drawing. Each render also keeps
 * its frames losslessly beside the playable copy, for the edit's render to
 * use and for measuring the master against.
 *
 * Shared by the Editor, the server and tests.
 */
import { z } from "zod";

/** How much bigger than the frame each drawing is made, before it is scaled down. */
export const DRAW_SCALES = [1, 2] as const;
/** How many drawings a frame is the average of. */
export const DRAWINGS_PER_FRAME = [1, 2, 4, 8] as const;

export const renderSettingsSchema = z.object({
  scale: z.union([z.literal(1), z.literal(2)]).default(2),
  drawings: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).default(8),
  /** The shutter's angle in degrees: 180 is open for half of each frame, as film cameras are. */
  shutter: z.number().int().min(0).max(360).default(180),
  /** A drawing whose state is unchanged reuses the one before (same picture, much quicker). */
  reuse: z.boolean().default(true),
});
export type RenderSettings = z.infer<typeof renderSettingsSchema>;

export const RENDER_QUALITIES = ["draft", "final"] as const;
export type RenderQuality = (typeof RENDER_QUALITIES)[number];

export const QUALITY_LABELS: Record<RenderQuality, string> = {
  draft: "Draft · drawn once a frame at the frame's size",
  final: "Final · 2x, eight drawings a frame over a 180° shutter",
};

/** The settings each quality draws with. */
export const QUALITY_SETTINGS: Record<RenderQuality, RenderSettings> = {
  draft: { scale: 1, drawings: 1, shutter: 180, reuse: true },
  final: { scale: 2, drawings: 8, shutter: 180, reuse: true },
};

/**
 * A still: one drawing of one moment at twice the frame's size, kept as it
 * is (a PNG twice the frame, 3840 x 2160 from a 1920 x 1080 frame). Nothing
 * moves within it, so there is no shutter to average over.
 */
export const STILL_SETTINGS: RenderSettings = { scale: 2, drawings: 1, shutter: 0, reuse: true };

/** The moment a still is drawn at by default: just short of the end, where everything has arrived. */
export function stillMoment(duration: number, at?: number | null): number {
  const end = Math.max(0, duration - 1 / 60);
  return at === undefined || at === null ? end : Math.min(end, Math.max(0, at));
}

/**
 * The times frame `frame`'s drawings are taken at: evenly over the part of
 * the frame the shutter is open, centred on the frame. Drawing j of n is at
 * (f + ((j + 0.5) / n - 0.5) × shutter / 360) / fps, so with one drawing it
 * is the frame's own time.
 */
export function drawingTimes(frame: number, settings: RenderSettings, fps: number): number[] {
  const open = settings.shutter / 360;
  return Array.from(
    { length: settings.drawings },
    (_, j) => (frame + ((j + 0.5) / settings.drawings - 0.5) * open) / fps,
  );
}

/** Whole frames in `seconds` at `fps` (at least one). */
export function frameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

/**
 * About how long a render takes, from the drawings it needs and the time one
 * drawing has been measured to take. Drawings that reuse the one before cost
 * almost nothing, so given how many change it counts only those; without, it
 * is an upper bound.
 * The measured cost is the media service's own (kept from earlier renders);
 * without one, Reel 1's: about 0.25 s for a 2x drawing of a 1080 x 1920
 * frame on a 4-CPU machine with no GPU, a quarter of that at 1x.
 */
export function renderEstimate(input: {
  frames: number;
  settings: RenderSettings;
  /** The drawings that change something, when known (the rest reuse the one before, almost free). */
  changing?: number | null;
  /** Seconds one drawing takes at this size and scale, if measured. */
  secondsPerDrawing?: number | null;
  /** How many browsers draw side by side. */
  browsers?: number;
  width: number;
  height: number;
}): { drawings: number; seconds: number } {
  const all = input.frames * input.settings.drawings;
  const drawings =
    input.changing && input.changing > 0 ? Math.min(all, Math.round(input.changing)) : all;
  const pixels = (input.width * input.height * input.settings.scale ** 2) / (1080 * 1920 * 4);
  const perDrawing =
    input.secondsPerDrawing && input.secondsPerDrawing > 0
      ? input.secondsPerDrawing
      : 0.25 * Math.max(0.15, pixels);
  const browsers = Math.max(1, input.browsers ?? 2);
  // Setting up a browser and its page, and encoding, on top of the drawing.
  const overhead = 8 + input.frames * 0.01;
  return { drawings, seconds: Math.round(overhead + (drawings * perDrawing) / browsers) };
}
