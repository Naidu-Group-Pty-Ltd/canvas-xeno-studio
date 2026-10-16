/**
 * The team's Higgsfield account, connected once by an admin: the sign-in
 * (OAuth with PKCE against Higgsfield's sign-in service, which its MCP server
 * names), and the tokens it gives. The studio is the only party that renews
 * them, one request at a time, so a refresh token is never spent twice; Katana
 * sessions are handed the current access token.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../higgsfield/errors";
import { appBaseUrl } from "../generation-pipeline.server";
import { HIGGSFIELD_MCP_URL, isObject } from "./mcp";
import { createHiggsfieldMcpClient, type HiggsfieldMcpClient } from "./mcp-client.server";
import {
  HIGGSFIELD_RESOURCE_METADATA_URL,
  HIGGSFIELD_SCOPES,
  OAUTH_CALLBACK_PATH,
  OAUTH_STATE_TTL_MS,
  accountFromClaims,
  allowedReturnOrigin,
  authorizeUrl,
  decodeJwtClaims,
  pkceChallenge,
  randomToken,
  readTokenResponse,
} from "./oauth";

type ConnectionRow = Database["public"]["Tables"]["higgsfield_connections"]["Row"];
type TokenAuthMethod = "none" | "client_secret_basic" | "client_secret_post";

const db = supabaseAdmin;
const TEAM = "team";

export const KATANA_TABLES_MISSING =
  "Katana needs a database update (migration 0015_katana). Ask an admin to apply it.";

export function isMissingTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|could not find the table/i.test(error.message ?? ""))
  );
}

// ---------- Discovery ----------

interface AuthServer {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  revocationEndpoint: string | null;
  resource: string;
  scopes: string[];
}

let discovered: { at: number; servers: AuthServer[] } | null = null;

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new AppError(
      "PROVIDER_TIMEOUT",
      `Higgsfield's sign-in details could not be read (${response.status})`,
    );
  const body = (await response.json()) as unknown;
  if (!isObject(body))
    throw new AppError("PROVIDER_REJECTED", "Higgsfield's sign-in details were not readable");
  return body;
}

async function authServerAt(
  issuer: string,
  resourceMeta: Record<string, unknown>,
): Promise<AuthServer> {
  const meta = await fetchJson(`${issuer}/.well-known/oauth-authorization-server`);
  const text = (key: string) =>
    typeof meta[key] === "string" && meta[key] ? (meta[key] as string) : null;
  const authorizationEndpoint = text("authorization_endpoint");
  const tokenEndpoint = text("token_endpoint");
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new AppError(
      "PROVIDER_REJECTED",
      "Higgsfield's sign-in service is missing its endpoints",
    );
  }
  const supported = Array.isArray(resourceMeta["scopes_supported"])
    ? (resourceMeta["scopes_supported"] as unknown[]).filter(
        (scope): scope is string => typeof scope === "string",
      )
    : [];
  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: text("registration_endpoint"),
    revocationEndpoint: text("revocation_endpoint"),
    resource:
      typeof resourceMeta["resource"] === "string" ? resourceMeta["resource"] : HIGGSFIELD_MCP_URL,
    scopes: supported.length
      ? HIGGSFIELD_SCOPES.filter((scope) => supported.includes(scope))
      : HIGGSFIELD_SCOPES,
  };
}

/**
 * Higgsfield's sign-in services, best first: the one its MCP server names,
 * then the one the MCP server hosts itself (for clients the first won't
 * register). Cached for ten minutes.
 */
