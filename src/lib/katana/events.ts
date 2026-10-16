/**
 * Reading a Katana session's events: what goes into the run's progress, which
 * paid calls wait for the credit guard, which jobs a call made, what Katana
 * delivered and where the session stands. Pure: the service applies it.
 */
import type { BetaManagedAgentsSessionEventType } from "@anthropic-ai/sdk/resources/beta/sessions/events";
import {
  classifyGuardedCall,
  quoteCredits,
  readParams,
  submittedJobIds,
  formatCredits,
} from "./guard";
import { isGuardedTool } from "./agent";
import { findAll, isObject, isUuid, parseJsonText, type JsonObject } from "./mcp";
import { parseResultLine, parseResumeLine, visibleText } from "./messages";

/** The session event types the studio reads (the rest are deltas, spans and echoes). */
export const KATANA_EVENT_TYPES: BetaManagedAgentsSessionEventType[] = [
  "agent.message",
  "agent.mcp_tool_use",
  "agent.mcp_tool_result",
  "agent.thread_context_compacted",
  "session.status_running",
  "session.status_idle",
  "session.status_rescheduled",
  "session.status_terminated",
  "session.error",
  "session.usage",
];

export interface SessionEventLike {
  id: string;
  type: string;
  processed_at?: string | null;
  [key: string]: unknown;
}

export type FeedKind =
  "message" | "step" | "credit" | "status" | "error" | "result" | "user" | "note";

export interface FeedEntry {
  sourceId: string;
  kind: FeedKind;
  title: string;
  body: string;
  data: JsonObject;
  occurredAt: string;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
  permission: string | null;
}

export interface ToolResultEntry {
  toolUseId: string;
  tool: string | null;
  input: unknown;
  payload: unknown;
  text: string;
  isError: boolean;
}

export interface ResultCandidate {
  mediaId: string | null;
  url: string | null;
  via: string;
}

export type SessionState =
  | { kind: "running" }
  | { kind: "idle"; stop: string; eventIds: string[]; refusal: string | null }
  | { kind: "terminated" }
  | { kind: "deleted" };

export interface EventEffects {
  feed: FeedEntry[];
  /** Guarded calls held for the studio's answer. */
  asks: ToolUse[];
  toolResults: ToolResultEntry[];
  results: ResultCandidate[];
  /** Media IDs Katana's tools reported with their file URLs. */
  knownMedia: Record<string, string>;
  resumeLine: string | null;
  /** Katana's last message (without the lines meant for the studio). */
  summary: string | null;
  /** Why Katana said it stopped without a video, when it did. */
  noResult: string | null;
  state: SessionState | null;
  claudeCostCents: number | null;
  /** Higgsfield refused the session's sign-in (the vault's token lapsed). */
  mcpAuthFailed: boolean;
  lastEventAt: string | null;
}

function textBlocks(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block) => isObject(block) && block["type"] === "text" && typeof block["text"] === "string",
    )
    .map((block) => (block as JsonObject)["text"] as string)
    .join("\n");
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+$/g, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** How a paid call reads when its settings aren't known (an earlier pass's call). */
const GUARDED_TITLES: Record<string, string> = {
  generate_image: "Generating an image",
  generate_video: "Generating a video",
  generate_audio: "Generating audio",
  generate_image_batch: "Generating images",
  generate_video_batch: "Generating videos",
  generate_audio_batch: "Generating audio",
  remove_background: "Removing a background",
  get_katana_config: "Starting the preset's run",
};

