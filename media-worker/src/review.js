import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { asImage } from "./colour.js";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { cleanText, inParallel, seekPoint } from "./sequence.js";

/**
 * Review sheets (feature "review_sheet"): frames of a video laid out as one
 * picture, each labelled, to review a render shot by shot (Reel 1's every
 * shot was reviewed as a strip of its beats; HANDOVER.md 2.2, G2). The app
 * asks for each shot half a second in and on its last frame, with the clip's
 * name and the shot's description. Labels are written into a subtitle file
 * the worker makes and draws, never into an FFmpeg argument, and stripped of
 * anything that could act as markup.
 */

export const REVIEW_LIMITS = { tiles: 120, label: 80, note: 200, title: 120, columns: 8 };
/** The tallest a sheet is made (pixels): taller, and it gets more columns. */
const TALLEST = 30_000;
/** The most pixels a sheet may have (50 megapixels), to keep its memory and file in bounds. */
const MOST_PIXELS = 50_000_000;
const MARGIN = 16;
const GAP = 8;
const SHEET_COLOUR = "0x0f1115";
const BAND_COLOUR = "0x1b1f27";

function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

function num(value, { min, max, fallback, name }) {
  if (value === undefined || value === null || value === "") {
    if (fallback === undefined) throw bad(`${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw bad(`${name} must be a number`);
  if (parsed < min || parsed > max) throw bad(`${name} must be between ${min} and ${max}`);
  return parsed;
}

const even = (value) => 2 * Math.round(value / 2);

/** Text for the sheet: one paragraph without markup, cut at a word to at most `max` characters. */
export function sheetText(value, max) {
  const flat = typeof value === "string" ? value.replace(/\s+/g, " ") : "";
  const text = cleanText(flat, 2000).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The task's parameters, validated: the frames (each a time, a label and a note), the columns, the tiles' width, a title. */
export function planReviewSheet(params) {
  const p = params && typeof params === "object" ? params : {};
  const raw = Array.isArray(p.tiles) ? p.tiles : [];
  if (!raw.length) throw bad("A review sheet needs at least one frame");
  if (raw.length > REVIEW_LIMITS.tiles)
    throw bad(`A review sheet holds at most ${REVIEW_LIMITS.tiles} frames`);
  const tiles = raw.map((tile, index) => {
    const item = tile && typeof tile === "object" ? tile : {};
    return {
      time: num(item.time, { min: 0, max: 86_400, name: `frame ${index + 1} time` }),
      label: sheetText(item.label, REVIEW_LIMITS.label),
      note: sheetText(item.note, REVIEW_LIMITS.note),
    };
  });
  const columns = Math.round(
    num(p.columns, { min: 1, max: REVIEW_LIMITS.columns, fallback: 4, name: "columns" }),
  );
  return {
    tiles,
    columns: Math.min(columns, tiles.length),
    tileWidth: even(num(p.tile_width, { min: 120, max: 640, fallback: 270, name: "tile_width" })),
    title: sheetText(p.title, REVIEW_LIMITS.title),
  };
}

/**
 * Where everything goes on the sheet: tiles in the video's shape, each over a
 * band for its label (one line) and note (three); a heading band for the title.
 * A sheet that would be taller than TALLEST takes more columns, and one with
 * more than MOST_PIXELS is refused.
 */
export function sheetGeometry(plan, videoWidth, videoHeight) {
  const tileWidth = plan.tileWidth;
  const tileHeight = Math.max(2, even((tileWidth * videoHeight) / videoWidth));
  const labelSize = Math.max(12, Math.round(tileWidth * 0.056));
  const noteSize = Math.max(11, Math.round(tileWidth * 0.048));
  const pad = Math.round(labelSize * 0.5);
  const band = even(pad * 2 + labelSize * 1.35 + noteSize * 1.3 * 3);
  const header = plan.title ? even(labelSize * 2.8) : 0;
  const tall = (columns) => {
    const rows = Math.ceil(plan.tiles.length / columns);
    return MARGIN * 2 + header + rows * (tileHeight + band) + (rows - 1) * GAP;
  };
  let columns = plan.columns;
  while (columns < REVIEW_LIMITS.columns && columns < plan.tiles.length && tall(columns) > TALLEST)
    columns += 1;
  const rows = Math.ceil(plan.tiles.length / columns);
  const width = MARGIN * 2 + columns * tileWidth + (columns - 1) * GAP;
  const height = tall(columns);
  if (width * height > MOST_PIXELS)
    throw bad(
      `A review sheet of ${width} x ${height} pixels would be too big: show fewer frames or smaller tiles`,
    );
  return {
    tileWidth,
    tileHeight,
    band,
    labelSize,
    noteSize,
    pad,
    header,
    columns,
    rows,
    width,
    height,
  };
}

/** Where tile `index`'s label band starts, on the sheet. */
function bandAt(geometry, index) {
  const column = index % geometry.columns;
  const row = Math.floor(index / geometry.columns);
  return {
    x: MARGIN + column * (geometry.tileWidth + GAP),
    y:
      geometry.header +
      MARGIN +
      row * (geometry.tileHeight + geometry.band + GAP) +
      geometry.tileHeight,
  };
}

/**
 * The sheet's text as an ASS script: the title in the heading band, and each
 * tile's label and note in its band, each held to the band's width (an event's
 * margins make its box) and to the lines it has room for.
 */
export function sheetScript(plan, geometry) {
  const { width, height, labelSize, noteSize, pad, tileWidth } = geometry;
  const box = tileWidth - pad * 2;
  // About as many characters as fit: Inter's average letter is about half its size across.
  const labelChars = Math.max(8, Math.floor(box / (labelSize * 0.56)));
  const noteChars = Math.max(12, Math.floor(box / (noteSize * 0.5)) * 3 - 1);
  const style = (name, size, colour, bold) =>
    `Style: ${name},Inter,${size},${colour},&H000000FF,&H00000000,&H00000000,${bold ? -1 : 0},0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`;
  const event = (name, left, top, text) =>
    `Dialogue: 0,0:00:00.00,0:00:10.00,${name},,${left},${Math.max(0, width - left - box)},${top},,${text}`;
  const events = [];
  if (plan.title)
    events.push(event("Title", MARGIN, Math.round(geometry.header * 0.3), plan.title));
  for (const [index, tile] of plan.tiles.entries()) {
    const { x, y } = bandAt(geometry, index);
    const left = x + pad;
    if (tile.label) events.push(event("Label", left, y + pad, sheetText(tile.label, labelChars)));
    if (tile.note)
      events.push(
        event(
          "Note",
          left,
          y + pad + Math.round(labelSize * 1.35),
          sheetText(tile.note, noteChars),
        ),
      );
  }
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("Title", Math.round(labelSize * 1.3), "&H00FFFFFF", true),
    style("Label", labelSize, "&H00FFFFFF", true),
    style("Note", noteSize, "&H00C8C0B8", false),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

/**
 * review_sheet: a video (one source) and its frames to show (`tiles`), to one
 * JPEG. Each frame is taken at its time (the frame shown then; a time past the
 * end takes the last), scaled to the tile, over its label band; the tiles are
 * laid out in rows, and the text drawn last.
 */
export async function reviewSheet({ sources, params, dir }) {
  const plan = planReviewSheet(params);
  const video = sources[0];
  const info = await probe(video.path);
  if (!info.width || !info.height) throw bad("The review sheet's source has no picture");
  const geometry = sheetGeometry(plan, info.width, info.height);
  const rate = info.fps && info.fps > 0 ? info.fps : 30;
  const last = Math.max(0, (info.video_duration_seconds ?? info.duration_seconds ?? 0) - 1 / rate);
  const { tileWidth, tileHeight, band } = geometry;
  await inParallel(
    plan.tiles.map((tile, index) => ({ tile, index })),
    2,
    async ({ tile, index }) => {
      const out = join(dir, `sheet-tile-${String(index + 1).padStart(3, "0")}.png`);
      await ffmpeg([
        "-ss",
        seekPoint(Math.min(tile.time, last)).toFixed(6),
        "-i",
        video.path,
        "-frames:v",
        "1",
        "-vf",
        // As a player shows the frame, in RGB, so the band is drawn as the colour it is (see ./colour.js).
        `scale=${tileWidth}:${tileHeight}:flags=lanczos:${asImage(info, "png")},format=rgb24,setsar=1,pad=${tileWidth}:${tileHeight + band}:0:0:color=${BAND_COLOUR}`,
        out,
      ]);
    },
  );
  const script = join(dir, "sheet.ass");
  await writeFile(script, sheetScript(plan, geometry), "utf8");
  const out = join(dir, "review-sheet.jpg");
  await ffmpeg([
    "-framerate",
    "1",
    "-i",
    join(dir, "sheet-tile-%03d.png"),
    "-vf",
    `tile=layout=${geometry.columns}x${geometry.rows}:margin=${MARGIN}:padding=${GAP}:color=${SHEET_COLOUR},` +
      `pad=${geometry.width}:${geometry.height}:0:${geometry.header}:color=${SHEET_COLOUR},ass=filename=${script}`,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    out,
  ]);
  return {
    outputs: [{ path: out, mime: "image/jpeg", kind: "image" }],
    metadata: {
      tiles: plan.tiles.length,
      columns: geometry.columns,
      rows: geometry.rows,
      width: geometry.width,
      height: geometry.height,
      tile_width: tileWidth,
      tile_height: tileHeight,
    },
  };
}
