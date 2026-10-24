import { join } from "node:path";
import { ffmpeg, probe, run } from "./ffmpeg.js";
import { TaskError } from "./net.js";

/**
 * A recording at another tempo, its pitch kept (stretch_audio, feature audio_stretch). Reel 2's cut was paced to a
 * 120 BPM score and approved; the client then chose Reel 1's track, at 129 BPM, under it. Rather than pace the
 * cut again, the track was slowed 7.0% to the cut's beat with its pitch kept and cut on its own bar lines, and
 * every cut and anchor stayed on its beat (scripts/aurixa-reel-2/national_treasures.py).
 *
 * Rubber Band (FFmpeg's rubberband filter) does it where this FFmpeg has it: its finest pitch quality, both
 * channels together so the stereo image holds, its transients kept crisp so a drum's attack stays on its beat.
 * Without it, FFmpeg's own atempo (which smears attacks more), and the metadata says which. The output is
 * lossless (FLAC, 48 kHz stereo), since it will be cut and mixed again.
 */
export const STRETCH_LIMITS = { min: 0.5, max: 2 };

let rubberbandChecked = null;
/** Whether this FFmpeg has Rubber Band. */
export function hasRubberband() {
  rubberbandChecked ??= run("ffmpeg", ["-hide_banner", "-filters"], { timeoutSeconds: 30 })
    .then(({ stdout }) => /\brubberband\b/.test(stdout))
    .catch(() => false);
  return rubberbandChecked;
}

/** The filter that plays a recording at `tempo` times its speed (below 1 is slower), its pitch kept. */
export function stretchFilter(tempo, rubberband) {
  const value = tempo.toFixed(9);
  return rubberband
    ? `rubberband=tempo=${value}:pitchq=quality:channels=together:transients=crisp:detector=compound`
    : `atempo=${value}`;
}

/** The tempo asked for, checked: the new tempo over the old (0.93 is 7% slower). */
export function stretchTempo(value) {
  const tempo = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(tempo))
    throw new TaskError("INVALID_PARAMETERS", "tempo must be a number: the new tempo over the old (0.93 is 7% slower)");
  if (tempo < STRETCH_LIMITS.min || tempo > STRETCH_LIMITS.max)
    throw new TaskError("INVALID_PARAMETERS", `tempo must be between ${STRETCH_LIMITS.min} and ${STRETCH_LIMITS.max}`);
  return tempo;
}

export async function stretchAudio({ sources, params, dir }) {
  const tempo = stretchTempo(params.tempo);
  const source = await probe(sources[0].path);
  if (!source.has_audio) throw new TaskError("INVALID_PARAMETERS", "That file has no audio to change the tempo of");
  const rubberband = await hasRubberband();
  const out = join(dir, "stretched.flac");
  await ffmpeg(
    ["-i", sources[0].path, "-vn", "-af", `${stretchFilter(tempo, rubberband)},aresample=48000`, "-ac", "2",
      "-c:a", "flac", "-sample_fmt", "s16", out],
    { stallSeconds: 120 },
  );
  const made = await probe(out);
  return {
    outputs: [{ path: out, mime: "audio/flac", kind: "audio" }],
    metadata: {
      ...made,
      stretch: {
        tempo,
        tool: rubberband ? "rubberband" : "atempo",
        pitch: "kept",
        source_seconds: source.duration_seconds ?? null,
        seconds: made.duration_seconds ?? null,
      },
    },
  };
}
