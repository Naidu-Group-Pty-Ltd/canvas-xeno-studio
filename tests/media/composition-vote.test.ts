import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
// @ts-expect-error The media worker is plain JavaScript.
import { drawFrames } from "../../media-worker/src/composition.js";

const FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0;
type Update = [number, number, Record<string, string>];

/** A gray 8 x 8 PNG, every value `level`. */
function gray(level: number) {
  const width = 8;
  const rows = Buffer.concat(
    Array.from({ length: width }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, level)]),
    ),
  );
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A composition of `frames` frames, a drawing each, whose box steps one place a frame. */
function bundle(frames: number) {
  return {
    format: "xeno-composition",
    version: 1,
    width: 8,
    height: 8,
    fps: 24,
    frames,
    settings: { scale: 1, drawings: 1, shutter: 180 },
    html: "<!doctype html><div id=box></div>",
    images: [],
    fonts: [],
    webgl: false,
    selectors: ["#box"],
    drawings: Array.from({ length: frames }, (_, f): Update[] => [[0, -1, { left: String(f) }]]),
  };
}

/**
 * Browsers that draw the box's place as a shade of gray (place x 30), except where `wrong(role, place)` says a
 * drawing comes back raced: the same wrong picture every time it is captured, which no settle check can see.
 */
function browsers(wrong: (role: string, place: number) => number | null) {
  const launched: string[] = [];
  return {
    launched,
    chrome: (role: string, index: number) => ({
      launch: async () => {
        launched.push(`${role} ${index}`);
        return { version: "fake", close: async () => {} };
      },
      open: async () => {
        let place = 0;
        return {
          apply: async (_selectors: string[], updates: Update[]) => {
            for (const [, , props] of updates)
              if (props["left"] !== undefined) place = Number(props["left"]);
          },
          capture: async () => gray(wrong(role, place) ?? place * 30),
          nextFrames: async () => {},
          close: async () => {},
        };
      },
    }),
  };
}

async function draw(
  frames: number,
  wrong: (role: string, place: number) => number | null,
  verify = 1,
) {
  const fake = browsers(wrong);
  const sunk: number[] = [];
  const result = await drawFrames({
    bundle: bundle(frames),
    serve: () => null,
    from: 0,
    to: frames,
    browsers: 2,
    gpu: false,
    sink: async (frame: number, pngs: Buffer[]) => {
      // The frame handed on is the one kept: its first pixel's gray says which place it shows.
      expect(frame).toBe(sunk.length);
      const level = pngs[0]!.equals(gray(frame * 30)) ? frame * 30 : -1;
      sunk.push(level);
    },
    stallMs: 60_000,
    recycle: 2,
    verify,
    shape: { width: 8, height: 8, scale: 1, drawings: 1, fps: 24, zscale: false },
    chrome: fake.chrome,
  });
  return { result, sunk, launched: fake.launched };
}

describe.skipIf(!FFMPEG)("a stretch put to the vote", () => {
  test("a frame raced in the run is replaced by the frame two independent draws agree on", async () => {
    const { result, sunk } = await draw(6, (role, place) =>
      role === "lane" && place === 3 ? 250 : null,
    );
    expect(sunk).toEqual([0, 30, 60, 90, 120, 150]);
    expect(result.verified).toMatchObject({
      frames: 6,
      disagreed: [3],
      replaced_by_agreement: [3],
      unresolved: [],
    });
    expect(result.verified.votes).toEqual({ "3": [["again", "third"], ["run"]] });
  });

  test("a race in the draw made to check it is outvoted, and the run's frame stands", async () => {
    const { result, sunk } = await draw(6, (role, place) =>
      role === "again" && place === 2 ? 5 : null,
    );
    expect(sunk).toEqual([0, 30, 60, 90, 120, 150]);
    expect(result.verified).toMatchObject({
      disagreed: [2],
      replaced_by_agreement: [],
      unresolved: [],
    });
  });

  test("where no two draws agree the run's frame stands, and is reported unresolved", async () => {
    const { result, sunk } = await draw(4, (role, place) =>
      place === 1 ? ({ lane: 200, again: 100, third: 0 } as Record<string, number>)[role]! : null,
    );
    expect(sunk[1]).toBe(-1);
    expect(result.verified).toMatchObject({
      disagreed: [1],
      replaced_by_agreement: [],
      unresolved: [1],
    });
  });

  test("each lane's browser is started again every two of its frames, and with no vote asked none is held", async () => {
    const { result, launched } = await draw(8, () => null, 0);
    expect(result.verified).toBeNull();
    // Two lanes, four frames each, a browser every two: two each.
    expect(launched.sort()).toEqual(["lane 0", "lane 0", "lane 1", "lane 1"]);
    expect(result.launches).toBe(4);
    expect(result.settle).toMatchObject({ frames_recaptured: 0, unsettled: [], captures: 16 });
  });
});
