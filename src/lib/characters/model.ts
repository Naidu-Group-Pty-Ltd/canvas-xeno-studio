/**
 * Characters: a person (or mascot) who must look the same in everything they
 * appear in. Each has a reference sheet (the images every clip and keyframe is
 * sent, best view first), photos a Soul ID can be trained on, and a short
 * description of the look that goes into every prompt.
 *
 * Shared by the characters pages, Create, Supercomputer and the server, so
 * all of them order, budget and describe characters the same way.
 */

export const CHARACTER_VIEWS = [
  "face",
  "front",
  "three_quarter",
  "side",
  "back",
  "outfit",
  "expression",
  "other",
] as const;
export type CharacterView = (typeof CHARACTER_VIEWS)[number];

export const VIEW_LABELS: Record<CharacterView, string> = {
  face: "Face close-up",
  front: "Full body, front",
  three_quarter: "Three-quarter",
  side: "Side profile",
  back: "From behind",
  outfit: "Outfit detail",
  expression: "Expression",
  other: "Other",
};

/**
 * Which images a model is sent first when it can't take them all: the face
 * carries identity best, then the whole figure and its clothes from the
 * front, then the other angles.
 */
const VIEW_PRIORITY: Record<CharacterView, number> = {
  face: 0,
  front: 1,
  three_quarter: 2,
  side: 3,
  back: 4,
  outfit: 5,
  expression: 6,
  other: 7,
};

/** sheet: sent with every clip and keyframe; photo: only for training a Soul ID. */
export const CHARACTER_IMAGE_ROLES = ["sheet", "photo"] as const;
export type CharacterImageRole = (typeof CHARACTER_IMAGE_ROLES)[number];

export const CHARACTER_LIMITS = {
  nameChars: 80,
  descriptionChars: 600,
  sheetImages: 12,
  photoImages: 40,
  /** Characters one long video can keep consistent. */
  perRun: 4,
  /**
   * Higgsfield trains on 1–100 images, but under five the likeness is
   * unreliable, and a dozen varied ones make a far better one.
   */
  soulMinImages: 5,
  soulRecommendedImages: 12,
  soulMaxImages: 100,
} as const;

/** The Soul family a Soul ID is trained for; each works only with its own model. */
export const SOUL_VERSIONS = ["v2", "cinema", "v1"] as const;
export type SoulVersion = (typeof SOUL_VERSIONS)[number];

/** The Soul model each Soul ID works with, by version (Higgsfield's model_version). */
export const SOUL_MODEL_PATHS: Record<SoulVersion, string> = {
  v2: "higgsfield-ai/soul/v2/standard",
  cinema: "higgsfield-ai/soul/cinema",
  v1: "higgsfield-ai/soul/standard",
};

export const SOUL_VERSION_LABELS: Record<SoulVersion, string> = {
  v2: "Soul 2",
  cinema: "Soul Cinema",
  v1: "Soul Standard",
};

/** The Soul ID version a model takes, if it is a Soul model. */
export function soulVersionFor(modelPath: string | null | undefined): SoulVersion | null {
  if (!modelPath) return null;
  return SOUL_VERSIONS.find((version) => SOUL_MODEL_PATHS[version] === modelPath) ?? null;
}

export type SoulStatus = "none" | "submitting" | "training" | "ready" | "failed" | "uncertain";

export interface CharacterImage {
  assetId: string;
  view: CharacterView;
  role: CharacterImageRole;
  position: number;
}

/** A character as plans and runs use it: who they are and their reference sheet. */
export interface RunCharacter {
  id: string;
  name: string;
  description: string;
  /** The reference sheet, best view first. */
  images: { assetId: string; view: CharacterView }[];
  /**
   * The Soul ID a still of them is best painted with (a run's opening frame),
   * when one is trained. Older runs kept none.
   */
  soul?: { version: SoulVersion; referenceId: string } | null;
}

/**
 * One of the team's characters as the Supercomputer is told about it: its
 * sheet as runs use it, the Soul ID it is best painted with, and every Soul
 * ID it has in use (one per Soul model).
 */
export interface CharacterSummary extends RunCharacter {
  soul: { version: SoulVersion; referenceId: string } | null;
  souls: {
    version: SoulVersion;
    referenceId: string;
    approved: boolean;
    likeness: number | null;
  }[];
}

/** A character's reference sheet, in the order it is sent: best view first, then as arranged. */
export function sheetOrder<T extends { view: CharacterView; position: number }>(images: T[]): T[] {
  return [...images].sort(
    (a, b) => VIEW_PRIORITY[a.view] - VIEW_PRIORITY[b.view] || a.position - b.position,
  );
}

/** A character as a run keeps it, from its stored images (sheet only, best view first). */
export function runCharacter(character: {
  id: string;
  name: string;
  description: string;
  images: CharacterImage[];
}): RunCharacter {
  return {
    id: character.id,
    name: character.name.trim(),
    description: character.description.trim(),
    images: sheetOrder(character.images.filter((image) => image.role === "sheet")).map((image) => ({
      assetId: image.assetId,
      view: image.view,
    })),
  };
}

/**
 * Several characters' sheets as one list, in the order they're sent when not
 * all fit: every character's best view before anyone's second, so each keeps
 * at least their face. `skip` leaves out images sent some other way.
 */
export function interleaveSheets(
  characters: RunCharacter[],
  skip: ReadonlySet<string> = new Set(),
): { assetId: string; characterId: string }[] {
  const queues = characters.map((character) =>
    character.images.filter((image) => !skip.has(image.assetId)),
  );
  const out: { assetId: string; characterId: string }[] = [];
  const seen = new Set<string>();
  for (let round = 0; queues.some((queue) => queue.length > round); round += 1) {
    queues.forEach((queue, index) => {
      const image = queue[round];
      if (!image || seen.has(image.assetId)) return;
      seen.add(image.assetId);
      out.push({ assetId: image.assetId, characterId: characters[index]!.id });
    });
  }
  return out;
}

/** A description cut to a length at a sentence (or word) boundary. */
export function trimDescription(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return `${cut.slice(0, word > max * 0.6 ? word : max).replace(/[,;:]$/, "")}…`;
}

/** How much of each description goes into a clip's prompt. */
const PROMPT_DESCRIPTION_CHARS = 360;

/**
 * The line every clip and keyframe prompt carries about its characters: who
 * they are and that they must not change. `images` names where each
 * character's reference images are, when the prompt can point at them.
 */
export function charactersLine(
  characters: Pick<RunCharacter, "id" | "name" | "description">[],
  options: {
    references: boolean;
    images?: Map<string, string> | undefined;
    /** How much of each description goes in (less where a model reads short prompts). */
    descriptionChars?: number;
  } = { references: false },
): string {
  if (!characters.length) return "";
  const people = characters
    .map((character) => {
      const look = character.description
        ? trimDescription(
            character.description,
            options.descriptionChars ?? PROMPT_DESCRIPTION_CHARS,
          ).replace(/\.$/, "")
        : "";
      const where = options.images?.get(character.id);
      return [character.name, where ? ` (shown in ${where})` : "", look ? `: ${look}` : ""].join(
        "",
      );
    })
    .join(". ");
  const keep = options.references
    ? `Keep ${characters.length > 1 ? "each character" : "them"} exactly as in their reference images: the same face, hair, build and clothes in every frame.`
    : `Keep ${characters.length > 1 ? "each character" : "them"} exactly the same in every frame: the same face, hair, build and clothes.`;
  return `${characters.length > 1 ? "Characters" : "Character"}: ${people}. ${keep}`;
}
