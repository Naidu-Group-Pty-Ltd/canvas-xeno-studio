import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { durationChoices } from "../../src/lib/long-video/plan";
import type { ModelRegistryEntry } from "../../src/lib/model-schema";
import {
  drivingAudioSlot,
  LIP_SYNC,
  lipSyncCapable,
  longestSegmentFor,
  requestSecondsFor,
} from "../../src/lib/lip-sync/models";

// The real catalogue rows (scripts/higgsfield/registry.json), as the app reads them.
const registry = JSON.parse(
  readFileSync(join(import.meta.dir, "../../scripts/higgsfield/registry.json"), "utf8"),
) as ModelRegistryEntry[];
const byPath = (path: string) => registry.find((row) => row.model_path === path)!;

describe("driving audio", () => {
  test("is Wan 2.6 and 2.7's image and text to video, and nothing else in the catalogue", () => {
    const capable = registry
      .filter((row) => lipSyncCapable(row))
      .map((row) => row.model_path)
      .sort();
    expect(capable).toEqual([
      "wan/v2.6/image-to-video",
      "wan/v2.6/text-to-video",
      "wan/v2.7/image-to-video",
      "wan/v2.7/text-to-video",
    ]);
  });

  test("goes in the model's audio_url", () => {
    const slot = drivingAudioSlot(byPath("wan/v2.7/image-to-video"));
    expect(slot?.param).toBe("audio_url");
    expect(slot?.role).toBe("audio");
  });

  test("reference audio isn't driving audio, even as a single file", () => {
    expect(drivingAudioSlot(byPath("xai/grok-imagine-video/v1.5/reference-to-video"))).toBeNull();
    expect(drivingAudioSlot(byPath("bytedance/seedance-2.0/reference-to-video"))).toBeNull();
  });

  test("a registry row can say its audio drives the picture", () => {
    const row = byPath("xai/grok-imagine-video/v1.5/reference-to-video");
    const declared = { ...row, capabilities: { ...row.capabilities, drivingAudio: true } };
    expect(drivingAudioSlot(declared)?.param).toBe("audio_url");
  });
});

describe("clip lengths for a piece of voiceover", () => {
  const wan27 = durationChoices(byPath("wan/v2.7/image-to-video"));
  const wan26 = durationChoices(byPath("wan/v2.6/image-to-video"));

  test("are the shortest the model makes that hold the piece and its headroom", () => {
    expect(wan27[0]).toBe(2);
    expect(requestSecondsFor(wan27, 7.4)).toBe(8);
    expect(requestSecondsFor(wan27, 7.75)).toBe(8);
    expect(requestSecondsFor(wan27, 7.76)).toBe(9);
    expect(requestSecondsFor(wan27, 0.6)).toBe(2);
    expect(requestSecondsFor(wan26, 4.7)).toBe(5);
    expect(requestSecondsFor(wan26, 4.8)).toBe(10);
  });

  test("run out past the longest clip", () => {
    expect(requestSecondsFor(wan27, 14.75)).toBe(15);
    expect(requestSecondsFor(wan27, 14.8)).toBeNull();
    expect(longestSegmentFor(wan27)).toBeCloseTo(15 - LIP_SYNC.headroomSeconds, 9);
    expect(longestSegmentFor(wan27, 10)).toBeCloseTo(10 - LIP_SYNC.headroomSeconds, 9);
    expect(longestSegmentFor(wan26, 12)).toBeCloseTo(10 - LIP_SYNC.headroomSeconds, 9);
  });
});
