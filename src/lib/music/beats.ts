/**
 * Beat tracking for music beds, and snapping an edit's cuts to the beat.
 *
 * Tempo comes from the autocorrelation of an onset envelope (how sharply the
 * loudness rises, frame by frame), weighted towards common tempos; the beat
 * grid is then placed where the onsets line up best. This suits the steady
 * tempos of stock, AI and pop music, which is what reels are cut to.
 */
import {
  audioLoops,
  layoutTimeline,
  LIMITS,
  maxClipDuration,
  updateClip,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { musicPieces } from "@/lib/edit/pieces";
import { audioSpans, timesOnTimeline } from "./on-timeline";

export interface BeatAnalysis {
  bpm: number;
  /** Beat times in seconds from the start of the track. */
  beats: number[];
  /** 0–1: how clearly one tempo stands out. */
  confidence: number;
}

const FRAME_RATE = 100; // onset frames per second
const MIN_BPM = 60;
const MAX_BPM = 200;

/** Frames per second of the onset envelope for a sample rate (about 100). */
export function onsetFrameRate(sampleRate: number): number {
  return sampleRate / Math.max(1, Math.round(sampleRate / FRAME_RATE));
}

/** Onset strength per frame (half-wave rectified rise in log energy, de-meaned). */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / FRAME_RATE));
  const frames = Math.floor(samples.length / hop);
  const energy = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    // Broadband energy, so the kick and snare (which carry the beat) count
    // more than quieter off-beat hats.
    let sum = 0;
    const start = frame * hop;
    for (let index = start; index < start + hop; index += 1)
      sum += samples[index]! * samples[index]!;
    energy[frame] = Math.log1p(1000 * (sum / hop));
  }
  const onset = new Float32Array(frames);
  for (let frame = 1; frame < frames; frame += 1) {
    onset[frame] = Math.max(0, energy[frame]! - energy[frame - 1]!);
  }
  // Remove the local average so steady loudness doesn't count as onsets.
  const radius = Math.round(onsetFrameRate(sampleRate) * 0.15);
  const out = new Float32Array(frames);
  let windowSum = 0;
  let windowCount = 0;
  for (let frame = -radius; frame < frames; frame += 1) {
    const enter = frame + radius;
    if (enter < frames) {
      windowSum += onset[enter]!;
      windowCount += 1;
    }
    const leave = frame - radius - 1;
    if (leave >= 0) {
      windowSum -= onset[leave]!;
      windowCount -= 1;
    }
    if (frame >= 0) out[frame] = Math.max(0, onset[frame]! - windowSum / windowCount);
  }
  return out;
}

