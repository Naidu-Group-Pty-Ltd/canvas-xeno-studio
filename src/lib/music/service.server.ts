/**
 * Music library service: brings tracks into the studio with their licence,
 * makes AI music and instrumentals, and records licensed uploads.
 *
 * Every billable call is recorded before it is made (status "generating"),
 * and a dropped connection is recorded as "submission_uncertain", never
 * retried by itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingTableError } from "@/lib/edit/errors";
import { AppError } from "../higgsfield/errors";
import { mp3Duration } from "../voice/audio";
import {
  DEFAULT_MUSIC_MODEL,
  isSafeOpenverseLicense,
  licenceTerms,
  licensedRightsSchema,
  MUSIC_LENGTH,
  MUSIC_LICENSES,
  type MusicLicense,
} from "./catalog";
import { PROBED_MIME, probeAudio, probeDuration, type ProbedAudio, type ReadRange } from "./probe";
import type { BarFeatures, MusicStructure } from "./structure";
import {
  audioExtension,
  composeMusic,
  downloadAudio,
  openverseTrack,
  separateInstrumental,
} from "./providers.server";

const BUCKET = "generated-assets";

/** The largest original an instrumental is made from (it is held in memory to send it off), as for catalogue downloads. */
const MAX_SPLIT_BYTES = 40 * 1024 * 1024;
const tooLargeToSplit = () =>
  new AppError(
    "INVALID_PARAMETERS",
    `This track is too large to make an instrumental of (over ${MAX_SPLIT_BYTES / 1024 / 1024} MB). Add a compressed copy (MP3) of it and make the instrumental from that.`,
  );
/** The longest track an instrumental is made of: as long as the music the studio makes (its stems are held in memory too). */
const MAX_SPLIT_SECONDS = MUSIC_LENGTH.max;
const tooLongToSplit = () =>
  new AppError(
    "INVALID_PARAMETERS",
    `This track is too long to make an instrumental of (over ${MAX_SPLIT_SECONDS / 60} minutes). Use a shorter edit of it.`,
  );
const lengthUnknown = () =>
  new AppError(
    "INVALID_PARAMETERS",
    "This track's length can't be read, so an instrumental isn't made of it. Add it as an MP3, WAV, M4A, Ogg or FLAC file and make the instrumental from that.",
  );

export async function requireActiveMember(userId: string): Promise<{ isAdmin: boolean }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { isAdmin: profile.role === "admin" };
}

function scopeFor(userId: string, projectId: string | null) {
  return projectId ? `projects/${projectId}` : `unassigned/${userId}`;
}

const trackUnchecked = () =>
  new AppError("UNKNOWN", "The track couldn't be checked. Try again in a moment.");
/** A track whose file is stored but whose library record couldn't be added just now. */
const trackStuck = () =>
  new AppError(
    "UNKNOWN",
    "The track was made, but it couldn't be added to the library just now. Try again in a moment.",
  );

/**
 * A stored file's listing entry, or null if it isn't there. Listed rather
 * than probed: a listing says plainly whether the file is there, and any
 * storage error is thrown, never read as "no file".
 */
async function storedFile(
  path: string,
  bucket = BUCKET,
): Promise<{ name: string; metadata?: Record<string, unknown> | null } | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw trackUnchecked();
  return (listed ?? []).find((entry) => entry.name === name) ?? null;
}

/**
 * Adds a track's file to the library, once. A file has one library record
 * (its place is unique), so trying again (after an insert whose answer was
 * lost, or when the track is finished later from its file) finds the record
 * already made instead of adding another. Only the server adds records in the
 * output bucket, so the record at the track's place there is the track's own,
 * whatever anyone else adds. Returns it, or null if it couldn't be added just
 * now; a lookup that fails is thrown.
 */
async function keptAsset(
  path: string,
  values: Record<string, unknown>,
): Promise<{ id: string; durationSeconds: number | null } | null> {
  const kept = (row: { id: string; duration_seconds: number | string | null }) => ({
    id: row.id,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: inserted, error } = await supabaseAdmin
      .from("assets")
      .insert({ ...values, storage_bucket: BUCKET, storage_path: path } as never)
      .select("id,duration_seconds")
      .maybeSingle();
    if (!error && inserted) return kept(inserted as never);
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("assets")
      .select("id,duration_seconds")
      .eq("storage_bucket", BUCKET)
      .eq("storage_path", path)
      .maybeSingle();
    if (lookupError) throw trackUnchecked();
    if (existing) return kept(existing as never);
  }
  return null;
}

/**
 * Stores a track's file at its fixed place in the server-only bucket and adds
 * it to the library. Returns null if the file couldn't be stored (nothing was
 * kept). Once the file is stored the track is never written off: if its
 * library record can't be added, the call throws, and the same request (or
 * the sweep of interrupted tracks) finishes the track from its file.
 */
async function storeAudio(input: {
  userId: string;
  projectId: string | null;
  trackId: string;
  bytes: Uint8Array;
  mime: string;
  title: string;
  generated: boolean;
  metadata: Record<string, unknown>;
}): Promise<{ assetId: string; durationSeconds: number | null } | null> {
  const path = `${scopeFor(input.userId, input.projectId)}/music/${input.trackId}.${audioExtension(input.mime)}`;
  let stored = false;
  for (let attempt = 0; attempt < 2 && !stored; attempt += 1) {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, input.bytes, { contentType: input.mime, upsert: true });
    stored = !error;
  }
  // An upload whose answer was lost may still have landed: only a listing
  // that shows the file missing means nothing was kept.
  if (!stored) {
    const landed = await storedFile(path).catch(() => {
      throw trackStuck();
    });
    if (!landed) return null;
  }
  const durationSeconds = input.mime === "audio/mpeg" ? mp3Duration(input.bytes) : null;
  const asset = await keptAsset(path, {
    uploaded_by: input.userId,
    project_id: input.projectId,
    asset_type: "audio",
    mime_type: input.mime,
    file_size: input.bytes.length,
    duration_seconds: durationSeconds,
    source_type: input.generated ? "generated" : "uploaded",
    title: input.title.slice(0, 200),
    metadata: { music_track_id: input.trackId, ...input.metadata },
  }).catch(() => null);
  if (!asset) throw trackStuck();
  return { assetId: asset.id, durationSeconds };
}

type TrackRow = Record<string, unknown> & { id: string };

/** Work still "generating" after this long was interrupted before it was recorded. */
const STALE_MS = 15 * 60_000;
const isStale = (row: TrackRow) =>
  Date.now() - Date.parse(String(row["created_at"] ?? "")) > STALE_MS;

/** Every type a track's file can be stored as (see `audioExtension`), with its media type. */
const STORED_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  bin: "application/octet-stream",
};

/**
 * A track whose file was stored but whose last steps didn't land is finished
 * from that file: its library record is added if it is missing, and the track
 * is recorded as ready with it. Only the track's own file counts: it is found
 * at its fixed place in the server-only bucket (and must really be there), so
 * a library record (which any member can create or edit) can't stand in for
 * it. Anything else comes back unchanged; a lookup or write that fails is
 * thrown, so nothing is decided without knowing.
 */
