/**
 * The studio's credit guard for Katana runs. Every paid call a run asks to
 * make is read here, priced with Higgsfield's own quote for exactly those
 * settings (by the studio, not by the agent), and allowed only while the run's
 * credit limit has room. Pure: pricing is passed in.
 */
import { findAll, isObject, type JsonObject } from "./mcp";

export type GenerationTool = "generate_image" | "generate_video" | "generate_audio";

export interface GuardItem {
  index: number;
  params: JsonObject;
}

export type GuardCall =
  /** A price check (params.get_cost: true): it makes no job and costs nothing. */
  | { kind: "quote"; tool: GenerationTool; model: string | null }
  /** Jobs to submit: one for a single call, up to twelve for a batch. */
  | { kind: "submit"; tool: string; quoteTool: GenerationTool; items: GuardItem[] }
  /** A paid call Higgsfield can't quote: priced at the studio's set estimate. */
  | { kind: "estimate"; tool: string; jobs: number; mediaType: "image" | "video" }
  /** Starts a preset's run session (billed when free_generation is true). */
  | { kind: "preset_session"; tool: string; free: boolean; preset: string | null }
  | { kind: "invalid"; tool: string; reason: string };

const SINGLE: Record<string, GenerationTool> = {
  generate_image: "generate_image",
  generate_video: "generate_video",
  generate_audio: "generate_audio",
};

const BATCH: Record<string, GenerationTool> = {
  generate_image_batch: "generate_image",
  generate_video_batch: "generate_video",
  generate_audio_batch: "generate_audio",
};

/** A tool's `params`: an object, or (as Higgsfield also accepts) the same object as a JSON string. */
export function readParams(value: unknown): JsonObject | null {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function modelOf(params: JsonObject): string | null {
  return typeof params["model"] === "string" ? params["model"] : null;
}

/** What a guarded call asks for. */
export function classifyGuardedCall(tool: string, input: unknown): GuardCall {
  const args = isObject(input) ? input : {};
  const single = SINGLE[tool];
  if (single) {
    const params = readParams(args["params"]);
    if (!params) return { kind: "invalid", tool, reason: "its params couldn't be read" };
    if (params["get_cost"] === true) return { kind: "quote", tool: single, model: modelOf(params) };
    return { kind: "submit", tool, quoteTool: single, items: [{ index: 0, params }] };
  }
  const batch = BATCH[tool];
  if (batch) {
    const requests = Array.isArray(args["requests"]) ? args["requests"] : null;
    if (!requests?.length) return { kind: "invalid", tool, reason: "it lists no requests" };
    const items: GuardItem[] = [];
    for (const [position, request] of requests.entries()) {
      const entry = isObject(request) ? request : {};
      const params = readParams(entry["params"]);
      if (!params)
        return {
          kind: "invalid",
          tool,
          reason: `request ${position + 1}'s params couldn't be read`,
        };
      if (params["get_cost"] !== undefined) {
        return {
          kind: "invalid",
          tool,
          reason: "a batch can't carry a price check; quote each request on its own",
        };
      }
      const index = typeof entry["index"] === "number" ? entry["index"] : position;
      items.push({ index, params });
    }
    return { kind: "submit", tool, quoteTool: batch, items };
  }
  if (tool === "remove_background") {
    const params = readParams(args["params"]);
    // A video's matte can cost more than an image's, so an unknown kind counts as a video.
    const mediaType = params?.["media_type"] === "image" ? "image" : "video";
    return { kind: "estimate", tool, jobs: 1, mediaType };
  }
  if (tool === "get_katana_config") {
    return {
      kind: "preset_session",
      tool,
      free: args["free_generation"] === true,
      preset: typeof args["preset"] === "string" ? args["preset"] : null,
    };
  }
  return { kind: "invalid", tool, reason: "the studio doesn't let Katana use this tool" };
}

/** A submit asking for free or unlimited generations instead of credits. */
export function freeBillingFlag(params: JsonObject): string | null {
  if (params["use_unlim"] === true) return "use_unlim";
  if (params["use_free_gens"] === true) return "use_free_gens";
  return null;
}

/** How many results one request makes (Katana always asks for one; variants multiply the price). */
export function requestCount(params: JsonObject): number {
  const count = Number(params["count"] ?? 1);
  return Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
}

/** The params to price a request with: the same ones, as a price check. */
export function quoteParams(params: JsonObject): JsonObject {
  return { ...params, get_cost: true };
}

/**
 * The credits a quote names: `cost.credits_exact`, Higgsfield's exact figure,
 * or failing that its rounded credits. Null when no price is given (a missing
 * price is unknown, never zero).
 */
export function quoteCredits(payload: unknown): number | null {
  const pick = (values: unknown[]): number | null => {
    for (const value of values) {
      const number = typeof value === "string" ? Number(value) : value;
      if (typeof number === "number" && Number.isFinite(number) && number >= 0) return number;
    }
    return null;
  };
  const exact = pick(findAll(payload, "credits_exact"));
  if (exact !== null) return exact;
  // A bare number under `cost` could be in another unit, so only credit fields count.
  const costs = findAll(payload, "cost");
  const fromCost = pick(costs.flatMap((cost) => (isObject(cost) ? [cost["credits"]] : [])));
  if (fromCost !== null) return fromCost;
  if (isObject(payload)) return pick([payload["credits"], payload["total_credits"]]);
  return null;
}

export interface PricedItem {
  index: number;
  model: string | null;
  credits: number | null;
}

export interface GuardDecision {
  allow: boolean;
  credits: number;
  /** False when a set estimate stood in for a quote. */
  priced: boolean;
  /** Shown in the run's progress, and (for a denial) sent to the agent. */
  reason: string;
  items: PricedItem[];
}

const EPSILON = 1e-6;

export function formatCredits(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** Allows jobs whose total fits in what is left of the run's credit limit. */
export function decideSpend(input: {
  items: PricedItem[];
  reserved: number;
  limit: number;
  priced?: boolean;
  label: string;
}): GuardDecision {
  const priced = input.priced ?? true;
  const unknown = input.items.find((item) => item.credits === null);
  if (unknown) {
    return {
      allow: false,
      credits: 0,
      priced,
      reason:
        `The studio couldn't get Higgsfield's price for ${input.label}` +
        (input.items.length > 1
          ? ` (request ${unknown.index}${unknown.model ? `, ${unknown.model}` : ""})`
          : "") +
        ", so it wasn't submitted. Nothing was made or charged.",
      items: input.items,
    };
  }
  const total = input.items.reduce((sum, item) => sum + (item.credits ?? 0), 0);
  const left = Math.max(0, input.limit - input.reserved);
  if (total > left + EPSILON) {
    return {
      allow: false,
      credits: total,
      priced,
      reason:
        `${capitalize(input.label)} would cost ${formatCredits(total)} credits, and only ${formatCredits(left)} of this run's ` +
        `${formatCredits(input.limit)}-credit limit are left. It wasn't submitted, so nothing was made or charged. ` +
        "Fit the rest of the plan into the credits left, or finish with what is done.",
      items: input.items,
    };
  }
  return {
    allow: true,
    credits: total,
    priced,
    reason: `${capitalize(input.label)}: ${formatCredits(total)} credits${priced ? "" : " (estimated)"}; ${formatCredits(left - total)} left.`,
    items: input.items,
  };
}

/**
 * Turns down jobs the Higgsfield account can't pay for, as far as the studio
 * knows: what it had when the run started (`balanceStart`; null when that
 * couldn't be read, and then nothing is checked), less what the run has been
 * allowed since (`committed`). A batch is turned down whole, never made in
 * part and then refused for the balance. Null when the jobs fit.
 */
export function accountShortfall(input: {
  total: number;
  balanceStart: number | null;
  committed: number;
  label: string;
}): string | null {
  if (input.balanceStart === null || !Number.isFinite(input.balanceStart)) return null;
  const left = Math.max(0, input.balanceStart - Math.max(0, input.committed));
  if (input.total <= left + EPSILON) return null;
  return (
    `${capitalize(input.label)} would cost ${formatCredits(input.total)} credits, and the Higgsfield account has about ` +
    `${formatCredits(left)} left (${formatCredits(input.balanceStart)} when this run started, less what it has spent). ` +
    "It wasn't submitted, so nothing was made or charged. " +
    "Fit the rest of the plan into the credits left, or finish with what is done."
  );
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** How a call reads in the run's progress ("a Seedance 2.5 video", "4 videos"). */
export function callLabel(call: Extract<GuardCall, { kind: "submit" }>): string {
  const noun =
    call.quoteTool === "generate_image"
      ? "image"
      : call.quoteTool === "generate_audio"
        ? "audio track"
        : "video";
  if (call.items.length > 1) return `${call.items.length} ${noun}s`;
  const model = modelOf(call.items[0]!.params);
  return model ? `a ${noun} (${model})` : `a ${noun}`;
}

/** Job IDs a submit answered with (`results[].id` for single calls, `jobs[].job_id` for batches). */
export function submittedJobIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const list of [...findAll(payload, "results"), ...findAll(payload, "jobs")]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isObject(entry)) continue;
      for (const key of ["job_id", "id"]) {
        const value = entry[key];
        if (typeof value === "string" && uuid.test(value)) {
          ids.add(value);
          break;
        }
      }
    }
  }
  for (const value of findAll(payload, "job_id")) {
    if (typeof value === "string" && uuid.test(value)) ids.add(value);
  }
  return [...ids];
}

