import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileAudio, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { registerUploadedMusic } from "@/lib/music.functions";
import { audioFileDuration } from "@/lib/music/analyze";
import { RIGHTS_SCOPES, type RightsScope } from "@/lib/music/catalog";
import { ACCEPT_ATTRIBUTE, uploadReference } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Adds a track the brand owns or has licensed (for example from a stock
 * library or a sync deal), recording the licence so everyone knows where it
 * may be used.
 */
export function AddLicensedTrack({ projectId = null }: { projectId?: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [kind, setKind] = useState<"music" | "sound_effect">("music");
  const [license, setLicense] = useState<"licensed" | "owned">("licensed");
  const [licensor, setLicensor] = useState("");
  const [reference, setReference] = useState("");
  const [scopes, setScopes] = useState<RightsScope[]>(["organic_social", "paid_social", "web"]);
  const [territories, setTerritories] = useState("Worldwide");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const ready =
    !!file &&
    title.trim().length > 0 &&
    confirmed &&
    (license === "owned" || (licensor.trim().length >= 2 && scopes.length > 0));

  function pick(next: File | null) {
    setFile(next);
    if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function save() {
    if (!file || !user) return;
    setSaving(true);
    try {
      const [asset, durationSeconds] = await Promise.all([
        uploadReference(file, { userId: user.id, projectId }),
        audioFileDuration(file),
      ]);
      await registerUploadedMusic({
        data: {
          assetId: asset.id,
          durationSeconds,
          title: title.trim(),
          artist: artist.trim() || null,
          kind,
          license,
          confirmed: true,
          projectId,
          campaignId: null,
          ...(license === "licensed"
            ? {
                rights: {
                  licensor: licensor.trim(),
                  reference: reference.trim(),
                  scopes,
                  territories: territories.trim() || "Worldwide",
                  expiresOn: expiresOn || null,
                  notes: notes.trim(),
                },
              }
            : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
      toast.success("Track added with its licence");
      setFile(null);
      setTitle("");
      setArtist("");
      setReference("");
      setNotes("");
      setConfirmed(false);
      if (input.current) input.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The track could not be added");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-xs" data-testid="add-licensed-track">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          <Upload className="mr-1.5 size-3.5" /> Choose audio file
        </Button>
        {file ? (
          <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
            <FileAudio className="size-3.5 shrink-0" />
            <span className="truncate">{file.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">WAV, MP3 or M4A</span>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE.audio}
          className="hidden"
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 300))}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Artist</Label>
          <Input
            value={artist}
            onChange={(event) => setArtist(event.target.value.slice(0, 300))}
            className="h-8 text-xs"
          />
        </div>
      </div>
      {/* A sound effect is placed at the playhead once; music is a bed that loops, fades and ducks. */}
      <div
        className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5"
        role="radiogroup"
        aria-label="Kind of audio"
      >
        {(
          [
            ["music", "Music"],
            ["sound_effect", "Sound effect"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => setKind(id)}
            className={cn(
              "rounded px-2 py-1.5",
              kind === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="grid grid-cols-2 gap-1 rounded-md border border-border p-0.5"
        role="radiogroup"
        aria-label="Rights"
      >
        {(
          [
            ["licensed", "Licensed to us"],
            ["owned", "Owned by the brand"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={license === id}
            onClick={() => setLicense(id)}
            className={cn(
              "rounded px-2 py-1.5",
              license === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {license === "licensed" && (
        <div className="space-y-2 rounded-md border border-border p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Licensed from</Label>
              <Input
                value={licensor}
                onChange={(event) => setLicensor(event.target.value.slice(0, 200))}
                placeholder="Epidemic Sound, Artlist, the label…"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Licence ID or agreement</Label>
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value.slice(0, 200))}
                placeholder="Licence number, order ID…"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">May be used in</Label>
            <div className="flex flex-wrap gap-1.5">
              {RIGHTS_SCOPES.map((scope) => {
                const on = scopes.includes(scope.id);
                return (
                  <button
                    key={scope.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setScopes((current) =>
                        on ? current.filter((entry) => entry !== scope.id) : [...current, scope.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      on ? "border-primary bg-primary/10" : "border-border text-muted-foreground",
                    )}
                  >
                    {scope.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Territories</Label>
              <Input
                value={territories}
                onChange={(event) => setTerritories(event.target.value.slice(0, 200))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Licence ends (optional)</Label>
              <Input
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
            placeholder="Anything else in the licence (credit wording, edit rules, campaign it's limited to)…"
            className="min-h-[50px] text-xs"
          />
        </div>
      )}
      <label className="flex items-start gap-2 rounded-md border border-border p-2">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(checked) => setConfirmed(checked === true)}
          className="mt-0.5"
        />
        <span>
          <ShieldCheck className="mr-1 inline size-3.5 text-success" />
          {license === "owned"
            ? "I confirm the brand owns this recording and its composition."
            : "I confirm we hold this licence and it covers the uses ticked above. The confirmation is recorded with the track."}
        </span>
      </label>
      <Button
        className="w-full"
        disabled={!ready || saving}
        onClick={() => void save()}
        data-testid="add-licensed-button"
      >
        {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
        Add to the music library
      </Button>
    </div>
  );
}
