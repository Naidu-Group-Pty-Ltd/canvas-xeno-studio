import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as app from "../../src/lib/edit/brand-captions";
import { editCaptionPlan } from "../../src/lib/edit/brand-caption-plan";
import { phraseCaptions } from "../../src/lib/edit/captions";
import { fontMetrics } from "../../src/lib/edit/font-family";
import {
  buildRenderRequest,
  frameSize,
  parseTimeline,
  usedFonts,
} from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import * as worker from "../../media-worker/src/brand-captions.js";
// @ts-expect-error The media worker is plain JavaScript.
import { brandCaptionEvents, brandCaptionPlan } from "../../media-worker/src/caption-script.js";
// @ts-expect-error The media worker is plain JavaScript.
import { fontMetrics as workerMetrics } from "../../media-worker/src/fonts.js";
// @ts-expect-error The media worker is plain JavaScript.
import { planSequence } from "../../media-worker/src/sequence.js";
import { buildFont } from "./font-fixture";

/** Reel 1's captions as its own renderer scheduled them (see the fixture's "source"). */
const REEL = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures/reel1-captions.json"), "utf8"),
) as {
  palette_cuts: number[];
  cues: {
    text: string;
    start: number;
    end: number;
    palette: string;
    emphasis: [number, number] | null;
    words: { text: string; at: number; until: number | null }[];
    leave: number;
    gone: number;
    appear: number | null;
    cut: number | null;
    first: number;
    panel_gone: number | null;
  }[];
};

/** Reel 1's lines as the brand style takes them: each word's time from its line's start. */
function reelLines(): app.BrandLine[] {
  return REEL.cues.map((cue) => ({
    start: cue.start,
    end: cue.end,
    text: cue.text,
    words: cue.words.map((word) => ({
      text: word.text,
      start: word.at - cue.start,
      end: (word.until ?? word.at) - cue.start,
    })),
    emphasis: cue.emphasis,
  }));
}

/** A serif of sorts: every printable character a width of its own, the italic a little narrower. */
const printable = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));
const advances = (scale: number) =>
  Object.fromEntries(
    printable.map((char) => [
      char,
      char === " " ? 250 : Math.round((380 + (char.charCodeAt(0) % 9) * 35) * scale),
    ]),
  );
const REGULAR = buildFont({
  family: "Fixture Serif",
  winAscent: 900,
  winDescent: 300,
  advances: advances(1),
});
const ITALIC = buildFont({
  family: "Fixture Serif",
  italic: true,
  winAscent: 880,
  winDescent: 320,
  advances: advances(0.94),
});

/** How a plan measures text in the fixture fonts. */
function layoutFaces(em: number): app.LayoutFaces {
  const regular = fontMetrics(REGULAR)!;
  const italic = fontMetrics(ITALIC)!;
  return {
    ascent: regular.ascent / regular.unitsPerEm,
    descent: regular.descent / regular.unitsPerEm,
    measure(text: string, slanted: boolean) {
      const face = slanted ? italic : regular;
      let units = 0;
      for (const char of text) units += face.advance(char.codePointAt(0)!);
      return (units * em) / face.unitsPerEm;
    },
  };
}

const FRAME = { width: 1080, height: 1920 };

