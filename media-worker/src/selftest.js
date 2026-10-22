/**
 * Offline self-test: renders synthetic media with the real task handlers, with
 * no network and no app involvement. Run inside the image after building:
 *   docker run --rm -e MEDIA_WORKER_SHARED_SECRET=0123456789abcdef xeno-media-worker npm run selftest
 */
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ffmpeg, probe } from "./ffmpeg.js";
import { FEATURES, TASKS } from "./tasks.js";
import { lipCheckAvailable, lipCheckDir, lipCheckPython } from "./lipcheck.js";
import { clipRuns, fitAudioToSources, inParallel } from "./sequence.js";
import { mixArgs, planSequence } from "./sequence.js";
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

await check("render_sequence (transitions, still, voice, ducked music, captions, titles)", async () => {
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
      // A title at a height of its own on a halo, and a subtitle on a box.
      overlays: [
        { start: 0.2, end: 1.8, text: "SELF-TEST TITLE", style: "title", y: 0.4, backing: "halo" },
        { start: 2, end: 3.5, text: "On a box", style: "subtitle", position: "bottom", backing: "box" },
      ],
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

/** The mean level of a stretch of a file's sound, in dB. */
async function meanLevel(path, from, length) {
  const { stderr } = await ffmpeg(["-ss", String(from), "-t", String(length), "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
  return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? Number.NaN);
}

// Music in pieces: a six-second track whose first three seconds are a tone and the rest silence,
// played as silence, tone, silence, tone (two seconds, two, one, one), so every join is audible.
const piecesTrack = join(dir, "pieces-track.wav");
await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-af", "apad=whole_dur=6", "-ac", "2", "-c:a", "pcm_f32le", piecesTrack]);
const TRACK_PIECES = [{ from: 3.5, to: 5.5 }, { from: 0.5, to: 2.5 }, { from: 4, to: 5 }, { from: 1, to: 2 }];

await check("render_sequence plays music in pieces, each join where it was planned", async () => {
  const still = join(dir, "pieces-still.jpg");
  const music = join(dir, "pieces-music.wav");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=320x240:d=1", "-frames:v", "1", still]);
  await copyFile(piecesTrack, music);
  const result = await TASKS.render_sequence.run({
    sources: [{ path: still, role: "image" }, { path: music, role: "audio" }],
    params: {
      width: 320, height: 240, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, kind: "image", duration: 7 }],
      audio: [{ source_index: 1, role: "music", start: 0, duck: false, trim_start: 2, loop: true, pieces: TRACK_PIECES }],
    },
    dir,
  });
  const out = result.outputs[0].path;
  // Either side of each join (2, 4 and 5 s) and of the music's end (6 s): silent, then the tone, and so on.
  const expected = [[1.85, "quiet"], [2.05, "tone"], [3.85, "tone"], [4.05, "quiet"], [4.85, "quiet"], [5.05, "tone"], [5.85, "tone"], [6.1, "quiet"]];
  for (const [from, kind] of expected) {
    const level = await meanLevel(out, from, 0.1);
    if (kind === "tone" ? !(level > -30) : !(level < -50)) throw new Error(`at ${from} s expected ${kind}, measured ${level} dB`);
  }
});

await check("music in pieces crossfades each join over 30 ms, centred on it, and runs exactly their length", async () => {
  const silent = join(dir, "pieces-picture.wav");
  await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "7", "-c:a", "pcm_f32le", silent]);
  const plan = planSequence(
    { width: 320, height: 240, fps: 25, clips: [{ source_index: 0, kind: "image", duration: 7 }], audio: [{ source_index: 1, role: "music", duck: false, pieces: TRACK_PIECES }] },
    [{ role: "image", path: silent }, { role: "audio", path: piecesTrack }],
  );
  // The music alone, without the picture's (silent) bus or a fade, sample for sample.
  const mix = join(dir, "pieces-mix.wav");
  await ffmpeg(mixArgs(plan, [silent], [piecesTrack], mix));
  const full = await meanLevel(mix, 2.1, 0.5);
  // The join into the tone at 2 s: silent until its crossfade starts at 1.985 s, full from 2.015 s,
  // and on a quarter sine between: about 9 dB down a quarter of the way in (where a hard cut at 2 s
  // would still be silent), half power at 2 s.
  const before = await meanLevel(mix, 1.975, 0.008);
  const rising = await meanLevel(mix, 1.99, 0.004);
  const middle = await meanLevel(mix, 1.998, 0.004);
  const after = await meanLevel(mix, 2.017, 0.008);
  if (!(before < -60)) throw new Error(`the tone came in before its crossfade (${before} dB)`);
  if (!(rising > full - 14 && rising < full - 5)) throw new Error(`a quarter of the way into the crossfade the tone should be about 9 dB down (${rising} dB, against ${full} dB)`);
  if (!(Math.abs(middle - (full - 3)) < 1)) throw new Error(`half way through the crossfade the tone should be 3 dB down (${middle} dB, against ${full} dB)`);
  if (!(Math.abs(after - full) < 0.5)) throw new Error(`the tone wasn't fully in after its crossfade (${after} dB, against ${full} dB)`);
  // The music stops where its pieces end: six seconds in.
  const tail = await meanLevel(mix, 6.001, 0.5);
  const last = await meanLevel(mix, 5.9, 0.09);
  if (!(tail < -60) || !(last > full - 1)) throw new Error(`the last piece should end at 6 s (${last} dB before, ${tail} dB after)`);
});

