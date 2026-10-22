import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ffmpeg } from "./ffmpeg.js";

/**
 * Colour as the studio's videos carry it: BT.709 at limited range, tagged
 * so, the way an HD player reads a picture. FFmpeg turns RGB into YUV with
 * BT.601's weights unless it is told otherwise, and draws text, boxes and
 * padding into a YUV picture with them whatever the picture is, so a render
 * made that way plays back off: a brand's teal (#00a8b5) by a CIEDE2000 of 8,
 * a red by 6, a gold by 1.6 (found by measuring renders, see ./quality.js).
 * So, here:
 *
 *   - a picture in RGB (a still, a logo, a motion graphic's lossless master)
 *     is turned into YUV by BT.709's matrix, named; one in another matrix (a
 *     JPEG's, an SD camera's) is converted to it;
 *   - a colour drawn into a YUV picture (captions and titles, their panels, a
 *     frame's padding) is handed over so that the drawing's own matrix lands
 *     it on what the picture's matrix makes of it: within a CIEDE2000 of 0.3
 *     for a brand's colours (only the most saturated primaries can't be);
 *   - a frame taken out of a video is read as a player shows it, and written
 *     as its image format defines colour (a JPEG's YUV is BT.601).
 */

/** Each matrix's red and blue weights (green takes the rest). */
const WEIGHTS = { bt601: [0.299, 0.114], bt709: [0.2126, 0.0722] };

/** RGB (0-1) as Y', Cb, Cr (0-1, -0.5-0.5) in a matrix. */
function toYcbcr([r, g, b], matrix) {
  const [kr, kb] = WEIGHTS[matrix];
  const y = kr * r + (1 - kr - kb) * g + kb * b;
  return [y, (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))];
}

/** Y', Cb, Cr back to RGB (0-1, unclamped) in a matrix. */
function toRgb([y, cb, cr], matrix) {
  const [kr, kb] = WEIGHTS[matrix];
  const r = y + 2 * (1 - kr) * cr;
  const b = y + 2 * (1 - kb) * cb;
  return [r, (y - kr * r - kb * b) / (1 - kr - kb), b];
}

/** The limited-range 8-bit Y, Cb, Cr a colour (RGB, 0-255) is in a matrix (unrounded). */
export function ycbcrOf(rgb, matrix) {
  const [y, cb, cr] = toYcbcr(rgb.map((value) => value / 255), matrix);
  return [16 + 219 * y, 128 + 224 * cb, 128 + 224 * cr];
}

/**
 * The colour (RGB, 0-255) to give a drawing that converts with `drawing`, so
 * the picture holds what `target` makes of `rgb`. As it is when they agree.
 */
export function handedOver(rgb, drawing, target = "bt709") {
  if (drawing === target) return rgb;
  const wanted = toYcbcr(rgb.map((value) => value / 255), target);
  return toRgb(wanted, drawing).map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255));
}

