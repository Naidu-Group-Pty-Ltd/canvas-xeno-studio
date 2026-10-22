/**
 * A track's bars and sections: which beat is one, its downbeats and bar
 * lines, and where the music changes (the intro, a build, the drop, a
 * breakdown, the re-entry, the outro). Found from the audio in the browser,
 * as its beats are (./analyze), and kept on the track so it is worked out once.
 *
 * It starts from the beat grid analyzeBeats finds (./beats). Each beat is
 * described by how sharply the low end (the kick and the bass) and the whole
 * sound rise on it, and by how much the harmony changes across it: the bar's
 * phase is the one whose beats stand out most in those, since a kick and a
 * chord change mark the one. Four beats a bar is assumed; three is taken only
 * when it stands out clearly more.
 *
 * Each bar is then described by its loudness, the balance of six frequency
 * bands, its harmony (a pitch-class profile) and its rhythm (how strongly
 * each eighth of it is struck), and the bars are compared with one another.
 * A section changes where the bars before are alike, the bars after are
 * alike and the two differ (novelty), or where the loudness steps; nearly
 * always on a phrase line, so boundaries on 4-, 8- and 16-bar lines are
 * favoured. Each section is named by its loudness against its neighbours.
 *
 * Times are seconds on the track's own clock.
 */
import { z } from "zod";
import { analyzeBeats, type BeatAnalysis } from "./beats";

/** Bumped whenever the analysis changes, so structures kept on tracks are found again. */
export const STRUCTURE_VERSION = 1;

export const SECTION_KINDS = [
  "intro",
  "build",
  "drop",
  "breakdown",
  "reentry",
  "outro",
  "section",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
export const SECTION_LABELS: Record<SectionKind, string> = {
  intro: "Intro",
  build: "Build",
  drop: "Drop",
  breakdown: "Breakdown",
  reentry: "Re-entry",
  outro: "Outro",
  section: "Section",
};

export interface MusicSection {
  start: number;
  end: number;
  kind: SectionKind;
  /** 0–1: its loudness between the track's quietest section (0) and its loudest (1). */
  energy: number;
}

/**
 * A track's beats, bars and sections. Other parts of the studio build on it
 * (the pacing solver reads its beats and bar lines; storyboards show its bars
 * beside their cuts), so its shape is kept as it is.
 */
export interface MusicStructure {
  bpm: number;
  /** Every beat: analyzeBeats' grid, moved onto the beats' attacks (see beatsOnAttacks). */
  beats: number[];
  /** 4, or 3 where the track is clearly in threes. */
  beatsPerBar: number;
  /** Every beat that is one. */
  downbeats: number[];
  /** Where each whole bar starts: every downbeat whose bar is all inside the track. */
  bars: number[];
  /** The track from start to end, in order, each starting on a bar line (the first at 0). */
  sections: MusicSection[];
  /** 0–1: how sure the beat and the bar's phase are. */
  confidence: number;
}

/**
 * What each whole bar sounds like, for comparing bars (which bars are most
 * alike, for fitting music to a length on its bars). One entry per bar of
 * MusicStructure.bars.
 */
export interface BarFeatures {
  version: number;
  /** Loudness, dB below full scale. */
  loudness: number[];
  /** Energy in six bands (to 150 Hz, 400 Hz, 1 kHz, 2.5 kHz, 6 kHz and above), dB. */
  bands: number[][];
  /** How the harmony divides among the twelve pitch classes (C first), summing to 1. */
  chroma: number[][];
  /** How strongly each eighth of the bar is struck, 0 (not at all) to about 1 (the track's strongest). */
  rhythm: number[][];
}

const seconds = z.number().finite().min(0).max(36_000);
const LIMITS = { beats: 5000, bars: 2000, sections: 64 } as const;

export const musicSectionSchema = z.object({
  start: seconds,
  end: seconds,
  kind: z.enum(SECTION_KINDS),
  energy: z.number().finite().min(0).max(1),
});

export const musicStructureSchema = z.object({
  bpm: z.number().finite().min(20).max(400),
  beats: z.array(seconds).max(LIMITS.beats),
  beatsPerBar: z.number().int().min(2).max(7),
  downbeats: z.array(seconds).max(LIMITS.bars),
  bars: z.array(seconds).max(LIMITS.bars),
  sections: z.array(musicSectionSchema).min(1).max(LIMITS.sections),
  confidence: z.number().finite().min(0).max(1),
});

const db = z.number().finite().min(-200).max(60);
export const barFeaturesSchema = z
  .object({
    version: z.number().int().min(1),
    loudness: z.array(db).max(LIMITS.bars),
    bands: z.array(z.array(db).length(6)).max(LIMITS.bars),
    chroma: z.array(z.array(z.number().finite().min(0).max(1)).length(12)).max(LIMITS.bars),
    rhythm: z.array(z.array(z.number().finite().min(0).max(4)).min(2).max(16)).max(LIMITS.bars),
  })
  .refine(
    (value) =>
      value.bands.length === value.loudness.length &&
      value.chroma.length === value.loudness.length &&
      value.rhythm.length === value.loudness.length,
    "Every bar needs each of its features",
  );

/** A structure and its bar features read back from where they were kept, or null if they can't be used. */
export function readStructure(
  structure: unknown,
  features: unknown,
): { structure: MusicStructure; features: BarFeatures } | null {
  const parsedStructure = musicStructureSchema.safeParse(structure);
  const parsedFeatures = barFeaturesSchema.safeParse(features);
  if (!parsedStructure.success || !parsedFeatures.success) return null;
  if (parsedFeatures.data.version !== STRUCTURE_VERSION) return null;
  if (parsedFeatures.data.loudness.length !== parsedStructure.data.bars.length) return null;
  return { structure: parsedStructure.data, features: parsedFeatures.data };
}

/* ------------------------------------------------------------------ */
/* The sound, frame by frame                                           */
/* ------------------------------------------------------------------ */

/** Upper edges of the six bands, in Hz (the last runs to the top of the spectrum). */
const BAND_EDGES = [150, 400, 1000, 2500, 6000, Infinity] as const;
const BANDS = BAND_EDGES.length;
const SILENCE = 1e-10;

interface Spectrum {
  /** Frames per second, and where frame 0's centre falls. */
  rate: number;
  offset: number;
  frames: number;
  /** Running totals over the frames (frame count + 1 entries each), for means over any span. */
  power: Float64Array;
  bands: Float64Array;
  chroma: Float64Array;
}

/** A radix-2 FFT of `size` points: its bit-reversal order and its twiddles. */
function fftPlan(size: number) {
  const levels = Math.round(Math.log2(size));
  const reverse = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    let rest = index;
    for (let level = 0; level < levels; level += 1) {
      reversed = (reversed << 1) | (rest & 1);
      rest >>= 1;
    }
    reverse[index] = reversed;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((2 * Math.PI * index) / size);
    sin[index] = Math.sin((2 * Math.PI * index) / size);
  }
  return { size, reverse, cos, sin };
}

