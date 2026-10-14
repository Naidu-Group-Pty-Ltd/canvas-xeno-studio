/**
 * Designed artwork made for another shape (a 4:5 end card in a 16:9 video)
 * extended to the video's own shape by an image model: its background is
 * painted out to the frame's edges as part of the design, where the standard
 * end card can only mirror and soften it.
 *
 * The model never has the last word on the artwork itself. It is given the
 * artwork in place on a canvas of the video's shape, the rest roughly filled
 * from the artwork's own edges, and asked to paint that rest; then the
 * artwork's own pixels are laid back over its painting exactly where the
 * model left them, their edges feathered in, so no letter or logo is ever
 * redrawn. A painting that moved or changed the artwork no longer lines up
 * with it and isn't used (see ./artwork-canvas). Paid work (the model's run)
 * is only ever started by a person, after seeing its price, and never
 * repeated on its own.
 *
 * Browser only.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  estimateGeneration,
  refreshGenerationStatus,
  submitGeneration,
} from "@/lib/generation.functions";
import { normalizeOption, type ModelRegistryEntry } from "@/lib/model-schema";
import { signedUrl, storageScope, uploadAssetBlob } from "@/lib/storage";
import { canvasBlob, composeExtended, drawGuide, type GuideLayout } from "./artwork-canvas";
import { loadPicture, type Picture } from "./compose";
import { versionTitle } from "./frame";

type Size = { width: number; height: number };

/* ------------------------------------------------------------------ */
/* The painter                                                         */
/* ------------------------------------------------------------------ */

/** Image models that can paint around artwork, best first, and how each is asked. */
const PAINTERS: { path: string; role: string; values: Record<string, unknown> }[] = [
  // Edits by instruction, keeping what it isn't asked to change.
  { path: "alibaba/qwen-image-3/edit", role: "source", values: { resolution: "2k" } },
  // Keeps lettering intact; held close to the image it is given.
  {
    path: "ideogram/v4.0",
    role: "source",
    values: { rendering_speed: "QUALITY", image_weight: 90 },
  },
];

export interface ArtworkPainter {
  model: ModelRegistryEntry;
  /** The input the canvas goes in. */
  role: string;
  values: Record<string, unknown>;
}

/** The model that paints around artwork, among those on offer; null when none can. */
export function artworkPainter(models: ModelRegistryEntry[]): ArtworkPainter | null {
  for (const painter of PAINTERS) {
    const model = models.find(
      (entry) =>
        entry.is_active &&
        entry.output_type === "image" &&
        entry.model_path === painter.path &&
        (entry.capabilities?.inputs ?? []).some(
          (slot) => slot.role === painter.role && slot.type === "image",
        ),
    );
    if (model) return { model, role: painter.role, values: painter.values };
  }
  return null;
}

/** Artwork far enough from the frame's shape to be worth extending (as against shown whole). */
export function shapeDiffers(size: Size, frame: Size): boolean {
  return Math.abs(Math.log(size.width / size.height / (frame.width / frame.height))) >= 0.03;
}

/** The painter's aspect ratio nearest the frame's (its painting is then cropped to the frame). */
export function painterAspect(model: ModelRegistryEntry, frame: Size): string | null {
  const field = model.parameter_schema?.fields?.find((entry) => entry.key === "aspect_ratio");
  const target = Math.log(frame.width / frame.height);
  let best: { value: string; gap: number } | null = null;
  for (const option of field?.options ?? []) {
    const value = String(normalizeOption(option).value);
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value);
    if (!match) continue;
    const gap = Math.abs(Math.log(Number(match[1]) / Number(match[2])) - target);
    if (!best || gap < best.gap) best = { value, gap };
  }
  return best?.value ?? null;
}

/** What the painter is told. */
export const EXTEND_PROMPT =
  "Outpaint this image. The sharp design in the middle is a finished brand end card; the soft, blurred, mirrored areas around it are only a placeholder for the space it now has to fill. Repaint those surrounding areas as a seamless, sharp continuation of the design's own background, in the same colours, light, gradients, textures and style, carried naturally out to the edges of the frame, so the whole image reads as one design made at this shape. Keep the central design exactly as it is: do not move, resize, redraw, restyle or recolour it, and keep every logo, letter and graphic in it unchanged. Add no new text, logos, people, products or objects.";

function painterValues(painter: ArtworkPainter, guide: Size): Record<string, unknown> {
  const aspect = painterAspect(painter.model, guide);
  return { ...painter.values, prompt: EXTEND_PROMPT, ...(aspect ? { aspect_ratio: aspect } : {}) };
}

/* ------------------------------------------------------------------ */
/* The steps                                                           */
/* ------------------------------------------------------------------ */

/** The canvas the painter is given, in the library. */
export interface ArtworkGuide extends GuideLayout {
  assetId: string;
}

