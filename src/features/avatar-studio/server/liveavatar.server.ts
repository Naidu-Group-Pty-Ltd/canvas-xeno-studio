/**
 * LiveAvatar realtime provider (server-only). Separate surface from HeyGen video:
 * separate key (LIVEAVATAR_API_KEY), separate host, separate lifecycle.
 * Contract: docs.liveavatar.com API reference (sessions/token, sessions/start, sessions/stop, sessions/keep-alive).
 */
export const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

function base(): string {
  return (process.env["LIVEAVATAR_API_URL"] || "https://api.liveavatar.com").replace(/\/+$/, "");
}

export function liveAvatarConfigured(): boolean {
  return !!process.env["LIVEAVATAR_API_KEY"];
}

interface LAResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  errorMessage?: string;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; bearer?: string }): Promise<LAResult<T>> {
  const key = process.env["LIVEAVATAR_API_KEY"];
  if (!key && !init.bearer) return { ok: false, status: 0, errorMessage: "LIVEAVATAR_API_KEY not configured" };
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.bearer) headers["Authorization"] = `Bearer ${init.bearer}`;
  else headers["X-API-KEY"] = key!;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(base() + path, {
      method: init.method,
      headers,
      body: init.body === undefined ? null : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: number; data?: T; message?: string; detail?: unknown };
    if (!res.ok) {
      const msg = typeof json.message === "string" ? json.message : typeof json.detail === "string" ? json.detail : `LiveAvatar returned ${res.status}`;
      return { ok: false, status: res.status, errorMessage: msg.slice(0, 300) };
    }
    return { ok: true, status: res.status, data: (json.data ?? (json as unknown as T)) as T };
  } catch {
    return { ok: false, status: 0, errorMessage: "Could not reach LiveAvatar" };
  }
}

export const HeyGenLiveAvatarProvider = {
  listAvatars: (scope: "public" | "user") =>
    call<{ results?: { id: string; name: string; preview_url?: string; status?: string }[] } | { id: string; name: string; preview_url?: string }[]>(
      scope === "public" ? "/v1/avatars/public?page_size=100" : "/v1/avatars?page_size=100",
      { method: "GET" },
    ),
  createSessionToken: (body: {
    mode: "FULL";
    avatar_id: string;
    is_sandbox?: boolean;
    max_session_duration?: number;
    avatar_persona?: { voice_id?: string; context_id?: string; language?: string };
  }) => call<{ session_id: string; session_token: string }>("/v1/sessions/token", { method: "POST", body }),
  startSession: (sessionToken: string) =>
    call<{ session_id: string; livekit_url: string; livekit_client_token: string; max_session_duration?: number }>("/v1/sessions/start", {
      method: "POST",
      bearer: sessionToken,
    }),
  keepAlive: (sessionToken: string, sessionId: string) =>
    call<null>("/v1/sessions/keep-alive", { method: "POST", bearer: sessionToken, body: { session_id: sessionId } }),
  stopSession: (sessionToken: string, sessionId: string, reason: "USER_CLOSED" | "USER_DISCONNECTED" | "IDLE_TIMEOUT" | "ZOMBIE_SESSION_REAP" | "UNKNOWN") =>
    call<null>("/v1/sessions/stop", { method: "POST", bearer: sessionToken, body: { session_id: sessionId, reason } }),
};
