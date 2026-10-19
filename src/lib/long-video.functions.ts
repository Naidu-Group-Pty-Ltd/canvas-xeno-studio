import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { FINALE_MODES, FINALE_SECONDS, LONG_VIDEO_LIMITS } from "./long-video/plan";
import { LONG_VIDEO_SEAMS } from "./edit/compile";
import { CHARACTER_LIMITS } from "./characters/model";
import { SECTION_LIMITS } from "./lip-sync/sections";
import { LIP_CHECK } from "./lip-sync/lip-check";

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
  /** How its end card was laid out, so the Editor can lay it out again over the video's end. */
  style: z
    .object({
      background: z.string().max(16),
      scale: z.number().min(0.3).max(1).nullable(),
    })
    .nullable()
    .optional(),
  /** The finisher extended to the video's shape with AI, its end card made from it. */
  sourceAssetId: z.string().uuid().nullable().optional(),
});

const startInput = z
  .object({
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
    // Made to a voiceover, a video can be one clip (its piece is the whole voiceover).
    clips: z.array(clipSchema).min(1).max(LONG_VIDEO_LIMITS.maxClips),
    /** The brand's logo or end card the video ends on, kept out of the clips. */
    finale: finaleSchema.nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    campaignId: z.string().uuid().nullable().optional(),
    clientRequestId: z.string().min(8).max(64).optional(),
    /** Characters who must look the same throughout. */
    characterIds: z.array(z.string().uuid()).max(CHARACTER_LIMITS.perRun).default([]),
    /** Check every clip against the characters' images before the next is made. */
    identityCheck: z.boolean().default(true),
    /** Paint the keyframes first with this image model, and whether a person reviews them. */
    keyframes: z
      .object({
        painterModelId: z.string().uuid(),
        review: z.boolean().default(true),
        /** Paint the opening keyframe from the character's Soul ID (one character with one). */
        soulOpening: z.boolean().default(false),
      })
      .nullable()
      .optional(),
    /** Made to a voiceover: its preparation, and the piece of it each clip is made from. */
    voiceover: z
      .object({
        preparationId: z.string().uuid(),
        pieces: z
          .array(
            z.object({
              start: z
                .number()
                .min(0)
                .max(LONG_VIDEO_LIMITS.maxSeconds + 1),
              end: z
                .number()
                .positive()
                .max(LONG_VIDEO_LIMITS.maxSeconds + 1),
              requestSeconds: z.number().positive().max(120),
            }),
          )
          .min(1)
          .max(LONG_VIDEO_LIMITS.maxClips),
        keepClipSound: z.boolean().default(false),
        /** Stretches covered by B-roll: no clip is made for them. */
        cutaways: z
          .array(
            z.object({
              start: z
                .number()
                .min(0)
                .max(LONG_VIDEO_LIMITS.maxSeconds + 1),
              end: z
                .number()
                .positive()
                .max(LONG_VIDEO_LIMITS.maxSeconds + 1),
            }),
          )
          .max(SECTION_LIMITS.maxCutaways)
          .default([]),
      })
      .nullable()
      .optional(),
    /** Every clip from clip 1's start image (anchor), or each from the one before (chain). */
    startFrom: z.enum(["chain", "anchor"]).default("chain"),
    /** What the whole run is expected to cost, checked against spending limits before it starts. */
    estimatedCostUsd: z.number().min(0).max(100_000).nullable().optional(),
    /** Lips scored from each clip's picture, and takes to reach a good score. */
    qc: z
      .object({
        lipCheck: z.boolean().default(false),
        takes: z.number().int().min(1).max(LIP_CHECK.maxTakes).default(1),
      })
      .nullable()
      .optional(),
    /** The brand kit the video is made in. */
    brandKitId: z.string().uuid().nullable().optional(),
  })
  // Without a voiceover, a long video is at least two clips.
  .refine((value) => !!value.voiceover || value.clips.length >= LONG_VIDEO_LIMITS.minClips, {
    message: "That length fits in one clip; switch to One clip",
    path: ["clips"],
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
      characterIds: data.characterIds,
      identityCheck: data.identityCheck,
      keyframes: data.keyframes ?? null,
      voiceover: data.voiceover ?? null,
      startFrom: data.startFrom,
      qc: data.qc ?? null,
      estimatedCostUsd: data.estimatedCostUsd ?? null,
      brandKitId: data.brandKitId ?? null,
    });
  });

