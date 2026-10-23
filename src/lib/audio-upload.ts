import { supabase } from "@/integrations/supabase/client";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { stageMusicUpload } from "@/lib/music.functions";
import { audioFileDuration } from "@/lib/music/analyze";
import { normalizeMime } from "@/lib/storage";

/**
 * A recording being uploaded from the device (a licensed track, or a
 * voiceover recorded elsewhere): the upload the server started for it (see
 * stageMusicUpload), whether the file is there yet, and its measured length.
 * Kept in the browser for a day (see attempts) until it is recorded, so
 * trying again after a failure, even after a reload, reuses it rather than
 * uploading another copy. The server clears uploads never recorded after two
 * days.
 */
export type Staged = {
  uploadId: string;
  bucket: string;
  path: string;
  uploaded: boolean;
  durationSeconds: number | null;
};

const stagedPlace = (userId: string) => `licensed-upload:${userId}`;

function savedStaged(userId: string, upload: string): Staged | null {
  const saved = savedAttempt(stagedPlace(userId), upload);
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<Record<keyof Staged, unknown>>;
    if (
      typeof value.uploadId !== "string" ||
      typeof value.bucket !== "string" ||
      typeof value.path !== "string"
    )
      return null;
    return {
      uploadId: value.uploadId,
      bucket: value.bucket,
      path: value.path,
      uploaded: value.uploaded === true,
      durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : null,
    };
  } catch {
    return null;
  }
}

/** Keeps (or, given null, forgets) an upload staged for a file. */
export function keepStaged(userId: string, upload: string, value: Staged | null) {
  keepAttempt(stagedPlace(userId), upload, value ? JSON.stringify(value) : null);
}

/** The extensions of the audio the studio takes from a device. */
const AUDIO_EXTENSIONS: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

/**
 * The type a picked file is uploaded as: the browser's, or, when it gives none
 * (or only a generic one, as some systems do for .m4a), its name's. The server
 * checks the file's structure once it's uploaded either way.
 */
export function uploadType(file: File): string {
  const given = normalizeMime(file.type);
  if (given && given !== "application/octet-stream") return given;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (extension && AUDIO_EXTENSIONS[extension]) || given;
}

/** The audio types taken from a device (what the server's staging takes). */
const UPLOADABLE = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac",
]);

/** Whether a dropped or picked file is audio the studio takes (WAV, MP3, M4A or FLAC), by its type or name. */
export function isUploadableAudio(file: File): boolean {
  return UPLOADABLE.has(uploadType(file));
}

/** How much of a file is digested at a time. */
const DIGEST_PART = 4 * 1024 * 1024;

/**
 * What a picked file holds, as a digest: SHA-256 over each 4 MB part's SHA-256,
 * so a large file is read a part at a time. An upload staged for one file is
 * reused only for a file with the same digest, never for another that just has
 * the same name, size and time. Where the browser can't digest it, each pick
 * is its own (nothing staged is reused for it).
 */
export async function fileDigest(file: File): Promise<string> {
  try {
    const parts: Uint8Array[] = [];
    for (let at = 0; at < file.size; at += DIGEST_PART) {
      const part = await file.slice(at, at + DIGEST_PART).arrayBuffer();
      parts.push(new Uint8Array(await crypto.subtle.digest("SHA-256", part)));
    }
    const joined = new Uint8Array(parts.length * 32);
    parts.forEach((part, index) => joined.set(part, index * 32));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `unread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** What an upload of a file is kept under (see Staged): the same audio, for the same project. */
export function uploadKey(projectId: string | null, file: File, contentId: string): string {
  return JSON.stringify([projectId, file.name, file.size, contentId]);
}

/**
 * Uploads a file from the device to the place the server picks for it, once:
 * an upload already staged for the same audio (see uploadKey) is reused, and
 * one already stored isn't stored again. Returns the upload, ready to record.
 */
export async function uploadStaged(input: {
  userId: string;
  file: File;
  upload: string;
  projectId: string | null;
}): Promise<Staged> {
  const { userId, file, upload } = input;
  let staged = savedStaged(userId, upload);
  if (!staged) {
    const started = await stageMusicUpload({
      data: {
        fileName: file.name,
        mimeType: uploadType(file),
        size: file.size,
        projectId: input.projectId,
      },
    });
    staged = { ...started, uploaded: false, durationSeconds: null };
    keepStaged(userId, upload, staged);
  }
  if (!staged.uploaded) {
    const [stored, measured] = await Promise.all([
      supabase.storage.from(staged.bucket).upload(staged.path, file, {
        contentType: uploadType(file),
        upsert: false,
      }),
      audioFileDuration(file),
    ]);
    // An earlier try may have stored it already (its answer lost): that is this file.
    if (stored.error && !/already exists|duplicate/i.test(stored.error.message))
      throw new Error(stored.error.message);
    staged = { ...staged, uploaded: true, durationSeconds: measured };
    keepStaged(userId, upload, staged);
  }
  return staged;
}

/** Whether a failure means the server doesn't have (any more), or refused, the upload: it is forgotten then. */
export function uploadRefused(message: string): boolean {
  return /Upload an audio file first|isn't audio|too large|expired/.test(message);
}
