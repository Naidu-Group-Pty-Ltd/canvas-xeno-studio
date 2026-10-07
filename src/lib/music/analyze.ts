import { analyzeBeats, type BeatAnalysis } from "./beats";
import { probeDuration, probeLayout, type ReadRange } from "./probe";

const RATE = 22050;

/**
 * The longest music whose beats are found (the longest the studio makes):
 * finding them means decoding the whole recording in the browser, so a longer
 * one is refused rather than risk running the tab out of memory.
 */
export const MAX_ANALYSIS_SECONDS = 600;
/** The largest file read for its beats. */
const MAX_ANALYSIS_BYTES = 120 * 1024 * 1024;
/**
 * The most a recording may take to decode (32-bit samples, every channel, at
 * its own rate or the analysis rate if higher): ten minutes of stereo at
 * 48 kHz, but not of 5.1 or 7.1, whose channels a browser decodes in full
 * before they're mixed down.
 */
const MAX_DECODED_BYTES = 256 * 1024 * 1024;

/** How long the audio at a URL plays, from its metadata alone; null if the browser can't tell (or takes too long). */
function mediaDuration(src: string, timeoutMs: number): Promise<number | null> {
  if (typeof Audio === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute("src");
      resolve(value);
    };
    // Some files never report either way; nothing waits on them for long.
    const timer = setTimeout(() => done(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = src;
  });
}

/** How long an audio file plays, read by the browser; null if it can't tell (or takes too long). */
export async function audioFileDuration(file: File, timeoutMs = 10_000): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    return await mediaDuration(url, timeoutMs);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes an audio file in the browser and finds its tempo and beats (and its
 * length). Its length is checked first, from its metadata (or, failing that,
 * the length on record), so a recording too long to decode here is never
 * fetched; the file itself is read only up to a size limit, and decoded only
 * if its structure shows that decoding it stays within a memory limit.
 */
export async function analyzeAudioUrl(
  url: string,
  knownDuration: number | null = null,
): Promise<(BeatAnalysis & { duration: number }) | null> {
  const tooLong = () =>
    new Error(
      `This music is too long to find its beats here (over ${MAX_ANALYSIS_SECONDS / 60} minutes). Use a shorter edit of it.`,
    );
  const duration = (await mediaDuration(url, 15_000)) ?? knownDuration;
  if (duration === null)
    throw new Error("This music's length couldn't be read, so its beats can't be found here.");
  if (duration > MAX_ANALYSIS_SECONDS) throw tooLong();
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("The track couldn't be loaded for analysis");
  const tooLarge = () =>
    new Error(
      "This music's file is too large to find its beats here. Use a compressed copy (MP3).",
    );
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declared > MAX_ANALYSIS_BYTES) {
    await response.body.cancel().catch(() => {});
    throw tooLarge();
  }
  // Read into one buffer (sized up front when the length is known), never past the limit.
  let encoded = new Uint8Array(Number.isFinite(declared) && declared > 0 ? declared : 1 << 20);
  let filled = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    if (filled + value.length > MAX_ANALYSIS_BYTES) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    if (filled + value.length > encoded.length) {
      const grown = new Uint8Array(
        Math.min(MAX_ANALYSIS_BYTES, Math.max(encoded.length * 2, filled + value.length)),
      );
      grown.set(encoded.subarray(0, filled));
      encoded = grown;
    }
    encoded.set(value, filled);
    filled += value.length;
  }
  // What decoding it takes, from its structure, before it's decoded: its
  // length as a decoder plays it, its channels and its rate.
  const bytes = encoded.subarray(0, filled);
  const read: ReadRange = async (offset, length) =>
    bytes.subarray(offset, Math.min(filled, offset + length));
  const [seconds, layout] = await Promise.all([
    probeDuration(read, filled),
    probeLayout(read, filled),
  ]);
  if (seconds === null || layout === null)
    throw new Error(
      "This music's length and channels couldn't be read from its file, so its beats can't be found here. Use an MP3 or WAV copy of it.",
    );
  if (seconds > MAX_ANALYSIS_SECONDS + 1) throw tooLong();
  if (seconds * Math.max(layout.rate, RATE) * layout.channels * 4 > MAX_DECODED_BYTES)
    throw new Error(
      `This music has too many channels (${layout.channels}), or too high a rate, to find its beats here at its length. Use a stereo copy of it, or a shorter edit.`,
    );
  // An offline context decodes straight to the analysis rate.
  const context = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: RATE });
  const decoded = await context.decodeAudioData(
    filled === encoded.length
      ? (encoded.buffer as ArrayBuffer)
      : (encoded.buffer as ArrayBuffer).slice(0, filled),
  );
  if (decoded.duration > MAX_ANALYSIS_SECONDS + 1) throw tooLong();
  // Mixed down in place, into the first channel, rather than into another full-length copy.
  const mono = decoded.getChannelData(0);
  const channels = decoded.numberOfChannels;
  if (channels > 1) {
    for (let channel = 1; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) mono[index]! += data[index]!;
    }
    for (let index = 0; index < mono.length; index += 1) mono[index]! /= channels;
  }
  const analysis = analyzeBeats(mono, decoded.sampleRate);
  return analysis ? { ...analysis, duration: decoded.duration } : null;
}
