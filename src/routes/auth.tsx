import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBootstrapStatus } from "@/lib/auth.functions";
import { SET_PASSWORD_PATH } from "@/lib/auth-link";
import { useInitialAuthLink } from "@/hooks/useInitialAuthLink";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME } from "@/lib/app-config";
import { AuthLayout, LinkProblem, RequestPasswordLink } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Sign in · ${APP_NAME}` },
      { name: "description", content: "Sign in to the internal Xeno Studio creative workspace." },
      { property: "og:title", content: `Sign in · ${APP_NAME}` },
      {
        property: "og:description",
        content: "Internal team access to the Xeno Studio creative workspace.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "reset" | "first-admin";

function AuthPage() {
  const navigate = useNavigate();
  const { session, passwordSetup, finishPasswordSetup } = useAuth();
  // An emailed link that couldn't sign anyone in lands here: say why, and offer a new one.
  const link = useInitialAuthLink();
  const [dismissed, setDismissed] = useState(false);
  const linkProblem = dismissed ? null : (link.error?.message ?? null);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: bootstrap } = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => getBootstrapStatus(),
  });

  useEffect(() => {
    if (session) navigate({ to: passwordSetup ? SET_PASSWORD_PATH : "/" });
  }, [session, passwordSetup, navigate]);

  useEffect(() => {
    if (link.error) setMode("reset");
  }, [link.error]);

  const needsFirstAdmin = bootstrap?.needsFirstAdmin === true;

  function switchMode(next: Mode) {
    setDismissed(true);
    setMode(next);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "first-admin" && needsFirstAdmin) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Admin account created. Check your email if confirmation is required.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Signing in with a password ends any reset this tab had started.
        finishPasswordSetup();
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {linkProblem && <LinkProblem message={linkProblem} />}

      {mode === "reset" ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter your work email and we'll send a link to choose a new password. This also works if
            your invitation link has expired.
          </p>
          <RequestPasswordLink initialEmail={email} />
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "first-admin" && (
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "first-admin" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "first-admin" ? "Create admin account" : "Sign in"}
          </Button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
        {mode !== "reset" ? (
          <button
            type="button"
            className="text-left hover:text-foreground"
            onClick={() => switchMode("reset")}
          >
            Forgot your password?
          </button>
        ) : (
          <button
            type="button"
            className="text-left hover:text-foreground"
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}
        {needsFirstAdmin && mode !== "first-admin" && (
          <button
            type="button"
            className="text-left hover:text-foreground"
            onClick={() => switchMode("first-admin")}
          >
            No team members yet — create the first admin account
          </button>
        )}
        {!needsFirstAdmin && (
          <p className="text-xs">
            Accounts are by invitation: an admin invites you by email. There is no public
            registration.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
