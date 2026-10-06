import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { AssetRow } from "@/hooks/useStudioData";
import type { SignedMedia } from "@/hooks/useEditorData";
import {
  audioPlayLength,
  clipsAt,
  frameSize,
  sourceTimeFor,
  type LaidOutClip,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
  type TransitionType,
} from "@/lib/edit/timeline";
import { useClockPlaying, useClockTime, type PlaybackClock } from "./state";

interface PreviewPlayerProps {
  timeline: Timeline;
  layout: TimelineLayout;
  assets: Map<string, AssetRow>;
  media: Map<string, SignedMedia>;
  clock: PlaybackClock;
}

/**
 * A browser preview of the edit. It follows the same timings as the render;
 * transitions, motion, ducking and captions are close approximations of the
 * final video, which is produced by the media service.
 */
export function PreviewPlayer({ timeline, layout, assets, media, clock }: PreviewPlayerProps) {
  const time = useClockTime(clock);
  const playing = useClockPlaying(clock);
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const target = frameSize(timeline.aspectRatio, timeline.resolution);

  // Fit the frame inside the available space at the edit's aspect ratio.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const scale = Math.min(width / target.width, height / target.height);
      setFrame({
        width: Math.floor(target.width * scale),
        height: Math.floor(target.height * scale),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [target.width, target.height]);

  const { current, incoming, mix } = clipsAt(layout, time);
  const mounted = useMemo(() => {
    const list: LaidOutClip[] = [];
    const add = (entry: LaidOutClip | null | undefined) => {
      if (entry && !list.some((item) => item.clip.id === entry.clip.id)) list.push(entry);
    };
    add(current);
    add(incoming);
    // The next clip loads ahead so the cut is instant.
    add(
      layout.clips[
        (incoming ?? current)?.index !== undefined ? (incoming ?? current)!.index + 1 : -1
      ],
    );
    return list;
  }, [current, incoming, layout.clips]);

  const scale = frame.width / target.width || 0;
  const fadeOpacity =
    timeline.fadeIn > 0 && time < timeline.fadeIn
      ? 1 - time / timeline.fadeIn
      : timeline.fadeOut > 0 && time > layout.total - timeline.fadeOut
        ? (time - (layout.total - timeline.fadeOut)) / timeline.fadeOut
        : 0;

  return (
    <div ref={box} className="flex size-full items-center justify-center">
      <div
        className="relative overflow-hidden rounded-md bg-black shadow-panel"
        style={{ width: frame.width, height: frame.height }}
        aria-label="Edit preview"
      >
        {!layout.clips.length && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Add clips from the media bin to start the edit.
          </div>
        )}
        {mounted.map((entry) => {
          const role = entry === current ? "current" : entry === incoming ? "incoming" : "preload";
          return (
            <ClipLayer
              key={entry.clip.id}
              entry={entry}
              asset={assets.get(entry.clip.assetId)}
              media={media.get(entry.clip.assetId)}
              role={role}
              time={time}
              playing={playing}
              mix={mix}
              transition={incoming?.transitionType ?? "cut"}
              fit={entry.clip.fit ?? timeline.fit}
            />
          );
        })}
        {timeline.audio.map((item) => (
          <AudioLayer
            key={item.id}
            item={item}
            url={media.get(item.assetId)?.url}
            time={time}
            playing={playing}
            total={layout.total}
            voiceRanges={voiceRanges(timeline.audio, layout.total)}
          />
        ))}
        <TextLayer
          timeline={timeline}
          time={time}
          scale={scale}
          frameWidth={target.width}
          frameHeight={target.height}
        />
        {fadeOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{ opacity: Math.min(1, fadeOpacity) }}
          />
        )}
      </div>
    </div>
  );
}

function voiceRanges(audio: TimelineAudio[], total: number): [number, number][] {
  return audio
    .filter((item) => item.role === "voiceover" && item.volume > 0)
    .map((item) => [item.start, item.start + audioPlayLength(item, total)] as [number, number]);
}