async function relinked(row: TrackRow): Promise<TrackRow> {
  if (row["status"] !== "generating" || row["asset_id"]) return row;
  const base = `${scopeFor(String(row["created_by"]), (row["project_id"] as string | null) ?? null)}/music/${row.id}`;
  const slash = base.lastIndexOf("/");
  const name = base.slice(slash + 1);
  const { data: listed, error: listError } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(base.slice(0, slash), { search: `${name}.`, limit: 20 });
  if (listError) throw trackUnchecked();
  const extension = Object.keys(STORED_TYPES).find((type) =>
    (listed ?? []).some((entry) => entry.name === `${name}.${type}`),
  );
  if (!extension) return row;
  const file = (listed ?? []).find((entry) => entry.name === `${name}.${extension}`)!;
  const size = Number(file.metadata?.["size"]);
  const mime = file.metadata?.["mimetype"];
  const generated = row["source"] !== "openverse" && row["source"] !== "upload";
  const asset = await keptAsset(`${base}.${extension}`, {
    uploaded_by: row["created_by"] ?? null,
    project_id: row["project_id"] ?? null,
    asset_type: "audio",
    mime_type: typeof mime === "string" && mime ? mime : STORED_TYPES[extension],
    file_size: Number.isFinite(size) ? size : null,
    duration_seconds: row["duration_seconds"] == null ? null : Number(row["duration_seconds"]),
    source_type: generated ? "generated" : "uploaded",
    title: String(row["title"] ?? "Music").slice(0, 200),
    metadata: {
      music_track_id: row.id,
      ...(row["source"] === "elevenlabs"
        ? { ai_generated_music: true, provider: "elevenlabs" }
        : {}),
      ...(row["source"] === "derived"
        ? { derived_from_track: row["parent_track_id"] ?? null }
        : {}),
    },
  });
  if (!asset) throw trackUnchecked();
  const { data, error: linkError } = await supabaseAdmin
    .from("music_tracks")
    .update({
      asset_id: asset.id,
      status: "ready",
      duration_seconds: asset.durationSeconds ?? row["duration_seconds"] ?? null,
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "generating")
    .select("*")
    .maybeSingle();
  // Not finished after all: thrown, so the track is never written off meanwhile.
  if (linkError) throw trackUnchecked();
  if (data) return data as TrackRow;
  // Settled by someone else in the meantime: as it is now.
  const current = await loadTrack(row.id).catch(() => null);
  if (!current) throw trackUnchecked();
  return current;
}

/**
 * The last step of every track: recorded as ready with its stored file. The
 * update is checked and tried once more; if it still fails the call throws,
 * and the next request for the track links the file it already has.
 */
async function markReady(trackId: string, values: Record<string, unknown>): Promise<TrackRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("music_tracks")
      .update({ ...values, status: "ready", completed_at: new Date().toISOString() } as never)
      .eq("id", trackId)
      .select("*")
      .single();
    if (!error && data) return data as TrackRow;
  }
  throw new AppError(
    "UNKNOWN",
    "The track was saved, but the library couldn't be updated. Try again in a moment.",
  );
}

/** Interrupted generations are looked at this many at a time. */
const STALE_BATCH = 50;
const STALE_BATCHES = 20;
/** Interrupted work couldn't be checked or settled, so nothing new was started. */
const interruptedUnchecked = () =>
  new AppError(
    "UNKNOWN",
    "Music that was interrupted earlier couldn't be checked just now, so nothing new was started. Try again in a moment.",
  );

/**
 * Interrupted generations may still have been billed, so they're settled as
 * uncertain, never retried. One whose file was stored is finished instead.
 * This runs before anything new is made, and works through every interrupted
 * generation: if one can't be checked right now (its file looked up, or the
 * track finished or settled), it is left as it is, never written off, and
 * nothing new starts (or is billed) until it can be. The request says to try
 * again, rather than taking an interrupted track for one still being made.
 */
async function settleInterrupted(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  for (let batch = 1; ; batch += 1) {
    const { data: stale, error } = await supabaseAdmin
      .from("music_tracks")
      .select("*")
      .eq("status", "generating")
      .neq("source", "openverse")
      .lt("created_at", cutoff)
      .limit(STALE_BATCH);
    if (error) throw interruptedUnchecked();
    const rows = (stale ?? []) as TrackRow[];
    for (const row of rows) {
      let current: TrackRow;
      try {
        current = await relinked(row);
      } catch {
        throw interruptedUnchecked();
      }
      if (current["status"] !== "generating") continue;
      let settled = false;
      for (let attempt = 0; attempt < 2 && !settled; attempt += 1) {
        const { error: settleError } = await supabaseAdmin
          .from("music_tracks")
          .update({
            status: "submission_uncertain",
            error_code: "INTERRUPTED",
            error_message:
              "This was interrupted before it was saved. It may still have been billed, so it was not retried.",
            completed_at: new Date().toISOString(),
          } as never)
          .eq("id", row.id)
          .eq("status", "generating");
        settled = !settleError;
      }
      if (!settled) throw interruptedUnchecked();
    }
    // None of a batch is left interrupted, so a full one means more may be waiting.
    if (rows.length < STALE_BATCH) return;
    if (batch >= STALE_BATCHES) throw interruptedUnchecked();
  }
}

async function loadTrack(id: string): Promise<TrackRow | null> {
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw trackUnchecked();
  return (data ?? null) as TrackRow | null;
}

/* ------------------------------------------------------------------ */
/* Openverse                                                           */
/* ------------------------------------------------------------------ */

/** A track as Openverse itself describes it (not the browser), if its licence allows commercial use and edits. */
async function safeOpenverseSource(openverseId: string) {
  const detail = await openverseTrack(openverseId);
  if (!detail.ok) throw new AppError(detail.code as never, detail.message);
  const source = detail.track;
  if (!isSafeOpenverseLicense(source.license))
    throw new AppError(
      "INVALID_PARAMETERS",
      `This track's licence (${source.license.toUpperCase()}) doesn't allow commercial use and edits, so it can't be added.`,
    );
  if (!source.audioUrl)
    throw new AppError("INVALID_PARAMETERS", "This track has no downloadable file.");
  return { ...source, audioUrl: source.audioUrl };
}

/** How an Openverse track's file is described in the library. */
function openverseFile(source: Awaited<ReturnType<typeof safeOpenverseSource>>) {
  return {
    title: source.creator ? `${source.title} — ${source.creator}` : source.title,
    generated: false,
    metadata: {
      imported_from: "openverse",
      license: source.license,
      license_url: source.licenseUrl,
      attribution: source.attribution,
      source_url: source.landingUrl,
    },
  };
}

/**
 * An imported track whose audio was deleted from the library since gets it
 * back, since importing it again asks for it again. Deleting a library record
 * keeps its file, so the record is restored; if the record or its file is gone
 * too, the audio is downloaded again into the track's place. Reported only
 * once that is recorded.
 */
async function withOpenverseAudio(
  track: TrackRow,
  input: { userId: string; openverseId: string; projectId: string | null },
): Promise<TrackRow> {
  const notRestored = () =>
    new AppError(
      "UNKNOWN",
      "This track is already in the library, but its audio couldn't be restored just now. Try again in a moment.",
    );
  const assetId = (track["asset_id"] as string | null) ?? null;
  let asset: {
    id: string;
    deleted_at: string | null;
    storage_bucket: string;
    storage_path: string;
  } | null = null;
  if (assetId) {
    const { data, error } = await supabaseAdmin
      .from("assets")
      .select("id,deleted_at,storage_bucket,storage_path")
      .eq("id", assetId)
      .maybeSingle();
    if (error) throw trackUnchecked();
    asset = data;
  }
  if (asset && !asset.deleted_at) return track;
  const restore = async (id: string) => {
    const { error } = await supabaseAdmin
      .from("assets")
      .update({ deleted_at: null } as never)
      .eq("id", id);
    if (error) throw notRestored();
  };
  if (asset && asset.storage_bucket === BUCKET && (await storedFile(asset.storage_path))) {
    await restore(asset.id);
    return track;
  }
  // The file is gone as well: downloaded again, as an import would.
  const source = await safeOpenverseSource(input.openverseId);
  const file = await downloadAudio(source.audioUrl, source.filetype);
  if (!file.ok) throw new AppError(file.code as never, file.message);
  const stored = await storeAudio({
    userId: input.userId,
    projectId: input.projectId,
    trackId: track.id,
    bytes: file.bytes,
    mime: file.mime,
    ...openverseFile(source),
  });
  if (!stored) throw notRestored();
  // The record at that place may be the one deleted earlier.
  await restore(stored.assetId);
  const { data: linked, error: linkError } = await supabaseAdmin
    .from("music_tracks")
    .update({ asset_id: stored.assetId } as never)
    .eq("id", track.id)
    .select("*")
    .maybeSingle();
  if (linkError || !linked) throw notRestored();
  return linked as TrackRow;
}

