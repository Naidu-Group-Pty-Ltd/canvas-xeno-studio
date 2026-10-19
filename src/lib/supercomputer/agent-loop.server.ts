/**
 * One turn of the Supercomputer agent: Claude streams its thinking and its
 * answer, calls tools, reads their results and carries on until it is done,
 * waits for a person's approval before anything that spends, or is stopped.
 *
 * What it writes is kept two ways (see ./agent-events): the conversation as
 * the Messages API takes it (every block returned unchanged and appended,
 * never rewritten, so its earlier thinking stays valid), and the picture
 * people see. Both go to the turn's message as it runs.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  applyAgentEvent,
  type AgentDisplay,
  type AgentEvent,
  type AgentUsage,
  type ApprovalRequest,
  type DisplayBlock,
} from "./agent-events";
import { takesFallbacks, type AgentThreadSettings } from "./agent-settings";
import {
  agentTool,
  apiTools,
  resultText,
  type AgentContext,
  type AgentToolOutcome,
  type ToolResultContent,
} from "./agent-tools.server";
import type { SupercomputerPayload } from "./types";

type Json = Record<string, unknown>;
export type ApiMessage = Anthropic.Beta.Messages.BetaMessageParam;
type ApiBlock = Anthropic.Beta.Messages.BetaContentBlock;

/** A tool call's result as it is kept until it is sent. */
export interface KeptResult {
  content: ToolResultContent;
  isError: boolean;
}

/** Tool calls waiting for a person, with the results of the others in the same message. */
export interface PendingCalls {
  calls: { id: string; name: string; input: Json }[];
  results: Record<string, KeptResult>;
  awaiting: string[];
  /** The assistant message the calls came in, appended with their results once all are known. */
  message: ApiMessage;
  /** The display key of each call's block. */
  keys: Record<string, string>;
}

export interface TurnState {
  transcript: ApiMessage[];
  display: AgentDisplay;
  payload: Partial<SupercomputerPayload>;
  pending: PendingCalls | null;
  usage: AgentUsage;
  model: string;
  steps: number;
}

export interface TurnIo {
  context: AgentContext;
  system: string;
  /** Every earlier message of the conversation, this turn's user message last. */
  history: ApiMessage[];
  emit: (event: AgentEvent) => void;
  /** Saves the turn: as it streams (light), and at each step and the end (whole). */
  persist: (state: TurnState, phase: "streaming" | "step" | "final") => Promise<void>;
  /** Turns the studio's picture addresses into links the API can fetch. */
  resolve: (messages: ApiMessage[]) => Promise<ApiMessage[]>;
  /** Opens a model call's stream (Claude's, unless a test gives its own). */
  openStream?: (params: Json, signal: AbortSignal) => StepStream;
}

/** What a model call's stream must offer: its events as they come, then the whole message. */
export interface StepStream extends AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> {
  finalMessage: () => Promise<Anthropic.Beta.Messages.BetaMessage>;
}

/** The most model calls one turn makes before it stops to check in. */
const MAX_STEPS = 32;
const MAX_TOKENS = 32_000;

const ZERO_USAGE: AgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

let client: Anthropic | null = null;

export function agentConfigured(): boolean {
  return !!process.env["ANTHROPIC_API_KEY"]?.trim();
}

function anthropic(): Anthropic {
  if (!client)
    client = new Anthropic({
      apiKey: process.env["ANTHROPIC_API_KEY"],
      maxRetries: 2,
      timeout: 10 * 60_000,
    });
  return client;
}

/** The request's beta features: dropping thinking that no longer fits (never a 400), and server-side fallback. */
function betaFeatures(settings: AgentThreadSettings) {
  return {
    betas: [
      "thinking-binding-controls-2026-08-01",
      ...(takesFallbacks(settings.model) ? ["server-side-fallback-2026-07-01"] : []),
    ],
    thinking: {
      type: "adaptive",
      display: "summarized",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    },
    ...(takesFallbacks(settings.model) ? { fallbacks: "default" } : {}),
  };
}

