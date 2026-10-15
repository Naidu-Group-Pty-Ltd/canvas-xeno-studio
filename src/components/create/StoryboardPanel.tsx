import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, Film, Loader2, RotateCcw } from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import type { LongVideoKeyframeRow, LongVideoRow } from "@/hooks/useLongVideos";
import { approveStoryboard, keepKeyframe, redoKeyframes } from "@/lib/long-video.functions";
import { storedKeyframeSettings } from "@/lib/long-video/keyframes";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

/** What a keyframe is doing, in a few words. */
function keyframeState(keyframe: LongVideoKeyframeRow): string {
  switch (keyframe.status) {
    case "waiting":
      return "Waiting";
    case "submitting":
    case "generating":
      return "Painting";
    case "sizing":
      return "Framing";
    case "failed":
      return "Didn't come back";
    default:
      if (keyframe.provided) return "Your image";
      switch (keyframe.check_status) {
        case "checking":
          return "Checking";
        case "passed":
          return "Looks right";
        case "flagged":
          return "Looks different";
        case "accepted":
          return "Kept";
        case "unavailable":
          return "Not checked";
        default:
          return "Ready";
      }
  }
}

function summaryOf(keyframe: LongVideoKeyframeRow): string | null {
  const result = (keyframe.check_result ?? null) as { summary?: string | null } | null;
  return result?.summary ?? null;
}

/** Keyframe states still on their way. */
const ACTIVE = new Set(["submitting", "generating", "sizing"]);

/** "Opening", "End of clip 2"…: what each keyframe is. */
function keyframeName(keyframe: Pick<LongVideoKeyframeRow, "position">): string {
  return keyframe.position === 0 ? "Opening" : `End of clip ${keyframe.position}`;
}

/**
 * A keyframed run's storyboard: the opening frame and the frame each clip
 * ends on, painted first. While it waits for review, each can be painted
 * again (with a note on what to change) or kept when the check flagged it,
 * and the video is made once they look right.
 */
