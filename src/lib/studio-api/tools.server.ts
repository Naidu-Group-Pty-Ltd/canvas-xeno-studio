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
import { CHANNELS, EMPTY_DNA, GOALS } from "../brand/dna";
import { GITHUB_TOKEN_PATTERN } from "../brand/import-request";
import { layoutTimeline, parseTimeline, timelineSchema } from "../edit/timeline";
import { qualityLines, qualitySummary, storedQualityOf } from "../edit/quality";
import { renderStems } from "../edit/mix-report";
import { fitMusicToLength } from "../music/fit";
import { readStructure } from "../music/structure";
import { textCheckOf } from "../media/text-check";
import { ALIGN_ANCHORS, ALIGN_DEFAULTS, ALIGN_LIMITS } from "../media/align-take";
import { PRIVACY_NEEDS_UPDATE } from "../media/layout-only";
import { SCREENSHOT_TYPES } from "../media/redaction";
import { CHARACTER_VIEWS } from "../characters/model";
import {
  MUSIC_LENGTH,
  MUSIC_MODELS,
  RIGHTS_SCOPES,
  type MusicModel,
  type RightsScope,
} from "../music/catalog";
import { musicPlanSchema } from "../music/plan";
import { DEFAULT_RETAKE_ALLOWANCE, STAGE_LIMITS } from "../stage-check";
import type { ModelRegistryEntry } from "../model-schema";
import type { ApiScope } from "./tokens";
import type { ApiCaller } from "./tokens.server";
import { PLANNING_TOOLS } from "./planning.server";
import { COMPOSITION_TOOLS } from "./compositions.server";
import { actorFor, WORK_TOOL_NAMES, WORK_TOOLS } from "./work.server";
import {
  VIDEO_IMPORT_LIMITS,
  VIDEO_IMPORT_TYPES,
  type VideoImportType,
} from "./video-import.server";

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
export function modelSummary(model: ModelRegistryEntry) {
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
      // A setting that only applies alongside another (a preset only in preset mode) says
      // so, so its "required" isn't read as always.
      ...(field.showIf ? { onlyWhen: field.showIf } : {}),
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
    if (args.search) query = query.ilike("title", `%${args.search.replace(/[%_*\\]/g, "")}%`);
    const { data, error } = await query;
    if (error) throw new AppError("UNKNOWN", "The library couldn't be read");
    return data ?? [];
  },
});

const getAsset = tool({
  name: "get_asset",
  title: "Get a library file",
  description:
    "One library file: what it is, a download link valid for an hour, any text check kept with it, and its privacy mark (layout only: never placed in a frame; or a redacted copy of a screenshot).",
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
    const { privacyMarks } = await import("../media/layout-only.server");
    return {
      ...rest,
      fps: typeof measured["fps"] === "number" ? measured["fps"] : null,
      textCheck: textCheckOf(metadata),
      // Layout only (never placed in a frame), or a redacted copy; null for neither.
      privacy: (await privacyMarks([asset.id])).get(asset.id) ?? null,
      url: await signedLink(bucket, path),
    };
  },
});

