import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatTime } from "@/lib/edit/timeline";
import { gridCropText } from "@/lib/media/cover-crops";
import { readCoverFrame, type CoverFrame } from "@/lib/media/cover-frame";
import { signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/** How wide the frame is shown here. */
const PREVIEW_WIDTH = 132;

interface Reading extends CoverFrame {
  frame: number;
}

/** A box on the frame as shares of it, for the overlays. */
const shares = (top: number, bottom: number, height: number) => ({
  top: `${(100 * top) / height}%`,
  height: `${(100 * (bottom - top)) / height}%`,
});

/**
 * A frame of a render as a reel's cover, and how a profile grid's 3:4 crop
 * shows it (src/lib/media/cover-crops): what the crop cuts centred, and
 * where to move it to keep everything. Reel 2's cover lost the top of its
 * Passport to the centred crop. The frame chosen can be downloaded as the
 * cover. Read in the browser, from the render itself.
 */
export function CoverCheck({
  assetId,
  duration,
  fps,
  title,
}: {
  /** The rendered video's library file. */
  assetId: string;
  duration: number;
  fps: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const frames = Math.max(1, Math.floor(duration * fps));
  const [frame, setFrame] = useState(() => Math.min(frames - 1, Math.round(fps)));
  const [reading, setReading] = useState<Reading | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  // The video, once the section is opened.
  useEffect(() => {
    if (!open || url) return;
    let live = true;
    void (async () => {
      const { data } = await supabase
        .from("assets")
        .select("storage_bucket,storage_path")
        .eq("id", assetId)
        .maybeSingle();
      const signed = data ? await signedUrl(data.storage_bucket, data.storage_path) : null;
      if (!live) return;
      if (signed) setUrl(signed);
      else setProblem("The video couldn't be opened.");
    })();
    return () => {
      live = false;
    };
  }, [open, url, assetId]);

  // The frame chosen, read for what is on it (a little after the slider stops).
  useEffect(() => {
    const element = video.current;
    if (!open || !url || !element) return;
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const read = await readCoverFrame(element, (frame + 0.5) / fps);
          if (!live) return;
          const { width, height } = read;
          const canvas = preview.current;
          if (canvas) {
            canvas.width = PREVIEW_WIDTH;
            canvas.height = Math.round((PREVIEW_WIDTH * height) / width);
            canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
          }
          setReading({ ...read, frame });
          setProblem(null);
        } catch (error) {
          if (!live) return;
          setProblem(
            error instanceof DOMException && error.name === "SecurityError"
              ? "This video's frames can't be read in the browser here."
              : error instanceof Error
                ? error.message
                : "The frame couldn't be read.",
          );
        } finally {
          if (live) setBusy(false);
        }
      })();
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, url, frame, fps]);

  async function download() {
    const element = video.current;
    if (!element || !reading) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return void toast.error("The frame couldn't be saved");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${title.replace(/[^\w.-]+/g, "_") || "edit"}-cover-frame-${reading.frame}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    }, "image/png");
  }

  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="mr-1 size-3.5" /> Check a cover frame
      </Button>
    );

  const crop = reading?.crop ?? null;
  const height = reading?.height ?? 1;
  const vertical = crop?.axis === "vertical";
  return (
    <div className="mt-1.5 space-y-1.5 rounded-md bg-muted p-2" data-testid="cover-check">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">A cover frame</span>
        <span className="text-muted-foreground tabular-nums">
          {formatTime(frame / fps)} · frame {frame}
        </span>
      </div>
      {/* Read from, never shown: the frame is drawn below. */}
      <video
        ref={video}
        src={url ?? undefined}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        className="hidden"
      />
      <Slider
        min={0}
        max={frames - 1}
        step={1}
        value={[frame]}
        onValueChange={([value]) => setFrame(value ?? 0)}
        aria-label="Which frame is the cover"
      />
      <div className="flex gap-2">
        <div
          className="relative shrink-0 overflow-hidden rounded-sm"
          style={{ width: PREVIEW_WIDTH }}
        >
          <canvas ref={preview} className="block w-full" aria-label="The frame chosen" />
          {reading && crop && vertical && crop.axis && (
            <>
              {/* Outside the centred crop, dimmed; the crop itself outlined; where to move it, dashed. */}
              <div
                className="absolute inset-x-0 top-0 bg-background/70"
                style={{ height: shares(0, crop.centred, height).height }}
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-background/70"
                style={{ height: shares(crop.centred + crop.size, height, height).height }}
              />
              <div
                className="absolute inset-x-0 border border-primary"
                style={shares(crop.centred, crop.centred + crop.size, height)}
              />
              {crop.keepsAllFrom !== null && !crop.keepsAll && (
                <div
                  className="absolute inset-x-0 border border-dashed border-warning"
                  style={shares(crop.keepsAllFrom, crop.keepsAllFrom + crop.size, height)}
                />
              )}
            </>
          )}
          {busy && (
            <Loader2 className="absolute right-1 top-1 size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 space-y-1.5 text-[11px]" aria-live="polite">
          {problem ? (
            <p className="text-destructive">{problem}</p>
          ) : reading && reading.content && crop ? (
            <>
              <p>{gridCropText(crop, reading.content)}</p>
              {reading.content.ground && (
                <p className="text-muted-foreground">
                  What is on it runs from {reading.content.top} to {reading.content.bottom} px down
                  of {reading.height}, on a {reading.content.ground} ground. The grid&apos;s crop is
                  outlined
                  {crop.keepsAllFrom !== null && !crop.keepsAll ? "; where to move it, dashed" : ""}
                  .
                </p>
              )}
            </>
          ) : reading ? (
            <p className="text-muted-foreground">Nothing is on this frame but its ground.</p>
          ) : (
            <p className="text-muted-foreground">Reading the frame…</p>
          )}
          <p className="text-muted-foreground">
            Instagram&apos;s profile grid shows a reel&apos;s cover at 3:4, centred unless the crop
            is moved; TikTok&apos;s grid is said to crop it the same way.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!reading || busy || !!problem}
            onClick={() => void download()}
          >
            <Download className="mr-1 size-3.5" /> Download this frame
          </Button>
        </div>
      </div>
    </div>
  );
}
