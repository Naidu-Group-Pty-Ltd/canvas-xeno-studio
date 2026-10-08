/**
 * Whether a recording holds audio that browsers and the renderer can decode,
 * read from its structure rather than its name or its first bytes: MP3 frames
 * that follow one another, a WAV's format and its data, an MP4/M4A whose sound
 * track (AAC, MP3, Opus or FLAC) has its samples timed and in the file, an Ogg
 * stream of Vorbis, Opus or FLAC whose headers and first sound packet are whole
 * (its pages' checksums right), or FLAC with its stream description and a
 * whole first frame (its checksums right). Only small parts of the file are
 * read (`read`), and only a few times, so a large file is never fetched whole
 * to check it.
 */

/** Reads up to `length` bytes from `offset` (fewer at the end of the file). */
export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

export type ProbedAudio = "mp3" | "wav" | "m4a" | "ogg" | "flac";

/** The media type each kind of audio is recorded as. */
export const PROBED_MIME: Record<ProbedAudio, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

/** Every kind recognised (catalogue files come in all of them). */
export const ALL_AUDIO: readonly ProbedAudio[] = ["mp3", "wav", "m4a", "ogg", "flac"];

const HEAD_BYTES = 64 * 1024;
/** A sound track's description is small; one larger than this isn't read. */
const MAX_MOOV_BYTES = 16 * 1024 * 1024;
/** How many boxes or chunks are walked before giving up. */
const MAX_PARTS = 64;
/** How many Ogg pages are walked to reach sound (headers with cover art can span many). */
const MAX_OGG_PAGES = 1024;
/** How many reads a check may make past the first part, however the file is laid out. */
const MAX_READS = 16;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const u16le = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const u16be = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u32le = (bytes: Uint8Array, at: number) =>
  ((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16)) +
  (bytes[at + 3] ?? 0) * 0x1000000;
const u32be = (bytes: Uint8Array, at: number) =>
  (bytes[at] ?? 0) * 0x1000000 +
  (((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0));

/** Bytes from the part already read when they're in it, else read now. */
async function bytesAt(
  head: Uint8Array,
  read: ReadRange,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  if (offset + length <= head.length) return head.subarray(offset, offset + length);
  return read(offset, length);
}

/** The kind of audio a file holds, of those accepted (`kinds`), or null if it holds none of them. */
export async function probeAudio(
  read: ReadRange,
  size: number,
  kinds: readonly ProbedAudio[] = ALL_AUDIO,
): Promise<ProbedAudio | null> {
  if (!Number.isFinite(size) || size < 64) return null;
  const head = await read(0, Math.min(size, HEAD_BYTES));
  if (head.length < 64) return null;
  // A file that needs more reads than this to show it holds audio isn't taken.
  let reads = 0;
  const limited: ReadRange = async (offset, length) =>
    (reads += 1) > MAX_READS ? new Uint8Array(0) : read(offset, length);
  return probed(head, limited, size, kinds);
}

/** The same, for a file already in memory (all of it is at hand, so nothing is read). */
export async function probeBytes(
  bytes: Uint8Array,
  kinds: readonly ProbedAudio[] = ALL_AUDIO,
): Promise<ProbedAudio | null> {
  if (bytes.length < 64) return null;
  return probed(
    bytes,
    async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)),
    bytes.length,
    kinds,
  );
}

/** What a file's first bytes say it is (its structure says whether it is). */
function claimedKind(head: Uint8Array): ProbedAudio | null {
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WAVE") return "wav";
  if (ascii(head, 4, 4) === "ftyp") return "m4a";
  if (ascii(head, 0, 4) === "OggS") return "ogg";
  if (ascii(head, 0, 4) === "fLaC") return "flac";
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0))
    return "mp3";
  return null;
}

type Check = (head: Uint8Array, read: ReadRange, size: number) => Promise<boolean>;

const CHECKS: Record<ProbedAudio, Check> = {
  mp3: isMp3,
  wav: isWav,
  m4a: isMp4Audio,
  ogg: isOggAudio,
  flac: isFlac,
};

async function probed(
  head: Uint8Array,
  read: ReadRange,
  size: number,
  kinds: readonly ProbedAudio[],
): Promise<ProbedAudio | null> {
  const kind = claimedKind(head);
  // A kind that isn't accepted is refused without walking the file.
  if (!kind || !kinds.includes(kind)) return null;
  return (await CHECKS[kind](head, read, size)) ? kind : null;
}

/* ---------------------------------------------------------------- MP3 */

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** The length of the MPEG Layer III frame whose header starts here, or null if none does. */
function mp3FrameAt(bytes: Uint8Array, at: number): number | null {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xe0) !== 0xe0)
    return null;
  const version = ((bytes[at + 1] ?? 0) >> 3) & 0x03;
  const layer = ((bytes[at + 1] ?? 0) >> 1) & 0x03;
  const bitrateIndex = ((bytes[at + 2] ?? 0) >> 4) & 0x0f;
  const rateIndex = ((bytes[at + 2] ?? 0) >> 2) & 0x03;
  const padding = ((bytes[at + 2] ?? 0) >> 1) & 0x01;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3)
    return null;
  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]! * 1000;
  const rate = SAMPLE_RATES[version]![rateIndex]!;
  const length = Math.floor((((version === 3 ? 1152 : 576) / 8) * bitrate) / rate) + padding;
  return length >= 24 ? length : null;
}

/** Audio frames after any ID3 tag: at least three in a row, each where the one before says. */
async function isMp3(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  return (await firstMp3Frame(head, read, size)) !== null;
}

/** Where the first of three MPEG Layer III frames in a row starts, after any ID3 tag. */
async function firstMp3Frame(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<number | null> {
  let start = 0;
  if (ascii(head, 0, 3) === "ID3") {
    const tag =
      (((head[6] ?? 0) & 0x7f) << 21) |
      (((head[7] ?? 0) & 0x7f) << 14) |
      (((head[8] ?? 0) & 0x7f) << 7) |
      ((head[9] ?? 0) & 0x7f);
    start = 10 + tag + ((head[5] ?? 0) & 0x10 ? 10 : 0);
  }
  if (start + 4 > size) return null;
  const window = await bytesAt(head, read, start, Math.min(size - start, 16 * 1024));
  // Encoders may leave a little padding before the first frame.
  for (let first = 0; first < Math.min(window.length - 4, 4096); first += 1)
    if (framesInARow(window, first, 3)) return start + first;
  return null;
}

/** Whether `count` MPEG Layer III frames follow one another from here, each where the one before says. */
function framesInARow(bytes: Uint8Array, at: number, count: number): boolean {
  let frames = 0;
  for (let length = mp3FrameAt(bytes, at); length !== null; length = mp3FrameAt(bytes, at)) {
    frames += 1;
    at += length;
    if (frames >= count) return true;
  }
  return false;
}

/** How long the MPEG Layer III frame whose (valid) header starts here plays, in seconds. */
function mp3FrameSeconds(bytes: Uint8Array, at: number): number {
  const version = ((bytes[at + 1] ?? 0) >> 3) & 0x03;
  const rate = SAMPLE_RATES[version]![((bytes[at + 2] ?? 0) >> 2) & 0x03]!;
  return (version === 3 ? 1152 : 576) / rate;
}

/* ---------------------------------------------------------------- WAV */

/** The fixed part of a WAVE_FORMAT_EXTENSIBLE subformat GUID (xxxxxxxx-0000-0010-8000-00AA00389B71), after its format code. */
const EXTENSIBLE_TAIL = [
  0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
];

/** A WAV whose format browsers decode (PCM, or 32-bit floating point), followed by data that is really there. */
async function isWav(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  let offset = 12;
  let formatOk = false;
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, 8);
    if (header.length < 8) return false;
    const id = ascii(header, 0, 4);
    const length = u32le(header, 4);
    if (id === "fmt ") {
      const format = await bytesAt(head, read, offset + 8, Math.min(length, 40));
      if (format.length < 16) return false;
      // [code][channels][rate][byte rate][block align][bits a sample], and for
      // WAVE_FORMAT_EXTENSIBLE (0xFFFE) [extra size: 22][valid bits][channel
      // mask: 4][subformat: a GUID whose first two bytes are its format code].
      let code = u16le(format, 0);
      const channels = u16le(format, 2);
      const rate = u32le(format, 4);
      const bits = u16le(format, 14);
      if (code === 0xfffe) {
        if (format.length < 40 || u16le(format, 16) < 22) return false;
        if (!EXTENSIBLE_TAIL.every((byte, index) => format[26 + index] === byte)) return false;
        code = u16le(format, 24);
      }
      // PCM (1) at 8 to 32 bits, or 32-bit floating point (3). Chrome decodes no
      // 64-bit samples, and Firefox reads any floating point as 32-bit.
      formatOk =
        ((code === 1 && [8, 16, 24, 32].includes(bits)) || (code === 3 && bits === 32)) &&
        channels >= 1 &&
        channels <= 32 &&
        rate >= 8000 &&
        rate <= 384_000;
      if (!formatOk) return false;
    } else if (id === "data") {
      // Audio bytes must follow (a streamed WAV may not know its length: all ones).
      return formatOk && length > 0 && offset + 8 + 64 <= size;
    }
    offset += 8 + length + (length & 1);
  }
  return false;
}

