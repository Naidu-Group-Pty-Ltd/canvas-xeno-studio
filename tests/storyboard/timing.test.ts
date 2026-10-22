import { describe, expect, test } from "bun:test";
import {
  barsFromStructure,
  cutBeforeWord,
  describeGridMark,
  findCue,
  musicGrid,
  nearestOnGrid,
  sameWord,
  speechFromWords,
  speechOnset,
  timeShotsFromVoice,
  wordTokens,
  type MusicGrid,
} from "../../src/lib/storyboard/timing";
import { BRIEF, FPS, PACING, SPEC, SPEECH, VOICE_SECONDS, WORDS, wordAt } from "./reel-1";

const frame = (seconds: number) => Math.round(seconds * FPS);
const cutAt = (start: number) => cutBeforeWord(WORDS, wordAt(start), SPEECH, FPS);

/**
 * What timing.py computed for the words it was given the word before for:
 * the pack's 28 cues, and the five words shots start on inside a cue.
 * (python3 -c "import sys; sys.path.insert(0, 'scripts/aurixa-reel-1');
 * import timing; print({k: timing.cut_before(k) for k in timing.PREV_END})")
 */
const TIMING_PY: [number, number][] = [
  [0, 0.033],
  [4.44, 4.2],
  [8.5, 8.267],
  [17.78, 17.6],
  [21.12, 20.933],
  [23.68, 23.533],
  [26, 25.867],
  [31.26, 30.867],
  [37.74, 37.4],
  [45.68, 45.233],
  [53.72, 53.567],
  [58.04, 57.633],
  [60.92, 60.7],
  [67.26, 67.033],
  [71.68, 71.5],
  [73.62, 73.367],
  [76.2, 76.0],
  [79.6, 79.267],
  [83.14, 82.933],
  [90.42, 90.133],
  [92.24, 91.967],
  [94.98, 94.4],
  [95.98, 95.7],
  [97.08, 96.8],
  [98.42, 98.1],
  [99.94, 99.467],
  [101.22, 101.1],
  [104.7, 104.3],
  [40.08, 39.9],
  [42.5, 42.333],
  [50.98, 50.7],
  [61.9, 61.733],
  [86.8, 86.533],
];

describe("the cut rule, on Reel 1's measured voice", () => {
  test("puts every cut timing.py was given the word before for exactly where it put it", () => {
    for (const [start, cut] of TIMING_PY) {
      const result = cutAt(start);
      expect({ start, frame: result.frame }).toEqual({ start, frame: frame(cut) });
      expect(result.seconds).toBeCloseTo(cut, 3);
    }
    // The pack's cues are all there, with the drift that made the rule necessary.
    expect(SPEC.timing.cues).toHaveLength(28);
    const drift = Math.max(
      ...SPEC.timing.cues.map((cue) => Math.abs(cue.start - cue.pack_estimate)),
    );
    expect(drift).toBeCloseTo(2.578, 3);
  });

  test("starts every block where the spec's blocks start", () => {
    // A block starts on its first cue's cut (the first block at 0, where the edit starts).
    for (const block of SPEC.timing.blocks.slice(1)) {
      const cue = SPEC.timing.cues.find(
        (entry) => Math.abs(cutAt(entry.start).seconds - block.in) < 1e-3,
      );
      expect({ block: block.block, found: !!cue }).toEqual({ block: block.block, found: true });
    }
  });

  test("cuts in the pause, through speech or mid-phrase, and says which", () => {
    // "A client wants…": the speech opens at 4.36 after a pause from 3.77; 0.15 s ahead of it.
    expect(cutAt(4.44)).toEqual({ frame: 126, seconds: 4.2, onset: 4.36, place: "pause" });
    // "financial analysis" comes in the middle of a stretch of speech: 0.15 s ahead of the word.
    expect(cutAt(40.08)).toMatchObject({ seconds: 39.9, onset: 40.08, place: "speech" });
    // A pause shorter than 0.15 s: the cut keeps 0.04 s after the speech before it instead.
    expect(cutAt(1.68)).toMatchObject({ frame: 41, onset: 1.43, place: "pause" });
    // Speech that runs straight on (a gap under 0.05 s): 0.1 s ahead of the onset.
    const joined = cutBeforeWord(
      [
        { text: "one", start: 0.2, end: 1.0 },
        { text: "two", start: 1.03, end: 1.6 },
      ],
      1,
      [
        [0.2, 1.0],
        [1.03, 1.6],
      ],
      FPS,
    );
    expect(joined).toMatchObject({ frame: 27, onset: 1.03, place: "join" });
  });

  test("where timing.py had no word before, the studio still cuts in the pause before the speech", () => {
    // Five captions timing.py was not given the word before for: it looked for the speech
    // onset from the word's own (rough) start, missed it, and cut after the onset or with
    // less than the 0.15 s lead. The rule reads the word before from the measured words.
    const differences: [number, number, number][] = [
      // [the caption's first word, timing.py's cut, the onset of its speech]
      [1.68, 1.5, 1.43],
      [13.44, 13.433, 13.26],
      [32.06, 31.9, 31.93],
      [47.18, 47.0, 46.88],
      [63.68, 63.5, 63.49],
    ];
    for (const [start, theirs, onset] of differences) {
      const cut = cutAt(start);
      expect(cut.onset).toBe(onset);
      const before = Math.max(...SPEECH.filter(([, end]) => end <= onset).map(([, end]) => end));
      expect(cut.seconds).toBeGreaterThan(before);
      expect(cut.seconds).toBeLessThan(onset - 0.05);
      expect(theirs).toBeGreaterThan(onset - 0.05);
    }
  });

  test("the onset is where a stretch of speech opens after the word before ends", () => {
    expect(speechOnset(WORDS, wordAt(0), SPEECH)).toBe(0.05);
    expect(speechOnset(WORDS, wordAt(17.78), SPEECH)).toBe(17.75);
    // Nothing opens near it: the word's own start.
    expect(speechOnset(WORDS, wordAt(61.9), SPEECH)).toBe(61.9);
    expect(() => speechOnset(WORDS, WORDS.length, SPEECH)).toThrow();
  });

  test("floors to the frame the moment falls in, at any frame rate, never before 0", () => {
    const words = [
      { text: "Hello", start: 0.02, end: 0.5 },
      { text: "there", start: 1.31, end: 1.8 },
    ];
    const speech: [number, number][] = [
      [0.02, 0.5],
      [1.31, 1.8],
    ];
    // 1.31 - 0.15 = 1.16 s.
    expect(cutBeforeWord(words, 1, speech, 24).frame).toBe(27);
    expect(cutBeforeWord(words, 1, speech, 25).frame).toBe(29);
    expect(cutBeforeWord(words, 1, speech, 60).frame).toBe(69);
    expect(cutBeforeWord(words, 0, speech, 30).frame).toBe(0);
  });
});

