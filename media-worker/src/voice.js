import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ffmpeg, run } from "./ffmpeg.js";
import { TaskError } from "./net.js";

/**
 * Voiceovers that drive a video's lip sync.
 *
 * A voiceover is first made into one canonical file: 48 kHz, mono, 16-bit
 * PCM WAV, with nothing in its header but the format and the sound. Every
 * time anything else gives (where a clip's sound is cut, where a clip is put
 * in an edit) is a time in that file, so it means the same to every program
 * that reads it: a WAV has no encoder delay, no priming and no padding, which
 * an MP3 or M4A each handle in their own way.
 *
 * Then the speech in it is found, and the pauses between, so a long voiceover
 * can be cut into clips only where nobody is speaking. And once a clip has
 * been generated from its piece of the voiceover, the clip's own sound is
 * matched against that piece, to measure (not assume) where the provider put
 * the speech in the clip.
 */

/** The canonical voiceover: what every time is measured in. */
export const CANONICAL = { rate: 48_000, channels: 1, bits: 16 };
/** The copy analysed (and transcribed by the app): mono 16-bit at 16 kHz, plenty for speech. */
export const SPEECH_RATE = 16_000;
/** An edit holds at most ten minutes, so a voiceover can't usefully run longer. */
export const MAX_VOICEOVER_SECONDS = 600;
/** Analysis frames: 10 ms. */
const FRAME_SECONDS = 0.01;
/** Waveform drawn by the app: peaks per second. */
const ENVELOPE_RATE = 25;

const round3 = (value) => Number(value.toFixed(3));

/* ------------------------------------------------------------------ */
/* WAV files                                                            */
/* ------------------------------------------------------------------ */

/**
 * A WAV file's format and where its sound is, read from its own chunks (never
 * assumed to start at byte 44): format tag, channels, rate, sample size and
 * the byte range of its data.
 */
export async function readWavInfo(path) {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    const { size } = await handle.stat();
    return parseWavHeader(head.subarray(0, bytesRead), size);
  } finally {
    await handle.close();
  }
}

export function parseWavHeader(bytes, fileSize = bytes.length) {
  const fail = (why) => {
    throw new TaskError("RENDER_FAILED", `The prepared voiceover isn't a readable WAV (${why})`);
  };
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE")
    fail("no RIFF/WAVE header");
  let offset = 12;
  let format = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > bytes.length) fail("short format chunk");
      format = {
        tag: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        rate: bytes.readUInt32LE(body + 4),
        blockAlign: bytes.readUInt16LE(body + 12),
        bits: bytes.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!format) fail("data before format");
      // A writer that couldn't seek back leaves the size unset: the rest of the file is the data.
      const dataBytes = size === 0 || size === 0xffffffff ? Math.max(0, fileSize - body) : Math.min(size, Math.max(0, fileSize - body));
      const usable = dataBytes - (dataBytes % format.blockAlign);
      return { ...format, dataOffset: body, dataBytes: usable, samples: usable / format.blockAlign };
    }
    offset = body + size + (size % 2);
  }
  return fail("no data chunk");
}

/** The sound of a 16-bit PCM WAV, as samples (interleaved when it has several channels). */
async function readPcm16(path) {
  const info = await readWavInfo(path);
  if (info.tag !== 1 || info.bits !== 16) throw new TaskError("RENDER_FAILED", "The voiceover copy isn't 16-bit PCM");
  const bytes = await readFile(path);
  const data = bytes.subarray(info.dataOffset, info.dataOffset + info.dataBytes);
  // Copied out so the samples are aligned whatever the header's length.
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2);
  return { info, samples };
}

/* ------------------------------------------------------------------ */
/* Speech and pauses                                                    */
/* ------------------------------------------------------------------ */

/** Loudness of each 10 ms frame, in dBFS (silence is -100). */
export function frameLevels(samples, rate) {
  const hop = Math.max(1, Math.round(rate * FRAME_SECONDS));
  const frames = Math.floor(samples.length / hop);
  const levels = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let index = frame * hop; index < (frame + 1) * hop; index += 1) {
      const value = samples[index] / 32768;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / hop);
    levels[frame] = rms > 1e-5 ? 20 * Math.log10(rms) : -100;
  }
  return levels;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return -100;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))))];
}