function fft(plan: ReturnType<typeof fftPlan>, re: Float64Array, im: Float64Array): void {
  const n = plan.size;
  for (let index = 0; index < n; index += 1) {
    const swap = plan.reverse[index]!;
    if (swap > index) {
      const r = re[index]!;
      re[index] = re[swap]!;
      re[swap] = r;
      const i = im[index]!;
      im[index] = im[swap]!;
      im[swap] = i;
    }
  }
  for (let span = 2; span <= n; span *= 2) {
    const half = span / 2;
    const step = n / span;
    for (let start = 0; start < n; start += span) {
      for (let k = 0; k < half; k += 1) {
        const wr = plan.cos[k * step]!;
        const wi = -plan.sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/**
 * The track's spectrum in frames of about 93 ms, half overlapped: each
 * frame's power, its power in each band and its pitch-class profile. Two
 * frames go through each FFT (one as its real part, one as its imaginary),
 * which halves the work.
 */
function spectrum(samples: Float32Array, sampleRate: number): Spectrum {
  const size = 2 ** Math.max(8, Math.round(Math.log2(sampleRate * 0.093)));
  const hop = size / 2;
  const frames = samples.length < size ? 0 : 1 + Math.floor((samples.length - size) / hop);
  const window = new Float64Array(size);
  let windowPower = 0;
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
    windowPower += window[index]! * window[index]!;
  }
  // A bin's power, scaled so a frame's bins sum to its mean square.
  const scale = 2 / (size * windowPower);
  const binHz = sampleRate / size;
  const bandOf = new Uint8Array(size / 2 + 1);
  for (let bin = 0; bin <= size / 2; bin += 1) {
    const hz = bin * binHz;
    let band = 0;
    while (band < BANDS - 1 && hz >= BAND_EDGES[band]!) band += 1;
    bandOf[bin] = band;
  }
  // Each bin's share of the two pitch classes nearest it, from 110 Hz to 5 kHz.
  const pitchLow = new Int8Array(size / 2 + 1).fill(-1);
  const pitchWeight = new Float64Array(size / 2 + 1);
  for (let bin = 1; bin <= size / 2; bin += 1) {
    const hz = bin * binHz;
    if (hz < 110 || hz > 5000) continue;
    const pitch = 12 * Math.log2(hz / 440) + 69;
    const low = Math.floor(pitch);
    pitchLow[bin] = ((low % 12) + 12) % 12;
    pitchWeight[bin] = 1 - (pitch - low);
  }

  const power = new Float64Array(frames + 1);
  const bands = new Float64Array((frames + 1) * BANDS);
  const chroma = new Float64Array((frames + 1) * 12);
  const plan = fftPlan(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const bandSum = new Float64Array(BANDS);
  const pitchSum = new Float64Array(12);
  const record = (bin: number, binPower: number) => {
    const band = bandOf[bin]!;
    bandSum[band] = bandSum[band]! + binPower;
    const low = pitchLow[bin]!;
    if (low >= 0) {
      const magnitude = Math.sqrt(binPower);
      const high = (low + 1) % 12;
      pitchSum[low] = pitchSum[low]! + magnitude * pitchWeight[bin]!;
      pitchSum[high] = pitchSum[high]! + magnitude * (1 - pitchWeight[bin]!);
    }
  };
  const finish = (frame: number) => {
    let total = 0;
    for (let band = 0; band < BANDS; band += 1) total += bandSum[band]!;
    power[frame + 1] = power[frame]! + total;
    for (let band = 0; band < BANDS; band += 1) {
      bands[(frame + 1) * BANDS + band] = bands[frame * BANDS + band]! + bandSum[band]!;
      bandSum[band] = 0;
    }
    let pitches = 0;
    for (let pc = 0; pc < 12; pc += 1) pitches += pitchSum[pc]!;
    for (let pc = 0; pc < 12; pc += 1) {
      // Each frame counts by its loudness, so quiet frames don't sway the harmony.
      const share = pitches > 0 ? (pitchSum[pc]! / pitches) * total : 0;
      chroma[(frame + 1) * 12 + pc] = chroma[frame * 12 + pc]! + share;
      pitchSum[pc] = 0;
    }
  };

  for (let frame = 0; frame < frames; frame += 2) {
    const second = frame + 1 < frames;
    const startA = frame * hop;
    const startB = startA + hop;
    for (let index = 0; index < size; index += 1) {
      re[index] = samples[startA + index]! * window[index]!;
      im[index] = second ? samples[startB + index]! * window[index]! : 0;
    }
    fft(plan, re, im);
    // Frame A is the even part of the transform, frame B the odd part.
    for (let bin = 0; bin <= size / 2; bin += 1) {
      const mirror = (size - bin) % size;
      const a = re[bin]!;
      const b = im[bin]!;
      const c = re[mirror]!;
      const d = im[mirror]!;
      const edge = bin === 0 || bin === size / 2 ? 0.5 : 1;
      record(bin, (((a + c) ** 2 + (b - d) ** 2) / 4) * scale * edge);
    }
    finish(frame);
    if (second) {
      for (let bin = 0; bin <= size / 2; bin += 1) {
        const mirror = (size - bin) % size;
        const a = re[bin]!;
        const b = im[bin]!;
        const c = re[mirror]!;
        const d = im[mirror]!;
        const edge = bin === 0 || bin === size / 2 ? 0.5 : 1;
        record(bin, (((b + d) ** 2 + (a - c) ** 2) / 4) * scale * edge);
      }
      finish(frame + 1);
    }
  }
  return { rate: sampleRate / hop, offset: size / 2 / sampleRate, frames, power, bands, chroma };
}

/** The frames whose centres fall in [from, to), as a half-open range of frame numbers. */
function framesIn(spec: Spectrum, from: number, to: number): [number, number] {
  const first = Math.max(0, Math.ceil((from - spec.offset) * spec.rate - 1e-9));
  const last = Math.min(spec.frames, Math.ceil((to - spec.offset) * spec.rate - 1e-9));
  return [first, Math.max(first, last)];
}

/** Mean power over [from, to), with each band's and the pitch-class profile. */
function meanOver(spec: Spectrum, from: number, to: number) {
  let [first, last] = framesIn(spec, from, to);
  // A span shorter than a frame takes the frame nearest its middle.
  if (last <= first) {
    const middle = Math.round(((from + to) / 2 - spec.offset) * spec.rate);
    first = Math.max(0, Math.min(spec.frames - 1, middle));
    last = first + 1;
  }
  const count = Math.max(1, last - first);
  const bands: number[] = [];
  for (let band = 0; band < BANDS; band += 1)
    bands.push((spec.bands[last * BANDS + band]! - spec.bands[first * BANDS + band]!) / count);
  const chroma: number[] = [];
  for (let pc = 0; pc < 12; pc += 1)
    chroma.push(spec.chroma[last * 12 + pc]! - spec.chroma[first * 12 + pc]!);
  return { power: (spec.power[last]! - spec.power[first]!) / count, bands, chroma };
}

const decibels = (power: number) => 10 * Math.log10(Math.max(SILENCE, power));

/** How long a peak-held level takes to fall to a third: long enough to bridge a 50 Hz half-cycle. */
const HOLD_SECONDS = 0.015;
const STRIKE_RATE = 100;

/** How hard the sound is struck, frame by frame, at `rate` frames a second. */
interface Strikes {
  rate: number;
  all: Float32Array;
  low: Float32Array;
}

/**
 * How hard the sound is struck, 100 times a second, for the whole sound and
 * for its low end (below about 150 Hz: the kick and the bass): the rise of
 * its peak-held level over the 40 ms before. A peak-held level doesn't ripple
 * with a low note's cycles the way short frames' energy does, so a kick reads
 * the same every time it is struck.
 */
function strikeEnvelopes(samples: Float32Array, sampleRate: number): Strikes {
  const hop = Math.max(1, Math.round(sampleRate / STRIKE_RATE));
  const frames = Math.floor(samples.length / hop);
  const hold = Math.exp(-1 / (HOLD_SECONDS * sampleRate));
  const alpha = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let first = 0;
  let second = 0;
  let heldAll = 0;
  let heldLow = 0;
  const levelAll = new Float32Array(frames);
  const levelLow = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let peakAll = 0;
    let peakLow = 0;
    const start = frame * hop;
    for (let index = start; index < start + hop; index += 1) {
      const sample = samples[index]!;
      first += alpha * (sample - first);
      second += alpha * (first - second);
      heldAll = Math.max(Math.abs(sample), heldAll * hold);
      heldLow = Math.max(Math.abs(second), heldLow * hold);
      peakAll = Math.max(peakAll, heldAll);
      peakLow = Math.max(peakLow, heldLow);
    }
    levelAll[frame] = peakAll;
    levelLow[frame] = peakLow;
  }
  const rise = (level: Float32Array) => {
    const out = new Float32Array(frames);
    for (let frame = 1; frame < frames; frame += 1) {
      let before = level[frame - 1]!;
      for (let back = 2; back <= 4 && frame - back >= 0; back += 1)
        before = Math.min(before, level[frame - back]!);
      out[frame] = Math.max(0, level[frame]! - before);
    }
    return out;
  };
  return { rate: sampleRate / hop, all: rise(levelAll), low: rise(levelLow) };
}

/**
 * The beat grid moved onto the beats' attacks. A beat tracker's beats follow
 * its onset envelope, which a bass-heavy kick pulls late (its energy ripples
 * from frame to frame), so each beat's attack is measured from the sound
 * itself: where its peak-held level first climbs halfway from the quiet
 * before it to its peak. A straight line through the attacks (it corrects any
 * drift in the period too) gives the grid; one that doesn't fit them, or too
 * few clear attacks, leaves the grid as it was.
 */
export function beatsOnAttacks(
  samples: Float32Array,
  sampleRate: number,
  tracked: number[],
  strikes: Strikes = strikeEnvelopes(samples, sampleRate),
): { beats: number[]; period: number; attacks: number } {
  const count = tracked.length;
  const beats = followDrift(tracked, strikes);
  const period = count > 1 ? (beats.at(-1)! - beats[0]!) / (count - 1) : 0.5;
  const hold = Math.exp(-1 / (HOLD_SECONDS * sampleRate));
  const at = (time: number) => Math.round(time * sampleRate);
  const level = new Float32Array(at(0.2) + 2);
  const points: Array<[number, number]> = [];
  for (let index = 0; index < count; index += 1) {
    const beat = beats[index]!;
    const first = Math.max(0, at(beat - Math.min(0.08, period * 0.3)));
    const last = Math.min(samples.length - 1, at(beat + Math.min(0.03, period * 0.1)));
    if (last - first < 8 || last - first >= level.length) continue;
    // The level held from a little before the window, so it has settled when the window opens.
    let held = 0;
    for (let sample = Math.max(0, first - at(0.05)); sample < first; sample += 1)
      held = Math.max(Math.abs(samples[sample]!), held * hold);
    for (let sample = first; sample <= last; sample += 1) {
      held = Math.max(Math.abs(samples[sample]!), held * hold);
      level[sample - first] = held;
    }
    const quietEnd = Math.min(last, first + at(0.025)) - first;
    let quiet = Infinity;
    for (let offset = 0; offset <= quietEnd; offset += 1) quiet = Math.min(quiet, level[offset]!);
    let peak = 0;
    for (let offset = 0; offset <= last - first; offset += 1) peak = Math.max(peak, level[offset]!);
    // Only a clear strike counts: one at least twice as loud as the quiet before it.
    if (!(peak > 1e-4 && peak > 2 * quiet)) continue;
    const half = quiet + 0.5 * (peak - quiet);
    for (let offset = quietEnd; offset <= last - first; offset += 1) {
      if (level[offset]! >= half) {
        points.push([index, (first + offset) / sampleRate]);
        break;
      }
    }
  }
  const unchanged = {
    beats: beats.filter((time) => time >= 0).map((time) => Number(time.toFixed(3))),
    period,
    attacks: points.length,
  };
  if (count < 8 || points.length < Math.max(8, count * 0.25)) return unchanged;
  // Least squares, twice: the second time without the attacks the first line misses widely.
  let slope = period;
  let intercept = beats[0]!;
  let kept = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const n = kept.length;
    if (n < 8) return unchanged;
    let sk = 0;
    let st = 0;
    let skk = 0;
    let skt = 0;
    for (const [k, t] of kept) {
      sk += k;
      st += t;
      skk += k * k;
      skt += k * t;
    }
    const denominator = n * skk - sk * sk;
    if (Math.abs(denominator) < 1e-9) return unchanged;
    slope = (n * skt - sk * st) / denominator;
    intercept = (st - slope * sk) / n;
    kept = points.filter(([k, t]) => Math.abs(t - (intercept + slope * k)) < 0.03);
  }
  // A line that would move the grid far, or change its tempo, is a misreading.
  if (Math.abs(slope - period) > period * 0.01 || Math.abs(intercept - beats[0]!) > 0.08)
    return unchanged;
  const moved: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = intercept + slope * index;
    if (time >= 0) moved.push(Number(time.toFixed(3)));
  }
  return { beats: moved, period: slope, attacks: points.length };
}

/**
 * A beat grid corrected for drift. A tracker's period can be a hair out (a
 * few hundredths of a percent), which over ten minutes leaves its last beats
 * a tenth of a second off. So the grid is laid against the strikes sixteen
 * beats at a time: the strongest stretch first, within a quarter of a beat,
 * then each stretch outwards from it within a tenth of a beat of the one
 * beside it, so the search follows the drift. A straight line through how
 * far each stretch had to move gives the grid; the times are kept unrounded
 * for the attacks to be measured against.
 */
function followDrift(beats: number[], { rate, all: strikes }: Strikes): number[] {
  const count = beats.length;
  const chunk = 16;
  const chunks = Math.floor(count / chunk);
  if (chunks < 3) return beats;
  const period = (beats.at(-1)! - beats[0]!) / (count - 1);
  const value = (time: number) => {
    const position = time * rate;
    const low = Math.floor(position);
    if (low < 0 || low + 1 >= strikes.length) return 0;
    const weight = position - low;
    return strikes[low]! * (1 - weight) + strikes[low + 1]! * weight;
  };
  const fit = (index: number, centre: number, reach: number) => {
    let best = centre;
    let bestScore = -1;
    for (let shift = centre - reach; shift <= centre + reach + 1e-9; shift += 1 / rate) {
      let score = 0;
      for (let beat = index * chunk; beat < (index + 1) * chunk; beat += 1)
        score += value(beats[beat]! + shift);
      // Ties go to the smaller move.
      if (
        score > bestScore + 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && Math.abs(shift) < Math.abs(best))
      ) {
        bestScore = score;
        best = shift;
      }
    }
    return { shift: best, score: bestScore };
  };
  let strongest = 0;
  let strongestScore = -1;
  for (let index = 0; index < chunks; index += 1) {
    const { score } = fit(index, 0, 0);
    if (score > strongestScore) {
      strongestScore = score;
      strongest = index;
    }
  }
  const shifts = new Array<{ shift: number; score: number }>(chunks);
  shifts[strongest] = fit(strongest, 0, period * 0.25);
  for (let index = strongest + 1; index < chunks; index += 1)
    shifts[index] = fit(index, shifts[index - 1]!.shift, period * 0.1);
  for (let index = strongest - 1; index >= 0; index -= 1)
    shifts[index] = fit(index, shifts[index + 1]!.shift, period * 0.1);
  // Weighted least squares of each stretch's move against its middle beat.
  let sw = 0;
  let sk = 0;
  let ss = 0;
  let skk = 0;
  let sks = 0;
  shifts.forEach(({ shift, score }, index) => {
    const k = index * chunk + chunk / 2;
    const w = Math.max(0, score);
    sw += w;
    sk += w * k;
    ss += w * shift;
    skk += w * k * k;
    sks += w * k * shift;
  });
  const denominator = sw * skk - sk * sk;
  if (sw <= 0 || Math.abs(denominator) < 1e-9) return beats;
  const slope = (sw * sks - sk * ss) / denominator;
  const intercept = (ss - slope * sk) / sw;
  return beats.map((beat, index) => beat + intercept + slope * index);
}

