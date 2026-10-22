import { describe, expect, test } from "bun:test";
import {
  analyzeStructure,
  barAt,
  barSeconds,
  barSimilarity,
  nameSections,
  readStructure,
  sectionAt,
  sectionStarts,
  STRUCTURE_VERSION,
  type MusicStructure,
} from "../../src/lib/music/structure";
import { groove, RATE, REEL_ONE, reelOneBar, reelOneTrack, Track } from "./synth";

/** The analysis of a track, made once and shared by the tests that read it. */
function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

const accented = once(() => {
  // 120 BPM, two beats of pickup, then bars from 1.25 s with the one struck harder.
  const track = new Track(40);
  track.kick(0.25, 0.6);
  track.kick(0.75, 0.6);
  groove(track, { first: 1.25, period: 0.5, beatsPerBar: 4 }, 0, 19, 1);
  return analyzeStructure(track.samples, RATE);
});

const inThrees = once(() => {
  const period = 60 / 90;
  const track = new Track(40);
  track.kick(0.9 - period, 0.6);
  groove(track, { first: 0.9, period, beatsPerBar: 3 }, 0, 19, 1);
  return analyzeStructure(track.samples, RATE);
});

const quietLoudQuiet = once(() => {
  const track = new Track(97);
  const grid = { first: 0.5, period: 0.5, beatsPerBar: 4 };
  groove(track, grid, 0, 16, 0.08);
  groove(track, grid, 16, 32, 1);
  groove(track, grid, 32, 48, 0.08);
  return analyzeStructure(track.samples, RATE);
});

const reelOne = once(() => analyzeStructure(reelOneTrack().samples, RATE));

describe("the bar and its phase", () => {
  test("finds which beat is one from an accented downbeat, after a pickup", () => {
    const { structure } = accented()!;
    expect(structure.beatsPerBar).toBe(4);
    expect(structure.bpm).toBeCloseTo(120, 1);
    // The pickup's two beats come before the first bar.
    expect(structure.downbeats[0]).toBeCloseTo(1.25, 2);
    structure.downbeats.slice(0, 18).forEach((downbeat, bar) => {
      expect(Math.abs(downbeat - (1.25 + 2 * bar))).toBeLessThan(0.01);
    });
    expect(structure.bars).toEqual(structure.downbeats.slice(0, structure.bars.length));
    expect(structure.confidence).toBeGreaterThan(0.6);
  });

  test("puts the beats on their attacks, not where a bass-heavy kick drags the onset envelope", () => {
    const { structure } = accented()!;
    const misses = structure.beats.slice(2, 60).map((beat) => {
      const nearest = 0.25 + Math.round((beat - 0.25) / 0.5) * 0.5;
      return Math.abs(beat - nearest);
    });
    expect(Math.max(...misses)).toBeLessThan(0.008);
  });

  test("keeps the grid on the beat to the end of a long track, though the tracker's period drifts", () => {
    // Eight minutes at 124 BPM, loud and quiet in turn every 16 bars.
    const period = 60 / 124;
    const track = new Track(480);
    for (let bar = 0; bar < 240; bar += 16)
      groove(track, { first: 0.3, period, beatsPerBar: 4 }, bar, bar + 16, bar % 32 ? 0.3 : 1);
    const { structure } = analyzeStructure(track.samples, RATE)!;
    const misses = structure.beats.map((beat) => {
      const nearest = 0.3 + Math.round((beat - 0.3) / period) * period;
      return Math.abs(beat - nearest);
    });
    expect(Math.max(...misses.slice(0, 20), ...misses.slice(-20))).toBeLessThan(0.008);
    expect(structure.bpm).toBeCloseTo(124, 1);
    expect(Math.abs(structure.bars[0]! - 0.3)).toBeLessThan(0.008);
  });

  test("hears three beats a bar when the one comes every third beat", () => {
    const { structure } = inThrees()!;
    expect(structure.beatsPerBar).toBe(3);
    expect(structure.bpm).toBeCloseTo(90, 0);
    expect(Math.abs(structure.downbeats[0]! - 0.9)).toBeLessThan(0.01);
    expect(barSeconds(structure)).toBeCloseTo(2, 2);
  });

  test("a whole bar ends inside the track", () => {
    const { structure } = accented()!;
    const last = structure.bars.at(-1)!;
    expect(last + barSeconds(structure)).toBeLessThanOrEqual(40 + 0.25);
    // Every downbeat whose bar would run past the end is a downbeat but not a bar.
    expect(structure.downbeats.length).toBeGreaterThanOrEqual(structure.bars.length);
  });

  test("music with no steady beat has no bars", () => {
    const steady = new Track(20);
    steady.tone(0, 20, [220, 330], 0.4);
    expect(analyzeStructure(steady.samples, RATE)).toBeNull();
    expect(analyzeStructure(new Float32Array(RATE * 20), RATE)).toBeNull();
  });
});

