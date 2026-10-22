import { readFile } from "node:fs/promises";

/**
 * How a render's sound sits (feature mix_report): the voice's margin over the
 * music in the speech band, section by section, and the measured loudness of
 * the finished mix. Reel 1 measured its balance by hand: the voice stood 10 to
 * 19 dB over the music in every section of the speech band. Each music item's
 * span is a section, since an item is where the music changes how it sits
 * under the voice (Reel 1's intro, groove, breakdown and re-entry).
 *
 * The voice and music buses are taken off in the mix pass, filtered to the
 * band and written at a low rate (see busTaps in ./sequence.js); this reads
 * them and compares their power where the voice speaks.
 */

/** The speech band, in Hz: where a voice's words are understood. */
export const SPEECH_BAND = [300, 4000];
/** The rate the band is measured at: well above twice its top. */
export const BAND_RATE = 16000;

/** The filters that keep a bus's speech band: two passes each side, so the bass of a music bed doesn't leak in. */
export function bandFilter() {
  const [low, high] = SPEECH_BAND;
  return `highpass=f=${low},highpass=f=${low},lowpass=f=${high},lowpass=f=${high},aresample=${BAND_RATE},aformat=sample_fmts=s16:channel_layouts=stereo`;
}

const round1 = (value) => Number(value.toFixed(1));
/** A mean power (of samples on ±1) in dB, or null for silence. */
const decibels = (power) => (power > 1e-12 ? round1(10 * Math.log10(power)) : null);

/**
 * The voice's margin over the music where the voice speaks, in each section.
 * `voice` and `music` are interleaved 16-bit samples at `rate` with `channels`
 * channels, on the edit's clock; `speech` the [from, to] seconds the voice
 * speaks; `sections` each music item's {index, from, to}. Pure.
 */
export function bandMargins({ voice, music, rate, channels, speech, sections }) {
  const frames = Math.min(voice.length, music.length) / channels;
  const scale = 1 / (32768 * 32768);
  return sections.map((section) => {
    let voicePower = 0;
    let musicPower = 0;
    let counted = 0;
    let spoken = 0;
    for (const [from, to] of speech) {
      const start = Math.max(from, section.from);
      const end = Math.min(to, section.to);
      if (end <= start) continue;
      spoken += end - start;
      const first = Math.max(0, Math.floor(start * rate));
      const last = Math.min(frames, Math.ceil(end * rate));
      for (let frame = first; frame < last; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
          const at = frame * channels + channel;
          voicePower += voice[at] * voice[at];
          musicPower += music[at] * music[at];
        }
        counted += channels;
      }
    }
    const voiceDb = counted ? decibels((voicePower * scale) / counted) : null;
    const musicDb = counted ? decibels((musicPower * scale) / counted) : null;
    return {
      index: section.index,
      from: Number(section.from.toFixed(3)),
      to: Number(section.to.toFixed(3)),
      speech_seconds: Number(spoken.toFixed(2)),
      voice_db: voiceDb,
      music_db: musicDb,
      margin_db: voiceDb !== null && musicDb !== null ? round1(voiceDb - musicDb) : null,
    };
  });
}

/** The interleaved samples of a 16-bit PCM WAV the worker wrote, with its rate and channels. */
export async function readBand(path) {
  const bytes = await readFile(path);
  let offset = 12;
  let format = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") format = { channels: bytes.readUInt16LE(body + 2), rate: bytes.readUInt32LE(body + 4) };
    if (id === "data" && format) {
      const end = Math.min(bytes.length, body + size);
      const samples = new Int16Array((end - body) >> 1);
      for (let index = 0; index < samples.length; index += 1) samples[index] = bytes.readInt16LE(body + index * 2);
      return { ...format, samples };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/**
 * The report, from the measured bands (either may be missing: then no
 * margins) and the finished mix's loudness (`master`, from loudnorm's
 * measurement; `mixed`, the mix's own before its loudness was evened out).
 */
export function mixReport({ margins, master, mixed }) {
  const known = margins.map((section) => section.margin_db).filter((value) => value !== null);
  return {
    band_hz: SPEECH_BAND,
    sections: margins,
    margin_db: known.length ? { min: Math.min(...known), max: Math.max(...known) } : null,
    loudness: master
      ? {
          integrated_lufs: round1(master.input_i),
          range_lu: round1(master.input_lra),
          true_peak_dbtp: round1(master.input_tp),
        }
      : null,
    mixed_lufs: mixed ? round1(mixed.input_i) : null,
  };
}
