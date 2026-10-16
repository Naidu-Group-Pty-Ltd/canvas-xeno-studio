/**
 * The canonical voiceover is a plain PCM WAV (see media-worker/src/voice.js),
 * so a piece of it is a byte range: the header says where the sound starts
 * and how big a sample is, and a piece from sample a to sample b is exactly
 * those bytes behind a header of its own. Cutting it this way is exact to the
 * sample and needs nothing but arithmetic, which is what lets the server cut
 * each clip's piece without decoding anything.
 */

export interface WavLayout {
  /** 1 is integer PCM. */
  tag: number;
  channels: number;
  rate: number;
  /** Bytes per sample frame (all channels). */
  blockAlign: number;
  bits: number;
  /** Where the sound starts in the file. */
  dataOffset: number;
  /** How many bytes of sound, in whole sample frames. */
  dataBytes: number;
  /** Sample frames. */
  samples: number;
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

const u16 = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8);
const u32 = (bytes: Uint8Array, at: number) =>
  (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;

/**
 * A WAV file's layout from its first bytes (the format and data chunks, found
 * by walking the chunks rather than assumed at byte 44). `fileSize` bounds the
 * data where the header can't say. Null when it isn't a PCM WAV this can cut.
 */
export function parseWavHeader(bytes: Uint8Array, fileSize = bytes.length): WavLayout | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE")
    return null;
  let offset = 12;
  let format: Pick<WavLayout, "tag" | "channels" | "rate" | "blockAlign" | "bits"> | null = null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, offset + 4);
    const size = u32(bytes, offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 16 > bytes.length) return null;
      format = {
        tag: u16(bytes, body),
        channels: u16(bytes, body + 2),
        rate: u32(bytes, body + 4),
        blockAlign: u16(bytes, body + 12),
        bits: u16(bytes, body + 14),
      };
    } else if (id === "data") {
      if (!format || format.tag !== 1 || format.blockAlign <= 0) return null;
      const room = Math.max(0, fileSize - body);
      const declared = size === 0 || size === 0xffffffff ? room : Math.min(size, room);
      const dataBytes = declared - (declared % format.blockAlign);
      return { ...format, dataOffset: body, dataBytes, samples: dataBytes / format.blockAlign };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** A canonical 44-byte header for `dataBytes` of integer PCM. */
export function wavHeader(
  layout: Pick<WavLayout, "channels" | "rate" | "bits">,
  dataBytes: number,
) {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const blockAlign = (layout.channels * layout.bits) / 8;
  header.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataBytes, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, layout.channels, true);
  view.setUint32(24, layout.rate, true);
  view.setUint32(28, layout.rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, layout.bits, true);
  header.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataBytes, true);
  return header;
}

/** The sample frame at (or before) a time: times on the canonical file's own clock. */
export function sampleAt(layout: Pick<WavLayout, "rate" | "samples">, seconds: number): number {
  return Math.max(0, Math.min(layout.samples, Math.round(seconds * layout.rate)));
}

/**
 * The bytes of the sound from sample `from` up to (not including) sample
 * `to`, as an inclusive HTTP Range: what to ask storage for to cut a piece.
 */
export function byteRange(
  layout: WavLayout,
  from: number,
  to: number,
): { start: number; end: number } {
  const first = Math.max(0, Math.min(from, layout.samples));
  const last = Math.max(first, Math.min(to, layout.samples));
  const start = layout.dataOffset + first * layout.blockAlign;
  return { start, end: Math.max(start, layout.dataOffset + last * layout.blockAlign - 1) };
}

/** A piece of a WAV as a WAV of its own: the canonical header, then the sound as given. */
export function wavFile(
  layout: Pick<WavLayout, "channels" | "rate" | "bits">,
  sound: Uint8Array,
): Uint8Array {
  const blockAlign = (layout.channels * layout.bits) / 8;
  const whole = sound.length - (sound.length % blockAlign);
  const file = new Uint8Array(44 + whole);
  file.set(wavHeader(layout, whole), 0);
  file.set(sound.subarray(0, whole), 44);
  return file;
}

/**
 * How much a voiceover is raised before a model is sent it: a driving voice
 * that is too quiet can leave a model's lips barely moving. Its speech level
 * (the loudest twentieth of its 10 ms levels, in dBFS, as the media worker
 * measures it) is brought up to `targetDb`, never down, by at most `maxDb`.
 * One gain for the whole voiceover, so its pieces stay as loud as each other.
 */
export function speechGainDb(
  speechDb: number | null | undefined,
  targetDb = -14,
  maxDb = 24,
): number {
  if (typeof speechDb !== "number" || !Number.isFinite(speechDb) || speechDb <= -90) return 0;
  const gain = Math.min(maxDb, targetDb - speechDb);
  // Within a decibel already: left alone.
  return gain > 1 ? Number(gain.toFixed(2)) : 0;
}

/**
 * 16-bit sound raised by `gainDb`, its loudest sample held at or under
 * `ceilingDb` (the gain is lowered rather than any sample clipped). Returns
 * the sound and the gain applied, in dB (0 when it was left as it was).
 */
export function gainPcm16(
  sound: Uint8Array,
  gainDb: number,
  ceilingDb = -1,
): { sound: Uint8Array; gainDb: number } {
  if (!(gainDb > 0)) return { sound, gainDb: 0 };
  const view = new DataView(sound.buffer, sound.byteOffset, sound.byteLength);
  const count = Math.floor(sound.byteLength / 2);
  let peak = 0;
  for (let index = 0; index < count; index += 1)
    peak = Math.max(peak, Math.abs(view.getInt16(index * 2, true)));
  if (peak === 0) return { sound, gainDb: 0 };
  const room = (32767 * 10 ** (ceilingDb / 20)) / peak;
  const gain = Math.min(10 ** (gainDb / 20), room);
  if (gain <= 1) return { sound, gainDb: 0 };
  const out = new Uint8Array(count * 2);
  const outView = new DataView(out.buffer);
  for (let index = 0; index < count; index += 1) {
    const value = Math.round(view.getInt16(index * 2, true) * gain);
    outView.setInt16(index * 2, Math.max(-32768, Math.min(32767, value)), true);
  }
  return { sound: out, gainDb: Number((20 * Math.log10(gain)).toFixed(2)) };
}

/** Sound followed by silence, to `frames` sample frames in all (as it is, when it is that long already). */
export function withSilenceAfter(
  sound: Uint8Array,
  frames: number,
  blockAlign: number,
): Uint8Array {
  const bytes = frames * blockAlign;
  if (sound.byteLength >= bytes) return sound;
  const out = new Uint8Array(bytes);
  out.set(sound, 0);
  return out;
}