const getGeneration = tool({
  name: "get_generation",
  title: "Get a generation",
  description:
    "A generation's progress (local_queued, submitting, processing, completed, failed, ...), its cost (actual_cost_usd, the charge Higgsfield reported, else estimated_cost_usd, with cost_source saying where the figure came from) and, once done, the library files it made.",
  scope: "read",
  input: z.object({ generationId: id() }),
  run: async (args) => {
    const { data: generation } = await db
      .from("generations")
      .select(
        "id,status,model_path,operation,prompt,parameters,estimated_cost_usd,actual_cost_usd,cost_source,error_code,error_message,project_id,campaign_id,client_request_id,auto_retries,retry_after,created_at,completed_at",
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
    "A render's progress (0 to 1), its status, whether it was made for public use (public_use; null before the rights ledger exists) with what was confirmed for it (rights_check) and the credit lines it owes (credit_lines), and once complete, the finished video's library id and a download link valid for an hour, how its sound sits (mix_report: the voice's margin over the music in the speech band, section by section, and the mix's loudness), its stems if asked for, and how it measured against its own lossless reference (quality: SSIM of the picture's luma as the encoder was given it, PSNR, edge contrast kept, CIEDE2000 on flat fields and the brand's colours, banding, captions and cuts on their frames, the voiceover's sync and loudness, each a pass or a flag; qualityNotes says each in words), and its review sheet once one is asked for (reviewSheet: making, ready with its library id and a link, or failed).",
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
          .select("storage_bucket,storage_path,metadata")
          .eq("id", render.asset_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null };
    // Kept on the render since migration 0031_render_quality (before it, with the video's record).
    const { data: extras } = await db
      .from("sequence_renders")
      .select("quality,review_sheet_task_id")
      .eq("id", args.renderId)
      .maybeSingle();
    const quality = storedQualityOf(extras?.quality ?? null, asset?.metadata ?? null);
    const { reviewSheetOf } = await import("../edit/review-sheet.server");
    const reviewSheet = await reviewSheetOf(extras?.review_sheet_task_id);
    return {
      ...render,
      ...(await renderRightsOf(args.renderId, asset?.metadata ?? null)),
      url: asset ? await signedLink(asset.storage_bucket, asset.storage_path) : null,
      ...(await renderSound(args.renderId, asset?.metadata ?? null)),
      quality: quality?.raw ?? null,
      qualityNotes: quality
        ? [
            qualitySummary(quality.report),
            ...qualityLines(quality.report).map((entry) => entry.text),
          ]
        : [],
      reviewSheet,
    };
  },
});

/**
 * Whether a render was made for public use and what was confirmed for it, as
 * kept on it since migration 0027_asset_rights (before it, unknown, and the
 * check as its video's own record carries it), with the credit lines owed.
 */
async function renderRightsOf(renderId: string, videoMetadata: unknown) {
  const { data: kept, error } = await db
    .from("sequence_renders")
    .select("public_use,rights_check")
    .eq("id", renderId)
    .maybeSingle();
  const video = (videoMetadata ?? {}) as { rights_check?: unknown; credit_lines?: unknown };
  const lines = Array.isArray(video.credit_lines) ? video.credit_lines : [];
  return {
    public_use: !error && typeof kept?.public_use === "boolean" ? kept.public_use : null,
    rights_check: (!error && kept?.rights_check) || video.rights_check || null,
    credit_lines: lines.filter((line): line is string => typeof line === "string"),
  };
}

/**
 * How a render's sound sits, as kept on it (or, before migration
 * 0032_mix_reports, with its video's own record), and its stems with links.
 */
async function renderSound(renderId: string, videoMetadata: unknown) {
  const { data: kept, error } = await db
    .from("sequence_renders")
    .select("mix_report")
    .eq("id", renderId)
    .maybeSingle();
  const probe = (videoMetadata as { probe?: { mix_report?: unknown } } | null)?.probe;
  const report = (!error && kept?.mix_report) || probe?.mix_report || null;
  const stems = renderStems(videoMetadata);
  const { data: files } = stems.length
    ? await db
        .from("assets")
        .select("id,storage_bucket,storage_path")
        .in(
          "id",
          stems.map((stem) => stem.assetId),
        )
        .is("deleted_at", null)
    : { data: [] };
  return {
    mix_report: report,
    stems: await Promise.all(
      stems.map(async (stem) => {
        const stored = (files ?? []).find((entry) => entry.id === stem.assetId);
        return {
          role: stem.role,
          assetId: stem.assetId,
          url: stored ? await signedLink(stored.storage_bucket, stored.storage_path) : null,
        };
      }),
    ),
  };
}

const listBrandKits = tool({
  name: "list_brand_kits",
  title: "List brand kits",
  description:
    "The team's brand kits: each brand's fonts, colours, logo, end card, tagline, call to action, the names captions spell right, its design system (palette with roles, the look of its imagery, voice and rules), what kind of brand it is, and the formulas written for it by name (get_brand_kit has its whole DNA). Pass a kit's id as brandKitId to queue_generation to make a picture or clip in its look.",
  scope: "read",
  input: z.object({}),
  run: async () => {
    const { data, error } = await db.from("brand_kits").select("*").eq("is_archived", false);
    if (error) return [];
    const { brandStyleLine } = await import("../brand/design");
    return (data ?? []).map((row) => {
      // A kit's whole DNA and its formulas run to thousands of characters each: a list of kits
      // says what kind of brand each is and names its formulas; get_brand_kit has the rest
      // (its production roles too).
      const { fonts, design, dna, ownFormulas, production, demoRecord, ...kit } = brandKitOf(
        row as unknown as Json,
      );
      return {
        ...kit,
        fonts: fonts.map((font) => font.family),
        mood: design.visual.mood,
        styleLine: brandStyleLine({ ...kit, design }),
        dna: {
          type: dna.type,
          alsoTypes: dna.alsoTypes,
          market: dna.market,
          archetype: dna.archetype,
          category: dna.category,
        },
        ownFormulas: ownFormulas.map((formula) => ({
          id: formula.id,
          name: formula.name,
          audience: formula.own?.audience ?? null,
        })),
      };
    });
  },
});

const getBrandKit = tool({
  name: "get_brand_kit",
  title: "Get a brand kit",
  description:
    "One brand kit's whole design system: palette (each colour's role and use), typefaces, the look of its imagery (mood, photography, lighting, grading, composition, motion), its voice (tone, sample lines, words it uses and avoids), its rules, the line generations carry and what they must not show, and its style reference images. Its `production` holds the roles its graphics are drawn in (ground, surfaces, glass, ink, accent, signature, lines; display, body and mono type; corners, shadows, blur) and its motion (move, settle, enter, exit and press curves and durations), each with the repository, file and line it is declared on; `productionChecks` says whether they pass, and with `includeCss` `productionCss` is them as one stylesheet of --brand-* custom properties.",
  scope: "read",
  input: z.object({
    brandKitId: id(),
    includeCss: z.boolean().default(false),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { requireBrandKit } = await import("../brand/use.server");
    const { brandAvoidLine, brandStyleLine, brandVoiceLine } = await import("../brand/design");
    const kit = await requireBrandKit(args.brandKitId);
    const { fonts, ...rest } = kit;
    const { formulasForBrand } = await import("../brand/formulas");
    return {
      ...rest,
      fonts: fonts.map((font) => font.family),
      styleLine: brandStyleLine(kit),
      videoStyleLine: brandStyleLine(kit, "video"),
      avoidLine: brandAvoidLine(kit),
      voiceLine: brandVoiceLine(kit),
      formulas: formulasForBrand(kit.dna, 3, kit.ownFormulas).map((formula) => ({
        id: formula.id,
        name: formula.name,
        writtenForBrand: !!formula.own,
      })),
      ownFormulas: kit.ownFormulas.map((formula) => ({
        id: formula.id,
        name: formula.name,
        summary: formula.summary,
        audience: formula.own?.audience ?? null,
      })),
      ...(await productionOutput(kit, args.includeCss)),
    };
  },
});

/** A kit's production checks, and its stylesheet when asked for (see ../brand/production). */
async function productionOutput(kit: ReturnType<typeof brandKitOf>, includeCss: boolean) {
  const { productionChecks, productionStylesheet } = await import("../brand/production");
  return {
    productionChecks: productionChecks(kit.production, { fonts: kit.fonts }).list,
    ...(includeCss ? { productionCss: productionStylesheet(kit) } : {}),
  };
}

const readBrandCode = tool({
  name: "read_brand_code",
  title: "Read a brand's design system from its code",
  description:
    "Reads the styling code of up to six GitHub repositories together (the first is the brand's own; a branch or folder can be named in the address), as text and never run, and answers with its design system: each colour, heaviest first, with the tokens that name it and the repository, file and line each is declared on; the typefaces and how each is loaded; the corner radius, shadow, motion, blur and gradient scales; and where the repositories disagree. With `includeCss` it also answers `tokensCss`: every custom property as one stylesheet, each with where it is declared. Nothing is kept (to keep it as a brand kit, import it from code on the Brand page). Private repositories need the studio's GitHub token, or a `githubToken` used for this read only.",
  scope: "read",
  input: z.object({
    repos: z.array(z.string().min(3).max(500)).min(1).max(6),
    includeCss: z.boolean().default(false),
    githubToken: z.string().regex(GITHUB_TOKEN_PATTERN).optional(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { codeTokensCss, parseRepoRef } = await import("../brand/scan-code");
    const { scanRepos } = await import("../brand/scan-repos");
    const { githubSource } = await import("../brand/github-source");
    const refs = args.repos.map((repo) => {
      const ref = parseRepoRef(repo);
      if (!ref)
        throw new AppError(
          "INVALID_PARAMETERS",
          `“${repo}” isn't a GitHub repository (owner/name)`,
        );
      return ref;
    });
    const source = githubSource({
      token: args.githubToken ?? (process.env["GITHUB_TOKEN"]?.trim() || null),
    });
    let read: Awaited<ReturnType<typeof scanRepos>>;
    try {
      read = await scanRepos(refs, source);
    } catch (error) {
      throw new AppError(
        "INVALID_PARAMETERS",
        error instanceof Error ? error.message : "The repositories couldn't be read",
      );
    }
    const { system, failed } = read;
    const at = (token: { repo: string; path: string; line: number | null }) => ({
      repo: token.repo,
      path: token.path,
      line: token.line,
    });
    const scale = (list: typeof system.scales.radius) =>
      list.slice(0, 12).map((token) => ({
        name: token.name,
        value: token.resolved,
        scheme: token.scheme,
        ...at(token),
      }));
    return {
      repos: system.repos,
      failed,
      title: system.title,
      description: system.description,
      homepage: system.homepage,
      colours: system.colours.slice(0, 24).map((colour) => ({
        hex: colour.hex,
        name: colour.name,
        neutral: colour.neutral,
        writtenOut: colour.uses,
        repos: colour.repos,
        tokens: colour.tokens.slice(0, 4).map((token) => ({
          name: token.name,
          scheme: token.scheme,
          ...at(token),
        })),
      })),
      fonts: system.fonts.map((font) => ({
        family: font.family,
        roles: font.roles,
        loaded: font.loaded,
        weights: font.weights,
        repos: font.repos,
        where: font.sources.slice(0, 2),
      })),
      scales: {
        radius: scale(system.scales.radius),
        shadow: scale(system.scales.shadow),
        motion: scale(system.scales.motion),
        blur: scale(system.scales.blur),
        gradient: scale(system.scales.gradient),
      },
      conflicts: system.conflicts.slice(0, 12),
      keyframes: system.keyframes.map((frame) => frame.name).slice(0, 40),
      notes: system.notes,
      ...(args.includeCss
        ? {
            tokensCss: codeTokensCss(system, {
              generatedAt: new Date().toISOString().slice(0, 10),
            }),
          }
        : {}),
    };
  },
});

const listBrandFormulas = tool({
  name: "list_brand_formulas",
  title: "List content formulas",
  description:
    "The studio's content formulas: proven structures for videos and posts, each a run of timed beats with the rules and guardrails it keeps and the research it rests on, ranked for a brand's DNA (its kind of brand, market, goal, channels and who fronts it) and for what the piece is for. Pass brandKitId to rank for that brand: the formulas it pinned and those written for it (writtenForBrand, with the audience they are for) come first. goal, channel and seconds narrow it. evidence is A (a measured result for the format), B (official platform guidance or research behind it) or C (an established convention). get_brand_formula writes one out, timed.",
  scope: "read",
  input: z.object({
    brandKitId: id().nullable().optional().describe("A brand kit (see list_brand_kits)"),
    goal: z.enum(GOALS).nullable().optional(),
    channel: z.enum(CHANNELS).nullable().optional(),
    seconds: z.number().int().min(5).max(600).nullable().optional(),
    limit: z.number().int().min(1).max(40).default(8),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { formulasFor, rankFormulas } = await import("../brand/formulas");
    const { requireBrandKit } = await import("../brand/use.server");
    const kit = args.brandKitId ? await requireBrandKit(args.brandKitId) : null;
    return rankFormulas(
      kit?.dna ?? EMPTY_DNA,
      {
        goal: args.goal ?? null,
        channel: args.channel ?? null,
        seconds: args.seconds ?? null,
      },
      formulasFor(kit?.ownFormulas ?? []),
    )
      .slice(0, args.limit)
      .map(({ formula, fit, reasons, cautions }) => ({
        id: formula.id,
        name: formula.name,
        summary: formula.summary,
        origin: formula.origin,
        purpose: formula.purpose,
        goals: formula.goals,
        channels: formula.channels,
        seconds: formula.seconds,
        evidence: formula.grade,
        fit,
        reasons,
        cautions,
        brandsOwn: kit?.dna.formulas.includes(formula.id) ?? false,
        writtenForBrand: !!formula.own,
        ...(formula.own?.audience ? { audience: formula.own.audience } : {}),
      }));
  },
});

const getBrandFormula = tool({
  name: "get_brand_formula",
  title: "Get a content formula",
  description:
    "One content formula written out: its beats timed to a length (what each moment must do, show and say), the rules it keeps with the channel's own, its guardrails, why it works and its sources. Pass brandKitId for a formula written for that brand. Follow its beats and timing when you script, storyboard or prompt, in the brand's words; keep its guardrails.",
  scope: "read",
  input: z.object({
    formulaId: z.string().min(1).max(60).describe("A formula's id (see list_brand_formulas)"),
    brandKitId: id()
      .nullable()
      .optional()
      .describe("The brand kit, for a formula written for that brand"),
    seconds: z.number().int().min(5).max(600).nullable().optional(),
    channel: z.enum(CHANNELS).nullable().optional(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { CHANNEL_GUIDES, GUARDRAILS, formulaBlock, formulaById, sourcesOf, timedBeats } =
      await import("../brand/formulas");
    // A library formula doesn't need the kit: one archived since still reads them.
    const { loadBrandKit } = await import("../brand/use.server");
    const kit = args.brandKitId ? await loadBrandKit(args.brandKitId) : null;
    const formula = formulaById(args.formulaId, kit?.ownFormulas ?? []);
    if (!formula)
      throw new AppError(
        "INVALID_PARAMETERS",
        args.brandKitId && !kit
          ? `There is no formula called ${args.formulaId} in the library, and that brand kit no longer exists`
          : `There is no formula called ${args.formulaId} (see list_brand_formulas${kit ? "" : "; a brand's own formulas need its brandKitId"})`,
      );
    const seconds = args.seconds ?? formula.seconds.ideal;
    const channel = args.channel ?? null;
    return {
      id: formula.id,
      name: formula.name,
      origin: formula.origin,
      summary: formula.summary,
      purpose: formula.purpose,
      evidence: formula.grade,
      seconds,
      shapes: channel ? [CHANNEL_GUIDES[channel].shape] : formula.shapes,
      beats: timedBeats(formula, seconds),
      rules: formula.rules,
      avoid: formula.avoid,
      guardrails: formula.guardrails.flatMap((key) =>
        GUARDRAILS[key] ? [GUARDRAILS[key]!.rule] : [],
      ),
      why: formula.why,
      ...(formula.own
        ? {
            writtenForBrand: true,
            basedOn: formula.own.basedOn,
            audience: formula.own.audience,
            cadence: formula.own.cadence,
          }
        : {}),
      sources: sourcesOf(formula, channel),
      brief: formulaBlock(formula, { seconds, channel }),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

/** What a generation is: the same for queuing it and for pricing it. */
const generationSpec = z.object({
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
  characterIds: z
    .array(id())
    .max(4)
    .default([])
    .describe("Characters (see list_characters) who must look like themselves"),
  brandKitId: id()
    .nullable()
    .optional()
    .describe(
      "A brand kit (see list_brand_kits): its look goes into the prompt and what it never shows into the negative prompt",
    ),
});

/** A generation's parameters and inputs as they will be sent: its characters and brand in them. */
async function asSent(model: ModelRegistryEntry, args: z.output<typeof generationSpec>) {
  const cast = args.characterIds.length
    ? await withCharacters(model, args.parameters, args.inputs, args.characterIds)
    : { parameters: args.parameters, inputs: args.inputs };
  if (args.brandKitId) cast.parameters = await withBrand(model, cast.parameters, args.brandKitId);
  return cast;
}

const queueGeneration = tool({
  name: "queue_generation",
  title: "Queue a generation",
  description:
    "Makes an image or video with a model (see list_models), from library files in the model's input roles. With characterIds the characters keep their likeness: on a Soul model their Soul ID is used (custom_reference_id), on other models their reference sheet goes in as reference images and their look into the prompt. It passes the same spending checks as the app (project, campaign and your monthly cap) and is billed by the provider. Poll get_generation for its files.",
  scope: "generate",
  readOnly: false,
  input: generationSpec.extend({
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
    const cast = await asSent(model, args);
    return createAndSubmitGeneration({
      userId: caller.userId,
      model,
      parameters: cast.parameters,
      inputs: cast.inputs.map((input, position) => ({ ...input, position })),
      projectId: args.projectId ?? null,
      campaignId: args.campaignId ?? null,
      estimatedCostUsd: args.estimatedCostUsd ?? null,
      clientRequestId: args.clientRequestId,
    });
  },
});

const estimateGeneration = tool({
  name: "estimate_generation",
  title: "Price a generation",
  description:
    "The provider's price for a generation, without making it: the same model, parameters, inputs, characters and brand kit queue_generation would take, priced as they would be sent. Nothing is billed. Pass the price back to queue_generation as estimatedCostUsd.",
  scope: "read",
  input: generationSpec,
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const model = await activeModel(args.modelId);
    const cast = await asSent(model, args);
    const { estimateGenerationCost } = await import("../generation-estimate.server");
    return estimateGenerationCost({
      userId: caller.userId,
      modelId: model.id,
      parameters: cast.parameters,
      inputs: cast.inputs.map((input, position) => ({ ...input, position })),
    });
  },
});

/** A stage: generations priced together, and queued all together or not at all (see ../stage-check). */
const stageInput = z.object({
  generations: z
    .array(
      generationSpec.extend({
        takes: z
          .number()
          .int()
          .min(1)
          .max(STAGE_LIMITS.takes)
          .default(1)
          .describe("How many takes of it the stage makes"),
        label: z.string().max(80).optional().describe("Your name for it in the answer (its shot)"),
      }),
    )
    .min(1)
    .max(STAGE_LIMITS.items),
  retakeAllowance: z
    .number()
    .min(0)
    .max(STAGE_LIMITS.allowance)
    .default(DEFAULT_RETAKE_ALLOWANCE)
    .describe("The share added to the total for retakes that may follow (0.2, a fifth again)"),
  projectId: id().nullable().optional(),
  campaignId: id().nullable().optional(),
});

const estimateStage = tool({
  name: "estimate_stage",
  title: "Price a stage",
  description:
    "Prices a list of generations together, each as estimate_generation prices it and every take of each, adds an allowance for retakes, and checks the total against what is left on the Higgsfield API balance and the spending limit that applies (the project's or campaign's, or your monthly cap). Says whether the stage fits, and if not, why. Nothing is billed.",
  scope: "read",
  input: stageInput,
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { estimateStage: run } = await import("./stage.server");
    return run(args, caller, { activeModel, asSent });
  },
});

const queueStage = tool({
  name: "queue_stage",
  title: "Queue a stage",
  description:
    "Queues a list of generations all together or not at all. The stage is priced and checked as estimate_stage checks it, and refused with nothing queued when its total with the allowance for retakes would go past the Higgsfield API balance or a spending limit, when Higgsfield has turned work away for want of credits, when an item can't be sent, or when part of it can't be priced (unless allowUnpriced). Then every take is queued, each through the same checks as queue_generation; poll them with get_generation. The same clientRequestId returns the stage's generations (and queues any it didn't reach) instead of queuing it twice.",
  scope: "generate",
  readOnly: false,
  input: stageInput.extend({
    allowUnpriced: z
      .boolean()
      .default(false)
      .describe("Queue it even though part of it can't be priced (the rest is still checked)"),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { queueStage: run } = await import("./stage.server");
    return run(args, caller, { activeModel, asSent });
  },
});

/** A generation's parameters in a brand's look: its style line in the prompt, its avoid line in the negative prompt. */
async function withBrand(
  model: ModelRegistryEntry,
  parameters: Record<string, unknown>,
  brandKitId: string,
): Promise<Record<string, unknown>> {
  const { requireBrandKit } = await import("../brand/use.server");
  const { brandAvoidLine, withBrandStyle } = await import("../brand/design");
  const kit = await requireBrandKit(brandKitId);
  const prompt = typeof parameters["prompt"] === "string" ? parameters["prompt"] : "";
  const avoid = brandAvoidLine(kit);
  const negativeField = (model.parameter_schema?.fields ?? []).some(
    (field) => field.key === "negative_prompt",
  );
  const negative =
    typeof parameters["negative_prompt"] === "string" ? parameters["negative_prompt"].trim() : "";
  return {
    ...parameters,
    prompt: withBrandStyle(prompt, kit, model.output_type === "video" ? "video" : "image"),
    ...(negativeField && avoid && !negative.includes(avoid)
      ? { negative_prompt: [negative, avoid].filter(Boolean).join(", ") }
      : {}),
  };
}

/**
 * A generation's parameters and inputs with its characters in it: on a Soul
 * model the Soul ID trained for it (one character); elsewhere the characters'
 * reference sheets as reference images (as many as the model takes, everyone's
 * best view first) and their look written into the prompt.
 */
async function withCharacters(
  model: ModelRegistryEntry,
  parameters: Record<string, unknown>,
  inputs: { assetId: string; role: string }[],
  characterIds: string[],
): Promise<{ parameters: Record<string, unknown>; inputs: { assetId: string; role: string }[] }> {
  const { charactersForAgent } = await import("../characters/service.server");
  const { charactersLine, interleaveSheets, soulVersionFor } = await import("../characters/model");
  const all = await charactersForAgent(200);
  const cast = characterIds.map((characterId) => {
    const character = all.find((entry) => entry.id === characterId);
    if (!character)
      throw new AppError("INVALID_PARAMETERS", "A character is no longer in the library");
    return character;
  });
  const version = soulVersionFor(model.model_path);
  if (version) {
    if (cast.length !== 1)
      throw new AppError(
        "INVALID_PARAMETERS",
        "A Soul model makes images of one character at a time",
      );
    const soul = cast[0]!.souls.find((entry) => entry.version === version);
    if (!soul)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${cast[0]!.name} has no Soul ID for this Soul model: train one, or pick another model`,
      );
    return {
      parameters: {
        ...parameters,
        custom_reference_id: soul.referenceId,
        custom_reference_strength:
          Number(parameters["custom_reference_strength"]) > 0
            ? parameters["custom_reference_strength"]
            : 1,
      },
      inputs,
    };
  }
  const slot =
    (model.capabilities?.inputs ?? []).find(
      (entry) =>
        entry.type === "image" &&
        (entry.role === "reference" || entry.role === "source") &&
        (entry.max ?? 1) >= 1,
    ) ?? null;
  const taken = inputs.filter((input) => input.role === slot?.role).length;
  const room = slot ? Math.max(0, (slot.max ?? 1) - taken) : 0;
  const sheets = interleaveSheets(cast)
    .filter((entry) => !inputs.some((input) => input.assetId === entry.assetId))
    .slice(0, room);
  const prompt = typeof parameters["prompt"] === "string" ? parameters["prompt"].trim() : "";
  const line = charactersLine(cast, { references: sheets.length > 0, descriptionChars: 300 });
  return {
    parameters: {
      ...parameters,
      prompt: prompt.includes(line) ? prompt : [prompt, line].filter(Boolean).join("\n\n"),
    },
    inputs: [...inputs, ...sheets.map((entry) => ({ assetId: entry.assetId, role: slot!.role }))],
  };
}

/* ------------------------------------------------------------------ */
/* Characters and Soul IDs                                             */
/* ------------------------------------------------------------------ */

const listCharacters = tool({
  name: "list_characters",
  title: "List characters",
  description:
    "The team's characters (people and mascots who must look the same everywhere): their look, how many reference images they have, and their Soul IDs (one per Soul model: v2 Soul 2, cinema Soul Cinema, v1 Soul Standard), with each likeness score (0-10) and whether a person approved it.",
  scope: "read",
  input: z.object({ limit: z.number().int().min(1).max(100).default(40) }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { charactersForAgent } = await import("../characters/service.server");
    return {
      characters: (await charactersForAgent(args.limit)).map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        sheetImages: character.images.length,
        souls: character.souls,
      })),
    };
  },
});

const getCharacter = tool({
  name: "get_character",
  title: "Get a character",
  description:
    "One character: their look, reference sheet (with links valid for an hour), training photos, Soul IDs and the state of their latest Soul ID training.",
  scope: "read",
  input: z.object({ characterId: id() }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { data: character } = await db
      .from("characters")
      .select("id,name,description,soul_status,soul_training_version,soul_error,archived_at")
      .eq("id", args.characterId)
      .maybeSingle();
    if (!character || character.archived_at)
      throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
    const { data: images } = await db
      .from("character_images")
      .select("asset_id,role,view,position,assets(storage_bucket,storage_path,deleted_at)")
      .eq("character_id", args.characterId)
      .order("position");
    const { soulsOf } = await import("../characters/souls.server");
    const souls = (await soulsOf([args.characterId])).get(args.characterId) ?? [];
    const listed = [];
    for (const image of images ?? []) {
      const asset = image.assets as unknown as {
        storage_bucket: string;
        storage_path: string;
        deleted_at: string | null;
      } | null;
      if (!asset || asset.deleted_at) continue;
      listed.push({
        assetId: image.asset_id,
        role: image.role,
        view: image.view,
        url: await signedLink(asset.storage_bucket, asset.storage_path),
      });
    }
    return {
      id: character.id,
      name: character.name,
      description: character.description,
      sheet: listed.filter((image) => image.role === "sheet"),
      trainingPhotos: listed.filter((image) => image.role === "photo"),
      souls: souls.map((soul) => ({
        id: soul.id,
        version: soul.version,
        referenceId: soul.referenceId,
        inUse: soul.active,
        source: soul.source,
        approved: !!soul.approvedAt,
        likeness: soul.likeness
          ? {
              score: soul.likeness.score,
              verdict: soul.likeness.verdict,
              summary: soul.likeness.summary,
            }
          : null,
        readyAt: soul.readyAt,
      })),
      training: {
        status: character.soul_status,
        version: character.soul_training_version,
        error: character.soul_error,
      },
    };
  },
});

/** Changing a character (and training its Soul ID, which is billed) is for its maker or an admin. */
async function assertCanEditCharacter(userId: string, characterId: string): Promise<void> {
  const role = await roleOf(userId);
  const { data } = await db
    .from("characters")
    .select("created_by")
    .eq("id", characterId)
    .maybeSingle();
  if (!data) throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
  if (data.created_by !== userId && role !== "admin")
    throw new AppError(
      "NOT_AUTHORIZED",
      "Only the person who made this character, or an admin, can change it or train its Soul ID",
    );
}

const saveCharacter = tool({
  name: "save_character",
  title: "Save a character",
  description:
    "Makes a character from library images (or, with characterId, changes one) so they look the same everywhere: a name, their look (written into every prompt they are in) and reference sheet images by view (face, front, three_quarter, side, back, outfit, expression, other), plus training photos for a Soul ID. Images are added to those the character has (at most 12 sheet images, 40 photos). Then queue_generation with characterIds sends their sheet; train_soul_id trains a Soul ID.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    characterId: id().optional(),
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(600).optional(),
    sheet: z
      .array(z.object({ assetId: id(), view: z.enum(CHARACTER_VIEWS) }))
      .max(12)
      .default([]),
    photos: z.array(id()).max(40).default([]),
  }),
  run: async (args, caller) => {
    const service = await import("../characters/service.server");
    let characterId = args.characterId;
    if (characterId) {
      await assertCanEditCharacter(caller.userId, characterId);
      await service.updateCharacter({
        id: characterId,
        name: args.name,
        description: args.description,
      });
    } else {
      await roleOf(caller.userId);
      if (!args.name) throw new AppError("INVALID_PARAMETERS", "A new character needs a name");
      characterId = (
        await service.createCharacter({
          userId: caller.userId,
          name: args.name,
          description: args.description ?? "",
        })
      ).id;
    }
    const images = [
      ...args.sheet.map((image) => ({
        assetId: image.assetId,
        role: "sheet" as const,
        view: image.view,
      })),
      ...args.photos.map((assetId) => ({
        assetId,
        role: "photo" as const,
        view: "other" as const,
      })),
    ];
    let added = 0;
    try {
      if (images.length)
        ({ added } = await service.addCharacterImages({
          characterId,
          userId: caller.userId,
          images,
        }));
    } catch (error) {
      // A new character whose images were refused isn't left behind empty.
      if (!args.characterId) await service.archiveCharacter(characterId).catch(() => {});
      throw error;
    }
    return { characterId, created: !args.characterId, added };
  },
});

const trainSoul = tool({
  name: "train_soul_id",
  title: "Train a Soul ID",
  description:
    "Trains a character's Soul ID (Higgsfield's trained likeness) for one Soul model, on at least 5 of their images (assetIds; default: their training photos when there are 5 or more, else photos and sheet). Billed by Higgsfield. Started once: an unclear answer is never retried without confirmUncertain. Follow it with get_character; once ready, it is used for that Soul model.",
  scope: "generate",
  readOnly: false,
  input: z.object({
    characterId: id(),
    version: z.enum(["v2", "cinema", "v1"]).default("v2"),
    assetIds: z.array(id()).min(5).max(100).optional(),
    confirmUncertain: z.boolean().default(false),
  }),
  run: async (args, caller) => {
    await assertCanEditCharacter(caller.userId, args.characterId);
    const { trainSoulId } = await import("../characters/service.server");
    return trainSoulId({ ...args, userId: caller.userId });
  },
});

const makeSoulStill = tool({
  name: "make_soul_still",
  title: "Make a still from a Soul ID",
  description:
    "Paints one photographic still of a character from their Soul ID, in the scene described, at the shape given: their truest likeness. Use it for portraits, and as the start frame of a video (video models can't take a Soul ID, so the likeness reaches a clip through the frame it starts from). Billed like any generation. Poll get_generation for the image.",
  scope: "generate",
  readOnly: false,
  input: z.object({
    characterId: id(),
    scene: z
      .string()
      .min(3)
      .max(1500)
      .describe("What the still shows: place, action, framing, light"),
    aspectRatio: z
      .string()
      .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
      .default("9:16"),
    version: z
      .enum(["v2", "cinema", "v1"])
      .optional()
      .describe("Default: the best Soul ID they have"),
    projectId: id().nullable().optional(),
    brandKitId: id()
      .nullable()
      .optional()
      .describe("A brand kit whose look the still is made in (see list_brand_kits)"),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { charactersForAgent } = await import("../characters/service.server");
    const { SOUL_MODEL_PATHS } = await import("../characters/model");
    const { soulStillPrompt } = await import("../characters/soul");
    const { soulStillValues } = await import("../characters/views");
    const character = (await charactersForAgent(200)).find(
      (entry) => entry.id === args.characterId,
    );
    if (!character) throw new AppError("INVALID_PARAMETERS", "That character no longer exists");
    const soul = args.version
      ? character.souls.find((entry) => entry.version === args.version)
      : character.soul
        ? character.souls.find((entry) => entry.referenceId === character.soul!.referenceId)
        : undefined;
    if (!soul)
      throw new AppError(
        "INVALID_PARAMETERS",
        `${character.name} has no Soul ID${args.version ? " for that Soul model" : ""} yet`,
      );
    const { data: model } = await db
      .from("model_registry")
      .select("*")
      .eq("model_path", SOUL_MODEL_PATHS[soul.version])
      .eq("is_active", true)
      .maybeSingle();
    if (!model) throw new AppError("INVALID_PARAMETERS", "That Soul model is unavailable");
    const [w = 0, h = 0] = args.aspectRatio.split(":").map(Number);
    if (!(w > 0 && h > 0)) throw new AppError("INVALID_PARAMETERS", "That shape can't be painted");
    const { assertGenerationAllowed, createAndSubmitGeneration } =
      await import("../generation-create.server");
    await assertGenerationAllowed(caller.userId);
    return createAndSubmitGeneration({
      userId: caller.userId,
      model: model as unknown as ModelRegistryEntry,
      parameters: await (async () => {
        const values = {
          ...soulStillValues(model as unknown as ModelRegistryEntry, w / h, soul.referenceId),
          prompt: soulStillPrompt(args.scene, character),
        };
        return args.brandKitId
          ? withBrand(model as unknown as ModelRegistryEntry, values, args.brandKitId)
          : values;
      })(),
      inputs: [],
      projectId: args.projectId ?? null,
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
    if (args.action === "start_frame" && args.startFrame === undefined)
      throw new AppError(
        "INVALID_PARAMETERS",
        'startFrame: give a library image id, "anchor", or null for its usual start',
      );
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

/** The most an imported picture may weigh, and the kinds the models and the Editor take. */
const IMPORT_MAX_BYTES = 15 * 1024 * 1024;
const IMPORT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const importImage = tool({
  name: "import_image",
  title: "Import a picture",
  description:
    "Puts a picture into the studio's library, from its bytes (data, base64) or a public https address (url): a typeset screen plate, a logo, a reference someone supplied. PNG, JPEG, WebP or GIF, up to 15 MB. It can then be a generation's input, a character's image or an edit's overlay. The same clientRequestId returns the first import instead of a second copy. A screenshot of a real client's screen goes with reference: kept out of the library until its private details are blurred (get_redaction, apply_redaction), and marked layout only.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().min(1).max(200),
    data: z
      .string()
      .max(21_000_000)
      .optional()
      .describe("The picture's bytes in base64 (a data: prefix is fine)"),
    url: z.string().max(2000).optional().describe("A public https address to read it from"),
    projectId: id().nullable().optional(),
    clientRequestId: requestId(),
    reference: z
      .object({
        redact: z
          .boolean()
          .default(true)
          .describe(
            "Find names, emails, phone numbers and addresses and blur them in a copy (see apply_redaction); the original never joins the library",
          ),
        layoutOnly: z
          .boolean()
          .default(true)
          .describe("Never placed in a frame: no generation or edit may use it"),
        keepOriginal: z
          .boolean()
          .default(false)
          .describe(
            "With redact: keep the original once the copy is made, where only admins can open it",
          ),
      })
      .optional()
      .describe("A screenshot supplied as a reference, such as a client's screen"),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    if (!args.data === !args.url)
      throw new AppError("INVALID_PARAMETERS", "Give the picture as data or as a url, not both");
    if (args.reference?.layoutOnly || args.reference?.redact) {
      const { privacyReady } = await import("../media/redaction.server");
      if (!(await privacyReady())) throw new AppError("INVALID_PARAMETERS", PRIVACY_NEEDS_UPDATE);
    }
    const { data: before } = await db
      .from("assets")
      .select("id,width,height,mime_type")
      .eq("uploaded_by", caller.userId)
      .contains("metadata", { client_request_id: args.clientRequestId })
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (before && args.reference?.layoutOnly) {
      const { setLayoutOnly } = await import("../media/layout-only.server");
      await setLayoutOnly({ assetId: before.id, userId: caller.userId, layoutOnly: true });
    }
    if (before)
      return {
        assetId: before.id,
        imported: false,
        width: before.width,
        height: before.height,
        mimeType: before.mime_type,
      };
    if (args.projectId) {
      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("id", args.projectId)
        .maybeSingle();
      if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
    }

    const { fetchCapped, imageKind, imageSize } = await import("../brand/fetch.server");
    let bytes: Uint8Array;
    if (args.data) {
      const { base64ToBytes } = await import("../voice/audio");
      try {
        bytes = base64ToBytes(args.data.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
      } catch {
        throw new AppError("INVALID_PARAMETERS", "The data isn't base64");
      }
    } else {
      if (!/^https:\/\//i.test(args.url!))
        throw new AppError("INVALID_PARAMETERS", "The url must be an https address");
      const fetched = await fetchCapped(args.url!, {
        maxBytes: IMPORT_MAX_BYTES,
        timeoutMs: 20_000,
        headers: { accept: "image/png,image/jpeg,image/webp,image/gif;q=0.9,image/*;q=0.5" },
      });
      if (!fetched.ok)
        throw new AppError("INVALID_PARAMETERS", `The picture couldn't be read: ${fetched.reason}`);
      bytes = fetched.bytes;
    }
    if (bytes.byteLength > IMPORT_MAX_BYTES)
      throw new AppError("INVALID_PARAMETERS", "The picture is larger than 15 MB");
    const kind = imageKind(bytes);
    if (!kind || !IMPORT_TYPES.has(kind.mime))
      throw new AppError("INVALID_PARAMETERS", "That isn't a PNG, JPEG, WebP or GIF picture");
    const size = imageSize(bytes);
    if (args.reference?.redact) {
      // Kept out of the library, read for its private details: apply_redaction makes the copy.
      if (!SCREENSHOT_TYPES[kind.mime])
        throw new AppError(
          "INVALID_PARAMETERS",
          "A screenshot to redact must be a PNG, JPEG or WebP",
        );
      const { importScreenshot } = await import("../media/redaction.server");
      const redaction = await importScreenshot({
        userId: caller.userId,
        bytes,
        mimeType: kind.mime,
        title: args.title,
        projectId: args.projectId ?? null,
        choices: {
          layoutOnly: args.reference.layoutOnly,
          keepOriginal: args.reference.keepOriginal,
        },
        clientRequestId: args.clientRequestId,
      });
      return { assetId: null, redaction };
    }

    // Where uploads from the app go (see storageScope in ../storage).
    const bucket = "generation-inputs";
    const scope = args.projectId ? `projects/${args.projectId}` : `unassigned/${caller.userId}`;
    const name =
      args.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "picture";
    const path = `${scope}/inputs/${crypto.randomUUID()}-${name}.${kind.extension}`;
    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(path, bytes, { contentType: kind.mime, upsert: false });
    if (uploadError) throw new AppError("STORAGE_FAILED", "The picture couldn't be stored");
    const { data: row, error } = await db
      .from("assets")
      .insert({
        project_id: args.projectId ?? null,
        uploaded_by: caller.userId,
        asset_type: "image",
        source_type: "uploaded",
        title: args.title.slice(0, 200),
        storage_bucket: bucket,
        storage_path: path,
        mime_type: kind.mime,
        file_size: bytes.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        metadata: {
          source: "studio_api",
          token_id: caller.tokenId,
          client_request_id: args.clientRequestId,
          ...(args.url ? { origin: args.url } : {}),
        } as never,
      })
      .select("id")
      .single();
    if (error || !row) {
      await db.storage.from(bucket).remove([path]);
      throw new AppError("STORAGE_FAILED", "The picture couldn't be added to the library");
    }
    if (args.reference?.layoutOnly) {
      const { setLayoutOnly } = await import("../media/layout-only.server");
      await setLayoutOnly({ assetId: row.id, userId: caller.userId, layoutOnly: true });
    }
    return {
      assetId: row.id,
      imported: true,
      ...(args.reference?.layoutOnly ? { layoutOnly: true } : {}),
      width: size?.width ?? null,
      height: size?.height ?? null,
      mimeType: kind.mime,
    };
  },
});

const importAudio = tool({
  name: "import_audio",
  title: "Import audio",
  description:
    "Puts audio into the studio's library, from its bytes (data, base64) or a public https address (url): WAV, MP3, M4A (AAC) or FLAC, up to 40 MB from a url or 20 MB as data. It goes in as the app's own upload does. As music or a sound effect (use) it joins the music library with its licence: \"licensed\", with its rights (licensor, scopes and any reference, territories, expiresOn and notes), or \"owned\"; confirmed: true is your confirmation, as the token's owner, that the brand holds that licence. As a voiceover it becomes a take in an edit's Voice tab (sequenceId); confirmed: true confirms it was recorded by or for the brand, with the speaker's permission to use their voice. The same clientRequestId returns the first import instead of a second copy.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().min(1).max(200),
    data: z
      .string()
      .max(28_000_000)
      .optional()
      .describe("The audio's bytes in base64 (a data: prefix is fine), up to 20 MB"),
    url: z
      .string()
      .max(2000)
      .optional()
      .describe("A public https address to read it from, up to 40 MB"),
    use: z
      .enum(["music", "sound_effect", "voiceover"])
      .describe("Music or a sound effect for the music library, or a voiceover for an edit"),
    licence: z
      .enum(["licensed", "owned"])
      .optional()
      .describe("Music and sound effects: what the brand holds for the recording"),
    rights: z
      .object({
        licensor: z.string().min(2).max(200).describe("Who licensed it"),
        scopes: z
          .array(z.enum(RIGHTS_SCOPES.map((scope) => scope.id) as [RightsScope, ...RightsScope[]]))
          .min(1)
          .max(RIGHTS_SCOPES.length)
          .describe("Where it may be used"),
        reference: z.string().max(200).optional().describe("The licence's id or reference"),
        territories: z.string().max(200).optional().describe('Where, e.g. "Worldwide"'),
        expiresOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional()
          .describe("The licence's last day (YYYY-MM-DD), if it runs out"),
        notes: z
          .string()
          .max(1000)
          .optional()
          .describe("Its conditions (credit wording and the like)"),
      })
      .optional()
      .describe("A \"licensed\" recording's terms, as the app's form records them"),
    artist: z.string().max(300).nullable().optional(),
    genres: z.array(z.string().max(40)).max(8).default([]),
    moods: z.array(z.string().max(40)).max(8).default([]),
    instrumental: z.boolean().nullable().optional(),
    sequenceId: id().optional().describe("A voiceover's edit (its Voice tab keeps the take)"),
    transcript: z.string().max(4000).nullable().optional().describe("A voiceover's words"),
    projectId: id().nullable().optional().describe("Music: the project it belongs to"),
    campaignId: id().nullable().optional().describe("Music: the campaign it belongs to"),
    confirmed: z
      .literal(true)
      .describe(
        "Your confirmation: of the licence as stated (music), or that the voiceover was recorded by or for the brand with the speaker's permission",
      ),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { importAudio: run } = await import("./audio-import.server");
    return run(args, caller);
  },
});

const generateMusic = tool({
  name: "generate_music",
  title: "Make music",
  description:
    "Makes a track with Eleven Music into the music library, as the Music page does, and waits for it (a minute or two; up to five): from a prompt, with its length in seconds (instrumental rules out vocals), or from a composition plan, the song as chunks of fixed lengths (3 to 120 s each, up to 10 minutes in all), each with its styles and its text (\"[Intro]\", then any lyrics), which fixes where every part starts, as a film needs its drops on its cuts. A plan needs Eleven Music v2 or v2.5, takes a seed, and keeps the prompt as the track's description. Billed in the account's ElevenLabs credits, and recorded before it is asked for: the same clientRequestId returns the first track (made, failed or uncertain) instead of making and paying for another, and a track whose answer was lost is never made again by itself. Its licence is the library's AI music licence. Returns the track: its library asset, status, length and ElevenLabs' song id.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().trim().min(1).max(200),
    prompt: z
      .string()
      .trim()
      .min(10)
      .max(2000)
      .describe(
        "What the music is: sent as it is without a plan, kept as the track's description with one",
      ),
    plan: musicPlanSchema
      .optional()
      .describe(
        "A composition plan: the song as chunks of fixed lengths (Eleven Music v2 and v2.5)",
      ),
    seconds: z
      .number()
      .min(MUSIC_LENGTH.min)
      .max(MUSIC_LENGTH.max)
      .optional()
      .describe("Its length, without a plan (a plan's chunks set it)"),
    model: z
      .enum(MUSIC_MODELS.map((model) => model.id) as [MusicModel, ...MusicModel[]])
      .optional()
      .describe("Eleven Music v2.5 unless named"),
    instrumental: z
      .boolean()
      .default(true)
      .describe(
        'No vocals. A prompt is held to it; a plan says it in its chunks: no lyrics, and "vocals" among their negative styles',
      ),
    genres: z.array(z.string().max(40)).max(8).default([]),
    moods: z.array(z.string().max(40)).max(8).default([]),
    bpm: z
      .number()
      .min(40)
      .max(250)
      .nullable()
      .optional()
      .describe("Its tempo, as the library notes it"),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2_147_483_647)
      .optional()
      .describe("A plan's seed: the same plan and seed come out much the same"),
    projectId: id().nullable().optional(),
    campaignId: id().nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    if (!args.plan && args.seconds === undefined)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Give the music's length (seconds), or a plan that sets it",
      );
    if (args.plan && args.seconds !== undefined)
      throw new AppError("INVALID_PARAMETERS", "A plan's chunks set its length: leave seconds out");
    if (!args.plan && args.seed !== undefined)
      throw new AppError(
        "INVALID_PARAMETERS",
        "A seed goes with a plan only: Eleven Music refuses one alongside a prompt",
      );
    if (args.projectId) {
      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("id", args.projectId)
        .maybeSingle();
      if (!project) throw new AppError("INVALID_PARAMETERS", "That project doesn't exist");
    }
    const { generateMusic: make } = await import("../music/service.server");
    const { track, duplicate } = await make({
      userId: caller.userId,
      prompt: args.prompt,
      title: args.title,
      seconds: args.seconds ?? 0,
      model: args.model ?? null,
      instrumental: args.instrumental,
      genres: args.genres,
      moods: args.moods,
      bpm: args.bpm ?? null,
      projectId: args.projectId ?? null,
      campaignId: args.campaignId ?? null,
      clientRequestId: args.clientRequestId,
      plan: args.plan ?? null,
      seed: args.seed ?? null,
    });
    const text = (key: string) => (typeof track[key] === "string" ? (track[key] as string) : null);
    return {
      trackId: track.id,
      assetId: text("asset_id"),
      title: text("title"),
      status: text("status"),
      errorMessage: text("error_message"),
      durationSeconds: track["duration_seconds"] == null ? null : Number(track["duration_seconds"]),
      model: text("model"),
      songId: text("provider_request_id"),
      /** True when this request had made it (or started it) already: that track is returned. */
      duplicate,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

const listBrandVoices = tool({
  name: "list_brand_voices",
  title: "List brand voices",
  description:
    "The studio's brand voices, as Brand voices lists them: each one's id, name and description, its provider and model, the project it is kept for (null: it speaks for any project), whether it is the studio default, and its script guidelines. generate_voiceover speaks in one of them. Archived voices are left out; give projectId for only those that may speak for that project's work.",
  scope: "read",
  input: z.object({
    projectId: id()
      .nullable()
      .optional()
      .describe(
        "Only the voices that may speak for this project's work (null: work outside any project)",
      ),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { data, error } = await db
      .from("brand_voices")
      .select("id,name,description,provider,model,language,project_id,is_default,script_guidelines")
      .eq("is_archived", false)
      .order("name");
    if (error)
      throw new AppError("UNKNOWN", "The brand voices couldn't be read. Try again in a moment.");
    const rows = (data ?? []) as unknown as {
      id: string;
      name: string;
      description: string | null;
      provider: string;
      model: string;
      language: string | null;
      project_id: string | null;
      is_default: boolean;
      script_guidelines: string | null;
    }[];
    return rows
      .filter(
        (voice) =>
          args.projectId === undefined ||
          !voice.project_id ||
          voice.project_id === (args.projectId ?? null),
      )
      .map((voice) => ({
        id: voice.id,
        name: voice.name,
        description: voice.description,
        provider: voice.provider,
        model: voice.model,
        language: voice.language,
        projectId: voice.project_id,
        isDefault: voice.is_default,
        scriptGuidelines: voice.script_guidelines,
      }));
  },
});

const generateVoiceover = tool({
  name: "generate_voiceover",
  title: "Speak a script in a brand voice",
  description:
    "Speaks a script in one of the studio's brand voices into the library, as the Voice tab's Generate does: the voice's own provider voice, model, settings and pronunciations every time, so it sounds the same from take to take. Name the voice (voiceId, from list_brand_voices), or let the work's voice speak: the campaign's, then the project's, then the studio default. With an edit (sequenceId) the take joins its Voice tab and its project; otherwise it is kept in the project named, or with no project. Waits for the take (seconds; a long script a minute or so) and returns it: its library file (assetId, for get_asset), its length and every word's start and end as spoken. Billed in the account's provider credits, and recorded before it is asked for: the same clientRequestId returns the first take instead of paying for another, and a take whose answer was lost is never made again by itself (submission_uncertain). A take is an AI voice: its file says so (ai_generated_voice).",
  scope: "edit",
  readOnly: false,
  input: z.object({
    script: z.string().trim().min(1).max(4000).describe("What is said, up to 4,000 characters"),
    voiceId: id()
      .nullable()
      .optional()
      .describe("The brand voice that speaks (list_brand_voices); otherwise the work's voice"),
    sequenceId: id().nullable().optional().describe("An edit whose Voice tab keeps the take"),
    projectId: id().nullable().optional(),
    campaignId: id().nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { generateVoiceover: speak } = await import("../voice/service.server");
    return speak({ ...args, userId: caller.userId });
  },
});

const changeMusicTempo = tool({
  name: "change_music_tempo",
  title: "Change a track's tempo",
  description:
    "Makes a library track play at another tempo, its pitch kept, as a new track in the music library (as the Music page's Change tempo does): to put a track under a cut paced to another's beat. Reel 2 slowed Reel 1's track 7.0%, 129 to 120 BPM, and every cut stayed on its beat. bpm is the tempo it is to play at; fromBpm the tempo it plays at now, the track's own (its bars, get_music_structure) unless given. Name the track by trackId, or by its library file (assetId). The media service makes it (Rubber Band, nothing billed) and this waits for it, a minute or so; the same clientRequestId returns the same track. The new track keeps the original's licence, credit and rights. Find its bars again in the Editor's Music panel before fit_music plans it. Past about 12% a change of tempo can be heard, and the answer's note says so.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    trackId: id().optional(),
    assetId: id().optional().describe("The track's library file, instead of its trackId"),
    bpm: z.number().min(30).max(300).describe("The tempo it is to play at"),
    fromBpm: z
      .number()
      .min(30)
      .max(300)
      .optional()
      .describe("The tempo it plays at now: the track's own unless given"),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    let trackId = args.trackId ?? null;
    if (!trackId && args.assetId) {
      const { data } = await db
        .from("music_tracks")
        .select("id")
        .eq("asset_id", args.assetId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      trackId = (data as { id: string } | null)?.id ?? null;
    }
    if (!trackId)
      throw new AppError(
        "INVALID_PARAMETERS",
        args.assetId
          ? "That file isn't a track in the music library"
          : "Name the track (trackId or assetId)",
      );
    const music = await import("../music/service.server");
    const started = await music.changeTempo({
      userId: caller.userId,
      trackId,
      bpm: args.bpm,
      fromBpm: args.fromBpm,
      clientRequestId: args.clientRequestId,
    });
    let track = started.track;
    // The media service makes it in a minute or so: waited for, up to four.
    for (let waited = 0; track["status"] === "generating" && waited < 240_000; waited += 3000) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      track = (await music.tempoChangeTrack(track.id)) ?? track;
    }
    const text = (key: string) => (typeof track[key] === "string" ? (track[key] as string) : null);
    return {
      trackId: track.id,
      assetId: text("asset_id"),
      title: text("title"),
      status: text("status"),
      errorMessage: text("error_message"),
      durationSeconds: track["duration_seconds"] == null ? null : Number(track["duration_seconds"]),
      bpm: track["bpm"] == null ? null : Number(track["bpm"]),
      tempo: started.tempo,
      note: started.note,
      duplicate: started.duplicate,
    };
  },
});

const importVideo = tool({
  name: "import_video",
  title: "Import a video",
  description: `Puts a finished video into the studio's library (an animatic, a proof or a film made elsewhere), so a review gate can hold it (add_review_version) and the Editor can place it: MP4, QuickTime or WebM, up to ${VIDEO_IMPORT_LIMITS.bytes / 1024 / 1024} MB (one upload to storage; send a review copy of a larger master). Two calls with the same clientRequestId: the first says where to PUT the file (status "upload": its address and headers, good for two hours); once it is there, the next checks it is a video of the size declared and adds it to the library (status "imported", with its assetId), and the media service measures its length, size and frame rate. Asking again returns the first import instead of a second copy.`,
  scope: "edit",
  readOnly: false,
  input: z.object({
    title: z.string().min(1).max(200),
    mimeType: z.enum(Object.keys(VIDEO_IMPORT_TYPES) as [VideoImportType, ...VideoImportType[]]),
    byteSize: z
      .number()
      .int()
      .min(1)
      .max(VIDEO_IMPORT_LIMITS.bytes)
      .describe("The file's exact size in bytes; the stored file must match it"),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional()
      .describe("Its SHA-256, kept with it as given"),
    width: z.number().int().min(16).max(8192).optional(),
    height: z.number().int().min(16).max(8192).optional(),
    durationSeconds: z.number().positive().max(36_000).optional(),
    fps: z.number().positive().max(240).optional(),
    projectId: id().nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { importVideo: run } = await import("./video-import.server");
    return run(args, caller);
  },
});

/* ------------------------------------------------------------------ */
/* Takes that land on a picture, logos' clean plates, private screens  */
/* ------------------------------------------------------------------ */

const alignTake = tool({
  name: "align_take",
  title: "Align a take to its picture",
  description:
    'Puts a take (a video) on the exact picture it must end on, or start on with anchor "first": the media service registers that frame on the picture, matches its colour, and crosses to the picture itself (crossSeconds), which then holds (holdSeconds) before anything else moves. The aligned take joins the library, with what was measured. Answers "processing" at first: ask again with the same clientRequestId to follow it.',
  scope: "edit",
  readOnly: false,
  input: z.object({
    takeAssetId: id(),
    pictureAssetId: id().describe("The picture the take must land on, in the library"),
    anchor: z
      .enum(ALIGN_ANCHORS)
      .default("last")
      .describe("Which end of the take must be the picture"),
    crossSeconds: z.number().min(0).max(ALIGN_LIMITS.cross).default(ALIGN_DEFAULTS.cross),
    holdSeconds: z.number().min(0).max(ALIGN_LIMITS.hold).default(ALIGN_DEFAULTS.hold),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { startAlignTake } = await import("../media/align-take.server");
    const { clientRequestId, ...rest } = args;
    return startAlignTake({
      ...rest,
      userId: caller.userId,
      dedupeKey: `align-take:${caller.userId}:${clientRequestId}`,
    });
  },
});

/* ------------------------------------------------------------------ */
/* A voice measured, and held against a reference                      */
/* ------------------------------------------------------------------ */

const seconds = () => z.number().min(0).max(86_400);

const measureVoiceTool = tool({
  name: "measure_voice",
  title: "Measure a voice",
  description:
    'How a recording\'s voice speaks, from its sound (an audio file or a video in the library), measured by the media service: where it speaks (its phrases), its pace in syllables a second, its pitch (median and middle half), how far its phrase ends fall in the 40 to 90 ms after them (dry, some_room or wet: a reverb or a live room holds them up), and its loudness. With referenceAssetId the reference is measured the same way and they are compared: pitch in semitones, pace as a ratio, the fall and the loudness as differences, so a take can be held against the voice it must match before anyone hears it. start and end (referenceStart and referenceEnd for the reference) measure a stretch, in seconds. summary says it all in words. Nothing is billed. Answers "measuring" while the media service works on a long file: ask again with the same clientRequestId.',
  scope: "read",
  input: z.object({
    assetId: id().describe("The recording: an audio file or a video in the library"),
    referenceAssetId: id()
      .optional()
      .describe("What it must sound like: another recording or video in the library"),
    start: seconds().optional(),
    end: seconds().optional(),
    referenceStart: seconds().optional(),
    referenceEnd: seconds().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { measureVoice } = await import("../voice/measure.server");
    const { clientRequestId, ...rest } = args;
    return measureVoice({
      ...rest,
      userId: caller.userId,
      dedupeKey: `voice-measure:${caller.userId}:${clientRequestId}`,
    });
  },
});

const transcribeAudioTool = tool({
  name: "transcribe_audio",
  title: "Transcribe a recording",
  description:
    'A recording\'s words, as said, from its sound (an audio file or a video in the library): the text, punctuated, and every word\'s start and end in seconds, with the brand\'s names spelt as the brand spells them. A recogniser hears a name as words it knows (the two that read As One\'s reference spelt the client\'s name "Arixa" and "Erixus"), so it is told the names to listen for, and a word it hears within a couple of letters of a name is put right, in the words and where it stands in the text: corrections says what was heard, what is written and when. The names are the brand kit\'s terms (brandKitId, else the studio\'s default kit) and any terms given. language (ISO 639-1, "en") saves it guessing. The media service first takes the speech out (mono, 16 kHz, kept out of the library), then OpenAI hears it, billed to the studio\'s OpenAI account at its per-minute price; a recording of up to about an hour fits. Answers "extracting" while the media service works on a long file: ask again with the same clientRequestId, which reads the transcript once made instead of paying for another. A call made while another with the same clientRequestId is being heard waits for it ("transcribing" if it isn\'t ready in time), so overlapping calls pay once.',
  scope: "generate",
  readOnly: false,
  input: z.object({
    assetId: id().describe("The recording: an audio file or a video in the library"),
    language: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{2}$/)
      .optional()
      .describe('Its language, two letters (ISO 639-1): "en"'),
    terms: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .optional()
      .describe("Names to spell as given, beside the brand kit's own"),
    brandKitId: id()
      .optional()
      .describe("The brand kit whose names it spells; else the default kit"),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { transcribeAudio } = await import("../voice/transcribe.server");
    const { clientRequestId, ...rest } = args;
    return transcribeAudio({
      ...rest,
      userId: caller.userId,
      dedupeKey: `transcribe:${caller.userId}:${clientRequestId}`,
    });
  },
});

/** A share of a picture's width or height (0-1), as boxes are given. */
const share = () => z.number().min(0).max(1);

const getRedaction = tool({
  name: "get_redaction",
  title: "Get a screenshot's redaction",
  description:
    "A reference screenshot imported with import_image's reference choice: where it stands (reading, review, applying, completed), the boxes to blur (as shares of the picture, each with its kind and a label that hides most of what it covers), and, once made, the redacted copy's library id. Only who imported it, or an admin, can read it.",
  scope: "read",
  input: z.object({ redactionId: id() }),
  run: async (args, caller) => {
    const { getRedaction: read } = await import("../media/redaction.server");
    return read(args.redactionId, caller.userId);
  },
});

const applyRedaction = tool({
  name: "apply_redaction",
  title: "Blur a screenshot's private details",
  description:
    "Blurs a reference screenshot's boxes in a copy, which joins the library marked layout only (unless layoutOnly is false): the boxes as proposed, or the ones you give (add any the reading missed, leave out any that aren't private). With no box at all the screenshot joins the library as it is. The original is then deleted, unless keepOriginal, when only admins can open it. Follow it with get_redaction.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    redactionId: id(),
    boxes: z
      .array(
        z.object({
          id: z.string().max(40).optional(),
          x: share(),
          y: share(),
          w: share(),
          h: share(),
          kind: z.enum(["name", "email", "phone", "address", "drawn"]).optional(),
          label: z.string().max(60).optional(),
        }),
      )
      .max(200)
      .optional()
      .describe("The boxes to blur, as shares of the picture; leave out to blur those proposed"),
    layoutOnly: z.boolean().optional(),
    keepOriginal: z.boolean().optional(),
  }),
  run: async (args, caller) => {
    const { applyRedaction: apply } = await import("../media/redaction.server");
    return apply(args.redactionId, caller.userId, {
      ...(args.boxes ? { boxes: args.boxes } : {}),
      layoutOnly: args.layoutOnly,
      keepOriginal: args.keepOriginal,
    });
  },
});

const cancelRedaction = tool({
  name: "cancel_redaction",
  title: "Drop a screenshot before it is redacted",
  description:
    "Drops a reference screenshot whose copy isn't made yet: its original is deleted and nothing joins the library.",
  scope: "edit",
  readOnly: false,
  input: z.object({ redactionId: id() }),
  run: async (args, caller) => {
    const { cancelRedaction: cancel } = await import("../media/redaction.server");
    return cancel(args.redactionId, caller.userId);
  },
});

const setLayoutOnly = tool({
  name: "set_layout_only",
  title: "Mark a picture layout only",
  description:
    "Marks a library file layout only (a reference for how a screen is laid out, never placed in a frame: no generation, edit, render or copy may use it), or lifts the mark, which only an admin may do.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    assetId: id(),
    layoutOnly: z.boolean(),
    note: z.string().max(500).nullable().optional().describe("Why, for whoever finds it"),
  }),
  run: async (args, caller) => {
    const { setLayoutOnly: set } = await import("../media/layout-only.server");
    return { assetId: args.assetId, privacy: await set({ ...args, userId: caller.userId }) };
  },
});

const plateBox = () =>
  z
    .object({ x: share(), y: share(), w: share(), h: share() })
    .describe("A box as shares of the art's width and height, from its top-left corner");
const plateLettering = () =>
  plateBox()
    .extend({ assetId: id() })
    .describe(
      "A transparent file of the lettering (its alpha is the mask) and where it sits on the art",
    );

const startCleanPlate = tool({
  name: "start_clean_plate",
  title: "Start a clean-plate recipe",
  description:
    "Starts the recipe that moves a logo (or any lettering) with a video model without the model ever drawing a letter: mask, edit, blend, animate, align, overlay (see get_clean_plate). The lettering's mask is proposed from a transparent file of it (lettering), from boxes you give, or else from the studio's AI reading where the lettering is. Nothing is made or billed until set_clean_plate_mask uses the mask and queue_clean_plate_step makes the edit.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    artAssetId: id().describe("The picture with its lettering"),
    lettering: plateBox()
      .partial()
      .extend({ assetId: id() })
      .nullable()
      .optional()
      .describe(
        "A transparent file of the lettering, and where it sits (the whole art if not given)",
      ),
    boxes: z.array(plateBox()).max(200).nullable().optional(),
    letters: z
      .enum(["art", "file"])
      .optional()
      .describe(
        'Lay back the art\'s own letters ("art", the default) or the lettering file itself',
      ),
    projectId: id().nullable().optional(),
    clientRequestId: requestId(),
  }),
  run: async (args, caller) => {
    const { startCleanPlate: start } = await import("../media/clean-plate.server");
    const { clientRequestId, ...rest } = args;
    return start({
      ...rest,
      userId: caller.userId,
      dedupeKey: `clean-plate:${caller.userId}:${clientRequestId}`,
    });
  },
});

const getCleanPlate = tool({
  name: "get_clean_plate",
  title: "Get a clean-plate recipe",
  description:
    "A clean-plate recipe and its six steps (mask, edit, blend, animate, align, overlay): each one's status, the library file it made, what was measured, and what happens next in words. Reading it moves it on: a finished job's file is taken up, and a step the media service does starts when its turn comes.",
  scope: "read",
  input: z.object({ recipeId: id() }),
  run: async (args, caller) => {
    const { getCleanPlate: read } = await import("../media/clean-plate.server");
    return read(args.recipeId, caller.userId);
  },
});

const setCleanPlateMask = tool({
  name: "set_clean_plate_mask",
  title: "Use a clean-plate mask",
  description:
    "Uses the lettering's mask, as proposed or changed: boxes over the lettering, a transparent file of it, how far past it the edit is laid in (grow) and how softly it fades into the art (feather), in the art's pixels. The mask is drawn into the library, and what was made from an older mask is made again.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    recipeId: id(),
    boxes: z.array(plateBox()).max(200).optional(),
    lettering: plateLettering().nullable().optional(),
    grow: z.number().min(0).max(300).optional(),
    feather: z.number().min(0).max(200).optional(),
    letters: z.enum(["art", "file"]).optional(),
  }),
  run: async (args, caller) => {
    const { setCleanPlateMask: set } = await import("../media/clean-plate.server");
    const { recipeId, ...change } = args;
    return set(recipeId, caller.userId, change);
  },
});

const plateStep = () =>
  z.object({
    recipeId: id(),
    step: z
      .enum(["edit", "animate"])
      .describe(
        "edit: an image model takes the lettering out; animate: a video model moves the plate",
      ),
    modelId: id(),
    parameters: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("The model's settings; the prompt has a sensible default for the edit"),
    end: z
      .enum(["last", "first", "both"])
      .optional()
      .describe("Animating: whether the take ends on the plate, starts on it, or both"),
    crossSeconds: z.number().min(0).max(3).optional(),
    holdSeconds: z.number().min(0).max(10).optional(),
  });

const estimateCleanPlateStep = tool({
  name: "estimate_clean_plate_step",
  title: "Price a clean-plate step",
  description:
    "The provider's price for a recipe's edit or take, as queue_clean_plate_step would send it (the art or the clean plate in the model's frames, the prompt as it will be). Nothing is billed.",
  scope: "read",
  input: plateStep(),
  run: async (args, caller) => {
    const { estimateCleanPlateStep: estimate } = await import("../media/clean-plate.server");
    const { recipeId, step, ...request } = args;
    return estimate(recipeId, caller.userId, step, request);
  },
});

const queueCleanPlateStep = tool({
  name: "queue_clean_plate_step",
  title: "Make a clean-plate step",
  description:
    "Makes a recipe's edit (an image model takes the lettering out of the art) or its take (a video model moves the clean plate, told never to draw a letter), through the same spending checks as queue_generation, billed by the provider. The steps after it (blend, align, overlay) then run by themselves; follow them with get_clean_plate.",
  scope: "generate",
  readOnly: false,
  input: plateStep().extend({
    estimatedCostUsd: z.number().min(0).max(10_000).nullable().optional(),
  }),
  run: async (args, caller) => {
    const { queueCleanPlateStep: queue } = await import("../media/clean-plate.server");
    const { recipeId, step, ...request } = args;
    return queue(recipeId, caller.userId, step, request);
  },
});

const retryCleanPlateStep = tool({
  name: "retry_clean_plate_step",
  title: "Retry a clean-plate step",
  description:
    "Tries a recipe's failed mask, blend, align or overlay step again (the edit and the take are made again with queue_clean_plate_step).",
  scope: "edit",
  readOnly: false,
  input: z.object({ recipeId: id(), step: z.enum(["mask", "blend", "align", "overlay"]) }),
  run: async (args, caller) => {
    const { retryCleanPlateStep: retry } = await import("../media/clean-plate.server");
    return retry(args.recipeId, caller.userId, args.step);
  },
});

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
          at: z
            .number()
            .min(0)
            .max(LONG_VIDEO_LIMITS.maxSeconds)
            .describe("Seconds on the voiceover's clock"),
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

/** Refuses a timeline that places a layout-only picture (a real client's screen) in a frame. */
async function assertPlaceableTimeline(
  timeline: ReturnType<typeof timelineSchema.parse>,
): Promise<void> {
  const { assertPlaceable } = await import("../media/layout-only.server");
  await assertPlaceable(
    [
      ...timeline.clips.map((clip) => clip.assetId),
      ...timeline.images.map((image) => image.assetId),
    ],
    "edit",
  );
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
    const { timeline, pauses } = await withSettledPauses(validTimeline(args.timeline));
    const missing = await missingFiles(timeline);
    if (missing.length)
      throw new AppError("INVALID_PARAMETERS", `Not in the library: ${missing.join(", ")}`);
    await assertPlaceableTimeline(timeline);
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
    return { sequenceId: data.id, version: data.version, ...pauses };
  },
});

/**
 * A timeline's voiceover pauses held to the voices' measured silences: one
 * just off a silence is moved into it, one nowhere near a silence refused.
 * What was done is said in the answer: how many were moved, and which
 * voiceovers (by item id) haven't been measured yet, so can't be rendered.
 */
async function withSettledPauses(timeline: ReturnType<typeof timelineSchema.parse>) {
  if (!timeline.audio.some((item) => item.role === "voiceover" && item.pauses.length))
    return { timeline, pauses: {} };
  const { settleVoicePauses } = await import("../edit/voice-pauses.server");
  const settled = await settleVoicePauses(timeline);
  return {
    timeline: settled.timeline,
    pauses: {
      ...(settled.snapped ? { pausesSnapped: settled.snapped } : {}),
      ...(settled.unchecked.length ? { pausesUnmeasured: settled.unchecked } : {}),
    },
  };
}

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
    const settled = args.timeline ? await withSettledPauses(validTimeline(args.timeline)) : null;
    const timeline = settled?.timeline;
    if (timeline) {
      const missing = await missingFiles(timeline);
      if (missing.length)
        throw new AppError("INVALID_PARAMETERS", `Not in the library: ${missing.join(", ")}`);
      await assertPlaceableTimeline(timeline);
    }
    const saved = await saveEdit(args.sequenceId, args.expectedVersion, {
      ...(timeline ? { timeline } : {}),
      ...(args.title ? { title: args.title } : {}),
    });
    return { ...saved, ...settled?.pauses };
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
    "Renders an edit to a finished video with the media service, at the version given (from get_edit). Returns the render's id: follow it with get_render. Its credits (get_edit_credits) go with it. With publicUse it is held, and nothing starts, until every file it uses is cleared (set_asset_rights) or you confirm the exceptions (confirmExceptions: true, or their asset ids), recorded with who and when.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    sequenceId: id(),
    expectedVersion: z.number().int().min(1),
    clientRequestId: requestId(),
    publicUse: z
      .boolean()
      .default(false)
      .describe("For publishing or public use: every file it uses must be cleared first"),
    confirmExceptions: z
      .union([z.boolean(), z.array(id()).max(500)])
      .default(false)
      .describe(
        "For public use: confirm the files not cleared as exceptions (all, or by asset id)",
      ),
  }),
  run: async (args, caller) => {
    const { startSequenceRender } = await import("../edit/render.server");
    return startSequenceRender({
      sequenceId: args.sequenceId,
      expectedVersion: args.expectedVersion,
      clientRequestId: args.clientRequestId,
      userId: caller.userId,
      publicUse: args.publicUse,
      confirmExceptions: args.confirmExceptions,
    });
  },
});