/** A float WAV's left channel, sample by sample (the mix pass writes 32-bit float stereo). */
async function leftChannel(path) {
  const bytes = await readFile(path);
  const data = bytes.indexOf("data", 12);
  const body = bytes.subarray(data + 8, data + 8 + bytes.readUInt32LE(data + 4));
  const left = new Float32Array(body.length / 8);
  for (let index = 0; index < left.length; index += 1) left[index] = body.readFloatLE(index * 8);
  return left;
}

/** The runs of exact digital silence in a signal, as [first sample, sample after the last]. */
function silentRuns(samples) {
  const runs = [];
  let from = null;
  for (let index = 0; index <= samples.length; index += 1) {
    const silent = index < samples.length && samples[index] === 0;
    if (silent && from === null) from = index;
    if (!silent && from !== null) {
      runs.push([from, index]);
      from = null;
    }
  }
  return runs;
}

await check("a voiceover held open at its pauses has exact silence at each, to the sample", async () => {
  // A voice that never touches zero, so the only silence in the mix is what the pauses put in.
  const voice = join(dir, "held-voice.wav");
  const picture = join(dir, "held-picture.wav");
  await ffmpeg(["-f", "lavfi", "-i", "aevalsrc=0.5+0.1*sin(2*PI*440*t):s=48000:c=stereo:d=2", "-c:a", "pcm_f32le", voice]);
  await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "4", "-c:a", "pcm_f32le", picture]);
  const plan = planSequence(
    {
      width: 360, height: 640, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, kind: "image", duration: 4 }],
      // From 0.25 s into the recording, half a second into the edit; 10 frames at 0.75 s, 5 at 1.5 s.
      audio: [{ source_index: 1, role: "voiceover", start: 0.5, trim_start: 0.25, pauses: [{ at: 0.75, frames: 10 }, { at: 1.5, frames: 5 }] }],
    },
    [{ path: "still.png", role: "image" }, { path: voice, role: "audio" }],
  );
  const out = join(dir, "held-mix.wav");
  await ffmpeg(mixArgs(plan, [picture], [voice], out, []));
  const left = await leftChannel(out);
  // At 25 fps a frame is 1920 samples: 10 frames 19200, 5 frames 9600.
  const want = [[0, 24000], [48000, 67200], [103200, 112800], [136800, 192000]];
  if (JSON.stringify(silentRuns(left)) !== JSON.stringify(want)) throw new Error(`silences at ${JSON.stringify(silentRuns(left))}`);
  // Either side of each pause the recording runs on unbroken: the sample after it is the one it stopped at.
  const recorded = (sample) => Math.fround(0.5 + 0.1 * Math.sin((2 * Math.PI * 440 * sample) / 48000));
  for (const [edit, source] of [[47999, 35999], [67200, 36000], [103199, 71999], [112800, 72000]]) {
    if (Math.abs(left[edit] - recorded(source)) > 1e-6) throw new Error(`sample ${edit} is ${left[edit]}, not the recording's ${recorded(source)}`);
  }
});

await check("render_sequence plays a held voiceover under music, silent in its pauses", async () => {
  const still = join(dir, "held-still.jpg");
  const voice = join(dir, "held-tone.wav");
  const music = join(dir, "held-bed.wav");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:d=1", "-frames:v", "1", still]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=1000:duration=3", voice]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=200:duration=5", music]);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: still, role: "image" },
      { path: voice, role: "audio" },
      { path: music, role: "audio" },
    ],
    params: {
      width: 360, height: 640, fps: 30, normalize_loudness: false,
      clips: [{ source_index: 0, kind: "image", duration: 5 }],
      // A second of silence after the first second of the voice: it now ends at 4 s, not 3.
      audio: [
        { source_index: 1, role: "voiceover", start: 0, pauses: [{ at: 1, frames: 30 }] },
        { source_index: 2, role: "music", start: 0, volume: 0.3, duck: false },
      ],
    },
    dir,
  });
  const info = await probe(result.outputs[0].path);
  if (Math.abs(info.duration_seconds - 5) > 0.1) throw new Error(`unexpected duration ${info.duration_seconds}`);
  // The voice's 1 kHz tone, heard apart from the music's 200 Hz.
  const voiceLevel = async (from) => {
    const { stderr } = await ffmpeg(["-ss", String(from), "-t", "0.4", "-i", result.outputs[0].path, "-vn", "-af", "highpass=f=700,highpass=f=700,volumedetect", "-f", "null", "-"]);
    return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? Number.NaN);
  };
  const speaking = await voiceLevel(0.3);
  const held = await voiceLevel(1.3);
  const after = await voiceLevel(3.4);
  const done = await voiceLevel(4.4);
  if (!(speaking - held > 30)) throw new Error(`the voice isn't silent in its pause (${speaking} dB speaking, ${held} dB held)`);
  if (!(Math.abs(after - speaking) < 3)) throw new Error(`the voice doesn't go on after its pause (${after} dB at 3.4 s)`);
  if (!(speaking - done > 30)) throw new Error(`the voice runs past where its pause puts its end (${done} dB at 4.4 s)`);
});

