import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  FileAudio,
  Loader2,
  Mic,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  playUrl,
  takeInProgress,
  useBrandVoices,
  useResolvedVoice,
  useVoiceovers,
  type VoiceoverRow,
} from "@/hooks/useVoiceData";
import { useAuth } from "@/hooks/useAuth";
import { useFileDrop } from "@/hooks/useFileDrop";
import {
  fileDigest,
  isUploadableAudio,
  keepStaged,
  uploadKey,
  uploadRefused,
  uploadStaged,
} from "@/lib/audio-upload";
import { ACCEPT_ATTRIBUTE } from "@/lib/storage";
import {
  generateVoiceover,
  importRecordedVoiceover,
  writeVoiceoverScript,
} from "@/lib/voice.functions";
import { estimatedSeconds, wordCount, type TimedWord } from "@/lib/voice/catalog";
import {
  audioFromSource,
  captionsFromWords,
  mergeCaptions,
  formatTime,
  layoutTimeline,
  LIMITS,
  placeAt,
  type Timeline,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { isMissingTableError } from "@/lib/edit/errors";
import { keepAttempt, savedAttempt } from "@/lib/attempts";
import { BrandVoiceSelect } from "@/components/voices/VoiceAssignment";
import { VoiceEditor } from "@/components/voices/VoiceEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropOverlay } from "@/components/ui/drop-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface VoiceoverContext {
  sequenceId: string;
  projectId: string | null;
  campaignId: string | null;
  /** A script the edit was planned with (for example by Supercomputer). */
  suggestedScript: string | null;
}

const MAX_SCRIPT = 4000;
const VIA_LABEL = {
  chosen: "chosen",
  campaign: "campaign voice",
  project: "project voice",
  default: "studio default",
} as const;

function draftKey(sequenceId: string) {
  return `xeno:voiceover-script:${sequenceId}`;
}

function readDraft(sequenceId: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(sequenceId));
  } catch {
    return null;
  }
}

function writeDraft(sequenceId: string, script: string) {
  try {
    if (script.trim()) window.localStorage.setItem(draftKey(sequenceId), script);
    else window.localStorage.removeItem(draftKey(sequenceId));
  } catch {
    // Drafts are a convenience; without storage the script lives in the panel only.
  }
}

interface Attempt {
  key: string;
  id: string;
}

/** Where an edit's voiceover attempts are kept across reloads (see `@/lib/attempts`). */
const attemptPlace = (sequenceId: string) => `voiceover:${sequenceId}`;

async function playAsset(assetId: string) {
  const { data: asset } = await supabase
    .from("assets")
    .select("storage_bucket,storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) {
    toast.error("That take is no longer in the library");
    return;
  }
  const { data } = await supabase.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_path, 600);
  if (data?.signedUrl) playUrl(data.signedUrl);
}

/**
 * Voiceover for an edit, spoken by the brand voice: write (or have AI write)
 * the script to the edit's length, generate it, and drop it on the timeline
 * with captions timed to every word. A voiceover recorded elsewhere can be
 * imported from the device instead (chosen, or dragged onto the panel): it is
 * kept with the edit's takes and placed the same way.
 */
