import { describe, expect, test } from "bun:test";
import { compositionBrandOf } from "../../src/lib/compositions/brand";
import { buildScene, compileComposition } from "../../src/lib/compositions/compile";
import { QUALITY_SETTINGS, STILL_SETTINGS, stillMoment } from "../../src/lib/compositions/settings";
import { templateById } from "../../src/lib/compositions/templates";
import type { BrandFont } from "../../src/lib/edit/brand";

const STAGE = "00000000-0000-4000-8000-000000000001";
const SCREEN = "00000000-0000-4000-8000-000000000002";
const LOGO = "00000000-0000-4000-8000-000000000003";
const sizes = (id: string) =>
  id === LOGO ? { width: 900, height: 300 } : { width: 1600, height: 1000 };

const brand = {
  ...compositionBrandOf(null),
  name: "Aurixa Systems",
  tagline: "Your business. Your decision.",
  callToAction: "Book a demo",
  logoAssetId: LOGO,
  fonts: { display: "Playfair Display", body: null },
};
const cover = templateById("cover")!;
const spec = (params: Record<string, unknown> = {}, duration = 3) => ({
  template: "cover",
  version: cover.version,
  params,
  duration,
});
const scene = (params: Record<string, unknown> = {}, [width, height] = [1920, 1080]) =>
  buildScene({
    spec: spec(params),
    brand,
    width,
    height,
    fps: 30,
    imageInfo: sizes,
    imageUrl: (id) => `https://example.test/${id}`,
    fontUrl: () => "",
  });

describe("a still", () => {
  test("is one frame of one drawing, the scene at the moment asked for", () => {
    const at = 1;
    const compiled = compileComposition({
      spec: spec({ stage: STAGE, screens: [SCREEN, SCREEN] }),
      brand,
      width: 1920,
      height: 1080,
      fps: 30,
      settings: STILL_SETTINGS,
      stillAt: at,
      imageInfo: sizes,
    });
    expect(compiled.bundle.frames).toBe(1);
    expect(compiled.bundle.drawings).toHaveLength(1);
    expect(compiled.bundle.settings).toEqual({ scale: 2, drawings: 1, shutter: 0, reuse: true });
    // Its one drawing is what the scene says at that moment, every element set from nothing.
    const expected = scene({ stage: STAGE, screens: [SCREEN, SCREEN] })
      .scene.state(at)
      .diff(new Map());
    const drawn = compiled.bundle.drawings[0];
    expect(drawn).not.toBe(0);
    expect((drawn as unknown[]).length).toBe(expected.length);
  });

  test("is drawn at the end unless asked otherwise, never past it", () => {
    expect(stillMoment(3)).toBeCloseTo(3 - 1 / 60);
    expect(stillMoment(3, 1.2)).toBe(1.2);
    expect(stillMoment(3, 99)).toBeCloseTo(3 - 1 / 60);
    expect(stillMoment(3, -1)).toBe(0);
  });

  test("is not a clip: the same composition drawn as a clip keeps its own frames and hash", () => {
    const input = {
      spec: spec(),
      brand,
      width: 1920,
      height: 1080,
      fps: 30,
      imageInfo: sizes,
    };
    const clip = compileComposition({ ...input, settings: QUALITY_SETTINGS.final });
    const still = compileComposition({ ...input, settings: STILL_SETTINGS, stillAt: 3 });
    expect(clip.bundle.frames).toBe(90);
    expect(still.bundle.frames).toBe(1);
    expect(JSON.stringify(still.bundle)).not.toBe(JSON.stringify(clip.bundle));
  });
});

describe("a brand's font files", () => {
  test("each is declared as the face it is, so a family's italic sets only its italics", () => {
    const font = (style: BrandFont["style"], path: string): BrandFont => ({
      family: "Playfair Display",
      bucket: "brand-fonts",
      path,
      style,
    });
    const document = buildScene({
      spec: spec(),
      brand: {
        ...brand,
        fontFiles: [font("regular", "p.ttf"), font("italic", "pi.ttf"), font("bold", "pb.ttf")],
      },
      width: 1920,
      height: 1080,
      fps: 30,
      imageInfo: sizes,
      imageUrl: () => "",
      fontUrl: (file) => `https://fonts.test/${file.path}`,
    }).document;
    const faces = [...document.matchAll(/@font-face \{[^}]*\}/g)].map((m) => m[0]);
    expect(faces).toHaveLength(3);
    expect(faces[0]).toContain("p.ttf");
    expect(faces[0]).toContain("font-style:normal; font-weight:400");
    expect(faces[1]).toContain("font-style:italic; font-weight:400");
    expect(faces[2]).toContain("font-style:normal; font-weight:700");
  });
});

describe("the cover", () => {
  test("sets the headline's last word in the accent italic, under a hairline", () => {
    const html = scene({ headline: "The operating system for modern property professionals." })
      .scene.html;
    expect(html).toContain(
      'The operating system for modern property <em class="cv-accent">professionals.</em>',
    );
    expect(html).toContain('id="cv-hair"');
    const plain = scene({ headline: "One line", accent: false }).scene.html;
    expect(plain).not.toContain("cv-accent");
    expect(plain).not.toContain("cv-hair");
  });

  test("with no headline of its own it says the kit's tagline, and escapes what it is given", () => {
    expect(scene().scene.html).toContain("Your business. Your");
    expect(scene({ headline: "<b>Bold</b> & brave" }).scene.html).toContain(
      "&lt;b&gt;Bold&lt;/b&gt; &amp; <em",
    );
  });

  test("the call to action is the kit's unless given, and can be left out", () => {
    expect(scene().scene.html).toContain(">Book a demo <i>›</i>");
    expect(scene({ cta: "14-day free trial" }).scene.html).toContain(">14-day free trial <i>");
    expect(scene({ button: false }).scene.html).not.toContain("cv-cta");
  });

  test("lays the words beside the screens in a landscape frame and above them in a portrait one", () => {
    const wide = scene({ screens: [SCREEN, SCREEN, SCREEN] }, [1920, 1080]);
    const tall = scene({ screens: [SCREEN, SCREEN, SCREEN] }, [1080, 1920]);
    expect(wide.scene.css).not.toContain("text-align:center");
    expect(tall.scene.css).toContain("text-align:center");
    // The first screen large, the rest in a row beneath it.
    for (const built of [wide, tall]) {
      expect(built.scene.html).toContain('id="cv-hero"');
      expect(built.scene.html).toContain('id="cv-tile-1"');
      expect(built.scene.html).not.toContain('id="cv-tile-2"');
    }
    expect(wide.imageIds).toEqual([SCREEN, LOGO]);
  });

  test("everything has arrived by the end, where a still is drawn", () => {
    const built = scene({ stage: STAGE, screens: [SCREEN, SCREEN], eyebrow: "Briefing" });
    const end = built.scene.state(stillMoment(3)).diff(new Map());
    const opacities = end.flatMap(([, , props]) =>
      props["opacity"] === undefined ? [] : [Number(props["opacity"])],
    );
    expect(opacities.length).toBeGreaterThan(5);
    expect(opacities.every((value) => value === 1)).toBe(true);
    // And at the start nothing has.
    const start = built.scene.state(0).diff(new Map());
    expect(
      start.some(([, , props]) => props["opacity"] === "0" || props["opacity"] === (0 as never)),
    ).toBe(true);
  });
});
