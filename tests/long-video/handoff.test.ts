import { describe, expect, test } from "bun:test";
import { countedLength, handoffFrameOf, indexedFrameOf } from "../../src/lib/long-video/handoff";

describe("a frame taken by its number", () => {
  test("is read from the media service's report", () => {
    const frame = indexedFrameOf({
      frame_mode: "index",
      frame_index: 223,
      requested_index: 223,
      frame_count: 301,
      fps: 30,
    });
    expect(frame).toEqual({ index: 223, count: 301, fps: 30, requested: 223 });
    expect(countedLength(frame!)).toBeCloseTo(301 / 30, 6);
  });

  test("says when the clip was shorter than the frame asked for", () => {
    const frame = indexedFrameOf({
      frame_mode: "index",
      frame_index: 149,
      requested_index: 160,
      frame_count: 150,
      fps: 30,
    });
    expect(frame?.index).toBe(149);
    expect(frame?.requested).toBe(160);
  });

  test("isn't the last frame, and the last frame isn't it", () => {
    const last = { frame_mode: "last", frame_index: 10, frame_count: 11, fps: 30 };
    expect(indexedFrameOf(last)).toBeNull();
    expect(handoffFrameOf({ ...last, frame_mode: "index" })).toBeNull();
    expect(
      indexedFrameOf({ frame_mode: "index", frame_index: 12, frame_count: 11, fps: 30 }),
    ).toBeNull();
    expect(
      indexedFrameOf({ frame_mode: "index", frame_index: 3, frame_count: 11, fps: 0 }),
    ).toBeNull();
  });
});
