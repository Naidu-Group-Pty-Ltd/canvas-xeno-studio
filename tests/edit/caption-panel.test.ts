import { describe, expect, test } from "bun:test";
import { applyBrandKit, brandKitOf, clearBrand } from "../../src/lib/edit/brand";
import { classicPanelLook, editCaptionPlan } from "../../src/lib/edit/brand-caption-plan";
import { glassOpacity } from "../../src/lib/edit/brand-captions";
import { buildRenderRequest, parseTimeline, type Timeline } from "../../src/lib/edit/timeline";
import {
  backdropWanted,
  captionAreas,
  clipFrameAt,
  lightness,
  paletteCuts,
  sampleTimes,
  // @ts-expect-error The media worker is plain JavaScript.
} from "../../media-worker/src/caption-backdrop.js";
// @ts-expect-error The media worker is plain JavaScript.
import { brandCaptionEvents, roughFaces } from "../../media-worker/src/caption-script.js";
// @ts-expect-error The media worker is plain JavaScript.
import { buildSubtitles, planSequence } from "../../media-worker/src/sequence.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function edit(captions: Record<string, unknown> = {}): Timeline {
  return parseTimeline({
    clips: [
      { id: "c1", assetId: A, kind: "video", duration: 2 },
      {
        id: "c2",
        assetId: B,
        kind: "video",
        duration: 2,
        transition: { type: "fade", duration: 0.5 },
      },
    ],
    captions: {
      enabled: true,
      segments: [
        { start: 0.2, end: 1.4, text: "Over the dark shot" },
        { start: 2, end: 3.4, text: "Over the white page" },
      ],
      ...captions,
    },
  })!;
}

/** The media worker's plan for an edit, as it is sent. */
function planned(timeline: Timeline) {
  const { params, sources } = buildRenderRequest(timeline);
  return planSequence(
    params,
    sources.map((source) => ({ role: source.role })),
  );
}

describe("what is behind captions, chosen", () => {
  test("is the style's own until a panel is chosen, and only then sent", () => {
    const plain = edit();
    expect(plain.captions.panel).toBeNull();
    const captions = buildRenderRequest(plain).params["captions"] as Record<string, unknown>;
    expect("panel" in captions).toBe(false);
    expect("panel_color" in captions).toBe(false);
    const glass = buildRenderRequest(edit({ panel: "dark", panelColor: "#123456" })).params[
      "captions"
    ] as Record<string, unknown>;
    // A colour goes only with a solid panel.
    expect(glass["panel"]).toBe("dark");
    expect("panel_color" in glass).toBe(false);
    const solid = buildRenderRequest(edit({ panel: "solid", panelColor: "#123456" })).params[
      "captions"
    ] as Record<string, unknown>;
    expect(solid).toMatchObject({ panel: "solid", panel_color: "#123456" });
    expect(parseTimeline({ captions: { panel: "glass" } })).toBeNull();
  });

  test("the media worker takes the panel chosen, and turns away one it doesn't know", () => {
    expect(planned(edit({ panel: "auto" })).captions.panel).toBe("auto");
    expect(planned(edit()).captions.panel).toBeNull();
    const params = {
      clips: [{ source_index: 0, duration: 2 }],
      captions: { panel: "glass", segments: [{ start: 0, end: 1, text: "Hello" }] },
    };
    expect(() => planSequence(params, [{ role: "video" }])).toThrow('caption panel "glass"');
  });

  test("a brand kit gives a solid panel its ground colour; clearing the brand takes it away", () => {
    const kit = brandKitOf({ id: "k", name: "Aurixa", background_color: "#0B1020" });
    const branded = applyBrandKit(edit({ panel: "solid" }), kit);
    expect(branded.captions.panelColor).toBe("#0b1020");
    expect(clearBrand(branded).captions.panelColor).toBeNull();
  });
});