/** Tempo and beat grid of a mono signal, or null when there's no clear pulse. */
export function analyzeBeats(samples: Float32Array, sampleRate: number): BeatAnalysis | null {
  const raw = onsetEnvelope(samples, sampleRate);
  const rate = onsetFrameRate(sampleRate);
  const frames = raw.length;
  if (frames < rate * 3) return null;
  let strongest = 0;
  for (const value of raw) strongest = Math.max(strongest, value);
  if (strongest < 0.1) return null; // steady sound: no pulse to follow

  // A little smoothing makes the envelope a continuous function of time.
  const kernel = [0.05, 0.25, 0.4, 0.25, 0.05];
  const onset = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let tap = -2; tap <= 2; tap += 1) sum += (raw[frame + tap] ?? 0) * kernel[tap + 2]!;
    onset[frame] = sum;
  }
  const at = (position: number) => {
    const low = Math.floor(position);
    const weight = position - low;
    return (onset[low] ?? 0) * (1 - weight) + (onset[low + 1] ?? 0) * weight;
  };

  const minLag = Math.floor((60 * rate) / MAX_BPM);
  const maxLag = Math.ceil((60 * rate) / MIN_BPM);
  const correlate = (lag: number) => {
    let sum = 0;
    for (let frame = 0; frame + lag < frames; frame += 1)
      sum += onset[frame]! * onset[frame + lag]!;
    return sum / (frames - lag);
  };
  const energy = correlate(0);
  if (energy <= 0) return null;

  // Prefer tempos near 120 BPM a little, which settles half/double-time ambiguity.
  const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.1) ** 2);
  let bestLag = 0;
  let bestScore = 0;
  let clarity = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const value = correlate(lag);
    const score = value * prior((60 * rate) / lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
      clarity = value / energy;
    }
  }
  if (!bestLag) return null;
  const confidence = Math.max(0, Math.min(1, clarity * 1.5));

  // Coarse grid: the period and phase whose comb collects the most onset energy.
  const comb = (period: number, phase: number) => {
    let sum = 0;
    for (let beat = phase; beat < frames - 1; beat += period) sum += at(beat);
    return sum;
  };
  let period = bestLag;
  let phase = 0;
  let gridScore = -1;
  for (let candidate = bestLag - 0.75; candidate <= bestLag + 0.75; candidate += 0.05) {
    for (let offset = 0; offset < candidate; offset += 0.5) {
      const score = comb(candidate, offset);
      if (score > gridScore) {
        gridScore = score;
        period = candidate;
        phase = offset;
      }
    }
  }

  // Fine grid: fit a straight line through the onset peak nearest each beat,
  // weighted by how strong it is, so small timing errors don't add up.
  for (let pass = 0; pass < 2; pass += 1) {
    let sw = 0;
    let sk = 0;
    let st = 0;
    let skk = 0;
    let skt = 0;
    const reach = period * 0.2;
    for (let index = 0; phase + index * period < frames; index += 1) {
      const predicted = phase + index * period;
      let weight = 0;
      let centre = 0;
      for (let frame = Math.ceil(predicted - reach); frame <= predicted + reach; frame += 1) {
        const value = onset[frame] ?? 0;
        weight += value;
        centre += value * frame;
      }
      if (weight <= 0) continue;
      const observed = centre / weight;
      sw += weight;
      sk += weight * index;
      st += weight * observed;
      skk += weight * index * index;
      skt += weight * index * observed;
    }
    const denominator = sw * skk - sk * sk;
    if (sw <= 0 || Math.abs(denominator) < 1e-9) break;
    const slope = (sw * skt - sk * st) / denominator;
    if (slope < period * 0.9 || slope > period * 1.1) break;
    period = slope;
    phase = (st - slope * sk) / sw;
    while (phase - period >= 0) phase -= period;
    while (phase < 0) phase += period;
  }

  const beats: number[] = [];
  for (let beat = phase; beat < frames; beat += period) {
    beats.push(Number((beat / rate).toFixed(3)));
  }
  return {
    bpm: Number(((60 * rate) / period).toFixed(1)),
    beats,
    confidence: Number(confidence.toFixed(2)),
  };
}

/**
 * Where a music item's beats fall on the edit's timeline. Like the render and
 * the preview, the first pass plays from the trim point to the end of the
 * source, and a loop then repeats the whole source from its start; music
 * edited on its bars plays its pieces in order.
 */
export function beatTimesOnTimeline(item: TimelineAudio, beats: number[], total: number): number[] {
  if (musicPieces(item)) return timesOnTimeline(audioSpans(item, total), beats);
  const length = item.sourceDuration ?? null;
  const plays = Math.min(item.duration ?? Infinity, total - item.start);
  const times: number[] = [];
  const add = (offset: number) => {
    if (offset >= 0 && offset <= plays + 1e-6) times.push(Number((item.start + offset).toFixed(3)));
  };
  for (const beat of beats) {
    if (beat >= item.trimStart && (length === null || beat < length)) add(beat - item.trimStart);
  }
  if (audioLoops(item) && length) {
    const firstPass = Math.max(0.01, length - item.trimStart);
    for (let pass = firstPass; pass < plays; pass += length) {
      for (const beat of beats) if (beat < length) add(pass + beat);
    }
  }
  return [...new Set(times)].sort((a, b) => a - b);
}