export async function importOpenverseTrack(input: {
  userId: string;
  openverseId: string;
  projectId: string | null;
  campaignId: string | null;
}): Promise<{ track: TrackRow; duplicate: boolean; restored?: boolean }> {
  const { isAdmin } = await requireActiveMember(input.userId);
  const existing = async () => {
    const { data, error } = await supabaseAdmin
      .from("music_tracks")
      .select("*")
      .eq("source", "openverse")
      .eq("source_id", input.openverseId)
      .maybeSingle();
    if (error) throw trackUnchecked();
    return (data ?? null) as TrackRow | null;
  };
  let found = await existing();
  if (found) found = await relinked(found);
  // An import that was cut off (nothing billable) is cleared so it can be tried again.
  if (found && found["status"] !== "ready" && isStale(found)) {
    const { error } = await supabaseAdmin.from("music_tracks").delete().eq("id", found.id);
    if (error) throw trackUnchecked();
    found = null;
  }
  if (found?.["status"] === "ready") {
    // Imported before and archived since: only whoever may archive it (whoever
    // added it, or an admin, as setTrackArchived allows) brings it back. Anyone
    // else gets it as it is, archived, with nothing changed.
    const archived = found["is_archived"] === true;
    if (archived && found["created_by"] !== input.userId && !isAdmin)
      return { track: found, duplicate: true };
    // Imported before: its audio comes back if it was deleted from the library
    // since, so importing it again never answers with a track that can't be used.
    found = await withOpenverseAudio(found, input);
    if (!archived) return { track: found, duplicate: true };
    // Restored, and only reported restored once that is recorded.
    const { data: restored, error } = await supabaseAdmin
      .from("music_tracks")
      .update({ is_archived: false } as never)
      .eq("id", found.id)
      .select("*")
      .maybeSingle();
    if (error || !restored)
      throw new AppError(
        "UNKNOWN",
        "This track is already in the library but couldn't be restored. Try again in a moment.",
      );
    return { track: restored as TrackRow, duplicate: true, restored: true };
  }
  if (found) throw new AppError("UNKNOWN", "This track is already being added. Give it a moment.");

  const source = await safeOpenverseSource(input.openverseId);

  // Claim the import first, so two people adding the same track don't both download it.
  const trackId = crypto.randomUUID();
  const license = source.license as MusicLicense;
  const { error: claimError } = await supabaseAdmin.from("music_tracks").insert({
    id: trackId,
    title: source.title.slice(0, 300),
    artist: source.creator?.slice(0, 300) ?? null,
    kind: source.category === "sound_effect" ? "sound_effect" : "music",
    source: "openverse",
    source_id: source.id,
    source_url: source.landingUrl,
    provider: source.provider,
    license,
    license_version: source.licenseVersion,
    license_url: source.licenseUrl,
    attribution: source.attribution?.slice(0, 1000) ?? null,
    usage_notes: MUSIC_LICENSES[license].note,
    duration_seconds: source.durationSeconds,
    genres: source.genres,
    tags: source.tags,
    status: "generating",
    project_id: input.projectId,
    campaign_id: input.campaignId,
    created_by: input.userId,
  } as never);
  if (claimError) {
    if (claimError.code === "23505") {
      const winner = await existing();
      if (winner?.["status"] === "ready") return { track: winner, duplicate: true };
      throw new AppError("UNKNOWN", "This track is already being added. Give it a moment.");
    }
    throw new AppError("UNKNOWN", "The track could not be recorded.");
  }

  // Nothing billable happens here. While nothing is stored the claim is freed
  // on failure, so the import can be tried again; once the file is stored the
  // claim stays, and the next import finishes the track from that file. A
  // claim that can't be freed is said so: the track can then be added again
  // only once the claim is old enough to be cleared.
  const giveUp = async (problem: unknown): Promise<never> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabaseAdmin.from("music_tracks").delete().eq("id", trackId);
      if (!error) throw problem;
    }
    const message = problem instanceof Error ? problem.message : "The track could not be added.";
    throw new AppError(
      problem instanceof AppError ? problem.code : "UNKNOWN",
      `${message} This attempt couldn't be cleared up, so the track can be added again in about ${STALE_MS / 60_000} minutes.`,
    );
  };
  const file = await downloadAudio(source.audioUrl, source.filetype).catch(giveUp);
  if (!file.ok) return giveUp(new AppError(file.code as never, file.message));
  const stored = await storeAudio({
    userId: input.userId,
    projectId: input.projectId,
    trackId,
    bytes: file.bytes,
    mime: file.mime,
    ...openverseFile(source),
  });
  if (!stored)
    return giveUp(new AppError("STORAGE_FAILED", "The track could not be saved to the library."));
  const ready = await markReady(trackId, {
    asset_id: stored.assetId,
    duration_seconds: stored.durationSeconds ?? source.durationSeconds,
  });
  return { track: ready, duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Eleven Music                                                        */
/* ------------------------------------------------------------------ */

async function existingByKey(key: string): Promise<TrackRow | null> {
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("dedupe_key", key)
    .maybeSingle();
  if (error) throw trackUnchecked();
  return (data ?? null) as TrackRow | null;
}

/**
 * Work of the same kind still being made (a database index allows one at a
 * time): asked for again meanwhile, say after a reload forgot the request,
 * that work is returned rather than paid for twice.
 */
async function inProgress(
  match: Record<string, string | number | boolean | null>,
  extra: (row: TrackRow) => boolean = () => true,
): Promise<TrackRow | null> {
  let query = supabaseAdmin.from("music_tracks").select("*").eq("status", "generating");
  for (const [column, value] of Object.entries(match))
    query = value === null ? query.is(column, null) : query.eq(column, value as never);
  // Every match still being made (only ever a few at once), not a first page of
  // them: the one asked for again can't be crowded out by the rest.
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw trackUnchecked();
  return ((data ?? []) as TrackRow[]).find(extra) ?? null;
}

/**
 * Records how a track ended and returns it once recorded. Outcomes (failed,
 * uncertain) are returned, not thrown: a thrown error always means the caller
 * didn't get a recorded answer, so it may ask again with the same request id
 * and get this track back instead of paying for another.
 */
async function settleTrack(
  trackId: string,
  values: Record<string, unknown>,
): Promise<{ track: TrackRow; duplicate: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("music_tracks")
      .update(values as never)
      .eq("id", trackId)
      .select("*")
      .maybeSingle();
    if (!error && data) return { track: data as TrackRow, duplicate: false };
  }
  // Unrecorded, the outcome isn't reported: the caller keeps its request id and
  // asks about this track again instead of starting (and paying for) another.
  throw new AppError(
    "UNKNOWN",
    "The outcome couldn't be recorded. Try again in a moment to see how it ended.",
  );
}

