/**
 * The Editor's timeline: an ordered picture track of clips and stills, audio
 * lanes (voiceover, music, effects), captions and title overlays.
 *
 * This module is shared by the editor UI, the render server function and the
 * tests. Its layout maths mirrors the media worker's render plan exactly
 * (frame-aligned timings, transitions shortened to fit), so what the editor
 * shows is what the render produces.
 */
import { z } from "zod";

export const ASPECT_RATIOS = ["9:16", "1:1", "4:5", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_LABELS: Record<AspectRatio, string> = {
  "9:16": "9:16 · Reels, TikTok, Stories",
  "1:1": "1:1 · Square feed",
  "4:5": "4:5 · Portrait feed",
  "16:9": "16:9 · YouTube, web",
};

export const RESOLUTIONS = ["720p", "1080p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const FPS_OPTIONS = [24, 25, 30, 60] as const;
export type Fps = (typeof FPS_OPTIONS)[number];

export const FITS = ["cover", "contain", "blur_pad"] as const;
export type Fit = (typeof FITS)[number];
export const FIT_LABELS: Record<Fit, string> = {
  cover: "Fill (crop to frame)",
  contain: "Fit (letterbox)",
  blur_pad: "Fit on blurred fill",
};

export const MOTIONS = [
  "none",
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
  "pan_up",
  "pan_down",
] as const;
export type Motion = (typeof MOTIONS)[number];
export const MOTION_LABELS: Record<Motion, string> = {
  none: "No motion",
  zoom_in: "Slow zoom in",
  zoom_out: "Slow zoom out",
  pan_left: "Pan left",
  pan_right: "Pan right",
  pan_up: "Pan up",
  pan_down: "Pan down",
};

/** Transitions offered in the editor; ids are the renderer's names. */
export const TRANSITIONS = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Cross-fade" },
  { id: "dissolve", label: "Dissolve" },
  { id: "fadeblack", label: "Dip to black" },
  { id: "fadewhite", label: "Dip to white" },
  { id: "slideleft", label: "Slide left" },
  { id: "slideright", label: "Slide right" },
  { id: "slideup", label: "Slide up" },
  { id: "slidedown", label: "Slide down" },
  { id: "wipeleft", label: "Wipe left" },
  { id: "wiperight", label: "Wipe right" },
  { id: "wipeup", label: "Wipe up" },
  { id: "wipedown", label: "Wipe down" },
  { id: "smoothleft", label: "Smooth left" },
  { id: "smoothright", label: "Smooth right" },
  { id: "smoothup", label: "Smooth up" },
  { id: "smoothdown", label: "Smooth down" },
  { id: "circleopen", label: "Circle open" },
  { id: "circleclose", label: "Circle close" },
  { id: "radial", label: "Radial" },
  { id: "zoomin", label: "Zoom in" },
  { id: "pixelize", label: "Pixelate" },
  { id: "hblur", label: "Blur" },
] as const;
export type TransitionType = (typeof TRANSITIONS)[number]["id"];
const TRANSITION_IDS = TRANSITIONS.map((transition) => transition.id) as [
  TransitionType,
  ...TransitionType[],
];

export const AUDIO_ROLES = ["voiceover", "music", "sfx"] as const;
export type AudioRole = (typeof AUDIO_ROLES)[number];
export const AUDIO_ROLE_LABELS: Record<AudioRole, string> = {
  voiceover: "Voiceover",
  music: "Music",
  sfx: "Sound effect",
};

export const CAPTION_STYLES = ["clean", "boxed", "bold", "minimal"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];
export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  clean: "Clean · white with outline",
  boxed: "Boxed · white on dark box",
  bold: "Bold · yellow with outline",
  minimal: "Minimal · thin white",
};
export const CAPTION_POSITIONS = ["bottom", "lower_third", "center", "top"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];
export const CAPTION_POSITION_LABELS: Record<CaptionPosition, string> = {
  bottom: "Bottom",
  lower_third: "Lower third",
  center: "Centre",
  top: "Top",
};