/**
 * Where someone is speaking, and the pauses between, from 10 ms frame levels.
 *
 * The threshold adapts to the recording: a third of the way from its noise
 * floor (the quietest tenth of it) to its speech (its loudest twentieth), and
 * never far below the speech, so a breath in a clean studio take isn't speech.
 * Dips shorter than 80 ms (inside a word: a stop, a soft consonant) don't make
 * a pause, and sounds shorter than 50 ms (a click, a lip smack) don't make
 * speech. A recording with no clear difference between speech and the rest
 * (music under it, constant noise) is reported as having no pauses at all,
 * rather than with pauses that aren't there.
 */
export function speechActivity(levels, durationSeconds) {
  const sorted = Float32Array.from(levels).sort();
  const floor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.95);
  const peak = sorted.length ? sorted[sorted.length - 1] : -100;
  const contrast = loud - floor;
  const result = {
    levels: { floor_db: round3(floor), speech_db: round3(loud), peak_db: round3(peak), threshold_db: null },
    speech: [],
    pauses: [],
    clear: contrast >= 8 && loud > -60,
  };
  if (!levels.length) return result;
  if (!result.clear) {
    // Everything counts as speech: there is nowhere it is safe to say nobody speaks.
    if (loud > -60) result.speech.push([0, round3(durationSeconds)]);
    return result;
  }

  let threshold = Math.max(floor + Math.max(6, 0.35 * contrast), loud - 32);
  threshold = Math.min(threshold, loud - 6);
  result.levels.threshold_db = round3(threshold);

  const voiced = Array.from(levels, (level) => level > threshold);
  // Dips inside a word are speech.
  fillRuns(voiced, false, 8);
  // Clicks are not.
  fillRuns(voiced, true, 5);

  let start = null;
  for (let frame = 0; frame <= voiced.length; frame += 1) {
    const on = frame < voiced.length && voiced[frame];
    if (on && start === null) start = frame;
    if (!on && start !== null) {
      result.speech.push([round3(start * FRAME_SECONDS), round3(Math.min(durationSeconds, frame * FRAME_SECONDS))]);
      start = null;
    }
  }
  // The frames end on a whole 10 ms; speech running into the end runs to the end.
  const last = result.speech.at(-1);
  if (last && voiced.at(-1) && durationSeconds - last[1] < 0.02) last[1] = round3(durationSeconds);

  let cursor = 0;
  for (const [from, to] of result.speech) {
    if (from - cursor >= 0.08 - 1e-9) result.pauses.push([round3(cursor), round3(from)]);
    cursor = to;
  }
  if (durationSeconds - cursor >= 0.08 - 1e-9) result.pauses.push([round3(cursor), round3(durationSeconds)]);
  return result;
}

/** Turns runs of `value` shorter than `frames` that lie between runs of the other value into it. */
function fillRuns(flags, value, frames) {
  let index = 0;
  while (index < flags.length) {
    if (flags[index] !== value) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < flags.length && flags[end] === value) end += 1;
    const inside = index > 0 && end < flags.length;
    if (inside && end - index < frames) for (let at = index; at < end; at += 1) flags[at] = !value;
    index = end;
  }
}

/** The voiceover's waveform, for the app to draw: the loudest moment in each 40 ms, 0-255 on a square-root scale. */
export function envelope(samples, rate) {
  const hop = Math.max(1, Math.round(rate / ENVELOPE_RATE));
  const count = Math.ceil(samples.length / hop);
  const values = new Uint8Array(count);
  for (let bin = 0; bin < count; bin += 1) {
    let peak = 0;
    for (let index = bin * hop; index < Math.min(samples.length, (bin + 1) * hop); index += 1) {
      const value = Math.abs(samples[index]);
      if (value > peak) peak = value;
    }
    values[bin] = Math.min(255, Math.round(255 * Math.sqrt(peak / 32768)));
  }
  return { rate: ENVELOPE_RATE, data: Buffer.from(values).toString("base64") };
}

/* ------------------------------------------------------------------ */
/* Task: prepare a voiceover                                            */
/* ------------------------------------------------------------------ */

/**
 * prepare_audio: the canonical voiceover (output 1), a 16 kHz mono copy for
 * analysis and transcription (output 2), and in metadata its exact length
 * (in samples), its speech and pauses, levels and waveform.
 */
