/**
 * Offline self-test: renders synthetic media with the real task handlers, with
 * no network and no app involvement. Run inside the image after building:
 *   docker run --rm -e MEDIA_WORKER_SHARED_SECRET=0123456789abcdef xeno-media-worker npm run selftest
 */
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TASKS } from "./tasks.js";
import { clipRuns, fitAudioToSources, inParallel } from "./sequence.js";
import { alignFrames, detailLevel, downscale } from "./align.js";
import { Lanes, idleLongEnough, laneOf } from "./lanes.js";
import { config } from "./config.js";

const dir = await mkdtemp(join(tmpdir(), "selftest-"));
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${name}: ${error.message}`);
  }
}

// Two short synthetic clips with tone, so every task has real media to chew on.
const clipA = join(dir, "a.mp4");
const clipB = join(dir, "b.mp4");
for (const [path, colour] of [[clipA, "red"], [clipB, "blue"]]) {
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=${colour}:s=640x360:d=3:r=25`,
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path,
  ]);
}

console.log("xeno-media-worker self-test");

await check("probe", async () => {
  const { metadata } = await TASKS.probe.run({ sources: [{ path: clipA }], params: {}, dir });
  if (!metadata.duration_seconds) throw new Error("no duration reported");
});

await check("create_thumbnail", async () => {
  const result = await TASKS.create_thumbnail.run({ sources: [{ path: clipA }], params: { time_seconds: 1, width: 320 }, dir });
  if ((await stat(result.outputs[0].path)).size < 500) throw new Error("thumbnail too small");
});

await check("extract_frames", async () => {
  const result = await TASKS.extract_frames.run({ sources: [{ path: clipA }], params: { count: 3, duration_seconds: 3 }, dir });
  if (result.outputs.length !== 3) throw new Error("expected 3 frames");
});

await check("trim_video", async () => {
  const result = await TASKS.trim_video.run({ sources: [{ path: clipA }], params: { start_seconds: 0.5, end_seconds: 2 }, dir });
  const info = await probe(result.outputs[0].path);
  if (!info.duration_seconds || info.duration_seconds > 2.2) throw new Error(`unexpected duration ${info.duration_seconds}`);
});

await check("reframe_video 9:16", async () => {
  const result = await TASKS.reframe_video.run({ sources: [{ path: clipA }], params: { width: 540, height: 960, mode: "blur_pad" }, dir });
  const info = await probe(result.outputs[0].path);
  if (info.width !== 540 || info.height !== 960) throw new Error(`unexpected frame ${info.width}x${info.height}`);
});

await check("extract_audio", async () => {
  const result = await TASKS.extract_audio.run({ sources: [{ path: clipA }], params: { format: "wav" }, dir });
  if ((await stat(result.outputs[0].path)).size < 1000) throw new Error("audio too small");
});

await check("assemble_video (concat)", async () => {
  const result = await TASKS.assemble_video.run({
    sources: [{ path: clipA, role: "source" }, { path: clipB, role: "source" }],
    params: { width: 640, height: 360, clips: [{ source_index: 0, end_seconds: 1.5 }, { source_index: 1, end_seconds: 1.5 }] },
    dir,
  });
  const info = await probe(result.outputs[0].path);
  if (!info.duration_seconds || info.duration_seconds < 2.5) throw new Error(`unexpected duration ${info.duration_seconds}`);
});

await check("assemble_video (cross-fade)", async () => {
  const result = await TASKS.assemble_video.run({
    sources: [{ path: clipA, role: "source" }, { path: clipB, role: "source" }],
    params: { width: 640, height: 360, transition_seconds: 0.5, clips: [{ source_index: 0, end_seconds: 2 }, { source_index: 1, end_seconds: 2 }] },
    dir,
  });
  if ((await stat(result.outputs[0].path)).size < 5000) throw new Error("assembled file too small");
});

await check("render_sequence (transitions, still, voice, ducked music, captions)", async () => {
  const still = join(dir, "still.jpg");
  const voice = join(dir, "voice.wav");
  const music = join(dir, "music.wav");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=800x600:d=1", "-frames:v", "1", still]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=1000:duration=2", voice]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=200:duration=1", music]);
  const marks = [];
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: clipA, role: "video" },
      { path: clipB, role: "video" },
      { path: still, role: "image" },
      { path: voice, role: "audio" },
      { path: music, role: "audio" },
    ],
    params: {
      width: 360, height: 640, fps: 25,
      clips: [
        { source_index: 0, duration: 2 },
        { source_index: 1, duration: 2, transition: { type: "fade", duration: 0.5 } },
        { source_index: 2, kind: "image", duration: 1.5, motion: "zoom_in", transition: { type: "slideup", duration: 0.4 } },
      ],
      audio: [
        { source_index: 3, role: "voiceover", start: 0.5 },
        { source_index: 4, role: "music", loop: true, volume: 0.6 },
      ],
      captions: { segments: [{ start: 0.5, end: 2.5, text: "Self-test caption" }] },
    },
    dir,
    progress: (value) => marks.push(value),
  });
  const info = await probe(result.outputs[0].path);
  if (info.width !== 360 || info.height !== 640) throw new Error(`unexpected frame ${info.width}x${info.height}`);
  if (Math.abs(info.duration_seconds - 4.6) > 0.1) throw new Error(`unexpected duration ${info.duration_seconds}`);
  if (!info.has_audio) throw new Error("no soundtrack");
  if ((await stat(result.outputs[1].path)).size < 1000) throw new Error("poster too small");
  if (!marks.length) throw new Error("no progress reported");
});