await check("render_sequence reports the voice's margin over the music by section, the loudness, and its stems", async () => {
  const still = join(dir, "report-still.jpg");
  const voice = join(dir, "report-voice.wav");
  const music = join(dir, "report-music.wav");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=640x360:d=1", "-frames:v", "1", still]);
  // A voice that speaks for 1.5 s, stops for 1 s, then speaks for 1.5 s; a bed in the same band.
  await ffmpeg([
    "-f", "lavfi", "-i", "sine=frequency=1000:duration=1.5", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
    "-f", "lavfi", "-i", "sine=frequency=1000:duration=1.5",
    "-filter_complex", "[1:a]atrim=end=1[gap];[0:a][gap][2:a]concat=n=3:v=0:a=1", voice,
  ]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=1500:duration=6", music]);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: still, role: "image" },
      { path: voice, role: "audio" },
      { path: music, role: "audio" },
    ],
    params: {
      width: 360, height: 640, fps: 30,
      clips: [{ source_index: 0, kind: "image", duration: 5 }],
      // The bed at a quarter of the voice's level (12.04 dB under it), then an eighth (18.06 dB).
      audio: [
        { source_index: 1, role: "voiceover", start: 0.5 },
        { source_index: 2, role: "music", start: 0, duration: 2.5, volume: 0.25, duck: false },
        { source_index: 2, role: "music", start: 2.5, volume: 0.125, duck: false },
      ],
      stems: ["voiceover", "music", "sfx"],
    },
    dir,
  });
  const report = result.metadata.mix_report;
  const [first, second] = report?.sections ?? [];
  if (!first || !second || report.sections.length !== 2) throw new Error(`sections ${JSON.stringify(report?.sections)}`);
  if (Math.abs(first.margin_db - 12.04) > 0.5 || Math.abs(second.margin_db - 18.06) > 0.5) throw new Error(`margins ${first.margin_db} and ${second.margin_db} dB, not 12 and 18`);
  if (first.speech_seconds !== 1.5 || second.speech_seconds !== 1.5 || first.index !== 1 || second.index !== 2) throw new Error(`sections ${JSON.stringify(report.sections)}`);
  if (Math.abs(report.loudness?.integrated_lufs + 14) > 0.6) throw new Error(`loudness ${JSON.stringify(report.loudness)}`);
  if (report.loudness.true_peak_dbtp > -1) throw new Error(`true peak ${report.loudness.true_peak_dbtp} dBTP`);
  // The video, its poster, then the three stems asked for: each as long as the edit, the effects' silent.
  if (result.outputs.length !== 5 || TASKS.render_sequence.outputs({ stems: ["voiceover", "music", "sfx"] }) !== 5) throw new Error(`${result.outputs.length} outputs`);
  const level = async (path) => {
    const { stderr } = await ffmpeg(["-i", path, "-af", "volumedetect", "-f", "null", "-"]);
    return Number(/max_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr)?.[1] ?? Number.NaN);
  };
  for (const [index, stem] of result.outputs.slice(2).entries()) {
    const info = await probe(stem.path);
    if (stem.kind !== "audio" || Math.abs(info.duration_seconds - 5) > 0.01) throw new Error(`stem ${index + 1}: ${stem.kind}, ${info.duration_seconds} s`);
  }
  const [voiced, bed, effects] = await Promise.all(result.outputs.slice(2).map((stem) => level(stem.path)));
  if (!(voiced > -25 && bed > -40 && !(effects > -90))) throw new Error(`stem levels ${voiced}, ${bed}, ${effects} dB`);
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

/** The average colour of a region of a file's picture at a time, as [r, g, b]. */
async function colourAtTime(path, time, crop) {
  const out = join(dir, `pixel-${Math.random().toString(36).slice(2)}.ppm`);
  await ffmpeg(["-ss", String(time), "-i", path, "-frames:v", "1", "-vf", `crop=${crop},scale=1:1`, "-c:v", "ppm", out]);
  const bytes = await readFile(out);
  return [...bytes.subarray(bytes.length - 3)];
}

await check("render_sequence lays a logo over the picture between its times, and sets titles in a brand's font and colours", async () => {
  const blue = join(dir, "blue.mp4");
  const logo = join(dir, "logo.png");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2:r=25", "-pix_fmt", "yuv420p", blue]);
  await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=100x100,format=rgba", "-frames:v", "1", logo]);
  const fontFile = execFileSync("sh", ["-c", "find /usr/share/fonts -type f \\( -name '*.ttf' -o -name '*.otf' \\) | sort | head -1"]).toString().trim();
  if (!fontFile) throw new Error("no font installed to test with");
  const brandFont = join(dir, "brand-font");
  await copyFile(fontFile, brandFont);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: blue, role: "video" },
      { path: logo, role: "image" },
      { path: brandFont, role: "font" },
    ],
    params: {
      width: 320, height: 180, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, duration: 2, volume: 0 }],
      images: [{ source_index: 1, start: 0.6, end: 1.4, x: 0.25, y: 0.5, width: 0.2, fade: 0 }],
      fonts: [{ source_index: 2, family: "Declared Brand" }],
      captions: { font: "Declared Brand", color: "#ffcc00", segments: [{ start: 0, end: 2, text: "Brand caption" }] },
      overlays: [{ start: 0, end: 2, text: "BRAND", style: "subtitle", y: 0.15, font: "Declared Brand", color: "#00ff00", accent: "#112233", backing: "box" }],
    },
    dir,
  });
  const out = result.outputs[0].path;
  // The logo's centre, a quarter across: red while it shows, blue before and after.
  if (!near(await colourAtTime(out, 1.0, "10:10:75:85"), [255, 0, 0])) throw new Error("the logo isn't there while it shows");
  if (!near(await colourAtTime(out, 0.3, "10:10:75:85"), [0, 0, 255])) throw new Error("the logo shows before its time");
  if (!near(await colourAtTime(out, 1.8, "10:10:75:85"), [0, 0, 255])) throw new Error("the logo shows after its time");
  // The text is set in the family the font file names itself by, in the brand's colours.
  const script = await readFile(join(dir, "text.ass"), "utf8");
  const named = (await import("./fonts.js")).fontFamily(await readFile(fontFile));
  if (!named || !script.includes(`\\fn${named}\\b0`)) throw new Error(`the title isn't set in ${named}`);
  if (!script.includes(`Style: Caption,${named},`)) throw new Error("the captions aren't set in the brand font");
  if (!script.includes("\\1c&H00FF00&") || !script.includes("\\3c&H332211&")) throw new Error("the title isn't in the brand's colours");
});

