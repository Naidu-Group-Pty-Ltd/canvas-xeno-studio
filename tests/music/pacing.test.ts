import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gridFromBeats,
  gridFromStructure,
  gridOnTimeline,
  solvePacing,
  type PacingAnchor,
  type PacingCut,
  type PacingPause,
} from "../../src/lib/music/pacing";
import { layoutTimeline, parseTimeline, warpCut, warpWord } from "../../src/lib/edit/timeline";
import { measuredVoice } from "../../src/lib/edit/voice-pauses";
import { paceVoiceToMusic } from "../../src/lib/music/pace-edit";

// Reel 1's records: the pacing it solved, its shots on both clocks.
const REEL = join(import.meta.dir, "../../docs/brands/aurixa-reel-1/system-edition");
const pacing = JSON.parse(readFileSync(join(REEL, "pacing.json"), "utf8")) as {
  fps: number;
  pauses: { at: number; frames: number; group: string }[];
  music: {
    period: number;
    film_drop: number;
    bars: { breakdown: number; statements: number[]; reentry: number; final: number };
  };
};
const brief = JSON.parse(readFileSync(join(REEL, "brief.json"), "utf8")) as {
  shots: { id: string; in: number; voice_in: number }[];
};
// What pacing.py was asked: each pause's place, the length it should be near and its limits.
const source = readFileSync(join(import.meta.dir, "../../scripts/aurixa-reel-1/pacing.py"), "utf8");
const asked = [
  ...source.matchAll(/P\(([\d.]+), (None|\d+), (\d+), (\d+), "[^"]*", "(\w+)"\)/g),
].map((match) => ({
  at: Number(match[1]),
  near: match[2] === "None" ? null : Number(match[2]),
  min: Number(match[3]),
  max: Number(match[4]),
  group: match[5]!,
}));
// The close's key words, at the onsets pacing.py measured them on (its KEY_ONSETS).
const onsets = /^KEY_ONSETS = \{([^}]*)\}/m.exec(source)![1]!;
const onset = (word: string) => Number(new RegExp(`"${word}": ([\\d.]+),`).exec(onsets)![1]);

const FPS = pacing.fps;
const { period, film_drop: drop, bars } = pacing.music;
/** The film's beat n (0 is the drop, where the brand arrives) and bar b, as the record has them. */
const beat = (n: number) => drop + n * period;
const bar = (b: number) => beat(4 * b);
const BRAND = 25.867; // shot 04.1's cut, before the drop
const BREAKDOWN = 91.967; // the beat before caption 45 (13.1's "as the music falls away", 111.533 s)

function reelInput() {
  // The music's grid across the film: bar lines every four beats from the drop.
  const beats = Array.from({ length: 300 }, (_, index) => beat(index - 68));
  const cuts: PacingCut[] = brief.shots
    .filter((shot) => shot.voice_in > 0)
    .map((shot) => ({
      id: shot.id,
      at: shot.voice_in,
      // pacing.py asked less of the opening's cuts, before the drop.
      weight: shot.voice_in < BRAND - 1e-6 ? 0.6 : 1,
    }));
  const pauses: PacingPause[] = asked.map(({ at, near, min, max }) => ({ at, near, min, max }));
  const anchors: PacingAnchor[] = [
    // The brand's cut in the silence before the drop, on frame 868.
    { at: BRAND, kind: "cut", frame: 868 },
    // The breakdown on bar 44, in the frame its attack falls in.
    { at: BREAKDOWN, kind: "cut", frame: Math.floor(bars.breakdown * FPS) },
    // The four statements' key words each on its downbeat (bars 46 to 49).
    ...["Fourteen", "business", "experience", "decision"].map((word, index): PacingAnchor => ({
      at: onset(word),
      kind: "word",
      time: bars.statements[index]!,
    })),
    // The closing card on the music's re-entry (bar 50), and its lines on bars 51 and 53.
    { at: 99.467, kind: "cut", frame: Math.floor(bars.reentry * FPS) },
    { at: onset("operating"), kind: "word", time: bar(51) },
    { at: onset("Start"), kind: "word", time: bar(53) },
  ];
  return { fps: FPS, cuts, pauses, anchors, grid: gridFromBeats(beats, 4) };
}

