import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl, SET_PASSWORD_PATH } from "./auth-link";

/** Password emails and password errors, worded for people rather than for the auth service. */

const RATE_LIMITED = /rate limit|too many|security purposes/i;

/** Sends a link for choosing a new password; returns the error to show, if any. */
export async function sendPasswordLink(email: string): Promise<string | null> {
  const redirectTo = authRedirectUrl(window.location.origin, SET_PASSWORD_PATH);
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    redirectTo ? { redirectTo } : {},
  );
  if (!error) return null;
  if (error.status === 429 || RATE_LIMITED.test(error.message))
    return "Too many reset emails were requested just now. Wait a minute, then try again.";
  return error.message || "The reset email couldn't be sent.";
}

/** Why the auth service wouldn't save a new password, said plainly. */
export function passwordProblem(error: AuthError, signedInLongAgo = false): string {
  const code = (error as { code?: string }).code ?? "";
  if (code === "same_password") return "That's already your password. Choose a different one.";
  if (code === "weak_password") return error.message || "Choose a stronger password.";
  if (code === "reauthentication_needed")
    return signedInLongAgo
      ? 'For security, changing your password needs a recent sign-in. Sign out and back in, or use "Forgot your password?" on the sign-in page.'
      : "The sign-in from your link has expired. Request a new link and open it again.";
  if (error.status === 401 || code === "session_expired" || code === "session_not_found")
    return "Your sign-in has expired. Sign in again (or request a new link) and try once more.";
  return error.message || "Your password couldn't be saved. Try again.";
}
