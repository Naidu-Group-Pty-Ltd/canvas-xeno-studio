import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useAvatarAssets, useAvatarStatus } from "@/features/avatar-studio/hooks/useAvatarData";
import { AvatarUpload, NotConfigured, SubmitButton, newRequestId } from "@/features/avatar-studio/components/shared";
import { listTranslationLanguages, submitLocalization } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/localize")({
  head: () => ({
    meta: [
      { title: "Localize Video · Xeno Studio" },
      { name: "description", content: "Translate and lip-sync avatar videos into other languages." },
      { property: "og:title", content: "Localize Video · Xeno Studio" },
      { property: "og:description", content: "Video translation and lip-sync dubbing." },
    ],
  }),
  component: LocalizePage,
});

function LocalizePage() {
  const navigate = useNavigate();
  const status = useAvatarStatus();
  const configured = !!status.data?.heygen.configured;
  const videos = useAvatarAssets({ type: "video", roles: ["generated_video", "source_video", "translated_video", "lipsynced_video"] });
  const langs = useQuery({ queryKey: ["avatar", "langs"], enabled: configured, queryFn: () => listTranslationLanguages(), staleTime: 3600_000 });
  const [kind, setKind] = useState<"translation" | "lipsync">("translation");
  const [source, setSource] = useState<string>("");
  const [audio, setAudio] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"speed" | "precision">("speed");
  const [busy, setBusy] = useState(false);
  const [reqId, setReqId] = useState(newRequestId);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await submitLocalization({ data: { kind, sourceAssetId: source, ...(audio ? { audioAssetId: audio.id } : {}), languages: selected, mode, clientRequestId: reqId } });
      if (r && "ok" in r && r.ok === false) toast.error(r.errorMessage ?? "Rejected");
      else {
        toast.success("Submitted — follow it in Jobs");
        setReqId(newRequestId());
        navigate({ to: "/avatar/jobs" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {status.data && !configured && <NotConfigured what="HeyGen" />}
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList><TabsTrigger value="translation">Translate</TabsTrigger><TabsTrigger value="lipsync">Lip-sync new audio</TabsTrigger></TabsList>
      </Tabs>
      <div className="space-y-1.5">
        <Label>Source video</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger><SelectValue placeholder="Choose from the Avatar library" /></SelectTrigger>
          <SelectContent className="max-h-80">{(videos.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.title ?? a.id.slice(0, 8)}</SelectItem>)}</SelectContent>
        </Select>
        <AvatarUpload role="source_video" accept="video/mp4,video/webm,video/quicktime" label="…or upload a video" onUploaded={(a) => a[0] && setSource(a[0].id)} />
      </div>
      {kind === "translation" ? (
        <div className="space-y-2">
          <Label>Target languages ({selected.length})</Label>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded border border-border p-2 text-sm sm:grid-cols-3">
            {(langs.data ?? []).map((l) => (
              <label key={l} className="flex items-center gap-2">
                <Checkbox checked={selected.includes(l)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, l].slice(0, 20) : s.filter((x) => x !== l)))} />
                <span className="truncate">{l}</span>
              </label>
            ))}
            {langs.isLoading && <span className="text-muted-foreground">Loading languages…</span>}
          </div>
        </div>
      ) : audio ? <p className="text-sm">Audio: {audio.name}</p> : <AvatarUpload role="source_audio" accept="audio/*" label="Drop replacement audio" onUploaded={(a) => setAudio(a[0] ?? null)} />}
      <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <SelectTrigger aria-label="Quality mode"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="speed">Fast</SelectItem><SelectItem value="precision">Precision (slower)</SelectItem></SelectContent>
      </Select>
      <SubmitButton busy={busy} disabled={!configured || !source || (kind === "translation" ? !selected.length : !audio)} onClick={submit}>Submit</SubmitButton>
    </div>
  );
}