export const OVERLAY_STYLES = ["title", "subtitle", "cta"] as const;
export type OverlayStyle = (typeof OVERLAY_STYLES)[number];
export const OVERLAY_STYLE_LABELS: Record<OverlayStyle, string> = {
  title: "Title",
  subtitle: "Subtitle",
  cta: "Call to action",
};
export const OVERLAY_POSITIONS = ["top", "center", "bottom"] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export const LIMITS = {
  clips: 60,
  audio: 16,
  captions: 600,
  overlays: 20,
  totalSeconds: 600,
  clipSeconds: 300,
  transitionSeconds: 3,
  captionChars: 220,
  overlayChars: 160,
} as const;

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);

export const clipSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().uuid(),
  kind: z.enum(["video", "image"]),
  trimStart: finite(0, 86_400).default(0),
  duration: finite(0.1, LIMITS.clipSeconds),
  speed: finite(0.25, 4).default(1),
  volume: finite(0, 2).default(1),
  fit: z.enum(FITS).nullable().default(null),
  motion: z.enum(MOTIONS).default("none"),
  transition: z
    .object({ type: z.enum(TRANSITION_IDS), duration: finite(0, LIMITS.transitionSeconds) })
    .default({ type: "cut", duration: 0 }),
  label: z.string().max(200).optional(),
  /** Length of the source media, cached so the editor can bound trims. */
  sourceDuration: z.number().finite().positive().nullable().optional(),
});
export type TimelineClip = z.infer<typeof clipSchema>;

export const audioSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().uuid(),
  role: z.enum(AUDIO_ROLES),
  start: finite(0, LIMITS.totalSeconds).default(0),
  trimStart: finite(0, 86_400).default(0),
  /** Seconds to play; null plays to the end of the source (or the picture). */
  duration: finite(0.1, LIMITS.totalSeconds).nullable().default(null),
  volume: finite(0, 2).default(1),
  fadeIn: finite(0, 10).default(0),
  fadeOut: finite(0, 10).default(0),
  loop: z.boolean().default(false),
  duck: z.boolean().default(true),
  duckLevel: finite(0.05, 1).default(0.25),
  label: z.string().max(200).optional(),
  sourceDuration: z.number().finite().positive().nullable().optional(),
});
export type TimelineAudio = z.infer<typeof audioSchema>;

export const captionSegmentSchema = z.object({
  start: finite(0, LIMITS.totalSeconds),
  end: finite(0, LIMITS.totalSeconds),
  text: z.string().max(LIMITS.captionChars),
});
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;

export const captionsSchema = z.object({
  enabled: z.boolean().default(false),
  style: z.enum(CAPTION_STYLES).default("clean"),
  position: z.enum(CAPTION_POSITIONS).default("lower_third"),
  size: finite(0.5, 2).default(1),
  uppercase: z.boolean().default(false),
  segments: z.array(captionSegmentSchema).max(LIMITS.captions).default([]),
});
export type Captions = z.infer<typeof captionsSchema>;

export const overlaySchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(LIMITS.overlayChars),
  start: finite(0, LIMITS.totalSeconds),
  end: finite(0, LIMITS.totalSeconds),
  style: z.enum(OVERLAY_STYLES).default("title"),
  position: z.enum(OVERLAY_POSITIONS).default("center"),
});
export type Overlay = z.infer<typeof overlaySchema>;

export const timelineSchema = z.object({
  version: z.literal(1).default(1),
  aspectRatio: z.enum(ASPECT_RATIOS).default("9:16"),
  resolution: z.enum(RESOLUTIONS).default("1080p"),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  fit: z.enum(FITS).default("cover"),
  clips: z.array(clipSchema).max(LIMITS.clips).default([]),
  audio: z.array(audioSchema).max(LIMITS.audio).default([]),
  captions: captionsSchema.default({}),
  overlays: z.array(overlaySchema).max(LIMITS.overlays).default([]),
  fadeIn: finite(0, 3).default(0),
  fadeOut: finite(0, 3).default(0),
  normalizeLoudness: z.boolean().default(true),
});
export type Timeline = z.infer<typeof timelineSchema>;

export function emptyTimeline(aspectRatio: AspectRatio = "9:16"): Timeline {
  return timelineSchema.parse({ aspectRatio });
}

