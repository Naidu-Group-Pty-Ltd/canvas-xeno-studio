/**
 * The drawing behind extending artwork to the video's shape with AI (see
 * ./extend-artwork): the canvas the image model is given, finding the
 * artwork in what it painted and checking the model really filled the
 * canvas, and laying the artwork's own pixels back over the painting.
 * Browser only (canvas); nothing here is stored or billed.
 */
import {
  alignArtwork,
  grayOf,
  padResidue,
  type Box,
  type Gray,
  type Placement,
} from "./artwork-align";
import { artworkRect } from "./brand-card";
import { pictureSize, type Picture } from "./compose";
import { coverCrop } from "./frame";

type Size = { width: number; height: number };

function board(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser can't draw the artwork");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { element, context };
}

export function canvasBlob(element: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    element.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The artwork couldn't be saved"))),
      type,
      quality,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* What the model is given                                             */
/* ------------------------------------------------------------------ */

/** The canvas the model is given: the frame's shape, its long side this long. */
const GUIDE_LONG_SIDE = 2048;

/** Where the empty canvas is: above and below the artwork, either side of it, or all round. */
export type Bands = "vertical" | "horizontal" | "around";

/** The canvas the model is given, and where the artwork sits in it. */
export interface GuideLayout {
  width: number;
  height: number;
  rect: Box;
  /**
   * The empty canvas around the artwork: one flat colour (#rrggbb), so a
   * model reads it as space to fill and anything it leaves unpainted shows.
   * Null for canvases from before, whose empty canvas was a blur.
   */
  pad: string | null;
}

/** Where the empty canvas is, for a canvas of `size` with the artwork at `rect`. */
export function bandsOf(rect: Box, size: Size): Bands {
  const spansWidth = rect.x <= 0.5 && rect.x + rect.width >= size.width - 0.5;
  const spansHeight = rect.y <= 0.5 && rect.y + rect.height >= size.height - 0.5;
  if (spansWidth && !spansHeight) return "vertical";
  if (spansHeight && !spansWidth) return "horizontal";
  return "around";
}

/**
 * The empty canvas's colour: white, or black for light artwork, so it is
 * never a colour the artwork's own background could carry on as (a model
 * continuing a white background would otherwise look like one that left
 * the canvas empty).
 */
export function padColourFor(picture: Picture): string {
  const { element, context } = board(64, 64);
  context.drawImage(picture, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  let light = 0;
  let count = 0;
  for (let y = 0; y < 64; y += 1)
    for (let x = 0; x < 64; x += 1) {
      if (x > 3 && x < 60 && y > 3 && y < 60) continue;
      const at = (y * 64 + x) * 4;
      light += 0.2126 * pixels[at]! + 0.7152 * pixels[at + 1]! + 0.0722 * pixels[at + 2]!;
      count += 1;
    }
  element.width = 0;
  return light / count > 150 ? "#000000" : "#ffffff";
}

/**
 * The model's canvas: the frame's shape, the artwork where it sits on the end
 * card (at `scale` of the frame, or as large as the frame allows when that is
 * left to the frame), sharp and on whole pixels, and around it flat empty
 * canvas for the model to fill.
 */
export function drawGuide(
  picture: Picture,
  frame: Size,
  scale: number | null,
): GuideLayout & { canvas: HTMLCanvasElement; bands: Bands; pad: string } {
  const ratio = frame.width / frame.height;
  const width = Math.round(ratio >= 1 ? GUIDE_LONG_SIDE : GUIDE_LONG_SIDE * ratio);
  const height = Math.round(ratio >= 1 ? GUIDE_LONG_SIDE / ratio : GUIDE_LONG_SIDE);
  const exact = artworkRect(pictureSize(picture), { width, height }, scale ?? 1);
  const rect = {
    x: Math.round(exact.x),
    y: Math.round(exact.y),
    width: Math.round(exact.width),
    height: Math.round(exact.height),
  };
  const pad = padColourFor(picture);
  const { element, context } = board(width, height);
  context.fillStyle = pad;
  context.fillRect(0, 0, width, height);
  context.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
  return { canvas: element, width, height, rect, pad, bands: bandsOf(rect, { width, height }) };
}

/* ------------------------------------------------------------------ */
/* Finding the artwork in the painting                                 */
/* ------------------------------------------------------------------ */

/** Below this, the painting no longer shows the artwork as it was (see Placement.score). */
export const MIN_ALIGNMENT = 0.8;

/** A picture's grey levels at a size. */
function grayAt(picture: Picture, width: number, height: number): Gray {
  const { element, context } = board(width, height);
  context.drawImage(picture, 0, 0, element.width, element.height);
  return grayOf(
    context.getImageData(0, 0, element.width, element.height).data,
    element.width,
    element.height,
  );
}

/**
 * The painting brought back to exactly the canvas the model was given, from
 * its own size (a model paints at sizes of its own, a hair off the shape it
 * was given): scaled and cropped ("cover"), or stretched to it, as a model
 * may have squeezed the canvas to its size.
 */
export function paintingAt(
  painting: Picture,
  size: Size,
  mode: "cover" | "stretch" = "cover",
): HTMLCanvasElement {
  const { element, context } = board(size.width, size.height);
  const own = pictureSize(painting);
  const crop =
    mode === "cover" ? coverCrop(own, size) : { x: 0, y: 0, width: own.width, height: own.height };
  context.drawImage(
    painting,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    element.width,
    element.height,
  );
  return element;
}

/**
 * The artwork looked for in the painting at one resolution (`longSide`):
 * at each of `scales`, centred on where it was put moved by `from`, up to
 * `reach` pixels (at that resolution) each way. Moves are in the guide's pixels.
 */
function searchArtwork(
  art: Picture,
  painting: HTMLCanvasElement,
  guide: GuideLayout,
  longSide: number,
  scales: number[],
  from: { dx: number; dy: number },
  reach: (picture: Gray) => { x: number; y: number },
): Placement | null {
  const share = Math.min(1, longSide / Math.max(guide.width, guide.height));
  const picture = grayAt(painting, guide.width * share, guide.height * share);
  const expected = {
    x: (guide.rect.x + from.dx) * share,
    y: (guide.rect.y + from.dy) * share,
    width: guide.rect.width * share,
    height: guide.rect.height * share,
  };
  const arts = scales.map((scale) => ({
    scale,
    gray: grayAt(
      art,
      Math.max(8, Math.round(expected.width * scale)),
      Math.max(8, Math.round(expected.height * scale)),
    ),
  }));
  const found = alignArtwork(picture, arts, expected, reach(picture));
  return found
    ? { ...found, dx: from.dx + found.dx / share, dy: from.dy + found.dy / share }
    : null;
}

const steps = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) =>
    Number((from + index * step).toFixed(4)),
  );

