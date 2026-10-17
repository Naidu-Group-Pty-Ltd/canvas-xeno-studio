/**
 * Clips made from pieces of a voiceover, laid on an edit so that each one's
 * lips meet the voiceover where its piece is.
 *
 * Every boundary in the edit is worked out from the voiceover's own clock,
 * never by adding up the clips before it, so nothing builds up from clip to
 * clip; with the cuts planned on the edit's frame grid (see ./segments), each
 * clip starts exactly where its piece starts. Where a clip's sound was
 * measured (the media worker's measure_sync), the measured offset is honoured:
 * a clip with the speech late is started that much further in, and one with
 * it early is started a frame or two later, the clip before it playing on to
 * fill the gap (it was made with room to spare), or for the first clip, the
 * voiceover's silence before the first word is that much shorter.
 *
 * A last clip made to end on a given frame (its closing keyframe, or the
 * brand's end card it moves into) plays out to its own end, after its piece
 * (the voiceover is over by then), so the video lands on that frame.
 *
 * A clip's sound can be exactly where its piece put it while its lips are
 * not: a model may move the mouth a frame ahead of the sound it was given.
 * Where that lead was measured from the picture (the media worker's
 * lip_check, see ./lip-check), the clip is laid that much later, so the lips
 * land on the voice rather than the clip's own copy of it.
 */

export interface SyncedClipInput {
  /** Where its piece of the voiceover starts and ends, in seconds on the voiceover's clock. */
  start: number;
  end: number;
  /**
   * Where the clip has the speech, against its piece: positive when later in
   * the clip. Null when it wasn't measured: taken as exactly in step.
   */
  offsetSeconds: number | null;
  /** The clip's picture length in seconds, when known. */
  sourceSeconds: number | null;
  /**
   * How far the clip's lips run ahead of its own sound, in seconds (positive:
   * the mouth moves first), as measured from its picture. Null or absent: in
   * step with its sound.
   */
  lipLeadSeconds?: number | null;
}

export interface SyncedClipPlacement {
  /** Where the clip plays in the edit, in seconds, on its frame grid. */
  start: number;
  end: number;
  frames: number;
  /** How far into the clip the edit starts playing it, in seconds. */
  trimStart: number;
  /** How long it plays, in seconds (frames ÷ fps). */
  duration: number;
  /** How far from exact its lips are left, in seconds (0 unless something couldn't be met). */
  errorSeconds: number;
  /** How much shorter the clip is than its place, in seconds (its last frame is then held). */
  shortSeconds: number;
}

export interface SyncedPlacement {
  clips: SyncedClipPlacement[];
  /** The voiceover, laid from the start of the edit. */
  voiceover: { start: number; trimStart: number };
  totalFrames: number;
  totalSeconds: number;
}

const round6 = (value: number) => Number(value.toFixed(6));

/**
 * How far from a frame a time may be and still count as on it. Cuts are kept
 * to six decimals (8.166667 for frame 245 at 30 fps), so a cut on the grid can
 * read a third of a microsecond early; taken for speech that came early, its
 * clip would be laid a whole frame late and trimmed by one.
 */
export const ON_FRAME_SECONDS = 1e-4;

/** The offset a clip is laid by: its measured one, less how far its lips lead its sound. */
export function effectiveOffset(
  clip: Pick<SyncedClipInput, "offsetSeconds" | "lipLeadSeconds">,
  maxOffsetSeconds = Infinity,
): number {
  const believable = (value: number | null | undefined): value is number =>
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    Math.abs(value) <= maxOffsetSeconds;
  const offset = believable(clip.offsetSeconds) ? clip.offsetSeconds : 0;
  const lead = believable(clip.lipLeadSeconds) ? clip.lipLeadSeconds : 0;
  const total = offset - lead;
  return Math.abs(total) < ON_FRAME_SECONDS ? 0 : total;
}

