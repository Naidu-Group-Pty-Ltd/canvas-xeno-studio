/**
 * A reel's cover, as a profile grid crops it. Instagram's profile grid shows
 * a 9:16 reel's cover at 3:4 (1080 × 1440 of its 1080 × 1920), centred
 * unless the crop is moved (Edit profile grid); TikTok's profile grid is
 * reported to crop its covers the same way. Reel 2's cover had everything on
 * it between y 192 and 1,500: centred, the grid's crop starts at y 240 and
 * cut the top 48 px of the Passport's border, and moved up to start at about
 * y 126 it kept the whole Passport and its caption.
 *
 * So what is on a cover is boxed (what stands apart from its ground, the
 * colour its edges are), and the grid's crop is checked against the box:
 * what the crop cuts centred, and where to move it to keep everything,
 * centred on what is there. A picture with no plain ground fills its frame,
 * and the crop shows its middle. Pure, so it is unit-testable; the Editor
 * reads a frame of a render into it (CoverCheck).
 */

/** The profile grid's crop: 3 wide by 4 high. */
export const GRID_CROP = { width: 3, height: 4 } as const;

/** How far a pixel may stand from the ground and still be ground (code values, any channel): a glow is ground. */
const GROUND_TOLERANCE = 24;
/** The share of a frame's edge that must be one colour for it to be a plain ground. */
const PLAIN_EDGE = 0.6;
/** A row or column is on the picture with at least this share of its pixels off the ground (and two pixels): not dither or a speck. */
const ROW_SHARE = 0.002;

/** What is on a frame, as a box (bottom and right exclusive), and the ground it stands on (#rrggbb, or null with none). */
export interface CoverContent {
  top: number;
  bottom: number;
  left: number;
  right: number;
  ground: string | null;
}

