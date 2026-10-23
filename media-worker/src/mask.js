import { TaskError } from "./net.js";

/**
 * Regions of a picture, as tasks take them: boxes in the picture's own
 * pixels, each checked against it, and the masks FFmpeg draws from them
 * (white on black, grown and feathered). They say what a reference
 * screenshot must not show (redact.js), where a logo's lettering was, so an
 * edit is laid in only there, and where it goes back over a take (plate.js).
 *
 * A mask is made in grey and is exactly 0 outside its region and 255 inside
 * (FFmpeg's black canvas is lifted to video black, 16, so it is set to 0
 * first); merged as planar RGB, a pixel the mask leaves out comes out bit
 * for bit itself.
 */

/** The most boxes a task takes. */
export const MAX_BOXES = 200;
/** The most a mask is grown or feathered, in pixels. */
export const MAX_GROW = 300;
export const MAX_FEATHER = 200;

export function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

export function num(value, { min, max, fallback, name }) {
  if (value === undefined || value === null || value === "") {
    if (fallback === undefined) throw bad(`${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw bad(`${name} must be a number`);
  if (parsed < min || parsed > max) throw bad(`${name} must be between ${min} and ${max}`);
  return parsed;
}

export function choice(value, allowed, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const key = String(value).toLowerCase();
  if (!allowed.has(key)) throw bad(`${name} "${value}" is not supported`);
  return key;
}

export function even(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Boxes ({x, y, w, h}, the picture's pixels from its top-left corner), each
 * inside the picture and at least a pixel each way: one reaching past an
 * edge is cut at it. At most `max`.
 */
export function boxesParam(value, width, height, { name = "boxes", max = MAX_BOXES } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad(`${name} must be a list of boxes`);
  if (value.length > max) throw bad(`At most ${max} ${name} can be given`);
  return value.map((box, index) => {
    if (!box || typeof box !== "object") throw bad(`${name} ${index + 1} isn't a box`);
    const label = `${name} ${index + 1}`;
    const x = Math.floor(num(box.x, { min: 0, max: width - 1, name: `${label}'s x` }));
    const y = Math.floor(num(box.y, { min: 0, max: height - 1, name: `${label}'s y` }));
    const w = Math.round(num(box.w, { min: 1, max: width, name: `${label}'s width` }));
    const h = Math.round(num(box.h, { min: 1, max: height, name: `${label}'s height` }));
    return { x, y, w: Math.max(1, Math.min(w, width - x)), h: Math.max(1, Math.min(h, height - y)) };
  });
}

/**
 * Where a picture (a lettering file) is laid on another: {x, y, w, h} in the
 * other's pixels, wholly inside it. Null when none is given.
 */
export function rectParam(value, width, height, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") throw bad(`${name} must be a box`);
  const x = Math.round(num(value.x, { min: 0, max: width - 1, name: `${name}'s x` }));
  const y = Math.round(num(value.y, { min: 0, max: height - 1, name: `${name}'s y` }));
  const w = Math.round(num(value.w, { min: 2, max: width - x, name: `${name}'s width` }));
  const h = Math.round(num(value.h, { min: 2, max: height - y, name: `${name}'s height` }));
  return { x, y, w, h };
}

/** A box scaled from one picture's pixels to another's (by `k`), kept inside it. */
export function scaleBox(box, k, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(box.x * k)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(box.y * k)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.ceil(box.w * k))),
    h: Math.max(1, Math.min(height - y, Math.ceil(box.h * k))),
  };
}

/** A black canvas, exactly 0, `frames` long at `fps` (one frame for a still). */
export function canvas(width, height, { fps = 25, frames = 1 } = {}) {
  return `color=c=black:s=${width}x${height}:r=${fps}:d=${(frames / fps).toFixed(4)},format=gray,lut=y=0`;
}

/** Filters filling `boxes` white, each grown by `grow` pixels and kept inside the picture. */
export function boxFills(boxes, width, height, grow = 0) {
  return boxes.map((box) => {
    const x = Math.max(0, box.x - grow);
    const y = Math.max(0, box.y - grow);
    const w = Math.min(width, box.x + box.w + grow) - x;
    const h = Math.min(height, box.y + box.h + grow) - y;
    return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white:t=fill`;
  });
}

/**
 * Filters growing a grey mask by `grow` pixels (a shape's own outline, as a
 * logo's letters are), one pixel a pass, alternating a square and a cross so
 * it grows round rather than square.
 */
export function growFilters(grow) {
  return Array.from({ length: Math.round(grow) }, (_, index) =>
    index % 2 === 0 ? "dilation" : "dilation=coordinates=90",
  );
}

/**
 * Filtergraph lines that soften the hard mask [`input`] into [`output`]: it
 * fades out over about `feather` pixels past its edge, and everything inside
 * the hard mask stays wholly in (the softened mask is lifted, then the hard
 * one laid over it), so nothing of what it covers shows through.
 */
export function featherLines(input, output, feather, tag) {
  if (!(feather > 0)) return [`[${input}]null[${output}]`];
  const sigma = Math.max(0.5, feather / 2);
  return [
    `[${input}]split=2[${tag}h][${tag}s]`,
    `[${tag}s]gblur=sigma=${sigma.toFixed(2)},lut=y='clip(val*1.6,0,255)'[${tag}b]`,
    `[${tag}b][${tag}h]blend=all_mode=lighten[${output}]`,
  ];
}