describe("finding a shot's cue in the voiceover", () => {
  test("reads script and recogniser alike", () => {
    expect(wordTokens("WHAT HAPPENS THEN – The market")).toEqual([
      "what",
      "happens",
      "then",
      "the",
      "market",
    ]);
    expect(wordTokens("with a 14-day free trial.")).toEqual([
      "with",
      "a",
      "14",
      "day",
      "free",
      "trial",
    ]);
    expect(wordTokens("Fourteen days.")).toEqual(["14", "days"]);
    expect(wordTokens("It’s right")).toEqual(["its", "right"]);
    expect(sameWord("aurixa", "arixa")).toBe(true);
    expect(sameWord("judgement", "judgment")).toBe(true);
    expect(sameWord("agent", "agents")).toBe(true);
    expect(sameWord("the", "they")).toBe(false);
    expect(sameWord("market", "moving")).toBe(false);
  });

  test("finds each cue after the one before, in the recogniser's spellings", () => {
    const at = (cue: string, from = 0) => {
      const match = findCue(WORDS, cue, from);
      return match ? WORDS[match.index]!.start : null;
    };
    expect(at("Aurixa Systems was built by property professionals")).toBe(26);
    // "Fourteen days." after "Don't just take our word for it" (13.1's cue), not the "14 day" of the trial.
    expect(at("Fourteen days.", wordAt(90.42))).toBe(94.98);
    expect(at("with a 14-day free trial.")).toBe(80.66);
    // "Aurixa Systems" is said three times: the cue is found after the one before it.
    expect(at("Aurixa Systems.", wordAt(94.98))).toBe(99.94);
    expect(at("Your decision.")).toBe(98.42);
    // "A client wants…", not the "a" of "a property opportunity" before it.
    expect(at("A client wants to know if it's right for them,", 1)).toBe(4.44);
    expect(at("Nobody says this")).toBeNull();
    expect(at("")).toBeNull();
    expect(findCue(WORDS, "Your business.")).toMatchObject({ matched: 2, compared: 2 });
  });
});

