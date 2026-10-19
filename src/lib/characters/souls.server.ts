/**
 * A character's Soul IDs on the server: one in use per Soul model, each
 * recorded with where it came from and what it was trained on. Trainings
 * record theirs as they become ready (see service.server's trainSoulId and
 * refreshSoulId); this is also where the account's own list at Higgsfield is
 * read, an unclear training settled from it, and a Soul ID trained elsewhere
 * on the account taken into a character. Reading the list is free; nothing
 * here trains (or bills) anything.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import type { CustomReference } from "../higgsfield/provider.server";
import { SOUL_VERSIONS, type SoulVersion } from "./model";
import { soulOf, type CharacterSoul, type SoulSource } from "./soul";

const db = supabaseAdmin;
const now = () => new Date().toISOString();

type SoulInsert = Database["public"]["Tables"]["character_souls"]["Insert"];

const SOULS_MISSING =
  "Soul IDs per model need a database update (migration 0020_soul_ids). Ask an admin to apply it.";

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.code === "42703" ||
      /does not exist|could not find the table|column .* not found/i.test(error.message ?? ""))
  );
}

/**
 * Each character's Soul IDs, newest first (in use and retired), by character.
 * Before migration 0020 a character's one Soul ID comes from its own row.
 */
export async function soulsOf(characterIds: string[]): Promise<Map<string, CharacterSoul[]>> {
  const ids = [...new Set(characterIds)];
  const byCharacter = new Map<string, CharacterSoul[]>();
  if (!ids.length) return byCharacter;
  const { data, error } = await db
    .from("character_souls")
    .select("*")
    .in("character_id", ids)
    .order("ready_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) throw new AppError("UNKNOWN", error.message);
    const { data: rows } = await db
      .from("characters")
      .select("id,soul_model_version,soul_reference_id,soul_ready_at,soul_image_count,updated_at")
      .in("id", ids);
    for (const row of rows ?? []) {
      const version = row.soul_model_version;
      if (
        !row.soul_reference_id ||
        !version ||
        !(SOUL_VERSIONS as readonly string[]).includes(version)
      )
        continue;
      byCharacter.set(row.id, [
        {
          id: `legacy:${row.id}`,
          characterId: row.id,
          version: version as SoulVersion,
          referenceId: row.soul_reference_id,
          source: "trained",
          active: true,
          imageCount: row.soul_image_count,
          trainingAssetIds: [],
          thumbnailUrl: null,
          likeness: null,
          approvedAt: null,
          readyAt: row.soul_ready_at ?? row.updated_at,
        },
      ]);
    }
    return byCharacter;
  }
  for (const row of data ?? []) {
    const soul = soulOf(row);
    if (!soul) continue;
    byCharacter.set(soul.characterId, [...(byCharacter.get(soul.characterId) ?? []), soul]);
  }
  return byCharacter;
}

/** One Soul ID by its id (in use or retired). */
export async function loadSoul(soulId: string): Promise<CharacterSoul> {
  const { data, error } = await db
    .from("character_souls")
    .select("*")
    .eq("id", soulId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AppError("UNKNOWN", SOULS_MISSING);
    throw new AppError("UNKNOWN", error.message);
  }
  const soul = data ? soulOf(data) : null;
  if (!soul) throw new AppError("INVALID_PARAMETERS", "That Soul ID is no longer recorded");
  return soul;
}

/**
 * Records a Soul ID that has become ready: in use for its Soul model from
 * now on, the one before it for that model retired. Tried again a few times:
 * a billed training's result must not be lost to a passing database error.
 * Before migration 0020 there is nowhere to record it, and the character's
 * own row (written by the caller) is all there is.
 */
