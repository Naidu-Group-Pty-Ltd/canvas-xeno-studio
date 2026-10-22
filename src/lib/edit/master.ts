/**
 * Mastering decisions the app makes before a render (the media service's side
 * is media-worker/src/master.js).
 *
 * An edit that is one finished video with nothing over it would only lose
 * detail by being encoded again: the media service can pass the file through
 * as it is (its streams copied, laid out to start playing at once). The app
 * asks for that when the edit says nothing over its clip; the service checks
 * the file itself (its codec, size, rate, frames and loudness) and renders
 * the edit the usual way if the file isn't what the render would make. Pure,
 * so it is unit-testable.
 */
import {
  audibleAudio,
  clipGain,
  frameSize,
  layoutTimeline,
  type Timeline,
  type TimelineClip,
} from "./timeline";

/** What the library knows of the clip's file; null where it doesn't say. */
export interface PassThroughSource {
  assetId: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fps: number | null;
  mimeType: string | null;
}

/** Files a render can be: an MP4 or QuickTime movie (the service copies its streams into an MP4). */
const MOVIE_TYPES = new Set(["video/mp4", "video/quicktime"]);

/** The edit's one clip when nothing in the edit changes it, else null. */
export function untouchedClip(timeline: Timeline): TimelineClip | null {
  if (timeline.clips.length !== 1) return null;
  const clip = timeline.clips[0]!;
  const total = layoutTimeline(timeline).total;
  const shown = (item: { start: number; end: number }) =>
    item.start < total && item.end > item.start;
  const captioned =
    timeline.captions.enabled &&
    timeline.captions.segments.some((segment) => segment.text.trim() && shown(segment));
  const titled = timeline.overlays.some((overlay) => overlay.text.trim() && shown(overlay));
  const pictured = timeline.images.some((image) => image.opacity > 0 && shown(image));
  const unchanged =
    clip.kind === "video" &&
    clip.trimStart === 0 &&
    clip.speed === 1 &&
    // Its own sound as it is: neither its volume nor the picture channel's level moves it.
    Math.abs(clipGain(timeline, clip) - 1) < 1e-9 &&
    audibleAudio(timeline, total).length === 0 &&
    !captioned &&
    !titled &&
    !pictured &&
    timeline.fadeIn === 0 &&
    timeline.fadeOut === 0 &&
    timeline.upscale === "standard";
  return unchanged ? clip : null;
}

/**
 * Whether to ask the media service to pass the edit's one video through: the
 * edit changes nothing, the clip is the whole file (to within half a frame)
 * and, where the library knows them, the file's size, rate and type are the
 * render's. What the library doesn't know, the service checks.
 */
export function passThroughCandidate(
  timeline: Timeline,
  source: PassThroughSource | null,
): boolean {
  const clip = untouchedClip(timeline);
  if (!clip || !source || source.assetId !== clip.assetId) return false;
  if (source.mimeType && !MOVIE_TYPES.has(source.mimeType)) return false;
  const length = source.durationSeconds ?? clip.sourceDuration ?? null;
  if (length === null || Math.abs(length - clip.duration) > 0.5 / timeline.fps) return false;
  const frame = frameSize(timeline.aspectRatio, timeline.resolution);
  if (source.width !== null && source.width !== frame.width) return false;
  if (source.height !== null && source.height !== frame.height) return false;
  if (source.fps !== null && Math.abs(source.fps - timeline.fps) > 1e-3) return false;
  return true;
}