export async function generateMusic(input: {
  userId: string;
  prompt: string;
  title: string;
  seconds: number;
  model: string | null;
  instrumental: boolean;
  genres: string[];
  moods: string[];
  bpm: number | null;
  projectId: string | null;
  campaignId: string | null;
  clientRequestId: string;
}): Promise<{ track: TrackRow; duplicate: boolean }> {
  await requireActiveMember(input.userId);
  await settleInterrupted();
  const repeat = await existingByKey(input.clientRequestId);
  if (repeat) return { track: await relinked(repeat), duplicate: true };
  const seconds = Math.max(MUSIC_LENGTH.min, Math.min(MUSIC_LENGTH.max, input.seconds));
  const prompt = input.prompt.slice(0, 4000);
  const model = input.model ?? DEFAULT_MUSIC_MODEL;
  // The same music in the same place: a project's, or outside one this member's
  // own (stored under their name), never another member's.
  const sameMusic = () =>
    inProgress(
      {
        source: "elevenlabs",
        project_id: input.projectId,
        ...(input.projectId ? {} : { created_by: input.userId }),
        model,
        duration_seconds: seconds,
        instrumental: input.instrumental,
      },
      (row) => row["prompt"] === prompt,
    );
  const making = await sameMusic();
  if (making) return { track: await relinked(making), duplicate: true };

  const trackId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin.from("music_tracks").insert({
    id: trackId,
    title: input.title.slice(0, 300),
    artist: "Eleven Music",
    source: "elevenlabs",
    license: "ai_generated",
    usage_notes: MUSIC_LICENSES.ai_generated.note,
    prompt,
    model,
    instrumental: input.instrumental,
    genres: input.genres.slice(0, 8),
    moods: input.moods.slice(0, 8),
    bpm: input.bpm,
    duration_seconds: seconds,
    status: "generating",
    dedupe_key: input.clientRequestId,
    project_id: input.projectId,
    campaign_id: input.campaignId,
    created_by: input.userId,
  } as never);
  if (insertError) {
    if (insertError.code === "23505") {
      // Another request got there first: this one, or the same music.
      const winner = (await existingByKey(input.clientRequestId)) ?? (await sameMusic());
      if (winner) return { track: await relinked(winner), duplicate: true };
      throw new AppError("UNKNOWN", "This music is already being made. Try again in a moment.");
    }
    throw new AppError("UNKNOWN", "The music could not be recorded.");
  }

  const settle = (values: Record<string, unknown>) => settleTrack(trackId, values);
  const made = await composeMusic({
    prompt: input.prompt,
    seconds,
    model,
    instrumental: input.instrumental,
  });
  if (!made.ok) {
    return settle({
      status: made.uncertain ? "submission_uncertain" : "failed",
      error_code: made.code,
      error_message: made.message,
      completed_at: new Date().toISOString(),
    });
  }

  const stored = await storeAudio({
    userId: input.userId,
    projectId: input.projectId,
    trackId,
    bytes: made.audio,
    mime: made.mime,
    title: input.title,
    generated: true,
    metadata: {
      ai_generated_music: true,
      provider: "elevenlabs",
      prompt: input.prompt.slice(0, 500),
    },
  });
  // Made, and charged, but not kept: never answered as a failure to simply try
  // again. It is uncertain, so the form holds it until the person chooses to
  // make (and pay for) it again.
  if (!stored)
    return settle({
      status: "submission_uncertain",
      error_code: "STORAGE_FAILED",
      error_message:
        "The music was made, and charged, but it couldn't be saved to the library. It wasn't made again by itself.",
      completed_at: new Date().toISOString(),
    });
  const ready = await markReady(trackId, {
    asset_id: stored.assetId,
    duration_seconds: stored.durationSeconds ?? seconds,
    provider_request_id: made.songId,
  });
  return { track: ready, duplicate: false };
}

/**
 * Instrumentals of this track already in the library: made, with their audio
 * still there (archived ones too), the newest first.
 */
