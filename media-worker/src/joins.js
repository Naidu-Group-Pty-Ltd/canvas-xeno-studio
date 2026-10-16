import { join } from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";
import { ffmpeg } from "./ffmpeg.js";
import { alignFrames, detailLevel, downscale } from "./align.js";
import { easedLooksChain, seamCorrection } from "./seam.js";

/**
 * Smart joins: a clip that carries straight on from the one before it (a long
 * video's join, the second clip generated from the frame the first ends on)
 * put back in register with it, so the cut can't be seen.
 *
 * The second clip re-renders that frame, and the re-render is never quite the
 * same picture. Measured on real joins: it is resized by a few percent (video
 * models fit their start image to their own working size, so the picture comes
 * back stretched from a corner and shows a little more on one side), a little
 * lighter or darker, and softer. Each of these is measured on the two frames
 * of the moment the clips share, and put right:
 *
 *   - framing: the next clip's picture is warped onto the frame before it (an
 *     affine map, fitted coarse to fine; see ./align.js), and the warp eases
 *     off over a few seconds, slowly enough that the drift back to the clip's
 *     own framing can't be seen. A warp only ever moves picture the clip has:
 *     where the next clip lacks part of the one before (it was cropped), the
 *     clip before eases into the shared framing over its last moments instead.
 *   - colour: matched on the two frames once they are in register (see
 *     ./seam.js), easing off as a colour join does.
 *   - detail: the next clip's start is sharpened (or softened) to the clip
 *     before's, measured on the frames as they will be shown, easing off with
 *     the colour.
 *   - sound: the two clips' own sound meet with a fade of a few milliseconds
 *     each side, so a cut between two waveforms can't click.
 *
 * Nothing changes at a join whose two frames aren't the same picture, and a
 * fit that doesn't clearly improve how alike they are is not used.
 *
 * Coordinates are continuous, with (0, 0) at a frame's top-left corner and
 * pixel i's centre at i + 0.5. An affine map is { m: [a, b, c, d], t: [x, y] }:
 * the point (x, y) goes to (a x + b y + tx, c x + d y + ty). A warp samples its
 * source at the map of each point of the picture it makes.
 */

/** How long the colour and detail match take to ease off, in seconds. */
export const JOIN_EASE_SECONDS = 2.5;
/** The fade each side of a smart cut in the clips' own sound, in seconds. */
export const JOIN_SOUND_SECONDS = 0.01;
/** Frames are compared at about this size along their longer side. */
const ANALYSIS_SIZE = 480;
/** How alike two frames must be once in register (1 is identical) for the fit to be trusted. */
const MIN_ALIGNED_LIKENESS = 0.85;
/** The least a fit must improve how alike the frames are to be worth a warp. */
const MIN_IMPROVEMENT = 0.003;
/** How alike two frames must be to be the same picture, for colour and detail. */
const SAME_PICTURE = 0.82;
/** The largest re-render a fit may undo: scale and shear change, and shift as a share of the frame. */
const FIT_LIMITS = { scale: 0.1, shear: 0.04, shift: 0.1 };
/** A warp that moves no corner this far (output pixels) isn't worth making. */
const MIN_MOVE = 0.35;
/** Picture the next clip lacks, up to this far (output pixels), is left to its edge pixels. */
const EDGE_ALLOWANCE = 0.75;
/** How fast a warp eases off at most: a share of the frame per second, at the fastest point. */
const DRIFT_PER_SECOND = 0.008;
const WARP_SECONDS = { min: 1.5, max: 8 };
/** Detail within this ratio of the clip before's is left alone; amounts are capped. */
const DETAIL = { low: 0.9, high: 1.11, min: -0.6, max: 1, least: 0.08 };

/* ------------------------------------------------------------------ */
/* Affine maps                                                         */
/* ------------------------------------------------------------------ */

export const IDENTITY_MAP = Object.freeze({ m: [1, 0, 0, 1], t: [0, 0] });

export function applyMap(map, x, y) {
  const [a, b, c, d] = map.m;
  return [a * x + b * y + map.t[0], c * x + d * y + map.t[1]];
}

