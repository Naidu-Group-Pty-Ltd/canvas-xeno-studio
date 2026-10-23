import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { matrixOver, overlayTo } from "./colour.js";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { alignFrames, downscale } from "./align.js";
import { fitIsPlausible, mapFromFit, mapReach, warpFilter } from "./joins.js";
import {
  bad,
  boxesParam,
  boxFills,
  canvas,
  choice,
  featherLines,
  growFilters,
  MAX_FEATHER,
  MAX_GROW,
  num,
  rectParam,
  scaleBox,
} from "./mask.js";

/**
 * A logo's lettering taken out of its art and laid back over footage of it,
 * so a video model can move the art without ever drawing a letter (Reel 1's
 * logo was made this way; the app runs it as its clean-plate recipe).
 *
 *   clean_plate: the lettering's mask, from boxes over it or from a
 *     transparent file of it (its alpha), grown and feathered; and, given an
 *     image edit of the art with the lettering taken out, the clean plate:
 *     the edit put in register with the art (an image model returns what it
 *     was given a little moved or resized) and laid into it only inside the
 *     mask, so every other pixel is the art's own, bit for bit.
 *   lay_lettering: the lettering laid back over a take of the plate, once
 *     the take is in the plate's framing (align_take): the art's own pixels
 *     inside a tighter mask, so the letters (and the shadow they stand in) are
 *     the supplied ones; or the supplied lettering file itself, by its alpha.
 *
 * Boxes and the lettering file's place are given in the art's own pixels.
 */

/** The art is worked on at its own size, up to this on a side. */
const MAX_ART_SIDE = 6000;
/** The edit is registered on the art at about this size along its longer side. */
const ANALYSIS_SIZE = 640;
/** How alike the edit and the art must be, away from the lettering, to be put in register. */
const SAME_PICTURE = 0.8;
const MIN_IMPROVEMENT = 0.001;
const MIN_MOVE = 0.35;
/** A take within this of the art's shape is in its framing. */
const SHAPE_TOLERANCE = 0.02;
/** An edit further than this from the art's shape was cropped or padded, and can't be laid in. */
const EDIT_SHAPE_TOLERANCE = 0.03;

const OUTPUTS = new Set(["mask", "plate"]);
const LETTERS = new Set(["art", "file"]);

/** The sources by role: the art (an image), and an edit, a lettering file or a take where given. */
function sourcesOf(sources) {
  const byRole = (role) => sources.find((source) => source.role === role) ?? null;
  const take = byRole("video");
  const edit = byRole("edit");
  const lettering = byRole("lettering");
  const art = sources.find((source) => source !== take && source !== edit && source !== lettering) ?? null;
  return { art, edit, lettering, take };
}

/** What the mask is made from: boxes, a lettering file's place, how far it grows and how softly it fades. */
function maskParams(params, width, height, defaults) {
  return {
    boxes: boxesParam(params.boxes, width, height),
    rect: rectParam(params.lettering_rect, width, height, "lettering_rect"),
    grow: Math.round(num(params.grow, { min: 0, max: MAX_GROW, fallback: defaults.grow, name: "grow" })),
    feather: num(params.feather, { min: 0, max: MAX_FEATHER, fallback: defaults.feather, name: "feather" }),
    threshold: Math.round(num(params.threshold, { min: 1, max: 254, fallback: 6, name: "threshold" })),
  };
}

/**
 * Filtergraph lines that draw the mask at width x height into [`output`],
 * from the boxes (grown by their own measure) and the lettering file at
 * input `letteringInput` (its alpha, placed at `rect` and grown round its
 * letters' own outline); `soft` feathers it. Null when there is nothing to
 * draw it from.
 */
