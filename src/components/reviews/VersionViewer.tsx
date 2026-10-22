import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Crosshair, Loader2, MessageSquare, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReviewAction } from "@/hooks/useReviews";
import { useSignedUrl } from "@/components/studio/MediaPreview";
import { formatTime } from "@/lib/edit/timeline";
import { versionName } from "@/lib/reviews/gates";
import {
  addComment,
  deleteComment,
  type ReviewComment,
  type ReviewFile,
  type ReviewVersion,
} from "@/lib/reviews/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A version's frame rate: its render's, else its video's as the library measured it, else 30. */
function versionFps(version: ReviewVersion, files: ReviewFile[]): number {
  if (version.snapshot?.kind === "render") return version.snapshot.fps;
  return files.find((file) => file.asset?.fps)?.asset?.fps ?? 30;
}

/** "0:12.4 · frame 372 · a point · Style frame 06 · shot 04.1": where a comment is pinned. */
function pinText(
  comment: ReviewComment,
  files: ReviewFile[],
  shots: { id: string; label: string }[],
): string {
  const parts: string[] = [];
  if (comment.at_seconds !== null) parts.push(formatTime(comment.at_seconds));
  if (comment.frame !== null) parts.push(`frame ${comment.frame}`);
  if (comment.x !== null) parts.push("a point");
  const file = files.find((entry) => entry.id === comment.file_id);
  if (file && files.length > 1)
    parts.push(file.asset?.title ?? file.title ?? `file ${file.position + 1}`);
  const shot = shots.find((entry) => entry.id === comment.shot_id);
  if (shot) parts.push(`shot ${shot.label}`);
  return parts.join(" · ");
}

/**
 * Where a render's review sheet (a picture of every shot's beats beside the
 * brief) and its measurements (proposals G2 and G1) will show once renders
 * have them: kept as one place, beside the render being reviewed, so they
 * land where a reviewer looks. Nothing until then.
 */
export function RenderSheetSlot(_props: { renderId: string | null; versionId: string }) {
  return null;
}

interface Point {
  x: number;
  y: number;
}

/** One file of a version, large: a still to pin a point on, or a video to pin a time and point on. */
function Stage({
  file,
  pins,
  point,
  pinning,
  onPoint,
  videoRef,
  onTime,
}: {
  file: ReviewFile;
  pins: (Point & { id: string; title: string })[];
  point: Point | null;
  pinning: boolean;
  onPoint: (point: Point) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTime: (seconds: number) => void;
}) {
  const url = useSignedUrl(file.asset?.storage_bucket, file.asset?.storage_path);
  if (!file.asset)
    return (
      <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
        {file.title ?? "This file"} is no longer in the library.
      </p>
    );
  if (!url) return <Skeleton className="mx-auto aspect-[9/16] max-h-[60vh] w-64" />;
  const pinAt = (event: React.MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    onPoint({
      x: Number(clamp((event.clientX - box.left) / box.width).toFixed(4)),
      y: Number(clamp((event.clientY - box.top) / box.height).toFixed(4)),
    });
  };
  return (
    <div className="relative mx-auto w-fit max-w-full">
      {file.asset.asset_type === "image" ? (
        <img
          src={url}
          alt={file.asset.title ?? "Version file"}
          className="block max-h-[60vh] w-auto max-w-full cursor-crosshair rounded-md"
          onClick={pinAt}
        />
      ) : (
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          preload="metadata"
          className="block max-h-[60vh] w-auto max-w-full rounded-md"
          onTimeUpdate={(event) => onTime(event.currentTarget.currentTime)}
          onSeeked={(event) => onTime(event.currentTarget.currentTime)}
        />
      )}
      {pinning && (
        // Over a video, a click marks a point instead of playing it.
        <button
          type="button"
          aria-label="Mark a point on the picture"
          className="absolute inset-0 cursor-crosshair rounded-md bg-primary/5 ring-2 ring-primary/50"
          onClick={pinAt}
        />
      )}
      {pins.map((pin) => (
        <span
          key={pin.id}
          title={pin.title}
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
        />
      ))}
      {point && (
        <span
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-warning shadow"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        />
      )}
    </div>
  );
}

/**
 * A version as it is reviewed: its files (a strip of stills, a video, a
 * render) or a storyboard's shots, the comments pinned to it, and a box to
 * add one, pinned to the moment and the point it is about.
 */
