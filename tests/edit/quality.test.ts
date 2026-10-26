import { describe, expect, test } from "bun:test";
// @ts-expect-error The media worker is plain JavaScript.
import * as quality from "../../media-worker/src/quality.js";
// @ts-expect-error The media worker is plain JavaScript.
import { buildSubtitles, planSequence } from "../../media-worker/src/sequence.js";

type Lab = [number, number, number];
type Plan = Record<string, unknown> & { totalFrames: number; fps: number };
type Report = Record<string, unknown>;
type Check = { id: string; result: string; value: number | null; limit: number | null };
interface Summary {
  frames: number;
  edges: { frames: number; mean: number | null; min: number | null };
  colour: { flat_pixels: number; delta_e_2000: { mean: number; max: number } | null };
  brand_colours: Record<string, unknown>[];
  banding: { windows: number; gap_code_values: { p99: number; max: number } | null };
}
const q = quality as {
  THRESHOLDS: Record<string, number>;
  ciede2000: (a: Lab, b: Lab) => number;
  srgbToLab: (r: number, g: number, b: number) => Lab;
  deltaE: (a: number[], b: number[]) => number;
  hexToRgb: (hex: string) => number[];
  rgbToHex: (rgb: number[]) => string;
  DeltaECache: new () => { get: (...rgb: number[]) => number };
  PixelMeter: new (
    width: number,
    height: number,
    brands?: string[],
    moving?: (frame: number) => boolean,
  ) => { add: (bytes: Uint8Array, frame: number) => void; summary: (fps: number) => Summary };
  planMeasurement: (params: unknown) => { measure: { brandColours: string[] } | null };
  captionBand: (plan: Plan) => { top: number; bottom: number; left: number; right: number } | null;
  plannedCaptions: (plan: Plan) => Int32Array;
  plannedCuts: (plan: Plan) => { clip: number; frame: number }[];
  movingFrames: (plan: Plan) => Set<number>;
  clipOfFrames: (plan: Plan) => Int32Array;
  timingScale: (plan: Plan) => number;
  judgeCaptions: (plan: Plan, owner: Int32Array, text: Float32Array) => Report;
  judgeCuts: (cuts: { clip: number; frame: number }[], change: Float32Array, fps: number) => Report;
  parseStats: (text: string, key: string) => number[];
  psnrOf: (mse: number) => number;
  fidelitySummary: (
    ssim: number[],
    mse: number[],
    every: number,
    fps: number,
    planes?: { y: number[]; u: number[]; v: number[]; all: number[] },
  ) => Report | null;
  samplingPlan: (frames: number) => { fidelity: number; pixel: number; offset: number };
  qualityChecks: (report: Report) => Check[];
  loudnessReport: (measured: unknown, plan: Plan) => Report;
  passedThroughQuality: (plan: Plan, measured: unknown) => Report & { checks: Check[] };
  unmeasuredQuality: (error: unknown) => Report;
  fidelityArgs: (
    argv: string[],
    master: string,
    plan: Plan,
    options: {
      ssimPath: string;
      psnrPath: string;
      sampling: { fidelity: number; pixel: number; offset: number };
    },
  ) => string[];
};
const plan = (params: Record<string, unknown>, sources = [{ role: "video" }, { role: "video" }]) =>
  planSequence({ width: 1080, height: 1920, fps: 30, ...params }, sources) as Plan;