function maskLines({ boxes, rect, grow, feather, threshold }, width, height, { letteringInput = null, output, soft = true, tag = "k" }) {
  const lines = [];
  const parts = [];
  if (boxes.length) {
    lines.push(`${canvas(width, height)},${boxFills(boxes, width, height, grow).join(",")}[${tag}box]`);
    parts.push(`${tag}box`);
  }
  if (letteringInput !== null) {
    const place = rect ?? { x: 0, y: 0, w: width, h: height };
    const grown = growFilters(grow);
    lines.push(
      `[${letteringInput}]scale=${place.w}:${place.h}:flags=lanczos,format=rgba,alphaextract,` +
        `lut=y='if(gt(val,${threshold}),255,0)',pad=${width}:${height}:${place.x}:${place.y}:color=black,` +
        // pad lays its border at video black (16): back to 0 and 255 exactly.
        `lut=y='if(gte(val,128),255,0)'${grown.length ? `,${grown.join(",")}` : ""}[${tag}let]`,
    );
    parts.push(`${tag}let`);
  }
  if (!parts.length) return null;
  const hard = `${tag}hard`;
  lines.push(parts.length === 2 ? `[${parts[0]}][${parts[1]}]blend=all_mode=lighten[${hard}]` : `[${parts[0]}]null[${hard}]`);
  lines.push(...(soft ? featherLines(hard, output, feather, tag) : [`[${hard}]null[${output}]`]));
  return lines;
}

/** A still's light as a grey plane at width x height. */
async function greyOf(path, width, height, dir, tag, extra = "") {
  const out = join(dir, `plate-${tag}-${Date.now().toString(36)}.gray`);
  await ffmpeg(["-i", path, "-vf", `scale=${width}:${height}:flags=lanczos,setsar=1${extra},format=gray`, "-frames:v", "1", "-f", "rawvideo", out]);
  const data = await readFile(out);
  await rm(out, { force: true });
  if (data.length < width * height) throw new TaskError("RENDER_FAILED", "A picture couldn't be read");
  return data.subarray(0, width * height);
}

/** The mask itself as a grey plane (hard: only where the lettering is, grown). */
async function maskPlane(spec, width, height, lettering, dir) {
  const lines = maskLines(spec, width, height, { letteringInput: lettering ? "0:v" : null, output: "mask", soft: false });
  const out = join(dir, `plate-mask-${Date.now().toString(36)}.gray`);
  await ffmpeg([
    ...(lettering ? ["-i", lettering.path] : []),
    "-filter_complex", lines.join(";"),
    "-map", "[mask]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", out,
  ]);
  const data = await readFile(out);
  await rm(out, { force: true });
  return data.subarray(0, width * height);
}

/**
 * The map that puts the edit on the art: fitted on their light with the
 * lettering's region (and the edit's change there) set flat in both, so only
 * what the edit was told to keep is compared. Null when it needs no move or
 * the two aren't the same picture, with what was measured.
 */
function registerEdit(art, edit, hard, width, height) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < art.length; i += 1) {
    if (hard[i]) continue;
    total += art[i];
    count += 1;
  }
  const flat = count ? total / count : 128;
  const flatten = (plane) => Float32Array.from(plane, (value, i) => (hard[i] ? flat : value));
  const factor = Math.max(1, Math.round(Math.max(width, height) / ANALYSIS_SIZE));
  const ref = downscale(flatten(art), width, height, factor);
  const mov = downscale(flatten(edit), width, height, factor);
  const fit = alignFrames(ref, mov);
  const plausible = fitIsPlausible({ map: fit.map, width: ref.width, height: ref.height });
  const registered = plausible && fit.after >= SAME_PICTURE && fit.after - fit.before >= MIN_IMPROVEMENT;
  const map = registered ? mapFromFit(fit.map, factor, ref.width, ref.height) : null;
  const warp = map && mapReach(map, width, height).pixels >= MIN_MOVE ? map : null;
  return {
    warp,
    report: {
      likeness_before: Number(fit.before.toFixed(4)),
      likeness_after: Number((registered ? fit.after : fit.before).toFixed(4)),
      registered,
      ...(warp
        ? {
            framing: {
              scale_x: Number((1 + fit.map.a).toFixed(4)),
              scale_y: Number((1 + fit.map.d).toFixed(4)),
              shift_x: Number((fit.map.tx * factor).toFixed(2)),
              shift_y: Number((fit.map.ty * factor).toFixed(2)),
            },
          }
        : {}),
    },
  };
}

/** Mean difference (levels) between two planes where `skip` is clear. */
function keptDifference(a, b, skip) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (skip[i]) continue;
    total += Math.abs(a[i] - b[i]);
    count += 1;
  }
  return count ? total / count : 0;
}

