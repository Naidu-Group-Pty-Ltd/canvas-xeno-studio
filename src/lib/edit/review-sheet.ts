/**
 * Review sheets (feature "review_sheet"): a finished render's every shot half
 * a second in and on its last frame, as one picture, each frame labelled with
 * the clip's name and, for an edit made from a storyboard or a brief, the
 * shot's description (Reel 1 reviewed every shot as a strip of its beats;
 * HANDOVER.md 2.2, G2). The media service lays the sheet out; this decides
 * what is on it. Pure: the server looks the descriptions up
 * (./review-sheet.server).
 */
import {
  formatTime,
  frameSize,
  layoutTimeline,
  type Timeline,
  type TimelineClip,
} from "./timeline";

/** What the media service says it can do, when it makes review sheets. */
export const REVIEW_SHEET_FEATURE = "review_sheet";

/** How far into each shot its first frame is taken (seconds), once it is on screen alone. */
const IN_POINT = 0.5;

export interface ReviewTile {
  /** Seconds into the render, on its frame grid. */
  time: number;
  label: string;
  note: string;
}

/** The media service's review_sheet parameters. */
export interface ReviewSheetParams {
  title: string;
  columns: number;
  tile_width: number;
  tiles: ReviewTile[];
}

/**
 * The frames a render's sheet shows. For each clip: half a second after it is
 * on screen alone (past the transition into it) and the last frame it is on
 * screen alone (before the transition into the next), each taken on its frame;
 * a clip too short for two shows one. Labelled "3 · Its name" and "3 · last
 * frame", with the time each is at and, on the first, the shot's description
 * (`notes`, by clip).
 */
export function reviewTiles(
  timeline: Pick<Timeline, "clips" | "fps">,
  notes: readonly (string | null | undefined)[] = [],
): ReviewTile[] {
  const fps = timeline.fps;
  const layout = layoutTimeline(timeline);
  const tiles: ReviewTile[] = [];
  for (const entry of layout.clips) {
    const first = Math.round(entry.start * fps);
    const alone = first + Math.round(entry.transitionIn * fps);
    const next = layout.clips[entry.index + 1];
    const last = Math.round((next && next.transitionIn > 0 ? next.start : entry.end) * fps) - 1;
    const inFrame = Math.min(Math.max(first + Math.round(IN_POINT * fps), alone), last);
    const number = entry.index + 1;
    const description = notes[entry.index]?.replace(/\s+/g, " ").trim();
    tiles.push({
      time: inFrame / fps,
      label: `${number} · ${clipName(entry.clip, number)}`,
      note: [formatTime(inFrame / fps), description].filter(Boolean).join(" · "),
    });
    if (last > inFrame)
      tiles.push({
        time: last / fps,
        label: `${number} · last frame`,
        note: formatTime(last / fps),
      });
  }
  return tiles;
}

function clipName(clip: TimelineClip, number: number): string {
  return clip.label?.replace(/\s+/g, " ").trim() || `Clip ${number}`;
}

/** A tile's width (pixels) for the picture's shape: about the same size of tile whatever the shape. */
export function tileWidthFor(width: number, height: number): number {
  const quotient = width > 0 && height > 0 ? width / height : 9 / 16;
  return Math.max(120, Math.min(640, 2 * Math.round(Math.sqrt(130_000 * quotient) / 2)));
}

/**
 * A render's review sheet, as the media service is asked for it: headed with
 * the edit's name, version and length, four frames across (six for a long
 * vertical edit, so the sheet isn't too tall to scroll), in the render's own
 * shape (`size`, its video's; else the edit's frame).
 */
export function reviewSheetParams(input: {
  title: string;
  version: number;
  timeline: Timeline;
  notes?: readonly (string | null | undefined)[];
  size?: { width: number | null; height: number | null } | null;
}): ReviewSheetParams {
  const tiles = reviewTiles(input.timeline, input.notes);
  const frame = frameSize(input.timeline.aspectRatio, input.timeline.resolution);
  const width = input.size?.width || frame.width;
  const height = input.size?.height || frame.height;
  const name = input.title.replace(/\s+/g, " ").trim() || "Edit";
  return {
    title: `${name} · version ${input.version} · ${formatTime(layoutTimeline(input.timeline).total)}`,
    columns: width < height && tiles.length > 48 ? 6 : 4,
    tile_width: tileWidthFor(width, height),
    tiles,
  };
}

/* ------------------------------------------------------------------ */
/* Shot descriptions                                                   */
/* ------------------------------------------------------------------ */