/** Higgsfield's words for a request it turned away before making any job. */
const NOT_MADE = /rate limit reached|created no job|no job was created/i;

/**
 * The answers Higgsfield gives instead of making a job: a preset suggestion
 * (`notice.type: "preset_recommendation"`, or that key on a batch item) and
 * an unlimited-generations question (`unlim_choice`).
 */
const NO_JOB_SHAPES = ["preset_recommendation", "unlim_choice"];

function refusedWithoutJob(value: unknown, text: string): boolean {
  if (submittedJobIds(value).length) return false;
  if (NOT_MADE.test(text)) return true;
  const types = findAll(value, "type");
  return NO_JOB_SHAPES.some((shape) => findAll(value, shape).length > 0 || types.includes(shape));
}

/**
 * Which of a submit's requests Higgsfield says it made no job for. A batch is
 * read item by item when its answer lists them; otherwise the whole call
 * counts (a concurrency refusal, a preset suggestion or an unlimited-
 * generations question, with no job). Anything else, an error included, may
 * still have made a job (Higgsfield warns that a transport failure can hide a
 * submitted one), so it stays counted.
 */
export function unmadeIndexes(payload: unknown, text: string, indexes: number[]): number[] {
  if (indexes.length > 1) {
    const entries: JsonObject[] = [];
    for (const list of [...findAll(payload, "jobs"), ...findAll(payload, "results")]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list)
        if (isObject(entry) && typeof entry["index"] === "number") entries.push(entry);
    }
    if (entries.length) {
      const refused = new Set(
        entries
          .filter((entry) => refusedWithoutJob(entry, JSON.stringify(entry)))
          .map((entry) => entry["index"] as number),
      );
      const made = new Set(
        entries
          .filter((entry) => submittedJobIds(entry).length > 0)
          .map((entry) => entry["index"] as number),
      );
      return indexes.filter((index) => refused.has(index) && !made.has(index));
    }
  }
  return refusedWithoutJob(payload, text) ? [...indexes] : [];
}
