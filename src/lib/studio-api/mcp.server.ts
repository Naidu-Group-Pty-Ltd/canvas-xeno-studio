/**
 * The studio as an MCP server (Model Context Protocol, over streamable HTTP):
 * an agent connects to /api/public/studio-mcp with a studio API token and is
 * offered the API's operations as tools (./tools.server). Stateless: every
 * request carries its token, and each JSON-RPC message gets one JSON answer
 * (no event stream). Also the plain HTTP API's error and result shapes.
 */
import { AppError } from "../higgsfield/errors";
import { authenticateApiRequest, type ApiCaller } from "./tokens.server";
import { runStudioTool, STUDIO_TOOLS, studioTool, toolInputSchema } from "./tools.server";

/** Protocol versions this server speaks, newest first. */
export const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

const SERVER_INFO = { name: "xeno-studio", title: "Xeno Studio", version: "1.0.0" };

const INSTRUCTIONS = [
  "Xeno Studio makes images and videos with generation models, presenter videos lip-synced to a voiceover, and finished edits.",
  "Typical flow: list_models and list_assets to find what to use; queue_generation (poll get_generation) for single images or videos;",
  "start_presenter_video for a presenter speaking a prepared voiceover (poll get_long_video; steer_clip or choose_take for weak clips);",
  "open_in_editor to lay it out as an edit, apply_brand_kit for the brand's look and end card, then render_edit (poll get_render).",
  "Generating spends real credits: give each request your own clientRequestId so a retry never runs twice.",
].join(" ");

type Json = Record<string, unknown>;
type JsonRpcId = string | number | null;

const JSON_HEADERS = { "Content-Type": "application/json" };

/** What a failed operation says, in words a caller can act on. */
export function errorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] } | null)?.issues;
  if (Array.isArray(issues))
    return {
      code: "INVALID_PARAMETERS",
      message: issues
        .slice(0, 5)
        .map((issue) => `${issue.path.map(String).join(".") || "input"}: ${issue.message}`)
        .join("; "),
    };
  console.error("studio api: operation failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return { code: "UNKNOWN", message: "Something went wrong. Try again." };
}

/** The HTTP status an operation's error is answered with. */
export function statusFor(code: string): number {
  if (code === "NOT_AUTHORIZED") return 403;
  if (code === "INVALID_PARAMETERS" || code === "BUDGET_EXCEEDED") return 400;
  if (code === "RATE_LIMITED") return 429;
  if (code === "PROVIDER_TIMEOUT") return 503;
  return 500;
}

function rpcError(id: JsonRpcId, code: number, message: string): Json {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: unknown): Json {
  return { jsonrpc: "2.0", id, result };
}

/** The tools a caller's token allows, as MCP lists them. */
export function toolList(caller: ApiCaller) {
  return STUDIO_TOOLS.filter((entry) => caller.scopes.has(entry.scope)).map((entry) => ({
    name: entry.name,
    title: entry.title,
    description: entry.description,
    inputSchema: toolInputSchema(entry),
    annotations: {
      title: entry.title,
      readOnlyHint: entry.readOnly,
      // Nothing deletes; generating spends credits, which a client should confirm.
      destructiveHint: false,
      idempotentHint: entry.readOnly,
      openWorldHint: entry.scope === "generate",
    },
  }));
}

/** One JSON-RPC message, answered (null for a notification, which gets no answer). */
export async function handleMcpMessage(message: unknown, caller: ApiCaller): Promise<Json | null> {
  const request = (message ?? {}) as Json;
  const id = (
    typeof request["id"] === "string" || typeof request["id"] === "number" ? request["id"] : null
  ) as JsonRpcId;
  const isNotification = !("id" in request);
  if (request["jsonrpc"] !== "2.0" || typeof request["method"] !== "string")
    return isNotification ? null : rpcError(id, -32600, "Invalid request");
  const method = request["method"];
  const params = (request["params"] ?? {}) as Json;
  if (isNotification) return null;

  switch (method) {
    case "initialize": {
      const asked = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "";
      return rpcResult(id, {
        protocolVersion: (MCP_VERSIONS as readonly string[]).includes(asked)
          ? asked
          : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: toolList(caller) });
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    case "tools/call": {
      const name = typeof params["name"] === "string" ? params["name"] : "";
      if (!studioTool(name)) return rpcError(id, -32602, `Unknown tool: ${name || "(none)"}`);
      try {
        const result = await runStudioTool(name, params["arguments"] ?? {}, caller);
        const structured =
          result && typeof result === "object" && !Array.isArray(result)
            ? (result as Json)
            : { result };
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: structured,
          isError: false,
        });
      } catch (error) {
        // A failed operation is the tool's answer (the agent can read it and try again), not a protocol error.
        const { code, message } = errorMessage(error);
        return rpcResult(id, {
          content: [{ type: "text", text: `${code}: ${message}` }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** A POST to the MCP endpoint: one JSON-RPC message (or a batch), answered as JSON. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok)
    return new Response(JSON.stringify(rpcError(null, -32001, auth.message)), {
      status: auth.status,
      headers: {
        ...JSON_HEADERS,
        ...(auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="xeno-studio"' } : {}),
      },
    });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
  const messages = Array.isArray(body) ? body : [body];
  if (!messages.length || messages.length > 20)
    return new Response(JSON.stringify(rpcError(null, -32600, "Invalid request")), {
      status: 400,
      headers: JSON_HEADERS,
    });
  const answers: Json[] = [];
  for (const message of messages) {
    const answer = await handleMcpMessage(message, auth.caller);
    if (answer) answers.push(answer);
  }
  // Notifications and responses only: accepted, nothing to say.
  if (!answers.length) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(Array.isArray(body) ? answers : answers[0]), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

/** The plain HTTP API: GET lists the operations, POST /<tool> runs one with a JSON body. */
export async function handleRestRequest(request: Request, name: string): Promise<Response> {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok)
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: auth.message } }),
      {
        status: auth.status,
        headers: JSON_HEADERS,
      },
    );
  if (request.method === "GET") {
    if (name !== "tools")
      return new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "GET /tools lists the operations" },
        }),
        { status: 404, headers: JSON_HEADERS },
      );
    return new Response(JSON.stringify({ tools: toolList(auth.caller) }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }
  if (!studioTool(name))
    return new Response(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: `There is no operation called ${name}` },
      }),
      { status: 404, headers: JSON_HEADERS },
    );
  let args: unknown = {};
  try {
    const text = await request.text();
    args = text.trim() ? JSON.parse(text) : {};
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_PARAMETERS", message: "The body must be JSON" } }),
      { status: 400, headers: JSON_HEADERS },
    );
  }
  try {
    const result = await runStudioTool(name, args, auth.caller);
    return new Response(JSON.stringify({ result }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    const failure = errorMessage(error);
    return new Response(JSON.stringify({ error: failure }), {
      status: statusFor(failure.code),
      headers: JSON_HEADERS,
    });
  }
}