/**
 * Where the model left the artwork in its painting (on the guide's canvas),
 * and how intact it is: searched roughly over a wide range of moves and sizes
 * (a model can zoom or shift the picture it was given), then finely around
 * the best, so the artwork lands within a pixel of the model's copy of it.
 * The score is the mid-resolution one: the design as a whole, without
 * counting the fine texture a model always redraws a little.
 */
export function locateArtwork(
  art: Picture,
  painting: HTMLCanvasElement,
  guide: GuideLayout,
): Placement | null {
  const rough = searchArtwork(
    art,
    painting,
    guide,
    160,
    steps(0.84, 1.1, 0.02),
    { dx: 0, dy: 0 },
    (picture) => ({
      x: Math.round(picture.width * 0.1),
      y: Math.round(picture.height * 0.1),
    }),
  );
  if (!rough) return null;
  const middle =
    searchArtwork(
      art,
      painting,
      guide,
      400,
      steps(rough.scale - 0.02, rough.scale + 0.02, 0.01),
      rough,
      () => ({ x: 4, y: 4 }),
    ) ?? rough;
  const fine = searchArtwork(
    art,
    painting,
    guide,
    1024,
    [middle.scale - 0.005, middle.scale, middle.scale + 0.005],
    middle,
    () => ({ x: 3, y: 3 }),
  );
  return fine ? { ...fine, score: middle.score } : middle;
}