describe("when brand caption lines come and go", () => {
  test("Reel 1's 45 lines are scheduled exactly as its own renderer scheduled them", () => {
    for (const lib of [app, worker] as (typeof app)[]) {
      const cues = REEL.cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        emphasis: cue.emphasis,
        words: cue.words.map((word) => ({
          text: word.text,
          at: word.at,
          until: word.until ?? word.at,
        })),
      }));
      const out = lib.scheduleCues(cues, REEL.palette_cuts);
      out.forEach((cue, index) => {
        const reference = REEL.cues[index]!;
        expect(cue.leave).toBeCloseTo(reference.leave, 6);
        expect(cue.gone).toBeCloseTo(reference.gone, 6);
        if (reference.appear === null) expect(cue.appear).toBeNull();
        else expect(cue.appear!).toBeCloseTo(reference.appear, 6);
        expect(cue.cut).toBe(reference.cut);
        expect(cue.first).toBe(reference.first);
        if (reference.panel_gone !== null)
          expect(cue.panelGone!).toBeCloseTo(reference.panel_gone, 6);
      });
      // Four runs: the opening, the brand's arrival, 09.1's return to today's tools, and on.
      expect(new Set(out.map((cue) => cue.first)).size).toBe(4);
    }
  });

  const line = (start: number, end: number, ...ats: number[]) =>
    app.timedCue({
      start,
      end,
      words: ats.map((at, index) => ({
        text: `w${index}`,
        start: at - start,
        end: at - start + 0.2,
      })),
    });

  test("a pause longer than 0.8 s ends a run of lines, and its panel with it", () => {
    const close = app.scheduleCues([line(0, 1.5, 0, 0.5, 1), line(2.2, 3.5, 2.2, 2.8)]);
    expect(close[0]!.next).toBe(1);
    expect(close[1]!.first).toBe(0);
    // The run's panel goes after its last line has left.
    expect(close[0]!.panelGone).toBeCloseTo(close[1]!.gone + 0.12, 9);
    const apart = app.scheduleCues([line(0, 1.5, 0, 0.5, 1), line(2.4, 3.5, 2.4, 2.8)]);
    expect(apart[0]!.next).toBeNull();
    expect(apart[1]!.first).toBe(1);
    // Alone, a line leaves 0.15 s after its time and is gone 0.22 s later.
    expect(apart[0]!.leave).toBeCloseTo(1.65, 9);
    expect(apart[0]!.gone).toBeCloseTo(1.87, 9);
    expect(apart[0]!.panelGone).toBeCloseTo(1.99, 9);
  });

  test("a word rises into focus over 0.42 s from just before it is spoken; a line leaves over 0.22 s", () => {
    const [cue] = app.scheduleCues([line(1, 3, 1, 1.6)]);
    const word = (t: number) => app.wordState(cue!, 1, t);
    // In from 0.07 s before it is spoken: clear before, fully in by 0.6 of its rise.
    expect(word(1.52)!.opacity).toBe(0);
    expect(word(1.53 + 0.42 * 0.6)!.opacity).toBeCloseTo(1, 9);
    // A third of an em below its place, out of a blur of 0.15 em, settling to nothing.
    expect(word(1.53)!.rise).toBeCloseTo(1 / 3, 9);
    expect(word(1.53)!.blur).toBeCloseTo(0.15, 9);
    expect(word(1.53 + 0.42)!.rise).toBe(0);
    expect(word(1.53 + 0.42)!.blur).toBe(0);
    // Leaving: from 0.15 s after the line's time, gone 0.22 s later, drifting up a sixth of an em.
    expect(cue!.leave).toBeCloseTo(3.15, 9);
    expect(word(3.15)!.opacity).toBe(1);
    expect(word(3.15 + 0.22 - 1e-6)!.opacity).toBeCloseTo(0, 4);
    expect(word(3.15 + 0.22 - 1e-6)!.rise).toBeCloseTo(-1 / 6, 4);
    expect(word(3.37)).toBeNull();
  });

  test("where the speech runs straight on, a line leaves quickly and the next waits for it", () => {
    // Its last word, at 0.9 s, would still be up when the next line starts at 1.1 s.
    const [first, second] = app.scheduleCues([line(0, 1.1, 0, 0.9), line(1.1, 2.5, 1.12, 1.6)]);
    // So it is up 0.2 s from coming in, then the line leaves in 0.12 s; the next line's words wait.
    expect(first!.leave).toBeCloseTo(Math.max(0.83 + 0.2, 1.1 - 0.12), 9);
    expect(first!.gone).toBeCloseTo(first!.leave + 0.12, 9);
    expect(second!.appear).toBeCloseTo(Math.max(1.1, first!.gone), 9);
    expect(app.wordState(second!, 0, first!.gone - 0.01)!.opacity).toBe(0);
  });

  test("no run is carried across a cut where the picture's palette changes", () => {
    const cues = [line(0, 1.5, 0, 0.5, 1), line(1.8, 3, 1.8, 2.3)];
    const [before, after] = app.scheduleCues(cues, [1.7]);
    // The line before leaves, and its panel goes, by the cut; the next starts a run of its own.
    expect(before!.cut).toBe(1.7);
    expect(before!.gone).toBeLessThanOrEqual(1.7 - 0.02 + 1e-9);
    expect(before!.panelGone).toBeCloseTo(1.7, 9);
    expect(after!.first).toBe(1);
    // A line still being spoken at the cut keeps its run rather than be cut short.
    const kept = app.scheduleCues([line(0, 1.65, 0, 0.5, 1.6), line(1.8, 3, 1.8)], [1.7]);
    expect(kept[0]!.cut).toBeNull();
    expect(kept[1]!.first).toBe(0);
  });
});

