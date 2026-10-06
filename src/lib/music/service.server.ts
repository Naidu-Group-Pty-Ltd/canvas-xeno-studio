/**
 * Music library service: brings tracks into the studio with their licence,
 * makes AI music and instrumentals, and records licensed uploads.
 *
 * Every billable call is recorded before it is made (status "generating"),
 * and a dropped connection is recorded as "submission_uncertain", never
 * retried by itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { derivedUuid } from "../derived-id";
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
import {
  audioExtension,
  composeMusic,
  downloadAudio,
  openverseTrack,
  separateInstrumental,
} from "./providers.server";

const BUCKET = "generated-assets";

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
): Promise<{ name: string; metadata?: Record<string, unknown> | null } | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw trackUnchecked();
  return (listed ?? []).find((entry) => entry.name === name) ?? null;
}

/**
 * Adds a track's file to the library, once. The record's id is derived from
 * the track's, so trying again (after an insert whose answer was lost, or when
 * the track is finished later from its file) finds the record already made
 * instead of adding another. A record under that id counts only if it is the
 * track's own file in the server-only bucket. Returns it, or null if it
 * couldn't be added just now; a lookup that fails is thrown.
 */
async function keptAsset(
  trackId: string,
  path: string,
  values: Record<string, unknown>,
): Promise<{ id: string; durationSeconds: number | null } | null> {
  const id = await derivedUuid(`music-asset:${trackId}`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabaseAdmin
      .from("assets")
      .insert({ ...values, id, storage_bucket: BUCKET, storage_path: path } as never);
    if (!error) {
      const seconds = values["duration_seconds"];
      return { id, durationSeconds: typeof seconds === "number" ? seconds : null };
    }
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("assets")
      .select("storage_bucket,storage_path,duration_seconds")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw trackUnchecked();
    if (existing) {
      if (existing.storage_bucket !== BUCKET || existing.storage_path !== path)
        throw trackUnchecked();
      return {
        id,
        durationSeconds:
          existing.duration_seconds === null ? null : Number(existing.duration_seconds),
      };
    }
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
  const asset = await keptAsset(input.trackId, path, {
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
  const asset = await keptAsset(row.id, `${base}.${extension}`, {
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

/**
 * Interrupted generations may still have been billed, so they're settled as
 * uncertain, never retried. One whose file was stored is finished instead,
 * and one that can't be checked right now is left for the next sweep.
 */
async function settleInterrupted(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: stale, error } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("status", "generating")
    .neq("source", "openverse")
    .lt("created_at", cutoff)
    .limit(50);
  if (error) return;
  for (const row of (stale ?? []) as TrackRow[]) {
    try {
      if ((await relinked(row))["status"] !== "generating") continue;
    } catch {
      continue;
    }
    await supabaseAdmin
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

export async function importOpenverseTrack(input: {
  userId: string;
  openverseId: string;
  projectId: string | null;
  campaignId: string | null;
}): Promise<{ track: TrackRow; duplicate: boolean }> {
  await requireActiveMember(input.userId);
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
    if (!found["is_archived"]) return { track: found, duplicate: true };
    // Imported before and archived since: it is restored, and only reported
    // restored once that is recorded.
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
    return { track: restored as TrackRow, duplicate: true };
  }
  if (found) throw new AppError("UNKNOWN", "This track is already being added. Give it a moment.");

  // The licence comes from Openverse itself, not from the browser.
  const detail = await openverseTrack(input.openverseId);
  if (!detail.ok) throw new AppError(detail.code as never, detail.message);
  const source = detail.track;
  if (!isSafeOpenverseLicense(source.license))
    throw new AppError(
      "INVALID_PARAMETERS",
      `This track's licence (${source.license.toUpperCase()}) doesn't allow commercial use and edits, so it can't be added.`,
    );
  if (!source.audioUrl)
    throw new AppError("INVALID_PARAMETERS", "This track has no downloadable file.");

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
  // claim stays, and the next import finishes the track from that file.
  const release = () => supabaseAdmin.from("music_tracks").delete().eq("id", trackId);
  const file = await downloadAudio(source.audioUrl, source.filetype).catch(async (error) => {
    await release();
    throw error;
  });
  if (!file.ok) {
    await release();
    throw new AppError(file.code as never, file.message);
  }
  const stored = await storeAudio({
    userId: input.userId,
    projectId: input.projectId,
    trackId,
    bytes: file.bytes,
    mime: file.mime,
    title: source.creator ? `${source.title} — ${source.creator}` : source.title,
    generated: false,
    metadata: {
      imported_from: "openverse",
      license,
      license_url: source.licenseUrl,
      attribution: source.attribution,
      source_url: source.landingUrl,
    },
  });
  if (!stored) {
    await release();
    throw new AppError("STORAGE_FAILED", "The track could not be saved to the library.");
  }
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
  const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
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
  const sameMusic = () =>
    inProgress(
      {
        source: "elevenlabs",
        project_id: input.projectId,
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
  if (!stored)
    return settle({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The music was made but could not be saved to the library. Try again.",
      completed_at: new Date().toISOString(),
    });
  const ready = await markReady(trackId, {
    asset_id: stored.assetId,
    duration_seconds: stored.durationSeconds ?? seconds,
    provider_request_id: made.songId,
  });
  return { track: ready, duplicate: false };
}

/** A new track with the vocals removed (one billable stem separation). */
export async function makeInstrumental(input: {
  userId: string;
  trackId: string;
  clientRequestId: string;
}): Promise<{ track: TrackRow; duplicate: boolean }> {
  await requireActiveMember(input.userId);
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
  const { data: asset, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("storage_bucket,storage_path,mime_type,project_id")
    .eq("id", parent["asset_id"] as string)
    .maybeSingle();
  if (assetError) throw trackUnchecked();
  if (!asset)
    throw new AppError("INVALID_PARAMETERS", "The track's audio is no longer in the library.");

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
  const mime = asset.mime_type ?? "audio/mpeg";
  const split = await separateInstrumental({
    audio: new Uint8Array(await blob.arrayBuffer()),
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
  if (!stored)
    return settle({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The instrumental was made but could not be saved to the library. Try again.",
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

export async function registerUploadedTrack(input: {
  userId: string;
  assetId: string;
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
  await requireActiveMember(input.userId);
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,duration_seconds,deleted_at")
    .eq("id", input.assetId)
    .maybeSingle();
  if (!asset || asset.deleted_at || asset.asset_type !== "audio")
    throw new AppError("INVALID_PARAMETERS", "Upload an audio file first.");
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
  const { data, error } = await supabaseAdmin
    .from("music_tracks")
    .insert({
      asset_id: asset.id,
      title: input.title.slice(0, 300),
      artist: input.artist?.slice(0, 300) ?? null,
      kind: input.kind,
      source: "upload",
      license: input.license,
      usage_notes: MUSIC_LICENSES[input.license].note,
      rights: rights as never,
      duration_seconds: duration === null ? null : Number(duration.toFixed(3)),
      genres: input.genres.slice(0, 8),
      moods: input.moods.slice(0, 8),
      instrumental: input.instrumental,
      status: "ready",
      project_id: input.projectId,
      campaign_id: input.campaignId,
      created_by: input.userId,
      completed_at: new Date().toISOString(),
    } as never)
    .select("*")
    .single();
  if (error || !data) throw new AppError("UNKNOWN", "The track could not be added.");
  return data as unknown as TrackRow;
}

/** Caches the tempo and beats measured in the browser, so they're worked out once per track. */
export async function saveTrackAnalysis(input: {
  userId: string;
  trackId: string;
  bpm: number;
  beats: number[];
  durationSeconds: number | null;
}): Promise<void> {
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
