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
import { compositionClipSchema } from "../compositions/spec";
import { FONT_FAMILY_PATTERN, isBrandFontFile } from "./font-family";

export const ASPECT_RATIOS = [
  "9:16",
  "1:1",
  "4:5",
  "16:9",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "21:9",
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_LABELS: Record<AspectRatio, string> = {
  "9:16": "9:16 · Reels, TikTok, Stories",
  "1:1": "1:1 · Square feed",
  "4:5": "4:5 · Portrait feed",
  "16:9": "16:9 · YouTube, web",
  "3:4": "3:4 · Portrait",
  "4:3": "4:3 · Classic landscape",
  "2:3": "2:3 · Pinterest, posters",
  "3:2": "3:2 · Photo landscape",
  "21:9": "21:9 · Cinema widescreen",
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
/**
 * What keeps a title readable over the picture: its outline (as titles always
 * had), a soft dark halo (white text that reads on a white flash as well as
 * on a dark shot), or a box behind it.
 */
export const OVERLAY_BACKINGS = ["outline", "halo", "box"] as const;
export type OverlayBacking = (typeof OVERLAY_BACKINGS)[number];
export const OVERLAY_BACKING_LABELS: Record<OverlayBacking, string> = {
  outline: "Outline",
  halo: "Soft halo",
  box: "Box behind",
};

/**
 * How a clip made at another frame rate (24 fps B-roll in a 30 fps edit) is
 * brought to the edit's: frames repeated (quick; a slow camera move can
 * judder), neighbouring frames blended, or new frames made from the motion
 * between them (smoothest, and much slower to render).
 */
export const FRAME_RATE_CONVERSIONS = ["duplicate", "blend", "motion"] as const;
export type FrameRateConversion = (typeof FRAME_RATE_CONVERSIONS)[number];
export const FRAME_RATE_CONVERSION_LABELS: Record<FrameRateConversion, string> = {
  duplicate: "Repeat frames (fastest)",
  blend: "Blend frames",
  motion: "Motion-interpolate (smoothest, slow)",
};

/** How pictures smaller than the frame are scaled up: as before, or sharper (720p clips in a 1080p edit). */
export const UPSCALES = ["standard", "sharp"] as const;
export type Upscale = (typeof UPSCALES)[number];
export const UPSCALE_LABELS: Record<Upscale, string> = {
  standard: "Standard",
  sharp: "Sharp (Lanczos)",
};

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
  /** Pictures over the edit (a logo) and brand font files. */
  images: 8,
  fonts: 4,
  /** Pauses a voiceover is held open by, and the most frames one adds. */
  pauses: 200,
  pauseFrames: 300,
} as const;

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
/** A colour as #rrggbb, or null for the style's own. */
const hexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase())
  .nullable()
  .default(null);
/** A brand font's family (see ./font-family), or null for Inter. */
const fontName = z.string().regex(FONT_FAMILY_PATTERN).nullable().default(null);

export const clipSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().uuid(),
  kind: z.enum(["video", "image"]),
  trimStart: finite(0, 86_400).default(0),
  duration: finite(0.1, LIMITS.clipSeconds),
  speed: finite(0.25, 4).default(1),
  volume: finite(0, 2).default(1),
  fit: z.enum(FITS).nullable().default(null),
  /** Filling the frame: the point of the picture (0-1 across and down) kept in it; null for the centre. */
  focus: z
    .object({ x: finite(0, 1), y: finite(0, 1) })
    .nullable()
    .default(null),
  motion: z.enum(MOTIONS).default("none"),
  transition: z
    .object({ type: z.enum(TRANSITION_IDS), duration: finite(0, LIMITS.transitionSeconds) })
    .default({ type: "cut", duration: 0 }),
  /**
   * The clip carries straight on from the clip before it (a long video's
   * join): the render matches its colour to that clip's last frame, easing
   * back to its own over a couple of seconds.
   */
  matchPrevious: z.boolean().default(false),
  /**
   * The join into this clip is smart-blended: the render puts the two clips
   * back in register at the cut (framing, colour, detail and sound), each
   * easing back to the clip's own over a few seconds. See JOIN_MODES.
   */
  smartBlend: z.boolean().default(false),
  label: z.string().max(200).optional(),
  /** Length of the source media, cached so the editor can bound trims. */
  sourceDuration: z.number().finite().positive().nullable().optional(),
  /**
   * The clip is a composition (motion graphics as code, see ../compositions):
   * its file is a drawing of it, and the render takes that drawing's lossless
   * master instead.
   */
  composition: compositionClipSchema.nullable().optional(),
});
export type TimelineClip = z.infer<typeof clipSchema>;

/**
 * Room to breathe in a voiceover without stretching a word: `frames` whole
 * frames (of the edit's frame rate) of silence put in at `at`, a moment of
 * the recording's own (seconds on its clock, as trimStart is). A pause sits
 * only in one of the voiceover's measured silences (see ./voice-pauses).
 */
