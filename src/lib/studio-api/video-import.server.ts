/**
 * A finished video into the studio's library through its API (import_video):
 * an animatic, a proof or a film made outside the studio, so a review gate
 * can hold it (add_review_version) and the Editor can place it.
 *
 * A video is too large to pass through the app, so its bytes go straight to
 * storage, as a work's files do. The first call says where to send them (a
 * signed address, good for two hours); the next with the same
 * clientRequestId, once they are there, checks that the stored file is a
 * video of the size declared, adds it to the library as the app's own upload
 * would, and asks the media service to measure it (its exact length, size
 * and frame rate then replace the figures given).
 *
 * The file's place is worked out from the token's owner and the request id,
 * so asking again finds the same upload; the library record keeps the
 * request id, so a video is never added twice.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import type { ApiCaller } from "./tokens.server";

const MB = 1024 * 1024;

/**
 * A video goes to storage in one upload, and storage takes at most 50 MiB in
 * one (as a work's files are capped). A film longer than that goes in as a
 * review copy: the master stays with the work.
 */
export const VIDEO_IMPORT_LIMITS = { bytes: 50 * MB, uploadSeconds: 2 * 60 * 60 } as const;

/** The containers the library takes as a video upload, with the extension each is stored under. */
export const VIDEO_IMPORT_TYPES = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
} as const;
export type VideoImportType = keyof typeof VIDEO_IMPORT_TYPES;

const BUCKET = "generation-inputs";
/** Enough of the file to tell its container by: its first box, or its EBML header. */
const SNIFF_BYTES = 64;

export interface VideoImportRequest {
  title: string;
  mimeType: VideoImportType;
  byteSize: number;
  sha256?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  durationSeconds?: number | undefined;
  fps?: number | undefined;
  projectId?: string | null | undefined;
  clientRequestId: string;
}

export type VideoImportAnswer =
  | {
      status: "upload";
      /** Where to send the bytes: one PUT of the whole file, with these headers. */
      upload: {
        url: string;
        method: "PUT";
        headers: Record<string, string>;
        expiresInSeconds: number;
      };
      byteSize: number;
      next: string;
    }
  | {
      status: "imported";
      assetId: string;
      /** False when this request had imported it already: the first import is returned. */
      imported: boolean;
      mimeType: string | null;
      byteSize: number | null;
      width: number | null;
      height: number | null;
      durationSeconds: number | null;
      /** Asked of the media service now: its measurement replaces the figures given. */
      measuring: boolean;
    };

const unchecked = () =>
  new AppError("UNKNOWN", "The video couldn't be checked just now. Try again in a moment.");

/**
 * The upload's name: the same for the same owner and request id, so a retry
 * finds it, and never a name anyone's own upload could have been given.
 */
