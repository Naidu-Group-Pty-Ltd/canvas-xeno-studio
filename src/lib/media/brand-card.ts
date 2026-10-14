/**
 * Brand end cards: the logo, wordmark or designed end card a video closes on,
 * laid out at the video's own shape so it looks made for it, whatever shape
 * and background the image came with.
 *
 *   - A logo on a flat background (or a cut-out logo) is lifted off its
 *     background, edges and all, and set on a backdrop that belongs to the
 *     film: its final frame defocused, or a lit backdrop in the logo's own
 *     colours. Never a tile of the original background floating on a colour.
 *   - A designed end card (art with its own background) is shown whole and
 *     its background is carried out to the edges of the frame: mirrored,
 *     softened and darkened towards the edges, with the art's own edges
 *     feathered into it, so no seam shows however its shape differs.
 *
 * The mark is sized for the frame's orientation (a wordmark in a vertical
 * video spans more of the width than in a landscape one) and kept within the
 * frame's safe area. The image's own pixels are never redrawn: only moved,
 * scaled and set on a new ground. Browser only (canvas).
 */
import { containRect, coverCrop, hexColor } from "./frame";
import { pictureSize, type Picture } from "./compose";

export type FinisherKind = "transparent" | "solid" | "artwork";

export interface FinisherAnalysis {
  kind: FinisherKind;
  /** The flat colour around the mark (a logo on a solid background), as #rrggbb. */
  background: string | null;
  /**
   * How far the mark's own pixels stand out from that background (see
   * colourToAlpha): what counts as fully opaque when it is lifted off.
   */
  opacity: number;
  /** Where the mark sits in the image, in the image's own pixels (the whole image for artwork). */
  content: { x: number; y: number; width: number; height: number };
  /** How light the mark itself is, 0 (black) to 1 (white). */
  lightness: number;
  /** The mark's most telling colour, for the light behind it, as #rrggbb. */
  accent: string;
}

/** What surrounds the mark: chosen per image when "auto". */
export type Backdrop = "scene" | "brand" | "extend" | "flat" | "blur";

/** The end card's look as a person sets it (see EndCardStyle in ./end-card). */
export interface BrandCardStyle {
  /** "auto", "scene", "brand", "extend", "blur" or a colour (#rrggbb). */
  background: string;
  /** How large the mark is: 0.3 to 1 of the room it has; null to size it for the frame. */
  scale: number | null;
}

/** Sizes the mark is given by default: a logo fills 80% of its room, artwork 92% of the frame. */
export const DEFAULT_MARK_SCALE = 0.8;
export const DEFAULT_ARTWORK_SCALE = 0.92;

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const hex2 = (value: number) =>
  Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, "0");
export const toHex = ([r, g, b]: Rgb) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function fromHex(value: string): Rgb {
  const text = hexColor(value) ?? "#000000";
  return [
    Number.parseInt(text.slice(1, 3), 16),
    Number.parseInt(text.slice(3, 5), 16),
    Number.parseInt(text.slice(5, 7), 16),
  ];
}

