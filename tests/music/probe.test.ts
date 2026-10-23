import { describe, expect, test } from "bun:test";
import { probeAudio, probeBytes, probeDuration, probeLayout } from "../../src/lib/music/probe";
import { flacFile, flacFrame, metadataBlock, reader, streamInfo } from "./flac";

/** What the studio's uploads take (the music service's UPLOAD_KINDS). */
const UPLOADS = ["mp3", "wav", "m4a", "flac"] as const;

describe("FLAC, wherever WAV, MP3 and M4A are taken", () => {
  test("is told by its structure, and its length is STREAMINFO's count exactly", async () => {
    const stereo = flacFile({ rate: 44_100, channels: 2, bits: 16, samples: 220_500 });
    const { read } = reader(stereo);
    expect(await probeAudio(read, stereo.length, UPLOADS)).toBe("flac");
    expect(await probeBytes(stereo, UPLOADS)).toBe("flac");
    expect(await probeDuration(read, stereo.length)).toBe(5);
    expect(await probeLayout(read, stereo.length)).toEqual({ channels: 2, rate: 44_100 });

    // 160,000 samples at 48 kHz, 24 bits: a length no frame count rounds.
    const mono = flacFile({ rate: 48_000, channels: 1, bits: 24, samples: 160_000 });
    const monoRead = reader(mono).read;
    expect(await probeAudio(monoRead, mono.length, UPLOADS)).toBe("flac");
    expect(await probeDuration(monoRead, mono.length)).toBe(160_000 / 48_000);
    expect(await probeLayout(monoRead, mono.length)).toEqual({ channels: 1, rate: 48_000 });
  });

  test("without a count (an encoder writing to a stream), its length is where its last frame ends", async () => {
    const streamed = flacFile({ rate: 44_100, channels: 1, bits: 16, samples: 110_250, stated: 0 });
    const { read } = reader(streamed);
    expect(await probeAudio(read, streamed.length, UPLOADS)).toBe("flac");
    expect(await probeDuration(read, streamed.length)).toBe(2.5);
  });

  test("a count short of the frames that follow gives way to them, as a decoder plays them all", async () => {
    const short = flacFile({
      rate: 44_100,
      channels: 2,
      bits: 16,
      samples: 88_200,
      stated: 44_100,
    });
    expect(await probeDuration(reader(short).read, short.length)).toBe(2);
  });

  test("its metadata (tags, padding, cover art) is stepped over to its first frame", async () => {
    const vendor = Array.from("studio!!", (letter) => letter.charCodeAt(0));
    const tagged = flacFile({
      rate: 44_100,
      channels: 2,
      bits: 16,
      samples: 44_100,
      blocks: [
        [4, [8, 0, 0, 0, ...vendor, 0, 0, 0, 0]],
        [6, new Array<number>(200_000).fill(7)],
        [1, new Array<number>(4_096).fill(0)],
      ],
    });
    const { read, reads } = reader(tagged);
    expect(await probeAudio(read, tagged.length, UPLOADS)).toBe("flac");
    expect(await probeDuration(read, tagged.length)).toBe(1);
    // Only small parts are read, never the whole file.
    expect(reads.every(([, length]) => length <= 2 * 1024 * 1024 + 64 * 1024)).toBe(true);
  });

  test("a large file is checked from a few small parts", async () => {
    const long = flacFile({ rate: 48_000, channels: 2, bits: 16, samples: 48_000 * 600 });
    const { read, reads } = reader(long);
    expect(await probeAudio(read, long.length, UPLOADS)).toBe("flac");
    expect(reads.length).toBeLessThanOrEqual(3);
    expect(await probeDuration(read, long.length)).toBe(600);
  });

  test("a damaged first frame, or a file that only starts like FLAC, isn't audio", async () => {
    const good = flacFile({ rate: 44_100, channels: 2, bits: 16, samples: 44_100 });
    const damaged = good.slice();
    // The first frame's samples (just past "fLaC" and STREAMINFO): its CRC-16 no longer matches.
    damaged[4 + 4 + 34 + 8] = (damaged[4 + 4 + 34 + 8]! + 1) & 0xff;
    expect(await probeAudio(reader(damaged).read, damaged.length, UPLOADS)).toBeNull();

    const pretend = new Uint8Array(4096);
    pretend.set([0x66, 0x4c, 0x61, 0x43]);
    expect(await probeAudio(reader(pretend).read, pretend.length, UPLOADS)).toBeNull();
  });

  test("a stream the browsers or the renderer can't decode is refused: 32 bits a sample", async () => {
    const info = streamInfo({ rate: 44_100, channels: 2, bits: 32, stated: 4_096 });
    const frame = flacFrame({ number: 0, samples: 4_096, channels: 2, bits: 24 });
    const wide = new Uint8Array([
      0x66,
      0x4c,
      0x61,
      0x43,
      ...metadataBlock(0, info, true),
      ...frame,
    ]);
    expect(await probeAudio(reader(wide).read, wide.length, UPLOADS)).toBeNull();
  });

  test("a frame that disagrees with its STREAMINFO is refused (bits a sample, block size)", async () => {
    // The stream says 16 bits; its frame says 24.
    const info = streamInfo({ rate: 44_100, channels: 1, bits: 16, stated: 4_096 });
    const frame = flacFrame({ number: 0, samples: 4_096, channels: 1, bits: 24 });
    const mixed = new Uint8Array([
      0x66,
      0x4c,
      0x61,
      0x43,
      ...metadataBlock(0, info, true),
      ...frame,
    ]);
    expect(await probeAudio(reader(mixed).read, mixed.length, UPLOADS)).toBeNull();
    // Its frames are larger than the largest block it states.
    const small = streamInfo({
      rate: 44_100,
      channels: 1,
      bits: 16,
      stated: 4_096,
      largestBlock: 1_024,
    });
    const big = flacFrame({ number: 0, samples: 4_096, channels: 1, bits: 16 });
    const oversized = new Uint8Array([
      0x66,
      0x4c,
      0x61,
      0x43,
      ...metadataBlock(0, small, true),
      ...big,
    ]);
    expect(await probeAudio(reader(oversized).read, oversized.length, UPLOADS)).toBeNull();
  });

  test("is taken only where FLAC is accepted", async () => {
    const file = flacFile({ rate: 44_100, channels: 2, bits: 16, samples: 44_100 });
    expect(await probeBytes(file, ["mp3", "wav", "m4a"])).toBeNull();
    expect(await probeBytes(file)).toBe("flac");
    expect(await probeBytes(file, UPLOADS)).toBe("flac");
  });
});
