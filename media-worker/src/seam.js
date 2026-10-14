import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { ffmpeg } from "./ffmpeg.js";

/**
 * Easing a clip's colour into the clip before it, at a join where the second
 * carries straight on from the first (a long video's clips: each starts from
 * the frame the one before ends on). A generated clip re-renders that frame a
 * little lighter or darker, warmer or cooler, so the join can blink. The
 * clip's picture is matched to the one before it at the join, and the match
 * eases off over a couple of seconds, back to the clip's own colour.
 *
 * The match is made on the picture's own planes (Y for light, U and V for
 * colour), as it is encoded, so nothing is converted on the way and the clip
 * comes out bit for bit itself once the match has eased off. Only mid-tones
 * are compared (5th to 95th percentiles), so a light moving in or out of
 * frame isn't taken for a change of exposure, and nothing is changed unless
 * both frames show the same picture.
 */

/** How long the match takes to ease off, in seconds. */
export const SEAM_EASE_SECONDS = 2.5;
const THUMB_WIDTH = 128;
const PERCENTILES = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
/**
 * The most a level is moved (0-255): enough for a re-rendered frame's drift,
 * never a regrade. Colour moves less than light.
 */
const MAX_SHIFT = { light: 18, colour: 10 };
/** Black is lifted at most this much, so shadows never turn milky. */
const MAX_BLACK_LIFT = 6;
/** Below this the two pictures differ by nothing anyone would see. */
const MIN_SHIFT = 1.2;
/** How alike the two pictures must be (1 is identical) to be the same moment. */
const MIN_LIKENESS = 0.82;

/**
 * A small picture of one frame as its three planes, full size each (Y, then
 * U, then V), as a Buffer. `input` are the arguments that open the frame;
 * `filters` lay it out like the render.
 */
export async function planeThumbnail(input, filters, dir, tag) {
  const out = join(dir, `seam-${tag}-${Date.now().toString(36)}.yuv`);
  await ffmpeg([
    ...input,
    "-filter_complex", `${filters}scale=${THUMB_WIDTH}:-2:flags=area,format=yuv444p[thumb]`,
    "-map", "[thumb]",
    "-fps_mode", "passthrough",
    "-frames:v", "1",
    "-f", "rawvideo",
    out,
  ]);
  const data = await readFile(out);
  await rm(out, { force: true });
  const size = Math.floor(data.length / 3);
  return { y: data.subarray(0, size), u: data.subarray(size, size * 2), v: data.subarray(size * 2, size * 3) };
}

function sorted(plane) {
  return Uint8Array.from(plane).sort();
}

function percentile(values, share) {
  return values[Math.min(values.length - 1, Math.max(0, Math.round(share * (values.length - 1))))];
}

/** How alike two pictures' light is once brightness and contrast are set aside: 1 is the same picture. */
export function likeness(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  if (saa < 1e-6 || sbb < 1e-6) return Math.abs(ma - mb) < 6 ? 1 : 0;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * The levels of `current` mapped onto those of `target` at the same
 * percentiles: points (from, to) on 0-255, rising, the top kept where it is.
 * Percentiles crushed onto one level (clipped shadows) count once, at their
 * average target. Light may lift its black a little to meet shadows the
 * other frame has.
 */
function planePoints(target, current, { maxShift, light }) {
  const byLevel = new Map();
  for (const share of PERCENTILES) {
    const from = percentile(current, share);
    const entry = byLevel.get(from) ?? { total: 0, count: 0 };
    entry.total += percentile(target, share);
    entry.count += 1;
    byLevel.set(from, entry);
  }
  const pairs = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, { total, count }]) => [from, from + Math.max(-maxShift, Math.min(maxShift, total / count - from))]);
  const first = pairs[0];
  const lift = light ? Math.max(0, Math.min(MAX_BLACK_LIFT, first[1] - first[0])) : first[1] - first[0];
  const points = first[0] > 0 ? [[0, Math.max(0, lift)]] : [];
  for (const [from, to] of pairs) {
    const previous = points[points.length - 1];
    // Rising on both sides, so the mapping never folds a level over another.
    if (previous && (from <= previous[0] + 2 || to <= previous[1])) continue;
    points.push([from, Math.max(0, Math.min(255, to))]);
  }
  const last = points[points.length - 1];
  if (last[0] < 253) points.push([255, light ? 255 : Math.max(last[1] + 1, Math.min(255, 255 + (last[1] - last[0])))]);
  return points;
}

/**
 * A piecewise-linear level mapping as an FFmpeg lut expression on `val`
 * (0-255). It goes inside single quotes in the filtergraph, which keep its
 * commas; it has no colons or quotes of its own.
 */
function lutExpression(points) {
  let expression = "val";
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const slope = (y1 - y0) / Math.max(1e-6, x1 - x0);
    const segment = `${y0.toFixed(3)}+(val-${x0.toFixed(3)})*${slope.toFixed(5)}`;
    expression = index === points.length - 1 ? segment : `if(lt(val,${x1.toFixed(3)}),${segment},${expression})`;
  }
  return `clip(${expression},0,255)`;
}

/**
 * The correction that brings `current` (the clip's first frame, or the frame
 * it repeats from the clip before) into line with `target` (the last frame
 * shown of the clip before), as lutyuv expressions; null when the two aren't
 * the same picture or already match.
 */
export function seamCorrection(target, current) {
  if (!target?.y?.length || !current?.y?.length) return null;
  const alike = likeness(target.y, current.y);
  if (alike < MIN_LIKENESS) return null;
  const maps = {
    y: planePoints(sorted(target.y), sorted(current.y), { maxShift: MAX_SHIFT.light, light: true }),
    u: planePoints(sorted(target.u), sorted(current.u), { maxShift: MAX_SHIFT.colour, light: false }),
    v: planePoints(sorted(target.v), sorted(current.v), { maxShift: MAX_SHIFT.colour, light: false }),
  };
  const largest = Math.max(...Object.values(maps).flatMap((points) => points.map(([from, to]) => Math.abs(to - from))));
  if (largest < MIN_SHIFT) return null;
  return {
    likeness: Number(alike.toFixed(3)),
    largest_shift: Number(largest.toFixed(2)),
    y: lutExpression(maps.y),
    u: lutExpression(maps.u),
    v: lutExpression(maps.v),
  };
}

/**
 * Filtergraph lines that ease `input` from corrected into itself over
 * `seconds`: the corrected picture first, cross-fading into the untouched one.
 */
export function seamEaseChain(input, output, correction, seconds, tag) {
  const duration = Math.max(0.1, seconds).toFixed(6);
  return (
    `[${input}]format=yuv420p,split=2[${tag}sa][${tag}sb];` +
    `[${tag}sa]lutyuv=y='${correction.y}':u='${correction.u}':v='${correction.v}'[${tag}sc];` +
    `[${tag}sc][${tag}sb]xfade=transition=fade:duration=${duration}:offset=0[${output}]`
  );
}