await check("a track that doesn't loop is fitted to what its file holds", async () => {
  const fitted = await fitAudioToSources(
    [
      { source: 0, trimStart: 0.5, length: 6, fadeIn: 0.2, fadeOut: 1, loop: false },
      { source: 1, trimStart: 0, length: 6, fadeIn: 0, fadeOut: 1, loop: true },
      { source: 2, trimStart: 3, length: 4, fadeIn: 0, fadeOut: 0.5, loop: false },
      { source: 3, trimStart: 0, length: 1, fadeIn: 0, fadeOut: 0.5, loop: false },
    ],
    async () => 2,
  );
  const [short, looped, kept] = fitted;
  if (fitted.length !== 3) throw new Error(`a track with nothing left to play should be dropped (${fitted.length} kept)`);
  if (Math.abs(short.length - 1.5) > 1e-9 || short.fadeOut !== 0.75 || short.fadeIn !== 0.2) throw new Error(`short track ${JSON.stringify(short)}`);
  if (looped.length !== 6) throw new Error("a looping track keeps its length");
  if (kept.length !== 1) throw new Error("a track shorter than its file keeps its length");
});

await check("render_sequence fades out a short voice where its sound ends", async () => {
  const still = join(dir, "fade-still.jpg");
  const voice = join(dir, "fade-voice.wav");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:d=1", "-frames:v", "1", still]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=800:duration=1", voice]);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: still, role: "image" },
      { path: voice, role: "audio" },
    ],
    params: {
      width: 360, height: 640, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, kind: "image", duration: 3 }],
      audio: [{ source_index: 1, role: "voiceover", start: 0, fade_out: 0.4 }],
    },
    dir,
  });
  // Level near the end of the voice against its middle: the fade has to happen while it still sounds.
  const level = async (from) => {
    const { stderr } = await ffmpeg(["-ss", String(from), "-t", "0.08", "-i", result.outputs[0].path, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
    return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? Number.NaN);
  };
  const middle = await level(0.3);
  const end = await level(0.9);
  if (!(middle - end > 10)) throw new Error(`no fade before the voice ends (middle ${middle} dB, end ${end} dB)`);
});

await check("render_sequence applies channel levels to whole buses", async () => {
  let run = 0;
  const meanVolume = async (mix, audio) => {
    // A render removes its sources once used, so each gets its own.
    run += 1;
    const still = join(dir, `mix-still-${run}.jpg`);
    const voice = join(dir, `mix-voice-${run}.wav`);
    const bed = join(dir, `mix-bed-${run}.wav`);
    await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:d=1", "-frames:v", "1", still]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=500:duration=2", voice]);
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=300:duration=2", bed]);
    const result = await TASKS.render_sequence.run({
      sources: [
        { path: still, role: "image" },
        { path: voice, role: "audio" },
        { path: bed, role: "audio" },
      ],
      params: {
        width: 360, height: 640, fps: 25, normalize_loudness: false,
        clips: [{ source_index: 0, kind: "image", duration: 2 }],
        audio,
        ...(mix ? { mix } : {}),
      },
      dir,
    });
    const { stderr } = await ffmpeg(["-ss", "0.5", "-t", "1", "-i", result.outputs[0].path, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
    return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? Number.NaN);
  };
  const voiceOnly = [{ source_index: 1, role: "voiceover", start: 0 }];
  const full = await meanVolume(null, voiceOnly);
  const half = await meanVolume({ voiceover: 0.5 }, voiceOnly);
  // Half the amplitude is about 6 dB quieter.
  if (!(Math.abs(full - half - 6.02) < 1)) throw new Error(`voiceover at 0.5 should be ~6 dB quieter (full ${full} dB, half ${half} dB)`);
  // A silent channel is left out: only the voiceover remains.
  const both = [...voiceOnly, { source_index: 2, role: "music", start: 0, duck: false }];
  const musicOff = await meanVolume({ music: 0 }, both);
  if (!(Math.abs(musicOff - full) < 0.5)) throw new Error(`music at 0 should leave just the voice (voice ${full} dB, mix ${musicOff} dB)`);
});

// A two-colour clip (red left, blue right) for checking where a crop lands.
const halves = join(dir, "halves.mp4");
await ffmpeg([
  "-f", "lavfi", "-i", "color=c=red:s=320x360:d=1:r=25",
  "-f", "lavfi", "-i", "color=c=blue:s=320x360:d=1:r=25",
  "-filter_complex", "[0:v][1:v]hstack=inputs=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", halves,
]);

/** The average colour of a region of a file's first frame, as [r, g, b]. */
async function colourAt(path, crop) {
  const out = join(dir, `pixel-${Math.random().toString(36).slice(2)}.ppm`);
  await ffmpeg(["-i", path, "-frames:v", "1", "-vf", `crop=${crop},scale=1:1`, "-c:v", "ppm", out]);
  const bytes = await readFile(out);
  return [...bytes.subarray(bytes.length - 3)];
}
const near = (colour, [r, g, b]) => Math.abs(colour[0] - r) < 60 && Math.abs(colour[1] - g) < 60 && Math.abs(colour[2] - b) < 60;

await check("reframe_video crops around its focus point", async () => {
  const left = await TASKS.reframe_video.run({ sources: [{ path: halves }], params: { width: 180, height: 320, mode: "cover", focus_x: 0 }, dir });
  const leftColour = await colourAt(left.outputs[0].path, "40:40:70:140");
  if (!near(leftColour, [255, 0, 0])) throw new Error(`focus 0 should keep the red left half, got ${leftColour}`);
  const right = await TASKS.reframe_video.run({ sources: [{ path: halves }], params: { width: 180, height: 320, mode: "cover", focus_x: 1 }, dir });
  const rightColour = await colourAt(right.outputs[0].path, "40:40:70:140");
  if (!near(rightColour, [0, 0, 255])) throw new Error(`focus 1 should keep the blue right half, got ${rightColour}`);
});

