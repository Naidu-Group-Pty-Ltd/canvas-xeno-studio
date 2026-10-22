/**
 * Composition clips on an edit's timeline: a drawing placed as a clip, its
 * composition kept beside it, and a clip given a new drawing of itself. Pure,
 * so the Editor, the studio API and tests share it.
 */
import {
  clipFromSource,
  LIMITS,
  updateClip,
  type Timeline,
  type TimelineClip,
} from "../edit/timeline";
import type { RenderQuality } from "./settings";
import { specKey, type CompositionClip, type CompositionSpec } from "./spec";
import { templateById } from "./templates";

/** A finished drawing of a composition. */
export interface Drawing {
  /** Its playable copy in the library: the file the clip plays. */
  assetId: string;
  renderId: string;
  spec: CompositionSpec;
  brandKitId: string | null;
  quality: RenderQuality;
}

const LABEL_PREFIX = "Motion · ";

/** What a clip is called after its composition's template. */
export function compositionLabel(spec: Pick<CompositionSpec, "template">): string {
  return `${LABEL_PREFIX}${templateById(spec.template)?.title ?? spec.template}`;
}

/** The composition a drawing is, as a clip keeps it. */
export function compositionOf(drawing: Drawing): CompositionClip {
  return {
    spec: drawing.spec,
    brandKitId: drawing.brandKitId,
    renderId: drawing.renderId,
    quality: drawing.quality,
    renderedKey: specKey(drawing.spec, drawing.brandKitId),
  };
}

/** A clip that plays a drawing whole. */
export function compositionClip(drawing: Drawing): TimelineClip {
  return {
    ...clipFromSource({
      assetId: drawing.assetId,
      kind: "video",
      durationSeconds: drawing.spec.duration,
      title: compositionLabel(drawing.spec),
    }),
    composition: compositionOf(drawing),
  };
}

/**
 * A composition clip given a new drawing of itself: its file and composition
 * change, while its place, transition and sound stay. So does its trim when
 * the composition runs as long as before; otherwise it plays the new one whole.
 * A label the person didn't name follows the template.
 */
export function withDrawing(timeline: Timeline, clipId: string, drawing: Drawing): Timeline {
  const clip = timeline.clips.find((item) => item.id === clipId);
  if (!clip) return timeline;
  const sameLength =
    clip.composition !== null &&
    clip.composition !== undefined &&
    Math.abs(clip.composition.spec.duration - drawing.spec.duration) < 1e-6;
  const named = clip.label !== undefined && !clip.label.startsWith(LABEL_PREFIX);
  return updateClip(timeline, clipId, {
    assetId: drawing.assetId,
    kind: "video",
    composition: compositionOf(drawing),
    sourceDuration: drawing.spec.duration,
    ...(named ? {} : { label: compositionLabel(drawing.spec) }),
    ...(sameLength
      ? {}
      : {
          trimStart: 0,
          duration: Math.min(drawing.spec.duration / clip.speed, LIMITS.clipSeconds),
        }),
  });
}

/** The edit's composition clips. */
export function compositionClips(
  timeline: Pick<Timeline, "clips">,
): (TimelineClip & { composition: CompositionClip })[] {
  return timeline.clips.filter(
    (clip): clip is TimelineClip & { composition: CompositionClip } =>
      clip.kind === "video" && !!clip.composition,
  );
}