describe("CIEDE2000", () => {
  // Sharma, Wu and Dalal (2005), "The CIEDE2000 color-difference formula: implementation notes,
  // supplementary test data and mathematical observations": every pair of their table.
  const PAIRS: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0],
    [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, -1, 2], [50, 0, 0], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.001], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, 2.49, -0.001], [50, -2.49, 0.0012], 7.2195],
    [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
    [[50, -0.001, 2.49], [50, 0.001, -2.49], 4.8045],
    [[50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [56, -27, -3], 31.903],
    [[50, 2.5, 0], [58, 24, 15], 19.4535],
    [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
    [[50, 2.5, 0], [50, 3.2972, 0], 1.0],
    [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0],
    [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
    [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
    [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];

  test("matches every pair of Sharma, Wu and Dalal's table, either way round", () => {
    for (const [a, b, expected] of PAIRS) {
      expect(q.ciede2000(a, b)).toBeCloseTo(expected, 3);
      expect(q.ciede2000(b, a)).toBeCloseTo(expected, 3);
    }
    expect(q.ciede2000([50, 10, 10], [50, 10, 10])).toBe(0);
  });

  test("sRGB is taken to CIE Lab (D65) as the standard gives it", () => {
    const [l, a, b] = q.srgbToLab(255, 255, 255);
    expect(l).toBeCloseTo(100, 2);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01);
    expect(q.srgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
    const red = q.srgbToLab(255, 0, 0);
    expect(red[0]).toBeCloseTo(53.24, 1);
    expect(red[1]).toBeCloseTo(80.09, 1);
    expect(red[2]).toBeCloseTo(67.2, 1);
  });

  test("8-bit colours: one level is far below noticeable, a matrix mix-up is not", () => {
    expect(q.deltaE([0x25, 0x1f, 0x18], [0x25, 0x1f, 0x17])).toBeLessThan(1);
    // A brand blue drawn with BT.601 coefficients and shown as BT.709 (what libass does to text colours).
    expect(q.deltaE(q.hexToRgb("#0832de"), q.hexToRgb("#0138e6"))).toBeGreaterThan(1.5);
    const cache = new q.DeltaECache();
    expect(cache.get(1, 2, 3, 1, 2, 3)).toBe(0);
    expect(cache.get(8, 50, 222, 1, 56, 230)).toBeCloseTo(q.deltaE([8, 50, 222], [1, 56, 230]), 10);
    expect(q.rgbToHex(q.hexToRgb("#0832de"))).toBe("#0832de");
    expect(q.rgbToHex([300, -4, 127.6])).toBe("#ff0080");
  });
});

/** A frame pair (reference left, master right) of `width` x `height`, each pixel from `paint`. */
function pair(
  width: number,
  height: number,
  paint: (x: number, y: number) => { ref: number[]; master: number[] },
): Uint8Array {
  const bytes = new Uint8Array(width * 2 * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const { ref, master } = paint(x, y);
      bytes.set(ref, (y * width * 2 + x) * 3);
      bytes.set(master, (y * width * 2 + width + x) * 3);
    }
  return bytes;
}

describe("a frame against its reference", () => {
  const W = 192;
  const H = 128;
  // A brand-blue card with a white rule across it, on a mid-grey ground.
  const card = (x: number, y: number) =>
    y >= 40 && y < 44 ? [255, 255, 255] : x >= 32 && x < 160 ? [8, 50, 222] : [128, 128, 128];

  test("an identical master keeps every edge and colour", () => {
    const meter = new q.PixelMeter(W, H, ["#0832de", "#ff00ff"]);
    meter.add(
      pair(W, H, (x, y) => ({ ref: card(x, y), master: card(x, y) })),
      0,
    );
    const summary = meter.summary(30);
    expect(summary.edges).toMatchObject({ frames: 1, mean: 1, min: 1 });
    expect(summary.colour.delta_e_2000).toMatchObject({ mean: 0, max: 0 });
    expect(summary.brand_colours[0]).toMatchObject({
      hex: "#0832de",
      found: true,
      reference: "#0832de",
      master: "#0832de",
      delta_e_2000: 0,
      drawn_delta_e_2000: 0,
    });
    expect(summary.brand_colours[1]).toEqual({ hex: "#ff00ff", found: false });
  });

  test("a softened master loses edge contrast; a shifted colour shows on its flat field", () => {
    const meter = new q.PixelMeter(W, H, ["#0832de"]);
    // The master: the rule spread over twice the rows at half the contrast, and the blue a level off.
    meter.add(
      pair(W, H, (x, y) => {
        const ref = card(x, y);
        const soft = y >= 38 && y < 46 && !(y >= 40 && y < 44) ? [192, 192, 192] : ref;
        const master = soft[2] === 222 ? [8, 50, 221] : soft;
        return { ref, master };
      }),
      0,
    );
    const summary = meter.summary(30);
    expect(summary.edges.mean!).toBeLessThan(0.8);
    const blue = summary.brand_colours[0]!;
    expect(blue).toMatchObject({ found: true, reference: "#0832de", master: "#0832dd" });
    expect(blue["delta_e_2000"] as number).toBeGreaterThan(0);
    expect(blue["delta_e_2000"] as number).toBeLessThan(0.5);
  });

  test("a gradient flattened into steps reads as banding; dither the master keeps doesn't", () => {
    // A gentle dark ramp, 30 levels over the frame, dithered by a level.
    const ramp = (x: number, y: number) => 20 + (30 * x) / W + ((x * 7 + y * 13) % 3) - 1;
    const banded = new q.PixelMeter(W, H);
    banded.add(
      pair(W, H, (x, y) => {
        const level = Math.round(ramp(x, y));
        const step = Math.round((20 + (30 * x) / W) / 4) * 4;
        return { ref: [level, level, level], master: [step, step, step] };
      }),
      0,
    );
    const steps = banded.summary(30).banding;
    expect(steps.windows).toBeGreaterThan(20);
    expect(steps.gap_code_values!.max).toBeGreaterThan(0.6);
    const kept = new q.PixelMeter(W, H);
    kept.add(
      pair(W, H, (x, y) => {
        const level = Math.round(ramp(x, y));
        return { ref: [level, level, level], master: [level, level, level] };
      }),
      0,
    );
    expect(kept.summary(30).banding.gap_code_values!.max).toBe(0);
    // A frame inside a fade isn't looked at for banding.
    const fading = new q.PixelMeter(W, H, [], () => true);
    fading.add(
      pair(W, H, () => ({ ref: [30, 30, 30], master: [30, 30, 30] })),
      0,
    );
    expect(fading.summary(30).banding.windows).toBe(0);
  });
});

describe("what the app asks to be measured", () => {
  test("nothing unless asked; the brand's colours, each once, in lower case", () => {
    expect(q.planMeasurement({})).toEqual({ measure: null });
    expect(q.planMeasurement({ measure: true })).toEqual({ measure: { brandColours: [] } });
    expect(
      q.planMeasurement({ measure: { brand_colours: ["#0832DE", "#0832de", "#ffffff"] } }),
    ).toEqual({ measure: { brandColours: ["#0832de", "#ffffff"] } });
  });

  test("anything that isn't a list of colours is turned away", () => {
    for (const measure of [
      "yes",
      [1],
      { brand_colours: "#ffffff" },
      { brand_colours: ["red"] },
      { brand_colours: ["#fff"] },
      { brand_colours: Array.from({ length: 13 }, (_, i) => `#0000${String(i).padStart(2, "0")}`) },
    ])
      expect(() => q.planMeasurement({ measure })).toThrow(/measure/);
  });
});

describe("captions and cuts on their frames", () => {
  test("the caption band covers the captions where buildSubtitles sets them", () => {
    for (const position of ["bottom", "lower_third", "center", "top"]) {
      const p = plan({
        clips: [{ source_index: 0, duration: 4 }],
        captions: { position, segments: [{ start: 0, end: 2, text: "Hello" }] },
      });
      const band = q.captionBand(p)!;
      const style = (buildSubtitles(p) as string)
        .split("\n")
        .find((line) => line.startsWith("Style: Caption"))!;
      const fields = style.split(",");
      const fontSize = Number(fields[2]);
      const alignment = Number(fields[18]);
      const marginV = Number(fields[21]);
      // One line of text at the anchor buildSubtitles gives it lies inside the band.
      const [top, bottom] =
        alignment === 2
          ? [1920 - marginV - fontSize, 1920 - marginV]
          : alignment === 8
            ? [marginV, marginV + fontSize]
            : [960 - fontSize / 2, 960 + fontSize / 2];
      expect(band.top).toBeLessThanOrEqual(top);
      expect(band.bottom).toBeGreaterThanOrEqual(bottom);
      expect(band.left).toBeLessThanOrEqual(1080 * 0.08);
      expect(band.right).toBeGreaterThanOrEqual(1080 * 0.92);
    }
    expect(q.captionBand(plan({ clips: [{ source_index: 0, duration: 4 }] }))).toBeNull();
  });

  test("a caption is planned on the frames the subtitle filter shows it on", () => {
    const p = plan({
      fps: 25,
      clips: [{ source_index: 0, duration: 4 }],
      captions: {
        segments: [
          { start: 0.5, end: 1.9, text: "First" },
          { start: 2.6, end: 3, text: "Second" },
        ],
      },
    });
    const owner = q.plannedCaptions(p);
    const frames = (index: number) => [...owner.keys()].filter((frame) => owner[frame] === index);
    // At 25 fps a frame is 40 ms: 0.5 s is frame 12.5, so frame 13 (520 ms) is the first; 1.9 s ends after frame 47.
    expect(frames(0)[0]).toBe(13);
    expect(frames(0).at(-1)).toBe(47);
    expect(frames(1)).toEqual([65, 66, 67, 68, 69, 70, 71, 72, 73, 74]);
    // At 30 fps, frame 30 is at 1,000 ms exactly, and frame 29 at 966.
    const thirty = q.plannedCaptions(
      plan({
        clips: [{ source_index: 0, duration: 2 }],
        captions: { segments: [{ start: 1, end: 1.5, text: "x" }] },
      }),
    );
    expect(thirty[29]).toBe(-1);
    expect(thirty[30]).toBe(0);
  });

  test("cuts are planned on the first frame of each clip that follows with no transition", () => {
    const p = plan({
      clips: [
        { source_index: 0, duration: 2 },
        { source_index: 1, duration: 2 },
        { source_index: 0, duration: 2, transition: { type: "fade", duration: 0.5 } },
        { source_index: 1, duration: 2 },
      ],
      fade_in: 0.5,
    });
    expect(q.plannedCuts(p)).toEqual([
      { clip: 2, frame: 60 },
      { clip: 4, frame: 165 },
    ]);
    const moving = q.movingFrames(p);
    expect(moving.has(105) && moving.has(119) && !moving.has(120) && !moving.has(104)).toBe(true);
    expect(moving.has(0) && moving.has(14) && !moving.has(15)).toBe(true);
    const clips = q.clipOfFrames(p);
    expect([clips[59], clips[60], clips[110], clips[165]]).toEqual([0, 1, 2, 3]);
  });

  test("the grey copy is a quarter of the frame, or less small for small captions", () => {
    expect(q.timingScale(plan({ clips: [{ source_index: 0, duration: 2 }] }))).toBe(4);
    const captioned = (width: number, height: number, size = 1) =>
      q.timingScale(
        plan({
          width,
          height,
          clips: [{ source_index: 0, duration: 2 }],
          captions: { size, segments: [{ start: 0, end: 1, text: "x" }] },
        }),
      );
    expect(captioned(1080, 1920)).toBe(3);
    expect(captioned(720, 1280)).toBe(2);
    expect(captioned(360, 640)).toBe(1);
    expect(captioned(1080, 1920, 2)).toBe(4);
  });

  test("a cut on its frame, a cut a frame late, and a join the picture carries through", () => {
    const change = new Float32Array(120).fill(1);
    change[30] = 40;
    change[61] = 50;
    change[90] = 1.2;
    const report = q.judgeCuts(
      [
        { clip: 2, frame: 30 },
        { clip: 3, frame: 60 },
        { clip: 4, frame: 90 },
      ],
      change,
      30,
    ) as { missed: number; cuts: Record<string, unknown>[] };
    expect(report.cuts.map((cut) => cut["reads_as"])).toEqual(["cut", "missed", "carried_through"]);
    expect(report.cuts[1]).toMatchObject({ found_at: 61, frames_off: 1 });
    expect(report.missed).toBe(1);
  });

  test("captions shown, a caption missed, and a picture too busy to tell", () => {
    const p = plan({
      fps: 25,
      clips: [{ source_index: 0, duration: 4.8 }],
      captions: {
        segments: [
          { start: 0.5, end: 1.9, text: "First" },
          { start: 2.6, end: 4.2, text: "Second" },
        ],
      },
    });
    const owner = q.plannedCaptions(p);
    const text = (shown: (index: number) => boolean) =>
      Float32Array.from(owner, (index) => (index >= 0 && shown(index) ? 0.08 : 0.02));
    expect(
      q.judgeCaptions(
        p,
        owner,
        text(() => true),
      ),
    ).toMatchObject({ status: "measured", missed_count: 0, judged: 2 });
    const second = q.judgeCaptions(
      p,
      owner,
      text((index) => index === 0),
    ) as { missed: { caption: number }[] };
    expect(second).toMatchObject({ status: "measured", missed_count: 1 });
    expect(second.missed[0]!.caption).toBe(2);
    expect(q.judgeCaptions(p, owner, new Float32Array(owner.length).fill(0.3))).toMatchObject({
      status: "unclear",
    });
    const none = plan({ clips: [{ source_index: 0, duration: 2 }] });
    expect(q.judgeCaptions(none, q.plannedCaptions(none), new Float32Array(60))).toEqual({
      status: "none",
      planned: 0,
    });
  });

  test("captions set word by word in the brand's type aren't judged by their edges", () => {
    // Their words arrive one at a time on a panel that stays up between a run's lines.
    const p = plan({
      fps: 25,
      clips: [{ source_index: 0, duration: 4.8 }],
      captions: {
        style: "brand",
        segments: [{ start: 0.5, end: 1.9, text: "Somewhere in Australia" }],
      },
    });
    const owner = q.plannedCaptions(p);
    expect(q.judgeCaptions(p, owner, new Float32Array(owner.length).fill(0.02))).toEqual({
      status: "word_by_word",
      planned: 1,
    });
  });
});

describe("SSIM and PSNR, frame by frame", () => {
  test("stats files are read by key, identical frames included", () => {
    const ssim =
      "n:1 R:0.99 G:0.98 B:0.97 All:0.980000 (16.98)\nn:2 R:1 G:1 B:1 All:1.000000 (inf)\n";
    const psnr =
      "n:1 mse_avg:4.00 mse_r:4 mse_g:4 mse_b:4 psnr_avg:42.11 psnr_r:42.11\nn:2 mse_avg:0.00 psnr_avg:inf\n";
    expect(q.parseStats(ssim, "All")).toEqual([0.98, 1]);
    // In the encoder's own planes, the luma is read by its key.
    const yuv =
      "n:1 Y:0.996 U:0.998 V:0.997 All:0.996500 (24.5)\nn:2 Y:1 U:1 V:1 All:1.000000 (inf)\n";
    expect(q.parseStats(yuv, "Y")).toEqual([0.996, 1]);
    expect(q.parseStats(yuv, "V")).toEqual([0.997, 1]);
    expect(q.parseStats(psnr, "mse_avg")).toEqual([4, 0]);
    expect(q.parseStats(psnr, "psnr_avg")).toEqual([42.11, Number.POSITIVE_INFINITY]);
    expect(q.psnrOf(0)).toBe(100);
    expect(q.psnrOf(4)).toBeCloseTo(42.11, 2);
  });

  test("the summary: means, the worst frame, and the worst frames' times", () => {
    const summary = q.fidelitySummary([0.99, 0.95, 0.995], [2, 16, 1], 10, 25) as {
      frames_measured: number;
      ssim: { mean: number; min: number; worst: { frame: number; time: number }[] };
      psnr_db: { mean: number; min: number };
    };
    expect(summary.frames_measured).toBe(3);
    expect(summary.ssim.mean).toBeCloseTo(0.9783, 4);
    expect(summary.ssim.worst[0]).toMatchObject({ frame: 10, time: 0.4 });
    // PSNR of the mean squared error (as FFmpeg averages it), and the worst frame's own.
    expect(summary.psnr_db.mean).toBeCloseTo(q.psnrOf(19 / 3), 2);
    expect(summary.psnr_db.min).toBeCloseTo(q.psnrOf(16), 2);
    expect(q.fidelitySummary([], [], 1, 30)).toBeNull();
  });

  test("the summary says its SSIM is the luma's, with each plane's mean", () => {
    const summary = q.fidelitySummary([0.996, 1], [1, 0], 1, 30, {
      y: [0.996, 1],
      u: [0.998, 1],
      v: [0.997, 1],
      all: [0.9965, 1],
    }) as { ssim_measure: string; ssim: { mean: number }; ssim_planes: Record<string, number> };
    expect(summary.ssim_measure).toBe("luma");
    expect(summary.ssim.mean).toBeCloseTo(0.998, 4);
    expect(summary.ssim_planes).toEqual({ y: 0.998, u: 0.999, v: 0.9985, all: 0.9983 });
  });

  test("short edits are measured frame by frame, long ones by an even sample", () => {
    expect(q.samplingPlan(300)).toEqual({ fidelity: 1, pixel: 4, offset: 2 });
    expect(q.samplingPlan(1800)).toEqual({ fidelity: 1, pixel: 20, offset: 10 });
    const long = q.samplingPlan(18_000);
    expect(long.fidelity).toBe(10);
    expect(long.pixel % long.fidelity).toBe(0);
    expect(long.offset % long.fidelity).toBe(0);
    expect(18_000 / long.pixel).toBeLessThanOrEqual(90);
  });

  test("the measuring pass makes the reference from the final pass's own graph", () => {
    const argv = [
      "-i",
      "clip-000.mkv",
      "-i",
      "mix.wav",
      "-filter_complex",
      "[0:v]null[vout];[1:a]anull[aout]",
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "out.mp4",
    ];
    const args = q.fidelityArgs(
      argv,
      "out.mp4",
      plan({ clips: [{ source_index: 0, duration: 2 }] }),
      {
        ssimPath: "s.log",
        psnrPath: "p.log",
        sampling: { fidelity: 2, pixel: 10, offset: 4 },
      },
    );
    expect(args.slice(0, 6)).toEqual(["-i", "clip-000.mkv", "-i", "mix.wav", "-i", "out.mp4"]);
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph.startsWith("[0:v]null[vout];[1:a]anull[aout];[vout]settb=1/30,setpts=N")).toBe(
      true,
    );
    expect(graph).toContain("[2:v]settb=1/30,setpts=N,select=not(mod(pts\\,2))");
    expect(graph).toContain("ssim=stats_file=s.log:shortest=1");
    // SSIM in the encoder's own planes (both 4:2:0, nothing converted); PSNR and the pixels in RGB.
    expect(graph).toContain(
      "[vout]settb=1/30,setpts=N,select=not(mod(pts\\,2)),format=yuv420p,split=2[qry][qrc]",
    );
    expect(graph).toContain("[qmy][qry]ssim=stats_file=s.log:shortest=1[qs]");
    expect(graph).toMatch(
      /\[qrc\]scale=in_color_matrix=bt709[^;]*format=gbrp,split=2\[qr2\]\[qr3\]/,
    );
    expect(graph).toContain("[qm1][qr2]psnr=stats_file=p.log:shortest=1[qp]");
    expect(graph).toContain("select=eq(mod(pts\\,10)\\,4)");
    // The graph's sound goes to the null output with SSIM and PSNR's.
    expect(args.join(" ")).toContain(
      "-map [qp] -map [qs] -map [aout] -fps_mode passthrough -f null -",
    );
  });
});

describe("verdicts", () => {
  const T = q.THRESHOLDS;
  const fidelity = (ssim: number, psnr: number, worst: number) => ({
    ssim: { mean: ssim },
    psnr_db: { mean: psnr, min: worst, worst: [{ time: 1.2 }] },
  });
  const result = (checks: Check[], id: string) => checks.find((check) => check.id === id)?.result;

  test("each measure passes at its line and is flagged past it", () => {
    const at = q.qualityChecks({
      fidelity: fidelity(T["ssimMean"]!, T["psnrMean"]!, T["psnrWorst"]!),
    });
    expect(at.map((check) => check.result)).toEqual(["pass", "pass", "pass"]);
    const past = q.qualityChecks({ fidelity: fidelity(0.979, 39.9, 36.9) });
    expect(past.map((check) => check.result)).toEqual(["flag", "flag", "flag"]);
    expect(past[2]).toMatchObject({ id: "psnr_worst", value: 36.9, limit: 37, time: 1.2 });
  });

  test("the pixel measures, captions, cuts, sync and loudness each have a verdict", () => {
    const checks = q.qualityChecks({
      pixels: {
        edges: { frames: 10, mean: 0.97, min: 0.96, worst: { time: 2 } },
        colour: { delta_e_2000: { mean: 0.4 } },
        brand_colours: [
          { hex: "#0832de", found: true, delta_e_2000: 1.2 },
          { hex: "#ffffff", found: false },
        ],
        banding: { windows: 400, gap_code_values: { p99: 0.4 }, worst: { time: 3 } },
      },
      captions: { status: "measured", missed_count: 1 },
      cuts: { judged: 3, missed: 0 },
      sync: { items: [{ status: "measured", offset_ms: -12 }, { status: "unclear" }] },
      loudness: { integrated_lufs: -15.4, range_lu: 5, true_peak_dbtp: -0.5, target_lufs: -14 },
    });
    expect(result(checks, "edges")).toBe("flag");
    expect(result(checks, "edges_worst")).toBe("pass");
    expect(result(checks, "colour")).toBe("pass");
    expect(
      checks.filter((check) => check.id === "brand_colour").map((check) => check.result),
    ).toEqual(["flag", "info"]);
    expect(result(checks, "banding")).toBe("pass");
    expect(result(checks, "captions")).toBe("flag");
    expect(result(checks, "cuts")).toBe("pass");
    expect(checks.find((check) => check.id === "sync")).toMatchObject({
      result: "pass",
      value: 12,
    });
    expect(result(checks, "loudness")).toBe("flag");
    expect(result(checks, "true_peak")).toBe("flag");
  });

  test("nothing to judge is information, not a pass", () => {
    const checks = q.qualityChecks({
      pixels: {
        edges: { frames: 0 },
        colour: { delta_e_2000: null },
        brand_colours: [],
        banding: { windows: 3, gap_code_values: { p99: 4 } },
      },
      captions: { status: "unclear" },
      cuts: { judged: 0, missed: 0 },
      sync: { items: [{ status: "unclear" }] },
      loudness: { integrated_lufs: null },
    });
    expect(checks.every((check) => check.result === "info")).toBe(true);
  });

  test("loudness is judged against the target only when the render evens it out", () => {
    const measured = { input_i: -14.3, input_lra: 5.06, input_tp: -1.62, input_thresh: -24 };
    const evened = plan({ clips: [{ source_index: 0, duration: 2 }] });
    expect(q.loudnessReport(measured, evened)).toEqual({
      integrated_lufs: -14.3,
      range_lu: 5.1,
      true_peak_dbtp: -1.6,
      target_lufs: -14,
    });
    const asIs = plan({ clips: [{ source_index: 0, duration: 2 }], normalize_loudness: false });
    expect(q.loudnessReport(measured, asIs)["target_lufs"]).toBeNull();
    expect(q.loudnessReport({ ...measured, input_i: -99 }, evened)["integrated_lufs"]).toBeNull();
    const through = q.passedThroughQuality(evened, measured);
    expect(through).toMatchObject({
      status: "passed_through",
      reference: "source",
      passes: 2,
      flags: 0,
    });
    expect(
      q.unmeasuredQuality(Object.assign(new Error("x"), { code: "TASK_STALLED" })),
    ).toMatchObject({
      status: "unmeasured",
      reason: "took too long",
    });
  });
});