/** The largest value of an envelope (at `rate` a second) within [from, to] seconds. */
function peakIn(envelope: Float32Array, rate: number, from: number, to: number): number {
  let peak = 0;
  const first = Math.max(0, Math.floor(from * rate));
  const last = Math.min(envelope.length - 1, Math.ceil(to * rate));
  for (let frame = first; frame <= last; frame += 1) peak = Math.max(peak, envelope[frame]!);
  return peak;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * (b[index] ?? 0);
    aa += a[index]! * a[index]!;
    bb += (b[index] ?? 0) * (b[index] ?? 0);
  }
  if (aa <= 0 && bb <= 0) return 1;
  if (aa <= 0 || bb <= 0) return 0;
  return Math.max(0, Math.min(1, dot / Math.sqrt(aa * bb)));
}

/** Values standardised to their median and spread, so features of different scales can be added. */
function standardised(values: number[]): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
  );
  return values.map((value) => (spread > 1e-9 ? (value - median) / spread : 0));
}

/* ------------------------------------------------------------------ */
/* The bar: which beat is one                                          */
/* ------------------------------------------------------------------ */

interface BeatFeatures {
  low: number[];
  accent: number[];
  harmony: number[];
}

function beatFeatures(beats: number[], spec: Spectrum, strikes: Strikes): BeatFeatures {
  const low: number[] = [];
  const accent: number[] = [];
  const harmony: number[] = [];
  const period = beats.length > 1 ? (beats.at(-1)! - beats[0]!) / (beats.length - 1) : 0.5;
  for (let index = 0; index < beats.length; index += 1) {
    const at = beats[index]!;
    low.push(peakIn(strikes.low, strikes.rate, at - 0.03, at + 0.05));
    accent.push(peakIn(strikes.all, strikes.rate, at - 0.03, at + 0.05));
    const before = meanOver(spec, at - period, at).chroma;
    const after = meanOver(spec, at, at + period).chroma;
    harmony.push(1 - cosine(before, after));
  }
  return { low, accent, harmony };
}