async function readyInstrumentals(parentId: string): Promise<TrackRow[]> {
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("parent_track_id", parentId)
    .eq("source", "derived")
    .eq("status", "ready")
    .not("asset_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw trackUnchecked();
  const children = (data ?? []) as TrackRow[];
  if (!children.length) return [];
  const { data: kept, error: keptError } = await supabaseAdmin
    .from("assets")
    .select("id")
    .in(
      "id",
      children.map((child) => String(child["asset_id"])),
    )
    .is("deleted_at", null);
  if (keptError) throw trackUnchecked();
  const inLibrary = new Set(((kept ?? []) as { id: string }[]).map((row) => row.id));
  return children.filter((child) => inLibrary.has(String(child["asset_id"])));
}

/**
 * A new track with the vocals removed (one billable stem separation). If the
 * track already has an instrumental in the library, that one is returned
 * instead, unless a new one is asked for (`again`), which is charged again.
 * One that was archived is put back first, by whoever may archive it (its
 * maker or an admin); anyone else gets it back as it is (archived), to ask
 * them, and nothing is made.
 */
export async function makeInstrumental(input: {
  userId: string;
  trackId: string;
  clientRequestId: string;
  again?: boolean;
}): Promise<{ track: TrackRow; duplicate: boolean; reused?: boolean; restored?: boolean }> {
  const { isAdmin } = await requireActiveMember(input.userId);
  await settleInterrupted();
  const repeat = await existingByKey(input.clientRequestId);
  if (repeat) return { track: await relinked(repeat), duplicate: true };
  const parent = await loadTrack(input.trackId);
  if (!parent || parent["status"] !== "ready" || !parent["asset_id"])
    throw new AppError("INVALID_PARAMETERS", "That track isn't ready.");
  if (parent["instrumental"] === true)
    throw new AppError("INVALID_PARAMETERS", "That track is already instrumental.");
  // An instrumental of a track whose licence has run out couldn't be used, so
  // it isn't made (or paid for).
  const terms = licenceTerms(parent as never);
  if (terms?.expired)
    throw new AppError(
      "INVALID_PARAMETERS",
      `The licence for “${String(parent["title"])}” ran out on ${terms.expiresOn}, so an instrumental of it couldn't be used. Renew the licence first.`,
    );
  // One instrumental of a track is made at a time.
  const sameSplit = () => inProgress({ source: "derived", parent_track_id: parent.id });
  const making = await sameSplit();
  if (making) return { track: await relinked(making), duplicate: true };
  // One already made is used rather than paid for again, unless a new one is asked for.
  if (!input.again) {
    const made = await readyInstrumentals(parent.id);
    const shown = made.find((child) => child["is_archived"] !== true);
    if (shown) return { track: shown, duplicate: true, reused: true };
    const archived = made[0];
    if (archived && (isAdmin || archived["created_by"] === input.userId)) {
      const { data: restored, error: restoreError } = await supabaseAdmin
        .from("music_tracks")
        .update({ is_archived: false } as never)
        .eq("id", archived.id)
        .select("*")
        .maybeSingle();
      if (restoreError || !restored) throw trackUnchecked();
      return {
        track: restored as unknown as TrackRow,
        duplicate: true,
        reused: true,
        restored: true,
      };
    }
    if (archived) return { track: archived, duplicate: true, reused: true };
  }
  const { data: asset, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("storage_bucket,storage_path,mime_type,project_id")
    .eq("id", parent["asset_id"] as string)
    // Audio removed from the library isn't sent off (and paid for) again.
    .is("deleted_at", null)
    .maybeSingle();
  if (assetError) throw trackUnchecked();
  if (!asset)
    throw new AppError("INVALID_PARAMETERS", "The track's audio is no longer in the library.");
  // The original is held in memory to send it off, so only one of a size
  // that's safe to hold is split: its size as storage itself lists it.
  const original = await storedFile(asset.storage_path, asset.storage_bucket);
  if (!original)
    throw new AppError("INVALID_PARAMETERS", "The track's audio is no longer in the library.");
  const originalSize = Number(original.metadata?.["size"]);
  if (!Number.isFinite(originalSize) || originalSize > MAX_SPLIT_BYTES) throw tooLargeToSplit();
  // Nor one longer than the studio splits (whatever its length, the stems
  // that come back are read only up to a size).
  if (Number(parent["duration_seconds"] ?? 0) > MAX_SPLIT_SECONDS) throw tooLongToSplit();

  const license = parent["license"] as MusicLicense;
  const attribution =
    typeof parent["attribution"] === "string" && parent["attribution"]
      ? `${parent["attribution"]} Instrumental edit.`
      : null;
  const trackId = crypto.randomUUID();
  const projectId = (parent["project_id"] as string | null) ?? asset.project_id ?? null;
  const { error: insertError } = await supabaseAdmin.from("music_tracks").insert({
    id: trackId,
    title: `${String(parent["title"])} (instrumental)`.slice(0, 300),
    artist: parent["artist"] ?? null,
    kind: parent["kind"] ?? "music",
    source: "derived",
    source_id: parent.id,
    source_url: parent["source_url"] ?? null,
    provider: parent["provider"] ?? null,
    license,
    license_version: parent["license_version"] ?? null,
    license_url: parent["license_url"] ?? null,
    attribution,
    usage_notes: parent["usage_notes"] ?? null,
    rights: parent["rights"] ?? {},
    parent_track_id: parent.id,
    genres: parent["genres"] ?? [],
    moods: parent["moods"] ?? [],
    tags: parent["tags"] ?? [],
    bpm: parent["bpm"] ?? null,
    beats: parent["beats"] ?? null,
    instrumental: true,
    status: "generating",
    dedupe_key: input.clientRequestId,
    project_id: projectId,
    campaign_id: parent["campaign_id"] ?? null,
    created_by: input.userId,
  } as never);
  if (insertError) {
    if (insertError.code === "23505") {
      // Another request got there first: this one, or another instrumental of the track.
      const winner = (await existingByKey(input.clientRequestId)) ?? (await sameSplit());
      if (winner) return { track: await relinked(winner), duplicate: true };
      throw new AppError(
        "UNKNOWN",
        "An instrumental of this track is already being made. Try again in a moment.",
      );
    }
    throw new AppError("UNKNOWN", "The instrumental could not be recorded.");
  }
  const settle = (values: Record<string, unknown>) => settleTrack(trackId, values);

  const { data: blob, error: downloadError } = await supabaseAdmin.storage
    .from(asset.storage_bucket)
    .download(asset.storage_path);
  if (downloadError || !blob) {
    return settle({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The original track couldn't be read. Try again.",
      completed_at: new Date().toISOString(),
    });
  }
  // Nothing was sent (or billed) yet.
  if (blob.size > MAX_SPLIT_BYTES)
    return settle({
      status: "failed",
      error_code: "INVALID_PARAMETERS",
      error_message: tooLargeToSplit().message,
      completed_at: new Date().toISOString(),
    });
  // Its length, from the file itself, never from what's on record (which may
  // be missing or wrong), read in parts of the copy already held: one too
  // long, or whose length the file doesn't tell, isn't sent.
  const originalBytes: ReadRange = async (offset, length) =>
    new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
  const seconds = await probeDuration(originalBytes, blob.size);
  if (seconds === null || !Number.isFinite(seconds) || seconds > MAX_SPLIT_SECONDS)
    return settle({
      status: "failed",
      error_code: "INVALID_PARAMETERS",
      error_message: (seconds === null || !Number.isFinite(seconds)
        ? lengthUnknown()
        : tooLongToSplit()
      ).message,
      completed_at: new Date().toISOString(),
    });
  const mime = asset.mime_type ?? "audio/mpeg";
  const split = await separateInstrumental({
    audio: blob,
    mime,
    filename: `track.${audioExtension(mime)}`,
  });
  if (!split.ok) {
    return settle({
      status: split.uncertain ? "submission_uncertain" : "failed",
      error_code: split.code,
      error_message: split.message,
      completed_at: new Date().toISOString(),
    });
  }
  const stored = await storeAudio({
    userId: input.userId,
    projectId,
    trackId,
    bytes: split.instrumental,
    mime: split.mime,
    title: `${String(parent["title"])} (instrumental)`,
    generated: true,
    metadata: { derived_from_track: parent.id, stems: "two_stems_v1", license },
  });
  // Split, and charged, but not kept: uncertain, as for music made but not kept.
  if (!stored)
    return settle({
      status: "submission_uncertain",
      error_code: "STORAGE_FAILED",
      error_message:
        "The instrumental was made, and charged, but it couldn't be saved to the library. It wasn't made again by itself.",
      completed_at: new Date().toISOString(),
    });
  const ready = await markReady(trackId, {
    asset_id: stored.assetId,
    duration_seconds: stored.durationSeconds ?? parent["duration_seconds"] ?? null,
  });
  return { track: ready, duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Licensed and owned uploads                                          */
/* ------------------------------------------------------------------ */

/** Where the browser uploads a recording for its licence (the library's own upload bucket). */
const UPLOAD_BUCKET = "generation-inputs";

/** Audio the library takes as an upload (as the browser's ACCEPTED_MIME), stored under one name each. */
const UPLOAD_TYPES: Record<string, { mime: string; extension: string }> = {
  "audio/wav": { mime: "audio/wav", extension: "wav" },
  "audio/x-wav": { mime: "audio/wav", extension: "wav" },
  "audio/wave": { mime: "audio/wav", extension: "wav" },
  "audio/vnd.wave": { mime: "audio/wav", extension: "wav" },
  "audio/mpeg": { mime: "audio/mpeg", extension: "mp3" },
  "audio/mp4": { mime: "audio/mp4", extension: "m4a" },
  "audio/x-m4a": { mime: "audio/mp4", extension: "m4a" },
  "audio/flac": { mime: "audio/flac", extension: "flac" },
  "audio/x-flac": { mime: "audio/flac", extension: "flac" },
};

/**
 * The type of an upload whose browser gave none, or only a generic one, from
 * its file's name (its structure is checked once it's uploaded either way).
 */
function uploadTypeByName(fileName: string): { mime: string; extension: string } | undefined {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension === "wav"
    ? UPLOAD_TYPES["audio/wav"]
    : extension === "mp3"
      ? UPLOAD_TYPES["audio/mpeg"]
      : extension === "m4a"
        ? UPLOAD_TYPES["audio/mp4"]
        : extension === "flac"
          ? UPLOAD_TYPES["audio/flac"]
          : undefined;
}

/** What a recording uploaded for its licence may be (the form asks for WAV, MP3, M4A or FLAC). */
export const UPLOAD_KINDS: readonly ProbedAudio[] = ["mp3", "wav", "m4a", "flac"];

/** Uploads whose licence was never recorded are cleared after this long (the form keeps one for a day). */
const UPLOAD_TTL_MS = 2 * 24 * 60 * 60_000;
/**
 * How long an upload's licence can be recorded for: well inside the time the
 * cleanup waits, so a registration and the cleanup of the same upload never
 * overlap.
 */
const REGISTER_WINDOW_MS = UPLOAD_TTL_MS - 6 * 60 * 60_000;

/** The largest recording uploaded for its licence. */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const uploadTooLarge = () =>
  new AppError(
    "INVALID_PARAMETERS",
    `That file is too large (over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Upload a compressed copy (MP3, M4A or FLAC).`,
  );
const notAudio = () =>
  new AppError(
    "INVALID_PARAMETERS",
    "That file isn't audio the studio can use. Upload a WAV, MP3, M4A (AAC) or FLAC file.",
  );

type MusicUploadRow = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  asset_id: string | null;
  registered_at: string | null;
  cleanup_tried_at: string | null;
  created_at: string;
};

const uploadUnchecked = () =>
  new AppError("UNKNOWN", "The upload couldn't be checked. Try again in a moment.");
const uploadNotAdded = () =>
  new AppError("UNKNOWN", "The upload couldn't be added to the library just now. Try again.");

/**
 * Starts a recording's upload for its licence. The server records it first
 * (`music_uploads`, which only the server can read or write) and picks its
 * place; the browser then uploads the file there, and registering its licence
 * adds it to the library. So what an upload is, whose it is and how old it is
 * comes from the server's own record, never from a library record a member
 * could have changed.
 *
 * The server stages its own uploads the same way (an import through the
 * studio's API), under an id it works out from the request, so asking again
 * finds the upload already staged rather than staging another copy.
 */
export async function stageUpload(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  size: number;
  projectId: string | null;
  uploadId?: string;
}): Promise<{ uploadId: string; bucket: string; path: string }> {
  await requireActiveMember(input.userId);
  const untyped = input.mimeType === "" || input.mimeType === "application/octet-stream";
  const type =
    UPLOAD_TYPES[input.mimeType] ?? (untyped ? uploadTypeByName(input.fileName) : undefined);
  if (!type) throw new AppError("INVALID_PARAMETERS", "Upload a WAV, MP3, M4A or FLAC file.");
  if (input.size > MAX_UPLOAD_BYTES) throw uploadTooLarge();
  const uploadId = input.uploadId ?? crypto.randomUUID();
  const path = `${scopeFor(input.userId, input.projectId)}/music-uploads/${uploadId}.${type.extension}`;
  const { error } = await supabaseAdmin.from("music_uploads").insert({
    id: uploadId,
    user_id: input.userId,
    project_id: input.projectId,
    storage_bucket: UPLOAD_BUCKET,
    storage_path: path,
    file_name: input.fileName.slice(0, 200),
    mime_type: type.mime,
    file_size: input.size,
  } as never);
  if (error)
    throw new AppError("UNKNOWN", "The upload couldn't be started. Try again in a moment.");
  return { uploadId, bucket: UPLOAD_BUCKET, path };
}

/**
 * Clears uploads whose licence was never recorded, two days on, oldest first
 * and a few at a time. Run by the studio's recovery job (every five minutes),
 * so it doesn't wait on anyone uploading again. For each: the file at the
 * place the server picked for it, the library record the server added for it
 * (if it got that far), then the server's own record. Only these server
 * records decide what goes, so nothing a member can change points the cleanup
 * at anyone's file. One whose licence was recorded, or that was imported as
 * a voiceover (its last step didn't land), is finished instead. Best effort:
 * anything not cleared now is left for the next run. Returns how many were
 * cleared.
 *
 * Once `stop` aborts it takes no further step: its database requests are
 * cancelled, and it stops waiting for a file's removal (storage's client
 * can't cancel one). Every step is safe to repeat, a file or record already
 * gone being no error, so the next run finishes whatever was cut short.
 */
export async function clearAbandonedMusicUploads(stop?: AbortSignal): Promise<number> {
  const signal = stop ?? new AbortController().signal;
  const { data, error } = await supabaseAdmin
    .from("music_uploads")
    .select("id,storage_bucket,storage_path,asset_id")
    .is("registered_at", null)
    .lt("created_at", new Date(Date.now() - UPLOAD_TTL_MS).toISOString())
    // Ones not tried yet first, then those tried longest ago: one that keeps
    // failing goes to the back, so it never holds up the rest.
    .order("cleanup_tried_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(10)
    .abortSignal(signal);
  // Before the music library is set up there is nothing to clear.
  if (error) return 0;
  const uploads = (data ?? []) as Pick<
    MusicUploadRow,
    "id" | "storage_bucket" | "storage_path" | "asset_id"
  >[];
  if (!uploads.length) return 0;
  await supabaseAdmin
    .from("music_uploads")
    .update({ cleanup_tried_at: new Date().toISOString() } as never)
    .in(
      "id",
      uploads.map((upload) => upload.id),
    )
    .abortSignal(signal);
  let cleared = 0;
  for (const upload of uploads) {
    if (signal.aborted) break;
    if (upload.asset_id) {
      let recorded: boolean;
      try {
        recorded = await assetRecorded(upload.asset_id, signal);
      } catch {
        continue;
      }
      if (recorded) {
        const { error: shownError } = await supabaseAdmin
          .from("assets")
          .update({ deleted_at: null } as never)
          .eq("id", upload.asset_id)
          .eq("storage_bucket", upload.storage_bucket)
          .eq("storage_path", upload.storage_path)
          .abortSignal(signal);
        if (!shownError)
          await supabaseAdmin
            .from("music_uploads")
            .update({ registered_at: new Date().toISOString() } as never)
            .eq("id", upload.id)
            .abortSignal(signal);
        continue;
      }
    }
    const removed = await unlessStopped(
      supabaseAdmin.storage.from(upload.storage_bucket).remove([upload.storage_path]),
      signal,
    );
    if (!removed || removed.error) continue;
    if (upload.asset_id) {
      const { error: assetError } = await supabaseAdmin
        .from("assets")
        .delete()
        .eq("id", upload.asset_id)
        .eq("storage_bucket", upload.storage_bucket)
        .eq("storage_path", upload.storage_path)
        .abortSignal(signal);
      if (assetError) continue;
    }
    const { error: forgetError } = await supabaseAdmin
      .from("music_uploads")
      .delete()
      .eq("id", upload.id)
      .is("registered_at", null)
      .abortSignal(signal);
    if (!forgetError) cleared += 1;
  }
  return cleared;
}

/** What `work` comes to, or null once `signal` aborts (`work` itself isn't cancelled). */
function unlessStopped<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve, reject) => {
    const stopped = () => resolve(null);
    signal.addEventListener("abort", stopped, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", stopped);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", stopped);
        reject(error);
      },
    );
  });
}