/* ---------------------------------------------------------------- MP4 / M4A */

/** Sound in MP4 that browsers and the renderer decode: AAC (or MP3) as `mp4a`, Opus and FLAC. */
const MP4_SOUND = new Set(["mp4a", "Opus", "fLaC"]);

type Box = { type: string; start: number; end: number };

/** The boxes directly inside `bytes[start, end)`, each with where its content starts and ends. */
function boxesIn(bytes: Uint8Array, start: number, end: number): Box[] {
  const found: Box[] = [];
  let at = start;
  while (at + 8 <= end && found.length < 4096) {
    let length = u32be(bytes, at);
    let header = 8;
    if (length === 1) {
      if (at + 16 > end) break;
      length = u32be(bytes, at + 8) * 0x100000000 + u32be(bytes, at + 12);
      header = 16;
    } else if (length === 0) {
      length = end - at;
    }
    if (length < header || at + length > end) break;
    found.push({ type: ascii(bytes, at + 4, 4), start: at + header, end: at + length });
    at += length;
  }
  return found;
}

/** The first box of a type inside another, if there is one. */
function boxIn(bytes: Uint8Array, parent: Box | null, type: string): Box | null {
  if (!parent) return null;
  return boxesIn(bytes, parent.start, parent.end).find((box) => box.type === type) ?? null;
}

/** The content of a movie box (moov) read whole, header and all. */
const movieContent = (movie: Uint8Array): Box => ({
  type: "moov",
  start: u32be(movie, 0) === 1 ? 16 : 8,
  end: movie.length,
});

/** Whether one media data box's content holds the bytes from `start` to `end` (`media` in file order). */
function inMedia(media: readonly Box[], start: number, end: number): boolean {
  let low = 0;
  let high = media.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const box = media[middle]!;
    if (start < box.start) high = middle - 1;
    else if (start >= box.end) low = middle + 1;
    else return end <= box.end;
  }
  return false;
}

/**
 * Whether the movie's sound track can be played: the first sound track with
 * samples, the one browsers play (one with none, as a fragmented file's movie
 * has, plays nothing, and the next is looked at). Every one of its samples
 * must be listed in the movie, timed, in a sample description decoded here,
 * and lie inside the file's media data (mdat), chunk by chunk.
 */
function soundTrackInMedia(movie: Uint8Array, media: readonly Box[]): boolean {
  const moov = movieContent(movie);
  for (const trak of boxesIn(movie, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = boxIn(movie, trak, "mdia");
    // hdlr: [version, flags][pre-defined][handler type].
    const hdlr = boxIn(movie, mdia, "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || ascii(movie, hdlr.start + 8, 4) !== "soun") continue;
    const stbl = boxIn(movie, boxIn(movie, mdia, "minf"), "stbl");
    // stsz: [version, flags][one size for every sample, or 0][sample count][sizes…]
    const stsz = boxIn(movie, stbl, "stsz");
    const samples = stsz && stsz.start + 12 <= stsz.end ? u32be(movie, stsz.start + 8) : 0;
    if (!stbl || !stsz || samples === 0) continue;
    return soundTrackPlays(movie, media, stbl, stsz, samples);
  }
  return false;
}

/** The checks of soundTrackInMedia, for one sound track with samples. */
function soundTrackPlays(
  movie: Uint8Array,
  media: readonly Box[],
  stbl: Box,
  stsz: Box,
  samples: number,
): boolean {
  // stsd: [version, flags][entry count], then its sample descriptions, each a
  // box of its codec. Every one the chunks use must be decoded here.
  const stsd = boxIn(movie, stbl, "stsd");
  if (!stsd || stsd.start + 16 > stsd.end || u32be(movie, stsd.start + 4) < 1) return false;
  const descriptions = boxesIn(movie, stsd.start + 8, stsd.end).slice(
    0,
    u32be(movie, stsd.start + 4),
  );
  const decoded = (index: number) =>
    index >= 1 && index <= descriptions.length && decodedHere(movie, descriptions[index - 1]!);
  const everySample = u32be(movie, stsz.start + 4);
  if (!everySample && stsz.start + 12 + samples * 4 > stsz.end) return false;
  // stts: runs of samples, each [how many][how long each lasts]. Every sample
  // must be timed (decoders drop a track without it). Samples of no length
  // leave decoders next to nothing to play (all of them, or all but the last:
  // 0.02 s of two seconds in FFmpeg and Chrome), so each but the last has one.
  const stts = boxIn(movie, stbl, "stts");
  if (!stts || stts.start + 8 > stts.end) return false;
  const timings = u32be(movie, stts.start + 4);
  if (stts.start + 8 + timings * 8 > stts.end) return false;
  let timed = 0;
  for (let timing = 0; timing < timings && timed < samples; timing += 1) {
    const inRun = u32be(movie, stts.start + 8 + timing * 8);
    if (inRun > 0 && timed < samples - 1 && u32be(movie, stts.start + 12 + timing * 8) === 0)
      return false;
    timed += inRun;
  }
  if (timed < samples) return false;
  // stco / co64: where each chunk of samples is in the file (32 or 64 bits).
  const stco = boxIn(movie, stbl, "stco");
  const offsets = stco ?? boxIn(movie, stbl, "co64");
  if (!offsets || offsets.start + 8 > offsets.end) return false;
  const step = stco ? 4 : 8;
  const chunks = u32be(movie, offsets.start + 4);
  if (chunks === 0 || offsets.start + 8 + chunks * step > offsets.end) return false;
  // stsc: runs of chunks, each [its first chunk, counted from 1][samples in
  // each of its chunks][description], the first starting at chunk 1.
  const stsc = boxIn(movie, stbl, "stsc");
  if (!stsc || stsc.start + 8 > stsc.end) return false;
  const runs = u32be(movie, stsc.start + 4);
  if (runs === 0 || stsc.start + 8 + runs * 12 > stsc.end) return false;
  const runStart = (run: number) => u32be(movie, stsc.start + 8 + run * 12);
  let ordered = runStart(0) === 1;
  for (let run = 1; run < runs && ordered; run += 1) ordered = runStart(run) > runStart(run - 1);
  if (!ordered) return false;
  // Every chunk, with the samples its run gives it, inside media data, and in
  // a sample description decoded here (each run names its own); and the
  // chunks hold every sample. (With one size for every sample, a chunk's
  // length is worked out rather than counted: the counts come from the file.)
  let sample = 0;
  let run = 0;
  for (let chunk = 0; chunk < chunks && sample < samples; chunk += 1) {
    while (run + 1 < runs && runStart(run + 1) <= chunk + 1) run += 1;
    if (!decoded(u32be(movie, stsc.start + 16 + run * 12))) return false;
    const inChunk = Math.min(u32be(movie, stsc.start + 12 + run * 12), samples - sample);
    if (inChunk < 1) break;
    const at = offsets.start + 8 + chunk * step;
    const start = stco ? u32be(movie, at) : u32be(movie, at) * 0x100000000 + u32be(movie, at + 4);
    let length = inChunk * everySample;
    if (!everySample)
      for (let index = sample; index < sample + inChunk; index += 1)
        length += u32be(movie, stsz.start + 12 + index * 4);
    if (!inMedia(media, start, start + length)) return false;
    sample += inChunk;
  }
  return sample === samples;
}

/**
 * Whether an MP4 sample description is one browsers and the renderer decode:
 * AAC (LC, or HE-AAC over an LC core) or MP3 in an mp4a entry whose decoder
 * configuration says so, Opus with its dOps box, or FLAC with its dfLa box.
 */
function decodedHere(movie: Uint8Array, entry: Box): boolean {
  if (!MP4_SOUND.has(entry.type) || entry.start + 28 > entry.end) return false;
  // [reserved: 6][reference: 2][version: 2]…, 28 bytes in version 0 (more in 1 and 2), then its own boxes.
  const version = u16be(movie, entry.start + 8);
  const own = boxesIn(
    movie,
    entry.start + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0),
    entry.end,
  );
  if (entry.type === "Opus")
    return own.some((box) => box.type === "dOps" && box.start + 11 <= box.end);
  if (entry.type === "fLaC")
    return own.some(
      (box) =>
        box.type === "dfLa" && flacLayout(movie.subarray(0, box.end), box.start + 8) !== null,
    );
  const esds = own.find((box) => box.type === "esds");
  const config = esds ? esdsConfig(movie, esds) : null;
  if (!config) return false;
  // MPEG-4 audio: AAC LC (2), or HE-AAC (5, 29) over an LC core.
  if (config.objectType === 0x40)
    return config.coreType === 2 && [2, 5, 29].includes(config.audioType);
  // MPEG-2 AAC LC, and MPEG-2 and MPEG-1 audio (MP3).
  return [0x67, 0x69, 0x6b].includes(config.objectType);
}

/**
 * An MP4's movie box (moov, read whole; the first, as decoders take it) and
 * where its media data boxes (mdat) hold their content, from its top-level
 * boxes; null when they don't add up or there is no movie. Once both are found,
 * what follows that can't be read, or isn't a box (an appended tag, say), ends
 * the walk: the samples must then be in what was found.
 */
async function mp4Parts(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<{ movie: Uint8Array; media: Box[] } | null> {
  let offset = 0;
  let movie: Uint8Array | null = null;
  const media: Box[] = [];
  const found = () => (movie && media.length ? { movie, media } : null);
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, Math.min(16, size - offset));
    if (header.length < 8) return found();
    let length = u32be(header, 0);
    const type = ascii(header, 4, 4);
    let headerLength = 8;
    if (length === 1) {
      if (header.length < 16) return found();
      length = u32be(header, 8) * 0x100000000 + u32be(header, 12);
      headerLength = 16;
    } else if (length === 0) {
      length = size - offset;
    }
    if (length < headerLength || offset + length > size) return found();
    if (type === "moov" && !movie) {
      if (length > MAX_MOOV_BYTES) return null;
      movie = await bytesAt(head, read, offset, length);
      if (movie.length < length) return null;
    } else if (type === "mdat" && length > headerLength) {
      media.push({ type, start: offset + headerLength, end: offset + length });
    }
    offset += length;
  }
  return movie ? { movie, media } : null;
}

