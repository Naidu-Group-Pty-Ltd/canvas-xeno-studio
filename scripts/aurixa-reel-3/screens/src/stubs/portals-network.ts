/**
 * The partner portals' network layer, the harness's. The Finance Portal and the Client Portal do not call the backend
 * through src/lib/secureInvoke.ts: each has its own session and calls `${SUPABASE_URL}/functions/v1/<name>` with
 * `fetch` (useFinancePortalAuth's invokeFinanceFunction; usePortalAuth's invokePortalFunction, usePortalData's
 * invokePortalEdge, the notification context, the Message Hub's client transport). While a portal screen is open, those
 * requests go to the harness's backend instead (../../engine/handlers/portals.ts), as secureInvoke's stand-in sends the
 * Command Centre's, so the product's own auth providers, hooks and pages run unchanged and nothing reaches a Supabase
 * host.
 *
 * What the browser would carry besides the request body goes with it: the request's own headers (the portal's session
 * header, once the session check has handed the token back) and the portal's HttpOnly session cookie, the one the
 * person's sign-in set (Jamie's `__Host-finance_session_token`, Jordan's `__Host-client_session_token`; the tokens are
 * the sessions in engine/extras/portals-finance.json and portals-client.json). The page's clock (the demo's, which the
 * capture sets) goes too, so the backend reads a session's expiry or a last login on the film's clock.
 */
import { SUPABASE_URL } from "@/integrations/supabase/env";

/** Jamie Chen's Finance Portal session (finance_portal_users.session_token, extras/portals-finance.json). */
export const FINANCE_SESSION_COOKIE =
  "__Host-finance_session_token=4f1c9e27b8d34a6f92e5c0b7a1d84e3f6b2c9a05d7e148f3a6c2b9e0d5f71a84";
/** Jordan Ellis' Client Portal session (client_portal_sessions.session_token, extras/portals-client.json). */
export const CLIENT_SESSION_COOKIE = "__Host-client_session_token=8d2f6a41-93c7-4e5b-b1a8-6f0e4c27d913";

const ENGINE = `http://localhost:${new URLSearchParams(location.search).get("engine") ?? 5299}/fn/`;

/** Sends the portal's function calls to the harness's backend, carrying `cookie`. Installed once per page. */
export function installPortalNetwork(cookie: string) {
  const w = window as any;
  if (w.__portalNetwork) return;
  w.__portalNetwork = cookie;
  w.__calls ??= [];
  const prefix = `${SUPABASE_URL}/functions/v1/`;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(prefix)) return real(input, init);
    const name = url.slice(prefix.length).split("?")[0];
    w.__calls.push(name);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      if (key.startsWith("x-")) headers[key] = value;
    });
    headers.cookie = cookie;
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    return real(ENGINE + name, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, __reel: { headers, now: Date.now() } }),
    });
  };
}