/** Reads a stored timeline, filling defaults; returns null when it cannot be repaired. */
export function parseTimeline(value: unknown): Timeline | null {
  const result = timelineSchema.safeParse(value ?? {});
  return result.success ? result.data : null;
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Frame size                                                          */
/* ------------------------------------------------------------------ */

export function frameSize(
  aspectRatio: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const short = resolution === "720p" ? 720 : 1080;
  switch (aspectRatio) {
    case "9:16":
      return { width: short, height: Math.round((short * 16) / 9) };
    case "1:1":
      return { width: short, height: short };
    case "4:5":
      return { width: short, height: Math.round((short * 5) / 4) };
    case "16:9":
      return { width: Math.round((short * 16) / 9), height: short };
  }
}

/** Best aspect ratio for a set of model or brief values such as "9:16", "portrait" or "1080x1920". */
export function aspectFromValue(value: unknown): AspectRatio | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if ((ASPECT_RATIOS as readonly string[]).includes(text)) return text as AspectRatio;
  if (/portrait|vertical|story|stories|reel|tiktok/.test(text)) return "9:16";
  if (/square/.test(text)) return "1:1";
  if (/landscape|widescreen|youtube/.test(text)) return "16:9";
  const ratio = /^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!ratio) return null;
  const quotient = Number(ratio[1]) / Number(ratio[2]);
  if (!Number.isFinite(quotient) || quotient <= 0) return null;
  const candidates: [AspectRatio, number][] = [
    ["9:16", 9 / 16],
    ["4:5", 4 / 5],
    ["1:1", 1],
    ["16:9", 16 / 9],
  ];
  return candidates.reduce((best, entry) =>
    Math.abs(Math.log(entry[1] / quotient)) < Math.abs(Math.log(best[1] / quotient)) ? entry : best,
  )[0];
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface LaidOutClip {
  clip: TimelineClip;
  index: number;
  /** Where the clip begins on the timeline (seconds), including its incoming transition. */
  start: number;
  end: number;
  /** Effective incoming transition after shortening (seconds); 0 is a cut. */
  transitionIn: number;
  transitionType: TransitionType;
}

export interface TimelineLayout {
  clips: LaidOutClip[];
  total: number;
  totalFrames: number;
}

/**
 * Positions every clip exactly as the renderer will: durations and
 * transitions on the frame grid, the first clip without a transition, and
 * transitions shortened so they fit both neighbours without overlapping.
 */
export function layoutTimeline(timeline: Pick<Timeline, "clips" | "fps">): TimelineLayout {
  const fps = timeline.fps;
  const frames = timeline.clips.map((clip) => Math.max(2, Math.round(clip.duration * fps)));
  const transitions = timeline.clips.map((clip, index) => {
    if (index === 0 || clip.transition.type === "cut") return 0;
    return Math.round(clip.transition.duration * fps);
  });
  for (let index = 1; index < transitions.length; index += 1) {
    if (transitions[index] === 0) continue;
    const room = Math.min(frames[index - 1]! - transitions[index - 1]!, frames[index]!) - 1;
    transitions[index] = Math.max(0, Math.min(transitions[index]!, room));
    if (transitions[index]! < 2) transitions[index] = 0;
  }

  const clips: LaidOutClip[] = [];
  let cursor = 0;
  timeline.clips.forEach((clip, index) => {
    const startFrame = cursor - transitions[index]!;
    cursor = startFrame + frames[index]!;
    clips.push({
      clip,
      index,
      start: startFrame / fps,
      end: cursor / fps,
      transitionIn: transitions[index]! / fps,
      transitionType: transitions[index]! > 0 ? clip.transition.type : "cut",
    });
  });
  return { clips, total: cursor / fps, totalFrames: cursor };
}

/** The clip on screen at a time, and the one fading in over it during a transition. */
export function clipsAt(
  layout: TimelineLayout,
  time: number,
): { current: LaidOutClip | null; incoming: LaidOutClip | null; mix: number } {
  if (!layout.clips.length) return { current: null, incoming: null, mix: 0 };
  const t = Math.max(0, Math.min(time, Math.max(0, layout.total - 1e-6)));
  let current: LaidOutClip | null = null;
  for (const entry of layout.clips) {
    if (t >= entry.start && t < entry.end) {
      current = entry;
      break;
    }
  }
  current ??= layout.clips.at(-1)!;
  const next = layout.clips[current.index + 1];
  if (next && next.transitionIn > 0 && t >= next.start) {
    return { current, incoming: next, mix: Math.min(1, (t - next.start) / next.transitionIn) };
  }
  return { current, incoming: null, mix: 0 };
}