/** The map that undoes `map`. */
export function invertMap(map) {
  const [a, b, c, d] = map.m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) throw new Error("A join's map can't be undone");
  const m = [d / det, -b / det, -c / det, a / det];
  const [tx, ty] = map.t;
  return { m, t: [-(m[0] * tx + m[1] * ty), -(m[2] * tx + m[3] * ty)] };
}

/** `outer` after `inner`: a point goes through `inner` first. */
export function composeMaps(outer, inner) {
  const [a, b, c, d] = outer.m;
  const [e, f, g, h] = inner.m;
  const [tx, ty] = applyMap(outer, inner.t[0], inner.t[1]);
  return { m: [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h], t: [tx, ty] };
}

/** The map as a share of the way from no change: 0 is none, 1 is all of it. */
export function partOfMap(map, share) {
  return {
    m: map.m.map((value, index) => (index === 0 || index === 3 ? 1 + (value - 1) * share : value * share)),
    t: map.t.map((value) => value * share),
  };
}

function corners(width, height) {
  return [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
}

/**
 * How far a map moves the frame's corners: the most in output pixels, and the
 * most as a share of the frame's width (across) or height (down).
 */
export function mapReach(map, width, height) {
  let pixels = 0;
  let share = 0;
  for (const [x, y] of corners(width, height)) {
    const [mx, my] = applyMap(map, x, y);
    pixels = Math.max(pixels, Math.abs(mx - x), Math.abs(my - y));
    share = Math.max(share, Math.abs(mx - x) / width, Math.abs(my - y) / height);
  }
  return { pixels, share };
}

/**
 * The fit (from ./align.js, made on frames downscaled by `factor`) as a map
 * in the output frame's own pixels: a point of the frame before goes to where
 * the next clip's frame shows it.
 */
export function mapFromFit(fit, factor, analysisWidth, analysisHeight) {
  const { a, b, c, d, tx, ty } = fit;
  const m = [1 + a, b, c, 1 + d];
  // About the analysis frame's centre, in its pixels; then scaled up.
  const cx = analysisWidth / 2;
  const cy = analysisHeight / 2;
  const ox = cx + tx - (m[0] * cx + m[1] * cy);
  const oy = cy + ty - (m[2] * cx + m[3] * cy);
  return { m, t: [ox * factor, oy * factor] };
}

/** Whether a fit stays within what a re-render does; a larger one is a misfit. */
export function fitIsPlausible(fit) {
  const { a, b, c, d } = fit.map;
  return (
    Math.abs(a) <= FIT_LIMITS.scale &&
    Math.abs(d) <= FIT_LIMITS.scale &&
    Math.abs(b) <= FIT_LIMITS.shear &&
    Math.abs(c) <= FIT_LIMITS.shear &&
    Math.abs(fit.map.tx) <= FIT_LIMITS.shift * fit.width &&
    Math.abs(fit.map.ty) <= FIT_LIMITS.shift * fit.height
  );
}

/**
 * How the two clips are warped to meet, given `toNext`: the map from the
 * frame before's points to where the next clip's frame shows them. The next
 * clip is warped by `next` and the clip before by `previous` (either null when
 * it needn't move), and both only ever sample picture their clip has.
 *
 * The meeting framing is the part of the frame before that the next clip also
 * shows: the clip before fills the frame with that part (no change when the
 * next shows all of it, which is usual), and the next clip is warped onto it.
 */
export function planWarps(toNext, width, height) {
  const back = invertMap(toNext);
  // Where the next frame's corners are in the frame before.
  const [tl, tr, bl, br] = corners(width, height).map(([x, y]) => applyMap(back, x, y));
  let left = Math.max(0, tl[0], bl[0]);
  let right = Math.min(width, tr[0], br[0]);
  let top = Math.max(0, tl[1], tr[1]);
  let bottom = Math.min(height, bl[1], br[1]);
  // A sliver the next clip lacks is left to its edge pixels.
  if (left <= EDGE_ALLOWANCE) left = 0;
  if (width - right <= EDGE_ALLOWANCE) right = width;
  if (top <= EDGE_ALLOWANCE) top = 0;
  if (height - bottom <= EDGE_ALLOWANCE) bottom = height;
  if (right - left < width * 0.8 || bottom - top < height * 0.8) return null;
  const previous = { m: [(right - left) / width, 0, 0, (bottom - top) / height], t: [left, top] };
  const next = composeMaps(toNext, previous);
  const moves = (map) => mapReach(map, width, height).pixels >= MIN_MOVE;
  return { previous: moves(previous) ? previous : null, next: moves(next) ? next : null };
}

/** How many frames a warp takes to ease off: longer the more it moves, within the time there is. */
export function warpFrames(map, width, height, fps, room) {
  const { share } = mapReach(map, width, height);
  // Smoothstep is fastest halfway, at 1.5x its average pace.
  const seconds = Math.min(WARP_SECONDS.max, Math.max(WARP_SECONDS.min, (1.5 * share) / DRIFT_PER_SECOND));
  return Math.max(2, Math.min(Math.round(seconds * fps), room));
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

const fixed = (value) => Number(value.toFixed(4)).toString();

/**
 * The source points FFmpeg's perspective filter sends to the output's four
 * corners (top-left, top-right, bottom-left, bottom-right) for `map`. Its
 * corners are on pixel indices (pixel i at i, the far edge at W), so the map
 * is moved half a pixel each way.
 */
export function perspectiveCorners(map, width, height) {
  return corners(width, height).map(([x, y]) => {
    const [mx, my] = applyMap(map, x + 0.5, y + 0.5);
    return [mx - 0.5, my - 0.5];
  });
}

/** A perspective filter making `map` at once, for measuring a frame as it will be shown. */
export function warpFilter(map, width, height) {
  const points = perspectiveCorners(map, width, height);
  const options = points.map(([x, y], index) => `x${index}=${fixed(x)}:y${index}=${fixed(y)}`).join(":");
  return `perspective=${options}:interpolation=cubic:sense=source`;
}

/**
 * A perspective filter that eases `map` in or out over `frames` frames:
 * "out" starts with all of it on the first frame and is gone by frame
 * `frames`; "in" reaches all of it on the clip's last frame (of `total`).
 * Frames outside the ease pass through untouched. The ease is a smoothstep,
 * so the drift starts and ends at rest. (FFmpeg's `in` counts frames from 1.)
 */
export function easedWarpFilter(map, width, height, { frames, direction, total }) {
  const start = direction === "out" ? 0 : total - 1 - frames;
  const progress = `clip((in-1-${start})/${frames},0,1)`;
  const smooth = `(3*pow(${progress},2)-2*pow(${progress},3))`;
  const weight = direction === "out" ? `(1-${smooth})` : smooth;
  const points = perspectiveCorners(map, width, height);
  const options = points
    .map(([x, y], index) => {
      const [ox, oy] = corners(width, height)[index];
      return `x${index}='${ox}+(${fixed(x - ox)})*${weight}':y${index}='${oy}+(${fixed(y - oy)})*${weight}'`;
    })
    .join(":");
  const enable = direction === "out" ? `lt(n,${frames})` : `gt(n,${start})`;
  return `perspective=${options}:interpolation=cubic:sense=source:eval=frame:enable='${enable}'`;
}

/**
 * Filtergraph lines that put the start of the next clip (`input`) in register
 * with the clip before: its warp easing off, and its colour and detail match
 * easing off in steps too small to see (see ./seam.js). Frames past both
 * eases pass through untouched.
 */
export function joinHeadChain(input, output, head, tag) {
  const lines = [];
  let current = input;
  if (head.warp) {
    lines.push(`[${current}]${easedWarpFilter(head.warp.map, head.width, head.height, { frames: head.warp.frames, direction: "out" })}[${tag}w]`);
    current = `${tag}w`;
  }
  const levels = head.correction?.levels ?? null;
  const amount = head.sharpen?.amount ?? null;
  if ((levels || amount) && head.frames >= 2) {
    lines.push(easedLooksChain(current, output, { levels, amount, frames: head.frames }));
  } else {
    lines.push(`[${current}]null[${output}]`);
  }
  return lines.join(";");
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

/** The [1 4 6 4 1] blur FFmpeg's unsharp filter makes at size 5, edges held. */
function unsharpBlur(plane, width, height) {
  const across = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const at = (value, limit) => Math.max(0, Math.min(limit - 1, value));
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      across[row + x] =
        (plane[row + at(x - 2, width)] +
          4 * plane[row + at(x - 1, width)] +
          6 * plane[row + x] +
          4 * plane[row + at(x + 1, width)] +
          plane[row + at(x + 2, width)]) /
        16;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] =
        (across[at(y - 2, height) * width + x] +
          4 * across[at(y - 1, height) * width + x] +
          6 * across[y * width + x] +
          4 * across[at(y + 1, height) * width + x] +
          across[at(y + 2, height) * width + x]) /
        16;
    }
  }
  return out;
}

