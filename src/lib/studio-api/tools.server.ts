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
import { parseTimeline, timelineSchema } from "../edit/timeline";
import { textCheckOf } from "../media/text-check";
import { CHARACTER_VIEWS } from "../characters/model";
import type { ModelRegistryEntry } from "../model-schema";
import type { ApiScope } from "./tokens";
import type { ApiCaller } from "./tokens.server";
import { PLANNING_TOOLS } from "./planning.server";

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
          .is("deleted_at", null)
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
    "The team's brand kits: each brand's fonts, colours, logo, end card, tagline, call to action, the names captions spell right, its design system (palette with roles, the look of its imagery, voice and rules), what kind of brand it is, and the formulas written for it by name (get_brand_kit has its whole DNA). Pass a kit's id as brandKitId to queue_generation to make a picture or clip in its look.",
  scope: "read",
  input: z.object({}),
  run: async () => {
    const { data, error } = await db.from("brand_kits").select("*").eq("is_archived", false);
    if (error) return [];
    const { brandStyleLine } = await import("../brand/design");
    return (data ?? []).map((row) => {
      // A kit's whole DNA and its formulas run to thousands of characters each: a list of kits
      // says what kind of brand each is and names its formulas; get_brand_kit has the rest.
      const { fonts, design, dna, ownFormulas, ...kit } = brandKitOf(row as unknown as Json);
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
    "One brand kit's whole design system: palette (each colour's role and use), typefaces, the look of its imagery (mood, photography, lighting, grading, composition, motion), its voice (tone, sample lines, words it uses and avoids), its rules, the line generations carry and what they must not show, and its style reference images.",
  scope: "read",
  input: z.object({ brandKitId: id() }),
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
    };
  },
});

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
    "Puts a picture into the studio's library, from its bytes (data, base64) or a public https address (url): a typeset screen plate, a logo, a reference someone supplied. PNG, JPEG, WebP or GIF, up to 15 MB. It can then be a generation's input, a character's image or an edit's overlay. The same clientRequestId returns the first import instead of a second copy.",
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
  }),
  run: async (args, caller) => {
    await roleOf(caller.userId);
    if (!args.data === !args.url)
      throw new AppError("INVALID_PARAMETERS", "Give the picture as data or as a url, not both");
    const { data: before } = await db
      .from("assets")
      .select("id,width,height,mime_type")
      .eq("uploaded_by", caller.userId)
      .contains("metadata", { client_request_id: args.clientRequestId })
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
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
    return {
      assetId: row.id,
      imported: true,
      width: size?.width ?? null,
      height: size?.height ?? null,
      mimeType: kind.mime,
    };
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
  getBrandKit,
  readBrandCode,
  listBrandFormulas,
  getBrandFormula,
  listCharacters,
  getCharacter,
  estimateGeneration,
  queueGeneration,
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
  openInEditor,
  createEdit,
  updateEdit,
  applyBrand,
  renderEdit,
  ...PLANNING_TOOLS,
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
