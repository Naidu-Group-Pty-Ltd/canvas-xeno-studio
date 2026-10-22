/**
 * FLAC files made byte by byte for tests: "fLaC", its STREAMINFO (and any
 * other metadata blocks), then frames of CONSTANT subframes, each frame with
 * its CRC-8 header check and CRC-16 footer, as FLAC's format sets them out.
 * Every file is real FLAC: FFmpeg decodes it to the length it states.
 */

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let byte = 0; byte < 256; byte += 1) {
  let crc8 = byte;
  let crc16 = byte << 8;
  for (let bit = 0; bit < 8; bit += 1) {
    crc8 = crc8 & 0x80 ? ((crc8 << 1) ^ 0x07) & 0xff : (crc8 << 1) & 0xff;
    crc16 = crc16 & 0x8000 ? ((crc16 << 1) ^ 0x8005) & 0xffff : (crc16 << 1) & 0xffff;
  }
  CRC8[byte] = crc8;
  CRC16[byte] = crc16;
}

const crc8 = (bytes: number[]) => bytes.reduce((crc, byte) => CRC8[crc ^ byte]!, 0);
const crc16 = (bytes: number[]) =>
  bytes.reduce((crc, byte) => ((crc << 8) & 0xffff) ^ CRC16[(crc >> 8) ^ byte]!, 0);

/** A frame's number, coded as FLAC codes it (like UTF-8, in 1 to 7 bytes). */
function coded(value: number): number[] {
  if (value < 0x80) return [value];
  const length = [0x800, 0x10000, 0x200000, 0x4000000, 0x80000000, 2 ** 36].findIndex(
    (limit) => value < limit,
  );
  const continuation = length + 1;
  const out: number[] = [];
  let rest = value;
  for (let index = 0; index < continuation; index += 1) {
    out.unshift(0x80 | (rest & 0x3f));
    rest = Math.floor(rest / 64);
  }
  return [((0xff << (7 - continuation)) & 0xff) | rest, ...out];
}

export interface FrameShape {
  /** The frame's number (fixed-size blocks). */
  number: number;
  samples: number;
  channels: number;
  bits: 16 | 24;
  /** Every sample's value. */
  value?: number;
}

/** One frame: its header, a CONSTANT subframe a channel, and its CRC-16. */
export function flacFrame(shape: FrameShape): number[] {
  // Block sizes: 4096 by its code, anything else stated after the frame number.
  const blockCode = shape.samples === 4096 ? 0b1100 : 0b0111;
  const sizeCode = shape.bits === 16 ? 0b100 : 0b110;
  // The rate is the stream's (from STREAMINFO).
  const header = [0xff, 0xf8, blockCode << 4, ((shape.channels - 1) << 4) | (sizeCode << 1)];
  header.push(...coded(shape.number));
  if (blockCode === 0b0111) header.push((shape.samples - 1) >> 8, (shape.samples - 1) & 0xff);
  header.push(crc8(header));
  const body: number[] = [];
  const value = (shape.value ?? 0) & (2 ** shape.bits - 1);
  for (let channel = 0; channel < shape.channels; channel += 1) {
    body.push(0x00);
    if (shape.bits === 24) body.push((value >> 16) & 0xff);
    body.push((value >> 8) & 0xff, value & 0xff);
  }
  const frame = [...header, ...body];
  const check = crc16(frame);
  return [...frame, check >> 8, check & 0xff];
}

/** A metadata block: [last, type][length: 24 bits], then its contents. */
export function metadataBlock(type: number, contents: number[], last: boolean): number[] {
  const length = contents.length;
  return [(last ? 0x80 : 0) | type, length >> 16, (length >> 8) & 0xff, length & 0xff, ...contents];
}

export interface StreamShape {
  rate: number;
  channels: number;
  bits: number;
  /** Samples in the stream, as STREAMINFO states them (0: not known). */
  stated: number;
  largestBlock?: number;
  largestFrame?: number;
}

/** STREAMINFO's 34 bytes. */
export function streamInfo(shape: StreamShape): number[] {
  const largestBlock = shape.largestBlock ?? 4096;
  const largestFrame = shape.largestFrame ?? 0;
  const high = Math.floor(shape.stated / 2 ** 32) & 0x0f;
  const low = shape.stated % 2 ** 32;
  return [
    0x10,
    0x00,
    largestBlock >> 8,
    largestBlock & 0xff,
    0,
    0,
    0,
    largestFrame >> 16,
    (largestFrame >> 8) & 0xff,
    largestFrame & 0xff,
    shape.rate >> 12,
    (shape.rate >> 4) & 0xff,
    ((shape.rate & 0x0f) << 4) | ((shape.channels - 1) << 1) | ((shape.bits - 1) >> 4),
    (((shape.bits - 1) & 0x0f) << 4) | high,
    low >>> 24,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
    ...new Array<number>(16).fill(0),
  ];
}

export interface FlacShape {
  rate: number;
  channels: number;
  bits: 16 | 24;
  /** Samples in the frames. */
  samples: number;
  /** What STREAMINFO states (the frames' own count unless given; 0: not known). */
  stated?: number;
  /** Metadata blocks after STREAMINFO: [type, contents]. */
  blocks?: [number, number[]][];
}

/** A whole FLAC file: its frames of 4096 samples, the last as long as what is left. */
export function flacFile(shape: FlacShape): Uint8Array {
  const frames: number[][] = [];
  for (let at = 0, number = 0; at < shape.samples; at += 4096, number += 1)
    frames.push(
      flacFrame({
        number,
        samples: Math.min(4096, shape.samples - at),
        channels: shape.channels,
        bits: shape.bits,
        value: 1000,
      }),
    );
  const blocks = shape.blocks ?? [];
  const info = streamInfo({
    rate: shape.rate,
    channels: shape.channels,
    bits: shape.bits,
    stated: shape.stated ?? shape.samples,
    largestFrame: Math.max(...frames.map((frame) => frame.length)),
  });
  const bytes = [
    ...[0x66, 0x4c, 0x61, 0x43],
    ...metadataBlock(0, info, blocks.length === 0),
    ...blocks.flatMap(([type, contents], index) =>
      metadataBlock(type, contents, index === blocks.length - 1),
    ),
    ...frames.flat(),
  ];
  return new Uint8Array(bytes);
}

/** A reader over bytes in memory, counting its reads. */
export function reader(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  const read = async (offset: number, length: number) => {
    reads.push([offset, length]);
    return bytes.subarray(offset, Math.min(bytes.length, offset + length));
  };
  return { read, reads };
}
