import { randomBytes } from "node:crypto";
import type { AuthError } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError } from "../higgsfield/errors";

/**
 * Team invitations. An admin invites someone by email: the invitation is
 * recorded first (so the account the auth service then creates joins as the
 * invited role, active), then the auth service emails the link. Accepting is
 * opening that link and choosing a password; withdrawing removes the account
 * the invitation made while it is still unconfirmed, so the link stops
 * working.
 */

export type TeamRole = "admin" | "member";

export interface InvitationRow {
  id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  user_id: string | null;
  invited_by: string | null;
  status: "pending" | "accepted" | "revoked";
  send_count: number;
  last_sent_at: string | null;
  last_error: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  user_id: string;
  confirmed: boolean;
  has_password: boolean;
  is_active: boolean;
  role: TeamRole | null;
}

export type InviteOutcome =
  /** The invitation email was sent (the first time, or again). */
  | { outcome: "invited" | "resent"; invitation: InvitationRow }
  /** The person already had a confirmed account; their access was switched on instead. */
  | { outcome: "reactivated"; email: string }
  /** The email may or may not have gone out (the auth service didn't answer clearly). */
  | { outcome: "uncertain"; invitation: InvitationRow; message: string };

const MIGRATION_NEEDED =
  "Team invitations need database migration 0007_team_invitations to be applied first.";

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "42P01" ||
    record.code === "42883" ||
    record.code === "PGRST202" ||
    record.code === "PGRST205" ||
    (typeof record.message === "string" && /schema cache|does not exist/i.test(record.message))
  );
}

function databaseError(error: unknown, what: string): AppError {
  if (isMissing(error)) return new AppError("UNKNOWN", MIGRATION_NEEDED);
  return new AppError("UNKNOWN", `${what} Try again.`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requireAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new AppError("UNKNOWN", "Your access couldn't be checked. Try again.");
  if (!data?.is_active || data.role !== "admin")
    throw new AppError("NOT_AUTHORIZED", "Only a studio admin can manage invitations.");
}

async function accountFor(email: string): Promise<AccountRow | null> {
  const { data, error } = await supabaseAdmin.rpc(
    "team_account_for_email" as never,
    { p_email: email } as never,
  );
  if (error) throw databaseError(error, "The address couldn't be checked.");
  const rows = (data ?? []) as AccountRow[];
  return rows[0] ?? null;
}

/** Links open invitations to their accounts and marks the accepted ones. */
export async function settleInvitations(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("settle_team_invitations" as never);
  if (error) throw databaseError(error, "Invitations couldn't be brought up to date.");
}

const invitations = () => supabaseAdmin.from("team_invitations");

async function pendingFor(email: string): Promise<InvitationRow | null> {
  const { data, error } = await invitations()
    .select("*")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw databaseError(error, "Invitations couldn't be read.");
  return (data ?? null) as InvitationRow | null;
}

async function invitationById(id: string): Promise<InvitationRow | null> {
  const { data, error } = await invitations().select("*").eq("id", id).maybeSingle();
  if (error) throw databaseError(error, "The invitation couldn't be read.");
  return (data ?? null) as InvitationRow | null;
}

async function updateInvitation(
  id: string,
  values: Partial<InvitationRow>,
): Promise<InvitationRow> {
  const { data, error } = await invitations().update(values).eq("id", id).select("*").single();
  if (error) throw databaseError(error, "The invitation couldn't be saved.");
  return data as InvitationRow;
}

/** Switches an account's access on, as the given role (only the server can). */
async function activate(userId: string, role: TeamRole, fullName: string | null) {
  const { data: profile, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw databaseError(readError, "The account couldn't be read.");
  if (!profile) return;
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      is_active: true,
      role,
      ...(fullName && !profile.full_name ? { full_name: fullName } : {}),
    })
    .eq("id", userId);
  if (error) throw databaseError(error, "The account's access couldn't be switched on.");
}