export function VoiceoverPanel({
  context,
  timeline,
  layout,
  playhead,
  onUpdate,
  getTimeline,
}: {
  context: VoiceoverContext;
  timeline: Timeline;
  layout: TimelineLayout;
  playhead: () => number;
  /** Applies a change to the timeline as it is when the change lands. */
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
  /** The edit's timeline as it is now, even once this panel has closed. */
  getTimeline: () => Timeline;
}) {
  const queryClient = useQueryClient();
  const { data: resolved } = useResolvedVoice({
    sequenceId: context.sequenceId,
    campaignId: context.campaignId,
    projectId: context.projectId,
  });
  const inherited = resolved?.voice ?? null;
  // The voices offered are those that may speak in the project the edit's
  // takes are kept in (the server decides it), so none is refused as kept
  // for another project.
  const scopeProjectId = resolved ? resolved.projectId : context.projectId;
  const {
    data: voices = [],
    error: voicesError,
    isLoading: voicesLoading,
  } = useBrandVoices({ projectId: scopeProjectId });
  const { data: takes = [], isFetched: takesLoaded } = useVoiceovers(context.sequenceId);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [direction, setDirection] = useState("");
  const [start, setStart] = useState(0.3);
  const [replace, setReplace] = useState(true);
  const [withCaptions, setWithCaptions] = useState(true);
  const [busy, setBusy] = useState<"write" | "speak" | null>(null);
  const [creating, setCreating] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  // A take that may have been made (and charged) without coming back: its
  // attempt is kept, and a new take of the same script and voice waits until
  // the person chooses to make one.
  const [held, setHeld] = useState<{ key: string; message: string } | null>(null);
  const latest = useRef({ start, replace, withCaptions });
  useEffect(() => {
    latest.current = { start, replace, withCaptions };
  });
  const missingTables = isMissingTableError(voicesError);

  // A voiceover recorded elsewhere, being imported from the device.
  const { user } = useAuth();
  const importInput = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTitle, setImportTitle] = useState("");
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);

  function chooseImport(file: File | null) {
    if (importInput.current) importInput.current.value = "";
    if (!file) return;
    if (!isUploadableAudio(file)) {
      toast.error(`“${file.name}” isn't a WAV, MP3 or M4A file.`);
      return;
    }
    setImportFile(file);
    setImportTitle(
      file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .slice(0, 200),
    );
    // The confirmation covers the file chosen then, not this one.
    setImportConfirmed(false);
  }

  const { dragging, dropProps } = useFileDrop({
    disabled: missingTables || importing,
    onFiles: (files) => {
      const audio = files.find(isUploadableAudio) ?? files[0] ?? null;
      if (files.length > 1 && audio && isUploadableAudio(audio))
        toast.message(`One voiceover at a time: “${audio.name}” was taken.`);
      chooseImport(audio);
    },
  });

  // Start from the saved draft, else the latest take's script, else the edit's planned script.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !takesLoaded) return;
    const draft = readDraft(context.sequenceId);
    if (draft) {
      setScript(draft);
      setSeeded(true);
      return;
    }
    // An imported take's "script" is its name, not words to speak.
    const spoken = takes.find((take) => take.provider !== "upload");
    if (spoken) {
      setScript(spoken.script);
      setSeeded(true);
      return;
    }
    if (context.suggestedScript) {
      setScript(context.suggestedScript);
      setSeeded(true);
    }
  }, [seeded, takesLoaded, takes, context.sequenceId, context.suggestedScript]);

  const updateScript = (value: string) => {
    const next = value.slice(0, MAX_SCRIPT);
    setScript(next);
    setSeeded(true);
    writeDraft(context.sequenceId, next);
  };

  const words = wordCount(script);
  const estimate = estimatedSeconds(script);
  const room = Math.max(0, layout.total - start);
  const speaker = voiceId ? voices.find((voice) => voice.id === voiceId) : null;
  const speakerName = speaker?.name ?? inherited?.name ?? null;
  const onTimeline = useMemo(
    () =>
      new Set(
        timeline.audio.filter((item) => item.role === "voiceover").map((item) => item.assetId),
      ),
    [timeline.audio],
  );

  async function write() {
    setBusy("write");
    try {
      const result = await writeVoiceoverScript({
        data: {
          sequenceId: context.sequenceId,
          voiceId,
          seconds: Math.min(600, Math.max(2, room * 0.95)),
          ...(direction.trim() ? { direction: direction.trim() } : {}),
          ...(script.trim() ? { current: script.trim() } : {}),
        },
      });
      updateScript(result.script);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The script could not be written");
    } finally {
      setBusy(null);
    }
  }

  function place(take: {
    assetId: string;
    durationSeconds: number | null;
    words: TimedWord[];
    title: string;
  }): boolean {
    // A take can finish long after it was asked for, by when this panel may have
    // closed (another tab, a clip selected): it goes onto the edit as it is when
    // it lands, so changes made while it was being made are kept.
    const { start, replace, withCaptions } = latest.current;
    const item = audioFromSource(
      { assetId: take.assetId, durationSeconds: take.durationSeconds, title: take.title },
      "voiceover",
    );
    const placed = (timeline: Timeline) => {
      const total = layoutTimeline(timeline).total;
      const kept = replace
        ? timeline.audio.filter((entry) => entry.role !== "voiceover")
        : timeline.audio;
      if (kept.length >= LIMITS.audio) return null;
      const voice = {
        ...item,
        start: placeAt(Math.max(0, Math.min(start, total - 0.5, LIMITS.totalSeconds))),
      };
      const next: Timeline = { ...timeline, audio: [...kept, voice] };
      if (withCaptions && take.words.length) {
        const segments = captionsFromWords(take.words, voice.start, { until: total });
        next.captions = {
          ...timeline.captions,
          enabled: true,
          // Replacing the voiceover replaces its captions; a take added alongside
          // keeps the captions already on the edit outside its own words.
          segments: replace ? segments : mergeCaptions(timeline.captions.segments, segments),
        };
      }
      return { next, over: voice.start + (take.durationSeconds ?? 0) - total };
    };
    // What to say is worked out from the edit as it is now, and the change
    // itself from the edit as it is when the change is applied.
    const now = placed(getTimeline());
    if (!now) {
      toast.error(`An edit can hold up to ${LIMITS.audio} audio tracks`);
      return false;
    }
    onUpdate((timeline) => placed(timeline)?.next ?? timeline);
    if (now.over > 0.25) {
      toast.message("The voiceover runs past the picture", {
        description: `It ends ${now.over.toFixed(1)}s after the last shot. Shorten the script or lengthen a shot.`,
      });
    }
    return true;
  }

  const attemptKey = `${voiceId ?? `inherit:${inherited?.id ?? ""}`}|${script.trim()}`;
  const heldNow = held !== null && held.key === attemptKey;

  async function speak() {
    setBusy("speak");
    // One logical attempt keeps its request id until it has a known outcome, so
    // a retry after a lost response returns that take instead of paying again.
    // The id is kept for the edit across reloads too (and shared by its tabs).
    const key = attemptKey;
    const kept = attemptPlace(context.sequenceId);
    if (attempt.current?.key !== key)
      attempt.current = { key, id: savedAttempt(kept, key) ?? crypto.randomUUID() };
    keepAttempt(kept, key, attempt.current.id);
    const settled = () => {
      attempt.current = null;
      keepAttempt(kept, key, null);
    };
    try {
      const result = await generateVoiceover({
        data: {
          script: script.trim(),
          voiceId,
          sequenceId: context.sequenceId,
          clientRequestId: attempt.current.id,
        },
      });
      // The same take was already being made for another request: follow it.
      if (result.requestId && result.requestId !== attempt.current.id) {
        attempt.current = { key, id: result.requestId };
        keepAttempt(kept, key, result.requestId);
      }
      if (result.status === "submission_uncertain") {
        // It may have been made (and charged): the attempt is kept, so asking
        // again returns this take rather than making (and paying for) another.
        const message = result.errorMessage ?? "This take may still have been made (and charged).";
        setHeld({ key, message });
        toast.error(message);
        return;
      }
      if (result.status === "failed") {
        settled();
        toast.error(result.errorMessage ?? "The voiceover could not be made");
        return;
      }
      if (result.status !== "completed" || !result.assetId) {
        toast.message("This voiceover is still being made", {
          description: "It appears under Takes when it's ready.",
        });
        return;
      }
      settled();
      const added = place({
        assetId: result.assetId,
        durationSeconds: result.durationSeconds,
        words: result.words,
        title: result.title,
      });
      if (added)
        toast.success(
          `Voiceover added${result.durationSeconds ? ` · ${formatTime(result.durationSeconds)}` : ""}`,
        );
    } catch (error) {
      // The request may still have been recorded (or finished): the same id
      // is kept, so trying again returns that take rather than a new one.
      toast.error(error instanceof Error ? error.message : "The voiceover could not be made");
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ["voiceovers", context.sequenceId] });
    }
  }

  /** A new take, on the person's say-so, where the last one may have been made (and charged). */
  function startOver() {
    if (attempt.current?.key === attemptKey) attempt.current = null;
    keepAttempt(attemptPlace(context.sequenceId), attemptKey, null);
    setHeld(null);
    void speak();
  }

  async function importVoiceover() {
    const file = importFile;
    if (!file || !user || !importTitle.trim() || !importConfirmed) return;
    setImporting(true);
    // The upload is kept for the same audio (see uploadKey), so trying again
    // after a failure, even after a reload, doesn't upload another copy.
    const projectId = scopeProjectId ?? null;
    let upload: string | null = null;
    try {
      // Kept per edit: an upload imported into one edit is never offered to another.
      upload = `voiceover:${context.sequenceId}:${uploadKey(projectId, file, await fileDigest(file))}`;
      const staged = await uploadStaged({ userId: user.id, file, upload, projectId });
      const result = await importRecordedVoiceover({
        data: {
          uploadId: staged.uploadId,
          sequenceId: context.sequenceId,
          title: importTitle.trim(),
          transcript: null,
          durationSeconds: staged.durationSeconds,
          confirmed: true,
        },
      });
      keepStaged(user.id, upload, null);
      setImportFile(null);
      setImportConfirmed(false);
      if (!result.assetId) return;
      const added = place({
        assetId: result.assetId,
        durationSeconds: result.durationSeconds,
        words: [],
        title: result.title,
      });
      if (added)
        toast.success(
          `Voiceover imported${result.durationSeconds ? ` · ${formatTime(result.durationSeconds)}` : ""}`,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The voiceover couldn't be imported";
      if (upload && (uploadRefused(message) || /already imported elsewhere/.test(message)))
        keepStaged(user.id, upload, null);
      toast.error(message);
    } finally {
      setImporting(false);
      await queryClient.invalidateQueries({ queryKey: ["voiceovers", context.sequenceId] });
    }
  }

  function applyTake(take: VoiceoverRow) {
    if (!take.asset_id) return;
    place({
      assetId: take.asset_id,
      durationSeconds: take.duration_seconds === null ? null : Number(take.duration_seconds),
      words: take.alignment?.words ?? [],
      title: `Voiceover · ${take.script.slice(0, take.provider === "upload" ? 120 : 40)}`,
    });
  }

  if (missingTables) {
    return (
      <div className="m-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          Voiceovers need a database update: apply migration <code>0005_brand_voices</code>, then
          reload.
        </p>
      </div>
    );
  }

  const noVoices = !voicesLoading && voices.length === 0;

  return (
    <div className="relative min-h-full space-y-3 p-3" data-testid="voiceover-panel" {...dropProps}>
      <DropOverlay active={dragging} label="Drop a recorded voiceover to import it" />
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-xs">Voice</Label>
          <Link to="/voices" className="text-[11px] text-muted-foreground hover:text-foreground">
            Brand voices
          </Link>
        </div>
        {noVoices ? (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
            <p className="text-muted-foreground">
              Create the brand voice once and every voiceover for this campaign will sound the same.
            </p>
            <Button size="sm" className="w-full" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 size-3.5" /> Create a brand voice
            </Button>
          </div>
        ) : (
          <>
            <BrandVoiceSelect
              value={voiceId}
              projectId={scopeProjectId}
              onChange={setVoiceId}
              inheritLabel={
                inherited ? `${inherited.name} (${VIA_LABEL[inherited.via]})` : "No default voice"
              }
            />
            {!voiceId && !inherited && (
              <p className="text-[11px] text-muted-foreground">
                Pick a voice, or give this campaign a voice in Brand voices.
              </p>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="vo-script" className="text-xs">
            Script
          </Label>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              estimate > room + 0.5 ? "text-warning" : "text-muted-foreground",
            )}
            data-testid="script-fit"
          >
            {words} words · ~{estimate.toFixed(1)}s of {room.toFixed(1)}s
          </span>
        </div>
        <Textarea
          id="vo-script"
          value={script}
          onChange={(event) => updateScript(event.target.value)}
          placeholder="Write what the voice says, or let AI write it to fit the cut…"
          className="min-h-[120px] text-sm"
        />
        <div className="flex gap-1.5">
          <Input
            value={direction}
            onChange={(event) => setDirection(event.target.value.slice(0, 300))}
            placeholder="Direction (optional): punchier, mention the offer…"
            className="h-8 flex-1 text-xs"
            aria-label="Direction for the script"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={busy !== null || room < 2}
            onClick={() => void write()}
            data-testid="write-script"
          >
            {busy === "write" ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 size-3.5" />
            )}
            {script.trim() ? "Rewrite" : "Write"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="vo-start" className="text-xs">
            Starts at (s)
          </Label>
          <div className="flex gap-1">
            <Input
              id="vo-start"
              type="number"
              min={0}
              step={0.1}
              value={start}
              onChange={(event) =>
                setStart(
                  Math.max(0, Math.min(LIMITS.totalSeconds, Number(event.target.value) || 0)),
                )
              }
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[11px]"
              onClick={() => setStart(Number(playhead().toFixed(2)))}
              title="Start at the playhead"
            >
              Here
            </Button>
          </div>
        </div>
        <div className="space-y-1.5 pt-0.5 text-xs">
          <label className="flex items-center justify-between gap-2">
            Replace current
            <Switch
              checked={replace}
              onCheckedChange={setReplace}
              aria-label="Replace the current voiceover"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            Word captions
            <Switch
              checked={withCaptions}
              onCheckedChange={setWithCaptions}
              aria-label="Make captions from the voiceover"
            />
          </label>
        </div>
      </div>

      <Button
        className="w-full"
        disabled={
          busy !== null ||
          !script.trim() ||
          (!voiceId && !inherited) ||
          layout.total <= 0 ||
          heldNow
        }
        onClick={() => void speak()}
        data-testid="generate-voiceover"
      >
        {busy === "speak" ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Mic className="mr-1.5 size-4" />
        )}
        {busy === "speak"
          ? "Recording…"
          : speakerName
            ? `Voice it as ${speakerName}`
            : "Generate voiceover"}
      </Button>
      {heldNow && held && (
        <div
          role="status"
          data-testid="voiceover-held"
          className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs"
        >
          <p>{held.message}</p>
          <p className="text-muted-foreground">
            Making it again starts a new take, which is charged again even if this one was.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy !== null}
            onClick={startOver}
            data-testid="voiceover-start-over"
          >
            Make a new take
          </Button>
        </div>
      )}
      {layout.total <= 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add shots first so the voice has a cut to fit.
        </p>
      )}

      <div className="space-y-2 rounded-md border border-dashed border-border p-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Import a recorded voiceover</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={importing}
            onClick={() => importInput.current?.click()}
            data-testid="import-voiceover-choose"
          >
            <Upload className="mr-1 size-3.5" /> Choose file
          </Button>
          <input
            ref={importInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE.audio}
            className="hidden"
            data-testid="import-voiceover-input"
            onChange={(event) => chooseImport(event.target.files?.[0] ?? null)}
          />
        </div>
        {importFile ? (
          <div className="space-y-2" data-testid="import-voiceover-form">
            <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <FileAudio className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{importFile.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0"
                disabled={importing}
                onClick={() => setImportFile(null)}
                aria-label="Don't import this file"
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <Input
              value={importTitle}
              onChange={(event) => setImportTitle(event.target.value.slice(0, 200))}
              placeholder="Name it (shown on the timeline)"
              className="h-8 text-xs"
              aria-label="Voiceover name"
            />
            <label className="flex items-start gap-2">
              <Checkbox
                checked={importConfirmed}
                onCheckedChange={(checked) => setImportConfirmed(checked === true)}
                className="mt-0.5"
                aria-label="Confirm the brand may use this recording"
              />
              <span>
                <ShieldCheck className="mr-1 inline size-3.5 text-success" />I confirm it was
                recorded by or for the brand, and the speaker agreed to their voice being used in
                its content. The confirmation is recorded with the file.
              </span>
            </label>
            <Button
              size="sm"
              className="w-full"
              disabled={importing || !importTitle.trim() || !importConfirmed}
              onClick={() => void importVoiceover()}
              data-testid="import-voiceover"
            >
              {importing && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {importing ? "Importing…" : "Import and add to the edit"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              It starts at {start.toFixed(1)}s{replace ? " and replaces the current voiceover" : ""}{" "}
              (set above).
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            WAV, MP3 or M4A recorded elsewhere
            <span className="hidden md:inline">, or drag the file onto this panel</span>.
          </p>
        )}
      </div>

      {takes.length > 0 && (
        <div className="space-y-1.5">
          <p className="label-eyebrow">Takes</p>
          <ul className="space-y-1">
            {takes.map((take) => (
              <li
                key={take.id}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  take.asset_id && onTimeline.has(take.asset_id)
                    ? "border-primary"
                    : "border-border",
                )}
                data-testid="voiceover-take"
              >
                <div className="flex items-center gap-1.5">
                  {take.status === "completed" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 shrink-0 p-0"
                      onClick={() => take.asset_id && void playAsset(take.asset_id)}
                      aria-label="Play take"
                    >
                      <Play className="size-3" />
                    </Button>
                  ) : takeInProgress(take) ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{take.script}</span>
                  {take.provider === "upload" && (
                    <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
                      Imported
                    </span>
                  )}
                  {take.duration_seconds !== null && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatTime(Number(take.duration_seconds))}
                    </span>
                  )}
                  {take.status === "completed" &&
                    (take.asset_id && onTimeline.has(take.asset_id) ? (
                      <Check
                        className="size-3.5 shrink-0 text-success"
                        aria-label="On the timeline"
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => applyTake(take)}
                      >
                        Use
                      </Button>
                    ))}
                </div>
                {take.status === "failed" && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {take.error_message ?? "This take failed."}
                  </p>
                )}
                {(take.status === "submission_uncertain" ||
                  ((take.status === "generating" || take.status === "pending") &&
                    !takeInProgress(take))) && (
                  <p className="mt-1 text-[11px] text-warning">
                    {take.error_message ??
                      "This take was interrupted before it was saved. It won't be retried automatically."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Takes made here are AI-generated voice. Disclose it where your channels require.
      </p>

      <VoiceEditor open={creating} onOpenChange={setCreating} voice={null} />
    </div>
  );
}
