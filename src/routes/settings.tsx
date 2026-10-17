import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useProviderHealth } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useModels, useSettings } from "@/hooks/useStudioData";
import { getMediaWorkerStatus } from "@/lib/media.functions";
import { useSupercomputerStatus } from "@/hooks/useSupercomputerData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AccountSection } from "@/components/settings/AccountSection";
import { TeamSection } from "@/components/settings/TeamSection";
import { KatanaSettings } from "@/components/katana/KatanaSettings";
import { BrandKitsPanel } from "@/components/brand/BrandKitsPanel";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Xeno Studio" },
      { name: "description", content: "Provider status, generation defaults, team access and storage overview." },
      { property: "og:title", content: "Settings · Xeno Studio" },
      { property: "og:description", content: "Administer the internal creative studio workspace." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: health } = useProviderHealth();
  const { data: settings } = useSettings();
  const { data: models = [] } = useModels(true);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const { data: storage } = useQuery({
    queryKey: ["storage-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("asset_type,file_size").is("deleted_at", null).limit(2000);
      const rows = data ?? [];
      return {
        total: rows.length,
        images: rows.filter((row) => row.asset_type === "image").length,
        videos: rows.filter((row) => row.asset_type === "video").length,
        bytes: rows.reduce((sum, row) => sum + Number(row.file_size ?? 0), 0),
      };
    },
  });

  async function saveSetting(key: string, value: unknown) {
    const { error } = await supabase.from("app_settings").update({ value: value as never }).eq("key", key);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    toast.success("Setting saved");
  }

  /** The member cap may not have a row yet, so it is upserted; 0 clears it. */
  async function saveMemberCap(value: number) {
    const { error } = await supabase.from("app_settings").upsert({
      key: "member_monthly_cap_usd",
      // 0 is no cap (the column can't hold null).
      value: (Number.isFinite(value) && value > 0 ? value : 0) as never,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    toast.success(value > 0 ? "Monthly cap saved" : "Monthly cap removed");
  }

  const imageModels = models.filter((model) => model.output_type === "image");
  const videoModels = models.filter((model) => model.output_type === "video");

  return (
    <AppShell title="Settings">
      <div className="max-w-4xl space-y-10 p-6">
        <Section title="Provider" description="Higgsfield credentials live only in backend secrets.">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={health?.configured ? "default" : "outline"} className="gap-1.5">
                {health?.configured ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                {health?.configured ? "Credentials configured" : "Credentials not configured"}
              </Badge>
              <span className="text-xs text-muted-foreground">Required secrets: HF_KEY_ID, HF_KEY_SECRET</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last successful provider call:{" "}
              {health?.lastSuccessAt ? new Date(health.lastSuccessAt).toLocaleString() : "none recorded"}
            </p>
            {health?.lastError && (
              <p className="text-xs text-primary">
                Last provider error: {health.lastError.message} ({new Date(health.lastError.at).toLocaleString()})
              </p>
            )}
            {isAdmin && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="provider-enabled" className="text-xs">
                  Higgsfield enabled
                </Label>
                <Switch
                  id="provider-enabled"
                  checked={draft["provider_enabled"] !== false}
                  onCheckedChange={(checked) => void saveSetting("provider_enabled", checked)}
                />
              </div>
            )}
          </div>
        </Section>

        <Section
          title="AI (Supercomputer, Director, analysis)"
          description="Reasoning models for brainstorming, brief analysis, prompt help and planning. Keys live only in backend secrets."
        >
          <AiSettings isAdmin={isAdmin} settings={draft} />
        </Section>

        <Section
          title="Media service"
          description="Optional rendering service for thumbnails, frames, trimming, reframing and assembly."
        >
          <MediaWorkerStatus />
        </Section>

        <div id="katana" className="scroll-mt-20">
          <Section
            title="Katana"
            description="Higgsfield's Katana video workflow, run by Claude on the team's Higgsfield account."
          >
            <KatanaSettings isAdmin={isAdmin} settings={draft} />
          </Section>
        </div>



        <Section title="Generation settings" description="Defaults applied across the studio.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Default image model</Label>
              <Select
                disabled={!isAdmin}
                value={String(draft["default_image_model"] ?? "")}
                onValueChange={(value) => void saveSetting("default_image_model", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {imageModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Default video model</Label>
              <Select
                disabled={!isAdmin}
                value={String(draft["default_video_model"] ?? "")}
                onValueChange={(value) => void saveSetting("default_video_model", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {videoModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
              <Label htmlFor="require-estimate" className="text-xs">
                Require a cost estimate before generating
              </Label>
              <Switch
                id="require-estimate"
                disabled={!isAdmin}
                checked={draft["require_cost_estimate"] === true}
                onCheckedChange={(checked) => void saveSetting("require_cost_estimate", checked)}
              />
            </div>
            <NumberSetting
              label="High-cost warning threshold (USD)"
              value={Number(draft["high_cost_warning_usd"] ?? 2)}
              disabled={!isAdmin}
              step={0.5}
              onSave={(value) => void saveSetting("high_cost_warning_usd", value)}
            />
            <NumberSetting
              label="Max provider concurrency"
              value={Number(draft["max_provider_concurrency"] ?? 15)}
              disabled={!isAdmin}
              step={1}
              onSave={(value) => void saveSetting("max_provider_concurrency", value)}
            />
            <div className="space-y-1 sm:col-span-2">
              <NumberSetting
                label="Monthly cap per member for work outside a project or campaign (USD, 0 for none)"
                value={Number(draft["member_monthly_cap_usd"] ?? 0) || 0}
                disabled={!isAdmin}
                step={5}
                onSave={(value) => void saveMemberCap(value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Projects and campaigns have their own limits. Work in neither counts here, per
                member and calendar month; a long video that would go over it is refused before it
                starts.
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Brand kits"
          description="Each brand's fonts, colours, logo and end card, applied in the Editor in one click."
        >
          <BrandKitsPanel />
        </Section>

        <Section title="Your account" description="Your sign-in details.">
          <AccountSection />
        </Section>

        <Section title="Team" description="Only active members can use the studio.">
          <TeamSection />
        </Section>

        <Section title="Storage" description="Permanent copies kept in the studio's own storage.">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Assets" value={String(storage?.total ?? 0)} />
            <Stat label="Images" value={String(storage?.images ?? 0)} />
            <Stat label="Videos" value={String(storage?.videos ?? 0)} />
            <Stat label="Stored" value={`${(((storage?.bytes ?? 0) / 1_073_741_824) || 0).toFixed(2)} GB`} />
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

/**
 * Which reasoning backend is live, and the admin choices behind it. Values are
 * upserted so the controls also work before every setting row exists.
 */
function AiSettings({ isAdmin, settings }: { isAdmin: boolean; settings: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading, isError, refetch } = useSupercomputerStatus();

  async function save(key: string, value: unknown) {
    const { error } = await supabase.from("app_settings").upsert({ key, value: value as never });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["app_settings"] });
    await queryClient.invalidateQueries({ queryKey: ["supercomputer-status"] });
    await queryClient.invalidateQueries({ queryKey: ["reasoning-health"] });
    toast.success("Setting saved");
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Checking AI configuration…</p>;
  if (isError)
    return (
      <p className="text-xs text-warning">
        Could not load the AI status.{" "}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Try again
        </button>
      </p>
    );

  const backendLabel = status?.backend === "openai" ? "OpenAI" : status?.backend === "lovable" ? "Lovable AI" : null;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={backendLabel ? "default" : "outline"} className="gap-1.5">
          {backendLabel ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {backendLabel ? `Using ${backendLabel} · ${status?.model}` : status?.enabled === false ? "Switched off" : "Not configured"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          OpenAI key {status?.backends.openai ? "configured" : "not set"} · Lovable AI {status?.backends.lovable ? "available" : "not available"}
        </span>
      </div>
      {status && !status.tablesReady && (
        <p className="text-xs text-warning">
          Supercomputer and brief import need migration 0002_supercomputer_and_creative_briefs to be applied.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Add an <code>OPENAI_API_KEY</code> backend secret to bill AI to your OpenAI account. Without it, the project's
        built-in Lovable AI is used and draws on Lovable workspace credits. Planning never spends Higgsfield credits.
      </p>
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">Provider</Label>
            <Select value={String(settings["reasoning_provider"] ?? "auto")} onValueChange={(value) => void save("reasoning_provider", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatic (OpenAI if its key is set)</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="lovable">Lovable AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="reasoning-enabled" className="text-xs">
              AI features enabled
            </Label>
            <Switch
              id="reasoning-enabled"
              checked={settings["reasoning_enabled"] !== false}
              onCheckedChange={(checked) => void save("reasoning_enabled", checked)}
            />
          </div>
          <TextSetting
            label="OpenAI model · Supercomputer"
            value={String(settings["supercomputer_model"] ?? "gpt-5.6-sol")}
            onSave={(value) => void save("supercomputer_model", value)}
          />
          <TextSetting
            label="OpenAI model · Director"
            value={String(settings["director_model"] ?? "gpt-5.6-sol")}
            onSave={(value) => void save("director_model", value)}
          />
          <TextSetting
            label="OpenAI model · image analysis"
            value={String(settings["qc_model"] ?? "gpt-5.6-sol")}
            onSave={(value) => void save("qc_model", value)}
          />
          <TextSetting
            label="Lovable AI model"
            value={String(settings["lovable_ai_model"] ?? "google/gemini-3-flash-preview")}
            onSave={(value) => void save("lovable_ai_model", value)}
          />
        </div>
      )}
    </div>
  );
}

function TextSetting({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={local} onChange={(event) => setLocal(event.target.value)} />
        <Button variant="outline" disabled={!local.trim() || local.trim() === value} onClick={() => onSave(local.trim())}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Separator />
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <span className="label-eyebrow block">{label}</span>
      <span className="mt-1 block font-display text-xl font-semibold">{value}</span>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  step,
  disabled,
  onSave,
}: {
  label: string;
  value: number;
  step: number;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input type="number" step={step} value={local} disabled={disabled} onChange={(event) => setLocal(event.target.value)} />
        <Button variant="outline" disabled={disabled || Number(local) === value} onClick={() => onSave(Number(local))}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** A limit in seconds as a person would say it: "12 hours", "20 minutes". */
function formatLimit(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

/**
 * Media service status. Reports only Configured / Reachable — never any secret
 * value — and states plainly when the service has not been deployed. The
 * service stops itself when idle, so this shows what it last said rather than
 * waking it; Re-check asks it now (and starts it, if it had stopped).
 */
function MediaWorkerStatus() {
  const queryClient = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 30_000,
  });

  async function recheck() {
    setRechecking(true);
    try {
      const status = await getMediaWorkerStatus({ data: { refresh: true } });
      queryClient.setQueryData(["media-worker-status"], status);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The media service couldn't be checked");
    } finally {
      setRechecking(false);
    }
  }

  if (isLoading)
    return <p className="text-xs text-muted-foreground">Checking the media service…</p>;

  const onDemand = Boolean(data?.idleStopSeconds);
  const badge = !data?.configured
    ? "Not configured"
    : !data.reachable
      ? "Configured, unreachable"
      : data.live
        ? "Reachable"
        : onDemand
          ? "Ready · starts on demand"
          : "Reachable";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant={data?.reachable ? "default" : "outline"}
          className="gap-1.5"
          data-testid="media-worker-badge"
        >
          {data?.reachable ? (
            <CheckCircle2 className="size-3" />
          ) : (
            <AlertTriangle className="size-3" />
          )}
          {badge}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Required secrets: MEDIA_WORKER_URL, MEDIA_WORKER_SHARED_SECRET
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={rechecking}
          onClick={() => void recheck()}
          title={onDemand ? "Asks the media service now, starting it if it has stopped" : undefined}
        >
          {rechecking ? "Checking…" : "Re-check"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {data?.message}
        {data?.reachable && data.checkedAt && !data.live
          ? ` · last heard from ${formatDistanceToNow(new Date(data.checkedAt), { addSuffix: true })}`
          : ""}
      </p>
      {data?.reachable && onDemand && data.idleStopSeconds ? (
        <p className="text-xs text-muted-foreground" data-testid="media-worker-idle">
          It stops itself after {formatLimit(data.idleStopSeconds)} with nothing to do, so it
          isn&apos;t billed for its CPUs while idle, and starts again within seconds when a task
          arrives.
        </p>
      ) : null}
      {data?.ffmpeg && <p className="text-xs text-muted-foreground">Renderer: {data.ffmpeg}</p>}
      {!!data?.tasks?.length && (
        <p className="text-xs text-muted-foreground">Available tasks: {data.tasks.join(", ")}</p>
      )}
      {data?.reachable && data.live && (
        <p className="text-xs text-muted-foreground">
          Queue: {data.running ?? 0} running · {data.queued ?? 0} waiting
        </p>
      )}
      {data?.reachable && data.renderTimeoutSeconds ? (
        <p className="text-xs text-muted-foreground" data-testid="render-limits">
          Editor renders: each step may take up to {formatLimit(data.renderTimeoutSeconds)}
          {data.renderStallSeconds
            ? `, and one that writes nothing for ${formatLimit(data.renderStallSeconds)} is stopped as stuck`
            : ""}
          .
        </p>
      ) : null}
    </div>
  );
}
