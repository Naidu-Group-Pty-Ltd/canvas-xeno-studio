import { join } from "node:path";
import { probe, ffmpeg } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { renderSequence, SEQUENCE_LIMITS, stemRoles } from "./sequence.js";
import { cameraMotion, decodeThumbnails, extractFrameByIndex, pickHandoffFrame } from "./frames.js";
import { measureSync, prepareAudio } from "./voice.js";
import { lipCheck, lipCheckAvailable } from "./lipcheck.js";
import { chromiumAvailable } from "./chromium.js";
import { COMPOSITION_LIMITS, joinStretches, renderComposition } from "./composition.js";
import { config } from "./config.js";

/**
 * Task catalogue.
 *
 * Every task declares the sources it needs and the outputs it produces, and
 * builds its own FFmpeg argument list from validated, typed values. A task body
 * can never contain FFmpeg flags, shell fragments or file paths.
 */

const SCALE_MODES = new Set(["cover", "contain", "blur_pad"]);
const VIDEO_FORMATS = { mp4: "video/mp4", webm: "video/webm" };
const IMAGE_FORMATS = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const AUDIO_FORMATS = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4" };

function num(value, { min, max, fallback, name }) {
  if (value === undefined || value === null || value === "") {
    if (fallback === undefined) throw new TaskError("INVALID_PARAMETERS", `${name} is required`);
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TaskError("INVALID_PARAMETERS", `${name} must be a number`);
  if (parsed < min || parsed > max) {
    throw new TaskError("INVALID_PARAMETERS", `${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function even(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function pick(value, allowed, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const key = String(value).toLowerCase();
  if (!(key in allowed) && !(allowed instanceof Set && allowed.has(key))) {
    throw new TaskError("INVALID_PARAMETERS", `${name} "${value}" is not supported`);
  }
  return key;
}

/**
 * What this worker understands beyond the basics, for the app to offer it:
 * framing (crop position, pad colour), a clip's true last frame taken by
 * counting its frames ("last_frame"), easing a clip's colour into the one
 * before it at a join ("seam_match"), a frame taken by its number
 * ("frame_index"), a voiceover made ready to drive lip sync
 * ("audio_prepare"), a clip's lip sync measured against its voiceover
 * ("audio_sync"), the mixer's channel levels applied to each sound bus
 * ("channel_mix"), joins put in register: framing, colour, detail and
 * sound ("smart_join"), a title's height on the frame and what keeps it
 * readable ("overlay_layout"), up to twelve brand font files in a render,
 * a family's italic and bold among them ("more_fonts"), captions set word
 * by word in a brand's type, each word on its spoken time, on a panel
 * ("brand_captions"), what is behind captions chosen: a panel following
 * the picture measured behind them, a light card, a glass nearer opaque
 * over light pictures, a solid one in the brand's colour, or none
 * ("caption_panel"), and, where the image has it, a clip's lips scored
 * from its picture ("lip_check"). A voiceover can be held open in its
 * silences by whole frames ("voice_pauses"), every render reports the voice's
 * margin over the music and the mix's loudness ("mix_report"), and a render
 * can hand back its voiceover, music and effects buses as files ("stems").
 */
export const FEATURES = [
  "frame_focus",
  "frame_background",
  "last_frame",
  "seam_match",
  "frame_index",
  "audio_prepare",
  "audio_sync",
  "channel_mix",
  "smart_join",
  "overlay_layout",
  "frame_rate_conversion",
  "brand_text",
  "image_overlays",
  "more_fonts",
  "brand_captions",
  "caption_panel",
  "overlay_motion",
  "voice_pauses",
  "mix_report",
  "stems",
  ...(lipCheckAvailable ? ["lip_check"] : []),
  // Code-driven motion graphics drawn in Chromium ("compositions"), on a GPU here ("compositions_gpu").
  ...(chromiumAvailable ? ["compositions", ...(config.gpu ? ["compositions_gpu"] : [])] : []),
];

/** The point of the picture (0-1 across and down) a crop keeps in frame: the centre unless given. */
function focusOf(params) {
  return {
    x: num(params.focus_x, { min: 0, max: 1, fallback: 0.5, name: "focus_x" }),
    y: num(params.focus_y, { min: 0, max: 1, fallback: 0.5, name: "focus_y" }),
  };
}

/** The colour around a whole picture, as FFmpeg takes it: black unless a #rrggbb colour is given. */
function padColour(value) {
  if (value === undefined || value === null || value === "") return "black";
  const text = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(text)) throw new TaskError("INVALID_PARAMETERS", "background must be a colour like #1a2b3c");
  return `0x${text.slice(1)}`;
}

/**
 * Builds the scale/pad filter for a target frame, without cropping the subject
 * away in "contain". "cover" crops around `focus`; "contain" pads in `background`.
 */
function frameFilter(width, height, mode, { focus = { x: 0.5, y: 0.5 }, background = "black" } = {}) {
  const w = even(width);
  const h = even(height);
  if (mode === "cover") {
    return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${focus.x}:(ih-oh)*${focus.y}`;
  }
  if (mode === "blur_pad") {
    return (
      `split=2[bg][fg];` +
      `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=40:luma_power=2[bgb];` +
      `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2`
    );
  }
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${background}`;
}

/**
 * How a video task's result is encoded. For MP4, x264's "veryfast" two steps
 * of CRF lower looks the same as "medium" at the CRF asked for (SSIM 0.9948
 * against 0.9947 on a real 1080×1920 reel) in about a third of the time.
 */
function videoEncodeArgs(format, crf, fps, withAudio) {
  const args = [];
  if (fps) args.push("-r", String(fps));
  if (format === "webm") {
    args.push("-c:v", "libvpx-vp9", "-crf", String(crf), "-b:v", "0");
    args.push(...(withAudio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"]));
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(Math.max(0, crf - 2)), "-pix_fmt", "yuv420p", "-movflags", "+faststart");
    args.push(...(withAudio ? ["-c:a", "aac", "-b:a", "192k"] : ["-an"]));
  }
  return args;
}

/**
 * Each handler receives validated sources on local disk and returns the list of
 * files to upload, in the same order as the upload slots the app supplied.
 */
export const TASKS = {
  probe: {
    sources: { min: 1, max: 1 },
    outputs: () => 0,
    async run({ sources }) {
      return { outputs: [], metadata: await probe(sources[0].path) };
    },
  },

  create_thumbnail: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const width = even(num(params.width, { min: 64, max: 3840, fallback: 640, name: "width" }));
      const time = num(params.time_seconds, { min: 0, max: 86_400, fallback: 0, name: "time_seconds" });
      const format = pick(params.format, IMAGE_FORMATS, "jpg", "format");
      const out = join(dir, `thumbnail.${format}`);
      const args = [];
      if (time > 0) args.push("-ss", String(time));
      args.push("-i", sources[0].path, "-frames:v", "1", "-vf", `scale=${width}:-2`);
      if (format === "jpg") args.push("-q:v", "3");
      args.push(out);
      await ffmpeg(args);
      return { outputs: [{ path: out, mime: IMAGE_FORMATS[format], kind: "image" }], metadata: await probe(out) };
    },
  },

  extract_frames: {
    sources: { min: 1, max: 1 },
    /**
     * One output per requested timestamp, or one for `frame: "last"` or
     * `frame: "index"` (which win over timestamps: an app sends both, so a
     * worker without them still takes a frame). The app supplies a matching
     * number of upload slots.
     */
    outputs: (params) => (params?.frame === "last" || params?.frame === "index" ? 1 : timestamps(params).length),
    async run({ sources, params, dir }) {
      if (params.frame === "last") return lastFrame(sources[0].path, params, dir);
      if (params.frame === "index") return frameAtIndex(sources[0].path, params, dir);
      const times = timestamps(params);
      const width = even(num(params.width, { min: 64, max: 3840, fallback: 960, name: "width" }));
      const outputs = [];
      for (const [index, time] of times.entries()) {
        const out = join(dir, `frame-${String(index + 1).padStart(3, "0")}.jpg`);
        await ffmpeg(["-ss", String(time), "-i", sources[0].path, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", out]);
        outputs.push({ path: out, mime: "image/jpeg", kind: "image", timestamp_seconds: time });
      }
      return { outputs, metadata: { frame_times: times } };
    },
  },

  trim_video: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const start = num(params.start_seconds, { min: 0, max: 86_400, fallback: 0, name: "start_seconds" });
      const end = num(params.end_seconds, { min: 0.1, max: 86_400, name: "end_seconds" });
      if (end <= start) throw new TaskError("INVALID_PARAMETERS", "end_seconds must be after start_seconds");
      const format = pick(params.format, VIDEO_FORMATS, "mp4", "format");
      const crf = num(params.crf, { min: 14, max: 40, fallback: 20, name: "crf" });
      const probed = await probe(sources[0].path);
      const out = join(dir, `trimmed.${format}`);
      await ffmpeg([
        "-ss", String(start),
        "-to", String(end),
        "-i", sources[0].path,
        ...videoEncodeArgs(format, crf, null, probed.has_audio),
        out,
      ]);
      return { outputs: [{ path: out, mime: VIDEO_FORMATS[format], kind: "video" }], metadata: await probe(out) };
    },
  },

  transcode_video: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const format = pick(params.format, VIDEO_FORMATS, "mp4", "format");
      const crf = num(params.crf, { min: 14, max: 40, fallback: 22, name: "crf" });
      const fps = params.fps ? num(params.fps, { min: 6, max: 60, name: "fps" }) : null;
      const probed = await probe(sources[0].path);
      const filters = [];
      if (params.width || params.height) {
        const width = even(num(params.width, { min: 64, max: 3840, fallback: probed.width ?? 1280, name: "width" }));
        const height = even(num(params.height, { min: 64, max: 2160, fallback: probed.height ?? 720, name: "height" }));
        filters.push(frameFilter(width, height, pick(params.mode, SCALE_MODES, "contain", "mode")));
      }
      const out = join(dir, `transcoded.${format}`);
      await ffmpeg([
        "-i", sources[0].path,
        ...(filters.length ? ["-filter_complex", filters.join(",")] : []),
        ...videoEncodeArgs(format, crf, fps, probed.has_audio),
        out,
      ]);
      return { outputs: [{ path: out, mime: VIDEO_FORMATS[format], kind: "video" }], metadata: await probe(out) };
    },
  },

  /** Reframe for a different aspect ratio (e.g. a 9:16 cut of a landscape master). */
  reframe_video: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const width = even(num(params.width, { min: 64, max: 3840, name: "width" }));
      const height = even(num(params.height, { min: 64, max: 3840, name: "height" }));
      const mode = pick(params.mode, SCALE_MODES, "cover", "mode");
      const format = pick(params.format, VIDEO_FORMATS, "mp4", "format");
      const crf = num(params.crf, { min: 14, max: 40, fallback: 20, name: "crf" });
      const framing = { focus: focusOf(params), background: padColour(params.background) };
      const probed = await probe(sources[0].path);
      const out = join(dir, `reframed.${format}`);
      await ffmpeg([
        "-i", sources[0].path,
        "-filter_complex", frameFilter(width, height, mode, framing),
        ...videoEncodeArgs(format, crf, null, probed.has_audio),
        out,
      ]);
      return { outputs: [{ path: out, mime: VIDEO_FORMATS[format], kind: "video" }], metadata: await probe(out) };
    },
  },

  resize_image: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const width = even(num(params.width, { min: 32, max: 6000, name: "width" }));
      const height = params.height ? even(num(params.height, { min: 32, max: 6000, name: "height" })) : null;
      const format = pick(params.format, IMAGE_FORMATS, "jpg", "format");
      const framing = { focus: focusOf(params), background: padColour(params.background) };
      const out = join(dir, `resized.${format}`);
      const filter = height
        ? frameFilter(width, height, pick(params.mode, SCALE_MODES, "contain", "mode"), framing)
        : `scale=${width}:-2`;
      await ffmpeg(["-i", sources[0].path, "-filter_complex", filter, ...(format === "jpg" ? ["-q:v", "3"] : []), out]);
      return { outputs: [{ path: out, mime: IMAGE_FORMATS[format], kind: "image" }], metadata: await probe(out) };
    },
  },

  extract_audio: {
    sources: { min: 1, max: 1 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const format = pick(params.format, AUDIO_FORMATS, "wav", "format");
      const probed = await probe(sources[0].path);
      if (!probed.has_audio) throw new TaskError("INVALID_PARAMETERS", "That video has no audio track");
      const out = join(dir, `audio.${format}`);
      const codec = format === "wav" ? ["-c:a", "pcm_s16le"] : format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ["-c:a", "aac", "-b:a", "192k"];
      await ffmpeg(["-i", sources[0].path, "-vn", ...codec, out]);
      return { outputs: [{ path: out, mime: AUDIO_FORMATS[format], kind: "audio" }], metadata: await probe(out) };
    },
  },

  add_audio: {
    sources: { min: 2, max: 2 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const video = sources.find((source) => source.role === "video") ?? sources[0];
      const audio = sources.find((source) => source.role === "audio") ?? sources[1];
      const format = pick(params.format, VIDEO_FORMATS, "mp4", "format");
      const crf = num(params.crf, { min: 14, max: 40, fallback: 20, name: "crf" });
      const volume = num(params.volume, { min: 0, max: 4, fallback: 1, name: "volume" });
      const out = join(dir, `with-audio.${format}`);
      await ffmpeg([
        "-i", video.path,
        "-i", audio.path,
        "-filter_complex", `[1:a]volume=${volume}[a]`,
        "-map", "0:v:0",
        "-map", "[a]",
        "-shortest",
        ...videoEncodeArgs(format, crf, null, true),
        out,
      ]);
      return { outputs: [{ path: out, mime: VIDEO_FORMATS[format], kind: "video" }], metadata: await probe(out) };
    },
  },

  /**
   * Timeline assembly / export: ordered clips, each with its own in/out point,
   * normalised to one frame size, with optional cross-fades and a music bed.
   */
  assemble_video: {
    sources: { min: 1, max: 40 },
    outputs: () => 1,
    async run({ sources, params, dir }) {
      const clips = Array.isArray(params.clips) && params.clips.length ? params.clips : sources.map((_, index) => ({ source_index: index }));
      if (clips.length > 40) throw new TaskError("INVALID_PARAMETERS", "A timeline may contain at most 40 clips");

      const width = even(num(params.width, { min: 128, max: 3840, fallback: 1920, name: "width" }));
      const height = even(num(params.height, { min: 128, max: 3840, fallback: 1080, name: "height" }));
      const fps = num(params.fps, { min: 12, max: 60, fallback: 30, name: "fps" });
      const mode = pick(params.mode, SCALE_MODES, "contain", "mode");
      const format = pick(params.format, VIDEO_FORMATS, "mp4", "format");
      const crf = num(params.crf, { min: 14, max: 40, fallback: 20, name: "crf" });
      const transition = num(params.transition_seconds, { min: 0, max: 3, fallback: 0, name: "transition_seconds" });

      const audioSource = sources.find((source) => source.role === "audio");
      const videoSources = sources.filter((source) => source.role !== "audio");

      const inputs = [];
      const filters = [];
      const labels = [];
      for (const [index, clip] of clips.entries()) {
        const sourceIndex = num(clip.source_index, { min: 0, max: videoSources.length - 1, fallback: 0, name: "source_index" });
        const source = videoSources[sourceIndex];
        if (!source) throw new TaskError("INVALID_PARAMETERS", `Clip ${index + 1} refers to a missing source`);
        const start = num(clip.start_seconds, { min: 0, max: 86_400, fallback: 0, name: "start_seconds" });
        const end = clip.end_seconds ? num(clip.end_seconds, { min: 0.1, max: 86_400, name: "end_seconds" }) : null;
        if (end !== null && end <= start) throw new TaskError("INVALID_PARAMETERS", `Clip ${index + 1} ends before it starts`);

        inputs.push("-ss", String(start));
        if (end !== null) inputs.push("-to", String(end));
        inputs.push("-i", source.path);

        const label = `v${index}`;
        filters.push(`[${inputs.filter((value) => value === "-i").length - 1}:v]${frameFilter(width, height, mode)},fps=${fps},setsar=1,format=yuv420p[${label}]`);
        labels.push(label);
      }

      let videoLabel;
      if (labels.length === 1) {
        videoLabel = labels[0];
      } else if (transition > 0) {
        // Chained cross-fades need each clip's duration to place the next offset.
        let previous = labels[0];
        let offset = await clipDuration(clips[0], videoSources);
        for (let index = 1; index < labels.length; index += 1) {
          const output = `x${index}`;
          const at = Math.max(0, offset - transition);
          filters.push(`[${previous}][${labels[index]}]xfade=transition=fade:duration=${transition}:offset=${at.toFixed(3)}[${output}]`);
          offset = at + (await clipDuration(clips[index], videoSources));
          previous = output;
        }
        videoLabel = previous;
      } else {
        filters.push(`${labels.map((label) => `[${label}]`).join("")}concat=n=${labels.length}:v=1:a=0[vout]`);
        videoLabel = "vout";
      }

      const maps = ["-map", `[${videoLabel}]`];
      let withAudio = false;
      if (audioSource) {
        inputs.push("-i", audioSource.path);
        const audioIndex = inputs.filter((value) => value === "-i").length - 1;
        const volume = num(params.audio_volume, { min: 0, max: 4, fallback: 1, name: "audio_volume" });
        filters.push(`[${audioIndex}:a]volume=${volume}[aout]`);
        maps.push("-map", "[aout]");
        withAudio = true;
      }

      const out = join(dir, `assembled.${format}`);
      await ffmpeg([
        ...inputs,
        "-filter_complex", filters.join(";"),
        ...maps,
        ...(withAudio ? ["-shortest"] : []),
        ...videoEncodeArgs(format, crf, fps, withAudio),
        out,
      ]);
      return { outputs: [{ path: out, mime: VIDEO_FORMATS[format], kind: "video" }], metadata: await probe(out) };
    },
  },

  /**
   * An edited sequence rendered to a finished video: clips and stills with
   * trims, speed and motion, per-cut transitions, the clips' own sound,
   * voiceover, music ducked under the voice, captions, titles and loudness
   * normalisation. Produces the video and a poster frame, then any stems
   * asked for (the voiceover, music and effects buses, in the order asked).
   */
  render_sequence: {
    sources: { min: 1, max: SEQUENCE_LIMITS.clips + SEQUENCE_LIMITS.audio + SEQUENCE_LIMITS.images + SEQUENCE_LIMITS.fonts },
    outputs: (params) => 2 + stemRoles(params?.stems).length,
    run: renderSequence,
  },

  /**
   * A voiceover made ready to drive lip sync: the canonical 48 kHz mono WAV
   * every time is measured in, a 16 kHz copy for transcription, and where its
   * speech and pauses are (see voice.js).
   */
  prepare_audio: {
    sources: { min: 1, max: 1 },
    outputs: () => 2,
    run: prepareAudio,
  },

  /**
   * Where a generated clip has the speech of the voiceover piece it was made
   * from, measured from the clip's own sound (see voice.js). Produces no file.
   */
  measure_sync: {
    sources: { min: 2, max: 2 },
    outputs: () => 0,
    run: measureSync,
  },

  /**
   * How well a clip's lips follow its voice, seen in its picture (SyncNet; see
   * lipcheck.js): scored against its piece of the voiceover, or its own
   * sound. Produces no file. Only on a worker whose image has it.
   */
  ...(lipCheckAvailable
    ? {
        lip_check: {
          sources: { min: 1, max: 2 },
          outputs: () => 0,
          run: lipCheck,
        },
      }
    : {}),

  /**
   * A composition (code-driven motion graphics; see composition.js) drawn as a
   * camera would: its lossless master, a playable copy and a poster, or one
   * lossless stretch of it. Its sources are its bundle, then its images and
   * fonts. Only on a worker whose image has a browser.
   */
  ...(chromiumAvailable
    ? {
        render_composition: {
          sources: { min: 1, max: 1 + 64 + 24 },
          outputs: (params) => (params?.output === "stretch" ? 1 : 3),
          run: renderComposition,
        },
        /** A composition's stretches joined frame for frame: its master, playable copy and poster. */
        join_stretches: {
          sources: { min: 1, max: COMPOSITION_LIMITS.stretches },
          outputs: () => 3,
          run: joinStretches,
        },
      }
    : {}),
};

async function clipDuration(clip, sources) {
  const source = sources[Number(clip.source_index ?? 0)] ?? sources[0];
  const start = Number(clip.start_seconds ?? 0);
  if (clip.end_seconds) return Math.max(0.1, Number(clip.end_seconds) - start);
  const probed = await probe(source.path);
  return Math.max(0.1, (probed.duration_seconds ?? 1) - start);
}

/**
 * A clip's true last frame, for the next clip of a long video to start from:
 * found by decoding and counting its frames (so it is the last one there is,
 * not one a measured length or a timestamp points near), lossless as PNG
 * unless JPEG is asked for. A tail frozen on one picture, or fading out, is
 * left out (see pickHandoffFrame). Also reports how many frames the clip has
 * (its exact length), which frame was taken, and how the camera was moving.
 */
async function lastFrame(path, params, dir) {
  const format = pick(params.format, { png: 1, jpg: 1 }, "png", "format");
  const width = params.width ? even(num(params.width, { min: 64, max: 3840, name: "width" })) : null;
  const info = await probe(path);
  const thumbs = await decodeThumbnails(path, dir, { width: info.width, height: info.height });
  const rate = info.fps && info.fps > 0 ? info.fps : info.duration_seconds ? thumbs.count / info.duration_seconds : null;
  const chosen = pickHandoffFrame(thumbs, rate ?? 0);
  const out = join(dir, `frame-last.${format}`);
  await extractFrameByIndex(path, chosen.index, out, { width, sourceWidth: info.width, format });
  const image = await probe(out);
  const at = rate ? Number((chosen.index / rate).toFixed(6)) : null;
  return {
    outputs: [{ path: out, mime: IMAGE_FORMATS[format], kind: "image", ...(at !== null ? { timestamp_seconds: at } : {}) }],
    metadata: {
      frame_mode: "last",
      // Every frame decoded, in display order; the one taken is frame_index (0 is the first).
      frame_count: thumbs.count,
      frame_index: chosen.index,
      frozen_frames: chosen.frozenFrames,
      faded_frames: chosen.fadedFrames,
      fps: rate ? Number(rate.toFixed(6)) : null,
      // The clip's exact length: its frames at its rate (not the container's duration).
      clip_duration_seconds: rate ? Number((thumbs.count / rate).toFixed(6)) : null,
      frame_times: at !== null ? [at] : [],
      width: image.width,
      height: image.height,
      source_width: info.width,
      source_height: info.height,
      motion: cameraMotion(thumbs, chosen.index, rate ?? 0),
    },
  };
}

/**
 * A clip's frame by its number (0 is the first), counted by decoding every
 * frame as for its last frame: where a clip made to a voiceover is cut, the
 * next clip starts from the frame that would have come next. A number past
 * the end takes the last frame. Reports the same facts as the last frame.
 */
async function frameAtIndex(path, params, dir) {
  const format = pick(params.format, { png: 1, jpg: 1 }, "png", "format");
  const width = params.width ? even(num(params.width, { min: 64, max: 3840, name: "width" })) : null;
  const wanted = Math.round(num(params.index, { min: 0, max: 1_000_000, name: "index" }));
  const info = await probe(path);
  const thumbs = await decodeThumbnails(path, dir, { width: info.width, height: info.height });
  const rate = info.fps && info.fps > 0 ? info.fps : info.duration_seconds ? thumbs.count / info.duration_seconds : null;
  const index = Math.min(wanted, thumbs.count - 1);
  const out = join(dir, `frame-${index}.${format}`);
  await extractFrameByIndex(path, index, out, { width, sourceWidth: info.width, format });
  const image = await probe(out);
  const at = rate ? Number((index / rate).toFixed(6)) : null;
  return {
    outputs: [{ path: out, mime: IMAGE_FORMATS[format], kind: "image", ...(at !== null ? { timestamp_seconds: at } : {}) }],
    metadata: {
      frame_mode: "index",
      frame_count: thumbs.count,
      frame_index: index,
      requested_index: wanted,
      fps: rate ? Number(rate.toFixed(6)) : null,
      clip_duration_seconds: rate ? Number((thumbs.count / rate).toFixed(6)) : null,
      frame_times: at !== null ? [at] : [],
      width: image.width,
      height: image.height,
      source_width: info.width,
      source_height: info.height,
      motion: cameraMotion(thumbs, index, rate ?? 0),
    },
  };
}

function timestamps(params) {
  if (Array.isArray(params?.times_seconds) && params.times_seconds.length) {
    if (params.times_seconds.length > 24) throw new TaskError("INVALID_PARAMETERS", "At most 24 frames may be extracted");
    return params.times_seconds.map((value) => num(value, { min: 0, max: 86_400, name: "times_seconds" }));
  }
  const count = num(params?.count, { min: 1, max: 24, fallback: 4, name: "count" });
  const duration = num(params?.duration_seconds, { min: 0.2, max: 86_400, fallback: 4, name: "duration_seconds" });
  // Evenly spaced inside the clip, avoiding the very first and last frame.
  return Array.from({ length: count }, (_, index) => Number(((duration * (index + 0.5)) / count).toFixed(3)));
}

export function describeTasks() {
  return Object.keys(TASKS);
}
