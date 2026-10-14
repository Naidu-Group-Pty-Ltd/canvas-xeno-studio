/**
 * The identity check: the studio's AI compares frames of a clip (or a
 * keyframe) with each character's reference images and says, per character,
 * whether they are the same person in the same clothes. Only a clear change
 * counts against a clip; pose, expression, light, angle and blur never do, and
 * someone who isn't in view is "not visible", never "different".
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VIEW_LABELS, type RunCharacter } from "./model";

export const IDENTITY_VERDICTS = ["same", "minor_differences", "different", "not_visible"] as const;
export type IdentityVerdict = (typeof IDENTITY_VERDICTS)[number];

export interface CharacterVerdict {
  characterId: string;
  name: string;
  verdict: IdentityVerdict;
  /** What differs, in a few words each (only for minor_differences and different). */
  differences: string[];
}

/** What a check found, as stored on the clip or keyframe. */
export interface IdentityResult {
  flagged: boolean;
  verdicts: CharacterVerdict[];
  /** One line for people, e.g. "Mia: shorter hair; a red jacket instead of navy". */
  summary: string | null;
  /** The frames looked at, as stored, for showing next to the verdict. */
  frames: { bucket: string; path: string; label: string }[];
  model: string | null;
  checkedAt: string;
}

export type IdentityOutcome =
  | { ok: true; result: IdentityResult }
  | { ok: false; code: string; message: string; retryable: boolean };

/** Reference images per character the AI is shown (its best views). */
const SHEET_IMAGES_PER_CHARACTER = 3;

const SYSTEM = `You check frames from an AI-generated video for character consistency. For each character you are given their reference images, then frames from one moment of the video.

For each character, decide:
- "same": clearly the same person (face, age, skin tone, hair colour, length and style, build) in the same clothes as their reference images.
- "minor_differences": the same person, with small changes a casual viewer would barely notice (a slightly different shade, a missing small accessory, a slightly different hairstyle detail).
- "different": a viewer would notice they changed: a different face or apparent age, different hair colour or length, a different build, or different clothes (another garment, colour or pattern).
- "not_visible": not in the frames, or too small, turned away, blurred or hidden to judge.

Judge identity and clothing only. Ignore pose, expression, camera angle, lens, lighting, colour grading, motion blur, background and framing. Never call someone "different" because they are hard to see: that is "not_visible". When unsure between "same" and "minor_differences", choose "same"; between "minor_differences" and "different", choose "minor_differences" unless the change is plain to see.

For "minor_differences" and "different", list what changed in a few words each (at most three), naming the feature and how it differs, e.g. "hair: shoulder-length in the references, cropped here".`;

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          character: { type: "number" },
          verdict: { type: "string", enum: [...IDENTITY_VERDICTS] },
          differences: { type: "array", items: { type: "string" } },
        },
        required: ["character", "verdict", "differences"],
      },
    },
  },
  required: ["characters"],
};

