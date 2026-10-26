import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ffmpeg } from "./ffmpeg.js";
import { TaskError } from "./net.js";
import { parseLoudness } from "./sequence.js";

/**
 * A voice, measured (task measure_voice, feature voice_measure): how a
 * recording speaks, so a take can be held against a reference before anyone
 * hears it. The teasers taught it: the client heard Three Questions' voice as
 * too wet (a reverb of RT60 0.9 s, 12% wet, put on it after the take), and
 * matched As One's voice to their reference by its pitch, its pace and how
 * fast its phrase ends die away (docs/brands/aurixa-teaser/REFERENCE.md,
 * measured with scripts/aurixa-teaser/reference/phrases.py, whose method
 * this is).
 *
 *   phrases   where it speaks: 10 ms frames of the 250 Hz to 3.5 kHz band,
 *             speech within 30 dB of its loudest (the 99th percentile) and
 *             above silence (SILENCE_DB), gaps under 180 ms closed and blips
 *             under 80 ms dropped
 *   pace      syllable nuclei a second of speech: peaks of that band's level,
 *             smoothed to 12 Hz, 4 dB prominent and 100 ms apart
 *   pitch     each 40 ms of speech's autocorrelation peak between 75 and 450
 *             Hz, where it is clear (45% of the frame's own energy)
 *   dryness   how far each phrase's end falls from its last 50 ms to 40-90 ms
 *             after it, where 300 ms of quiet follows (DRYNESS)
 *   loudness  integrated, range and true peak (EBU R128)
 *
 * With a reference (a second source, in the role "reference"), both are
 * measured and compared: pitch in semitones, pace as a ratio, the phrase
 * ends' fall and the loudness as differences.
 */

/** Longest recording measured, seconds (twenty minutes). */
export const VOICE_MEASURE_SECONDS = 1200;
const RATE = 16_000;
const HOP = 160; // 10 ms
const WIN = 320; // 20 ms
const PITCH_WIN = 640; // 40 ms
/** Pitch frames looked at, at most: every so many of the speech's frames past this. */
const PITCH_FRAMES = 12_000;

/**
 * Where a phrase end's fall says a voice is dry: As One's dry stem fell 15.9
 * dB (its take as delivered 15.7), Gabby's dry takes 19, the client's
 * reference 15 (measured with what was left of the music under it), and Three
 * Questions' stem, through its reverb, 8. Music or room tone under a voice
 * holds its ends up, so it reads less dry than it is.
 */
export const DRYNESS = { dry: 13, someRoom: 9, minEnds: 3 };

const round = (value, places = 2) => (value === null || !Number.isFinite(value) ? null : Number(value.toFixed(places)));

/* ------------------------------------------------------------------ */
/* Filters                                                              */
/* ------------------------------------------------------------------ */

/** One biquad (RBJ), normalised: [b0, b1, b2, a1, a2]. */
export function biquad(kind, frequency, q, rate) {
  const w = (2 * Math.PI * frequency) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  if (kind === "low") {
    const b0 = (1 - cos) / 2 / a0;
    return [b0, 2 * b0, b0, a1, a2];
  }
  const b0 = (1 + cos) / 2 / a0;
  return [b0, -2 * b0, b0, a1, a2];
}

/** A fourth-order Butterworth as two biquads. */
const BUTTERWORTH_4 = [0.5411961, 1.3065630];

