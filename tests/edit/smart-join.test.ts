import { describe, expect, test } from "bun:test";
// @ts-expect-error The media worker is plain JavaScript.
import * as joins from "../../media-worker/src/joins.js";
// @ts-expect-error The media worker is plain JavaScript.
import { easedLooksChain, lutExpression } from "../../media-worker/src/seam.js";
// @ts-expect-error The media worker is plain JavaScript.
import { clipArgs, joinChain, planSequence } from "../../media-worker/src/sequence.js";

type Map2 = { m: number[]; t: number[] };
const {
  applyMap,
  composeMaps,
  easedWarpFilter,
  invertMap,
  joinHeadChain,
  mapFromFit,
  mapReach,
  perspectiveCorners,
  planWarps,
  sharpenAmount,
  warpFrames,
} = joins as {
  applyMap: (map: Map2, x: number, y: number) => [number, number];
  composeMaps: (outer: Map2, inner: Map2) => Map2;
  easedWarpFilter: (
    map: Map2,
    w: number,
    h: number,
    o: { frames: number; direction: string; total?: number },
  ) => string;
  invertMap: (map: Map2) => Map2;
  joinHeadChain: (input: string, output: string, head: unknown, tag: string) => string;
  mapFromFit: (fit: Record<string, number>, factor: number, w: number, h: number) => Map2;
  mapReach: (map: Map2, w: number, h: number) => { pixels: number; share: number };
  perspectiveCorners: (map: Map2, w: number, h: number) => [number, number][];
  planWarps: (
    map: Map2,
    w: number,
    h: number,
  ) => { previous: Map2 | null; next: Map2 | null } | null;
  sharpenAmount: (
    plane: Float32Array,
    w: number,
    h: number,
    target: number,
    margin: number,
  ) => { amount: number; ratio: number } | null;
  warpFrames: (map: Map2, w: number, h: number, fps: number, room: number) => number;
};

const W = 1080;
const H = 1920;
const inside = (map: Map2) =>
  [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ].every(([x, y]) => {
    const [mx, my] = applyMap(map, x!, y!);
    return mx >= -0.76 && my >= -0.76 && mx <= W + 0.76 && my <= H + 0.76;
  });

/**
 * A join measured on a real long video: the next clip's picture 3.2% narrower
 * and 1.2% shorter, from (nearly) its top-left corner, so it shows more to the
 * right and below, and lacks a sliver at the top.
 */
const STRETCHED: Map2 = { m: [0.9675, 0, 0, 0.9884], t: [0.3, -7.6] };

describe("smart joins: the maps", () => {
  test("a map and its inverse cancel out", () => {
    const back = invertMap(STRETCHED);
    const round = composeMaps(back, STRETCHED);
    expect(round.m[0]).toBeCloseTo(1, 9);
    expect(round.m[1]).toBeCloseTo(0, 9);
    expect(round.t[0]).toBeCloseTo(0, 9);
    expect(round.t[1]).toBeCloseTo(0, 9);
  });

  test("a fit made on a downscaled frame becomes the same map at full size", () => {
    // A 3% stretch about the centre of a 270 x 480 analysis frame, shifted 2 px.
    const fit = { a: -0.03, b: 0, c: 0, d: -0.01, tx: -2, ty: -1 };
    const map = mapFromFit(fit, 4, 270, 480);
    // The centre of the frame moves by the fit's shift, scaled up.
    const [cx, cy] = applyMap(map, 540, 960);
    expect(cx).toBeCloseTo(540 - 8, 6);
    expect(cy).toBeCloseTo(960 - 4, 6);
    expect(map.m[0]).toBeCloseTo(0.97, 9);
  });

  test("the next clip is warped onto the clip before, which only gives up the sliver the next lacks", () => {
    const warps = planWarps(STRETCHED, W, H)!;
    expect(warps.next).not.toBeNull();
    expect(warps.previous).not.toBeNull();
    // The clip before only loses the 7.7 px at the top the next clip doesn't show.
    expect(warps.previous!.m[3]).toBeCloseTo((H - 7.69) / H, 3);
    expect(warps.previous!.m[0]).toBe(1);
    // Both warps only ever sample picture their own clip has.
    expect(inside(warps.next!)).toBe(true);
    expect(inside(warps.previous!)).toBe(true);
    // At the cut they show the same picture: the next's warp is the join's map after the clip before's.
    const [px, py] = applyMap(STRETCHED, ...applyMap(warps.previous!, 300, 700));
    const [nx, ny] = applyMap(warps.next!, 300, 700);
    expect(nx).toBeCloseTo(px, 9);
    expect(ny).toBeCloseTo(py, 9);
  });

  test("a re-render that lost the picture's edges is met by the clip before zooming in", () => {
    const enlarged: Map2 = { m: [1.03, 0, 0, 1.03], t: [-16.2, -28.8] };
    const warps = planWarps(enlarged, W, H)!;
    expect(warps.previous).not.toBeNull();
    // The next clip needn't move: the clip before takes the next's framing.
    expect(warps.next).toBeNull();
    expect(inside(warps.previous!)).toBe(true);
  });

  test("a join already in register needs no warp", () => {
    expect(planWarps({ m: [1, 0, 0, 1], t: [0.1, -0.2] }, W, H)).toEqual({
      previous: null,
      next: null,
    });
  });

  test("a warp eases off slowly enough not to be seen, within the clip", () => {
    const { share } = mapReach(STRETCHED, W, H);
    expect(share).toBeCloseTo(0.0325, 3);
    // 3% at no more than 0.8% of the frame a second at the fastest: about 6 s.
    expect(warpFrames(STRETCHED, W, H, 24, 1000)).toBe(Math.round(((1.5 * share) / 0.008) * 24));
    expect(warpFrames(STRETCHED, W, H, 24, 1000) / 24).toBeCloseTo(6, 0);
    expect(warpFrames(STRETCHED, W, H, 24, 60)).toBe(60);
    // A tiny one still takes a second and a half.
    expect(warpFrames({ m: [1, 0, 0, 0.999], t: [0, 0] }, W, H, 30, 1000)).toBe(45);
  });
});

