import { useState } from "react";
import { Film, ImagePlus, Loader2, MoreHorizontal, Pause, Play, RotateCcw, X } from "lucide-react";
import type { AssetRow } from "@/hooks/useStudioData";
import type { LongVideoClipRow, LongVideoRow, LongVideoTakeRow } from "@/hooks/useLongVideos";
import {
  chooseLongVideoTake,
  holdLongVideoClip,
  redoLongVideoClip,
  setClipStartFrame,
  setCutawayFill,
} from "@/lib/long-video.functions";
import { faceNotes, lipSummary, referenceFraming, storedQc } from "@/lib/lip-sync/lip-check";
import { voiceLength } from "@/lib/lip-sync/view";
import { textCheckOf } from "@/lib/media/text-check";
import type { Cutaway } from "@/lib/lip-sync/sections";
import { LibraryPicker } from "@/components/studio/LibraryPicker";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Act = (name: string, work: () => Promise<unknown>, success?: string) => Promise<void>;

/**
 * A clip's lip score, as a short line under it, and anything else its face
 * check found (framed unlike the others, the camera moving, the mouth moving
 * in pauses). Nothing for a run that doesn't score lips.
 */
export function ClipLipScore({ run, clip }: { run: LongVideoRow; clip: LongVideoClipRow }) {
  const summary = lipSummary(clip, storedQc(run.qc_settings));
  if (!summary) return null;
  const notes = faceNotes(clip, referenceFraming(run.clips));
  return (
    <>
      <p
        className={cn(
          "truncate text-[10px]",
          summary.tone === "good"
            ? "text-success"
            : summary.tone === "warning"
              ? "text-warning"
              : "text-muted-foreground",
        )}
        title={summary.detail}
        data-testid="long-video-clip-lips"
      >
        {summary.label}
      </p>
      {notes.map((note) => (
        <p
          key={note.label}
          className="truncate text-[10px] text-warning"
          title={note.detail}
          data-testid="long-video-clip-face"
        >
          {note.label}
        </p>
      ))}
    </>
  );
}

/**
 * What a person can do with one clip of a run: hold it before it starts (and
 * let it go), choose the frame it starts from, make another take of it, and
 * swap in a take kept from before. Only where the database has these
 * (migration 0017) and the person may change the run.
 */
