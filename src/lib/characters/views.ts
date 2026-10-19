/**
 * Making a character's reference views (a face close-up, full-body front,
 * three-quarter, side and back) from one or more photos with an image model
 * that takes references, or from their Soul ID on its Soul model. Each view is
 * one ordinary, billed generation; its request key says which character and
 * view it is for, so the studio can offer it for the character's sheet.
 */
import { defaultsForModel, normalizeOption, type ModelRegistryEntry } from "../model-schema";
import { painterValues } from "../long-video/keyframes";
import { trimDescription, type CharacterView } from "./model";

export const MAKEABLE_VIEWS = ["face", "front", "three_quarter", "side", "back"] as const;
export type MakeableView = (typeof MAKEABLE_VIEWS)[number];

const VIEW_SHOTS: Record<MakeableView, string> = {
  face: "A head-and-shoulders portrait, facing the camera, neutral relaxed expression, eyes open.",
  front:
    "A full-body photo standing facing the camera, arms relaxed at the sides, the whole body from head to feet in frame.",
  three_quarter:
    "A full-body photo standing turned three-quarters to the camera's left, the whole body from head to feet in frame.",
  side: "A full-body side profile standing facing left, the whole body from head to feet in frame.",
  back: "A full-body photo from behind, standing, the whole body from head to feet in frame.",
};

const STUDIO =
  "Plain light-grey studio background, even soft light, sharp focus, photorealistic. No text, no other people, nothing held in the hands.";

/** The shape each view is made at (width / height): portrait for the face, tall for the full figure. */
export function viewRatio(view: MakeableView): number {
  return view === "face" ? 3 / 4 : 2 / 3;
}

/** What a view is made from: the person's photos (as references), or their Soul ID and description. */
export function viewPrompt(
  view: MakeableView,
  input: { fromImages: boolean; description: string },
): string {
  const look = input.description.trim()
    ? trimDescription(input.description, 400).replace(/\.$/, "")
    : "";
  const who = input.fromImages
    ? `The reference images show one person. Make a new photo of exactly the same person: the same face, age, skin tone, hair and build, wearing the same clothes, shoes and accessories as in the reference images.${look ? ` (${look}.)` : ""}`
    : `A photo of this person${look ? `: ${look}` : ""}.`;
  return [who, VIEW_SHOTS[view], STUDIO].join(" ");
}

function optionValues(model: ModelRegistryEntry, key: string): (string | number)[] {
  const field = model.parameter_schema?.fields?.find((entry) => entry.key === key);
  return (field?.options ?? []).map((option) => normalizeOption(option).value);
}

/** The aspect ratio a model offers closest to `ratio`. */
function closest(model: ModelRegistryEntry, ratio: number): string | null {
  let best: { value: string; gap: number } | null = null;
  for (const value of optionValues(model, "aspect_ratio")) {
    if (typeof value !== "string") continue;
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value);
    if (!match) continue;
    const gap = Math.abs(Math.log(Number(match[1]) / Number(match[2]) / ratio));
    if (!best || gap < best.gap) best = { value, gap };
  }
  return best?.value ?? null;
}

/** A view's settings on an image model that takes the photos as references. */
export function paintedViewValues(
  model: ModelRegistryEntry,
  view: MakeableView,
): Record<string, unknown> {
  return painterValues(model, viewRatio(view));
}

/** A view's settings on a Soul model, with the character's Soul ID. */
export function soulViewValues(
  model: ModelRegistryEntry,
  view: MakeableView,
  referenceId: string,
): Record<string, unknown> {
  return soulStillValues(model, viewRatio(view), referenceId);
}

/**
 * A still's settings on a Soul model with a character's Soul ID: the
 * closest shape to `ratio`, its sharper resolution, one image, and the
 * prompt left as written.
 */
export function soulStillValues(
  model: ModelRegistryEntry,
  ratio: number,
  referenceId: string,
): Record<string, unknown> {
  const values = defaultsForModel(model);
  const aspect = closest(model, ratio);
  if (aspect) values["aspect_ratio"] = aspect;
  if (optionValues(model, "resolution").includes("1080p")) values["resolution"] = "1080p";
  if (optionValues(model, "batch_size").includes(1)) values["batch_size"] = 1;
  values["custom_reference_id"] = referenceId;
  // Full strength: the trained face is the point (Soul 2 can't take 0 with a reference).
  values["custom_reference_strength"] = 1;
  if (model.parameter_schema?.fields?.some((field) => field.key === "enhance_prompt"))
    values["enhance_prompt"] = false;
  return values;
}

const KEY_PREFIX = "chr:";

/** The request key of a view made for a character: one per press, never reused. */
export function viewRequestKey(characterId: string, view: MakeableView): string {
  return `${KEY_PREFIX}${characterId}:${view}:${crypto.randomUUID().slice(0, 8)}`;
}

/** What request keys of a character's views start with. */
export function viewKeyPrefix(characterId: string): string {
  return `${KEY_PREFIX}${characterId}:`;
}

/** The view a request key was made for, if it is one of a character's. */
export function viewOfKey(key: string | null | undefined): CharacterView | null {
  if (!key?.startsWith(KEY_PREFIX)) return null;
  const view = key.split(":")[2];
  return (MAKEABLE_VIEWS as readonly string[]).includes(view ?? "")
    ? (view as CharacterView)
    : null;
}
