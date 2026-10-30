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
  longVideoBrandLine,
  neverShowLine,
  paletteOf,
  promptInBrand,
  paletteWords,
  sourceOf,
  storedBrandSnapshot,
  withBrandStyle,
  type BrandLook,
  type PaletteColour,
} from "../../src/lib/brand/design";
import { dnaOf, EMPTY_DNA } from "../../src/lib/brand/dna";
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

  test("a model with a negative prompt is sent the avoid line there, once", () => {
    const fields = [{ key: "prompt" }, { key: "negative_prompt" }];
    const sent = promptInBrand({
      prompt: "A founder at her desk.",
      negativePrompt: "blur",
      brand: look(),
      kind: "image",
      fields,
    });
    expect(sent.avoid).toBe("negative_prompt");
    expect(sent.negativePrompt).toBe(`blur, ${brandAvoidLine(look())}`);
    expect(sent.prompt).not.toContain("Never show");
    const again = promptInBrand({ ...sent, brand: look(), kind: "image", fields });
    expect(again.negativePrompt).toBe(sent.negativePrompt);
    expect(again.prompt).toBe(sent.prompt);
  });

  test("a model with no negative prompt is told in the prompt what the brand never shows", () => {
    // GPT Image and Flare have no negative prompt: the avoid line used to be dropped for them.
    const fields = [{ key: "prompt", maxLength: 5000 }, { key: "aspect_ratio" }];
    const sent = promptInBrand({
      prompt: "A founder at her desk.",
      brand: look(),
      kind: "image",
      fields,
    });
    expect(sent.avoid).toBe("prompt");
    expect(sent.negativePrompt).toBeUndefined();
    expect(sent.prompt).toStartWith("A founder at her desk.\n\nIn Aurixa's brand look:");
    expect(sent.prompt).toEndWith(`\n\nNever show: ${brandAvoidLine(look())}.`);
    expect(
      promptInBrand({ prompt: sent.prompt, brand: look(), kind: "image", fields }).prompt,
    ).toBe(sent.prompt);
  });

  test("a never-show line the model's limit would cut off is left out, and said", () => {
    const sent = promptInBrand({
      prompt: "x".repeat(900),
      brand: look(),
      kind: "image",
      fields: [{ key: "prompt", maxLength: 1000 }],
    });
    expect(sent.avoid).toBe("no_room");
    expect(sent.prompt).not.toContain("Never show");
  });

  test("a brand with nothing to avoid sends nothing for it", () => {
    const quiet = look({ design: designOf({ promptStyle: "Calm light" }) });
    expect(
      promptInBrand({ prompt: "A desk.", brand: quiet, kind: "image", fields: [] }).avoid,
    ).toBe("none");
    expect(neverShowLine("  ")).toBe("");
  });

  test("a long video's clips and keyframes carry the look and what it never shows", () => {
    expect(longVideoBrandLine("In Aurixa's brand look: calm.", "neon colours, clutter.")).toBe(
      "In Aurixa's brand look: calm. Never show: neon colours, clutter.",
    );
    expect(longVideoBrandLine("", "")).toBe("");
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

  test("the brief carries the brand's DNA: who it is first, its content after its voice", () => {
    const dna = dnaOf({
      type: "saas",
      market: "b2b",
      archetype: "sage",
      category: "AI operating system for small firms",
      pillars: [{ name: "Month-end, sorted" }],
      proof: ["Used by 40 firms"],
      channels: ["linkedin"],
      goal: "consideration",
      formulas: ["saas-demo-ad"],
    });
    const brief = brandBrief(look({ dna }));
    const lines = brief.split("\n");
    const at = (start: string) => lines.findIndex((line) => line.startsWith(start));
    expect(at("Brand type: SaaS & software, selling to businesses (B2B)")).toBeGreaterThan(
      at("What it is"),
    );
    expect(at("Positioning: Aurixa is an AI operating system for small firms.")).toBeGreaterThan(0);
    expect(at("Archetype")).toBeLessThan(at("Personality"));
    expect(at("Content pillars")).toBeGreaterThan(at("Personality"));
    expect(brief).toContain("Proof it stands behind (use only these): Used by 40 firms");
    expect(brief).toContain("Content formulas it works with: Pain → product proof (saas-demo-ad)");
    expect(brief).toContain("Content mix over time: close to 50:50 brand-building");
    // Who it serves and what it sells are who it is: before its look.
    const served = brandBrief(
      look({
        dna: dnaOf({ ...dna, audiences: ["Buyers agents"], offers: [{ name: "Passport" }] }),
      }),
    ).split("\n");
    const line = (start: string) => served.findIndex((entry) => entry.startsWith(start));
    expect(line("Who it serves: Buyers agents")).toBeLessThan(line("Palette"));
    expect(line("What it sells: Passport")).toBeLessThan(line("Palette"));
    // A line that doesn't fit is left out; the shorter ones after it still go in.
    const long = look({ dna });
    long.design = { ...long.design, summary: "Accounting software. ".repeat(60) };
    const tight = brandBrief(long, 1200);
    expect(tight.length).toBeLessThanOrEqual(1200);
    expect(tight).not.toContain("What it is");
    expect(tight).toContain("Brand type: SaaS & software");
    // A kit without DNA reads as before.
    expect(brandBrief(look({ dna: EMPTY_DNA }))).toBe(brandBrief(look()));
  });

  test("a brief cut short keeps what it needs most, still in reading order", () => {
    const brand = look({
      dna: dnaOf({
        type: "saas",
        guardrails: ["Never say 'SOC 2 certified'"],
        proof: ["Used by 40 firms"],
        moments: ["When the month-end close slips"],
      }),
    });
    const full = brandBrief(brand).split("\n");
    const room = Math.floor(full.join("\n").length / 2);
    const has = (lines: string[], start: string) => lines.some((line) => line.startsWith(start));
    const half = brandBrief(brand, room).split("\n");
    expect(half.join("\n").length).toBeLessThanOrEqual(room);
    for (const start of [
      "Its guardrails",
      "Proof it stands behind",
      "Call to action",
      "Spell exactly",
      "Write in Aurixa's voice",
    ])
      expect(has(half, start)).toBe(true);
    // Every picture and clip carries the look anyway: it is the first to go.
    expect(has(half, "Lighting")).toBe(false);
    expect(half).toEqual(full.filter((line) => half.includes(line)));
    // For pictures and clips, the look is kept first instead.
    const pictures = brandBrief(brand, room, "look").split("\n");
    expect(has(pictures, "Lighting")).toBe(true);
    expect(has(pictures, "Never: Never show stock-photo handshakes")).toBe(true);
    expect(has(pictures, "Proof it stands behind")).toBe(false);
    // With room for all of it, both are the whole brief.
    expect(brandBrief(brand, 100_000, "look")).toBe(full.join("\n"));
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
