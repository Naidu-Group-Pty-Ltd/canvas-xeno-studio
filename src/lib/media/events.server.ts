/**
 * Operation events written when the media worker reports a result.
 *
 * An operation has one completion event. Its id is derived from the
 * operation's own id, so a repeated report (the worker repeats one the app
 * couldn't fully record) logs the event if it is still missing and can never
 * log it twice, whatever else landed before.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function completionEventId(operationId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`operation-completed:${operationId}`),
    ),
  );
  // Laid out as a version 4 UUID so it fits the id column.
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Logs an operation's completion event once; an event already logged is not an error. */
export async function logOperationCompleted(
  operationId: string,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabaseAdmin.from("operation_events").insert({
    id: await completionEventId(operationId),
    operation_id: operationId,
    event_type: "completed",
    payload: payload as never,
  } as never);
  return { error: error && error.code !== "23505" ? error : null };
}
