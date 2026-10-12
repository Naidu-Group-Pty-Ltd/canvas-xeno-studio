import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2, Maximize, Minimize } from "lucide-react";
import { toast } from "sonner";
import type { AssetRow } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import { usePicture } from "@/hooks/usePicture";
import { useSignedUrl } from "@/components/studio/MediaPreview";
import { FramePreview } from "@/components/studio/FramePreview";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { getMediaWorkerStatus, listMediaTasks, submitMediaTask } from "@/lib/media.functions";
import { composeFrame, drawFrame, pictureSize, type Picture } from "@/lib/media/compose";
import {
  CENTRE,
  coverCrop,
  FRAME_FORMATS,
  hexColor,
  reframeSize,
  type FramePoint,
} from "@/lib/media/frame";
import { storageScope, uploadAssetBlob } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Fill = "cover" | "contain";

const SIZES = [
  { value: "source", label: "Keep its detail" },
  { value: "720", label: "720 px on the short side" },
  { value: "1080", label: "1080 px on the short side" },
  { value: "1440", label: "1440 px on the short side" },
  { value: "2160", label: "2160 px (4K) on the short side" },
] as const;
type Size = (typeof SIZES)[number]["value"];

/** A format's frame shape. */
const shapeOf = (id: string) => FRAME_FORMATS.find((format) => format.id === id)!;

/** The format a picture is already in, if it is one of them. */
function currentFormat(source: { width: number; height: number } | null): string | null {
  if (!source) return null;
  const ratio = source.width / source.height;
  const match = FRAME_FORMATS.find(
    (format) => Math.abs(Math.log(format.width / format.height / ratio)) < 0.02,
  );
  return match?.id ?? null;
}

/**
 * Reframing a library image or video into other shapes and sizes, without
 * generating anything: the picture is kept exactly as it is, and only cropped
 * (around a point you choose) or shown whole on a background. Each shape
 * becomes a new file in the library; the original is left untouched. Images
 * are laid out here in the browser; videos by the media service.
 */
