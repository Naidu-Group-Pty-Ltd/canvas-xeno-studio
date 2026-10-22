import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { matrixOver, toMatrix } from "./colour.js";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { alignFrames, downscale } from "./align.js";
import { fitIsPlausible, mapFromFit, mapReach, warpFilter } from "./joins.js";
import { lutExpression } from "./seam.js";
import { decodeThumbnails } from "./frames.js";
import { bad, choice, even, num } from "./mask.js";

/**
 * A take that must land on an exact picture (a logo's reveal ending on the
 * logo, a living card starting on the card), put on that picture so the
 * hand-over to it can't be seen.
 *
 * A video model re-renders the picture it was given, and the frame that must
 * equal it (the anchor: the take's last frame, or its first) comes back a
 * little off: moved and resized by a pixel or two, and a shade lighter,
 * darker or warmer. Both are measured on the anchor against the picture and
 * put right on every frame of the take:
 *   - framing: an affine fit, coarse to fine (./align.js, as a smart join is
 *     put in register);
 *   - colour: a gain and offset on each of the picture's planes (Y, U, V),
 *     fitted on 24-pixel block averages once the two are in register, never
 *     pixel against pixel: the take is softer than the picture it was made
 *     from, and a fit across that difference in detail pulls the gain towards
 *     nothing.
 * Then the take crosses to the picture itself, which holds before anything
 * else moves. A take anchored on its first frame starts on the picture and
 * crosses into the take instead.
 *
 * The picture sets the frame (within the worker's limits), and the take is
 * scaled to it, so the two must be the same shape. The take's own sound is
 * left out: this is the picture of a shot, for the edit to lay sound under.
 */

/** Frames are registered at about this size along their longer side. */
const ANALYSIS_SIZE = 480;
/** How alike the anchor and the picture must be once in register to be the same picture. */
const SAME_PICTURE = 0.7;
/** The least a fit must improve how alike they are to be worth a warp. */
const MIN_IMPROVEMENT = 0.002;
/** A warp that moves no corner this far (output pixels) isn't worth making. */
const MIN_MOVE = 0.35;
/** Colour is fitted on block averages this many pixels across. */
const BLOCK = 24;
/** A plane whose blocks vary less than this (levels) gives no gain to fit: only an offset. */
const MIN_SPREAD = 4;
/** A colour change smaller than this anywhere (levels) can't be seen, and isn't made. */
const MIN_COLOUR_SHIFT = 0.8;
/** Gains and offsets past these are a misfit, not a re-render's drift. */
const COLOUR_LIMITS = { low: 0.6, high: 1.6, offset: 60 };
/** A take whose shape is further than this from the picture's can't land on it. */
const SHAPE_TOLERANCE = 0.12;
/** The largest frame made: 3840 on a side, and no more pixels than 4K UHD. */
const MAX_SIDE = 3840;
const MAX_PIXELS = 3840 * 2160;

const ANCHORS = new Set(["last", "first"]);
const FORMATS = new Set(["mp4", "webm"]);
const MIME = { mp4: "video/mp4", webm: "video/webm" };

/** The frame a picture sets: its own size within the worker's limits, even each way. */
export function takeFrame(width, height) {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.max(16, even(Math.floor(width * k))), height: Math.max(16, even(Math.floor(height * k))) };
}

/**
 * The gain and offset that best bring `current` onto `target` (two lists of
 * block averages, one plane each), by least squares, fitted again without
 * the blocks it explains worst (something that moved, a highlight the take
 * lost). A plane with too little spread to fit a gain gets an offset only.
 * Also how far apart the two are before and after (mean levels).
 */
