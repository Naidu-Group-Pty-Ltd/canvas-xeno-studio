/**
 * What an emailed sign-in link (a password reset or a team invitation) put in
 * the page's address when it opened the studio.
 *
 * The auth client reads these values and then wipes them from the address, so
 * they are captured once, as soon as this module loads in the browser (before
 * the auth client starts): `initialAuthLink`.
 */

/** Where emailed links lead to choose a password. */
export const SET_PASSWORD_PATH = "/set-password";

/** The kinds of emailed link the studio asks someone to choose a password after. */
export type PasswordSetupKind = "recovery" | "invite";

export interface AuthLink {
  /** The link's type as Supabase reports it ("recovery", "invite", "signup", "magiclink", …), if any. */
  type: string | null;
  /** Whether the link carried a session (the auth client signs in with it). */
  hasSession: boolean;
  /** Why the link couldn't sign anyone in: most often it expired or was already used. */
  error: { code: string; message: string } | null;
}

/** No emailed link: what the server always sees, and any page opened normally. */
export const NO_AUTH_LINK: AuthLink = { type: null, hasSession: false, error: null };

/** Supabase's own wording for links that no longer work, said plainly. */
const ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    "This link has expired or has already been used. Each link works once, for a limited time.",
  otp_disabled: "This kind of sign-in link isn't enabled for the studio.",
  flow_state_expired: "This link has expired. Request a new one.",
  flow_state_not_found:
    "This link was opened in a different browser from the one it was requested in.",
};

/**
 * Reads an emailed link's result from an address: the fragment (Supabase's
 * usual redirect) and the query string (where some errors arrive).
 */
export function readAuthLink(href: string): AuthLink {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return NO_AUTH_LINK;
  }
  const params = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const [key, value] of fragment) params.set(key, value);

  const code = params.get("error_code") ?? (params.get("error") ? params.get("error")! : null);
  const description = params.get("error_description");
  const error =
    code || description
      ? {
          code: code ?? "unknown",
          message:
            (code && ERROR_MESSAGES[code]) ||
            (description ? description.replace(/\+/g, " ") : "This link couldn't sign you in."),
        }
      : null;
  const type = params.get("type");
  return {
    type: type ? type.toLowerCase() : null,
    hasSession: !!params.get("access_token") || !!params.get("code") || !!params.get("token_hash"),
    error,
  };
}

/** The password-setup step an emailed link asks for, if it signed someone in. */
export function passwordSetupFor(link: AuthLink): PasswordSetupKind | null {
  if (link.error || !link.hasSession) return null;
  if (link.type === "recovery") return "recovery";
  if (link.type === "invite") return "invite";
  return null;
}

export const initialAuthLink: AuthLink =
  typeof window === "undefined" ? NO_AUTH_LINK : readAuthLink(window.location.href);

/**
 * Lovable's editor preview: a private address only the project's editors can
 * open. An emailed link must never lead there, or whoever opens it (on another
 * device, or someone else entirely) lands on Lovable's sign-in instead.
 */
export function isEditorPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (/^id-preview(?:-[a-z0-9]+)?--/.test(host)) return true;
  return ["lovableproject.com", "lovableproject-dev.com"].some(
    (zone) => host === zone || host.endsWith(`.${zone}`),
  );
}

/**
 * Where an emailed link should bring someone back to: this page's address with
 * the given path. From the editor preview there is no address to give, so the
 * auth service's own site address (the published studio) is used instead; the
 * studio routes the link to the right page from wherever it lands.
 */
export function authRedirectUrl(origin: string, path: string): string | undefined {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (isEditorPreviewHost(url.hostname)) return undefined;
  return `${url.origin}${path}`;
}

const PENDING_KEY = "xeno.auth.password-setup";

/** A password step started by an emailed link, remembered for this tab until it's done. */
export function readPendingPasswordSetup(): PasswordSetupKind | null {
  try {
    const value = window.sessionStorage.getItem(PENDING_KEY);
    return value === "recovery" || value === "invite" ? value : null;
  } catch {
    return null;
  }
}

export function writePendingPasswordSetup(kind: PasswordSetupKind | null) {
  try {
    if (kind) window.sessionStorage.setItem(PENDING_KEY, kind);
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be unavailable (private modes); the step then lasts as long as the page.
  }
}
