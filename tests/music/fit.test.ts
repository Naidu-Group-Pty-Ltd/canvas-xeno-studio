import { describe, expect, test } from "bun:test";
import { PIECES, piecesLength } from "../../src/lib/edit/pieces";
import { editSimilarity, fitMusicToLength, SPLICE_LEAD } from "../../src/lib/music/fit";
import {
  analyzeStructure,
  barSeconds,
  type BarFeatures,
  type MusicStructure,
} from "../../src/lib/music/structure";
import { RATE, reelOneTrack } from "./synth";

const reelOne = (() => {
  let found: ReturnType<typeof analyzeStructure> | undefined;
  return () => (found ??= analyzeStructure(reelOneTrack().samples, RATE));
})();

/** The film's clock, from pacing.json: the drop, the breakdown (bar 44) and the re-entry (bar 50). */
const FILM = { drop: 29.697108, breakdown: 111.561927, reentry: 122.725312, end: 131.2 };

/** Which section a bar (an index into structure.bars) falls in. */
function sectionOf(structure: MusicStructure, bar: number): number {
  const time = structure.bars[bar]!;
  return structure.sections.findIndex(
    (section) => time >= section.start - 1e-3 && time < section.end - 1e-3,
  );
}

/** Whether a bar is the first whole bar of its section. */
function firstOfSection(structure: MusicStructure, bar: number): boolean {
  return sectionOf(structure, bar) !== sectionOf(structure, bar - 1);
}

/**
 * A made-up track of one section: bar k at 1 + 2k s, each bar's harmony its
 * own pitch class, except that bars 12 to 15 are bars 8 to 11 again (and the
 * bars before both alike), so bars 8 to 11 are the ones to play twice.
 */
function madeUp(bars = 24): { structure: MusicStructure; features: BarFeatures } {
  const pitch = (bar: number) => (bar >= 12 && bar < 16 ? bar - 4 : bar === 11 ? 7 : bar) % 12;
  const chroma = Array.from({ length: bars }, (_, bar) =>
    Array.from({ length: 12 }, (_, pc) => (pc === (pitch(bar) * 5) % 12 ? 1 : 0)),
  );
  const duration = 1 + 2 * bars + 0.6;
  return {
    structure: {
      bpm: 120,
      beats: Array.from({ length: bars * 4 }, (_, beat) => 1 + beat * 0.5),
      beatsPerBar: 4,
      downbeats: Array.from({ length: bars }, (_, bar) => 1 + 2 * bar),
      bars: Array.from({ length: bars }, (_, bar) => 1 + 2 * bar),
      sections: [{ start: 0, end: duration, kind: "section", energy: 1 }],
      confidence: 1,
    },
    features: {
      version: 1,
      loudness: new Array(bars).fill(-10),
      bands: Array.from({ length: bars }, () => new Array(6).fill(-20)),
      chroma,
      rhythm: Array.from({ length: bars }, () => new Array(8).fill(0.5)),
    },
  };
}

