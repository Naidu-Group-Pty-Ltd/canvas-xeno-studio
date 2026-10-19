/**
 * Making a Soul ID worth relying on, before and after it is trained:
 *
 *  - the training set check: the studio's AI looks at the images it would be
 *    trained on (one face, sharp, uncovered, the same person, from several
 *    angles and lights) and says which to leave out and what's missing;
 *  - training packs: for a character who exists only as AI images, a set of
 *    varied photos of them painted from their reference sheet (each an
 *    ordinary, billed generation), scored for likeness, to train on;
 *  - the likeness proof: once trained, a few images made with the Soul ID
 *    alone, scored against the images it was trained on, for a person to
 *    approve.
 *
 * Checks and scores are free (the studio's AI); packs and proofs are billed
 * generations, started once each under their own request keys.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { ACTIVE_STATUSES, type ModelRegistryEntry } from "../model-schema";
import { SOUL_MODEL_PATHS, sheetOrder, type CharacterImageRole, type CharacterView } from "./model";
import {
  PACK_SHOTS,
  PROOF_SHOTS,
  likenessVerdict,
  packPrompt,
  packRequestKey,
  proofKeyPrefix,
  proofPrompt,
  proofRequestKey,
  storedLikeness,
  storedTrainingCheck,
  trainingImageCheck,
  trainingSetVerdict,
  TRAINING_ISSUES,
  type SoulLikeness,
  type TrainingImageCheck,
  type TrainingSetCheck,
  type VarietyLevel,
} from "./soul";

const db = supabaseAdmin;
const now = () => new Date().toISOString();

/** Images one training set check looks at (the AI reads them all at once). */
const CHECK_LIMIT = 24;

interface ImageFile {
  assetId: string;
  role: CharacterImageRole;
  view: CharacterView;
  position: number;
  bucket: string;
  path: string;
  metadata: Record<string, unknown>;
}

const STUDIO_BUCKETS = new Set(["generation-inputs", "generated-assets"]);
const IMAGE_MIME = /^image\/(jpe?g|png|webp|gif)$/;

/** A character's images with their files: only those still in the library, in the studio's own buckets. */
async function imageFiles(characterId: string): Promise<ImageFile[]> {
  const { data: rows, error } = await db
    .from("character_images")
    .select("asset_id,role,view,position")
    .eq("character_id", characterId)
    .order("position");
  if (error) throw new AppError("UNKNOWN", error.message);
  if (!rows?.length) return [];
  const { data: assets, error: assetsError } = await db
    .from("assets")
    .select("id,asset_type,mime_type,storage_bucket,storage_path,metadata")
    .in(
      "id",
      rows.map((row) => row.asset_id),
    )
    .is("deleted_at", null);
  if (assetsError) throw new AppError("UNKNOWN", assetsError.message);
  return rows.flatMap((row) => {
    const asset = (assets ?? []).find((entry) => entry.id === row.asset_id);
    if (
      !asset ||
      asset.asset_type !== "image" ||
      (asset.mime_type && !IMAGE_MIME.test(asset.mime_type)) ||
      !STUDIO_BUCKETS.has(asset.storage_bucket)
    )
      return [];
    return [
      {
        assetId: row.asset_id,
        role: (row.role === "photo" ? "photo" : "sheet") as CharacterImageRole,
        view: row.view as CharacterView,
        position: row.position,
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        metadata: (asset.metadata ?? {}) as Record<string, unknown>,
      },
    ];
  });
}

async function loadCharacter(characterId: string) {
  const { data, error } = await db
    .from("characters")
    .select("id,name,description,archived_at")
    .eq("id", characterId)
    .maybeSingle();
  if (error) throw new AppError("UNKNOWN", error.message);
  if (!data || data.archived_at)
    throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
  return data;
}

async function signed(bucket: string, path: string): Promise<string | null> {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}