/**
 * An MP4 or M4A with a sound track the studio can use (not, say, picture only,
 * an empty track, a fragmented file, or a codec browsers can't play such as
 * Apple Lossless), all of whose samples are in its media data (a file cut off
 * has them run past its end; a damaged one, elsewhere).
 */
async function isMp4Audio(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  const parts = await mp4Parts(head, read, size);
  return parts !== null && parts.media.length > 0 && soundTrackInMedia(parts.movie, parts.media);
}

/* ---------------------------------------------------------------- Ogg */

/** The largest an Ogg page can be: its header, 255 segment lengths, and 255 segments of 255 bytes. */
const MAX_OGG_PAGE = 27 + 255 + 255 * 255;

/** Ogg's page checksum: CRC-32 (0x04C11DB7, not reflected, from 0). */
const OGG_CRC = new Uint32Array(256);
for (let byte = 0; byte < 256; byte += 1) {
  let crc = byte << 24;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  OGG_CRC[byte] = crc >>> 0;
}

/** Whether a whole Ogg page carries its own checksum (worked out with the checksum's place as zeros). */
function oggPageIntact(page: Uint8Array): boolean {
  let crc = 0;
  for (let index = 0; index < page.length; index += 1) {
    const byte = index >= 22 && index < 26 ? 0 : (page[index] ?? 0);
    crc = ((crc << 8) ^ (OGG_CRC[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  }
  return crc === u32le(page, 22);
}

/** Reads a file in parts that each hold two whole Ogg pages or more, keeping the part read last. */
function oggReader(head: Uint8Array, read: ReadRange, size: number): ReadRange {
  let start = 0;
  let part = head;
  return async (offset, length) => {
    if (offset < start || offset + length > start + part.length) {
      start = offset;
      part = await read(offset, Math.min(Math.max(length, 2 * MAX_OGG_PAGE), size - offset));
    }
    return part.subarray(offset - start, offset - start + length);
  };
}

/** One Ogg page, read whole. */
type OggPage = {
  serial: number;
  /** It opens its stream: the stream's first page. */
  opens: boolean;
  /** Its first packet goes on from the stream's page before. */
  continues: boolean;
  /** It closes its stream: the stream's last page. */
  closes: boolean;
  /** Its segments' lengths: a packet ends with a segment shorter than 255. */
  lengths: Uint8Array;
  /** The whole page, its packet data from `data` on. */
  bytes: Uint8Array;
  data: number;
};

/** The Ogg page that starts at `offset`, read whole, or null if there isn't one there. */
async function oggPage(pages: ReadRange, offset: number, size: number): Promise<OggPage | null> {
  if (offset + 27 > size) return null;
  // [OggS][version][flags][position: 8][serial: 4][page number: 4][checksum: 4][segments][their lengths]
  const header = await pages(offset, 27);
  if (header.length < 27 || ascii(header, 0, 4) !== "OggS" || header[4] !== 0) return null;
  const segments = header[26] ?? 0;
  const table = await pages(offset, 27 + segments);
  if (table.length < 27 + segments) return null;
  let body = 0;
  for (const length of table.subarray(27)) body += length;
  const bytes = await pages(offset, 27 + segments + body);
  if (bytes.length < 27 + segments + body) return null;
  const flags = header[5] ?? 0;
  return {
    serial: u32le(header, 14),
    opens: (flags & 0x02) !== 0,
    continues: (flags & 0x01) !== 0,
    closes: (flags & 0x04) !== 0,
    lengths: bytes.subarray(27, 27 + segments),
    bytes,
    data: 27 + segments,
  };
}

type OggSound = "vorbis" | "opus" | "flac";

/**
 * What an Ogg stream's identification header (its first packet, whole) says
 * it holds, when that is sound browsers decode and the header is well formed,
 * and how many header packets follow it (for FLAC, null: they run to the
 * metadata block marked last).
 */
function oggIdentification(
  packet: Uint8Array,
): { sound: OggSound; headers: number | null; streams: number } | null {
  const id = ascii(packet, 0, 8);
  if (id.startsWith("\u0001vorbis")) {
    // [1]vorbis[version: 4][channels][rate: 4][bit rates: 12][block sizes: 2 × 4 bits][framing]
    const small = (packet[28] ?? 0) & 0x0f;
    const large = (packet[28] ?? 0) >> 4;
    const formed =
      packet.length === 30 &&
      u32le(packet, 7) === 0 &&
      (packet[11] ?? 0) >= 1 &&
      u32le(packet, 12) > 0 &&
      small >= 6 &&
      small <= large &&
      large <= 13 &&
      ((packet[29] ?? 0) & 0x01) === 1;
    return formed ? { sound: "vorbis", headers: 2, streams: 1 } : null;
  }
  if (id === "OpusHead") {
    // OpusHead[version][channels][samples skipped: 2][rate: 4][gain: 2][mapping family], and
    // past family 0 [streams][coupled streams][the stream each channel is in].
    const channels = packet[9] ?? 0;
    if (packet.length < 19 || ((packet[8] ?? 0) & 0xf0) !== 0 || channels < 1) return null;
    if (packet[18] === 0) return channels <= 2 ? { sound: "opus", headers: 1, streams: 1 } : null;
    const streams = packet[19] ?? 0;
    const coupled = packet[20] ?? 0;
    if (packet.length < 21 + channels || streams < 1 || coupled > streams) return null;
    if (streams + coupled > 255) return null;
    for (const stream of packet.subarray(21, 21 + channels))
      if (stream !== 255 && stream >= streams + coupled) return null;
    return { sound: "opus", headers: 1, streams };
  }
  if (id.startsWith("\u007fFLAC")) {
    // [7F]FLAC[version: 1, minor][header packets: 2]fLaC, then the STREAMINFO metadata block:
    // [marked last, type 0][length: 3, 34][block sizes: 2 × 2]…[rate and channels]…
    const block = ((packet[14] ?? 0) << 16) | ((packet[15] ?? 0) << 8) | (packet[16] ?? 0);
    const smallest = u16be(packet, 17);
    const formed =
      packet.length === 51 &&
      packet[5] === 1 &&
      ascii(packet, 9, 4) === "fLaC" &&
      ((packet[13] ?? 0) & 0x7f) === 0 &&
      block === 34 &&
      smallest >= 16 &&
      u16be(packet, 19) >= smallest &&
      flacLayout(packet, 17) !== null;
    if (!formed) return null;
    return { sound: "flac", headers: (packet[13] ?? 0) & 0x80 ? 0 : null, streams: 1 };
  }
  return null;
}

/** Whether a header packet (its first bytes, and its length) is the one its stream needs at this place. */
function oggHeader(sound: OggSound, index: number, start: Uint8Array, length: number): boolean {
  if (sound === "vorbis") {
    // The comment header, [3]vorbis[vendor: its length, 4][comments: their count, 4, then each][framing],
    // then the setup header, [5]vorbis[codebooks - 1], its first codebook opening "BCV".
    if (index === 1)
      return ascii(start, 0, 7) === "\u0003vorbis" && 7 + 4 + u32le(start, 7) + 4 + 1 <= length;
    return ascii(start, 0, 7) === "\u0005vorbis" && ascii(start, 8, 3) === "BCV";
  }
  // OpusTags[vendor: its length, 4][comments: their count, 4, then each]
  if (sound === "opus")
    return ascii(start, 0, 8) === "OpusTags" && 8 + 4 + u32le(start, 8) + 4 <= length;
  // A FLAC metadata block after STREAMINFO, [marked last, type][length: 3], as long as it says.
  const type = (start[0] ?? 0) & 0x7f;
  const stated = ((start[1] ?? 0) << 16) | ((start[2] ?? 0) << 8) | (start[3] ?? 0);
  return type >= 1 && type <= 126 && 4 + stated === length;
}

/** An Opus frame's length, in one byte (under 252) or two, and how many bytes it takes; null past the packet. */
function opusFrameLength(packet: Uint8Array, at: number): [number, number] | null {
  const first = packet[at];
  if (first === undefined) return null;
  if (first < 252) return [first, 1];
  const second = packet[at + 1];
  return second === undefined ? null : [first + 4 * second, 2];
}

/** How long an Opus frame of the configuration its TOC byte gives lasts, in tenths of a millisecond. */
function opusFrameTenths(toc: number): number {
  const config = toc >> 3;
  if (config < 12) return [100, 200, 400, 600][config & 3]!;
  if (config < 16) return [100, 200][config & 1]!;
  return [25, 50, 100, 200][config & 3]!;
}

/** Whether an Opus packet is laid out as RFC 6716 (3.4, R1 to R7) requires: its frames fit it. */
function opusPacket(packet: Uint8Array): boolean {
  const toc = packet[0];
  if (toc === undefined) return false;
  const rest = packet.length - 1;
  // Code 0: one frame; code 1: two of the same length; code 2: two, the first's length given.
  if ((toc & 0x03) === 0) return rest <= 1275;
  if ((toc & 0x03) === 1) return rest % 2 === 0 && rest / 2 <= 1275;
  if ((toc & 0x03) === 2) {
    const first = opusFrameLength(packet, 1);
    return first !== null && first[0] <= rest - first[1] && rest - first[1] - first[0] <= 1275;
  }
  // Code 3: [frame count, with whether it pads and whether its frames' lengths vary], what pads
  // it, and (varying) the lengths of all its frames but the last: up to 120 ms of them.
  const count = (packet[1] ?? 0) & 0x3f;
  if (packet.length < 2 || count < 1 || count * opusFrameTenths(toc) > 1200) return false;
  let at = 2;
  let padding = 0;
  if ((packet[1] ?? 0) & 0x40)
    for (let more = true; more; at += 1) {
      const byte = packet[at];
      if (byte === undefined) return false;
      padding += byte === 255 ? 254 : byte;
      more = byte === 255;
    }
  if ((packet[1] ?? 0) & 0x80) {
    let frames = 0;
    for (let frame = 1; frame < count; frame += 1) {
      const length = opusFrameLength(packet, at);
      if (length === null) return false;
      frames += length[0];
      at += length[1];
    }
    const last = packet.length - at - frames - padding;
    return last >= 0 && last <= 1275;
  }
  const frames = packet.length - at - padding;
  return frames >= 0 && frames % count === 0 && frames / count <= 1275;
}

/**
 * Where the self-delimited Opus packet (RFC 6716, appendix B) that starts at
 * `at` ends, its frames' lengths all given; null if they don't fit.
 */
function opusDelimitedEnd(packet: Uint8Array, at: number): number | null {
  const toc = packet[at];
  if (toc === undefined) return null;
  let next = at + 1;
  const take = (): number | null => {
    const length = opusFrameLength(packet, next);
    if (length === null) return null;
    next += length[1];
    return length[0];
  };
  let frames = 0;
  let padding = 0;
  if ((toc & 0x03) < 3) {
    // Code 0: [its frame's length]; code 1: [the length of each of two]; code 2: [the first's][the second's].
    const first = take();
    const second = (toc & 0x03) === 2 && first !== null ? take() : first;
    if (first === null || second === null) return null;
    frames = (toc & 0x03) === 0 ? first : first + second;
  } else {
    // Code 3: [frame count…][what pads it], then each frame's length (varying) or one for all.
    const flags = packet[next];
    const count = (flags ?? 0) & 0x3f;
    if (flags === undefined || count < 1 || count * opusFrameTenths(toc) > 1200) return null;
    next += 1;
    if (flags & 0x40)
      for (let more = true; more; next += 1) {
        const byte = packet[next];
        if (byte === undefined) return null;
        padding += byte === 255 ? 254 : byte;
        more = byte === 255;
      }
    for (let frame = 0; frame < (flags & 0x80 ? count : 1); frame += 1) {
      const length = take();
      if (length === null) return null;
      frames += flags & 0x80 ? length : count * length;
    }
  }
  return next + frames + padding <= packet.length ? next + frames + padding : null;
}

/**
 * Whether a stream's first sound packet, whole, reads as its codec's. An Opus
 * stream of several (its channels past two) carries a packet of each in one,
 * all but the last self-delimited.
 */
function oggSoundPacket(sound: OggSound, packet: Uint8Array, streams: number): boolean {
  // Vorbis: an audio packet's first bit is 0 (its headers' is 1).
  if (sound === "vorbis") return packet.length > 0 && ((packet[0] ?? 0) & 0x01) === 0;
  if (sound === "opus") {
    let at = 0;
    for (let stream = 1; stream < streams; stream += 1) {
      const end = opusDelimitedEnd(packet, at);
      if (end === null) return false;
      at = end;
    }
    return opusPacket(packet.subarray(at));
  }
  // FLAC: one whole frame, its checksums right.
  return wholeFlacFrame(packet, true);
}

/**
 * An Ogg file whose first sound stream (Vorbis, Opus or FLAC; a video-only
 * file, say Theora, has none), the one played, can be decoded: its
 * identification header well formed and alone on the stream's first page, the
 * headers its codec needs whole after it, then a whole first sound packet that
 * reads as its codec's, with every page of the stream up to there carrying its
 * checksum and its packets in order. A file cut off before its sound, or with
 * a page in that stretch damaged or made up, has none.
 */
async function isOggAudio(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  const pages = oggReader(head, read, size);
  let serial = -1;
  let sound: OggSound = "vorbis";
  let headers: number | null = 0;
  let streams = 1;
  // The stream's packet being put together (its identification header is 0): its length so
  // far, and its parts (a header's first bytes, which say what it is; the sound packet whole).
  let index = 0;
  let length = 0;
  let parts: Uint8Array[] = [];
  let offset = 0;
  for (let count = 0; count < MAX_OGG_PAGES; count += 1) {
    const page = await oggPage(pages, offset, size);
    if (!page) return false;
    offset += page.bytes.length;
    if (serial === -1) {
      // Each stream opens, before any data, with a page that says what it holds.
      if (!page.opens) return false;
      const claimed = ascii(page.bytes, page.data, 8);
      if (
        !claimed.startsWith("\u0001vorbis") &&
        claimed !== "OpusHead" &&
        !claimed.startsWith("\u007fFLAC")
      )
        continue;
      const ends = page.lengths.findIndex((segment) => segment < 255);
      const alone = ends === page.lengths.length - 1 && !page.continues;
      const id =
        alone && oggPageIntact(page.bytes)
          ? oggIdentification(page.bytes.subarray(page.data))
          : null;
      if (!id) return false;
      ({ sound, headers, streams } = id);
      serial = page.serial;
      index = 1;
      continue;
    }
    if (page.serial !== serial) continue;
    if (!oggPageIntact(page.bytes) || page.continues !== length > 0) return false;
    let at = page.data;
    for (const segment of page.lengths) {
      const piece = page.bytes.subarray(at, at + segment);
      at += segment;
      const sounding = headers !== null && index > headers;
      if (sounding) parts.push(piece);
      else if (length < 64) parts.push(piece.subarray(0, 64 - length));
      length += segment;
      if (sounding && length > MAX_FLAC_FRAME) return false;
      if (segment === 255) continue;
      // The packet ends here.
      const packet = new Uint8Array(parts.reduce((sum, each) => sum + each.length, 0));
      let filled = 0;
      for (const each of parts) {
        packet.set(each, filled);
        filled += each.length;
      }
      if (sounding) return oggSoundPacket(sound, packet, streams);
      if (!oggHeader(sound, index, packet, length)) return false;
      // FLAC's headers run to the metadata block marked last.
      if (sound === "flac" && (packet[0] ?? 0) & 0x80) headers = index;
      index += 1;
      length = 0;
      parts = [];
    }
    // The stream ended before its sound.
    if (page.closes) return false;
  }
  return false;
}

/* ---------------------------------------------------------------- FLAC */

/** The largest a FLAC frame can be: 65535 samples of 8 channels at 32 bits, and its headers. */
const MAX_FLAC_FRAME = 2 * 1024 * 1024 + 64 * 1024;

/** FLAC's checksums: CRC-8 (x⁸+x²+x+1) over a frame's header, CRC-16 (x¹⁶+x¹⁵+x²+1) over the frame. */
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

/** The length of the FLAC frame header that starts here, its fields allowed and its CRC-8 right, or null. */
function flacFrameHeader(bytes: Uint8Array, at: number): number | null {
  if (at + 6 > bytes.length || bytes[at] !== 0xff || ((bytes[at + 1] ?? 0) & 0xfe) !== 0xf8)
    return null;
  const sizes = bytes[at + 2] ?? 0;
  const layout = bytes[at + 3] ?? 0;
  const blockBits = sizes >> 4;
  const rateBits = sizes & 0x0f;
  if (blockBits === 0 || rateBits === 0x0f || layout >> 4 > 10) return null;
  if (((layout >> 1) & 0x07) === 3 || (layout & 0x01) !== 0) return null;
  // The frame's (or first sample's) number, coded like UTF-8 in 1 to 7 bytes.
  const lead = bytes[at + 4] ?? 0;
  let more = 0;
  while (more < 7 && lead & (0x80 >> more)) more += 1;
  if (more === 1 || (more === 7 && lead !== 0xfe)) return null;
  let end = at + 5;
  for (let next = 1; next < more; next += 1, end += 1)
    if (((bytes[end] ?? 0) & 0xc0) !== 0x80) return null;
  // A block size or sample rate given after the number.
  end += blockBits === 6 ? 1 : blockBits === 7 ? 2 : 0;
  end += rateBits === 12 ? 1 : rateBits === 13 || rateBits === 14 ? 2 : 0;
  if (end >= bytes.length) return null;
  let crc = 0;
  for (let index = at; index < end; index += 1) crc = CRC8[crc ^ (bytes[index] ?? 0)] ?? 0;
  return crc === bytes[end] ? end + 1 - at : null;
}

/**
 * Whether `bytes` starts with a whole FLAC frame: its header, then where the
 * next frame starts (or, when `bytes` runs to the end of the file, where it
 * ends), the CRC-16 over the frame matches its footer. A frame cut off, or
 * damaged, has none.
 */
function wholeFlacFrame(bytes: Uint8Array, toTheEnd: boolean): boolean {
  const header = flacFrameHeader(bytes, 0);
  if (header === null) return false;
  // A CRC-16 run on through the footer that holds it comes to 0.
  let crc = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (index > header + 2 && crc === 0 && bytes[index] === 0xff && flacFrameHeader(bytes, index))
      return true;
    crc = ((crc << 8) & 0xffff) ^ (CRC16[(crc >> 8) ^ (bytes[index] ?? 0)] ?? 0);
  }
  return toTheEnd && bytes.length > header + 2 && crc === 0;
}

/**
 * A FLAC stream: its stream description, then where the descriptions end, a
 * whole first frame (its checksums right).
 */
async function isFlac(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  let offset = 4;
  let first = true;
  let largestFrame = 0;
  for (let part = 0; part < MAX_PARTS && offset + 4 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, 4);
    if (header.length < 4) return false;
    const last = ((header[0] ?? 0) & 0x80) !== 0;
    const type = (header[0] ?? 0) & 0x7f;
    const length = ((header[1] ?? 0) << 16) | ((header[2] ?? 0) << 8) | (header[3] ?? 0);
    if (first) {
      // STREAMINFO: a sample rate and channels that make sense, and the size
      // of the largest frame (0 when it isn't known).
      if (type !== 0 || length !== 34) return false;
      const info = await bytesAt(head, read, offset + 4, 18);
      if (info.length < 18) return false;
      largestFrame = ((info[7] ?? 0) << 16) | ((info[8] ?? 0) << 8) | (info[9] ?? 0);
      const rate = ((info[10] ?? 0) << 12) | ((info[11] ?? 0) << 4) | ((info[12] ?? 0) >> 4);
      const channels = (((info[12] ?? 0) >> 1) & 0x07) + 1;
      if (rate < 1 || rate > 655_350 || channels > 8) return false;
      first = false;
    }
    offset += 4 + length;
    if (last) {
      // The first frame, and the start of the one after it, in one read.
      const span = Math.min(
        size - offset,
        largestFrame ? Math.max(largestFrame + 16, 64 * 1024) : MAX_FLAC_FRAME,
      );
      if (span < 8) return false;
      const frame = await bytesAt(head, read, offset, span);
      return wholeFlacFrame(frame, offset + frame.length >= size);
    }
  }
  return false;
}

/* ---------------------------------------------------------------- Length */

/** How much of a file is read at a time to walk all of it. */
const COUNT_BYTES = 1024 * 1024;
/** Enough to check three MP3 frames (each at most 1441 bytes long) from a point. */
const MP3_LOOKAHEAD = 4 * 1024;
/** How many FLAC frame headers near the end are checked whole to find the last frame. */
const MAX_FLAC_CHECKS = 16;

/**
 * How long a recording plays, in seconds, read from its own structure the way
 * a decoder plays it, rather than from anything on record about it or what its
 * headers state: an MP3's frames counted, a WAV's data over the rate its format
 * plays at, an MP4/M4A's sound track by its samples and edit list, an Ogg
 * file's sound streams by the positions their pages reach, or FLAC by where its
 * last frame ends. Null when it's none of these, or can't be told.
 */
export async function probeDuration(read: ReadRange, size: number): Promise<number | null> {
  if (!Number.isFinite(size) || size < 64) return null;
  const head = await read(0, Math.min(size, HEAD_BYTES));
  if (head.length < 64) return null;
  switch (claimedKind(head)) {
    case "mp3":
      return mp3Seconds(head, read, size);
    case "wav":
      return wavSeconds(head, read, size);
    case "m4a":
      return mp4Seconds(head, read, size);
    case "ogg":
      return oggSeconds(head, read, size);
    case "flac":
      return flacSeconds(head, read, size);
    default:
      return null;
  }
}

/** Where the ID3v2 tag that starts here ends, or null if none does. */
function id3End(bytes: Uint8Array, at: number): number | null {
  // "ID3"[version][revision][flags][size: four 7-bit bytes], and a footer of 10 if flagged.
  if (at + 10 > bytes.length || ascii(bytes, at, 3) !== "ID3") return null;
  const version = bytes[at + 3] ?? 0;
  if (version < 2 || version > 4 || bytes[at + 4] === 0xff) return null;
  let length = 0;
  for (let index = at + 6; index < at + 10; index += 1) {
    if ((bytes[index] ?? 0) & 0x80) return null;
    length = length * 128 + (bytes[index] ?? 0);
  }
  return at + 10 + length + ((bytes[at + 5] ?? 0) & 0x10 ? 10 : 0);
}

/**
 * Where MP3 frames start again at or after `from`: three frames in a row, or
 * an ID3 tag (a file joined on after another has one), with where it ends.
 * Points too near the end of `bytes` to check aren't looked at unless `bytes`
 * runs to the end of the file; when nothing is found, where the search stopped.
 */
function mp3Resumes(
  bytes: Uint8Array,
  from: number,
  toTheEnd: boolean,
):
  | { kind: "frame"; at: number }
  | { kind: "tag"; end: number }
  | { kind: "none"; searched: number } {
  const until = toTheEnd ? bytes.length - 4 : bytes.length - MP3_LOOKAHEAD;
  for (let at = from; at < until; at += 1) {
    if (bytes[at] === 0xff) {
      if (framesInARow(bytes, at, 3)) return { kind: "frame", at };
    } else if (bytes[at] === 0x49) {
      const end = id3End(bytes, at);
      if (end !== null) return { kind: "tag", end };
    }
  }
  return { kind: "none", searched: Math.max(from, until) };
}

/**
 * Every frame counted, as a decoder plays them: one after another, each where
 * the one before says, and where something else comes between them (the tag
 * of a file joined on after another, or damage), on from where frames start
 * again. Read in parts.
 */
async function mp3Seconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const first = await firstMp3Frame(head, read, size);
  if (first === null) return null;
  let seconds = 0;
  let at = first;
  // Whether a frame starts at `at` (else where frames start again is looked for from there).
  let framed = true;
  while (at + 4 <= size) {
    const part = await bytesAt(head, read, at, Math.min(COUNT_BYTES, size - at));
    const toTheEnd = at + part.length >= size;
    let local = 0;
    let next: number | null = null;
    while (next === null) {
      if (framed) {
        for (
          let length = mp3FrameAt(part, local);
          length !== null;
          length = mp3FrameAt(part, local)
        ) {
          seconds += mp3FrameSeconds(part, local);
          local += length;
        }
        // The next frame's header is past this part: read on from it.
        if (local + 4 > part.length) {
          next = at + local;
          continue;
        }
        framed = false;
      }
      const found = mp3Resumes(part, local, toTheEnd);
      if (found.kind === "frame") {
        local = found.at;
        framed = true;
      } else if (found.kind === "tag") {
        // The tag stepped over (it may run past this part).
        if (found.end + 4 > part.length) next = at + found.end;
        else local = found.end;
      } else if (toTheEnd) {
        return seconds;
      } else {
        // None in this part: read on from where the search stopped.
        next = at + found.searched;
      }
    }
    at = next;
  }
  return seconds;
}

