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

export function placeSyncedClips(input: {
  clips: SyncedClipInput[];
  fps: number;
  /** Offsets past this aren't believed and count as unmeasured. */
  maxOffsetSeconds?: number;
}): SyncedPlacement {
  const { clips, fps } = input;
  if (!clips.length)
    return { clips: [], voiceover: { start: 0, trimStart: 0 }, totalFrames: 0, totalSeconds: 0 };
  const limit = input.maxOffsetSeconds ?? Infinity;
  const offsets = clips.map((clip) =>
    clip.offsetSeconds !== null &&
    Number.isFinite(clip.offsetSeconds) &&
    Math.abs(clip.offsetSeconds) <= limit
      ? clip.offsetSeconds
      : 0,
  );
  const origin = clips[0]!.start;
  // A first clip with its speech early: the edit starts that much into the
  // voiceover (on a whole frame), so every clip shifts with it.
  const shift = offsets[0]! < 0 ? -Math.ceil(-offsets[0]! * fps - 1e-9) / fps : 0;
  const at = (seconds: number) => Math.round((shift + seconds - origin) * fps);

  const bounds = clips.map((clip, index) => (index === 0 ? 0 : at(clip.start)));
  bounds.push(at(clips.at(-1)!.end));
  // The trim that puts a clip's speech on its piece, for a clip starting at frame `bound`.
  const idealTrim = (index: number, bound: number) =>
    bound / fps - shift - (clips[index]!.start - origin) + offsets[index]!;
  for (let index = 1; index < clips.length; index += 1) {
    const ideal = idealTrim(index, bounds[index]!);
    if (ideal >= -1e-9) continue;
    // Speech early: the clip starts later (the one before plays on), keeping two frames of its own.
    const later = Math.ceil(-ideal * fps - 1e-9);
    bounds[index] = Math.min(bounds[index]! + later, bounds[index + 1]! - 2);
  }
  // Every clip at least two frames (an edit's shortest).
  for (let index = 1; index < bounds.length; index += 1)
    bounds[index] = Math.max(bounds[index]!, bounds[index - 1]! + 2);

  const placed = clips.map((clip, index): SyncedClipPlacement => {
    const from = bounds[index]!;
    const to = bounds[index + 1]!;
    const ideal = idealTrim(index, from);
    const trimStart = Math.max(0, ideal);
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
      errorSeconds: round6(trimStart - ideal),
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
