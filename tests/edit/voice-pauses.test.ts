import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  audioPlayLength,
  buildRenderRequest,
  cutShift,
  editVoicePauses,
  layoutTimeline,
  parseTimeline,
  pauseSilences,
  pausesOnEdit,
  retimeForPauses,
  voicePosition,
  warpCut,
  warpWord,
  withVoicePauses,
  wordShift,
  type Timeline,
  type VoicePause,
} from "../../src/lib/edit/timeline";
import {
  breathingRoom,
  measuredVoice,
  pauseProblem,
  placePause,
  settlePauses,
} from "../../src/lib/edit/voice-pauses";
// @ts-expect-error The media worker is plain JavaScript.
import { mixArgs, pacedRegions, planSequence } from "../../media-worker/src/sequence.js";

// Reel 1's records: the pauses pacing.py solved, the shots on both clocks, the measured voice.
const REEL = join(import.meta.dir, "../../docs/brands/aurixa-reel-1/system-edition");
const pacing = JSON.parse(readFileSync(join(REEL, "pacing.json"), "utf8")) as {
  fps: number;
  end: number;
  voiceover: { seconds: number; speech_end: number };
  pauses: { at: number; frames: number }[];
};
const brief = JSON.parse(readFileSync(join(REEL, "brief.json"), "utf8")) as {
  shots: { id: string; in: number; voice_in: number }[];
};
const { words } = JSON.parse(readFileSync(join(REEL, "voiceover-words.json"), "utf8")) as {
  words: { text: string; start: number; end: number }[];
};
// The speech segments the studio's preparation measured, as timing.py keeps them.
const timingSource = readFileSync(
  join(import.meta.dir, "../../scripts/aurixa-reel-1/timing.py"),
  "utf8",
);
const speech = JSON.parse(/^speech = (\[.*\])$/m.exec(timingSource)![1]!) as [number, number][];
const reelPauses: VoicePause[] = pacing.pauses.map(({ at, frames }) => ({ at, frames }));
const reelVoice = measuredVoice({ duration: pacing.voiceover.seconds, speech, words });

const CLIP = "aaaaaaaa-1111-4111-8111-111111111111";
const STILL = "dddddddd-1111-4111-8111-111111111111";
const VOICE = "bbbbbbbb-1111-4111-8111-111111111111";
const MUSIC = "cccccccc-1111-4111-8111-111111111111";

function edit(overrides: Record<string, unknown> = {}): Timeline {
  const timeline = parseTimeline({
    fps: 30,
    clips: [
      { id: "c1", assetId: STILL, kind: "image", duration: 4 },
      { id: "c2", assetId: STILL, kind: "image", duration: 4 },
      { id: "c3", assetId: CLIP, kind: "video", duration: 4, sourceDuration: 4.2 },
    ],
    audio: [
      { id: "v1", assetId: VOICE, role: "voiceover", sourceDuration: 10 },
      { id: "m1", assetId: MUSIC, role: "music", volume: 0.6 },
    ],
    ...overrides,
  });
  if (!timeline) throw new Error("timeline didn't parse");
  return timeline;
}

describe("Reel 1's pacing, from its records", () => {
  test("every shot's cut lands where the film puts it: moved by the pauses strictly before it", () => {
    expect(brief.shots).toHaveLength(27);
    for (const shot of brief.shots) {
      const landed = warpCut(reelPauses, shot.voice_in, pacing.fps);
      expect(Math.round(landed * pacing.fps)).toBe(Math.round(shot.in * pacing.fps));
    }
  });

  test("a pause on a cut opens the new shot: the cut stays, the word after it moves", () => {
    // 25.867: "the logo, on the drop, before 'Aurixa Systems'", exactly on shot 04.1's cut.
    expect(Math.round(warpCut(reelPauses, 25.867, 30) * 30)).toBe(868);
    expect(Math.round(warpWord(reelPauses, 25.867, 30) * 30)).toBe(868 + 54);
    expect(wordShift(reelPauses, 25.867, 30) - cutShift(reelPauses, 25.867, 30)).toBeCloseTo(
      1.8,
      9,
    );
  });

  test("the key words land where pacing.py placed them", () => {
    const keys: [number, number][] = [
      [94.6, 115.267],
      [96.19, 117.157],
      [97.34, 119.007],
      [98.63, 120.863],
      [101.36, 124.593],
      [104.47, 128.303],
    ];
    for (const [voice, film] of keys) expect(warpWord(reelPauses, voice, 30)).toBeCloseTo(film, 3);
  });

  test("the pauses are whole frames and add 23.833 s; the voice still ends inside the film", () => {
    expect(reelPauses).toHaveLength(51);
    expect(reelPauses.every((pause) => Number.isInteger(pause.frames))).toBe(true);
    const frames = reelPauses.reduce((sum, pause) => sum + pause.frames, 0);
    expect(frames).toBe(715);
    expect(frames / 30).toBeCloseTo(23.833, 3);
    expect(warpWord(reelPauses, pacing.voiceover.speech_end, 30)).toBeLessThan(pacing.end);
  });

  test("every one of the reel's pauses sits in a measured silence, clear of every word", () => {
    for (const pause of reelPauses) expect(pauseProblem(pause.at, reelVoice)).toBeNull();
  });

  test("a voiceover laid out with the reel's pauses plays 129.864 s, and sends all 51", () => {
    const timeline = edit({
      clips: [{ id: "c1", assetId: STILL, kind: "image", duration: 131.2 }],
      audio: [
        {
          id: "v1",
          assetId: VOICE,
          role: "voiceover",
          sourceDuration: pacing.voiceover.seconds,
          pauses: reelPauses,
        },
      ],
    });
    const item = timeline.audio[0]!;
    expect(audioPlayLength(item, 131.2, 30)).toBeCloseTo(106.031 + 715 / 30, 6);
    const { params } = buildRenderRequest(timeline);
    const sent = (params.audio as { pauses?: VoicePause[] }[])[0]!.pauses!;
    expect(sent).toHaveLength(51);
    expect(sent[0]).toEqual({ at: 0, frames: 26 });
  });
});

