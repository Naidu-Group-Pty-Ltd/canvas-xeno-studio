import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useKatanaOverview } from "@/hooks/useKatana";
import {
  checkHiggsfieldConnection,
  connectHiggsfield,
  disconnectHiggsfield,
} from "@/lib/katana.functions";
import { KATANA_EFFORTS } from "@/lib/katana/agent";

/**
 * Katana's set-up in Settings: the Claude key, the team's Higgsfield account
 * (connected once by an admin, via Higgsfield's own sign-in), the optional
 * webhook, and the run defaults.
 */
export function KatanaSettings({
  isAdmin,
  settings,
}: {
  isAdmin: boolean;
  settings: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useKatanaOverview();
  const [busy, setBusy] = useState<"connect" | "disconnect" | "check" | null>(null);

  // Back from Higgsfield's sign-in: say how it went, once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("higgsfield");
    if (!outcome) return;
    const message = params.get("message") ?? "";
    if (outcome === "connected") toast.success(message || "Higgsfield account connected");
    else toast.error(message || "The Higgsfield account wasn't connected");
    params.delete("higgsfield");
    params.delete("message");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
    );
    void queryClient.invalidateQueries({ queryKey: ["katana-overview"] });
  }, [queryClient]);

  async function save(key: string, value: unknown) {
    const { error } = await supabase.from("app_settings").upsert({ key, value: value as never });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    await queryClient.invalidateQueries({ queryKey: ["katana-overview"] });
    toast.success("Setting saved");
  }

  async function connect() {
    setBusy("connect");
    try {
      const { url } = await connectHiggsfield({ data: { origin: window.location.origin } });
      window.location.assign(url);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Higgsfield's sign-in couldn't be started",
      );
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await disconnectHiggsfield();
      await queryClient.invalidateQueries({ queryKey: ["katana-overview"] });
      toast.success("Higgsfield account disconnected");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "It couldn't be disconnected");
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      const { credits, plan } = await checkHiggsfieldConnection();
      toast.success(
        `Higgsfield answered${credits !== null ? `: ${credits} credits` : ""}${plan ? ` on the ${plan} plan` : ""}.`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Higgsfield didn't answer");
    } finally {
      setBusy(null);
      void refetch();
    }
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Checking Katana's set-up…</p>;
  if (isError || !data) {
    return (
      <p className="text-xs text-warning">
        Katana's set-up couldn't be read.{" "}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    );
  }

  const { connection } = data;
  const connected = connection.status === "connected";

  return (
    <div className="space-y-5 text-sm">
      {!connection.tablesReady && (
        <p className="text-xs text-warning">
          Katana needs migration 0015_katana to be applied to the database.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={data.anthropicConfigured ? "default" : "outline"} className="gap-1.5">
            {data.anthropicConfigured ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
            {data.anthropicConfigured ? "Claude key configured" : "Claude key missing"}
          </Badge>
          <span className="text-xs text-muted-foreground">Required secret: ANTHROPIC_API_KEY</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Each run is a Claude Managed Agents session that runs Higgsfield's Katana workflow. Its
          Claude usage is billed to the Anthropic account behind the key, up to each run's Claude
          budget.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={connected ? "default" : "outline"} className="gap-1.5">
            {connected ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
            {connected
              ? `Higgsfield: ${connection.accountEmail ?? connection.accountName ?? "connected"}`
              : connection.status === "error"
                ? "Higgsfield: reconnect needed"
                : "Higgsfield: not connected"}
          </Badge>
          {connected && connection.connectedAt && (
            <span className="text-xs text-muted-foreground">
              since {new Date(connection.connectedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Katana runs on the team's Higgsfield account, so its paid steps use that account's
          credits. An admin connects it once through Higgsfield's own sign-in; the studio keeps the
          sign-in on the server and renews it.
        </p>
        {connection.lastError && <p className="text-xs text-warning">{connection.lastError}</p>}
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant={connected ? "outline" : "default"}
              disabled={!!busy}
              onClick={() => void connect()}
            >
              {busy === "connect" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 size-3.5" />
              )}
              {connected ? "Reconnect" : "Connect Higgsfield account"}
            </Button>
          )}
          {connected && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void check()}>
              {busy === "check" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Check connection
            </Button>
          )}
          {isAdmin && connected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={!!busy}>
                  <Unplug className="mr-1.5 size-3.5" /> Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect the Higgsfield account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Katana runs that are still going lose access to Higgsfield and stop. You can
                    connect again any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void disconnect()}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={data.webhooksConfigured ? "default" : "outline"} className="gap-1.5">
            {data.webhooksConfigured ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
            {data.webhooksConfigured ? "Webhook signing key set" : "Webhook optional, not set"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Katana waits at every paid step until the studio answers. While a run is open in the
          studio, and once a minute otherwise, the studio checks on it. For instant answers, add
          this address in the Claude Console (Manage → Webhooks) with the session events, then put
          its signing secret in ANTHROPIC_WEBHOOK_SIGNING_KEY.
        </p>
        <div className="flex max-w-xl gap-2">
          <Input readOnly value={data.webhookUrl} className="font-mono text-xs" />
          <Button
            size="icon"
            variant="outline"
            aria-label="Copy the webhook address"
            onClick={() => {
              void navigator.clipboard
                .writeText(data.webhookUrl)
                .then(() => toast.success("Copied"));
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      </div>

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextSetting
            label="Claude model"
            value={String(settings["katana_model"] ?? data.agent.model)}
            onSave={(value) => void save("katana_model", value)}
          />
          <div className="space-y-2">
            <Label className="text-xs">Effort</Label>
            <Select
              value={String(settings["katana_effort"] ?? data.agent.effort)}
              onValueChange={(value) => void save("katana_effort", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KATANA_EFFORTS.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    {effort}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberSetting
            label="Default credit limit per run"
            value={data.settings.defaultCreditLimit}
            step={10}
            onSave={(value) => void save("katana_default_credit_limit", value)}
          />
          <NumberSetting
            label="Highest credit limit a run may have"
            value={data.settings.maxCreditLimit}
            step={50}
            onSave={(value) => void save("katana_max_credit_limit", value)}
          />
          <NumberSetting
            label="Default Claude budget per run (USD)"
            value={data.settings.defaultClaudeBudgetUsd}
            step={1}
            onSave={(value) => void save("katana_default_claude_budget_usd", value)}
          />
          <NumberSetting
            label="Credits counted for an image's background removal"
            value={data.settings.removeBackgroundCredits}
            step={0.5}
            onSave={(value) => void save("katana_remove_background_credits", value)}
          />
          <NumberSetting
            label="Credits counted for a video's background removal"
            value={data.settings.removeBackgroundVideoCredits}
            step={0.5}
            onSave={(value) => void save("katana_remove_background_video_credits", value)}
          />
        </div>
      )}
    </div>
  );
}

function TextSetting({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={local} onChange={(event) => setLocal(event.target.value)} />
        <Button
          variant="outline"
          disabled={!local.trim() || local.trim() === value}
          onClick={() => onSave(local.trim())}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  step,
  onSave,
}: {
  label: string;
  value: number;
  step: number;
  onSave: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  const next = Number(local);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          step={step}
          value={local}
          onChange={(event) => setLocal(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={!(next > 0) || next === value}
          onClick={() => onSave(next)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