function runSection(x, [b0, b1, b2, a1, a2], reverse) {
  let z1 = 0;
  let z2 = 0;
  const n = x.length;
  for (let k = 0; k < n; k += 1) {
    const i = reverse ? n - 1 - k : k;
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
}

/** Filters in place, forwards then backwards, so nothing is moved in time. */
export function zeroPhase(x, sections) {
  for (const section of sections) runSection(x, section, false);
  for (const section of sections) runSection(x, section, true);
  return x;
}

/** The speech band, 250 Hz to 3.5 kHz (a copy). */
export function speechBand(samples, rate = RATE) {
  const band = Float64Array.from(samples);
  return zeroPhase(band, [
    ...BUTTERWORTH_4.map((q) => biquad("high", 250, q, rate)),
    ...BUTTERWORTH_4.map((q) => biquad("low", 3500, q, rate)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Frames, phrases and peaks                                            */
/* ------------------------------------------------------------------ */

/** Each 10 ms frame's level over 20 ms, in dB. */
export function frameDb(band) {
  const count = Math.max(0, Math.ceil((band.length - WIN) / HOP));
  const prefix = new Float64Array(band.length + 1);
  for (let i = 0; i < band.length; i += 1) prefix[i + 1] = prefix[i] + band[i] * band[i];
  const db = new Float64Array(count);
  for (let f = 0; f < count; f += 1) {
    const start = f * HOP;
    const energy = (prefix[start + WIN] - prefix[start]) / WIN;
    db[f] = 10 * Math.log10(energy + 1e-12);
  }
  return db;
}

/** A percentile (0-100), interpolated between the values either side, as numpy's. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = Float64Array.from(values).sort();
  const at = (p / 100) * (sorted.length - 1);
  const low = Math.floor(at);
  const high = Math.min(sorted.length - 1, low + 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/**
 * The quietest a frame of speech can be, in dB of full scale in the speech
 * band: below it is silence, however quiet the rest of the recording is.
 * Without it every frame of a silent recording (all -120 dB) is within 30 dB
 * of its loudest, and reads as speech. A voice's quietest phrases sit 40 dB
 * above it and more.
 */
export const SILENCE_DB = -70;

/** Phrases as [start, end) frame spans: speech within 30 dB of its loudest (and above SILENCE_DB), gaps under 180 ms closed, blips under 80 ms dropped. */
export function phrasesOf(db) {
  const loudest = percentile(db, 99);
  if (loudest === null) return { active: new Uint8Array(0), spans: [] };
  const floor = Math.max(loudest - 30, SILENCE_DB);
  const active = new Uint8Array(db.length);
  for (let f = 0; f < db.length; f += 1) active[f] = db[f] > floor ? 1 : 0;
  const runs = [];
  let start = -1;
  for (let f = 0; f <= db.length; f += 1) {
    const on = f < db.length && active[f] === 1;
    if (on && start < 0) start = f;
    if (!on && start >= 0) {
      runs.push([start, f]);
      start = -1;
    }
  }
  const merged = [];
  for (const [a, z] of runs) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] < 18) last[1] = z;
    else merged.push([a, z]);
  }
  return { active, spans: merged.filter(([a, z]) => z - a >= 8) };
}

/**
 * Peaks as SciPy's find_peaks finds them with `distance` and `prominence`:
 * local maxima (a plateau's middle), the highest kept first where two are
 * nearer than `distance`, then those standing `prominence` above the higher
 * of the lowest points either side before a higher sample.
 */
export function findPeaks(x, { distance = 1, prominence = 0 } = {}) {
  const peaks = [];
  for (let i = 1; i < x.length - 1; ) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < x.length - 1 && x[ahead] === x[i]) ahead += 1;
      if (x[ahead] < x[i]) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
        continue;
      }
    }
    i += 1;
  }
  let kept = peaks;
  if (distance > 1 && peaks.length > 1) {
    const keep = new Uint8Array(peaks.length).fill(1);
    const order = peaks.map((_, index) => index).sort((a, b) => x[peaks[a]] - x[peaks[b]]);
    for (let k = order.length - 1; k >= 0; k -= 1) {
      const i = order[k];
      if (!keep[i]) continue;
      for (let j = i - 1; j >= 0 && peaks[i] - peaks[j] < distance; j -= 1) keep[j] = 0;
      for (let j = i + 1; j < peaks.length && peaks[j] - peaks[i] < distance; j += 1) keep[j] = 0;
    }
    kept = peaks.filter((_, index) => keep[index]);
  }
  if (prominence <= 0) return kept;
  return kept.filter((peak) => {
    let leftMin = x[peak];
    for (let i = peak; i >= 0 && x[i] <= x[peak]; i -= 1) if (x[i] < leftMin) leftMin = x[i];
    let rightMin = x[peak];
    for (let i = peak; i < x.length && x[i] <= x[peak]; i += 1) if (x[i] < rightMin) rightMin = x[i];
    return x[peak] - Math.max(leftMin, rightMin) >= prominence;
  });
}

/** Syllable nuclei: peaks of the speech band's level, smoothed to 12 Hz, 4 dB prominent and 100 ms apart, in speech. */
export function nucleiOf(db, active) {
  const smoothed = zeroPhase(Float64Array.from(db), [biquad("low", 12, Math.SQRT1_2, 100)]);
  return findPeaks(smoothed, { distance: 10, prominence: 4 }).filter((peak) => active[peak] === 1);
}

