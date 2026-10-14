/**
 * Finding artwork in a picture an image model painted around it: where the
 * model left it (a few pixels off, a touch larger or smaller) and whether it
 * is still the same artwork. Plain arithmetic on grey levels, so it runs
 * anywhere; ./extend-artwork does the drawing.
 */

/** A picture's grey levels (0–255), row by row. */
export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

export interface Placement {
  /** How much larger the artwork is than where it was put (1: the same). */
  scale: number;
  /** How far its centre moved, in the picture's pixels. */
  dx: number;
  dy: number;
  /**
   * How alike the two are there: 1 when the painted picture shows the artwork
   * exactly (lighter or darker alike), lower as it differs, near 0 for
   * something else entirely. (Normalised cross-correlation.)
   */
  score: number;
}

/** Grey levels from RGBA pixels (Rec. 709 weights). */
export function grayOf(pixels: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    const at = index * 4;
    data[index] = 0.2126 * pixels[at]! + 0.7152 * pixels[at + 1]! + 0.0722 * pixels[at + 2]!;
  }
  return { width, height, data };
}

/** How alike `art` is to `picture` with its top left corner at (left, top); null if too little overlaps. */
function likeness(picture: Gray, art: Gray, left: number, top: number): number | null {
  const x0 = Math.max(0, -left);
  const y0 = Math.max(0, -top);
  const x1 = Math.min(art.width, picture.width - left);
  const y1 = Math.min(art.height, picture.height - top);
  if (x1 <= x0 || y1 <= y0) return null;
  // Most of the artwork must be inside the picture to say anything about it.
  if ((x1 - x0) * (y1 - y0) < art.width * art.height * 0.8) return null;
  let n = 0;
  let sa = 0;
  let sp = 0;
  let saa = 0;
  let spp = 0;
  let sap = 0;
  for (let y = y0; y < y1; y += 1) {
    const artRow = y * art.width;
    const pictureRow = (y + top) * picture.width + left;
    for (let x = x0; x < x1; x += 1) {
      const a = art.data[artRow + x]!;
      const p = picture.data[pictureRow + x]!;
      n += 1;
      sa += a;
      sp += p;
      saa += a * a;
      spp += p * p;
      sap += a * p;
    }
  }
  const varianceA = n * saa - sa * sa;
  const varianceP = n * spp - sp * sp;
  // Flat artwork (or a flat patch of picture) says nothing about where it is.
  if (varianceA <= n * n * 4 || varianceP <= 0) return null;
  return (n * sap - sa * sp) / Math.sqrt(varianceA * varianceP);
}

/**
 * Where the artwork is in the painted picture: tried at each of `arts` (the
 * artwork drawn at `expected`'s size times its scale), centred on `expected`
 * and moved up to `reach` pixels each way. The best match wins, a near tie
 * going to the smaller move, so a plain stretch of artwork doesn't drift.
 */
export function alignArtwork(
  picture: Gray,
  arts: { scale: number; gray: Gray }[],
  expected: { x: number; y: number; width: number; height: number },
  reach: { x: number; y: number },
): Placement | null {
  const centreX = expected.x + expected.width / 2;
  const centreY = expected.y + expected.height / 2;
  let best: (Placement & { rank: number }) | null = null;
  for (const { scale, gray } of arts) {
    const baseLeft = Math.round(centreX - gray.width / 2);
    const baseTop = Math.round(centreY - gray.height / 2);
    for (let dy = -reach.y; dy <= reach.y; dy += 1) {
      for (let dx = -reach.x; dx <= reach.x; dx += 1) {
        const score = likeness(picture, gray, baseLeft + dx, baseTop + dy);
        if (score === null) continue;
        const rank = score - 0.0004 * (Math.abs(dx) + Math.abs(dy)) - 0.02 * Math.abs(scale - 1);
        if (!best || rank > best.rank)
          best = {
            scale,
            dx: baseLeft + dx + gray.width / 2 - centreX,
            dy: baseTop + dy + gray.height / 2 - centreY,
            score,
            rank,
          };
      }
    }
  }
  if (!best) return null;
  return { scale: best.scale, dx: best.dx, dy: best.dy, score: best.score };
}
