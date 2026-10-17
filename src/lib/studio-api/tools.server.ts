/**
 * The studio's API: the operations a script or an agent may run, each
 * validated, run as the token's owner and held to the same rules as the app
 * (an active member; the run's owner or an admin to steer it; the spending
 * checks every generation passes). Nothing here writes SQL a caller wrote,
 * and nothing returns a secret: files come back as links valid for an hour.
 *
 * Served as MCP tools (./mcp.server) and as plain JSON over HTTP
 * (/api/public/studio/<tool>). See docs/studio-api.md.
 */
import { z } from "zod/v4";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import { lipSyncCapable, lipSyncValues } from "../lip-sync/models";
import { presenterPrompt, presenterStory, presenterValues } from "../lip-sync/presenter";
import { readWords, timingOf } from "../lip-sync/analysis";
import { cutawaysForLines, SECTION_LIMITS, voiceoverLines } from "../lip-sync/sections";
import { LIP_CHECK } from "../lip-sync/lip-check";
import { planVoiceoverClips } from "../long-video/voiceover";
import { clipPrompt, LONG_VIDEO_LIMITS } from "../long-video/plan";
import { addEndCard, applyBrandKit, brandKitOf, SAFE_AREAS } from "../edit/brand";
import { parseTimeline, timelineSchema } from "../edit/timeline";
import { textCheckOf } from "../media/text-check";
import type { ModelRegistryEntry } from "../model-schema";
import type { ApiScope } from "./tokens";
import type { ApiCaller } from "./tokens.server";

type Json = Record<string, unknown>;

export interface StudioTool {
  name: string;
  title: string;
  description: string;
  /** What the caller's token must allow. */
  scope: ApiScope;
  /** Changes nothing (MCP readOnlyHint). */
  readOnly: boolean;
  input: z.ZodType;
  run: (args: unknown, caller: ApiCaller) => Promise<unknown>;
}

function tool<S extends z.ZodType>(definition: {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  readOnly?: boolean;
  input: S;
  run: (args: z.output<S>, caller: ApiCaller) => Promise<unknown>;
}): StudioTool {
  return {
    ...definition,
    readOnly: definition.readOnly ?? definition.scope === "read",
    run: (args, caller) => definition.run(definition.input.parse(args ?? {}), caller),
  };
}

const id = () => z.string().uuid();
const requestId = () =>
  z
    .string()
    .min(8)
    .max(64)
    .describe(
      "Your own unique id for this request (8-64 characters). Sending the same id again returns the first result instead of doing it twice.",
    );

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