export async function prepareAudio({ sources, dir }) {
  const source = sources[0];
  const streams = await streamTimes(source.path);
  if (!streams.audio) throw new TaskError("INVALID_PARAMETERS", "That file has no sound to use as a voiceover");
  const sourceSeconds = streams.audio.duration ?? streams.duration;
  if (sourceSeconds && sourceSeconds > MAX_VOICEOVER_SECONDS + 1)
    throw new TaskError(
      "INVALID_PARAMETERS",
      `The voiceover runs ${Math.round(sourceSeconds)} s; one can run at most ${MAX_VOICEOVER_SECONDS / 60} minutes (an edit's length).`,
    );

  const canonical = join(dir, "voiceover.wav");
  await ffmpeg([
    "-i", source.path,
    "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-ac", String(CANONICAL.channels),
    "-ar", String(CANONICAL.rate),
    "-c:a", "pcm_s16le",
    "-map_metadata", "-1",
    "-fflags", "+bitexact", "-flags:a", "+bitexact",
    canonical,
  ]);
  const info = await readWavInfo(canonical);
  if (info.tag !== 1 || info.rate !== CANONICAL.rate || info.channels !== CANONICAL.channels || info.bits !== CANONICAL.bits)
    throw new TaskError("RENDER_FAILED", "The voiceover couldn't be converted to the format lip sync needs");
  if (info.samples < CANONICAL.rate * 0.25)
    throw new TaskError("INVALID_PARAMETERS", "The voiceover is too short: it needs at least a quarter of a second of sound");
  const seconds = info.samples / CANONICAL.rate;
  if (seconds > MAX_VOICEOVER_SECONDS + 1)
    throw new TaskError("INVALID_PARAMETERS", `The voiceover runs ${Math.round(seconds)} s; one can run at most ${MAX_VOICEOVER_SECONDS / 60} minutes.`);

  // Made from the canonical file, so both share one timeline.
  const speech = join(dir, "speech.wav");
  await ffmpeg([
    "-i", canonical,
    "-ac", "1",
    "-ar", String(SPEECH_RATE),
    "-c:a", "pcm_s16le",
    "-map_metadata", "-1",
    "-fflags", "+bitexact", "-flags:a", "+bitexact",
    speech,
  ]);
  const { samples } = await readPcm16(speech);
  const activity = speechActivity(frameLevels(samples, SPEECH_RATE), seconds);

  return {
    outputs: [
      { path: canonical, mime: "audio/wav", kind: "audio" },
      { path: speech, mime: "audio/wav", kind: "audio" },
    ],
    metadata: {
      analysis_version: 1,
      sample_rate: info.rate,
      channels: info.channels,
      bits_per_sample: info.bits,
      samples: info.samples,
      data_offset: info.dataOffset,
      duration_seconds: Number(seconds.toFixed(6)),
      source: {
        codec: streams.audio.codec,
        sample_rate: streams.audio.sampleRate,
        channels: streams.audio.channels,
        duration_seconds: sourceSeconds ? round3(sourceSeconds) : null,
      },
      speech_rate: SPEECH_RATE,
      levels: activity.levels,
      clear_pauses: activity.clear,
      speech: activity.speech,
      pauses: activity.pauses,
      speech_start_seconds: activity.speech[0]?.[0] ?? null,
      speech_end_seconds: activity.speech.at(-1)?.[1] ?? null,
      envelope: envelope(samples, SPEECH_RATE),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Task: measure a clip's lip sync                                      */
/* ------------------------------------------------------------------ */

/** Each stream's start, length and format, as the container gives them. */
async function streamTimes(path) {
  const { stdout } = await run(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,start_time,duration,sample_rate,channels,avg_frame_rate,nb_frames",
      "-of", "json",
      path,
    ],
    { timeoutSeconds: 60 },
  );
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new TaskError("RENDER_FAILED", "Media could not be inspected");
  }
  const number = (value) => (value === undefined || value === "N/A" || !Number.isFinite(Number(value)) ? null : Number(value));
  const pick = (type) => {
    const stream = (parsed.streams ?? []).find((entry) => entry.codec_type === type);
    if (!stream) return null;
    const [num, den] = String(stream.avg_frame_rate ?? "").split("/").map(Number);
    return {
      codec: stream.codec_name ?? null,
      start: number(stream.start_time) ?? 0,
      duration: number(stream.duration),
      sampleRate: number(stream.sample_rate),
      channels: number(stream.channels),
      fps: num && den ? num / den : null,
      frames: number(stream.nb_frames),
    };
  };
  return { duration: number(parsed.format?.duration), audio: pick("audio"), video: pick("video") };
}

/** A file's first sound as mono floats at `rate`, from its first sample. */
async function decodeMono(path, rate, out) {
  await ffmpeg(["-i", path, "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-c:a", "pcm_f32le", out]);
  const bytes = await readFile(out);
  const samples = new Float32Array(bytes.length / 4);
  for (let index = 0; index < samples.length; index += 1) samples[index] = bytes.readFloatLE(index * 4);
  return samples;
}

/**
 * A speech envelope at 1 kHz: log energy over 10 ms around each millisecond,
 * less its moving average over 200 ms. What's left is where sound starts and
 * stops, which survives re-encoding and a change of level; the comparison of
 * two of them says how far apart the same speech is.
 */
export function speechEnvelope(samples, rate) {
  const hop = rate / 1000;
  const window = Math.round(rate * 0.01);
  const count = Math.floor(samples.length / hop);
  const prefix = new Float64Array(samples.length + 1);
  for (let index = 0; index < samples.length; index += 1) prefix[index + 1] = prefix[index] + samples[index] * samples[index];
  const raw = new Float32Array(count);
  for (let at = 0; at < count; at += 1) {
    const centre = at * hop + hop / 2;
    const from = Math.max(0, Math.round(centre - window / 2));
    const to = Math.min(samples.length, from + window);
    const energy = to > from ? (prefix[to] - prefix[from]) / (to - from) : 0;
    raw[at] = Math.log10(1e-9 + energy);
  }
  const span = 100;
  const sums = new Float64Array(count + 1);
  for (let at = 0; at < count; at += 1) sums[at + 1] = sums[at] + raw[at];
  const detrended = new Float32Array(count);
  for (let at = 0; at < count; at += 1) {
    const from = Math.max(0, at - span);
    const to = Math.min(count, at + span + 1);
    detrended[at] = raw[at] - (sums[to] - sums[from]) / (to - from);
  }
  return detrended;
}

/**
 * Normalised correlation of `reference` with `clip` at each lag from `from`
 * to `to` (inclusive). The reference is the part of a longer signal that
 * starts at `start`, so at lag L its sample i is compared with the clip's
 * sample start + i + L. Lags where the two overlap by less than half the
 * reference score -1: too little to go on.
 */
function scanLags(reference, clip, from, to, start = 0) {
  const scores = new Float64Array(to - from + 1);
  for (let lag = from; lag <= to; lag += 1) {
    const first = Math.max(0, -(start + lag));
    const end = Math.min(reference.length, clip.length - start - lag);
    let sum = 0;
    let a2 = 0;
    let b2 = 0;
    for (let index = first; index < end; index += 1) {
      const a = reference[index];
      const b = clip[start + index + lag];
      sum += a * b;
      a2 += a * a;
      b2 += b * b;
    }
    scores[lag - from] = end - first >= reference.length * 0.5 && a2 > 0 && b2 > 0 ? sum / Math.sqrt(a2 * b2) : -1;
  }
  return scores;
}

/**
 * The lag at which `clip` best matches `reference` among `from`..`to`, with
 * its correlation, how far it stands out from the best match more than 40
 * steps away, and a sub-step position from the parabola through its
 * neighbours. A positive lag: the clip has the sound later than the reference.
 */
export function bestLag(reference, clip, from, to, start = 0) {
  const scores = scanLags(reference, clip, from, to, start);
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) if (scores[index] > scores[best]) best = index;
  const score = scores[best];
  let refined = best;
  if (best > 0 && best < scores.length - 1) {
    const left = scores[best - 1];
    const right = scores[best + 1];
    const curve = left - 2 * score + right;
    if (curve < 0 && left > -1 && right > -1) refined = best + Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / curve));
  }
  let rival = -1;
  for (let index = 0; index < scores.length; index += 1)
    if (Math.abs(index - best) > 40) rival = Math.max(rival, scores[index]);
  return { lag: from + refined, whole: from + best, score, margin: score - rival };
}

