import { useEffect, useState } from "react";
import { FileAudio, ImageOff } from "lucide-react";
import { signedUrl } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  bucket: string;
  path: string;
  type: "image" | "video" | "audio";
  className?: string;
  /** Videos only load metadata in grids; full playback is opt-in. */
  controls?: boolean;
  contain?: boolean;
  alt?: string;
}

export function useSignedUrl(bucket: string | undefined, path: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!bucket || !path) return;
    signedUrl(bucket, path).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [bucket, path]);
  return url;
}

export function MediaPreview({ bucket, path, type, className, controls = false, contain, alt }: Props) {
  const url = useSignedUrl(bucket, path);
  const fit = contain ? "object-contain" : "object-cover";

  if (!url) return <Skeleton className={cn("size-full", className)} />;

  if (type === "image") {
    return (
      <img
        src={url}
        alt={alt ?? "Generated asset"}
        loading="lazy"
        className={cn("size-full", fit, className)}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  if (type === "video") {
    return (
      <video
        src={url}
        controls={controls}
        preload="metadata"
        playsInline
        muted={!controls}
        className={cn("size-full", fit, className)}
      />
    );
  }

  return (
    <div className={cn("flex size-full flex-col items-center justify-center gap-2 bg-muted", className)}>
      <FileAudio className="size-6 text-muted-foreground" />
      <audio src={url} controls className="w-11/12" />
    </div>
  );
}

export function MediaFallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-full items-center justify-center bg-muted", className)}>
      <ImageOff className="size-5 text-muted-foreground" />
    </div>
  );
}
