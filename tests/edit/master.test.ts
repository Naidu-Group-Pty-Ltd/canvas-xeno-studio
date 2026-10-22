import { describe, expect, test } from "bun:test";
import { passThroughCandidate, untouchedClip } from "../../src/lib/edit/master";
import { buildRenderRequest, parseTimeline, type Timeline } from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import * as master from "../../media-worker/src/master.js";
// @ts-expect-error The media worker is plain JavaScript.
import * as sequence from "../../media-worker/src/sequence.js";

type Plan = Record<string, unknown> & {
  clips: Record<string, unknown>[];
  quality: string;
  passThrough: boolean;
};
const { clipArgs, finalArgs, intermediateEncoding, planSequence } = sequence as {
  clipArgs: (clip: unknown, plan: Plan, source: string, audio: boolean, out: string) => string[];
  finalArgs: (
    plan: Plan,
    intermediates: string[],
    mix: string,
    subtitles: string | null,
    loudness: null,
    out: string,
  ) => string[];
  intermediateEncoding: (plan: Plan, clip?: unknown) => string[];
  planSequence: (params: unknown, sources: unknown[]) => Plan;
};
const { editIsUntouched, losslessPlanner, loudnessUnchanged, passThroughProblem } = master as {
  editIsUntouched: (plan: Plan) => boolean;
  losslessPlanner: (
    plan: Plan,
    dir: string,
    options: { budget: number; measure: (dir: string) => Promise<number> },
  ) => {
    choose: (index: number) => Promise<boolean>;
    done: (index: number) => void;
    report: () => Record<string, unknown>;
  };
  loudnessUnchanged: (
    measured: { input_i: number; input_tp: number } | null,
    target: number,
  ) => boolean;
  passThroughProblem: (plan: Plan, info: unknown) => string | null;
};

const ASSET = "11111111-1111-4111-8111-111111111111";

function edit(overrides: Record<string, unknown> = {}): Timeline {
  const timeline = parseTimeline({
    clips: [{ id: "c1", assetId: ASSET, kind: "video", duration: 10, sourceDuration: 10 }],
    ...overrides,
  });
  if (!timeline) throw new Error("timeline didn't parse");
  return timeline;
}

const SOURCE = {
  assetId: ASSET,
  width: 1080,
  height: 1920,
  durationSeconds: 10,
  fps: 30,
  mimeType: "video/mp4",
};

describe("the export's quality", () => {
  test("an edit saved before it renders at standard quality, and asks for nothing new", () => {
    const timeline = edit();
    expect(timeline.quality).toBe("standard");
    expect(buildRenderRequest(timeline).params["quality"]).toBeUndefined();
  });

  test("a master is asked for only when chosen", () => {
    expect(buildRenderRequest(edit({ quality: "master" })).params["quality"]).toBe("master");
  });

  test("an unknown quality isn't taken", () => {
    expect(parseTimeline({ quality: "ultra" })).toBeNull();
  });
});

describe("passing a finished master through", () => {
  test("one whole video with nothing over it is asked to go out as it is", () => {
    expect(untouchedClip(edit())?.id).toBe("c1");
    expect(passThroughCandidate(edit(), SOURCE)).toBe(true);
    // The library may not know its size or rate: the media service checks those.
    expect(passThroughCandidate(edit(), { ...SOURCE, width: null, height: null, fps: null })).toBe(
      true,
    );
  });

  test("anything over the clip, or a change to it, means it is rendered", () => {
    const clip = { id: "c1", assetId: ASSET, kind: "video", duration: 10, sourceDuration: 10 };
    const changed: Record<string, unknown>[] = [
      { clips: [{ ...clip, trimStart: 0.5, duration: 9.5 }] },
      { clips: [{ ...clip, speed: 1.5, duration: 6 }] },
      { clips: [{ ...clip, volume: 0.5 }] },
      { mix: { picture: { level: 1, muted: true } } },
      { fadeIn: 0.5 },
      { fadeOut: 1 },
      { upscale: "sharp" },
      { captions: { enabled: true, segments: [{ start: 0, end: 2, text: "Hello" }] } },
      { overlays: [{ id: "o1", text: "Title", start: 0, end: 2 }] },
      { images: [{ id: "i1", assetId: ASSET.replace(/1/g, "2"), start: 0, end: 2 }] },
      { audio: [{ id: "a1", assetId: ASSET.replace(/1/g, "3"), role: "music" }] },
      { clips: [clip, { ...clip, id: "c2" }] },
    ];
    for (const overrides of changed)
      expect(passThroughCandidate(edit(overrides), SOURCE)).toBe(false);
  });

  test("captions switched off, or audio on a muted channel, change nothing", () => {
    const quiet = edit({
      captions: { enabled: false, segments: [{ start: 0, end: 2, text: "Hello" }] },
      audio: [{ id: "a1", assetId: ASSET.replace(/1/g, "3"), role: "music" }],
      mix: { audio: { level: 1, muted: true } },
    });
    expect(passThroughCandidate(quiet, SOURCE)).toBe(true);
  });

  test("a file that isn't the render's size, rate, length or kind is rendered", () => {
    for (const source of [
      { ...SOURCE, width: 720 },
      { ...SOURCE, height: 1280 },
      { ...SOURCE, fps: 25 },
      { ...SOURCE, durationSeconds: 12 },
      { ...SOURCE, mimeType: "video/webm" },
      { ...SOURCE, assetId: ASSET.replace(/1/g, "9") },
    ])
      expect(passThroughCandidate(edit(), source)).toBe(false);
    expect(passThroughCandidate(edit(), null)).toBe(false);
    // Within half a frame of the clip is the whole file.
    expect(passThroughCandidate(edit(), { ...SOURCE, durationSeconds: 10.01 })).toBe(true);
  });
});

