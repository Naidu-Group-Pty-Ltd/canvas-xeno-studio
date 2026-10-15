/**
 * What the media service reports about the frame a long video's next clip
 * starts from, and what the run does with it. Shared by the server (which
 * runs the chain) and the Editor compile (which cuts the clips together).
 *
 * The frame is the clip's true last frame: the media service decodes and
 * counts the clip's frames, so the frame is the last there is, and the clip's
 * exact length is known. (It leaves out a tail frozen on one picture or
 * fading out, which the next clip would only repeat or jump from.) The Editor
 * then plays each clip through that frame, and the next clip from its second
 * frame: its first is its own copy of the frame it started from.
 */

type Json = Record<string, unknown>;

/** The frame taken, by number, from a clip whose frames were counted. */
export interface HandoffFrame {
  /** The frame taken (0 is the clip's first). */
  index: number;
  /** How many frames the clip has. */
  count: number;
  fps: number;
}

/** The counted frame a media task reported (its output metadata), or null for one taken by time. */
export function handoffFrameOf(metadata: unknown): HandoffFrame | null {
  const meta = (metadata ?? {}) as Json;
  if (meta["frame_mode"] !== "last") return null;
  const index = Number(meta["frame_index"]);
  const count = Number(meta["frame_count"]);
  const fps = Number(meta["fps"]);
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count)
    return null;
  if (!(fps > 0 && fps <= 240)) return null;
  return { index, count, fps };
}

/**
 * The frame taken by its number (a clip made to a voiceover hands off from
 * the frame just after where it is cut), or null for one taken otherwise.
 * `index` is the frame taken; where the clip was shorter than asked for, it is
 * the clip's last and `requested` says which was wanted.
 */
export function indexedFrameOf(metadata: unknown): (HandoffFrame & { requested: number }) | null {
  const meta = (metadata ?? {}) as Json;
  if (meta["frame_mode"] !== "index") return null;
  const index = Number(meta["frame_index"]);
  const count = Number(meta["frame_count"]);
  const fps = Number(meta["fps"]);
  const requested = Number(meta["requested_index"]);
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count)
    return null;
  if (!(fps > 0 && fps <= 240)) return null;
  return { index, count, fps, requested: Number.isInteger(requested) ? requested : index };
}

/** Where the Editor ends a clip that hands off from `frame`: just after it, so it is shown. */
export function inclusiveCut(frame: HandoffFrame): number {
  return Number(((frame.index + 1) / frame.fps).toFixed(6));
}

/** A clip's exact length from its counted frames. */
export function countedLength(frame: HandoffFrame): number {
  return Number((frame.count / frame.fps).toFixed(6));
}

/* ------------------------------------------------------------------ */
/* The camera's move across a join                                     */
/* ------------------------------------------------------------------ */

export const CAMERA_MOVES = [
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
  "tilt_up",
  "tilt_down",
] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];
export type CameraSpeed = "slow" | "steady" | "fast";

/** How the camera was moving as a clip ended, as the media service read it. */
export interface CameraMotion {
  moves: { kind: CameraMove; speed: CameraSpeed }[];
}

export function cameraMotionOf(metadata: unknown): CameraMotion | null {
  const motion = ((metadata ?? {}) as Json)["motion"];
  if (!motion || typeof motion !== "object") return null;
  const raw = (motion as Json)["moves"];
  if (!Array.isArray(raw)) return null;
  const moves = raw.flatMap((entry) => {
    const item = (entry ?? {}) as Json;
    const kind = item["kind"];
    const speed = item["speed"];
    return CAMERA_MOVES.includes(kind as CameraMove) &&
      (speed === "slow" || speed === "steady" || speed === "fast")
      ? [{ kind: kind as CameraMove, speed: speed as CameraSpeed }]
      : [];
  });
  return { moves };
}

const MOVE_WORDS: Record<CameraMove, string> = {
  push_in: "pushing in",
  pull_out: "pulling back",
  pan_left: "panning left",
  pan_right: "panning right",
  tilt_up: "tilting up",
  tilt_down: "tilting down",
};
const SPEED_WORDS: Record<CameraSpeed, string> = {
  slow: "slowly",
  steady: "steadily",
  fast: "fast",
};

/** How a later clip's prompt says where the camera was heading, so it doesn't start from rest. */
export const CAMERA_LINE_START = "Camera continuity:";

/** The sentence telling a clip how the camera was moving as the clip before ended, or null. */
export function cameraLine(motion: CameraMotion | null): string | null {
  if (!motion?.moves.length) return null;
  const parts = motion.moves
    .slice(0, 2)
    .map((move) => `${MOVE_WORDS[move.kind]} ${SPEED_WORDS[move.speed]}`);
  return `${CAMERA_LINE_START} as the previous clip ended, the camera was ${parts.join(" and ")}. Carry that same move on, at the same speed, from the very first frame.`;
}

/**
 * A later clip's prompt with the camera's move from the clip before, right
 * after its opening (the short, specific parts come first, so a model that
 * cuts long prompts short keeps it). Any line from an earlier attempt is
 * replaced; the prompt is returned as it is when the line won't fit.
 */
export function withCameraLine(
  prompt: string,
  motion: CameraMotion | null,
  maxLength: number | null,
): string {
  const paragraphs = prompt
    .split("\n\n")
    .filter((paragraph) => !paragraph.startsWith(CAMERA_LINE_START));
  const base = paragraphs.join("\n\n");
  const line = cameraLine(motion);
  if (!line) return base;
  const at = paragraphs.length > 1 ? 1 : 0;
  const next = [...paragraphs.slice(0, at), line, ...paragraphs.slice(at)].join("\n\n");
  return maxLength && next.length > maxLength ? base : next;
}

/* ------------------------------------------------------------------ */
/* Clips that extend the clip before                                   */
/* ------------------------------------------------------------------ */

/**
 * Where an extension's own footage starts in the video it came back as, when
 * that video is the clip it was given followed by the new part; null when it
 * is the new part alone. Told apart by length: given the clip before, a video
 * that runs as long as that clip plus the length asked for holds both. Its
 * new part starts where the clip it was given ends.
 */
export function extensionLead(input: {
  /** The extension's video, as measured. */
  outputSeconds: number;
  /** The length the extension was asked for. */
  requestedSeconds: number;
  /** The clip it was given, as measured. */
  sourceSeconds: number;
}): number | null {
  const { outputSeconds, requestedSeconds, sourceSeconds } = input;
  if (!(outputSeconds > 0 && requestedSeconds > 0 && sourceSeconds > 0)) return null;
  const extra = outputSeconds - requestedSeconds;
  if (Math.abs(extra - sourceSeconds) > Math.max(1, sourceSeconds * 0.1)) return null;
  // ...and its new part is there to keep.
  return outputSeconds - sourceSeconds >= 1 ? sourceSeconds : null;
}

/**
 * A trim start that keeps the frame at `seconds` as the first: half a frame
 * early, as the media service keeps every frame from the start on, so the
 * frame before it is left out and that frame isn't.
 */
export function frameTrimStart(seconds: number, fps: number | null): number {
  if (!(fps && fps > 0)) return Math.max(0, seconds);
  const frame = Math.round(seconds * fps);
  return Math.max(0, Number(((frame - 0.5) / fps).toFixed(6)));
}