async function uploadName(userId: string, clientRequestId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`import_video\n${userId}\n${clientRequestId}`),
    ),
  );
  return `api-video-${Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** A stored file's size as storage lists it, or null when it isn't there; a listing that fails is thrown. */
async function storedSize(path: string): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const { data: listed, error } = await db.storage
    .from(BUCKET)
    .list(path.slice(0, slash), { search: name, limit: 10 });
  if (error) throw unchecked();
  const file = (listed ?? []).find((entry) => entry.name === name);
  if (!file) return null;
  const size = Number(file.metadata?.["size"]);
  if (!Number.isFinite(size)) throw unchecked();
  return size;
}

/** The file's first bytes, read by range (storage may send the whole file: only its start is kept). */
async function firstBytes(path: string): Promise<Uint8Array> {
  const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !signed?.signedUrl) throw unchecked();
  let response: Response;
  try {
    response = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` } });
  } catch {
    throw unchecked();
  }
  if (!response.ok || !response.body) throw unchecked();
  const head = new Uint8Array(SNIFF_BYTES);
  let filled = 0;
  const reader = response.body.getReader();
  try {
    while (filled < SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, SNIFF_BYTES - filled);
      head.set(value.subarray(0, take), filled);
      filled += take;
    }
  } catch {
    throw unchecked();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return head.subarray(0, filled);
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/**
 * The container a file's first bytes say it is: an ISO media file (MP4, or
 * QuickTime when its brand says so) opens with its ftyp box; WebM with an
 * EBML header naming webm (Matroska alone isn't taken). Anything else is null.
 */
export function videoContainer(head: Uint8Array): VideoImportType | null {
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp")
    return ascii(head, 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3 &&
    ascii(head, 4, head.length).includes("webm")
  )
    return "video/webm";
  return null;
}

/** MP4 and QuickTime are one family: a file of either may be declared as the other. */
const sameFamily = (declared: VideoImportType, found: VideoImportType) =>
  declared === found || (declared !== "video/webm" && found !== "video/webm");

type AssetRow = {
  id: string;
  mime_type: string | null;
  file_size: number | string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | string | null;
};
const ASSET_FIELDS = "id,mime_type,file_size,width,height,duration_seconds";

function importedAnswer(row: AssetRow, imported: boolean, measuring: boolean): VideoImportAnswer {
  const number = (value: number | string | null) => (value === null ? null : Number(value));
  return {
    status: "imported",
    assetId: row.id,
    imported,
    mimeType: row.mime_type,
    byteSize: number(row.file_size),
    width: row.width,
    height: row.height,
    durationSeconds: number(row.duration_seconds),
    measuring,
  };
}

export async function importVideo(
  args: VideoImportRequest,
  caller: ApiCaller,
): Promise<VideoImportAnswer> {
  if (!(args.mimeType in VIDEO_IMPORT_TYPES))
    throw new AppError("INVALID_PARAMETERS", "A video is an MP4, QuickTime (MOV) or WebM file");
  if (
    !Number.isInteger(args.byteSize) ||
    args.byteSize < 1 ||
    args.byteSize > VIDEO_IMPORT_LIMITS.bytes
  )
    throw new AppError(
      "INVALID_PARAMETERS",
      `A video is 1 byte to ${VIDEO_IMPORT_LIMITS.bytes / MB} MB (one upload to storage): send a review copy of a longer film`,
    );

  // Imported already for this request: the first import.
  const { data: before, error: beforeError } = await db
    .from("assets")
    .select(ASSET_FIELDS)
    .eq("uploaded_by", caller.userId)
    .contains("metadata", { client_request_id: args.clientRequestId, imported_by: "import_video" })
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (beforeError) throw unchecked();
  if (before) return importedAnswer(before as AssetRow, false, false);

  const projectId = args.projectId ?? null;
  if (projectId) {
    const { data: project, error } = await db
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw unchecked();
    if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
  }
  const scope = projectId ? `projects/${projectId}` : `unassigned/${caller.userId}`;
  const path = `${scope}/inputs/${await uploadName(caller.userId, args.clientRequestId)}.${VIDEO_IMPORT_TYPES[args.mimeType]}`;

  const size = await storedSize(path);
  if (size === null) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data?.signedUrl)
      throw new AppError(
        "UNKNOWN",
        "Where to send the video couldn't be set up. Try again in a moment.",
      );
    return {
      status: "upload",
      upload: {
        url: data.signedUrl,
        method: "PUT",
        headers: { "content-type": args.mimeType, "x-upsert": "true" },
        expiresInSeconds: VIDEO_IMPORT_LIMITS.uploadSeconds,
      },
      byteSize: args.byteSize,
      next: "PUT the whole file to upload.url with those headers, then call import_video again with the same clientRequestId to add it to the library.",
    };
  }

  // A file of another size is a different file (or a cut-short one): it goes, and is asked for again.
  const misfit = async (why: string): Promise<never> => {
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) throw unchecked();
    throw new AppError(
      "INVALID_PARAMETERS",
      `${why}, so it was removed: call import_video again for a new address and send the file again`,
    );
  };
  if (size !== args.byteSize)
    await misfit(`The stored file is ${size} bytes, not the ${args.byteSize} declared`);
  const found = videoContainer(await firstBytes(path));
  if (!found) await misfit("The stored file isn't an MP4, QuickTime or WebM video");
  if (!sameFamily(args.mimeType, found!))
    await misfit(`The stored file is ${found}, not the ${args.mimeType} declared`);

  const values = {
    project_id: projectId,
    uploaded_by: caller.userId,
    asset_type: "video",
    source_type: "uploaded",
    title: args.title.slice(0, 200),
    storage_bucket: BUCKET,
    storage_path: path,
    mime_type: found!,
    file_size: size,
    width: args.width ?? null,
    height: args.height ?? null,
    duration_seconds: args.durationSeconds ?? null,
    metadata: {
      client_request_id: args.clientRequestId,
      imported_by: "import_video",
      ...(args.sha256 ? { sha256: args.sha256 } : {}),
      ...(args.fps ? { fps: args.fps } : {}),
    },
  };
  // One record a file: an insert whose answer was lost is found by the file's place.
  let row: AssetRow | null = null;
  for (let attempt = 0; attempt < 2 && !row; attempt += 1) {
    const { data: inserted, error } = await db
      .from("assets")
      .insert(values as never)
      .select(ASSET_FIELDS)
      .maybeSingle();
    if (!error && inserted) {
      row = inserted as AssetRow;
      break;
    }
    const { data: existing, error: lookupError } = await db
      .from("assets")
      .select(ASSET_FIELDS)
      .eq("storage_bucket", BUCKET)
      .eq("storage_path", path)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError) throw unchecked();
    if (existing) row = existing as AssetRow;
  }
  if (!row)
    throw new AppError(
      "UNKNOWN",
      "The video is stored, but it couldn't be added to the library just now. Call again with the same clientRequestId.",
    );

  const { measureAsset } = await import("../media/measure-asset.server");
  const measuring = await measureAsset({
    id: row.id,
    asset_type: "video",
    storage_bucket: BUCKET,
    storage_path: path,
    mime_type: found!,
    width: values.width,
    height: values.height,
    project_id: projectId,
    uploaded_by: caller.userId,
  }).catch(() => false);
  return importedAnswer(row, true, measuring);
}