/* ------------------------------------------------------------------ */
/* Picture                                                             */
/* ------------------------------------------------------------------ */

interface ClipLayerProps {
  entry: LaidOutClip;
  asset: AssetRow | undefined;
  media: SignedMedia | undefined;
  role: "current" | "incoming" | "preload";
  time: number;
  playing: boolean;
  mix: number;
  transition: TransitionType;
  fit: "cover" | "contain" | "blur_pad";
}

/** How the outgoing and incoming pictures look part-way through a transition. */
function transitionStyle(
  transition: TransitionType,
  mix: number,
  role: "current" | "incoming",
): CSSProperties {
  const incoming = role === "incoming";
  const p = Math.max(0, Math.min(1, mix));
  switch (transition) {
    case "fadeblack":
    case "fadewhite":
      return { opacity: incoming ? (p >= 0.5 ? 1 : 0) : p < 0.5 ? 1 : 0 };
    case "slideleft":
    case "smoothleft":
      return { transform: `translateX(${incoming ? (1 - p) * 100 : -p * 100}%)` };
    case "slideright":
    case "smoothright":
      return { transform: `translateX(${incoming ? -(1 - p) * 100 : p * 100}%)` };
    case "slideup":
    case "smoothup":
      return { transform: `translateY(${incoming ? (1 - p) * 100 : -p * 100}%)` };
    case "slidedown":
    case "smoothdown":
      return { transform: `translateY(${incoming ? -(1 - p) * 100 : p * 100}%)` };
    case "wipeleft":
      return incoming ? { clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` } : {};
    case "wiperight":
      return incoming ? { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } : {};
    case "wipeup":
      return incoming ? { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` } : {};
    case "wipedown":
      return incoming ? { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` } : {};
    case "circleopen":
      return incoming ? { clipPath: `circle(${p * 75}% at 50% 50%)` } : {};
    case "circleclose":
      return incoming ? { clipPath: `circle(${p * 75}% at 50% 50%)` } : {};
    case "zoomin":
      return incoming ? { opacity: p } : { transform: `scale(${1 + p * 0.4})`, opacity: 1 - p };
    default:
      return incoming ? { opacity: p } : {};
  }
}

/** Ken Burns motion for stills, matching the render's 12% zoom and pans. */
function motionStyle(motion: string, progress: number): CSSProperties {
  const p = Math.max(0, Math.min(1, progress));
  const zoom = 0.12;
  switch (motion) {
    case "zoom_in":
      return { transform: `scale(${1 + zoom * p})` };
    case "zoom_out":
      return { transform: `scale(${1 + zoom * (1 - p)})` };
    case "pan_left":
      return { transform: `scale(${1 + zoom}) translateX(${(0.5 - p) * zoom * 100 * 0.9}%)` };
    case "pan_right":
      return { transform: `scale(${1 + zoom}) translateX(${(p - 0.5) * zoom * 100 * 0.9}%)` };
    case "pan_up":
      return { transform: `scale(${1 + zoom}) translateY(${(0.5 - p) * zoom * 100 * 0.9}%)` };
    case "pan_down":
      return { transform: `scale(${1 + zoom}) translateY(${(p - 0.5) * zoom * 100 * 0.9}%)` };
    default:
      return {};
  }
}

const ClipLayer = memo(function ClipLayer({
  entry,
  asset,
  media,
  role,
  time,
  playing,
  mix,
  transition,
  fit,
}: ClipLayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const clip = entry.clip;
  const visible = role !== "preload";

  useEffect(() => {
    const element = video.current;
    if (!element || clip.kind !== "video") return;
    const audible = role !== "preload" && clip.volume > 0;
    const gain = role === "incoming" ? mix : role === "current" && mix > 0 ? 1 - mix : 1;
    element.muted = !audible;
    element.volume = Math.max(0, Math.min(1, clip.volume * gain));
    if (element.playbackRate !== clip.speed) element.playbackRate = clip.speed;
    if (role === "preload") {
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - clip.trimStart) > 0.05)
        element.currentTime = clip.trimStart;
      return;
    }
    const expected = sourceTimeFor(entry, Math.max(time, entry.start));
    if (playing) {
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.3)
        element.currentTime = expected;
      if (element.paused) void element.play().catch(() => undefined);
    } else {
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.03)
        element.currentTime = expected;
    }
  }, [time, playing, role, mix, clip.kind, clip.volume, clip.speed, clip.trimStart, entry]);

  useEffect(() => {
    const element = video.current;
    return () => {
      element?.pause();
    };
  }, []);

  const progress = (time - entry.start) / Math.max(0.001, entry.end - entry.start);
  const layerStyle: CSSProperties = {
    zIndex: role === "incoming" ? 2 : 1,
    visibility: visible ? "visible" : "hidden",
    ...(role === "current" && mix > 0 ? transitionStyle(transition, mix, "current") : {}),
    ...(role === "incoming" ? transitionStyle(transition, mix, "incoming") : {}),
  };
  const objectFit = fit === "cover" ? "object-cover" : "object-contain";
  const backgroundUrl = clip.kind === "image" ? media?.url : media?.posterUrl;

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={layerStyle}
      aria-hidden={!visible}
    >
      {fit === "blur_pad" && backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover opacity-80 blur-2xl"
        />
      )}
      {media && clip.kind === "image" && (
        <img
          src={media.url}
          alt={asset?.title ?? "Still"}
          className={`absolute inset-0 size-full ${objectFit}`}
          style={motionStyle(clip.motion, progress)}
          draggable={false}
        />
      )}
      {media && clip.kind === "video" && (
        <video
          ref={video}
          src={media.url}
          poster={media.posterUrl ?? undefined}
          className={`absolute inset-0 size-full ${objectFit}`}
          preload="auto"
          playsInline
          muted
        />
      )}
      {!media && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {asset ? "Loading…" : "This file is no longer in the library"}
        </div>
      )}
      {role !== "preload" &&
        transition !== "cut" &&
        mix > 0 &&
        (transition === "fadeblack" || transition === "fadewhite") && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: transition === "fadeblack" ? "black" : "white",
              opacity: mix < 0.5 ? mix * 2 : (1 - mix) * 2,
            }}
          />
        )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

interface AudioLayerProps {
  item: TimelineAudio;
  url: string | undefined;
  time: number;
  playing: boolean;
  total: number;
  voiceRanges: [number, number][];
}

/** Position in the source for a timeline time, looping the way the render does. */
function audioSourceTime(item: TimelineAudio, elapsed: number): number {
  const length = item.sourceDuration ?? null;
  if (!item.loop || !length) return item.trimStart + elapsed;
  const firstPass = Math.max(0.01, length - item.trimStart);
  if (elapsed < firstPass) return item.trimStart + elapsed;
  return (elapsed - firstPass) % length;
}

const AudioLayer = memo(function AudioLayer({
  item,
  url,
  time,
  playing,
  total,
  voiceRanges,
}: AudioLayerProps) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const length = audioPlayLength(item, total);
    const elapsed = time - item.start;
    const active = elapsed >= 0 && elapsed < length;
    if (!active || item.volume === 0) {
      if (!element.paused) element.pause();
      return;
    }
    let gain = item.volume;
    if (item.fadeIn > 0 && elapsed < item.fadeIn) gain *= elapsed / item.fadeIn;
    if (item.fadeOut > 0 && elapsed > length - item.fadeOut)
      gain *= Math.max(0, (length - elapsed) / item.fadeOut);
    if (
      item.role === "music" &&
      item.duck &&
      voiceRanges.some(([from, to]) => time >= from - 0.25 && time <= to + 0.45)
    ) {
      gain *= item.duckLevel;
    }
    element.volume = Math.max(0, Math.min(1, gain));
    const expected = audioSourceTime(item, elapsed);
    if (playing) {
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.3)
        element.currentTime = expected;
      if (element.paused) void element.play().catch(() => undefined);
    } else {
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.05)
        element.currentTime = expected;
    }
  }, [item, time, playing, total, voiceRanges]);

  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
    };
  }, []);

  if (!url) return null;
  return <audio ref={audio} src={url} preload="auto" loop={item.loop} />;
});

/* ------------------------------------------------------------------ */
/* Captions and titles                                                 */
/* ------------------------------------------------------------------ */

function TextLayer({
  timeline,
  time,
  scale,
  frameWidth,
  frameHeight,
}: {
  timeline: Timeline;
  time: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
}) {
  if (!scale) return null;
  const short = Math.min(frameWidth, frameHeight);
  const portrait = frameHeight > frameWidth;
  const caption = timeline.captions.enabled
    ? timeline.captions.segments.find((segment) => time >= segment.start && time < segment.end)
    : undefined;
  const overlays = timeline.overlays.filter(
    (overlay) => time >= overlay.start && time < overlay.end,
  );

  const captionStyle = (): CSSProperties => {
    const { style, position, size } = timeline.captions;
    const fontSize = short * 0.058 * size * scale;
    const base: CSSProperties = {
      position: "absolute",
      left: "8%",
      right: "8%",
      textAlign: "center",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontWeight: style === "minimal" ? 500 : 700,
      fontSize,
      lineHeight: 1.2,
      color: style === "bold" ? "#ffe500" : "#ffffff",
      whiteSpace: "pre-line",
    };
    if (position === "top") base.top = `${(portrait ? 0.14 : 0.08) * 100}%`;
    else if (position === "center") {
      base.top = "50%";
      base.transform = "translateY(-50%)";
    } else
      base.bottom = `${(position === "bottom" ? (portrait ? 0.12 : 0.07) : portrait ? 0.24 : 0.14) * 100}%`;
    if (style === "boxed") return base;
    const outline = Math.max(1, fontSize * (style === "minimal" ? 0.04 : 0.08));
    base.textShadow = `0 0 ${outline}px #000, 0 0 ${outline}px #000, 0 ${outline / 2}px ${outline}px #000`;
    return base;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {caption && (
        <div style={captionStyle()}>
          <span
            style={
              timeline.captions.style === "boxed"
                ? {
                    background: "rgba(0,0,0,0.65)",
                    padding: "0.1em 0.35em",
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }
                : undefined
            }
          >
            {timeline.captions.uppercase ? caption.text.toUpperCase() : caption.text}
          </span>
        </div>
      )}
      {overlays.map((overlay) => {
        const size =
          short *
          (overlay.style === "title" ? 0.09 : overlay.style === "cta" ? 0.065 : 0.055) *
          scale;
        const style: CSSProperties = {
          position: "absolute",
          left: "8%",
          right: "8%",
          textAlign: "center",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontWeight: overlay.style === "subtitle" ? 500 : 800,
          fontSize: size,
          lineHeight: 1.15,
          whiteSpace: "pre-line",
        };
        if (overlay.position === "top") style.top = `${(portrait ? 0.16 : 0.1) * 100}%`;
        else if (overlay.position === "bottom") style.bottom = `${(portrait ? 0.3 : 0.16) * 100}%`;
        else {
          style.top = "50%";
          style.transform = "translateY(-50%)";
        }
        return (
          <div key={overlay.id} style={style}>
            {overlay.style === "cta" ? (
              <span
                style={{
                  background: "#fff",
                  color: "#000",
                  padding: "0.25em 0.6em",
                  borderRadius: 4,
                }}
              >
                {overlay.text}
              </span>
            ) : (
              <span style={{ color: "#fff", textShadow: "0 0 6px #000, 0 2px 8px #000" }}>
                {overlay.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
