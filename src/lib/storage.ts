import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (expiresIn - 120) * 1000 });
  return data.signedUrl;
}

export const ACCEPTED_MIME: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/wav", "audio/mpeg", "audio/mp4"],
};

export function mediaKindFor(mime: string): "image" | "video" | "audio" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-80);
}

export interface UploadedAsset {
  id: string;
  asset_type: "image" | "video" | "audio";
  storage_bucket: string;
  storage_path: string;
  title: string | null;
  mime_type: string | null;
}

/** Uploads a reference file into private storage and registers it as an asset. */
export async function uploadReference(
  file: File,
  opts: { userId: string; projectId?: string | null },
): Promise<UploadedAsset> {
  const kind = mediaKindFor(file.type);
  if (!kind) throw new Error("Unsupported file type");
  if (!ACCEPTED_MIME[kind]!.includes(file.type)) throw new Error(`${file.type} is not supported`);

  const scope = opts.projectId ? `projects/${opts.projectId}` : `unassigned/${opts.userId}`;
  const path = `${scope}/inputs/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

  const upload = await supabase.storage
    .from("generation-inputs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: opts.projectId ?? null,
      uploaded_by: opts.userId,
      asset_type: kind,
      source_type: "uploaded",
      title: file.name,
      storage_bucket: "generation-inputs",
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
    })
    .select("id,asset_type,storage_bucket,storage_path,title,mime_type")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not register the upload");
  return data as UploadedAsset;
}