describe("sections", () => {
  test("a loud section between quiet ones is the drop, between an intro and an outro, on its bar lines", () => {
    const { structure } = quietLoudQuiet()!;
    const sections = structure.sections;
    expect(sections.map((section) => section.kind)).toEqual(["intro", "drop", "outro"]);
    expect(sections[0]!.start).toBe(0);
    expect(Math.abs(sections[1]!.start - 32.5)).toBeLessThan(0.01);
    expect(Math.abs(sections[2]!.start - 64.5)).toBeLessThan(0.01);
    expect(sections[2]!.end).toBeCloseTo(97, 2);
    // Each starts on one of the track's bar lines, and they tile the track.
    for (const section of sections.slice(1)) expect(structure.bars).toContain(section.start);
    sections.slice(1).forEach((section, index) => expect(section.start).toBe(sections[index]!.end));
    expect(sections[1]!.energy).toBe(1);
    expect(sections[0]!.energy).toBeLessThan(0.1);
  });

  test("steady music is one section", () => {
    const { structure } = accented()!;
    expect(structure.sections).toEqual([{ start: 0, end: 40, kind: "section", energy: 1 }]);
  });

  test("names sections by their loudness against their neighbours", () => {
    expect(nameSections([-30, -8, -9, -30, -8, -25])).toEqual([
      "intro",
      "drop",
      "section",
      "breakdown",
      "reentry",
      "outro",
    ]);
    // A section that climbs into the drop builds to it.
    expect(nameSections([-20, -14, -6], [0, 4, 0])).toEqual(["intro", "build", "drop"]);
    // A dip of 6 dB below both neighbours is a breakdown, and what comes back after it the re-entry.
    expect(nameSections([-12, -20, -8], [0, 4, 0])).toEqual(["section", "breakdown", "reentry"]);
    expect(nameSections([-10])).toEqual(["section"]);
    expect(nameSections([-10, -10.5])).toEqual(["section", "section"]);
  });

  test("boundaries favour the phrase lines: a change a bar off one moves onto it", () => {
    const novelty = new Array<number>(40).fill(0);
    novelty[16] = 0.7;
    novelty[17] = 0.75;
    novelty[32] = 0.9;
    expect(sectionStarts(novelty)).toEqual([16, 32]);
    // A lone strong change off the grid still stands.
    expect(
      sectionStarts(new Array<number>(40).fill(0).map((_, bar) => (bar === 13 ? 1 : 0))),
    ).toEqual([13]);
    expect(sectionStarts(new Array<number>(40).fill(0.05))).toEqual([]);
  });

  test("finds where a time falls", () => {
    const { structure } = quietLoudQuiet()!;
    expect(sectionAt(structure, 40)?.kind).toBe("drop");
    expect(sectionAt(structure, 200)).toBeNull();
    expect(barAt(structure, 0.4)).toBe(-1);
    expect(barAt(structure, structure.bars[3]!)).toBe(3);
    expect(barAt(structure, structure.bars[3]! + 1)).toBe(3);
    expect(barAt(structure, 1000)).toBe(structure.bars.length - 1);
  });
});

describe("Reel 1's track, as pacing.py measured it", () => {
  test("128.99 BPM, a beat every 0.465141 s, four to a bar", () => {
    const { structure } = reelOne()!;
    expect(structure.beatsPerBar).toBe(4);
    expect(Math.abs(structure.bpm - 128.99)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(barSeconds(structure) / 4 - REEL_ONE.period)).toBeLessThan(0.0001);
  });

  test("the drop is a downbeat at 22.255 s in the file, and the sections fall on its bars", () => {
    const { structure } = reelOne()!;
    const drop = structure.downbeats.find((time) => Math.abs(time - REEL_ONE.drop) < 0.2);
    expect(drop).toBeDefined();
    expect(Math.abs(drop! - 22.255)).toBeLessThan(0.01);
    const found = structure.sections.map((section) => [section.kind, section.start]);
    const expected: Array<[string, number]> = [
      ["intro", 0],
      ["drop", reelOneBar(0)],
      ["section", reelOneBar(32)],
      ["breakdown", reelOneBar(40)],
      ["reentry", reelOneBar(48)],
      ["outro", reelOneBar(64)],
    ];
    expect(found.map(([kind]) => kind)).toEqual(expected.map(([kind]) => kind));
    found.forEach(([, start], index) => {
      expect(Math.abs((start as number) - expected[index]![1])).toBeLessThan(0.01);
    });
  });

  test("the breakdown's bars two apart are more alike than its bars one apart (its two-bar figure)", () => {
    const { structure, features } = reelOne()!;
    const first = barAt(structure, reelOneBar(40) + 0.1);
    const twoApart = barSimilarity(features, first + 1, first + 3);
    const oneApart = barSimilarity(features, first + 1, first + 2);
    expect(twoApart).toBeGreaterThan(oneApart);
    // A groove bar and a breakdown bar are unlike; two groove bars four apart are alike.
    const groove = barAt(structure, reelOneBar(4) + 0.1);
    expect(barSimilarity(features, groove, groove + 4)).toBeGreaterThan(0.9);
    expect(barSimilarity(features, groove, first)).toBeLessThan(0.6);
  });
});

describe("keeping it", () => {
  test("a structure and its features read back as they were", () => {
    const { structure, features } = quietLoudQuiet()!;
    const kept = JSON.parse(JSON.stringify({ structure, features }));
    expect(readStructure(kept.structure, kept.features)).toEqual({ structure, features });
    expect(features.version).toBe(STRUCTURE_VERSION);
    expect(features.loudness).toHaveLength(structure.bars.length);
    expect(features.bands[0]).toHaveLength(6);
    expect(features.chroma[0]).toHaveLength(12);
    expect(features.rhythm[0]).toHaveLength(8);
  });

  test("one from an older analysis, or that doesn't match, is found again", () => {
    const { structure, features } = quietLoudQuiet()!;
    expect(readStructure(structure, { ...features, version: STRUCTURE_VERSION - 1 })).toBeNull();
    const shorter: MusicStructure = { ...structure, bars: structure.bars.slice(1) };
    expect(readStructure(shorter, features)).toBeNull();
    expect(readStructure(null, null)).toBeNull();
    expect(readStructure({ ...structure, sections: [] }, features)).toBeNull();
  });
});
