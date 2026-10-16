import { describe, expect, test } from "bun:test";
import { compileFromLongVideo, type LongVideoClipCut } from "../../src/lib/edit/compile";
import { joinSummary, readJoinReport } from "../../src/lib/edit/join-report";
import {
  buildRenderRequest,
  canBlendJoin,
  joinCounts,
  joinFields,
  joinModeOf,
  parseTimeline,
  splitClipAt,
  withAllJoins,
  type Timeline,
} from "../../src/lib/edit/timeline";

const ID = (letter: string) => `${letter.repeat(8)}-1111-4111-8111-111111111111`;

function edit(clips: Record<string, unknown>[]): Timeline {
  const timeline = parseTimeline({ clips });
  if (!timeline) throw new Error("timeline didn't parse");
  return timeline;
}

const longVideo = () =>
  edit([
    { id: "c1", assetId: ID("a"), kind: "video", duration: 5 },
    {
      id: "c2",
      assetId: ID("b"),
      kind: "video",
      duration: 5,
      trimStart: 0.04,
      matchPrevious: true,
    },
    { id: "c3", assetId: ID("c"), kind: "image", duration: 3 },
    { id: "c4", assetId: ID("d"), kind: "video", duration: 5 },
  ]);

type ClipParam = { join?: string; match_previous?: boolean };

describe("smart blend in the edit", () => {
  test("an edit saved before smart blends keeps its colour joins", () => {
    const timeline = longVideo();
    expect(timeline.clips[1]!.smartBlend).toBe(false);
    expect(joinModeOf(timeline.clips[1]!)).toBe("colour");
    expect(joinModeOf(timeline.clips[0]!)).toBe("plain");
  });

  test("only a join between two video clips can be blended", () => {
    const timeline = longVideo();
    expect([0, 1, 2, 3].map((index) => canBlendJoin(timeline, index))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(joinCounts(timeline)).toEqual({ joins: 1, smart: 0 });
  });

  test("every join can be smart-blended at once, and set back", () => {
    const timeline = edit([
      { id: "c1", assetId: ID("a"), kind: "video", duration: 5 },
      { id: "c2", assetId: ID("b"), kind: "video", duration: 5 },
      { id: "c3", assetId: ID("c"), kind: "video", duration: 5 },
    ]);
    const smart = withAllJoins(timeline, "smart");
    expect(smart.clips.map(joinModeOf)).toEqual(["plain", "smart", "smart"]);
    expect(joinCounts(smart)).toEqual({ joins: 2, smart: 2 });
    // The first clip is never changed: it joins nothing.
    expect(smart.clips[0]).toEqual(timeline.clips[0]!);
    expect(withAllJoins(smart, "plain").clips.map(joinModeOf)).toEqual(["plain", "plain", "plain"]);
  });

  test("a smart join is sent as a colour join too, for a media service without smart joins", () => {
    const timeline = longVideo();
    const smart = {
      ...timeline,
      clips: timeline.clips.map((clip, index) =>
        index === 1 ? { ...clip, ...joinFields("smart") } : clip,
      ),
    };
    const clips = buildRenderRequest(smart).params.clips as ClipParam[];
    expect(clips[1]).toMatchObject({ join: "smart", match_previous: true });
    expect(clips[0]!.join).toBeUndefined();
    const colour = buildRenderRequest(timeline).params.clips as ClipParam[];
    expect(colour[1]!.match_previous).toBe(true);
    expect(colour[1]!.join).toBeUndefined();
    const plain = buildRenderRequest(withAllJoins(timeline, "plain")).params.clips as ClipParam[];
    expect(plain[1]!.match_previous).toBeUndefined();
  });

  test("a clip split in two carries on unbroken, with nothing to blend", () => {
    const timeline = withAllJoins(longVideo(), "smart");
    const split = splitClipAt(timeline, 7);
    expect(split.clips).toHaveLength(5);
    expect(joinModeOf(split.clips[1]!)).toBe("smart");
    expect(joinModeOf(split.clips[2]!)).toBe("plain");
  });
});

describe("a long video opened in the Editor", () => {
  const ids = ["a", "b", "c"].map(ID);
  const clips: LongVideoClipCut[] = ids.map((id, position) => ({
    position,
    assetId: id,
    cutSeconds: 5,
    lengthSeconds: 5,
    fps: 24,
    width: 720,
    height: 1280,
    handsOffLastFrame: true,
  }));
  const assets = ids.map((id) => ({ id, durationSeconds: 5, width: 720, height: 1280 }));
  const open = (seam: "smart" | "cut" | "blend") =>
    compileFromLongVideo({ title: "Launch", settings: { aspect_ratio: "9:16" } }, clips, assets, {
      seam,
      keepSound: true,
    }).timeline.clips;

  test("is smart-blended at every join, skipping each clip's copy of the frame before", () => {
    const result = open("smart");
    expect(result.map(joinModeOf)).toEqual(["plain", "smart", "smart"]);
    expect(result[1]!.trimStart).toBeCloseTo(1 / 24, 6);
    expect(result[1]!.transition.type).toBe("cut");
  });

  test("asked for a dissolve, is smart-blended under it", () => {
    const result = open("blend");
    expect(result.map(joinModeOf)).toEqual(["plain", "smart", "smart"]);
    expect(result[1]!.transition.type).toBe("fade");
  });

  test("asked for a plain cut, has its colour matched only", () => {
    expect(open("cut").map(joinModeOf)).toEqual(["plain", "colour", "colour"]);
  });
});

describe("the render's report on its joins", () => {
  const metadata = {
    probe: {
      smart_joins: [
        {
          clip: 1,
          matched: true,
          framing: { scale_x: 0.9686, scale_y: 0.9881, moved: 0.0325 },
          colour: { likeness: 0.999, largest_shift: 4 },
          detail: null,
        },
        {
          clip: 2,
          matched: true,
          framing: { moved: 0.0329 },
          colour: { likeness: 0.999, largest_shift: 4 },
          detail: { amount: 0.39, ratio: 0.65 },
        },
        { clip: 3, matched: false, left: "different_pictures", framing: null },
      ],
    },
  };

  test("is read from the rendered video's record", () => {
    const report = readJoinReport(metadata)!;
    expect(report).toMatchObject({ joins: 3, matched: 2, colour: 2, detail: 1 });
    expect(report.largestMove).toBeCloseTo(0.0329, 6);
    expect(report.left).toEqual([{ clip: 3, reason: "different_pictures" }]);
  });

  test("says what was put right and what was left", () => {
    expect(joinSummary(readJoinReport(metadata)!)).toBe(
      "2 of 3 joins smart-blended: framing (re-renders out by up to 3.3%), colour, detail · 1 left as it was (the clips don't show the same picture there)",
    );
  });

  test("is absent from a render without smart joins", () => {
    expect(readJoinReport({ probe: { seams_matched: [] } })).toBeNull();
    expect(readJoinReport(null)).toBeNull();
    expect(readJoinReport({ probe: { smart_joins: "nope" } })).toBeNull();
  });
});
