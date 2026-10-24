import type { ReactNode } from "react";
import { AlertTriangle, Check, Copy, Loader2, Pause, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import type { usePreview } from "./preview";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { audioUrlFor, trackInProgress } from "@/hooks/useMusicData";
import { formatTime } from "@/lib/edit/timeline";
import { creditLine, licenceTerms, MUSIC_LICENSES, type MusicTrackRow } from "@/lib/music/catalog";
import { cn } from "@/lib/utils";

export function LicenseBadge({ track }: { track: Pick<MusicTrackRow, "license" | "rights"> }) {
  const info = MUSIC_LICENSES[track.license];
  const terms = licenceTerms(track);
  const limited = !!terms && (terms.excluded.length > 0 || !!terms.expiresOn);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            terms?.expired
              ? "bg-destructive/15 text-destructive"
              : info.credit || limited
                ? "bg-warning/15 text-warning"
                : "bg-success/15 text-success",
          )}
        >
          {terms?.expired ? "Licence expired" : info.short}
          {info.credit ? " · credit" : limited && !terms?.expired ? " · limits" : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {terms ? `${info.note} ${terms.summary}.` : info.note}
      </TooltipContent>
    </Tooltip>
  );
}

/** A licensed track's recorded terms, with what they don't cover. */
export function LicenceTerms({ track }: { track: Pick<MusicTrackRow, "license" | "rights"> }) {
  const terms = licenceTerms(track);
  if (!terms) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[11px]" data-testid="licence-terms">
      <p className="text-muted-foreground">
        {terms.summary}
        {terms.reference ? ` · Ref ${terms.reference}` : ""}
      </p>
      {terms.notes && <p className="text-muted-foreground">Conditions: {terms.notes}</p>}
      {terms.expired ? (
        <p className="text-destructive">
          This licence ran out on {terms.expiresOn}. It can't be added to edits or rendered until
          it's renewed.
        </p>
      ) : (
        terms.excluded.length > 0 && (
          <p className="text-warning">Not licensed for: {terms.excluded.join(", ")}.</p>
        )
      )}
    </div>
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
  const expired = !!licenceTerms(track)?.expired;
  const meta = [
    track.artist,
    track.duration_seconds ? formatTime(Number(track.duration_seconds), false) : null,
    track.bpm ? `${Math.round(Number(track.bpm))} BPM` : null,
    // A track the studio made at another tempo is marked by its provider (an instrumental keeps its original's).
    track.source === "derived" && track.provider === "tempo"
      ? "Tempo changed"
      : SOURCE_LABEL[track.source] + (track.provider ? ` · ${track.provider}` : ""),
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
          <p className="truncate font-medium" title={track.title}>
            {track.title}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <LicenseBadge track={track} />
            <span className="truncate">
              {[track.instrumental ? "instrumental" : null, ...meta].filter(Boolean).join(" · ")}
            </span>
          </p>
        </div>
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
              disabled={expired}
              title={expired ? "This track's licence has run out" : undefined}
              onClick={() => onAdd(track)}
            >
              <Plus className="mr-0.5 size-3" /> {addLabel}
            </Button>
          ))}
        {actions}
      </div>
      {busy && <p className="mt-1 text-[11px] text-muted-foreground">Being made…</p>}
      <LicenceTerms track={track} />
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
