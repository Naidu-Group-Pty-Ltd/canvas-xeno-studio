/**
 * Soul IDs as the studio keeps them: a character can have one for each Soul
 * model at once (Soul 2 for images, Soul Cinema for film-look stills, Soul
 * Standard), each with the images it was trained on and how alike its images
 * come out. Shared by the characters pages, Create, the agent and the server,
 * so all of them choose a Soul ID, a training set and a verdict the same way.
 */
import {
  CHARACTER_LIMITS,
  SOUL_VERSIONS,
  sheetOrder,
  trimDescription,
  type CharacterImageRole,
  type CharacterView,
  type SoulVersion,
} from "./model";

export type SoulSource = "trained" | "attached" | "imported";

/** How alike a Soul ID's images come out: a few of them scored against the images it was trained on. */
export interface SoulLikeness {
  /** 0–10, by the studio's AI: 8 and up is the same person to any viewer. */
  score: number;
  verdict: "strong" | "fair" | "weak";
  summary: string;
  /** The Soul images that were scored. */
  assetIds: string[];
  perImage: { assetId: string; score: number; notes: string }[];
  model: string | null;
  checkedAt: string;
}

export interface CharacterSoul {
  id: string;
  characterId: string;
  version: SoulVersion;
  referenceId: string;
  source: SoulSource;
  active: boolean;
  imageCount: number | null;
  trainingAssetIds: string[];
  thumbnailUrl: string | null;
  likeness: SoulLikeness | null;
  approvedAt: string | null;
  readyAt: string;
}

