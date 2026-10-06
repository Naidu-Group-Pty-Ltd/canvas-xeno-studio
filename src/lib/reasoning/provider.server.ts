/**
 * Reasoning provider abstraction (separate from the media provider).
 *
 * Two interchangeable backends:
 *  - OpenAI (Responses API) when OPENAI_API_KEY is configured.
 *  - The project's built-in Lovable AI gateway (LOVABLE_API_KEY), which Lovable
 *    provisions automatically, so the studio's AI features work without extra setup.
 *
 * Only structured, user-facing output is ever returned or stored — never hidden
 * chain-of-thought. The browser never talks to a reasoning provider directly.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StructuredRequest {
  system: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  images?: string[];
  /** Earlier conversation turns, oldest first, sent before `input`. */
  history?: ChatTurn[];
  timeoutMs?: number;
}

export interface StructuredResult<T = unknown> {
  ok: boolean;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  model?: string;
  durationMs: number;
}

export interface ReasoningProvider {
  id: ReasoningBackend;
  isConfigured(): boolean;
  generateStructured<T = unknown>(request: StructuredRequest): Promise<StructuredResult<T>>;
}

export type ReasoningBackend = "openai" | "lovable";
export type ReasoningPurpose = "supercomputer" | "director" | "qc" | "router";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_LOVABLE_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 150_000;

function openAIConfigured(): boolean {
  return !!process.env["OPENAI_API_KEY"]?.trim();
}

function lovableConfigured(): boolean {
  return !!process.env["LOVABLE_API_KEY"]?.trim();
}

/** True when any reasoning backend has credentials. */
export function reasoningConfigured(): boolean {
  return openAIConfigured() || lovableConfigured();
}

function failure<T>(
  code: string,
  message: string,
  model: string,
  started: number,
): StructuredResult<T> {
  return {
    ok: false,
    data: null,
    errorCode: code,
    errorMessage: message,
    model,
    durationMs: Date.now() - started,
  };
}

/** Maps an HTTP failure from either backend to a readable, non-technical reason. */
function httpFailure(
  backend: ReasoningBackend,
  status: number,
  model: string,
): { code: string; message: string } {
  const label = backend === "openai" ? "OpenAI" : "Lovable AI";
  if (status === 401 || status === 403)
    return { code: "REASONING_NOT_CONFIGURED", message: `${label} rejected the API key.` };
  if (status === 402)
    return {
      code: "REASONING_NO_CREDITS",
      message:
        backend === "lovable"
          ? "Lovable AI credits are used up. Top up the Lovable workspace, or add an OPENAI_API_KEY secret."
          : "The OpenAI account is out of credits.",
    };
  if (status === 404)
    return {
      code: "REASONING_MODEL_UNAVAILABLE",
      message: `${label} does not offer the model "${model}". Change it in Settings.`,
    };
  if (status === 429)
    return {
      code: "REASONING_RATE_LIMITED",
      message: `${label} is busy right now. Try again in a minute.`,
    };
  if (status === 400)
    return {
      code: "REASONING_FAILED",
      message: `${label} could not process this request (model "${model}").`,
    };
  return { code: "REASONING_FAILED", message: `${label} returned HTTP ${status}.` };
}

/** Reads a JSON object out of a reply, tolerating code fences some models add. */
export function parseJsonReply(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The model did not return valid JSON");
  }
}

/**
 * Function-calling schemas differ slightly between model vendors. This keeps
 * only the portable subset: no additionalProperties, no union types.
 */
export function toPortableSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toPortableSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "additionalProperties" || key === "$schema" || key === "strict") continue;
    if (key === "type" && Array.isArray(value)) {
      out["type"] = value.find((entry) => entry !== "null") ?? "string";
      continue;
    }
    out[key] = toPortableSchema(value);
  }
  return out;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI (Responses API)                                              */
