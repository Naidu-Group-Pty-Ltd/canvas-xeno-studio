import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarStatus, useCharacters, useVoices } from "@/features/avatar-studio/hooks/useAvatarData";
import { Attestation, AvatarUpload, NotConfigured, SubmitButton, newRequestId } from "@/features/avatar-studio/components/shared";
import { submitAvatarVideo } from "@/features/avatar-studio/lib/avatar.functions";

export const Route = createFileRoute("/avatar/generate")({
  validateSearch: (s) => z.object({ look: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Generate Avatar Video · Xeno Studio" },
      { name: "description", content: "Render avatar, photo, audio-driven and cinematic avatar videos." },
      { property: "og:title", content: "Generate Avatar Video · Xeno Studio" },
      { property: "og:description", content: "Script, voice and look in; finished avatar video out." },
    ],
  }),
  component: GeneratePage,
});

type Mode = "avatar" | "image" | "audio" | "cinematic" | "transparent";

function GeneratePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const status = useAvatarStatus();
  const chars = useCharacters();
  const voices = useVoices();
  const [mode, setMode] = useState<Mode>("avatar");
  const [lookId, setLookId] = useState<string | undefined>(search.look);
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const [engine, setEngine] = useState<string | undefined>();
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [motion, setMotion] = useState("");
  const [cinePrompt, setCinePrompt] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [captions, setCaptions] = useState(false);
  const [image, setImage] = useState<{ id: string; name: string } | null>(null);
  const [audio, setAudio] = useState<{ id: string; name: string } | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reqId, setReqId] = useState(newRequestId);

  const looks = useMemo(
    () => (chars.data ?? []).flatMap((c) => c.avatar_looks.filter((l) => !l.training_status || l.training_status === "completed").map((l) => ({ ...l, charName: c.display_name, owned: c.ownership_type === "owned" }))),
    [chars.data],
  );
  const look = looks.find((l) => l.id === lookId);
  const engines = (Array.isArray(look?.supported_engines) ? look.supported_engines : []) as string[];
  const readyVoices = (voices.data ?? []).filter((v) => v.status === "ready");
  const configured = !!status.data?.heygen.configured;

  const needsLook = mode !== "image";
  const needsSpeech = mode !== "cinematic";
  const valid =
    configured &&
    (!needsLook || !!look) &&
    (mode !== "image" || (!!image && attested)) &&
    (mode !== "audio" || !!audio) &&
    (mode !== "cinematic" || cinePrompt.trim().length > 3) &&
    (!needsSpeech || mode === "audio" || (script.trim().length > 0 && (!!voiceId || !!look?.default_provider_voice_id)));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await submitAvatarVideo({
        data: {
          mode,
          title: title || undefined,
          lookId: needsLook ? lookId : undefined,
          voiceId,
          engine: engine as never,
          script: mode === "audio" ? undefined : script,
          audioAssetId: mode === "audio" ? audio?.id : undefined,
          imageAssetId: mode === "image" ? image?.id : undefined,
          motionPrompt: motion || undefined,
          cinematicPrompt: mode === "cinematic" ? cinePrompt : undefined,
          aspectRatio: aspect,
          resolution,
          captions,
          attestation: mode === "image" ? { confirmed: true } : undefined,
          clientRequestId: reqId,
        } as never,
      });
      if (r && "ok" in r && r.ok === false) {
        toast.error(r.errorMessage ?? "HeyGen rejected the request");
        if (r.status !== "submission_uncertain") setReqId(newRequestId());
        return;
      }
      toast.success("Video submitted — follow it in Jobs");
      setReqId(newRequestId());
      navigate({ to: "/avatar/jobs" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {status.data && !configured && <NotConfigured what="HeyGen" />}
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="avatar">Avatar</TabsTrigger>
            <TabsTrigger value="image">Photo to video</TabsTrigger>
            <TabsTrigger value="audio">Your audio</TabsTrigger>
            <TabsTrigger value="cinematic">Cinematic</TabsTrigger>
            <TabsTrigger value="transparent">Transparent</TabsTrigger>
          </TabsList>
        </Tabs>
        {needsLook && (
          <div className="space-y-1.5">
            <Label>Look</Label>
            <Select value={lookId ?? ""} onValueChange={(v) => { setLookId(v); setEngine(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Choose a character look" /></SelectTrigger>
              <SelectContent className="max-h-80">
                {looks.map((l) => <SelectItem key={l.id} value={l.id}>{l.owned ? "★ " : ""}{l.charName} — {l.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {mode === "image" && (
          <div className="space-y-2">
            {image ? <p className="text-sm">Photo: {image.name}</p> : <AvatarUpload role="source_image" accept="image/png,image/jpeg" label="Drop a photo of the presenter" onUploaded={(a) => setImage(a[0] ?? null)} />}
            <Attestation checked={attested} onChange={setAttested} />
          </div>
        )}
        {mode === "audio" && (audio ? <p className="text-sm">Audio: {audio.name}</p> : <AvatarUpload role="source_audio" accept="audio/*" label="Drop the voiceover to lip-sync" onUploaded={(a) => setAudio(a[0] ?? null)} />)}
        {mode === "cinematic" && <Textarea value={cinePrompt} onChange={(e) => setCinePrompt(e.target.value)} placeholder="Describe the scene, camera and action" className="min-h-28" maxLength={10000} />}
        {needsSpeech && mode !== "audio" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="script">Script</Label>
              <Textarea id="script" value={script} onChange={(e) => setScript(e.target.value)} className="min-h-40" maxLength={10000} />
              <p className="text-right text-xs text-muted-foreground">{script.length} / 10000</p>
            </div>
            <div className="space-y-1.5">
              <Label>Voice</Label>
              <Select value={voiceId ?? ""} onValueChange={setVoiceId}>
                <SelectTrigger><SelectValue placeholder={look?.default_provider_voice_id ? "Look's default voice" : "Choose a voice"} /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {readyVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.is_owned ? "★ " : ""}{v.display_name}{v.language ? ` · ${v.language}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      <aside className="panel h-fit space-y-3 p-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Title" />
        {engines.length > 0 && mode !== "cinematic" && (
          <div className="space-y-1.5">
            <Label>Engine</Label>
            <Select value={engine ?? ""} onValueChange={setEngine}>
              <SelectTrigger><SelectValue placeholder="Best available" /></SelectTrigger>
              <SelectContent>{engines.map((e) => <SelectItem key={e} value={e}>{e.replace("avatar_", "Avatar ").toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {mode !== "cinematic" && <Input value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="Motion direction (optional)" aria-label="Motion direction" />}
        <div className="grid grid-cols-2 gap-2">
          <Select value={aspect} onValueChange={(v) => setAspect(v as typeof aspect)}>
            <SelectTrigger aria-label="Aspect ratio"><SelectValue /></SelectTrigger>
            <SelectContent>{["16:9", "9:16", "1:1"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
            <SelectTrigger aria-label="Resolution"><SelectValue /></SelectTrigger>
            <SelectContent>{["720p", "1080p"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {mode !== "cinematic" && (
          <label className="flex items-center justify-between text-sm">Captions file <Switch checked={captions} onCheckedChange={setCaptions} /></label>
        )}
        <p className="text-xs text-muted-foreground">HeyGen bills from your account balance{status.data?.heygen.account?.balanceLabel ? ` (${status.data.heygen.account.balanceLabel})` : ""}. HeyGen doesn't publish a pre-render price, so no estimate is shown.</p>
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Generate video</SubmitButton>
      </aside>
    </div>
  );
}
