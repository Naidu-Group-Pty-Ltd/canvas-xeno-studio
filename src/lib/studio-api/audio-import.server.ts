/**
 * Audio into the studio's library through its API (import_audio): a track
 * the brand licensed or owns (music or a sound effect), or a voiceover
 * recorded elsewhere, from its bytes or a public https address.
 *
 * It goes in the way the app's own upload goes, through the same code: the
 * server stages the upload (stageUpload, the music library's own record of
 * it), stores the file where it picked, then records it as the app's forms
 * do. A track joins the music library with its licence confirmed by the
 * token's owner (registerUploadedTrack); a voiceover joins an edit's Voice
 * tab as a take, with the consent statement stamped on its file
 * (importVoiceover). Either way the stored file's structure is checked again
 * before anything is recorded.
 *
 * The upload's id is worked out from the token's owner and the request's
 * clientRequestId, so asking again finds the first import (or finishes one
 * that was cut short) rather than adding a second copy.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { PROBED_MIME, probeBytes, probeDuration, type ProbedAudio } from "../music/probe";
import type { ApiCaller } from "./tokens.server";

const MB = 1024 * 1024;

/**
 * The most an import may weigh. The file is held in memory on its way into
 * storage, as catalogue downloads are; base64 in a request's body is a third
 * larger again, so less is taken that way.
 */
export const AUDIO_IMPORT_LIMITS = { urlBytes: 40 * MB, dataBytes: 20 * MB } as const;

/** What the library takes as an upload, by its structure (the music service's UPLOAD_KINDS). */
const IMPORT_KINDS: readonly ProbedAudio[] = ["mp3", "wav", "m4a", "flac"];

const EXTENSIONS: Record<ProbedAudio, string> = {
  mp3: "mp3",
  wav: "wav",
  m4a: "m4a",
  ogg: "ogg",
  flac: "flac",
};

export interface AudioImportRequest {
  title: string;
  data?: string | undefined;
  url?: string | undefined;
  use: "music" | "sound_effect" | "voiceover";
  artist?: string | null | undefined;
  licence?: "licensed" | "owned" | undefined;
  rights?: Record<string, unknown> | undefined;
  genres: string[];
  moods: string[];
  instrumental?: boolean | null | undefined;
  sequenceId?: string | undefined;
  transcript?: string | null | undefined;
  projectId?: string | null | undefined;
  campaignId?: string | null | undefined;
  clientRequestId: string;
}

export interface AudioImported {
  assetId: string;
  /** False when this request had imported it already: the first import is returned. */
  imported: boolean;
  use: "music" | "sound_effect" | "voiceover";
  /** Its music library record (music and sound effects). */
  trackId: string | null;
  /** Its take in the edit's Voice tab (voiceovers). */
  voiceoverId: string | null;
  mimeType: string | null;
  durationSeconds: number | null;
}

/**
 * The upload an import is staged as: the same for the same owner and request
 * id, so a retry finds it. A name-based id (RFC 9562's version 8) from
 * SHA-256, never one a member's own upload could have been given.
 */
export async function importUploadId(userId: string, clientRequestId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`import_audio\n${userId}\n${clientRequestId}`),
    ),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The file's name as the library shows it until a title is given: the title, as a slug. */
function fileName(title: string, kind: ProbedAudio): string {
  const name =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "audio";
  return `${name}.${EXTENSIONS[kind]}`;
}

