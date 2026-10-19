import { describe, expect, test } from "bun:test";
import {
  chroma,
  colourName,
  contrastRatio,
  deltaE2000,
  deltaE2000Lab,
  hexToLab,
  hexToRgb,
  isNeutral,
  mergeColours,
  NAMED_COLOURS,
  parseCssColour,
  relativeLuminance,
  rgbToHex,
} from "../../src/lib/brand/colour";

/** Each channel within `tolerance` of the expected hex. */
function near(actual: string | undefined, expected: string, tolerance = 1) {
  const a = hexToRgb(actual ?? "");
  const e = hexToRgb(expected)!;
  expect(a).not.toBeNull();
  for (const key of ["r", "g", "b"] as const)
    expect(Math.abs(a![key] - e[key])).toBeLessThanOrEqual(tolerance);
}

const hex = (value: string) => parseCssColour(value)?.hex;

describe("reading a CSS colour", () => {
  test("hex in every length, any case", () => {
    expect(parseCssColour("#ABC")).toEqual({ hex: "#aabbcc", alpha: 1 });
    expect(parseCssColour("#aabbccdd")).toEqual({ hex: "#aabbcc", alpha: 0.867 });
    expect(parseCssColour("#1E40AF")).toEqual({ hex: "#1e40af", alpha: 1 });
    expect(parseCssColour(" #1e40af80 ")).toEqual({ hex: "#1e40af", alpha: 0.502 });
    expect(parseCssColour("#12345")).toBeNull();
    expect(parseCssColour("#ggg")).toBeNull();
  });

  test("rgb() and hsl() in the comma and the space syntax", () => {
    expect(parseCssColour("rgb(30, 64, 175)")).toEqual({ hex: "#1e40af", alpha: 1 });
    expect(parseCssColour("rgba(30,64,175,.5)")).toEqual({ hex: "#1e40af", alpha: 0.5 });
    expect(parseCssColour("rgb(30 64 175 / 25%)")).toEqual({ hex: "#1e40af", alpha: 0.25 });
    expect(hex("rgb(100% 50% 0%)")).toBe("#ff8000");
    // shadcn's slate foreground and its darkest background.
    expect(hex("hsl(222.2 47.4% 11.2%)")).toBe("#0f172a");
    expect(hex("hsl(222.2 84% 4.9%)")).toBe("#020817");
    expect(hex("hsla(120, 100%, 25%, 0.4)")).toBe("#008000");
    for (const value of ["hsl(180deg 100% 50%)", "hsl(0.5turn 100% 50%)", "hsl(200grad 100% 50%)"])
      expect(hex(value)).toBe("#00ffff");
    expect(hex("hsl(3.14159265rad 100% 50%)")).toBe("#00ffff");
    expect(hex("hwb(0 60% 60%)")).toBe("#808080");
    expect(hex("hwb(120 0% 50%)")).toBe("#008000");
  });

  test("oklch and oklab, as Tailwind v4 writes its palette", () => {
    near(hex("oklch(0.623 0.214 259.815)"), "#2b7fff");
    near(hex("oklch(62.3% 0.214 259.815)"), "#2b7fff");
    near(hex("oklch(0.985 0 0)"), "#fafafa");
    near(hex("oklch(0.205 0 0)"), "#171717");
    near(hex("oklab(0.628 0.2249 0.1258)"), "#ff0000");
    expect(parseCssColour("oklch(0.623 0.214 259.815 / 0.5)")?.alpha).toBe(0.5);
  });

  test("lab() and lch() are D50, adapted to D65 for sRGB", () => {
    // CSS Color 4's own examples (checked against d3-color, which also adapts with Bradford).
    near(hex("lab(52.2345% 40.1645 59.9971)"), "#c65d06");
    near(hex("lab(29.2345% 39.3825 20.0664)"), "#7d2329");
    near(hex("lab(67.5345% -8.6911 -41.6019)"), "#62acef");
    near(hex("lch(52.2345% 72.2 56.2)"), "#c65d06");
    expect(hex("lab(100% 0 0)")).toBe("#ffffff");
    expect(hex("lab(0% 0 0)")).toBe("#000000");
  });

  test("color() in sRGB, linear sRGB and Display P3 (clipped into sRGB)", () => {
    expect(parseCssColour("color(srgb 0.5 0.25 1 / 50%)")).toEqual({ hex: "#8040ff", alpha: 0.5 });
    expect(hex("color(srgb-linear 0.5 0.5 0.5)")).toBe("#bcbcbc");
    expect(hex("color(display-p3 1 0 0)")).toBe("#ff0000");
    near(hex("color(display-p3 0.2 0.5 0.8)"), "#0082d2");
    expect(hex("color(display-p3 1 1 1)")).toBe("#ffffff");
    expect(hex("color(rec2020 1 0 0)")).toBeUndefined();
  });

  test("every named colour, case-insensitive", () => {
    expect(NAMED_COLOURS.size).toBe(148);
    expect(hex("RebeccaPurple")).toBe("#663399");
    expect(hex("navy")).toBe("#000080");
    expect(hex("LightGoldenRodYellow")).toBe("#fafad2");
    for (const [name, value] of NAMED_COLOURS) expect(hex(name)).toBe(value);
  });

  test("keywords, variables and nonsense aren't colours", () => {
    for (const value of [
      "transparent",
      "currentColor",
      "inherit",
      "initial",
      "unset",
      "none",
      "var(--primary)",
      "hsl(var(--primary))",
      "rgb(1 2)",
      "rgb(1 2 3 4 5)",
      "hsl(10% 50% 50%)",
      "notacolour",
      "",
      "url(#x)",
    ])
      expect(parseCssColour(value)).toBeNull();
    expect(parseCssColour(undefined as unknown as string)).toBeNull();
    expect(parseCssColour("x".repeat(10_000))).toBeNull();
  });

  test("alpha is clamped and !important is ignored", () => {
    expect(parseCssColour("rgb(0 0 0 / 150%)")?.alpha).toBe(1);
    expect(parseCssColour("rgba(0,0,0,-1)")?.alpha).toBe(0);
    expect(hex("#fff !important")).toBe("#ffffff");
    expect(hex("rgb(300 -20 0)")).toBe("#ff0000");
    expect(hex("light-dark(#ffffff, #000000)")).toBe("#ffffff");
  });
});