await check("render_sequence moves a title in a brand's motion: in on its curve, holding, lifting away (overlay_motion)", async () => {
  if (!FEATURES.includes("overlay_motion")) throw new Error("overlay_motion isn't advertised");
  const navy = join(dir, "navy.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=0x040b16:s=320x180:d=2:r=25", "-pix_fmt", "yuv420p", navy]);
  // A white title on a white box, so how much of it shows is how bright its middle is. Linear
  // curves, so each frame's opacity is plain to work out: in from 0.4 s to 0.8 s, out from 1.2 s.
  const motion = { enter: 0.4, exit: 0.4, enter_ease: [0, 0, 1, 1], exit_ease: [0, 0, 1, 1], rise: 0.25 };
  const result = await TASKS.render_sequence.run({
    sources: [{ path: navy, role: "video" }],
    params: {
      width: 320, height: 180, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, duration: 2, volume: 0 }],
      overlays: [{ start: 0.4, end: 1.6, text: "MOTION", style: "title", y: 0.5, backing: "box", color: "#ffffff", accent: "#ffffff", motion }],
    },
    dir,
  });
  const out = result.outputs[0].path;
  const light = async (time) => {
    const [r, g, b] = await colourAtTime(out, time, "40:10:140:85");
    return (r + g + b) / 3;
  };
  const before = await light(0.4);
  const half = await light(0.6);
  const held = await light(1.0);
  const going = await light(1.4);
  const after = await light(1.8);
  if (before > 40) throw new Error(`the title shows on its first frame (${before.toFixed(0)})`);
  if (held < 130) throw new Error(`the title isn't fully in while it holds (${held.toFixed(0)})`);
  // Half way in and half way out, about half as bright as held over the navy.
  for (const [what, level] of [["coming in", half], ["going", going]])
    if (level < 0.3 * held || level > 0.75 * held) throw new Error(`${what}, it shows ${level.toFixed(0)} against ${held.toFixed(0)} held`);
  if (after > 40) throw new Error(`the title is still there after its end (${after.toFixed(0)})`);
  // One event a frame coming in (10 at 25 fps) and going (10), and one holding still.
  const script = await readFile(join(dir, "text.ass"), "utf8");
  const steps = script.split("\n").filter((line) => line.startsWith("Dialogue: 1,") && line.endsWith("}MOTION"));
  if (steps.length !== 21) throw new Error(`${steps.length} events for the title, not 21`);
  if (!steps[0].includes("\\fade(255,255,255,0,0,0,0)")) throw new Error("its first frame isn't unseen");
  if (!steps[10].includes("{\\an5\\pos(160,90)\\")) throw new Error("it doesn't hold where a still title sits");
});

await check("render_sequence lays a GIF logo from the edit's first frame, decoded once", async () => {
  const blue = join(dir, "blue-gif.mp4");
  const logo = join(dir, "logo.gif");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1:r=25", "-pix_fmt", "yuv420p", blue]);
  await ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=100x100:d=0.2:r=10", logo]);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: blue, role: "video" },
      { path: logo, role: "image" },
    ],
    params: {
      width: 320, height: 180, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, duration: 1, volume: 0 }],
      images: [{ source_index: 1, start: 0, end: 1, x: 0.25, y: 0.5, width: 0.2, fade: 0 }],
    },
    dir,
  });
  const out = result.outputs[0].path;
  if (!near(await colourAtTime(out, 0, "10:10:75:85"), [255, 0, 0])) throw new Error("the logo isn't on the first frame");
  if (!near(await colourAtTime(out, 0.96, "10:10:75:85"), [255, 0, 0])) throw new Error("the logo isn't on the last frame");
  const info = await probe(out);
  if (Math.abs(info.duration_seconds - 1) > 0.06) throw new Error(`rendered ${info.duration_seconds}s`);
});

/**
 * A family installed here with a regular and an italic file of its own
 * (Inter, in the worker's image): never downloaded, only found.
 */
async function italicPair() {
  const { fontFamily: familyOf, fontStyle: styleOf } = await import("./fonts.js");
  const files = execFileSync("sh", ["-c", "find /usr/share/fonts -type f \\( -name '*.ttf' -o -name '*.otf' \\) | sort"]).toString().trim().split("\n").filter(Boolean);
  const families = new Map();
  for (const path of files) {
    const bytes = await readFile(path);
    const family = familyOf(bytes);
    const style = styleOf(bytes);
    if (!family || !/^[A-Za-z][A-Za-z ]{2,40}$/.test(family) || !style || style.weight !== 400) continue;
    const entry = families.get(family) ?? {};
    entry[style.italic ? "italic" : "regular"] ??= path;
    families.set(family, entry);
    if (entry.regular && entry.italic) return { family, ...entry };
  }
  return null;
}

