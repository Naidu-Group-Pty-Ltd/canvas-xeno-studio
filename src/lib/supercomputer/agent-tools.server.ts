/**
 * The Supercomputer agent's tools: the studio API's operations (see
 * ../studio-api/tools.server), run as the person in the conversation, and a
 * few of the agent's own (looking at pictures, waiting for a generation,
 * proposing drafts, remembering, writing documents, importing a brand).
 *
 * Whatever spends credits is shown to the person before it runs, with the
 * provider's estimate (see ./agent-loop.server), unless it is within what
 * they let it spend without asking. Every spending call carries a request id
 * made from the turn and the tool call, so it can never be billed twice.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";
import type { ModelRegistryEntry } from "../model-schema";
import {
  modelSummary,
  STUDIO_TOOLS,
  toolInputSchema,
  type StudioTool,
} from "../studio-api/tools.server";
import type { ApiCaller } from "../studio-api/tokens.server";
import { aboutUsd, type ApprovalRequest, type ToolUi } from "./agent-events";
import type { AgentThreadSettings } from "./agent-settings";
import type { SupercomputerPayload } from "./types";

type Json = Record<string, unknown>;

export interface AgentContext {
  userId: string;
  threadId: string;
  /** The assistant message this turn writes: request ids are made from it. */
  turnId: string;
  settings: AgentThreadSettings;
  projectId: string | null;
  campaignId: string | null;
  signal: AbortSignal;
}

export type ToolResultContent = string | (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[];

export interface AgentToolOutcome {
  /** What the model reads. */
  content: ToolResultContent;
  isError?: boolean;
  /** One line for people. */
  summary: string;
  ui?: ToolUi | null;
  /** Ideas, drafts and an edit plan to show as cards (propose_drafts). */
  payload?: Partial<SupercomputerPayload>;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Json;
  parse: (input: unknown) => { ok: true; value: Json } | { ok: false; error: string };
  /** What people see the call as. */
  label: (input: Json) => string;
  /** Whether this call spends credits (and so is shown to a person first). */
  spends: (input: Json) => boolean;
  /** What a person approving it is shown. */
  approval?: (input: Json, context: AgentContext) => Promise<Omit<ApprovalRequest, "toolUseId">>;
  run: (input: Json, context: AgentContext, toolUseId: string) => Promise<AgentToolOutcome>;
}

/** The most of a tool's answer the model reads (the rest is cut, and it is told). */
const RESULT_MAX_CHARS = 30_000;

/** A tool's answer as text for the model: JSON, cut to size. */
export function resultText(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  return text.length <= RESULT_MAX_CHARS
    ? text
    : `${text.slice(0, RESULT_MAX_CHARS)}\n… (cut: ${text.length - RESULT_MAX_CHARS} more characters; ask for less, e.g. with a smaller limit)`;
}

/** Where pictures in the conversation are kept: re-signed every time the conversation is sent. */
export const ASSET_URL_PREFIX = "xeno-asset://";
export const assetUrl = (bucket: string, path: string) => `${ASSET_URL_PREFIX}${bucket}/${path}`;

/** A request id for a spending call: the same call never runs twice. */
export function requestKeyFor(turnId: string, toolUseId: string): string {
  return `sc-${turnId.slice(0, 18)}-${toolUseId.replace(/[^\w-]/g, "").slice(-36)}`.slice(0, 64);
}

const caller = (context: AgentContext): ApiCaller => ({
  userId: context.userId,
  tokenId: "supercomputer",
  scopes: new Set(["read", "generate", "edit"]),
});

const text = (value: unknown, max = 300) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

async function modelName(modelId: unknown): Promise<string | null> {
  if (typeof modelId !== "string") return null;
  const { data } = await db
    .from("model_registry")
    .select("display_name")
    .eq("id", modelId)
    .maybeSingle();
  return data?.display_name ?? null;
}

async function characterNames(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || !ids.length) return [];
  const { data } = await db
    .from("characters")
    .select("id,name")
    .in("id", ids.filter((id): id is string => typeof id === "string").slice(0, 8));
  return (data ?? []).map((row) => row.name);
}

