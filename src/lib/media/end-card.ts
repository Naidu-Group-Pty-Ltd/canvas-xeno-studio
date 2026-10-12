/**
 * A long video's end card: its finisher (the brand's logo or end card) shown
 * whole and unchanged at the video's own shape, on its own ground, saved to
 * the library. The last clip can end on it, and the Editor holds it after the
 * last clip.
 */
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, storageScope, uploadAssetBlob } from "@/lib/storage";
import { composeFrame, loadPicture } from "./compose";
import { versionTitle } from "./frame";

export interface EndCardStyle {
  /** "auto" (the logo's own ground), "blur", or a colour (#rrggbb). */
  background: string;
  /** How much of the frame the logo may fill, 0.3 to 1. */
  scale: number;
}

export const DEFAULT_END_CARD_STYLE: EndCardStyle = { background: "auto", scale: 0.8 };

export const END_CARD_BACKGROUNDS: { value: string; label: string }[] = [
  { value: "auto", label: "Its own background" },
  { value: "#000000", label: "Black" },
  { value: "#ffffff", label: "White" },
  { value: "blur", label: "Blurred" },
];

export interface EndCardSource {
  assetId: string;
  bucket?: string | null | undefined;
  path?: string | null | undefined;
}

async function locate(source: EndCardSource): Promise<{ bucket: string; path: string }> {
  if (source.bucket && source.path) return { bucket: source.bucket, path: source.path };
  const { data } = await supabase
    .from("assets")
    .select("storage_bucket,storage_path")
    .eq("id", source.assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("The finisher is no longer in the library");
  return { bucket: data.storage_bucket, path: data.storage_path };
}

/** The finisher as a picture to lay out (loaded once a while per page). */
const pictures = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();

export function loadFinisher(source: EndCardSource): Promise<ImageBitmap | HTMLImageElement> {
  const cached = pictures.get(source.assetId);
  if (cached) return cached;
  const work = (async () => {
    const { bucket, path } = await locate(source);
    const url = await signedUrl(bucket, path, 600);
    if (!url) throw new Error("The finisher couldn't be read from storage");
    return loadPicture(url);
  })();
  pictures.set(source.assetId, work);
  work.catch(() => pictures.delete(source.assetId));
  return work;
}

/** End cards made in this page's life, by what they were made from: trying again reuses one. */
const made = new Map<string, Promise<string>>();

/** Makes (or reuses) the end card for a finisher at a size and style; resolves to its asset id. */
export function makeEndCard(input: {
  finisher: EndCardSource;
  size: { width: number; height: number };
  style: EndCardStyle;
  userId: string;
  projectId: string | null;
  /** The video's title, which names the card in the library. */
  title: string;
}): Promise<string> {
  const key = JSON.stringify([
    input.finisher.assetId,
    input.size.width,
    input.size.height,
    input.style.background,
    input.style.scale,
    input.projectId,
  ]);
  const existing = made.get(key);
  if (existing) return existing;
  const work = (async () => {
    const picture = await loadFinisher(input.finisher);
    const blob = await composeFrame(
      picture,
      {
        ...input.size,
        fit: "contain",
        background: input.style.background,
        scale: input.style.scale,
      },
      "image/jpeg",
    );
    const asset = await uploadAssetBlob(blob, {
      userId: input.userId,
      projectId: input.projectId,
      path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-end-card.jpg`,
      mimeType: "image/jpeg",
      kind: "image",
      title: versionTitle(input.title.trim() || "Long video", "end card"),
      width: input.size.width,
      height: input.size.height,
      metadata: {
        derived_from_asset_id: input.finisher.assetId,
        end_card: { background: input.style.background, scale: input.style.scale },
      },
    });
    return asset.id;
  })();
  made.set(key, work);
  work.catch(() => made.delete(key));
  return work;
}