/** A score's verdict: what people are told about a Soul ID's likeness. */
export function likenessVerdict(score: number): SoulLikeness["verdict"] {
  return score >= 7.5 ? "strong" : score >= 5.5 ? "fair" : "weak";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** A stored likeness proof, or null when there is none (or it can't be read). */
export function likenessOf(value: unknown): SoulLikeness | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const score = Number(record["score"]);
  if (!Number.isFinite(score)) return null;
  const perImage = Array.isArray(record["per_image"])
    ? (record["per_image"] as unknown[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        const itemScore = Number(item["score"]);
        return typeof item["asset_id"] === "string" && Number.isFinite(itemScore)
          ? [
              {
                assetId: item["asset_id"],
                score: itemScore,
                notes: typeof item["notes"] === "string" ? item["notes"] : "",
              },
            ]
          : [];
      })
    : [];
  const clamped = Math.max(0, Math.min(10, score));
  return {
    score: clamped,
    verdict: likenessVerdict(clamped),
    summary: typeof record["summary"] === "string" ? record["summary"] : "",
    assetIds: stringList(record["asset_ids"]),
    perImage,
    model: typeof record["model"] === "string" ? record["model"] : null,
    checkedAt: typeof record["checked_at"] === "string" ? record["checked_at"] : "",
  };
}

/** A likeness proof as it is stored. */
export function storedLikeness(likeness: SoulLikeness): Record<string, unknown> {
  return {
    score: Math.round(likeness.score * 10) / 10,
    verdict: likeness.verdict,
    summary: likeness.summary,
    asset_ids: likeness.assetIds,
    per_image: likeness.perImage.map((entry) => ({
      asset_id: entry.assetId,
      score: Math.round(entry.score * 10) / 10,
      notes: entry.notes,
    })),
    model: likeness.model,
    checked_at: likeness.checkedAt,
  };
}

/** A character_souls row as the studio uses it; null for one it can't read. */
export function soulOf(row: {
  id: string;
  character_id: string;
  model_version: string;
  reference_id: string;
  source: string;
  is_active: boolean;
  image_count: number | null;
  training_asset_ids: string[] | null;
  thumbnail_url: string | null;
  likeness: unknown;
  approved_at: string | null;
  ready_at: string;
}): CharacterSoul | null {
  if (!(SOUL_VERSIONS as readonly string[]).includes(row.model_version)) return null;
  return {
    id: row.id,
    characterId: row.character_id,
    version: row.model_version as SoulVersion,
    referenceId: row.reference_id,
    source: row.source === "attached" || row.source === "imported" ? row.source : "trained",
    active: row.is_active,
    imageCount: row.image_count,
    trainingAssetIds: row.training_asset_ids ?? [],
    thumbnailUrl: row.thumbnail_url,
    likeness: likenessOf(row.likeness),
    approvedAt: row.approved_at,
    readyAt: row.ready_at,
  };
}

/**
 * The Soul model each kind of work is best made with, best first: images
 * (portraits, product shots, a video's opening still) look most like the
 * person on Soul 2; film-look stills on Soul Cinema.
 */
const SOUL_PREFERENCE: Record<"image" | "film", SoulVersion[]> = {
  image: ["v2", "cinema", "v1"],
  film: ["cinema", "v2", "v1"],
};

/**
 * Which of a character's Soul IDs to use: the one for the version asked for,
 * else the best in use for the kind of work (an approved one before one whose
 * likeness hasn't been proven, then the preferred Soul model).
 */
export function pickSoul(
  souls: CharacterSoul[],
  options: { version?: SoulVersion | null; look?: "image" | "film" } = {},
): CharacterSoul | null {
  const active = souls.filter((soul) => soul.active);
  if (options.version) return active.find((soul) => soul.version === options.version) ?? null;
  const order = SOUL_PREFERENCE[options.look ?? "image"];
  const weak = (soul: CharacterSoul) => (soul.likeness?.verdict === "weak" ? 1 : 0);
  return (
    [...active].sort(
      (a, b) =>
        weak(a) - weak(b) ||
        (b.approvedAt ? 1 : 0) - (a.approvedAt ? 1 : 0) ||
        order.indexOf(a.version) - order.indexOf(b.version),
    )[0] ?? null
  );
}

/* ------------------------------------------------------------------ */
/* What a Soul ID is trained on                                        */
/* ------------------------------------------------------------------ */

/** How many images a Soul ID is trained on: Higgsfield takes 1–100; under five the likeness is unreliable. */
export const SOUL_TRAINING = {
  minImages: 5,
  recommendedImages: 12,
  maxImages: CHARACTER_LIMITS.soulMaxImages,
} as const;

/**
 * The images a Soul ID is trained on unless a person picks: the training
 * photos when there are enough of them (real photos make the truest
 * likeness), otherwise the photos and the reference sheet together.
 */
export function defaultTrainingSet(
  images: { assetId: string; role: CharacterImageRole; view: CharacterView; position: number }[],
  checks: Map<string, TrainingImageCheck> = new Map(),
): string[] {
  // An image the check found unusable is left out of the default set.
  const usable = images.filter((image) => checks.get(image.assetId)?.usable !== false);
  const photos = usable
    .filter((image) => image.role === "photo")
    .sort((a, b) => a.position - b.position);
  const sheet = sheetOrder(usable.filter((image) => image.role === "sheet"));
  const chosen = photos.length >= SOUL_TRAINING.minImages ? photos : [...photos, ...sheet];
  return chosen.slice(0, SOUL_TRAINING.maxImages).map((image) => image.assetId);
}

/* ------------------------------------------------------------------ */
/* The training set check                                              */
/* ------------------------------------------------------------------ */

export const TRAINING_ISSUES = [
  "no_face",
  "multiple_faces",
  "face_too_small",
  "blurry",
  "face_covered",
  "sunglasses",
  "heavy_filter",
  "low_resolution",
  "cropped_face",
  "extreme_angle",
  "different_person",
  "text_or_watermark",
  "not_a_photo",
] as const;
export type TrainingIssue = (typeof TRAINING_ISSUES)[number];

export const TRAINING_ISSUE_LABELS: Record<TrainingIssue, string> = {
  no_face: "No face",
  multiple_faces: "More than one person",
  face_too_small: "Face too small",
  blurry: "Blurry",
  face_covered: "Face covered",
  sunglasses: "Sunglasses",
  heavy_filter: "Heavy filter",
  low_resolution: "Low resolution",
  cropped_face: "Face cut off",
  extreme_angle: "Extreme angle",
  different_person: "A different person",
  text_or_watermark: "Text or watermark",
  not_a_photo: "Not photographic",
};

/** Issues that make an image unusable for training (the rest only weaken it). */
const BLOCKING: ReadonlySet<TrainingIssue> = new Set([
  "no_face",
  "multiple_faces",
  "different_person",
  "face_covered",
]);

export type TrainingAngle = "front" | "three_quarter" | "side" | "back" | "unknown";
export type TrainingFraming =
  "close_up" | "head_and_shoulders" | "waist_up" | "full_body" | "unknown";

/** One image's check, as kept with the image (assets.metadata.soul_check). */
export interface TrainingImageCheck {
  usable: boolean;
  issues: TrainingIssue[];
  angle: TrainingAngle;
  framing: TrainingFraming;
  checkedAt: string;
}

export type VarietyLevel = "low" | "ok" | "good";

/** What the check made of a whole training set. */
export interface TrainingSetCheck {
  verdict: "good" | "usable" | "weak";
  samePerson: boolean;
  usable: number;
  total: number;
  variety: {
    angles: VarietyLevel;
    lighting: VarietyLevel;
    expressions: VarietyLevel;
    framing: VarietyLevel;
  };
  advice: string[];
  images: Record<string, TrainingImageCheck>;
  model: string | null;
  checkedAt: string;
}

const ANGLES: readonly string[] = ["front", "three_quarter", "side", "back", "unknown"];
const FRAMINGS: readonly string[] = [
  "close_up",
  "head_and_shoulders",
  "waist_up",
  "full_body",
  "unknown",
];

/** An image's check from what the AI said of it: usable unless an issue rules it out. */
export function trainingImageCheck(input: {
  issues: unknown;
  angle: unknown;
  framing: unknown;
  checkedAt: string;
}): TrainingImageCheck {
  const issues = stringList(input.issues).filter((issue): issue is TrainingIssue =>
    (TRAINING_ISSUES as readonly string[]).includes(issue),
  );
  const angle =
    typeof input.angle === "string" && ANGLES.includes(input.angle) ? input.angle : "unknown";
  const framing =
    typeof input.framing === "string" && FRAMINGS.includes(input.framing)
      ? input.framing
      : "unknown";
  return {
    usable: !issues.some((issue) => BLOCKING.has(issue)),
    issues: [...new Set(issues)],
    angle: angle as TrainingAngle,
    framing: framing as TrainingFraming,
    checkedAt: input.checkedAt,
  };
}

/** An image's stored check (assets.metadata.soul_check), or null. */
export function storedTrainingCheck(metadata: unknown): TrainingImageCheck | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const check = (metadata as Record<string, unknown>)["soul_check"];
  if (!check || typeof check !== "object" || Array.isArray(check)) return null;
  const record = check as Record<string, unknown>;
  if (typeof record["checked_at"] !== "string") return null;
  return trainingImageCheck({
    issues: record["issues"],
    angle: record["angle"],
    framing: record["framing"],
    checkedAt: record["checked_at"],
  });
}

