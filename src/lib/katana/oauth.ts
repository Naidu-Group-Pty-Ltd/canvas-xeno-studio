/**
 * OAuth helpers for signing the studio in to Higgsfield (authorization code
 * with PKCE, as Higgsfield's MCP server asks of its clients). Pure: Web Crypto
 * only, so they run the same on the server and in tests.
 */

export const HIGGSFIELD_RESOURCE_METADATA_URL =
  "https://mcp.higgsfield.ai/.well-known/oauth-protected-resource";

/** What the studio asks for: who the account is, and a refresh token. */
export const HIGGSFIELD_SCOPES = ["openid", "email", "offline_access"];

/** The callback Higgsfield's sign-in sends the admin back to. */
export const OAUTH_CALLBACK_PATH = "/api/public/higgsfield-oauth";

/** How long a started sign-in can be finished. */
export const OAUTH_STATE_TTL_MS = 15 * 60_000;

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** The S256 code challenge for a PKCE verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** A JWT's claims, unverified: only for showing who signed in. */
export function decodeJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
    );
    const claims = JSON.parse(json) as unknown;
    return typeof claims === "object" && claims !== null && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface AuthorizeUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  resource: string;
}

export function authorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", input.resource);
  return url.toString();
}

/**
 * Where to send the admin back after signing in: the studio address they
 * started from when it is one of the studio's own (its published address or a
 * Lovable preview), else the published address. Never an arbitrary site.
 */
export function allowedReturnOrigin(origin: string | null | undefined, appBase: string): string {
  const fallback = new URL(appBase).origin;
  if (!origin) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return fallback;
  }
  if (parsed.origin === fallback) return fallback;
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"))
    return parsed.origin;
  if (parsed.protocol !== "https:") return fallback;
  if (/\.(lovable\.app|lovableproject\.com|lovable\.dev)$/.test(host)) return parsed.origin;
  return fallback;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  idToken: string | null;
}

/** A token endpoint's answer, or null when it holds no access token. */
export function readTokenResponse(body: unknown, now = Date.now()): TokenResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  const accessToken = value["access_token"];
  if (typeof accessToken !== "string" || !accessToken) return null;
  const expiresIn = Number(value["expires_in"]);
  return {
    accessToken,
    refreshToken:
      typeof value["refresh_token"] === "string" && value["refresh_token"]
        ? value["refresh_token"]
        : null,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now + expiresIn * 1000).toISOString()
        : null,
    scope: typeof value["scope"] === "string" ? value["scope"] : null,
    idToken: typeof value["id_token"] === "string" ? value["id_token"] : null,
  };
}

/**
 * Whether a token endpoint's refusal means the sign-in itself is over: the
 * OAuth error codes (RFC 6749 §5.2) for a refresh token or a client that is no
 * longer accepted. Anything else (a rate limit, a server fault, an unreadable
 * answer) may pass, so the connection is kept.
 */
export function signInEnded(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const code = (body as Record<string, unknown>)["error"];
  return code === "invalid_grant" || code === "invalid_client" || code === "unauthorized_client";
}

/** The account a sign-in was for, from its ID token's claims. */
export function accountFromClaims(claims: Record<string, unknown> | null): {
  email: string | null;
  name: string | null;
  subject: string | null;
} {
  if (!claims) return { email: null, name: null, subject: null };
  const text = (key: string) =>
    typeof claims[key] === "string" && claims[key] ? (claims[key] as string) : null;
  const given = text("given_name");
  const family = text("family_name");
  const name =
    text("name") ?? ([given, family].filter(Boolean).join(" ") || text("preferred_username"));
  return { email: text("email"), name: name || null, subject: text("sub") };
}