describe("where brand caption words go", () => {
  const geometry = app.captionGeometry(FRAME, { position: "lower_third", size: 1 });
  const faces = layoutFaces(geometry.em);

  test("the type is Reel 1's size on a 1080-wide frame, and sits in the lower third", () => {
    expect(geometry.em).toBeCloseTo(60, 0);
    expect(geometry.pitch).toBeCloseTo(60 * 1.16, 0);
    expect(geometry.maxWidth).toBeCloseTo(864, 6);
    expect(geometry.centreY).toBeCloseTo(1920 * 0.745, 6);
    const wide = app.captionGeometry({ width: 1920, height: 1080 }, { position: "bottom" });
    expect(wide.maxWidth).toBeCloseTo(wide.em * 16, 6);
  });

  test("a line breaks into as few lines as fit, evenly, never inside its emphasis", () => {
    const cue = app.timedCue({
      start: 0,
      end: 3,
      text: "a property opportunity has just appeared.",
    });
    const plain = app.layoutCue(cue, geometry, faces);
    expect(plain.lines).toHaveLength(2);
    for (const each of plain.lines) expect(each.width).toBeLessThanOrEqual(geometry.maxWidth);
    // Even: no other two-line split has a narrower widest line.
    const words = cue.words.map((word) => word.text);
    const width = (from: number, to: number) =>
      faces.measure(words.slice(from, to).join(" "), false);
    const widest = Math.max(...plain.lines.map((each) => each.width));
    for (let at = 1; at < words.length; at += 1)
      expect(Math.max(width(0, at), width(at, words.length))).toBeGreaterThanOrEqual(widest - 1e-6);
    // Each line centred, its words a space apart, the baselines a line apart.
    const [top, bottom] = plain.lines;
    expect(bottom!.baseline - top!.baseline).toBeCloseTo(geometry.pitch, 9);
    const first = plain.words[top!.from]!;
    expect(first.x).toBeCloseTo(geometry.centreX - top!.width / 2, 9);
    const next = plain.words[top!.from + 1]!;
    expect(next.x).toBeCloseTo(first.x + first.width + faces.measure(" ", false), 9);
    // With "has just" as its emphasis, those two words stay together, in the italic.
    const leaning = app.layoutCue({ ...cue, emphasis: [3, 5] }, geometry, faces);
    expect(leaning.words[3]!.line).toBe(leaning.words[4]!.line);
    expect(leaning.words[3]!.italic).toBe(true);
    expect(leaning.words[2]!.italic).toBe(false);
    expect(leaning.emphasis!.left).toBeCloseTo(leaning.words[3]!.x, 9);
  });

  test("a short line is one line, its block centred where the captions sit", () => {
    const cue = app.timedCue({ start: 0, end: 2, text: "Somewhere in Australia," });
    const laid = app.layoutCue(cue, geometry, faces);
    expect(laid.lines).toHaveLength(1);
    expect(laid.box.height).toBeCloseTo(geometry.pitch, 9);
    // The baseline sits in the line as the font's ascent and descent place it.
    const top = geometry.centreY - geometry.pitch / 2;
    expect(laid.lines[0]!.baseline).toBeCloseTo(
      top + (geometry.pitch - 1.2 * geometry.em) / 2 + 0.9 * geometry.em,
      9,
    );
  });
});