/* ------------------------------------------------------------------ */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const openAIReasoningProvider: ReasoningProvider = {
  id: "openai",
  isConfigured: openAIConfigured,

  async generateStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
    const started = Date.now();
    const apiKey = process.env["OPENAI_API_KEY"]?.trim();
    const model = request.model ?? DEFAULT_OPENAI_MODEL;
    if (!apiKey)
      return failure("REASONING_NOT_CONFIGURED", "Reasoning provider not configured", model, 0);

    const content: Record<string, unknown>[] = [{ type: "input_text", text: request.input }];
    for (const url of request.images ?? []) content.push({ type: "input_image", image_url: url });

    try {
      const response = await timedFetch(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            instructions: request.system,
            input: [
              ...(request.history ?? []).map((turn) => ({
                role: turn.role,
                content: turn.content,
              })),
              { role: "user", content },
            ],
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName,
                strict: false,
                schema: request.schema,
              },
            },
          }),
        },
        request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );

      const raw = await response.text();
      const durationMs = Date.now() - started;
      console.log(
        JSON.stringify({ reasoning: "openai", model, http: response.status, durationMs }),
      );
      if (!response.ok) {
        const { code, message } = httpFailure("openai", response.status, model);
        return { ok: false, data: null, errorCode: code, errorMessage: message, model, durationMs };
      }

      const text = extractResponsesText(JSON.parse(raw) as Record<string, unknown>);
      if (!text)
        return {
          ok: false,
          data: null,
          errorCode: "REASONING_FAILED",
          errorMessage: "Empty response",
          model,
          durationMs,
        };
      return { ok: true, data: parseJsonReply(text) as T, model, durationMs };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return failure(
        aborted ? "REASONING_TIMEOUT" : "REASONING_FAILED",
        aborted
          ? "The reasoning model took too long to answer. Try again."
          : error instanceof Error
            ? error.message
            : "Reasoning request failed",
        model,
        started,
      );
    }
  },
};

function extractResponsesText(payload: Record<string, unknown>): string | null {
  if (typeof payload["output_text"] === "string" && payload["output_text"])
    return payload["output_text"] as string;
  const output = payload["output"];
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as Record<string, unknown>)["content"];
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = (part as Record<string, unknown>)["text"];
          if (typeof text === "string" && text.trim()) return text;
        }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Lovable AI gateway (OpenAI-compatible chat completions)             */
/* ------------------------------------------------------------------ */

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const lovableReasoningProvider: ReasoningProvider = {
  id: "lovable",
  isConfigured: lovableConfigured,

  async generateStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
    const started = Date.now();
    const apiKey = process.env["LOVABLE_API_KEY"]?.trim();
    const model = request.model ?? DEFAULT_LOVABLE_MODEL;
    if (!apiKey)
      return failure("REASONING_NOT_CONFIGURED", "Reasoning provider not configured", model, 0);

    const userContent = request.images?.length
      ? [
          { type: "text", text: request.input },
          ...request.images.map((url) => ({ type: "image_url", image_url: { url } })),
        ]
      : request.input;
    const messages = [
      { role: "system", content: request.system },
      ...(request.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: userContent },
    ];
    const parameters = toPortableSchema(request.schema);

    async function call(body: Record<string, unknown>) {
      const response = await timedFetch(
        LOVABLE_GATEWAY_URL,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const raw = await response.text();
      console.log(
        JSON.stringify({
          reasoning: "lovable",
          model,
          http: response.status,
          durationMs: Date.now() - started,
        }),
      );
      return { response, raw };
    }

    try {
      // Structured output through a forced function call works across the
      // gateway's model vendors.
      let { response, raw } = await call({
        model,
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: request.schemaName,
              description: "Return the structured result.",
              parameters,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: request.schemaName } },
      });

      // A model that rejects tool calling still answers plain JSON when asked.
      if (response.status === 400) {
        ({ response, raw } = await call({
          model,
          messages: [
            {
              role: "system",
              content: `${request.system}\n\nRespond with a single JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(parameters)}`,
            },
            ...messages.slice(1),
          ],
        }));
      }

      const durationMs = Date.now() - started;
      if (!response.ok) {
        const { code, message } = httpFailure("lovable", response.status, model);
        return { ok: false, data: null, errorCode: code, errorMessage: message, model, durationMs };
      }

      const payload = JSON.parse(raw) as {
        choices?: {
          message?: { content?: unknown; tool_calls?: { function?: { arguments?: unknown } }[] };
        }[];
      };
      const message = payload.choices?.[0]?.message;
      const args = message?.tool_calls?.[0]?.function?.arguments;
      if (typeof args === "string" && args.trim())
        return { ok: true, data: parseJsonReply(args) as T, model, durationMs };
      if (args && typeof args === "object") return { ok: true, data: args as T, model, durationMs };
      if (typeof message?.content === "string" && message.content.trim())
        return { ok: true, data: parseJsonReply(message.content) as T, model, durationMs };
      return {
        ok: false,
        data: null,
        errorCode: "REASONING_FAILED",
        errorMessage: "Empty response",
        model,
        durationMs,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return failure(
        aborted ? "REASONING_TIMEOUT" : "REASONING_FAILED",
        aborted
          ? "The reasoning model took too long to answer. Try again."
          : error instanceof Error
            ? error.message
            : "Reasoning request failed",
        model,
        started,
      );
    }
  },
};

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

