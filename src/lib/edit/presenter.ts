/**
 * A presenter video with cutaways, as one edit: the presenter's clips laid on
 * the voiceover's own clock, B-roll in the stretches marked as cutaways, the
 * voiceover playing whole underneath, and phrase captions, titles, music and
 * an end card if asked for.
 *
 * Every boundary comes from the voiceover's clock, on the edit's frame grid,
 * so nothing builds up from shot to shot and a cutaway never moves a
 * presenter clip off its words. A presenter clip is started as far in as its
 * sound was measured to have the speech late (less how far its lips run ahead
 * of its sound, see ../lip-sync/placement); one whose speech (or lips) came
 * early starts a frame or two later, the shot before playing on to cover it.
 * A clip made with a lead-in (see ../lip-sync/sections) is cut in where its
 * presenter section starts.
 *
 * Shots are cut, never blended across a cutaway (a blend would show two
 * pictures over the words). Clips that carry straight on from the one before
 * (a chain within a section) are put back in register at the cut, as a long
 * video's are. A cutaway with no B-roll yet holds a placeholder still, named
 * so it can be found and replaced in the Editor.
 *
 * Pure: callers fetch the rows, this decides the edit.
 */
import { LIP_SYNC } from "../lip-sync/models";
import { effectiveOffset, ON_FRAME_SECONDS } from "../lip-sync/placement";
import { voiceoverSections, type Cutaway } from "../lip-sync/sections";
import { phraseCaptions } from "./captions";
import type { LongVideoAsset, LongVideoEndCard, VoiceoverTrack } from "./compile";
import {
  aspectFromValue,
  audioFromSource,
  clipFromSource,
  emptyTimeline,
  frameSize,
  LIMITS,
  newId,
  type Overlay,
  type Timeline,
  type TimelineClip,
} from "./timeline";

export interface PresenterClip {
  position: number;
  /** The clip's video, once it is in. */
  assetId: string | null;
  /** Its piece of the voiceover, in seconds on the voiceover's clock. */
  audioStart: number;
  audioEnd: number;
  /** Where its sound has the speech against its piece (positive: later), when measured. */
  offsetSeconds: number | null;
  /** How far its lips lead its sound (positive: the mouth first), when measured. */
  lipLeadSeconds?: number | null;
  /** The clip's measured length. */
  lengthSeconds: number | null;
  /** It starts from the frame the clip before it was cut on (a chain): the cut is put back in register. */
  continuesPrevious?: boolean;
}

/** What fills a cutaway: B-roll from the library, from a point in it. */
export interface CutawayFill {
  assetId: string;
  kind: "video" | "image";
  /** Seconds into the B-roll to start from (videos). */
  inPoint?: number;
  sourceSeconds?: number | null;
  label?: string | null;
}

/** A title on the voiceover's clock (it moves with the edit's own start). */
export interface PresenterTitle {
  text: string;
  /** Seconds on the voiceover's clock. */
  at: number;
  seconds: number;
  style?: Overlay["style"] | undefined;
  position?: Overlay["position"] | undefined;
  /** Its height on the frame (0 top to 1 bottom), else by its position. */
  y?: number | null | undefined;
}

export interface PresenterEditOptions {
  keepSound: boolean;
  captions: boolean;
  endCard?: LongVideoEndCard | null;
  /** B-roll for each cutaway, in order (null or missing: its placeholder). */
  fills?: (CutawayFill | null | undefined)[];
  /** The still that stands in for a cutaway with no B-roll yet (the presenter's start frame, say). */
  placeholder?: { assetId: string; width: number | null; height: number | null } | null;
  /** A music bed under the voice, ducked where it speaks. */
  music?: { assetId: string; durationSeconds: number | null; title?: string | null } | null;
  titles?: PresenterTitle[];
}

export interface PresenterSegment {
  kind: "presenter" | "cutaway" | "end_card";
  /** Frames on the edit. */
  startFrame: number;
  endFrame: number;
  /** The clip (by position) or cutaway (by order) it shows. */
  index: number;
  /** A cutaway still waiting for its B-roll. */
  placeholder?: boolean;
}

export interface PresenterCompileResult {
  title: string;
  timeline: Timeline;
  /** Clips (by position) that weren't in: their stretch holds the placeholder. */
  missing: number[];
  /** Where every shot went. */
  segments: PresenterSegment[];
  /** Where the voiceover starts playing from (seconds into it). */
  voiceoverTrim: number;
  /** Things the edit couldn't do exactly, in plain words. */
  notes: string[];
}

