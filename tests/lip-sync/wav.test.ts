import { describe, expect, test } from "bun:test";
import {
  byteRange,
  gainPcm16,
  parseWavHeader,
  sampleAt,
  speechGainDb,
  wavFile,
  wavHeader,
  withSilenceAfter,
} from "../../src/lib/lip-sync/wav";

/** A WAV as some writers make it: a LIST chunk (odd-sized, so padded) before the data. */
function wavWithList(samples: Int16Array, rate = 48000): Uint8Array {
  const list = new TextEncoder().encode("INFOISFT\u0005\u0000\u0000\u0000Lavf\u0000");
  const listChunk = new Uint8Array(8 + list.length + (list.length % 2));
  listChunk.set(new TextEncoder().encode("LIST"), 0);
  new DataView(listChunk.buffer).setUint32(4, list.length, true);
  listChunk.set(list, 8);
  const plain = wavFile({ channels: 1, rate, bits: 16 }, new Uint8Array(samples.buffer));
  // RIFF header + fmt chunk (36 bytes), then LIST, then the data chunk.
  const out = new Uint8Array(plain.length + listChunk.length);
  out.set(plain.subarray(0, 36), 0);
  out.set(listChunk, 36);
  out.set(plain.subarray(36), 36 + listChunk.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

describe("WAV layout", () => {
  test("is read from the chunks, wherever the data starts", () => {
    const samples = Int16Array.from({ length: 4800 }, (_, index) => index % 300);
    const file = wavWithList(samples);
    const layout = parseWavHeader(file)!;
    expect(layout).not.toBeNull();
    expect(layout.rate).toBe(48000);
    expect(layout.channels).toBe(1);
    expect(layout.bits).toBe(16);
    expect(layout.samples).toBe(4800);
    expect(layout.dataOffset).toBeGreaterThan(44);
    const first = new DataView(file.buffer).getInt16(layout.dataOffset + 2 * 299, true);
    expect(first).toBe(299);
  });

  test("isn't made up for something that isn't a PCM WAV", () => {
    expect(parseWavHeader(new TextEncoder().encode("ID3\u0004 not a wav at all"))).toBeNull();
    const float = wavHeader({ channels: 1, rate: 48000, bits: 32 }, 0);
    new DataView(float.buffer).setUint16(20, 3, true);
    expect(parseWavHeader(float)).toBeNull();
  });

  test("a data size left unset reads as the rest of the file", () => {
    const file = wavFile({ channels: 1, rate: 16000, bits: 16 }, new Uint8Array(3200));
    new DataView(file.buffer).setUint32(40, 0xffffffff, true);
    expect(parseWavHeader(file)!.samples).toBe(1600);
  });
});

describe("a piece of a WAV", () => {
  test("is exactly its samples' bytes", () => {
    const samples = Int16Array.from({ length: 48000 }, (_, index) => (index * 7) % 32000);
    const file = wavWithList(samples);
    const layout = parseWavHeader(file)!;
    const from = sampleAt(layout, 0.25);
    const to = sampleAt(layout, 0.5);
    expect([from, to]).toEqual([12000, 24000]);
    const range = byteRange(layout, from, to);
    expect(range.end - range.start + 1).toBe((to - from) * 2);
    const piece = wavFile(layout, file.subarray(range.start, range.end + 1));
    const read = parseWavHeader(piece)!;
    expect(read.samples).toBe(12000);
    const view = new DataView(piece.buffer);
    for (const index of [0, 1, 5999, 11999])
      expect(view.getInt16(44 + index * 2, true)).toBe(samples[from + index]!);
  });

  test("stops at the end of the sound", () => {
    const layout = parseWavHeader(
      wavFile({ channels: 1, rate: 48000, bits: 16 }, new Uint8Array(200)),
    )!;
    expect(byteRange(layout, 50, 500)).toEqual({ start: 44 + 100, end: 44 + 199 });
    expect(sampleAt(layout, 99)).toBe(100);
  });
});

describe("a quiet voiceover", () => {
  test("is raised by its speech level, never lowered, by at most 24 dB", () => {
    expect(speechGainDb(-30)).toBe(16);
    expect(speechGainDb(-60)).toBe(24);
    expect(speechGainDb(-14.5)).toBe(0);
    expect(speechGainDb(-8)).toBe(0);
    expect(speechGainDb(null)).toBe(0);
    expect(speechGainDb(-100)).toBe(0);
  });

  test("keeps every sample under full scale, lowering the gain rather than clipping", () => {
    const quiet = new Int16Array([0, 1000, -2000, 500]);
    const { sound, gainDb } = gainPcm16(new Uint8Array(quiet.buffer), 40);
    const raised = new Int16Array(sound.buffer);
    // 2000 can only be raised to just under full scale (-1 dBFS): about 23.3 dB, not 40.
    expect(gainDb).toBeGreaterThan(23);
    expect(gainDb).toBeLessThan(23.5);
    expect(Math.abs(raised[2]!)).toBeLessThanOrEqual(Math.round(32767 * 10 ** (-1 / 20)));
    expect(raised[1]! / raised[2]!).toBeCloseTo(-0.5, 3);
    const gentle = gainPcm16(new Uint8Array(quiet.buffer), 6);
    expect(gentle.gainDb).toBeCloseTo(6, 2);
    const loud = new Uint8Array(new Int16Array([0, 30000, -29000]).buffer);
    const left = gainPcm16(loud, 12);
    expect(left.gainDb).toBe(0);
    expect(left.sound).toBe(loud);
  });

  test("a short piece is followed by silence to the length asked for", () => {
    const piece = new Uint8Array(new Int16Array([5, -5, 7]).buffer);
    const padded = withSilenceAfter(piece, 6, 2);
    expect(Array.from(new Int16Array(padded.buffer))).toEqual([5, -5, 7, 0, 0, 0]);
    expect(withSilenceAfter(piece, 2, 2)).toBe(piece);
  });
});
