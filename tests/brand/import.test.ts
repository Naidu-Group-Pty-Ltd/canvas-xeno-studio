import { describe, expect, test } from "bun:test";
import {
  decodeText,
  imageKind,
  imageSize,
  inBatches,
  sanitizeSvg,
} from "../../src/lib/brand/fetch.server";
import { googleFamiliesOf, siteUrlOf } from "../../src/lib/brand/imports.server";
import {
  brandNameOf,
  finishPalette,
  paletteFromFound,
  proposalFromScan,
  proposalOf,
  signalsOf,
  snapToFound,
  websiteOf,
  type FoundColour,
  type StagedImage,
} from "../../src/lib/brand/proposal";
import {
  evidenceText,
  readAnswer,
  type DesignEvidence,
} from "../../src/lib/brand/synthesis.server";

const found = (hex: string, share: number, neutral = false): FoundColour => ({
  hex,
  name: hex,
  share,
  neutral,
  from: ["background-color"],
});

const staged = (key: string, kind: StagedImage["kind"], mime = "image/png"): StagedImage => ({
  key,
  kind,
  bucket: "generation-inputs",
  path: `brand-imports/i/${key}.png`,
  mime,
  width: 800,
  height: 600,
  origin: `https://example.com/${key}`,
  bytes: 1000,
});

const colours = [
  found("#0b1f3a", 0.4),
  found("#ffffff", 0.3, true),
  found("#ff6a13", 0.15),
  found("#111111", 0.1, true),
  found("#0c203b", 0.05),
];

describe("colours held to what was found", () => {
  test("a near miss becomes the found colour; a far one stays as given", () => {
    expect(snapToFound("#0b1f3b", colours)).toBe("#0b1f3a");
    expect(snapToFound("#00ff00", colours)).toBe("#00ff00");
  });

  test("an AI palette: snapped, deduplicated, named, with a primary", () => {
    const palette = finishPalette(
      [
        { hex: "#0b1f3b", name: "navy", role: "secondary" },
        { hex: "#0b1f3a", name: "navy again", role: "accent" },
        { hex: "#FF6A13", name: "", role: "accent" },
      ],
      colours,
    );
    expect(palette.map((colour) => [colour.hex, colour.role])).toEqual([
      ["#0b1f3a", "primary"],
      ["#ff6a13", "accent"],
    ]);
    expect(palette[1]!.name).toBe("#ff6a13");
  });

  test("without an AI: primary, accent, background and text from use", () => {
    const palette = paletteFromFound(colours);
    const role = (hex: string) => palette.find((colour) => colour.hex === hex)?.role;
    expect(role("#0b1f3a")).toBe("primary");
    expect(role("#ff6a13")).toBe("accent");
    expect(role("#ffffff")).toBe("background");
    expect(role("#111111")).toBe("text");
    // Too close to the primary to count as another colour.
    expect(role("#0c203b")).toBeUndefined();
  });
});

describe("what a page says its brand is called", () => {
  test("its own name first, else its title, else its address", () => {
    expect(brandNameOf({ jsonLdName: "Aurixa Systems", title: "Home" })).toBe("Aurixa Systems");
    expect(brandNameOf({ title: "Home | Aurixa Systems" })).toBe("Aurixa Systems");
    expect(brandNameOf({ title: "Aurixa — Accounting made simple" })).toBe("Aurixa");
    expect(brandNameOf({ url: "https://www.acme.io/" })).toBe("Acme");
    expect(brandNameOf({})).toBe("Brand");
    expect(websiteOf("https://www.aurixasystems.com.au/about")).toBe("aurixasystems.com.au");
    expect(websiteOf("nope")).toBeNull();
  });

  test("an address typed without https, or with http, is fetched over https", () => {
    expect(siteUrlOf("aurixasystems.com.au")).toBe("https://aurixasystems.com.au/");
    expect(siteUrlOf("http://acme.io/x")).toBe("https://acme.io/x");
    expect(siteUrlOf("ftp://acme.io")).toBeNull();
    expect(siteUrlOf("not a url")).toBeNull();
    expect(siteUrlOf("localhost")).toBeNull();
  });

  test("the families a Google Fonts address asks for", () => {
    expect(
      googleFamiliesOf(
        "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap",
      ),
    ).toEqual(["Playfair Display", "Inter"]);
    expect(
      googleFamiliesOf("https://fonts.googleapis.com/css?family=Lato:400,700|Roboto+Slab"),
    ).toEqual(["Lato", "Roboto Slab"]);
    expect(googleFamiliesOf("https://example.com/css?family=Inter")).toEqual([]);
  });
});