export function placeSyncedClips(input: {
  clips: SyncedClipInput[];
  fps: number;
  /** Offsets past this aren't believed and count as unmeasured. */
  maxOffsetSeconds?: number;
  /** The last clip plays out to the end of its own picture (it ends on a frame it was made to reach). */
  playOutLast?: boolean;
  /** How long the edit may run, so playing out never takes it past what can be rendered. */
  maxTotalSeconds?: number;
}): SyncedPlacement {
  const { clips, fps } = input;
  if (!clips.length)
    return { clips: [], voiceover: { start: 0, trimStart: 0 }, totalFrames: 0, totalSeconds: 0 };
  const limit = input.maxOffsetSeconds ?? Infinity;
  const offsets = clips.map((clip) => effectiveOffset(clip, limit));
  const origin = clips[0]!.start;
  // A first clip with its speech early: the edit starts that much into the
  // voiceover (on a whole frame), so every clip shifts with it.
  const shift = offsets[0]! < 0 ? -Math.ceil(-offsets[0]! * fps - ON_FRAME_SECONDS * fps) / fps : 0;
  const at = (seconds: number) => Math.round((shift + seconds - origin) * fps);

  const bounds = clips.map((clip, index) => (index === 0 ? 0 : at(clip.start)));
  bounds.push(at(clips.at(-1)!.end));
  // The trim that puts a clip's speech on its piece, for a clip starting at frame `bound`.
  const idealTrim = (index: number, bound: number) =>
    bound / fps - shift - (clips[index]!.start - origin) + offsets[index]!;
  for (let index = 1; index < clips.length; index += 1) {
    const ideal = idealTrim(index, bounds[index]!);
    if (ideal >= -ON_FRAME_SECONDS) continue;
    // Speech early: the clip starts later (the one before plays on), keeping two frames of its own.
    const later = Math.ceil(-ideal * fps - ON_FRAME_SECONDS * fps);
    bounds[index] = Math.min(bounds[index]! + later, bounds[index + 1]! - 2);
  }
  // Every clip at least two frames (an edit's shortest).
  for (let index = 1; index < bounds.length; index += 1)
    bounds[index] = Math.max(bounds[index]!, bounds[index - 1]! + 2);
  // Played out: the last clip runs on past its piece to its own last whole frame.
  const lastIndex = clips.length - 1;
  const lastSource = clips[lastIndex]!.sourceSeconds;
  if (input.playOutLast && lastSource !== null && lastSource > 0) {
    const from = bounds[lastIndex]!;
    const trim = Math.max(0, idealTrim(lastIndex, from));
    const end = from + Math.floor((lastSource - trim) * fps + 1e-6);
    const cap =
      input.maxTotalSeconds !== undefined
        ? Math.floor(input.maxTotalSeconds * fps + 1e-6)
        : Infinity;
    bounds[lastIndex + 1] = Math.max(bounds[lastIndex + 1]!, Math.min(end, cap));
  }

  const placed = clips.map((clip, index): SyncedClipPlacement => {
    const from = bounds[index]!;
    const to = bounds[index + 1]!;
    const ideal = idealTrim(index, from);
    // On the grid within rounding: no trim (and nothing reported as missed).
    const trimStart = ideal < ON_FRAME_SECONDS ? 0 : ideal;
    const duration = (to - from) / fps;
    const shortSeconds =
      clip.sourceSeconds !== null && clip.sourceSeconds > 0
        ? Math.max(0, trimStart + duration - clip.sourceSeconds)
        : 0;
    return {
      start: round6(from / fps),
      end: round6(to / fps),
      frames: to - from,
      trimStart: round6(trimStart),
      duration: round6(duration),
      errorSeconds: round6(Math.abs(trimStart - ideal) < ON_FRAME_SECONDS ? 0 : trimStart - ideal),
      shortSeconds: round6(shortSeconds),
    };
  });
  const totalFrames = bounds.at(-1)!;
  return {
    clips: placed,
    voiceover: { start: 0, trimStart: round6(origin - shift) },
    totalFrames,
    totalSeconds: round6(totalFrames / fps),
  };
}

/**
 * The frame of a clip the next clip should start from: the one just after
 * the last the edit shows of it, i.e. where its piece of the voiceover ends
 * (moved by its measured offset), counted at the clip's own frame rate.
 */
export function cutFrameIndex(
  clip: Pick<SyncedClipInput, "start" | "end" | "offsetSeconds">,
  sourceFps: number,
): number {
  const offset =
    clip.offsetSeconds !== null && Number.isFinite(clip.offsetSeconds) ? clip.offsetSeconds : 0;
  return Math.max(0, Math.round((clip.end - clip.start + offset) * sourceFps));
}
