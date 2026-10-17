/**
 * Builds a first cut from work that already exists: a Supercomputer
 * conversation's drafts (optionally following the agent's edit plan), a
 * storyboard's selected takes, or a hand-picked set of library files.
 * Pure functions: callers fetch the rows, these decide the edit.
 */
import { LIP_SYNC } from "../lip-sync/models";
import { placeSyncedClips, type SyncedPlacement } from "../lip-sync/placement";
import { phraseCaptions } from "./captions";
import {
  aspectFromValue,
  audioFromSource,
  captionsFromScript,
  clipFromSource,
  emptyTimeline,
  frameSize,
  layoutTimeline,
  LIMITS,
  newId,
  TRANSITIONS,
  type AspectRatio,
  type Timeline,
  type TimelineClip,
  type TransitionType,
} from "./timeline";

export interface CompileAsset {
  id: string;
  asset_type: "image" | "video" | "audio";
  title: string | null;
  duration_seconds: number | null;
  created_at?: string;
}

export interface CompileResult {
  title: string;
  timeline: Timeline;
  /** Shots that had nothing usable yet, by name. */
  missing: string[];
}

const TRANSITION_IDS = new Set<string>(TRANSITIONS.map((transition) => transition.id));

/** Maps loose transition names ("crossfade", "whip", "hard cut") onto supported ones. */
export function transitionFromName(name: unknown): { type: TransitionType; duration: number } {
  const text =
    typeof name === "string"
      ? name
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, "")
      : "";
  if (!text || /^(cut|hardcut|none|straightcut|jumpcut)$/.test(text))
    return { type: "cut", duration: 0 };
  if (TRANSITION_IDS.has(text)) return { type: text as TransitionType, duration: 0.4 };
  if (/black/.test(text)) return { type: "fadeblack", duration: 0.6 };
  if (/white|flash/.test(text)) return { type: "fadewhite", duration: 0.4 };
  if (/dissolve/.test(text)) return { type: "dissolve", duration: 0.5 };
  if (/crossfade|fade|mix/.test(text)) return { type: "fade", duration: 0.5 };
  if (/whip|swipe|slide/.test(text)) {
    const direction = /right/.test(text)
      ? "slideright"
      : /up/.test(text)
        ? "slideup"
        : /down/.test(text)
          ? "slidedown"
          : "slideleft";
    return { type: direction, duration: 0.3 };
  }
  if (/wipe/.test(text))
    return { type: /right/.test(text) ? "wiperight" : "wipeleft", duration: 0.4 };
  if (/zoom|punch/.test(text)) return { type: "zoomin", duration: 0.35 };
  if (/circle|iris/.test(text)) return { type: "circleopen", duration: 0.5 };
  if (/blur/.test(text)) return { type: "hblur", duration: 0.4 };
  return { type: "fade", duration: 0.4 };
}

function clipFor(asset: CompileAsset, seconds?: number | null): TimelineClip | null {
  if (asset.asset_type === "audio") return null;
  const clip = clipFromSource({
    assetId: asset.id,
    kind: asset.asset_type,
    durationSeconds: asset.duration_seconds,
    title: asset.title,
  });
  if (seconds && seconds > 0) {
    const max =
      asset.asset_type === "video" && asset.duration_seconds
        ? asset.duration_seconds
        : LIMITS.clipSeconds;
    clip.duration = Math.max(0.5, Math.min(seconds, max));
  }
  return clip;
}

/** A straight edit of library files, in the order given. */
export function compileFromAssets(
  assets: CompileAsset[],
  options: {
    title?: string;
    aspectRatio?: AspectRatio;
    transition?: { type: TransitionType; duration: number };
  } = {},
): CompileResult {
  const timeline = emptyTimeline(options.aspectRatio ?? "9:16");
  const clips: TimelineClip[] = [];
  for (const asset of assets) {
    const clip = clipFor(asset);
    if (!clip) continue;
    if (clips.length && options.transition) clip.transition = options.transition;
    clips.push(clip);
  }
  return {
    title: options.title ?? "New edit",
    timeline: { ...timeline, clips: clips.slice(0, LIMITS.clips) },
    missing: [],
  };
}

/* ------------------------------------------------------------------ */
/* Supercomputer                                                       */
/* ------------------------------------------------------------------ */

export interface CompileDraft {
  title: string;
  outputType: "image" | "video" | "audio";
  parameters: Record<string, unknown>;
  /** A long video's clips go to the Editor from the long video itself, not as one shot. */
  longVideo?: unknown;
}