/** Writes over what an asset's metadata holds now (others write to it too). */
async function mergeMetadata(assetId: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await db.from("assets").select("metadata").eq("id", assetId).maybeSingle();
  const current = (data?.metadata ?? {}) as Record<string, unknown>;
  await db
    .from("assets")
    .update({ metadata: { ...current, ...patch } as never })
    .eq("id", assetId);
}

/* ------------------------------------------------------------------ */
/* The training set check                                              */
/* ------------------------------------------------------------------ */

const CHECK_SYSTEM = `You check the images a Soul ID will be trained on. A Soul ID is a trained likeness of one person; it learns best from images that show that one person's face clearly, from several angles, in different light and with different expressions.

For each image, list its problems, using only these words:
- no_face: no human face is visible.
- multiple_faces: more than one person's face is clearly visible.
- face_too_small: the face is less than about a tenth of the image's height.
- blurry: the face is out of focus or motion-blurred.
- face_covered: a mask, hand, hair, scarf or object covers much of the face.
- sunglasses: sunglasses or tinted glasses hide the eyes.
- heavy_filter: beauty filters, heavy retouching or stylised colour change how the face looks.
- low_resolution: too small or pixelated to show facial detail.
- cropped_face: the frame cuts off part of the face.
- extreme_angle: the face is seen from far above or below, or the person faces away.
- different_person: not the same person as most of the images.
- text_or_watermark: text, captions or a watermark over the image.
- not_a_photo: a drawing, cartoon, painting or obvious 3D render (photographic AI images are fine).
List none when the image is good. Also say the image's angle (front, three_quarter, side, back) and framing (close_up, head_and_shoulders, waist_up, full_body).

Then judge the set as a whole: same_person (do they all show one person, apart from any you marked different_person?), lighting and expressions (how varied they are: low, ok or good), and at most three short pieces of advice that would make the set better (e.g. "Add a side profile", "Add photos in daylight").`;

const LEVELS = ["low", "ok", "good"];

const CHECK_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          image: { type: "number" },
          issues: { type: "array", items: { type: "string", enum: [...TRAINING_ISSUES] } },
          angle: { type: "string", enum: ["front", "three_quarter", "side", "back", "unknown"] },
          framing: {
            type: "string",
            enum: ["close_up", "head_and_shoulders", "waist_up", "full_body", "unknown"],
          },
        },
        required: ["image", "issues", "angle", "framing"],
      },
    },
    same_person: { type: "boolean" },
    lighting: { type: "string", enum: LEVELS },
    expressions: { type: "string", enum: LEVELS },
    advice: { type: "array", items: { type: "string" } },
  },
  required: ["images", "same_person", "lighting", "expressions", "advice"],
};

const level = (value: unknown): VarietyLevel =>
  value === "good" || value === "ok" ? value : "low";

/**
 * Checks the images a Soul ID would be trained on (those given, else all the
 * character's), keeping each image's verdict with it so the default training
 * set leaves out what's unusable. Free: the studio's AI.
 */