describe("where a pause may go", () => {
  test("never inside a word, nor where someone speaks", () => {
    // "Australia" runs 0.78-1.14; speech runs 0.05-1.33.
    expect(pauseProblem(0.96, reelVoice)).toContain("“Australia”");
    expect(pauseProblem(1.3, reelVoice)).toBe("it falls where someone is speaking");
    expect(pauseProblem(1.38, reelVoice)).toBeNull();
    expect(pauseProblem(0, reelVoice)).toBeNull();
    expect(pauseProblem(120, reelVoice)).toBe("it comes after the recording ends");
  });

  test("the silences between the speech, each with where its pause goes and what it follows", () => {
    expect(reelVoice.silences[0]).toMatchObject({ from: 0, at: 0, kind: "start", after: null });
    const afterAppeared = reelVoice.silences.find((silence) => silence.after === "appeared")!;
    // Speech 3.05-3.77, then 4.36-6.32: the silence after "appeared" (ends 3.72).
    expect(afterAppeared).toMatchObject({ from: 3.77, to: 4.36, kind: "sentence" });
    expect(pauseProblem(afterAppeared.at, reelVoice)).toBeNull();
    for (const silence of reelVoice.silences)
      expect(pauseProblem(silence.at, reelVoice)).toBeNull();
  });

  test("the words' rough timings don't stop a pause where the speech is silent", () => {
    // The recogniser runs "lead" (57.06-57.68) into the silence after it (speech ends at
    // 57.34): Reel 1 paused there twice, and nothing of the word sounds after the pause.
    expect(pauseProblem(57.4, reelVoice)).toBeNull();
    expect(pauseProblem(57.633, reelVoice)).toBeNull();
  });

  test("a silence inside a word, with its sound on both sides, is no place to pause", () => {
    // "approved": a stop held long enough to measure as a gap in the speech.
    const voice = measuredVoice({
      duration: 3,
      speech: [
        [0.5, 1.0],
        [1.1, 1.6],
      ],
      words: [{ text: "approved", start: 0.5, end: 1.6 }],
    });
    expect(pauseProblem(1.05, voice)).toBe("it falls inside the word “approved”");
    expect(voice.silences.map((silence) => silence.from)).toEqual([0, 1.6]);
  });

  test("a pause just off a silence is snapped into it; one deep in a sentence is refused", () => {
    expect(placePause(1.38, reelVoice)).toBe(1.38);
    const snapped = placePause(1.25, reelVoice)!;
    expect(pauseProblem(snapped, reelVoice)).toBeNull();
    expect(snapped).toBeGreaterThan(1.33);
    expect(snapped).toBeLessThan(1.43);
    expect(placePause(16.3, reelVoice)).toBeNull();
    const settled = settlePauses(
      [
        { at: 1.25, frames: 6 },
        { at: 16.3, frames: 6 },
        { at: 3.95, frames: 12 },
      ],
      reelVoice,
    );
    expect(settled.snapped).toBe(1);
    expect(settled.refused).toEqual([{ at: 16.3, reason: "it falls inside the word “hasn't”" }]);
    expect(settled.pauses.map((pause) => pause.frames)).toEqual([6, 12]);
  });

  test("a recording whose speech couldn't be told from the rest offers only its opening", () => {
    const unclear = measuredVoice({ duration: 10, speech: [], clear: false });
    expect(unclear.silences).toEqual([{ from: 0, to: 0, at: 0, kind: "start", after: null }]);
  });

  test("more room after every sentence: one pause in each, the rest kept", () => {
    const room = breathingRoom(reelVoice, [{ at: 6.39, frames: 3 }], {
      frames: 9,
      after: "sentences",
    });
    const sentences = reelVoice.silences.filter((silence) => silence.kind === "sentence");
    expect(sentences.length).toBeGreaterThan(10);
    expect(room.filter((pause) => pause.frames === 9)).toHaveLength(sentences.length);
    for (const pause of room) expect(pauseProblem(pause.at, reelVoice)).toBeNull();
  });
});