/** Perceived lightness, 0 to 1. */
export function lightnessOf([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const mix = (a: Rgb, b: Rgb, share: number): Rgb => [
  a[0] + (b[0] - a[0]) * share,
  a[1] + (b[1] - a[1]) * share,
  a[2] + (b[2] - a[2]) * share,
];

/**
 * How far apart two colours look ("redmean" distance, roughly 3× CIE ΔE76):
 * cheap enough to run on every pixel.
 */
function distance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const mean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

/**
 * The least opacity a pixel of colour (r, g, b) can have over a known
 * background (br, bg, bb): how far it is from the background towards black
 * or white, channel by channel. A pixel that is the background is 0, a
 * logo's solid colour near 1, and an anti-aliased edge in between, exactly
 * as much as it was blended ("colour to alpha").
 */
function colourToAlpha(r: number, g: number, b: number, br: number, bg: number, bb: number) {
  const channel = (value: number, ground: number) =>
    value > ground
      ? (value - ground) / Math.max(1, 255 - ground)
      : value < ground
        ? (ground - value) / Math.max(1, ground)
        : 0;
  return Math.max(channel(r, br), channel(g, bg), channel(b, bb));
}

/** Below this a pixel is the background, give or take compression noise. */
const NOISE_ALPHA = 0.07;

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

function context2d(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser can't lay out images");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

/** The picture drawn at a size (never larger than it is), as pixels. */
function pixelsOf(picture: Picture, maxSide: number) {
  const size = pictureSize(picture);
  const share = Math.min(1, maxSide / Math.max(size.width, size.height));
  const board = canvas(size.width * share, size.height * share);
  const context = context2d(board);
  context.drawImage(picture, 0, 0, board.width, board.height);
  return { board, data: context.getImageData(0, 0, board.width, board.height), share };
}

/**
 * Blurs a canvas by `radius` pixels, in place (nothing moves or scales).
 * Canvas filters where the browser has them; elsewhere (older Safari) by
 * drawing it small and back up.
 */
function blurred(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = canvas(source.width, source.height);
  const context = context2d(out);
  const r = Math.round(radius);
  if (r <= 0) {
    context.drawImage(source, 0, 0);
    return out;
  }
  if (typeof context.filter === "string") {
    // Its edge pixels carried outward first, so the blur doesn't fade at the edges.
    const pad = r * 2;
    const { width: w, height: h } = source;
    const padded = canvas(w + pad * 2, h + pad * 2);
    const p = context2d(padded);
    p.drawImage(source, pad, pad);
    const strips: [number, number, number, number, number, number, number, number][] = [
      [0, 0, 1, h, 0, pad, pad, h],
      [w - 1, 0, 1, h, pad + w, pad, pad, h],
      [0, 0, w, 1, pad, 0, w, pad],
      [0, h - 1, w, 1, pad, pad + h, w, pad],
      [0, 0, 1, 1, 0, 0, pad, pad],
      [w - 1, 0, 1, 1, pad + w, 0, pad, pad],
      [0, h - 1, 1, 1, 0, pad + h, pad, pad],
      [w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad],
    ];
    for (const [sx, sy, sw, sh, dx, dy, dw, dh] of strips)
      p.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    context.filter = `blur(${r}px)`;
    context.drawImage(padded, -pad, -pad);
    context.filter = "none";
    return out;
  }
  const factor = Math.max(2, Math.round(radius / 2));
  const small = canvas(source.width / factor, source.height / factor);
  const smallContext = context2d(small);
  smallContext.drawImage(source, 0, 0, small.width, small.height);
  const smaller = canvas(small.width / 2, small.height / 2);
  context2d(smaller).drawImage(small, 0, 0, smaller.width, smaller.height);
  smallContext.clearRect(0, 0, small.width, small.height);
  smallContext.drawImage(smaller, 0, 0, small.width, small.height);
  context.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

/* ------------------------------------------------------------------ */
/* Reading the image                                                   */
/* ------------------------------------------------------------------ */

const ANALYSIS_SIDE = 480;
const analyses = new WeakMap<object, FinisherAnalysis>();

/**
 * What kind of image a finisher is: a cut-out logo (transparent), a logo on
 * one flat colour (solid), or designed art with its own background (artwork),
 * and where its mark sits.
 */
export function analyseFinisher(picture: Picture): FinisherAnalysis {
  const cached = analyses.get(picture);
  if (cached) return cached;
  const { data, share } = pixelsOf(picture, ANALYSIS_SIDE);
  const { width, height } = data;
  const pixels = data.data;
  const ring = Math.max(2, Math.round(Math.min(width, height) * 0.015));

  // The image's edges: how many are see-through, and what colour the rest are.
  let clear = 0;
  const border: Rgb[] = [];
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < ring || y >= height - ring;
    for (let x = 0; x < width; x += 1) {
      if (!edgeRow && x >= ring && x < width - ring) continue;
      const at = (y * width + x) * 4;
      if (pixels[at + 3]! < 16) clear += 1;
      else border.push([pixels[at]!, pixels[at + 1]!, pixels[at + 2]!]);
    }
  }
  const median = (channel: 0 | 1 | 2) => {
    const values = border.map((pixel) => pixel[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  const ground: Rgb = [median(0), median(1), median(2)];
  const spreads = border
    .map((pixel) => distance(pixel[0], pixel[1], pixel[2], ground[0], ground[1], ground[2]))
    .sort((a, b) => a - b);
  const spread = spreads[Math.floor(spreads.length * 0.9)] ?? 0;

  const kind: FinisherKind =
    clear > (border.length + clear) * 0.25 ? "transparent" : spread < 30 ? "solid" : "artwork";

  // The mark: pixels that are neither see-through nor the flat background.
  // (On a flat background, a pixel's opacity is how far it stands out from it.)
  const noise = kind === "solid" ? Math.max(NOISE_ALPHA, (spread / 255) * 0.6) : 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let light = 0;
  let weight = 0;
  const vivid: Rgb[] = [];
  const standOut: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const r = pixels[at]!;
      const g = pixels[at + 1]!;
      const b = pixels[at + 2]!;
      let alpha = pixels[at + 3]! / 255;
      if (kind === "solid") {
        const lifted = colourToAlpha(r, g, b, ground[0], ground[1], ground[2]);
        alpha = lifted > noise * 2.5 ? lifted : 0;
        if (alpha > 0.25 && (x + y) % 2 === 0) standOut.push(alpha);
      }
      const inMark = kind === "artwork" || alpha > 0.1;
      if (!inMark) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      light += lightnessOf([r, g, b]) * alpha;
      weight += alpha;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (saturation > 60 && (x + y) % 3 === 0) vivid.push([r, g, b]);
    }
  }
  const size = pictureSize(picture);
  const found = maxX >= minX && maxY >= minY;
  const content = found
    ? {
        x: minX / share,
        y: minY / share,
        width: (maxX - minX + 1) / share,
        height: (maxY - minY + 1) / share,
      }
    : { x: 0, y: 0, width: size.width, height: size.height };
  const lightness = weight > 0 ? light / weight : 0.5;
  // Its colour: the average of its most saturated pixels, else a neutral of its own lightness.
  let accent: Rgb = lightness > 0.5 ? [255, 255, 255] : [40, 44, 52];
  if (vivid.length > 24) {
    vivid.sort((a, b) => Math.max(...b) - Math.min(...b) - (Math.max(...a) - Math.min(...a)));
    const top = vivid.slice(0, Math.max(12, Math.round(vivid.length * 0.3)));
    accent = [0, 1, 2].map(
      (channel) => top.reduce((sum, pixel) => sum + pixel[channel]!, 0) / top.length,
    ) as Rgb;
  }
  // What counts as fully opaque: most of the mark's own pixels (an edge
  // blended halfway into the background then comes out half see-through).
  standOut.sort((a, b) => a - b);
  const opacity = clamp(standOut[Math.floor(standOut.length * 0.6)] ?? 1, 0.25, 1);
  const result: FinisherAnalysis = {
    // A "solid" image that is nearly all mark (a full-bleed photo with a
    // thin flat border) is artwork.
    kind:
      kind === "solid" && found && content.width * content.height > size.width * size.height * 0.94
        ? "artwork"
        : kind,
    background: kind === "solid" ? toHex(ground) : null,
    opacity,
    content,
    lightness,
    accent: toHex(accent),
  };
  analyses.set(picture, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Lifting a logo off its background                                   */
/* ------------------------------------------------------------------ */

const isolated = new WeakMap<object, HTMLCanvasElement>();
/** Isolation works at most this size: past it the end card couldn't show the detail. */
const ISOLATION_SIDE = 2048;

/**
 * The mark alone, on transparency, cropped to it with a little room: a
 * cut-out logo as it is; a logo on a flat colour with that colour taken out,
 * its anti-aliased edges kept soft and cleared of the old colour's fringe.
 */
export function isolateMark(picture: Picture, analysis: FinisherAnalysis): HTMLCanvasElement {
  const cached = isolated.get(picture);
  if (cached) return cached;
  const size = pictureSize(picture);
  const share = Math.min(1, ISOLATION_SIDE / Math.max(size.width, size.height));
  const pad = Math.max(analysis.content.width, analysis.content.height) * 0.04;
  const crop = {
    x: Math.max(0, analysis.content.x - pad),
    y: Math.max(0, analysis.content.y - pad),
    width: 0,
    height: 0,
  };
  crop.width = Math.min(size.width, analysis.content.x + analysis.content.width + pad) - crop.x;
  crop.height = Math.min(size.height, analysis.content.y + analysis.content.height + pad) - crop.y;
  const board = canvas(crop.width * share, crop.height * share);
  const context = context2d(board);
  context.drawImage(
    picture,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    board.width,
    board.height,
  );
  if (analysis.kind === "solid" && analysis.background) {
    const image = context.getImageData(0, 0, board.width, board.height);
    const pixels = image.data;
    const [br, bg, bb] = fromHex(analysis.background);
    for (let at = 0; at < pixels.length; at += 4) {
      const r = pixels[at]!;
      const g = pixels[at + 1]!;
      const b = pixels[at + 2]!;
      const lifted = colourToAlpha(r, g, b, br, bg, bb);
      if (lifted <= NOISE_ALPHA) {
        pixels[at + 3] = 0;
        continue;
      }
      // The mark's own pixels fully opaque; an edge as see-through as it was blended.
      const alpha = clamp((lifted - NOISE_ALPHA) / (analysis.opacity - NOISE_ALPHA), 0, 1);
      if (alpha < 0.999) {
        // The edge pixel's own colour, without the background it was blended with.
        pixels[at] = clamp((r - (1 - alpha) * br) / Math.max(alpha, 1e-3), 0, 255);
        pixels[at + 1] = clamp((g - (1 - alpha) * bg) / Math.max(alpha, 1e-3), 0, 255);
        pixels[at + 2] = clamp((b - (1 - alpha) * bb) / Math.max(alpha, 1e-3), 0, 255);
      }
      pixels[at + 3] = Math.round(alpha * (pixels[at + 3] ?? 255));
    }
    context.putImageData(image, 0, 0);
  }
  isolated.set(picture, board);
  return board;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

type Rect = { x: number; y: number; width: number; height: number };

/** The frame's shape: wide, tall or about square. */
function orientation(frame: {
  width: number;
  height: number;
}): "landscape" | "portrait" | "square" {
  const ratio = frame.width / frame.height;
  return ratio >= 1.2 ? "landscape" : ratio <= 0.83 ? "portrait" : "square";
}

/**
 * The room a lifted mark has, by the frame's orientation: a landscape frame
 * gives it under half the width; a vertical one most of the width but under
 * a third of the height, a little above centre, clear of the captions and
 * buttons social apps lay over the bottom.
 */
function markRoom(frame: { width: number; height: number }): Rect & { centreY: number } {
  const shape = orientation(frame);
  const [w, h, centre] =
    shape === "landscape"
      ? [0.5, 0.46, 0.5]
      : shape === "portrait"
        ? [0.8, 0.34, 0.46]
        : [0.62, 0.48, 0.5];
  return {
    x: (frame.width * (1 - w)) / 2,
    y: frame.height * centre - (frame.height * h) / 2,
    width: frame.width * w,
    height: frame.height * h,
    centreY: frame.height * centre,
  };
}

/** Where a lifted mark of `size` sits in the frame. */
export function markRect(
  size: { width: number; height: number },
  frame: { width: number; height: number },
  scale: number | null,
): Rect {
  const room = markRoom(frame);
  const share = clamp(scale ?? DEFAULT_MARK_SCALE, 0.3, 1);
  const fit = Math.min(room.width / size.width, room.height / size.height) * share;
  const width = size.width * fit;
  const height = size.height * fit;
  return { x: (frame.width - width) / 2, y: room.centreY - height / 2, width, height };
}

/** Where designed artwork sits: whole, as large as `scale` of the frame allows, centred. */
export function artworkRect(
  size: { width: number; height: number },
  frame: { width: number; height: number },
  scale: number | null,
): Rect {
  const share = clamp(scale ?? artworkScale(size, frame), 0.3, 1);
  const rect = containRect(size, frame, share);
  // A vertical frame keeps it a touch above centre, clear of social apps' captions.
  if (orientation(frame) === "portrait" && share < 1)
    rect.y = Math.max(0, rect.y - frame.height * 0.02);
  return rect;
}

/** Artwork already the frame's shape fills it edge to edge; any other is set a little inside it. */
function artworkScale(
  size: { width: number; height: number },
  frame: { width: number; height: number },
): number {
  const gap = Math.abs(Math.log(size.width / size.height / (frame.width / frame.height)));
  return gap < 0.03 ? 1 : DEFAULT_ARTWORK_SCALE;
}

/** How large a finisher is drawn when its size is left to the frame (see BrandCardStyle.scale). */
export function defaultScale(
  picture: Picture,
  analysis: FinisherAnalysis,
  frame: { width: number; height: number },
): number {
  return analysis.kind === "artwork"
    ? artworkScale(pictureSize(picture), frame)
    : DEFAULT_MARK_SCALE;
}

/** What surrounds the mark for a style: "auto" picks by image and by what is at hand. */
export function resolveBackdrop(
  background: string,
  analysis: FinisherAnalysis,
  hasScene: boolean,
): Backdrop {
  if (hexColor(background)) return "flat";
  if (background === "blur") return "blur";
  if (background === "scene")
    return hasScene ? "scene" : analysis.kind === "artwork" ? "extend" : "brand";
  if (background === "brand") return analysis.kind === "artwork" ? "extend" : "brand";
  if (background === "extend") return analysis.kind === "artwork" ? "extend" : "brand";
  // auto
  if (analysis.kind === "artwork") return "extend";
  return hasScene ? "scene" : "brand";
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

export interface BrandCardInput {
  picture: Picture;
  style: BrandCardStyle;
  width: number;
  height: number;
  /** The video's final frame, which the backdrop is made from where it is chosen. */
  scene?: Picture | null;
  /** Fine grain over the card, so gradients don't band once encoded. Off for small previews. */
  grain?: boolean;
}

/** A vignette: the frame's edges darkened (or, for light cards, greyed) towards its corners. */
function vignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number,
  light: boolean,
) {
  const radius = Math.hypot(width, height) / 2;
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    radius * 0.35,
    width / 2,
    height / 2,
    radius,
  );
  const tone = light ? "120, 120, 120" : "0, 0, 0";
  gradient.addColorStop(0, `rgba(${tone}, 0)`);
  gradient.addColorStop(1, `rgba(${tone}, ${strength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

/** A soft pool of light behind the mark, in its own colour. */
function glow(context: CanvasRenderingContext2D, rect: Rect, colour: Rgb, strength: number) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) * 0.95;
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  const [r, g, b] = colour.map(Math.round);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${strength})`);
  gradient.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${strength * 0.35})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  context.save();
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient;
  context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  context.restore();
}

/** The film's final frame filling the card, defocused and dimmed (or frosted, under a dark mark). */
function drawSceneBackdrop(
  context: CanvasRenderingContext2D,
  scene: Picture,
  width: number,
  height: number,
  darkMark: boolean,
) {
  const base = canvas(width, height);
  const crop = coverCrop(pictureSize(scene), { width, height });
  context2d(base).drawImage(scene, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  context.drawImage(blurred(base, Math.hypot(width, height) * 0.018), 0, 0);
  if (darkMark) {
    // Frosted: the film's colours still there, lifted well clear of a dark mark.
    context.fillStyle = "rgba(250, 250, 248, 0.74)";
    context.fillRect(0, 0, width, height);
    vignette(context, width, height, 0.1, true);
  } else {
    context.fillStyle = "rgba(4, 6, 10, 0.5)";
    context.fillRect(0, 0, width, height);
    vignette(context, width, height, 0.55, false);
  }
}

/** A lit backdrop in the mark's own colours: light from the centre, falling off to the edges. */
function drawBrandBackdrop(
  context: CanvasRenderingContext2D,
  analysis: FinisherAnalysis,
  width: number,
  height: number,
) {
  const dark = analysis.lightness >= 0.45;
  // Its own background colour when it had one, else a deep neutral (light for a dark mark).
  const ground: Rgb = analysis.background
    ? fromHex(analysis.background)
    : dark
      ? mix([10, 12, 17], fromHex(analysis.accent), 0.06)
      : [244, 244, 241];
  const groundIsDark = lightnessOf(ground) < 0.5;
  const centre = groundIsDark
    ? mix(ground, [255, 255, 255], 0.09)
    : mix(ground, [255, 255, 255], 0.35);
  const edge = groundIsDark ? mix(ground, [0, 0, 0], 0.55) : mix(ground, [0, 0, 0], 0.12);
  const gradient = context.createRadialGradient(
    width / 2,
    height * 0.48,
    0,
    width / 2,
    height * 0.48,
    Math.hypot(width, height) * 0.62,
  );
  gradient.addColorStop(0, toHex(centre));
  gradient.addColorStop(0.55, toHex(mix(centre, edge, 0.45)));
  gradient.addColorStop(1, toHex(edge));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

/**
 * Designed artwork carried out to the frame's edges. Right beside it, its own
 * outermost pixels drawn outward (so colours and lines run on unbroken from
 * its edges, and no text or logo near an edge is ever repeated), lightly
 * softened; further out, its whole picture mirrored and heavily softened,
 * like a lens's depth of field; then dimmed towards the frame's edges.
 */
function drawExtendedBackdrop(
  context: CanvasRenderingContext2D,
  art: Picture,
  rect: Rect,
  width: number,
  height: number,
) {
  const tiles = canvas(width, height);
  const tilesContext = context2d(tiles);
  const columns = Math.ceil(rect.x / rect.width) + 1;
  const rows = Math.ceil(rect.y / rect.height) + 1;
  for (let row = -rows; row <= rows; row += 1) {
    for (let column = -columns; column <= columns; column += 1) {
      const x = rect.x + column * rect.width;
      const y = rect.y + row * rect.height;
      if (x > width || y > height || x + rect.width < 0 || y + rect.height < 0) continue;
      // Every other copy mirrored, so each meets its neighbour edge to edge.
      const flipX = Math.abs(column) % 2 === 1;
      const flipY = Math.abs(row) % 2 === 1;
      tilesContext.save();
      tilesContext.translate(x + (flipX ? rect.width : 0), y + (flipY ? rect.height : 0));
      tilesContext.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      tilesContext.drawImage(art, 0, 0, rect.width, rect.height);
      tilesContext.restore();
    }
  }
  const diagonal = Math.hypot(width, height);
  context.drawImage(blurred(tiles, diagonal * 0.035), 0, 0);
  // Beside the art, its edges drawn outward, lightly softened, fading out with distance from it.
  const near = blurred(edgesOutward(art, rect, width, height), diagonal * 0.01);
  const reach = Math.max(rect.width, rect.height) * 0.3;
  const mask = canvas(width, height);
  const maskContext = context2d(mask);
  maskContext.fillStyle = "#fff";
  maskContext.fillRect(
    rect.x - reach / 2,
    rect.y - reach / 2,
    rect.width + reach,
    rect.height + reach,
  );
  const nearMask = blurred(mask, reach * 0.6);
  const nearContext = context2d(near);
  nearContext.globalCompositeOperation = "destination-in";
  nearContext.drawImage(nearMask, 0, 0);
  context.drawImage(near, 0, 0);
  context.fillStyle = "rgba(0, 0, 0, 0.1)";
  context.fillRect(0, 0, width, height);
  vignette(context, width, height, 0.45, false);
}

/**
 * The art in its place with a thin strip from each of its edges stretched
 * out to the frame's edge (corners from its corner pixels): its colours and
 * lines carried outward without repeating anything in it.
 */
function edgesOutward(art: Picture, rect: Rect, width: number, height: number): HTMLCanvasElement {
  const out = canvas(width, height);
  const context = context2d(out);
  const source = pictureSize(art);
  const sx = Math.max(1, source.width * 0.03);
  const sy = Math.max(1, source.height * 0.03);
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const parts: [number, number, number, number, number, number, number, number][] = [
    // Sides: [sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH]
    [0, 0, sx, source.height, 0, top, left, rect.height],
    [source.width - sx, 0, sx, source.height, right, top, width - right, rect.height],
    [0, 0, source.width, sy, left, 0, rect.width, top],
    [0, source.height - sy, source.width, sy, left, bottom, rect.width, height - bottom],
    // Corners.
    [0, 0, sx, sy, 0, 0, left, top],
    [source.width - sx, 0, sx, sy, right, 0, width - right, top],
    [0, source.height - sy, sx, sy, 0, bottom, left, height - bottom],
    [source.width - sx, source.height - sy, sx, sy, right, bottom, width - right, height - bottom],
  ];
  for (const [x, y, w, h, dx, dy, dw, dh] of parts)
    if (dw > 0.5 && dh > 0.5) context.drawImage(art, x, y, w, h, dx, dy, dw, dh);
  context.drawImage(art, rect.x, rect.y, rect.width, rect.height);
  return out;
}

/** Artwork with its edges faded out over `feather` pixels, so it melts into what is around it. */
function feathered(art: Picture, rect: Rect, feather: number): HTMLCanvasElement {
  const out = canvas(rect.width, rect.height);
  const context = context2d(out);
  context.drawImage(art, 0, 0, out.width, out.height);
  if (feather < 1) return out;
  const mask = canvas(out.width, out.height);
  const maskContext = context2d(mask);
  const edges: [number, number, number, number, number, number, number, number][] = [
    [0, 0, feather, 0, 0, 0, feather, out.height],
    [out.width, 0, out.width - feather, 0, out.width - feather, 0, feather, out.height],
    [0, 0, 0, feather, 0, 0, out.width, feather],
    [0, out.height, 0, out.height - feather, 0, out.height - feather, out.width, feather],
  ];
  maskContext.fillStyle = "#fff";
  maskContext.fillRect(0, 0, out.width, out.height);
  maskContext.globalCompositeOperation = "destination-out";
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const gradient = maskContext.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    maskContext.fillStyle = gradient;
    maskContext.fillRect(rx, ry, rw, rh);
  }
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0);
  return out;
}

/** Light film grain, so smooth gradients don't band once the video is encoded. */
function addGrain(context: CanvasRenderingContext2D, width: number, height: number, amount = 3) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  // A cheap repeatable noise (no Math.random per pixel): the same card comes out the same.
  let seed = 0x2f6b9a1d;
  for (let at = 0; at < pixels.length; at += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed & 0xff) / 255 - 0.5) * 2 * amount;
    pixels[at] = clamp(pixels[at]! + noise, 0, 255);
    pixels[at + 1] = clamp(pixels[at + 1]! + noise, 0, 255);
    pixels[at + 2] = clamp(pixels[at + 2]! + noise, 0, 255);
  }
  context.putImageData(image, 0, 0);
}

/** Draws the end card for a finisher into a context of the card's size. */
export function drawBrandCard(context: CanvasRenderingContext2D, input: BrandCardInput): Backdrop {
  const { picture, style, width, height } = input;
  const frame = { width, height };
  const analysis = analyseFinisher(picture);
  const backdrop = resolveBackdrop(style.background, analysis, !!input.scene);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);

  if (analysis.kind === "artwork" || backdrop === "blur") {
    // Designed art (or the image as uploaded, on a blur of itself): shown whole.
    const rect = artworkRect(pictureSize(picture), frame, style.scale);
    if (backdrop === "flat") {
      context.fillStyle = hexColor(style.background) ?? "#000000";
      context.fillRect(0, 0, width, height);
    } else if (backdrop === "scene" && input.scene) {
      drawSceneBackdrop(context, input.scene, width, height, false);
    } else {
      drawExtendedBackdrop(context, picture, rect, width, height);
    }
    // Edges feathered into the ground, except where the art already fills the frame.
    const fills = rect.width >= width - 1 && rect.height >= height - 1;
    const feather = fills ? 0 : Math.min(rect.width, rect.height) * 0.06;
    context.drawImage(feathered(picture, rect, feather), rect.x, rect.y, rect.width, rect.height);
  } else {
    const mark = isolateMark(picture, analysis);
    const rect = markRect(mark, frame, style.scale);
    const darkMark = analysis.lightness < 0.42;
    if (backdrop === "flat") {
      context.fillStyle = hexColor(style.background) ?? "#000000";
      context.fillRect(0, 0, width, height);
    } else if (backdrop === "scene" && input.scene) {
      drawSceneBackdrop(context, input.scene, width, height, darkMark);
    } else {
      drawBrandBackdrop(context, analysis, width, height);
    }
    if (backdrop !== "flat") {
      // Light behind a light mark; a soft shadow under a dark one.
      if (!darkMark) glow(context, rect, fromHex(analysis.accent), 0.16);
      else {
        context.save();
        context.shadowColor = "rgba(0, 0, 0, 0.18)";
        context.shadowBlur = Math.max(4, rect.height * 0.08);
        context.shadowOffsetY = Math.max(1, rect.height * 0.02);
        context.drawImage(mark, rect.x, rect.y, rect.width, rect.height);
        context.restore();
      }
      if (!darkMark) vignette(context, width, height, 0.25, false);
    }
    context.drawImage(mark, rect.x, rect.y, rect.width, rect.height);
  }
  if (input.grain && backdrop !== "flat") addGrain(context, width, height);
  context.restore();
  return backdrop;
}

/** The end card as a file. */
export async function composeBrandCard(
  input: BrandCardInput,
  type: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<Blob> {
  const board = canvas(input.width, input.height);
  drawBrandCard(context2d(board), { ...input, grain: input.grain ?? true });
  return new Promise((resolve, reject) =>
    board.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The end card couldn't be saved"))),
      type,
      type === "image/png" ? undefined : 0.95,
    ),
  );
}

/** How a finisher will be treated, in a few words for the person setting it up. */
export function finisherTreatment(analysis: FinisherAnalysis): string {
  switch (analysis.kind) {
    case "transparent":
      return "A cut-out logo: it's set on a backdrop made for the frame.";
    case "solid":
      return "A logo on a flat background: the background is lifted off and the logo set on a backdrop made for the frame.";
    default:
      return "Designed artwork: shown whole, with its own background carried out to the frame's edges.";
  }
}