/**
 * Where a clip's sound has its driving voiceover, against the voiceover piece
 * it was made from: the offset in seconds (positive: later in the clip).
 * Found on speech envelopes (which survive re-encoding and a change of level)
 * to the millisecond, then on the waveforms themselves to the sample where
 * they still agree (re-encoded sound keeps its waveform; sound the model made
 * anew doesn't, and the low score says so). The first and last thirds are
 * matched again on their own: a timing that changed through the clip shows as
 * drift between them.
 */
export function alignSpeech(reference, clip, rate, { maxLagSeconds = 1 } = {}) {
  const ref = speechEnvelope(reference, rate);
  const got = speechEnvelope(clip, rate);
  const maxLag = Math.round(maxLagSeconds * 1000);
  const whole = bestLag(ref, got, -maxLag, maxLag);
  let offsetSeconds = whole.lag / 1000;
  let waveform = null;
  if (whole.score >= 0.5) {
    const centre = Math.round(offsetSeconds * rate);
    const radius = Math.round(rate * 0.004);
    const found = bestLag(reference, clip, centre - radius, centre + radius);
    waveform = round3(found.score);
    if (found.score >= 0.6) offsetSeconds = found.whole / rate;
  }
  let drift = null;
  const third = Math.floor(ref.length / 3);
  if (third >= 800 && whole.score >= 0.5) {
    const around = Math.round(whole.lag);
    const first = bestLag(ref.subarray(0, third), got, around - 60, around + 60, 0);
    const last = bestLag(ref.subarray(ref.length - third), got, around - 60, around + 60, ref.length - third);
    if (first.score >= 0.4 && last.score >= 0.4) drift = round3((last.lag - first.lag) / 1000);
  }
  return {
    offset_seconds: Number(offsetSeconds.toFixed(5)),
    confidence: round3(Math.max(0, whole.score)),
    margin: round3(whole.margin),
    waveform_correlation: waveform,
    drift_seconds: drift,
  };
}