describe("a storyboard timed from the voice", () => {
  const shots = BRIEF.shots.map((shot) => ({
    id: shot.id,
    cue: shot.voiceover[0] ?? null,
    seconds: shot.seconds,
  }));
  const timing = timeShotsFromVoice({
    shots,
    words: WORDS,
    speech: SPEECH,
    fps: FPS,
    durationSeconds: VOICE_SECONDS,
  });

  test("cuts the system edition's 27 shots where its brief does, but for 06.2", () => {
    expect(timing.timed).toBe(26);
    expect(timing.shots[0]).toMatchObject({ id: "01.1", timing: "first", startFrame: 0 });
    for (const [index, shot] of BRIEF.shots.entries()) {
      const timed = timing.shots[index]!;
      expect(timed.problem).toBeNull();
      if (shot.id === "06.2") continue;
      expect({ id: shot.id, frame: timed.startFrame }).toEqual({
        id: shot.id,
        frame: frame(shot.voice_in),
      });
    }
    // 06.2 starts on "client relationships…": its speech opens at 46.88, after the pause
    // from 46.67. The brief (from timing.py, without the word before) cuts at 47.0, inside it.
    const sixTwo = timing.shots.find((shot) => shot.id === "06.2")!;
    expect(BRIEF.shots.find((shot) => shot.id === "06.2")!.voice_in).toBe(47);
    expect(sixTwo).toMatchObject({ start: 46.7, onset: 46.88, place: "pause", word: "client" });
  });

  test("runs end to end on the frame grid, each shot to the next one's start", () => {
    timing.shots.forEach((shot, index) => {
      const next = timing.shots[index + 1];
      expect(shot.endFrame).toBe(next ? next.startFrame : Math.ceil(VOICE_SECONDS * FPS));
      expect(shot.seconds).toBeCloseTo((shot.endFrame - shot.startFrame) / FPS, 6);
    });
    expect(timing.end).toBeCloseTo(3181 / FPS, 6);
    const total = timing.shots.reduce((sum, shot) => sum + shot.endFrame - shot.startFrame, 0);
    expect(total).toBe(3181);
  });

  test("names each shot's word and how far the voice moved it", () => {
    const brand = timing.shots.find((shot) => shot.id === "04.1")!;
    expect(brand).toMatchObject({ word: "Arixa", timing: "voice", place: "pause" });
    // Its brief lengths are on the paced film's clock, so the voice clock runs earlier.
    expect(brand.drift).toBeLessThan(0);
  });

  test("keeps a shot with no cue at its length, and says when a cue isn't spoken", () => {
    const result = timeShotsFromVoice({
      shots: [
        { id: "a", cue: "Somewhere in Australia", seconds: 4 },
        { id: "b", cue: null, seconds: 2 },
        { id: "c", cue: "Not a line of this voiceover", seconds: 2 },
        { id: "d", cue: "But before you can answer", seconds: 5 },
        { id: "e", cue: "A client wants to know", seconds: 2 },
      ],
      words: WORDS,
      speech: SPEECH,
      fps: FPS,
      durationSeconds: 12,
    });
    const [a, b, c, d, e] = result.shots;
    expect(a).toMatchObject({ timing: "first", start: 0, end: 4 });
    expect(b).toMatchObject({ timing: "kept", start: 4, end: 6, problem: null });
    expect(c).toMatchObject({ timing: "kept", start: 6 });
    expect(c!.problem).toContain("isn't in the voiceover");
    expect(d).toMatchObject({ timing: "voice", startFrame: frame(8.267), word: "But" });
    // Cues are looked for in order: one spoken before the shot before's isn't found after it.
    expect(e!.timing).toBe("kept");
    expect(e!.problem).toContain("isn't in the voiceover after");
    // It follows d at d's length, past the voiceover's end, and still runs a frame.
    expect(e).toMatchObject({ startFrame: 398, endFrame: 399 });
    expect(result.end).toBeCloseTo(399 / FPS, 6);
    const late = timeShotsFromVoice({
      shots: [
        { id: "a", cue: null, seconds: 3 },
        { id: "b", cue: null, seconds: 2 },
      ],
      words: WORDS,
      speech: SPEECH,
      fps: FPS,
      durationSeconds: 2,
    });
    expect(late.shots[1]!.problem).toBe("It starts after the voiceover ends.");
  });

  test("keeps a cue spoken before the shot before starts after it, and says so", () => {
    const result = timeShotsFromVoice({
      shots: [
        { id: "a", cue: null, seconds: 5 },
        { id: "b", cue: null, seconds: 3 },
        { id: "c", cue: "A client wants to know", seconds: 1 },
      ],
      words: WORDS,
      speech: SPEECH,
      fps: FPS,
      durationSeconds: 10,
    });
    // Its cut (4.2) comes before b starts (5): it follows b at b's length instead.
    expect(result.shots[2]).toMatchObject({ timing: "kept", start: 8, word: "A" });
    expect(result.shots[2]!.problem).toContain("spoken before the shot before starts");
    expect(result.shots[0]).toMatchObject({ start: 0, end: 5, problem: null });
  });

  test("lets the next cue shorten a shot with no cue of its own", () => {
    const result = timeShotsFromVoice({
      shots: [
        { id: "a", cue: null, seconds: 6 },
        { id: "b", cue: "A client wants to know", seconds: 1 },
      ],
      words: WORDS,
      speech: SPEECH,
      fps: FPS,
      durationSeconds: 8,
    });
    expect(result.shots[0]).toMatchObject({ start: 0, end: 4.2, problem: null });
    expect(result.shots[1]).toMatchObject({ start: 4.2, timing: "voice" });
  });

  test("finds speech from the words when the analysis has none", () => {
    const words = [
      { text: "One", start: 0.1, end: 0.4 },
      { text: "two", start: 0.42, end: 0.8 },
      { text: "Three", start: 1.5, end: 1.9 },
    ];
    expect(speechFromWords(words)).toEqual([
      [0.1, 0.8],
      [1.5, 1.9],
    ]);
    const result = timeShotsFromVoice({
      shots: [
        { id: "a", cue: "One two" },
        { id: "b", cue: "Three" },
      ],
      words,
      speech: [],
      fps: FPS,
      durationSeconds: 2.5,
    });
    // 0.15 s ahead of its onset (1.5), on the frame that falls in.
    expect(result.shots[1]).toMatchObject({ startFrame: 40, place: "pause" });
  });
});

