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
  audioFades,
  audioGain,
  audioLoops,
  audioPlayLength,
  channelGain,
  channelOf,
  clipGain,
  clipsAt,
  editFadeLevel,
  frameSize,
  sourceTimeFor,
  voicePosition,
  type LaidOutClip,
  type Timeline,
  type TimelineAudio,
  type TimelineLayout,
  type TransitionType,
} from "@/lib/edit/timeline";
import { useClockPlaying, useClockTime, type PlaybackClock } from "./state";
import { useBrandFontFaces } from "@/hooks/useBrandKits";
import { safeInsets, type SafeArea } from "@/lib/edit/brand";

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
  // Brand fonts load into the page, so titles are set in them as the render sets them.
  useBrandFontFaces(timeline.fonts);
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

  const level = useMemo(() => previewLevel(timeline), [timeline]);
  const scale = frame.width / target.width || 0;
  // The opening and closing fades take the sound down with the picture, as in the render.
  const fadeLevel = editFadeLevel(timeline, layout.total, time);
  const fadeOpacity = 1 - fadeLevel;

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
              channel={channelGain(timeline, "picture")}
              level={level * fadeLevel}
              transition={incoming?.transitionType ?? "cut"}
              fit={entry.clip.fit ?? timeline.fit}
              focus={entry.clip.focus}
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
            fps={timeline.fps}
            voiceRanges={voiceRanges(timeline, layout.total)}
            channel={channelGain(timeline, channelOf(item.role))}
            level={level * fadeLevel}
          />
        ))}
        <ImageLayer timeline={timeline} time={time} media={media} />
        <TextLayer
          timeline={timeline}
          time={time}
          scale={scale}
          frameWidth={target.width}
          frameHeight={target.height}
        />
        <SafeAreaGuide timeline={timeline} />
        {fadeOpacity > 0 && (
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{ opacity: Math.min(1, fadeOpacity) }}
            data-testid="edit-fade"
          />
        )}
      </div>
    </div>
  );
}

/** Where a voiceover is heard (a muted voiceover channel ducks nothing, as in the render). */
function voiceRanges(timeline: Timeline, total: number): [number, number][] {
  return timeline.audio
    .filter((item) => item.role === "voiceover" && audioGain(timeline, item) > 0)
    .map(
      (item) =>
        [item.start, item.start + audioPlayLength(item, total, timeline.fps)] as [number, number],
    );
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
  /** The mixer's picture channel gain. */
  channel: number;
  /** See `previewLevel`, times the edit's opening or closing fade. */
  level: number;
  transition: TransitionType;
  fit: "cover" | "contain" | "blur_pad";
  /** Filling the frame: the point kept in it, as the render crops. */
  focus: { x: number; y: number } | null;
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

/**
 * The share of full volume the preview plays at. A browser can't play louder
 * than full volume, but a clip or track can be turned up to 200%, as the
 * render does; so the preview plays everything at the same fraction, and a
 * boosted sound is still heard that much louder than the rest, as it is mixed
 * in the render (whose overall loudness is evened out at the end). Only the
 * preview as a whole is quieter.
 */
function previewLevel(timeline: Timeline): number {
  let loudest = 1;
  for (const clip of timeline.clips) loudest = Math.max(loudest, clipGain(timeline, clip));
  for (const item of timeline.audio) loudest = Math.max(loudest, audioGain(timeline, item));
  return 1 / loudest;
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

/** A slip from the edit's clock past this is put right with a seek. */
const SEEK_DRIFT = 0.25;
/** A slip within this (half a frame at 30 fps) is left alone: currentTime itself jitters by about that. */
const DRIFT_DEADBAND = 0.015;
/** How much faster or slower a slipping element is played, per second of slip, and at most. */
const NUDGE_GAIN = 0.6;
const MAX_NUDGE = 0.06;

/**
 * Keeps a playing element on the edit's clock, as the render keeps every
 * track on one: a large slip is a seek, a small one is taken up by playing a
 * touch faster or slower for a moment (unheard: browsers keep the pitch), so a
 * clip's lips and a voiceover stay within a frame of each other in the
 * preview, rather than wandering up to a third of a second apart between
 * seeks.
 */
function followClock(element: HTMLMediaElement, expected: number, speed: number) {
  if (element.readyState < 1) return;
  const drift = element.currentTime - expected;
  if (Math.abs(drift) > SEEK_DRIFT) {
    element.currentTime = expected;
    if (element.playbackRate !== speed) element.playbackRate = speed;
    return;
  }
  const nudge =
    Math.abs(drift) <= DRIFT_DEADBAND
      ? 0
      : Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -drift * NUDGE_GAIN));
  const rate = speed * (1 + nudge);
  if (Math.abs(element.playbackRate - rate) > 0.0005) element.playbackRate = rate;
}

