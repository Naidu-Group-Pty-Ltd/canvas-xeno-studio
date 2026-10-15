import { useState } from "react";
import { AudioLines, Clapperboard, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { envelopeValues, type PreparedAnalysis } from "@/lib/lip-sync/analysis";
import { LIP_SYNC } from "@/lib/lip-sync/models";
import { voiceLength } from "@/lib/lip-sync/view";
import { modelLine } from "@/lib/long-video/plan";
import type { LipSyncVoiceoverState } from "@/hooks/useLipSyncVoiceover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * A voiceover's waveform, its speech shaded and (for a long video) where it
 * is cut into clips marked, so the cuts can be seen to fall where nobody is
 * speaking.
 */
export function VoiceoverWaveform({
  analysis,
  cuts = [],
  className,
}: {
  analysis: PreparedAnalysis;
  cuts?: number[];
  className?: string;
}) {
  const duration = analysis.samples / analysis.sample_rate;
  const values = envelopeValues(analysis.envelope ?? null);
  const width = 400;
  const height = 40;
  const columns = Math.max(1, Math.min(200, values.length));
  const bars = Array.from({ length: columns }, (_, column) => {
    const from = Math.floor((column * values.length) / columns);
    const to = Math.max(from + 1, Math.floor(((column + 1) * values.length) / columns));
    let peak = 0;
    for (let index = from; index < to && index < values.length; index += 1)
      peak = Math.max(peak, values[index] ?? 0);
    return peak / 255;
  });
  const x = (seconds: number) => (Math.max(0, Math.min(duration, seconds)) / duration) * width;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-10 w-full rounded bg-muted/40", className)}
      role="img"
      aria-label={`Voiceover waveform, ${voiceLength(duration)}${cuts.length ? `, cut into ${cuts.length + 1} clips` : ""}`}
    >
      {analysis.speech.map(([from, to], index) => (
        <rect
          key={`speech-${index}`}
          x={x(from)}
          y={0}
          width={Math.max(0.5, x(to) - x(from))}
          height={height}
          className="fill-primary/10"
        />
      ))}
      {values.length > 0 &&
        bars.map((level, column) => {
          const barHeight = Math.max(1, level * (height - 4));
          return (
            <rect
              key={column}
              x={(column / columns) * width + 0.3}
              y={(height - barHeight) / 2}
              width={Math.max(0.6, width / columns - 0.6)}
              height={barHeight}
              className="fill-primary/60"
            />
          );
        })}
      {cuts.map((at, index) => (
        <line
          key={`cut-${index}`}
          x1={x(at)}
          x2={x(at)}
          y1={0}
          y2={height}
          className="stroke-foreground"
          strokeWidth={1.2}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

interface Props {
  model: ModelRegistryEntry;
  state: LipSyncVoiceoverState;
  /** The voiceover's name, as attached. */
  title: string | null;
  /** One clip: the length it is asked for, the most one clip holds, and the way to a long video. */
  clip?: {
    requestSeconds: number | null;
    longestSeconds: number;
    onLongVideo: () => void;
  } | null;
  /** A long video: where the voiceover is cut into clips. */
  cuts?: number[] | null;
}

/**
 * The voiceover a clip (or a long video's clips) is made to: prepared once by
 * the media service (with the person's confirmation for a recording), then
 * shown with its speech and pauses, and for one clip, the length the clip is
 * asked for so none of it is cut off.
 */
export function VoiceoverLipSync({ model, state, title, clip, cuts }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const { voiceover } = state;
  const name = title?.trim() || "The voiceover";
  const ready = voiceover?.status === "ready" && voiceover.analysis ? voiceover : null;
  const seconds = ready?.durationSeconds ?? null;
  const pauses = ready?.analysis?.clear_pauses
    ? ready.analysis.pauses.filter(
        ([from, to]) => from > 0.01 && to < (seconds ?? 0) - 0.01 && to - from >= 0.15,
      ).length
    : 0;

  return (
    <div
      className="space-y-2.5 rounded-md border border-border bg-background/60 p-3"
      data-testid="voiceover-lip-sync"
    >
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <AudioLines className="size-3.5 text-primary" /> Lip sync to the voiceover
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {modelLine(model)} moves the speaker's lips to its driving audio, from the clip's first
          frame. The voiceover is prepared first, as a clean copy every timing is measured against,
          {clip
            ? " and the clip is made from that copy"
            : " then cut into one piece per clip, only where nobody is speaking, and each clip is made from its own piece"}
          , so the lips and the voice meet again in the Editor.
        </p>
      </div>

      {state.loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking the voiceover…
        </p>
      ) : !voiceover && state.needsConfirmation ? (
        <div className="space-y-2 text-[11px]">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
              aria-label="Confirm the brand may use this recording"
            />
            <span>
              <ShieldCheck className="mr-1 inline size-3.5 text-success" />I confirm “{name}” was
              recorded by or for the brand, and the speaker agreed to their voice being used in its
              content. The confirmation is recorded with the file.
            </span>
          </label>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!confirmed || state.busy}
            onClick={() => void state.prepare(true)}
            data-testid="prepare-voiceover"
          >
            {state.busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Prepare for lip sync
          </Button>
        </div>
      ) : !voiceover || voiceover.status === "preparing" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Preparing “{name}”: a clean copy to time everything by, and where its speech and pauses
          are…
        </p>
      ) : voiceover.status === "failed" ? (
        <div className="space-y-2 text-[11px]">
          <p className="text-destructive">
            {voiceover.errorMessage ?? "The voiceover couldn't be prepared."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={state.busy}
            onClick={() => void state.prepare(false)}
          >
            {state.busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 size-3.5" />
            )}
            Try again
          </Button>
        </div>
      ) : ready && seconds ? (
        <div className="space-y-2">
          <VoiceoverWaveform analysis={ready.analysis!} cuts={cuts ?? []} />
          <p className="text-[11px] text-muted-foreground" data-testid="voiceover-summary">
            <span className="font-medium text-foreground">{voiceLength(seconds)}</span>
            {ready.analysis!.clear_pauses
              ? ` · ${pauses} ${pauses === 1 ? "pause" : "pauses"} between its phrases`
              : " · no clear pauses (its sound never drops away from the voice)"}
            {" · "}
            {ready.transcriptStatus === "ready"
              ? clip
                ? "words transcribed, for captions in the Editor"
                : "words transcribed, so clips end with a sentence where they can"
              : ready.transcriptStatus === "pending"
                ? "finding its words…"
                : ready.transcriptStatus === "unavailable"
                  ? clip
                    ? "no transcription"
                    : "no transcription, so clips are cut at its pauses"
                  : "words not transcribed yet"}
          </p>
          {clip &&
            (seconds > clip.longestSeconds + 1e-6 ? (
              <div className="space-y-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed">
                <p>
                  One clip holds up to {voiceLength(Math.floor(clip.longestSeconds * 10) / 10)} of
                  voiceover and this one runs {voiceLength(seconds)}. Make it as a long video: it is
                  cut into clips where nobody is speaking, each made from its own piece.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={clip.onLongVideo}
                  data-testid="voiceover-long-video"
                >
                  <Clapperboard className="mr-1.5 size-3.5" /> Make a long video
                </Button>
              </div>
            ) : clip.requestSeconds ? (
              <p className="text-[11px] text-muted-foreground">
                The clip is made {clip.requestSeconds}s long: the voiceover and a moment more (at
                least {LIP_SYNC.headroomSeconds}s), so none of it is cut off. In the Editor the clip
                plays with the voiceover, lined up by its own sound.
              </p>
            ) : null)}
          {cuts && cuts.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Cut at {cuts.map((at) => voiceLength(at)).join(", ")}: each clip is made from its own
              piece, and the Editor lays them back along the voiceover to the frame.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