/**
 * The bar's phase for a number of beats a bar: how much more the beats at
 * each phase stand out than the others, in the low end, the harmony and the
 * whole sound together.
 */
function phaseScores(features: BeatFeatures, beatsPerBar: number): number[] {
  const weighted = [
    [standardised(features.low), 1],
    [standardised(features.harmony), 1.2],
    [standardised(features.accent), 0.4],
  ] as const;
  const scores: number[] = [];
  for (let phase = 0; phase < beatsPerBar; phase += 1) {
    let score = 0;
    for (const [values, weight] of weighted) {
      let on = 0;
      let onCount = 0;
      let off = 0;
      let offCount = 0;
      values.forEach((value, index) => {
        if (index % beatsPerBar === phase) {
          on += value;
          onCount += 1;
        } else {
          off += value;
          offCount += 1;
        }
      });
      if (onCount && offCount) score += weight * (on / onCount - off / offCount);
    }
    scores.push(score);
  }
  return scores;
}

/* ------------------------------------------------------------------ */
/* Bars compared                                                       */
/* ------------------------------------------------------------------ */

/**
 * How alike two bars are, 0 to 1: their loudness and band balance (within
 * a few dB is alike), their harmony and their rhythm. Two silent bars are
 * alike.
 */
export function barSimilarity(features: BarFeatures, a: number, b: number): number {
  if (a === b) return 1;
  const loudA = features.loudness[a];
  const loudB = features.loudness[b];
  if (loudA === undefined || loudB === undefined) return 0;
  if (loudA < -70 && loudB < -70) return 1;
  const bandsA = features.bands[a]!;
  const bandsB = features.bands[b]!;
  let squares = (loudA - loudB) ** 2;
  for (let band = 0; band < BANDS; band += 1) squares += (bandsA[band]! - bandsB[band]!) ** 2;
  const timbre = Math.exp(-Math.sqrt(squares / (BANDS + 1)) / 6);
  const harmony = cosine(features.chroma[a]!, features.chroma[b]!);
  const rhythm = cosine(features.rhythm[a]!, features.rhythm[b]!);
  return 0.45 * timbre + 0.3 * harmony + 0.25 * rhythm;
}

