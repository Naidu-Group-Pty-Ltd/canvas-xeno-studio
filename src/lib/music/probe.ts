/**
 * Whether a recording holds audio that browsers and the renderer can decode,
 * read from its structure rather than its name or its first bytes: MP3 frames
 * that follow one another, a WAV's format and its data, an MP4/M4A with a
 * sound track and media data, an Ogg stream of Vorbis, Opus or FLAC with
 * sound after its headers, or FLAC with its stream description and a whole
 * first frame. Only small parts of the file are read (`read`), and only a few
 * times, so a large file is never fetched whole to check it.
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
  let start = 0;
  if (ascii(head, 0, 3) === "ID3") {
    const tag =
      (((head[6] ?? 0) & 0x7f) << 21) |
      (((head[7] ?? 0) & 0x7f) << 14) |
      (((head[8] ?? 0) & 0x7f) << 7) |
      ((head[9] ?? 0) & 0x7f);
    start = 10 + tag + ((head[5] ?? 0) & 0x10 ? 10 : 0);
  }
  if (start + 4 > size) return false;
  const window = await bytesAt(head, read, start, Math.min(size - start, 16 * 1024));
  // Encoders may leave a little padding before the first frame.
  for (let first = 0; first < Math.min(window.length - 4, 4096); first += 1) {
    let at = first;
    let frames = 0;
    for (let length = mp3FrameAt(window, at); length !== null; length = mp3FrameAt(window, at)) {
      frames += 1;
      at += length;
      if (frames >= 3) return true;
    }
  }
  return false;
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

/** An MP4 or M4A with media data and a sound track (not, say, picture only). */
async function isMp4Audio(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  let offset = 0;
  let movie: Uint8Array | null = null;
  let media = false;
  for (let part = 0; part < MAX_PARTS && offset + 8 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, Math.min(16, size - offset));
    if (header.length < 8) return false;
    let length = u32be(header, 0);
    const type = ascii(header, 4, 4);
    let headerLength = 8;
    if (length === 1) {
      if (header.length < 16) return false;
      length = u32be(header, 8) * 0x100000000 + u32be(header, 12);
      headerLength = 16;
    } else if (length === 0) {
      length = size - offset;
    }
    if (length < headerLength || offset + length > size) return false;
    if (type === "moov") {
      if (length > MAX_MOOV_BYTES) return false;
      movie = await bytesAt(head, read, offset, length);
      if (movie.length < length) return false;
    } else if (type === "mdat" && length > headerLength) {
      media = true;
    }
    if (movie && media) break;
    offset += length;
  }
  if (!movie || !media) return false;
  // A track whose handler is sound: [size][hdlr][version, flags][pre-defined][handler type].
  for (let at = 4; at + 16 <= movie.length; at += 1) {
    if (
      movie[at] === 0x68 &&
      movie[at + 1] === 0x64 &&
      movie[at + 2] === 0x6c &&
      movie[at + 3] === 0x72 &&
      ascii(movie, at + 12, 4) === "soun"
    )
      return true;
  }
  return false;
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

/**
 * A FLAC stream: its stream description, then where the descriptions end, a
 * first frame with a valid header and at least as many bytes as the stream's
 * smallest frame.
 */
async function isFlac(head: Uint8Array, read: ReadRange, size: number): Promise<boolean> {
  let offset = 4;
  let first = true;
  let smallestFrame = 0;
  for (let part = 0; part < MAX_PARTS && offset + 4 <= size; part += 1) {
    const header = await bytesAt(head, read, offset, 4);
    if (header.length < 4) return false;
    const last = ((header[0] ?? 0) & 0x80) !== 0;
    const type = (header[0] ?? 0) & 0x7f;
    const length = ((header[1] ?? 0) << 16) | ((header[2] ?? 0) << 8) | (header[3] ?? 0);
    if (first) {
      // STREAMINFO: a sample rate and channels that make sense, and the size
      // of the smallest frame (0 when it isn't known).
      if (type !== 0 || length !== 34) return false;
      const info = await bytesAt(head, read, offset + 4, 18);
      if (info.length < 18) return false;
      smallestFrame = ((info[4] ?? 0) << 16) | ((info[5] ?? 0) << 8) | (info[6] ?? 0);
      const rate = ((info[10] ?? 0) << 12) | ((info[11] ?? 0) << 4) | ((info[12] ?? 0) >> 4);
      const channels = (((info[12] ?? 0) >> 1) & 0x07) + 1;
      if (rate < 1 || rate > 655_350 || channels > 8) return false;
      first = false;
    }
    offset += 4 + length;
    if (last) {
      // The first frame: its sync code, then a block size, sample rate,
      // channels and sample size that are allowed.
      if (offset + 4 > size) return false;
      const frame = await bytesAt(head, read, offset, 4);
      if (frame.length < 4) return false;
      const sizes = frame[2] ?? 0;
      const layout = frame[3] ?? 0;
      return (
        frame[0] === 0xff &&
        ((frame[1] ?? 0) & 0xfe) === 0xf8 &&
        sizes >> 4 !== 0 &&
        (sizes & 0x0f) !== 0x0f &&
        layout >> 4 <= 10 &&
        ((layout >> 1) & 0x07) !== 3 &&
        (layout & 0x01) === 0 &&
        offset + Math.max(smallestFrame, 16) <= size
      );
    }
  }
  return false;
}