export const voicePauseSchema = z.object({
  at: finite(0, 86_400),
  frames: z.number().int().min(1).max(LIMITS.pauseFrames),
});
export type VoicePause = z.infer<typeof voicePauseSchema>;

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
  /** A voiceover held open in its silences, in the recording's order (see voicePauseSchema). */
  pauses: z.array(voicePauseSchema).max(LIMITS.pauses).transform(sortedPauses).default([]),
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
  /** A brand's look: its font, text colour and accent (the box, or bold captions' text). */
  font: fontName,
  color: hexColour,
  accent: hexColour,
  segments: z.array(captionSegmentSchema).max(LIMITS.captions).default([]),
});
export type Captions = z.infer<typeof captionsSchema>;

/** A cubic-bezier curve's four numbers (x1, y1, x2, y2), as a brand's code writes its easing. */
const easeSchema = z.tuple([finite(0, 1), finite(-2, 3), finite(0, 1), finite(-2, 3)]);

/**
 * How a title comes in and goes, in a brand's own motion (its kit's enter and
 * exit roles, see ../brand/production and ./overlay-motion): how long each
 * takes, on which curve, and how far it rises into place, as a share of its
 * own size (it lifts half that as it goes). Without one a title fades in and
 * out over a quarter of a second, as titles always have.
 */
export const overlayMotionSchema = z.object({
  enter: finite(0, 2),
  exit: finite(0, 2),
  enterEase: easeSchema,
  exitEase: easeSchema,
  rise: finite(0, 1).default(0.3),
});
export type OverlayMotion = z.infer<typeof overlayMotionSchema>;

export const overlaySchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(LIMITS.overlayChars),
  start: finite(0, LIMITS.totalSeconds),
  end: finite(0, LIMITS.totalSeconds),
  style: z.enum(OVERLAY_STYLES).default("title"),
  position: z.enum(OVERLAY_POSITIONS).default("center"),
  /** Its height on the frame (the middle of the text, 0 top to 1 bottom); null: by its position. */
  y: finite(0.04, 0.96).nullable().default(null),
  backing: z.enum(OVERLAY_BACKINGS).default("outline"),
  /** A brand's look: its font, text colour and accent (a box's, or a call to action's badge). */
  font: fontName,
  color: hexColour,
  accent: hexColour,
  /** How it comes in and goes (a brand's motion); none: the quarter-second fade. */
  motion: overlayMotionSchema.nullable().optional(),
});
export type Overlay = z.infer<typeof overlaySchema>;

/** A picture laid over the edit (a brand's logo), centred where it is put. */
export const imageOverlaySchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().uuid(),
  start: finite(0, LIMITS.totalSeconds),
  end: finite(0, LIMITS.totalSeconds),
  /** Its centre, 0-1 across and down the frame. */
  x: finite(0, 1).default(0.5),
  y: finite(0, 1).default(0.5),
  /** Its width as a share of the frame's (its height follows its shape). */
  width: finite(0.03, 1).default(0.3),
  opacity: finite(0, 1).default(1),
  /** Seconds it fades in and out over. */
  fade: finite(0, 2).default(0.3),
  label: z.string().max(200).optional(),
});
export type ImageOverlay = z.infer<typeof imageOverlaySchema>;

/** A brand font file an edit's text is set in (kept where brand fonts are; see ./brand). */
export const fontFileSchema = z
  .object({
    family: z.string().regex(FONT_FAMILY_PATTERN),
    bucket: z.string().max(64),
    path: z.string().max(300),
  })
  .refine(isBrandFontFile, "A font must be one of the brand's own font files");
export type FontFile = z.infer<typeof fontFileSchema>;

/**
 * The mixer's channels: the clips' own sound, the voiceover, and music with
 * sound effects (the timeline's "Music & FX" row).
 */
export const MIX_CHANNELS = ["picture", "voiceover", "audio"] as const;
export type MixChannel = (typeof MIX_CHANNELS)[number];
export const MIX_CHANNEL_LABELS: Record<MixChannel, string> = {
  picture: "Picture",
  voiceover: "Voiceover",
  audio: "Music & FX",
};

/** One channel's fader: a level on top of each item's own volume, and a mute that keeps it. */
export const mixChannelSchema = z.object({
  level: finite(0, 2).default(1),
  muted: z.boolean().default(false),
});
export type MixChannelSettings = z.infer<typeof mixChannelSchema>;

export const mixSchema = z.object({
  picture: mixChannelSchema.default({}),
  voiceover: mixChannelSchema.default({}),
  audio: mixChannelSchema.default({}),
});
export type Mix = z.infer<typeof mixSchema>;

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
  /** Channel levels; an edit saved before the mixer existed plays as it did. */
  mix: mixSchema.default({}),
  /** Clips at another frame rate: see FRAME_RATE_CONVERSIONS. */
  frameRateConversion: z.enum(FRAME_RATE_CONVERSIONS).default("duplicate"),
  upscale: z.enum(UPSCALES).default("standard"),
  /** Pictures laid over the edit (a logo). */
  images: z.array(imageOverlaySchema).max(LIMITS.images).default([]),
  /** The brand font files its text is set in. */
  fonts: z.array(fontFileSchema).max(LIMITS.fonts).default([]),
  /** The brand kit it was styled from, for the Editor to offer again. */
  brandKitId: z.string().uuid().nullable().default(null),
  /** The platform whose clear area the preview shows (see ./brand SAFE_AREAS). */
  safeArea: z.enum(["none", "tiktok", "reels", "shorts", "youtube"]).default("none"),
  /** Hand back the voiceover, music and effects buses as files beside the video (see stemRolesFor). */
  stems: z.boolean().default(false),
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

