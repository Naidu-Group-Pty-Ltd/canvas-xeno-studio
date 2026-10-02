import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Plus, RefreshCw, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/studio/EmptyState";
import { useAvatarStatus, useCharacters, type Character } from "@/features/avatar-studio/hooks/useAvatarData";
import { Attestation, AvatarUpload, NotConfigured, StatusChip, SubmitButton, newRequestId } from "@/features/avatar-studio/components/shared";
import { createAvatar, refreshCharacter, requestAvatarConsent } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/characters")({
  head: () => ({
    meta: [
      { title: "Avatar Characters · Xeno Studio" },
      { name: "description", content: "Digital twins, photo and prompt avatars with their looks." },
      { property: "og:title", content: "Avatar Characters · Xeno Studio" },
      { property: "og:description", content: "Create and manage avatar identities and looks." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const { data, isLoading } = useCharacters();
  const status = useAvatarStatus();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"owned" | "provider_public">("owned");
  const list = useMemo(
    () => (data ?? []).filter((c) => c.ownership_type === scope && (!q || c.display_name.toLowerCase().includes(q.toLowerCase()))),
    [data, q, scope],
  );

  return (
    <div className="space-y-4 p-4">
      {status.data && !status.data.heygen.configured && <NotConfigured what="HeyGen" />}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <TabsList>
            <TabsTrigger value="owned">Our avatars</TabsTrigger>
            <TabsTrigger value="provider_public">Stock avatars</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" aria-label="Search avatars" />
        </div>
        <CreateAvatarDialog disabled={!status.data?.heygen.configured} />
      </div>
      {isLoading && <Skeleton className="h-48" />}
      {!isLoading && !list.length && (
        <EmptyState
          icon={UserRound}
          title={scope === "owned" ? "No avatars yet" : "Stock avatars not synced"}
          description={scope === "owned" ? "Create a Digital Twin from footage, or a Photo or Prompt avatar." : "An admin can sync HeyGen's stock catalogue from Avatar Settings."}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((c) => (
          <CharacterCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

function CharacterCard({ c }: { c: Character }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = c.provider_training_status ?? "completed";
  const preview = c.preview_url ?? c.avatar_looks[0]?.preview_url ?? null;
  return (
    <div className="panel flex flex-col overflow-hidden">
      <div className="aspect-video bg-surface-raised">
        {preview ? <img src={preview} alt={c.display_name} loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><UserRound className="size-8 text-muted-foreground" /></div>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-display text-sm font-semibold">{c.display_name}</h3>
          <StatusChip status={status === "pending_consent" ? "awaiting_consent" : status === "processing" ? "training" : status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {c.avatar_type.replace(/_/g, " ")} · {c.avatar_looks.length} look{c.avatar_looks.length === 1 ? "" : "s"}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          {status === "completed" && c.avatar_looks.length > 0 && (
            <Button size="sm" onClick={() => navigate({ to: "/avatar/generate", search: { look: c.avatar_looks[0]!.id } as never })}>
              Use in video
            </Button>
          )}
          {status === "pending_consent" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await requestAvatarConsent({ data: { characterId: c.id } });
                  if (r?.url) window.open(r.url, "_blank", "noopener");
                  toast.success("Consent link created — send it to the person on camera");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ExternalLink className="mr-1 size-3" /> Consent link
            </Button>
          )}
          {c.ownership_type === "owned" && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Refresh from HeyGen"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await refreshCharacter({ data: { characterId: c.id } });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAvatarDialog({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"digital_twin" | "photo" | "prompt">("digital_twin");
  const [name, setName] = useState("");
  const [asset, setAsset] = useState<{ id: string; name: string; duration: number | null } | null>(null);
  const [refs, setRefs] = useState<{ id: string; name: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqId] = useState(newRequestId);

  const needsAttest = type !== "prompt" || refs.length > 0;
  const ready = name.trim() && (type === "prompt" ? prompt.trim().length >= 3 : !!asset) && (!needsAttest || attested);

  const submit = async () => {
    setBusy(true);
    try {
      const attestation = { confirmed: true as const, ...(note ? { permissionNote: note } : {}) };
      const payload =
        type === "prompt"
          ? { type, name, prompt, referenceAssetIds: refs.map((r) => r.id), ...(refs.length ? { attestation } : {}), clientRequestId: reqId }
          : { type, name, assetId: asset!.id, attestation, clientRequestId: reqId };
      const r = await createAvatar({ data: payload as never });
      if (r && "ok" in r && r.ok === false) toast.error(r.errorMessage ?? "HeyGen rejected the request");
      else {
        toast.success(type === "digital_twin" ? "Training started — the person on camera may need to confirm consent" : "Avatar requested");
        setOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="mr-1 size-4" /> New avatar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New avatar</DialogTitle>
        </DialogHeader>
        <Tabs value={type} onValueChange={(v) => { setType(v as typeof type); setAsset(null); }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="digital_twin">Digital Twin</TabsTrigger>
            <TabsTrigger value="photo">Photo</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
          </TabsList>
          <div className="mt-4 space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Avatar name" aria-label="Avatar name" maxLength={100} />
            <TabsContent value="digital_twin" className="m-0 space-y-2">
              <p className="text-xs text-muted-foreground">15 s – 10 min of the person talking to camera, steady framing, good light. HeyGen may email them a consent check.</p>
              {asset ? <p className="text-sm">Footage: {asset.name}{asset.duration ? ` (${Math.round(asset.duration)} s)` : ""}</p> : <AvatarUpload role="training_video" accept="video/mp4,video/webm,video/quicktime" label="Drop training footage (MP4, MOV, WebM)" onUploaded={(a) => setAsset(a[0] ?? null)} />}
            </TabsContent>
            <TabsContent value="photo" className="m-0 space-y-2">
              {asset ? <p className="text-sm">Photo: {asset.name}</p> : <AvatarUpload role="identity_reference" accept="image/png,image/jpeg" label="Drop a clear front-facing photo (PNG/JPEG)" onUploaded={(a) => setAsset(a[0] ?? null)} />}
            </TabsContent>
            <TabsContent value="prompt" className="m-0 space-y-2">
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the person: age, look, wardrobe, setting…" maxLength={1000} />
              <p className="text-xs text-muted-foreground">Optional reference photos (up to 3):</p>
              {refs.length < 3 && <AvatarUpload role="identity_reference" accept="image/png,image/jpeg" label="Add reference photo" onUploaded={(a) => setRefs((r) => [...r, ...a].slice(0, 3))} />}
              {refs.map((r) => <p key={r.id} className="text-xs">• {r.name}</p>)}
            </TabsContent>
            {needsAttest && <Attestation checked={attested} onChange={setAttested} note={note} onNote={setNote} />}
            <SubmitButton busy={busy} disabled={!ready} onClick={submit}>Create avatar</SubmitButton>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
