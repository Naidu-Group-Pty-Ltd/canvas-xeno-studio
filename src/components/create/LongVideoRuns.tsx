import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Film,
  Flag,
  Loader2,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useAssetsById,
  useLongVideos,
  useNudgeStalledRuns,
  type LongVideoClipRow,
  type LongVideoRow,
} from "@/hooks/useLongVideos";
import {
  continueLongVideo,
  keepLongVideoClip,
  openLongVideoInEditor,
  redoLongVideoClip,
  retryLongVideoClip,
  stopLongVideo,
} from "@/lib/long-video.functions";
import { StoryboardPanel } from "@/components/create/StoryboardPanel";
import { endCardSize, storedFinale } from "@/lib/long-video/finisher";
import {
  FINALE_SECONDS,
  finaleHolds,
  finaleReveals,
  formatLength,
  PERSON_PAUSES,
  type RunFinale,
} from "@/lib/long-video/plan";
import { DEFAULT_END_CARD_STYLE, makeEndCard, type EndCardScene } from "@/lib/media/end-card";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const RUN_STATUS: Record<string, { label: string; tone: string }> = {
  running: { label: "Running", tone: "border-primary/40 text-primary" },
  needs_attention: { label: "Needs attention", tone: "border-warning/50 text-warning" },
  completed: { label: "Ready", tone: "border-success/50 text-success" },
  canceled: { label: "Stopped", tone: "border-border text-muted-foreground" },
};

/** Whether a run checks its clips against its characters. */
function checksCharacters(run: LongVideoRow): boolean {
  return run.identity_check === true && Array.isArray(run.characters) && run.characters.length > 0;
}

/** Checks that let a clip through. */
const SETTLED_CHECKS = new Set(["passed", "accepted", "unavailable", "skipped"]);

/** A clip is done once it's in, its next start frame taken and (with characters) its check settled. */
function clipDone(run: LongVideoRow, clip: LongVideoClipRow, isLast: boolean): boolean {
  return (
    clip.status === "completed" &&
    (clip.handoff_status === "ready" || (isLast && clip.handoff_status === "not_needed")) &&
    (!checksCharacters(run) || SETTLED_CHECKS.has(clip.check_status))
  );
}

/** What a clip is doing, in a few words. */
function clipState(run: LongVideoRow, clip: LongVideoClipRow, isLast: boolean): string {
  switch (clip.status) {
    case "waiting":
      return "Waiting";
    case "submitting":
      return "Starting";
    case "generating":
      return "Generating";
    case "failed":
      return "Failed";
    case "canceled":
      return "Stopped";
    default:
      if (clip.handoff_status === "ready" || (isLast && clip.handoff_status === "not_needed")) {
        if (!checksCharacters(run)) return "Done";
        if (clip.check_status === "flagged") return "Someone changed";
        if (clip.check_status === "passed") return "Done · checked";
        if (clip.check_status === "accepted") return "Done · kept";
        if (clip.check_status === "unavailable") return "Done · not checked";
        return "Checking characters";
      }
      if (clip.handoff_status === "failed") return "Frame failed";
      return isLast ? "Finishing" : "Preparing the next clip";
  }
}

/** The names of a run's characters, as it keeps them. */
function characterNames(run: LongVideoRow): string[] {
  return (Array.isArray(run.characters) ? run.characters : []).flatMap((entry) => {
    const name = (entry as Record<string, unknown> | null)?.["name"];
    return typeof name === "string" ? [name] : [];
  });
}

/** Long videos in progress and recently finished, with their clips. */
export function LongVideoRuns({ projectId }: { projectId: string | null }) {
  const { data: runs = [] } = useLongVideos({ projectId });
  if (!runs.length) return null;
  return (
    <section className="panel space-y-4 p-5" data-testid="long-video-runs">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-4 text-primary" />
        <h2 className="label-eyebrow">Long videos</h2>
      </div>
      <LongVideoRunList runs={runs} />
    </section>
  );
}

/** The images a run was started with (its finisher among them), by asset id. */
function runImages(run: LongVideoRow): string[] {
  return (Array.isArray(run.references_used) ? run.references_used : []).flatMap((entry) => {
    const id = (entry as Record<string, unknown> | null)?.["asset_id"];
    return typeof id === "string" ? [id] : [];
  });
}