function barFeatures(
  bars: number[],
  barLength: number,
  beatsPerBar: number,
  spec: Spectrum,
  strikes: Strikes,
): BarFeatures {
  // Rhythm is read against the track's strongest strikes, so a bar's pattern keeps its weight.
  const sorted = Float32Array.from(strikes.all).sort();
  const strong = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.99)] ?? 0);
  const loudness: number[] = [];
  const bands: number[][] = [];
  const chroma: number[][] = [];
  const rhythm: number[][] = [];
  for (const start of bars) {
    const mean = meanOver(spec, start, start + barLength);
    loudness.push(Number(decibels(mean.power).toFixed(1)));
    bands.push(mean.bands.map((value) => Number(decibels(value).toFixed(1))));
    const pitches = mean.chroma.reduce((sum, value) => sum + value, 0);
    chroma.push(
      mean.chroma.map((value) => Number((pitches > 0 ? value / pitches : 1 / 12).toFixed(3))),
    );
    const eighths: number[] = [];
    for (let step = 0; step < beatsPerBar * 2; step += 1) {
      const at = start + (step * barLength) / (beatsPerBar * 2);
      const peak = peakIn(strikes.all, strikes.rate, at - 0.03, at + 0.04) / strong;
      eighths.push(Number(Math.min(4, peak).toFixed(2)));
    }
    rhythm.push(eighths);
  }
  return { version: STRUCTURE_VERSION, loudness, bands, chroma, rhythm };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/**
 * How strongly the music changes at the start of each bar: the bars before
 * alike, the bars after alike, and the two unlike (over 4 and 8 bars), with
 * any step in loudness. 0 to 1, by bar.
 */