/**
 * A font file's family renamed (every name record holding it, to a name as
 * long), so the copy is a typeface no fontconfig on the machine knows: what
 * the render sets in it can only come from the file it was given.
 */
function renamedFont(bytes, from, to) {
  const out = Buffer.from(bytes);
  const tables = out.readUInt16BE(4);
  for (let index = 0; index < tables; index += 1) {
    const record = 12 + index * 16;
    if (out.toString("latin1", record, record + 4) !== "name") continue;
    const name = out.readUInt32BE(record + 8);
    const count = out.readUInt16BE(name + 2);
    const strings = name + out.readUInt16BE(name + 4);
    for (let entry = 0; entry < count; entry += 1) {
      const at = name + 6 + entry * 12;
      const platform = out.readUInt16BE(at);
      const start = strings + out.readUInt16BE(at + 10);
      const length = out.readUInt16BE(at + 8);
      const wide = platform === 3 || platform === 0;
      const raw = out.subarray(start, start + length);
      const text = wide ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
      if (!text.includes(from)) continue;
      const renamed = Buffer.from(text.split(from).join(to), wide ? "utf16le" : "latin1");
      (wide ? renamed.swap16() : renamed).copy(out, start);
    }
  }
  return out;
}

/** The share of a frame's region (at a time) brighter than mid grey. */
async function brightShare(path, time, crop) {
  const out = join(dir, `bright-${Math.random().toString(36).slice(2)}.gray`);
  await ffmpeg(["-ss", String(time), "-i", path, "-frames:v", "1", "-vf", `crop=${crop},format=gray`, "-f", "rawvideo", out]);
  const plane = await readFile(out);
  return plane.filter((value) => value > 150).length / plane.length;
}

await check("render_sequence sets brand captions word by word, in a brand font and its own italic", async () => {
  const pair = await italicPair();
  if (!pair) throw new Error("no font family with an italic is installed to test with");
  const family = `Selftest${"x".repeat(pair.family.length)}`.slice(0, pair.family.length);
  const work = await mkdtemp(join(dir, "brand-captions-"));
  const regular = join(work, "regular-font");
  const italic = join(work, "italic-font");
  await writeFile(regular, renamedFont(await readFile(pair.regular), pair.family, family));
  await writeFile(italic, renamedFont(await readFile(pair.italic), pair.family, family));
  const dark = join(work, "dark.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=0x101828:s=360x640:d=4:r=25", "-pix_fmt", "yuv420p", dark]);
  const result = await TASKS.render_sequence.run({
    sources: [
      { path: dark, role: "video" },
      { path: regular, role: "font" },
      { path: italic, role: "font" },
    ],
    params: {
      width: 360, height: 640, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, duration: 4, volume: 0 }],
      fonts: [{ source_index: 1, family }, { source_index: 2, family }],
      captions: {
        style: "brand", font: family, color: "#ffffff", accent: "#d7b35f",
        segments: [{
          start: 0.4, end: 3.6, text: "Somewhere in Australia,",
          words: [{ text: "Somewhere", start: 0, end: 0.4 }, { text: "in", start: 0.4, end: 0.78 }, { text: "Australia,", start: 1.6, end: 2 }],
          emphasis: [2, 3],
        }],
      },
    },
    dir: work,
  });
  const out = result.outputs[0].path;
  // Set in the family, the emphasis in its italic.
  const script = await readFile(join(work, "text.ass"), "utf8");
  if (!script.includes(`\\fn${family}`)) throw new Error("the words aren't set in the brand's family");
  if (!/\\i1[^}]*}Australia,/.test(script)) throw new Error("the emphasis isn't set in the italic");
  // libass takes both faces from the brand's own files (a file it was given is named without a path).
  const { stderr } = await ffmpeg(["-v", "info", "-f", "lavfi", "-i", "color=c=black:s=360x640:r=25:d=4", "-vf", `ass=filename=${join(work, "text.ass")}:fontsdir=${join(work, "fonts")}`, "-f", "null", "-"]);
  for (const slant of [0, 100]) {
    const chosen = stderr.split("\n").find((line) => line.includes(`fontselect: (${family}, 400, ${slant})`));
    if (!chosen) throw new Error(`libass wasn't asked for the ${slant ? "italic" : "regular"}`);
    if (/->\s*\//.test(chosen)) throw new Error(`the ${slant ? "italic" : "regular"} came from the system: ${chosen.trim()}`);
  }
  // Word by word: nothing before the line, its first words before its last, all of it once spoken.
  const band = "320:120:20:420";
  const before = await brightShare(out, 0.1, band);
  const early = await brightShare(out, 1.1, band);
  const spoken = await brightShare(out, 3, band);
  if (before > 0.001) throw new Error(`text shows before the line (${before})`);
  if (!(early > 0.005 && spoken > early * 1.3)) throw new Error(`the words don't come in one by one (${early} then ${spoken})`);
});

/**
 * Renders a line of captions over a clip of one colour, and gives back the
 * panel the script holds longest (its fill, opacity and place) and the
 * render's colour inside it, beside the words.
 */
