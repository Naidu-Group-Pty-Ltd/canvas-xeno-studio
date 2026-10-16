import { describe, expect, test } from "bun:test";
import {
  audibleAudio,
  audioGain,
  buildRenderRequest,
  channelGain,
  clipGain,
  mixNeedsChannelLevels,
  parseTimeline,
  type Timeline,
} from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import { mixArgs, planSequence } from "../../media-worker/src/sequence.js";

const CLIP = "aaaaaaaa-1111-4111-8111-111111111111";
const VOICE = "bbbbbbbb-1111-4111-8111-111111111111";
const MUSIC = "cccccccc-1111-4111-8111-111111111111";

function edit(overrides: Record<string, unknown> = {}): Timeline {
  const timeline = parseTimeline({
    clips: [{ id: "c1", assetId: CLIP, kind: "video", duration: 4 }],
    audio: [
      { id: "v1", assetId: VOICE, role: "voiceover", volume: 1 },
      { id: "m1", assetId: MUSIC, role: "music", volume: 0.6 },
    ],
    ...overrides,
  });
  if (!timeline) throw new Error("timeline didn't parse");
  return timeline;
}

type AudioParam = { role: string; volume: number };
type ClipParam = { volume: number };

describe("the mixer's model", () => {
  test("an edit saved before the mixer opens at 100% on every channel", () => {
    const timeline = edit();
    expect(timeline.mix).toEqual({
      picture: { level: 1, muted: false },
      voiceover: { level: 1, muted: false },
      audio: { level: 1, muted: false },
    });
  });

  test("an item plays at its own volume through its channel; a mute keeps the level", () => {
    const timeline = edit({
      mix: {
        picture: { level: 0.5 },
        voiceover: { level: 1.5, muted: true },
        audio: { level: 1.5 },
      },
    });
    expect(channelGain(timeline, "picture")).toBe(0.5);
    expect(channelGain(timeline, "voiceover")).toBe(0);
    expect(timeline.mix.voiceover.level).toBe(1.5);
    expect(clipGain(timeline, timeline.clips[0]!)).toBe(0.5);
    expect(audioGain(timeline, timeline.audio[1]!)).toBeCloseTo(0.9);
    // A muted voiceover isn't heard, licence-checked or sent.
    expect(audibleAudio(timeline).map((item) => item.id)).toEqual(["m1"]);
  });

  test("levels outside 0–200% don't parse", () => {
    expect(parseTimeline({ mix: { picture: { level: 2.5 } } })).toBeNull();
    expect(parseTimeline({ mix: { audio: { level: -0.1 } } })).toBeNull();
  });
});

describe("the render request", () => {
  test("levels are folded into the items' volumes, which gives the same mix", () => {
    const timeline = edit({ mix: { picture: { level: 0.5 }, audio: { level: 1.5 } } });
    const { params } = buildRenderRequest(timeline);
    expect((params.clips as ClipParam[])[0]!.volume).toBe(0.5);
    const audio = params.audio as AudioParam[];
    expect(audio.find((item) => item.role === "music")!.volume).toBeCloseTo(0.9);
    expect(audio.find((item) => item.role === "voiceover")!.volume).toBe(1);
    expect(params.mix).toBeUndefined();
    expect(mixNeedsChannelLevels(timeline)).toBe(false);
  });

  test("a muted picture channel sends the clips silent", () => {
    const { params } = buildRenderRequest(edit({ mix: { picture: { muted: true } } }));
    expect((params.clips as ClipParam[])[0]!.volume).toBe(0);
  });

  test("a boost past 200% needs the media service to apply the levels", () => {
    const timeline = edit({
      clips: [{ id: "c1", assetId: CLIP, kind: "video", duration: 4, volume: 2 }],
      mix: { picture: { level: 1.5 }, voiceover: { level: 0.8 } },
    });
    expect(mixNeedsChannelLevels(timeline)).toBe(true);
    const { params } = buildRenderRequest(timeline, { channelMix: true });
    // The items keep their own volumes; the channels go as bus levels.
    expect((params.clips as ClipParam[])[0]!.volume).toBe(2);
    expect(params.mix).toEqual({ picture: 1.5, voiceover: 0.8, music: 1, sfx: 1 });
  });
});

describe("the media worker's mix", () => {
  const sources = [
    { path: "clip.mp4", role: "video" },
    { path: "voice.wav", role: "audio" },
    { path: "music.wav", role: "audio" },
  ];
  const params = (mix?: Record<string, number>) => ({
    width: 360,
    height: 640,
    fps: 25,
    clips: [{ source_index: 0, kind: "video", duration: 4, volume: 1 }],
    audio: [
      { source_index: 1, role: "voiceover", start: 0, volume: 1 },
      { source_index: 2, role: "music", start: 0, volume: 0.6, duck: false },
    ],
    ...(mix ? { mix } : {}),
  });
  const graph = (plan: { audio: unknown[] }) => {
    const args = mixArgs(
      plan,
      ["clip.mkv"],
      plan.audio.map(() => "a.wav"),
      "out.wav",
    ) as string[];
    return args[args.indexOf("-filter_complex") + 1]!;
  };

  test("each channel's level scales its whole bus", () => {
    const plan = planSequence(params({ picture: 0.5, voiceover: 1.25, music: 0.8 }), sources);
    const filter = graph(plan);
    expect(filter).toContain("asetpts=PTS-STARTPTS,volume=0.5[clips]");
    expect(filter).toContain("volume=1.25[voice]");
    expect(filter).toContain("volume=0.8[musicbed]");
  });

  test("without levels the graph is as it was", () => {
    const filter = graph(planSequence(params(), sources));
    expect(filter).toContain("asetpts=PTS-STARTPTS[clips]");
    expect(filter).toContain("anull[voice]");
    expect(filter).toContain("anull[musicbed]");
  });

  test("a silent channel is left out of the render", () => {
    const plan = planSequence(params({ picture: 0, music: 0 }), sources);
    expect(plan.audio.map((item: { role: string }) => item.role)).toEqual(["voiceover"]);
    expect(plan.clips[0].volume).toBe(0);
  });

  test("a level outside 0–2 is refused", () => {
    expect(() => planSequence(params({ voiceover: 3 }), sources)).toThrow(/mix voiceover/);
  });
});