/** The worker's plan of a timeline, as the app sends it. */
function workerPlan(timeline: Timeline, extra: Record<string, unknown> = {}): Plan {
  const request = buildRenderRequest(timeline);
  return planSequence(
    { ...request.params, ...extra },
    request.sources.map((source) => ({ role: source.role })),
  );
}

describe("the media service's master", () => {
  test("a plan reads its quality and whether to pass through, and turns away others", () => {
    expect(workerPlan(edit())).toMatchObject({ quality: "standard", passThrough: false });
    expect(workerPlan(edit({ quality: "master" }), { pass_through: true })).toMatchObject({
      quality: "master",
      passThrough: true,
    });
    expect(() => workerPlan(edit(), { quality: "ultra" })).toThrow(/quality "ultra"/);
  });

  test("a master's clip is kept lossless when it has room, and made the standard way when not", () => {
    const plan = workerPlan(edit({ quality: "master" }));
    const lossless = clipArgs(
      { ...plan.clips[0], lossless: true },
      plan,
      "in.mp4",
      true,
      "out.mkv",
    );
    expect(lossless.join(" ")).toContain("-c:v libx264 -preset ultrafast -qp 0 -pix_fmt yuv420p");
    const standard = clipArgs(plan.clips[0], plan, "in.mp4", true, "out.mkv");
    expect(standard.join(" ")).toContain("-c:v libx264 -preset superfast -crf 14");
    expect(intermediateEncoding(plan)).toEqual(["-preset", "superfast", "-crf", "14"]);
  });

  test("a master's final encode is x264 slow at CRF 12 with aq-mode 3, BT.709 tagged, AAC 256 kb/s, a 2 s GOP", () => {
    const masterArgs = finalArgs(
      workerPlan(edit({ quality: "master" })),
      ["clip.mkv"],
      "mix.wav",
      null,
      null,
      "out.mp4",
    ).join(" ");
    for (const wanted of [
      "-c:v libx264 -preset slow -crf 12 -x264-params aq-mode=3:aq-strength=0.9",
      "-color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709",
      "-profile:v high -pix_fmt yuv420p -r 30 -g 60",
      "-c:a aac -b:a 256k",
    ])
      expect(masterArgs).toContain(wanted);
    const standardArgs = finalArgs(
      workerPlan(edit()),
      ["clip.mkv"],
      "mix.wav",
      null,
      null,
      "out.mp4",
    ).join(" ");
    expect(standardArgs).toContain("-c:v libx264 -preset veryfast -crf 17 -profile:v high");
    expect(standardArgs).toContain("-c:a aac -b:a 192k");
    expect(standardArgs).not.toContain("bt709");
  });
});

