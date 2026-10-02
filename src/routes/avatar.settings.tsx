import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarStatus, usePersonas } from "@/features/avatar-studio/hooks/useAvatarData";
import { registerAvatarWebhook, syncAvatarResources } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/settings")({
  head: () => ({
    meta: [
      { title: "Avatar Settings · Xeno Studio" },
      { name: "description", content: "Avatar Studio provider connections, sync and personas." },
      { property: "og:title", content: "Avatar Settings · Xeno Studio" },
      { property: "og:description", content: "HeyGen and LiveAvatar connection status." },
    ],
  }),
  component: SettingsPage,
});

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 text-sm">
      <span>{label}</span>
      <span className={ok ? "text-success" : "text-muted-foreground"}>{ok ? "Configured" : "Not configured"}{detail ? ` · ${detail}` : ""}</span>
    </div>
  );
}

function SettingsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useAvatarStatus();
  const personas = usePersonas();
  const [busy, setBusy] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pAvatar, setPAvatar] = useState("");

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["avatar"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <section className="panel divide-y divide-border p-4">
        <h2 className="pb-2 font-display text-sm font-semibold">Connections</h2>
        {isLoading ? <Skeleton className="h-24" /> : data && (
          <>
            <Row label="HeyGen (HEYGEN_API_KEY)" ok={data.heygen.configured} detail={data.heygen.state === "connected" ? data.heygen.account?.balanceLabel ?? "connected" : data.heygen.message} />
            <Row label="LiveAvatar (LIVEAVATAR_API_KEY)" ok={data.liveavatar.configured} />
            <Row label="HeyGen completion notices" ok={data.webhook.registered} detail={data.webhook.registeredAt ? new Date(data.webhook.registeredAt).toLocaleDateString() : null} />
            <div className="pt-2 text-xs text-muted-foreground">
              Last successful HeyGen call: {data.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleString() : "none yet"}
              {data.lastError && <> · Last error: {data.lastError.message}</>}
            </div>
          </>
        )}
      </section>
      {isAdmin && (
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-sm font-semibold">Admin</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!data?.heygen.configured || !!busy} onClick={() => act("sync", () => syncAvatarResources({ data: { includePublic: false } }), "Our avatars and voices synced")}>Sync our avatars & voices</Button>
            <Button variant="outline" disabled={!data?.heygen.configured || !!busy} onClick={() => act("syncp", () => syncAvatarResources({ data: { includePublic: true } }), "Stock catalogue synced")}>Sync stock catalogue</Button>
            <Button variant="outline" disabled={!data?.heygen.configured || !!busy} onClick={() => act("wh", () => registerAvatarWebhook({ data: { target: "live" } }), "Completion notices registered")}>Register completion notices</Button>
          </div>
          <p className="text-xs text-muted-foreground">Without completion notices, jobs still finish — they're checked every 5 minutes instead.</p>
          <h3 className="pt-2 text-sm font-semibold">Live personas</h3>
          {(personas.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span>{p.name} <span className="text-xs text-muted-foreground">{p.liveavatar_avatar_id}</span></span>
              <Button size="sm" variant="ghost" onClick={() => act("p" + p.id, async () => { const { error } = await supabase.from("avatar_realtime_personas").update({ is_active: !p.is_active }).eq("id", p.id); if (error) throw error; }, "Updated")}>{p.is_active ? "Disable" : "Enable"}</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Persona name" className="w-40" aria-label="Persona name" />
            <Input value={pAvatar} onChange={(e) => setPAvatar(e.target.value)} placeholder="LiveAvatar avatar ID" className="flex-1" aria-label="LiveAvatar avatar ID" />
            <Button disabled={!pName || !pAvatar || !!busy} onClick={() => act("np", async () => {
              const { error } = await supabase.from("avatar_realtime_personas").insert({ name: pName, liveavatar_avatar_id: pAvatar, mode: "managed" });
              if (error) throw error;
              setPName(""); setPAvatar("");
            }, "Persona added")}>Add</Button>
          </div>
        </section>
      )}
    </div>
  );
}
