/**
 * Designed artwork made for another shape (a 4:5 end card in a 16:9 video)
 * extended to the video's own shape by an image model: its background is
 * painted out to the frame's edges as part of the design, where the standard
 * end card can only mirror and soften it.
 *
 * The model never has the last word on the artwork itself. It is given the
 * artwork in place on a canvas of the video's shape, the rest left as flat
 * empty canvas, and told in so many words to fill that and leave the design
 * alone. Its painting is then checked (see ./artwork-canvas): the artwork must
 * still be there, intact, and the empty canvas really painted, right up to
 * the artwork. Only then are the artwork's own pixels laid back over it,
 * exactly where the model left them, so no letter or logo is ever redrawn;
 * and the person sees the result and chooses to use it or not.
 *
 * Paid work (the model's run) is only ever started by a person, after seeing
 * its price, and never repeated on its own. A painting that was paid for but
 * never used (its tab closed while it was being made) can be checked and
 * used later, at no cost. What became of each painting is noted on it in the
 * library, so the record shows why one wasn't used.
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
import type { Box } from "./artwork-align";
import {
  bandsOf,
  canvasBlob,
  composeExtended,
  drawGuide,
  inspectPainting,
  PROBLEM_TEXT,
  type Bands,
  type GuideLayout,
  type Inspection,
} from "./artwork-canvas";
import { loadPicture, type Picture } from "./compose";
import { versionTitle } from "./frame";

type Size = { width: number; height: number };
type Json = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* The painter                                                         */
/* ------------------------------------------------------------------ */

/** What a painting must not have, for a model that takes a list of it. */
const AVOID =
  "white bars, black bars, empty areas, blank canvas, borders, frames, letterboxing, zoomed out design, shrunken design, cropped design, shifted design, redrawn logo, altered or misspelled text, mirrored text, upside-down text, duplicated logo, extra text, watermark, blur, smears, low resolution";

/** Image models that can paint around artwork, best first, and how each is asked. */
const PAINTERS: { path: string; role: string; values: Json }[] = [
  // Edits by instruction, keeping what it isn't asked to change. The
  // instruction is used as written (not rewritten by the model first), with
  // what to avoid spelled out.
  {
    path: "alibaba/qwen-image-3/edit",
    role: "source",
    values: {
      resolution: "2k",
      prompt_extend: false,
      enable_thinking: false,
      negative_prompt: AVOID,
    },
  },
  // Keeps lettering intact; held to the image it is given, but loosely
  // enough to paint over the empty canvas.
  {
    path: "ideogram/v4.0",
    role: "source",
    values: { rendering_speed: "QUALITY", image_weight: 70 },
  },
];

export interface ArtworkPainter {
  model: ModelRegistryEntry;
  /** The input the canvas goes in. */
  role: string;
  values: Json;
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
    if (model) {
      // Only the settings this model has (a registry row can lose one).
      const keys = new Set((model.parameter_schema?.fields ?? []).map((field) => field.key));
      const values = Object.fromEntries(
        Object.entries(painter.values).filter(([key]) => keys.has(key)),
      );
      return { model, role: painter.role, values };
    }
  }
  return null;
}

/** Artwork far enough from the frame's shape to be worth extending (as against shown whole). */
export function shapeDiffers(size: Size, frame: Size): boolean {
  return Math.abs(Math.log(size.width / size.height / (frame.width / frame.height))) >= 0.03;
}

/** The painter's aspect ratio nearest the frame's (its painting is then brought to the frame). */
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

const WHERE: Record<Bands, string> = {
  vertical: "above and below the design",
  horizontal: "to the left and right of the design",
  around: "around the design",
};

/**
 * What the painter is told: which areas are empty canvas and that they are
 * to be filled as the design's own background, and that the design stays
 * exactly as it is. (Never "outpaint": the canvas is already the frame's
 * shape, and a model told to outpaint it zooms out to make room.)
 */
export function extendPrompt(guide: GuideLayout & { pad: string }): string {
  const colour = guide.pad === "#000000" ? "black" : "white";
  const shape =
    guide.height > guide.width ? "tall" : guide.width > guide.height ? "wide" : "square";
  return [
    `The plain ${colour} areas ${WHERE[bandsOf(guide.rect, guide)]} are empty canvas. Fill them completely with a seamless continuation of the design's own background: the same colours, light, gradients, textures, patterns and style, carried naturally out to the edges of the image, so the whole image reads as one design made for this ${shape} frame.`,
    "Leave the design itself exactly as it is: in the same position, at the same size, with every logo, letter and graphic unchanged. Do not zoom out, crop, shift, resize, redraw or restyle it.",
    `Add no new text, logos, people, products, borders or frames, and leave no ${colour} areas.`,
  ].join(" ");
}

