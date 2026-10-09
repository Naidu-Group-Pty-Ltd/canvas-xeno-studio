import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { passwordProblem } from "@/lib/auth-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 8;

/** The signed-in person's own account: who they are, and changing their password. */
export function AccountSection() {
  const { user, profile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (password.length < MIN_LENGTH) return setProblem(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setProblem("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setProblem(passwordProblem(error, true));
    setPassword("");
    setConfirm("");
    toast.success("Your password has been changed");
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">{profile?.full_name ?? user?.email}</span>
        {profile?.full_name && user?.email ? ` (${user.email})` : ""} · {profile?.role}
      </p>
      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        data-testid="change-password"
      >
        <div className="space-y-1.5">
          <Label htmlFor="account-password" className="text-xs">
            New password
          </Label>
          <Input
            id="account-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={MIN_LENGTH}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-confirm" className="text-xs">
            Confirm new password
          </Label>
          <Input
            id="account-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={MIN_LENGTH}
            required
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !password}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Change password
        </Button>
      </form>
      {problem && (
        <p className="text-xs text-primary" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
