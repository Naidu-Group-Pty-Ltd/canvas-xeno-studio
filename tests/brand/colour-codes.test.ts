import { describe, expect, test } from "bun:test";
import { parseCssColour } from "../../src/lib/brand/colour";
import { extractColourCodes } from "../../src/lib/brand/colour-codes";

/** Text as a PDF reader pulls it from a guide's colour pages. */
const GUIDE = `AURIXA BRAND GUIDELINES 2026
Colour palette

Aurixa Blue
HEX #1E40AF
RGB 30 64 175
CMYK 100 80 0 0
PMS 286 C

Primary — Midnight  #0B1020   R11 G16 B32
Secondary: Coral Hex: ff7f50 · C0 M50 Y69 K0
Sand
R: 226 G: 199 B: 153
C 0 M 12 Y 32 K 11
Pantone 7506C

Cool Grey
Pantone Cool Gray 9 C
HSL 222 47% 11%
rgb(30, 64, 175)

Accent – Signal Lime   hsl(84, 81%, 44%)
Invalid: RGB 300 20 20 and CMYK 120 0 0 0
Page #123 of the guide
White #FFF`;

describe("colour codes in a guide", () => {
  const codes = extractColourCodes(GUIDE);
  const summary = codes.map(({ hex, label, system, raw, count }) => [
    hex,
    label,
    system,
    raw,
    count,
  ]);

  test("every notation, once per colour, in the order written, with its name", () => {
    const hsl = parseCssColour("hsl(222 47% 11%)")!.hex;
    const lime = parseCssColour("hsl(84 81% 44%)")!.hex;
    expect(summary).toEqual([
      ["#1e40af", "Aurixa Blue", "hex", "HEX #1E40AF", 3],
      ["#0033ff", "Aurixa Blue", "cmyk", "CMYK 100 80 0 0", 1],
      [null, "Aurixa Blue", "pantone", "PMS 286 C", 1],
      ["#0b1020", "Primary — Midnight", "hex", "#0B1020", 2],
      ["#ff7f50", "Secondary: Coral", "hex", "Hex: ff7f50", 1],
      ["#ff804f", "Secondary: Coral", "cmyk", "C0 M50 Y69 K0", 1],
      ["#e2c799", "Sand", "rgb", "R: 226 G: 199 B: 153", 1],
      ["#e3c89a", "Sand", "cmyk", "C 0 M 12 Y 32 K 11", 1],
      [null, "Sand", "pantone", "Pantone 7506C", 1],
      [null, "Cool Grey", "pantone", "Pantone Cool Gray 9 C", 1],
      [hsl, "Cool Grey", "hsl", "HSL 222 47% 11%", 1],
      [lime, "Accent – Signal Lime", "hsl", "hsl(84, 81%, 44%)", 1],
      ["#ffffff", "White", "hex", "#FFF", 1],
    ]);
  });

  test("each code knows where it was written", () => {
    for (const code of codes)
      expect(GUIDE.slice(code.index).startsWith(code.raw.split(" ")[0]!)).toBe(true);
  });

  test("out-of-range values and number-like codes are passed over", () => {
    expect(codes.some((code) => code.raw.includes("300"))).toBe(false);
    expect(codes.some((code) => code.raw.includes("120"))).toBe(false);
    expect(codes.some((code) => code.raw === "#123")).toBe(false);
  });
});

describe("other ways guides write them", () => {
  test("labels on the same line, between codes", () => {
    const codes = extractColourCodes(
      "Secondary: Coral #FF7F50 Tertiary: Sand #E2C799\nNavy\t\tC100  M85  Y0  K40   RGB: 0, 38, 153",
    );
    expect(codes.map((code) => [code.label, code.system, code.hex])).toEqual([
      ["Secondary: Coral", "hex", "#ff7f50"],
      ["Tertiary: Sand", "hex", "#e2c799"],
      ["Navy", "cmyk", "#001799"],
      ["Navy", "rgb", "#002699"],
    ]);
  });

  test("slashes, percentages, colons and odd spacing", () => {
    const codes = extractColourCodes(
      [
        "Ocean RGB 0/119/182",
        "Ocean CMYK: 100% / 35% / 0% / 29%",
        "Leaf r 34 g 197 b 94",
        "Sun HEX: #FACC15",
        "Plum PANTONE® 2603 C",
        "Ink PMS Black C",
        "Fashion Pantone 18-1663 TCX",
        "Sky hsl(199deg 89% 48%)",
      ].join("\n"),
    );
    expect(codes.map((code) => [code.label, code.system, code.hex])).toEqual([
      ["Ocean", "rgb", "#0077b6"],
      ["Ocean", "cmyk", "#0076b5"],
      ["Leaf", "rgb", "#22c55e"],
      ["Sun", "hex", "#facc15"],
      ["Plum", "pantone", null],
      ["Ink", "pantone", null],
      ["Fashion", "pantone", null],
      ["Sky", "hsl", parseCssColour("hsl(199 89% 48%)")!.hex],
    ]);
  });

  test("a long sentence before a code isn't a name", () => {
    const [code] = extractColourCodes(
      "Use this colour sparingly for calls to action and links on light backgrounds only #2563EB",
    );
    expect(code).toMatchObject({ hex: "#2563eb", label: null });
    const [trimmed] = extractColourCodes("Extraordinarily Deep Oceanic Midnight Blueberry #123ABC");
    expect(trimmed!.label).toBe("Extraordinarily Deep Oceanic Midnight");
  });

  test("Pantone spellings of one colour are one entry", () => {
    const codes = extractColourCodes("Blue: PMS 286 C\nBlue: Pantone 286C\nBlue: Pantone 286 U");
    expect(codes.map((code) => [code.raw, code.count])).toEqual([
      ["PMS 286 C", 2],
      ["Pantone 286 U", 1],
    ]);
  });

  test("at most 60, and never a throw", () => {
    const many = Array.from(
      { length: 500 },
      (_, index) => `Colour ${index}: #${(index * 40503).toString(16).padStart(6, "0").slice(-6)}`,
    ).join("\n");
    expect(extractColourCodes(many)).toHaveLength(60);
    for (const text of [
      "",
      "#",
      "RGB",
      "C M Y K",
      "Pantone",
      "#zzzzzz",
      "\n\n\n",
      undefined as unknown as string,
    ])
      expect(() => extractColourCodes(text)).not.toThrow();
    const huge = "R1 G2 B3 ".repeat(300_000);
    const started = Date.now();
    expect(extractColourCodes(huge)).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