/**
 * The unsharp amount that gives `plane` the fine detail `target` (as
 * ./align.js's detailLevel measures it), or null when it already has about
 * that much. Unsharp adds `amount` x (picture - blur), and the measure is the
 * mean square of a Laplacian, which is linear, so the detail at any amount is
 * a quadratic in it, solved here directly.
 */
export function sharpenAmount(plane, width, height, target, margin) {
  const current = detailLevel(plane, width, height, margin);
  if (!(current > 0) || !(target > 0)) return null;
  const ratio = current / target;
  if (ratio >= DETAIL.low && ratio <= DETAIL.high) return null;
  const blur = unsharpBlur(plane, width, height);
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  let count = 0;
  const edge = Math.max(1, margin);
  for (let y = edge; y < height - edge; y += 1) {
    for (let x = edge; x < width - edge; x += 1) {
      const i = y * width + x;
      const lx = plane[i - 1] + plane[i + 1] + plane[i - width] + plane[i + width] - 4 * plane[i];
      const high = (k) => plane[k] - blur[k];
      const lh = high(i - 1) + high(i + 1) + high(i - width) + high(i + width) - 4 * high(i);
      e0 += lx * lx;
      e1 += lx * lh;
      e2 += lh * lh;
      count += 1;
    }
  }
  if (!count || e2 < 1e-9) return null;
  e0 /= count;
  e1 /= count;
  e2 /= count;
  // e2 a^2 + 2 e1 a + (e0 - target) = 0. The detail is least at -e1 / e2 (a
  // little below no change), so the root nearest no change is the upper one,
  // whether the picture is sharpened or softened; softer than the least it
  // can be made, it is softened as far as that.
  const discriminant = e1 * e1 - e2 * (e0 - target);
  const amount = discriminant < 0 ? -e1 / e2 : (-e1 + Math.sqrt(discriminant)) / e2;
  const capped = Math.max(DETAIL.min, Math.min(DETAIL.max, amount));
  if (!Number.isFinite(capped) || Math.abs(capped) < DETAIL.least) return null;
  return { amount: Number(capped.toFixed(3)), ratio: Number(ratio.toFixed(3)) };
}

