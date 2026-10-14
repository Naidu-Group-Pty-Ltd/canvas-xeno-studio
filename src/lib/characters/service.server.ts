/**
 * Characters on the server: the team's library of people and mascots who must
 * look the same wherever they appear. Every change goes through here (the
 * browser only reads), so names, images and limits are checked once, and a
 * Soul ID (Higgsfield's trained character reference, billed) is started at
 * most once per request and never retried on its own.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import {
  CHARACTER_IMAGE_ROLES,
  CHARACTER_LIMITS,
  CHARACTER_VIEWS,
  runCharacter,
  type CharacterImageRole,
  type CharacterSummary,
  type CharacterView,
  type RunCharacter,
  type SoulVersion,
} from "./model";

type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];

const db = supabaseAdmin;
const now = () => new Date().toISOString();

/** Images the provider can take as references (and train a Soul ID on). */
const IMAGE_MIME = /^image\/(jpe?g|png|webp|gif)$/;

/**
 * Where the studio's own images live (uploads, and results). Nothing else is
 * read on a character's behalf: the server reads with full access, so a file
 * of another feature's (another person's training media) must never get in.
 */
const STUDIO_BUCKETS = new Set(["generation-inputs", "generated-assets"]);

/** An image a character can use: one the provider takes, from the studio's own files. */
function usableImage(asset: {
  asset_type: string;
  mime_type: string | null;
  storage_bucket: string;
}): boolean {
  return (
    asset.asset_type === "image" &&
    (!asset.mime_type || IMAGE_MIME.test(asset.mime_type)) &&
    STUDIO_BUCKETS.has(asset.storage_bucket)
  );
}

const TABLES_MISSING =
  "Characters need a database update (migration 0011_characters_and_keyframes). Ask an admin to apply it.";

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|could not find the table/i.test(error.message ?? ""))
  );
}

function fail(error: { code?: string; message?: string } | null, fallback: string): never {
  if (isMissingTable(error)) throw new AppError("UNKNOWN", TABLES_MISSING);
  throw new AppError("UNKNOWN", error?.message ?? fallback);
}

async function loadCharacter(id: string): Promise<CharacterRow> {
  const { data, error } = await db.from("characters").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "The character couldn't be read");
  if (!data || data.archived_at)
    throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
  return data;
}

function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) throw new AppError("INVALID_PARAMETERS", "Give the character a name");
  return clean.slice(0, CHARACTER_LIMITS.nameChars);
}

function cleanDescription(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, CHARACTER_LIMITS.descriptionChars);
}

/* ------------------------------------------------------------------ */
/* The character itself                                                */
/* ------------------------------------------------------------------ */

export async function createCharacter(input: {
  userId: string;
  name: string;
  description: string;
}): Promise<{ id: string }> {
  const { data, error } = await db
    .from("characters")
    .insert({
      name: cleanName(input.name),
      description: cleanDescription(input.description),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) fail(error, "The character couldn't be created");
  return { id: data.id };
}

export async function updateCharacter(input: {
  id: string;
  name?: string | undefined;
  description?: string | undefined;
}): Promise<void> {
  await loadCharacter(input.id);
  const patch: Database["public"]["Tables"]["characters"]["Update"] = {};
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.description !== undefined) patch.description = cleanDescription(input.description);
  if (!Object.keys(patch).length) return;
  const { error } = await db.from("characters").update(patch).eq("id", input.id);
  if (error) fail(error, "The character couldn't be saved");
}

/** Takes a character out of the library. Its images stay in the library; runs keep their own copy. */
export async function archiveCharacter(id: string): Promise<void> {
  await loadCharacter(id);
  const { error } = await db.from("characters").update({ archived_at: now() }).eq("id", id);
  if (error) fail(error, "The character couldn't be removed");
}

/* ------------------------------------------------------------------ */
/* Its images                                                          */
/* ------------------------------------------------------------------ */