/** Each clear 40 ms of speech's pitch (Hz), by its autocorrelation's peak between 75 and 450 Hz. */
export function pitchesOf(samples, active, rate = RATE) {
  const lo = Math.floor(rate / 450);
  const hi = Math.floor(rate / 75);
  const window = new Float64Array(PITCH_WIN);
  for (let n = 0; n < PITCH_WIN; n += 1) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (PITCH_WIN - 1));
  const frames = [];
  for (let start = 0; start < samples.length - PITCH_WIN; start += HOP) {
    if (active[Math.min(Math.floor(start / HOP), active.length - 1)] === 1) frames.push(start);
  }
  const every = Math.max(1, Math.ceil(frames.length / PITCH_FRAMES));
  const frame = new Float64Array(PITCH_WIN);
  const found = [];
  for (let k = 0; k < frames.length; k += every) {
    const start = frames[k];
    for (let n = 0; n < PITCH_WIN; n += 1) frame[n] = samples[start + n] * window[n];
    let zero = 0;
    for (let n = 0; n < PITCH_WIN; n += 1) zero += frame[n] * frame[n];
    if (zero <= 0) continue;
    let best = -Infinity;
    let lag = lo;
    for (let l = lo; l < hi; l += 1) {
      let sum = 0;
      for (let n = 0; n + l < PITCH_WIN; n += 1) sum += frame[n] * frame[n + l];
      if (sum > best) {
        best = sum;
        lag = l;
      }
    }
    if (best > 0.45 * zero) found.push(rate / lag);
  }
  return found;
}

/** How far each phrase's end falls (dB), from its last 50 ms to 40-90 ms after, where 300 ms of quiet follows. */
export function endDrops(db, spans) {
  const drops = [];
  for (const [, z] of spans) {
    const next = spans.find(([start]) => start > z);
    if (next && next[0] - z < 30) continue;
    if (z + 10 >= db.length) continue;
    let before = 0;
    const from = Math.max(z - 5, 0);
    for (let f = from; f < z; f += 1) before += db[f];
    before /= z - from;
    let after = 0;
    for (let f = z + 4; f < z + 9; f += 1) after += db[f];
    after /= 5;
    drops.push(round(before - after, 1));
  }
  return drops;
}

/** The fall's verdict: dry, some room, wet, or unknown with too few ends to say. */
export function drynessOf(drops) {
  if (drops.length < DRYNESS.minEnds) return { verdict: "unknown", median: drops.length ? percentile(drops, 50) : null };
  const median = percentile(drops, 50);
  return { verdict: median >= DRYNESS.dry ? "dry" : median >= DRYNESS.someRoom ? "some_room" : "wet", median };
}

/* ------------------------------------------------------------------ */
/* The measurement                                                      */
/* ------------------------------------------------------------------ */

/** A recording's sound at 16 kHz, mono, from `start` for `seconds` (its first audio stream). */
async function decodeVoice(path, out, { start = 0, seconds = VOICE_MEASURE_SECONDS } = {}) {
  await ffmpeg([
    ...(start > 0 ? ["-ss", String(start)] : []),
    "-i", path,
    "-t", String(seconds),
    "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "1", "-ar", String(RATE),
    "-f", "f32le", "-c:a", "pcm_f32le", out,
  ]).catch((error) => {
    throw /does not contain any stream|matches no streams|Stream map/i.test(error?.message ?? "")
      ? new TaskError("INVALID_PARAMETERS", "It has no sound to measure")
      : error;
  });
  const bytes = await readFile(out);
  const samples = new Float32Array(bytes.length / 4);
  for (let index = 0; index < samples.length; index += 1) samples[index] = bytes.readFloatLE(index * 4);
  return samples;
}

async function loudnessOf(path, { start = 0, seconds = VOICE_MEASURE_SECONDS } = {}) {
  const { stderr } = await ffmpeg([
    ...(start > 0 ? ["-ss", String(start)] : []),
    "-i", path,
    "-t", String(seconds),
    "-map", "0:a:0", "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-",
  ]);
  const measured = parseLoudness(stderr);
  if (!measured || !(measured.input_i > -70)) return null;
  return {
    integrated_lufs: round(measured.input_i, 1),
    range_lu: round(measured.input_lra, 1),
    true_peak_dbtp: round(measured.input_tp, 1),
  };
}

