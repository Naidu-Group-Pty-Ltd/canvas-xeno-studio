import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { FINALE_MODES, FINALE_SECONDS, LONG_VIDEO_LIMITS } from "./long-video/plan";

/**
 * Long videos: chains of clips that play as one continuous shot. Runs are
 * started, retried and stopped here and then carried on by the server
 * (webhooks, media-service callbacks and the reconcile job), so a run keeps
 * going with no browser open. Members follow progress from the database.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function activeMember(userId: string): Promise<{ id: string; role: string }> {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("id,is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "Your account is not an active team member");
  return { id: data.id, role: data.role };
}

/** Retrying, continuing and stopping a run spend (or stop) its owner's work: the owner or an admin only. */
async function assertCanManage(userId: string, longVideoId: string): Promise<void> {
  const member = await activeMember(userId);
  const db = await admin();
  const { data: run } = await db
    .from("long_videos")
    .select("created_by")
    .eq("id", longVideoId)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");
  if (run.created_by !== userId && member.role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who started this long video, or an admin, can change it",
    );
}

const clipSchema = z.object({
  beat: z.string().max(LONG_VIDEO_LIMITS.beatChars).default(""),
  durationSeconds: z.number().positive().max(120),
  // A clip's prompt is its opening, beat, continuity notes and the story.
  prompt: z.string().max(16000),
});

const finaleSchema = z.object({
  assetId: z.string().uuid(),
  mode: z.enum(FINALE_MODES),
  seconds: z
    .number()
    .min(FINALE_SECONDS.min)
    .max(FINALE_SECONDS.max)
    .default(FINALE_SECONDS.default),
  frameAssetId: z.string().uuid().nullable().optional(),
});

const startInput = z.object({
  title: z.string().max(LONG_VIDEO_LIMITS.titleChars).default(""),
  firstModelId: z.string().uuid(),
  continuationModelId: z.string().uuid(),
  story: z.string().max(LONG_VIDEO_LIMITS.storyChars).default(""),
  continuity: z.string().max(LONG_VIDEO_LIMITS.continuityChars).default(""),
  values: z.record(z.unknown()).default({}),
  references: z
    .array(z.object({ assetId: z.string().uuid(), role: z.string().min(1).max(40) }))
    .max(60)
    .default([]),
  clips: z.array(clipSchema).min(LONG_VIDEO_LIMITS.minClips).max(LONG_VIDEO_LIMITS.maxClips),
  /** The brand's logo or end card the video ends on, kept out of the clips. */
  finale: finaleSchema.nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  clientRequestId: z.string().min(8).max(64).optional(),
});

/** Starts a long video: records every clip, then starts the first one. */
export const startLongVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startInput.parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const service = await import("./long-video/service.server");
    return service.startLongVideo({
      userId: context.userId,
      title: data.title,
      firstModelId: data.firstModelId,
      continuationModelId: data.continuationModelId,
      story: data.story,
      continuity: data.continuity,
      values: data.values,
      references: data.references,
      clips: data.clips,
      finale: data.finale ?? null,
      projectId: data.projectId ?? null,
      campaignId: data.campaignId ?? null,
      clientRequestId: data.clientRequestId ?? null,
    });
  });

const planInput = z.object({
  firstModelId: z.string().uuid(),
  continuationModelId: z.string().uuid(),
  story: z.string().max(LONG_VIDEO_LIMITS.storyChars).default(""),
  continuity: z.string().max(LONG_VIDEO_LIMITS.continuityChars).default(""),
  title: z.string().max(LONG_VIDEO_LIMITS.titleChars).default(""),
  durations: z
    .array(z.number().positive().max(120))
    .min(LONG_VIDEO_LIMITS.minClips)
    .max(LONG_VIDEO_LIMITS.maxClips),
  referenceAssetIds: z.array(z.string().uuid()).max(6).default([]),
  briefId: z.string().uuid().nullable().optional(),
  /** The finisher the video ends on, when one is chosen (one of the references). */
  finale: z
    .object({ assetId: z.string().uuid(), mode: z.enum(FINALE_MODES) })
    .nullable()
    .optional(),
});

