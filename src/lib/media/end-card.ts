/**
 * A long video's end card: its finisher (the brand's logo or end card) laid
 * out at the video's own shape and saved to the library. The last clip can
 * end on it, and the Editor holds it after the last clip.
 *
 * The finisher is never pasted as a tile on a flat colour: a logo is lifted
 * off its background and set on a backdrop made for the frame (the video's
 * own final frame, defocused, when the card follows it), and designed
 * artwork has its own background carried out to the frame's edges. See
 * ./brand-card.
 */
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, storageScope, uploadAssetBlob } from "@/lib/storage";
import { analyseFinisher, composeBrandCard, resolveBackdrop } from "./brand-card";
import { loadPicture, type Picture } from "./compose";
import { versionTitle } from "./frame";

export interface EndCardStyle {
  /**
   * What surrounds the logo: "auto" (chosen for the image), "scene" (the
   * video's final frame, defocused, where the card follows it), "brand" (a
   * lit backdrop in the logo's own colours), "extend" (the image's own
   * background carried out to the frame's edges), or a colour (#rrggbb).
   */
  background: string;
  /** How large the logo is, 0.3 to 1 of the room it has; null to size it for the frame. */
  scale: number | null;
}

export const DEFAULT_END_CARD_STYLE: EndCardStyle = { background: "auto", scale: null };

export const END_CARD_BACKGROUNDS: { value: string; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto (recommended)",
    hint: "A logo is lifted off its background onto a backdrop made for the frame; designed artwork keeps its own background, carried out to the edges.",
  },
  {
    value: "scene",
    label: "The video's final moment",
    hint: "The last frame of the video, softly defocused behind the logo. Used where the card follows the last clip.",
  },
  {
    value: "brand",
    label: "Lit backdrop in its colours",
    hint: "Light falling off from behind the logo, in its own background colour.",
  },
  {
    value: "extend",
    label: "Its own background, extended",
    hint: "The image whole, its background mirrored and softened out to the frame's edges.",
  },
  { value: "#000000", label: "Black", hint: "The logo, lifted off its background, on black." },
  { value: "#ffffff", label: "White", hint: "The logo, lifted off its background, on white." },
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

/** A video's final frame, read in the browser (for videos without one in the library). */
async function videoEndFrame(url: string): Promise<HTMLCanvasElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("The video couldn't be read")), {
        once: true,
      });
      video.src = url;
    });
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("The video couldn't be read")), {
        once: true,
      });
      // A hair before the end: past it, some browsers show nothing.
      video.currentTime = Math.max(0, (video.duration || 0) - 0.05);
    });
    const board = document.createElement("canvas");
    board.width = video.videoWidth;
    board.height = video.videoHeight;
    const context = board.getContext("2d");
    if (!context || !board.width) throw new Error("The video's last frame couldn't be read");
    context.drawImage(video, 0, 0);
    return board;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** The film's final moment a card can sit over: a frame in the library, or a video's last frame. */
export type EndCardScene =
  { kind: "image"; source: EndCardSource } | { kind: "video"; source: EndCardSource };

async function loadScene(scene: EndCardScene): Promise<Picture> {
  if (scene.kind === "image") return loadFinisher(scene.source);
  const { bucket, path } = await locate(scene.source);
  const url = await signedUrl(bucket, path, 600);
  if (!url) throw new Error("The video couldn't be read from storage");
  return videoEndFrame(url);
}

/** End cards made in this page's life, by what they were made from: trying again reuses one. */
const made = new Map<string, Promise<string>>();

/** Whether a file is still in the library (not deleted). */
async function inLibrary(assetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Makes (or reuses) the end card for a finisher at a size and style; resolves to its asset id. */
export async function makeEndCard(input: {
  finisher: EndCardSource;
  size: { width: number; height: number };
  style: EndCardStyle;
  /** The video's final moment, for a card that follows the last clip. */
  scene?: EndCardScene | null;
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
    input.scene?.source.assetId ?? null,
    input.projectId,
  ]);
  const existing = made.get(key);
  if (existing) {
    // One deleted from the library since is made again.
    const assetId = await existing.catch(() => null);
    if (assetId && (await inLibrary(assetId))) return assetId;
    const current = made.get(key);
    if (current && current !== existing) return current;
    made.delete(key);
  }
  const work = (async () => {
    const picture = await loadFinisher(input.finisher);
    // Without the final moment (it couldn't be read), the card is laid out on its own.
    const scene = input.scene ? await loadScene(input.scene).catch(() => null) : null;
    const backdrop = resolveBackdrop(input.style.background, analyseFinisher(picture), !!scene);
    const blob = await composeBrandCard({
      picture,
      style: input.style,
      width: input.size.width,
      height: input.size.height,
      scene,
    });
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
        end_card: {
          background: input.style.background,
          scale: input.style.scale,
          backdrop,
          ...(scene && input.scene ? { scene_asset_id: input.scene.source.assetId } : {}),
        },
      },
    });
    return asset.id;
  })();
  made.set(key, work);
  work.catch(() => {
    if (made.get(key) === work) made.delete(key);
  });
  return work;
}