const ClipLayer = memo(function ClipLayer({
  entry,
  asset,
  media,
  role,
  time,
  playing,
  mix,
  channel,
  level,
  transition,
  fit,
  focus,
}: ClipLayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const clip = entry.clip;
  const visible = role !== "preload";

  useEffect(() => {
    const element = video.current;
    if (!element || clip.kind !== "video") return;
    const audible = role !== "preload" && clip.volume * channel > 0;
    const gain = role === "incoming" ? mix : role === "current" && mix > 0 ? 1 - mix : 1;
    element.muted = !audible;
    element.volume = Math.max(0, Math.min(1, clip.volume * channel * gain * level));
    if (role === "preload") {
      if (element.playbackRate !== clip.speed) element.playbackRate = clip.speed;
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - clip.trimStart) > 0.05)
        element.currentTime = clip.trimStart;
      return;
    }
    const expected = sourceTimeFor(entry, Math.max(time, entry.start));
    if (playing) {
      followClock(element, expected, clip.speed);
      if (element.paused) void element.play().catch(() => undefined);
    } else {
      if (element.playbackRate !== clip.speed) element.playbackRate = clip.speed;
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.03)
        element.currentTime = expected;
    }
  }, [
    time,
    playing,
    role,
    mix,
    channel,
    level,
    clip.kind,
    clip.volume,
    clip.speed,
    clip.trimStart,
    entry,
  ]);

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
  // Where a crop sits: the render keeps the same point of the picture in frame.
  const position: CSSProperties =
    fit === "cover" && focus ? { objectPosition: `${focus.x * 100}% ${focus.y * 100}%` } : {};
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
          style={{ ...position, ...motionStyle(clip.motion, progress) }}
          draggable={false}
        />
      )}
      {media && clip.kind === "video" && (
        <video
          ref={video}
          src={media.url}
          poster={media.posterUrl ?? undefined}
          className={`absolute inset-0 size-full ${objectFit}`}
          style={position}
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
  /** The edit's frame rate: a voiceover's pauses are whole frames of it. */
  fps: number;
  voiceRanges: [number, number][];
  /** The gain of the mixer channel the item plays on. */
  channel: number;
  /** See `previewLevel`, times the edit's opening or closing fade. */
  level: number;
}

/** Position in the source for a timeline time, looping the way the render does. */
function audioSourceTime(item: TimelineAudio, elapsed: number): number {
  const length = item.sourceDuration ?? null;
  if (!audioLoops(item) || !length) return item.trimStart + elapsed;
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
  fps,
  voiceRanges,
  channel,
  level,
}: AudioLayerProps) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const length = audioPlayLength(item, total, fps);
    const elapsed = time - item.start;
    const active = elapsed >= 0 && elapsed < length;
    if (!active || item.volume * channel === 0) {
      if (!element.paused) element.pause();
      return;
    }
    // A voiceover held open: silent through each pause, then on from where it stopped.
    const held = voicePosition(item, elapsed, fps);
    if (held.held) {
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - held.source) > 0.03)
        element.currentTime = held.source;
      return;
    }
    const { fadeIn, fadeOut } = audioFades(item, total, fps);
    let gain = item.volume * channel;
    if (fadeIn > 0 && elapsed < fadeIn) gain *= elapsed / fadeIn;
    if (fadeOut > 0 && elapsed > length - fadeOut)
      gain *= Math.max(0, (length - elapsed) / fadeOut);
    if (
      item.role !== "voiceover" &&
      item.duck &&
      voiceRanges.some(([from, to]) => time >= from - 0.25 && time <= to + 0.45)
    ) {
      gain *= item.duckLevel;
    }
    element.volume = Math.max(0, Math.min(1, gain * level));
    const expected = item.role === "voiceover" ? held.source : audioSourceTime(item, elapsed);
    if (playing) {
      followClock(element, expected, 1);
      if (element.paused) void element.play().catch(() => undefined);
    } else {
      if (element.playbackRate !== 1) element.playbackRate = 1;
      if (!element.paused) element.pause();
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > 0.03)
        element.currentTime = expected;
    }
  }, [item, time, playing, total, fps, voiceRanges, channel, level]);

  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
    };
  }, []);

  if (!url) return null;
  return <audio ref={audio} src={url} preload="auto" loop={audioLoops(item)} />;
});

/* ------------------------------------------------------------------ */
/* Pictures over the edit, and the platform's clear area               */
/* ------------------------------------------------------------------ */

