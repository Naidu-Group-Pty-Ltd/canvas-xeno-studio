/**
 * Builds a first cut from work that already exists: a Supercomputer
 * conversation's drafts (optionally following the agent's edit plan), a
 * storyboard's selected takes, or a hand-picked set of library files.
 * Pure functions: callers fetch the rows, these decide the edit.
 */
import {
  aspectFromValue,
  captionsFromScript,
  clipFromSource,
  emptyTimeline,
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
    if (draft.outputType === "audio") continue;
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

/** Selected takes in scene and shot order; a shot with no selection uses its newest take. */
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
      const shotTakes = takes.filter((take) => take.shot_id === shot.id && take.asset);
      const take =
        shotTakes.find((candidate) => candidate.id === shot.selected_take_id) ??
        shotTakes.find((candidate) => candidate.is_selected) ??
        [...shotTakes].sort((a, b) => b.take_number - a.take_number)[0];
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
