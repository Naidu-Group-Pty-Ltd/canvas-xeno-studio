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
  const allIn = run.keyframes.every((keyframe) => keyframe.status === "completed");
  const unitUsd = storedKeyframeSettings(run.keyframe_settings)?.unitUsd ?? null;
  const uncertain = redoing?.error_code === "SUBMISSION_UNCERTAIN";
  // A keyframe can be painted again until the clip that ends on it has started.
  const redoable = (keyframe: LongVideoKeyframeRow) => {
    if (keyframe.provided || !canManage) return false;
    if (["submitting", "generating", "sizing"].includes(keyframe.status)) return false;
    const clip = run.clips.find((entry) => entry.position === Math.max(0, keyframe.position - 1));
    return !clip || clip.status === "waiting" || clip.error_code === "KEYFRAME_MISSING";
  };
  const redoCount = redoing
    ? scope === "rest"
      ? run.keyframes.filter(
          (keyframe) => keyframe.position >= redoing.position && !keyframe.provided,
        ).length
      : 1
    : 0;

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
            {allIn ? "Make the video" : "Painting the keyframes…"}
          </Button>
        )}
      </div>
      {waiting && (
        <p className="text-[11px] text-muted-foreground">
          Look them over: redo any that's off (say what to change), keep any the check flagged if
          it's right, then make the video. The clips are billed as they're made.
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
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    {keyframe.status === "failed" ? (
                      <AlertTriangle className="size-4 text-warning" />
                    ) : keyframe.status === "waiting" ? (
                      <Film className="size-4 opacity-40" />
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
                        void act("keep", () => keepKeyframe({ data: { keyframeId: keyframe.id } }))
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
                      onChange={() => setScope(value)}
                      className="mt-0.5"
                    />
                    {label}
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
