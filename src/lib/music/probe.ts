/**
 * Whether a recording holds audio that browsers and the renderer can decode,
 * read from its structure rather than its name or its first bytes: MP3 frames
 * that follow one another, a WAV's format and its data, an MP4/M4A whose sound
 * track (AAC, MP3, Opus or FLAC) has its samples in the file, an Ogg stream of
 * Vorbis, Opus or FLAC with sound after its headers, or FLAC with its stream
 * description and a whole first frame (its checksums right). Only small parts
 * of the file are read (`read`), and only a few times, so a large file is
 * never fetched whole to check it.
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
  for (let first = 0; first < Math.min(window.length - 4, 4096); first += 1) {
    let at = first;
    let frames = 0;
    for (let length = mp3FrameAt(window, at); length !== null; length = mp3FrameAt(window, at)) {
      frames += 1;
      at += length;
      if (frames >= 3) return start + first;
    }
  }
  return null;
}

/** How long the MPEG Layer III frame whose (valid) header starts here plays, in seconds. */
function mp3FrameSeconds(bytes: Uint8Array, at: number): number {
  const version = ((bytes[at + 1] ?? 0) >> 3) & 0x03;
  const rate = SAMPLE_RATES[version]![((bytes[at + 2] ?? 0) >> 2) & 0x03]!;
  return (version === 3 ? 1152 : 576) / rate;
}

/* ---------------------------------------------------------------- WAV */

/** A WAV whose format browsers decode (PCM or float), followed by data that is really there. */
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
      const code = u16le(format, 0);
      const channels = u16le(format, 2);
      const rate = u32le(format, 4);
      const bits = u16le(format, 14);
      formatOk =
        [1, 3, 0xfffe].includes(code) &&
        channels >= 1 &&
        channels <= 32 &&
        rate >= 8000 &&
        rate <= 384_000 &&
        [8, 16, 24, 32, 64].includes(bits);
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

/**
 * Where the samples of the movie's sound track end in the file, or null when
 * it has no sound track the studio can use: one in a codec browsers and the
 * renderer decode, with its samples listed in the movie. (A fragmented file
 * lists none there: its samples are in fragments the studio doesn't check, so
 * it isn't taken.)
 */
function soundTrackEnd(movie: Uint8Array): number | null {
  const moov = movieContent(movie);
  for (const trak of boxesIn(movie, moov.start, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = boxIn(movie, trak, "mdia");
    // hdlr: [version, flags][pre-defined][handler type].
    const hdlr = boxIn(movie, mdia, "hdlr");
    if (!hdlr || hdlr.start + 12 > hdlr.end || ascii(movie, hdlr.start + 8, 4) !== "soun") continue;
    const stbl = boxIn(movie, boxIn(movie, mdia, "minf"), "stbl");
    // stsd: [version, flags][entry count], then the first entry: [size][codec]…
    const stsd = boxIn(movie, stbl, "stsd");
    if (!stsd || stsd.start + 16 > stsd.end || u32be(movie, stsd.start + 4) < 1) continue;
    if (!MP4_SOUND.has(ascii(movie, stsd.start + 12, 4))) continue;
    // stsz: [version, flags][one size for every sample, or 0][sample count][sizes…]
    const stsz = boxIn(movie, stbl, "stsz");
    if (!stsz || stsz.start + 12 > stsz.end) continue;
    const everySample = u32be(movie, stsz.start + 4);
    const samples = u32be(movie, stsz.start + 8);
    if (samples === 0) continue;
    if (!everySample && stsz.start + 12 + samples * 4 > stsz.end) continue;
    const sampleSize = (index: number) => everySample || u32be(movie, stsz.start + 12 + index * 4);
    // stco / co64: where each chunk of samples is in the file (32 or 64 bits).
    const stco = boxIn(movie, stbl, "stco");
    const offsets = stco ?? boxIn(movie, stbl, "co64");
    if (!offsets || offsets.start + 8 > offsets.end) continue;
    const step = stco ? 4 : 8;
    const chunks = u32be(movie, offsets.start + 4);
    if (chunks === 0 || offsets.start + 8 + chunks * step > offsets.end) continue;
    const chunkAt = (index: number) => {
      const at = offsets.start + 8 + index * step;
      return stco ? u32be(movie, at) : u32be(movie, at) * 0x100000000 + u32be(movie, at + 4);
    };
    // stsc: runs of [first chunk][samples per chunk][description]; the last
    // chunk holds as many as the last run starting at or before it says.
    const stsc = boxIn(movie, stbl, "stsc");
    if (!stsc || stsc.start + 8 > stsc.end) continue;
    const runs = u32be(movie, stsc.start + 4);
    if (runs === 0 || stsc.start + 8 + runs * 12 > stsc.end) continue;
    let perChunk = 0;
    for (let run = 0; run < runs; run += 1)
      if (u32be(movie, stsc.start + 8 + run * 12) <= chunks)
        perChunk = u32be(movie, stsc.start + 12 + run * 12);
    const inLast = Math.min(perChunk, samples);
    if (inLast < 1) continue;
    // (With one size for every sample, worked out rather than counted: the
    // counts come from the file.)
    let end = chunkAt(chunks - 1);
    if (everySample) end += inLast * everySample;
    else for (let index = samples - inLast; index < samples; index += 1) end += sampleSize(index);
    return Math.max(end, chunkAt(0) + sampleSize(0));
  }
  return null;
}

/**
 * An MP4's movie box (moov, read whole) and whether it has media data, from
 * its top-level boxes; null when they don't add up or there is no movie.
 */
async function mp4Parts(
  head: Uint8Array,
  read: ReadRange,
  size: number,
): Promise<{ movie: Uint8Array; media: boolean } | null> {
  let offset = 0;
  let movie: Uint8Array | null = null;
  let media = false;
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, Math.min(16, size - offset));
    if (header.length < 8) return null;
    let length = u32be(header, 0);
    const type = ascii(header, 4, 4);
    let headerLength = 8;
    if (length === 1) {
      if (header.length < 16) return null;
      length = u32be(header, 8) * 0x100000000 + u32be(header, 12);
      headerLength = 16;
    } else if (length === 0) {
      length = size - offset;
    }
    if (length < headerLength || offset + length > size) return null;
    if (type === "moov") {
      if (length > MAX_MOOV_BYTES) return null;
      movie = await bytesAt(head, read, offset, length);
      if (movie.length < length) return null;
    } else if (type === "mdat" && length > headerLength) {
      media = true;
    }
    if (movie && media) break;
    offset += length;
  }
  return movie ? { movie, media } : null;
}