export type UploadAsset = {
  id: string;
  asset_type: string;
  duration_seconds: number | string | null;
  deleted_at: string | null;
  storage_bucket: string;
  storage_path: string;
};
const ASSET_FIELDS = "id,asset_type,duration_seconds,deleted_at,storage_bucket,storage_path";

/** A stored file's size as storage lists it, or null when it isn't there. */
async function storedSize(bucket: string, path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(slash < 0 ? "" : path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw uploadUnchecked();
  const file = (listed ?? []).find((entry) => entry.name === name);
  if (!file) return null;
  const size = Number(file.metadata?.["size"]);
  if (!Number.isFinite(size)) throw uploadUnchecked();
  return size;
}

/**
 * Reads parts of a stored file (a few kilobytes at a time, by range) without
 * fetching the rest. A part that can't be read just now is thrown, never
 * taken for a file that isn't audio.
 */
async function storedRanges(bucket: string, path: string): Promise<ReadRange> {
  const { data: signed, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 120);
  if (error || !signed?.signedUrl) throw uploadUnchecked();
  const url = signed.signedUrl;
  return async (offset, length) => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
    } catch {
      throw uploadUnchecked();
    }
    if (!response.ok || !response.body) throw uploadUnchecked();
    // A server that ignores the range sends the whole file: skip to the part asked for.
    let skip = response.status === 206 ? 0 : offset;
    const part = new Uint8Array(length);
    let filled = 0;
    const reader = response.body.getReader();
    try {
      while (filled < length) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        let chunk = value;
        if (skip > 0) {
          const dropped = Math.min(skip, chunk.length);
          skip -= dropped;
          chunk = chunk.subarray(dropped);
        }
        const take = Math.min(chunk.length, length - filled);
        part.set(chunk.subarray(0, take), filled);
        filled += take;
      }
    } catch {
      throw uploadUnchecked();
    } finally {
      await reader.cancel().catch(() => {});
    }
    return part.subarray(0, filled);
  };
}

/**
 * Whether an upload's library record is on record as what it was uploaded
 * for: a track with its licence, or a voiceover imported in the Voice tab.
 * A lookup that fails is thrown, never taken for "not recorded".
 */
async function assetRecorded(assetId: string, signal?: AbortSignal): Promise<boolean> {
  let tracks = supabaseAdmin.from("music_tracks").select("id").eq("asset_id", assetId).limit(1);
  if (signal) tracks = tracks.abortSignal(signal);
  const { data: track, error: trackError } = await tracks.maybeSingle();
  if (trackError) throw uploadUnchecked();
  if (track) return true;
  let takes = supabaseAdmin.from("voiceovers").select("id").eq("asset_id", assetId).limit(1);
  if (signal) takes = takes.abortSignal(signal);
  const { data: take, error: takeError } = await takes.maybeSingle();
  if (takeError) {
    // Before brand voices are set up no upload is a voiceover.
    if (isMissingTableError(takeError)) return false;
    throw uploadUnchecked();
  }
  return !!take;
}

/** Whether an upload's library record is already recorded (a registration whose answer was lost). */
async function uploadHasTrack(upload: MusicUploadRow): Promise<boolean> {
  if (!upload.asset_id) return false;
  return assetRecorded(upload.asset_id);
}