const makeReviewSheet = tool({
  name: "make_review_sheet",
  title: "Make a render's review sheet",
  description:
    "Lays a finished render's every shot out as one JPEG, half a second in and on its last frame, each labelled with its clip's name and, for an edit made from a storyboard or a brief, the shot's description. The sheet is kept in the library and linked to the render: follow it with get_render (reviewSheet). Asking again returns the sheet being made or already made, unless again is set.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    renderId: id(),
    clientRequestId: requestId(),
    again: z.boolean().default(false).describe("Make the sheet afresh even if the render has one."),
  }),
  run: async (args, caller) => {
    const { startReviewSheet } = await import("../edit/review-sheet.server");
    return startReviewSheet({
      renderId: args.renderId,
      clientRequestId: args.clientRequestId,
      again: args.again,
      userId: caller.userId,
    });
  },
});

/* ------------------------------------------------------------------ */
/* Music on its bars                                                   */
/* ------------------------------------------------------------------ */

/**
 * A library track's bars and sections as kept on it (they are found from
 * its audio in the Editor's Music panel), or why they can't be had.
 */
async function keptStructure(assetId: string) {
  const { data, error } = await db
    .from("music_tracks")
    .select("*")
    .eq("asset_id", assetId)
    .limit(5);
  if (error) throw new AppError("UNKNOWN", "The music library couldn't be read just now");
  const rows = (data ?? []) as unknown as Json[];
  if (!rows.length)
    throw new AppError("INVALID_PARAMETERS", "That file isn't in the music library");
  if (!rows.some((row) => "structure" in row))
    throw new AppError(
      "INVALID_PARAMETERS",
      "Keeping a track's bars and sections needs a database update (migration 0033_music_structure). Ask an admin to apply it.",
    );
  for (const row of rows) {
    const known = readStructure(row["structure"], row["bar_features"]);
    if (known) return known;
  }
  throw new AppError(
    "INVALID_PARAMETERS",
    "This track's bars haven't been found yet. Open an edit with it in the Editor and press Find bars and sections in the Music panel (they're found from the audio, in the browser), then try again.",
  );
}