export async function checkTrainingSet(input: {
  characterId: string;
  assetIds?: string[] | undefined;
}): Promise<TrainingSetCheck> {
  const character = await loadCharacter(input.characterId);
  const files = await imageFiles(input.characterId);
  const wanted = input.assetIds?.length ? new Set(input.assetIds) : null;
  const set = (wanted ? files.filter((file) => wanted.has(file.assetId)) : files).slice(
    0,
    CHECK_LIMIT,
  );
  if (!set.length) throw new AppError("INVALID_PARAMETERS", "There are no images to check");
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("qc");
  if (!route)
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Checking images needs an AI model. Add an OPENAI_API_KEY backend secret or enable Lovable AI for this project.",
    );
  const shown: { file: ImageFile; url: string }[] = [];
  for (const file of set) {
    const url = await signed(file.bucket, file.path);
    if (url) shown.push({ file, url });
  }
  if (!shown.length) throw new AppError("STORAGE_FAILED", "The images couldn't be read");
  const result = await route.provider.generateStructured<{
    images?: { image?: number; issues?: unknown; angle?: unknown; framing?: unknown }[];
    same_person?: boolean;
    lighting?: unknown;
    expressions?: unknown;
    advice?: unknown;
  }>({
    system: CHECK_SYSTEM,
    input: [
      `PERSON: ${character.name}`,
      character.description.trim() ? `THEIR LOOK: ${character.description.trim()}` : "",
      `IMAGES: ${shown.length}, numbered in order from 1.`,
    ]
      .filter(Boolean)
      .join("\n"),
    schemaName: "soul_training_set",
    schema: CHECK_SCHEMA,
    model: route.model,
    images: shown.map((entry) => entry.url),
    timeoutMs: 90_000,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "The images couldn't be checked. Try again.",
    );
  const checkedAt = now();
  const images: Record<string, TrainingImageCheck> = {};
  for (const [index, entry] of shown.entries()) {
    const answer = (result.data.images ?? []).find((item) => Number(item.image) === index + 1);
    // An image the AI said nothing about keeps the verdict it had, if any.
    const check = answer
      ? trainingImageCheck({
          issues: answer.issues,
          angle: answer.angle,
          framing: answer.framing,
          checkedAt,
        })
      : storedTrainingCheck(entry.file.metadata);
    if (!check) continue;
    images[entry.file.assetId] = check;
    if (answer)
      await mergeMetadata(entry.file.assetId, {
        soul_check: {
          usable: check.usable,
          issues: check.issues,
          angle: check.angle,
          framing: check.framing,
          checked_at: check.checkedAt,
        },
      });
  }
  return trainingSetVerdict({
    images,
    samePerson: result.data.same_person !== false,
    lighting: level(result.data.lighting),
    expressions: level(result.data.expressions),
    advice: Array.isArray(result.data.advice)
      ? (result.data.advice as unknown[])
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.slice(0, 160))
      : [],
    model: result.model ?? route.model,
    checkedAt,
  });
}

/* ------------------------------------------------------------------ */
/* Training packs                                                      */
/* ------------------------------------------------------------------ */

/** How many images a training pack can have. */
export const PACK_SIZES = [8, 12, 16] as const;

/** The image model a pack is painted with: one that takes the sheet as references, best first. */
export async function packPainter(modelId?: string | null): Promise<ModelRegistryEntry | null> {
  const { activeModels } = await import("../supercomputer/agent.server");
  const { keyframePainters, painterFits } = await import("../long-video/keyframes");
  const painters = keyframePainters(await activeModels()).filter((model) =>
    painterFits(model, 3 / 4),
  );
  return (modelId ? painters.find((model) => model.id === modelId) : painters[0]) ?? null;
}

/**
 * Paints a training pack: `count` varied photos of the character from their
 * reference sheet, each an ordinary generation (billed) under the pack's own
 * request keys, so a repeated request starts nothing twice. They land in the
 * library like any generation; a person adds the good ones to the
 * character's training photos.
 */
