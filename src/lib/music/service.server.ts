/**
 * Music library service: brings tracks into the studio with their licence,
 * makes AI music and instrumentals, and records licensed uploads.
 *
 * Every billable call is recorded before it is made (status "generating"),
 * and a dropped connection is recorded as "submission_uncertain", never
 * retried by itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { mp3Duration } from "../voice/audio";
import {
  DEFAULT_MUSIC_MODEL,
  isSafeOpenverseLicense,
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

async function storeAudio(input: {
  userId: string;
  projectId: string | null;
  trackId: string;
  bytes: Uint8Array;
  mime: string;
  title: string;
  generated: boolean;
  metadata: Record<string, unknown>;
}): Promise<{ assetId: string; durationSeconds: number | null }> {
  const path = `${scopeFor(input.userId, input.projectId)}/music/${input.trackId}.${audioExtension(input.mime)}`;
  const upload = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, input.bytes, { contentType: input.mime, upsert: true });
  if (upload.error)
    throw new AppError("STORAGE_FAILED", "The track could not be saved to the library.");
  const durationSeconds = input.mime === "audio/mpeg" ? mp3Duration(input.bytes) : null;
  const { data: asset, error } = await supabaseAdmin
    .from("assets")
    .insert({
      uploaded_by: input.userId,
      project_id: input.projectId,
      asset_type: "audio",
      storage_bucket: BUCKET,
      storage_path: path,
      mime_type: input.mime,
      file_size: input.bytes.length,
      duration_seconds: durationSeconds,
      source_type: input.generated ? "generated" : "uploaded",
      title: input.title.slice(0, 200),
      metadata: { music_track_id: input.trackId, ...input.metadata } as never,
    })
    .select("id")
    .single();
  if (error || !asset)
    throw new AppError("STORAGE_FAILED", "The track could not be added to the library.");
  return { assetId: asset.id, durationSeconds };
}

type TrackRow = Record<string, unknown> & { id: string };

/** Work still "generating" after this long was interrupted before it was recorded. */
const STALE_MS = 15 * 60_000;
const isStale = (row: TrackRow) =>
  Date.now() - Date.parse(String(row["created_at"] ?? "")) > STALE_MS;

/**
 * A track whose file was stored but whose last update didn't land is
 * finished from that file (each stored file names its track). Anything else
 * comes back unchanged.
 */