/**
 * Its sound's bytes over the rate they play at, worked out from its format
 * (rate, channels and bytes a sample) rather than the byte rate its header
 * states. Every data chunk counts, as a decoder may play on into a later one;
 * one whose length isn't known runs to the end of the file, and so does what
 * lies past the chunks walked.
 */
async function wavSeconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  let offset = 12;
  let perSecond = 0;
  let sound: number | null = null;
  for (let part = 0; offset + 8 <= size; part += 1) {
    if (part === MAX_PARTS) {
      sound = (sound ?? 0) + (size - offset);
      break;
    }
    const header = await bytesAt(head, read, offset, 8);
    if (header.length < 8) break;
    const id = ascii(header, 0, 4);
    const length = u32le(header, 4);
    if (id === "fmt " && !perSecond) {
      // [code][channels][rate][byte rate][block align][bits a sample]
      const format = await bytesAt(head, read, offset + 8, 16);
      if (format.length < 16) return null;
      const channels = u16le(format, 2);
      const rate = u32le(format, 4);
      const bits = u16le(format, 14);
      if (![1, 3, 0xfffe].includes(u16le(format, 0)) || !channels || !rate || !bits) return null;
      perSecond = rate * channels * Math.ceil(bits / 8);
    } else if (id === "data") {
      if (!perSecond) return null;
      // A streamed WAV may not know its data's length: 0, or all ones.
      const known = length !== 0 && length !== 0xffffffff;
      const left = size - offset - 8;
      sound = (sound ?? 0) + (known ? Math.min(length, left) : left);
      if (!known) break;
    }
    offset += 8 + length + (length & 1);
  }
  return perSecond && sound !== null ? sound / perSecond : null;
}