/** Logos and pictures laid over the edit, fading in and out as the render fades them. */
function ImageLayer({
  timeline,
  time,
  media,
}: {
  timeline: Timeline;
  time: number;
  media: Map<string, SignedMedia>;
}) {
  const shown = timeline.images.filter((image) => time >= image.start && time < image.end);
  if (!shown.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="preview-images">
      {shown.map((image) => {
        const url = media.get(image.assetId)?.url;
        if (!url) return null;
        const fade = Math.max(0.001, image.fade);
        const level = Math.min(1, (time - image.start) / fade, (image.end - time) / fade);
        return (
          <img
            key={image.id}
            src={url}
            alt=""
            style={{
              position: "absolute",
              left: `${image.x * 100}%`,
              top: `${image.y * 100}%`,
              width: `${image.width * 100}%`,
              transform: "translate(-50%, -50%)",
              opacity: image.opacity * Math.max(0, level),
            }}
          />
        );
      })}
    </div>
  );
}

/** Where the chosen platform's own buttons and captions cover the picture, shaded. */
function SafeAreaGuide({ timeline }: { timeline: Timeline }) {
  if (timeline.safeArea === "none") return null;
  const insets = safeInsets(timeline.safeArea as SafeArea, timeline.aspectRatio);
  const shade = "rgba(244, 63, 94, 0.18)";
  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="safe-area-guide">
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: `${insets.top * 100}%`, background: shade }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${insets.bottom * 100}%`, background: shade }}
      />
      <div
        className="absolute left-0"
        style={{
          top: `${insets.top * 100}%`,
          bottom: `${insets.bottom * 100}%`,
          width: `${insets.left * 100}%`,
          background: shade,
        }}
      />
      <div
        className="absolute right-0"
        style={{
          top: `${insets.top * 100}%`,
          bottom: `${insets.bottom * 100}%`,
          width: `${insets.right * 100}%`,
          background: shade,
        }}
      />
      <div
        className="absolute border border-dashed border-white/70"
        style={{
          top: `${insets.top * 100}%`,
          bottom: `${insets.bottom * 100}%`,
          left: `${insets.left * 100}%`,
          right: `${insets.right * 100}%`,
        }}
      />
    </div>
  );
}

/** A brand font's stack, falling back to Inter as the render does. */
function fontStack(family: string | null): string {
  return family
    ? `"${family}", Inter, ui-sans-serif, system-ui, sans-serif`
    : "Inter, ui-sans-serif, system-ui, sans-serif";
}

/** A #rrggbb colour at some opacity. */
function tint(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

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
    const { style, position, size, font, color, accent } = timeline.captions;
    const fontSize = short * 0.058 * size * scale;
    const base: CSSProperties = {
      position: "absolute",
      left: "8%",
      right: "8%",
      textAlign: "center",
      fontFamily: fontStack(font),
      // A brand font is set as it was drawn.
      fontWeight: font ? 400 : style === "minimal" ? 500 : 700,
      fontSize,
      lineHeight: 1.2,
      color: style === "bold" ? (accent ?? "#ffe500") : (color ?? "#ffffff"),
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
                    background: timeline.captions.accent
                      ? tint(timeline.captions.accent, 0.65)
                      : "rgba(0,0,0,0.65)",
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
          fontFamily: fontStack(overlay.font),
          // A brand font is set as it was drawn.
          fontWeight: overlay.font ? 400 : overlay.style === "subtitle" ? 500 : 800,
          fontSize: size,
          lineHeight: 1.15,
          whiteSpace: "pre-line",
        };
        if (overlay.y !== null) {
          style.top = `${overlay.y * 100}%`;
          style.transform = "translateY(-50%)";
        } else if (overlay.position === "top") style.top = `${(portrait ? 0.16 : 0.1) * 100}%`;
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
                  background: overlay.accent ?? "#fff",
                  color: overlay.color ?? "#000",
                  padding: "0.25em 0.6em",
                  borderRadius: 4,
                }}
              >
                {overlay.text}
              </span>
            ) : (
              <span
                style={
                  overlay.backing === "box"
                    ? {
                        color: overlay.color ?? "#fff",
                        background: overlay.accent
                          ? tint(overlay.accent, 0.65)
                          : "rgba(0,0,0,0.65)",
                        padding: "0.15em 0.4em",
                        boxDecorationBreak: "clone",
                        WebkitBoxDecorationBreak: "clone",
                      }
                    : overlay.backing === "halo"
                      ? {
                          color: overlay.color ?? "#fff",
                          textShadow:
                            "0 0 0.12em rgba(0,0,0,0.6), 0 0 0.3em rgba(0,0,0,0.55), 0 0.05em 0.25em rgba(0,0,0,0.6)",
                        }
                      : {
                          color: overlay.color ?? "#fff",
                          textShadow: "0 0 6px #000, 0 2px 8px #000",
                        }
                }
              >
                {overlay.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
