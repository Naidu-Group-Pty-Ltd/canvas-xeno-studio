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
import { supabase } from "@/integrations/supabase/client";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { registerUploadedMusic, stageMusicUpload } from "@/lib/music.functions";
import { audioFileDuration } from "@/lib/music/analyze";
import { RIGHTS_SCOPES, type RightsScope } from "@/lib/music/catalog";
import { ACCEPT_ATTRIBUTE, normalizeMime } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * A recording being uploaded for its licence: the upload the server started
 * for it (see stageMusicUpload), whether the file is there yet, and its
 * measured length. Kept in the browser for a day (see attempts) until the
 * licence is recorded, so trying again after a failure, even after a reload,
 * reuses it rather than uploading another copy. The server clears uploads
 * whose licence is never recorded after two days.
 */
type Staged = {
  uploadId: string;
  bucket: string;
  path: string;
  uploaded: boolean;
  durationSeconds: number | null;
};

const stagedPlace = (userId: string) => `licensed-upload:${userId}`;

function savedStaged(userId: string, upload: string): Staged | null {
  const saved = savedAttempt(stagedPlace(userId), upload);
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<Record<keyof Staged, unknown>>;
    if (
      typeof value.uploadId !== "string" ||
      typeof value.bucket !== "string" ||
      typeof value.path !== "string"
    )
      return null;
    return {
      uploadId: value.uploadId,
      bucket: value.bucket,
      path: value.path,
      uploaded: value.uploaded === true,
      durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : null,
    };
  } catch {
    return null;
  }
}

function keepStaged(userId: string, upload: string, value: Staged | null) {
  keepAttempt(stagedPlace(userId), upload, value ? JSON.stringify(value) : null);
}

/**
 * Adds a track the brand owns or has licensed (for example from a stock
 * library or a sync deal), recording the licence so everyone knows where it
 * may be used. Given audio already in the library (added to an edit from the
 * media bin, say), it records that recording's licence instead of uploading.
 */
export function AddLicensedTrack({
  projectId = null,
  asset = null,
  defaultKind = "music",
  onAdded,
}: {
  projectId?: string | null;
  asset?: { id: string; title: string | null } | null;
  defaultKind?: "music" | "sound_effect";
  onAdded?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(() =>
    (asset?.title ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
  );
  const [artist, setArtist] = useState("");
  const [kind, setKind] = useState<"music" | "sound_effect">(defaultKind);
  const [license, setLicense] = useState<"licensed" | "owned">("licensed");
  const [licensor, setLicensor] = useState("");
  const [reference, setReference] = useState("");
  const [scopes, setScopes] = useState<RightsScope[]>(["organic_social", "paid_social", "web"]);
  const [territories, setTerritories] = useState("Worldwide");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // The confirmation covers this recording and these terms as they stood when
  // it was given: changing any of them asks for it again.
  const declaration = JSON.stringify([
    asset ? ["library", asset.id] : file ? [file.name, file.size, file.lastModified] : null,
    license,
    license === "licensed"
      ? [
          licensor.trim(),
          reference.trim(),
          [...scopes].sort(),
          territories.trim(),
          expiresOn,
          notes.trim(),
        ]
      : null,
  ]);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const confirmed = confirmedFor === declaration;

  const ready =
    (!!asset || !!file) &&
    title.trim().length > 0 &&
    confirmed &&
    (license === "owned" || (licensor.trim().length >= 2 && scopes.length > 0));

  function pick(next: File | null) {
    setFile(next);
    if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function save() {
    if ((!asset && !file) || !user) return;
    setSaving(true);
    // The form's own upload joins the library once its licence is recorded,
    // and is reused when trying again (see Staged).
    const upload = file
      ? JSON.stringify([projectId, file.name, file.size, file.lastModified])
      : null;
    try {
      let staged: Staged | null = null;
      if (file && upload) {
        staged = savedStaged(user.id, upload);
        if (!staged) {
          const started = await stageMusicUpload({
            data: {
              fileName: file.name,
              mimeType: normalizeMime(file.type),
              size: file.size,
              projectId,
            },
          });
          staged = { ...started, uploaded: false, durationSeconds: null };
          keepStaged(user.id, upload, staged);
        }
        if (!staged.uploaded) {
          const [stored, measured] = await Promise.all([
            supabase.storage.from(staged.bucket).upload(staged.path, file, {
              contentType: normalizeMime(file.type),
              upsert: false,
            }),
            audioFileDuration(file),
          ]);
          // An earlier try may have stored it already (its answer lost): that is this file.
          if (stored.error && !/already exists|duplicate/i.test(stored.error.message))
            throw new Error(stored.error.message);
          staged = { ...staged, uploaded: true, durationSeconds: measured };
          keepStaged(user.id, upload, staged);
        }
      }
      await registerUploadedMusic({
        data: {
          ...(staged ? { uploadId: staged.uploadId } : { assetId: asset!.id }),
          durationSeconds: staged?.durationSeconds ?? null,
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
      if (upload) keepStaged(user.id, upload, null);
      await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
      toast.success(asset ? "Licence recorded" : "Track added with its licence");
      onAdded?.();
      setFile(null);
      setTitle("");
      setArtist("");
      setReference("");
      setNotes("");
      setConfirmedFor(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "The track could not be added";
      // An upload the server doesn't have (any more), or refused, is forgotten,
      // so the next try starts again.
      if (upload && /Upload an audio file first|isn't audio|too large|expired/.test(message))
        keepStaged(user.id, upload, null);
      // Audio whose licence is already on record (its track wasn't known
      // here): the library is looked at again, which shows that licence.
      if (asset && /already in the music library/.test(message)) {
        await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
        toast.message(message);
        onAdded?.();
        return;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-xs" data-testid="add-licensed-track">
      {asset ? (
        <p className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <FileAudio className="size-3.5 shrink-0" />
          <span className="truncate">Recording: {asset.title ?? "audio from the library"}</span>
        </p>
      ) : (
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
      )}
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
          onCheckedChange={(checked) => setConfirmedFor(checked === true ? declaration : null)}
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
        {asset ? "Record its licence" : "Add to the music library"}
      </Button>
    </div>
  );
}
