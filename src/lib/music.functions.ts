import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./higgsfield/errors";
import { MUSIC_LENGTH, MUSIC_MODELS } from "./music/catalog";

/** What the browser gets back about a track it just added; the library list has the rest. */
interface TrackSummary {
  id: string;
  assetId: string | null;
  title: string;
  /** "ready", "generating" (still being made), or a recorded "failed" / "submission_uncertain". */
  status: string;
  errorMessage: string | null;
  durationSeconds: number | null;
  duplicate: boolean;
  /**
   * The request id the track answers to. It differs from the one sent when the
   * same work was already being made for another request; asking with this id
   * then follows that work.
   */
  requestId: string | null;
}

function summary(result: {
  track: Record<string, unknown> & { id: string };
  duplicate: boolean;
}): TrackSummary {
  const { track } = result;
  return {
    id: track.id,
    assetId: typeof track["asset_id"] === "string" ? track["asset_id"] : null,
    title: String(track["title"] ?? ""),
    status: String(track["status"] ?? ""),
    errorMessage: typeof track["error_message"] === "string" ? track["error_message"] : null,
    durationSeconds: track["duration_seconds"] == null ? null : Number(track["duration_seconds"]),
    duplicate: result.duplicate,
    requestId: typeof track["dedupe_key"] === "string" ? track["dedupe_key"] : null,
  };
}

/**
 * Music library. Searches, imports and every call that reaches a music
 * provider run here, server-side; the browser only sees results.
 */

export const getMusicStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { elevenMusicConfigured, openverseAuthenticated } =
      await import("./music/providers.server");
    return {
      openverse: true,
      openverseAuthenticated: openverseAuthenticated(),
      elevenlabs: elevenMusicConfigured(),
    };
  });

export const searchOpenverseMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().max(200).default(""),
        kind: z.enum(["music", "sound_effect"]).default("music"),
        length: z.enum(["shortest", "short", "medium", "long"]).optional(),
        page: z.number().int().min(1).max(12).default(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { searchOpenverse } = await import("./music/providers.server");
    const { requireActiveMember } = await import("./music/service.server");
    await requireActiveMember(context.userId);
    const result = await searchOpenverse(data);
    if (!result.ok) throw new AppError(result.code as never, result.message);
    return { tracks: result.tracks, total: result.total, pages: result.pages };
  });

const scope = {
  projectId: z.string().uuid().nullable().default(null),
  campaignId: z.string().uuid().nullable().default(null),
};

export const importOpenverseMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ openverseId: z.string().trim().min(1).max(100), ...scope }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runWhileConnected } = await import("./generation-pipeline.server");
    const { importOpenverseTrack } = await import("./music/service.server");
    return summary(
      await runWhileConnected(getRequest(), () =>
        importOpenverseTrack({ ...data, userId: context.userId }),
      ),
    );
  });

export const generateMusicTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(10).max(2000),
        title: z.string().trim().min(1).max(200),
        seconds: z.number().min(MUSIC_LENGTH.min).max(MUSIC_LENGTH.max),
        model: z
          .enum(MUSIC_MODELS.map((model) => model.id) as [string, ...string[]])
          .nullable()
          .default(null),
        instrumental: z.boolean().default(true),
        genres: z.array(z.string().max(40)).max(8).default([]),
        moods: z.array(z.string().max(40)).max(8).default([]),
        bpm: z.number().min(40).max(250).nullable().default(null),
        clientRequestId: z.string().min(8).max(64),
        ...scope,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runWhileConnected } = await import("./generation-pipeline.server");
    const { generateMusic } = await import("./music/service.server");
    // Billable work that has started finishes and is recorded even if the browser goes away.
    return summary(
      await runWhileConnected(getRequest(), () =>
        generateMusic({ ...data, userId: context.userId }),
      ),
    );
  });

export const makeInstrumentalTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ trackId: z.string().uuid(), clientRequestId: z.string().min(8).max(64) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runWhileConnected } = await import("./generation-pipeline.server");
    const { makeInstrumental } = await import("./music/service.server");
    return summary(
      await runWhileConnected(getRequest(), () =>
        makeInstrumental({ ...data, userId: context.userId }),
      ),
    );
  });

/**
 * Starts uploading a recording for its licence: the server records the upload
 * and picks where the file goes, and the browser uploads it there.
 */
export const stageMusicUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(300),
        mimeType: z.string().max(100),
        size: z
          .number()
          .int()
          .positive()
          .max(2 * 1024 ** 3),
        projectId: z.string().uuid().nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { stageUpload } = await import("./music/service.server");
    return stageUpload({ ...data, userId: context.userId });
  });

/**
 * Records the licence of a recording: one just uploaded (`uploadId`, from
 * stageMusicUpload), or audio already in the library (`assetId`).
 */
export const registerUploadedMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        uploadId: z.string().uuid().nullable().default(null),
        assetId: z.string().uuid().nullable().default(null),
        title: z.string().trim().min(1).max(300),
        artist: z.string().trim().max(300).nullable().default(null),
        kind: z.enum(["music", "sound_effect"]).default("music"),
        license: z.enum(["licensed", "owned"]),
        rights: z.unknown().optional(),
        confirmed: z.literal(true),
        genres: z.array(z.string().max(40)).max(8).default([]),
        moods: z.array(z.string().max(40)).max(8).default([]),
        instrumental: z.boolean().nullable().default(null),
        /** Measured by the browser when the file isn't one the server can measure. */
        durationSeconds: z.number().positive().max(7200).nullable().default(null),
        ...scope,
      })
      .refine((value) => (value.uploadId === null) !== (value.assetId === null), {
        message: "Upload an audio file first.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { registerUploadedTrack } = await import("./music/service.server");
    const { confirmed: _confirmed, ...rest } = data;
    try {
      const track = await registerUploadedTrack({
        ...rest,
        rights: rest.rights ?? {},
        userId: context.userId,
      });
      return summary({ track, duplicate: false });
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new AppError(
          "INVALID_PARAMETERS",
          "Add who licensed the track and where it may be used.",
        );
      throw error;
    }
  });

export const saveMusicAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        trackId: z.string().uuid(),
        bpm: z.number().min(40).max(250),
        beats: z.array(z.number().min(0).max(36_000)).max(5000),
        durationSeconds: z.number().positive().max(36_000).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveTrackAnalysis } = await import("./music/service.server");
    await saveTrackAnalysis({ ...data, userId: context.userId });
    return { ok: true };
  });

export const setMusicArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ trackId: z.string().uuid(), archived: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { setTrackArchived } = await import("./music/service.server");
    await setTrackArchived({ ...data, userId: context.userId });
    return { ok: true };
  });
