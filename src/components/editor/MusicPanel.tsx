import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AudioWaveform, Loader2, Music, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AddLicensedTrack } from "@/components/music/AddLicensedTrack";
import { FindMusic } from "@/components/music/FindMusic";
import { GenerateMusic } from "@/components/music/GenerateMusic";
import { MusicLibrary } from "@/components/music/MusicLibrary";
import { LicenceTerms, LicenseBadge } from "@/components/music/TrackItem";
import { audioUrlFor, useMusicTracks, useTracksForAssets } from "@/hooks/useMusicData";
import { saveMusicAnalysis } from "@/lib/music.functions";
import { analyzeAudioUrl } from "@/lib/music/analyze";
import { beatTimesOnTimeline, snapCutsToBeats } from "@/lib/music/beats";
import { creditLine } from "@/lib/music/catalog";
import { isMissingTableError } from "@/lib/edit/errors";
import {
  audioFromSource,
  layoutTimeline,
  LIMITS,
  type Timeline,
  type TimelineLayout,
} from "@/lib/edit/timeline";
import { cn } from "@/lib/utils";
import type { Selection } from "./state";

export interface MusicContext {
  projectId: string | null;
  campaignId: string | null;
  /** Music direction the edit was planned with (for example by Supercomputer). */
  direction: string | null;
}

interface Source {
  assetId: string | null;
  title: string;
  durationSeconds: number | null;
  kind?: "music" | "sound_effect";
}

/**
 * Music for an edit: pick from the library, find free music, or make a
 * track to the edit's length, then cut the picture to the beat.
 */
