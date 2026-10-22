import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  pieceCuts,
  pieceJoins,
  pieceOffsets,
  PIECES,
  piecesLength,
  piecesPlacing,
  piecesSounding,
  type MusicPiece,
} from "../../src/lib/edit/pieces";
import {
  audioLoops,
  audioPlayLength,
  buildRenderRequest,
  parseTimeline,
  type Timeline,
} from "../../src/lib/edit/timeline";
import { beatTimesOnTimeline } from "../../src/lib/music/beats";
import { musicGridOnTimeline } from "../../src/lib/music/on-timeline";

const CLIP = "aaaaaaaa-1111-4111-8111-111111111111";
const MUSIC = "cccccccc-1111-4111-8111-111111111111";

// Reel 1's music edit, as pacing.py recorded it: the file in four pieces.
const PACING = JSON.parse(
  readFileSync(
    join(import.meta.dir, "../../docs/brands/aurixa-reel-1/system-edition/pacing.json"),
    "utf8",
  ),
);
const FILE_LENGTH = 272.3;
const REEL_PIECES: MusicPiece[] = PACING.music.pieces.map(
  (piece: { file_from: number; file_to: number | null }) => ({
    from: piece.file_from,
    to: piece.file_to ?? FILE_LENGTH,
  }),
);

function edit(audio: Record<string, unknown>, seconds = 140): Timeline {
  const timeline = parseTimeline({
    clips: [{ id: "c1", assetId: CLIP, kind: "image", duration: seconds }],
    audio: [{ id: "m1", assetId: MUSIC, role: "music", sourceDuration: FILE_LENGTH, ...audio }],
  });
  if (!timeline) throw new Error("the edit didn't parse");
  return timeline;
}

