import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { useSignedUrl } from "@/components/studio/MediaPreview";
import { formatTime } from "@/lib/edit/timeline";
import { versionName } from "@/lib/reviews/gates";
import type { ReviewFile, ReviewVersion } from "@/lib/reviews/store";
import type { SnapshotShot } from "@/lib/reviews/snapshot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Two versions of a gate side by side: stills next to each other or under a
 * wipe, videos playing together on one clock (the second cut against the
 * third), a storyboard's shots against another's.
 */
export function CompareVersions({
  open,
  onOpenChange,
  versions,
  files,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The gate's versions, newest first. */
  versions: ReviewVersion[];
  files: ReviewFile[];
}) {
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"side" | "wipe">("side");

  useEffect(() => {
    if (!open) return;
    setRightId(versions[0]?.id ?? null);
    setLeftId(versions[1]?.id ?? null);
    setIndex(0);
  }, [open, versions]);

  const left = versions.find((version) => version.id === leftId) ?? null;
  const right = versions.find((version) => version.id === rightId) ?? null;
  const filesOf = (version: ReviewVersion | null) =>
    version ? files.filter((file) => file.version_id === version.id) : [];
  const leftFiles = filesOf(left);
  const rightFiles = filesOf(right);
  const count = Math.min(leftFiles.length, rightFiles.length);
  const a = leftFiles[Math.min(index, Math.max(0, leftFiles.length - 1))] ?? null;
  const b = rightFiles[Math.min(index, Math.max(0, rightFiles.length - 1))] ?? null;
  const stills = a?.asset?.asset_type === "image" && b?.asset?.asset_type === "image";
  const videos = a?.asset?.asset_type === "video" && b?.asset?.asset_type === "video";

  const picker = (value: string | null, set: (id: string) => void, label: string) => (
    <Select value={value ?? ""} onValueChange={set}>
      <SelectTrigger className="w-56" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {versions.map((version) => (
          <SelectItem key={version.id} value={version.id}>
            {versionName(version)} · {version.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto scroll-slim">
        <DialogHeader>
          <DialogTitle>Compare versions</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {picker(leftId, setLeftId, "The earlier version")}
          <span className="text-xs text-muted-foreground">against</span>
          {picker(rightId, setRightId, "The later version")}
          {count > 1 && (
            <Select value={String(index)} onValueChange={(value) => setIndex(Number(value))}>
              <SelectTrigger className="w-48" aria-label="Which file">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: count }, (_, at) => (
                  <SelectItem key={at} value={String(at)}>
                    {rightFiles[at]?.asset?.title ?? rightFiles[at]?.title ?? `File ${at + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {stills && (
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => value && setMode(value as "side" | "wipe")}
              className="ml-auto"
            >
              <ToggleGroupItem value="side" className="text-xs">
                Side by side
              </ToggleGroupItem>
              <ToggleGroupItem value="wipe" className="text-xs">
                Wipe
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {left && right && left.id === right.id && (
          <p className="text-sm text-muted-foreground">Choose two different versions.</p>
        )}
        {left && right && left.id !== right.id && (
          <>
            {left.kind === "storyboard" || right.kind === "storyboard" ? (
              <ShotsSideBySide left={left} right={right} />
            ) : !a || !b ? (
              <p className="text-sm text-muted-foreground">One of these versions has no files.</p>
            ) : videos ? (
              <SyncedVideos left={a} right={b} />
            ) : stills && mode === "wipe" ? (
              <Wipe left={a} right={b} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <StillOrVideo file={a} caption={versionName(left)} />
                <StillOrVideo file={b} caption={versionName(right)} />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StillOrVideo({ file, caption }: { file: ReviewFile; caption: string }) {
  const url = useSignedUrl(file.asset?.storage_bucket, file.asset?.storage_path);
  return (
    <figure className="space-y-1">
      {!file.asset ? (
        <p className="text-sm text-muted-foreground">No longer in the library.</p>
      ) : !url ? (
        <Skeleton className="aspect-[9/16] w-full" />
      ) : file.asset.asset_type === "video" ? (
        <video src={url} controls playsInline className="max-h-[70vh] w-full object-contain" />
      ) : (
        <img src={url} alt={caption} className="max-h-[70vh] w-full object-contain" />
      )}
      <figcaption className="text-center text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/** The later still over the earlier one, cut away from the left as far as the handle is moved. */
function Wipe({ left, right }: { left: ReviewFile; right: ReviewFile }) {
  const leftUrl = useSignedUrl(left.asset?.storage_bucket, left.asset?.storage_path);
  const rightUrl = useSignedUrl(right.asset?.storage_bucket, right.asset?.storage_path);
  const [at, setAt] = useState(50);
  if (!leftUrl || !rightUrl) return <Skeleton className="mx-auto aspect-[9/16] h-[60vh]" />;
  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[9/16] h-[66vh] max-w-full overflow-hidden rounded-md bg-black">
        <img
          src={leftUrl}
          alt="The earlier version"
          className="absolute inset-0 size-full object-contain"
        />
        <img
          src={rightUrl}
          alt="The later version"
          className="absolute inset-0 size-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${at}%)` }}
        />
        <span className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${at}%` }} />
      </div>
      <Slider
        value={[at]}
        min={0}
        max={100}
        step={0.5}
        onValueChange={([value]) => setAt(value ?? 50)}
        aria-label="Where the wipe is"
        className="mx-auto max-w-md"
      />
    </div>
  );
}

/**
 * Two videos on one clock: one transport plays, pauses and scrubs both, and
 * the second is brought back to the first whenever it drifts by more than
 * two frames. One plays its sound at a time.
 */
function SyncedVideos({ left, right }: { left: ReviewFile; right: ReviewFile }) {
  const leftUrl = useSignedUrl(left.asset?.storage_bucket, left.asset?.storage_path);
  const rightUrl = useSignedUrl(right.asset?.storage_bucket, right.asset?.storage_path);
  const one = useRef<HTMLVideoElement | null>(null);
  const two = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [sound, setSound] = useState<"left" | "right">("right");

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const follow = () => {
      const lead = one.current;
      const other = two.current;
      if (lead && other) {
        setTime(lead.currentTime);
        if (
          lead.currentTime < (other.duration || Infinity) &&
          Math.abs(other.currentTime - lead.currentTime) > 2 / 30
        )
          other.currentTime = lead.currentTime;
        if (lead.ended && (other.ended || other.paused)) setPlaying(false);
      }
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const both = (work: (video: HTMLVideoElement) => void) => {
    for (const video of [one.current, two.current]) if (video) work(video);
  };
  const toggle = () => {
    if (playing) {
      both((video) => video.pause());
      setPlaying(false);
    } else {
      const at = one.current?.currentTime ?? 0;
      both((video) => {
        video.currentTime = Math.min(at, video.duration || at);
        void video.play().catch(() => undefined);
      });
      setPlaying(true);
    }
  };
  const seek = (seconds: number) => {
    both((video) => {
      video.currentTime = Math.min(seconds, video.duration || seconds);
    });
    setTime(seconds);
  };

  if (!leftUrl || !rightUrl) return <Skeleton className="h-[60vh] w-full" />;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            [one, leftUrl, "left", "The earlier version"],
            [two, rightUrl, "right", "The later version"],
          ] as const
        ).map(([ref, url, side, label]) => (
          <video
            key={side}
            ref={ref}
            src={url}
            playsInline
            preload="auto"
            muted={sound !== side}
            aria-label={label}
            className="max-h-[62vh] w-full rounded-md bg-black object-contain"
            onLoadedMetadata={(event) =>
              setLength((current) => Math.max(current, event.currentTarget.duration || 0))
            }
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={toggle}
          aria-label={playing ? "Pause both" : "Play both"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <span className="w-20 font-mono text-xs">{formatTime(time)}</span>
        <Slider
          value={[time]}
          min={0}
          max={Math.max(length, 0.1)}
          step={1 / 30}
          onValueChange={([value]) => seek(value ?? 0)}
          aria-label="Where both videos are"
          className="flex-1"
        />
        <span className="w-20 text-right font-mono text-xs text-muted-foreground">
          {formatTime(length)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => setSound((current) => (current === "left" ? "right" : "left"))}
        >
          <Volume2 className="mr-1.5 size-3.5" /> Sound: {sound === "left" ? "earlier" : "later"}
        </Button>
      </div>
    </div>
  );
}

/** Two storyboards' shots by their label, with what moved between them. */
function ShotsSideBySide({ left, right }: { left: ReviewVersion; right: ReviewVersion }) {
  const shotsOf = (version: ReviewVersion): SnapshotShot[] =>
    version.snapshot?.kind === "storyboard" ? version.snapshot.shots : [];
  const before = new Map(shotsOf(left).map((shot) => [shot.label, shot]));
  const after = shotsOf(right);
  const gone = shotsOf(left).filter((shot) => !after.some((entry) => entry.label === shot.label));
  if (!before.size && !after.length)
    return <p className="text-sm text-muted-foreground">Compare storyboards with storyboards.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 font-normal">Shot</th>
            <th className="px-2 py-1.5 font-normal">{versionName(left)}</th>
            <th className="px-2 py-1.5 font-normal">{versionName(right)}</th>
            <th className="px-2 py-1.5 font-normal">What moved</th>
          </tr>
        </thead>
        <tbody>
          {after.map((shot) => {
            const was = before.get(shot.label);
            const moved = was ? Number((shot.start - was.start).toFixed(3)) : null;
            const length = was
              ? Number((shot.end - shot.start - (was.end - was.start)).toFixed(3))
              : null;
            return (
              <tr key={shot.id} className="border-b border-border/60">
                <td className="px-2 py-1.5">{shot.name}</td>
                <td className="px-2 py-1.5 font-mono">
                  {was ? `${formatTime(was.start)} · ${(was.end - was.start).toFixed(2)} s` : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono">
                  {formatTime(shot.start)} · {(shot.end - shot.start).toFixed(2)} s
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {!was
                    ? "New"
                    : [
                        moved ? `starts ${moved > 0 ? "+" : ""}${moved.toFixed(2)} s` : null,
                        length ? `${length > 0 ? "+" : ""}${length.toFixed(2)} s long` : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Same"}
                </td>
              </tr>
            );
          })}
          {gone.map((shot) => (
            <tr key={shot.id} className="border-b border-border/60 text-muted-foreground">
              <td className="px-2 py-1.5">{shot.name}</td>
              <td className="px-2 py-1.5 font-mono">{formatTime(shot.start)}</td>
              <td className="px-2 py-1.5">—</td>
              <td className="px-2 py-1.5">Taken out</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