/**
 * The clean_plate task. Sources: the art, and for the plate its edit (role
 * "edit"); a transparent lettering file (role "lettering") whose alpha is the
 * mask. Produces the mask, or the clean plate, as PNG.
 */
export async function cleanPlate({ sources, params, dir }) {
  const { art, edit, lettering } = sourcesOf(sources);
  if (!art) throw bad("clean_plate needs the art");
  const output = choice(params.output, OUTPUTS, "plate", "output");
  if (output === "plate" && !edit) throw bad("The clean plate needs the edit with the lettering taken out (role \"edit\")");
  const info = await probe(art.path);
  const width = info.width;
  const height = info.height;
  if (!width || !height) throw bad("The art couldn't be read");
  if (width > MAX_ART_SIDE || height > MAX_ART_SIDE) throw bad(`The art is larger than ${MAX_ART_SIDE} px on a side`);
  const side = Math.min(width, height);
  const spec = maskParams(params, width, height, { grow: Math.round(side * 0.02), feather: Math.round(side * 0.02) });
  if (!spec.boxes.length && !lettering) throw bad("Say where the lettering is: boxes over it, or a transparent file of it");

  if (output === "mask") {
    const lines = maskLines(spec, width, height, { letteringInput: lettering ? "0:v" : null, output: "mask" });
    const out = join(dir, "mask.png");
    await ffmpeg([
      ...(lettering ? ["-i", lettering.path] : []),
      "-filter_complex", lines.join(";"),
      "-map", "[mask]", "-frames:v", "1", out,
    ]);
    return { outputs: [{ path: out, mime: "image/png", kind: "image" }], metadata: { ...(await probe(out)), mask: { boxes: spec.boxes.length, lettering: Boolean(lettering), grow: spec.grow, feather: spec.feather } } };
  }

  // The edit, at the art's size, put in register with it where nothing was changed.
  const editInfo = await probe(edit.path);
  if (!editInfo.width || !editInfo.height) throw bad("The edit couldn't be read");
  if (Math.abs(editInfo.width / editInfo.height / (width / height) - 1) > EDIT_SHAPE_TOLERANCE) {
    throw bad(
      `The edit is ${editInfo.width}x${editInfo.height} and the art ${width}x${height}: they aren't the same shape, so the edit can't be laid into the art. Make the edit in the art's shape, then blend again.`,
    );
  }
  const hard = await maskPlane(spec, width, height, lettering, dir);
  const artLight = await greyOf(art.path, width, height, dir, "art");
  const editLight = await greyOf(edit.path, width, height, dir, "edit");
  const { warp, report } = registerEdit(artLight, editLight, hard, width, height);
  const shown = warp ? await greyOf(edit.path, width, height, dir, "shown", `,${warpFilter(warp, width, height)}`) : editLight;

  const inputs = ["-i", art.path, "-i", edit.path, ...(lettering ? ["-i", lettering.path] : [])];
  const lines = [
    "[0:v]format=gbrp[art]",
    `[1:v]scale=${width}:${height}:flags=lanczos,setsar=1${warp ? `,${warpFilter(warp, width, height)}` : ""},format=gbrp[edit]`,
    ...maskLines(spec, width, height, { letteringInput: lettering ? "2:v" : null, output: "soft" }),
    "[soft]format=gbrp[mask]",
    "[art][edit][mask]maskedmerge,format=rgb24[plate]",
  ];
  const out = join(dir, "plate.png");
  await ffmpeg([...inputs, "-filter_complex", lines.join(";"), "-map", "[plate]", "-frames:v", "1", out]);
  return {
    outputs: [{ path: out, mime: "image/png", kind: "image" }],
    metadata: {
      ...(await probe(out)),
      registration: report,
      // How far the edit strayed from the art where it was told to keep it (levels): only its
      // lettering's region is used, so this is how much the model changed besides.
      kept_difference_levels: Number(keptDifference(artLight, shown, hard).toFixed(2)),
      mask: { boxes: spec.boxes.length, lettering: Boolean(lettering), grow: spec.grow, feather: spec.feather },
    },
  };
}