describe("the panel behind brand captions", () => {
  test("follows the picture: a light card over a light one, the glass over a dark one", () => {
    expect(app.panelLook("auto", 0.9).kind).toBe("light");
    expect(app.panelLook("auto", 0.2).kind).toBe("dark");
    // Unmeasured, it is the glass.
    expect(app.panelLook("auto", null).kind).toBe("dark");
    expect(app.panelLook("light", 0.1).kind).toBe("light");
    expect(app.panelLook("dark", 0.95).kind).toBe("dark");
  });

  test("the glass is nearer opaque the lighter the picture: 74% over dark, 93% over a white page", () => {
    expect(app.glassOpacity(0.1)).toBeCloseTo(0.74, 9);
    expect(app.glassOpacity(0.95)).toBeCloseTo(0.93, 9);
    expect(app.glassOpacity(0.425)).toBeCloseTo(0.835, 9);
    expect(app.panelLook("dark", 0.95).fillOpacity).toBeCloseTo(0.93, 9);
  });

  test("words are in the edit's colours where they read on it, else the panel's own ink", () => {
    const gold = { color: "#ffffff", accent: "#c89b3c" };
    const glass = app.panelLook("dark", 0.2, gold);
    expect(glass).toMatchObject({ ink: "#ffffff", emphasis: "#c89b3c", light: true });
    // White on the light card doesn't read: its ink instead; gold neither, as Reel 1 set it there.
    const card = app.panelLook("light", 0.9, gold);
    expect(card).toMatchObject({ ink: "#1f2937", emphasis: "#1f2937", light: false });
    // A solid panel in the brand's colour, its words in whichever of black or white reads.
    const solid = app.panelLook("solid", null, { ...gold, panelColor: "#0b1020" });
    expect(solid).toMatchObject({ fill: "#0b1020", fillOpacity: 1, ink: "#ffffff" });
    const none = app.panelLook("none", null, gold);
    expect(none.fill).toBeNull();
  });
});

