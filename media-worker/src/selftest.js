/**
 * Offline self-test: renders synthetic media with the real task handlers, with
 * no network and no app involvement. Run inside the image after building:
 *   docker run --rm -e MEDIA_WORKER_SHARED_SECRET=0123456789abcdef xeno-media-worker npm run selftest
 */
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ffmpeg, probe } from "./ffmpeg.js";
import { TASKS } from "./tasks.js";
import { fitAudioToSources } from "./sequence.js";

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

await rm(dir, { recursive: true, force: true });
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