export function barNovelty(features: BarFeatures): number[] {
  const count = features.loudness.length;
  const similar = (a: number, b: number) => barSimilarity(features, a, b);
  const foote = new Array<number>(count).fill(0);
  const step = new Array<number>(count).fill(0);
  for (let bar = 1; bar < count; bar += 1) {
    let change = 0;
    let scales = 0;
    for (const width of [4, 8]) {
      const before = Math.min(width, bar);
      const after = Math.min(width, count - bar);
      if (before < 1 || after < 1) continue;
      let within = 0;
      let withinCount = 0;
      let across = 0;
      let acrossCount = 0;
      for (let p = bar - before; p < bar + after; p += 1) {
        for (let q = p + 1; q < bar + after; q += 1) {
          const value = similar(p, q);
          if (p < bar === q < bar) {
            within += value;
            withinCount += 1;
          } else {
            across += value;
            acrossCount += 1;
          }
        }
      }
      // A side of one bar has no pairs of its own: it counts as alike with itself.
      const alike = withinCount ? within / withinCount : 1;
      change += Math.max(0, alike - across / Math.max(1, acrossCount));
      scales += 1;
    }
    foote[bar] = scales ? change / scales : 0;
    const before = features.loudness.slice(Math.max(0, bar - 4), bar);
    const after = features.loudness.slice(bar, Math.min(count, bar + 4));
    step[bar] = Math.abs(powerMean(after) - powerMean(before));
  }
  // Bars that are 0.3 less alike across the line than either side is within
  // itself, or a step of 12 dB, are as large a change as there is.
  return foote.map((value, bar) =>
    Math.min(1, 0.55 * Math.min(1, value / 0.3) + 0.45 * Math.min(1, step[bar]! / 12)),
  );
}

