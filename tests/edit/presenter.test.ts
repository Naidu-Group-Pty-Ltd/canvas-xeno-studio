import { describe, expect, test } from "bun:test";
import { compilePresenterEdit, type PresenterClip } from "../../src/lib/edit/presenter";
import { layoutTimeline, renderBlockers, timelineSchema } from "../../src/lib/edit/timeline";
import { normaliseCutaways } from "../../src/lib/lip-sync/sections";

const FPS = 30;
const uuid = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const voiceAsset = uuid(99);
const still = { assetId: uuid(98), width: 720, height: 1280 };

// The Aurixa edit's structure: presenter, B1, presenter, B2, presenter… (seconds on the voiceover).
const duration = 107.5;
const cutaways = normaliseCutaways(
  [
    { start: 8.1, end: 17.4 },
    { start: 18.8, end: 25.7 },
    { start: 37.2, end: 53.8 },
    { start: 66.9, end: 71.5 },
    { start: 73.3, end: 76.0 },
    { start: 82.8, end: 90.0 },
    { start: 99.4, end: 107.5 },
  ],
  duration,
  FPS,
);
// One clip per presenter section, each after a cutaway made with half a second of lead-in.
const presenterSections: [number, number][] = [
  [0, 8.1],
  [17.4, 18.8],
  [25.7, 37.2],
  [53.8, 66.9],
  [71.5, 73.3],
  [76.0, 82.8],
  [90.0, 99.4],
];

function clipsWith(extra: Partial<PresenterClip>[] = []): PresenterClip[] {
  return presenterSections.map(([start, end], index) => {
    const pieceStart = index === 0 ? 0 : start - 0.5;
    return {
      position: index,
      assetId: uuid(index + 1),
      audioStart: pieceStart,
      audioEnd: end,
      offsetSeconds: 0,
      lengthSeconds: Math.max(3, Math.ceil(end - pieceStart + 0.25)),
      ...(extra[index] ?? {}),
    };
  });
}

const assets = (clips: PresenterClip[]) =>
  clips.map((clip) => ({
    id: clip.assetId!,
    durationSeconds: clip.lengthSeconds,
    width: 720,
    height: 1280,
  }));

const voiceover = {
  assetId: voiceAsset,
  durationSeconds: duration,
  fps: FPS,
  title: "Voiceover · Janice",
  words: [
    { text: "hi", start: 0.3, end: 0.5 },
    { text: "im", start: 0.55, end: 0.7 },
    { text: "janice", start: 0.75, end: 1.2 },
    { text: "from", start: 1.25, end: 1.4 },
    { text: "arixa", start: 1.45, end: 1.9 },
    { text: "systems", start: 1.95, end: 2.5 },
  ],
  script: "Hi, I'm Janice from Aurixa Systems.",
};

/** The worst gap, over every frame a presenter clip is on screen, between its lips and the voice. */
function lipError(clips: PresenterClip[], result: ReturnType<typeof compilePresenterEdit>) {
  const layout = layoutTimeline(result.timeline);
  let worst = 0;
  result.segments.forEach((segment, index) => {
    if (segment.kind !== "presenter" || segment.placeholder) return;
    const clip = clips.find((entry) => entry.position === segment.index)!;
    const laid = layout.clips[index]!;
    const lead = clip.lipLeadSeconds ?? 0;
    for (let frame = segment.startFrame; frame < segment.endFrame; frame += 1) {
      const t = frame / FPS;
      const tau = laid.clip.trimStart + (t - laid.start);
      const lips = clip.audioStart + tau - (clip.offsetSeconds ?? 0) + lead;
      const heard = result.voiceoverTrim + t;
      worst = Math.max(worst, Math.abs(lips - heard));
    }
  });
  return worst;
}