/** How a tool call reads in the run's progress. */
export function describeToolUse(name: string, input: unknown): { title: string; body: string } {
  const args = isObject(input) ? input : {};
  if (isGuardedTool(name)) {
    const call = classifyGuardedCall(name, input);
    if (call.kind === "quote") {
      const noun =
        call.tool === "generate_image"
          ? "an image"
          : call.tool === "generate_audio"
            ? "audio"
            : "a video";
      return { title: `Pricing ${noun}`, body: call.model ?? "" };
    }
    if (call.kind === "submit") {
      const noun =
        call.quoteTool === "generate_image"
          ? "image"
          : call.quoteTool === "generate_audio"
            ? "audio"
            : "video";
      const models = [
        ...new Set(call.items.map((item) => str(item.params["model"])).filter(Boolean)),
      ].join(", ");
      const first = call.items[0]?.params ?? {};
      const settings = [
        str(first["resolution"]),
        first["duration"] ? `${String(first["duration"])} s` : null,
        str(first["aspect_ratio"]),
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        title:
          call.items.length > 1
            ? `Generating ${call.items.length} ${noun}s`
            : `Generating ${noun === "audio" ? "audio" : `a ${noun}`}`,
        body: [models, call.items.length === 1 ? settings : ""].filter(Boolean).join(" · "),
      };
    }
    if (call.kind === "estimate")
      return {
        title: "Removing a background",
        body: str(args["params"] && (args["params"] as JsonObject)["media_type"]) ?? "",
      };
    if (call.kind === "preset_session")
      return { title: "Starting the preset's run", body: call.preset ?? "" };
    return { title: GUARDED_TITLES[name] ?? name, body: "" };
  }
  switch (name) {
    case "sandbox_exec": {
      const command = str(args["command"]) ?? "";
      const firstLine = command.split("\n").find((line) => line.trim()) ?? "";
      const images = Array.isArray(args["image_paths"]) ? args["image_paths"].length : 0;
      return {
        title: images
          ? `Looking at ${images} frame${images === 1 ? "" : "s"}`
          : "Working in Higgsfield's sandbox",
        body: truncate(firstLine.trim(), 200),
      };
    }
    case "get_workflow_instructions":
      return { title: "Reading Katana's instructions", body: str(args["workflow"]) ?? "" };
    case "get_workflow_bundle_file":
      return { title: "Reading Katana's notes", body: str(args["path"]) ?? "" };
    case "get_preset_instructions":
      return { title: "Reading the preset's instructions", body: str(args["preset"]) ?? "" };
    case "get_presets":
      return { title: "Looking at Katana presets", body: "" };
    case "jobs_wait": {
      const jobs = Array.isArray(args["jobs"]) ? args["jobs"].length : 0;
      return { title: `Waiting for ${jobs || "its"} job${jobs === 1 ? "" : "s"}`, body: "" };
    }
    case "media_upload":
    case "media_confirm":
      return { title: "Uploading media to Higgsfield", body: "" };
    case "media_import_url":
      return { title: "Bringing in media", body: "" };
    case "show_result":
    case "show_katana_result":
      return { title: "Delivering the finished video", body: "" };
    case "register_katana_result":
      return { title: "Saving the video to Higgsfield's history", body: "" };
    case "balance":
      return { title: "Checking the credit balance", body: "" };
    case "transactions":
      return { title: "Checking credit transactions", body: "" };
    case "models_explore":
      return {
        title: "Checking a model's settings",
        body: str(args["model"]) ?? str(args["action"]) ?? "",
      };
    case "show_generations":
    case "show_generation_by_ids":
    case "show_medias":
      return { title: "Looking up results", body: "" };
    default:
      return { title: name.replace(/_/g, " "), body: "" };
  }
}

/** Higgsfield tools whose answers name media files (and whose URLs the studio may trust). */
export const MEDIA_TOOLS = new Set([
  "media_upload",
  "media_confirm",
  "media_import_url",
  "show_medias",
  "show_result",
  "show_katana_result",
  "register_katana_result",
  "jobs_wait",
  "show_generations",
  "show_generation_by_ids",
]);

/** A generation call that only asks for its price. */
export function isQuote(name: string, input: unknown): boolean {
  if (name !== "generate_image" && name !== "generate_video" && name !== "generate_audio")
    return false;
  const params = readParams(isObject(input) ? input["params"] : null);
  return params?.["get_cost"] === true;
}

