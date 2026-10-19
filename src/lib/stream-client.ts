/**
 * Asking one of the studio's streaming endpoints for an answer as the
 * signed-in person (`Authorization: Bearer <access token>`), and waiting for
 * it while the endpoint keeps the request alive (see ./event-stream.server).
 */
import { supabase } from "@/integrations/supabase/client";
import { decodeEventStream } from "./event-stream";

/**
 * POSTs `body` to `endpoint` and reads its events until `answer` returns one
 * (or throws). `signInTo` says what signing in again is for; `failed` starts
 * the error for a refused request; `lost` is the error when the stream ends
 * without an answer.
 */
export async function streamedAnswer<T extends { type: string }, R>(
  endpoint: string,
  body: unknown,
  options: {
    signInTo: string;
    failed: string;
    lost: string;
    answer: (event: T) => R | undefined;
  },
): Promise<R> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(`Sign in again to ${options.signInTo}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const reason = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(reason?.error ?? `${options.failed} (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = decodeEventStream<T>(buffer);
    buffer = rest;
    for (const event of events) {
      const result = options.answer(event);
      if (result !== undefined) {
        void reader.cancel().catch(() => undefined);
        return result;
      }
    }
  }
  throw new Error(options.lost);
}