/** What the auth service's answer means: a clear refusal, or no clear answer at all. */
function classify(error: AuthError): { definite: boolean; message: string } {
  const status = typeof error.status === "number" ? error.status : 0;
  const code = (error as { code?: string }).code ?? "";
  if (status === 429 || code === "over_email_send_rate_limit" || /rate limit/i.test(error.message))
    return {
      definite: true,
      message: "The auth service's email limit was reached. Wait a few minutes, then try again.",
    };
  if (code === "email_exists" || /already been registered/i.test(error.message))
    return {
      definite: true,
      message:
        "This person already has a confirmed account. Switch on their access in the team list.",
    };
  if (status >= 400 && status < 500)
    return { definite: true, message: error.message || "The invitation was refused." };
  return {
    definite: false,
    message:
      "The auth service didn't confirm the invitation email was sent. If it doesn't arrive, resend it.",
  };
}

/**
 * Asks the auth service to email the invitation. It creates the account if
 * there is none, or emails the existing unconfirmed one again.
 */
async function send(
  invitation: InvitationRow,
  redirectTo: string | undefined,
  fresh: boolean,
): Promise<InviteOutcome> {
  let result;
  try {
    result = await supabaseAdmin.auth.admin.inviteUserByEmail(invitation.email, {
      ...(redirectTo ? { redirectTo } : {}),
      ...(invitation.full_name ? { data: { full_name: invitation.full_name } } : {}),
    });
  } catch {
    result = {
      data: { user: null },
      error: { status: 0, message: "network", name: "AuthRetryableFetchError" } as AuthError,
    };
  }
  if (result.error || !result.data.user) {
    const { definite, message } = result.error
      ? classify(result.error)
      : {
          definite: false,
          message:
            "The auth service didn't confirm the invitation email was sent. If it doesn't arrive, resend it.",
        };
    if (definite) {
      // Nothing was sent: a new invitation is withdrawn; one that was already open stays as it was.
      if (fresh) await invitations().delete().eq("id", invitation.id).eq("status", "pending");
      throw new AppError("INVALID_PARAMETERS", message);
    }
    const kept = await updateInvitation(invitation.id, { last_error: message }).catch(
      () => invitation,
    );
    return { outcome: "uncertain", invitation: kept, message };
  }
  const user = result.data.user;
  const updated = await updateInvitation(invitation.id, {
    user_id: user.id,
    send_count: invitation.send_count + 1,
    last_sent_at: new Date().toISOString(),
    last_error: null,
  });
  // A brand-new account joined active when it was created (it found the
  // invitation); an account that already existed unconfirmed is switched on here.
  await activate(user.id, invitation.role, invitation.full_name);
  return { outcome: fresh ? "invited" : "resent", invitation: updated };
}

/**
 * An account that exists but was never confirmed may have a password someone
 * else chose (whoever signed up with this address). It is replaced with one
 * no one knows before the invitation goes out, so only the person who opens
 * the invitation, and chooses their own password, can sign in.
 */
async function clearUnknownPassword(account: AccountRow | null) {
  if (!account || account.confirmed || !account.has_password) return;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
    password: randomBytes(32).toString("base64url"),
  });
  if (error)
    throw new AppError(
      "UNKNOWN",
      "The address's unconfirmed account couldn't be secured. Try again.",
    );
}

