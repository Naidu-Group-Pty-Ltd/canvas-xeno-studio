import { describe, expect, test } from "bun:test";
import { measurementOf } from "../../src/lib/media/measure-asset.server";

describe("a generated file, measured", () => {
  test("takes its picture's own length over the container's, with its size and frame rate", () => {
    expect(
      measurementOf({
        duration_seconds: 9.1,
        video_duration_seconds: 9.032,
        width: 720,
        height: 1280,
        fps: 24,
      }),
    ).toEqual({ durationSeconds: 9.032, width: 720, height: 1280, fps: 24 });
  });

  test("keeps nothing it couldn't read", () => {
    expect(measurementOf({ duration_seconds: 0, width: "720" })).toEqual({
      durationSeconds: null,
      width: null,
      height: null,
      fps: null,
    });
    expect(measurementOf(null).durationSeconds).toBeNull();
  });
});
