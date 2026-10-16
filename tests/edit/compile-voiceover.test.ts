import { describe, expect, test } from "bun:test";
import { compileFromVoiceoverLongVideo, type VoiceoverClipCut } from "../../src/lib/edit/compile";
import { layoutTimeline } from "../../src/lib/edit/timeline";

const FPS = 30;
const grid = (seconds: number) => Math.round(seconds * FPS) / FPS;
const pieces: [number, number][] = [
  [0, grid(7.41)],
  [grid(7.41), grid(15.23)],
  [grid(15.23), grid(19.9)],
  [grid(19.9), 26.4371],
];
const ids = ["a", "b", "c", "d"].map((letter) => `${letter.repeat(8)}-1111-4111-8111-111111111111`);
const assets = ids.map((id, index) => ({
  id,
  durationSeconds: Math.ceil(pieces[index]![1] - pieces[index]![0] + 0.25),
  width: 1280,
  height: 720,
}));
const voiceAsset = "99999999-1111-4111-8111-111111111111";

function cuts(offsets: (number | null)[], present = [true, true, true, true]): VoiceoverClipCut[] {
  return pieces.map(([start, end], index) => ({
    position: index,
    assetId: present[index] ? ids[index]! : null,
    audioStart: start,
    audioEnd: end,
    offsetSeconds: offsets[index] ?? null,
    lengthSeconds: assets[index]!.durationSeconds,
  }));
}

const voiceover = {
  assetId: voiceAsset,
  durationSeconds: 26.4371,
  fps: FPS,
  title: "Voiceover · Launch",
  words: [
    { text: "Meet", start: 0.4, end: 0.7 },
    { text: "the", start: 0.75, end: 0.85 },
    { text: "new", start: 0.9, end: 1.1 },
    { text: "range.", start: 1.15, end: 1.6 },
  ],
};

describe("a long video made to a voiceover, in the Editor", () => {
  test("starts every clip where its piece of the voiceover starts, to the frame, its sound muted", () => {
    const { timeline, missing } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: { aspect_ratio: "16:9" } },
      cuts([null, null, null, null]),
      assets,
      voiceover,
      { keepSound: false, captions: false },
    );
    expect(missing).toEqual([]);
    expect(timeline.fps).toBe(30);
    const layout = layoutTimeline(timeline);
    layout.clips.forEach((laid, index) => {
      expect(Math.round(laid.start * FPS)).toBe(Math.round(pieces[index]![0] * FPS));
      expect(laid.clip.trimStart).toBe(0);
      expect(laid.clip.volume).toBe(0);
      expect(laid.clip.transition.type).toBe("cut");
    });
    expect(layout.totalFrames).toBe(Math.round(26.4371 * FPS));
    expect(timeline.audio).toHaveLength(1);
    const voice = timeline.audio[0]!;
    expect(voice).toMatchObject({
      assetId: voiceAsset,
      role: "voiceover",
      start: 0,
      trimStart: 0,
      duration: null,
    });
  });

  test("starts a clip whose speech came late that much further in", () => {
    const { timeline } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      cuts([0, 0.12, null, 0.04]),
      assets,
      voiceover,
      { keepSound: false, captions: false },
    );
    const layout = layoutTimeline(timeline);
    expect(layout.clips[1]!.clip.trimStart).toBeCloseTo(0.12, 6);
    expect(Math.round(layout.clips[1]!.start * FPS)).toBe(Math.round(pieces[1]![0] * FPS));
    expect(layout.clips[3]!.clip.trimStart).toBeCloseTo(0.04, 6);
  });

  test("lays only the clips up to the first that isn't in, and the voiceover only that far", () => {
    const { timeline, missing } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      cuts([null, null, null, null], [true, true, false, true]),
      assets,
      voiceover,
      {
        keepSound: false,
        captions: false,
        endCard: { assetId: ids[3]!, seconds: 3, width: 1280, height: 720, revealed: false },
      },
    );
    expect(missing).toEqual([2, 3]);
    expect(timeline.clips).toHaveLength(2);
    const total = layoutTimeline(timeline).total;
    expect(timeline.audio[0]!.duration).toBeCloseTo(total, 6);
  });

  test("keeps the clips' own sound when asked, ends on a cut to the end card, and captions the words", () => {
    const { timeline } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      cuts([null, null, null, null]),
      assets,
      voiceover,
      {
        keepSound: true,
        captions: true,
        endCard: { assetId: ids[0]!, seconds: 3, width: 1280, height: 720, revealed: false },
      },
    );
    expect(timeline.clips.slice(0, 4).every((clip) => clip.volume === 1)).toBe(true);
    const card = timeline.clips[4]!;
    expect(card.kind).toBe("image");
    expect(card.transition.type).toBe("cut");
    expect(card.duration).toBe(3);
    expect(timeline.captions.enabled).toBe(true);
    expect(timeline.captions.segments[0]).toMatchObject({
      start: 0.4,
      text: "Meet the new range.",
    });
  });

  test("plays a last clip made to end on a frame out after the voiceover, then cuts to the end card", () => {
    const ending = cuts([null, null, null, null]).map((clip, index) =>
      index === 3 ? { ...clip, playsOut: true } : clip,
    );
    const endCard = { assetId: ids[0]!, seconds: 3, width: 1280, height: 720, revealed: true };
    const { timeline } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      ending,
      assets,
      voiceover,
      { keepSound: false, captions: false, endCard },
    );
    const layout = layoutTimeline(timeline);
    const last = layout.clips[3]!;
    // The whole of its 7 s, past the voiceover's end, so it lands on its closing frame.
    expect(Math.round(last.start * FPS)).toBe(Math.round(pieces[3]![0] * FPS));
    expect(Math.round(last.clip.duration! * FPS)).toBe(7 * FPS);
    expect(Math.round((last.start + last.clip.duration!) * FPS)).toBeGreaterThan(
      Math.round(26.4371 * FPS),
    );
    // The voiceover still plays whole, and the end card follows on a cut.
    expect(timeline.audio[0]!.duration).toBeNull();
    expect(timeline.clips[4]).toMatchObject({ kind: "image", duration: 3 });
    expect(timeline.clips[4]!.transition.type).toBe("cut");

    // With a clip before it not in yet, nothing plays out.
    const partial = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      ending.map((clip, index) => (index === 2 ? { ...clip, assetId: null } : clip)),
      assets,
      voiceover,
      { keepSound: false, captions: false },
    );
    expect(partial.timeline.clips).toHaveLength(2);
  });

  test("shifts the voiceover, not the clips, when the first clip's speech came early", () => {
    const { timeline } = compileFromVoiceoverLongVideo(
      { title: "Launch", settings: {} },
      cuts([-0.05, null, null, null]),
      assets,
      voiceover,
      { keepSound: false, captions: true },
    );
    const voice = timeline.audio[0]!;
    // Two frames into the voiceover (0.05 s rounded up to the frame).
    expect(voice.trimStart).toBeCloseTo(2 / FPS, 3);
    expect(timeline.captions.segments[0]!.start).toBeCloseTo(0.4 - 2 / FPS, 3);
  });
});