describe("music in pieces", () => {
  test("plays its pieces end to end: Reel 1's four pieces start where the film has them", () => {
    const offsets = pieceOffsets(REEL_PIECES);
    PACING.music.pieces.forEach((piece: { film_at: number }, index: number) => {
      expect(offsets[index]!).toBeCloseTo(piece.film_at, 5);
    });
    expect(piecesLength(REEL_PIECES)).toBeCloseTo(118.984184 + FILE_LENGTH - 107.820799, 5);
  });

  test("each join is a 30 ms equal-power crossfade centred on it", () => {
    const joins = pieceJoins(REEL_PIECES);
    expect(joins).toHaveLength(3);
    for (const join of joins) expect(join.lead).toBeCloseTo(PIECES.crossfade / 2, 9);
    const { at } = joins[0]!;
    // Halfway through, both pieces sound at the same equal-power gain.
    const middle = piecesSounding(REEL_PIECES, at);
    expect(middle.map((piece) => piece.index)).toEqual([0, 1]);
    expect(middle[0]!.gain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(middle[1]!.gain).toBeCloseTo(Math.SQRT1_2, 6);
    // The piece before plays on past its end, the next starts early, both on their own clocks.
    const early = piecesSounding(REEL_PIECES, at - 0.01);
    expect(early[0]!.source).toBeCloseTo(REEL_PIECES[0]!.to - 0.01, 9);
    expect(early[1]!.source).toBeCloseTo(REEL_PIECES[1]!.from - 0.01, 9);
    expect(early[0]!.gain ** 2 + early[1]!.gain ** 2).toBeCloseTo(1, 9);
    // Outside the crossfade, one piece alone at full level.
    expect(piecesSounding(REEL_PIECES, at + 0.02)).toEqual([
      { index: 1, source: REEL_PIECES[1]!.from + 0.02, gain: 1 },
    ]);
    expect(piecesSounding(REEL_PIECES, at - 0.02)).toEqual([
      { index: 0, source: REEL_PIECES[0]!.to - 0.02, gain: 1 },
    ]);
  });

  test("a piece that starts at the very beginning of its track has its crossfade a little later", () => {
    const pieces = [
      { from: 0, to: 4 },
      { from: 0.005, to: 4 },
    ];
    const [join] = pieceJoins(pieces);
    expect(join!.lead).toBeCloseTo(0.005, 9);
    expect(join!.start).toBeCloseTo(4 - 0.005, 9);
    expect(pieceCuts(pieces)).toEqual([
      { from: 0, to: 4 + PIECES.crossfade - 0.005 },
      { from: 0, to: 4 },
    ]);
    // Still on time: the second piece's 1 s mark plays 1 s after the join.
    expect(piecesSounding(pieces, 5)[0]!.source).toBeCloseTo(1.005, 9);
  });

  test("cuts each piece from half a crossfade before its start to half after its end", () => {
    const cuts = pieceCuts(REEL_PIECES);
    const half = PIECES.crossfade / 2;
    expect(cuts[0]).toEqual({ from: 0, to: REEL_PIECES[0]!.to + half });
    expect(cuts[1]!.from).toBeCloseTo(REEL_PIECES[1]!.from - half, 9);
    expect(cuts[1]!.to).toBeCloseTo(REEL_PIECES[1]!.to + half, 9);
    expect(cuts[3]!.to).toBe(FILE_LENGTH);
  });

  test("places the track's times where the pieces play them, twice when two pieces play them", () => {
    // Bar 33 of the groove (the file's 83.633 s plus 20 ms) plays in piece 2 and again in piece 3.
    const bar33 = 83.653466;
    const placed = piecesPlacing(REEL_PIECES, [bar33]);
    expect(placed).toHaveLength(2);
    expect(placed[1]! - placed[0]!).toBeCloseTo(4 * 4 * PACING.music.period, 4);
    expect(piecesPlacing(REEL_PIECES, [105])).toEqual([]);
  });
});

describe("an item in pieces on the timeline", () => {
  test("an edit saved before pieces parses as it was, with no pieces", () => {
    const timeline = edit({});
    expect("pieces" in timeline.audio[0]!).toBe(false);
    expect(audioLoops({ ...timeline.audio[0]!, loop: true })).toBe(true);
  });

  test("plays its pieces' length, never loops, and is cut by its length and the picture", () => {
    const item = edit({ pieces: REEL_PIECES, loop: true }).audio[0]!;
    expect(audioLoops(item)).toBe(false);
    expect(audioPlayLength(item, 400)).toBeCloseTo(piecesLength(REEL_PIECES), 6);
    expect(audioPlayLength(item, 131.2)).toBeCloseTo(131.2, 6);
    expect(audioPlayLength({ ...item, duration: 30 }, 140)).toBe(30);
    expect(audioPlayLength({ ...item, start: 10 }, 100)).toBeCloseTo(90, 6);
  });

  test("only music plays in pieces", () => {
    const item = edit({ pieces: REEL_PIECES, role: "sfx" }).audio[0]!;
    expect(audioPlayLength(item, 300)).toBeCloseTo(FILE_LENGTH, 6);
    expect(buildRenderRequest(edit({ pieces: REEL_PIECES, role: "sfx" })).params["audio"]).toEqual([
      expect.not.objectContaining({ pieces: expect.anything() }),
    ]);
  });

  test("the render request carries the pieces only when there are any", () => {
    const plain = buildRenderRequest(edit({})).params["audio"] as Array<Record<string, unknown>>;
    expect("pieces" in plain[0]!).toBe(false);
    const cut = buildRenderRequest(edit({ pieces: REEL_PIECES })).params["audio"] as Array<
      Record<string, unknown>
    >;
    expect(cut[0]!["pieces"]).toEqual(REEL_PIECES);
    expect(cut[0]!["loop"]).toBe(false);
  });

  test("pieces too short, too many, or out of the track don't parse", () => {
    expect(
      parseTimeline({
        audio: [{ id: "m", assetId: MUSIC, role: "music", pieces: [{ from: 1, to: 1.2 }] }],
      }),
    ).toBeNull();
    expect(
      parseTimeline({ audio: [{ id: "m", assetId: MUSIC, role: "music", pieces: [] }] }),
    ).toBeNull();
    const many = Array.from({ length: PIECES.max + 1 }, (_, index) => ({
      from: index,
      to: index + 1,
    }));
    expect(
      parseTimeline({ audio: [{ id: "m", assetId: MUSIC, role: "music", pieces: many }] }),
    ).toBeNull();
    expect(
      parseTimeline({
        audio: [{ id: "m", assetId: MUSIC, role: "music", pieces: [{ from: -1, to: 2 }] }],
      }),
    ).toBeNull();
  });

  test("beats and bars follow the pieces: Reel 1's grid runs on unbroken across its joins", () => {
    const item = edit({ pieces: REEL_PIECES }, 131.2).audio[0]!;
    const { period, drop_in_file: drop, film_drop: filmDrop, bars } = PACING.music;
    // Every beat of the file's grid, from 0 s to its end.
    const fileBeats: number[] = [];
    for (let beat = Math.ceil(-drop / period); drop + beat * period < FILE_LENGTH; beat += 1)
      fileBeats.push(Number((drop + beat * period).toFixed(6)));
    const placed = beatTimesOnTimeline(item, fileBeats, 131.2);
    // On the film's clock the beats are one grid: the film's drop plus whole beats.
    for (const time of placed) {
      const beats = (time - filmDrop) / period;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(0.002 / period);
    }
    // The breakdown at bar 44 and the re-entry at bar 50 are bar lines on the film's clock.
    const filmBar = (bar: number) => filmDrop + bar * 4 * period;
    expect(filmBar(44)).toBeCloseTo(bars.breakdown, 3);
    expect(filmBar(50)).toBeCloseTo(bars.reentry, 3);
    const nearest = (time: number) =>
      placed.reduce((best, beat) => (Math.abs(beat - time) < Math.abs(best - time) ? beat : best));
    expect(Math.abs(nearest(bars.breakdown) - bars.breakdown)).toBeLessThan(0.002);
    expect(Math.abs(nearest(bars.reentry) - bars.reentry)).toBeLessThan(0.002);
  });

  test("so do sections: the breakdown and re-entry land on the film's bars 44 and 50", () => {
    const item = edit({ pieces: REEL_PIECES }, 131.2).audio[0]!;
    const { period, drop_in_file: drop, bars } = PACING.music;
    const fileBar = (bar: number) => drop + bar * 4 * period;
    const structure = {
      bpm: 128.99,
      beats: [],
      beatsPerBar: 4,
      downbeats: [],
      bars: [],
      confidence: 1,
      sections: [
        { start: 0, end: fileBar(0), kind: "intro" as const, energy: 0.2 },
        { start: fileBar(0), end: fileBar(40), kind: "drop" as const, energy: 1 },
        { start: fileBar(40), end: fileBar(48), kind: "breakdown" as const, energy: 0 },
        { start: fileBar(48), end: FILE_LENGTH, kind: "reentry" as const, energy: 1 },
      ],
    };
    const { sections } = musicGridOnTimeline(item, structure, 131.2);
    expect(sections.map((section) => section.kind)).toEqual([
      "intro",
      "drop",
      "breakdown",
      "reentry",
    ]);
    expect(sections[1]!.start).toBeCloseTo(PACING.music.film_drop, 2);
    expect(sections[2]!.start).toBeCloseTo(bars.breakdown, 2);
    expect(sections[3]!.start).toBeCloseTo(bars.reentry, 2);
    expect(sections[3]!.end).toBeCloseTo(131.2, 2);
  });
});
