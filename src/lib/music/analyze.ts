import { analyzeBeats, type BeatAnalysis } from "./beats";

const RATE = 22050;

/** How long an audio file plays, read by the browser; null if it can't tell (or takes too long). */
export function audioFileDuration(file: File, timeoutMs = 10_000): Promise<number | null> {
  if (typeof Audio === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(value);
    };
    // Some files never report either way; the upload mustn't wait on them.
    const timer = setTimeout(() => done(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Decodes an audio file in the browser and finds its tempo and beats (and its length). */
export async function analyzeAudioUrl(
  url: string,
): Promise<(BeatAnalysis & { duration: number }) | null> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The track couldn't be loaded for analysis");
  const encoded = await response.arrayBuffer();
  // An offline context decodes straight to the analysis rate, in mono.
  const context = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: RATE });
  const decoded = await context.decodeAudioData(encoded);
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index]! += data[index]! / decoded.numberOfChannels;
    }
  }
  const analysis = analyzeBeats(mono, decoded.sampleRate);
  return analysis ? { ...analysis, duration: decoded.duration } : null;
}
