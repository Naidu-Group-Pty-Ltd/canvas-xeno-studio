/**
 * The team's characters in a Supercomputer draft that makes one image or one
 * clip. On a Soul model a character goes in as their Soul ID (when one is
 * trained for that model); elsewhere as their reference images, where the
 * model takes several images, after the draft's own and as many as fit; and
 * their look is written into the prompt either way. What couldn't go along
 * is said in the draft's notes. A long video is planned with its characters
 * instead (see long-video-draft).
 */
import { validateParameters, type ModelRegistryEntry } from "../model-schema";
import {
  charactersLine,
  interleaveSheets,
  soulVersionFor,
  trimDescription,
  SOUL_VERSION_LABELS,
  VIEW_LABELS,
  type CharacterSummary,
} from "../characters/model";
import { clipStart } from "../long-video/plan";
import { painterSlot } from "../long-video/keyframes";
import type { DraftReference } from "./types";

/**
 * The team's characters as the agent is told about them, one line each: id,
 * name, their reference images, the Soul model their Soul ID is trained for
 * (by its catalogue id), and their look.
 */
export function characterLines(
  characters: CharacterSummary[],
  models: ModelRegistryEntry[],
): string[] {
  return characters.map((character) => {
    const views = [...new Set(character.images.map((image) => VIEW_LABELS[image.view]))];
    const images = character.images.length
      ? `${character.images.length} reference image${character.images.length === 1 ? "" : "s"} (${views.join("; ").toLowerCase()})`
      : "no reference images (a Soul ID only)";
    const soulModel = character.soul
      ? models.find((model) => soulVersionFor(model.model_path) === character.soul!.version)
      : undefined;
    const soul = character.soul
      ? ` · Soul ID trained for ${SOUL_VERSION_LABELS[character.soul.version]}${soulModel ? ` (model ${soulModel.id})` : " (that model isn't active)"}`
      : "";
    const look = character.description
      ? ` · look: ${trimDescription(character.description, 320)}`
      : "";
    return `- ${character.id} · "${character.name}" · ${images}${soul}${look}`;
  });
}

/** The characters a draft names (by id, or failing that by name), known ones only, at most `max`. */
export function draftCast(
  value: unknown,
  characters: CharacterSummary[],
  max: number,
): CharacterSummary[] {
  const out: CharacterSummary[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) continue;
    const found =
      characters.find((character) => character.id === key) ??
      characters.find((character) => character.name.toLowerCase() === key.toLowerCase());
    if (found && !out.includes(found)) out.push(found);
  }
  return out.slice(0, max);
}

/** "Mia", "Mia and Leo", "Mia, Leo and Sam". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** How many of a model's input-combination rules these roles break. */
function brokenRules(
  model: ModelRegistryEntry,
  values: Record<string, unknown>,
  roles: string[],
): number {
  return validateParameters(model, values, roles).filter((issue) => issue.key === "inputs").length;
}

/**
 * A single generation with its characters in it: their Soul ID or images,
 * and their look at the end of the prompt (within `promptMax`).
 */
