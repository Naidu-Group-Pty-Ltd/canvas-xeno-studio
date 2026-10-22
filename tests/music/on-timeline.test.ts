import { describe, expect, test } from "bun:test";
import { parseTimeline, type Timeline, type TimelineAudio } from "../../src/lib/edit/timeline";
import { snapCutsToBeats } from "../../src/lib/music/beats";
import {
  audioSpans,
  musicGridOnTimeline,
  sectionsOnTimeline,
  timesOnTimeline,
} from "../../src/lib/music/on-timeline";
import type { MusicStructure } from "../../src/lib/music/structure";

const MUSIC = "cccccccc-1111-4111-8111-111111111111";
const STILL = "aaaaaaaa-1111-4111-8111-111111111111";

function item(overrides: Partial<TimelineAudio>): TimelineAudio {
  const timeline = parseTimeline({
    audio: [{ id: "m1", assetId: MUSIC, role: "music", ...overrides }],
  });
  if (!timeline) throw new Error("the item didn't parse");
  return timeline.audio[0]!;
}

// Ten seconds at 120 BPM, a bar every 2 s from 0.5 s: an intro, then the drop at 4.5 s.
const TRACK: MusicStructure = {
  bpm: 120,
  beats: Array.from({ length: 20 }, (_, beat) => 0.5 + beat * 0.5).filter((time) => time < 10),
  beatsPerBar: 4,
  downbeats: [0.5, 2.5, 4.5, 6.5, 8.5],
  bars: [0.5, 2.5, 4.5, 6.5],
  sections: [
    { start: 0, end: 4.5, kind: "intro", energy: 0 },
    { start: 4.5, end: 10, kind: "drop", energy: 1 },
  ],
  confidence: 1,
};

describe("where a track plays on the timeline", () => {
  test("from its trim point, moved to where the item starts and cut where it stops", () => {
    const placed = item({ start: 2, trimStart: 1, duration: 6, sourceDuration: 10, loop: false });
    expect(audioSpans(placed, 30)).toEqual([{ from: 1, to: 7, at: 2 }]);
    const grid = musicGridOnTimeline(placed, TRACK, 30);
    expect(grid.downbeats).toEqual([3.5, 5.5, 7.5]);
    expect(grid.beats[0]).toBe(2);
    expect(grid.beats.at(-1)).toBe(8);
    expect(grid.sections).toEqual([
      { start: 2, end: 5.5, kind: "intro", energy: 0, index: 0 },
      { start: 5.5, end: 8, kind: "drop", energy: 1, index: 1 },
    ]);
  });

  test("a loop plays on from the trim point to the end of the track, then all of it again", () => {
    const looped = item({ start: 0, trimStart: 6, sourceDuration: 10, loop: true });
    expect(audioSpans(looped, 20)).toEqual([
      { from: 6, to: 10, at: 0 },
      { from: 0, to: 10, at: 4 },
      { from: 0, to: 6, at: 14 },
    ]);
    const grid = musicGridOnTimeline(looped, TRACK, 20);
    expect(grid.downbeats).toEqual([0.5, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 18.5]);
    // At the end of the track it starts again, with its intro.
    expect(grid.sections.map((section) => [section.kind, section.start, section.end])).toEqual([
      ["drop", 0, 4],
      ["intro", 4, 8.5],
      ["drop", 8.5, 14],
      ["intro", 14, 18.5],
      ["drop", 18.5, 20],
    ]);
  });

  test("a time heard twice is placed twice, and one outside every stretch not at all", () => {
    const spans = [
      { from: 2, to: 4, at: 0 },
      { from: 2, to: 3, at: 2 },
    ];
    expect(timesOnTimeline(spans, [1, 2.5, 3.5, 9])).toEqual([0.5, 1.5, 2.5]);
  });

  test("a section carried on across a join stays one section", () => {
    const spans = [
      { from: 4.5, to: 6.5, at: 0 },
      { from: 4.5, to: 8, at: 2 },
    ];
    expect(sectionsOnTimeline(spans, TRACK.sections)).toEqual([
      { start: 0, end: 5.5, kind: "drop", energy: 1, index: 1 },
    ]);
  });

  test("an item that starts after the picture ends plays nothing", () => {
    expect(audioSpans(item({ start: 25 }), 20)).toEqual([]);
  });
});

describe("cutting to the bar", () => {
  function edit(first: number): Timeline {
    const timeline = parseTimeline({
      fps: 30,
      clips: [
        { id: "a", assetId: STILL, kind: "image", duration: first },
        { id: "b", assetId: STILL, kind: "image", duration: 4 },
      ],
    });
    if (!timeline) throw new Error("the edit didn't parse");
    return timeline;
  }
  const beats = [1, 1.5, 2, 2.5, 3, 3.5, 4];

  test("without bar lines, a cut goes to the nearest beat", () => {
    const { timeline, moved } = snapCutsToBeats(edit(1.9), beats, { maxShift: 0.6 });
    expect(moved).toBe(1);
    expect(timeline.clips[0]!.duration).toBe(2);
  });

  test("with them, a bar line in reach comes first", () => {
    const { timeline } = snapCutsToBeats(edit(1.9), beats, { maxShift: 0.7, bars: [2.5] });
    expect(timeline.clips[0]!.duration).toBe(2.5);
  });

  test("a cut on a beat moves only onto a bar line, and stays when none is in reach", () => {
    expect(
      snapCutsToBeats(edit(2), beats, { maxShift: 0.6, bars: [2.5] }).timeline.clips[0]!.duration,
    ).toBe(2.5);
    const kept = snapCutsToBeats(edit(2), beats, { maxShift: 0.6, bars: [4] });
    expect(kept.moved).toBe(0);
    expect(kept.timeline.clips[0]!.duration).toBe(2);
    // On a bar line already: it stays.
    expect(snapCutsToBeats(edit(2.5), beats, { maxShift: 0.6, bars: [2.5] }).moved).toBe(0);
  });
});