/** Mean loudness of some bars in dB, averaged as power (a silent bar doesn't drag it to -100). */
function powerMean(loudness: number[]): number {
  if (!loudness.length) return -100;
  const mean = loudness.reduce((sum, value) => sum + 10 ** (value / 10), 0) / loudness.length;
  return decibels(mean);
}

/** How likely a section is to start on a bar, by where it falls in the phrase grid. */
function phraseWeight(bar: number, origin: number): number {
  const offset = (((bar - origin) % 16) + 16) % 16;
  if (offset === 0) return 1;
  if (offset === 8) return 0.92;
  if (offset % 4 === 0) return 0.85;
  if (offset % 2 === 0) return 0.6;
  return 0.45;
}

/** The bars sections start on (never the first), strongest changes first, on phrase lines where they can be. */
export function sectionStarts(novelty: number[]): number[] {
  const count = novelty.length;
  if (count < 8) return [];
  // The phrase grid's origin: the offset, among four, that the changes fall on most.
  let origin = 0;
  let originScore = -1;
  for (let candidate = 0; candidate < 4; candidate += 1) {
    let score = 0;
    for (let bar = candidate; bar < count; bar += 4) score += novelty[bar]! ** 2;
    if (score > originScore) {
      originScore = score;
      origin = candidate;
    }
  }
  const score = novelty.map((value, bar) => value * phraseWeight(bar, origin));
  const strongest = Math.max(0, ...score.slice(2, count - 1));
  if (strongest < 0.2) return [];
  const peaks: number[] = [];
  for (let bar = 2; bar < count - 1; bar += 1) {
    const value = score[bar]!;
    if (value < Math.max(0.3 * strongest, 0.2)) continue;
    let peak = true;
    for (let near = bar - 2; near <= bar + 2 && peak; near += 1) {
      if (near === bar || near < 0 || near >= count) continue;
      // Ties go to the earlier bar.
      if (score[near]! > value || (score[near] === value && near < bar)) peak = false;
    }
    if (peak) peaks.push(bar);
  }
  const most = Math.max(2, Math.min(16, Math.round(count / 6)));
  const chosen: number[] = [];
  for (const bar of peaks.sort((a, b) => score[b]! - score[a]!)) {
    if (chosen.length >= most) break;
    if (chosen.some((other) => Math.abs(other - bar) < 4)) continue;
    chosen.push(bar);
  }
  return chosen.sort((a, b) => a - b);
}

/** Names each section by its loudness (dB, a power mean over its bars) against its neighbours. */
export function nameSections(
  loudness: number[],
  rises: number[] = loudness.map(() => 0),
): SectionKind[] {
  const count = loudness.length;
  const kinds: SectionKind[] = loudness.map(() => "section");
  if (count < 2) return kinds;
  for (let index = 1; index < count; index += 1) {
    const here = loudness[index]!;
    const before = loudness[index - 1]!;
    const after = loudness[index + 1];
    if (after !== undefined && here <= before - 6 && here <= after - 6) kinds[index] = "breakdown";
  }
  const top = Math.max(...loudness);
  const bottom = Math.min(...loudness);
  const range = Math.max(1e-6, top - bottom);
  for (let index = 1; index < count; index += 1) {
    if (kinds[index] === "breakdown") continue;
    const rise = loudness[index]! - loudness[index - 1]!;
    if (kinds[index - 1] === "breakdown" && rise >= 6) kinds[index] = "reentry";
    else if (rise >= 6 && (loudness[index]! - bottom) / range >= 0.6) kinds[index] = "drop";
  }
  // A section that climbs into a drop or a re-entry builds to it.
  for (let index = 1; index < count - 1; index += 1) {
    const next = kinds[index + 1];
    if (kinds[index] === "section" && (next === "drop" || next === "reentry") && rises[index]! >= 3)
      kinds[index] = "build";
  }
  if (loudness[0]! <= loudness[1]! - 3 || kinds[1] === "drop" || kinds[1] === "build")
    kinds[0] = "intro";
  if (
    count > 2 &&
    kinds[count - 1] === "section" &&
    loudness[count - 1]! <= loudness[count - 2]! - 3
  )
    kinds[count - 1] = "outro";
  return kinds;
}

