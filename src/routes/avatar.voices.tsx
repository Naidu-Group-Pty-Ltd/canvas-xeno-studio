import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mic, Play, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/studio/EmptyState";
import { useAvatarStatus, useVoices, type Voice } from "@/features/avatar-studio/hooks/useAvatarData";
import { Attestation, AvatarUpload, NotConfigured, StatusChip, SubmitButton, newRequestId } from "@/features/avatar-studio/components/shared";
import { cloneVoice, designVoice, previewSpeech, saveDesignedVoice } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/voices")({
  head: () => ({
    meta: [
      { title: "Avatar Voices · Xeno Studio" },
      { name: "description", content: "Voice catalogue, cloned voices and designed voices." },
      { property: "og:title", content: "Avatar Voices · Xeno Studio" },
      { property: "og:description", content: "Clone, design and preview voices for avatar video." },
    ],
  }),
  component: VoicesPage,
});

function VoicesPage() {
  const { data, isLoading } = useVoices();
  const status = useAvatarStatus();
  const [q, setQ] = useState("");
  const [owned, setOwned] = useState(true);
  const list = useMemo(
    () => (data ?? []).filter((v) => v.is_owned === owned && (!q || `${v.display_name} ${v.language ?? ""}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 200),
    [data, q, owned],
  );
  const configured = !!status.data?.heygen.configured;
  return (
    <div className="space-y-4 p-4">
      {status.data && !configured && <NotConfigured what="HeyGen" />}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={owned ? "own" : "cat"} onValueChange={(v) => setOwned(v === "own")}>
          <TabsList>
            <TabsTrigger value="own">Our voices</TabsTrigger>
            <TabsTrigger value="cat">Catalogue</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or language" className="pl-8" aria-label="Search voices" />
        </div>
        <NewVoiceDialog disabled={!configured} />
      </div>
      {isLoading && <Skeleton className="h-40" />}
      {!isLoading && !list.length && <EmptyState icon={Mic} title={owned ? "No voices yet" : "Catalogue not synced"} description={owned ? "Clone a voice from a recording or design one from a description." : "An admin can sync HeyGen's voice catalogue from Avatar Settings."} />}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => <VoiceRow key={v.id} v={v} configured={configured} />)}
      </div>
    </div>
  );
}

function VoiceRow({ v, configured }: { v: Voice; configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const play = async () => {
    if (v.preview_url && v.status !== "ready") return;
    setBusy(true);
    try {
      const url = v.preview_url ?? (await previewSpeech({ data: { voiceId: v.id, text: "Hello, this is a quick preview of my voice for Xeno Studio." } }))?.audioUrl;
      if (url) await new Audio(url).play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel flex items-center gap-3 p-3">
      <Button size="icon" variant="outline" aria-label={`Preview ${v.display_name}`} disabled={busy || (!v.preview_url && (!configured || v.status !== "ready"))} onClick={play}>
        <Play className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{v.display_name}</div>
        <div className="truncate text-xs text-muted-foreground">{[v.language, v.gender_metadata, v.voice_type.replace(/_/g, " ")].filter(Boolean).join(" · ")}</div>
      </div>
      <StatusChip status={v.status} />
    </div>
  );
}

function NewVoiceDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"instant" | "professional" | "design">("instant");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string; duration: number | null }[]>([]);
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqId, setReqId] = useState(newRequestId);
  const [prompt, setPrompt] = useState("");
  const [designs, setDesigns] = useState<{ voice_id: string; name: string; language: string; preview_audio_url?: string | null }[]>([]);
  const total = files.reduce((s, f) => s + (f.duration ?? 0), 0);

  const clone = async () => {
    setBusy(true);
    try {
      const r = await cloneVoice({
        data: { mode: tab === "professional" ? "professional" : "instant", name, ...(language ? { language } : {}), assetIds: files.map((f) => f.id), removeBackgroundNoise: true, attestation: { confirmed: true, ...(note ? { permissionNote: note } : {}) }, clientRequestId: reqId },
      });
      if (r && "ok" in r && r.ok === false) toast.error(r.errorMessage ?? "HeyGen rejected the request");
      else {
        toast.success(tab === "instant" ? "Voice clone submitted" : "Professional training started — this takes a while");
        setOpen(false);
        setFiles([]);
        setReqId(newRequestId());
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const design = async () => {
    setBusy(true);
    try {
      const r = await designVoice({ data: { prompt, seed: Math.floor(Math.random() * 50) } });
      setDesigns(r?.voices ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}><Plus className="mr-1 size-4" /> New voice</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New voice</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setFiles([]); }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instant">Instant clone</TabsTrigger>
            <TabsTrigger value="professional">Professional</TabsTrigger>
            <TabsTrigger value="design">Design</TabsTrigger>
          </TabsList>
          <TabsContent value="design" className="space-y-3">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Warm, confident British woman in her 30s, calm pacing" maxLength={1000} />
            <SubmitButton busy={busy} disabled={prompt.trim().length < 3} onClick={design}>Suggest voices</SubmitButton>
            {designs.map((d) => (
              <div key={d.voice_id} className="flex items-center gap-2 rounded border border-border p-2 text-sm">
                {d.preview_audio_url && <Button size="icon" variant="ghost" aria-label="Play" onClick={() => void new Audio(d.preview_audio_url!).play()}><Play className="size-4" /></Button>}
                <span className="flex-1 truncate">{d.name} · {d.language}</span>
                <Button size="sm" variant="outline" onClick={async () => {
                  await saveDesignedVoice({ data: { providerVoiceId: d.voice_id, name: d.name, language: d.language, ...(d.preview_audio_url ? { previewUrl: d.preview_audio_url } : {}), prompt } });
                  toast.success("Voice saved");
                }}>Save</Button>
              </div>
            ))}
          </TabsContent>
          {tab !== "design" && (
            <div className="mt-4 space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voice name" aria-label="Voice name" maxLength={100} />
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Language (optional, e.g. English)" aria-label="Language" />
              <p className="text-xs text-muted-foreground">{tab === "instant" ? "One clean recording, ideally 1–3 minutes, no music." : `At least 20 minutes of clean speech across up to 10 files. Loaded: ${Math.round(total / 60)} min.`}</p>
              {(tab === "professional" || files.length === 0) && <AvatarUpload role="training_audio" accept="audio/*,video/mp4" multiple={tab === "professional"} label="Drop recordings" onUploaded={(a) => setFiles((f) => [...f, ...a].slice(0, 10))} />}
              {files.map((f) => <p key={f.id} className="text-xs">• {f.name}{f.duration ? ` (${Math.round(f.duration)} s)` : ""}</p>)}
              <Attestation checked={attested} onChange={setAttested} note={note} onNote={setNote} />
              <SubmitButton busy={busy} disabled={!name.trim() || !files.length || !attested || (tab === "professional" && total > 0 && total < 1200)} onClick={clone}>
                {tab === "instant" ? "Clone voice" : "Start training"}
              </SubmitButton>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
