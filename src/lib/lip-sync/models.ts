/**
 * Which models a voiceover can drive, and how long a clip has to be asked for
 * so its whole piece of the voiceover is in it.
 *
 * A model's "driving audio" moves the picture to the sound from the clip's
 * first frame: the lips follow it. Reference audio (Seedance, Wan 3.0, MiniMax,
 * Cinema Studio, Grok) is something else: a loose guide the provider may trim,
 * pad or re-time, so a clip made from it can't be cut back to the voiceover
 * exactly, and isn't offered for lip sync.
 */
import type { InputSlot, ModelRegistryEntry } from "../model-schema";

/** Workflows whose audio input is documented as driving audio. A registry row can also say so (capabilities.drivingAudio). */
const DRIVING_AUDIO_PATHS = [/^wan\/v2\.[67]\/(image|text)-to-video$/];

export const LIP_SYNC = {
  /**
   * How much longer than its piece of voiceover a clip is asked for: room for
   * a measured offset to be taken up at its start, and for a provider's
   * rounding, without the clip running out before its piece ends.
   */
  headroomSeconds: 0.25,
  /** A piece shorter than this makes a clip too short to read; cuts aren't put closer. */
  minSegmentSeconds: 1.5,
  /** The frame rate cuts are placed on (Wan makes 30 fps; an edit takes its clips' rate). */
  gridFps: 30,
  /** How far a clip's measured offset is believed: past this, something else went wrong. */
  maxOffsetSeconds: 0.5,
  /**
   * The shortest driving audio a model is sent: Wan's API takes 3 to 30
   * seconds of it. A shorter piece is sent with silence after it (which moves
   * none of its speech), and a clip made to a voiceover is never asked for
   * shorter than this, so its silence is never cut off.
   */
  minDrivingSeconds: 3,
} as const;

/** The clip lengths a clip made to a voiceover can be asked for, from those its model accepts. */
export function lipSyncChoices(choices: number[]): number[] {
  const fit = choices.filter((value) => value + 1e-9 >= LIP_SYNC.minDrivingSeconds);
  return fit.length ? fit : choices;
}

/** The input a voiceover drives the model through: its single audio slot, where the model is one whose audio drives the picture. */
export function drivingAudioSlot(model: ModelRegistryEntry | null | undefined): InputSlot | null {
  if (!model) return null;
  const slot = (model.capabilities?.inputs ?? []).find(
    (entry) => entry.type === "audio" && !entry.array,
  );
  if (!slot) return null;
  if (model.capabilities?.drivingAudio === true) return slot;
  return DRIVING_AUDIO_PATHS.some((path) => path.test(model.model_path)) ? slot : null;
}

/** A model a voiceover can drive. */
export function lipSyncCapable(model: ModelRegistryEntry | null | undefined): boolean {
  return drivingAudioSlot(model) !== null;
}

/**
 * The shortest clip length a model accepts that holds a piece of voiceover
 * and its headroom; null when the piece is too long for any of them.
 */
export function requestSecondsFor(
  choices: number[],
  segmentSeconds: number,
  headroom: number = LIP_SYNC.headroomSeconds,
): number | null {
  const need = segmentSeconds + headroom;
  let best: number | null = null;
  for (const value of choices)
    if (value + 1e-9 >= need && (best === null || value < best)) best = value;
  return best;
}

/** The longest piece of voiceover one clip can hold, with its headroom, within `capSeconds`. */
export function longestSegmentFor(
  choices: number[],
  capSeconds = Infinity,
  headroom: number = LIP_SYNC.headroomSeconds,
): number {
  const fit = choices.filter((value) => value <= capSeconds + 1e-9);
  const longest = fit.length ? Math.max(...fit) : choices.length ? Math.min(...choices) : 0;
  return Math.max(0, longest - headroom);
}

/**
 * Settings a clip made to a voiceover is sent with: one continuous shot, as a
 * multi-shot clip (Wan 2.6's multi_shots) cuts away from the speaker and back.
 */
export function lipSyncValues(
  values: Record<string, unknown>,
  models: (ModelRegistryEntry | null | undefined)[],
): Record<string, unknown> {
  const multiShot = models.some((model) =>
    (model?.parameter_schema?.fields ?? []).some((field) => field.key === "multi_shots"),
  );
  return multiShot ? { ...values, multi_shots: false } : values;
}