describe("smart joins: the filters", () => {
  test("perspective corners sit on pixel indices", () => {
    expect(perspectiveCorners({ m: [1, 0, 0, 1], t: [0, 0] }, 640, 360)).toEqual([
      [0, 0],
      [640, 0],
      [0, 360],
      [640, 360],
    ]);
    // A whole-pixel shift moves every corner by it.
    const shifted = perspectiveCorners({ m: [1, 0, 0, 1], t: [3, -2] }, 640, 360);
    expect(shifted[3]).toEqual([643, 358]);
  });

  test("the next clip's warp is all there on its first frame and gone by the end of its ease", () => {
    const filter = easedWarpFilter(STRETCHED, W, H, { frames: 146, direction: "out" });
    expect(filter).toStartWith("perspective=");
    expect(filter).toContain("eval=frame");
    expect(filter).toContain("enable='lt(n,146)'");
    expect(filter).toContain("(1-(3*pow(clip((in-1-0)/146,0,1),2)");
  });

  test("the clip before eases in over its last frames, reaching the shared framing on its last", () => {
    const filter = easedWarpFilter({ m: [1, 0, 0, 0.996], t: [0, 7.7] }, W, H, {
      frames: 36,
      direction: "in",
      total: 720,
    });
    expect(filter).toContain("enable='gt(n,683)'");
    expect(filter).toContain("clip((in-1-683)/36,0,1)");
  });

  test("colour and detail ease off in steps, each switched on for its own frames", () => {
    const levels = {
      y: [
        [0, 2],
        [128, 132],
        [255, 255],
      ],
      u: [
        [0, 0],
        [255, 255],
      ],
      v: [
        [0, 0],
        [255, 255],
      ],
    };
    const chain = easedLooksChain("in", "out", { levels, amount: 0.4, frames: 60 });
    const ranges = [...chain.matchAll(/lutyuv=.*?enable='between\(n,(\d+),(\d+)\)'/g)].map(
      (match) => [Number(match[1]), Number(match[2])] as const,
    );
    // Steps of at most 0.35 of a level (4 levels: 12 steps) covering the ease exactly.
    expect(ranges.length).toBe(12);
    expect(ranges[0]![0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(59);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]![0]).toBe(ranges[index - 1]![1] + 1);
    }
    // The sharpening steps down with the colour, from all of it.
    expect(chain).toContain("luma_amount=0.4:enable='between(n,0,4)'");
    expect(chain).not.toContain("xfade");
  });

  test("a level mapping rounds, and moves only its share", () => {
    expect(
      lutExpression([
        [0, 0],
        [255, 255],
      ]),
    ).toBe("clip(0.000+(val-0.000)*1.00000+0.5,0,255)");
    expect(
      lutExpression(
        [
          [0, 10],
          [255, 255],
        ],
        0.5,
      ),
    ).toContain("5.000+");
  });

  test("a head with only a warp passes the picture on untouched after it", () => {
    const chain = joinHeadChain(
      "framed",
      "matched",
      {
        width: W,
        height: H,
        frames: 60,
        warp: { map: STRETCHED, frames: 146 },
        correction: null,
        sharpen: null,
      },
      "m",
    );
    expect(chain).toContain("[framed]perspective=");
    expect(chain).toContain("[mw]null[matched]");
  });

  test("detail is matched with the unsharp amount that gives the clip before's", () => {
    // Stripes across (1 radian a pixel), at full contrast and at less or more.
    const width = 96;
    const height = 48;
    const stripes = (contrast: number) =>
      new Float32Array(width * height).map((_, i) => 128 + 40 * contrast * Math.sin(i % width));
    const laplacianEnergy = (plane: Float32Array) => {
      let total = 0;
      let count = 0;
      for (let y = 4; y < height - 4; y += 1) {
        for (let x = 4; x < width - 4; x += 1) {
          const i = y * width + x;
          const lap =
            plane[i - 1]! + plane[i + 1]! + plane[i - width]! + plane[i + width]! - 4 * plane[i]!;
          total += lap * lap;
          count += 1;
        }
      }
      return total / count;
    };
    const target = laplacianEnergy(stripes(1));
    // Unsharp's [1 4 6 4 1] blur keeps 0.593 of this frequency, so a picture at
    // 85% contrast needs (1 / 0.85 - 1) / 0.407 of it added back.
    expect(sharpenAmount(stripes(0.85), width, height, target, 4)!.amount).toBeCloseTo(0.434, 2);
    // A sharper picture is softened the same way.
    expect(sharpenAmount(stripes(1.2), width, height, target, 4)!.amount).toBeCloseTo(-0.41, 2);
    // Within about a tenth, it is left alone.
    expect(sharpenAmount(stripes(0.97), width, height, target, 4)).toBeNull();
    // Never more than the most it may sharpen.
    expect(sharpenAmount(stripes(0.3), width, height, target, 4)!.amount).toBe(1);
  });
});