/**
 * The lay_lettering task. Sources: the take (in the art's framing, role
 * "video"), the art, and a lettering file (role "lettering") for a mask from
 * its alpha or to lay itself. Produces the take with the lettering over it.
 */
export async function layLettering({ sources, params, dir }) {
  const { art, lettering, take } = sourcesOf(sources);
  if (!take || !art) throw bad("lay_lettering needs the take and the art");
  const letters = choice(params.letters, LETTERS, "art", "letters");
  if (letters === "file" && !lettering) throw bad("Laying the lettering file itself needs the file (role \"lettering\")");
  const start = num(params.start_seconds, { min: 0, max: 600, fallback: 0, name: "start_seconds" });
  const fade = num(params.fade_seconds, { min: 0, max: 10, fallback: 0, name: "fade_seconds" });
  const crf = Math.round(num(params.crf, { min: 12, max: 30, fallback: 16, name: "crf" }));
  const [takeInfo, artInfo] = await Promise.all([probe(take.path), probe(art.path)]);
  const { width, height } = takeInfo;
  if (!width || !height || !artInfo.width || !artInfo.height) throw bad("The take or the art couldn't be read");
  const shape = width / height / (artInfo.width / artInfo.height);
  if (Math.abs(shape - 1) > SHAPE_TOLERANCE) {
    throw bad("The take isn't in the art's framing: align it to the clean plate first (align_take), then lay the lettering over it.");
  }
  const fps = takeInfo.fps && takeInfo.fps > 0 ? takeInfo.fps : 30;
  // Boxes and the file's place are the art's pixels; the take may be the art at another size.
  const k = width / artInfo.width;
  const side = Math.min(artInfo.width, artInfo.height);
  const spec = maskParams(params, artInfo.width, artInfo.height, { grow: Math.round(side * 0.01), feather: Math.round(side * 0.0065) });
  const scaled = {
    ...spec,
    boxes: spec.boxes.map((box) => scaleBox(box, k, width, height)),
    rect: spec.rect ? scaleBox(spec.rect, k, width, height) : null,
    grow: Math.round(spec.grow * k),
    feather: spec.feather * k,
  };
  const fadeIn = start > 0 || fade > 0 ? `,fade=t=in:st=${start.toFixed(3)}:d=${Math.max(fade, 1 / fps).toFixed(3)}:alpha=1` : "";
  // The layer in the take's own colour (its RGB by the take's matrix; see ./colour.js), then held.
  const loop = `${overlayTo(matrixOver(takeInfo))},loop=loop=-1:size=1,setpts=N/(${fps}*TB)`;
  const lines = [];
  const inputs = ["-i", take.path, "-i", art.path, ...(lettering ? ["-i", lettering.path] : [])];
  if (letters === "file") {
    const place = scaled.rect ?? { x: 0, y: 0, w: width, h: height };
    lines.push(`[2:v]scale=${place.w}:${place.h}:flags=lanczos,format=rgba,${loop}${fadeIn}[layer]`);
    lines.push(`[0:v][layer]overlay=x=${place.x}:y=${place.y}:shortest=1,format=yuv420p[v]`);
  } else {
    const mask = maskLines(scaled, width, height, { letteringInput: lettering ? "2:v" : null, output: "alpha" });
    if (!mask) throw bad("Say where the lettering is: boxes over it, or a transparent file of it");
    lines.push(...mask);
    // The art's own pixels, with the mask as their alpha: a still laid over every frame.
    lines.push(`[1:v]scale=${width}:${height}:flags=lanczos,setsar=1,format=rgba[art]`);
    lines.push(`[art][alpha]alphamerge,${loop}${fadeIn}[layer]`);
    lines.push("[0:v][layer]overlay=x=0:y=0:shortest=1,format=yuv420p[v]");
  }
  const out = join(dir, "lettered.mp4");
  await ffmpeg([
    ...inputs,
    "-filter_complex", lines.join(";"),
    "-map", "[v]",
    "-map", "0:a?",
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    out,
  ]);
  return {
    outputs: [{ path: out, mime: "video/mp4", kind: "video" }],
    metadata: { ...(await probe(out)), lettering: { letters, boxes: spec.boxes.length, from_file: Boolean(lettering), start_seconds: start, fade_seconds: fade } },
  };
}
