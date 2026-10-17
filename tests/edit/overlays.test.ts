import { describe, expect, test } from "bun:test";
import { buildRenderRequest, parseTimeline } from "../../src/lib/edit/timeline";

const clip = {
  id: "c1",
  assetId: "11111111-1111-4111-8111-111111111111",
  kind: "video",
  duration: 5,
};

describe("titles on the frame", () => {
  test("an edit saved before heights and backings reads as it did, and renders as it did", () => {
    const timeline = parseTimeline({
      clips: [clip],
      overlays: [{ id: "o1", text: "Hello", start: 0, end: 2, style: "title", position: "top" }],
    })!;
    expect(timeline.overlays[0]).toMatchObject({ y: null, backing: "outline" });
    const overlay = (
      buildRenderRequest(timeline).params["overlays"] as Record<string, unknown>[]
    )[0]!;
    expect(overlay).toEqual({ text: "Hello", start: 0, end: 2, style: "title", position: "top" });
  });

  test("a title at a height of its own, on a halo or a box, is rendered so", () => {
    const timeline = parseTimeline({
      clips: [clip],
      overlays: [
        { id: "o1", text: "AURIXA SYSTEMS", start: 0, end: 2, y: 0.42, backing: "halo" },
        {
          id: "o2",
          text: "14-DAY FREE TRIAL",
          start: 2,
          end: 4,
          style: "subtitle",
          backing: "box",
        },
      ],
    })!;
    const overlays = buildRenderRequest(timeline).params["overlays"] as Record<string, unknown>[];
    expect(overlays[0]).toMatchObject({ y: 0.42, backing: "halo" });
    expect(overlays[1]).toMatchObject({ backing: "box" });
    expect(overlays[1]!["y"]).toBeUndefined();
  });

  test("a height off the frame isn't taken", () => {
    expect(
      parseTimeline({
        clips: [clip],
        overlays: [{ id: "o1", text: "x", start: 0, end: 1, y: 1.4 }],
      }),
    ).toBeNull();
  });
});