/** A friendly reason for an API failure. */
export function apiFailure(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError)
    return "Claude rejected the studio's API key. An admin can check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError)
    return "Claude is busy right now (rate limited). Try again in a minute.";
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529 || error.status === 503)
      return "Claude is overloaded right now. Try again in a moment.";
    if (error.status === 400)
      return `Claude couldn't take this request: ${error.message.slice(0, 300)}`;
    return `Claude answered with an error (${error.status ?? "no status"}): ${error.message.slice(0, 200)}`;
  }
  return error instanceof Error ? error.message : "The agent stopped unexpectedly";
}

/**
 * Whether a 400 was about an optional part of the request (the beta features,
 * the effort setting or caching), so it can go again without it.
 */
function rejectedOptional(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError &&
    /fallback|block_binding|beta|Extra inputs|effort|output_config|cache_control/i.test(
      error.message,
    )
  );
}

const isAbort = (error: unknown) =>
  error instanceof Anthropic.APIUserAbortError ||
  (error instanceof Error && error.name === "AbortError");

/* ------------------------------------------------------------------ */
/* The turn                                                            */
/* ------------------------------------------------------------------ */

export function freshState(model: string): TurnState {
  return {
    transcript: [],
    display: {
      blocks: [],
      status: "streaming",
      error: null,
      usage: null,
      model,
    },
    payload: {},
    pending: null,
    usage: { ...ZERO_USAGE },
    model,
    steps: 0,
  };
}

/**
 * Runs (or resumes) a turn until it ends, waits for approval, fails or is
 * stopped. `decisions` answers the tool calls a resumed turn waited on.
 */
