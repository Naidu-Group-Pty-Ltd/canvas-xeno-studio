import { describe, expect, test } from "bun:test";
import { syncOffsetOf, syncReading, syncSummary } from "../../src/lib/lip-sync/sync";

describe("reading a sync measurement", () => {
  test("keeps an offset that was clearly measured and is small enough to believe", () => {
    const reading = syncReading({
      status: "measured",
      offset_seconds: 0.0412345,
      confidence: 0.91,
      margin: 0.4,
      drift_seconds: 0.004,
      has_audio: true,
      fps: 30,
      ignored: "not kept",
    });
    expect(reading.status).toBe("measured");
    expect(reading.offsetSeconds).toBeCloseTo(0.04123, 5);
    expect(reading.reason).toBeNull();
    expect(reading.result).toEqual({
      status: "measured",
      offset_seconds: 0.0412345,
      confidence: 0.91,
      margin: 0.4,
      drift_seconds: 0.004,
      has_audio: true,
      fps: 30,
    });
  });

  test("takes a clip as in step when the offset is too far to believe", () => {
    const reading = syncReading({ status: "measured", offset_seconds: -0.9 });
    expect(reading.status).toBe("unverified");
    expect(reading.offsetSeconds).toBeNull();
    expect(reading.reason).toMatch(/900 ms early/);
  });

  test("says why nothing could be measured", () => {
    expect(syncReading({ status: "no_audio" }).reason).toMatch(/no sound/);
    expect(syncReading({ status: "no_speech" }).reason).toMatch(/silent/);
    expect(syncReading({ status: "unclear", offset_seconds: 0.02 }).status).toBe("unverified");
    expect(syncReading(null).status).toBe("unverified");
  });
});

describe("the offset a clip is placed by", () => {
  test("is only ever a measured one", () => {
    expect(syncOffsetOf({ sync_status: "measured", sync_offset_seconds: "0.08" })).toBeCloseTo(
      0.08,
      9,
    );
    expect(syncOffsetOf({ sync_status: "unverified", sync_offset_seconds: 0.08 })).toBeNull();
    expect(syncOffsetOf({ sync_status: "measured", sync_offset_seconds: null })).toBeNull();
    expect(syncOffsetOf({ sync_status: "measured", sync_offset_seconds: 3 })).toBeNull();
    expect(syncOffsetOf({})).toBeNull();
  });
});

describe("how a clip's sync reads", () => {
  test("names the offset the Editor corrects, and warns of drift", () => {
    expect(syncSummary({ sync_status: "measured", sync_offset_seconds: 0.004 })?.label).toBe(
      "In sync",
    );
    expect(syncSummary({ sync_status: "measured", sync_offset_seconds: -0.12 })?.detail).toMatch(
      /120 ms early/,
    );
    expect(
      syncSummary({
        sync_status: "measured",
        sync_offset_seconds: 0,
        sync_result: { drift_seconds: 0.09 },
      })?.tone,
    ).toBe("warning");
    expect(syncSummary({ sync_status: "none" })).toBeNull();
    expect(syncSummary({ sync_status: "failed" })?.label).toBe("Sync not measured");
  });
});
