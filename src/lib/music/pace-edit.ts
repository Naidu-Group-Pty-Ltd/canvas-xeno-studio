/**
 * An edit's voiceover paced to its music in one go, as Reel 1's third cut
 * was: the solver (./pacing) over every cut that hangs on the voice, with each
 * of the voice's measured silences (src/lib/edit/voice-pauses) a pause it may
 * lengthen, then laid in with the cuts following the words (editVoicePauses),
 * so each cut lands where it was solved. The change is worked out first, for a
 * person to see before it is applied. Pure.
 */
import {
  editVoicePauses,
  layoutTimeline,
  pauseSilences,
  pausesOnEdit,
  retimeForPauses,
  audioPlayLength,
  type Timeline,
  type VoicePause,
} from "@/lib/edit/timeline";
import type { MeasuredVoice, SilenceKind } from "@/lib/edit/voice-pauses";
import { landingOn, solvePacing, type PacingGrid, type PacingPause } from "./pacing";

/** The most a silence may be lengthened by, by what kind of break it is (seconds). */
const ROOM: Record<SilenceKind, number> = {
  start: 1,
  sentence: 0.8,
  phrase: 0.4,
  breath: 0.2,
};

export interface PaceChange {
  /** The edit with the voice paced and its cuts moved. */
  timeline: Timeline;
  /** The pauses before and after, and the frames they add between them. */
  pauses: { before: number; after: number; framesBefore: number; framesAfter: number };
  /** The cuts that hang on the voice: how many move, and where they land on the music after. */
  cuts: { total: number; moved: number; onBars: number; onBeats: number; onBarsBefore: number };
  /** The edit's length, before and after. */
  length: { before: number; after: number };
  /** Clips without the footage to keep their cut with the words. */
  shortClips: string[];
}

/** Where each cut between two clips falls: the middle of the transition into the next, else its end. */
function cutTimes(timeline: Timeline): { id: string; time: number }[] {
  const layout = layoutTimeline(timeline);
  return layout.clips.slice(0, -1).map((entry, index) => {
    const next = layout.clips[index + 1]!;
    return { id: next.clip.id, time: entry.end - next.transitionIn / 2 };
  });
}

/**
 * The voiceover `voiceId` paced to `grid` (the music's beats and bar lines on
 * the edit's clock): each of its measured silences may be lengthened, from the
 * room it has now (what it should stay near) up to what its kind of break
 * allows, so the cuts after the voice starts land on bar lines and beats.
 * Null when the edit has no such voiceover, or nothing for the music to move.
 */
export function paceVoiceToMusic(
  timeline: Timeline,
  voiceId: string,
  voice: MeasuredVoice,
  grid: PacingGrid,
): PaceChange | null {
  const item = timeline.audio.find((entry) => entry.id === voiceId);
  if (!item || item.role !== "voiceover") return null;
  const fps = timeline.fps;
  const layout = layoutTimeline(timeline);
  const length = audioPlayLength(item, layout.total, fps);
  // The pauses it is held open by now, as heard, and the edit's moments without them.
  const heard = pauseSilences(item, fps, length);
  const now = pausesOnEdit({ ...item, pauses: heard });
  const unpaced = (time: number) => retimeForPauses(time, now, [], fps, "cut");
  const onEdit = (at: number) => item.start + (at - item.trimStart);
  // How far into its recording it plays: its silences can only go up to there.
  const silent = heard.reduce(
    (sum, pause) => sum + Math.min(pause.seconds, Math.max(0, length - pause.from)),
    0,
  );
  const reach = item.trimStart + Math.max(0, length - silent);

  const cuts = cutTimes(timeline)
    .map((cut) => ({ id: cut.id, at: unpaced(cut.time) }))
    .filter((cut) => cut.at > item.start + 1e-6);
  if (!cuts.length) return null;

  // Between each cut and the next, room goes where the voice already pauses
  // (near what it adds now); where it doesn't, into the one silence that is
  // the longest break there, as each of Reel 1's pauses had its place.
  const kindOf = (at: number) =>
    voice.silences.find((silence) => at >= silence.from - 0.005 && at <= silence.to + 0.005)
      ?.kind ?? null;
  const offered = voice.silences
    .filter((silence) => silence.to >= item.trimStart)
    .map((silence) => ({ silence, at: Math.max(silence.at, item.trimStart) }))
    .filter((entry) => entry.at <= reach + 1e-6);
  const edges = [item.start, ...cuts.map((cut) => cut.at), Infinity];
  const sourceOf: number[] = [];
  const pauses: PacingPause[] = [];
  const offer = (at: number, near: number, kind: SilenceKind | null) => {
    sourceOf.push(at);
    // A pause in no silence the voice offers is kept as it is.
    const room = kind ? Math.round(ROOM[kind] * fps) : near;
    pauses.push({ at: onEdit(at), near, min: kind ? 0 : near, max: Math.max(near, room) });
  };
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const [from, to] = [edges[index]!, edges[index + 1]!];
    const within = (at: number) => onEdit(at) >= from - 1e-6 && onEdit(at) < to - 1e-6;
    const kept = heard.filter((pause) => within(pause.at));
    for (const pause of kept) offer(pause.at, pause.frames, kindOf(pause.at));
    if (kept.length) continue;
    const longest = offered
      .filter((entry) => within(entry.at))
      .sort((a, b) => b.silence.to - b.silence.from - (a.silence.to - a.silence.from))[0];
    if (longest) offer(longest.at, 0, longest.silence.kind);
  }

  const solution = solvePacing({ fps, cuts, pauses, grid });
  const chosen: VoicePause[] = solution.pauses.flatMap((pause, index) =>
    pause.frames ? [{ at: sourceOf[index]!, frames: pause.frames }] : [],
  );
  const edit = editVoicePauses(timeline, voiceId, chosen, { cuts: true });

  const landing = landingOn(grid, fps);
  const frameOf = (time: number) => Math.round(time * fps);
  const before = new Map(cutTimes(timeline).map((cut) => [cut.id, frameOf(cut.time)]));
  const after = cutTimes(edit.timeline).filter((cut) => cuts.some((entry) => entry.id === cut.id));
  const landed = after.map((cut) => landing(frameOf(cut.time)));
  return {
    timeline: edit.timeline,
    pauses: {
      before: heard.length,
      after: chosen.length,
      framesBefore: heard.reduce((sum, pause) => sum + pause.frames, 0),
      framesAfter: chosen.reduce((sum, pause) => sum + pause.frames, 0),
    },
    cuts: {
      total: cuts.length,
      moved: after.filter((cut) => before.get(cut.id) !== frameOf(cut.time)).length,
      onBars: landed.filter((value) => value === "bar").length,
      onBeats: landed.filter((value) => value === "beat").length,
      onBarsBefore: cuts.filter((cut) => landing(before.get(cut.id) ?? 0) === "bar").length,
    },
    length: { before: layout.total, after: layoutTimeline(edit.timeline).total },
    shortClips: edit.shortClips,
  };
}
