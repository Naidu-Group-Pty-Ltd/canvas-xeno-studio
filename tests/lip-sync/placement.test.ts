import { describe, expect, test } from "bun:test";
import {
  cutFrameIndex,
  effectiveOffset,
  placeSyncedClips,
  type SyncedClipInput,
} from "../../src/lib/lip-sync/placement";

const FPS = 30;

/**
 * The promise: at every moment a clip is on screen, the moment of speech its
 * lips show is the moment of the voiceover playing. A clip's lips at its own
 * time τ show the voiceover at (its piece's start + τ − its offset); the
 * voiceover at edit time t plays (its trimStart + t).
 */
function lipError(clips: SyncedClipInput[], fps = FPS) {
  const placement = placeSyncedClips({ clips, fps });
  let worst = 0;
  placement.clips.forEach((placed, index) => {
    const clip = clips[index]!;
    for (let frame = 0; frame < placed.frames; frame += 1) {
      const t = placed.start + frame / fps;
      const tau = placed.trimStart + (t - placed.start);
      const lips = clip.start + tau - (clip.offsetSeconds ?? 0) + (clip.lipLeadSeconds ?? 0);
      const heard = placement.voiceover.trimStart + t;
      worst = Math.max(worst, Math.abs(lips - heard));
    }
  });
  return { placement, worst };
}

const grid = (seconds: number) => Math.round(seconds * FPS) / FPS;

describe("laying clips made to a voiceover in an edit", () => {
  const pieces: [number, number][] = [
    [0, grid(7.41)],
    [grid(7.41), grid(15.23)],
    [grid(15.23), grid(19.9)],
    [grid(19.9), 26.4371],
  ];
  const clipsWith = (offsets: (number | null)[]): SyncedClipInput[] =>
    pieces.map(([start, end], index) => ({
      start,
      end,
      offsetSeconds: offsets[index] ?? null,
      sourceSeconds: Math.ceil(end - start + 0.25),
    }));

  test("puts each clip exactly where its piece starts, and the lips on the voice", () => {
    const { placement, worst } = lipError(clipsWith([null, null, null, null]));
    expect(worst).toBeLessThan(1e-6);
    placement.clips.forEach((placed, index) => {
      expect(placed.start).toBeCloseTo(pieces[index]![0], 6);
      expect(placed.trimStart).toBe(0);
      expect(placed.errorSeconds).toBe(0);
    });
    expect(placement.voiceover).toEqual({ start: 0, trimStart: 0 });
    // The edit runs to the voiceover's last whole frame.
    expect(placement.totalFrames).toBe(Math.round(26.4371 * FPS));
  });

  test("starts a clip with its speech late that much further in", () => {
    const { placement, worst } = lipError(clipsWith([0, 0.12, 0.033, 0]));
    expect(worst).toBeLessThan(1e-6);
    expect(placement.clips[1]!.trimStart).toBeCloseTo(0.12, 6);
    expect(placement.clips[1]!.start).toBeCloseTo(pieces[1]![0], 6);
  });

  test("starts a clip with its speech early a little later, the one before playing on", () => {
    const offsets = [0, 0, -0.05, 0];
    const { placement, worst } = lipError(clipsWith(offsets));
    expect(worst).toBeLessThan(1e-6);
    const early = placement.clips[2]!;
    // Two frames later (50 ms rounds up to 2 frames at 30 fps), trimmed by what's over.
    expect(early.start).toBeCloseTo(pieces[2]![0] + 2 / FPS, 6);
    expect(early.trimStart).toBeCloseTo(2 / FPS - 0.05, 6);
    expect(placement.clips[1]!.end).toBeCloseTo(early.start, 9);
  });

  test("starts the edit a little into the voiceover when the first clip's speech is early", () => {
    const { placement, worst } = lipError(clipsWith([-0.02, 0.01, 0, -0.07]));
    expect(worst).toBeLessThan(1e-6);
    expect(placement.voiceover.trimStart).toBeCloseTo(1 / FPS, 6);
    expect(placement.clips[0]!.trimStart).toBeCloseTo(1 / FPS - 0.02, 6);
  });

  test("never builds up rounding, at a frame rate the cuts weren't planned on", () => {
    const { worst } = lipError(clipsWith([0, 0, 0, 0]), 24);
    // At most half a frame at 24 fps, wherever in the edit.
    expect(worst).toBeLessThanOrEqual(0.5 / 24 + 1e-9);
  });

  test("says when a clip runs short of its place", () => {
    const clips = clipsWith([0, 0.4, 0, 0]);
    clips[1] = { ...clips[1]!, sourceSeconds: clips[1]!.end - clips[1]!.start + 0.1 };
    const { placement } = lipError(clips);
    expect(placement.clips[1]!.shortSeconds).toBeCloseTo(0.3, 6);
  });

  test("plays a last clip made to end on a frame out to its own end, the rest as they were", () => {
    const clips = clipsWith([0, 0.12, 0, 0.1]);
    const plain = placeSyncedClips({ clips, fps: FPS });
    const placement = placeSyncedClips({ clips, fps: FPS, playOutLast: true });
    expect(placement.clips.slice(0, 3)).toEqual(plain.clips.slice(0, 3));
    const last = placement.clips[3]!;
    // Its 7 s, less the 0.1 s its speech came late, to its last whole frame.
    expect(last.start).toBeCloseTo(plain.clips[3]!.start, 9);
    expect(last.trimStart).toBeCloseTo(0.1, 6);
    expect(last.frames).toBe(Math.floor((7 - 0.1) * FPS));
    expect(last.shortSeconds).toBe(0);
    expect(placement.totalFrames).toBeGreaterThan(plain.totalFrames);
    expect(placement.voiceover).toEqual(plain.voiceover);
  });

  test("never plays a last clip out past what the edit may run to", () => {
    const clips = clipsWith([0, 0, 0, 0]);
    const plain = placeSyncedClips({ clips, fps: FPS });
    const capped = placeSyncedClips({ clips, fps: FPS, playOutLast: true, maxTotalSeconds: 26.6 });
    expect(capped.totalFrames).toBe(Math.floor(26.6 * FPS));
    // A cap inside the voiceover never cuts it short: only the play-out is held back.
    const tight = placeSyncedClips({ clips, fps: FPS, playOutLast: true, maxTotalSeconds: 20 });
    expect(tight.totalFrames).toBe(plain.totalFrames);
  });

  test("never plays a last clip out shorter than its piece, nor without its length", () => {
    const clips = clipsWith([0, 0, 0, 0]);
    const plain = placeSyncedClips({ clips, fps: FPS });
    const unknown = clips.map((clip, index) =>
      index === 3 ? { ...clip, sourceSeconds: null } : clip,
    );
    expect(placeSyncedClips({ clips: unknown, fps: FPS, playOutLast: true })).toEqual(
      placeSyncedClips({ clips: unknown, fps: FPS }),
    );
    // A clip that came back no longer than its piece keeps its place.
    const short = clips.map((clip, index) =>
      index === 3 ? { ...clip, sourceSeconds: clip.end - clip.start } : clip,
    );
    expect(placeSyncedClips({ clips: short, fps: FPS, playOutLast: true }).totalFrames).toBe(
      plain.totalFrames,
    );
  });

  test("takes the next clip's first frame from just after the last one shown", () => {
    expect(cutFrameIndex({ start: 0, end: grid(7.41), offsetSeconds: null }, 30)).toBe(
      Math.round(7.41 * 30),
    );
    expect(cutFrameIndex({ start: 0, end: 7.4, offsetSeconds: 0.1 }, 30)).toBe(225);
    expect(cutFrameIndex({ start: 0, end: 7.4, offsetSeconds: 0 }, 24)).toBe(178);
  });
});