describe("room for a master's lossless clips", () => {
  const MB = 1024 * 1024;
  // 1080 x 1920 at 30 fps: a lossless frame is planned at 1.87 MB, a standard one at 0.78 MB.
  const plan = (seconds: number[]) =>
    workerPlan(
      edit({
        quality: "master",
        clips: seconds.map((duration, index) => ({
          id: `c${index}`,
          assetId: ASSET,
          kind: "video",
          duration,
        })),
      }),
    );

  test("every clip is lossless when the disk has room for them all", async () => {
    const planner = losslessPlanner(plan([2, 2]), "/work", {
      budget: 4096 * MB,
      measure: async () => 0,
    });
    expect(await planner.choose(0)).toBe(true);
    expect(await planner.choose(1)).toBe(true);
    expect(planner.report()).toEqual({ lossless_clips: [1, 2], standard_clips: [] });
  });

  test("a clip that doesn't fit is made the standard way, and the report says what was needed", async () => {
    // Each 10 s clip is planned at 560 MB lossless (233 MB the standard way), and the mix and the
    // master at 851 MB, against 90% of a 4 GB disk (3,865 MB). With 1.5 GB used already, the first
    // two fit (3,451 and 3,804 MB planned), and the third (4,158 MB) doesn't.
    let used = 1500 * MB;
    const planner = losslessPlanner(plan([10, 10, 10]), "/work", {
      budget: 4096 * MB,
      measure: async () => used,
    });
    expect(await planner.choose(0)).toBe(true);
    planner.done(0);
    used += 560 * MB;
    expect(await planner.choose(1)).toBe(true);
    planner.done(1);
    used += 560 * MB;
    expect(await planner.choose(2)).toBe(false);
    const report = planner.report();
    expect(report).toMatchObject({
      lossless_clips: [1, 2],
      standard_clips: [3],
      budget_bytes: 4096 * MB,
    });
    expect(report["needed_bytes"] as number).toBeGreaterThan(4096 * MB);
  });

  test("two clips made side by side can't both count on the same room", async () => {
    // Against 90% of 1.5 GB (1,450 MB): the first is planned at 1,361 MB with the second made the
    // standard way; the second, counting the first's room as taken, at 1,688 MB.
    const planner = losslessPlanner(plan([10, 10]), "/work", {
      budget: 1536 * MB,
      measure: async () => 0,
    });
    const [first, second] = await Promise.all([planner.choose(0), planner.choose(1)]);
    expect([first, second]).toEqual([true, false]);
  });
});

describe("a file that can stand for its render", () => {
  const plan = workerPlan(
    edit({ clips: [{ id: "c1", assetId: ASSET, kind: "video", duration: 2 }] }),
  );
  const video = {
    codec_type: "video",
    codec_name: "h264",
    pix_fmt: "yuv420p",
    width: 1080,
    height: 1920,
    sample_aspect_ratio: "1:1",
    avg_frame_rate: "30/1",
    r_frame_rate: "30/1",
    field_order: "progressive",
    nb_frames: "60",
    duration: "2.000000",
  };
  const audio = { codec_type: "audio", codec_name: "aac", duration: "2.010000" };

  test("H.264 4:2:0 at the edit's size and rate with as many frames as the clip, and AAC beside it", () => {
    expect(editIsUntouched(plan)).toBe(true);
    expect(passThroughProblem(plan, { streams: [video, audio] })).toBeNull();
    expect(passThroughProblem(plan, { streams: [video] })).toBeNull();
  });

  test("anything else says what is different", () => {
    const cases: [Record<string, unknown>[], RegExp][] = [
      [[{ ...video, codec_name: "hevc" }], /hevc, not H.264/],
      [[{ ...video, pix_fmt: "yuv444p" }], /yuv444p, not 4:2:0/],
      [[{ ...video, width: 720, height: 1280 }], /720x1280/],
      [[{ ...video, sample_aspect_ratio: "4:3" }], /square/],
      [[{ ...video, avg_frame_rate: "30000/1001" }], /29.97/],
      [[{ ...video, field_order: "tt" }], /interlaced/],
      [[{ ...video, side_data_list: [{ rotation: -90 }] }], /rotated/],
      [[{ ...video, nb_frames: "59" }], /59 frames, where the clip has 60/],
      [[video, { ...audio, codec_name: "mp3" }], /mp3, not AAC/],
      [[video, { ...audio, duration: "3.5" }], /different lengths/],
      [[video, audio, audio], /more than one sound/],
      [[], /no single picture/],
    ];
    for (const [streams, reason] of cases)
      expect(passThroughProblem(plan, { streams })).toMatch(reason);
  });

  test("a level the render would change, or a changed clip, isn't passed through", () => {
    expect(loudnessUnchanged({ input_i: -14.3, input_tp: -1.6 }, -14)).toBe(true);
    expect(loudnessUnchanged({ input_i: -15, input_tp: -1.6 }, -14)).toBe(false);
    expect(loudnessUnchanged({ input_i: -14, input_tp: -0.4 }, -14)).toBe(false);
    expect(loudnessUnchanged(null, -14)).toBe(false);
    expect(editIsUntouched(workerPlan(edit({ fadeIn: 0.5 })))).toBe(false);
  });
});