/** Where a timeline time falls inside a clip's source media. */
export function sourceTimeFor(entry: LaidOutClip, time: number): number {
  const clip = entry.clip;
  if (clip.kind === "image") return 0;
  return clip.trimStart + Math.max(0, time - entry.start) * clip.speed;
}

/** Longest a clip may run given its source, trim and speed. */
export function maxClipDuration(
  clip: Pick<TimelineClip, "kind" | "trimStart" | "speed" | "sourceDuration">,
): number {
  if (clip.kind === "image" || !clip.sourceDuration) return LIMITS.clipSeconds;
  return Math.max(
    0.1,
    Math.min(LIMITS.clipSeconds, (clip.sourceDuration - clip.trimStart) / clip.speed),
  );
}

export function formatTime(seconds: number, withTenths = true): string {
  // Work in whole tenths so 6.6 (6.6000000001 or 6.5999999999) reads as 0:06.6.
  const tenthsTotal = Math.floor(Math.max(0, seconds) * 10 + 1e-6);
  const minutes = Math.floor(tenthsTotal / 600);
  const whole = Math.floor((tenthsTotal % 600) / 10);
  const tenths = tenthsTotal % 10;
  return `${minutes}:${String(whole).padStart(2, "0")}${withTenths ? `.${tenths}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Edits (pure)                                                        */
/* ------------------------------------------------------------------ */

export interface ClipSource {
  assetId: string;
  kind: "video" | "image";
  durationSeconds: number | null;
  title?: string | null;
}

export const DEFAULT_STILL_SECONDS = 3;

export function clipFromSource(
  source: ClipSource,
  options: { transition?: TimelineClip["transition"] } = {},
): TimelineClip {
  const sourceDuration =
    source.durationSeconds && source.durationSeconds > 0 ? source.durationSeconds : null;
  return clipSchema.parse({
    id: newId(),
    assetId: source.assetId,
    kind: source.kind,
    trimStart: 0,
    duration:
      source.kind === "image"
        ? DEFAULT_STILL_SECONDS
        : Math.min(sourceDuration ?? 5, LIMITS.clipSeconds),
    motion: source.kind === "image" ? "zoom_in" : "none",
    transition: options.transition ?? { type: "cut", duration: 0 },
    label: source.title ?? undefined,
    sourceDuration,
  });
}

export function insertClips(
  timeline: Timeline,
  clips: TimelineClip[],
  at = timeline.clips.length,
): Timeline {
  const room = LIMITS.clips - timeline.clips.length;
  const next = [...timeline.clips];
  next.splice(Math.max(0, Math.min(at, next.length)), 0, ...clips.slice(0, Math.max(0, room)));
  return { ...timeline, clips: next };
}

export function moveClip(timeline: Timeline, from: number, to: number): Timeline {
  if (from === to || from < 0 || from >= timeline.clips.length) return timeline;
  const next = [...timeline.clips];
  const [clip] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, clip!);
  return { ...timeline, clips: next };
}

export function updateClip(timeline: Timeline, id: string, patch: Partial<TimelineClip>): Timeline {
  return {
    ...timeline,
    clips: timeline.clips.map((clip) => {
      if (clip.id !== id) return clip;
      const merged = { ...clip, ...patch };
      const trimStart = merged.kind === "image" ? 0 : Math.max(0, merged.trimStart);
      const bounded = { ...merged, trimStart };
      const duration = Math.max(0.1, Math.min(merged.duration, maxClipDuration(bounded)));
      return { ...bounded, duration };
    }),
  };
}

export function removeClip(timeline: Timeline, id: string): Timeline {
  return { ...timeline, clips: timeline.clips.filter((clip) => clip.id !== id) };
}

export function duplicateClip(timeline: Timeline, id: string): Timeline {
  const index = timeline.clips.findIndex((clip) => clip.id === id);
  if (index === -1 || timeline.clips.length >= LIMITS.clips) return timeline;
  const copy = { ...timeline.clips[index]!, id: newId() };
  return insertClips(timeline, [copy], index + 1);
}

/**
 * Splits the clip under a timeline time into two clips that play the same
 * footage back to back. The second half starts with a cut. During a
 * transition two clips are under the playhead: `clipId` names the one meant
 * (the one selected); without it, or if it isn't under the playhead, it is
 * the earlier one.
 */
