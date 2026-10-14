/**
 * The drawing behind extending artwork to the video's shape with AI (see
 * ./extend-artwork): the canvas the image model is given, finding the
 * artwork in what it painted, and laying the artwork's own pixels back over
 * it. Browser only (canvas); nothing here is stored or billed.
 */
import { alignArtwork, grayOf, type Gray, type Placement } from "./artwork-align";
import { artworkRect, drawArtworkGuide } from "./brand-card";
import { pictureSize, type Picture } from "./compose";
import { coverCrop } from "./frame";

type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

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

/** The canvas the model is given, and where the artwork sits in it. */
export interface GuideLayout {
  width: number;
  height: number;
  rect: Rect;
}

/**
 * The model's canvas: the frame's shape, the artwork where it sits on the end
 * card (at `scale` of the frame, or as large as the frame allows when that is
 * left to the frame), the rest roughly filled from its own edges.
 */
export function drawGuide(
  picture: Picture,
  frame: Size,
  scale: number | null,
): GuideLayout & { canvas: HTMLCanvasElement } {
  const ratio = frame.width / frame.height;
  const width = Math.round(ratio >= 1 ? GUIDE_LONG_SIDE : GUIDE_LONG_SIDE * ratio);
  const height = Math.round(ratio >= 1 ? GUIDE_LONG_SIDE / ratio : GUIDE_LONG_SIDE);
  const rect = artworkRect(pictureSize(picture), { width, height }, scale ?? 1);
  const { element, context } = board(width, height);
  drawArtworkGuide(context, picture, rect, width, height);
  return { canvas: element, width, height, rect };
}

/* ------------------------------------------------------------------ */
/* Finding the artwork in the painting                                 */
/* ------------------------------------------------------------------ */

/** Below this, the painting no longer shows the artwork as it was (see Placement.score). */
export const MIN_ALIGNMENT = 0.8;
/**
 * The grey-level pictures alignment is worked out on, by their long side:
 * first roughly over a wide search, then finely around what that found, so
 * the artwork lands within a pixel of the model's copy of it.
 */
const ALIGN_LONG_SIDE = 320;
const ALIGN_FINE_LONG_SIDE = 1024;
/** Sizes the artwork is looked for at, against where it was put. */
const ALIGN_SCALES = [0.95, 0.97, 0.985, 1, 1.015, 1.03, 1.05];

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
 * `reach` (a share of the picture) each way. Moves are in the guide's pixels.
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

/** Where the model left the artwork in its painting (on the guide's canvas), and how intact. */
export function locateArtwork(
  art: Picture,
  painting: HTMLCanvasElement,
  guide: GuideLayout,
): Placement | null {
  const rough = searchArtwork(
    art,
    painting,
    guide,
    ALIGN_LONG_SIDE,
    ALIGN_SCALES,
    { dx: 0, dy: 0 },
    (picture) => ({
      x: Math.round(picture.width * 0.05),
      y: Math.round(picture.height * 0.05),
    }),
  );
  if (!rough || rough.score < MIN_ALIGNMENT) return rough;
  // Then to the pixel: a rough step is this many fine ones.
  const step = Math.ceil(ALIGN_FINE_LONG_SIDE / ALIGN_LONG_SIDE) + 1;
  const fine = searchArtwork(
    art,
    painting,
    guide,
    ALIGN_FINE_LONG_SIDE,
    [rough.scale - 0.0075, rough.scale, rough.scale + 0.0075],
    { dx: rough.dx, dy: rough.dy },
    () => ({ x: step, y: step }),
  );
  return fine && fine.score >= rough.score - 0.05 ? fine : rough;
}

/* ------------------------------------------------------------------ */
/* The artwork laid back over it                                       */
/* ------------------------------------------------------------------ */

/**
 * The artwork at `rect`, its edges faded out over `feather` pixels where it
 * meets painting, but left hard where it meets the frame's edge.
 */
