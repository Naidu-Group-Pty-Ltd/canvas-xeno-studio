import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Film,
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
  openLongVideoInEditor,
  retryLongVideoClip,
  stopLongVideo,
} from "@/lib/long-video.functions";
import { formatLength } from "@/lib/long-video/plan";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** What a clip is doing, in a few words. */
function clipState(clip: LongVideoClipRow, isLast: boolean): string {
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
      if (clip.handoff_status === "ready" || (isLast && clip.handoff_status === "not_needed"))
        return "Done";
      if (clip.handoff_status === "failed") return "Frame failed";
      return isLast ? "Measuring" : "Taking next start frame";
  }
}

/** Long videos in progress and recently finished, with their clips. */
export function LongVideoRuns({ projectId }: { projectId: string | null }) {
  const { data: runs = [] } = useLongVideos({ projectId });
  const assetIds = runs.flatMap((run) =>
    run.clips.flatMap((clip) => (clip.output_asset_id ? [clip.output_asset_id] : [])),
  );
  const { data: assets } = useAssetsById(assetIds);
  useNudgeStalledRuns(runs);

  if (!runs.length) return null;
  return (
    <section className="panel space-y-4 p-5" data-testid="long-video-runs">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-4 text-primary" />
        <h2 className="label-eyebrow">Long videos</h2>
      </div>
      <div className="space-y-4">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} assets={assets} />
        ))}
      </div>
    </section>
  );
}

export function RunCard({
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
  const [seam, setSeam] = useState<"cut" | "blend">("cut");
  const [keepSound, setKeepSound] = useState(true);

  const canManage = !!user && (run.created_by === user.id || isAdmin);
  const finished = run.clips.filter((clip) => clip.status === "completed" && clip.output_asset_id);
  const status = RUN_STATUS[run.status] ?? RUN_STATUS["running"]!;
  const failedClip = run.clips.find((clip) => clip.status === "failed");
  const failedHandoff = run.clips.find((clip) => clip.handoff_status === "failed");
  const done = run.clips.filter(
    (clip, index) =>
      clip.status === "completed" &&
      (clip.handoff_status === "ready" ||
        (index === run.clips.length - 1 && clip.handoff_status === "not_needed")),
  ).length;

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

  async function openInEditor(fresh = false) {
    setBusy("editor");
    try {
      const result = await openLongVideoInEditor({
        data: { longVideoId: run.id, seam, keepSound, fresh },
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
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0", status.tone)}
          data-testid="long-video-status"
        >
          {status.label}
        </Badge>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round((done / Math.max(1, run.clip_count)) * 100)}%` }}
        />
      </div>

      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="long-video-clips">
        {run.clips.map((clip, index) => {
          const asset = clip.output_asset_id ? assets?.get(clip.output_asset_id) : undefined;
          const state = clipState(clip, index === run.clips.length - 1);
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
                {state === "Done" && <CheckCircle2 className="size-3 text-success" />}
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
                        "Each clip ends on the frame the next one starts from.",
                      ],
                      [
                        "blend",
                        "Soft blend",
                        "A brief cross-fade over the footage both clips share.",
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

        {canManage && run.status === "needs_attention" && failedClip && (
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
          (run.status === "canceled" || (run.status === "needs_attention" && !failedClip)) &&
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