async function authServers(): Promise<AuthServer[]> {
  if (discovered && Date.now() - discovered.at < 10 * 60_000) return discovered.servers;
  const resourceMeta = await fetchJson(HIGGSFIELD_RESOURCE_METADATA_URL);
  const named = Array.isArray(resourceMeta["authorization_servers"])
    ? resourceMeta["authorization_servers"]
    : [];
  const issuers = [
    ...named.filter((issuer): issuer is string => typeof issuer === "string"),
    new URL(HIGGSFIELD_MCP_URL).origin,
  ]
    .map((issuer) => issuer.replace(/\/$/, ""))
    .filter((issuer, index, all) => /^https:\/\//.test(issuer) && all.indexOf(issuer) === index);
  const servers: AuthServer[] = [];
  for (const issuer of issuers) {
    try {
      servers.push(await authServerAt(issuer, resourceMeta));
    } catch (error) {
      console.error("higgsfield sign-in service unreadable", { issuer, message: messageOf(error) });
    }
  }
  if (!servers.length) {
    throw new AppError("PROVIDER_REJECTED", "Higgsfield's sign-in service couldn't be found");
  }
  discovered = { at: Date.now(), servers };
  return servers;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------- The studio's OAuth client ----------

interface OAuthClient {
  clientId: string;
  clientSecret: string | null;
  authMethod: TokenAuthMethod;
}

function authMethodOf(value: unknown, secret: string | null): TokenAuthMethod {
  if ((value === "client_secret_basic" || value === "client_secret_post") && secret) return value;
  return "none";
}

/** The client the studio registered for this callback, registering it the first time. */
async function oauthClient(server: AuthServer, redirectUri: string): Promise<OAuthClient> {
  const existing = await db
    .from("higgsfield_oauth_clients")
    .select("client_id,client_secret,token_auth_method")
    .eq("issuer", server.issuer)
    .eq("redirect_uri", redirectUri)
    .maybeSingle();
  if (existing.error && isMissingTable(existing.error))
    throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
  if (existing.data) {
    return {
      clientId: existing.data.client_id,
      clientSecret: existing.data.client_secret,
      authMethod: authMethodOf(existing.data.token_auth_method, existing.data.client_secret),
    };
  }
  if (!server.registrationEndpoint) {
    throw new AppError(
      "PROVIDER_REJECTED",
      "Higgsfield's sign-in service doesn't let new apps register",
    );
  }
  const response = await fetch(server.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Xeno Studio",
      client_uri: appBaseUrl(),
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: server.scopes.join(" "),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  const clientId =
    isObject(body) && typeof body["client_id"] === "string" ? body["client_id"] : null;
  if (!response.ok || !clientId) {
    const reason =
      isObject(body) && typeof body["error_description"] === "string"
        ? body["error_description"]
        : isObject(body) && typeof body["error"] === "string"
          ? body["error"]
          : `HTTP ${response.status}`;
    throw new AppError(
      "PROVIDER_REJECTED",
      `Higgsfield's sign-in service didn't register the studio: ${reason}`,
    );
  }
  const clientSecret =
    isObject(body) && typeof body["client_secret"] === "string" ? body["client_secret"] : null;
  const authMethod = authMethodOf(
    isObject(body) ? body["token_endpoint_auth_method"] : null,
    clientSecret,
  );
  // Two admins registering at once: the first row stays, and both use it.
  await db.from("higgsfield_oauth_clients").upsert(
    {
      issuer: server.issuer,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      token_auth_method: authMethod,
    },
    { onConflict: "issuer,redirect_uri", ignoreDuplicates: true },
  );
  const stored = await db
    .from("higgsfield_oauth_clients")
    .select("client_id,client_secret,token_auth_method")
    .eq("issuer", server.issuer)
    .eq("redirect_uri", redirectUri)
    .maybeSingle();
  if (!stored.data) return { clientId, clientSecret, authMethod };
  return {
    clientId: stored.data.client_id,
    clientSecret: stored.data.client_secret,
    authMethod: authMethodOf(stored.data.token_auth_method, stored.data.client_secret),
  };
}

async function tokenRequest(
  endpoint: string,
  client: OAuthClient,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const form = new URLSearchParams(params);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (client.authMethod === "client_secret_basic" && client.clientSecret) {
    headers["Authorization"] =
      `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
  } else {
    form.set("client_id", client.clientId);
    if (client.authMethod === "client_secret_post" && client.clientSecret)
      form.set("client_secret", client.clientSecret);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, body };
}

function oauthError(body: unknown): string | null {
  if (!isObject(body)) return null;
  const description = body["error_description"];
  const code = body["error"];
  if (typeof description === "string" && description) return description;
  return typeof code === "string" ? code : null;
}

// ---------- Connecting ----------

/** Starts an admin's sign-in: the Higgsfield address to send their browser to. */
export async function beginHiggsfieldConnect(input: {
  userId: string;
  origin: string | null;
}): Promise<{ url: string }> {
  const redirectUri = `${appBaseUrl()}${OAUTH_CALLBACK_PATH}`;
  // The first sign-in service that registers the studio (or already has) is used.
  let chosen: { server: AuthServer; client: OAuthClient } | null = null;
  let lastError: unknown = null;
  for (const candidate of await authServers()) {
    try {
      chosen = { server: candidate, client: await oauthClient(candidate, redirectUri) };
      break;
    } catch (error) {
      if (error instanceof AppError && error.code === "PROVIDER_NOT_CONFIGURED") throw error;
      lastError = error;
    }
  }
  if (!chosen) {
    throw lastError instanceof Error
      ? lastError
      : new AppError("PROVIDER_REJECTED", "Higgsfield's sign-in didn't register the studio");
  }
  const { server, client } = chosen;
  const state = randomToken(24);
  const verifier = randomToken(48);
  const now = Date.now();
  await db.from("higgsfield_oauth_states").delete().lt("expires_at", new Date(now).toISOString());
  const { error } = await db.from("higgsfield_oauth_states").insert({
    state,
    code_verifier: verifier,
    issuer: server.issuer,
    client_id: client.clientId,
    redirect_uri: redirectUri,
    return_origin: allowedReturnOrigin(input.origin, appBaseUrl()),
    created_by: input.userId,
    expires_at: new Date(now + OAUTH_STATE_TTL_MS).toISOString(),
  });
  if (error) {
    if (isMissingTable(error)) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
    throw new AppError("STORAGE_FAILED", error.message);
  }
  return {
    url: authorizeUrl({
      authorizationEndpoint: server.authorizationEndpoint,
      clientId: client.clientId,
      redirectUri,
      scopes: server.scopes,
      state,
      codeChallenge: await pkceChallenge(verifier),
      resource: server.resource,
    }),
  };
}

export interface ConnectOutcome {
  ok: boolean;
  returnOrigin: string;
  message: string;
}

/** Finishes a sign-in from Higgsfield's callback: trades the code for tokens and keeps them. */
export async function completeHiggsfieldConnect(input: {
  state: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
}): Promise<ConnectOutcome> {
  const fallbackOrigin = new URL(appBaseUrl()).origin;
  const fail = (returnOrigin: string, message: string): ConnectOutcome => ({
    ok: false,
    returnOrigin,
    message,
  });
  if (!input.state)
    return fail(fallbackOrigin, "Higgsfield's answer was missing its sign-in reference.");
  // Taken out as it is read: a state is good for one sign-in only.
  const { data: pending, error: readError } = await db
    .from("higgsfield_oauth_states")
    .delete()
    .eq("state", input.state)
    .select("*")
    .maybeSingle();
  if (readError && isMissingTable(readError)) return fail(fallbackOrigin, KATANA_TABLES_MISSING);
  if (!pending)
    return fail(
      fallbackOrigin,
      "This sign-in has already been used or has expired. Start again from Settings.",
    );
  const returnOrigin = pending.return_origin || fallbackOrigin;
  if (Date.parse(pending.expires_at) < Date.now()) {
    return fail(returnOrigin, "The sign-in took too long and expired. Start again from Settings.");
  }
  if (input.error) {
    return fail(
      returnOrigin,
      `Higgsfield's sign-in wasn't completed: ${input.errorDescription || input.error}`,
    );
  }
  if (!input.code) return fail(returnOrigin, "Higgsfield's answer was missing its sign-in code.");

  const server = (await authServers()).find((candidate) => candidate.issuer === pending.issuer);
  if (!server) return fail(returnOrigin, "Higgsfield's sign-in service changed; start again.");
  const client = await oauthClient(server, pending.redirect_uri);
  if (client.clientId !== pending.client_id)
    return fail(returnOrigin, "The studio's Higgsfield app changed; start again.");

  const exchanged = await tokenRequest(server.tokenEndpoint, client, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: pending.redirect_uri,
    code_verifier: pending.code_verifier,
    resource: server.resource,
  });
  const tokens = exchanged.ok ? readTokenResponse(exchanged.body) : null;
  if (!tokens) {
    return fail(
      returnOrigin,
      `Higgsfield didn't accept the sign-in: ${oauthError(exchanged.body) ?? `HTTP ${exchanged.status}`}`,
    );
  }
  const account = accountFromClaims(decodeJwtClaims(tokens.idToken));
  const now = new Date().toISOString();
  const { error } = await db.from("higgsfield_connections").upsert({
    id: TEAM,
    status: "connected",
    issuer: server.issuer,
    token_endpoint: server.tokenEndpoint,
    revocation_endpoint: server.revocationEndpoint,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    token_auth_method: client.authMethod,
    scope: tokens.scope ?? server.scopes.join(" "),
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
    account_email: account.email,
    account_name: account.name,
    account_subject: account.subject,
    connected_by: pending.created_by,
    connected_at: now,
    refresh_claimed_until: null,
    last_refreshed_at: now,
    last_error: tokens.refreshToken
      ? null
      : "Higgsfield gave no refresh token, so the connection lasts only until its sign-in expires.",
  });
  if (error) return fail(returnOrigin, `The sign-in couldn't be saved: ${error.message}`);
  await shareToken(tokens.accessToken, tokens.expiresAt);
  return {
    ok: true,
    returnOrigin,
    message: account.email ? `Connected as ${account.email}.` : "Higgsfield account connected.",
  };
}

/** Disconnects the account: the tokens are revoked (where Higgsfield allows) and forgotten. */
export async function disconnectHiggsfield(): Promise<void> {
  const { data: connection } = await db
    .from("higgsfield_connections")
    .select("*")
    .eq("id", TEAM)
    .maybeSingle();
  if (
    connection?.revocation_endpoint &&
    connection.client_id &&
    (connection.refresh_token || connection.access_token)
  ) {
    const client: OAuthClient = {
      clientId: connection.client_id,
      clientSecret: connection.client_secret,
      authMethod: authMethodOf(connection.token_auth_method, connection.client_secret),
    };
    const token = connection.refresh_token ?? connection.access_token ?? "";
    await tokenRequest(connection.revocation_endpoint, client, {
      token,
      token_type_hint: connection.refresh_token ? "refresh_token" : "access_token",
    }).catch(() => undefined);
  }
  await db
    .from("higgsfield_connections")
    .update({
      status: "disconnected",
      access_token: null,
      refresh_token: null,
      expires_at: null,
      refresh_claimed_until: null,
      last_error: null,
    })
    .eq("id", TEAM);
  const { forgetVaultCredential } = await import("./agent.server");
  await forgetVaultCredential().catch((error: unknown) => {
    console.error("katana vault credential not cleared", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

// ---------- Tokens ----------

async function readConnection(): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from("higgsfield_connections")
    .select("*")
    .eq("id", TEAM)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new AppError("PROVIDER_NOT_CONFIGURED", KATANA_TABLES_MISSING);
    throw new AppError("STORAGE_FAILED", error.message);
  }
  return data;
}

function msLeft(connection: Pick<ConnectionRow, "expires_at">): number {
  return connection.expires_at
    ? Date.parse(connection.expires_at) - Date.now()
    : Number.POSITIVE_INFINITY;
}

const NOT_CONNECTED =
  "The team's Higgsfield account isn't connected. An admin can connect it in Settings.";

/** Gives Katana's vault the token too (never fails the caller). */
async function shareToken(accessToken: string, expiresAt: string | null): Promise<void> {
  try {
    const { syncVaultCredential } = await import("./agent.server");
    await syncVaultCredential({ accessToken, expiresAt });
  } catch (error) {
    console.error("katana vault credential not updated", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface HiggsfieldToken {
  accessToken: string;
  /** Null when Higgsfield gave no lifetime. */
  expiresAt: string | null;
}

/**
 * A usable access token with at least `minValidityMs` left, renewing it when
 * needed. Only one request renews at a time; the others wait for its result.
 */
export async function higgsfieldToken(
  options: { minValidityMs?: number } = {},
): Promise<HiggsfieldToken> {
  const minValidityMs = options.minValidityMs ?? 2 * 60_000;
  const connection = await readConnection();
  if (!connection || connection.status !== "connected" || !connection.access_token) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", connection?.last_error || NOT_CONNECTED);
  }
  if (msLeft(connection) > minValidityMs) {
    return { accessToken: connection.access_token, expiresAt: connection.expires_at };
  }
  return renewToken(minValidityMs);
}

export async function higgsfieldAccessToken(
  options: { minValidityMs?: number } = {},
): Promise<string> {
  return (await higgsfieldToken(options)).accessToken;
}

/** Renews the token now (after Higgsfield refused it), or null when it can't be. */
export async function renewHiggsfieldToken(): Promise<string | null> {
  try {
    return (await renewToken(Number.POSITIVE_INFINITY)).accessToken;
  } catch {
    return null;
  }
}

async function renewToken(minValidityMs: number): Promise<HiggsfieldToken> {
  const now = new Date();
  const { data: claimed } = await db
    .from("higgsfield_connections")
    .update({ refresh_claimed_until: new Date(now.getTime() + 30_000).toISOString() })
    .eq("id", TEAM)
    .eq("status", "connected")
    .or(`refresh_claimed_until.is.null,refresh_claimed_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();

  if (!claimed) {
    // Another request is renewing it: use its result.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const latest = await readConnection();
      if (!latest || latest.status !== "connected" || !latest.access_token) break;
      const renewedMeanwhile =
        latest.last_refreshed_at && Date.parse(latest.last_refreshed_at) >= now.getTime();
      if (renewedMeanwhile || msLeft(latest) > minValidityMs) {
        return { accessToken: latest.access_token, expiresAt: latest.expires_at };
      }
      if (!latest.refresh_claimed_until || Date.parse(latest.refresh_claimed_until) < Date.now())
        break;
    }
    const latest = await readConnection();
    if (
      latest?.status === "connected" &&
      latest.access_token &&
      msLeft(latest) > 0 &&
      minValidityMs !== Number.POSITIVE_INFINITY
    ) {
      return { accessToken: latest.access_token, expiresAt: latest.expires_at };
    }
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "Higgsfield's sign-in is being renewed. Try again in a moment.",
    );
  }

  const release = (values: Partial<ConnectionRow>) =>
    db
      .from("higgsfield_connections")
      .update({ ...values, refresh_claimed_until: null })
      .eq("id", TEAM);

  const current = claimed.access_token
    ? { accessToken: claimed.access_token, expiresAt: claimed.expires_at }
    : null;
  const stillValid = !!current && msLeft(claimed) > 0 && minValidityMs !== Number.POSITIVE_INFINITY;
  if (!claimed.refresh_token || !claimed.token_endpoint || !claimed.client_id) {
    if (stillValid && current) {
      await release({});
      return current;
    }
    await release({
      status: "error",
      last_error:
        "Higgsfield's sign-in expired and can't be renewed. Reconnect the account in Settings.",
    });
    throw new AppError(
      "PROVIDER_NOT_CONFIGURED",
      "Higgsfield's sign-in expired. An admin needs to reconnect it in Settings.",
    );
  }

  const client: OAuthClient = {
    clientId: claimed.client_id,
    clientSecret: claimed.client_secret,
    authMethod: authMethodOf(claimed.token_auth_method, claimed.client_secret),
  };
  let result: { ok: boolean; status: number; body: unknown };
  try {
    result = await tokenRequest(claimed.token_endpoint, client, {
      grant_type: "refresh_token",
      refresh_token: claimed.refresh_token,
      resource: HIGGSFIELD_MCP_URL,
    });
  } catch (error) {
    const message = `Higgsfield's sign-in couldn't be renewed: ${error instanceof Error ? error.message : String(error)}`;
    await release({ last_error: message });
    if (stillValid && current) return current;
    throw new AppError("PROVIDER_TIMEOUT", message);
  }

  const tokens = result.ok ? readTokenResponse(result.body) : null;
  if (!tokens) {
    const reason = oauthError(result.body) ?? `HTTP ${result.status}`;
    const dead = result.status === 400 || result.status === 401;
    await release(
      dead
        ? {
            status: "error",
            last_error: `Higgsfield ended the studio's sign-in (${reason}). Reconnect the account in Settings.`,
          }
        : { last_error: `Higgsfield's sign-in couldn't be renewed (${reason}).` },
    );
    if (!dead && stillValid && current) return current;
    throw new AppError(
      dead ? "PROVIDER_NOT_CONFIGURED" : "PROVIDER_TIMEOUT",
      dead
        ? "Higgsfield's sign-in ended. An admin needs to reconnect it in Settings."
        : `Higgsfield's sign-in couldn't be renewed (${reason}).`,
    );
  }

  await release({
    access_token: tokens.accessToken,
    // Higgsfield may hand out a new refresh token each time; the old one is then spent.
    refresh_token: tokens.refreshToken ?? claimed.refresh_token,
    expires_at: tokens.expiresAt,
    scope: tokens.scope ?? claimed.scope,
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
  });
  await shareToken(tokens.accessToken, tokens.expiresAt);
  return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
}

/** An MCP connection to Higgsfield as the team's account. Close it when done. */
export async function higgsfieldMcp(
  options: { timeoutMs?: number } = {},
): Promise<HiggsfieldMcpClient> {
  await higgsfieldAccessToken();
  return createHiggsfieldMcpClient({
    token: () => higgsfieldAccessToken(),
    refreshToken: () => renewHiggsfieldToken(),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}

// ---------- Status ----------

export interface HiggsfieldConnectionView {
  tablesReady: boolean;
  status: "connected" | "disconnected" | "error";
  accountEmail: string | null;
  accountName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  lastRefreshedAt: string | null;
  canRenew: boolean;
  lastError: string | null;
}

export async function higgsfieldConnectionStatus(): Promise<HiggsfieldConnectionView> {
  const { data, error } = await db
    .from("higgsfield_connections")
    .select("*")
    .eq("id", TEAM)
    .maybeSingle();
  const empty: HiggsfieldConnectionView = {
    tablesReady: !isMissingTable(error),
    status: "disconnected",
    accountEmail: null,
    accountName: null,
    connectedAt: null,
    expiresAt: null,
    lastRefreshedAt: null,
    canRenew: false,
    lastError: null,
  };
  if (error || !data) return empty;
  const status =
    data.status === "connected" || data.status === "error" ? data.status : "disconnected";
  return {
    tablesReady: true,
    status,
    accountEmail: status === "disconnected" ? null : data.account_email,
    accountName: status === "disconnected" ? null : data.account_name,
    connectedAt: data.connected_at,
    expiresAt: data.expires_at,
    lastRefreshedAt: data.last_refreshed_at,
    canRenew: !!data.refresh_token,
    lastError: data.last_error,
  };
}
