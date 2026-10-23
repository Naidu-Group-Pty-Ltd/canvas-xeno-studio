/**
 * The licence and credits ledger on the server (see ./rights): every file's
 * rights as they stand, read together for a whole edit; a person's record of
 * a file's rights, with who set it and when; an edit's credits; and what a
 * render takes with it, including the check a render for public use passes
 * before it starts.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { isMissingTableError } from "../edit/errors";
import { audibleAudio, type Timeline } from "../edit/timeline";
import {
  defaultRights,
  editCredits,
  effectiveRights,
  publicUseCheck,
  RIGHTS_NEED_UPDATE,
  timelineUses,
  worstStatus,
  type AssetRights,
  type EditCredits,
  type RecordedRights,
  type RightsFacts,
  type RightsStatus,
} from "./rights";

/** Said when a render for public use is asked for before the database can keep its check. */
export const PUBLIC_USE_NEEDS_UPDATE =
  "Rendering for public use needs a database update (migration 0027_asset_rights). Ask an admin to apply it.";

const ASSET_COLUMNS =
  "id,title,asset_type,source_type,storage_bucket,generation_id,uploaded_by,metadata,deleted_at";
const TRACK_COLUMNS =
  "id,asset_id,title,artist,source,provider,license,license_version,license_url,attribution,source_url,usage_notes,rights";

type AssetRow = RightsFacts["asset"] & { uploaded_by: string | null; deleted_at: string | null };
type TrackRow = NonNullable<RightsFacts["track"]> & { asset_id: string | null };

const unread = () =>
  new AppError("UNKNOWN", "The files' rights couldn't be read. Try again in a moment.");

/** Rows of a table for these ids; none when the table isn't there yet (an earlier migration). */
async function rowsIn<T>(
  table: string,
  columns: string,
  column: string,
  ids: string[],
  extra?: (query: ReturnType<ReturnType<typeof db.from>["select"]>) => typeof query,
): Promise<T[]> {
  if (!ids.length) return [];
  let query = db
    .from(table as never)
    .select(columns)
    .in(column, ids);
  if (extra) query = extra(query);
  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw unread();
  }
  return (data ?? []) as T[];
}

/** What is known of these files, for working out their rights (one level of what they were made from). */
async function factsFor(ids: string[]) {
  const assets = await rowsIn<AssetRow>("assets", ASSET_COLUMNS, "id", ids);
  const generationIds = [
    ...new Set(
      assets.flatMap((asset) =>
        asset.generation_id && asset.storage_bucket === "generated-assets"
          ? [asset.generation_id]
          : [],
      ),
    ),
  ];
  const [tracks, voiceovers, generations, inputs] = await Promise.all([
    rowsIn<TrackRow>("music_tracks", TRACK_COLUMNS, "asset_id", ids),
    rowsIn<{ asset_id: string | null; provider: string | null; voice_id: string | null }>(
      "voiceovers",
      "asset_id,provider,voice_id",
      "asset_id",
      ids,
      (query) => query.eq("status", "completed"),
    ),
    rowsIn<{ id: string; model_path: string | null; model_registry_id: string | null }>(
      "generations",
      "id,model_path,model_registry_id",
      "id",
      generationIds,
    ),
    rowsIn<{ generation_id: string; asset_id: string | null }>(
      "generation_inputs",
      "generation_id,asset_id",
      "generation_id",
      generationIds,
    ),
  ]);
  const modelIds = [
    ...new Set(
      generations.flatMap((row) => (row.model_registry_id ? [row.model_registry_id] : [])),
    ),
  ];
  const voiceIds = [...new Set(voiceovers.flatMap((row) => (row.voice_id ? [row.voice_id] : [])))];
  const uploaderIds = [
    ...new Set(assets.flatMap((asset) => (asset.uploaded_by ? [asset.uploaded_by] : []))),
  ];
  const [models, voices, people] = await Promise.all([
    rowsIn<{ id: string; display_name: string }>(
      "model_registry",
      "id,display_name",
      "id",
      modelIds,
    ),
    rowsIn<{ id: string; name: string }>("brand_voices", "id,name", "id", voiceIds),
    rowsIn<{ id: string; full_name: string | null; email: string | null }>(
      "profiles",
      "id,full_name,email",
      "id",
      uploaderIds,
    ),
  ]);
  return { assets, tracks, voiceovers, generations, inputs, models, voices, people };
}

/** Recorded rights for these files; none before the ledger exists. */
async function recordedFor(ids: string[]): Promise<Map<string, RecordedRights>> {
  const rows = await rowsIn<RecordedRights>("asset_rights", "*", "asset_id", ids);
  return new Map(rows.map((row) => [row.asset_id, row]));
}