/** Where the artwork is in the painting (guide pixels), from where it was put and where it was found. */
export function placedArt(rect: Box, found: Placement): Box {
  const width = rect.width * found.scale;
  const height = rect.height * found.scale;
  return {
    x: rect.x + rect.width / 2 + found.dx - width / 2,
    y: rect.y + rect.height / 2 + found.dy - height / 2,
    width,
    height,
  };
}

/**
 * Empty canvas a usable painting may still show (see padResidue): a few
 * blocks clear of the artwork, and up to a hairline just around it, which
 * the artwork's own edge, drawn a little beyond it, covers (see artworkOver).
 */
const MAX_OPEN_RESIDUE = 0.02;
const MAX_SEAM_RESIDUE = 0.3;

/** What a painting was found to be, and why it can't be used when it can't. */
export interface Inspection {
  /** The painting brought to the guide's canvas. */
  painting: HTMLCanvasElement;
  found: Placement | null;
  /** Where the artwork is in it (guide pixels). */
  art: Box | null;
  /** How much empty canvas the model left (see padResidue); null when that can't be told. */
  residue: { open: number; seam: number } | null;
  /** Why it can't be used, in a sentence; null when it can. */
  problem: "changed" | "unfilled" | "gap" | null;
}

/** What a problem means, for the person who paid for the painting. */
export const PROBLEM_TEXT: Record<NonNullable<Inspection["problem"]>, string> = {
  changed: "The model changed your artwork rather than only painting around it",
  unfilled: "The model left part of the frame empty instead of painting it",
  gap: "The model left a gap between your artwork and what it painted",
};

const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * A painting checked against the canvas it was given: where the model left
 * the artwork and whether it is intact, and whether the empty canvas was
 * really filled, around the artwork too.
 */
export function inspectPainting(input: {
  art: Picture;
  painting: Picture;
  guide: GuideLayout;
}): Inspection {
  const { guide } = input;
  // Painted a hair off the canvas's shape, it may have been cropped or
  // squeezed to fit: whichever brings the artwork back into line is used.
  const own = pictureSize(input.painting);
  const offShape =
    Math.abs(Math.log(own.width / own.height / (guide.width / guide.height))) > 0.001;
  const tries = (offShape ? (["cover", "stretch"] as const) : (["cover"] as const)).map((mode) => {
    const painting = paintingAt(input.painting, guide, mode);
    return { painting, found: locateArtwork(input.art, painting, guide) };
  });
  const { painting, found } = tries.reduce((best, next) =>
    (next.found?.score ?? -1) > (best.found?.score ?? -1) ? next : best,
  );
  if (!found || found.score < MIN_ALIGNMENT)
    return { painting, found, art: null, residue: null, problem: "changed" };
  const art = placedArt(guide.rect, found);
  if (!guide.pad) return { painting, found, art, residue: null, problem: null };
  const context = painting.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser can't read the painting");
  const residue = padResidue({
    pixels: context.getImageData(0, 0, painting.width, painting.height).data,
    width: painting.width,
    height: painting.height,
    art,
    pad: rgbOf(guide.pad),
    seam: Math.max(3, Math.round(Math.min(painting.width, painting.height) * 0.01)),
  });
  const problem =
    residue.open > MAX_OPEN_RESIDUE ? "unfilled" : residue.seam > MAX_SEAM_RESIDUE ? "gap" : null;
  return { painting, found, art, residue, problem };
}

/* ------------------------------------------------------------------ */
/* The artwork laid back over it                                       */
/* ------------------------------------------------------------------ */

/**
 * The artwork at `rect`, exactly, joined to the painting where it meets it
 * (not where it meets the frame's edge): a thin strip of its own edge is
 * drawn on outward, fading into the painting over `overlap` pixels, so the
 * join shows no line and a hairline the model left there is covered by the
 * artwork's own edge colours.
 */
