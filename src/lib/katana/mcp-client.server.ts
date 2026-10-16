/**
 * The studio's own connection to Higgsfield's MCP server, signed in as the
 * team's Higgsfield account. It prices the paid calls Katana asks to make,
 * hands Katana the studio's media and finds the finished video's file. One
 * client is one MCP session; open it for a piece of work and close it after.
 */
import {
  HIGGSFIELD_MCP_URL,
  MCP_PROTOCOL_VERSION,
  findJsonRpcResponse,
  isObject,
  readToolResult,
  type ToolResult,
} from "./mcp";

export type McpErrorKind = "auth" | "session" | "http" | "network" | "protocol" | "tool";

export class HiggsfieldMcpError extends Error {
  kind: McpErrorKind;
  status: number | undefined;
  constructor(kind: McpErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface HiggsfieldMcpClient {
  /** Calls one tool; a tool's own error comes back as `isError`, not a throw. */
  callTool(
    name: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<ToolResult>;
  close(): Promise<void>;
}

interface ClientOptions {
  /** The current access token. */
  token: () => Promise<string>;
  /** A fresh token after the server refused one, or null when there is none. */
  refreshToken?: () => Promise<string | null>;
  timeoutMs?: number;
}

const CLIENT_INFO = { name: "xeno-studio", version: "1.0.0" };

export function createHiggsfieldMcpClient(options: ClientOptions): HiggsfieldMcpClient {
  let sessionId: string | null = null;
  let protocolVersion: string | null = null;
  let initialized = false;
  let nextId = 1;
  let token: string | null = null;
  const defaultTimeout = options.timeoutMs ?? 60_000;

  async function bearer(): Promise<string> {
    if (!token) token = await options.token();
    return token;
  }

  async function post(
    message: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<{ body: string; contentType: string | null; status: number }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${await bearer()}`,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
    let response: Response;
    try {
      response = await fetch(HIGGSFIELD_MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new HiggsfieldMcpError(
        "network",
        `Higgsfield could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const returnedSession = response.headers.get("mcp-session-id");
    if (returnedSession) sessionId = returnedSession;
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      throw new HiggsfieldMcpError(
        "auth",
        "Higgsfield refused the studio's sign-in",
        response.status,
      );
    }
    if (response.status === 404 && sessionId && message["method"] !== "initialize") {
      await response.body?.cancel().catch(() => undefined);
      throw new HiggsfieldMcpError("session", "The Higgsfield session ended", 404);
    }
    let body = "";
    try {
      body = await response.text();
    } catch (error) {
      throw new HiggsfieldMcpError(
        "network",
        `Higgsfield's answer was cut off: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok && response.status !== 202) {
      throw new HiggsfieldMcpError(
        "http",
        `Higgsfield answered ${response.status}: ${body.slice(0, 300)}`,
        response.status,
      );
    }
    return { body, contentType: response.headers.get("content-type"), status: response.status };
  }

  async function request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = nextId++;
    const { body, contentType } = await post({ jsonrpc: "2.0", id, method, params }, timeoutMs);
    const answer = findJsonRpcResponse(body, contentType, id);
    if (!answer) throw new HiggsfieldMcpError("protocol", `Higgsfield sent no answer to ${method}`);
    if (answer.error) {
      throw new HiggsfieldMcpError(
        "protocol",
        `Higgsfield ${method} failed: ${answer.error.message}`,
      );
    }
    return answer.result;
  }

  async function initialize(): Promise<void> {
    sessionId = null;
    protocolVersion = null;
    const result = await request(
      "initialize",
      { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      defaultTimeout,
    );
    const version = isObject(result) ? result["protocolVersion"] : null;
    protocolVersion = typeof version === "string" ? version : MCP_PROTOCOL_VERSION;
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, defaultTimeout);
    initialized = true;
  }

  async function callOnce(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolResult> {
    if (!initialized) await initialize();
    const result = await request("tools/call", { name, arguments: args }, timeoutMs);
    return readToolResult(result);
  }

  return {
    async callTool(name, args, callOptions = {}) {
      const timeoutMs = callOptions.timeoutMs ?? defaultTimeout;
      try {
        return await callOnce(name, args, timeoutMs);
      } catch (error) {
        if (!(error instanceof HiggsfieldMcpError)) throw error;
        if (error.kind === "auth" && options.refreshToken) {
          const fresh = await options.refreshToken();
          if (!fresh) throw error;
          token = fresh;
          initialized = false;
          return callOnce(name, args, timeoutMs);
        }
        if (error.kind === "session") {
          initialized = false;
          return callOnce(name, args, timeoutMs);
        }
        throw error;
      }
    },
    async close() {
      if (!sessionId || !token) return;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Mcp-Session-Id": sessionId,
      };
      if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
      await fetch(HIGGSFIELD_MCP_URL, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(5_000),
      })
        .then((response) => response.body?.cancel())
        .catch(() => undefined);
      sessionId = null;
      initialized = false;
    },
  };
}