const FPS_CHOICES = [24, 25, 30, 60] as const;
const round6 = (value: number) => Number(value.toFixed(6));

interface Planned {
  kind: "presenter" | "cutaway";
  index: number;
  /** Voiceover-clock seconds the shot is meant to start at. */
  from: number;
  startFrame: number;
  endFrame: number;
}

export function compilePresenterEdit(
  run: { title: string; settings: Record<string, unknown> },
  clips: PresenterClip[],
  assets: LongVideoAsset[],
  voiceover: VoiceoverTrack,
  cutaways: Cutaway[],
  options: PresenterEditOptions,
): PresenterCompileResult {
  const notes: string[] = [];
  const ordered = [...clips].sort((a, b) => a.audioStart - b.audioStart);
  const assetOf = (clip: PresenterClip) =>
    clip.assetId ? (assets.find((entry) => entry.id === clip.assetId) ?? null) : null;
  const sized = ordered.map(assetOf).find((asset) => asset?.width && asset.height) ?? null;
  const aspect =
    aspectFromValue(run.settings["aspect_ratio"]) ??
    (sized ? aspectFromValue(`${sized.width}:${sized.height}`) : null) ??
    "16:9";
  const fps = (FPS_CHOICES as readonly number[]).includes(voiceover.fps)
    ? (voiceover.fps as Timeline["fps"])
    : 30;
  const timeline: Timeline = {
    ...emptyTimeline(aspect),
    fps,
    resolution: sized && Math.min(sized.width!, sized.height!) < 1000 ? "720p" : "1080p",
  };
  const offsets = new Map(
    ordered.map((clip) => [clip.position, effectiveOffset(clip, LIP_SYNC.maxOffsetSeconds)]),
  );
  const missing = ordered.filter((clip) => !assetOf(clip)).map((clip) => clip.position);

  // The shots, in order on the voiceover's clock: each cutaway, and within each
  // presenter section the part of each clip's piece that falls in it.
  const duration = voiceover.durationSeconds;
  const sections = voiceoverSections(cutaways, duration);
  const shots: { kind: "presenter" | "cutaway"; index: number; from: number; to: number }[] = [];
  let cutawayIndex = 0;
  for (const section of sections) {
    if (section.kind === "cutaway") {
      shots.push({ kind: "cutaway", index: cutawayIndex, from: section.start, to: section.end });
      cutawayIndex += 1;
      continue;
    }
    for (const clip of ordered) {
      const from = Math.max(clip.audioStart, section.start);
      const to = Math.min(clip.audioEnd, section.end);
      if (to - from > 1e-3) shots.push({ kind: "presenter", index: clip.position, from, to });
    }
  }
  if (!shots.length)
    return {
      title: run.title,
      timeline,
      missing,
      segments: [],
      voiceoverTrim: 0,
      notes: ["There is nothing to lay on the edit yet."],
    };

  // A first presenter shot with its speech (or lips) early: the edit starts
  // that much into the voiceover, on a whole frame, so every shot shifts with it.
  const opening = shots[0]!;
  const openingOffset = opening.kind === "presenter" ? (offsets.get(opening.index) ?? 0) : 0;
  const shift =
    openingOffset < 0 ? Math.ceil(-openingOffset * fps - ON_FRAME_SECONDS * fps) / fps : 0;
  const voiceoverTrim = round6(shift);
  const frameAt = (seconds: number) => Math.round((seconds - voiceoverTrim) * fps);

  const planned: Planned[] = shots.map((shot, index) => ({
    kind: shot.kind,
    index: shot.index,
    from: shot.from,
    startFrame: index === 0 ? 0 : frameAt(shot.from),
    endFrame: 0,
  }));
  const lastFrame = Math.max(2, frameAt(duration));
  planned.forEach((shot, index) => {
    shot.endFrame = planned[index + 1]?.startFrame ?? lastFrame;
  });

  const clipOf = new Map(ordered.map((clip) => [clip.position, clip]));
  // The trim that puts a presenter shot's lips on the voice, for a shot starting at `frame`.
  const idealTrim = (shot: Planned, frame: number) => {
    const clip = clipOf.get(shot.index)!;
    return frame / fps + voiceoverTrim - clip.audioStart + (offsets.get(shot.index) ?? 0);
  };
  // Speech (or lips) early: the shot starts later and the one before plays on,
  // keeping two frames of its own.
  for (let index = 1; index < planned.length; index += 1) {
    const shot = planned[index]!;
    if (shot.kind !== "presenter") continue;
    const ideal = idealTrim(shot, shot.startFrame);
    if (ideal >= -ON_FRAME_SECONDS) continue;
    const later = Math.ceil(-ideal * fps - ON_FRAME_SECONDS * fps);
    shot.startFrame = Math.min(shot.startFrame + later, shot.endFrame - 2);
    planned[index - 1]!.endFrame = shot.startFrame;
  }
  for (let index = 1; index < planned.length; index += 1) {
    const before = planned[index - 1]!;
    const shot = planned[index]!;
    if (shot.startFrame < before.startFrame + 2) {
      shot.startFrame = before.startFrame + 2;
      before.endFrame = shot.startFrame;
    }
    if (shot.endFrame < shot.startFrame + 2) shot.endFrame = shot.startFrame + 2;
  }

  const placeholderClip = (label: string): TimelineClip | null => {
    const still = options.placeholder;
    if (!still) return null;
    const item = clipFromSource({
      assetId: still.assetId,
      kind: "image",
      durationSeconds: null,
      title: label,
    });
    item.motion = "zoom_in";
    return item;
  };

  const result: TimelineClip[] = [];
  const segments: PresenterSegment[] = [];
  // Frames of shots at the start that had nothing to show, for the first that has.
  let pendingFrames = 0;
  planned.forEach((shot, index) => {
    const frames = shot.endFrame - shot.startFrame;
    const seconds = round6(frames / fps);
    let item: TimelineClip | null = null;
    let placeholder = false;
    if (shot.kind === "presenter") {
      const clip = clipOf.get(shot.index)!;
      const asset = assetOf(clip);
      if (asset) {
        const length = clip.lengthSeconds ?? asset.durationSeconds ?? null;
        item = clipFromSource({
          assetId: asset.id,
          kind: "video",
          durationSeconds: length,
          title: `Clip ${clip.position + 1}`,
        });
        const ideal = idealTrim(shot, shot.startFrame);
        const trim = ideal < ON_FRAME_SECONDS ? 0 : round6(ideal);
        if (Math.abs(trim - ideal) >= ON_FRAME_SECONDS)
          notes.push(
            `Clip ${clip.position + 1}'s lips are ${Math.round((trim - ideal) * 1000)} ms off: it had no room before its speech.`,
          );
        item.trimStart = trim;
        if (length !== null && trim + seconds > length + 1 / fps)
          notes.push(
            `Clip ${clip.position + 1} runs ${(trim + seconds - length).toFixed(2)}s short of its place: its last frame is held.`,
          );
        item.volume = options.keepSound ? 1 : 0;
        // Straight on from the clip before it, in the same shot: put back in register.
        const before = planned[index - 1];
        item.matchPrevious =
          !!clip.continuesPrevious &&
          before?.kind === "presenter" &&
          before.index === clip.position - 1;
        item.smartBlend = item.matchPrevious;
      } else {
        item = placeholderClip(`Clip ${clip.position + 1} (not in yet)`);
        placeholder = true;
      }
    } else {
      const fill = options.fills?.[shot.index] ?? null;
      const label = fill?.label?.trim() || `B-roll ${shot.index + 1}`;
      if (fill) {
        item = clipFromSource({
          assetId: fill.assetId,
          kind: fill.kind,
          durationSeconds: fill.sourceSeconds ?? null,
          title: label,
        });
        if (fill.kind === "video") {
          const source = fill.sourceSeconds ?? null;
          let inPoint = Math.max(0, fill.inPoint ?? 0);
          // In from where it fits, if it can.
          if (source !== null && inPoint + seconds > source)
            inPoint = Math.max(0, source - seconds);
          if (source !== null && seconds > source + 1 / fps)
            notes.push(
              `${label} is ${source.toFixed(1)}s long and its stretch ${seconds.toFixed(1)}s: its last frame is held.`,
            );
          item.trimStart = round6(inPoint);
          item.volume = 0;
        } else item.motion = "zoom_in";
      } else {
        item = placeholderClip(`${label}: add B-roll here`);
        placeholder = true;
      }
    }
    if (!item) {
      notes.push(
        shot.kind === "cutaway"
          ? `B-roll ${shot.index + 1} has nothing to show yet, and no still to stand in for it.`
          : `Clip ${shot.index + 1} isn't in yet, and no still can stand in for it.`,
      );
      // Its time goes to the shot before, or (at the very start) the shot after,
      // so the edit stays on the voiceover's clock.
      const previous = result.at(-1);
      const last = segments.at(-1);
      if (previous && last) {
        previous.duration = round6(previous.duration + seconds);
        last.endFrame = shot.endFrame;
      } else pendingFrames += frames;
      return;
    }
    let startFrame = shot.startFrame;
    let length = seconds;
    if (pendingFrames) {
      // Shown earlier to fill what went before it: B-roll simply starts sooner,
      // and a presenter clip shows that much more of its own start (its lips
      // stay on the voice) where it has it.
      const earlier = round6(pendingFrames / fps);
      if (item.kind === "video" && shot.kind === "presenter") {
        if (item.trimStart + 1e-9 >= earlier) item.trimStart = round6(item.trimStart - earlier);
        else
          notes.push(`Clip ${shot.index + 1} opens the edit early and out of step with its words.`);
      }
      startFrame -= pendingFrames;
      length = round6(length + earlier);
      pendingFrames = 0;
    }
    item.duration = length;
    item.transition = { type: "cut", duration: 0 };
    if (shot.kind === "cutaway" || planned[index - 1]?.kind === "cutaway") {
      item.matchPrevious = false;
      item.smartBlend = false;
    }
    result.push(item);
    segments.push({
      kind: shot.kind,
      startFrame,
      endFrame: shot.endFrame,
      index: shot.index,
      ...(placeholder ? { placeholder: true } : {}),
    });
  });

  const totalFrames = segments.at(-1)?.endFrame ?? 0;
  const total = totalFrames / fps;

  if (result.length) {
    const voice = audioFromSource(
      {
        assetId: voiceover.assetId,
        durationSeconds: voiceover.durationSeconds,
        title: voiceover.title,
      },
      "voiceover",
      0,
    );
    voice.trimStart = voiceoverTrim;
    timeline.audio = [voice];
    if (options.music) {
      const music = audioFromSource(
        {
          assetId: options.music.assetId,
          durationSeconds: options.music.durationSeconds,
          title: options.music.title ?? "Music",
        },
        "music",
        0,
      );
      music.volume = 0.65;
      music.duckLevel = 0.25;
      timeline.audio.push(music);
    }
    // Captions stop where a closing title starts.
    const closing = (options.titles ?? [])
      .map((title) => title.at - voiceoverTrim)
      .filter((at) => at > total - 12 && at < total);
    const until = closing.length ? Math.min(total, ...closing) : total;
    if (voiceover.words.length)
      timeline.captions = {
        ...timeline.captions,
        enabled: options.captions,
        segments: phraseCaptions(voiceover.words, -voiceoverTrim, {
          until,
          script: voiceover.script ?? null,
          terms: voiceover.terms ?? [],
        }).segments,
      };
  }

  const titles: Overlay[] = (options.titles ?? []).flatMap((title) => {
    const start = round6(Math.max(0, title.at - voiceoverTrim));
    const end = round6(Math.min(total, start + Math.max(0.5, title.seconds)));
    if (!title.text.trim() || end - start < 0.2) return [];
    return [
      {
        id: newId(),
        text: title.text.trim().slice(0, LIMITS.overlayChars),
        start,
        end,
        style: title.style ?? "title",
        position: title.position ?? "center",
        y: title.y ?? null,
        // On a halo: a title read over B-roll and white flashes alike.
        backing: title.style === "cta" ? "outline" : "halo",
      },
    ];
  });
  timeline.overlays = titles.slice(0, LIMITS.overlays);

  const card = options.endCard;
  if (card && result.length) {
    const still = clipFromSource({
      assetId: card.assetId,
      kind: "image",
      durationSeconds: null,
      title: "End card",
    });
    still.motion = "none";
    const frame = frameSize(timeline.aspectRatio, timeline.resolution);
    const gap =
      card.width && card.height
        ? Math.abs(Math.log(card.width / card.height / (frame.width / frame.height)))
        : 1;
    still.fit = gap < 0.02 ? "cover" : "contain";
    still.transition = { type: "cut", duration: 0 };
    still.duration = Math.max(0.5, Math.min(card.seconds, LIMITS.clipSeconds));
    result.push(still);
    segments.push({
      kind: "end_card",
      startFrame: totalFrames,
      endFrame: totalFrames + Math.round(still.duration * fps),
      index: 0,
    });
  }

  if (result.length > LIMITS.clips)
    notes.push(
      `The edit has ${result.length} shots and holds ${LIMITS.clips}: the last ${result.length - LIMITS.clips} are left out. Join some cutaways.`,
    );

  return {
    title: run.title,
    timeline: { ...timeline, clips: result.slice(0, LIMITS.clips) },
    missing,
    segments,
    voiceoverTrim,
    notes,
  };
}