/** Suggests a title, continuity notes and one beat per clip. Nothing is generated. */
export const planLongVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => planInput.parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const db = await admin();
    const { data: models } = await db
      .from("model_registry")
      .select("*")
      .in("id", [data.firstModelId, data.continuationModelId]);
    const first = models?.find((row) => row.id === data.firstModelId);
    const continuation = models?.find((row) => row.id === data.continuationModelId);
    if (!first?.is_active || !continuation?.is_active)
      throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
    if (!data.story.trim() && !data.referenceAssetIds.length && !data.briefId)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Describe the video first (or attach a reference or brief), then ask for beats.",
      );

    const agent = await import("./supercomputer/agent.server");
    const { data: refs } = data.referenceAssetIds.length
      ? await db
          .from("assets")
          .select("id,asset_type,storage_bucket,storage_path,title,mime_type,metadata")
          .in("id", data.referenceAssetIds)
          .is("deleted_at", null)
      : { data: [] };
    // In the order given, so the images are numbered as the person sees them.
    const ordered = data.referenceAssetIds.flatMap((id) => {
      const row = (refs ?? []).find((entry) => entry.id === id);
      return row ? [row] : [];
    });
    const vision = await agent.signVisionSources(
      ordered
        .map(agent.visionSourceFor)
        .filter((source): source is NonNullable<typeof source> => !!source)
        .slice(0, 6),
    );

    let briefBlock = "";
    if (data.briefId) {
      const { data: brief } = await db
        .from("creative_briefs")
        .select("title,analysis,extracted_text")
        .eq("id", data.briefId)
        .maybeSingle();
      if (brief) {
        const analysis = brief.analysis as Record<string, unknown>;
        briefBlock = `BRIEF "${brief.title}":\n${
          Object.keys(analysis ?? {}).length
            ? JSON.stringify(analysis)
            : brief.extracted_text.slice(0, 12000)
        }`;
      }
    }

    const { suggestLongVideoPlan } = await import("./long-video/planner.server");
    const imageIds = vision.used.map((source) => source.assetId);
    const suggestion = await suggestLongVideoPlan({
      first: first as never,
      story: data.story,
      continuity: data.continuity,
      title: data.title,
      durations: data.durations,
      imageUrls: vision.urls,
      briefBlock,
      finale: data.finale
        ? { image: imageIds.indexOf(data.finale.assetId) + 1 || null, mode: data.finale.mode }
        : null,
    });
    const { finisherImage, ...plan } = suggestion;
    // The image the AI took for the brand's logo or end card, when none is chosen yet.
    return {
      ...plan,
      finisherAssetId: finisherImage ? (imageIds[finisherImage - 1] ?? null) : null,
    };
  });

const runInput = z.object({ longVideoId: z.string().uuid() });

/** Tries a failed clip again (a new, billed generation), or a failed handoff frame. */
export const retryLongVideoClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ clipId: z.string().uuid(), confirmUncertain: z.boolean().default(false) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: clip } = await db
      .from("long_video_clips")
      .select("long_video_id")
      .eq("id", data.clipId)
      .maybeSingle();
    if (!clip) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
    await assertCanManage(context.userId, clip.long_video_id);
    const service = await import("./long-video/service.server");
    await service.retryLongVideoClip(data);
    return { ok: true };
  });

/** Picks a stopped run up again from where it stopped. */
export const continueLongVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => runInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, data.longVideoId);
    const service = await import("./long-video/service.server");
    await service.continueLongVideo(data.longVideoId);
    return { ok: true };
  });

/** Stops a run after the clip in progress. */
export const stopLongVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => runInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, data.longVideoId);
    const service = await import("./long-video/service.server");
    await service.stopLongVideo(data.longVideoId);
    return { ok: true };
  });

/** Moves a run on if anything is waiting (e.g. a missed event). Changes nothing otherwise. */
export const checkLongVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => runInput.parse(data))
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const service = await import("./long-video/service.server");
    await service.advanceLongVideo(data.longVideoId);
    return { ok: true };
  });

/**
 * Opens a run's clips in the Editor as one edit, cut seamlessly at the handoff
 * frames, ending on its end card: the run's own (unless `endCard` says
 * otherwise), another image, or none (null).
 */
export const openLongVideoInEditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    runInput
      .extend({
        seam: z.enum(["cut", "blend"]).default("cut"),
        keepSound: z.boolean().default(true),
        fresh: z.boolean().default(false),
        endCard: z
          .object({
            assetId: z.string().uuid(),
            seconds: z.number().min(FINALE_SECONDS.min).max(FINALE_SECONDS.max),
          })
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await activeMember(context.userId);
    const service = await import("./long-video/service.server");
    return service.openLongVideoInEditor({ ...data, userId: context.userId });
  });
