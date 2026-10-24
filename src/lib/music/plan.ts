import { z } from "zod/v4";
import type { MusicModel } from "./catalog";

/**
 * Eleven Music's composition plan, for Eleven Music v2 and v2.5: a song laid
 * out as chunks, each of its own length (3 s to 2 min), styles and text (a
 * section's name in square brackets, then any lyrics and {directions}). A
 * prompt places its sections only roughly; a plan fixes where each one
 * starts, which is how a film's drops are made to land on its cuts. The
 * models enforce every chunk's length.
 *
 * The first chunk's styles matter most (they set the song's tone and genre),
 * and ElevenLabs advises six or seven of them until the direction is set.
 * Pure: the shape the studio accepts, what is sent to ElevenLabs, and the
 * line the library keeps of it.
 */

/** The models a plan is for: v1 took a plan of another shape, and ElevenLabs has retired it. */
export const PLAN_MODELS = ["music_v2", "music_v2_5"] as const satisfies readonly MusicModel[];

export const MUSIC_PLAN_LIMITS = {
  chunks: 24,
  chunkMs: { min: 3_000, max: 120_000 },
  /** As long as the studio makes music (MUSIC_LENGTH). */
  totalMs: 600_000,
  lines: 30,
  lineChars: 200,
  styles: 24,
  styleChars: 120,
} as const;

const style = z.string().trim().min(1).max(MUSIC_PLAN_LIMITS.styleChars);

export const musicPlanChunkSchema = z.object({
  text: z
    .string()
    .max(MUSIC_PLAN_LIMITS.lines * (MUSIC_PLAN_LIMITS.lineChars + 1))
    .refine(
      (text) => text.split("\n").length <= MUSIC_PLAN_LIMITS.lines,
      `At most ${MUSIC_PLAN_LIMITS.lines} lines a chunk`,
    )
    .refine(
      (text) => text.split("\n").every((line) => line.length <= MUSIC_PLAN_LIMITS.lineChars),
      `A line is at most ${MUSIC_PLAN_LIMITS.lineChars} characters`,
    )
    .describe(
      'Its section name in square brackets ("[Intro]"), then any lyrics, one a line; an instrumental gives the name alone',
    ),
  durationMs: z
    .number()
    .int()
    .min(MUSIC_PLAN_LIMITS.chunkMs.min)
    .max(MUSIC_PLAN_LIMITS.chunkMs.max)
    .describe("Its length in milliseconds, 3,000 to 120,000"),
  positiveStyles: z
    .array(style)
    .min(1)
    .max(MUSIC_PLAN_LIMITS.styles)
    .describe("What it should sound like (in English): genre, instruments, tempo, energy"),
  negativeStyles: z
    .array(style)
    .max(MUSIC_PLAN_LIMITS.styles)
    .default([])
    .describe('What it should not have, such as "vocals"'),
  contextAdherence: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("How closely it follows the chunks around it"),
});
export type MusicPlanChunk = z.infer<typeof musicPlanChunkSchema>;

export const musicPlanSchema = z
  .object({ chunks: z.array(musicPlanChunkSchema).min(1).max(MUSIC_PLAN_LIMITS.chunks) })
  .refine(
    (plan) => planMilliseconds(plan) <= MUSIC_PLAN_LIMITS.totalMs,
    `A plan runs at most ${MUSIC_PLAN_LIMITS.totalMs / 60_000} minutes`,
  );
export type MusicPlan = z.infer<typeof musicPlanSchema>;

export function isPlanModel(model: string): model is (typeof PLAN_MODELS)[number] {
  return (PLAN_MODELS as readonly string[]).includes(model);
}

export function planMilliseconds(plan: { chunks: { durationMs: number }[] }): number {
  return plan.chunks.reduce((total, chunk) => total + chunk.durationMs, 0);
}

/** What ElevenLabs is sent as composition_plan (its own names). */
export function planBody(plan: MusicPlan): { chunks: Record<string, unknown>[] } {
  return {
    chunks: plan.chunks.map((chunk) => ({
      text: chunk.text,
      duration_ms: chunk.durationMs,
      positive_styles: chunk.positiveStyles,
      ...(chunk.negativeStyles.length ? { negative_styles: chunk.negativeStyles } : {}),
      ...(chunk.contextAdherence ? { context_adherence: chunk.contextAdherence } : {}),
    })),
  };
}

/** A chunk's section name: the text in square brackets that opens it, if there is one. */
function sectionName(text: string): string | null {
  return /^\s*\[([^\]\n]{1,100})\]/.exec(text)?.[1]?.trim() || null;
}

/**
 * The plan as the library keeps it in a track's description: each chunk's
 * name (or its number) and where it starts and ends, so anyone can see where
 * the song's parts fall. Its fingerprint and the seed go with it, so two
 * different plans (or takes) are never taken for the same music.
 */
export async function planSummary(plan: MusicPlan, seed: number | null): Promise<string> {
  let at = 0;
  const parts = plan.chunks.map((chunk, index) => {
    const from = at;
    at += chunk.durationMs;
    const name = sectionName(chunk.text) ?? `Part ${index + 1}`;
    return `${name} ${seconds(from)}–${seconds(at)}`;
  });
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(planBody(plan)))),
  );
  const fingerprint = Array.from(digest.slice(0, 6), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `Composition plan ${fingerprint}${seed === null ? "" : `, seed ${seed}`}: ${parts.join(" · ")}`;
}

function seconds(ms: number): string {
  const value = ms / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} s`;
}
