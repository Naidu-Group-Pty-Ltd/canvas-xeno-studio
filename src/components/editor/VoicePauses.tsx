import { useState } from "react";
import { AlertTriangle, AudioLines, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useVoiceSilences } from "@/hooks/useVoiceSilences";
import {
  audioPlayLength,
  cutShift,
  editVoicePauses,
  formatTime,
  itemPauses,
  LIMITS,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
  type VoicePause,
} from "@/lib/edit/timeline";
import {
  breathingRoom,
  pauseProblem,
  type MeasuredVoice,
  type VoiceSilence,
} from "@/lib/edit/voice-pauses";
import { cn } from "@/lib/utils";
import type { PlaybackClock } from "./state";

const KIND_LABELS: Record<VoiceSilence["kind"], string> = {
  start: "Before the first word",
  sentence: "End of a sentence",
  phrase: "End of a phrase",
  breath: "Between words",
};

/**
 * A voiceover held open in its own silences: each silence the media service
 * measured in it, with the frames of room added there, and quick room after
 * every sentence or phrase. No word is ever stretched. Its captions and titles
 * move with it, and (if asked) the clips lengthen so the cuts stay with the
 * words, as Reel 1's pacing did (scripts/aurixa-reel-1/pacing.py).
 */
export function VoicePauses({
  timeline,
  layout,
  item,
  clock,
  projectId,
  sequenceId,
  onChange,
}: {
  timeline: Timeline;
  layout: TimelineLayout;
  item: TimelineAudio;
  clock: PlaybackClock;
  projectId: string | null;
  sequenceId: string | null;
  onChange: (timeline: Timeline, key?: string) => void;
}) {
  const silences = useVoiceSilences({ assetId: item.assetId, projectId, sequenceId });
  const [confirmed, setConfirmed] = useState(false);
  const [follow, setFollow] = useState(true);
  const fps = timeline.fps;
  // A tenth of a second, in whole frames, is what each press adds or takes away.
  const step = Math.max(1, Math.round(fps / 10));
  const [room, setRoom] = useState(Math.round(fps * 0.3));
  const pauses = itemPauses(item);
  const held = pauses.reduce((sum, pause) => sum + pause.frames, 0);

  const apply = (next: VoicePause[], key?: string) => {
    const result = editVoicePauses(timeline, item.id, next, { cuts: follow });
    onChange(result.timeline, key);
    if (result.shortClips.length)
      toast.message(
        `${result.shortClips.length === 1 ? "A clip doesn't" : `${result.shortClips.length} clips don't`} have the footage to keep its cut with the words, so ${result.shortClips.length === 1 ? "it stops" : "they stop"} short. Trim it earlier or add a clip to fill the gap.`,
      );
  };

  if (silences.status === "loading")
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Finding its silences…
      </p>
    );
  if (silences.status === "preparing")
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Measuring its silences. This takes a few
        seconds.
      </p>
    );
  if (silences.status !== "ready" || !silences.voice) {
    return (
      <div className="space-y-2" data-testid="voice-pauses-measure">
        <p className="text-xs text-muted-foreground">
          Pauses give the picture room to breathe: whole frames of silence go into the voiceover
          where nobody speaks, and no word is stretched. First, where it speaks is measured.
        </p>
        {silences.status === "failed" && silences.errorMessage && (
          <p className="text-xs text-destructive">{silences.errorMessage}</p>
        )}
        {silences.needsConfirmation && (
          <label className="flex items-start gap-2 text-[11px]">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
              aria-label="Confirm the brand may use this recording"
            />
            <span>
              <ShieldCheck className="mr-1 inline size-3.5 text-success" />I confirm this recording
              was made by or for the brand, and the speaker agreed to their voice being used in its
              content. The confirmation is recorded with the file.
            </span>
          </label>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full"
          disabled={silences.busy || (silences.needsConfirmation && !confirmed)}
          onClick={() => void silences.measure(confirmed)}
          data-testid="voice-pauses-measure-button"
        >
          {silences.busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <AudioLines className="mr-1.5 size-3.5" />
          )}
          {silences.status === "failed" ? "Measure its silences again" : "Measure its silences"}
        </Button>
      </div>
    );
  }

  const voice = silences.voice;
  const length = audioPlayLength(item, layout.total, fps);
  // Only the silences it plays: from its trim point, while it is heard.
  const shown = voice.silences.filter(
    (silence) =>
      silence.to >= item.trimStart &&
      silence.at - item.trimStart + cutShift(pauses, silence.at, fps) < length,
  );
  const framesIn = (silence: VoiceSilence) =>
    pauses
      .filter((pause) => inSilence(pause.at, silence))
      .reduce((sum, pause) => sum + pause.frames, 0);
  const misplaced = pauses.filter((pause) => pauseProblem(pause.at, voice));
  const setFrames = (silence: VoiceSilence, frames: number) => {
    const inside = pauses.filter((pause) => inSilence(pause.at, silence));
    const at = inside[0]?.at ?? Math.max(silence.at, item.trimStart);
    const rest = item.pauses.filter((pause) => !inSilence(pause.at, silence));
    const capped = Math.max(0, Math.min(LIMITS.pauseFrames, frames));
    apply(capped ? [...rest, { at, frames: capped }] : rest, `pauses:${item.id}`);
  };
  // Where a silence's room starts on the edit, for the playhead.
  const editTime = (silence: VoiceSilence) =>
    item.start + (silence.at - item.trimStart) + cutShift(pauses, silence.at, fps);

  return (
    <div className="space-y-3" data-testid="voice-pauses">
      <p className="text-xs text-muted-foreground" data-testid="voice-pauses-summary">
        {held
          ? `${(held / fps).toFixed(2)}s of room in ${pauses.length} place${pauses.length === 1 ? "" : "s"} · plays ${formatTime(length)}`
          : `No pauses yet · plays ${formatTime(length)}`}
      </p>
      {!voice.speech.length || voice.silences.length <= 1 ? (
        <p className="text-xs text-muted-foreground">
          Its speech can't be told from the sound under it, so the only safe place to pause it is
          before it starts.
        </p>
      ) : null}
      {misplaced.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-destructive/40 p-2 text-xs">
          <p className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="size-3.5" />
            {misplaced.length === 1 ? "A pause isn't" : `${misplaced.length} pauses aren't`} in a
            silence, so the edit can't be rendered.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={() => apply(item.pauses.filter((pause) => !pauseProblem(pause.at, voice)))}
          >
            Take {misplaced.length === 1 ? "it" : "them"} out
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Room to add</Label>
          <FrameStepper
            frames={room}
            fps={fps}
            step={step}
            label="Room to add"
            onChange={(frames) => setRoom(Math.max(1, frames))}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => apply(roomAfter(voice, item.pauses, room, "sentences"))}
            data-testid="voice-pauses-sentences"
          >
            After every sentence
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => apply(roomAfter(voice, item.pauses, room, "phrases"))}
          >
            After every phrase
          </Button>
        </div>
        {held > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={() => apply([])}
            data-testid="voice-pauses-clear"
          >
            Take every pause out
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs" htmlFor={`pauses-cuts-${item.id}`}>
          Lengthen the clips so the cuts stay with the words
        </Label>
        <Switch id={`pauses-cuts-${item.id}`} checked={follow} onCheckedChange={setFollow} />
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" data-testid="voice-silences">
        {shown.map((silence) => {
          const frames = framesIn(silence);
          return (
            <li
              key={`${silence.from}-${silence.to}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                frames ? "border-primary/40 bg-primary/5" : "border-border",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={`${KIND_LABELS[silence.kind]}. Show it in the preview.`}
                onClick={() => clock.seek(Math.max(0, editTime(silence) - 1))}
              >
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(editTime(silence))}
                </span>{" "}
                {silence.after ? `after “${silence.after}”` : KIND_LABELS[silence.kind]}
                <span className="text-muted-foreground">
                  {" "}
                  · {(silence.to - silence.from).toFixed(2)}s
                </span>
              </button>
              <FrameStepper
                frames={frames}
                fps={fps}
                step={step}
                label={`Room ${silence.after ? `after “${silence.after}”` : "at the start"}`}
                onChange={(next) => setFrames(silence, next)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Whether a pause is in a silence (its edges included). */
function inSilence(at: number, silence: VoiceSilence): boolean {
  return at >= silence.from - 0.005 && at <= silence.to + 0.005;
}

/** Room after every sentence (or phrase), on top of the pauses kept elsewhere. */
function roomAfter(
  voice: MeasuredVoice,
  pauses: readonly VoicePause[],
  frames: number,
  after: "sentences" | "phrases",
): VoicePause[] {
  return breathingRoom(voice, pauses, { frames, after });
}

function FrameStepper({
  frames,
  fps,
  step,
  label,
  onChange,
}: {
  frames: number;
  fps: number;
  step: number;
  label: string;
  onChange: (frames: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={`${label}: less`}
        disabled={frames <= 0}
        onClick={() => onChange(Math.max(0, frames - step))}
      >
        <Minus className="size-3" />
      </Button>
      <span
        className="w-14 text-center tabular-nums"
        title={`${(frames / fps).toFixed(2)}s at ${fps} fps`}
      >
        {frames} f
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={`${label}: more`}
        disabled={frames >= LIMITS.pauseFrames}
        onClick={() => onChange(Math.min(LIMITS.pauseFrames, frames + step))}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}