describe("a caption line's words and emphasis", () => {
  test("keep their measured times as the line is edited", () => {
    const segment = {
      start: 10,
      end: 12,
      text: "Somewhere in Australia,",
      words: [
        { text: "Somewhere", start: 0, end: 0.4 },
        { text: "in", start: 0.4, end: 0.78 },
        { text: "Australia", start: 0.78, end: 1.14 },
      ],
    };
    // As made: the text's own spelling, the measured times.
    expect(app.segmentWords(segment)).toEqual([
      { text: "Somewhere", start: 0, end: 0.4 },
      { text: "in", start: 0.4, end: 0.78 },
      { text: "Australia,", start: 0.78, end: 1.14 },
    ]);
    // A word put in takes its share of the time between its neighbours.
    const longer = app.segmentWords({ ...segment, text: "Somewhere out in Australia," });
    expect(longer.map((word) => word.text)).toEqual(["Somewhere", "out", "in", "Australia,"]);
    expect(longer[1]).toEqual({ text: "out", start: 0.4, end: 0.4 });
    expect(longer[3]!.start).toBe(0.78);
    // Without measured words, spread at a talking pace (0.35 s a word), each by its length.
    const even = app.segmentWords({ start: 0, end: 4, text: "Two words" });
    expect(even.map((word) => word.start)).toEqual([0, 0.28]);
  });

  test("are the words the media service sets: what it would strip is stripped, an emptied word left out", () => {
    const words = app.segmentWords({
      start: 0,
      end: 3,
      text: "Pay {in} \\ full",
      words: [
        { text: "Pay", start: 0, end: 0.3 },
        { text: "in", start: 0.3, end: 0.5 },
        { text: "full", start: 0.9, end: 1.2 },
      ],
    });
    expect(words).toEqual([
      { text: "Pay", start: 0, end: 0.3 },
      { text: "in", start: 0.3, end: 0.5 },
      { text: "full", start: 0.9, end: 1.2 },
    ]);
    // So the media worker takes them as they are, emphasis and all.
    const timeline = parseTimeline({
      clips: [
        { id: "c1", assetId: "11111111-1111-4111-8111-111111111111", kind: "video", duration: 4 },
      ],
      captions: {
        enabled: true,
        style: "brand",
        segments: [{ start: 0, end: 3, text: "Pay {in} \\ full", emphasis: "full" }],
      },
    })!;
    const { params } = buildRenderRequest(timeline);
    const planned = planSequence(params, [{ role: "video" }]);
    expect(planned.captions.segments[0].words.map((word: { text: string }) => word.text)).toEqual([
      "Pay",
      "in",
      "full",
    ]);
    expect(planned.captions.segments[0].emphasis).toEqual([2, 3]);
  });

  test("an emphasis is the words of the line it names, wherever they are", () => {
    expect(
      app.emphasisRange(["a", "property", "opportunity", "has"], "Property Opportunity"),
    ).toEqual([1, 3]);
    expect(app.emphasisRange(["a", "property"], "nothing here")).toBeNull();
    expect(app.emphasisRange(["a", "property"], null)).toBeNull();
  });

  test("where none is chosen, it rests where a phrase's stress falls, or on a brand name", () => {
    const pick = (text: string, terms: string[] = []) => app.emphasisFor(text.split(" "), terms);
    // As Reel 1's script set them.
    expect(pick("The market keeps moving.")).toBe("keeps moving.");
    expect(pick("We're here,")).toBe("here,");
    expect(pick("Picture communication,")).toBe("communication,");
    expect(pick("while there's still time to act.")).toBe("time to act.");
    expect(pick("A client wants to know if it's right for them,")).toBe("right for them,");
    expect(pick("Somewhere in Australia,")).toBe("Australia,");
    expect(pick("with Aurixa Agent supporting the work behind it.", ["Aurixa Agent"])).toBe(
      "Aurixa Agent",
    );
    expect(pick("Alone")).toBeNull();
  });

  test("captions made from Reel 1's voiceover carry each word's measured time and an emphasis", () => {
    const record = JSON.parse(
      readFileSync("docs/brands/aurixa-reel-1/system-edition/voiceover-words.json", "utf8"),
    ) as { words: { text: string; start: number; end: number }[] };
    const spec = JSON.parse(readFileSync("docs/brands/aurixa-reel-1/spec.json", "utf8")) as {
      edit: { captions: { text: string }[] };
    };
    const script = spec.edit.captions.map((caption) => caption.text).join(" ");
    const { segments, source } = phraseCaptions(record.words, 0, { script, terms: ["Aurixa"] });
    expect(source).toBe("script");
    expect(segments.length).toBeGreaterThan(30);
    for (const segment of segments) {
      const words = segment.words!;
      // The card's own words, as the script spells them, timed from its start and within it.
      expect(words.map((word) => word.text).join(" ")).toBe(segment.text);
      for (const word of words) {
        expect(word.start).toBeGreaterThanOrEqual(0);
        expect(word.start).toBeLessThanOrEqual(segment.end - segment.start + 1e-9);
      }
      if (segment.emphasis)
        expect(app.emphasisRange(segment.text.split(" "), segment.emphasis)).not.toBeNull();
    }
    // "Somewhere in Australia," as measured: its first word at 0, "Australia," at 0.78 s.
    const first = segments[0]!;
    expect(first.text).toBe("Somewhere in Australia,");
    expect(first.words!.map((word) => word.start)).toEqual([0, 0.4, 0.78]);
    expect(first.emphasis).toBe("Australia,");
  });
});

