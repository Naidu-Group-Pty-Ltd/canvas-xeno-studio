/**
 * Laying pictures out in frames in the browser, on a canvas: reframed images
 * (long videos' end cards have their own layout: see ./brand-card). The
 * picture itself is never changed, only where it sits, what fills the frame
 * around it, and the frame's size (see ./frame).
 */
import { containRect, coverCrop, hexColor, type FrameFit, type FramePoint } from "./frame";

export interface FrameLayout {
  width: number;
  height: number;
  fit: FrameFit;
  /** Filling the frame: the point of the picture kept in it. */
  focus?: FramePoint;
  /**
   * Around a whole picture: a colour (#rrggbb), "blur" (the picture itself,
   * blurred), or "auto": the picture's own edge colour when its edges are one
   * colour (a logo on its ground), else blur.
   */
  background?: string;
  /** How much of the frame a whole picture may fill, 0.1 to 1. */
  scale?: number;
}

export type Picture = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export function pictureSize(picture: Picture): { width: number; height: number } {
  if (typeof HTMLVideoElement !== "undefined" && picture instanceof HTMLVideoElement)
    return { width: picture.videoWidth, height: picture.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && picture instanceof HTMLImageElement)
    return { width: picture.naturalWidth, height: picture.naturalHeight };
  return { width: picture.width, height: picture.height };
}

/** Loads a picture (a signed storage URL) as data, so drawing it never taints the canvas. */
export async function loadPicture(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The image couldn't be loaded");
  const blob = await response.blob();
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Some formats only an <img> decodes; tried next.
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The image couldn't be read"));
    };
    image.src = objectUrl;
  });
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

/**
 * What a whole picture is shown on when its background is "auto": its edges'
 * colour when they are near one colour; for a picture with clear edges (a
 * logo cut out), black or white, whichever the picture stands out on; else
 * null, for a blurred fill.
 */
export function autoBackground(picture: Picture): string | null {
  const sample = 48;
  const board = canvas(sample, sample);
  const context = board.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(picture, 0, 0, sample, sample);
  const { data } = context.getImageData(0, 0, sample, sample);
  const edge: [number, number, number][] = [];
  let clear = 0;
  for (let index = 0; index < sample; index += 1) {
    for (const [x, y] of [
      [index, 0],
      [index, sample - 1],
      [0, index],
      [sample - 1, index],
    ] as const) {
      const at = (y * sample + x) * 4;
      if (data[at + 3]! < 40) clear += 1;
      else edge.push([data[at]!, data[at + 1]!, data[at + 2]!]);
    }
  }
  if (clear > edge.length) {
    // Cut out: dark marks go on white, light ones on black.
    let total = 0;
    let count = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 3]! < 40) continue;
      total += 0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!;
      count += 1;
    }
    return count && total / count < 110 ? "#ffffff" : "#000000";
  }
  if (!edge.length) return null;
  const mean = [0, 1, 2].map(
    (channel) => edge.reduce((sum, pixel) => sum + pixel[channel]!, 0) / edge.length,
  ) as [number, number, number];
  const spread =
    edge.reduce(
      (sum, pixel) =>
        sum +
        Math.abs(pixel[0] - mean[0]) +
        Math.abs(pixel[1] - mean[1]) +
        Math.abs(pixel[2] - mean[2]),
      0,
    ) /
    (edge.length * 3);
  return spread < 14 ? `#${hex(mean[0])}${hex(mean[1])}${hex(mean[2])}` : null;
}

/**
 * The picture, blurred and a little darkened, filling the frame: a soft
 * backdrop for the whole picture on top. A browser without canvas filters
 * blurs it by drawing it tiny and scaling it back up.
 */
function drawBlurred(
  context: CanvasRenderingContext2D,
  picture: Picture,
  frame: { width: number; height: number },
) {
  const crop = coverCrop(pictureSize(picture), frame);
  const radius = Math.max(4, Math.round(Math.max(frame.width, frame.height) / 40));
  if (typeof context.filter === "string") {
    context.filter = `blur(${radius}px)`;
    // Drawn past the edges, so the blur doesn't fade out at them.
    context.drawImage(
      picture,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -2 * radius,
      -2 * radius,
      frame.width + 4 * radius,
      frame.height + 4 * radius,
    );
    context.filter = "none";
  } else {
    const small = canvas(Math.max(4, frame.width / 24), Math.max(4, frame.height / 24));
    const smallContext = small.getContext("2d");
    if (!smallContext) return;
    smallContext.imageSmoothingQuality = "high";
    smallContext.drawImage(
      picture,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      small.width,
      small.height,
    );
    context.drawImage(small, 0, 0, frame.width, frame.height);
  }
  context.fillStyle = "rgba(0, 0, 0, 0.25)";
  context.fillRect(0, 0, frame.width, frame.height);
}

/** Draws a picture into a frame as laid out. */
export function drawFrame(
  context: CanvasRenderingContext2D,
  picture: Picture,
  layout: FrameLayout,
): void {
  const frame = { width: layout.width, height: layout.height };
  const source = pictureSize(picture);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, frame.width, frame.height);
  if (layout.fit === "cover") {
    const crop = coverCrop(source, frame, layout.focus);
    context.drawImage(
      picture,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      frame.width,
      frame.height,
    );
  } else {
    const wanted = layout.fit === "blur_pad" ? "blur" : (layout.background ?? "#000000");
    const background =
      wanted === "auto" ? (autoBackground(picture) ?? "blur") : (hexColor(wanted) ?? wanted);
    if (background === "blur") drawBlurred(context, picture, frame);
    else {
      context.fillStyle = hexColor(background) ?? "#000000";
      context.fillRect(0, 0, frame.width, frame.height);
    }
    const rect = containRect(source, frame, layout.scale ?? 1);
    context.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
  }
  context.restore();
}

/** A picture laid out in a frame, as a file. */
export async function composeFrame(
  picture: Picture,
  layout: FrameLayout,
  type: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<Blob> {
  const board = canvas(layout.width, layout.height);
  const context = board.getContext("2d");
  if (!context) throw new Error("This browser can't lay out images");
  drawFrame(context, picture, layout);
  return new Promise((resolve, reject) =>
    board.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be saved"))),
      type,
      type === "image/png" ? undefined : 0.92,
    ),
  );
}
