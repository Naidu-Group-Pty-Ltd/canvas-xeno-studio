/**
 * What a version showed, kept with it when it is added, so a version stays
 * a record however the edit or storyboard changes afterwards: a render's
 * clips, captions and titles (from the timeline it rendered), or a
 * storyboard's shots, each with its time and the words that name it. Notes
 * are matched to shots and times from these (./notes).
 *
 * Pure, shared by the browser, the server and tests.
 */
import { layoutTimeline, parseTimeline } from "../edit/timeline";

export interface TimedText {
  start: number;
  end: number;
  text: string;
}

export interface RenderSnapshot {
  kind: "render";
  sequenceId: string;
  sequenceVersion: number;
  title: string;
  fps: number;
  seconds: number;
  /** Each clip's label (a storyboard's compiled clips are "3.2 Name") and where it plays. */
  clips: { label: string; start: number; end: number }[];
  captions: TimedText[];
  titles: TimedText[];
}

export interface SnapshotShot {
  id: string;
  /** How the shot is known: the brief's own id ("04.1"), else scene.shot ("3.2"). */
  label: string;
  name: string;
  start: number;
  end: number;
  cue: string | null;
  /** Its words: what is on screen, the voiceover lines it carries, what it is made from. */
  words: string[];
}

export interface StoryboardSnapshot {
  kind: "storyboard";
  storyboardId: string;
  title: string;
  /**
   * Whose clock the shots' times are on: timed from the voice (applied in
   * Storyboards), the brief's own, or the shots' lengths end to end.
   */
  clock: "voice" | "brief" | "lengths";
  shots: SnapshotShot[];
}

export type VersionSnapshot = RenderSnapshot | StoryboardSnapshot;

/** At most this many captions are kept (an edit holds up to 600). */
const CAPTIONS_KEPT = 600;

const round3 = (value: number) => Number(value.toFixed(3));

/** A render's record, from the timeline it rendered. */
export function renderSnapshot(render: {
  sequenceId: string;
  sequenceVersion: number;
  title: string;
  timeline: unknown;
  durationSeconds: number | null;
}): RenderSnapshot {
  const timeline = parseTimeline(render.timeline);
  const layout = timeline ? layoutTimeline(timeline) : null;
  return {
    kind: "render",
    sequenceId: render.sequenceId,
    sequenceVersion: render.sequenceVersion,
    title: render.title,
    fps: timeline?.fps ?? 30,
    seconds: round3(render.durationSeconds ?? layout?.total ?? 0),
    clips: (layout?.clips ?? []).map((entry, index) => ({
      label: entry.clip.label?.trim() || `Clip ${index + 1}`,
      start: round3(entry.start),
      end: round3(entry.end),
    })),
    captions: (timeline?.captions.segments ?? []).slice(0, CAPTIONS_KEPT).map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
    })),
    titles: (timeline?.overlays ?? []).map((overlay) => ({
      start: overlay.start,
      end: overlay.end,
      text: overlay.text,
    })),
  };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
    : [];
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export interface StoryboardInput {
  id: string;
  title: string;
  scenes: {
    scene_number: number;
    shots: {
      id: string;
      shot_number: number;
      name: string | null;
      duration_seconds: number | null;
      spec: unknown;
    }[];
  }[];
}

/**
 * A storyboard's record: its shots in order, each with a time. Every shot
 * timed from the voice keeps those times; else, when every shot has the
 * brief's own in and out, those; else the shots' lengths laid end to end.
 */
export function storyboardSnapshot(board: StoryboardInput): StoryboardSnapshot {
  const shots = [...board.scenes]
    .sort((a, b) => a.scene_number - b.scene_number)
    .flatMap((scene) =>
      [...scene.shots]
        .sort((a, b) => a.shot_number - b.shot_number)
        .map((shot) => ({ scene: scene.scene_number, shot, spec: asRecord(shot.spec) })),
    );
  const voice = shots.map(({ spec }) => {
    const timing = asRecord(spec["timing"]);
    const start = finite(timing["start"]);
    const end = finite(timing["end"]);
    return start !== null && end !== null && end > start ? { start, end } : null;
  });
  const brief = shots.map(({ spec }) => {
    const start = finite(spec["in"]);
    const end = finite(spec["out"]);
    return start !== null && end !== null && end > start ? { start, end } : null;
  });
  const clock: StoryboardSnapshot["clock"] =
    shots.length && voice.every(Boolean)
      ? "voice"
      : shots.length && brief.every(Boolean)
        ? "brief"
        : "lengths";
  let cursor = 0;
  return {
    kind: "storyboard",
    storyboardId: board.id,
    title: board.title,
    clock,
    shots: shots.map(({ scene, shot, spec }, index) => {
      const length = Math.max(0, Number(shot.duration_seconds ?? 0) || 0);
      const time =
        clock === "voice"
          ? voice[index]!
          : clock === "brief"
            ? brief[index]!
            : { start: cursor, end: cursor + length };
      cursor += length;
      const id = typeof spec["id"] === "string" && spec["id"].trim() ? spec["id"].trim() : null;
      return {
        id: shot.id,
        label: id ?? `${scene}.${shot.shot_number}`,
        name: shot.name?.trim() || `Shot ${scene}.${shot.shot_number}`,
        start: round3(time.start),
        end: round3(time.end),
        cue: typeof spec["cue"] === "string" ? spec["cue"] : null,
        words: [
          ...(typeof spec["title"] === "string" ? [spec["title"]] : []),
          ...strings(spec["on_screen"]),
          ...strings(spec["voiceover"]),
          ...strings(spec["sources"]),
        ],
      };
    }),
  };
}

/** A stored snapshot, or null when it isn't one this app reads. */
export function readSnapshot(value: unknown): VersionSnapshot | null {
  const record = asRecord(value);
  if (record["kind"] === "render" && Array.isArray(record["clips"]))
    return record as unknown as RenderSnapshot;
  if (record["kind"] === "storyboard" && Array.isArray(record["shots"]))
    return record as unknown as StoryboardSnapshot;
  return null;
}