const hex = (rgb: number[]) =>
  `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

/**
 * What is on a frame of `width` × `height` pixels (`pixels`, RGBA as a
 * canvas gives them, or RGB with `channels` 3): its box against the ground,
 * the colour most of the frame's edge is. With no plain ground, the whole
 * frame; null for an empty one.
 */
export function coverContent(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  channels = 4,
): CoverContent | null {
  if (width < 3 || height < 3 || pixels.length < width * height * channels) return null;
  const at = (x: number, y: number) => (y * width + x) * channels;
  // The edge's colour: the median of each channel round the frame's border.
  const edge: number[][] = [[], [], []];
  const take = (x: number, y: number) => {
    const index = at(x, y);
    for (let channel = 0; channel < 3; channel += 1) edge[channel]!.push(pixels[index + channel]!);
  };
  for (let x = 0; x < width; x += 1) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y);
    take(width - 1, y);
  }
  const ground = edge.map((values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  });
  const isGround = (index: number) =>
    Math.abs(pixels[index]! - ground[0]!) <= GROUND_TOLERANCE &&
    Math.abs(pixels[index + 1]! - ground[1]!) <= GROUND_TOLERANCE &&
    Math.abs(pixels[index + 2]! - ground[2]!) <= GROUND_TOLERANCE;
  const count = edge[0]!.length;
  let plain = 0;
  for (let index = 0; index < count; index += 1)
    if (
      Math.abs(edge[0]![index]! - ground[0]!) <= GROUND_TOLERANCE &&
      Math.abs(edge[1]![index]! - ground[1]!) <= GROUND_TOLERANCE &&
      Math.abs(edge[2]![index]! - ground[2]!) <= GROUND_TOLERANCE
    )
      plain += 1;
  if (plain / count < PLAIN_EDGE)
    return { top: 0, bottom: height, left: 0, right: width, ground: null };
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (!isGround(at(x, y))) {
        rows[y] = rows[y]! + 1;
        columns[x] = columns[x]! + 1;
      }
  const rowLine = Math.max(2, Math.ceil(width * ROW_SHARE));
  const columnLine = Math.max(2, Math.ceil(height * ROW_SHARE));
  let top = 0;
  while (top < height && rows[top]! < rowLine) top += 1;
  if (top === height) return null;
  let bottom = height;
  while (rows[bottom - 1]! < rowLine) bottom -= 1;
  let left = 0;
  while (left < width && columns[left]! < columnLine) left += 1;
  let right = width;
  while (right > left && columns[right - 1]! < columnLine) right -= 1;
  return { top, bottom, left, right, ground: hex(ground) };
}

/** How the profile grid crops a cover of `width` × `height`, against what is on it. */
export interface GridCrop {
  /** Along which the grid crops: a 9:16 cover is cut top and bottom; none for a cover no taller (or wider) than 3:4. */
  axis: "vertical" | "horizontal" | null;
  /** How much of the axis the crop keeps, and where it starts centred (pixels). */
  size: number;
  centred: number;
  /** What the centred crop cuts of what is on the cover, before and after it (pixels). */
  cuts: { before: number; after: number };
  /** Centred, it keeps everything on the cover. */
  keepsAll: boolean;
  /**
   * Where to start the crop to keep everything, centred on it as far as the
   * frame allows (in Instagram, Edit profile grid): the centred start when it
   * already does, null when what is on it is larger than the crop.
   */
  keepsAllFrom: number | null;
}

/** The profile grid's 3:4 crop of a cover, judged against what is on it (coverContent). */
export function gridCrop(
  content: Pick<CoverContent, "top" | "bottom" | "left" | "right">,
  width: number,
  height: number,
): GridCrop {
  const aspect = GRID_CROP.width / GRID_CROP.height;
  const ratio = width / height;
  if (Math.abs(ratio - aspect) < 0.005)
    return {
      axis: null,
      size: height,
      centred: 0,
      cuts: { before: 0, after: 0 },
      keepsAll: true,
      keepsAllFrom: 0,
    };
  const vertical = ratio < aspect;
  const length = vertical ? height : width;
  const size = Math.round(vertical ? width / aspect : height * aspect);
  const centred = Math.round((length - size) / 2);
  const [from, to] = vertical ? [content.top, content.bottom] : [content.left, content.right];
  const cuts = { before: Math.max(0, centred - from), after: Math.max(0, to - (centred + size)) };
  const keepsAll = cuts.before === 0 && cuts.after === 0;
  let keepsAllFrom: number | null = null;
  if (keepsAll) keepsAllFrom = centred;
  else if (to - from <= size) {
    const middle = Math.round((from + to) / 2 - size / 2);
    keepsAllFrom = Math.min(Math.max(middle, to - size, 0), from, length - size);
  }
  return {
    axis: vertical ? "vertical" : "horizontal",
    size,
    centred,
    cuts,
    keepsAll,
    keepsAllFrom,
  };
}

const px = (value: number) => `${value} px`;

/** The grid's crop in plain words. */
export function gridCropText(crop: GridCrop, content: CoverContent): string {
  if (crop.axis === null) return "It is already 3:4, so the profile grid shows all of it.";
  const [first, last] = crop.axis === "vertical" ? ["top", "bottom"] : ["left", "right"];
  if (content.ground === null)
    return `It fills the frame, so the profile grid's 3:4 crop shows its middle ${px(crop.size)}, from ${px(crop.centred)} ${crop.axis === "vertical" ? "down" : "in"}.`;
  if (crop.keepsAll) return "In the profile grid's 3:4 crop, centred, everything on it shows.";
  const cut = [
    crop.cuts.before ? `${px(crop.cuts.before)} off the ${first}` : null,
    crop.cuts.after ? `${px(crop.cuts.after)} off the ${last}` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  if (crop.keepsAllFrom === null)
    return `What is on it is larger than the profile grid's 3:4 crop (${px(crop.size)}): centred, the crop cuts ${cut} of it, and some is cut wherever the crop is put.`;
  return `In the profile grid's 3:4 crop, centred, ${cut} of what is on it is cut. Moved to start ${px(crop.keepsAllFrom)} ${crop.axis === "vertical" ? "down" : "in"} (in Instagram, Edit profile grid), it keeps all of it.`;
}