async function roleOf(userId: string): Promise<string> {
  const { data } = await db
    .from("profiles")
    .select("is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active)
    throw new AppError("NOT_AUTHORIZED", "The token's owner is not an active team member");
  return data.role;
}

/** Steering a run spends (or stops) its owner's work: the owner or an admin only. */
async function assertCanManageRun(userId: string, longVideoId: string): Promise<void> {
  const role = await roleOf(userId);
  const { data: run } = await db
    .from("long_videos")
    .select("created_by")
    .eq("id", longVideoId)
    .maybeSingle();
  if (!run) throw new AppError("INVALID_PARAMETERS", "That long video no longer exists");
  if (run.created_by !== userId && role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who started this long video, or an admin, can change it",
    );
}

async function runOfClip(clipId: string): Promise<string> {
  const { data } = await db
    .from("long_video_clips")
    .select("long_video_id")
    .eq("id", clipId)
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That clip no longer exists");
  return data.long_video_id;
}

async function signedLink(bucket: string, path: string): Promise<string | null> {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

async function activeModel(modelId: string): Promise<ModelRegistryEntry> {
  const { data } = await db.from("model_registry").select("*").eq("id", modelId).maybeSingle();
  if (!data || !data.is_active)
    throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
  return data as unknown as ModelRegistryEntry;
}

/** A model, as an API caller needs it: what it takes and what can be set. */
function modelSummary(model: ModelRegistryEntry) {
  const fields = model.parameter_schema?.fields ?? [];
  return {
    id: model.id,
    name: model.display_name,
    path: model.model_path,
    operation: model.operation,
    output: model.output_type,
    lipSync: lipSyncCapable(model),
    inputs: (model.capabilities?.inputs ?? []).map((slot) => ({
      role: slot.role,
      type: slot.type,
      ...(slot.label ? { label: slot.label } : {}),
      ...(slot.required ? { required: true } : {}),
      ...(slot.array ? { many: true } : {}),
    })),
    parameters: fields.map((field) => ({
      key: field.key,
      type: field.type,
      ...(field.required ? { required: true } : {}),
      ...(field.default !== undefined ? { default: field.default } : {}),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.options
        ? {
            options: field.options.map((option) =>
              typeof option === "object" && option !== null ? option.value : option,
            ),
          }
        : {}),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

const whoami = tool({
  name: "whoami",
  title: "Who am I",
  description: "The team member this token acts as, their role, and what the token may do.",
  scope: "read",
  input: z.object({}),
  run: async (_args, caller) => {
    const { data } = await db
      .from("profiles")
      .select("id,full_name,role")
      .eq("id", caller.userId)
      .maybeSingle();
    return {
      userId: caller.userId,
      name: data?.full_name ?? null,
      role: data?.role ?? null,
      scopes: [...caller.scopes],
    };
  },
});

const listModels = tool({
  name: "list_models",
  title: "List models",
  description:
    "The generation models the studio offers: their ids, what they make, the media inputs they take (by role) and the parameters that can be set. Models marked lipSync move a speaker's lips to a voiceover (use them with start_presenter_video).",
  scope: "read",
  input: z.object({
    output: z.enum(["image", "video", "audio"]).optional().describe("Only models that make this"),
    search: z.string().max(80).optional().describe("Words in the model's name or path"),
    lipSync: z.boolean().optional().describe("Only models a voiceover can drive"),
  }),
  run: async (args) => {
    let query = db.from("model_registry").select("*").eq("is_active", true).order("sort_order");
    if (args.output) query = query.eq("output_type", args.output);
    const { data, error } = await query;
    if (error) throw new AppError("UNKNOWN", "The models couldn't be read");
    const words = args.search?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    return ((data ?? []) as unknown as ModelRegistryEntry[])
      .filter((model) =>
        words.every((word) =>
          `${model.display_name} ${model.model_path}`.toLowerCase().includes(word),
        ),
      )
      .filter((model) => args.lipSync === undefined || lipSyncCapable(model) === args.lipSync)
      .map(modelSummary);
  },
});

const listAssets = tool({
  name: "list_assets",
  title: "List library files",
  description:
    "Files in the studio's library (newest first): images, videos and audio, with their size and length.",
  scope: "read",
  input: z.object({
    kind: z.enum(["image", "video", "audio"]).optional(),
    projectId: id().optional(),
    search: z.string().max(80).optional().describe("Words in the file's title"),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  run: async (args) => {
    let query = db
      .from("assets")
      .select(
        "id,title,asset_type,mime_type,width,height,duration_seconds,project_id,generation_id,created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(args.limit);
    if (args.kind) query = query.eq("asset_type", args.kind);
    if (args.projectId) query = query.eq("project_id", args.projectId);
    if (args.search) query = query.ilike("title", `%${args.search.replace(/[%_]/g, "")}%`);
    const { data, error } = await query;
    if (error) throw new AppError("UNKNOWN", "The library couldn't be read");
    return data ?? [];
  },
});

const getAsset = tool({
  name: "get_asset",
  title: "Get a library file",
  description:
    "One library file: what it is, a download link valid for an hour, and any text check kept with it.",
  scope: "read",
  input: z.object({ assetId: id() }),
  run: async (args) => {
    const { data: asset } = await db
      .from("assets")
      .select(
        "id,title,asset_type,mime_type,width,height,duration_seconds,file_size,project_id,generation_id,storage_bucket,storage_path,metadata,created_at",
      )
      .eq("id", args.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset) throw new AppError("INVALID_PARAMETERS", "That file isn't in the library");
    const { storage_bucket: bucket, storage_path: path, metadata, ...rest } = asset;
    const measured = (metadata ?? {}) as Json;
    return {
      ...rest,
      fps: typeof measured["fps"] === "number" ? measured["fps"] : null,
      textCheck: textCheckOf(metadata),
      url: await signedLink(bucket, path),
    };
  },
});

const getGeneration = tool({
  name: "get_generation",
  title: "Get a generation",
  description:
    "A generation's progress (local_queued, submitting, processing, completed, failed, ...), its cost and, once done, the library files it made.",
  scope: "read",
  input: z.object({ generationId: id() }),
  run: async (args) => {
    const { data: generation } = await db
      .from("generations")
      .select(
        "id,status,model_path,operation,prompt,parameters,estimated_cost_usd,actual_cost_usd,error_code,error_message,project_id,campaign_id,client_request_id,auto_retries,retry_after,created_at,completed_at",
      )
      .eq("id", args.generationId)
      .maybeSingle();
    if (!generation) throw new AppError("INVALID_PARAMETERS", "That generation doesn't exist");
    const { data: outputs } = await db
      .from("assets")
      .select("id,asset_type,title,width,height,duration_seconds")
      .eq("generation_id", args.generationId)
      .is("deleted_at", null);
    return { ...generation, outputs: outputs ?? [] };
  },
});

const getLongVideo = tool({
  name: "get_long_video",
  title: "Get a long video",
  description:
    "A long video (a presenter video or a chain of clips) with every clip: its status, the piece of voiceover it is made from, its lip score (SyncNet; real speech scores about 6 to 8), its character check, its file, and the takes kept to swap in.",
  scope: "read",
  input: z.object({ longVideoId: id() }),
  run: async (args) => {
    const { data: run } = await db
      .from("long_videos")
      .select(
        "id,title,status,error_code,error_message,clip_count,start_from,qc_settings,cutaway_fills,voiceover,project_id,campaign_id,sequence_id,estimated_cost_usd,created_by,created_at,completed_at",
      )
      .eq("id", args.longVideoId)
      .maybeSingle();
    if (!run) throw new AppError("INVALID_PARAMETERS", "That long video doesn't exist");
    const { data: clips } = await db
      .from("long_video_clips")
      .select(
        "id,position,status,attempt,held,error_code,error_message,audio_start_seconds,audio_end_seconds,duration_seconds,output_asset_id,output_duration_seconds,generation_id,start_frame_asset_id,sync_status,sync_offset_seconds,lip_status,lip_score,lip_score_at_zero,lip_offset_frames,lip_result,check_status,check_result",
      )
      .eq("long_video_id", args.longVideoId)
      .order("position");
    const { data: takes } = await db
      .from("long_video_clip_takes")
      .select("id,clip_id,attempt,lip_score,output_asset_id,reason,created_at")
      .eq("long_video_id", args.longVideoId)
      .order("attempt");
    const voiceover = (run.voiceover ?? {}) as Json;
    return {
      ...run,
      voiceover: run.voiceover
        ? { title: voiceover["title"] ?? null, cutaways: voiceover["cutaways"] ?? [] }
        : null,
      clips: (clips ?? []).map((clip) => {
        const lip = (clip.lip_result ?? {}) as Json;
        const check = (clip.check_result ?? {}) as Json;
        const { lip_result: _lip, check_result: _check, ...rest } = clip;
        return {
          ...rest,
          framing: lip["framing"] ?? null,
          silence: lip["silence"] ?? null,
          checkSummary: typeof check["summary"] === "string" ? check["summary"] : null,
          takes: (takes ?? []).filter((take) => take.clip_id === clip.id),
        };
      }),
    };
  },
});

const getEdit = tool({
  name: "get_edit",
  title: "Get an edit",
  description:
    "An Editor edit: its title, version (send it back to update_edit and render_edit), its latest render, and, if asked, its whole timeline.",
  scope: "read",
  input: z.object({ sequenceId: id(), includeTimeline: z.boolean().default(false) }),
  run: async (args) => {
    const { data: sequence } = await db
      .from("sequences")
      .select("id,title,version,status,project_id,campaign_id,last_render_id,timeline,updated_at")
      .eq("id", args.sequenceId)
      .maybeSingle();
    if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
    const { timeline, ...rest } = sequence;
    const parsed = parseTimeline(timeline);
    return {
      ...rest,
      clips: parsed?.clips.length ?? 0,
      ...(args.includeTimeline ? { timeline: parsed ?? timeline } : {}),
    };
  },
});

const getRender = tool({
  name: "get_render",
  title: "Get a render",
  description:
    "A render's progress (0 to 1), its status, and once complete, the finished video's library id and a download link valid for an hour.",
  scope: "read",
  input: z.object({ renderId: id() }),
  run: async (args) => {
    const { data: render } = await db
      .from("sequence_renders")
      .select(
        "id,sequence_id,sequence_version,status,progress,stage,error_code,error_message,asset_id,duration_seconds,created_at,completed_at",
      )
      .eq("id", args.renderId)
      .maybeSingle();
    if (!render) throw new AppError("INVALID_PARAMETERS", "That render doesn't exist");
    const { data: asset } = render.asset_id
      ? await db
          .from("assets")
          .select("storage_bucket,storage_path")
          .eq("id", render.asset_id)
          .maybeSingle()
      : { data: null };
    return {
      ...render,
      url: asset ? await signedLink(asset.storage_bucket, asset.storage_path) : null,
    };
  },
});

const listBrandKits = tool({
  name: "list_brand_kits",
  title: "List brand kits",
  description:
    "The team's brand kits: each brand's fonts, colours, logo, end card, tagline, call to action and the names captions spell right.",
  scope: "read",
  input: z.object({}),
  run: async () => {
    const { data, error } = await db.from("brand_kits").select("*").eq("is_archived", false);
    if (error) return [];
    return (data ?? []).map((row) => {
      const { fonts, ...kit } = brandKitOf(row as unknown as Json);
      return { ...kit, fonts: fonts.map((font) => font.family) };
    });
  },
});

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

const queueGeneration = tool({
  name: "queue_generation",
  title: "Queue a generation",
  description:
    "Makes an image or video with a model (see list_models), from library files in the model's input roles. It passes the same spending checks as the app (project, campaign and your monthly cap) and is billed by the provider. Poll get_generation for its files.",
  scope: "generate",
  readOnly: false,
  input: z.object({
    modelId: id(),
    parameters: z
      .record(z.string(), z.unknown())
      .describe("The model's parameters by key, e.g. {prompt, resolution, duration}"),
    inputs: z
      .array(
        z.object({
          assetId: id(),
          role: z.string().max(40).describe("One of the model's input roles"),
        }),
      )
      .max(20)
      .default([]),
    projectId: id().nullable().optional(),
    campaignId: id().nullable().optional(),
    estimatedCostUsd: z.number().min(0).max(10_000).nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const model = await activeModel(args.modelId);
    const { assertGenerationAllowed, createAndSubmitGeneration } =
      await import("../generation-create.server");
    await assertGenerationAllowed(caller.userId);
    return createAndSubmitGeneration({
      userId: caller.userId,
      model,
      parameters: args.parameters,
      inputs: args.inputs.map((input, position) => ({ ...input, position })),
      projectId: args.projectId ?? null,
      campaignId: args.campaignId ?? null,
      estimatedCostUsd: args.estimatedCostUsd ?? null,
      clientRequestId: args.clientRequestId,
    });
  },
});

const startPresenterVideo = tool({
  name: "start_presenter_video",
  title: "Start a presenter video",
  description: [
    "Makes a presenter speaking a prepared voiceover to camera, with lip sync: the voiceover is cut into pieces where nobody speaks, one clip is made per piece, every clip starts from the same approved still (so the likeness holds), and lines you mark are covered by B-roll (no clip is made for them).",
    "The voiceover must be prepared for lip sync in the app first (Create, with the consent confirmed). Use a lipSync model from list_models (Wan 2.7 image-to-video worked best: 720p, locked camera).",
    "Each clip's lips are scored (SyncNet) and a clip scoring under 4 is made again, up to `takes` takes; every take is kept. Billed per clip by the provider. Follow it with get_long_video, then open_in_editor.",
  ].join(" "),
  scope: "generate",
  readOnly: false,
  input: z.object({
    title: z.string().max(LONG_VIDEO_LIMITS.titleChars).default(""),
    modelId: id().describe("A lipSync model (see list_models)"),
    startImageAssetId: id().describe(
      "The approved still every clip starts from (chest-up works best)",
    ),
    voiceoverPreparationId: id().describe("The voiceover's preparation (prepared in Create)"),
    presenter: z
      .object({
        who: z.string().max(200).optional().describe('e.g. "The woman"'),
        where: z.string().max(200).optional().describe('e.g. "her office at dusk"'),
      })
      .optional()
      .describe("Used for the prompt when no prompt is given"),
    prompt: z
      .string()
      .max(4000)
      .optional()
      .describe(
        "Your own prompt; any camera move in it is taken out and a locked camera asked for",
      ),
    values: z
      .record(z.string(), z.unknown())
      .default({})
      .describe('The model\'s settings, e.g. {"resolution": "720p"}'),
    brollLines: z
      .array(z.number().int().min(0))
      .max(60)
      .optional()
      .describe("Lines of the voiceover (0-based, split at its pauses) to cover with B-roll"),
    cutaways: z
      .array(z.object({ start: z.number().min(0), end: z.number().positive() }))
      .max(SECTION_LIMITS.maxCutaways)
      .optional()
      .describe("Or: stretches of the voiceover (seconds) to cover with B-roll"),
    lipCheck: z.boolean().default(true),
    takes: z.number().int().min(1).max(LIP_CHECK.maxTakes).default(2),
    characterIds: z.array(id()).max(4).default([]),
    projectId: id().nullable().optional(),
    campaignId: id().nullable().optional(),
    estimatedCostUsd: z.number().min(0).max(100_000).nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const model = await activeModel(args.modelId);
    if (!lipSyncCapable(model))
      throw new AppError(
        "INVALID_PARAMETERS",
        `${model.display_name} doesn't move lips to a voiceover; choose a lipSync model`,
      );
    const startSlot = (model.capabilities?.inputs ?? []).find(
      (slot) => slot.type === "image" && slot.role !== "last_frame",
    );
    if (!startSlot)
      throw new AppError("INVALID_PARAMETERS", `${model.display_name} takes no start image`);
    const { usableVoiceover } = await import("../lip-sync/prepare.server");
    const { row, view } = await usableVoiceover(args.voiceoverPreparationId);
    const analysis = view.analysis!;
    const words = readWords(row.words);
    const cutaways = args.brollLines?.length
      ? cutawaysForLines(voiceoverLines(timingOf(analysis), words), new Set(args.brollLines))
      : (args.cutaways ?? []);
    const plan = planVoiceoverClips({
      analysis,
      words,
      first: model,
      continuation: model,
      cutaways: cutaways.length ? cutaways : null,
    });
    if (plan.problem || !plan.segments.length)
      throw new AppError("INVALID_PARAMETERS", plan.problem ?? "The voiceover couldn't be cut");
    const story = args.prompt
      ? presenterStory(args.prompt)
      : presenterPrompt({ who: args.presenter?.who ?? null, where: args.presenter?.where ?? null });
    const values = lipSyncValues(presenterValues(model, { ...args.values, prompt: story }), [
      model,
    ]);
    const service = await import("../long-video/service.server");
    const started = await service.startLongVideo({
      userId: caller.userId,
      title: args.title,
      firstModelId: model.id,
      continuationModelId: model.id,
      story,
      continuity: "",
      values,
      references: [{ assetId: args.startImageAssetId, role: startSlot.role }],
      clips: plan.segments.map((segment, index) => ({
        beat: "",
        durationSeconds: segment.requestSeconds,
        prompt: clipPrompt({ story, index, count: plan.segments.length, standalone: true }),
      })),
      finale: null,
      projectId: args.projectId ?? null,
      campaignId: args.campaignId ?? null,
      clientRequestId: args.clientRequestId,
      characterIds: args.characterIds,
      identityCheck: args.characterIds.length > 0,
      keyframes: null,
      voiceover: {
        preparationId: args.voiceoverPreparationId,
        pieces: plan.segments.map(({ start, end, requestSeconds }) => ({
          start,
          end,
          requestSeconds,
        })),
        keepClipSound: false,
        cutaways: plan.cutaways,
      },
      startFrom: "anchor",
      qc: { lipCheck: args.lipCheck, takes: args.lipCheck ? args.takes : 1 },
      estimatedCostUsd: args.estimatedCostUsd ?? null,
    });
    return {
      ...(started as Json),
      pieces: plan.segments.map(({ start, end, requestSeconds }) => ({
        start,
        end,
        requestSeconds,
      })),
      cutaways: plan.cutaways,
    };
  },
});

const steerLongVideo = tool({
  name: "steer_long_video",
  title: "Steer a long video",
  description:
    "continue: picks a stopped or paused run up where it stopped (a paused run's credits topped up, a flagged clip dealt with). stop: stops it after the clip in progress. check: moves it on if anything is waiting.",
  scope: "generate",
  readOnly: false,
  input: z.object({ longVideoId: id(), action: z.enum(["continue", "stop", "check"]) }),
  run: async (args, caller) => {
    const service = await import("../long-video/service.server");
    if (args.action === "check") {
      await roleOf(caller.userId);
      await service.advanceLongVideo(args.longVideoId);
    } else {
      await assertCanManageRun(caller.userId, args.longVideoId);
      if (args.action === "continue") await service.continueLongVideo(args.longVideoId);
      else await service.stopLongVideo(args.longVideoId);
    }
    return { ok: true };
  },
});

const steerClip = tool({
  name: "steer_clip",
  title: "Steer a clip",
  description: [
    "redo: makes a finished clip again (billed; its take is kept to swap back), optionally from startFrame.",
    "retry: tries a failed clip again (confirmUncertain: true only once you've checked a submission whose outcome was uncertain wasn't billed).",
    "hold / release: holds a clip that hasn't started (the run waits at it), or lets it go.",
    "keep: keeps a clip whose character check failed, and carries on.",
    'start_frame: sets the frame a waiting (or failed) clip starts from: a library image id, "anchor" for the run\'s still, or null for its usual start.',
  ].join(" "),
  scope: "generate",
  readOnly: false,
  input: z.object({
    clipId: id(),
    action: z.enum(["redo", "retry", "hold", "release", "keep", "start_frame"]),
    startFrame: z.union([id(), z.literal("anchor"), z.null()]).optional(),
    confirmUncertain: z.boolean().default(false),
  }),
  run: async (args, caller) => {
    await assertCanManageRun(caller.userId, await runOfClip(args.clipId));
    const service = await import("../long-video/service.server");
    switch (args.action) {
      case "redo":
        await service.redoLongVideoClip({
          clipId: args.clipId,
          ...(args.startFrame !== undefined ? { startFrame: args.startFrame } : {}),
        });
        break;
      case "retry":
        await service.retryLongVideoClip({
          clipId: args.clipId,
          confirmUncertain: args.confirmUncertain,
        });
        break;
      case "hold":
      case "release":
        await service.holdLongVideoClip({ clipId: args.clipId, held: args.action === "hold" });
        break;
      case "keep":
        await service.keepLongVideoClip({ clipId: args.clipId });
        break;
      case "start_frame":
        await service.setClipStartFrame({
          clipId: args.clipId,
          startFrame: args.startFrame ?? null,
        });
        break;
    }
    return { ok: true };
  },
});

const chooseTake = tool({
  name: "choose_take",
  title: "Choose a take",
  description:
    "Puts one of a clip's kept takes back in use (see the takes in get_long_video); the take it replaces is kept in turn.",
  scope: "generate",
  readOnly: false,
  input: z.object({ takeId: id() }),
  run: async (args, caller) => {
    const { data: take } = await db
      .from("long_video_clip_takes")
      .select("long_video_id")
      .eq("id", args.takeId)
      .maybeSingle();
    if (!take) throw new AppError("INVALID_PARAMETERS", "That take no longer exists");
    await assertCanManageRun(caller.userId, take.long_video_id);
    const service = await import("../long-video/service.server");
    await service.chooseLongVideoTake({ takeId: args.takeId });
    return { ok: true };
  },
});

const setCutawayFill = tool({
  name: "set_cutaway_fill",
  title: "Fill a cutaway",
  description:
    "Chooses the B-roll (a library video or image) for one of a presenter video's cutaways, by its index; null clears it. Open the edit again to lay it in.",
  scope: "generate",
  readOnly: false,
  input: z.object({
    longVideoId: id(),
    index: z.number().int().min(0).max(SECTION_LIMITS.maxCutaways),
    assetId: id().nullable(),
    inPoint: z.number().min(0).max(86_400).default(0).describe("Seconds into the B-roll it starts"),
  }),
  run: async (args, caller) => {
    await assertCanManageRun(caller.userId, args.longVideoId);
    const service = await import("../long-video/service.server");
    await service.setCutawayFill({
      longVideoId: args.longVideoId,
      index: args.index,
      fill: args.assetId ? { assetId: args.assetId, inPoint: args.inPoint } : null,
    });
    return { ok: true };
  },
});

const checkText = tool({
  name: "check_text",
  title: "Check for garbled text",
  description:
    'Reads every piece of lettering in a generated picture (or in frames through a video) and says whether it is readable or garbled (AI models often letter screens and signs with gibberish). A video answers "sampling" while its frames are taken: ask again a few seconds later.',
  scope: "generate",
  readOnly: false,
  input: z.object({ assetId: id(), again: z.boolean().default(false) }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { checkAssetText } = await import("../media/text-check.server");
    return checkAssetText({ assetId: args.assetId, userId: caller.userId, again: args.again });
  },
});

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

const openInEditor = tool({
  name: "open_in_editor",
  title: "Open a long video as an edit",
  description:
    "Lays a long video's clips out as an Editor edit: a presenter video on its voiceover's clock to the frame (lip leads taken out), its B-roll in the cutaways (placeholders where none is chosen), captions from the voiceover's words in your script's wording, titles, music, and the brand kit's look. Returns the edit's id.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    longVideoId: id(),
    captions: z.boolean().default(true),
    script: z.string().max(20_000).nullable().optional().describe("The words, as written"),
    terms: z.array(z.string().min(1).max(60)).max(30).default([]).describe("Names to spell right"),
    musicAssetId: id().nullable().optional(),
    titles: z
      .array(
        z.object({
          text: z.string().min(1).max(160),
          at: z.number().min(0).describe("Seconds on the voiceover's clock"),
          seconds: z.number().min(0.5).max(30),
          style: z.enum(["title", "subtitle", "cta"]).optional(),
          position: z.enum(["top", "center", "bottom"]).optional(),
        }),
      )
      .max(20)
      .default([]),
    keepSound: z.boolean().default(false),
    fresh: z.boolean().default(true).describe("A new edit, rather than the run's last one"),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const service = await import("../long-video/service.server");
    return service.openLongVideoInEditor({
      longVideoId: args.longVideoId,
      userId: caller.userId,
      seam: "smart",
      keepSound: args.keepSound,
      fresh: args.fresh,
      captions: args.captions,
      script: args.script ?? null,
      terms: args.terms,
      musicAssetId: args.musicAssetId ?? null,
      titles: args.titles,
    });
  },
});

/** The library files a timeline uses that aren't in the library (any at all stops it). */
async function missingFiles(timeline: ReturnType<typeof timelineSchema.parse>): Promise<string[]> {
  const ids = [
    ...new Set([
      ...timeline.clips.map((clip) => clip.assetId),
      ...timeline.audio.map((item) => item.assetId),
      ...timeline.images.map((image) => image.assetId),
    ]),
  ];
  if (!ids.length) return [];
  const { data } = await db.from("assets").select("id").in("id", ids).is("deleted_at", null);
  const found = new Set((data ?? []).map((row) => row.id));
  return ids.filter((assetId) => !found.has(assetId));
}

function validTimeline(value: unknown) {
  const parsed = timelineSchema.safeParse(value ?? {});
  if (!parsed.success)
    throw new AppError(
      "INVALID_PARAMETERS",
      `The timeline isn't valid: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "timeline"}: ${issue.message}`)
        .join("; ")}`,
    );
  return parsed.data;
}

const timelineInput = z
  .record(z.string(), z.unknown())
  .describe(
    "An Editor timeline: {aspectRatio, resolution, fps, clips:[{id, assetId, kind, trimStart, duration, ...}], audio:[...], captions:{...}, overlays:[...], images:[...]} (see get_edit with includeTimeline for the full shape)",
  );

const createEdit = tool({
  name: "create_edit",
  title: "Create an edit",
  description:
    "Makes an Editor edit from a timeline you lay out (clips on the picture track, voiceover and music, captions, titles, logos). Every file must be in the library. Returns the edit's id and version.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().min(1).max(200),
    timeline: timelineInput,
    projectId: id().nullable().optional(),
    campaignId: id().nullable().optional(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const timeline = validTimeline(args.timeline);
    const missing = await missingFiles(timeline);
    if (missing.length)
      throw new AppError("INVALID_PARAMETERS", `Not in the library: ${missing.join(", ")}`);
    const { data, error } = await db
      .from("sequences")
      .insert({
        title: args.title,
        timeline: timeline as never,
        project_id: args.projectId ?? null,
        campaign_id: args.campaignId ?? null,
        source: { kind: "api" } as never,
        created_by: caller.userId,
        version: 1,
      })
      .select("id,version")
      .maybeSingle();
    if (error || !data) throw new AppError("UNKNOWN", "The edit couldn't be saved");
    return { sequenceId: data.id, version: data.version };
  },
});

/** Saves an edit's new timeline (or title) over the version given, as the Editor saves. */
async function saveEdit(
  sequenceId: string,
  expectedVersion: number,
  patch: { timeline?: unknown; title?: string },
): Promise<{ sequenceId: string; version: number }> {
  const { data, error } = await db
    .from("sequences")
    .update({
      ...(patch.timeline !== undefined ? { timeline: patch.timeline as never } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      version: expectedVersion + 1,
    })
    .eq("id", sequenceId)
    .eq("version", expectedVersion)
    .select("version");
  if (error) throw new AppError("UNKNOWN", "The edit couldn't be saved");
  if (!data?.length)
    throw new AppError(
      "INVALID_PARAMETERS",
      "The edit changed since that version (or no longer exists): read it again with get_edit",
    );
  return { sequenceId, version: data[0]!.version };
}

const updateEdit = tool({
  name: "update_edit",
  title: "Update an edit",
  description:
    "Replaces an edit's timeline and/or title, only if it is still at expectedVersion (from get_edit); returns its new version.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    sequenceId: id(),
    expectedVersion: z.number().int().min(1),
    title: z.string().min(1).max(200).optional(),
    timeline: timelineInput.optional(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const timeline = args.timeline ? validTimeline(args.timeline) : undefined;
    if (timeline) {
      const missing = await missingFiles(timeline);
      if (missing.length)
        throw new AppError("INVALID_PARAMETERS", `Not in the library: ${missing.join(", ")}`);
    }
    return saveEdit(args.sequenceId, args.expectedVersion, {
      ...(timeline ? { timeline } : {}),
      ...(args.title ? { title: args.title } : {}),
    });
  },
});

const applyBrand = tool({
  name: "apply_brand_kit",
  title: "Apply a brand kit",
  description:
    "Sets an edit's titles, calls to action and captions in a brand kit's fonts and colours (see list_brand_kits) and, if asked, adds its end card after the last clip (its background, logo, tagline, call to action and website, inside the area the platform leaves clear).",
  scope: "edit",
  readOnly: false,
  input: z.object({
    sequenceId: id(),
    expectedVersion: z.number().int().min(1),
    brandKitId: id(),
    endCard: z
      .object({
        seconds: z.number().min(1).max(10).default(3),
        area: z.enum(SAFE_AREAS).default("none").describe("The platform to keep clear of"),
      })
      .nullable()
      .optional(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { data: kitRow } = await db
      .from("brand_kits")
      .select("*")
      .eq("id", args.brandKitId)
      .eq("is_archived", false)
      .maybeSingle();
    if (!kitRow) throw new AppError("INVALID_PARAMETERS", "That brand kit doesn't exist");
    const kit = brandKitOf(kitRow as unknown as Json);
    const { data: sequence } = await db
      .from("sequences")
      .select("timeline,version")
      .eq("id", args.sequenceId)
      .maybeSingle();
    if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
    if (sequence.version !== args.expectedVersion)
      throw new AppError(
        "INVALID_PARAMETERS",
        "The edit changed since that version: read it again",
      );
    const timeline = parseTimeline(sequence.timeline);
    if (!timeline) throw new AppError("INVALID_PARAMETERS", "The edit's timeline can't be read");
    let next = applyBrandKit(timeline, kit);
    if (args.endCard) {
      if (!kit.endCardAssetId)
        throw new AppError(
          "INVALID_PARAMETERS",
          "The kit has no end card background: add one in Settings → Brand kits, or add the end card in the Editor (which makes one in the brand's colour)",
        );
      const { data: background } = await db
        .from("assets")
        .select("id,asset_type,duration_seconds")
        .eq("id", kit.endCardAssetId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!background)
        throw new AppError(
          "INVALID_PARAMETERS",
          "The kit's end card background isn't in the library",
        );
      next = addEndCard(next, kit, {
        seconds: args.endCard.seconds,
        area: args.endCard.area,
        background: {
          assetId: background.id,
          kind: background.asset_type === "video" ? "video" : "image",
          durationSeconds:
            background.duration_seconds === null ? null : Number(background.duration_seconds),
        },
        logoAssetId: kit.logoAssetId,
      });
      next = { ...next, safeArea: args.endCard.area };
    }
    return saveEdit(args.sequenceId, args.expectedVersion, { timeline: next });
  },
});

const renderEdit = tool({
  name: "render_edit",
  title: "Render an edit",
  description:
    "Renders an edit to a finished video with the media service, at the version given (from get_edit). Returns the render's id: follow it with get_render.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    sequenceId: id(),
    expectedVersion: z.number().int().min(1),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { startSequenceRender } = await import("../edit/render.server");
    return startSequenceRender({
      sequenceId: args.sequenceId,
      expectedVersion: args.expectedVersion,
      clientRequestId: args.clientRequestId,
      userId: caller.userId,
    });
  },
});

/** Every operation the API offers, in the order they are listed. */
export const STUDIO_TOOLS: StudioTool[] = [
  whoami,
  listModels,
  listAssets,
  getAsset,
  getGeneration,
  getLongVideo,
  getEdit,
  getRender,
  listBrandKits,
  queueGeneration,
  startPresenterVideo,
  steerLongVideo,
  steerClip,
  chooseTake,
  setCutawayFill,
  checkText,
  openInEditor,
  createEdit,
  updateEdit,
  applyBrand,
  renderEdit,
];

export function studioTool(name: string): StudioTool | null {
  return STUDIO_TOOLS.find((entry) => entry.name === name) ?? null;
}

/** A tool's input as JSON Schema (what an MCP client is told). */
export function toolInputSchema(entry: StudioTool): Json {
  const schema = z.toJSONSchema(entry.input, { io: "input", unrepresentable: "any" }) as Json;
  delete schema["$schema"];
  return schema;
}

/** Runs a tool for a caller, if their token allows it. */
export async function runStudioTool(
  name: string,
  args: unknown,
  caller: ApiCaller,
): Promise<unknown> {
  const entry = studioTool(name);
  if (!entry) throw new AppError("INVALID_PARAMETERS", `There is no tool called ${name}`);
  if (!caller.scopes.has(entry.scope))
    throw new AppError(
      "NOT_AUTHORIZED",
      `This token can't ${entry.scope === "read" ? "read" : entry.scope}: make one with the "${entry.scope}" scope`,
    );
  return entry.run(args, caller);
}