export interface CompileRun {
  generation: { status: string; created_at: string };
  assets: CompileAsset[];
}

export interface CompileEditPlan {
  title?: string;
  aspectRatio?: string;
  shots?: { draftIndex: number; seconds?: number; transition?: string }[];
  voiceoverScript?: string;
  captions?: boolean;
  openingTitle?: string;
  closingCta?: string;
}

/** The newest finished output of a draft, preferring video. */
export function bestOutput(runs: CompileRun[] | undefined): CompileAsset | null {
  const finished = (runs ?? [])
    .filter((run) => run.generation.status === "completed" && run.assets.length)
    .sort((a, b) => b.generation.created_at.localeCompare(a.generation.created_at));
  for (const run of finished) {
    const video = run.assets.find((asset) => asset.asset_type === "video");
    if (video) return video;
  }
  return finished[0]?.assets.find((asset) => asset.asset_type !== "audio") ?? null;
}

export function compileFromDrafts(
  drafts: CompileDraft[],
  runsByDraft: Map<number, CompileRun[]>,
  options: { plan?: CompileEditPlan | null; fallbackTitle?: string } = {},
): CompileResult {
  const plan = options.plan ?? null;
  const planned = (plan?.shots ?? []).filter(
    (shot, position, list) =>
      Number.isInteger(shot.draftIndex) &&
      shot.draftIndex >= 0 &&
      shot.draftIndex < drafts.length &&
      list.findIndex((other) => other.draftIndex === shot.draftIndex) === position,
  );
  const order = planned.length
    ? planned
    : drafts.map((_, draftIndex) => ({ draftIndex, seconds: undefined, transition: undefined }));

  const aspect =
    aspectFromValue(plan?.aspectRatio) ??
    drafts
      .map((draft) =>
        aspectFromValue(draft.parameters["aspect_ratio"] ?? draft.parameters["aspect"]),
      )
      .find((value): value is AspectRatio => value !== null) ??
    "9:16";

  const timeline = emptyTimeline(aspect);
  const clips: TimelineClip[] = [];
  const missing: string[] = [];
  for (const shot of order) {
    const draft = drafts[shot.draftIndex]!;
    if (draft.outputType === "audio" || draft.longVideo) continue;
    const output = bestOutput(runsByDraft.get(shot.draftIndex));
    const clip = output ? clipFor(output, shot.seconds) : null;
    if (!clip) {
      missing.push(draft.title);
      continue;
    }
    clip.label = draft.title;
    if (clips.length) clip.transition = transitionFromName(shot.transition);
    clips.push(clip);
  }

  let next: Timeline = { ...timeline, clips: clips.slice(0, LIMITS.clips) };
  const total = layoutTimeline(next).total;

  if (plan?.voiceoverScript?.trim() && total > 1) {
    next = {
      ...next,
      captions: {
        ...next.captions,
        enabled: plan.captions !== false,
        segments: captionsFromScript(plan.voiceoverScript, 0.3, Math.max(0.6, total - 0.3)),
      },
    };
  }

  const overlays = [];
  if (plan?.openingTitle?.trim() && total > 2) {
    overlays.push({
      id: newId(),
      text: plan.openingTitle.trim().slice(0, LIMITS.overlayChars),
      start: 0,
      end: Math.min(2.5, total / 2),
      style: "title" as const,
      position: "center" as const,
    });
  }
  if (plan?.closingCta?.trim() && total > 2) {
    overlays.push({
      id: newId(),
      text: plan.closingCta.trim().slice(0, LIMITS.overlayChars),
      start: Math.max(0, total - 2.5),
      end: total,
      style: "cta" as const,
      position: "bottom" as const,
    });
  }
  if (overlays.length) next = { ...next, overlays };

  return { title: plan?.title?.trim() || options.fallbackTitle || "Reel", timeline: next, missing };
}

/* ------------------------------------------------------------------ */
/* Storyboards                                                         */
/* ------------------------------------------------------------------ */

export interface CompileShot {
  id: string;
  shot_number: number;
  name: string | null;
  duration_seconds: number | null;
  selected_take_id: string | null;
}

export interface CompileScene {
  scene_number: number;
  shots: CompileShot[];
}

export interface CompileTake {
  id: string;
  shot_id: string;
  take_number: number;
  is_selected: boolean;
  asset: CompileAsset | null;
}

/**
 * Selected takes in scene and shot order; a shot with no selection uses its
 * newest finished take. A selected take whose file isn't ready (or is gone)
 * leaves its shot missing, never replaced by another take.
 */