/* ------------------------------------------------------------------ */
/* The studio's own operations                                         */
/* ------------------------------------------------------------------ */

/** Studio tools the agent doesn't use (its own versions, or nothing it needs). */
const LEFT_OUT = new Set(["whoami", "list_models"]);

/** Which calls of a studio tool spend credits. */
const SPENDS: Record<string, (input: Json) => boolean> = {
  queue_generation: () => true,
  make_soul_still: () => true,
  train_soul_id: () => true,
  start_presenter_video: () => true,
  steer_long_video: (input) => input["action"] === "continue",
  steer_clip: (input) => input["action"] === "redo" || input["action"] === "retry",
};

const LABELS: Record<string, (input: Json) => string> = {
  list_assets: (input) =>
    input["search"]
      ? `Searching the library for “${text(input["search"], 40)}”`
      : "Looking through the library",
  get_asset: () => "Opening a library file",
  get_generation: () => "Checking a generation",
  get_long_video: () => "Checking a long video",
  get_edit: () => "Opening an edit",
  get_render: () => "Checking a render",
  list_brand_kits: () => "Looking at the brand kits",
  get_brand_kit: () => "Reading a brand's design system",
  list_characters: () => "Looking at the characters",
  get_character: () => "Reading a character",
  queue_generation: () => "Generating",
  make_soul_still: () => "Painting a still from a Soul ID",
  train_soul_id: () => "Training a Soul ID",
  start_presenter_video: () => "Starting a presenter video",
  steer_long_video: (input) => `Long video: ${text(input["action"], 20) || "steering"}`,
  steer_clip: (input) => `Clip: ${text(input["action"], 20) || "steering"}`,
  choose_take: () => "Choosing a take",
  set_cutaway_fill: () => "Filling a cutaway",
  check_text: () => "Checking the lettering",
  open_in_editor: () => "Laying the video out as an edit",
  create_edit: () => "Making an edit",
  update_edit: () => "Changing the edit",
  apply_brand_kit: () => "Applying the brand kit",
  render_edit: () => "Rendering the edit",
};

/** A studio tool's schema as the agent sees it: request ids and projects are the studio's to fill in. */
function agentSchema(entry: StudioTool): Json {
  const schema = toolInputSchema(entry);
  const properties = { ...((schema["properties"] ?? {}) as Json) };
  delete properties["clientRequestId"];
  delete properties["estimatedCostUsd"];
  const required = Array.isArray(schema["required"])
    ? (schema["required"] as string[]).filter(
        (key) => key !== "clientRequestId" && key !== "estimatedCostUsd",
      )
    : [];
  return { ...schema, properties, required };
}

/** What a studio tool made, to show with its call. */
function studioUi(name: string, result: unknown, input: Json): ToolUi | null {
  const item = (result ?? {}) as Json;
  if (
    (name === "queue_generation" || name === "make_soul_still") &&
    typeof item["generationId"] === "string"
  )
    return {
      type: "generation",
      generationId: item["generationId"],
      modelName: null,
      outputType: null,
      prompt:
        text((input["parameters"] as Json | undefined)?.["prompt"] ?? input["scene"], 400) || null,
    };
  if (typeof item["longVideoId"] === "string")
    return {
      type: "long_video",
      longVideoId: item["longVideoId"],
      title: text(item["title"], 120) || null,
    };
  if (
    (name === "create_edit" || name === "open_in_editor") &&
    typeof (item["sequenceId"] ?? item["id"]) === "string"
  )
    return {
      type: "edit",
      sequenceId: String(item["sequenceId"] ?? item["id"]),
      title: text(item["title"], 120) || null,
    };
  if (name === "render_edit" && typeof (item["renderId"] ?? item["id"]) === "string")
    return {
      type: "render",
      renderId: String(item["renderId"] ?? item["id"]),
      sequenceId: typeof input["sequenceId"] === "string" ? input["sequenceId"] : null,
    };
  if (name === "list_characters" && Array.isArray(item["characters"]))
    return {
      type: "characters",
      characters: (item["characters"] as Json[]).slice(0, 12).map((character) => ({
        id: String(character["id"]),
        name: String(character["name"]),
      })),
    };
  if (name === "get_brand_kit" && typeof item["id"] === "string")
    return {
      type: "brand",
      kitId: item["id"],
      name: text(item["name"], 120),
      palette: Array.isArray(item["palette"])
        ? (item["palette"] as Json[]).slice(0, 10).map((colour) => String(colour["hex"]))
        : [],
    };
  return null;
}

