import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Loader2, MailPlus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeam } from "@/hooks/useStudioData";
import {
  inviteTeamMember,
  listTeamInvitations,
  resendTeamInvitation,
  revokeTeamInvitation,
} from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Role = "admin" | "member";
type Invitation = Awaited<ReturnType<typeof listTeamInvitations>>[number];

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/** Who is in the studio, and (for admins) inviting more people. */
export function TeamSection() {
  const { isAdmin, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: team = [] } = useTeam();
  const invitations = useQuery({
    queryKey: ["team-invitations"],
    queryFn: () => listTeamInvitations(),
    enabled: isAdmin,
  });
  const pending = useMemo(() => invitations.data ?? [], [invitations.data]);

  // Accounts made by an invitation nobody has accepted yet appear under the
  // invitations, not as members.
  const pendingAccounts = useMemo(
    () => new Set(pending.map((invite) => invite.user_id).filter(Boolean)),
    [pending],
  );
  const members = team.filter((member) => !pendingAccounts.has(member.id));
  const nameOf = (id: string | null) => {
    const person = team.find((member) => member.id === id);
    return person ? (person.full_name ?? person.email) : null;
  };

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team"] }),
      queryClient.invalidateQueries({ queryKey: ["team-invitations"] }),
    ]);

  async function updateMember(id: string, patch: { role?: Role; is_active?: boolean }) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Team member updated");
  }

  return (
    <div className="space-y-6">
      {isAdmin && <InviteForm onDone={refresh} />}

      {isAdmin && invitations.isError && (
        <p className="flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="size-3.5" /> {message(invitations.error)}
        </p>
      )}

      {isAdmin && pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="label-eyebrow">Invitations waiting</h3>
          <div
            className="divide-y divide-border overflow-hidden rounded-lg border border-border"
            data-testid="pending-invitations"
          >
            {pending.map((invite) => (
              <PendingInvitation
                key={invite.id}
                invite={invite}
                inviter={nameOf(invite.invited_by)}
                onDone={refresh}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isAdmin && <h3 className="label-eyebrow">Members</h3>}
        <div
          className="divide-y divide-border overflow-hidden rounded-lg border border-border"
          data-testid="team-members"
        >
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
              data-testid="team-member"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {member.full_name ?? member.email}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
              </div>
              {isAdmin && member.id !== profile?.id ? (
                <>
                  <Select
                    value={member.role}
                    onValueChange={(value) => void updateMember(member.id, { role: value as Role })}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label={`Role for ${member.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={member.is_active}
                    onCheckedChange={(checked) =>
                      void updateMember(member.id, { is_active: checked })
                    }
                    aria-label={`Toggle access for ${member.email}`}
                  />
                </>
              ) : (
                <>
                  <Badge variant="outline">{member.role}</Badge>
                  <Badge variant={member.is_active ? "default" : "outline"}>
                    {member.is_active ? "Active" : "Inactive"}
                  </Badge>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAdmin
          ? "Invite people by email: they get a link to choose their own password and join with the role you pick. Anyone who creates an account some other way stays inactive until you switch their access on here."
          : "Admins invite new people by email. There is no public registration."}
      </p>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => Promise<unknown> }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await inviteTeamMember({
        data: { email: email.trim(), fullName: fullName.trim() || undefined, role },
      });
      if (result.outcome === "reactivated") {
        toast.success(
          `${result.email} already had an account, so their access is now switched on. They sign in with their existing password, or reset it from the sign-in page.`,
          { duration: 10_000 },
        );
      } else if (result.outcome === "uncertain") {
        toast.warning(result.message, { duration: 10_000 });
      } else {
        toast.success(
          result.outcome === "resent"
            ? `Invitation sent again to ${result.invitation.email}`
            : `Invitation sent to ${result.invitation.email}`,
        );
      }
      setEmail("");
      setFullName("");
      setRole("member");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
      await onDone();
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3 p-4" data-testid="invite-form">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MailPlus className="size-4 text-primary" /> Invite someone
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email" className="text-xs">
            Work email
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={320}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name" className="text-xs">
            Name (optional)
          </Label>
          <Input
            id="invite-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as Role)}>
            <SelectTrigger aria-label="Role for the invitation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Send invite
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Admins can invite others and change the studio's settings; members use the studio.
      </p>
    </form>
  );
}

function PendingInvitation({
  invite,
  inviter,
  onDone,
}: {
  invite: Invitation;
  inviter: string | null;
  onDone: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<"resend" | "revoke" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function resend() {
    setBusy("resend");
    try {
      const result = await resendTeamInvitation({ data: { invitationId: invite.id } });
      if (result.outcome === "uncertain") toast.warning(result.message, { duration: 10_000 });
      else toast.success(`Invitation sent again to ${invite.email}`);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(null);
      await onDone();
    }
  }

  async function revoke() {
    setBusy("revoke");
    try {
      await revokeTeamInvitation({ data: { invitationId: invite.id } });
      toast.success(`Invitation for ${invite.email} withdrawn`);
      setConfirming(false);
    } catch (error) {
      toast.error(message(error));
      setConfirming(false);
    } finally {
      setBusy(null);
      await onDone();
    }
  }

  const sent = invite.last_sent_at
    ? formatDistanceToNow(new Date(invite.last_sent_at), { addSuffix: true })
    : null;
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
      data-testid="pending-invitation"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">{invite.full_name ?? invite.email}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {invite.full_name ? `${invite.email} · ` : ""}
          {sent ? `sent ${sent}` : "not sent yet"}
          {invite.send_count > 1 ? ` (${invite.send_count} times)` : ""}
          {inviter ? ` · invited by ${inviter}` : ""}
        </span>
        {invite.last_error && (
          <span className="mt-1 flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3" /> {invite.last_error}
          </span>
        )}
      </div>
      <Badge variant="outline">{invite.role}</Badge>
      <Badge variant="secondary">Invited</Badge>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void resend()}>
        {busy === "resend" ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <RotateCw className="mr-1.5 size-3.5" />
        )}
        Resend
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => setConfirming(true)}
        aria-label={`Withdraw invitation for ${invite.email}`}
      >
        <X className="mr-1.5 size-3.5" /> Withdraw
      </Button>
      <AlertDialog open={confirming} onOpenChange={(open) => busy === null && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw the invitation for {invite.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              The link in their invitation email stops working. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              {busy === "revoke" && <Loader2 className="mr-2 size-4 animate-spin" />}
              Withdraw invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
