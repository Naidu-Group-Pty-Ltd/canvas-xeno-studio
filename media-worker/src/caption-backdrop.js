import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { ffmpeg } from "./ffmpeg.js";
import { LIGHT_BACKDROP } from "./brand-captions.js";
import { brandCaptionPlan, roughFaces } from "./caption-script.js";

/**
 * How light the picture is behind each caption line, measured on the clips a
 * render has just prepared, at the line's times, over the area its panel
 * covers. A panel that follows the picture is a light card over a light one
 * and the glass over a dark one, and the glass is nearer opaque the lighter
 * the picture: Reel 1's glass read as a grey slab over white report pages
 * until it was made 88 to 93% opaque. Where the picture behind the captions
 * turns from light to dark (or back) at a cut, a brand caption run ends
 * there.
 *
 * A lightness is 0 (black) to 1 (white): the picture's luma, read as grey.
 */

/** Whether a render's captions are set over the lightness behind them. */
export function backdropWanted(captions) {
  if (!captions) return false;
  const panel = captions.panel ?? (captions.style === "brand" ? "auto" : null);
  return panel === "auto" || panel === "dark";
}

/** A classic caption's lines, roughly: how many lines its text takes, and how wide the widest is. */
function classicBlock(text, fontSize, room) {
  const lines = String(text).split("\n");
  let count = 0;
  let widest = 0;
  for (const line of lines) {
    const natural = line.length * fontSize * 0.52;
    count += Math.max(1, Math.ceil(natural / room));
    widest = Math.max(widest, Math.min(room, natural));
  }
  return { count, widest };
}

/**
 * Where each caption line's panel sits on the frame: brand captions from
 * their layout (the panel around each line's words), the others from their
 * style's size and place, around their text.
 */
export function captionAreas(plan) {
  const { width, height, captions } = plan;
  if (captions.style === "brand") {
    const { geometry, cues } = brandCaptionPlan(plan, captions.faces ?? roughFaces());
    return cues.map((cue) => {
      const w = cue.layout.box.width + 2 * geometry.padX;
      const h = cue.layout.box.height + 2 * geometry.padY;
      return {
        x0: geometry.centreX - w / 2,
        y0: geometry.centreY - h / 2,
        x1: geometry.centreX + w / 2,
        y1: geometry.centreY + h / 2,
      };
    });
  }
  // As sequence.js sets the classic styles: their size, their margins and where they sit.
  const short = Math.min(width, height);
  const portrait = height > width;
  const fontSize = Math.round(short * 0.058 * captions.size);
  const margin = Math.round(width * 0.08);
  const pad = Math.round(fontSize * 0.25);
  const marginV =
    captions.position === "bottom"
      ? Math.round(height * (portrait ? 0.12 : 0.07))
      : captions.position === "lower_third"
        ? Math.round(height * (portrait ? 0.24 : 0.14))
        : Math.round(height * (portrait ? 0.14 : 0.08));
  return captions.segments.map((segment) => {
    const { count, widest } = classicBlock(segment.text, fontSize, width - 2 * margin);
    const h = count * fontSize * 1.2;
    const top =
      captions.position === "top"
        ? marginV
        : captions.position === "center"
          ? height / 2 - h / 2
          : height - marginV - h;
    return {
      x0: width / 2 - widest / 2 - pad,
      y0: top - pad,
      x1: width / 2 + widest / 2 + pad,
      y1: top + h + pad,
    };
  });
}

/** The moments a line is measured at: just after it arrives, its middle, and just before it goes. */
export function sampleTimes({ start, end }, fps) {
  const last = Math.max(start, end - 1 / fps);
  const times = [start + 0.1, (start + end) / 2, end - 0.1].map((t) =>
    Math.min(last, Math.max(start, t)),
  );
  return [...new Set(times.map((t) => Number(t.toFixed(6))))].sort((a, b) => a - b);
}

/**
 * The clip on screen at a time, and the frame of its intermediate that shows
 * it. During a transition the clip coming in counts from its middle.
 */
export function clipFrameAt(plan, t) {
  const frame = Math.max(0, Math.min(plan.totalFrames - 1, Math.floor(t * plan.fps + 1e-6)));
  let chosen = null;
  plan.clips.forEach((clip, index) => {
    if (frame < clip.startFrame || frame >= clip.startFrame + clip.durationFrames) return;
    if (chosen === null || frame >= clip.startFrame + clip.transitionFrames / 2) chosen = index;
  });
  if (chosen === null) return null;
  const clip = plan.clips[chosen];
  return { clip: chosen, frame: Math.min(clip.durationFrames - 1, frame - clip.startFrame) };
}