const planInput = z.object({
  firstModelId: z.string().uuid(),
  continuationModelId: z.string().uuid(),
  story: z.string().max(LONG_VIDEO_LIMITS.storyChars).default(""),
  continuity: z.string().max(LONG_VIDEO_LIMITS.continuityChars).default(""),
  title: z.string().max(LONG_VIDEO_LIMITS.titleChars).default(""),
  durations: z.array(z.number().positive().max(120)).min(1).max(LONG_VIDEO_LIMITS.maxClips),
  referenceAssetIds: z.array(z.string().uuid()).max(6).default([]),
  briefId: z.string().uuid().nullable().optional(),
  /** The finisher the video ends on, when one is chosen (one of the references). */
  finale: z
    .object({ assetId: z.string().uuid(), mode: z.enum(FINALE_MODES) })
    .nullable()
    .optional(),
  /** Characters who must look the same throughout (the AI sees their images too). */
  characterIds: z.array(z.string().uuid()).max(CHARACTER_LIMITS.perRun).default([]),
  /** Each clip's final moment is painted as a keyframe first. */
  keyframes: z.boolean().default(false),
  /** Made to a voiceover: the words spoken in each clip (empty where unknown). */
  spoken: z.array(z.string().max(4000)).max(LONG_VIDEO_LIMITS.maxClips).nullable().optional(),
  /** The brand kit the video is made in: the beats keep to its look and voice. */
  brandKitId: z.string().uuid().nullable().optional(),
  /** The content formula the video follows (see ./brand/formulas), timed to its length. */
  formulaId: z.string().min(1).max(60).nullable().optional(),
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
    if (
      !data.story.trim() &&
      !data.referenceAssetIds.length &&
      !data.briefId &&
      !data.characterIds.length
    )
      throw new AppError(
        "INVALID_PARAMETERS",
        "Describe the video first (or attach a reference, brief or character), then ask for beats.",
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
    // The characters, each with their best views (at least one each), after the references.
    const { charactersForRun } = await import("./characters/service.server");
    const characters = data.characterIds.length ? await charactersForRun(data.characterIds) : [];
    const perCharacter = characters.length ? Math.max(1, Math.floor(6 / characters.length)) : 0;
    const characterImages: { name: string; description: string; images: number[] }[] = [];
    for (const character of characters) {
      const ids = character.images.slice(0, perCharacter).map((image) => image.assetId);
      const { data: rows } = await db
        .from("assets")
        .select("id,asset_type,storage_bucket,storage_path,title,mime_type,metadata")
        .in("id", ids)
        .is("deleted_at", null);
      const signed = await agent.signVisionSources(
        ids
          .flatMap((id) => {
            const row = (rows ?? []).find((entry) => entry.id === id);
            return row ? [agent.visionSourceFor(row)] : [];
          })
          .filter((source): source is NonNullable<typeof source> => !!source),
      );
      const numbers = signed.urls.map((_, index) => vision.urls.length + index + 1);
      vision.urls.push(...signed.urls);
      characterImages.push({
        name: character.name,
        description: character.description,
        images: numbers,
      });
    }

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

    if (data.brandKitId) {
      const { brandBlock } = await import("./brand/use.server");
      briefBlock = [briefBlock, await brandBlock(data.brandKitId)].filter(Boolean).join("\n\n");
    }

    let formula = "";
    if (data.formulaId) {
      const { formulaBlock, formulaById } = await import("./brand/formulas");
      const { loadBrandKit } = await import("./brand/use.server");
      const kit = await loadBrandKit(data.brandKitId);
      // The brand's own formulas resolve too.
      const chosen = formulaById(data.formulaId, kit?.ownFormulas ?? []);
      if (!chosen)
        throw new AppError(
          "INVALID_PARAMETERS",
          "That content formula isn't in the library or the brand's own formulas",
        );
      const total = data.durations.reduce((sum, seconds) => sum + seconds, 0);
      formula = formulaBlock(chosen, { seconds: Math.max(1, Math.round(total)) });
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
      characters: characterImages,
      keyframes: data.keyframes,
      spoken: data.spoken ?? null,
      formula,
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

/** Approves a run's keyframes: its clips start. */
export const approveStoryboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => runInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, data.longVideoId);
    const service = await import("./long-video/service.server");
    await service.approveStoryboard(data.longVideoId);
    return { ok: true };
  });

/** Which run a keyframe or clip belongs to (for checking who may change it). */
async function runOf(
  table: "long_video_keyframes" | "long_video_clips",
  id: string,
): Promise<string> {
  const db = await admin();
  const { data } = await db.from(table).select("long_video_id").eq("id", id).maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That no longer exists");
  return data.long_video_id;
}

/** Paints a keyframe again (billed), or it and every one after it, with a note on what to change. */
export const redoKeyframes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        keyframeId: z.string().uuid(),
        scope: z.enum(["one", "rest"]).default("one"),
        note: z.string().max(1000).default(""),
        confirmUncertain: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_keyframes", data.keyframeId));
    const service = await import("./long-video/service.server");
    await service.redoKeyframes(data);
    return { ok: true };
  });