export function StoryboardPanel({
  run,
  assets,
  canManage,
  act,
  busy,
}: {
  run: LongVideoRow;
  assets: Map<string, AssetRow> | undefined;
  canManage: boolean;
  act: (name: string, work: () => Promise<unknown>, success?: string) => Promise<void>;
  busy: string | null;
}) {
  const [redoing, setRedoing] = useState<LongVideoKeyframeRow | null>(null);
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<"one" | "rest">("one");
  const approved = !!run.storyboard_approved_at;
  const waiting = run.status === "needs_attention" && run.error_code === "STORYBOARD_READY";
  // Stopped on a keyframe the check flagged, before the rest are painted from it.
  const flaggedStop =
    run.status === "needs_attention" &&
    run.error_code === "KEYFRAME_CHECK" &&
    run.keyframes.some((keyframe) => keyframe.check_status === "flagged");
  // Checks the run makes of its keyframes (none without characters, or with the check off).
  const checks = run.identity_check && Array.isArray(run.characters) && run.characters.length > 0;
  const settled = (keyframe: LongVideoKeyframeRow) =>
    keyframe.status === "completed" &&
    (keyframe.provided ||
      !checks ||
      ["passed", "accepted", "unavailable", "skipped", "flagged"].includes(keyframe.check_status));
  const allIn = run.keyframes.length > 0 && run.keyframes.every(settled);
  const anyFailed = run.keyframes.some((keyframe) => keyframe.status === "failed");
  const painting = run.keyframes.some((keyframe) => ACTIVE.has(keyframe.status));
  const unitUsd = storedKeyframeSettings(run.keyframe_settings)?.unitUsd ?? null;
  // A keyframe can be painted again (once it has been) until the clip that
  // starts or ends on it has started, and not while the video is stopped.
  const redoable = (keyframe: LongVideoKeyframeRow) => {
    if (keyframe.provided || !canManage || run.status === "canceled") return false;
    if (keyframe.status !== "completed" && keyframe.status !== "failed") return false;
    const clip = run.clips.find((entry) => entry.position === Math.max(0, keyframe.position - 1));
    return !clip || !["submitting", "generating", "completed"].includes(clip.status);
  };
  // What a redo would paint again: this one, or it and every one after it.
  const range = redoing
    ? run.keyframes.filter((keyframe) =>
        scope === "rest"
          ? keyframe.position >= redoing.position && !keyframe.provided
          : keyframe.id === redoing.id,
      )
    : [];
  const redoCount = range.length;
  // Any of them may still be painting at Higgsfield (an unclear answer): confirmed first.
  const uncertain = range.some(
    (keyframe) => keyframe.status === "failed" && keyframe.error_code === "SUBMISSION_UNCERTAIN",
  );
  // The ones after it can be painted again only once none of them is being painted.
  const laterPainting = redoing
    ? run.keyframes.some(
        (keyframe) => keyframe.position > redoing.position && ACTIVE.has(keyframe.status),
      )
    : false;

  return (
    <div
      className="space-y-2 rounded-md border border-border p-3"
      data-testid="long-video-storyboard"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Clapperboard className="size-3.5 text-primary" />
          Keyframes
          {approved && (
            <Badge variant="outline" className="border-success/50 text-[10px] text-success">
              Approved
            </Badge>
          )}
        </p>
        {canManage && !approved && (
          <Button
            size="sm"
            disabled={!allIn || busy !== null}
            onClick={() =>
              void act(
                "approve",
                () => approveStoryboard({ data: { longVideoId: run.id } }),
                "Making the video: each clip moves into its keyframe.",
              )
            }
            data-testid="long-video-approve"
          >
            {busy === "approve" ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Film className="mr-1.5 size-3.5" />
            )}
            {allIn
              ? "Make the video"
              : anyFailed
                ? "Redo the keyframe that didn't come back"
                : flaggedStop
                  ? "Redo or keep the flagged keyframe"
                  : painting
                    ? "Painting the keyframes…"
                    : run.status === "canceled"
                      ? "Stopped: continue to paint the rest"
                      : "Checking the keyframes…"}
          </Button>
        )}
      </div>
      {waiting && (
        <p className="text-[11px] text-muted-foreground">
          Look them over: redo any that's off (say what to change), keep any the check flagged if
          it's right, then make the video. The clips are billed as they're made.
        </p>
      )}
      {flaggedStop && (
        <p className="text-[11px] text-muted-foreground">
          The check flagged a keyframe, so the rest wait: each is painted from the one before. Redo
          it (say what to change), or keep it if it's right, and the rest are painted from it.
        </p>
      )}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {run.keyframes.map((keyframe) => {
          const image = keyframe.asset_id ? assets?.get(keyframe.asset_id) : undefined;
          const state = keyframeState(keyframe);
          const flagged = keyframe.check_status === "flagged";
          const summary = summaryOf(keyframe);
          return (
            <li
              key={keyframe.id}
              className="space-y-1"
              data-testid="long-video-keyframe"
              data-state={state}
            >
              <div
                className={cn(
                  "relative aspect-video overflow-hidden rounded-md border bg-surface",
                  flagged ? "border-warning/60" : "border-border",
                )}
              >
                {image ? (
                  <MediaPreview
                    bucket={image.storage_bucket}
                    path={image.storage_path}
                    type="image"
                    contain
                    alt={keyframeName(keyframe)}
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    {keyframe.status === "failed" ? (
                      <AlertTriangle className="size-4 text-warning" />
                    ) : keyframe.status === "waiting" ? (
                      <Film className="size-4 opacity-40" />
                    ) : keyframe.status === "completed" && assets && keyframe.asset_id ? (
                      // Painted, but its image has since been deleted from the library.
                      <>
                        <AlertTriangle className="size-4 text-warning" />
                        <span className="px-2 text-center text-[10px]">
                          Deleted from the library
                        </span>
                      </>
                    ) : (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                  </div>
                )}
              </div>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {state === "Looks right" && <CheckCircle2 className="size-3 text-success" />}
                {flagged && <AlertTriangle className="size-3 text-warning" />}
                <span className="truncate">
                  {keyframeName(keyframe)} · {state}
                </span>
              </p>
              {flagged && summary && (
                <p className="text-[10px] leading-snug text-warning">{summary}</p>
              )}
              {keyframe.status === "failed" && keyframe.error_message && (
                <p className="line-clamp-3 text-[10px] leading-snug text-warning">
                  {keyframe.error_message}
                </p>
              )}
              {canManage && (redoable(keyframe) || flagged) && (
                <div className="flex gap-1">
                  {redoable(keyframe) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 flex-1 px-1.5 text-[10px]"
                      disabled={busy !== null}
                      onClick={() => {
                        setNote("");
                        setScope("one");
                        setRedoing(keyframe);
                      }}
                    >
                      <RotateCcw className="mr-1 size-3" /> Redo
                    </Button>
                  )}
                  {flagged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 flex-1 px-1.5 text-[10px]"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(
                          "keep",
                          () => keepKeyframe({ data: { keyframeId: keyframe.id } }),
                          flaggedStop ? "Kept: the rest are painted from it." : undefined,
                        )
                      }
                    >
                      Keep
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <AlertDialog open={!!redoing} onOpenChange={(open) => !open && setRedoing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Paint {redoing ? keyframeName(redoing).toLowerCase() : ""} again?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uncertain
                ? "Higgsfield's answer to the last try was unclear, so it may still be painting it. Check Activity first: painting again may be charged twice. "
                : ""}
              Each keyframe is a new image, billed like any other
              {unitUsd !== null ? ` (about $${unitUsd.toFixed(2)})` : ""}. The video waits for you
              to approve the keyframes again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="keyframe-note" className="text-xs">
                What to change (optional)
              </Label>
              <Textarea
                id="keyframe-note"
                rows={2}
                maxLength={1000}
                value={note}
                placeholder="e.g. Mia faces the camera; keep the window light on the left"
                onChange={(event) => setNote(event.target.value)}
                className="text-xs"
              />
            </div>
            {redoing && redoing.position < run.keyframes.length - 1 && (
              <div className="space-y-1.5 text-xs">
                {(
                  [
                    ["one", "Just this one"],
                    [
                      "rest",
                      "This one and every one after it (each is painted from the one before)",
                    ],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="keyframe-scope"
                      checked={scope === value}
                      disabled={value === "rest" && laterPainting}
                      onChange={() => setScope(value)}
                      className="mt-0.5"
                    />
                    {label}
                    {value === "rest" && laterPainting ? " (once the ones after it are in)" : ""}
                  </label>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const keyframe = redoing;
                setRedoing(null);
                if (keyframe)
                  void act(
                    "redo",
                    () =>
                      redoKeyframes({
                        data: {
                          keyframeId: keyframe.id,
                          scope,
                          note,
                          confirmUncertain: uncertain,
                        },
                      }),
                    redoCount > 1 ? `Painting ${redoCount} keyframes again.` : "Painting it again.",
                  );
              }}
            >
              {uncertain
                ? "Paint again anyway"
                : redoCount > 1
                  ? `Paint ${redoCount} again`
                  : "Paint it again"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