export function VersionViewer({
  projectId,
  version,
  files,
  comments,
  people,
  userId,
  isAdmin,
}: {
  projectId: string;
  version: ReviewVersion;
  files: ReviewFile[];
  comments: ReviewComment[];
  people: Record<string, string>;
  userId: string | null;
  isAdmin: boolean;
}) {
  const act = useReviewAction(projectId);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [time, setTime] = useState(0);
  const [point, setPoint] = useState<Point | null>(null);
  const [pinning, setPinning] = useState(false);
  const [atTime, setAtTime] = useState(true);
  const [shotId, setShotId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setFileIndex(0);
    setPoint(null);
    setShotId(null);
    setTime(0);
  }, [version.id]);

  const file = files[fileIndex] ?? null;
  const isVideo = file?.asset?.asset_type === "video";
  const fps = versionFps(version, files);
  const shots = version.snapshot?.kind === "storyboard" ? version.snapshot.shots : [];
  const ordered = useMemo(
    () => [...comments].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [comments],
  );
  // The pins on what is on screen: this file, and for a video, near this moment.
  const pins = ordered
    .filter(
      (comment) =>
        comment.x !== null &&
        comment.y !== null &&
        (files.length <= 1 || comment.file_id === file?.id) &&
        (!isVideo || comment.at_seconds === null || Math.abs(comment.at_seconds - time) < 0.25),
    )
    .map((comment) => ({ id: comment.id, x: comment.x!, y: comment.y!, title: comment.body }));
  const duration = videoRef.current?.duration || file?.asset?.duration_seconds || 0;

  async function post() {
    if (!userId || !body.trim()) return;
    setPosting(true);
    const seconds = isVideo && atTime ? Number(time.toFixed(3)) : null;
    const ok = await act(
      () =>
        addComment(supabase, {
          versionId: version.id,
          userId,
          via: "app",
          body,
          atSeconds: seconds,
          frame: seconds === null ? null : Math.floor(seconds * fps + 1e-6),
          point,
          fileId: files.length > 1 ? (file?.id ?? null) : null,
          shotId,
        }),
      "Comment added.",
    );
    setPosting(false);
    if (ok) {
      setBody("");
      setPoint(null);
    }
  }

  return (
    <div className="space-y-3">
      {version.kind === "storyboard" ? (
        <StoryboardShots version={version} />
      ) : (
        <>
          {files.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-slim" role="list">
              {files.map((entry, index) => (
                <FileThumb
                  key={entry.id}
                  file={entry}
                  active={index === fileIndex}
                  count={comments.filter((comment) => comment.file_id === entry.id).length}
                  onClick={() => {
                    setFileIndex(index);
                    setPoint(null);
                  }}
                />
              ))}
            </div>
          )}
          {file ? (
            <Stage
              file={file}
              pins={pins}
              point={point}
              pinning={pinning}
              onPoint={(next) => {
                setPoint(next);
                setPinning(false);
              }}
              videoRef={videoRef}
              onTime={setTime}
            />
          ) : (
            <p className="text-sm text-muted-foreground">This version has no files.</p>
          )}
          {isVideo && duration > 0 && (
            <div
              className="relative mx-auto h-3 max-w-xl rounded-full bg-surface-raised"
              aria-label="Comments along the video"
            >
              {ordered
                .filter((comment) => comment.at_seconds !== null)
                .map((comment) => (
                  <button
                    key={comment.id}
                    type="button"
                    title={`${formatTime(comment.at_seconds!)}: ${comment.body}`}
                    className="absolute top-0 size-3 -translate-x-1/2 rounded-full bg-primary/80 hover:bg-primary"
                    style={{ left: `${Math.min(100, (comment.at_seconds! / duration) * 100)}%` }}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = comment.at_seconds!;
                    }}
                  />
                ))}
            </div>
          )}
          {version.kind === "render" && (
            <RenderSheetSlot renderId={version.render_id} versionId={version.id} />
          )}
        </>
      )}

      <div className="space-y-2 rounded-lg border border-border p-3">
        <Textarea
          rows={2}
          value={body}
          placeholder={`A comment on ${versionName(version)}`}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {isVideo && (
            <label className="flex items-center gap-1.5">
              <Checkbox checked={atTime} onCheckedChange={(value) => setAtTime(value === true)} />
              At {formatTime(time)} (frame {Math.floor(time * fps + 1e-6)})
            </label>
          )}
          {file && version.kind !== "storyboard" && (
            <span className="flex items-center gap-1.5">
              {point ? (
                <>
                  At the point marked
                  <button type="button" aria-label="Clear the point" onClick={() => setPoint(null)}>
                    <X className="size-3.5" />
                  </button>
                </>
              ) : isVideo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => {
                    videoRef.current?.pause();
                    setPinning(true);
                  }}
                >
                  <Crosshair className="mr-1 size-3.5" /> Mark a point
                </Button>
              ) : (
                "Click the picture to mark a point"
              )}
            </span>
          )}
          {shots.length > 0 && (
            <Select
              value={shotId ?? "none"}
              onValueChange={(value) => setShotId(value === "none" ? null : value)}
            >
              <SelectTrigger className="h-7 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No particular shot</SelectItem>
                {shots.map((shot) => (
                  <SelectItem key={shot.id} value={shot.id}>
                    {shot.label} · {shot.name.replace(`${shot.label} · `, "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!body.trim() || posting || !userId}
            onClick={() => void post()}
          >
            {posting ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <MessageSquare className="mr-1.5 size-3.5" />
            )}
            Comment
          </Button>
        </div>
      </div>

      {ordered.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {ordered.map((comment) => {
            const pinned = pinText(comment, files, shots);
            return (
              <li key={comment.id} className="group flex gap-3 px-3 py-2 text-sm">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    const index = files.findIndex((entry) => entry.id === comment.file_id);
                    if (index >= 0) setFileIndex(index);
                    if (comment.at_seconds !== null && videoRef.current)
                      videoRef.current.currentTime = comment.at_seconds;
                  }}
                >
                  {pinned && <span className="mr-2 font-mono text-xs text-primary">{pinned}</span>}
                  <span className="whitespace-pre-wrap">{comment.body}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {(comment.created_by && people[comment.created_by]) || "A teammate"} ·{" "}
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    {comment.via === "api" ? " · through the API" : ""}
                  </span>
                </button>
                {(comment.created_by === userId || isAdmin) && (
                  <button
                    type="button"
                    aria-label="Take back this comment"
                    className="self-start text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    onClick={() => void act(() => deleteComment(supabase, comment.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileThumb({
  file,
  active,
  count,
  onClick,
}: {
  file: ReviewFile;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const url = useSignedUrl(file.asset?.storage_bucket, file.asset?.storage_path);
  return (
    <button
      type="button"
      role="listitem"
      title={file.asset?.title ?? file.title ?? undefined}
      onClick={onClick}
      className={cn(
        "relative h-20 w-12 shrink-0 overflow-hidden rounded border bg-surface",
        active
          ? "border-primary ring-2 ring-primary/40"
          : "border-border opacity-80 hover:opacity-100",
      )}
    >
      {url && file.asset?.asset_type === "image" ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
          {file.position + 1}
        </span>
      )}
      {count > 0 && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-primary px-1 text-[9px] text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

/** A storyboard version: its shots as they stood, each with its time. */
function StoryboardShots({ version }: { version: ReviewVersion }) {
  const snapshot = version.snapshot?.kind === "storyboard" ? version.snapshot : null;
  if (!snapshot)
    return <p className="text-sm text-muted-foreground">This storyboard's shots weren't kept.</p>;
  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border scroll-slim">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface text-left text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-normal">Shot</th>
            <th className="px-2 py-1.5 font-normal">From</th>
            <th className="px-2 py-1.5 font-normal">Length</th>
            <th className="px-2 py-1.5 font-normal">Starts on</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.shots.map((shot) => (
            <tr key={shot.id} className="border-t border-border/60 align-top">
              <td className="px-2 py-1.5">{shot.name}</td>
              <td className="px-2 py-1.5 font-mono">{formatTime(shot.start)}</td>
              <td className="px-2 py-1.5 font-mono">{(shot.end - shot.start).toFixed(2)} s</td>
              <td className="px-2 py-1.5 text-muted-foreground">{shot.cue ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
        Times are{" "}
        {snapshot.clock === "voice"
          ? "timed from the voiceover"
          : snapshot.clock === "brief"
            ? "the brief's own"
            : "the shots' lengths, end to end"}
        .
      </p>
    </div>
  );
}
