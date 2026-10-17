/** A probe's measurement of a generated file, read (see ./measure-asset.server). */

type Json = Record<string, unknown>;

/** What a probe measured of a file, read: its picture's own length, size and frame rate. */
export function measurementOf(metadata: unknown): {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
} {
  const probe = (metadata ?? {}) as Json;
  const positive = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return {
    // The picture's own length where it is reported: the container's can run on with the sound.
    durationSeconds:
      positive(probe["video_duration_seconds"]) ?? positive(probe["duration_seconds"]),
    width: positive(probe["width"]),
    height: positive(probe["height"]),
    fps: positive(probe["fps"]),
  };
}
