/**
 * The harness's stand-in for the product's src/lib/streamSecureFunction.ts: the same exports, the stream opened on the
 * harness's backend instead of `${SUPABASE_URL}/functions/v1/<name>`, and the product's own reader of it.
 *
 * - `openSecureStream` posts the body to the backend (../../engine/server.ts, `fn/<name>`). The backend answers in
 *   JSON, so a function that streams answers `{ "__stream": [{ "after": ms, "text": "<SSE text>" }, ...] }`: the
 *   Server-Sent-Events text the product's function writes, chunk by chunk, each `after` ms after the one before
 *   (engine/handlers/agent.ts writes ai-dashboard-agent's, `event: <name>\ndata: <json>\n\n` and `data: [DONE]\n\n`).
 *   They are handed back as a streaming Response, as the function's own would arrive.
 * - `streamSecureFunction` is the product's, unchanged (src/lib/streamSecureFunction.ts, lines 119-166).
 * - While a stream is open it is counted on `window.__calls` every 400 ms, so a capture waits for it to end as it
 *   waits for any other call (capture.cjs `settle`).
 *
 * A refusal is thrown as the product throws it: the function's own `error`, or "Stream request failed: …".
 */

export interface StreamEvent {
  event: string;
  data: any;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

const ENGINE = `http://localhost:${new URLSearchParams(location.search).get("engine") ?? 5299}/fn/`;

/** The `error` a function's JSON refusal names, or null where the body is not one (the product's own). */
function serverError(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail);
    return typeof parsed?.error === "string" && parsed.error.trim() ? parsed.error.trim() : null;
  } catch {
    return null;
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("The stream was stopped", "AbortError"));
    const t = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("The stream was stopped", "AbortError"));
    });
  });

export async function openSecureStream(
  functionName: string,
  body: Record<string, any>,
  options: StreamOptions = {},
): Promise<Response> {
  const calls = ((window as any).__calls ??= []) as string[];
  calls.push(functionName);
  const res = await fetch(ENGINE + functionName, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  const detail = await res.text();
  if (!res.ok) {
    const named = serverError(detail.slice(0, 400));
    throw new Error(named ?? `Stream request failed: ${res.status} ${detail.slice(0, 400)}`.trim());
  }
  let chunks: Array<{ after?: number; text: string }> | null = null;
  try {
    const parsed = JSON.parse(detail);
    if (Array.isArray(parsed?.__stream)) chunks = parsed.__stream;
  } catch {
    /* not JSON: handed back as it came */
  }
  if (!chunks) return new Response(detail, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });

  const encoder = new TextEncoder();
  const heartbeat = setInterval(() => calls.push(`${functionName} (streaming)`), 400);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const chunk of chunks!) {
          await wait(chunk.after ?? 0, options.signal);
          controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        clearInterval(heartbeat);
      }
    },
    cancel() {
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

/**
 * Async iterator over SSE events from an edge function.
 * Throws on non-2xx responses. Aborts cleanly when the signal fires.
 */
export async function* streamSecureFunction(
  functionName: string,
  body: Record<string, any>,
  options: StreamOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await openSecureStream(functionName, body, options);

  if (!response.body) throw new Error(`Stream request failed: ${response.status} (no response body)`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawBlock = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const lines = rawBlock.split("\n");
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        const dataStr = dataLines.join("\n");
        if (dataStr === "[DONE]") return;
        try {
          yield { event: eventName, data: JSON.parse(dataStr) };
        } catch {
          yield { event: eventName, data: dataStr };
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}