/**
 * An upload's library record, added by the server from its own record of the
 * upload once the file is in its place, and kept out of the library until the
 * licence is recorded. Trying again (say after an answer was lost) finds the
 * record already added. A record someone else put at that place first is
 * taken over with the server's values, so it can't stand in for the upload.
 */
export async function uploadedAsset(input: {
  userId: string;
  uploadId: string;
  durationSeconds: number | null;
}): Promise<UploadAsset> {
  const { data, error } = await supabaseAdmin
    .from("music_uploads")
    .select("*")
    .eq("id", input.uploadId)
    .maybeSingle();
  if (error) throw uploadUnchecked();
  const upload = data as MusicUploadRow | null;
  if (!upload || upload.user_id !== input.userId)
    throw new AppError("INVALID_PARAMETERS", "Upload an audio file first.");
  // Past its window an upload's licence can't be recorded any more, as the
  // cleanup may be clearing it; only a retry for a track already recorded
  // (its answer lost) still finds that track.
  if (
    !upload.registered_at &&
    !(Date.parse(upload.created_at) > Date.now() - REGISTER_WINDOW_MS) &&
    !(await uploadHasTrack(upload))
  )
    throw new AppError("INVALID_PARAMETERS", "That upload has expired. Upload the file again.");
  const place = { storage_bucket: upload.storage_bucket, storage_path: upload.storage_path };
  if (upload.asset_id) {
    const { data: added, error: addedError } = await supabaseAdmin
      .from("assets")
      .select(ASSET_FIELDS)
      .eq("id", upload.asset_id)
      .eq("storage_bucket", place.storage_bucket)
      .eq("storage_path", place.storage_path)
      .maybeSingle();
    if (addedError) throw uploadUnchecked();
    if (added) return added as unknown as UploadAsset;
  }
  // The file must be in its place.
  const size = await storedSize(place.storage_bucket, place.storage_path);
  if (size === null) throw new AppError("INVALID_PARAMETERS", "Upload an audio file first.");
  // What was stored must be audio browsers and the renderer can decode (by its
  // structure: MP3 frames, a WAV's format and data, an M4A's sound track), of
  // a size the studio takes, whatever the browser said about it. One that
  // isn't is dropped now (file and upload) rather than left for the cleanup,
  // and never joins the library.
  const tooLarge = size > MAX_UPLOAD_BYTES;
  const kind = tooLarge
    ? null
    : await probeAudio(
        await storedRanges(place.storage_bucket, place.storage_path),
        size,
        UPLOAD_KINDS,
      );
  if (!kind) {
    const { error: dropError } = await supabaseAdmin.storage
      .from(place.storage_bucket)
      .remove([place.storage_path]);
    if (!dropError)
      await supabaseAdmin
        .from("music_uploads")
        .delete()
        .eq("id", upload.id)
        .is("asset_id", null)
        .is("registered_at", null);
    throw tooLarge ? uploadTooLarge() : notAudio();
  }
  const values = {
    uploaded_by: input.userId,
    project_id: upload.project_id,
    asset_type: "audio",
    source_type: "uploaded",
    title: upload.file_name.slice(0, 200),
    // What the file really is, which may differ from what the browser called it.
    mime_type: PROBED_MIME[kind],
    file_size: Number.isFinite(size) && size > 0 ? size : upload.file_size,
    duration_seconds:
      input.durationSeconds === null ? null : Number(input.durationSeconds.toFixed(2)),
    metadata: { music_upload_id: upload.id },
    // Out of the library until its licence is recorded.
    deleted_at: new Date().toISOString(),
  };
  let { data: asset, error: assetError } = await supabaseAdmin
    .from("assets")
    .insert({ ...values, ...place } as never)
    .select(ASSET_FIELDS)
    .maybeSingle();
  if (assetError?.code === "23505")
    ({ data: asset, error: assetError } = await supabaseAdmin
      .from("assets")
      .update(values as never)
      .eq("storage_bucket", place.storage_bucket)
      .eq("storage_path", place.storage_path)
      .select(ASSET_FIELDS)
      .maybeSingle());
  if (assetError || !asset) throw uploadNotAdded();
  const kept = asset as unknown as UploadAsset;
  const { error: linkError } = await supabaseAdmin
    .from("music_uploads")
    .update({ asset_id: kept.id } as never)
    .eq("id", upload.id);
  if (linkError) throw uploadNotAdded();
  return kept;
}

/**
 * How long an uploaded recording plays, read from the stored file the way
 * decoders play it, or null when its structure doesn't say (the browser's
 * measure is used then).
 */