export async function inviteMember(input: {
  adminId: string;
  email: string;
  fullName: string | null;
  role: TeamRole;
  redirectTo: string | undefined;
}): Promise<InviteOutcome> {
  await requireAdmin(input.adminId);
  const email = normalizeEmail(input.email);
  const fullName = input.fullName?.trim() || null;
  await settleInvitations();

  const account = await accountFor(email);
  if (account?.confirmed) {
    if (account.is_active)
      throw new AppError("INVALID_PARAMETERS", `${email} is already a member of the studio.`);
    // They already have an account (perhaps deactivated earlier): switch it on, and keep a record.
    await activate(account.user_id, input.role, fullName);
    const { error } = await invitations().insert({
      email,
      full_name: fullName,
      role: input.role,
      user_id: account.user_id,
      invited_by: input.adminId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    });
    if (error) console.error("team invitation record", error.message);
    return { outcome: "reactivated", email };
  }

  let invitation = await pendingFor(email);
  let fresh = false;
  if (invitation) {
    // Inviting the same person again: the latest role and name apply, and the email is sent again.
    invitation = await updateInvitation(invitation.id, {
      role: input.role,
      full_name: fullName ?? invitation.full_name,
    });
  } else {
    const { data, error } = await invitations()
      .insert({ email, full_name: fullName, role: input.role, invited_by: input.adminId })
      .select("*")
      .single();
    if (error?.code === "23505") {
      // Invited at the same moment from elsewhere: that invitation is the one.
      invitation = await pendingFor(email);
      if (!invitation)
        throw new AppError("UNKNOWN", "The invitation couldn't be saved. Try again.");
    } else if (error) {
      throw databaseError(error, "The invitation couldn't be saved.");
    } else {
      invitation = data as InvitationRow;
      fresh = true;
    }
  }

  try {
    // Looked up again now the invitation is recorded: an account someone
    // registered for this address meanwhile joins through the invitation too,
    // so a password they chose must not survive it.
    await clearUnknownPassword(await accountFor(email));
  } catch (error) {
    if (fresh) await invitations().delete().eq("id", invitation.id).eq("status", "pending");
    throw error;
  }
  return send(invitation, input.redirectTo, fresh);
}

export async function resendInvitation(input: {
  adminId: string;
  invitationId: string;
  redirectTo: string | undefined;
}): Promise<InviteOutcome> {
  await requireAdmin(input.adminId);
  await settleInvitations();
  const invitation = await invitationById(input.invitationId);
  if (!invitation) throw new AppError("INVALID_PARAMETERS", "That invitation no longer exists.");
  if (invitation.status === "accepted")
    throw new AppError(
      "INVALID_PARAMETERS",
      `${invitation.email} has already accepted and joined the studio.`,
    );
  if (invitation.status === "revoked")
    throw new AppError("INVALID_PARAMETERS", "That invitation was withdrawn.");
  const account = await accountFor(invitation.email);
  if (account?.confirmed)
    throw new AppError(
      "INVALID_PARAMETERS",
      `${invitation.email} already has a confirmed account.`,
    );
  await clearUnknownPassword(account);
  return send(invitation, input.redirectTo, false);
}

export async function revokeInvitation(input: { adminId: string; invitationId: string }) {
  await requireAdmin(input.adminId);
  const { data, error } = await supabaseAdmin.rpc(
    "revoke_team_invitation" as never,
    { p_invitation_id: input.invitationId, p_revoked_by: input.adminId } as never,
  );
  if (error) throw databaseError(error, "The invitation couldn't be withdrawn.");
  const result = String(data ?? "");
  if (result === "accepted")
    throw new AppError(
      "INVALID_PARAMETERS",
      "They've already accepted the invitation. To remove their access, switch it off in the team list.",
    );
  if (result === "not_found")
    throw new AppError("INVALID_PARAMETERS", "That invitation no longer exists.");
  return { status: result as "revoked" };
}

export async function listInvitations(adminId: string): Promise<InvitationRow[]> {
  await requireAdmin(adminId);
  await settleInvitations();
  const { data, error } = await invitations()
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw databaseError(error, "Invitations couldn't be read.");
  return (data ?? []) as InvitationRow[];
}

/**
 * The invited person has chosen their password: their invitation is marked
 * accepted, and the name they gave is kept on their profile.
 */
export async function completeInvitation(input: { userId: string; fullName: string | null }) {
  await settleInvitations().catch((error) => console.error("settle invitations", error));
  const fullName = input.fullName?.trim();
  if (fullName) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", input.userId);
    if (error) throw new AppError("UNKNOWN", "Your name couldn't be saved. You can add it later.");
  }
  return { ok: true };
}