async function signed(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

/**
 * Compares `frames` (in time order) with the characters' reference images.
 * A failure says whether trying again could help (the AI busy or briefly
 * unavailable) or not (no AI configured, nothing to compare).
 */
export async function checkIdentity(input: {
  characters: RunCharacter[];
  frames: { bucket: string; path: string; label: string }[];
  /** What is being checked, e.g. "clip 3" or "keyframe 2". */
  what: string;
  /** What happens in it, so a change the action calls for (putting a coat on) isn't held against it. */
  beat?: string | null;
}): Promise<IdentityOutcome> {
  const characters = input.characters.filter((character) => character.images.length);
  if (!characters.length)
    return {
      ok: false,
      code: "NOTHING_TO_CHECK",
      message: "No reference images",
      retryable: false,
    };
  if (!input.frames.length)
    return { ok: false, code: "NO_FRAMES", message: "No frames to check", retryable: true };

  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route)
    return {
      ok: false,
      code: "REASONING_NOT_CONFIGURED",
      message: "No AI model is set up to check characters",
      retryable: false,
    };

  // The characters' best views, then the frames, each numbered in the prompt.
  const sheetIds = characters.flatMap((character) =>
    character.images.slice(0, SHEET_IMAGES_PER_CHARACTER).map((image) => image.assetId),
  );
  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id,storage_bucket,storage_path")
    .in("id", sheetIds)
    .is("deleted_at", null);
  const urls: string[] = [];
  const lines: string[] = [];
  for (const [index, character] of characters.entries()) {
    const numbers: string[] = [];
    for (const image of character.images.slice(0, SHEET_IMAGES_PER_CHARACTER)) {
      const asset = (assets ?? []).find((row) => row.id === image.assetId);
      const url = asset ? await signed(asset.storage_bucket, asset.storage_path) : null;
      if (!url) continue;
      urls.push(url);
      numbers.push(`image ${urls.length} (${VIEW_LABELS[image.view].toLowerCase()})`);
    }
    lines.push(
      `CHARACTER ${index + 1}: ${character.name}${character.description ? ` — ${character.description}` : ""}\nReference images: ${numbers.length ? numbers.join(", ") : "none could be read"}`,
    );
  }
  const firstFrame = urls.length + 1;
  const frameLabels: string[] = [];
  for (const frame of input.frames) {
    const url = await signed(frame.bucket, frame.path);
    if (!url) continue;
    urls.push(url);
    frameLabels.push(`image ${urls.length} (${frame.label})`);
  }
  if (urls.length < firstFrame)
    return {
      ok: false,
      code: "NO_FRAMES",
      message: "The frames couldn't be read",
      retryable: true,
    };
  if (firstFrame === 1)
    return {
      ok: false,
      code: "NOTHING_TO_CHECK",
      message: "The reference images couldn't be read",
      retryable: true,
    };

  const result = await route.provider.generateStructured<{
    characters?: { character?: number; verdict?: string; differences?: unknown }[];
  }>({
    system: SYSTEM,
    input: [
      ...lines,
      `FRAMES FROM ${input.what.toUpperCase()}, in time order: ${frameLabels.join(", ")}.`,
      input.beat?.trim()
        ? `WHAT HAPPENS IN IT: ${input.beat.trim()}\nA change this action itself calls for (taking off a jacket, getting wet) is expected, not "different".`
        : "",
      `Return one entry per character (1 to ${characters.length}).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "identity_check",
    schema: SCHEMA,
    model: route.model,
    images: urls,
    // Well inside the lease a check is run under, so a slow answer is never written twice.
    timeoutMs: 60_000,
  });
  if (!result.ok || !result.data)
    return {
      ok: false,
      code: result.errorCode ?? "REASONING_FAILED",
      message: result.errorMessage ?? "The check didn't answer",
      retryable: !["REASONING_NOT_CONFIGURED", "REASONING_MODEL_UNAVAILABLE"].includes(
        result.errorCode ?? "",
      ),
    };

  const verdicts: CharacterVerdict[] = characters.map((character, index) => {
    const entry = (result.data?.characters ?? []).find(
      (item) => Number(item.character) === index + 1,
    );
    const verdict = (IDENTITY_VERDICTS as readonly string[]).includes(String(entry?.verdict))
      ? (entry!.verdict as IdentityVerdict)
      : "not_visible";
    const differences = Array.isArray(entry?.differences)
      ? entry.differences
          .filter((item): item is string => typeof item === "string" && !!item.trim())
          .map((item) => item.trim().slice(0, 160))
          .slice(0, 3)
      : [];
    return {
      characterId: character.id,
      name: character.name,
      verdict,
      differences: verdict === "same" || verdict === "not_visible" ? [] : differences,
    };
  });
  const changed = verdicts.filter((entry) => entry.verdict === "different");
  return {
    ok: true,
    result: {
      flagged: changed.length > 0,
      verdicts,
      summary: changed.length
        ? changed
            .map(
              (entry) =>
                `${entry.name}${entry.differences.length ? `: ${entry.differences.join("; ")}` : " looks different"}`,
            )
            .join(". ")
        : null,
      frames: input.frames,
      model: result.model ?? route.model,
      checkedAt: new Date().toISOString(),
    },
  };
}