/** A #rrggbb colour handed over (see handedOver). */
export function handedOverHex(hex, drawing, target = "bt709") {
  const rgb = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `#${handedOver(rgb, drawing, target).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** An ASS colour's BBGGRR, handed over. */
function handedBgr(bgr, drawing, target) {
  const padded = bgr.padStart(6, "0");
  const rgb = [4, 2, 0].map((at) => parseInt(padded.slice(at, at + 2), 16));
  const [r, g, b] = handedOver(rgb, drawing, target);
  return [b, g, r].map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join("");
}

/**
 * An ASS script with every colour handed over (see handedOver): the four
 * colours of each style and every colour override (\c, \1c to \4c). Alphas,
 * drawings and everything else are left exactly as they were.
 */
export function scriptForDrawing(script, drawing, target = "bt709") {
  if (drawing === target) return script;
  return script
    .split("\n")
    .map((line) => {
      if (line.startsWith("Style:")) {
        const fields = line.split(",");
        for (const at of [3, 4, 5, 6]) {
          const match = /^&H([0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})$/.exec(fields[at] ?? "");
          if (match) fields[at] = `&H${(match[1] ?? "").toUpperCase()}${handedBgr(match[2], drawing, target)}`;
        }
        return fields.join(",");
      }
      return line.replace(/(\\[1-4]?c&H)([0-9A-Fa-f]{1,6})&/g, (_whole, tag, bgr) => `${tag}${handedBgr(bgr, drawing, target)}&`);
    })
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Pictures into BT.709, and frames out of video                       */
/* ------------------------------------------------------------------ */

/** The scale filter's name for the matrix a colour space tag names (BT.2020's HDR is left as it is: it needs tone mapping). */
const MATRICES = { bt709: "bt709", bt470bg: "bt601", smpte170m: "bt601", fcc: "fcc", smpte240m: "smpte240m" };

/** Pixel formats in RGB (or grey), which come into YUV only by a matrix. */
const RGB_FORMAT = /^(rgb|bgr|argb|abgr|0rgb|0bgr|rgb0|bgr0|gbr|pal8|gray|ya8|ya16|monow|monob|x2rgb|x2bgr)/;

/** Whether a probe is a still image's: its YUV, if it has any, is its format's own (BT.601). */
function stillOf(info) {
  return /(_pipe|^image2)$/.test(info?.format ?? "");
}

/** Whether a probe's picture is in RGB (or grey), with no matrix of its own. */
export function rgbOf(info) {
  return RGB_FORMAT.test(info?.pix_fmt ?? "");
}

/**
 * The matrix a picture's YUV is read in (`info` as probe() or ffprobe's
 * stream gives it): the one its tags name; else a still's format's own
 * (BT.601), or the one a player takes for an untagged video, BT.709 from HD
 * sizes and BT.601 below them. A picture nothing is known of is the studio's
 * own, BT.709.
 */
export function matrixOf(info) {
  const tagged = MATRICES[info?.color_space];
  if (tagged) return tagged;
  if (stillOf(info)) return "bt601";
  if (!info?.width || !info?.height) return "bt709";
  return info.width >= 1280 || info.height > 576 ? "bt709" : "bt601";
}

/** The matrix to bring a picture into when it is laid over or drawn into a video read as `info`: BT.709, or BT.601 for one in it. */
export function matrixOver(info) {
  return matrixOf(info) === "bt601" ? "bt601" : "bt709";
}

/** A picture's range: full for a JPEG-style format or one tagged so, else limited. */
function rangeOf(info) {
  return /^yuvj/.test(info?.pix_fmt ?? "") || info?.color_range === "pc" ? "pc" : "tv";
}

/**
 * The scale filter's options that bring a picture (`info` its probe) into
 * `matrix`'s YUV at limited range, or null for one already in it. Follow them
 * with a YUV format (yuv444p) so the conversion is made there and nowhere else.
 */
export function toMatrix(info, matrix) {
  if (rgbOf(info)) return `out_color_matrix=${matrix}:out_range=tv`;
  const from = matrixOf(info);
  const range = rangeOf(info);
  if (from === matrix && range === "tv") return null;
  return `in_color_matrix=${from}:in_range=${range}:out_color_matrix=${matrix}:out_range=tv`;
}

/** A video's picture into BT.709 (see toMatrix): a motion graphic's RGB master, an SD camera's BT.601. */
export function videoToBt709(info) {
  return toMatrix(info, "bt709");
}

/**
 * The same for a still, into `matrix`'s YUV (BT.709 unless it goes into a
 * video in BT.601): RGB by that matrix, and a JPEG's or WebP's own YUV
 * (BT.601 by their standards; a JPEG's at full range, which the scale filter
 * knows from its format) converted to it.
 */
export function stillTo(matrix = "bt709") {
  return `in_color_matrix=bt601:out_color_matrix=${matrix}:out_range=tv`;
}

export const STILL_TO_BT709 = stillTo("bt709");

/** A picture with transparency (a logo, lettering) into `matrix`'s YUV, keeping its alpha, ready to be laid over a video. */
export function overlayTo(matrix = "bt709") {
  return `scale=${stillTo(matrix)},format=yuva444p`;
}

export const OVERLAY_TO_BT709 = overlayTo("bt709");

/**
 * The scale filter's options that take a picture (a video's frame, or a
 * still) as a viewer sees it into an image in `format`: a JPEG's YUV is
 * BT.601 at full range and a WebP's BT.601 at limited range (as their
 * standards have them); a PNG is RGB.
 */
export function asImage(info, format = "png") {
  const read = `in_color_matrix=${matrixOf(info)}:in_range=${rangeOf(info)}`;
  if (format === "jpg") return `${read}:out_color_matrix=bt601:out_range=pc`;
  if (format === "webp") return `${read}:out_color_matrix=bt601:out_range=tv`;
  return read;
}

/** A render's own picture (BT.709, limited range) as a JPEG's colour: for posters made from it. */
export const RENDER_TO_JPEG = asImage({ color_space: "bt709", pix_fmt: "yuv420p" }, "jpg");

/** Frames tagged as BT.709, so a filter that reads the tags (as newer FFmpeg's do) takes them for it. */
export const BT709_TAGS = "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv";

/** An encoder's options that tag its picture as BT.709 at limited range. */
export const BT709_OUTPUT = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

/**
 * A frame's matrix tag, for a picture whose matrix is `matrix` (bt709 or
 * bt601) and whose range is left as it is: set before something is drawn
 * into it, so a drawing that follows the tag (see padMatrix) knows.
 */
export function matrixTag(matrix) {
  return `setparams=colorspace=${matrix === "bt709" ? "bt709" : "smpte170m"}`;
}

/* ------------------------------------------------------------------ */
/* Which matrix FFmpeg draws with                                      */
/* ------------------------------------------------------------------ */

/** The [Script Info] line that names the matrix a script's colours are for (see buildSubtitles). */
export const SCRIPT_MATRIX = "YCbCr Matrix: TV.709";

const TEAL = [0, 168, 181];

/** A 16 x 16 teal box as an ASS script, its header as the studio's scripts have it. */
function boxScript() {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 16",
    "PlayResY: 16",
    SCRIPT_MATRIX,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Box,Inter,10,&H00B5A800,&H00B5A800,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:00.00,0:00:01.00,Box,,0,0,0,,{\\pos(0,0)\\p1}m 0 0 l 16 0 16 16 0 16{\\p0}",
    "",
  ].join("\n");
}

const drawings = new Map();

/**
 * Which matrix FFmpeg draws a colour into a YUV picture with: BT.601 in every
 * FFmpeg so far, whatever the picture is, though a newer one may follow the
 * script's matrix or the picture's tag. Found once for each kind of drawing,
 * by drawing a teal box the way the render does and reading back what was
 * written; BT.601 if that can't be done.
 */
function measured(key, filter) {
  if (!drawings.has(key)) drawings.set(key, measureDrawing(filter).catch(() => "bt601"));
  return drawings.get(key);
}

/** The matrix captions and titles are drawn with into a render's BT.709 frames (tagged BT709_TAGS). */
export function captionMatrix() {
  return measured("captions", (dir) => `${BT709_TAGS},ass=filename=${join(dir, "box.ass")}`);
}

/** The matrix pad's border is drawn with into frames tagged with matrixTag(`target`). */
export function padMatrix(target) {
  return measured(`pad:${target}`, () => `${matrixTag(target)},pad=32:16:16:0:color=0x00a8b5,crop=16:16:0:0`);
}

async function measureDrawing(filter) {
  const dir = await mkdtemp(join(tmpdir(), "xeno-colour-"));
  try {
    await writeFile(join(dir, "box.ass"), boxScript(), "utf8");
    const out = join(dir, "box.yuv");
    await ffmpeg(["-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.1", "-vf", `format=yuv420p,${filter(dir)}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "yuv444p", out], { timeoutSeconds: 30 });
    const bytes = await readFile(out);
    const at = 8 * 16 + 8;
    const read = [bytes[at], bytes[256 + at], bytes[512 + at]];
    const off = (matrix) => ycbcrOf(TEAL, matrix).reduce((sum, value, index) => sum + (value - read[index]) ** 2, 0);
    return off("bt709") < off("bt601") ? "bt709" : "bt601";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
