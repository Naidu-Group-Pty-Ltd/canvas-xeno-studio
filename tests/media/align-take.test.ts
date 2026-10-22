import { describe, expect, test } from "bun:test";
import { alignmentOf, alignmentSummary } from "../../src/lib/media/align-take";

/** What the worker's align_take reports for a take 3% large, 7 px right and 4 px up, and lighter. */
const MEASURED = {
  alignment: {
    likeness_before: 0.9074,
    likeness_after: 0.9998,
    registered: true,
    framing: { scale_x: 1.03, scale_y: 1.03, shift_x: 7, shift_y: -4, moved: 0.0261 },
    colour: {
      y: { gain: 0.92, offset: 3.6 },
      u: { gain: 1, offset: -5.9 },
      v: null,
    },
    anchor_error_levels: { before: 10.86, after: 0.87 },
    anchor: "last",
    anchor_frame: 47,
    frames: 48,
    fps: 24,
    cross_seconds: 0.5,
    hold_seconds: 0.5,
  },
};

describe("a take aligned to the picture it lands on", () => {
  test("the worker's report reads back, plane by plane", () => {
    const report = alignmentOf(MEASURED)!;
    expect(report.registered).toBe(true);
    expect(report.anchor).toBe("last");
    expect(report.framing).toEqual({ scaleX: 1.03, scaleY: 1.03, shiftX: 7, shiftY: -4 });
    expect(report.colour).toEqual({
      y: { gain: 0.92, offset: 3.6 },
      u: { gain: 1, offset: -5.9 },
      v: null,
    });
    expect(report.errorBefore).toBe(10.86);
    expect(report.errorAfter).toBe(0.87);
    expect(report.differentPictures).toBe(false);
    expect(report.crossSeconds).toBe(0.5);
  });

  test("nothing measured reads as no report", () => {
    expect(alignmentOf(null)).toBeNull();
    expect(alignmentOf({ width: 1080 })).toBeNull();
    expect(alignmentOf({ alignment: "junk" })).toBeNull();
  });

  test("the summary says how it was moved back, and how close it now lands", () => {
    const summary = alignmentSummary(alignmentOf(MEASURED)!);
    // The take showed the picture 7 px right and 4 px up, 3% large: it was moved back.
    expect(summary).toBe(
      "Moved 7 px left and 4 px down, 2.9% smaller; darker by 6.6 levels; its colour matched. It now ends on the picture within 0.9 levels (from 10.9), crossing to it over 0.5 s.",
    );
  });

  test("a take anchored on its first frame starts on the picture", () => {
    const summary = alignmentSummary(
      alignmentOf({
        alignment: {
          ...MEASURED.alignment,
          anchor: "first",
          framing: null,
          colour: null,
          cross_seconds: 0,
        },
      })!,
    );
    expect(summary).toBe(
      "Already in register. It now starts on the picture within 0.9 levels (from 10.9).",
    );
  });

  test("a frame that isn't the picture at all is said plainly, and nothing claims to be matched", () => {
    const summary = alignmentSummary(
      alignmentOf({
        alignment: {
          likeness_before: 0.0153,
          likeness_after: 0.0153,
          registered: false,
          framing: null,
          colour: null,
          anchor_error_levels: { before: 61.2, after: 61.2 },
          anchor: "last",
          left: "different_pictures",
          cross_seconds: 0.5,
        },
      })!,
    );
    expect(summary).toContain("isn't the picture it should land on (likeness 0.02)");
    expect(summary).toContain("Look at the take before using it");
  });
});