const getMusicStructure = tool({
  name: "get_music_structure",
  title: "Get a track's bars and sections",
  description:
    "A music track's tempo, how many beats a bar, where each bar starts and its sections (intro, build, drop, breakdown, reentry, outro or section, each with its loudness from 0 to 1 against the track's others), in seconds on the track's own clock, as found from its audio in the Editor's Music panel. Pass the library file's assetId; includeBeats adds every beat. fit_music plans music on these bars, and lands sections (by their index here) on times.",
  scope: "read",
  input: z.object({ assetId: id(), includeBeats: z.boolean().default(false) }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { structure } = await keptStructure(args.assetId);
    return {
      bpm: structure.bpm,
      beatsPerBar: structure.beatsPerBar,
      bars: structure.bars,
      sections: structure.sections.map((section, index) => ({ index, ...section })),
      confidence: structure.confidence,
      ...(args.includeBeats ? { beats: structure.beats } : {}),
    };
  },
});

const fitMusic = tool({
  name: "fit_music",
  title: "Fit an edit's music on its bars",
  description:
    "Plans an edit's music to run a length on its bars: bars played again or left out (those most like what they meet, in whole phrases, never a section's first bar), each join 20 ms ahead of a bar line under a 30 ms crossfade (a piece cut out of quiet onto a bar its track is already loud in comes in on its bar line instead, its enter, so it doesn't arrive 35 ms early), with sections (by index, from get_music_structure) landed on times on the edit's timeline. It runs to the end of the edit from where the music starts unless seconds is given, and ends on the track's own ending or (ending: bar) on the bar line nearest the length. With apply (the default) the plan goes on the music item, only if the edit is still at expectedVersion, and its new version comes back; without, it only says what it would do. To play the whole track again, update_edit with the item's pieces left out.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    sequenceId: id(),
    expectedVersion: z.number().int().min(1),
    itemId: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        "The music item's id in the timeline's audio; the edit's first music item unless given",
      ),
    seconds: z.number().min(1).max(600).optional(),
    ending: z.enum(["track", "bar"]).default("track"),
    landmarks: z
      .array(
        z.object({
          section: z.number().int().min(0).max(63),
          at: z
            .number()
            .min(0)
            .max(600)
            .describe("When the section should start, in seconds on the edit's timeline"),
        }),
      )
      .max(8)
      .default([]),
    apply: z.boolean().default(true),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
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
    const item = timeline.audio.find((entry) =>
      args.itemId ? entry.id === args.itemId : entry.role === "music",
    );
    if (!item || item.role !== "music")
      throw new AppError(
        "INVALID_PARAMETERS",
        args.itemId ? "That item isn't music in this edit" : "This edit has no music",
      );
    const known = await keptStructure(item.assetId);
    const target = args.seconds ?? layoutTimeline(timeline).total - item.start;
    if (!(target > 0))
      throw new AppError("INVALID_PARAMETERS", "The music starts after the edit ends");
    const fit = fitMusicToLength(known.structure, known.features, target, {
      ending: args.ending,
      landmarks: args.landmarks.map((mark) => ({
        section: mark.section,
        at: mark.at - item.start,
      })),
    });
    if (!fit)
      throw new AppError(
        "INVALID_PARAMETERS",
        "This track can't be fitted to that length on its bars: it would take more joins than a track may have. Ask for a length nearer its own, or loop it.",
      );
    const plan = {
      seconds: fit.length,
      pieces: fit.pieces,
      edits: fit.edits,
      landmarks: fit.landmarks.map((mark) => ({
        section: mark.section,
        asked: Number((mark.asked + item.start).toFixed(6)),
        at: Number((mark.at + item.start).toFixed(6)),
      })),
    };
    if (!args.apply) return { plan };
    const next = {
      ...timeline,
      audio: timeline.audio.map((entry) =>
        entry.id === item.id
          ? // Fitted to the edit, it says to how long (see fitOutOfDate); to a length of its own, not.
            {
              ...entry,
              pieces: fit.pieces,
              duration: null,
              fittedTo: args.seconds === undefined ? target : undefined,
            }
          : entry,
      ),
    };
    return { ...(await saveEdit(args.sequenceId, args.expectedVersion, { timeline: next })), plan };
  },
});