/** A lightness from grey cells (0-255): the 75th percentile, so lighter parts count. */
export function lightness(cells) {
  if (!cells.length) return null;
  const sorted = [...cells].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] / 255;
}

/**
 * The times the picture behind the captions turns from light to dark, or
 * back, at a cut: where a clip measured light follows one measured dark (or
 * the other way round), at the clip's start.
 */
export function paletteCuts(plan, measured) {
  const cuts = [];
  let previous = null;
  plan.clips.forEach((clip, index) => {
    const value = measured.get(index);
    if (value === undefined) return;
    const light = value >= LIGHT_BACKDROP;
    if (previous !== null && light !== previous) cuts.push(clip.startFrame / plan.fps);
    previous = light;
  });
  return cuts;
}

/**
 * Measures the lightness behind each caption line (its lightest moment), and
 * where the picture's palette changes at a cut: one FFmpeg pass a clip with
 * captions over it, each picking the frames wanted and shrinking the band
 * the captions sit in to cells about 16 pixels square.
 */
export async function measureCaptionBackdrops(
  plan,
  intermediates,
  dir,
  limit,
  areas = captionAreas(plan),
) {
  const { width, height, fps, captions } = plan;
  // Each line's samples, gathered by the clip they fall in.
  const byClip = new Map();
  captions.segments.forEach((segment, line) => {
    for (const t of sampleTimes(segment, fps)) {
      const at = clipFrameAt(plan, t);
      if (!at) continue;
      if (!byClip.has(at.clip)) byClip.set(at.clip, []);
      byClip.get(at.clip).push({ line, frame: at.frame });
    }
  });
  const backdrops = captions.segments.map(() => null);
  const perClip = new Map();
  for (const [clip, samples] of byClip) {
    const wanted = samples.map((sample) => areas[sample.line]);
    const x = Math.max(0, Math.floor(Math.min(...wanted.map((area) => area.x0))));
    const y = Math.max(0, Math.floor(Math.min(...wanted.map((area) => area.y0))));
    const w = Math.max(
      2,
      Math.min(width, Math.ceil(Math.max(...wanted.map((area) => area.x1)))) - x,
    );
    const h = Math.max(
      2,
      Math.min(height, Math.ceil(Math.max(...wanted.map((area) => area.y1)))) - y,
    );
    const cols = Math.max(1, Math.min(96, Math.round(w / 16)));
    const rows = Math.max(1, Math.min(48, Math.round(h / 16)));
    const frames = [...new Set(samples.map((sample) => sample.frame))].sort((a, b) => a - b);
    const out = join(dir, `backdrop-${clip}.gray`);
    await ffmpeg(
      [
        "-i",
        intermediates[clip],
        "-vf",
        `select=${frames.map((frame) => `eq(n\\,${frame})`).join("+")},crop=${w}:${h}:${x}:${y},scale=${cols}:${rows}:flags=area,format=gray`,
        "-fps_mode",
        "passthrough",
        "-f",
        "rawvideo",
        out,
      ],
      limit,
    );
    const planes = await readFile(out);
    await rm(out, { force: true });
    for (const sample of samples) {
      const at = frames.indexOf(sample.frame);
      if ((at + 1) * cols * rows > planes.length) continue;
      const area = areas[sample.line];
      const cells = [];
      for (let row = 0; row < rows; row += 1) {
        const middle = y + ((row + 0.5) * h) / rows;
        if (middle < area.y0 || middle > area.y1) continue;
        for (let col = 0; col < cols; col += 1) {
          const centre = x + ((col + 0.5) * w) / cols;
          if (centre >= area.x0 && centre <= area.x1)
            cells.push(planes[at * cols * rows + row * cols + col]);
        }
      }
      const value = lightness(cells);
      if (value === null) continue;
      backdrops[sample.line] = Math.max(backdrops[sample.line] ?? 0, value);
      perClip.set(clip, Math.max(perClip.get(clip) ?? 0, value));
    }
  }
  return {
    backdrops: backdrops.map((value) => (value === null ? null : Number(value.toFixed(4)))),
    cuts: paletteCuts(plan, perClip),
  };
}
