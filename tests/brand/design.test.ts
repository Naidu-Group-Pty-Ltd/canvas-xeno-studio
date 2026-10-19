import { describe, expect, test } from "bun:test";
import {
  brandAvoidLine,
  brandBrief,
  brandSnapshot,
  brandStyleLine,
  brandVoiceLine,
  clip,
  designOf,
  EMPTY_DESIGN,
  isEmptyDesign,
  kitColoursOf,
  paletteOf,
  paletteWords,
  sourceOf,
  storedBrandSnapshot,
  withBrandStyle,
  type BrandLook,
  type PaletteColour,
} from "../../src/lib/brand/design";
import { brandKitOf } from "../../src/lib/edit/brand";

const palette: PaletteColour[] = [
  { hex: "#f7f5f0", name: "off-white", role: "background", usage: null },
  { hex: "#0b1f3a", name: "deep navy blue", role: "primary", usage: "headers" },
  { hex: "#ff6a13", name: "vivid orange", role: "accent", usage: "buttons" },
  { hex: "#1a1a1a", name: "near black", role: "text", usage: null },
];

const look = (extra: Partial<BrandLook> = {}): BrandLook => ({
  name: "Aurixa",
  tagline: "Your business. Your decision.",
  callToAction: "Book a demo",
  website: "aurixasystems.com.au",
  palette,
  design: designOf({
    summary: "Accounting software for small firms.",
    personality: ["confident", "warm"],
    visual: {
      mood: ["calm", "premium", "optimistic"],
      photography: "Candid documentary photos of small-business owners at work",
      lighting: "Soft window light",
      colourGrading: "Warm, gentle contrast",
      motion: "Slow, steady dolly moves",
    },
    voice: {
      tone: ["plain-spoken", "reassuring"],
      description: "Short sentences, no jargon.",
      sampleLines: ["Your numbers, sorted."],
      vocabulary: ["sorted"],
      avoid: ["synergy"],
    },
    dos: ["Show real people"],
    donts: ["Never show stock-photo handshakes", "Don't use exclamation marks"],
    promptStyle: "Sunlit documentary photography in deep navy, vivid orange and off-white",
    avoid: "neon colours, clutter",
  }),
  terms: ["Aurixa", "Aurixa Systems"],
  ...extra,
});

describe("reading a design system", () => {
  test("a palette keeps well-formed colours once each, with a known role", () => {
    const read = paletteOf([
      { hex: "#ABC", name: "Pale blue", role: "primary" },
      { hex: "#aabbcc", name: "Duplicate", role: "accent" },
      { hex: "nope", name: "Bad" },
      { hex: "#112233", role: "mystery" },
      "junk",
    ]);
    expect(read).toEqual([
      { hex: "#aabbcc", name: "Pale blue", role: "primary", usage: null },
      { hex: "#112233", name: "#112233", role: "other", usage: null },
    ]);
    expect(paletteOf(null)).toEqual([]);
    expect(
      paletteOf(Array.from({ length: 40 }, (_, i) => ({ hex: `#0000${(i + 16).toString(16)}` }))),
    ).toHaveLength(24);
  });

  test("a design is cut to size and never null", () => {
    expect(designOf(null)).toEqual(EMPTY_DESIGN);
    expect(isEmptyDesign(designOf({}))).toBe(true);
    const read = designOf({
      personality: ["a", "A", "b", 3, ""],
      typography: [
        {
          role: "heading",
          family: "Playfair Display",
          weight: 700,
          category: "serif",
          source: "google",
        },
        { role: "nope", family: "x" },
        { role: "body", family: "Inter", weight: 9999, source: "weird" },
      ],
      promptStyle: "x".repeat(1000),
    });
    expect(read.personality).toEqual(["a", "b"]);
    expect(read.typography).toEqual([
      {
        role: "heading",
        family: "Playfair Display",
        category: "serif",
        weight: 700,
        source: "google",
        rendered: null,
        notes: null,
      },
      {
        role: "body",
        family: "Inter",
        category: null,
        weight: null,
        source: "unknown",
        rendered: null,
        notes: null,
      },
    ]);
    expect(read.promptStyle!.length).toBeLessThanOrEqual(421);
    expect(isEmptyDesign(read)).toBe(false);
  });

  test("text is cut at a word and marked", () => {
    expect(clip("one two three four", 9)).toBe("one two…");
    expect(clip("  spaced   out  ", 50)).toBe("spaced out");
    expect(clip("", 10)).toBeNull();
    expect(clip(5, 10)).toBeNull();
  });

  test("where it came from is read in either spelling", () => {
    expect(
      sourceOf({ kind: "url", url: "https://a.com", import_id: "i", imported_at: "t" }),
    ).toEqual({
      kind: "url",
      url: "https://a.com",
      title: null,
      importId: "i",
      importedAt: "t",
    });
    expect(sourceOf({ kind: "email" })).toBeNull();
  });

  test("a kit from before design systems reads with an empty one", () => {
    const kit = brandKitOf({ id: "k", name: "Old kit", text_color: "#ffffff" });
    expect(kit.palette).toEqual([]);
    expect(isEmptyDesign(kit.design)).toBe(true);
    expect(kit.source).toBeNull();
    expect(kit.referenceAssetIds).toEqual([]);
    const withSystem = brandKitOf({
      id: "k",
      name: "New kit",
      palette,
      design: { visual: { mood: ["calm"] } },
      reference_asset_ids: ["7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60", "not-an-id"],
    });
    expect(withSystem.palette).toHaveLength(4);
    expect(withSystem.design.visual.mood).toEqual(["calm"]);
    expect(withSystem.referenceAssetIds).toEqual(["7f1b6d2e-58c4-4a93-9d43-1b2c3d4e5f60"]);
  });
});

