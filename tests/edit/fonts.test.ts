import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  applyBrandKit,
  brandKitOf,
  withCaptionStyle,
  type BrandFont,
} from "../../src/lib/edit/brand";
import { fontFamily, fontMetrics, fontStyle } from "../../src/lib/edit/font-family";
import {
  BASIC_FONT_FILES,
  buildRenderRequest,
  LIMITS,
  parseTimeline,
  usedFonts,
  type Timeline,
} from "../../src/lib/edit/timeline";
// @ts-expect-error The media worker is plain JavaScript.
import * as worker from "../../media-worker/src/fonts.js";
// @ts-expect-error The media worker is plain JavaScript.
import { planSequence } from "../../media-worker/src/sequence.js";
import { buildFont } from "./font-fixture";

const A = "11111111-1111-4111-8111-111111111111";
const file = (family: string, name: string, style?: BrandFont["style"]): BrandFont => ({
  family,
  bucket: "generation-inputs",
  path: `brand-fonts/${name}.ttf`,
  ...(style ? { style } : {}),
});

const regular = buildFont({
  family: "Fixture Serif",
  unitsPerEm: 1000,
  winAscent: 1050,
  winDescent: 250,
  ascender: 900,
  descender: 250,
  advances: { " ": 250, H: 700, e: 480, l: 240, o: 520 },
});
const italic = buildFont({
  family: "Fixture Serif",
  italic: true,
  advances: { " ": 240, H: 680, e: 450, l: 230, o: 500 },
});
const bold = buildFont({ family: "Fixture Serif", weight: 700, advances: { H: 760 } });

describe("a font file's style and metrics", () => {
  test("are read as the subtitle renderer reads them: its win metrics, style and advances", () => {
    const metrics = fontMetrics(regular)!;
    expect(fontFamily(regular)).toBe("Fixture Serif");
    expect(metrics).toMatchObject({ unitsPerEm: 1000, ascent: 1050, descent: 250 });
    expect(metrics.style).toBe("regular");
    expect([..."Hello"].map((char) => metrics.advance(char.codePointAt(0)!))).toEqual([
      700, 480, 240, 240, 520,
    ]);
    // A character the font hasn't got takes its missing glyph's advance.
    expect(metrics.advance("Z".codePointAt(0)!)).toBe(500);
    expect(fontStyle(italic)).toEqual({ style: "italic", italic: true, bold: false, weight: 400 });
    expect(fontStyle(bold)?.style).toBe("bold");
    expect(fontMetrics(new Uint8Array(16))).toBeNull();
  });

  test("the media worker reads them the same way", () => {
    for (const bytes of [regular, italic, bold]) {
      const ours = fontMetrics(bytes)!;
      const theirs = worker.fontMetrics(Buffer.from(bytes))!;
      expect(theirs.unitsPerEm).toBe(ours.unitsPerEm);
      expect([theirs.ascent, theirs.descent, theirs.style]).toEqual([
        ours.ascent,
        ours.descent,
        ours.style,
      ]);
      for (const char of " Hello?") {
        const code = char.codePointAt(0)!;
        expect(theirs.advance(code)).toBe(ours.advance(code));
      }
      expect(worker.fontStyle(Buffer.from(bytes))).toEqual(fontStyle(bytes));
    }
  });

  const serif = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf";
  const serifItalic = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf";
  test.skipIf(!existsSync(serif) || !existsSync(serifItalic))(
    "are read from a real font and its italic",
    () => {
      const metrics = fontMetrics(new Uint8Array(readFileSync(serif)))!;
      // Liberation Serif: 2048 units an em, win metrics 1825 and 443, "H" 1479 units wide.
      expect(metrics).toMatchObject({ unitsPerEm: 2048, ascent: 1825, descent: 443 });
      expect(metrics.advance("H".codePointAt(0)!)).toBe(1479);
      expect(fontStyle(new Uint8Array(readFileSync(serifItalic)))?.style).toBe("italic");
    },
  );
});

