/**
 * Finding artwork in a picture an image model painted around it: where the
 * model left it (a few pixels off, a touch larger or smaller) and whether it
 * is still the same artwork; and whether the model filled the empty canvas it
 * was given. Plain arithmetic on pixels, so it runs anywhere; ./artwork-canvas
 * does the drawing.
 */

/** A picture's grey levels (0–255), row by row. */
export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

/** A rectangle in a picture's pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
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
  expected: Box,
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

/**
 * How much of a painting is still the empty canvas it was given (`pad`, one
 * flat colour), which a model can leave unpainted:
 *   - `open`: of the blocks of picture clear of the artwork (more than `seam`
 *     pixels from it), the share that are nearly all still that colour. Whole
 *     blocks, so a small highlight that happens to be the pad's colour isn't
 *     taken for empty canvas;
 *   - `seam`: of the pixels in the band just around the artwork, the share
 *     still that colour, where the model can leave a hairline gap. A pixel
 *     next to an edge of the artwork that is itself that colour is the
 *     artwork carrying on, not a gap, and isn't counted.
 */
export function padResidue(input: {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Where the artwork is. */
  art: Box;
  pad: [number, number, number];
  seam: number;
  /** How close to the pad colour counts as it, per channel. */
  tolerance?: number;
  /** The side of a block, in pixels. */
  block?: number;
}): { open: number; seam: number } {
  const { pixels, width, height, art, pad, seam } = input;
  const tolerance = input.tolerance ?? 14;
  const block = input.block ?? 24;
  const isPad = (x: number, y: number) => {
    const at = (y * width + x) * 4;
    return (
      Math.abs(pixels[at]! - pad[0]) <= tolerance &&
      Math.abs(pixels[at + 1]! - pad[1]) <= tolerance &&
      Math.abs(pixels[at + 2]! - pad[2]) <= tolerance
    );
  };
  const left = art.x;
  const right = art.x + art.width;
  const top = art.y;
  const bottom = art.y + art.height;
  // The artwork's own pixels: its first and last whole rows and columns.
  const firstX = Math.max(0, Math.ceil(left));
  const lastX = Math.min(width - 1, Math.floor(right) - 1);
  const firstY = Math.max(0, Math.ceil(top));
  const lastY = Math.min(height - 1, Math.floor(bottom) - 1);

  let seamTotal = 0;
  let seamPad = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // How far outside the artwork this pixel is (0 inside it).
      const out = Math.max(left - x, x + 1 - right, top - y, y + 1 - bottom, 0);
      if (out <= 0 || out > seam) continue;
      const edgeX = Math.min(lastX, Math.max(firstX, x));
      const edgeY = Math.min(lastY, Math.max(firstY, y));
      if (lastX >= firstX && lastY >= firstY && isPad(edgeX, edgeY)) continue;
      seamTotal += 1;
      if (isPad(x, y)) seamPad += 1;
    }
  }

  let openBlocks = 0;
  let emptyBlocks = 0;
  for (let by = 0; by + block <= height; by += block) {
    for (let bx = 0; bx + block <= width; bx += block) {
      // Only blocks wholly clear of the artwork and the band around it.
      const clear =
        bx + block <= left - seam ||
        bx >= right + seam ||
        by + block <= top - seam ||
        by >= bottom + seam;
      if (!clear) continue;
      openBlocks += 1;
      let samples = 0;
      let padded = 0;
      for (let y = by; y < by + block; y += 3)
        for (let x = bx; x < bx + block; x += 3) {
          samples += 1;
          if (isPad(x, y)) padded += 1;
        }
      if (padded >= samples * 0.9) emptyBlocks += 1;
    }
  }
  return {
    open: openBlocks ? emptyBlocks / openBlocks : 0,
    seam: seamTotal ? seamPad / seamTotal : 0,
  };
}