describe("the Editor's preview and the media worker", () => {
  test("plan an edit's brand captions alike, from the render request the worker is sent", () => {
    const shift = REEL.cues[13]!.start - 0.4;
    const timeline = parseTimeline({
      aspectRatio: "9:16",
      clips: [
        { id: "c1", assetId: "11111111-1111-4111-8111-111111111111", kind: "video", duration: 16 },
      ],
      captions: {
        enabled: true,
        style: "brand",
        uppercase: true,
        color: "#ffffff",
        accent: "#c89b3c",
        segments: reelLines()
          .slice(13, 20)
          .map((line) => ({
            start: Number((line.start - shift).toFixed(3)),
            end: Number((line.end - shift).toFixed(3)),
            text: REEL.cues.find((cue) => cue.start === line.start)!.text,
            words: line.words!.map((word) => ({
              text: word.text,
              start: Number(word.start.toFixed(3)),
              end: Number(word.end.toFixed(3)),
            })),
            emphasis: line.emphasis
              ? line
                  .words!.slice(...line.emphasis)
                  .map((word) => word.text)
                  .join(" ")
              : null,
          })),
      },
    })!;
    const { params, sources } = buildRenderRequest(timeline);
    const planned = planSequence(
      params,
      sources.map((source) => ({ role: source.role })),
    );
    const faces = {
      regular: { family: "Fixture Serif", metrics: workerMetrics(Buffer.from(REGULAR)) },
      italic: { family: "Fixture Serif", metrics: workerMetrics(Buffer.from(ITALIC)) },
    };
    const theirs = brandCaptionPlan(planned, faces) as app.BrandCaptionPlan;
    const ours = editCaptionPlan(timeline, frameSize("9:16", "1080p"), layoutFaces);
    expect(theirs).toEqual(ours);
    // The seventh line starts after the picture's 16 s; the sixth is cut at its end.
    expect(ours.cues).toHaveLength(6);
    expect(ours.cues[5]!.end).toBe(16);
    expect(ours.cues[0]!.words[0]!.text).toBe("AURIXA");
    expect(ours.cues.some((cue) => cue.emphasis !== null)).toBe(true);
  });

  test("plan and move Reel 1's captions alike, frame for frame", () => {
    const run = (lib: typeof app) => {
      const geometry = lib.captionGeometry(FRAME, { position: "lower_third", size: 1 });
      const plan = lib.planBrandCaptions(reelLines(), {
        geometry,
        faces: layoutFaces(geometry.em),
        cuts: REEL.palette_cuts,
        // The opening and 09.1 over today's white pages, the rest over the brand's navy.
        lookOf: (lines) =>
          lib.panelLook("auto", REEL.cues[lines[0]!]!.palette === "before" ? 0.92 : 0.12, {
            color: "#ffffff",
            accent: "#c89b3c",
          }),
      });
      const frames = [];
      for (let frame = 0; frame < 30 * 120; frame += 2)
        frames.push(lib.captionFrame(plan, frame / 30));
      return { plan, frames };
    };
    const ours = run(app);
    const theirs = run(worker as typeof app);
    expect(theirs.plan).toEqual(ours.plan);
    expect(theirs.frames).toEqual(ours.frames);
    // And they show what Reel 1 showed: the white card before the brand, the glass after.
    expect(ours.plan.cues[0]!.look.kind).toBe("light");
    expect(ours.plan.cues[13]!.look.kind).toBe("dark");
    // A word coming in, the hairline drawn and the light crossing the emphasis, at some moment.
    expect(ours.frames.some((frame) => frame.words.some((word) => word.blur > 0))).toBe(true);
    expect(ours.frames.some((frame) => frame.hairlines.length > 0)).toBe(true);
    expect(ours.frames.some((frame) => frame.lights.length > 0)).toBe(true);
  });
});

