import { useState, type ReactNode } from "react";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { sendPasswordLink } from "@/lib/auth-password";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The centred card the sign-in and password pages share. */
export function AuthLayout({ children }: { children: ReactNode }) {
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
        {children}
      </div>
    </main>
  );
}

/** A problem with an emailed link, said plainly where the person lands. */
export function LinkProblem({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
      data-testid="link-problem"
    >
      {message}
    </div>
  );
}

/** Asks for an email address and sends it a link for choosing a new password. */
export function RequestPasswordLink({
  initialEmail = "",
  submitLabel = "Send reset link",
}: {
  initialEmail?: string;
  submitLabel?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const failure = await sendPasswordLink(email);
    setBusy(false);
    if (failure) setProblem(failure);
    else setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div
        className="flex gap-3 rounded-md border border-border px-3 py-3 text-sm"
        data-testid="reset-sent"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p>
          If <span className="font-medium">{sentTo}</span> has a studio account, an email with a
          link to choose a new password is on its way. The link works once and expires after a
          while, so use the newest email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reset-email">Work email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {problem && <p className="text-sm text-primary">{problem}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