function studioSummary(name: string, result: unknown): string {
  const item = (result ?? {}) as Json;
  if (Array.isArray(result)) return `${result.length} found`;
  if (name === "queue_generation" || name === "make_soul_still")
    return item["status"] === "submission_uncertain"
      ? "Sent, but Higgsfield's answer was unclear: it won't be sent again"
      : `Started (${String(item["status"] ?? "queued")})`;
  if (typeof item["status"] === "string") return `Status: ${item["status"]}`;
  if (Array.isArray(item["characters"]))
    return `${(item["characters"] as unknown[]).length} characters`;
  if (typeof item["name"] === "string") return item["name"];
  return "Done";
}

async function approvalFor(
  name: string,
  input: Json,
  context: AgentContext,
): Promise<Omit<ApprovalRequest, "toolUseId">> {
  const reason = "Spends Higgsfield credits";
  if (name === "queue_generation") {
    const parameters = (input["parameters"] ?? {}) as Json;
    const inputs = Array.isArray(input["inputs"]) ? (input["inputs"] as Json[]) : [];
    const [model, cast] = await Promise.all([
      modelName(input["modelId"]),
      characterNames(input["characterIds"]),
    ]);
    let estimateUsd: number | null = null;
    try {
      const { estimateGenerationCost } = await import("../generation-estimate.server");
      const quote = await estimateGenerationCost({
        userId: context.userId,
        modelId: String(input["modelId"]),
        parameters,
        inputs: inputs.map((entry, position) => ({
          assetId: String(entry["assetId"]),
          role: String(entry["role"]),
          position,
        })),
      });
      estimateUsd = quote.ok ? quote.costUsd : null;
    } catch {
      // Unpriced: the card says so.
    }
    const settings = ["aspect_ratio", "duration", "resolution", "quality"]
      .filter((key) => parameters[key] !== undefined && parameters[key] !== null)
      .map((key) => `${key.replace(/_/g, " ")} ${String(parameters[key])}`)
      .join(" · ");
    return {
      title: `Generate with ${model ?? "a model"}`,
      details: [
        { label: "Prompt", value: text(parameters["prompt"], 600) || "(none)" },
        ...(settings ? [{ label: "Settings", value: settings }] : []),
        ...(inputs.length
          ? [{ label: "References", value: `${inputs.length} from the library` }]
          : []),
        ...(cast.length ? [{ label: "Characters", value: cast.join(", ") }] : []),
      ],
      estimateUsd,
      reason,
    };
  }
  if (name === "make_soul_still") {
    const [cast] = await characterNames([input["characterId"]]).then((names) => names);
    return {
      title: `Paint ${cast ?? "a character"} from their Soul ID`,
      details: [
        { label: "Scene", value: text(input["scene"], 600) },
        { label: "Shape", value: text(input["aspectRatio"], 12) || "9:16" },
      ],
      estimateUsd: null,
      reason: "Spends Higgsfield credits (one image)",
    };
  }
  if (name === "train_soul_id") {
    const [cast] = await characterNames([input["characterId"]]);
    return {
      title: `Train ${cast ?? "a character"}'s Soul ID`,
      details: [
        { label: "Soul model", value: text(input["version"], 10) || "v2" },
        {
          label: "Images",
          value: Array.isArray(input["assetIds"])
            ? `${input["assetIds"].length} chosen`
            : "Their default set",
        },
      ],
      estimateUsd: null,
      reason: "Spends Higgsfield credits (a training)",
    };
  }
  if (name === "start_presenter_video")
    return {
      title: `Start the presenter video “${text(input["title"], 80) || "Presenter video"}”`,
      details: [{ label: "Model", value: (await modelName(input["modelId"])) ?? "—" }],
      estimateUsd: null,
      reason: "Spends Higgsfield credits (one clip per piece of the voiceover)",
    };
  return {
    title:
      name === "steer_long_video"
        ? "Continue the long video"
        : `${text(input["action"], 20)} the clip`,
    details: [],
    estimateUsd: null,
    reason,
  };
}