/** Rights for files, worked out from their facts and what was recorded (`related`: their inputs and sources). */
function rightsOf(
  facts: Awaited<ReturnType<typeof factsFor>>,
  recorded: Map<string, RecordedRights>,
  related: ReadonlyMap<string, AssetRights> = new Map(),
): Map<string, AssetRights> {
  const out = new Map<string, AssetRights>();
  for (const asset of facts.assets) {
    if (asset.deleted_at) continue;
    const track = facts.tracks.find((row) => row.asset_id === asset.id) ?? null;
    const take = facts.voiceovers.find(
      (row) => row.asset_id === asset.id && row.provider !== "upload",
    );
    const generation = facts.generations.find((row) => row.id === asset.generation_id);
    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
    const derivedFrom =
      typeof metadata["derived_from_asset_id"] === "string"
        ? related.get(metadata["derived_from_asset_id"])
        : undefined;
    const person = facts.people.find((row) => row.id === asset.uploaded_by);
    const worked = defaultRights({
      asset,
      track,
      generation: generation
        ? {
            modelName:
              facts.models.find((model) => model.id === generation.model_registry_id)
                ?.display_name ?? null,
            modelPath: generation.model_path,
          }
        : null,
      voiceover: take
        ? {
            provider: take.provider,
            voiceName: facts.voices.find((voice) => voice.id === take.voice_id)?.name ?? null,
          }
        : null,
      inputs: facts.inputs
        .filter((row) => row.generation_id === asset.generation_id && row.asset_id)
        .flatMap((row) => {
          const input = related.get(row.asset_id!);
          return input ? [input] : [];
        }),
      derivedFrom: derivedFrom ?? null,
      uploaderName: person?.full_name ?? person?.email ?? null,
    });
    out.set(asset.id, effectiveRights(worked, recorded.get(asset.id)));
  }
  return out;
}

/**
 * Every given file's rights as they stand, read together: what a person
 * recorded over what is worked out, with what each was made from (its
 * generation's inputs, the file it was cut from) taken into account one
 * level deep. Files no longer in the library are left out.
 */
export async function rightsForAssets(assetIds: string[]): Promise<Map<string, AssetRights>> {
  const ids = [...new Set(assetIds)].slice(0, 500);
  if (!ids.length) return new Map();
  const facts = await factsFor(ids);
  const relatedIds = [
    ...new Set([
      ...facts.inputs.flatMap((row) => (row.asset_id ? [row.asset_id] : [])),
      ...facts.assets.flatMap((asset) => {
        const from = (asset.metadata ?? {})["derived_from_asset_id"];
        return typeof from === "string" ? [from] : [];
      }),
    ]),
  ].filter((id) => !ids.includes(id));
  const relatedFacts = relatedIds.length ? await factsFor(relatedIds) : null;
  const recorded = await recordedFor([...ids, ...relatedIds]);
  const related = relatedFacts ? rightsOf(relatedFacts, recorded) : new Map<string, AssetRights>();
  // What a file was made from may itself be in the list asked for.
  const first = rightsOf(facts, recorded, related);
  return rightsOf(facts, recorded, new Map([...related, ...first]));
}

async function activeMember(userId: string): Promise<void> {
  const { data } = await db.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
}

/** What a person records of a file's rights; a field left out keeps what was recorded, null clears it. */
export interface RightsChange {
  status: RightsStatus;
  source?: string | null | undefined;
  licence?: string | null | undefined;
  licenceUrl?: string | null | undefined;
  creditLine?: string | null | undefined;
  notes?: string | null | undefined;
}

/**
 * Records a file's rights, stamped by the server with who set them and when,
 * and who decided its status (cleared, or not cleared) and when. A music
 * library track's licence and credit stay the library's: only its status and
 * notes are recorded here. Returns the file's rights as they now stand.
 */
export async function setAssetRights(input: {
  userId: string;
  assetId: string;
  change: RightsChange;
}): Promise<AssetRights> {
  await activeMember(input.userId);
  const current = (await rightsForAssets([input.assetId])).get(input.assetId);
  if (!current) throw new AppError("INVALID_PARAMETERS", "That file isn't in the library");
  const { change } = input;
  if (
    current.basis === "music_library" &&
    [change.source, change.licence, change.licenceUrl, change.creditLine].some(
      (value) => value !== undefined && value !== null,
    )
  )
    throw new AppError(
      "INVALID_PARAMETERS",
      "This is a music library track: its licence and credit are kept in the music library (renew or record its licence there). Only its status and notes are set here.",
    );
  const { data: before } = await db
    .from("asset_rights")
    .select("*")
    .eq("asset_id", input.assetId)
    .maybeSingle();
  const kept = (before ?? null) as RecordedRights | null;
  const pick = (given: string | null | undefined, earlier: string | null | undefined) =>
    given === undefined ? (earlier ?? null) : given?.trim() || null;
  const now = new Date().toISOString();
  const decided = change.status !== "to_confirm";
  const { error } = await db.from("asset_rights").upsert(
    {
      asset_id: input.assetId,
      status: change.status,
      source: pick(change.source, kept?.source)?.slice(0, 300) ?? null,
      licence: pick(change.licence, kept?.licence)?.slice(0, 300) ?? null,
      licence_url: pick(change.licenceUrl, kept?.licence_url)?.slice(0, 500) ?? null,
      credit_line: pick(change.creditLine, kept?.credit_line)?.slice(0, 1000) ?? null,
      notes: pick(change.notes, kept?.notes)?.slice(0, 2000) ?? null,
      updated_by: input.userId,
      updated_at: now,
      // A decision keeps who made it; changing other details of one doesn't remake it.
      confirmed_by: decided
        ? kept?.status === change.status && kept.confirmed_by
          ? kept.confirmed_by
          : input.userId
        : null,
      confirmed_at: decided
        ? kept?.status === change.status && kept.confirmed_at
          ? kept.confirmed_at
          : now
        : null,
    },
    { onConflict: "asset_id" },
  );
  if (error) {
    if (isMissingTableError(error)) throw new AppError("INVALID_PARAMETERS", RIGHTS_NEED_UPDATE);
    throw new AppError("STORAGE_FAILED", "The file's rights couldn't be saved. Try again.");
  }
  return (await rightsForAssets([input.assetId])).get(input.assetId)!;
}