/** Where a clip's cut falls: the midpoint of the transition out of it, else its end. */
function cutAfter(layout: TimelineLayout, index: number): number {
  const entry = layout.clips[index]!;
  const next = layout.clips[index + 1];
  return next ? entry.end - next.transitionIn / 2 : entry.end;
}

/**
 * Moves each cut to the nearest beat by lengthening or shortening the clip
 * before it (a transition's midpoint counts as its cut). Clips keep at least
 * `minClip` seconds and never run past their footage, and the edit never
 * grows past the render limit. The final frame lands on a beat too, when one
 * is close.
 *
 * A clip's length can also change the transitions either side of it, since
 * they are shortened to fit their clips: a transition held short by this clip
 * grows with it, moving its midpoint by only half as much. So each length is
 * tried in the layout as it would then be. The cut must land on the beat
 * (within half a frame), and the clip must still start where it did, so cuts
 * already on the beat stay there. A cut that can't be placed that way stays
 * where it is.
 *
 * Given `bars` (the bar lines on the timeline), a cut prefers them: it moves
 * onto a bar line within reach before it would move onto a beat, and a cut
 * already on a beat moves only onto a bar line.
 */
export function snapCutsToBeats(
  timeline: Timeline,
  beatTimes: number[],
  options: { minClip?: number; maxShift?: number; bars?: number[] } = {},
): { timeline: Timeline; moved: number } {
  const minClip = options.minClip ?? 0.4;
  const spacing =
    beatTimes.length > 1 ? (beatTimes.at(-1)! - beatTimes[0]!) / (beatTimes.length - 1) : 1;
  const maxShift = options.maxShift ?? Math.max(0.15, spacing * 0.75);
  const fps = timeline.fps;
  const onBeat = 0.5 / fps + 1e-9;
  // A cut moves at least half as far as its clip's length changes.
  const reach = Math.ceil(2 * maxShift * fps) + 1;
  let result = timeline;
  let moved = 0;
  for (let index = 0; index < result.clips.length; index += 1) {
    const layout = layoutTimeline(result);
    const cut = cutAfter(layout, index);
    const start = layout.clips[index]!.start;
    const clip = result.clips[index]!;
    const ceiling = maxClipDuration(clip);
    const frames = Math.round(clip.duration * fps);
    const nearby = (times: number[]) =>
      times
        .filter((time) => Math.abs(time - cut) <= maxShift)
        .sort((a, b) => Math.abs(a - cut) - Math.abs(b - cut));
    const beats = nearby(beatTimes);
    const bars = options.bars ? nearby(options.bars) : [];
    const onBar = bars.length > 0 && Math.abs(bars[0]! - cut) < onBeat;
    const onAnyBeat = beats.length > 0 && Math.abs(beats[0]! - cut) < onBeat;
    if (onBar || (onAnyBeat && !bars.length) || (!beats.length && !bars.length)) continue;
    const targets = onAnyBeat ? bars : [...bars, ...beats];
    let best: { duration: number; miss: number } | null = null;
    for (const beat of targets) {
      for (let count = frames - reach; count <= frames + reach; count += 1) {
        const duration = Number((count / fps).toFixed(3));
        if (count === frames || count < 2 || duration < minClip || duration > ceiling + 1e-6)
          continue;
        const laid = layoutTimeline(updateClip(result, clip.id, { duration }));
        if (Math.abs(laid.clips[index]!.start - start) > 1e-9) continue;
        if (laid.total > layout.total && laid.total > LIMITS.totalSeconds + 1e-6) continue;
        const miss = Math.abs(cutAfter(laid, index) - beat);
        if (miss < onBeat && (!best || miss < best.miss)) best = { duration, miss };
      }
      if (best) break;
    }
    if (!best) continue;
    result = updateClip(result, clip.id, { duration: best.duration });
    moved += 1;
  }
  return { timeline: result, moved };
}