/** Media IDs and the file URLs a tool's answer pairs them with. */
export function mediaUrls(payload: unknown): Record<string, string> {
  const found: Record<string, string> = {};
  const urlKeys = ["url", "file_url", "media_url", "result_url", "download_url", "video_url"];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const value = node as JsonObject;
    const id = [value["media_id"], value["id"]].find(isUuid);
    const url = urlKeys
      .map((key) => value[key])
      .find((entry) => typeof entry === "string" && /^https:\/\//i.test(entry));
    if (id && typeof url === "string") found[id] = url;
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(payload, 0);
  return found;
}

/** What a delivering call (show_result and its kin) names as the final video. */
export function deliveredBy(name: string, input: unknown): ResultCandidate | null {
  if (name !== "show_result" && name !== "show_katana_result" && name !== "register_katana_result")
    return null;
  const args = isObject(input) ? input : {};
  if (name === "show_result" && args["action"] !== "katana_video") return null;
  const mediaId = isUuid(args["media_id"]) ? args["media_id"] : null;
  const url =
    typeof args["url"] === "string" && /^https:\/\//i.test(args["url"]) ? args["url"] : null;
  if (!mediaId && !url) return null;
  return { mediaId, url, via: name };
}

function centsOf(usage: unknown): number | null {
  if (!isObject(usage)) return null;
  const cost = usage["list_cost"];
  if (!isObject(cost)) return null;
  const amount = Number(cost["amount"]);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

/**
 * The effects of a batch of a session's events, in order. `toolOf` names an
 * earlier call (from a previous batch) that a result answers.
 */
export function interpretEvents(
  events: SessionEventLike[],
  toolOf: (toolUseId: string) => { name: string; input: unknown } | null,
): EventEffects {
  const effects: EventEffects = {
    feed: [],
    asks: [],
    toolResults: [],
    results: [],
    knownMedia: {},
    resumeLine: null,
    summary: null,
    noResult: null,
    state: null,
    claudeCostCents: null,
    mcpAuthFailed: false,
    lastEventAt: null,
  };
  const uses = new Map<string, { name: string; input: unknown }>();

  for (const event of events) {
    const at = event.processed_at ?? new Date().toISOString();
    effects.lastEventAt = event.processed_at ?? effects.lastEventAt;
    switch (event.type) {
      case "agent.message": {
        const text = textBlocks(event["content"]);
        const resume = parseResumeLine(text);
        if (resume) effects.resumeLine = resume;
        const result = parseResultLine(text);
        if (result?.delivered)
          effects.results.push({ mediaId: result.mediaId, url: result.url, via: "message" });
        else if (result && !result.delivered)
          effects.noResult = (result.reason ?? "Katana stopped without a finished video.").slice(
            0,
            1000,
          );
        const visible = visibleText(text);
        if (visible) {
          effects.summary = visible;
          effects.feed.push({
            sourceId: event.id,
            kind: "message",
            title: "Katana",
            body: truncate(visible, 8000),
            data: {},
            occurredAt: at,
          });
        }
        break;
      }
      case "agent.mcp_tool_use": {
        const name = str(event["name"]) ?? "tool";
        const input = event["input"];
        uses.set(event.id, { name, input });
        const permission = str(event["evaluated_permission"]);
        if (permission === "ask") effects.asks.push({ id: event.id, name, input, permission });
        const delivered = deliveredBy(name, input);
        const { title, body } = describeToolUse(name, input);
        effects.feed.push({
          sourceId: event.id,
          kind: "step",
          title,
          body,
          data: {
            tool: name,
            ...(isQuote(name, input) ? { quote: true } : {}),
            // A delivery counts once its call succeeds; kept so a later pass can match its result.
            ...(delivered ? { delivery: { media_id: delivered.mediaId, url: delivered.url } } : {}),
            ...(permission === "deny" ? { refused: true } : {}),
          },
          occurredAt: at,
        });
        break;
      }
      case "agent.mcp_tool_result": {
        const useId = str(event["mcp_tool_use_id"]);
        if (!useId) break;
        const use = uses.get(useId) ?? toolOf(useId);
        const text = textBlocks(event["content"]);
        const payload = parseJsonText(text) ?? (text ? { text } : null);
        const isError = event["is_error"] === true;
        effects.toolResults.push({
          toolUseId: useId,
          tool: use?.name ?? null,
          input: use?.input ?? null,
          payload,
          text,
          isError,
        });
        // File addresses are taken only from Higgsfield's own media answers, never from
        // sandbox output (which can print anything).
        if (use && MEDIA_TOOLS.has(use.name)) Object.assign(effects.knownMedia, mediaUrls(payload));
        if (!isError && use) {
          const delivered = deliveredBy(use.name, use.input);
          if (delivered) effects.results.push(delivered);
        }
        if (isError) {
          effects.feed.push({
            sourceId: event.id,
            kind: "error",
            title: `${use ? describeToolUse(use.name, use.input).title : "A step"} didn't work`,
            body: truncate(text, 1200),
            data: { tool: use?.name ?? null },
            occurredAt: at,
          });
          break;
        }
        if (use && isQuote(use.name, use.input)) {
          const params = readParams(isObject(use.input) ? use.input["params"] : null);
          const credits = quoteCredits(payload);
          effects.feed.push({
            sourceId: event.id,
            kind: "credit",
            title:
              credits === null
                ? "Higgsfield gave no price"
                : `Higgsfield quoted ${formatCredits(credits)} credits`,
            body: str(params?.["model"]) ?? "",
            data: { quote: credits },
            occurredAt: at,
          });
          break;
        }
        if (use && (use.name.startsWith("generate_") || use.name === "remove_background")) {
          const jobs = submittedJobIds(payload);
          if (jobs.length)
            effects.feed.push({
              sourceId: event.id,
              kind: "note",
              title: `${jobs.length} job${jobs.length === 1 ? "" : "s"} started on Higgsfield`,
              body: "",
              data: { jobs },
              occurredAt: at,
            });
        }
        break;
      }
      case "agent.thread_context_compacted":
        effects.feed.push({
          sourceId: event.id,
          kind: "note",
          title: "Katana condensed its notes to keep going",
          body: "",
          data: {},
          occurredAt: at,
        });
        break;
      case "session.status_running":
      case "session.status_rescheduled":
        effects.state = { kind: "running" };
        break;
      case "session.status_idle": {
        const stop = isObject(event["stop_reason"]) ? event["stop_reason"] : {};
        const stopType = str(stop["type"]) ?? "end_turn";
        const eventIds = Array.isArray(stop["event_ids"])
          ? (stop["event_ids"] as unknown[]).filter((id): id is string => typeof id === "string")
          : [];
        const details = isObject(event["stop_details"]) ? event["stop_details"] : null;
        effects.state = {
          kind: "idle",
          stop: stopType,
          eventIds,
          refusal: details ? str(details["explanation"]) : null,
        };
        if (stopType === "budget_reached") {
          effects.feed.push({
            sourceId: event.id,
            kind: "status",
            title: "Paused: the run's Claude budget is used up",
            body: "Raise the budget to let it carry on.",
            data: {},
            occurredAt: at,
          });
        } else if (stopType === "retries_exhausted") {
          effects.feed.push({
            sourceId: event.id,
            kind: "error",
            title: "Katana stopped after repeated errors",
            body: "",
            data: {},
            occurredAt: at,
          });
        } else if (stopType === "refusal") {
          effects.feed.push({
            sourceId: event.id,
            kind: "error",
            title: "Claude declined to continue this run",
            body: effects.state.refusal ?? "",
            data: {},
            occurredAt: at,
          });
        }
        break;
      }
      case "session.status_terminated":
        effects.state = { kind: "terminated" };
        effects.feed.push({
          sourceId: event.id,
          kind: "status",
          title: "The session ended",
          body: "",
          data: {},
          occurredAt: at,
        });
        break;
      case "session.deleted":
        effects.state = { kind: "deleted" };
        break;
      case "session.error": {
        const error = isObject(event["error"]) ? event["error"] : {};
        const type = str(error["type"]) ?? "error";
        const message = str(error["message"]) ?? type;
        if (/mcp_authentication/i.test(type)) effects.mcpAuthFailed = true;
        effects.feed.push({
          sourceId: event.id,
          kind: "error",
          title: errorTitle(type),
          body: truncate(message, 1200),
          data: { type },
          occurredAt: at,
        });
        break;
      }
      case "session.usage": {
        const cents = centsOf(event["usage"]);
        if (cents !== null) effects.claudeCostCents = cents;
        break;
      }
      default:
        break;
    }
  }
  return effects;
}

function errorTitle(type: string): string {
  if (/mcp_authentication/i.test(type)) return "Higgsfield refused the session's sign-in";
  if (/mcp_connection/i.test(type)) return "Higgsfield couldn't be reached";
  if (/overloaded/i.test(type)) return "Claude was busy; retrying";
  if (/rate_limited/i.test(type)) return "Claude rate limit; retrying";
  if (/billing/i.test(type)) return "Anthropic billing problem";
  return "Something went wrong in the session";
}

/** True when a findAll over a payload names any of `keys` (a tool answered with an error shape). */
export function mentions(payload: unknown, keys: string[]): boolean {
  return keys.some((key) => findAll(payload, key).length > 0);
}