/**
 * How long its sound plays: each sound track's samples, their durations
 * (stts) over its media's timescale (mdhd), or its edit list (elst) over the
 * movie's when that's longer (an edit list can play its media more than once);
 * the longest sound track counts. The duration the movie states (mvhd) isn't
 * relied on. Null when no sound track has samples listed in the movie (a
 * fragmented file's are in its fragments).
 */
async function mp4Seconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const parts = await mp4Parts(head, read, size);
  if (!parts) return null;
  const { movie } = parts;
  const moov = movieContent(movie);
  // mvhd and mdhd: [version, flags][created][modified][timescale]…, times 64-bit in version 1.
  const timescale = (box: Box | null) =>
    box && box.start + 24 <= box.end
      ? u32be(movie, box.start + (movie[box.start] === 1 ? 20 : 12))
      : 0;
  const movieScale = timescale(boxIn(movie, moov, "mvhd"));
  let longest: number | null = null;
  for (const trak of boxesIn(movie, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = boxIn(movie, trak, "mdia");
    const hdlr = boxIn(movie, mdia, "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || ascii(movie, hdlr.start + 8, 4) !== "soun") continue;
    const mediaScale = timescale(boxIn(movie, mdia, "mdhd"));
    const stbl = boxIn(movie, boxIn(movie, mdia, "minf"), "stbl");
    // stts: [version, flags][entry count], then runs of [sample count][each one's duration].
    const stts = boxIn(movie, stbl, "stts");
    if (!mediaScale || !stts || stts.start + 8 > stts.end) continue;
    const runs = u32be(movie, stts.start + 4);
    if (stts.start + 8 + runs * 8 > stts.end) continue;
    let ticks = 0;
    let counted = 0;
    let each = 0;
    for (let run = 0; run < runs; run += 1) {
      const count = u32be(movie, stts.start + 8 + run * 8);
      each = u32be(movie, stts.start + 12 + run * 8);
      ticks += count * each;
      counted += count;
    }
    // Samples listed (stsz: [version, flags][one size for all][count]) past
    // those the durations cover play as long as the last of them.
    const stsz = boxIn(movie, stbl, "stsz");
    const samples = stsz && stsz.start + 12 <= stsz.end ? u32be(movie, stsz.start + 8) : 0;
    if (samples > counted) {
      if (!each) return null;
      ticks += (samples - counted) * each;
    }
    if (!counted && !samples) continue;
    let seconds = ticks / mediaScale;
    // elst: [version, flags][entry count], then entries of [segment duration]
    // [media time] (32 bits each, or 64 in version 1) and a rate (32 bits).
    const elst = boxIn(movie, boxIn(movie, trak, "edts"), "elst");
    if (elst && movieScale && elst.start + 8 <= elst.end) {
      const wide = movie[elst.start] === 1;
      const step = wide ? 20 : 12;
      const edits = u32be(movie, elst.start + 4);
      if (elst.start + 8 + edits * step <= elst.end) {
        let edited = 0;
        for (let edit = 0; edit < edits; edit += 1) {
          const at = elst.start + 8 + edit * step;
          edited += wide ? u32be(movie, at) * 0x100000000 + u32be(movie, at + 4) : u32be(movie, at);
        }
        seconds = Math.max(seconds, edited / movieScale);
      }
    }
    longest = Math.max(longest ?? 0, seconds);
  }
  return longest;
}

/** Where the next Ogg page's capture pattern ("OggS") is at or after `from`, or near the end if none. */
function nextOggPage(bytes: Uint8Array, from: number): number {
  for (let at = bytes.indexOf(0x4f, from); at !== -1; at = bytes.indexOf(0x4f, at + 1))
    if (at + 4 <= bytes.length && ascii(bytes, at, 4) === "OggS") return at;
  return Math.max(from, bytes.length - 3);
}

/** A sound stream of an Ogg file: its rate, channels, the samples it skips at the start, its group, and how far it reaches. */
type OggStream = { rate: number; channels: number; skip: number; group: number; reached: number };

/**
 * Every sound stream (Vorbis, Opus or FLAC) an Ogg file opens, with the
 * furthest position its pages reach. Streams opened together form a group (and
 * play together); a chained file, one group after another (say a recorded
 * broadcast), has several. Every page is walked, in parts; where something
 * other than a page comes between them (damage), on from the next one.
 */
async function oggSoundStreams(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<OggStream[]> {
  const streams: OggStream[] = [];
  const bySerial = new Map<number, OggStream>();
  let groups = 0;
  let opening = false;
  let at = 0;
  while (at + 27 <= size) {
    const part = await bytesAt(head, read, at, Math.min(COUNT_BYTES, size - at));
    let local = 0;
    while (local + 27 <= part.length) {
      if (part[local] !== 0x4f || ascii(part, local, 4) !== "OggS" || part[local + 4] !== 0) {
        local = nextOggPage(part, local + 1);
        continue;
      }
      // [OggS][version][flags][position: 64][serial][page number][checksum][segments][their lengths]
      const opens = ((part[local + 5] ?? 0) & 0x02) !== 0;
      const data = local + 27 + (part[local + 26] ?? 0);
      // Its lengths, and an opening page's first packet, read with it.
      if (data + (opens ? 40 : 0) > part.length) break;
      let body = 0;
      for (const length of part.subarray(local + 27, data)) body += length;
      const serial = u32le(part, local + 14);
      if (opens) {
        if (!opening) groups += 1;
        const id = ascii(part, data, 8);
        let rate = 0;
        let channels = 0;
        let skip = 0;
        if (id.startsWith("\u0001vorbis")) {
          channels = part[data + 11] ?? 0;
          rate = u32le(part, data + 12);
        } else if (id === "OpusHead") {
          // Opus decodes at 48 kHz, after the samples it skips at the start.
          channels = part[data + 9] ?? 0;
          rate = 48_000;
          skip = u16le(part, data + 10);
        } else if (id.startsWith("\u007fFLAC")) {
          // [7F]FLAC[major][minor][header count: 2], fLaC, a block header, then STREAMINFO.
          const info = data + 17;
          rate =
            ((part[info + 10] ?? 0) << 12) |
            ((part[info + 11] ?? 0) << 4) |
            ((part[info + 12] ?? 0) >> 4);
          channels = (((part[info + 12] ?? 0) >> 1) & 0x07) + 1;
        }
        if (rate) {
          const stream = { rate, channels, skip, group: groups, reached: 0 };
          streams.push(stream);
          bySerial.set(serial, stream);
        } else bySerial.delete(serial);
      } else {
        // Its position: -1 when no packet ends on the page.
        const stream = bySerial.get(serial);
        const high = u32le(part, local + 10);
        if (stream && high < 0x80000000)
          stream.reached = Math.max(stream.reached, high * 0x100000000 + u32le(part, local + 6));
      }
      opening = opens;
      local = data + body;
    }
    // Nothing more can be read: the file ends partway through a page.
    if (local === 0) break;
    at += local;
  }
  return streams;
}

/**
 * How long its sound plays: in each sound stream, the furthest position its
 * pages reach over its rate (less the samples Opus skips at the start). The
 * streams of a group play together, so the longest of them counts; the groups
 * of a chained file are added.
 */
async function oggSeconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const streams = await oggSoundStreams(head, read, size);
  if (!streams.length) return null;
  const longest = new Map<number, number>();
  for (const { rate, skip, group, reached } of streams)
    longest.set(group, Math.max(longest.get(group) ?? 0, Math.max(0, reached - skip) / rate));
  let seconds = 0;
  for (const each of longest.values()) seconds += each;
  return seconds;
}

/** How far the stream has reached, in samples, at the end of the FLAC frame whose (valid) header starts here. */
function flacFrameEnd(bytes: Uint8Array, at: number, fixedBlock: number): number {
  // Numbered by its first sample (blocks of any size) or by itself (blocks of the stream's one size).
  const bySample = ((bytes[at + 1] ?? 0) & 0x01) !== 0;
  const blockBits = (bytes[at + 2] ?? 0) >> 4;
  // The number, coded like UTF-8 in 1 to 7 bytes.
  const lead = bytes[at + 4] ?? 0;
  let more = 0;
  while (more < 7 && lead & (0x80 >> more)) more += 1;
  let number = lead & (0x7f >> more);
  for (let next = 1; next < more; next += 1)
    number = number * 64 + ((bytes[at + 4 + next] ?? 0) & 0x3f);
  // Its block's size: coded in the header, or given after the number.
  const after = at + 4 + Math.max(1, more);
  const block =
    blockBits === 1
      ? 192
      : blockBits <= 5
        ? 576 * 2 ** (blockBits - 2)
        : blockBits === 6
          ? (bytes[after] ?? 0) + 1
          : blockBits === 7
            ? (((bytes[after] ?? 0) << 8) | (bytes[after + 1] ?? 0)) + 1
            : 256 * 2 ** (blockBits - 8);
  return bySample ? number + block : number * fixedBlock + block;
}

/**
 * Its sample count over its rate (STREAMINFO), or where its last frame ends
 * when that's further: the count can be missing (0, as from an encoder writing
 * to a stream) or short of the frames that follow. The last frame is the one
 * nearest the end that is whole, its checksums right, up to the end or the
 * frame after it.
 */
async function flacSeconds(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<number | null> {
  // "fLaC", a block header, then STREAMINFO: [smallest block: 16][largest block: 16]
  // [smallest frame: 24][largest frame: 24][rate: 20][channels: 3][bits: 5][samples: 36]…
  const info = 8;
  if (head.length < info + 18) return null;
  const fixedBlock = ((head[info] ?? 0) << 8) | (head[info + 1] ?? 0);
  const largestFrame =
    ((head[info + 7] ?? 0) << 16) | ((head[info + 8] ?? 0) << 8) | (head[info + 9] ?? 0);
  const rate =
    ((head[info + 10] ?? 0) << 12) | ((head[info + 11] ?? 0) << 4) | ((head[info + 12] ?? 0) >> 4);
  if (!rate) return null;
  const stated = ((head[info + 13] ?? 0) & 0x0f) * 0x100000000 + u32be(head, info + 14);
  // The last frame, and the one before it should something follow the last.
  const span = Math.min(size - 4, largestFrame ? 2 * largestFrame + 64 * 1024 : MAX_FLAC_FRAME);
  const tail = await bytesAt(head, read, size - span, span);
  let reached = 0;
  // (Only so many frame headers are checked whole, however the end is laid out.)
  for (let at = tail.length - 8, checked = 0; at >= 0 && checked < MAX_FLAC_CHECKS; at -= 1) {
    if (tail[at] !== 0xff || flacFrameHeader(tail, at) === null) continue;
    checked += 1;
    if (!wholeFlacFrame(tail.subarray(at), true)) continue;
    reached = flacFrameEnd(tail, at, fixedBlock);
    break;
  }
  const samples = Math.max(stated, reached);
  return samples ? samples / rate : null;
}

/* ---------------------------------------------------------------- Layout */

/** How many channels a recording decodes to, and at what rate. */
export type AudioLayout = { channels: number; rate: number };

/**
 * How many channels a recording decodes to and at what rate, from its
 * structure (the most of any of its sound streams or tracks), so what it takes
 * to decode it is known before it's done. Null when it's none of the kinds
 * read here, or doesn't say.
 */
export async function probeLayout(read: ReadRange, size: number): Promise<AudioLayout | null> {
  if (!Number.isFinite(size) || size < 64) return null;
  const head = await read(0, Math.min(size, HEAD_BYTES));
  if (head.length < 64) return null;
  switch (claimedKind(head)) {
    case "mp3":
      // MPEG audio holds at most two channels, at most at 48 kHz.
      return (await firstMp3Frame(head, read, size)) === null
        ? null
        : { channels: 2, rate: 48_000 };
    case "wav":
      return wavLayout(head, read, size);
    case "m4a":
      return mp4Layout(head, read, size);
    case "ogg": {
      const streams = await oggSoundStreams(head, read, size);
      const channels = Math.max(0, ...streams.map((stream) => stream.channels));
      const rate = Math.max(0, ...streams.map((stream) => stream.rate));
      return channels && rate ? { channels, rate } : null;
    }
    case "flac":
      return flacLayout(head, 8);
    default:
      return null;
  }
}

/** A WAV's channels and rate, from its format. */
async function wavLayout(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<AudioLayout | null> {
  let offset = 12;
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, 8);
    if (header.length < 8) return null;
    const length = u32le(header, 4);
    if (ascii(header, 0, 4) === "fmt ") {
      // [code][channels][rate]…
      const format = await bytesAt(head, read, offset + 8, 8);
      const channels = u16le(format, 2);
      const rate = u32le(format, 4);
      return format.length === 8 && channels && rate ? { channels, rate } : null;
    }
    offset += 8 + length + (length & 1);
  }
  return null;
}

/** FLAC's channels and rate, from the STREAMINFO at `info`. */
function flacLayout(bytes: Uint8Array, info: number): AudioLayout | null {
  // STREAMINFO: [block sizes: 4][frame sizes: 6][rate: 20 bits][channels - 1: 3 bits]…
  if (info + 13 > bytes.length) return null;
  const rate =
    ((bytes[info + 10] ?? 0) << 12) |
    ((bytes[info + 11] ?? 0) << 4) |
    ((bytes[info + 12] ?? 0) >> 4);
  const channels = (((bytes[info + 12] ?? 0) >> 1) & 0x07) + 1;
  return rate ? { channels, rate } : null;
}

/** AAC's channel configurations (in its AudioSpecificConfig) and the channels each decodes to. */
const AAC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 8, 0, 0, 0, 7, 8, 24, 8, 0];