describe("a kit's title colours from its palette", () => {
  test("accent from the accent, background from the background unless it is near-white, text that reads on it", () => {
    const colours = kitColoursOf(palette);
    expect(colours.accent).toBe("#ff6a13");
    // Off-white is too light for an end card behind white titles: the primary is used.
    expect(colours.background).toBe("#0b1f3a");
    expect(colours.text).toBe("#ffffff");
  });

  test("a dark background keeps its own text colour when it reads", () => {
    const colours = kitColoursOf([
      { hex: "#101820", name: "ink", role: "background", usage: null },
      { hex: "#fee715", name: "yellow", role: "text", usage: null },
    ]);
    expect(colours).toEqual({ text: "#fee715", accent: "#fee715", background: "#101820" });
  });

  test("an empty palette keeps the fallback", () => {
    expect(kitColoursOf([])).toEqual({ text: "#ffffff", accent: "#2563eb", background: "#0b1020" });
  });
});

describe("what generations carry", () => {
  test("the style line leads with the design's own sentence and names the palette once", () => {
    const line = brandStyleLine(look());
    expect(line).toStartWith("In Aurixa's brand look: Sunlit documentary photography");
    // The palette is already in the sentence, so it isn't repeated.
    expect(line.match(/deep navy blue/g)).toHaveLength(1);
    expect(brandStyleLine(look(), "video")).toContain("Slow, steady dolly moves");
    expect(brandStyleLine(look(), "image")).not.toContain("dolly");
  });

  test("without a sentence, one is built from mood, imagery and palette", () => {
    const line = brandStyleLine(look({ design: { ...look().design, promptStyle: null } }));
    expect(line).toContain("calm, premium, optimistic mood");
    expect(line).toContain("Soft window light");
    expect(line).toContain(
      "colour palette of deep navy blue, vivid orange, off-white and near black",
    );
  });

  test("a brand with nothing to say about its look adds nothing", () => {
    expect(brandStyleLine(look({ palette: [], design: EMPTY_DESIGN }))).toBe("");
    expect(withBrandStyle("A cat.", look({ palette: [], design: EMPTY_DESIGN }))).toBe("A cat.");
  });

  test("a prompt carries the look once", () => {
    const once = withBrandStyle("A founder at her desk.", look());
    expect(once).toStartWith("A founder at her desk.\n\nIn Aurixa's brand look:");
    expect(withBrandStyle(once, look())).toBe(once);
  });

  test("what to avoid: the design's own list and the visual don'ts", () => {
    const avoid = brandAvoidLine(look());
    expect(avoid).toContain("neon colours, clutter");
    expect(avoid).toContain("stock-photo handshakes");
    expect(avoid).not.toContain("exclamation");
  });

  test("the voice and the brief", () => {
    expect(brandVoiceLine(look())).toBe(
      "Write in Aurixa's voice. Tone: plain-spoken, reassuring. Short sentences, no jargon. It says: sorted. It never says: synergy.",
    );
    const brief = brandBrief(look());
    expect(brief).toContain('Brand: Aurixa ("Your business. Your decision.")');
    expect(brief).toContain("deep navy blue #0b1f3a (primary)");
    expect(brief).toContain("Call to action: Book a demo");
    expect(brief).toContain("Spell exactly: Aurixa, Aurixa Systems");
    expect(brandBrief(look(), 80).length).toBeLessThanOrEqual(80);
  });

  test("a palette in words", () => {
    expect(paletteWords(palette, 3)).toBe("deep navy blue, vivid orange and off-white");
    expect(paletteWords([palette[0]!])).toBe("off-white");
    expect(paletteWords([])).toBe("");
  });

  test("a long video's snapshot is kept and read back", () => {
    const snapshot = brandSnapshot({ ...look(), id: "kit-1", referenceAssetIds: ["a", "b"] });
    expect(snapshot.kitId).toBe("kit-1");
    expect(snapshot.videoStyleLine).toContain("dolly");
    const read = storedBrandSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(read).toEqual(snapshot);
    expect(storedBrandSnapshot({ name: "x" })).toBeNull();
    expect(storedBrandSnapshot(null)).toBeNull();
  });
});
