/**
 * A response that streams events (see ./event-stream) while slow work runs:
 * a keep-alive every ten seconds until the work sends its answer. The gateway
 * in front of the studio gives up on a request that has sent nothing for
 * thirty seconds, and an AI answer can take longer.
 */
import { encodeStreamEvent, KEEP_ALIVE } from "./event-stream";

const KEEP_ALIVE_MS = 10_000;

/** Runs `work`, streaming what it sends; it catches its own errors and sends them as events. */
export function eventStreamResponse<T extends { type: string }>(
  work: (send: (event: T) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const beat = setInterval(() => write(KEEP_ALIVE), KEEP_ALIVE_MS);
      try {
        await work((event) => write(encodeStreamEvent(event)));
      } finally {
        clearInterval(beat);
        open = false;
        try {
          controller.close();
        } catch {
          // Already closed by the page.
        }
      }
    },
    cancel() {},
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/** A request refused before any work starts: 401 when the person isn't signed in, else 400. */
export function refusedRequest(error: string, signedOut: boolean): Response {
  return new Response(JSON.stringify({ error }), {
    status: signedOut ? 401 : 400,
    headers: { "content-type": "application/json" },
  });
}
