import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Clapperboard, Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import {
  clipStarts,
  extendsVideo,
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
import { voiceLength } from "@/lib/lip-sync/view";
import { SECTION_LIMITS } from "@/lib/lip-sync/sections";
import { CharacterConsistency } from "@/components/create/CharacterConsistency";
import { PresenterSetup } from "@/components/create/PresenterSetup";
import type { CharacterEntry } from "@/hooks/useCharacters";
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
/** How far a clip after a cutaway reaches back into it (its lead-in). */
const SECTION_LEAD = SECTION_LIMITS.leadInSeconds;

interface Props {
  model: ModelRegistryEntry;
  draft: LongVideoDraft;
  plan: LongVideoPlan;
  onChange: Dispatch<SetStateAction<LongVideoDraft>>;
  story: string;
  /** The reference images, in the order attached: the finisher is one of them. */
  images: ReferenceItem[];
  briefId: string | null;
  /** The end card's size: the video's own shape. */
  endCardSize: { width: number; height: number };
  /** Where files made for the video (its end card, extended artwork) are kept. */
  projectId: string | null;
  campaignId: string | null;
  /** Why the AI can't write beats right now, if it can't. */
  aiUnavailableReason: string | null;
  /** The team's characters, to choose from. */
  characters: CharacterEntry[];
  /** Higgsfield's price for one keyframe, when known. */
  keyframeUsd: number | null;
  /** The database can run presenter videos (undefined while asking, false before migration 0017). */
  presenterRuns?: boolean | undefined;
  /** Puts the presenter recipe in the prompt and settings (null: nothing to set). */
  onApplyPresenterRecipe?: (() => void) | null;
  /** The brand kit the video is made in: the AI's beats keep to its look. */
  brandKitId?: string | null;
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
  projectId,
  campaignId,
  aiUnavailableReason,
  characters,
  keyframeUsd,
  presenterRuns,
  onApplyPresenterRecipe = null,
  brandKitId = null,
}: Props) {
  const [planning, setPlanning] = useState(false);
  const set = (patch: Partial<LongVideoDraft>) => onChange({ ...draft, ...patch });
  // The setup as it is now, for the AI's beats, which come back after it may have changed.
  const latest = useRef({ draft, plan, images, model });
  latest.current = { draft, plan, images, model };

  if (!plan.eligible) return null;

  // Made to a voiceover, a clip is as long as its piece of it (which may be one clip).
  const voiced = plan.voiceover;
  const minClipsForBeats = voiced ? 1 : 2;

  async function writeBeats() {
    if (!plan.continuation || plan.durations.length < minClipsForBeats) return;
    setPlanning(true);
    try {
      const suggestion = await planLongVideo({
        data: {
          firstModelId: model.id,
          continuationModelId: plan.continuation.id,
          story,
          continuity: draft.continuity,
          title: draft.title,
          // What each clip shows: its piece of the voiceover, else the length it is made.
          durations: voiced
            ? voiced.segments.map((segment) =>
                Math.max(0.1, Number((segment.end - segment.start).toFixed(2))),
              )
            : plan.durations,
          spoken: voiced ? voiced.spoken : null,
          referenceAssetIds: images.slice(0, 6).map((image) => image.assetId),
          briefId,
          finale: plan.finale ? { assetId: plan.finale.assetId, mode: plan.finale.mode } : null,
          characterIds: plan.characters.map((character) => character.id),
          keyframes: plan.keyframed,
          brandKitId,
        },
      });
      // Merged into the setup as it is now, not as it was when asked: the
      // finisher (or anything else) may have changed meanwhile.
      const now = latest.current;
      // The image the AI took for the logo closes the video, unless one is
      // chosen, none is wanted, or clip 1 starts from it.
      const spotted =
        !now.plan.finale && !now.draft.finaleOff && suggestion.finisherAssetId
          ? now.images.findIndex(
              (image) =>
                image.assetId === suggestion.finisherAssetId &&
                image.role !== startFrameSlot(now.model)?.role,
            )
          : -1;
      const finale =
        spotted >= 0
          ? newFinale(
              now.images[spotted]!.assetId,
              !!now.plan.end,
              `the AI recognised image ${spotted + 1} as your logo`,
            )
          : null;
      onChange((current) => ({
        ...current,
        title: current.title.trim() ? current.title : suggestion.title,
        continuity: suggestion.continuity || current.continuity,
        beats: suggestion.beats,
        ...(finale &&
        current.finale === now.draft.finale &&
        current.finaleOff === now.draft.finaleOff
          ? { finale }
          : {}),
      }));
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
  // How many reference images later clips are sent (0: the model takes none with a frame).
  const carriedImages = plan.planned
    .slice(1)
    .reduce(
      (most, clip) =>
        Math.max(most, clip.inputs.filter((item) => item.role === "reference").length),
      0,
    );
  const names = new Map(plan.characters.map((character) => [character.id, character.name]));

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
            {voiced ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Length</Label>
                <p
                  className="flex h-9 items-center rounded-md border border-border px-3 text-xs"
                  data-testid="long-video-voiceover-length"
                >
                  {voiced.durationSeconds
                    ? `${voiceLength(voiced.durationSeconds)}, the voiceover's`
                    : "The voiceover's, once it's prepared"}
                </p>
              </div>
            ) : (
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
            )}
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
              <Label className="text-xs">
                {plan.keyframed ? "Every clip is made by" : "Clips 2 onward use"}
              </Label>
              {plan.candidates.length > 1 && !plan.keyframed ? (
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
                        {extendsVideo(entry) ? " · experimental" : ""}
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
              {voiced
                ? voiced.durationSeconds
                  ? ` made · ${voiceLength(voiced.durationSeconds)} of voiceover`
                  : ""
                : ` · ${formatLength(plan.totalSeconds)} in total`}
            </p>
            {voiced ? (
              <p
                className="mt-1 text-[11px] leading-relaxed text-muted-foreground"
                data-testid="long-video-voiceover-note"
              >
                Made to the voiceover: it is cut into one piece per clip, only where nobody is
                speaking (at the end of a sentence where its words are known), on the Editor's frame
                grid. Each clip is made from its own piece as{" "}
                {modelLine(plan.keyframed && plan.workflow ? plan.workflow : model)}'s driving
                audio, asked for a moment longer than its piece so none of it is cut off
                {plan.startFrom === "anchor"
                  ? ", and every clip starts from clip 1's start image, so the presenter looks the same in each."
                  : ", and each one after the first starts from the frame where the clip before is cut, so the picture runs on as one shot."}
                {voiced.cutaways.length
                  ? ` No clip is made for the ${voiced.cutaways.length === 1 ? "line" : "lines"} covered by B-roll.`
                  : ""}
                {plan.keyframed
                  ? " With keyframes, each clip moves toward its keyframe as its words are said and is cut where they end, and the last plays on after the voiceover to land on its own."
                  : ""}{" "}
                When they're in, open them in the Editor: the voiceover plays whole and every clip
                is laid where its piece is, lined up to the frame by its own sound.
              </p>
            ) : plan.start?.kind === "video" ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Each clip runs as long as it can, up to {plan.maxClipSeconds}s, and the last takes
                what's left. Each one after the first extends the clip before: {modelLine(model)} is
                given that clip's video, not a still of its end, so movement, light and sound carry
                straight on through the join, with the same story (the prompt below), settings and
                reference images. When they're all in, open them in the Editor as one edit.
              </p>
            ) : plan.keyframed ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Each clip runs as long as it can, up to {plan.maxClipSeconds}s, and the last takes
                what's left. First {plan.paintedKeyframes} keyframes are painted: the opening frame
                and the frame each clip ends on
                {plan.keyframeCount > plan.paintedKeyframes
                  ? " (your own frames are used as they are)"
                  : ""}
                . Clip 1 starts on the opening keyframe; every clip after it starts from the true
                last frame of the one before (taken losslessly) and is told how the camera was
                moving; each ends on its own keyframe. When they're all in, open them in the Editor
                as one edit.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Each clip runs as long as it can, up to {plan.maxClipSeconds}s, and the last takes
                what's left. Each one starts from the true last frame of the one before (taken
                losslessly), is told how the camera was moving as it ended, and is made by{" "}
                {modelLine(model)} too, with the same story (the prompt below) and settings
                {carriedImages > 0
                  ? `, and up to ${carriedImages} reference image${carriedImages === 1 ? "" : "s"}`
                  : ""}
                , so the clips play as one continuous shot.
                {plan.start?.kind === "reference"
                  ? ` ${modelLine(model)} has no start-frame input, so that frame goes in as each clip's first reference image and the prompt tells it to start there.`
                  : ""}
                {images.length > 0 && carriedImages === 0 && plan.durations.length > 1
                  ? ` Your reference images shape clip 1 only: ${plan.continuation ? modelLine(plan.continuation) : "the model"}'s later clips can't take them with a start frame.`
                  : ""}{" "}
                When they're all in, open them in the Editor as one edit.
              </p>
            )}
            {plan.start?.kind === "video" && (
              <p
                className="mt-1 text-[11px] leading-relaxed text-warning"
                data-testid="long-video-extend-note"
              >
                Experimental: video extend hasn't been proven in a full run yet, so try a short
                video first. Each later clip is also billed for the clip it's given (the estimate
                includes it), and the video can't move into a finisher, which holds as an end card
                instead.
              </p>
            )}
            {plan.durations.length >= LONG_VIDEO_LIMITS.maxClips &&
              plan.totalSeconds + 0.5 < draft.targetSeconds && (
                <p className="mt-1 text-[11px] text-warning">
                  A long video has at most {LONG_VIDEO_LIMITS.maxClips} clips, so at{" "}
                  {plan.maxClipSeconds}s a clip it runs {formatLength(plan.totalSeconds)}.
                </p>
              )}
            {runIssue && <p className="mt-1 text-[11px] text-primary">{runIssue.message}</p>}
          </div>

          <PresenterSetup
            draft={draft}
            plan={plan}
            onChange={set}
            presenterRuns={presenterRuns}
            onApplyRecipe={onApplyPresenterRecipe}
          />

          <CharacterConsistency
            model={model}
            draft={draft}
            plan={plan}
            characters={characters}
            onChange={set}
            keyframeUsd={keyframeUsd}
            aiUnavailableReason={aiUnavailableReason}
          />

          <FinisherSetup
            images={images}
            finale={draft.finale}
            plan={plan}
            startRole={startFrameSlot(model)?.role ?? null}
            size={endCardSize}
            projectId={projectId}
            campaignId={campaignId}
            onChange={(finale, off) => set({ finale, finaleOff: off })}
            // Lands a while after it was asked for: applied to the setup as it is
            // by then, and only while the same image is still the finisher.
            onExtend={(finisherAssetId, sourceAssetId) =>
              onChange((current) =>
                current.finale?.assetId === finisherAssetId
                  ? {
                      ...current,
                      finale: {
                        ...current.finale,
                        sourceAssetId,
                        style: { ...current.finale.style, scale: null },
                        suggested: null,
                      },
                    }
                  : current,
              )
            }
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
                disabled={
                  planning || !!aiUnavailableReason || plan.durations.length < minClipsForBeats
                }
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
              {voiced
                ? `${plan.keyframed ? "Needed: each clip's keyframe is painted from its beat." : "Optional."} Say how the speaker moves and reacts as they say each clip's words: never the words themselves, which the voiceover gives.`
                : plan.keyframed
                  ? "Needed: each clip's keyframe, the moment it ends on, is painted from its beat."
                  : "Optional. Without a beat, a clip carries the story on from where the last one ended."}
            </p>
            <ol className="space-y-2">
              {plan.durations.map((seconds, index) => {
                const piece = voiced?.segments[index] ?? null;
                const from = piece ? piece.start : (starts[index] ?? 0);
                const to = piece ? piece.end : from + seconds;
                const words = voiced?.spoken[index] ?? "";
                const cutawayBefore =
                  piece && index > 0
                    ? voiced?.cutaways.find(
                        (item) =>
                          item.start >= (voiced.segments[index - 1]?.end ?? 0) - 1e-3 &&
                          item.end <= piece.start + SECTION_LEAD + 1e-3,
                      )
                    : null;
                return (
                  <li key={index} className="space-y-1">
                    {cutawayBefore && (
                      <p
                        className="rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground"
                        data-testid={`long-video-cutaway-${index}`}
                      >
                        B-roll · {voiceLength(cutawayBefore.start)}–{voiceLength(cutawayBefore.end)}{" "}
                        (no clip made)
                      </p>
                    )}
                    <Label
                      htmlFor={`long-video-beat-${index}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      Clip {index + 1} · {piece ? voiceLength(from) : formatLength(from)}–
                      {piece ? voiceLength(to) : formatLength(to)}
                      {piece ? ` · made ${seconds}s` : ""}
                      {index === 0 &&
                      !plan.keyframed &&
                      plan.continuation &&
                      plan.continuation.id !== model.id
                        ? ` · ${model.display_name}`
                        : ""}
                      {plan.characters.length > 1 && plan.planned[index]?.cast.length
                        ? ` · ${plan.planned[index]!.cast.map((id) => names.get(id) ?? "").join(", ")}`
                        : ""}
                    </Label>
                    {words && (
                      <p
                        className="line-clamp-2 text-[11px] italic text-muted-foreground"
                        data-testid={`long-video-spoken-${index}`}
                      >
                        “{words}”
                      </p>
                    )}
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