export async function runTurn(
  io: TurnIo,
  state: TurnState,
  decisions?: Record<string, "approve" | "deny">,
): Promise<TurnState> {
  const { context } = io;
  let current = state;
  // The picture people see, built from every event (one copy, read when the turn is saved).
  let display = state.display;
  const emit = (event: AgentEvent) => {
    display = applyAgentEvent(display, event);
    io.emit(event);
  };
  const shown = () => display;
  const save = (phase: "streaming" | "step" | "final") =>
    io.persist({ ...current, display }, phase);
  // A light save while it streams, at most every two seconds.
  let lastSave = 0;
  const saveSoon = () => {
    if (Date.now() - lastSave < 2000) return;
    lastSave = Date.now();
    void save("streaming").catch(() => undefined);
  };
  emit({ type: "status", status: "streaming" });

  try {
    if (current.pending) {
      current = await settlePending(io, current, emit, decisions ?? {});
      if (current.pending) {
        emit({ type: "status", status: "awaiting_approval" });
        await save("final");
        return { ...current, display };
      }
    }

    let jsonRetries = 0;
    while (current.steps < MAX_STEPS) {
      if (context.signal.aborted) throw new Anthropic.APIUserAbortError();
      const step = current.steps;
      let message: Anthropic.Beta.Messages.BetaMessage;
      try {
        message = await streamStep(io, current, step, emit, saveSoon);
        jsonRetries = 0;
      } catch (error) {
        // A tool input that couldn't be parsed at all: the step goes again (twice at most).
        if (unparseableToolInput(error) && jsonRetries < 2) {
          jsonRetries += 1;
          // What it showed of the failed attempt goes; the step is asked again.
          emit({ type: "drop", prefix: `${step}:` });
          current = { ...current, steps: current.steps + 1 };
          continue;
        }
        throw error;
      }
      current = { ...current, steps: current.steps + 1 };
      const usage = message.usage;
      current = {
        ...current,
        usage: {
          inputTokens: current.usage.inputTokens + (usage.input_tokens ?? 0),
          outputTokens: current.usage.outputTokens + (usage.output_tokens ?? 0),
          cacheReadTokens: current.usage.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
          cacheWriteTokens:
            current.usage.cacheWriteTokens + (usage.cache_creation_input_tokens ?? 0),
        },
      };
      emit({ type: "usage", usage: current.usage });
      if (message.model && message.model !== display.model)
        emit({ type: "model", model: message.model });

      const calls = message.content.filter(
        (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use",
      );
      // A refusal can cut a call off part-way: none of this step's work is kept.
      if (message.stop_reason === "refusal") {
        emit({ type: "drop", prefix: `${step}:` });
        emit({
          type: "block",
          key: `${step}:refusal`,
          block: {
            kind: "notice",
            tone: "warning",
            text: "Claude declined to go on with this request. Rephrase it, or ask for something else.",
          },
        });
        break;
      }
      if (message.stop_reason === "max_tokens" && calls.length) {
        emit({
          type: "block",
          key: `${step}:cut`,
          block: {
            kind: "notice",
            tone: "warning",
            text: "The answer ran out of room while it was calling a tool. Ask it to carry on, in smaller steps.",
          },
        });
        break;
      }
      const assistant: ApiMessage = {
        role: "assistant",
        content: message.content as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[],
      };
      if (message.stop_reason === "pause_turn") {
        current = { ...current, transcript: [...current.transcript, assistant] };
        await save("step");
        continue;
      }
      if (!calls.length) {
        current = { ...current, transcript: [...current.transcript, assistant] };
        if (message.stop_reason === "max_tokens")
          emit({
            type: "block",
            key: `${step}:long`,
            block: {
              kind: "notice",
              tone: "info",
              text: "The answer hit its length limit. Say “go on” for the rest.",
            },
          });
        break;
      }

      current = await callTools(io, current, emit, shown, step, assistant, calls);
      if (current.pending) {
        emit({ type: "status", status: "awaiting_approval" });
        await save("final");
        return { ...current, display };
      }
      await save("step");
    }
    if (current.steps >= MAX_STEPS)
      emit({
        type: "block",
        key: `${current.steps}:limit`,
        block: {
          kind: "notice",
          tone: "info",
          text: "That was a long run of steps, so it paused here. Say “go on” to continue.",
        },
      });
    emit({ type: "status", status: "complete" });
    await save("final");
    return { ...current, display };
  } catch (error) {
    if (isAbort(error) || context.signal.aborted) {
      emit({ type: "status", status: "stopped" });
      await save("final").catch(() => undefined);
      return { ...current, display };
    }
    emit({ type: "status", status: "failed", error: apiFailure(error) });
    await save("final").catch(() => undefined);
    return { ...current, display };
  }
}

/** What a tool call is shown as before its input has arrived. */
function placeholderLabel(name: string): string {
  const label = agentTool(name)?.label({});
  if (label && label !== name) return label;
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The SDK's error for a streamed tool input it couldn't parse at all (the step can go again). */
function unparseableToolInput(error: unknown): boolean {
  return (
    error instanceof Anthropic.AnthropicError &&
    !(error instanceof Anthropic.APIError) &&
    /parse tool parameter JSON/i.test(error.message)
  );
}

/** One model call, streamed: its blocks shown as they arrive. */
async function streamStep(
  io: TurnIo,
  state: TurnState,
  step: number,
  emit: (event: AgentEvent) => void,
  saveSoon: () => void,
): Promise<Anthropic.Beta.Messages.BetaMessage> {
  const { settings } = io.context;
  const messages = await io.resolve([...io.history, ...state.transcript]);
  const base = {
    model: settings.model,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text" as const, text: io.system, cache_control: { type: "ephemeral" as const } },
    ],
    tools: apiTools() as unknown as Anthropic.Beta.Messages.BetaToolUnion[],
    messages,
    output_config: { effort: settings.effort },
    // The conversation so far is cached, so each step reads it back cheaply.
    cache_control: { type: "ephemeral" as const },
  };
  // Full (beta features, effort, caching); then without the betas; then the bare request.
  const bare = {
    model: base.model,
    max_tokens: base.max_tokens,
    system: base.system,
    tools: base.tools,
    messages: base.messages,
    thinking: { type: "adaptive", display: "summarized" },
  };
  const levels = [
    { ...base, ...betaFeatures(settings) },
    { ...base, thinking: { type: "adaptive", display: "summarized" } },
    bare,
  ];
  const open = (level: number): StepStream =>
    io.openStream
      ? io.openStream(levels[level] as Json, io.context.signal)
      : anthropic().beta.messages.stream(
          levels[level] as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
          { signal: io.context.signal },
        );

  // Which display block each API block is (and what kind), and the web calls by their id.
  const keys = new Map<number, string>();
  const kinds = new Map<number, string>();
  const webKeys = new Map<string, string>();
  const partial = new Map<number, string>();

  const consume = async (stream: ReturnType<typeof open>) => {
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const key = `${step}:${event.index}`;
        keys.set(event.index, key);
        const block = event.content_block as unknown as Json;
        const kind = String(block["type"]);
        kinds.set(event.index, kind);
        if (kind === "thinking")
          emit({ type: "block", key, block: { kind: "thinking", text: "", done: false } });
        else if (kind === "text")
          emit({ type: "block", key, block: { kind: "text", text: "", done: false } });
        else if (kind === "tool_use") {
          const name = String(block["name"]);
          emit({
            type: "block",
            key,
            block: {
              kind: "tool",
              id: String(block["id"]),
              name,
              label: placeholderLabel(name),
              input: null,
              status: "streaming",
              summary: null,
              ui: null,
              approval: null,
            },
          });
        } else if (kind === "server_tool_use") {
          const name = String(block["name"]);
          webKeys.set(String(block["id"]), key);
          emit({
            type: "block",
            key,
            block: {
              kind: "web",
              id: String(block["id"]),
              tool: name === "web_fetch" ? "web_fetch" : "web_search",
              query: "",
              results: [],
              status: "running",
            },
          });
        } else if (kind === "web_search_tool_result" || kind === "web_fetch_tool_result") {
          const target = webKeys.get(String(block["tool_use_id"]));
          if (target) emit({ type: "update", key: target, patch: webResultPatch(block) });
        }
      } else if (event.type === "content_block_delta") {
        const key = keys.get(event.index);
        if (!key) continue;
        const delta = event.delta as unknown as Json;
        if (delta["type"] === "text_delta")
          emit({ type: "text", key, text: String(delta["text"]) });
        else if (delta["type"] === "thinking_delta")
          emit({ type: "thinking", key, text: String(delta["thinking"]) });
        else if (delta["type"] === "input_json_delta")
          partial.set(
            event.index,
            (partial.get(event.index) ?? "") + String(delta["partial_json"]),
          );
        saveSoon();
      } else if (event.type === "content_block_stop") {
        const key = keys.get(event.index);
        if (!key) continue;
        const kind = kinds.get(event.index);
        const json = partial.get(event.index);
        // A web search's query shows once it is written.
        if (json && kind === "server_tool_use") {
          try {
            const input = JSON.parse(json) as Json;
            emit({
              type: "update",
              key,
              patch: { query: String(input["query"] ?? input["url"] ?? "") },
            });
          } catch {
            // Shown without its query.
          }
        }
        if (kind === "text" || kind === "thinking") emit({ type: "end", key });
      }
    }
    return stream.finalMessage();
  };

  // An account or model that doesn't take an optional part: the same step without it.
  for (let level = 0; ; level += 1) {
    try {
      return await consume(open(level));
    } catch (error) {
      if (level < levels.length - 1 && rejectedOptional(error)) continue;
      throw error;
    }
  }
}