describe("the ASS the media worker writes for brand captions", () => {
  const lines = reelLines().slice(13, 17);
  const shift = lines[0]!.start - 0.5;
  const segments = lines.map((line) => ({
    ...line,
    start: line.start - shift,
    end: line.end - shift,
  }));
  const plan = {
    width: 540,
    height: 960,
    fps: 30,
    total: 14,
    totalFrames: 420,
    captions: {
      style: "brand",
      position: "lower_third",
      size: 1,
      uppercase: false,
      font: "Fixture Serif",
      color: "#ffffff",
      accent: "#c89b3c",
      segments,
    },
  };
  const faces = {
    regular: { family: "Fixture Serif", metrics: workerMetrics(Buffer.from(REGULAR)) },
    italic: { family: "Fixture Serif", metrics: workerMetrics(Buffer.from(ITALIC)) },
  };
  const { events, styles, plan: drawn } = brandCaptionEvents(plan, faces);
  const seconds = (text: string) => {
    const [h, m, s] = text.split(":").map(Number) as [number, number, number];
    return h * 3600 + m * 60 + s;
  };
  const parsed = (events as string[]).map((line) => {
    const match = /^Dialogue: 0,([^,]+),([^,]+),Brand,,0,0,0,,\{([^}]*)\}(.*)$/.exec(line);
    if (!match) throw new Error(`not an event: ${line}`);
    return { start: seconds(match[1]!), end: seconds(match[2]!), tags: match[3]!, text: match[4]! };
  });
  /** The events libass shows on frame n, as FFmpeg asks for it (its time in whole milliseconds). */
  const showing = (n: number) => {
    const now = Math.floor((n / 30) * 1000);
    return parsed.filter(
      (event) => Math.round(event.start * 1000) <= now && now < Math.round(event.end * 1000),
    );
  };

  test("sets the words in the caption family, laid out from the libass top-left", () => {
    expect(styles[0]).toStartWith("Style: Brand,Fixture Serif,");
    const word = parsed.find((event) => event.text === "Aurixa")!;
    expect(word.tags).toContain("\\fnFixture Serif");
    expect(word.tags).toMatch(/\\pos\([\d.]+,[\d.]+\)/);
  });

  test("each event spans whole frames, from half a frame before its first to half after its last", () => {
    for (const event of parsed) {
      for (const edge of [event.start, event.end]) {
        if (edge === 0) continue;
        const frame = Math.round(edge * 30 + 0.5) - 0.5;
        expect(Math.abs(Math.round((frame / 30) * 100) / 100 - edge)).toBeLessThan(1e-9);
      }
    }
  });

  test("a frame shows each word where, and as far in as, the shared state says", () => {
    for (const n of [20, 31, 40, 55, 80, 120, 150, 200, 260, 330]) {
      const state = worker.captionFrame(drawn, n / 30) as app.CaptionFrameState;
      const visible = state.words.filter((word) => word.opacity > 0.002);
      const words = showing(n).filter(
        (event) => !event.text.startsWith("m ") && !event.tags.includes("\\clip"),
      );
      expect(words.length).toBe(visible.length);
      for (const word of visible) {
        const event = words.find(
          (each) =>
            each.text === word.text &&
            Math.abs(Number(/\\pos\(([\d.]+)/.exec(each.tags)![1]) - word.x) < 0.006,
        )!;
        expect(event).toBeDefined();
        const face = word.italic ? faces.italic : faces.regular;
        const em = drawn.geometry.em;
        const y =
          word.baseline - (em * face.metrics.ascent) / face.metrics.unitsPerEm + word.rise * em;
        expect(Number(/\\pos\([\d.]+,([\d.]+)\)/.exec(event.tags)![1])).toBeCloseTo(y, 2);
        const alpha = parseInt(/\\alpha&H([0-9A-F]{2})&/.exec(event.tags)![1]!, 16);
        expect(alpha).toBe(Math.round((1 - word.opacity) * 255));
        expect(event.tags.includes("\\i1")).toBe(word.italic);
        expect(event.tags.includes("\\blur")).toBe(
          (word.blur * em) / (2 / Math.sqrt(Math.log(256))) >= 0.01,
        );
      }
    }
  });

  test("a word comes in over a few frames and is then held as one event until its line leaves", () => {
    const aurixa = parsed.filter(
      (event) => event.text === "Aurixa" && !event.tags.includes("\\clip"),
    );
    expect(aurixa.length).toBeGreaterThan(8);
    const held = aurixa.reduce((longest, event) =>
      event.end - event.start > longest.end - longest.start ? event : longest,
    );
    expect(held.end - held.start).toBeGreaterThan(1);
    expect(held.tags).not.toContain("\\blur");
    expect(held.tags).toContain("\\alpha&H00&");
  });

  test("the emphasis is in the italic and the accent, with its hairline; the panel is the glass", () => {
    const emphasis = parsed.find(
      (event) => event.text === "professionals" && event.tags.includes("\\i1"),
    )!;
    expect(emphasis.tags).toContain("\\1c&H3C9BC8&");
    const drawings = parsed.filter((event) => event.text.startsWith("m 0 0 l"));
    expect(drawings.some((event) => event.tags.includes("\\1c&H2A170A&"))).toBe(true);
    // The glass, unmeasured: 88% opaque (alpha 0x1F) once in.
    expect(drawings.some((event) => event.tags.includes("\\1c&H2A170A&\\alpha&H1F&"))).toBe(true);
    // The hairline in the accent, and the light's slices clipped to their band.
    expect(drawings.some((event) => event.tags.includes("\\1c&H3C9BC8&"))).toBe(true);
    expect(
      parsed.some(
        (event) => event.tags.includes("\\clip(") && event.tags.includes("\\1c&HDEF7FF&"),
      ),
    ).toBe(true);
  });
});

