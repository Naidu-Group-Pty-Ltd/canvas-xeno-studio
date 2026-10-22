import { join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { config } from "./config.js";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { planeThumbnail, SEAM_EASE_SECONDS, seamCorrection, seamEaseChain } from "./seam.js";
import { easedWarpFilter, joinHeadChain, JOIN_SOUND_SECONDS, measureJoin } from "./joins.js";
import { fontFamily, fontStyle, sfntKind } from "./fonts.js";
import { brandCaptionEvents, brandFaces, classicPanel, roughFaces } from "./caption-script.js";
import { backdropWanted, measureCaptionBackdrops } from "./caption-backdrop.js";
import { CAPTION_PANELS } from "./brand-captions.js";

/**
 * Sequence rendering: an edited timeline (ordered clips with trims, stills,
 * transitions, the clips' own sound, voiceover, music, captions and titles)
 * rendered to one finished video.
 *
 * Everything here is built from validated, typed values. Text that reaches the
 * picture is written into an ASS subtitle file the worker creates itself; it is
 * never interpolated into an FFmpeg argument.
 *
 * Rendering runs in passes so memory stays flat however long the timeline is:
 *   1. each clip is normalised on its own to the output frame, frame rate and
 *      audio format, at an exact duration (stills get their motion here);
 *   2. the audio is mixed: the clips' sound with matching cross-fades, then
 *      voiceover, music (optionally dipped wherever the voice speaks) and
 *      effects;
 *   3. the mix is measured for loudness;
 *   4. the picture is assembled with its transitions, captions and fades, and
 *      encoded once with the normalised mix.
 */

export const SEQUENCE_LIMITS = {
  clips: 60,
  audio: 16,
  captions: 600,
  overlays: 20,
  /** Pictures laid over the edit (a brand's logo). */
  images: 8,
  /** A brand's own font files: a display face and its italic, a body face, a mono and more (feature more_fonts). */
  fonts: 12,
  totalSeconds: 600,
  textLength: 220,
};

/** Transitions offered to editors, by FFmpeg xfade name. "cut" means no transition. */
export const TRANSITIONS = new Set([
  "cut",
  "fade",
  "dissolve",
  "fadeblack",
  "fadewhite",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "slideup",
  "slidedown",
  "smoothleft",
  "smoothright",
  "smoothup",
  "smoothdown",
  "circleopen",
  "circleclose",
  "radial",
  "zoomin",
  "pixelize",
  "hblur",
]);

const FITS = new Set(["cover", "contain", "blur_pad"]);
const MOTIONS = new Set(["none", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]);
const AUDIO_ROLES = new Set(["voiceover", "music", "sfx"]);
// "brand": word by word, in the brand's type (feature brand_captions; see ./brand-captions.js).
const CAPTION_STYLES = new Set(["clean", "boxed", "bold", "minimal", "brand"]);
/** The most words a brand caption line carries times for. */
const CAPTION_WORDS = 60;
const CAPTION_POSITIONS = new Set(["bottom", "lower_third", "center", "top"]);
const OVERLAY_STYLES = new Set(["title", "subtitle", "cta"]);
const OVERLAY_BACKINGS = new Set(["outline", "halo", "box"]);
const FPS_VALUES = new Set([24, 25, 30, 60]);
/**
 * How a clip made at another frame rate (24 fps B-roll in a 30 fps edit) is
 * brought to the edit's: "duplicate" repeats frames (as ever; a slow camera
 * move can judder), "blend" mixes neighbouring frames, and "motion" makes the
 * missing frames from the movement between them (smoothest, and much slower).
 */
export const RETIME_MODES = new Set(["duplicate", "blend", "motion"]);
/** How pictures are scaled: "sharp" uses Lanczos and a light unsharp mask, for 720p sources in a 1080p edit. */
const UPSCALE_MODES = new Set(["standard", "sharp"]);

/* ------------------------------------------------------------------ */
/* Validation and planning                                             */
/* ------------------------------------------------------------------ */

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

function choice(value, allowed, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const key = String(value).toLowerCase();
  if (!allowed.has(key)) throw bad(`${name} "${value}" is not supported`);
  return key;
}

/** A colour as #rrggbb, or null when none is given. */
function colour(value, name) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw bad(`${name} must be a colour like #1a2b3c`);
  return value.toLowerCase();
}