function artworkOver(
  context: CanvasRenderingContext2D,
  art: Picture,
  rect: Box,
  frame: Size,
  overlap: number,
) {
  const out = {
    left: rect.x > 0.5 ? overlap : 0,
    right: rect.x + rect.width < frame.width - 0.5 ? overlap : 0,
    top: rect.y > 0.5 ? overlap : 0,
    bottom: rect.y + rect.height < frame.height - 0.5 ? overlap : 0,
  };
  const piece = board(rect.width + out.left + out.right, rect.height + out.top + out.bottom);
  const { width, height } = piece.element;
  const inner = {
    x: out.left,
    y: out.top,
    width: width - out.left - out.right,
    height: height - out.top - out.bottom,
  };
  const source = pictureSize(art);
  const sx = Math.max(1, source.width * 0.004);
  const sy = Math.max(1, source.height * 0.004);
  const draw = piece.context;
  if (out.left) draw.drawImage(art, 0, 0, sx, source.height, 0, inner.y, out.left, inner.height);
  if (out.right)
    draw.drawImage(
      art,
      source.width - sx,
      0,
      sx,
      source.height,
      inner.x + inner.width,
      inner.y,
      out.right,
      inner.height,
    );
  if (out.top) draw.drawImage(art, 0, 0, source.width, sy, inner.x, 0, inner.width, out.top);
  if (out.bottom)
    draw.drawImage(
      art,
      0,
      source.height - sy,
      source.width,
      sy,
      inner.x,
      inner.y + inner.height,
      inner.width,
      out.bottom,
    );

  // Opaque over the artwork, fading out across the strip beyond it.
  const mask = board(width, height);
  mask.context.fillStyle = "#fff";
  mask.context.fillRect(0, 0, width, height);
  mask.context.globalCompositeOperation = "destination-out";
  // Solid for the first third (a hairline there is covered outright), then fading out.
  const fade = (x0: number, y0: number, x1: number, y1: number, area: Box) => {
    const gradient = mask.context.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.65, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    mask.context.fillStyle = gradient;
    mask.context.fillRect(area.x, area.y, area.width, area.height);
  };
  if (out.left) fade(0, 0, out.left, 0, { x: 0, y: 0, width: out.left, height });
  if (out.right)
    fade(width, 0, width - out.right, 0, {
      x: width - out.right,
      y: 0,
      width: out.right,
      height,
    });
  if (out.top) fade(0, 0, 0, out.top, { x: 0, y: 0, width, height: out.top });
  if (out.bottom)
    fade(0, height, 0, height - out.bottom, {
      x: 0,
      y: height - out.bottom,
      width,
      height: out.bottom,
    });
  draw.globalCompositeOperation = "destination-in";
  draw.drawImage(mask.element, 0, 0);
  // The artwork itself goes on last, untouched by the fade.
  draw.globalCompositeOperation = "source-over";
  draw.drawImage(art, inner.x, inner.y, inner.width, inner.height);
  context.drawImage(piece.element, rect.x - out.left, rect.y - out.top);
}

/** The extended artwork's size: the frame's shape, at least 1920 on its long side. */
export function finishedSize(frame: Size): Size {
  const long = Math.max(frame.width, frame.height);
  const share = Math.min(3840 / long, Math.max(1, 1920 / long));
  return { width: Math.round(frame.width * share), height: Math.round(frame.height * share) };
}

/**
 * The finished artwork from a painting that passed inspection: the painting
 * at the frame's shape, with the artwork's own pixels laid over it exactly
 * where the model left it, blended in at the join.
 */
export function composeExtended(input: {
  art: Picture;
  inspection: Inspection;
  guide: GuideLayout;
  frame: Size;
}): HTMLCanvasElement {
  const { inspection, guide } = input;
  if (!inspection.art || inspection.problem)
    throw new Error("That painting can't be used for the artwork");
  const size = finishedSize(input.frame);
  const shareX = size.width / guide.width;
  const shareY = size.height / guide.height;
  const { element, context } = board(size.width, size.height);
  context.drawImage(inspection.painting, 0, 0, element.width, element.height);
  const where = {
    x: inspection.art.x * shareX,
    y: inspection.art.y * shareY,
    width: inspection.art.width * shareX,
    height: inspection.art.height * shareY,
  };
  const overlap = Math.min(24, Math.max(3, Math.min(size.width, size.height) * 0.01));
  artworkOver(context, input.art, where, size, overlap);
  return element;
}
