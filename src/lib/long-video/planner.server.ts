/**
 * Writing a long video's beats with the studio's AI: what happens in each clip,
 * paced to its length, each starting where the last one ends, plus the details
 * that must stay the same throughout. Suggestions only: people review and edit
 * them before anything is generated.
 */
import { AppError } from "../higgsfield/errors";
import type { ModelRegistryEntry } from "../model-schema";
import { LONG_VIDEO_LIMITS, modelLine, type FinaleMode } from "./plan";

export const LONG_VIDEO_PLANNER_SYSTEM = `You plan long videos for a creative studio. A long video is made of consecutive AI-generated clips that play back to back as ONE continuous shot. Clip 1 is generated from its prompt; every later clip is generated starting from the LAST FRAME of the clip before it. So each clip must begin exactly where the previous one ended (same subjects, positions, place and light) and carry the action forward, with no cuts, jumps or new scenes unless the story itself calls for a change.

Write:
- title: two to six words naming the piece.
- continuity: one compact paragraph (at most 500 characters) listing what must look the same in every clip: each character (age, build, hair, wardrobe and its colours) except those listed under CHARACTERS (the studio adds their look itself), key props or product, location, time of day, lighting, colour palette and camera style. Concrete visual details only, no story.
- beats: exactly one per clip, in order. Each says only what happens during that clip's seconds: the action, the camera's movement, and the pose or composition it ends on (which the next clip starts from). Pace each beat to its length, about one clear action every four to five seconds. Present tense, at most 350 characters, no cuts within a clip, and don't repeat the continuity details.

Motion runs straight through every join. Each clip after the first is generated from a single still frame, so it only knows how things were moving if its beat says so: begin each beat after the first by continuing the camera move and action the previous beat ended on (same direction and pace) before anything changes, and end every beat but the last mid-motion, never slowing to a stop, settling or holding still. Change camera direction gradually within a clip, never at a join.

Keep the user's story, product, brand and setting. Never add on-screen text, captions or logos unless asked. If the story is thin, make confident cinematic choices that suit it. If continuity notes are given, keep them and only make them more precise.

Every clip but the last carries straight on into the next, so its beat never wraps the story up: no closing shot, logo reveal or end card before the last clip.

The brand finisher: a logo, wordmark or end card that closes the video. When one is named, no beat shows it or reveals the logo before the end. If it is held as an end card after the last clip, the last beat comes to a calm close without a logo of its own. If the last clip moves into it, the last beat ends by moving into and settling on that end card. Also return finisher_image: the number of the reference image that is the brand's logo, wordmark or end card (its finisher), or 0 when none of them is.`;

export const LONG_VIDEO_PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    continuity: { type: "string" },
    beats: { type: "array", items: { type: "string" } },
    finisher_image: {
      type: "number",
      description:
        "1-based number of the reference image that is the brand's logo, wordmark or end card; 0 for none.",
    },
  },
  required: ["title", "continuity", "beats"],
};

export interface LongVideoPlanSuggestion {
  title: string;
  continuity: string;
  beats: string[];
  /** The reference image (1-based) the AI took for the brand's logo or end card, if any. */
  finisherImage: number | null;
}

