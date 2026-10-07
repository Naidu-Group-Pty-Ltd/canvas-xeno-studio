import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (expiresIn - 120) * 1000 });
  return data.signedUrl;
}

export type MediaKind = "image" | "video" | "audio";

/** What the studio library accepts as an upload. */
export const ACCEPTED_MIME: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: [
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
  ],
};

/**
 * What the generation provider accepts as reference media (its file-upload
 * contract). Library files outside this list must be converted first.
 */
export const PROVIDER_MIME: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4"],
  audio: ["audio/wav", "audio/x-wav"],
};

export const ACCEPT_ATTRIBUTE: Record<MediaKind, string> = {
  image: ACCEPTED_MIME.image.join(","),
  video: [...ACCEPTED_MIME.video, ".mov", ".mp4", ".webm"].join(","),
  audio: [...ACCEPTED_MIME.audio, ".wav", ".mp3", ".m4a"].join(","),
};

export function mediaKindFor(mime: string): MediaKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Browsers report WAV under several names; store the one the provider expects. */
export function normalizeMime(mime: string): string {
  if (["audio/wave", "audio/vnd.wave", "audio/x-wav"].includes(mime)) return "audio/wav";
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function providerAccepts(kind: MediaKind, mime: string | null | undefined): boolean {
  if (!mime) return kind === "image";
  return PROVIDER_MIME[kind].includes(normalizeMime(mime));
}

/** A human hint for a library file the provider cannot take directly. */
export function conversionHint(kind: MediaKind, mime: string | null | undefined): string | null {
  if (providerAccepts(kind, mime)) return null;
  if (kind === "video") return "Higgsfield needs MP4 video. Convert it to MP4 before generating.";
  if (kind === "audio")
    return "Higgsfield needs WAV audio. Export the track as WAV and upload it again.";
  return "Higgsfield needs a JPEG, PNG, WebP or GIF image.";
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-80);
}

export function storageScope(opts: { userId: string; projectId?: string | null }): string {
  return opts.projectId ? `projects/${opts.projectId}` : `unassigned/${opts.userId}`;
}

export interface UploadedAsset {
  id: string;
  asset_type: MediaKind;
  storage_bucket: string;
  storage_path: string;
  title: string | null;
  mime_type: string | null;
  metadata?: Record<string, unknown> | null;
}

const UPLOAD_BUCKET = "generation-inputs";

/** Uploads bytes into private storage and registers them as a library asset. */
export async function uploadAssetBlob(
  blob: Blob,
  opts: {
    userId: string;
    projectId?: string | null;
    path: string;
    mimeType: string;
    kind: MediaKind;
    title: string;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<UploadedAsset> {
  const upload = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(opts.path, blob, { contentType: opts.mimeType, upsert: false });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: opts.projectId ?? null,
      uploaded_by: opts.userId,
      asset_type: opts.kind,
      source_type: "uploaded",
      title: opts.title.slice(0, 200),
      storage_bucket: UPLOAD_BUCKET,
      storage_path: opts.path,
      mime_type: opts.mimeType,
      file_size: blob.size,
      width: opts.width ?? null,
      height: opts.height ?? null,
      duration_seconds: opts.durationSeconds ?? null,
      metadata: (opts.metadata ?? {}) as never,
    })
    .select("id,asset_type,storage_bucket,storage_path,title,mime_type,metadata")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not register the upload");
  return data as UploadedAsset;
}

/** Uploads a reference file into private storage and registers it as an asset. */
export async function uploadReference(
  file: File,
  opts: { userId: string; projectId?: string | null },
): Promise<UploadedAsset> {
  const kind = mediaKindFor(file.type);
  if (!kind) throw new Error("Unsupported file type");
  if (!ACCEPTED_MIME[kind]!.includes(file.type)) throw new Error(`${file.type} is not supported`);

  const mimeType = normalizeMime(file.type);
  const path = `${storageScope(opts)}/inputs/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const metadata: Record<string, unknown> = {};
  let width: number | null = null;
  let height: number | null = null;
  let durationSeconds: number | null = null;

  if (kind === "image") {
    const size = await imageSize(file);
    width = size?.width ?? null;
    height = size?.height ?? null;
  }

  if (kind === "video") {
    // A poster frame lets previews and the AI assistant "see" the clip.
    const probe = await captureVideoPoster(file);
    width = probe.width;
    height = probe.height;
    durationSeconds = probe.duration !== null ? Number(probe.duration.toFixed(2)) : null;
    if (probe.poster) {
      const posterPath = `${path}.poster.jpg`;
      const posterUpload = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(posterPath, probe.poster, { contentType: "image/jpeg", upsert: false });
      if (!posterUpload.error) metadata["poster_path"] = posterPath;
    }
  }

  return uploadAssetBlob(file, {
    ...opts,
    path,
    mimeType,
    kind,
    title: file.name,
    width,
    height,
    durationSeconds,
    metadata,
  });
}

/** Stores an original document (e.g. an imported brief) without registering it as media. */
export async function uploadDocument(file: Blob, path: string, mimeType: string): Promise<void> {
  const upload = await supabase.storage
    .from(UPLOAD_BUCKET)
    .upload(path, file, { contentType: mimeType || "application/octet-stream", upsert: false });
  if (upload.error) throw new Error(upload.error.message);
}

export const DOCUMENT_BUCKET = UPLOAD_BUCKET;

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Reads dimensions, duration and a poster frame from a video in the browser. */
export async function captureVideoPoster(file: Blob): Promise<{
  poster: Blob | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}> {
  const empty = { poster: null, width: null, height: null, duration: null };
  if (typeof document === "undefined") return empty;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadeddata", 10_000);
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    video.currentTime = Math.min(0.5, (duration ?? 1) / 2);
    await waitFor(video, "seeked", 5_000).catch(() => undefined);
    if (!width || !height) return { ...empty, duration };
    const scale = Math.min(1, 960 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return { poster, width, height, duration };
  } catch {
    return empty;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function waitFor(element: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    element.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    element.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("The media could not be decoded"));
      },
      { once: true },
    );
  });
}