/** How varied a set is in one respect: how many different values it covers. */
function varietyOf(values: string[], good: number): VarietyLevel {
  const distinct = new Set(values.filter((value) => value !== "unknown")).size;
  return distinct >= good ? "good" : distinct >= 2 ? "ok" : "low";
}

/**
 * A whole set's verdict from its images' checks and what the AI said of the
 * set (whether it is one person, how varied its light and expressions are).
 * Good: at least the recommended number of usable images of one person from
 * several angles. Weak: too few usable images, or more than one person.
 */
export function trainingSetVerdict(input: {
  images: Record<string, TrainingImageCheck>;
  samePerson: boolean;
  lighting: VarietyLevel;
  expressions: VarietyLevel;
  advice: string[];
  model: string | null;
  checkedAt: string;
}): TrainingSetCheck {
  const checks = Object.values(input.images);
  const usable = checks.filter((check) => check.usable);
  const angles = varietyOf(
    usable.map((check) => check.angle),
    3,
  );
  const framing = varietyOf(
    usable.map((check) => check.framing),
    3,
  );
  const advice = [...input.advice];
  if (usable.length < SOUL_TRAINING.minImages)
    advice.unshift(
      `Only ${usable.length} usable image${usable.length === 1 ? "" : "s"}: a Soul ID needs at least ${SOUL_TRAINING.minImages}.`,
    );
  if (!input.samePerson)
    advice.unshift("The images don't all show the same person: take out the ones that differ.");
  if (angles === "low") advice.push("Add the face from other angles (three-quarter, side).");
  const verdict: TrainingSetCheck["verdict"] =
    !input.samePerson || usable.length < SOUL_TRAINING.minImages
      ? "weak"
      : usable.length >= SOUL_TRAINING.recommendedImages &&
          angles !== "low" &&
          input.lighting !== "low"
        ? "good"
        : "usable";
  return {
    verdict,
    samePerson: input.samePerson,
    usable: usable.length,
    total: checks.length,
    variety: { angles, lighting: input.lighting, expressions: input.expressions, framing },
    advice: [...new Set(advice)].slice(0, 6),
    images: input.images,
    model: input.model,
    checkedAt: input.checkedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Training packs and proofs: their request keys                       */
/* ------------------------------------------------------------------ */

const PACK_PREFIX = "soulpack:";
const PROOF_PREFIX = "soulproof:";

/** The request key of one image of a character's training pack. */
export function packRequestKey(characterId: string, packId: string, index: number): string {
  return `${PACK_PREFIX}${characterId}:${packId}:${index}`;
}

/** What the request keys of a character's training packs start with. */
export function packKeyPrefix(characterId: string): string {
  return `${PACK_PREFIX}${characterId}:`;
}

/** The pack and image a request key is for, if it is one of a character's pack images. */
export function packOfKey(
  key: string | null | undefined,
): { packId: string; index: number } | null {
  if (!key?.startsWith(PACK_PREFIX)) return null;
  const [, , packId, index] = key.split(":");
  const number = Number(index);
  return packId && Number.isInteger(number) ? { packId, index: number } : null;
}

/** The request key of one image of a Soul ID's likeness proof. */
export function proofRequestKey(soulId: string, round: string, index: number): string {
  return `${PROOF_PREFIX}${soulId}:${round}:${index}`;
}

/** What the request keys of a Soul ID's likeness proofs start with. */
export function proofKeyPrefix(soulId: string): string {
  return `${PROOF_PREFIX}${soulId}:`;
}

/** The shots a likeness proof is made of: varied enough that a weak likeness shows. */
export const PROOF_SHOTS = [
  "A head-and-shoulders portrait facing the camera, neutral expression, soft window light, plain light background.",
  "A three-quarter portrait, a warm natural smile, outdoors in golden-hour light, softly blurred background.",
  "A waist-up photo turned slightly to the side, mid-conversation, in a bright modern office.",
  "A close side profile in warm evening light, looking ahead, shallow depth of field.",
] as const;

/**
 * The shots a training pack is made of: one person from many angles, in
 * different light, expressions and framings, so the likeness Higgsfield
 * learns is the person's, not one photo's.
 */
export const PACK_SHOTS = [
  "A head-and-shoulders portrait facing the camera, neutral relaxed expression, soft even studio light, plain light-grey background.",
  "A head-and-shoulders portrait turned three-quarters to the left, a gentle smile, soft window light.",
  "A head-and-shoulders portrait turned three-quarters to the right, serious expression, soft daylight.",
  "A close side profile facing left, calm expression, even light, plain background.",
  "A close-up of the face, laughing naturally, warm indoor light.",
  "A waist-up photo facing the camera, arms relaxed, bright overcast daylight outdoors.",
  "A head-and-shoulders portrait looking slightly down, thoughtful expression, warm lamp light, indoors.",
  "A head-and-shoulders portrait looking slightly up, confident expression, cool blue evening light.",
  "A full-body photo standing facing the camera, natural pose, plain studio background.",
  "A waist-up photo turned three-quarters to the right, mid-sentence, in a modern office.",
  "A head-and-shoulders portrait, surprised expression, bright natural light.",
  "A close-up of the face, eyes to the camera, soft golden-hour light outdoors.",
  "A head-and-shoulders portrait from a slightly high angle, friendly smile, soft light, home interior.",
  "A head-and-shoulders portrait from a slightly low angle, neutral expression, overcast city street.",
  "A side profile facing right, looking into the distance, warm backlight.",
  "A waist-up photo, relaxed smile, sitting at a café table, natural light.",
] as const;

/**
 * What a training pack image is painted from: the person's reference sheet
 * (as reference images) and one shot. Clothes may change (a likeness learnt
 * from one outfit clings to it); the face, age, hair and build may not.
 */
export function packPrompt(shot: string, character: { description: string }): string {
  const look = character.description.trim()
    ? trimDescription(character.description, 300).replace(/\.$/, "")
    : "";
  return [
    `The reference images show one person. Make a new, natural photo of exactly the same person: the same face, age, skin tone, hair and build${look ? ` (${look})` : ""}.`,
    shot,
    "They may wear different everyday clothes. Photorealistic, natural skin texture, sharp focus on the face, one person only, no text, logos or watermarks.",
  ].join(" ");
}

/**
 * What a likeness proof image is made from: only the shot. The person's look
 * isn't described, so the likeness comes from the Soul ID alone and a weak
 * one shows.
 */
export function proofPrompt(shot: string): string {
  return `A photo of this person. ${shot} Photorealistic, natural skin texture, sharp focus.`;
}

/**
 * What a still of a character is painted from on their Soul model, as the
 * frame a video starts from: the scene as the video's prompt describes it,
 * with their look for the clothes (the Soul ID carries the face), as one
 * photographic frame.
 */
export function soulStillPrompt(scene: string, character: { description: string }): string {
  const look = character.description.trim()
    ? trimDescription(character.description, 300).replace(/\.$/, "")
    : "";
  const shot = scene.replace(/\s+/g, " ").trim().slice(0, 1500);
  return [
    `A photo of this person${look ? `: ${look}` : ""}.`,
    shot,
    "One still frame of film, natural photographic detail and light, no text, captions or logos.",
  ]
    .filter(Boolean)
    .join(" ");
}