async function captionsOver(name, colour, captions) {
  const work = await mkdtemp(join(dir, `panel-${name}-`));
  const clip = join(work, "clip.mp4");
  await ffmpeg(["-f", "lavfi", "-i", `color=c=${colour}:s=360x640:d=3:r=25`, "-pix_fmt", "yuv420p", clip]);
  const result = await TASKS.render_sequence.run({
    sources: [{ path: clip, role: "video" }],
    params: {
      width: 360, height: 640, fps: 25, normalize_loudness: false,
      clips: [{ source_index: 0, duration: 3, volume: 0 }],
      captions: { ...captions, segments: [{ start: 0.3, end: 2.8, text: "Over the page" }] },
    },
    dir: work,
  });
  const script = await readFile(join(work, "text.ass"), "utf8");
  const seconds = (text) => text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const panel = script
    .split("\n")
    .map((line) => /^Dialogue: 0,([^,]+),([^,]+),Brand,,0,0,0,,\{\\pos\(([\d.]+),([\d.]+)\)\\p1\\bord0\\shad0\\1c&H([0-9A-F]{6})&\\alpha&H([0-9A-F]{2})&\}m 0 0 l ([\d.]+) 0 [\d.]+ ([\d.]+) 0 [\d.]+\{\\p0\}$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ length: seconds(match[2]) - seconds(match[1]), x: Number(match[3]), y: Number(match[4]), fill: match[5], alpha: match[6], width: Number(match[7]), height: Number(match[8]) }))
    .sort((a, b) => b.length - a.length)[0];
  const inside = panel ? await colourAtTime(result.outputs[0].path, 2, `4:4:${Math.round(panel.x + 3)}:${Math.round(panel.y + panel.height / 2 - 2)}`) : null;
  return { script, panel, inside };
}

await check("render_sequence measures the picture behind captions: the glass nearer opaque over a white page than a dark shot", async () => {
  const white = await captionsOver("glass-white", "white", { style: "brand", panel: "dark" });
  const dark = await captionsOver("glass-dark", "0x101828", { style: "brand", panel: "dark" });
  if (!white.panel || !dark.panel) throw new Error("no panel behind the captions");
  // 93% over the white page, the site's 74% over the dark shot.
  if (white.panel.alpha !== "12" || dark.panel.alpha !== "42") throw new Error(`the glass is ${white.panel.alpha} over white and ${dark.panel.alpha} over dark`);
  // Over white it reads as the brand's navy at 93% (#0a172a over white), not the grey slab 74% made.
  const over = (opacity, ground) => [10, 23, 42].map((value, index) => value * opacity + ground[index] * (1 - opacity));
  const off = (colour, expected) => Math.max(...colour.map((value, index) => Math.abs(value - expected[index])));
  if (!(off(white.inside, over(0.93, [255, 255, 255])) <= 12)) throw new Error(`the glass over white came out ${white.inside}`);
  if (!(off(white.inside, over(0.74, [255, 255, 255])) >= 35)) throw new Error(`the glass over white reads as a grey slab: ${white.inside}`);
  if (!(off(dark.inside, over(0.74, [16, 24, 40])) <= 12)) throw new Error(`the glass over the dark shot came out ${dark.inside}`);
});

await check("render_sequence sets a panel that follows the picture as a light card over a white page", async () => {
  const white = await captionsOver("auto-white", "white", { style: "brand" });
  const dark = await captionsOver("auto-dark", "0x101828", { style: "brand" });
  if (white.panel?.fill !== "FFFFFF" || dark.panel?.fill !== "2A170A") throw new Error(`panels ${white.panel?.fill} over white, ${dark.panel?.fill} over dark`);
  if (white.panel.alpha === dark.panel.alpha) throw new Error("the two panels are as opaque as each other");
  // The words go dark on the light card.
  if (!white.script.includes("\\1c&H37291F&")) throw new Error("the words aren't in the card's ink");
  if (!(Math.min(...white.inside) > 200)) throw new Error(`the card came out ${white.inside}`);
});

await check("render_sequence boxes classic captions on the glass, nearer opaque over a white page", async () => {
  const white = await captionsOver("boxed-white", "white", { style: "boxed", panel: "dark" });
  if (!/Style: Caption,[^\n]*,3,\d+,0,2,/.test(white.script)) throw new Error("the captions aren't on a box");
  if (!white.script.includes("\\3c&H2A170A&\\3a&H12&")) throw new Error("the box isn't the near-opaque glass");
});

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

