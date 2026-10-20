/**
 * Personal API tokens for the studio's API and MCP server: "xs_" and 43
 * random letters and digits (256 bits). Only a SHA-256 hash of a token is
 * kept; its first characters tell tokens apart in Settings.
 *
 * Shared by the server, the browser and tests.
 */

export const TOKEN_PREFIX = "xs_";
const TOKEN_BODY = 43;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** What a token may do. */
export const API_SCOPES = ["read", "generate", "edit"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  read: "Read: models, files, generations, long videos, edits and renders, and prices",
  generate: "Generate: queue generations, start and steer long videos (spends credits)",
  edit: "Edit: make and change edits, apply brand kits and render; import pictures and save characters",
};

/** A new token, from a cryptographic random source. */
export function newApiToken(random: (bytes: Uint8Array) => Uint8Array): string {
  // Rejection sampling keeps every character equally likely.
  const out: string[] = [];
  while (out.length < TOKEN_BODY) {
    for (const byte of random(new Uint8Array(64))) {
      if (byte < 248 && out.length < TOKEN_BODY) out.push(ALPHABET[byte % 62]!);
    }
  }
  return `${TOKEN_PREFIX}${out.join("")}`;
}

/** Whether a string is shaped like a studio token (it may still not be one). */
export function isTokenShaped(value: string): boolean {
  return new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9]{${TOKEN_BODY}}$`).test(value);
}

/** The first characters of a token, shown to tell it apart. */
export function tokenPrefixOf(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 5);
}
