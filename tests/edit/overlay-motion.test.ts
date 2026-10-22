import { describe, expect, test } from "bun:test";
import {
  buildSubtitles,
  cubicBezierAt as workerBezierAt,
  overlayMotionState as workerState,
  planSequence,
} from "../../media-worker/src/sequence.js";
import { cubicBezierAt } from "../../src/lib/brand/motion";
import { EMPTY_PRODUCTION, motionByHand, withRole } from "../../src/lib/brand/production";
import { applyBrandKit, brandKitOf, clearBrand } from "../../src/lib/edit/brand";
import {
  kitOverlayMotion,
  overlayMotionState,
  STUDIO_FADE_SECONDS,
} from "../../src/lib/edit/overlay-motion";
import {
  buildRenderRequest,
  parseTimeline,
  type OverlayMotion,
  type Timeline,
} from "../../src/lib/edit/timeline";

const clip = {
  id: "c1",
  assetId: "11111111-1111-4111-8111-111111111111",
  kind: "video",
  duration: 6,
};

/** Reel 1's motion, as its code declares it: the products' emphasized ease, ease-out, and the slow step. */
const reelProduction = (() => {
  let production = withRole(
    EMPTY_PRODUCTION,
    "move",
    motionByHand("cubic-bezier(0.2, 0, 0, 1)", null),
  );
  production = withRole(production, "settle", motionByHand("cubic-bezier(0.22, 1, 0.36, 1)", null));
  production = withRole(production, "enter", motionByHand("cubic-bezier(0.22, 1, 0.36, 1)", 320));
  production = withRole(production, "exit", motionByHand("cubic-bezier(0.2, 0, 0, 1)", 220));
  return withRole(production, "press", motionByHand(null, 320));
})();

const reelMotion: OverlayMotion = {
  enter: 0.32,
  exit: 0.22,
  enterEase: [0.22, 1, 0.36, 1],
  exitEase: [0.2, 0, 0, 1],
  rise: 0.3,
};

function edit(overlays: Record<string, unknown>[]): Timeline {
  return parseTimeline({ fps: 30, clips: [clip], overlays })!;
}

describe("a title's motion in the edit", () => {
  test("an edit saved before title motion reads and renders as it did", () => {
    const timeline = edit([{ id: "o1", text: "Hello", start: 0, end: 2 }]);
    expect(timeline.overlays[0]!.motion).toBeUndefined();
    const sent = buildRenderRequest(timeline).params["overlays"] as Record<string, unknown>[];
    expect(sent[0]).not.toHaveProperty("motion");
  });

  test("a title's motion is sent only when it has one, as the media worker takes it", () => {
    const timeline = edit([
      { id: "o1", text: "Aurixa", start: 0, end: 2, motion: reelMotion },
      { id: "o2", text: "Plain", start: 2, end: 4, motion: null },
    ]);
    const sent = buildRenderRequest(timeline).params["overlays"] as Record<string, unknown>[];
    expect(sent[0]!["motion"]).toEqual({
      enter: 0.32,
      exit: 0.22,
      enter_ease: [0.22, 1, 0.36, 1],
      exit_ease: [0.2, 0, 0, 1],
      rise: 0.3,
    });
    expect(sent[1]).not.toHaveProperty("motion");
  });

  test("a motion that isn't one isn't taken", () => {
    const bad = (motion: unknown) =>
      parseTimeline({
        clips: [clip],
        overlays: [{ id: "o1", text: "x", start: 0, end: 1, motion }],
      });
    expect(bad({ ...reelMotion, enterEase: [0.2, 0, 1] })).toBeNull();
    expect(bad({ ...reelMotion, exitEase: [1.4, 0, 0, 1] })).toBeNull();
    expect(bad({ ...reelMotion, enter: 5 })).toBeNull();
    // Its rise has a default.
    const { rise: _rise, ...without } = reelMotion;
    expect(bad(without)!.overlays[0]!.motion?.rise).toBe(0.3);
  });
});