await check("reframe_video shows the whole picture on the colour asked", async () => {
  // Its own clip: a render may have removed the shared ones by now.
  const red = join(dir, "red.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=640x360:d=1:r=25", "-c:v", "libx264", "-pix_fmt", "yuv420p", red]);
  const result = await TASKS.reframe_video.run({ sources: [{ path: red }], params: { width: 360, height: 640, mode: "contain", background: "#00ff00" }, dir });
  const corner = await colourAt(result.outputs[0].path, "16:16:0:0");
  if (!near(corner, [0, 255, 0])) throw new Error(`the space around should be green, got ${corner}`);
  const middle = await colourAt(result.outputs[0].path, "16:16:172:312");
  if (!near(middle, [255, 0, 0])) throw new Error(`the picture should still be red, got ${middle}`);
});

await check("resize_image crops a still around its focus point", async () => {
  const still = join(dir, "halves.png");
  await ffmpeg(["-i", halves, "-frames:v", "1", still]);
  const result = await TASKS.resize_image.run({ sources: [{ path: still }], params: { width: 180, height: 320, mode: "cover", focus_x: 1, format: "png" }, dir });
  const colour = await colourAt(result.outputs[0].path, "40:40:70:140");
  if (!near(colour, [0, 0, 255])) throw new Error(`focus 1 should keep the blue right half, got ${colour}`);
});

await check("render_sequence crops a clip around its focus point", async () => {
  const result = await TASKS.render_sequence.run({
    sources: [{ path: halves, role: "video" }],
    params: { width: 180, height: 320, fps: 25, normalize_loudness: false, clips: [{ source_index: 0, duration: 0.8, focus_x: 0 }] },
    dir,
  });
  const colour = await colourAt(result.outputs[0].path, "40:40:70:140");
  if (!near(colour, [255, 0, 0])) throw new Error(`focus 0 should keep the red left half, got ${colour}`);
});

/** The average colour of frame `n` of a file, as [r, g, b]. */
async function colourOfFrame(path, n) {
  const out = join(dir, `frame-${Math.random().toString(36).slice(2)}.ppm`);
  await ffmpeg(["-i", path, "-vf", `select=eq(n\\,${n}),scale=1:1:flags=area`, "-fps_mode", "passthrough", "-frames:v", "1", "-c:v", "ppm", out]);
  const bytes = await readFile(out);
  return [...bytes.subarray(bytes.length - 3)];
}