export function levelFit(target, current) {
  const n = Math.min(target.length, current.length);
  if (!n) return { gain: 1, offset: 0, before: 0, after: 0 };
  const fit = (keep) => {
    let count = 0;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i += 1) {
      if (!keep[i]) continue;
      count += 1;
      mx += current[i];
      my += target[i];
    }
    mx /= count;
    my /= count;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
      if (!keep[i]) continue;
      sxx += (current[i] - mx) ** 2;
      sxy += (current[i] - mx) * (target[i] - my);
    }
    const spread = Math.sqrt(sxx / count);
    const gain = spread >= MIN_SPREAD ? sxy / sxx : 1;
    return { gain, offset: my - gain * mx };
  };
  const all = new Uint8Array(n).fill(1);
  const first = fit(all);
  const residuals = Array.from({ length: n }, (_, i) => Math.abs(target[i] - (first.gain * current[i] + first.offset)));
  const median = [...residuals].sort((a, b) => a - b)[Math.floor(n / 2)];
  const limit = Math.max(2, 2.5 * 1.4826 * median);
  const keep = Uint8Array.from(residuals, (value) => (value <= limit ? 1 : 0));
  const kept = keep.reduce((sum, value) => sum + value, 0);
  const final = kept >= Math.max(8, n * 0.3) ? fit(keep) : first;
  let before = 0;
  let after = 0;
  for (let i = 0; i < n; i += 1) {
    before += Math.abs(target[i] - current[i]);
    after += Math.abs(target[i] - (final.gain * current[i] + final.offset));
  }
  return { gain: final.gain, offset: final.offset, before: before / n, after: after / n };
}

/** Whether a fit is a re-render's drift rather than a misfit. */
export function plausibleLevels(fit) {
  return fit.gain >= COLOUR_LIMITS.low && fit.gain <= COLOUR_LIMITS.high && Math.abs(fit.offset) <= COLOUR_LIMITS.offset;
}

/** The most a gain and offset move a level in the picture's range (16-235), in levels. */
export function largestShift({ gain, offset }) {
  return Math.max(Math.abs(16 * (gain - 1) + offset), Math.abs(235 * (gain - 1) + offset));
}

/** A gain and offset as a lut expression on `val` (see seam.js), or null for none. */
function levelExpression(fit) {
  if (!fit || largestShift(fit) < MIN_COLOUR_SHIFT) return null;
  return lutExpression([
    [0, fit.offset],
    [255, 255 * fit.gain + fit.offset],
  ]);
}

/**
 * One frame (frame `index` of a video; a still's only one) as Y, U and V
 * planes at width x height, brought into the take's matrix by `colour` (scale
 * options; see ./colour.js) where it isn't in it.
 */
async function planesOf(path, { index = null, width, height, warp = null, colour = null, dir, tag }) {
  const out = join(dir, `take-${tag}-${Date.now().toString(36)}.yuv`);
  const filters = [
    ...(index === null ? [] : [`select=eq(n\\,${index})`]),
    `scale=${width}:${height}:flags=lanczos${colour ? `:${colour},format=yuv444p` : ""}`,
    "setsar=1",
    ...(warp ? [warpFilter(warp, width, height)] : []),
    "format=yuv444p",
  ];
  await ffmpeg([
    "-i", path,
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-vf", filters.join(","),
    "-fps_mode", "passthrough",
    "-frames:v", "1",
    "-f", "rawvideo",
    out,
  ]);
  const data = await readFile(out);
  await rm(out, { force: true });
  const size = width * height;
  if (data.length < size * 3) throw new TaskError("RENDER_FAILED", "A frame of the take couldn't be read");
  return { y: data.subarray(0, size), u: data.subarray(size, size * 2), v: data.subarray(size * 2, size * 3) };
}

/** Block averages of a frame's three planes, the outer ring of blocks left out (a warp's edges). */
function blocksOf(planes, width, height) {
  const out = {};
  for (const plane of ["y", "u", "v"]) {
    const small = downscale(planes[plane], width, height, BLOCK);
    const values = [];
    for (let y = 1; y < small.height - 1; y += 1) {
      for (let x = 1; x < small.width - 1; x += 1) values.push(small.data[y * small.width + x]);
    }
    out[plane] = values;
  }
  return out;
}

/** Mean absolute difference of two planes, `levels` mapping the second's values first. */
function planeError(target, current, map = null) {
  let total = 0;
  for (let i = 0; i < target.length; i += 1) {
    const value = map ? Math.max(0, Math.min(255, map.gain * current[i] + map.offset)) : current[i];
    total += Math.abs(target[i] - value);
  }
  return target.length ? total / target.length : 0;
}

/**
 * Measures how the take's anchor sits on the picture: the warp that puts it
 * there (null when none is needed, or the two aren't the same picture), the
 * colour match, and the report of both.
 */