/** An aspect ratio as width over height. */
export function aspectQuotient(aspectRatio: AspectRatio): number {
  const [width, height] = aspectRatio.split(":").map(Number) as [number, number];
  return width / height;
}

/** The frame an edit renders at: the short side at its resolution, in even pixels. */
export function frameSize(
  aspectRatio: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const short = resolution === "720p" ? 720 : 1080;
  const quotient = aspectQuotient(aspectRatio);
  const even = (value: number) => 2 * Math.round(value / 2);
  return quotient <= 1
    ? { width: short, height: even(short / quotient) }
    : { width: even(short * quotient), height: short };
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
  const gap = (aspect: AspectRatio) => Math.abs(Math.log(aspectQuotient(aspect) / quotient));
  return ASPECT_RATIOS.reduce((best, aspect) => (gap(aspect) < gap(best) ? aspect : best));
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

/**
 * How a clip meets the clip before it in the render, when it carries straight
 * on from it (a long video's join, the clip generated from the frame the one
 * before ends on, which it re-renders a little stretched, lighter or darker,
 * and softer):
 *   - smart: the two are put back in register at the cut: the picture's
 *     framing, colour and detail, and the clips' own sound, each easing back
 *     to the clip's own over a few seconds
 *   - colour: the colour is matched at the cut, easing back
 *   - plain: the join is left as it is
 */
export const JOIN_MODES = ["smart", "colour", "plain"] as const;
export type JoinMode = (typeof JOIN_MODES)[number];
export const JOIN_MODE_LABELS: Record<JoinMode, string> = {
  smart: "Smart blend",
  colour: "Colour match",
  plain: "Plain",
};

export function joinModeOf(clip: TimelineClip): JoinMode {
  if (clip.kind !== "video") return "plain";
  return clip.smartBlend ? "smart" : clip.matchPrevious ? "colour" : "plain";
}

/** The clip fields a join mode sets. A smart blend matches colour too, for a media service without it. */
export function joinFields(mode: JoinMode): Pick<TimelineClip, "smartBlend" | "matchPrevious"> {
  return { smartBlend: mode === "smart", matchPrevious: mode !== "plain" };
}

/** Whether the join into the clip at `index` can be blended: a video clip after a video clip. */
export function canBlendJoin(timeline: Timeline, index: number): boolean {
  return (
    index > 0 &&
    timeline.clips[index]?.kind === "video" &&
    timeline.clips[index - 1]?.kind === "video"
  );
}

/** How many joins between video clips the edit has, and how many are smart-blended. */
export function joinCounts(timeline: Timeline): { joins: number; smart: number } {
  let joins = 0;
  let smart = 0;
  timeline.clips.forEach((clip, index) => {
    if (!canBlendJoin(timeline, index)) return;
    joins += 1;
    if (clip.smartBlend) smart += 1;
  });
  return { joins, smart };
}

/** Every join between two video clips set to `mode`. */
export function withAllJoins(timeline: Timeline, mode: JoinMode): Timeline {
  return {
    ...timeline,
    clips: timeline.clips.map((clip, index) =>
      canBlendJoin(timeline, index) ? { ...clip, ...joinFields(mode) } : clip,
    ),
  };
}

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
    // The same footage carries on unbroken: nothing to match.
    ...joinFields("plain"),
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

/** The mixer channel an audio item plays on. */
export function channelOf(role: AudioRole): MixChannel {
  return role === "voiceover" ? "voiceover" : "audio";
}

/** A channel's gain: its level, or 0 while it is muted. */
export function channelGain(timeline: Pick<Timeline, "mix">, channel: MixChannel): number {
  const settings = timeline.mix[channel];
  return settings.muted ? 0 : settings.level;
}

/** How loud an audio item plays: its own volume through its channel. */
export function audioGain(timeline: Pick<Timeline, "mix">, item: TimelineAudio): number {
  return item.volume * channelGain(timeline, channelOf(item.role));
}

/** How loud a clip's own sound plays: its volume through the picture channel (stills are silent). */
export function clipGain(timeline: Pick<Timeline, "mix">, clip: TimelineClip): number {
  return clip.kind === "video" ? clip.volume * channelGain(timeline, "picture") : 0;
}

/** A copy of the timeline with one mixer channel changed. */
export function withChannel(
  timeline: Timeline,
  channel: MixChannel,
  patch: Partial<MixChannelSettings>,
): Timeline {
  return {
    ...timeline,
    mix: { ...timeline.mix, [channel]: { ...timeline.mix[channel], ...patch } },
  };
}

/** Whether an audio item loops: only music beds do, in the preview and the render alike. */
export function audioLoops(item: Pick<TimelineAudio, "role" | "loop">): boolean {
  return item.role === "music" && item.loop;
}

/**
 * Seconds of an audio item that actually play within a picture of `total`
 * seconds. A voiceover's pauses add their silence to what its recording holds
 * (in whole frames of `fps`, the edit's frame rate).
 */
export function audioPlayLength(item: TimelineAudio, total: number, fps = 30): number {
  if (item.start >= total) return 0;
  const available =
    audioLoops(item) || !item.sourceDuration
      ? Infinity
      : Math.max(0, item.sourceDuration - item.trimStart) +
        pausedSeconds(item, fps, item.sourceDuration);
  return Math.max(0, Math.min(item.duration ?? Infinity, available, total - item.start));
}

/**
 * The fades an audio item plays with in a picture of `total` seconds. The
 * render shortens each to at most half of what the item plays.
 */
export function audioFades(
  item: TimelineAudio,
  total: number,
  fps = 30,
): { fadeIn: number; fadeOut: number } {
  const length = audioPlayLength(item, total, fps);
  return { fadeIn: Math.min(item.fadeIn, length / 2), fadeOut: Math.min(item.fadeOut, length / 2) };
}

/**
 * How much of the picture and sound the edit's opening and closing fades let
 * through at `time` (0–1). The render shortens each fade to at most a third
 * of the edit.
 */
export function editFadeLevel(
  timeline: Pick<Timeline, "fadeIn" | "fadeOut">,
  total: number,
  time: number,
): number {
  const fadeIn = Math.min(timeline.fadeIn, total / 3);
  const fadeOut = Math.min(timeline.fadeOut, total / 3);
  if (fadeIn > 0 && time < fadeIn) return Math.max(0, time / fadeIn);
  if (fadeOut > 0 && time > total - fadeOut) return Math.max(0, (total - time) / fadeOut);
  return 1;
}

/* ------------------------------------------------------------------ */
/* Voiceover pauses                                                    */
/* ------------------------------------------------------------------ */

/*
 * A voiceover held open in its own silences, after Reel 1's pacing
 * (scripts/aurixa-reel-1/pacing.cjs): whole frames of silence go into the
 * recording between its words, and no word is ever stretched. What hangs on
 * the voice moves with it: a word (a caption, a title) by the pauses at or
 * before it, a cut by those strictly before it, so a pause placed exactly on
 * a cut opens the new shot before its first word. The media worker splits the
 * voice at the same moments, to the sample (pausedVoiceChain in
 * media-worker/src/sequence.js), so the preview and the render agree.
 */

/** Two moments closer than this (seconds) are the same moment. */
const SAME_MOMENT = 1e-6;

/** Pauses in the recording's order, one per moment: two at the same moment become one. */
export function sortedPauses(pauses: readonly VoicePause[]): VoicePause[] {
  const merged: VoicePause[] = [];
  for (const pause of [...pauses].sort((a, b) => a.at - b.at)) {
    const last = merged.at(-1);
    if (last && pause.at - last.at < SAME_MOMENT)
      last.frames = Math.min(LIMITS.pauseFrames, last.frames + pause.frames);
    else merged.push({ at: pause.at, frames: pause.frames });
  }
  return merged.slice(0, LIMITS.pauses);
}

/** The frames of the pauses at or before a moment (a word's), or strictly before it (a cut's). */
function framesBefore(pauses: readonly VoicePause[], time: number, inclusive: boolean): number {
  let frames = 0;
  for (const pause of pauses)
    if (inclusive ? pause.at <= time + SAME_MOMENT : pause.at < time - SAME_MOMENT)
      frames += pause.frames;
  return frames;
}

/** Seconds a word at `time` (on the pauses' own clock) moves: every pause at or before it. */
export function wordShift(pauses: readonly VoicePause[], time: number, fps: number): number {
  return framesBefore(pauses, time, true) / fps;
}

/** Seconds a cut at `time` moves: every pause strictly before it (one on it opens the new shot). */
export function cutShift(pauses: readonly VoicePause[], time: number, fps: number): number {
  return framesBefore(pauses, time, false) / fps;
}

/** A word's time once the pauses are in, as pacing.cjs gives it. */
export function warpWord(pauses: readonly VoicePause[], time: number, fps: number): number {
  return Number((time + wordShift(pauses, time, fps)).toFixed(6));
}

/** A cut's time once the pauses are in, as pacing.cjs gives it. */
export function warpCut(pauses: readonly VoicePause[], time: number, fps: number): number {
  return Number((time + cutShift(pauses, time, fps)).toFixed(6));
}

/**
 * The pauses a voiceover item is held open by, from where it starts playing
 * (one before its trim point is never heard). Music and effects aren't paused.
 */
export function itemPauses(
  item: Pick<TimelineAudio, "role" | "pauses" | "trimStart">,
): VoicePause[] {
  if (item.role !== "voiceover") return [];
  return item.pauses.filter((pause) => pause.at >= item.trimStart - SAME_MOMENT);
}

/** A voiceover's pauses at the moments of the edit they fall at, before any of them is counted. */
export function pausesOnEdit(
  item: Pick<TimelineAudio, "role" | "pauses" | "trimStart" | "start">,
): VoicePause[] {
  return itemPauses(item).map((pause) => ({
    at: item.start + (pause.at - item.trimStart),
    frames: pause.frames,
  }));
}

/** Seconds of silence a voiceover's pauses at or before `until` (its recording's clock) add. */
export function pausedSeconds(
  item: Pick<TimelineAudio, "role" | "pauses" | "trimStart">,
  fps: number,
  until = Infinity,
): number {
  return framesBefore(itemPauses(item), until, true) / fps;
}

/**
 * The pauses a voiceover plays within `length` seconds of it: where each one's
 * silence starts (seconds into the item, on the edit's clock) and how long it
 * holds. A pause the item ends before never sounds, and isn't sent to render.
 */
export function pauseSilences(
  item: Pick<TimelineAudio, "role" | "pauses" | "trimStart">,
  fps: number,
  length = Infinity,
): { at: number; frames: number; from: number; seconds: number }[] {
  const silences: { at: number; frames: number; from: number; seconds: number }[] = [];
  let held = 0;
  for (const pause of itemPauses(item)) {
    const from = pause.at - item.trimStart + held;
    if (from >= length - SAME_MOMENT) break;
    const seconds = pause.frames / fps;
    silences.push({ at: pause.at, frames: pause.frames, from, seconds });
    held += seconds;
  }
  return silences;
}

/** A voiceover's pauses as the media worker takes them: those it plays, sent only when it has some. */
function voicePausesParam(item: TimelineAudio, total: number, fps: number) {
  const silences = pauseSilences(item, fps, audioPlayLength(item, total, fps));
  return silences.length ? { pauses: silences.map(({ at, frames }) => ({ at, frames })) } : {};
}

/**
 * Where a voiceover is in its recording `elapsed` seconds after it starts on
 * the edit, and whether it is holding one of its pauses there (silent): the
 * recording plays up to a pause, stops for its frames, and goes on from where
 * it stopped.
 */
export function voicePosition(
  item: Pick<TimelineAudio, "role" | "pauses" | "trimStart">,
  elapsed: number,
  fps: number,
): { source: number; held: boolean } {
  let offset = 0;
  let source = item.trimStart;
  for (const pause of itemPauses(item)) {
    const reached = offset + (pause.at - source);
    if (elapsed < reached) return { source: source + (elapsed - offset), held: false };
    const seconds = pause.frames / fps;
    if (elapsed < reached + seconds) return { source: pause.at, held: true };
    offset = reached + seconds;
    source = pause.at;
  }
  return { source: source + (elapsed - offset), held: false };
}

/**
 * Where a moment of the edit lands when a voiceover's pauses change from
 * `before` to `after` (both as pausesOnEdit gives them). A moment inside one
 * of the old silences keeps its share of that silence as it is now; any other
 * moment is carried by the voice, and where a new pause falls exactly on it,
 * it moves as a word does (after the silence) or as a cut does (before it).
 */
export function retimeForPauses(
  time: number,
  before: readonly VoicePause[],
  after: readonly VoicePause[],
  fps: number,
  kind: "word" | "cut",
): number {
  let held = 0;
  for (const pause of before) {
    const silence = pause.at + held;
    if (time < silence - SAME_MOMENT) break;
    const seconds = pause.frames / fps;
    if (time <= silence + seconds + SAME_MOMENT) {
      const share = Math.max(0, Math.min(1, (time - silence) / seconds));
      const kept = after.find((entry) => Math.abs(entry.at - pause.at) < SAME_MOMENT);
      return pause.at + cutShift(after, pause.at, fps) + share * ((kept?.frames ?? 0) / fps);
    }
    held += seconds;
  }
  const unpaced = time - held;
  return unpaced + (kind === "word" ? wordShift : cutShift)(after, unpaced, fps);
}

export interface VoicePauseEdit {
  timeline: Timeline;
  /** Clips that couldn't be made as long as their cut needs: there isn't the footage. */
  shortClips: string[];
}

/**
 * A voiceover held open by new pauses (or fewer), and what is timed to it
 * moved to match: captions (and any word times they carry) and titles within
 * the voiceover's span move as its words do. A voiceover with a set length
 * grows by the silence added, so the same last word still plays. With `cuts`,
 * the clips are lengthened (or shortened) so each cut keeps its place against
 * the words; a clip without the footage for it stops short, in `shortClips`.
 */
export function editVoicePauses(
  timeline: Timeline,
  itemId: string,
  pauses: readonly VoicePause[],
  options: { cuts?: boolean } = {},
): VoicePauseEdit {
  const item = timeline.audio.find((entry) => entry.id === itemId);
  if (!item || item.role !== "voiceover") return { timeline, shortClips: [] };
  const fps = timeline.fps;
  const layout = layoutTimeline(timeline);
  const length = audioPlayLength(item, layout.total, fps);
  const wanted = sortedPauses(
    pauses
      .filter((pause) => Number.isFinite(pause.at) && pause.at >= item.trimStart - SAME_MOMENT)
      .map((pause) => ({
        at: Math.max(0, pause.at),
        frames: Math.max(1, Math.min(LIMITS.pauseFrames, Math.round(pause.frames))),
      })),
  );

  // A set length keeps its last word: the recording it plays, plus its silences.
  const heard = pauseSilences(item, fps, length);
  const silent = heard.reduce(
    (sum, entry) => sum + Math.min(entry.seconds, Math.max(0, length - entry.from)),
    0,
  );
  const recording = Math.max(0, length - silent);
  const reach = item.trimStart + recording;
  const duration =
    item.duration === null
      ? null
      : Math.max(
          0.1,
          Math.min(
            LIMITS.totalSeconds,
            Number((recording + framesBefore(wanted, reach, true) / fps).toFixed(6)),
          ),
        );
  const paused: TimelineAudio = { ...item, pauses: wanted, duration };
  // Only what is heard moves anything: the pauses within the recording it plays.
  const before = pausesOnEdit({ ...item, pauses: heard });
  const after = pausesOnEdit({
    ...paused,
    pauses: wanted.filter((pause) => pause.at <= reach + SAME_MOMENT),
  });
  const move = (time: number, kind: "word" | "cut") =>
    Number(
      Math.min(
        LIMITS.totalSeconds,
        Math.max(0, retimeForPauses(time, before, after, fps, kind)),
      ).toFixed(3),
    );
  // What is timed within the voiceover's span moves with it; the rest stays.
  const spanEnd = item.start + length;
  const inSpan = (entry: { start: number; end: number }) =>
    entry.start < spanEnd - SAME_MOMENT && entry.end > item.start + SAME_MOMENT;
  const moveTimes = <T extends { start: number; end: number }>(entry: T): T => ({
    ...entry,
    start: move(entry.start, "word"),
    end: move(entry.end, "cut"),
  });
  const captions = {
    ...timeline.captions,
    segments: timeline.captions.segments.map((segment) => {
      if (!inSpan(segment)) return segment;
      const words = (segment as { words?: unknown }).words;
      return {
        ...moveTimes(segment),
        ...(Array.isArray(words)
          ? {
              words: words.map((word: { start: number; end: number }) =>
                word && typeof word === "object" ? moveTimes(word) : word,
              ),
            }
          : {}),
      };
    }),
  };
  const overlays = timeline.overlays.map((overlay) =>
    inSpan(overlay) ? moveTimes(overlay) : overlay,
  );
  let next: Timeline = {
    ...timeline,
    audio: timeline.audio.map((entry) => (entry.id === itemId ? paused : entry)),
    captions,
    overlays,
  };

  const shortClips: string[] = [];
  if (options.cuts) {
    // Each clip ends where its cut lands now, in whole frames; the clips start
    // where the clip before them ends, less their transition, as laid out.
    let endFrame = 0;
    const clips = timeline.clips.map((clip, index) => {
      const entry = layout.clips[index]!;
      const target = Math.round(retimeForPauses(entry.end, before, after, fps, "cut") * fps);
      const startFrame = endFrame - Math.round(entry.transitionIn * fps);
      const want = Math.max(2, target - startFrame);
      const most = Math.floor(maxClipDuration(clip) * fps + 1e-6);
      const frames = Math.min(want, most);
      if (frames < want) shortClips.push(clip.id);
      endFrame = startFrame + frames;
      const duration = Number((frames / fps).toFixed(6));
      return Math.round(clip.duration * fps) === frames ? clip : { ...clip, duration };
    });
    next = { ...next, clips };
  }
  return { timeline: next, shortClips };
}

/** A voiceover held open by these pauses, with its captions and titles (and, if asked, cuts) moved to match. */
export function withVoicePauses(
  timeline: Timeline,
  itemId: string,
  pauses: readonly VoicePause[],
  options: { cuts?: boolean } = {},
): Timeline {
  return editVoicePauses(timeline, itemId, pauses, options).timeline;
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

  // Only the cards an edit can hold are timed, so they span the whole range.
  const kept = cards.slice(0, LIMITS.captions);
  const weights = kept.map((card) => card.length + 6);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const span = end - start;
  const segments: CaptionSegment[] = [];
  let cursor = start;
  kept.forEach((card, index) => {
    const length = (span * weights[index]!) / totalWeight;
    segments.push({
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + length).toFixed(3)),
      text: card.slice(0, LIMITS.captionChars),
    });
    cursor += length;
  });
  return segments;
}

