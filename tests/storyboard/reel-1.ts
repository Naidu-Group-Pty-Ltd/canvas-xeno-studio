/**
 * Reel 1's records, as fixtures: the voiceover's measured words (as the
 * studio's lip-sync preparation found them), its speech segments (from the
 * same preparation, kept in scripts/aurixa-reel-1/timing.py), the spec the
 * pack's cues and blocks were cut with, and the system edition's brief.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimedWord } from "../../src/lib/lip-sync/segments";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

export const WORDS: TimedWord[] = (
  JSON.parse(read("docs/brands/aurixa-reel-1/system-edition/voiceover-words.json")) as {
    words: TimedWord[];
  }
).words;

/** timing.py keeps the preparation's speech segments as one Python list, which is also JSON. */
export const SPEECH: [number, number][] = JSON.parse(
  /^speech = (\[.*\])$/m.exec(read("scripts/aurixa-reel-1/timing.py"))![1]!,
);

/** The voiceover's length (timing.py's END), and the frame rate it was cut at. */
export const VOICE_SECONDS = 106.031;
export const FPS = 30;

export interface SpecCue {
  n: number;
  start: number;
  pack_estimate: number;
  text: string;
}

export const SPEC = JSON.parse(read("docs/brands/aurixa-reel-1/spec.json")) as {
  timing: {
    cues: SpecCue[];
    blocks: { block: string; in: number; out: number; title: string; purpose: string }[];
  };
  edit: { captions: { start: number; end: number; text: string }[] };
};

export interface BriefShot {
  id: string;
  block: string;
  title: string;
  kind: string;
  sources: string[];
  on_screen: string[];
  in: number;
  out: number;
  seconds: number;
  voice_in: number;
  voiceover: string[];
  beats: { at: number; do: string }[];
  [key: string]: unknown;
}

export const BRIEF_TEXT = read("docs/brands/aurixa-reel-1/system-edition/brief.json");
export const BRIEF = JSON.parse(BRIEF_TEXT) as { shots: BriefShot[]; [key: string]: unknown };

export const PACING = JSON.parse(read("docs/brands/aurixa-reel-1/system-edition/pacing.json")) as {
  end: number;
  music: { period: number; drop_in_file: number };
};

/** The measured word that starts at a time. */
export function wordAt(start: number): number {
  const index = WORDS.findIndex((word) => Math.abs(word.start - start) < 1e-6);
  if (index < 0) throw new Error(`No measured word starts at ${start}`);
  return index;
}