/* ------------------------------------------------------------------ */
/* Measuring a join                                                    */
/* ------------------------------------------------------------------ */

/** One frame as raw planes (Y, U, V at full size each), laid out like the render. */
async function framePlanes(input, filters, width, height, dir, tag) {
  const out = join(dir, `join-${tag}-${Date.now().toString(36)}.yuv`);
  await ffmpeg([
    ...input,
    "-filter_complex", `${filters}format=yuv444p[frame]`,
    "-map", "[frame]",
    "-fps_mode", "passthrough",
    "-frames:v", "1",
    "-f", "rawvideo",
    out,
  ]);
  const data = await readFile(out);
  await rm(out, { force: true });
  const size = width * height;
  if (data.length < size * 3) throw new Error("A join's frame came out the wrong size");
  return { y: data.subarray(0, size), u: data.subarray(size, size * 2), v: data.subarray(size * 2, size * 3) };
}

/** A plane as it will be shown after `map` (null: as it is), warped by FFmpeg itself. */
async function shownPlane(plane, map, width, height, dir, tag) {
  if (!map) return plane;
  const source = join(dir, `join-${tag}-${Date.now().toString(36)}.gray`);
  const out = `${source}.out`;
  await writeFile(source, plane);
  await ffmpeg([
    "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${width}x${height}`, "-i", source,
    "-vf", warpFilter(map, width, height),
    "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "gray",
    out,
  ]);
  const data = await readFile(out);
  await rm(source, { force: true });
  await rm(out, { force: true });
  if (data.length < width * height) throw new Error("A join's frame came out the wrong size");
  return data.subarray(0, width * height);
}

