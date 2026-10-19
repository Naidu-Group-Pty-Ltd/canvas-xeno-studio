import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import {
  CHARACTER_IMAGE_ROLES,
  CHARACTER_LIMITS,
  CHARACTER_VIEWS,
  SOUL_VERSIONS,
} from "./characters/model";

/**
 * Characters: the team's people and mascots who must look the same wherever
 * they appear. Members read them straight from the database; every change
 * comes through here, checked on the server.
 */

async function activeMember(userId: string): Promise<{ role: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { role: data.role };
}

/**
 * Everyone can use a character; changing it (and training its Soul ID, which
 * is billed) is for the person who made it, or an admin.
 */
async function assertCanEdit(userId: string, characterId: string): Promise<void> {
  const member = await activeMember(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("characters")
    .select("created_by")
    .eq("id", characterId)
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
  if (data.created_by !== userId && member.role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who made this character, or an admin, can change it",
    );
}

const service = () => import("./characters/service.server");

const id = z.string().uuid();
const name = z
  .string()
  .min(1)
  .max(CHARACTER_LIMITS.nameChars * 2);
const description = z.string().max(CHARACTER_LIMITS.descriptionChars * 2);
const view = z.enum(CHARACTER_VIEWS);
const role = z.enum(CHARACTER_IMAGE_ROLES);

export const createCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ name, description: description.default("") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    return (await service()).createCharacter({ userId: context.userId, ...data });
  });

export const updateCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ characterId: id, name: name.optional(), description: description.optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    await (
      await service()
    ).updateCharacter({ id: data.characterId, name: data.name, description: data.description });
    return { ok: true };
  });

export const archiveCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ characterId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    await (await service()).archiveCharacter(data.characterId);
    return { ok: true };
  });

export const addCharacterImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        characterId: id,
        images: z
          .array(
            z.object({ assetId: id, role: role.default("sheet"), view: view.default("other") }),
          )
          .min(1)
          .max(CHARACTER_LIMITS.photoImages + CHARACTER_LIMITS.sheetImages),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await service()).addCharacterImages({ ...data, userId: context.userId });
  });

export const updateCharacterImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ characterId: id, assetId: id, role: role.optional(), view: view.optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    await (await service()).updateCharacterImage(data);
    return { ok: true };
  });

export const reorderCharacterImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ characterId: id, assetIds: z.array(id).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    await (await service()).reorderCharacterImages(data);
    return { ok: true };
  });

export const removeCharacterImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ characterId: id, assetId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    await (await service()).removeCharacterImage(data);
    return { ok: true };
  });

/** The studio's AI describes the character from their images and labels the views. */
export const describeCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ characterId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await service()).describeCharacter(data.characterId);
  });

/** Starts training a Soul ID (billed by Higgsfield). */
export const trainSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        characterId: id,
        version: z.enum(SOUL_VERSIONS),
        confirmUncertain: z.boolean().default(false),
        /** The images to train on; unset: the default set (training photos first). */
        assetIds: z.array(id).max(CHARACTER_LIMITS.soulMaxImages).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await service()).trainSoulId({ ...data, userId: context.userId });
  });

/** How a Soul ID's training is going (asks Higgsfield at most every so often). */
export const refreshSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ characterId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    return (await service()).refreshSoulId(data.characterId);
  });

/**
 * Gives a training whose answer was unclear the Soul ID a person found at
 * Higgsfield (checked with Higgsfield first; nothing is trained or charged).
 */
export const attachSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ characterId: id, referenceId: z.string().trim().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await service()).attachSoulId(data);
  });

/* ------------------------------------------------------------------ */
/* Soul IDs: the set they're trained on, packs, proofs, the account    */
/* ------------------------------------------------------------------ */

const training = () => import("./characters/soul-training.server");
const souls = () => import("./characters/souls.server");

/** The soul's character, for checking who may change it. */
async function characterOfSoul(soulId: string): Promise<string> {
  const { loadSoul } = await souls();
  return (await loadSoul(soulId)).characterId;
}

/** The studio's AI checks the images a Soul ID would be trained on (free). */
export const checkSoulTrainingSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ characterId: id, assetIds: z.array(id).max(100).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await training()).checkTrainingSet(data);
  });

/** The image model a training pack would be painted with (to quote it). */
export const soulTrainingPackModel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await activeMember(context.userId);
    const painter = await (await training()).packPainter();
    return painter
      ? { modelId: painter.id, name: painter.display_name }
      : { modelId: null, name: null };
  });

/** Paints a training pack: varied photos of the character from their sheet (billed generations). */
export const startSoulTrainingPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        characterId: id,
        count: z.number().int().min(1).max(16),
        modelId: id.nullish(),
        /** The pack's id, so a repeated request starts nothing twice. */
        packId: id.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await training()).startTrainingPack({ ...data, userId: context.userId });
  });

/** Scores images for likeness against the character's own (free). */
export const scoreCharacterLikeness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ characterId: id, assetIds: z.array(id).min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    return (await training()).scoreCharacterImages(data);
  });

/** Makes a Soul ID's likeness proof: a few images from the Soul ID alone (billed). */
export const startSoulProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ soulId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, await characterOfSoul(data.soulId));
    return (await training()).startSoulProof({ soulId: data.soulId, userId: context.userId });
  });

/** Scores a Soul ID's latest proof against the images it was trained on (free). */
export const scoreSoulProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ soulId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    return (await training()).scoreSoulProof(data);
  });

/** Approves a Soul ID's likeness (or takes that back). */
export const approveSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ soulId: id, approved: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, await characterOfSoul(data.soulId));
    return (await souls()).approveSoul({ ...data, userId: context.userId });
  });

/** Makes a recorded Soul ID the one in use for its Soul model. */
export const putSoulIdInUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ soulId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, await characterOfSoul(data.soulId));
    return (await souls()).putSoulInUse(data.soulId);
  });

/** Stops using a Soul ID (it stays recorded, and trained at Higgsfield). */
export const retireSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ soulId: id }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, await characterOfSoul(data.soulId));
    return (await souls()).retireSoul(data.soulId);
  });

/**
 * The Soul IDs on the studio's Higgsfield account (free to read), with the
 * character each is recorded on; unclear trainings whose Soul ID turns up
 * there are settled on the way.
 */
export const listAccountSoulIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await activeMember(context.userId);
    const { accountSouls, recoverUncertainTrainings } = await souls();
    const listed = await accountSouls();
    const recovered = await recoverUncertainTrainings(listed.souls);
    return { ...(recovered ? await accountSouls() : listed), recovered };
  });

/** Takes a Soul ID from the account into a character (checked with Higgsfield first; nothing is trained). */
export const importSoulId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        characterId: id,
        referenceId: z.string().trim().uuid(),
        version: z.enum(SOUL_VERSIONS).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.userId, data.characterId);
    return (await souls()).importSoul({ ...data, userId: context.userId });
  });