describe("a voiceover's pauses in the timeline", () => {
  test("an edit saved before pauses opens with none; pauses are whole frames, sorted, one per moment", () => {
    expect(edit().audio[0]!.pauses).toEqual([]);
    const timeline = edit({
      audio: [
        {
          id: "v1",
          assetId: VOICE,
          role: "voiceover",
          pauses: [
            { at: 3, frames: 4 },
            { at: 1, frames: 2 },
            { at: 3, frames: 5 },
          ],
        },
      ],
    });
    expect(timeline.audio[0]!.pauses).toEqual([
      { at: 1, frames: 2 },
      { at: 3, frames: 9 },
    ]);
    const bad = (pause: Record<string, unknown>) =>
      parseTimeline({ audio: [{ id: "v1", assetId: VOICE, role: "voiceover", pauses: [pause] }] });
    expect(bad({ at: 1, frames: 0 })).toBeNull();
    expect(bad({ at: 1, frames: 301 })).toBeNull();
    expect(bad({ at: 1, frames: 2.5 })).toBeNull();
    expect(bad({ at: -1, frames: 2 })).toBeNull();
  });

  test("a held voice is silent for each pause's frames, then goes on from where it stopped", () => {
    const item = edit({
      audio: [
        {
          id: "v1",
          assetId: VOICE,
          role: "voiceover",
          trimStart: 1,
          pauses: [
            { at: 2, frames: 15 },
            { at: 3, frames: 30 },
          ],
        },
      ],
    }).audio[0]!;
    expect(voicePosition(item, 0.5, 30)).toEqual({ source: 1.5, held: false });
    expect(voicePosition(item, 1.2, 30)).toEqual({ source: 2, held: true });
    expect(voicePosition(item, 1.5, 30).held).toBe(false);
    expect(voicePosition(item, 1.75, 30).source).toBeCloseTo(2.25, 9);
    expect(voicePosition(item, 2.6, 30)).toEqual({ source: 3, held: true });
    expect(voicePosition(item, 4, 30).source).toBeCloseTo(3.5, 9);
    expect(pauseSilences(item, 30)).toEqual([
      { at: 2, frames: 15, from: 1, seconds: 0.5 },
      { at: 3, frames: 30, from: 2.5, seconds: 1 },
    ]);
  });

  test("the played length grows by the pauses: to the end of the recording, or the picture", () => {
    const paused = (pauses: VoicePause[], duration: number | null = null) =>
      edit({
        audio: [
          { id: "v1", assetId: VOICE, role: "voiceover", sourceDuration: 10, duration, pauses },
        ],
      }).audio[0]!;
    expect(audioPlayLength(paused([]), 12, 30)).toBe(10);
    expect(audioPlayLength(paused([{ at: 5, frames: 30 }]), 12, 30)).toBe(11);
    expect(audioPlayLength(paused([{ at: 5, frames: 90 }]), 12, 30)).toBe(12);
    // At 24 fps the same frames are longer.
    expect(audioPlayLength(paused([{ at: 5, frames: 30 }]), 12, 24)).toBe(11.25);
    // A set length is the item's length on the edit, its silences included.
    expect(audioPlayLength(paused([{ at: 5, frames: 30 }], 8), 12, 30)).toBe(8);
  });

  test("the render is sent a voiceover's pauses only when it has some, and only those it plays", () => {
    const plain = buildRenderRequest(edit()).params.audio as Record<string, unknown>[];
    expect(plain.every((item) => !("pauses" in item))).toBe(true);
    const timeline = edit({
      audio: [
        {
          id: "v1",
          assetId: VOICE,
          role: "voiceover",
          sourceDuration: 10,
          duration: 6,
          pauses: [
            { at: 2, frames: 30 },
            { at: 5.5, frames: 30 },
            { at: 9, frames: 30 },
          ],
        },
        // A music bed never carries pauses to the render.
        { id: "m1", assetId: MUSIC, role: "music", pauses: [{ at: 1, frames: 3 }] },
      ],
    });
    const audio = buildRenderRequest(timeline).params.audio as Record<string, unknown>[];
    // 6 s on the edit: 2 s of voice, its 1 s pause, then 3 s more; the pause at 5.5 never sounds.
    expect(audio[0]!.pauses).toEqual([{ at: 2, frames: 30 }]);
    expect("pauses" in audio[1]!).toBe(false);
  });

  test("captions and titles move with the voice: a word by the pauses at or before it", () => {
    const timeline = edit({
      captions: {
        enabled: true,
        segments: [
          { start: 0.2, end: 1.9, text: "First line" },
          { start: 2.4, end: 4.5, text: "Second line" },
          { start: 11, end: 11.5, text: "After the voice" },
        ],
      },
      overlays: [{ id: "o1", text: "Title", start: 2.4, end: 3.4 }],
    });
    const next = withVoicePauses(timeline, "v1", [{ at: 2, frames: 15 }]);
    expect(next.audio[0]!.pauses).toEqual([{ at: 2, frames: 15 }]);
    expect(next.captions.segments).toEqual([
      { start: 0.2, end: 1.9, text: "First line" },
      { start: 2.9, end: 5, text: "Second line" },
      { start: 11, end: 11.5, text: "After the voice" },
    ]);
    expect(next.overlays[0]).toMatchObject({ start: 2.9, end: 3.9 });
    // Taking the pause out puts everything back where it was.
    const back = withVoicePauses(next, "v1", []);
    expect(back.captions.segments).toEqual(timeline.captions.segments);
    expect(back.overlays[0]).toMatchObject({ start: 2.4, end: 3.4 });
  });

  test("a moment inside a silence keeps its share of it as the pause changes length", () => {
    const before = [{ at: 2, frames: 30 }];
    const longer = [{ at: 2, frames: 60 }];
    // Half way through a one-second silence that becomes two seconds long.
    expect(retimeForPauses(2.5, before, longer, 30, "cut")).toBeCloseTo(3, 9);
    expect(retimeForPauses(2, before, longer, 30, "word")).toBeCloseTo(2, 9);
    expect(retimeForPauses(3, before, longer, 30, "cut")).toBeCloseTo(4, 9);
    // A new pause exactly on a moment: a word goes after it, a cut before it.
    expect(retimeForPauses(2, [], before, 30, "word")).toBeCloseTo(3, 9);
    expect(retimeForPauses(2, [], before, 30, "cut")).toBeCloseTo(2, 9);
    expect(pausesOnEdit({ role: "voiceover", start: 1, trimStart: 0.5, pauses: before })).toEqual([
      { at: 2.5, frames: 30 },
    ]);
  });

  test("a voiceover with a set length grows by the silence, so its last word still plays", () => {
    const timeline = edit({
      audio: [{ id: "v1", assetId: VOICE, role: "voiceover", sourceDuration: 10, duration: 6 }],
    });
    const next = withVoicePauses(timeline, "v1", [
      { at: 1, frames: 15 },
      { at: 8, frames: 30 },
    ]);
    // Only the pause inside what it plays (6 s of recording) counts.
    expect(next.audio[0]!.duration).toBeCloseTo(6.5, 9);
    expect(withVoicePauses(next, "v1", []).audio[0]!.duration).toBeCloseTo(6, 9);
  });

  test("the cuts can follow the words: the clips are lengthened in whole frames", () => {
    const timeline = edit();
    const { timeline: next, shortClips } = editVoicePauses(
      timeline,
      "v1",
      [
        { at: 2, frames: 15 },
        { at: 4, frames: 6 },
        { at: 9, frames: 9 },
      ],
      { cuts: true },
    );
    // The cut at 4 s has the first pause before it, and opens on the second (which falls on it).
    const layout = layoutTimeline(next);
    expect(layout.clips.map((entry) => Math.round(entry.end * 30))).toEqual([135, 261, 387]);
    // The last clip's footage runs out at 4.2 s: it can't hold the cut after the third pause.
    expect(shortClips).toEqual(["c3"]);
    expect(next.clips[2]!.duration).toBeCloseTo(4.2, 6);
    // Without `cuts`, the picture stays as it was.
    expect(withVoicePauses(timeline, "v1", [{ at: 2, frames: 15 }]).clips).toEqual(timeline.clips);
  });

  test("a pause the voice never reaches moves nothing", () => {
    // The voice plays 5 s of its recording; a pause at 7 s is never heard.
    const timeline = edit({
      audio: [{ id: "v1", assetId: VOICE, role: "voiceover", sourceDuration: 10, duration: 5 }],
    });
    const next = withVoicePauses(timeline, "v1", [{ at: 7, frames: 30 }], { cuts: true });
    expect(next.clips).toEqual(timeline.clips);
    expect(next.audio[0]!.duration).toBe(5);
    expect(buildRenderRequest(next).params.audio).toEqual(
      buildRenderRequest(timeline).params.audio,
    );
  });
});