/** Bilinear sample of a plane at a continuous point, the edge held; NaN well outside. */
function sampleHeld(plane, width, height, px, py) {
  const x = px - 0.5;
  const y = py - 0.5;
  if (x < -1 || y < -1 || x > width || y > height) return Number.NaN;
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.min(width - 2, Math.floor(cx));
  const y0 = Math.min(height - 2, Math.floor(cy));
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * width + x0;
  return (
    plane[i] * (1 - fx) * (1 - fy) +
    plane[i + 1] * fx * (1 - fy) +
    plane[i + width] * (1 - fx) * fy +
    plane[i + width + 1] * fx * fy
  );
}

/**
 * The two frames' planes as they will meet (each warped by its map, at the
 * analysis size), over the points both show, for matching colour.
 */
function meetingPlanes(target, current, maps, size) {
  const { width, height, factor } = size;
  const scaled = (map) => (map ? { m: map.m, t: map.t.map((value) => value / factor) } : null);
  const previous = scaled(maps.previous);
  const next = scaled(maps.next);
  const out = { target: { y: [], u: [], v: [] }, current: { y: [], u: [], v: [] } };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [px, py] = previous ? applyMap(previous, x + 0.5, y + 0.5) : [x + 0.5, y + 0.5];
      const [nx, ny] = next ? applyMap(next, x + 0.5, y + 0.5) : [x + 0.5, y + 0.5];
      const values = [];
      for (const plane of ["y", "u", "v"]) {
        const a = sampleHeld(target[plane].data, width, height, px, py);
        const b = sampleHeld(current[plane].data, width, height, nx, ny);
        if (Number.isNaN(a) || Number.isNaN(b)) break;
        values.push([plane, a, b]);
      }
      if (values.length < 3) continue;
      for (const [plane, a, b] of values) {
        out.target[plane].push(Math.round(a));
        out.current[plane].push(Math.round(b));
      }
    }
  }
  const bytes = (planes) => ({ y: Uint8Array.from(planes.y), u: Uint8Array.from(planes.u), v: Uint8Array.from(planes.v) });
  return { target: bytes(out.target), current: bytes(out.current) };
}

/** Where a piecewise-linear level mapping (seam.js's points) puts `value`. */
function mapLevel(points, value) {
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    if (value <= x1 || index === points.length - 1) {
      return Math.max(0, Math.min(255, y0 + ((value - x0) * (y1 - y0)) / Math.max(1e-6, x1 - x0)));
    }
  }
  return value;
}

/**
 * Measures a join and works out how to make it seamless: the last frame the
 * clip before shows (`previous`, its finished intermediate and frame count)
 * against the next clip's frame of the same moment (`next`: how to open that
 * frame and the one shown first, the filters that lay them out like the
 * render, and the clip's frame count). Returns the changes to make at the
 * start of the next clip (`head`) and the end of the clip before (`tail`),
 * each null when there are none (as when the frames aren't the same
 * picture), and a report of what was measured and done.
 */