export function MusicPanel({
  context,
  timeline,
  layout,
  playhead,
  onChange,
  onUpdate,
  getTimeline,
  onSelect,
}: {
  context: MusicContext;
  timeline: Timeline;
  layout: TimelineLayout;
  playhead: () => number;
  onChange: (timeline: Timeline, key?: string) => void;
  /** Applies a change to the timeline as it is when the change lands. */
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
  /** The edit's timeline as it is now, even once this panel has closed. */
  getTimeline: () => Timeline;
  onSelect: (selection: Selection) => void;
}) {
  const queryClient = useQueryClient();
  const { error } = useMusicTracks();
  const sound = timeline.audio.filter((item) => item.role === "music" || item.role === "sfx");
  const { data: tracks = [] } = useTracksForAssets(sound.map((item) => item.assetId));
  const [mode, setMode] = useState<"library" | "find" | "make">("library");
  // Audio on the edit with no licence on record (added from the media bin,
  // say) has its licence recorded here before the edit can be rendered.
  const [recording, setRecording] = useState<(typeof sound)[number] | null>(null);
  const [replace, setReplace] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // A music bed is added once; a sound effect can be placed again, at another moment.
  const added = useMemo(
    () =>
      new Set(timeline.audio.filter((item) => item.role === "music").map((item) => item.assetId)),
    [timeline.audio],
  );
  const bed = timeline.audio.find((item) => item.role === "music");
  const trackFor = (assetId: string) => tracks.find((track) => track.asset_id === assetId);
  // Music can arrive after the edit has moved on (a track being made, a beat
  // being found), by when this panel may have closed (another tab, a clip
  // selected): it is applied to the edit as it is then, not as it was.
  const latest = useRef({ replace });
  useEffect(() => {
    latest.current = { replace };
  });

  if (isMissingTableError(error)) {
    return (
      <div className="m-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          The music library needs a database update: apply migration <code>0006_music_library</code>
          , then reload.
        </p>
      </div>
    );
  }

  function add(source: Source) {
    if (!source.assetId) return;
    const { replace } = latest.current;
    const role = source.kind === "sound_effect" ? "sfx" : "music";
    const kept = (timeline: Timeline) =>
      role === "music" && replace
        ? timeline.audio.filter((item) => item.role !== "music")
        : timeline.audio;
    if (kept(getTimeline()).length >= LIMITS.audio) {
      toast.error(`An edit can hold up to ${LIMITS.audio} audio tracks`);
      return;
    }
    const start =
      role === "music" ? 0 : Math.min(LIMITS.totalSeconds, Number(playhead().toFixed(2)));
    const item = audioFromSource(
      { assetId: source.assetId, durationSeconds: source.durationSeconds, title: source.title },
      role,
      start,
    );
    onUpdate((timeline) => {
      const rest = kept(timeline);
      return rest.length >= LIMITS.audio ? timeline : { ...timeline, audio: [...rest, item] };
    });
    toast.success(
      role === "music" ? "Music added under the whole edit" : "Sound effect added at the playhead",
    );
  }

  async function cutToBeat() {
    if (!bed) return;
    setSyncing(true);
    try {
      const track = trackFor(bed.assetId);
      let beats = track?.beats ?? null;
      let bpm = track?.bpm ? Number(track.bpm) : null;
      let length = track?.duration_seconds ? Number(track.duration_seconds) : null;
      if (!beats?.length) {
        const url = await audioUrlFor(bed.assetId);
        if (!url) throw new Error("The music file couldn't be opened");
        const analysis = await analyzeAudioUrl(url, length);
        if (!analysis || analysis.confidence < 0.15 || analysis.beats.length < 4) {
          toast.error("This music has no steady beat to cut to.");
          return;
        }
        beats = analysis.beats;
        bpm = analysis.bpm;
        length ??= analysis.duration;
        if (track) {
          // Worked out once per track; the next edit reuses it.
          void saveMusicAnalysis({
            data: {
              trackId: track.id,
              bpm: analysis.bpm,
              beats: analysis.beats,
              durationSeconds: analysis.duration,
            },
          })
            .then(() => queryClient.invalidateQueries({ queryKey: ["music_tracks"] }))
            .catch(() => undefined);
        }
      }
      const beatsFound = beats;
      const knownLength = length;
      const snap = (latestTimeline: Timeline) => {
        const found = latestTimeline.audio.find((item) => item.id === bed.id);
        if (!found || found.assetId !== bed.assetId) return null;
        // Without its length the bed can't loop on the beat: fill it in when known.
        const current =
          !found.sourceDuration && knownLength ? { ...found, sourceDuration: knownLength } : found;
        const timeline =
          current === found
            ? latestTimeline
            : {
                ...latestTimeline,
                audio: latestTimeline.audio.map((item) =>
                  item.id === current.id ? current : item,
                ),
              };
        const times = beatTimesOnTimeline(current, beatsFound, layoutTimeline(timeline).total + 30);
        const { timeline: snapped, moved } = snapCutsToBeats(timeline, times);
        return { base: timeline, snapped, moved };
      };
      // What to say is worked out from the edit as it is now, and the change
      // itself from the edit as it is when the change is applied.
      const now = snap(getTimeline());
      if (!now) {
        toast.message("The music changed while its beat was being found. Try again.");
        return;
      }
      onUpdate((latestTimeline) => {
        const result = snap(latestTimeline);
        return !result ? latestTimeline : result.moved ? result.snapped : result.base;
      });
      const { moved } = now;
      if (!moved) {
        toast.message(
          `The cuts already land on the beat${bpm ? ` (${Math.round(bpm)} BPM)` : ""}.`,
        );
        return;
      }
      toast.success(
        `Moved ${moved} cut${moved === 1 ? "" : "s"} to the beat${bpm ? ` · ${Math.round(bpm)} BPM` : ""}`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The beat couldn't be found");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-3 p-3" data-testid="music-panel">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="label-eyebrow">In this edit</p>
          <Link to="/music" className="text-[11px] text-muted-foreground hover:text-foreground">
            Music library
          </Link>
        </div>
        {sound.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">
            No music yet. Add a track below; it plays under the whole edit and dips under the voice.
          </p>
        )}
        <ul className="space-y-1">
          {sound.map((item) => {
            const track = trackFor(item.assetId);
            const credit = track ? creditLine(track) : null;
            return (
              <li
                key={item.id}
                className="rounded-md border border-border p-2 text-xs"
                data-testid="edit-music-item"
              >
                <div className="flex items-center gap-1.5">
                  <Music className="size-3.5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={() => onSelect({ kind: "audio", id: item.id })}
                  >
                    {track?.title ?? item.label ?? "Audio"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.role === "sfx" ? "sound effect" : "music"}
                    </span>
                  </button>
                  {track ? (
                    <LicenseBadge track={track} />
                  ) : (
                    <>
                      <span
                        className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]"
                        title="This audio isn't in the music library, so its licence isn't recorded. The edit can't be rendered until it is."
                      >
                        Licence unknown
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] text-primary hover:underline"
                        onClick={() => setRecording(item)}
                        data-testid="record-licence"
                      >
                        Record licence
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove from the edit"
                    onClick={() =>
                      onChange({
                        ...timeline,
                        audio: timeline.audio.filter((entry) => entry.id !== item.id),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {credit && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Credit: {credit}</p>
                )}
                {track && <LicenceTerms track={track} />}
              </li>
            );
          })}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!bed || syncing || timeline.clips.length < 2}
          onClick={() => void cutToBeat()}
          data-testid="cut-to-beat"
        >
          {syncing ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <AudioWaveform className="mr-1.5 size-3.5" />
          )}
          Cut to the beat
        </Button>
      </div>

      <div className="space-y-2">
        <div
          className="grid grid-cols-3 gap-1 rounded-md border border-border p-0.5 text-[11px]"
          role="tablist"
        >
          {(
            [
              ["library", "Library"],
              ["find", "Find free"],
              ["make", "Make"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "rounded px-1.5 py-1",
                mode === id ? "bg-surface-raised text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 text-xs">
          Replace the current music
          <Switch
            checked={replace}
            onCheckedChange={setReplace}
            aria-label="Replace the current music"
          />
        </label>
        {mode === "library" && (
          <MusicLibrary
            addedAssetIds={added}
            onAdd={(track) =>
              add({
                assetId: track.asset_id,
                title: track.title,
                durationSeconds:
                  track.duration_seconds === null ? null : Number(track.duration_seconds),
                kind: track.kind,
              })
            }
          />
        )}
        {mode === "find" && (
          <FindMusic
            compact
            initialQuery={context.direction?.split(/[,.]/)[0]?.slice(0, 60) ?? ""}
            projectId={context.projectId}
            campaignId={context.campaignId}
            onAdded={(track, kind) =>
              add({
                assetId: track.assetId,
                title: track.title,
                durationSeconds: track.durationSeconds,
                kind,
              })
            }
          />
        )}
        {mode === "make" && (
          <GenerateMusic
            compact
            seconds={Math.max(10, Math.ceil(layout.total + 1))}
            direction={context.direction ?? ""}
            projectId={context.projectId}
            campaignId={context.campaignId}
            onGenerated={(track) =>
              add({
                assetId: track.assetId,
                title: track.title,
                durationSeconds: track.durationSeconds,
              })
            }
          />
        )}
      </div>
      <Dialog open={recording !== null} onOpenChange={(open) => !open && setRecording(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record its licence</DialogTitle>
            <DialogDescription>
              This audio isn't in the music library yet. Say who owns or licensed it and where it
              may be used; the edit can be rendered once that's on record.
            </DialogDescription>
          </DialogHeader>
          {recording && (
            <AddLicensedTrack
              key={recording.id}
              asset={{ id: recording.assetId, title: recording.label ?? null }}
              defaultKind={recording.role === "sfx" ? "sound_effect" : "music"}
              projectId={context.projectId}
              onAdded={() => setRecording(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
