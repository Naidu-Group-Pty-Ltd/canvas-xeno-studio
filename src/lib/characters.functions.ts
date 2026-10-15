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
