/**
 * What a render asks of the media service beyond the edit itself, only when
 * the service can do it: a finished master passed through untouched (feature
 * "mastering"; see ./master). An older service is simply not asked, and
 * renders the edit as it always has, so nothing here can stop a render.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rememberedWorker, workerHealth } from "../media/worker.server";
import { passThroughCandidate, untouchedClip } from "./master";
import type { buildRenderRequest, Timeline } from "./timeline";

type RenderRequest = ReturnType<typeof buildRenderRequest>;

/** How long what the media service last said it can do is taken as still so. */
const REMEMBERED_FOR_MS = 12 * 60 * 60 * 1000;

/**
 * What the media service can do: as it says now (its features, if asked
 * already), else as it last said, else asked; nothing when it can't be.
 */
async function serviceFeatures(known: string[] | null): Promise<string[]> {
  if (known) return known;
  const remembered = await rememberedWorker(REMEMBERED_FOR_MS).catch(() => null);
  if (remembered) return remembered.features;
  const health = await workerHealth().catch(() => null);
  return health?.ok ? (health.data?.features ?? []) : [];
}

/** The library's facts about the edit's one clip, when it could be passed through. */
async function passThroughSource(timeline: Timeline) {
  const clip = untouchedClip(timeline);
  if (!clip) return null;
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,width,height,duration_seconds,mime_type,metadata")
    .eq("id", clip.assetId)
    .maybeSingle();
  if (error || !data) return null;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const fps = typeof metadata["fps"] === "number" ? metadata["fps"] : null;
  return {
    assetId: data.id,
    width: data.width,
    height: data.height,
    durationSeconds: data.duration_seconds === null ? null : Number(data.duration_seconds),
    fps,
    mimeType: data.mime_type,
  };
}

/**
 * The render request with what the service can add to it. `features` is what
 * the service said just now, when the render asked it already.
 */
export async function withRenderExtras(
  timeline: Timeline,
  request: RenderRequest,
  features: string[] | null = null,
): Promise<RenderRequest> {
  const source = await passThroughSource(timeline);
  if (!passThroughCandidate(timeline, source)) return request;
  const can = await serviceFeatures(features);
  if (!can.includes("mastering")) return request;
  return { ...request, params: { ...request.params, pass_through: true } };
}