/** A list of long videos, each with its clips and what can be done with it. */
export function LongVideoRunList({ runs }: { runs: LongVideoRow[] }) {
  const assetIds = runs.flatMap((run) => [
    ...run.clips.flatMap((clip) => (clip.output_asset_id ? [clip.output_asset_id] : [])),
    ...run.keyframes.flatMap((keyframe) => (keyframe.asset_id ? [keyframe.asset_id] : [])),
    ...runImages(run),
  ]);
  const { data: assets } = useAssetsById(assetIds);
  useNudgeStalledRuns(runs);
  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <RunCard key={run.id} run={run} assets={assets} />
      ))}
    </div>
  );
}

function RunCard({
  run,
  assets,
}: {
  run: LongVideoRow;
  assets: ReturnType<typeof useAssetsById>["data"];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<LongVideoClipRow | null>(null);
  const [redoingClip, setRedoingClip] = useState<LongVideoClipRow | null>(null);
  const [seam, setSeam] = useState<"cut" | "blend">("cut");
  const [keepSound, setKeepSound] = useState(true);
  // The end card: the run's finisher when it holds after the last clip; any
  // of its images (or none) can be chosen when opening it in the Editor.
  const finale = storedFinale(run.references_used);
  const cardImages = runImages(run).filter(
    (id, index, list) => list.indexOf(id) === index && assets?.get(id)?.asset_type === "image",
  );
  const defaultCard = finale && finaleHolds(finale.mode) ? finale.assetId : null;
  const [cardImage, setCardImage] = useState<string | null>(defaultCard);
  const [cardSeconds, setCardSeconds] = useState<number>(finale?.seconds ?? FINALE_SECONDS.default);
  const cardChanged =
    cardImage !== defaultCard ||
    (cardImage !== null && cardSeconds !== (finale?.seconds ?? FINALE_SECONDS.default));

  const canManage = !!user && (run.created_by === user.id || isAdmin);
  const finished = run.clips.filter((clip) => clip.status === "completed" && clip.output_asset_id);
  const status = RUN_STATUS[run.status] ?? RUN_STATUS["running"]!;
  const failedClip = run.clips.find((clip) => clip.status === "failed");
  const failedHandoff = run.clips.find((clip) => clip.handoff_status === "failed");
  const done = run.clips.filter((clip, index) =>
    clipDone(run, clip, index === run.clips.length - 1),
  ).length;
  // Waiting on a person's choice (keyframes to review, a keyframe to redo or
  // keep, a character who changed), and only while that is still so: a pause
  // that landed just after the choice was made is carried on with Continue.
  const personPause =
    run.status === "needs_attention" &&
    (PERSON_PAUSES as readonly string[]).includes(run.error_code ?? "") &&
    (run.error_code === "STORYBOARD_READY"
      ? !run.storyboard_approved_at
      : run.error_code === "KEYFRAME_FAILED"
        ? run.keyframes.some((keyframe) => keyframe.status === "failed")
        : run.error_code === "KEYFRAME_CHECK"
          ? run.keyframes.some((keyframe) => keyframe.check_status === "flagged")
          : run.clips.some((clip) => clip.check_status === "flagged"));
  const flaggedClip =
    run.error_code === "CHARACTER_CHECK"
      ? run.clips.find((clip) => clip.check_status === "flagged")
      : undefined;
  const names = characterNames(run);

  async function act(name: string, work: () => Promise<unknown>, success?: string) {
    setBusy(name);
    try {
      await work();
      if (success) toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["long_videos"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  /** The video's final moment, which a card held after it is laid out over. */
  function finalMoment(): EndCardScene | null {
    const last = run.clips.at(-1);
    if (!last || last.status !== "completed" || !last.output_asset_id) return null;
    if (last.handoff_status === "ready" && last.handoff_asset_id)
      return { kind: "image", source: { assetId: last.handoff_asset_id } };
    // Runs from before final frames were kept: read from the clip's video.
    const video = assets?.get(last.output_asset_id);
    return {
      kind: "video",
      source: {
        assetId: last.output_asset_id,
        bucket: video?.storage_bucket,
        path: video?.storage_path,
      },
    };
  }

  /**
   * The end card as chosen here, laid out at the video's shape; undefined for
   * the run's own (or to reopen its edit). A card the last clip moved into is
   * held as it is, so the two match; one held after the last clip is laid out
   * over the video's final moment, softly defocused.
   */
  async function chosenEndCard(fresh: boolean) {
    if (run.sequence_id && !fresh && !cardChanged) return undefined;
    if (!cardImage) return cardChanged || fresh ? null : undefined;
    const isFinisher = cardImage === finale?.assetId;
    const ownCard =
      isFinisher && finale?.frameAssetId
        ? { assetId: finale.frameAssetId, seconds: cardSeconds }
        : undefined;
    if (isFinisher && finale && finaleReveals(finale.mode))
      return cardChanged || fresh
        ? (ownCard ?? { assetId: cardImage, seconds: cardSeconds })
        : undefined;
    const style = (isFinisher ? finale?.style : null) ?? DEFAULT_END_CARD_STYLE;
    // Artwork extended to the video's shape fills the frame, so nothing of the
    // final moment would show around it: its own card is used as it is.
    const extended = isFinisher ? (finale?.sourceAssetId ?? null) : null;
    const scene =
      !extended && (style.background === "auto" || style.background === "scene")
        ? finalMoment()
        : null;
    if (!user || (!scene && ownCard)) return cardChanged || fresh ? ownCard : undefined;
    const sized = run.clips.find((clip) => clip.output_width && clip.output_height);
    const image = assets?.get(cardImage);
    try {
      const assetId = await makeEndCard({
        finisher: extended
          ? { assetId: extended }
          : { assetId: cardImage, bucket: image?.storage_bucket, path: image?.storage_path },
        size: endCardSize((run.settings ?? {}) as Record<string, unknown>, {
          width: sized?.output_width ?? null,
          height: sized?.output_height ?? null,
        }),
        style,
        scene,
        userId: user.id,
        projectId: run.project_id,
        title: run.title,
      });
      return { assetId, seconds: cardSeconds };
    } catch (error) {
      toast.warning(
        `The end card couldn't be laid out over the video's end (${error instanceof Error ? error.message : "it couldn't be saved"}), so the one made with the video is used.`,
      );
      return (
        ownCard ?? (cardChanged || fresh ? { assetId: cardImage, seconds: cardSeconds } : undefined)
      );
    }
  }

  async function openInEditor(fresh = false) {
    setBusy("editor");
    try {
      const endCard = await chosenEndCard(fresh);
      const result = await openLongVideoInEditor({
        data: {
          longVideoId: run.id,
          seam,
          keepSound,
          // A different end card makes a new edit, so the one made before stays as it is.
          fresh: fresh || (endCard !== undefined && !!run.sequence_id),
          ...(endCard !== undefined ? { endCard } : {}),
        },
      });
      if (result.missing.length)
        toast.message(`Opened ${finished.length} of ${run.clip_count} clips`, {
          description: `Not in yet: clip ${result.missing.map((position) => position + 1).join(", ")}.`,
        });
      void navigate({ to: "/editor/$sequenceId", params: { sequenceId: result.sequenceId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The edit could not be created");
    } finally {
      setBusy(null);
    }
  }

  const uncertain = retrying?.error_code === "SUBMISSION_UNCERTAIN";

  return (
    <div className="space-y-3 rounded-lg border border-border p-4" data-testid="long-video-run">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold">{run.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {run.clip_count} clips · {formatLength(Number(run.target_seconds))} ·{" "}
            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
          </p>
          {finale && (
            <p
              className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"
              data-testid="long-video-finale"
            >
              <Flag className="size-3 text-primary" /> {finaleSummary(finale)}
            </p>
          )}
          {names.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="long-video-cast">
              With {names.join(", ")}
              {checksCharacters(run) ? " · every clip checked" : ""}
            </p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0", personPause ? "border-primary/50 text-primary" : status.tone)}
          data-testid="long-video-status"
        >
          {run.error_code === "STORYBOARD_READY" && run.status === "needs_attention"
            ? "Review keyframes"
            : run.error_code === "KEYFRAME_CHECK" && run.status === "needs_attention"
              ? "Check a keyframe"
              : run.error_code === "CHARACTER_CHECK" && run.status === "needs_attention"
                ? "Check a clip"
                : run.keyframe_model_id && !run.storyboard_approved_at && run.status === "running"
                  ? "Painting keyframes"
                  : status.label}
        </Badge>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round((done / Math.max(1, run.clip_count)) * 100)}%` }}
        />
      </div>

      {run.keyframes.length > 0 && (
        <StoryboardPanel run={run} assets={assets} canManage={canManage} act={act} busy={busy} />
      )}

      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="long-video-clips">
        {run.clips.map((clip, index) => {
          const asset = clip.output_asset_id ? assets?.get(clip.output_asset_id) : undefined;
          const state = clipState(run, clip, index === run.clips.length - 1);
          return (
            <li
              key={clip.id}
              className="space-y-1"
              data-testid="long-video-clip"
              data-state={state}
            >
              <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-surface">
                {asset ? (
                  <MediaPreview
                    bucket={asset.storage_bucket}
                    path={asset.storage_path}
                    type="video"
                    contain
                    alt={`Clip ${index + 1}`}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    {clip.status === "failed" ? (
                      <AlertTriangle className="size-4 text-warning" />
                    ) : clip.status === "waiting" ? (
                      <Film className="size-4 opacity-40" />
                    ) : (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                  </div>
                )}
              </div>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {state.startsWith("Done") && <CheckCircle2 className="size-3 text-success" />}
                {state === "Someone changed" && <AlertTriangle className="size-3 text-warning" />}
                <span className="truncate">
                  {index + 1} · {state}
                </span>
              </p>
            </li>
          );
        })}
      </ol>

      {run.status === "needs_attention" && run.error_message && (
        <p
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
          data-testid="long-video-problem"
        >
          {run.error_message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {finished.length > 0 && (
          <>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void openInEditor()}
              data-testid="long-video-open-editor"
            >
              {busy === "editor" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 size-3.5" />
              )}
              {run.sequence_id
                ? "Open edit"
                : run.status === "completed"
                  ? "Open in Editor"
                  : `Open ${finished.length} finished clip${finished.length === 1 ? "" : "s"} in Editor`}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground">
                  Edit options
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3 text-xs">
                <div className="space-y-1.5">
                  <p className="font-medium">Joins between clips</p>
                  {(
                    [
                      [
                        "cut",
                        "Seamless cut",
                        "Each clip plays to the frame the next one starts from, and the next carries straight on, its colour eased to match.",
                      ],
                      [
                        "blend",
                        "Soft blend",
                        "The same, with a brief dissolve at each join to soften any jump.",
                      ],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSeam(value)}
                      className={cn(
                        "block w-full rounded-md border px-2.5 py-1.5 text-left",
                        seam === value ? "border-primary/60 bg-primary/10" : "border-border",
                      )}
                    >
                      <span className="block font-medium">{label}</span>
                      <span className="block text-[11px] text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`keep-sound-${run.id}`} className="text-xs">
                    Keep the clips' generated sound
                  </Label>
                  <Switch
                    id={`keep-sound-${run.id}`}
                    checked={keepSound}
                    onCheckedChange={setKeepSound}
                  />
                </div>
                {cardImages.length > 0 && (
                  <div className="space-y-1.5" data-testid="long-video-end-card">
                    <p className="font-medium">End card</p>
                    <p className="text-[11px] text-muted-foreground">
                      Held after the last clip, laid out for the video's shape: a logo over the
                      video's final moment, softly defocused; artwork with its own background
                      carried to the frame's edges.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCardImage(null)}
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-md border text-[10px]",
                          cardImage === null
                            ? "border-primary/60 bg-primary/10"
                            : "border-border text-muted-foreground",
                        )}
                        aria-pressed={cardImage === null}
                      >
                        None
                      </button>
                      {cardImages.map((id, index) => {
                        const image = assets?.get(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setCardImage(id)}
                            className={cn(
                              "relative h-12 w-12 overflow-hidden rounded-md border bg-surface",
                              cardImage === id
                                ? "border-primary ring-2 ring-primary/40"
                                : "border-border",
                            )}
                            aria-pressed={cardImage === id}
                            aria-label={`End on image ${index + 1}${id === finale?.assetId ? " (the finisher)" : ""}`}
                            title={image?.title ?? undefined}
                          >
                            {image && (
                              <MediaPreview
                                bucket={image.storage_bucket}
                                path={image.storage_path}
                                type="image"
                                contain
                                alt={`Image ${index + 1}`}
                              />
                            )}
                            {id === finale?.assetId && (
                              <Flag className="absolute top-0.5 right-0.5 size-3 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {cardImage && (
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Hold for</Label>
                        <Select
                          value={String(cardSeconds)}
                          onValueChange={(value) => setCardSeconds(Number(value))}
                        >
                          <SelectTrigger className="h-8 w-24" aria-label="End card length">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from(
                              { length: FINALE_SECONDS.max - FINALE_SECONDS.min + 1 },
                              (_, index) => FINALE_SECONDS.min + index,
                            ).map((seconds) => (
                              <SelectItem key={seconds} value={String(seconds)}>
                                {seconds}s
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                {run.sequence_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() => void openInEditor(true)}
                  >
                    Make a new edit with these options
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </>
        )}

        {canManage && run.status === "needs_attention" && flaggedClip && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setRedoingClip(flaggedClip)}
              data-testid="long-video-redo-clip"
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Redo clip {flaggedClip.position + 1}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                void act(
                  "keep",
                  () => keepLongVideoClip({ data: { clipId: flaggedClip.id } }),
                  "Kept. Carrying on.",
                )
              }
              data-testid="long-video-keep-clip"
            >
              Keep it and carry on
            </Button>
          </>
        )}
        {canManage &&
          run.status === "needs_attention" &&
          failedClip &&
          failedClip.error_code !== "KEYFRAME_MISSING" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setRetrying(failedClip)}
              data-testid="long-video-retry"
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Retry clip {failedClip.position + 1}
            </Button>
          )}
        {canManage &&
          (run.status === "canceled" ||
            (run.status === "needs_attention" && !failedClip && !personPause)) &&
          done < run.clip_count && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void act(
                  "continue",
                  () => continueLongVideo({ data: { longVideoId: run.id } }),
                  failedHandoff ? "Taking the start frame again." : "Carrying on.",
                )
              }
              data-testid="long-video-continue"
            >
              {busy === "continue" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 size-3.5" />
              )}
              Continue
            </Button>
          )}
        {canManage && (run.status === "running" || run.status === "needs_attention") && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-xs text-muted-foreground"
            disabled={busy !== null}
            onClick={() =>
              void act(
                "stop",
                () => stopLongVideo({ data: { longVideoId: run.id } }),
                "Stopped. A clip already generating still finishes and is saved.",
              )
            }
            data-testid="long-video-stop"
          >
            <Square className="mr-1.5 size-3" /> Stop
          </Button>
        )}
      </div>

      <AlertDialog open={!!redoingClip} onOpenChange={(open) => !open && setRedoingClip(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make clip {(redoingClip?.position ?? 0) + 1} again?</AlertDialogTitle>
            <AlertDialogDescription>
              It's made again as a new generation, charged like any other, from the same start
              {run.keyframe_model_id ? " and keyframe" : " frame"}, and checked again. The clip you
              have now stays in the library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const clip = redoingClip;
                setRedoingClip(null);
                if (clip)
                  void act(
                    "redo-clip",
                    () => redoLongVideoClip({ data: { clipId: clip.id } }),
                    `Clip ${clip.position + 1} is being made again.`,
                  );
              }}
            >
              Make it again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!retrying} onOpenChange={(open) => !open && setRetrying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry clip {(retrying?.position ?? 0) + 1}?</AlertDialogTitle>
            <AlertDialogDescription>
              {uncertain
                ? "Higgsfield's answer to the last attempt was unclear, so it may still be making that clip. Check Activity first: retrying runs it again as a new generation, and you could be charged twice."
                : "This runs the clip again as a new generation, charged like any other. The video then carries on from where it stopped."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const clip = retrying;
                setRetrying(null);
                if (clip)
                  void act(
                    "retry",
                    () =>
                      retryLongVideoClip({
                        data: { clipId: clip.id, confirmUncertain: uncertain },
                      }),
                    `Clip ${clip.position + 1} is being made again.`,
                  );
              }}
            >
              {uncertain ? "Retry anyway" : "Retry clip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** How a run ends on its finisher, in a few words. */
function finaleSummary(finale: RunFinale): string {
  if (finale.mode === "end_card") return `Ends on its end card, held ${finale.seconds}s`;
  if (finaleReveals(finale.mode) && finaleHolds(finale.mode))
    return `The last clip moves into its end card, held ${finale.seconds}s`;
  return "The last clip moves into its end card";
}
