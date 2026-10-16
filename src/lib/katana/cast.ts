/**
 * The team's characters in a Katana run. Katana keeps a likeness from images
 * (the person's own photos, or a character sheet), and it runs on the
 * Higgsfield account the studio connected, which can't see the Soul IDs
 * trained on the studio's Higgsfield API account. So a character goes to
 * Katana as their reference sheet, best views first (the views made from
 * their Soul ID among them), with their name and look written into the run's
 * first message. Pure.
 */
import { interleaveSheets, type CharacterView, type RunCharacter } from "../characters/model";

/** Characters one run can keep the same. */
export const KATANA_CHARACTERS_MAX = 3;
/** Images one run takes in all (Katana's own limit), characters' sheets included. */
export const KATANA_IMAGES_MAX = 10;
/** A character's sheet images a run is sent, at most. */
export const KATANA_SHEET_IMAGES = 5;
/** A sheet view in a few words, for the tiles that show what goes. */
export const VIEW_SHORT: Record<CharacterView, string> = {
  face: "face",
  front: "front",
  three_quarter: "three-quarter",
  side: "side",
  back: "back",
  outfit: "outfit",
  expression: "expression",
  other: "image",
};

/** The views Katana holds a likeness best from. */
export const KATANA_KEY_VIEWS = ["face", "front"] as const satisfies readonly CharacterView[];

export interface SheetImage {
  assetId: string;
  characterId: string;
  view: CharacterView;
}

/**
 * The sheet images a run sends for its characters, `room` at most: each
 * character's best views first (at most KATANA_SHEET_IMAGES each), and every
 * character's face before anyone's second view, so each keeps at least that.
 */
export function katanaSheet(characters: RunCharacter[], room: number): SheetImage[] {
  const capped = characters.map((character) => ({
    ...character,
    images: character.images.slice(0, KATANA_SHEET_IMAGES),
  }));
  const views = new Map(
    capped.flatMap((character) =>
      character.images.map((image) => [`${character.id}:${image.assetId}`, image.view] as const),
    ),
  );
  return interleaveSheets(capped)
    .slice(0, Math.max(0, Math.floor(room)))
    .map((entry) => ({
      ...entry,
      view: views.get(`${entry.characterId}:${entry.assetId}`) ?? "other",
    }));
}

/** The key views (a face close-up, a full-body front view) a character's sheet lacks. */
export function sheetGaps(character: Pick<RunCharacter, "images">): CharacterView[] {
  const views = new Set(character.images.map((image) => image.view));
  return KATANA_KEY_VIEWS.filter((view) => !views.has(view));
}

/** A run's input, as far as its cast goes. */
export interface CastInput {
  asset_id: string;
  kind: string;
  /** The character the image shows, when it is one of theirs. */
  character_id?: string | null;
  character_name?: string | null;
  view?: string | null;
}

export interface CastCharacter {
  id: string;
  name: string;
  /** All their images (sheet and photos), in their arranged order. */
  images: { assetId: string; view: string }[];
}

/**
 * Marks each image input with the character it shows (the first character
 * named, when an image is two characters'). `missing` names the characters
 * none of the images show: a character is in a run through their images.
 */
export function tagCast<T extends CastInput>(
  inputs: T[],
  characters: CastCharacter[],
): { inputs: T[]; missing: string[] } {
  const owners = new Map<string, { character: CastCharacter; view: string }>();
  for (const character of characters) {
    for (const image of character.images) {
      if (!owners.has(image.assetId)) owners.set(image.assetId, { character, view: image.view });
    }
  }
  const tagged = inputs.map((input) => {
    const owner = input.kind === "image" ? owners.get(input.asset_id) : undefined;
    return owner
      ? {
          ...input,
          character_id: owner.character.id,
          character_name: owner.character.name,
          view: owner.view,
        }
      : input;
  });
  const cast = new Set(tagged.flatMap((input) => (input.character_id ? [input.character_id] : [])));
  return {
    inputs: tagged,
    missing: characters
      .filter((character) => !cast.has(character.id))
      .map((character) => character.name),
  };
}

/** A run's characters as its inputs record them, in the order they first appear. */
export function castOfInputs(
  inputs: Array<CastInput & { media_id?: string | null }>,
): { id: string; name: string; images: { mediaId: string | null; view: string | null }[] }[] {
  const cast = new Map<
    string,
    { id: string; name: string; images: { mediaId: string | null; view: string | null }[] }
  >();
  for (const input of inputs) {
    if (!input.character_id) continue;
    const entry = cast.get(input.character_id) ?? {
      id: input.character_id,
      name: input.character_name?.trim() || "Character",
      images: [],
    };
    entry.images.push({ mediaId: input.media_id ?? null, view: input.view ?? null });
    cast.set(input.character_id, entry);
  }
  return [...cast.values()];
}
