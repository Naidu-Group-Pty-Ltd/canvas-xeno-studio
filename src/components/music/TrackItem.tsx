import type { ReactNode } from "react";
import { AlertTriangle, Check, Copy, Loader2, Pause, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import type { usePreview } from "./preview";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { audioUrlFor, trackInProgress } from "@/hooks/useMusicData";
import { formatTime } from "@/lib/edit/timeline";
import { creditLine, MUSIC_LICENSES, type MusicTrackRow } from "@/lib/music/catalog";
import { cn } from "@/lib/utils";

export function LicenseBadge({ license }: { license: MusicTrackRow["license"] }) {
  const info = MUSIC_LICENSES[license];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            info.credit ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
          )}
        >
          {info.short}
          {info.credit ? " · credit" : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{info.note}</TooltipContent>
    </Tooltip>
  );
}

const SOURCE_LABEL: Record<MusicTrackRow["source"], string> = {
  openverse: "Openverse",
  elevenlabs: "AI",
  upload: "Uploaded",
  derived: "Instrumental",
};

export function TrackItem({
  track,
  preview,
  onAdd,
  addLabel = "Add",
  added,
  actions,
}: {
  track: MusicTrackRow;
  preview: ReturnType<typeof usePreview>;
  onAdd?: ((track: MusicTrackRow) => void) | undefined;
  addLabel?: string;
  added?: boolean;
  actions?: ReactNode;
}) {
  const busy = trackInProgress(track);
  const broken =
    track.status === "failed" ||
    track.status === "submission_uncertain" ||
    (track.status === "generating" && !busy);
  const credit = creditLine(track);
  const meta = [
    track.artist,
    track.duration_seconds ? formatTime(Number(track.duration_seconds), false) : null,
    track.bpm ? `${Math.round(Number(track.bpm))} BPM` : null,
    SOURCE_LABEL[track.source] + (track.provider ? ` · ${track.provider}` : ""),
  ].filter(Boolean);

  return (
    <li className="rounded-md border border-border p-2 text-xs" data-testid="music-track">
      <div className="flex items-center gap-2">
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : broken ? (
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            disabled={!track.asset_id || preview.loading === track.id}
            onClick={() =>
              track.asset_id && void preview.toggle(track.id, () => audioUrlFor(track.asset_id!))
            }
            aria-label={
              preview.playing === track.id ? `Pause ${track.title}` : `Play ${track.title}`
            }
          >
            {preview.loading === track.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : preview.playing === track.id ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate font-medium">{track.title}</span>
            {track.instrumental && (
              <span className="shrink-0 text-[10px] text-muted-foreground">instrumental</span>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{meta.join(" · ")}</p>
        </div>
        <LicenseBadge license={track.license} />
        {onAdd &&
          !busy &&
          !broken &&
          (added ? (
            <Check className="size-4 shrink-0 text-success" aria-label="In this edit" />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onAdd(track)}
            >
              <Plus className="mr-0.5 size-3" /> {addLabel}
            </Button>
          ))}
        {actions}
      </div>
      {busy && <p className="mt-1 text-[11px] text-muted-foreground">Being made…</p>}
      {broken && (
        <p className="mt-1 text-[11px] text-destructive">
          {track.error_message ??
            "This was interrupted before it was saved. It won't be retried automatically."}
        </p>
      )}
      {credit && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded bg-surface-raised p-1.5 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1">Credit: {credit}</span>
          <button
            type="button"
            className="shrink-0 hover:text-foreground"
            aria-label="Copy the credit"
            onClick={() => {
              void navigator.clipboard?.writeText(credit).then(
                () => toast.success("Credit copied"),
                () => toast.error("Couldn't copy"),
              );
            }}
          >
            <Copy className="size-3" />
          </button>
        </div>
      )}
    </li>
  );
}