async function measureAnchor({ take, picture, anchorIndex, frame, colour, dir }) {
  const { width, height } = frame;
  const target = await planesOf(picture.path, { width, height, colour, dir, tag: "picture" });
  const anchor = await planesOf(take.path, { index: anchorIndex, width, height, dir, tag: "anchor" });
  const factor = Math.max(1, Math.round(Math.max(width, height) / ANALYSIS_SIZE));
  const ref = downscale(target.y, width, height, factor);
  const mov = downscale(anchor.y, width, height, factor);
  const fit = alignFrames(ref, mov);
  const plausible = fitIsPlausible({ map: fit.map, width: ref.width, height: ref.height });
  const registered = plausible && fit.after >= SAME_PICTURE && fit.after - fit.before >= MIN_IMPROVEMENT;
  const likeness = registered ? fit.after : fit.before;
  const fitted = registered ? mapFromFit(fit.map, factor, ref.width, ref.height) : null;
  const warp = fitted && mapReach(fitted, width, height).pixels >= MIN_MOVE ? fitted : null;
  const report = {
    likeness_before: Number(fit.before.toFixed(4)),
    likeness_after: Number(likeness.toFixed(4)),
    registered,
    framing: warp
      ? {
          // How the take showed the picture: its size (1 is the same) and how far it was moved, in pixels.
          scale_x: Number((1 + fit.map.a).toFixed(4)),
          scale_y: Number((1 + fit.map.d).toFixed(4)),
          shift_x: Number((fit.map.tx * factor).toFixed(2)),
          shift_y: Number((fit.map.ty * factor).toFixed(2)),
          moved: Number(mapReach(warp, width, height).share.toFixed(4)),
        }
      : null,
    colour: null,
    anchor_error_levels: { before: Number(planeError(target.y, anchor.y).toFixed(2)), after: null },
  };
  if (likeness < SAME_PICTURE) {
    // Not the same picture: it is crossed to the picture as it is, and the report says so.
    report.anchor_error_levels.after = report.anchor_error_levels.before;
    return { warp: null, levels: null, report: { ...report, left: "different_pictures" } };
  }

  // Colour, on the anchor as it will be shown (warped by FFmpeg itself).
  const shown = warp ? await planesOf(take.path, { index: anchorIndex, width, height, warp, dir, tag: "shown" }) : anchor;
  const targetBlocks = blocksOf(target, width, height);
  const shownBlocks = blocksOf(shown, width, height);
  const levels = {};
  for (const plane of ["y", "u", "v"]) {
    const fitted = levelFit(targetBlocks[plane], shownBlocks[plane]);
    levels[plane] = plausibleLevels(fitted) && largestShift(fitted) >= MIN_COLOUR_SHIFT ? fitted : null;
  }
  const used = Object.values(levels).some(Boolean);
  if (used) {
    report.colour = Object.fromEntries(
      Object.entries(levels).map(([plane, fit]) => [
        plane,
        fit ? { gain: Number(fit.gain.toFixed(4)), offset: Number(fit.offset.toFixed(2)) } : null,
      ]),
    );
  }
  report.anchor_error_levels.after = Number(planeError(target.y, shown.y, levels.y).toFixed(2));
  return { warp, levels: used ? levels : null, report };
}