/** A clip whose frame n is grey level `level(n)`: 48 frames at 24 fps, with sound running a second longer. */
async function numberedClip(name, level) {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=black:s=64x36:r=24:d=2,format=yuv420p,geq=lum='16+${level}':cb=128:cr=128`,
    "-f", "lavfi", "-i", "sine=frequency=300:duration=3",
    "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", path,
  ]);
  return path;
}

await check("extract_frames takes a clip's true last frame, by counting its frames", async () => {
  const clip = await numberedClip("numbered.mp4", "N*4");
  const result = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { frame: "last", format: "png", times_seconds: [0.5] }, dir });
  const meta = result.metadata;
  if (meta.frame_mode !== "last") throw new Error("not taken as the last frame");
  if (meta.frame_count !== 48 || meta.frame_index !== 47) throw new Error(`expected frame 47 of 48, got ${meta.frame_index} of ${meta.frame_count}`);
  if (Math.abs(meta.clip_duration_seconds - 2) > 1e-6) throw new Error(`the clip is 2 s of picture, not ${meta.clip_duration_seconds}`);
  if (result.outputs[0].mime !== "image/png") throw new Error("the frame should be lossless PNG");
  // The same picture as frame 47 decoded on its own, and not frame 46's.
  const [taken] = await colourOfFrame(result.outputs[0].path, 0);
  const [last] = await colourOfFrame(clip, 47);
  const [before] = await colourOfFrame(clip, 46);
  if (Math.abs(taken - last) > 1 || Math.abs(taken - before) < 3) {
    throw new Error(`the frame taken (grey ${taken}) should be the last (${last}), not the one before (${before})`);
  }
});

await check("extract_frames leaves out a tail frozen on one picture", async () => {
  const clip = await numberedClip("frozen.mp4", "min(N\\,40)*4");
  const { metadata } = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { frame: "last" }, dir });
  if (metadata.frame_index !== 40 || metadata.frozen_frames !== 7) {
    throw new Error(`expected the freeze to start at frame 40 (7 frozen), got ${metadata.frame_index} (${metadata.frozen_frames})`);
  }
});

await check("extract_frames keeps a still shot's true last frame", async () => {
  const clip = await numberedClip("still.mp4", "90");
  const { metadata } = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { frame: "last" }, dir });
  if (metadata.frame_index !== 47) throw new Error(`a shot still all along keeps its last frame, got ${metadata.frame_index}`);
});

await check("extract_frames reads where the camera was moving", async () => {
  const pan = join(dir, "pan.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=2,crop=320:180:x='t*120':y=90", "-c:v", "libx264", "-pix_fmt", "yuv420p", pan]);
  const { metadata } = await TASKS.extract_frames.run({ sources: [{ path: pan }], params: { frame: "last" }, dir });
  const kinds = (metadata.motion?.moves ?? []).map((move) => move.kind);
  if (!kinds.includes("pan_right")) throw new Error(`expected a pan right, got ${JSON.stringify(metadata.motion)}`);
});

await check("extract_frames still takes frames by time when asked", async () => {
  const clip = await numberedClip("timed.mp4", "N*4");
  const result = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { times_seconds: [1.0] }, dir });
  if (result.outputs.length !== 1 || result.metadata.frame_mode) throw new Error("expected one frame taken by time");
});

await check("render_sequence eases a clip's colour into the clip before at a join", async () => {
  // One continuous move split in two, the second half re-rendered darker, as a
  // generated clip that starts from the first's last frame can be.
  const whole = join(dir, "whole.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", whole]);
  const render = async (match) => {
    const first = join(dir, `first-${match}.mp4`);
    const second = join(dir, `second-${match}.mp4`);
    await ffmpeg(["-i", whole, "-vf", "select='lte(n,49)'", "-fps_mode", "passthrough", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", first]);
    await ffmpeg(["-i", whole, "-vf", "select='gte(n,49)',setpts=N/25/TB,eq=brightness=-0.06", "-fps_mode", "passthrough", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", second]);
    const result = await TASKS.render_sequence.run({
      sources: [{ path: first, role: "video" }, { path: second, role: "video" }],
      params: {
        width: 640, height: 360, fps: 25, normalize_loudness: false,
        clips: [
          { source_index: 0, duration: 2 },
          // Skips its first frame, its copy of the first clip's last.
          { source_index: 1, duration: 1.6, trim_start: 0.04, match_previous: match },
        ],
      },
      dir,
    });
    const before = await colourOfFrame(result.outputs[0].path, 49);
    const after = await colourOfFrame(result.outputs[0].path, 50);
    const later = await colourOfFrame(result.outputs[0].path, 89);
    return { step: before.reduce((sum, value, index) => sum + Math.abs(value - after[index]), 0) / 3, later, seams: result.metadata.seams_matched ?? [] };
  };
  const plain = await render(false);
  const eased = await render(true);
  if (!eased.seams.length) throw new Error("the join wasn't matched");
  if (!(eased.step < plain.step * 0.5)) throw new Error(`the join should step less when matched (${eased.step} vs ${plain.step})`);
  // Eased back to the clip's own colour by the end.
  const drift = eased.later.reduce((sum, value, index) => sum + Math.abs(value - plain.later[index]), 0) / 3;
  if (drift > 3) throw new Error(`the clip should be back to its own colour later on (off by ${drift})`);
});

/** Frame `n` of a file as a grey plane, at its own size. */
async function greyFrame(path, n, width, height) {
  const out = join(dir, `grey-${Math.random().toString(36).slice(2)}.gray`);
  await ffmpeg(["-i", path, "-vf", `select=eq(n\\,${n}),format=gray`, "-fps_mode", "passthrough", "-frames:v", "1", "-f", "rawvideo", out]);
  const plane = await readFile(out);
  await rm(out, { force: true });
  return { data: downscale(plane, width, height, 1).data, plane, width, height };
}

/** How a file steps from one frame to another: the stretch and shift between them, and the change in light and in detail. */
async function frameStep(path, before, after) {
  const a = await greyFrame(path, before, 640, 360);
  const b = await greyFrame(path, after, 640, 360);
  const fit = alignFrames(a, b);
  const mean = (plane) => plane.reduce((sum, value) => sum + value, 0) / plane.length;
  return {
    stretch: [fit.map.a, fit.map.d],
    shift: [fit.map.tx, fit.map.ty],
    light: mean(b.plane) - mean(a.plane),
    detail: detailLevel(b.plane, 640, 360, 8) / detailLevel(a.plane, 640, 360, 8),
  };
}

/** How far a cut's step is from the scene's own step between the same two moments. */
function offStep(step, reference) {
  return {
    stretch: Math.max(...step.stretch.map((value, index) => Math.abs(value - reference.stretch[index]))),
    shift: Math.max(...step.shift.map((value, index) => Math.abs(value - reference.shift[index]))),
    light: Math.abs(step.light - reference.light),
    detail: Math.abs(step.detail - reference.detail),
  };
}

// One continuous camera move over a textured scene, filmed wider than the
// frame, for joins whose second clip is re-rendered the way a video model
// re-renders its start image.
const scene = join(dir, "scene.mp4");
await ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=s=900x480:r=25:d=5,noise=alls=50:allf=u,gblur=sigma=1.2,crop=704:396:x='t*24':y='t*6'",
  "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", scene,
]);
// The scene's own step from frame 49 to 50, with no join between them.
const unbroken = join(dir, "unbroken.mp4");
await ffmpeg(["-i", scene, "-vf", "crop=640:360:0:0", "-frames:v", "60", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", unbroken]);
const sceneStep = await frameStep(unbroken, 49, 50);

/**
 * Renders the scene's first 50 frames, then a re-render of the rest (made by
 * `rerender`, from frame 49, which the second clip skips as its copy of the
 * first's last), joined plainly or smartly, each in its own folder.
 */
async function renderJoin(name, rerender, how) {
  const work = await mkdtemp(join(dir, `${name}-${how}-`));
  const first = join(work, "first.mp4");
  const second = join(work, "second.mp4");
  await ffmpeg(["-i", scene, "-vf", "select='lte(n,49)',crop=640:360:0:0", "-fps_mode", "passthrough", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", first]);
  await ffmpeg(["-i", scene, "-vf", `select='gte(n,49)',setpts=N/25/TB,${rerender}`, "-fps_mode", "passthrough", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", second]);
  const result = await TASKS.render_sequence.run({
    sources: [{ path: first, role: "video" }, { path: second, role: "video" }],
    params: {
      width: 640, height: 360, fps: 25, normalize_loudness: false,
      clips: [
        { source_index: 0, duration: 2 },
        { source_index: 1, duration: 3, trim_start: 0.04, ...(how === "smart" ? { join: "smart", match_previous: true } : {}) },
      ],
    },
    dir: work,
  });
  return { path: result.outputs[0].path, report: result.metadata.smart_joins?.[0] ?? null };
}

await check("render_sequence puts a re-rendered join back in register (framing, light, detail)", async () => {
  // The second clip's start image fitted to a larger working size from the
  // top-left corner (so it shows a little more right and below, its picture
  // 3% narrower and 1% shorter), a little darker and softer.
  const rerender = "crop=661:364:0:0,scale=640:360,setsar=1,eq=brightness=-0.05,gblur=sigma=0.5";
  const plain = await renderJoin("stretched", rerender, "plain");
  const smart = await renderJoin("stretched", rerender, "smart");
  const report = smart.report;
  if (!report?.matched || !report.framing) throw new Error(`the join wasn't put in register: ${JSON.stringify(report)}`);
  if (Math.abs(report.framing.scale_x - 640 / 661) > 0.004 || Math.abs(report.framing.scale_y - 360 / 364) > 0.004) {
    throw new Error(`the re-render's stretch was misread: ${JSON.stringify(report.framing)}`);
  }
  if (!report.detail || !(report.detail.amount > 0)) throw new Error(`the softer start should have been sharpened: ${JSON.stringify(report)}`);
  const before = offStep(await frameStep(plain.path, 49, 50), sceneStep);
  const after = offStep(await frameStep(smart.path, 49, 50), sceneStep);
  if (!(before.stretch > 0.02)) throw new Error(`the plain cut should jump in framing (${before.stretch})`);
  if (!(after.stretch < 0.004 && after.shift < 0.8)) throw new Error(`the smart cut should step like the scene (stretch ${after.stretch}, shift ${after.shift})`);
  if (!(after.light < before.light * 0.5)) throw new Error(`the light should step less (${after.light} vs ${before.light})`);
  if (!(after.detail < before.detail * 0.6)) throw new Error(`the detail should step less (${after.detail} vs ${before.detail})`);
  // By its last frame the clip is back to its own picture.
  const own = alignFrames(await greyFrame(plain.path, 124, 640, 360), await greyFrame(smart.path, 124, 640, 360));
  if (Math.max(Math.abs(own.map.a), Math.abs(own.map.d)) > 0.002 || Math.abs(own.gain - 1) > 0.02) {
    throw new Error(`the clip should end on its own picture (${JSON.stringify(own.map)}, gain ${own.gain})`);
  }
});