describe("one solver for cuts, voice and music: Reel 1's pacing again", () => {
  test("the records it is checked against hold together", () => {
    expect(asked).toHaveLength(52);
    expect(asked.filter((pause) => pause.group === "open")).toHaveLength(10);
    expect(onset("Fourteen")).toBe(94.6);
    expect(bar(44)).toBeCloseTo(bars.breakdown, 5);
    expect(bar(50)).toBeCloseTo(bars.reentry, 5);
    expect(bar(54)).toBeCloseTo(bars.final, 5);
  });

  test("every pause gets the frames pacing.py gave it", () => {
    const solution = solvePacing(reelInput());
    const solved = new Map(pacing.pauses.map((pause) => [pause.at, pause.frames]));
    for (const pause of solution.pauses) expect(pause.frames).toBe(solved.get(pause.at) ?? 0);
    // pacing.json keeps only the pauses that add something: 'The operating system' needs none.
    expect(solution.pauses.find((pause) => pause.at === 101)?.frames).toBe(0);
    expect(solution.frames).toBe(715);
  });

  test("every cut lands on the frame the film cuts on", () => {
    const solution = solvePacing(reelInput());
    const film = new Map(brief.shots.map((shot) => [shot.id, Math.round(shot.in * FPS)]));
    expect(solution.cuts).toHaveLength(26);
    for (const cut of solution.cuts) expect(cut.frame).toBe(film.get(cut.id));
    // And as the warp moves them, with the pauses it solved.
    for (const cut of solution.cuts)
      expect(Math.round(warpCut(solution.pauses, cut.at, FPS) * FPS)).toBe(cut.frame);
  });

  test("the cuts after the drop land on the music, and the anchors exactly where they must", () => {
    const solution = solvePacing(reelInput());
    const landing = Object.fromEntries(solution.cuts.map((cut) => [cut.id, cut.landing]));
    expect(landing["04.1"]).toBe("anchored");
    expect(landing["15.1"]).toBe("anchored");
    // pacing.py's table: 05.1, 10.1 and 12.3 on bar lines, the rest of the body on beats.
    expect(["05.1", "10.1", "12.3"].map((id) => landing[id])).toEqual(["bar", "bar", "bar"]);
    const body = solution.cuts.filter((cut) => cut.at > BRAND && cut.at < BREAKDOWN);
    expect(body.every((cut) => cut.landing === "bar" || cut.landing === "beat")).toBe(true);
    // Each statement's key word on its downbeat: its onset within half a frame of the bar line.
    ["Fourteen", "business", "experience", "decision"].forEach((word, index) => {
      const landed = warpWord(solution.pauses, onset(word), FPS);
      expect(Math.abs(landed - bars.statements[index]!)).toBeLessThanOrEqual(0.5 / FPS);
    });
  });
});

describe("the solver on its own", () => {
  // A beat every 15 frames at 30 fps (120 BPM), a bar every 4.
  const grid = gridFromBeats(Array.from({ length: 40 }, (_, index) => index * 0.5));

  test("moves a cut onto the music when the room is cheap, and leaves it where it isn't", () => {
    const solve = (at: number) =>
      solvePacing({
        fps: 30,
        cuts: [{ id: "a", at }],
        pauses: [{ at: 1, near: 0, min: 0, max: 15 }],
        grid,
      });
    // 1.8 s is frame 54: five frames on, the bar line at 2 s (frame 60) costs 0.012 x 25.
    const bar = solve(1.8);
    expect(bar.cuts[0]).toMatchObject({ frame: 59, landing: "bar" });
    expect(bar.pauses[0]!.frames).toBe(5);
    expect(bar.cost).toBeCloseTo(0.3, 9);
    // 2.8 s (frame 84): five frames reach the beat at 3 s, for 0.3 + 0.25.
    expect(solve(2.8).cuts[0]).toMatchObject({ frame: 89, landing: "beat" });
    // 2.6 s (frame 78): eleven frames to the beat would cost 1.7, more than staying off it (1).
    const off = solve(2.6);
    expect(off.cuts[0]).toMatchObject({ frame: 78, landing: "off" });
    expect(off.frames).toBe(0);
  });

  test("shares a stretch's frames among its pauses in proportion to what each should be near", () => {
    const solution = solvePacing({
      fps: 30,
      cuts: [],
      pauses: [
        { at: 1, near: 6, min: 0, max: 30 },
        { at: 2, near: 3, min: 0, max: 30 },
      ],
      grid,
      anchors: [{ at: 3, kind: "cut", frame: 90 + 18 }],
    });
    expect(solution.pauses).toEqual([
      { at: 1, frames: 12 },
      { at: 2, frames: 6 },
    ]);
  });

  test("says when the pauses can't reach an anchor", () => {
    expect(() =>
      solvePacing({
        fps: 30,
        cuts: [],
        pauses: [{ at: 1, near: 3, min: 0, max: 6 }],
        grid,
        anchors: [{ at: 2, kind: "cut", frame: 60 + 20 }],
      }),
    ).toThrow(/needs 20 frames added before it, and the pauses allow 0 to 6/);
  });

  test("a word anchor counts a pause at its own moment; a cut anchor doesn't", () => {
    const pauses: PacingPause[] = [{ at: 2, near: null, min: 0, max: 30 }];
    const word = solvePacing({
      fps: 30,
      cuts: [],
      pauses,
      grid,
      anchors: [{ at: 2, kind: "word", time: 2.5 }],
    });
    expect(word.pauses[0]!.frames).toBe(15);
    expect(() =>
      solvePacing({
        fps: 30,
        cuts: [],
        pauses,
        grid,
        anchors: [{ at: 2, kind: "cut", frame: 75 }],
      }),
    ).toThrow(/needs 15 frames/);
  });
});