function encodeArgs(format, crf) {
  if (format === "webm") return ["-c:v", "libvpx-vp9", "-crf", String(crf + 8), "-b:v", "0", "-an"];
  return ["-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
}

/** The align_take task: sources are the take (a video) and the picture it must land on. */
export async function alignTake({ sources, params, dir }) {
  const take = sources.find((source) => source.role === "video") ?? sources[0];
  const picture = sources.find((source) => source !== take);
  if (!take || !picture) throw bad("align_take needs the take and the picture it must land on");
  const anchor = choice(params.anchor, ANCHORS, "last", "anchor");
  const crossAsked = num(params.cross_seconds, { min: 0, max: 3, fallback: 0.5, name: "cross_seconds" });
  const holdAsked = num(params.hold_seconds, { min: 0, max: 10, fallback: 0, name: "hold_seconds" });
  const format = choice(params.format, FORMATS, "mp4", "format");
  const crf = Math.round(num(params.crf, { min: 12, max: 30, fallback: 16, name: "crf" }));
  const asked = params.fps === undefined || params.fps === null || params.fps === "" ? null : num(params.fps, { min: 6, max: 60, name: "fps" });

  const [takeInfo, pictureInfo] = await Promise.all([probe(take.path), probe(picture.path)]);
  if (!takeInfo.width || !takeInfo.height) throw bad("The take has no picture to align");
  if (!pictureInfo.width || !pictureInfo.height) throw bad("The picture it must land on couldn't be read");
  const shape = takeInfo.width / takeInfo.height / (pictureInfo.width / pictureInfo.height);
  if (Math.abs(shape - 1) > SHAPE_TOLERANCE) {
    throw bad(
      `The take is ${takeInfo.width}x${takeInfo.height} and the picture ${pictureInfo.width}x${pictureInfo.height}: they aren't the same shape, so one can't land on the other. Make the take from this picture, or reframe the picture to the take's shape first.`,
    );
  }
  const frame = takeFrame(pictureInfo.width, pictureInfo.height);

  // Its frames counted by decoding them, so the anchor is truly its last (or first).
  const thumbs = await decodeThumbnails(take.path, dir, { width: takeInfo.width, height: takeInfo.height });
  if (thumbs.count < 2) throw bad("The take has too few frames to align");
  const rate = takeInfo.fps && takeInfo.fps > 0 ? takeInfo.fps : takeInfo.duration_seconds ? thumbs.count / takeInfo.duration_seconds : 24;
  const fps = asked ?? Number(rate.toFixed(3));
  const anchorIndex = anchor === "last" ? thumbs.count - 1 : 0;
  const seconds = thumbs.count / rate;
  const cross = Math.min(crossAsked, seconds);
  // A cross ends on a frame still partly the take, so a take anchored on its
  // last frame always ends on at least one frame of the picture itself.
  const hold = anchor === "last" && cross > 0 ? Math.max(holdAsked, 1 / fps) : holdAsked;

  // The picture in the take's own colour (a still's RGB by the take's matrix; see ./colour.js), measured and shown so.
  const colour = toMatrix(pictureInfo, matrixOver(takeInfo));
  const { warp, levels, report } = await measureAnchor({ take, picture, anchorIndex, frame, colour, dir });

  const { width, height } = frame;
  const looks = [];
  if (warp) looks.push(warpFilter(warp, width, height));
  if (levels) {
    const expression = (plane) => levelExpression(levels[plane]) ?? "val";
    looks.push("format=yuv444p", `lutyuv=y='${expression("y")}':u='${expression("u")}':v='${expression("v")}'`);
  }
  const still = cross + hold;
  const lines = [
    `[0:v]fps=${fps},scale=${width}:${height}:flags=lanczos,setsar=1${looks.length ? `,${looks.join(",")}` : ""},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[t]`,
  ];
  if (still > 0) {
    lines.push(`[1:v]scale=${width}:${height}:flags=lanczos${colour ? `:${colour},format=yuv444p` : ""},setsar=1,fps=${fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[p]`);
  }
  const [first, second] = anchor === "last" ? ["t", "p"] : ["p", "t"];
  if (still > 0 && cross > 0) {
    const offset = anchor === "last" ? seconds - cross : hold;
    lines.push(`[${first}][${second}]xfade=transition=fade:duration=${cross.toFixed(4)}:offset=${Math.max(0, offset).toFixed(4)}[v]`);
  } else if (still > 0) {
    lines.push(`[${first}][${second}]concat=n=2:v=1:a=0[v]`);
  } else {
    lines.push("[t]null[v]");
  }
  const out = join(dir, `aligned.${format}`);
  await ffmpeg([
    "-i", take.path,
    ...(still > 0 ? ["-loop", "1", "-framerate", String(fps), "-t", still.toFixed(4), "-i", picture.path] : []),
    "-filter_complex", lines.join(";"),
    "-map", "[v]",
    ...encodeArgs(format, crf),
    out,
  ]);
  const info = await probe(out);
  return {
    outputs: [{ path: out, mime: MIME[format], kind: "video" }],
    metadata: {
      ...info,
      alignment: {
        ...report,
        anchor,
        anchor_frame: anchorIndex,
        frames: thumbs.count,
        fps: Number(rate.toFixed(3)),
        cross_seconds: Number(cross.toFixed(3)),
        hold_seconds: Number(hold.toFixed(3)),
        // From here (the cross done) the shot is the picture itself, until the end; a take
        // anchored on its first frame is the picture until here.
        picture_from_seconds: Number((anchor === "last" ? seconds : 0).toFixed(3)),
        picture_until_seconds: Number((anchor === "last" ? seconds + hold : hold).toFixed(3)),
      },
    },
  };
}
