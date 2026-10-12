/**
 * Laying a picture out in a frame of another shape, without changing the
 * picture itself: filling the frame (cropping its edges, around a chosen
 * point), or showing it whole on a background. Pure maths, shared by the
 * browser (images and end cards are laid out on a canvas), the reframe dialog
 * (its previews) and the media service (videos), so all three agree.
 */

/** Frame shapes offered for reframing, by where they are used. */
export const FRAME_FORMATS = [
  { id: "9:16", width: 9, height: 16, use: "Reels, TikTok, Stories" },
  { id: "4:5", width: 4, height: 5, use: "Instagram & Facebook feed" },
  { id: "1:1", width: 1, height: 1, use: "Square feed" },
  { id: "16:9", width: 16, height: 9, use: "YouTube, web, TV" },
  { id: "3:4", width: 3, height: 4, use: "Portrait" },
  { id: "4:3", width: 4, height: 3, use: "Classic landscape" },
  { id: "2:3", width: 2, height: 3, use: "Pinterest, posters" },
  { id: "3:2", width: 3, height: 2, use: "Photo landscape" },
  { id: "21:9", width: 21, height: 9, use: "Cinema widescreen" },
] as const;
export type FrameFormatId = (typeof FRAME_FORMATS)[number]["id"];

export function frameFormat(id: string) {
  return FRAME_FORMATS.find((format) => format.id === id) ?? null;
}

export type FrameFit = "cover" | "contain" | "blur_pad";

export interface FramePoint {
  /** 0 is the left edge, 1 the right. */
  x: number;
  /** 0 is the top edge, 1 the bottom. */
  y: number;
}

export const CENTRE: FramePoint = { x: 0.5, y: 0.5 };

/** Largest and smallest frames made, on their long and short sides. */
export const FRAME_LIMITS = { maxSide: 3840, minSide: 128 } as const;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);
const even = (value: number) => Math.max(2, 2 * Math.round(value / 2));
const evenDown = (value: number) => Math.max(2, 2 * Math.floor(value / 2 + 1e-9));

/**
 * The part of a picture that fills a frame of another shape: as much of it as
 * the frame's shape allows, at the focus point (as near as the edges let it).
 */
export function coverCrop(
  source: { width: number; height: number },
  frame: { width: number; height: number },
  focus: FramePoint = CENTRE,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(frame.width / source.width, frame.height / source.height);
  const width = frame.width / scale;
  const height = frame.height / scale;
  return {
    x: (source.width - width) * clamp01(focus.x),
    y: (source.height - height) * clamp01(focus.y),
    width,
    height,
  };
}

/**
 * Where a whole picture sits in a frame of another shape: centred, as large
 * as fits within `scale` of the frame (1 is edge to edge).
 */
export function containRect(
  source: { width: number; height: number },
  frame: { width: number; height: number },
  scale = 1,
): { x: number; y: number; width: number; height: number } {
  const share = Math.min(1, Math.max(0.1, Number.isFinite(scale) ? scale : 1));
  const fit = Math.min(frame.width / source.width, frame.height / source.height) * share;
  const width = source.width * fit;
  const height = source.height * fit;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/**
 * The frame a picture is reframed into, in even pixels. With `shortSide`, the
 * frame's short side is that long; without it, the frame keeps the picture's
 * own detail: filling the frame, the largest frame the picture covers;
 * showing it whole, the smallest frame that holds it.
 */
export function reframeSize(
  source: { width: number; height: number },
  format: { width: number; height: number },
  fit: FrameFit,
  shortSide?: number | null,
): { width: number; height: number } {
  const ratio = format.width / format.height;
  let width: number;
  let height: number;
  if (shortSide) {
    width = ratio >= 1 ? shortSide * ratio : shortSide;
    height = ratio >= 1 ? shortSide : shortSide / ratio;
  } else if (fit === "cover") {
    width = Math.min(source.width, source.height * ratio);
    height = width / ratio;
  } else {
    width = Math.max(source.width, source.height * ratio);
    height = width / ratio;
  }
  // Within what the media service makes, keeping the shape.
  const down = Math.min(1, FRAME_LIMITS.maxSide / Math.max(width, height));
  const up = Math.max(1, FRAME_LIMITS.minSide / Math.min(width * down, height * down));
  // Filling the frame from the picture's own pixels never asks for more than it has.
  const round = !shortSide && fit === "cover" ? evenDown : even;
  return { width: round(width * down * up), height: round(height * down * up) };
}

/** A colour as #rrggbb, or null. */
export function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text))
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return null;
}