describe("the media worker's held voice", () => {
  const sources = [
    { path: "still.png", role: "image" },
    { path: "voice.wav", role: "audio" },
  ];
  const params = (audio: Record<string, unknown>) => ({
    width: 360,
    height: 640,
    fps: 30,
    clips: [{ source_index: 0, kind: "image", duration: 6 }],
    audio: [{ source_index: 1, role: "voiceover", start: 0, ...audio }],
  });
  const graph = (plan: { audio: unknown[] }) => {
    const args = mixArgs(plan, ["clip.mkv"], ["voice.wav"], "out.wav") as string[];
    return args[args.indexOf("-filter_complex") + 1]!;
  };

  test("splits the voice at each pause to the sample and puts exact silence between", () => {
    const plan = planSequence(
      params({
        trim_start: 0.5,
        pauses: [
          { at: 1, frames: 3 },
          { at: 2.25, frames: 30 },
        ],
      }),
      sources,
    );
    expect(plan.audio[0].pauses).toEqual([
      { at: 1, frames: 3, seconds: 0.1, samples: 4800 },
      { at: 2.25, frames: 30, seconds: 1, samples: 48000 },
    ]);
    const filter = graph(plan);
    expect(filter).toContain("asplit=3[t0v0][t0v1][t0v2]");
    expect(filter).toContain("[t0v0]atrim=start_sample=0:end_sample=24000,");
    expect(filter).toContain("[t0v1]atrim=start_sample=24000:end_sample=84000,");
    expect(filter).toContain("[t0v2]atrim=start_sample=84000,");
    expect(filter).toContain("anullsrc=r=48000:cl=stereo,atrim=end_sample=4800,");
    expect(filter).toContain("[t0s0][t0z0][t0s1][t0z1][t0s2]concat=n=5:v=0:a=1[t0held]");
    expect(filter).toContain("[t0held]asetpts=PTS-STARTPTS,aresample=48000");
  });

  test("a pause at the trim point opens the voice with silence", () => {
    const filter = graph(planSequence(params({ pauses: [{ at: 0, frames: 6 }] }), sources));
    expect(filter).toContain("asplit=1[t0v0]");
    expect(filter).toContain("[t0z0][t0s0]concat=n=2");
  });

  test("a voice without pauses is mixed as it always was", () => {
    const filter = graph(planSequence(params({}), sources));
    expect(filter).toContain("[1:a]asetpts=PTS-STARTPTS,aresample=48000");
    expect(filter).not.toContain("concat");
  });

  test("refuses pauses it can't hold: on music, out of order, outside what plays, or not whole frames", () => {
    const refuse = (audio: Record<string, unknown>, message: RegExp) =>
      expect(() => planSequence(params(audio), sources)).toThrow(message);
    refuse({ role: "music", pauses: [{ at: 1, frames: 3 }] }, /Only a voiceover/);
    refuse(
      {
        pauses: [
          { at: 2, frames: 3 },
          { at: 1, frames: 3 },
        ],
      },
      /in order/,
    );
    refuse({ trim_start: 1, pauses: [{ at: 0.5, frames: 3 }] }, /outside what the voiceover plays/);
    refuse({ duration: 2, pauses: [{ at: 3, frames: 3 }] }, /outside what the voiceover plays/);
    refuse({ pauses: [{ at: 1, frames: 2.5 }] }, /whole number/);
    refuse({ pauses: [{ at: 1, frames: 301 }] }, /between 1 and 300/);
    refuse({ pauses: Array.from({ length: 201 }, (_, at) => ({ at, frames: 1 })) }, /at most 200/);
  });

  test("the music ducks where the held voice speaks: speech moves with the pauses", () => {
    const item = { trimStart: 0, length: 10, pauses: [{ at: 2, seconds: 1 }] };
    expect(
      pacedRegions(
        [
          [0.5, 1.5],
          [2.5, 3],
          [1.8, 2.2],
        ],
        item,
      ),
    ).toEqual([
      [0.5, 1.5],
      [3.5, 4],
      [1.8, 3.2],
    ]);
  });
});