await check("render_sequence eases the clip before into a re-render that lost some of its picture", async () => {
  // The start image cropped and enlarged: the second clip lacks the first's
  // edges, so the first eases into the framing they share instead.
  const rerender = "crop=621:349:10:6,scale=640:360,setsar=1";
  const plain = await renderJoin("cropped", rerender, "plain");
  const smart = await renderJoin("cropped", rerender, "smart");
  if (!(smart.report?.framing?.previous_seconds > 0)) throw new Error(`the clip before should ease in: ${JSON.stringify(smart.report)}`);
  const before = offStep(await frameStep(plain.path, 49, 50), sceneStep);
  const after = offStep(await frameStep(smart.path, 49, 50), sceneStep);
  if (!(before.stretch > 0.02)) throw new Error(`the plain cut should jump in framing (${before.stretch})`);
  if (!(after.stretch < 0.004 && after.shift < 0.8)) throw new Error(`the smart cut should step like the scene (stretch ${after.stretch}, shift ${after.shift})`);
  // The first clip is untouched before its ease (here, on its first frame: it is short).
  const early = alignFrames(await greyFrame(plain.path, 0, 640, 360), await greyFrame(smart.path, 0, 640, 360));
  if (Math.max(Math.abs(early.map.a), Math.abs(early.map.d)) > 0.0005 || Math.hypot(early.map.tx, early.map.ty) > 0.05) {
    throw new Error(`the first clip should be untouched before its ease (${JSON.stringify(early.map)})`);
  }
});

await check("a render step that stops writing is stopped as hung, well before its time limit", async () => {
  // An input that never opens: FFmpeg waits on it, writing nothing.
  const fifo = join(dir, "never.fifo");
  execFileSync("mkfifo", [fifo]);
  const started = Date.now();
  try {
    await ffmpeg(["-f", "s16le", "-ar", "8000", "-ac", "1", "-i", fifo, "-f", "null", "-"], { timeoutSeconds: 120, stallSeconds: 2 });
  } catch (error) {
    if (error.code !== "TASK_STALLED") throw error;
    if (Date.now() - started > 20_000) throw new Error(`stopped after ${Date.now() - started} ms, not soon after 2 s`);
    return;
  }
  throw new Error("a step writing nothing was left running");
});