/* ------------------------------------------------------------------ */
/* The whole analysis                                                  */
/* ------------------------------------------------------------------ */

/**
 * The bars and sections of a mono signal, with each bar's features, or null
 * when it has no steady beat or is too short to have bars. Uses `beats` when
 * the track's beat grid is already known.
 */
export function analyzeStructure(
  samples: Float32Array,
  sampleRate: number,
  beats: BeatAnalysis | null = null,
): { structure: MusicStructure; features: BarFeatures } | null {
  const tracked = beats ?? analyzeBeats(samples, sampleRate);
  if (!tracked || tracked.beats.length < 8 || tracked.confidence < 0.15) return null;
  const duration = samples.length / sampleRate;
  const strikes = strikeEnvelopes(samples, sampleRate);
  const moved = beatsOnAttacks(samples, sampleRate, tracked.beats, strikes);
  // A pulse with hardly a beat struck on it (a held chord whose tones beat
  // against each other, say) is no beat to find bars in.
  if (moved.attacks < tracked.beats.length * 0.2) return null;
  const { period } = moved;
  const grid = { ...tracked, beats: moved.beats };
  if (grid.beats.length < 8) return null;
  const spec = spectrum(samples, sampleRate);
  if (spec.frames < 4) return null;

  // Four beats a bar unless the track is clearly in threes.
  const features = beatFeatures(grid.beats, spec, strikes);
  const fours = phaseScores(features, 4);
  const threes = phaseScores(features, 3);
  const bestFour = Math.max(...fours);
  const bestThree = Math.max(...threes);
  const beatsPerBar = bestThree > 0.6 && bestThree > bestFour * 1.35 ? 3 : 4;
  const scores = beatsPerBar === 3 ? threes : fours;
  const phase = scores.indexOf(Math.max(...scores));
  const ranked = [...scores].sort((a, b) => b - a);
  const phaseConfidence = Math.max(
    0,
    Math.min(1, (ranked[0]! - (ranked[1] ?? 0)) / Math.max(0.5, Math.abs(ranked[0]!))),
  );

  const downbeats: number[] = [];
  const bars: number[] = [];
  const barLength = beatsPerBar * period;
  for (let index = phase; index < grid.beats.length; index += beatsPerBar) {
    if (downbeats.length >= LIMITS.bars) break;
    const start = grid.beats[index]!;
    downbeats.push(start);
    // A whole bar: all its beats on the grid, and its end inside the track.
    if (index + beatsPerBar <= grid.beats.length && start + barLength <= duration + period * 0.5)
      bars.push(start);
  }
  if (bars.length < 2) return null;
  const barFeatureSet = barFeatures(bars, barLength, beatsPerBar, spec, strikes);

  // Sections from the bars: where they start, and how loud each is.
  const starts = sectionStarts(barNovelty(barFeatureSet));
  const edges = [0, ...starts, bars.length];
  const loudness: number[] = [];
  const rises: number[] = [];
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const own = barFeatureSet.loudness.slice(edges[index]!, edges[index + 1]!);
    loudness.push(powerMean(own));
    const head = own.slice(0, 2);
    const tail = own.slice(-2);
    rises.push(own.length >= 4 ? powerMean(tail) - powerMean(head) : 0);
  }
  const kinds = nameSections(loudness, rises);
  const top = Math.max(...loudness);
  const bottom = Math.min(...loudness);
  const sections: MusicSection[] = kinds.map((kind, index) => ({
    start: index === 0 ? 0 : bars[edges[index]!]!,
    end: index === kinds.length - 1 ? Number(duration.toFixed(3)) : bars[edges[index + 1]!]!,
    kind,
    energy: Number(
      (top - bottom > 1e-6 ? (loudness[index]! - bottom) / (top - bottom) : 1).toFixed(2),
    ),
  }));

  return {
    structure: {
      bpm: Number((60 / period).toFixed(2)),
      beats: grid.beats,
      beatsPerBar,
      downbeats,
      bars,
      sections,
      confidence: Number((grid.confidence * (0.5 + 0.5 * phaseConfidence)).toFixed(2)),
    },
    features: barFeatureSet,
  };
}

/** The section a time falls in, or null outside the track. */
export function sectionAt(structure: Pick<MusicStructure, "sections">, time: number) {
  return structure.sections.find((section) => time >= section.start && time < section.end) ?? null;
}

/** The index in `bars` of the bar a time falls in (the last bar for times after it; -1 before the first). */
export function barAt(structure: Pick<MusicStructure, "bars">, time: number): number {
  let low = 0;
  let high = structure.bars.length - 1;
  if (high < 0 || time < structure.bars[0]!) return -1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (structure.bars[middle]! <= time + 1e-9) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Seconds a bar lasts, from the beat grid. */
export function barSeconds(structure: Pick<MusicStructure, "beats" | "beatsPerBar">): number {
  const { beats } = structure;
  const period = beats.length > 1 ? (beats.at(-1)! - beats[0]!) / (beats.length - 1) : 0.5;
  return period * structure.beatsPerBar;
}
