import { analyzeBeats, type BeatAnalysis } from "./beats";

const RATE = 22050;

/** Decodes an audio file in the browser and finds its tempo and beats. */
export async function analyzeAudioUrl(url: string): Promise<BeatAnalysis | null> {
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
  return analyzeBeats(mono, decoded.sampleRate);
}
