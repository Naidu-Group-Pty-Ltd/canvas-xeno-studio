import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Mic, Play, Plus, Sparkles } from "lucide-react";
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
import { generateVoiceover, writeVoiceoverScript } from "@/lib/voice.functions";
import { estimatedSeconds, wordCount, type TimedWord } from "@/lib/voice/catalog";
import {
  audioFromSource,
  captionsFromWords,
  formatTime,
  LIMITS,
  type Timeline,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { isMissingTableError } from "@/lib/edit/errors";
import { BrandVoiceSelect } from "@/components/voices/VoiceAssignment";
import { VoiceEditor } from "@/components/voices/VoiceEditor";
import { Button } from "@/components/ui/button";
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
 * with captions timed to every word.
 */
export function VoiceoverPanel({
  context,
  timeline,
  layout,
  playhead,
  onChange,
}: {
  context: VoiceoverContext;
  timeline: Timeline;
  layout: TimelineLayout;
  playhead: () => number;
  onChange: (timeline: Timeline, key?: string) => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: voices = [],
    error: voicesError,
    isLoading: voicesLoading,
  } = useBrandVoices({ projectId: context.projectId });
  const { data: inherited } = useResolvedVoice({
    campaignId: context.campaignId,
    projectId: context.projectId,
  });
  const { data: takes = [], isFetched: takesLoaded } = useVoiceovers(context.sequenceId);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [direction, setDirection] = useState("");
  const [start, setStart] = useState(0.3);
  const [replace, setReplace] = useState(true);
  const [withCaptions, setWithCaptions] = useState(true);
  const [busy, setBusy] = useState<"write" | "speak" | null>(null);
  const [creating, setCreating] = useState(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const missingTables = isMissingTableError(voicesError);

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
    if (takes.length) {
      setScript(takes[0]!.script);
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
  }) {
    const at = Math.max(0, Math.min(start, layout.total - 0.5, LIMITS.totalSeconds));
    const kept = replace
      ? timeline.audio.filter((item) => item.role !== "voiceover")
      : timeline.audio;
    if (kept.length >= LIMITS.audio) {
      toast.error(`An edit can hold up to ${LIMITS.audio} audio tracks`);
      return;
    }
    const item = audioFromSource(
      { assetId: take.assetId, durationSeconds: take.durationSeconds, title: take.title },
      "voiceover",
      Number(at.toFixed(2)),
    );
    const next: Timeline = { ...timeline, audio: [...kept, item] };
    if (withCaptions && take.words.length) {
      next.captions = {
        ...timeline.captions,
        enabled: true,
        segments: captionsFromWords(take.words, item.start, { until: layout.total }),
      };
    }
    onChange(next);
    const over = item.start + (take.durationSeconds ?? 0) - layout.total;
    if (over > 0.25) {
      toast.message("The voiceover runs past the picture", {
        description: `It ends ${over.toFixed(1)}s after the last shot. Shorten the script or lengthen a shot.`,
      });
    }
  }

  async function speak() {
    setBusy("speak");
    // One logical attempt keeps its request id until it has a known outcome, so
    // a retry after a lost response returns that take instead of paying again.
    const key = `${voiceId ?? `inherit:${inherited?.id ?? ""}`}|${script.trim()}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    try {
      const result = await generateVoiceover({
        data: {
          script: script.trim(),
          voiceId,
          sequenceId: context.sequenceId,
          clientRequestId: attempt.current.id,
        },
      });
      if (result.status === "failed" || result.status === "submission_uncertain") {
        attempt.current = null;
        toast.error(result.errorMessage ?? "The voiceover could not be made");
        return;
      }
      if (result.status !== "completed" || !result.assetId) {
        toast.message("This voiceover is still being made", {
          description: "It appears under Takes when it's ready.",
        });
        return;
      }
      attempt.current = null;
      place({
        assetId: result.assetId,
        durationSeconds: result.durationSeconds,
        words: result.words,
        title: result.title,
      });
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

  function applyTake(take: VoiceoverRow) {
    if (!take.asset_id) return;
    place({
      assetId: take.asset_id,
      durationSeconds: take.duration_seconds === null ? null : Number(take.duration_seconds),
      words: take.alignment?.words ?? [],
      title: `Voiceover · ${take.script.slice(0, 40)}`,
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
    <div className="space-y-3 p-3" data-testid="voiceover-panel">
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
              projectId={context.projectId}
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
        disabled={busy !== null || !script.trim() || (!voiceId && !inherited) || layout.total <= 0}
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
      {layout.total <= 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add shots first so the voice has a cut to fit.
        </p>
      )}

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
        AI-generated voice. Disclose it where your channels require.
      </p>

      <VoiceEditor open={creating} onOpenChange={setCreating} voice={null} />
    </div>
  );
}
