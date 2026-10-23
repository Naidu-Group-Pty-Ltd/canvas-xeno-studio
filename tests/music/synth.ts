/**
 * Synthetic music for the structure tests: kicks, hats, a bass and chords laid
 * on a known beat grid, so where the bars and sections are is known exactly.
 * Deterministic (the noise is seeded).
 */
export const RATE = 22050;

export class Track {
  readonly samples: Float32Array;
  private seed = 1;

  constructor(seconds: number) {
    this.samples = new Float32Array(Math.round(seconds * RATE));
  }

  private noise(): number {
    // A small linear congruential generator: the same "random" hats every run.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 2 ** 31 - 1;
  }

  private add(at: number, length: number, sample: (t: number) => number) {
    const first = Math.max(0, Math.round(at * RATE));
    const last = Math.min(this.samples.length, Math.round((at + length) * RATE));
    for (let index = first; index < last; index += 1) {
      this.samples[index]! += sample(index / RATE - at);
    }
  }

  /** A kick: a sine falling from 120 to 50 Hz, dying away over a few tenths of a second. */
  kick(at: number, level: number) {
    this.add(at, 0.4, (t) => {
      const phase = 2 * Math.PI * (50 * t + 70 * 0.03 * (1 - Math.exp(-t / 0.03)));
      return level * Math.sin(phase) * Math.exp(-t / 0.09);
    });
  }

  /** A hat: a short burst of bright noise. */
  hat(at: number, level: number) {
    let last = 0;
    this.add(at, 0.06, (t) => {
      const white = this.noise();
      const bright = white - last;
      last = white;
      return level * bright * Math.exp(-t / 0.015);
    });
  }

  /** A held note (sines at the frequencies given), with a soft start and end. */
  tone(at: number, length: number, frequencies: number[], level: number) {
    this.add(at, length, (t) => {
      const edge = Math.min(1, t / 0.01, (length - t) / 0.01);
      let sum = 0;
      for (const hz of frequencies) sum += Math.sin(2 * Math.PI * hz * t);
      return (level * edge * sum) / frequencies.length;
    });
  }
}

/** Chords that change every bar: C, F, G, A minor. */
export const CHORDS = [
  [261.63, 329.63, 392.0],
  [349.23, 440.0, 523.25],
  [392.0, 493.88, 587.33],
  [440.0, 523.25, 659.25],
];
export const ROOTS = [65.41, 87.31, 98.0, 110.0];

/**
 * Reel 1's track as pacing.py measured it (National Treasures, which isn't in
 * the repository): one beat every 0.465141 s (128.99 BPM), four to a bar,
 * beat 0 the drop at 22.255 s. The intro carries a note on every bar line and
 * no drums, and falls silent from 21.0 s to the drop; the groove runs bars 0
 * to 31, thins for bars 32 to 39, breaks down at bar 40 with a faint figure
 * at the end of every second bar, and comes back at bar 48. What comes after
 * isn't recorded: here the groove runs to bar 64, then an eight-bar outro.
 */
export const REEL_ONE = {
  period: 0.46514101885610903,
  drop: 22.29489162418665 - 0.04004,
  beatsPerBar: 4,
} as const;

/** The time of the file's bar `bar` (0 is the drop) in Reel 1's track. */
export function reelOneBar(bar: number): number {
  return REEL_ONE.drop + bar * REEL_ONE.beatsPerBar * REEL_ONE.period;
}

export function reelOneTrack(): Track {
  const track = new Track(reelOneBar(72) + 2);
  const grid = { first: REEL_ONE.drop, period: REEL_ONE.period, beatsPerBar: 4 };
  // The intro: a chord struck on every bar line, dying away, no drums.
  for (let bar = -12; bar < 0; bar += 1) {
    const at = reelOneBar(bar);
    if (at < 0) continue;
    const length = Math.min(4 * REEL_ONE.period, 21 - at);
    if (length <= 0.05) continue;
    const chord = CHORDS[((bar % 4) + 4) % 4]!;
    for (const [index, hz] of chord.entries())
      track.tone(at, length, [hz, hz * 2], 0.08 / (index + 1));
  }
  groove(track, grid, 0, 32, 1);
  // Thinner: the kick and bass carry on, the hats and most of the chords drop out.
  for (let bar = 32; bar < 40; bar += 1) {
    const start = reelOneBar(bar);
    const chord = ((bar % 4) + 4) % 4;
    track.tone(start, 4 * REEL_ONE.period, [ROOTS[chord]!], 0.3);
    track.tone(start, 4 * REEL_ONE.period, CHORDS[chord]!, 0.12);
    for (let beat = 0; beat < 4; beat += 1)
      track.kick(start + beat * REEL_ONE.period, beat === 0 ? 0.7 : 0.45);
  }
  // The breakdown: a quiet pad, and a faint figure ending every second bar.
  for (let bar = 40; bar < 48; bar += 1) {
    const start = reelOneBar(bar);
    track.tone(start, 4 * REEL_ONE.period, CHORDS[((bar % 4) + 4) % 4]!, 0.05);
    if (bar % 2 === 1)
      for (let step = 0; step < 4; step += 1)
        track.tone(start + (2 + step * 0.5) * REEL_ONE.period, 0.18, [880 + 110 * step], 0.03);
  }
  groove(track, grid, 48, 64, 1);
  groove(track, grid, 64, 72, 0.12, { drums: false });
  return track;
}

/** Fills bars [from, to) of a grid with a groove at `level` (0 for silence): drums, bass and chords. */
export function groove(
  track: Track,
  grid: { first: number; period: number; beatsPerBar: number },
  from: number,
  to: number,
  level: number,
  options: { drums?: boolean; accent?: number; chordLevel?: number } = {},
) {
  const { first, period, beatsPerBar } = grid;
  const drums = options.drums ?? true;
  const accent = options.accent ?? 1.4;
  const chordLevel = options.chordLevel ?? 0.35;
  for (let bar = from; bar < to; bar += 1) {
    const start = first + bar * beatsPerBar * period;
    if (start < 0) continue;
    const chord = ((bar % 4) + 4) % 4;
    track.tone(start, beatsPerBar * period, CHORDS[chord]!, level * chordLevel);
    track.tone(start, beatsPerBar * period, [ROOTS[chord]!], level * 0.3);
    if (!drums) continue;
    for (let beat = 0; beat < beatsPerBar; beat += 1) {
      const at = start + beat * period;
      track.kick(at, level * (beat === 0 ? accent : 1) * 0.6);
      track.hat(at + period / 2, level * 0.25);
    }
  }
}