/** The audio's bytes: base64 (a data: prefix is fine) or read from a public https address. */
async function audioBytes(args: AudioImportRequest): Promise<Uint8Array> {
  if (args.data) {
    const { base64ToBytes } = await import("../voice/audio");
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(args.data.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
    } catch {
      throw new AppError("INVALID_PARAMETERS", "The data isn't base64");
    }
    if (bytes.byteLength > AUDIO_IMPORT_LIMITS.dataBytes)
      throw new AppError(
        "INVALID_PARAMETERS",
        `The audio is larger than ${AUDIO_IMPORT_LIMITS.dataBytes / MB} MB: send a larger file by its url (up to ${AUDIO_IMPORT_LIMITS.urlBytes / MB} MB), or a compressed copy (FLAC, M4A or MP3)`,
      );
    return bytes;
  }
  const url = args.url ?? "";
  if (!/^https:\/\//i.test(url))
    throw new AppError("INVALID_PARAMETERS", "The url must be an https address");
  const { fetchCapped } = await import("../brand/fetch.server");
  const fetched = await fetchCapped(url, {
    maxBytes: AUDIO_IMPORT_LIMITS.urlBytes,
    timeoutMs: 60_000,
    headers: { accept: "audio/flac,audio/wav,audio/mpeg,audio/mp4;q=0.9,audio/*;q=0.5,*/*;q=0.1" },
  });
  if (!fetched.ok)
    throw new AppError(
      "INVALID_PARAMETERS",
      `The audio couldn't be read: ${fetched.reason}${fetched.reason === "it is too large" ? ` (over ${AUDIO_IMPORT_LIMITS.urlBytes / MB} MB)` : ""}`,
    );
  return fetched.bytes;
}

interface StagedUpload {
  id: string;
  user_id: string | null;
  storage_bucket: string;
  storage_path: string;
  asset_id: string | null;
  registered_at: string | null;
}

/** The upload this request staged, if it got that far. A lookup that fails is thrown. */
async function stagedUpload(uploadId: string): Promise<StagedUpload | null> {
  const { data, error } = await db
    .from("music_uploads")
    .select("id,user_id,storage_bucket,storage_path,asset_id,registered_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (error)
    throw new AppError(
      "UNKNOWN",
      "The music library couldn't be checked for this import. Try again in a moment.",
    );
  return (data as StagedUpload | null) ?? null;
}

/**
 * What an upload became, once it is on record: a track in the music library,
 * or a voiceover take. Null while neither is (it is finished then).
 */
async function recordedImport(upload: StagedUpload): Promise<AudioImported | null> {
  if (!upload.asset_id) return null;
  const { data: asset } = await db
    .from("assets")
    .select("id,mime_type,duration_seconds,deleted_at")
    .eq("id", upload.asset_id)
    .maybeSingle();
  // Still out of the library: its last step didn't land, so it is finished now.
  if (!asset || asset.deleted_at) return null;
  const seconds = asset.duration_seconds === null ? null : Number(asset.duration_seconds);
  const { data: track } = await db
    .from("music_tracks")
    .select("id,kind,duration_seconds")
    .eq("asset_id", asset.id)
    .eq("source", "upload")
    .maybeSingle();
  if (track)
    return {
      assetId: asset.id,
      imported: false,
      use: track.kind === "sound_effect" ? "sound_effect" : "music",
      trackId: track.id,
      voiceoverId: null,
      mimeType: asset.mime_type,
      durationSeconds: track.duration_seconds === null ? seconds : Number(track.duration_seconds),
    };
  const { data: take } = await db
    .from("voiceovers")
    .select("id,duration_seconds")
    .eq("dedupe_key", `upload:${upload.id}`)
    .maybeSingle();
  if (take)
    return {
      assetId: asset.id,
      imported: false,
      use: "voiceover",
      trackId: null,
      voiceoverId: take.id,
      mimeType: asset.mime_type,
      durationSeconds: take.duration_seconds === null ? seconds : Number(take.duration_seconds),
    };
  return null;
}

/** Where the file came from, kept on it as import_image keeps it. Best effort: the import stands either way. */
async function noteOrigin(assetId: string, args: AudioImportRequest, caller: ApiCaller) {
  const { data: asset } = await db
    .from("assets")
    .select("metadata")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return;
  const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
  await db
    .from("assets")
    .update({
      metadata: {
        ...metadata,
        source: "studio_api",
        token_id: caller.tokenId,
        client_request_id: args.clientRequestId,
        ...(args.url ? { origin: args.url } : {}),
      } as never,
    })
    .eq("id", assetId);
}

/** Imports audio for the token's owner (see the module's comment). */
export async function importAudio(
  args: AudioImportRequest,
  caller: ApiCaller,
): Promise<AudioImported> {
  if (!args.data === !args.url)
    throw new AppError("INVALID_PARAMETERS", "Give the audio as data or as a url, not both");
  const voiceover = args.use === "voiceover";
  if (voiceover && !args.sequenceId)
    throw new AppError(
      "INVALID_PARAMETERS",
      "A voiceover is imported into an edit's Voice tab: give the edit's sequenceId",
    );
  if (!voiceover && !args.licence)
    throw new AppError(
      "INVALID_PARAMETERS",
      'Say what the brand holds for this recording: licence "licensed" (with its rights) or "owned"',
    );
  if (!voiceover && args.licence === "licensed" && !args.rights)
    throw new AppError(
      "INVALID_PARAMETERS",
      "Add the licence's rights: who licensed it (licensor) and where it may be used (scopes)",
    );

  // A voiceover is kept with its edit, in the edit's project; music where it is asked for.
  let projectId = args.projectId ?? null;
  if (voiceover) {
    const { data: sequence } = await db
      .from("sequences")
      .select("id,project_id")
      .eq("id", args.sequenceId!)
      .maybeSingle();
    if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
    projectId = sequence.project_id;
  } else if (projectId) {
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
  }

  const uploadId = await importUploadId(caller.userId, args.clientRequestId);
  const earlier = await stagedUpload(uploadId);
  if (earlier && earlier.user_id !== caller.userId)
    throw new AppError("INVALID_PARAMETERS", "That clientRequestId was used for another import");
  if (earlier) {
    const done = await recordedImport(earlier);
    if (done) return done;
  }

  const bytes = await audioBytes(args);
  const kind = await probeBytes(bytes, IMPORT_KINDS);
  if (!kind)
    throw new AppError(
      "INVALID_PARAMETERS",
      "That isn't audio the studio can use: send a WAV, MP3, M4A (AAC) or FLAC file",
    );
  const seconds = await probeDuration(
    async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)),
    bytes.length,
  );
  const durationSeconds =
    seconds !== null && Number.isFinite(seconds) && seconds > 0 && seconds <= 7200
      ? Number(seconds.toFixed(3))
      : null;

  const music = await import("../music/service.server");
  const place = earlier
    ? { bucket: earlier.storage_bucket, path: earlier.storage_path }
    : await music.stageUpload({
        userId: caller.userId,
        fileName: fileName(args.title, kind),
        mimeType: PROBED_MIME[kind],
        size: bytes.byteLength,
        projectId,
        uploadId,
      });
  // A try whose answer was lost may have stored it already: that is this file.
  const { error: storeError } = await db.storage
    .from(place.bucket)
    .upload(place.path, bytes, { contentType: PROBED_MIME[kind], upsert: false });
  if (storeError && !/already exists|duplicate/i.test(storeError.message))
    throw new AppError("STORAGE_FAILED", "The audio couldn't be stored. Try again.");

  if (voiceover) {
    const { importVoiceover } = await import("../voice/service.server");
    const take = await importVoiceover({
      userId: caller.userId,
      uploadId,
      sequenceId: args.sequenceId!,
      title: args.title,
      transcript: args.transcript ?? null,
      durationSeconds,
    });
    if (take.assetId) await noteOrigin(take.assetId, args, caller).catch(() => {});
    const { data: asset } = take.assetId
      ? await db.from("assets").select("mime_type").eq("id", take.assetId).maybeSingle()
      : { data: null };
    return {
      assetId: take.assetId ?? "",
      imported: !take.duplicate,
      use: "voiceover",
      trackId: null,
      voiceoverId: take.voiceoverId,
      mimeType: asset?.mime_type ?? PROBED_MIME[kind],
      durationSeconds: take.durationSeconds,
    };
  }

  let track: Record<string, unknown> & { id: string };
  try {
    track = await music.registerUploadedTrack({
      userId: caller.userId,
      uploadId,
      assetId: null,
      title: args.title,
      artist: args.artist ?? null,
      kind: args.use === "sound_effect" ? "sound_effect" : "music",
      license: args.licence!,
      rights: args.rights ?? {},
      genres: args.genres,
      moods: args.moods,
      instrumental: args.instrumental ?? null,
      durationSeconds,
      projectId,
      campaignId: args.campaignId ?? null,
    });
  } catch (error) {
    // The licence's terms are checked as the app's form checks them.
    if (error && typeof error === "object" && "issues" in error)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Add who licensed the track (rights.licensor, at least 2 characters) and where it may be used (rights.scopes)",
      );
    throw error;
  }
  const assetId = typeof track["asset_id"] === "string" ? track["asset_id"] : "";
  if (assetId) await noteOrigin(assetId, args, caller).catch(() => {});
  return {
    assetId,
    imported: true,
    use: args.use,
    trackId: track.id,
    voiceoverId: null,
    mimeType: PROBED_MIME[kind],
    durationSeconds:
      track["duration_seconds"] == null ? durationSeconds : Number(track["duration_seconds"]),
  };
}