describe("motion from a brand kit", () => {
  test("a kit's enter and exit roles become its titles' motion", () => {
    expect(kitOverlayMotion(reelProduction)).toEqual(reelMotion);
  });

  test("one duration stands in for the other; curves come from settle and move when not named", () => {
    let production = withRole(EMPTY_PRODUCTION, "settle", motionByHand("ease-out", null));
    production = withRole(production, "move", motionByHand("cubic-bezier(0.2, 0, 0, 1)", null));
    production = withRole(production, "enter", motionByHand(null, 320));
    expect(kitOverlayMotion(production)).toEqual({
      enter: 0.32,
      exit: 0.32,
      enterEase: [0, 0, 0.58, 1],
      exitEase: [0.2, 0, 0, 1],
      rise: 0.3,
    });
    // Curves and no durations: the studio's quarter second, on the brand's curves.
    const curvesOnly = withRole(EMPTY_PRODUCTION, "settle", motionByHand("ease-out", null));
    expect(kitOverlayMotion(curvesOnly)).toMatchObject({ enter: 0.25, exit: 0.25 });
  });

  test("a kit that says nothing about how things move leaves titles to the studio's fade", () => {
    expect(kitOverlayMotion(EMPTY_PRODUCTION)).toBeNull();
    expect(
      kitOverlayMotion(withRole(EMPTY_PRODUCTION, "press", motionByHand(null, 320))),
    ).toBeNull();
  });

  test("applying a kit gives its titles its motion; clearing the brand takes it away", () => {
    const kit = brandKitOf({ id: "k1", name: "Aurixa Systems", production: reelProduction });
    const timeline = edit([
      { id: "t1", text: "Aurixa", start: 0, end: 2, style: "title" },
      { id: "x1", text: "Start", start: 2, end: 4, style: "cta" },
    ]);
    const branded = applyBrandKit(timeline, kit);
    expect(branded.overlays.map((overlay) => overlay.motion)).toEqual([reelMotion, reelMotion]);
    expect(clearBrand(branded).overlays.map((overlay) => overlay.motion)).toEqual([null, null]);
    // A kit without motion leaves the studio's fade.
    const plain = brandKitOf({ id: "k2", name: "Plain" });
    expect(applyBrandKit(branded, plain).overlays[0]!.motion).toBeNull();
  });
});

describe("where a title is, frame by frame", () => {
  const title = { start: 1, end: 3, motion: reelMotion };

  test("without motion it fades over a quarter of a second, as \\fad(250,250) does", () => {
    const plain = { start: 1, end: 3 };
    expect(overlayMotionState(plain, 0.99)).toEqual({ opacity: 0, offset: 0 });
    expect(overlayMotionState(plain, 1)).toEqual({ opacity: 0, offset: 0 });
    expect(overlayMotionState(plain, 1 + STUDIO_FADE_SECONDS / 2).opacity).toBeCloseTo(0.5, 6);
    expect(overlayMotionState(plain, 2)).toEqual({ opacity: 1, offset: 0 });
    expect(overlayMotionState(plain, 3 - STUDIO_FADE_SECONDS / 2).opacity).toBeCloseTo(0.5, 6);
    expect(overlayMotionState(plain, 3)).toEqual({ opacity: 0, offset: 0 });
  });

  test("it rises into place on its enter curve, holds, and lifts away on its exit curve", () => {
    expect(overlayMotionState(title, 1)).toEqual({ opacity: 0, offset: 0.3 });
    const early = overlayMotionState(title, 1 + 0.32 * 0.25);
    expect(early.opacity).toBeCloseTo(cubicBezierAt([0.22, 1, 0.36, 1], 0.25), 9);
    expect(early.offset).toBeCloseTo((1 - early.opacity) * 0.3, 9);
    // Ease-settle is nearly there by half its time: most of the rise is done early.
    expect(overlayMotionState(title, 1.16).opacity).toBeGreaterThan(0.9);
    expect(overlayMotionState(title, 2)).toEqual({ opacity: 1, offset: 0 });
    const going = overlayMotionState(title, 3 - 0.11);
    expect(going.opacity).toBeCloseTo(1 - cubicBezierAt([0.2, 0, 0, 1], 0.5), 9);
    expect(going.offset).toBeLessThan(0);
    expect(overlayMotionState(title, 3)).toEqual({ opacity: 0, offset: 0 });
  });

  test("a title too short for its motion takes at most half its time each way", () => {
    const brief = { start: 0, end: 0.4, motion: reelMotion };
    // Coming in over 0.2 s (not 0.32), then going over 0.2 s from its middle.
    expect(overlayMotionState(brief, 0.1).opacity).toBeCloseTo(
      cubicBezierAt([0.22, 1, 0.36, 1], 0.5),
      9,
    );
    expect(overlayMotionState(brief, 0.2)).toEqual({ opacity: 1, offset: 0 });
    expect(overlayMotionState(brief, 0.3).opacity).toBeCloseTo(
      1 - cubicBezierAt([0.2, 0, 0, 1], 0.5),
      9,
    );
  });

  test("the media worker places a title exactly where the preview does, on every frame", () => {
    for (const ease of [
      [0.22, 1, 0.36, 1],
      [0.2, 0, 0, 1],
      [0.34, 1.56, 0.64, 1],
      [0, 0, 1, 1],
    ] as const)
      for (let x = -0.1; x <= 1.1; x += 0.01)
        expect(workerBezierAt([...ease], x)).toBe(cubicBezierAt(ease, x));
    for (let frame = 0; frame <= 120; frame += 1) {
      const time = frame / 30;
      expect(workerState(title, time)).toEqual(overlayMotionState(title, time));
    }
  });
});