export function castIntoDraft(input: {
  model: ModelRegistryEntry;
  /** The draft's settings, as normalised. */
  values: Record<string, unknown>;
  /** The draft's own references, already on the model's inputs. */
  references: DraftReference[];
  cast: CharacterSummary[];
  prompt: string;
  /** The most the prompt may be (its field's limit), or null for no limit. */
  promptMax: number | null;
  /** Whether the model has a prompt at all. */
  hasPrompt: boolean;
}): {
  references: DraftReference[];
  /** Settings to set on the draft (a Soul ID). */
  parameters: Record<string, unknown>;
  prompt: string;
  notes: string[];
} {
  const { model, values, cast } = input;
  const references = [...input.references];
  const parameters: Record<string, unknown> = {};
  const notes: string[] = [];
  if (!cast.length) return { references, parameters, prompt: input.prompt, notes };

  // A Soul model is sent a character as their Soul ID: one per image.
  const soulVersion = soulVersionFor(model.model_path);
  const soulField = (model.parameter_schema?.fields ?? []).some(
    (field) => field.key === "custom_reference_id",
  );
  let soulUsed: CharacterSummary | null = null;
  if (soulVersion && soulField) {
    soulUsed = cast.find((character) => character.soul?.version === soulVersion) ?? null;
    if (soulUsed) parameters["custom_reference_id"] = soulUsed.soul!.referenceId;
    const without = cast.filter((character) => character !== soulUsed);
    if (without.length)
      notes.push(
        soulUsed
          ? `${model.display_name} takes one Soul ID: ${soulUsed.name}'s is used; ${namesList(without.map((character) => character.name))} ${without.length === 1 ? "is" : "are"} kept by description only.`
          : `${namesList(without.map((character) => character.name))} ${without.length === 1 ? "has" : "have"} no Soul ID trained for ${SOUL_VERSION_LABELS[soulVersion]}, so ${without.length === 1 ? "their look is" : "their looks are"} kept by description only. Train one on the Characters page, or choose a model that takes reference images.`,
      );
  }

  // Elsewhere their images go where the model takes several (references, or
  // images to edit), after the draft's own, never breaking its input rules.
  const slot = soulVersion ? null : painterSlot(model);
  const added: { assetId: string; characterId: string }[] = [];
  if (slot) {
    const room = (slot.max ?? 1) - references.filter((ref) => ref.role === slot.role).length;
    const taken = new Set(references.map((ref) => ref.assetId));
    for (const entry of interleaveSheets(cast, taken)) {
      if (added.length >= room) break;
      const roles = references.map((ref) => ref.role);
      if (brokenRules(model, values, [...roles, slot.role]) > brokenRules(model, values, roles))
        break;
      const character = cast.find((member) => member.id === entry.characterId)!;
      references.push({
        assetId: entry.assetId,
        role: slot.role,
        assetType: "image",
        title: `${character.name}'s reference`,
      });
      added.push(entry);
    }
  }
  if (!soulVersion) {
    const imageless = cast.filter((character) => !character.images.length);
    const left = cast.filter(
      (character) =>
        character.images.length && !added.some((entry) => entry.characterId === character.id),
    );
    if (!slot)
      notes.push(
        `${model.display_name} takes no reference images, so ${namesList(cast.map((character) => character.name))} ${cast.length === 1 ? "is" : "are"} kept by description only.`,
      );
    else if (left.length)
      notes.push(
        `No room for ${namesList(left.map((character) => character.name))}'s images among the model's ${slot.max} inputs, so ${left.length === 1 ? "they are" : "they're"} kept by description only.`,
      );
    if (slot && imageless.length)
      notes.push(
        `${namesList(imageless.map((character) => character.name))} ${imageless.length === 1 ? "has" : "have"} no reference images, so only ${imageless.length === 1 ? "their description goes" : "their descriptions go"} along.`,
      );
  }

  // Their look, written into the prompt. A model that names its images by
  // token (<<<image_n>>>) is told which images show whom.
  if (!input.hasPrompt) return { references, parameters, prompt: input.prompt, notes };
  const tokens = new Map<string, string>();
  if (slot && clipStart(model)?.kind === "reference") {
    const named = references.filter((ref) => ref.role === slot.role);
    for (const character of cast) {
      const numbers = added
        .filter((entry) => entry.characterId === character.id)
        .map((entry) => named.findIndex((ref) => ref.assetId === entry.assetId) + 1)
        .filter((n) => n > 0);
      if (numbers.length)
        tokens.set(character.id, numbers.map((n) => `<<<image_${n}>>>`).join(", "));
    }
  }
  const prompt = input.prompt.trim();
  for (const chars of [360, 220, 120]) {
    const line = charactersLine(cast, {
      references: added.length > 0,
      images: tokens.size ? tokens : undefined,
      descriptionChars: chars,
    });
    const next = prompt ? `${prompt}\n\n${line}` : line;
    if (!input.promptMax || next.length <= input.promptMax)
      return { references, parameters, prompt: next, notes };
  }
  notes.push(
    `The prompt is too long to add ${namesList(cast.map((character) => character.name))}'s look; shorten it to keep them the same.`,
  );
  return { references, parameters, prompt: input.prompt, notes };
}
