import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { asImage } from "./colour.js";
import { ffmpeg } from "./ffmpeg.js";
import { TaskError } from "./net.js";

/**
 * Frame-exact work on a clip's own frames, for chaining clips into one shot.
 *
 * A clip's frames are counted by decoding them, never guessed from its
 * container's duration or from timestamps (which can be offset, rounded or
 * longer than the picture when the sound runs on). That gives the true last
 * frame, what the clip's tail does (frames frozen on one picture, or a fade),
 * and where the camera was heading as the clip ended, so the next clip can
 * carry the same move on.
 */

/** Longest side of the thumbnails the clip is analysed at. */
const THUMB_LONG_SIDE = 192;
/** A frame this close to the one before it (mean absolute difference, 0-255) shows nothing new. */
const FROZEN_DIFFERENCE = 0.22;
/** At most this much of a frozen or fading tail is left out, in seconds. */
const MAX_TRIM_SECONDS = 0.75;
/** How far back the camera's move is read, in seconds. */
const MOTION_WINDOW_SECONDS = 1;

/**
 * Decodes every frame of a video's first picture stream as small grey
 * thumbnails, in display order. Returns the frames and their size.
 */
export async function decodeThumbnails(path, dir, { width, height }) {
  const landscape = !width || !height || width >= height;
  const ratio = width && height ? width / height : 16 / 9;
  const w = landscape ? THUMB_LONG_SIDE : Math.max(16, Math.round(THUMB_LONG_SIDE * ratio));
  const h = landscape ? Math.max(16, Math.round(THUMB_LONG_SIDE / ratio)) : THUMB_LONG_SIDE;
  const out = join(dir, `thumbs-${Date.now().toString(36)}.gray`);
  await ffmpeg([
    "-i", path,
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-vf", `scale=${w}:${h}:flags=area,format=gray`,
    // Every decoded frame exactly once: nothing duplicated or dropped to fit a rate.
    "-fps_mode", "passthrough",
    "-f", "rawvideo",
    out,
  ]);
  const data = await readFile(out);
  await rm(out, { force: true });
  const size = w * h;
  const count = Math.floor(data.length / size);
  if (count < 1) throw new TaskError("RENDER_FAILED", "The video has no frames that could be read");
  return { data, count, width: w, height: h };
}

function frameOf(thumbs, index) {
  const size = thumbs.width * thumbs.height;
  return thumbs.data.subarray(index * size, (index + 1) * size);
}

function meanOf(frame) {
  let total = 0;
  for (let i = 0; i < frame.length; i += 1) total += frame[i];
  return total / frame.length;
}

function spreadOf(frame, mean) {
  let total = 0;
  for (let i = 0; i < frame.length; i += 1) total += (frame[i] - mean) ** 2;
  return Math.sqrt(total / frame.length);
}