/** A storyboard's shot, with the files of its takes. */
export interface StoryboardShotNote {
  sceneNumber: number;
  shotNumber: number;
  description: string | null;
  prompt: string | null;
  assetIds: string[];
}

/** A Supercomputer draft an edit was made from (its clip is named for it), with what it is for. */
export interface DraftNote {
  title: string;
  note: string | null;
}

/** What an edit was made from, to describe its shots by. */
export interface ShotSources {
  shots?: StoryboardShotNote[];
  drafts?: DraftNote[];
  /** The brief's notes on its own pictures, by file. */
  imageNotes?: { assetId: string; description: string }[];
}

const SHOT_NUMBER = /^(?:shot\s+)?(\d+)\.(\d+)(?:\s|$)/i;

/**
 * Each clip's shot description, or null: a storyboard's shot (the one whose
 * take the clip plays, else the one its name numbers, "2.3 …"), its
 * description or else its prompt; a draft's, by the clip's name; the brief's
 * note on a picture the clip shows.
 */
export function shotNotes(clips: readonly TimelineClip[], sources: ShotSources): (string | null)[] {
  const shots = sources.shots ?? [];
  return clips.map((clip) => {
    const label = clip.label?.trim() ?? "";
    const numbered = SHOT_NUMBER.exec(label);
    const shot =
      shots.find((entry) => entry.assetIds.includes(clip.assetId)) ??
      (numbered
        ? shots.find(
            (entry) =>
              entry.sceneNumber === Number(numbered[1]) && entry.shotNumber === Number(numbered[2]),
          )
        : undefined);
    const fromShot = shot ? shot.description?.trim() || shot.prompt?.trim() : "";
    if (fromShot) return fromShot;
    const draft = label ? sources.drafts?.find((entry) => entry.title.trim() === label) : undefined;
    if (draft?.note?.trim()) return draft.note.trim();
    const image = sources.imageNotes?.find((entry) => entry.assetId === clip.assetId);
    return image?.description.trim() || null;
  });
}

/**
 * The drafts in a Supercomputer message's payload, each with what it is for:
 * the edit plan's note on its shot, else its purpose, else its prompt.
 */
export function draftNotes(payload: unknown): DraftNote[] {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const drafts = Array.isArray(record["drafts"]) ? record["drafts"] : [];
  const plan = (record["editPlan"] ?? {}) as Record<string, unknown>;
  const planned = Array.isArray(plan["shots"]) ? plan["shots"] : [];
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return drafts.flatMap((draft, index) => {
    const entry = (draft ?? {}) as Record<string, unknown>;
    const title = text(entry["title"]);
    if (!title) return [];
    const shot = planned.find(
      (item) => !!item && (item as Record<string, unknown>)["draftIndex"] === index,
    ) as Record<string, unknown> | undefined;
    return [
      { title, note: text(shot?.["note"]) ?? text(entry["purpose"]) ?? text(entry["prompt"]) },
    ];
  });
}

/** The brief analysis's notes on its pictures. */
export function briefImageNotes(analysis: unknown): { assetId: string; description: string }[] {
  const record = (analysis && typeof analysis === "object" ? analysis : {}) as Record<
    string,
    unknown
  >;
  const notes = Array.isArray(record["image_notes"]) ? record["image_notes"] : [];
  return notes.flatMap((note) => {
    const entry = (note ?? {}) as Record<string, unknown>;
    return typeof entry["asset_id"] === "string" && typeof entry["description"] === "string"
      ? [{ assetId: entry["asset_id"], description: entry["description"] }]
      : [];
  });
}

/* ------------------------------------------------------------------ */
/* A render's sheet, as it stands                                      */
/* ------------------------------------------------------------------ */

/** A review sheet's task, as the library and the API show it. */
export interface ReviewSheetState {
  taskId: string;
  status: "making" | "ready" | "failed";
  assetId: string | null;
  error: string | null;
}

/** A review sheet's media task, read as where the sheet stands. */
export function reviewSheetState(task: {
  id: string;
  status: string;
  result_asset_id: string | null;
  error_message: string | null;
}): ReviewSheetState {
  const status =
    task.status === "completed" && task.result_asset_id
      ? "ready"
      : task.status === "failed" || task.status === "completed"
        ? "failed"
        : "making";
  return {
    taskId: task.id,
    status,
    assetId: status === "ready" ? task.result_asset_id : null,
    error:
      status === "failed"
        ? task.error_message || "The review sheet couldn't be made. Make it again."
        : null,
  };
}
