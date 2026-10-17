/**
 * The recipe for a presenter speaking to camera, from a bake-off of six ways
 * of making the same 8 s line (SyncNet confidence at the lips' best offset):
 * Wan 2.7 from a still, a minimal prompt and a locked-off camera scored 7.9;
 * the same model told about a slow push-in pulled back to full length and
 * scored 3.6 where it sat; given an end frame (last_frame) it barely moved
 * the mouth at all (0.3). Real, well-synced speech scores about 6 to 8.
 *
 * So a presenter clip is told little: who speaks, where, that the camera
 * never moves, and that their lips follow the voice. The prompt isn't
 * extended by the provider, and nothing that moves the camera is asked for.
 *
 * Shared by the Create page and the server.
 */
import type { ModelRegistryEntry } from "../model-schema";

/** What a presenter clip is told not to do. */
export const PRESENTER_NEGATIVE_PROMPT =
  "text, captions, logo, watermark, camera movement, zoom, dolly, open mouth while silent, distorted mouth, cartoon";

/** The camera line every presenter clip is given. */
export const LOCKED_CAMERA_LINE =
  "The camera is locked off and never moves: the same medium close-up from mid-chest up from the first frame to the last, with no zoom, push-in or pull-back.";

/** A presenter's story prompt: who speaks, where, and the locked-off camera. */
export function presenterPrompt(
  input: { who?: string | null; where?: string | null } = {},
): string {
  const who = input.who?.trim() || "The presenter";
  const where = input.where?.trim().replace(/[.,;:]+$/, "") ?? "";
  // "her office at dusk" reads as "in her office at dusk"; "at the desk" as written.
  const place = !where
    ? ""
    : /^(in|at|on|by|beside|behind|inside|outside|near|from)\b/i.test(where)
      ? ` ${where.charAt(0).toLowerCase()}${where.slice(1)}`
      : ` in ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
  return `${who} speaks directly to the camera${place}, with natural, subtle head movement and expressions. ${LOCKED_CAMERA_LINE}`;
}

/**
 * A model's settings with the presenter recipe applied where it has them: the
 * prompt kept as written (no provider extension) and the negative prompt
 * holding the recipe's terms, after any of the person's own.
 */
export function presenterValues(
  model: Pick<ModelRegistryEntry, "parameter_schema">,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const keys = new Set((model.parameter_schema?.fields ?? []).map((field) => field.key));
  const next = { ...values };
  if (keys.has("prompt_extend")) next["prompt_extend"] = false;
  if (keys.has("negative_prompt")) {
    const own =
      typeof values["negative_prompt"] === "string" ? values["negative_prompt"].trim() : "";
    const have = new Set(
      own
        .split(",")
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    );
    const added = PRESENTER_NEGATIVE_PROMPT.split(",")
      .map((term) => term.trim())
      .filter((term) => !have.has(term.toLowerCase()));
    next["negative_prompt"] = [own, added.join(", ")].filter(Boolean).join(", ");
  }
  return next;
}

/** Whether a model's settings already follow the presenter recipe (where it has the settings). */
export function followsPresenterRecipe(
  model: Pick<ModelRegistryEntry, "parameter_schema">,
  values: Record<string, unknown>,
): boolean {
  const keys = new Set((model.parameter_schema?.fields ?? []).map((field) => field.key));
  if (keys.has("prompt_extend") && values["prompt_extend"] !== false) return false;
  if (keys.has("negative_prompt")) {
    const own = typeof values["negative_prompt"] === "string" ? values["negative_prompt"] : "";
    if (!/camera movement/i.test(own)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

const CAMERA_MOVES: [RegExp, string][] = [
  [/\bpush(?:es|ing)?[\s-]*in\b/i, "push-in"],
  [/\bpull(?:s|ing)?[\s-]*(?:back|out)\b/i, "pull-back"],
  [/\bdoll(?:y|ies|ying)\b/i, "dolly"],
  [/\bzoom(?:s|ing|ed)?\b/i, "zoom"],
  [
    /\b(?:camera|slowly|slow|gentle)\s+pan(?:s|ning)?\b|\bpan(?:s|ning)?\s+(?:left|right|across|around|over)\b/i,
    "pan",
  ],
  [/\btilt(?:s|ing)?\s+(?:up|down)\b/i, "tilt"],
  [/\borbit(?:s|ing)?\b|\barc(?:s|ing)?\s+(?:shot|around)\b/i, "orbit"],
  [
    /\btracking\s+shot\b|\bcamera\s+(?:tracks|follows|moves|glides|drifts|sweeps|circles)\b/i,
    "moving camera",
  ],
  [/\bcrane(?:\s+shot|\s+up|\s+down)?\b/i, "crane"],
  [/\bhand[\s-]?held\b/i, "handheld"],
  [/\bwhip[\s-]?pan\b/i, "whip pan"],
];

/** The camera moves a prompt asks for, by name (none for a still, locked-off camera). */
export function cameraMovesIn(text: string): string[] {
  // A line that says the camera doesn't move ("no zoom, push-in or pull-back") asks for none.
  const asked = text
    .split(/(?<=[.!?\n])\s+/)
    .filter(
      (sentence) => !/\b(?:no|never|without|not|don't|doesn't|locked[\s-]?off)\b/i.test(sentence),
    )
    .join(" ");
  const found: string[] = [];
  for (const [pattern, name] of CAMERA_MOVES)
    if (pattern.test(asked) && !found.includes(name)) found.push(name);
  return found;
}

/**
 * What would weaken lip sync in a video made to a voiceover, in plain words
 * (warnings: nothing here stops the video).
 */
export function lipSyncWarnings(input: {
  story: string;
  beats?: string[];
  keyframed: boolean;
  /** The model's settings, to see whether the recipe's are on. */
  model?: Pick<ModelRegistryEntry, "parameter_schema"> | null;
  values?: Record<string, unknown>;
}): string[] {
  const warnings: string[] = [];
  const moves = cameraMovesIn([input.story, ...(input.beats ?? [])].join("\n"));
  if (moves.length)
    warnings.push(
      `The story asks for camera movement (${moves.join(", ")}). Lips follow the voice best with a locked-off camera: a clip told to push in pulled back to full length instead, and its lips scored half what a still camera's did. Use the presenter recipe, or describe the speaker rather than the camera.`,
    );
  if (input.keyframed)
    warnings.push(
      "Keyframes give each clip a frame to end on, and a lip-sync clip made to end on a frame barely moves its mouth. For a presenter speaking to camera, turn keyframes off.",
    );
  if (input.model && input.values && !followsPresenterRecipe(input.model, input.values))
    warnings.push(
      "The provider may rewrite the prompt (prompt extension is on) and nothing keeps the camera still. The presenter recipe turns extension off and adds a negative prompt for camera moves and a moving mouth in silences.",
    );
  return warnings;
}
