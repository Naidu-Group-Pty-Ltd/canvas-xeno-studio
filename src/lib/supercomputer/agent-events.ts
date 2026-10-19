/**
 * What the Supercomputer agent shows while it works, and the events that
 * build it: its thinking, its words, every tool it calls (with what it was
 * asked, what came back and anything to show for it), web searches, and the
 * approval it waits for before it spends. The server streams these events
 * to the browser as they happen and keeps the same picture with the message,
 * so a page opened later shows exactly what was streamed.
 *
 * Shared by the server, the browser and tests.
 */

/** Something a tool made or found, shown with its call. */
export type ToolUi =
  | {
      type: "generation";
      generationId: string;
      modelName: string | null;
      outputType: "image" | "video" | "audio" | null;
      prompt: string | null;
    }
  | {
      type: "assets";
      assets: {
        id: string;
        kind: "image" | "video" | "audio";
        title: string | null;
        bucket: string;
        path: string;
        poster?: string | null;
      }[];
    }
  | { type: "long_video"; longVideoId: string; title: string | null }
  | { type: "edit"; sequenceId: string; title: string | null }
  | { type: "render"; renderId: string; sequenceId: string | null }
  | { type: "brand"; kitId: string; name: string; palette: string[] }
  | { type: "brand_import"; importId: string; name: string | null; palette: string[] }
  | { type: "characters"; characters: { id: string; name: string }[] }
  | { type: "models"; models: { id: string; name: string; output: string }[] }
  | { type: "drafts"; count: number }
  | { type: "memory"; content: string; scope: "personal" | "team" }
  | { type: "document"; title: string; markdown: string };

/** A tool call waiting for a person: what it would do, and what it would cost. */
export interface ApprovalRequest {
  toolUseId: string;
  title: string;
  details: { label: string; value: string }[];
  /** The provider's estimate, when it gave one. */
  estimateUsd: number | null;
  /** Why it asks (it spends credits, or can't be undone). */
  reason: string;
}

export type ToolStatus =
  "streaming" | "running" | "done" | "error" | "awaiting_approval" | "denied";

export type DisplayBlock =
  | { kind: "thinking"; text: string; done: boolean }
  | { kind: "text"; text: string; done: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      label: string;
      input: unknown;
      status: ToolStatus;
      summary: string | null;
      ui: ToolUi | null;
      approval: ApprovalRequest | null;
    }
  | {
      kind: "web";
      id: string;
      tool: "web_search" | "web_fetch";
      query: string;
      results: { title: string; url: string }[];
      status: "running" | "done" | "error";
    }
  | { kind: "notice"; tone: "info" | "warning" | "error"; text: string };

export type AgentTurnStatus = "streaming" | "awaiting_approval" | "complete" | "stopped" | "failed";

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentDisplay {
  blocks: { key: string; block: DisplayBlock }[];
  status: AgentTurnStatus;
  error: string | null;
  usage: AgentUsage | null;
  /** The model that answered (a fallback model may have taken over). */
  model: string | null;
}

export type AgentEvent =
  | {
      type: "turn";
      threadId: string;
      userMessageId: string | null;
      assistantMessageId: string;
      model: string;
    }
  | { type: "block"; key: string; block: DisplayBlock }
  | { type: "text"; key: string; text: string }
  | { type: "thinking"; key: string; text: string }
  | { type: "update"; key: string; patch: BlockPatch }
  | { type: "end"; key: string }
  /** Takes away the blocks whose keys start with `prefix` (a step that is redone or declined). */
  | { type: "drop"; prefix: string }
  | { type: "title"; title: string }
  | { type: "model"; model: string }
  | { type: "usage"; usage: AgentUsage }
  | { type: "status"; status: AgentTurnStatus; error?: string | null };

/** The parts of a tool or web block an update may change. */
export interface BlockPatch {
  status?: ToolStatus | "running" | "done" | "error";
  summary?: string | null;
  ui?: ToolUi | null;
  approval?: ApprovalRequest | null;
  input?: unknown;
  label?: string;
  query?: string;
  results?: { title: string; url: string }[];
}

export const EMPTY_DISPLAY: AgentDisplay = {
  blocks: [],
  status: "streaming",
  error: null,
  usage: null,
  model: null,
};

/** The most a display keeps of one text or thinking block (a runaway answer is cut, not stored whole). */
const MAX_TEXT = 200_000;

function patchBlock(block: DisplayBlock, patch: BlockPatch): DisplayBlock {
  if (block.kind === "tool") {
    const next = { ...block };
    if (patch.status !== undefined) next.status = patch.status as ToolStatus;
    if (patch.summary !== undefined) next.summary = patch.summary;
    if (patch.ui !== undefined) next.ui = patch.ui;
    if (patch.approval !== undefined) next.approval = patch.approval;
    if (patch.input !== undefined) next.input = patch.input;
    if (patch.label !== undefined) next.label = patch.label;
    return next;
  }
  if (block.kind === "web") {
    const next = { ...block };
    if (patch.status === "running" || patch.status === "done" || patch.status === "error")
      next.status = patch.status;
    if (patch.query !== undefined) next.query = patch.query;
    if (patch.results !== undefined) next.results = patch.results.slice(0, 12);
    return next;
  }
  return block;
}