describe("grids", () => {
  test("from a beat analysis: a bar line every four beats from the first", () => {
    expect(gridFromBeats([0.5, 1, 1.5, 2, 2.5]).bars).toEqual([true, false, false, false, true]);
  });

  test("from a music structure: the beats its downbeats fall on", () => {
    const grid = gridFromStructure({ beats: [0.5, 1, 1.5, 2], downbeats: [1.0004] });
    expect(grid.bars).toEqual([false, true, false, false]);
  });

  test("on the edit, as a music item plays it: from its trim point, then looped", () => {
    const grid = gridFromBeats([0, 1, 2, 3], 2);
    const placed = gridOnTimeline(
      { start: 1, trimStart: 1, duration: null, sourceDuration: 4, loop: true },
      grid,
      9,
    );
    expect(placed.beats).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(placed.bars).toEqual([false, true, false, true, false, true, false, true, false]);
  });
});

describe("pacing an edit's voiceover to its music", () => {
  const VOICE = "bbbbbbbb-1111-4111-8111-111111111111";
  const STILL = "dddddddd-1111-4111-8111-111111111111";
  const timeline = parseTimeline({
    fps: 30,
    clips: [
      { id: "c1", assetId: STILL, kind: "image", duration: 4.4 },
      { id: "c2", assetId: STILL, kind: "image", duration: 3.5 },
      { id: "c3", assetId: STILL, kind: "image", duration: 3 },
    ],
    audio: [{ id: "v1", assetId: VOICE, role: "voiceover", sourceDuration: 10 }],
    captions: { enabled: true, segments: [{ start: 3.9, end: 7.4, text: "The second line" }] },
  })!;
  // Silences at 0-0.1, 3.5-3.9, 7.4-7.9 and 9.8-10; a beat every half second, a bar every two.
  const voice = measuredVoice({
    duration: 10,
    speech: [
      [0.1, 3.5],
      [3.9, 7.4],
      [7.9, 9.8],
    ],
  });
  const grid = gridFromBeats(Array.from({ length: 30 }, (_, index) => index * 0.5));

  test("adds room where it lands the cuts on the music, and moves the picture and captions with it", () => {
    const change = paceVoiceToMusic(timeline, "v1", voice, grid)!;
    // Two frames in the break before the first cut put it on the beat at 4.5 s (frame 134),
    // and so the second on the bar line at 8 s (frame 239) with no more room needed.
    expect(change.timeline.audio[0]!.pauses).toEqual([{ at: 3.7, frames: 2 }]);
    expect(
      layoutTimeline(change.timeline).clips.map((entry) => Math.round(entry.end * 30)),
    ).toEqual([134, 239, 329]);
    expect(change.cuts).toEqual({ total: 2, moved: 2, onBars: 1, onBeats: 1, onBarsBefore: 0 });
    expect(change.pauses).toEqual({ before: 0, after: 1, framesBefore: 0, framesAfter: 2 });
    expect(change.length.after - change.length.before).toBeCloseTo(2 / 30, 9);
    expect(change.timeline.captions.segments[0]).toMatchObject({ start: 3.967, end: 7.467 });
    expect(change.shortClips).toEqual([]);
  });

  test("asked again, it changes nothing more", () => {
    const once = paceVoiceToMusic(timeline, "v1", voice, grid)!.timeline;
    const twice = paceVoiceToMusic(once, "v1", voice, grid)!;
    expect(twice.timeline.audio[0]!.pauses).toEqual(once.audio[0]!.pauses);
    expect(twice.cuts.moved).toBe(0);
  });

  test("has nothing to do without a voiceover or a cut after it starts", () => {
    expect(paceVoiceToMusic(timeline, "nope", voice, grid)).toBeNull();
    const single = { ...timeline, clips: timeline.clips.slice(0, 1) };
    expect(paceVoiceToMusic(single, "v1", voice, grid)).toBeNull();
  });
});