describe("measuring colours", () => {
  test("hex and channels both ways", () => {
    expect(hexToRgb("#1e40af")).toEqual({ r: 30, g: 64, b: 175 });
    expect(hexToRgb("FFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("blue")).toBeNull();
    expect(rgbToHex({ r: 30.4, g: 64, b: 300 })).toBe("#1e40ff");
    expect(rgbToHex({ r: Number.NaN, g: -5, b: 15 })).toBe("#00000f");
  });

  test("WCAG luminance and contrast", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#1e40af", "#ffffff")).toBeCloseTo(8.72, 1);
    // Unreadable input is taken as black rather than throwing.
    expect(contrastRatio("nonsense", "#ffffff")).toBeCloseTo(21, 6);
  });

  test("Lab, chroma and neutrals", () => {
    const white = hexToLab("#ffffff");
    expect(white.l).toBeCloseTo(100, 3);
    expect(Math.abs(white.a) + Math.abs(white.b)).toBeLessThan(0.01);
    const red = hexToLab("#ff0000");
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
    expect(chroma("#808080")).toBeLessThan(0.01);
    for (const neutral of ["#000000", "#ffffff", "#808080", "#f8fafc", "#18181b"])
      expect(isNeutral(neutral)).toBe(true);
    for (const colour of ["#1e40af", "#f97316", "#0f172a"]) expect(isNeutral(colour)).toBe(false);
  });

  test("CIEDE2000 matches Sharma's reference pairs", () => {
    expect(deltaE2000("#1e40af", "#1e40af")).toBe(0);
    const pairs: [number[], number[], number][] = [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
      [[50, 2.5, 0], [73, 25, -18], 27.1492],
      [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
      [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
      [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    ];
    for (const [[l1, a1, b1], [l2, a2, b2], expected] of pairs)
      expect(deltaE2000Lab({ l: l1!, a: a1!, b: b1! }, { l: l2!, a: a2!, b: b2! })).toBeCloseTo(
        expected,
        3,
      );
    expect(deltaE2000("#1e40af", "#1e41af")).toBeLessThan(1);
    expect(deltaE2000("#000000", "#ffffff")).toBeGreaterThan(90);
  });
});

describe("naming a colour", () => {
  test("neutrals by lightness", () => {
    expect(colourName("#000000")).toBe("black");
    expect(colourName("#ffffff")).toBe("white");
    expect(colourName("#f8fafc")).toBe("off-white");
    expect(colourName("#333333")).toBe("charcoal grey");
    expect(colourName("#c0c0c0")).toBe("silver");
    expect(colourName("#808080")).toBe("grey");
    expect(colourName("#64748b")).toBe("slate grey");
  });

  test("hues with how deep, light or strong they are", () => {
    expect(colourName("#000080")).toBe("deep navy blue");
    expect(colourName("#0f172a")).toBe("deep navy blue");
    expect(colourName("#1e3a8a")).toBe("navy blue");
    expect(colourName("#1d4ed8")).toBe("royal blue");
    expect(colourName("#2563eb")).toBe("vivid blue");
    expect(colourName("#f97316")).toBe("vivid orange");
    expect(colourName("#ddd6fe")).toBe("soft lavender");
    expect(colourName("#c4b5fd")).toBe("lavender");
    expect(colourName("#22c55e")).toBe("vivid green");
    expect(colourName("#14b8a6")).toBe("teal");
    expect(colourName("#ec4899")).toBe("vivid pink");
    expect(colourName("#ffff00")).toBe("bright yellow");
  });

  test("warm low-chroma colours are browns, tans and creams", () => {
    expect(colourName("#8b4513")).toBe("brown");
    expect(colourName("#d2b48c")).toBe("tan");
    expect(colourName("#fdf6e3")).toBe("ivory");
    expect(colourName("#ffedd5")).toBe("cream");
    expect(colourName("#808000")).toBe("olive");
  });

  test("is short, deterministic and never throws", () => {
    for (let index = 0; index < 4096; index += 1) {
      const value = `#${(index * 4093).toString(16).padStart(6, "0").slice(-6)}`;
      const name = colourName(value);
      expect(name.split(" ").length).toBeLessThanOrEqual(3);
      expect(colourName(value)).toBe(name);
    }
    expect(colourName("not a colour")).toBe("black");
  });
});

describe("merging near-duplicates", () => {
  test("joins colours within the threshold under the heaviest", () => {
    const merged = mergeColours([
      { hex: "#1e40af", weight: 3 },
      { hex: "#1e41b0", weight: 5 },
      { hex: "#f97316", weight: 4 },
      { hex: "#1E40AF", weight: 1 },
      { hex: "#ffffff", weight: 2 },
      { hex: "bogus", weight: 9 },
      { hex: "#000000", weight: Number.NaN },
    ]);
    expect(merged).toEqual([
      { hex: "#1e41b0", weight: 9, members: ["#1e41b0", "#1e40af"] },
      { hex: "#f97316", weight: 4, members: ["#f97316"] },
      { hex: "#ffffff", weight: 2, members: ["#ffffff"] },
    ]);
  });

  test("a tighter threshold keeps them apart", () => {
    const list = [
      { hex: "#1e40af", weight: 2 },
      { hex: "#2546b5", weight: 1 },
    ];
    expect(mergeColours(list, 6)).toHaveLength(1);
    expect(mergeColours(list, 1)).toHaveLength(2);
    expect(mergeColours([])).toEqual([]);
    expect(mergeColours(null as unknown as [])).toEqual([]);
  });
});