/* ------------------------------------------------------------------ */
/* Rights and credits                                                  */
/* ------------------------------------------------------------------ */

const getAssetRights = tool({
  name: "get_asset_rights",
  title: "Get files' rights",
  description:
    "Library files' rights: where each came from, its licence and its status for public use (cleared, to_confirm or not_cleared), the credit line owed where there is one, and who set and confirmed it and when. Until someone records them they are worked out: music from the library takes its track's licence, what the studio made is under its provider's terms (said by name), what it rendered or cut follows what it was made from, and uploads and imports are to_confirm.",
  scope: "read",
  input: z.object({ assetIds: z.array(id()).min(1).max(100) }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { rightsForAssets } = await import("../rights/service.server");
    const rights = await rightsForAssets(args.assetIds);
    return {
      files: args.assetIds.flatMap((assetId) => rights.get(assetId) ?? []),
      missing: args.assetIds.filter((assetId) => !rights.has(assetId)),
    };
  },
});

const setAssetRights = tool({
  name: "set_asset_rights",
  title: "Set a file's rights",
  description:
    "Records a library file's rights: its status (cleared, to_confirm or not_cleared) and, where it differs from what is worked out, its source, licence, licenceUrl, creditLine and notes. A field left out keeps what was recorded; null clears it. Who set it and who confirmed it (cleared or not_cleared) are recorded with when. A music library track's licence and credit stay the music library's: only its status and notes are set here. With clear: true, what was recorded is forgotten and its rights are worked out again.",
  scope: "edit",
  readOnly: false,
  input: z.object({
    assetId: id(),
    status: z.enum(["cleared", "to_confirm", "not_cleared"]).optional(),
    source: z.string().max(300).nullable().optional().describe("Where it came from"),
    licence: z.string().max(300).nullable().optional().describe('Its licence, e.g. "CC BY 4.0"'),
    licenceUrl: z.string().max(500).nullable().optional(),
    creditLine: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe("The credit owed wherever it is published"),
    notes: z.string().max(2000).nullable().optional(),
    clear: z.boolean().default(false),
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const rights = await import("../rights/service.server");
    if (args.clear)
      return rights.clearAssetRights({ userId: caller.userId, assetId: args.assetId });
    if (!args.status)
      throw new AppError(
        "INVALID_PARAMETERS",
        "Give the file's status: cleared, to_confirm or not_cleared",
      );
    return rights.setAssetRights({
      userId: caller.userId,
      assetId: args.assetId,
      change: {
        status: args.status,
        source: args.source,
        licence: args.licence,
        licenceUrl: args.licenceUrl,
        creditLine: args.creditLine,
        notes: args.notes,
      },
    });
  },
});

const getEditCredits = tool({
  name: "get_edit_credits",
  title: "Get an edit's credits",
  description:
    "An edit's credits: every file it uses (its clips, the pictures over it and the sound heard), how it uses each, each one's source, licence and status, the credit lines owed, and which files aren't cleared (a render for public use is held until they are, or their exceptions are confirmed).",
  scope: "read",
  input: z.object({ sequenceId: id() }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    const { data: sequence } = await db
      .from("sequences")
      .select("id,timeline")
      .eq("id", args.sequenceId)
      .maybeSingle();
    if (!sequence) throw new AppError("INVALID_PARAMETERS", "That edit doesn't exist");
    const timeline = parseTimeline(sequence.timeline);
    if (!timeline) throw new AppError("INVALID_PARAMETERS", "The edit's timeline can't be read");
    const { creditsForTimeline } = await import("../rights/service.server");
    const credits = await creditsForTimeline(timeline);
    return { ...credits, notCleared: credits.notCleared.map((file) => file.assetId) };
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
  getMusicStructure,
  listBrandVoices,
  listBrandKits,
  getBrandKit,
  readBrandCode,
  listBrandFormulas,
  getBrandFormula,
  listCharacters,
  getCharacter,
  estimateGeneration,
  estimateStage,
  queueGeneration,
  queueStage,
  makeSoulStill,
  trainSoul,
  startPresenterVideo,
  steerLongVideo,
  steerClip,
  chooseTake,
  setCutawayFill,
  checkText,
  saveCharacter,
  importImage,
  importAudio,
  importVideo,
  generateMusic,
  changeMusicTempo,
  generateVoiceover,
  measureVoiceTool,
  transcribeAudioTool,
  getRedaction,
  applyRedaction,
  cancelRedaction,
  setLayoutOnly,
  alignTake,
  startCleanPlate,
  getCleanPlate,
  setCleanPlateMask,
  estimateCleanPlateStep,
  queueCleanPlateStep,
  retryCleanPlateStep,
  openInEditor,
  createEdit,
  updateEdit,
  applyBrand,
  fitMusic,
  renderEdit,
  makeReviewSheet,
  getAssetRights,
  getEditCredits,
  setAssetRights,
  ...PLANNING_TOOLS,
  ...COMPOSITION_TOOLS,
  ...WORK_TOOLS,
];

export function studioTool(name: string): StudioTool | null {
  return STUDIO_TOOLS.find((entry) => entry.name === name) ?? null;
}

/** Whether an operation makes or changes something, and so can be run for a work (workId). */
export function takesWork(entry: StudioTool): boolean {
  return entry.scope !== "read" && !WORK_TOOL_NAMES.has(entry.name);
}

const WORK_ID_SCHEMA = {
  type: "string",
  format: "uuid",
  description:
    "The work this is for (see start_work): what it makes is attached to the work, and goes in the work's project unless you name another.",
};

/** A tool's input as JSON Schema (what an MCP client is told). */
export function toolInputSchema(entry: StudioTool): Json {
  const schema = z.toJSONSchema(entry.input, { io: "input", unrepresentable: "any" }) as Json;
  delete schema["$schema"];
  if (takesWork(entry) && schema["type"] === "object")
    schema["properties"] = { ...((schema["properties"] ?? {}) as Json), workId: WORK_ID_SCHEMA };
  return schema;
}

/**
 * An operation run for a work: in the work's project unless the call names
 * another, and what it made attached to the work (an entry in its journal).
 * The answer says how many things were attached, or why none could be: the
 * operation itself is never undone for it.
 */
export async function runForWork(
  entry: StudioTool,
  args: Json,
  caller: ApiCaller,
  workId: string,
): Promise<unknown> {
  const { workRef, recordCall } = await import("../work/service.server");
  const work = await workRef(workId);
  const input: Json = { ...args };
  const properties = (toolInputSchema(entry)["properties"] ?? {}) as Json;
  if ("projectId" in properties && input["projectId"] === undefined && work.project_id)
    input["projectId"] = work.project_id;
  const result = await entry.run(input, caller);
  const recorded = await recordCall(work.id, actorFor(caller), entry, input, result);
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  return {
    ...(result as Json),
    work: {
      workId: work.id,
      attached: recorded.linked.length,
      ...(recorded.error ? { error: recorded.error } : {}),
    },
  };
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
  if (takesWork(entry) && args && typeof args === "object" && !Array.isArray(args)) {
    const { workId, ...rest } = args as Json;
    if (workId !== undefined && workId !== null) {
      if (typeof workId !== "string" || !/^[0-9a-f-]{36}$/i.test(workId))
        throw new AppError("INVALID_PARAMETERS", "workId: a work's id (a UUID)");
      return runForWork(entry, rest, caller, workId);
    }
    return entry.run(rest, caller);
  }
  return entry.run(args, caller);
}
