import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
// @ts-expect-error The media worker is plain JavaScript.
import * as settle from "../../media-worker/src/settle.js";

const {
  AGREEMENT,
  SETTLE,
  SettleRecord,
  decodePng,
  framesToVerify,
  sameFrame,
  settleCapture,
  vote,
  withinJitter,
} = settle as {
  AGREEMENT: { tolerance: number; edgeLevel: number; edgeShare: number };
  SETTLE: { tries: number; jitter: number };
  SettleRecord: new () => {
    add(frame: number, outcome: Outcome, ms: number): void;
    report(): Record<string, unknown>;
    recaptured: Map<number, number>;
  };
  decodePng(
    buffer: Buffer,
  ): { width: number; height: number; channels: number; data: Buffer } | null;
  framesToVerify(args: {
    from: number;
    to: number;
    recaptured?: number[];
    share?: number;
    seed?: string;
  }): number[];
  sameFrame(
    a: Buffer,
    b: Buffer,
    shape: { width: number; height: number; channels?: number },
  ): { same: boolean; largest: number; edge: number; allowed: number };
  settleCapture(args: {
    capture: () => Promise<Buffer>;
    pause: () => Promise<void>;
    tries?: number;
  }): Promise<Outcome>;
  vote(
    draws: { name: string; frame: Buffer }[],
    shape: { width: number; height: number },
  ): { winner: string; unresolved: boolean; groups: string[][] };
  withinJitter(a: Buffer, b: Buffer, jitter?: number): boolean;
};
type Outcome = {
  png: Buffer;
  retries: number;
  captures: number;
  settled: boolean;
  jittered: boolean;
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}
/** A PNG of `pixels` (RGBA or RGB, row by row), each row with its own filter (row number mod 5), as an encoder may. */
function png(width: number, height: number, channels: 3 | 4, pixels: Uint8Array) {
  const stride = width * channels;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const filter = y % 5;
    const line = Buffer.alloc(stride + 1);
    line[0] = filter;
    for (let x = 0; x < stride; x += 1) {
      const value = pixels[y * stride + x]!;
      const a = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x + 1] = (value - predicted) & 0xff;
    }
    rows.push(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function noise(length: number, seed: number) {
  const out = new Uint8Array(length);
  let h = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
}

describe("a capture's pixels", () => {
  test("an RGBA and an RGB PNG read back exactly, whichever filter each row was written with", () => {
    for (const channels of [3, 4] as const) {
      const pixels = noise(17 * 11 * channels, channels);
      const read = decodePng(png(17, 11, channels, pixels));
      expect(read).not.toBeNull();
      expect([read!.width, read!.height, read!.channels]).toEqual([17, 11, channels]);
      expect(Buffer.from(read!.data).equals(Buffer.from(pixels))).toBe(true);
    }
  });

  test("anything else is not read: not a PNG, or one this check doesn't take", () => {
    expect(decodePng(Buffer.from("not a png at all, not a png at all"))).toBeNull();
    const sixteen = png(4, 4, 4, noise(64, 1));
    sixteen[8 + 8 + 8] = 16; // IHDR's bit depth
    expect(decodePng(sixteen)).toBeNull();
  });

  test("two captures are one drawing within a hairline's jitter, never beyond it", () => {
    const pixels = noise(32 * 8 * 4, 7);
    const jittered = Uint8Array.from(pixels, (v, i) =>
      i % 97 === 0 ? Math.min(255, v + SETTLE.jitter) : v,
    );
    const raced = Uint8Array.from(pixels, (v, i) => (i % 97 === 0 ? (v + 120) % 256 : v));
    const a = png(32, 8, 4, pixels);
    expect(withinJitter(a, png(32, 8, 4, jittered))).toBe(true);
    expect(withinJitter(a, png(32, 8, 4, raced))).toBe(false);
    expect(withinJitter(a, png(16, 16, 4, pixels))).toBe(false);
  });
});

describe("a drawing kept once it has settled", () => {
  const A = png(8, 8, 4, noise(256, 1));
  const B = png(8, 8, 4, noise(256, 2));
  const C = png(8, 8, 4, noise(256, 3));
  const sequence = (...captures: Buffer[]) => {
    let pauses = 0;
    let taken = 0;
    return {
      capture: async () => captures[Math.min(taken++, captures.length - 1)]!,
      pause: async () => {
        pauses += 1;
      },
      get pauses() {
        return pauses;
      },
    };
  };

  test("two captures that agree: the second is kept, after the page's own frames", async () => {
    const page = sequence(A, A);
    const outcome = await settleCapture(page);
    expect(outcome).toMatchObject({ retries: 0, captures: 2, settled: true, jittered: false });
    expect(outcome.png.equals(A)).toBe(true);
    expect(page.pauses).toBe(1);
  });

  test("a capture caught before its tiles were painted is captured again until two agree", async () => {
    const outcome = await settleCapture(sequence(B, A, A));
    expect(outcome).toMatchObject({ retries: 1, captures: 3, settled: true });
    expect(outcome.png.equals(A)).toBe(true);
  });

  test("a drawing at rest between two paintings settles on the one it comes back to", async () => {
    const outcome = await settleCapture(sequence(A, B, A));
    expect(outcome).toMatchObject({ retries: 1, captures: 3, settled: true });
    expect(outcome.png.equals(A)).toBe(true);
  });

  test("one still changing after every try is kept as last captured, and said to be unsettled", async () => {
    const changing = Array.from({ length: SETTLE.tries + 1 }, (_, i) =>
      png(8, 8, 4, noise(256, 100 + i)),
    );
    const outcome = await settleCapture({ ...sequence(...changing), tries: SETTLE.tries });
    expect(outcome.settled).toBe(false);
    expect(outcome.captures).toBe(SETTLE.tries + 1);
  });

  test("the record names each frame captured again, and counts every capture", () => {
    const record = new SettleRecord();
    record.add(4, { png: A, retries: 0, captures: 2, settled: true, jittered: false }, 10);
    record.add(5, { png: A, retries: 2, captures: 4, settled: true, jittered: false }, 30);
    record.add(5, { png: A, retries: 1, captures: 3, settled: true, jittered: true }, 20);
    record.add(9, { png: A, retries: 6, captures: 7, settled: false, jittered: false }, 70);
    expect(record.report()).toEqual({
      frames_recaptured: 2,
      recaptured: { "5": 3, "9": 6 },
      unsettled: [9],
      settled_within_jitter: 1,
      captures: 16,
      capture_ms_mean: 8,
    });
  });
});

describe("a stretch shown free of a capture race, by agreement", () => {
  const shape = { width: 100, height: 100 };
  const frame = (seed: number) => Buffer.from(noise(100 * 100 * 3, seed));
  const off = (base: Buffer, pixels: number, by: number) => {
    const out = Buffer.from(base);
    for (let p = 0; p < pixels; p += 1)
      out[p * 3] = out[p * 3]! + by > 255 ? out[p * 3]! - by : out[p * 3]! + by;
    return out;
  };

  test("two sound draws differ only by rounding, or at a few edges; a race differs by more", () => {
    const base = frame(1);
    const allowed = Math.round(AGREEMENT.edgeShare * 100 * 100);
    expect(sameFrame(base, off(base, 10_000, 2), shape).same).toBe(true);
    expect(sameFrame(base, off(base, 3_000, AGREEMENT.edgeLevel), shape).same).toBe(true);
    expect(sameFrame(base, off(base, allowed, 60), shape).same).toBe(true);
    expect(sameFrame(base, off(base, allowed + 1, 60), shape)).toMatchObject({
      same: false,
      edge: allowed + 1,
    });
  });

  test("the vote: the answer two draws give wins, and the run's frame stands where it is one of them", () => {
    const sound = frame(2);
    const raced = off(sound, 2_000, 100);
    expect(
      vote(
        [
          { name: "run", frame: raced },
          { name: "again", frame: sound },
          { name: "third", frame: sound },
        ],
        shape,
      ),
    ).toEqual({
      winner: "again",
      unresolved: false,
      groups: [["again", "third"], ["run"]],
    });
    expect(
      vote(
        [
          { name: "run", frame: sound },
          { name: "again", frame: raced },
          { name: "third", frame: sound },
        ],
        shape,
      ).winner,
    ).toBe("run");
    const three = vote(
      [
        { name: "run", frame: sound },
        { name: "again", frame: raced },
        { name: "third", frame: frame(3) },
      ],
      shape,
    );
    expect(three).toMatchObject({ winner: "run", unresolved: true });
  });

  test("the frames put to the vote: each one captured again, its neighbours, and a seeded share of the rest", () => {
    const picked = framesToVerify({
      from: 100,
      to: 300,
      recaptured: [100, 150, 299],
      share: 0.05,
      seed: "a",
    });
    for (const f of [100, 101, 149, 150, 151, 298, 299]) expect(picked).toContain(f);
    expect(picked).not.toContain(99);
    expect(picked).not.toContain(300);
    expect(picked.length).toBe(7 + Math.round(0.05 * 193));
    expect(
      framesToVerify({ from: 100, to: 300, recaptured: [100, 150, 299], share: 0.05, seed: "a" }),
    ).toEqual(picked);
    expect(
      framesToVerify({ from: 100, to: 300, recaptured: [100, 150, 299], share: 0.05, seed: "b" }),
    ).not.toEqual(picked);
    expect(framesToVerify({ from: 0, to: 10, share: 0 })).toEqual([]);
  });
});