/**
 * An MP4 or M4A with a sound track the studio can use (not, say, picture only,
 * an empty track, a fragmented file, or a codec browsers can't play such as
 * Apple Lossless), and all of its samples in the file (a file cut off has them
 * run past its end).
 */
async function isMp4Audio(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  const parts = await mp4Parts(head, read, size);
  if (!parts?.media) return false;
  const end = soundTrackEnd(parts.movie);
  return end !== null && end <= size;
}

/* ---------------------------------------------------------------- Ogg */

/**
 * One Ogg page: its stream, whether it opens the stream, whether sound ends
 * on it, where its packet data starts and where the next page starts.
 */
async function oggPage(
  head: Uint8Array,
  read: ReadRange,
  offset: number,
  size: number,
): Promise<{
  serial: number;
  opens: boolean;
  endsSound: boolean;
  data: number;
  next: number;
} | null> {
  if (offset + 27 > size) return null;
  // The page's header and its segment table, read together.
  const header = await bytesAt(head, read, offset, Math.min(27 + 255, size - offset));
  if (header.length < 27 || ascii(header, 0, 4) !== "OggS" || header[4] !== 0) return null;
  const segments = header[26] ?? 0;
  if (header.length < 27 + segments) return null;
  let body = 0;
  for (const length of header.subarray(27, 27 + segments)) body += length;
  // Its granule position (64 bits): 0 on header pages, -1 when no packet ends
  // on the page, and past 0 once sound has been decoded.
  const low = u32le(header, 6);
  const high = u32le(header, 10);
  const data = offset + 27 + segments;
  return {
    serial: u32le(header, 14),
    opens: ((header[5] ?? 0) & 0x02) !== 0,
    endsSound: high < 0x80000000 && (high > 0 || low > 0),
    data,
    next: data + body,
  };
}

/**
 * An Ogg file that opens a Vorbis, Opus or FLAC stream (a video-only one, say
 * Theora, has none) and has a page of that stream on which sound ends. Its
 * header pages don't count, so a file cut off after its headers has none.
 */
