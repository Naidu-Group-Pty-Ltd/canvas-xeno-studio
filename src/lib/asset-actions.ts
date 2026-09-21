import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { setCreatePrefill } from "@/lib/create-draft";
import type { AssetRow } from "@/hooks/useStudioData";
import type { ModelRegistryEntry } from "@/lib/model-schema";

export async function downloadAsset(asset: AssetRow) {
  const url = await signedUrl(asset.storage_bucket, asset.storage_path, 300);
  if (!url) throw new Error("This file is not available yet");
  const link = document.createElement("a");
  link.href = url;
  link.download = asset.title ?? asset.storage_path.split("/").pop() ?? "asset";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function toggleFavorite(asset: AssetRow) {
  const { error } = await supabase.from("assets").update({ is_favorite: !asset.is_favorite }).eq("id", asset.id);
  if (error) throw new Error(error.message);
}

export async function softDeleteAsset(assetId: string) {
  const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", assetId);
  if (error) throw new Error(error.message);
}

export async function moveAsset(assetId: string, projectId: string | null, folderId: string | null = null) {
  const { error } = await supabase
    .from("assets")
    .update({ project_id: projectId, folder_id: folderId })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
}

/** Loads a past generation's settings into Create without submitting anything. */
export async function prefillFromGeneration(generationId: string, options: { variation?: boolean } = {}) {
  const { data: generation, error } = await supabase
    .from("generations")
    .select("*, model_registry(output_type)")
    .eq("id", generationId)
    .maybeSingle();
  if (error || !generation) throw new Error("That generation could not be loaded");

  const { data: inputs } = await supabase
    .from("generation_inputs")
    .select("asset_id,input_type,position")
    .eq("generation_id", generationId)
    .order("position");

  const outputType =
    (generation as { model_registry?: { output_type?: string } }).model_registry?.output_type === "video"
      ? "video"
      : "image";

  setCreatePrefill({
    mediaType: outputType,
    modelId: generation.model_registry_id,
    parameters: (generation.parameters ?? {}) as Record<string, unknown>,
    prompt: generation.prompt ?? "",
    projectId: generation.project_id,
    parentGenerationId: options.variation ? generationId : null,
    inputs: (inputs ?? [])
      .filter((row) => row.asset_id)
      .map((row) => ({ assetId: row.asset_id as string, role: row.input_type })),
  });
}

/** Image → video hand-off. Picks the first active image-to-video model. */
export function prefillAnimate(asset: AssetRow, models: ModelRegistryEntry[]) {
  const model = models.find((entry) => entry.operation === "image-to-video" && entry.output_type === "video");
  const slot = model?.capabilities?.inputs?.find((input) => input.type === "image");
  setCreatePrefill({
    mediaType: "video",
    ...(model ? { modelId: model.id } : {}),
    projectId: asset.project_id,
    inputs: [{ assetId: asset.id, role: slot?.role ?? "image" }],
  });
}

export function prefillUseAsReference(asset: AssetRow, role = "reference") {
  setCreatePrefill({
    mediaType: asset.asset_type === "video" ? "video" : "image",
    projectId: asset.project_id,
    inputs: [{ assetId: asset.id, role }],
  });
}