/** A font family's name, as text sets it: letters, numbers, spaces and a little punctuation. */
function family(value, name) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[\p{L}\p{N} ._'&+-]{1,80}$/u.test(value.trim())) throw bad(`${name} isn't a font name`);
  return value.trim();
}

function even(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * A brand caption line's words, each with its time (seconds from the line's
 * start, as measured from the voiceover; none: spread evenly), and its
 * emphasis: the words [from, to) set in the italic.
 */
function brandLine(segment, index) {
  const what = `caption ${index + 1}`;
  let words = null;
  if (segment.words !== undefined && segment.words !== null) {
    if (!Array.isArray(segment.words)) throw bad(`${what} words must be a list`);
    if (segment.words.length > CAPTION_WORDS) throw bad(`${what} may time at most ${CAPTION_WORDS} words`);
    words = segment.words.map((raw, at) => {
      const word = raw && typeof raw === "object" ? raw : {};
      const text = cleanText(word.text, 80).replace(/\n/g, " ");
      if (!text) throw bad(`${what} word ${at + 1} has no text`);
      return {
        text,
        start: num(word.start, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `${what} word ${at + 1} start` }),
        end: num(word.end, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `${what} word ${at + 1} end` }),
      };
    });
  }
  let emphasis = null;
  if (segment.emphasis !== undefined && segment.emphasis !== null) {
    const count = words?.length ?? cleanText(segment.text).split(/\s+/).filter(Boolean).length;
    const [from, to] = Array.isArray(segment.emphasis) ? segment.emphasis : [];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > count || from >= to) {
      throw bad(`${what} emphasis must be two word positions within the line`);
    }
    emphasis = [from, to];
  }
  return { words, emphasis };
}

/** Rounds a duration onto the frame grid so every offset lands on a frame boundary. */
function frames(seconds, fps) {
  return Math.round(seconds * fps);
}

/** Strips anything that could act as ASS markup or a control character. */
export function cleanText(value, max = SEQUENCE_LIMITS.textLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/[{}\\]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .slice(0, max);
}

/**
 * The mixer's channel levels (0–2, default 1): the clips' own sound
 * ("picture"), the voiceover, music and sound effects. Each scales its whole
 * bus before the final mix, on top of the items' own volumes.
 */
export const MIX_CHANNELS = ["picture", "voiceover", "music", "sfx"];

function planMix(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    MIX_CHANNELS.map((channel) => [
      channel,
      num(value[channel], { min: 0, max: 2, fallback: 1, name: `mix ${channel}` }),
    ]),
  );
}

/**
 * Validates the timeline and turns it into a render plan with exact,
 * frame-aligned timings. Pure: no I/O, so it is unit-testable.
 *
 * `sources` are the downloaded inputs, each with a role of "video", "image" or
 * "audio" as declared by the app.
 */
export function planSequence(params, sources) {
  const p = params && typeof params === "object" ? params : {};
  const width = even(num(p.width, { min: 128, max: 3840, fallback: 1080, name: "width" }));
  const height = even(num(p.height, { min: 128, max: 3840, fallback: 1920, name: "height" }));
  const fps = num(p.fps, { min: 24, max: 60, fallback: 30, name: "fps" });
  if (!FPS_VALUES.has(fps)) throw bad("fps must be 24, 25, 30 or 60");
  const fit = choice(p.fit, FITS, "cover", "fit");
  const mix = planMix(p.mix);
  const retime = choice(p.frame_rate_conversion, RETIME_MODES, "duplicate", "frame_rate_conversion");
  const upscale = choice(p.upscale, UPSCALE_MODES, "standard", "upscale");

  const rawClips = Array.isArray(p.clips) ? p.clips : [];
  if (rawClips.length === 0) throw bad("A sequence needs at least one clip");
  if (rawClips.length > SEQUENCE_LIMITS.clips) throw bad(`A sequence may contain at most ${SEQUENCE_LIMITS.clips} clips`);

  const sourceAt = (index, roles, what) => {
    const position = num(index, { min: 0, max: sources.length - 1, name: `${what} source_index` });
    if (!Number.isInteger(position)) throw bad(`${what} source_index must be a whole number`);
    const source = sources[position];
    if (!source || !roles.includes(source.role)) throw bad(`${what} refers to a source of the wrong kind`);
    return position;
  };

  const minFrames = 2;
  const clips = rawClips.map((raw, index) => {
    const clip = raw && typeof raw === "object" ? raw : {};
    const kind = choice(clip.kind, new Set(["video", "image"]), "video", `clip ${index + 1} kind`);
    const source = sourceAt(clip.source_index, kind === "image" ? ["image"] : ["video"], `Clip ${index + 1}`);
    const durationFrames = frames(num(clip.duration, { min: 0.1, max: 300, name: `clip ${index + 1} duration` }), fps);
    if (durationFrames < minFrames) throw bad(`Clip ${index + 1} is too short`);
    const speed = kind === "image" ? 1 : num(clip.speed, { min: 0.25, max: 4, fallback: 1, name: `clip ${index + 1} speed` });
    const transitionRaw = clip.transition && typeof clip.transition === "object" ? clip.transition : {};
    let transitionType = choice(transitionRaw.type, TRANSITIONS, "cut", `clip ${index + 1} transition`);
    let transitionFrames =
      transitionType === "cut" ? 0 : frames(num(transitionRaw.duration, { min: 0, max: 3, fallback: 0.5, name: `clip ${index + 1} transition duration` }), fps);
    if (index === 0 || transitionFrames === 0) {
      transitionType = "cut";
      transitionFrames = 0;
    }
    return {
      kind,
      source,
      trimStart: kind === "image" ? 0 : num(clip.trim_start, { min: 0, max: 86_400, fallback: 0, name: `clip ${index + 1} trim_start` }),
      durationFrames,
      speed,
      volume: kind === "image" ? 0 : num(clip.volume, { min: 0, max: 2, fallback: 1, name: `clip ${index + 1} volume` }),
      fit: choice(clip.fit, FITS, fit, `clip ${index + 1} fit`),
      // Filling the frame: the point of the picture (0-1 across and down) kept in it.
      focus: {
        x: num(clip.focus_x, { min: 0, max: 1, fallback: 0.5, name: `clip ${index + 1} focus_x` }),
        y: num(clip.focus_y, { min: 0, max: 1, fallback: 0.5, name: `clip ${index + 1} focus_y` }),
      },
      motion: choice(clip.motion, MOTIONS, "none", `clip ${index + 1} motion`),
      transitionType,
      transitionFrames,
      // Carries straight on from the clip before (a long video's join): its
      // colour is eased in from that clip's last frame. A smart join puts the
      // two in register too (framing, colour, detail and sound; see ./joins.js).
      matchPrevious: kind === "video" && index > 0 && (clip.match_previous === true || clip.join === "smart"),
      smartJoin: kind === "video" && index > 0 && clip.join === "smart",
      // The clip's own sound fades in or out over a few milliseconds where it
      // meets a clip at a smart cut, so the cut can't click.
      soundIn: false,
      soundOut: false,
    };
  });

  // A transition can only overlap what both neighbours have, and two
  // transitions may not overlap inside one clip. Shorten rather than refuse.
  for (let index = 1; index < clips.length; index += 1) {
    const clip = clips[index];
    if (clip.transitionFrames === 0) continue;
    const previous = clips[index - 1];
    const usedByPrevious = previous.transitionFrames;
    const room = Math.min(previous.durationFrames - usedByPrevious, clip.durationFrames) - 1;
    clip.transitionFrames = Math.max(0, Math.min(clip.transitionFrames, room));
    if (clip.transitionFrames < 2) {
      clip.transitionFrames = 0;
      clip.transitionType = "cut";
    }
  }

  for (let index = 1; index < clips.length; index += 1) {
    if (!clips[index].smartJoin || clips[index].transitionFrames > 0 || clips[index - 1].kind !== "video") continue;
    clips[index].soundIn = true;
    clips[index - 1].soundOut = true;
  }

  let cursor = 0;
  for (const clip of clips) {
    clip.startFrame = cursor - clip.transitionFrames;
    cursor = clip.startFrame + clip.durationFrames;
  }
  const totalFrames = cursor;
  const total = totalFrames / fps;
  if (total > SEQUENCE_LIMITS.totalSeconds) throw bad(`A sequence may run at most ${SEQUENCE_LIMITS.totalSeconds} seconds`);

  const rawAudio = Array.isArray(p.audio) ? p.audio : [];
  if (rawAudio.length > SEQUENCE_LIMITS.audio) throw bad(`At most ${SEQUENCE_LIMITS.audio} audio tracks are supported`);
  const audio = [];
  for (const [index, raw] of rawAudio.entries()) {
    const item = raw && typeof raw === "object" ? raw : {};
    const role = choice(item.role, AUDIO_ROLES, "music", `audio ${index + 1} role`);
    const source = sourceAt(item.source_index, ["audio"], `Audio ${index + 1}`);
    if (mix[role] === 0) continue; // its channel is silent
    const start = num(item.start, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, fallback: 0, name: `audio ${index + 1} start` });
    if (start >= total - 0.05) continue; // starts after the picture ends
    const requested = item.duration === undefined || item.duration === null || item.duration === ""
      ? null
      : num(item.duration, { min: 0.1, max: SEQUENCE_LIMITS.totalSeconds, name: `audio ${index + 1} duration` });
    const length = Math.min(requested ?? total - start, total - start);
    const fadeIn = num(item.fade_in, { min: 0, max: 10, fallback: 0, name: `audio ${index + 1} fade_in` });
    const fadeOut = num(item.fade_out, { min: 0, max: 10, fallback: 0, name: `audio ${index + 1} fade_out` });
    audio.push({
      role,
      source,
      start,
      trimStart: num(item.trim_start, { min: 0, max: 86_400, fallback: 0, name: `audio ${index + 1} trim_start` }),
      length,
      lengthIsOpen: requested === null,
      volume: num(item.volume, { min: 0, max: 2, fallback: 1, name: `audio ${index + 1} volume` }),
      fadeIn: Math.min(fadeIn, length / 2),
      fadeOut: Math.min(fadeOut, length / 2),
      loop: role === "music" && item.loop === true,
      duck: role === "music" && item.duck !== false,
      duckLevel: num(item.duck_level, { min: 0.05, max: 1, fallback: 0.25, name: `audio ${index + 1} duck_level` }),
    });
  }

  const captionsRaw = p.captions && typeof p.captions === "object" ? p.captions : null;
  let captions = null;
  if (captionsRaw && Array.isArray(captionsRaw.segments) && captionsRaw.segments.length) {
    if (captionsRaw.segments.length > SEQUENCE_LIMITS.captions) throw bad(`At most ${SEQUENCE_LIMITS.captions} caption lines are supported`);
    const style = choice(captionsRaw.style, CAPTION_STYLES, "clean", "caption style");
    const segments = captionsRaw.segments
      .map((raw, index) => {
        const segment = raw && typeof raw === "object" ? raw : {};
        const start = num(segment.start, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `caption ${index + 1} start` });
        const end = num(segment.end, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `caption ${index + 1} end` });
        const line = { start: Math.min(start, total), end: Math.min(end, total), text: cleanText(segment.text) };
        // Brand captions: each word's time (seconds from the line's start) and the phrase it leans on.
        return style === "brand" ? { ...line, ...brandLine(segment, index) } : line;
      })
      .filter((segment) => segment.text && segment.end - segment.start >= 0.1)
      .sort((a, b) => a.start - b.start);
    if (segments.length) {
      captions = {
        style,
        position: choice(captionsRaw.position, CAPTION_POSITIONS, "lower_third", "caption position"),
        size: num(captionsRaw.size, { min: 0.5, max: 2, fallback: 1, name: "caption size" }),
        uppercase: captionsRaw.uppercase === true,
        // A brand's look (feature brand_text): its font, its text colour, and its accent (the box, or bold text).
        font: family(captionsRaw.font, "caption font"),
        color: colour(captionsRaw.color, "caption color"),
        accent: colour(captionsRaw.accent, "caption accent"),
        // What is behind the words, where chosen (feature caption_panel): one following the
        // picture, a light card, the glass, a solid panel in the brand's colour, or none.
        panel: choice(captionsRaw.panel, new Set(CAPTION_PANELS), null, "caption panel"),
        panelColor: colour(captionsRaw.panel_color, "caption panel_color"),
        segments,
      };
    }
  }

  const rawOverlays = Array.isArray(p.overlays) ? p.overlays : [];
  if (rawOverlays.length > SEQUENCE_LIMITS.overlays) throw bad(`At most ${SEQUENCE_LIMITS.overlays} text overlays are supported`);
  const overlays = rawOverlays
    .map((raw, index) => {
      const overlay = raw && typeof raw === "object" ? raw : {};
      const start = num(overlay.start, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `overlay ${index + 1} start` });
      const end = num(overlay.end, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `overlay ${index + 1} end` });
      return {
        start: Math.min(start, total),
        end: Math.min(end, total),
        text: cleanText(overlay.text, 160),
        style: choice(overlay.style, OVERLAY_STYLES, "title", `overlay ${index + 1} style`),
        position: choice(overlay.position, new Set(["top", "center", "bottom"]), "center", `overlay ${index + 1} position`),
        // Its height on the frame (the middle of the text, 0 top to 1 bottom), when set; else its position.
        y: overlay.y === undefined || overlay.y === null ? null : num(overlay.y, { min: 0.04, max: 0.96, name: `overlay ${index + 1} y` }),
        // What keeps it readable: its outline (as ever), a soft dark halo, or a box behind it.
        backing: choice(overlay.backing, OVERLAY_BACKINGS, "outline", `overlay ${index + 1} backing`),
        // A brand's look: its font, its text colour, and its accent (a box's or a call to action's badge).
        font: family(overlay.font, `overlay ${index + 1} font`),
        color: colour(overlay.color, `overlay ${index + 1} color`),
        accent: colour(overlay.accent, `overlay ${index + 1} accent`),
      };
    })
    .filter((overlay) => overlay.text && overlay.end - overlay.start >= 0.1);

  // Pictures laid over the edit (feature image_overlays): a logo, centred
  // where it is put (0-1 across and down), so wide a share of the frame.
  const rawImages = Array.isArray(p.images) ? p.images : [];
  if (rawImages.length > SEQUENCE_LIMITS.images) throw bad(`At most ${SEQUENCE_LIMITS.images} pictures can be laid over an edit`);
  const images = rawImages
    .map((raw, index) => {
      const image = raw && typeof raw === "object" ? raw : {};
      const what = `image ${index + 1}`;
      const start = Math.min(num(image.start, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `${what} start` }), total);
      const end = Math.min(num(image.end, { min: 0, max: SEQUENCE_LIMITS.totalSeconds, name: `${what} end` }), total);
      return {
        source: sourceAt(image.source_index, ["image"], what[0].toUpperCase() + what.slice(1)),
        start,
        end,
        x: num(image.x, { min: 0, max: 1, fallback: 0.5, name: `${what} x` }),
        y: num(image.y, { min: 0, max: 1, fallback: 0.5, name: `${what} y` }),
        width: num(image.width, { min: 0.03, max: 1, fallback: 0.3, name: `${what} width` }),
        opacity: num(image.opacity, { min: 0, max: 1, fallback: 1, name: `${what} opacity` }),
        fade: Math.min(num(image.fade, { min: 0, max: 2, fallback: 0.3, name: `${what} fade` }), (end - start) / 2),
      };
    })
    .filter((image) => image.end - image.start >= 0.1 && image.opacity > 0);

  // A brand's own fonts (feature brand_text): each a font file, by the family text asks for.
  const rawFonts = Array.isArray(p.fonts) ? p.fonts : [];
  if (rawFonts.length > SEQUENCE_LIMITS.fonts) throw bad(`At most ${SEQUENCE_LIMITS.fonts} font files are supported`);
  const fonts = rawFonts.map((raw, index) => {
    const font = raw && typeof raw === "object" ? raw : {};
    return {
      source: sourceAt(font.source_index, ["font"], `Font ${index + 1}`),
      family: family(font.family, `font ${index + 1} family`) ?? `Font ${index + 1}`,
    };
  });

  const introFade = num(p.fade_in, { min: 0, max: 3, fallback: 0, name: "fade_in" });
  const outroFade = num(p.fade_out, { min: 0, max: 3, fallback: 0, name: "fade_out" });

  return {
    width,
    height,
    fps,
    retime,
    upscale,
    // A silent picture channel leaves the clips' own sound out altogether.
    clips: mix.picture === 0 ? clips.map((clip) => ({ ...clip, volume: 0 })) : clips,
    audio,
    mix,
    captions,
    overlays,
    images,
    fonts,
    totalFrames,
    total,
    introFade: Math.min(introFade, total / 3),
    outroFade: Math.min(outroFade, total / 3),
    normalize: p.normalize_loudness !== false,
    loudness: num(p.loudness_lufs, { min: -24, max: -9, fallback: -14, name: "loudness_lufs" }),
  };
}

/* ------------------------------------------------------------------ */
/* Filter building blocks                                              */
/* ------------------------------------------------------------------ */

const seconds = (value) => value.toFixed(6);

/**
 * Scales one stream into a WxH frame, as a filtergraph segment with unique
 * labels. Filling the frame, it crops around `focus` (the centre by default).
 */
export function frameChain(input, output, width, height, fit, tag, focus = { x: 0.5, y: 0.5 }, sharp = false) {
  // Sharp: Lanczos for the picture itself, then a light unsharp mask (the blurred backdrop stays as it is).
  const flags = sharp ? ":flags=lanczos" : "";
  const crisp = sharp ? ",unsharp=5:5:0.5:5:5:0" : "";
  if (fit === "cover") {
    return `[${input}]scale=${width}:${height}:force_original_aspect_ratio=increase${flags},crop=${width}:${height}:(iw-ow)*${focus.x}:(ih-oh)*${focus.y}${crisp}[${output}]`;
  }
  if (fit === "blur_pad") {
    return (
      `[${input}]split=2[${tag}bg][${tag}fg];` +
      `[${tag}bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=40:luma_power=2[${tag}bgb];` +
      `[${tag}fg]scale=${width}:${height}:force_original_aspect_ratio=decrease${flags}${crisp}[${tag}fgs];` +
      `[${tag}bgb][${tag}fgs]overlay=(W-w)/2:(H-h)/2[${output}]`
    );
  }
  return `[${input}]scale=${width}:${height}:force_original_aspect_ratio=decrease${flags}${crisp},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[${output}]`;
}

/**
 * The filter that brings a clip's picture to the edit's frame rate. A clip
 * already at it (within half a percent, after its speed change) is only
 * re-timed; otherwise frames are repeated, blended or made from the motion
 * between them (see RETIME_MODES). Interpolation runs at the source's own
 * size, before the picture is scaled, which keeps it as quick as it can be.
 */
export function retimeFilter(retime, fps, sourceFps, speed = 1, frame = null) {
  const effective = sourceFps && sourceFps > 0 ? sourceFps * speed : null;
  // Only a clip with fewer frames than the edit needs (by more than a
  // variable-rate phone clip wanders) is given new ones; one with more just
  // drops the extra, as ever.
  const short = effective !== null && effective < fps * 0.985;
  if (!short || retime === "duplicate") return `fps=${fps}`;
  if (retime === "blend") return `framerate=fps=${fps}:interp_start=15:interp_end=240:scene=8.2`;
  // Interpolated at no more than the edit's own size: a 4K source isn't worked on at 4K.
  const fit = frame
    ? `scale=w='min(iw,${frame.width})':h='min(ih,${frame.height})':force_original_aspect_ratio=decrease:force_divisible_by=2,`
    : "";
  return `${fit}minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff:scd_threshold=8`;
}

/** atempo only takes 0.5-2 per instance in older builds; chain it for wider speeds. */
export function atempoChain(speed) {
  const steps = [];
  let remaining = speed;
  while (remaining < 0.5) {
    steps.push(0.5);
    remaining /= 0.5;
  }
  while (remaining > 2) {
    steps.push(2);
    remaining /= 2;
  }
  if (Math.abs(remaining - 1) > 1e-6) steps.push(Number(remaining.toFixed(6)));
  return steps.map((step) => `atempo=${step}`).join(",");
}

/** Ken Burns motion for a still, as zoompan expressions over N output frames. */
function motionExpression(motion, totalFrames) {
  const n = Math.max(1, totalFrames - 1);
  const zoom = 0.12;
  const centreX = "iw/2-(iw/zoom/2)";
  const centreY = "ih/2-(ih/zoom/2)";
  switch (motion) {
    case "zoom_in":
      return { z: `1+${zoom}*on/${n}`, x: centreX, y: centreY };
    case "zoom_out":
      return { z: `${1 + zoom}-${zoom}*on/${n}`, x: centreX, y: centreY };
    case "pan_left":
      return { z: `${1 + zoom}`, x: `(iw-iw/zoom)*(1-on/${n})`, y: centreY };
    case "pan_right":
      return { z: `${1 + zoom}`, x: `(iw-iw/zoom)*on/${n}`, y: centreY };
    case "pan_up":
      return { z: `${1 + zoom}`, x: centreX, y: `(ih-ih/zoom)*(1-on/${n})` };
    case "pan_down":
      return { z: `${1 + zoom}`, x: centreX, y: `(ih-ih/zoom)*on/${n}` };
    default:
      return null;
  }
}

/**
 * Where a clip's source is opened. A trim that falls on a frame (a long
 * video's clip skipping the frame it repeats from the one before) can come out
 * a hair after that frame's own time once both are rounded, so the seek starts
 * a millisecond early: the frame meant is the one used, never the next.
 */
export function seekPoint(trimStart) {
  return Math.max(0, trimStart - 0.001);
}

/**
 * How the finished cut is encoded: x264's "veryfast" at CRF 17 looks the same
 * as "medium" at CRF 19 (SSIM 0.9948 against 0.9947, on a real 1080×1920
 * reel) in about a third of the time, for files about a sixth bigger.
 */
export const FINAL_ENCODING = ["-preset", "veryfast", "-crf", "17"];

/** Up to this long, a render's clips are kept as larger, faster-made intermediates. */
const QUICK_INTERMEDIATES_SECONDS = 300;

/**
 * How each clip's intermediate is encoded. It is encoded again in the final
 * pass, so it only has to keep the picture: "superfast" takes 0.6 of the time
 * of "veryfast" at the same CRF, and its files are about 1.7 times bigger, so
 * longer edits keep "veryfast" to stay within the task's disk.
 */
export function intermediateEncoding(plan) {
  return ["-preset", plan.total <= QUICK_INTERMEDIATES_SECONDS ? "superfast" : "veryfast", "-crf", "14"];
}

/**
 * The render's clips in runs that must be made in order: a clip that matches
 * the one before is measured against that clip's intermediate, so it starts a
 * run only when it isn't joined to it. Indexes, in order.
 */
export function clipRuns(clips) {
  const runs = [];
  for (const [index, clip] of clips.entries()) {
    const previous = clips[index - 1];
    const joined = index > 0 && clip.matchPrevious && previous?.kind === "video";
    if (joined) runs[runs.length - 1].push(index);
    else runs.push([index]);
  }
  return runs;
}

/**
 * Runs `work` on each item, at most `limit` at a time. On a failure no more
 * are started, the ones under way are let finish, and the first error is thrown.
 */
export async function inParallel(items, limit, work) {
  let next = 0;
  let failure = null;
  const lane = async () => {
    while (failure === null && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  if (failure) throw failure.error;
}

/** Arguments for pass 1: one clip normalised to an exact-length intermediate. */
export function clipArgs(clip, plan, sourcePath, hasAudio, out, seam = null, sourceFps = null) {
  const { width, height, fps } = plan;
  const sharp = plan.upscale === "sharp";
  const duration = seconds(clip.durationFrames / fps);
  const args = [];
  const filters = [];

  if (clip.kind === "image") {
    args.push("-loop", "1", "-framerate", String(fps), "-t", duration, "-i", sourcePath);
    const motion = clip.motion === "none" ? null : motionExpression(clip.motion, clip.durationFrames);
    if (motion) {
      // Compose at twice the size first so the zoom has pixels to work with
      // and moves smoothly, then let zoompan produce the output frames.
      filters.push(frameChain("0:v", "framed", width * 2, height * 2, clip.fit, "m", clip.focus, sharp));
      filters.push(
        `[framed]zoompan=z='${motion.z}':x='${motion.x}':y='${motion.y}':d=1:s=${width}x${height}:fps=${fps},` +
          `setsar=1,format=yuv420p,trim=end_frame=${clip.durationFrames},setpts=PTS-STARTPTS[v]`,
      );
    } else {
      filters.push(frameChain("0:v", "framed", width, height, clip.fit, "f", clip.focus, sharp));
      filters.push(`[framed]fps=${fps},setsar=1,format=yuv420p,trim=end_frame=${clip.durationFrames},setpts=PTS-STARTPTS[v]`);
    }
  } else {
    const span = seconds((clip.durationFrames / fps) * clip.speed + 0.25);
    args.push("-ss", seconds(seekPoint(clip.trimStart)), "-t", span, "-i", sourcePath);
    const speed = clip.speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${clip.speed}`;
    // Non-square source pixels are squared up first so nothing is stretched.
    filters.push(`[0:v]scale=trunc(iw*sar/2)*2:ih,setsar=1,${speed},${retimeFilter(plan.retime, fps, sourceFps, clip.speed, { width, height })}[paced]`);
    filters.push(frameChain("paced", "framed", width, height, clip.fit, "f", clip.focus, sharp));
    let framed = "framed";
    if (seam?.head) {
      // In register with the clip before at the join, easing back to its own picture.
      filters.push(joinHeadChain("framed", "matched", seam.head, "m"));
      framed = "matched";
    } else if (seam) {
      // Matched to the clip before at the join, easing back to its own colour.
      filters.push(seamEaseChain("framed", "matched", seam.correction, Math.round(seam.seconds * fps)));
      framed = "matched";
    }
    // A source shorter than the requested length holds its last frame.
    filters.push(
      `[${framed}]setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${seconds(clip.durationFrames / fps + 1)},` +
        `trim=end_frame=${clip.durationFrames},setpts=PTS-STARTPTS[v]`,
    );
  }

  const useSourceAudio = clip.kind === "video" && hasAudio && clip.volume > 0;
  if (useSourceAudio) {
    const tempo = clip.speed === 1 ? "" : `${atempoChain(clip.speed)},`;
    const fades = [];
    if (clip.soundIn) fades.push(`afade=t=in:st=0:d=${seconds(JOIN_SOUND_SECONDS)}`);
    if (clip.soundOut) {
      fades.push(`afade=t=out:st=${seconds(Math.max(0, clip.durationFrames / fps - JOIN_SOUND_SECONDS))}:d=${seconds(JOIN_SOUND_SECONDS)}`);
    }
    filters.push(
      `[0:a]asetpts=PTS-STARTPTS,${tempo}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `volume=${clip.volume},apad,atrim=end=${duration},${fades.map((fade) => `${fade},`).join("")}asetpts=PTS-STARTPTS[a]`,
    );
  } else {
    args.push("-f", "lavfi", "-t", duration, "-i", "anullsrc=r=48000:cl=stereo");
    filters.push(`[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=end=${duration},asetpts=PTS-STARTPTS[a]`);
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264", ...intermediateEncoding(plan), "-pix_fmt", "yuv420p",
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
    "-frames:v", String(clip.durationFrames),
    out,
  );
  return args;
}

/**
 * Joins per-clip streams with each clip's transition. Every input is first
 * given the same frame rate, time base and sample format, which xfade and
 * acrossfade require. Returns the graph lines and the final label.
 */
export function joinChain(plan, kind) {
  const lines = [];
  for (let index = 0; index < plan.clips.length; index += 1) {
    const clip = plan.clips[index];
    // A clip easing into the framing the next shares with it, over its last moments (see ./joins.js).
    const tail = clip.tailWarp
      ? `,${easedWarpFilter(clip.tailWarp.map, plan.width, plan.height, { frames: clip.tailWarp.frames, direction: "in", total: clip.durationFrames })}`
      : "";
    lines.push(
      kind === "v"
        ? `[${index}:v]fps=${plan.fps},settb=AVTB,setpts=PTS-STARTPTS${tail}[v${index}]`
        : `[${index}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`,
    );
  }
  const labelFor = (index) => `${kind}${index}`;
  let previous = labelFor(0);
  let lengthFrames = plan.clips[0].durationFrames;
  for (let index = 1; index < plan.clips.length; index += 1) {
    const clip = plan.clips[index];
    const output = `${kind}j${index}`;
    const next = labelFor(index);
    if (clip.transitionFrames > 0) {
      const duration = seconds(clip.transitionFrames / plan.fps);
      if (kind === "v") {
        const offset = seconds((lengthFrames - clip.transitionFrames) / plan.fps);
        lines.push(`[${previous}][${next}]xfade=transition=${clip.transitionType}:duration=${duration}:offset=${offset}[${output}]`);
      } else {
        lines.push(`[${previous}][${next}]acrossfade=d=${duration}:c1=tri:c2=tri[${output}]`);
      }
      lengthFrames += clip.durationFrames - clip.transitionFrames;
    } else {
      lines.push(`[${previous}][${next}]concat=n=2:v=${kind === "v" ? 1 : 0}:a=${kind === "v" ? 0 : 1}[${output}]`);
      lengthFrames += clip.durationFrames;
    }
    previous = output;
  }
  return { lines, label: previous, lengthFrames };
}

/**
 * Speech regions of a voiceover, from FFmpeg's silencedetect output, as
 * [start, end] pairs in seconds from the start of the (trimmed) track.
 */
export function speechRegions(stderr, length) {
  const regions = [];
  let cursor = 0;
  for (const line of String(stderr).split("\n")) {
    const start = /silence_start: (-?[\d.]+)/.exec(line);
    const end = /silence_end: (-?[\d.]+)/.exec(line);
    if (start) {
      const at = Math.max(0, Number(start[1]));
      if (at > cursor) regions.push([cursor, Math.min(at, length)]);
      cursor = Infinity;
    } else if (end) {
      cursor = Math.max(0, Number(end[1]));
    }
  }
  if (cursor < length) regions.push([cursor, length]);
  return regions.filter(([from, to]) => to - from >= 0.05);
}

/** Sorts and joins intervals that are closer than `gap` seconds. */
export function mergeIntervals(intervals, gap) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from - last[1] < gap) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

const DUCK_ATTACK = 0.25;
const DUCK_RELEASE = 0.45;

/**
 * A volume expression that dips to `level` while someone speaks: it starts
 * falling just before each phrase so the first word is clear, and recovers
 * after it. Only numbers are interpolated.
 */
export function duckExpression(intervals, level) {
  if (!intervals.length) return null;
  const ramps = intervals.map(([from, to]) => {
    const up = `clip((t-${(from - DUCK_ATTACK).toFixed(3)})/${DUCK_ATTACK},0,1)`;
    const down = `clip((${(to + DUCK_RELEASE).toFixed(3)}-t)/${DUCK_RELEASE},0,1)`;
    return `${up}*${down}`;
  });
  return `1-${(1 - level).toFixed(3)}*clip(${ramps.join("+")},0,1)`;
}

/** Arguments for pass 2: the full soundtrack as a float WAV of exact length. */
export function mixArgs(plan, intermediatePaths, audioPaths, out, voiceActivity = []) {
  const total = seconds(plan.total);
  const args = [];
  for (const path of intermediatePaths) args.push("-i", path);
  for (const [index, item] of plan.audio.entries()) {
    if (item.loop) args.push("-stream_loop", "-1");
    args.push("-ss", seconds(item.trimStart), "-t", seconds(item.length), "-i", audioPaths[index]);
  }

  const lines = [];
  const joinedSound = joinChain(plan, "a");
  lines.push(...joinedSound.lines);
  const gains = { picture: 1, voiceover: 1, music: 1, sfx: 1, ...(plan.mix ?? {}) };
  const level = (gain) => (gain === 1 ? "" : `,volume=${gain}`);
  lines.push(`[${joinedSound.label}]apad,atrim=end=${total},asetpts=PTS-STARTPTS${level(gains.picture)}[clips]`);

  const groups = { voiceover: [], music: [], sfx: [] };
  // Phrases closer together than this are treated as one, so the music does
  // not pump between sentences.
  const speech = mergeIntervals(voiceActivity, DUCK_ATTACK + DUCK_RELEASE + 0.5);
  for (const [index, item] of plan.audio.entries()) {
    const input = plan.clips.length + index;
    const label = `t${index}`;
    const chain = [
      `[${input}:a]asetpts=PTS-STARTPTS`,
      "aresample=48000",
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
      `atrim=end=${seconds(item.length)}`,
      `volume=${item.volume}`,
    ];
    if (item.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${seconds(item.fadeIn)}`);
    if (item.fadeOut > 0) chain.push(`afade=t=out:st=${seconds(Math.max(0, item.length - item.fadeOut))}:d=${seconds(item.fadeOut)}`);
    const delay = Math.round(item.start * 1000);
    if (delay > 0) chain.push(`adelay=delays=${delay}:all=1`);
    chain.push("apad", `atrim=end=${total}`, "asetpts=PTS-STARTPTS");
    const duck = item.role === "music" && item.duck ? duckExpression(speech, item.duckLevel) : null;
    if (duck) chain.push(`volume='${duck}':eval=frame`);
    lines.push(`${chain.join(",")}[${label}]`);
    if (item.role === "voiceover") groups.voiceover.push(label);
    else if (item.role === "sfx") groups.sfx.push(label);
    else groups.music.push(label);
  }

  const merge = (labels, output, gain) => {
    if (labels.length === 0) return null;
    if (labels.length === 1) {
      lines.push(`[${labels[0]}]${gain === 1 ? "anull" : `volume=${gain}`}[${output}]`);
    } else {
      lines.push(`${labels.map((label) => `[${label}]`).join("")}amix=inputs=${labels.length}:normalize=0:duration=longest${level(gain)}[${output}]`);
    }
    return output;
  };

  const finalInputs = ["clips"];
  const voice = merge(groups.voiceover, "voice", gains.voiceover);
  if (voice) finalInputs.push(voice);
  const music = merge(groups.music, "musicbed", gains.music);
  if (music) finalInputs.push(music);
  const sfx = merge(groups.sfx, "sfxbed", gains.sfx);
  if (sfx) finalInputs.push(sfx);

  if (finalInputs.length === 1) {
    lines.push(`[clips]anull[mix]`);
  } else {
    lines.push(
      `${finalInputs.map((label) => `[${label}]`).join("")}amix=inputs=${finalInputs.length}:normalize=0:duration=first:dropout_transition=0[mix]`,
    );
  }

  args.push(
    "-filter_complex", lines.join(";"),
    "-map", "[mix]",
    "-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2",
    "-t", total,
    out,
  );
  return args;
}

/** Parses the JSON block loudnorm prints at the end of a measuring pass. */
export function parseLoudness(stderr) {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const data = JSON.parse(stderr.slice(start, end + 1));
    const value = (key) => Number.parseFloat(data[key]);
    const measured = {
      input_i: value("input_i"),
      input_tp: value("input_tp"),
      input_lra: value("input_lra"),
      input_thresh: value("input_thresh"),
      target_offset: value("target_offset"),
    };
    if (Object.values(measured).some((entry) => !Number.isFinite(entry))) return null;
    return measured;
  } catch {
    return null;
  }
}

/** Arguments for the final pass: picture, transitions, text and the mixed sound. */
export function finalArgs(plan, intermediatePaths, mixPath, subtitlePath, loudness, out, imagePaths = [], fontsDir = null) {
  const args = [];
  for (const path of intermediatePaths) args.push("-i", path);
  args.push("-i", mixPath);
  // Each picture laid over the edit, held for the whole of it (it shows only between its times).
  // Each picture laid over the edit, read once (a GIF too): its first frame, held.
  for (const path of imagePaths) args.push("-i", path);

  const lines = [];
  const joinedPicture = joinChain(plan, "v");
  lines.push(...joinedPicture.lines);
  let pictureLabel = joinedPicture.label;

  if (plan.images.length) {
    lines.push(`[${pictureLabel}]setpts=PTS-STARTPTS[over0]`);
    for (const [index, image] of plan.images.entries()) {
      const input = intermediatePaths.length + 1 + index;
      const width = even(Math.max(2, image.width * plan.width));
      // Scaled once, then that one frame held at the edit's rate (never decoded again).
      const held =
        `[${input}:v]trim=end_frame=1,format=rgba,scale=${width}:-2:flags=lanczos,colorchannelmixer=aa=${image.opacity.toFixed(3)},` +
        `loop=loop=-1:size=1,setpts=N/(${plan.fps}*TB)`;
      // Faded in and out on its own clear background, unseen outside its times;
      // with no fade, shown from its first frame to its last.
      const fades =
        image.fade > 0
          ? `,fade=t=in:st=${seconds(image.start)}:d=${seconds(image.fade)}:alpha=1,` +
            `fade=t=out:st=${seconds(Math.max(image.start, image.end - image.fade))}:d=${seconds(image.fade)}:alpha=1`
          : "";
      const shown = image.fade > 0 ? "" : `:enable=gte(t\\,${seconds(image.start)})*lt(t\\,${seconds(image.end)})`;
      lines.push(`${held}${fades}[img${index}]`);
      lines.push(
        `[over${index}][img${index}]overlay=x=W*${image.x.toFixed(4)}-w/2:y=H*${image.y.toFixed(4)}-h/2:format=auto:shortest=1${shown}[over${index + 1}]`,
      );
    }
    pictureLabel = `over${plan.images.length}`;
  }

  const finishing = ["setpts=PTS-STARTPTS"];
  if (subtitlePath) finishing.push(`ass=filename=${subtitlePath}${fontsDir ? `:fontsdir=${fontsDir}` : ""}`);
  if (plan.introFade > 0) finishing.push(`fade=t=in:st=0:d=${seconds(plan.introFade)}`);
  if (plan.outroFade > 0) finishing.push(`fade=t=out:st=${seconds(plan.total - plan.outroFade)}:d=${seconds(plan.outroFade)}`);
  finishing.push("format=yuv420p");
  lines.push(`[${pictureLabel}]${finishing.join(",")}[vout]`);

  const mixInput = plan.clips.length;
  const sound = [`[${mixInput}:a]asetpts=PTS-STARTPTS`];
  if (loudness) {
    sound.push(
      `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:measured_I=${loudness.input_i}:measured_TP=${loudness.input_tp}:` +
        `measured_LRA=${loudness.input_lra}:measured_thresh=${loudness.input_thresh}:offset=${loudness.target_offset}:linear=true`,
    );
  } else {
    sound.push("alimiter=limit=0.95:level=false");
  }
  if (plan.introFade > 0) sound.push(`afade=t=in:st=0:d=${seconds(plan.introFade)}`);
  if (plan.outroFade > 0) sound.push(`afade=t=out:st=${seconds(plan.total - plan.outroFade)}:d=${seconds(plan.outroFade)}`);
  sound.push("aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo");
  lines.push(`${sound.join(",")}[aout]`);

  args.push(
    "-filter_complex", lines.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264", ...FINAL_ENCODING, "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-r", String(plan.fps), "-g", String(plan.fps * 2),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    "-t", seconds(plan.total),
    out,
  );
  return args;
}

/* ------------------------------------------------------------------ */
/* Captions and titles (ASS)                                           */
/* ------------------------------------------------------------------ */

function assTime(value) {
  const centiseconds = Math.max(0, Math.round(value * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const FONT = "Inter";

/** A #rrggbb colour as ASS writes it: in a style (&HAABBGGRR) or an override tag (&HBBGGRR&). */
function assColour(hex, alpha = "00") {
  const bgr = `${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
  return { style: `&H${alpha}${bgr}`, tag: `&H${bgr}&` };
}

/**
 * Builds an ASS script for captions and title overlays. Positions keep text
 * clear of the areas social apps cover with their own buttons and captions.
 */
export function buildSubtitles(plan, families = new Map()) {
  const { width, height } = plan;
  // The family each font is set in: a brand font's own name for it, as read from its file.
  const fontOf = (name) => (name ? (families.get(name) ?? name) : FONT);
  const short = Math.min(width, height);
  const portrait = height > width;
  const styles = [];
  const events = [];

  if (plan.captions?.style === "brand") {
    // Word by word, in the brand's type, laid out in the faces the render carries (see ./caption-script.js).
    const brand = brandCaptionEvents(plan, plan.captions.faces ?? roughFaces(), plan.captions.backdrop ?? {});
    styles.push(...brand.styles);
    events.push(...brand.events);
  } else if (plan.captions) {
    const { style, position, size } = plan.captions;
    const fontSize = Math.round(short * 0.058 * size);
    const alignment = position === "top" ? 8 : position === "center" ? 5 : 2;
    const marginV =
      position === "bottom"
        ? Math.round(height * (portrait ? 0.12 : 0.07))
        : position === "lower_third"
          ? Math.round(height * (portrait ? 0.24 : 0.14))
          : position === "top"
            ? Math.round(height * (portrait ? 0.14 : 0.08))
            : 0;
    const margin = Math.round(width * 0.08);
    const bold = style === "minimal" ? 0 : -1;
    // What is behind the words, where chosen (feature caption_panel; see ./caption-script.js).
    const panel = classicPanel(plan.captions, fontSize);
    const borderStyle = panel?.borderStyle ?? (style === "boxed" ? 3 : 1);
    const outline = panel?.outline ?? (style === "boxed" ? Math.round(fontSize * 0.25) : style === "minimal" ? Math.max(1, Math.round(fontSize * 0.04)) : Math.max(2, Math.round(fontSize * 0.08)));
    const shadow = panel?.shadow ?? (style === "boxed" || style === "minimal" ? 0 : Math.max(1, Math.round(fontSize * 0.04)));
    const { font, color, accent } = plan.captions;
    // A brand's accent is the box behind boxed captions, and the text of bold ones.
    const outlineColour = panel?.outlineColour ?? (style === "boxed" ? (accent ? assColour(accent, "59").style : "&H59000000") : "&H00000000");
    const primary = panel?.primary ?? (style === "bold" ? (accent ? assColour(accent).style : "&H0000E5FF") : color ? assColour(color).style : "&H00FFFFFF");
    const back = panel?.back ?? (style === "boxed" ? (accent ? assColour(accent, "59").style : "&H59000000") : "&H80000000");
    // A brand font is set as it was drawn, never made bolder.
    styles.push(
      `Style: Caption,${fontOf(font)},${fontSize},${primary},&H000000FF,${outlineColour},${back},${font ? 0 : bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${margin},${margin},${marginV},1`,
    );
    for (const [index, segment] of plan.captions.segments.entries()) {
      const text = (plan.captions.uppercase ? segment.text.toUpperCase() : segment.text).replace(/\n/g, "\\N");
      // Each line's box over the picture measured behind it, where it follows the picture.
      const tags = panel?.tags(index) ?? "";
      events.push(`Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Caption,,0,0,0,,${tags ? `{${tags}}` : ""}${text}`);
    }
  }

  if (plan.overlays.length) {
    const titleSize = Math.round(short * 0.09);
    const subtitleSize = Math.round(short * 0.055);
    const ctaSize = Math.round(short * 0.065);
    const margin = Math.round(width * 0.08);
    styles.push(
      `Style: Title,${FONT},${titleSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(titleSize * 0.06))},${Math.max(1, Math.round(titleSize * 0.04))},5,${margin},${margin},0,1`,
      `Style: Subtitle,${FONT},${subtitleSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(subtitleSize * 0.06))},1,5,${margin},${margin},0,1`,
      `Style: Cta,${FONT},${ctaSize},&H00000000,&H000000FF,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,${Math.round(ctaSize * 0.35)},0,5,${margin},${margin},0,1`,
      // A title or subtitle on a box: the box is the outline colour, in BorderStyle 3.
      `Style: TitleBox,${FONT},${titleSize},&H00FFFFFF,&H000000FF,&H59000000,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(titleSize * 0.3)},0,5,${margin},${margin},0,1`,
      `Style: SubtitleBox,${FONT},${subtitleSize},&H00FFFFFF,&H000000FF,&H59000000,&H00000000,0,0,0,0,100,100,0,0,3,${Math.round(subtitleSize * 0.3)},0,5,${margin},${margin},0,1`,
    );
    for (const overlay of plan.overlays) {
      const boxed = overlay.backing === "box" && overlay.style !== "cta";
      const base = overlay.style === "cta" ? "Cta" : overlay.style === "subtitle" ? "Subtitle" : "Title";
      const styleName = boxed ? `${base}Box` : base;
      const size = overlay.style === "cta" ? ctaSize : overlay.style === "subtitle" ? subtitleSize : titleSize;
      const alignment = overlay.position === "top" ? 8 : overlay.position === "bottom" ? 2 : 5;
      const marginV =
        overlay.position === "center" ? 0 : Math.round(height * (overlay.position === "top" ? (portrait ? 0.16 : 0.1) : portrait ? 0.3 : 0.16));
      // At a height of its own: centred there, whatever its position says.
      const place = overlay.y !== null ? `\\an5\\pos(${Math.round(width / 2)},${Math.round(height * overlay.y)})` : `\\an${alignment}`;
      // A soft dark halo: a wide, blurred, half-clear outline and shadow, so a
      // white title reads on a white picture as well as a dark one.
      const halo =
        overlay.backing === "halo" && overlay.style !== "cta"
          ? `\\bord${Math.max(3, Math.round(size * 0.12))}\\3c&H000000&\\3a&H70&\\blur${Math.max(2, Math.round(size * 0.08))}\\shad${Math.max(1, Math.round(size * 0.05))}\\4a&H60&`
          : "";
      // A brand's look: its font (as drawn, never made bolder), text colour, and accent behind it.
      const brand = [
        overlay.font ? `\\fn${fontOf(overlay.font)}\\b0` : "",
        overlay.color ? `\\1c${assColour(overlay.color).tag}` : "",
        overlay.accent && (boxed || overlay.style === "cta") ? `\\3c${assColour(overlay.accent).tag}\\4c${assColour(overlay.accent).tag}` : "",
      ].join("");
      const text = overlay.text.replace(/\n/g, "\\N");
      events.push(`Dialogue: 1,${assTime(overlay.start)},${assTime(overlay.end)},${styleName},,0,0,${overlay.y !== null ? 0 : marginV},,{${place}${halo}${brand}\\fad(250,250)}${text}`);
    }
  }

  if (!styles.length) return null;
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
    ...styles,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

/**
 * A track that doesn't loop plays only what its file holds from its trim
 * point, so its length (and with it where its fade-out falls) is fitted to
 * that, the way the preview plays it. A track with nothing left to play is
 * dropped. `durationOf` gives a source's length in seconds, or null if unknown.
 */
export async function fitAudioToSources(audio, durationOf) {
  const fitted = [];
  for (const item of audio) {
    const duration = item.loop ? null : await durationOf(item.source);
    const available = duration === null ? null : duration - item.trimStart;
    if (available !== null && available < 0.05) continue;
    if (available === null || available >= item.length) {
      fitted.push(item);
      continue;
    }
    fitted.push({
      ...item,
      length: available,
      fadeIn: Math.min(item.fadeIn, available / 2),
      fadeOut: Math.min(item.fadeOut, available / 2),
    });
  }
  return fitted;
}

/**
 * The time each FFmpeg step of a render may take (`limit`), and with a stall
 * watchdog for the steps that write their output as they go (`watched`): an
 * edit can take hours on throttled shared vCPUs, while a step that has hung
 * is stopped soon after it stops writing.
 */
function renderLimits() {
  const limit = { timeoutSeconds: config.renderTimeoutSeconds };
  return { limit, watched: { ...limit, stallSeconds: config.renderStallSeconds } };
}

export async function renderSequence({ sources, params, dir, progress = () => {} }) {
  const plan = planSequence(params, sources);
  const { limit, watched } = renderLimits();
  // One probe per source, shared by the clips made side by side.
  const probes = new Map();
  const inspect = (index) => {
    if (!probes.has(index)) probes.set(index, probe(sources[index].path));
    return probes.get(index);
  };
  plan.audio = await fitAudioToSources(plan.audio, async (index) => (await inspect(index)).duration_seconds ?? null);

  // Pass 1: every clip normalised to the output format at its exact length.
  // Runs of clips joined to the one before go in order; separate runs are
  // made side by side, as many at a time as CLIP_PARALLELISM.
  const intermediates = new Array(plan.clips.length);
  const seams = [];
  const joins = [];
  let ready = 0;
  progress(0, `Preparing clips (0 of ${plan.clips.length} ready)`);
  const prepare = async (index) => {
    const clip = plan.clips[index];
    const info = clip.kind === "video" ? await inspect(clip.source) : null;
    if (clip.kind === "video" && info && info.duration_seconds && clip.trimStart >= info.duration_seconds) {
      throw bad(`Clip ${index + 1} starts after its source ends`);
    }
    const previous = plan.clips[index - 1];
    const joinable = clip.matchPrevious && previous?.kind === "video" && intermediates[index - 1];
    // A join that can't be measured is left as it is: easing it is never worth a failed render.
    let seam = null;
    if (joinable && clip.smartJoin) {
      const measured = await smartJoinFor({ clip, previous, previousPath: intermediates[index - 1], plan, sourcePath: sources[clip.source].path, info, dir, index, limit }).catch((error) => {
        console.error(JSON.stringify({ event: "smart_join_unmeasured", clip: index, message: error instanceof Error ? error.message : String(error) }));
        return null;
      });
      if (measured?.tail) previous.tailWarp = measured.tail.warp;
      if (measured?.head) seam = { head: measured.head };
      joins.push({ clip: index, matched: Boolean(measured?.head || measured?.tail), ...(measured?.report ?? { left: "unmeasured" }) });
    } else if (joinable) {
      seam = await seamFor({ clip, previous, previousPath: intermediates[index - 1], plan, sourcePath: sources[clip.source].path, info, dir, index, limit }).catch(() => null);
      if (seam) seams.push({ clip: index, likeness: seam.correction.likeness, largest_shift: seam.correction.largest_shift });
    }
    const out = join(dir, `clip-${String(index).padStart(3, "0")}.mkv`);
    await ffmpeg(clipArgs(clip, plan, sources[clip.source].path, Boolean(info?.has_audio), out, seam, info?.fps ?? null), watched);
    intermediates[index] = out;
    ready += 1;
    progress((ready / plan.clips.length) * 0.45, `Preparing clips (${ready} of ${plan.clips.length} ready)`);
  };
  await inParallel(clipRuns(plan.clips), config.clipParallelism, async (run) => {
    for (const index of run) await prepare(index);
  });
  // Reported in clip order, however the runs finished.
  seams.sort((a, b) => a.clip - b.clip);
  joins.sort((a, b) => a.clip - b.clip);
  // The pictures' sources aren't needed again (only the audio's are): their
  // room goes to the mix and the final cut.
  const kept = new Set([
    ...plan.audio.map((item) => item.source),
    ...plan.images.map((image) => image.source),
    ...plan.fonts.map((font) => font.source),
  ]);
  for (const [index, source] of sources.entries()) {
    if (!kept.has(index)) await rm(source.path, { force: true });
  }

  // Pass 2: the soundtrack. Music ducks where the voiceover actually speaks,
  // found by listening for silence in each voice track.
  progress(0.5, "Mixing sound");
  const voiceActivity = [];
  const ducking = plan.audio.some((item) => item.role === "music" && item.duck);
  for (const item of plan.audio) {
    if (!ducking || item.role !== "voiceover" || item.volume === 0) continue;
    const { stderr } = await ffmpeg([
      "-ss", seconds(item.trimStart), "-t", seconds(item.length), "-i", sources[item.source].path,
      "-af", "silencedetect=n=-38dB:d=0.35", "-f", "null", "-",
    ], watched);
    for (const [from, to] of speechRegions(stderr, item.length)) {
      voiceActivity.push([item.start + from, Math.min(plan.total, item.start + to)]);
    }
  }
  const mixPath = join(dir, "mix.wav");
  await ffmpeg(mixArgs(plan, intermediates, plan.audio.map((item) => sources[item.source].path), mixPath, voiceActivity), watched);

  // Pass 3: loudness, measured on the finished mix so the target is met evenly.
  let loudness = null;
  if (plan.normalize) {
    progress(0.55, "Balancing loudness");
    const { stderr } = await ffmpeg(["-i", mixPath, "-af", `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], watched);
    const measured = parseLoudness(stderr);
    // A silent or near-silent mix has nothing to normalise.
    if (measured && measured.input_i > -60) loudness = measured;
  }

  // Pass 4: the picture, with transitions and text, encoded once.
  progress(0.6, "Rendering the final cut");
  // A brand's fonts, in a directory of their own, each set by the family its file names.
  let fontsDir = null;
  const families = new Map();
  const fontFiles = [];
  if (plan.fonts.length) {
    fontsDir = join(dir, "fonts");
    await mkdir(fontsDir, { recursive: true });
    for (const [index, font] of plan.fonts.entries()) {
      const bytes = await readFile(sources[font.source].path);
      const kind = sfntKind(bytes);
      if (!kind) throw bad(`Font ${index + 1} isn't a TrueType or OpenType font file`);
      await writeFile(join(fontsDir, `font-${index}.${kind}`), bytes);
      fontFiles.push({ family: font.family, bytes });
      const named = fontFamily(bytes);
      // A family's italic (a file of its own) never renames the family its regular names.
      const italic = fontStyle(bytes)?.italic === true;
      if (named && /^[\p{L}\p{N} ._'&+-]{1,80}$/u.test(named) && (!families.has(font.family) || !italic)) {
        families.set(font.family, named);
      }
    }
  }
  // Brand captions are laid out in their family's own files (its regular and italic).
  if (plan.captions?.style === "brand") plan.captions.faces = await brandFaces(plan.captions.font, fontFiles);
  // How light the picture is behind each caption, where their panel follows it or its glass is
  // nearer opaque over light pictures (see ./caption-backdrop.js). Measuring it never fails a render:
  // unmeasured, the glass is near opaque.
  if (backdropWanted(plan.captions)) {
    progress(0.6, "Measuring the picture behind the captions");
    plan.captions.backdrop = await measureCaptionBackdrops(plan, intermediates, dir, limit).catch((error) => {
      console.error(JSON.stringify({ event: "caption_backdrop_unmeasured", message: error instanceof Error ? error.message : String(error) }));
      return { backdrops: [], cuts: [] };
    });
  }
  const script = buildSubtitles(plan, families);
  let subtitlePath = null;
  if (script) {
    subtitlePath = join(dir, "text.ass");
    await writeFile(subtitlePath, script, "utf8");
  }
  const out = join(dir, "sequence.mp4");
  const imagePaths = plan.images.map((image) => sources[image.source].path);
  await ffmpeg(finalArgs(plan, intermediates, mixPath, subtitlePath, loudness, out, imagePaths, fontsDir), {
    ...watched,
    onProgress: (done) => progress(0.6 + 0.38 * Math.min(1, done / plan.total), "Rendering the final cut"),
  });
  // Only the finished cut is kept from here.
  for (const path of [...intermediates, mixPath]) await rm(path, { force: true });

  const poster = join(dir, "poster.jpg");
  await ffmpeg([
    "-ss", seconds(Math.min(1, plan.total / 2)),
    "-i", out,
    "-frames:v", "1",
    "-vf", `scale=${Math.min(720, plan.width)}:-2`,
    "-q:v", "3",
    poster,
  ], limit);

  const metadata = await probe(out);
  return {
    outputs: [
      { path: out, mime: "video/mp4", kind: "video" },
      { path: poster, mime: "image/jpeg", kind: "image" },
    ],
    metadata: {
      ...metadata,
      planned_duration_seconds: Number(plan.total.toFixed(3)),
      clip_count: plan.clips.length,
      loudness_lufs: loudness ? plan.loudness : null,
      ...(seams.length ? { seams_matched: seams } : {}),
      ...(joins.length ? { smart_joins: joins } : {}),
    },
  };
}