describe("measuring the picture behind captions", () => {
  const plan = planned(edit({ panel: "auto" }));

  test("is wanted where the panel follows the picture or is the glass", () => {
    expect(backdropWanted(plan.captions)).toBe(true);
    expect(backdropWanted({ ...plan.captions, panel: "dark" })).toBe(true);
    for (const panel of ["light", "solid", "none", null])
      expect(backdropWanted({ ...plan.captions, panel })).toBe(false);
    // The brand style follows the picture unless something else is chosen.
    expect(backdropWanted({ ...plan.captions, style: "brand", panel: null })).toBe(true);
    expect(backdropWanted(null)).toBe(false);
  });

  test("finds the clip on screen and its frame; a clip fading in counts from the fade's middle", () => {
    // 30 fps: the first clip is frames 0-59; the second fades in over frames 45-59 and runs to 104.
    expect(clipFrameAt(plan, 0.5)).toEqual({ clip: 0, frame: 15 });
    expect(clipFrameAt(plan, 1.6)).toEqual({ clip: 0, frame: 48 });
    expect(clipFrameAt(plan, 1.8)).toEqual({ clip: 1, frame: 9 });
    expect(clipFrameAt(plan, 3.4)).toEqual({ clip: 1, frame: 57 });
  });

  test("samples each line as it arrives, in its middle and as it goes", () => {
    expect(sampleTimes({ start: 2, end: 3.4 }, 30)).toEqual([2.1, 2.7, 3.3]);
    // A short line is sampled within itself.
    expect(sampleTimes({ start: 1, end: 1.1 }, 30)).toEqual([1, 1.05, 1.066667]);
  });

  test("reads a lightness from the lighter part of the area", () => {
    expect(lightness([0, 0, 0, 255])).toBe(1);
    expect(lightness([0, 51, 102, 153, 204, 255, 255, 255])).toBe(1);
    expect(lightness([20, 20, 20, 20])).toBeCloseTo(20 / 255, 9);
    expect(lightness([])).toBeNull();
  });

  test("finds where the picture turns from dark to light at a cut", () => {
    expect(
      paletteCuts(
        plan,
        new Map([
          [0, 0.1],
          [1, 0.95],
        ]),
      ),
    ).toEqual([45 / 30]);
    expect(
      paletteCuts(
        plan,
        new Map([
          [0, 0.7],
          [1, 0.95],
        ]),
      ),
    ).toEqual([]);
    expect(paletteCuts(plan, new Map([[1, 0.95]]))).toEqual([]);
  });

  test("measures over the area each caption's panel covers", () => {
    const areas = captionAreas(plan);
    expect(areas).toHaveLength(2);
    for (const area of areas) {
      expect(area.x0).toBeGreaterThan(0);
      expect(area.x1).toBeLessThan(plan.width);
      // Lower third, in a tall frame: above the bottom quarter.
      expect(area.y1).toBeLessThanOrEqual(plan.height * 0.76 + 20);
      expect(area.y0).toBeGreaterThan(plan.height / 2);
    }
    const brand = { ...plan, captions: { ...plan.captions, style: "brand", faces: roughFaces() } };
    const [first] = captionAreas(brand);
    // Around the line's words and their padding, in the middle of the caption block.
    expect((first.y0 + first.y1) / 2).toBeCloseTo(plan.height * 0.745, 6);
    expect((first.x0 + first.x1) / 2).toBeCloseTo(plan.width / 2, 6);
  });
});

