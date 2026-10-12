import { useEffect, useState } from "react";
import { loadPicture, type Picture } from "@/lib/media/compose";

/**
 * A library file as a picture to lay out and preview: an image itself, or a
 * video's frame a moment in. Null while it loads, or if it can't be.
 */
export function usePicture(url: string | null, kind: "image" | "video" | "audio"): Picture | null {
  const [picture, setPicture] = useState<{ url: string; picture: Picture } | null>(null);
  useEffect(() => {
    if (!url || kind === "audio") return;
    let current = true;
    if (kind === "image") {
      loadPicture(url)
        .then((loaded) => {
          if (current) setPicture({ url, picture: loaded });
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const onLoaded = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    const onSeeked = () => {
      if (current) setPicture({ url, picture: video });
    };
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("seeked", onSeeked, { once: true });
    video.src = url;
    return () => {
      current = false;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.removeAttribute("src");
      video.load();
    };
  }, [url, kind]);
  return picture && picture.url === url ? picture.picture : null;
}
