import { join } from "node:path";
import { asImage } from "./colour.js";
import { config } from "./config.js";
import { ffmpeg, probe, run } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { sizeOf } from "./workspace.js";

/**
 * Mastering (feature "mastering"): an export with nothing lossily encoded
 * twice, and a finished master passed through untouched.
 *
 * A standard render encodes every clip to an intermediate (x264 at CRF 14),
 * then encodes the cut again (CRF 17, preset veryfast). Reel 1's proof through
 * that export measured SSIM 0.988 and PSNR 42.6 dB against the renderer's own
 * master: clean, but measurably softer (docs/brands/aurixa-reel-1/HANDOVER.md,
 * step 17). A master render keeps its clips lossless and encodes once, with
 * the chain Reel 1's master was made with (scripts/aurixa-reel-1/render.cjs):
 * x264 High at CRF 12 on its slow preset, with dark-scene adaptive
 * quantisation, BT.709 tagged, and AAC at 256 kb/s.
 *
 * An edit that is one finished video with nothing over it is not encoded at
 * all: its file is remuxed as it is (the app asks with `pass_through` when it
 * thinks so; the worker checks the file really matches the edit first, and
 * renders it the usual way if not).
 */

export const QUALITIES = new Set(["standard", "master"]);

/**
 * The master's final encode: CRF 12 on x264's slow preset keeps fine detail
 * (on footage-like 1080 x 1920 test pictures, SSIM 0.994 and PSNR 49.8 dB
 * against the lossless frames, where the standard encode keeps 0.989 and
 * 44.6 dB); aq-mode 3 spends more of the bits on dark, flat areas, where
 * gradients would otherwise band. It takes about five times as long as the
 * standard encode, and its file is about four times the size. It is tagged
 * BT.709 as every render is (see ./colour.js).
 */
export const MASTER_ENCODING = [
  "-preset",
  "slow",
  "-crf",
  "12",
  "-x264-params",
  "aq-mode=3:aq-strength=0.9",
];
export const MASTER_AUDIO_BITRATE = "256k";

/**
 * A master's intermediates: lossless x264 (QP 0) on its fastest preset.
 * Measured on 1080 x 1920 test pictures against FFV1 and Ut Video, it is the
 * quickest to make but one and quick to decode, the same size as FFV1 on
 * noisy footage (1.8 MB a frame at worst) and far smaller on smooth or still
 * pictures, which it predicts from the frame before.
 */
export const LOSSLESS_INTERMEDIATE = ["-preset", "ultrafast", "-qp", "0"];

/**
 * How much of the raw picture (1.5 bytes a pixel in 4:2:0) each kind of file
 * can take, from the same measurements, rounded up: a lossless intermediate
 * took 0.57 of it on heavy noise (0.29 on footage-like pictures), a standard
 * one 0.21, and the master's final encode 0.24.
 */
const LOSSLESS_SHARE = 0.6;
const STANDARD_SHARE = 0.25;
const MASTER_SHARE = 0.3;
/** The mix: 48 kHz stereo 32-bit float. */
const MIX_BYTES_PER_SECOND = 48_000 * 2 * 4;
/** What is left unplanned of a task's disk, for the poster, logs and what the estimates miss. */
const HEADROOM = 0.9;

function bad(message) {
  return new TaskError("INVALID_PARAMETERS", message);
}

/** The render's mastering parameters: its quality, and whether the app asks for a pass-through. */
export function planMastering(params) {
  const p = params && typeof params === "object" ? params : {};
  const value = p.quality;
  let quality = "standard";
  if (value !== undefined && value !== null && value !== "") {
    quality = String(value).toLowerCase();
    if (!QUALITIES.has(quality)) throw bad(`quality "${value}" is not supported`);
  }
  return { quality, passThrough: p.pass_through === true };
}

/**
 * Which of a master's clips are made lossless, decided clip by clip as they
 * are made: a clip is lossless when its lossless intermediate (at its
 * largest) fits on the task's disk beside everything already there, the
 * clips under way, the rest of the clips made the standard way, and the mix
 * and the master to come. A clip that doesn't fit is made the standard way
 * (CRF 14), so a long edit still renders, and the report says which clips
 * were. Decisions are taken one at a time, so two clips made side by side
 * can't both count on the same room.
 */