describe("classic captions over a panel", () => {
  const script = (timeline: Timeline, backdrops: (number | null)[] = []) => {
    const plan = planned(timeline);
    plan.captions.backdrop = { backdrops, cuts: [] };
    return buildSubtitles(plan) as string;
  };
  const captionStyle = (text: string) =>
    text.split("\n").find((line) => line.startsWith("Style: Caption,"))!;
  const fields = (style: string) => style.slice("Style: ".length).split(",");

  test("are exactly as they were with no panel chosen", () => {
    const plain = script(edit({ style: "boxed" }));
    expect(fields(captionStyle(plain))[15]).toBe("3");
    expect(plain).toContain(",Caption,,0,0,0,,Over the dark shot");
  });

  test("sit on the glass, each line's box nearer opaque over a lighter picture", () => {
    const text = script(edit({ panel: "dark" }), [0.1, 0.95]);
    const style = fields(captionStyle(text));
    // BorderStyle 3 (a box), padded a quarter of the type, no shadow; the glass's navy.
    expect(style[15]).toBe("3");
    expect(Number(style[16])).toBe(Math.round(Math.round(1080 * 0.058) * 0.25));
    expect(style[17]).toBe("0");
    expect(style[5]).toEndWith("2A170A");
    const lines = text.split("\n").filter((line) => line.startsWith("Dialogue: 0,"));
    const alpha = (opacity: number) =>
      Math.round((1 - opacity) * 255)
        .toString(16)
        .toUpperCase()
        .padStart(2, "0");
    expect(lines[0]).toContain(`\\3c&H2A170A&\\3a&H${alpha(glassOpacity(0.1))}&`);
    expect(lines[1]).toContain(`\\3c&H2A170A&\\3a&H${alpha(glassOpacity(0.95))}&`);
    expect(alpha(glassOpacity(0.1))).toBe("42");
    expect(alpha(glassOpacity(0.95))).toBe("12");
  });

  test("that follow the picture turn to a light card, in dark ink, over a light one", () => {
    const text = script(edit({ panel: "auto" }), [0.1, 0.95]);
    const lines = text.split("\n").filter((line) => line.startsWith("Dialogue: 0,"));
    expect(lines[0]).toContain("\\3c&H2A170A&");
    expect(lines[1]).toContain("\\3c&HFFFFFF&\\3a&H0D&\\1c&H37291F&");
  });

  test("on a solid panel in the brand's colour, or with a boxed style's box taken away", () => {
    const solid = fields(captionStyle(script(edit({ panel: "solid", panelColor: "#0b1020" }))));
    expect(solid[5]).toBe("&H0020100B");
    expect(solid[3]).toBe("&H00FFFFFF");
    const none = fields(captionStyle(script(edit({ style: "boxed", panel: "none" }))));
    expect(none[15]).toBe("1");
  });

  test("the preview draws the same box: the glass where unmeasured, a solid panel, or none", () => {
    expect(classicPanelLook(edit().captions)).toBeNull();
    expect(classicPanelLook(edit({ panel: "dark" }).captions)).toEqual({
      background: "rgba(10, 23, 42, 0.88)",
      color: "#ffffff",
    });
    expect(classicPanelLook(edit({ panel: "solid", panelColor: "#ffffff" }).captions)).toEqual({
      background: "rgba(255, 255, 255, 1)",
      color: "#000000",
    });
    expect(classicPanelLook(edit({ style: "boxed", panel: "none" }).captions)).toEqual({
      background: null,
      color: null,
    });
    expect(classicPanelLook(edit({ style: "clean", panel: "none" }).captions)).toBeNull();
  });
});

describe("brand captions over a panel", () => {
  const brand = (captions: Record<string, unknown>) =>
    planned(edit({ style: "brand", accent: "#c89b3c", ...captions }));
  const panels = (events: string[]) =>
    events.filter((line) => line.includes("\\p1") && line.includes("\\1c&H2A170A&"));

  test("the glass is nearer opaque over the white page than over the dark shot", () => {
    const plan = brand({ panel: "dark" });
    const dark = brandCaptionEvents(plan, roughFaces(), { backdrops: [0.1, 0.1] }).events;
    const white = brandCaptionEvents(plan, roughFaces(), { backdrops: [0.95, 0.95] }).events;
    // Held once in: 74% over the dark shot, 93% over the white page.
    expect(panels(dark).some((line) => line.includes("\\alpha&H42&"))).toBe(true);
    expect(panels(white).some((line) => line.includes("\\alpha&H12&"))).toBe(true);
  });

  test("a panel following the picture is the light card over a light one, the glass over a dark one", () => {
    const plan = brand({});
    const { plan: drawn } = brandCaptionEvents(plan, roughFaces(), {
      backdrops: [0.1, 0.95],
      cuts: [45 / 30],
    });
    // Two runs, cut where the picture turns light; each its own material.
    expect(drawn.cues.map((cue: { first: number }) => cue.first)).toEqual([0, 1]);
    expect(drawn.cues[0].look.kind).toBe("dark");
    expect(drawn.cues[1].look).toMatchObject({ kind: "light", ink: "#1f2937" });
  });

  test("the preview plans the same panel from what it knows of the picture", () => {
    const timeline = edit({ style: "brand", panel: "solid", panelColor: "#0b1020" });
    const faces = (em: number) => ({
      ascent: 0.9,
      descent: 0.25,
      measure: (text: string) => text.length * em * 0.5,
    });
    const plan = editCaptionPlan(timeline, { width: 1080, height: 1920 }, faces);
    expect(plan.cues[0]!.look).toMatchObject({ kind: "solid", fill: "#0b1020", ink: "#ffffff" });
    const following = editCaptionPlan(
      edit({ style: "brand" }),
      { width: 1080, height: 1920 },
      faces,
      {
        backdrops: [0.95, 0.95],
      },
    );
    expect(following.cues[0]!.look.kind).toBe("light");
  });
});