export async function uploadedSeconds(asset: UploadAsset): Promise<number | null> {
  try {
    const size = await storedSize(asset.storage_bucket, asset.storage_path);
    if (size === null) return null;
    const seconds = await probeDuration(
      await storedRanges(asset.storage_bucket, asset.storage_path),
      size,
    );
    return seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Brings an upload into the library once what it was uploaded for is on
 * record (see assetRecorded), with any details the record gives its file.
 * Safe to repeat; the upload is marked done last, and if that doesn't land
 * the cleanup finds the record and marks it.
 */
export async function finishUpload(input: {
  uploadId: string;
  assetId: string;
  values?: Record<string, unknown>;
}): Promise<void> {
  const { error: shownError } = await supabaseAdmin
    .from("assets")
    .update({ ...input.values, deleted_at: null } as never)
    .eq("id", input.assetId);
  if (shownError)
    throw new AppError(
      "UNKNOWN",
      "It was recorded, but the file couldn't be added to the library just now. Try again.",
    );
  await supabaseAdmin
    .from("music_uploads")
    .update({ registered_at: new Date().toISOString() } as never)
    .eq("id", input.uploadId)
    .is("registered_at", null);
}

/**
 * Audio already in the library (added to an edit from the media bin, say), for
 * its licence: only real audio, and only audio no track holds yet. A catalogue
 * import, music made or an instrumental carries its licence with it, so a
 * second record would conflict with it; its file sits at its track's place in
 * the server's bucket, which is refused too, even before its track is
 * finished. (A recording already recorded by upload is found by the insert:
 * see registerUploadedTrack.)
 */
async function libraryAsset(assetId: string): Promise<UploadAsset> {
  const { data: asset, error } = await supabaseAdmin
    .from("assets")
    .select(ASSET_FIELDS)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw uploadUnchecked();
  const found = asset as unknown as UploadAsset | null;
  if (!found || found.deleted_at || found.asset_type !== "audio")
    throw new AppError("INVALID_PARAMETERS", "That recording is no longer in the library.");
  const tracked = (title: string | null) =>
    new AppError(
      "INVALID_PARAMETERS",
      `This recording is already in the music library${title ? ` as “${title}”` : ""}, with its licence on record.`,
    );
  if (found.storage_bucket === BUCKET && /\/music\/[^/]+$/.test(found.storage_path))
    throw tracked(null);
  const { data: holders, error: holdersError } = await supabaseAdmin
    .from("music_tracks")
    .select("title")
    .eq("asset_id", found.id)
    .neq("source", "upload")
    .limit(1);
  if (holdersError) throw uploadUnchecked();
  const holder = (holders ?? [])[0] as { title: string | null } | undefined;
  if (holder) throw tracked(holder.title);
  // What it holds must be audio browsers and the renderer can decode, as an
  // upload's must, whatever its record says: a media-bin file's type is only
  // what the browser called it. (Its size isn't held to an upload's limit: the
  // renderer takes larger files, and every other use of a track bounds its
  // own reads.)
  const size = await storedSize(found.storage_bucket, found.storage_path);
  if (size === null)
    throw new AppError("INVALID_PARAMETERS", "That recording is no longer in the library.");
  if (!(await probeAudio(await storedRanges(found.storage_bucket, found.storage_path), size)))
    throw notAudio();
  return found;
}

/**
 * Records the licence of a recording the brand owns or licensed: one it just
 * uploaded (see stageUpload), which then joins the library, or audio already
 * in the library. Registering a recording again (say after an answer was
 * lost, or to renew a licence that has run out) updates its track's terms as
 * now confirmed, for whoever added the track or an admin; never anyone else.
 * Only the terms change: the track keeps its project, tags and length. Its
 * instrumentals, which carry its licence, take the same terms.
 */
export async function registerUploadedTrack(input: {
  userId: string;
  uploadId: string | null;
  assetId: string | null;
  title: string;
  artist: string | null;
  kind: "music" | "sound_effect";
  license: "licensed" | "owned";
  rights: unknown;
  genres: string[];
  moods: string[];
  instrumental: boolean | null;
  durationSeconds: number | null;
  projectId: string | null;
  campaignId: string | null;
}): Promise<TrackRow> {
  const { isAdmin } = await requireActiveMember(input.userId);
  const asset = input.uploadId
    ? await uploadedAsset({
        userId: input.userId,
        uploadId: input.uploadId,
        durationSeconds: input.durationSeconds,
      })
    : await libraryAsset(input.assetId ?? "");
  // An upload's length (needed to loop it on the beat) comes from the browser
  // when the file record doesn't have one yet. The track row below carries it
  // either way; copying it onto the file as well is a convenience, so a failed
  // copy is left alone rather than failing the registration.
  const duration =
    asset.duration_seconds !== null ? Number(asset.duration_seconds) : input.durationSeconds;
  if (asset.duration_seconds === null && duration !== null)
    await supabaseAdmin
      .from("assets")
      .update({ duration_seconds: Number(duration.toFixed(3)) })
      .eq("id", asset.id)
      .is("duration_seconds", null);
  // The confirmation is stamped here, by the server, with who made it and when.
  const stamp = { confirmedBy: input.userId, confirmedAt: new Date().toISOString() };
  const rights =
    input.license === "licensed"
      ? { ...licensedRightsSchema.parse(input.rights), ...stamp }
      : { statement: "The brand owns this recording and its composition.", ...stamp };
  const terms = {
    title: input.title.slice(0, 300),
    artist: input.artist?.slice(0, 300) ?? null,
    kind: input.kind,
    license: input.license,
    usage_notes: MUSIC_LICENSES[input.license].note,
    rights: rights as never,
  };
  const values = {
    ...terms,
    duration_seconds: duration === null ? null : Number(duration.toFixed(3)),
    genres: input.genres.slice(0, 8),
    moods: input.moods.slice(0, 8),
    instrumental: input.instrumental,
    project_id: input.projectId,
    campaign_id: input.campaignId,
  };
  const notAdded = () => new AppError("UNKNOWN", "The track could not be added.");
  const { data: added, error } = await supabaseAdmin
    .from("music_tracks")
    .insert({
      ...values,
      asset_id: asset.id,
      source: "upload",
      status: "ready",
      created_by: input.userId,
      completed_at: new Date().toISOString(),
    } as never)
    .select("*")
    .maybeSingle();
  let track = (added ?? null) as TrackRow | null;
  if (error?.code === "23505") {
    // Registered already (an earlier answer may have been lost, or its licence
    // is being renewed): that track, with the terms as now confirmed, if it is
    // this person's or they're an admin; never anyone else's.
    const { data: earlier, error: earlierError } = await supabaseAdmin
      .from("music_tracks")
      .select("id,created_by")
      .eq("asset_id", asset.id)
      .eq("source", "upload")
      .maybeSingle();
    if (earlierError || !earlier) throw notAdded();
    if (earlier.created_by !== input.userId && !isAdmin)
      throw new AppError("INVALID_PARAMETERS", "This recording is already in the music library.");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("music_tracks")
      .update(terms as never)
      .eq("id", earlier.id)
      .select("*")
      .maybeSingle();
    if (updateError || !updated) throw notAdded();
    track = updated as unknown as TrackRow;
    // Its instrumentals carry its licence, copied when they were made: they
    // take the terms as now confirmed too, so the edits using them render
    // with them. (Trying again, if this doesn't land, records the same.)
    const { error: derivedError } = await supabaseAdmin
      .from("music_tracks")
      .update({
        license: terms.license,
        usage_notes: terms.usage_notes,
        rights: terms.rights,
      } as never)
      .eq("parent_track_id", earlier.id);
    if (derivedError)
      throw new AppError(
        "UNKNOWN",
        "The licence was recorded, but its instrumentals couldn't take it just now. Try again.",
      );
  } else if (error || !track) throw notAdded();
  // Only now, with its licence recorded, does an upload join the library.
  if (input.uploadId) {
    const { error: shownError } = await supabaseAdmin
      .from("assets")
      .update({ deleted_at: null } as never)
      .eq("id", asset.id);
    if (shownError)
      throw new AppError(
        "UNKNOWN",
        "The licence was recorded, but the track couldn't be added to the library just now. Try again.",
      );
    // Done with. If this doesn't land, the cleanup finds the track and marks it.
    await supabaseAdmin
      .from("music_uploads")
      .update({ registered_at: new Date().toISOString() } as never)
      .eq("id", input.uploadId);
  }
  return track;
}

/** What a database without migration 0033 says when asked for a track's structure columns. */
function isMissingColumnError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42703" || code === "PGRST204" || isMissingTableError(error);
}

export const STRUCTURE_NEEDS_MIGRATION =
  "Keeping a track's bars and sections needs a database update (migration 0033_music_structure). Ask an admin to apply it. Until then they are found again each time.";

/**
 * Caches the tempo and beats measured in the browser, so they're worked out
 * once per track, and its bars and sections with them when they were found.
 * Those go in columns of their own: before migration 0033 they aren't kept,
 * and the beats still are.
 */
export async function saveTrackAnalysis(input: {
  userId: string;
  trackId: string;
  bpm: number;
  beats: number[];
  durationSeconds: number | null;
  structure?: MusicStructure | null;
  features?: BarFeatures | null;
}): Promise<{ structureKept: boolean; message: string | null }> {
  await requireActiveMember(input.userId);
  const beats = input.beats
    .filter((beat) => Number.isFinite(beat) && beat >= 0)
    .slice(0, 5000)
    .map((beat) => Number(beat.toFixed(3)));
  const { error } = await supabaseAdmin
    .from("music_tracks")
    .update({ bpm: Number(input.bpm.toFixed(1)), beats } as never)
    .eq("id", input.trackId);
  if (error) throw new AppError("UNKNOWN", "The beat analysis could not be saved.");
  // A track without a recorded length gets the one the analysis measured. Best
  // effort: the editor fills the length from the analysis itself meanwhile.
  if (input.durationSeconds !== null)
    await supabaseAdmin
      .from("music_tracks")
      .update({ duration_seconds: Number(input.durationSeconds.toFixed(3)) } as never)
      .eq("id", input.trackId)
      .is("duration_seconds", null);
  if (!input.structure || !input.features) return { structureKept: false, message: null };
  const { error: structureError } = await supabaseAdmin
    .from("music_tracks")
    .update({ structure: input.structure, bar_features: input.features } as never)
    .eq("id", input.trackId);
  if (structureError) {
    if (isMissingColumnError(structureError))
      return { structureKept: false, message: STRUCTURE_NEEDS_MIGRATION };
    throw new AppError(
      "UNKNOWN",
      "The beats were saved, but the bars and sections couldn't be. They'll be found again next time.",
    );
  }
  return { structureKept: true, message: null };
}

export async function setTrackArchived(input: {
  userId: string;
  trackId: string;
  archived: boolean;
}): Promise<void> {
  const { isAdmin } = await requireActiveMember(input.userId);
  const track = await loadTrack(input.trackId);
  if (!track) throw new AppError("INVALID_PARAMETERS", "That track no longer exists.");
  if (track["created_by"] !== input.userId && !isAdmin)
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who added the track or an admin can archive it.",
    );
  const { error } = await supabaseAdmin
    .from("music_tracks")
    .update({ is_archived: input.archived } as never)
    .eq("id", input.trackId);
  if (error) throw new AppError("UNKNOWN", "The track could not be changed.");
}