/** Each frame's average brightness (0-255), in order. */
async function lumaLevels(path) {
  const { stderr } = await ffmpeg(["-i", path, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
  return [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((match) => Number(match[1]));
}

for (const [retime, most] of [["duplicate", null], ["blend", 1], ["motion", 1]]) {
  await check(`render_sequence brings a 24 fps clip to 30 fps (${retime})`, async () => {
    // Brightness climbs 4 levels a source frame, so a repeated frame shows as a step of nothing.
    const clip = await numberedClip(`retime-${retime}.mp4`, "N*4");
    const result = await TASKS.render_sequence.run({
      sources: [{ path: clip, role: "video" }],
      params: { width: 256, height: 144, fps: 30, normalize_loudness: false, frame_rate_conversion: retime, clips: [{ source_index: 0, duration: 1.5, volume: 0 }] },
      dir,
    });
    const levels = await lumaLevels(result.outputs[0].path);
    if (levels.length !== 45) throw new Error(`expected 45 frames, got ${levels.length}`);
    const repeats = levels.slice(1).filter((level, index) => Math.abs(level - levels[index]) < 1).length;
    if (most === null ? repeats < 6 : repeats > most) throw new Error(`${repeats} repeated frames`);
  });
}

await check("render_sequence scales sharply when asked", async () => {
  const clip = await numberedClip("sharp.mp4", "N*4");
  const result = await TASKS.render_sequence.run({
    sources: [{ path: clip, role: "video" }],
    params: { width: 360, height: 640, fps: 25, normalize_loudness: false, upscale: "sharp", clips: [{ source_index: 0, duration: 0.4 }] },
    dir,
  });
  const info = await probe(result.outputs[0].path);
  if (info.width !== 360 || info.height !== 640) throw new Error(`rendered ${info.width}x${info.height}`);
});

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

/**
 * A composition bundle as the app compiles one (see src/lib/compositions in the
 * app), written by hand: a gold box crossing a navy ground at `speed` pixels a
 * second until `until` seconds, then still. Each drawing sets the box only when
 * it moved, as the app's track does.
 */
function boxBundle({ frames, settings, fps = 24, width = 160, height = 96, speed = 240, until = 0.25 }) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0a192f;overflow:hidden}#box{position:absolute;left:0;top:28px;width:40px;height:40px;background:#c89b3c}</style></head><body><div id="box"></div></body></html>';
  const drawings = [];
  let last = null;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let j = 0; j < settings.drawings; j += 1) {
      const time = Math.max(0, (frame + ((j + 0.5) / settings.drawings - 0.5) * (settings.shutter / 360)) / fps);
      const x = `translateX(${(Math.min(time, until) * speed).toFixed(3)}px)`;
      if (x === last && settings.reuse && drawings.length) drawings.push(0);
      else drawings.push([[0, -1, { transform: x }]]);
      last = x;
    }
  }
  return { format: "xeno-composition", version: 1, width, height, fps, frames, settings, html, images: [], fonts: [], webgl: false, selectors: ["#box"], drawings, beats: [] };
}

async function bundleFile(name, bundle) {
  const path = join(dir, `${name}.json`);
  await writeFile(path, JSON.stringify(bundle), "utf8");
  return { path, role: "data" };
}