export function compileFromStoryboard(
  storyboard: { title: string; primary_aspect_ratio: string | null; scenes: CompileScene[] },
  takes: CompileTake[],
): CompileResult {
  const timeline = emptyTimeline(aspectFromValue(storyboard.primary_aspect_ratio) ?? "9:16");
  const clips: TimelineClip[] = [];
  const missing: string[] = [];
  const scenes = [...storyboard.scenes].sort((a, b) => a.scene_number - b.scene_number);
  for (const scene of scenes) {
    for (const shot of [...scene.shots].sort((a, b) => a.shot_number - b.shot_number)) {
      const shotTakes = takes.filter((take) => take.shot_id === shot.id);
      const chosen = shot.selected_take_id
        ? shotTakes.find((candidate) => candidate.id === shot.selected_take_id)
        : shotTakes.find((candidate) => candidate.is_selected);
      const take =
        shot.selected_take_id || chosen
          ? chosen
          : shotTakes
              .filter((candidate) => candidate.asset)
              .sort((a, b) => b.take_number - a.take_number)[0];
      const clip = take?.asset ? clipFor(take.asset, shot.duration_seconds) : null;
      const label = shot.name
        ? `${scene.scene_number}.${shot.shot_number} ${shot.name}`
        : `Shot ${scene.scene_number}.${shot.shot_number}`;
      if (!clip) {
        missing.push(label);
        continue;
      }
      clip.label = label;
      clips.push(clip);
    }
  }
  return {
    title: storyboard.title,
    timeline: { ...timeline, clips: clips.slice(0, LIMITS.clips) },
    missing,
  };
}

/* ------------------------------------------------------------------ */
/* Long videos                                                         */
/* ------------------------------------------------------------------ */

/**
 * How clips join: a cut on the handoff frame, smart-blended (the next clip put
 * back in register with the one before: framing, colour, detail and sound) or
 * only colour-matched; or a short cross-fade over footage both clips share,
 * smart-blended too.
 */
export type LongVideoSeam = "smart" | "cut" | "blend";
export const LONG_VIDEO_SEAMS = [
  "smart",
  "cut",
  "blend",
] as const satisfies readonly LongVideoSeam[];

export interface LongVideoClipCut {
  position: number;
  /** The clip's video, once it is in. */
  assetId: string | null;
  /** Where the clip ends when the next one follows it (see `handsOffLastFrame`). */
  cutSeconds: number | null;
  /** The clip's measured length. */
  lengthSeconds: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  /**
   * The next clip starts from this clip's true last frame, which this clip
   * plays through (`cutSeconds` is just after it), so the next clip skips its
   * own first frame, its copy of it. Otherwise the next clip starts from the
   * frame just after `cutSeconds`, and shows it itself.
   */
  handsOffLastFrame?: boolean;
  /**
   * The clip extends the one before it (it was given that clip's video): its
   * first frame is new footage, the moment after that clip's last, so that
   * clip plays to its very end and this one from its own start.
   */
  extendsPrevious?: boolean;
}