export function splitClipAt(timeline: Timeline, time: number, clipId?: string | null): Timeline {
  const layout = layoutTimeline(timeline);
  const under = (item: LaidOutClip) => time > item.start + 0.1 && time < item.end - 0.1;
  const entry =
    (clipId ? layout.clips.find((item) => item.clip.id === clipId && under(item)) : undefined) ??
    layout.clips.find(under);
  if (!entry || timeline.clips.length >= LIMITS.clips) return timeline;
  const clip = entry.clip;
  const firstDuration = time - entry.start;
  const first: TimelineClip = { ...clip, duration: firstDuration };
  const second: TimelineClip = {
    ...clip,
    id: newId(),
    trimStart: clip.kind === "image" ? 0 : clip.trimStart + firstDuration * clip.speed,
    duration: clip.duration - firstDuration,
    transition: { type: "cut", duration: 0 },
  };
  const clips = [...timeline.clips];
  clips.splice(entry.index, 1, first, second);
  return { ...timeline, clips };
}

/**
 * A time taken from the playhead for something placed on the edit. The picture
 * may run past what an edit can hold while it is being cut down, and with it
 * the playhead: what is placed stays within the limit.
 */
export function placeAt(seconds: number): number {
  return Number(Math.min(LIMITS.totalSeconds, Math.max(0, seconds)).toFixed(2));
}

export function audioFromSource(
  source: { assetId: string; durationSeconds: number | null; title?: string | null },
  role: AudioRole,
  start = 0,
): TimelineAudio {
  return audioSchema.parse({
    id: newId(),
    assetId: source.assetId,
    role,
    start: placeAt(start),
    volume: role === "music" ? 0.6 : 1,
    fadeIn: role === "music" ? 0.5 : 0,
    fadeOut: role === "music" ? 1.5 : 0,
    loop: role === "music",
    duck: role === "music",
    label: source.title ?? undefined,
    sourceDuration:
      source.durationSeconds && source.durationSeconds > 0 ? source.durationSeconds : null,
  });
}

/** Keeps an audio item inside the limits the schema (and the renderer) accept. */
export function clampAudio(item: TimelineAudio): TimelineAudio {
  const round = (value: number) => Number(value.toFixed(3));
  return {
    ...item,
    start: round(Math.min(LIMITS.totalSeconds, Math.max(0, item.start))),
    trimStart: round(Math.min(86_400, Math.max(0, item.trimStart))),
    duration:
      item.duration === null
        ? null
        : round(Math.min(LIMITS.totalSeconds, Math.max(0.1, item.duration))),
  };
}

/** Whether an audio item loops: only music beds do, in the preview and the render alike. */
export function audioLoops(item: Pick<TimelineAudio, "role" | "loop">): boolean {
  return item.role === "music" && item.loop;
}

/** Seconds of an audio item that actually play within a picture of `total` seconds. */
export function audioPlayLength(item: TimelineAudio, total: number): number {
  if (item.start >= total) return 0;
  const available =
    audioLoops(item) || !item.sourceDuration
      ? Infinity
      : Math.max(0, item.sourceDuration - item.trimStart);
  return Math.max(0, Math.min(item.duration ?? Infinity, available, total - item.start));
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Splits a script into caption cards of a few words each and spreads them
 * over [start, end] in proportion to their length, breaking at punctuation
 * where it can. Used when no word timing is available. The cards stay within
 * what an edit can hold, even while the picture runs longer.
 */
export function captionsFromScript(
  script: string,
  from: number,
  until: number,
  maxChars = 42,
): CaptionSegment[] {
  const start = Math.min(Math.max(0, from), LIMITS.totalSeconds);
  const end = Math.min(until, LIMITS.totalSeconds);
  const words = script.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length || end - start < 0.2) return [];
  const cards: string[] = [];
  let line: string[] = [];
  const flush = () => {
    if (line.length) cards.push(line.join(" "));
    line = [];
  };
  for (const word of words) {
    if (line.length && `${line.join(" ")} ${word}`.length > maxChars) flush();
    line.push(word);
    if (/[.!?;:]$/.test(word) || (/,$/.test(word) && line.join(" ").length > maxChars * 0.6))
      flush();
  }
  flush();

  const weights = cards.map((card) => card.length + 6);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const span = end - start;
  const segments: CaptionSegment[] = [];
  let cursor = start;
  cards.forEach((card, index) => {
    const length = (span * weights[index]!) / totalWeight;
    segments.push({
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + length).toFixed(3)),
      text: card.slice(0, LIMITS.captionChars),
    });
    cursor += length;
  });
  return segments.slice(0, LIMITS.captions);
}