/** Forgets what was recorded of a file's rights: they are worked out again. */
export async function clearAssetRights(input: {
  userId: string;
  assetId: string;
}): Promise<AssetRights | null> {
  await activeMember(input.userId);
  const { error } = await db.from("asset_rights").delete().eq("asset_id", input.assetId);
  if (error) {
    if (isMissingTableError(error)) throw new AppError("INVALID_PARAMETERS", RIGHTS_NEED_UPDATE);
    throw new AppError("STORAGE_FAILED", "The file's rights couldn't be changed. Try again.");
  }
  return (await rightsForAssets([input.assetId])).get(input.assetId) ?? null;
}

/** An edit's credits: every file it uses (the sound only where it is heard), and the credit lines owed. */
export async function creditsForTimeline(timeline: Timeline): Promise<EditCredits> {
  const uses = timelineUses({
    clips: timeline.clips,
    images: timeline.images,
    audio: audibleAudio(timeline),
  });
  return editCredits(uses, await rightsForAssets(uses.map((use) => use.assetId)));
}

/** A file's entry in the credits a render takes with it. */
function keptCredit(file: EditCredits["files"][number]) {
  return {
    asset_id: file.assetId,
    title: file.title,
    uses: file.uses,
    source: file.source,
    licence: file.licence,
    status: file.status,
    ...(file.creditLine ? { credit_line: file.creditLine } : {}),
  };
}

/**
 * What a render takes with it: its credits (every file it uses, its licence
 * and status, and the credit lines owed) and its rights check. A render for
 * public use is held (an error, so nothing starts) until every file it uses
 * is cleared or its exceptions are confirmed, by everyone (true) or by id;
 * who confirmed them, and when, is recorded. Any other render takes its
 * credits as far as they can be read just now, and is never stopped for them.
 */
export async function renderRights(
  timeline: Timeline,
  options: { userId: string; publicUse: boolean; confirmExceptions: boolean | string[] },
): Promise<{ payload: Record<string, unknown>; check: Record<string, unknown> | null }> {
  if (!options.publicUse) {
    try {
      const credits = await creditsForTimeline(timeline);
      return {
        payload: {
          credits: credits.files.map(keptCredit),
          ...(credits.creditLines.length ? { credit_lines: credits.creditLines } : {}),
          rights_check: {
            public_use: false,
            status: worstStatus(credits.files.map((file) => file.status)),
            files: credits.files.length,
            not_cleared: credits.notCleared.length,
          },
        },
        check: null,
      };
    } catch {
      return { payload: {}, check: null };
    }
  }
  // Its check is kept on the render: the database must have the place for it.
  const { error: missing } = await db
    .from("sequence_renders")
    .select("id,public_use,rights_check")
    .limit(1);
  if (missing) {
    if (isMissingTableError(missing))
      throw new AppError("INVALID_PARAMETERS", PUBLIC_USE_NEEDS_UPDATE);
    throw unread();
  }
  const credits = await creditsForTimeline(timeline);
  const verdict = publicUseCheck(credits, options.confirmExceptions);
  if (verdict.held) throw new AppError("INVALID_PARAMETERS", verdict.message ?? undefined);
  const check = {
    public_use: true,
    status: "cleared",
    files: credits.files.length,
    exceptions: verdict.exceptions.map((file) => ({
      asset_id: file.assetId,
      title: file.title,
      status: file.status,
    })),
    ...(verdict.exceptions.length
      ? { confirmed_by: options.userId, confirmed_at: new Date().toISOString() }
      : {}),
  };
  return {
    payload: {
      credits: credits.files.map(keptCredit),
      ...(credits.creditLines.length ? { credit_lines: credits.creditLines } : {}),
      rights_check: check,
    },
    check,
  };
}

/** Marks a render as for public use, with its check. Best effort: its task carries the check too. */
export async function markPublicUse(
  renderId: string,
  check: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("sequence_renders")
    .update({ public_use: true, rights_check: check as never })
    .eq("id", renderId);
  if (error)
    console.error("render not marked for public use", { renderId, message: error.message });
}