export function losslessPlanner(
  plan,
  dir,
  { budget = config.maxTaskWorkspaceBytes, measure = sizeOf } = {},
) {
  const frameBytes = plan.width * plan.height * 1.5;
  const losslessBytes = (clip) => clip.durationFrames * frameBytes * LOSSLESS_SHARE;
  const standardBytes = (clip) => clip.durationFrames * frameBytes * STANDARD_SHARE;
  const tail = plan.total * MIX_BYTES_PER_SECOND + plan.totalFrames * frameBytes * MASTER_SHARE;
  const started = new Set();
  const underWay = new Map();
  const lossless = [];
  const standard = [];
  let largestNeed = 0;
  let turn = Promise.resolve();

  const decide = async (index) => {
    started.add(index);
    const used = await measure(dir);
    let promised = 0;
    for (const bytes of underWay.values()) promised += bytes;
    let rest = 0;
    for (const [other, clip] of plan.clips.entries())
      if (!started.has(other)) rest += standardBytes(clip);
    const need = losslessBytes(plan.clips[index]);
    const total = used + promised + need + rest + tail;
    largestNeed = Math.max(largestNeed, total);
    const fits = total <= budget * HEADROOM;
    if (fits) underWay.set(index, need);
    (fits ? lossless : standard).push(index);
    return fits;
  };

  return {
    /** Whether clip `index` is made lossless. */
    choose(index) {
      const decision = turn.then(() => decide(index));
      turn = decision.catch(() => {});
      return decision;
    },
    /** Clip `index` is made: its room is on disk now, and counted there. */
    done(index) {
      underWay.delete(index);
    },
    /** What was decided, for the render's metadata (clips numbered from 1). */
    report() {
      const order = (list) => [...list].sort((a, b) => a - b).map((index) => index + 1);
      return {
        lossless_clips: order(lossless),
        standard_clips: order(standard),
        ...(standard.length
          ? {
              needed_bytes: Math.round(largestNeed / HEADROOM),
              budget_bytes: budget,
            }
          : {}),
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Passing a finished master through                                   */
/* ------------------------------------------------------------------ */

/** A frame rate as FFmpeg writes it ("30/1", "30000/1001"), as a number. */
function rate(value) {
  const [num, den] = String(value ?? "")
    .split("/")
    .map(Number);
  return num > 0 && den > 0 ? num / den : null;
}

/** What a remux has to keep: the file's streams in the detail ffprobe gives them. */
async function streamsOf(path) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
    { timeoutSeconds: 60 },
  );
  try {
    return JSON.parse(stdout);
  } catch {
    throw new TaskError("RENDER_FAILED", "Media could not be inspected");
  }
}

/** A stream's rotation, from its display matrix or (older files) its tag; 0 when it has none. */
function rotationOf(stream) {
  const side = (stream.side_data_list ?? []).find((entry) => entry && "rotation" in entry);
  const value = Number(side?.rotation ?? stream.tags?.rotate ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Why a source can't stand for the edit's render as it is, or null when it
 * can. Pure, so it is unit-testable: `info` is ffprobe's JSON for the file.
 * The edit asked for one clip of the whole file at speed 1 with nothing over
 * it (the app checks that), so the file must be the picture the render would
 * make: H.264 in 4:2:0 at the edit's size and rate, square pixels,
 * progressive, unrotated, as many frames as the clip, and sound (if any) in
 * AAC that runs with the picture.
 */
export function passThroughProblem(plan, info) {
  const streams = info?.streams ?? [];
  const videos = streams.filter(
    (stream) => stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const audios = streams.filter((stream) => stream.codec_type === "audio");
  const video = videos[0];
  if (!video || videos.length > 1) return "it has no single picture stream";
  if (video.codec_name !== "h264")
    return `its picture is ${video.codec_name ?? "an unknown codec"}, not H.264`;
  if (video.pix_fmt !== "yuv420p")
    return `its picture is ${video.pix_fmt ?? "an unknown format"}, not 4:2:0`;
  if (video.width !== plan.width || video.height !== plan.height)
    return `it is ${video.width}x${video.height}, not the edit's ${plan.width}x${plan.height}`;
  const sar = String(video.sample_aspect_ratio ?? "1:1");
  if (sar !== "1:1" && sar !== "0:1" && sar !== "N/A") return "its pixels aren't square";
  const frameRate = rate(video.avg_frame_rate);
  const baseRate = rate(video.r_frame_rate);
  if (
    !frameRate ||
    Math.abs(frameRate - plan.fps) > 1e-3 ||
    (baseRate && Math.abs(baseRate - plan.fps) > 1e-3)
  )
    return `it runs at ${frameRate ? Number(frameRate.toFixed(3)) : "an unknown rate"} fps, not the edit's ${plan.fps}`;
  if (video.field_order && !["progressive", "unknown"].includes(video.field_order))
    return "it is interlaced";
  if (rotationOf(video) % 360 !== 0) return "it is rotated";
  const clip = plan.clips[0];
  const frames = Number(video.nb_frames);
  const counted =
    Number.isFinite(frames) && frames > 0
      ? frames
      : Math.round(Number(video.duration ?? 0) * plan.fps);
  if (counted !== clip.durationFrames)
    return `it has ${counted} frames, where the clip has ${clip.durationFrames}`;
  if (audios.length > 1) return "it has more than one sound stream";
  const audio = audios[0];
  if (audio) {
    if (audio.codec_name !== "aac")
      return `its sound is ${audio.codec_name ?? "an unknown codec"}, not AAC`;
    const pictureSeconds = Number(video.duration ?? 0);
    const soundSeconds = Number(audio.duration ?? 0);
    if (pictureSeconds > 0 && soundSeconds > 0 && Math.abs(pictureSeconds - soundSeconds) > 0.1)
      return "its sound and picture run different lengths";
  }
  return null;
}

/**
 * Whether the edit asks for nothing over its one clip: no trim, speed,
 * fade, text, picture, other sound or level change. Mirrors the app's own
 * check (src/lib/edit/master.ts), which decides to ask; this one makes sure.
 */
export function editIsUntouched(plan) {
  if (plan.clips.length !== 1) return false;
  const clip = plan.clips[0];
  return (
    clip.kind === "video" &&
    clip.trimStart < 1e-6 &&
    clip.speed === 1 &&
    clip.volume === 1 &&
    plan.mix.picture === 1 &&
    plan.audio.length === 0 &&
    plan.captions === null &&
    plan.overlays.length === 0 &&
    plan.images.length === 0 &&
    plan.introFade === 0 &&
    plan.outroFade === 0 &&
    plan.upscale === "standard"
  );
}

/**
 * Loudness the render wouldn't change: within half a loudness unit of the
 * target, with its true peak at or below -1 dBTP (the target is -1.5; AAC can
 * move a peak a little). A render normalises otherwise, so the file isn't
 * the render.
 */
export function loudnessUnchanged(measured, target) {
  if (!measured) return false;
  return Math.abs(measured.input_i - target) <= 0.5 && measured.input_tp <= -1;
}

/**
 * The edit's one video as its own render, remuxed (its streams copied, the
 * file laid out to start playing at once), with its poster. Null, with the
 * reason, when the file isn't the render the edit asks for: the caller then
 * renders it the usual way.
 */
export async function passThroughSequence({ plan, sources, dir, limit, parseLoudness }) {
  if (!editIsUntouched(plan)) return { passed: null, reason: "the edit changes its clip" };
  const source = sources[plan.clips[0].source];
  const info = await streamsOf(source.path);
  const problem = passThroughProblem(plan, info);
  if (problem) return { passed: null, reason: problem };
  const hasSound = (info.streams ?? []).some((stream) => stream.codec_type === "audio");
  let loudness = null;
  if (hasSound) {
    const { stderr } = await ffmpeg(
      [
        "-i",
        source.path,
        "-vn",
        "-af",
        `loudnorm=I=${plan.loudness}:TP=-1.5:LRA=11:print_format=json`,
        "-f",
        "null",
        "-",
      ],
      limit,
    );
    loudness = parseLoudness(stderr);
    if (
      plan.normalize &&
      loudness &&
      loudness.input_i > -60 &&
      !loudnessUnchanged(loudness, plan.loudness)
    )
      return { passed: null, reason: "its loudness isn't the edit's target", loudness };
  }

  const out = join(dir, "sequence.mp4");
  await ffmpeg(
    [
      "-i",
      source.path,
      "-map",
      "0:v:0",
      ...(hasSound ? ["-map", "0:a:0"] : []),
      "-c",
      "copy",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      out,
    ],
    limit,
  );
  // The copy is checked as the source was: anything lost on the way, and it is rendered instead.
  const copied = passThroughProblem(plan, await streamsOf(out));
  if (copied) return { passed: null, reason: `its copy ${copied.replace(/^it /, "")}` };

  // Its poster in a JPEG's own colour, its picture read as a player reads it (see ./colour.js).
  const picture = (info.streams ?? []).find(
    (stream) => stream.codec_type === "video" && !stream.disposition?.attached_pic,
  );
  const poster = join(dir, "poster.jpg");
  await ffmpeg(
    [
      "-ss",
      Math.min(1, plan.total / 2).toFixed(6),
      "-i",
      out,
      "-frames:v",
      "1",
      "-vf",
      `scale=${Math.min(720, plan.width)}:-2:${asImage(picture, "jpg")}`,
      "-q:v",
      "3",
      poster,
    ],
    limit,
  );
  return { passed: { video: out, poster, metadata: await probe(out) }, loudness };
}

/** A passed-through master as the render's result: the file and its poster, and what was done. */
export function passedThroughResult(plan, attempt) {
  const { passed, loudness } = attempt;
  return {
    outputs: [
      { path: passed.video, mime: "video/mp4", kind: "video" },
      { path: passed.poster, mime: "image/jpeg", kind: "image" },
    ],
    metadata: {
      ...passed.metadata,
      planned_duration_seconds: Number(plan.total.toFixed(3)),
      clip_count: 1,
      // Its own loudness, as measured (within half a unit of the target when the edit evens it out).
      loudness_lufs:
        loudness && loudness.input_i > -60 ? Number(loudness.input_i.toFixed(1)) : null,
      pass_through: { used: true },
    },
  };
}
