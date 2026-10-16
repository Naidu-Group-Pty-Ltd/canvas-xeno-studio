/**
 * The parts of the Model Context Protocol the studio speaks to Higgsfield's MCP
 * server (Streamable HTTP): reading JSON-RPC answers that come back either as
 * JSON or as a server-sent event stream, and reading a tool's result. Pure, so
 * it can be tested without a network.
 */

export const HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp";

/** The protocol revision the studio asks for; the server may answer with another it supports. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type JsonObject = Record<string, unknown>;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The `data` of every event in a server-sent event stream, in order. Lines of
 * one event's data are joined with newlines; comments and other fields are
 * skipped.
 */
export function parseSseData(body: string): string[] {
  const events: string[] = [];
  let data: string[] = [];
  const flush = () => {
    if (data.length) events.push(data.join("\n"));
    data = [];
  };
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    if (rawLine === "") {
      flush();
      continue;
    }
    if (rawLine.startsWith(":")) continue;
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? "" : rawLine.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  }
  flush();
  return events;
}

function asResponse(value: unknown): JsonRpcResponse | null {
  if (!isObject(value) || value["jsonrpc"] !== "2.0") return null;
  if (!("result" in value) && !("error" in value)) return null;
  const id = value["id"];
  if (typeof id !== "number" && typeof id !== "string" && id !== null) return null;
  const response: JsonRpcResponse = { jsonrpc: "2.0", id };
  if ("result" in value) response.result = value["result"];
  const error = value["error"];
  if (isObject(error)) {
    response.error = {
      code: typeof error["code"] === "number" ? error["code"] : -32603,
      message: typeof error["message"] === "string" ? error["message"] : "Unknown error",
      ...(error["data"] !== undefined ? { data: error["data"] } : {}),
    };
  }
  return response;
}

/**
 * The answer to request `id` in a response body: a JSON object, a JSON batch,
 * or an event stream that may carry notifications before the answer. Null when
 * the body holds no answer to it.
 */
export function findJsonRpcResponse(
  body: string,
  contentType: string | null,
  id: number | string,
): JsonRpcResponse | null {
  const candidates: unknown[] = [];
  if (contentType?.includes("text/event-stream")) {
    for (const data of parseSseData(body)) {
      try {
        candidates.push(JSON.parse(data));
      } catch {
        // A keep-alive or a partial event: not an answer.
      }
    }
  } else {
    try {
      candidates.push(JSON.parse(body));
    } catch {
      return null;
    }
  }
  for (const candidate of candidates.flatMap((value) => (Array.isArray(value) ? value : [value]))) {
    const response = asResponse(candidate);
    if (response && response.id === id) return response;
  }
  return null;
}

export interface ToolContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  /** The tool's structured answer: its structured content, or its text read as JSON. */
  payload: unknown;
  /** All of its text, joined. */
  text: string;
  isError: boolean;
}

/** A `tools/call` result, read the way Higgsfield's tools answer. */
export function readToolResult(result: unknown): ToolResult {
  const value = isObject(result) ? result : {};
  const content = Array.isArray(value["content"]) ? (value["content"] as ToolContentBlock[]) : [];
  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
  let payload: unknown = value["structuredContent"];
  if (payload === undefined || payload === null) payload = parseJsonText(text);
  return { payload, text, isError: value["isError"] === true };
}

/** Text read as JSON when it is JSON, else null. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Every value at `key` anywhere inside `value` (depth-limited). */
export function findAll(value: unknown, key: string, depth = 6): unknown[] {
  const found: unknown[] = [];
  const walk = (node: unknown, level: number) => {
    if (level > depth || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, level + 1);
      return;
    }
    for (const [name, child] of Object.entries(node)) {
      if (name === key) found.push(child);
      walk(child, level + 1);
    }
  };
  walk(value, 0);
  return found;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The first https URL in a tool's answer under one of `keys`, if any. */
export function firstUrl(value: unknown, keys: string[]): string | null {
  for (const key of keys) {
    for (const found of findAll(value, key)) {
      if (typeof found === "string" && /^https:\/\//i.test(found)) return found;
    }
  }
  return null;
}