async function isOggAudio(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  const sound = new Set<number>();
  let offset = 0;
  for (let part = 0; part < MAX_OGG_PAGES; part += 1) {
    const page = await oggPage(head, read, offset, size);
    if (!page || page.next > size) return false;
    if (page.opens) {
      // Each stream opens (before any data) with a page that says what it holds.
      const packet = await bytesAt(head, read, page.data, 8);
      const id = ascii(packet, 0, 8);
      if (id.startsWith("\u0001vorbis") || id === "OpusHead" || id.startsWith("\u007fFLAC"))
        sound.add(page.serial);
    } else if (!sound.size) {
      // Every stream has opened and none of them is sound.
      return false;
    } else if (sound.has(page.serial) && page.endsSound) {
      return true;
    }
    offset = page.next;
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

/** How much of an MP3 is read at a time to count its frames. */
const COUNT_BYTES = 1024 * 1024;
/** An Ogg page is at most this long, so the last one starts within it of the end. */
const OGG_TAIL_BYTES = 27 + 255 + 255 * 255;

/**
 * How long a recording plays, in seconds, from its own structure rather than
 * anything on record about it: an MP3's frames counted, a WAV's data over its
 * byte rate, an MP4/M4A's movie duration, an Ogg stream's last position over
 * its rate (Vorbis, Opus or FLAC), or FLAC's sample count. Null when it's none
 * of these, or doesn't say.
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
      return flacSeconds(head);
    default:
      return null;
  }
}

/** Every frame from the first, counted until the frames stop (a tag or the end). */
async function mp3Seconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const first = await firstMp3Frame(head, read, size);
  if (first === null) return null;
  let seconds = 0;
  let at = first;
  while (at + 4 <= size) {
    const chunk = await bytesAt(head, read, at, Math.min(COUNT_BYTES, size - at));
    let local = 0;
    for (
      let length = mp3FrameAt(chunk, local);
      length !== null;
      length = mp3FrameAt(chunk, local)
    ) {
      seconds += mp3FrameSeconds(chunk, local);
      local += length;
    }
    // Nothing more where a frame should start: the frames have stopped.
    if (local === 0) break;
    at += local;
  }
  return seconds;
}

/** Its data's size over the byte rate its format gives (to the end, if it doesn't say). */
async function wavSeconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  let offset = 12;
  let byteRate = 0;
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, 8);
    if (header.length < 8) return null;
    const length = u32le(header, 4);
    if (ascii(header, 0, 4) === "fmt ") {
      const format = await bytesAt(head, read, offset + 8, 16);
      if (format.length < 16) return null;
      byteRate = u32le(format, 8);
    } else if (ascii(header, 0, 4) === "data") {
      return byteRate ? Math.min(length, size - offset - 8) / byteRate : null;
    }
    offset += 8 + length + (length & 1);
  }
  return null;
}

/** The movie's duration over its timescale (mvhd). */
async function mp4Seconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const parts = await mp4Parts(head, read, size);
  if (!parts) return null;
  const mvhd = boxIn(parts.movie, movieContent(parts.movie), "mvhd");
  if (!mvhd || mvhd.start + 32 > mvhd.end) return null;
  // [version, flags][created][modified][timescale][duration], times 64-bit in version 1.
  const wide = parts.movie[mvhd.start] === 1;
  const timescale = u32be(parts.movie, mvhd.start + (wide ? 20 : 12));
  const duration = wide
    ? u32be(parts.movie, mvhd.start + 24) * 0x100000000 + u32be(parts.movie, mvhd.start + 28)
    : u32be(parts.movie, mvhd.start + 16);
  return timescale && duration ? duration / timescale : null;
}

/** The last position its pages reach, over the rate its opening page gives. */
async function oggSeconds(head: Uint8Array, read: ReadRange, size: number): Promise<number | null> {
  const first = await oggPage(head, read, 0, size);
  if (!first?.opens) return null;
  const packet = await bytesAt(head, read, first.data, 40);
  const id = ascii(packet, 0, 8);
  let rate = 0;
  let skip = 0;
  if (id.startsWith("\u0001vorbis")) rate = u32le(packet, 12);
  else if (id === "OpusHead") {
    // Opus counts at 48 kHz, after the samples it skips at the start.
    rate = 48_000;
    skip = u16le(packet, 10);
  } else if (id.startsWith("\u007fFLAC")) {
    // [7F]FLAC[major][minor][header count: 2], fLaC, a block header, then STREAMINFO.
    rate = ((packet[27] ?? 0) << 12) | ((packet[28] ?? 0) << 4) | ((packet[29] ?? 0) >> 4);
  }
  if (!rate) return null;
  const start = Math.max(0, size - OGG_TAIL_BYTES);
  const tail = await bytesAt(head, read, start, size - start);
  for (let at = tail.length - 27; at >= 0; at -= 1) {
    if (tail[at] !== 0x4f || ascii(tail, at, 4) !== "OggS" || tail[at + 4] !== 0) continue;
    const low = u32le(tail, at + 6);
    const high = u32le(tail, at + 10);
    // A page with no packet ending on it says -1: the one before it counts.
    if (high < 0x80000000 && (high > 0 || low > 0))
      return Math.max(0, high * 0x100000000 + low - skip) / rate;
  }
  return null;
}

/** STREAMINFO's sample count over its sample rate. */
function flacSeconds(head: Uint8Array): number | null {
  // "fLaC", a block header, then STREAMINFO: [sizes: 10][rate: 20 bits]
  // [channels: 3][bits: 5][samples: 36]…
  const info = 8;
  if (head.length < info + 18) return null;
  const rate =
    ((head[info + 10] ?? 0) << 12) | ((head[info + 11] ?? 0) << 4) | ((head[info + 12] ?? 0) >> 4);
  const samples = ((head[info + 13] ?? 0) & 0x0f) * 0x100000000 + u32be(head, info + 14);
  return rate && samples ? samples / rate : null;
}