/** Keeps a keyframe the check flagged. */
export const keepKeyframe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ keyframeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_keyframes", data.keyframeId));
    const service = await import("./long-video/service.server");
    await service.keepKeyframe(data);
    return { ok: true };
  });

/** A frame for a clip to start from: an image in the library, the run's anchor, or its usual start (null). */
const startFrameInput = z.union([z.string().uuid(), z.literal("anchor"), z.null()]);

/**
 * Makes a finished clip again (billed), e.g. one whose character check failed
 * or whose lips scored poorly; its current take is kept to swap back. It can
 * start from another frame this time (the run's anchor, or a chosen image).
 */
export const redoLongVideoClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clipId: z.string().uuid(), startFrame: startFrameInput.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_clips", data.clipId));
    const service = await import("./long-video/service.server");
    await service.redoLongVideoClip(data);
    return { ok: true };
  });

/** Puts one of a clip's kept takes back in use (its current take is kept in turn). */
export const chooseLongVideoTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ takeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: take } = await db
      .from("long_video_clip_takes")
      .select("long_video_id")
      .eq("id", data.takeId)
      .maybeSingle();
    if (!take) throw new AppError("INVALID_PARAMETERS", "That take no longer exists");
    await assertCanManage(context.userId, take.long_video_id);
    const service = await import("./long-video/service.server");
    await service.chooseLongVideoTake(data);
    return { ok: true };
  });

/** Holds a clip that hasn't started (the run waits at it), or releases it. */
export const holdLongVideoClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clipId: z.string().uuid(), held: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_clips", data.clipId));
    const service = await import("./long-video/service.server");
    await service.holdLongVideoClip(data);
    return { ok: true };
  });

/** Chooses the frame a clip that hasn't started (or failed) will start from. */
export const setClipStartFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ clipId: z.string().uuid(), startFrame: startFrameInput }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_clips", data.clipId));
    const service = await import("./long-video/service.server");
    await service.setClipStartFrame(data);
    return { ok: true };
  });

/** Chooses the B-roll for one of a run's cutaways (null clears it). */
export const setCutawayFill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    runInput
      .extend({
        index: z.number().int().min(0).max(SECTION_LIMITS.maxCutaways),
        fill: z
          .object({
            assetId: z.string().uuid(),
            inPoint: z.number().min(0).max(86_400).default(0),
            label: z.string().max(120).nullable().optional(),
          })
          .nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, data.longVideoId);
    const service = await import("./long-video/service.server");
    await service.setCutawayFill(data);
    return { ok: true };
  });

/** Keeps a clip whose character check failed, and carries on. */
export const keepLongVideoClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ clipId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.userId, await runOf("long_video_clips", data.clipId));
    const service = await import("./long-video/service.server");
    await service.keepLongVideoClip(data);
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
        seam: z.enum(LONG_VIDEO_SEAMS).default("smart"),
        keepSound: z.boolean().default(true),
        fresh: z.boolean().default(false),
        // Made to a voiceover: its words as captions, in the script's words where given.
        captions: z.boolean().default(false),
        script: z.string().max(20_000).nullable().optional(),
        terms: z.array(z.string().min(1).max(60)).max(30).default([]),
        // Made to a voiceover: a licensed music bed, and titles on the voiceover's clock.
        musicAssetId: z.string().uuid().nullable().optional(),
        titles: z
          .array(
            z.object({
              text: z.string().min(1).max(160),
              at: z.number().min(0).max(LONG_VIDEO_LIMITS.maxSeconds),
              seconds: z.number().min(0.5).max(30),
              style: z.enum(["title", "subtitle", "cta"]).optional(),
              position: z.enum(["top", "center", "bottom"]).optional(),
            }),
          )
          .max(20)
          .default([]),
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
