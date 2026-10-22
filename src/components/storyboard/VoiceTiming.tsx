import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, ChevronDown, Loader2, Music2, Timer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { readAnalysis, readWords } from "@/lib/lip-sync/analysis";
import { voiceLength } from "@/lib/lip-sync/view";
import { formatTime, FPS_OPTIONS } from "@/lib/edit/timeline";
import {
  CUT_PLACE_LABELS,
  describeGridMark,
  musicGrid,
  nearestOnGrid,
  timeShotsFromVoice,
  type MusicGrid,
  type TimedShot,
} from "@/lib/storyboard/timing";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Fields = Record<string, unknown>;
const asRecord = (value: unknown): Fields =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};

interface BoardShot {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  name: string | null;
  seconds: number | null;
  spec: Fields;
}

/** A storyboard's shots in order, with their specs (where their cues are kept). */
function useBoardShots(storyboardId: string) {
  return useQuery({
    queryKey: ["storyboard-shots", storyboardId],
    queryFn: async (): Promise<BoardShot[]> => {
      const { data: scenes, error } = await supabase
        .from("scenes")
        .select("id,scene_number")
        .eq("storyboard_id", storyboardId);
      if (error) throw error;
      if (!scenes?.length) return [];
      const { data: shots, error: shotsError } = await supabase
        .from("shots")
        .select("id,scene_id,shot_number,name,duration_seconds,spec")
        .in(
          "scene_id",
          scenes.map((scene) => scene.id),
        );
      if (shotsError) throw shotsError;
      const sceneNumber = new Map(scenes.map((scene) => [scene.id, scene.scene_number]));
      return (shots ?? [])
        .map((shot) => ({
          id: shot.id,
          sceneNumber: sceneNumber.get(shot.scene_id) ?? 0,
          shotNumber: shot.shot_number,
          name: shot.name,
          seconds: shot.duration_seconds === null ? null : Number(shot.duration_seconds),
          spec: asRecord(shot.spec),
        }))
        .sort((a, b) => a.sceneNumber - b.sceneNumber || a.shotNumber - b.shotNumber);
    },
  });
}

/** Voiceovers prepared with their words, newest first: what a storyboard can be timed from. */
function usePreparedVoiceovers(enabled: boolean) {
  return useQuery({
    queryKey: ["prepared-voiceovers"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audio_preparations")
        .select("id,source_asset_id,duration_seconds,created_at")
        .eq("status", "ready")
        .eq("transcript_status", "ready")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = (data ?? []).map((row) => row.source_asset_id);
      const { data: assets } = ids.length
        ? await supabase.from("assets").select("id,title").in("id", ids)
        : { data: [] };
      const titles = new Map((assets ?? []).map((asset) => [asset.id, asset.title]));
      return (data ?? []).map((row) => ({
        id: row.id,
        assetId: row.source_asset_id,
        title: titles.get(row.source_asset_id) ?? "Untitled voiceover",
        seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      }));
    },
  });
}

/** One preparation's words and speech, loaded when it is chosen. */
function usePreparation(id: string | null) {
  return useQuery({
    queryKey: ["prepared-voiceover", id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audio_preparations")
        .select("id,source_asset_id,words,analysis,duration_seconds")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const analysis = readAnalysis(data.analysis);
      return {
        id: data.id,
        assetId: data.source_asset_id,
        words: readWords(data.words),
        speech: analysis?.speech ?? [],
        seconds: analysis
          ? analysis.samples / analysis.sample_rate
          : Number(data.duration_seconds ?? 0),
      };
    },
  });
}