export async function startTrainingPack(input: {
  characterId: string;
  userId: string;
  count: number;
  modelId?: string | null | undefined;
  packId?: string | null | undefined;
}): Promise<{ packId: string; started: number; modelName: string }> {
  const character = await loadCharacter(input.characterId);
  const sheet = sheetOrder(
    (await imageFiles(input.characterId)).filter((file) => file.role === "sheet"),
  );
  if (!sheet.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A training pack is painted from the reference sheet: add some sheet images first",
    );
  const painter = await packPainter(input.modelId);
  if (!painter)
    throw new AppError(
      "INVALID_PARAMETERS",
      "No image model that takes reference images is available",
    );
  const { assertGenerationAllowed, createAndSubmitGeneration } =
    await import("../generation-create.server");
  const { painterValues, painterSlot } = await import("../long-video/keyframes");
  await assertGenerationAllowed(input.userId);
  const count = Math.max(1, Math.min(16, Math.round(input.count)));
  const packId = input.packId ?? crypto.randomUUID();
  const slot = painterSlot(painter);
  const references = sheet.slice(0, slot?.max ?? 4);
  const values = painterValues(painter, 3 / 4);
  let started = 0;
  for (let index = 0; index < count; index += 1) {
    const shot = PACK_SHOTS[index % PACK_SHOTS.length]!;
    try {
      await createAndSubmitGeneration({
        userId: input.userId,
        model: painter,
        parameters: { ...values, prompt: packPrompt(shot, character) },
        inputs: references.map((file, position) => ({
          assetId: file.assetId,
          role: slot?.role ?? "reference",
          position,
        })),
        generationGroupId: packId,
        clientRequestId: packRequestKey(input.characterId, packId, index),
      });
      started += 1;
    } catch (error) {
      // The ones started go on; the rest aren't tried (out of credits, over a limit).
      if (!started) throw error;
      console.error("training pack stopped early", {
        characterId: input.characterId,
        packId,
        started,
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return { packId, started, modelName: painter.display_name };
}

/**
 * Scores images (a training pack's, say) for likeness against the
 * character's reference sheet, keeping each score with its image
 * (assets.metadata.likeness_check). Free: the studio's AI.
 */
export async function scoreCharacterImages(input: {
  characterId: string;
  assetIds: string[];
}): Promise<{ perImage: { assetId: string; score: number; notes: string }[]; summary: string }> {
  const character = await loadCharacter(input.characterId);
  const files = await imageFiles(input.characterId);
  const references = [
    ...files.filter((file) => file.role === "photo"),
    ...sheetOrder(files.filter((file) => file.role === "sheet")),
  ].filter((file) => !input.assetIds.includes(file.assetId));
  const { data: candidates, error } = await db
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path")
    .in("id", input.assetIds.slice(0, 12))
    .is("deleted_at", null);
  if (error) throw new AppError("UNKNOWN", error.message);
  const { scoreLikeness } = await import("./likeness.server");
  const scored = await scoreLikeness({
    name: character.name,
    references: references.map((file) => ({ bucket: file.bucket, path: file.path })),
    candidates: (candidates ?? [])
      .filter((asset) => asset.asset_type === "image")
      .map((asset) => ({
        assetId: asset.id,
        bucket: asset.storage_bucket,
        path: asset.storage_path,
      })),
  });
  if (!scored.ok) throw new AppError("PROVIDER_REJECTED", scored.message);
  const checkedAt = now();
  for (const entry of scored.perImage)
    await mergeMetadata(entry.assetId, {
      likeness_check: {
        character_id: input.characterId,
        score: Math.round(entry.score * 10) / 10,
        notes: entry.notes,
        checked_at: checkedAt,
      },
    });
  return { perImage: scored.perImage, summary: scored.summary };
}

/* ------------------------------------------------------------------ */
/* The likeness proof                                                  */
/* ------------------------------------------------------------------ */

async function soulModel(
  version: keyof typeof SOUL_MODEL_PATHS,
): Promise<ModelRegistryEntry | null> {
  const { data } = await db
    .from("model_registry")
    .select("*")
    .eq("model_path", SOUL_MODEL_PATHS[version])
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as ModelRegistryEntry | null) ?? null;
}

/**
 * Makes a Soul ID's likeness proof: a few images of the person from the Soul
 * ID alone (no description), each a billed generation under the proof's own
 * request keys. Once they're made, scoreSoulProof scores them.
 */
export async function startSoulProof(input: {
  soulId: string;
  userId: string;
}): Promise<{ round: string; started: number }> {
  const { loadSoul } = await import("./souls.server");
  const soul = await loadSoul(input.soulId);
  await loadCharacter(soul.characterId);
  const model = await soulModel(soul.version);
  if (!model) throw new AppError("INVALID_PARAMETERS", "That Soul model is no longer available");
  const { assertGenerationAllowed, createAndSubmitGeneration } =
    await import("../generation-create.server");
  const { soulStillValues } = await import("./views");
  await assertGenerationAllowed(input.userId);
  const round = crypto.randomUUID();
  const values = soulStillValues(model, 3 / 4, soul.referenceId);
  let started = 0;
  for (const [index, shot] of PROOF_SHOTS.entries()) {
    try {
      await createAndSubmitGeneration({
        userId: input.userId,
        model,
        parameters: { ...values, prompt: proofPrompt(shot) },
        inputs: [],
        generationGroupId: round,
        clientRequestId: proofRequestKey(soul.id, round, index),
      });
      started += 1;
    } catch (error) {
      if (!started) throw error;
      break;
    }
  }
  return { round, started };
}

/** The latest proof's images that are made (generations done, images in the library). */
async function latestProofImages(soulId: string) {
  const { data: generations, error } = await db
    .from("generations")
    .select("id,status,client_request_id,created_at")
    .like("client_request_id", `${proofKeyPrefix(soulId)}%`)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new AppError("UNKNOWN", error.message);
  const latest = generations?.[0]?.client_request_id?.split(":")[2] ?? null;
  if (!latest) return { round: null, pending: 0, images: [] };
  const round = (generations ?? []).filter(
    (generation) => generation.client_request_id?.split(":")[2] === latest,
  );
  const pending = round.filter((generation) =>
    (ACTIVE_STATUSES as readonly string[]).includes(generation.status),
  ).length;
  const { data: assets } = await db
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,generation_id")
    .in(
      "generation_id",
      round.map((generation) => generation.id),
    )
    .is("deleted_at", null);
  return {
    round: latest,
    pending,
    images: (assets ?? []).filter((asset) => asset.asset_type === "image"),
  };
}

/**
 * Scores a Soul ID's latest proof against the images it was trained on (or
 * the character's sheet, for one trained elsewhere) and keeps the result with
 * the Soul ID. Free: the studio's AI.
 */
export async function scoreSoulProof(input: { soulId: string }): Promise<SoulLikeness> {
  const { loadSoul } = await import("./souls.server");
  const soul = await loadSoul(input.soulId);
  const character = await loadCharacter(soul.characterId);
  const proof = await latestProofImages(soul.id);
  if (!proof.images.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      proof.pending ? "The proof images are still being made" : "Make a likeness proof first",
    );
  const files = await imageFiles(soul.characterId);
  const trained = new Set(soul.trainingAssetIds);
  const { data: trainingAssets } = trained.size
    ? await db
        .from("assets")
        .select("id,storage_bucket,storage_path")
        .in("id", [...trained])
        .is("deleted_at", null)
    : { data: [] as { id: string; storage_bucket: string; storage_path: string }[] };
  const references = (trainingAssets ?? []).length
    ? (trainingAssets ?? []).map((asset) => ({
        bucket: asset.storage_bucket,
        path: asset.storage_path,
      }))
    : [
        ...files.filter((file) => file.role === "photo"),
        ...sheetOrder(files.filter((file) => file.role === "sheet")),
      ].map((file) => ({ bucket: file.bucket, path: file.path }));
  const { scoreLikeness } = await import("./likeness.server");
  const scored = await scoreLikeness({
    name: character.name,
    references,
    candidates: proof.images.map((asset) => ({
      assetId: asset.id,
      bucket: asset.storage_bucket,
      path: asset.storage_path,
    })),
  });
  if (!scored.ok) throw new AppError("PROVIDER_REJECTED", scored.message);
  const score =
    scored.perImage.reduce((sum, entry) => sum + entry.score, 0) / scored.perImage.length;
  const likeness: SoulLikeness = {
    score,
    verdict: likenessVerdict(score),
    summary: scored.summary,
    assetIds: scored.perImage.map((entry) => entry.assetId),
    perImage: scored.perImage,
    model: scored.model,
    checkedAt: now(),
  };
  const { error } = await db
    .from("character_souls")
    .update({ likeness: storedLikeness(likeness) as never })
    .eq("id", soul.id);
  if (error) throw new AppError("UNKNOWN", error.message);
  return likeness;
}
