import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBootstrapStatus } from "@/lib/auth.functions";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Sign in · ${APP_NAME}` },
      { name: "description", content: "Sign in to the internal Xeno Studio creative workspace." },
      { property: "og:title", content: `Sign in · ${APP_NAME}` },
      { property: "og:description", content: "Internal team access to the Xeno Studio creative workspace." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "reset" | "first-admin";

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
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
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  const needsFirstAdmin = bootstrap?.needsFirstAdmin === true;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Password reset email sent");
        setMode("signin");
      } else if (mode === "first-admin" && needsFirstAdmin) {
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
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% -10%, oklch(0.628 0.258 29.23 / 12%), transparent 70%)",
        }}
      />
      <div className="panel relative w-full max-w-md p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </span>
            <h1 className="text-2xl font-bold">{APP_NAME}</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{APP_TAGLINE} · internal access only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "first-admin" && (
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
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
          {mode !== "reset" && (
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
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "reset" ? "Send reset link" : mode === "first-admin" ? "Create admin account" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
          {mode !== "reset" ? (
            <button type="button" className="text-left hover:text-foreground" onClick={() => setMode("reset")}>
              Forgot your password?
            </button>
          ) : (
            <button type="button" className="text-left hover:text-foreground" onClick={() => setMode("signin")}>
              Back to sign in
            </button>
          )}
          {needsFirstAdmin && mode !== "first-admin" && (
            <button type="button" className="text-left hover:text-foreground" onClick={() => setMode("first-admin")}>
              No team members yet — create the first admin account
            </button>
          )}
          {!needsFirstAdmin && (
            <p className="text-xs">Accounts are created by an admin. There is no public registration.</p>
          )}
        </div>
      </div>
    </main>
  );
}