function artworkOver(
  context: CanvasRenderingContext2D,
  art: Picture,
  rect: Rect,
  frame: Size,
  feather: number,
) {
  const piece = board(rect.width, rect.height);
  piece.context.drawImage(art, 0, 0, piece.element.width, piece.element.height);
  const { width, height } = piece.element;
  const mask = board(width, height);
  mask.context.fillStyle = "#fff";
  mask.context.fillRect(0, 0, width, height);
  mask.context.globalCompositeOperation = "destination-out";
  const edges: { inside: boolean; from: [number, number, number, number]; area: Rect }[] = [
    {
      inside: rect.x > 0.5,
      from: [0, 0, feather, 0],
      area: { x: 0, y: 0, width: feather, height },
    },
    {
      inside: rect.x + rect.width < frame.width - 0.5,
      from: [width, 0, width - feather, 0],
      area: { x: width - feather, y: 0, width: feather, height },
    },
    {
      inside: rect.y > 0.5,
      from: [0, 0, 0, feather],
      area: { x: 0, y: 0, width, height: feather },
    },
    {
      inside: rect.y + rect.height < frame.height - 0.5,
      from: [0, height, 0, height - feather],
      area: { x: 0, y: height - feather, width, height: feather },
    },
  ];
  for (const edge of edges) {
    if (!edge.inside) continue;
    const gradient = mask.context.createLinearGradient(...edge.from);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    mask.context.fillStyle = gradient;
    mask.context.fillRect(edge.area.x, edge.area.y, edge.area.width, edge.area.height);
  }
  piece.context.globalCompositeOperation = "destination-in";
  piece.context.drawImage(mask.element, 0, 0);
  context.drawImage(piece.element, rect.x, rect.y, rect.width, rect.height);
}

/** The extended artwork's size: the frame's shape, at least 1920 on its long side. */
export function finishedSize(frame: Size): Size {
  const long = Math.max(frame.width, frame.height);
  const share = Math.min(3840 / long, Math.max(1, 1920 / long));
  return { width: Math.round(frame.width * share), height: Math.round(frame.height * share) };
}

/** A painting the artwork can't be found in unchanged: the model moved or redrew it. */
export class ArtworkChangedError extends Error {}

/**
 * The finished artwork: the model's painting at the frame's shape, with the
 * artwork's own pixels laid over it exactly where the model left it, edges
 * feathered into the painting. Throws ArtworkChangedError when the painting
 * doesn't show the artwork intact.
 */
export function composeExtended(input: {
  art: Picture;
  painting: Picture;
  guide: GuideLayout;
  frame: Size;
}): { canvas: HTMLCanvasElement; found: Placement } {
  // Painted a hair off the canvas's shape, it may have been cropped or
  // squeezed to fit: whichever brings the artwork back into line is used.
  const own = pictureSize(input.painting);
  const offShape =
    Math.abs(Math.log(own.width / own.height / (input.guide.width / input.guide.height))) > 0.001;
  const tries = (offShape ? (["cover", "stretch"] as const) : (["cover"] as const)).map((mode) => {
    const painting = paintingAt(input.painting, input.guide, mode);
    return { painting, found: locateArtwork(input.art, painting, input.guide) };
  });
  const { painting, found } = tries.reduce((best, next) =>
    (next.found?.score ?? -1) > (best.found?.score ?? -1) ? next : best,
  );
  if (!found || found.score < MIN_ALIGNMENT)
    throw new ArtworkChangedError(
      "The model changed your artwork rather than only painting around it, so its result wasn't used (it's in your library). Try again, or keep the standard end card.",
    );
  const size = finishedSize(input.frame);
  const shareX = size.width / input.guide.width;
  const shareY = size.height / input.guide.height;
  const { element, context } = board(size.width, size.height);
  context.drawImage(painting, 0, 0, element.width, element.height);
  const { rect } = input.guide;
  const width = rect.width * found.scale;
  const height = rect.height * found.scale;
  const where = {
    x: (rect.x + rect.width / 2 + found.dx - width / 2) * shareX,
    y: (rect.y + rect.height / 2 + found.dy - height / 2) * shareY,
    width: width * shareX,
    height: height * shareY,
  };
  const feather = Math.min(64, Math.max(3, Math.min(where.width, where.height) * 0.03));
  artworkOver(context, input.art, where, size, feather);
  return { canvas: element, found };
}