describe("an edit's font files", () => {
  function edit(fonts: BrandFont[], extra: Record<string, unknown> = {}): Timeline {
    return parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 4 }],
      fonts,
      overlays: [{ id: "t1", text: "Title", start: 0, end: 2, font: "Display" }],
      captions: {
        enabled: true,
        font: "Body",
        segments: [{ start: 0, end: 2, text: "Hello" }],
      },
      ...extra,
    })!;
  }

  test("a family can carry several files; its regular is the one titles are set in", () => {
    const fonts = [
      file("Display", "display-italic", "italic"),
      file("Display", "display", "regular"),
      file("Display", "display-bold", "bold"),
      file("Body", "body"),
    ];
    const timeline = edit(fonts);
    expect(timeline.fonts).toHaveLength(4);
    // Each family once, by its own file (a file from before styles counts as the regular),
    // in the order the edit keeps them.
    expect(usedFonts(timeline).map((font) => font.path)).toEqual([
      "brand-fonts/display.ttf",
      "brand-fonts/body.ttf",
    ]);
    const { params, fonts: sent } = buildRenderRequest(timeline);
    expect(sent).toHaveLength(2);
    expect(params["fonts"]).toEqual([
      { source_index: 1, family: "Display" },
      { source_index: 2, family: "Body" },
    ]);
  });

  test("a family with only an italic or a bold file is set in that", () => {
    const timeline = edit([file("Display", "display-bold", "bold"), file("Body", "body")]);
    expect(usedFonts(timeline).map((font) => font.path)).toEqual([
      "brand-fonts/display-bold.ttf",
      "brand-fonts/body.ttf",
    ]);
  });

  test("an edit holds up to twelve, and more than four need a media service that takes them", () => {
    expect(LIMITS.fonts).toBe(12);
    const families = ["One", "Two", "Three", "Four", "Five"];
    const timeline = parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 4 }],
      fonts: families.map((family) => file(family, family.toLowerCase())),
      overlays: families.map((family, index) => ({
        id: `t${index}`,
        text: family,
        start: 0,
        end: 1,
        font: family,
      })),
    })!;
    expect(buildRenderRequest(timeline).fonts).toHaveLength(5);
    expect(buildRenderRequest(timeline).fonts.length).toBeGreaterThan(BASIC_FONT_FILES);
    expect(buildRenderRequest(timeline, { maxFonts: BASIC_FONT_FILES }).fonts).toHaveLength(4);
    expect(
      parseTimeline({
        clips: [{ id: "c1", assetId: A, kind: "video", duration: 4 }],
        fonts: Array.from({ length: 13 }, (_, index) => file("Many", `many-${index}`)),
      }),
    ).toBeNull();
  });

  test("the media worker takes twelve font files, and no more", () => {
    const sources = [
      { role: "video", path: "a.mp4" },
      ...Array.from({ length: 13 }, (_, index) => ({ role: "font", path: `f${index}.ttf` })),
    ];
    const params = (count: number) => ({
      clips: [{ source_index: 0, duration: 2 }],
      fonts: Array.from({ length: count }, (_, index) => ({
        source_index: index + 1,
        family: "Brand",
      })),
    });
    expect(planSequence(params(12), sources).fonts).toHaveLength(12);
    expect(() => planSequence(params(13), sources)).toThrow("At most 12 font files");
  });
});

describe("a brand kit's fonts", () => {
  const kit = brandKitOf({
    id: "44444444-4444-4444-8444-444444444444",
    name: "Aurixa Systems",
    heading_font: "Display",
    body_font: "Body",
    fonts: [
      { ...file("Display", "display-italic"), style: "italic" },
      { ...file("Mono", "mono") },
      { ...file("Display", "display"), style: "regular" },
      { ...file("Body", "body"), style: "oblique" },
    ],
  });

  test("carry their style, read from the file when they were added", () => {
    expect(kit.fonts.map((font) => font.style ?? null)).toEqual(["italic", null, "regular", null]);
  });

  test("applied, bring the display face with its italic, each family's regular first", () => {
    const timeline = parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 4 }],
    })!;
    const branded = applyBrandKit(timeline, kit);
    expect(branded.fonts.map((font) => font.path)).toEqual([
      "brand-fonts/display.ttf",
      "brand-fonts/body.ttf",
      "brand-fonts/display-italic.ttf",
    ]);
    // Stored with the edit as they are.
    expect(parseTimeline(branded)!.fonts).toEqual(branded.fonts);
  });

  test("captions in the brand style are set in the display face, and its italic goes with them", () => {
    const timeline = parseTimeline({
      clips: [{ id: "c1", assetId: A, kind: "video", duration: 4 }],
      captions: {
        enabled: true,
        segments: [{ start: 0, end: 2, text: "Somewhere in Australia," }],
      },
    })!;
    // Applied to an edit with clean captions, they are in the body face.
    const branded = applyBrandKit(timeline, kit);
    expect(branded.captions.font).toBe("Body");
    expect(usedFonts(branded).map((font) => font.path)).toEqual(["brand-fonts/body.ttf"]);
    // Chosen in the brand style: the display face, its regular and then its italic sent.
    const word = withCaptionStyle(branded, "brand", kit);
    expect(word.captions).toMatchObject({ style: "brand", font: "Display" });
    expect(usedFonts(word).map((font) => font.path)).toEqual([
      "brand-fonts/display.ttf",
      "brand-fonts/display-italic.ttf",
    ]);
    // Back to a plain style, the body face again; without the kit, only the style changes.
    expect(withCaptionStyle(word, "clean", kit).captions.font).toBe("Body");
    expect(withCaptionStyle(timeline, "brand", null).captions).toMatchObject({
      style: "brand",
      font: null,
    });
    // A kit applied to brand-style captions sets them in its display face straight away.
    expect(applyBrandKit(word, kit).captions.font).toBe("Display");
  });
});