/** Music in the library with its beats found, and one track's grid when chosen. */
function useBeatTracks(enabled: boolean) {
  return useQuery({
    queryKey: ["music_tracks", "with-beats"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("music_tracks")
        .select("id,title,bpm")
        .eq("status", "ready")
        .eq("kind", "music")
        .eq("is_archived", false)
        .not("bpm", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useTrackGrid(trackId: string | null, offset: number) {
  const { data } = useQuery({
    queryKey: ["music_track", trackId],
    enabled: !!trackId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Every column: a track's structure (bars and downbeats) is read when its analysis has one.
      const { data: row, error } = await supabase
        .from("music_tracks")
        .select("*")
        .eq("id", trackId!)
        .maybeSingle();
      if (error) throw error;
      return row as Fields | null;
    },
  });
  return useMemo(
    () =>
      data
        ? musicGrid(
            {
              bpm: typeof data["bpm"] === "number" ? data["bpm"] : Number(data["bpm"]) || null,
              beats: data["beats"],
              structure: data["structure"] ?? null,
            },
            offset,
          )
        : null,
    [data, offset],
  );
}

/**
 * A storyboard timed from its voiceover: each shot names its cue (the words
 * it starts on), and its start and length follow from where those words are
 * spoken, by the rule Reel 1 was cut with. A chosen track's beats and bars
 * show beside the cuts. Nothing changes until the times are applied.
 */
export function VoiceTiming({
  storyboardId,
  creativeDirection,
}: {
  storyboardId: string;
  creativeDirection: unknown;
}) {
  const queryClient = useQueryClient();
  const direction = asRecord(creativeDirection);
  const [open, setOpen] = useState(false);
  const shots = useBoardShots(storyboardId);
  const voiceovers = usePreparedVoiceovers(open);
  const tracks = useBeatTracks(open);

  const [preparationId, setPreparationId] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(
    Number(asRecord(direction["delivery"])["fps"]) || Number(direction["fps"]) || 30,
  );
  const [trackId, setTrackId] = useState<string | null>(
    typeof direction["music_track_id"] === "string" ? direction["music_track_id"] : null,
  );
  const [offset, setOffset] = useState<number>(Number(direction["music_offset_seconds"]) || 0);
  const [cues, setCues] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  // The voiceover the storyboard names, once the list of prepared ones is in.
  const named =
    typeof direction["voiceover_asset_id"] === "string" ? direction["voiceover_asset_id"] : null;
  useEffect(() => {
    if (preparationId || !voiceovers.data?.length) return;
    const match = voiceovers.data.find((entry) => entry.assetId === named);
    if (match) setPreparationId(match.id);
  }, [voiceovers.data, named, preparationId]);

  const preparation = usePreparation(preparationId);
  const grid = useTrackGrid(trackId, offset);

  const cueOf = (shot: BoardShot) =>
    cues.get(shot.id) ?? (typeof shot.spec["cue"] === "string" ? shot.spec["cue"] : "");

  const timing = useMemo(() => {
    const voice = preparation.data;
    if (!voice || !shots.data?.length) return null;
    return timeShotsFromVoice({
      shots: shots.data.map((shot) => ({
        id: shot.id,
        cue: cueOf(shot) || null,
        seconds: shot.seconds,
      })),
      words: voice.words,
      speech: voice.speech,
      fps,
      durationSeconds: voice.seconds,
    });
    // cueOf reads `cues`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparation.data, shots.data, cues, fps]);

  async function apply() {
    if (!timing || !shots.data || !preparation.data) return;
    setSaving(true);
    try {
      const byId = new Map(timing.shots.map((shot) => [shot.id, shot]));
      for (const shot of shots.data) {
        const timed = byId.get(shot.id)!;
        const { error } = await supabase
          .from("shots")
          .update({
            duration_seconds: timed.seconds,
            spec: {
              ...shot.spec,
              cue: timed.cue,
              timing: {
                start: timed.start,
                end: timed.end,
                seconds: timed.seconds,
                fps,
                from: timed.timing,
                word_index: timed.wordIndex,
                voiceover_preparation_id: preparation.data.id,
              },
            } as Json,
          })
          .eq("id", shot.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("storyboards")
        .update({
          creative_direction: {
            ...direction,
            voiceover_asset_id: preparation.data.assetId,
            fps,
            music_track_id: trackId,
            music_offset_seconds: offset,
          } as Json,
        })
        .eq("id", storyboardId);
      if (error) throw error;
      setCues(new Map());
      await queryClient.invalidateQueries({ queryKey: ["storyboard-shots", storyboardId] });
      await queryClient.invalidateQueries({ queryKey: ["storyboards"] });
      toast.success(`${timing.timed} of ${timing.shots.length} shots timed from the voice.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `The times couldn't be saved: ${error.message}`
          : "The times couldn't be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const voice = preparation.data;
  const problems = timing?.shots.filter((shot) => shot.problem).length ?? 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mb-4 rounded-lg border border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <Timer className="size-4 text-primary" />
        <span className="font-medium">Time from the voice</span>
        <span className="text-xs text-muted-foreground">
          Cut each shot in the pause before its cue, from a prepared voiceover&apos;s measured
          words.
        </span>
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-border p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Voiceover</Label>
            <Select value={preparationId ?? ""} onValueChange={(value) => setPreparationId(value)}>
              <SelectTrigger data-testid="timing-voiceover">
                <SelectValue placeholder="A voiceover prepared with its words" />
              </SelectTrigger>
              <SelectContent>
                {(voiceovers.data ?? []).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.title}
                    {entry.seconds ? ` · ${voiceLength(entry.seconds)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voiceovers.isSuccess && !voiceovers.data.length && (
              <p className="text-xs text-muted-foreground">
                No voiceover has its words yet. Attach one in Create and prepare it for lip sync;
                its words are found when it is ready.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Frame rate</Label>
            <Select value={String(fps)} onValueChange={(value) => setFps(Number(value))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Music beside the cuts</Label>
            <Select
              value={trackId ?? "none"}
              onValueChange={(value) => setTrackId(value === "none" ? null : value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No music</SelectItem>
                {(tracks.data ?? []).map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.title}
                    {track.bpm ? ` · ${Math.round(Number(track.bpm))} BPM` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="timing-music-offset" className="text-xs text-muted-foreground">
              Music starts at (s)
            </Label>
            <Input
              id="timing-music-offset"
              type="number"
              step="0.001"
              value={offset}
              disabled={!trackId}
              onChange={(event) => setOffset(Number(event.target.value) || 0)}
            />
          </div>
        </div>

        {preparationId && preparation.isLoading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading the voiceover&apos;s words…
          </p>
        )}

        {voice && timing && (
          <>
            <TimingStrip
              seconds={Math.max(voice.seconds, timing.end)}
              speech={voice.speech}
              shots={timing.shots}
              grid={grid}
            />
            <p className="text-xs text-muted-foreground">
              {timing.timed} of {timing.shots.length} shots cut from their cues
              {problems ? ` · ${problems} to look at` : ""}
              {grid
                ? grid.bars.length
                  ? ` · ${grid.bars.length} bars and ${grid.beats.length} beats from the track`
                  : ` · ${grid.beats.length} beats from the track (its bars aren't analysed yet)`
                : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-2 font-normal">Shot</th>
                    <th className="py-1.5 pr-2 font-normal">Cue (the words it starts on)</th>
                    <th className="py-1.5 pr-2 font-normal">Starts</th>
                    <th className="py-1.5 pr-2 font-normal">Length</th>
                    <th className="py-1.5 pr-2 font-normal">Cut</th>
                    {grid && <th className="py-1.5 pr-2 font-normal">On the music</th>}
                  </tr>
                </thead>
                <tbody>
                  {(shots.data ?? []).map((shot, index) => {
                    const timed = timing.shots[index]!;
                    const mark = grid ? nearestOnGrid(timed.start, grid) : null;
                    return (
                      <tr key={shot.id} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium">
                            {shot.sceneNumber}.{shot.shotNumber}
                          </span>{" "}
                          <span className="text-muted-foreground">{shot.name}</span>
                        </td>
                        <td className="w-[34%] py-1 pr-2">
                          <Input
                            aria-label={`Cue for ${shot.name ?? "this shot"}`}
                            className="h-7 text-xs"
                            value={cueOf(shot)}
                            placeholder={
                              index === 0 ? "Starts the edit" : "Follows the shot before"
                            }
                            onChange={(event) =>
                              setCues((current) =>
                                new Map(current).set(shot.id, event.target.value),
                              )
                            }
                          />
                          {timed.problem && <p className="mt-1 text-warning">{timed.problem}</p>}
                        </td>
                        <td className="py-1.5 pr-2 font-mono">{formatTime(timed.start)}</td>
                        <td className="py-1.5 pr-2 font-mono">
                          {timed.seconds.toFixed(2)} s
                          {shot.seconds !== null &&
                            Math.abs(shot.seconds - timed.seconds) >= 0.005 && (
                              <span className="block text-muted-foreground">
                                was {shot.seconds.toFixed(2)} s
                              </span>
                            )}
                        </td>
                        <td className="py-1.5 pr-2">
                          <CutNote shot={timed} />
                        </td>
                        {grid && (
                          <td className="py-1.5 pr-2 text-muted-foreground">
                            {mark ? describeGridMark(mark, fps) : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void apply()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Apply these times
              </Button>
            </div>
          </>
        )}
        {shots.isSuccess && !shots.data.length && (
          <p className="text-xs text-muted-foreground">This storyboard has no shots to time yet.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CutNote({ shot }: { shot: TimedShot }) {
  if (shot.timing === "first")
    return <span className="text-muted-foreground">Starts the edit</span>;
  if (shot.timing === "kept")
    return <span className="text-muted-foreground">After the shot before, at its length</span>;
  return (
    <span>
      {shot.place ? CUT_PLACE_LABELS[shot.place] : "On its cue"}
      {shot.word && (
        <span className="block text-muted-foreground">
          before “{shot.word}” at {formatTime(shot.onset ?? shot.start)}
        </span>
      )}
    </span>
  );
}

/** The voiceover's speech under the cuts, with the music's bars and beats above them. */
function TimingStrip({
  seconds,
  speech,
  shots,
  grid,
}: {
  seconds: number;
  speech: [number, number][];
  shots: TimedShot[];
  grid: MusicGrid | null;
}) {
  const at = (time: number) => `${Math.min(100, Math.max(0, (time / seconds) * 100))}%`;
  const bars = new Set(grid?.bars.map((bar) => Math.round(bar * 1000)) ?? []);
  return (
    <div className="relative h-16 overflow-hidden rounded-md border border-border bg-surface-raised/40">
      {grid && (
        <div className="absolute inset-x-0 top-0 h-4" aria-label="The music's beats and bars">
          {grid.beats
            .filter((beat) => beat <= seconds && !bars.has(Math.round(beat * 1000)))
            .map((beat) => (
              <span
                key={`beat-${beat}`}
                className="absolute top-2 h-2 w-px bg-info/40"
                style={{ left: at(beat) }}
              />
            ))}
          {grid.bars
            .filter((bar) => bar <= seconds)
            .map((bar) => (
              <span
                key={`bar-${bar}`}
                className="absolute top-0 h-4 w-px bg-info"
                style={{ left: at(bar) }}
              />
            ))}
        </div>
      )}
      <div className="absolute inset-x-0 top-6 h-4" aria-label="Speech">
        {speech.map(([from, to]) => (
          <span
            key={`${from}-${to}`}
            className="absolute h-full rounded-sm bg-muted-foreground/30"
            style={{ left: at(from), width: `calc(${at(to)} - ${at(from)})` }}
          />
        ))}
      </div>
      {shots.map((shot, index) => (
        <span
          key={shot.id}
          title={`${formatTime(shot.start)}: shot ${index + 1}`}
          className={cn(
            "absolute top-4 bottom-1 w-px",
            shot.timing === "voice" ? "bg-primary" : "bg-warning",
          )}
          style={{ left: at(shot.start) }}
        >
          <span className="absolute bottom-0 left-1 text-[9px] text-muted-foreground">
            {index + 1}
          </span>
        </span>
      ))}
      <div className="pointer-events-none absolute right-1 bottom-0.5 flex gap-2 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <AudioLines className="size-2.5" /> speech
        </span>
        {grid && (
          <span className="flex items-center gap-1">
            <Music2 className="size-2.5" /> bars and beats
          </span>
        )}
      </div>
    </div>
  );
}
