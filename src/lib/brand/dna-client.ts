/**
 * Asks the studio's AI to suggest a brand's DNA from the page (see
 * ./dna-stream.server) and waits for it.
 */
import { supabase } from "@/integrations/supabase/client";
import { decodeEventStream } from "../event-stream";
import { dnaOf, type BrandDna } from "./dna";
import type { DnaSuggestEvent, DnaSuggestRequest } from "./dna-request";

const ENDPOINT = "/api/public/brand-dna";

export async function suggestDna(
  body: DnaSuggestRequest,
): Promise<{ dna: BrandDna; model: string | null; read: string[] }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to read a brand's DNA");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const reason = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(reason?.error ?? `The brand couldn't be read (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = decodeEventStream<DnaSuggestEvent>(buffer);
    buffer = rest;
    for (const event of events) {
      if (event.type === "dna")
        return { dna: dnaOf(event.dna), model: event.model, read: event.read };
      throw new Error(event.error);
    }
  }
  throw new Error("The brand's DNA didn't come back. Try again.");
}