describe("the AI's reading", () => {
  const logo = staged("logo-1", "logo");
  const hero = staged("image-1", "image");
  const team = staged("image-2", "image");
  const evidence: DesignEvidence = {
    kind: "url",
    name: "Aurixa",
    url: "https://aurixa.example/",
    title: "Aurixa | Accounting",
    description: "Accounting for small firms",
    website: "aurixa.example",
    colours,
    fonts: [{ family: "Playfair Display", roles: ["heading"], share: 0.4 }],
    googleFonts: ["Playfair Display"],
    adobeFonts: false,
    headings: ["Your numbers, sorted"],
    ctas: ["Book a demo"],
    copy: "We help small firms.",
    pictures: [
      { image: logo, url: "https://signed/logo" },
      { image: hero, url: "https://signed/hero" },
      { image: team, url: "https://signed/team" },
    ],
    logos: [logo],
    imagery: [hero, team],
  };

  test("the evidence lists colours with their share, and pictures by number", () => {
    const text = evidenceText(evidence);
    expect(text).toContain("- #0b1f3a #0b1f3a 40%");
    expect(text).toContain("(neutral)");
    expect(text).toContain("1. logo candidate");
    expect(text).toContain("3. picture");
    expect(text).toContain("Loaded from Google Fonts: Playfair Display");
  });

  test("an answer is read into a proposal: colours snapped, pictures by number, rules kept", () => {
    const read = readAnswer(
      {
        name: "Aurixa",
        tagline: null,
        callToAction: "Book a demo",
        terms: ["Aurixa"],
        palette: [
          { hex: "#0b1f3b", name: "deep navy blue", role: "primary", usage: "headers" },
          { hex: "#ff6a13", name: "vivid orange", role: "accent", usage: "buttons" },
        ],
        typography: [
          {
            role: "heading",
            family: "'Playfair Display'",
            category: "serif",
            weight: 700,
            source: "google",
            alternative: null,
          },
          {
            role: "body",
            family: "Proxima Nova",
            category: "sans",
            weight: 400,
            source: "adobe",
            alternative: "Montserrat",
          },
          {
            role: "heading",
            family: "Duplicate",
            category: "sans",
            weight: 700,
            source: "google",
            alternative: null,
          },
        ],
        design: { promptStyle: "Sunlit documentary photography", visual: { mood: ["calm"] } },
        titleBacking: "box",
        uppercaseTitles: true,
        logo: 1,
        references: [2, 1, 3, 9],
        notes: ["Check the orange"],
      },
      evidence,
      "model-x",
    );
    expect(read.palette[0]).toMatchObject({ hex: "#0b1f3a", role: "primary" });
    expect(read.colours.accent).toBe("#ff6a13");
    expect(read.typefaces.map((face) => [face.role, face.family, face.source])).toEqual([
      ["heading", "Playfair Display", "google"],
      ["body", "Proxima Nova", "adobe"],
    ]);
    expect(read.typefaces[1]!.alternative).toBe("Montserrat");
    expect(read.logo).toBe("logo-1");
    // The logo is never a style reference; numbers past the pictures are dropped.
    expect(read.references).toEqual(["image-1", "image-2"]);
    expect(read.titleBacking).toBe("box");
    expect(read.uppercaseTitles).toBe(true);
    expect(read.model).toBe("model-x");
    expect(read.design.visual.mood).toEqual(["calm"]);
  });

  test("a picture the AI names as the logo becomes one", () => {
    const read = readAnswer(
      { name: "Aurixa", palette: [], logo: 3, references: [2, 3] },
      evidence,
      null,
    );
    expect(read.logo).toBe("image-2");
    expect(read.logos.map((image) => image.key)).toEqual(["logo-1", "image-2"]);
    expect(read.imagery.map((image) => image.key)).toEqual(["image-1"]);
    expect(read.references).toEqual(["image-1"]);
    // An unreadable palette falls back to the found colours.
    expect(read.palette[0]?.hex).toBe("#0b1f3a");
  });

  test("with no logo picked, the scan's best candidate", () => {
    expect(readAnswer({ name: "A", logo: 0 }, evidence, null).logo).toBe("logo-1");
  });
});