/** One row of a frame of a video, as [r, g, b] a pixel. */
async function rowOf(path, frame, y, width) {
  const out = join(dir, `row-${Math.random().toString(36).slice(2)}.rgb`);
  await ffmpeg(["-i", path, "-vf", `select=eq(n\\,${frame}),crop=${width}:1:0:${y}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", out]);
  const bytes = await readFile(out);
  return Array.from({ length: width }, (_, x) => [bytes[x * 3], bytes[x * 3 + 1], bytes[x * 3 + 2]]);
}

/** Each frame's checksum, decoded: two files with the same list show the same pictures. */
async function frameSums(path) {
  const out = join(dir, `sums-${Math.random().toString(36).slice(2)}.txt`);
  await ffmpeg(["-i", path, "-f", "framemd5", out]);
  return (await readFile(out, "utf8")).split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(",").at(-1).trim());
}

const DRAFT = { scale: 1, drawings: 1, shutter: 180, reuse: true };
const FINAL = { scale: 2, drawings: 8, shutter: 180, reuse: true };
if (TASKS.render_composition) {
  let wholeMaster = null;
  await check("render_composition draws a draft, reusing each drawing that doesn't change", async () => {
    const source = await bundleFile("box-draft", boxBundle({ frames: 12, settings: DRAFT }));
    const work = await mkdtemp(join(dir, "comp-"));
    // One browser, so every frame follows the one before on the same page (with more, each
    // browser's first frame is drawn afresh). The stretches below are drawn with the default.
    const browsers = config.compositionBrowsers;
    config.compositionBrowsers = 1;
    const result = await TASKS.render_composition.run({ sources: [source], params: { output: "full", priority: "draft" }, dir: work }).finally(() => {
      config.compositionBrowsers = browsers;
    });
    const [proxy, master, poster] = result.outputs.map((output) => output.path);
    const counts = result.metadata.composition;
    // The box moves from frame 0 to 6 and holds: 7 drawn, 5 reused.
    if (counts.drawings_captured !== 7 || counts.drawings_reused !== 5) throw new Error(`drew ${counts.drawings_captured}, reused ${counts.drawings_reused}`);
    const info = await probe(proxy);
    if (info.width !== 160 || info.height !== 96) throw new Error(`playable copy is ${info.width}x${info.height}`);
    const sums = await frameSums(master);
    if (sums.length !== 12) throw new Error(`master has ${sums.length} frames`);
    if (new Set(sums.slice(6)).size !== 1) throw new Error("the held frames differ");
    // Frame 3: the box at 30 px, gold from 30 to 70 across.
    const row = await rowOf(master, 3, 48, 160);
    if (!near(row[50], [200, 155, 60]) || !near(row[10], [10, 25, 47]) || !near(row[90], [10, 25, 47])) throw new Error(`frame 3 reads ${JSON.stringify([row[10], row[50], row[90]])}`);
    if ((await stat(poster)).size < 300) throw new Error("no poster");
    wholeMaster = master;
  });

  await check("render_composition at final quality blurs a fast move as a camera would, and keeps a still frame sharp", async () => {
    const source = await bundleFile("box-final", boxBundle({ frames: 10, settings: FINAL, speed: 480, until: 0.2 }));
    const work = await mkdtemp(join(dir, "comp-"));
    const result = await TASKS.render_composition.run({ sources: [source], params: { output: "full", priority: "final" }, dir: work });
    const master = result.outputs[1].path;
    const between = (row) => row.filter(([r]) => r > 45 && r < 165).length;
    // Frame 2 moves 20 px a frame with the shutter half open: its edges smear over about 10 px.
    const moving = between(await rowOf(master, 2, 48, 160));
    // Frame 8 has been still for three frames: hard edges, at most a pixel's ringing.
    const still = between(await rowOf(master, 8, 48, 160));
    if (moving < 8) throw new Error(`a moving edge has only ${moving} pixels between its colours`);
    if (still > 2) throw new Error(`a still edge has ${still} pixels between its colours`);
    const counts = result.metadata.composition;
    if (counts.drawings_captured + counts.drawings_reused !== 80) throw new Error(`took ${counts.drawings_captured + counts.drawings_reused} drawings, not 80`);
    if (counts.drawings_reused < 20) throw new Error(`reused only ${counts.drawings_reused} of the still frames' drawings`);
  });

  await check("a composition's stretches, drawn apart and joined, match it drawn whole, frame for frame", async () => {
    if (!wholeMaster) throw new Error("the draft wasn't drawn");
    const bundle = await bundleFile("box-stretches", boxBundle({ frames: 12, settings: DRAFT }));
    const stretches = [];
    for (const [from, to] of [[0, 5], [5, 12]]) {
      const work = await mkdtemp(join(dir, "stretch-"));
      const result = await TASKS.render_composition.run({ sources: [bundle], params: { output: "stretch", from_frame: from, to_frame: to, priority: "final" }, dir: work });
      if (result.outputs.length !== 1) throw new Error("a stretch should make its master only");
      stretches.push({ path: result.outputs[0].path, role: "video" });
    }
    const work = await mkdtemp(join(dir, "join-"));
    const joined = await TASKS.join_stretches.run({ sources: stretches, params: { fps: 24, frames: 12 }, dir: work });
    const [whole, parts] = await Promise.all([frameSums(wholeMaster), frameSums(joined.outputs[1].path)]);
    if (whole.join() !== parts.join()) throw new Error("the joined stretches differ from the composition drawn whole");
    if ((await probe(joined.outputs[0].path)).width !== 160) throw new Error("no playable copy");
  });

  await check("render_composition refuses a bundle that isn't one", async () => {
    const path = join(dir, "not-a-bundle.json");
    await writeFile(path, JSON.stringify({ format: "something-else" }), "utf8");
    const refused = await TASKS.render_composition.run({ sources: [{ path, role: "data" }], params: {}, dir }).then(() => null, (error) => error);
    if (!refused || refused.code !== "INVALID_PARAMETERS") throw new Error(`expected INVALID_PARAMETERS, got ${refused?.code ?? "no error"}`);
  });
} else {
  await check("compositions aren't offered without a browser", async () => {
    if (FEATURES.includes("compositions")) throw new Error("compositions offered with no browser");
  });
}

await check("a final composition goes ahead of drafts waiting in the heavy lane, behind finals", async () => {
  const started = [];
  const finish = new Map();
  const lanes = new Lanes({ heavy: 1, quick: 1 }, (task) => {
    started.push(task.taskId);
    return new Promise((resolve) => finish.set(task.taskId, resolve));
  });
  const task = (taskId, priority) => ({ taskId, taskType: "render_composition", params: { priority } });
  lanes.add(task("first", "draft"));
  lanes.add(task("draft-1", "draft"));
  lanes.add(task("final-1", "final"));
  lanes.add(task("draft-2", "draft"));
  lanes.add(task("final-2", "final"));
  for (let n = 0; n < 5; n += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    finish.get(started.at(-1))?.();
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  if (started.join() !== "first,final-1,final-2,draft-1,draft-2") throw new Error(`ran ${started.join()}`);
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

// With its files (an image built with LIP_CHECK=1), SyncNet runs end to end: a
// test pattern has no face to score. Without them, it isn't offered at all.
await check(lipCheckAvailable ? "lip_check runs SyncNet, and finds no face in a test pattern" : "lip_check isn't offered without its files", async () => {
  if (!lipCheckAvailable) {
    if (TASKS.lip_check || FEATURES.includes("lip_check")) throw new Error("offered without its files");
    return;
  }
  if (!FEATURES.includes("lip_check")) throw new Error("not in the features");
  // Its own clip: the renders above removed theirs once used.
  const clip = join(dir, "lips.mp4");
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=s=640x360:d=3:r=25",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip,
  ]);
  const { metadata } = await TASKS.lip_check.run({ sources: [{ path: clip, role: "video" }], params: { window_seconds: 3 }, dir });
  if (metadata.status !== "no_face") throw new Error(`reported ${JSON.stringify(metadata)}`);
  // Framing and the mouth in silences, with the image's own numpy.
  const tests = join(lipCheckDir, "tests", "test_face_qc.py");
  if (existsSync(tests)) execFileSync(lipCheckPython, ["-I", tests], { stdio: "pipe" });
});

await rm(dir, { recursive: true, force: true });
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