describe("fitting Reel 1's track to its film", () => {
  const landmarks = [
    { section: 1, at: FILM.drop },
    { section: 3, at: FILM.breakdown },
    { section: 4, at: FILM.reentry },
  ];

  test("lands the drop, the breakdown and the re-entry on the film's times, exactly", () => {
    const { structure, features } = reelOne()!;
    const fit = fitMusicToLength(structure, features, FILM.end, { landmarks, ending: "bar" })!;
    for (const [index, asked] of [FILM.drop, FILM.breakdown, FILM.reentry].entries()) {
      expect(fit.landmarks[index]!.asked).toBe(asked);
      expect(Math.abs(fit.landmarks[index]!.at - asked)).toBeLessThan(0.002);
    }
  }, 30_000);

  test("as pacing.py did: four intro bars again, four groove bars again, two breakdown bars out", () => {
    const { structure, features } = reelOne()!;
    const fit = fitMusicToLength(structure, features, FILM.end, { landmarks, ending: "bar" })!;
    expect(fit.edits.map((edit) => [edit.kind, edit.count, edit.times])).toEqual([
      ["repeat", 4, 1],
      ["repeat", 4, 1],
      ["remove", 2, 1],
    ]);
    const [intro, groove, breakdown] = fit.edits;
    expect(sectionOf(structure, intro!.bar)).toBe(0);
    // The groove's bars come between the drop and the breakdown.
    expect([1, 2]).toContain(sectionOf(structure, groove!.bar));
    expect(sectionOf(structure, breakdown!.bar)).toBe(3);
    // Phrases whole: no group starts on its section's first bar, or runs out of its section.
    for (const edit of fit.edits) {
      expect(firstOfSection(structure, edit.bar)).toBe(false);
      expect(sectionOf(structure, edit.bar + edit.count - 1)).toBe(sectionOf(structure, edit.bar));
    }
    expect(fit.pieces).toHaveLength(4);
  });

  test("stops on the bar line nearest the film's end, 20 ms ahead of it", () => {
    const { structure, features } = reelOne()!;
    const fit = fitMusicToLength(structure, features, FILM.end, { landmarks, ending: "bar" })!;
    const bar = barSeconds(structure);
    // The plan's bar lines run on from the film's drop.
    const bars = (fit.length + SPLICE_LEAD - FILM.drop) / bar;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.002);
    expect(Math.abs(fit.length - FILM.end)).toBeLessThanOrEqual(bar / 2 + SPLICE_LEAD);
    expect(fit.length).toBeCloseTo(piecesLength(fit.pieces), 6);
  });

  test("every join sits 20 ms ahead of a bar line, on both sides", () => {
    const { structure, features } = reelOne()!;
    const fit = fitMusicToLength(structure, features, FILM.end, { landmarks, ending: "bar" })!;
    const onBarLine = (time: number) =>
      structure.bars.some((barStart) => Math.abs(barStart - SPLICE_LEAD - time) < 1e-6);
    fit.pieces.slice(1).forEach((piece, index) => {
      expect(onBarLine(piece.from)).toBe(true);
      expect(onBarLine(fit.pieces[index]!.to)).toBe(true);
    });
    expect(fit.pieces[0]!.from).toBe(0);
  });

  test("keeping the track's own ending, the length is the track's plus whole bars", () => {
    const { structure, features } = reelOne()!;
    const duration = structure.sections.at(-1)!.end;
    const fit = fitMusicToLength(structure, features, 200)!;
    // Bar lines are kept to the millisecond, so each join may be that far off a whole bar.
    const added = (fit.length - duration) / barSeconds(structure);
    expect(Math.abs(added - Math.round(added)) * barSeconds(structure)).toBeLessThan(
      0.001 * fit.pieces.length,
    );
    expect(Math.abs(fit.length - 200)).toBeLessThanOrEqual(barSeconds(structure) / 2);
    expect(fit.pieces.at(-1)!.to).toBe(duration);
    // Shorter: whole sections go, and it still ends as the track ends.
    const short = fitMusicToLength(structure, features, 60)!;
    expect(Math.abs(short.length - 60)).toBeLessThanOrEqual(barSeconds(structure));
    expect(short.pieces.at(-1)!.to).toBe(duration);
    expect(short.pieces.length).toBeLessThanOrEqual(4);
  });

  test("a length the track already has needs no edits", () => {
    const { structure, features } = reelOne()!;
    const duration = structure.sections.at(-1)!.end;
    const fit = fitMusicToLength(structure, features, duration)!;
    expect(fit.edits).toEqual([]);
    expect(fit.pieces).toEqual([{ from: 0, to: duration }]);
  });
});

describe("which bars", () => {
  test("plays again the group most like what follows it", () => {
    const { structure, features } = madeUp();
    expect(editSimilarity(features, 8, 4)).toBeGreaterThan(0.95);
    expect(editSimilarity(features, 4, 4)).toBeLessThan(0.8);
    const fit = fitMusicToLength(structure, features, structure.sections[0]!.end + 8)!;
    expect(fit.edits).toEqual([
      { kind: "repeat", bar: 8, count: 4, times: 1, similarity: expect.any(Number) },
    ]);
    expect(fit.edits[0]!.similarity).toBeGreaterThan(0.95);
    // Bars 8 to 11 twice: the first piece runs to bar 12's line, the second starts back at bar 8's.
    expect(fit.pieces).toEqual([
      { from: 0, to: 25 - SPLICE_LEAD },
      { from: 17 - SPLICE_LEAD, to: structure.sections[0]!.end },
    ]);
  });

  test("leaves out the group most like what follows it, which takes its place", () => {
    const { structure, features } = madeUp();
    const fit = fitMusicToLength(structure, features, structure.sections[0]!.end - 8)!;
    expect(fit.edits).toEqual([
      { kind: "remove", bar: 8, count: 4, times: 1, similarity: expect.any(Number) },
    ]);
    expect(fit.pieces).toEqual([
      { from: 0, to: 17 - SPLICE_LEAD },
      { from: 25 - SPLICE_LEAD, to: structure.sections[0]!.end },
    ]);
  });

  test("keeps phrases whole: an odd number of bars can't be added, so it comes to the nearest even", () => {
    const { structure, features } = madeUp();
    const fit = fitMusicToLength(structure, features, structure.sections[0]!.end + 6)!;
    for (const edit of fit.edits) expect(edit.count % 2).toBe(0);
    expect(Math.abs(fit.length - (structure.sections[0]!.end + 6))).toBeLessThanOrEqual(2);
  });

  test("never more pieces than an item may play", () => {
    const { structure, features } = madeUp();
    const fit = fitMusicToLength(structure, features, 600);
    if (fit) expect(fit.pieces.length).toBeLessThanOrEqual(PIECES.max);
  });

  test("a landmark a bar off a phrase lands as near as whole phrases allow, and says where", () => {
    const { structure, features } = reelOne()!;
    // One bar later than the drop could be with whole phrases.
    const asked = FILM.drop + barSeconds(structure);
    const fit = fitMusicToLength(structure, features, FILM.end, {
      landmarks: [{ section: 1, at: asked }],
      ending: "bar",
    })!;
    expect(Math.abs(Math.abs(fit.landmarks[0]!.at - asked) - barSeconds(structure))).toBeLessThan(
      0.002,
    );
  });
});
