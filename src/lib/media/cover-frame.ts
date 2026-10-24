/**
 * A frame of a video read in the browser for its cover crop (./cover-crops):
 * the video sought to it, drawn at a quarter of its size (a box, not detail),
 * and what is on it boxed at the frame's own size. Browser only (a canvas);
 * the Editor's CoverCheck uses it.
 */
import { coverContent, gridCrop, type CoverContent, type GridCrop } from "./cover-crops";

/** A frame is read for what is on it at a quarter of its size: its box, not its detail. */
export const READ_SCALE = 4;

export interface CoverFrame {
  width: number;
  height: number;
  content: CoverContent | null;
  crop: GridCrop | null;
}

/** How long a video may take to open, or to show a frame it is sought to, before that is given up. */
const OPEN_MS = 20_000;
const SEEK_MS = 10_000;

/** Why a video failed, in words: its error says, and the format it can't play is the common one. */
function failure(video: HTMLVideoElement): Error {
  return new Error(
    video.error?.code === 4
      ? "This browser can't play the video's format."
      : "The video couldn't be opened.",
  );
}

/**
 * Waits for `event` on a video, or rejects on its error or after `ms`. A
 * video that failed already (before anything listened) fails at once:
 * waiting for an error that has been and gone hangs for ever.
 */
function waitFor(
  video: HTMLVideoElement,
  event: string,
  ms: number,
  late: string,
  start?: () => void,
): Promise<void> {
  if (video.error) return Promise.reject(failure(video));
  return new Promise((resolve, reject) => {
    const finish = (error: Error | null) => {
      clearTimeout(timer);
      video.removeEventListener(event, ok);
      video.removeEventListener("error", bad);
      if (error) reject(error);
      else resolve();
    };
    const ok = () => finish(null);
    const bad = () => finish(failure(video));
    const timer = setTimeout(() => finish(new Error(late)), ms);
    video.addEventListener(event, ok);
    video.addEventListener("error", bad);
    start?.();
  });
}

/** Waits until a video knows its size. */
export function videoLoaded(video: HTMLVideoElement): Promise<void> {
  if (video.error) return Promise.reject(failure(video));
  if (video.readyState >= 1) return Promise.resolve();
  return waitFor(video, "loadedmetadata", OPEN_MS, "The video took too long to open.");
}

/** Seeks a video to `time` and waits until it shows that frame. */
export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return waitFor(video, "seeked", SEEK_MS, "The video took too long to show that frame.", () => {
    video.currentTime = time;
  });
}

/**
 * The frame `time` seconds into a video, read for what is on it and how the
 * profile grid's 3:4 crop shows it. Throws a DOMException named
 * SecurityError where the video's frames can't be read (served without CORS).
 */
export async function readCoverFrame(video: HTMLVideoElement, time: number): Promise<CoverFrame> {
  await videoLoaded(video);
  await seekVideo(video, time);
  const width = video.videoWidth;
  const height = video.videoHeight;
  const small = document.createElement("canvas");
  small.width = Math.max(3, Math.round(width / READ_SCALE));
  small.height = Math.max(3, Math.round(height / READ_SCALE));
  const context = small.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The frame couldn't be read here");
  context.drawImage(video, 0, 0, small.width, small.height);
  const found = coverContent(
    context.getImageData(0, 0, small.width, small.height).data,
    small.width,
    small.height,
  );
  const across = width / small.width;
  const down = height / small.height;
  // Back at the frame's own size, a quarter-size pixel taken whole on each side.
  const content = found && {
    top: Math.max(0, Math.floor(found.top * down)),
    bottom: Math.min(height, Math.ceil(found.bottom * down)),
    left: Math.max(0, Math.floor(found.left * across)),
    right: Math.min(width, Math.ceil(found.right * across)),
    ground: found.ground,
  };
  return { width, height, content, crop: content ? gridCrop(content, width, height) : null };
}
