import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { completeTeamInvitation } from "@/lib/team.functions";
import type { PasswordSetupKind } from "@/lib/auth-link";
import { useInitialAuthLink } from "@/hooks/useInitialAuthLink";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME } from "@/lib/app-config";
import { AuthLayout, LinkProblem, RequestPasswordLink } from "@/components/auth/AuthLayout";
import { passwordProblem } from "@/lib/auth-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/set-password")({
  head: () => ({
    meta: [
      { title: `Choose a password · ${APP_NAME}` },
      { name: "description", content: "Choose a password for your Xeno Studio account." },
    ],
  }),
  component: SetPasswordPage,
});

const MIN_LENGTH = 8;

/**
 * Where password-reset and invitation links lead: the person (signed in by
 * the link) chooses their password here before using the studio.
 */
function SetPasswordPage() {
  const { session, loading, passwordSetup } = useAuth();
  const link = useInitialAuthLink();
  const kind: PasswordSetupKind = passwordSetup ?? (link.type === "invite" ? "invite" : "recovery");

  if (loading) {
    return (
      <AuthLayout>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="checking-link"
        >
          <Loader2 className="size-4 animate-spin" /> Checking your link…
        </p>
      </AuthLayout>
    );
  }

  if (!session) {
    return (
      <AuthLayout>
        {link.error ? (
          <LinkProblem message={link.error.message} />
        ) : (
          <p className="mb-4 text-sm text-muted-foreground" data-testid="no-link-session">
            This page opens from the link in a password-reset or invitation email. That link works
            once; if it's been used or has expired, get a new one here.
          </p>
        )}
        <p className="mb-4 text-sm text-muted-foreground">
          Enter your work email and we'll send a fresh link to choose your password. Invited and
          waiting on an expired link? This works for you too, or ask your admin to resend the
          invitation.
        </p>
        <RequestPasswordLink />
        <Link to="/auth" className="mt-6 block text-sm text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <ChoosePassword kind={kind} />
    </AuthLayout>
  );
}

function ChoosePassword({ kind }: { kind: PasswordSetupKind }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, finishPasswordSetup, signOut } = useAuth();
  const invited = kind === "invite";
  const [fullName, setFullName] = useState(
    () =>
      profile?.full_name ??
      (typeof user?.user_metadata?.["full_name"] === "string"
        ? user.user_metadata["full_name"]
        : ""),
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (password.length < MIN_LENGTH) {
      setProblem(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setProblem("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const name = fullName.trim();
    const { error } = await supabase.auth.updateUser({
      password,
      ...(invited && name ? { data: { full_name: name } } : {}),
    });
    if (error) {
      setBusy(false);
      setProblem(passwordProblem(error));
      return;
    }
    if (invited) {
      // Marks the invitation accepted and keeps the name; joining doesn't depend on it.
      await completeTeamInvitation({ data: { fullName: name || undefined } }).catch((failure) =>
        console.error("complete invitation", failure),
      );
    }
    finishPasswordSetup();
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    setBusy(false);
    toast.success(invited ? `Welcome to ${APP_NAME}` : "Your password has been changed");
    navigate({ to: "/", replace: true });
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="set-password-form">
      <div>
        <h2 className="text-lg font-semibold">
          {invited ? `Welcome to ${APP_NAME}` : "Choose a new password"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {invited
            ? "You've been invited to the studio. Choose a password to finish setting up your account."
            : "Choose a new password for your account. You'll use it to sign in from now on."}
        </p>
        {user?.email && (
          <p className="mt-2 text-xs text-muted-foreground">
            Account: <span className="font-medium text-foreground">{user.email}</span>
          </p>
        )}
      </div>
      {invited && (
        <div className="space-y-2">
          <Label htmlFor="full-name">Your name</Label>
          <Input
            id="full-name"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={200}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="new-password">{invited ? "Password" : "New password"}</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={MIN_LENGTH}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          minLength={MIN_LENGTH}
          required
        />
      </div>
      {problem && (
        <p className="text-sm text-primary" role="alert" data-testid="password-problem">
          {problem}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        {invited ? "Join the studio" : "Save new password"}
      </Button>
      <button
        type="button"
        className="block text-left text-sm text-muted-foreground hover:text-foreground"
        onClick={() => void signOut().then(() => navigate({ to: "/auth" }))}
      >
        Not you? Sign out
      </button>
    </form>
  );
}