/**
 * measure_sync: a generated clip (role "video") against the piece of
 * voiceover it was given (role "audio"). Reports where the clip's own sound
 * has that speech, relative to the clip's first picture, and the clip's
 * length; a clip with no sound can't be measured and says so.
 */
export async function measureSync({ sources, params, dir }) {
  const video = sources.find((source) => source.role === "video") ?? sources[0];
  const audio = sources.find((source) => source.role === "audio") ?? sources[1];
  if (!video || !audio || video === audio) throw new TaskError("INVALID_PARAMETERS", "measure_sync needs a clip and its voiceover");
  const maxLagSeconds = Number.isFinite(Number(params?.max_lag_seconds))
    ? Math.min(2, Math.max(0.1, Number(params.max_lag_seconds)))
    : 1;

  const clip = await streamTimes(video.path);
  const base = {
    has_audio: Boolean(clip.audio),
    fps: clip.video?.fps ? Number(clip.video.fps.toFixed(6)) : null,
    video_duration_seconds: clip.video?.duration ?? clip.duration,
    video_frames: clip.video?.frames ?? null,
  };
  if (!clip.video) throw new TaskError("INVALID_PARAMETERS", "The clip has no picture");
  if (!clip.audio) return { outputs: [], metadata: { ...base, status: "no_audio" } };

  const rate = SPEECH_RATE;
  const reference = await decodeMono(audio.path, rate, join(dir, "reference.f32"));
  const sound = await decodeMono(video.path, rate, join(dir, "clip.f32"));
  // Where the clip's sound starts against its picture (the editor counts from the first picture).
  const lead = (clip.audio.start ?? 0) - (clip.video.start ?? 0);

  let energy = 0;
  for (const value of reference) energy += value * value;
  if (!reference.length || energy / reference.length < 1e-7)
    return { outputs: [], metadata: { ...base, status: "no_speech", audio_lead_seconds: round3(lead) } };

  const found = alignSpeech(reference, sound, rate, { maxLagSeconds });
  const clear = found.confidence >= 0.5 && found.margin >= 0.08;
  return {
    outputs: [],
    metadata: {
      ...base,
      status: clear ? "measured" : "unclear",
      ...found,
      offset_seconds: Number((found.offset_seconds + lead).toFixed(5)),
      audio_lead_seconds: round3(lead),
      reference_seconds: round3(reference.length / rate),
      clip_audio_seconds: round3(sound.length / rate),
    },
  };
}