function webResultPatch(block: Json) {
  const content = block["content"];
  if (Array.isArray(content))
    return {
      status: "done" as const,
      results: (content as Json[])
        .filter((entry) => typeof entry["url"] === "string")
        .slice(0, 12)
        .map((entry) => ({
          title: String(entry["title"] ?? entry["url"]),
          url: String(entry["url"]),
        })),
    };
  const fetched = (content ?? {}) as Json;
  if (typeof fetched["url"] === "string")
    return {
      status: "done" as const,
      results: [
        {
          title: String(((fetched["content"] ?? {}) as Json)["title"] ?? fetched["url"]),
          url: fetched["url"],
        },
      ],
    };
  return { status: "error" as const };
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

function toolResultMessage(pending: PendingCalls): ApiMessage {
  return {
    role: "user",
    content: pending.calls.map((call) => {
      const result = pending.results[call.id] ?? {
        content: "No result",
        isError: true,
      };
      return {
        type: "tool_result" as const,
        tool_use_id: call.id,
        content: result.content as Exclude<
          Anthropic.Beta.Messages.BetaToolResultBlockParam["content"],
          undefined
        >,
        ...(result.isError ? { is_error: true } : {}),
      };
    }),
  };
}

async function runOne(
  io: TurnIo,
  call: { id: string; name: string; input: Json },
  key: string,
  emit: (event: AgentEvent) => void,
): Promise<{ result: KeptResult; outcome: AgentToolOutcome | null }> {
  const tool = agentTool(call.name);
  if (!tool) {
    emit({ type: "update", key, patch: { status: "error", summary: "Unknown tool" } });
    return {
      result: { content: `There is no tool called ${call.name}.`, isError: true },
      outcome: null,
    };
  }
  emit({
    type: "update",
    key,
    patch: { status: "running", input: call.input, label: tool.label(call.input) },
  });
  try {
    const outcome = await tool.run(call.input, io.context, call.id);
    emit({
      type: "update",
      key,
      patch: {
        status: outcome.isError ? "error" : "done",
        summary: outcome.summary,
        ui: outcome.ui ?? null,
      },
    });
    return { result: { content: outcome.content, isError: !!outcome.isError }, outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The tool failed";
    emit({ type: "update", key, patch: { status: "error", summary: message.slice(0, 300) } });
    return { result: { content: `Error: ${message}`, isError: true }, outcome: null };
  }
}

/** Runs a step's tool calls: at once where nothing is spent, after approval where it is. */
async function callTools(
  io: TurnIo,
  state: TurnState,
  emit: (event: AgentEvent) => void,
  shown: () => AgentDisplay,
  step: number,
  assistant: ApiMessage,
  calls: Anthropic.Beta.Messages.BetaToolUseBlock[],
): Promise<TurnState> {
  const { context } = io;
  const pending: PendingCalls = {
    calls: calls.map((call) => ({
      id: call.id,
      name: call.name,
      input: (call.input ?? {}) as Json,
    })),
    results: {},
    awaiting: [],
    message: assistant,
    keys: {},
  };
  // Where each call's block is (found by its id in this step's blocks).
  for (const call of pending.calls) {
    const entry = shown().blocks.find(
      (item) =>
        item.key.startsWith(`${step}:`) && item.block.kind === "tool" && item.block.id === call.id,
    );
    pending.keys[call.id] = entry?.key ?? `${step}:${call.id}`;
  }

  const ready: typeof pending.calls = [];
  for (const call of pending.calls) {
    const key = pending.keys[call.id]!;
    const tool = agentTool(call.name);
    const parsed = tool?.parse(call.input);
    if (tool && parsed && !parsed.ok) {
      // An input that doesn't fit the tool (or arrived cut short) goes back as an error to retry.
      pending.results[call.id] = {
        content: JSON.stringify({ INVALID_INPUT: parsed.error, input: call.input }).slice(0, 4000),
        isError: true,
      };
      emit({
        type: "update",
        key,
        patch: {
          status: "error",
          input: call.input,
          summary: `Invalid input: ${parsed.error.slice(0, 200)}`,
        },
      });
      continue;
    }
    if (tool?.spends(call.input)) {
      let approval: Omit<ApprovalRequest, "toolUseId">;
      try {
        approval = tool.approval
          ? await tool.approval(call.input, context)
          : {
              title: tool.label(call.input),
              details: [],
              estimateUsd: null,
              reason: "Spends credits",
            };
      } catch {
        approval = {
          title: tool.label(call.input),
          details: [],
          estimateUsd: null,
          reason: "Spends credits",
        };
      }
      const limit = context.settings.autoApproveUsd;
      if (limit > 0 && approval.estimateUsd !== null && approval.estimateUsd <= limit) {
        ready.push(call);
        continue;
      }
      pending.awaiting.push(call.id);
      emit({
        type: "update",
        key,
        patch: {
          status: "awaiting_approval",
          input: call.input,
          label: tool.label(call.input),
          approval: { ...approval, toolUseId: call.id },
        },
      });
      continue;
    }
    ready.push(call);
  }

  let current = state;
  const outcomes = await Promise.all(
    ready.map((call) => runOne(io, call, pending.keys[call.id]!, emit)),
  );
  ready.forEach((call, index) => {
    const { result, outcome } = outcomes[index]!;
    pending.results[call.id] = result;
    if (outcome?.payload)
      current = { ...current, payload: mergePayload(current.payload, outcome.payload) };
  });
  if (pending.awaiting.length) return { ...current, pending };
  return {
    ...current,
    pending: null,
    transcript: [...current.transcript, assistant, toolResultMessage(pending)],
  };
}

/** Answers the calls a turn waited on (approved ones run, declined ones are told so), then sends all results. */
async function settlePending(
  io: TurnIo,
  state: TurnState,
  emit: (event: AgentEvent) => void,
  decisions: Record<string, "approve" | "deny">,
): Promise<TurnState> {
  const pending = state.pending!;
  const answered = pending.awaiting.filter((id) => decisions[id]);
  if (!answered.length) return state;
  let current = state;
  const approved = answered.filter((id) => decisions[id] === "approve");
  for (const id of answered.filter((entry) => decisions[entry] === "deny")) {
    pending.results[id] = {
      content:
        "The person declined this. Don't try it again as it was: ask what they'd like instead, or offer an alternative.",
      isError: true,
    };
    emit({
      type: "update",
      key: pending.keys[id]!,
      patch: { status: "denied", summary: "Declined", approval: null },
    });
  }
  const outcomes = await Promise.all(
    approved.map((id) => {
      const call = pending.calls.find((entry) => entry.id === id)!;
      emit({ type: "update", key: pending.keys[id]!, patch: { approval: null } });
      return runOne(io, call, pending.keys[id]!, emit);
    }),
  );
  approved.forEach((id, index) => {
    const { result, outcome } = outcomes[index]!;
    pending.results[id] = result;
    if (outcome?.payload)
      current = { ...current, payload: mergePayload(current.payload, outcome.payload) };
  });
  const awaiting = pending.awaiting.filter((id) => !decisions[id]);
  if (awaiting.length) return { ...current, pending: { ...pending, awaiting } };
  return {
    ...current,
    pending: null,
    transcript: [...current.transcript, pending.message, toolResultMessage(pending)],
  };
}

/**
 * Closes calls a turn still waits on when the conversation moves on without
 * an answer (a new message instead of an approval): they are sent as declined.
 */
export function abandonPending(state: TurnState): TurnState {
  if (!state.pending) return state;
  const pending = state.pending;
  for (const id of pending.awaiting)
    pending.results[id] = {
      content: "Not approved: the person sent a new message instead.",
      isError: true,
    };
  const display = {
    ...state.display,
    status: "complete" as const,
    blocks: state.display.blocks.map((entry) =>
      entry.block.kind === "tool" && pending.awaiting.includes(entry.block.id)
        ? {
            ...entry,
            block: {
              ...entry.block,
              status: "denied" as const,
              approval: null,
              summary: "Not approved",
            } satisfies DisplayBlock,
          }
        : entry,
    ),
  };
  return {
    ...state,
    display,
    pending: null,
    transcript: [...state.transcript, pending.message, toolResultMessage(pending)],
  };
}

function mergePayload(
  base: Partial<SupercomputerPayload>,
  next: Partial<SupercomputerPayload>,
): Partial<SupercomputerPayload> {
  // Drafts from several calls in one turn are shown together; the latest edit plan wins.
  return {
    ...base,
    ...(next.ideas ? { ideas: [...(base.ideas ?? []), ...next.ideas].slice(0, 12) } : {}),
    ...(next.drafts ? { drafts: [...(base.drafts ?? []), ...next.drafts].slice(0, 24) } : {}),
    ...(next.editPlan ? { editPlan: next.editPlan } : {}),
    ...(next.dropped ? { dropped: [...(base.dropped ?? []), ...next.dropped].slice(0, 24) } : {}),
  };
}

/** A tool's result as text, for an error note (kept here so the loop's imports stay small). */
export { resultText };