interface ImageRow {
  asset_id: string;
  role: string;
  view: string;
  position: number;
}

/**
 * A character's images, in order: only those still in the library (an image
 * deleted there is left out everywhere, and doesn't count against the limits).
 */
async function imagesOf(characterId: string): Promise<ImageRow[]> {
  const { data, error } = await db
    .from("character_images")
    .select("asset_id,role,view,position")
    .eq("character_id", characterId)
    .order("position");
  if (error) fail(error, "The character's images couldn't be read");
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: live, error: liveError } = await db
    .from("assets")
    .select("id")
    .in(
      "id",
      rows.map((row) => row.asset_id),
    )
    .is("deleted_at", null);
  if (liveError) fail(liveError, "The character's images couldn't be read");
  const ids = new Set((live ?? []).map((asset) => asset.id));
  return rows.filter((row) => ids.has(row.asset_id));
}

const ROLE_LIMIT: Record<CharacterImageRole, number> = {
  sheet: CHARACTER_LIMITS.sheetImages,
  photo: CHARACTER_LIMITS.photoImages,
};

/** Adds library images to a character, checked: images the provider takes, within the limits. */
export async function addCharacterImages(input: {
  characterId: string;
  userId: string;
  images: { assetId: string; role: CharacterImageRole; view: CharacterView }[];
}): Promise<{ added: number }> {
  await loadCharacter(input.characterId);
  const existing = await imagesOf(input.characterId);
  const have = new Set(existing.map((row) => row.asset_id));
  const wanted = input.images.filter(
    (image, index, list) =>
      !have.has(image.assetId) &&
      list.findIndex((other) => other.assetId === image.assetId) === index,
  );
  if (!wanted.length) return { added: 0 };

  const { data: assets, error } = await db
    .from("assets")
    .select("id,asset_type,mime_type,title,storage_bucket")
    .in(
      "id",
      wanted.map((image) => image.assetId),
    )
    .is("deleted_at", null);
  if (error) fail(error, "The images couldn't be read");
  for (const image of wanted) {
    const asset = (assets ?? []).find((row) => row.id === image.assetId);
    if (!asset) throw new AppError("INVALID_PARAMETERS", "An image is no longer in the library");
    if (asset.asset_type !== "image")
      throw new AppError("INVALID_PARAMETERS", `${asset.title ?? "A file"} isn't an image`);
    if (asset.mime_type && !IMAGE_MIME.test(asset.mime_type))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "An image"} is ${asset.mime_type}; use a JPEG, PNG, WebP or GIF`,
      );
    if (!usableImage(asset))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${asset.title ?? "That image"} isn't one of the studio's own files; upload it, or use one from the library`,
      );
  }
  for (const role of CHARACTER_IMAGE_ROLES) {
    const count =
      existing.filter((row) => row.role === role).length +
      wanted.filter((image) => image.role === role).length;
    if (count > ROLE_LIMIT[role])
      throw new AppError(
        "INVALID_PARAMETERS",
        role === "sheet"
          ? `A reference sheet holds at most ${ROLE_LIMIT.sheet} images`
          : `A character holds at most ${ROLE_LIMIT.photo} training photos`,
      );
  }

  let position = existing.reduce((max, row) => Math.max(max, row.position + 1), 0);
  const { error: insertError } = await db.from("character_images").insert(
    wanted.map((image) => ({
      character_id: input.characterId,
      asset_id: image.assetId,
      role: image.role,
      view: image.view,
      position: position++,
      added_by: input.userId,
    })),
  );
  if (insertError) {
    // Added a moment ago by a second click: nothing more to do.
    if (insertError.code === "23505") return { added: 0 };
    fail(insertError, "The images couldn't be added");
  }
  await touch(input.characterId);
  return { added: wanted.length };
}

