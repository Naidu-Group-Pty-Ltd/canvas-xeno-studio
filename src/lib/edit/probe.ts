import type { AssetRow } from "@/hooks/useStudioData";
import { signedUrl } from "@/lib/storage";

/** Reads a file's length from its media metadata when the library doesn't know it yet. */
export async function probeDuration(asset: AssetRow): Promise<number | null> {
  if (asset.duration_seconds) return Number(asset.duration_seconds);
  if (asset.asset_type === "image") return null;
  const url = await signedUrl(asset.storage_bucket, asset.storage_path);
  if (!url) return null;
  return new Promise((resolve) => {
    const element = document.createElement(asset.asset_type === "video" ? "video" : "audio");
    element.preload = "metadata";
    const done = (value: number | null) => {
      element.removeAttribute("src");
      resolve(value);
    };
    element.onloadedmetadata = () =>
      done(Number.isFinite(element.duration) && element.duration > 0 ? element.duration : null);
    element.onerror = () => done(null);
    setTimeout(() => done(null), 15_000);
    element.src = url;
  });
}