/**
 * How a smart join is made (see ./joins.js): measured, like a colour join, on
 * the last frame the clip before shows against this clip's frame of the same
 * moment, laid out like the render.
 */
async function smartJoinFor({ clip, previous, previousPath, plan, sourcePath, info, dir, index, limit }) {
  const rate = info?.fps && info.fps > 0 ? info.fps : plan.fps;
  const anchor = Math.max(0, clip.trimStart - 1 / rate);
  const layout = frameChain("sp", "sf", plan.width, plan.height, clip.fit, "s", clip.focus, plan.upscale === "sharp");
  return measureJoin({
    previous: { path: previousPath, frames: previous.durationFrames },
    next: {
      input: ["-ss", seconds(seekPoint(anchor)), "-i", sourcePath],
      shownInput: clip.trimStart - anchor > 0.5 / rate ? ["-ss", seconds(seekPoint(clip.trimStart)), "-i", sourcePath] : null,
      filters: `[0:v]scale=trunc(iw*sar/2)*2:ih,setsar=1[sp];${layout};[sf]`,
      frames: clip.durationFrames,
    },
    plan,
    dir,
    tag: `j${index}`,
    limit,
  });
}

/**
 * How a clip's colour is eased in from the clip before it: measured on the
 * last frame the clip before shows (from its finished intermediate, exactly)
 * against this clip's frame of the same moment, which is the frame before its
 * first when it skips one it repeats (a long video's join), else its first.
 * Null when they aren't the same picture, or already match.
 */
async function seamFor({ clip, previous, previousPath, plan, sourcePath, info, dir, index, limit }) {
  const easeSeconds = Math.min(SEAM_EASE_SECONDS, (clip.durationFrames - 2) / plan.fps);
  if (easeSeconds < 0.2) return null;
  const target = await planeThumbnail(["-i", previousPath], `[0:v]select=eq(n\\,${previous.durationFrames - 1}),`, dir, `p${index}`, limit);
  const rate = info?.fps && info.fps > 0 ? info.fps : plan.fps;
  const anchor = Math.max(0, clip.trimStart - 1 / rate);
  const layout = frameChain("sp", "sf", plan.width, plan.height, clip.fit, "s", clip.focus, plan.upscale === "sharp");
  const current = await planeThumbnail(
    ["-ss", seconds(seekPoint(anchor)), "-i", sourcePath],
    `[0:v]scale=trunc(iw*sar/2)*2:ih,setsar=1[sp];${layout};[sf]`,
    dir,
    `c${index}`,
    limit,
  );
  const correction = seamCorrection(target, current);
  return correction ? { correction, seconds: easeSeconds } : null;
}