/** Changes what an image is (its view), where it goes (sheet or training photos), or its place. */
export async function updateCharacterImage(input: {
  characterId: string;
  assetId: string;
  role?: CharacterImageRole | undefined;
  view?: CharacterView | undefined;
}): Promise<void> {
  await loadCharacter(input.characterId);
  const existing = await imagesOf(input.characterId);
  const row = existing.find((entry) => entry.asset_id === input.assetId);
  if (!row) throw new AppError("INVALID_PARAMETERS", "That image isn't on this character");
  if (input.role && input.role !== row.role) {
    const count = existing.filter((entry) => entry.role === input.role).length + 1;
    if (count > ROLE_LIMIT[input.role])
      throw new AppError(
        "INVALID_PARAMETERS",
        input.role === "sheet"
          ? `A reference sheet holds at most ${ROLE_LIMIT.sheet} images`
          : `A character holds at most ${ROLE_LIMIT.photo} training photos`,
      );
  }
  const patch: Database["public"]["Tables"]["character_images"]["Update"] = {};
  if (input.role) patch.role = input.role;
  if (input.view) patch.view = input.view;
  if (!Object.keys(patch).length) return;
  const { error } = await db
    .from("character_images")
    .update(patch)
    .eq("character_id", input.characterId)
    .eq("asset_id", input.assetId);
  if (error) fail(error, "The image couldn't be changed");
  await touch(input.characterId);
}

/** The order images are arranged in (within each view, it is the order they're sent). */
export async function reorderCharacterImages(input: {
  characterId: string;
  assetIds: string[];
}): Promise<void> {
  await loadCharacter(input.characterId);
  const existing = await imagesOf(input.characterId);
  const order = [
    ...input.assetIds.filter((id) => existing.some((row) => row.asset_id === id)),
    ...existing.map((row) => row.asset_id).filter((id) => !input.assetIds.includes(id)),
  ];
  for (const [position, assetId] of order.entries()) {
    const row = existing.find((entry) => entry.asset_id === assetId);
    if (!row || row.position === position) continue;
    const { error } = await db
      .from("character_images")
      .update({ position })
      .eq("character_id", input.characterId)
      .eq("asset_id", assetId);
    if (error) fail(error, "The images couldn't be reordered");
  }
  await touch(input.characterId);
}

/** Takes an image off a character. It stays in the library. */
export async function removeCharacterImage(input: {
  characterId: string;
  assetId: string;
}): Promise<void> {
  await loadCharacter(input.characterId);
  const { error } = await db
    .from("character_images")
    .delete()
    .eq("character_id", input.characterId)
    .eq("asset_id", input.assetId);
  if (error) fail(error, "The image couldn't be removed");
  await touch(input.characterId);
}

/** Marks a character changed, so everyone's view of it refreshes. */
async function touch(characterId: string): Promise<void> {
  await db.from("characters").update({ updated_at: now() }).eq("id", characterId);
}

/* ------------------------------------------------------------------ */
/* For long videos                                                     */
/* ------------------------------------------------------------------ */

/**
 * Characters as a run uses them: in the order asked, each with its reference
 * sheet (images still in the library, best view first). Throws when one is
 * gone or has no sheet, so a run never starts without what it was set up with.
 */
