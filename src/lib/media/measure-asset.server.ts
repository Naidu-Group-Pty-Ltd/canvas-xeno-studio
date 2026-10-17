/**
 * Generated media, measured. The provider's answer gives a video's length as
 * asked (9 for a clip of 9.032 s) and often no size at all, which the Editor
 * then lays out and trims by. Once a generation's files are saved, the media
 * service probes each video (and any image without a size), and its exact
 * length, size and frame rate are recorded with it.
 *
 * Best effort: without the media service, or if it can't be asked now, the
 * provider's figures stay. Never fails a save.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueInternalMediaTask } from "./enqueue.server";
import { mediaWorkerConfigured } from "./worker.server";

type Json = Record<string, unknown>;

/** Asks the media service to measure a generation's saved files that need it. */
export async function measureGeneratedAssets(generationId: string): Promise<number> {
  if (!mediaWorkerConfigured()) return 0;
  const { data: assets, error } = await supabaseAdmin
    .from("assets")
    .select(
      "id,asset_type,storage_bucket,storage_path,mime_type,width,height,project_id,uploaded_by",
    )
    .eq("generation_id", generationId)
    .is("deleted_at", null);
  if (error) return 0;
  let asked = 0;
  for (const asset of assets ?? []) {
    const wanted =
      asset.asset_type === "video" ||
      (asset.asset_type === "image" && (!asset.width || !asset.height));
    if (!wanted) continue;
    const result = await enqueueInternalMediaTask({
      createdBy: asset.uploaded_by,
      projectId: asset.project_id,
      taskType: "probe",
      source: {
        assetId: asset.id,
        assetType: asset.asset_type as "video" | "image",
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
      },
      params: {},
      dedupeKey: `asset-measure:${asset.id}`,
      output: { count: 0, ext: "json", mime: "application/json", kind: "image" },
      context: { measure_asset_id: asset.id },
    }).catch(() => null);
    if (result?.ok) asked += 1;
  }
  return asked;
}

/** What a probe measured of a file, read: its picture's own length, size and frame rate. */
export function measurementOf(metadata: unknown): {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
} {
  const probe = (metadata ?? {}) as Json;
  const positive = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return {
    // The picture's own length where it is reported: the container's can run on with the sound.
    durationSeconds:
      positive(probe["video_duration_seconds"]) ?? positive(probe["duration_seconds"]),
    width: positive(probe["width"]),
    height: positive(probe["height"]),
    fps: positive(probe["fps"]),
  };
}

/**
 * Records a file's measurement (a probe asked for by measureGeneratedAssets
 * came back): its exact length (videos), size and frame rate, over the
 * provider's figures.
 */
export async function recordAssetMeasurement(assetId: string, metadata: unknown): Promise<void> {
  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id,asset_type,metadata")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return;
  const measured = measurementOf(metadata);
  const update: Json = {};
  if (asset.asset_type === "video" && measured.durationSeconds)
    update["duration_seconds"] = Number(measured.durationSeconds.toFixed(6));
  if (measured.width && measured.height) {
    update["width"] = Math.round(measured.width);
    update["height"] = Math.round(measured.height);
  }
  if (measured.fps && asset.asset_type === "video")
    update["metadata"] = {
      ...((asset.metadata ?? {}) as Json),
      fps: measured.fps,
      measured_at: new Date().toISOString(),
    };
  if (!Object.keys(update).length) return;
  const { error } = await supabaseAdmin
    .from("assets")
    .update(update as never)
    .eq("id", assetId);
  if (error) console.error("asset measurement not recorded", { assetId, message: error.message });
}