await check("a render step that keeps writing isn't taken for hung", async () => {
  // Three seconds of real-time output: it moves on all along, though the
  // stall limit is shorter than the whole run.
  await ffmpeg(["-re", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-f", "null", "-"], { timeoutSeconds: 60, stallSeconds: 1 });
});

await check("rejects a background that isn't a colour", async () => {
  try {
    await TASKS.reframe_video.run({ sources: [{ path: clipA }], params: { width: 540, height: 960, mode: "contain", background: "red:x=1" }, dir });
  } catch (error) {
    if (error.code === "INVALID_PARAMETERS") return;
    throw error;
  }
  throw new Error("a background that isn't a colour was accepted");
});

await check("rejects an unsupported parameter value", async () => {
  try {
    await TASKS.reframe_video.run({ sources: [{ path: clipA }], params: { width: 540, height: 960, mode: "rm -rf /" }, dir });
  } catch (error) {
    if (error.code === "INVALID_PARAMETERS") return;
    throw error;
  }
  throw new Error("invalid mode was accepted");
});

await check("extract_frames takes a frame by its number", async () => {
  const clip = await numberedClip("indexed.mp4", "N*4");
  const result = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { frame: "index", index: 30, format: "png", times_seconds: [1.25] }, dir });
  const meta = result.metadata;
  if (meta.frame_mode !== "index" || meta.frame_index !== 30 || meta.frame_count !== 48) {
    throw new Error(`expected frame 30 of 48, got ${meta.frame_index} of ${meta.frame_count} (${meta.frame_mode})`);
  }
  const [taken] = await colourOfFrame(result.outputs[0].path, 0);
  const [wanted] = await colourOfFrame(clip, 30);
  const [before] = await colourOfFrame(clip, 29);
  if (Math.abs(taken - wanted) > 1 || Math.abs(taken - before) < 3) {
    throw new Error(`the frame taken (grey ${taken}) should be frame 30 (${wanted}), not 29 (${before})`);
  }
  const past = await TASKS.extract_frames.run({ sources: [{ path: clip }], params: { frame: "index", index: 500 }, dir });
  if (past.metadata.frame_index !== 47) throw new Error(`a number past the end should take the last frame, got ${past.metadata.frame_index}`);
});

// A "voiceover": three phrases of modulated tone over pink room noise, with
// pauses at 1.40-1.90 s and 3.20-3.70 s, encoded as an MP3 (whose encoder
// delay the canonical file must not keep).
const takeMp3 = join(dir, "take.mp3");
await ffmpeg([
  "-f", "lavfi", "-i",
  "aevalsrc='0.4*sin(2*PI*220*t)*(between(t,0.30,1.40)+between(t,1.90,3.20)+between(t,3.70,4.60))*(0.6+0.4*sin(2*PI*5*t))':s=44100:d=5",
  "-f", "lavfi", "-i", "anoisesrc=a=0.002:c=pink:d=5:r=44100",
  "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0",
  "-c:a", "libmp3lame", "-b:a", "128k", takeMp3,
]);

await check("prepare_audio makes the canonical WAV and finds the pauses between the speech", async () => {
  const { readWavInfo } = await import("./voice.js");
  const result = await TASKS.prepare_audio.run({ sources: [{ path: takeMp3, role: "audio" }], params: {}, dir });
  const meta = result.metadata;
  if (result.outputs.length !== 2) throw new Error(`expected 2 files, got ${result.outputs.length}`);
  const wav = await readWavInfo(result.outputs[0].path);
  if (wav.tag !== 1 || wav.rate !== 48000 || wav.channels !== 1 || wav.bits !== 16) throw new Error(`unexpected format ${JSON.stringify(wav)}`);
  if (wav.samples !== meta.samples) throw new Error(`the reported length (${meta.samples}) isn't the file's (${wav.samples})`);
  if (Math.abs(meta.duration_seconds - 5) > 0.03) throw new Error(`the MP3's 5 s came out as ${meta.duration_seconds} s`);
  const speech = await readWavInfo(result.outputs[1].path);
  if (speech.rate !== 16000 || speech.channels !== 1) throw new Error("the speech copy should be 16 kHz mono");
  if (!meta.clear_pauses) throw new Error("the pauses should be clear");
  // The speech starts where it was made to: the encoder's delay is gone.
  if (Math.abs(meta.speech_start_seconds - 0.3) > 0.03) throw new Error(`speech should start at 0.30 s, found ${meta.speech_start_seconds}`);
  const near = (from, to) => meta.pauses.some(([a, b]) => Math.abs(a - from) <= 0.04 && Math.abs(b - to) <= 0.04);
  if (!near(1.4, 1.9) || !near(3.2, 3.7)) throw new Error(`expected pauses at 1.40-1.90 and 3.20-3.70, found ${JSON.stringify(meta.pauses)}`);
  if (meta.pauses.some(([a, b]) => a > 0.35 && b < 4.55 && !(Math.abs(a - 1.4) <= 0.04 || Math.abs(a - 3.2) <= 0.04))) {
    throw new Error(`found a pause in the middle of a phrase: ${JSON.stringify(meta.pauses)}`);
  }
  if (!meta.envelope?.data || meta.envelope.rate !== 25) throw new Error("no waveform");
});

// The voiceover piece a clip is made from, and the clip as a provider might
// deliver it: H.264 with AAC in MP4, its sound late, early or in step.
const drive = join(dir, "drive.wav");
await ffmpeg([
  "-f", "lavfi", "-i",
  "aevalsrc='0.5*sin(2*PI*180*t)*(between(t,0.2,0.9)+between(t,1.3,1.6)+between(t,2.0,3.1)+between(t,3.5,3.8))*(0.55+0.45*sin(2*PI*6*t))':s=48000:d=4",
  "-c:a", "pcm_s16le", drive,
]);
async function clipWithSound(name, soundFilter) {
  const path = join(dir, name);
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=s=320x240:r=30:d=4.5",
    "-i", drive,
    "-filter_complex", `[1:a]${soundFilter},apad[a]`,
    "-map", "0:v", "-map", "[a]", "-t", "4.5",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", path,
  ]);
  return path;
}