export async function suggestLongVideoPlan(input: {
  first: ModelRegistryEntry;
  story: string;
  continuity: string;
  title: string;
  durations: number[];
  imageUrls: string[];
  briefBlock: string;
  /** The finisher chosen, by its image number (null when it isn't among them), and how it ends the video. */
  finale?: { image: number | null; mode: FinaleMode } | null;
  /**
   * The characters who must look the same throughout, with the numbers of
   * their images among `imageUrls` (after the person's own references).
   */
  characters?: { name: string; description: string; images: number[] }[];
  /** Each clip's final moment is painted as a still first (a keyframe). */
  keyframes?: boolean;
  /**
   * Made to a voiceover: the words spoken in each clip (empty where they
   * aren't known), the clips cut where the voiceover pauses.
   */
  spoken?: string[] | null;
}): Promise<LongVideoPlanSuggestion> {
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route)
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Writing beats needs an AI model. Add an OPENAI_API_KEY backend secret or enable Lovable AI for this project.",
    );

  let start = 0;
  const clips = input.durations.map((seconds, index) => {
    const entry = { clip: index + 1, from_second: start, seconds };
    start += seconds;
    return entry;
  });
  const spoken = input.spoken?.length ? input.spoken : null;
  const prompt = [
    `MODEL: ${modelLine(input.first)} makes every clip; each clip after the first starts from the previous clip's last frame.`,
    `CLIPS (JSON): ${JSON.stringify(clips)}`,
    spoken
      ? "Each clip runs as long as its part of the voiceover: pace each beat to its own seconds, and give the last one an ending that fits its length."
      : "Every clip is as long as the model allows except usually the last, which takes what is left: pace each beat to its own seconds, and give the last one an ending that fits its length.",
    spoken ? voiceoverBlock(spoken, !!input.keyframes) : "",
    `TOTAL: ${start} seconds in ${clips.length} clips. Return exactly ${clips.length} beats.`,
    input.title.trim() ? `WORKING TITLE: ${input.title.trim()}` : "",
    input.story.trim()
      ? `STORY:\n${input.story.trim()}`
      : "STORY: (none given; propose one from the references)",
    input.continuity.trim() ? `CONTINUITY NOTES:\n${input.continuity.trim()}` : "",
    input.imageUrls.length
      ? `REFERENCE IMAGES: ${input.imageUrls.length} attached, numbered in order from 1. Use them for how the characters, product and setting look.`
      : "",
    charactersBlock(input.characters ?? [], !!input.keyframes),
    finisherLine(input.finale ?? null),
    input.briefBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await route.provider.generateStructured<Partial<LongVideoPlanSuggestion>>({
    system: LONG_VIDEO_PLANNER_SYSTEM,
    input: prompt,
    schemaName: "long_video_plan",
    schema: LONG_VIDEO_PLAN_SCHEMA,
    model: route.model,
    images: input.imageUrls,
    timeoutMs: 120_000,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "No beats could be written. Try again.",
    );

  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const beats = Array.isArray(result.data.beats) ? result.data.beats : [];
  const finisher = Number((result.data as Record<string, unknown>)["finisher_image"]);
  return {
    title: text(result.data.title, LONG_VIDEO_LIMITS.titleChars),
    continuity: text(result.data.continuity, LONG_VIDEO_LIMITS.continuityChars),
    beats: input.durations.map((_, index) => text(beats[index], LONG_VIDEO_LIMITS.beatChars)),
    finisherImage:
      Number.isInteger(finisher) && finisher >= 1 && finisher <= input.imageUrls.length
        ? finisher
        : null,
  };
}

/**
 * What the beat writer is told about the characters: who they are (their look
 * is added to every clip's prompt by the studio, so it isn't repeated), and
 * that each must stay recognisable where clips join, since the next clip (or
 * its keyframe) is made from that moment.
 */
function charactersBlock(
  characters: { name: string; description: string; images: number[] }[],
  keyframes: boolean,
): string {
  if (!characters.length) return "";
  const who = characters
    .map(
      (character) =>
        `- ${character.name}${character.images.length ? ` (reference image${character.images.length > 1 ? "s" : ""} ${character.images.join(", ")})` : ""}${character.description ? `: ${character.description}` : ""}`,
    )
    .join("\n");
  return [
    `CHARACTERS who must look exactly the same in every clip:\n${who}`,
    "Call each by name. The studio adds their look to every clip, so don't describe their appearance or clothes in the beats or the continuity notes (keep those to the setting, props, light and style), and don't change their clothes, hair or props unless the story asks for it.",
    "Keep them recognisable where clips join: end every beat but the last with each character in the shot facing the camera or in three-quarter view, face clear and unobstructed, at a medium shot or closer, never turned away, in silhouette, blurred, tiny or hidden behind something (unless the story has them leave the shot).",
    keyframes
      ? "The final moment of every beat is painted as a still before its clip is made, then the clip moves into it: say concretely where each character is, which way they face and how the shot is framed at that moment."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What the beat writer is told about a voiceover the video is made to: the
 * words in each clip, which a speaker says with their lips driven by the
 * recording, so each beat is about how they say it (never what), and keeps
 * their face where the lips can be seen.
 */
function voiceoverBlock(spoken: string[], keyframes: boolean): string {
  return [
    `VOICEOVER: the video is made to a recorded voiceover, cut into these clips where it pauses. In every clip the speaker says that clip's words, their lips moving to the recording. Words per clip (JSON): ${JSON.stringify(spoken.map((words, index) => ({ clip: index + 1, words: words || "(not transcribed)" })))}`,
    "Write each beat around the speaker as they say those words: their expression, gestures and small movements suiting what is said, and the camera's move. Never put the words themselves, or any other dialogue, in a beat. Keep the speaker's face clear, lit and towards the camera, at a medium shot or closer, whenever they speak.",
    keyframes
      ? "The final moment of every beat is painted as a still before its clip is made, and the clip moves into it as the words are said; the next clip starts a moment before it, as the words end. So keep each beat's final moment close to how the speaker looks as they finish speaking (no big move after the words), and say concretely where the speaker is, which way they face and how the shot is framed then."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What the beat writer is told about the brand finisher. */
function finisherLine(finale: { image: number | null; mode: FinaleMode } | null): string {
  if (!finale) return "FINISHER: none chosen yet.";
  const which = finale.image ? `Reference image ${finale.image}` : "The brand's logo";
  const how =
    finale.mode === "end_card"
      ? "is held as an end card straight after the last clip, so the last clip comes to a calm close without a logo of its own"
      : finale.mode === "reveal"
        ? "is the last clip's final frame: the last clip moves into it and settles on it"
        : "is the last clip's final frame (the last clip moves into it and settles on it), then holds as an end card";
  return `FINISHER: ${which} ${how}. No clip shows it or reveals the logo before then.`;
}