/* ------------------------------------------------------------------ */
/* Render request                                                      */
/* ------------------------------------------------------------------ */

export interface RenderSource {
  assetId: string;
  role: "video" | "image" | "audio";
}

/**
 * The media worker's render_sequence parameters for a timeline, plus the
 * ordered list of distinct assets it needs (one download per asset).
 */
export function buildRenderRequest(timeline: Timeline): {
  sources: RenderSource[];
  params: Record<string, unknown>;
} {
  const sources: RenderSource[] = [];
  const indexFor = (assetId: string, role: RenderSource["role"]) => {
    const existing = sources.findIndex(
      (source) => source.assetId === assetId && source.role === role,
    );
    if (existing !== -1) return existing;
    sources.push({ assetId, role });
    return sources.length - 1;
  };
  const { width, height } = frameSize(timeline.aspectRatio, timeline.resolution);
  const layout = layoutTimeline(timeline);

  const clips = timeline.clips.map((clip) => ({
    source_index: indexFor(clip.assetId, clip.kind),
    kind: clip.kind,
    trim_start: clip.kind === "image" ? 0 : clip.trimStart,
    duration: clip.duration,
    speed: clip.kind === "image" ? 1 : clip.speed,
    volume: clip.kind === "image" ? 0 : clip.volume,
    fit: clip.fit ?? timeline.fit,
    motion: clip.kind === "image" ? clip.motion : "none",
    transition: {
      type: clip.transition.type,
      duration: clip.transition.type === "cut" ? 0 : clip.transition.duration,
    },
  }));

  const audio = timeline.audio
    .filter((item) => item.start < layout.total && item.volume > 0)
    .map((item) => ({
      source_index: indexFor(item.assetId, "audio"),
      role: item.role,
      start: item.start,
      trim_start: item.trimStart,
      duration: item.duration,
      volume: item.volume,
      fade_in: item.fadeIn,
      fade_out: item.fadeOut,
      loop: audioLoops(item),
      duck: item.role === "music" ? item.duck : false,
      duck_level: item.duckLevel,
    }));

  const segments = timeline.captions.enabled
    ? timeline.captions.segments
        .filter(
          (segment) =>
            segment.text.trim() && segment.end > segment.start && segment.start < layout.total,
        )
        .map((segment) => ({
          start: segment.start,
          end: Math.min(segment.end, layout.total),
          text: segment.text,
        }))
    : [];

  const overlays = timeline.overlays
    .filter(
      (overlay) =>
        overlay.text.trim() && overlay.end > overlay.start && overlay.start < layout.total,
    )
    .map((overlay) => ({
      text: overlay.text,
      start: overlay.start,
      end: Math.min(overlay.end, layout.total),
      style: overlay.style,
      position: overlay.position,
    }));

  return {
    sources,
    params: {
      width,
      height,
      fps: timeline.fps,
      fit: timeline.fit,
      clips,
      audio,
      captions: segments.length
        ? {
            style: timeline.captions.style,
            position: timeline.captions.position,
            size: timeline.captions.size,
            uppercase: timeline.captions.uppercase,
            segments,
          }
        : null,
      overlays,
      fade_in: timeline.fadeIn,
      fade_out: timeline.fadeOut,
      normalize_loudness: timeline.normalizeLoudness,
    },
  };
}

/** Problems that stop a render, in plain words. Empty when the timeline can render. */
export function renderBlockers(timeline: Timeline): string[] {
  const problems: string[] = [];
  if (!timeline.clips.length) problems.push("Add at least one clip to the picture track.");
  const total = layoutTimeline(timeline).total;
  if (total > LIMITS.totalSeconds)
    problems.push(`The edit runs ${Math.round(total)}s; the limit is ${LIMITS.totalSeconds}s.`);
  return problems;
}