for (const [label, filter, expected] of [
  ["120 ms late", "adelay=120:all=1", 0.12],
  ["80 ms early", "atrim=start=0.08,asetpts=PTS-STARTPTS", -0.08],
  ["in step", "anull", 0],
]) {
  await check(`measure_sync finds a clip's sound ${label}`, async () => {
    const clip = await clipWithSound(`sync-${expected}.mp4`, filter);
    const { outputs, metadata } = await TASKS.measure_sync.run({
      sources: [{ path: clip, role: "video" }, { path: drive, role: "audio" }],
      params: {},
      dir,
    });
    if (outputs.length) throw new Error("measure_sync makes no files");
    if (metadata.status !== "measured") throw new Error(`expected a clear measurement, got ${JSON.stringify(metadata)}`);
    if (Math.abs(metadata.offset_seconds - expected) > 0.005) {
      throw new Error(`expected ${expected} s, measured ${metadata.offset_seconds} s (${JSON.stringify(metadata)})`);
    }
    if (metadata.drift_seconds !== null && Math.abs(metadata.drift_seconds) > 0.01) throw new Error(`no drift expected, found ${metadata.drift_seconds}`);
  });
}

await check("measure_sync finds the speech in a clip whose voice was made anew", async () => {
  // The same words at the same times in another voice (another pitch, with
  // harmonics), 60 ms late: nothing of the waveform is left to match.
  const gate = "(between(t,0.2,0.9)+between(t,1.3,1.6)+between(t,2.0,3.1)+between(t,3.5,3.8))*(0.55+0.45*sin(2*PI*6*t))";
  const clip = join(dir, "revoiced.mp4");
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=s=320x240:r=30:d=4.5",
    "-f", "lavfi", "-i", `aevalsrc='(0.3*sin(2*PI*290*t)+0.15*sin(2*PI*580*t)+0.08*sin(2*PI*870*t))*${gate}':s=48000:d=4`,
    "-filter_complex", "[1:a]adelay=60:all=1,apad[a]",
    "-map", "0:v", "-map", "[a]", "-t", "4.5",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", clip,
  ]);
  const { metadata } = await TASKS.measure_sync.run({ sources: [{ path: clip, role: "video" }, { path: drive, role: "audio" }], params: {}, dir });
  if (metadata.status !== "measured" || Math.abs(metadata.offset_seconds - 0.06) > 0.005) {
    throw new Error(`expected 0.06 s, measured ${JSON.stringify(metadata)}`);
  }
});

await check("prepare_audio keeps an M4A's timing (its encoder priming left out)", async () => {
  const take = join(dir, "take.m4a");
  await ffmpeg(["-i", takeMp3, "-c:a", "aac", "-b:a", "128k", take]);
  const { metadata } = await TASKS.prepare_audio.run({ sources: [{ path: take, role: "audio" }], params: {}, dir });
  if (Math.abs(metadata.speech_start_seconds - 0.3) > 0.03) throw new Error(`speech should start at 0.30 s, found ${metadata.speech_start_seconds}`);
  if (!metadata.pauses.some(([a, b]) => Math.abs(a - 1.4) <= 0.04 && Math.abs(b - 1.9) <= 0.04)) {
    throw new Error(`expected the pause at 1.40-1.90, found ${JSON.stringify(metadata.pauses)}`);
  }
});

await check("prepare_audio refuses a file with no sound", async () => {
  const mute = join(dir, "mute.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=160x120:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", mute]);
  try {
    await TASKS.prepare_audio.run({ sources: [{ path: mute }], params: {}, dir });
  } catch (error) {
    if (error.code === "INVALID_PARAMETERS") return;
    throw error;
  }
  throw new Error("a file with no sound was accepted as a voiceover");
});

await check("measure_sync says when a clip has no sound", async () => {
  const silent = join(dir, "silent.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=320x240:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);
  const { metadata } = await TASKS.measure_sync.run({ sources: [{ path: silent, role: "video" }, { path: drive, role: "audio" }], params: {}, dir });
  if (metadata.status !== "no_audio" || metadata.has_audio !== false) throw new Error(`expected no_audio, got ${JSON.stringify(metadata)}`);
});

await check("a quick task runs while the render lane is full", async () => {
  const started = [];
  const finish = new Map();
  const lanes = new Lanes({ heavy: 1, quick: 1 }, (task) => {
    started.push(task.taskId);
    return new Promise((resolve) => finish.set(task.taskId, resolve));
  });
  const render = { taskId: "render-1", taskType: "render_sequence" };
  const second = { taskId: "render-2", taskType: "reframe_video" };
  const frame = { taskId: "frame-1", taskType: "extract_frames" };
  lanes.add(render);
  lanes.add(second);
  lanes.add(frame);
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (started.join() !== "render-1,frame-1") throw new Error(`started ${started.join()}`);
  if (lanes.position(second) !== 0 || lanes.busy !== 2 || lanes.queued !== 1) throw new Error("the second render should wait first in its lane");
  finish.get("render-1")();
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (started.at(-1) !== "render-2") throw new Error("the waiting render didn't start when the first finished");
  if (laneOf("probe") !== "quick" || laneOf("render_sequence") !== "heavy" || laneOf("add_audio") !== "heavy") throw new Error("lanes misassigned");
});

await check("the worker stops only when nothing runs, waits or is being reported", async () => {
  const base = { busy: 0, queued: 0, reporting: 0, idleSince: 0, now: 600_000, stopAfterMs: 600_000 };
  if (!idleLongEnough(base)) throw new Error("ten idle minutes should stop it");
  for (const [key, value] of [["busy", 1], ["queued", 1], ["reporting", 1], ["now", 599_999], ["stopAfterMs", 0]]) {
    if (idleLongEnough({ ...base, [key]: value })) throw new Error(`it stopped with ${key} = ${value}`);
  }
});

await check("clips joined to the one before are made in order, other runs side by side", async () => {
  const clips = [
    { kind: "video" },
    { kind: "video", matchPrevious: true },
    { kind: "image" },
    { kind: "video", matchPrevious: true },
    { kind: "video" },
    { kind: "video", matchPrevious: true },
  ];
  // An image before a clip breaks the join: it has no picture to match.
  const runs = JSON.stringify(clipRuns(clips));
  if (runs !== "[[0,1],[2],[3],[4,5]]") throw new Error(`runs ${runs}`);
  let running = 0;
  let most = 0;
  const done = [];
  await inParallel([1, 2, 3, 4, 5], 2, async (item) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    done.push(item);
  });
  if (most !== 2 || done.length !== 5) throw new Error(`at most ${most} at a time, ${done.length} done`);
  const after = [];
  const failed = await inParallel([1, 2, 3, 4], 1, async (item) => {
    after.push(item);
    if (item === 2) throw new Error("boom");
  }).then(() => null, (error) => error);
  if (failed?.message !== "boom" || after.join() !== "1,2") throw new Error("nothing more should start after a failure");
});

