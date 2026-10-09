import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authRedirectUrl, SET_PASSWORD_PATH } from "./auth-link";

/**
 * Team access: admins invite people by email, resend and withdraw
 * invitations; invited people finish joining. Everything runs server-side
 * with the auth service's admin access; the browser only sees results.
 */

/**
 * Where the invitation link brings the person: the studio address the admin
 * is using, at the password page. From Lovable's private editor preview the
 * auth service's own site address is used instead (see authRedirectUrl).
 */
async function invitationRedirect(): Promise<string | undefined> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const origin = request?.headers.get("origin") ?? (request ? new URL(request.url).origin : "");
  return authRedirectUrl(origin, SET_PASSWORD_PATH);
}

const role = z.enum(["admin", "member"]);

export const listTeamInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listInvitations } = await import("./team/invites.server");
    return listInvitations(context.userId);
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email("Enter a valid email address").max(320),
        fullName: z.string().trim().max(200).optional(),
        role: role.default("member"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { inviteMember } = await import("./team/invites.server");
    return inviteMember({
      adminId: context.userId,
      email: data.email,
      fullName: data.fullName ?? null,
      role: data.role,
      redirectTo: await invitationRedirect(),
    });
  });

export const resendTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invitationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { resendInvitation } = await import("./team/invites.server");
    return resendInvitation({
      adminId: context.userId,
      invitationId: data.invitationId,
      redirectTo: await invitationRedirect(),
    });
  });

export const revokeTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invitationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { revokeInvitation } = await import("./team/invites.server");
    return revokeInvitation({ adminId: context.userId, invitationId: data.invitationId });
  });

export const completeTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fullName: z.string().trim().max(200).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { completeInvitation } = await import("./team/invites.server");
    return completeInvitation({ userId: context.userId, fullName: data.fullName ?? null });
  });
