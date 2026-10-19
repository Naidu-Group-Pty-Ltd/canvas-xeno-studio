/**
 * Runs a brand import's long part from the page (see ./import-stream.server)
 * and follows it: the import's id as soon as the server has made it, then how
 * it ended. Once the id is known the import's row is the truth, so a stream
 * that drops part-way (a network blip, a proxy) ends this quietly and the
 * page goes on following the row.
 */
import { supabase } from "@/integrations/supabase/client";
import { decodeEventStream } from "../event-stream";
import type { BrandImportEvent, BrandImportRequest } from "./import-request";

export interface BrandImportOutcome {
  importId: string;
  ok: boolean;
  error: string | null;
  /** The stream ended before it said how: follow the import's row. */
  dropped: boolean;
}

const ENDPOINT = "/api/public/brand-import";

export async function streamBrandImport(
  body: BrandImportRequest,
  onImport: (importId: string) => void,
): Promise<BrandImportOutcome> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to import a brand");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const reason = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(reason?.error ?? `The import couldn't start (${response.status})`);
  }
  let importId: string | null = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = decodeEventStream<BrandImportEvent>(buffer);
      buffer = rest;
      for (const event of events) {
        if (event.type === "import") {
          importId = event.importId;
          onImport(event.importId);
        } else if (event.type === "done")
          return { importId: event.importId, ok: event.ok, error: event.error, dropped: false };
        else throw new Error(event.error);
      }
    }
  } catch (error) {
    if (!importId) throw error;
  }
  if (!importId) throw new Error("The import couldn't start");
  return { importId, ok: true, error: null, dropped: true };
}