await check("a render made with clips side by side matches one made in order", async () => {
  // Moving pictures with sound, so a clip in the wrong place would show.
  const moving = join(dir, "moving.mp4");
  const pattern = join(dir, "pattern.mp4");
  for (const [path, source] of [[moving, "testsrc2=s=320x180:r=25:d=3"], [pattern, "smptebars=s=320x180:r=25:d=3"]]) {
    await ffmpeg([
      "-f", "lavfi", "-i", source,
      "-f", "lavfi", "-i", "sine=frequency=330:duration=3",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path,
    ]);
  }
  const outputs = [];
  for (const parallelism of [1, 2]) {
    const runDir = await mkdtemp(join(dir, `clips-${parallelism}-`));
    // A render deletes its pictures' sources once it has made its clips.
    const red = join(runDir, "moving.mp4");
    const blue = join(runDir, "pattern.mp4");
    await copyFile(moving, red);
    await copyFile(pattern, blue);
    const before = config.clipParallelism;
    config.clipParallelism = parallelism;
    try {
      const result = await TASKS.render_sequence.run({
        sources: [{ path: red, role: "video" }, { path: blue, role: "video" }],
        params: {
          width: 320,
          height: 180,
          fps: 25,
          normalize_loudness: false,
          clips: [
            { source_index: 0, duration: 1 },
            { source_index: 1, duration: 1, transition: { type: "fade", duration: 0.2 } },
            { source_index: 0, duration: 1 },
          ],
        },
        dir: runDir,
      });
      outputs.push(execFileSync("ffmpeg", ["-v", "error", "-i", result.outputs[0].path, "-map", "0:v", "-f", "framemd5", "-"]).toString());
    } finally {
      config.clipParallelism = before;
    }
  }
  if (outputs[0] !== outputs[1]) throw new Error("the picture differs when clips are made side by side");
});

await check("an idle worker stops cleanly, and turns away a task read as it decides to", async () => {
  const secret = "0123456789abcdef";
  // The source is an address, so validating the task needs no DNS; the task is never run.
  const worker = spawn(process.execPath, [new URL("./server.js", import.meta.url).pathname], {
    env: { ...process.env, PORT: "0", IDLE_STOP_SECONDS: "1", MEDIA_WORKER_SHARED_SECRET: secret, ALLOWED_HOST_SUFFIXES: "1.1.1.1", WORK_DIR: join(dir, "idle-work") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  worker.stdout.on("data", (chunk) => (log += chunk));
  worker.stderr.on("data", (chunk) => (log += chunk));
  const exited = new Promise((resolve) => worker.on("exit", (code) => resolve(code)));
  const until = async (what, test) => {
    const deadline = Date.now() + 20_000;
    while (!test()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${log.trim()}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  try {
    await until("it to listen", () => /listening on :\d+/.test(log));
    const port = Number(log.match(/listening on :(\d+)/)[1]);
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    if (health.idle_stop_seconds !== 1 || !health.lanes?.heavy || !health.lanes?.quick) throw new Error(`health ${JSON.stringify(health)}`);

    const body = JSON.stringify({ task_id: "selftest-idle-0001", task_type: "probe", sources: [{ url: "https://1.1.1.1/clip.mp4", role: "video" }], uploads: [], params: {} });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    const sending = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/tasks", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), "x-xeno-timestamp": timestamp, "x-xeno-signature": signature } });
    const answered = new Promise((resolve, reject) => {
      sending.on("response", (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => resolve({ status: response.statusCode, text }));
      });
      sending.on("error", reject);
    });
    // Half the task now, the rest once the worker has decided to stop.
    sending.write(body.slice(0, 40));
    await until("it to stop", () => log.includes("stopping until the next task"));
    sending.end(body.slice(40));
    const answer = await answered;
    if (answer.status !== 503 || !answer.text.includes("WORKER_STOPPING")) throw new Error(`a task read while stopping got ${answer.status} ${answer.text}`);
    const code = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve("still running"), 10_000))]);
    if (code !== 0) throw new Error(`it exited with ${code}`);
  } finally {
    worker.kill();
  }
});

await rm(dir, { recursive: true, force: true });
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
