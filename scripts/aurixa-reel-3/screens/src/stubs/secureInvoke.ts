/**
 * The harness's stand-in for the product's src/lib/secureInvoke.ts: the same exports, and every Edge Function call
 * posted to the harness's backend (../../engine/server.ts), where the product's own functions answer on Jordan's
 * record. Nothing reaches a Supabase host.
 */
export const AUTH_EXHAUSTED_EVENT = "npc-auth-exhausted";
export const markAuthFailure = (): void => undefined;
export const resetAuthFailures = (): void => undefined;
export const isAuthExhausted = (): boolean => false;
export const isStaleFunctionDeployment = (): boolean => false;
export const describeStaleDeployment = (name: string): string => `${name} is not deployed`;
export const describeAuthError = (): string | null => null;
export const isAuthFailureResponse = (): boolean => false;
export const isPermissionRefusal = (): boolean => false;
export const isRoleRefusal = (): boolean => false;
export const isElevationRefusal = (): boolean => false;
export interface InvokeResult<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
}
export const refreshAccessToken = async (): Promise<string | null> => "demo";
export const resolveAuthBearer = async (): Promise<string | null> => "demo";
export const hasActiveSession = (): boolean => true;
export const ensureActiveSession = async (): Promise<boolean> => true;

const ENGINE = `http://localhost:${new URLSearchParams(location.search).get("engine") ?? 5299}/fn/`;
(window as any).__calls = [];
export async function invokeSecureFunction<T = any>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<InvokeResult<T>> {
  (window as any).__calls.push(name);
  const res = await fetch(ENGINE + name, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    return {
      data,
      error: { message: data?.error ?? `${name} answered ${res.status}`, status: res.status },
    };
  return { data, error: null };
}
