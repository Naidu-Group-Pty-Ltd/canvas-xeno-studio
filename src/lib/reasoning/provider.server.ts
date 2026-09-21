/**
 * Reasoning provider abstraction (separate from the media provider).
 *
 * Only structured, user-facing output is ever returned or stored — never hidden
 * chain-of-thought. The browser never talks to the reasoning provider directly.
 */

export interface StructuredRequest {
  system: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  images?: string[];
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
  id: string;
  isConfigured(): boolean;
  generateStructured<T = unknown>(request: StructuredRequest): Promise<StructuredResult<T>>;
}

export function reasoningConfigured(): boolean {
  return !!process.env["OPENAI_API_KEY"];
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const openAIReasoningProvider: ReasoningProvider = {
  id: "openai",
  isConfigured: reasoningConfigured,

  async generateStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
    const started = Date.now();
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return {
        ok: false,
        data: null,
        errorCode: "REASONING_NOT_CONFIGURED",
        errorMessage: "Reasoning provider not configured",
        durationMs: 0,
      };
    }

    const model = request.model ?? "gpt-5.6-sol";
    const content: Record<string, unknown>[] = [{ type: "input_text", text: request.input }];
    for (const url of request.images ?? []) content.push({ type: "input_image", image_url: url });

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: request.system,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: false,
              schema: request.schema,
            },
          },
        }),
      });

      const raw = await response.text();
      const durationMs = Date.now() - started;
      if (!response.ok) {
        console.log(JSON.stringify({ reasoning: "openai", http: response.status, durationMs }));
        return {
          ok: false,
          data: null,
          errorCode: response.status === 401 ? "REASONING_NOT_CONFIGURED" : "REASONING_FAILED",
          errorMessage: `Reasoning provider returned HTTP ${response.status}`,
          model,
          durationMs,
        };
      }

      const payload = JSON.parse(raw) as Record<string, unknown>;
      const text = extractOutputText(payload);
      if (!text) {
        return { ok: false, data: null, errorCode: "REASONING_FAILED", errorMessage: "Empty response", model, durationMs };
      }
      return { ok: true, data: JSON.parse(text) as T, model, durationMs };
    } catch (error) {
      return {
        ok: false,
        data: null,
        errorCode: "REASONING_FAILED",
        errorMessage: error instanceof Error ? error.message : "Reasoning request failed",
        model,
        durationMs: Date.now() - started,
      };
    }
  },
};

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload["output_text"] === "string" && payload["output_text"]) return payload["output_text"] as string;
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
