import { join } from "node:path";
import { ffmpeg, probe } from "./ffmpeg.js";
import { bad, boxesParam, boxFills, canvas, choice } from "./mask.js";

/**
 * A screenshot with what it must not show blurred: the names, emails, phone
 * numbers and addresses of real people in a supplied screenshot (a client's
 * portal, say), in the boxes a person checked. Inside each box the picture
 * is broken into blocks most of a line of text tall and then blurred, so no
 * letter survives to be read or recovered; every pixel outside the boxes
 * comes out exactly as it was (merged on the picture's own RGB planes, the
 * mask exactly 0 there). The boxes are numbers only: the text they cover is
 * never sent here.
 */

const FORMATS = new Set(["png", "jpg"]);
const MIME = { png: "image/png", jpg: "image/jpeg" };
/** The largest screenshot taken, on a side. */
const MAX_SIDE = 8000;

/** The size of the blocks a box is broken into: most of the tallest box's height, at least 12 px. */
export function redactionBlock(boxes, width, height) {
  const tallest = Math.max(...boxes.map((box) => box.h));
  return Math.max(12, Math.min(160, Math.round(tallest * 0.8), Math.floor(Math.min(width, height) / 2)));
}

/** The redact_image task: one picture and the boxes to blur in it (its own pixels). */
export async function redactImage({ sources, params, dir }) {
  const source = sources[0];
  const info = await probe(source.path);
  const { width, height } = info;
  if (!width || !height) throw bad("The picture couldn't be read");
  if (width > MAX_SIDE || height > MAX_SIDE) throw bad(`The picture is larger than ${MAX_SIDE} px on a side`);
  const boxes = boxesParam(params.boxes, width, height);
  if (!boxes.length) throw bad("Give the boxes to blur");
  const format = choice(params.format, FORMATS, "png", "format");
  const block = redactionBlock(boxes, width, height);
  const across = Math.max(1, Math.ceil(width / block));
  const down = Math.max(1, Math.ceil(height / block));
  // boxblur's radius may be at most half the plane's smaller side.
  const radius = Math.max(1, Math.min(Math.round(block / 2), Math.floor(Math.min(width, height) / 2) - 1));
  const lines = [
    "[0:v]format=gbrp,split=2[base][copy]",
    `[copy]scale=${across}:${down}:flags=area,scale=${width}:${height}:flags=neighbor,` +
      `boxblur=luma_radius=${radius}:luma_power=2:chroma_radius=${radius}:chroma_power=2[hidden]`,
    `${canvas(width, height)},${boxFills(boxes, width, height).join(",")},format=gbrp[mask]`,
    `[base][hidden][mask]maskedmerge,format=${format === "png" ? "rgb24" : "yuvj444p"}[out]`,
  ];
  const out = join(dir, `redacted.${format}`);
  await ffmpeg([
    "-i", source.path,
    "-filter_complex", lines.join(";"),
    "-map", "[out]",
    "-frames:v", "1",
    ...(format === "jpg" ? ["-q:v", "2"] : []),
    out,
  ]);
  return {
    outputs: [{ path: out, mime: MIME[format], kind: "image" }],
    metadata: { ...(await probe(out)), redaction: { boxes: boxes.length, block } },
  };
}
