import { describe, expect, test } from "bun:test";
import {
  cutFrameIndex,
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
      const lips = clip.start + tau - (clip.offsetSeconds ?? 0);
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

  test("takes the next clip's first frame from just after the last one shown", () => {
    expect(cutFrameIndex({ start: 0, end: grid(7.41), offsetSeconds: null }, 30)).toBe(
      Math.round(7.41 * 30),
    );
    expect(cutFrameIndex({ start: 0, end: 7.4, offsetSeconds: 0.1 }, 30)).toBe(225);
    expect(cutFrameIndex({ start: 0, end: 7.4, offsetSeconds: 0 }, 24)).toBe(178);
  });
});