export async function charactersForRun(ids: string[]): Promise<RunCharacter[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  if (unique.length > CHARACTER_LIMITS.perRun)
    throw new AppError(
      "INVALID_PARAMETERS",
      `A video can keep at most ${CHARACTER_LIMITS.perRun} characters consistent`,
    );
  const { data: rows, error } = await db
    .from("characters")
    .select("id,name,description,archived_at")
    .in("id", unique);
  if (error) fail(error, "The characters couldn't be read");
  const sheets = await withSheets((rows ?? []).filter((row) => !row.archived_at));
  return unique.map((id) => {
    const character = sheets.find((entry) => entry.id === id);
    if (!character)
      throw new AppError("INVALID_PARAMETERS", "A character is no longer in the library");
    if (!character.images.length)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${character.name} has no reference images yet. Add some on the Characters page.`,
      );
    return character;
  });
}

/** Characters as runs use them: their reference sheets, only images still in the library. */
async function withSheets(
  rows: { id: string; name: string; description: string }[],
): Promise<RunCharacter[]> {
  if (!rows.length) return [];
  // Only the sheets (a run never sends training photos): at most 12 a character.
  const { data: images, error: imagesError } = await db
    .from("character_images")
    .select("character_id,asset_id,role,view,position")
    .in(
      "character_id",
      rows.map((row) => row.id),
    )
    .eq("role", "sheet")
    .order("position");
  if (imagesError) fail(imagesError, "The characters' images couldn't be read");
  const assetIds = [...new Set((images ?? []).map((row) => row.asset_id))];
  const live = new Set<string>();
  // Read in pages: a long `in` list can pass what a request URL holds.
  for (let start = 0; start < assetIds.length; start += 150) {
    const { data: assets, error: assetsError } = await db
      .from("assets")
      .select("id,asset_type,mime_type,storage_bucket")
      .in("id", assetIds.slice(start, start + 150))
      .is("deleted_at", null);
    if (assetsError) fail(assetsError, "The characters' images couldn't be read");
    for (const asset of assets ?? []) if (usableImage(asset)) live.add(asset.id);
  }
  return rows.map((row) =>
    runCharacter({
      id: row.id,
      name: row.name,
      description: row.description,
      images: (images ?? [])
        .filter((image) => image.character_id === row.id && live.has(image.asset_id))
        .map((image) => ({
          assetId: image.asset_id,
          role: image.role as CharacterImageRole,
          view: (CHARACTER_VIEWS as readonly string[]).includes(image.view)
            ? (image.view as CharacterView)
            : "other",
          position: image.position,
        })),
    }),
  );
}

/**
 * The team's characters for the Supercomputer to cast, most recently changed
 * first: those with reference images or a trained Soul ID (nothing else can
 * keep them the same). None while the database doesn't have them yet.
 */
export async function charactersForAgent(limit = 40): Promise<CharacterSummary[]> {
  const { data: rows, error } = await db
    .from("characters")
    .select("id,name,description,soul_status,soul_model_version,soul_reference_id")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (isMissingTable(error)) return [];
  if (error) fail(error, "The characters couldn't be read");
  const sheets = await withSheets(rows ?? []);
  return (rows ?? []).flatMap((row) => {
    const sheet = sheets.find((entry) => entry.id === row.id);
    // The Soul ID in use (a newer one may be training, or have failed).
    const soul =
      row.soul_reference_id && row.soul_model_version
        ? { version: row.soul_model_version as SoulVersion, referenceId: row.soul_reference_id }
        : null;
    return sheet && (sheet.images.length || soul) ? [{ ...sheet, soul }] : [];
  });
}

/* ------------------------------------------------------------------ */
/* Describing a character with AI                                      */
/* ------------------------------------------------------------------ */

const DESCRIBE_SYSTEM = `You describe a person or character from reference images so AI image and video models can keep them identical in every shot.

Write "description": one or two compact sentences (at most 400 characters) of only what is visible and stays the same from shot to shot: apparent age range, build, skin tone, face (shape, notable features, eye colour if clear), hair (colour, length, texture, style), facial hair, and clothing (each garment with its colour, material or pattern) and accessories. Concrete visual facts only: no name, story, mood, pose, camera, lighting or background, and nothing you can't see.

Also label each image's "view": face (a head-and-shoulders close-up), front (full body facing the camera), three_quarter, side (profile), back (from behind), outfit (a close-up of the clothes), expression (a close-up showing an expression), or other.`;

const DESCRIBE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    description: { type: "string" },
    views: {
      type: "array",
      items: {
        type: "object",
        properties: {
          image: { type: "number" },
          view: { type: "string", enum: [...CHARACTER_VIEWS] },
        },
        required: ["image", "view"],
      },
    },
  },
  required: ["description", "views"],
};

/**
 * Has the studio's AI write a character's description from their images and
 * label the images whose view isn't set. Suggestions: saved, and editable.
 */
export async function describeCharacter(
  characterId: string,
): Promise<{ description: string; labelled: number }> {
  const character = await loadCharacter(characterId);
  const images = await imagesOf(characterId);
  if (!images.length)
    throw new AppError("INVALID_PARAMETERS", "Add a few images of the character first");
  const { resolveReasoning } = await import("../reasoning/provider.server");
  const route = await resolveReasoning("director");
  if (!route)
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Describing a character needs an AI model. Add an OPENAI_API_KEY backend secret or enable Lovable AI for this project.",
    );
  const ordered = [
    ...images.filter((row) => row.role === "sheet"),
    ...images.filter((row) => row.role !== "sheet"),
  ].slice(0, 8);
  const { data: assets } = await db
    .from("assets")
    .select("id,asset_type,storage_bucket,storage_path,title,mime_type,metadata")
    .in(
      "id",
      ordered.map((row) => row.asset_id),
    )
    .is("deleted_at", null);
  const agent = await import("../supercomputer/agent.server");
  const sources = ordered.flatMap((row) => {
    const asset = (assets ?? []).find((entry) => entry.id === row.asset_id);
    const source = asset && usableImage(asset) ? agent.visionSourceFor(asset) : null;
    return source ? [source] : [];
  });
  const vision = await agent.signVisionSources(sources);
  if (!vision.urls.length)
    throw new AppError("STORAGE_FAILED", "The character's images couldn't be read");

  const result = await route.provider.generateStructured<{
    description?: string;
    views?: { image?: number; view?: string }[];
  }>({
    system: DESCRIBE_SYSTEM,
    input: [
      `CHARACTER: ${character.name}`,
      character.description.trim()
        ? `CURRENT DESCRIPTION (keep what is right, correct the rest):\n${character.description.trim()}`
        : "",
      `IMAGES: ${vision.urls.length}, numbered in order from 1.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schemaName: "character_description",
    schema: DESCRIBE_SCHEMA,
    model: route.model,
    images: vision.urls,
    timeoutMs: 90_000,
  });
  if (!result.ok || !result.data)
    throw new AppError(
      "PROVIDER_REJECTED",
      result.errorMessage ?? "The character couldn't be described. Try again.",
    );
  const description = cleanDescription(String(result.data.description ?? ""));
  if (!description) throw new AppError("PROVIDER_REJECTED", "No description came back. Try again.");
  await updateCharacter({ id: characterId, description });

  // Views only where none is set: a person's own labels are never overwritten.
  let labelled = 0;
  for (const entry of result.data.views ?? []) {
    const source = vision.used[Number(entry.image) - 1];
    const view = String(entry.view ?? "");
    if (!source || !(CHARACTER_VIEWS as readonly string[]).includes(view) || view === "other")
      continue;
    const row = images.find((image) => image.asset_id === source.assetId);
    if (!row || row.view !== "other") continue;
    const { error } = await db
      .from("character_images")
      .update({ view })
      .eq("character_id", characterId)
      .eq("asset_id", row.asset_id)
      .eq("view", "other");
    if (!error) labelled += 1;
  }
  return { description, labelled };
}

/* ------------------------------------------------------------------ */
/* Soul ID                                                             */
/* ------------------------------------------------------------------ */

/**
 * A start cut short before its request went to Higgsfield (while the images
 * were uploading) was never sent, so nothing was charged; given this long, as
 * a hundred images can take minutes to upload.
 */
const UNSENT_STALE_MS = 15 * 60_000;
/** A start whose request went out but never came back (the server stopped mid-call) is uncertain after this long. */
const SENT_STALE_MS = 3 * 60_000;
/** A training Higgsfield hasn't finished in this long is no longer waited on (it may still finish). */
const TRAINING_STALE_MS = 6 * 60 * 60_000;
/** How often a training is asked about, at most. */
const CHECK_EVERY_MS = 45_000;

type CharacterUpdate = Database["public"]["Tables"]["characters"]["Update"];

/**
 * Writes what a training request came to, to its own row only (its request
 * key), tried again a few times: the answer to a billed request must not be
 * lost to a passing database error. Logged either way, so it can be found.
 */
async function settleTraining(
  characterId: string,
  key: string,
  patch: CharacterUpdate,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await db
      .from("characters")
      .update(patch)
      .eq("id", characterId)
      .eq("soul_request_key", key);
    if (!error) {
      console.info("soul id training settled", {
        characterId,
        key,
        status: patch.soul_status,
        trainingId: patch.soul_training_id,
      });
      return;
    }
    if (attempt === 3) {
      console.error("soul id training result not saved", {
        characterId,
        key,
        patch,
        message: error.message,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

/**
 * Trains a Soul ID on the character's images (sheet and training photos).
 * Billed by Higgsfield. Started once per request: a start whose answer was
 * unclear is never repeated on its own, as it may already be training (and
 * charging); a person confirms before it is tried again. The Soul ID in use
 * stays in use until the new one is ready, and after a training that fails.
 */
export async function trainSoulId(input: {
  characterId: string;
  userId: string;
  version: SoulVersion;
  confirmUncertain: boolean;
}): Promise<{ status: string }> {
  const character = await loadCharacter(input.characterId);
  if (character.soul_status === "submitting" || character.soul_status === "training")
    throw new AppError(
      "INVALID_PARAMETERS",
      "A Soul ID is already being trained for this character",
    );
  if (character.soul_status === "uncertain" && !input.confirmUncertain)
    throw new AppError(
      "SUBMISSION_UNCERTAIN",
      "Higgsfield's answer to the last training was unclear, so it may still be training. Check Higgsfield first: training again may be charged twice.",
    );

  const { assertGenerationAllowed } = await import("../generation-create.server");
  await assertGenerationAllowed(input.userId);

  const images = await imagesOf(input.characterId);
  const { data: assets, error: assetsError } = images.length
    ? await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,mime_type")
        .in(
          "id",
          images.map((row) => row.asset_id),
        )
        .is("deleted_at", null)
    : { data: [], error: null };
  if (assetsError) fail(assetsError, "The character's images couldn't be read");
  const usable = images
    .flatMap((row) => {
      const asset = (assets ?? []).find((entry) => entry.id === row.asset_id);
      return asset && usableImage(asset) ? [asset] : [];
    })
    .slice(0, CHARACTER_LIMITS.soulMaxImages);
  if (usable.length < CHARACTER_LIMITS.soulMinImages)
    throw new AppError("INVALID_PARAMETERS", "Add images of the character before training");

  // Claimed first, under a key of its own, from exactly the training it
  // follows: a second click (or a second person) finds it taken, and the
  // provider sees the same key on a repeat.
  const key = crypto.randomUUID();
  const claim = db
    .from("characters")
    .update({
      soul_status: "submitting",
      soul_request_key: key,
      soul_training_version: input.version,
      soul_training_id: null,
      soul_error: null,
      soul_requested_at: now(),
      soul_submitted_at: null,
      soul_checked_at: null,
      soul_image_count: usable.length,
    })
    .eq("id", input.characterId)
    .eq("soul_status", character.soul_status);
  const { data: claimed, error: claimError } = await (
    character.soul_request_key
      ? claim.eq("soul_request_key", character.soul_request_key)
      : claim.is("soul_request_key", null)
  ).select("id");
  if (claimError) fail(claimError, "The training couldn't be recorded");
  if (!claimed?.length)
    throw new AppError("INVALID_PARAMETERS", "Someone just started training this character");

  const settle = (patch: CharacterUpdate) => settleTraining(input.characterId, key, patch);

  // The images go up to Higgsfield first; nothing is billed if that fails.
  let urls: string[];
  try {
    const { providerMediaUrl } = await import("../generation-pipeline.server");
    urls = [];
    for (const asset of usable)
      urls.push(
        await providerMediaUrl({
          assetId: asset.id,
          bucket: asset.storage_bucket,
          path: asset.storage_path,
          mimeType: asset.mime_type,
        }),
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The images couldn't be uploaded";
    await settle({ soul_status: "failed", soul_error: `Nothing was charged: ${message}` });
    throw error instanceof AppError ? error : new AppError("UPLOAD_FAILED", message);
  }

  // Marked sent just before it is: a start the sweep has meanwhile given up
  // on (as cut short, nothing charged) is never sent after all.
  const { data: sending } = await db
    .from("characters")
    .update({ soul_submitted_at: now() })
    .eq("id", input.characterId)
    .eq("soul_request_key", key)
    .eq("soul_status", "submitting")
    .select("id");
  if (!sending?.length)
    throw new AppError(
      "UNKNOWN",
      "The training was stopped before it was sent to Higgsfield, so nothing was charged. Try again.",
    );

  const { createCustomReference, readCustomReference } =
    await import("../higgsfield/provider.server");
  const call = await createCustomReference(
    { name: character.name, modelVersion: input.version, imageUrls: urls },
    key,
  );
  if (call.uncertain || call.status === 0 || call.status >= 500) {
    await settle({
      soul_status: "uncertain",
      soul_error:
        call.errorMessage ??
        "Higgsfield didn't answer clearly, so the training may or may not have started.",
    });
    return { status: "uncertain" };
  }
  if (!call.ok) {
    await settle({
      soul_status: "failed",
      soul_error: call.errorMessage ?? "Higgsfield refused the training",
    });
    throw new AppError(
      (call.errorCode as never) ?? "PROVIDER_REJECTED",
      call.errorMessage ?? "Higgsfield refused the training",
    );
  }
  const reference = readCustomReference(call.data);
  if (!reference) {
    // Kept as Higgsfield said it, so the training can be found there.
    await settle({
      soul_status: "uncertain",
      soul_error: `Higgsfield accepted the training but didn't say which character it made. Its answer: ${call.raw.slice(0, 500)}`,
    });
    return { status: "uncertain" };
  }
  await settle({
    soul_training_id: reference.id,
    soul_checked_at: now(),
    ...(reference.state === "ready"
      ? {
          soul_status: "ready",
          soul_reference_id: reference.id,
          soul_model_version: input.version,
          soul_ready_at: now(),
        }
      : reference.state === "failed"
        ? { soul_status: "failed", soul_error: reference.message ?? "Higgsfield couldn't train it" }
        : { soul_status: "training" }),
  });
  return { status: reference.state };
}

