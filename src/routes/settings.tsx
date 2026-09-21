import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, useProviderHealth } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useModels, useSettings, useTeam } from "@/hooks/useStudioData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

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
  const { isAdmin, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: health } = useProviderHealth();
  const { data: settings } = useSettings();
  const { data: models = [] } = useModels(true);
  const { data: team = [] } = useTeam();
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

  async function updateMember(id: string, patch: { role?: "admin" | "member"; is_active?: boolean }) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["team"] });
    toast.success("Team member updated");
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
          title="Media service"
          description="Optional rendering service for thumbnails, frames, trimming, reframing and assembly."
        >
          <MediaWorkerStatus />
        </Section>



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
          </div>
        </Section>

        <Section title="Team" description="Only active members can use the studio.">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {team.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.full_name ?? member.email}</span>
                  <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                </div>
                {isAdmin && member.id !== profile?.id ? (
                  <>
                    <Select
                      value={member.role}
                      onValueChange={(value) => void updateMember(member.id, { role: value as "admin" | "member" })}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={member.is_active}
                      onCheckedChange={(checked) => void updateMember(member.id, { is_active: checked })}
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
          <p className="mt-2 text-xs text-muted-foreground">
            New accounts are created from the Cloud users area, then activated here. There is no public registration.
          </p>
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