function wrapStudioTool(entry: StudioTool): AgentTool {
  const schema = agentSchema(entry);
  const takesRequestId = !!((toolInputSchema(entry)["properties"] ?? {}) as Json)[
    "clientRequestId"
  ];
  const takesProject = !!((schema["properties"] ?? {}) as Json)["projectId"];
  const takesBrand = !!((schema["properties"] ?? {}) as Json)["brandKitId"];
  return {
    name: entry.name,
    description: entry.description,
    inputSchema: schema,
    parse: (input) => {
      // The studio fills in the request id itself; everything else is checked as given.
      const probe = {
        ...((input ?? {}) as Json),
        ...(takesRequestId ? { clientRequestId: "x".repeat(16) } : {}),
      };
      const checked = entry.input.safeParse(probe);
      return checked.success
        ? { ok: true, value: (input ?? {}) as Json }
        : {
            ok: false,
            error: checked.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          };
    },
    label: (input) => LABELS[entry.name]?.(input) ?? entry.title,
    spends: (input) => SPENDS[entry.name]?.(input) ?? false,
    approval: (input, context) => approvalFor(entry.name, input, context),
    run: async (input, context, toolUseId) => {
      const args: Json = { ...input };
      if (takesRequestId) args["clientRequestId"] = requestKeyFor(context.turnId, toolUseId);
      if (takesProject && args["projectId"] === undefined && context.projectId)
        args["projectId"] = context.projectId;
      // The conversation's brand, unless the call says otherwise (null: none).
      if (takesBrand && args["brandKitId"] === undefined && context.settings.brandKitId)
        args["brandKitId"] = context.settings.brandKitId;
      const result = await entry.run(args, caller(context));
      return {
        content: resultText(result),
        summary: studioSummary(entry.name, result),
        ui: studioUi(entry.name, result, input),
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The agent's own                                                     */
/* ------------------------------------------------------------------ */

function ownTool<S extends z.ZodType>(definition: {
  name: string;
  description: string;
  input: S;
  label: (input: z.output<S>) => string;
  spends?: (input: z.output<S>) => boolean;
  approval?: (
    input: z.output<S>,
    context: AgentContext,
  ) => Promise<Omit<ApprovalRequest, "toolUseId">>;
  run: (input: z.output<S>, context: AgentContext, toolUseId: string) => Promise<AgentToolOutcome>;
}): AgentTool {
  const schema = z.toJSONSchema(definition.input, { io: "input", unrepresentable: "any" }) as Json;
  delete schema["$schema"];
  const parsed = (input: Json) => definition.input.parse(input) as z.output<S>;
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: schema,
    parse: (input) => {
      const checked = definition.input.safeParse(input ?? {});
      return checked.success
        ? { ok: true, value: (input ?? {}) as Json }
        : {
            ok: false,
            error: checked.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          };
    },
    label: (input) => {
      try {
        return definition.label(parsed(input));
      } catch {
        return definition.name;
      }
    },
    spends: (input) => {
      try {
        return definition.spends?.(parsed(input)) ?? false;
      } catch {
        return false;
      }
    },
    ...(definition.approval
      ? {
          approval: (input: Json, context: AgentContext) =>
            definition.approval!(parsed(input), context),
        }
      : {}),
    run: (input, context, toolUseId) => definition.run(parsed(input), context, toolUseId),
  };
}

const uuid = () => z.string().uuid();

const listModels = ownTool({
  name: "list_models",
  description:
    "The generation models the studio offers, compactly: id, name, what it makes, what it's best for, the media inputs it takes (by role), its prompt limit, its settings with allowed values, and for video models how long their clips run and whether they can make long videos. Filter by output or words in the name.",
  input: z.object({
    output: z.enum(["image", "video", "audio"]).optional(),
    search: z.string().max(80).optional(),
  }),
  label: (input) =>
    input.output ? `Looking at the ${input.output} models` : "Looking at the models",
  run: async (input) => {
    const agent = await import("./agent.server");
    const models = await agent.activeModels();
    const words = input.search?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const chosen = models
      .filter((model) => !input.output || model.output_type === input.output)
      .filter((model) =>
        words.every((word) =>
          `${model.display_name} ${model.model_path}`.toLowerCase().includes(word),
        ),
      );
    const cards = agent.compactCatalogue(chosen, { longVideo: true });
    return {
      content: resultText(cards),
      summary: `${cards.length} models`,
      ui: {
        type: "models",
        models: chosen.slice(0, 24).map((model) => ({
          id: model.id,
          name: model.display_name,
          output: model.output_type,
        })),
      },
    };
  },
});

const getModel = ownTool({
  name: "get_model",
  description:
    "One model in full: every input role and parameter with its type, options, range and default. Use before setting parameters the compact list doesn't show.",
  input: z.object({ modelId: uuid() }),
  label: () => "Reading a model's settings",
  run: async (input) => {
    const { data } = await db
      .from("model_registry")
      .select("*")
      .eq("id", input.modelId)
      .maybeSingle();
    if (!data?.is_active) throw new AppError("INVALID_PARAMETERS", "That model is unavailable");
    const summary = modelSummary(data as unknown as ModelRegistryEntry);
    return { content: resultText(summary), summary: summary.name };
  },
});

const viewMedia = ownTool({
  name: "view_media",
  description:
    "Look at library files: images as they are, videos by their poster frame. Use it to judge a generation, describe a reference, or check a character or a product before you write about it. Up to 6 at once.",
  input: z.object({ assetIds: z.array(uuid()).min(1).max(6) }),
  label: (input) =>
    `Looking at ${input.assetIds.length === 1 ? "a picture" : `${input.assetIds.length} pictures`}`,
  run: async (input) => {
    const { data: rows } = await db
      .from("assets")
      .select(
        "id,asset_type,storage_bucket,storage_path,title,mime_type,metadata,width,height,duration_seconds",
      )
      .in("id", input.assetIds)
      .is("deleted_at", null);
    const agent = await import("./agent.server");
    const content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];
    const shown: Extract<ToolUi, { type: "assets" }>["assets"] = [];
    for (const id of input.assetIds) {
      const row = (rows ?? []).find((entry) => entry.id === id);
      if (!row) {
        content.push({ type: "text", text: `${id}: not in the library` });
        continue;
      }
      const source = agent.visionSourceFor(row);
      const facts = `${row.id} · ${row.asset_type} · "${row.title ?? "untitled"}"${row.width && row.height ? ` · ${row.width}×${row.height}` : ""}${row.duration_seconds ? ` · ${Number(row.duration_seconds).toFixed(1)}s` : ""}`;
      if (!source) {
        content.push({ type: "text", text: `${facts}: nothing to look at (no picture for it)` });
        continue;
      }
      content.push({
        type: "text",
        text: row.asset_type === "video" ? `${facts} (its poster frame):` : `${facts}:`,
      });
      content.push({
        type: "image",
        source: { type: "url", url: assetUrl(source.bucket, source.path) },
      });
      shown.push({
        id: row.id,
        kind: row.asset_type as "image" | "video" | "audio",
        title: row.title,
        bucket: row.storage_bucket,
        path: row.storage_path,
        poster: row.asset_type === "video" ? source.path : null,
      });
    }
    return {
      content,
      summary: `${shown.length} looked at`,
      ui: shown.length ? { type: "assets", assets: shown } : null,
    };
  },
});

const TERMINAL = new Set([
  "completed",
  "failed",
  "canceled",
  "cancelled",
  "nsfw",
  "submission_uncertain",
]);

const waitForGeneration = ownTool({
  name: "wait_for_generation",
  description:
    "Waits for a generation to finish (or up to timeoutSeconds) and gives its status and the library files it made. Images usually take under a minute; videos several minutes, so for a video wait once and, if it isn't done, tell the person it will appear in the conversation when it is.",
  input: z.object({
    generationId: uuid(),
    timeoutSeconds: z.number().int().min(5).max(150).default(75),
  }),
  label: () => "Waiting for the result",
  run: async (input, context) => {
    const until = Date.now() + input.timeoutSeconds * 1000;
    for (;;) {
      const { data: generation } = await db
        .from("generations")
        .select("id,status,error_message,model_path,actual_cost_usd,estimated_cost_usd")
        .eq("id", input.generationId)
        .maybeSingle();
      if (!generation) throw new AppError("INVALID_PARAMETERS", "That generation doesn't exist");
      const { data: outputs } = await db
        .from("assets")
        .select(
          "id,asset_type,title,storage_bucket,storage_path,width,height,duration_seconds,metadata",
        )
        .eq("generation_id", input.generationId)
        .is("deleted_at", null);
      const done = TERMINAL.has(generation.status) || (outputs ?? []).length > 0;
      if (done || Date.now() >= until || context.signal.aborted) {
        const files = (outputs ?? []).map((row) => ({
          id: row.id,
          kind: row.asset_type as "image" | "video" | "audio",
          title: row.title,
          bucket: row.storage_bucket,
          path: row.storage_path,
          poster:
            row.asset_type === "video"
              ? ((((row.metadata ?? {}) as Json)["poster_path"] as string | undefined) ?? null)
              : null,
        }));
        return {
          content: resultText({
            status: generation.status,
            done,
            error: generation.error_message,
            costUsd: generation.actual_cost_usd ?? generation.estimated_cost_usd,
            outputs: (outputs ?? []).map((row) => ({
              assetId: row.id,
              type: row.asset_type,
              width: row.width,
              height: row.height,
              seconds: row.duration_seconds,
            })),
            ...(done
              ? {}
              : { note: "Still working: it appears in the conversation when it is done." }),
          }),
          summary: done
            ? files.length
              ? `Done: ${files.length} ${files.length === 1 ? "file" : "files"}`
              : `Ended: ${generation.status}`
            : "Still working",
          ui: files.length ? { type: "assets", assets: files } : null,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  },
});

const proposeDrafts = ownTool({
  name: "propose_drafts",
  description:
    "Proposes ready-to-run drafts the person can look over, tweak, price and run themselves: one per asset to make, each with a model, prompt, settings, references and characters; a long video as one draft with long_video; optionally ideas (distinct concepts) and an edit plan that cuts several drafts into one video. Use it for deliverables, variations to choose from, and long videos.",
  input: z.object({
    ideas: z.array(z.record(z.string(), z.unknown())).max(8).optional(),
    drafts: z.array(z.record(z.string(), z.unknown())).max(12).optional(),
    edit_plan: z.record(z.string(), z.unknown()).optional(),
  }),
  label: (input) =>
    input.drafts?.length
      ? `Writing ${input.drafts.length} ${input.drafts.length === 1 ? "draft" : "drafts"}`
      : "Writing ideas",
  run: async (input) => {
    const agent = await import("./agent.server");
    const { charactersForAgent } = await import("../characters/service.server");
    const [models, characters] = await Promise.all([agent.activeModels(), charactersForAgent()]);
    // Any library file a draft names may be used, once it is found in the library.
    const named = new Set<string>();
    for (const draft of input.drafts ?? []) {
      for (const reference of Array.isArray(draft["references"])
        ? (draft["references"] as Json[])
        : [])
        if (typeof reference["asset_id"] === "string") named.add(reference["asset_id"]);
      const finisher = ((draft["long_video"] ?? {}) as Json)["finisher"] as Json | undefined;
      if (typeof finisher?.["asset_id"] === "string") named.add(finisher["asset_id"]);
    }
    const ids = [...named].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 60);
    const { data: rows } = ids.length
      ? await db.from("assets").select("id,asset_type,title").in("id", ids).is("deleted_at", null)
      : { data: [] as { id: string; asset_type: string; title: string | null }[] };
    const allowed = new Map(
      (rows ?? []).map((row) => [
        row.id,
        { id: row.id, type: row.asset_type as "image" | "video" | "audio", title: row.title },
      ]),
    );
    const ideas = agent.normalizeIdeas(input.ideas ?? []);
    const { drafts, dropped, indexMap } = agent.normalizeDrafts(
      input.drafts ?? [],
      models,
      allowed,
      {
        characters,
      },
    );
    const shotMap = indexMap.map((index) =>
      index !== null && !drafts[index]?.longVideo ? index : null,
    );
    const editPlan =
      shotMap.filter((index) => index !== null).length > 1
        ? agent.normalizeEditPlan(input.edit_plan, shotMap)
        : undefined;
    const lines = [
      ...drafts.map(
        (draft, index) =>
          `Draft ${index + 1}: "${draft.title}" on ${draft.modelName}${draft.longVideo ? ` (long video, ${draft.longVideo.durations.length} clips)` : ""}${draft.issues.length ? ` — issues: ${draft.issues.join("; ")}` : ""}`,
      ),
      ...dropped.map((reason) => `Dropped: ${reason}`),
      ideas.length ? `${ideas.length} ideas shown.` : "",
      editPlan ? "Edit plan shown." : "",
    ].filter(Boolean);
    return {
      content: lines.length
        ? lines.join("\n")
        : "Nothing valid to show: check the models and inputs.",
      isError: !drafts.length && !ideas.length,
      summary: drafts.length
        ? `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} ready to run${dropped.length ? `, ${dropped.length} dropped` : ""}`
        : `${ideas.length} ideas`,
      ui: { type: "drafts", count: drafts.length },
      payload: {
        ...(ideas.length ? { ideas } : {}),
        ...(drafts.length ? { drafts } : {}),
        ...(editPlan ? { editPlan } : {}),
        ...(dropped.length ? { dropped } : {}),
      },
    };
  },
});

const remember = ownTool({
  name: "remember",
  description:
    "Keeps a durable preference or fact for later conversations: the person's own (personal), or the whole team's (team). Short, specific and only what will matter again.",
  input: z.object({
    content: z.string().min(3).max(600),
    scope: z.enum(["personal", "team"]).default("personal"),
  }),
  label: () => "Remembering",
  run: async (input, context) => {
    const { data, error } = await db
      .from("supercomputer_memories")
      .insert({
        content: input.content.trim(),
        scope: input.scope,
        thread_id: context.threadId,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !data) throw new AppError("UNKNOWN", "It couldn't be remembered just now");
    return {
      content: `Remembered (memory ${data.id}).`,
      summary: input.content.slice(0, 120),
      ui: { type: "memory", content: input.content, scope: input.scope },
    };
  },
});

const forget = ownTool({
  name: "forget",
  description:
    "Forgets a memory that is wrong or out of date, by its id (the memories are listed with the conversation).",
  input: z.object({ memoryId: uuid() }),
  label: () => "Forgetting",
  run: async (input, context) => {
    const { data: memory } = await db
      .from("supercomputer_memories")
      .select("id,created_by,scope,content")
      .eq("id", input.memoryId)
      .maybeSingle();
    if (!memory) throw new AppError("INVALID_PARAMETERS", "That memory doesn't exist");
    if (memory.created_by !== context.userId && memory.scope !== "team")
      throw new AppError("NOT_AUTHORIZED", "That memory isn't this person's");
    await db.from("supercomputer_memories").delete().eq("id", input.memoryId);
    return { content: "Forgotten.", summary: memory.content.slice(0, 120) };
  },
});

const writeDocument = ownTool({
  name: "write_document",
  description:
    "Shows a long piece of writing beside the conversation, to copy or download: a script, a shot list, a campaign plan, a brief, a report. Markdown.",
  input: z.object({ title: z.string().min(1).max(120), markdown: z.string().min(1).max(60_000) }),
  label: (input) => `Writing “${input.title}”`,
  run: async (input) => ({
    content: `The document “${input.title}” is shown beside the conversation.`,
    summary: input.title,
    ui: { type: "document", title: input.title, markdown: input.markdown },
  }),
});

const importBrand = ownTool({
  name: "import_brand",
  description:
    "Reads a brand's design system from its website: its colours (by how much it uses them), typefaces, logo, imagery and voice. Takes a minute or so. The result waits on the Brand page for the person to review and keep as a brand kit.",
  input: z.object({ url: z.string().min(3).max(2000) }),
  label: (input) => `Reading ${text(input.url, 60)}`,
  run: async (input, context) => {
    const { createImport, scanWebsite, siteUrlOf, loadImport } =
      await import("../brand/imports.server");
    const url = siteUrlOf(input.url);
    if (!url) throw new AppError("INVALID_PARAMETERS", "That isn't a website address");
    const importId = await createImport({
      userId: context.userId,
      kind: "url",
      sourceUrl: url,
      sourceTitle: null,
    });
    await scanWebsite(importId, url);
    const row = await loadImport(importId);
    const { proposalOf } = await import("../brand/proposal");
    const proposal = proposalOf(row?.proposal);
    if (!proposal) throw new AppError("UNKNOWN", "The brand couldn't be read");
    return {
      content: resultText({
        importId,
        name: proposal.name,
        palette: proposal.palette.map((colour) => `${colour.name} ${colour.hex} (${colour.role})`),
        typefaces: proposal.fonts.map(
          (font) => `${font.role}: ${font.family}${font.installed ? "" : " (not installed)"}`,
        ),
        look: proposal.design.promptStyle,
        mood: proposal.design.visual.mood,
        voice: proposal.design.voice.tone,
        notes: proposal.notes,
        review: "The person reviews it on the Brand page and keeps it as a kit.",
      }),
      summary: `${proposal.name}: ${proposal.palette.length} colours, ready to review`,
      ui: {
        type: "brand_import",
        importId,
        name: proposal.name,
        palette: proposal.palette.map((colour) => colour.hex),
      },
    };
  },
});

const estimate = ownTool({
  name: "estimate_generation",
  description:
    "The provider's estimate for a generation, without making it: the same model, parameters and inputs queue_generation would take.",
  input: z.object({
    modelId: uuid(),
    parameters: z.record(z.string(), z.unknown()),
    inputs: z
      .array(z.object({ assetId: uuid(), role: z.string().min(1).max(40) }))
      .max(20)
      .default([]),
  }),
  label: () => "Pricing it",
  run: async (input, context) => {
    const { estimateGenerationCost } = await import("../generation-estimate.server");
    const quote = await estimateGenerationCost({
      userId: context.userId,
      modelId: input.modelId,
      parameters: input.parameters,
      inputs: input.inputs.map((entry, position) => ({ ...entry, position })),
    });
    return {
      content: resultText(quote),
      summary: quote.ok
        ? quote.costUsd !== null
          ? aboutUsd(quote.costUsd)
          : (quote.pricingDescription ?? "Metered")
        : (quote.message ?? "Couldn't be priced"),
    };
  },
});

/* ------------------------------------------------------------------ */
/* The set                                                             */
/* ------------------------------------------------------------------ */

let tools: AgentTool[] | null = null;

/** Every tool, in a fixed order (a changed order would change every conversation's prompt). */
export function agentTools(): AgentTool[] {
  if (!tools)
    tools = [
      listModels,
      getModel,
      ...STUDIO_TOOLS.filter((entry) => !LEFT_OUT.has(entry.name)).map(wrapStudioTool),
      viewMedia,
      waitForGeneration,
      estimate,
      proposeDrafts,
      writeDocument,
      importBrand,
      remember,
      forget,
    ];
  return tools;
}

export function agentTool(name: string): AgentTool | undefined {
  return agentTools().find((entry) => entry.name === name);
}

/** The tools as the Messages API takes them: the studio's, then the web's. */
export function apiTools(): Anthropic.Messages.ToolUnion[] {
  return [
    ...agentTools().map((entry): Anthropic.Tool => ({
      name: entry.name,
      description: entry.description,
      input_schema: entry.inputSchema as Anthropic.Tool.InputSchema,
      eager_input_streaming: true,
    })),
    { type: "web_search_20260209", name: "web_search", max_uses: 8 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
  ];
}