/**
 * Asks Higgsfield how a character's training is going, at most every so
 * often; a ready one becomes the Soul ID in use. Starts cut short are
 * settled, and a training that never finishes stops being waited on.
 */
export async function refreshSoulId(
  characterId: string,
  options: { force?: boolean } = {},
): Promise<{ status: string }> {
  const { data: row, error } = await db
    .from("characters")
    .select(
      "id,soul_status,soul_training_id,soul_training_version,soul_model_version,soul_checked_at,soul_requested_at,soul_submitted_at,soul_request_key",
    )
    .eq("id", characterId)
    .maybeSingle();
  if (error) fail(error, "The character couldn't be read");
  if (!row) throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
  // Every write below is to this training only (its key and state as read).
  const fenced = <
    T extends {
      eq: (column: "soul_request_key", value: string) => T;
      is: (column: "soul_request_key", value: null) => T;
    },
  >(
    query: T,
  ) =>
    row.soul_request_key
      ? query.eq("soul_request_key", row.soul_request_key)
      : query.is("soul_request_key", null);

  if (row.soul_status === "submitting") {
    // A start cut short (the server stopped mid-call). Before its request went
    // out nothing was charged; after, it may be training.
    const sent = row.soul_submitted_at;
    const since = Date.now() - new Date(sent ?? row.soul_requested_at ?? 0).getTime();
    if (since <= (sent ? SENT_STALE_MS : UNSENT_STALE_MS)) return { status: "submitting" };
    const update = db
      .from("characters")
      .update(
        sent
          ? {
              soul_status: "uncertain",
              soul_error:
                "The training's start was interrupted after it was sent, so it may or may not be training.",
            }
          : {
              soul_status: "failed",
              soul_error:
                "The training's start was interrupted before it reached Higgsfield, so nothing was charged. Try again.",
            },
      )
      .eq("id", characterId)
      .eq("soul_status", "submitting");
    // Only as it was read: a start marked sent meanwhile is not failed as unsent.
    const { data: settled } = await fenced(
      sent ? update.not("soul_submitted_at", "is", null) : update.is("soul_submitted_at", null),
    ).select("id");
    if (!settled?.length) return { status: "submitting" };
    return { status: sent ? "uncertain" : "failed" };
  }
  if (row.soul_status !== "training" || !row.soul_training_id) return { status: row.soul_status };

  const started = new Date(row.soul_submitted_at ?? row.soul_requested_at ?? 0).getTime();
  if (Date.now() - started > TRAINING_STALE_MS) {
    const { data: settled } = await fenced(
      db
        .from("characters")
        .update({
          soul_status: "uncertain",
          soul_error:
            "Higgsfield hasn't finished this training in 6 hours, so it is no longer waited on. Check Higgsfield before training again.",
        })
        .eq("id", characterId)
        .eq("soul_status", "training"),
    ).select("id");
    return { status: settled?.length ? "uncertain" : "training" };
  }
  if (
    !options.force &&
    row.soul_checked_at &&
    Date.now() - new Date(row.soul_checked_at).getTime() < CHECK_EVERY_MS
  )
    return { status: "training" };

  const { getCustomReference, readCustomReference } = await import("../higgsfield/provider.server");
  const call = await getCustomReference(row.soul_training_id);
  if (!call.ok) {
    // A training Higgsfield says it doesn't have may be a passing fault on
    // its side: a person checks before it is trained (and charged) again.
    await fenced(
      db
        .from("characters")
        .update(
          call.status === 404
            ? {
                soul_checked_at: now(),
                soul_status: "uncertain",
                soul_error:
                  "Higgsfield says it has no such training. Check Higgsfield before training again.",
              }
            : { soul_checked_at: now() },
        )
        .eq("id", characterId)
        .eq("soul_status", "training"),
    );
    return { status: call.status === 404 ? "uncertain" : "training" };
  }
  const reference = readCustomReference(call.data);
  const state = reference?.state ?? "training";
  await fenced(
    db
      .from("characters")
      .update({
        soul_checked_at: now(),
        // Ready: it becomes the Soul ID in use.
        ...(state === "ready"
          ? {
              soul_status: "ready",
              soul_reference_id: row.soul_training_id,
              soul_model_version: row.soul_training_version ?? row.soul_model_version,
              soul_ready_at: now(),
              soul_error: null,
            }
          : {}),
        ...(state === "failed"
          ? {
              soul_status: "failed",
              soul_error: reference?.message ?? "Higgsfield couldn't train it",
            }
          : {}),
      })
      .eq("id", characterId)
      .eq("soul_status", "training"),
  );
  return { status: state };
}

/** The reconcile job's pass: trainings in progress are asked about, and cut-short starts settled. */
export async function sweepSoulTrainings(limit = 10): Promise<number> {
  const { data, error } = await db
    .from("characters")
    .select("id")
    .in("soul_status", ["training", "submitting"])
    .is("archived_at", null)
    .order("soul_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    try {
      await refreshSoulId(row.id);
    } catch (problem) {
      console.error("soul id check failed", {
        characterId: row.id,
        message: problem instanceof Error ? problem.message : String(problem),
      });
    }
  }
  return data?.length ?? 0;
}