export function ClipControls({
  run,
  clip,
  takes,
  act,
  busy,
}: {
  run: LongVideoRow;
  clip: LongVideoClipRow;
  takes: LongVideoTakeRow[];
  act: Act;
  busy: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(false);
  const label = `Clip ${clip.position + 1}`;
  const waiting = clip.status === "waiting";
  const canChooseStart = !run.keyframe_model_id && (waiting || clip.status === "failed");
  const anchor = run.anchor_frame_asset_id;
  const own = clip.start_frame_override_asset_id;
  const done = clip.status === "completed";
  if (!waiting && !done && clip.status !== "failed") return null;

  const close = (work: () => Promise<void>) => {
    setOpen(false);
    void work();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${label}: more`}
            disabled={busy !== null}
            data-testid="long-video-clip-menu"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2 text-xs" align="start">
          <p className="font-medium">{label}</p>
          {waiting && (
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                close(() =>
                  act(
                    "hold",
                    () => holdLongVideoClip({ data: { clipId: clip.id, held: !clip.held } }),
                    clip.held ? `${label} released.` : `${label} held: the video waits at it.`,
                  ),
                )
              }
            >
              {clip.held ? (
                <Play className="mr-1.5 size-3.5" />
              ) : (
                <Pause className="mr-1.5 size-3.5" />
              )}
              {clip.held ? "Release it" : "Hold it before it starts"}
            </Button>
          )}
          {canChooseStart && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Starts from{" "}
                {own
                  ? own === anchor
                    ? "the video's still"
                    : "an image you chose"
                  : clip.position === 0
                    ? "its start image"
                    : run.start_from === "anchor"
                      ? "the video's still"
                      : "the frame the clip before is cut on"}
              </p>
              {anchor && own !== anchor && clip.position > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-full justify-start"
                  onClick={() =>
                    close(() =>
                      act(
                        "start-frame",
                        () =>
                          setClipStartFrame({ data: { clipId: clip.id, startFrame: "anchor" } }),
                        `${label} starts from the video's still.`,
                      ),
                    )
                  }
                >
                  Start from the video's still
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  setPicking(true);
                }}
              >
                <ImagePlus className="mr-1.5 size-3.5" /> Choose an image…
              </Button>
              {own && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-full justify-start"
                  onClick={() =>
                    close(() =>
                      act(
                        "start-frame",
                        () => setClipStartFrame({ data: { clipId: clip.id, startFrame: null } }),
                        `${label} starts as usual.`,
                      ),
                    )
                  }
                >
                  Back to its usual start
                </Button>
              )}
            </div>
          )}
          {done && (
            <div className="space-y-1">
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onClick={() =>
                  close(() =>
                    act(
                      "redo-clip",
                      () => redoLongVideoClip({ data: { clipId: clip.id } }),
                      `Another take of ${label.toLowerCase()} is being made (charged like any clip). The one you have is kept.`,
                    ),
                  )
                }
              >
                <RotateCcw className="mr-1.5 size-3.5" /> Another take
              </Button>
              {anchor && clip.position > 0 && clip.start_frame_asset_id !== anchor && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-full justify-start"
                  onClick={() =>
                    close(() =>
                      act(
                        "redo-clip",
                        () =>
                          redoLongVideoClip({ data: { clipId: clip.id, startFrame: "anchor" } }),
                        `Another take of ${label.toLowerCase()} is being made from the video's still.`,
                      ),
                    )
                  }
                >
                  Another take, from the video's still
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Only while no clip that starts from this one's last frame has started.
              </p>
            </div>
          )}
          {takes.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2" data-testid="long-video-takes">
              <p className="font-medium">Takes kept</p>
              {takes.map((take) => (
                <div key={take.id} className="flex items-center justify-between gap-2">
                  <span className="text-[11px]">
                    Take {take.attempt}
                    {take.lip_score !== null ? ` · lips ${Number(take.lip_score).toFixed(1)}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={!done}
                    onClick={() =>
                      close(() =>
                        act(
                          "take",
                          () => chooseLongVideoTake({ data: { takeId: take.id } }),
                          `Take ${take.attempt} is back in ${label.toLowerCase()}.`,
                        ),
                      )
                    }
                  >
                    Use it
                  </Button>
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <LibraryPicker
        open={picking}
        onOpenChange={setPicking}
        accept={["image"]}
        max={1}
        title={`The image ${label.toLowerCase()} starts from`}
        onConfirm={(chosen: AssetRow[]) => {
          setPicking(false);
          const image = chosen[0];
          if (image)
            void act(
              "start-frame",
              () => setClipStartFrame({ data: { clipId: clip.id, startFrame: image.id } }),
              `${label} starts from “${image.title ?? "the image"}”.`,
            );
        }}
      />
    </>
  );
}

/** What fills each cutaway, as kept on the run. */
function fillsOf(run: LongVideoRow): ({ assetId: string; inPoint: number } | null)[] {
  const value = (run as { cutaway_fills?: unknown }).cutaway_fills;
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return typeof record["asset_id"] === "string"
      ? { assetId: record["asset_id"], inPoint: Number(record["in_point"]) || 0 }
      : null;
  });
}

/**
 * A run's cutaways, each with the B-roll chosen for it (a video or image from
 * the library) or a placeholder still in the Editor until one is.
 */
export function CutawayFills({
  run,
  cutaways,
  assets,
  canManage,
  act,
  busy,
}: {
  run: LongVideoRow;
  cutaways: Cutaway[];
  assets: Map<string, AssetRow> | undefined;
  canManage: boolean;
  act: Act;
  busy: string | null;
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const fills = fillsOf(run);
  if (!cutaways.length) return null;
  return (
    <div className="space-y-1.5" data-testid="long-video-cutaways">
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <Film className="size-3.5" /> B-roll
      </p>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {cutaways.map((cutaway, index) => {
          const fill = fills[index] ?? null;
          const asset = fill ? assets?.get(fill.assetId) : undefined;
          return (
            <li
              key={`${cutaway.start}-${cutaway.end}`}
              className="flex items-center gap-2 rounded-md border border-border p-1.5"
            >
              <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-surface">
                {asset ? (
                  <MediaPreview
                    bucket={asset.storage_bucket}
                    path={asset.storage_path}
                    type={asset.asset_type === "video" ? "video" : "image"}
                    contain
                    alt={`B-roll ${index + 1}`}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <Film className="size-3.5 opacity-40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-[11px]">
                <p className="truncate">
                  {voiceLength(cutaway.start)}–{voiceLength(cutaway.end)} ·{" "}
                  {voiceLength(cutaway.end - cutaway.start)}
                </p>
                <p className="truncate text-muted-foreground">
                  {asset?.title ?? (fill ? "Chosen" : "Placeholder in the Editor")}
                </p>
                {asset && textCheckOf(asset.metadata)?.verdict === "garbled" && (
                  <p
                    className="truncate text-warning"
                    title={textCheckOf(asset.metadata)!.summary}
                    data-testid="long-video-cutaway-text"
                  >
                    Garbled text in it
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy !== null}
                    onClick={() => setPicking(index)}
                  >
                    {busy === `fill-${index}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : fill ? (
                      "Change"
                    ) : (
                      "Choose"
                    )}
                  </Button>
                  {fill && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      aria-label={`Clear B-roll ${index + 1}`}
                      disabled={busy !== null}
                      onClick={() =>
                        void act(`fill-${index}`, () =>
                          setCutawayFill({
                            data: { longVideoId: run.id, index, fill: null },
                          }),
                        )
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        Opening it in the Editor lays the B-roll in on the voiceover's clock, cut to the frame.
      </p>
      <LibraryPicker
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        accept={["video", "image"]}
        max={1}
        title={picking !== null ? `B-roll for ${voiceLength(cutaways[picking]!.start)}` : "B-roll"}
        onConfirm={(chosen: AssetRow[]) => {
          const index = picking;
          setPicking(null);
          const asset = chosen[0];
          if (asset && index !== null)
            void act(
              `fill-${index}`,
              () =>
                setCutawayFill({
                  data: { longVideoId: run.id, index, fill: { assetId: asset.id, inPoint: 0 } },
                }),
              "B-roll chosen. Open the edit again (as a new edit) to lay it in.",
            );
        }}
      />
    </div>
  );
}