/** Step 1, free: the canvas the painter is given (see drawGuide), saved to the library. */
export async function prepareArtworkGuide(input: {
  picture: Picture;
  frame: Size;
  scale: number | null;
  finisherAssetId: string;
  userId: string;
  projectId: string | null;
  title: string;
}): Promise<ArtworkGuide> {
  const { canvas, width, height, rect } = drawGuide(input.picture, input.frame, input.scale);
  const asset = await uploadAssetBlob(await canvasBlob(canvas, "image/jpeg", 0.95), {
    userId: input.userId,
    projectId: input.projectId,
    path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-artwork-guide.jpg`,
    mimeType: "image/jpeg",
    kind: "image",
    title: versionTitle(input.title, "to extend"),
    width,
    height,
    metadata: { derived_from_asset_id: input.finisherAssetId, artwork_guide: { rect } },
  });
  return { assetId: asset.id, width, height, rect };
}

export type ArtworkQuote =
  { ok: true; costUsd: number | null; description: string | null } | { ok: false; message: string };

/** Step 2, free: what painting it would cost, as the provider quotes it. */
export async function quoteArtworkExtension(
  painter: ArtworkPainter,
  guide: ArtworkGuide,
): Promise<ArtworkQuote> {
  const result = await estimateGeneration({
    data: {
      modelId: painter.model.id,
      parameters: painterValues(painter, guide),
      inputs: [{ assetId: guide.assetId, role: painter.role, position: 0 }],
    },
  });
  if (!result.ok)
    return { ok: false, message: result.message ?? "Higgsfield couldn't price it just now" };
  if (result.costUsd === null && !result.pricingDescription)
    return { ok: false, message: "Higgsfield didn't give a price for it" };
  return { ok: true, costUsd: result.costUsd, description: result.pricingDescription };
}

/** Step 3, billed: starts the painting, once; resolves to its generation. */
export async function startArtworkExtension(input: {
  painter: ArtworkPainter;
  guide: ArtworkGuide;
  costUsd: number | null;
  projectId: string | null;
  campaignId: string | null;
}): Promise<string> {
  const result = await submitGeneration({
    data: {
      modelId: input.painter.model.id,
      parameters: painterValues(input.painter, input.guide),
      inputs: [{ assetId: input.guide.assetId, role: input.painter.role, position: 0 }],
      projectId: input.projectId,
      campaignId: input.campaignId,
      estimatedCostUsd: input.costUsd,
      clientRequestId: crypto.randomUUID(),
    },
  });
  return result.generationId;
}

const FAILED: Record<string, string> = {
  failed: "Higgsfield couldn't paint it",
  nsfw: "Higgsfield's moderation blocked it",
  canceled: "It was canceled",
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Step 4: waits for the painting to be in the library. Higgsfield is asked
 * directly now and then, in case its notice is slow; the run itself is never
 * started again.
 */
export async function waitForPainting(
  generationId: string,
  timeoutMs = 8 * 60_000,
): Promise<{ assetId: string; bucket: string; path: string }> {
  const deadline = Date.now() + timeoutMs;
  let asked = Date.now();
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("generations")
      .select("status,ingest_status,error_message")
      .eq("id", generationId)
      .maybeSingle();
    if (data?.status === "completed" && data.ingest_status === "completed") {
      const { data: asset } = await supabase
        .from("assets")
        .select("id,storage_bucket,storage_path")
        .eq("generation_id", generationId)
        .eq("asset_type", "image")
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (asset)
        return { assetId: asset.id, bucket: asset.storage_bucket, path: asset.storage_path };
    }
    const failed = data ? FAILED[data.status] : undefined;
    if (failed) throw new Error(data?.error_message ? `${failed}: ${data.error_message}` : failed);
    if (data?.status === "submission_uncertain")
      throw new Error(
        "Higgsfield's answer was unclear, so it may or may not be painting. Check Activity before trying again, or you could be charged twice.",
      );
    if (data?.ingest_status === "failed")
      throw new Error("It was painted but couldn't be saved. Retry the save in Activity.");
    if (Date.now() - asked > 20_000) {
      asked = Date.now();
      await refreshGenerationStatus({ data: { generationId } }).catch(() => undefined);
    }
    await pause(3000);
  }
  throw new Error(
    "It's taking longer than usual. It will be in your library when it's done; you can attach it as the finisher from there.",
  );
}

/**
 * Step 5, free: the artwork laid back over the painting exactly, where the
 * painter left it (see composeExtended), saved to the library; resolves to
 * the extended artwork.
 */
export async function finishArtworkExtension(input: {
  /** The artwork as uploaded. */
  picture: Picture;
  guide: ArtworkGuide;
  painting: { assetId: string; bucket: string; path: string };
  /** The video's frame. */
  frame: Size;
  finisherAssetId: string;
  generationId: string;
  painter: ArtworkPainter;
  userId: string;
  projectId: string | null;
  title: string;
}): Promise<{ assetId: string; score: number }> {
  const url = await signedUrl(input.painting.bucket, input.painting.path, 600);
  if (!url) throw new Error("The painting couldn't be read from storage");
  const { canvas, found } = composeExtended({
    art: input.picture,
    painting: await loadPicture(url),
    guide: input.guide,
    frame: input.frame,
  });
  const lossless = canvas.width * canvas.height <= 2_600_000;
  const blob = await canvasBlob(
    canvas,
    lossless ? "image/png" : "image/jpeg",
    lossless ? undefined : 0.95,
  );
  const aspect = painterAspect(input.painter.model, input.frame);
  const asset = await uploadAssetBlob(blob, {
    userId: input.userId,
    projectId: input.projectId,
    path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-artwork-extended.${lossless ? "png" : "jpg"}`,
    mimeType: lossless ? "image/png" : "image/jpeg",
    kind: "image",
    title: versionTitle(input.title, aspect ? `extended to ${aspect}` : "extended"),
    width: canvas.width,
    height: canvas.height,
    metadata: {
      derived_from_asset_id: input.finisherAssetId,
      artwork_extension: {
        generation_id: input.generationId,
        painted_asset_id: input.painting.assetId,
        model_path: input.painter.model.model_path,
        alignment: Number(found.score.toFixed(4)),
        scale: found.scale,
        offset: [Number(found.dx.toFixed(2)), Number(found.dy.toFixed(2))],
      },
    },
  });
  return { assetId: asset.id, score: found.score };
}