describe("cuts kept to six decimals, and lips that lead their sound", () => {
  // As a run stores them: 245/30 is kept as 8.166667, a third of a microsecond late.
  const stored = (frame: number) => Number((frame / FPS).toFixed(6));
  const pieces: [number, number][] = [
    [0, stored(245)],
    [stored(245), stored(522)],
    [stored(522), stored(808)],
  ];
  const clips = (extra: Partial<SyncedClipInput>[] = []): SyncedClipInput[] =>
    pieces.map(([start, end], index) => ({
      start,
      end,
      offsetSeconds: 0,
      sourceSeconds: end - start + 0.5,
      ...(extra[index] ?? {}),
    }));

  test("lays every clip on its own frame, never a frame late and trimmed", () => {
    const placement = placeSyncedClips({ clips: clips(), fps: FPS });
    expect(placement.clips.map((placed) => Math.round(placed.start * FPS))).toEqual([0, 245, 522]);
    for (const placed of placement.clips) {
      expect(placed.trimStart).toBe(0);
      expect(placed.errorSeconds).toBe(0);
    }
    expect(placement.voiceover.trimStart).toBe(0);
  });

  test("lays a clip whose lips lead by a frame a frame later, its lips on the voice", () => {
    const lead = 1 / FPS;
    const input = clips([{}, { lipLeadSeconds: lead }, {}]);
    const { placement, worst } = lipError(input);
    expect(worst).toBeLessThan(ON_GRID);
    expect(Math.round(placement.clips[1]!.start * FPS)).toBe(246);
    expect(placement.clips[1]!.trimStart).toBe(0);
    // The clip before plays on for that frame.
    expect(placement.clips[0]!.frames).toBe(246);
  });

  test("starts the edit a frame into the voiceover when the first clip's lips lead", () => {
    const input = clips([{ lipLeadSeconds: 1 / FPS }, {}, {}]);
    const { placement, worst } = lipError(input);
    expect(worst).toBeLessThan(ON_GRID);
    expect(placement.voiceover.trimStart).toBeCloseTo(1 / FPS, 6);
    expect(placement.clips[0]!.trimStart).toBe(0);
  });

  test("folds the lead into the measured offset, believing neither past the limit", () => {
    expect(effectiveOffset({ offsetSeconds: 0.1, lipLeadSeconds: 0.04 })).toBeCloseTo(0.06, 9);
    expect(effectiveOffset({ offsetSeconds: null, lipLeadSeconds: 0.04 })).toBeCloseTo(-0.04, 9);
    expect(effectiveOffset({ offsetSeconds: 0.9, lipLeadSeconds: 0.04 }, 0.5)).toBeCloseTo(
      -0.04,
      9,
    );
    expect(effectiveOffset({ offsetSeconds: 0.04, lipLeadSeconds: 0.04 })).toBe(0);
    expect(effectiveOffset({ offsetSeconds: 3e-7 })).toBe(0);
  });
});

/** Within rounding of a frame boundary (cuts kept to six decimals). */
const ON_GRID = 1e-5;