describe("brand captions in a render request", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const font = (name: string, style: "regular" | "italic") => ({
    family: "Display",
    bucket: "generation-inputs",
    path: `brand-fonts/${name}.ttf`,
    style,
  });
  const timeline = (style: string) =>
    parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 6 }],
      fonts: [font("display", "regular"), font("display-italic", "italic")],
      captions: {
        enabled: true,
        style,
        font: "Display",
        segments: [
          {
            start: 0.5,
            end: 2.5,
            text: "Somewhere in Australia,",
            words: [
              { text: "Somewhere", start: 0, end: 0.4 },
              { text: "in", start: 0.4, end: 0.78 },
              { text: "Australia,", start: 0.78, end: 1.14 },
            ],
            emphasis: "Australia,",
          },
          { start: 3, end: 5, text: "a property opportunity" },
        ],
      },
    })!;

  test("carries each word's time and the emphasis's words, and the family's italic", () => {
    const { params, fonts } = buildRenderRequest(timeline("brand"));
    const captions = params["captions"] as { style: string; segments: Record<string, unknown>[] };
    expect(captions.style).toBe("brand");
    expect(captions.segments[0]).toMatchObject({
      words: [
        { text: "Somewhere", start: 0, end: 0.4 },
        { text: "in", start: 0.4, end: 0.78 },
        { text: "Australia,", start: 0.78, end: 1.14 },
      ],
      emphasis: [2, 3],
    });
    // A line without measured words has them spread evenly; no emphasis, none sent.
    expect((captions.segments[1]!["words"] as unknown[]).length).toBe(3);
    expect(captions.segments[1]!["emphasis"]).toBeUndefined();
    expect(fonts.map((each) => each.path)).toEqual([
      "brand-fonts/display.ttf",
      "brand-fonts/display-italic.ttf",
    ]);
    // The media worker takes it as sent.
    const sources = [{ role: "video" }, { role: "font" }, { role: "font" }];
    const planned = planSequence(params, sources).captions;
    expect(planned.style).toBe("brand");
    expect(planned.segments[0]).toMatchObject({ emphasis: [2, 3] });
  });

  test("a caption as long as one can be goes with every word timed", () => {
    // 220 characters: 110 words of one letter, more than a line made from a voiceover keeps.
    const text = Array.from({ length: 110 }, () => "a").join(" ");
    const long = parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 6 }],
      captions: { enabled: true, style: "brand", segments: [{ start: 0, end: 5, text }] },
    })!;
    const { params } = buildRenderRequest(long);
    const planned = planSequence(params, [{ role: "video" }]).captions;
    expect(planned.segments[0].words).toHaveLength(110);
  });

  test("other styles send the lines as they always have, in the family's own file", () => {
    const plain = timeline("clean");
    const { params } = buildRenderRequest(plain);
    const segments = (params["captions"] as { segments: Record<string, unknown>[] }).segments;
    expect(Object.keys(segments[0]!).sort()).toEqual(["end", "start", "text"]);
    expect(usedFonts(plain).map((each) => each.path)).toEqual(["brand-fonts/display.ttf"]);
  });

  test("the media worker turns away word times or an emphasis it can't place", () => {
    const sources = [{ role: "video" }];
    const params = (segment: Record<string, unknown>) => ({
      clips: [{ source_index: 0, duration: 4 }],
      captions: { style: "brand", segments: [{ start: 0, end: 2, text: "two words", ...segment }] },
    });
    expect(() => planSequence(params({ emphasis: [1, 3] }), sources)).toThrow("emphasis");
    expect(() => planSequence(params({ words: "two words" }), sources)).toThrow(
      "words must be a list",
    );
    expect(() =>
      planSequence(
        params({ words: Array.from({ length: 121 }, () => ({ text: "w", start: 0, end: 1 })) }),
        sources,
      ),
    ).toThrow("at most 120 words");
    expect(() =>
      planSequence(params({ words: [{ text: "", start: 0, end: 1 }] }), sources),
    ).toThrow("has no text");
    expect(
      planSequence(params({ emphasis: [1, 2] }), sources).captions.segments[0].emphasis,
    ).toEqual([1, 2]);
  });
});