/**
 * The display after one event. Pure: the server keeps its copy with it, and
 * the browser builds the same picture from the same events.
 */
export function applyAgentEvent(display: AgentDisplay, event: AgentEvent): AgentDisplay {
  switch (event.type) {
    case "block": {
      const at = display.blocks.findIndex((entry) => entry.key === event.key);
      const blocks = [...display.blocks];
      if (at >= 0) blocks[at] = { key: event.key, block: event.block };
      else blocks.push({ key: event.key, block: event.block });
      return { ...display, blocks };
    }
    case "text":
    case "thinking": {
      const blocks = display.blocks.map((entry) => {
        if (entry.key !== event.key) return entry;
        const block = entry.block;
        if (
          (event.type === "text" && block.kind === "text") ||
          (event.type === "thinking" && block.kind === "thinking")
        )
          return {
            ...entry,
            block: { ...block, text: (block.text + event.text).slice(0, MAX_TEXT) },
          };
        return entry;
      });
      return { ...display, blocks };
    }
    case "update":
      return {
        ...display,
        blocks: display.blocks.map((entry) =>
          entry.key === event.key
            ? { ...entry, block: patchBlock(entry.block, event.patch) }
            : entry,
        ),
      };
    case "end":
      return {
        ...display,
        blocks: display.blocks.map((entry) =>
          entry.key === event.key &&
          (entry.block.kind === "text" || entry.block.kind === "thinking")
            ? { ...entry, block: { ...entry.block, done: true } }
            : entry,
        ),
      };
    case "drop":
      return {
        ...display,
        blocks: display.blocks.filter((entry) => !entry.key.startsWith(event.prefix)),
      };
    case "model":
      return { ...display, model: event.model };
    case "usage":
      return { ...display, usage: event.usage };
    case "status":
      return {
        ...display,
        status: event.status,
        error: event.error ?? (event.status === "failed" ? display.error : null),
        // Nothing is still being written once a turn has stopped or ended.
        blocks:
          event.status === "streaming"
            ? display.blocks
            : display.blocks.map((entry) =>
                entry.block.kind === "text" || entry.block.kind === "thinking"
                  ? { ...entry, block: { ...entry.block, done: true } }
                  : entry.block.kind === "tool" &&
                      (entry.block.status === "streaming" || entry.block.status === "running") &&
                      event.status !== "awaiting_approval"
                    ? {
                        ...entry,
                        block: {
                          ...entry.block,
                          status: "error" as const,
                          summary: entry.block.summary ?? "Stopped before it finished",
                        },
                      }
                    : entry,
              ),
      };
    default:
      return display;
  }
}

/** A stored display, read tolerantly (anything malformed is dropped). */
export function displayOf(value: unknown): AgentDisplay | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!Array.isArray(item["blocks"])) return null;
  const blocks = (item["blocks"] as unknown[]).flatMap((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const block = record["block"] as DisplayBlock | undefined;
    return typeof record["key"] === "string" &&
      block &&
      typeof block === "object" &&
      "kind" in block
      ? [{ key: record["key"], block }]
      : [];
  });
  const status = item["status"];
  return {
    blocks,
    status:
      status === "awaiting_approval" ||
      status === "complete" ||
      status === "stopped" ||
      status === "failed" ||
      status === "streaming"
        ? status
        : "complete",
    error: typeof item["error"] === "string" ? item["error"] : null,
    usage: (item["usage"] as AgentUsage | null) ?? null,
    model: typeof item["model"] === "string" ? item["model"] : null,
  };
}

/** The words of a display: its text blocks joined (what is stored as the message's content). */
export function displayText(display: AgentDisplay): string {
  return display.blocks
    .flatMap((entry) => (entry.block.kind === "text" ? [entry.block.text] : []))
    .join("\n\n")
    .trim();
}

/** Encodes an event for an event stream. */
export function encodeEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Reads events out of an event stream's text as it arrives: the complete
 * ones, and what is left over until more arrives.
 */
export function decodeEvents(buffer: string): { events: AgentEvent[]; rest: string } {
  const events: AgentEvent[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf("\n\n");
    if (end < 0) break;
    const chunk = rest.slice(0, end);
    rest = rest.slice(end + 2);
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as AgentEvent;
      if (parsed && typeof parsed === "object" && typeof parsed.type === "string")
        events.push(parsed);
    } catch {
      // A malformed event is skipped; the next arrives on its own.
    }
  }
  return { events, rest };
}