async function relinked(row: TrackRow): Promise<TrackRow> {
  if (row["status"] !== "generating" || row["asset_id"]) return row;
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id,duration_seconds")
    .eq("metadata->>music_track_id", row.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!asset) return row;
  const { data } = await supabaseAdmin
    .from("music_tracks")
    .update({
      asset_id: asset.id,
      status: "ready",
      duration_seconds: asset.duration_seconds ?? row["duration_seconds"] ?? null,
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "generating")
    .select("*")
    .maybeSingle();
  return (data ?? row) as TrackRow;
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

/** Interrupted generations may still have been billed, so they're settled as uncertain, never retried. */
async function settleInterrupted(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("status", "generating")
    .neq("source", "openverse")
    .lt("created_at", cutoff)
    .limit(50);
  // One whose file was stored is finished, not uncertain.
  for (const row of (stale ?? []) as TrackRow[]) await relinked(row);
  await supabaseAdmin
    .from("music_tracks")
    .update({
      status: "submission_uncertain",
      error_code: "INTERRUPTED",
      error_message:
        "This was interrupted before it was saved. It may still have been billed, so it was not retried.",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("status", "generating")
    .neq("source", "openverse")
    .lt("created_at", cutoff);
}

async function loadTrack(id: string): Promise<TrackRow | null> {
  const { data } = await supabaseAdmin.from("music_tracks").select("*").eq("id", id).maybeSingle();
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
  const existing = async () =>
    (
      await supabaseAdmin
        .from("music_tracks")
        .select("*")
        .eq("source", "openverse")
        .eq("source_id", input.openverseId)
        .maybeSingle()
    ).data as TrackRow | null;
  let found = await existing();
  if (found) found = await relinked(found);
  // An import that was cut off (nothing billable) is cleared so it can be tried again.
  if (found && found["status"] !== "ready" && isStale(found)) {
    await supabaseAdmin.from("music_tracks").delete().eq("id", found.id);
    found = null;
  }
  if (found?.["status"] === "ready") {
    if (found["is_archived"])
      await supabaseAdmin
        .from("music_tracks")
        .update({ is_archived: false } as never)
        .eq("id", found.id);
    return { track: { ...found, is_archived: false }, duplicate: true };
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

  let stored: Awaited<ReturnType<typeof storeAudio>>;
  try {
    const file = await downloadAudio(source.audioUrl, source.filetype);
    if (!file.ok) throw new AppError(file.code as never, file.message);
    stored = await storeAudio({
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
  } catch (error) {
    // Nothing billable happened and nothing was stored: free the claim so it can be tried again.
    await supabaseAdmin.from("music_tracks").delete().eq("id", trackId);
    throw error;
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
  const { data } = await supabaseAdmin
    .from("music_tracks")
    .select("*")
    .eq("dedupe_key", key)
    .maybeSingle();
  return (data ?? null) as TrackRow | null;
}

/**
 * Records how a track ended and returns it. Outcomes (failed, uncertain) are
 * returned, not thrown: a thrown error then always means the caller didn't
 * hear the answer, so it may ask again with the same request id and get this
 * track back instead of paying for another.
 */
async function settleTrack(
  trackId: string,
  values: Record<string, unknown>,
): Promise<{ track: TrackRow; duplicate: boolean }> {
  const { data } = await supabaseAdmin
    .from("music_tracks")
    .update(values as never)
    .eq("id", trackId)
    .select("*")
    .maybeSingle();
  return { track: (data ?? { id: trackId, ...values }) as TrackRow, duplicate: false };
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
  seed: number | null;
  projectId: string | null;
  campaignId: string | null;
  clientRequestId: string;
}): Promise<{ track: TrackRow; duplicate: boolean }> {
  await requireActiveMember(input.userId);
  await settleInterrupted();
  const repeat = await existingByKey(input.clientRequestId);
  if (repeat) return { track: await relinked(repeat), duplicate: true };
  const seconds = Math.max(MUSIC_LENGTH.min, Math.min(MUSIC_LENGTH.max, input.seconds));

  const trackId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin.from("music_tracks").insert({
    id: trackId,
    title: input.title.slice(0, 300),
    artist: "Eleven Music",
    source: "elevenlabs",
    license: "ai_generated",
    usage_notes: MUSIC_LICENSES.ai_generated.note,
    prompt: input.prompt.slice(0, 4000),
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
      const winner = await existingByKey(input.clientRequestId);
      if (winner) return { track: await relinked(winner), duplicate: true };
    }
    throw new AppError("UNKNOWN", "The music could not be recorded.");
  }

  const settle = (values: Record<string, unknown>) => settleTrack(trackId, values);
  const made = await composeMusic({
    prompt: input.prompt,
    seconds,
    model: input.model ?? DEFAULT_MUSIC_MODEL,
    instrumental: input.instrumental,
    seed: input.seed,
  });
  if (!made.ok) {
    return settle({
      status: made.uncertain ? "submission_uncertain" : "failed",
      error_code: made.code,
      error_message: made.message,
      completed_at: new Date().toISOString(),
    });
  }

  let stored: Awaited<ReturnType<typeof storeAudio>>;
  try {
    stored = await storeAudio({
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
  } catch {
    return settle({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The music was made but could not be saved to the library. Try again.",
      completed_at: new Date().toISOString(),
    });
  }
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
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("storage_bucket,storage_path,mime_type,project_id")
    .eq("id", parent["asset_id"] as string)
    .maybeSingle();
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
      const winner = await existingByKey(input.clientRequestId);
      if (winner) return { track: await relinked(winner), duplicate: true };
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
  let stored: Awaited<ReturnType<typeof storeAudio>>;
  try {
    stored = await storeAudio({
      userId: input.userId,
      projectId,
      trackId,
      bytes: split.instrumental,
      mime: split.mime,
      title: `${String(parent["title"])} (instrumental)`,
      generated: true,
      metadata: { derived_from_track: parent.id, stems: "two_stems_v1", license },
    });
  } catch {
    return settle({
      status: "failed",
      error_code: "STORAGE_FAILED",
      error_message: "The instrumental was made but could not be saved to the library. Try again.",
      completed_at: new Date().toISOString(),
    });
  }
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
      duration_seconds: asset.duration_seconds,
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