describe("a stored proposal", () => {
  test("round-trips, dropping references and logos it doesn't hold", () => {
    const proposal = proposalFromScan({
      name: "Aurixa",
      signals: signalsOf({ colours, ctas: ["Book a demo"], description: "Accounting" }),
      fonts: [
        {
          role: "heading",
          family: "Playfair Display",
          category: "serif",
          weight: 700,
          source: "google",
          alternative: null,
          installed: {
            family: "Playfair Display",
            bucket: "generation-inputs",
            path: "brand-fonts/google/playfair-display-700.ttf",
          },
        },
      ],
      logos: [staged("logo-1", "logo")],
      imagery: [staged("image-1", "image")],
      website: "aurixa.example",
      tagline: null,
      notes: ["Read from the scan alone."],
    });
    expect(proposal.callToAction).toBe("Book a demo");
    expect(proposal.references).toEqual(["image-1"]);
    expect(proposal.design.typography[0]?.rendered).toBe("Playfair Display");
    const read = proposalOf(JSON.parse(JSON.stringify(proposal)));
    expect(read).toEqual(proposal);
    expect(proposalOf({ ...proposal, logo: "logo-9", references: ["nope"] })).toMatchObject({
      logo: null,
      references: [],
    });
    expect(proposalOf({})).toBeNull();
  });
});

describe("reading what the site sends", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2,
    0x80, 0, 0, 1, 0xe0,
  ]);
  test("a picture's kind and size from its first bytes", () => {
    expect(imageKind(png)).toEqual({ mime: "image/png", extension: "png" });
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0, 0x10, 0]);
    expect(imageKind(gif)?.mime).toBe("image/gif");
    expect(imageSize(gif)).toEqual({ width: 32, height: 16 });
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 100, 0, 200, 3, 0, 0, 0,
    ]);
    expect(imageKind(jpeg)?.mime).toBe("image/jpeg");
    expect(imageSize(jpeg)).toEqual({ width: 200, height: 100 });
    expect(imageKind(new TextEncoder().encode("  <svg viewBox='0 0 10 10'></svg>"))?.mime).toBe(
      "image/svg+xml",
    );
    expect(imageKind(new TextEncoder().encode("<html>"))).toBeNull();
  });

  test("an SVG loses scripts, handlers and script links, and gains its namespace", () => {
    const clean = sanitizeSvg(
      `<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect onclick='x()' width="10"/></a><foreignObject><div>hi</div></foreignObject></svg>`,
    )!;
    expect(clean).not.toMatch(/script|onload|onclick|javascript|foreignObject/i);
    expect(clean).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(clean).toContain('<rect width="10"/>');
    expect(sanitizeSvg("<html><svg></svg></html>")).toBeNull();
    expect(
      sanitizeSvg('<svg><set attributeName="href" to="javascript:alert(1)"/></svg>'),
    ).toBeNull();
  });

  test("text in the charset the page declares", () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    expect(decodeText(latin1, "text/html; charset=ISO-8859-1")).toBe("café");
    expect(decodeText(new TextEncoder().encode("café"))).toBe("café");
  });

  test("batches keep their order", async () => {
    const order: number[] = [];
    const results = await inBatches([30, 10, 20, 5], 2, async (wait, index) => {
      await new Promise((resolve) => setTimeout(resolve, wait));
      order.push(index);
      return index * 10;
    });
    expect(results).toEqual([0, 10, 20, 30]);
    expect(order).not.toEqual([0, 1, 2, 3]);
  });
});
