import { describe, expect, test } from "bun:test";
import { buildRenderRequest, parseTimeline } from "../../src/lib/edit/timeline";

const clip = {
  id: "c1",
  assetId: "11111111-1111-4111-8111-111111111111",
  kind: "video",
  duration: 5,
};

describe("frame rates and scaling", () => {
  test("an edit saved before them repeats frames and scales as it did, and asks for nothing new", () => {
    const timeline = parseTimeline({ clips: [clip] })!;
    expect(timeline).toMatchObject({ frameRateConversion: "duplicate", upscale: "standard" });
    const params = buildRenderRequest(timeline).params;
    expect(params["frame_rate_conversion"]).toBeUndefined();
    expect(params["upscale"]).toBeUndefined();
  });

  test("motion interpolation and sharp scaling are sent when chosen", () => {
    const timeline = parseTimeline({
      clips: [clip],
      frameRateConversion: "motion",
      upscale: "sharp",
    })!;
    const params = buildRenderRequest(timeline).params;
    expect(params["frame_rate_conversion"]).toBe("motion");
    expect(params["upscale"]).toBe("sharp");
  });

  test("an unknown conversion isn't taken", () => {
    expect(parseTimeline({ clips: [clip], frameRateConversion: "warp" })).toBeNull();
  });
});