/**
 * What an MP4 audio entry's esds box says of its stream: the object type of its
 * decoder configuration (0x40 for MPEG-4 audio such as AAC, 0x67 for MPEG-2
 * AAC LC, 0x69 and 0x6B for MPEG audio such as MP3) and, for MPEG-4 audio, its
 * AudioSpecificConfig's object type (2 for AAC LC; 5 and 29 for HE-AAC, over a
 * core whose type follows) and the channels it decodes to. Null when it holds
 * no decoder configuration.
 */
function esdsConfig(
  movie: Uint8Array,
  esds: Box,
): { objectType: number; audioType: number; coreType: number; channels: number } | null {
  // [version, flags], then descriptors, each [tag][length: 1-4 bytes of 7 bits][content].
  let at = esds.start + 4;
  const open = (tag: number) => {
    if (at >= esds.end || movie[at] !== tag) return false;
    at += 1;
    for (let index = 0; index < 4 && at < esds.end; index += 1)
      if (!((movie[at++] ?? 0) & 0x80)) break;
    return true;
  };
  // ES_Descriptor: [ES_ID: 2][flags], then what its flags say follows.
  if (!open(0x03)) return null;
  const flags = movie[at + 2] ?? 0;
  at += 3;
  if (flags & 0x80) at += 2;
  if (flags & 0x40) at += 1 + (movie[at] ?? 0);
  if (flags & 0x20) at += 2;
  // DecoderConfigDescriptor: [object type][stream type][buffer size: 3][top rate: 4][average rate: 4].
  if (!open(0x04) || at + 13 > esds.end) return null;
  const objectType = movie[at] ?? 0;
  at += 13;
  if (objectType !== 0x40) return { objectType, audioType: 0, coreType: 0, channels: 0 };
  // AudioSpecificConfig: [object type: 5 bits (31: 6 more)][rate: 4 bits (15: 24 more)][channels:
  // 4 bits], and for HE-AAC [its rate: 4 bits (15: 24 more)][the core's object type].
  if (!open(0x05) || at + 2 > esds.end) return null;
  let bit = at * 8;
  const take = (count: number) => {
    let value = 0;
    for (let index = 0; index < count; index += 1, bit += 1)
      value = value * 2 + (((movie[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1);
    return value;
  };
  const audioObjectType = () => {
    const type = take(5);
    return type === 31 ? 32 + take(6) : type;
  };
  const rate = () => {
    if (take(4) === 15) take(24);
  };
  const audioType = audioObjectType();
  rate();
  const channels = AAC_CHANNELS[take(4)] ?? 0;
  let coreType = audioType;
  if (audioType === 5 || audioType === 29) {
    rate();
    coreType = audioObjectType();
  }
  return { objectType, audioType, coreType, channels };
}

/**
 * An MP4/M4A's channels and rate, the most of any of its sound tracks: each
 * one's sample description, what its codec's own configuration says (AAC's
 * esds, Opus's dOps, FLAC's dfLa), and its media's timescale.
 */
async function mp4Layout(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<AudioLayout | null> {
  const parts = await mp4Parts(head, read, size);
  if (!parts) return null;
  const { movie } = parts;
  const moov = movieContent(movie);
  let channels = 0;
  let rate = 0;
  for (const trak of boxesIn(movie, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = boxIn(movie, trak, "mdia");
    const hdlr = boxIn(movie, mdia, "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || ascii(movie, hdlr.start + 8, 4) !== "soun") continue;
    // stsd: [version, flags][entry count], then entries, each holding [reserved: 6][reference: 2]
    // [version: 2][revision: 2][vendor: 4][channels: 2][sample size: 2][compression: 2]
    // [packet size: 2][rate: 16.16], more in versions 1 and 2, then its own boxes. The most of
    // any entry counts (its chunks may use any of them).
    const stsd = boxIn(movie, boxIn(movie, boxIn(movie, mdia, "minf"), "stbl"), "stsd");
    if (!stsd || stsd.start + 8 > stsd.end) continue;
    let trackChannels = 0;
    let trackRate = 0;
    for (const entry of boxesIn(movie, stsd.start + 8, stsd.end).slice(
      0,
      u32be(movie, stsd.start + 4),
    )) {
      if (entry.start + 28 > entry.end) continue;
      const version = u16be(movie, entry.start + 8);
      if (version < 2) {
        trackChannels = Math.max(trackChannels, u16be(movie, entry.start + 16));
        trackRate = Math.max(trackRate, Math.floor(u32be(movie, entry.start + 24) / 65536));
      }
      const inner = entry.start + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0);
      for (const box of boxesIn(movie, inner, entry.end)) {
        if (box.type === "esds")
          trackChannels = Math.max(trackChannels, esdsConfig(movie, box)?.channels ?? 0);
        else if (box.type === "dOps" && box.start + 2 <= box.end) {
          // [version][output channels][pre-skip: 2][input rate: 4]…; Opus decodes at 48 kHz.
          trackChannels = Math.max(trackChannels, movie[box.start + 1] ?? 0);
          trackRate = Math.max(trackRate, 48_000);
        } else if (box.type === "dfLa") {
          // [version, flags], then FLAC's metadata blocks, STREAMINFO first.
          const flac = flacLayout(movie.subarray(0, box.end), box.start + 8);
          trackChannels = Math.max(trackChannels, flac?.channels ?? 0);
          trackRate = Math.max(trackRate, flac?.rate ?? 0);
        }
      }
    }
    // mdhd: [version, flags][created][modified][timescale]…, times 64-bit in version 1.
    const mdhd = boxIn(movie, mdia, "mdhd");
    if (mdhd && mdhd.start + 24 <= mdhd.end)
      trackRate = Math.max(
        trackRate,
        u32be(movie, mdhd.start + (movie[mdhd.start] === 1 ? 20 : 12)),
      );
    channels = Math.max(channels, trackChannels);
    rate = Math.max(rate, trackRate);
  }
  return channels && rate ? { channels, rate } : null;
}
