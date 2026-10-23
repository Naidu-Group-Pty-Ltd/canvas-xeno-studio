import { useState } from "react";
import { Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { audioUrlFor } from "@/hooks/useMusicData";
import { useMusicStructure } from "@/hooks/useMusicStructure";
import { useVoiceSilences } from "@/hooks/useVoiceSilences";
import { analyzeAudioUrl } from "@/lib/music/analyze";
import type { MusicTrackRow } from "@/lib/music/catalog";
import { paceVoiceToMusic, type PaceChange } from "@/lib/music/pace-edit";
import {
  gridFromBeats,
  gridFromStructure,
  gridOnTimeline,
  type PacingGrid,
} from "@/lib/music/pacing";
import { formatTime, layoutTimeline, type Timeline, type TimelineAudio } from "@/lib/edit/timeline";

/**
 * "Pace the voice to the music", beside the beat tools: the whole edit solved
 * at once, as Reel 1's third cut was (see paceVoiceToMusic). The voiceover is
 * held open in its own silences so the cuts that follow its words land on the
 * music's bar lines and beats, never stretching a word; the clips lengthen to
 * keep each cut with its words. What it would change is shown first.
 */
export function PaceToMusic({
  timeline,
  bed,
  track,
  projectId,
  sequenceId,
  onUpdate,
  getTimeline,
}: {
  timeline: Timeline;
  /** The music bed the cuts are paced to. */
  bed: TimelineAudio | undefined;
  track: MusicTrackRow | undefined;
  projectId: string | null;
  sequenceId: string | null;
  onUpdate: (apply: (timeline: Timeline) => Timeline) => void;
  getTimeline: () => Timeline;
}) {
  const voiceItem = timeline.audio.find((item) => item.role === "voiceover");
  const silences = useVoiceSilences({
    assetId: voiceItem?.assetId ?? "",
    projectId,
    sequenceId,
    enabled: !!voiceItem,
  });
  // The bed's bars and sections, once found (Bars and sections, above).
  const { data: known } = useMusicStructure(bed?.assetId ?? null);
  const [working, setWorking] = useState(false);
  const [proposal, setProposal] = useState<{
    change: PaceChange;
    grid: PacingGrid;
    voiceId: string;
  } | null>(null);

  /** The bed's beats, as found once for its track, or found now. */
  async function beatsOf(item: TimelineAudio): Promise<{ beats: number[]; length: number | null }> {
    const length = track?.duration_seconds ? Number(track.duration_seconds) : null;
    if (known) return { beats: known.structure.beats, length };
    if (track?.beats?.length) return { beats: track.beats, length };
    const url = await audioUrlFor(item.assetId);
    if (!url) throw new Error("The music file couldn't be opened");
    const analysis = await analyzeAudioUrl(url, length);
    if (!analysis || analysis.confidence < 0.15 || analysis.beats.length < 4)
      throw new Error("This music has no steady beat to pace the voice to.");
    return { beats: analysis.beats, length: length ?? analysis.duration };
  }

  async function propose() {
    if (!bed || !voiceItem) return;
    if (silences.status !== "ready" || !silences.voice) {
      toast.message(
        "First measure the voiceover's silences: select it on the timeline, then choose Measure its silences under Pauses.",
      );
      return;
    }
    setWorking(true);
    try {
      const { beats, length } = await beatsOf(bed);
      const current = getTimeline();
      const item = current.audio.find((entry) => entry.id === bed.id) ?? bed;
      // The music's own bar lines once its bars are found; until then one every four
      // beats from its first. Edited on its bars, it is paced to them as they play.
      const grid = gridOnTimeline(
        { ...item, sourceDuration: item.sourceDuration ?? length },
        known && item.assetId === bed.assetId
          ? gridFromStructure(known.structure)
          : gridFromBeats(beats),
        layoutTimeline(current).total + 60,
      );
      const change = paceVoiceToMusic(current, voiceItem.id, silences.voice, grid);
      if (!change) {
        toast.message("No cut comes after the voiceover starts, so there's nothing to pace.");
        return;
      }
      if (!change.cuts.moved && change.pauses.framesAfter === change.pauses.framesBefore) {
        toast.message("The cuts already sit on the music as well as the voice's silences allow.");
        return;
      }
      setProposal({ change, grid, voiceId: voiceItem.id });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "The voice couldn't be paced to the music",
      );
    } finally {
      setWorking(false);
    }
  }

  function apply() {
    if (!proposal || !silences.voice) return;
    const { grid, voiceId, change } = proposal;
    const voice = silences.voice;
    // Worked out again on the edit as it is when the change lands.
    onUpdate((latest) => paceVoiceToMusic(latest, voiceId, voice, grid)?.timeline ?? latest);
    setProposal(null);
    toast.success(
      `Paced to the music: ${change.cuts.onBars} cut${change.cuts.onBars === 1 ? "" : "s"} on bar lines, ${change.cuts.onBeats} on beats.`,
    );
    if (change.shortClips.length)
      toast.message(
        `${change.shortClips.length === 1 ? "A clip doesn't" : `${change.shortClips.length} clips don't`} have the footage to keep its cut with the words, so ${change.shortClips.length === 1 ? "it stops" : "they stop"} short.`,
      );
  }

  const change = proposal?.change;
  const fps = timeline.fps;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={!bed || !voiceItem || working || timeline.clips.length < 2}
        onClick={() => void propose()}
        data-testid="pace-to-music"
        title="Hold the voiceover open in its silences so the cuts land on the music's bars and beats"
      >
        {working ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Timer className="mr-1.5 size-3.5" />
        )}
        Pace the voice to the music
      </Button>
      <Dialog open={!!proposal} onOpenChange={(open) => !open && setProposal(null)}>
        <DialogContent className="sm:max-w-md" data-testid="pace-to-music-proposal">
          <DialogHeader>
            <DialogTitle>Pace the voice to the music</DialogTitle>
            <DialogDescription>
              The voiceover is held open in its own silences, no word stretched, and the clips
              lengthen so each cut stays with its words.
            </DialogDescription>
          </DialogHeader>
          {change && (
            <ul className="space-y-1.5 text-sm">
              <li>
                Pauses: {change.pauses.after} adding {(change.pauses.framesAfter / fps).toFixed(2)}s
                {change.pauses.before
                  ? ` (was ${change.pauses.before}, ${(change.pauses.framesBefore / fps).toFixed(2)}s)`
                  : ""}
              </li>
              <li>
                Cuts: {change.cuts.moved} of {change.cuts.total} move; {change.cuts.onBars} land on
                bar lines (was {change.cuts.onBarsBefore}) and {change.cuts.onBeats} on beats
              </li>
              <li>
                The edit runs {formatTime(change.length.after)} (was{" "}
                {formatTime(change.length.before)})
              </li>
              {change.shortClips.length > 0 && (
                <li className="text-warning">
                  {change.shortClips.length === 1
                    ? "One clip doesn't"
                    : `${change.shortClips.length} clips don't`}{" "}
                  have the footage to keep its cut with the words.
                </li>
              )}
            </ul>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Keep it as it is
            </Button>
            <Button onClick={apply} data-testid="pace-to-music-apply">
              Pace it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
