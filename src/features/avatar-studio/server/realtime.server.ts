/** Realtime session lifecycle + watchdog (server-only). Session tokens never reach the browser. */
import { HeyGenLiveAvatarProvider, liveAvatarConfigured } from "./liveavatar.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function logRealtimeEvent(sessionId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("avatar_realtime_events").insert({ session_id: sessionId, event_type: eventType, payload: payload as never });
}

export async function stopRealtimeSession(sessionId: string, reason: "USER_CLOSED" | "USER_DISCONNECTED" | "IDLE_TIMEOUT" | "ZOMBIE_SESSION_REAP") {
  const db = await admin();
  const { data: s } = await db.from("avatar_realtime_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s || ["ended", "failed", "orphaned"].includes(s.status)) return s;
  const { data: secret } = await db.from("avatar_realtime_session_secrets").select("session_token").eq("session_id", sessionId).maybeSingle();
  let stopped = true;
  if (secret?.session_token && s.provider_session_id && liveAvatarConfigured()) {
    const r = await HeyGenLiveAvatarProvider.stopSession(secret.session_token, s.provider_session_id, reason);
    stopped = r.ok;
    await logRealtimeEvent(sessionId, r.ok ? "provider_stopped" : "provider_stop_failed", { message: r.errorMessage ?? null });
  }
  const ended = new Date();
  const duration = s.started_at ? Math.max(0, Math.round((ended.getTime() - new Date(s.started_at).getTime()) / 1000)) : 0;
  const status = reason === "ZOMBIE_SESSION_REAP" ? "orphaned" : "ended";
  await db
    .from("avatar_realtime_sessions")
    .update({ status, ended_at: ended.toISOString(), duration_seconds: duration, end_reason: reason, error_message: stopped ? null : "Provider stop could not be confirmed" })
    .eq("id", sessionId);
  await db.from("avatar_realtime_session_secrets").delete().eq("session_id", sessionId);
  if (duration > 0) {
    await db.from("avatar_usage_ledger").insert({
      realtime_session_id: sessionId,
      user_id: s.created_by,
      provider: "liveavatar",
      usage_type: "realtime_seconds",
      quantity: duration,
      unit: "seconds",
      source: "internal_metric",
      metadata: { sandbox: s.is_sandbox } as never,
    });
  }
  if (s.job_id) await db.from("avatar_jobs").update({ status: "completed", completed_at: ended.toISOString() }).eq("id", s.job_id).neq("status", "completed");
  return { ...s, status };
}

/** Closes sessions whose browser stopped heartbeating, so nothing keeps billing. */
export async function watchdog() {
  const db = await admin();
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await db
    .from("avatar_realtime_sessions")
    .select("id,last_heartbeat_at,created_at,status")
    .in("status", ["requested", "token_issued", "connecting", "active", "stopping"])
    .or(`last_heartbeat_at.lt.${cutoff},and(last_heartbeat_at.is.null,created_at.lt.${cutoff})`)
    .limit(50);
  for (const s of data ?? []) await stopRealtimeSession(s.id, "ZOMBIE_SESSION_REAP");
  return data?.length ?? 0;
}