describe("the music beside the cuts", () => {
  // The third cut's grid on the film's clock: a beat every 0.465 s from the drop at 29.697 s,
  // four beats a bar (pacing.py).
  const period = PACING.music.period;
  const drop = 29.697108;
  const beats: number[] = [];
  for (let n = -63; drop + n * period <= PACING.end; n += 1) beats.push(drop + n * period);
  const film: MusicGrid = {
    beats,
    bars: beats.filter((_, index) => (index - 63) % 4 === 0),
    bpm: 128.99,
  };
  const shotIn = (id: string) => BRIEF.shots.find((shot) => shot.id === id)!.in;

  test("puts the closing card on the bar of the music's return, and 09.1 on its beat", () => {
    const close = nearestOnGrid(shotIn("15.1"), film)!;
    expect(close.kind).toBe("bar");
    expect(close.at).toBeCloseTo(drop + 200 * period, 6);
    expect(describeGridMark(close, FPS)).toMatch(/^On bar \d+$/);
    const register = nearestOnGrid(shotIn("09.1"), film)!;
    expect(register.kind).toBe("beat");
    expect(describeGridMark(register, FPS)).toMatch(/^On beat \d+$/);
    // Block 14 cuts in ahead of its four bars, so its statements land on them.
    const statements = nearestOnGrid(shotIn("14.1"), film)!;
    expect(statements).toMatchObject({ kind: "bar" });
    expect(describeGridMark(statements, FPS)).toMatch(/^0\.22 s before bar \d+$/);
  });

  test("moves a track's grid to where it plays under the voiceover", () => {
    // The drop is 22.255 s into the file and 29.697 s into the film.
    const offset = drop - PACING.music.drop_in_file;
    const fileBeats = beats.map((at) => at - offset).filter((at) => at >= 0);
    const grid = musicGrid(
      { bpm: 128.99, beats: fileBeats, structure: { downbeats: [PACING.music.drop_in_file] } },
      offset,
    );
    expect(grid.bars).toEqual([Number(drop.toFixed(6))]);
    expect(grid.beats[0]).toBeGreaterThanOrEqual(offset - 1e-6);
    expect(grid.bpm).toBe(128.99);
    expect(musicGrid({ bpm: null, beats: null }).beats).toEqual([]);
  });

  test("reads bars from a structure in any of its shapes, else none", () => {
    expect(barsFromStructure({ bars: [3, 1, 2, 2] })).toEqual([1, 2, 3]);
    expect(barsFromStructure({ bars: [{ start: 1.5, end: 3.4 }, { at: 3.4 }] })).toEqual([
      1.5, 3.4,
    ]);
    expect(barsFromStructure({ downbeats: [0.5, 2.36] })).toEqual([0.5, 2.36]);
    expect(barsFromStructure({ bars: [], downbeats: [0.5] })).toEqual([0.5]);
    expect(barsFromStructure(null)).toEqual([]);
    expect(barsFromStructure({ bars: ["x", -1] })).toEqual([]);
    expect(nearestOnGrid(3, { beats: [], bars: [], bpm: null })).toBeNull();
  });
});