describe("a presenter video with cutaways, in the Editor", () => {
  test("lays every shot on the voiceover's clock, to the frame, the lips on the voice", () => {
    const clips = clipsWith();
    const fills = cutaways.map((_, index) => ({
      assetId: uuid(50 + index),
      kind: "video" as const,
      sourceSeconds: 20,
    }));
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: { aspect_ratio: "9:16" } },
      clips,
      assets(clips),
      voiceover,
      cutaways,
      { keepSound: false, captions: true, fills, placeholder: still },
    );
    expect(result.notes).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(timelineSchema.safeParse(result.timeline).success).toBe(true);
    expect(renderBlockers(result.timeline)).toEqual([]);
    const layout = layoutTimeline(result.timeline);
    // Shot for shot, where the plan put it.
    result.segments.forEach((segment, index) => {
      expect(Math.round(layout.clips[index]!.start * FPS)).toBe(segment.startFrame);
      expect(Math.round(layout.clips[index]!.end * FPS)).toBe(segment.endFrame);
    });
    expect(layout.totalFrames).toBe(Math.round(duration * FPS));
    // Presenter and B-roll alternate exactly as marked.
    expect(result.segments.map((segment) => segment.kind)).toEqual([
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
      "presenter",
      "cutaway",
    ]);
    expect(result.segments[2]!.startFrame).toBe(Math.round(17.4 * FPS));
    expect(lipError(clips, result)).toBeLessThan(1e-5);
    // A clip after a cutaway is cut in past its lead-in.
    expect(result.timeline.clips[2]!.trimStart).toBeCloseTo(0.5, 6);
    // Cut, never blended, every clip silent; the voiceover whole, from the start.
    for (const clip of result.timeline.clips) {
      expect(clip.transition.type).toBe("cut");
      expect(clip.smartBlend).toBe(false);
      expect(clip.volume).toBe(0);
    }
    expect(result.timeline.audio[0]).toMatchObject({ role: "voiceover", trimStart: 0 });
    // Captions in the script's words.
    expect(result.timeline.captions.segments[0]!.text).toBe("Hi, I'm Janice from Aurixa Systems.");
  });

  test("takes early speech or lips out of a clip's lead-in, on its own frame", () => {
    const clips = clipsWith([{}, {}, { offsetSeconds: -0.05 }, { lipLeadSeconds: 1 / FPS }]);
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: { aspect_ratio: "9:16" } },
      clips,
      assets(clips),
      voiceover,
      cutaways,
      { keepSound: false, captions: false, placeholder: still },
    );
    expect(lipError(clips, result)).toBeLessThan(1e-5);
    const shot = (position: number) =>
      result.segments.findIndex(
        (segment) => segment.kind === "presenter" && segment.index === position,
      );
    expect(result.segments[shot(2)]!.startFrame).toBe(Math.round(25.7 * FPS));
    expect(result.timeline.clips[shot(2)]!.trimStart).toBeCloseTo(0.45, 6);
    expect(result.timeline.clips[shot(3)]!.trimStart).toBeCloseTo(0.5 - 1 / FPS, 6);
  });

  test("lays a clip whose speech comes early a frame or two later, the clip before playing on", () => {
    // Its section in two clips, the second straight on from the first.
    const base = clipsWith();
    const split: PresenterClip[] = [
      ...base.slice(0, 2),
      { ...base[2]!, audioEnd: 31, lengthSeconds: 6 },
      {
        ...base[2]!,
        position: 3,
        assetId: uuid(20),
        audioStart: 31,
        audioEnd: 37.2,
        offsetSeconds: -0.05,
        lengthSeconds: 7,
        continuesPrevious: true,
      },
      ...base.slice(3).map((clip) => ({ ...clip, position: clip.position + 1 })),
    ];
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: {} },
      split,
      assets(split),
      voiceover,
      cutaways,
      { keepSound: false, captions: false, placeholder: still },
    );
    expect(lipError(split, result)).toBeLessThan(1e-5);
    const index = result.segments.findIndex(
      (segment) => segment.kind === "presenter" && segment.index === 3,
    );
    expect(result.segments[index]!.startFrame).toBe(Math.round(31 * FPS) + 2);
    expect(result.segments[index - 1]!.endFrame).toBe(result.segments[index]!.startFrame);
    // Straight on from the clip before: put back in register at the cut.
    expect(result.timeline.clips[index]!.smartBlend).toBe(true);
  });

  test("starts the voiceover a frame in when the first clip's lips lead", () => {
    const clips = clipsWith([{ lipLeadSeconds: 1 / FPS }]);
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: {} },
      clips,
      assets(clips),
      voiceover,
      cutaways,
      { keepSound: false, captions: false, placeholder: still },
    );
    expect(result.voiceoverTrim).toBeCloseTo(1 / FPS, 6);
    expect(result.timeline.audio[0]!.trimStart).toBeCloseTo(1 / FPS, 6);
    expect(lipError(clips, result)).toBeLessThan(1e-5);
  });

  test("holds a named placeholder where B-roll or a clip isn't in yet", () => {
    const clips = clipsWith([{}, { assetId: null }]);
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: {} },
      clips,
      assets(clips.filter((clip) => clip.assetId)),
      voiceover,
      cutaways,
      {
        keepSound: false,
        captions: false,
        placeholder: still,
        fills: [{ assetId: uuid(50), kind: "image" }],
      },
    );
    expect(result.missing).toEqual([1]);
    const labels = result.timeline.clips.map((clip) => clip.label);
    expect(labels[1]).toBe("B-roll 1");
    expect(labels[2]).toBe("Clip 2 (not in yet)");
    expect(labels[3]).toBe("B-roll 2: add B-roll here");
    expect(result.segments.filter((segment) => segment.placeholder).length).toBe(cutaways.length);
    // Still on the voiceover's clock.
    expect(layoutTimeline(result.timeline).totalFrames).toBe(Math.round(duration * FPS));
  });

  test("puts titles on the voiceover's clock, stops captions for the closing titles, and ends on the card", () => {
    const clips = clipsWith();
    const result = compilePresenterEdit(
      { title: "Aurixa", settings: {} },
      clips,
      assets(clips),
      { ...voiceover, words: [...voiceover.words, { text: "decision", start: 98, end: 99 }] },
      cutaways,
      {
        keepSound: false,
        captions: true,
        placeholder: still,
        titles: [
          { text: "AURIXA SYSTEMS", at: 26, seconds: 2.5 },
          { text: "YOUR DECISION.", at: 97.5, seconds: 2 },
        ],
        endCard: { assetId: uuid(97), seconds: 3, width: 720, height: 1280, revealed: false },
        music: { assetId: uuid(96), durationSeconds: 60, title: "Bed" },
      },
    );
    expect(result.timeline.overlays.map((overlay) => [overlay.text, overlay.start])).toEqual([
      ["AURIXA SYSTEMS", 26],
      ["YOUR DECISION.", 97.5],
    ]);
    for (const segment of result.timeline.captions.segments)
      expect(segment.end).toBeLessThanOrEqual(97.5);
    expect(result.timeline.clips.at(-1)!.label).toBe("End card");
    expect(result.timeline.audio.map((item) => item.role)).toEqual(["voiceover", "music"]);
    expect(result.timeline.audio[1]).toMatchObject({ volume: 0.65, duckLevel: 0.25, loop: true });
  });
});