describe("the ASS the media worker writes for a moving title", () => {
  const sources = [{ role: "video" }];
  const plan = (overlays: Record<string, unknown>[]) =>
    planSequence(
      { width: 1080, height: 1920, fps: 30, clips: [{ source_index: 0, duration: 4 }], overlays },
      sources,
    );
  const motion = {
    enter: 0.32,
    exit: 0.22,
    enter_ease: [0.22, 1, 0.36, 1],
    exit_ease: [0.2, 0, 0, 1],
    rise: 0.3,
  };
  const dialogues = (script: string) =>
    script.split("\n").filter((line) => line.startsWith("Dialogue: 1,"));
  const seconds = (stamp: string) => {
    const [hours, minutes, rest] = stamp.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
  };

  test("one step a frame coming in and going, one holding still, tiling its time", () => {
    const script = buildSubtitles(
      plan([
        { start: 1, end: 3, text: "AURIXA", style: "title", y: 0.42, backing: "halo", motion },
      ]),
    )!;
    const lines = dialogues(script);
    // 0.32 s at 30 fps is 10 frames in (1.000 to 1.300); 0.22 s is the 6 frames from 2.800 to 2.967.
    expect(lines).toHaveLength(10 + 1 + 6);
    const times = lines.map((line) => line.split(",").slice(1, 3).map(seconds) as [number, number]);
    expect(times[0]![0]).toBe(1);
    expect(times.at(-1)![1]).toBe(3);
    for (let index = 1; index < times.length; index += 1)
      expect(times[index]![0]).toBe(times[index - 1]![1]);
    // Every step is about a frame long (the last runs on to the title's end, at most a frame and
    // a half, in centiseconds); the one between holds the title still.
    times.forEach(([from, to], index) => {
      if (index === 10) expect(to - from).toBeCloseTo(2.783 - 1.317, 1);
      else expect(to - from).toBeLessThan(1.5 / 30 + 0.006);
    });
  });

  test("it rises into place and fades in, holds where a still title sits, and lifts as it fades out", () => {
    const script = buildSubtitles(
      plan([{ start: 1, end: 3, text: "AURIXA", style: "title", y: 0.42, motion }]),
    )!;
    const lines = dialogues(script);
    const y = (line: string) => Number(/\\pos\(540,(\d+)\)/.exec(line)?.[1]);
    const alpha = (line: string) => Number(/\\fade\((\d+),/.exec(line)?.[1] ?? 0);
    const size = Math.round(1080 * 0.09);
    const still = Math.round(1920 * 0.42);
    // Its first frame is unseen, a rise below its place.
    expect(alpha(lines[0]!)).toBe(255);
    expect(y(lines[0]!)).toBe(Math.round(still + 0.3 * size));
    for (let index = 1; index < 10; index += 1) {
      expect(y(lines[index]!)).toBeLessThanOrEqual(y(lines[index - 1]!));
      expect(alpha(lines[index]!)).toBeLessThanOrEqual(alpha(lines[index - 1]!));
    }
    // Holding still: where a title without motion sits, fully seen, nothing changing.
    expect(lines[10]).toContain(`{\\an5\\pos(540,${still})}AURIXA`);
    for (let index = 12; index < lines.length; index += 1) {
      expect(y(lines[index]!)).toBeLessThanOrEqual(y(lines[index - 1]!));
      expect(alpha(lines[index]!)).toBeGreaterThanOrEqual(alpha(lines[index - 1]!));
    }
    expect(y(lines.at(-1)!)).toBeLessThan(still);
  });

  test("its halo and a brand's look go with every step; a title without motion keeps its fade", () => {
    const script = buildSubtitles(
      plan([
        {
          start: 0.5,
          end: 2,
          text: "Brand",
          style: "subtitle",
          position: "bottom",
          backing: "halo",
          color: "#00ff00",
          motion,
        },
        { start: 2, end: 3.5, text: "Plain", style: "title", position: "top" },
      ]),
    )!;
    const lines = dialogues(script);
    const moving = lines.filter((line) => line.endsWith("}Brand"));
    expect(
      moving.every((line) => line.includes("\\3a&H70&") && line.includes("\\1c&H00FF00&")),
    ).toBe(true);
    // From the bottom: anchored there, as its alignment and margin put it.
    expect(moving.every((line) => line.includes("\\an2\\pos(540,"))).toBe(true);
    const marginV = Math.round(1920 * 0.3);
    expect(moving.some((line) => line.includes(`\\an2\\pos(540,${1920 - marginV})`))).toBe(true);
    expect(lines.filter((line) => line.endsWith("}Plain"))).toEqual([
      `Dialogue: 1,0:00:02.00,0:00:03.50,Title,,0,0,${Math.round(1920 * 0.16)},,{\\an8\\fad(250,250)}Plain`,
    ]);
  });

  test("the worker refuses a motion that isn't one", () => {
    const refused = (value: unknown) => () =>
      plan([{ start: 0, end: 2, text: "x", motion: value }]);
    expect(refused({ ...motion, enter_ease: [0.2, 0, 1] })).toThrow("four numbers");
    expect(refused({ ...motion, exit_ease: [1.5, 0, 0, 1] })).toThrow("between 0 and 1");
    expect(refused({ ...motion, enter: 9 })).toThrow("between 0 and 2");
    expect(refused("fast")).toThrow("must be an object");
  });
});
