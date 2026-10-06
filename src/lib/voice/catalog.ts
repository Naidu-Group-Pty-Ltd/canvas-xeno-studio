/**
 * Brand voice catalogue shared by the UI and the server: providers, models,
 * settings shapes and the text helpers that keep voiceovers consistent.
 */
import { z } from "zod";

export const VOICE_PROVIDERS = ["openai", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export const VOICE_PROVIDER_LABELS: Record<VoiceProvider, string> = {
  openai: "OpenAI voices",
  elevenlabs: "ElevenLabs",
};

/** OpenAI's built-in voices for gpt-4o-mini-tts, with a short character note. */
export const OPENAI_VOICES = [
  { id: "marin", note: "Natural, warm, recommended" },
  { id: "cedar", note: "Natural, grounded, recommended" },
  { id: "alloy", note: "Neutral, balanced" },
  { id: "ash", note: "Clear, direct" },
  { id: "ballad", note: "Soft, melodic" },
  { id: "coral", note: "Bright, friendly" },
  { id: "echo", note: "Resonant, calm" },
  { id: "fable", note: "Expressive, storytelling" },
  { id: "nova", note: "Upbeat, youthful" },
  { id: "onyx", note: "Deep, authoritative" },
  { id: "sage", note: "Gentle, considered" },
  { id: "shimmer", note: "Light, airy" },
  { id: "verse", note: "Dynamic, versatile" },
] as const;

export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";

export const ELEVENLABS_MODELS = [
  {
    id: "eleven_multilingual_v2",
    short: "Multilingual v2",
    label: "Multilingual v2 · most consistent, full voice settings",
    maxChars: 10_000,
    fullSettings: true,
  },
  {
    id: "eleven_v4",
    short: "v4",
    label: "v4 · most expressive (stability and similarity only)",
    maxChars: 10_000,
    fullSettings: false,
  },
  {
    id: "eleven_v3",
    short: "v3",
    label: "v3 · expressive, previous generation",
    maxChars: 5_000,
    fullSettings: true,
  },
  {
    id: "eleven_flash_v2_5",
    short: "Flash v2.5",
    label: "Flash v2.5 · fastest, lowest cost",
    maxChars: 40_000,
    fullSettings: true,
  },
] as const;

/** Whether a model takes style, speed and speaker boost (v4 takes only stability and similarity). */
export function elevenLabsFullSettings(model: string): boolean {
  return ELEVENLABS_MODELS.find((entry) => entry.id === model)?.fullSettings ?? false;
}
export const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

/** Delivery presets for OpenAI's `instructions`; they also seed ElevenLabs personas. */
export const DELIVERY_PRESETS = [
  {
    id: "warm",
    label: "Warm & friendly",
    instructions:
      "Warm, friendly and natural, like talking to a friend. Relaxed pace, gentle smile in the voice.",
  },
  {
    id: "premium",
    label: "Confident & premium",
    instructions:
      "Confident, polished and premium. Measured pace, clear diction, understated warmth.",
  },
  {
    id: "energetic",
    label: "Energetic & upbeat",
    instructions:
      "Energetic and upbeat with bright, punchy delivery. Quick pace, lift on key words.",
  },
  {
    id: "calm",
    label: "Calm & reassuring",
    instructions: "Calm, reassuring and trustworthy. Slow, even pace with soft emphasis.",
  },
  {
    id: "documentary",
    label: "Documentary narrator",
    instructions: "Thoughtful documentary narration. Steady pace, rich tone, natural pauses.",
  },
] as const;

export const pronunciationSchema = z.object({
  term: z.string().trim().min(1).max(60),
  say: z.string().trim().min(1).max(120),
});
export type Pronunciation = z.infer<typeof pronunciationSchema>;

export const openAISettingsSchema = z.object({
  instructions: z.string().max(1000).default(""),
  speed: z.number().min(0.25).max(4).default(1),
});

export const elevenLabsSettingsSchema = z.object({
  stability: z.number().min(0).max(1).default(0.5),
  similarity_boost: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  use_speaker_boost: z.boolean().default(true),
  speed: z.number().min(0.7).max(1.2).default(1),
  /** Fixed seed: the same script reads the same way each time (best effort). */
  seed: z.number().int().min(0).max(4_294_967_295).nullable().default(null),
});

export type OpenAIVoiceSettings = z.infer<typeof openAISettingsSchema>;
export type ElevenLabsVoiceSettings = z.infer<typeof elevenLabsSettingsSchema>;

export interface BrandVoiceRow {
  id: string;
  name: string;
  description: string | null;
  provider: VoiceProvider;
  provider_voice_id: string;
  model: string;
  settings: Record<string, unknown>;
  language: string | null;
  pronunciations: Pronunciation[];
  script_guidelines: string | null;
  sample_asset_id: string | null;
  project_id: string | null;
  source: Record<string, unknown>;
  is_default: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Whether a voice may speak for work in a project: a voice for any project
 * can, a voice kept for one project only there (and not for work outside any
 * project).
 */
export function voiceInScope(
  voice: Pick<BrandVoiceRow, "project_id">,
  projectId: string | null | undefined,
): boolean {
  return !voice.project_id || voice.project_id === (projectId ?? null);
}

/** Average speaking pace used to fit scripts to an edit's length. */
export const WORDS_PER_SECOND = 2.5;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimatedSeconds(text: string): number {
  return Math.round((wordCount(text) / WORDS_PER_SECOND) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Pronunciation                                                       */
/* ------------------------------------------------------------------ */

export interface SpokenToken {
  /** The word as written in the script (what captions show). */
  written: string;
  /** What is sent to the voice: the written word, or its pronunciation respelling. */
  spoken: string;
}

const LEADING = /^[^\p{L}\p{N}]+/u;
const TRAILING = /[^\p{L}\p{N}]+$/u;
const core = (word: string) => word.replace(LEADING, "").replace(TRAILING, "").toLocaleLowerCase();

/**
 * Splits a script into words and applies the voice's pronunciation list, so
 * a brand name is always said the same way. Matching ignores case and the
 * punctuation around words; multi-word terms are supported, longest first.
 */
export function tokenizeScript(script: string, pronunciations: Pronunciation[]): SpokenToken[] {
  const words = script.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const rules = [...pronunciations]
    .map((rule) => ({
      words: rule.term.trim().split(/\s+/).map(core).filter(Boolean),
      say: rule.say.trim(),
    }))
    .filter((rule) => rule.words.length && rule.say)
    .sort((a, b) => b.words.length - a.words.length);
  const tokens: SpokenToken[] = [];
  let index = 0;
  outer: while (index < words.length) {
    for (const rule of rules) {
      const slice = words.slice(index, index + rule.words.length);
      if (slice.length !== rule.words.length) continue;
      if (!slice.every((word, position) => core(word) === rule.words[position])) continue;
      const leading = LEADING.exec(slice[0]!)?.[0] ?? "";
      const trailing = TRAILING.exec(slice.at(-1)!)?.[0] ?? "";
      tokens.push({ written: slice.join(" "), spoken: `${leading}${rule.say}${trailing}` });
      index += rule.words.length;
      continue outer;
    }
    tokens.push({ written: words[index]!, spoken: words[index]! });
    index += 1;
  }
  return tokens;
}

export function spokenText(tokens: SpokenToken[]): string {
  return tokens.map((token) => token.spoken).join(" ");
}

/* ------------------------------------------------------------------ */
/* Word timing                                                         */
/* ------------------------------------------------------------------ */

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** Turns per-character timings (ElevenLabs) into per-word timings. */
export function wordsFromCharacters(
  characters: string[],
  starts: number[],
  ends: number[],
): TimedWord[] {
  const words: TimedWord[] = [];
  let current: TimedWord | null = null;
  characters.forEach((character, index) => {
    if (/\s/.test(character)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    const start = starts[index] ?? 0;
    const end = ends[index] ?? start;
    if (!current) current = { text: character, start, end };
    else {
      current.text += character;
      current.end = end;
    }
  });
  if (current) words.push(current);
  return words;
}

/**
 * Times each written word of the script. When the provider's words line up
 * with the spoken words, every written word gets the exact timing of what was
 * said for it (a respelled brand name keeps its written form). Otherwise the
 * timing is spread over the speech in proportion to word length.
 */
export function alignScript(
  tokens: SpokenToken[],
  timed: TimedWord[],
  duration: number | null,
): TimedWord[] {
  const spokenCounts = tokens.map((token) => token.spoken.split(/\s+/).filter(Boolean).length);
  const totalSpoken = spokenCounts.reduce((sum, count) => sum + count, 0);
  if (timed.length === totalSpoken && totalSpoken > 0) {
    const result: TimedWord[] = [];
    let cursor = 0;
    tokens.forEach((token, index) => {
      const count = spokenCounts[index]!;
      const first = timed[cursor];
      const last = timed[cursor + count - 1];
      cursor += count;
      if (first && last) result.push({ text: token.written, start: first.start, end: last.end });
    });
    return result;
  }
  const from = timed[0]?.start ?? 0;
  const to = timed.at(-1)?.end ?? duration ?? tokens.length / WORDS_PER_SECOND;
  const weights = tokens.map((token) => token.written.length + 2);
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  let cursor = from;
  return tokens.map((token, index) => {
    const length = ((to - from) * weights[index]!) / sum;
    const word = {
      text: token.written,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + length).toFixed(3)),
    };
    cursor += length;
    return word;
  });
}