/**
 * Caption cards timed to the words of a voiceover, placed `offset` seconds
 * into the edit. A card ends at a sentence, at a pause, or before it gets too
 * long to read at a glance, and stays up until the next one replaces it.
 */
export function captionsFromWords(
  words: { text: string; start: number; end: number }[],
  offset: number,
  options: { maxChars?: number; until?: number } = {},
): CaptionSegment[] {
  const maxChars = options.maxChars ?? 32;
  const until = Math.min(options.until ?? LIMITS.totalSeconds, LIMITS.totalSeconds);
  const timed = words
    .map((word) => ({ text: word.text.trim(), start: word.start, end: word.end }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end))
    .map((word) => ({
      ...word,
      start: Math.max(0, word.start),
      end: Math.max(word.start, word.end),
    }));

  const cards: { text: string; start: number; end: number }[] = [];
  let line: typeof timed = [];
  const lineText = () => line.map((word) => word.text).join(" ");
  const flush = () => {
    if (line.length) cards.push({ text: lineText(), start: line[0]!.start, end: line.at(-1)!.end });
    line = [];
  };
  const endsSentence = (text: string) => /[.!?;:]["”’)]?$/.test(text);
  for (const word of timed) {
    const previous = line.at(-1);
    const length = `${lineText()} ${word.text}`.length;
    // A sentence's last word may run a little long rather than sit alone on a card.
    const tooLong = length > maxChars && !(endsSentence(word.text) && length <= maxChars + 12);
    if (previous && (word.start - previous.end > 0.45 || tooLong)) flush();
    line.push(word);
    if (
      endsSentence(word.text) ||
      (/,["”’)]?$/.test(word.text) && lineText().length > maxChars * 0.6)
    )
      flush();
  }
  flush();

  const segments: CaptionSegment[] = [];
  cards.forEach((card, index) => {
    const start = card.start + offset;
    if (start >= until) return;
    const nextStart = cards[index + 1] ? cards[index + 1]!.start + offset : Infinity;
    // Linger a moment after the last word, and long enough to read.
    let end = Math.max(card.end + offset + 0.2, start + 0.6);
    if (nextStart - end < 0.3) end = nextStart;
    end = Math.min(end, nextStart, until);
    if (end - start < 0.05) return;
    segments.push({
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text: card.text.slice(0, LIMITS.captionChars),
    });
  });
  return segments.slice(0, LIMITS.captions);
}

/**
 * Captions with a new take's cards laid in alongside those already on the
 * edit (another voiceover's, or written by hand). Cards outside the time the
 * new ones cover keep their place; one that runs into it is cut back to where
 * the new cards start or end, and one that runs right across it keeps both
 * sides.
 */
export function mergeCaptions(
  existing: CaptionSegment[],
  added: CaptionSegment[],
): CaptionSegment[] {
  if (!added.length) return existing;
  const from = Math.min(...added.map((segment) => segment.start));
  const to = Math.max(...added.map((segment) => segment.end));
  const kept: CaptionSegment[] = [];
  for (const segment of existing) {
    if (segment.end <= from || segment.start >= to) {
      kept.push(segment);
      continue;
    }
    // What is left of a caption either side of the new words stays (both
    // sides of one that runs right across them).
    if (segment.start < from && from - segment.start >= 0.3) kept.push({ ...segment, end: from });
    if (segment.end > to && segment.end - to >= 0.3) kept.push({ ...segment, start: to });
  }
  return [...kept, ...added].sort((a, b) => a.start - b.start).slice(0, LIMITS.captions);
}

/* ------------------------------------------------------------------ */
/* Render request                                                      */
/* ------------------------------------------------------------------ */

export interface RenderSource {
  assetId: string;
  role: "video" | "image" | "audio";
}

/** The families an edit's text asks for that it carries a font file for. */
export function usedFonts(timeline: Pick<Timeline, "fonts" | "overlays" | "captions">): FontFile[] {
  const wanted = new Set<string>();
  for (const overlay of timeline.overlays) if (overlay.font) wanted.add(overlay.font);
  if (timeline.captions.enabled && timeline.captions.font) wanted.add(timeline.captions.font);
  const seen = new Set<string>();
  return timeline.fonts.filter((font) => {
    if (!wanted.has(font.family) || seen.has(font.family)) return false;
    seen.add(font.family);
    return true;
  });
}

/**
 * The audio heard in a render: it starts before the picture ends and neither
 * it nor its channel is silent.
 */
export function audibleAudio(timeline: Timeline, total = layoutTimeline(timeline).total) {
  return timeline.audio.filter((item) => item.start < total && audioGain(timeline, item) > 0);
}

export interface RenderOptions {
  /**
   * The media service applies the mixer's channel levels itself (its
   * "channel_mix" feature). Without it, each level is folded into the items'
   * own volumes, which the service caps at 200%.
   */
  channelMix?: boolean;
}

const VOLUME_MAX = 2;

/**
 * Whether any heard item's volume through its channel goes past the 200%
 * an item can carry, so the channel levels have to be applied by the media
 * service rather than folded into the items (otherwise the two are the same).
 */
export function mixNeedsChannelLevels(timeline: Timeline): boolean {
  const picture = channelGain(timeline, "picture");
  return (
    timeline.clips.some((clip) => clip.kind === "video" && clip.volume * picture > VOLUME_MAX) ||
    audibleAudio(timeline).some((item) => audioGain(timeline, item) > VOLUME_MAX)
  );
}

/** The order a render hands back its stems in, after the video and its poster. */
export const STEM_ROLES: readonly AudioRole[] = ["voiceover", "music", "sfx"];

/**
 * The stems a render of the edit hands back when asked for: each bus with
 * sound heard in it (its voiceover, its music, its effects), as mixed into the
 * master, as a file beside the video.
 */
export function stemRolesFor(
  timeline: Timeline,
  total = layoutTimeline(timeline).total,
): AudioRole[] {
  if (!timeline.stems) return [];
  const heard = new Set(audibleAudio(timeline, total).map((item) => item.role));
  return STEM_ROLES.filter((role) => heard.has(role));
}

/**
 * The media worker's render_sequence parameters for a timeline, plus the
 * ordered list of distinct assets it needs (one download per asset).
 */
export function buildRenderRequest(
  timeline: Timeline,
  options: RenderOptions = {},
): {
  sources: RenderSource[];
  params: Record<string, unknown>;
  /** Brand font files, sent after the sources in this order (role "font"). */
  fonts: FontFile[];
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
  // A muted (or zero) channel is always folded in, so its sound is never fetched or mixed.
  const busMix = options.channelMix === true;
  const fold = (volume: number, gain: number) =>
    gain === 0 ? 0 : busMix ? volume : Math.min(VOLUME_MAX, Number((volume * gain).toFixed(4)));
  const pictureGain = channelGain(timeline, "picture");

  const clips = timeline.clips.map((clip) => ({
    source_index: indexFor(clip.assetId, clip.kind),
    kind: clip.kind,
    trim_start: clip.kind === "image" ? 0 : clip.trimStart,
    duration: clip.duration,
    speed: clip.kind === "image" ? 1 : clip.speed,
    volume: clip.kind === "image" ? 0 : fold(clip.volume, pictureGain),
    fit: clip.fit ?? timeline.fit,
    ...(clip.focus ? { focus_x: clip.focus.x, focus_y: clip.focus.y } : {}),
    motion: clip.kind === "image" ? clip.motion : "none",
    transition: {
      type: clip.transition.type,
      duration: clip.transition.type === "cut" ? 0 : clip.transition.duration,
    },
    // A smart join is sent as a colour join too, which a media service
    // without smart joins makes instead.
    ...(clip.kind === "video" && (clip.matchPrevious || clip.smartBlend)
      ? { match_previous: true }
      : {}),
    ...(clip.kind === "video" && clip.smartBlend ? { join: "smart" } : {}),
  }));

  const audio = audibleAudio(timeline, layout.total).map((item) => ({
    source_index: indexFor(item.assetId, "audio"),
    role: item.role,
    start: item.start,
    trim_start: item.trimStart,
    duration: item.duration,
    volume: fold(item.volume, channelGain(timeline, channelOf(item.role))),
    fade_in: item.fadeIn,
    fade_out: item.fadeOut,
    loop: audioLoops(item),
    // Music dips under the voice, and an effect can too; a voiceover never does.
    duck: item.role === "voiceover" ? false : item.duck,
    duck_level: item.duckLevel,
    // Sent only when it has some (feature voice_pauses), so an older media service renders the rest.
    ...voicePausesParam(item, layout.total, timeline.fps),
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

  // A font is asked for only where its file goes with the render; otherwise the text is set in Inter.
  const fonts = usedFonts(timeline);
  const carried = new Set(fonts.map((font) => font.family));
  const brandText = (item: {
    font: string | null;
    color: string | null;
    accent: string | null;
  }) => ({
    ...(item.font && carried.has(item.font) ? { font: item.font } : {}),
    ...(item.color ? { color: item.color } : {}),
    ...(item.accent ? { accent: item.accent } : {}),
  });

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
      // Sent only when set, so a media service from before them renders the rest.
      ...(overlay.y !== null ? { y: overlay.y } : {}),
      ...(overlay.backing !== "outline" ? { backing: overlay.backing } : {}),
      ...brandText(overlay),
      // Its motion (feature overlay_motion), sent only when it has one.
      ...(overlay.motion ? { motion: overlayMotionParams(overlay.motion) } : {}),
    }));

  const images = timeline.images
    .filter(
      (image) => image.end - image.start >= 0.1 && image.start < layout.total && image.opacity > 0,
    )
    .map((image) => ({
      source_index: indexFor(image.assetId, "image"),
      start: image.start,
      end: Math.min(image.end, layout.total),
      x: image.x,
      y: image.y,
      width: image.width,
      opacity: image.opacity,
      fade: image.fade,
    }));

  return {
    sources,
    fonts,
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
            ...brandText(timeline.captions),
            segments,
          }
        : null,
      overlays,
      // Sent only when there are any, so a media service from before them renders the rest.
      ...(images.length ? { images } : {}),
      ...(fonts.length
        ? {
            fonts: fonts.map((font, index) => ({
              source_index: sources.length + index,
              family: font.family,
            })),
          }
        : {}),
      fade_in: timeline.fadeIn,
      fade_out: timeline.fadeOut,
      normalize_loudness: timeline.normalizeLoudness,
      // Sent only when chosen, so a media service from before them renders as it did.
      ...(timeline.frameRateConversion !== "duplicate"
        ? { frame_rate_conversion: timeline.frameRateConversion }
        : {}),
      ...(timeline.upscale !== "standard" ? { upscale: timeline.upscale } : {}),
      // Sent only when asked for (feature stems): one more file a bus, in STEM_ROLES' order.
      ...(stemRolesFor(timeline, layout.total).length
        ? { stems: stemRolesFor(timeline, layout.total) }
        : {}),
      ...(busMix
        ? {
            mix: {
              picture: pictureGain,
              voiceover: channelGain(timeline, "voiceover"),
              music: channelGain(timeline, "audio"),
              sfx: channelGain(timeline, "audio"),
            },
          }
        : {}),
    },
  };
}

/** A title's motion as the media worker takes it (see media-worker/src/sequence.js). */
export function overlayMotionParams(motion: OverlayMotion) {
  return {
    enter: motion.enter,
    exit: motion.exit,
    enter_ease: [...motion.enterEase],
    exit_ease: [...motion.exitEase],
    rise: motion.rise,
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