describe("smart joins: the render plan", () => {
  const sources = [
    { path: "a.mp4", role: "video" },
    { path: "b.mp4", role: "video" },
    { path: "c.mp4", role: "video" },
  ];
  const params = (second: Record<string, unknown>, third: Record<string, unknown> = {}) => ({
    width: 360,
    height: 640,
    fps: 25,
    clips: [
      { source_index: 0, kind: "video", duration: 4 },
      { source_index: 1, kind: "video", duration: 4, trim_start: 0.04, ...second },
      { source_index: 2, kind: "video", duration: 4, ...third },
    ],
  });

  test("a smart join carries on from the clip before, and its sound meets it with short fades", () => {
    const plan = planSequence(params({ join: "smart" }), sources);
    expect(plan.clips[1].smartJoin).toBe(true);
    expect(plan.clips[1].matchPrevious).toBe(true);
    expect(plan.clips[1].soundIn).toBe(true);
    expect(plan.clips[0].soundOut).toBe(true);
    expect(plan.clips[2].smartJoin).toBe(false);
    expect(plan.clips[1].soundOut).toBe(false);
  });

  test("a join with a transition cross-fades its sound instead", () => {
    const plan = planSequence(
      params({ join: "smart", transition: { type: "fade", duration: 0.12 } }),
      sources,
    );
    expect(plan.clips[1].smartJoin).toBe(true);
    expect(plan.clips[1].soundIn).toBe(false);
    expect(plan.clips[0].soundOut).toBe(false);
  });

  test("the first clip never joins anything", () => {
    const plan = planSequence(
      { ...params({}), clips: [{ source_index: 0, kind: "video", duration: 4, join: "smart" }] },
      sources,
    );
    expect(plan.clips[0].smartJoin).toBe(false);
  });

  test("the sound fades go into the clips' own sound", () => {
    const plan = planSequence(params({ join: "smart" }), sources);
    const filters = (clip: number) => {
      const args = clipArgs(plan.clips[clip], plan, "in.mp4", true, "out.mkv") as string[];
      return args[args.indexOf("-filter_complex") + 1]!;
    };
    expect(filters(0)).toContain("afade=t=out:st=3.990000:d=0.010000");
    expect(filters(1)).toContain("afade=t=in:st=0:d=0.010000");
  });

  test("the clip before's ease into the shared framing goes in the final pass", () => {
    const plan = planSequence(params({ join: "smart" }), sources);
    plan.clips[0].tailWarp = { map: { m: [1, 0, 0, 0.996], t: [0, 2.6] }, frames: 37 };
    const { lines } = joinChain(plan, "v") as { lines: string[] };
    expect(lines[0]).toContain("perspective=");
    expect(lines[0]).toContain("enable='gt(n,62)'");
    expect(lines[1]).not.toContain("perspective");
  });
});