export async function measureJoin({ previous, next, plan, dir, tag }) {
  const { width, height, fps } = plan;
  const target = await framePlanes(["-i", previous.path], `[0:v]select=eq(n\\,${previous.frames - 1}),`, width, height, dir, `${tag}p`);
  const current = await framePlanes(next.input, next.filters, width, height, dir, `${tag}n`);
  // The frame shown first, when it isn't that one (a clip skipping its copy of
  // the frame before's): detail is matched on it, as a re-rendered start
  // softens over its first frames.
  const shown = next.shownInput ? await framePlanes(next.shownInput, next.filters, width, height, dir, `${tag}s`) : current;

  const factor = Math.max(1, Math.round(Math.max(width, height) / ANALYSIS_SIZE));
  const small = (planes) => ({
    y: downscale(planes.y, width, height, factor),
    u: downscale(planes.u, width, height, factor),
    v: downscale(planes.v, width, height, factor),
  });
  const targetSmall = small(target);
  const currentSmall = small(current);
  const size = { width: targetSmall.y.width, height: targetSmall.y.height, factor };
  const fit = alignFrames(targetSmall.y, currentSmall.y);
  const plausible = fitIsPlausible({ map: fit.map, width: size.width, height: size.height });
  const registered = plausible && fit.after >= MIN_ALIGNED_LIKENESS && fit.after - fit.before >= MIN_IMPROVEMENT;
  const fitted = registered ? mapFromFit(fit.map, factor, size.width, size.height) : null;
  const warps = fitted ? planWarps(fitted, width, height) : null;
  // A fit the two clips can't both be warped to is left alone.
  const toNext = warps ? fitted : null;
  const maps = { previous: warps?.previous ?? null, next: warps?.next ?? null };
  const likeness = registered ? fit.after : fit.before;
  const report = {
    likeness_before: Number(fit.before.toFixed(4)),
    likeness_after: Number(likeness.toFixed(4)),
    framing: null,
    colour: null,
    detail: null,
  };
  if (likeness < SAME_PICTURE) return { head: null, tail: null, report: { ...report, left: "different_pictures" } };

  const meeting = meetingPlanes(targetSmall, currentSmall, maps, size);
  const correction = seamCorrection(meeting.target, meeting.current);

  // Detail, measured on the two frames as they will be shown.
  const margin = Math.max(4, Math.round(Math.min(width, height) * 0.02));
  const shownTarget = await shownPlane(target.y, maps.previous, width, height, dir, `${tag}pd`);
  const warpedCurrent = await shownPlane(shown.y, maps.next, width, height, dir, `${tag}nd`);
  const levels = correction ? Float32Array.from({ length: 256 }, (_, value) => mapLevel(correction.levels.y, value)) : null;
  const shownCurrent = levels ? Float32Array.from(warpedCurrent, (value) => levels[value]) : Float32Array.from(warpedCurrent);
  const sharpen = sharpenAmount(shownCurrent, width, height, detailLevel(shownTarget, width, height, margin), margin);

  // The colour and detail match ease off over a couple of seconds, within the clip.
  const easeFrames = Math.min(Math.round(JOIN_EASE_SECONDS * fps), next.frames - 2);
  const eases = easeFrames >= Math.round(0.2 * fps);
  const head = {
    width,
    height,
    frames: easeFrames,
    warp: maps.next ? { map: maps.next, frames: warpFrames(maps.next, width, height, fps, next.frames - 1) } : null,
    correction: eases ? correction : null,
    sharpen: eases ? sharpen : null,
  };
  const tail = maps.previous
    ? { width, height, warp: { map: maps.previous, frames: warpFrames(maps.previous, width, height, fps, previous.frames - 1) } }
    : null;
  if (toNext) {
    const reach = mapReach(toNext, width, height);
    report.framing = {
      scale_x: Number(toNext.m[0].toFixed(4)),
      scale_y: Number(toNext.m[3].toFixed(4)),
      shift_x: Number(toNext.t[0].toFixed(2)),
      shift_y: Number(toNext.t[1].toFixed(2)),
      // How far the re-render moved the picture, as a share of the frame.
      moved: Number(reach.share.toFixed(4)),
      next_seconds: head.warp ? Number((head.warp.frames / fps).toFixed(2)) : 0,
      previous_seconds: tail ? Number((tail.warp.frames / fps).toFixed(2)) : 0,
    };
  }
  if (head.correction) report.colour = { likeness: head.correction.likeness, largest_shift: head.correction.largest_shift };
  if (head.sharpen) report.detail = head.sharpen;
  const changed = head.warp || head.correction || head.sharpen || tail;
  return {
    head: changed ? head : null,
    tail,
    report: changed ? report : { ...report, left: "already_matching" },
  };
}