function difference(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

/** How alike two frames' pictures are once brightness and contrast are set aside: 1 is the same picture. */
function likeness(a, b) {
  const ma = meanOf(a);
  const mb = meanOf(b);
  const sa = spreadOf(a, ma);
  const sb = spreadOf(b, mb);
  if (sa < 1e-3 || sb < 1e-3) return 1;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += (a[i] - ma) * (b[i] - mb);
  return total / (a.length * sa * sb);
}

/**
 * The frame a clip's handoff should be: its true last frame, unless its tail
 * is frozen on one picture (then the first frame of that freeze, the same
 * picture, so the hold isn't played before the next clip starts) or fades to
 * black or white (then the last frame before the fade). Never more than
 * MAX_TRIM_SECONDS from the end.
 */
export function pickHandoffFrame(thumbs, fps) {
  const last = thumbs.count - 1;
  const most = Math.max(0, Math.round(MAX_TRIM_SECONDS * (fps > 0 ? fps : 24)));
  const floor = Math.max(0, last - most);

  // Frozen: the last frames show nothing new, after a clip that was moving.
  // (A shot that was still all along keeps its true last frame.)
  let frozen = last;
  while (frozen > floor && difference(frameOf(thumbs, frozen), frameOf(thumbs, frozen - 1)) < FROZEN_DIFFERENCE) frozen -= 1;
  if (frozen < last) {
    const before = Math.max(1, frozen - Math.max(2, most));
    let activity = 0;
    let pairs = 0;
    for (let index = before; index <= frozen; index += 1) {
      activity += difference(frameOf(thumbs, index), frameOf(thumbs, index - 1));
      pairs += 1;
    }
    if (!pairs || activity / pairs < FROZEN_DIFFERENCE * 3) frozen = last;
  }
  const frozenFrames = last - frozen;

  // Fading: the same picture losing its contrast towards black or white.
  let faded = 0;
  const reference = Math.max(0, last - most);
  if (reference < frozen) {
    const start = frameOf(thumbs, reference);
    const end = frameOf(thumbs, frozen);
    const startMean = meanOf(start);
    const endMean = meanOf(end);
    const startSpread = spreadOf(start, startMean);
    const endSpread = spreadOf(end, endMean);
    const towardsBlack = endMean < startMean * 0.55;
    const towardsWhite = endMean > startMean + 0.5 * (255 - startMean);
    if ((towardsBlack || towardsWhite) && endSpread < startSpread * 0.45 && likeness(start, end) > 0.9) {
      // Back to the last frame still close to the picture before the fade began.
      let index = frozen;
      while (index > reference) {
        const frame = frameOf(thumbs, index);
        const mean = meanOf(frame);
        if (Math.abs(mean - startMean) <= Math.max(4, Math.abs(startMean) * 0.08)) break;
        index -= 1;
      }
      faded = frozen - index;
      frozen = index;
    }
  }
  return { index: frozen, frozenFrames, fadedFrames: faded };
}

/**
 * Block motion between two thumbnails: for each textured block of `a`, where
 * it moved to in `b`, as offsets from the picture's centre.
 */
function blockMotion(thumbs, a, b) {
  const { width: w, height: h } = thumbs;
  const block = 12;
  const reach = 8;
  const vectors = [];
  for (let by = reach; by + block + reach <= h; by += 6) {
    for (let bx = reach; bx + block + reach <= w; bx += 6) {
      let mean = 0;
      for (let y = 0; y < block; y += 1) for (let x = 0; x < block; x += 1) mean += a[(by + y) * w + bx + x];
      mean /= block * block;
      let texture = 0;
      for (let y = 0; y < block; y += 1) for (let x = 0; x < block; x += 1) texture += (a[(by + y) * w + bx + x] - mean) ** 2;
      // Flat blocks (sky, walls, black) can't say where they went.
      if (texture / (block * block) < 8) continue;
      let best = Infinity;
      let still = Infinity;
      let dx = 0;
      let dy = 0;
      for (let oy = -reach; oy <= reach; oy += 1) {
        for (let ox = -reach; ox <= reach; ox += 1) {
          let cost = 0;
          for (let y = 0; y < block && cost < best; y += 1) {
            const rowA = (by + y) * w + bx;
            const rowB = (by + y + oy) * w + bx + ox;
            for (let x = 0; x < block; x += 1) cost += Math.abs(a[rowA + x] - b[rowB + x]);
          }
          if (ox === 0 && oy === 0) still = cost;
          if (cost < best) {
            best = cost;
            dx = ox;
            dy = oy;
          }
        }
      }
      // A move barely better than standing still is noise.
      if (best >= still * 0.97) {
        dx = 0;
        dy = 0;
      }
      vectors.push({ x: bx + block / 2 - w / 2, y: by + block / 2 - h / 2, dx, dy });
    }
  }
  return vectors;
}

/** Translation and scale (about the centre) that best explain block motion. */
function fitMotion(vectors) {
  if (vectors.length < 8) return null;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sdx = 0;
  let sdy = 0;
  let spp = 0;
  let spd = 0;
  for (const v of vectors) {
    n += 1;
    sx += v.x;
    sy += v.y;
    sdx += v.dx;
    sdy += v.dy;
    spp += v.x * v.x + v.y * v.y;
    spd += v.x * v.dx + v.y * v.dy;
  }
  const mx = sx / n;
  const my = sy / n;
  const spread = spp / n - (mx * mx + my * my);
  const scale = spread > 1e-6 ? (spd / n - (mx * sdx + my * sdy) / n) / spread : 0;
  return { tx: sdx / n - scale * mx, ty: sdy / n - scale * my, scale };
}

const SPEEDS = [
  { name: "slow", below: 0.35 },
  { name: "steady", below: 1 },
  { name: "fast", below: Infinity },
];

/**
 * Where the camera was heading as a clip ended, read from its last second:
 * pushing in or pulling back, and panning or tilting, each with how fast (in
 * share of the frame per second). Null when it can't be told (too few frames
 * or too little texture to follow).
 */
export function cameraMotion(thumbs, endIndex, fps) {
  const rate = fps > 0 ? fps : 24;
  // Frames a little apart, so slow moves show in whole pixels and fast ones
  // stay within the search.
  const stride = Math.max(1, Math.round(rate / 12));
  const first = Math.max(0, endIndex - Math.round(MOTION_WINDOW_SECONDS * rate));
  const fits = [];
  for (let index = first + stride; index <= endIndex; index += stride) {
    const fit = fitMotion(blockMotion(thumbs, frameOf(thumbs, index - stride), frameOf(thumbs, index)));
    if (fit) fits.push(fit);
  }
  if (fits.length < 2) return null;
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const perSecond = rate / stride;
  // Share of the frame per second: a pan across the whole width in 1 s is 1.
  const panX = (-median(fits.map((fit) => fit.tx)) / thumbs.width) * perSecond;
  const panY = (-median(fits.map((fit) => fit.ty)) / thumbs.height) * perSecond;
  const zoom = median(fits.map((fit) => fit.scale)) * perSecond;
  const speedOf = (value) => SPEEDS.find((speed) => Math.abs(value) < speed.below).name;
  const moves = [];
  // Zoom: the picture growing 3% a second is a slow push; under 1.5% is still.
  if (Math.abs(zoom) >= 0.015) moves.push({ kind: zoom > 0 ? "push_in" : "pull_out", speed: speedOf(zoom * 4) });
  if (Math.abs(panX) >= 0.03) moves.push({ kind: panX > 0 ? "pan_right" : "pan_left", speed: speedOf(panX * 2) });
  if (Math.abs(panY) >= 0.03) moves.push({ kind: panY > 0 ? "tilt_down" : "tilt_up", speed: speedOf(panY * 2) });
  return {
    moves,
    still: moves.length === 0,
    zoom_per_second: Number(zoom.toFixed(4)),
    pan_x_per_second: Number(panX.toFixed(4)),
    pan_y_per_second: Number(panY.toFixed(4)),
  };
}

/**
 * One frame, chosen by its number in display order (0 is the first), at the
 * clip's own size unless `width` asks for another, its colour as a player
 * shows it (`source` is the video's probe; see ./colour.js). PNG keeps it
 * exactly as decoded; JPEG is for frames too large to send as PNG.
 */
export async function extractFrameByIndex(path, index, out, { width = null, sourceWidth = null, format = "png", source = null } = {}) {
  const filters = [`select=eq(n\\,${index})`];
  const colour = asImage(source, format);
  filters.push(width && width !== sourceWidth ? `scale=${width}:-2:flags=lanczos:${colour}` : `scale=${colour}`);
  await ffmpeg([
    "-i", path,
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-vf", filters.join(","),
    "-fps_mode", "passthrough",
    "-frames:v", "1",
    ...(format === "png" ? ["-c:v", "png", "-pred", "mixed"] : ["-q:v", "1"]),
    out,
  ]);
}