export async function recordSoulReady(input: {
  characterId: string;
  version: SoulVersion;
  referenceId: string;
  source: SoulSource;
  requestKey?: string | null;
  imageCount?: number | null;
  assetIds?: string[];
  thumbnailUrl?: string | null;
  userId?: string | null;
}): Promise<void> {
  const row: SoulInsert = {
    character_id: input.characterId,
    model_version: input.version,
    reference_id: input.referenceId,
    source: input.source,
    is_active: true,
    request_key: input.requestKey ?? null,
    image_count: input.imageCount ?? null,
    training_asset_ids: input.assetIds ?? [],
    thumbnail_url: input.thumbnailUrl ?? null,
    created_by: input.userId ?? null,
    ready_at: now(),
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // The one in use for this model before it is retired first (one in use at a time).
    const { error: retireError } = await db
      .from("character_souls")
      .update({ is_active: false })
      .eq("character_id", input.characterId)
      .eq("model_version", input.version)
      .eq("is_active", true)
      .neq("reference_id", input.referenceId);
    if (isMissingTable(retireError)) return;
    const { error } = await db.from("character_souls").insert(row);
    if (!error) return;
    if (error.code === "23505") {
      // Recorded before (asked about twice, or attached again): it is the one in use again.
      const { error: updateError } = await db
        .from("character_souls")
        .update({
          is_active: true,
          ...(input.thumbnailUrl ? { thumbnail_url: input.thumbnailUrl } : {}),
        })
        .eq("character_id", input.characterId)
        .eq("model_version", input.version)
        .eq("reference_id", input.referenceId);
      if (!updateError) return;
    }
    if (attempt === 3) {
      console.error("soul id not recorded", {
        characterId: input.characterId,
        referenceId: input.referenceId,
        message: error.message,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

/** Points the character's own "Soul ID used last" at this one (what older readers use). */
async function markLastUsed(characterId: string, version: SoulVersion, referenceId: string) {
  await db
    .from("characters")
    .update({ soul_reference_id: referenceId, soul_model_version: version })
    .eq("id", characterId);
}

/** Makes a recorded Soul ID the one in use for its Soul model (the one in use before is retired). */
export async function putSoulInUse(soulId: string): Promise<void> {
  const soul = await loadSoul(soulId);
  await recordSoulReady({
    characterId: soul.characterId,
    version: soul.version,
    referenceId: soul.referenceId,
    source: soul.source,
  });
  await markLastUsed(soul.characterId, soul.version, soul.referenceId);
}

/**
 * Stops using a Soul ID (it stays recorded, and stays trained at
 * Higgsfield). If it was the character's last used, another one in use takes
 * its place there, else none.
 */
export async function retireSoul(soulId: string): Promise<void> {
  const soul = await loadSoul(soulId);
  const { error } = await db.from("character_souls").update({ is_active: false }).eq("id", soulId);
  if (error) throw new AppError("UNKNOWN", error.message);
  const { data: character } = await db
    .from("characters")
    .select("soul_reference_id")
    .eq("id", soul.characterId)
    .maybeSingle();
  if (character?.soul_reference_id !== soul.referenceId) return;
  const others = (await soulsOf([soul.characterId])).get(soul.characterId) ?? [];
  const next = others.find((entry) => entry.active && entry.id !== soulId) ?? null;
  await db
    .from("characters")
    .update({
      soul_reference_id: next?.referenceId ?? null,
      soul_model_version: next?.version ?? null,
    })
    .eq("id", soul.characterId);
}

/** Marks a Soul ID's likeness approved by a person (or takes that back). */
export async function approveSoul(input: {
  soulId: string;
  userId: string;
  approved: boolean;
}): Promise<void> {
  await loadSoul(input.soulId);
  const { error } = await db
    .from("character_souls")
    .update(
      input.approved
        ? { approved_at: now(), approved_by: input.userId }
        : { approved_at: null, approved_by: null },
    )
    .eq("id", input.soulId);
  if (error) throw new AppError("UNKNOWN", error.message);
}

/* ------------------------------------------------------------------ */
/* The account's own list                                              */
/* ------------------------------------------------------------------ */

/** The most pages of the account's list read at once (50 a page). */
const LIST_PAGES = 6;

export interface AccountSoul extends CustomReference {
  /** The character it is recorded on here, if any. */
  characterId: string | null;
  characterName: string | null;
}

/**
 * The Soul IDs on the studio's Higgsfield account, newest first, each with
 * the character it is recorded on here (if any). Free: it only reads.
 */
export async function accountSouls(): Promise<{ souls: AccountSoul[]; complete: boolean }> {
  const { listCustomReferences, readCustomReferenceList } =
    await import("../higgsfield/provider.server");
  const found: CustomReference[] = [];
  let complete = false;
  for (let page = 1; page <= LIST_PAGES; page += 1) {
    const call = await listCustomReferences(page, 50);
    if (!call.ok) {
      if (page === 1)
        throw new AppError(
          (call.errorCode as never) ?? "PROVIDER_REJECTED",
          call.errorMessage ?? "Higgsfield's list of Soul IDs couldn't be read",
        );
      break;
    }
    const { references, totalPages } = readCustomReferenceList(call.data);
    found.push(...references);
    if (
      !references.length ||
      (totalPages !== null && page >= totalPages) ||
      references.length < 50
    ) {
      complete = true;
      break;
    }
  }
  const ids = [...new Set(found.map((reference) => reference.id))];
  const recorded = new Map<string, { characterId: string; characterName: string }>();
  if (ids.length) {
    const { data, error } = await db
      .from("character_souls")
      .select("reference_id,character_id,characters(name)")
      .in("reference_id", ids);
    if (!error)
      for (const row of data ?? [])
        recorded.set(row.reference_id, {
          characterId: row.character_id,
          characterName:
            (row.characters as unknown as { name?: string } | null)?.name ?? "A character",
        });
  }
  return {
    souls: found
      .filter((reference, index) => found.findIndex((entry) => entry.id === reference.id) === index)
      .map((reference) => ({
        ...reference,
        characterId: recorded.get(reference.id)?.characterId ?? null,
        characterName: recorded.get(reference.id)?.characterName ?? null,
      })),
    complete,
  };
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Settles unclear trainings from the account's list: a training whose answer
 * was unclear and that Higgsfield never gave an id for is given the Soul ID
 * that turns up there under the character's name, for its Soul model, made
 * after it was asked for, when exactly one does (as a person would with "Use
 * this Soul ID"). Returns how many were settled.
 */
export async function recoverUncertainTrainings(souls: AccountSoul[]): Promise<number> {
  const { data: characters, error } = await db
    .from("characters")
    .select("id,name,soul_status,soul_training_id,soul_training_version,soul_requested_at")
    .eq("soul_status", "uncertain")
    .is("soul_training_id", null);
  if (error || !characters?.length) return 0;
  const { attachSoulId } = await import("./service.server");
  let recovered = 0;
  for (const character of characters) {
    const since = new Date(character.soul_requested_at ?? 0).getTime() - 2 * 60_000;
    const candidates = souls.filter(
      (soul) =>
        !soul.characterId &&
        same(soul.name, character.name) &&
        (!soul.modelVersion || soul.modelVersion === character.soul_training_version) &&
        (!soul.createdAt || new Date(soul.createdAt).getTime() >= since),
    );
    if (candidates.length !== 1) continue;
    try {
      await attachSoulId({ characterId: character.id, referenceId: candidates[0]!.id });
      recovered += 1;
    } catch (problem) {
      console.error("unclear soul id training not recovered", {
        characterId: character.id,
        message: problem instanceof Error ? problem.message : String(problem),
      });
    }
  }
  return recovered;
}

/**
 * Takes a Soul ID from the account (trained elsewhere, or before the studio
 * recorded them) into a character: Higgsfield is asked about it first (free),
 * it must be ready, and it mustn't already be another character's.
 */
export async function importSoul(input: {
  characterId: string;
  referenceId: string;
  userId: string;
  /** Its Soul model, when Higgsfield doesn't say. */
  version?: SoulVersion | null | undefined;
}): Promise<CharacterSoul> {
  const referenceId = input.referenceId.trim().toLowerCase();
  const { getCustomReference, readCustomReference } = await import("../higgsfield/provider.server");
  const call = await getCustomReference(referenceId);
  if (!call.ok && call.status === 404)
    throw new AppError(
      "INVALID_PARAMETERS",
      "Higgsfield has no Soul ID with that id on the studio's account",
    );
  const reference = call.ok ? readCustomReference(call.data) : null;
  if (!reference)
    throw new AppError(
      "UNKNOWN",
      `Higgsfield couldn't say how that Soul ID is doing just now${call.errorMessage ? ` (${call.errorMessage})` : ""}. Try again.`,
    );
  if (reference.state !== "ready")
    throw new AppError(
      "INVALID_PARAMETERS",
      reference.state === "failed"
        ? "That Soul ID's training failed at Higgsfield"
        : "That Soul ID is still training: take it in once it's ready",
    );
  const version = reference.modelVersion ?? input.version ?? null;
  if (!version) throw new AppError("INVALID_PARAMETERS", "Say which Soul model it was trained for");
  const { data: elsewhere } = await db
    .from("character_souls")
    .select("character_id,characters(name)")
    .eq("reference_id", reference.id)
    .neq("character_id", input.characterId)
    .limit(1);
  const other = elsewhere?.[0];
  if (other)
    throw new AppError(
      "INVALID_PARAMETERS",
      `That Soul ID is already ${(other.characters as unknown as { name?: string } | null)?.name ?? "another character"}'s`,
    );
  await recordSoulReady({
    characterId: input.characterId,
    version,
    referenceId: reference.id,
    source: "imported",
    thumbnailUrl: reference.thumbnailUrl,
    userId: input.userId,
  });
  const { data: character } = await db
    .from("characters")
    .select("soul_reference_id")
    .eq("id", input.characterId)
    .maybeSingle();
  if (!character?.soul_reference_id) await markLastUsed(input.characterId, version, reference.id);
  const soul = ((await soulsOf([input.characterId])).get(input.characterId) ?? []).find(
    (entry) => entry.referenceId === reference.id && entry.version === version,
  );
  if (!soul) throw new AppError("UNKNOWN", SOULS_MISSING);
  return soul;
}
