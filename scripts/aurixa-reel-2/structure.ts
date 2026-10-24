// A take's bars and sections, found from its audio by the Editor's own analysis (src/lib/music/structure.ts, the
// code behind the Music panel's "Find bars and sections"), so what is judged here is what the app would find.
//
//   bun scripts/aurixa-reel-2/structure.ts <take.wav>   (16-bit PCM; channels are averaged)
//
// Prints the tempo, every beat, the bars, the downbeats, the sections and the confidence as JSON.
import { readFileSync } from "node:fs";
import { analyzeStructure } from "../../src/lib/music/structure";

function readWav(path: string): { samples: Float32Array; sampleRate: number } {
  const file = readFileSync(path);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const tag = (at: number) => file.toString("ascii", at, at + 4);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error(`${path}: not a WAV file`);
  let at = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (at + 8 <= file.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1) throw new Error(`${path}: not PCM`);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      if (bits !== 16 || !channels) throw new Error(`${path}: expected 16-bit PCM`);
      const frames = Math.floor(size / (2 * channels));
      const samples = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame += 1) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel += 1)
          sum += view.getInt16(at + 8 + 2 * (frame * channels + channel), true);
        samples[frame] = sum / channels / 32768;
      }
      return { samples, sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no audio`);
}

const path = process.argv[2];
if (!path) throw new Error("usage: bun scripts/aurixa-reel-2/structure.ts <take.wav>");
const { samples, sampleRate } = readWav(path);
const found = analyzeStructure(samples, sampleRate);
if (!found) {
  console.log(JSON.stringify({ found: false, seconds: samples.length / sampleRate }));
} else {
  const { structure } = found;
  console.log(
    JSON.stringify({
      found: true,
      seconds: samples.length / sampleRate,
      bpm: structure.bpm,
      beatsPerBar: structure.beatsPerBar,
      confidence: structure.confidence,
      beats: structure.beats,
      downbeats: structure.downbeats,
      bars: structure.bars,
      sections: structure.sections,
    }),
  );
}
