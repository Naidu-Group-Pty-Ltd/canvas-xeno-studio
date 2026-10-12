import { useState } from "react";
import { Clapperboard, Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import {
  clipStarts,
  formatLength,
  LONG_VIDEO_LIMITS,
  modelLine,
  startFrameSlot,
} from "@/lib/long-video/plan";
import { planLongVideo } from "@/lib/long-video.functions";
import {
  newFinale,
  type LongVideoDraft,
  type LongVideoPlan,
} from "@/components/create/long-video-plan";
import type { ReferenceItem } from "@/components/create/reference-files";
import { FinisherSetup } from "@/components/create/FinisherSetup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LENGTH_PRESETS = [30, 60, 90, 120, 180];

interface Props {
  model: ModelRegistryEntry;
  draft: LongVideoDraft;
  plan: LongVideoPlan;
  onChange: (draft: LongVideoDraft) => void;
  story: string;
  /** The reference images, in the order attached: the finisher is one of them. */
  images: ReferenceItem[];
  briefId: string | null;
  /** The end card's size: the video's own shape. */
  endCardSize: { width: number; height: number };
  /** Why the AI can't write beats right now, if it can't. */
  aiUnavailableReason: string | null;
}

/** One clip or a long video, and everything about the long video: its length, clips and beats. */
export function LongVideoSetup({
  model,
  draft,
  plan,
  onChange,
  story,
  images,
  briefId,
  endCardSize,
  aiUnavailableReason,
}: Props) {
  const [planning, setPlanning] = useState(false);
  const set = (patch: Partial<LongVideoDraft>) => onChange({ ...draft, ...patch });

  if (!plan.eligible) return null;

  async function writeBeats() {
    if (!plan.continuation || plan.durations.length < 2) return;
    setPlanning(true);
    try {
      const suggestion = await planLongVideo({
        data: {
          firstModelId: model.id,
          continuationModelId: plan.continuation.id,
          story,
          continuity: draft.continuity,
          title: draft.title,
          durations: plan.durations,
          referenceAssetIds: images.slice(0, 6).map((image) => image.assetId),
          briefId,
          finale: plan.finale ? { assetId: plan.finale.assetId, mode: plan.finale.mode } : null,
        },
      });
      // The image the AI took for the logo closes the video, unless one is
      // chosen, none is wanted, or clip 1 starts from it.
      const spotted =
        !plan.finale && !draft.finaleOff && suggestion.finisherAssetId
          ? images.findIndex(
              (image) =>
                image.assetId === suggestion.finisherAssetId &&
                image.role !== startFrameSlot(model)?.role,
            )
          : -1;
      onChange({
        ...draft,
        title: draft.title.trim() ? draft.title : suggestion.title,
        continuity: suggestion.continuity || draft.continuity,
        beats: suggestion.beats,
        ...(spotted >= 0
          ? {
              finale: newFinale(
                images[spotted]!.assetId,
                !!plan.end,
                `the AI recognised image ${spotted + 1} as your logo`,
              ),
            }
          : {}),
      });
      toast.success(
        spotted >= 0
          ? `Beats written, and image ${spotted + 1} now closes the video as your logo. Review them before generating.`
          : "Beats written. Review them before generating.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Beats couldn't be written");
    } finally {
      setPlanning(false);
    }
  }

  const clipIssues = new Map<number, string>();
  for (const issue of plan.issues)
    if (issue.position !== null && !clipIssues.has(issue.position))
      clipIssues.set(issue.position, issue.message);
  const runIssue = plan.issues.find((issue) => issue.position === null);
  const sameLength = plan.durations.every((value) => value === plan.durations[0]);
  const starts = clipStarts(plan.durations);

  return (
    <div className="space-y-4" data-testid="long-video-setup">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist">
          {[
            { on: false, label: "One clip", icon: Film },
            { on: true, label: "Long video", icon: Clapperboard },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="tab"
              aria-selected={draft.enabled === option.on}
              onClick={() => set({ enabled: option.on })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                draft.enabled === option.on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <option.icon className="size-3.5" />
              {option.label}
            </button>
          ))}
        </div>
        {!draft.enabled && (
          <p className="text-[11px] text-muted-foreground">
            Longer than one clip allows? A long video chains clips into one continuous shot.
          </p>
        )}
      </div>

      {draft.enabled && (
        <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="long-video-length" className="text-xs">
                Total length (seconds)
              </Label>
              <Input
                id="long-video-length"
                type="number"
                min={1}
                max={LONG_VIDEO_LIMITS.maxSeconds}
                step={1}
                value={draft.targetSeconds}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value))
                    set({
                      targetSeconds: Math.max(1, Math.min(LONG_VIDEO_LIMITS.maxSeconds, value)),
                    });
                }}
                className="h-9"
              />
              <div className="flex flex-wrap gap-1">
                {LENGTH_PRESETS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => set({ targetSeconds: seconds })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                      draft.targetSeconds === seconds
                        ? "border-primary/60 bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {formatLength(seconds)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Clips up to</Label>
              <Select
                value={String(plan.maxClipSeconds)}
                onValueChange={(value) => set({ clipSeconds: Number(value) })}
              >
                <SelectTrigger className="h-9" aria-label="Longest clip">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...plan.lengthChoices].reverse().map((seconds) => (
                    <SelectItem key={seconds} value={String(seconds)}>
                      {seconds}s
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Clips 2 onward use</Label>
              {plan.candidates.length > 1 ? (
                <Select
                  value={plan.continuation?.id ?? ""}
                  onValueChange={(value) => set({ continuationModelId: value })}
                >
                  <SelectTrigger className="h-9" aria-label="Model for later clips">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plan.candidates.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p
                  className="flex h-9 items-center truncate rounded-md border border-border px-3 text-xs text-muted-foreground"
                  data-testid="long-video-continuation"
                >
                  {plan.continuation?.display_name ?? "No workflow can continue"}
                </p>
              )}
            </div>
          </div>

          <div
            className="rounded-md bg-background/60 px-3 py-2 text-xs"
            data-testid="long-video-summary"
          >
            <p className="font-medium">
              {plan.durations.length} {plan.durations.length === 1 ? "clip" : "clips"}
              {plan.durations.length
                ? sameLength && plan.durations.length > 1
                  ? ` · ${plan.durations[0]}s each`
                  : ` · ${plan.durations.map((value) => `${value}s`).join(" + ")}`
                : ""}
              {" · "}
              {formatLength(plan.totalSeconds)} in total
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Each clip runs as long as it can, up to {plan.maxClipSeconds}s, and the last takes
              what's left. Each one starts from a frame taken just before the end of the one before
              and is made by {modelLine(model)} too, with the same story (the prompt below),
              settings and reference images, so the clips play as one continuous shot.
              {plan.start?.kind === "reference"
                ? ` ${modelLine(model)} has no start-frame input, so that frame goes in as each clip's first reference image and the prompt tells it to start there.`
                : ""}{" "}
              When they're all in, open them in the Editor as one edit.
            </p>
            {plan.durations.length >= LONG_VIDEO_LIMITS.maxClips &&
              plan.totalSeconds + 0.5 < draft.targetSeconds && (
                <p className="mt-1 text-[11px] text-warning">
                  A long video has at most {LONG_VIDEO_LIMITS.maxClips} clips, so at{" "}
                  {plan.maxClipSeconds}s a clip it runs {formatLength(plan.totalSeconds)}.
                </p>
              )}
            {runIssue && <p className="mt-1 text-[11px] text-primary">{runIssue.message}</p>}
          </div>

          <FinisherSetup
            images={images}
            finale={draft.finale}
            plan={plan}
            startRole={startFrameSlot(model)?.role ?? null}
            size={endCardSize}
            onChange={(finale, off) => set({ finale, finaleOff: off })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="long-video-title" className="text-xs">
                Title
              </Label>
              <Input
                id="long-video-title"
                value={draft.title}
                maxLength={LONG_VIDEO_LIMITS.titleChars}
                placeholder="Name this video"
                onChange={(event) => set({ title: event.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="long-video-continuity" className="text-xs">
                Keep consistent (optional)
              </Label>
              <Textarea
                id="long-video-continuity"
                value={draft.continuity}
                maxLength={LONG_VIDEO_LIMITS.continuityChars}
                rows={2}
                placeholder="Characters, wardrobe, product, setting, light and style that must not change"
                onChange={(event) => set({ continuity: event.target.value })}
                className="min-h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="label-eyebrow">What happens in each clip</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={planning || !!aiUnavailableReason || plan.durations.length < 2}
                title={aiUnavailableReason ?? undefined}
                onClick={() => void writeBeats()}
                data-testid="long-video-write-beats"
              >
                {planning ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5 text-primary" />
                )}
                Write beats with AI
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Optional. Without a beat, a clip carries the story on from where the last one ended.
            </p>
            <ol className="space-y-2">
              {plan.durations.map((seconds, index) => {
                const from = starts[index] ?? 0;
                return (
                  <li key={index} className="space-y-1">
                    <Label
                      htmlFor={`long-video-beat-${index}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      Clip {index + 1} · {formatLength(from)}–{formatLength(from + seconds)}
                      {index === 0 && plan.continuation && plan.continuation.id !== model.id
                        ? ` · ${model.display_name}`
                        : ""}
                    </Label>
                    <Textarea
                      id={`long-video-beat-${index}`}
                      rows={2}
                      value={draft.beats[index] ?? ""}
                      maxLength={LONG_VIDEO_LIMITS.beatChars}
                      placeholder={
                        index === 0 ? "How it opens (optional)" : "What happens next (optional)"
                      }
                      onChange={(event) => {
                        const beats = [...draft.beats];
                        while (beats.length <= index) beats.push("");
                        beats[index] = event.target.value;
                        set({ beats });
                      }}
                      className="min-h-9 text-xs"
                    />
                    {clipIssues.has(index) && (
                      <p className="text-[11px] text-primary">{clipIssues.get(index)}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