export interface LongVideoAsset {
  id: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export interface LongVideoCompileResult {
  title: string;
  timeline: Timeline;
  /** Clips (by position) that weren't in, or whose video is gone. */
  missing: number[];
}

/** The still a long video ends on: the brand's end card, held after the last clip. */
export interface LongVideoEndCard {
  assetId: string;
  seconds: number;
  width: number | null;
  height: number | null;
  /** The last clip already ends on this image (it moved into it). */
  revealed: boolean;
}

/**
 * How an end card fills the edit's frame: whole and edge to edge when it was
 * laid out at the video's own shape, else whole on black around it.
 */
function endCardFit(card: LongVideoEndCard, frame: { width: number; height: number }) {
  if (!card.width || !card.height) return "contain" as const;
  const gap = Math.abs(Math.log(card.width / card.height / (frame.width / frame.height)));
  return gap < 0.02 ? ("cover" as const) : ("contain" as const);
}

/** The longest cross-fade at a join: the footage after a handoff frame both clips show. */
const BLEND_SECONDS = 0.2;
/** A soft join between clips that share only the handoff frame: a dissolve this many frames long. */
const BLEND_FRAMES = 3;

/** The Editor frame rate closest to the clips' own (23.976 is 24, 29.97 is 30). */
function editFps(rates: (number | null)[]): Timeline["fps"] {
  const counts = new Map<Timeline["fps"], number>();
  for (const rate of rates) {
    if (!rate) continue;
    const match = FPS_CHOICES.find((choice) => Math.abs(choice - rate) < 0.6);
    if (match) counts.set(match, (counts.get(match) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 30;
}
const FPS_CHOICES = [24, 25, 30, 60] as const;

/**
 * A long video as one edit. Each clip after the first starts from a frame
 * taken from the one before it, so that clip is cut exactly there and the
 * next picks up on the same frame: one continuous shot. That frame is the
 * clip's true last frame (`handsOffLastFrame`): the clip plays to its end
 * and the next skips its own first frame, its copy of that one, so no moment
 * is shown twice. (Clips from before frames were counted were cut on a frame
 * just before their end instead.) A clip that extends the one before it (it
 * was given that clip's video) follows on from that clip's very end, with no
 * frame in common. Each join is eased: the next clip's picture is matched to
 * the frame it continues from (smart-blended, its framing, colour and detail;
 * or, asked for a plain cut, its colour only) and drifts back to its own over
 * a few seconds, so a re-rendered frame doesn't jump or blink.
 *
 * Asked to blend, clips cross-fade at the join: a clip cut before its end
 * runs on a moment and fades over footage both clips show; a clip played to
 * its true last frame dissolves into the next over a few frames.
 * An end card, when there is one, holds after the last clip.
 */
export function compileFromLongVideo(
  run: { title: string; settings: Record<string, unknown> },
  clips: LongVideoClipCut[],
  assets: LongVideoAsset[],
  options: { seam: LongVideoSeam; keepSound: boolean; endCard?: LongVideoEndCard | null },
): LongVideoCompileResult {
  const ordered = [...clips].sort((a, b) => a.position - b.position);
  const usable = ordered.map((clip) => {
    const asset = clip.assetId ? assets.find((entry) => entry.id === clip.assetId) : undefined;
    return asset ? { clip, asset } : null;
  });
  const sized = usable.find((entry) => entry && (entry.clip.width || entry.asset.width));
  const width = sized ? (sized.clip.width ?? sized.asset.width) : null;
  const height = sized ? (sized.clip.height ?? sized.asset.height) : null;
  const aspect =
    aspectFromValue(run.settings["aspect_ratio"]) ??
    (width && height ? aspectFromValue(`${width}:${height}`) : null) ??
    "16:9";
  const fps = editFps(ordered.map((clip) => clip.fps));
  const base = emptyTimeline(aspect);
  const timeline: Timeline = {
    ...base,
    fps,
    resolution: width && height && Math.min(width, height) < 1000 ? "720p" : "1080p",
  };

  const result: TimelineClip[] = [];
  const missing: number[] = [];
  // How the clip being added joins the one before it, as that one left it.
  let join = { continues: false, fadeIn: 0, skipFirst: false };
  usable.forEach((entry, index) => {
    if (!entry) {
      missing.push(ordered[index]!.position);
      join = { continues: false, fadeIn: 0, skipFirst: false };
      return;
    }
    const { clip, asset } = entry;
    const length = clip.lengthSeconds ?? asset.durationSeconds ?? null;
    const item = clipFromSource({
      assetId: asset.id,
      kind: "video",
      durationSeconds: length,
      title: `Clip ${clip.position + 1}`,
    });
    // Its first frame is its own copy of the frame the clip before ended on: skipped.
    const clipFps = clip.fps && clip.fps > 0 ? clip.fps : fps;
    const trim = join.skipFirst ? Number((1 / clipFps).toFixed(6)) : 0;
    // Cut at the handoff frame only when the clip that starts from it is here
    // too; one that extends this clip goes on from its very end instead.
    const following = usable[index + 1];
    const extended = !!following?.clip.extendsPrevious;
    const continues =
      !!following && (extended ? length !== null : clip.cutSeconds !== null && clip.cutSeconds > 0);
    const next = { continues, fadeIn: 0, skipFirst: false };
    let end = length;
    if (continues && extended) {
      if (options.seam === "blend") next.fadeIn = BLEND_FRAMES / fps;
    } else if (continues) {
      const frame = 1 / fps;
      let blendOut = 0;
      if (clip.handsOffLastFrame) {
        // Played through the frame the next one starts from: the next skips
        // its copy of it, or (blending) dissolves in from its first frame.
        if (options.seam === "blend") next.fadeIn = BLEND_FRAMES / fps;
        else next.skipFirst = true;
      } else {
        const spare = length !== null ? length - clip.cutSeconds! - frame : 0;
        blendOut =
          options.seam === "blend" && spare >= 2 * frame ? Math.min(BLEND_SECONDS, spare) : 0;
        next.fadeIn = blendOut;
      }
      end = clip.cutSeconds! + blendOut;
    }
    if (trim > 0) item.trimStart = trim;
    if (end !== null) item.duration = Math.max(0.1, Math.min(end - trim, LIMITS.clipSeconds));
    item.volume = options.keepSound ? 1 : 0;
    item.transition =
      result.length && join.fadeIn > 0
        ? { type: "fade", duration: Number(join.fadeIn.toFixed(3)) }
        : { type: "cut", duration: 0 };
    // Carrying straight on from the clip before: eased in from that clip's picture.
    item.matchPrevious = result.length > 0 && join.continues;
    item.smartBlend = item.matchPrevious && options.seam !== "cut";
    result.push(item);
    join = next;
  });

  const card = options.endCard;
  if (card && result.length) {
    const still = clipFromSource({
      assetId: card.assetId,
      kind: "image",
      durationSeconds: null,
      title: "End card",
    });
    still.motion = "none";
    still.fit = endCardFit(card, frameSize(timeline.aspectRatio, timeline.resolution));
    // After the last clip, which ends on it, a brief blend; else a gentle fade into it.
    const afterLast = usable.at(-1) !== null;
    const blend = card.revealed && afterLast ? 0.3 : 0.6;
    still.transition = { type: "fade", duration: blend };
    // The fade overlaps the clip before it, so the card runs that much longer:
    // it holds for its full seconds after the last clip ends.
    still.duration = Math.max(0.5, Math.min(card.seconds + blend, LIMITS.clipSeconds));
    // A long video has at most 40 clips, so the edit always has room for it.
    result.push(still);
  }

  return {
    title: run.title,
    timeline: { ...timeline, clips: result.slice(0, LIMITS.clips) },
    missing,
  };
}

/* ------------------------------------------------------------------ */
/* Long videos made to a voiceover                                     */
/* ------------------------------------------------------------------ */

export interface VoiceoverClipCut {
  position: number;
  /** The clip's video, once it is in. */
  assetId: string | null;
  /** Its piece of the voiceover, in seconds on the voiceover's clock. */
  audioStart: number;
  audioEnd: number;
  /** Where its sound has the speech against its piece (positive: later), when measured. */
  offsetSeconds: number | null;
  /** How far its lips run ahead of its sound (seconds, positive: the mouth first), when measured. */
  lipLeadSeconds?: number | null;
  /** The clip's measured length. */
  lengthSeconds: number | null;
  /**
   * The last clip, made to end on a given frame (its closing keyframe, or the
   * brand's end card it moves into): it plays out to its own end, after its
   * piece of the voiceover, so the video lands on that frame.
   */
  playsOut?: boolean;
}

/** The voiceover a long video was made to: its canonical file, which the edit plays whole. */
export interface VoiceoverTrack {
  /** A take of the voiceover (the render plays only takes). */
  assetId: string;
  durationSeconds: number;
  /** The frame rate its cuts are on: the edit plays at it. */
  fps: number;
  title: string;
  /** Its words, timed on its own clock, for captions. */
  words: { text: string; start: number; end: number }[];
  /** The script it was read from: the captions show its words (see ./captions). */
  script?: string | null;
  /** The brand's names as they should be spelt in the captions. */
  terms?: string[];
}

export interface VoiceoverCompileResult extends LongVideoCompileResult {
  /** Where each clip went, for the clips that are in (by position). */
  placement: SyncedPlacement;
}

/**
 * A long video made to a voiceover, as one edit: the voiceover plays whole
 * from the start, and each clip is laid where its piece of it is, started as
 * far in as its sound was measured to have the speech late (see
 * ../lip-sync/placement), so every clip's lips meet the voiceover to the frame.
 * Every boundary comes from the voiceover's own clock, so nothing builds up
 * from clip to clip. The clips are cut, never blended: a cross-fade would show
 * two mouths at once. Their own sound (their piece again) is muted unless
 * asked for.
 *
 * Clips are laid only up to the first that isn't in: a gap would put every
 * clip after it out of step with the voiceover, so those wait (in `missing`)
 * and the voiceover stops where the picture does.
 */
export function compileFromVoiceoverLongVideo(
  run: { title: string; settings: Record<string, unknown> },
  clips: VoiceoverClipCut[],
  assets: LongVideoAsset[],
  voiceover: VoiceoverTrack,
  options: { keepSound: boolean; captions: boolean; endCard?: LongVideoEndCard | null },
): VoiceoverCompileResult {
  const ordered = [...clips].sort((a, b) => a.position - b.position);
  const usable: { clip: VoiceoverClipCut; asset: LongVideoAsset }[] = [];
  const missing: number[] = [];
  for (const clip of ordered) {
    const asset = clip.assetId ? assets.find((entry) => entry.id === clip.assetId) : undefined;
    if (asset && !missing.length) usable.push({ clip, asset });
    else missing.push(clip.position);
  }
  const sized = usable.find((entry) => entry.asset.width && entry.asset.height);
  const aspect =
    aspectFromValue(run.settings["aspect_ratio"]) ??
    (sized ? aspectFromValue(`${sized.asset.width}:${sized.asset.height}`) : null) ??
    "16:9";
  const fps = (FPS_CHOICES as readonly number[]).includes(voiceover.fps)
    ? (voiceover.fps as Timeline["fps"])
    : 30;
  const timeline: Timeline = {
    ...emptyTimeline(aspect),
    fps,
    resolution:
      sized && Math.min(sized.asset.width!, sized.asset.height!) < 1000 ? "720p" : "1080p",
  };

  const card = options.endCard;
  const cardSeconds =
    card && !missing.length ? Math.max(0.5, Math.min(card.seconds, LIMITS.clipSeconds)) : 0;
  const placement = placeSyncedClips({
    clips: usable.map(({ clip, asset }) => ({
      start: clip.audioStart,
      end: clip.audioEnd,
      offsetSeconds: clip.offsetSeconds,
      lipLeadSeconds: clip.lipLeadSeconds ?? null,
      sourceSeconds: clip.lengthSeconds ?? asset.durationSeconds ?? null,
    })),
    fps,
    maxOffsetSeconds: LIP_SYNC.maxOffsetSeconds,
    // Only with every clip in, so the last laid is the video's own last clip.
    playOutLast: !missing.length && usable.at(-1)?.clip.playsOut === true,
    // ...never past what can be rendered, with the end card after it.
    maxTotalSeconds: LIMITS.totalSeconds - cardSeconds,
  });

  const result: TimelineClip[] = usable.map(({ clip, asset }, index) => {
    const placed = placement.clips[index]!;
    const item = clipFromSource({
      assetId: asset.id,
      kind: "video",
      durationSeconds: clip.lengthSeconds ?? asset.durationSeconds ?? null,
      title: `Clip ${clip.position + 1}`,
    });
    item.trimStart = placed.trimStart;
    item.duration = placed.duration;
    item.volume = options.keepSound ? 1 : 0;
    item.transition = { type: "cut", duration: 0 };
    // Carrying straight on from the clip before: put back in register with it at the cut.
    item.matchPrevious = index > 0;
    item.smartBlend = index > 0;
    return item;
  });

  if (result.length) {
    // The voiceover, whole, from the start (or as far as the clips that are in reach).
    const voice = audioFromSource(
      {
        assetId: voiceover.assetId,
        durationSeconds: voiceover.durationSeconds,
        title: voiceover.title,
      },
      "voiceover",
      0,
    );
    voice.trimStart = placement.voiceover.trimStart;
    voice.duration = missing.length ? Math.max(0.1, placement.totalSeconds) : null;
    timeline.audio = [voice];
    if (voiceover.words.length) {
      timeline.captions = {
        ...timeline.captions,
        enabled: options.captions,
        // Phrases, in the script's own words where it is known (see ./captions).
        segments: phraseCaptions(voiceover.words, -placement.voiceover.trimStart, {
          until: placement.totalSeconds,
          script: voiceover.script ?? null,
          terms: voiceover.terms ?? [],
        }).segments,
      };
    }
  }

  if (card && result.length && !missing.length) {
    const still = clipFromSource({
      assetId: card.assetId,
      kind: "image",
      durationSeconds: null,
      title: "End card",
    });
    still.motion = "none";
    still.fit = endCardFit(card, frameSize(timeline.aspectRatio, timeline.resolution));
    // A cut, not a fade: a fade would pull the end card over the last words.
    still.transition = { type: "cut", duration: 0 };
    still.duration = cardSeconds;
    result.push(still);
  }

  return {
    title: run.title,
    timeline: { ...timeline, clips: result.slice(0, LIMITS.clips) },
    missing,
    placement,
  };
}