function painterValues(painter: ArtworkPainter, guide: GuideLayout & { pad: string }): Json {
  const aspect = painterAspect(painter.model, guide);
  return {
    ...painter.values,
    prompt: extendPrompt(guide),
    ...(aspect ? { aspect_ratio: aspect } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The canvas the painter is given                                     */
/* ------------------------------------------------------------------ */

/** The canvas the painter is given, in the library. */
export interface ArtworkGuide extends GuideLayout {
  assetId: string;
}

/** A new canvas (flat empty canvas, recorded with it); older ones had a blurred one. */
const GUIDE_VERSION = 2;

const sameRect = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

/** A canvas as recorded in the library, or null when the record isn't one. */
function guideFromRow(row: {
  id: string;
  width: number | null;
  height: number | null;
  metadata: unknown;
}): ArtworkGuide | null {
  const meta = ((row.metadata ?? {}) as Json)["artwork_guide"] as Json | undefined;
  const rect = meta?.["rect"] as Box | undefined;
  if (!row.width || !row.height || !rect || !(rect.width > 0 && rect.height > 0)) return null;
  const pad = typeof meta?.["pad"] === "string" ? (meta["pad"] as string) : null;
  return { assetId: row.id, width: row.width, height: row.height, rect, pad };
}

/**
 * Step 1, free: the canvas the painter is given (see drawGuide), saved to the
 * library; the same canvas made before for this artwork is used again.
 */
export async function prepareArtworkGuide(input: {
  picture: Picture;
  frame: Size;
  scale: number | null;
  finisherAssetId: string;
  userId: string;
  projectId: string | null;
  title: string;
}): Promise<ArtworkGuide & { pad: string }> {
  const { canvas, width, height, rect, pad, bands } = drawGuide(
    input.picture,
    input.frame,
    input.scale,
  );
  const { data: earlier } = await supabase
    .from("assets")
    .select("id,width,height,metadata")
    .filter("metadata->>derived_from_asset_id", "eq", input.finisherAssetId)
    .filter("metadata->artwork_guide->>pad", "eq", pad)
    .eq("width", width)
    .eq("height", height)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  for (const row of earlier ?? []) {
    const guide = guideFromRow(row);
    if (guide && sameRect(guide.rect, rect)) return { ...guide, pad };
  }
  const asset = await uploadAssetBlob(await canvasBlob(canvas, "image/jpeg", 0.95), {
    userId: input.userId,
    projectId: input.projectId,
    path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-artwork-guide.jpg`,
    mimeType: "image/jpeg",
    kind: "image",
    title: versionTitle(input.title, "to extend"),
    width,
    height,
    metadata: {
      derived_from_asset_id: input.finisherAssetId,
      artwork_guide: { version: GUIDE_VERSION, rect, pad, bands },
    },
  });
  return { assetId: asset.id, width, height, rect, pad };
}

/* ------------------------------------------------------------------ */
/* Pricing and painting                                                */
/* ------------------------------------------------------------------ */

export type ArtworkQuote =
  { ok: true; costUsd: number | null; description: string | null } | { ok: false; message: string };

/** Step 2, free: what painting it would cost, as the provider quotes it. */
export async function quoteArtworkExtension(
  painter: ArtworkPainter,
  guide: ArtworkGuide & { pad: string },
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
  guide: ArtworkGuide & { pad: string };
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

export interface Painting {
  assetId: string;
  bucket: string;
  path: string;
}

/** The painting a finished generation saved to the library, if it has. */
async function paintingOf(generationId: string): Promise<Painting | null> {
  const { data: asset } = await supabase
    .from("assets")
    .select("id,storage_bucket,storage_path")
    .eq("generation_id", generationId)
    .eq("asset_type", "image")
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return asset
    ? { assetId: asset.id, bucket: asset.storage_bucket, path: asset.storage_path }
    : null;
}

/**
 * Step 4: waits for the painting to be in the library. Higgsfield is asked
 * directly now and then, in case its notice is slow; the run itself is never
 * started again.
 */
export async function waitForPainting(
  generationId: string,
  timeoutMs = 8 * 60_000,
): Promise<Painting> {
  const deadline = Date.now() + timeoutMs;
  let asked = Date.now();
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("generations")
      .select("status,ingest_status,error_message")
      .eq("id", generationId)
      .maybeSingle();
    if (data?.status === "completed" && data.ingest_status === "completed") {
      const painting = await paintingOf(generationId);
      if (painting) return painting;
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
    "It's taking longer than usual. When it's done it will be offered here to check and use, at no further cost.",
  );
}

/* ------------------------------------------------------------------ */
/* Checking, using and recording                                       */
/* ------------------------------------------------------------------ */

/** The checks a painting is put through; one rejected by these isn't offered again. */
const CHECK_VERSION = 2;

/** What became of a painting, noted on it in the library. */
type Outcome =
  | { status: "rejected"; problem: NonNullable<Inspection["problem"]> }
  | { status: "applied"; extendedAssetId: string }
  | { status: "discarded" };

/**
 * Notes on the painting what became of it (and names it for what it is),
 * so the library's record shows why a paid painting was or wasn't used.
 * Best effort: a note that can't be written changes nothing else.
 */
async function recordOutcome(checked: CheckedPainting, outcome: Outcome): Promise<void> {
  try {
    const { data } = await supabase
      .from("assets")
      .select("metadata")
      .eq("id", checked.painting.assetId)
      .maybeSingle();
    const found = checked.inspection.found;
    const residue = checked.inspection.residue;
    const metadata = {
      ...((data?.metadata ?? {}) as Json),
      artwork_extension_check: {
        ...outcome,
        version: CHECK_VERSION,
        guide_asset_id: checked.guide.assetId,
        alignment: found ? Number(found.score.toFixed(4)) : null,
        scale: found ? Number(found.scale.toFixed(4)) : null,
        offset: found ? [Number(found.dx.toFixed(1)), Number(found.dy.toFixed(1))] : null,
        unpainted: residue
          ? { open: Number(residue.open.toFixed(4)), seam: Number(residue.seam.toFixed(4)) }
          : null,
        checked_at: new Date().toISOString(),
      },
    };
    await supabase
      .from("assets")
      .update({ metadata: metadata as never, title: checked.title })
      .eq("id", checked.painting.assetId);
  } catch {
    // Only a note.
  }
}

/** A painting checked, with the extended artwork made from it when it can be used (not yet saved). */
export interface CheckedPainting {
  generationId: string;
  painting: Painting;
  /** What the painting is named in the library (see paintingTitle). */
  title: string;
  guide: ArtworkGuide;
  inspection: Inspection;
  /** The extended artwork, ready to see and save; null when the painting can't be used. */
  result: { blob: Blob; width: number; height: number } | null;
  /** Why it can't be used, in a sentence; null when it can. */
  problem: string | null;
}

/**
 * Step 5, free: the painting checked (see inspectPainting) and, when it
 * passes, the extended artwork made from it: the artwork's own pixels laid
 * over the painting where the model left it. Nothing is saved yet; a painting
 * that fails is noted as such.
 */
export async function checkPainting(input: {
  /** The artwork as uploaded. */
  picture: Picture;
  guide: ArtworkGuide;
  painting: Painting;
  generationId: string;
  /** The video's frame. */
  frame: Size;
  /** What the painting is named in the library. */
  title: string;
}): Promise<CheckedPainting> {
  const url = await signedUrl(input.painting.bucket, input.painting.path, 600);
  if (!url) throw new Error("The painting couldn't be read from storage");
  const inspection = inspectPainting({
    art: input.picture,
    painting: await loadPicture(url),
    guide: input.guide,
  });
  const base = {
    generationId: input.generationId,
    painting: input.painting,
    title: input.title,
    guide: input.guide,
    inspection,
  };
  if (inspection.problem) {
    const checked: CheckedPainting = {
      ...base,
      result: null,
      problem: PROBLEM_TEXT[inspection.problem],
    };
    await recordOutcome(checked, { status: "rejected", problem: inspection.problem });
    return checked;
  }
  const canvas = composeExtended({
    art: input.picture,
    inspection,
    guide: input.guide,
    frame: input.frame,
  });
  const lossless = canvas.width * canvas.height <= 2_600_000;
  const blob = await canvasBlob(
    canvas,
    lossless ? "image/png" : "image/jpeg",
    lossless ? undefined : 0.95,
  );
  return {
    ...base,
    result: { blob, width: canvas.width, height: canvas.height },
    problem: null,
  };
}

/** Step 6, free: the extended artwork saved to the library; resolves to it. */
export async function saveExtension(input: {
  checked: CheckedPainting;
  finisherAssetId: string;
  painter: ArtworkPainter | null;
  frame: Size;
  userId: string;
  projectId: string | null;
  title: string;
}): Promise<string> {
  const { checked } = input;
  if (!checked.result) throw new Error("That painting can't be used for the artwork");
  const png = checked.result.blob.type === "image/png";
  const aspect = input.painter ? painterAspect(input.painter.model, input.frame) : null;
  const found = checked.inspection.found!;
  const asset = await uploadAssetBlob(checked.result.blob, {
    userId: input.userId,
    projectId: input.projectId,
    path: `${storageScope(input)}/inputs/${crypto.randomUUID()}-artwork-extended.${png ? "png" : "jpg"}`,
    mimeType: png ? "image/png" : "image/jpeg",
    kind: "image",
    title: versionTitle(input.title, aspect ? `extended to ${aspect}` : "extended"),
    width: checked.result.width,
    height: checked.result.height,
    metadata: {
      derived_from_asset_id: input.finisherAssetId,
      artwork_extension: {
        generation_id: checked.generationId,
        painted_asset_id: checked.painting.assetId,
        guide_asset_id: checked.guide.assetId,
        model_path: input.painter?.model.model_path ?? null,
        alignment: Number(found.score.toFixed(4)),
        scale: found.scale,
        offset: [Number(found.dx.toFixed(2)), Number(found.dy.toFixed(2))],
      },
    },
  });
  await recordOutcome(checked, { status: "applied", extendedAssetId: asset.id });
  return asset.id;
}

/** The person chose not to use a painting that passed: noted, so it isn't offered again. */
export async function discardPainting(checked: CheckedPainting): Promise<void> {
  await recordOutcome(checked, { status: "discarded" });
}

/** What a painting is named in the library: what it was made for. */
export function paintingTitle(title: string, painter: ArtworkPainter | null, frame: Size): string {
  const aspect = painter ? painterAspect(painter.model, frame) : null;
  return versionTitle(title, aspect ? `AI painting for ${aspect}` : "AI painting");
}

/* ------------------------------------------------------------------ */
/* Paintings paid for but never used                                   */
/* ------------------------------------------------------------------ */

export interface UnusedPainting {
  generationId: string;
  painting: Painting;
  guide: ArtworkGuide;
  /** When it was asked for. */
  createdAt: string;
}

/**
 * The latest painting made for this artwork at this frame's shape that was
 * never used: paid for, but its page closed before it was checked, or
 * checked by an earlier version of the checks. Using it costs nothing.
 */
export async function findUnusedPainting(
  finisherAssetId: string,
  frame: Size,
): Promise<UnusedPainting | null> {
  const { data: rows } = await supabase
    .from("assets")
    .select("id,width,height,metadata,created_at")
    .filter("metadata->>derived_from_asset_id", "eq", finisherAssetId)
    .not("metadata->artwork_guide", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);
  const guides = (rows ?? []).flatMap((row) => {
    const guide = guideFromRow(row);
    return guide &&
      Math.abs(Math.log(guide.width / guide.height / (frame.width / frame.height))) < 0.01
      ? [guide]
      : [];
  });
  if (!guides.length) return null;
  const { data: inputs } = await supabase
    .from("generation_inputs")
    .select("generation_id,asset_id")
    .in(
      "asset_id",
      guides.map((guide) => guide.assetId),
    );
  const generationIds = [...new Set((inputs ?? []).map((row) => row.generation_id))];
  if (!generationIds.length) return null;
  const { data: generations } = await supabase
    .from("generations")
    .select("id,status,ingest_status,created_at")
    .in("id", generationIds)
    .eq("status", "completed")
    .eq("ingest_status", "completed")
    .order("created_at", { ascending: false })
    .limit(6);
  for (const generation of generations ?? []) {
    const { data: asset } = await supabase
      .from("assets")
      .select("id,storage_bucket,storage_path,metadata")
      .eq("generation_id", generation.id)
      .eq("asset_type", "image")
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!asset) continue;
    const check = ((asset.metadata ?? {}) as Json)["artwork_extension_check"] as Json | undefined;
    const status = check?.["status"];
    if (status === "applied" || status === "discarded") continue;
    if (status === "rejected" && Number(check?.["version"]) >= CHECK_VERSION) continue;
    const input = (inputs ?? []).find((row) => row.generation_id === generation.id);
    const guide = guides.find((entry) => entry.assetId === input?.asset_id);
    if (!guide) continue;
    return {
      generationId: generation.id,
      painting: { assetId: asset.id, bucket: asset.storage_bucket, path: asset.storage_path },
      guide,
      createdAt: generation.created_at,
    };
  }
  return null;
}