export function ReframeDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: AssetRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isVideo = asset.asset_type === "video";
  const url = useSignedUrl(open ? asset.storage_bucket : undefined, asset.storage_path);
  const picture = usePicture(url, asset.asset_type);
  const source = useMemo(
    () =>
      picture
        ? pictureSize(picture)
        : asset.width && asset.height
          ? { width: asset.width, height: asset.height }
          : null,
    [picture, asset.width, asset.height],
  );
  const current = currentFormat(source);
  const [formats, setFormats] = useState<string[]>([]);
  const [fill, setFill] = useState<Fill>("cover");
  const [background, setBackground] = useState<string>(isVideo ? "blur" : "auto");
  const [focus, setFocus] = useState<FramePoint>(CENTRE);
  const [size, setSize] = useState<Size>("source");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string[]>([]);

  // A first suggestion once its shape is known: the other way round.
  const suggested = useRef(false);
  useEffect(() => {
    if (!open) {
      suggested.current = false;
      setMade([]);
      return;
    }
    if (suggested.current || !source) return;
    suggested.current = true;
    setFormats([source.width >= source.height ? "9:16" : "16:9"]);
  }, [open, source]);

  const { data: worker } = useQuery({
    queryKey: ["media-worker-status"],
    queryFn: () => getMediaWorkerStatus(),
    staleTime: 60_000,
    enabled: open && isVideo,
  });
  const workerReady = !isVideo || (worker?.configured === true && worker.reachable !== false);
  const canFocus = !isVideo || (worker?.features ?? []).includes("frame_focus");
  const canColour = !isVideo || (worker?.features ?? []).includes("frame_background");

  const { data: tasks = [] } = useQuery({
    queryKey: ["media-tasks", asset.id],
    queryFn: () => listMediaTasks({ data: { sourceAssetId: asset.id } }),
    enabled: open && isVideo && worker?.configured === true,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (task) => task.status === "processing" || task.status === "submitting",
      )
        ? 4000
        : false,
  });
  const reframes = tasks.filter((task) => task.task_type === "reframe_video").slice(0, 6);

  const backgrounds = [
    ...(isVideo ? [] : [{ value: "auto", label: "Its own edge colour" }]),
    { value: "blur", label: "Blurred" },
    { value: "#000000", label: "Black" },
    ...(canColour
      ? [
          { value: "#ffffff", label: "White" },
          { value: "custom", label: "A colour…" },
        ]
      : []),
  ];
  const custom = hexColor(background);
  const backgroundChoice = backgrounds.some((option) => option.value === background)
    ? background
    : custom
      ? "custom"
      : backgrounds[0]!.value;

  const outputs = useMemo(
    () =>
      source
        ? formats.map((id) => ({
            id,
            ...reframeSize(source, shapeOf(id), fill, size === "source" ? null : Number(size)),
          }))
        : [],
    [source, formats, fill, size],
  );

  const title = asset.title?.trim() || "Untitled";

  async function makeImages() {
    if (!picture || !user) return;
    const type =
      asset.mime_type === "image/png"
        ? "image/png"
        : asset.mime_type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const saved: string[] = [];
    for (const output of outputs) {
      const blob = await composeFrame(
        picture,
        {
          width: output.width,
          height: output.height,
          fit: fill,
          focus,
          background: backgroundChoice === "custom" ? (custom ?? "#000000") : background,
        },
        type,
      );
      await uploadAssetBlob(blob, {
        userId: user.id,
        projectId: asset.project_id,
        path: `${storageScope({ userId: user.id, projectId: asset.project_id })}/inputs/${crypto.randomUUID()}-reframe-${output.id.replace(":", "x")}.${ext}`,
        mimeType: type,
        kind: "image",
        title: `${title} · ${output.id}`,
        width: output.width,
        height: output.height,
        metadata: {
          derived_from_asset_id: asset.id,
          reframe: { format: output.id, fit: fill, focus, background },
        },
      });
      saved.push(output.id);
    }
    return saved;
  }

  async function makeVideos() {
    const started: string[] = [];
    for (const output of outputs) {
      const colour = backgroundChoice === "custom" ? custom : hexColor(background);
      await submitMediaTask({
        data: {
          taskType: "reframe_video",
          sourceAssetIds: [asset.id],
          params: {
            width: output.width,
            height: output.height,
            mode: fill === "cover" ? "cover" : background === "blur" ? "blur_pad" : "contain",
            ...(fill === "cover" && canFocus ? { focus_x: focus.x, focus_y: focus.y } : {}),
            ...(fill === "contain" && background !== "blur" && colour && canColour
              ? { background: colour }
              : {}),
          },
          projectId: asset.project_id,
          clientRequestId: crypto.randomUUID(),
          outputTitle: `${title} · ${output.id}`,
        },
      });
      started.push(output.id);
    }
    return started;
  }

  async function make() {
    if (busy || !outputs.length) return;
    setBusy(true);
    try {
      const done = isVideo ? await makeVideos() : await makeImages();
      if (!done) return;
      setMade(done);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      await queryClient.invalidateQueries({ queryKey: ["media-tasks", asset.id] });
      toast.success(
        isVideo
          ? `Reframing ${done.length} version${done.length === 1 ? "" : "s"}. They appear in the library when ready.`
          : `${done.length} version${done.length === 1 ? "" : "s"} saved to the library.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The new versions couldn't be made");
    } finally {
      setBusy(false);
    }
  }

  const preview = (id: string) => {
    const shape = shapeOf(id);
    const height = 150;
    return { width: Math.round((height * shape.width) / shape.height), height };
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[92vh] max-w-4xl overflow-y-auto scroll-slim"
        data-testid="reframe-dialog"
      >
        <DialogHeader>
          <DialogTitle>Reframe</DialogTitle>
          <DialogDescription>
            New shapes and sizes of this {isVideo ? "video" : "image"}, made from it exactly as it
            is: nothing is generated again. Each one is saved to the library as a new file; the
            original stays as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            <SourceFrame
              picture={picture}
              source={source}
              formats={fill === "cover" ? formats : []}
              focus={focus}
              onFocus={fill === "cover" && canFocus ? setFocus : null}
            />
            <p className="text-[11px] text-muted-foreground">
              {source ? `${source.width}×${source.height}` : "Loading…"}
              {current ? ` · ${current} now` : ""}
              {fill === "cover"
                ? canFocus
                  ? " · Click or drag on it to choose what stays in frame."
                  : " · Cropped around its centre (the media service needs an update to crop elsewhere)."
                : ""}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">New shapes</Label>
              <div className="flex flex-wrap gap-1.5" data-testid="reframe-formats">
                {FRAME_FORMATS.map((format) => {
                  const on = formats.includes(format.id);
                  return (
                    <button
                      key={format.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setFormats((list) =>
                          on ? list.filter((id) => id !== format.id) : [...list, format.id],
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-left text-[11px] transition-colors",
                        on
                          ? "border-primary/60 bg-primary/10"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                      title={format.use}
                    >
                      <span className="font-medium text-foreground">{format.id}</span> {format.use}
                      {format.id === current ? " · now" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="How it fills the frame"
            >
              {(
                [
                  ["cover", Maximize, "Fill the frame", "Crops what doesn't fit"],
                  ["contain", Minimize, "Show it whole", "On a background"],
                ] as const
              ).map(([value, Icon, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={fill === value}
                  onClick={() => setFill(value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left",
                    fill === value ? "border-primary/60 bg-primary/10" : "border-border",
                  )}
                  data-testid={`reframe-fill-${value}`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Icon className="size-3.5" /> {label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {fill === "contain" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Background</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={backgroundChoice}
                      onValueChange={(value) =>
                        setBackground(value === "custom" ? (custom ?? "#101828") : value)
                      }
                    >
                      <SelectTrigger className="h-8" aria-label="Background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {backgrounds.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {backgroundChoice === "custom" && (
                      <input
                        type="color"
                        value={custom ?? "#101828"}
                        onChange={(event) => setBackground(event.target.value)}
                        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                        aria-label="Background colour"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">What stays in frame</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-start"
                    disabled={!canFocus || (focus.x === 0.5 && focus.y === 0.5)}
                    onClick={() => setFocus(CENTRE)}
                  >
                    <Crosshair className="mr-1.5 size-3.5" />
                    {focus.x === 0.5 && focus.y === 0.5 ? "The centre" : "Back to the centre"}
                  </Button>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Size</Label>
                <Select value={size} onValueChange={(value) => setSize(value as Size)}>
                  <SelectTrigger className="h-8" aria-label="Size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {outputs.length > 0 && (
              <div className="flex flex-wrap items-end gap-3" data-testid="reframe-previews">
                {outputs.map((output) => (
                  <figure key={output.id} className="space-y-1">
                    <FramePreview
                      picture={picture}
                      layout={{
                        ...preview(output.id),
                        fit: fill,
                        focus,
                        background:
                          backgroundChoice === "custom" ? (custom ?? "#000000") : background,
                      }}
                      className="h-[150px] w-auto"
                      label={`${output.id} preview`}
                    />
                    <figcaption className="text-[10px] text-muted-foreground">
                      {output.id} · {output.width}×{output.height}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {isVideo && !workerReady && (
              <p className="text-[11px] text-warning">
                Reframing a video needs the media service, which isn't reachable right now.
              </p>
            )}
            {made.length > 0 && (
              <p className="text-[11px] text-success" data-testid="reframe-made">
                {isVideo ? "Reframing" : "Saved"}: {made.join(", ")}.
              </p>
            )}
            {isVideo && reframes.length > 0 && (
              <div className="space-y-1">
                <p className="label-eyebrow">Reframes of this video</p>
                {reframes.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 text-[11px]">
                    <StatusBadge status={task.status} />
                    <span className="truncate text-muted-foreground">
                      {task.status === "failed"
                        ? (task.error_message ?? "It couldn't be made")
                        : task.status === "completed"
                          ? "In the library"
                          : "Rendering…"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button
            onClick={() => void make()}
            disabled={busy || !outputs.length || (!isVideo && !picture) || !workerReady}
            data-testid="reframe-make"
          >
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {outputs.length > 1 ? `Make ${outputs.length} versions` : "Make this version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The picture as it is, with the part each new shape keeps outlined. Where
 * the crop can be moved, a click or drag on it sets the point kept in frame.
 */
function SourceFrame({
  picture,
  source,
  formats,
  focus,
  onFocus,
}: {
  picture: Picture | null;
  source: { width: number; height: number } | null;
  formats: string[];
  focus: FramePoint;
  onFocus: ((focus: FramePoint) => void) | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const box = source
    ? source.width >= source.height
      ? { width: 400, height: Math.round((400 * source.height) / source.width) }
      : { width: Math.round((300 * source.width) / source.height), height: 300 }
    : { width: 400, height: 225 };

  useEffect(() => {
    const element = ref.current;
    const context = element?.getContext("2d");
    if (!element || !context || !picture) return;
    element.width = box.width;
    element.height = box.height;
    drawFrame(context, picture, { width: box.width, height: box.height, fit: "cover" });
  }, [picture, box.width, box.height]);

  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-background",
        onFocus && "cursor-crosshair touch-none",
      )}
      style={{ aspectRatio: `${box.width} / ${box.height}` }}
      onPointerDown={(event) => {
        if (!onFocus) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onFocus(point(event));
      }}
      onPointerMove={(event) => {
        if (onFocus && dragging.current) onFocus(point(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      data-testid="reframe-source"
    >
      <canvas ref={ref} className="absolute inset-0 size-full" aria-label="The picture as it is" />
      {source &&
        formats.map((id) => {
          const shape = shapeOf(id);
          const crop = coverCrop(source, shape, focus);
          return (
            <div
              key={id}
              className={cn(
                "pointer-events-none absolute border-2 border-primary/80",
                // One shape: what is cropped away is dimmed too.
                formats.length === 1 && "shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]",
              )}
              style={{
                left: `${(crop.x / source.width) * 100}%`,
                top: `${(crop.y / source.height) * 100}%`,
                width: `${(crop.width / source.width) * 100}%`,
                height: `${(crop.height / source.height) * 100}%`,
              }}
            >
              <span className="absolute top-0 left-0 bg-primary px-1 text-[9px] text-primary-foreground">
                {id}
              </span>
            </div>
          );
        })}
      {onFocus && (
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        />
      )}
    </div>
  );
}
