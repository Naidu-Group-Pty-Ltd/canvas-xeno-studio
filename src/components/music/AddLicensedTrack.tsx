import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileAudio, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropOverlay } from "@/components/ui/drop-overlay";
import { useAuth } from "@/hooks/useAuth";
import { useFileDrop } from "@/hooks/useFileDrop";
import {
  fileDigest,
  isUploadableAudio,
  keepStaged,
  uploadKey,
  uploadRefused,
  uploadStaged,
  type Staged,
} from "@/lib/audio-upload";
import { registerUploadedMusic } from "@/lib/music.functions";
import {
  licenceTerms,
  RIGHTS_SCOPES,
  type MusicTrackRow,
  type RightsScope,
} from "@/lib/music/catalog";
import { ACCEPT_ATTRIBUTE } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** A track just recorded, as an edit adds it. */
export type AddedTrack = {
  assetId: string | null;
  title: string;
  durationSeconds: number | null;
  kind: "music" | "sound_effect";
};

/**
 * Adds a track the brand owns or has licensed (for example from a stock
 * library or a sync deal), recording the licence so everyone knows where it
 * may be used. Given audio already in the library (added to an edit from the
 * media bin, say), it records that recording's licence instead of uploading.
 * Given a track whose licence was recorded (`renewing`), it records that
 * licence's terms as they now stand, say once it has been renewed, starting
 * from the terms on record. A file can be chosen, or dragged onto the form
 * from the desktop; one dropped elsewhere (on the music page, say) arrives as
 * `initialFile`.
 */
export function AddLicensedTrack({
  projectId = null,
  asset: given = null,
  renewing = null,
  defaultKind = "music",
  initialFile = null,
  onAdded,
}: {
  projectId?: string | null;
  asset?: { id: string; title: string | null } | null;
  renewing?: MusicTrackRow | null;
  defaultKind?: "music" | "sound_effect";
  initialFile?: File | null;
  /** Once recorded, with the track as it can be added to an edit. */
  onAdded?: (track: AddedTrack) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const asset = renewing?.asset_id ? { id: renewing.asset_id, title: renewing.title } : given;
  // The terms on record, when renewing.
  const recorded = (key: string) => {
    const value = (renewing?.rights ?? {})[key];
    return typeof value === "string" ? value : "";
  };
  const recordedScopes = Array.isArray((renewing?.rights ?? {})["scopes"])
    ? RIGHTS_SCOPES.map((scope) => scope.id).filter((id) =>
        ((renewing?.rights ?? {})["scopes"] as unknown[]).includes(id),
      )
    : [];
  const [file, setFile] = useState<File | null>(null);
  // What the picked file holds (see fileDigest), once read; the latest pick decides.
  const picked = useRef<File | null>(null);
  const [digest, setDigest] = useState<{ file: File; value: string } | null>(null);
  const contentId = file && digest?.file === file ? digest.value : null;
  const [title, setTitle] = useState(() =>
    renewing ? renewing.title : (asset?.title ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
  );
  const [artist, setArtist] = useState(renewing?.artist ?? "");
  const [kind, setKind] = useState<"music" | "sound_effect">(
    renewing ? (renewing.kind === "sound_effect" ? "sound_effect" : "music") : defaultKind,
  );
  const [license, setLicense] = useState<"licensed" | "owned">(
    renewing?.license === "owned" ? "owned" : "licensed",
  );
  const [licensor, setLicensor] = useState(recorded("licensor"));
  const [reference, setReference] = useState(recorded("reference"));
  const [scopes, setScopes] = useState<RightsScope[]>(
    recordedScopes.length ? recordedScopes : ["organic_social", "paid_social", "web"],
  );
  const [territories, setTerritories] = useState(recorded("territories") || "Worldwide");
  const [expiresOn, setExpiresOn] = useState(recorded("expiresOn"));
  const [notes, setNotes] = useState(recorded("notes"));
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
    (!file || contentId !== null) &&
    title.trim().length > 0 &&
    confirmed &&
    (license === "owned" || (licensor.trim().length >= 2 && scopes.length > 0));

  function pick(next: File | null) {
    if (next && !isUploadableAudio(next)) {
      toast.error(`“${next.name}” isn't a WAV, MP3 or M4A file.`);
      return;
    }
    setFile(next);
    // A confirmation given before covers the file picked then, not this one.
    setConfirmedFor(null);
    picked.current = next;
    if (next)
      void fileDigest(next).then((value) => {
        if (picked.current === next) setDigest({ file: next, value });
      });
    if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  // A file dropped elsewhere for this form (each one once).
  const taken = useRef<File | null>(null);
  useEffect(() => {
    if (!initialFile || asset || taken.current === initialFile) return;
    taken.current = initialFile;
    pick(initialFile);
    // pick only sets this form's own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, asset]);

  const { dragging, dropProps } = useFileDrop({
    disabled: !!asset || saving,
    onFiles: (files) => {
      if (files.length > 1) toast.message("One track at a time: the first file was taken.");
      pick(files[0] ?? null);
    },
  });

  async function save() {
    if ((!asset && !file) || (file && !contentId) || !user) return;
    setSaving(true);
    // The form's own upload joins the library once its licence is recorded,
    // and is reused when trying again (see Staged) with a file that holds the
    // same audio (see fileDigest).
    const upload = file && contentId ? uploadKey(projectId, file, contentId) : null;
    try {
      const staged: Staged | null =
        file && upload ? await uploadStaged({ userId: user.id, file, upload, projectId }) : null;
      const track = await registerUploadedMusic({
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
      toast.success(
        renewing ? "Licence updated" : asset ? "Licence recorded" : "Track added with its licence",
      );
      onAdded?.({
        assetId: track.assetId,
        title: track.title,
        durationSeconds: track.durationSeconds,
        kind,
      });
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
      if (upload && uploadRefused(message)) keepStaged(user.id, upload, null);
      // Audio whose licence is already on record (its track wasn't known
      // here): the library is looked at again, which shows that licence.
      if (asset && !renewing && /already in the music library/.test(message)) {
        await queryClient.invalidateQueries({ queryKey: ["music_tracks"] });
        toast.message(message);
        onAdded?.({ assetId: asset.id, title: asset.title ?? title, durationSeconds: null, kind });
        return;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative space-y-3 text-xs" data-testid="add-licensed-track" {...dropProps}>
      <DropOverlay active={dragging} label="Drop the audio file to add it" />
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
            <span className="text-muted-foreground">
              WAV, MP3 or M4A <span className="hidden md:inline">· or drag it here</span>
            </span>
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
        {(saving || (!!file && !contentId)) && <Loader2 className="mr-1.5 size-4 animate-spin" />}
        {renewing
          ? licenceTerms(renewing)?.expired
            ? "Renew its licence"
            : "Update its licence"
          : asset
            ? "Record its licence"
            : "Add to the music library"}
      </Button>
    </div>
  );
}