export interface ReasoningRoute {
  provider: ReasoningProvider;
  backend: ReasoningBackend;
  model: string;
}

export interface ReasoningStatus {
  configured: boolean;
  enabled: boolean;
  backend: ReasoningBackend | null;
  model: string | null;
  preference: "auto" | ReasoningBackend;
  backends: Record<ReasoningBackend, boolean>;
}

const PURPOSE_SETTING: Record<ReasoningPurpose, string> = {
  supercomputer: "supercomputer_model",
  director: "director_model",
  qc: "qc_model",
  router: "router_model",
};

async function readSettings(keys: string[]): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").in("key", keys);
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

function pickBackend(preference: unknown): ReasoningBackend | null {
  const available: Record<ReasoningBackend, boolean> = {
    openai: openAIConfigured(),
    lovable: lovableConfigured(),
  };
  if (preference === "openai" && available.openai) return "openai";
  if (preference === "lovable" && available.lovable) return "lovable";
  // "auto", or the preferred backend has no credentials: use whatever is configured.
  if (available.openai) return "openai";
  if (available.lovable) return "lovable";
  return null;
}

/**
 * Model names are backend-specific: gateway models are namespaced
 * ("google/gemini-…"), OpenAI models are not ("gpt-…").
 */
function pickModel(
  backend: ReasoningBackend,
  purposeValue: unknown,
  gatewayDefault: unknown,
): string {
  const value = typeof purposeValue === "string" ? purposeValue.trim() : "";
  if (backend === "openai") return value && !value.includes("/") ? value : DEFAULT_OPENAI_MODEL;
  if (value.includes("/")) return value;
  return typeof gatewayDefault === "string" && gatewayDefault.trim()
    ? gatewayDefault.trim()
    : DEFAULT_LOVABLE_MODEL;
}

/** The backend and model to use for a purpose, or null when reasoning is unavailable. */
export async function resolveReasoning(purpose: ReasoningPurpose): Promise<ReasoningRoute | null> {
  const settingKey = PURPOSE_SETTING[purpose];
  const settings = await readSettings([
    "reasoning_enabled",
    "reasoning_provider",
    "lovable_ai_model",
    settingKey,
  ]);
  if (settings["reasoning_enabled"] === false) return null;
  const backend = pickBackend(settings["reasoning_provider"]);
  if (!backend) return null;
  return {
    backend,
    provider: backend === "openai" ? openAIReasoningProvider : lovableReasoningProvider,
    model: pickModel(backend, settings[settingKey], settings["lovable_ai_model"]),
  };
}

/** Safe status for the UI — never includes a key. */
export async function reasoningStatus(
  purpose: ReasoningPurpose = "supercomputer",
): Promise<ReasoningStatus> {
  const settingKey = PURPOSE_SETTING[purpose];
  const settings = await readSettings([
    "reasoning_enabled",
    "reasoning_provider",
    "lovable_ai_model",
    settingKey,
  ]);
  const preference =
    settings["reasoning_provider"] === "openai" || settings["reasoning_provider"] === "lovable"
      ? (settings["reasoning_provider"] as ReasoningBackend)
      : "auto";
  const enabled = settings["reasoning_enabled"] !== false;
  const backend = enabled ? pickBackend(preference) : null;
  return {
    configured: reasoningConfigured(),
    enabled,
    backend,
    model: backend ? pickModel(backend, settings[settingKey], settings["lovable_ai_model"]) : null,
    preference,
    backends: { openai: openAIConfigured(), lovable: lovableConfigured() },
  };
}