/** One recording measured (see the top of this file), from its samples. */
export function measureSamples(samples, rate = RATE) {
  const db = frameDb(speechBand(samples, rate));
  const { active, spans } = phrasesOf(db);
  const speechFrames = active.reduce((sum, on) => sum + on, 0);
  const speechSeconds = speechFrames / 100;
  const nuclei = nucleiOf(db, active);
  const pitches = pitchesOf(samples, active, rate);
  const drops = endDrops(db, spans);
  const dryness = drynessOf(drops);
  return {
    seconds: round(samples.length / rate, 2),
    status: speechSeconds >= 1 ? "measured" : "no_speech",
    speech_seconds: round(speechSeconds, 2),
    phrases: spans.length,
    phrase_spans: spans.slice(0, 200).map(([a, z]) => [round(a / 100, 2), round(z / 100, 2)]),
    syllables: nuclei.length,
    syllables_per_second: speechSeconds > 0 ? round(nuclei.length / speechSeconds, 2) : null,
    pitch_hz: pitches.length
      ? {
          median: round(percentile(pitches, 50), 1),
          p25: round(percentile(pitches, 25), 1),
          p75: round(percentile(pitches, 75), 1),
          frames: pitches.length,
        }
      : null,
    phrase_end_drop_db: { median: round(dryness.median, 1), ends: drops.length, values: drops.slice(0, 60) },
    dryness: dryness.verdict,
  };
}

function span(params, prefix) {
  const number = (key, max) => {
    const value = params?.[`${prefix}${key}`];
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > max)
      throw new TaskError("INVALID_PARAMETERS", `${prefix}${key} must be between 0 and ${max} seconds`);
    return parsed;
  };
  const start = number("start", 86_400) ?? 0;
  const end = number("end", 86_400);
  if (end !== null && end <= start) throw new TaskError("INVALID_PARAMETERS", `${prefix}end must come after ${prefix}start`);
  return { start, seconds: Math.min(VOICE_MEASURE_SECONDS, end === null ? VOICE_MEASURE_SECONDS : end - start) };
}

async function measureFile(path, dir, name, range) {
  const samples = await decodeVoice(path, join(dir, `${name}.f32`), range);
  if (!samples.length) throw new TaskError("INVALID_PARAMETERS", "It has no sound to measure");
  return { ...measureSamples(samples), loudness: await loudnessOf(path, range), from_seconds: range.start };
}

/** The difference a take makes against its reference: pitch (semitones), pace (ratio), fall and loudness (dB, LU). */
export function compareVoices(voice, reference) {
  const pitch =
    voice.pitch_hz && reference.pitch_hz ? round(12 * Math.log2(voice.pitch_hz.median / reference.pitch_hz.median), 2) : null;
  const pace =
    voice.syllables_per_second && reference.syllables_per_second
      ? round(voice.syllables_per_second / reference.syllables_per_second, 3)
      : null;
  const drop =
    voice.phrase_end_drop_db.median !== null && reference.phrase_end_drop_db.median !== null
      ? round(voice.phrase_end_drop_db.median - reference.phrase_end_drop_db.median, 1)
      : null;
  const loudness =
    voice.loudness && reference.loudness ? round(voice.loudness.integrated_lufs - reference.loudness.integrated_lufs, 1) : null;
  return { pitch_semitones: pitch, pace_ratio: pace, phrase_end_drop_db_difference: drop, loudness_lu_difference: loudness };
}

/** The measure_voice task: a recording (and any reference) measured. Produces no file. */
export async function measureVoice({ sources, params, dir }) {
  const voice = sources.find((source) => source.role !== "reference") ?? sources[0];
  const reference = sources.find((source) => source.role === "reference" && source !== voice) ?? null;
  if (!voice) throw new TaskError("INVALID_PARAMETERS", "measure_voice needs a recording");
  const measured = await measureFile(voice.path, dir, "voice", span(params, ""));
  if (!reference) return { outputs: [], metadata: { voice: measured } };
  const held = await measureFile(reference.path, dir, "reference", span(params, "reference_"));
  return { outputs: [], metadata: { voice: measured, reference: held, compared: compareVoices(measured, held) } };
}
